import {Hono} from 'hono';
import type {Bindings,Variables} from '../index';
import {localAccountSwitching} from '../services/local-accounts';
import {readableProviderIds} from '../services/work-item-query';
import {ok,fail,newRequestId} from '../lib/contract';
const routes=new Hono<{Bindings:Bindings;Variables:Variables}>();
const cases=[
 ['SP-001','WO-2609-0001','Excel 映射、启用后复用','先完成映射配置，再处理安装资料，提交后切到京东核查。'],
 ['SP-002','WO-2609-0089','计费数量差异','入场搬运计费数量不一致；对照验收与合同，发起核实并由服务商回复。'],
 ['SP-003','WO-2609-0002','PDF 施工记录提取','核对 PDF 文字，运行分析，确认明细并提交。'],
 ['SP-004','WO-2609-0003','图片施工记录提取','逐页核对图片识别文字，运行分析并提交。'],
 ['SP-005','WO-2609-0051','金额一致，由程序核对','运行后直接展示核对一致；不调用 AI。'],
 ['SP-006','WO-2609-0036','安装数量与方案有差异','京东检查施工事实和变更依据，可要求服务商补充。'],
 ['SP-007','WO-2609-0004','另一种图片格式','使用 JPEG / PNG 原文件核对文字，保留真实识别结果。'],
 ['SP-008','WO-2609-0046','缺材料、退回、补充再核查','京东提出补充要求，服务商上传目录内施工记录并回复，京东再次运行分析。'],
 ['SP-009','WO-2609-0061','费用差异解释','查看实际差额、合同依据和需要核实的原记录。'],
 ['SP-010',null,'字段含义不明','映射明确指出缺少的字段含义；上传标准字段修正版后重新分析。'],
];
routes.get('/demo-cases',async c=>{
 const requestId=newRequestId();
 if(!localAccountSwitching(c.env,c.req.url))return fail(c,404,40404,'当前环境未开放演示案例',requestId);
 const ids=readableProviderIds(c.get('identity'));
 const list=[];
 for(const [providerId,workOrderId,title,instructions] of cases){
  if(!ids.includes(providerId!))continue;
  const provider=await c.env.DB.prepare('SELECT display_name FROM service_provider WHERE id=?').bind(providerId).first<{display_name:string}>();
  if(!provider)continue;
  const items=await c.env.DB.prepare(`SELECT w.id workItemId,w.item_kind kind,w.status,w.title,i.subject_id accountId
   FROM work_item w LEFT JOIN identity_reference i ON i.id=w.assignee_identity_id
   WHERE w.service_provider_id=? AND (w.installation_work_order_id=? OR w.item_kind='CONFIGURATION') ORDER BY w.item_kind,w.gmt_create`).bind(providerId,workOrderId).all();
  const kinds:Record<string,string[]>={
   'SP-001':['CONFIGURATION','INSTALLATION_PREPARATION','INSTALLATION_REVIEW'],
   'SP-002':['RECONCILIATION'],'SP-003':['INSTALLATION_PREPARATION','INSTALLATION_REVIEW'],
   'SP-004':['INSTALLATION_PREPARATION','INSTALLATION_REVIEW'],'SP-005':['RECONCILIATION'],
   'SP-006':['INSTALLATION_REVIEW'],'SP-007':['INSTALLATION_PREPARATION','INSTALLATION_REVIEW'],
   'SP-008':['INSTALLATION_REVIEW'],'SP-009':['RECONCILIATION'],'SP-010':['CONFIGURATION'],
  };
  list.push({providerId,providerName:provider.display_name,workOrderId,title,instructions,items:items.results.filter(i=>kinds[providerId!]?.includes(String(i.kind)))});
 }
 return ok(c,{list,uploadDirectory:'测试用上传数据',manualAnalysis:true},requestId);
});
export default routes;
