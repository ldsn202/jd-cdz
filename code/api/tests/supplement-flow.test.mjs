import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDatabase} from './helpers/sqlite-d1.mjs';
import {loadModule} from './helpers/load-app.mjs';
const {submitSupplement}=await loadModule('../../src/services/supplement-sync.ts');
const {buildSourceDiscovery,sourceVersionAlreadyIncluded}=await loadModule('../../src/services/source-discovery.ts');
test('only reliably submitted supplements enter the next review input, preserving the reply and attachment references',async()=>{
 const {collectAnalysisSources}=await loadModule('../../src/services/analysis-sources.ts');
 const f=fixture();try{
  const submitted=await submitSupplement(f.db,f.identity,f.row(),'input',f.body,async()=>f.context);
  const item={...f.row(),wo_source_id:null};
  let sources=await collectAnalysisSources(f.db,{},item,'INSTALLATION_EVIDENCE');
  assert.equal(sources.records.filter(r=>r.recordType==='SUPPLEMENTAL_RESPONSE').length,0);
  const now=Date.now();
  f.db.sqlite.prepare("UPDATE external_write_operation SET status='SUCCEEDED',receipt_json=?,verified_at=?,row_version=2,gmt_modified=? WHERE id=?").run(JSON.stringify({sourceRecord:{sourceRecordId:'reply-1',sourceVersion:'r1'}}),now,now,submitted.operationId);
  f.db.sqlite.prepare('UPDATE supplemental_response SET success_verified_at=?,gmt_modified=? WHERE submit_decision_id=?').run(now,now,submitted.decisionId);
  sources=await collectAnalysisSources(f.db,{},item,'INSTALLATION_EVIDENCE');
  const record=sources.records.find(r=>r.recordType==='SUPPLEMENTAL_RESPONSE');
  assert.equal(record.data.replyText,f.body.replyText);assert.deepEqual(record.data.sourceMaterials,[]);
  assert.equal(record.sourceVersion,'r1');assert.equal(record.data.serviceProviderId,'provider-dev-b');
 }finally{f.db.close();}
});
function fixture(){
 const db=createDatabase(),now=Date.now();
 db.sqlite.exec(readFileSync(new URL('../../db/seeds/dev-identity.sql',import.meta.url),'utf8'));
 db.sqlite.prepare("INSERT INTO installation_work_order(id,source_system,source_id,current_service_provider_id,source_version,gmt_create,gmt_modified) VALUES('wo','installation_management','WO-008','provider-dev-b','w1',?,?)").run(now,now);
 db.sqlite.prepare("INSERT INTO work_item(id,service_provider_id,installation_work_order_id,item_kind,business_key,business_identity_json,creation_key,title,status,assignee_identity_id,gmt_create,gmt_modified) VALUES('item','provider-dev-b','wo','INSTALLATION_REVIEW','key','[1]','creation','核查','READY','ir-dev-jd-review',?,?)").run(now,now);
 db.sqlite.prepare(`INSERT INTO analysis_input_item VALUES('record','snapshot','order','RECORD','INSTALLATION_WORK_ORDER','installation_management','WO-008','w3','{}',NULL,?,?,?)`).run(now,now,now);
 db.sqlite.prepare(`INSERT INTO analysis_input_snapshot VALUES('snapshot',1,'item','provider-dev-b',1,'INSTALLATION_EVIDENCE','1.0.0','1.0.0','[]','INCOMPLETE','["施工材料"]',1,?,?,?)`).run('a'.repeat(64),now,now);
 db.sqlite.prepare(`INSERT INTO background_job(id,purpose,service_provider_id,work_item_id,target_json,dedupe_key,status,lease_epoch,row_version,outcome_json,gmt_create,gmt_modified) VALUES('analysis-job','ANALYZE_SKILL','provider-dev-b','item','{}','analysis-test','SUCCEEDED',0,1,'{}',?,?)`).run(now,now);
 db.sqlite.prepare(`INSERT INTO capability_call VALUES('analysis-run','analysis-job','ANALYZE_SKILL',NULL,'snapshot','test','1','{}',?,?,?)`).run('a'.repeat(64),now,now);
 db.sqlite.prepare(`INSERT INTO analysis_result VALUES('analysis','analysis-run','item','snapshot','test','1','NEEDS_INFORMATION','缺施工材料','[]','["施工材料"]',?,?,?)`).run(now,now,now);
 db.sqlite.prepare("INSERT INTO human_decision(id,work_item_id,service_provider_id,origin,action_type,request_key,actor_identity_id,identity_context_id,matched_grants_json,expected_work_item_version,expected_responsibility_version,analysis_result_id,confirmed_at,content_json,gmt_create,gmt_modified) VALUES('hd','item','provider-dev-b','LOCAL','REQUEST_SUPPLEMENT','request','ir-dev-jd-review','ci-dev-jd-review','[\"g-review-a\"]',1,1,'analysis',?,'{}',?,?)").run(now,now,now);
 db.sqlite.prepare("INSERT INTO external_write_operation VALUES('op','hd','item','provider-dev-b','wo','installation_management','REVIEW_SYNC','REQUEST_SUPPLEMENT','{}',?,'REGISTERED',NULL,NULL,1,?,?)").run('a'.repeat(64),now,now);
 db.sqlite.prepare("UPDATE external_write_operation SET status='SUCCEEDED',receipt_json=?,verified_at=?,row_version=2,gmt_modified=? WHERE id='op'").run(JSON.stringify({sourceRecord:{sourceRecordId:'review-1',sourceVersion:'r1',workOrderSourceVersion:'w3'}}),now,now);
 db.sqlite.prepare("UPDATE work_item SET status='WAITING_SUPPLEMENT',active_supplement_request_id='hd',assignee_identity_id='ir-dev-provider-clerk',responsibility_version=2,row_version=2 WHERE id='item'").run();
 const identity={identityId:'ir-dev-provider-clerk',subjectType:'HUMAN',grants:[{grantId:'g-clerk-b',scopeType:'SERVICE_PROVIDER',resourceIds:['provider-dev-b'],actions:['SUBMIT_SUPPLEMENT']}]};
 const body={expectedWorkItemVersion:2,expectedResponsibilityVersion:2,requestDecisionId:'hd',replyText:'已补充施工记录',materialVersionIds:[]};
 const context={installationWorkOrder:{installationWorkOrderId:'WO-008',serviceProviderId:'provider-dev-b',sourceVersion:'w-after-return'},installationDetail:{installationDetailId:'DTL-008',sourceVersion:'detail-current'}};
 const row=()=>db.sqlite.prepare("SELECT * FROM work_item WHERE id='item'").get();
 return {db,now,identity,body,context,row};
}
test('supplement uses fresh source detail and work-order versions; retry keeps the same persisted request',async()=>{
 const f=fixture();try{
  let reads=0;
  const result=await submitSupplement(f.db,f.identity,f.row(),'once',f.body,async id=>{assert.equal(id,'WO-008');reads++;return f.context;});
  const op=f.db.sqlite.prepare('SELECT request_json FROM external_write_operation WHERE id=?').get(result.operationId);
  const request=JSON.parse(op.request_json);
  assert.equal(request.installationDetailId,'DTL-008');assert.equal(request.expectedDetailVersion,'detail-current');assert.equal(request.expectedWorkOrderVersion,'w-after-return');
  const replay=await submitSupplement(f.db,f.identity,f.row(),'once',f.body,async()=>{throw Error('idempotent replay must not reread');});
  assert.equal(replay.operationId,result.operationId);assert.equal(reads,1);
  assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM background_job WHERE purpose='ANALYZE_SKILL'").get().n,1);
 }finally{f.db.close();}
});
test('incomplete or foreign fresh context cannot register a supplement write',async()=>{
 for(const context of [{installationWorkOrder:{installationWorkOrderId:'WO-008',serviceProviderId:'other',sourceVersion:'v1'},installationDetail:{installationDetailId:'D',sourceVersion:'d1'}},{installationWorkOrder:{installationWorkOrderId:'WO-008',serviceProviderId:'provider-dev-b',sourceVersion:'v1'},installationDetail:null}]){
  const f=fixture();try{await assert.rejects(submitSupplement(f.db,f.identity,f.row(),'new',f.body,async()=>context),/正式安装明细/);
   assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM external_write_operation').get().n,1);
   assert.equal(f.row().status,'WAITING_SUPPLEMENT');
  }finally{f.db.close();}
 }
});
test('adopted review echo cannot recreate a completed stage',async()=>{
 const f=fixture();try{
  f.db.sqlite.prepare("UPDATE work_item SET status='COMPLETED',active_supplement_request_id=NULL,row_version=3,completion_code='REVIEW_APPROVED',completed_at=?,completion_basis_json='{}' WHERE id='item'").run(f.now);
  f.db.sqlite.prepare("INSERT INTO change_feed VALUES('feed','provider-dev-b','installation-admin',?,?)").run(f.now,f.now);
  f.db.sqlite.prepare("INSERT INTO source_change VALUES('change','feed','change','INSTALLATION_REVIEW','review-1','r1','UPSERT','COMPLETE','[\"WO-008\"]','{}',?,?,?)").run('a'.repeat(64),f.now,f.now);
  const result=await buildSourceDiscovery(f.db,{}, {id:'job',service_provider_id:'provider-dev-b',target_json:JSON.stringify({changeId:'change'})});
  assert.equal(result.jobStatus,'SUCCEEDED');assert.equal(result.statements.length,0);assert.deepEqual(result.result.workItemIds,['item']);
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM work_item').get().n,1);
  f.db.sqlite.prepare("INSERT INTO source_change VALUES('change-wo','feed','change-wo','INSTALLATION_WORK_ORDER','WO-008','w3','UPSERT','COMPLETE','[\"WO-008\"]','{}',?,?,?)").run('a'.repeat(64),f.now,f.now);
  const echo=await buildSourceDiscovery(f.db,{}, {id:'job2',service_provider_id:'provider-dev-b',target_json:JSON.stringify({changeId:'change-wo'})});
  assert.equal(echo.jobStatus,'SUCCEEDED');assert.equal(echo.statements.length,0);
 }finally{f.db.close();}
});
test('late source notification only reuses the exact record version already in this analysis generation',async()=>{
 const f=fixture();try{

  const change={record_type:'INSTALLATION_WORK_ORDER',source_record_id:'WO-008',source_version:'w3'};
  assert.equal(await sourceVersionAlreadyIncluded(f.db,'item',1,change,'installation_management'),true);
  assert.equal(await sourceVersionAlreadyIncluded(f.db,'item',1,{...change,source_version:'w4'},'installation_management'),false);
  assert.equal(await sourceVersionAlreadyIncluded(f.db,'item',2,change,'installation_management'),false);
  assert.equal(await sourceVersionAlreadyIncluded(f.db,'other',1,change,'installation_management'),false);
 }finally{f.db.close();}
});
