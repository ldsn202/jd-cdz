import type { ResolvedIdentity } from './identity';

export type MaterialVersionRow = {
  id: string;
  source_material_id: string;
  source_version: string;
  read_state: 'REFERENCED' | 'VERIFIED';
  name: string | null;
  media_type: string | null;
  byte_length: number | null;
  content_sha256: string | null;
  content_locator: string | null;
  source_system: string;
  source_material_source_id: string;
};

export function materialReadable(identity: ResolvedIdentity, providerId: string): boolean {
  return identity.grants.some(
    (g) =>
      g.scopeType === 'SERVICE_PROVIDER' &&
      g.actions.includes('READ_SOURCE_MATERIAL') &&
      g.resourceIds.includes(providerId)
  );
}

export async function loadMaterialVersion(
  db: D1Database,
  materialVersionId: string
): Promise<MaterialVersionRow | null> {
  return db
    .prepare(
      `SELECT v.id, v.source_material_id, v.source_version, v.read_state, v.name, v.media_type,
              v.byte_length, v.content_sha256, v.content_locator,
              m.source_system, m.source_material_id AS source_material_source_id
       FROM source_material_version v JOIN source_material m ON m.id = v.source_material_id
       WHERE v.id = ?`
    )
    .bind(materialVersionId)
    .first<MaterialVersionRow>();
}

export async function linkedProviderIds(db: D1Database, row: MaterialVersionRow): Promise<string[]> {
  const rows = await db
    .prepare(
      `SELECT DISTINCT s.service_provider_id AS pid
       FROM installation_context_snapshot s,
            json_each(s.context_json, '$.sourceMaterials') sm
       WHERE json_extract(sm.value, '$.sourceSystem') = ?
         AND json_extract(sm.value, '$.sourceMaterialId') = ?
         AND json_extract(sm.value, '$.sourceVersion') = ?`
    )
    .bind(row.source_system, row.source_material_source_id, row.source_version)
    .all<{ pid: string }>();
  const sourceJobs=await db.prepare(`SELECT DISTINCT j.service_provider_id pid FROM background_job j JOIN work_item w ON w.id=j.work_item_id AND w.service_provider_id=j.service_provider_id
    WHERE j.purpose='PARSE_MATERIAL' AND json_extract(j.target_json,'$.origin')='SOURCE_READ'
    AND json_extract(j.target_json,'$.sourceMaterialReference.sourceSystem')=?
    AND json_extract(j.target_json,'$.sourceMaterialReference.sourceMaterialId')=?
    AND json_extract(j.target_json,'$.sourceMaterialReference.sourceVersion')=?
    AND json_extract(j.target_json,'$.materialVersionId')=?`).bind(row.source_system,row.source_material_source_id,row.source_version,row.id).all<{pid:string}>();
  const fixedInputs=await db.prepare(`SELECT DISTINCT s.service_provider_id pid FROM analysis_input_item i JOIN analysis_input_snapshot s ON s.id=i.snapshot_id JOIN material_parsing p ON p.id=i.parsing_id WHERE i.input_kind='PARSED_MATERIAL' AND p.source_material_version_id=?`).bind(row.id).all<{pid:string}>();
  return [...new Set([...rows.results,...sourceJobs.results,...fixedInputs.results].map(r=>r.pid))];
}

export async function uploadProviderId(db: D1Database, materialVersionId: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT json_extract(target_json, '$.providerId') AS pid FROM background_job
       WHERE purpose = 'PARSE_MATERIAL' AND json_extract(target_json, '$.materialVersionId') = ?`
    )
    .bind(materialVersionId)
    .first<{ pid: string | null }>();
  return row?.pid ?? null;
}

export async function materialVisible(
  db: D1Database,
  identity: ResolvedIdentity,
  row: MaterialVersionRow
): Promise<boolean> {
  let pids = await linkedProviderIds(db, row);
  if (pids.length === 0 && row.source_system === 'LOCAL_UPLOAD') {
    const pid = await uploadProviderId(db, row.id);
    if (pid) pids = [pid];
  }
  return pids.some((pid) => materialReadable(identity, pid));
}

export async function loadLatestParsing(db: D1Database, materialVersionId: string) {
  return db
    .prepare(
      `SELECT id, run_id, completeness, units_json, blocks_json, issues_json
       FROM material_parsing WHERE source_material_version_id = ?
       ORDER BY gmt_create DESC, id DESC LIMIT 1`
    )
    .bind(materialVersionId)
    .first<{
      id: string; run_id: string; completeness: string;
      units_json: string; blocks_json: string; issues_json: string;
    }>();
}
