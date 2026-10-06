import {createExternalClient,type SourceMaterialRef} from './external/index';
import {newId,nowMs,ServiceError} from './change-batch';
import {buildParsingCapability} from './material-parsing';
import type {Bindings} from '../index';
const supported=new Set(['application/pdf','image/png','image/jpeg','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
export async function stageSourceMaterials(db:D1Database,env:Bindings,item:{id:string;service_provider_id:string;analysis_generation:number},refs:SourceMaterialRef[]){
 const statements:D1PreparedStatement[]=[],jobIds:string[]=[],issues:string[]=[];let pending=false;
 const unique=[...new Map(refs.map(ref=>[JSON.stringify([ref.sourceSystem,ref.sourceMaterialId,ref.sourceVersion]),ref])).values()];
 for(const ref of unique){
  let material=await db.prepare('SELECT id FROM source_material WHERE source_system=? AND source_material_id=?').bind(ref.sourceSystem,ref.sourceMaterialId).first<{id:string}>();
  let version=material?await db.prepare('SELECT id,read_state,content_sha256 FROM source_material_version WHERE source_material_id=? AND source_version=?').bind(material.id,ref.sourceVersion).first<{id:string;read_state:string;content_sha256:string|null}>():null;
  if(version&&await db.prepare('SELECT 1 FROM material_parsing WHERE source_material_version_id=? LIMIT 1').bind(version.id).first())continue;
  const now=nowMs();
  if(!version||version.read_state!=='VERIFIED'){
   if(!env.FILES)throw new ServiceError(503,50301,'文件存储 FILES 未配置，不能获取来源原文件');
   const response=await createExternalClient(env).sourceMaterial.getMaterial(ref.sourceSystem,ref.sourceMaterialId,ref.sourceVersion);
   if(response.sourceSystem!==ref.sourceSystem||response.sourceMaterialId!==ref.sourceMaterialId||response.sourceVersion!==ref.sourceVersion)throw new ServiceError(422,42201,'原文件响应与固定来源版本不一致');
   if(!supported.has(response.mediaType)||!response.name||!Number.isSafeInteger(response.byteLength)||response.byteLength<=0||response.byteLength>10*1024*1024||typeof response.contentBase64!=='string'||response.contentBase64.length>Math.ceil(10*1024*1024/3)*4)throw new ServiceError(422,42201,'来源材料类型或大小不符合解析契约');
   const updated=response.sourceUpdatedAt===null?null:Date.parse(response.sourceUpdatedAt);
   if(updated!==null&&(!Number.isFinite(updated)||updated<0))throw new ServiceError(422,42201,'来源更新时间无效');
   let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(response.contentBase64),c=>c.charCodeAt(0));}catch{throw new ServiceError(422,42201,'来源文件不是有效 base64');}
   const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
   if(bytes.byteLength>10*1024*1024||bytes.byteLength!==response.byteLength||sha!==response.contentSha256)throw new ServiceError(422,42201,'来源文件大小或 SHA256 摘要不一致');
   const locator=`source-materials/${sha}`;await env.FILES.put(locator,bytes,{httpMetadata:{contentType:response.mediaType}});
   if(!material){material={id:newId('sm')};statements.push(db.prepare('INSERT INTO source_material VALUES(?,?,?,?,?)').bind(material.id,ref.sourceSystem,ref.sourceMaterialId,now,now));}
   if(version){
    statements.push(db.prepare(`UPDATE source_material_version SET read_state='VERIFIED',name=?,media_type=?,byte_length=?,content_sha256=?,content_locator=?,retrieved_at=?,source_updated_at=?,gmt_modified=? WHERE id=? AND read_state='REFERENCED'`).bind(response.name,response.mediaType,bytes.byteLength,sha,locator,now,updated,now,version.id));
    version={...version,read_state:'VERIFIED',content_sha256:sha};
   }else{version={id:newId('smv'),read_state:'VERIFIED',content_sha256:sha};statements.push(db.prepare(`INSERT INTO source_material_version VALUES(?,?,?,'VERIFIED',?,?,?,?,?,?,?,?,?)`).bind(version.id,material.id,ref.sourceVersion,response.name,response.mediaType,bytes.byteLength,sha,locator,now,updated,now,now));}
  }
  const dedupe=`source-parse:${item.id}:${item.analysis_generation}:${version.id}`;
  const existing=await db.prepare('SELECT id,status FROM background_job WHERE dedupe_key=?').bind(dedupe).first<{id:string;status:string}>();
  if(existing){if(['FAILED','BLOCKED','CANCELLED','SUCCEEDED'].includes(existing.status))issues.push(`原文件解析未产生可用结果：${ref.sourceMaterialId}（${existing.status}）`);else{pending=true;jobIds.push(existing.id);}continue;}
  const jobId=newId('bj');pending=true;jobIds.push(jobId);
  const target={materialVersionId:version.id,providerId:item.service_provider_id,workItemId:item.id,analysisGeneration:item.analysis_generation,origin:'SOURCE_READ',sourceMaterialReference:ref,fileSha256:version.content_sha256};
  statements.push(db.prepare(`INSERT INTO background_job(id,purpose,service_provider_id,work_item_id,target_json,dedupe_key,status,available_at,lease_epoch,row_version,gmt_create,gmt_modified) VALUES(?,'PARSE_MATERIAL',?,?,?,?,'READY',?,0,1,?,?)`).bind(jobId,item.service_provider_id,item.id,JSON.stringify(target),dedupe,now,now,now));
  statements.push(buildParsingCapability(db,{jobId,materialVersionId:version.id,sha256:version.content_sha256!,now}));
 }
 return {statements,pending,jobIds,issues};
}
