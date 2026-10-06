import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Bindings, Variables } from '../index';
import { ERR, fail, newRequestId, ok } from '../lib/contract';
import { PendingWriteError, ServiceError } from '../services/change-batch';
import { hasAction } from '../services/permission-guard';
import { providerVisible } from '../services/permission-guard';
import { loadWorkItem } from '../services/work-item-query';
import { acceptUpload, readUploadStatus, UPLOAD_PURPOSES, type UploadInput } from '../services/upload-store';

const uploads = new Hono<{ Bindings: Bindings; Variables: Variables }>();

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

const PURPOSE_ACTION: Record<string, string[]> = {
  INSTALLATION_MATERIAL: ['CONFIRM_INSTALLATION_DRAFT', 'SUBMIT_SUPPLEMENT'],
  PROVIDER_FORMAT: ['ENABLE_INTEGRATION_CONFIG'],
  RECEIVABLE_MATERIAL: ['REPLY_BILLING_VERIFICATION'],
};

function asSingle(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

uploads.post('/uploads', async (c) => {
  const requestId = newRequestId();
  const identity = c.get('identity');
  const idempotencyKey = c.req.header('Idempotency-Key');
  if (!idempotencyKey || idempotencyKey.trim().length === 0) {
    return fail(c, 400, ERR.FIELD_INVALID, 'Idempotency-Key 必填', requestId);
  }

  let form: Record<string, unknown>;
  try {
    form = (await c.req.parseBody()) as Record<string, unknown>;
  } catch {
    return fail(c, 400, ERR.FIELD_INVALID, '请求必须为 multipart/form-data', requestId);
  }
  const file = form.file;
  const providerId = asSingle(form.providerId) ?? '';
  const purpose = asSingle(form.purpose) ?? '';
  const workItemId = asSingle(form.workItemId);
  const configurationId = asSingle(form.configurationId);
  const replacesMaterialVersionId = asSingle(form.replacesMaterialVersionId);
  const expectedRaw = asSingle(form.expectedWorkItemVersion);
  const expectedWorkItemVersion = expectedRaw === undefined ? undefined : Number(expectedRaw);

  if (!(UPLOAD_PURPOSES as readonly string[]).includes(purpose)) {
    return fail(c, 400, ERR.ENUM_INVALID, 'purpose 非法', requestId);
  }
  if (!(file instanceof File) || file.size === 0) {
    return fail(c, 400, ERR.FIELD_INVALID, 'file 必填且字节非空', requestId);
  }
  if (!providerId) return fail(c, 400, ERR.FIELD_INVALID, 'providerId 必填', requestId);
  if (!providerVisible(identity, providerId)) {
    return fail(c, 403, ERR.FORBIDDEN, '无该服务商范围的上传权限', requestId);
  }
  const requiredActions = PURPOSE_ACTION[purpose] ?? [];
  if (!requiredActions.some((a) => hasAction(identity, a, 'SERVICE_PROVIDER', providerId))) {
    return fail(c, 403, ERR.FORBIDDEN, '无该用途所需操作权限', requestId);
  }
  if (workItemId) {
    const row = await loadWorkItem(c.env.DB, identity, workItemId);
    if (!row) return fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', requestId);
    if (row.service_provider_id !== providerId) {
      return fail(c, 403, ERR.FORBIDDEN, '上传服务商与事项归属不一致', requestId);
    }
    if (row.assignee_identity_id !== identity.identityId) {
      return fail(c, 403, ERR.FORBIDDEN, '当前身份不是该事项的资料责任人', requestId);
    }
  } else if (purpose !== 'PROVIDER_FORMAT') {
    return fail(c, 422, ERR.UNPROCESSABLE, '该用途必须指定 workItemId', requestId);
  } else if (!configurationId) {
    return fail(c, 422, ERR.UNPROCESSABLE, '配置资料上传需指定 workItemId 或已知 configurationId', requestId);
  }

  try {
    const result = await acceptUpload(c.env.DB, c.env.FILES, identity, idempotencyKey.trim(), {
      file,
      providerId,
      purpose,
      workItemId,
      configurationId,
      expectedWorkItemVersion,
      replacesMaterialVersionId,
    } as UploadInput);
    return c.json({ code: 0, msg: 'success', requestId, data: result }, 202);
  } catch (e) {
    return handleError(c, requestId, e);
  }
});

uploads.get('/uploads/:uploadId', async (c) => {
  const requestId = newRequestId();
  const identity = c.get('identity');
  const status = await readUploadStatus(c.env.DB, c.req.param('uploadId'));
  if (!status) return fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', requestId);
  if (status.workItemId) {
    const row = await loadWorkItem(c.env.DB, identity, status.workItemId);
    if (!row) return fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', requestId);
  } else if (!providerVisible(identity, status.providerId)) {
    return fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', requestId);
  }

  return ok(
    c,
    {
      uploadId: status.uploadId,
      materialVersionId: status.materialVersionId,
      workItemId: status.workItemId,
      jobId: status.jobId,
      status: status.status,
      issues: status.issues,
    },
    requestId
  );
});

export default uploads;
