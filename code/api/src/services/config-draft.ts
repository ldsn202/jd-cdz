import { TARGETS, validateConfig } from '../../../skill-runtime/transform.mjs';
import type { ResolvedIdentity } from './identity';
import { PendingWriteError, ServiceError, newId, nowMs } from './change-batch';
import type { WorkItemRow } from './work-item-query';
import { stableStringify } from './installation-draft';
import {assertConfigurationWrite,commitConfiguration} from './config-transaction';

export type ConfigurationDraftBody = {
  expectedWorkItemVersion: number;
  expectedResponsibilityVersion: number;
  expectedCandidateVersionId: string;
  rules: unknown;
  applicability: unknown;
  editNotes: unknown;
};

export type ConfigurationDraftResult = {
  configurationId: string;
  candidateVersionId: string;
  jobId: string;
  workItemId: string;
  rowVersion: number;
  status: 'ACCEPTED';
};

const FORMAT_STATUSES = ['PROVIDED', 'NOT_PROVIDED', 'UNKNOWN'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateEditNotes(raw: unknown): { field: string; reason: string }[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ServiceError(400, 40001, 'editNotes 必须为非空数组');
  }
  return raw.map((entry, i) => {
    if (!isPlainObject(entry)) throw new ServiceError(400, 40001, `editNotes[${i}] 必须为对象`);
    if (!nonEmptyString(entry.field)) throw new ServiceError(400, 40001, `editNotes[${i}].field 必填且非空`);
    if (!nonEmptyString(entry.reason)) throw new ServiceError(400, 40001, `editNotes[${i}].reason 必填且非空`);
    return { field: entry.field, reason: entry.reason };
  });
}

export function validateApplicability(raw: unknown): Record<string, unknown> {
  if (!isPlainObject(raw)) throw new ServiceError(400, 40001, 'applicability 必须为对象');
  if (!nonEmptyString(raw.serviceProviderId)) throw new ServiceError(400, 40001, 'applicability.serviceProviderId 必填');
  if (!nonEmptyString(raw.sourceSystem)) throw new ServiceError(400, 40001, 'applicability.sourceSystem 必填');
  if (!nonEmptyString(raw.businessScopeKey)) throw new ServiceError(400, 40001, 'applicability.businessScopeKey 必填');
  if (!nonEmptyString(raw.purpose) || !Object.hasOwn(TARGETS, raw.purpose)) {
    throw new ServiceError(400, 40002, 'applicability.purpose 未登记');
  }
  if (typeof raw.formatStatus !== 'string' || !FORMAT_STATUSES.includes(raw.formatStatus)) {
    throw new ServiceError(400, 40002, 'applicability.formatStatus 非法');
  }
  if (typeof raw.rowPath !== 'string') throw new ServiceError(400, 40001, 'applicability.rowPath 必须为字符串');
  for (const key of ['conditions', 'basisReferences', 'unknownConditions']) {
    if (!Array.isArray(raw[key])) throw new ServiceError(400, 40001, `applicability.${key} 必须为数组`);
  }
  if (raw.formatStatus === 'PROVIDED') {
    if (!nonEmptyString(raw.sourceFormatId) || !nonEmptyString(raw.sourceFormatVersion)) {
      throw new ServiceError(400, 40001, '格式已提供时 sourceFormatId 与 sourceFormatVersion 必填');
    }
  } else if (raw.sourceFormatId !== null || raw.sourceFormatVersion !== null) {
    throw new ServiceError(400, 40001, '格式未提供或未知时 sourceFormatId 与 sourceFormatVersion 必须为 null');
  }
  return raw;
}

export function validateRules(raw: unknown, applicability: Record<string, unknown>, ruleCatalogVersion: string): unknown[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 32) {
    throw new ServiceError(400, 40001, 'rules 必须为非空数组且不超过 32 条');
  }
  const purpose = applicability.purpose as string;
  const targets = TARGETS[purpose] ?? [];
  const ids = new Set<string>();
  const seenTargets = new Set<string>();
  for (const [i, rule] of raw.entries()) {
    if (!isPlainObject(rule)) throw new ServiceError(400, 40001, `rules[${i}] 必须为对象`);
    if (!nonEmptyString(rule.ruleId) || ids.has(rule.ruleId)) {
      throw new ServiceError(400, 40001, `rules[${i}].ruleId 为空或重复`);
    }
    ids.add(rule.ruleId);
    if (typeof rule.targetField !== 'string' || !targets.includes(rule.targetField) || seenTargets.has(rule.targetField)) {
      throw new ServiceError(400, 40002, `rules[${i}].targetField 未登记或重复`);
    }
    seenTargets.add(rule.targetField);
    if (rule.operation !== 'PIPELINE') throw new ServiceError(400, 40002, `rules[${i}].operation 只支持 PIPELINE`);
  }
  const formatStatus = applicability.formatStatus as string;
  if (formatStatus === 'PROVIDED') {
    try {
      validateConfig({
        ruleCatalogVersion,
        purpose,
        sourceFormatId: applicability.sourceFormatId,
        sourceFormatVersion: applicability.sourceFormatVersion,
        rowPath: applicability.rowPath,
        rules: raw,
      });
    } catch (e) {
      throw new ServiceError(400, 40001, `规则不符合受控规则目录：${(e as Error).message}`);
    }
  }
  return raw;
}

export async function saveConfigurationDraft(
  db: D1Database,
  identity: ResolvedIdentity,
  row: WorkItemRow,
  idempotencyKey: string,
  body: ConfigurationDraftBody
): Promise<ConfigurationDraftResult> {
  if (!isPlainObject(body)) throw new ServiceError(400, 40001, '请求正文必须为对象');
  const allowed = new Set([
    'expectedWorkItemVersion', 'expectedResponsibilityVersion', 'expectedCandidateVersionId', 'rules', 'applicability', 'editNotes',
  ]);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) throw new ServiceError(400, 40001, `正文包含未声明字段：${key}`);
  }
  if (!Number.isInteger(body.expectedWorkItemVersion) || !Number.isInteger(body.expectedResponsibilityVersion)) {
    throw new ServiceError(400, 40001, 'expectedWorkItemVersion 与 expectedResponsibilityVersion 必填且为整数');
  }
  if (!nonEmptyString(body.expectedCandidateVersionId)) throw new ServiceError(400, 40001, 'expectedCandidateVersionId 必填');
  const configurationId = row.integration_config_id;
  if (!configurationId) throw new ServiceError(422, 42201, '事项未关联接入配置');
  if (!row.current_configuration_version_id) throw new ServiceError(422, 42201, '尚未形成候选配置');

  const current = await db
    .prepare(
      `SELECT id, version_no, analysis_result_id, open_questions_json, rule_catalog_version, format_status, source_format_id, source_format_version
       FROM integration_config_version WHERE id = ?`
    )
    .bind(row.current_configuration_version_id)
    .first<{
      id: string; version_no: number; analysis_result_id: string; open_questions_json: string;
      rule_catalog_version: string; format_status: string; source_format_id: string | null; source_format_version: string | null;
    }>();
  if (!current) throw new ServiceError(422, 42201, '当前候选版本不存在');

  const applicability = validateApplicability(body.applicability);
  const rules = validateRules(body.rules, applicability, current.rule_catalog_version);
  const editNotes = validateEditNotes(body.editNotes);

  const saveKey = `cfg-draft:${identity.identityId}:${row.id}:${idempotencyKey}`;
  const existing = await db
    .prepare(
      `SELECT id, version_no, rules_json, applicability_json, edit_notes_json FROM integration_config_version
       WHERE integration_config_id = ? AND save_key = ?`
    )
    .bind(configurationId, saveKey)
    .first<{ id: string; version_no: number; rules_json: string; applicability_json: string; edit_notes_json: string }>();
  if (existing) {
    const sameRules = stableStringify(JSON.parse(existing.rules_json)) === stableStringify(rules);
    const sameApplicability = stableStringify(JSON.parse(existing.applicability_json)) === stableStringify(applicability);
    const storedNotes = (JSON.parse(existing.edit_notes_json) as { field: string; reason: string }[])
      .map((n) => ({ field: n.field, reason: n.reason }))
      .sort((a, b) => a.field.localeCompare(b.field));
    const inputNotes = [...editNotes].sort((a, b) => a.field.localeCompare(b.field));
    if (!sameRules || !sameApplicability || stableStringify(storedNotes) !== stableStringify(inputNotes)) {
      throw new ServiceError(409, 40902, '同一保存键已用于另一份草稿内容');
    }
    const job = await db
      .prepare(`SELECT id FROM background_job WHERE purpose = 'TRIAL_CONFIG' AND json_extract(target_json,'$.configurationVersionId') = ?`)
      .bind(existing.id)
      .first<{ id: string }>();
    return {
      configurationId,
      candidateVersionId: existing.id,
      jobId: job?.id ?? '',
      workItemId: row.id,
      rowVersion: row.row_version,
      status: 'ACCEPTED',
    };
  }

  const pending = await db
    .prepare(`SELECT id, status FROM external_write_operation WHERE work_item_id = ? AND status NOT IN ('SUCCEEDED','REJECTED')`)
    .bind(row.id)
    .first<{ id: string; status: string }>();
  if (pending) throw new PendingWriteError(pending.id, pending.status, '事项存在未决写入');
  if (row.status === 'COMPLETED') throw new ServiceError(409, 40901, '事项已完成，不可再保存候选版本');
  if (row.row_version !== body.expectedWorkItemVersion) {
    throw new ServiceError(409, 40901, '事项版本已变化，请刷新后重新确认');
  }
  if (row.responsibility_version !== body.expectedResponsibilityVersion) {
    throw new ServiceError(409, 40901, '责任版本已变化，请刷新后重新确认');
  }
  if (row.current_configuration_version_id !== body.expectedCandidateVersionId) {
    throw new ServiceError(409, 40901, '当前候选版本已变化，请刷新后重新确认');
  }

  const currentAnalysis=await db.prepare(`SELECT a.id,s.analysis_generation FROM analysis_result a JOIN analysis_input_snapshot s ON s.id=a.snapshot_id WHERE a.id=? AND a.work_item_id=? AND s.skill='INTEGRATION_CONFIGURATION'`).bind(row.current_analysis_result_id,row.id).first<{id:string;analysis_generation:number}>();
  if(!currentAnalysis||currentAnalysis.analysis_generation!==row.analysis_generation)throw new ServiceError(409,40901,'当前分析输入尚未准备或代次已变，不能用旧样例保存新候选');
  const versionId = newId('cfgv');
  const jobId = newId('bj');
  const now = nowMs();
  const formatStatus = applicability.formatStatus as string;
  const sourceFormatId = formatStatus === 'PROVIDED' ? (applicability.sourceFormatId as string) : null;
  const sourceFormatVersion = formatStatus === 'PROVIDED' ? (applicability.sourceFormatVersion as string) : null;
  const enrichedNotes = editNotes.map((n) => ({ ...n, operator: identity.identityId, at: now }));

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO integration_config_version
         (id, integration_config_id, work_item_id, version_no, parent_version_id, analysis_result_id, origin, editor_identity_id,
          save_key, format_status, source_format_id, source_format_version, applicability_json, rules_json,
          open_questions_json, rule_catalog_version, edit_notes_json, gmt_create, gmt_modified)
         VALUES (?, ?, ?, ?, ?, ?, 'HUMAN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        versionId, configurationId, row.id, current.version_no + 1, current.id, currentAnalysis.id,
        identity.identityId, saveKey, formatStatus, sourceFormatId, sourceFormatVersion,
        JSON.stringify(applicability), JSON.stringify(rules), current.open_questions_json,
        current.rule_catalog_version, JSON.stringify(enrichedNotes), now, now
      ),
    db
      .prepare(
        `INSERT INTO background_job
         (id, purpose, service_provider_id, work_item_id, external_write_id, target_json, dedupe_key, status, available_at,
          lease_epoch, lease_token, lease_owner, lease_until, row_version, outcome_json, gmt_create, gmt_modified)
         VALUES (?, 'TRIAL_CONFIG', ?, ?, NULL, ?, ?, 'READY', ?, 0, NULL, NULL, NULL, 1, NULL, ?, ?)`
      )
      .bind(
        jobId, row.service_provider_id, row.id,
        JSON.stringify({ configurationId, configurationVersionId: versionId, workItemId: row.id }),
        `trial:${versionId}`, now, now, now
      ),
    db
      .prepare(
        `UPDATE work_item SET current_configuration_version_id = ?, row_version = row_version + 1, gmt_modified = ?
         WHERE id = ? AND row_version = ? AND responsibility_version = ? AND status <> 'COMPLETED'
           AND pending_write_id IS NULL AND current_configuration_version_id IS ?`
      )
      .bind(versionId, now, row.id, row.row_version, row.responsibility_version, row.current_configuration_version_id),
  ];
  const updateIndex=statements.length-1;
  statements.push(...assertConfigurationWrite(db,now));
  const results = await commitConfiguration(db,statements);
  if (results[updateIndex].meta.changes !== 1) {
    throw new ServiceError(409, 40901, '候选保存条件已变化，未生效');
  }
  return {
    configurationId,
    candidateVersionId: versionId,
    jobId,
    workItemId: row.id,
    rowVersion: row.row_version + 1,
    status: 'ACCEPTED',
  };
}
