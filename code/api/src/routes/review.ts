import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Bindings, Variables } from '../index';
import { ERR, fail, newRequestId, ok } from '../lib/contract';
import { PendingWriteError, ServiceError } from '../services/change-batch';
import { hasAction } from '../services/permission-guard';
import { loadWorkItem } from '../services/work-item-query';
import { reviewDecision, type ReviewDecisionBody } from '../services/review-decision';
import { submitSupplement, type SupplementBody } from '../services/supplement-sync';
import {createExternalClient} from '../services/external';

const review = new Hono<{ Bindings: Bindings; Variables: Variables }>();

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

async function loadReviewItem(c: Context, requestId: string, action: string) {
  const identity = c.get('identity');
  const row = await loadWorkItem(c.env.DB, identity, c.req.param('workItemId') ?? '');
  if (!row || row.item_kind !== 'INSTALLATION_REVIEW') {
    return { error: fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', requestId) } as const;
  }
  if (!hasAction(identity, action, 'SERVICE_PROVIDER', row.service_provider_id)) {
    return { error: fail(c, 403, ERR.FORBIDDEN, '无该服务商范围的核查操作权限', requestId) } as const;
  }
  if (row.assignee_identity_id !== identity.identityId) {
    return { error: fail(c, 403, ERR.FORBIDDEN, '当前身份不是该事项的具体责任人', requestId) } as const;
  }
  return { row, identity } as const;
}

review.post('/work-items/:workItemId/review-decisions', async (c) => {
  const requestId = newRequestId();
  const idempotencyKey = c.req.header('Idempotency-Key');
  if (!idempotencyKey || idempotencyKey.trim().length === 0) {
    return fail(c, 400, ERR.FIELD_INVALID, 'Idempotency-Key 必填', requestId);
  }
  const loaded = await loadReviewItem(c, requestId, 'DECIDE_INSTALLATION_REVIEW');
  if ('error' in loaded) return loaded.error;
  const parsed = await parseJson(c, requestId);
  if (parsed instanceof Response) return parsed;
  try {
    const result = await reviewDecision(c.env.DB, loaded.identity, loaded.row, idempotencyKey.trim(), parsed as ReviewDecisionBody);
    return c.json({ code: 0, msg: 'success', requestId, data: result }, 202);
  } catch (e) {
    return handleError(c, requestId, e);
  }
});

review.post('/work-items/:workItemId/supplements', async (c) => {
  const requestId = newRequestId();
  const idempotencyKey = c.req.header('Idempotency-Key');
  if (!idempotencyKey || idempotencyKey.trim().length === 0) {
    return fail(c, 400, ERR.FIELD_INVALID, 'Idempotency-Key 必填', requestId);
  }
  const loaded = await loadReviewItem(c, requestId, 'SUBMIT_SUPPLEMENT');
  if ('error' in loaded) return loaded.error;
  const parsed = await parseJson(c, requestId);
  if (parsed instanceof Response) return parsed;
  try {
    const result = await submitSupplement(c.env.DB, loaded.identity, loaded.row, idempotencyKey.trim(), parsed as SupplementBody,
      orderId=>createExternalClient(c.env).workOrderContext.getContext(orderId));
    return c.json({ code: 0, msg: 'success', requestId, data: result }, 202);
  } catch (e) {
    return handleError(c, requestId, e);
  }
});

export default review;
