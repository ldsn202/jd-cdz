import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDatabase} from './helpers/sqlite-d1.mjs';
import {loadModule} from './helpers/load-app.mjs';
const {default:app}=await loadModule('../../src/index.ts');
let serial=0;
async function fixture(){
 const db=createDatabase();
 let seed=readFileSync(new URL('../../db/seeds/dev-identity.sql',import.meta.url),'utf8');
 seed=seed.replace("'[\"provider-dev-a\"]'","'[\"provider-dev-a\",\"provider-dev-b\"]'").replace('"SUBMIT_SUPPLEMENT"]','"SUBMIT_SUPPLEMENT","READ_SOURCE_MATERIAL","ENABLE_INTEGRATION_CONFIG"]');
 db.sqlite.exec(seed);
 db.sqlite.exec(`INSERT INTO integration_config VALUES('cfg','provider-dev-b','provider-docs','INSTALLATION','install-main',NULL,NULL,1,1,1)`);
 db.sqlite.prepare(`INSERT INTO work_item(id,service_provider_id,item_kind,business_key,business_identity_json,creation_key,title,status,integration_config_id,assignee_identity_id,gmt_create,gmt_modified) VALUES('item','provider-dev-b','CONFIGURATION','cfg-key',?,'cfg-created','配置','PREPARING','cfg','ir-dev-provider-clerk',1,1)`).run(JSON.stringify(['provider-dev-b','CONFIGURATION','CONFIG_SCOPE','provider-docs','cfg','PROVIDER_RECORD','provider-docs','doc-1','CONFIGURE']));
 const bytes=Buffer.from('%PDF-1.4 test fixture');
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
 const material={sourceSystem:'provider-docs',sourceMaterialId:'sample-file',sourceVersion:'v1',name:'原始材料.pdf',mediaType:'application/pdf'};
 const document={retrievedAt:new Date().toISOString(),sourceRecord:{sourceSystem:'provider-docs',sourceRecordId:'doc-1',sourceVersion:'d1',serviceProviderId:'provider-dev-b',purpose:'CONFIGURATION',configurationPurpose:'INSTALLATION',businessScopeKey:'install-main',sourceFormatId:'fmt',sourceFormatVersion:'f1',installationWorkOrderId:null},contentComplete:true,completeness:'COMPLETE',missingParts:[],formatStatus:'PROVIDED',formatDefinition:{formatId:'fmt',sourceVersion:'f1',fields:[{fieldKey:'name',label:'项目',meaning:'安装项目',unit:null}],notes:null,sourceMaterials:[]},rawJson:'{"rows":[{"name":"电缆"}]}',sourceMaterials:[material]};
 const calls=[],original=globalThis.fetch,storage=new Map();let offline=false,badHash=false;
 globalThis.fetch=async url=>{calls.push(String(url));if(offline)throw Error('source offline');return Response.json({code:0,data:String(url).endsWith('/sessions')?{token:'test-session'}:String(url).includes('/materials/')?{...material,byteLength:bytes.length,contentBase64:bytes.toString('base64'),contentSha256:badHash?'bad':hash}:document});};
 const env={DB:db,EXTERNAL_MODE:'mock',AI_MODE:'real',MOCK_BASE_URL:`http://material-read-${++serial}`,MOCK_ACCOUNT_ID:'service',DEV_IDENTITY_TOKENS:JSON.stringify({jd:'jd-review-1',sp:'provider-clerk-1',service:'svc-jd-charging'}),FILES:{async put(key,value){storage.set(key,Buffer.from(value));},async get(key){const b=storage.get(key);return b?{size:b.length,body:new Blob([b]).stream()}:null;}}};
 const call=(path,token='jd',body,key='upload-1')=>app.request('http://localhost/api/admin/charging'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,'Idempotency-Key':key,...(body instanceof FormData?{}:{'content-type':'application/json'})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined},env);
 const form=()=>{const f=new FormData();f.set('file',new File([bytes],'补充格式.pdf',{type:'application/pdf'}));f.set('providerId','provider-dev-b');f.set('purpose','PROVIDER_FORMAT');f.set('workItemId','item');f.set('expectedWorkItemVersion',String(db.sqlite.prepare("SELECT row_version FROM work_item WHERE id='item'").get().row_version));return f;};
 const content='/work-items/item/business-materials/content?'+new URLSearchParams(material);
 return {db,env,document,calls,call,form,content,bytes,offline(){offline=true;},badHash(){badHash=true;},close(){globalThis.fetch=original;db.close();}};
}
test('JD and own provider read raw records and actual files before analysis without creating jobs',async()=>{
 const f=await fixture();try{
  for(const token of ['jd','sp']){
   const response=await f.call('/work-items/item/business-materials',token);assert.equal(response.status,200);
   const d=(await response.json()).data;assert.equal(d.sourceError,null);assert.equal(d.records[0].data.rawJson,f.document.rawJson);assert.equal(d.records[1].recordType,'PROVIDER_FORMAT');assert.equal(d.sourceMaterials[0].name,'原始材料.pdf');
   const file=await f.call(f.content,token);assert.equal(file.status,200);assert.deepEqual(Buffer.from(await file.arrayBuffer()),f.bytes);
  }
  const jd=(await (await f.call('/work-items/item')).json()).data;assert.equal(jd.canRequestAnalysis,false);assert.deepEqual(jd.allowedActions,[]);
  const sp=(await (await f.call('/work-items/item','sp')).json()).data;assert.equal(sp.canRequestAnalysis,true);assert.ok(sp.allowedActions.includes('ENABLE_INTEGRATION_CONFIG'));
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM background_job').get().n,0);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM analysis_input_snapshot').get().n,0);
 }finally{f.close();}
});
test('a provider cannot read another company or substitute an unrelated file; returned bytes are verified',async()=>{
 const f=await fixture();try{
  f.db.sqlite.prepare("INSERT INTO work_item(id,service_provider_id,item_kind,business_key,business_identity_json,creation_key,title,status,gmt_create,gmt_modified) VALUES('other','provider-dev-a','CONFIGURATION','other','[1]','other','other','PREPARING',1,1)").run();
  assert.equal((await f.call('/work-items/other/business-materials','sp')).status,404);assert.equal(f.calls.length,0);
  assert.equal((await f.call(f.content.replace('sample-file','unrelated'))).status,404);
  assert.equal(f.calls.filter(x=>x.includes('/materials/')).length,0);
  f.badHash();assert.equal((await f.call(f.content)).status,502);
 }finally{f.close();}
});
test('provider uploads configuration material; both sides can read it immediately and analysis still waits for click',async()=>{
 const f=await fixture();try{
  assert.equal((await f.call('/uploads','jd',f.form())).status,403);
  const upload=await f.call('/uploads','sp',f.form());assert.equal(upload.status,202);const result=(await upload.json()).data;
  const row=f.db.sqlite.prepare("SELECT * FROM work_item WHERE id='item'").get();assert.equal(row.analysis_generation,2);assert.equal(row.row_version,2);
  for(const token of ['jd','sp']){
   const materials=(await (await f.call('/work-items/item/business-materials',token)).json()).data;assert.equal(materials.uploads[0].materialVersionId,result.materialVersionId);
   const file=await f.call(`/material-versions/${result.materialVersionId}/content`,token);assert.equal(file.status,200);assert.deepEqual(Buffer.from(await file.arrayBuffer()),f.bytes);
   const detail=(await (await f.call('/work-items/item',token)).json()).data;assert.equal(detail.analysisProgress.state,'WAITING_MANUAL');
  }
  const claims=(await (await f.call('/internal/job-claims','service',{purposes:['READ_SOURCE','ANALYZE_SKILL','TRIAL_CONFIG'],limit:10})).json()).data.claims;assert.deepEqual(claims,[]);
  f.offline();const data=(await (await f.call('/work-items/item/business-materials')).json()).data;assert.ok(data.sourceError);assert.equal(data.uploads.length,1);
 }finally{f.close();}
});

test('real Excel upload is the fixed mapping input and its values reach persisted conversion output',async()=>{
 const f=await fixture();try{
  const {execFileSync}=await import('node:child_process');
  const bytes=execFileSync('python3',['-c',`import io,zipfile,sys,xml.sax.saxutils as x
rows=[['installationItem','installedQuantity','unit','materialSupplier','serviceScope'],['uploaded-material-A','17.25','m','provider','installation'],['uploaded-material-B','0','m','provider','installation']]
b=io.BytesIO()
with zipfile.ZipFile(b,'w') as z:
 z.writestr('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="uploaded" sheetId="1" r:id="r1"/></sheets></workbook>')
 z.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>')
 cells=''.join('<row r="%d">'%i+''.join('<c r="%s%d" t="inlineStr"><is><t>%s</t></is></c>'%(chr(65+j),i,x.escape(v)) for j,v in enumerate(row))+'</row>' for i,row in enumerate(rows,1))
 z.writestr('xl/worksheets/sheet1.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+cells+'</sheetData></worksheet>')
sys.stdout.buffer.write(b.getvalue())`]);
  const form=f.form();form.set('file',new File([bytes],'custom-mapping.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const upload=await f.call('/uploads','sp',form);assert.equal(upload.status,202);const uploaded=(await upload.json()).data;
  const claimEnvelope=await (await f.call('/internal/job-claims','service',{purposes:['PARSE_MATERIAL'],limit:1})).json();const claim=claimEnvelope.data.claims[0];assert.ok(claim);
  const lease={leaseToken:claim.leaseToken,leaseEpoch:claim.leaseEpoch};
  assert.equal((await f.call(`/internal/job-attempts/${claim.attemptId}/dispatch-start`,'service',lease)).status,200);
  const binary=await f.call(`/internal/job-attempts/${claim.attemptId}/material-content`,'service',lease);assert.deepEqual(Buffer.from(await binary.arrayBuffer()),bytes);
  const {parseMaterialBytes}=await import('../../task-runner/material-parser.mjs');const parsed=await parseMaterialBytes(bytes,claim.target);
  assert.equal(parsed.parsing.completeness,'COMPLETE');
  const adopted=await f.call(`/internal/job-attempts/${claim.attemptId}/results`,'service',{...lease,status:'SUCCEEDED',dispatchState:'RESPONSE_RECEIVED',result:parsed});assert.equal(adopted.status,200);
  const materials=(await (await f.call('/work-items/item/business-materials')).json()).data;
  assert.equal(materials.mappingUpload.materialVersionId,uploaded.materialVersionId);assert.equal(materials.mappingUpload.rows[0].installationItem,'uploaded-material-A');assert.equal(materials.mappingUpload.rows[1].installedQuantity,'0');
  const before=(await (await f.call('/internal/job-claims','service',{purposes:['READ_SOURCE','ANALYZE_SKILL'],limit:10})).json()).data;assert.deepEqual(before.claims,[]);
  assert.equal((await f.call('/work-items/item/analysis','sp',{expectedVersion:2},'manual-run')).status,200);
  const {prepareAndRegisterAnalysis,buildAnalysisAdoption}=await loadModule('../../src/services/analysis-pipeline.ts');
  const service={identityId:'ir-dev-service',subjectType:'SERVICE',grants:[{scopeType:'SERVICE_PROVIDER',resourceIds:['provider-dev-b'],actions:['PREPARE_ANALYSIS']}]};
  await prepareAndRegisterAnalysis(f.db,f.env,service,{runId:'uploaded-run',profileId:'isolated-test',implementationVersion:'1',skillPackageDigest:'test-digest',analysisInput:{workItemId:'item',skill:'INTEGRATION_CONFIGURATION'}});
  const snapshot=f.db.sqlite.prepare("SELECT * FROM analysis_input_snapshot WHERE work_item_id='item'").get();assert.equal(snapshot.required_input_state,'COMPLETE');
  const record=JSON.parse(f.db.sqlite.prepare("SELECT data_json FROM analysis_input_item WHERE snapshot_id=? AND record_type='PROVIDER_RECORD'").get(snapshot.id).data_json);
  assert.equal(record.uploadedMaterial.materialVersionId,uploaded.materialVersionId);assert.equal(JSON.parse(record.rawJson).rows[0].installedQuantity,'17.25');assert.notEqual(record.rawJson,f.document.rawJson);
  // Known test rules stand in for the already separately verified model; no model is called here.
  const fields=['installationItem','installedQuantity','unit','materialSupplier','serviceScope'];
  const rules=fields.map(targetField=>({ruleId:targetField,sourceFields:['/'+targetField],targetField,operation:'PIPELINE',parameters:{steps:[{op:'field',path:'/'+targetField}]},conditions:[]}));
  const result={skill:'INTEGRATION_CONFIGURATION',skillVersion:'1.0.0',outputSchemaVersion:'1.0.0',inputSnapshotId:snapshot.id,status:'ANALYZED',summary:'Isolated upload mapping test',findings:[{findingId:'mapping',type:'TRANSFORMATION_CONFIG',content:{ruleCatalogVersion:'charging-transform-1',purpose:'INSTALLATION',sourceFormatId:record.sourceRecord.sourceFormatId,sourceFormatVersion:record.sourceRecord.sourceFormatVersion,rowPath:'/rows',rules},evidenceRefs:[{inputId:'uploaded-format',blockId:null,jsonPointer:'/fields/0/meaning',quote:null}]}],openQuestions:[]};
  const job=f.db.sqlite.prepare("SELECT * FROM background_job WHERE purpose='ANALYZE_SKILL'").get();const adoption=await buildAnalysisAdoption(f.db,job,result);assert.equal(adoption.ok,true);await f.db.batch(adoption.statements);
  const trial=f.db.sqlite.prepare("SELECT * FROM background_job WHERE purpose='TRIAL_CONFIG'").get();
  const {buildConfigurationTrialAdoption}=await loadModule('../../src/services/config-execution.ts');const converted=await buildConfigurationTrialAdoption(f.db,trial);assert.equal(converted.ok,true);await f.db.batch(converted.statements);
  const stored=f.db.sqlite.prepare('SELECT * FROM configuration_trial').get();assert.equal(stored.status,'PASSED',stored.issues_json);
  const rows=JSON.parse(stored.output_json).records[0].rows;assert.equal(rows[0].output.installationItem,'uploaded-material-A');assert.equal(rows[0].output.installedQuantity,17.25);assert.equal(rows[1].output.installedQuantity,0);
  // A saved local input must never be rerequested as an external source record.
  const reread=await f.call('/work-items/item/business-materials');assert.equal(reread.status,200);
  assert.equal((await reread.json()).data.sourceError,null);
  const {findChangedFormatInputs}=await loadModule('../../src/services/config-enablement.ts');
  assert.deepEqual(await findChangedFormatInputs(f.db,f.db.sqlite.prepare("SELECT * FROM integration_config WHERE id='cfg'").get(),'external-v2'),[]);
  // A replacement upload clears the old candidate; its bytes, rather than the prior file, feed the next run.
  const replacement=f.form();replacement.set('file',new File([bytes],'replacement.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const replacementResponse=await f.call('/uploads','sp',replacement,'replacement-upload');assert.equal(replacementResponse.status,202);
  const replacementId=(await replacementResponse.json()).data.materialVersionId;
  assert.equal(f.db.sqlite.prepare("SELECT current_configuration_version_id FROM work_item WHERE id='item'").get().current_configuration_version_id,null);
  const nextClaim=(await (await f.call('/internal/job-claims','service',{purposes:['PARSE_MATERIAL'],limit:1})).json()).data.claims[0];
  const nextLease={leaseToken:nextClaim.leaseToken,leaseEpoch:nextClaim.leaseEpoch};
  assert.equal((await f.call(`/internal/job-attempts/${nextClaim.attemptId}/dispatch-start`,'service',nextLease)).status,200);
  const nextParsed=await parseMaterialBytes(bytes,nextClaim.target);
  assert.equal((await f.call(`/internal/job-attempts/${nextClaim.attemptId}/results`,'service',{...nextLease,status:'SUCCEEDED',dispatchState:'RESPONSE_RECEIVED',result:nextParsed})).status,200);
  const itemVersion=f.db.sqlite.prepare("SELECT row_version FROM work_item WHERE id='item'").get().row_version;
  assert.equal((await f.call('/work-items/item/analysis','sp',{expectedVersion:itemVersion},'manual-replacement')).status,200);
  await prepareAndRegisterAnalysis(f.db,f.env,service,{runId:'replacement-run',profileId:'isolated-test',implementationVersion:'1',skillPackageDigest:'test-digest',analysisInput:{workItemId:'item',skill:'INTEGRATION_CONFIGURATION'}});
  const latest=f.db.sqlite.prepare("SELECT i.data_json FROM analysis_input_item i JOIN analysis_input_snapshot s ON s.id=i.snapshot_id WHERE s.analysis_generation=(SELECT analysis_generation FROM work_item WHERE id='item') AND i.record_type='PROVIDER_RECORD'").get();
  assert.equal(JSON.parse(latest.data_json).uploadedMaterial.materialVersionId,replacementId);
  assert.ok(f.calls.every(url=>!decodeURIComponent(url).includes('upload:')));
 }finally{f.close();}
});

test('ambiguous or incomplete workbook shapes are rejected instead of substituting the old mock sample',async()=>{
 const {workbookRows}=await loadModule('../../src/services/uploaded-configuration.ts');
 const units=[{unitId:'s',name:'s',status:'COMPLETE'}];
 const cell=(cellRange,text,formula=null)=>({unitId:'s',cellRange,text,formula});
 assert.throws(()=>workbookRows(units,[cell('A1','same'),cell('B1','same'),cell('A2','1')]),/重复/);
 assert.throws(()=>workbookRows(units,[cell('A1','name'),cell('B2','1')]),/缺少/);
 assert.throws(()=>workbookRows(units,[cell('A1','name'),cell('A2','2','1+1')]),/公式/);
});
