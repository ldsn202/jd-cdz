import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDatabase} from './helpers/sqlite-d1.mjs';
import {loadModule} from './helpers/load-app.mjs';
const {prepareAndRegisterAnalysis}=await loadModule('../../src/services/analysis-pipeline.ts');
const {getAgentRun,registerAgentRun}=await loadModule('../../src/services/agent-run.ts');
const identity={identityId:'ir-dev-service',subjectType:'SERVICE',grants:[{scopeType:'SERVICE_PROVIDER',actions:['PREPARE_ANALYSIS'],resourceIds:['provider-dev-b']}]};
let serial=0;
function fixture(){
 const db=createDatabase();db.sqlite.exec(readFileSync(new URL('../../db/seeds/dev-identity.sql',import.meta.url),'utf8'));const now=Date.now();
 db.sqlite.prepare(`INSERT INTO integration_config VALUES('cfg','provider-dev-b','provider-docs','INSTALLATION','install-main',NULL,NULL,1,?,?)`).run(now,now);
 db.sqlite.prepare(`INSERT INTO work_item(id,service_provider_id,item_kind,business_key,business_identity_json,creation_key,title,status,integration_config_id,gmt_create,gmt_modified) VALUES('item','provider-dev-b','CONFIGURATION','cfg-key',?,'cfg-created','配置','PREPARING','cfg',?,?)`).run(JSON.stringify(['provider-dev-b','CONFIGURATION','CONFIG_SCOPE','provider-docs','cfg','PROVIDER_RECORD','provider-docs','doc-1','CONFIGURE']),now,now);
 const document={retrievedAt:new Date().toISOString(),sourceRecord:{sourceSystem:'provider-docs',sourceRecordId:'doc-1',sourceVersion:'d1',serviceProviderId:'provider-dev-b',purpose:'CONFIGURATION',configurationPurpose:'INSTALLATION',businessScopeKey:'install-main',sourceFormatId:'fmt',sourceFormatVersion:'f1',installationWorkOrderId:null},contentComplete:true,completeness:'COMPLETE',missingParts:[],formatStatus:'PROVIDED',formatDefinition:{formatId:'fmt',sourceVersion:'f1',fields:[{fieldKey:'name',label:'项目',meaning:'安装项目',unit:null}],notes:null,sourceMaterials:[]},rawJson:'{"rows":[{"name":"电缆"}]}',sourceMaterials:[]};
 const calls=[],orig=globalThis.fetch;const env={EXTERNAL_MODE:'mock',MOCK_BASE_URL:`http://prepare-${++serial}`,MOCK_ACCOUNT_ID:'service'};
 globalThis.fetch=async url=>{calls.push(String(url));return Response.json({code:0,data:String(url).endsWith('/sessions')?{token:'session'}:document});};
 const body={runId:'run',profileId:'real-profile',implementationVersion:'1',skillPackageDigest:'digest',analysisInput:{workItemId:'item',skill:'INTEGRATION_CONFIGURATION'}};
 return {db,env,body,calls,document,close(){globalThis.fetch=orig;db.close();}};
}
test('configuration preparation uses proven provider record without requiring a work order; retry pins first read',async()=>{
 const f=fixture();try{
  await prepareAndRegisterAnalysis(f.db,f.env,identity,f.body);
  const snapshot=f.db.sqlite.prepare('SELECT * FROM analysis_input_snapshot').get();assert.equal(snapshot.required_input_state,'COMPLETE');
  const records=f.db.sqlite.prepare('SELECT * FROM analysis_input_item ORDER BY record_type').all();assert.deepEqual(records.map(r=>r.record_type),['PROVIDER_FORMAT','PROVIDER_RECORD']);
  assert.equal(records[0].source_version,'f1');assert.equal(records[1].source_version,'d1');assert.ok(f.calls.some(x=>x.includes('/records/doc-1/documents')));
  const count=f.calls.length;f.document.sourceRecord.sourceVersion='d2';await prepareAndRegisterAnalysis(f.db,f.env,identity,f.body);assert.equal(f.calls.length,count);
  await assert.rejects(prepareAndRegisterAnalysis(f.db,f.env,identity,{...f.body,profileId:'changed'}),/runId/);
 }finally{f.close();}
});
test('skill-kind and provider mismatch are rejected without persisting a task',async()=>{
 const f=fixture();try{
  await assert.rejects(prepareAndRegisterAnalysis(f.db,f.env,identity,{...f.body,analysisInput:{workItemId:'item',skill:'INSTALLATION_EXTRACTION'}}),/类型/);
  f.document.sourceRecord.serviceProviderId='provider-dev-a';await assert.rejects(prepareAndRegisterAnalysis(f.db,f.env,identity,f.body),/范围/);
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM capability_call').get().n,0);
 }finally{f.close();}
});
test('internal lease guard rolls back all preparation writes',async()=>{
 const f=fixture();try{
  await assert.rejects(prepareAndRegisterAnalysis(f.db,f.env,identity,f.body,{beforeStatements:async()=>[f.db.prepare("INSERT INTO transaction_assertion VALUES('lost',0,0,0)")]}));
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM analysis_input_snapshot').get().n,0);
 }finally{f.close();}
});
test('agent run read enforces provider scope and returns BLOCKED truthfully',async()=>{
 const f=fixture();try{
  await prepareAndRegisterAnalysis(f.db,f.env,identity,f.body);
  f.db.sqlite.prepare(`UPDATE background_job SET status='BLOCKED',outcome_json='{"errorCode":"SOURCE_MISSING"}',row_version=row_version+1 WHERE purpose='ANALYZE_SKILL'`).run();
  assert.equal((await getAgentRun(f.db,identity,'run')).status,'BLOCKED');
  await assert.rejects(getAgentRun(f.db,{...identity,grants:[]},'run'),/不可见/);
 }finally{f.close();}
});
test('agent registration cannot infer source ownership from first grant',async()=>{
 const f=fixture();try{await assert.rejects(registerAgentRun(f.db,f.env,identity,{...f.body,operation:'ANALYZE_SKILL',analysisInput:{inputSnapshotId:'untrusted'},inputDigest:'a'.repeat(64)}),/快照|范围|workItemId/);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM background_job').get().n,0);}finally{f.close();}
});
const {buildAnalysisAdoption}=await loadModule('../../src/services/analysis-pipeline.ts');
function configurationResult(f){
 const snapshot=f.db.sqlite.prepare('SELECT * FROM analysis_input_snapshot').get();
 const rules=['installationItem','installedQuantity','unit','materialSupplier','serviceScope'].map(targetField=>({ruleId:targetField,sourceFields:['/'+targetField],targetField,operation:'PIPELINE',parameters:{steps:[{op:'field',path:'/'+targetField}]},conditions:[]}));
 const result={skill:'INTEGRATION_CONFIGURATION',skillVersion:'1.0.0',outputSchemaVersion:'1.0.0',inputSnapshotId:snapshot.id,status:'ANALYZED',summary:'已整理候选规则',findings:[{findingId:'mapping',type:'TRANSFORMATION_CONFIG',content:{ruleCatalogVersion:'charging-transform-1',purpose:'INSTALLATION',sourceFormatId:'fmt',sourceFormatVersion:'f1',rowPath:'/rows',rules},evidenceRefs:[{inputId:'record-2',blockId:null,jsonPointer:'/fields/0/meaning',quote:'安装项目'}]}],openQuestions:[]};
 return {result,job:f.db.sqlite.prepare("SELECT * FROM background_job WHERE purpose='ANALYZE_SKILL'").get()};
}
test('validated configuration result creates a scoped candidate and real trial task without activation',async()=>{
 const f=fixture();try{await prepareAndRegisterAnalysis(f.db,f.env,identity,f.body);const {job,result}=configurationResult(f);const a=await buildAnalysisAdoption(f.db,job,result);assert.equal(a.ok,true);await f.db.batch(a.statements);
 const v=f.db.sqlite.prepare('SELECT * FROM integration_config_version').get();assert.ok(v);assert.equal(v.source_format_version,'f1');assert.equal(v.origin,'AI');assert.equal(JSON.parse(v.applicability_json).serviceProviderId,'provider-dev-b');assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM background_job WHERE purpose='TRIAL_CONFIG'").get().n,1);assert.equal(f.db.sqlite.prepare('SELECT current_version_id FROM integration_config').get().current_version_id,null);
 assert.equal(f.db.sqlite.prepare('SELECT status FROM work_item').get().status,'READY');
 }finally{f.close();}
});
test('late generation retains analysis history but cannot create configuration candidate or trial',async()=>{
 const f=fixture();try{await prepareAndRegisterAnalysis(f.db,f.env,identity,f.body);const {job,result}=configurationResult(f);f.db.sqlite.prepare('UPDATE work_item SET analysis_generation=analysis_generation+1,row_version=row_version+1').run();const a=await buildAnalysisAdoption(f.db,job,result);await f.db.batch(a.statements);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM analysis_result').get().n,1);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM integration_config_version').get().n,0);}finally{f.close();}
});
test('missing file storage cannot be disguised as completed source acquisition',async()=>{
 const f=fixture();try{f.document.sourceMaterials=[{sourceSystem:'provider-docs',sourceMaterialId:'sheet',sourceVersion:'v1'}];await assert.rejects(prepareAndRegisterAnalysis(f.db,f.env,identity,f.body),/FILES/);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM analysis_input_snapshot').get().n,0);}finally{f.close();}
});
test('exception entered after dispatch cannot be reset by late analysis or create products',async()=>{
 const f=fixture();try{await prepareAndRegisterAnalysis(f.db,f.env,identity,f.body);const {job,result}=configurationResult(f);f.db.sqlite.prepare("UPDATE work_item SET status='EXCEPTION',row_version=row_version+1").run();const a=await buildAnalysisAdoption(f.db,job,result);await f.db.batch(a.statements);assert.equal(f.db.sqlite.prepare('SELECT status FROM work_item').get().status,'EXCEPTION');assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM integration_config_version').get().n,0);}finally{f.close();}
});
test('source material defers snapshot until actual parsing exists, then same runId seals incomplete facts',async()=>{
 const f=fixture();try{
  const bytes=new TextEncoder().encode('source workbook bytes'),sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  f.env.FILES={async put(){}};f.document.sourceMaterials=[{sourceSystem:'provider-docs',sourceMaterialId:'sheet',sourceVersion:'v1'}];
  globalThis.fetch=async url=>Response.json({code:0,data:String(url).endsWith('/sessions')?{token:'session'}:String(url).includes('/materials/')?{...f.document.sourceMaterials[0],name:'sheet.xlsx',mediaType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',sourceUpdatedAt:null,retrievedAt:new Date().toISOString(),byteLength:bytes.length,contentSha256:sha,contentBase64:Buffer.from(bytes).toString('base64')}:f.document});
  const deferred=await prepareAndRegisterAnalysis(f.db,f.env,identity,f.body);assert.equal(deferred.status,'DEFERRED');assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM analysis_input_snapshot').get().n,0);assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM capability_call WHERE operation='ANALYZE_SKILL'").get().n,0);
  assert.equal((await prepareAndRegisterAnalysis(f.db,f.env,identity,f.body)).status,'DEFERRED');assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM background_job WHERE purpose='PARSE_MATERIAL'").get().n,1);
  const {materialParsingTarget,buildMaterialParsingAdoption}=await loadModule('../../src/services/material-parsing.ts');const job=f.db.sqlite.prepare("SELECT * FROM background_job WHERE purpose='PARSE_MATERIAL'").get(),t=await materialParsingTarget(f.db,job.id,JSON.parse(job.target_json));
  const result={runId:t.runId,operation:'PARSE_MATERIAL',profileId:t.profileId,implementationVersion:t.implementationVersion,inputSnapshotId:null,analysis:null,parsing:{parseId:'incomplete',sourceSystem:'provider-docs',sourceMaterialId:'sheet',sourceVersion:'v1',contentSha256:sha,completeness:'INCOMPLETE',units:[{unitId:'sheet',kind:'SHEET',index:1,name:'sheet',status:'UNREADABLE'}],blocks:[],issues:['工作簿无法解析']}};
  const a=await buildMaterialParsingAdoption(f.db,job,result);assert.equal(a.ok,true);await f.db.batch(a.statements);assert.equal((await prepareAndRegisterAnalysis(f.db,f.env,identity,f.body)).status,'ACCEPTED');assert.equal(f.db.sqlite.prepare('SELECT required_input_state FROM analysis_input_snapshot').get().required_input_state,'INCOMPLETE');
 }finally{f.close();}
});
test('source-limited PREPARE_ANALYSIS cannot bypass multi-source preparation through direct agent routes',async()=>{
 const f=fixture();try{const limited={...identity,grants:identity.grants.map(g=>({...g,sourceSystem:'provider-docs',recordType:'PROVIDER_RECORD'}))};await assert.rejects(prepareAndRegisterAnalysis(f.db,f.env,limited,f.body),/权限/);assert.equal(f.calls.length,0);await prepareAndRegisterAnalysis(f.db,f.env,identity,f.body);await assert.rejects(getAgentRun(f.db,limited,'run'),/不可见/);}finally{f.close();}
});
