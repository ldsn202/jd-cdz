import {CATALOG,TARGETS,transformRows,validateConfig} from '../../../skill-runtime/transform.mjs';
import {resolvePointer} from '../../../skill-runtime/contract.mjs';
import type {AnalysisRecord} from './analysis-sources';
import {parseRawSource} from './config-trial-calculation';
type Item={id:string;item_kind:string;service_provider_id:string;wo_source_id:string|null};
type Candidate={id:string;integration_config_id:string;applicability_json:string;rules_json:string;open_questions_json:string;rule_catalog_version:string;source_format_id:string|null;source_format_version:string|null;format_status:string;activation_id:string;purpose:string;business_scope_key:string};
export async function applyEnabledConfigurations(db:D1Database,item:Item,records:AnalysisRecord[]){
 const dependencies:Record<string,unknown>[]=[],issues:string[]=[];
 if(item.item_kind==='CONFIGURATION')return {dependencies,issues};
 for(const record of records.filter(r=>r.recordType==='PROVIDER_RECORD')){
  const source=record.data.sourceRecord as Record<string,unknown>|undefined;
  const purpose=item.item_kind==='CONFIGURATION_SAMPLE'&&['INSTALLATION','RECONCILIATION'].includes(String(source?.configurationPurpose))?String(source!.configurationPurpose):item.item_kind==='INSTALLATION_PREPARATION'?'INSTALLATION':item.item_kind==='RECONCILIATION'?'RECONCILIATION':null;
  if(!source||!purpose||source.configurationPurpose!==purpose||typeof source.businessScopeKey!=='string'||!source.businessScopeKey.trim()){
   issues.push(`${record.inputId} 来源未明确配置用途与业务范围`);continue;
  }
  if(source.serviceProviderId!==item.service_provider_id||source.sourceSystem!==record.sourceSystem||source.installationWorkOrderId!==item.wo_source_id||source.purpose!==(item.item_kind==='CONFIGURATION_SAMPLE'?'CONFIGURATION':'INSTALLATION')){
   issues.push(`${record.inputId} 当前资料未明确归属本工单`);continue;
  }
  const candidate=await db.prepare(`SELECT v.*,c.purpose,c.business_scope_key,c.current_activation_result_id activation_id FROM integration_config c JOIN integration_config_version v ON v.id=c.current_version_id
   JOIN configuration_activation_result a ON a.id=c.current_activation_result_id AND a.outcome='APPLIED' JOIN configuration_enablement e ON e.id=a.enablement_id AND e.configuration_version_id=v.id
   WHERE c.service_provider_id=? AND c.source_system=? AND c.purpose=? AND c.business_scope_key=?`).bind(item.service_provider_id,record.sourceSystem,purpose,source.businessScopeKey).first<Candidate>();
  if(!candidate){issues.push(`${record.inputId} 明确范围内尚无已启用配置`);continue;}
  if(candidate.format_status!=='PROVIDED'||candidate.source_format_id!==source.sourceFormatId||candidate.source_format_version!==source.sourceFormatVersion){issues.push(`${record.inputId} 原格式版本与已启用配置不一致，不能沿用旧规则`);continue;}
  const applicability=JSON.parse(candidate.applicability_json),rules=JSON.parse(candidate.rules_json);
  const config={ruleCatalogVersion:candidate.rule_catalog_version,purpose,sourceFormatId:candidate.source_format_id,sourceFormatVersion:candidate.source_format_version,rowPath:applicability.rowPath,rules};
  const dependency={configurationId:candidate.integration_config_id,configurationVersionId:candidate.id,activationResultId:candidate.activation_id,usage:'ACTIVE_TRANSFORM',serviceProviderId:item.service_provider_id,sourceSystem:record.sourceSystem,purpose,businessScopeKey:source.businessScopeKey,sourceFormatId:source.sourceFormatId,sourceFormatVersion:source.sourceFormatVersion};
  dependencies.push(dependency);
  try{
   validateConfig(config);
   if(JSON.parse(candidate.open_questions_json).length||!Array.isArray(applicability.unknownConditions)||applicability.unknownConditions.length)throw new Error('已启用规则仍含未知条件');
   for(const [key,value] of Object.entries({serviceProviderId:item.service_provider_id,sourceSystem:record.sourceSystem,purpose,businessScopeKey:source.businessScopeKey}))if(applicability[key]!==value)throw new Error('已启用配置范围不一致');
   if(record.data.completeness!=='COMPLETE'||record.data.contentComplete!==true||!Array.isArray(record.data.missingParts)||record.data.missingParts.length)throw new Error('来源内容不完整');
   const format=record.data.formatDefinition as {formatId:string;sourceVersion:string;fields:{fieldKey:string;meaning:string|null}[]}|null;
   if(!format||format.formatId!==source.sourceFormatId||format.sourceVersion!==source.sourceFormatVersion||!format.fields.length)throw new Error('原格式说明与声明版本不一致');
   for(const rule of rules)for(const path of rule.sourceFields){if(!format.fields.some(f=>f.meaning&&(f.fieldKey===path||'/'+f.fieldKey.replace(/~/g,'~0').replace(/\//g,'~1')===path)))throw new Error('转换字段含义未明确：'+path);}
   if(!TARGETS[purpose].every(field=>rules.some((r:{targetField:string})=>r.targetField===field)))throw new Error('受控规则未覆盖必需字段');
   if(typeof record.data.rawJson!=='string')throw new Error('文件材料不能未经明确行字段映射直接套JSON配置');
   const selected=resolvePointer(parseRawSource(record.data.rawJson),applicability.rowPath),rows=Array.isArray(selected)?selected:[selected];
   if(!rows.length||rows.some(r=>r===null||typeof r!=='object'||Array.isArray(r)))throw new Error('原始行为空或结构不符');
   if(!Array.isArray(applicability.conditions))throw new Error('适用条件缺失');
   for(const condition of applicability.conditions){if(!condition||Object.keys(condition).sort().join(',')!=='equals,path'||typeof condition.path!=='string'||!['string','boolean'].includes(typeof condition.equals)||rows.some(row=>resolvePointer(row,condition.path)!==condition.equals))throw new Error('当前行不满足已启用规则的适用条件');}
   const result=transformRows(config,rows,{purpose,sourceFormatId:source.sourceFormatId,sourceFormatVersion:source.sourceFormatVersion});
   record.data={...record.data,_controlledTransformation:{...dependency,transformerVersion:CATALOG,status:result.status,output:{records:[{inputId:record.inputId,sourceVersion:record.sourceVersion,...result}]}}};
   if(result.status!=='PASSED')issues.push(...result.issues.map(issue=>`${record.inputId} ${issue}`));
  }catch(error){issues.push(`${record.inputId} ${(error as Error).message}`);}
 }
 return {dependencies:[...new Map(dependencies.map(d=>[String(d.configurationId),d])).values()],issues};
}

// Source discovery may test an explicitly authorized configuration sample without treating it as construction facts.
export async function checkEnabledConfigurationSample(db:D1Database,providerId:string,record:AnalysisRecord){
 return applyEnabledConfigurations(db,{id:`source:${record.sourceSystem}:${record.sourceRecordId}`,item_kind:'CONFIGURATION_SAMPLE',service_provider_id:providerId,wo_source_id:null},[record]);
}
export function controlledInstallationMatches(records:AnalysisRecord[],analysis:{status:string;findings:{content:Record<string,unknown>;evidenceRefs:unknown[]}[]}){
 const signature=(value:Record<string,unknown>)=>JSON.stringify(TARGETS.INSTALLATION.map(key=>value[key]??null));
 for(const record of records){
  const conversion=record.data._controlledTransformation as {purpose:string;status:string;output:{records:{rows:{output:Record<string,unknown>}[]}[]}}|undefined;
  if(!conversion||conversion.purpose!=='INSTALLATION'||conversion.status!=='PASSED')continue;
  const outputs=conversion.output.records.flatMap(r=>r.rows.map(row=>signature(row.output)));
  const findings=analysis.findings.filter(f=>f.evidenceRefs.some(ref=>(ref as {inputId?:string})?.inputId===record.inputId)).map(f=>signature(f.content));
  for(const value of findings){const index=outputs.indexOf(value);if(index<0)return false;outputs.splice(index,1);}
  if(analysis.status==='ANALYZED'&&outputs.length)return false;
 }
 return true;
}
