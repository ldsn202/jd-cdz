import {currentInstallationBasis,installationInputFence} from './installation-input';
import {assertConfigurationWrite} from './config-transaction';
import type { Grant, ResolvedIdentity } from './identity';
import { PendingWriteError, ServiceError, newId, nowMs } from './change-batch';
import type { WorkItemRow } from './work-item-query';
import { loadDraft, loadDraftVersion, stableStringify, type DraftItem } from './installation-draft';

export const SUBMIT_ACTIONS = ['CONFIRM_INSTALLATION_DRAFT', 'SUBMIT_INSTALLATION_DETAIL'] as const;

export type SubmitBody = {
  expectedWorkItemVersion: number;
  expectedResponsibilityVersion: number;
  draftVersionId: string;
  analysisResultId?: string | null;
  comment?: string | null;
};

export type SubmitResult = {
  decisionId: string;
  operationId: string;
  jobId: string;
  workItemId: string;
  rowVersion: number;
  status: 'ACCEPTED';
};

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function currentIdentityContextId(db: D1Database, identityId: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT id FROM current_identity WHERE identity_reference_id = ?
       ORDER BY verified_at DESC, id DESC LIMIT 1`
    )
    .bind(identityId)
    .first<{ id: string }>();
  return row?.id ?? null;
}

export function matchedGrants(identity: ResolvedIdentity, providerId: string, actions: readonly string[]): Grant[] {
  return identity.grants.filter(
    (g) => g.scopeType === 'SERVICE_PROVIDER' && g.resourceIds.includes(providerId) && g.actions.some((a) => actions.includes(a))
  );
}

export async function findPendingOperation(
  db: D1Database,
  workItemId: string,
  installationWorkOrderId: string | null
): Promise<{ operationId: string; status: string } | null> {
  const byItem = await db
    .prepare(`SELECT id, status FROM external_write_operation WHERE work_item_id = ? AND status NOT IN ('SUCCEEDED','REJECTED')`)
    .bind(workItemId)
    .first<{ id: string; status: string }>();
  if (byItem) return { operationId: byItem.id, status: byItem.status };
  if (!installationWorkOrderId) return null;
  const byOrder = await db
    .prepare(
      `SELECT id, status FROM external_write_operation
       WHERE installation_work_order_id = ? AND status NOT IN ('SUCCEEDED','REJECTED') LIMIT 1`
    )
    .bind(installationWorkOrderId)
    .first<{ id: string; status: string }>();
  return byOrder ? { operationId: byOrder.id, status: byOrder.status } : null;
}

function assertItemsComplete(items: DraftItem[]): void {
  if (items.length < 1) throw new ServiceError(422, 42201, '正式提交至少需要一项安装明细');
  if (items.length > 100) throw new ServiceError(422, 42201, '安装明细超过单次提交上限 100 项');
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const missing: string[] = [];
    if (typeof it.installationItem !== 'string' || it.installationItem.trim().length === 0) missing.push('installationItem');
    if (typeof it.installedQuantity !== 'number' || !Number.isFinite(it.installedQuantity) || it.installedQuantity < 0) {
      missing.push('installedQuantity');
    }
    if (typeof it.unit !== 'string' || it.unit.trim().length === 0) missing.push('unit');
    if (typeof it.materialSupplier !== 'string' || it.materialSupplier.trim().length === 0) missing.push('materialSupplier');
    if (typeof it.serviceScope !== 'string' || it.serviceScope.trim().length === 0) missing.push('serviceScope');
    if (missing.length > 0) {
      throw new ServiceError(422, 42201, `items[${i}] 仍缺少必填字段：${missing.join('、')}`);
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export async function submitInstallationDetail(
  db: D1Database,
  identity: ResolvedIdentity,
  row: WorkItemRow,
  idempotencyKey: string,
  body: SubmitBody
): Promise<SubmitResult> {
  if (!isPlainObject(body)) throw new ServiceError(400, 40001, '请求正文必须为对象');
  const allowedKeys = new Set(['expectedWorkItemVersion', 'expectedResponsibilityVersion', 'draftVersionId', 'analysisResultId', 'comment']);
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) throw new ServiceError(400, 40001, `正文包含未声明字段：${key}`);
  }
  if (!Number.isInteger(body.expectedWorkItemVersion) || !Number.isInteger(body.expectedResponsibilityVersion)) {
    throw new ServiceError(400, 40001, 'expectedWorkItemVersion 与 expectedResponsibilityVersion 必填且为整数');
  }
  if (typeof body.draftVersionId !== 'string' || body.draftVersionId.trim().length === 0) {
    throw new ServiceError(400, 40001, 'draftVersionId 必填');
  }
  if (body.comment !== undefined && body.comment !== null && typeof body.comment !== 'string') {
    throw new ServiceError(400, 40001, 'comment 必须为字符串或 null');
  }
  if (body.analysisResultId !== undefined && body.analysisResultId !== null && typeof body.analysisResultId !== 'string') {
    throw new ServiceError(400, 40001, 'analysisResultId 必须为字符串或 null');
  }

  const order = await db
    .prepare('SELECT id, source_system, source_id FROM installation_work_order WHERE id = ?')
    .bind(row.installation_work_order_id)
    .first<{ id: string; source_system: string; source_id: string }>();
  if (!order) throw new ServiceError(422, 42201, '事项未关联可用的安装工单');

  const requestKey = `submit:${identity.identityId}:${row.id}:${idempotencyKey}`;
  const contentDigest = await sha256Hex(
    stableStringify({
      expectedWorkItemVersion: body.expectedWorkItemVersion,
      expectedResponsibilityVersion: body.expectedResponsibilityVersion,
      analysisResultId: body.analysisResultId ?? null,
      comment: body.comment ?? null,
      draftVersionId: body.draftVersionId,
    })
  );

  const priorDecision = await db
    .prepare(
      `SELECT id, request_key, content_json FROM human_decision
       WHERE request_key = ? AND origin = 'LOCAL'`
    )
    .bind(requestKey)
    .first<{ id: string; request_key: string; content_json: string }>();
  if (priorDecision) {
    const priorOp = await db
      .prepare('SELECT id, status, content_sha256 FROM external_write_operation WHERE human_decision_id = ?')
      .bind(priorDecision.id)
      .first<{ id: string; status: string; content_sha256: string }>();
    if (!priorOp) throw new ServiceError(500, 50001, '确认记录缺少外部写入登记');
    if (priorOp.content_sha256 !== contentDigest) {
      throw new ServiceError(409, 40902, '同一请求键已用于另一份确认内容');
    }
    const priorJob = await db
      .prepare(`SELECT id FROM background_job WHERE external_write_id = ? AND purpose = 'WRITE_EXTERNAL'`)
      .bind(priorOp.id)
      .first<{ id: string }>();
    return {
      decisionId: priorDecision.id,
      operationId: priorOp.id,
      jobId: priorJob?.id ?? '',
      workItemId: row.id,
      rowVersion: row.row_version,
      status: 'ACCEPTED',
    };
  }

  const pending = await findPendingOperation(db, row.id, row.installation_work_order_id);
  if (pending) {
    // 重放同一笔已受理提交：按原确认记录保存的预期版本与草稿版本核对，命中则返回原受理结果，
    // 不再按已被该次写入改变的事项版本重判失败（契约：不换编号重提）。
    const opRow = await db
      .prepare(
        `SELECT o.id, o.human_decision_id, o.request_json,
                d.expected_work_item_version, d.expected_responsibility_version
         FROM external_write_operation o JOIN human_decision d ON d.id = o.human_decision_id
         WHERE o.id = ?`
      )
      .bind(pending.operationId)
      .first<{
        id: string; human_decision_id: string; request_json: string;
        expected_work_item_version: number | null; expected_responsibility_version: number | null;
      }>();
    if (opRow) {
      let req: { confirmedDraftVersion?: string } = {};
      try {
        req = JSON.parse(opRow.request_json) as { confirmedDraftVersion?: string };
      } catch {
        req = {};
      }
      const sameVersions =
        opRow.expected_work_item_version === body.expectedWorkItemVersion &&
        opRow.expected_responsibility_version === body.expectedResponsibilityVersion;
      if (sameVersions && req.confirmedDraftVersion === body.draftVersionId) {
        const priorJob = await db
          .prepare(`SELECT id FROM background_job WHERE external_write_id = ? AND purpose = 'WRITE_EXTERNAL'`)
          .bind(opRow.id)
          .first<{ id: string }>();
        return {
          decisionId: opRow.human_decision_id,
          operationId: opRow.id,
          jobId: priorJob?.id ?? '',
          workItemId: row.id,
          rowVersion: row.row_version,
          status: 'ACCEPTED',
        };
      }
    }
    throw new PendingWriteError(pending.operationId, pending.status, '事项或工单存在未决外部写入');
  }
  if (row.status === 'COMPLETED') throw new ServiceError(409, 40901, '事项已完成，不可再次提交');
  if (row.row_version !== body.expectedWorkItemVersion) {
    throw new ServiceError(409, 40901, '事项版本已变化，请刷新后重新确认');
  }
  if (row.responsibility_version !== body.expectedResponsibilityVersion) {
    throw new ServiceError(409, 40901, '责任版本已变化，请刷新后重新确认');
  }

  const draft = await loadDraft(db, row.id);
  if (!draft) throw new ServiceError(422, 42201, '尚未整理出可提交的草稿');
  const version = await loadDraftVersion(db, body.draftVersionId);
  if (!version || version.installation_draft_id !== draft.id) {
    throw new ServiceError(422, 42201, '确认的草稿版本不存在或不属于本事项');
  }
  if (draft.current_version_id !== version.id) {
    throw new ServiceError(409, 40901, '确认的草稿版本已不是当前版本');
  }
  if (body.analysisResultId !== undefined && body.analysisResultId !== null && body.analysisResultId !== version.analysis_result_id) {
    throw new ServiceError(409, 40901, '分析依据与当前草稿版本不一致');
  }
  if(version.analysis_result_id!==row.current_analysis_result_id)throw new ServiceError(409,40901,'草稿使用旧代分析依据，请核对当前分析后重新确认并保存');
  const basis=await currentInstallationBasis(db,row,{analysisId:version.analysis_result_id,contextId:version.context_snapshot_id});
  if(basis.contextId!==version.context_snapshot_id)throw new ServiceError(409,40901,'草稿上下文已变化，请重新确认并保存');
  if(basis.status!=='ANALYZED'||basis.required_input_state!=='COMPLETE')throw new ServiceError(422,42201,'当前分析或输入仍有缺项，不可提交');
  const openQuestions = JSON.parse(version.open_questions_json) as unknown[];
  if (openQuestions.length > 0) {
    throw new ServiceError(422, 42201, '草稿仍有未解决的缺项，不可提交');
  }

  const context = await db
    .prepare(
      `SELECT id, completeness, source_work_order_version, source_plan_version,
              detail_status, source_detail_version
       FROM installation_context_snapshot WHERE id = ?`
    )
    .bind(version.context_snapshot_id)
    .first<{
      id: string; completeness: string; source_work_order_version: string | null;
      source_plan_version: string | null; detail_status: string; source_detail_version: string | null;
    }>();
  if (!context) throw new ServiceError(422, 42201, '草稿缺少安装上下文快照');
  if (context.completeness !== 'COMPLETE') throw new ServiceError(422, 42201, '安装上下文尚有缺项，不可提交');
  if (context.detail_status === 'UNKNOWN') throw new ServiceError(422, 42201, '原系统提交状态无法核实，暂不可提交');
  if (!context.source_work_order_version || !context.source_plan_version) {
    throw new ServiceError(422, 42201, '工单或方案版本缺失，不可提交');
  }

  const items = JSON.parse(version.items_json) as DraftItem[];
  assertItemsComplete(items);
  const sourceMaterials = JSON.parse(version.source_materials_json) as unknown[];

  const submissionId = newId('sub');
  const humanDecisionId = newId('hd');
  const jobId = newId('bj');
  const requestJson = {
    submissionId,
    humanDecisionId,
    installationDraftId: draft.id,
    confirmedDraftVersion: version.id,
    expectedWorkOrderVersion: context.source_work_order_version,
    expectedPlanVersion: context.source_plan_version,
    expectedDetailVersion: context.detail_status === 'NOT_SUBMITTED' ? null : context.source_detail_version,
    items,
    sourceMaterials,
  };
  const requestText = JSON.stringify(requestJson);
  const verifiedAt = nowMs();

  const contextId = await currentIdentityContextId(db, identity.identityId);
  if (!contextId) throw new ServiceError(401, 40101, '当前身份上下文无效');
  const grants = matchedGrants(identity, row.service_provider_id, SUBMIT_ACTIONS);
  if (grants.length === 0) throw new ServiceError(403, 40301, '当前身份无提交所需授权');
  // matched_grants_json 为本次授权项的 grant_id 列表（guard_local_decision_identity 逐项核对）。
  const matchedJson = JSON.stringify(grants.map((g) => g.grantId));

  const statements: D1PreparedStatement[] = [
    ...installationInputFence(db,row,verifiedAt),
    db
      .prepare(
        `INSERT INTO human_decision
         (id, work_item_id, service_provider_id, origin, action_type, request_key, actor_identity_id, identity_context_id,
          matched_grants_json, expected_work_item_version, expected_responsibility_version, analysis_result_id, confirmed_at,
          content_json, source_system, source_record_type, source_record_id, source_actor_ref_json, gmt_create, gmt_modified)
         VALUES (?, ?, ?, 'LOCAL', 'SUBMIT_INSTALLATION', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`
      )
      .bind(
        humanDecisionId, row.id, row.service_provider_id, requestKey, identity.identityId, contextId, matchedJson,
        body.expectedWorkItemVersion, body.expectedResponsibilityVersion, version.analysis_result_id, verifiedAt,
        requestText, verifiedAt, verifiedAt
      ),
    db
      .prepare(
        `INSERT INTO external_write_operation
         (id, human_decision_id, work_item_id, service_provider_id, installation_work_order_id, source_system,
          interface_kind, action, request_json, content_sha256, status, receipt_json, verified_at, row_version, gmt_create, gmt_modified)
         VALUES (?, ?, ?, ?, ?, ?, 'INSTALLATION_SUBMIT', 'SUBMIT_INSTALLATION', ?, ?, 'REGISTERED', NULL, NULL, 1, ?, ?)`
      )
      .bind(
        submissionId, humanDecisionId, row.id, row.service_provider_id, row.installation_work_order_id,
        order.source_system, requestText, contentDigest, verifiedAt, verifiedAt
      ),
    db
      .prepare(
        `INSERT INTO installation_detail_submission
         (id, human_decision_id, draft_version_id, work_item_id, installation_work_order_id, service_provider_id,
          target_source_system, request_json, gmt_create, gmt_modified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        submissionId, humanDecisionId, version.id, row.id, row.installation_work_order_id,
        row.service_provider_id, order.source_system, requestText, verifiedAt, verifiedAt
      ),
    db
      .prepare(
        `INSERT INTO background_job
         (id, purpose, service_provider_id, work_item_id, external_write_id, target_json, dedupe_key, status, available_at,
          lease_epoch, lease_token, lease_owner, lease_until, row_version, outcome_json, gmt_create, gmt_modified)
         VALUES (?, 'WRITE_EXTERNAL', ?, ?, ?, ?, ?, 'READY', ?, 0, NULL, NULL, NULL, 1, NULL, ?, ?)`
      )
      .bind(
        jobId, row.service_provider_id, row.id, submissionId,
        JSON.stringify({
          submissionId,
          installationWorkOrderId: order.source_id,
          workItemId: row.id,
          requestKey,
          request: requestJson,
        }),
        `write:${submissionId}`, verifiedAt, verifiedAt, verifiedAt
      ),
    db
      .prepare(
        `INSERT INTO activity_record
         (id, work_item_id, event_key, event_type, actor_identity_id, fact_type, fact_id, occurred_at, details_json, gmt_create, gmt_modified)
         VALUES (?, ?, ?, 'DECISION_CONFIRMED', ?, 'HUMAN_DECISION', ?, ?, ?, ?, ?)`
      )
      .bind(
        newId('act'), row.id, `decision:${humanDecisionId}`, identity.identityId, humanDecisionId, verifiedAt,
        JSON.stringify({ action: 'SUBMIT_INSTALLATION', submissionId, operationId: submissionId }), verifiedAt, verifiedAt
      ),
    db
      .prepare(
        `UPDATE work_item SET pending_write_id = ?, status = 'PROCESSING', row_version = row_version + 1, gmt_modified = ?
         WHERE id = ? AND row_version = ? AND responsibility_version = ? AND pending_write_id IS NULL AND status <> 'COMPLETED'`
      )
      .bind(submissionId, verifiedAt, row.id, row.row_version, row.responsibility_version),
  ];

  statements.push(...assertConfigurationWrite(db,verifiedAt));
  try{await db.batch(statements);}catch(error){if(/transaction_assertion|passed/.test((error as Error).message))throw new ServiceError(409,40901,'确认条件已变化，提交已全部回滚');throw error;}

  return {
    decisionId: humanDecisionId,
    operationId: submissionId,
    jobId,
    workItemId: row.id,
    rowVersion: row.row_version + 1,
    status: 'ACCEPTED',
  };
}
