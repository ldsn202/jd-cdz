import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDatabase} from './helpers/sqlite-d1.mjs';
import {loadModule} from './helpers/load-app.mjs';
const {buildAnalysisAdoption}=await loadModule('../../src/services/analysis-pipeline.ts');
function fixture(){
 const db=createDatabase();
 db.sqlite.exec(readFileSync(new URL('../../../docs/06-testcase/install/sql/TC-INS-SEED.sql',import.meta.url),'utf8'));
 const item='wi-tc-ins-prep-1',now=Date.now();
 db.sqlite.prepare(`INSERT INTO analysis_input_snapshot VALUES ('snapshot-late',1,?,'sp-tc-ins-anjia',5,'INSTALLATION_EXTRACTION','1.0.0','1.0.0','[]','INCOMPLETE','["missing"]',0,?,?,?)`).run(item,'a'.repeat(64),now,now);
 const target={runId:'run-late',snapshotId:'snapshot-late',workItemId:item,profileId:'test-profile',implementationVersion:'test-1'};
 db.sqlite.prepare(`INSERT INTO background_job(id,purpose,service_provider_id,work_item_id,target_json,dedupe_key,status,lease_epoch,row_version,gmt_create,gmt_modified)
 VALUES ('job-late','ANALYZE_SKILL','sp-tc-ins-anjia',?,?,'late','READY',0,1,?,?)`).run(item,JSON.stringify(target),now,now);
 db.sqlite.prepare(`INSERT INTO capability_call VALUES ('run-late','job-late','ANALYZE_SKILL',NULL,'snapshot-late','test-profile','test-1','{}',?,?,?)`).run('a'.repeat(64),now,now);
 return {db,job:{id:'job-late',work_item_id:item,target_json:JSON.stringify(target)},result:{skill:'INSTALLATION_EXTRACTION',skillVersion:'1.0.0',outputSchemaVersion:'1.0.0',inputSnapshotId:'snapshot-late',status:'NEEDS_INFORMATION',summary:'缺少资料',findings:[],openQuestions:['缺少工单与材料']}};
}
test('old generation result remains history and cannot overwrite current item',async()=>{
 const {db,job,result}=fixture();try{
 db.sqlite.prepare('UPDATE work_item SET current_analysis_result_id=NULL,analysis_generation=analysis_generation+1,row_version=row_version+1,gmt_modified=? WHERE id=?').run(Date.now(),job.work_item_id);
 const adoption=await buildAnalysisAdoption(db,job,result);assert.equal(adoption.ok,true);
 await db.batch(adoption.statements);
 assert.equal(db.sqlite.prepare("SELECT count(*) n FROM analysis_result WHERE run_id='run-late'").get().n,1);
 assert.equal(db.sqlite.prepare('SELECT current_analysis_result_id FROM work_item WHERE id=?').get(job.work_item_id).current_analysis_result_id,null);
 }finally{db.close();}
});
test('analysis for another skill or snapshot is rejected before persistence',async()=>{
 const {db,job,result}=fixture();try{
 const adoption=await buildAnalysisAdoption(db,job,{...result,skill:'INSTALLATION_EVIDENCE',inputSnapshotId:'wrong-snapshot'});
 assert.equal(adoption.ok,false);assert.equal(adoption.errorCode,'ANALYSIS_RESULT_INVALID');
 }finally{db.close();}
});
