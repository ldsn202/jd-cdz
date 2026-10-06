import type { ResolvedIdentity } from './identity';
import { newId, requireService, ServiceError } from './change-batch';
import { detailedMockCall, type ExternalEnv, type ChangesData, type IdentityContextData, type WorkOrderContextData } from './external';

const FEED_SOURCE = 'installation-admin';
const CONTEXT_SOURCE = 'installation_management';
const requiredActions = ['READ_SOURCE_CHANGES', 'PREPARE_ANALYSIS'];
const base = '/api/admin/mock';
const valid = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;
const monitorSources = ['installation-admin','provider-docs','jd-billing','provider-receivable','billing-terms','order-entitlement'];
const sourceScope = (s: string | null, source: string) => s == null || s === source || (source === FEED_SOURCE && s === CONTEXT_SOURCE);
function localProviders(identity: ResolvedIdentity, source = FEED_SOURCE) {
  if (!monitorSources.includes(source)) throw new ServiceError(400,40001,'来源系统不支持自动监测');
  requireService(identity);
  const ids = [...new Set(identity.grants.filter(g => g.scopeType === 'SERVICE_PROVIDER' && requiredActions.every(action => g.actions.includes(action))
    && sourceScope(g.sourceSystem, source) && (g.recordType == null || (source === FEED_SOURCE && g.recordType === 'INSTALLATION_WORK_ORDER'))).flatMap(g => g.resourceIds))];
  if (!ids.length) throw new ServiceError(403, 40301, `缺少 ${requiredActions.join(" 和 ")} 服务商范围权限`);
  return ids;
}
export async function sourceImportScope(env: ExternalEnv, identity: ResolvedIdentity, source = FEED_SOURCE) {
  const local = localProviders(identity, source);
  const response = await detailedMockCall<IdentityContextData>(env, `${base}/external/identity/current-context`);
  const external = response.data;
  if (external.subjectType !== 'SERVICE' || !Array.isArray(external.grants)) throw new ServiceError(403, 40301, '来源身份必须为 SERVICE');
  if (external.validUntil && Date.parse(external.validUntil) <= Date.now()) throw new ServiceError(403, 40301, '来源授权已过期');
  const remote = new Set(external.grants.filter(g => g.scope.scopeType === 'SERVICE_PROVIDER' && g.actions.includes('READ_SOURCE_CHANGES')
    && sourceScope(g.scope.sourceSystem, source) && (g.scope.recordType == null || (source === FEED_SOURCE && g.scope.recordType === 'INSTALLATION_WORK_ORDER'))).flatMap(g => g.scope.resourceIds));
  return { serviceProviderIds: local.filter(id => remote.has(id)), scopeIsGlobal: false,
    sourceSystem: source, contextSourceSystem: CONTEXT_SOURCE,
    evidence: { endpoint: `${base}/external/identity/current-context`, requestId: response.requestId,
      subjectId: external.subjectId, authorizationVersion: external.authorizationVersion, verifiedAt: external.verifiedAt },
    limitations: ['范围取自双方授权交集，服务商名称经名录接口同步，工单取自变化基线', '服务商状态以及工单生命周期未提供；保留为 UNKNOWN', '只能确认本次授权范围，不能据此宣称全平台全量'] };
}
async function authorizeProvider(env: ExternalEnv, identity: ResolvedIdentity, providerId: string, source = FEED_SOURCE) {
  if (!valid(providerId) || !localProviders(identity, source).includes(providerId)) throw new ServiceError(403, 40301, '服务商超出导入授权范围');
  const scope = await sourceImportScope(env, identity, source);
  if (!scope.serviceProviderIds.includes(providerId)) throw new ServiceError(403, 40301, '服务商超出来源授权范围');
  return scope;
}
export async function startSourceImport(env: ExternalEnv, identity: ResolvedIdentity, body: { serviceProviderId: string; sourceSystem?: string }) {
  const source = body.sourceSystem ?? FEED_SOURCE;
  const scope = await authorizeProvider(env, identity, body?.serviceProviderId, source);
  // A fresh feed is an explicit baseline snapshot; no guessing an old feed's cursor/count.
  const feedId = newId('bootstrap');
  const receipt = await detailedMockCall<{ feedId: string; sourceSystem: string; serviceProviderId: string; generation: number; startCursor: string; baselineCount: number }>(env,
    `${base}/control/change-feeds`, { method: 'POST', body: JSON.stringify({ feedId, sourceSystem: source, serviceProviderId: body.serviceProviderId }) });
  const r = receipt.data;
  if (r.feedId !== feedId || r.sourceSystem !== source || r.serviceProviderId !== body.serviceProviderId || !valid(r.startCursor)
    || !Number.isSafeInteger(r.baselineCount) || r.baselineCount < 0) throw new ServiceError(502, 50201, '来源基线登记回执不完整');
  return { ...r, scope, requestId: receipt.requestId };
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}
function content(c: WorkOrderContextData & { _sourceImport?: unknown }) {
  const { retrievedAt: _time, _sourceImport: _evidence, ...rest } = c;
  return canonical(rest);
}
type SourceRow = { id: string; source_system: string; source_id: string; source_version: string | null; current_service_provider_id?: string | null; context_snapshot_id?: string | null };
async function sourceRow(db: D1Database, table: 'service_provider' | 'installation_work_order', source: string, id: string) {
  const row = await db.prepare(`SELECT * FROM ${table} WHERE source_system=? AND source_id=?`).bind(source, id).first<SourceRow>();
  const collision = await db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first<SourceRow>();
  if (collision && (collision.source_system !== source || collision.source_id !== id)) throw new ServiceError(409, 40901, '同号属于其他来源，禁止合并');
  return row;
}
async function persistContext(db: D1Database, expectedProvider: string, change: ChangesData['list'][number], context: WorkOrderContextData, evidence: object, retried = false): Promise<{status: 'IMPORTED' | 'UNCHANGED'; workOrderId: string; serviceProviderId: string; contextSnapshotId: string}> {
  const wo = context?.installationWorkOrder;
  if (!wo || wo.installationWorkOrderId !== change.sourceRecordId || wo.serviceProviderId !== expectedProvider
    || wo.sourceSystem !== CONTEXT_SOURCE || !valid(wo.sourceVersion) || wo.sourceVersion !== change.sourceVersion)
    throw new ServiceError(409, 40901, '工单来源、归属或版本与发现记录不一致');
  if (!Array.isArray(context.missingParts) || !Array.isArray(context.sourceMaterials) || !Number.isFinite(Date.parse(context.retrievedAt))
    || !['COMPLETE','INCOMPLETE'].includes(context.completeness)) throw new ServiceError(502, 50201, '来源上下文结构不完整');
  const provider = await sourceRow(db, 'service_provider', wo.sourceSystem, expectedProvider);
  const existing = await sourceRow(db, 'installation_work_order', wo.sourceSystem, wo.installationWorkOrderId);
  const providerId = provider?.id ?? expectedProvider;
  const workOrderId = existing?.id ?? wo.installationWorkOrderId;
  if (existing && (existing.source_version !== wo.sourceVersion || existing.current_service_provider_id !== providerId))
    throw new ServiceError(409, 40901, '已导入工单版本或服务商归属发生变化，需显式核对；未覆盖旧版本');
  if (existing?.context_snapshot_id) {
    const snapshot = await db.prepare('SELECT context_json FROM installation_context_snapshot WHERE id=? AND installation_work_order_id=?').bind(existing.context_snapshot_id, workOrderId).first<{context_json:string}>();
    if (!snapshot || content(JSON.parse(snapshot.context_json)) !== content(context)) throw new ServiceError(409, 40902, '同一工单版本的上下文内容变化，未覆盖历史');
    return { status: 'UNCHANGED' as const, workOrderId, serviceProviderId: providerId, contextSnapshotId: existing.context_snapshot_id };
  }
  const now = Math.max(Date.now(), Date.parse(context.retrievedAt));
  const sql: D1PreparedStatement[] = [];
  if (!provider) sql.push(db.prepare(`INSERT INTO service_provider(id,source_system,source_id,source_state,verified_at,gmt_create,gmt_modified) VALUES(?,?,?,'UNKNOWN',?,?,?)`).bind(providerId, wo.sourceSystem, expectedProvider, now, now, now));
  if (!existing) sql.push(db.prepare(`INSERT INTO installation_work_order(id,source_system,source_id,current_service_provider_id,source_version,source_state,verified_at,gmt_create,gmt_modified) VALUES(?,?,?,?,?,'UNKNOWN',?,?,?)`).bind(workOrderId, wo.sourceSystem, wo.installationWorkOrderId, providerId, wo.sourceVersion, now, now, now));
  const refs: { plan: string | null; detail: string | null } = {plan:null,detail:null};
  for (const [kind, data] of [['plan',context.installationPlan],['detail',context.installationDetail]] as const) {
    if (!data) continue;
    const id = 'installationPlanId' in data ? data.installationPlanId : data.installationDetailId;
    if (!valid(id) || !valid(data.sourceSystem) || !valid(data.sourceVersion)) throw new ServiceError(502, 50201, '安装计划或明细缺少来源身份和版本');
    const table = kind === 'plan' ? 'installation_plan' : 'installation_detail';
    const old = await db.prepare(`SELECT id,installation_work_order_id FROM ${table} WHERE source_system=? AND source_id=?`).bind(data.sourceSystem, id).first<{id:string;installation_work_order_id:string}>();
    if (old && old.installation_work_order_id !== workOrderId) throw new ServiceError(409, 40901, '计划或明细来源身份已属于其他工单');
    refs[kind] = old?.id ?? newId(`import-${kind}`);
    if (!old) sql.push(db.prepare(`INSERT INTO ${table}(id,installation_work_order_id,source_system,source_id,gmt_create,gmt_modified) VALUES(?,?,?,?,?,?)`).bind(refs[kind],workOrderId,data.sourceSystem,id,now,now));
  }
  const snapshotId = newId('import-context');
  sql.push(db.prepare(`INSERT INTO installation_context_snapshot(id,installation_work_order_id,service_provider_id,source_work_order_version,installation_plan_id,source_plan_version,installation_detail_id,source_detail_version,detail_status,completeness,missing_parts_json,context_json,retrieved_at,gmt_create,gmt_modified) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM installation_work_order WHERE id=? AND source_version=? AND current_service_provider_id=? AND context_snapshot_id IS NULL)`).bind(snapshotId,workOrderId,providerId,wo.sourceVersion,refs.plan,context.installationPlan?.sourceVersion ?? null,refs.detail,context.installationDetail?.sourceVersion ?? null,context.installationDetailStatus,context.completeness,JSON.stringify(context.missingParts),JSON.stringify({...context,_sourceImport:evidence}),Date.parse(context.retrievedAt),now,now,workOrderId,wo.sourceVersion,providerId));
  // Conditional update plus batch transaction preserves the first captured version; no upsert/replace.
  sql.push(db.prepare('UPDATE installation_work_order SET context_snapshot_id=?,verified_at=?,gmt_modified=? WHERE id=? AND source_version=? AND context_snapshot_id IS NULL').bind(snapshotId,now,now,workOrderId,wo.sourceVersion));
  let written: D1Result[];
  try { written = await db.batch(sql); }
  catch (error) {
    // D1 rolls back the entire batch. Re-read once after a concurrent first insert;
    // the same version/content checks above still reject conflicting history.
    if (!retried && /UNIQUE constraint failed|replacement_write_forbidden/i.test((error as Error).message))
      return persistContext(db, expectedProvider, change, context, evidence, true);
    throw error;
  }
  if (written[written.length - 1].meta.changes !== 1) {
    const current = await db.prepare('SELECT w.context_snapshot_id,c.context_json FROM installation_work_order w JOIN installation_context_snapshot c ON c.id=w.context_snapshot_id WHERE w.id=?').bind(workOrderId).first<{context_snapshot_id:string;context_json:string}>();
    if (!current || content(JSON.parse(current.context_json)) !== content(context)) throw new ServiceError(409,40901,'导入期间来源上下文被其他操作更新，未覆盖');
    return { status:'UNCHANGED' as const, workOrderId,serviceProviderId:providerId,contextSnapshotId:current.context_snapshot_id };
  }
  return { status: 'IMPORTED' as const, workOrderId, serviceProviderId: providerId, contextSnapshotId: snapshotId };
}
export async function importSourcePage(db: D1Database, env: ExternalEnv, identity: ResolvedIdentity,
  body: {serviceProviderId:string;feedId:string;cursor:string}) {
  const scope = await authorizeProvider(env, identity, body?.serviceProviderId);
  if (!valid(body?.feedId) || !valid(body?.cursor)) throw new ServiceError(400, 40001, 'feedId 和 cursor 必填');
  const endpoint = `${base}/external/change-feeds/${encodeURIComponent(body.feedId)}/changes?cursor=${encodeURIComponent(body.cursor)}&pageSize=10`;
  const response = await detailedMockCall<ChangesData>(env, endpoint);
  const page = response.data;
  if (page.feedId !== body.feedId || page.serviceProviderId !== body.serviceProviderId || page.sourceSystem !== FEED_SOURCE
    || page.cursor !== body.cursor || !valid(page.nextCursor) || typeof page.hasMore !== 'boolean' || !Array.isArray(page.list) || page.list.length > 10
    || (page.hasMore && page.nextCursor === page.cursor)) throw new ServiceError(502, 50201, '来源变化页范围或读取位置不匹配');
  const results = [];
  for (const change of page.list) {
    if (change.recordType !== 'INSTALLATION_WORK_ORDER') continue;
    try {
      if (change.changeType !== 'UPSERT' || !valid(change.sourceRecordId) || !valid(change.sourceVersion)) throw new ServiceError(409,40901,'来源工单已移除或没有确定版本，未导入');
      const contextEndpoint = `${base}/external/installation/work-orders/${encodeURIComponent(change.sourceRecordId)}/context`;
      const context = await detailedMockCall<WorkOrderContextData>(env, contextEndpoint);
      const saved = await persistContext(db, body.serviceProviderId, change, context.data, {feedId:body.feedId,cursor:body.cursor,changeId:change.changeId,sourceVersion:change.sourceVersion,discoveryEndpoint:endpoint,discoveryRequestId:response.requestId,contextEndpoint,contextRequestId:context.requestId,scopeEvidence:scope.evidence});
      results.push({sourceSystem:CONTEXT_SOURCE,sourceRecordId:change.sourceRecordId,sourceVersion:change.sourceVersion,...saved});
    } catch (error) {
      results.push({sourceSystem:CONTEXT_SOURCE,sourceRecordId:change.sourceRecordId,sourceVersion:change.sourceVersion,status:'FAILED' as const,message:(error as Error).message});
    }
  }
  return {feedId:body.feedId,serviceProviderId:body.serviceProviderId,cursor:page.cursor,nextCursor:page.nextCursor,hasMore:page.hasMore,
    sourceCheckedAt:page.sourceCheckedAt,coverageThrough:page.coverageThrough ?? null,requestId:response.requestId,
    changeCount:page.list.length,changeIds:page.list.map(c => c.changeId),results,
    importedCount:results.filter(r=>r.status==='IMPORTED').length,unchangedCount:results.filter(r=>r.status==='UNCHANGED').length,failedCount:results.filter(r=>r.status==='FAILED').length};
}
