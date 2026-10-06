import type { Bindings } from '../index';
import type { ResolvedIdentity } from './identity';
import { ServiceError, newId, nowMs, requireService } from './change-batch';
import {loadFixedAnalysisInput} from './analysis-fixed-input';
import {loadMaterialVersion,linkedProviderIds,uploadProviderId} from './material-read';
import { prepareAndRegisterAnalysis } from './analysis-pipeline';

export type AgentRunBody = {
  runId: string;
  operation: 'PARSE_MATERIAL' | 'ANALYZE_SKILL';
  profileId: string;
  parseInput?: { sourceMaterialVersionId?: string; [k: string]: unknown } | null;
  analysisInput?: { inputSnapshotId?: string; [k: string]: unknown } | null;
  implementationVersion: string;
  skillPackageDigest: string | null;
  inputDigest: string;
};

export async function registerAgentRun(
  db: D1Database,
  env: Bindings,
  identity: ResolvedIdentity,
  body: AgentRunBody
): Promise<{ runId: string; status: 'ACCEPTED' | 'DEFERRED'; materialJobIds?: string[] }> {
  requireService(identity);
  if (
    body?.operation === 'ANALYZE_SKILL' &&
    body.analysisInput &&
    typeof (body.analysisInput as { workItemId?: unknown }).workItemId === 'string'
  ) {
    return prepareAndRegisterAnalysis(db, env, identity, {
      runId: body.runId,
      profileId: body.profileId,
      implementationVersion: body.implementationVersion,
      skillPackageDigest: body.skillPackageDigest as string,
      analysisInput: body.analysisInput as never,
    });
  }
  if (!body?.runId || !body?.profileId || !body?.implementationVersion || !body?.inputDigest) {
    throw new ServiceError(400, 40001, 'runId、profileId、implementationVersion、inputDigest 必填');
  }
  if (body.operation !== 'PARSE_MATERIAL' && body.operation !== 'ANALYZE_SKILL') {
    throw new ServiceError(400, 40002, 'operation 须为 PARSE_MATERIAL / ANALYZE_SKILL');
  }
  if (body.operation === 'ANALYZE_SKILL' && !body.skillPackageDigest) {
    throw new ServiceError(400, 40001, 'ANALYZE_SKILL 必须提供 skillPackageDigest');
  }

  const snapshotId=body.operation==='ANALYZE_SKILL'?body.analysisInput?.inputSnapshotId??null:null;
  const materialVersionId=body.operation==='PARSE_MATERIAL'?body.parseInput?.sourceMaterialVersionId??null:null;
  let serviceProviderId:string,workItemId:string|null=null,target:Record<string,unknown>;
  const common={runId:body.runId,profileId:body.profileId,implementationVersion:body.implementationVersion,skillPackageDigest:body.skillPackageDigest};
  if(snapshotId){
    const fixed=await loadFixedAnalysisInput(db,snapshotId);
    const scope=await db.prepare('SELECT service_provider_id,content_sha256 FROM analysis_input_snapshot WHERE id=?').bind(snapshotId).first<{service_provider_id:string;content_sha256:string}>();
    if(!fixed||!scope)throw new ServiceError(404,40404,'快照不存在或不可见');
    if(scope.content_sha256!==body.inputDigest)throw new ServiceError(409,40902,'快照摘要不一致');
    serviceProviderId=scope.service_provider_id;workItemId=fixed.snapshot.work_item_id;
    target={...common,...fixed.analysisInput,snapshotId,workItemId};
  }else if(materialVersionId){
    const version=await loadMaterialVersion(db,materialVersionId);
    if(!version||version.read_state!=='VERIFIED')throw new ServiceError(422,42201,'材料范围或字节尚未核实');
    const providers=await linkedProviderIds(db,version);if(version.source_system==='LOCAL_UPLOAD'){const pid=await uploadProviderId(db,version.id);if(pid)providers.push(pid);}
    const requested=body.parseInput?.serviceProviderId;
    if(typeof requested!=='string'||!providers.includes(requested))throw new ServiceError(403,40301,'必须指定材料实际归属的服务商范围');
    if(version.content_sha256!==body.inputDigest)throw new ServiceError(409,40902,'材料摘要不一致');
    serviceProviderId=requested;target={...common,materialVersionId,providerId:requested};
  }else throw new ServiceError(400,40001,'需要实际快照或 workItemId / 固定材料版本');
  if(!identity.grants.some(g=>g.scopeType==='SERVICE_PROVIDER'&&g.sourceSystem==null&&g.recordType==null&&g.actions.includes('PREPARE_ANALYSIS')&&g.resourceIds.includes(serviceProviderId)))throw new ServiceError(403,40301,'无该服务商范围的分析准备权限');
  const existing=await db.prepare('SELECT c.input_sha256,c.profile_id,c.implementation_version,j.service_provider_id FROM capability_call c JOIN background_job j ON j.id=c.job_id WHERE c.id=?').bind(body.runId).first<{input_sha256:string;profile_id:string;implementation_version:string;service_provider_id:string}>();
  if(existing){if(existing.input_sha256!==body.inputDigest||existing.profile_id!==body.profileId||existing.implementation_version!==body.implementationVersion||existing.service_provider_id!==serviceProviderId)throw new ServiceError(409,40902,'同 runId 不同输入内容');return {runId:body.runId,status:'ACCEPTED'};}
  const now=nowMs(),jobId=newId('bj'),purpose=body.operation;

  await db.batch([
    db
      .prepare(
        `INSERT INTO background_job (id, purpose, service_provider_id, work_item_id, external_write_id, target_json, dedupe_key, status, available_at, lease_epoch, row_version, gmt_create, gmt_modified)
         VALUES (?, ?, ?, ?, NULL, ?, ?, 'READY', ?, 0, 1, ?, ?)`
      )
      .bind(jobId, purpose, serviceProviderId, workItemId, JSON.stringify(target), `agent-run:${body.runId}`, now, now, now),
    db
      .prepare(
        `INSERT INTO capability_call (id, job_id, operation, source_material_version_id, input_snapshot_id, profile_id, implementation_version, config_json, input_sha256, gmt_create, gmt_modified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        body.runId, jobId, body.operation, materialVersionId, snapshotId,
        body.profileId, body.implementationVersion,
        JSON.stringify({ skillPackageDigest: body.skillPackageDigest }),
        body.inputDigest, now, now
      ),
  ]);

  return { runId: body.runId, status: 'ACCEPTED' };
}

export async function getAgentRun(
  db: D1Database,
  identity: ResolvedIdentity,
  runId: string
): Promise<{ runId: string; status: string; result: unknown; error: { code: string; msg: string } | null }> {
  requireService(identity);
  const row = await db
    .prepare(
      `SELECT c.id AS run_id, j.status AS job_status, j.outcome_json, j.service_provider_id
       FROM capability_call c JOIN background_job j ON j.id = c.job_id WHERE c.id = ?`
    )
    .bind(runId)
    .first<{ run_id: string; job_status: string; service_provider_id:string; outcome_json: string | null }>();
  if (!row||!identity.grants.some(g=>g.scopeType==='SERVICE_PROVIDER'&&g.sourceSystem==null&&g.recordType==null&&g.actions.includes('PREPARE_ANALYSIS')&&g.resourceIds.includes(row.service_provider_id))) throw new ServiceError(404, 40404, '资源不存在或不可见');

  let status: string;
  let result: unknown = null;
  let error: { code: string; msg: string } | null = null;
  const outcome = row.outcome_json ? (JSON.parse(row.outcome_json) as { result?: unknown; errorCode?: string }) : null;
  if (row.job_status === 'SUCCEEDED') {
    status = 'SUCCEEDED';
    result = outcome?.result ?? null;
  } else if (['FAILED','BLOCKED','CANCELLED'].includes(row.job_status)) {
    status = row.job_status;
    error = { code: outcome?.errorCode ?? 'UNKNOWN', msg: '任务执行失败' };
  } else if (row.job_status === 'RUNNING') {
    status = 'RUNNING';
  } else {
    status = 'ACCEPTED';
  }
  return { runId, status, result, error };
}
