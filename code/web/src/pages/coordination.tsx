import { FilteredItemsPage } from './workbench/FilteredItemsPage';

export default function CoordinationPage() {
  return <FilteredItemsPage title="履约协同问题" fixedFilters={{ kind: 'COORDINATION' }} emptyText="当前没有需要协同的履约问题" />;
}
