import type { DatabaseSync } from 'node:sqlite';
import type { RouteResult } from '../jd-bills/read.ts';
import { probeApplicationLifecycle, callLifecycle } from './application-lifecycle.ts';

export type EnvRegistryEntry = {
  envId: string;
  datasetId: string;
  storageRoot: string;
  status: 'ACTIVE' | 'PAUSED' | 'BUILDING' | 'FAILED';
  containsUploads: boolean;
  generation: number;
  registeredAt: string;
};

function recs(db: DatabaseSync, kind: string) {
  return (db.prepare("SELECT record_id, payload_json FROM source_record WHERE kind = ?").all(kind) as any[]).map((r) => ({ id: r.record_id, payload: JSON.parse(r.payload_json) }));
}

export function registerSelf(db: DatabaseSync, entry: Omit<EnvRegistryEntry, 'registeredAt'>): void {
  const existing = recs(db, 'env_registry').find((e) => e.payload.envId === entry.envId);
  if (existing) return;
  db.prepare("INSERT INTO source_record (kind, record_id, source_version, source_updated_at, payload_json) VALUES ('env_registry', ?, 'env-1', ?, ?)")
    .run(entry.envId, new Date().toISOString(), JSON.stringify({ ...entry, registeredAt: new Date().toISOString() }));
}

export function listEnvironments(db: DatabaseSync): RouteResult {
  return { http: 200, body: { code: 0, msg: 'success', data: recs(db, 'env_registry').map((e) => e.payload) } };
}

export function markUploads(db: DatabaseSync, envId: string): RouteResult {
  const entry = recs(db, 'env_registry').find((e) => e.payload.envId === envId);
  if (!entry) return { http: 404, body: { code: 40401, msg: '环境未登记', data: null } };
  entry.payload.containsUploads = true;
  db.prepare("UPDATE source_record SET payload_json = ? WHERE kind = 'env_registry' AND record_id = ?").run(JSON.stringify(entry.payload), envId);
  return { http: 200, body: { code: 0, msg: 'success', data: entry.payload } };
}

export async function restoreEnvironment(db: DatabaseSync, _mocksRoot: string, body: Record<string, unknown>): Promise<RouteResult> {
  const { templateEnvId, newEnvId } = body as { templateEnvId?: string; newEnvId?: string };
  const valid = (id: unknown): id is string => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{1,31}$/.test(id);
  if (!valid(templateEnvId) || !valid(newEnvId) || templateEnvId === newEnvId) return { http: 400, body: { code: 40001, msg: '须使用两个不同的合法环境编号', data: null } };
  const registry = recs(db, 'env_registry').map((e) => e.payload as EnvRegistryEntry);
  const template = registry.find((e) => e.envId === templateEnvId);
  if (!template) return { http: 404, body: { code: 40401, msg: '模板环境未登记', data: null } };
  if (template.containsUploads) return { http: 409, body: { code: 40901, msg: '含实际上传资料的环境不执行清空恢复；需另建新环境，原环境完整保留', data: null } };
  if (registry.some(e => e.envId === newEnvId)) return { http:409, body:{code:40901,msg:'目标环境已登记，禁止覆盖或复用',data:null} };
  const lifecycle = await probeApplicationLifecycle();
  if (!lifecycle.ready) return { http:409, body:{code:40903,msg:`完整恢复被拒绝：${lifecycle.detail}；不做来源单边清空，不报告恢复成功`,data:null} };
  // The adapter owns source snapshots, empty D1/R2, task processes, import and entry switching.
  // Never copy a running source database or remove partial storage from this process.
  const restored = await callLifecycle('/lifecycle/restore', { envId:newEnvId, templateEnvId });
  const data = restored.data?.data as {status?:string;storageRoot?:string;generation?:number}|undefined;
  if (!restored.ok || data?.status !== 'ACTIVE' || !data.storageRoot || !Number.isInteger(data.generation)) return {http:409,body:{code:40903,msg:`完整恢复未确认：${restored.detail}；原环境及半成品均保留，请查询生命周期状态`,data:null}};
  db.prepare("INSERT INTO source_record (kind,record_id,source_version,source_updated_at,payload_json) VALUES ('env_registry',?,'env-1',?,?)")
    .run(newEnvId,new Date().toISOString(),JSON.stringify({envId:newEnvId,datasetId:template.datasetId,storageRoot:data.storageRoot,status:'ACTIVE',containsUploads:false,generation:data.generation!,registeredAt:new Date().toISOString()} satisfies EnvRegistryEntry));
  db.prepare("UPDATE source_record SET payload_json=? WHERE kind='env_registry' AND record_id=?").run(JSON.stringify({...template,status:'PAUSED'}),templateEnvId);
  return {http:200,body:{code:0,msg:'success',data:{newEnvId,status:'ACTIVE',previousEnvId:templateEnvId,previousStatus:'PAUSED',lifecycle:restored.data}}};
}

export function completeTask(db: DatabaseSync, activeEnvId: string, body: Record<string, unknown>): RouteResult {
  const { taskId, envId } = body as { taskId?: string; envId?: string };
  if (!taskId || !envId) return { http: 400, body: { code: 40001, msg: 'taskId/envId 必填', data: null } };
  if (envId !== activeEnvId) {
    return { http: 409, body: { code: 40901, msg: `任务归属环境 ${envId} 与当前活动环境 ${activeEnvId} 不符，旧环境迟到响应不能写新环境`, data: null } };
  }
  return { http: 200, body: { code: 0, msg: 'success', data: { taskId, envId, accepted: true } } };
}
