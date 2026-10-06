import test from 'node:test';import assert from 'node:assert/strict';
import {inputIssues} from '../contract.mjs';import {runTrials} from '../run-local.mjs';
const request=()=>({runId:'run',operation:'ANALYZE_SKILL',profileId:'local',parseInput:null,analysisInput:{skill:'INTEGRATION_CONFIGURATION',skillVersion:'1.0.0',outputSchemaVersion:'1.0.0',inputSnapshotId:'s',parsedMaterials:[],records:[{inputId:'p',recordType:'PROVIDER_RECORD',sourceSystem:'mock',sourceRecordId:'p',sourceVersion:'v1',data:{sourceRecord:{sourceSystem:'mock',sourceRecordId:'p',sourceVersion:'v1',serviceProviderId:'provider',sourceFormatId:'fmt',sourceFormatVersion:'v1',purpose:'CONFIGURATION'},contentComplete:true,completeness:'COMPLETE',missingParts:[],formatStatus:'PROVIDED',formatDefinition:{formatId:'fmt',sourceVersion:'v1',notes:'Explicit installation fields'},rawJson:'{"rows":[{}]}'}},{inputId:'f',recordType:'PROVIDER_FORMAT',sourceSystem:'mock',sourceRecordId:'fmt',sourceVersion:'v1',data:{formatId:'fmt',sourceVersion:'v1'}}]}});
test('verified source identity and format accepted',()=>assert.deepEqual(inputIssues(request()),[]));
for(const [name,mutate] of [
 ['null provider',q=>q.analysisInput.records[0].data.sourceRecord.serviceProviderId=null],
 ['blank provider',q=>q.analysisInput.records[0].data.sourceRecord.serviceProviderId=''],
 ['missing format',q=>{q.analysisInput.records[0].data.formatStatus='NOT_PROVIDED';q.analysisInput.records[0].data.formatDefinition=null;}],
 ['empty format content',q=>delete q.analysisInput.records[0].data.formatDefinition.notes],
 ['unknown completeness',q=>q.analysisInput.records[0].data.completeness='UNKNOWN'],
 ['unknown source purpose',q=>q.analysisInput.records[0].data.sourceRecord.purpose='UNKNOWN'],
 ['format mismatch',q=>q.analysisInput.records[1].data.sourceVersion='v2'],
 ['embedded format mismatch',q=>q.analysisInput.records[0].data.formatDefinition.sourceVersion='v2'],
 ['source version mismatch',q=>q.analysisInput.records[0].data.sourceRecord.sourceVersion='v2'],
 ['source identity mismatch',q=>q.analysisInput.records[0].data.sourceRecord.sourceRecordId='elsewhere'],
])test(name,()=>{const q=request();mutate(q);assert.ok(inputIssues(q).length);});
test('trial requires purpose supplied by caller',()=>{const a={skill:'INTEGRATION_CONFIGURATION',findings:[{content:{purpose:'INSTALLATION'}}]};assert.throws(()=>runTrials(request(),a),/purpose/i);assert.throws(()=>runTrials(request(),a,'RECONCILIATION'),/purpose/i);});
const config=purpose=>({ruleCatalogVersion:'charging-transform-1',purpose,sourceFormatId:'fmt',sourceFormatVersion:'v1',rowPath:'/rows',rules:(purpose==='INSTALLATION'?['installationItem','installedQuantity','unit','materialSupplier','serviceScope']:['itemName','chargeScope','billedQuantity','unit','unitPrice','amount','currency']).map(targetField=>({ruleId:targetField,targetField,sourceFields:['/'+targetField],operation:'PIPELINE',parameters:{steps:[{op:'field',path:'/'+targetField}]},conditions:[]}))});
test('full trial preserves raw large amount exactly',()=>{const q=request();q.analysisInput.records[0].data.rawJson='{"rows":[{"itemName":"安装","chargeScope":"基础","billedQuantity":1,"unit":"项","unitPrice":9007199254740993,"amount":9007199254740993,"currency":"CNY"}]}';const r=runTrials(q,{skill:'INTEGRATION_CONFIGURATION',findings:[{content:config('RECONCILIATION')}]},'RECONCILIATION');assert.equal(r[0].status,'PASSED');assert.equal(r[0].rows[0].output.amount,'9007199254740993');});
test('full trial holds installation precision loss',()=>{const q=request();q.analysisInput.records[0].data.rawJson='{"rows":[{"installationItem":"电缆","installedQuantity":1.0000000000000001,"unit":"米","materialSupplier":"物业","serviceScope":"安装"}]}';const r=runTrials(q,{skill:'INTEGRATION_CONFIGURATION',findings:[{content:config('INSTALLATION')}]},'INSTALLATION');assert.equal(r[0].status,'NEEDS_INFORMATION');assert.equal(r[0].rows[0].output.installedQuantity,null);});
