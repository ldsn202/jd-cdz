import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const file=new URL('../contract.mjs',import.meta.url);
test('validator is implemented',()=>assert.ok(existsSync(file),'contract.mjs missing'));
const api=existsSync(file)?await import(file):null;
const rec=(id='r')=>({inputId:id,recordType:'INSTALLATION_WORK_ORDER',sourceSystem:'mock',sourceRecordId:id,sourceVersion:'v1',data:{text:'实际电缆18米',nested:{'a/b':{'~x':'原文'}},completeness:'COMPLETE'}});
const request=()=>({runId:'run',operation:'ANALYZE_SKILL',profileId:'local',parseInput:null,analysisInput:{skill:'INSTALLATION_EXTRACTION',skillVersion:'1.0.0',outputSchemaVersion:'1.0.0',inputSnapshotId:'snap',records:[rec(),{...rec('p'),recordType:'PROVIDER_RECORD'}],parsedMaterials:[]}});
const result=()=>({skill:'INSTALLATION_EXTRACTION',skillVersion:'1.0.0',outputSchemaVersion:'1.0.0',inputSnapshotId:'snap',status:'ANALYZED',summary:'施工单记载18米',findings:[{findingId:'f',type:'INSTALLATION_FACT',content:{installationItem:'电缆',installedQuantity:18,unit:'米',materialSupplier:null,serviceScope:null},evidenceRefs:[{inputId:'r',blockId:null,jsonPointer:'/text',quote:'实际电缆18米'}]}],openQuestions:[]});
const cases=[
 ['valid evidence',(q,a)=>{},true],
 ['invented input',(q,a)=>a.findings[0].evidenceRefs[0].inputId='fake'],
 ['invented pointer',(q,a)=>a.findings[0].evidenceRefs[0].jsonPointer='/absent'],
 ['prototype inherited pointer',(q,a)=>a.findings[0].evidenceRefs[0].jsonPointer='/toString'],
 ['quote mismatch',(q,a)=>a.findings[0].evidenceRefs[0].quote='实际电缆30米'],
 ['old snapshot',(q,a)=>a.inputSnapshotId='old'],
 ['unknown skill',(q,a)=>q.analysisInput.skill='FAKE'],
 ['wrong finding type',(q,a)=>a.findings[0].type='FEE_EXPLANATION'],
 ['extra approval field',(q,a)=>a.approved=true],
 ['extra content field',(q,a)=>a.findings[0].content.amount='300'],
 ['negative quantity',(q,a)=>a.findings[0].content.installedQuantity=-1],
 ['infinite quantity',(q,a)=>a.findings[0].content.installedQuantity=Infinity],
 ['missing field',(q,a)=>delete a.findings[0].content.unit],
 ['empty evidence',(q,a)=>a.findings[0].evidenceRefs=[]],
 ['duplicate findings',(q,a)=>a.findings.push(structuredClone(a.findings[0]))],
 ['duplicate inputs',(q,a)=>q.analysisInput.records.push(rec())],
 ['unknown source version needs information',(q,a)=>q.analysisInput.records[0].sourceVersion=null],
 ['missing required context',(q,a)=>q.analysisInput.records=q.analysisInput.records.filter(x=>x.recordType!=='INSTALLATION_WORK_ORDER')],
 ['empty missing questions',(q,a)=>a.status='NEEDS_INFORMATION'],
 ['unknown values require information',(q,a)=>{a.findings[0].content.installedQuantity=null;}],
 ['missing input can return questions',(q,a)=>{q.analysisInput.records=[];a.status='NEEDS_INFORMATION';a.findings=[];a.openQuestions=['请提供工单与施工材料'];},true],
 ['json pointer escape',(q,a)=>{a.findings[0].evidenceRefs[0].jsonPointer='/nested/a~1b/~0x';a.findings[0].evidenceRefs[0].quote='原文';},true],
 ['bad pointer escape',(q,a)=>a.findings[0].evidenceRefs[0].jsonPointer='/nested/a~2b'],
];
for(const [name,mutate,ok=false] of cases)test(name,{skip:!api},()=>{let q=request(),a=result();mutate(q,a);if(ok)assert.doesNotThrow(()=>api.validateAnalysis(q,a));else assert.throws(()=>api.validateAnalysis(q,a));});
const parsing=()=>({parseId:'parse',sourceSystem:'mock',sourceMaterialId:'m',sourceVersion:'v1',contentSha256:'a'.repeat(64),completeness:'COMPLETE',units:[{unitId:'u',kind:'IMAGE',index:1,name:null,status:'COMPLETE'}],blocks:[{blockId:'b',unitId:'u',kind:'IMAGE_DESCRIPTION',text:'疑似签字，文字不可辨识',cellRange:null,formula:null,cachedValue:null}],issues:[]});
for(const [name,mutate,ok] of [
 ['image description null quote',()=>{},true],
 ['image description forged quote',(q,a)=>a.findings[0].evidenceRefs[0].quote='疑似签字'],
 ['invented block',(q,a)=>a.findings[0].evidenceRefs[0].blockId='missing'],
 ['incomplete parse cannot be analyzed',(q,a)=>{q.analysisInput.parsedMaterials[0].completeness='INCOMPLETE';a.status='ANALYZED';a.openQuestions=[];}],
 ['duplicate unit',(q,a)=>q.analysisInput.parsedMaterials[0].units.push({...q.analysisInput.parsedMaterials[0].units[0]})],
 ['block has no unit',(q,a)=>q.analysisInput.parsedMaterials[0].blocks[0].unitId='absent'],
])test(name,{skip:!api},()=>{let q=request(),a=result();q.analysisInput.parsedMaterials=[parsing()];a.status='NEEDS_INFORMATION';a.openQuestions=['核实原图'];a.findings[0].evidenceRefs=[{inputId:'parse',blockId:'b',jsonPointer:null,quote:null}];mutate(q,a);if(ok)assert.doesNotThrow(()=>api.validateAnalysis(q,a));else assert.throws(()=>api.validateAnalysis(q,a));});
test('configuration must carry executable rules',{skip:!api},()=>{const q=request(),a=result();q.analysisInput.skill=a.skill='INTEGRATION_CONFIGURATION';q.analysisInput.records.push({...rec('fmt'),recordType:'PROVIDER_FORMAT'});a.status='NEEDS_INFORMATION';a.openQuestions=['验证范围'];a.findings=[{findingId:'config',type:'MAPPING_CANDIDATE',content:{sourceField:'实装',targetField:'installedQuantity',interpretation:'按实际安装量转换'},evidenceRefs:[{inputId:'r',blockId:null,jsonPointer:'/text',quote:null}]}];assert.throws(()=>api.validateAnalysis(q,a),'text advice cannot pass as executable configuration');});
