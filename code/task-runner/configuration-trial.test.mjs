import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
test('runner requests Worker trial under current lease without starting models or sending fabricated output',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'config-runner-'));const preload=join(dir,'worker.mjs');const report=join(dir,'requests.json');
 await writeFile(preload,`import {writeFile} from 'node:fs/promises';const requests=[];
 globalThis.fetch=async(url,init)=>{const body=JSON.parse(init.body);requests.push({url,body});let data;
 if(url.endsWith('/job-claims')){if(!body.purposes.includes('TRIAL_CONFIG'))throw Error('trial not claimed');data={claims:[{jobId:'trial',attemptId:'attempt',purpose:'TRIAL_CONFIG',target:{configurationVersionId:'candidate'},leaseToken:'token',leaseEpoch:1,leaseUntil:Date.now()+60000}]};}
 else if(url.endsWith('/dispatch-start'))data={dispatchState:'MAY_HAVE_BEEN_SENT'};
 else if(url.endsWith('/configuration-trial')){data={adopted:true,jobStatus:'SUCCEEDED'};await writeFile(process.env.TEST_REPORT,JSON.stringify(requests));}
 else throw Error('unexpected route '+url);return Response.json({code:0,data});};`);
 try{
  const processResult=await promisify(execFile)(process.execPath,['--import',preload,fileURLToPath(new URL('./runner.mjs',import.meta.url)),'--once'],{env:{...process.env,AI_MODE:'mock',WORKER_BASE_URL:'http://isolated-worker',SERVICE_TOKEN:'test',RUNS_ROOT:join(dir,'runs'),TEST_REPORT:report},timeout:10000});
  const requests=JSON.parse(await readFile(report,'utf8'));assert.equal(requests.length,3);assert.deepEqual(requests[2].body,{leaseToken:'token',leaseEpoch:1});assert.equal((await readdir(dir)).includes('runs'),false);assert.match(processResult.stdout,/SUCCEEDED/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
