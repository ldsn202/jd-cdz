import { useState } from 'react';
import { useRoute, navigate } from '../router';
import { useApiData, fmtTime } from '../hooks';
import { errorKind, getWorkItems, getWorkOrder } from '../api';
import { KIND_LABEL, STATUS_LABEL, ANALYSIS_LABEL } from '../labels';
import { PageShell, Skeleton, StateView } from '../components/PageShell';
import { EvidenceSidebar } from './orders/EvidenceSidebar';

export default function InstallationOrderDetailPage() {
  const route = useRoute();
  const id = route?.name === 'installation-order-detail' ? route.params.id! : '';
  const [state, retry] = useApiData(() => getWorkOrder(id), [id]);
  const [itemsState] = useApiData(() => getWorkItems({ workOrderId: id, responsibility: 'VISIBLE', pageSize: 50 }), [id]);
  const [evidenceId, setEvidenceId] = useState<string | null>(null);

  if (state.status === 'loading') return <PageShell title="安装工单详情"><Skeleton lines={6} /></PageShell>;
  if (state.status === 'failed') {
    return (
      <PageShell title="安装工单详情">
        <StateView kind={errorKind(state.error) === 'NOT_FOUND' ? 'not-found' : errorKind(state.error) === 'FORBIDDEN' ? 'forbidden' : 'unavailable'} onRetry={retry} />
      </PageShell>
    );
  }
  const o = state.data;
  return (
    <PageShell title={`安装工单 ${o.sourceId}`}>
      <div className="detail-layout">
        <div className="detail-main">
          <div className="panel detail-panel">
            <h3 className="section-title">基本信息</h3>
            <p>服务商：{o.providerName || o.providerId || '—'}</p>
            <p>来源：{o.sourceSystem} · 版本 {o.sourceVersion ?? '未知'} · 状态 {o.sourceState ?? '未知'}</p>
            <p className="state-desc">最近更新 {fmtTime(o.updatedAt)}</p>
          </div>

          <div className="panel detail-panel">
            <h3 className="section-title">购买订单与安装权益</h3>
            <p>购买订单：{o.purchaseOrderId ?? '—'}</p>
            {o.entitlementRead?.status === 'READ' && o.entitlementRead.data ? (
              <pre className="json-block">{JSON.stringify(o.entitlementRead.data, null, 2)}</pre>
            ) : (
              <p className="state-desc">权益信息{o.entitlementRead ? `读取${o.entitlementRead.status}` : '未取得'}，不显示无依据内容</p>
            )}
          </div>

          <div className="panel detail-panel">
            <h3 className="section-title">安装方案</h3>
            {o.planSummary ? (
              <ul className="plain-list">
                {o.planSummary.items.map((it, idx) => (
                  <li key={idx}>{it.installationItem}：{it.plannedQuantity ?? '数量未知'} {it.unit ?? ''}</li>
                ))}
              </ul>
            ) : (
              <p className="state-desc">当前有效方案未取得</p>
            )}
          </div>

          <div className="panel detail-panel">
            <h3 className="section-title">原始材料</h3>
            {o.materialReferences.length === 0 && <p className="state-desc">当前上下文无材料索引</p>}
            <ul className="plain-list">
              {o.materialReferences.map((m) => (
                <li key={`${m.sourceMaterialId}@${m.sourceVersion}`}>
                  {m.name ?? m.sourceMaterialId}（{m.sourceVersion}）
                  {m.readState === 'VERIFIED' && m.materialVersionId ? (
                    <button className="btn-link" onClick={() => setEvidenceId(m.materialVersionId)}>查看原文</button>
                  ) : (
                    <span className="state-desc"> · 未导入版本，不开放预览</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="panel detail-panel">
            <h3 className="section-title">处理事项</h3>
            {itemsState.status === 'loading' && <Skeleton lines={3} />}
            {itemsState.status === 'ready' && itemsState.data.list.length === 0 && <p className="state-desc">本工单暂无可见事项</p>}
            {itemsState.status === 'ready' && itemsState.data.list.length > 0 && (
              <ul className="item-list">
                {itemsState.data.list.map((it) => (
                  <li key={it.workItemId} className="item-row" onClick={() => navigate(`/work-items/${it.kind}/${it.workItemId}`)}>
                    <div className="item-row-main">
                      <span className="item-title">{it.title}</span>
                      <span className="tag">{KIND_LABEL[it.kind] ?? it.kind}</span>
                      <span className="tag tag-status">{STATUS_LABEL[it.status] ?? it.status}</span>
                    </div>
                    <div className="item-row-sub">
                      <span>责任人：{it.assignee?.displayName ?? '待分配'}</span>
                      {ANALYSIS_LABEL[it.analysisStatus] && <span className="tag tag-blocked">{ANALYSIS_LABEL[it.analysisStatus]}</span>}
                      <span> · {fmtTime(it.updatedAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {evidenceId && <EvidenceSidebar materialVersionId={evidenceId} onClose={() => setEvidenceId(null)} />}
      </div>
    </PageShell>
  );
}
