import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {registerUploadedMaterial} from '../materials/upload.ts';
import {getSourceMaterial} from '../materials/read.ts';
const db=()=>{const d=new DatabaseSync(':memory:');d.exec('CREATE TABLE source_record(kind TEXT,record_id TEXT,source_version TEXT,source_updated_at TEXT,payload_json TEXT,PRIMARY KEY(kind,record_id))');return d;};
test('original upload bytes survive transfer and remain scoped to one provider and one work order',()=>{
 const files=db(),installation=db(),dir=mkdtempSync(join(tmpdir(),'jd-upload-'));
 const auth={account:{accountId:'acc-sp-001',role:'PROVIDER_BUSINESS',active:true},grants:[{grantId:'g',scopeProviderIds:['SP-001']}]};
 const wo={installationWorkOrderId:'WO-1',serviceProviderId:'SP-001'};
 installation.prepare("INSERT INTO source_record VALUES('work_order','WO-1','v1','now',?)").run(JSON.stringify(wo));
 const bytes=Buffer.from('%PDF-1.4 actual uploaded bytes'),body={sourceMaterialId:'up-test',sourceVersion:'local:up-test',name:'施工记录.pdf',mediaType:'application/pdf',contentSha256:createHash('sha256').update(bytes).digest('hex'),contentBase64:bytes.toString('base64')};
 try{
  assert.equal(registerUploadedMaterial(files,installation,dir,{...auth,grants:[{grantId:'other',scopeProviderIds:['SP-002']}]},'WO-1',body).http,403);
  assert.equal(registerUploadedMaterial(files,installation,dir,auth,'WO-1',{...body,contentSha256:'wrong'}).http,400);
  assert.equal(registerUploadedMaterial(files,installation,dir,auth,'WO-1',body).http,200);
  assert.equal(registerUploadedMaterial(files,installation,dir,auth,'WO-1',body).http,200);
  assert.deepEqual(readFileSync(join(dir,'uploaded/up-test')),bytes);
  const result=getSourceMaterial(files,installation,dir,auth,'LOCAL_UPLOAD','up-test','local:up-test');
  assert.equal(result.http,200);assert.deepEqual(Buffer.from(result.body.data.contentBase64,'base64'),bytes);
  assert.equal(result.body.data.sourceSystem,'LOCAL_UPLOAD');
  const changed=Buffer.from('changed'),wrong={...body,contentBase64:changed.toString('base64'),contentSha256:createHash('sha256').update(changed).digest('hex')};
  assert.equal(registerUploadedMaterial(files,installation,dir,auth,'WO-1',wrong).http,409);
  installation.prepare("INSERT INTO source_record VALUES('work_order','WO-2','v1','now',?)").run(JSON.stringify({...wo,installationWorkOrderId:'WO-2'}));
  assert.equal(registerUploadedMaterial(files,installation,dir,auth,'WO-2',body).http,409);
 }finally{files.close();installation.close();rmSync(dir,{recursive:true});}
});

