import type { WorkItemFilters } from '../../api';

export function workItemsPath(filters: WorkItemFilters): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value != null && value !== '') query.set(key, String(value));
  }
  return '/work-items' + (query.size ? `?${query}` : '');
}

export function workItemFiltersFromParams(params: Record<string, string>): WorkItemFilters {
  const positiveInt = (value: string | undefined, fallback: number, max: number) => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 && n <= max ? n : fallback;
  };
  return {
    responsibility: params.responsibility === 'VISIBLE' ? 'VISIBLE' : 'MINE',
    status: params.status || undefined,
    kind: params.kind || undefined,
    providerId: params.providerId || undefined,
    keyword: params.keyword || undefined,
    workOrderId: params.workOrderId || undefined,
    page: positiveInt(params.page, 1, Number.MAX_SAFE_INTEGER),
    pageSize: positiveInt(params.pageSize, 10, 50),
  };
}
