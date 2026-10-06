import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDatabase} from './helpers/sqlite-d1.mjs';
import {loadModule} from './helpers/load-app.mjs';
const {buildConfigurationTrialAdoption}=await loadModule('../../src/services/config-execution.ts');
const {claimJobs,dispatchStart,reportResult}=await loadModule('../../src/services/job-dispatch.ts');
const {saveConfigurationDraft}=await loadModule('../../src/services/config-draft.ts');
const {enableConfiguration,findChangedFormatInputs}=await loadModule('../../src/services/config-enablement.ts');
const service={identityId:'ir-dev-service',subjectType:'SERVICE',grants:[{scopeType:'SERVICE_PROVIDER',actions:['PREPARE_ANALYSIS'],resourceIds:['provider-dev-b']}]};
const human={identityId:'ir-dev-provider-clerk',subjectType:'HUMAN',grants:[{grantId:'g-config',scopeType:'SERVICE_PROVIDER',actions:['ENABLE_INTEGRATION_CONFIG'],resourceIds:['provider-dev-b']}]};
const dispatch={leaseMs:600000,maxAttempts:1,retryBackoffMs:0};
function fixture(options={}){
 const db=createDatabase();db.sqlite.exec(readFileSync(new URL('../../db/seeds/dev-identity.sql',import.meta.url),'utf8'));
 const now=Date.now()-100;
 const rules=['installationItem','installedQuantity','unit','materialSupplier','serviceScope'].map(targetField=>({ruleId:targetField,sourceFields:['/'+targetField],targetField,operation:'PIPELINE',parameters:{steps:[{op:'field',path:'/'+targetField}]},conditions:[]}));
 const fields=rules.map(r=>({fieldKey:r.targetField,label:r.targetField,meaning:options.unknownMeaning?null:'明确字段含义',unit:null}));
 const applicability={serviceProviderId:'provider-dev-b',sourceSystem:'provider-docs',purpose:'INSTALLATION',businessScopeKey:'install-main',formatStatus:'PROVIDED',sourceFormatId:'fmt-1',sourceFormatVersion:'fv-1',rowPath:'/rows',conditions:[],basisReferences:['provider-format'],unknownConditions:[]};
 const raw=options.raw??'{"rows":[{"installationItem":"桥架","installedQuantity":12.5,"unit":"米","materialSupplier":"服务商","serviceScope":"安装"},{"installationItem":"电缆","installedQuantity":0,"unit":"米","materialSupplier":"服务商","serviceScope":"安装"}]}';
 const providerData={sourceRecord:{sourceSystem:'provider-docs',sourceRecordId:'doc-1',sourceVersion:'doc-v9',serviceProviderId:options.foreignProvider?'provider-dev-a':'provider-dev-b',purpose:'CONFIGURATION',configurationPurpose:'INSTALLATION',businessScopeKey:'install-main',sourceFormatId:'fmt-1',sourceFormatVersion:'fv-1'},contentComplete:!options.incomplete,completeness:options.incomplete?'INCOMPLETE':'COMPLETE',missingParts:options.incomplete?['SOURCE']:[],formatStatus:'PROVIDED',formatDefinition:{formatId:'fmt-1',sourceVersion:'fv-1',fields,notes:null,sourceMaterials:[]},rawJson:raw,sourceMaterials:[]};
 db.sqlite.prepare(`INSERT INTO business_permission VALUES('bp-config','ci-config','g-config','PROVIDER_INTEGRATION_CONTACT','["ENABLE_INTEGRATION_CONFIG"]','SERVICE_PROVIDER',NULL,NULL,'["provider-dev-b"]',?,?)`).run(now,now);
 db.sqlite.prepare(`INSERT INTO current_identity VALUES('ci-config','ir-dev-provider-clerk','HUMAN',?,NULL,'config-test','[]',1,'ci-config',?,?)`).run(now,now,now);
 db.sqlite.prepare(`INSERT INTO integration_config VALUES('cfg','provider-dev-b','provider-docs','INSTALLATION','install-main',NULL,NULL,1,?,?)`).run(now,now);
 db.sqlite.prepare(`INSERT INTO work_item(id,service_provider_id,item_kind,business_key,business_identity_json,creation_key,title,status,assignee_identity_id,integration_config_id,gmt_create,gmt_modified) VALUES('item','provider-dev-b','CONFIGURATION','cfg-key','["cfg"]','cfg-created','配置测试','READY','ir-dev-provider-clerk','cfg',?,?)`).run(now,now);
 for(const [key,type,id,version,data] of [['provider-record','PROVIDER_RECORD','doc-1','doc-v9',providerData],['provider-format','PROVIDER_FORMAT','fmt-1','fv-1',{formatId:'fmt-1',sourceVersion:'fv-1',fields}]])db.sqlite.prepare(`INSERT INTO analysis_input_item VALUES(?, 'original-snapshot',?,'RECORD',?,'provider-docs',?,?,?,NULL,?,?,?)`).run('input-'+key,key,type,id,version,JSON.stringify(data),now,now,now);
 db.sqlite.prepare(`INSERT INTO analysis_input_snapshot VALUES('original-snapshot',1,'item','provider-dev-b',1,'INTEGRATION_CONFIGURATION','1.0.0','1.0.0','[]',? ,?,2,?,?,?)`).run(options.incomplete?'INCOMPLETE':'COMPLETE',options.incomplete?'["SOURCE"]':'[]','a'.repeat(64),now,now);
 db.sqlite.prepare(`INSERT INTO background_job(id,purpose,service_provider_id,work_item_id,target_json,dedupe_key,status,lease_epoch,row_version,gmt_create,gmt_modified) VALUES('analysis-job','ANALYZE_SKILL','provider-dev-b','item','{}','analysis-test','READY',0,1,?,?)`).run(now,now);
 db.sqlite.prepare(`INSERT INTO capability_call VALUES('analysis-run','analysis-job','ANALYZE_SKILL',NULL,'original-snapshot','test','1','{}',?,?,?)`).run('a'.repeat(64),now,now);
 db.sqlite.prepare(`INSERT INTO analysis_result VALUES('analysis','analysis-run','item','original-snapshot','test','1',?,'规则候选','[]',?, ?,?,?)`).run(options.incomplete?'NEEDS_INFORMATION':'ANALYZED',options.incomplete?'["SOURCE"]':'[]',now,now,now);
 db.sqlite.prepare(`INSERT INTO integration_config_version VALUES('candidate','cfg','item',1,NULL,'analysis','AI',NULL,'initial','PROVIDED','fmt-1','fv-1',?,?,'[]','charging-transform-1','[]',?,?)`).run(JSON.stringify(applicability),JSON.stringify(rules),now,now);
 db.sqlite.prepare(`UPDATE work_item SET current_configuration_version_id='candidate',current_analysis_result_id='analysis',row_version=row_version+1 WHERE id='item'`).run();
 const job={id:'trial-job',work_item_id:'item',target_json:JSON.stringify({configurationId:'cfg',configurationVersionId:'candidate',workItemId:'item'})};
 return {db,rules,applicability,job,row:()=>db.sqlite.prepare("SELECT * FROM work_item WHERE id='item'").get()};
}
test('real trial pins candidate in a separate snapshot and records every row/rule including actual zero',async()=>{
 const f=fixture();try{
  const adoption=await buildConfigurationTrialAdoption(f.db,f.job);assert.equal(adoption.ok,true);await f.db.batch(adoption.statements);
  const trial=f.db.sqlite.prepare('SELECT * FROM configuration_trial').get();assert.equal(trial.status,'PASSED');assert.notEqual(trial.snapshot_id,'original-snapshot');
  const output=JSON.parse(trial.output_json);assert.equal(output.records[0].rows[0].output.installedQuantity,12.5);assert.equal(output.records[0].rows[1].output.installedQuantity,0);
  assert.equal(JSON.parse(trial.rule_results_json).length,5);assert.equal(JSON.parse(trial.rule_results_json)[0].executions.length,2);assert.ok(Object.values(JSON.parse(trial.checks_json)).every(x=>x===true));
  const snapshot=f.db.sqlite.prepare('SELECT * FROM analysis_input_snapshot WHERE id=?').get(trial.snapshot_id);assert.deepEqual(JSON.parse(snapshot.config_versions_json),[{configurationId:'cfg',configurationVersionId:'candidate',usage:'TRIAL_CANDIDATE'}]);
  assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM analysis_input_item WHERE snapshot_id='original-snapshot'").get().n,2);
 }finally{f.db.close();}
});
for(const [name,options] of [['incomplete source',{incomplete:true}],['unknown meaning',{unknownMeaning:true}],['foreign provider',{foreignProvider:true}],['precision loss',{raw:'{"rows":[{"installationItem":"桥架","installedQuantity":1.0000000000000001,"unit":"米","materialSupplier":"服务商","serviceScope":"安装"}]}'}]])test(`${name} cannot pass trial`,async()=>{
 const f=fixture(options);try{const a=await buildConfigurationTrialAdoption(f.db,f.job);assert.equal(a.ok,true);await f.db.batch(a.statements);const trial=f.db.sqlite.prepare('SELECT * FROM configuration_trial').get();assert.notEqual(trial.status,'PASSED');assert.ok(JSON.parse(trial.issues_json).length);assert.ok(Object.values(JSON.parse(trial.checks_json)).some(x=>x===false));}finally{f.db.close();}
});
test('saved candidate is actually executed via lease; forged successful output is ignored then real trial enables',async()=>{
 const f=fixture();try{
  const saved=await saveConfigurationDraft(f.db,human,f.row(),'save-new',{expectedWorkItemVersion:2,expectedResponsibilityVersion:1,expectedCandidateVersionId:'candidate',rules:f.rules,applicability:f.applicability,editNotes:[{field:'rules',reason:'核实字段'}]});
  const {claims:[claim]}=await claimJobs(f.db,service,dispatch,{purposes:['TRIAL_CONFIG'],limit:1});assert.equal(claim.jobId,saved.jobId);await dispatchStart(f.db,service,claim.attemptId,claim);
  const result=await reportResult(f.db,service,dispatch,claim.attemptId,{...claim,status:'SUCCEEDED',result:{status:'PASSED',output:{installedQuantity:9999},checks:{input_complete:true}}});assert.equal(result.adopted,true);
  const trial=f.db.sqlite.prepare('SELECT * FROM configuration_trial').get();assert.equal(JSON.parse(trial.output_json).records[0].rows[0].output.installedQuantity,12.5);
  const r=f.row();const enabled=await enableConfiguration(f.db,human,r,'enable',{expectedWorkItemVersion:r.row_version,expectedResponsibilityVersion:r.responsibility_version,candidateVersionId:saved.candidateVersionId,trialId:trial.id,expectedConfigurationRowVersion:1,expectedActiveVersionId:null});assert.equal(enabled.status,'APPLIED');
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM work_item').get().n,1,'document version doc-v9 must not create false format adjustment against fv-1');
 }finally{f.db.close();}
});

test('changed-format selection uses actual format version and exact provider/source/business scope',async()=>{
 const f=fixture();try{
  const now=Date.now();
  for(const [suffix,provider,source,business,format] of [['valid','provider-dev-b','provider-docs','install-main','fv-2'],['foreign','provider-dev-a','provider-docs','install-main','fv-3'],['scope','provider-dev-b','provider-docs','other','fv-4'],['source','provider-dev-b','other-source','install-main','fv-5']]){
   const cfgId=suffix==='valid'?'cfg':'cfg-'+suffix;
   if(suffix!=='valid')f.db.sqlite.prepare('INSERT INTO integration_config VALUES(?,?,?,\'INSTALLATION\',?,NULL,NULL,1,?,?)').run(cfgId,provider,source,business,now,now);
   const item='item-'+suffix,snapshot='snapshot-'+suffix;
   f.db.sqlite.prepare(`INSERT INTO work_item(id,service_provider_id,item_kind,business_key,business_identity_json,creation_key,title,status,integration_config_id,gmt_create,gmt_modified) VALUES(?,?,'CONFIGURATION',?,'["test"]',?,'配置','READY',?,?,?)`).run(item,provider,item,item,cfgId,now,now);
   const data={sourceRecord:{serviceProviderId:provider,sourceSystem:source,sourceRecordId:'doc-'+suffix,sourceVersion:'fv-1',sourceFormatVersion:format,purpose:'CONFIGURATION'}};
   f.db.sqlite.prepare(`INSERT INTO analysis_input_item VALUES(?,?,?,'RECORD','PROVIDER_RECORD',?,?,'fv-1',?,NULL,?,?,?)`).run('input-'+suffix,snapshot,'input-'+suffix,source,'doc-'+suffix,JSON.stringify(data),now,now,now);
   f.db.sqlite.prepare(`INSERT INTO analysis_input_snapshot VALUES(?,1,?,?,1,'INTEGRATION_CONFIGURATION','1.0.0','1.0.0','[]','COMPLETE','[]',1,?,?,?)`).run(snapshot,item,provider,'b'.repeat(64),now,now);
  }
  const cfg=f.db.sqlite.prepare("SELECT * FROM integration_config WHERE id='cfg'").get();
  assert.deepEqual((await findChangedFormatInputs(f.db,cfg,'fv-1')).map(r=>r.source_format_version),['fv-2']);
  const later=now+10;
  const current={sourceRecord:{serviceProviderId:'provider-dev-b',sourceSystem:'provider-docs',sourceRecordId:'doc-valid',sourceVersion:'new-doc',sourceFormatVersion:'fv-1',purpose:'CONFIGURATION'}};
  f.db.sqlite.prepare(`INSERT INTO analysis_input_item VALUES('input-latest','snapshot-latest','record-latest','RECORD','PROVIDER_RECORD','provider-docs','doc-valid','new-doc',?,NULL,?,?,?)`).run(JSON.stringify(current),later,later,later);
  f.db.sqlite.prepare(`INSERT INTO analysis_input_snapshot VALUES('snapshot-latest',1,'item-valid','provider-dev-b',1,'INTEGRATION_CONFIGURATION','1.0.0','1.0.0','[]','COMPLETE','[]',1,?,?,?)`).run('c'.repeat(64),later,later);
  assert.deepEqual(await findChangedFormatInputs(f.db,cfg,'fv-1'),[],'older observed format must not override a newer fixed source read');
 }finally{f.db.close();}
});

test('incomplete trial executes through HTTP lease endpoint and persists blocked outcome without enabling',async()=>{
 const f=fixture({unknownMeaning:true});try{
  await saveConfigurationDraft(f.db,human,f.row(),'blocked-trial',{expectedWorkItemVersion:2,expectedResponsibilityVersion:1,expectedCandidateVersionId:'candidate',rules:f.rules,applicability:f.applicability,editNotes:[{field:'rules',reason:'等待说明'}]});
  const {claims:[claim]}=await claimJobs(f.db,service,dispatch,{purposes:['TRIAL_CONFIG'],limit:1});
  const {default:app}=await loadModule('../../src/index.ts');
  const env={DB:f.db,DEV_IDENTITY_TOKENS:JSON.stringify({service:'svc-jd-charging'}),TASK_MAX_ATTEMPTS:'1'};
  const request=body=>app.request(`/api/admin/charging/internal/job-attempts/${claim.attemptId}/configuration-trial`,{method:'POST',headers:{authorization:'Bearer service','content-type':'application/json'},body:JSON.stringify(body)},env);
  assert.equal((await request({...claim,leaseToken:'invalid'})).status,409);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM configuration_trial').get().n,0);
  const response=await request(claim);assert.equal(response.status,200);assert.equal((await response.json()).data.jobStatus,'BLOCKED');
  const trial=f.db.sqlite.prepare('SELECT * FROM configuration_trial').get();assert.equal(trial.status,'NEEDS_INFORMATION');
  const row=f.row();await assert.rejects(enableConfiguration(f.db,human,row,'bad-enable',{expectedWorkItemVersion:row.row_version,expectedResponsibilityVersion:1,candidateVersionId:row.current_configuration_version_id,trialId:trial.id,expectedConfigurationRowVersion:1,expectedActiveVersionId:null}),/试转换尚未通过/);
  assert.equal(f.db.sqlite.prepare("SELECT current_version_id FROM integration_config WHERE id='cfg'").get().current_version_id,null);
 }finally{f.db.close();}
});
test('forged persisted PASSED output fails recomputation at enablement',async()=>{
 const f=fixture();try{
  const a=await buildConfigurationTrialAdoption(f.db,f.job);await f.db.batch(a.statements);
  const now=Date.now();
  f.db.sqlite.prepare(`INSERT INTO configuration_trial SELECT 'forged',configuration_version_id,snapshot_id,'forged-execution',transformer_version,status,'{"records":[]}',rule_results_json,issues_json,checks_json,?,? FROM configuration_trial LIMIT 1`).run(now,now);
  const row=f.row();await assert.rejects(enableConfiguration(f.db,human,row,'forged-enable',{expectedWorkItemVersion:row.row_version,expectedResponsibilityVersion:1,candidateVersionId:'candidate',trialId:'forged',expectedConfigurationRowVersion:1,expectedActiveVersionId:null}),/复核未通过/);
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM configuration_enablement').get().n,0);
 }finally{f.db.close();}
});
test('candidate save version race rolls back both candidate and trial task',async()=>{
 const f=fixture();try{
  const batch=f.db.batch.bind(f.db);f.db.batch=async statements=>{f.db.sqlite.prepare("UPDATE work_item SET row_version=row_version+1 WHERE id='item'").run();return batch(statements);};
  await assert.rejects(saveConfigurationDraft(f.db,human,f.row(),'racing-save',{expectedWorkItemVersion:2,expectedResponsibilityVersion:1,expectedCandidateVersionId:'candidate',rules:f.rules,applicability:f.applicability,editNotes:[{field:'rules',reason:'并发核验'}]}));
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM integration_config_version').get().n,1);
  assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM background_job WHERE purpose='TRIAL_CONFIG'").get().n,0);
 }finally{f.db.close();}
});

test('revoked service provider authorization blocks trial adoption under an otherwise valid lease',async()=>{
 const f=fixture();try{
  await saveConfigurationDraft(f.db,human,f.row(),'grant-test',{expectedWorkItemVersion:2,expectedResponsibilityVersion:1,expectedCandidateVersionId:'candidate',rules:f.rules,applicability:f.applicability,editNotes:[{field:'rules',reason:'核实'}]});
  const {claims:[claim]}=await claimJobs(f.db,service,dispatch,{purposes:['TRIAL_CONFIG'],limit:1});
  await assert.rejects(reportResult(f.db,{...service,grants:[]},dispatch,claim.attemptId,{...claim,status:'SUCCEEDED'}),e=>e.httpStatus===403);
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM configuration_trial').get().n,0);
 }finally{f.db.close();}
});
test('enabled configuration is selected only for exact source purpose/business scope/format version and performs real conversion',async()=>{
 const {applyEnabledConfigurations,checkEnabledConfigurationSample,controlledInstallationMatches}=await loadModule('../../src/services/analysis-configurations.ts');const f=fixture();try{
  const trial=await buildConfigurationTrialAdoption(f.db,f.job);await f.db.batch(trial.statements);const t=f.db.sqlite.prepare('SELECT id FROM configuration_trial').get(),row=f.row();
  await enableConfiguration(f.db,human,row,'enable-for-transform',{expectedWorkItemVersion:row.row_version,expectedResponsibilityVersion:1,candidateVersionId:'candidate',trialId:t.id,expectedConfigurationRowVersion:1,expectedActiveVersionId:null});
  const original=f.db.sqlite.prepare("SELECT * FROM analysis_input_item WHERE record_type='PROVIDER_RECORD'").get(),data=JSON.parse(original.data_json);
  const record={inputId:'current-record',recordType:'PROVIDER_RECORD',sourceSystem:'provider-docs',sourceRecordId:'current-document',sourceVersion:'v2',data:{...data,sourceRecord:{...data.sourceRecord,sourceRecordId:'current-document',sourceVersion:'v2',purpose:'INSTALLATION',configurationPurpose:'INSTALLATION',businessScopeKey:'install-main',installationWorkOrderId:'source-wo'}}};
  const item={id:'install-item',item_kind:'INSTALLATION_PREPARATION',service_provider_id:'provider-dev-b',wo_source_id:'source-wo'};
  const result=await applyEnabledConfigurations(f.db,item,[record]);assert.equal(result.issues.length,0);assert.equal(result.dependencies[0].configurationVersionId,'candidate');assert.equal(record.data._controlledTransformation.output.records[0].rows[0].output.installedQuantity,12.5);
  const facts=record.data._controlledTransformation.output.records[0].rows.map(row=>({content:row.output,evidenceRefs:[{inputId:record.inputId}]}));assert.equal(controlledInstallationMatches([record],{status:'ANALYZED',findings:facts}),true);assert.equal(controlledInstallationMatches([record],{status:'ANALYZED',findings:[{content:{...facts[0].content,installedQuantity:999},evidenceRefs:facts[0].evidenceRefs}]}),false);
  const sample={...record,data:{...data,sourceRecord:{...record.data.sourceRecord,purpose:'CONFIGURATION',installationWorkOrderId:null}}};const checked=await checkEnabledConfigurationSample(f.db,'provider-dev-b',sample);assert.equal(checked.issues.length,0);assert.equal(checked.dependencies.length,1);
  const changed={...record,data:{...data,sourceRecord:{...record.data.sourceRecord,sourceFormatVersion:'unknown-v2'}}};const blocked=await applyEnabledConfigurations(f.db,item,[changed]);assert.ok(blocked.issues.length);assert.equal(changed.data._controlledTransformation,undefined);
  const unknown={...record,data:{...data,sourceRecord:{...record.data.sourceRecord,businessScopeKey:null}}};assert.ok((await applyEnabledConfigurations(f.db,item,[unknown])).issues.length);
 }finally{f.db.close();}
});
for(const reuse of [false,true])test(`enablement ${reuse?'reuses':'creates'} one configuration scope and schedules actual latest source references`,async()=>{
 const f=fixture();try{
  const now=Date.now();
  if(reuse)f.db.sqlite.prepare(`INSERT INTO work_item(id,service_provider_id,item_kind,business_key,business_identity_json,creation_key,title,status,integration_config_id,gmt_create,gmt_modified) VALUES('changed-item','provider-dev-b','CONFIGURATION','changed-key','["change"]','change-created','新格式','PREPARING','cfg',?,?)`).run(now,now);
  for(const version of ['fv-2','fv-3']){
   const data={sourceRecord:{serviceProviderId:'provider-dev-b',sourceSystem:'provider-docs',sourceRecordId:'new-'+version,sourceVersion:'d-'+version,purpose:'CONFIGURATION',configurationPurpose:'INSTALLATION',businessScopeKey:'install-main',sourceFormatVersion:version}};
   f.db.sqlite.prepare(`INSERT INTO analysis_input_item VALUES(?,?,?,'RECORD','PROVIDER_RECORD','provider-docs',?,?,?,NULL,?,?,?)`).run('new-input-'+version,'new-snapshot-'+version,'record','new-'+version,'d-'+version,JSON.stringify(data),now,now,now);
   f.db.sqlite.prepare(`INSERT INTO analysis_input_snapshot VALUES(?,1,?,'provider-dev-b',1,'INTEGRATION_CONFIGURATION','1.0.0','1.0.0','[]','COMPLETE','[]',1,?,?,?)`).run('new-snapshot-'+version,reuse?'changed-item':'item','c'.repeat(64),now,now);
  }
  const a=await buildConfigurationTrialAdoption(f.db,f.job);await f.db.batch(a.statements);const trial=f.db.sqlite.prepare('SELECT id FROM configuration_trial').get(),row=f.row();
  await enableConfiguration(f.db,human,row,'enable-followup',{expectedWorkItemVersion:row.row_version,expectedResponsibilityVersion:1,candidateVersionId:'candidate',trialId:trial.id,expectedConfigurationRowVersion:1,expectedActiveVersionId:null});
  const pending=f.db.sqlite.prepare("SELECT * FROM work_item WHERE status<>'COMPLETED'").all();assert.equal(pending.length,1);assert.equal(pending[0].status,'PREPARING');if(reuse)assert.equal(pending[0].id,'changed-item');else assert.equal(JSON.parse(pending[0].business_identity_json).length,9);
  const jobs=f.db.sqlite.prepare("SELECT * FROM background_job WHERE purpose='READ_SOURCE'").all();assert.equal(jobs.length,1);assert.equal(jobs[0].work_item_id,pending[0].id);const activity=f.db.sqlite.prepare('SELECT details_json FROM activity_record WHERE work_item_id=? ORDER BY gmt_create DESC').all(pending[0].id).find(r=>JSON.parse(r.details_json).sourceReferences);assert.equal(JSON.parse(activity.details_json).sourceReferences.length,2);
 }finally{f.db.close();}
});
test('refreshing row version cannot enable prior generation trial or relabel old source as a new trial',async()=>{
 const f=fixture();try{const a=await buildConfigurationTrialAdoption(f.db,f.job);await f.db.batch(a.statements);const trial=f.db.sqlite.prepare('SELECT id FROM configuration_trial').get();f.db.sqlite.prepare("UPDATE work_item SET analysis_generation=analysis_generation+1,current_analysis_result_id=NULL,row_version=row_version+1,status='PREPARING' WHERE id='item'").run();const row=f.row();
 await assert.rejects(enableConfiguration(f.db,human,row,'old-generation',{expectedWorkItemVersion:row.row_version,expectedResponsibilityVersion:1,candidateVersionId:'candidate',trialId:trial.id,expectedConfigurationRowVersion:1,expectedActiveVersionId:null}),/代次|当前输入|当前分析/);
 const newer=await buildConfigurationTrialAdoption(f.db,{...f.job,id:'new-trial-for-old-candidate'});assert.equal(newer.ok,false);assert.equal(newer.errorCode,'TRIAL_INPUT_SUPERSEDED');
 await assert.rejects(saveConfigurationDraft(f.db,human,row,'stale-save',{expectedWorkItemVersion:row.row_version,expectedResponsibilityVersion:1,expectedCandidateVersionId:'candidate',rules:f.rules,applicability:f.applicability,editNotes:[{field:'rules',reason:'旧资料编辑'}]}),/当前分析|当前输入|代次/);
 }finally{f.db.close();}
});
test('new generation preserves edited rules as a new candidate tied to fresh analysis and reruns actual trial',async()=>{
 const f=fixture();try{
  const saved=await saveConfigurationDraft(f.db,human,f.row(),'human-first',{expectedWorkItemVersion:2,expectedResponsibilityVersion:1,expectedCandidateVersionId:'candidate',rules:f.rules,applicability:f.applicability,editNotes:[{field:'rules',reason:'人工核实'}]});
  f.db.sqlite.prepare("UPDATE work_item SET analysis_generation=2,current_analysis_result_id=NULL,row_version=row_version+1,status='PREPARING' WHERE id='item'").run();const now=Date.now(),row=f.row();
  f.db.sqlite.prepare(`INSERT INTO analysis_input_item SELECT id||'-new','fresh-snapshot',input_key,input_kind,record_type,source_system,source_record_id,source_version,data_json,parsing_id,?,?,? FROM analysis_input_item WHERE snapshot_id='original-snapshot'`).run(now,now,now);
  f.db.sqlite.prepare(`INSERT INTO analysis_input_snapshot VALUES('fresh-snapshot',2,'item','provider-dev-b',?,'INTEGRATION_CONFIGURATION','1.0.0','1.0.0','[]','COMPLETE','[]',2,?,?,?)`).run(row.row_version,'f'.repeat(64),now,now);
  const target={runId:'fresh-run',snapshotId:'fresh-snapshot',workItemId:'item',profileId:'test',implementationVersion:'1'},job={id:'fresh-job',work_item_id:'item',target_json:JSON.stringify(target)};
  f.db.sqlite.prepare(`INSERT INTO background_job(id,purpose,service_provider_id,work_item_id,target_json,dedupe_key,status,lease_epoch,row_version,gmt_create,gmt_modified) VALUES('fresh-job','ANALYZE_SKILL','provider-dev-b','item',?,'fresh','READY',0,1,?,?)`).run(job.target_json,now,now);
  f.db.sqlite.prepare(`INSERT INTO capability_call VALUES('fresh-run','fresh-job','ANALYZE_SKILL',NULL,'fresh-snapshot','test','1','{}',?,?,?)`).run('f'.repeat(64),now,now);
  const result={skill:'INTEGRATION_CONFIGURATION',skillVersion:'1.0.0',outputSchemaVersion:'1.0.0',inputSnapshotId:'fresh-snapshot',status:'ANALYZED',summary:'核实新版样例',findings:[{findingId:'rules',type:'TRANSFORMATION_CONFIG',content:{ruleCatalogVersion:'charging-transform-1',purpose:'INSTALLATION',sourceFormatId:'fmt-1',sourceFormatVersion:'fv-1',rowPath:'/rows',rules:f.rules},evidenceRefs:[{inputId:'provider-format',blockId:null,jsonPointer:'/fields/0/meaning',quote:'明确字段含义'}]}],openQuestions:[]};
  const {buildAnalysisAdoption}=await loadModule('../../src/services/analysis-pipeline.ts');const a=await buildAnalysisAdoption(f.db,job,result);assert.equal(a.ok,true);await f.db.batch(a.statements);
  const current=f.row(),candidate=f.db.sqlite.prepare('SELECT * FROM integration_config_version WHERE id=?').get(current.current_configuration_version_id);assert.notEqual(candidate.id,saved.candidateVersionId);assert.equal(candidate.analysis_result_id,current.current_analysis_result_id);assert.deepEqual(JSON.parse(candidate.rules_json),f.rules);
  const trial=await buildConfigurationTrialAdoption(f.db,{id:'fresh-trial',work_item_id:'item',target_json:JSON.stringify({configurationId:'cfg',configurationVersionId:candidate.id,workItemId:'item'})});assert.equal(trial.ok,true);await f.db.batch(trial.statements);assert.equal(trial.result.status,'PASSED');assert.equal(f.db.sqlite.prepare('SELECT analysis_generation FROM analysis_input_snapshot WHERE id=?').get(trial.result.inputSnapshotId).analysis_generation,2);
 }finally{f.db.close();}
});

test('new same-format source sample actually transforms with the enabled configuration without another work item',async()=>{
 const f=fixture(),original=globalThis.fetch;try{
 const trialAdoption=await buildConfigurationTrialAdoption(f.db,f.job);await f.db.batch(trialAdoption.statements);const trial=f.db.sqlite.prepare('SELECT id FROM configuration_trial').get(),r=f.row();
 await enableConfiguration(f.db,human,r,'enable-discovery-fence',{expectedWorkItemVersion:r.row_version,expectedResponsibilityVersion:r.responsibility_version,candidateVersionId:'candidate',trialId:trial.id,expectedConfigurationRowVersion:1,expectedActiveVersionId:null});
 const data=JSON.parse(f.db.sqlite.prepare("SELECT data_json FROM analysis_input_item WHERE id='input-provider-record'").get().data_json);data.sourceRecord.installationWorkOrderId=null;data.sourceRecord.sourceVersion='doc-v10';
 globalThis.fetch=async url=>Response.json({code:0,data:String(url).endsWith('/identity/sessions')?{token:'test'}:data});
 const {discoverConfiguration}=await loadModule('../../src/services/configuration-discovery.ts');
 const adoption=await discoverConfiguration(f.db,{EXTERNAL_MODE:'mock',MOCK_BASE_URL:'http://discovery-fence',MOCK_ACCOUNT_ID:'service'},'provider-dev-b',{id:'new-change',source_system:'provider-docs',source_record_id:'doc-1',source_version:'doc-v10'});
 assert.equal(adoption.jobStatus,'SUCCEEDED');assert.deepEqual(adoption.result.workItemIds,[]);assert.ok(adoption.statements.length>0);
 await f.db.batch(adoption.statements);
 assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM work_item').get().n,1);
 assert.equal(adoption.result.configurationCheck.status,'PASSED');
 assert.equal(adoption.result.configurationCheck.output.records[0].rows[0].output.installedQuantity,12.5);
 }finally{globalThis.fetch=original;f.db.close();}
});


test('Excel cell evidence passes trial; missing cell or fabricated quote remains blocked',async()=>{
 const {calculateConfigurationTrial}=await loadModule('../../src/services/config-trial-calculation.ts');
 const {loadFixedAnalysisInput}=await loadModule('../../src/services/analysis-fixed-input.ts');
 const f=fixture();try{
  const candidate=f.db.sqlite.prepare("SELECT * FROM integration_config_version WHERE id='candidate'").get();
  const scope=f.db.sqlite.prepare("SELECT * FROM integration_config WHERE id='cfg'").get();
  const fixed=await loadFixedAnalysisInput(f.db,'original-snapshot');
  const cell={inputId:'excel-parse',blockId:'sheet-1:A1',jsonPointer:null,quote:'安装项目'};
  const applicability={...f.applicability,basisReferences:[...f.applicability.basisReferences,cell]};
  candidate.applicability_json=JSON.stringify(applicability);
  const input={skillVersion:'1.0.0',outputSchemaVersion:'1.0.0',requiredState:'COMPLETE',inputIssues:[],records:fixed.analysisInput.records,parsedMaterials:[{parseId:'excel-parse',sourceSystem:'file-service',sourceMaterialId:'xlsx',sourceVersion:'v1',contentSha256:'a'.repeat(64),completeness:'COMPLETE',units:[{unitId:'sheet-1',kind:'SHEET',index:1,name:'安装明细',status:'COMPLETE'}],blocks:[{blockId:'sheet-1:A1',unitId:'sheet-1',kind:'TABLE_CELL',text:'安装项目',cellRange:'A1',formula:null,cachedValue:null}],issues:[]}]};
  assert.equal(calculateConfigurationTrial(candidate,scope,input).status,'PASSED');
  for(const invalid of [{...cell,blockId:'sheet-1:Z99'},{...cell,quote:'不存在的内容'},{...cell,inputId:'other-provider-parse'}]){
   candidate.applicability_json=JSON.stringify({...applicability,basisReferences:[invalid]});
   const result=calculateConfigurationTrial(candidate,scope,input);assert.equal(result.status,'NEEDS_INFORMATION');assert.equal(result.checks.meanings_resolved,false);
  }
 }finally{f.db.close();}
});
