import test from 'node:test';
import assert from 'node:assert/strict';
import {loadModule} from './helpers/load-app.mjs';
const {calculateReconciliation}=await loadModule('../../src/services/reconciliation-calculation.ts');
function input(amount='0.3'){
 const common={serviceProviderId:'provider',installationWorkOrderId:'wo',sourceVersion:'v1',effectiveStatus:'EFFECTIVE',itemsComplete:true,completeness:'COMPLETE',missingParts:[],currency:'CNY',taxBasis:'TAX_INCLUDED',relatedWorkOrderIds:['wo'],reportedTotalAmount:amount,targetWorkOrderAmount:amount,items:[{billItemId:'line',itemName:'电缆',installationWorkOrderId:'wo',chargeScope:'安装',billedQuantity:'3',unit:'米',unitPrice:'0.1',amount}]};
 return [{id:'jd-input',record_type:'JD_BILL',source_version:'v1',data_json:JSON.stringify(common)},{id:'provider-input',record_type:'PROVIDER_RECEIVABLE',source_version:'v1',data_json:JSON.stringify(common)}];
}
test('strict comparison uses exact decimals and actual input member identities',()=>{
 const r=calculateReconciliation(input(),'wo','provider',true,false);assert.equal(r.status,'MATCHED');assert.equal(r.differenceAmount,'0');assert.equal(r.jdAmount,'0.3');assert.deepEqual(r.groups[0].members.map(m=>m.inputItemId),['jd-input','provider-input']);
});
test('same total with unknown scope, nonmatching line amounts, or unresolved questions cannot match',()=>{
 for(const mutate of [rows=>{const d=JSON.parse(rows[0].data_json);d.items[0].chargeScope=null;rows[0].data_json=JSON.stringify(d);},rows=>{const d=JSON.parse(rows[0].data_json);d.items[0].amount='0.2';rows[0].data_json=JSON.stringify(d);},rows=>{const d=JSON.parse(rows[0].data_json);d.relatedWorkOrderIds=['wo','other'];rows[0].data_json=JSON.stringify(d);}]){const rows=input();mutate(rows);const r=calculateReconciliation(rows,'wo','provider',true,false);assert.notEqual(r.status,'MATCHED');assert.ok(r.openIssues.length);}
 assert.notEqual(calculateReconciliation(input(),'wo','provider',true,true).status,'MATCHED');
});
test('equal grand totals cannot hide offsetting group differences',()=>{
 const rows=input();for(const [i,row] of rows.entries()){const d=JSON.parse(row.data_json);d.reportedTotalAmount='3';d.targetWorkOrderAmount='3';d.items=[{...d.items[0],billItemId:'a',itemName:'A',billedQuantity:'1',unitPrice:i?'2':'1',amount:i?'2':'1'},{...d.items[0],billItemId:'b',itemName:'B',billedQuantity:'1',unitPrice:i?'1':'2',amount:i?'1':'2'}];row.data_json=JSON.stringify(d);}
 const r=calculateReconciliation(rows,'wo','provider',true,false);assert.equal(r.status,'DIFFERENCE');assert.equal(r.differenceAmount,'0');assert.ok(r.openIssues.length);
});

test('positive and negative differences consistently mean provider minus JD',()=>{
 for (const [amount,expected] of [['0.6','0.3'],['0.15','-0.15']]) {
  const rows=input(),data=JSON.parse(rows[1].data_json);
  data.targetWorkOrderAmount=amount;data.reportedTotalAmount=amount;data.items[0].amount=amount;data.items[0].unitPrice=amount==='0.6'?'0.2':'0.05';rows[1].data_json=JSON.stringify(data);
  const result=calculateReconciliation(rows,'wo','provider',true,false);
  assert.equal(result.differenceAmount,expected);assert.equal(result.groups[0].differenceAmount,expected);
 }
 const rows=input(),data=JSON.parse(rows[1].data_json);data.currency='USD';rows[1].data_json=JSON.stringify(data);
 assert.equal(calculateReconciliation(rows,'wo','provider',true,false).differenceAmount,null);
});
