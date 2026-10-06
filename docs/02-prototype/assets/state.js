(function(root){
'use strict';
const roles={review:{name:'林晓',label:'京东 · 安装核查',team:'安装业务组',initial:'林'},finance:{name:'陈璐',label:'京东 · 业务对账',team:'安装业务组',initial:'陈'},supplier:{name:'周敏',label:'安家安装 · 资料人员',team:'服务商工作台',initial:'周',provider:'安家安装'},accountant:{name:'赵明',label:'城南安装 · 应收负责人',team:'服务商工作台',initial:'赵',provider:'城南安装'},integrator:{name:'林宇',label:'远程机电 · 接入对接',team:'服务商工作台',initial:'林',provider:'远程机电'},logistics:{name:'李晨',label:'京东物流 · 履约协同',team:'履约协同组',initial:'李'}};
const kindNames={audit:'安装资料核查',extract:'安装资料整理',billing:'费用差异核实',mapping:'接入配置确认',coordination:'履约协同'};
const docs={
 change:{name:'现场变更确认单.pdf',category:'变更依据',page:'第 3 页 / 共 4 页',heading:'现场安装变更确认单',site:'春和庭',rows:[['变更项目','桥架安装'],['原方案','12 米'],['实际安装','18 米'],['变更原因','现场需绕行消防通道，增加桥架 6 米'],['确认情况','用户、安装人员已确认']],quote:'同意按现场绕行方案施工，桥架调整为 18 米。',footer:'安装人员：王师傅　用户确认：已签字　2026-09-18'},
 acceptance:{name:'竣工验收单.pdf',category:'安装事实',page:'第 1 页 / 共 2 页',heading:'家用充电桩安装验收单',site:'桂语庭',rows:[['实际布线','45 米'],['桥架安装','12 米'],['桥架供料方','物业'],['服务商工作','仅负责桥架安装'],['调试结果','设备通电正常']],quote:'实际布线 45 米；桥架 12 米由物业提供，服务商仅安装。',footer:'安装服务商：安家安装　2026-09-18'},
 fee:{name:'施工验收签字单.pdf',category:'安装事实',page:'第 1 页 / 共 1 页',heading:'施工完成确认',site:'尚澜府',rows:[['方案布线','30 米'],['实际布线','42 米'],['增加布线','12 米'],['施工确认','用户已确认施工完成'],['费用确认','本文件未记载额外费用批准']],quote:'确认本次实际完成布线 42 米，设备通电正常。',footer:'本材料证明施工事实；费用批准需另行核实。'},
 contract:{name:'安装服务费用约定.pdf',category:'合同条款',page:'第 2 页 / 共 6 页',heading:'安装服务费用及范围',site:'城南安装',rows:[['基础安装','300 元 / 单'],['服务范围','基础安装包含设备入场搬运'],['桥架综合施工','按确认工程量计取'],['额外费用','需有对应批准依据']],quote:'基础安装服务费用已包含设备搬运，不另行计取入场搬运费用。',footer:'适用对象：本工单基础安装服务'},
 table:{name:'远程机电施工明细.xlsx',category:'字段与数据',page:'施工记录 · 工作表 1',heading:'施工记录字段说明',site:'江畔里',rows:[['电缆分段长度','8 米、24 米、13 米'],['桥架材料','24 米'],['桥架安装','24 米'],['记录含义','桥架材料与安装对应同一段施工']],quote:'电缆按不重叠路段记录；桥架材料与安装分别表示同一段桥架的供料和人工。',footer:'服务商字段说明与施工记录'},
 note:{name:'施工说明.pdf',category:'安装事实',page:'第 1 页 / 共 1 页',heading:'施工说明',site:'锦绣里',rows:[['布线长度','52 米'],['桥架','未安装'],['情况说明','原备注中的 22 米为额外长度']],quote:'实际布线 52 米，桥架未安装。',footer:'安装人员现场记录'}
};
function makeTask(id,kind,site,provider,owner,title,summary,extra={}){return {id,kind,site,provider,owner,title,summary,status:'ready',priority:'普通',order:'AZ-260918-'+id,updated:new Date(Date.now()-2700000).toTimeString().slice(0,5),version:1,docs:[],history:[{actor:'系统',action:'自动分析完成',note:summary,time:new Date(Date.now()-2700000).toLocaleString('sv-SE')}],...extra};}
function seed(){return {schema:1,role:'review',tasks:{
 bridge:makeTask('bridge','audit','春和庭','安家安装','review','桥架增加 6 米，变更依据已找到','实际桥架 18 米，方案 12 米。已定位现场变更确认单，请核实依据后作出审核决定。',{order:'AZ-260918-021',priority:'优先处理',docs:['change'],canApprove:true}),
 fee:makeTask('fee','audit','尚澜府','安家安装','review','施工已验收，额外费用依据待核实','实际布线增加 12 米。现有签字证明施工完成，尚不足以证明额外费用已获批准。',{order:'AZ-260918-018',docs:['fee'],canApprove:false}),
 failed:makeTask('failed','audit','锦绣里','安家安装','review','附件读取未完成','施工说明未成功读取，当前无法形成完整核查结果。',{order:'AZ-260918-016',status:'failed',docs:['note'],canApprove:true,history:[{actor:'系统',action:'材料读取失败',note:'施工说明未成功读取，需恢复读取后核查。',time:new Date(Date.now()-2700000).toLocaleString('sv-SE')}]}),
 draft:makeTask('draft','extract','桂语庭','安家安装','supplier','安装资料已整理，请确认施工事实','已从验收单提取实际布线与供料信息，费用表中的超长布线未作为实际安装量。',{order:'AZ-260918-012',docs:['acceptance'],fields:{cable:45,bridge:12,supply:'物业',scope:'仅安装'}}),
 billing:makeTask('billing','billing','云栖苑','城南安装','finance','账单相差 60 元，集中在入场搬运','桥架材料与安装合计一致。基础安装已包含搬运，单列 60 元需与服务商核实。',{order:'AZ-260918-008',docs:['contract'],jdTotal:660,localTotal:720,moving:60,billVersion:1}),
 mapping:makeTask('mapping','mapping','江畔里','远程机电','integrator','施工明细配置已准备，需确认两项含义','已识别分段电缆与桥架材料、安装记录，请确认数量含义后启用配置。',{order:'CFG-YC-002',docs:['table'],configVersion:1}),
 coordination:makeTask('coordination','coordination','澜山府','安家安装','logistics','物业入场时间待确认','服务商已反馈施工安排受物业入场时间影响，请协调可施工时间。',{order:'AZ-260919-006'}),
 normal:makeTask('normal','audit','溪岸花园','安家安装','review','安装资料已核查通过','安装事实与方案一致，原业务审核已完成。',{order:'AZ-260917-003',status:'done',canApprove:true,history:[{actor:'林晓',action:'审核通过',note:'安装事实与方案一致。',time:'2026-09-19 16:20'}]})
}};}
function canSee(t,role){const r=roles[role];if(!r)return false;if(r.provider)return t.provider===r.provider;return true;}
function relevant(t,role){if(role==='review')return t.kind==='audit';if(role==='finance')return t.kind==='billing';if(role==='supplier')return t.provider==='安家安装'&&['audit','extract','coordination'].includes(t.kind);if(role==='accountant')return t.kind==='billing'&&t.provider==='城南安装';if(role==='integrator')return t.kind==='mapping'&&t.provider==='远程机电';return t.kind==='coordination';}
function transition(original,id,actor,action,p={}){
 const s=JSON.parse(JSON.stringify(original)),t=s.tasks[id];if(!t)throw Error('事项不存在');
 if(actor==='system'){if(action!=='analyzed'||t.status!=='processing')throw Error('当前无待完成的分析');t.status=t.kind==='billing'&&t.localTotal===t.jdTotal?'done':'ready';t.summary=t.kind==='billing'?(t.status==='done'?'新版应收与京东账单核对一致；后续按原结算流程办理。':'新版应收仍有差异，请继续核实费用依据。'):(t.id==='failed'?'施工说明已读取，实际布线 52 米、桥架未安装，请核实与方案的差异。':'补充材料已关联原事项，请结合本次回复继续核查。');if(t.kind==='billing')t.title=t.status==='done'?'新版账单已核对一致':`账单仍相差 ${t.localTotal-t.jdTotal} 元，请核实费用依据`;else if(t.id==='failed')t.title='材料已读取，请核实安装差异';t.version++;delete t.finishAt;t.history.push({actor:'系统',action:t.status==='done'?'核对一致':'分析结果已更新',note:t.summary,time:new Date().toLocaleString('sv-SE')});return s;}
 if(!canSee(t,actor)||t.owner!==actor)throw Error('当前身份没有该操作权限');
 if(['done','processing'].includes(t.status)||(t.status==='exception'&&!['closeException','saveProgress'].includes(action)))throw Error('事项状态已变化，请刷新后查看');
 const note=String(p.note||'').trim();let label='';
 if(['request','reply','exception','revise','resolve','closeException','saveProgress'].includes(action)&&note.length<4)throw Error('请填写至少 4 个字的具体说明');
 if(action==='approve') {if(t.kind!=='audit'||!t.canApprove)throw Error('费用批准依据不足，请补充核实或转异常处理');t.status='done';t.title=t.site+'安装资料已核查通过';label='审核通过';}
 else if(action==='request'){if(!['review','finance'].includes(actor))throw Error('无权限发起核实');t.request=note;t.status='waiting';t.owner=t.kind==='billing'?'accountant':'supplier';label=t.kind==='billing'?'发起费用核实':'退回补充';}
 else if(action==='reply'){if(!['supplier','accountant'].includes(actor))throw Error('无权限提交回复');t.reply=note;if(p.doc&&docs[p.doc]&&!t.docs.includes(p.doc))t.docs.push(p.doc);if(p.fileName)t.uploadName=String(p.fileName);if(p.upload)t.upload=p.upload;t.owner=t.kind==='billing'?'finance':'review';t.status='processing';t.finishAt=Date.now()+1400;label='提交补充回复';}
 else if(action==='saveProgress'){
  if(t.status!=='exception'&&t.kind!=='coordination')throw Error('当前事项无需保存协同进展');
  t.progressNote=note;label='保存处理进展';
 }
 else if(action==='closeException'){
  if(t.status!=='exception')throw Error('当前事项不在异常处理阶段');
  const existing=Object.values(s.tasks).find(x=>x.id!==id&&x.order===t.order&&x.provider===t.provider&&x.kind===t.kind&&x.status!=='done');
  const nextId=existing?.id||id+'-followup';
  if(!existing){
   const next=JSON.parse(JSON.stringify(t));
   Object.assign(next,{id:nextId,sourceTaskId:id,scenarioId:t.scenarioId||t.id,status:t.beforeException?.status||'ready',title:t.beforeException?.title||t.site+'业务待继续处理',updated:'刚刚'});
   delete next.beforeException;delete next.progressNote;delete next.completion;delete next.followupId;
   next.history.push({actor:'系统',action:'接续原业务',note:'异常处理结果：'+note+'；原业务仍须按职责办理。',time:new Date().toLocaleString('sv-SE')});
   s.tasks[nextId]=next;
  }
  t.followupId=nextId;t.completion='exception';t.status='done';
  t.title=t.site+'异常处理已结束，原业务继续办理';label='异常处理完成';
 }
 else if(action==='exception'){t.beforeException={status:t.status,title:t.title};t.status='exception';label='转异常处理';}
 else if(action==='retry'){if(t.status!=='failed')throw Error('当前无需重试');t.status='processing';t.finishAt=Date.now()+1400;label='重新读取材料';}
 else if(action==='submit'){if(t.kind!=='extract')throw Error('当前事项不支持资料提交');if(!Number.isFinite(p.cable)||p.cable<=0||!Number.isFinite(p.bridge)||p.bridge<0)throw Error('请填写有效的实际安装数量');if(!['物业','服务商'].includes(p.supply)||!['仅安装','供料及安装'].includes(p.scope))throw Error('请完整确认供料方与服务范围');if(p.supply==='物业'&&p.scope!=='仅安装')throw Error('物业供料时，服务商范围应为仅安装');t.fields={cable:p.cable,bridge:p.bridge,supply:p.supply,scope:p.scope};t.status='done';t.title='安装资料已提交，进入京东核查';s.tasks.garden=makeTask('garden','audit','桂语庭','安家安装','review','供料方发生变化，请核实安装依据','资料人员已提交实际安装结果，桥架由物业供料，请核实供料方与服务范围变化。',{order:t.order,docs:[...t.docs],canApprove:true,fields:{...t.fields},updated:'刚刚',history:[{actor:'系统',action:'根据正式资料形成核查事项',note:'实际资料已提交，供料方与服务范围存在变化。',time:new Date().toLocaleString('sv-SE')}]});label='提交正式安装资料';}
 else if(action==='revise'){if(actor!=='accountant'||t.kind!=='billing')throw Error('无权限修订应收');if(!Number.isFinite(p.moving)||p.moving<0)throw Error('请输入有效的搬运费用');t.moving=p.moving;t.localTotal=660+p.moving;t.billVersion++;t.owner='finance';t.status='processing';t.finishAt=Date.now()+1400;t.reply=note;label='原应收已修订并同步';}
 else if(['editMapping','trial','enable'].includes(action)){
  if(t.kind!=='mapping')throw Error('当前事项不支持配置操作');
  const candidate={cableMeaning:p.cableMeaning||'',bridgeRule:p.bridgeRule||''};
  if(action==='editMapping'){
   t.candidate=candidate;delete t.trial;return s;
  }
  if(candidate.cableMeaning!=='actual'||candidate.bridgeRule!=='once')throw Error('当前含义与已提供材料不一致，请核实分段和桥架记录');
  const signature=JSON.stringify([t.provider,t.configVersion,t.version,t.docs,candidate]);
  if(action==='trial'){
   t.candidate=candidate;t.trial={signature,version:t.configVersion+1,time:new Date().toLocaleString('sv-SE')};label='当前配置试转换完成';
  }else{
   if(t.trial?.signature!==signature)throw Error('请先完成当前配置的试转换；修改含义后需重新试转换');
   t.status='done';t.configVersion++;t.title='施工明细配置 V'+t.configVersion+' 已生效';label='启用接入配置';
  }
 }
 else if(action==='resolve'){if(actor!=='logistics')throw Error('无权限处理履约协同');t.status='done';t.title=t.site+'本次履约协同已完成';t.summary=note;label='履约协同已完成';}
 else throw Error('不支持的操作');
 t.updated='刚刚';t.history.push({actor:roles[actor].name,action:label,note:note||'按当前材料及业务职责确认。',time:new Date().toLocaleString('sv-SE')});return s;
}
const api={seed,roles,docs,kindNames,canSee,relevant,transition};if(typeof module!=='undefined')module.exports=api;else root.Prototype=api;
})(typeof window!=='undefined'?window:globalThis);
