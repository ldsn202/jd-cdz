import { apiFetch, materialContentUrl } from '../../api';
import { useApiData, fmtTime } from '../../hooks';
import { Skeleton } from '../../components/PageShell';
import { Panel, ReadError, allowed, itemPath, type PanelProps } from './ActionShared';
import { MaterialUpload } from './PreparationPanel';
import { BusinessValue, display } from './EvidenceView';
import {useEffect} from 'react';
import {humanText} from './business-language';
import {MaterialTextReview} from './MaterialTextReview';

type SourceFile = { sourceSystem: string; sourceMaterialId: string; sourceVersion: string; name?: string; mediaType?: string };
type RecordData = { inputId: string; recordType: string; sourceRecordId: string; sourceVersion: string | null; data: Record<string, any> };
type MaterialsView = { records: RecordData[]; sourceMaterials: SourceFile[]; uploads: { materialVersionId: string; name: string; mediaType: string; byteLength: number; sourceVersion: string; uploadedAt: number; parsingStatus: string }[]; mappingUpload?: {name:string;status:string;fields:string[];rows:Record<string,string|null>[];issues:string[]} | null; issues: string[]; sourceError: string | null; retrievedAt: string };
const TITLES: Record<string, string> = { PROVIDER_RECORD: '服务商原始资料', PROVIDER_FORMAT: '来源字段说明', INSTALLATION_WORK_ORDER: '安装工单', INSTALLATION_PLAN: '安装方案', INSTALLATION_DETAIL: '正式安装明细', PURCHASE_ORDER: '购买订单', INSTALLATION_ENTITLEMENT: '安装权益', JD_BILL: '京东账单', PROVIDER_RECEIVABLE: '服务商应收', BILLING_TERM: '计费条款', FEE_APPROVAL_RECORD: '费用审批依据', SUPPLEMENTAL_RESPONSE: '已提交的补充回复' };
const fileType = (name: string, mime?: string) => ({ 'application/pdf': 'PDF', 'image/png': 'PNG 图片', 'image/jpeg': 'JPEG 图片', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel 工作簿' }[mime ?? ''] ?? name.split('.').pop()?.toUpperCase() ?? '类型待核实');

function OriginalRows({raw}:{raw:string}) {
  try {
    const value=JSON.parse(raw), rows=Array.isArray(value)?value:Array.isArray(value.rows)?value.rows:[value];
    const fields=[...new Set<string>(rows.flatMap((row:Record<string,unknown>)=>Object.keys(row)))];
    return <div className="table-scroll"><table className="business-table"><thead><tr><th>行</th>{fields.map(field=><th key={field}>{humanText(field)}</th>)}</tr></thead><tbody>{rows.map((row:Record<string,unknown>,i:number)=><tr key={i}><td>{i+1}</td>{fields.map(field=><td key={field}><BusinessValue value={row[field]} /></td>)}</tr>)}</tbody></table></div>;
  }catch{return <p>原资料格式无法展示为表格，请下载原文件核对。</p>;}
}

function SourceRecord({ record }: { record: RecordData }) {
  const d = record.data;
  if (record.recordType === 'PROVIDER_RECORD') return <article className="source-record"><h4>原表内容</h4><p className="state-desc">{d.contentComplete?'已取得原始数据，可与上传文件和映射结果对照。':'原始资料尚不完整，请核实缺项。'}</p>{typeof d.rawJson === 'string' ? <OriginalRows raw={d.rawJson} /> : <p>请下载原文件查看。</p>}{d.missingParts?.length > 0 && <p className="action-error">{d.missingParts.map(humanText).join('；')}</p>}<details><summary>来源与原始数据详情</summary><p>{record.sourceRecordId} · {record.sourceVersion} · {display(d.sourceRecord?.sourceFormatId)}</p><pre className="source-json">{d.rawJson}</pre></details></article>;
  if (record.recordType === 'PROVIDER_FORMAT') return <article className="source-record"><h4>来源字段说明</h4><p className="state-desc">{record.sourceRecordId} · 说明版本 {record.sourceVersion ?? '未提供'}</p>{d.notes && <p>{d.notes}</p>}<div className="table-scroll"><table className="business-table"><thead><tr><th>原字段</th><th>字段名称</th><th>业务含义</th><th>单位</th></tr></thead><tbody>{(d.fields ?? []).map((field: {fieldKey:string;label:string;meaning:string|null;unit:string|null}, i: number) => <tr key={i}><td>{field.fieldKey}</td><td>{field.label}</td><td>{field.meaning ?? '未提供'}</td><td>{field.unit ?? '—'}</td></tr>)}</tbody></table></div></article>;
  return <details className="source-record"><summary>{TITLES[record.recordType] ?? record.recordType} · {record.sourceRecordId}</summary><p className="state-desc">来源版本 {record.sourceVersion ?? '未提供'}</p><BusinessValue value={d} /></details>;
}

export function BusinessMaterialsPanel({ item, onChanged }: PanelProps) {
  const [state, reload] = useApiData(() => apiFetch<MaterialsView>(itemPath(item, 'business-materials')), [item.workItemId, item.rowVersion], true);
  const parsing=state.status==='ready' && state.data.mappingUpload?.status==='PARSING';
  useEffect(()=>{if(!parsing)return;const timer=window.setInterval(reload,2000);return ()=>window.clearInterval(timer);},[parsing,reload]);
  const refresh = () => { reload(); onChanged(); };
  const purpose = item.kind === 'CONFIGURATION' && allowed(item, 'ENABLE_INTEGRATION_CONFIG') ? 'PROVIDER_FORMAT'
    : item.kind === 'INSTALLATION_PREPARATION' && allowed(item, 'CONFIRM_INSTALLATION_DRAFT') ? 'INSTALLATION_MATERIAL' : null;
  return <Panel title={item.kind==='CONFIGURATION' ? 'Excel 安装明细与映射材料' : '业务资料与原文件'}>
    <p className="state-desc">查看来源资料和已上传材料，无需先运行分析。<button className="btn-link" onClick={reload}>刷新材料</button></p>
    {item.kind==='CONFIGURATION' && <p className="mapping-steps">1. 下载或上传 Excel　 →　2. 核对原表　 →　3. 运行分析　 →　4. 查看字段映射</p>}
    {item.kind==='CONFIGURATION' && state.status==='ready' && state.data.sourceMaterials.filter(file=>file.mediaType?.includes('spreadsheetml')).map(file=><a key={file.sourceMaterialId} className="btn-secondary sample-download" href={itemPath(item,'business-materials/content')+'?'+new URLSearchParams({sourceSystem:file.sourceSystem,sourceMaterialId:file.sourceMaterialId,sourceVersion:file.sourceVersion})} download>下载 Excel 样表 · {file.name}</a>)}
    {purpose && <div className="source-upload"><MaterialUpload item={item} onChanged={refresh} purpose={purpose} /><p className="state-desc">上传后保留原文件；{item.analysisTriggerMode === 'manual' ? '点击“运行分析”后才开始分析。' : '材料解析后进入分析。'}</p>{purpose === 'PROVIDER_FORMAT' && <p className="state-desc">可先下载上方样表，替换物料和数量后上传。系统使用最近上传的文件进行映射；缺少必要字段时，会列出需要补充的内容。</p>}</div>}
    {state.status === 'loading' && <Skeleton lines={3} />}
    {state.status === 'failed' && <ReadError error={state.error} retry={reload} />}
    {state.status === 'ready' && <>
      {state.refreshError && <ReadError error={state.refreshError} retry={reload} />}
      {state.data.sourceError && <div className="action-error" role="alert">来源资料暂时无法读取：{state.data.sourceError}<button className="btn-link" onClick={reload}>重试读取</button></div>}
      <h4>原始文件 · {state.data.sourceMaterials.length + state.data.uploads.length} 份</h4>
      {state.data.sourceMaterials.length + state.data.uploads.length ? <div className="table-scroll"><table className="business-table"><thead><tr><th>文件名</th><th>类型</th><th>来源</th><th>版本 / 上传时间</th><th>操作</th></tr></thead><tbody>
        {state.data.sourceMaterials.map(file => <tr key={`${file.sourceSystem}:${file.sourceMaterialId}:${file.sourceVersion}`}><td>{file.name || file.sourceMaterialId}</td><td>{fileType(file.name || file.sourceMaterialId, file.mediaType)}</td><td>来源系统</td><td>{file.sourceVersion}</td><td><a className="btn-link" href={itemPath(item, 'business-materials/content') + '?' + new URLSearchParams({ sourceSystem: file.sourceSystem, sourceMaterialId: file.sourceMaterialId, sourceVersion: file.sourceVersion })} download>下载原文件</a></td></tr>)}
        {state.data.uploads.map(file => <tr key={file.materialVersionId}><td>{file.name}</td><td>{fileType(file.name, file.mediaType)}</td><td>本地上传</td><td>{fmtTime(new Date(file.uploadedAt).toISOString())}</td><td><a className="btn-link" href={materialContentUrl(file.materialVersionId)} download>下载原文件</a></td></tr>)}
      </tbody></table></div> : <p className="state-desc">{state.data.sourceError ? '来源文件索引未取得。' : state.data.records.some(r => r.recordType === 'PROVIDER_RECORD' && typeof r.data.rawJson === 'string') ? '来源提供的是结构化明细，原表内容如下。' : '当前来源未提供附件，尚无本地上传文件。'}</p>}
      {state.data.mappingUpload && <article className="source-record"><h4>本次上传的映射样例 · {state.data.mappingUpload.name}</h4>{state.data.mappingUpload.status === 'PARSING' ? <p className="state-desc">文件已保存，正在读取表格；完成后自动显示原始行。</p> : <>{state.data.mappingUpload.issues.map((issue,i)=><p className="action-error" key={i}>{issue}</p>)}{!!state.data.mappingUpload.rows.length && <><p className="state-desc">以下数据直接来自上传文件，共 {state.data.mappingUpload.rows.length} 行。运行分析后在下方查看字段映射与试转换结果。</p><div className="table-scroll"><table className="business-table"><thead><tr><th>行</th>{state.data.mappingUpload.fields.map(field=><th key={field}>{field}</th>)}</tr></thead><tbody>{state.data.mappingUpload.rows.map((row,i)=><tr key={i}><td>{i+1}</td>{state.data.mappingUpload!.fields.map(field=><td key={field}>{row[field] ?? '未提供'}</td>)}</tr>)}</tbody></table></div></>}</>}</article>}
      {state.data.mappingUpload ? <details><summary>查看原系统已有配置资料</summary>{state.data.records.map(record => <SourceRecord key={record.inputId} record={record} />)}</details> : state.data.records.map(record => <SourceRecord key={record.inputId} record={record} />)}
      {!!state.data.issues.length && <details><summary>资料缺项说明 · {state.data.issues.length} 项</summary><ul>{state.data.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul></details>}
      <MaterialTextReview item={item} onChanged={refresh}/>
      <p className="state-desc">读取于 {fmtTime(state.data.retrievedAt)}</p>
    </>}
  </Panel>;
}
