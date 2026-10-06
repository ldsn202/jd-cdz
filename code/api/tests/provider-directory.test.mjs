import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from './helpers/sqlite-d1.mjs';
import { loadModule } from './helpers/load-app.mjs';
const { syncProviderDirectory } = await loadModule('../../src/services/provider-directory.ts');
let serial=0;
function fixture() {
  const db=createDatabase(), calls=[];
  const identity={subjectType:'SERVICE',grants:[{scopeType:'SERVICE_PROVIDER',sourceSystem:null,recordType:null,resourceIds:['SP-001','SP-051'],actions:['READ_SOURCE_CHANGES','PREPARE_ANALYSIS']}]};
  const data=Array.from({length:51},(_,i)=>({serviceProviderId:'SP-'+String(i+1).padStart(3,'0'),displayName:'公司'+(i+1),sourceVersion:'provider-1',sourceSystem:'installation_management'}));
  const env={EXTERNAL_MODE:'mock',MOCK_BASE_URL:'http://provider-directory-'+(++serial),MOCK_ACCOUNT_ID:'service'};
  const original=globalThis.fetch;
  globalThis.fetch=async(input)=>{
    const url=new URL(input);calls.push(url.pathname+url.search);let result;
    if(url.pathname.endsWith('/identity/sessions')) result={token:'session'};
    else if(url.pathname.endsWith('/identity/current-context')) result={subjectType:'SERVICE',grants:[{actions:['READ_SOURCE_CHANGES'],scope:{scopeType:'SERVICE_PROVIDER',sourceSystem:null,recordType:null,resourceIds:data.map(p=>p.serviceProviderId)}}]};
    else if(url.pathname.endsWith('/installation/service-providers')) {
      const page=Number(url.searchParams.get('page'));
      result={page,pageSize:50,total:data.length,list:data.slice((page-1)*50,page*50),retrievedAt:new Date().toISOString()};
    } else throw Error('unexpected '+url.pathname);
    return Response.json({code:0,msg:'success',requestId:'directory-read',data:result});
  };
  return {db,identity,env,calls,data,close(){globalThis.fetch=original;db.close();}};
}

test('directory reads all pages, intersects permissions, repairs empty names and replays without writes',async()=>{
 const f=fixture();try {
   const now=Date.now();
   f.db.sqlite.prepare("INSERT INTO service_provider(id,source_system,source_id,gmt_create,gmt_modified) VALUES('SP-001','installation_management','SP-001',?,?)").run(now,now);
   f.db.sqlite.prepare("INSERT INTO installation_work_order(id,source_system,source_id,current_service_provider_id,gmt_create,gmt_modified) VALUES('WO-1','installation_management','WO-1','SP-001',?,?)").run(now,now);
   const before=f.db.sqlite.prepare('SELECT * FROM installation_work_order').all();
   const result=await syncProviderDirectory(f.db,f.env,f.identity);
   assert.equal(result.providerCount,2);assert.equal(result.changedCount,2);
   assert.deepEqual(f.db.sqlite.prepare('SELECT id,display_name FROM service_provider ORDER BY id').all().map(r=>[r.id,r.display_name]),[['SP-001','公司1'],['SP-051','公司51']]);
   assert.ok(f.calls.some(p=>p.includes('page=2')));
   assert.equal((await syncProviderDirectory(f.db,f.env,f.identity)).changedCount,0);
   assert.deepEqual(f.db.sqlite.prepare('SELECT * FROM installation_work_order').all(),before);
   f.data[0].displayName='公司新名称';f.data[0].sourceVersion='provider-2';
   assert.equal((await syncProviderDirectory(f.db,f.env,f.identity)).changedCount,1);
 }finally{f.close();}
});

test('directory refuses invalid metadata and source identity conflicts before changing data',async()=>{
 for(const scenario of ['empty-name','wrong-source','collision']){
  const f=fixture();try{
   if(scenario==='empty-name')f.data[0].displayName='';
   if(scenario==='wrong-source')f.data[0].sourceSystem='other-source';
   if(scenario==='collision')f.db.sqlite.prepare("INSERT INTO service_provider(id,source_system,source_id,gmt_create,gmt_modified) VALUES('SP-001','other','SP-001',1,1)").run();
   await assert.rejects(syncProviderDirectory(f.db,f.env,f.identity),/无效|冲突/);
   assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM service_provider WHERE display_name IS NOT NULL').get().n,0);
  }finally{f.close();}
 }
});

test('human callers cannot synchronize provider metadata',async()=>{
 const f=fixture();try{
  await assert.rejects(syncProviderDirectory(f.db,f.env,{...f.identity,subjectType:'HUMAN'}),/SERVICE/);
  assert.equal(f.calls.length,0);
 }finally{f.close();}
});
