import test from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';
const file=new URL('../transform.mjs',import.meta.url);const api=existsSync(file)?await import(file):null;
test('conversion engine exists',()=>assert.ok(api,'transform.mjs missing'));
const rule=(target,path,steps=[])=>({ruleId:target,sourceFields:[path],targetField:target,operation:'PIPELINE',parameters:{steps:[{op:'field',path},...steps]},conditions:[]});
export const config=()=>({ruleCatalogVersion:'charging-transform-1',purpose:'INSTALLATION',sourceFormatId:'format-a',sourceFormatVersion:'v1',rowPath:'/rows',rules:[rule('installationItem','/项目',[{op:'trim'}]),rule('installedQuantity','/实装',[{op:'halfwidth'},{op:'stripSuffix',value:'米'},{op:'decimal'}]),rule('unit','/单位',[{op:'lookup',entries:[{from:'m',to:'米'},{from:'米',to:'米'}],onMiss:'HOLD'}]),rule('materialSupplier','/供料'),rule('serviceScope','/职责')]});
const rows=()=>[{'项目':' 电缆 ','实装':'１８.５０米','单位':'m','供料':'物业','职责':'仅安装'}];
const scope={purpose:'INSTALLATION',sourceFormatId:'format-a',sourceFormatVersion:'v1'};
test('real conversion keeps input and returns trace',{skip:!api},()=>{const original=rows(),before=JSON.stringify(original);const r=api.transformRows(config(),original,scope);assert.equal(r.status,'PASSED');assert.deepEqual(r.rows[0].output,{installationItem:'电缆',installedQuantity:18.5,unit:'米',materialSupplier:'物业',serviceScope:'仅安装'});assert.equal(r.rows[0].ruleResults.length,5);assert.equal(JSON.stringify(original),before);});
for(const [name,mutate] of [
 ['unknown operation',(c,r,s)=>c.rules[0].parameters.steps[0]={op:'eval',code:'process.exit()'}],
 ['wrong format version',(c,r,s)=>s.sourceFormatVersion='v2'],
 ['unknown lookup',(c,r)=>r[0]['单位']='公里'],
 ['missing field',(c,r)=>delete r[0]['实装']],
 ['empty is not zero',(c,r)=>r[0]['实装']=''],
 ['negative actual quantity',(c,r)=>r[0]['实装']='-3米'],
 ['duplicate target',(c)=>c.rules.push({...c.rules[0],ruleId:'other'})],
 ['invalid target',(c)=>c.rules[0].targetField='approved'],
 ['partial output not successful',(c)=>c.rules.pop()],
 ['extra rule field',(c)=>c.rules[0].script='danger'],
 ['source path disclosure',(c)=>c.rules[0].sourceFields=['/different']],
 ['numeric factor is not accepted',(c)=>c.rules[1].parameters.steps.push({op:'scale',factor:0.01})],
 ['numeric condition must retain original text',(c)=>c.rules[0].conditions=[{path:'/实装',equals:1.0000000000000001}]],
 ['unmet applicability',(c)=>c.rules[0].conditions=[{path:'/职责',equals:'供料及安装'}]],
 ['noncanonical decimal',(c,r)=>r[0]['实装']='1e3米'],
 ['empty rows',(c,r)=>r.splice(0)],
])test(name,{skip:!api},()=>{let c=config(),r=rows(),s={...scope};mutate(c,r,s);try{assert.notEqual(api.transformRows(c,r,s).status,'PASSED');}catch(e){if(e.code==='ERR_ASSERTION')throw e;}});
test('zero is retained',{skip:!api},()=>{const r=rows();r[0]['实装']='0米';assert.equal(api.transformRows(config(),r,scope).rows[0].output.installedQuantity,0);});
test('decimal scaling is exact',{skip:!api},()=>{const c=config();c.rules[1]=rule('installedQuantity','/实装',[{op:'decimal'},{op:'scale',factor:'0.01'}]);const r=rows();r[0]['实装']='1850';assert.equal(api.transformRows(c,r,scope).rows[0].output.installedQuantity,18.5);});
test('alternative headers conflict is held',{skip:!api},()=>{const c=config();c.rules[1].sourceFields=['/a','/b'];c.rules[1].parameters.steps=[{op:'firstOf',paths:['/a','/b']},{op:'decimal'}];const r=rows();r[0].a='18';r[0].b='19';assert.equal(api.transformRows(c,r,scope).status,'NEEDS_INFORMATION');});
