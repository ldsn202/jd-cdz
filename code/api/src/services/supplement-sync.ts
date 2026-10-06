import type { ResolvedIdentity } from './identity';
import { PendingWriteError, ServiceError, newId, nowMs } from './change-batch';
import type { WorkItemRow } from './work-item-query';
import { currentIdentityContextId, findPendingOperation, matchedGrants } from './installation-submit';
import { stableStringify } from './installation-draft';
import type {WorkOrderContextData} from './external';
import {loadMaterialVersion,materialVisible} from './material-read';

export const SUPPLEMENT_ACTIONS = ['SUBMIT_SUPPLEMENT'] as const;

export type SupplementBody = {
  expectedWorkItemVersion: number;
  expectedResponsibilityVersion: number;
  requestDecisionId: string;
  replyText: string;
  materialVersionIds?: unknown;
  comment?: string | null;
};

export type SupplementResult = {
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function loadMaterialRefs(
  db: D1Database,
  materialVersionIds: string[]
): Promise<{ sourceSystem: string; sourceMaterialId: string; sourceVersion: string }[]> {
  const refs: { sourceSystem: string; sourceMaterialId: string; sourceVersion: string }[] = [];
  for (const id of materialVersionIds) {
    const row = await db
      .prepare(
        `SELECT m.source_system, m.source_material_id, v.source_version
         FROM source_material_version v JOIN source_material m ON m.id = v.source_material_id
         WHERE v.id = ?`
      )
      .bind(id)
      .first<{ source_system: string; source_material_id: string; source_version: string }>();
    if (!row) throw new ServiceError(422, 42201, `附件材料版本不存在或不可用：${id}`);
    refs.push({ sourceSystem: row.source_system, sourceMaterialId: row.source_material_id, sourceVersion: row.source_version });
  }
  return refs;
}

export async function submitSupplement(
  db: D1Database,
  identity: ResolvedIdentity,
  row: WorkItemRow,
  idempotencyKey: string,
  body: SupplementBody,
  readContext: (workOrderId:string)=>Promise<WorkOrderContextData>
): Promise<SupplementResult> {
  if (!isPlainObject(body)) throw new ServiceError(400, 40001, '请求正文必须为对象');
  const allowedKeys = new Set([
    'expectedWorkItemVersion', 'expectedResponsibilityVersion', 'requestDecisionId', 'replyText', 'materialVersionIds', 'comment',
  ]);
  for (const key of Object.keys(body)) {
    if (!allowedKeys.has(key)) throw new ServiceError(400, 40001, `正文包含未声明字段：${key}`);
  }
  if (!Number.isInteger(body.expectedWorkItemVersion) || !Number.isInteger(body.expectedResponsibilityVersion)) {
    throw new ServiceError(400, 40001, 'expectedWorkItemVersion 与 expectedResponsibilityVersion 必填且为整数');
  }
  if (typeof body.requestDecisionId !== 'string' || body.requestDecisionId.trim().length === 0) {
    throw new ServiceError(400, 40001, 'requestDecisionId 必填');
  }
  if (typeof body.replyText !== 'string' || body.replyText.trim().length === 0) {
    throw new ServiceError(400, 40001, 'replyText 必填且非空');
  }
  if (body.replyText.length > 4000) throw new ServiceError(400, 40001, 'replyText 超过 4000 字符上限');
  if (body.materialVersionIds !== undefined && body.materialVersionIds !== null && !Array.isArray(body.materialVersionIds)) {
    throw new ServiceError(400, 40001, 'materialVersionIds 必须为数组');
  }
  const materialVersionIds = ((body.materialVersionIds ?? []) as unknown[]).map((v) => {
    if (typeof v !== 'string' || v.trim().length === 0) throw new ServiceError(400, 40001, 'materialVersionIds 元素必须为非空字符串');
    return v;
  });
  if (materialVersionIds.length > 100) throw new ServiceError(400, 40001, '附件引用超过 100 项上限');

  const order = await db
    .prepare('SELECT id, source_system, source_id FROM installation_work_order WHERE id = ?')
    .bind(row.installation_work_order_id)
    .first<{ id: string; source_system: string; source_id: string }>();
  if (!order) throw new ServiceError(422, 42201, '事项未关联可用的安装工单');

  const requestKey = `supplement:${identity.identityId}:${row.id}:${idempotencyKey}`;
  const contentDigest = await sha256Hex(
    stableStringify({
      expectedWorkItemVersion: body.expectedWorkItemVersion,
      expectedResponsibilityVersion: body.expectedResponsibilityVersion,
      requestDecisionId: body.requestDecisionId,
      replyText: body.replyText,
      materialVersionIds,
      comment: body.comment ?? null,
    })
  );

  const priorDecision = await db
    .prepare(`SELECT id FROM human_decision WHERE request_key = ? AND origin = 'LOCAL'`)
    .bind(requestKey)
    .first<{ id: string }>();
  if (priorDecision) {
    const priorOp = await db
      .prepare('SELECT id, content_sha256 FROM external_write_operation WHERE human_decision_id = ?')
      .bind(priorDecision.id)
      .first<{ id: string; content_sha256: string }>();
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
    const opRow = await db
      .prepare(
        `SELECT o.id, o.human_decision_id, d.expected_work_item_version, d.expected_responsibility_version, d.action_type
         FROM external_write_operation o JOIN human_decision d ON d.id = o.human_decision_id WHERE o.id = ?`
      )
      .bind(pending.operationId)
      .first<{
        id: string; human_decision_id: string; expected_work_item_version: number | null;
        expected_responsibility_version: number | null; action_type: string;
      }>();
    if (
      opRow &&
      opRow.action_type === 'SUBMIT_SUPPLEMENT' &&
      opRow.expected_work_item_version === body.expectedWorkItemVersion &&
      opRow.expected_responsibility_version === body.expectedResponsibilityVersion
    ) {
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
    throw new PendingWriteError(pending.operationId, pending.status, '事项或工单存在未决外部写入');
  }

  if (row.status !== 'WAITING_SUPPLEMENT' || row.active_supplement_request_id !== body.requestDecisionId) {
    throw new ServiceError(409, 40903, '该补充要求已不在待回复状态，请刷新原事项');
  }
  if (row.row_version !== body.expectedWorkItemVersion) {
    throw new ServiceError(409, 40901, '事项版本已变化，请刷新后重新提交');
  }
  if (row.responsibility_version !== body.expectedResponsibilityVersion) {
    throw new ServiceError(409, 40901, '责任版本已变化，请刷新后重新提交');
  }

  const requestOp = await db
    .prepare(
      `SELECT id FROM external_write_operation
       WHERE human_decision_id = ? AND action = 'REQUEST_SUPPLEMENT' AND status = 'SUCCEEDED'`
    )
    .bind(body.requestDecisionId)
    .first<{ id: string }>();
  if (!requestOp) throw new ServiceError(422, 42201, '原退回动作尚未可靠生效，不可提交回复');

  for(const id of materialVersionIds){
    const material=await loadMaterialVersion(db,id);
    if(!material||material.read_state!=='VERIFIED'||!await materialVisible(db,identity,material))throw new ServiceError(403,40301,'附件不存在或不在当前服务商可见范围');
  }
  const sourceMaterials = await loadMaterialRefs(db, materialVersionIds);
  const context=await readContext(order.source_id);
  if(context.installationWorkOrder.installationWorkOrderId!==order.source_id||context.installationWorkOrder.serviceProviderId!==row.service_provider_id
    ||!context.installationDetail?.installationDetailId||!context.installationDetail.sourceVersion||!context.installationWorkOrder.sourceVersion)
    throw new ServiceError(422,42201,'未取得本工单的正式安装明细和当前版本，请刷新后再回复');

  const operationId = newId('rv');
  const humanDecisionId = newId('hd');
  const jobId = newId('bj');
  const requestJson = {
    operationId,
    workItemId: row.id,
    expectedWorkItemVersion: String(body.expectedWorkItemVersion),
    humanDecisionId,
    action: 'SUBMIT_SUPPLEMENT',
    installationDetailId: context.installationDetail.installationDetailId,
    expectedDetailVersion: context.installationDetail.sourceVersion,
    expectedWorkOrderVersion: context.installationWorkOrder.sourceVersion,
    expectedAnalysisVersion: null,
    replyToOperationId: requestOp.id,
    comment: body.replyText,
    sourceMaterials,
  };
  const requestText = JSON.stringify(requestJson);
  const verifiedAt = nowMs();

  const contextId = await currentIdentityContextId(db, identity.identityId);
  if (!contextId) throw new ServiceError(401, 40101, '当前身份上下文无效');
  const grants = matchedGrants(identity, row.service_provider_id, SUPPLEMENT_ACTIONS);
  if (grants.length === 0) throw new ServiceError(403, 40301, '当前身份无补充回复授权');
  const matchedJson = JSON.stringify(grants.map((g) => g.grantId));
  const decisionContent = JSON.stringify({
    requestDecisionId: body.requestDecisionId,
    replyText: body.replyText,
    materialVersionIds,
  });

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO human_decision
         (id, work_item_id, service_provider_id, origin, action_type, request_key, actor_identity_id, identity_context_id,
          matched_grants_json, expected_work_item_version, expected_responsibility_version, analysis_result_id, confirmed_at,
          content_json, source_system, source_record_type, source_record_id, source_actor_ref_json, gmt_create, gmt_modified)
         VALUES (?, ?, ?, 'LOCAL', 'SUBMIT_SUPPLEMENT', ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`
      )
      .bind(
        humanDecisionId, row.id, row.service_provider_id, requestKey, identity.identityId, contextId, matchedJson,
        body.expectedWorkItemVersion, body.expectedResponsibilityVersion, verifiedAt, decisionContent, verifiedAt, verifiedAt
      ),
    db
      .prepare(
        `INSERT INTO supplemental_response
         (id, work_item_id, service_provider_id, request_decision_id, submit_decision_id, reply_text, materials_json, success_verified_at, gmt_create, gmt_modified)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
      )
      .bind(
        newId('sr'), row.id, row.service_provider_id, body.requestDecisionId, humanDecisionId,
        body.replyText, JSON.stringify(sourceMaterials), verifiedAt, verifiedAt
      ),
    db
      .prepare(
        `INSERT INTO external_write_operation
         (id, human_decision_id, work_item_id, service_provider_id, installation_work_order_id, source_system,
          interface_kind, action, request_json, content_sha256, status, receipt_json, verified_at, row_version, gmt_create, gmt_modified)
         VALUES (?, ?, ?, ?, ?, ?, 'REVIEW_SYNC', 'SUBMIT_SUPPLEMENT', ?, ?, 'REGISTERED', NULL, NULL, 1, ?, ?)`
      )
      .bind(
        operationId, humanDecisionId, row.id, row.service_provider_id, row.installation_work_order_id,
        order.source_system, requestText, contentDigest, verifiedAt, verifiedAt
      ),
    db
      .prepare(
        `INSERT INTO background_job
         (id, purpose, service_provider_id, work_item_id, external_write_id, target_json, dedupe_key, status, available_at,
          lease_epoch, lease_token, lease_owner, lease_until, row_version, outcome_json, gmt_create, gmt_modified)
         VALUES (?, 'WRITE_EXTERNAL', ?, ?, ?, ?, ?, 'READY', ?, 0, NULL, NULL, NULL, 1, NULL, ?, ?)`
      )
      .bind(
        jobId, row.service_provider_id, row.id, operationId,
        JSON.stringify({
          operationId,
          installationWorkOrderId: order.source_id,
          workItemId: row.id,
          action: 'SUBMIT_SUPPLEMENT',
          request: requestJson,
        }),
        `write:${operationId}`, verifiedAt, verifiedAt, verifiedAt
      ),
    db
      .prepare(
        `INSERT INTO activity_record
         (id, work_item_id, event_key, event_type, actor_identity_id, fact_type, fact_id, occurred_at, details_json, gmt_create, gmt_modified)
         VALUES (?, ?, ?, 'DECISION_CONFIRMED', ?, 'HUMAN_DECISION', ?, ?, ?, ?, ?)`
      )
      .bind(
        newId('act'), row.id, `decision:${humanDecisionId}`, identity.identityId, humanDecisionId, verifiedAt,
        JSON.stringify({ action: 'SUBMIT_SUPPLEMENT', operationId, requestDecisionId: body.requestDecisionId }), verifiedAt, verifiedAt
      ),
    db
      .prepare(
        `UPDATE work_item SET pending_write_id = ?, status = 'PROCESSING', row_version = row_version + 1, gmt_modified = ?
         WHERE id = ? AND row_version = ? AND responsibility_version = ? AND pending_write_id IS NULL
           AND status = 'WAITING_SUPPLEMENT' AND active_supplement_request_id = ?`
      )
      .bind(operationId, verifiedAt, row.id, row.row_version, row.responsibility_version, body.requestDecisionId),
  ];

  const results = await db.batch(statements);
  if (results[results.length - 1].meta.changes !== 1) {
    throw new ServiceError(409, 40901, '回复条件已变化，未生效');
  }

  return {
    decisionId: humanDecisionId,
    operationId,
    jobId,
    workItemId: row.id,
    rowVersion: row.row_version + 1,
    status: 'ACCEPTED',
  };
}
