import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDatabase} from './helpers/sqlite-d1.mjs';
import {loadModule} from './helpers/load-app.mjs';
const {prepareAndRegisterAnalysis,buildAnalysisAdoption}=await loadModule('../../src/services/analysis-pipeline.ts');
const identity={identityId:'ir-dev-service',subjectType:'SERVICE',grants:[{scopeType:'SERVICE_PROVIDER',actions:['PREPARE_ANALYSIS'],resourceIds:['provider-dev-b']}]};
let seq=0;
function fixture(kind='INSTALLATION_PREPARATION'){
 const db=createDatabase();db.sqlite.exec(readFileSync(new URL('../../db/seeds/dev-identity.sql',import.meta.url),'utf8'));const now=Date.now()-20;
 db.sqlite.prepare(`INSERT INTO installation_work_order VALUES('wo','installation','wo-source','provider-dev-b','w1','ACTIVE',NULL,?,?,?)`).run(now,now,now);
 db.sqlite.prepare(`INSERT INTO work_item(id,service_provider_id,installation_work_order_id,item_kind,business_key,business_identity_json,creation_key,title,status,assignee_identity_id,gmt_create,gmt_modified) VALUES('item','provider-dev-b','wo',?,'key','["source"]','create','安装','PREPARING','ir-dev-provider-clerk',?,?)`).run(kind,now,now);
 const context={retrievedAt:new Date(now).toISOString(),completeness:'COMPLETE',missingParts:[],installationWorkOrder:{installationWorkOrderId:'wo-source',serviceProviderId:'provider-dev-b',purchaseOrderId:'purchase',sourceSystem:'installation',sourceVersion:'w2',sourceUpdatedAt:null},installationPlan:{installationPlanId:'plan',sourceSystem:'installation',sourceVersion:'p1',items:[{installationItem:'电缆',plannedQuantity:2,unit:'米'}]},installationDetailStatus:kind==='INSTALLATION_REVIEW'?'SUBMITTED':'NOT_SUBMITTED',installationDetail:kind==='INSTALLATION_REVIEW'?{installationDetailId:'detail',sourceSystem:'installation',sourceVersion:'d1',items:[]}:null,sourceMaterialIndexComplete:true,sourceMaterials:[{sourceSystem:'installation',sourceMaterialId:'material',sourceVersion:'m1'}]};
 const entitlement={retrievedAt:new Date(now).toISOString(),installationWorkOrderId:'wo-source',workOrderSourceVersion:'w2',entitlementListComplete:true,completeness:'COMPLETE',missingParts:[],purchaseOrder:{purchaseOrderId:'purchase',sourceSystem:'orders',sourceVersion:'p1'},entitlements:[{installationEntitlementId:'right',name:'安装权益',sourceSystem:'orders',sourceVersion:'r1',quantityType:'LIMITED',includedQuantity:'5',unit:'米'}]};
 db.sqlite.prepare(`INSERT INTO source_material VALUES('material','installation','material',?,?)`).run(now,now);
 db.sqlite.prepare(`INSERT INTO source_material_version VALUES('version','material','m1','VERIFIED','安装.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',10,?,'stored',?,NULL,?,?)`).run('a'.repeat(64),now,now,now);
 db.sqlite.prepare(`INSERT INTO background_job(id,purpose,service_provider_id,target_json,dedupe_key,status,lease_epoch,row_version,gmt_create,gmt_modified) VALUES('parse-job','PARSE_MATERIAL','provider-dev-b','{}','parse','READY',0,1,?,?)`).run(now,now);
 db.sqlite.prepare(`INSERT INTO capability_call VALUES('parse-run','parse-job','PARSE_MATERIAL','version',NULL,'parser','1','{}',?,?,?)`).run('a'.repeat(64),now,now);
 db.sqlite.prepare(`INSERT INTO material_parsing VALUES('parsed','parse-run','version',?,'parser','1','COMPLETE',?,?,'[]',?,?)`).run('a'.repeat(64),JSON.stringify([{unitId:'sheet',kind:'SHEET',index:1,name:'安装',status:'COMPLETE'}]),JSON.stringify([{blockId:'cell',unitId:'sheet',kind:'TABLE_CELL',text:'电缆 2 米',cellRange:'A1:C1',formula:null,cachedValue:null}]),now,now);
 const orig=globalThis.fetch,calls=[],env={EXTERNAL_MODE:'mock',MOCK_BASE_URL:`http://install-prep-${++seq}`,MOCK_ACCOUNT_ID:'service'};
 globalThis.fetch=async url=>{calls.push(String(url));return Response.json({code:0,data:String(url).endsWith('/sessions')?{token:'session'}:String(url).includes('installation-entitlements')?entitlement:context});};
 return {db,env,context,calls,body:{runId:'analysis-run',profileId:'profile',implementationVersion:'1',skillPackageDigest:'digest',analysisInput:{workItemId:'item',skill:kind==='INSTALLATION_REVIEW'?'INSTALLATION_EVIDENCE':'INSTALLATION_EXTRACTION'}},close(){globalThis.fetch=orig;db.close();}};
}
test('extraction fixes actual parsed material and current context, then creates editable AI draft',async()=>{
 const f=fixture();try{
 await prepareAndRegisterAnalysis(f.db,f.env,identity,f.body);const job=f.db.sqlite.prepare("SELECT * FROM background_job WHERE purpose='ANALYZE_SKILL'").get(),target=JSON.parse(job.target_json);
 assert.equal(target.parsedMaterials[0].parseId,'parsed');assert.equal(target.parsedMaterials[0].blocks[0].text,'电缆 2 米');assert.ok(target.records.some(r=>r.recordType==='INSTALLATION_ENTITLEMENT'));
 assert.equal(f.db.sqlite.prepare('SELECT source_version FROM installation_work_order').get().source_version,'w2');
 const result={skill:'INSTALLATION_EXTRACTION',skillVersion:'1.0.0',outputSchemaVersion:'1.0.0',inputSnapshotId:target.snapshotId,status:'ANALYZED',summary:'施工事实已提取',findings:[{findingId:'line',type:'INSTALLATION_FACT',content:{installationItem:'电缆',installedQuantity:2,unit:'米',materialSupplier:null,serviceScope:null},evidenceRefs:[{inputId:'parsed',blockId:'cell',jsonPointer:null,quote:'电缆 2 米'}]}],openQuestions:[]};
 const a=await buildAnalysisAdoption(f.db,job,result);assert.equal(a.ok,true);await f.db.batch(a.statements);
 const draft=f.db.sqlite.prepare('SELECT * FROM installation_draft_version').get();assert.ok(draft);assert.equal(draft.context_snapshot_id,target.contextSnapshotId);assert.equal(JSON.parse(draft.items_json)[0].installedQuantity,2);assert.equal(JSON.parse(draft.source_materials_json)[0].materialVersionId,'version');assert.equal(f.db.sqlite.prepare('SELECT status FROM work_item').get().status,'READY');
 }finally{f.close();}
});
test('review includes real plan detail and entitlement records; absent purchase identity remains explicit',async()=>{
 const f=fixture('INSTALLATION_REVIEW');try{f.context.installationWorkOrder.purchaseOrderId=null;await prepareAndRegisterAnalysis(f.db,f.env,identity,f.body);const snapshot=f.db.sqlite.prepare('SELECT * FROM analysis_input_snapshot').get();assert.equal(snapshot.required_input_state,'INCOMPLETE');assert.match(snapshot.input_issues_json,/采购单/);assert.ok(f.db.sqlite.prepare("SELECT 1 FROM analysis_input_item WHERE record_type='INSTALLATION_DETAIL'").get());}finally{f.close();}
});
test('new input generation keeps human quantities but requires fresh analysis and explicit reconfirmation before submission',async()=>{
 const f=fixture();try{
  const {saveHumanDraft}=await loadModule('../../src/services/installation-draft.ts'),{submitInstallationDetail}=await loadModule('../../src/services/installation-submit.ts');
  const human={identityId:'ir-dev-provider-clerk',subjectType:'HUMAN',grants:[{grantId:'g-clerk-b',scopeType:'SERVICE_PROVIDER',actions:['CONFIRM_INSTALLATION_DRAFT','SUBMIT_INSTALLATION_DETAIL'],resourceIds:['provider-dev-b']}]};
  const row=()=>f.db.sqlite.prepare("SELECT * FROM work_item WHERE id='item'").get(),draft=()=>f.db.sqlite.prepare('SELECT v.* FROM installation_draft d JOIN installation_draft_version v ON v.id=d.current_version_id').get();
  const analyze=async(runId)=>{await prepareAndRegisterAnalysis(f.db,f.env,identity,{...f.body,runId});const job=f.db.sqlite.prepare("SELECT j.* FROM background_job j JOIN capability_call c ON c.job_id=j.id WHERE c.id=?").get(runId),t=JSON.parse(job.target_json);const result={skill:'INSTALLATION_EXTRACTION',skillVersion:'1.0.0',outputSchemaVersion:'1.0.0',inputSnapshotId:t.snapshotId,status:'ANALYZED',summary:'当前施工事实',findings:[{findingId:'line',type:'INSTALLATION_FACT',content:{installationItem:'电缆',installedQuantity:2,unit:'米',materialSupplier:'服务商',serviceScope:'安装'},evidenceRefs:[{inputId:'parsed',blockId:'cell',jsonPointer:null,quote:'电缆 2 米'}]}],openQuestions:[]};const a=await buildAnalysisAdoption(f.db,job,result);await f.db.batch(a.statements);};
  await analyze('first');let r=row(),d=draft();const edited=[{...JSON.parse(d.items_json)[0],installedQuantity:3}];await saveHumanDraft(f.db,human,r,'human-edit',{expectedWorkItemVersion:r.row_version,expectedResponsibilityVersion:r.responsibility_version,expectedDraftVersionId:d.id,items:edited,editNotes:[{itemIndex:0,field:'installedQuantity',reason:'现场复核数量'}]});
  f.db.sqlite.prepare("UPDATE work_item SET analysis_generation=2,current_analysis_result_id=NULL,row_version=row_version+1,status='PREPARING' WHERE id='item'").run();r=row();d=draft();
  await assert.rejects(submitInstallationDetail(f.db,human,r,'stale-before-analysis',{expectedWorkItemVersion:r.row_version,expectedResponsibilityVersion:r.responsibility_version,draftVersionId:d.id}),/代次|当前分析|重新确认/);
  await assert.rejects(saveHumanDraft(f.db,human,r,'stale-save',{expectedWorkItemVersion:r.row_version,expectedResponsibilityVersion:r.responsibility_version,expectedDraftVersionId:d.id,items:edited,editNotes:[]}),/当前分析|代次/);
  await analyze('second');r=row();d=draft();assert.equal(JSON.parse(d.items_json)[0].installedQuantity,3);
  await assert.rejects(submitInstallationDetail(f.db,human,r,'stale-after-analysis',{expectedWorkItemVersion:r.row_version,expectedResponsibilityVersion:r.responsibility_version,draftVersionId:d.id}),/代次|当前分析|重新确认/);
  await assert.rejects(saveHumanDraft(f.db,human,r,'empty-reconfirmation',{expectedWorkItemVersion:r.row_version,expectedResponsibilityVersion:r.responsibility_version,expectedDraftVersionId:d.id,items:edited,editNotes:[]}),/理由|重新确认/);
  await saveHumanDraft(f.db,human,r,'reconfirm',{expectedWorkItemVersion:r.row_version,expectedResponsibilityVersion:r.responsibility_version,expectedDraftVersionId:d.id,items:edited,editNotes:[{itemIndex:0,field:'installedQuantity',reason:'已核对新材料，保留人工确认数量'}]});d=draft();assert.equal(d.analysis_result_id,r.current_analysis_result_id);assert.equal(JSON.parse(d.items_json)[0].installedQuantity,3);
  const submitted=await submitInstallationDetail(f.db,human,row(),'fresh-submit',{expectedWorkItemVersion:row().row_version,expectedResponsibilityVersion:row().responsibility_version,draftVersionId:d.id});assert.equal(submitted.status,'ACCEPTED');assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM external_write_operation').get().n,1);
 }finally{f.close();}
});
