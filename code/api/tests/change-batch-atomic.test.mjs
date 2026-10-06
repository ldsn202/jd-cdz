import test from 'node:test';import assert from 'node:assert/strict';import {createDatabase} from './helpers/sqlite-d1.mjs';import {loadModule} from './helpers/load-app.mjs';
const {receiveChangeBatch}=await loadModule('../../src/services/change-batch.ts');
test('cursor CAS conflict rolls back change facts, jobs and batch',async()=>{
 const db=createDatabase(),now=Date.now();try{
 db.sqlite.prepare("INSERT INTO change_feed VALUES('feed','sp','installation-admin',?,?)").run(now,now);
 db.sqlite.prepare("INSERT INTO change_feed_generation VALUES('gen','feed',1,'{}','0','0','READY',NULL,NULL,1,?,?)").run(now,now);
 const identity={subjectType:'SERVICE',grants:[{scopeType:'SERVICE_PROVIDER',resourceIds:['sp'],actions:['READ_SOURCE_CHANGES']}]};
 const original=db.batch.bind(db);db.batch=async statements=>{db.sqlite.prepare("UPDATE change_feed_generation SET row_version=row_version+1 WHERE id='gen'").run();return original(statements);};
 await assert.rejects(receiveChangeBatch(db,identity,{feedId:'feed',generationId:'gen',expectedCursor:'0',response:{cursor:'0',nextCursor:'1',hasMore:false,list:[{changeId:'change',recordType:'INSTALLATION_WORK_ORDER',sourceRecordId:'wo',sourceVersion:'v1',changeType:'UPSERT',sourceUpdatedAt:null,relatedWorkOrderIds:['wo'],associationComplete:true}]}}));
 for(const table of ['source_change','background_job','change_batch','job_change_trigger'])assert.equal(db.sqlite.prepare(`SELECT count(*) n FROM ${table}`).get().n,0);
 }finally{db.close();}
});

test('source-restricted grant cannot ingest another source or mixed record types',async()=>{const db=createDatabase(),now=Date.now();try{
 db.sqlite.prepare("INSERT INTO change_feed VALUES('feed','sp','provider-docs',?,?)").run(now,now);
 const body={feedId:'feed',generationId:'gen',expectedCursor:'0',response:{cursor:'0',nextCursor:'1',hasMore:false,list:[{changeId:'c',recordType:'PROVIDER_RECORD',sourceRecordId:'doc',sourceVersion:'v1',changeType:'UPSERT',relatedWorkOrderIds:[],associationComplete:true}]}};
 for(const extra of [{sourceSystem:'installation-admin'},{sourceSystem:'provider-docs',recordType:'JD_BILL'}])await assert.rejects(receiveChangeBatch(db,{subjectType:'SERVICE',grants:[{scopeType:'SERVICE_PROVIDER',resourceIds:['sp'],actions:['READ_SOURCE_CHANGES'],...extra}]},body),/不可见/);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM source_change').get().n,0);
 }finally{db.close();}});
