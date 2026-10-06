// Formal single-case driver for TC-INS-09 only; setup/query/cleanup remain separate steps.
import {readFile,writeFile} from 'node:fs/promises';
import {parseMaterialBytes} from './material-parser.mjs';
import assert from 'node:assert/strict';
const root=process.env.API_BASE_URL,dir=process.env.CASE_EVIDENCE_DIR;
if(!root||!dir)throw Error('API_BASE_URL and CASE_EVIDENCE_DIR required');
const evidence={startedAt:new Date().toISOString()};
async function request(path,body,token){return fetch(root+'/api/admin/charging'+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body instanceof FormData?{}:{'Content-Type':'application/json'}),'Idempotency-Key':'ik-tc-ins-09'},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});}
async function json(path,body,token){const r=await request(path,body,token);const b=await r.json();assert.equal(b.code,0,b.msg);return {http:r.status,body:b};}
try{
 const bytes=await readFile(dir+'/tc-ins-补充明细.xlsx');const form=new FormData();
 form.set('file',new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'tc-ins-补充明细.xlsx');
 for(const[k,v]of Object.entries({providerId:'sp-tc-ins-anjia',purpose:'INSTALLATION_MATERIAL',workItemId:'wi-tc-ins-prep-1',expectedWorkItemVersion:'6'}))form.set(k,v);
 evidence.upload=await json('/uploads',form,process.env.CLERK_TOKEN);
 assert.equal(evidence.upload.http,202);const up=evidence.upload.body.data;assert.equal(up.status,'RECEIVED');
 const claims=(await json('/internal/job-claims',{purposes:['PARSE_MATERIAL'],limit:10},process.env.SERVICE_TOKEN)).body.data.claims;
 const claim=claims.find(c=>c.jobId===up.jobId);assert.ok(claim,'new upload task claim');
 const lease={leaseToken:claim.leaseToken,leaseEpoch:claim.leaseEpoch};
 await json(`/internal/job-attempts/${claim.attemptId}/dispatch-start`,lease,process.env.SERVICE_TOKEN);
 const r=await request(`/internal/job-attempts/${claim.attemptId}/material-content`,lease,process.env.SERVICE_TOKEN);assert.equal(r.status,200);
 const downloaded=Buffer.from(await r.arrayBuffer());assert.deepEqual(downloaded,bytes);
 const parsed=await parseMaterialBytes(downloaded,claim.target);assert.equal(parsed.parsing.completeness,'COMPLETE');
 evidence.parsing=parsed; // No token or lease is written to report.
 evidence.adoption=await json(`/internal/job-attempts/${claim.attemptId}/results`,{...lease,status:'SUCCEEDED',dispatchState:'RESPONSE_RECEIVED',result:parsed},process.env.SERVICE_TOKEN);
 evidence.status=await json(`/uploads/${up.uploadId}`,null,process.env.CLERK_TOKEN);assert.equal(evidence.status.body.data.status,'READY');
 evidence.item=await json('/work-items/wi-tc-ins-prep-1',null,process.env.CLERK_TOKEN);assert.equal(evidence.item.body.data.analysisGeneration,2);
 evidence.passed=true;
}catch(error){evidence.passed=false;evidence.error=error.message;process.exitCode=1;}
evidence.finishedAt=new Date().toISOString();await writeFile(dir+'/http-and-parser.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({passed:evidence.passed,error:evidence.error,upload:evidence.upload?.body?.data,status:evidence.status?.body?.data?.status}));
