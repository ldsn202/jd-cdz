#!/usr/bin/env node
// Storage-level protection check. This is not an uploads API business acceptance test.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID,createHash} from 'node:crypto';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const args=process.argv.slice(2),opt=name=>args.indexOf(name)<0?undefined:args[args.indexOf(name)+1],id=opt('--env'),base=opt('--base')??'http://127.0.0.1:18980';
if(!id||!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('--env and a localhost --base required');
const code=join(dirname(fileURLToPath(import.meta.url)),'..'),root=join(code,'mocks/.data/lifecycle-managed'),registry=JSON.parse(await readFile(join(root,'registry.json'),'utf8')),e=registry.environments[id];
assert.equal(e?.status,'ACTIVE');assert.equal(registry.activeEnvId,id);const dir=join(root,id),key='uploads/lifecycle-protection-'+randomUUID()+'.txt',bytes=Buffer.from('Preserve this actual isolated R2 object: '+randomUUID());
const file=join(dir,'tasks/protected-upload-object.txt');await writeFile(file,bytes,{mode:0o600});
const common=['--config',join(dir,'wrangler.json'),'--local','--persist-to',join(dir,'app-state')],wrangler=join(code,'api/node_modules/wrangler/bin/wrangler.js');
const logs=[];const run=async argv=>{const r=await promisify(execFile)(process.execPath,[wrangler,...argv,...common],{env:{...process.env,WRANGLER_SEND_METRICS:'false'},maxBuffer:8e6});logs.push(r.stdout,r.stderr);};
await run(['r2','object','put','life-'+id+'/'+key,'--file',file]);
const response=await fetch(base+'/lifecycle/restore',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({envId:id+'-protected',templateEnvId:id})});const body=await response.json();assert.equal(response.status,409);assert.match(body.error,/uploads/i);
const restored=join(dir,'tasks/protected-upload-object-returned.txt');await run(['r2','object','get','life-'+id+'/'+key,'--file',restored]);assert.deepEqual(await readFile(restored),bytes);
const after=JSON.parse(await readFile(join(root,'registry.json'),'utf8'));assert.equal(after.activeEnvId,id);assert.equal(after.environments[id].status,'ACTIVE');assert.equal(after.environments[id+'-protected'],undefined);
const report={passed:true,scope:'R2 storage engineering protection; not uploads API acceptance',envId:id,http:response.status,objectKey:key,sha256:createHash('sha256').update(bytes).digest('hex'),objectPreserved:true,originalEnvironmentStillActive:true,finishedAt:new Date().toISOString()};
await writeFile(join(dir,'tasks/upload-protection.json'),JSON.stringify(report,null,2));await writeFile(join(dir,'tasks/upload-protection.log'),logs.join('\n'));console.log(JSON.stringify(report));
