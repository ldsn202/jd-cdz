import { inputIssues, validateAnalysis } from '../../../skill-runtime/contract.mjs';
import { loadFixedAnalysisInput } from './analysis-fixed-input';
import type { Bindings } from '../index';
import type { ResolvedIdentity } from './identity';
import { ServiceError, newId, nowMs, requireService } from './change-batch';
import { collectAnalysisSources, type AnalysisItem } from './analysis-sources';
import {applyEnabledConfigurations,controlledInstallationMatches} from './analysis-configurations';
import { stageSourceMaterials } from './analysis-source-materials';
import { collectParsedMaterials } from './analysis-materials';
import {buildReconciliationProduct} from './analysis-reconciliation';
import { buildAnalysisProducts } from './analysis-products';
import { buildAnalysisContext } from './analysis-context';
import { readConfigurationUpload } from './uploaded-configuration';

const SKILL_VERSION = '1.0.0';

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type PrepareAnalysisBody = {
  runId: string;
  profileId: string;
  implementationVersion: string;
  skillPackageDigest: string;
  analysisInput: {
    workItemId: string;
    skill: 'INTEGRATION_CONFIGURATION' | 'INSTALLATION_EXTRACTION' | 'INSTALLATION_EVIDENCE' | 'RECONCILIATION_EXPLANATION';
    skillVersion?: string;
    outputSchemaVersion?: string;
  };
};

export async function prepareAndRegisterAnalysis(
 db:D1Database,env:Bindings,identity:ResolvedIdentity,body:PrepareAnalysisBody,
 options?:{beforeStatements?:()=>Promise<D1PreparedStatement[]>}
):Promise<{runId:string;status:'ACCEPTED'|'DEFERRED';materialJobIds?:string[]}>{
 requireService(identity);const input=body.analysisInput;
 if(!body.runId||!body.profileId||!body.implementationVersion||!body.skillPackageDigest||!input?.workItemId||!input.skill)throw new ServiceError(400,40001,'runId、profileId、implementationVersion、skillPackageDigest、workItemId、skill 必填');
 const skillVersion=input.skillVersion??SKILL_VERSION,outputSchemaVersion=input.outputSchemaVersion??SKILL_VERSION;
 const item=await db.prepare(`SELECT w.*,wo.source_id wo_source_id,wo.source_system wo_source_system FROM work_item w LEFT JOIN installation_work_order wo ON wo.id=w.installation_work_order_id WHERE w.id=?`).bind(input.workItemId).first<AnalysisItem>();
 if(!item)throw new ServiceError(404,40404,'事项不存在');
 if(!identity.grants.some(g=>g.scopeType==='SERVICE_PROVIDER'&&g.sourceSystem==null&&g.recordType==null&&g.actions.includes('PREPARE_ANALYSIS')&&g.resourceIds.includes(item.service_provider_id)))throw new ServiceError(403,40301,'无该服务商范围的分析准备权限');
 const kinds:Record<string,string>={INTEGRATION_CONFIGURATION:'CONFIGURATION',INSTALLATION_EXTRACTION:'INSTALLATION_PREPARATION',INSTALLATION_EVIDENCE:'INSTALLATION_REVIEW',RECONCILIATION_EXPLANATION:'RECONCILIATION'};
 if(kinds[input.skill]!==item.item_kind)throw new ServiceError(422,42201,'Skill 与事项类型不一致');
 const request={workItemId:item.id,skill:input.skill,skillVersion,outputSchemaVersion,profileId:body.profileId,implementationVersion:body.implementationVersion,skillPackageDigest:body.skillPackageDigest};
 const requestDigest=await sha256Hex(JSON.stringify(request));
 const checked=await db.prepare("SELECT details_json FROM activity_record WHERE work_item_id=? AND event_key=?").bind(item.id,`program-check:${body.runId}`).first<{details_json:string}>();
 if(checked){if(JSON.parse(checked.details_json).requestDigest!==requestDigest)throw new ServiceError(409,40902,'同 runId 不同请求内容');if(options?.beforeStatements)await db.batch(await options.beforeStatements());return {runId:body.runId,status:'ACCEPTED'};}
 const old=await db.prepare('SELECT c.config_json,j.service_provider_id FROM capability_call c JOIN background_job j ON j.id=c.job_id WHERE c.id=?').bind(body.runId).first<{config_json:string;service_provider_id:string}>();
 if(old){if(old.service_provider_id!==item.service_provider_id||JSON.parse(old.config_json).requestDigest!==requestDigest)throw new ServiceError(409,40902,'同 runId 不同请求内容');if(options?.beforeStatements)await db.batch(await options.beforeStatements());return {runId:body.runId,status:'ACCEPTED'};}
 if(['COMPLETED','PROCESSING','WAITING_SUPPLEMENT','WAITING_REPLY','EXCEPTION'].includes(item.status)||item.pending_write_id)throw new ServiceError(409,40901,'事项当前状态不能准备分析');
 const source=await collectAnalysisSources(db,env,item,input.skill);
 const uploaded=await readConfigurationUpload(db,item,source.records);
 if(uploaded){source.records=uploaded.records;source.materials=[];source.issues=uploaded.issues;}
 const configuration=await applyEnabledConfigurations(db,item,source.records);
 const staged=await stageSourceMaterials(db,env,item,source.materials);
 const material=await collectParsedMaterials(db,item.id,item.service_provider_id,source.materials,uploaded?.materialVersionId);
 const now=nowMs(),snapshotId=newId('ais');
 const configurationFences=configuration.dependencies.map(d=>db.prepare(`INSERT INTO transaction_assertion(id,passed,gmt_create,gmt_modified) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM integration_config WHERE id=? AND current_version_id=? AND current_activation_result_id=?) THEN 1 ELSE 0 END,?,?`).bind(newId('config-pin'),d.configurationId,d.configurationVersionId,d.activationResultId,now,now));
 const fence=()=>db.prepare(`INSERT INTO transaction_assertion(id,passed,gmt_create,gmt_modified) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM work_item WHERE id=? AND row_version=? AND analysis_generation=? AND pending_write_id IS NULL AND status NOT IN ('COMPLETED','PROCESSING','WAITING_SUPPLEMENT','WAITING_REPLY','EXCEPTION')) THEN 1 ELSE 0 END,?,?`).bind(newId('analysis-cas'),item.id,item.row_version,item.analysis_generation,now,now);
 if(staged.pending||material.pendingJobIds.length){
  const context=await buildAnalysisContext(db,item,source.context,now);
  await db.batch([...(options?.beforeStatements?await options.beforeStatements():[]),...context.statements,...staged.statements,fence()]);
  return {runId:body.runId,status:'DEFERRED',materialJobIds:[...new Set([...staged.jobIds,...material.pendingJobIds])]};
 }

 if(material.rows.some(p=>p.completeness!=='COMPLETE'&&JSON.parse(p.units_json).some((u:{kind:string})=>u.kind!=='SHEET'))){
  const context=await buildAnalysisContext(db,item,source.context,now);
  await db.batch([...(options?.beforeStatements?await options.beforeStatements():[]),fence(),...context.statements,
    db.prepare("UPDATE work_item SET status='BLOCKED',blocked_reason='材料文字待核对：请在业务资料中逐页核对 PDF / 图片识别文字，再手动运行分析。',row_version=row_version+1,gmt_modified=? WHERE id=? AND row_version=?").bind(now,item.id,item.row_version)]);
  return {runId:body.runId,status:'DEFERRED',materialJobIds:[]};
 }
 const analysisInput={skill:input.skill,skillVersion,outputSchemaVersion,inputSnapshotId:snapshotId,records:source.records,parsedMaterials:material.parsedMaterials};
 const missing=[...new Set([...source.issues,...configuration.issues,...staged.issues,...material.issues,...inputIssues({runId:body.runId,operation:'ANALYZE_SKILL',profileId:body.profileId,parseInput:null,analysisInput})])];
 const preparedRows=source.records.map(r=>({id:newId('aii'),record_type:r.recordType,source_system:r.sourceSystem,source_record_id:r.sourceRecordId,source_version:r.sourceVersion,data_json:JSON.stringify(r.data)}));
 const comparison=item.item_kind==='RECONCILIATION'?await buildReconciliationProduct(db,item,snapshotId,null,now,{rows:preparedRows,complete:missing.length===0}):null;
 if(comparison&&'comparison' in comparison&&comparison.comparison){
  for(const r of source.records.filter(r=>['JD_BILL','PROVIDER_RECEIVABLE'].includes(r.recordType)))r.data={...r.data,_programComparison:{algorithmVersion:'strict-exact-lines-2',...comparison.comparison}};
 }
 const inputDigest=await sha256Hex(JSON.stringify({serializationVersion:'fixed-input-v1',workItemId:item.id,serviceProviderId:item.service_provider_id,expectedWorkItemVersion:item.row_version,analysisGeneration:item.analysis_generation,configurationDependencies:configuration.dependencies,requiredInputState:missing.length?'INCOMPLETE':'COMPLETE',inputIssues:missing,analysisInput}));
 const context=await buildAnalysisContext(db,item,source.context,now);
 const statements:D1PreparedStatement[]=[...(options?.beforeStatements?await options.beforeStatements():[]),fence(),...configurationFences,...context.statements,...staged.statements];
 for(const [index,r] of source.records.entries())statements.push(db.prepare(`INSERT INTO analysis_input_item VALUES(?,?,?,'RECORD',?,?,?,?,?,NULL,?,?,?)`).bind(preparedRows[index].id,snapshotId,r.inputId,r.recordType,r.sourceSystem,r.sourceRecordId,r.sourceVersion,JSON.stringify(r.data),now,now,now));
 for(const p of material.rows)statements.push(db.prepare(`INSERT INTO analysis_input_item VALUES(?,?,?,'PARSED_MATERIAL',NULL,NULL,NULL,NULL,NULL,?,?,?,?)`).bind(newId('aii'),snapshotId,p.id,p.id,now,now,now));
 statements.push(db.prepare(`INSERT INTO analysis_input_snapshot VALUES(?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?)`).bind(snapshotId,item.analysis_generation,item.id,item.service_provider_id,item.row_version,input.skill,skillVersion,outputSchemaVersion,JSON.stringify(configuration.dependencies),missing.length?'INCOMPLETE':'COMPLETE',JSON.stringify(missing),source.records.length+material.rows.length,inputDigest,now,now));
 // Complete line-by-line equality needs no language model. Keep the real comparison as evidence.
 if(comparison && 'comparison' in comparison && comparison.comparison?.status==='MATCHED') {
  statements.push(...comparison.statements);
  statements.push(db.prepare("UPDATE work_item SET status='READY',blocked_reason=NULL,row_version=row_version+1,gmt_modified=? WHERE id=? AND analysis_generation=?").bind(now,item.id,item.analysis_generation));
  statements.push(db.prepare("INSERT INTO activity_record(id,work_item_id,event_key,event_type,fact_type,fact_id,details_json,gmt_create,gmt_modified) VALUES(?,?,?,'ANALYSIS_COMPLETED','WORK_ITEM',?,?,?,?)")
    .bind(newId('activity'),item.id,`program-check:${body.runId}`,item.id,JSON.stringify({description:'程序已逐项核对数量、单价、金额与费用范围，双方一致，无需 AI 分析。',analysisGeneration:item.analysis_generation,requestDigest}),now,now));
  await db.batch(statements);return {runId:body.runId,status:'ACCEPTED'};
 }
 if(comparison)statements.push(...comparison.statements);
 const cfgPurpose=item.integration_config_id?await db.prepare('SELECT purpose FROM integration_config WHERE id=? AND service_provider_id=?').bind(item.integration_config_id,item.service_provider_id).first<{purpose:string}>():null;
 const jobId=newId('bj'),target={runId:body.runId,snapshotId,workItemId:item.id,...analysisInput,profileId:body.profileId,implementationVersion:body.implementationVersion,skillPackageDigest:body.skillPackageDigest,contextSnapshotId:context.contextSnapshotId,inputIssues:missing,configurationDependencies:configuration.dependencies,configurationPurpose:cfgPurpose?.purpose??null};
 statements.push(db.prepare(`INSERT INTO background_job(id,purpose,service_provider_id,work_item_id,target_json,dedupe_key,status,available_at,lease_epoch,row_version,gmt_create,gmt_modified) VALUES(?,'ANALYZE_SKILL',?,?,?,?,'READY',?,0,1,?,?)`).bind(jobId,item.service_provider_id,item.id,JSON.stringify(target),`agent-run:${body.runId}`,now,now,now));
 statements.push(db.prepare(`INSERT INTO capability_call VALUES(?,?,'ANALYZE_SKILL',NULL,?,?,?,?,?,?,?)`).bind(body.runId,jobId,snapshotId,body.profileId,body.implementationVersion,JSON.stringify({skillPackageDigest:body.skillPackageDigest,requestDigest}),inputDigest,now,now));
 await db.batch(statements);return {runId:body.runId,status:'ACCEPTED'};
}

export type AdoptionCheck =
  | { ok: true; statements: D1PreparedStatement[] }
  | { ok: false; errorCode: string };

export async function buildAnalysisAdoption(
  db: D1Database,
  job: { id: string; work_item_id: string | null; target_json: string },
  result: unknown
): Promise<AdoptionCheck> {
  const target = JSON.parse(job.target_json) as {
    runId: string; snapshotId: string; workItemId: string;
    profileId: string; implementationVersion: string; contextSnapshotId?:string;
  };
  if (!job.work_item_id) return { ok: false, errorCode: 'ANALYSIS_ITEM_MISSING' };
  const fixed=await loadFixedAnalysisInput(db,target.snapshotId);
  if(!fixed || fixed.snapshot.work_item_id!==job.work_item_id) return {ok:false,errorCode:'ANALYSIS_INPUT_MISMATCH'};
  try { validateAnalysis({runId:target.runId,operation:'ANALYZE_SKILL',profileId:target.profileId,
    parseInput:null,analysisInput:fixed.analysisInput},result); }
  catch { return {ok:false,errorCode:'ANALYSIS_RESULT_INVALID'}; }
  const a=result as {status:string;summary:string;findings:{findingId:string;type:string;content:Record<string,unknown>;evidenceRefs:unknown[]}[];openQuestions:string[]};
  if(fixed.analysisInput.skill==='INSTALLATION_EXTRACTION'&&!controlledInstallationMatches(fixed.analysisInput.records,a))return {ok:false,errorCode:'ANALYSIS_TRANSFORM_CONFLICT'};
  const completeness=await db.prepare('SELECT required_input_state FROM analysis_input_snapshot WHERE id=?').bind(target.snapshotId).first<{required_input_state:string}>();
  if(completeness?.required_input_state!=='COMPLETE'&&a.status==='ANALYZED')return {ok:false,errorCode:'ANALYSIS_INPUT_INCOMPLETE'};
  const item = await db.prepare('SELECT * FROM work_item WHERE id = ?')
    .bind(job.work_item_id).first<AnalysisItem&{current_configuration_version_id:string|null}>();
  if (!item) return { ok: false, errorCode: 'ANALYSIS_ITEM_MISSING' };

  const now = nowMs();
  const resultId = newId('ar');
  const active=item.analysis_generation===fixed.snapshot.analysis_generation&&!item.pending_write_id&&!['COMPLETED','PROCESSING','WAITING_SUPPLEMENT','WAITING_REPLY','EXCEPTION'].includes(item.status);
  const products=active?await buildAnalysisProducts(db,item,target.snapshotId,resultId,a,target.contextSnapshotId??null,now):{statements:[],ready:false};
  return {
    ok: true,
    statements: [
      db
        .prepare(
          `INSERT INTO analysis_result (id, run_id, work_item_id, snapshot_id, profile_id, implementation_version, status, summary, findings_json, open_questions_json, validated_at, gmt_create, gmt_modified)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          resultId, target.runId, job.work_item_id, target.snapshotId,
          target.profileId, target.implementationVersion, a.status, a.summary,
          JSON.stringify(a.findings), JSON.stringify(a.openQuestions), now, now, now
        ),
      db
        .prepare(
          `UPDATE work_item SET current_analysis_result_id = ?, row_version = row_version + 1, gmt_modified = ?
           WHERE id = ? AND row_version = ? AND analysis_generation = ? AND status NOT IN ('COMPLETED','PROCESSING','WAITING_SUPPLEMENT','WAITING_REPLY','EXCEPTION') AND pending_write_id IS NULL AND NOT EXISTS(SELECT 1 FROM analysis_input_snapshot s,json_each(s.config_versions_json) d LEFT JOIN integration_config c ON c.id=json_extract(d.value,'$.configurationId') WHERE s.id=? AND json_extract(d.value,'$.usage')='ACTIVE_TRANSFORM' AND (c.current_version_id IS NOT json_extract(d.value,'$.configurationVersionId') OR c.current_activation_result_id IS NOT json_extract(d.value,'$.activationResultId')))`
        )
        .bind(resultId, now, job.work_item_id, item.row_version, fixed.snapshot.analysis_generation,target.snapshotId),
      ...products.statements,
      db.prepare(`UPDATE work_item SET status=?,blocked_reason=?,row_version=row_version+1,gmt_modified=? WHERE id=? AND current_analysis_result_id=? AND analysis_generation=? AND pending_write_id IS NULL AND status NOT IN ('COMPLETED','PROCESSING','WAITING_SUPPLEMENT','WAITING_REPLY','EXCEPTION')`).bind(products.ready?'READY':'BLOCKED',products.ready?null:(a.openQuestions.join('；')||'分析已保存，业务产物或关联输入仍待核实'),now,item.id,resultId,fixed.snapshot.analysis_generation),
      db
        .prepare(
          `INSERT INTO activity_record (id, work_item_id, event_key, event_type, actor_identity_id, fact_type, fact_id, occurred_at, details_json, gmt_create, gmt_modified)
           VALUES (?, ?, ?, 'ANALYSIS_COMPLETED', NULL, 'ANALYSIS_RESULT', ?, NULL, ?, ?, ?)`
        )
        .bind(newId('act'), job.work_item_id, `analysis:${resultId}`, resultId, JSON.stringify({ runId: target.runId }), now, now),
    ],
  };
}
