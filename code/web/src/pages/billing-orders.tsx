import { BusinessItemsTablePage } from './workbench/BusinessItemsTablePage';

export default function BillingOrdersPage() {
  return <BusinessItemsTablePage kind="RECONCILIATION" title="业务对账" description="按工单核对京东金额与服务商应收，查看差异并跟进核实。" />;
}
