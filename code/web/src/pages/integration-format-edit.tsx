import { useRoute } from '../router';
import { useApiData } from '../hooks';
import { apiFetch, errorKind } from '../api';
import { PageShell, Skeleton, StateView } from '../components/PageShell';

export default function IntegrationFormatEditPage() {
  const route = useRoute();
  const providerId = route?.name === 'integration-format-edit' ? route.params.providerId! : '';
  const formatId = route?.name === 'integration-format-edit' ? route.params.formatId! : '';
  const [state, retry] = useApiData(
    () => apiFetch<Record<string, unknown>>(`/api/admin/mock/external/sources/provider-docs/service-providers/${encodeURIComponent(providerId)}/records/${encodeURIComponent(formatId)}/documents`),
    [providerId, formatId]
  );

  if (state.status === 'loading') return <PageShell title="格式接入编辑"><Skeleton lines={6} /></PageShell>;
  if (state.status === 'failed') {
    return (
      <PageShell title="格式接入编辑">
        <StateView kind={errorKind(state.error) === 'NOT_FOUND' ? 'not-found' : errorKind(state.error) === 'FORBIDDEN' ? 'forbidden' : 'unavailable'} onRetry={retry} />
      </PageShell>
    );
  }
  return (
    <PageShell title={`格式接入编辑 ${formatId}`}>
      <div className="panel detail-panel">
        <h3 className="section-title">来源格式说明（只读底稿）</h3>
        <pre className="json-block">{JSON.stringify(state.data, null, 2)}</pre>
        <p className="state-desc">映射编辑能力由接入配置事项页面承载，本页展示来源格式原文与关联状态。</p>
      </div>
    </PageShell>
  );
}
