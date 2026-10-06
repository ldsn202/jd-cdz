import { DetailActions } from '../detail/DetailActions';
import { useState } from 'react';
import { ActionStatus, Panel, allowed, itemPath, useAction, versions, type PanelProps } from './ActionShared';
import { AnalysisEvidence, BusinessValue, EvidencePicker, type EvidenceRef } from './EvidenceView';
import { MaterialUpload } from './PreparationPanel';
export function ReviewPanel({ item, onChanged }: PanelProps) {
  const action = useAction(onChanged);
  const [decision, setDecision] = useState('APPROVE');
  const [question, setQuestion] = useState('');
  const [requiredMaterial, setRequiredMaterial] = useState('');
  const [comment, setComment] = useState('');
  const [replyText, setReplyText] = useState('');
  const [materials, setMaterials] = useState<string[]>([]);
  const [evidence, setEvidence] = useState<EvidenceRef[]>([]);
  const [findingId, setFindingId] = useState('');
  const canDecide = allowed(item, 'DECIDE_INSTALLATION_REVIEW');
  const canReply = allowed(item, 'SUBMIT_SUPPLEMENT');
  const request = item.activeSupplementRequest;
  const analysisId = item.analysis?.resultId;
  const busy = action.busy || !!item.pendingOperation;
  return <Panel title="安装核查与补充往来"><AnalysisEvidence item={item} />
    {item.analysis?.contextRecords?.length ? <details><summary>方案与正式安装明细（保留各自数量与来源）</summary>{item.analysis.contextRecords.filter((r) => ['INSTALLATION_PLAN', 'INSTALLATION_DETAIL'].includes(r.recordType)).map((r) => <section key={r.inputId}><h4>{r.recordType === 'INSTALLATION_PLAN' ? '方案安装数量' : '正式实际安装数量'}</h4><BusinessValue value={r.data} /></section>)}</details> : null}
    {request && <section><h4>当前退回要求</h4><BusinessValue value={request.questions} /><h4>已保存的补充回复</h4><BusinessValue value={request.replies} /></section>}
    <DetailActions title="核查与回复">{canDecide && <><h4>核查决定</h4>{!analysisId && <p className="state-desc">当前无可用分析结果，不能作出核查决定。</p>}<div className="form-row"><label>决定<select value={decision} onChange={(e) => setDecision(e.target.value)}><option value="APPROVE">审核通过</option><option value="REQUEST_SUPPLEMENT">要求补充</option></select></label>{decision === 'REQUEST_SUPPLEMENT' && <><label>针对分析发现<select value={findingId} onChange={(e) => setFindingId(e.target.value)}><option value="">人员新增问题</option>{item.analysis?.findings?.map((f, i) => <option key={f.findingId ?? i} value={f.findingId}>{typeof f.content === 'string' ? f.content : f.content?.description ?? f.type ?? `发现 ${i + 1}`}</option>)}</select></label><label>具体问题<input value={question} onChange={(e) => setQuestion(e.target.value)} /></label><label>需要补充的材料<input value={requiredMaterial} onChange={(e) => setRequiredMaterial(e.target.value)} /></label></>}<label>确认说明<input value={comment} onChange={(e) => setComment(e.target.value)} /></label></div>{decision === 'REQUEST_SUPPLEMENT' && <EvidencePicker item={item} selected={evidence} onChange={setEvidence} />}<button className="btn-primary" disabled={busy || !analysisId || (decision === 'REQUEST_SUPPLEMENT' && (!question.trim() || !requiredMaterial.trim()))} onClick={() => action.run(itemPath(item, 'review-decisions'), { ...versions(item), analysisResultId: analysisId, action: decision, questions: decision === 'REQUEST_SUPPLEMENT' ? [{ findingId: findingId || null, question, requiredMaterialDescription: requiredMaterial, evidenceRefs: evidence }] : [], comment: comment || null }, decision === 'APPROVE' ? '确认审核通过并提交原系统' : '确认退回补充要求')}>提交核查决定</button></>}
    {canReply && <section><h4>服务商补充回复</h4>{!request && <p className="state-desc">当前有效退回要求未取得，刷新事项后再回复。</p>}<label>针对当前退回问题回复<textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={3} /></label><MaterialUpload item={item} onChanged={onChanged} onUploaded={(id) => setMaterials((list) => [...new Set([...list, id])])} />{materials.map((id) => <p key={id}>附材料版本 {id}<button className="btn-link" onClick={() => setMaterials((list) => list.filter((v) => v !== id))}>移除附件</button></p>)}<button className="btn-primary" disabled={busy || !request || !replyText.trim()} onClick={() => action.run(itemPath(item, 'supplements'), { ...versions(item), requestDecisionId: request!.requestDecisionId, replyText, materialVersionIds: materials, comment: null }, '针对当前退回要求提交补充回复')}>提交补充回复</button></section>}
    <ActionStatus action={action} onRefresh={onChanged} /></DetailActions>
  </Panel>;
}
