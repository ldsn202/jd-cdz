import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { validateConfig } from '../../mocks/generator/config.ts';
import { buildProviders } from '../../mocks/generator/providers.ts';
import { buildBusinessFacts } from '../../mocks/generator/business-facts.ts';
import { createDatabase } from './helpers/sqlite-d1.mjs';
import { ensureUnifiedJdAccount } from '../../mocks/identity/unified-jd-account.ts';
import { buildCurrentContext } from '../../mocks/identity/current-context.ts';
import { createSession, resolveAuth, hasAction } from '../../mocks/identity/sessions.ts';
import { JD_BUSINESS_ROLES, ROLE_ACTIONS } from '../../mocks/identity/roles.ts';
import { identitySql } from '../../scripts/local-identity.mjs';
import { JD_ACCOUNT, LEGACY_JD_ACCOUNTS, canonicalAccount, mergeJdIdentitiesSql } from '../../scripts/merge-jd-identities.mjs';
import { resolveResponsibility } from '../src/services/responsibility.ts';

function sources(mismatch = false) {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE source_record(kind TEXT,record_id TEXT,source_version TEXT,source_updated_at TEXT,payload_json TEXT,PRIMARY KEY(kind,record_id))');
  const insert = db.prepare('INSERT INTO source_record VALUES(?,?,?,?,?)');
  LEGACY_JD_ACCOUNTS.forEach((id, i) => {
    insert.run('account', id, 'v1', '2026-09-01', JSON.stringify({ accountId: id, displayName: id, role: JD_BUSINESS_ROLES[i], active: true }));
    insert.run('grant', 'grant-' + id, 'v1', '2026-09-01', JSON.stringify({ accountId: id, grantId: 'grant-' + id, scopeProviderIds: mismatch && i === 1 ? ['SP-002'] : ['SP-001'] }));
  });
  return db;
}
function auth(db, id) {
  const session = createSession(db, id, null);
  assert.ok(session.token);
  const result = resolveAuth(db, 'Bearer ' + session.token);
  assert.equal(result.ok, true);
  return result;
}

test('first-time source generation provides the unified JD account for all providers', () => {
  const config = validateConfig(JSON.parse(readFileSync(new URL('../../mocks/generator/configs/standard.json', import.meta.url), 'utf8')));
  const providers = buildProviders(config);
  const facts = buildBusinessFacts(config, providers);
  assert.equal(facts.accounts.filter(a => a.role === 'JD_BUSINESS').length, 1);
  assert.ok(facts.accounts.every(a => !LEGACY_JD_ACCOUNTS.includes(a.accountId)));
  assert.deepEqual(facts.accounts.find(a => a.accountId === JD_ACCOUNT).scopeProviderIds.sort(), providers.map(p => p.providerId).sort());
  const providerAccounts = facts.accounts.filter(a => a.accountId.startsWith('acc-sp-'));
  assert.equal(providerAccounts.length, 10);
  assert.ok(providerAccounts.every(a => a.role === 'PROVIDER_BUSINESS' && a.scopeProviderIds.length === 1 && a.scopeProviderIds[0] === a.serviceProviderId));
  assert.equal(facts.accounts.some(a => a.accountId === 'acc-jd-config'), false);
});

test('source upgrade merges three permissions, keeps scope and is repeatable', () => {
  const db = sources();
  try {
    ensureUnifiedJdAccount(db);
    const first = db.prepare('SELECT * FROM source_record ORDER BY kind,record_id').all();
    ensureUnifiedJdAccount(db);
    assert.deepEqual(db.prepare('SELECT * FROM source_record ORDER BY kind,record_id').all(), first);
    const a = auth(db, JD_ACCOUNT);
    const context = buildCurrentContext(db, a.account, a.grants);
    assert.deepEqual(context.grants.map(g => g.businessRole), JD_BUSINESS_ROLES);
    for (const action of ['DECIDE_INSTALLATION_REVIEW', 'REQUEST_BILLING_VERIFICATION', 'COMPLETE_FULFILLMENT_COORDINATION', 'READ_WORK_ORDER', 'READ_BILLING_RECORD']) {
      assert.equal(hasAction(a, action, 'SP-001', ROLE_ACTIONS), true);
      assert.equal(hasAction(a, action, 'SP-002', ROLE_ACTIONS), false);
    }
    assert.equal(hasAction(a, 'SUBMIT_INSTALLATION_DETAIL', 'SP-001', ROLE_ACTIONS), false);
    for (const id of LEGACY_JD_ACCOUNTS) {
      assert.equal(createSession(db, id, null).http, 403);
      assert.equal(canonicalAccount(id), JD_ACCOUNT);
    }
    assert.equal(canonicalAccount('acc-sp-001'), 'acc-sp-001');
  } finally { db.close(); }
});

test('source upgrade rejects unequal scopes without changing existing accounts', () => {
  const db = sources(true);
  try {
    const before = db.prepare('SELECT * FROM source_record').all();
    assert.throws(() => ensureUnifiedJdAccount(db), /业务范围不一致/);
    assert.deepEqual(db.prepare('SELECT * FROM source_record').all(), before);
  } finally { db.close(); }
});

test('existing responsibilities move once, completed history stays and future work uses the unified account', async () => {
  const source = sources(), db = createDatabase();
  try {
    for (const id of LEGACY_JD_ACCOUNTS) {
      const a = auth(source, id);
      db.sqlite.exec(identitySql(buildCurrentContext(source, a.account, a.grants)));
    }
    ensureUnifiedJdAccount(source);
    const a = auth(source, JD_ACCOUNT);
    db.sqlite.exec(identitySql(buildCurrentContext(source, a.account, a.grants)));
    const insert = db.sqlite.prepare(`INSERT INTO work_item(id,service_provider_id,installation_work_order_id,item_kind,business_key,business_identity_json,creation_key,title,status,assignee_identity_id,completion_code,completion_basis_json,completed_at,gmt_create,gmt_modified)
      VALUES(?, 'SP-001', 'WO-1', ?, ?, '["test"]', ?, '待办', ?, ?, ?, ?, ?, 1, 1)`);
    LEGACY_JD_ACCOUNTS.forEach((id, i) => insert.run('item-' + i, ['INSTALLATION_REVIEW', 'RECONCILIATION', 'COORDINATION'][i], 'key-' + i, 'create-' + i, 'PREPARING', 'local:' + id, null, null, null));
    insert.run('done', 'COORDINATION', 'done-key', 'done-create', 'COMPLETED', 'local:acc-jd-coord', 'COORDINATION_RESOLVED', '{}', 1);
    const completed = db.sqlite.prepare("SELECT * FROM work_item WHERE id='done'").get();
    db.sqlite.exec(`BEGIN;${mergeJdIdentitiesSql()}COMMIT;`);
    const items = db.sqlite.prepare("SELECT assignee_identity_id,row_version,responsibility_version FROM work_item WHERE status<>'COMPLETED'").all();
    assert.equal(items.length, 3);
    assert.ok(items.every(i => i.assignee_identity_id === 'local:' + JD_ACCOUNT && i.row_version === 2 && i.responsibility_version === 2));
    assert.deepEqual(db.sqlite.prepare("SELECT * FROM work_item WHERE id='done'").get(), completed);
    const events = db.sqlite.prepare('SELECT * FROM activity_record').all();
    assert.equal(events.length, 3);
    assert.ok(events.every(e => LEGACY_JD_ACCOUNTS.some(id => JSON.parse(e.details_json).fromIdentityId === 'local:' + id)));
    db.sqlite.exec(`BEGIN;${mergeJdIdentitiesSql()}COMMIT;`);
    assert.deepEqual(db.sqlite.prepare("SELECT assignee_identity_id,row_version,responsibility_version FROM work_item WHERE status<>'COMPLETED'").all(), items);
    assert.deepEqual(db.sqlite.prepare('SELECT * FROM activity_record').all(), events);
    for (const action of ['DECIDE_INSTALLATION_REVIEW', 'REQUEST_BILLING_VERIFICATION', 'COMPLETE_FULFILLMENT_COORDINATION']) {
      assert.equal(await resolveResponsibility(db, 'SP-001', action), 'local:' + JD_ACCOUNT);
      assert.equal(await resolveResponsibility(db, 'SP-002', action), null);
    }
  } finally { source.close(); db.close(); }
});
