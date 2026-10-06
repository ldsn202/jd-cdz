import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runSourceImport} from './source-import.mjs';
async function scenario({fail=false,wrongCount=false}={}) {
 const dir=await mkdtemp(join(tmpdir(),'source-import-'));const calls=[];
 const fetchImpl=async(url,init={})=>{
  calls.push({url,init});let data;
  if(url.endsWith('/scope'))data={serviceProviderIds:['sp-1'],scopeIsGlobal:false};
  else if(url.endsWith('/feeds'))data={feedId:'feed-1',serviceProviderId:'sp-1',startCursor:'cur-1-0',baselineCount:wrongCount?3:2};
  else {const body=JSON.parse(init.body);const first=body.cursor==='cur-1-0';const n=first?1:2;
   data={cursor:body.cursor,nextCursor:`cur-1-${n}`,hasMore:first,changeCount:1,changeIds:[`chg-base-feed-1-${n-1}`],results:[{sourceSystem:'installation_management',sourceRecordId:`wo-${n}`,serviceProviderId:'sp-1',status:fail&&n===2?'FAILED':'IMPORTED',message:fail&&n===2?'source unavailable':undefined}]};}
  return Response.json({code:0,data});
 };
 const reportPath=join(dir,'report.json');
 const report=await runSourceImport({baseUrl:'http://worker',token:'secret-token',reportPath,fetchImpl,expectedProviders:1,expectedOrders:2});
 return {report,calls,saved:await readFile(reportPath,'utf8'),close:()=>rm(dir,{recursive:true,force:true})};
}
test('CLI pages source baselines and verifies unique imported set against discovered set',async()=>{
 const s=await scenario();try{assert.equal(s.report.status,'SCOPED_COMPLETE');assert.equal(s.report.discoveredWorkOrderCount,2);assert.equal(s.report.persistedWorkOrderCount,2);assert.equal(s.report.baselineCoverageVerified,true);assert.equal(s.calls.filter(c=>c.url.endsWith('/pages')).length,2);assert.equal(s.saved.includes('secret-token'),false);}finally{await s.close();}
});
test('CLI never announces full import after item failure or baseline count mismatch',async()=>{
 for(const config of [{fail:true},{wrongCount:true}]) {const s=await scenario(config);try{assert.equal(s.report.status,'INCOMPLETE');assert.ok(s.report.issues.length);}finally{await s.close();}}
});
