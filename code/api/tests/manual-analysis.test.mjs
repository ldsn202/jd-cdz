import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDatabase } from './helpers/sqlite-d1.mjs';
import { loadModule } from './helpers/load-app.mjs';
const { claimJobs, dispatchConfigFromEnv } = await loadModule('../../src/services/job-dispatch.ts');
const { requestAnalysis, analysisProgress } = await loadModule('../../src/services/analysis-control.ts');
const { default: app } = await loadModule('../../src/index.ts');
const kinds = ['INSTALLATION_PREPARATION','INSTALLATION_REVIEW','RECONCILIATION','CONFIGURATION'];
const actions = ['CONFIRM_INSTALLATION_DRAFT','DECIDE_INSTALLATION_REVIEW','REQUEST_BILLING_VERIFICATION','ENABLE_INTEGRATION_CONFIG'];
const grants = [{scopeType:'SERVICE_PROVIDER',resourceIds:['provider-dev-a'],actions:['PREPARE_ANALYSIS',...actions]}];
const service = {identityId:'ir-dev-service',subjectType:'SERVICE',grants};
const human = {identityId:'ir-dev-jd-review',subjectType:'HUMAN',grants};
const config = dispatchConfigFromEnv({EXTERNAL_MODE:'mock'});
function fixture() {
  const db = createDatabase();
  for (const name of ['dev-identity','dev-work-items']) db.sqlite.exec(readFileSync(new URL(`../../db/seeds/${name}.sql`,import.meta.url),'utf8'));
  for (const kind of kinds) db.sqlite.prepare(`INSERT INTO work_item(id,service_provider_id,installation_work_order_id,item_kind,business_key,business_identity_json,creation_key,title,status,assignee_identity_id,responsibility_version,row_version,analysis_generation,gmt_create,gmt_modified) VALUES(?,'provider-dev-a',?,?,?,?, ?,?,'PREPARING','ir-dev-jd-review',1,1,1,1,1)`).run(kind,kind==='CONFIGURATION'?null:'wo-dev-1',kind,kind,JSON.stringify([kind]),kind,kind);
  const row=id=>db.sqlite.prepare('SELECT * FROM work_item WHERE id=?').get(id);
  const job=(id,kind,purpose='READ_SOURCE',target={analysisGeneration:1},status='READY')=>db.sqlite.prepare(`INSERT INTO background_job(id,purpose,service_provider_id,work_item_id,target_json,dedupe_key,status,available_at,lease_epoch,row_version,gmt_create,gmt_modified) VALUES(?,?,'provider-dev-a',?,?,?,?,0,0,1,1,1)`).run(id,purpose,kind,JSON.stringify(target),id,status);
  const trigger=(id,kind,details)=>db.sqlite.prepare(`INSERT INTO activity_record(id,work_item_id,event_key,event_type,actor_identity_id,occurred_at,details_json,gmt_create,gmt_modified) VALUES(?, ?,?,'PROGRESS_SAVED','ir-dev-jd-review',1,?,1,1)`).run(id,kind,`manual-analysis:${id}`,JSON.stringify(details));
  const claim=(purposes=['READ_SOURCE'],cfg=config)=>claimJobs(db,service,cfg,{purposes,limit:10});
  return {db,row,job,trigger,claim};
}
test('all four skills wait for an explicit click, including old startup recovery and retry jobs',async()=>{
  const f=fixture();try {
    for(const [i,kind] of kinds.entries()){
      for(const purpose of ['READ_SOURCE','ANALYZE_SKILL','RECONCILE','TRIAL_CONFIG','PARSE_MATERIAL']) f.job(`${kind}:${purpose}`,kind,purpose,{analysisGeneration:1},i%2?'RETRY_WAIT':'READY');
      f.trigger(`old-${kind}`,kind,{analysisGeneration:1,description:'重新请求分析'});
      assert.equal((await analysisProgress(f.db,f.row(kind),true)).state,'WAITING_MANUAL');
    }
    assert.deepEqual((await f.claim(['READ_SOURCE','ANALYZE_SKILL','RECONCILE','TRIAL_CONFIG','PARSE_MATERIAL'])).claims,[]);
    assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM execution_attempt').get().n,0);
  }finally{f.db.close();}
});
test('one click releases only its own existing task; each skill supports the same manual flow',async()=>{
  for(const kind of kinds){
    const f=fixture();try{
      for(const candidate of kinds) f.job(candidate,candidate);
      const response=await requestAnalysis(f.db,human,f.row(kind),'clicked',1);
      assert.equal(response.analysisGeneration,1);
      assert.deepEqual(await requestAnalysis(f.db,human,f.row(kind),'clicked',1),response);
      assert.equal((await analysisProgress(f.db,f.row(kind),true)).state,'PREPARING');
      const {claims}=await f.claim();assert.equal(claims.length,1);assert.equal(claims[0].jobId,kind);
      assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM background_job WHERE purpose='READ_SOURCE'").get().n,4);
      assert.equal((await f.claim()).claims.length,0);
    }finally{f.db.close();}
  }
});
test('a source update requires a new click and never revives old generation jobs',async()=>{
  const f=fixture();try{
    const kind=kinds[1];f.job('old',kind);f.trigger('clicked',kind,{analysisGeneration:1,manualTrigger:true});
    f.db.sqlite.prepare('UPDATE work_item SET analysis_generation=2,row_version=2 WHERE id=?').run(kind);
    f.job('new',kind,'READ_SOURCE',{analysisGeneration:2});
    assert.equal((await f.claim()).claims.length,0);
    await requestAnalysis(f.db,human,f.row(kind),'new-click',2);
    assert.deepEqual((await f.claim()).claims.map(c=>c.jobId),['new']);
  }finally{f.db.close();}
});
test('manual permission also gates the model snapshot, while real-source mode retains automation',async()=>{
  const f=fixture();try{
    f.job('model','w-dev-1','ANALYZE_SKILL',{snapshotId:'ais-dev-1'});
    assert.equal((await f.claim(['ANALYZE_SKILL'])).claims.length,0);
    f.trigger('model-click','w-dev-1',{analysisGeneration:1,manualTrigger:true});
    assert.deepEqual((await f.claim(['ANALYZE_SKILL'])).claims.map(c=>c.jobId),['model']);
    f.job('automatic',kinds[0]);
    assert.deepEqual((await f.claim(['READ_SOURCE'],dispatchConfigFromEnv({EXTERNAL_MODE:'real'}))).claims.map(c=>c.jobId),['automatic']);
    assert.equal(dispatchConfigFromEnv({}).manualAnalysis,true);
  }finally{f.db.close();}
});
test('HTTP detail reports manual mode and existing queued task is released by the frontend endpoint',async()=>{
  const f=fixture();try{
    const id=kinds[1];f.job('queued',id);
    const env={DB:f.db,AI_MODE:'real',EXTERNAL_MODE:'mock',DEV_IDENTITY_TOKENS:JSON.stringify({test:'jd-review-1'})};
    const headers={authorization:'Bearer test','content-type':'application/json','Idempotency-Key':'frontend-click'};
    const url=`http://localhost/api/admin/charging/work-items/${id}`;
    const detail=await (await app.request(url,{headers},env)).json();
    assert.equal(detail.data.analysisTriggerMode,'manual');assert.equal(detail.data.analysisProgress.state,'WAITING_MANUAL');assert.equal(detail.data.canRequestAnalysis,true);
    const clicked=await app.request(url+'/analysis',{method:'POST',headers,body:JSON.stringify({expectedVersion:1})},env);
    assert.equal(clicked.status,200);assert.deepEqual((await f.claim()).claims.map(c=>c.jobId),['queued']);
  }finally{f.db.close();}
});
