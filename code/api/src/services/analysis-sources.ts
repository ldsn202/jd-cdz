import {createExternalClient,type SourceMaterialRef,type WorkOrderContextData} from './external/index';
import type {Bindings} from '../index';
import {ServiceError} from './change-batch';
export type AnalysisItem={id:string;service_provider_id:string;item_kind:string;business_identity_json:string;installation_work_order_id:string|null;integration_config_id:string|null;wo_source_id:string|null;wo_source_system:string|null;row_version:number;analysis_generation:number;status:string;pending_write_id:string|null};
export type AnalysisRecord={inputId:string;recordType:string;sourceSystem:string;sourceRecordId:string;sourceVersion:string|null;data:Record<string,unknown>};
type Reference={recordType:string;sourceSystem:string;sourceRecordId:string};
export async function sourceReferences(db:D1Database,item:AnalysisItem):Promise<Reference[]> {
 const found:Reference[]=[];const tuple=JSON.parse(item.business_identity_json);
 if(Array.isArray(tuple)&&tuple.length===9&&tuple[0]===item.service_provider_id&&tuple[1]===item.item_kind)found.push({recordType:tuple[5],sourceSystem:tuple[6],sourceRecordId:tuple[7]});
 const activities=await db.prepare('SELECT details_json FROM activity_record WHERE work_item_id=? ORDER BY gmt_create DESC').bind(item.id).all<{details_json:string}>();
 for(const row of activities.results){const refs=JSON.parse(row.details_json).sourceReferences;if(Array.isArray(refs))found.push(...refs);}
 // Uploaded rows are reread from our stored file, never from an external provider endpoint.
 const previous=await db.prepare(`SELECT i.record_type,i.source_system,i.source_record_id FROM analysis_input_item i JOIN analysis_input_snapshot s ON s.id=i.snapshot_id WHERE s.work_item_id=? AND i.input_kind='RECORD' AND COALESCE(json_extract(i.data_json,'$.uploadedMaterial.sourceSystem'),'')<>'LOCAL_UPLOAD'`).bind(item.id).all<{record_type:string;source_system:string;source_record_id:string}>();
 for(const r of previous.results)found.push({recordType:r.record_type,sourceSystem:r.source_system,sourceRecordId:r.source_record_id});
 return [...new Map(found.filter(r=>r&&['PROVIDER_RECORD','JD_BILL','PROVIDER_RECEIVABLE'].includes(r.recordType)&&r.sourceSystem&&r.sourceRecordId).map(r=>[JSON.stringify(r),r])).values()];
}
export async function collectAnalysisSources(db:D1Database,env:Bindings,item:AnalysisItem,skill:string){
 const api=createExternalClient(env),records:AnalysisRecord[]=[],materials:SourceMaterialRef[]=[],issues:string[]=[];
 let context:WorkOrderContextData|null=null;
 function add(type:string,system:string,id:string,version:string|null,data:unknown){
  const existing=records.find(r=>r.recordType===type&&r.sourceSystem===system&&r.sourceRecordId===id);
  if(existing){if(existing.sourceVersion!==version)issues.push(`${type}/${id} 同次读取版本冲突`);return;}
  records.push({inputId:`record-${records.length+1}`,recordType:type,sourceSystem:system,sourceRecordId:id,sourceVersion:version,data:data as Record<string,unknown>});
 }
 function scope(provider:string,wo?:string|null){if(provider!==item.service_provider_id||(wo!=null&&wo!==item.wo_source_id))throw new ServiceError(422,42201,'来源记录与事项服务商或工单范围不一致');}
 if(item.wo_source_id){
  context=await api.workOrderContext.getContext(item.wo_source_id);const wo=context.installationWorkOrder;scope(wo.serviceProviderId,wo.installationWorkOrderId);
  if(wo.sourceSystem!==item.wo_source_system)throw new ServiceError(422,42201,'工单来源系统范围不一致');
  add('INSTALLATION_WORK_ORDER',wo.sourceSystem,wo.installationWorkOrderId,wo.sourceVersion,wo);
  if(context.installationPlan){const p=context.installationPlan;scope(wo.serviceProviderId,p.installationWorkOrderId);add('INSTALLATION_PLAN',p.sourceSystem,p.installationPlanId,p.sourceVersion,p);}
  if(context.installationDetail){const d=context.installationDetail;scope(wo.serviceProviderId,d.installationWorkOrderId);add('INSTALLATION_DETAIL',d.sourceSystem,d.installationDetailId,d.sourceVersion,d);}
  if(skill!=='RECONCILIATION_EXPLANATION')materials.push(...context.sourceMaterials);
  if(context.completeness!=='COMPLETE'||!context.sourceMaterialIndexComplete)issues.push('工单上下文或材料索引不完整');
  issues.push(...context.missingParts);
  if(wo.purchaseOrderId){
   const e=await api.entitlements.getEntitlements(wo.purchaseOrderId,item.wo_source_id);
   if(e.installationWorkOrderId!==item.wo_source_id||e.workOrderSourceVersion!==wo.sourceVersion)issues.push('安装权益与工单版本不一致');
   if(e.completeness!=='COMPLETE'||!e.entitlementListComplete)issues.push('安装权益列表不完整');
   if(e.purchaseOrder){const p=e.purchaseOrder;add('PURCHASE_ORDER',p.sourceSystem,p.purchaseOrderId,p.sourceVersion,p);}
   for(const x of e.entitlements)add('INSTALLATION_ENTITLEMENT',x.sourceSystem,x.installationEntitlementId,x.sourceVersion,x);
  }else if(skill==='INSTALLATION_EVIDENCE')issues.push('工单缺少采购单，无法查询权益');
 }
 for(const ref of await sourceReferences(db,item)){
  if(ref.recordType==='PROVIDER_RECORD'&&['INTEGRATION_CONFIGURATION','INSTALLATION_EXTRACTION'].includes(skill)){
   const d=await api.providerDocuments.getDocuments(ref.sourceSystem,item.service_provider_id,ref.sourceRecordId);scope(d.sourceRecord.serviceProviderId,d.sourceRecord.installationWorkOrderId);
   if(d.sourceRecord.sourceSystem!==ref.sourceSystem||d.sourceRecord.sourceRecordId!==ref.sourceRecordId)throw new ServiceError(422,42201,'资料来源范围不一致');
   if(!d.sourceRecord.configurationPurpose||!d.sourceRecord.businessScopeKey)issues.push('CONFIGURATION_SCOPE：来源未明确配置用途与业务范围');
   if(skill==='INSTALLATION_EXTRACTION'&&(d.sourceRecord.purpose!=='INSTALLATION'||d.sourceRecord.installationWorkOrderId!==item.wo_source_id)){issues.push('服务商资料未证明是本工单实际安装记录，不能使用配置样例代替施工事实');continue;}
   if(skill==='INTEGRATION_CONFIGURATION'&&item.integration_config_id){const cfg=await db.prepare('SELECT source_system,purpose,business_scope_key FROM integration_config WHERE id=? AND service_provider_id=?').bind(item.integration_config_id,item.service_provider_id).first<{source_system:string;purpose:string;business_scope_key:string}>();if(!cfg||cfg.source_system!==ref.sourceSystem||cfg.purpose!==d.sourceRecord.configurationPurpose||cfg.business_scope_key!==d.sourceRecord.businessScopeKey)issues.push('来源用途或业务范围与配置身份不一致');}
   add('PROVIDER_RECORD',ref.sourceSystem,ref.sourceRecordId,d.sourceRecord.sourceVersion,d);materials.push(...d.sourceMaterials);
   if(d.formatDefinition){const f=d.formatDefinition;add('PROVIDER_FORMAT',ref.sourceSystem,f.formatId,f.sourceVersion,f);materials.push(...f.sourceMaterials);}
  }
  if(skill==='RECONCILIATION_EXPLANATION'&&item.wo_source_id&&ref.recordType==='JD_BILL'){
   const b=await api.jdBill.getBill(ref.sourceRecordId,item.wo_source_id);scope(b.serviceProviderId,b.installationWorkOrderId);
   if(b.sourceSystem!==ref.sourceSystem||b.jdBillId!==ref.sourceRecordId)throw new ServiceError(422,42201,'京东账单来源范围不一致');
   add('JD_BILL',b.sourceSystem,b.jdBillId,b.sourceVersion,b);
  }
  if(skill==='RECONCILIATION_EXPLANATION'&&item.wo_source_id&&ref.recordType==='PROVIDER_RECEIVABLE'){
   const b=await api.providerReceivable.getReceivable(ref.sourceSystem,item.service_provider_id,ref.sourceRecordId,item.wo_source_id);scope(b.serviceProviderId,b.installationWorkOrderId);
   if(b.sourceSystem!==ref.sourceSystem||b.providerReceivableId!==ref.sourceRecordId)throw new ServiceError(422,42201,'原应收来源范围不一致');
   add('PROVIDER_RECEIVABLE',b.sourceSystem,b.providerReceivableId,b.sourceVersion,b);
  }
 }
 if(skill==='RECONCILIATION_EXPLANATION'&&item.wo_source_id){
  const e=await api.billingTerms.getFeeEvidence(item.wo_source_id,item.service_provider_id);scope(e.serviceProviderId,e.installationWorkOrderId);
  if(e.completeness!=='COMPLETE'||!e.termListComplete||!e.approvalListComplete)issues.push('费用依据查询不完整');
  if(e.workOrderSourceVersion!==context?.installationWorkOrder.sourceVersion)issues.push('费用依据与工单版本不一致');
  for(const [type,values] of [['BILLING_TERM',e.terms],['FEE_APPROVAL_RECORD',e.approvals]] as const)for(const r of values){add(type,r.sourceSystem,r.sourceRecordId,r.sourceVersion,{...r,_lookup:{lookupScope:e.lookupScope,termListComplete:e.termListComplete,approvalListComplete:e.approvalListComplete,completeness:e.completeness}});materials.push(...r.materialReferences);}
 }
 if(skill==='INSTALLATION_EVIDENCE'){
  const replies=await db.prepare(`SELECT r.id,r.reply_text,r.materials_json,r.success_verified_at,x.source_system,x.receipt_json
   FROM supplemental_response r JOIN external_write_operation x ON x.human_decision_id=r.submit_decision_id
   WHERE r.work_item_id=? AND r.service_provider_id=? AND r.success_verified_at IS NOT NULL AND x.status='SUCCEEDED'
   ORDER BY r.gmt_create,r.id`).bind(item.id,item.service_provider_id).all<{id:string;reply_text:string;materials_json:string;success_verified_at:number;source_system:string;receipt_json:string}>();
  for(const reply of replies.results){
   const source=JSON.parse(reply.receipt_json).sourceRecord;
   if(!source?.sourceRecordId||!source.sourceVersion){issues.push('补充回复尚缺可靠来源版本');continue;}
   add('SUPPLEMENTAL_RESPONSE',reply.source_system,source.sourceRecordId,source.sourceVersion,{
    installationWorkOrderId:item.wo_source_id,serviceProviderId:item.service_provider_id,replyText:reply.reply_text,
    sourceMaterials:JSON.parse(reply.materials_json),verifiedAt:new Date(reply.success_verified_at).toISOString(),
   });
  }
 }
 return {records,materials:[...new Map(materials.map(m=>[JSON.stringify([m.sourceSystem,m.sourceMaterialId,m.sourceVersion]),m])).values()],issues,context};
}
