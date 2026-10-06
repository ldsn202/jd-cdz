import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Bindings, Variables } from '../index';
import { ERR, fail, newRequestId, ok } from '../lib/contract';
import { PendingWriteError, ServiceError } from '../services/change-batch';
import { hasAction } from '../services/permission-guard';
import { loadWorkItem } from '../services/work-item-query';
import { readDraftView, saveHumanDraft, type SaveDraftBody } from '../services/installation-draft';
import { submitInstallationDetail, type SubmitBody } from '../services/installation-submit';

const installation = new Hono<{ Bindings: Bindings; Variables: Variables }>();

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

installation.get('/work-items/:workItemId/installation-draft', async (c) => {
  const requestId = newRequestId();
  const identity = c.get('identity');
  const row = await loadWorkItem(c.env.DB, identity, c.req.param('workItemId'));
  if (!row) return fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', requestId);
  if (!hasAction(identity, 'READ_SOURCE_MATERIAL', 'SERVICE_PROVIDER', row.service_provider_id)) {
    return fail(c, 403, ERR.FORBIDDEN, '无该服务商范围的原材料读取权限', requestId);
  }
  const view = await readDraftView(c.env.DB, row.id);
  return ok(
    c,
    {
      draftId: view.draftId,
      draftVersionId: view.draftVersionId,
      versionNo: view.versionNo,
      origin: view.origin,
      editorIdentityId: view.editorIdentityId,
      rowVersion: row.row_version,
      contextSnapshotId: view.contextSnapshotId,
      analysisResultId: view.analysisResultId,
      items: view.items,
      sourceMaterials: view.sourceMaterials,
      openQuestions: view.openQuestions,
      editNotes: view.editNotes,
    },
    requestId
  );
});

installation.put('/work-items/:workItemId/installation-draft', async (c) => {
  const requestId = newRequestId();
  const identity = c.get('identity');
  const idempotencyKey = c.req.header('Idempotency-Key');
  if (!idempotencyKey || idempotencyKey.trim().length === 0) {
    return fail(c, 400, ERR.FIELD_INVALID, 'Idempotency-Key 必填', requestId);
  }
  const row = await loadWorkItem(c.env.DB, identity, c.req.param('workItemId'));
  if (!row) return fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', requestId);
  if (!hasAction(identity, 'CONFIRM_INSTALLATION_DRAFT', 'SERVICE_PROVIDER', row.service_provider_id)) {
    return fail(c, 403, ERR.FORBIDDEN, '无该服务商范围的草稿确认权限', requestId);
  }
  if (row.assignee_identity_id !== identity.identityId) {
    return fail(c, 403, ERR.FORBIDDEN, '当前身份不是该事项的资料责任人', requestId);
  }
  const parsed = await parseJson(c, requestId);
  if (parsed instanceof Response) return parsed;
  try {
    const result = await saveHumanDraft(
      c.env.DB,
      identity,
      row,
      idempotencyKey.trim(),
      parsed as SaveDraftBody
    );
    return ok(c, result, requestId);
  } catch (e) {
    return handleError(c, requestId, e);
  }
});

installation.post('/work-items/:workItemId/installation-submissions', async (c) => {
  const requestId = newRequestId();
  const identity = c.get('identity');
  const idempotencyKey = c.req.header('Idempotency-Key');
  if (!idempotencyKey || idempotencyKey.trim().length === 0) {
    return fail(c, 400, ERR.FIELD_INVALID, 'Idempotency-Key 必填', requestId);
  }
  const row = await loadWorkItem(c.env.DB, identity, c.req.param('workItemId'));
  if (!row) return fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', requestId);
  if (row.item_kind !== 'INSTALLATION_PREPARATION') {
    return fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', requestId);
  }
  const canConfirm = hasAction(identity, 'CONFIRM_INSTALLATION_DRAFT', 'SERVICE_PROVIDER', row.service_provider_id);
  const canSubmit = hasAction(identity, 'SUBMIT_INSTALLATION_DETAIL', 'SERVICE_PROVIDER', row.service_provider_id);
  if (!canConfirm || !canSubmit) {
    return fail(c, 403, ERR.FORBIDDEN, '无该服务商范围的提交权限', requestId);
  }
  if (row.assignee_identity_id !== identity.identityId) {
    return fail(c, 403, ERR.FORBIDDEN, '当前身份不是该事项的资料责任人', requestId);
  }
  const parsed = await parseJson(c, requestId);
  if (parsed instanceof Response) return parsed;
  try {
    const result = await submitInstallationDetail(
      c.env.DB,
      identity,
      row,
      idempotencyKey.trim(),
      parsed as SubmitBody
    );
    return c.json({ code: 0, msg: 'success', requestId, data: result }, 202);
  } catch (e) {
    return handleError(c, requestId, e);
  }
});

export default installation;
