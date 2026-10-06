import type { DatabaseSync } from 'node:sqlite';
import { PROVIDER_BUSINESS_ROLES } from './roles.ts';

// Only upgrade the standard per-company accounts; keep stable IDs and historical records.
export function ensureUnifiedProviderAccounts(db: DatabaseSync): void {
  const records = (kind: string): any[] => (db.prepare('SELECT payload_json FROM source_record WHERE kind=?').all(kind) as { payload_json: string }[]).map(row => JSON.parse(row.payload_json));
  const accounts = records('account');
  const providers = accounts.filter(a => typeof a.serviceProviderId === 'string' && a.accountId === 'acc-' + a.serviceProviderId.toLowerCase());
  const grants = records('grant');
  for (const a of providers) {
    if (![...PROVIDER_BUSINESS_ROLES, 'PROVIDER_BUSINESS'].includes(a.role)) throw Error('服务商账号角色不匹配：' + a.accountId);
    const own = grants.filter(g => g.accountId === a.accountId);
    if (!own.length || own.some(g => !Array.isArray(g.scopeProviderIds) || g.scopeProviderIds.length !== 1 || g.scopeProviderIds[0] !== a.serviceProviderId)) {
      throw Error('服务商账号范围必须仅包含本公司：' + a.accountId);
    }
  }
  const now = new Date().toISOString();
  const update = db.prepare('UPDATE source_record SET payload_json=?,source_version=?,source_updated_at=? WHERE kind=? AND record_id=?');
  db.exec('BEGIN');
  try {
    for (const a of providers) {
      if (a.role !== 'PROVIDER_BUSINESS') update.run(JSON.stringify({ ...a, role: 'PROVIDER_BUSINESS', displayName: a.displayName.replace(/资料账号$/, '账号') }), 'account-provider-unified-1', now, 'account', a.accountId);
      for (const g of grants.filter(g => g.accountId === a.accountId && g.role !== 'PROVIDER_BUSINESS')) {
        update.run(JSON.stringify({ ...g, role: 'PROVIDER_BUSINESS' }), 'grant-provider-unified-1', now, 'grant', g.grantId);
      }
    }
    const retired = accounts.find(a => a.accountId === 'acc-jd-config');
    if (retired && retired.active !== false) update.run(JSON.stringify({ ...retired, active: false, retiredReason: '接入配置由各服务商账号办理' }), 'account-retired-1', now, 'account', retired.accountId);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
