import type {WorkOrderContextData} from './external/types';
import type {AnalysisItem} from './analysis-sources';
import {assertConfigurationWrite} from './config-transaction';
import {newId,ServiceError} from './change-batch';
export async function buildAnalysisContext(db:D1Database,item:AnalysisItem,context:WorkOrderContextData|null,now:number){
 const statements:D1PreparedStatement[]=[];if(!context||!item.installation_work_order_id)return {statements,contextSnapshotId:null};
 const wo=await db.prepare('SELECT source_version,context_snapshot_id FROM installation_work_order WHERE id=?').bind(item.installation_work_order_id).first<{source_version:string|null;context_snapshot_id:string|null}>();
 if(!wo)throw new ServiceError(422,42201,'工单不存在');
 const ids:{plan:string|null;detail:string|null}={plan:null,detail:null};
 for(const kind of ['plan','detail'] as const){const value=kind==='plan'?context.installationPlan:context.installationDetail;if(!value)continue;
  const sourceId=kind==='plan'?context.installationPlan!.installationPlanId:context.installationDetail!.installationDetailId;
  const table=`installation_${kind}`;const old=await db.prepare(`SELECT id,installation_work_order_id FROM ${table} WHERE source_system=? AND source_id=?`).bind(value.sourceSystem,sourceId).first<{id:string;installation_work_order_id:string}>();
  if(old&&old.installation_work_order_id!==item.installation_work_order_id)throw new ServiceError(422,42201,'计划或明细属于其他工单');
  ids[kind]=old?.id??newId(kind);
  if(!old)statements.push(db.prepare(`INSERT INTO ${table} VALUES(?,?,?,?,?,?)`).bind(ids[kind],item.installation_work_order_id,value.sourceSystem,sourceId,now,now));
 }
 const missing=[...context.missingParts];if(!context.installationWorkOrder.sourceVersion)missing.push('缺少工单版本');if(!ids.plan)missing.push('缺少安装计划');if(context.installationDetailStatus==='UNKNOWN')missing.push('明细状态未知');if(context.installationDetailStatus==='SUBMITTED'&&!ids.detail)missing.push('已提交明细未返回');if(!context.sourceMaterialIndexComplete)missing.push('材料索引不完整');if(context.completeness!=='COMPLETE'&&!missing.length)missing.push('来源上下文不完整');
 const contextSnapshotId=newId('ctx');
 statements.push(db.prepare(`INSERT INTO installation_context_snapshot VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(contextSnapshotId,item.installation_work_order_id,item.service_provider_id,context.installationWorkOrder.sourceVersion,ids.plan,context.installationPlan?.sourceVersion??null,ids.detail,context.installationDetail?.sourceVersion??null,context.installationDetailStatus,missing.length?'INCOMPLETE':'COMPLETE',JSON.stringify(missing),JSON.stringify(context),Math.min(Date.parse(context.retrievedAt)||now,now),now,now));
 statements.push(db.prepare(`UPDATE installation_work_order SET source_version=?,context_snapshot_id=?,gmt_modified=? WHERE id=? AND source_version IS ? AND context_snapshot_id IS ?`).bind(context.installationWorkOrder.sourceVersion,contextSnapshotId,now,item.installation_work_order_id,wo.source_version,wo.context_snapshot_id));
 statements.push(...assertConfigurationWrite(db,now));
 return {statements,contextSnapshotId};
}
