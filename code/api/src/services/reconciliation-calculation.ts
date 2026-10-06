import {addAmount,subtractAmount,compareAmount,normalizeAmount} from './money';
export type BillInput={id:string;record_type:string;source_version:string|null;data_json:string};
type Line={billItemId:string;itemName:string;installationWorkOrderId:string|null;chargeScope:string|null;billedQuantity:string|null;unit:string|null;unitPrice:string|null;amount:string|null};
type Bill={serviceProviderId:string;installationWorkOrderId:string;effectiveStatus:string;itemsComplete:boolean;completeness:string;missingParts:string[];currency:string|null;taxBasis:string;relatedWorkOrderIds:string[];reportedTotalAmount:string|null;targetWorkOrderAmount:string|null;items:Line[]};
function amount(value:unknown):value is string{try{return typeof value==='string'&&normalizeAmount(value)!=='';}catch{return false;}}
function productEquals(a:string,b:string,c:string){
 function parts(s:string){const negative=s.startsWith('-');const [x,y='']=s.replace(/^[-+]/,'').split('.');return {n:BigInt(x+y)*(negative?-1n:1n),scale:y.length};}
 const x=parts(a),y=parts(b),z=parts(c),scale=Math.max(x.scale+y.scale,z.scale);return x.n*y.n*10n**BigInt(scale-x.scale-y.scale)===z.n*10n**BigInt(scale-z.scale);
}
export function calculateReconciliation(inputs:BillInput[],wo:string,provider:string,complete:boolean,openQuestions:boolean){
 const selected=inputs.filter(r=>['JD_BILL','PROVIDER_RECEIVABLE'].includes(r.record_type));
 const bills=selected.map(input=>({input,data:JSON.parse(input.data_json) as Bill}));
 const openIssues:string[]=[];
 const checks={source_current:complete&&bills.length===2&&bills.every(b=>b.input.source_version!==null&&b.data.effectiveStatus==='EFFECTIVE'),scope_confirmed:bills.every(b=>b.data.serviceProviderId===provider&&b.data.installationWorkOrderId===wo&&b.data.relatedWorkOrderIds.length===1&&b.data.relatedWorkOrderIds[0]===wo&&b.data.items.every(l=>l.installationWorkOrderId===wo)),currency_tax_confirmed:false,items_complete:bills.length===2&&bills.every(b=>b.data.itemsComplete&&b.data.completeness==='COMPLETE'&&!b.data.missingParts.length&&b.data.items.length>0),mapping_confirmed:false,total_checks_passed:false,groups_balanced:false,issues_resolved:!openQuestions};
 const jd=bills.filter(b=>b.input.record_type==='JD_BILL'),pr=bills.filter(b=>b.input.record_type==='PROVIDER_RECEIVABLE');
 if(jd.length!==1||pr.length!==1)openIssues.push('需各一份明确有效的京东账单及服务商原应收，多版本或缺失尚未确定');
 const currency=bills[0]?.data.currency??null,taxBasis=bills[0]?.data.taxBasis??'UNKNOWN';
 checks.currency_tax_confirmed=!!currency&&taxBasis!=='UNKNOWN'&&bills.every(b=>b.data.currency===currency&&b.data.taxBasis===taxBasis);
 let totalsValid=bills.length===2;
 for(const {data} of bills){
  if(!amount(data.reportedTotalAmount)||!amount(data.targetWorkOrderAmount)||data.items.some(l=>!amount(l.amount)||!amount(l.billedQuantity)||!amount(l.unitPrice))){totalsValid=false;continue;}
  const sum=data.items.reduce((s,l)=>addAmount(s,l.amount!), '0');
  if(compareAmount(sum,data.reportedTotalAmount)!==0||compareAmount(sum,data.targetWorkOrderAmount)!==0||data.items.some(l=>!productEquals(l.billedQuantity!,l.unitPrice!,l.amount!)))totalsValid=false;
 }
 checks.total_checks_passed=totalsValid;
 const groups:{groupId:string;status:string;members:{inputItemId:string;billItemId:string}[];jdAmount:string|null;providerAmount:string|null;differenceAmount:string|null;mappingBasis:string;evidenceRefs:unknown[]}[]=[];
 const map=new Map<string,{input:BillInput;line:Line}[]>();let known=true;
 for(const {input,data} of bills){const ids=new Set<string>();for(const line of data.items){
  if(!line.billItemId||ids.has(line.billItemId)){known=false;continue;}ids.add(line.billItemId);
  if(!line.itemName||!line.chargeScope||!line.unit)known=false;
  const key=JSON.stringify([line.itemName,line.chargeScope,line.unit]);map.set(key,[...(map.get(key)??[]),{input,line}]);
 }}
 for(const [key,members] of map){
  const j=members.filter(m=>m.input.record_type==='JD_BILL'),p=members.filter(m=>m.input.record_type==='PROVIDER_RECEIVABLE');
  if(j.length!==1||p.length!==1)known=false;
  const ja=j.length===1&&amount(j[0].line.amount)?j[0].line.amount:null,pa=p.length===1&&amount(p[0].line.amount)?p[0].line.amount:null;
  const diff=checks.currency_tax_confirmed&&ja!==null&&pa!==null?subtractAmount(pa,ja):null;
  const sameQuantity=j.length===1&&p.length===1&&amount(j[0].line.billedQuantity)&&amount(p[0].line.billedQuantity)&&compareAmount(j[0].line.billedQuantity!,p[0].line.billedQuantity!)===0;
  const samePrice=j.length===1&&p.length===1&&amount(j[0].line.unitPrice)&&amount(p[0].line.unitPrice)&&compareAmount(j[0].line.unitPrice!,p[0].line.unitPrice!)===0;
  groups.push({groupId:`group-${groups.length+1}`,status:diff==='0'&&sameQuantity&&samePrice?'MATCHED':diff===null?'NEEDS_INFORMATION':'DIFFERENCE',members:members.map(m=>({inputItemId:m.input.id,billItemId:m.line.billItemId})),jdAmount:ja,providerAmount:pa,differenceAmount:diff,mappingBasis:`费用名称、明确收费范围与单位完全一致：${key}`,evidenceRefs:[]});
 }
 checks.mapping_confirmed=known&&groups.length>0;
 checks.groups_balanced=groups.length>0&&groups.every(g=>g.status==='MATCHED');
 const labels:Record<string,string>={source_current:'来源当前有效版本或固定输入完整性尚未确认',scope_confirmed:'账单范围不能完整归属本工单',currency_tax_confirmed:'币种或含税口径未一致确认',items_complete:'双方明细不完整',mapping_confirmed:'项目对应关系不明确，禁止按总额强行匹配',total_checks_passed:'行金额、数量单价乘积或账单汇总校验未通过',groups_balanced:'逐项金额、数量或单价存在差异',issues_resolved:'仍有未关闭的历史费用问题'};
 for(const [key,valid] of Object.entries(checks))if(!valid)openIssues.push(labels[key]);
 const jdAmount=jd.length===1&&amount(jd[0].data.targetWorkOrderAmount)?jd[0].data.targetWorkOrderAmount:null,providerAmount=pr.length===1&&amount(pr[0].data.targetWorkOrderAmount)?pr[0].data.targetWorkOrderAmount:null;
 const differenceAmount=checks.currency_tax_confirmed&&jdAmount!==null&&providerAmount!==null?subtractAmount(providerAmount,jdAmount):null;
 const trustworthy=Object.entries(checks).filter(([key])=>!['groups_balanced','issues_resolved'].includes(key)).every(([,valid])=>valid);
 const status=!openIssues.length?'MATCHED':trustworthy&&!checks.groups_balanced&&differenceAmount!==null?'DIFFERENCE':'NEEDS_INFORMATION';
 return {status,currency:checks.currency_tax_confirmed?currency:null,taxBasis:checks.currency_tax_confirmed?taxBasis:'UNKNOWN',jdAmount,providerAmount,differenceAmount,groups,checks,openIssues};
}
