import type { ResolvedIdentity } from './identity';
import { PendingWriteError, ServiceError, newId, nowMs } from './change-batch';
import type { WorkItemRow } from './work-item-query';
import { currentIdentityContextId, findPendingOperation, matchedGrants } from './installation-submit';
import { stableStringify } from './installation-draft';
import { resolveResponsibility } from './responsibility';

export const REQUEST_ACTIONS = ['REQUEST_BILLING_VERIFICATION'] as const;
export const REPLY_ACTIONS = ['REPLY_BILLING_VERIFICATION'] as const;

export type BillingApplied = { decisionId: string; questionActionId?: string; status: 'APPLIED' };

// 交接后原责任人重放同一确认：请求键已存在时应返回原结果，不因责任已交接而判为越权。
export async function hasPriorBillingDecision(
  db: D1Database,
  identityId: string,
  workItemId: string,
  idempotencyKey: string
): Promise<boolean> {
  const keys = ['billing-q', 'billing-r', 'billing-f'].map((p) => `${p}:${identityId}:${workItemId}:${idempotencyKey}`);
  const row = await db
    .prepare(
      `SELECT 1 AS hit FROM human_decision WHERE origin = 'LOCAL' AND request_key IN (${keys.map(() => '?').join(',')}) LIMIT 1`
    )
    .bind(...keys)
    .first<{ hit: number }>();
  return !!row;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function assertVersionInts(body: { expectedWorkItemVersion?: unknown; expectedResponsibilityVersion?: unknown }): void {
  if (!Number.isInteger(body.expectedWorkItemVersion) || !Number.isInteger(body.expectedResponsibilityVersion)) {
    throw new ServiceError(400, 40001, 'expectedWorkItemVersion 与 expectedResponsibilityVersion 必填且为整数');
  }
}

function rejectUnknownKeys(body: Record<string, unknown>, allowed: string[]): void {
  const set = new Set(allowed);
  for (const key of Object.keys(body)) {
    if (!set.has(key)) throw new ServiceError(400, 40001, `正文包含未声明字段：${key}`);
  }
}

async function replayOrNull(
  db: D1Database,
  requestKey: string,
  digest: string
): Promise<Record<string, unknown> | null> {
  const prior = await db
    .prepare(`SELECT id, content_json FROM human_decision WHERE request_key = ? AND origin = 'LOCAL'`)
    .bind(requestKey)
    .first<{ id: string; content_json: string }>();
  if (!prior) return null;
  let stored: { digest?: string; questionActionId?: string } = {};
  try {
    stored = JSON.parse(prior.content_json) as { digest?: string; questionActionId?: string };
  } catch {
    stored = {};
  }
  if (stored.digest !== digest) {
    throw new ServiceError(409, 40902, '同一请求键已用于另一份确认内容');
  }
  const action = await db
    .prepare('SELECT id FROM fee_verification_action WHERE human_decision_id = ?')
    .bind(prior.id)
    .first<{ id: string }>();
  const result: BillingApplied = { decisionId: prior.id, status: 'APPLIED' };
  if (action) result.questionActionId = action.id;
  return result as unknown as Record<string, unknown>;
}

async function guardWritable(
  db: D1Database,
  row: WorkItemRow,
  body: { expectedWorkItemVersion?: unknown; expectedResponsibilityVersion?: unknown },
  reconciliationId: string
): Promise<void> {
  const pending = await findPendingOperation(db, row.id, row.installation_work_order_id);
  if (pending) throw new PendingWriteError(pending.operationId, pending.status, '事项存在未决写入');
  if (row.status === 'COMPLETED') throw new ServiceError(409, 40901, '事项已完成，不可再提交');
  if (row.row_version !== body.expectedWorkItemVersion) {
    throw new ServiceError(409, 40901, '事项版本已变化，请刷新后重新确认');
  }
  if (row.responsibility_version !== body.expectedResponsibilityVersion) {
    throw new ServiceError(409, 40901, '责任版本已变化，请刷新后重新确认');
  }
  if (row.current_reconciliation_id !== reconciliationId) {
    throw new ServiceError(409, 40901, '比较版本已变化，请刷新后重新确认');
  }
}

// ---------------------------------------------------------------------------
// 发起核实问题
// ---------------------------------------------------------------------------

export type BillingQuestionsBody = {
  expectedWorkItemVersion: number;
  expectedResponsibilityVersion: number;
  reconciliationId: string;
  questions: unknown;
  comment?: string | null;
};

export function validateQuestionItems(raw: unknown): { groupId: string | null; question: string; evidenceRefs: unknown[] }[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 100) {
    throw new ServiceError(400, 40001, 'questions 必须为非空数组且不超过 100 项');
  }
  return raw.map((entry, i) => {
    if (!isPlainObject(entry)) throw new ServiceError(400, 40001, `questions[${i}] 必须为对象`);
    const groupId = entry.groupId;
    if (groupId !== null && groupId !== undefined && (typeof groupId !== 'string' || groupId.trim().length === 0)) {
      throw new ServiceError(400, 40001, `questions[${i}].groupId 必须为非空字符串或 null`);
    }
    if (typeof entry.question !== 'string' || entry.question.trim().length === 0) {
      throw new ServiceError(400, 40001, `questions[${i}].question 必填且非空`);
    }
    const evidenceRefs = entry.evidenceRefs;
    if (evidenceRefs !== undefined && evidenceRefs !== null && !Array.isArray(evidenceRefs)) {
      throw new ServiceError(400, 40001, `questions[${i}].evidenceRefs 必须为数组`);
    }
    return { groupId: (groupId as string | null | undefined) ?? null, question: entry.question, evidenceRefs: (evidenceRefs as unknown[]) ?? [] };
  });
}

export async function billingQuestions(
  db: D1Database,
  identity: ResolvedIdentity,
  row: WorkItemRow,
  idempotencyKey: string,
  body: BillingQuestionsBody
): Promise<BillingApplied> {
  if (!isPlainObject(body)) throw new ServiceError(400, 40001, '请求正文必须为对象');
  rejectUnknownKeys(body, ['expectedWorkItemVersion', 'expectedResponsibilityVersion', 'reconciliationId', 'questions', 'comment']);
  assertVersionInts(body);
  if (typeof body.reconciliationId !== 'string' || body.reconciliationId.trim().length === 0) {
    throw new ServiceError(400, 40001, 'reconciliationId 必填');
  }
  const items = validateQuestionItems(body.questions);

  const requestKey = `billing-q:${identity.identityId}:${row.id}:${idempotencyKey}`;
  const digest = await sha256Hex(
    stableStringify({ ...body, questions: items, expectedWorkItemVersion: body.expectedWorkItemVersion, expectedResponsibilityVersion: body.expectedResponsibilityVersion })
  );
  const replay = await replayOrNull(db, requestKey, digest);
  if (replay) return replay as unknown as BillingApplied;

  await guardWritable(db, row, body, body.reconciliationId);

  const contextId = await currentIdentityContextId(db, identity.identityId);
  if (!contextId) throw new ServiceError(401, 40101, '当前身份上下文无效');
  const grants = matchedGrants(identity, row.service_provider_id, REQUEST_ACTIONS);
  if (grants.length === 0) throw new ServiceError(403, 40301, '当前身份无发起核实的授权');
  const matchedJson = JSON.stringify(grants.map((g) => g.grantId));

  const decisionId = newId('hd');
  const actionId = newId('qa');
  const questionActionId = actionId;
  const now = nowMs();
  const questionsWithIds = items.map((q, i) => ({ itemId: `${actionId}-i${i + 1}`, ...q }));
  const contentJson = JSON.stringify({ digest, questionActionId, questions: questionsWithIds });

  const assignee = await resolveResponsibility(db, row.service_provider_id, 'REPLY_BILLING_VERIFICATION');
  const assigneeChanged = assignee !== row.assignee_identity_id;

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO human_decision
         (id, work_item_id, service_provider_id, origin, action_type, request_key, actor_identity_id, identity_context_id,
          matched_grants_json, expected_work_item_version, expected_responsibility_version, analysis_result_id, confirmed_at,
          content_json, source_system, source_record_type, source_record_id, source_actor_ref_json, gmt_create, gmt_modified)
         VALUES (?, ?, ?, 'LOCAL', 'REQUEST_FEE_VERIFICATION', ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`
      )
      .bind(
        decisionId, row.id, row.service_provider_id, requestKey, identity.identityId, contextId, matchedJson,
        body.expectedWorkItemVersion, body.expectedResponsibilityVersion, now, contentJson, now, now
      ),
    db
      .prepare(
        `INSERT INTO fee_verification_action
         (id, human_decision_id, reconciliation_id, action_kind, question_action_id, is_closed, closed_by_kind, closed_by_id, close_basis_json, closed_at, gmt_create, gmt_modified)
         VALUES (?, ?, ?, 'QUESTION', NULL, 0, NULL, NULL, NULL, NULL, ?, ?)`
      )
      .bind(actionId, decisionId, body.reconciliationId, now, now),
    db
      .prepare(
        `INSERT INTO activity_record
         (id, work_item_id, event_key, event_type, actor_identity_id, fact_type, fact_id, occurred_at, details_json, gmt_create, gmt_modified)
         VALUES (?, ?, ?, 'DECISION_CONFIRMED', ?, 'HUMAN_DECISION', ?, ?, ?, ?, ?)`
      )
      .bind(
        newId('act'), row.id, `decision:${decisionId}`, identity.identityId, decisionId, now,
        JSON.stringify({ action: 'REQUEST_FEE_VERIFICATION', questionActionId, count: questionsWithIds.length }), now, now
      ),
    db
      .prepare(
        `UPDATE work_item SET status = 'WAITING_REPLY', assignee_identity_id = ?, blocked_reason = ?,
                responsibility_version = responsibility_version + ?, row_version = row_version + 1, gmt_modified = ?
         WHERE id = ? AND row_version = ? AND responsibility_version = ? AND status <> 'COMPLETED'`
      )
      .bind(
        assignee, assignee ? null : 'RESPONSIBILITY_UNRESOLVED', assigneeChanged ? 1 : 0, now,
        row.id, row.row_version, row.responsibility_version
      ),
  ];
  const results = await db.batch(statements);
  if (results[results.length - 1].meta.changes !== 1) {
    throw new ServiceError(409, 40901, '提交条件已变化，核实问题未生效');
  }
  return { decisionId, questionActionId, status: 'APPLIED' };
}

// ---------------------------------------------------------------------------
// 服务商回复核实问题
// ---------------------------------------------------------------------------

export type BillingReplyBody = {
  expectedWorkItemVersion: number;
  expectedResponsibilityVersion: number;
  requestDecisionId: string;
  replyText: string;
  materialVersionIds?: unknown;
  comment?: string | null;
};

export async function billingReply(
  db: D1Database,
  identity: ResolvedIdentity,
  row: WorkItemRow,
  idempotencyKey: string,
  body: BillingReplyBody
): Promise<BillingApplied> {
  if (!isPlainObject(body)) throw new ServiceError(400, 40001, '请求正文必须为对象');
  rejectUnknownKeys(body, ['expectedWorkItemVersion', 'expectedResponsibilityVersion', 'requestDecisionId', 'replyText', 'materialVersionIds', 'comment']);
  assertVersionInts(body);
  if (typeof body.requestDecisionId !== 'string' || body.requestDecisionId.trim().length === 0) {
    throw new ServiceError(400, 40001, 'requestDecisionId 必填');
  }
  if (typeof body.replyText !== 'string' || body.replyText.trim().length === 0) {
    throw new ServiceError(400, 40001, 'replyText 必填且非空');
  }
  if (body.replyText.length > 4000) throw new ServiceError(400, 40001, 'replyText 超过 4000 字符上限');
  const materialVersionIds = ((body.materialVersionIds ?? []) as unknown[]).map((v) => {
    if (typeof v !== 'string' || v.trim().length === 0) throw new ServiceError(400, 40001, 'materialVersionIds 元素必须为非空字符串');
    return v;
  });
  if (!Array.isArray(body.materialVersionIds ?? [])) {
    throw new ServiceError(400, 40001, 'materialVersionIds 必须为数组');
  }

  const requestKey = `billing-r:${identity.identityId}:${row.id}:${idempotencyKey}`;
  const digest = await sha256Hex(
    stableStringify({
      expectedWorkItemVersion: body.expectedWorkItemVersion,
      expectedResponsibilityVersion: body.expectedResponsibilityVersion,
      requestDecisionId: body.requestDecisionId,
      replyText: body.replyText,
      materialVersionIds,
      comment: body.comment ?? null,
    })
  );
  const replay = await replayOrNull(db, requestKey, digest);
  if (replay) return replay as unknown as BillingApplied;

  const pending = await findPendingOperation(db, row.id, row.installation_work_order_id);
  if (pending) throw new PendingWriteError(pending.operationId, pending.status, '事项存在未决写入');
  if (row.status === 'COMPLETED') throw new ServiceError(409, 40901, '事项已完成，不可再回复');
  if (row.row_version !== body.expectedWorkItemVersion) {
    throw new ServiceError(409, 40901, '事项版本已变化，请刷新后重新确认');
  }
  if (row.responsibility_version !== body.expectedResponsibilityVersion) {
    throw new ServiceError(409, 40901, '责任版本已变化，请刷新后重新确认');
  }

  const question = await db
    .prepare(
      `SELECT f.id, f.reconciliation_id FROM fee_verification_action f
       JOIN reconciliation_record r ON r.id = f.reconciliation_id
       WHERE f.human_decision_id = ? AND f.action_kind = 'QUESTION' AND f.is_closed = 0 AND r.work_item_id = ?`
    )
    .bind(body.requestDecisionId, row.id)
    .first<{ id: string; reconciliation_id: string }>();
  if (!question) throw new ServiceError(409, 40903, '该核实问题已不在待回复状态，请刷新原事项');

  const contextId = await currentIdentityContextId(db, identity.identityId);
  if (!contextId) throw new ServiceError(401, 40101, '当前身份上下文无效');
  const grants = matchedGrants(identity, row.service_provider_id, REPLY_ACTIONS);
  if (grants.length === 0) throw new ServiceError(403, 40301, '当前身份无回复核实的授权');
  const matchedJson = JSON.stringify(grants.map((g) => g.grantId));

  const decisionId = newId('hd');
  const now = nowMs();
  const contentJson = JSON.stringify({ digest, replyText: body.replyText, materialVersionIds });
  const assignee = await resolveResponsibility(db, row.service_provider_id, 'REQUEST_BILLING_VERIFICATION');
  const assigneeChanged = assignee !== row.assignee_identity_id;

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO human_decision
         (id, work_item_id, service_provider_id, origin, action_type, request_key, actor_identity_id, identity_context_id,
          matched_grants_json, expected_work_item_version, expected_responsibility_version, analysis_result_id, confirmed_at,
          content_json, source_system, source_record_type, source_record_id, source_actor_ref_json, gmt_create, gmt_modified)
         VALUES (?, ?, ?, 'LOCAL', 'REPLY_FEE_VERIFICATION', ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`
      )
      .bind(
        decisionId, row.id, row.service_provider_id, requestKey, identity.identityId, contextId, matchedJson,
        body.expectedWorkItemVersion, body.expectedResponsibilityVersion, now, contentJson, now, now
      ),
    db
      .prepare(
        `INSERT INTO fee_verification_action
         (id, human_decision_id, reconciliation_id, action_kind, question_action_id, is_closed, closed_by_kind, closed_by_id, close_basis_json, closed_at, gmt_create, gmt_modified)
         VALUES (?, ?, ?, 'REPLY', ?, 0, NULL, NULL, NULL, NULL, ?, ?)`
      )
      .bind(newId('ra'), decisionId, question.reconciliation_id, question.id, now, now),
    db
      .prepare(
        `INSERT INTO activity_record
         (id, work_item_id, event_key, event_type, actor_identity_id, fact_type, fact_id, occurred_at, details_json, gmt_create, gmt_modified)
         VALUES (?, ?, ?, 'DECISION_CONFIRMED', ?, 'HUMAN_DECISION', ?, ?, ?, ?, ?)`
      )
      .bind(
        newId('act'), row.id, `decision:${decisionId}`, identity.identityId, decisionId, now,
        JSON.stringify({ action: 'REPLY_FEE_VERIFICATION', questionActionId: question.id }), now, now
      ),
    db
      .prepare(
        `UPDATE work_item SET status = 'READY', assignee_identity_id = ?, blocked_reason = ?,
                responsibility_version = responsibility_version + ?, row_version = row_version + 1, gmt_modified = ?
         WHERE id = ? AND row_version = ? AND responsibility_version = ? AND status <> 'COMPLETED'`
      )
      .bind(
        assignee, assignee ? null : 'RESPONSIBILITY_UNRESOLVED', assigneeChanged ? 1 : 0, now,
        row.id, row.row_version, row.responsibility_version
      ),
  ];
  const results = await db.batch(statements);
  if (results[results.length - 1].meta.changes !== 1) {
    throw new ServiceError(409, 40901, '回复条件已变化，未生效');
  }
  return { decisionId, status: 'APPLIED' };
}

// ---------------------------------------------------------------------------
// 核实事实登记
// ---------------------------------------------------------------------------

export type BillingFactsBody = {
  expectedWorkItemVersion: number;
  expectedResponsibilityVersion: number;
  reconciliationId: string;
  facts: unknown;
  questionActionId?: string | null;
  comment?: string | null;
};

export function validateFacts(raw: unknown): { groupId: string | null; description: string; evidenceRefs: unknown[] }[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 100) {
    throw new ServiceError(400, 40001, 'facts 必须为非空数组且不超过 100 项');
  }
  return raw.map((entry, i) => {
    if (!isPlainObject(entry)) throw new ServiceError(400, 40001, `facts[${i}] 必须为对象`);
    const groupId = entry.groupId;
    if (groupId !== null && groupId !== undefined && (typeof groupId !== 'string' || groupId.trim().length === 0)) {
      throw new ServiceError(400, 40001, `facts[${i}].groupId 必须为非空字符串或 null`);
    }
    if (typeof entry.description !== 'string' || entry.description.trim().length === 0) {
      throw new ServiceError(400, 40001, `facts[${i}].description 必填且非空`);
    }
    const evidenceRefs = entry.evidenceRefs;
    if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0) {
      throw new ServiceError(400, 40001, `facts[${i}].evidenceRefs 必须为非空数组`);
    }
    return { groupId: (groupId as string | null | undefined) ?? null, description: entry.description, evidenceRefs };
  });
}

export async function billingFacts(
  db: D1Database,
  identity: ResolvedIdentity,
  row: WorkItemRow,
  idempotencyKey: string,
  body: BillingFactsBody
): Promise<BillingApplied> {
  if (!isPlainObject(body)) throw new ServiceError(400, 40001, '请求正文必须为对象');
  rejectUnknownKeys(body, ['expectedWorkItemVersion', 'expectedResponsibilityVersion', 'reconciliationId', 'facts', 'questionActionId', 'comment']);
  assertVersionInts(body);
  if (typeof body.reconciliationId !== 'string' || body.reconciliationId.trim().length === 0) {
    throw new ServiceError(400, 40001, 'reconciliationId 必填');
  }
  const facts = validateFacts(body.facts);
  let questionActionId: string | null = null;
  if (body.questionActionId !== undefined && body.questionActionId !== null) {
    if (typeof body.questionActionId !== 'string' || body.questionActionId.trim().length === 0) {
      throw new ServiceError(400, 40001, 'questionActionId 必须为非空字符串或 null');
    }
    questionActionId = body.questionActionId;
  }

  const requestKey = `billing-f:${identity.identityId}:${row.id}:${idempotencyKey}`;
  const digest = await sha256Hex(
    stableStringify({
      expectedWorkItemVersion: body.expectedWorkItemVersion,
      expectedResponsibilityVersion: body.expectedResponsibilityVersion,
      reconciliationId: body.reconciliationId,
      facts,
      questionActionId,
      comment: body.comment ?? null,
    })
  );
  const replay = await replayOrNull(db, requestKey, digest);
  if (replay) return replay as unknown as BillingApplied;

  await guardWritable(db, row, body, body.reconciliationId);

  let question: { id: string; reconciliation_id: string } | null = null;
  if (questionActionId) {
    question = await db
      .prepare(
        `SELECT f.id, f.reconciliation_id FROM fee_verification_action f
         JOIN reconciliation_record r ON r.id = f.reconciliation_id
         WHERE f.id = ? AND f.action_kind = 'QUESTION' AND f.is_closed = 0 AND r.work_item_id = ?`
      )
      .bind(questionActionId, row.id)
      .first<{ id: string; reconciliation_id: string }>();
    if (!question) throw new ServiceError(409, 40903, '指定问题组不存在或已关闭，请刷新原事项');
  }

  const contextId = await currentIdentityContextId(db, identity.identityId);
  if (!contextId) throw new ServiceError(401, 40101, '当前身份上下文无效');
  const grants = matchedGrants(identity, row.service_provider_id, REQUEST_ACTIONS);
  if (grants.length === 0) throw new ServiceError(403, 40301, '当前身份无登记核实事实的授权');
  const matchedJson = JSON.stringify(grants.map((g) => g.grantId));

  const decisionId = newId('hd');
  const factId = newId('fa');
  const now = nowMs();
  const contentJson = JSON.stringify({ digest, facts, questionActionId });
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO human_decision
         (id, work_item_id, service_provider_id, origin, action_type, request_key, actor_identity_id, identity_context_id,
          matched_grants_json, expected_work_item_version, expected_responsibility_version, analysis_result_id, confirmed_at,
          content_json, source_system, source_record_type, source_record_id, source_actor_ref_json, gmt_create, gmt_modified)
         VALUES (?, ?, ?, 'LOCAL', 'RECORD_FEE_FACTS', ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`
      )
      .bind(
        decisionId, row.id, row.service_provider_id, requestKey, identity.identityId, contextId, matchedJson,
        body.expectedWorkItemVersion, body.expectedResponsibilityVersion, now, contentJson, now, now
      ),
    db
      .prepare(
        `INSERT INTO fee_verification_action
         (id, human_decision_id, reconciliation_id, action_kind, question_action_id, is_closed, closed_by_kind, closed_by_id, close_basis_json, closed_at, gmt_create, gmt_modified)
         VALUES (?, ?, ?, 'FACT', ?, 0, NULL, NULL, NULL, NULL, ?, ?)`
      )
      .bind(factId, decisionId, body.reconciliationId, questionActionId, now, now),
    db
      .prepare(
        `INSERT INTO activity_record
         (id, work_item_id, event_key, event_type, actor_identity_id, fact_type, fact_id, occurred_at, details_json, gmt_create, gmt_modified)
         VALUES (?, ?, ?, 'DECISION_CONFIRMED', ?, 'HUMAN_DECISION', ?, ?, ?, ?, ?)`
      )
      .bind(
        newId('act'), row.id, `decision:${decisionId}`, identity.identityId, decisionId, now,
        JSON.stringify({ action: 'RECORD_FEE_FACTS', factId, questionActionId }), now, now
      ),
  ];
  if (question) {
    statements.push(
      db
        .prepare(
          `UPDATE fee_verification_action
           SET is_closed = 1, closed_by_kind = 'HUMAN_FACT', closed_by_id = ?,
               close_basis_json = ?, closed_at = ?, gmt_modified = ?
           WHERE id = ? AND action_kind = 'QUESTION' AND is_closed = 0`
        )
        .bind(factId, JSON.stringify({ factId, decisionId, facts }), now, now, question.id)
    );
  }
  statements.push(
    db
      .prepare(
        `UPDATE work_item SET status = CASE WHEN status = 'WAITING_REPLY' THEN 'READY' ELSE status END,
                row_version = row_version + 1, gmt_modified = ?
         WHERE id = ? AND row_version = ? AND responsibility_version = ? AND status <> 'COMPLETED'`
      )
      .bind(now, row.id, row.row_version, row.responsibility_version)
  );

  const results = await db.batch(statements);
  if (results[results.length - 1].meta.changes !== 1) {
    throw new ServiceError(409, 40901, '登记条件已变化，事实未生效');
  }
  return { decisionId, status: 'APPLIED' };
}
