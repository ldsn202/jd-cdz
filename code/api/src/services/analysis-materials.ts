import type {SourceMaterialRef} from './external/types';
export async function collectParsedMaterials(db:D1Database,workItemId:string,providerId:string,refs:SourceMaterialRef[],selectedVersionId?:string){
 const versionIds=new Set<string>(),issues:string[]=[],pendingJobIds:string[]=[];
 for(const ref of refs){
  const row=await db.prepare(`SELECT v.id FROM source_material_version v JOIN source_material m ON m.id=v.source_material_id WHERE m.source_system=? AND m.source_material_id=? AND v.source_version=? AND v.read_state='VERIFIED'`).bind(ref.sourceSystem,ref.sourceMaterialId,ref.sourceVersion).first<{id:string}>();
  if(row)versionIds.add(row.id);else issues.push(`材料尚未校验或解析：${ref.sourceSystem}/${ref.sourceMaterialId}/${ref.sourceVersion}`);
 }
 const uploads=await db.prepare(`SELECT id,status,target_json FROM background_job WHERE purpose='PARSE_MATERIAL' AND work_item_id=? AND service_provider_id=? ORDER BY gmt_create`).bind(workItemId,providerId).all<{id:string;status:string;target_json:string}>();
 const replaced=new Set<string>();
 for(const row of uploads.results){const t=JSON.parse(row.target_json);if(t.materialVersionId)versionIds.add(t.materialVersionId);if(t.replacesMaterialVersionId)replaced.add(t.replacesMaterialVersionId);}
 const parsedMaterials=[],rows=[];
 for(const id of versionIds){
  if(selectedVersionId && id!==selectedVersionId)continue;
  if(replaced.has(id))continue;
  const p=await db.prepare(`SELECT p.*,m.source_system,m.source_material_id,v.source_version FROM material_parsing p JOIN source_material_version v ON v.id=p.source_material_version_id JOIN source_material m ON m.id=v.source_material_id WHERE v.id=? AND v.read_state='VERIFIED' ORDER BY p.gmt_create DESC,p.id DESC LIMIT 1`).bind(id)
   .first<{id:string;source_system:string;source_material_id:string;source_version:string;content_sha256:string;completeness:string;units_json:string;blocks_json:string;issues_json:string}>();
  if(!p){issues.push(`材料尚未完成真实解析：${id}`);for(const job of uploads.results)if(JSON.parse(job.target_json).materialVersionId===id&&['READY','RUNNING','RETRY_WAIT'].includes(job.status))pendingJobIds.push(job.id);continue;}
  rows.push({...p,materialVersionId:id});parsedMaterials.push({parseId:p.id,sourceSystem:p.source_system,sourceMaterialId:p.source_material_id,sourceVersion:p.source_version,contentSha256:p.content_sha256,completeness:p.completeness,units:JSON.parse(p.units_json),blocks:JSON.parse(p.blocks_json),issues:JSON.parse(p.issues_json)});
 }
 return {rows,parsedMaterials,issues,pendingJobIds};
}
