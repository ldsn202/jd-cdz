import {ServiceError,newId} from './change-batch';
import type {WorkItemRow} from './work-item-query';
export async function currentInstallationBasis(db:D1Database,row:WorkItemRow,fallback:{analysisId:string;contextId:string}){
 const analysis=await db.prepare(`SELECT a.id,a.snapshot_id,a.status,a.open_questions_json,s.analysis_generation,s.required_input_state,json_extract(j.target_json,'$.contextSnapshotId') context_id
  FROM analysis_result a JOIN analysis_input_snapshot s ON s.id=a.snapshot_id JOIN capability_call c ON c.id=a.run_id JOIN background_job j ON j.id=c.job_id
  WHERE a.id=? AND a.work_item_id=? AND s.service_provider_id=? AND s.skill='INSTALLATION_EXTRACTION'`).bind(row.current_analysis_result_id,row.id,row.service_provider_id).first<{id:string;snapshot_id:string;status:string;open_questions_json:string;analysis_generation:number;required_input_state:string;context_id:string|null}>();
 if(!analysis||analysis.analysis_generation!==row.analysis_generation)throw new ServiceError(409,40901,'当前分析输入尚未准备或代次已变，请重新核实');
 const contextId=analysis.context_id??(fallback.analysisId===analysis.id?fallback.contextId:null);
 if(!contextId||!await db.prepare('SELECT 1 FROM installation_context_snapshot WHERE id=? AND installation_work_order_id=? AND service_provider_id=?').bind(contextId,row.installation_work_order_id,row.service_provider_id).first())throw new ServiceError(422,42201,'当前分析缺少与本工单对应的固定上下文');
 const materials=await db.prepare(`SELECT m.source_system sourceSystem,m.source_material_id sourceMaterialId,v.source_version sourceVersion,v.id materialVersionId FROM analysis_input_item i JOIN material_parsing p ON p.id=i.parsing_id JOIN source_material_version v ON v.id=p.source_material_version_id JOIN source_material m ON m.id=v.source_material_id WHERE i.snapshot_id=? AND i.input_kind='PARSED_MATERIAL'`).bind(analysis.snapshot_id).all();
 return {...analysis,contextId,sourceMaterialsJson:JSON.stringify(materials.results)};
}
export function installationInputFence(db:D1Database,row:WorkItemRow,now:number){
 const id=newId('installation-input');
 return [db.prepare(`INSERT INTO transaction_assertion(id,passed,gmt_create,gmt_modified) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM work_item WHERE id=? AND row_version=? AND responsibility_version=? AND analysis_generation=? AND current_analysis_result_id IS ? AND pending_write_id IS NULL AND status IN ('PREPARING','READY','BLOCKED')) THEN 1 ELSE 0 END,?,?`).bind(id,row.id,row.row_version,row.responsibility_version,row.analysis_generation,row.current_analysis_result_id,now,now),db.prepare('DELETE FROM transaction_assertion WHERE id=?').bind(id)];
}
