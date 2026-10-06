import type {ProviderFact} from './providers.ts';

// Source records, field definitions and downloadable workbooks share these exact values.
export function providerSample(p: ProviderFact) {
  const variants = [
    ['安装项目','实际安装数量','单位','供料方','服务范围'],
    ['施工项目','实装数量','计量单位','材料提供方','施工范围'],
    ['项目名称','完成数量','单位','供料单位','施工内容'],
  ];
  const names=variants[(Number(p.providerId.slice(3))-1)%variants.length];
  const meanings=['实际安装项目名称','实际安装数量','实际安装数量的计量单位','材料提供方','本行实际完成的施工服务范围'];
  const values=[['桥架安装','12','米','服务商','供料及安装'],['电缆敷设','45','米','京东','仅安装']];
  return {
    rows:values.map(row=>Object.fromEntries(names.map((name,i)=>[name,row[i]]))),
    sheetRows:[names,...values],
    fields:names.map((fieldKey,i)=>({fieldKey,label:fieldKey,meaning:p.formatCondition==='meaning_unknown'&&i===1?null:meanings[i],unit:null})),
  };
}
