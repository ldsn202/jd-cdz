export type PendingOperation = { operationId: string; status: string };
export type Envelope<T> = { code: number; msg: string; requestId: string; data: T; pendingOperation?: PendingOperation };

export class ApiError extends Error {
  code: number;
  httpStatus: number;
  requestId: string;
  pendingOperation: PendingOperation | null;
  constructor(code: number, msg: string, httpStatus: number, requestId: string, pendingOperation?: PendingOperation) {
    super(msg);
    this.name = 'ApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.requestId = requestId;
    this.pendingOperation = pendingOperation ?? null;
  }
}

export type ErrorKind = 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'UNAVAILABLE' | 'UNAUTHENTICATED' | 'UNKNOWN';

export function errorKind(e: unknown): ErrorKind {
  if (!(e instanceof ApiError)) return 'UNKNOWN';
  if (e.code === 40404 || e.code === 40401) return 'NOT_FOUND';
  if (e.code === 40301 || e.code === 40303) return 'FORBIDDEN';
  if (e.code === 40903 || e.code === 40904 || e.code === 40901) return 'CONFLICT';
  if (e.code === 50301 || e.code === 50401) return 'UNAVAILABLE';
  if (e.code === 40101) return 'UNAUTHENTICATED';
  return 'UNKNOWN';
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    const headers = new Headers(init?.headers);
    if (!(init?.body instanceof FormData) && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
    res = await fetch(path, {
      ...init,
      headers,
    });
  } catch (e) {
    throw new ApiError(50301, `网络或服务不可达：${(e as Error).message}`, 503, '');
  }
  let body: Envelope<T>;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    throw new ApiError(50201, `服务返回无法解析（HTTP ${res.status}）`, res.status, '');
  }
  if (body.code !== 0) {
    throw new ApiError(body.code, body.msg, res.status, body.requestId ?? '', body.pendingOperation);
  }
  return body.data;
}

export type SessionInfo = {
  identityId: string;
  displayName: string;
  subjectType: 'HUMAN' | 'SERVICE';
  businessRoles: string[];
  authorizationVersion: string | null;
  verifiedAt: string;
  accountSwitchingAvailable?: boolean;
};

export function getSession(): Promise<SessionInfo> {
  return apiFetch<SessionInfo>('/api/admin/charging/session');
}

export type SwitchableAccount = { accountId: string; identityId: string; displayName: string; businessRoles: string[] };
export function getSwitchableAccounts(): Promise<{ list: SwitchableAccount[] }> {
  return apiFetch('/api/admin/charging/session/accounts');
}
export function switchAccount(accountId: string): Promise<{ identityId: string; displayName: string }> {
  return apiFetch('/api/admin/charging/session/switch', { method: 'POST', body: JSON.stringify({ accountId }) });
}

export type Provider = { providerId: string; displayName: string };
export type WorkItemRow = {
  workItemId: string;
  title: string;
  kind: string;
  status: string;
  providerId: string | null;
  providerName: string | null;
  workOrderId: string | null;
  assignee: { identityId: string; displayName: string } | null;
  analysisStatus: string;
  updatedAt: string;
  reconciliationSummary?: { status: string; currency: string | null; jdTotal: string | null; providerTotal: string | null; difference: string | null } | null;
  reconciliationSummaryAccess?: 'ALLOWED' | 'FORBIDDEN' | 'NOT_APPLICABLE';
  rowVersion?: number;
  responsibilityVersion?: number;
  analysisGeneration?: string;
};
export type Paged<T> = { list: T[]; total: number; page: number; pageSize: number; asOf: string };
export type WorkItemsSummary = { total: number; byStatus: { value: string; count: number }[]; byKind: { value: string; count: number }[]; asOf: string };

export type WorkItemFilters = {
  responsibility?: string;
  kind?: string;
  status?: string;
  providerId?: string;
  keyword?: string;
  workOrderId?: string;
  page?: number;
  pageSize?: number;
};

function qs(params: Record<string, string | number | undefined>): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `?${q}` : '';
}

export function getProviders(keyword?: string): Promise<Paged<Provider>> {
  return apiFetch(`/api/admin/charging/providers${qs({ keyword })}`);
}

export async function getAllProviders(keyword?: string): Promise<Provider[]> {
  const providers = new Map<string, Provider>();
  let page = 1;
  while (true) {
    const batch = await apiFetch<Paged<Provider>>(`/api/admin/charging/providers${qs({ keyword, page, pageSize: 50 })}`);
    batch.list.forEach(provider => providers.set(provider.providerId, provider));
    if (!batch.list.length || page * batch.pageSize >= batch.total) return [...providers.values()];
    page += 1;
  }
}

export function getWorkItemsSummary(f: WorkItemFilters): Promise<WorkItemsSummary> {
  return apiFetch(`/api/admin/charging/work-items/summary${qs({ ...f, page: undefined, pageSize: undefined })}`);
}

export function getWorkItems(f: WorkItemFilters): Promise<Paged<WorkItemRow>> {
  return apiFetch(`/api/admin/charging/work-items${qs({ ...f })}`);
}

export type WorkItemDetail = WorkItemRow & {
  analysisTriggerMode?: 'manual' | 'automatic';
  analysisProgress?: { state: string; description: string; errorCode: string | null };
  analysisRuntimeError?: string | null;
  canRequestAnalysis?: boolean;
  analysis: {
    resultId: string | null;
    runId?: string;
    inputSnapshotId?: string;
    analysisGeneration?: string;
    summary: string | null;
    status: string | null;
    findings?: any[];
    contextRecords?: { inputId: string; recordType: string; data: unknown }[];
    evidenceMaterials?: { inputId: string; materialVersionId: string; sourceVersion: string; sourceMaterialId?: string; sourceSystem?: string }[];
    openQuestions?: unknown;
    validatedAt: string | null;
  } | null;
  activeSupplementRequest?: { requestDecisionId: string; questions: unknown[]; replies: unknown[] } | null;
  allowedActions?: string[];
  blockedReasons?: { code: string; description: string }[];
  pendingOperation?: { operationId: string; status: string } | null;
  relatedItems?: { workItemId: string; reasonCode: string; title: string }[];
  completion?: { basis?: unknown; decisionId?: string | null; code: string | null; completedAt: string | null } | null;
};

export function getWorkItem(id: string): Promise<WorkItemDetail> {
  return apiFetch(`/api/admin/charging/work-items/${encodeURIComponent(id)}`);
}

export type ActivityRow = {
  activityId: string;
  eventType: string;
  description: string | null;
  actor: { identityId: string; displayName: string } | null;
  occurredAt: string | null;
  factType: string | null;
  factId: string | null;
  operationId: string | null;
};

export function getWorkItemActivities(id: string, page?: number): Promise<Paged<ActivityRow>> {
  return apiFetch(`/api/admin/charging/work-items/${encodeURIComponent(id)}/activities${qs({ page })}`);
}

export type OperationInfo = {
  operationId: string;
  status: string;
  receipt: unknown;
  verifiedAt: string | null;
  localContinuationStatus: string | null;
};

export function getOperation(id: string): Promise<OperationInfo> {
  return apiFetch(`/api/admin/charging/operations/${encodeURIComponent(id)}`);
}

export type WorkOrderRow = {
  workOrderId: string;
  sourceId: string;
  providerId: string | null;
  providerName: string | null;
  purchaseOrderId: string | null;
  activeKinds: string[];
  activeItemCount: number;
  updatedAt: string;
};

export function getWorkOrders(f: { providerId?: string; keyword?: string; page?: number; pageSize?: number }): Promise<Paged<WorkOrderRow>> {
  return apiFetch(`/api/admin/charging/work-orders${qs({ ...f })}`);
}

export type WorkOrderDetail = {
  workOrderId: string;
  sourceId: string;
  providerId: string | null;
  sourceSystem: string;
  sourceVersion: string | null;
  sourceState: string | null;
  providerName: string | null;
  purchaseOrderId: string | null;
  planSummary: { installationPlanId: string | null; items: { installationItem: string; plannedQuantity: number | null; unit: string | null }[] } | null;
  entitlementRead: { status: string; data: unknown } | null;
  materialReferences: { materialVersionId: string | null; sourceMaterialId: string; sourceVersion: string; name: string | null; mediaType: string | null; readState: string | null }[];
  updatedAt: string;
};

export function getWorkOrder(id: string): Promise<WorkOrderDetail> {
  return apiFetch(`/api/admin/charging/work-orders/${encodeURIComponent(id)}`);
}

export type MaterialVersionInfo = {
  materialVersionId: string;
  name: string | null;
  mediaType: string | null;
  byteLength: number | null;
  sha256: string | null;
  sourceVersion: string | null;
  readState: string;
  parsing: {
    completeness: string;
    units: { unitId: string; kind: string; index: number; name: string | null }[];
    blocks: { blockId: string; unitId: string; kind: string; text: string | null; cellRange: string | null }[];
    issues: string[];
  } | null;
  versions?: { materialVersionId: string; sourceVersion: string | null }[];
};

export function getMaterialVersion(id: string): Promise<MaterialVersionInfo> {
  return apiFetch(`/api/admin/charging/material-versions/${encodeURIComponent(id)}`);
}

export function materialContentUrl(id: string): string {
  return `/api/admin/charging/material-versions/${encodeURIComponent(id)}/content`;
}
