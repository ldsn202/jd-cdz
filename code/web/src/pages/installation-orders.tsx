import { useState } from 'react';
import { useApiData, fmtTime } from '../hooks';
import { errorKind, getAllProviders, getWorkOrders } from '../api';
import { KIND_LABEL } from '../labels';
import { PageShell, Skeleton, StateView } from '../components/PageShell';
import { navigate } from '../router';

export default function InstallationOrdersPage() {
  const [filters, setFilters] = useState<{ providerId?: string; keyword?: string; page: number; pageSize: number }>({ page: 1, pageSize: 10 });
  const [keywordDraft, setKeywordDraft] = useState('');
  const [providersState] = useApiData(() => getAllProviders(), []);
  const [state, retry] = useApiData(() => getWorkOrders(filters), [JSON.stringify(filters)]);

  return (
    <PageShell title="安装工单列表">
      <div className="panel filter-panel">
        <label>
          服务商
          <select value={filters.providerId ?? ''} onChange={(e) => setFilters((f) => ({ ...f, providerId: e.target.value || undefined, page: 1 }))}>
            <option value="">全部</option>
            {providersState.status === 'ready' && providersState.data.map((p) => (
              <option key={p.providerId} value={p.providerId}>{p.displayName || p.providerId}</option>
            ))}
          </select>
        </label>
        <label>
          关键词
          <input value={keywordDraft} onChange={(e) => setKeywordDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setFilters((f) => ({ ...f, keyword: keywordDraft || undefined, page: 1 }))} placeholder="工单 / 订单编号" />
        </label>
        <button className="btn-primary" onClick={() => setFilters((f) => ({ ...f, keyword: keywordDraft || undefined, page: 1 }))}>查询</button>
      </div>

      <div className="panel">
        {state.status === 'loading' && <Skeleton lines={6} />}
        {state.status === 'failed' && <StateView kind={errorKind(state.error) === 'UNAVAILABLE' ? 'unavailable' : 'not-found'} onRetry={retry} />}
        {state.status === 'ready' && state.data.list.length === 0 && (
          <div className="panel-center"><p className="state-title">授权范围内暂无安装工单</p></div>
        )}
        {state.status === 'ready' && state.data.list.length > 0 && (
          <table className="data-table">
            <thead>
              <tr><th>工单编号</th><th>服务商</th><th>购买订单</th><th>当前阶段</th><th>进行中事项</th><th>最近更新</th></tr>
            </thead>
            <tbody>
              {state.data.list.map((o) => (
                <tr key={o.workOrderId} onClick={() => navigate(`/installation/orders/${o.workOrderId}`)}>
                  <td>{o.sourceId}</td>
                  <td>{o.providerName || o.providerId || '—'}</td>
                  <td>{o.purchaseOrderId ?? '—'}</td>
                  <td>{o.activeKinds.map((k) => KIND_LABEL[k] ?? k).join('、') || '—'}</td>
                  <td>{o.activeItemCount}</td>
                  <td>{fmtTime(o.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {state.status === 'ready' && (
        <div className="panel pager-panel">
          <span>共 {state.data.total} 条 · 第 {state.data.page} 页</span>
          <span>
            <button className="btn-primary" disabled={filters.page === 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>上一页</button>
            <button className="btn-primary" disabled={filters.page * filters.pageSize >= state.data.total} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>下一页</button>
          </span>
        </div>
      )}
    </PageShell>
  );
}
