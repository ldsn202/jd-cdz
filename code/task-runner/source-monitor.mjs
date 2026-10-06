#!/usr/bin/env node
// Source HTTP -> guarded change batches. No source SQLite or business SQL access.
const base=process.env.API_BASE_URL??process.env.WORKER_BASE_URL??'http://127.0.0.1:8788';
const token=process.env.SERVICE_TOKEN;if(!token)throw Error('SERVICE_TOKEN required');
async function api(path,body){const response=await fetch(base+'/api/admin/charging/internal'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});const r=await response.json();if(!response.ok||r.code!==0)throw Error(`${r.code}: ${r.msg}`);return r.data;}
async function once(){
 await api('/source-import/providers',{});
 const scope=await api('/source-import/scope');let batches=0,jobs=0;
 for(const serviceProviderId of scope.serviceProviderIds)for(const sourceSystem of (process.env.SOURCE_SYSTEMS??'installation-admin,provider-docs,jd-billing,provider-receivable,billing-terms,order-entitlement').split(',')){
  const feed=await api('/source-monitor/initialize',{serviceProviderId,sourceSystem});
  let ended=false;for(let page=0;page<10000;page++){
   const result=await api('/source-monitor/poll',{feedId:feed.feedId});batches+=result.batchId?1:0;jobs+=result.jobIds.length;
   if(!result.hasMore){ended=true;break;}
  }
  if(!ended)throw Error('来源页数超出上限，监测尚未完成');
 }
 console.log(JSON.stringify({providers:scope.serviceProviderIds.length,batches,jobs,checkedAt:new Date().toISOString()}));
}
if(process.argv.includes('--loop')){for(;;){try{await once();}catch(e){console.error(e.message);}await new Promise(r=>setTimeout(r,Number(process.env.SOURCE_POLL_INTERVAL_MS??30000)));}}
else await once();
