import test from 'node:test';import assert from 'node:assert/strict';
import {createDatabase} from './helpers/sqlite-d1.mjs';import {loadModule} from './helpers/load-app.mjs';
const {buildSourceDiscovery}=await loadModule('../../src/services/source-discovery.ts');
let serial=0;
function fixture(){const db=createDatabase(),now=Date.now(),original=globalThis.fetch;let calls=0;
 db.sqlite.prepare("INSERT INTO service_provider(id,source_system,source_id,gmt_create,gmt_modified) VALUES('sp','installation_management','sp',?,?)").run(now,now);
 db.sqlite.prepare("INSERT INTO change_feed VALUES('feed','sp','installation-admin',?,?)").run(now,now);
 for(const id of ['wo-1','wo-2'])db.sqlite.prepare("INSERT INTO installation_work_order(id,source_system,source_id,current_service_provider_id,source_version,gmt_create,gmt_modified) VALUES(?,'installation_management',?,'sp','v1',?,?)").run(id,id,now,now);
 const state={foreign:false};globalThis.fetch=async(url)=>{calls++;const p=new URL(url).pathname;if(p.endsWith('/identity/sessions'))return Response.json({code:0,data:{token:'test'}});const id=p.split('/').at(-2);return Response.json({code:0,data:{retrievedAt:new Date().toISOString(),completeness:'COMPLETE',missingParts:[],installationWorkOrder:{installationWorkOrderId:id,serviceProviderId:state.foreign&&id==='wo-2'?'other':'sp',sourceSystem:'installation_management',sourceVersion:'v1'},installationPlan:{installationPlanId:'plan-'+id,sourceSystem:'installation_management',sourceVersion:'p1',items:[]},installationDetailStatus:'NOT_SUBMITTED',installationDetail:null,sourceMaterials:[]}});};
 function change(id,version='v1',complete=true,orders=['wo-1','wo-2']){db.sqlite.prepare("INSERT INTO source_change VALUES(?,'feed',?,'SOURCE_MATERIAL','shared-material',?,'UPSERT',?,?,? ,?,?,?)").run(id,id,version,complete?'COMPLETE':'INCOMPLETE',JSON.stringify(orders),'{}','a'.repeat(64),now,now);return{id:'job-'+id,service_provider_id:'sp',target_json:JSON.stringify({changeId:id})};}
 return{db,state,change,env:{EXTERNAL_MODE:'mock',MOCK_BASE_URL:'http://discovery-'+ ++serial,MOCK_ACCOUNT_ID:'service'},close(){globalThis.fetch=original;db.close();},calls:()=>calls};}
test('shared source change creates all verified work items and preparation jobs; replay is stable',async()=>{const f=fixture();try{
 const job=f.change('change1');const r=await buildSourceDiscovery(f.db,f.env,job);assert.equal(r.jobStatus,'SUCCEEDED');await f.db.batch(r.statements);assert.equal(r.result.workItemIds.length,2);
 const rows=f.db.sqlite.prepare('SELECT * FROM work_item').all();assert.equal(rows.length,2);assert.ok(rows.every(r=>r.status==='PREPARING'&&r.assignee_identity_id===null));assert.equal(JSON.parse(rows[0].business_identity_json).length,9);
 assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM background_job WHERE purpose='READ_SOURCE'").get().n,2);
 const replay=await buildSourceDiscovery(f.db,f.env,job);assert.equal(replay.statements.length,0);
 }finally{f.close();}});
test('incomplete or foreign shared association cannot create even a partial set',async()=>{const f=fixture();try{
 const incomplete=await buildSourceDiscovery(f.db,f.env,f.change('incomplete','v1',false));assert.equal(incomplete.jobStatus,'BLOCKED');assert.equal(f.calls(),0);
 f.state.foreign=true;const foreign=await buildSourceDiscovery(f.db,f.env,f.change('foreign'));assert.equal(foreign.jobStatus,'BLOCKED');assert.equal(foreign.statements.length,0);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM work_item').get().n,0);
 }finally{f.close();}});
test('new exact source cause advances input generation while repeated same version does not',async()=>{const f=fixture();try{
 const first=await buildSourceDiscovery(f.db,f.env,f.change('first'));await f.db.batch(first.statements);
 const same=await buildSourceDiscovery(f.db,f.env,f.change('same'));if(same.statements.length)await f.db.batch(same.statements);
 assert.equal(f.db.sqlite.prepare('SELECT max(analysis_generation) n FROM work_item').get().n,1);
 const next=await buildSourceDiscovery(f.db,f.env,f.change('next','v2'));await f.db.batch(next.statements);
 assert.equal(f.db.sqlite.prepare('SELECT max(analysis_generation) n FROM work_item').get().n,2);
 }finally{f.close();}});
test('pending human or external action defers changes without consuming them',async()=>{const f=fixture();try{
 const first=await buildSourceDiscovery(f.db,f.env,f.change('initial','v1',true,['wo-1']));await f.db.batch(first.statements);
 const id=first.result.workItemIds[0];f.db.sqlite.prepare("UPDATE work_item SET status='PROCESSING',row_version=row_version+1 WHERE id=?").run(id);
 const next=f.change('delayed','v2',true,['wo-1']);const deferred=await buildSourceDiscovery(f.db,f.env,next);assert.equal(deferred.jobStatus,'RETRY_WAIT');assert.equal(deferred.statements.length,0);assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM activity_record WHERE event_key='source-change:delayed'").get().n,0);
 f.db.sqlite.prepare("UPDATE work_item SET status='READY',row_version=row_version+1 WHERE id=?").run(id);
 const resumed=await buildSourceDiscovery(f.db,f.env,next);assert.equal(resumed.jobStatus,'SUCCEEDED');await f.db.batch(resumed.statements);assert.equal(f.db.sqlite.prepare('SELECT analysis_generation FROM work_item WHERE id=?').get(id).analysis_generation,2);
 }finally{f.close();}});
