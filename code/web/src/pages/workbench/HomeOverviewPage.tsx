import { useState } from 'react';
import { getWorkItems, getWorkItemsSummary } from '../../api';
import { useApiData, fmtTime } from '../../hooks';
import { KIND_LABEL, STATUS_LABEL } from '../../labels';
import { navigate } from '../../router';
import { Skeleton, StateView } from '../../components/PageShell';
import { buildOverviewCards } from './overview';
import { workItemsPath } from './work-item-filters';
import {DemoCases} from './DemoCases';

const CARD_ICONS: Record<string, string> = {
  actionable: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h4',
  waiting: 'M12 3a9 9 0 1 1-9 9M12 7v6l4 2M3 3v6h6',
  processing: 'M4 12h4l3 7 5-14 3 7h2',
  blocked: 'M12 3 2 21h20zM12 9v5M12 17v1',
};

export function HomeOverviewPage() {
  const [tick, setTick] = useState(0);
  const filters = { responsibility: 'MINE', page: 1, pageSize: 5 } as const;
  const [summaryState, summaryRetry] = useApiData(() => getWorkItemsSummary(filters), [tick]);
  const [listState, listRetry] = useApiData(() => getWorkItems(filters), [tick]);
  const refresh = () => setTick((value) => value + 1);

  return <div className="home-overview">
    <header className="workbench-heading">
      <div><div className="eyebrow">工作台 / OVERVIEW</div><h1>工作概览</h1><p>先确认需要立即处理的事项，再进入完整队列查找和跟进。</p></div>
      <button className="btn-secondary" onClick={refresh}>↻ 刷新概览</button>
    </header>

    {summaryState.status === 'loading' && <div className="workbench-stats home-stats"><Skeleton lines={3} /></div>}
    {summaryState.status === 'failed' && <StateView kind="unavailable" onRetry={summaryRetry} />}
    {summaryState.status === 'ready' && <div className="workbench-stats home-stats">
      {buildOverviewCards(summaryState.data).map((card) => <a className={`stat-card overview-card-link overview-${card.tone}`} key={card.key} href={`#${workItemsPath({ responsibility: 'MINE', status: card.statuses.join(',') })}`} aria-label={`查看${card.label}，${card.value}项`}>
        <div><span className="stat-label">{card.label}</span><div className="stat-value">{card.value}<small>项</small></div><p>{card.note}</p></div>
        <span className="stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d={CARD_ICONS[card.key]} /></svg></span>
      </a>)}
    </div>}

    <DemoCases/>
    <div className="home-overview-grid">
      <section className="home-focus panel">
        <header className="home-section-head"><div><h2>最近更新的事项</h2><p>显示当前由你负责的最近 5 条事项</p></div><button className="row-action" onClick={() => navigate('/work-items')}>查看全部处理事项 →</button></header>
        {listState.status === 'loading' && <div className="home-loading"><Skeleton lines={5} /></div>}
        {listState.status === 'failed' && <StateView kind="unavailable" onRetry={listRetry} />}
        {listState.status === 'ready' && listState.data.list.length === 0 && <div className="panel-center"><p className="state-title">当前没有由你负责的事项</p><p className="state-desc">可进入处理事项查看全部可见范围。</p></div>}
        {listState.status === 'ready' && listState.data.list.length > 0 && <ol className="home-focus-list">
          {listState.data.list.map((item) => <li key={item.workItemId}>
            <button className="home-focus-main" onClick={() => navigate(`/work-items/${item.kind}/${item.workItemId}`)}>
              <span className="home-focus-title"><span className="tag">{KIND_LABEL[item.kind] ?? item.kind}</span>{item.title}</span>
              <span className="home-focus-meta">{[item.providerName, item.workOrderId].filter(Boolean).join(' · ') || '未关联工单'} · {fmtTime(item.updatedAt)}</span>
            </button>
            <div className="home-focus-action"><span className={`tag tag-status status-${item.status.toLowerCase()}`}>{STATUS_LABEL[item.status] ?? item.status}</span><button className="row-action" onClick={() => navigate(`/work-items/${item.kind}/${item.workItemId}`)}>{item.status === 'COMPLETED' ? '查看' : item.status === 'PROCESSING' ? '查看进度' : '去处理'} →</button></div>
          </li>)}
        </ol>}
      </section>

      <aside className="home-shortcuts">
        <section className="guide-card"><span className="guide-symbol" aria-hidden="true">✓</span><h2>从事项开始处理</h2><p>事项内已经整理好分析结果与判断依据。进入详情后，根据当前状态完成确认、补充或跟进。</p><button className="btn-primary home-primary" onClick={() => navigate('/work-items')}>进入处理事项</button></section>
        <section className="quick-card"><h2>业务查询</h2><button onClick={() => navigate('/installation/orders')}>安装工单 <span>→</span></button><button onClick={() => navigate('/billing/orders')}>业务对账 <span>→</span></button></section>
      </aside>
    </div>
  </div>;
}
