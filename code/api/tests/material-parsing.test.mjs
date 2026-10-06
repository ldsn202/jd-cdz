import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDatabase } from './helpers/sqlite-d1.mjs';
import { loadModule } from './helpers/load-app.mjs';
const { buildParsingCapability, materialParsingTarget, buildMaterialParsingAdoption } = await loadModule('../../src/services/material-parsing.ts');
const { claimJobs, dispatchStart, reportResult, readAttemptMaterial } = await loadModule('../../src/services/job-dispatch.ts');
const identity = { identityId: 'ir-dev-service', subjectType: 'SERVICE', grants: [{ scopeType: 'SERVICE_PROVIDER', resourceIds: ['provider-dev-a'], actions: ['PREPARE_ANALYSIS'] }] };
const cfg = { leaseMs: 600000, maxAttempts: 1, retryBackoffMs: 0 };
function fixture() {
 const db = createDatabase();
 db.sqlite.exec(readFileSync(new URL('../../db/seeds/dev-identity.sql', import.meta.url), 'utf8'));
 const now = Date.now();
 db.sqlite.prepare("INSERT INTO source_material VALUES ('sm-parse','LOCAL_UPLOAD','up-parse',?,?)").run(now,now);
 db.sqlite.prepare(`INSERT INTO source_material_version(id,source_material_id,source_version,read_state,name,media_type,byte_length,content_sha256,content_locator,retrieved_at,source_updated_at,gmt_create,gmt_modified) VALUES('smv-parse','sm-parse','local:up-parse','VERIFIED','source.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',3,?,'uploads/parse/source.xlsx',?,NULL,?,?)`).run('a'.repeat(64),now,now,now);
 db.sqlite.prepare(`INSERT INTO background_job(id,purpose,service_provider_id,target_json,dedupe_key,status,available_at,lease_epoch,row_version,gmt_create,gmt_modified) VALUES('job-parse','PARSE_MATERIAL','provider-dev-a',?,'parse-unit','READY',?,0,1,?,?)`).run(JSON.stringify({uploadId:'up-parse',materialVersionId:'smv-parse',providerId:'provider-dev-a',fileSha256:'a'.repeat(64)}),now,now,now);
 return db;
}
function result(target, complete = true) {
 const i = target.parseInput;
 return { runId: target.runId, operation: 'PARSE_MATERIAL', profileId: target.profileId, implementationVersion: target.implementationVersion,inputSnapshotId:null,analysis:null,parsing:{parseId:'parse-result',sourceSystem:i.sourceSystem,sourceMaterialId:i.sourceMaterialId,sourceVersion:i.sourceVersion,contentSha256:i.contentSha256,completeness:complete?'COMPLETE':'INCOMPLETE',units:[{unitId:'sheet-1',kind:'SHEET',index:1,name:'安装明细',status:complete?'COMPLETE':'UNREADABLE'}],blocks:[{blockId:'b1',unitId:'sheet-1',kind:'TABLE_CELL',text:'管线',cellRange:'A1',formula:null,cachedValue:null}],issues:complete?[]:['图形内容尚未核实']}};
}
test('parse claim binds exact material bytes and immutable capability before attempt', async () => {
 const db=fixture(); try {
  await buildParsingCapability(db,{jobId:'job-parse',materialVersionId:'smv-parse',sha256:'a'.repeat(64),now:Date.now()}).run();
  const {claims:[claim]}=await claimJobs(db,identity,cfg,{purposes:['PARSE_MATERIAL'],limit:1});
  assert.equal(claim.target.parseInput.sourceVersion,'local:up-parse');
  assert.equal(claim.target.parseInput.contentSha256,'a'.repeat(64));
  assert.equal(db.sqlite.prepare('SELECT capability_call_id FROM execution_attempt WHERE id=?').get(claim.attemptId).capability_call_id,claim.target.runId);
  const material=await readAttemptMaterial(db,identity,claim.attemptId,claim);
  assert.equal(material.content_locator,'uploads/parse/source.xlsx');
  await assert.rejects(readAttemptMaterial(db,identity,claim.attemptId,{...claim,leaseToken:'bad'}),/失去领取权/);
 }finally{db.close();}
});
test('successful claim actually persists validated parsing under production guards', async () => {
 const db=fixture();try{
  const {claims:[claim]}=await claimJobs(db,identity,cfg,{purposes:['PARSE_MATERIAL'],limit:1});
  await dispatchStart(db,identity,claim.attemptId,claim);
  const accepted=await reportResult(db,identity,cfg,claim.attemptId,{...claim,status:'SUCCEEDED',dispatchState:'RESPONSE_RECEIVED',result:result(claim.target)});
  assert.equal(accepted.adopted,true);
  assert.equal(accepted.jobStatus,'SUCCEEDED');
  assert.equal(db.sqlite.prepare('SELECT completeness FROM material_parsing').get().completeness,'COMPLETE');
 }finally{db.close();}
});
test('incomplete OCR is retained as evidence but never marks upload task successful', async () => {
 const db=fixture();try{
  const {claims:[claim]}=await claimJobs(db,identity,cfg,{purposes:['PARSE_MATERIAL'],limit:1});
  const accepted=await reportResult(db,identity,cfg,claim.attemptId,{...claim,status:'SUCCEEDED',dispatchState:'RESPONSE_RECEIVED',result:result(claim.target,false)});
  assert.equal(accepted.jobStatus,'BLOCKED');
  assert.equal(db.sqlite.prepare('SELECT completeness FROM material_parsing').get().completeness,'INCOMPLETE');
 }finally{db.close();}
});
test('wrong source version or false complete parsing is rejected without evidence adoption', async () => {
 const db=fixture();try{
  const target=await materialParsingTarget(db,'job-parse',{materialVersionId:'smv-parse'});
  const wrong=result(target);wrong.parsing.sourceVersion='forged';
  const a=await buildMaterialParsingAdoption(db,{id:'job-parse',target_json:JSON.stringify({materialVersionId:'smv-parse'})},wrong);
  assert.equal(a.ok,false);
  const falseComplete=result(target);falseComplete.parsing.units[0].status='UNREADABLE';
  const b=await buildMaterialParsingAdoption(db,{id:'job-parse',target_json:JSON.stringify({materialVersionId:'smv-parse'})},falseComplete);
  assert.equal(b.ok,false);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM material_parsing').get().n,0);
 }finally{db.close();}
});

test('material byte route rejects expired/foreign leases before reading storage', async () => {
 const db=fixture();try{
  const {default: app}=await loadModule('../../src/index.ts');
  const {claims:[claim]}=await claimJobs(db,identity,cfg,{purposes:['PARSE_MATERIAL'],limit:1});
  let storageReads=0;
  const env={DB:db,DEV_IDENTITY_TOKENS:JSON.stringify({service:'svc-jd-charging'}),FILES:{async get(){storageReads++;return {body:new Blob(['abc']).stream(),size:3};}}};
  const request=lease=>app.request(`http://localhost/api/admin/charging/internal/job-attempts/${claim.attemptId}/material-content`,{method:'POST',headers:{authorization:'Bearer service','content-type':'application/json'},body:JSON.stringify(lease)},env);
  assert.equal((await request({...claim,leaseToken:'wrong'})).status,409);
  assert.equal(storageReads,0);
  assert.equal(await (await request(claim)).text(),'abc');
  assert.equal(storageReads,1);
 }finally{db.close();}
});

test('a parse registration cannot use its job scope to read another provider original', async()=>{
 const db=fixture();try{
  const now=Date.now();
  db.sqlite.prepare(`INSERT INTO background_job(id,purpose,service_provider_id,target_json,dedupe_key,status,available_at,lease_epoch,row_version,gmt_create,gmt_modified) VALUES('wrong-scope','PARSE_MATERIAL','provider-dev-b',?,'wrong-scope','READY',?,0,1,?,?)`).run(JSON.stringify({parseInput:{sourceMaterialVersionId:'smv-parse'}}),now,now,now);
  await assert.rejects(materialParsingTarget(db,'wrong-scope',{parseInput:{sourceMaterialVersionId:'smv-parse'}}),e=>e.code===40301);
 }finally{db.close();}
});


test('revoked provider authorization blocks parsing adoption despite a current lease',async()=>{
 const db=fixture();try{
  const {claims:[claim]}=await claimJobs(db,identity,cfg,{purposes:['PARSE_MATERIAL'],limit:1});
  await assert.rejects(reportResult(db,{...identity,grants:[]},cfg,claim.attemptId,{...claim,status:'SUCCEEDED',result:result(claim.target)}),e=>e.httpStatus===403);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM material_parsing').get().n,0);
 }finally{db.close();}
});
