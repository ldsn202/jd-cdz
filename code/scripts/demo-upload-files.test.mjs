import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {parseMaterialBytes} from '../task-runner/material-parser.mjs';
const root=fileURLToPath(new URL('../../测试用上传数据/',import.meta.url));
const manifest=JSON.parse(readFileSync(join(root,'文件清单.json')));
test('all seventeen delivered files are present and every Excel cell matches the declared case',async()=>{
 assert.equal(manifest.files.length,17);assert.equal(new Set(manifest.files.map(f=>f.providerId)).size,10);
 assert.equal(readdirSync(root,{recursive:true}).filter(f=>/\.(xlsx|pdf|png|jpg)$/.test(f)).length,17);
 for(const file of manifest.files){
  const bytes=readFileSync(join(root,file.file));assert.ok(bytes.length>100);assert.ok(bytes.length<=10*1024*1024);
  if(!file.file.endsWith('.xlsx'))continue;
  const {parsing}=await parseMaterialBytes(bytes,{runId:file.file,profileId:'local-material-parser',implementationVersion:'1.0.0',parseInput:{mediaType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',byteLength:bytes.length,contentSha256:createHash('sha256').update(bytes).digest('hex')}});
  assert.equal(parsing.completeness,'COMPLETE',file.file);assert.equal(parsing.units.length,1);
  const rows=file.rows??[['安装工单','项目','数量','单位','供料方','服务范围'],...file.items.map(i=>[file.workOrderId,i.installationItem,i.quantity,i.unit,i.materialSupplier,i.serviceScope])];
  for(const [r,row] of rows.entries())for(const [c,value]of row.entries()){
   const cell=String.fromCharCode(65+c)+(r+1),block=parsing.blocks.find(b=>b.cellRange===cell);
   assert.equal(block?.text,String(value),file.file+' '+cell);assert.equal(block.formula,null);
  }
 }
});
test('PDF and image cases contain actual document bytes rather than placeholder files',()=>{
 for(const file of manifest.files.filter(f=>!f.file.endsWith('.xlsx'))){
  const bytes=readFileSync(join(root,file.file));
  if(file.file.endsWith('.pdf'))assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
  if(file.file.endsWith('.png'))assert.equal(bytes.subarray(1,4).toString(),'PNG');
  if(file.file.endsWith('.jpg'))assert.equal(bytes.subarray(0,2).toString('hex'),'ffd8');
  assert.ok(bytes.length>5000,file.file);
 }
});
