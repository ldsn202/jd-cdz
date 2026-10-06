import {fieldName,ruleDescription} from './business-language';
import { DetailActions } from '../detail/DetailActions';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import { useApiData } from '../../hooks';
import { Skeleton } from '../../components/PageShell';
import { ActionStatus, Panel, ReadError, allowed, itemPath, useAction, versions, type PanelProps } from './ActionShared';
import { canEnableConfiguration } from './action-request';
import { BusinessValue, display } from './EvidenceView';

type Rule = Record<string, unknown> & { ruleId: string; targetField: string; sourcePath?: string; operation: string; parameters: unknown };
type Candidate = { versionId: string; versionNo: number; sourceFormatId: string | null; sourceFormatVersion: string | null; formatStatus: string; rules: Rule[]; applicability: Record<string, unknown> };
type ConfigView = { candidateVersion: Candidate | null; activeVersion: Candidate | null; activeVersionId: string | null; configurationRowVersion: number | null; openQuestions: unknown[]; trial: { trialId: string; configurationVersionId: string; inputSnapshotId: string; status: string; output: unknown; ruleResults: unknown[]; issues: unknown[]; checks: Record<string, boolean | null> } | null };
const CHECKS: Record<string, string> = { inputComplete: '输入完整', scopeValid: '范围有效', rulesCovered: '规则覆盖完整', outputsValid: '输出有效', meaningsResolved: '业务含义已核实' };
function MappingOutput({ value }: { value: unknown }) {
  const records = (value as {records?:{inputId:string;rows:{rowIndex:number;output:Record<string,unknown>}[]}[]} | null)?.records;
  if (!Array.isArray(records)) return <BusinessValue value={value} />;
  const fields = [...new Set(records.flatMap(record=>record.rows.flatMap(row=>Object.keys(row.output))))];
  const labels: Record<string,string> = {installationItem:'安装项目',installedQuantity:'实际安装数量',unit:'单位',materialSupplier:'供料方',serviceScope:'服务范围',itemName:'计费项目',billedQuantity:'计费数量',unitPrice:'单价',amount:'金额'};
  return <div className="table-scroll"><table className="business-table"><thead><tr><th>原数据行</th>{fields.map(field=><th key={field}>{labels[field] ?? field}</th>)}</tr></thead><tbody>{records.flatMap(record=>record.rows.map(row=><tr key={`${record.inputId}:${row.rowIndex}`}><td>{row.rowIndex+1}</td>{fields.map(field=><td key={field}>{row.output[field] == null ? '待核实' : String(row.output[field])}</td>)}</tr>))}</tbody></table></div>;
}
export function ConfigurationPanel({ item, onChanged }: PanelProps) {
  const [state, reload] = useApiData(() => apiFetch<ConfigView>(itemPath(item, 'configuration')), [item.workItemId, item.rowVersion], true);
  const [edit, setEdit] = useState<{ versionId: string; rules: string; applicability: string } | null>(null);
  const [reason, setReason] = useState('');
  const [validation, setValidation] = useState('');
  const refresh = () => { reload(); onChanged(); };
  const save = useAction(() => { setEdit(null); refresh(); });
  const enable = useAction(refresh);
  const canWrite = allowed(item, 'ENABLE_INTEGRATION_CONFIG');
  const view = state.status === 'ready' ? state.data : null;
  const candidate = view?.candidateVersion;
  const waitingTrial = !!candidate && !!item.analysis && !view?.trial;
  useEffect(() => { if (!waitingTrial) return; const timer=window.setInterval(reload,3000); return ()=>window.clearInterval(timer); }, [waitingTrial,reload]);
  const busy = save.busy || enable.busy || !!item.pendingOperation || (state.status === 'ready' && (!!state.refreshing || !!state.refreshError));
  const saveDraft = () => {
    if (!edit) return;
    try {
      const rules = JSON.parse(edit.rules), applicability = JSON.parse(edit.applicability);
      if (!Array.isArray(rules) || !applicability || Array.isArray(applicability) || typeof applicability !== 'object') throw new Error('转换规则应为数组，适用范围应为对象。');
      setValidation('');
      void save.run(itemPath(item, 'configuration-draft'), { ...versions(item), expectedCandidateVersionId: edit.versionId, rules, applicability, editNotes: [{ field: 'rules', reason }, { field: 'applicability', reason }] }, '保存修订后的候选配置并等待后台试转换', 'PUT');
    } catch (error) { setValidation(`配置内容无法保存：${(error as Error).message}`); }
  };
  return <Panel title="服务商接入配置">{state.status === 'loading' && <Skeleton lines={4} />}{state.status === 'failed' && <ReadError error={state.error} retry={reload} />}{state.status === 'ready' && !!state.refreshError && <ReadError error={state.refreshError} retry={reload} />}{view && <>
    <div className="metrics"><p>候选版本 <strong>{candidate?.versionNo ?? '尚未形成'}</strong></p><p>当前生效版本 <strong>{view.activeVersion?.versionNo ?? '当前无生效配置'}</strong></p><p>格式状态 <strong>{display(candidate?.formatStatus)}</strong></p></div>
    {candidate && <><h4>候选规则与字段对照</h4><div className="table-scroll"><table className="business-table"><thead><tr><th>Excel 原列</th><th>平台字段</th><th>转换方式</th><th>规则详情</th></tr></thead><tbody>{candidate.rules.map((rule) => <tr key={rule.ruleId}><td>{Array.isArray(rule.sourceFields) ? rule.sourceFields.map(v=>fieldName(String(v))).join('、') : display(rule.sourcePath ?? rule.sourceField)}</td><td>{display(rule.targetField)}</td><td>{ruleDescription(rule.parameters)}</td><td><details><summary>查看详细规则</summary><BusinessValue value={rule.parameters} /><BusinessValue value={rule.conditions} /></details></td></tr>)}</tbody></table></div><p className="state-desc">适用于{item.providerName || item.providerId}的安装明细；按每行的字段对应关系进行转换。</p><details><summary>查看配置技术详情</summary><p>来源格式 {display(candidate.sourceFormatId)} · 版本 {display(candidate.sourceFormatVersion)}</p><BusinessValue value={candidate.applicability} /></details>
      <DetailActions title="配置处理">{canWrite && !edit && <button className="btn-primary" disabled={busy} onClick={() => setEdit({ versionId: candidate.versionId, rules: JSON.stringify(candidate.rules, null, 2), applicability: JSON.stringify(candidate.applicability, null, 2) })}>高级配置修订</button>}
      {edit && <div className="config-editor"><p className="state-desc">配置编辑保留完整字段位置、受控操作和参数。保存后会生成新候选并自动试转换。</p>{edit.versionId !== candidate.versionId && <div className="action-error"><p>候选版本已更新。当前编辑已保留，请逐项核对上方最新候选。</p><button className="btn-link" onClick={() => setEdit({ ...edit, versionId: candidate.versionId })}>已核对最新候选，保留输入并更新保存基准</button></div>}<label>完整转换规则<textarea rows={14} value={edit.rules} onChange={(e) => setEdit({ ...edit, rules: e.target.value })} /></label><label>适用范围<textarea rows={10} value={edit.applicability} onChange={(e) => setEdit({ ...edit, applicability: e.target.value })} /></label><label>修改原因<input value={reason} onChange={(e) => setReason(e.target.value)} /></label>{validation && <p role="alert">{validation}</p>}<button className="btn-primary" disabled={busy || !reason.trim() || edit.versionId !== candidate.versionId} onClick={saveDraft}>保存新候选</button><button className="btn-link" disabled={busy} onClick={() => setEdit(null)}>取消修订</button></div>}
    </DetailActions></>}
    <h4>待确认问题</h4><BusinessValue value={view.openQuestions} />
    <h4>当前候选试转换</h4>{view.trial ? <><p><strong>{display(view.trial.status)}</strong></p><div className="metrics">{Object.entries(view.trial.checks).map(([key, value]) => <p key={key}>{CHECKS[key] ?? key}：<strong>{value === null ? '未核实' : value ? '通过' : '未通过'}</strong></p>)}</div><h5>字段映射结果</h5><MappingOutput value={view.trial.output} /><details><summary>查看逐条执行记录</summary><BusinessValue value={view.trial.ruleResults} /></details>{view.trial.issues.length > 0 && <><h5>需要补充或修正</h5><BusinessValue value={view.trial.issues} /></>}</> : <p>尚无试转换终态，等待后台执行结果。</p>}
    <button className="btn-link" onClick={refresh}>刷新已保存的试转换结果</button>
    <DetailActions>{!canEnableConfiguration(view) && <p className="state-desc">需取得当前候选通过的试转换，并解决全部待确认问题后才能启用。</p>}
    {canWrite && <button className="btn-primary" disabled={busy || !!edit || !canEnableConfiguration(view)} onClick={() => enable.run(itemPath(item, 'configuration-enablement'), { ...versions(item), candidateVersionId: candidate!.versionId, trialId: view.trial!.trialId, expectedConfigurationRowVersion: view.configurationRowVersion, expectedActiveVersionId: view.activeVersionId, comment: null }, '确认启用当前候选配置')}>确认启用配置</button>}
    </DetailActions>{view.activeVersion && <details><summary>查看当前生效规则</summary><BusinessValue value={view.activeVersion.rules} /></details>}
  </>}<DetailActions><ActionStatus action={save} onRefresh={refresh} /><ActionStatus action={enable} onRefresh={refresh} /></DetailActions></Panel>;
}
