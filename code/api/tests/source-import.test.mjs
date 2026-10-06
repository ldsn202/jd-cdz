import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from './helpers/sqlite-d1.mjs';
import { loadModule } from './helpers/load-app.mjs';
const { sourceImportScope, startSourceImport, importSourcePage } = await loadModule('../../src/services/source-import.ts');
const identity = { subjectType:'SERVICE', grants:[{scopeType:'SERVICE_PROVIDER',sourceSystem:null,recordType:null,resourceIds:['sp-1'],actions:['READ_SOURCE_CHANGES','PREPARE_ANALYSIS']}] };
let serial = 0;
function fixture() {
 const db=createDatabase(); const calls=[]; const state={version:'v1',name:'管线',provider:'sp-1'};
 const env={EXTERNAL_MODE:'mock',MOCK_BASE_URL:`http://source-import-${++serial}`,MOCK_ACCOUNT_ID:'service'};
 const original=globalThis.fetch;
 globalThis.fetch=async(input,init={})=>{
  const url=new URL(input);calls.push({path:url.pathname,query:url.search,body:init.body});let data;
  if(url.pathname.endsWith('/identity/sessions')) data={token:'session'};
  else if(url.pathname.endsWith('/identity/current-context')) data={subjectType:'SERVICE',identitySource:'identity',subjectId:'external-service',authorizationVersion:'auth-1',verifiedAt:new Date().toISOString(),validUntil:null,grants:[{actions:['READ_SOURCE_CHANGES'],scope:{scopeType:'SERVICE_PROVIDER',sourceSystem:null,recordType:null,resourceIds:['sp-1','sp-ungranted']}}]};
  else if(url.pathname.endsWith('/control/change-feeds')) { const b=JSON.parse(init.body);data={...b,generation:1,startCursor:'cur-1-0',baselineCount:2}; }
  else if(url.pathname.endsWith('/changes')) data={feedId:'feed-1',serviceProviderId:'sp-1',sourceSystem:'installation-admin',cursor:url.searchParams.get('cursor'),nextCursor:'cur-1-2',hasMore:false,sourceCheckedAt:new Date().toISOString(),coverageThrough:null,list:[{changeId:'chg-base-feed-1-0',recordType:'INSTALLATION_WORK_ORDER',sourceRecordId:'wo-1',sourceVersion:state.version,changeType:'UPSERT',relatedWorkOrderIds:['wo-1'],associationComplete:true},{changeId:'chg-base-feed-1-1',recordType:'INSTALLATION_PLAN',sourceRecordId:'plan-1',sourceVersion:'p1',changeType:'UPSERT',relatedWorkOrderIds:['wo-1'],associationComplete:true}]};
  else if(url.pathname.endsWith('/context')) data={retrievedAt:new Date().toISOString(),completeness:'COMPLETE',missingParts:[],installationWorkOrder:{installationWorkOrderId:'wo-1',serviceProviderId:state.provider,sourceSystem:'installation_management',sourceVersion:state.version,purchaseOrderId:null,sourceUpdatedAt:null},installationPlan:{installationPlanId:'plan-1',sourceSystem:'installation_management',sourceVersion:'p1',sourceUpdatedAt:null,items:[{installationItem:state.name}]},installationDetailStatus:'NOT_SUBMITTED',installationDetail:null,sourceMaterialIndexComplete:true,sourceMaterials:[]};
  else throw new Error(`unexpected HTTP path ${url}`);
  return Response.json({code:0,msg:'success',requestId:'source-request',data});
 };
 return {db,env,state,calls,close(){globalThis.fetch=original;db.close();}};
}
const page={serviceProviderId:'sp-1',feedId:'feed-1',cursor:'cur-1-0'};
test('bootstrap requires explicit SERVICE import permission before HTTP or SQL',async()=>{
 const f=fixture();try{
  await assert.rejects(sourceImportScope(f.env,{...identity,subjectType:'HUMAN'}),/SERVICE/);
  await assert.rejects(sourceImportScope(f.env,{...identity,grants:[]}),/READ_SOURCE_CHANGES/);
  assert.equal(f.calls.length,0);
 }finally{f.close();}
});
test('scope intersects external grants and start returns authentic baseline receipt',async()=>{
 const f=fixture();try{
  const scope=await sourceImportScope(f.env,identity);assert.deepEqual(scope.serviceProviderIds,['sp-1']);assert.equal(scope.scopeIsGlobal,false);
  const receipt=await startSourceImport(f.env,identity,{serviceProviderId:'sp-1'});assert.equal(receipt.baselineCount,2);assert.equal(receipt.startCursor,'cur-1-0');
  await assert.rejects(startSourceImport(f.env,identity,{serviceProviderId:'sp-ungranted'}),/范围/);
 }finally{f.close();}
});
test('page imports only HTTP context and retains discovery evidence; replay is idempotent',async()=>{
 const f=fixture();try{
  const r=await importSourcePage(f.db,f.env,identity,page);assert.equal(r.importedCount,1);assert.equal(r.failedCount,0);assert.equal(r.changeCount,2);
  const p=f.db.sqlite.prepare('SELECT * FROM service_provider').get();assert.equal(p.source_state,'UNKNOWN');assert.equal(p.display_name,null);assert.equal(p.source_version,null);
  const c=f.db.sqlite.prepare('SELECT * FROM installation_context_snapshot').get();assert.equal(JSON.parse(c.context_json)._sourceImport.changeId,'chg-base-feed-1-0');
  const replay=await importSourcePage(f.db,f.env,identity,page);assert.equal(replay.unchangedCount,1);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM installation_context_snapshot').get().n,1);
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM work_item').get().n,0);
  assert.ok(f.calls.some(c=>c.query.includes('pageSize=10')));
 }finally{f.close();}
});
test('new source version and changed same-version content never overwrite history',async()=>{
 const f=fixture();try{
  await importSourcePage(f.db,f.env,identity,page);f.state.version='v2';
  const newer=await importSourcePage(f.db,f.env,identity,page);assert.equal(newer.failedCount,1);assert.match(newer.results[0].message,/版本/);
  f.state.version='v1';f.state.name='changed';const changed=await importSourcePage(f.db,f.env,identity,page);assert.equal(changed.failedCount,1);
  assert.equal(f.db.sqlite.prepare('SELECT source_version FROM installation_work_order').get().source_version,'v1');assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM installation_context_snapshot').get().n,1);
 }finally{f.close();}
});
test('foreign provider and same number from another source cannot be merged',async()=>{
 const f=fixture();try{
  f.state.provider='sp-other';let r=await importSourcePage(f.db,f.env,identity,page);assert.equal(r.failedCount,1);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM service_provider').get().n,0);
  f.state.provider='sp-1';const now=Date.now();f.db.sqlite.prepare('INSERT INTO installation_work_order(id,source_system,source_id,gmt_create,gmt_modified) VALUES(?,?,?,?,?)').run('wo-1','other-system','wo-1',now,now);
  r=await importSourcePage(f.db,f.env,identity,page);assert.equal(r.failedCount,1);assert.match(r.results[0].message,/来源/);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM installation_context_snapshot').get().n,0);
 }finally{f.close();}
});

test('route returns contract failure for HUMAN and does not reach source',async()=>{
 const f=fixture();try{
  const {Hono}=await import('hono');
  const {default:routes}=await loadModule('../../src/routes/source-import.ts');
  const app=new Hono();app.use('*',async(c,next)=>{c.set('identity',{...identity,subjectType:'HUMAN'});await next();});app.route('/api/admin/charging',routes);
  const response=await app.request('/api/admin/charging/internal/source-import/scope',{},f.env);
  assert.equal(response.status,403);const body=await response.json();assert.equal(body.code,40301);assert.equal(body.data,null);assert.equal(f.calls.length,0);
 }finally{f.close();}
});
test('concurrent import repeats cannot create more than one immutable context',async()=>{
 const f=fixture();try{
  const now=Date.now();
  f.db.sqlite.prepare('INSERT INTO service_provider(id,source_system,source_id,gmt_create,gmt_modified) VALUES(?,?,?,?,?)').run('sp-1','installation_management','sp-1',now,now);
  f.db.sqlite.prepare('INSERT INTO installation_work_order(id,source_system,source_id,current_service_provider_id,source_version,gmt_create,gmt_modified) VALUES(?,?,?,?,?,?,?)').run('wo-1','installation_management','wo-1','sp-1','v1',now,now);
  f.db.sqlite.prepare('INSERT INTO installation_plan(id,installation_work_order_id,source_system,source_id,gmt_create,gmt_modified) VALUES(?,?,?,?,?,?)').run('plan-local','wo-1','installation_management','plan-1',now,now);
  const batch=f.db.batch.bind(f.db);let queue=Promise.resolve();f.db.batch=statements=>{const result=queue.then(()=>batch(statements));queue=result.catch(()=>{});return result;};
  const runs=await Promise.all([importSourcePage(f.db,f.env,identity,page),importSourcePage(f.db,f.env,identity,page)]);
  assert.deepEqual(runs.map(r=>r.results[0].status).sort(),['IMPORTED','UNCHANGED'],JSON.stringify(runs));
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM installation_context_snapshot').get().n,1);
 }finally{f.close();}
});

test('bootstrap permission set is accepted by production identity schema',async()=>{
 const db=createDatabase();try{
  const now=Date.now();
  db.sqlite.prepare("INSERT INTO identity_reference VALUES ('svc','test','svc','SERVICE','执行程序',?,?)").run(now,now);
  db.sqlite.prepare("INSERT INTO business_permission VALUES ('perm','ctx','grant',NULL,?,'SERVICE_PROVIDER',NULL,NULL,'[\"sp-1\"]',?,?)").run(JSON.stringify(identity.grants[0].actions),now,now);
  db.sqlite.prepare("INSERT INTO current_identity VALUES ('ctx','svc','SERVICE',?,NULL,'v1','[]',1,'ctx-request',?,?)").run(now,now,now);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM current_identity').get().n,1);
 }finally{db.close();}
});


test('concurrent first imports converge without duplicate records or failed receipt',async()=>{
 const f=fixture();try{
  const batch=f.db.batch.bind(f.db);let queue=Promise.resolve();f.db.batch=statements=>{const result=queue.then(()=>batch(statements));queue=result.catch(()=>{});return result;};
  const runs=await Promise.all([importSourcePage(f.db,f.env,identity,page),importSourcePage(f.db,f.env,identity,page)]);
  assert.deepEqual(runs.map(r=>r.results[0].status).sort(),['IMPORTED','UNCHANGED'],JSON.stringify(runs));
  for(const table of ['service_provider','installation_work_order','installation_plan','installation_context_snapshot']) assert.equal(f.db.sqlite.prepare(`SELECT count(*) n FROM ${table}`).get().n,1);
 }finally{f.close();}
});

test('monitor source authorization never widens installation-only grants',async()=>{const f=fixture();try{
 const narrow={...identity,grants:identity.grants.map(g=>({...g,sourceSystem:'installation-admin'}))};
 await assert.rejects(sourceImportScope(f.env,narrow,'provider-docs'),/权限/);
 await assert.rejects(sourceImportScope(f.env,identity,'unknown-source'),/不支持/);
 const receipt=await startSourceImport(f.env,identity,{serviceProviderId:'sp-1',sourceSystem:'provider-docs'});assert.equal(receipt.sourceSystem,'provider-docs');assert.equal(JSON.parse(f.calls.at(-1).body).sourceSystem,'provider-docs');
 }finally{f.close();}});
