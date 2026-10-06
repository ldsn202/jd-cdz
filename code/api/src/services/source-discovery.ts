import {discoverConfiguration} from './configuration-discovery';
import {createExternalClient,type ExternalEnv} from './external';
import {newId,ServiceError} from './change-batch';
import {resolveResponsibility} from './responsibility';

type Job={id:string;service_provider_id:string;target_json:string};
type Change={id:string;source_system:string;record_type:string;source_record_id:string;source_version:string|null;change_type:string;association_completeness:string;associations_json:string};
export type DiscoveryAdoption={statements:D1PreparedStatement[];jobStatus:'SUCCEEDED'|'BLOCKED'|'RETRY_WAIT';result:{workItemIds:string[];issues:string[]}};
export function scheduleInputPreparation(db:D1Database,itemId:string,generation:number,providerId:string,now:number){
 const key=`prepare-input:${itemId}:${generation}`;
 return db.prepare(`INSERT INTO background_job(id,purpose,service_provider_id,work_item_id,target_json,dedupe_key,status,available_at,lease_epoch,row_version,gmt_create,gmt_modified)
 SELECT ?,'READ_SOURCE',?,?,?,?,'READY',?,0,1,?,? WHERE NOT EXISTS(SELECT 1 FROM background_job WHERE dedupe_key=?)`)
 .bind(newId('read-source'),providerId,itemId,JSON.stringify({workItemId:itemId,analysisGeneration:generation}),key,now,now,now,key);
}
const sha=async(value:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function sourceVersionAlreadyIncluded(db:D1Database,itemId:string,generation:number,change:{record_type:string;source_record_id:string;source_version:string|null},sourceSystem:string){
 return !!await db.prepare(`SELECT 1 FROM analysis_input_snapshot s JOIN analysis_input_item i ON i.snapshot_id=s.id
  WHERE s.work_item_id=? AND s.analysis_generation=? AND i.input_kind='RECORD' AND i.record_type=?
   AND i.source_system=? AND i.source_record_id=? AND i.source_version=? LIMIT 1`)
 .bind(itemId,generation,change.record_type,sourceSystem,change.source_record_id,change.source_version).first();
}
export async function buildSourceDiscovery(db:D1Database,env:ExternalEnv,job:Job):Promise<DiscoveryAdoption>{
 const target=JSON.parse(job.target_json),empty=(issue:string):DiscoveryAdoption=>({statements:[],jobStatus:'BLOCKED',result:{workItemIds:[],issues:[issue]}});
 const change=await db.prepare(`SELECT c.*,f.source_system FROM source_change c JOIN change_feed f ON f.id=c.feed_id WHERE c.id=? AND f.service_provider_id=?`).bind(target.changeId,job.service_provider_id).first<Change>();
 if(!change)throw new ServiceError(404,40404,'来源变化不属于任务服务商');
 // A reliably adopted local review already applied its handoff/completion. Its
 // echoed source event must not open the same stage again after approval.
 if(['INSTALLATION_REVIEW','SUPPLEMENTAL_RESPONSE'].includes(change.record_type)){
  const applied=await db.prepare(`SELECT work_item_id FROM external_write_operation WHERE service_provider_id=? AND status='SUCCEEDED'
    AND json_extract(receipt_json,'$.sourceRecord.sourceRecordId')=? AND json_extract(receipt_json,'$.sourceRecord.sourceVersion')=?`)
    .bind(job.service_provider_id,change.source_record_id,change.source_version).first<{work_item_id:string}>();
  if(applied)return {statements:[],jobStatus:'SUCCEEDED',result:{workItemIds:[applied.work_item_id],issues:[]}};
 }
 if(['INSTALLATION_WORK_ORDER','INSTALLATION_DETAIL'].includes(change.record_type)){
  const applied=await db.prepare(`SELECT x.work_item_id FROM external_write_operation x
   JOIN installation_work_order wo ON wo.id=x.installation_work_order_id
   WHERE x.service_provider_id=? AND x.status='SUCCEEDED' AND (
    (?='INSTALLATION_WORK_ORDER' AND wo.source_id=? AND json_extract(x.receipt_json,'$.sourceRecord.workOrderSourceVersion')=?) OR
    (?='INSTALLATION_DETAIL' AND json_extract(x.receipt_json,'$.installationDetail.installationDetailId')=? AND json_extract(x.receipt_json,'$.installationDetail.sourceVersion')=?))`)
   .bind(job.service_provider_id,change.record_type,change.source_record_id,change.source_version,change.record_type,change.source_record_id,change.source_version).first<{work_item_id:string}>();
  if(applied)return {statements:[],jobStatus:'SUCCEEDED',result:{workItemIds:[applied.work_item_id],issues:[]}};
 }
 if(change.change_type!=='UPSERT'||!change.source_version)return empty('来源已移除或缺少确定版本，需要核实后续业务');
 if(change.record_type==='PROVIDER_RECORD'&&!JSON.parse(change.associations_json).length)return discoverConfiguration(db,env,job.service_provider_id,change);
 if(change.association_completeness!=='COMPLETE')return empty('来源未提供完整工单关联，不能猜测或只处理部分工单');
 const orders=JSON.parse(change.associations_json) as string[];
 if(!orders.length)return empty('来源缺少工单关联或已核实配置范围');
 const external=createExternalClient(env),statements:D1PreparedStatement[]=[],workItemIds:string[]=[];
 // Build everything before committing: one inaccessible shared association blocks the whole change.
 for(const sourceOrderId of [...new Set(orders)]){
  const ctx=await external.workOrderContext.getContext(sourceOrderId);
  if(ctx.installationWorkOrder.installationWorkOrderId!==sourceOrderId||ctx.installationWorkOrder.serviceProviderId!==job.service_provider_id) return empty('关联工单身份或服务商不匹配');
  const exactRecord=change.record_type==='INSTALLATION_WORK_ORDER'?{id:ctx.installationWorkOrder.installationWorkOrderId,version:ctx.installationWorkOrder.sourceVersion}
    :change.record_type==='INSTALLATION_PLAN'&&ctx.installationPlan?{id:ctx.installationPlan.installationPlanId,version:ctx.installationPlan.sourceVersion}
    :change.record_type==='INSTALLATION_DETAIL'&&ctx.installationDetail?{id:ctx.installationDetail.installationDetailId,version:ctx.installationDetail.sourceVersion}:null;
  if(['INSTALLATION_WORK_ORDER','INSTALLATION_PLAN','INSTALLATION_DETAIL'].includes(change.record_type)&&(!exactRecord||exactRecord.id!==change.source_record_id||exactRecord.version!==change.source_version))return empty('变化版本与当前来源正文不一致，未按旧变化生成新结果');
  const wo=await db.prepare('SELECT id FROM installation_work_order WHERE source_system=? AND source_id=? AND current_service_provider_id=?').bind(ctx.installationWorkOrder.sourceSystem,sourceOrderId,job.service_provider_id).first<{id:string}>();
  if(!wo)return empty('关联工单尚未通过来源初始化核实');
  let kind:string,action:string,problemType:string,problemSystem:string,problemId:string,referenceSystem=change.source_system;
  if(['JD_BILL','PROVIDER_RECEIVABLE','BILLING_TERM','FEE_APPROVAL_RECORD'].includes(change.record_type)){
   kind='RECONCILIATION';action='REQUEST_BILLING_VERIFICATION';problemType='INSTALLATION_WORK_ORDER';problemSystem=ctx.installationWorkOrder.sourceSystem;problemId=sourceOrderId;
   if(change.record_type==='JD_BILL'){
    const bill=await external.jdBill.getBill(change.source_record_id,sourceOrderId);if(bill.jdBillId!==change.source_record_id||bill.serviceProviderId!==job.service_provider_id||bill.installationWorkOrderId!==sourceOrderId||bill.sourceVersion!==change.source_version)return empty('京东账单身份、范围或版本不匹配');referenceSystem=bill.sourceSystem;
   }
  }else if(['INSTALLATION_WORK_ORDER','INSTALLATION_PLAN','INSTALLATION_DETAIL','PROVIDER_RECORD','SOURCE_MATERIAL','PURCHASE_ORDER','INSTALLATION_ENTITLEMENT','SUPPLEMENTAL_RESPONSE','INSTALLATION_REVIEW'].includes(change.record_type)){
   if(ctx.installationDetailStatus==='NOT_SUBMITTED'){
    if(!ctx.installationPlan)return empty('工单尚无可核实的安装方案');
    kind='INSTALLATION_PREPARATION';action='SUBMIT_INSTALLATION_DETAIL';problemType='INSTALLATION_PLAN';problemSystem=ctx.installationPlan.sourceSystem;problemId=ctx.installationPlan.installationPlanId;
   }else if(ctx.installationDetailStatus==='SUBMITTED'&&ctx.installationDetail){
    kind='INSTALLATION_REVIEW';action='DECIDE_INSTALLATION_REVIEW';problemType='INSTALLATION_DETAIL';problemSystem=ctx.installationDetail.sourceSystem;problemId=ctx.installationDetail.installationDetailId;
   }else return empty('正式明细阶段尚未核实');
   if(['INSTALLATION_WORK_ORDER','INSTALLATION_PLAN','INSTALLATION_DETAIL'].includes(change.record_type))referenceSystem=ctx.installationWorkOrder.sourceSystem;
  }else return empty(`来源类型${change.record_type}缺少已核实业务范围，未生成事项`);
  const identity=[job.service_provider_id,kind,'INSTALLATION_WORK_ORDER',ctx.installationWorkOrder.sourceSystem,sourceOrderId,problemType,problemSystem,problemId,action];
  const identityJson=JSON.stringify(identity),key=await sha(identityJson),now=Date.now();
  const creation=`source:${change.source_system}:${change.record_type}:${change.source_record_id}:${change.source_version}:${sourceOrderId}:${kind}`;
  const created=await db.prepare('SELECT id FROM work_item WHERE creation_key=?').bind(creation).first<{id:string}>();
  if(created){workItemIds.push(created.id);continue;}
  let current=await db.prepare(`SELECT id,business_identity_json,status,row_version,analysis_generation FROM work_item WHERE service_provider_id=? AND item_kind=? AND business_key=? AND status<>'COMPLETED'`).bind(job.service_provider_id,kind,key).first<{id:string;business_identity_json:string;status:string;row_version:number;analysis_generation:number}>();
  let legacyReview=false;
  if(!current&&kind==='INSTALLATION_REVIEW'){
   current=await db.prepare(`SELECT w.id,w.business_identity_json,w.status,w.row_version,w.analysis_generation FROM work_item w JOIN external_write_operation x ON w.creation_key='review:'||x.id WHERE w.installation_work_order_id=? AND w.service_provider_id=? AND w.item_kind='INSTALLATION_REVIEW' AND w.status<>'COMPLETED' AND x.status='SUCCEEDED' AND json_extract(x.receipt_json,'$.installationDetail.sourceSystem')=? AND json_extract(x.receipt_json,'$.installationDetail.installationDetailId')=? ORDER BY w.gmt_create,w.id LIMIT 1`).bind(wo.id,job.service_provider_id,problemSystem,problemId).first<typeof current>();
   legacyReview=!!current;
  }
  if(current&&!legacyReview&&current.business_identity_json!==identityJson)throw new ServiceError(409,40901,'业务身份摘要冲突');
  // The source feed can arrive after a manual analysis already read this exact
  // version. Do not invalidate that result or reopen a completed review.
  const evaluated=current??await db.prepare(`SELECT id,analysis_generation FROM work_item WHERE service_provider_id=? AND item_kind=? AND business_key=? AND status='COMPLETED' ORDER BY gmt_create DESC LIMIT 1`).bind(job.service_provider_id,kind,key).first<{id:string;analysis_generation:number}>();
  if(evaluated&&await sourceVersionAlreadyIncluded(db,evaluated.id,evaluated.analysis_generation,change,referenceSystem)){
   workItemIds.push(evaluated.id);continue;
  }
  if(current&&['PROCESSING','WAITING_SUPPLEMENT','WAITING_REPLY','EXCEPTION'].includes(current.status)){
   const staleComparison=kind==='RECONCILIATION'?[db.prepare(`UPDATE work_item SET current_reconciliation_id=NULL,current_analysis_result_id=NULL,row_version=row_version+1,gmt_modified=? WHERE id=? AND (current_reconciliation_id IS NOT NULL OR current_analysis_result_id IS NOT NULL) AND row_version=? AND status=?`).bind(now,current.id,current.row_version,current.status)]:[];
   return {statements:staleComparison,jobStatus:'RETRY_WAIT',result:{workItemIds:[],issues:['事项正等待外部结果或人员回复；变化保留为待重试，尚未消费']}};
  }

  const itemId=current?.id??newId('work'),eventKey=`source-change:${change.id}`;
  if(await db.prepare('SELECT id FROM activity_record WHERE work_item_id=? AND event_key=?').bind(itemId,eventKey).first()){workItemIds.push(itemId);continue;}
  let generation=current?.analysis_generation??1;
  if(!created&&!current){
   const assignee=await resolveResponsibility(db,job.service_provider_id,action);
   const title=kind==='RECONCILIATION'?'安装费用核对':kind==='INSTALLATION_REVIEW'?'安装资料核查':'安装资料整理';
   statements.push(db.prepare(`INSERT INTO work_item(id,service_provider_id,installation_work_order_id,item_kind,business_key,business_identity_json,creation_key,title,status,assignee_identity_id,blocked_reason,gmt_create,gmt_modified) VALUES(?,?,?,?,?,?,?,?,'PREPARING',?,?,?,?)`).bind(itemId,job.service_provider_id,wo.id,kind,key,identityJson,creation,title+' · '+sourceOrderId,assignee,assignee?null:'RESPONSIBILITY_UNRESOLVED',now,now));
  }else if(current&&!['PROCESSING','WAITING_SUPPLEMENT','WAITING_REPLY','EXCEPTION'].includes(current.status)){
   generation++;
   statements.push(db.prepare(`UPDATE work_item SET analysis_generation=analysis_generation+1,current_analysis_result_id=NULL,current_reconciliation_id=NULL,status='PREPARING',row_version=row_version+1,gmt_modified=? WHERE id=? AND row_version=? AND pending_write_id IS NULL`).bind(now,itemId,current.row_version));
   const id=newId('source-assert');statements.push(db.prepare('INSERT INTO transaction_assertion VALUES(?,changes(),?,?)').bind(id,now,now),db.prepare('DELETE FROM transaction_assertion WHERE id=?').bind(id));
  }
  statements.push(db.prepare(`INSERT INTO activity_record(id,work_item_id,event_key,event_type,fact_type,fact_id,details_json,gmt_create,gmt_modified) VALUES(?,?,?,'SOURCE_CHANGE_RECORDED','SOURCE_CHANGE',?,?,?,?)`).bind(newId('activity'),itemId,eventKey,change.id,JSON.stringify({sourceReferences:[{recordType:change.record_type,sourceSystem:referenceSystem,sourceRecordId:change.source_record_id,sourceVersion:change.source_version}],sourceChangeId:change.id}),now,now));
  if(!created&&(!current||!['PROCESSING','WAITING_SUPPLEMENT','WAITING_REPLY','EXCEPTION'].includes(current.status)))statements.push(scheduleInputPreparation(db,itemId,generation,job.service_provider_id,now));
  workItemIds.push(itemId);
 }
 return {statements,jobStatus:'SUCCEEDED',result:{workItemIds,issues:[]}};
}
