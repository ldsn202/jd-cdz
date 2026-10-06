import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from './helpers/sqlite-d1.mjs';
import {loadModule} from './helpers/load-app.mjs';
const {resolveIdentity}=await loadModule('../../src/services/identity.ts');
const {resolveResponsibility}=await loadModule('../../src/services/responsibility.ts');
function fixture(){
 const db=createDatabase(),now=Date.now();
 db.sqlite.prepare("INSERT INTO identity_reference VALUES('person','local','tester','HUMAN','核查人',?,?)").run(now-10000,now-10000);
 function context(id,time,until,grant){
  if(grant)db.sqlite.prepare("INSERT INTO business_permission VALUES(?,?,'grant','INSTALLATION_REVIEWER','[\"DECIDE_INSTALLATION_REVIEW\"]','SERVICE_PROVIDER',NULL,NULL,'[\"sp\"]',?,?)").run('p-'+id,id,time,time);
  db.sqlite.prepare("INSERT INTO current_identity VALUES(?,'person','HUMAN',?,?,'v','[]',?,?,?,?)").run(id,time,until,grant?1:0,id,time,time);
 }
 return {db,now,context};
}
test('expired newest authorization cannot fall back to an older valid grant',async()=>{
 const f=fixture();try{
  f.context('old',f.now-5000,null,true);f.context('new',f.now-2000,f.now-1000,true);
  assert.equal(await resolveIdentity(f.db,{DEV_IDENTITY_TOKENS:'{"test":"tester"}'},'Bearer test'),null);
  assert.equal(await resolveResponsibility(f.db,'sp','DECIDE_INSTALLATION_REVIEW'),null);
 }finally{f.db.close();}
});
test('newest revoked authorization cannot assign a responsibility using history',async()=>{
 const f=fixture();try{
  f.context('old',f.now-5000,null,true);f.context('new',f.now-1000,null,false);
  assert.deepEqual((await resolveIdentity(f.db,{DEV_IDENTITY_TOKENS:'{"test":"tester"}'},'Bearer test')).grants,[]);
  assert.equal(await resolveResponsibility(f.db,'sp','DECIDE_INSTALLATION_REVIEW'),null);
 }finally{f.db.close();}
});
test('valid latest scoped human can be assigned',async()=>{
 const f=fixture();try{
  f.context('current',f.now-1000,f.now+60000,true);
  assert.equal(await resolveResponsibility(f.db,'sp','DECIDE_INSTALLATION_REVIEW'),'person');
  assert.equal(await resolveResponsibility(f.db,'other','DECIDE_INSTALLATION_REVIEW'),null);
 }finally{f.db.close();}
});
