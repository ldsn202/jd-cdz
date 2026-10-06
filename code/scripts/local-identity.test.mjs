import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { identitySql } from './local-identity.mjs';

test('bootstrap preserves immutable history and is idempotent with actual schema triggers', () => {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('../db/migrations/', import.meta.url);
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(file, dir), 'utf8'));
  const context = { identitySource: 'identity_mock', subjectId: 'acc-review-test', subjectType: 'HUMAN', displayName: 'Review', verifiedAt: new Date().toISOString(), validUntil: null, authorizationVersion: '1', sourceIdentities: [], grants: [{ grantId: 'g', businessRole: 'JD_INSTALLATION_REVIEW', actions: ['READ_WORK_ITEM', 'READ_WORK_ORDER'], scope: { scopeType: 'SERVICE_PROVIDER', sourceSystem: null, recordType: null, resourceIds: ['SP-001'] } }] };
  db.exec(identitySql(context)); db.exec(identitySql(context));
  assert.equal(db.prepare('SELECT count(*) n FROM current_identity').get().n, 1);
  assert.equal(db.prepare('SELECT business_role role FROM business_permission').get().role, 'INSTALLATION_REVIEWER');
  const first = db.prepare('SELECT * FROM business_permission').get();
  context.authorizationVersion = '2'; context.grants[0].scope.resourceIds = ['SP-002'];
  db.exec(identitySql(context)); db.exec(identitySql(context));
  assert.equal(db.prepare('SELECT count(*) n FROM current_identity').get().n, 2);
  assert.deepEqual(db.prepare('SELECT * FROM business_permission WHERE id=?').get(first.id), first);
  assert.throws(() => db.exec("UPDATE business_permission SET actions_json='[]'"), /authorization_history_immutable/);
  db.close();
});

test('bootstrap refuses unknown roles instead of granting broader access', () => {
  assert.throws(() => identitySql({ identitySource: 'mock', subjectId: 'unknown', subjectType: 'HUMAN', grants: [{ businessRole: 'ADMIN' }] }), /未登记/);
});
