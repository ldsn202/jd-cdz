// T5.1: reconstruct the capability input from immutable, verified database facts.
export async function loadFixedAnalysisInput(db:D1Database,snapshotId:string) {
 const snapshot=await db.prepare(`SELECT * FROM analysis_input_snapshot WHERE id=?`).bind(snapshotId)
  .first<{id:string;work_item_id:string;analysis_generation:number;skill:string;skill_version:string;output_schema_version:string}>();
 if(!snapshot)return null;
 const rows=await db.prepare(`SELECT * FROM analysis_input_item WHERE snapshot_id=? ORDER BY input_key`).bind(snapshotId)
  .all<{input_kind:string;input_key:string;record_type:string;source_system:string;source_record_id:string;source_version:string|null;data_json:string;parsing_id:string}>();
 const records=rows.results.filter(r=>r.input_kind==='RECORD').map(r=>({inputId:r.input_key,recordType:r.record_type,sourceSystem:r.source_system,sourceRecordId:r.source_record_id,sourceVersion:r.source_version,data:JSON.parse(r.data_json)}));
 const parsedMaterials=[];
 for(const r of rows.results.filter(r=>r.input_kind==='PARSED_MATERIAL')){
  const p=await db.prepare(`SELECT p.*,m.source_system,m.source_material_id,v.source_version
   FROM material_parsing p JOIN source_material_version v ON v.id=p.source_material_version_id
   JOIN source_material m ON m.id=v.source_material_id WHERE p.id=?`).bind(r.parsing_id)
   .first<{id:string;source_system:string;source_material_id:string;source_version:string;content_sha256:string;completeness:string;units_json:string;blocks_json:string;issues_json:string}>();
  if(!p)throw new Error('fixed parsing missing');
  parsedMaterials.push({parseId:p.id,sourceSystem:p.source_system,sourceMaterialId:p.source_material_id,sourceVersion:p.source_version,contentSha256:p.content_sha256,completeness:p.completeness,units:JSON.parse(p.units_json),blocks:JSON.parse(p.blocks_json),issues:JSON.parse(p.issues_json)});
 }
 return {snapshot,analysisInput:{skill:snapshot.skill,skillVersion:snapshot.skill_version,outputSchemaVersion:snapshot.output_schema_version,inputSnapshotId:snapshot.id,records,parsedMaterials}};
}
