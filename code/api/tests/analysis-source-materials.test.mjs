import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createDatabase} from './helpers/sqlite-d1.mjs';
import {loadModule} from './helpers/load-app.mjs';
const {stageSourceMaterials}=await loadModule('../../src/services/analysis-source-materials.ts');
const {materialParsingTarget,buildMaterialParsingAdoption}=await loadModule('../../src/services/material-parsing.ts');
const identity={id:'item',service_provider_id:'provider-dev-b',analysis_generation:1};
function fixture(){
 const db=createDatabase();db.sqlite.exec(readFileSync(new URL('../../db/seeds/dev-identity.sql',import.meta.url),'utf8'));const now=Date.now();
 db.sqlite.prepare(`INSERT INTO integration_config VALUES('cfg','provider-dev-b','provider','INSTALLATION','scope',NULL,NULL,1,?,?)`).run(now,now);
 db.sqlite.prepare(`INSERT INTO work_item(id,service_provider_id,item_kind,business_key,business_identity_json,creation_key,title,status,integration_config_id,gmt_create,gmt_modified) VALUES('item','provider-dev-b','CONFIGURATION','key','["config"]','created','配置','PREPARING','cfg',?,?)`).run(now,now);
 const bytes=Buffer.from('actual file bytes'),sha=createHash('sha256').update(bytes).digest('hex'),stored=[];
 const ref={sourceSystem:'provider',sourceMaterialId:'format-doc',sourceVersion:'v1'};
 const data={...ref,name:'format.xlsx',mediaType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',sourceUpdatedAt:null,retrievedAt:new Date().toISOString(),byteLength:bytes.length,contentSha256:sha,contentBase64:bytes.toString('base64')};
 const env={FILES:{async put(key,value){stored.push({key,bytes:Buffer.from(value)});}},EXTERNAL_MODE:'mock',MOCK_BASE_URL:'http://material-prepare',MOCK_ACCOUNT_ID:'service'};
 const original=globalThis.fetch;globalThis.fetch=async url=>Response.json({code:0,data:String(url).endsWith('/sessions')?{token:'session'}:data});
 return {db,env,ref,data,bytes,stored,close(){globalThis.fetch=original;db.close();}};
}
test('source HTTP bytes are verified and staged as a real scoped parse job before any analysis snapshot',async()=>{
 const f=fixture();try{const staged=await stageSourceMaterials(f.db,f.env,identity,[f.ref]);assert.equal(staged.pending,true);await f.db.batch(staged.statements);assert.deepEqual(f.stored[0].bytes,f.bytes);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM analysis_input_snapshot').get().n,0);const job=f.db.sqlite.prepare('SELECT * FROM background_job').get();const target=await materialParsingTarget(f.db,job.id,JSON.parse(job.target_json));assert.equal(target.parseInput.contentSha256,f.data.contentSha256);assert.equal(target.parseInput.sourceVersion,'v1');
 const again=await stageSourceMaterials(f.db,f.env,identity,[f.ref]);assert.equal(again.pending,true);assert.equal(again.statements.length,0);
 }finally{f.close();}
});
test('mismatched bytes or source version cannot be registered as verified',async()=>{
 for(const field of ['contentSha256','sourceVersion']){const f=fixture();try{f.data[field]=field==='contentSha256'?'b'.repeat(64):'v2';await assert.rejects(stageSourceMaterials(f.db,f.env,identity,[f.ref]),/摘要|来源/);assert.equal(f.stored.length,0);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM source_material_version').get().n,0);}finally{f.close();}}
});
test('actual parsing adoption schedules scoped preparation, including truthful incomplete parsing',async()=>{
 const f=fixture();try{const staged=await stageSourceMaterials(f.db,f.env,identity,[f.ref]);await f.db.batch(staged.statements);const job=f.db.sqlite.prepare('SELECT * FROM background_job').get(),target=await materialParsingTarget(f.db,job.id,JSON.parse(job.target_json));
 const result={runId:target.runId,operation:'PARSE_MATERIAL',profileId:target.profileId,implementationVersion:target.implementationVersion,inputSnapshotId:null,analysis:null,parsing:{parseId:'real-parse',sourceSystem:'provider',sourceMaterialId:'format-doc',sourceVersion:'v1',contentSha256:f.data.contentSha256,completeness:'INCOMPLETE',units:[{unitId:'sheet',kind:'SHEET',index:1,name:'内容',status:'UNREADABLE'}],blocks:[],issues:['文件无有效工作簿']}};
 const a=await buildMaterialParsingAdoption(f.db,job,result);assert.equal(a.ok,true);assert.equal(a.jobStatus,'BLOCKED');await f.db.batch(a.statements);const next=f.db.sqlite.prepare("SELECT * FROM background_job WHERE purpose='READ_SOURCE'").get();assert.ok(next);assert.equal(JSON.parse(next.target_json).analysisGeneration,1);assert.equal(next.service_provider_id,'provider-dev-b');const after=await stageSourceMaterials(f.db,f.env,identity,[f.ref]);assert.equal(after.pending,false);
 }finally{f.close();}
});
test('duplicate references create one parse job; oversize declaration and invalid time never write bytes',async()=>{
 const f=fixture();try{const staged=await stageSourceMaterials(f.db,f.env,identity,[f.ref,{...f.ref}]);await f.db.batch(staged.statements);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM background_job').get().n,1);}finally{f.close();}
 for(const change of [{byteLength:10*1024*1024+1},{sourceUpdatedAt:'not-time'}]){const f=fixture();try{Object.assign(f.data,change);await assert.rejects(stageSourceMaterials(f.db,f.env,identity,[f.ref]),/大小|时间/);assert.equal(f.stored.length,0);}finally{f.close();}}
});
test('a fixed parsed-material input grants only its own provider visibility, including shared reused parsing',async()=>{
 const f=fixture();try{
  const staged=await stageSourceMaterials(f.db,f.env,identity,[f.ref]);await f.db.batch(staged.statements);const job=f.db.sqlite.prepare('SELECT * FROM background_job').get(),target=await materialParsingTarget(f.db,job.id,JSON.parse(job.target_json)),now=Date.now();
  const p={parseId:'shared',sourceSystem:'provider',sourceMaterialId:'format-doc',sourceVersion:'v1',contentSha256:f.data.contentSha256,completeness:'INCOMPLETE',units:[{unitId:'u',kind:'SHEET',index:1,name:'sheet',status:'UNREADABLE'}],blocks:[],issues:['无法完整解析']};const adopted=await buildMaterialParsingAdoption(f.db,job,{runId:target.runId,operation:'PARSE_MATERIAL',profileId:target.profileId,implementationVersion:target.implementationVersion,inputSnapshotId:null,analysis:null,parsing:p});await f.db.batch(adopted.statements);
  f.db.sqlite.prepare(`INSERT INTO integration_config VALUES('cfg-a','provider-dev-a','provider','INSTALLATION','scope',NULL,NULL,1,?,?)`).run(now,now);f.db.sqlite.prepare(`INSERT INTO work_item(id,service_provider_id,item_kind,business_key,business_identity_json,creation_key,title,status,integration_config_id,gmt_create,gmt_modified) VALUES('item-a','provider-dev-a','CONFIGURATION','a','["a"]','a','资料','PREPARING','cfg-a',?,?)`).run(now,now);
  f.db.sqlite.prepare(`INSERT INTO analysis_input_item VALUES('shared-input','shared-snapshot','shared','PARSED_MATERIAL',NULL,NULL,NULL,NULL,NULL,'shared',?,?,?)`).run(now,now,now);f.db.sqlite.prepare(`INSERT INTO analysis_input_snapshot VALUES('shared-snapshot',1,'item-a','provider-dev-a',1,'INTEGRATION_CONFIGURATION','1.0.0','1.0.0','[]','INCOMPLETE','["缺少资料"]',1,?,?,?)`).run('a'.repeat(64),now,now);
  const {loadMaterialVersion,materialVisible}=await loadModule('../../src/services/material-read.ts');const version=await loadMaterialVersion(f.db,target.materialVersionId);assert.equal(await materialVisible(f.db,{grants:[{scopeType:'SERVICE_PROVIDER',actions:['READ_SOURCE_MATERIAL'],resourceIds:['provider-dev-a']}]},version),true);assert.equal(await materialVisible(f.db,{grants:[]},version),false);
 }finally{f.close();}
});
