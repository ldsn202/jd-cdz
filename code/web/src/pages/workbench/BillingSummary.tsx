import type { WorkItemRow } from '../../api';
export function BillingSummary({ item }: { item: WorkItemRow }) {
  if (item.kind !== 'RECONCILIATION') return null;
  if (item.reconciliationSummaryAccess === 'FORBIDDEN') return <p className="state-desc">当前账号可查看事项，查看账单需使用业务对账或服务商应收账号</p>;
  const summary = item.reconciliationSummary;
  if (!summary) return <p className="state-desc">尚未取得可靠比较</p>;
  const labels: Record<string, string> = { PREPARING: '比较准备中', DIFFERENCE: '有差异', DIFFERENT: '有差异', NEEDS_INFORMATION: '待补充信息', RECONCILED: '核对一致' };
  return <p className="billing-summary"><span className="tag">{labels[summary.status] ?? summary.status}</span> 京东 {summary.jdTotal ?? '待核实'} · 服务商 {summary.providerTotal ?? '待核实'} · 差额 {summary.difference ?? '待核实'} {summary.currency ?? ''}</p>;
}
