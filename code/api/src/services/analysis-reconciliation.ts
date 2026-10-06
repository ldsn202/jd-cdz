import {newId} from './change-batch';
import type {AnalysisItem} from './analysis-sources';
import {calculateReconciliation,type BillInput} from './reconciliation-calculation';
export async function buildReconciliationProduct(db:D1Database,item:AnalysisItem,snapshotId:string,resultId:string|null,now:number,prepared?:{rows:(BillInput&{source_system:string;source_record_id:string})[];complete:boolean}){
 const statements:D1PreparedStatement[]=[];
 if(!item.installation_work_order_id)return {statements,ready:false};
 const wo=await db.prepare('SELECT source_id FROM installation_work_order WHERE id=?').bind(item.installation_work_order_id).first<{source_id:string}>();
 if(!wo)return {statements,ready:false};
 const existing=await db.prepare('SELECT id,status FROM reconciliation_record WHERE snapshot_id=? AND work_item_id=? ORDER BY gmt_create DESC LIMIT 1').bind(snapshotId,item.id).first<{id:string;status:string}>();
 if(existing&&resultId){statements.push(db.prepare(`INSERT INTO reconciliation_analysis_link SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM work_item WHERE id=? AND current_analysis_result_id=? AND analysis_generation=? AND status IN ('PREPARING','READY','BLOCKED') AND pending_write_id IS NULL)`).bind(newId('reconciliation-analysis'),existing.id,resultId,now,now,item.id,resultId,item.analysis_generation));return {statements,ready:existing.status!=='NEEDS_INFORMATION',id:existing.id};}
 const snapshot=prepared?{required_input_state:prepared.complete?'COMPLETE':'INCOMPLETE'}:await db.prepare('SELECT required_input_state FROM analysis_input_snapshot WHERE id=?').bind(snapshotId).first<{required_input_state:string}>();
 const rows=prepared?{results:prepared.rows}:await db.prepare("SELECT * FROM analysis_input_item WHERE snapshot_id=? AND input_kind='RECORD'").bind(snapshotId).all<BillInput&{source_system:string;source_record_id:string}>();
 const open=await db.prepare(`SELECT 1 FROM fee_verification_action f JOIN reconciliation_record r ON r.id=f.reconciliation_id WHERE r.work_item_id=? AND f.action_kind='QUESTION' AND f.is_closed=0 LIMIT 1`).bind(item.id).first();
 const comparison=calculateReconciliation(rows.results,wo.source_id,item.service_provider_id,snapshot?.required_input_state==='COMPLETE',!!open);
 const guard=`EXISTS(SELECT 1 FROM work_item WHERE id=? ${resultId?'AND current_analysis_result_id=?':''} AND analysis_generation=? AND pending_write_id IS NULL AND status IN ('PREPARING','READY','BLOCKED'))`,args=resultId?[item.id,resultId,item.analysis_generation]:[item.id,item.analysis_generation];
 const selected:unknown[]=[],basis:unknown[]=[],lookups:unknown[]=[];
 for(const r of rows.results){
  if(['JD_BILL','PROVIDER_RECEIVABLE'].includes(r.record_type)){
   const side=r.record_type==='JD_BILL'?'JD':'PROVIDER';
   const old=await db.prepare(`SELECT id,service_provider_id,side FROM billing_document WHERE source_system=? AND source_id=? AND side=? AND (?='JD' OR service_provider_id=?)`).bind(r.source_system,r.source_record_id,side,side,item.service_provider_id).first<{id:string;service_provider_id:string;side:string}>();
   if(old&&old.service_provider_id!==item.service_provider_id)throw new Error('账单所属服务商与分析范围冲突');
   const id=old?.id??newId('bill');if(!old)statements.push(db.prepare(`INSERT INTO billing_document SELECT ?,?,?,?,?,?,? WHERE ${guard}`).bind(id,side,r.source_system,r.source_record_id,item.service_provider_id,now,now,...args));
   selected.push({billingDocumentId:id,inputItemId:r.id});
  }
  if(['BILLING_TERM','FEE_APPROVAL_RECORD'].includes(r.record_type)){
   const kind=r.record_type==='BILLING_TERM'?'TERM':'APPROVAL';const old=await db.prepare('SELECT id FROM fee_basis_record WHERE record_kind=? AND source_system=? AND source_id=?').bind(kind,r.source_system,r.source_record_id).first<{id:string}>();
   const id=old?.id??newId('basis');if(!old)statements.push(db.prepare(`INSERT INTO fee_basis_record SELECT ?,?,?,?,?,? WHERE ${guard}`).bind(id,kind,r.source_system,r.source_record_id,now,now,...args));
   basis.push({feeBasisId:id,inputItemId:r.id});const data=JSON.parse(r.data_json);if(data._lookup)lookups.push(data._lookup);
  }
 }
 const id=newId('reconciliation');
 statements.push(db.prepare(`INSERT INTO reconciliation_record SELECT ?,?,?,?,?,?,'strict-exact-lines-2',?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}`).bind(id,item.id,item.installation_work_order_id,item.service_provider_id,snapshotId,`comparison:${snapshotId}`,comparison.status,comparison.currency,comparison.taxBasis,comparison.jdAmount,comparison.providerAmount,comparison.differenceAmount,JSON.stringify(selected),JSON.stringify(comparison.groups),JSON.stringify(basis),JSON.stringify({queries:lookups}),JSON.stringify(comparison.checks),JSON.stringify(comparison.openIssues),now,now,...args));
 if(resultId)statements.push(db.prepare(`INSERT INTO reconciliation_analysis_link SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM reconciliation_record WHERE id=?)`).bind(newId('reconciliation-analysis'),id,resultId,now,now,id));
 statements.push(db.prepare(`UPDATE work_item SET current_reconciliation_id=?,row_version=row_version+1,gmt_modified=? WHERE id=? AND analysis_generation=? AND EXISTS(SELECT 1 FROM reconciliation_record WHERE id=?)`).bind(id,now,item.id,item.analysis_generation,id));
 // Differences remain available for human review; unresolved source questions stay blocked.
 return {statements,ready:comparison.status!=='NEEDS_INFORMATION',id,comparison};
}
