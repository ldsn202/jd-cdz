// T5.1 / installation-materials §3.4: fixed-byte material parsing and guarded adoption.
import { validateParsing } from '../../../skill-runtime/contract.mjs';
import { ServiceError, nowMs, newId } from './change-batch';
import { loadMaterialVersion, linkedProviderIds } from './material-read';

export const PARSER_PROFILE = 'local-material-parser';
export const PARSER_VERSION = '1.0.0';
export type ParseTarget = {
  runId: string; profileId: string; implementationVersion: string; materialVersionId: string;
  parseInput: { sourceSystem: string; sourceMaterialId: string; sourceVersion: string; contentSha256: string; byteLength: number; mediaType: string };
};
export function buildParsingCapability(db: D1Database, input: { jobId: string; materialVersionId: string; sha256: string; now: number }): D1PreparedStatement {
  return db.prepare(`INSERT INTO capability_call
    (id,job_id,operation,source_material_version_id,input_snapshot_id,profile_id,implementation_version,config_json,input_sha256,gmt_create,gmt_modified)
    SELECT ?,?,'PARSE_MATERIAL',?,NULL,?,?,?, ?,?,?
    WHERE NOT EXISTS(SELECT 1 FROM capability_call WHERE job_id=? AND operation='PARSE_MATERIAL')`)
    .bind(`parse:${input.jobId}`, input.jobId, input.materialVersionId, PARSER_PROFILE, PARSER_VERSION,
      JSON.stringify({ offline: true, pdfVisualComplete: false, imageVisualComplete: false, allSheets: true, formulasExecuted: false }),
      input.sha256, input.now, input.now, input.jobId);
}
export async function materialParsingTarget(db: D1Database, jobId: string, raw: Record<string, unknown>): Promise<ParseTarget> {
  const versionId = typeof raw.materialVersionId === 'string' ? raw.materialVersionId
    : (raw.parseInput as { sourceMaterialVersionId?: string } | null)?.sourceMaterialVersionId;
  if (!versionId) throw new ServiceError(422, 42201, '材料解析任务缺少固定材料版本');
  const material = await loadMaterialVersion(db, versionId);
  if (!material || material.read_state !== 'VERIFIED' || !material.content_sha256 || !material.content_locator || !material.media_type || material.byte_length === null) {
    throw new ServiceError(422, 42201, '材料原文尚未核实，不能解析');
  }
  const jobScope = await db.prepare('SELECT service_provider_id FROM background_job WHERE id=?').bind(jobId).first<{ service_provider_id: string }>();
  let providers: string[];
  if (material.source_system === 'LOCAL_UPLOAD') {
    const uploaded = await db.prepare(`SELECT service_provider_id FROM background_job
      WHERE purpose='PARSE_MATERIAL' AND json_extract(target_json,'$.uploadId')=?
        AND json_extract(target_json,'$.materialVersionId')=?`)
      .bind(material.source_material_source_id, versionId).all<{ service_provider_id: string }>();
    providers = uploaded.results.map(r => r.service_provider_id);
  } else providers = await linkedProviderIds(db, material);
  if (!jobScope || !providers.includes(jobScope.service_provider_id)) throw new ServiceError(403, 40301, '解析任务服务商与原材料实际归属不一致');
  if (typeof raw.fileSha256 === 'string' && material.content_sha256 !== raw.fileSha256) throw new ServiceError(409, 40901, '任务绑定摘要与材料版本不一致');
  // Compatibility for previously accepted uploads: register capability before the first attempt.
  await buildParsingCapability(db, { jobId, materialVersionId: versionId, sha256: material.content_sha256, now: nowMs() }).run();
  const call = await db.prepare(`SELECT id,source_material_version_id,profile_id,implementation_version,input_sha256
    FROM capability_call WHERE job_id=? AND operation='PARSE_MATERIAL'`).bind(jobId)
    .first<{ id: string; source_material_version_id: string; profile_id: string; implementation_version: string; input_sha256: string }>();
  if (!call || call.source_material_version_id !== versionId || call.input_sha256 !== material.content_sha256) throw new ServiceError(409, 40901, '解析调用与原材料不一致');
  return { runId: call.id, profileId: call.profile_id, implementationVersion: call.implementation_version, materialVersionId: versionId,
    parseInput: { sourceSystem: material.source_system, sourceMaterialId: material.source_material_source_id, sourceVersion: material.source_version,
      contentSha256: material.content_sha256, byteLength: material.byte_length, mediaType: material.media_type } };
}

type Parsing = { parseId: string; sourceSystem: string; sourceMaterialId: string; sourceVersion: string; contentSha256: string;
  completeness: 'COMPLETE' | 'INCOMPLETE'; units: { unitId: string; index: number; kind: string; status: string }[]; blocks: unknown[]; issues: string[] };
type Result = { runId: string; operation: string; profileId: string; implementationVersion: string; inputSnapshotId: null; analysis: null; parsing: Parsing };
type Adoption = { ok: true; statements: D1PreparedStatement[]; jobStatus: 'SUCCEEDED' | 'BLOCKED' } | { ok: false; errorCode: string };
export async function buildMaterialParsingAdoption(db: D1Database, job: { id: string; target_json: string }, result: unknown): Promise<Adoption> {
  const target = await materialParsingTarget(db, job.id, JSON.parse(job.target_json) as Record<string, unknown>);
  try {
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('invalid result');
    const r = result as Result;
    const keys = ['runId', 'operation', 'profileId', 'implementationVersion', 'inputSnapshotId', 'analysis', 'parsing'];
    if (Object.keys(r).sort().join('|') !== keys.sort().join('|')) throw new Error('invalid envelope');
    if (r.runId !== target.runId || r.operation !== 'PARSE_MATERIAL' || r.profileId !== target.profileId || r.implementationVersion !== target.implementationVersion || r.inputSnapshotId !== null || r.analysis !== null) throw new Error('call mismatch');
    validateParsing(r.parsing);
    const p = r.parsing;
    for (const key of ['sourceSystem', 'sourceMaterialId', 'sourceVersion', 'contentSha256'] as const) {
      if (p[key] !== target.parseInput[key]) throw new Error('source mismatch');
    }
    if (p.completeness === 'INCOMPLETE' && p.issues.length === 0) throw new Error('missing incomplete issues');
    if (p.completeness === 'COMPLETE' && p.issues.length > 0) throw new Error('unresolved parsing issues');
    if (p.units.some((u, i) => u.index !== i + 1)) throw new Error('unit inventory is not contiguous');
    const expectedKind = target.parseInput.mediaType === 'application/pdf' ? 'PDF_PAGE'
      : target.parseInput.mediaType.startsWith('image/') ? 'IMAGE' : 'SHEET';
    if (p.units.some(u => u.kind !== expectedKind) || (expectedKind === 'IMAGE' && p.units.length !== 1)) throw new Error('material unit kind mismatch');
    // This implementation cannot claim graphic semantics from OCR alone.
    if (target.profileId === PARSER_PROFILE && expectedKind !== 'SHEET' && p.completeness === 'COMPLETE') throw new Error('unsupported visual completeness');
    const now = nowMs();
    const raw=JSON.parse(job.target_json) as {workItemId?:string;analysisGeneration?:number};
    const continuation:D1PreparedStatement[]=[];
    if(raw.workItemId){
      const nextId=newId('bj'),key=`parsed-input:${job.id}`;
      continuation.push(db.prepare(`INSERT INTO background_job(id,purpose,service_provider_id,work_item_id,target_json,dedupe_key,status,available_at,lease_epoch,row_version,gmt_create,gmt_modified)
        SELECT ?,'READ_SOURCE',w.service_provider_id,w.id,json_object('workItemId',w.id,'analysisGeneration',w.analysis_generation,'reason','MATERIAL_PARSED','materialVersionId',?),?,'READY',?,0,1,?,?
        FROM work_item w JOIN background_job parse ON parse.id=? AND parse.service_provider_id=w.service_provider_id
        WHERE w.id=? AND w.pending_write_id IS NULL AND w.status IN ('PREPARING','READY','BLOCKED')
        AND (? IS NULL OR w.analysis_generation=?) AND NOT EXISTS(SELECT 1 FROM background_job WHERE dedupe_key=?)`).bind(nextId,target.materialVersionId,key,now,now,now,job.id,raw.workItemId,raw.analysisGeneration??null,raw.analysisGeneration??null,key));
    }
    return { ok: true, jobStatus: p.completeness === 'COMPLETE' ? 'SUCCEEDED' : 'BLOCKED', statements: [
      db.prepare(`INSERT INTO material_parsing
        (id,run_id,source_material_version_id,content_sha256,profile_id,implementation_version,completeness,units_json,blocks_json,issues_json,gmt_create,gmt_modified)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(p.parseId, target.runId, target.materialVersionId, p.contentSha256, target.profileId, target.implementationVersion,
          p.completeness, JSON.stringify(p.units), JSON.stringify(p.blocks), JSON.stringify(p.issues), now, now),
      ...continuation,
    ] };
  } catch { return { ok: false, errorCode: 'PARSING_RESULT_INVALID' }; }
}
