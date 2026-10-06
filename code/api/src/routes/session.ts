import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import type { Bindings, Variables } from '../index';
import { ERR, fail, newRequestId, ok, parsePage, toIso } from '../lib/contract';
import { visibleProviderIds } from '../services/permission-guard';
import { devTokenMap, resolveIdentity } from '../services/identity';
import { LOCAL_ACCOUNT_COOKIE, localAccountSwitching, localAccounts } from '../services/local-accounts';

const session = new Hono<{ Bindings: Bindings; Variables: Variables }>();

session.use('/session*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  await next();
});

session.get('/session', (c) => {
  const requestId = newRequestId();
  const identity = c.get('identity');
  return ok(
    c,
    {
      identityId: identity.identityId,
      displayName: identity.displayName,
      subjectType: identity.subjectType,
      businessRoles: identity.businessRoles,
      authorizationVersion: identity.authorizationVersion,
      verifiedAt: toIso(identity.verifiedAt),
      accountSwitchingAvailable: identity.subjectType === 'HUMAN' && localAccountSwitching(c.env, c.req.url),
    },
    requestId
  );
});

session.get('/session/accounts', async (c) => {
  const requestId = newRequestId();
  if (!localAccountSwitching(c.env, c.req.url) || c.get('identity').subjectType !== 'HUMAN') {
    return fail(c, 404, ERR.NOT_FOUND, '当前环境不提供账号切换', requestId);
  }
  return ok(c, { list: await localAccounts(c.env) }, requestId);
});

session.post('/session/switch', async (c) => {
  const requestId = newRequestId();
  if (!localAccountSwitching(c.env, c.req.url) || c.get('identity').subjectType !== 'HUMAN') {
    return fail(c, 404, ERR.NOT_FOUND, '当前环境不提供账号切换', requestId);
  }
  if (!c.env.LOCAL_UI_ORIGIN || c.req.header('Origin') !== c.env.LOCAL_UI_ORIGIN) {
    return fail(c, 403, ERR.FORBIDDEN, '账号切换请求来源无效', requestId);
  }
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.accountId !== 'string' || Object.keys(body).length !== 1) {
    return fail(c, 400, ERR.FIELD_INVALID, '请选择有效账号', requestId);
  }
  const token = Object.entries(devTokenMap(c.env)).find(([, subject]) => subject === body.accountId)?.[0];
  const target = token ? await resolveIdentity(c.env.DB, c.env, 'Bearer ' + token) : null;
  if (!target || target.subjectType !== 'HUMAN') {
    return fail(c, 403, ERR.FORBIDDEN, '该账号不可切换', requestId);
  }
  setCookie(c, LOCAL_ACCOUNT_COOKIE, token!, { httpOnly: true, sameSite: 'Strict', path: '/api/admin/charging' });
  return ok(c, { identityId: target.identityId, displayName: target.displayName }, requestId);
});

session.get('/providers', async (c) => {
  const requestId = newRequestId();
  const parsed = parsePage(c, requestId);
  if (parsed instanceof Response) return parsed;
  const { page, pageSize } = parsed;

  const identity = c.get('identity');
  const ids = visibleProviderIds(identity);
  if (ids.length === 0) {
    return ok(c, { list: [], total: 0, page, pageSize }, requestId);
  }

  const keyword = c.req.query('keyword');
  const binds: (string | number)[] = [JSON.stringify(ids)];
  let where = 'id IN (SELECT value FROM json_each(?))';
  if (keyword !== undefined && keyword !== '') {
    where += ' AND (display_name LIKE ? OR id LIKE ?)';
    const like = `%${keyword}%`;
    binds.push(like, like);
  }

  const totalRow = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM service_provider WHERE ${where}`)
    .bind(...binds)
    .first<{ n: number }>();
  const total = totalRow?.n ?? 0;

  const rows = await c.env.DB.prepare(
    `SELECT id, display_name FROM service_provider WHERE ${where}
     ORDER BY gmt_modified DESC, id DESC LIMIT ? OFFSET ?`
  )
    .bind(...binds, pageSize, (page - 1) * pageSize)
    .all<{ id: string; display_name: string | null }>();

  const list = (rows.results ?? []).map((r) => ({ providerId: r.id, displayName: r.display_name ?? '' }));
  return ok(c, { list, total, page, pageSize }, requestId);
});

export default session;
