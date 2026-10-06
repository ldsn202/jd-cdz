// Explicit, bounded acceptance commands. Never called by startup or a background worker.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../..',import.meta.url)),base='http://127.0.0.1:8788/api/admin/charging';
const out=join(root,'code/.local/demo-acceptance');await mkdir(out,{recursive:true});
export async function api(path,account='acc-jd-business',body,method='POST'){
 const r=await fetch(base+path,{method:body===undefined?'GET':method,headers:{authorization:'Bearer local-'+account,'Idempotency-Key':crypto.randomUUID(),...(body instanceof FormData?{}:{'content-type':'application/json'})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});
 const j=await r.json();if(!r.ok||j.code!==0)throw Error(path+': '+r.status+' '+j.msg);return j.data;
}
export const detail=(id,account)=>api('/work-items/'+id,account);
export const versions=i=>({expectedWorkItemVersion:i.rowVersion,expectedResponsibilityVersion:i.responsibilityVersion});
export async function waitFor(label,read,ready,timeout=720000){
 const started=Date.now();let tick=0;
 while(Date.now()-started<timeout){const value=await read();if(ready(value))return value;if(++tick%10===0)console.log(label+' '+Math.round((Date.now()-started)/1000)+'s');await new Promise(r=>setTimeout(r,2000));}
 throw Error(label+' timeout');
}
export async function select(provider,kind,order){
 const v=await api('/work-items?responsibility=VISIBLE&pageSize=50&providerId='+provider+'&kind='+kind+(order?'&workOrderId='+order:''));
 assert.equal(v.list.length,1,JSON.stringify(v.list.map(i=>[i.workItemId,i.title])));return v.list[0];
}
export async function upload(id,account,file,purpose){
 const item=await detail(id,account),form=new FormData(),bytes=await readFile(join(root,'测试用上传数据',file));
 const ext=file.split('.').pop(),mime={xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pdf:'application/pdf',png:'image/png',jpg:'image/jpeg'}[ext];
 form.set('file',new File([bytes],file.split('/').pop(),{type:mime}));form.set('providerId',item.providerId);form.set('workItemId',id);form.set('purpose',purpose);form.set('expectedWorkItemVersion',String(item.rowVersion));
 const result=await api('/uploads',account,form);
 await waitFor('parse upload',()=>api('/work-items/'+id+'/business-materials',account),v=>v.uploads.some(x=>x.materialVersionId===result.materialVersionId&&['SUCCEEDED','BLOCKED'].includes(x.parsingStatus)),120000);
 return result;
}
export async function trigger(id,account){
 const d=await detail(id,account);
 return api('/work-items/'+id+'/analysis',account,{expectedVersion:d.rowVersion});
}
export async function analyze(id,account){
 await trigger(id,account);
 const d=await waitFor('analysis '+id,()=>detail(id,account),d=>{
  if(d.analysisProgress?.state==='FAILED')throw Error(JSON.stringify(d.analysisProgress));
  return ['AVAILABLE','CHECKED','WAITING_MATERIALS'].includes(d.analysisProgress?.state);
 });
 await writeFile(join(out,id+'.json'),JSON.stringify(d,null,2));
 console.log(JSON.stringify({id,status:d.status,analysis:d.analysis?.status,progress:d.analysisProgress,summary:d.analysis?.summary}));
 return d;
}
export async function operation(id,account){
 return waitFor('operation '+id,()=>api('/operations/'+id,account),o=>{
  if(o.status==='REJECTED')throw Error(JSON.stringify(o));
  return o.status==='SUCCEEDED'&&['APPLIED','COMPLETED','SUCCEEDED','DONE'].includes(o.localContinuationStatus);
 },600000);
}
const [action,arg]=process.argv[1]===fileURLToPath(import.meta.url)?process.argv.slice(2):[];
if(action==='mapping'){
 const provider=arg??'SP-001',account='acc-sp-'+provider.slice(3),i=await select(provider,'CONFIGURATION');
 await upload(i.workItemId,account,'01-映射配置/'+provider+'-安装明细样表.xlsx','PROVIDER_FORMAT');
 const d=await analyze(i.workItemId,account);assert.equal(d.analysis?.status,'ANALYZED');
 const cfg=await waitFor('mapping trial',()=>api('/work-items/'+i.workItemId+'/configuration',account),v=>v.trial,60000);
 assert.equal(cfg.trial.status,'PASSED',JSON.stringify(cfg));assert.equal(cfg.candidateVersion.sourceFormatId,'FMT-'+provider.slice(3));
 const latest=await detail(i.workItemId,account);
 const enabled=await api('/work-items/'+i.workItemId+'/configuration-enablement',account,{...versions(latest),candidateVersionId:cfg.candidateVersion.versionId,trialId:cfg.trial.trialId,expectedConfigurationRowVersion:cfg.configurationRowVersion,expectedActiveVersionId:cfg.activeVersionId,comment:'已核对原表、字段含义和试转换结果'});
 await writeFile(join(out,provider+'-mapping-enablement.json'),JSON.stringify({cfg,enabled},null,2));console.log(JSON.stringify(enabled));
}else if(action==='analyze'){
 const [provider,order,kind]=arg.split(',');
 const i=await select(provider,kind,order),account=kind==='INSTALLATION_PREPARATION'?'acc-sp-'+provider.slice(3):'acc-jd-business';
 await analyze(i.workItemId,account);
}else if(action==='submit'){
 const [provider,order]=arg.split(','),account='acc-sp-'+provider.slice(3),i=await select(provider,'INSTALLATION_PREPARATION',order);
 const d=await detail(i.workItemId,account),draft=await api('/work-items/'+i.workItemId+'/installation-draft',account);
 assert.equal(d.analysis?.status,'ANALYZED');
 const accepted=await api('/work-items/'+i.workItemId+'/installation-submissions',account,{...versions(d),draftVersionId:draft.draftVersionId,analysisResultId:d.analysis.resultId,comment:'逐项核对原始施工记录，确认实际安装明细'});
 const result=await operation(accepted.operationId,account);
 await writeFile(join(out,order+'-submission.json'),JSON.stringify({draft,accepted,result},null,2));console.log(JSON.stringify(result));
}else if(action==='approve'){
 const [provider,order]=arg.split(','),i=await select(provider,'INSTALLATION_REVIEW',order),d=await detail(i.workItemId);
 const accepted=await api('/work-items/'+i.workItemId+'/review-decisions','acc-jd-business',{...versions(d),analysisResultId:d.analysis.resultId,action:'APPROVE',questions:[],comment:'已核实方案、正式明细与施工材料'});
 const result=await operation(accepted.operationId,'acc-jd-business');await writeFile(join(out,order+'-approval.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}else if(action&&action!=='lib')throw Error('Use mapping / analyze / submit / approve with explicit case. No bulk execution.');
