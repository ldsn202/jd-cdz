import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDatabase} from './helpers/sqlite-d1.mjs';
import {loadModule} from './helpers/load-app.mjs';
const {readMaterialTexts,confirmMaterialText}=await loadModule('../../src/services/material-text-review.ts');
const {buildParsingCapability,materialParsingTarget,buildMaterialParsingAdoption}=await loadModule('../../src/services/material-parsing.ts');
async function fixture(){
 const db=createDatabase();db.sqlite.exec(readFileSync(new URL('../../db/seeds/dev-identity.sql',import.meta.url),'utf8'));
 const now=Date.now(),hash='a'.repeat(64);
 db.sqlite.exec(`INSERT INTO integration_config VALUES('cfg','provider-dev-b','provider-docs','INSTALLATION','scope',NULL,NULL,1,1,1);
 INSERT INTO work_item(id,service_provider_id,item_kind,business_key,business_identity_json,creation_key,title,status,integration_config_id,assignee_identity_id,blocked_reason,gmt_create,gmt_modified)
 VALUES('item','provider-dev-b','CONFIGURATION','cfg','[1]','cfg','资料','BLOCKED','cfg','ir-dev-provider-clerk','材料文字待核对',1,1);
 INSERT INTO source_material VALUES('sm','LOCAL_UPLOAD','up-test',1,1);`);
 db.sqlite.prepare(`INSERT INTO source_material_version(id,source_material_id,source_version,read_state,name,media_type,byte_length,content_sha256,content_locator,retrieved_at,gmt_create,gmt_modified) VALUES('v','sm','local:up-test','VERIFIED','记录.pdf','application/pdf',3,?,'uploads/a',?,?,?)`).run(hash,now,now,now);
 db.sqlite.prepare(`INSERT INTO background_job(id,purpose,service_provider_id,work_item_id,target_json,dedupe_key,status,lease_epoch,row_version,gmt_create,gmt_modified) VALUES('parse','PARSE_MATERIAL','provider-dev-b','item',?,'parse','BLOCKED',0,1,?,?)`).run(JSON.stringify({uploadId:'up-test',materialVersionId:'v',providerId:'provider-dev-b'}),now,now);
 await buildParsingCapability(db,{jobId:'parse',materialVersionId:'v',sha256:hash,now}).run();
 const target=await materialParsingTarget(db,'parse',{materialVersionId:'v'});
 const result={runId:target.runId,operation:'PARSE_MATERIAL',profileId:target.profileId,implementationVersion:target.implementationVersion,inputSnapshotId:null,analysis:null,parsing:{
 parseId:'original',sourceSystem:'LOCAL_UPLOAD',sourceMaterialId:'up-test',sourceVersion:'local:up-test',contentSha256:hash,completeness:'INCOMPLETE',
 units:[{unitId:'p1',kind:'PDF_PAGE',index:1,name:null,status:'UNREADABLE'}],blocks:[{blockId:'p1:text',unitId:'p1',kind:'TEXT',text:'桥架54米',cellRange:null,formula:null,cachedValue:null}],issues:['待核对']}};
 const a=await buildMaterialParsingAdoption(db,{id:'parse',target_json:JSON.stringify({materialVersionId:'v'})},result);assert.equal(a.ok,true);await db.batch(a.statements);
 const identity={identityId:'ir-dev-provider-clerk',subjectType:'HUMAN',grants:[{scopeType:'SERVICE_PROVIDER',resourceIds:['provider-dev-b'],actions:['CONFIRM_INSTALLATION_DRAFT']}]};
 const row=()=>db.sqlite.prepare("SELECT * FROM work_item WHERE id='item'").get();
 const body={expectedWorkItemVersion:1,expectedResponsibilityVersion:1,materialVersionId:'v',parsingId:'original',acknowledgeTextOnly:true,units:[{unitId:'p1',text:'桥架54米'}]};
 return {db,identity,row,body};
}
test('human text confirmation preserves original parsing and files, records author, and queues no analysis',async()=>{
 const f=await fixture();try{
  const before=f.db.sqlite.prepare('SELECT * FROM source_material_version').get();
  assert.equal((await readMaterialTexts(f.db,'item'))[0].units[0].text,'桥架54米');
  const result=await confirmMaterialText(f.db,f.identity,f.row(),f.body);
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM material_parsing').get().n,2);
  assert.equal(f.db.sqlite.prepare("SELECT completeness FROM material_parsing WHERE id='original'").get().completeness,'INCOMPLETE');
  const saved=f.db.sqlite.prepare('SELECT * FROM material_parsing WHERE id=?').get(result.parsingId);
  assert.equal(saved.profile_id,'human-text-review');assert.equal(saved.completeness,'COMPLETE');
  assert.deepEqual(f.db.sqlite.prepare('SELECT * FROM source_material_version').get(),before);
  assert.equal(f.row().status,'PREPARING');assert.equal(f.row().blocked_reason,null);
  assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM background_job WHERE purpose IN ('ANALYZE_SKILL','READ_SOURCE')").get().n,0);
  await assert.rejects(confirmMaterialText(f.db,f.identity,f.row(),f.body),/事项已变化/);
 }finally{f.db.close();}
});
test('confirmation rejects wrong actor, scope, outdated parse, omitted page and absent acknowledgement',async()=>{
 const f=await fixture();try{
  for(const identity of [{...f.identity,identityId:'ir-dev-jd-review'},{...f.identity,subjectType:'SERVICE'},{...f.identity,grants:[]}])
   await assert.rejects(confirmMaterialText(f.db,identity,f.row(),f.body),/责任人/);
  for(const body of [{...f.body,parsingId:'old'},{...f.body,units:[]},{...f.body,acknowledgeTextOnly:false},{...f.body,units:[{unitId:'p1',text:''}]}])
   await assert.rejects(confirmMaterialText(f.db,f.identity,f.row(),body));
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM material_parsing').get().n,1);
 }finally{f.db.close();}
});
