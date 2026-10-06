// Run explicitly against the local demo after restoring its baseline.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {api,detail,versions,select,upload,analyze,operation} from './demo-e2e.mjs';
if(process.argv[2]!=='run')throw Error('Pass run explicitly; this script is never invoked at startup.');
const i=await select('SP-008','INSTALLATION_REVIEW','WO-2609-0046'),id=i.workItemId;
let d=await analyze(id,'acc-jd-business');
assert.equal(d.analysis.status,'NEEDS_INFORMATION');
const requested=await api('/work-items/'+id+'/review-decisions','acc-jd-business',{...versions(d),analysisResultId:d.analysis.resultId,action:'REQUEST_SUPPLEMENT',questions:[{findingId:null,question:'请补充本工单各项目的实际施工记录。',requiredMaterialDescription:'逐项列出实际安装数量、单位、供料方与服务范围的施工记录'}],comment:'正式明细已取得，施工证据尚缺失'});
const requestResult=await operation(requested.operationId,'acc-jd-business');
d=await detail(id,'acc-sp-008');assert.equal(d.status,'WAITING_SUPPLEMENT');
const uploaded=await upload(id,'acc-sp-008','03-退回补充/SP-008-WO-2609-0046-补充施工记录.xlsx','INSTALLATION_MATERIAL');
d=await detail(id,'acc-sp-008');
const submitted=await api('/work-items/'+id+'/supplements','acc-sp-008',{...versions(d),requestDecisionId:d.activeSupplementRequest.requestDecisionId,replyText:'已补充本工单完整施工记录：电缆15米、入场搬运1次、基础施工1项、桥架43米，供料方和服务范围见附件。',materialVersionIds:[uploaded.materialVersionId]});
const replyResult=await operation(submitted.operationId,'acc-sp-008');
d=await analyze(id,'acc-jd-business');assert.equal(d.analysis.status,'ANALYZED',JSON.stringify(d.analysis));
const approved=await api('/work-items/'+id+'/review-decisions','acc-jd-business',{...versions(d),analysisResultId:d.analysis.resultId,action:'APPROVE',questions:[],comment:'已核对补充记录与正式明细、方案，施工项目和数量一致'});
const approvalResult=await operation(approved.operationId,'acc-jd-business');
await writeFile(new URL('../.local/demo-acceptance/supplement-complete.json',import.meta.url),JSON.stringify({id,requested,requestResult,uploaded,submitted,replyResult,analysis:d.analysis,approved,approvalResult},null,2));
console.log(JSON.stringify({id,request:requestResult.status,reply:replyResult.status,analysis:d.analysis.status,approval:approvalResult.status}));

