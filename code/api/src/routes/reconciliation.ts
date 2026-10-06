import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Bindings, Variables } from '../index';
import { ERR, fail, newRequestId, ok } from '../lib/contract';
import { PendingWriteError, ServiceError } from '../services/change-batch';
import { hasAction } from '../services/permission-guard';
import type { ResolvedIdentity } from '../services/identity';
import { loadWorkItem } from '../services/work-item-query';
import type { WorkItemRow } from '../services/work-item-query';
import { billingReadable } from '../services/reconciliation-summary';
import { readReconciliation } from '../services/reconciliation-read';
import {
  billingFacts,
  billingQuestions,
  billingReply,
  hasPriorBillingDecision,
  type BillingFactsBody,
  type BillingQuestionsBody,
  type BillingReplyBody,
} from '../services/billing-exchange';

const reconciliation = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function handleError(c: Context, requestId: string, e: unknown) {
  if (e instanceof PendingWriteError) {
    return c.json(
      { code: ERR.PENDING_WRITE, msg: e.message, requestId, data: null, pendingOperation: e.pendingOperation },
      409 as 400
    );
  }
  if (e instanceof ServiceError) return fail(c, e.httpStatus, e.code, e.message, requestId);
  throw e;
}

async function parseJson(c: Context, requestId: string): Promise<unknown | Response> {
  try {
    return await c.req.json();
  } catch {
    return fail(c, 400, ERR.FIELD_INVALID, '请求正文必须为合法 JSON 对象', requestId);
  }
}

function requireIdempotency(c: Context, requestId: string): string | Response {
  const key = c.req.header('Idempotency-Key');
  if (!key || key.trim().length === 0) return fail(c, 400, ERR.FIELD_INVALID, 'Idempotency-Key 必填', requestId);
  return key.trim();
}

reconciliation.get('/work-items/:workItemId/reconciliation', async (c) => {
  const requestId = newRequestId();
  const identity = c.get('identity');
  const row = await loadWorkItem(c.env.DB, identity, c.req.param('workItemId') ?? '');
  if (!row || row.item_kind !== 'RECONCILIATION' || !billingReadable(identity, row.service_provider_id)) {
    return fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', requestId);
  }
  const view = await readReconciliation(c.env.DB, row.id, row.current_reconciliation_id, row.row_version);
  return ok(c, view, requestId);
});

async function requireResponsible(
  c: Context,
  requestId: string,
  action: string,
  idempotencyKey: string
): Promise<{ row: WorkItemRow; identity: ResolvedIdentity } | Response> {
  const identity = c.get('identity');
  const row = await loadWorkItem(c.env.DB, identity, c.req.param('workItemId') ?? '');
  if (!row || row.item_kind !== 'RECONCILIATION') {
    return fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', requestId);
  }
  if (!billingReadable(identity, row.service_provider_id) || !hasAction(identity, action, 'SERVICE_PROVIDER', row.service_provider_id)) {
    return fail(c, 403, ERR.FORBIDDEN, '无该服务商范围的对账操作权限', requestId);
  }
  if (row.assignee_identity_id !== identity.identityId) {
    const replay = await hasPriorBillingDecision(c.env.DB, identity.identityId, row.id, idempotencyKey);
    if (!replay) return fail(c, 403, ERR.FORBIDDEN, '当前身份不是该事项的具体责任人', requestId);
  }
  return { row, identity };
}

reconciliation.post('/work-items/:workItemId/billing-questions', async (c) => {
  const requestId = newRequestId();
  const key = requireIdempotency(c, requestId);
  if (key instanceof Response) return key;
  const loaded = await requireResponsible(c, requestId, 'REQUEST_BILLING_VERIFICATION', key);
  if (loaded instanceof Response) return loaded;
  const body = await parseJson(c, requestId);
  if (body instanceof Response) return body;
  try {
    const result = await billingQuestions(c.env.DB, loaded.identity, loaded.row, key, body as BillingQuestionsBody);
    return ok(c, result, requestId);
  } catch (e) {
    return handleError(c, requestId, e);
  }
});

reconciliation.post('/work-items/:workItemId/billing-replies', async (c) => {
  const requestId = newRequestId();
  const key = requireIdempotency(c, requestId);
  if (key instanceof Response) return key;
  const loaded = await requireResponsible(c, requestId, 'REPLY_BILLING_VERIFICATION', key);
  if (loaded instanceof Response) return loaded;
  const body = await parseJson(c, requestId);
  if (body instanceof Response) return body;
  try {
    const result = await billingReply(c.env.DB, loaded.identity, loaded.row, key, body as BillingReplyBody);
    return ok(c, result, requestId);
  } catch (e) {
    return handleError(c, requestId, e);
  }
});

reconciliation.post('/work-items/:workItemId/billing-facts', async (c) => {
  const requestId = newRequestId();
  const key = requireIdempotency(c, requestId);
  if (key instanceof Response) return key;
  const loaded = await requireResponsible(c, requestId, 'REQUEST_BILLING_VERIFICATION', key);
  if (loaded instanceof Response) return loaded;
  const body = await parseJson(c, requestId);
  if (body instanceof Response) return body;
  try {
    const result = await billingFacts(c.env.DB, loaded.identity, loaded.row, key, body as BillingFactsBody);
    return ok(c, result, requestId);
  } catch (e) {
    return handleError(c, requestId, e);
  }
});

export default reconciliation;
