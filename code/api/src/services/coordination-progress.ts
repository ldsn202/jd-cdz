import type { ResolvedIdentity } from './identity';
import { PendingWriteError, ServiceError, newId, nowMs } from './change-batch';
import type { WorkItemRow } from './work-item-query';
import { currentIdentityContextId, matchedGrants } from './installation-submit';
import { stableStringify } from './installation-draft';

export const KIND_ACTIONS: Record<string, string[]> = {
  INSTALLATION_PREPARATION: ['CONFIRM_INSTALLATION_DRAFT', 'SUBMIT_SUPPLEMENT'],
  INSTALLATION_REVIEW: ['DECIDE_INSTALLATION_REVIEW'],
  RECONCILIATION: ['REQUEST_BILLING_VERIFICATION', 'REPLY_BILLING_VERIFICATION'],
  CONFIGURATION: ['ENABLE_INTEGRATION_CONFIG'],
  COORDINATION: ['COMPLETE_FULFILLMENT_COORDINATION'],
};

export const COORDINATION_ACTIONS = ['COMPLETE_FULFILLMENT_COORDINATION'] as const;

export type ProgressBody = {
  expectedWorkItemVersion: number;
  expectedResponsibilityVersion: number;
  description: string;
};

export type ProgressResult = { activityId: string; workItemId: string; rowVersion: number; status: 'SAVED' };

export type CoordinationCompletionBody = {
  expectedWorkItemVersion: number;
  expectedResponsibilityVersion: number;
  resolution: string;
  evidenceRefs?: unknown;
  analysisResultId?: string | null;
  comment?: string | null;
};

export type CoordinationCompletionResult = { decisionId: string; status: 'APPLIED' };

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function assertDelegate(identity: ResolvedIdentity, row: WorkItemRow): void {
  if (row.assignee_identity_id !== identity.identityId) {
    throw new ServiceError(403, 40301, '当前身份不是该事项的具体责任人');
  }
  const actions = KIND_ACTIONS[row.item_kind] ?? [];
  const allowed = actions.some((action) =>
    identity.grants.some(
      (g) => g.scopeType === 'SERVICE_PROVIDER' && g.actions.includes(action) && g.resourceIds.includes(row.service_provider_id)
    )
  );
  if (!allowed) throw new ServiceError(403, 40301, '当前身份无该事项的办理动作');
}

export async function saveProgress(
  db: D1Database,
  identity: ResolvedIdentity,
  row: WorkItemRow,
  idempotencyKey: string,
  body: ProgressBody
): Promise<ProgressResult> {
  if (!isPlainObject(body)) throw new ServiceError(400, 40001, '请求正文必须为对象');
  const allowed = new Set(['expectedWorkItemVersion', 'expectedResponsibilityVersion', 'description']);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) throw new ServiceError(400, 40001, `正文包含未声明字段：${key}`);
  }
  if (!Number.isInteger(body.expectedWorkItemVersion) || !Number.isInteger(body.expectedResponsibilityVersion)) {
    throw new ServiceError(400, 40001, 'expectedWorkItemVersion 与 expectedResponsibilityVersion 必填且为整数');
  }
  if (typeof body.description !== 'string' || body.description.trim().length === 0) {
    throw new ServiceError(400, 40001, 'description 必填且非空');
  }
  if (body.description.length > 4000) throw new ServiceError(400, 40001, 'description 超过 4000 字符上限');

  const eventKey = `progress:${identity.identityId}:${row.id}:${idempotencyKey}`;
  const prior = await db
    .prepare('SELECT id, details_json FROM activity_record WHERE work_item_id = ? AND event_key = ?')
    .bind(row.id, eventKey)
    .first<{ id: string; details_json: string }>();
  if (prior) {
    let stored: { description?: string } = {};
    try {
      stored = JSON.parse(prior.details_json) as { description?: string };
    } catch {
      stored = {};
    }
    if (stored.description !== body.description) {
      throw new ServiceError(409, 40902, '同一请求键已用于另一份进展内容');
    }
    return { activityId: prior.id, workItemId: row.id, rowVersion: row.row_version, status: 'SAVED' };
  }

  assertDelegate(identity, row);
  if (row.status === 'COMPLETED') throw new ServiceError(409, 40901, '事项已完成，不可再保存进展');
  if (row.row_version !== body.expectedWorkItemVersion) {
    throw new ServiceError(409, 40901, '事项版本已变化，请刷新后重新保存');
  }
  if (row.responsibility_version !== body.expectedResponsibilityVersion) {
    throw new ServiceError(409, 40901, '责任版本已变化，请刷新后重新保存');
  }

  const activityId = newId('act');
  const now = nowMs();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO activity_record
         (id, work_item_id, event_key, event_type, actor_identity_id, fact_type, fact_id, occurred_at, details_json, gmt_create, gmt_modified)
         VALUES (?, ?, ?, 'PROGRESS_SAVED', ?, NULL, NULL, ?, ?, ?, ?)`
      )
      .bind(activityId, row.id, eventKey, identity.identityId, now, JSON.stringify({ description: body.description }), now, now),
    db
      .prepare(
        `UPDATE work_item SET row_version = row_version + 1, gmt_modified = ?
         WHERE id = ? AND row_version = ? AND responsibility_version = ? AND status <> 'COMPLETED'`
      )
      .bind(now, row.id, row.row_version, row.responsibility_version),
  ];
  const results = await db.batch(statements);
  if (results[1].meta.changes !== 1) {
    throw new ServiceError(409, 40901, '保存条件已变化，进展未生效');
  }
  return { activityId, workItemId: row.id, rowVersion: row.row_version + 1, status: 'SAVED' };
}

export async function completeCoordination(
  db: D1Database,
  identity: ResolvedIdentity,
  row: WorkItemRow,
  idempotencyKey: string,
  body: CoordinationCompletionBody
): Promise<CoordinationCompletionResult> {
  if (!isPlainObject(body)) throw new ServiceError(400, 40001, '请求正文必须为对象');
  const allowed = new Set([
    'expectedWorkItemVersion', 'expectedResponsibilityVersion', 'resolution', 'evidenceRefs', 'analysisResultId', 'comment',
  ]);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) throw new ServiceError(400, 40001, `正文包含未声明字段：${key}`);
  }
  if (row.item_kind !== 'COORDINATION') throw new ServiceError(422, 42201, '仅履约协同事项可执行完成协同');
  if (!Number.isInteger(body.expectedWorkItemVersion) || !Number.isInteger(body.expectedResponsibilityVersion)) {
    throw new ServiceError(400, 40001, 'expectedWorkItemVersion 与 expectedResponsibilityVersion 必填且为整数');
  }
  if (typeof body.resolution !== 'string' || body.resolution.trim().length === 0) {
    throw new ServiceError(400, 40001, 'resolution 必填且非空');
  }
  const evidenceRefs = body.evidenceRefs === undefined || body.evidenceRefs === null ? [] : body.evidenceRefs;
  if (!Array.isArray(evidenceRefs)) throw new ServiceError(400, 40001, 'evidenceRefs 必须为数组');

  const requestKey = `coord-complete:${identity.identityId}:${row.id}:${idempotencyKey}`;
  const digest = await sha256Hex(
    stableStringify({
      expectedWorkItemVersion: body.expectedWorkItemVersion,
      expectedResponsibilityVersion: body.expectedResponsibilityVersion,
      resolution: body.resolution,
      evidenceRefs,
      analysisResultId: body.analysisResultId ?? null,
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
    return { decisionId: prior.id, status: 'APPLIED' };
  }

  const pending = await db
    .prepare(`SELECT id, status FROM external_write_operation WHERE work_item_id = ? AND status NOT IN ('SUCCEEDED','REJECTED')`)
    .bind(row.id)
    .first<{ id: string; status: string }>();
  if (pending) throw new PendingWriteError(pending.id, pending.status, '事项存在未决写入，不可完成');
  if (row.status === 'COMPLETED') throw new ServiceError(409, 40901, '事项已完成');
  if (row.row_version !== body.expectedWorkItemVersion) {
    throw new ServiceError(409, 40901, '事项版本已变化，请刷新后重新确认');
  }
  if (row.responsibility_version !== body.expectedResponsibilityVersion) {
    throw new ServiceError(409, 40901, '责任版本已变化，请刷新后重新确认');
  }
  if (body.analysisResultId !== undefined && body.analysisResultId !== null && body.analysisResultId !== row.current_analysis_result_id) {
    throw new ServiceError(409, 40901, '分析依据与当前分析结果不一致');
  }
  assertDelegate(identity, row);

  const contextId = await currentIdentityContextId(db, identity.identityId);
  if (!contextId) throw new ServiceError(401, 40101, '当前身份上下文无效');
  const grants = matchedGrants(identity, row.service_provider_id, COORDINATION_ACTIONS);
  if (grants.length === 0) throw new ServiceError(403, 40301, '当前身份无完成协同的授权');

  const decisionId = newId('hd');
  const now = nowMs();
  const basis = JSON.stringify({ resolution: body.resolution, evidenceRefs, note: '本次履约阻碍处理完成' });
  const contentJson = JSON.stringify({
    digest,
    resolution: body.resolution,
    evidenceRefs,
    stage: row.item_kind,
    workOrderId: row.installation_work_order_id,
    comment: body.comment ?? null,
  });
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO human_decision
         (id, work_item_id, service_provider_id, origin, action_type, request_key, actor_identity_id, identity_context_id,
          matched_grants_json, expected_work_item_version, expected_responsibility_version, analysis_result_id, confirmed_at,
          content_json, source_system, source_record_type, source_record_id, source_actor_ref_json, gmt_create, gmt_modified)
         VALUES (?, ?, ?, 'LOCAL', 'COMPLETE_COORDINATION', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`
      )
      .bind(
        decisionId, row.id, row.service_provider_id, requestKey, identity.identityId, contextId,
        JSON.stringify(grants.map((g) => g.grantId)), body.expectedWorkItemVersion, body.expectedResponsibilityVersion,
        body.analysisResultId ?? null, now, contentJson, now, now
      ),
    db
      .prepare(
        `INSERT INTO activity_record
         (id, work_item_id, event_key, event_type, actor_identity_id, fact_type, fact_id, occurred_at, details_json, gmt_create, gmt_modified)
         VALUES (?, ?, ?, 'DECISION_CONFIRMED', ?, 'HUMAN_DECISION', ?, ?, ?, ?, ?)`
      )
      .bind(
        newId('act'), row.id, `decision:${decisionId}`, identity.identityId, decisionId, now,
        JSON.stringify({ action: 'COMPLETE_COORDINATION', resolution: body.resolution }), now, now
      ),
    db
      .prepare(
        `UPDATE work_item
         SET status = 'COMPLETED', completion_code = 'COORDINATION_RESOLVED', completion_basis_json = ?,
             completion_decision_id = ?, completed_at = ?, blocked_reason = NULL,
             row_version = row_version + 1, gmt_modified = ?
         WHERE id = ? AND row_version = ? AND responsibility_version = ? AND status <> 'COMPLETED'`
      )
      .bind(basis, decisionId, now, now, row.id, row.row_version, row.responsibility_version),
  ];
  const results = await db.batch(statements);
  if (results[2].meta.changes !== 1) throw new ServiceError(409, 40901, '完成条件已变化，未生效');
  return { decisionId, status: 'APPLIED' };
}
