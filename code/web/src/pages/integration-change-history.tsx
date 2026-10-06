import { FilteredItemsPage } from './workbench/FilteredItemsPage';

export default function IntegrationChangeHistoryPage() {
  return <FilteredItemsPage title="变更历史" fixedFilters={{ kind: 'CONFIGURATION', status: 'COMPLETED' }} emptyText="暂无已完成的接入变更记录" />;
}
