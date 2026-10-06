import {humanText} from './business-language';
import { useState } from 'react';
import { FINDING_TOPIC_LABEL } from '../../labels';
import type { WorkItemDetail } from '../../api';
import { EvidenceSidebar } from '../orders/EvidenceSidebar';

export type EvidenceRef = { inputId?: string; blockId?: string; jsonPointer?: string; quote?: string | null; materialVersionId?: string; sourceVersion?: string; kind?: string; sourceMaterialId?: string; sourceSystem?: string };
const NAMES: Record<string, string> = { installationWorkOrderId: '安装工单编号', installationPlanId: '安装方案编号', installationDetailId: '安装明细编号', sourceMaterials: '关联材料', sourceMaterialId: '材料编号', verifiedAt: '提交核实时间', topic: '核查项目', explanation: '判断说明', confidence: '可信程度', recommendation: '处理建议', conclusion: '结论', evidence: '判断依据', summary: '摘要', checks: '核验结果', sourceRecordId: '来源记录', workOrderId: '工单编号', sourceUpdatedAt: '来源更新时间', chargeScope: '计费范围', billedQuantity: '计费数量', itemName: '项目名称', items: '项目明细', sourceRecord: '来源记录', description: '说明', question: '待核实问题', reason: '原因', content: '内容', assessment: '依据结论', installationItem: '安装项目', installedQuantity: '实际安装数量', plannedQuantity: '方案安装数量', unit: '单位', materialSupplier: '供料方', serviceScope: '服务范围', name: '名称', quantity: '数量', amount: '金额', unitPrice: '单价', field: '字段', status: '状态', targetField: '目标字段', sourceField: '原字段', sourceFields: '原字段完整位置', sourcePath: '原字段位置', operation: '转换操作', parameters: '参数', conditions: '成立条件', purpose: '用途', sourceSystem: '来源系统', sourceFormatId: '来源格式', sourceFormatVersion: '格式版本', serviceProviderId: '服务商', businessScopeKey: '业务范围', rowPath: '明细位置', unknownConditions: '待核实条件', basisReferences: '适用依据', formatStatus: '格式状态', output: '转换输出', ruleId: '规则', result: '执行结果', issues: '待处理问题', steps: '处理步骤', sourceVersion: '来源版本', requiredMaterialDescription: '需补材料', replyText: '回复内容', SUPPORT: '支持', jsonPointer: '原字段位置', type: '类型', value: '值', expectedValue: '预期值', actualValue: '实际值', message: '说明', label: '名称', fact: '事实', comparison: '对照', difference: '差异' };
const VALUES: Record<string, string> = { ...FINDING_TOPIC_LABEL, MATCHED: '核对一致', DIFFERENCE: '存在差异', ANALYZED: '分析完成', COMPLETE: '完整', INCOMPLETE: '不完整', INSTALLATION: '安装资料', RECONCILIATION: '业务对账', KNOWN: '格式已识别', NEW: '新格式', COPY: '直接取值', RENAME: '字段映射', CONSTANT: '固定值', LOOKUP: '映射取值', MULTIPLY: '相乘', ADD: '相加', SUBTRACT: '相减', DIVIDE: '相除', CONCAT: '文本拼接', TO_NUMBER: '转为数字', TRIM: '去除首尾空格', installationItem: '安装项目', installedQuantity: '实际安装数量', plannedQuantity: '方案安装数量', materialSupplier: '供料方', serviceScope: '服务范围', SUPPORTED: '支持', CONFLICTING: '冲突', INSUFFICIENT: '依据不足', NEEDS_INFORMATION: '待补充信息', VERIFIED: '已核实', NOT_PROVIDED: '未提供', UNKNOWN: '未知', PROVIDED: '已提供', PASSED: '通过', FAILED: '失败', DIFFERENT: '有差异', RECONCILED: '核对一致', PREPARING: '准备中' };
export const display = (v: unknown) => v === null || v === undefined || v === '' ? '待核实' : typeof v === 'boolean' ? v ? '是' : '否' : VALUES[String(v)] ?? humanText(v);
export function BusinessValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || typeof value !== 'object') return <span>{display(value)}</span>;
  if (Array.isArray(value)) return value.length ? <ul className="business-list">{value.map((v, i) => <li key={i}><BusinessValue value={v} /></li>)}</ul> : <span className="state-desc">无</span>;
  return <dl className="business-fields">{Object.entries(value as Record<string, unknown>).filter(([key]) => !['evidenceRefs', 'findingId', 'inputId', 'materialVersionId'].includes(key)).map(([key, v]) => <div key={key}><dt>{NAMES[key] ?? humanText(key)}</dt><dd><BusinessValue value={v} /></dd></div>)}</dl>;
}
export function evidenceList(item: WorkItemDetail): EvidenceRef[] {
  const findings = Array.isArray(item.analysis?.findings) ? item.analysis.findings : [];
  return findings.flatMap((f) => Array.isArray(f.evidenceRefs) ? f.evidenceRefs : []);
}
export function EvidenceLinks({ refs, item }: { refs: EvidenceRef[]; item?: WorkItemDetail }) {
  const [opened, setOpened] = useState<{ versionId: string; blockId?: string } | null>(null);
  return <div className="evidence-links">{refs.map((ref, i) => {
    const mapped = item?.analysis?.evidenceMaterials?.find((m) => (!!ref.inputId && m.inputId === ref.inputId) || (!!ref.sourceMaterialId && m.sourceMaterialId === ref.sourceMaterialId && m.sourceVersion === ref.sourceVersion));
    const versionId = ref.materialVersionId ?? mapped?.materialVersionId;
    return <div key={i} className="evidence-ref">{ref.quote && <blockquote>{ref.quote}</blockquote>}<span className="state-desc">{ref.kind === 'IMAGE_DESCRIPTION' ? '图片描述 · ' : ''}{ref.jsonPointer || ref.blockId || '依据'}{(ref.sourceVersion ?? mapped?.sourceVersion) && ` · 来源版本 ${ref.sourceVersion ?? mapped?.sourceVersion}`}</span>{versionId ? <button className="btn-link" onClick={() => setOpened({ versionId, blockId: ref.blockId })}>查看原文</button> : ref.jsonPointer ? <details><summary>查看业务记录</summary><BusinessValue value={item?.analysis?.contextRecords?.find((r) => r.inputId === ref.inputId)?.data ?? null} /></details> : <span className="state-desc"> 原始材料版本尚未取得</span>}</div>;
  })}{opened && <EvidenceSidebar key={`${opened.versionId}:${opened.blockId}`} materialVersionId={opened.versionId} blockId={opened.blockId} onClose={() => setOpened(null)} />}</div>;
}
export function EvidencePicker({ item, refs = evidenceList(item), selected, onChange }: { item: WorkItemDetail; refs?: EvidenceRef[]; selected: EvidenceRef[]; onChange: (refs: EvidenceRef[]) => void }) {
  if (!refs.length) return <p className="state-desc">当前无可选择的已保存依据。需要依据的动作须先补齐材料或业务记录。</p>;
  return <div><p className="state-desc">选择本次确认的依据</p>{refs.map((ref, i) => <label className="evidence-choice" key={i}><input type="checkbox" checked={selected.some((r) => JSON.stringify(r) === JSON.stringify(ref))} onChange={(e) => onChange(e.target.checked ? [...selected, ref] : selected.filter((r) => JSON.stringify(r) !== JSON.stringify(ref)))} />{ref.quote ?? ref.jsonPointer ?? ref.blockId ?? `依据 ${i + 1}`}</label>)}<EvidenceLinks refs={selected} item={item} /></div>;
}
export function AnalysisEvidence({ item }: { item: WorkItemDetail }) {
  const findings = Array.isArray(item.analysis?.findings) ? item.analysis.findings : [];
  return <div className="analysis-findings">{findings.map((finding, index) => {
    const content = finding.content && typeof finding.content === 'object' ? finding.content : finding;
    const assessment = finding.assessment ?? content.assessment;
    const topic = content.topic ?? content.installationItem ?? content.itemName;
    const title = topic ? display(topic) : `分析发现 ${index + 1}`;
    const explanation = typeof finding.content === 'string' ? finding.content : content.explanation ?? content.description ?? content.conclusion;
    const rest = Object.fromEntries(Object.entries(content).filter(([key]) => !['topic', 'explanation', 'description', 'conclusion', 'assessment', 'evidenceRefs', 'findingId', 'type', 'content'].includes(key)));
    return <article className="finding-card" key={finding.findingId ?? index}>
      <div className="finding-heading"><h4>{title}</h4>{assessment && <span className={`detail-badge ${assessment === 'CONFLICTING' || assessment === 'INSUFFICIENT' ? 'status-blocked' : ''}`}>{display(assessment)}</span>}</div>
      {explanation && <p className="finding-explanation">{humanText(explanation)}</p>}
      {Object.keys(rest).length > 0 && <details><summary>查看逐项核查内容</summary><BusinessValue value={rest} /></details>}
      {!!finding.evidenceRefs?.length && <details className="finding-evidence"><summary>查看判断依据 · {finding.evidenceRefs.length} 条</summary><EvidenceLinks refs={finding.evidenceRefs} item={item} /></details>}
    </article>;
  })}{Array.isArray(item.analysis?.openQuestions) && item.analysis.openQuestions.length > 0 && <section className="detail-notice"><h4>待核实问题</h4><BusinessValue value={item.analysis.openQuestions} /></section>}{!item.analysis && item.analysisProgress?.state !== 'CHECKED' && <p className="state-desc">{item.kind === 'COORDINATION' ? '本次协同暂无系统分析结果，请结合业务记录处理。' : '尚无当前可用分析，请查看材料与分析准备状态。'}</p>}</div>;
}
