import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:net';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,readdir,cp,open,rm} from 'node:fs/promises';
import {join,resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LifecycleRegistry,atomicJson,identityBootstrapSql,PROTOCOL} from './lifecycle-state.mjs';
import {runSourceImport} from './source-import.mjs';
const exec=promisify(execFile),delay=ms=>new Promise(r=>setTimeout(r,ms));
const codeRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..'),mocksRoot=join(codeRoot,'mocks');
const wrangler=join(codeRoot,'api/node_modules/wrangler/bin/wrangler.js');
const childEnv=()=>({...process.env,WRANGLER_SEND_METRICS:'false',CI:'true',BROWSER:'none'});
async function port(){return new Promise((res,rej)=>{const s=createServer();s.once('error',rej);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>res(p));});});}
async function free(portNumber){return new Promise((res,rej)=>{const s=createServer();s.once('error',()=>rej(Error('Owned environment port already occupied; refusing to touch that process')));s.listen(portNumber,'127.0.0.1',()=>s.close(res));});}
async function digestTree(root){
 const hash=createHash('sha256');
 async function walk(dir){for(const e of(await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const p=join(dir,e.name);if(e.isSymbolicLink())throw Error('Snapshot symlinks are not allowed');if(e.isDirectory())await walk(p);else if(e.isFile()){hash.update(relative(root,p));hash.update(await readFile(p));}}}
 await walk(root);return hash.digest('hex');
}
async function jsonFetch(url,options={}){const r=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(120000)});const body=await r.json();if(!r.ok||(body.code!==undefined&&body.code!==0))throw Error(`HTTP ${r.status}: ${body.msg??body.error??'request failed'}`);return body.data??body;}
function wrapperSource(envId,secret,managerUrl){return `import application from ${JSON.stringify(join(codeRoot,'api/src/index.ts'))};
export default {async fetch(request,env,ctx){const url=new URL(request.url);if(url.pathname==='/__lifecycle/inspect'){
 if(request.headers.get('Authorization')!==${JSON.stringify('Bearer '+secret)})return new Response('Forbidden',{status:403});
 const query=async(sql)=>(await env.DB.prepare(sql).first()).n;
 const uploads=await env.FILES.list({prefix:'uploads/',limit:1});
 const nonce=crypto.randomUUID(),key='lifecycle-probe/'+nonce;await env.FILES.put(key,nonce);const object=await env.FILES.get(key),r2Verified=(await object?.text())===nonce;await env.FILES.delete(key);
 return Response.json({envId:${JSON.stringify(envId)},providers:await query('SELECT count(*) n FROM service_provider'),workOrders:await query('SELECT count(*) n FROM installation_work_order'),workItems:await query('SELECT count(*) n FROM work_item'),jobs:await query('SELECT count(*) n FROM background_job'),uploads:await query("SELECT count(*) n FROM source_material WHERE source_system='LOCAL_UPLOAD'"),r2Uploads:uploads.objects.length,r2Verified});}
 if(url.pathname.endsWith('/internal/job-claims')||(url.pathname==='/api/admin/charging/uploads'&&request.method==='POST')){try{const status=await(await fetch(${JSON.stringify(managerUrl)}+'/lifecycle/status',{signal:AbortSignal.timeout(2000)})).json();if(!status.environments?.some(e=>e.envId===${JSON.stringify(envId)}&&e.status==='ACTIVE'))return Response.json({code:40901,msg:'Environment is paused; new task claims and uploads are refused',data:null},{status:409});}catch{return Response.json({code:50301,msg:'Lifecycle state unavailable; new task claims and uploads are refused',data:null},{status:503});}}
 return application.fetch(request,env,ctx);}};\n`;}

export class LocalLifecycle{
 constructor(){this.root=join(mocksRoot,'.data/lifecycle-managed');this.registry=new LifecycleRegistry(this.root);this.processes=new Map();this.busy=false;this.closing=false;this.abort=new AbortController();}
 async initialize(){await mkdir(this.root,{recursive:true,mode:0o700});this.lock=join(this.root,'manager.lock');await mkdir(this.lock);try{await writeFile(join(this.lock,'owner.json'),JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));await this.registry.load();}catch(e){await rm(this.lock,{recursive:true,force:true});throw e;}return this;}
 entry(id){return this.registry.get(id);}
 directory(id){return join(this.root,this.entry(id).envId);}
 publicEntry(e){const{serviceToken,inspectionSecret,...safe}=e;return safe;}
 status(){return {protocol:PROTOCOL,ready:true,activeEnvId:this.registry.state.activeEnvId,busy:this.busy,environments:Object.values(this.registry.state.environments).map(e=>this.publicEntry(e))};}
 async command(id,args){if(this.closing)throw Error('Lifecycle manager is shutting down');const dir=this.directory(id),log=join(dir,'tasks',`command-${randomUUID()}.log`);try{const r=await exec(process.execPath,args,{cwd:dir,env:childEnv(),maxBuffer:16*1024*1024,timeout:240000,signal:this.abort.signal});await writeFile(log,r.stdout+'\n'+r.stderr,{mode:0o600});return r;}catch(e){await writeFile(log,(e.stdout??'')+'\n'+(e.stderr??'')+'\n'+e.message,{mode:0o600});throw Error(`Lifecycle command failed; inspect ${log}`);}}
 async launch(id,kind,args,cwd,extraEnv={}){const dir=this.directory(id),file=await open(join(dir,'tasks',kind+'.log'),'a',0o600);const child=spawn(process.execPath,args,{cwd,env:{...childEnv(),...(this.baseUrl?{APP_LIFECYCLE_BASE_URL:this.baseUrl}:{}),...extraEnv},stdio:['ignore',file.fd,file.fd],detached:true});await file.close();const key=id+':'+kind;this.processes.set(key,child);child.on('error',()=>{});child.once('exit',()=>{if(this.processes.get(key)===child)this.processes.delete(key);});return child;}
 async wait(url,child){for(let n=0;n<160;n++){if(this.closing)throw Error('Lifecycle manager is shutting down');if(child.exitCode!==null)throw Error('Owned process exited before readiness; see environment tasks log');try{const r=await fetch(url,{signal:AbortSignal.timeout(800)});if(r.ok)return;}catch{}await delay(250);}throw Error('Owned process readiness timeout');}
 async startProcesses(id){const e=this.entry(id),dir=this.directory(id);await free(e.mockPort);await free(e.workerPort);const mock=await this.launch(id,'mock',[join(mocksRoot,'src/server.ts'),'--env',relative(mocksRoot,join(dir,'environment.json'))],mocksRoot);await this.wait(e.mockUrl+'/environment',mock);const worker=await this.launch(id,'worker',[wrangler,'dev','--config',join(dir,'wrangler.json'),'--local','--ip','127.0.0.1','--port',String(e.workerPort),'--inspector-port','0','--persist-to',join(dir,'app-state')],dir);await this.wait(e.workerUrl+'/api/health',worker);}
 async inspect(id){const e=this.entry(id);const result=await jsonFetch(e.workerUrl+'/__lifecycle/inspect',{headers:{authorization:'Bearer '+e.inspectionSecret}});if(result.envId!==id||result.r2Verified!==true)throw Error('Actual D1/R2 environment verification failed');return result;}
 async stop(id){for(const kind of ['runner','worker','mock']){const key=id+':'+kind,child=this.processes.get(key);if(!child)continue;try{process.kill(-child.pid,'SIGTERM');}catch(e){if(e.code!=='ESRCH')throw e;}for(let n=0;n<40&&this.processes.has(key);n++)await delay(100);if(this.processes.has(key)){try{process.kill(-child.pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')throw e;}this.processes.delete(key);}}
 }
 async provision({envId,templateEnvId,dataset='quick'}){
  if(!['quick','standard'].includes(dataset))throw Error('Only existing reviewed generator datasets are accepted');
  let template=null;if(templateEnvId){template=this.entry(templateEnvId);if(!['ACTIVE','VERIFIED','PAUSED'].includes(template.status))throw Error('Template environment must be running and verified');const probe=await this.inspect(templateEnvId);if(template.containsUploads||probe.uploads||probe.r2Uploads)throw Error('Contains actual uploads; preserve this environment and create an independent new environment');if(await digestTree(join(this.directory(templateEnvId),'initial'))!==template.initialDigest)throw Error('Frozen initial snapshot has changed');dataset=template.dataset;}
  const e=await this.registry.reserve(envId,{dataset,templateEnvId:templateEnvId??null,generation:(template?.generation??0)+1,containsUploads:false,serviceToken:'life-'+randomUUID(),inspectionSecret:randomUUID(),mockPort:await port(),workerPort:await port()});
  const dir=this.directory(envId);await mkdir(join(dir,'tasks'));await this.registry.update(envId,{storageRoot:relative(mocksRoot,dir),mockUrl:`http://127.0.0.1:${e.mockPort}`,workerUrl:`http://127.0.0.1:${e.workerPort}`});
  try{
   const config=JSON.parse(await readFile(join(mocksRoot,'generator/configs',dataset+'.json'),'utf8'));
   await atomicJson(join(dir,'environment.json'),{envId,port:e.mockPort,dataset:config.datasetId,storageRoot:relative(mocksRoot,dir),appEnvRef:envId});
   if(template){for(const sub of ['sources','files','delivery'])await cp(join(this.directory(templateEnvId),'initial',sub),join(dir,sub),{recursive:true,errorOnExist:true,force:false});}
   else{const manifest=relative(mocksRoot,join(dir,'environment.json'));for(const script of ['generate.ts','generate-files.ts'])await this.command(envId,[join(mocksRoot,'generator',script),'--env',manifest,'--config',`generator/configs/${dataset}.json`]);}
   await mkdir(join(dir,'initial'));for(const sub of ['sources','files','delivery'])await cp(join(dir,sub),join(dir,'initial',sub),{recursive:true});
   const initialDigest=await digestTree(join(dir,'initial'));if(template&&initialDigest!==template.initialDigest)throw Error('Restored source/files initial digest does not match template');
   const manifest=JSON.parse(await readFile(join(dir,'delivery',config.datasetId,'data-manifest.json'),'utf8'));
   await this.registry.update(envId,{initialDigest,expectedProviders:manifest.totals.providers,expectedOrders:manifest.totals.workOrders});
   await writeFile(join(dir,'worker.ts'),wrapperSource(envId,e.inspectionSecret,this.baseUrl),{mode:0o600});
   const workerConfig={name:'life-'+envId,main:join(dir,'worker.ts'),compatibility_date:'2026-09-20',compatibility_flags:['nodejs_compat'],d1_databases:[{binding:'DB',database_name:'life-'+envId,database_id:randomUUID()}],r2_buckets:[{binding:'FILES',bucket_name:'life-'+envId}],vars:{EXTERNAL_MODE:'mock',AI_MODE:'mock',MOCK_BASE_URL:e.mockUrl,MOCK_ACCOUNT_ID:'acc-svc-backend',DEV_IDENTITY_TOKENS:JSON.stringify({[e.serviceToken]:'acc-svc-backend'})}};
   await atomicJson(join(dir,'wrangler.json'),workerConfig);
   const migrations=(await readdir(join(codeRoot,'db/migrations'))).filter(f=>f.endsWith('.sql')).sort();
   for(const migration of migrations)await this.command(envId,[wrangler,'d1','execute','DB','--config',join(dir,'wrangler.json'),'--local','--persist-to',join(dir,'app-state'),'--file',join(codeRoot,'db/migrations',migration)]);
   await this.startProcesses(envId);const empty=await this.inspect(envId);if(empty.providers||empty.workOrders||empty.workItems||empty.jobs||empty.uploads||empty.r2Uploads)throw Error('New application environment is not empty');
   const session=await jsonFetch(e.mockUrl+'/api/admin/mock/external/identity/sessions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId:'acc-svc-backend'})});
   const context=await jsonFetch(e.mockUrl+'/api/admin/mock/external/identity/current-context',{headers:{authorization:'Bearer '+session.token}});await atomicJson(join(dir,'identity-evidence.json'),context);
   await writeFile(join(dir,'identity-bootstrap.sql'),identityBootstrapSql(context,envId),{mode:0o600});
   await this.command(envId,[wrangler,'d1','execute','DB','--config',join(dir,'wrangler.json'),'--local','--persist-to',join(dir,'app-state'),'--file',join(dir,'identity-bootstrap.sql')]);
   await this.registry.update(envId,{status:'PROVISIONED',emptyEvidence:empty});return this.publicEntry(this.entry(envId));
  }catch(error){await this.stop(envId);await this.registry.update(envId,{status:'FAILED',error:error.message});throw error;}
 }
 async verifyImport({envId}){const e=this.entry(envId);if(e.status!=='PROVISIONED')throw Error('Only a newly provisioned environment can be imported');await this.registry.update(envId,{status:'IMPORTING'});
  try{const report=await runSourceImport({baseUrl:e.workerUrl,token:e.serviceToken,reportPath:join(this.directory(envId),'tasks/import-report.json'),expectedProviders:e.expectedProviders,expectedOrders:e.expectedOrders,fetchImpl:(url,init)=>fetch(url,{...init,signal:AbortSignal.any([init.signal,this.abort.signal])})});if(this.closing)throw Error('Lifecycle manager is shutting down');const actual=await this.inspect(envId);
   if(report.status!=='SCOPED_COMPLETE'||!report.baselineCoverageVerified||actual.providers!==e.expectedProviders||actual.workOrders!==e.expectedOrders)throw Error('Actual HTTP import failed completeness/count verification; see tasks/import-report.json');
   const evidence={status:report.status,actual,initialDigest:e.initialDigest,finishedAt:report.finishedAt};await atomicJson(join(this.directory(envId),'tasks/verification.json'),evidence);await this.registry.update(envId,{status:'VERIFIED',verification:evidence});return evidence;
  }catch(error){await this.registry.update(envId,{status:'FAILED',error:error.message});await this.stop(envId);throw error;}
 }
 async activate({envId}){this.registry.assertVerified(envId);await this.inspect(envId);const prior=this.registry.state.activeEnvId;if(prior&&prior!==envId)await this.pause({envId:prior});await this.registry.activate(envId);return this.publicEntry(this.entry(envId));}
 async pause({envId}){const e=this.entry(envId);const child=this.processes.get(envId+':runner');if(child){try{process.kill(-child.pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')throw error;}for(let n=0;n<50&&this.processes.has(envId+':runner');n++)await delay(100);if(this.processes.has(envId+':runner'))throw Error('Task process has not paused; no environment switch');}if(!['ACTIVE','VERIFIED','PAUSED'].includes(e.status))throw Error('Environment is not running');await this.registry.update(envId,{status:'PAUSED'});return this.publicEntry(e);}
 async runOnce({envId}){const e=this.entry(envId);if(e.status!=='ACTIVE'||this.registry.state.activeEnvId!==envId)throw Error('Tasks may start only in the active environment');const taskDir=join(this.directory(envId),'tasks');const child=await this.launch(envId,'runner',[join(codeRoot,'task-runner/runner.mjs'),'--once'],taskDir,{WORKER_BASE_URL:e.workerUrl,SERVICE_TOKEN:e.serviceToken,RUNS_ROOT:join(taskDir,'runs')});const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});if(result.code!==0)throw Error('Actual task process failed; see tasks/runner.log');return {envId,workerUrl:e.workerUrl,taskDir,...result};}
 async resume({envId}){const e=this.entry(envId);if(e.status==='PAUSED'){await this.registry.update(envId,{status:'VERIFIED'});return this.publicEntry(e);}if(e.status!=='STOPPED')throw Error('Only stopped or paused environments can resume');await writeFile(join(this.directory(envId),'worker.ts'),wrapperSource(envId,e.inspectionSecret,this.baseUrl),{mode:0o600});await this.startProcesses(envId);await this.inspect(envId);await this.registry.update(envId,{status:e.resumeStatus==='PROVISIONED'?'PROVISIONED':'VERIFIED'});return this.publicEntry(e);}
 async restore({envId,templateEnvId}){const template=this.entry(templateEnvId),wasActive=this.registry.state.activeEnvId===templateEnvId;
  const check=await this.inspect(templateEnvId);if(template.containsUploads||check.uploads||check.r2Uploads)throw Error('Contains actual uploads; restore refused and original preserved');
  await this.pause({envId:templateEnvId});try{await this.provision({envId,templateEnvId});await this.verifyImport({envId});return await this.activate({envId});}catch(e){if(template.status==='PAUSED'){await this.resume({envId:templateEnvId});if(wasActive)await this.activate({envId:templateEnvId});}throw e;}
 }
 async close(){this.closing=true;this.abort.abort();for(const id of Object.keys(this.registry.state.environments))await this.stop(id);for(let n=0;n<100&&this.busy;n++)await delay(100);if(this.busy)throw Error('Interrupted operation still running; ownership lock retained');await this.registry.save();await rm(this.lock,{recursive:true,force:true});}
}
