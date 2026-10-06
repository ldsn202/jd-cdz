import { useRoute } from '../router';
import { useApiData } from '../hooks';
import { apiFetch, getWorkItem } from '../api';
import { PageShell, Skeleton } from '../components/PageShell';
import { ReadError } from './workbench/ActionShared';
import { ReconciliationData, type ReconView } from './workbench/ReconciliationPanel';
export default function BillingComparePage() {
  const route = useRoute();
  const id = route?.params.id ?? '';
  const providerOnly = route?.name === 'billing-receivable';
  const [state, retry] = useApiData(async () => {
    const [data, item] = await Promise.all([apiFetch<ReconView>(`/api/admin/charging/work-items/${encodeURIComponent(id)}/reconciliation`), getWorkItem(id)]);
    return { data, item };
  }, [id]);
  return <PageShell title={providerOnly ? '服务商原应收' : '双方原记录比较'}>
    <a className="btn-link" href={`#/work-items/RECONCILIATION/${encodeURIComponent(id)}`}>返回对账事项与回复操作</a>
    {state.status === 'loading' && <Skeleton lines={5} />}
    {state.status === 'failed' && <ReadError error={state.error} retry={retry} />}
    {state.status === 'ready' && <div className="panel detail-panel">{providerOnly && <p className="state-desc">原应收在服务商原系统维护；此处展示已可靠取得的来源版本。新版读取后刷新比较结果。</p>}<ReconciliationData data={state.data.data} item={state.data.item} providerOnly={providerOnly} /></div>}
    <button className="btn-primary" onClick={retry}>刷新来源版本与比较进度</button>
  </PageShell>;
}
