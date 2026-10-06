import {newId, ServiceError} from './change-batch';
import {hasAction} from './permission-guard';
import type {ResolvedIdentity} from './identity';
import type {WorkItemRow} from './work-item-query';

export async function readMaterialTexts(db:D1Database,itemId:string){
 const rows=await db.prepare(`SELECT DISTINCT v.id materialVersionId,v.name,v.media_type mediaType,p.id parsingId,p.profile_id profileId,
 p.completeness,p.units_json,p.blocks_json FROM background_job j
 JOIN source_material_version v ON v.id=json_extract(j.target_json,'$.materialVersionId')
 JOIN material_parsing p ON p.id=(SELECT id FROM material_parsing WHERE source_material_version_id=v.id ORDER BY gmt_create DESC,id DESC LIMIT 1)
 WHERE j.work_item_id=? AND j.purpose='PARSE_MATERIAL' AND v.media_type IN ('application/pdf','image/png','image/jpeg')`).bind(itemId).all<any>();
 return rows.results.map(r=>({...r,units:JSON.parse(r.units_json).map((u:any)=>({...u,
   text:JSON.parse(r.blocks_json).filter((b:any)=>b.unitId===u.unitId&&b.kind==='TEXT')
     .sort((a:any,b:any)=>Number(b.blockId.endsWith(':text'))-Number(a.blockId.endsWith(':text')))[0]?.text??''
 })),units_json:undefined,blocks_json:undefined}));
}
export function canReviewMaterialText(identity:ResolvedIdentity,row:WorkItemRow){
 return identity.subjectType==='HUMAN'&&row.assignee_identity_id===identity.identityId&&!row.pending_write_id
  &&['PREPARING','READY','BLOCKED','WAITING_SUPPLEMENT'].includes(row.status)
  &&['CONFIRM_INSTALLATION_DRAFT','SUBMIT_SUPPLEMENT','DECIDE_INSTALLATION_REVIEW'].some(a=>hasAction(identity,a,'SERVICE_PROVIDER',row.service_provider_id));
}
export async function confirmMaterialText(db:D1Database,identity:ResolvedIdentity,row:WorkItemRow,body:any){
 if(!canReviewMaterialText(identity,row))throw new ServiceError(403,40301,'仅当前资料或核查责任人可以核对本事项文字');
 if(!body||body.expectedWorkItemVersion!==row.row_version||body.expectedResponsibilityVersion!==row.responsibility_version)throw new ServiceError(409,40901,'事项已变化，请刷新后核对');
 if(body.acknowledgeTextOnly!==true)throw new ServiceError(400,40001,'请确认已逐页核对，且没有遗漏需要判断的图示、照片或签字信息');
 const current=(await readMaterialTexts(db,row.id)).find(r=>r.materialVersionId===body.materialVersionId);
 if(!current||current.parsingId!==body.parsingId)throw new ServiceError(409,40901,'文件或识别版本已变化，请重新核对');
 if(!Array.isArray(body.units)||body.units.length!==current.units.length
   ||body.units.some((u:any,i:number)=>u.unitId!==current.units[i].unitId||typeof u.text!=='string'||!u.text.trim()||u.text.length>50000))
   throw new ServiceError(400,40001,'请逐页填写完整文字，不能遗漏页面');
 const now=Date.now(),id=newId('human-text'),job=newId('text-review'),call=newId('text-call'),fence=newId('text-fence');
 const material=await db.prepare('SELECT content_sha256 FROM source_material_version WHERE id=?').bind(current.materialVersionId).first<{content_sha256:string}>();
 const units=current.units.map((u:any)=>({unitId:u.unitId,kind:u.kind,index:u.index,name:u.name??null,status:'COMPLETE'}));
 const blocks=body.units.map((u:any)=>({blockId:u.unitId+':human-text',unitId:u.unitId,kind:'TEXT',text:u.text.trim(),cellRange:null,formula:null,cachedValue:null}));
 const provenance={origin:'HUMAN',actorIdentityId:identity.identityId,previousParsingId:current.parsingId,materialVersionId:current.materialVersionId,acknowledgeTextOnly:true};
 await db.batch([
  db.prepare(`UPDATE work_item SET row_version=row_version+1,analysis_generation=analysis_generation+CASE WHEN status='WAITING_SUPPLEMENT' THEN 0 ELSE 1 END,
   current_analysis_result_id=CASE WHEN status='WAITING_SUPPLEMENT' THEN current_analysis_result_id ELSE NULL END,
   status=CASE WHEN status='WAITING_SUPPLEMENT' THEN status ELSE 'PREPARING' END,
   blocked_reason=CASE WHEN status='WAITING_SUPPLEMENT' THEN blocked_reason ELSE NULL END,gmt_modified=?
   WHERE id=? AND row_version=? AND responsibility_version=? AND pending_write_id IS NULL`).bind(now,row.id,row.row_version,row.responsibility_version),
  db.prepare('INSERT INTO transaction_assertion VALUES(?,changes(),?,?)').bind(fence,now,now),
  db.prepare(`INSERT INTO background_job(id,purpose,service_provider_id,work_item_id,target_json,dedupe_key,status,lease_epoch,row_version,outcome_json,gmt_create,gmt_modified)
   VALUES(?,'PARSE_MATERIAL',?,?,?,?, 'SUCCEEDED',0,1,?,?,?)`).bind(job,row.service_provider_id,row.id,JSON.stringify({...provenance,providerId:row.service_provider_id}),id,JSON.stringify(provenance),now,now),
  db.prepare(`INSERT INTO capability_call VALUES(?,?,'PARSE_MATERIAL',?,NULL,'human-text-review','1.0.0',?,?,?,?)`).bind(call,job,current.materialVersionId,JSON.stringify(provenance),material!.content_sha256,now,now),
  db.prepare(`INSERT INTO material_parsing VALUES(?,?,?,?,'human-text-review','1.0.0','COMPLETE',?,?,'[]',?,?)`).bind(id,call,current.materialVersionId,material!.content_sha256,JSON.stringify(units),JSON.stringify(blocks),now,now),
  db.prepare(`INSERT INTO activity_record(id,work_item_id,event_key,event_type,actor_identity_id,occurred_at,details_json,gmt_create,gmt_modified)
   VALUES(?,?,?,'PROGRESS_SAVED',?,?,?,?,?)`).bind(newId('activity'),row.id,id,identity.identityId,now,JSON.stringify({...provenance,description:'逐页核对材料文字；待手动运行分析'}),now,now),
  db.prepare('DELETE FROM transaction_assertion WHERE id=?').bind(fence),
 ]);
 return {parsingId:id,status:'CONFIRMED'};
}
