import { BillingSummary } from './BillingSummary';
import { useState } from 'react';
import { useApiData, fmtTime } from '../../hooks';
import { errorKind, getWorkItems, type WorkItemFilters } from '../../api';
import { KIND_LABEL, STATUS_LABEL, ANALYSIS_LABEL } from '../../labels';
import { PageShell, Skeleton, StateView } from '../../components/PageShell';
import { navigate } from '../../router';

export function FilteredItemsPage({ title, description, fixedFilters, emptyText }: { title: string; description?: string; fixedFilters: WorkItemFilters; emptyText: string }) {
  const [page, setPage] = useState(1);
  const filters: WorkItemFilters = { responsibility: 'VISIBLE', pageSize: 10, ...fixedFilters, page };
  const [state, retry] = useApiData(() => getWorkItems(filters), [JSON.stringify(filters)]);

  return (
    <PageShell title={title}>
      {description && <p className="state-desc">{description}</p>}
      <div className="panel">
        {state.status === 'loading' && <Skeleton lines={6} />}
        {state.status === 'failed' && <StateView kind={errorKind(state.error) === 'UNAVAILABLE' ? 'unavailable' : 'not-found'} onRetry={retry} />}
        {state.status === 'ready' && state.data.list.length === 0 && (
          <div className="panel-center"><p className="state-title">{emptyText}</p></div>
        )}
        {state.status === 'ready' && state.data.list.length > 0 && (
          <ul className="item-list">
            {state.data.list.map((it) => (
              <li key={it.workItemId} className="item-row" onClick={() => navigate(`/work-items/${it.kind}/${it.workItemId}`)}>
                <div className="item-row-main">
                  <span className="item-title">{it.title}</span>
                  <span className="tag">{KIND_LABEL[it.kind] ?? it.kind}</span>
                  <span className="tag tag-status">{STATUS_LABEL[it.status] ?? it.status}</span>
                </div>
                <BillingSummary item={it} />
                <div className="item-row-sub">
                  {it.providerName && <span>{it.providerName}</span>}
                  {it.workOrderId && <span> · 工单 {it.workOrderId}</span>}
                  <span> · 责任人：{it.assignee?.displayName ?? '待分配'}</span>
                  {ANALYSIS_LABEL[it.analysisStatus] && <span className="tag tag-blocked">{ANALYSIS_LABEL[it.analysisStatus]}</span>}
                  <span> · {fmtTime(it.updatedAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {state.status === 'ready' && (
        <div className="panel pager-panel">
          <span>共 {state.data.total} 条 · 第 {state.data.page} 页 · 查询时点 {fmtTime(state.data.asOf)}</span>
          <span>
            <button className="btn-primary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>上一页</button>
            <button className="btn-primary" disabled={page * 10 >= state.data.total} onClick={() => setPage((p) => p + 1)}>下一页</button>
          </span>
        </div>
      )}
    </PageShell>
  );
}
