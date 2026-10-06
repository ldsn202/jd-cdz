import type { DatabaseSync } from 'node:sqlite';
import { hasAction, type Account } from '../identity/sessions.ts';
import { ROLE_ACTIONS } from '../identity/roles.ts';
import type { RouteResult } from './context.ts';

// Upgrade old generated environments only. New environments receive the directory
// directly from ProviderFact. Never replace an existing provider record.
export function ensureProviderDirectory(db: DatabaseSync, identityDb: DatabaseSync): void {
  const accounts = identityDb.prepare("SELECT payload_json,source_updated_at FROM source_record WHERE kind='account'").all() as {payload_json:string;source_updated_at:string}[];
  const insert = db.prepare("INSERT INTO source_record(kind,record_id,source_version,source_updated_at,payload_json) SELECT 'service_provider',?,'provider-1',?,? WHERE NOT EXISTS(SELECT 1 FROM source_record WHERE kind='service_provider' AND record_id=?)");
  db.exec('BEGIN');
  try {
    for (const row of accounts) {
      const account = JSON.parse(row.payload_json);
      if (typeof account.serviceProviderId !== 'string' || !/^SP-\d{3}$/.test(account.serviceProviderId)
        || account.accountId !== 'acc-' + account.serviceProviderId.toLowerCase()) continue;
      const name = typeof account.displayName === 'string' ? account.displayName.replace(/(?:资料)?账号$/, '').trim() : '';
      if (!name || name === account.displayName) continue;
      insert.run(account.serviceProviderId, row.source_updated_at, JSON.stringify({
        serviceProviderId: account.serviceProviderId, displayName: name,
      }), account.serviceProviderId);
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function getServiceProviders(db: DatabaseSync, auth: {account:Account;grants:{grantId:string;scopeProviderIds:string[]}[]}, pageRaw: string | null, sizeRaw: string | null): RouteResult {
  const page = Number(pageRaw ?? 1), pageSize = Number(sizeRaw ?? 50);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50)
    return {http:400,body:{code:40001,msg:'分页参数无效',data:null}};
  const rows = db.prepare("SELECT record_id,source_version,payload_json FROM source_record WHERE kind='service_provider' ORDER BY record_id").all() as {record_id:string;source_version:string;payload_json:string}[];
  const visible = rows.filter(row => hasAction(auth, 'READ_WORK_ORDER', row.record_id, ROLE_ACTIONS));
  return {http:200,body:{code:0,msg:'success',data:{
    list:visible.slice((page-1)*pageSize,page*pageSize).map(row => ({
      serviceProviderId:row.record_id, displayName:JSON.parse(row.payload_json).displayName,
      sourceSystem:'installation_management', sourceVersion:row.source_version,
    })), total:visible.length,page,pageSize,retrievedAt:new Date().toISOString(),
  }}};
}
