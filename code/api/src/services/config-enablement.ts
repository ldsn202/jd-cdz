import type { ResolvedIdentity } from './identity';
import { PendingWriteError, ServiceError, newId, nowMs } from './change-batch';
import type { WorkItemRow } from './work-item-query';
import { currentIdentityContextId, matchedGrants } from './installation-submit';
import { stableStringify } from './installation-draft';
import { resolveResponsibility } from './responsibility';
import { verifyStoredConfigurationTrial } from './config-execution';
import {scheduleInputPreparation} from './source-discovery';
import {assertConfigurationWrite,commitConfiguration} from './config-transaction';

export const ENABLE_ACTIONS = ['ENABLE_INTEGRATION_CONFIG'] as const;

export type EnablementBody = {
  expectedWorkItemVersion: number;
  expectedResponsibilityVersion: number;
  candidateVersionId: string;
  trialId: string;
  expectedConfigurationRowVersion: number;
  expectedActiveVersionId: string | null;
  comment?: string | null;
};

export type EnablementResult = {
  decisionId: string;
  enablementId: string;
  activationResultId: string;
  configurationId: string;
  activeVersionId: string;
  workItemId: string;
  status: 'APPLIED';
};

type CfgRow = {
  id: string;
  service_provider_id: string;
  source_system: string;
  purpose: string;
  business_scope_key: string;
  current_version_id: string | null;
  row_version: number;
};

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

// Only sourceFormatVersion describes a format. A record revision is a different identity.
export async function findChangedFormatInputs(db:D1Database,cfg:CfgRow,activeFormatVersion:string) {
  const rows=await db.prepare(`WITH scoped_inputs AS (SELECT i.*
    FROM analysis_input_item i JOIN analysis_input_snapshot s ON s.id=i.snapshot_id
    JOIN work_item w ON w.id=s.work_item_id
    WHERE i.input_kind='RECORD' AND i.record_type='PROVIDER_RECORD'
      AND COALESCE(json_extract(i.data_json,'$.uploadedMaterial.sourceSystem'),'')<>'LOCAL_UPLOAD'
      AND s.service_provider_id=? AND w.service_provider_id=? AND i.source_system=?
      AND json_extract(i.data_json,'$.sourceRecord.serviceProviderId')=?
      AND json_extract(i.data_json,'$.sourceRecord.sourceSystem')=?
      AND json_extract(i.data_json,'$.sourceRecord.sourceRecordId')=i.source_record_id
      AND json_extract(i.data_json,'$.sourceRecord.sourceVersion')=i.source_version
      AND json_extract(i.data_json,'$.sourceRecord.purpose') IN ('CONFIGURATION',?)
      AND json_type(i.data_json,'$.sourceRecord.sourceFormatVersion')='text'
      AND length(trim(json_extract(i.data_json,'$.sourceRecord.sourceFormatVersion')))>0
      AND (EXISTS(SELECT 1 FROM integration_config c WHERE c.id=w.integration_config_id AND c.id=? AND c.business_scope_key=?)
        OR EXISTS(SELECT 1 FROM json_each(s.config_versions_json) pin JOIN integration_config c ON c.id=json_extract(pin.value,'$.configurationId')
          WHERE c.id=? AND c.business_scope_key=?)))
    SELECT DISTINCT json_extract(i.data_json,'$.sourceRecord.sourceFormatVersion') AS source_format_version,i.source_system,i.source_record_id,i.source_version FROM scoped_inputs i
    WHERE json_extract(i.data_json,'$.sourceRecord.sourceFormatVersion')<>?
      AND NOT EXISTS(SELECT 1 FROM scoped_inputs newer WHERE newer.source_system=i.source_system AND newer.source_record_id=i.source_record_id AND newer.retrieved_at>i.retrieved_at)
    ORDER BY source_format_version`).bind(cfg.service_provider_id,cfg.service_provider_id,cfg.source_system,cfg.service_provider_id,cfg.source_system,cfg.purpose,cfg.id,cfg.business_scope_key,cfg.id,cfg.business_scope_key,activeFormatVersion).all<{source_format_version:string;source_system:string;source_record_id:string;source_version:string}>();
  return rows.results;
}

// One open adjustment per actual configuration scope, with original source identities for reread.
async function buildReprocessingStatements(db:D1Database,cfg:CfgRow,activeFormatVersion:string|null,now:number,completedItemId:string,activationResultId:string):Promise<D1PreparedStatement[]>{
 if(!activeFormatVersion)return [];
 const sources=await findChangedFormatInputs(db,cfg,activeFormatVersion);if(!sources.length)return [];
 const current=await db.prepare(`SELECT id,status,row_version,analysis_generation,pending_write_id FROM work_item WHERE integration_config_id=? AND service_provider_id=? AND item_kind='CONFIGURATION' AND status<>'COMPLETED' AND id<>? ORDER BY gmt_create,id LIMIT 1`).bind(cfg.id,cfg.service_provider_id,completedItemId).first<{id:string;status:string;row_version:number;analysis_generation:number;pending_write_id:string|null}>();
 const statements:D1PreparedStatement[]=[],itemId=current?.id??newId('work');
 const identity=JSON.stringify([cfg.service_provider_id,'CONFIGURATION','CONFIG_SCOPE',cfg.source_system,cfg.business_scope_key,'CONFIGURATION_SCOPE',cfg.source_system,cfg.purpose,'ENABLE_CONFIGURATION']);
 let generation=current?.analysis_generation??1;
 if(!current){
  const assignee=await resolveResponsibility(db,cfg.service_provider_id,'ENABLE_INTEGRATION_CONFIG'),key=await sha256Hex(identity);
  statements.push(db.prepare(`INSERT INTO work_item(id,service_provider_id,item_kind,business_key,business_identity_json,creation_key,title,status,assignee_identity_id,integration_config_id,blocked_reason,gmt_create,gmt_modified) VALUES(?,?,'CONFIGURATION',?,?,?,?, 'PREPARING',?,?,?,?,?)`).bind(itemId,cfg.service_provider_id,key,identity,`cfg-adjust:${activationResultId}`,'来源格式变化，重新核实接入配置',assignee,cfg.id,assignee?null:'RESPONSIBILITY_UNRESOLVED',now,now));
 }else if(!current.pending_write_id&&!['PROCESSING','WAITING_SUPPLEMENT','WAITING_REPLY','EXCEPTION'].includes(current.status)){
  generation++;
  statements.push(db.prepare(`UPDATE work_item SET analysis_generation=analysis_generation+1,current_analysis_result_id=NULL,status='PREPARING',row_version=row_version+1,gmt_modified=? WHERE id=? AND row_version=? AND pending_write_id IS NULL`).bind(now,itemId,current.row_version),...assertConfigurationWrite(db,now));
 }
 const references=sources.map(r=>({recordType:'PROVIDER_RECORD',sourceSystem:r.source_system,sourceRecordId:r.source_record_id,sourceVersion:r.source_version}));
 statements.push(db.prepare(`INSERT INTO activity_record(id,work_item_id,event_key,event_type,fact_type,fact_id,details_json,gmt_create,gmt_modified) VALUES(?,?,?,'WORK_CREATED','WORK_ITEM',?,?,?,?)`).bind(newId('activity'),itemId,`config-reprocess:${activationResultId}`,itemId,JSON.stringify({reason:'FORMAT_VERSION_CHANGED',configurationId:cfg.id,activeFormatVersion,sourceReferences:references}),now,now));
 if(!current||(!current.pending_write_id&&!['PROCESSING','WAITING_SUPPLEMENT','WAITING_REPLY','EXCEPTION'].includes(current.status)))statements.push(scheduleInputPreparation(db,itemId,generation,cfg.service_provider_id,now));
 return statements;
}

export async function enableConfiguration(
  db: D1Database,
  identity: ResolvedIdentity,
  row: WorkItemRow,
  idempotencyKey: string,
  body: EnablementBody
): Promise<EnablementResult> {
  if (!isPlainObject(body)) throw new ServiceError(400, 40001, '请求正文必须为对象');
  const allowed = new Set([
    'expectedWorkItemVersion', 'expectedResponsibilityVersion', 'candidateVersionId', 'trialId',
    'expectedConfigurationRowVersion', 'expectedActiveVersionId', 'comment',
  ]);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) throw new ServiceError(400, 40001, `正文包含未声明字段：${key}`);
  }
  if (!Number.isInteger(body.expectedWorkItemVersion) || !Number.isInteger(body.expectedResponsibilityVersion)) {
    throw new ServiceError(400, 40001, 'expectedWorkItemVersion 与 expectedResponsibilityVersion 必填且为整数');
  }
  if (!Number.isInteger(body.expectedConfigurationRowVersion) || body.expectedConfigurationRowVersion < 1) {
    throw new ServiceError(400, 40001, 'expectedConfigurationRowVersion 必填且为正整数');
  }
  if (typeof body.candidateVersionId !== 'string' || body.candidateVersionId.trim().length === 0) {
    throw new ServiceError(400, 40001, 'candidateVersionId 必填');
  }
  if (typeof body.trialId !== 'string' || body.trialId.trim().length === 0) {
    throw new ServiceError(400, 40001, 'trialId 必填');
  }
  if (body.expectedActiveVersionId !== null && body.expectedActiveVersionId !== undefined && typeof body.expectedActiveVersionId !== 'string') {
    throw new ServiceError(400, 40001, 'expectedActiveVersionId 必须为字符串或 null');
  }
  const configurationId = row.integration_config_id;
  if (!configurationId) throw new ServiceError(422, 42201, '事项未关联接入配置');

  const requestKey = `cfg-enable:${identity.identityId}:${row.id}:${idempotencyKey}`;
  const digest = await sha256Hex(
    stableStringify({
      expectedWorkItemVersion: body.expectedWorkItemVersion,
      expectedResponsibilityVersion: body.expectedResponsibilityVersion,
      candidateVersionId: body.candidateVersionId,
      trialId: body.trialId,
      expectedConfigurationRowVersion: body.expectedConfigurationRowVersion,
      expectedActiveVersionId: body.expectedActiveVersionId ?? null,
      comment: body.comment ?? null,
    })
  );

  const prior = await db
    .prepare(`SELECT id, content_json FROM human_decision WHERE request_key = ? AND origin = 'LOCAL'`)
    .bind(requestKey)
    .first<{ id: string; content_json: string }>();
  if (prior) {
    let stored: { digest?: string } = {};
    try {
      stored = JSON.parse(prior.content_json) as { digest?: string };
    } catch {
      stored = {};
    }
    if (stored.digest !== digest) throw new ServiceError(409, 40902, '同一请求键已用于另一份确认内容');
    const ce = await db
      .prepare('SELECT id FROM configuration_enablement WHERE human_decision_id = ?')
      .bind(prior.id)
      .first<{ id: string }>();
    const car = ce
      ? await db
          .prepare('SELECT id, outcome FROM configuration_activation_result WHERE enablement_id = ?')
          .bind(ce.id)
          .first<{ id: string; outcome: string }>()
      : null;
    return {
      decisionId: prior.id,
      enablementId: ce?.id ?? '',
      activationResultId: car?.id ?? '',
      configurationId,
      activeVersionId: body.candidateVersionId,
      workItemId: row.id,
      status: 'APPLIED',
    };
  }

  const pending = await db
    .prepare(`SELECT id, status FROM external_write_operation WHERE work_item_id = ? AND status NOT IN ('SUCCEEDED','REJECTED')`)
    .bind(row.id)
    .first<{ id: string; status: string }>();
  if (pending) throw new PendingWriteError(pending.id, pending.status, '事项存在未决写入');
  if (row.status === 'COMPLETED') throw new ServiceError(409, 40901, '事项已完成，不可重复启用');
  if (row.row_version !== body.expectedWorkItemVersion) {
    throw new ServiceError(409, 40901, '事项版本已变化，请刷新后重新核实');
  }
  if (row.responsibility_version !== body.expectedResponsibilityVersion) {
    throw new ServiceError(409, 40901, '责任版本已变化，请刷新后重新核实');
  }
  if (row.current_configuration_version_id !== body.candidateVersionId) {
    throw new ServiceError(409, 40901, '当前候选版本已变化，请刷新后重新核实');
  }

  const cfg = await db
    .prepare(
      `SELECT id, service_provider_id, source_system, purpose, business_scope_key, current_version_id, row_version
       FROM integration_config WHERE id = ?`
    )
    .bind(configurationId)
    .first<CfgRow>();
  if (!cfg) throw new ServiceError(422, 42201, '接入配置不存在');
  if (cfg.row_version !== body.expectedConfigurationRowVersion) {
    throw new ServiceError(409, 40901, '配置版本已变化，请刷新后重新核实');
  }
  if ((cfg.current_version_id ?? null) !== (body.expectedActiveVersionId ?? null)) {
    throw new ServiceError(409, 40901, '生效配置已变化，请刷新后重新核实');
  }

  const candidate = await db
    .prepare(
      `SELECT id, work_item_id, analysis_result_id, open_questions_json, format_status, source_format_id, source_format_version, rules_json
       FROM integration_config_version WHERE id = ? AND integration_config_id = ?`
    )
    .bind(body.candidateVersionId, configurationId)
    .first<{
      id: string; work_item_id: string; analysis_result_id: string; open_questions_json: string;
      format_status: string; source_format_id: string | null; source_format_version: string | null; rules_json: string;
    }>();
  if (!candidate) throw new ServiceError(409, 40901, '当前候选版本不存在，请刷新后重新核实');
  if (candidate.work_item_id !== row.id) throw new ServiceError(409, 40901, '候选版本不属于本事项');
  if(candidate.analysis_result_id!==row.current_analysis_result_id)throw new ServiceError(409,40901,'候选未绑定当前分析输入，请等待重新准备和试转换');
  const openQuestions = JSON.parse(candidate.open_questions_json) as unknown[];
  if (openQuestions.length > 0) throw new ServiceError(422, 42201, '候选仍有未解决含义问题，不可启用');
  if (body.comment !== undefined && body.comment !== null && typeof body.comment !== 'string') {
    throw new ServiceError(400, 40001, 'comment 必须为字符串或 null');
  }

  const trial = await db
    .prepare('SELECT id, configuration_version_id, snapshot_id, status, checks_json FROM configuration_trial WHERE id = ?')
    .bind(body.trialId)
    .first<{ id: string; configuration_version_id: string; snapshot_id: string; status: string; checks_json: string }>();
  if (!trial) throw new ServiceError(422, 42201, '试转换记录不存在，需先通过试转换');
  if (trial.configuration_version_id !== candidate.id) {
    throw new ServiceError(422, 42201, '试转换不属于当前候选，需先通过本候选的试转换');
  }
  if (trial.status !== 'PASSED') throw new ServiceError(422, 42201, '试转换尚未通过，不可启用');

  const checks = JSON.parse(trial.checks_json) as Record<string, unknown>;
  const checkKeys = ['input_complete', 'scope_valid', 'rules_covered', 'outputs_valid', 'meanings_resolved'];
  if (checkKeys.some((k) => checks[k] !== true)) {
    throw new ServiceError(422, 42201, '试转换校验未全部通过，不可启用');
  }
  const snapshot = await db
    .prepare('SELECT id, work_item_id, service_provider_id, analysis_generation, required_input_state, config_versions_json FROM analysis_input_snapshot WHERE id = ?')
    .bind(trial.snapshot_id)
    .first<{ id: string; work_item_id: string; service_provider_id: string; analysis_generation:number; required_input_state: string; config_versions_json: string }>();
  if (!snapshot || snapshot.work_item_id !== row.id || snapshot.service_provider_id !== cfg.service_provider_id) {
    throw new ServiceError(422, 42201, '试转换输入不属于本事项');
  }
  if(snapshot.analysis_generation!==row.analysis_generation)throw new ServiceError(409,40901,'试转换输入代次已过期，需基于当前输入重新试转换');
  const basis=await db.prepare('SELECT s.analysis_generation FROM analysis_result a JOIN analysis_input_snapshot s ON s.id=a.snapshot_id WHERE a.id=?').bind(candidate.analysis_result_id).first<{analysis_generation:number}>();
  if(basis?.analysis_generation!==row.analysis_generation)throw new ServiceError(409,40901,'候选当前输入代次不一致');
  if (snapshot.required_input_state !== 'COMPLETE') {
    throw new ServiceError(422, 42201, '试转换输入不完整，不可启用');
  }
  const pinned = (JSON.parse(snapshot.config_versions_json) as unknown[]).some((x) => {
    const e = x as Record<string, unknown>;
    return e.configurationId === cfg.id && e.configurationVersionId === candidate.id && e.usage === 'TRIAL_CANDIDATE';
  });
  if (!pinned) throw new ServiceError(422, 42201, '试转换未绑定本候选，不可启用');

  if (!await verifyStoredConfigurationTrial(db,candidate.id,trial.id)) throw new ServiceError(422,42201,'试转换的固定输入、实际规则结果或摘要复核未通过');

  const contextId = await currentIdentityContextId(db, identity.identityId);
  if (!contextId) throw new ServiceError(401, 40101, '当前身份上下文无效');
  const grants = matchedGrants(identity, cfg.service_provider_id, ENABLE_ACTIONS);
  if (grants.length === 0) throw new ServiceError(403, 40301, '当前身份无启用接入配置的授权');
  const matchedJson = JSON.stringify(grants.map((g) => g.grantId));

  const decisionId = newId('hd');
  const enablementId = newId('ce');
  const activationResultId = newId('car');
  const now = nowMs();
  const contentJson = JSON.stringify({
    digest,
    candidateVersionId: candidate.id,
    trialId: trial.id,
    expectedConfigurationRowVersion: cfg.row_version,
    expectedActiveVersionId: cfg.current_version_id,
    comment: body.comment ?? null,
  });
  const basisJson = JSON.stringify({
    configurationId: cfg.id,
    activeVersionId: candidate.id,
    trialId: trial.id,
    activationResultId,
  });

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO human_decision
         (id, work_item_id, service_provider_id, origin, action_type, request_key, actor_identity_id, identity_context_id,
          matched_grants_json, expected_work_item_version, expected_responsibility_version, analysis_result_id, confirmed_at,
          content_json, source_system, source_record_type, source_record_id, source_actor_ref_json, gmt_create, gmt_modified)
         VALUES (?, ?, ?, 'LOCAL', 'ENABLE_CONFIGURATION', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`
      )
      .bind(
        decisionId, row.id, cfg.service_provider_id, requestKey, identity.identityId, contextId, matchedJson,
        body.expectedWorkItemVersion, body.expectedResponsibilityVersion, candidate.analysis_result_id, now,
        contentJson, now, now
      ),
    db
      .prepare(
        `INSERT INTO configuration_enablement
         (id, human_decision_id, configuration_version_id, trial_id, expected_config_version, expected_active_version_id, gmt_create, gmt_modified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(enablementId, decisionId, candidate.id, trial.id, cfg.row_version, cfg.current_version_id, now, now),
    db
      .prepare(
        `INSERT INTO configuration_activation_result (id, enablement_id, outcome, reason_code, detail_json, gmt_create, gmt_modified)
         VALUES (?, ?, 'APPLIED', NULL, ?, ?, ?)`
      )
      .bind(activationResultId, enablementId, JSON.stringify({ checkedAt: now, trialId: trial.id }), now, now),
    db
      .prepare(
        `UPDATE integration_config SET current_version_id = ?, current_activation_result_id = ?, row_version = row_version + 1, gmt_modified = ?
         WHERE id = ? AND row_version = ? AND current_version_id IS ?`
      )
      .bind(candidate.id, activationResultId, now, cfg.id, cfg.row_version, cfg.current_version_id),
    db
      .prepare(
        `UPDATE work_item SET status = 'COMPLETED', completion_code = 'CONFIGURATION_ENABLED', completion_basis_json = ?,
                completion_decision_id = ?, completed_at = ?, blocked_reason = NULL, row_version = row_version + 1, gmt_modified = ?
         WHERE id = ? AND row_version = ? AND responsibility_version = ? AND status <> 'COMPLETED'
           AND current_configuration_version_id = ?`
      )
      .bind(basisJson, decisionId, now, now, row.id, row.row_version, row.responsibility_version, candidate.id),
  ];

  // 启用后重新处理：同来源格式版本不同的既有输入形成配置调整事项
  const reprocess = await buildReprocessingStatements(db, cfg, candidate.source_format_version, now,row.id,activationResultId);
  statements.push(...assertConfigurationWrite(db,now));
  statements.splice(4,0,...assertConfigurationWrite(db,now));
  statements.push(...reprocess);

  const results = await commitConfiguration(db,statements);
  if (results[3].meta.changes !== 1 || results[6].meta.changes !== 1) {
    throw new ServiceError(409, 40901, '启用条件已变化，未生效');
  }
  return {
    decisionId,
    enablementId,
    activationResultId,
    configurationId: cfg.id,
    activeVersionId: candidate.id,
    workItemId: row.id,
    status: 'APPLIED',
  };
}
