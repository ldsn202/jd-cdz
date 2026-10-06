#!/usr/bin/env node
// Real HTTP engineering verification against a separately started local manager.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const options=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,list)=>v.startsWith('--')?[...a,[v.slice(2),list[i+1]]]:a,[]));
const base=options.base??'http://127.0.0.1:18980',envId=options.env,restoreTo=options['restore-to'];
if(!envId||!restoreTo)throw Error('--env <verified environment> --restore-to <new id> required');
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Local verification only');
const root=join(dirname(fileURLToPath(import.meta.url)),'../mocks/.data/lifecycle-managed');
const entry=async id=>JSON.parse(await readFile(join(root,'registry.json'),'utf8')).environments[id];
async function request(url,body,token){const response=await fetch(url,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(600000)});return {status:response.status,body:await response.json()};}
async function ok(url,body,token){const r=await request(url,body,token);assert.ok(r.status>=200&&r.status<300,`${new URL(url).pathname}: HTTP ${r.status}: ${r.body.msg??r.body.error??''}`);assert.ok(r.body.ok===true||r.body.code===0);return r.body.data;}
const checks=[],report={startedAt:new Date().toISOString(),envId,restoreTo,checks};
function check(name,data){checks.push({name,passed:true,data});console.log(name);}
await ok(base+'/lifecycle/activate',{envId});let old=await entry(envId);
assert.equal(old.verification.actual.workOrders,old.expectedOrders);check('restart retained verified D1 counts',{providers:old.verification.actual.providers,orders:old.verification.actual.workOrders});
await ok(base+'/lifecycle/run-once',{envId});check('actual runner exits in owned task space',{});
const api=old.workerUrl+'/api/admin/charging/internal';
const scope=await ok(api+'/source-import/scope',null,old.serviceToken);
const feed=await ok(api+'/source-monitor/initialize',{serviceProviderId:scope.serviceProviderIds[0],sourceSystem:'installation-admin'},old.serviceToken);
await ok(api+'/source-monitor/poll',{feedId:feed.feedId},old.serviceToken);
const claims=await ok(api+'/job-claims',{purposes:['DISCOVER_RELATIONS'],limit:1},old.serviceToken);assert.equal(claims.claims.length,1);const claim=claims.claims[0];
check('old environment has an actual in-flight leased task',{jobId:claim.jobId,attemptId:claim.attemptId});
const mockSession=await ok(old.mockUrl+'/api/admin/mock/external/identity/sessions',{accountId:'acc-svc-backend'});
const restored=await ok(old.mockUrl+'/api/admin/mock/control/environments/restore',{templateEnvId:envId,newEnvId:restoreTo},mockSession.token);
assert.equal(restored.status,'ACTIVE');const next=await entry(restoreTo),paused=await entry(envId);
assert.equal(paused.status,'PAUSED');assert.notEqual(old.workerUrl,next.workerUrl);assert.notEqual(old.serviceToken,next.serviceToken);assert.equal(next.initialDigest,old.initialDigest);assert.equal(next.verification.actual.workOrders,next.expectedOrders);assert.equal(next.verification.actual.jobs,0);
check('paired restore reimports source snapshot to a distinct D1/R2/task environment',{initialDigest:next.initialDigest,workerUrl:next.workerUrl,providers:next.verification.actual.providers,orders:next.verification.actual.workOrders});
const denied=await request(api+'/job-claims',{purposes:['DISCOVER_RELATIONS'],limit:1},old.serviceToken);assert.equal(denied.status,409);check('paused old environment rejects new task claims',{http:denied.status});
const late=await request(base+`/api/admin/charging/internal/job-attempts/${claim.attemptId}/result`,{leaseToken:claim.leaseToken,leaseEpoch:claim.leaseEpoch,status:'FAILED',errorCode:'LIFECYCLE_OLD_RESULT'},old.serviceToken);assert.equal(late.status,401);check('old lease and credential cannot write switched entry',{http:late.status});
if(options['failed-env']){const forbidden=await request(base+'/lifecycle/activate',{envId:options['failed-env']});assert.equal(forbidden.status,409);check('failed partial environment cannot activate',{http:forbidden.status});}
report.finishedAt=new Date().toISOString();report.passed=true;await writeFile(options.report??join(root,restoreTo,'tasks/lifecycle-verification.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({passed:true,checks:checks.length,envId,restoreTo}));
