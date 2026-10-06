import {useSession} from '../../session';
import { useState, type FormEvent } from 'react';
import { errorKind, getAllProviders, getWorkItems, type WorkItemFilters, type WorkItemRow } from '../../api';
import { Skeleton, StateView } from '../../components/PageShell';
import { fmtTime, useApiData } from '../../hooks';
import { STATUS_LABEL } from '../../labels';
import { navigate } from '../../router';

type Props = { kind: 'RECONCILIATION' | 'CONFIGURATION'; title: string; description: string };
const EMPTY_FILTERS = { responsibility: 'VISIBLE', status: '', providerId: '', keyword: '' };
const COMPARISON_LABEL: Record<string, string> = { PREPARING: '比较准备中', DIFFERENCE: '有差异', DIFFERENT: '有差异', NEEDS_INFORMATION: '待补充信息', RECONCILED: '核对一致' };
const ANALYSIS_LABEL: Record<string, string> = { AVAILABLE: '分析完成', NOT_READY: '待分析', BLOCKED: '分析受阻' };

function money(value: string | null | undefined, currency: string | null | undefined): string {
  if (value == null || value.trim() === '' || !Number.isFinite(Number(value))) return '—';
  const amount = Number(value);
  try {
    return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2, ...(currency ? { style: 'currency', currency } : {}) }).format(amount);
  } catch {
    return amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (currency ? ` ${currency}` : '');
  }
}

function ComparisonCells({ item }: { item: WorkItemRow }) {
  const summary = item.reconciliationSummaryAccess === 'FORBIDDEN' ? null : item.reconciliationSummary;
  const label = item.reconciliationSummaryAccess === 'FORBIDDEN' ? '无账单权限' : summary ? COMPARISON_LABEL[summary.status] ?? summary.status : '比较准备中';
  const different = summary?.difference != null && Number.isFinite(Number(summary.difference)) && Number(summary.difference) !== 0;
  return <>
    <td><span className={`list-badge comparison-${summary?.status.toLowerCase() ?? 'preparing'}`}>{label}</span></td>
    <td className="number-cell">{money(summary?.jdTotal, summary?.currency)}</td>
    <td className="number-cell">{money(summary?.providerTotal, summary?.currency)}</td>
    <td className={`number-cell ${different ? 'amount-difference' : ''}`}>{money(summary?.difference, summary?.currency)}</td>
  </>;
}

export function BusinessItemsTablePage({ kind, title, description }: Props) {
  const billing = kind === 'RECONCILIATION';
  const session=useSession();
  const [draft, setDraft] = useState({ ...EMPTY_FILTERS });
  const [filters, setFilters] = useState<WorkItemFilters>({ responsibility: 'VISIBLE', kind, page: 1, pageSize: 10 });
  const [providers, retryProviders] = useApiData(() => getAllProviders(), []);
  const [state, refresh] = useApiData(() => getWorkItems(filters), [JSON.stringify(filters)], true);
  const apply = (event: FormEvent) => {
    event.preventDefault();
    setFilters(f => ({ ...f, ...draft, keyword: draft.keyword.trim(), page: 1 }));
  };
  const reset = () => { setDraft({ ...EMPTY_FILTERS }); setFilters(f => ({ kind, responsibility: 'VISIBLE', page: 1, pageSize: f.pageSize })); };
  const filtered = filters.responsibility !== 'VISIBLE' || !!(filters.status || filters.providerId || filters.keyword);
  const page = state.status === 'ready' ? state.data.page : filters.page ?? 1;
  const pageCount = state.status === 'ready' ? Math.max(1, Math.ceil(state.data.total / state.data.pageSize)) : 1;
  const firstPage = Math.max(1, Math.min(page - 2, pageCount - 4));
  const pageNumbers = Array.from({ length: Math.min(5, pageCount) }, (_, i) => firstPage + i);
  const changePage = (next: number) => setFilters(f => ({ ...f, page: next }));
  const detail = (item: WorkItemRow) => navigate(`/work-items/${item.kind}/${item.workItemId}`);
  const configName = (item: WorkItemRow) => item.title === '资料接入配置 · installation-materials' ? '资料接入配置' : item.title;
  const failKind = state.status === 'failed' ? errorKind(state.error) : null;

  return <div className="business-list-page">
    <div className="workbench-heading"><div><h1>{title}</h1><p>{description}</p></div><button className="btn-secondary" disabled={state.status === 'loading' || (state.status === 'ready' && state.refreshing)} onClick={refresh}>{state.status === 'ready' && state.refreshing ? '刷新中…' : '↻ 刷新列表'}</button></div>
    <section className="business-list-panel" aria-label={`${title}列表`}>
      <form className="filter-panel business-list-filters" onSubmit={apply}>
        <label>责任范围<select value={draft.responsibility} onChange={e => setDraft(d => ({ ...d, responsibility: e.target.value }))}><option value="VISIBLE">全部可见</option><option value="MINE">我负责的</option></select></label>
        <label>处理状态<select value={draft.status} onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}><option value="">全部状态</option>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>服务商<select value={draft.providerId} disabled={providers.status !== 'ready'} onChange={e => setDraft(d => ({ ...d, providerId: e.target.value }))}><option value="">{providers.status === 'loading' ? '加载中…' : '全部服务商'}</option>{providers.status === 'ready' && providers.data.map(p => <option key={p.providerId} value={p.providerId}>{p.displayName ? `${p.displayName} · ${p.providerId}` : p.providerId}</option>)}</select></label>
        <label className="list-keyword">关键词<input value={draft.keyword} onChange={e => setDraft(d => ({ ...d, keyword: e.target.value }))} placeholder={billing ? '工单编号 / 服务商名称' : '配置名称 / 服务商名称'} /></label>
        <div className="list-filter-actions"><button type="submit" className="btn-primary">查询</button><button type="button" className="btn-secondary" onClick={reset}>重置</button></div>
      </form>
      {providers.status === 'failed' && <div className="list-notice" role="status">服务商选项加载失败，仍可使用其他条件查询。<button className="btn-link" onClick={retryProviders}>重试</button></div>}
      {state.status === 'ready' && !!state.refreshError && <div className="list-notice" role="alert">刷新失败，当前保留上次查询结果。<button className="btn-link" onClick={refresh}>重试</button></div>}
      {state.status === 'loading' && <div className="list-loading"><Skeleton lines={8} /></div>}
      {state.status === 'failed' && <StateView kind={failKind === 'FORBIDDEN' ? 'forbidden' : failKind === 'UNAUTHENTICATED' ? 'unauthenticated' : 'unavailable'} onRetry={refresh} />}
      {state.status === 'ready' && <>
        <div className="business-list-scroll" role="region" aria-label={`${title}数据表，可横向滚动`} tabIndex={0} aria-busy={state.refreshing || undefined}>
          <table className={`business-list-table ${billing ? 'billing-list-table' : 'mapping-list-table'}`}>
            <caption className="list-sr-only">{title}，共{state.data.total}条</caption>
            <thead><tr>
              {billing && <th scope="col">工单编号</th>}
              <th scope="col">服务商</th>
              {!billing && <th scope="col">配置名称</th>}
              <th scope="col">处理状态</th>
              {billing ? <><th scope="col">对账结果</th><th scope="col" className="number-cell">京东金额</th><th scope="col" className="number-cell">服务商应收</th><th scope="col" className="number-cell">差额</th></> : <th scope="col">分析状态</th>}
              <th scope="col">责任人</th><th scope="col">更新时间</th><th scope="col" className="list-operation">操作</th>
            </tr></thead>
            <tbody>
              {state.data.list.map(item => <tr key={item.workItemId}>
                {billing && <td><button className="list-text-link order-reference" onClick={() => detail(item)} aria-label={`查看${item.workOrderId ?? item.title}对账`}>{item.workOrderId ?? '未关联工单'}</button></td>}
                <td><div className="list-company" title={item.providerName ?? item.providerId ?? ''}>{item.providerName || item.providerId || '待确认'}</div>{item.providerName && <div className="list-cell-secondary">{item.providerId}</div>}</td>
                {!billing && <td><button className="list-text-link list-config-name" onClick={() => detail(item)}>{configName(item)}</button></td>}
                <td><span className={`list-badge status-${item.status.toLowerCase()}`}>{STATUS_LABEL[item.status] ?? item.status}</span></td>
                {billing ? <ComparisonCells item={item} /> : <td><span className={`list-badge analysis-${item.analysisStatus.toLowerCase()}`}>{ANALYSIS_LABEL[item.analysisStatus] ?? item.analysisStatus}</span></td>}
                <td><div className="list-assignee" title={item.assignee?.displayName}>{item.assignee?.displayName ?? '待分配'}</div></td>
                <td className="list-time">{fmtTime(item.updatedAt)}</td>
                <td className="list-operation"><button className="list-text-link" onClick={() => detail(item)} aria-label={`查看${billing ? item.workOrderId ?? item.title : (item.providerName || item.providerId || '') + '配置'}详情`}>{billing?'查看对账':session.status==='ready'&&session.session.identityId===item.assignee?.identityId?'上传 Excel / 查看映射':'查看材料与映射'}</button></td>
              </tr>)}
              {state.data.list.length === 0 && <tr><td colSpan={billing ? 10 : 7}><div className="panel-center"><p className="state-title">{filtered ? '没有符合筛选条件的记录' : billing ? '暂无对账事项' : '暂无接入配置事项'}</p>{filtered && <button className="btn-link" onClick={reset}>清除筛选</button>}</div></td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="business-list-footer">
          <span className="list-total" aria-live="polite">共 <strong>{state.data.total}</strong> 条{state.data.list.length > 0 && `，当前 ${(page - 1) * state.data.pageSize + 1}–${(page - 1) * state.data.pageSize + state.data.list.length} 条`}</span>
          <div className="list-pagination"><label>每页<select aria-label="每页条数" value={filters.pageSize} onChange={e => setFilters(f => ({ ...f, pageSize: Number(e.target.value), page: 1 }))}>{[10, 20, 50].map(size => <option key={size} value={size}>{size} 条</option>)}</select></label><nav aria-label={`${title}分页`}>
            <button disabled={page <= 1 || state.refreshing} onClick={() => changePage(page - 1)}>上一页</button>
            {firstPage > 1 && <><button aria-label="第1页" onClick={() => changePage(1)}>1</button>{firstPage > 2 && <span>…</span>}</>}
            {pageNumbers.map(n => <button key={n} aria-label={`第${n}页`} aria-current={page === n ? 'page' : undefined} onClick={() => changePage(n)}>{n}</button>)}
            {pageNumbers.at(-1)! < pageCount && <>{pageNumbers.at(-1)! < pageCount - 1 && <span>…</span>}<button aria-label={`第${pageCount}页`} onClick={() => changePage(pageCount)}>{pageCount}</button></>}
            <button disabled={page >= pageCount || state.refreshing} onClick={() => changePage(page + 1)}>下一页</button>
          </nav></div>
        </footer>
      </>}
    </section>
  </div>;
}
