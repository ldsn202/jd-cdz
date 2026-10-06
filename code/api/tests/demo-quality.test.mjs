import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateConfig} from '../../mocks/generator/config.ts';
import {buildProviders} from '../../mocks/generator/providers.ts';
import {buildBusinessFacts} from '../../mocks/generator/business-facts.ts';
import {PROJECTORS} from '../../mocks/generator/source-projectors/index.ts';
import {providerSample} from '../../mocks/generator/provider-samples.ts';
import {writeXlsx} from '../../mocks/generator/files/xlsx.ts';
import {parseMaterialBytes} from '../../task-runner/material-parser.mjs';
import {loadModule} from './helpers/load-app.mjs';
const config=validateConfig(JSON.parse(readFileSync(new URL('../../mocks/generator/configs/standard.json',import.meta.url))));
const facts=buildBusinessFacts(config,buildProviders(config));
test('demo has exactly ten isolated provider accounts, ten real Excel samples and aligned field meanings',async()=>{
 assert.equal(facts.providers.length,10);assert.equal(facts.workOrders.length,100);
 assert.equal(facts.accounts.filter(a=>a.role==='PROVIDER_BUSINESS').length,10);
 const records=PROJECTORS['provider-docs'](facts).filter(r=>r.kind==='provider_record');
 for(const provider of facts.providers){
  const sample=providerSample(provider),record=records.find(r=>r.payload.serviceProviderId===provider.providerId);
  assert.ok(record.payload.fileMaterialId);assert.deepEqual(JSON.parse(record.payload.rawJson).rows,sample.rows);
  assert.ok(sample.fields.every(f=>Object.hasOwn(sample.rows[0],f.fieldKey)));
  assert.equal(sample.fields.filter(f=>f.meaning).length,provider.providerId==='SP-010'?4:5);
  const bytes=writeXlsx([{name:'安装明细',rows:sample.sheetRows}]);
  const parsed=await parseMaterialBytes(bytes,{profileId:'local-material-parser',implementationVersion:'1.0.0',parseInput:{mediaType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',byteLength:bytes.length,contentSha256:createHash('sha256').update(bytes).digest('hex')}});
  assert.equal(parsed.parsing.completeness,'COMPLETE');
 }
});
test('difference examples preserve real arithmetic and only declared missing-data cases are blocked',async()=>{
 const {calculateReconciliation}=await loadModule('../../src/services/reconciliation-calculation.ts');
 const result={MATCHED:0,DIFFERENCE:0,NEEDS_INFORMATION:0};
 for(const group of facts.billGroups){
  assert.equal(group.workOrderIds.length,1);
  const wo=group.workOrderIds[0];
  const make=(type,items,total)=>({id:type,record_type:type,source_version:'v1',data_json:JSON.stringify({serviceProviderId:group.serviceProviderId,installationWorkOrderId:wo,effectiveStatus:'EFFECTIVE',itemsComplete:true,completeness:'COMPLETE',missingParts:[],currency:'CNY',taxBasis:'TAX_INCLUDED',relatedWorkOrderIds:[wo],reportedTotalAmount:total,targetWorkOrderAmount:total,items})});
  const c=calculateReconciliation([make('JD_BILL',group.jdItems,group.jdReportedTotal),make('PROVIDER_RECEIVABLE',group.receivableItems,group.receivableReportedTotal)],wo,group.serviceProviderId,group.evidenceComplete,false);
  result[c.status]++;
  if(group.evidenceComplete&&!group.totalMismatchNegative)assert.ok(c.checks.total_checks_passed);
  if(c.status==='DIFFERENCE'){assert.notEqual(c.differenceAmount,'0');assert.ok(c.checks.mapping_confirmed);}
 }
 assert.deepEqual(result,{MATCHED:10,DIFFERENCE:29,NEEDS_INFORMATION:5});
});
