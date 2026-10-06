import { newId, nowMs } from './change-batch';
import { loadFixedAnalysisInput } from './analysis-fixed-input';
import { stableStringify } from './installation-draft';
import { calculateConfigurationTrial, type TrialCandidate, type ConfigurationScope } from './config-trial-calculation';

type Snapshot = { id:string;work_item_id:string;service_provider_id:string;analysis_generation:number;expected_work_item_version:number;skill:string;skill_version:string;output_schema_version:string;required_input_state:string;input_issues_json:string;config_versions_json:string;content_sha256:string };
type InputRow = { input_key:string;input_kind:string;record_type:string|null;source_system:string|null;source_record_id:string|null;source_version:string|null;data_json:string|null;parsing_id:string|null;retrieved_at:number };
async function hash(value:unknown) {
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stableStringify(value)));
 return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function loadCandidate(db:D1Database,versionId:string) {
 const candidate=await db.prepare('SELECT * FROM integration_config_version WHERE id=?').bind(versionId).first<TrialCandidate>();
 if(!candidate)return null;
 const scope=await db.prepare('SELECT * FROM integration_config WHERE id=?').bind(candidate.integration_config_id).first<ConfigurationScope>();
 const analysis=await db.prepare('SELECT snapshot_id FROM analysis_result WHERE id=? AND work_item_id=?').bind(candidate.analysis_result_id,candidate.work_item_id).first<{snapshot_id:string}>();
 return scope&&analysis?{candidate,scope,sourceSnapshotId:analysis.snapshot_id}:null;
}
async function fixed(db:D1Database,snapshotId:string) {
 const snapshot=await db.prepare('SELECT * FROM analysis_input_snapshot WHERE id=?').bind(snapshotId).first<Snapshot>();
 const input=await loadFixedAnalysisInput(db,snapshotId);
 if(!snapshot||!input)return null;
 const items=await db.prepare('SELECT input_key,input_kind,record_type,source_system,source_record_id,source_version,data_json,parsing_id,retrieved_at FROM analysis_input_item WHERE snapshot_id=? ORDER BY input_key').bind(snapshotId).all<InputRow>();
 return {snapshot,items:items.results,analysisInput:input.analysisInput};
}
function inputOf(f:NonNullable<Awaited<ReturnType<typeof fixed>>>) {
 return {skillVersion:f.snapshot.skill_version,outputSchemaVersion:f.snapshot.output_schema_version,requiredState:f.snapshot.required_input_state,inputIssues:JSON.parse(f.snapshot.input_issues_json) as string[],records:f.analysisInput.records,parsedMaterials:f.analysisInput.parsedMaterials};
}
function digestContent(candidate:TrialCandidate,items:InputRow[],dependencies:unknown[]) {
 return {configurationVersionId:candidate.id,rules:JSON.parse(candidate.rules_json),applicability:JSON.parse(candidate.applicability_json),openQuestions:JSON.parse(candidate.open_questions_json),ruleCatalogVersion:candidate.rule_catalog_version,inputs:items,dependencies};
}
export async function buildConfigurationTrialAdoption(db:D1Database,job:{id:string;work_item_id:string|null;target_json:string}) {
 const target=JSON.parse(job.target_json) as {configurationId:string;configurationVersionId:string;workItemId:string};
 const loaded=await loadCandidate(db,target.configurationVersionId);
 if(!loaded||loaded.scope.id!==target.configurationId||loaded.candidate.work_item_id!==job.work_item_id||target.workItemId!==job.work_item_id)return {ok:false as const,errorCode:'TRIAL_CANDIDATE_SCOPE_MISMATCH'};
 const {candidate,scope}=loaded;
 const source=await fixed(db,loaded.sourceSnapshotId);
 if(!source||source.snapshot.work_item_id!==job.work_item_id||source.snapshot.service_provider_id!==scope.service_provider_id||source.snapshot.skill!=='INTEGRATION_CONFIGURATION')return {ok:false as const,errorCode:'TRIAL_FIXED_INPUT_MISSING'};
 const existing=await db.prepare('SELECT id,status FROM configuration_trial WHERE execution_key=?').bind(`trial:${job.id}`).first<{id:string;status:string}>();
 if(existing)return {ok:true as const,statements:[],jobStatus:existing.status==='PASSED'?'SUCCEEDED':'BLOCKED',result:{trialId:existing.id,status:existing.status}};
 const item=await db.prepare('SELECT row_version,analysis_generation FROM work_item WHERE id=? AND service_provider_id=?').bind(job.work_item_id,scope.service_provider_id).first<{row_version:number;analysis_generation:number}>();
 if(!item)return {ok:false as const,errorCode:'TRIAL_ITEM_MISSING'};
 if(source.snapshot.analysis_generation!==item.analysis_generation)return {ok:false as const,errorCode:'TRIAL_INPUT_SUPERSEDED'};
 const result=calculateConfigurationTrial(candidate,scope,inputOf(source));
 const dependencies=[...JSON.parse(source.snapshot.config_versions_json),{configurationId:scope.id,configurationVersionId:candidate.id,usage:'TRIAL_CANDIDATE'}];
 if(dependencies.filter(d=>d.usage==='TRIAL_CANDIDATE'&&d.configurationId===scope.id).length!==1){result.checks.scope_valid=false;result.status='FAILED';result.issues.push('试转换依赖包含重复或冲突候选');}
 const snapshotId=newId('trial-input'),trialId=newId('trial'),now=nowMs();
 const contentSha=await hash(digestContent(candidate,source.items,dependencies));
 const statements:D1PreparedStatement[]=source.items.map(item=>db.prepare(`INSERT INTO analysis_input_item(id,snapshot_id,input_key,input_kind,record_type,source_system,source_record_id,source_version,data_json,parsing_id,retrieved_at,gmt_create,gmt_modified) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(newId('trial-item'),snapshotId,item.input_key,item.input_kind,item.record_type,item.source_system,item.source_record_id,item.source_version,item.data_json,item.parsing_id,item.retrieved_at,now,now));
 const inputState=result.checks.input_complete?'COMPLETE':'INCOMPLETE';
 const inputIssues=inputState==='COMPLETE'?[]:result.issues.length?result.issues:['原输入未完整确认'];
 statements.push(db.prepare(`INSERT INTO analysis_input_snapshot(id,analysis_generation,work_item_id,service_provider_id,expected_work_item_version,skill,skill_version,output_schema_version,config_versions_json,required_input_state,input_issues_json,input_item_count,content_sha256,gmt_create,gmt_modified) VALUES(?,?,?,?,?,'INTEGRATION_CONFIGURATION',?,?,?,?,?,?,?,?,?)`).bind(snapshotId,source.snapshot.analysis_generation,job.work_item_id,scope.service_provider_id,item.row_version,source.snapshot.skill_version,source.snapshot.output_schema_version,JSON.stringify(dependencies),inputState,JSON.stringify(inputIssues),source.items.length,contentSha,now,now));
 statements.push(db.prepare(`INSERT INTO configuration_trial(id,configuration_version_id,snapshot_id,execution_key,transformer_version,status,output_json,rule_results_json,issues_json,checks_json,gmt_create,gmt_modified) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(trialId,candidate.id,snapshotId,`trial:${job.id}`,result.transformerVersion,result.status,result.output?JSON.stringify(result.output):null,JSON.stringify(result.ruleResults),JSON.stringify(result.issues),JSON.stringify(result.checks),now,now));
 return {ok:true as const,statements,jobStatus:result.status==='PASSED'?'SUCCEEDED':'BLOCKED',result:{trialId,configurationVersionId:candidate.id,inputSnapshotId:snapshotId,...result}};
}

// A database PASSED label is insufficient: verify exact fixed input and recompute before enabling.
export async function verifyStoredConfigurationTrial(db:D1Database,versionId:string,trialId:string):Promise<boolean> {
 const loaded=await loadCandidate(db,versionId);
 const trial=await db.prepare('SELECT * FROM configuration_trial WHERE id=? AND configuration_version_id=?').bind(trialId,versionId).first<{snapshot_id:string;status:string;transformer_version:string;output_json:string;rule_results_json:string;checks_json:string;issues_json:string}>();
 if(!loaded||!trial||trial.status!=='PASSED')return false;
 const input=await fixed(db,trial.snapshot_id);
 if(!input||input.snapshot.work_item_id!==loaded.candidate.work_item_id||input.snapshot.service_provider_id!==loaded.scope.service_provider_id||input.snapshot.skill!=='INTEGRATION_CONFIGURATION')return false;
 const dependencies=JSON.parse(input.snapshot.config_versions_json) as {configurationId:string;configurationVersionId:string;usage:string}[];
 const candidates=dependencies.filter(d=>d.configurationId===loaded.scope.id&&d.usage==='TRIAL_CANDIDATE');
 if(candidates.length!==1||candidates[0].configurationVersionId!==versionId)return false;
 if(await hash(digestContent(loaded.candidate,input.items,dependencies))!==input.snapshot.content_sha256)return false;
 const computed=calculateConfigurationTrial(loaded.candidate,loaded.scope,inputOf(input));
 return computed.status==='PASSED'&&computed.transformerVersion===trial.transformer_version
  &&stableStringify(computed.output)===stableStringify(JSON.parse(trial.output_json))
  &&stableStringify(computed.ruleResults)===stableStringify(JSON.parse(trial.rule_results_json))
  &&stableStringify(computed.checks)===stableStringify(JSON.parse(trial.checks_json))
  &&stableStringify(computed.issues)===stableStringify(JSON.parse(trial.issues_json));
}
