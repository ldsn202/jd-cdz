#!/usr/bin/env node
// Read source records only via the authenticated Worker -> external HTTP chain.
import {writeFile,rename,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function runSourceImport({baseUrl,token,reportPath,fetchImpl=fetch,expectedProviders,expectedOrders,maxPages=10000,onProgress=()=>{}}) {
 if(!baseUrl||!token||!reportPath)throw new Error('baseUrl、SERVICE token 与 reportPath 必填');
 const report={startedAt:new Date().toISOString(),status:'RUNNING',scopeIsGlobal:false,scope:null,feeds:[],issues:[],discoveredWorkOrderCount:0,persistedWorkOrderCount:0,persistedProviderCount:0,baselineCoverageVerified:false};
 const discovered=new Set(),persisted=new Set(),providers=new Set();
 async function save(){await mkdir(dirname(reportPath),{recursive:true});await writeFile(`${reportPath}.tmp`,JSON.stringify(report,null,2)+'\n',{mode:0o600});await rename(`${reportPath}.tmp`,reportPath);}
 async function call(suffix,body){
  const response=await fetchImpl(`${baseUrl.replace(/\/$/,'')}/api/admin/charging/internal/source-import/${suffix}`,{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(120000)});
  const json=await response.json();if(!response.ok||json.code!==0)throw new Error(`${suffix}: HTTP ${response.status} / ${json.code}: ${json.msg??'请求失败'}`);return json.data;
 }
 await save();
 try{
  report.scope=await call('scope');
  const scope=report.scope;
  if(!Array.isArray(scope.serviceProviderIds)||!scope.serviceProviderIds.length)throw new Error('没有双方均授权的服务商，未导入');
  if(expectedProviders!==undefined&&scope.serviceProviderIds.length!==expectedProviders)report.issues.push(`授权服务商数 ${scope.serviceProviderIds.length} 与期望 ${expectedProviders} 不一致`);
  for(const providerId of scope.serviceProviderIds){
   const feed={serviceProviderId:providerId,receipt:null,pages:[],complete:false,baselineChangeCount:0,issues:[]};report.feeds.push(feed);
   try{
    feed.receipt=await call('feeds',{serviceProviderId:providerId});await save();
    let cursor=feed.receipt.startCursor;const cursors=new Set(),changes=new Set();
    for(let n=0;n<maxPages;n++){
     if(cursors.has(cursor))throw new Error('来源读取位置重复，停止循环');cursors.add(cursor);
     const page=await call('pages',{serviceProviderId:providerId,feedId:feed.receipt.feedId,cursor});
     if(page.cursor!==cursor||page.changeCount!==page.changeIds?.length)throw new Error('来源页位置或数量不一致');
     feed.pages.push(page);
     for(const id of page.changeIds){if(changes.has(id))throw new Error('变化身份重复，无法证明完整覆盖');changes.add(id);if(id.startsWith(`chg-base-${feed.receipt.feedId}-`))feed.baselineChangeCount++;}
     for(const item of page.results){
      const key=JSON.stringify([item.sourceSystem,item.sourceRecordId]);discovered.add(key);
      if(item.status==='IMPORTED'||item.status==='UNCHANGED'){persisted.add(key);providers.add(item.serviceProviderId);}
      else feed.issues.push(`${item.sourceRecordId}: ${item.message??item.status}`);
     }
     report.discoveredWorkOrderCount=discovered.size;report.persistedWorkOrderCount=persisted.size;report.persistedProviderCount=providers.size;
     onProgress({serviceProviderId:providerId,providerIndex:report.feeds.length,providerCount:scope.serviceProviderIds.length,discovered:discovered.size,persisted:persisted.size});
     await save();
     if(!page.hasMore){feed.complete=true;break;}
     if(page.nextCursor===cursor)throw new Error('来源 hasMore=true 但读取位置未前进');cursor=page.nextCursor;
    }
    if(!feed.complete)feed.issues.push('页数达到上限，尚未覆盖完来源');
    if(feed.baselineChangeCount!==feed.receipt.baselineCount)feed.issues.push(`基线覆盖 ${feed.baselineChangeCount}/${feed.receipt.baselineCount}`);
   }catch(e){feed.issues.push(e.message);}
   report.issues.push(...feed.issues.map(issue=>`${providerId}: ${issue}`));await save();
  }
  report.baselineCoverageVerified=report.feeds.length===scope.serviceProviderIds.length&&report.feeds.every(f=>f.complete&&f.baselineChangeCount===f.receipt?.baselineCount);
  if(expectedOrders!==undefined&&discovered.size!==expectedOrders)report.issues.push(`发现工单数 ${discovered.size} 与期望 ${expectedOrders} 不一致`);
  if(discovered.size!==persisted.size)report.issues.push(`已发现 ${discovered.size} 工单，仅 ${persisted.size} 成功保存或核验相同`);
  if(providers.size!==scope.serviceProviderIds.length)report.issues.push(`授权 ${scope.serviceProviderIds.length} 服务商，仅 ${providers.size} 从工单证实并保存`);
  report.discoveredWorkOrders=[...discovered].sort().map(JSON.parse);report.persistedWorkOrders=[...persisted].sort().map(JSON.parse);
  report.status=report.baselineCoverageVerified&&!report.issues.length?'SCOPED_COMPLETE':'INCOMPLETE';
 }catch(e){report.issues.push(e.message);report.status='INCOMPLETE';}
 report.finishedAt=new Date().toISOString();await save();return report;
}
function option(name){const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.argv.includes('--help'))console.log('SERVICE_TOKEN=... API_BASE_URL=http://localhost:8787 node code/task-runner/source-import.mjs --report /tmp/source-import.json [--expect-providers 100 --expect-orders 1000]\n只证明授权范围；来源字段缺失与版本冲突保留在报告，不创建事项或分析。');
 else{
  const expected=name=>{const raw=option(name);if(raw===undefined)return undefined;const n=Number(raw);if(!Number.isSafeInteger(n)||n<0)throw new Error(`${name} 必须为非负整数`);return n;};
  try{
   const report=await runSourceImport({baseUrl:process.env.API_BASE_URL,token:process.env.SERVICE_TOKEN,reportPath:resolve(option('--report')??'source-import-report.json'),expectedProviders:expected('--expect-providers'),expectedOrders:expected('--expect-orders'),onProgress:p=>{if(p.providerIndex%10===0)console.error(`已处理服务商 ${p.providerIndex}/${p.providerCount}，已保存工单 ${p.persisted}`);}});
   console.log(JSON.stringify({status:report.status,scopeIsGlobal:false,discoveredWorkOrders:report.discoveredWorkOrderCount,persistedWorkOrders:report.persistedWorkOrderCount,persistedProviders:report.persistedProviderCount,baselineCoverageVerified:report.baselineCoverageVerified,issueCount:report.issues.length,report:resolve(option('--report')??'source-import-report.json')},null,2));
   process.exitCode=report.status==='SCOPED_COMPLETE'?0:1;
  }catch(e){console.error(e.message);process.exitCode=1;}
 }
}
