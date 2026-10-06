// Foundation AI contract: deterministic structure and reference validation only.
import {validateConfig} from './transform.mjs';
export const registry={
 INTEGRATION_CONFIGURATION:{name:'provider-mapping-config',type:'TRANSFORMATION_CONFIG',fields:['ruleCatalogVersion','purpose','sourceFormatId','sourceFormatVersion','rowPath','rules'],required:['PROVIDER_RECORD','PROVIDER_FORMAT']},
 INSTALLATION_EXTRACTION:{name:'install-detail-extractor',type:'INSTALLATION_FACT',fields:['installationItem','installedQuantity','unit','materialSupplier','serviceScope'],required:['INSTALLATION_WORK_ORDER']},
 INSTALLATION_EVIDENCE:{name:'install-evidence-finder',type:'EVIDENCE_CHECK',fields:['topic','explanation','assessment'],required:['INSTALLATION_WORK_ORDER','INSTALLATION_PLAN','INSTALLATION_DETAIL']},
 RECONCILIATION_EXPLANATION:{name:'billing-diff-explainer',type:'FEE_EXPLANATION',fields:['topic','explanation'],required:['JD_BILL','PROVIDER_RECEIVABLE','BILLING_TERM']}
};
export const targets=['installationItem','installedQuantity','unit','materialSupplier','serviceScope','itemName','chargeScope','billedQuantity','unitPrice','amount','currency'];
export const VERSION='1.0.0';
const types=['INSTALLATION_WORK_ORDER','INSTALLATION_PLAN','INSTALLATION_DETAIL','SOURCE_MATERIAL','INSTALLATION_REVIEW','SUPPLEMENTAL_RESPONSE','PURCHASE_ORDER','INSTALLATION_ENTITLEMENT','PROVIDER_RECORD','PROVIDER_FORMAT','JD_BILL','PROVIDER_RECEIVABLE','BILLING_TERM','FEE_APPROVAL_RECORD'];
function check(ok,msg){if(!ok)throw new Error(msg);}
const text=x=>typeof x==='string'&&x.trim().length>0;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function keys(x,expected,label){check(object(x),label+' must be object');check(Object.keys(x).sort().join('|')===[...expected].sort().join('|'),label+' fields mismatch');}
function strings(x,label){check(Array.isArray(x)&&x.every(text),label+' must be string[]');}
function unique(items,key,label){check(new Set(items.map(x=>x[key])).size===items.length,label+' duplicate '+key);}
function nullable(x){return x===null||text(x);}
export function resolvePointer(data,pointer){
 check(typeof pointer==='string'&&(pointer===''||pointer.startsWith('/')),'invalid JSON Pointer');
 if(pointer==='')return data;
 let cursor=data;
 for(const encoded of pointer.slice(1).split('/')){
  check(!/~(?![01])/u.test(encoded),'invalid pointer escape');
  const key=encoded.replace(/~1/g,'/').replace(/~0/g,'~');
  check(cursor!==null&&typeof cursor==='object'&&Object.hasOwn(cursor,key),'pointer not found');
  check(!Array.isArray(cursor)||/^(0|[1-9][0-9]*)$/.test(key),'invalid array pointer');
  cursor=cursor[key];
 }
 return cursor;
}
export function validateParsing(p){
 keys(p,['parseId','sourceSystem','sourceMaterialId','sourceVersion','contentSha256','completeness','units','blocks','issues'],'parsing');
 for(const k of ['parseId','sourceSystem','sourceMaterialId','sourceVersion'])check(text(p[k]),'invalid '+k);
 check(/^[a-f0-9]{64}$/.test(p.contentSha256),'invalid material hash');
 check(['COMPLETE','INCOMPLETE'].includes(p.completeness),'invalid completeness');
 strings(p.issues,'issues');
 check(Array.isArray(p.units)&&p.units.length>0&&Array.isArray(p.blocks),'invalid parsing units/blocks');
 for(const u of p.units){
  keys(u,['unitId','kind','index','name','status'],'unit');
  check(text(u.unitId)&&['PDF_PAGE','IMAGE','SHEET'].includes(u.kind)&&Number.isSafeInteger(u.index)&&u.index>=1,'invalid unit');
  check(nullable(u.name)&&(u.kind!=='SHEET'||text(u.name)),'invalid sheet name');
  check(['COMPLETE','FAILED','UNREADABLE'].includes(u.status),'invalid unit status');
 }
 unique(p.units,'unitId','units');unique(p.units,'index','units');
 check(p.completeness!=='COMPLETE'||p.units.every(u=>u.status==='COMPLETE'),'false complete parsing');
 for(const b of p.blocks){
  keys(b,['blockId','unitId','kind','text','cellRange','formula','cachedValue'],'block');
  check(text(b.blockId)&&p.units.some(u=>u.unitId===b.unitId),'block unit not found');
  check(['TEXT','TABLE_CELL','IMAGE_DESCRIPTION'].includes(b.kind)&&text(b.text),'invalid block');
  check(nullable(b.cellRange)&&nullable(b.formula)&&nullable(b.cachedValue),'invalid cell fields');
  if(b.kind==='TABLE_CELL')check(typeof b.cellRange==='string'&&/^\$?[A-Z]+\$?[1-9][0-9]*(?::\$?[A-Z]+\$?[1-9][0-9]*)?$/.test(b.cellRange),'invalid cell range');
  else check(b.cellRange===null&&b.formula===null&&b.cachedValue===null,'non-cell has cell fields');
 }
 unique(p.blocks,'blockId','blocks');
}
export function validateRequest(q){
 keys(q,['runId','operation','profileId','parseInput','analysisInput'],'request');
 check(text(q.runId)&&text(q.profileId)&&q.operation==='ANALYZE_SKILL'&&q.parseInput===null,'invalid analysis request');
 const a=q.analysisInput;
 keys(a,['skill','skillVersion','outputSchemaVersion','inputSnapshotId','records','parsedMaterials'],'analysisInput');
 check(Object.hasOwn(registry,a.skill),'unknown skill');
 check(a.skillVersion===VERSION&&a.outputSchemaVersion===VERSION,'unregistered version');
 check(text(a.inputSnapshotId)&&Array.isArray(a.records)&&Array.isArray(a.parsedMaterials),'invalid input');
 for(const r of a.records){
  keys(r,['inputId','recordType','sourceSystem','sourceRecordId','sourceVersion','data'],'record');
  for(const k of ['inputId','sourceSystem','sourceRecordId'])check(text(r[k]),'invalid record '+k);
  check(types.includes(r.recordType)&&nullable(r.sourceVersion)&&object(r.data),'invalid record');
 }
 for(const p of a.parsedMaterials)validateParsing(p);
 const ids=[...a.records.map(r=>r.inputId),...a.parsedMaterials.map(p=>p.parseId)];
 check(new Set(ids).size===ids.length,'duplicate input identifiers');
 return q;
}
export function inputIssues(q){
 validateRequest(q);
 const a=q.analysisInput,p=registry[a.skill],issues=[];
 for(const t of p.required)if(!a.records.some(r=>r.recordType===t))issues.push('缺少 '+t);
 if(a.skill==='INSTALLATION_EXTRACTION'&&!a.parsedMaterials.length&&!a.records.some(r=>r.recordType==='PROVIDER_RECORD'))issues.push('缺少实际施工资料');
 for(const r of a.records){
  if(r.sourceVersion===null)issues.push(r.inputId+' 缺少来源版本');
  if((Object.hasOwn(r.data,'completeness')&&r.data.completeness!=='COMPLETE')||r.data.contentComplete===false)issues.push(r.inputId+' 来源不完整');
  if(Array.isArray(r.data.missingParts)&&r.data.missingParts.length)issues.push(r.inputId+' 来源缺项');
 }
 for(const p of a.parsedMaterials)if(p.completeness!=='COMPLETE'||p.units.some(u=>u.status!=='COMPLETE'))issues.push(p.parseId+' 解析不完整');
 if(a.skill==='INTEGRATION_CONFIGURATION'){
  const providers=a.records.filter(r=>r.recordType==='PROVIDER_RECORD');
  const formats=a.records.filter(r=>r.recordType==='PROVIDER_FORMAT');
  const identities=new Set();
  for(const r of providers){
   const d=r.data,s=d.sourceRecord,f=d.formatDefinition;
   if(!object(s)){issues.push(r.inputId+' 缺少来源元信息');continue;}
   identities.add(s.serviceProviderId);
   if(!text(s.serviceProviderId)||!['INSTALLATION','CONFIGURATION'].includes(s.purpose))issues.push(r.inputId+' 服务商或原资料用途未知');
   for(const k of ['sourceSystem','sourceRecordId','sourceVersion'])if(!text(s[k])||s[k]!==r[k])issues.push(r.inputId+' 内外来源不一致：'+k);
   if(d.completeness!=='COMPLETE'||d.contentComplete!==true||!Array.isArray(d.missingParts))issues.push(r.inputId+' 未确认完整性');
   if(d.formatStatus!=='PROVIDED'||!object(f)){issues.push(r.inputId+' 格式说明未提供或未知');continue;}
   if(!text(f.notes)&&!(Array.isArray(f.fields)&&f.fields.length)&&!(Array.isArray(f.sourceMaterials)&&f.sourceMaterials.length))issues.push(r.inputId+' 格式说明没有实际内容');
   if(!text(s.sourceFormatId)||!text(s.sourceFormatVersion)||f.formatId!==s.sourceFormatId||f.sourceVersion!==s.sourceFormatVersion)issues.push(r.inputId+' 原资料与格式说明不一致');
   const matches=formats.filter(x=>x.sourceSystem===r.sourceSystem&&x.data.formatId===s.sourceFormatId&&x.data.sourceVersion===s.sourceFormatVersion&&x.sourceVersion===x.data.sourceVersion);
   if(matches.length!==1)issues.push(r.inputId+' 独立格式说明与资料版本不一致或不唯一');
  }
  if(identities.size!==1)issues.push('配置样例必须属于同一服务商');
 }
 return issues;
}
export function validateAnalysis(q,a){
 validateRequest(q);
 keys(a,['skill','skillVersion','outputSchemaVersion','inputSnapshotId','status','summary','findings','openQuestions'],'analysis');
 for(const k of ['skill','skillVersion','outputSchemaVersion','inputSnapshotId'])check(a[k]===q.analysisInput[k],'mismatched '+k);
 check(['ANALYZED','NEEDS_INFORMATION'].includes(a.status)&&text(a.summary),'invalid analysis status/summary');
 strings(a.openQuestions,'openQuestions');
 check(a.status!=='NEEDS_INFORMATION'||a.openQuestions.length>0,'missing questions');
 check(a.status!=='ANALYZED'||a.openQuestions.length===0,'unresolved questions require NEEDS_INFORMATION');
 check(!inputIssues(q).length||a.status==='NEEDS_INFORMATION','incomplete input requires NEEDS_INFORMATION');
 check(Array.isArray(a.findings),'findings must be array');unique(a.findings,'findingId','findings');
 for(const f of a.findings){
  keys(f,['findingId','type','content','evidenceRefs'],'finding');
  const policy=registry[a.skill];
  check(text(f.findingId)&&f.type===policy.type,'invalid finding type/id');
  keys(f.content,policy.fields,'finding content');
  if(a.skill==='INTEGRATION_CONFIGURATION'){
   validateConfig(f.content);
   check(a.findings.length===1,'one complete transformation config per analysis');
  }else if(a.skill==='INSTALLATION_EXTRACTION'){
   check(text(f.content.installationItem),'missing installation item');
   const n=f.content.installedQuantity;
   check(n===null||(typeof n==='number'&&Number.isFinite(n)&&n>=0),'invalid quantity');
   for(const k of ['unit','materialSupplier','serviceScope'])check(nullable(f.content[k]),'invalid '+k);
   check((n!==null&&f.content.unit!==null)||a.status==='NEEDS_INFORMATION','unknown quantity/unit requires questions');
  }else{
   for(const k of policy.fields)check(text(f.content[k]),'invalid content '+k);
   if(a.skill==='INSTALLATION_EVIDENCE'){
    check(['SUPPORTED','CONFLICTING','INSUFFICIENT'].includes(f.content.assessment),'invalid assessment');
    check(f.content.assessment!=='INSUFFICIENT'||a.status==='NEEDS_INFORMATION','insufficient requires questions');
   }
  }
  check(Array.isArray(f.evidenceRefs)&&f.evidenceRefs.length>0,'evidence required');
  for(const ref of f.evidenceRefs){
   keys(ref,['inputId','blockId','jsonPointer','quote'],'evidence ref');
   check(text(ref.inputId)&&nullable(ref.blockId)&&(ref.jsonPointer===null||typeof ref.jsonPointer==='string')&&nullable(ref.quote),'invalid evidence fields');
   const record=q.analysisInput.records.find(r=>r.inputId===ref.inputId);
   let value;
   if(record){check(ref.blockId===null&&ref.jsonPointer!==null,'record reference branch');value=resolvePointer(record.data,ref.jsonPointer);}
   else{
    const p=q.analysisInput.parsedMaterials.find(p=>p.parseId===ref.inputId);
    check(p&&text(ref.blockId)&&ref.jsonPointer===null,'material reference branch');
    const b=p.blocks.find(b=>b.blockId===ref.blockId);check(b,'block not found');value=b.text;
    check(b.kind!=='IMAGE_DESCRIPTION'||ref.quote===null,'image description is not quote');
   }
   if(ref.quote!==null){const original=typeof value==='string'?value:JSON.stringify(value);check(original.includes(ref.quote),'quote not in referenced value');}
  }
 }
 check(a.findings.length>0||a.status==='NEEDS_INFORMATION','empty analysis without questions');
 return a;
}
