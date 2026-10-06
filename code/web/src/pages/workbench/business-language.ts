const TERMS: Record<string,string> = {
 installationWorkOrderId:'安装工单编号',installationPlanId:'安装方案编号',installationDetailId:'安装明细编号',sourceMaterials:'关联材料',sourceMaterialId:'材料编号',verifiedAt:'提交核实时间',
 installationItem:'安装项目',installedQuantity:'实际安装数量',plannedQuantity:'方案数量',materialSupplier:'供料方',serviceScope:'服务范围',targetField:'目标字段',
 billedQuantity:'计费数量',unitPrice:'单价',reportedTotalAmount:'账单总额',targetWorkOrderAmount:'本工单金额',relatedWorkOrderIds:'关联工单',chargeScope:'收费范围',
 differenceAmount:'差额',scope_confirmed:'工单范围已确认',approvalListComplete:'批准记录查询完整',completeness:'资料完整性',applicabilityBasis:'适用依据',
 applicability:'适用情况',recordText:'依据原文',effectiveStatus:'生效状态',rawJson:'原始数据',sourceFormatVersion:'格式版本',sourceFormatId:'格式编号',
 NEEDS_INFORMATION:'待补充信息',DIFFERENCE:'存在差异',MATCHED:'核对一致',APPROVED:'已批准',APPLICABLE:'适用',COMPLETE:'完整',HOLD:'待核实',
 INSTALLATION:'安装资料',PIPELINE:'按规则转换',FORMAT_ASSOCIATION:'资料格式与字段说明版本不一致',unit:'单位',amount:'金额',scope:'适用范围',decision:'批准结论',
};
const pattern=new RegExp(Object.keys(TERMS).sort((a,b)=>b.length-a.length).join('|'),'g');
export const humanText=(value:unknown)=>String(value??'').replace(pattern,word=>TERMS[word]).replace(/\bfalse\b/g,'否').replace(/\btrue\b/g,'是');
export const fieldName=(field:string)=>humanText(field.replace(/^\//,'').replaceAll('/',' → '));
export function ruleDescription(parameters:unknown) {
 const steps=(parameters as {steps?:{op:string;path?:string;value?:unknown;suffix?:string}[]})?.steps ?? [];
 const labels:Record<string,string>={field:'读取原列',halfwidth:'统一数字格式',trim:'清除空格',stripSuffix:'去掉单位文字',decimal:'转为数量',number:'转为数量',const:'使用已确认的固定值',lookup:'按已确认的对照关系转换',multiply:'按换算比例转换',firstOf:'按顺序读取非空列'};
 return steps.map(step=>(labels[step.op]??'执行已登记规则')+(step.op==='field'&&step.path?'“'+fieldName(step.path)+'”':'')).join('，')||'等待确认转换方法';
}
