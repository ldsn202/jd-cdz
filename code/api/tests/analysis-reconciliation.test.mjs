import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDatabase} from './helpers/sqlite-d1.mjs';
import {loadModule} from './helpers/load-app.mjs';
const {prepareAndRegisterAnalysis,buildAnalysisAdoption}=await loadModule('../../src/services/analysis-pipeline.ts');
const {readReconciliation}=await loadModule('../../src/services/reconciliation-read.ts');
const identity={subjectType:'SERVICE',grants:[{scopeType:'SERVICE_PROVIDER',actions:['PREPARE_ANALYSIS'],resourceIds:['provider-dev-b']}]};
function fixture(matched=false){
 const db=createDatabase();db.sqlite.exec(readFileSync(new URL('../../db/seeds/dev-identity.sql',import.meta.url),'utf8'));const now=Date.now()-100;
 db.sqlite.prepare(`INSERT INTO installation_work_order VALUES('wo','installation','wo-source','provider-dev-b','w1','ACTIVE',NULL,?,?,?)`).run(now,now,now);
 db.sqlite.prepare(`INSERT INTO work_item(id,service_provider_id,installation_work_order_id,item_kind,business_key,business_identity_json,creation_key,title,status,gmt_create,gmt_modified) VALUES('item','provider-dev-b','wo','RECONCILIATION','key',?,'created','对账','PREPARING',?,?)`).run(JSON.stringify(['provider-dev-b','RECONCILIATION','INSTALLATION_WORK_ORDER','installation','wo-source','JD_BILL','billing','bill','RECONCILE']),now,now);
 db.sqlite.prepare(`INSERT INTO activity_record VALUES('reference','item','reference','WORK_CREATED',NULL,'WORK_ITEM','item',NULL,?,?,?)`).run(JSON.stringify({sourceReferences:[{recordType:'PROVIDER_RECEIVABLE',sourceSystem:'provider',sourceRecordId:'receivable'}]}),now,now);
 const context={retrievedAt:new Date(now).toISOString(),completeness:'COMPLETE',missingParts:[],installationWorkOrder:{installationWorkOrderId:'wo-source',serviceProviderId:'provider-dev-b',purchaseOrderId:null,sourceSystem:'installation',sourceVersion:'w1',sourceUpdatedAt:null},installationPlan:{installationPlanId:'plan',sourceSystem:'installation',sourceVersion:'p1',items:[]},installationDetailStatus:'NOT_SUBMITTED',installationDetail:null,sourceMaterialIndexComplete:true,sourceMaterials:[]};
 const bill={retrievedAt:new Date(now).toISOString(),jdBillId:'bill',installationWorkOrderId:'wo-source',serviceProviderId:'provider-dev-b',sourceSystem:'billing',sourceVersion:'b1',sourceUpdatedAt:null,relatedWorkOrderIds:['wo-source'],currency:'CNY',taxBasis:'TAX_INCLUDED',effectiveStatus:'EFFECTIVE',reportedTotalAmount:'0.3',targetWorkOrderAmount:'0.3',itemsComplete:true,completeness:'COMPLETE',missingParts:[],items:[{billItemId:'line',itemName:'电缆',installationWorkOrderId:'wo-source',chargeScope:'安装',billedQuantity:'3',unit:'米',unitPrice:'0.1',amount:'0.3'}]};
 const receivable={...bill,...(matched?{}:{reportedTotalAmount:'0.6',targetWorkOrderAmount:'0.6',items:bill.items.map(line=>({...line,unitPrice:'0.2',amount:'0.6'}))}),sourceSystem:'provider',providerReceivableId:'receivable',sourceVersion:'r1'};
 const fees={retrievedAt:new Date(now).toISOString(),installationWorkOrderId:'wo-source',serviceProviderId:'provider-dev-b',workOrderSourceVersion:'w1',lookupScope:'本工单',termListComplete:true,approvalListComplete:true,completeness:'COMPLETE',missingParts:[],terms:[{sourceSystem:'terms',sourceRecordId:'term',sourceVersion:'t1',sourceUpdatedAt:null,title:'合同',sourceStatus:'有效',scope:'安装',applicability:'APPLICABLE',applicabilityBasis:'本工单合同',recordText:'电缆每米0.1元',materialReferences:[],effectiveStatus:'EFFECTIVE'}],approvals:[]};
 const original=globalThis.fetch;globalThis.fetch=async url=>Response.json({code:0,data:String(url).endsWith('/sessions')?{token:'session'}:String(url).includes('/jd-bills/')?bill:String(url).includes('/receivables/')?receivable:String(url).includes('/fee-evidence')?fees:context});
 return {db,env:{EXTERNAL_MODE:'mock',MOCK_BASE_URL:'http://recon-analysis',MOCK_ACCOUNT_ID:'service'},close(){globalThis.fetch=original;db.close();}};
}
test('source-linked reconciliation reads both original bills and fee terms, persists exact comparison and explanation together',async()=>{
 const f=fixture();try{
 const now=Date.now();f.db.sqlite.prepare(`INSERT INTO billing_document VALUES('other-provider','PROVIDER','provider','receivable','provider-dev-a',?,?)`).run(now,now);
 await prepareAndRegisterAnalysis(f.db,f.env,identity,{runId:'run',profileId:'profile',implementationVersion:'1',skillPackageDigest:'digest',analysisInput:{workItemId:'item',skill:'RECONCILIATION_EXPLANATION'}});
 const job=f.db.sqlite.prepare("SELECT * FROM background_job WHERE purpose='ANALYZE_SKILL'").get(),target=JSON.parse(job.target_json),term=target.records.find(r=>r.recordType==='BILLING_TERM');assert.ok(target.records.some(r=>r.recordType==='PROVIDER_RECEIVABLE'));
 assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM reconciliation_record').get().n,1,'comparison exists before any model result');assert.equal(target.records.find(r=>r.recordType==='JD_BILL').data._programComparison.differenceAmount,'0.3');
 const result={skill:'RECONCILIATION_EXPLANATION',skillVersion:'1.0.0',outputSchemaVersion:'1.0.0',inputSnapshotId:target.snapshotId,status:'ANALYZED',summary:'费用解释',findings:[{findingId:'fee',type:'FEE_EXPLANATION',content:{topic:'电缆费用',explanation:'依据合同单价'},evidenceRefs:[{inputId:term.inputId,blockId:null,jsonPointer:'/recordText',quote:'电缆每米0.1元'}]}],openQuestions:[]};
 const a=await buildAnalysisAdoption(f.db,job,result);assert.equal(a.ok,true);await f.db.batch(a.statements);
 const comparison=f.db.sqlite.prepare('SELECT * FROM reconciliation_record').get();assert.ok(comparison);assert.equal(comparison.status,'DIFFERENCE');assert.equal(comparison.difference_amount,'0.3');assert.equal(comparison.snapshot_id,target.snapshotId);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM reconciliation_analysis_link').get().n,1);assert.equal(f.db.sqlite.prepare('SELECT current_reconciliation_id FROM work_item').get().current_reconciliation_id,comparison.id);const view=await readReconciliation(f.db,'item',comparison.id,1);assert.equal(view.groups[0].jdItems[0].name,'电缆');assert.equal(view.groups[0].jdItems[0].quantity,'3');
 }finally{f.close();}
});

test('fully matched bills finish program comparison without scheduling a model and retry is idempotent',async()=>{
 const f=fixture(true);try{
 const body={runId:'matched-run',profileId:'profile',implementationVersion:'1',skillPackageDigest:'digest',analysisInput:{workItemId:'item',skill:'RECONCILIATION_EXPLANATION'}};
 await prepareAndRegisterAnalysis(f.db,f.env,identity,body);
 await prepareAndRegisterAnalysis(f.db,f.env,identity,body);
 assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM background_job WHERE purpose='ANALYZE_SKILL'").get().n,0);
 assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM analysis_input_snapshot").get().n,1);
 const item=f.db.sqlite.prepare("SELECT * FROM work_item WHERE id='item'").get();assert.equal(item.status,'READY');assert.equal(item.current_analysis_result_id,null);
 const {analysisProgress}=await loadModule('../../src/services/analysis-control.ts');
 assert.equal((await analysisProgress(f.db,item,true)).state,'CHECKED');
 }finally{f.close();}
});
