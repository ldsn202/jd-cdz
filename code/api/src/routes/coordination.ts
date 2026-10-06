import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Bindings, Variables } from '../index';
import { ERR, fail, newRequestId, ok } from '../lib/contract';
import { PendingWriteError, ServiceError } from '../services/change-batch';
import { loadWorkItem, type WorkItemRow } from '../services/work-item-query';
import {
  completeCoordination,
  saveProgress,
  type CoordinationCompletionBody,
  type ProgressBody,
} from '../services/coordination-progress';
import {
  openException,
  resolveException,
  stopWork,
  type ExceptionOpenBody,
  type ExceptionResolutionBody,
  type StopBody,
} from '../services/exception-flow';

const coordination = new Hono<{ Bindings: Bindings; Variables: Variables }>();
type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

function handleError(c: AppContext, requestId: string, e: unknown) {
  if (e instanceof PendingWriteError) {
    return c.json(
      { code: ERR.PENDING_WRITE, msg: e.message, requestId, data: null, pendingOperation: e.pendingOperation },
      409 as 400
    );
  }
  if (e instanceof ServiceError) return fail(c, e.httpStatus, e.code, e.message, requestId);
  throw e;
}

async function parseJson(c: AppContext, requestId: string): Promise<unknown | Response> {
  try {
    return await c.req.json();
  } catch {
    return fail(c, 400, ERR.FIELD_INVALID, '请求正文必须为合法 JSON 对象', requestId);
  }
}

type Handler = (
  db: D1Database,
  identity: Variables['identity'],
  row: WorkItemRow,
  key: string,
  body: unknown
) => Promise<unknown>;

async function post(c: AppContext, requestId: string, handler: Handler): Promise<Response> {
  const key = c.req.header('Idempotency-Key');
  if (!key || key.trim().length === 0) return fail(c, 400, ERR.FIELD_INVALID, 'Idempotency-Key 必填', requestId);
  const row = await loadWorkItem(c.env.DB, c.get('identity'), c.req.param('workItemId') ?? '');
  if (!row) return fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', requestId);
  const body = await parseJson(c, requestId);
  if (body instanceof Response) return body;
  try {
    const result = await handler(c.env.DB, c.get('identity'), row, key.trim(), body);
    return ok(c, result, requestId);
  } catch (e) {
    return handleError(c, requestId, e);
  }
}

coordination.post('/work-items/:workItemId/progress', (c) => {
  const requestId = newRequestId();
  return post(c, requestId, (db, identity, row, key, body) =>
    saveProgress(db, identity, row, key, body as ProgressBody)
  );
});

coordination.post('/work-items/:workItemId/exceptions', (c) => {
  const requestId = newRequestId();
  return post(c, requestId, (db, identity, row, key, body) =>
    openException(db, identity, row, key, body as ExceptionOpenBody)
  );
});

coordination.post('/work-items/:workItemId/coordination-completion', (c) => {
  const requestId = newRequestId();
  return post(c, requestId, (db, identity, row, key, body) =>
    completeCoordination(db, identity, row, key, body as CoordinationCompletionBody)
  );
});

coordination.post('/work-items/:workItemId/exception-resolution', (c) => {
  const requestId = newRequestId();
  return post(c, requestId, (db, identity, row, key, body) =>
    resolveException(db, identity, row, key, body as ExceptionResolutionBody)
  );
});

coordination.post('/work-items/:workItemId/stop-decisions', (c) => {
  const requestId = newRequestId();
  return post(c, requestId, (db, identity, row, key, body) =>
    stopWork(db, identity, row, key, body as StopBody)
  );
});

export default coordination;
