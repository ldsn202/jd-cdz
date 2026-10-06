import type { ResolvedIdentity } from './identity';
import { ServiceError } from './change-batch';
import { detailedMockCall, type ExternalEnv } from './external';
import { sourceImportScope } from './source-import';

type Provider = {serviceProviderId:string;displayName:string;sourceSystem:string;sourceVersion:string};
type Page = {list:Provider[];total:number;page:number;pageSize:number;retrievedAt:string};
const filled = (s:unknown):s is string => typeof s === 'string' && !!s.trim();

export async function syncProviderDirectory(db:D1Database, env:ExternalEnv, identity:ResolvedIdentity) {
  const scope = await sourceImportScope(env, identity);
  const allowed = new Set(scope.serviceProviderIds), seen = new Set<string>();
  const providers:Provider[] = [];
  let total:number | undefined;
  for (let page=1;page<=1000;page++) {
    const response = await detailedMockCall<Page>(env, `/api/admin/mock/external/installation/service-providers?page=${page}&pageSize=50`);
    const data = response.data;
    if (!data || !Array.isArray(data.list) || !Number.isSafeInteger(data.total) || data.total<0
      || data.page!==page || data.pageSize!==50 || !Number.isFinite(Date.parse(data.retrievedAt))
      || (total!==undefined && total!==data.total) || data.list.length!==Math.min(50,Math.max(0,data.total-(page-1)*50)))
      throw new ServiceError(502,50201,'服务商名录分页不完整或读取期间发生变化，请重试');
    total=data.total;
    for (const provider of data.list) {
      if (!filled(provider.serviceProviderId) || !filled(provider.displayName) || !filled(provider.sourceVersion)
        || provider.sourceSystem!=='installation_management' || seen.has(provider.serviceProviderId))
        throw new ServiceError(502,50201,'服务商来源名称、身份或版本无效');
      seen.add(provider.serviceProviderId);
      if (allowed.has(provider.serviceProviderId)) providers.push(provider);
    }
    if (page*50>=data.total) break;
    if (page===1000) throw new ServiceError(502,50201,'服务商名录超过读取上限');
  }
  const missing = [...allowed].filter(id=>!seen.has(id));
  if (missing.length) throw new ServiceError(502,50201,`来源未返回授权服务商名称：${missing.join('、')}`);
  const now=Date.now(), statements:D1PreparedStatement[]=[];
  for (const provider of providers) {
    const existing=await db.prepare('SELECT id,source_system,source_id FROM service_provider WHERE id=? OR (source_system=? AND source_id=?)')
      .bind(provider.serviceProviderId,provider.sourceSystem,provider.serviceProviderId).all<{id:string;source_system:string;source_id:string}>();
    if (existing.results?.some(row=>row.id!==provider.serviceProviderId || row.source_system!==provider.sourceSystem || row.source_id!==provider.serviceProviderId))
      throw new ServiceError(409,40901,'服务商编号与已有来源身份冲突');
    statements.push(db.prepare(`INSERT INTO service_provider(id,source_system,source_id,display_name,source_version,source_state,verified_at,gmt_create,gmt_modified)
      SELECT ?,?,?,?,?,'UNKNOWN',?,?,? WHERE NOT EXISTS(SELECT 1 FROM service_provider WHERE id=?)`)
      .bind(provider.serviceProviderId,provider.sourceSystem,provider.serviceProviderId,provider.displayName,provider.sourceVersion,now,now,now,provider.serviceProviderId));
    statements.push(db.prepare(`UPDATE service_provider SET display_name=?,source_version=?,verified_at=?,gmt_modified=MAX(gmt_modified,?)
      WHERE id=? AND source_system=? AND source_id=? AND (display_name IS NOT ? OR source_version IS NOT ?)`)
      .bind(provider.displayName,provider.sourceVersion,now,now,provider.serviceProviderId,provider.sourceSystem,provider.serviceProviderId,provider.displayName,provider.sourceVersion));
  }
  const results=statements.length ? await db.batch(statements) : [];
  return {providerCount:providers.length,changedCount:results.reduce((sum,row)=>sum+(row.meta.changes??0),0),checkedAt:new Date(now).toISOString()};
}
