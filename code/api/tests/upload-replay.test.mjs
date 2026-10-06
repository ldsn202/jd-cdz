import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDatabase} from './helpers/sqlite-d1.mjs';
import {loadModule} from './helpers/load-app.mjs';
const {acceptUpload}=await loadModule('../../src/services/upload-store.ts');
function fixture(){
 const db=createDatabase();
 for(const file of ['dev-identity','dev-work-items'])db.sqlite.exec(readFileSync(new URL(`../../db/seeds/${file}.sql`,import.meta.url),'utf8'));
 const item=db.sqlite.prepare("SELECT * FROM work_item WHERE item_kind='INSTALLATION_REVIEW' AND status='READY' LIMIT 1").get();
 // Engineering state fixture only; no external-success claim is made by this test.
 db.sqlite.prepare("UPDATE work_item SET status='WAITING_SUPPLEMENT',active_supplement_request_id='request-test',row_version=row_version+1,gmt_modified=? WHERE id=?").run(Date.now(),item.id);
 return {db,item:db.sqlite.prepare('SELECT * FROM work_item WHERE id=?').get(item.id)};
}
const files={async put(){}};
const identity={identityId:'ir-dev-jd-review'};
function input(item){return {file:new File(['bytes-to-store'],'reply.pdf',{type:'application/pdf'}),providerId:item.service_provider_id,purpose:'INSTALLATION_MATERIAL',workItemId:item.id,expectedWorkItemVersion:item.row_version};}
test('uploading a supplement attachment preserves the active request and its reply state',async()=>{
 const {db,item}=fixture();try{
  await acceptUpload(db,files,identity,'supplement-file',input(item));
  const after=db.sqlite.prepare('SELECT * FROM work_item WHERE id=?').get(item.id);
  assert.equal(after.status,'WAITING_SUPPLEMENT');
  assert.equal(after.analysis_generation,item.analysis_generation);
  assert.equal(after.active_supplement_request_id,'request-test');
 }finally{db.close();}
});
test('same upload key cannot attach identical bytes to a different purpose',async()=>{
 const {db,item}=fixture();try{
  const body=input(item);await acceptUpload(db,files,identity,'same-key',body);
  await assert.rejects(acceptUpload(db,files,identity,'same-key',{...body,purpose:'RECEIVABLE_MATERIAL'}),e=>e.code===40902);
 }finally{db.close();}
});
