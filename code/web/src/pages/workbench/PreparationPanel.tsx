import { DetailActions } from '../detail/DetailActions';
import { useState } from 'react';
import { apiFetch } from '../../api';
import { useApiData } from '../../hooks';
import { Skeleton } from '../../components/PageShell';
import { ActionStatus, Panel, ReadError, allowed, itemPath, useAction, versions, type PanelProps } from './ActionShared';
import { DRAFT_FIELDS, draftChanges, uploadForm, type DraftItem } from './action-request';
import { BusinessValue, EvidenceLinks, type EvidenceRef } from './EvidenceView';

type DraftView = { draftVersionId: string | null; versionNo: number | null; origin?: string; items: DraftItem[]; sourceMaterials: EvidenceRef[]; openQuestions: unknown[]; editNotes?: unknown[] };
export function MaterialUpload({ item, onChanged, purpose = 'INSTALLATION_MATERIAL', onUploaded }: PanelProps & { purpose?: string; onUploaded?: (id: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const action = useAction(onChanged);
  const uploaded = action.state.result?.materialVersionId;
  const excel=purpose==='PROVIDER_FORMAT';
  return <div className="upload-area"><label><strong>{excel?'选择 Excel 安装明细表':'选择材料'}</strong><span className="state-desc">{excel?'支持 .xlsx，最大 10 MB；首行为列名，每行一项安装明细。':'PDF、PNG、JPEG、XLSX，最大 10 MB'}</span><input aria-label={excel?'选择 Excel 安装明细表':'选择材料'} type="file" accept={excel?'.xlsx':'.pdf,.png,.jpg,.jpeg,.xlsx'} disabled={action.busy} onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label><button className="btn-primary" disabled={!file || action.busy || !!item.pendingOperation} onClick={() => file && action.run('/api/admin/charging/uploads', uploadForm(item, file, purpose), `上传文件「${file.name}」`)}>{action.busy?'上传中…':excel?'上传 Excel':'上传材料'}</button><ActionStatus action={action} onRefresh={onChanged} />{onUploaded && typeof uploaded === 'string' && <button className="btn-link" onClick={() => onUploaded(uploaded)}>将此材料版本附于回复</button>}</div>;
}
export function PreparationPanel({ item, onChanged }: PanelProps) {
  const [view, reload] = useApiData(() => apiFetch<DraftView>(itemPath(item, 'installation-draft')), [item.workItemId, item.rowVersion], true);
  const [edit, setEdit] = useState<{ versionId: string; original: DraftItem[]; rows: DraftItem[] } | null>(null);
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const refresh = () => { reload(); onChanged(); };
  const save = useAction(() => { setEdit(null); setReason(''); refresh(); });
  const submit = useAction(refresh);
  const data = view.status === 'ready' ? view.data : null;
  const canEdit = allowed(item, 'CONFIRM_INSTALLATION_DRAFT');
  const canSubmit = canEdit && allowed(item, 'SUBMIT_INSTALLATION_DETAIL');
  const busy = save.busy || submit.busy || !!item.pendingOperation || (view.status === 'ready' && (!!view.refreshing || !!view.refreshError));
  return <Panel title="安装资料确认">{view.status === 'loading' && <Skeleton lines={3} />}{view.status === 'failed' && <ReadError error={view.error} retry={reload} />}{view.status === 'ready' && !!view.refreshError && <ReadError error={view.refreshError} retry={reload} />}{data && <>
    <p>草稿版本：{data.versionNo ?? '尚未形成'} · 来源：{data.origin === 'HUMAN' ? '人员修订' : data.origin === 'AI' ? '后台整理' : '查看修改记录'}</p>
    {!data.draftVersionId && <p className="state-desc">当前尚无可提交草稿。材料准备与分析完成后刷新查看。</p>}
    {edit && edit.versionId !== data.draftVersionId && <div className="action-error">草稿已更新；编辑内容已保留。请对照最新草稿逐项核实。<details><summary>查看最新草稿</summary><BusinessValue value={data.items} /></details><button className="btn-link" onClick={() => setEdit({ ...edit, versionId: data.draftVersionId!, original: data.items })}>已核实，基于最新草稿继续保存当前输入</button></div>}
    <div className="table-scroll"><table className="business-table"><thead><tr>{['安装项目', '实际数量', '单位', '供料方', '服务范围'].map((title) => <th key={title}>{title}</th>)}</tr></thead><tbody>{(edit?.rows ?? data.items).map((row, index) => <tr key={index}>{DRAFT_FIELDS.map((field) => <td key={field}>{edit ? <input aria-label={`第${index + 1}行${field}`} type={field === 'installedQuantity' ? 'number' : 'text'} min={field === 'installedQuantity' ? '0' : undefined} step="any" value={row[field] ?? ''} placeholder="待核实" onChange={(e) => setEdit({ ...edit, rows: edit.rows.map((r, i) => i === index ? { ...r, [field]: field === 'installedQuantity' ? e.target.value === '' ? null : Number(e.target.value) : e.target.value || (field === 'installationItem' ? '' : null) } : r) })} /> : row[field] ?? <span className="state-desc">待核实</span>}</td>)}</tr>)}</tbody></table></div>
    {!!data.editNotes?.length && <details><summary>查看人员修改记录</summary><BusinessValue value={data.editNotes} /></details>}<h4>缺项与冲突</h4><BusinessValue value={data.openQuestions} /><h4>原始材料与依据</h4><EvidenceLinks refs={data.sourceMaterials} item={item} />
    <DetailActions title="确认安装资料">{canEdit && data.draftVersionId && <div className="form-row">{!edit ? <button className="btn-primary" disabled={busy} onClick={() => setEdit({ versionId: data.draftVersionId!, original: data.items, rows: data.items.map((r) => ({ ...r })) })}>修订草稿明细</button> : <><label>修改原因<input value={reason} onChange={(e) => setReason(e.target.value)} /></label><button className="btn-primary" disabled={busy || !reason.trim() || edit.versionId !== data.draftVersionId || !draftChanges(edit.original, edit.rows, reason).length} onClick={() => save.run(itemPath(item, 'installation-draft'), { ...versions(item), expectedDraftVersionId: edit.versionId, items: edit.rows, editNotes: draftChanges(edit.original, edit.rows, reason.trim()) }, '保存完整明细为新草稿版本', 'PUT')}>保存草稿新版本</button><button className="btn-link" disabled={busy} onClick={() => setEdit(null)}>取消修订</button></>}</div>}
    <ActionStatus action={save} onRefresh={refresh} />
    {canSubmit && data.draftVersionId && <div className="form-row"><label>确认说明<input value={comment} onChange={(e) => setComment(e.target.value)} /></label><button className="btn-primary" disabled={busy || !!edit} onClick={() => submit.run(itemPath(item, 'installation-submissions'), { ...versions(item), draftVersionId: data.draftVersionId, comment: comment || null }, '确认当前完整草稿并提交正式安装明细')}>确认并提交正式明细</button></div>}
    <ActionStatus action={submit} onRefresh={refresh} /></DetailActions>
  </>}</Panel>;
}
