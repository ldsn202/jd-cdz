import { FilteredItemsPage } from './workbench/FilteredItemsPage';

export default function ExceptionsPage() {
  return <FilteredItemsPage title="本地异常处置" fixedFilters={{ status: 'EXCEPTION' }} emptyText="当前没有待处置的本地异常" />;
}
