import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {upgradeDemoDataset} from './demo-dataset.mjs';
const exists=p=>access(p).then(()=>true,()=>false);
async function put(root,path,data){const p=join(root,path);await mkdir(dirname(p),{recursive:true});await writeFile(p,data);}
test('old 100-provider stores are archived together, later starts preserve the new ten-provider data',async()=>{
 const root=await mkdtemp(join(tmpdir(),'jd-demo-upgrade-'));
 try{
  await put(root,'mocks/.data/mock-env-a/delivery/standard-v1/data-manifest.json',JSON.stringify({totals:{providers:100}}));
  await put(root,'.wrangler/state/upload.xlsx','existing upload');await put(root,'.local/import-report.json','old import');
  const result=await upgradeDemoDataset(root,'demo-10-v2');assert.ok(result.archive);
  assert.equal(await readFile(join(result.archive,'state/upload.xlsx'),'utf8'),'existing upload');
  assert.equal(await readFile(join(result.archive,'import-report.json'),'utf8'),'old import');
  assert.equal(await exists(join(root,'.local/demo-upgrade.json')),false);
  await put(root,'mocks/.data/mock-env-a/delivery/demo-10-v2/data-manifest.json',JSON.stringify({totals:{providers:10}}));
  await put(root,'.wrangler/state/upload.xlsx','new upload');
  assert.equal(await upgradeDemoDataset(root,'demo-10-v2'),null);
  assert.equal(await readFile(join(root,'.wrangler/state/upload.xlsx'),'utf8'),'new upload');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('interrupted store move resumes without losing prior moved files',async()=>{
 const root=await mkdtemp(join(tmpdir(),'jd-demo-resume-'));
 try{
  const archive=join(root,'.local/backup');await put(root,'.local/backup/source/preserved','source');
  await put(root,'.wrangler/state/preserved','state');
  await put(root,'.local/demo-upgrade.json',JSON.stringify({archive,datasetId:'demo-10-v2'}));
  await upgradeDemoDataset(root,'demo-10-v2');
  assert.equal(await readFile(join(archive,'source/preserved'),'utf8'),'source');
  assert.equal(await readFile(join(archive,'state/preserved'),'utf8'),'state');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('unrecognized existing dataset is never overwritten',async()=>{
 const root=await mkdtemp(join(tmpdir(),'jd-demo-protect-'));
 try{await put(root,'mocks/.data/mock-env-a/private','preserve');await assert.rejects(upgradeDemoDataset(root,'demo-10-v2'),/保持原样/);assert.equal(await readFile(join(root,'mocks/.data/mock-env-a/private'),'utf8'),'preserve');}
 finally{await rm(root,{recursive:true,force:true});}
});
