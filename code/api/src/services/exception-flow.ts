import type { ResolvedIdentity } from './identity';
import { PendingWriteError, ServiceError, newId, nowMs } from './change-batch';
import type { WorkItemRow } from './work-item-query';
import { currentIdentityContextId, matchedGrants } from './installation-submit';
import { stableStringify } from './installation-draft';
import { resolveResponsibility } from './responsibility';

export const EXCEPTION_ACTIONS = ['RECORD_EXCEPTION_RESULT'] as const;

const STAGE_ACTIONS: Record<string, string[]> = {
  INSTALLATION_PREPARATION: ['CONFIRM_INSTALLATION_DRAFT', 'SUBMIT_SUPPLEMENT'],
  INSTALLATION_REVIEW: ['DECIDE_INSTALLATION_REVIEW'],
  RECONCILIATION: ['REQUEST_BILLING_VERIFICATION', 'REPLY_BILLING_VERIFICATION'],
  CONFIGURATION: ['ENABLE_INTEGRATION_CONFIG'],
  COORDINATION: ['COMPLETE_FULFILLMENT_COORDINATION'],
};

export type ExceptionOpenBody = {
  expectedWorkItemVersion: number;
  expectedResponsibilityVersion: number;
  reason: string;
  evidenceRefs?: unknown;
  comment?: string | null;
};

export type ExceptionResolutionBody = {
  expectedWorkItemVersion: number;
  expectedResponsibilityVersion: number;
  resolution: string;
  evidenceRefs?: unknown;
  followupRequired?: boolean;
  comment?: string | null;
};

export type StopBody = {
  expectedWorkItemVersion: number;
  expectedResponsibilityVersion: number;
  reason: string;
  basisRefs: unknown;
  comment?: string | null;
};

export type ExceptionApplied = { decisionId: string; status: 'APPLIED' };
export type ResolutionApplied = { decisionId: string; followupWorkItemIds: string[]; status: 'APPLIED' };

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function rejectUnknown(body: Record<string, unknown>, allowed: string[]): void {
  const set = new Set(allowed);
  for (const key of Object.keys(body)) {
    if (!set.has(key)) throw new ServiceError(400, 40001, `正文包含未声明字段：${key}`);
  }
}

function assertResponsible(identity: ResolvedIdentity, row: WorkItemRow, action: string): void {
  if (row.assignee_identity_id !== identity.identityId) {
    throw new ServiceError(403, 40301, '当前身份不是该事项的具体责任人');
  }
  const allowed = identity.grants.some(
    (g) => g.scopeType === 'SERVICE_PROVIDER' && g.actions.includes(action) && g.resourceIds.includes(row.service_provider_id)
  );
  if (!allowed) throw new ServiceError(403, 40301, '当前身份无该事项的异常处理授权');
}

async function findPending(db: D1Database, workItemId: string): Promise<{ id: string; status: string } | null> {
  return db
    .prepare(`SELECT id, status FROM external_write_operation WHERE work_item_id = ? AND status NOT IN ('SUCCEEDED','REJECTED')`)
    .bind(workItemId)
    .first<{ id: string; status: string }>();
}

async function loadPriorDecision(
  db: D1Database,
  requestKey: string
): Promise<{ id: string; content_json: string } | null> {
  return db
    .prepare(`SELECT id, content_json FROM human_decision WHERE request_key = ? AND origin = 'LOCAL'`)
    .bind(requestKey)
    .first<{ id: string; content_json: string }>();
}

function digestOfPrior(contentJson: string): string | null {
  try {
    return (JSON.parse(contentJson) as { digest?: string }).digest ?? null;
  } catch {
    return null;
  }
}

async function resolveStageAssignee(
  db: D1Database,
  providerId: string,
  stage: string
): Promise<string | null> {
  for (const action of STAGE_ACTIONS[stage] ?? []) {
    const id = await resolveResponsibility(db, providerId, action);
    if (id) return id;
  }
  return null;
}

export async function openException(
  db: D1Database,
  identity: ResolvedIdentity,
  row: WorkItemRow,
  idempotencyKey: string,
  body: ExceptionOpenBody
): Promise<ExceptionApplied> {
  if (!isPlainObject(body)) throw new ServiceError(400, 40001, '请求正文必须为对象');
  rejectUnknown(body, ['expectedWorkItemVersion', 'expectedResponsibilityVersion', 'reason', 'evidenceRefs', 'comment']);
  if (!Number.isInteger(body.expectedWorkItemVersion) || !Number.isInteger(body.expectedResponsibilityVersion)) {
    throw new ServiceError(400, 40001, 'expectedWorkItemVersion 与 expectedResponsibilityVersion 必填且为整数');
  }
  if (typeof body.reason !== 'string' || body.reason.trim().length === 0) {
    throw new ServiceError(400, 40001, 'reason 必填且非空');
  }
  const evidenceRefs = body.evidenceRefs === undefined || body.evidenceRefs === null ? [] : body.evidenceRefs;
  if (!Array.isArray(evidenceRefs)) throw new ServiceError(400, 40001, 'evidenceRefs 必须为数组');

  const requestKey = `exception-open:${identity.identityId}:${row.id}:${idempotencyKey}`;
  const digest = await sha256Hex(
    stableStringify({
      expectedWorkItemVersion: body.expectedWorkItemVersion,
      expectedResponsibilityVersion: body.expectedResponsibilityVersion,
      reason: body.reason,
      evidenceRefs,
      comment: body.comment ?? null,
    })
  );
  const prior = await loadPriorDecision(db, requestKey);
  if (prior) {
    if (digestOfPrior(prior.content_json) !== digest) throw new ServiceError(409, 40902, '同一请求键已用于另一份确认内容');
    return { decisionId: prior.id, status: 'APPLIED' };
  }

  assertResponsible(identity, row, 'RECORD_EXCEPTION_RESULT');
  if (row.status === 'COMPLETED') throw new ServiceError(409, 40901, '事项已完成，不可登记异常');
  if (row.row_version !== body.expectedWorkItemVersion) {
    throw new ServiceError(409, 40901, '事项版本已变化，请刷新后重新确认');
  }
  if (row.responsibility_version !== body.expectedResponsibilityVersion) {
    throw new ServiceError(409, 40901, '责任版本已变化，请刷新后重新确认');
  }

  const contextId = await currentIdentityContextId(db, identity.identityId);
  if (!contextId) throw new ServiceError(401, 40101, '当前身份上下文无效');
  const grants = matchedGrants(identity, row.service_provider_id, EXCEPTION_ACTIONS);
  if (grants.length === 0) throw new ServiceError(403, 40301, '当前身份无登记异常的授权');

  const decisionId = newId('hd');
  const now = nowMs();
  const contentJson = JSON.stringify({
    digest,
    reason: body.reason,
    evidenceRefs,
    stage: row.item_kind,
    workOrderId: row.installation_work_order_id,
    businessKey: row.business_key,
    comment: body.comment ?? null,
  });
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO human_decision
         (id, work_item_id, service_provider_id, origin, action_type, request_key, actor_identity_id, identity_context_id,
          matched_grants_json, expected_work_item_version, expected_responsibility_version, analysis_result_id, confirmed_at,
          content_json, source_system, source_record_type, source_record_id, source_actor_ref_json, gmt_create, gmt_modified)
         VALUES (?, ?, ?, 'LOCAL', 'OPEN_EXCEPTION', ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`
      )
      .bind(
        decisionId, row.id, row.service_provider_id, requestKey, identity.identityId, contextId,
        JSON.stringify(grants.map((g) => g.grantId)), body.expectedWorkItemVersion, body.expectedResponsibilityVersion,
        now, contentJson, now, now
      ),
    db
      .prepare(
        `INSERT INTO activity_record
         (id, work_item_id, event_key, event_type, actor_identity_id, fact_type, fact_id, occurred_at, details_json, gmt_create, gmt_modified)
         VALUES (?, ?, ?, 'DECISION_CONFIRMED', ?, 'HUMAN_DECISION', ?, ?, ?, ?, ?)`
      )
      .bind(
        newId('act'), row.id, `decision:${decisionId}`, identity.identityId, decisionId, now,
        JSON.stringify({ action: 'OPEN_EXCEPTION', reason: body.reason, stage: row.item_kind }), now, now
      ),
    db
      .prepare(
        `UPDATE work_item SET status = 'EXCEPTION', blocked_reason = ?, row_version = row_version + 1, gmt_modified = ?
         WHERE id = ? AND row_version = ? AND responsibility_version = ? AND status <> 'COMPLETED'`
      )
      .bind(body.reason, now, row.id, row.row_version, row.responsibility_version),
  ];
  const results = await db.batch(statements);
  if (results[2].meta.changes !== 1) throw new ServiceError(409, 40901, '登记条件已变化，未生效');
  return { decisionId, status: 'APPLIED' };
}

export async function resolveException(
  db: D1Database,
  identity: ResolvedIdentity,
  row: WorkItemRow,
  idempotencyKey: string,
  body: ExceptionResolutionBody
): Promise<ResolutionApplied> {
  if (!isPlainObject(body)) throw new ServiceError(400, 40001, '请求正文必须为对象');
  rejectUnknown(body, [
    'expectedWorkItemVersion', 'expectedResponsibilityVersion', 'resolution', 'evidenceRefs', 'followupRequired', 'comment',
  ]);
  if (!Number.isInteger(body.expectedWorkItemVersion) || !Number.isInteger(body.expectedResponsibilityVersion)) {
    throw new ServiceError(400, 40001, 'expectedWorkItemVersion 与 expectedResponsibilityVersion 必填且为整数');
  }
  if (typeof body.resolution !== 'string' || body.resolution.trim().length === 0) {
    throw new ServiceError(400, 40001, 'resolution 必填且非空');
  }
  const evidenceRefs = body.evidenceRefs === undefined || body.evidenceRefs === null ? [] : body.evidenceRefs;
  if (!Array.isArray(evidenceRefs)) throw new ServiceError(400, 40001, 'evidenceRefs 必须为数组');
  if (body.followupRequired !== undefined && typeof body.followupRequired !== 'boolean') {
    throw new ServiceError(400, 40001, 'followupRequired 必须为布尔值');
  }
  const followupRequired = body.followupRequired !== false;
  if (!followupRequired && evidenceRefs.length === 0) {
    throw new ServiceError(422, 42201, '无后续工作时必须提供核实依据');
  }

  const requestKey = `exception-close:${identity.identityId}:${row.id}:${idempotencyKey}`;
  const digest = await sha256Hex(
    stableStringify({
      expectedWorkItemVersion: body.expectedWorkItemVersion,
      expectedResponsibilityVersion: body.expectedResponsibilityVersion,
      resolution: body.resolution,
      evidenceRefs,
      followupRequired,
      comment: body.comment ?? null,
    })
  );
  const prior = await loadPriorDecision(db, requestKey);
  if (prior) {
    if (digestOfPrior(prior.content_json) !== digest) throw new ServiceError(409, 40902, '同一请求键已用于另一份确认内容');
    const links = await db
      .prepare(`SELECT to_work_item_id FROM work_item_link WHERE from_work_item_id = ? AND reason_code = 'EXCEPTION_CONTINUATION'`)
      .bind(row.id)
      .all<{ to_work_item_id: string }>();
    return {
      decisionId: prior.id,
      followupWorkItemIds: (links.results ?? []).map((l) => l.to_work_item_id),
      status: 'APPLIED',
    };
  }

  assertResponsible(identity, row, 'RECORD_EXCEPTION_RESULT');
  if (row.status !== 'EXCEPTION') throw new ServiceError(422, 42201, '当前事项不在异常处理中');
  const pending = await findPending(db, row.id);
  if (pending) throw new PendingWriteError(pending.id, pending.status, '存在未决写入，需先核实原动作结果');
  if (row.row_version !== body.expectedWorkItemVersion) {
    throw new ServiceError(409, 40901, '事项版本已变化，请刷新后重新确认');
  }
  if (row.responsibility_version !== body.expectedResponsibilityVersion) {
    throw new ServiceError(409, 40901, '责任版本已变化，请刷新后重新确认');
  }

  const openDecision = await db
    .prepare(
      `SELECT id, content_json FROM human_decision
       WHERE work_item_id = ? AND action_type = 'OPEN_EXCEPTION' ORDER BY confirmed_at DESC, id DESC LIMIT 1`
    )
    .bind(row.id)
    .first<{ id: string; content_json: string }>();
  let stage = row.item_kind;
  if (openDecision) {
    try {
      const c = JSON.parse(openDecision.content_json) as { stage?: string };
      if (c.stage && Object.hasOwn(STAGE_ACTIONS, c.stage)) stage = c.stage;
    } catch {
      stage = row.item_kind;
    }
  }

  const contextId = await currentIdentityContextId(db, identity.identityId);
  if (!contextId) throw new ServiceError(401, 40101, '当前身份上下文无效');
  const grants = matchedGrants(identity, row.service_provider_id, EXCEPTION_ACTIONS);
  if (grants.length === 0) throw new ServiceError(403, 40301, '当前身份无关闭异常的授权');

  const decisionId = newId('hd');
  const closeActivityId = newId('act');
  const now = nowMs();
  const followupIds: string[] = [];
  const statements: D1PreparedStatement[] = [];

  const contentJson = JSON.stringify({
    digest,
    resolution: body.resolution,
    evidenceRefs,
    followupRequired,
    stage,
    workOrderId: row.installation_work_order_id,
    comment: body.comment ?? null,
  });
  statements.push(
    db
      .prepare(
        `INSERT INTO human_decision
         (id, work_item_id, service_provider_id, origin, action_type, request_key, actor_identity_id, identity_context_id,
          matched_grants_json, expected_work_item_version, expected_responsibility_version, analysis_result_id, confirmed_at,
          content_json, source_system, source_record_type, source_record_id, source_actor_ref_json, gmt_create, gmt_modified)
         VALUES (?, ?, ?, 'LOCAL', 'CLOSE_EXCEPTION', ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`
      )
      .bind(
        decisionId, row.id, row.service_provider_id, requestKey, identity.identityId, contextId,
        JSON.stringify(grants.map((g) => g.grantId)), body.expectedWorkItemVersion, body.expectedResponsibilityVersion,
        now, contentJson, now, now
      )
  );

  if (followupRequired && row.installation_work_order_id) {
    const existing = await db
      .prepare(
        `SELECT id FROM work_item
         WHERE service_provider_id = ? AND installation_work_order_id = ? AND item_kind = ?
           AND status <> 'COMPLETED' AND id <> ?
         ORDER BY gmt_create, id LIMIT 1`
      )
      .bind(row.service_provider_id, row.installation_work_order_id, stage, row.id)
      .first<{ id: string }>();
    let followupId = existing?.id;
    if (!followupId) {
      followupId = newId('w');
      const assignee = await resolveStageAssignee(db, row.service_provider_id, stage);
      const creationKey = `exception-followup:${decisionId}`;
      const businessIdentity = JSON.stringify([
        row.service_provider_id,
        stage,
        'EXCEPTION_CONTINUATION',
        row.installation_work_order_id,
        stage,
        STAGE_ACTIONS[stage]?.[0] ?? '',
      ]);
      statements.push(
        db
          .prepare(
            `INSERT INTO work_item
             (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json,
              creation_key, title, status, assignee_identity_id, responsibility_version, row_version, analysis_generation,
              blocked_reason, gmt_create, gmt_modified)
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, ?, ?, ? WHERE NOT EXISTS (
               SELECT 1 FROM work_item WHERE creation_key = ?)`
          )
          .bind(
            followupId, row.service_provider_id, row.installation_work_order_id, stage, creationKey, businessIdentity,
            creationKey, `异常关闭后继续办理（${stage}）`, assignee ? 'PREPARING' : 'BLOCKED', assignee,
            assignee ? null : 'RESPONSIBILITY_UNRESOLVED', now, now, creationKey
          )
      );
      statements.push(
        db
          .prepare(
            `INSERT INTO activity_record
             (id, work_item_id, event_key, event_type, actor_identity_id, fact_type, fact_id, occurred_at, details_json, gmt_create, gmt_modified)
             SELECT ?, ?, ?, 'WORK_CREATED', NULL, 'WORK_ITEM', ?, NULL, ?, ?, ? WHERE NOT EXISTS (
               SELECT 1 FROM activity_record WHERE work_item_id = ? AND event_key = ?)`
          )
          .bind(
            newId('act'), followupId, `work-created:${followupId}`, followupId,
            JSON.stringify({ from: row.id, closeDecisionId: decisionId, stage }), now, now, followupId,
            `work-created:${followupId}`
          )
      );
    }
    followupIds.push(followupId);
    statements.push(
      db
        .prepare(
          `INSERT INTO work_item_link (id, from_work_item_id, to_work_item_id, reason_code, cause_key, basis_json, gmt_create, gmt_modified)
           SELECT ?, ?, ?, 'EXCEPTION_CONTINUATION', ?, ?, ?, ? WHERE NOT EXISTS (
             SELECT 1 FROM work_item_link WHERE from_work_item_id = ? AND reason_code = 'EXCEPTION_CONTINUATION' AND cause_key = ?)`
        )
        .bind(
          newId('wl'), row.id, followupId, `close:${decisionId}`,
          JSON.stringify({ closeDecisionId: decisionId, originalExceptionDecisionId: openDecision?.id ?? null, stage, resolution: body.resolution }),
          now, now, row.id, `close:${decisionId}`
        )
    );
    statements.push(
      db
        .prepare(
          `INSERT INTO activity_record
           (id, work_item_id, event_key, event_type, actor_identity_id, fact_type, fact_id, occurred_at, details_json, gmt_create, gmt_modified)
           SELECT ?, ?, ?, 'FOLLOWUP_LINKED', ?, 'WORK_ITEM_LINK', ?, ?, ?, ?, ? WHERE NOT EXISTS (
             SELECT 1 FROM activity_record WHERE work_item_id = ? AND event_key = ?)`
        )
        .bind(
          newId('act'), row.id, `followup:${decisionId}`, identity.identityId, followupId, now,
          JSON.stringify({ toWorkItemId: followupId, stage }), now, now, row.id, `followup:${decisionId}`
        )
    );
  }

  statements.push(
    db
      .prepare(
        `INSERT INTO activity_record
         (id, work_item_id, event_key, event_type, actor_identity_id, fact_type, fact_id, occurred_at, details_json, gmt_create, gmt_modified)
         VALUES (?, ?, ?, 'DECISION_CONFIRMED', ?, 'HUMAN_DECISION', ?, ?, ?, ?, ?)`
      )
      .bind(
        closeActivityId, row.id, `decision:${decisionId}`, identity.identityId, decisionId, now,
        JSON.stringify({ action: 'CLOSE_EXCEPTION', resolution: body.resolution, followupWorkItemIds: followupIds }), now, now
      )
  );

  const basis = JSON.stringify({
    resolution: body.resolution,
    evidenceRefs,
    followupWorkItemIds: followupIds,
    ...(followupRequired ? {} : { noFollowupBasis: '核实无同类未完成工作时随本次关闭记录' }),
  });
  statements.push(
    db
      .prepare(
        `UPDATE work_item
         SET status = 'COMPLETED', completion_code = 'EXCEPTION_RESOLVED', completion_basis_json = ?,
             completion_decision_id = ?, completed_at = ?, blocked_reason = NULL,
             row_version = row_version + 1, gmt_modified = ?
         WHERE id = ? AND row_version = ? AND responsibility_version = ? AND status = 'EXCEPTION'`
      )
      .bind(basis, decisionId, now, now, row.id, row.row_version, row.responsibility_version)
  );

  const results = await db.batch(statements);
  if (results[results.length - 1].meta.changes !== 1) {
    throw new ServiceError(409, 40901, '关闭条件已变化，未生效');
  }
  return { decisionId, followupWorkItemIds: followupIds, status: 'APPLIED' };
}

export async function stopWork(
  db: D1Database,
  identity: ResolvedIdentity,
  row: WorkItemRow,
  idempotencyKey: string,
  body: StopBody
): Promise<ExceptionApplied> {
  if (!isPlainObject(body)) throw new ServiceError(400, 40001, '请求正文必须为对象');
  rejectUnknown(body, ['expectedWorkItemVersion', 'expectedResponsibilityVersion', 'reason', 'basisRefs', 'comment']);
  if (!Number.isInteger(body.expectedWorkItemVersion) || !Number.isInteger(body.expectedResponsibilityVersion)) {
    throw new ServiceError(400, 40001, 'expectedWorkItemVersion 与 expectedResponsibilityVersion 必填且为整数');
  }
  if (typeof body.reason !== 'string' || body.reason.trim().length === 0) {
    throw new ServiceError(400, 40001, 'reason 必填且非空');
  }
  if (!Array.isArray(body.basisRefs) || body.basisRefs.length === 0) {
    throw new ServiceError(422, 42201, '停止必须有非空依据引用');
  }

  const requestKey = `stop:${identity.identityId}:${row.id}:${idempotencyKey}`;
  const digest = await sha256Hex(
    stableStringify({
      expectedWorkItemVersion: body.expectedWorkItemVersion,
      expectedResponsibilityVersion: body.expectedResponsibilityVersion,
      reason: body.reason,
      basisRefs: body.basisRefs,
      comment: body.comment ?? null,
    })
  );
  const prior = await loadPriorDecision(db, requestKey);
  if (prior) {
    if (digestOfPrior(prior.content_json) !== digest) throw new ServiceError(409, 40902, '同一请求键已用于另一份确认内容');
    return { decisionId: prior.id, status: 'APPLIED' };
  }

  assertResponsible(identity, row, 'RECORD_EXCEPTION_RESULT');
  const pending = await findPending(db, row.id);
  if (pending) throw new PendingWriteError(pending.id, pending.status, '存在未决写入，不可停止');
  if (row.status === 'COMPLETED') throw new ServiceError(409, 40901, '事项已完成');
  if (row.row_version !== body.expectedWorkItemVersion) {
    throw new ServiceError(409, 40901, '事项版本已变化，请刷新后重新确认');
  }
  if (row.responsibility_version !== body.expectedResponsibilityVersion) {
    throw new ServiceError(409, 40901, '责任版本已变化，请刷新后重新确认');
  }

  const contextId = await currentIdentityContextId(db, identity.identityId);
  if (!contextId) throw new ServiceError(401, 40101, '当前身份上下文无效');
  const grants = matchedGrants(identity, row.service_provider_id, EXCEPTION_ACTIONS);
  if (grants.length === 0) throw new ServiceError(403, 40301, '当前身份无停止决定的授权');

  const decisionId = newId('hd');
  const now = nowMs();
  const basis = JSON.stringify({ reason: body.reason, basisRefs: body.basisRefs });
  const contentJson = JSON.stringify({
    digest,
    reason: body.reason,
    basisRefs: body.basisRefs,
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
         VALUES (?, ?, ?, 'LOCAL', 'STOP_WORK', ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`
      )
      .bind(
        decisionId, row.id, row.service_provider_id, requestKey, identity.identityId, contextId,
        JSON.stringify(grants.map((g) => g.grantId)), body.expectedWorkItemVersion, body.expectedResponsibilityVersion,
        now, contentJson, now, now
      ),
    db
      .prepare(
        `INSERT INTO activity_record
         (id, work_item_id, event_key, event_type, actor_identity_id, fact_type, fact_id, occurred_at, details_json, gmt_create, gmt_modified)
         VALUES (?, ?, ?, 'DECISION_CONFIRMED', ?, 'HUMAN_DECISION', ?, ?, ?, ?, ?)`
      )
      .bind(
        newId('act'), row.id, `decision:${decisionId}`, identity.identityId, decisionId, now,
        JSON.stringify({ action: 'STOP_WORK', reason: body.reason }), now, now
      ),
    db
      .prepare(
        `UPDATE work_item
         SET status = 'COMPLETED', completion_code = 'BUSINESS_STOPPED', completion_basis_json = ?,
             completion_decision_id = ?, completed_at = ?, row_version = row_version + 1, gmt_modified = ?
         WHERE id = ? AND row_version = ? AND responsibility_version = ? AND status <> 'COMPLETED'`
      )
      .bind(basis, decisionId, now, now, row.id, row.row_version, row.responsibility_version),
  ];
  const results = await db.batch(statements);
  if (results[2].meta.changes !== 1) throw new ServiceError(409, 40901, '停止条件已变化，未生效');
  return { decisionId, status: 'APPLIED' };
}
