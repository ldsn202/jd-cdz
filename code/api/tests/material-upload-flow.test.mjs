// Isolated HTTP route acceptance: real file parsing, all production SQL guards, in-memory byte bucket.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createDatabase } from './helpers/sqlite-d1.mjs';
import { loadModule } from './helpers/load-app.mjs';
import { parseMaterialBytes } from '../../task-runner/material-parser.mjs';
const {default: app}=await loadModule('../../src/index.ts');
function xlsxBytes(){
 return execFileSync('python3',['-c',`import io,zipfile,sys
b=io.BytesIO()
with zipfile.ZipFile(b,'w') as z:
 z.writestr('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="施工" sheetId="1" r:id="r1"/></sheets></workbook>')
 z.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>')
 z.writestr('xl/worksheets/sheet1.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>实际管线</t></is></c><c r="B1"><v>12</v></c></row></sheetData></worksheet>')
sys.stdout.buffer.write(b.getvalue())`]);
}
test('upload HTTP -> leased bytes -> real parser -> adopted rows -> READY and visible evidence',async()=>{
 const db=createDatabase();
 try{
  for(const seed of ['dev-identity','dev-work-items'])db.sqlite.exec(readFileSync(new URL(`../../db/seeds/${seed}.sql`,import.meta.url),'utf8'));
  const storage=new Map();
  const env={DB:db,AI_MODE:'mock',DEV_IDENTITY_TOKENS:JSON.stringify({clerk:'provider-clerk-1',service:'svc-jd-charging'}),FILES:{
   async put(key,bytes){storage.set(key,Buffer.from(bytes));},
   async get(key){const bytes=storage.get(key);return bytes?{size:bytes.length,body:new Blob([bytes]).stream()}:null;},
  }};
  const request=(path,body,token='service')=>app.request(`http://localhost/api/admin/charging${path}`,{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,...(body instanceof FormData?{}:{'content-type':'application/json'}),'Idempotency-Key':'parse-flow-1'},body:body instanceof FormData?body:body?JSON.stringify(body):undefined},env);
  const json=async(path,body,token)=>{const response=await request(path,body,token);const envelope=await response.json();assert.equal(envelope.code,0,envelope.msg);return envelope.data;};
  const bytes=xlsxBytes();
  const form=new FormData();
  form.set('file',new File([bytes],'施工.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  form.set('providerId','provider-dev-b');form.set('purpose','INSTALLATION_MATERIAL');form.set('workItemId','w-dev-2');form.set('expectedWorkItemVersion','1');
  const upload=await json('/uploads',form,'clerk');
  assert.equal((await json(`/uploads/${upload.uploadId}`,null,'clerk')).status,'RECEIVED');
  const {claims:[claim]}=await json('/internal/job-claims',{purposes:['PARSE_MATERIAL'],limit:1});
  const lease={leaseToken:claim.leaseToken,leaseEpoch:claim.leaseEpoch};
  await json(`/internal/job-attempts/${claim.attemptId}/dispatch-start`,lease);
  const content=await request(`/internal/job-attempts/${claim.attemptId}/material-content`,lease);
  assert.equal(content.status,200);
  const downloaded=Buffer.from(await content.arrayBuffer());assert.deepEqual(downloaded,bytes);
  const parsed=await parseMaterialBytes(downloaded,claim.target);
  const adopted=await json(`/internal/job-attempts/${claim.attemptId}/results`,{...lease,status:'SUCCEEDED',dispatchState:'RESPONSE_RECEIVED',result:parsed});
  assert.equal(adopted.adopted,true);
  assert.equal((await json(`/uploads/${upload.uploadId}`,null,'clerk')).status,'READY');
  assert.equal((await request(`/material-versions/${upload.materialVersionId}`,null,'clerk')).status,404, 'upload right alone does not grant source read');
  const visible=await json(`/material-versions/${upload.materialVersionId}`,null,'service');
  assert.equal(visible.parsing.completeness,'COMPLETE');
  assert.equal(visible.parsing.blocks[0].text,'实际管线');
  assert.equal(visible.parsing.units[0].name,'施工');
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM material_parsing').get().n,1);
 }finally{db.close();}
});
