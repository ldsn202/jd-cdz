// Executable conversion rules. No eval, network, file operations or model calls.
export const CATALOG='charging-transform-1';
export const TARGETS={INSTALLATION:['installationItem','installedQuantity','unit','materialSupplier','serviceScope'],RECONCILIATION:['itemName','chargeScope','billedQuantity','unit','unitPrice','amount','currency']};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const nonempty=x=>typeof x==='string'&&x.trim()!=='';
function ensure(ok,message){if(!ok)throw new Error(message);}
function keys(x,fields){ensure(object(x)&&Object.keys(x).sort().join('|')===[...fields].sort().join('|'),'规则字段不符合目录');}
function pathOK(p){return nonempty(p)&&p.startsWith('/')&&!/~(?![01])/.test(p);}
function read(row,path){let value=row;for(const p of path.slice(1).split('/')){const key=p.replace(/~1/g,'/').replace(/~0/g,'~');ensure(object(value)||Array.isArray(value),'源位置不存在：'+path);ensure(Object.hasOwn(value,key),'源字段缺失：'+path);value=value[key];}return value;}
function decimal(value){
 ensure((typeof value==='number'&&Number.isFinite(value))||typeof value==='string','非十进制数值');
 const s=String(value);ensure(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(s)&&s.length<=64,'十进制格式无效');
 const [whole,fraction='']=s.split('.');const sign=whole.startsWith('-')?-1n:1n;
 return {n:BigInt(whole.replace('-','')+fraction)*sign,scale:fraction.length};
}
function formatted({n,scale}){const neg=n<0n;if(neg)n=-n;let s=n.toString().padStart(scale+1,'0');if(scale)s=s.slice(0,-scale)+'.'+s.slice(-scale);s=s.includes('.')?s.replace(/0+$/,'').replace(/\.$/,''):s;return(neg&&n!==0n?'-':'')+s;}
function product(a,b){a=decimal(a);b=decimal(b);return formatted({n:a.n*b.n,scale:a.scale+b.scale});}
const SOURCES=['field','firstOf','const'];
const OPS={field:['op','path'],firstOf:['op','paths'],const:['op','value'],trim:['op'],halfwidth:['op'],stripSuffix:['op','value'],decimal:['op'],scale:['op','factor'],lookup:['op','entries','onMiss']};
export function validateConfig(c){
 keys(c,['ruleCatalogVersion','purpose','sourceFormatId','sourceFormatVersion','rowPath','rules']);
 ensure(c.rowPath===''||pathOK(c.rowPath),'明细行路径无效');
 ensure(c.ruleCatalogVersion===CATALOG&&Object.hasOwn(TARGETS,c.purpose),'转换目录或用途未登记');
 ensure(nonempty(c.sourceFormatId)&&nonempty(c.sourceFormatVersion),'格式与版本必须明确');
 ensure(Array.isArray(c.rules)&&c.rules.length>0&&c.rules.length<=32,'规则数量无效');
 const ids=new Set(),targets=new Set();
 for(const r of c.rules){
  keys(r,['ruleId','sourceFields','targetField','operation','parameters','conditions']);
  ensure(nonempty(r.ruleId)&&!ids.has(r.ruleId),'规则编号重复或空');ids.add(r.ruleId);
  ensure(TARGETS[c.purpose].includes(r.targetField)&&!targets.has(r.targetField),'目标未登记或重复');targets.add(r.targetField);
  ensure(r.operation==='PIPELINE','只支持 PIPELINE');keys(r.parameters,['steps']);
  ensure(Array.isArray(r.sourceFields)&&r.sourceFields.every(pathOK)&&new Set(r.sourceFields).size===r.sourceFields.length,'源字段无效');
  ensure(Array.isArray(r.conditions),'条件须为数组');
  for(const cond of r.conditions){keys(cond,['path','equals']);ensure(pathOK(cond.path)&&(typeof cond.equals==='string'||typeof cond.equals==='boolean'),'条件无效');}
  const steps=r.parameters.steps;ensure(Array.isArray(steps)&&steps.length>0&&steps.length<=16,'转换步骤数量无效');
  for(const [i,s] of steps.entries()){
   ensure(object(s)&&Object.hasOwn(OPS,s.op),'未知算子');keys(s,OPS[s.op]);
   ensure(i===0?SOURCES.includes(s.op):!SOURCES.includes(s.op),'取值算子只允许在第一步');
   if(s.op==='field')ensure(pathOK(s.path),'源路径无效');
   if(s.op==='firstOf')ensure(Array.isArray(s.paths)&&s.paths.length>=2&&s.paths.every(pathOK),'备用源路径无效');
   if(s.op==='const')ensure(typeof s.value==='string'||s.value===null,'常量只允许字符串或 null');
   if(s.op==='stripSuffix')ensure(nonempty(s.value),'后缀无效');
   if(s.op==='scale')ensure(typeof s.factor==='string'&&decimal(s.factor).n>0n,'换算比例必须为正');
   if(s.op==='lookup'){
    ensure(s.onMiss==='HOLD'&&Array.isArray(s.entries)&&s.entries.length>0&&s.entries.length<=1000,'对照表须明确未命中待处理');
    const seen=new Set();for(const e of s.entries){keys(e,['from','to']);ensure(nonempty(e.from)&&nonempty(e.to)&&!seen.has(e.from),'对照表多义或空');seen.add(e.from);}
   }
  }
  const used=steps[0].op==='field'?[steps[0].path]:steps[0].op==='firstOf'?steps[0].paths:[];
  ensure([...used].sort().join('|')===[...r.sourceFields].sort().join('|'),'源字段声明与实际读取不同');
 }
 return c;
}
function execute(rule,row){
 for(const condition of rule.conditions)ensure(read(row,condition.path)===condition.equals,'适用条件不成立：'+condition.path);
 let value;
 for(const s of rule.parameters.steps){
  switch(s.op){
   case 'field':value=read(row,s.path);break;
   case 'const':value=s.value;break;
   case 'firstOf':{
    const values=[];for(const p of s.paths){try{const x=read(row,p);if(x!==null&&x!=='')values.push(x);}catch{/* absent alternate */}}
    ensure(values.length>0,'备用字段均缺失');ensure(new Set(values.map(x=>JSON.stringify(x))).size===1,'新旧字段值冲突');value=values[0];break;
   }
   case 'trim':ensure(typeof value==='string','trim 需要原字符串');value=value.trim();break;
   case 'halfwidth':ensure(typeof value==='string','halfwidth 需要原字符串');value=value.replace(/[！-～]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xfee0)).replace(/　/g,' ');break;
   case 'stripSuffix':ensure(typeof value==='string'&&value.endsWith(s.value),'声明的单位后缀不匹配');value=value.slice(0,-s.value.length).trim();break;
   case 'decimal':value=formatted(decimal(value));break;
   case 'scale':value=product(value,s.factor);break;
   case 'lookup':{const hit=s.entries.find(e=>e.from===value);ensure(hit,'对照表未命中');value=hit.to;break;}
  }
 }
 if(rule.targetField==='installedQuantity'){
  const exact=formatted(decimal(value));const n=Number(exact);
  ensure(n>=0&&Number.isFinite(n)&&n<=Number.MAX_SAFE_INTEGER&&formatted(decimal(n))===exact,'实际数量无效或精度损失');value=n;
 }else if(['billedQuantity','unitPrice','amount'].includes(rule.targetField)){
  value=value===null?null:formatted(decimal(value));
 }else ensure(nonempty(value),'必需文本为空或未知');
 return value;
}
export function transformRows(config,rows,scope){
 validateConfig(config);ensure(Array.isArray(rows)&&rows.length>0&&rows.length<=10000,'样例为空或超过开发批量限制');
 for(const k of ['purpose','sourceFormatId','sourceFormatVersion'])ensure(scope[k]===config[k],'输入不在配置适用范围：'+k);
 const missing=TARGETS[config.purpose].filter(t=>!config.rules.some(r=>r.targetField===t));
 const converted=rows.map((row,index)=>{
  ensure(object(row),'原行必须为对象');const output={},ruleResults=[];
  for(const rule of config.rules){
   try{output[rule.targetField]=execute(rule,row);ruleResults.push({ruleId:rule.ruleId,status:'PASSED',sourceFields:rule.sourceFields,output:output[rule.targetField],issues:[]});}
   catch(e){output[rule.targetField]=null;ruleResults.push({ruleId:rule.ruleId,status:'NEEDS_INFORMATION',sourceFields:rule.sourceFields,output:null,issues:[e.message]});}
  }
  return{rowIndex:index,output,ruleResults};
 });
 const issues=missing.map(k=>'缺少目标规则：'+k);
 for(const row of converted)for(const r of row.ruleResults)if(r.status!=='PASSED')issues.push('行'+row.rowIndex+' '+r.ruleId+' '+r.issues.join('；'));
 return {ruleCatalogVersion:CATALOG,status:issues.length?'NEEDS_INFORMATION':'PASSED',rows:converted,issues};
}
