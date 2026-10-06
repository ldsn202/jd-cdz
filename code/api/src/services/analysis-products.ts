import {buildReconciliationProduct} from './analysis-reconciliation';
import {newId} from './change-batch';
import type {AnalysisItem} from './analysis-sources';
type Finding={findingId:string;type:string;content:Record<string,unknown>;evidenceRefs:unknown[]};
type Result={status:string;findings:Finding[];openQuestions:string[]};
export async function buildAnalysisProducts(db:D1Database,item:AnalysisItem&{current_configuration_version_id:string|null},snapshotId:string,resultId:string,result:Result,contextSnapshotId:string|null,now:number){
 if(item.item_kind==='RECONCILIATION'){const r=await buildReconciliationProduct(db,item,snapshotId,resultId,now);return {...r,ready:r.ready&&['ANALYZED','NEEDS_INFORMATION'].includes(result.status)};}
 const sql:D1PreparedStatement[]=[];
 const guard=`EXISTS(SELECT 1 FROM work_item WHERE id=? AND current_analysis_result_id=? AND analysis_generation=? AND pending_write_id IS NULL AND status NOT IN ('COMPLETED','PROCESSING','WAITING_SUPPLEMENT','WAITING_REPLY','EXCEPTION'))`;
 const args=[item.id,resultId,item.analysis_generation];
 if(item.item_kind==='CONFIGURATION'&&result.findings.length===1){
  const cfg=await db.prepare('SELECT * FROM integration_config WHERE id=? AND service_provider_id=?').bind(item.integration_config_id,item.service_provider_id).first<{id:string;source_system:string;purpose:string;business_scope_key:string}>();
  let content=result.findings[0].content;
  if(!cfg||content.purpose!==cfg.purpose)return {statements:sql,ready:false};
  const human=await db.prepare('SELECT * FROM integration_config_version WHERE id=?').bind(item.current_configuration_version_id).first<{id:string;origin:string;analysis_result_id:string;applicability_json:string;rules_json:string;rule_catalog_version:string;source_format_id:string;source_format_version:string;edit_notes_json:string}>();
  const keepRules=!!human&&(human.origin==='HUMAN'||JSON.parse(human.edit_notes_json).some((note:{inheritedFromCandidateVersionId?:string})=>!!note.inheritedFromCandidateVersionId));
  if(human&&keepRules)content={...content,ruleCatalogVersion:human.rule_catalog_version,sourceFormatId:human.source_format_id,sourceFormatVersion:human.source_format_version,rowPath:JSON.parse(human.applicability_json).rowPath,rules:JSON.parse(human.rules_json)};
  const prior=await db.prepare('SELECT id,version_no FROM integration_config_version WHERE integration_config_id=? ORDER BY version_no DESC LIMIT 1').bind(cfg.id).first<{id:string;version_no:number}>();
  const id=newId('icv');let applicability={serviceProviderId:item.service_provider_id,sourceSystem:cfg.source_system,purpose:cfg.purpose,businessScopeKey:cfg.business_scope_key,formatStatus:'PROVIDED',sourceFormatId:content.sourceFormatId,sourceFormatVersion:content.sourceFormatVersion,rowPath:content.rowPath,conditions:[],basisReferences:result.findings[0].evidenceRefs,unknownConditions:result.openQuestions};
  if(human&&keepRules){
   const old=JSON.parse(human.applicability_json),refs=old.basisReferences as ({inputId:string}|string)[];
   const inputMap=await db.prepare(`SELECT old.input_key old_key,new.input_key new_key FROM analysis_input_item old JOIN analysis_result a ON a.snapshot_id=old.snapshot_id JOIN analysis_input_item new ON new.snapshot_id=? AND new.record_type=old.record_type AND new.source_system=old.source_system AND new.source_record_id=old.source_record_id AND new.source_version IS old.source_version WHERE a.id=?`).bind(snapshotId,human.analysis_result_id).all<{old_key:string;new_key:string}>();
   let unresolved=false;const mapped=refs.map(ref=>{const key=typeof ref==='string'?ref:ref.inputId,match=inputMap.results.find(r=>r.old_key===key);if(!match){unresolved=true;return ref;}return typeof ref==='string'?match.new_key:{...ref,inputId:match.new_key};});
   applicability={...old,basisReferences:mapped,unknownConditions:[...(old.unknownConditions??[]),...(unresolved?['继承人工规则的原含义依据未在当前输入中核实']:[])]};
  }
  sql.push(db.prepare(`INSERT INTO integration_config_version SELECT ?,?,?,?,?,?,'AI',NULL,?,'PROVIDED',?,?,?,?,?,?,?, ?,? WHERE ${guard}`).bind(id,cfg.id,item.id,(prior?.version_no??0)+1,prior?.id??null,resultId,`analysis:${resultId}`,content.sourceFormatId,content.sourceFormatVersion,JSON.stringify(applicability),JSON.stringify(content.rules),JSON.stringify(result.openQuestions),content.ruleCatalogVersion,JSON.stringify(human&&keepRules?[{inheritedFromCandidateVersionId:human.id,reason:'保留人工规则，使用当前固定输入重新试转换'}]:[]),now,now,...args));
  sql.push(db.prepare(`UPDATE work_item SET current_configuration_version_id=?,row_version=row_version+1,gmt_modified=? WHERE id=? AND current_analysis_result_id=? AND EXISTS(SELECT 1 FROM integration_config_version WHERE id=?)`).bind(id,now,item.id,resultId,id));
  const jobId=newId('bj');sql.push(db.prepare(`INSERT INTO background_job(id,purpose,service_provider_id,work_item_id,target_json,dedupe_key,status,available_at,lease_epoch,row_version,gmt_create,gmt_modified) SELECT ?,'TRIAL_CONFIG',?,?,?,?,'READY',?,0,1,?,? WHERE ${guard} AND EXISTS(SELECT 1 FROM integration_config_version WHERE id=?)`).bind(jobId,item.service_provider_id,item.id,JSON.stringify({configurationId:cfg.id,configurationVersionId:id,workItemId:item.id}),`trial:analysis:${resultId}`,now,now,now,...args,id));
  return {statements:sql,ready:result.status==='ANALYZED'};
 }
 if(item.item_kind==='INSTALLATION_PREPARATION'&&result.findings.length&&contextSnapshotId){
  const context=await db.prepare('SELECT completeness FROM installation_context_snapshot WHERE id=? AND installation_work_order_id=? AND service_provider_id=?').bind(contextSnapshotId,item.installation_work_order_id,item.service_provider_id).first<{completeness:string}>();
  if(!context)return {statements:sql,ready:false};
  const prior=await db.prepare(`SELECT d.id,d.current_version_id,v.version_no,v.origin FROM installation_draft d JOIN installation_draft_version v ON v.id=d.current_version_id WHERE d.work_item_id=?`).bind(item.id).first<{id:string;current_version_id:string;version_no:number;origin:string}>();
  if(prior?.origin==='HUMAN')return {statements:sql,ready:true};
  const materials=await db.prepare(`SELECT v.id materialVersionId,m.source_system sourceSystem,m.source_material_id sourceMaterialId,v.source_version sourceVersion FROM analysis_input_item i JOIN material_parsing p ON p.id=i.parsing_id JOIN source_material_version v ON v.id=p.source_material_version_id JOIN source_material m ON m.id=v.source_material_id WHERE i.snapshot_id=? AND i.input_kind='PARSED_MATERIAL'`).bind(snapshotId).all();
  const draftId=prior?.id??newId('draft'),versionId=newId('draft-version');
  sql.push(db.prepare(`INSERT INTO installation_draft_version SELECT ?,?,?,?,?,?,?,'AI',NULL,?,?,?,'[]',?,?,? WHERE ${guard}`).bind(versionId,draftId,item.id,(prior?.version_no??0)+1,prior?.current_version_id??null,resultId,contextSnapshotId,JSON.stringify(result.findings.map(f=>f.content)),JSON.stringify(materials.results),JSON.stringify(result.openQuestions),`analysis:${resultId}`,now,now,...args));
  if(prior)sql.push(db.prepare(`UPDATE installation_draft SET current_version_id=?,row_version=row_version+1,gmt_modified=? WHERE id=? AND current_version_id=? AND EXISTS(SELECT 1 FROM installation_draft_version WHERE id=?)`).bind(versionId,now,draftId,prior.current_version_id,versionId));
  else sql.push(db.prepare(`INSERT INTO installation_draft SELECT ?,?,?,1,?,? WHERE EXISTS(SELECT 1 FROM installation_draft_version WHERE id=?)`).bind(draftId,item.id,versionId,now,now,versionId));
  return {statements:sql,ready:result.status==='ANALYZED'&&context.completeness==='COMPLETE'};
 }
 return {statements:sql,ready:item.item_kind==='INSTALLATION_REVIEW'&&result.status==='ANALYZED'};
}
