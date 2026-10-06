import type { DatabaseSync } from 'node:sqlite';

const legacy = ['acc-jd-review', 'acc-jd-recon', 'acc-jd-coord'];

// Upgrade identity configuration only; original business records and files stay intact.
export function ensureUnifiedJdAccount(db: DatabaseSync): void {
  const read = (kind: string, id: string) => {
    const row = db.prepare('SELECT payload_json FROM source_record WHERE kind=? AND record_id=?').get(kind, id) as { payload_json: string } | undefined;
    return row ? JSON.parse(row.payload_json) : null;
  };
  const oldAccounts = legacy.map(id => read('account', id));
  if (!oldAccounts.every(Boolean)) return;
  const grants = (db.prepare("SELECT payload_json FROM source_record WHERE kind='grant'").all() as { payload_json: string }[]).map(row => JSON.parse(row.payload_json));
  const scopes = legacy.map(id => [...new Set(grants.filter(g => g.accountId === id).flatMap(g => g.scopeProviderIds))].sort());
  if (!scopes[0].length || scopes.some(scope => JSON.stringify(scope) !== JSON.stringify(scopes[0]))) throw Error('京东旧账号业务范围不一致，未自动扩大权限');
  const current = read('account', 'acc-jd-business');
  if (current && current.role !== 'JD_BUSINESS') throw Error('京东合并账号编号已被其他身份使用');
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    if (!current) {
      const insert = db.prepare('INSERT INTO source_record(kind,record_id,source_version,source_updated_at,payload_json) VALUES(?,?,?,?,?)');
      insert.run('account', 'acc-jd-business', 'account-jd-unified-1', now, JSON.stringify({ accountId: 'acc-jd-business', displayName: '京东业务账号', role: 'JD_BUSINESS', serviceProviderId: null, active: true }));
      insert.run('grant', 'grant-acc-jd-business', 'grant-jd-unified-1', now, JSON.stringify({ grantId: 'grant-acc-jd-business', accountId: 'acc-jd-business', scopeProviderIds: scopes[0], role: 'JD_BUSINESS' }));
    }
    for (const account of oldAccounts.filter(a => a.active !== false)) {
      db.prepare("UPDATE source_record SET payload_json=?,source_version='account-merged-1',source_updated_at=? WHERE kind='account' AND record_id=?")
        .run(JSON.stringify({ ...account, active: false, mergedInto: 'acc-jd-business' }), now, account.accountId);
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
