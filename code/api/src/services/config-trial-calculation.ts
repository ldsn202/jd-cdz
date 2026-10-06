import { CATALOG, TARGETS, transformRows, validateConfig } from '../../../skill-runtime/transform.mjs';
import { inputIssues, resolvePointer } from '../../../skill-runtime/contract.mjs';

type Obj = Record<string, any>;
export type TrialInput = { inputId:string; recordType:string; sourceSystem:string; sourceRecordId:string; sourceVersion:string|null; data:Obj };
export type TrialCandidate = { id:string; integration_config_id:string; work_item_id:string; analysis_result_id:string; format_status:string; source_format_id:string|null; source_format_version:string|null; applicability_json:string; rules_json:string; open_questions_json:string; rule_catalog_version:string };
export type ConfigurationScope = { id:string; service_provider_id:string; source_system:string; purpose:string; business_scope_key:string };
const text = (v:unknown):v is string => typeof v==='string'&&v.trim().length>0;
const object = (v:unknown):v is Obj => !!v&&typeof v==='object'&&!Array.isArray(v);
export function parseRawSource(raw:string) {
  // JSON source text is required: never round long decimals before conversion.
  return JSON.parse(raw, ((_key:string,value:unknown,context?:{source:string})=>{
    if(typeof value!=='number')return value;
    if(!text(context?.source))throw new Error('当前执行环境不支持保留原始十进制数值');
    return context!.source;
  }) as (key:string,value:any)=>any);
}
export function calculateConfigurationTrial(candidate:TrialCandidate,scope:ConfigurationScope,input:{skillVersion:string;outputSchemaVersion:string;requiredState:string;inputIssues:string[];records:TrialInput[];parsedMaterials:unknown[]}) {
  const applicability=JSON.parse(candidate.applicability_json) as Obj;
  const rules=JSON.parse(candidate.rules_json) as Obj[];
  const questions=JSON.parse(candidate.open_questions_json) as unknown[];
  const issues:string[]=[...input.inputIssues];
  const checks={input_complete:input.requiredState==='COMPLETE',scope_valid:true,rules_covered:false,outputs_valid:false,meanings_resolved:true};
  const config={ruleCatalogVersion:candidate.rule_catalog_version,purpose:scope.purpose,sourceFormatId:candidate.source_format_id,sourceFormatVersion:candidate.source_format_version,rowPath:applicability.rowPath,rules};
  let executionFailed=false;
  const note=(key:keyof typeof checks,message:string)=>{checks[key]=false;issues.push(message);};
  try {
    const missing=inputIssues({runId:'trial',operation:'ANALYZE_SKILL',profileId:'controlled-transformer',parseInput:null,analysisInput:{skill:'INTEGRATION_CONFIGURATION',skillVersion:input.skillVersion,outputSchemaVersion:input.outputSchemaVersion,inputSnapshotId:'trial-input',records:input.records,parsedMaterials:input.parsedMaterials}});
    if(missing.length){checks.input_complete=false;issues.push(...missing);}
  }catch(e){note('input_complete',(e as Error).message);}
  for(const [key,expected] of Object.entries({serviceProviderId:scope.service_provider_id,sourceSystem:scope.source_system,purpose:scope.purpose,businessScopeKey:scope.business_scope_key,formatStatus:candidate.format_status,sourceFormatId:candidate.source_format_id,sourceFormatVersion:candidate.source_format_version})){
    if(applicability[key]!==expected)note('scope_valid',`适用范围与配置身份不一致：${key}`);
  }
  if(questions.length||!Array.isArray(applicability.unknownConditions)||applicability.unknownConditions.length)note('meanings_resolved','候选仍有未解决含义或未知适用条件');
  const references=applicability.basisReferences;
  if(!Array.isArray(references)||!references.length)note('meanings_resolved','缺少已固定的含义依据');
  else for(const ref of references){
    try{
      const id=typeof ref==='string'?ref:ref?.inputId;
      const record=input.records.find(r=>r.inputId===id);
      let value:unknown;
      if(record){
        if(object(ref)){
          if(ref.blockId!=null||(!text(ref.jsonPointer)&&ref.jsonPointer!==''))throw new Error('业务记录依据的位置不完整');
          value=resolvePointer(record.data,ref.jsonPointer);
        }
      }else{
        const material=input.parsedMaterials.find((p):p is Obj=>object(p)&&p.parseId===id);
        if(!material||!object(ref)||!text(ref.blockId)||ref.jsonPointer!=null)throw new Error('引用的材料或单元格未在本次分析资料中找到');
        const block=material.blocks?.find((b:Obj)=>b.blockId===ref.blockId);
        if(!block)throw new Error('引用的单元格未在本次材料中找到');
        if(block.kind==='IMAGE_DESCRIPTION'&&ref.quote!=null)throw new Error('图片描述不能作为原文引用');
        value=block.text;
      }
      if(object(ref)&&ref.quote!=null){
        const original=typeof value==='string'?value:JSON.stringify(value);
        if(!text(ref.quote)||!original?.includes(ref.quote))throw new Error('引用内容与原始资料不一致');
      }
    }catch(e){note('meanings_resolved',(e as Error).message);}
  }
  let rulesValid=true;
  try{validateConfig(config);}catch(e){rulesValid=false;executionFailed=true;issues.push((e as Error).message);}
  const required=TARGETS[scope.purpose]??[];
  checks.rules_covered=rulesValid&&required.length>0&&required.every(t=>rules.some(r=>r.targetField===t));
  if(!checks.rules_covered)issues.push('规则目录或必需目标字段未完整覆盖');
  const records:Obj[]=[];
  const sourceRecords=input.records.filter(r=>r.recordType==='PROVIDER_RECORD');
  if(!sourceRecords.length)note('input_complete','缺少原始服务商资料');
  for(const record of sourceRecords){
    const source=record.data.sourceRecord;
    if(!object(source)||source.serviceProviderId!==scope.service_provider_id||record.sourceSystem!==scope.source_system||source.sourceSystem!==scope.source_system||source.sourceRecordId!==record.sourceRecordId||source.sourceVersion!==record.sourceVersion
      ||source.configurationPurpose!==scope.purpose||source.businessScopeKey!==scope.business_scope_key||!['CONFIGURATION',scope.purpose].includes(source.purpose)||source.sourceFormatId!==candidate.source_format_id||source.sourceFormatVersion!==candidate.source_format_version)note('scope_valid',`${record.inputId} 原资料来源、版本或归属不在候选范围`);
    const fields=record.data.formatDefinition?.fields;
    if(!Array.isArray(fields)||!fields.length||fields.some((f:Obj)=>!text(f.meaning)))note('meanings_resolved',`${record.inputId} 原格式存在缺失或未知字段含义`);
    else for(const rule of rules)for(const path of rule.sourceFields??[]){
      if(!fields.some((f:Obj)=>f.fieldKey===path||'/'+String(f.fieldKey).replace(/~/g,'~0').replace(/\//g,'~1')===path))note('meanings_resolved',`${record.inputId} 源字段 ${path} 没有明确对应的格式含义`);
    }
    if(typeof record.data.rawJson!=='string'){note('input_complete',`${record.inputId} 缺少可执行的原始JSON；文件解析结果不能自动当作字段映射`);continue;}
    try{
      const raw=parseRawSource(record.data.rawJson);
      const selected=resolvePointer(raw,applicability.rowPath);
      const rows=Array.isArray(selected)?selected:[selected];
      if(!rows.length||rows.some(r=>!object(r)))throw new Error('行路径未选择非空原始数据行');
      if(!Array.isArray(applicability.conditions))note('scope_valid','适用条件必须为数组');
      else for(const condition of applicability.conditions){
        if(!object(condition)||Object.keys(condition).sort().join(',')!=='equals,path'||!text(condition.path)||!['string','boolean'].includes(typeof condition.equals))note('meanings_resolved','存在执行器尚未支持的适用条件');
        else if(rows.some(row=>resolvePointer(row,condition.path)!==condition.equals))note('scope_valid','原始行不满足适用条件：'+condition.path);
      }
      if(!rulesValid)continue;
      const result=transformRows(config,rows,{purpose:scope.purpose,sourceFormatId:source?.sourceFormatId,sourceFormatVersion:source?.sourceFormatVersion});
      records.push({inputId:record.inputId,sourceVersion:record.sourceVersion,...result});issues.push(...result.issues.map(i=>record.inputId+' '+i));
    }catch(e){executionFailed=true;issues.push(`${record.inputId} ${(e as Error).message}`);}
  }
  const ruleResults=rules.map(rule=>{
    const executions=records.flatMap(record=>record.rows.flatMap((row:Obj)=>row.ruleResults.filter((r:Obj)=>r.ruleId===rule.ruleId).map((r:Obj)=>({inputId:record.inputId,rowIndex:row.rowIndex,...r}))));
    const status=executions.length===0?'NOT_EXECUTED':executions.every((r:Obj)=>r.status==='PASSED')?'PASSED':'NEEDS_INFORMATION';
    return {ruleId:rule.ruleId,status,executions,inputReferences:executions.map((r:Obj)=>({inputId:r.inputId,rowIndex:r.rowIndex,sourceFields:r.sourceFields})),outputReferences:executions.map((r:Obj)=>({inputId:r.inputId,rowIndex:r.rowIndex,targetField:rule.targetField})),issues:executions.flatMap((r:Obj)=>r.issues)};
  });
  checks.rules_covered=checks.rules_covered&&ruleResults.length>0&&ruleResults.every(r=>r.status!=='NOT_EXECUTED');
  checks.outputs_valid=records.length===sourceRecords.length&&records.length>0&&records.every(r=>r.status==='PASSED')&&checks.rules_covered;
  if(!checks.outputs_valid)issues.push('实际转换输出未完整通过字段校验');
  if(!checks.input_complete&&!issues.length)issues.push('原分析输入未完整确认');
  const uniqueIssues=[...new Set(issues)];
  const passed=Object.values(checks).every(Boolean)&&uniqueIssues.length===0;
  return {status:passed?'PASSED':executionFailed?'FAILED':'NEEDS_INFORMATION',transformerVersion:CATALOG,checks,issues:uniqueIssues,
    output:records.length?{records}:null,ruleResults};
}
