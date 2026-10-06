import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Bindings, Variables } from '../index';
import { ERR, fail, newRequestId, ok } from '../lib/contract';
import { PendingWriteError, ServiceError } from '../services/change-batch';
import { hasAction } from '../services/permission-guard';
import { loadWorkItem, type WorkItemRow } from '../services/work-item-query';
import { readConfigurationView, loadTrialView } from '../services/config-trial';
import { saveConfigurationDraft, type ConfigurationDraftBody } from '../services/config-draft';
import { enableConfiguration, type EnablementBody } from '../services/config-enablement';

const configuration = new Hono<{ Bindings: Bindings; Variables: Variables }>();
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

async function requireResponsible(
  c: AppContext,
  requestId: string,
  idempotencyKey?: string
): Promise<{ row: WorkItemRow } | Response> {
  const identity = c.get('identity');
  const row = await loadWorkItem(c.env.DB, identity, c.req.param('workItemId') ?? '');
  if (!row || row.item_kind !== 'CONFIGURATION') {
    return fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', requestId);
  }
  if (!hasAction(identity, 'ENABLE_INTEGRATION_CONFIG', 'SERVICE_PROVIDER', row.service_provider_id)) {
    return fail(c, 403, ERR.FORBIDDEN, '无该服务商范围的接入配置权限', requestId);
  }
  if (row.assignee_identity_id !== identity.identityId) {
    if (!idempotencyKey) return fail(c, 403, ERR.FORBIDDEN, '当前身份不是该事项的具体责任人', requestId);
    const prior = await c.env.DB
      .prepare(
        `SELECT 1 AS hit FROM human_decision WHERE origin = 'LOCAL'
         AND request_key IN (?, ?) LIMIT 1`
      )
      .bind(
        `cfg-draft:${identity.identityId}:${row.id}:${idempotencyKey}`,
        `cfg-enable:${identity.identityId}:${row.id}:${idempotencyKey}`
      )
      .first<{ hit: number }>();
    if (!prior) return fail(c, 403, ERR.FORBIDDEN, '当前身份不是该事项的具体责任人', requestId);
  }
  return { row };
}

configuration.get('/work-items/:workItemId/configuration', async (c) => {
  const requestId = newRequestId();
  const identity = c.get('identity');
  const row = await loadWorkItem(c.env.DB, identity, c.req.param('workItemId') ?? '');
  if (!row || row.item_kind !== 'CONFIGURATION') {
    return fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', requestId);
  }
  if (!hasAction(identity, 'READ_SOURCE_MATERIAL', 'SERVICE_PROVIDER', row.service_provider_id)) {
    return fail(c, 403, ERR.FORBIDDEN, '无该服务商范围的资料读取权限', requestId);
  }
  const view = await readConfigurationView(c.env.DB, row);
  return ok(c, view, requestId);
});

configuration.put('/work-items/:workItemId/configuration-draft', async (c) => {
  const requestId = newRequestId();
  const key = c.req.header('Idempotency-Key');
  if (!key || key.trim().length === 0) return fail(c, 400, ERR.FIELD_INVALID, 'Idempotency-Key 必填', requestId);
  const loaded = await requireResponsible(c, requestId, key.trim());
  if (loaded instanceof Response) return loaded;
  const body = await parseJson(c, requestId);
  if (body instanceof Response) return body;
  try {
    const result = await saveConfigurationDraft(
      c.env.DB,
      c.get('identity'),
      loaded.row,
      key.trim(),
      body as ConfigurationDraftBody
    );
    return c.json({ code: 0, msg: 'success', requestId, data: result }, 202);
  } catch (e) {
    return handleError(c, requestId, e);
  }
});

configuration.get('/configuration-trials/:trialId', async (c) => {
  const requestId = newRequestId();
  const identity = c.get('identity');
  const trialId = c.req.param('trialId') ?? '';
  const trial = await loadTrialView(c.env.DB, trialId);
  if (!trial) return fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', requestId);
  const version = await c.env.DB
    .prepare(
      `SELECT v.work_item_id, c.service_provider_id FROM integration_config_version v
       JOIN integration_config c ON c.id = v.integration_config_id WHERE v.id = ?`
    )
    .bind(trial.configurationVersionId)
    .first<{ work_item_id: string; service_provider_id: string }>();
  if (!version) return fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', requestId);
  const row = await loadWorkItem(c.env.DB, identity, version.work_item_id);
  if (!row || !hasAction(identity, 'READ_SOURCE_MATERIAL', 'SERVICE_PROVIDER', version.service_provider_id)) {
    return fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', requestId);
  }
  return ok(c, trial, requestId);
});

configuration.post('/work-items/:workItemId/configuration-enablement', async (c) => {
  const requestId = newRequestId();
  const key = c.req.header('Idempotency-Key');
  if (!key || key.trim().length === 0) return fail(c, 400, ERR.FIELD_INVALID, 'Idempotency-Key 必填', requestId);
  const loaded = await requireResponsible(c, requestId, key.trim());
  if (loaded instanceof Response) return loaded;
  const body = await parseJson(c, requestId);
  if (body instanceof Response) return body;
  try {
    const result = await enableConfiguration(
      c.env.DB,
      c.get('identity'),
      loaded.row,
      key.trim(),
      body as EnablementBody
    );
    return ok(c, result, requestId);
  } catch (e) {
    return handleError(c, requestId, e);
  }
});

export default configuration;
