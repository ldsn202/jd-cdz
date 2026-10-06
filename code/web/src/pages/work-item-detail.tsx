import {humanText} from './workbench/business-language';
import { useEffect, useState } from 'react';
import { useRoute } from '../router';
import { useApiData, fmtTime } from '../hooks';
import { apiFetch, errorKind, getWorkItem, getWorkItemActivities } from '../api';
import { KIND_LABEL, STATUS_LABEL, ANALYSIS_RESULT_LABEL } from '../labels';
import { PageShell, Skeleton, StateView } from '../components/PageShell';
import { OperationStatus, ReadError } from './workbench/ActionShared';
import { BusinessValue } from './workbench/EvidenceView';
import { BusinessMaterialsPanel } from './workbench/BusinessMaterialsPanel';
import { ActionPanels } from './workbench/ActionPanels';
import { DetailActionContext } from './detail/DetailActions';
import './detail/detail-redesign.css';

const activityLabels: Record<string, string> = { WORK_CREATED: '创建事项', ANALYSIS_COMPLETED: '完成分析', DECISION_CONFIRMED: '确认处理决定', SOURCE_WRITE_RESULT: '原系统处理结果', PROGRESS_SAVED: '保存进展', RESPONSIBILITY_CHANGED: '变更责任人', FOLLOWUP_LINKED: '关联后续事项', SOURCE_CHANGE_RECORDED: '记录来源变化' };
function activityDescription(text: string) {
  try { const data = JSON.parse(text); return data.description ?? data.note ?? data.comment ?? data.reason ?? null; }
  catch { return text; }
}
export default function WorkItemDetailPage() {
  const route = useRoute();
  const id = route?.name === 'work-item-detail' ? route.params.id! : '';
  return <WorkItemDetailContent key={id} id={id} />;
}
function WorkItemDetailContent({ id }: { id: string }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [activityPage, setActivityPage] = useState(1);
  const [itemState, itemRetry] = useApiData(() => getWorkItem(id), [id], true);
  const [actsState, actsRetry] = useApiData(() => getWorkItemActivities(id, activityPage), [id, activityPage]);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [tab, setTab] = useState<'analysis' | 'history'>('analysis');
  const [actionTarget, setActionTarget] = useState<HTMLDivElement | null>(null);
  const needsRefresh = itemState.status === 'ready' && !itemState.data.analysisRuntimeError && ['PREPARING','QUEUED','RUNNING'].includes(itemState.data.analysisProgress?.state ?? '');
  useEffect(() => { if (!needsRefresh) return; const timer = window.setInterval(itemRetry, 3000); return () => window.clearInterval(timer); }, [needsRefresh, itemRetry]);
  if (itemState.status === 'loading') return <PageShell title="处理事项详情"><Skeleton lines={6} /></PageShell>;
  if (itemState.status === 'failed') return <PageShell title="处理事项详情"><StateView kind={errorKind(itemState.error) === 'NOT_FOUND' ? 'not-found' : errorKind(itemState.error) === 'FORBIDDEN' ? 'forbidden' : 'unavailable'} onRetry={itemRetry} /></PageShell>;
  const it = itemState.data;
  const manualAnalysis = it.analysisTriggerMode === 'manual';
  const refresh = () => { itemRetry(); actsRetry(); };
  const analyze = async () => {
    if (analyzing) return; setAnalyzing(true); setAnalysisError('');
    try { await apiFetch(`/api/admin/charging/work-items/${encodeURIComponent(it.workItemId)}/analysis`, { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ expectedVersion: it.rowVersion }) }); refresh(); }
    catch (error) { setAnalysisError(error instanceof Error ? error.message : '分析请求失败'); }
    finally { setAnalyzing(false); }
  };
  const disabled = !!itemState.refreshing || !!itemState.refreshError;
  const stage = it.status === 'COMPLETED' ? 3 : it.status === 'PREPARING' || (!it.analysis && it.status === 'BLOCKED') ? 1 : 2;
  const hasActions = !!it.allowedActions?.length && it.status !== 'COMPLETED';
  return <div className="wi-detail">
    <a className="detail-back" href="#/">← 返回工作台</a>
    <header className="detail-heading"><div><h1>{it.kind==='CONFIGURATION'?'安装明细字段映射':it.title}</h1><div className="detail-subtitle"><span className={`detail-badge status-${it.status.toLowerCase()}`}>{STATUS_LABEL[it.status] ?? '状态待核实'}</span><span>{KIND_LABEL[it.kind] ?? '处理事项'}</span></div></div><button className="detail-refresh" onClick={refresh} disabled={itemState.refreshing}>↻ 刷新</button></header>
    <dl className="detail-meta"><div><dt>{it.kind === 'CONFIGURATION' ? '配置用途' : '工单 / 事项编号'}</dt><dd>{it.workOrderId ? <a href={`#/installation/orders/${encodeURIComponent(it.workOrderId)}`}>{it.workOrderId} ↗</a> : it.kind === 'CONFIGURATION' ? '安装明细字段映射' : it.workItemId}</dd></div><div><dt>安装服务商</dt><dd>{it.providerName || it.providerId || '待补充'}</dd></div><div><dt>当前责任人</dt><dd>{it.assignee?.displayName ?? '待分配'}</dd></div><div><dt>事项版本</dt><dd>V{it.rowVersion ?? '—'} · {fmtTime(it.updatedAt)} 更新</dd></div></dl>
    <ol className="detail-steps" aria-label="当前办理阶段">{['业务资料到达', manualAnalysis ? '分析处理' : '自动分析', '人员处理', '本环节完成'].map((label, i) => <li key={label} className={i < stage ? 'past' : i === stage ? 'current' : ''} aria-current={i === stage ? 'step' : undefined}><i>{i < stage ? '✓' : i + 1}</i>{label}</li>)}</ol>
    {itemState.refreshing && <p className="detail-notice" role="status">正在读取最新事项，已填写内容保留…</p>}
    {!!itemState.refreshError && <ReadError error={itemState.refreshError} retry={refresh} />}
    <DetailActionContext.Provider value={{ target: actionTarget, disabled }}>
      <div className="wi-detail-grid">
        <section className="wi-detail-main">
          <div className="detail-tabs" role="tablist" aria-label="事项详情"><button id="detail-analysis-tab" role="tab" aria-selected={tab === 'analysis'} aria-controls="detail-analysis" onClick={() => setTab('analysis')}>分析与依据</button><button id="detail-history-tab" role="tab" aria-selected={tab === 'history'} aria-controls="detail-history" onClick={() => setTab('history')}>处理记录 <span>{actsState.status === 'ready' ? actsState.data.total : '—'}</span></button></div>
          <div id="detail-analysis" role="tabpanel" aria-labelledby="detail-analysis-tab" hidden={tab !== 'analysis'}>
            {it.kind === 'CONFIGURATION' && <BusinessMaterialsPanel item={it} onChanged={refresh} />}
            <section className={`detail-result ${it.analysisStatus === 'BLOCKED' ? 'is-blocked' : ''}`}><div><h2>✧ {it.analysis ? '分析结果' : it.kind === 'COORDINATION' ? '履约协同信息' : it.analysisProgress?.state==='CHECKED' ? '程序核对一致' : '分析尚未完成'}</h2><span>{it.analysis ? ANALYSIS_RESULT_LABEL[it.analysis.status ?? ''] ?? '结果待核实' : it.analysisRuntimeError ? '分析配置待完成' : ({ WAITING_MATERIALS: '材料文字待核对', CHECKED: '无需 AI 分析', WAITING_MANUAL: '等待手动运行', FAILED: '分析失败', RUNNING: '正在分析', QUEUED: '等待分析', PREPARING: '准备资料' } as Record<string,string>)[it.analysisProgress?.state ?? ''] ?? '等待资料准备'}</span></div><p className={!summaryExpanded && (it.analysis?.summary?.length ?? 0) > 160 ? 'detail-summary-collapsed' : ''}>{it.analysis?.summary ? humanText(it.analysis.summary) : (it.kind === 'COORDINATION' ? '查看当前阻碍与处理记录，并在右侧登记本次协同进展。' : (it.analysisProgress?.state==='CHECKED' ? it.analysisProgress.description : it.analysisRuntimeError) || (!it.canRequestAnalysis && manualAnalysis ? `等待${it.assignee?.displayName ?? '当前责任人'}手动运行分析。已有业务资料可在下方查看。` : it.analysisProgress?.description) || (manualAnalysis ? '当前尚无可用分析结论，请点击“运行分析”。' : '当前尚无可用分析结论。资料到达后会自动分析。'))}</p>{(it.analysis?.summary?.length ?? 0) > 160 && <button className="detail-summary-toggle" onClick={() => setSummaryExpanded(!summaryExpanded)}>{summaryExpanded ? '收起分析摘要 ↑' : '展开完整分析 ↓'}</button>}{it.analysis?.validatedAt && <small>核实于 {fmtTime(it.analysis.validatedAt)} · 判断依据可在下方查看</small>}</section>
            {it.canRequestAnalysis && it.analysisProgress?.state !== 'CHECKED' && <div className="detail-analysis-controls"><button className="btn-primary" onClick={analyze} disabled={analyzing || disabled || !!it.analysisRuntimeError || ['PREPARING','RUNNING','QUEUED'].includes(it.analysisProgress?.state ?? '')}>{analyzing ? '正在提交…' : it.analysisProgress?.state === 'RUNNING' ? '正在分析…' : it.analysisProgress?.state === 'PREPARING' ? '正在准备资料…' : it.analysisProgress?.state === 'QUEUED' ? '等待执行…' : it.analysis || it.analysisProgress?.state === 'FAILED' ? '重新运行分析' : '运行分析'}</button><span className="state-desc">{manualAnalysis ? '当前为 mock 环境，数据为演示数据，因此改为手动触发。' : '资料到达或更新后自动分析，也可在此手动触发。'}</span></div>}
            {analysisError && <p className="action-error" role="alert">{analysisError}</p>}
            {!!it.blockedReasons?.length && <section className="detail-notice"><h3>当前阻碍</h3>{it.blockedReasons.map((r) => <p key={r.code}>{humanText(r.description)}</p>)}</section>}
            {it.completion && <section className="panel detail-panel"><h3>办理结果</h3><BusinessValue value={it.completion.basis} />{it.completion.completedAt && <p className="state-desc">完成于 {fmtTime(it.completion.completedAt)}</p>}</section>}
            {it.kind !== 'CONFIGURATION' && <BusinessMaterialsPanel item={it} onChanged={refresh} />}
            <fieldset className="action-fieldset" disabled={disabled}><ActionPanels key={id} item={it} onChanged={refresh} /></fieldset>
            {!!it.relatedItems?.length && <section className="panel detail-panel"><h3>相关事项与后续办理</h3>{it.relatedItems.map((r) => <a className="detail-related" key={r.workItemId} href={`#/work-items/RELATED/${encodeURIComponent(r.workItemId)}`}>{r.title}<span>查看事项 →</span></a>)}</section>}
          </div>
          <section className="panel detail-history" id="detail-history" role="tabpanel" aria-labelledby="detail-history-tab" hidden={tab !== 'history'}>
            {actsState.status === 'loading' && <Skeleton lines={4} />}
            {actsState.status === 'failed' && <StateView kind="unavailable" onRetry={actsRetry} />}
            {actsState.status === 'ready' && (actsState.data.list.length ? <ol className="detail-timeline">{actsState.data.list.map((a) => <li key={a.activityId}><time>{a.occurredAt ? fmtTime(a.occurredAt) : '来源时间未知'}</time><h3>{activityLabels[a.eventType] ?? '处理记录'}<span>{a.actor?.displayName ?? '系统处理'}</span></h3>{a.description && <p>{activityDescription(a.description)}</p>}{a.operationId && <details><summary>查看原操作结果</summary><OperationStatus operationId={a.operationId} onChanged={refresh} /></details>}</li>)}</ol> : <p className="state-desc">暂无处理记录</p>)}
            {actsState.status === 'ready' && actsState.data.total > 0 && <nav className="detail-history-pager" aria-label="处理记录分页"><span>共 {actsState.data.total} 条 · 第 {actsState.data.page} 页</span><div><button disabled={activityPage === 1} onClick={() => setActivityPage(1)}>最新记录</button><button disabled={activityPage === 1} onClick={() => setActivityPage(page => Math.max(1, page - 1))}>上一页</button><button disabled={actsState.data.page * actsState.data.pageSize >= actsState.data.total} onClick={() => setActivityPage(page => page + 1)}>下一页</button></div></nav>}
          </section>
        </section>
        <aside className="detail-action-column" aria-label="本次处理"><section className="panel detail-action-card"><header><h2>本次处理</h2><span>{it.assignee?.displayName ?? '待分配'}</span></header>{it.pendingOperation && <div className="detail-operation"><OperationStatus operationId={it.pendingOperation.operationId} onChanged={refresh} /></div>}{!hasActions && <div className="detail-action-empty"><strong>{it.status === 'COMPLETED' ? '本环节已完成' : it.pendingOperation ? '等待原操作结果' : '当前无可执行操作'}</strong><p>{it.status === 'COMPLETED' ? '办理结果和判断依据已保留，可在左侧查看。' : '以当前身份、事项状态及责任范围为准。'}</p></div>}<div ref={setActionTarget} /><footer>处理决定会保留确认时的资料与判断依据。</footer></section></aside>
      </div>
    </DetailActionContext.Provider>
  </div>;
}
