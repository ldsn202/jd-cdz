import { DetailActions } from '../detail/DetailActions';
import { useState } from 'react';
import { ActionStatus, Panel, allowed, itemPath, useAction, versions, type PanelProps } from './ActionShared';
import { AnalysisEvidence, EvidencePicker, type EvidenceRef } from './EvidenceView';
export function CoordinationPanel({ item, onChanged }: PanelProps) {
  const action = useAction(onChanged);
  const [description, setDescription] = useState('');
  const [resolution, setResolution] = useState('');
  const [reason, setReason] = useState('');
  const [followup, setFollowup] = useState(true);
  const [evidence, setEvidence] = useState<EvidenceRef[]>([]);
  const canException = allowed(item, 'RECORD_EXCEPTION_RESULT');
  const canComplete = allowed(item, 'COMPLETE_FULFILLMENT_COORDINATION');
  const progressActions: Record<string, string[]> = { INSTALLATION_PREPARATION: ['CONFIRM_INSTALLATION_DRAFT', 'SUBMIT_SUPPLEMENT'], INSTALLATION_REVIEW: ['DECIDE_INSTALLATION_REVIEW'], RECONCILIATION: ['REQUEST_BILLING_VERIFICATION', 'REPLY_BILLING_VERIFICATION'], CONFIGURATION: ['ENABLE_INTEGRATION_CONFIG'], COORDINATION: ['COMPLETE_FULFILLMENT_COORDINATION'] };
  const canProgress = (progressActions[item.kind] ?? []).some((a) => allowed(item, a));
  const busy = action.busy || !!item.pendingOperation;
  if (!canProgress && !canComplete && !canException && item.kind !== 'COORDINATION') return null;
  return <>{item.kind === 'COORDINATION' && <Panel title="履约协同信息"><AnalysisEvidence item={item} /></Panel>}
    <DetailActions collapsible={item.kind !== 'COORDINATION'} title={item.kind === 'COORDINATION' ? '协同处理' : '进展与异常'}>{canProgress && <div className="form-row"><label>本次进展与后续安排<textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} /></label><button className="btn-primary" disabled={busy || !description.trim()} onClick={() => action.run(itemPath(item, 'progress'), { ...versions(item), description }, '保存本次进展并继续处理')}>保存进展，继续处理</button></div>}
    {(canComplete || canException) && <EvidencePicker item={item} selected={evidence} onChange={setEvidence} />}
    {canComplete && <div className="form-row"><label>本次协同解决事实<textarea value={resolution} onChange={(e) => setResolution(e.target.value)} /></label><button className="btn-primary" disabled={busy || !resolution.trim()} onClick={() => action.run(itemPath(item, 'coordination-completion'), { ...versions(item), resolution, evidenceRefs: evidence, analysisResultId: item.analysis?.resultId ?? null, comment: null }, '完成本次履约协同')}>完成本次协同</button><p className="state-desc">完成仅表示本次履约阻碍已解决。</p></div>}
    {canException && item.status !== 'EXCEPTION' && <div className="form-row"><label>异常原因<textarea value={reason} onChange={(e) => setReason(e.target.value)} /></label><button className="btn-primary" disabled={busy || !reason.trim()} onClick={() => action.run(itemPath(item, 'exceptions'), { ...versions(item), reason, evidenceRefs: evidence, comment: null }, '登记业务异常')}>登记异常</button></div>}
    {canException && item.status === 'EXCEPTION' && <div><label>异常处理结果<textarea value={resolution} onChange={(e) => setResolution(e.target.value)} /></label><label className="evidence-choice"><input type="checkbox" checked={followup} onChange={(e) => setFollowup(e.target.checked)} />异常关闭后继续办理原业务环节</label><button className="btn-primary" disabled={busy || !resolution.trim() || (!followup && !evidence.length)} onClick={() => action.run(itemPath(item, 'exception-resolution'), { ...versions(item), resolution, evidenceRefs: evidence, followupRequired: followup, comment: null }, '确认异常处理完成')}>异常处理完成</button></div>}
    {canException && <details><summary>停止该事项</summary><p className="state-desc">停止必须有可核实的停止依据，停止结果保留在处理记录。</p><label>停止原因<textarea value={reason} onChange={(e) => setReason(e.target.value)} /></label><button className="btn-primary" disabled={busy || !reason.trim() || !evidence.length} onClick={() => action.run(itemPath(item, 'stop-decisions'), { ...versions(item), reason, basisRefs: evidence, comment: null }, '停止该事项')}>确认停止</button></details>}
    <ActionStatus action={action} onRefresh={onChanged} /></DetailActions>
  </>;
}
