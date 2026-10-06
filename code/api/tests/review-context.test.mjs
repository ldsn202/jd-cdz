import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDatabase} from './helpers/sqlite-d1.mjs';
import {loadModule} from './helpers/load-app.mjs';
const {loadReviewContext}=await loadModule('../../src/services/review-decision.ts');
function fixture(){
 const db=createDatabase(),now=Date.now();db.sqlite.exec(readFileSync(new URL('../../db/seeds/dev-identity.sql',import.meta.url),'utf8'));
 db.sqlite.prepare(`INSERT INTO installation_work_order VALUES('wo','installation_management','WO-0856','provider-dev-b','w1','ACTIVE',NULL,?,?,?)`).run(now,now,now);
 db.sqlite.prepare(`INSERT INTO installation_detail VALUES('local-detail','wo','installation_management','DTL-0856',?,?)`).run(now,now);
 const context=(id,detail='local-detail',version='d1',offset=0)=>db.sqlite.prepare(`INSERT INTO installation_context_snapshot VALUES(?,'wo','provider-dev-b','w1',NULL,NULL,?,?,'UNKNOWN','INCOMPLETE','["plan"]','{}',?,?,?)`).run(id,detail,version,now+offset,now+offset,now+offset);
 const bind=id=>db.sqlite.prepare('UPDATE installation_work_order SET context_snapshot_id=? WHERE id=?').run(id,'wo');
 const receipt=(id,detail)=>{
  db.sqlite.prepare(`INSERT INTO work_item(id,service_provider_id,installation_work_order_id,item_kind,business_key,business_identity_json,creation_key,title,status,assignee_identity_id,gmt_create,gmt_modified) VALUES(?,'provider-dev-b','wo','INSTALLATION_PREPARATION',?,'["receipt"]',?,'安装','READY','ir-dev-provider-clerk',?,?)`).run(id,id,id,now,now);
  db.sqlite.prepare(`INSERT INTO human_decision(id,work_item_id,service_provider_id,origin,action_type,request_key,actor_identity_id,identity_context_id,matched_grants_json,expected_work_item_version,expected_responsibility_version,confirmed_at,content_json,gmt_create,gmt_modified) VALUES(?,?,'provider-dev-b','LOCAL','SUBMIT_INSTALLATION',?,'ir-dev-provider-clerk','ci-dev-provider-clerk','["g-clerk-b"]',1,1,?,'{}',?,?)`).run('hd-'+id,id,id,now,now,now);
  db.sqlite.prepare(`INSERT INTO external_write_operation VALUES(?,?,?,'provider-dev-b','wo','installation_management','INSTALLATION_SUBMIT','SUBMIT_INSTALLATION','{}',?,'REGISTERED',NULL,NULL,1,?,?)`).run('op-'+id,'hd-'+id,id,'a'.repeat(64),now,now);
  db.sqlite.prepare(`UPDATE external_write_operation SET status='SUCCEEDED',receipt_json=?,verified_at=?,row_version=2,gmt_modified=? WHERE id=?`).run(JSON.stringify({installationDetail:detail}),now,now,'op-'+id);
 };
 return {db,context,bind,receipt};
}
test('review writes source detail identity and matching version from bound context, ignoring newer unbound snapshot',async()=>{
 const f=fixture();try{f.context('bound');f.context('newer','local-detail','d2',10);f.bind('bound');assert.deepEqual(await loadReviewContext(f.db,'wo'),{sourceWorkOrderVersion:'w1',installationDetailId:'DTL-0856',sourceDetailVersion:'d1'});}finally{f.db.close();}
});
test('review never chooses an arbitrary context when work order has no binding',async()=>{
 const f=fixture();try{f.context('unbound');assert.equal(await loadReviewContext(f.db,'wo'),null);}finally{f.db.close();}
});
test('receipt fallback retains source identity and version as one verified pair',async()=>{
 const f=fixture();try{f.context('bound',null,null);f.bind('bound');f.receipt('receipt',{sourceSystem:'installation_management',installationDetailId:'DTL-0856',sourceVersion:'d-receipt'});assert.deepEqual(await loadReviewContext(f.db,'wo'),{sourceWorkOrderVersion:'w1',installationDetailId:'DTL-0856',sourceDetailVersion:'d-receipt'});}finally{f.db.close();}
});
test('receipt missing source id or version cannot supply a partial pair or local id fallback',async()=>{
 for(const detail of [{sourceSystem:'installation_management',sourceVersion:'d1'},{sourceSystem:'installation_management',installationDetailId:'DTL-0856'},{sourceSystem:'another-system',installationDetailId:'DTL-0856',sourceVersion:'d1'}]){
 const f=fixture();try{f.context('bound',null,null);f.bind('bound');f.receipt('receipt',detail);const result=await loadReviewContext(f.db,'wo');assert.ok(!result || (!result.installationDetailId && !result.sourceDetailVersion));}finally{f.db.close();}}
});
test('bound detail without a version cannot borrow a different receipt version',async()=>{
 const f=fixture();try{f.context('bound','local-detail',null);f.bind('bound');f.receipt('receipt',{sourceSystem:'installation_management',installationDetailId:'DTL-OTHER',sourceVersion:'d9'});const result=await loadReviewContext(f.db,'wo');assert.ok(!result || (!result.installationDetailId && !result.sourceDetailVersion));}finally{f.db.close();}
});
