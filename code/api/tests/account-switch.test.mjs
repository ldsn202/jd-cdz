import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDatabase } from './helpers/sqlite-d1.mjs';
import { loadModule } from './helpers/load-app.mjs';

const { default: app } = await loadModule('../../src/index.ts');
function fixture() {
  const db = createDatabase();
  for (const name of ['dev-identity', 'dev-work-items']) db.sqlite.exec(readFileSync(new URL(`../../db/seeds/${name}.sql`, import.meta.url), 'utf8'));
  const env = { DB: db, EXTERNAL_MODE: 'mock', LOCAL_ACCOUNT_SWITCHING: 'true', LOCAL_UI_ORIGIN: 'http://127.0.0.1:5174', DEV_IDENTITY_TOKENS: JSON.stringify({ review: 'jd-review-1', clerk: 'provider-clerk-1', service: 'svc-jd-charging', absent: 'missing' }) };
  const call = (path, options = {}) => app.request('http://127.0.0.1/api/admin/charging' + path, { ...options, headers: { authorization: 'Bearer review', ...options.headers } }, env);
  const choose = accountId => call('/session/switch', { method: 'POST', headers: { Origin: env.LOCAL_UI_ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ accountId }) });
  return { db, env, call, choose };
}

test('switching lists only configured valid human accounts without credentials', async () => {
  const f = fixture(); try {
    const response = await f.call('/session/accounts');
    const body = await response.json();
    assert.deepEqual(body.data.list.map(a => a.accountId).sort(), ['jd-review-1', 'provider-clerk-1']);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.ok(body.data.list.every(a => !('token' in a) && a.businessRoles.length > 0));
  } finally { f.db.close(); }
});

test('selected session survives subsequent requests and preserves provider permissions', async () => {
  const f = fixture(); try {
    const response = await f.choose('provider-clerk-1');
    assert.equal(response.status, 200);
    const setCookie = response.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /SameSite=Strict/);
    const headers = { Cookie: setCookie.split(';')[0] };
    const get = async path => (await app.request('http://127.0.0.1/api/admin/charging' + path, { headers }, f.env)).json();
    assert.equal((await get('/session')).data.identityId, 'ir-dev-provider-clerk');
    assert.deepEqual((await get('/session')).data.businessRoles, ['PROVIDER_DOCUMENT_CLERK']);
    const orders = (await get('/work-orders')).data;
    assert.ok(orders.list.length > 0);
    assert.ok(orders.list.every(o => o.providerId === 'provider-dev-b'));
    const other = (await (await f.call('/work-orders')).json()).data.list.find(o => o.providerId === 'provider-dev-a');
    assert.ok(other);
    assert.equal((await get('/work-orders/' + other.workOrderId)).code, 40404);
  } finally { f.db.close(); }
});

test('switching rejects service identities, unknown accounts and foreign origins', async () => {
  const f = fixture(); try {
    for (const id of ['svc-jd-charging', 'missing', 'unknown']) {
      const response = await f.choose(id);
      assert.equal(response.status, 403); assert.equal(response.headers.get('set-cookie'), null);
    }
    const forbidden = await f.call('/session/switch', { method: 'POST', headers: { Origin: 'https://untrusted.example', 'content-type': 'application/json' }, body: JSON.stringify({ accountId: 'provider-clerk-1' }) });
    assert.equal(forbidden.status, 403);
    const forged = await f.call('/session/switch', { method: 'POST', headers: { Origin: f.env.LOCAL_UI_ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ accountId: 'provider-clerk-1', businessRoles: ['INSTALLATION_REVIEWER'] }) });
    assert.equal(forged.status, 400);
  } finally { f.db.close(); }
});

test('switching is unavailable without local opt-in or with real external systems', async () => {
  const f = fixture(); try {
    delete f.env.LOCAL_ACCOUNT_SWITCHING;
    assert.equal((await f.call('/session/accounts')).status, 404);
    assert.equal((await f.choose('provider-clerk-1')).status, 404);
    f.env.LOCAL_ACCOUNT_SWITCHING = 'true'; f.env.EXTERNAL_MODE = 'real';
    assert.equal((await f.call('/session/accounts')).status, 404);
    assert.equal((await f.choose('provider-clerk-1')).status, 404);
    f.env.EXTERNAL_MODE = 'mock';
    assert.equal((await app.request('http://public.example/api/admin/charging/session/accounts', { headers: { authorization: 'Bearer review' } }, f.env)).status, 404);
  } finally { f.db.close(); }
});

test('invalid or service cookies never fall back to another account', async () => {
  const f = fixture(); try {
    for (const token of ['invalid', 'service']) {
      const response = await app.request('http://127.0.0.1/api/admin/charging/session', { headers: { Cookie: 'jd-charging-account=' + token } }, f.env);
      assert.equal(response.status, 401);
    }
  } finally { f.db.close(); }
});
