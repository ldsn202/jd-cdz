import { BillingSummary } from './BillingSummary';
import { useEffect, useState } from 'react';
import { useApiData, fmtTime } from '../../hooks';
import { errorKind, getAllProviders, getWorkItems, type WorkItemFilters } from '../../api';
import { KIND_LABEL, STATUS_LABEL, ANALYSIS_LABEL } from '../../labels';
import { Skeleton, StateView } from '../../components/PageShell';
import { navigate, useRoute } from '../../router';
import { OVERVIEW_GROUPS } from './overview';
import { workItemFiltersFromParams, workItemsPath } from './work-item-filters';

const KINDS = Object.keys(KIND_LABEL);
const STATUSES = Object.keys(STATUS_LABEL);

export function WorkbenchPage() {
  const route = useRoute();
  const filters = workItemFiltersFromParams(route?.params ?? {});
  const setFilters = (next: WorkItemFilters | ((current: WorkItemFilters) => WorkItemFilters)) =>
    navigate(workItemsPath(typeof next === 'function' ? next(filters) : next));
  const [keywordDraft, setKeywordDraft] = useState(filters.keyword ?? '');
  useEffect(() => setKeywordDraft(filters.keyword ?? ''), [filters.keyword]);
  const [tick, setTick] = useState(0);

  const [providersState] = useApiData(() => getAllProviders(), []);
  const [listState, listRetry] = useApiData(() => getWorkItems(filters), [JSON.stringify(filters), tick]);

  const applyFilter = (patch: Partial<WorkItemFilters>) => {
    setFilters((f) => ({ ...f, ...patch, page: 1 }));
  };



  return (
    <div className="workbench">
      <div className="workbench-heading"><div><div className="eyebrow">工作台 / WORK ITEMS</div><h1>处理事项</h1><p>查找全部授权事项，按责任范围、业务类型和状态进入办理。</p></div><button className="btn-secondary" onClick={() => setTick(t => t + 1)}>↻ 刷新列表</button></div>
      <section className="queue-panel queue-panel-full">
      <div className="queue-tabs" aria-label="责任范围">{[{ value: 'MINE', label: '我负责的' }, { value: 'VISIBLE', label: '全部可见' }].map(tab => <button key={tab.value} className={filters.responsibility === tab.value ? 'active' : ''} aria-pressed={filters.responsibility === tab.value} onClick={() => applyFilter({ responsibility: tab.value })}>{tab.label}</button>)}<span>事项列表</span></div>
      <div className="panel filter-panel">
        <label>
          类型
          <select value={filters.kind ?? ''} onChange={(e) => applyFilter({ kind: e.target.value || undefined })}>
            <option value="">全部</option>
            {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label>
          状态
          <select value={filters.status ?? ''} onChange={(e) => applyFilter({ status: e.target.value || undefined })}>
            <option value="">全部</option>
            <optgroup label="工作概览">{OVERVIEW_GROUPS.map(group => <option key={group.key} value={group.statuses.join(',')}>{group.label}</option>)}</optgroup>
            <optgroup label="单个状态">{STATUSES.filter(k => k !== 'READY').map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}</optgroup>
          </select>
        </label>
        <label>
          服务商
          <select value={filters.providerId ?? ''} onChange={(e) => applyFilter({ providerId: e.target.value || undefined })}>
            <option value="">全部</option>
            {providersState.status === 'ready' && providersState.data.map((p) => (
              <option key={p.providerId} value={p.providerId}>{p.displayName || p.providerId}</option>
            ))}
          </select>
        </label>
        <label>
          关键词
          <input value={keywordDraft} onChange={(e) => setKeywordDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyFilter({ keyword: keywordDraft || undefined })} placeholder="标题 / 工单编号 / 服务商名" />
        </label>
        <button className="btn-primary" onClick={() => applyFilter({ keyword: keywordDraft || undefined })}>查询</button>
      </div>

      <div className="panel">
        {listState.status === 'loading' && <Skeleton lines={6} />}
        {listState.status === 'failed' && (
          <StateView
            kind={errorKind(listState.error) === 'UNAVAILABLE' ? 'unavailable' : errorKind(listState.error) === 'FORBIDDEN' ? 'forbidden' : 'not-found'}
            onRetry={listRetry}
          />
        )}
        {listState.status === 'ready' && listState.data.list.length === 0 && (
          <div className="panel-center">
            <p className="state-title">{filters.responsibility === 'MINE' && !filters.kind && !filters.status && !filters.providerId && !filters.keyword ? '当前没有需要处理的事项' : '没有符合筛选条件的事项'}</p>
            {(filters.kind || filters.status || filters.providerId || filters.keyword) && (
              <button className="btn-primary" onClick={() => { setKeywordDraft(''); setFilters({ responsibility: filters.responsibility, page: 1, pageSize: 10 }); }}>清除筛选</button>
            )}
          </div>
        )}
        {listState.status === 'ready' && listState.data.list.length > 0 && (
          <div className="queue-table-wrap"><table className="queue-table"><thead><tr><th>事项 / 关联工单</th><th>状态</th><th>责任人</th><th>操作</th></tr></thead><tbody>
            {listState.data.list.map(it => <tr key={it.workItemId}>
              <td><span className="tag">{KIND_LABEL[it.kind] ?? it.kind}</span><button className="queue-title" onClick={() => navigate(`/work-items/${it.kind}/${it.workItemId}`)}>{it.title}</button><div className="item-row-sub">{[it.providerName, it.workOrderId].filter(Boolean).join(' · ')}</div><BillingSummary item={it} /></td>
              <td><span className={`tag tag-status status-${it.status.toLowerCase()}`}>{STATUS_LABEL[it.status] ?? it.status}</span>{ANALYSIS_LABEL[it.analysisStatus] && <div className="item-row-sub">{ANALYSIS_LABEL[it.analysisStatus]}</div>}</td>
              <td><span>{it.assignee?.displayName ?? '待分配'}</span><div className="item-row-sub">{fmtTime(it.updatedAt)}</div></td>
              <td><button className="row-action" onClick={() => navigate(`/work-items/${it.kind}/${it.workItemId}`)}>{it.status === 'COMPLETED' ? '查看' : '去处理'} →</button></td>
            </tr>)}
          </tbody></table></div>
        )}
      </div>

      {listState.status === 'ready' && (
        <div className="panel pager-panel">
          <span>共 {listState.data.total} 条 · 第 {listState.data.page} 页 · 查询时点 {fmtTime(listState.data.asOf)}</span>
          <span>
            <button className="btn-primary" disabled={filters.page === 1} onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}>上一页</button>
            <button className="btn-primary" disabled={(filters.page ?? 1) * (filters.pageSize ?? 10) >= listState.data.total} onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}>下一页</button>
          </span>
        </div>
      )}
      </section>
    </div>
  );
}
