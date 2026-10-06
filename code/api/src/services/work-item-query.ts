import type { ResolvedIdentity } from './identity';
import { CURRENT_ANALYSIS_JOB } from './analysis-control';

export const WORK_ITEM_KINDS = [
  'INSTALLATION_PREPARATION',
  'INSTALLATION_REVIEW',
  'RECONCILIATION',
  'CONFIGURATION',
  'COORDINATION',
] as const;

export const WORK_ITEM_STATUSES = [
  'PREPARING',
  'READY',
  'WAITING_SUPPLEMENT',
  'WAITING_REPLY',
  'PROCESSING',
  'EXCEPTION',
  'BLOCKED',
  'COMPLETED',
] as const;

export type WorkItemRow = {
  id: string;
  service_provider_id: string;
  installation_work_order_id: string | null;
  item_kind: string;
  business_key: string;
  title: string;
  status: string;
  assignee_identity_id: string | null;
  assignee_display_name: string | null;
  provider_name: string | null;
  responsibility_version: number;
  row_version: number;
  analysis_generation: number;
  current_analysis_result_id: string | null;
  program_checked?: number;
  current_reconciliation_id: string | null;
  active_supplement_request_id: string | null;
  integration_config_id: string | null;
  current_configuration_version_id: string | null;
  pending_write_id: string | null;
  blocked_reason: string | null;
  completion_code: string | null;
  completion_basis_json: string | null;
  completion_decision_id: string | null;
  completed_at: number | null;
  gmt_modified: number;
  analysis_blocked: number;
};

export function readableProviderIds(identity: ResolvedIdentity): string[] {
  const ids = new Set<string>();
  for (const g of identity.grants) {
    if (g.scopeType === 'SERVICE_PROVIDER' && g.actions.includes('READ_WORK_ITEM')) {
      for (const id of g.resourceIds) ids.add(id);
    }
  }
  return [...ids];
}

export function orderReadableProviderIds(identity: ResolvedIdentity): string[] {
  const ids = new Set<string>();
  for (const g of identity.grants) {
    if (g.scopeType === 'SERVICE_PROVIDER' && g.actions.includes('READ_WORK_ORDER')) {
      for (const id of g.resourceIds) ids.add(id);
    }
  }
  return [...ids];
}

export type WorkItemFilters = {
  providerId?: string;
  workOrderId?: string;
  kind?: string;
  status?: string;
  keyword?: string;
  responsibility: 'MINE' | 'VISIBLE';
};

const SELECT_COLS = `
  w.id, w.service_provider_id, w.installation_work_order_id, w.item_kind, w.business_key, w.title, w.status,
  w.assignee_identity_id, ai.display_name AS assignee_display_name, sp.display_name AS provider_name,
  w.responsibility_version, w.row_version, w.analysis_generation,
  w.current_analysis_result_id, w.current_reconciliation_id, w.active_supplement_request_id,
  w.integration_config_id, w.current_configuration_version_id, w.pending_write_id,
  w.blocked_reason, w.completion_code, w.completion_basis_json, w.completion_decision_id, w.completed_at,
  w.gmt_modified,
  EXISTS(SELECT 1 FROM reconciliation_record r JOIN analysis_input_snapshot s ON s.id=r.snapshot_id WHERE r.id=w.current_reconciliation_id AND r.status='MATCHED' AND s.analysis_generation=w.analysis_generation) AS program_checked,
  COALESCE((SELECT bj.status FROM background_job bj WHERE bj.work_item_id=w.id AND (${CURRENT_ANALYSIS_JOB}) ORDER BY bj.gmt_create DESC,bj.id DESC LIMIT 1),'') IN ('FAILED','BLOCKED') AS analysis_blocked
`;

const FROM_JOIN = `
  FROM work_item w
  JOIN service_provider sp ON sp.id = w.service_provider_id
  LEFT JOIN identity_reference ai ON ai.id = w.assignee_identity_id
  LEFT JOIN installation_work_order wo ON wo.id = w.installation_work_order_id
`;

export function buildFilter(
  identity: ResolvedIdentity,
  filters: WorkItemFilters
): { where: string; binds: (string | number)[] } | { error: 'KIND' | 'STATUS' } {
  const ids = readableProviderIds(identity);
  const binds: (string | number)[] = [];
  const conds: string[] = [];
  if (ids.length === 0) {
    conds.push('1=0');
  } else {
    conds.push(`w.service_provider_id IN (SELECT value FROM json_each(?))`);
    binds.push(JSON.stringify(ids));
  }
  if (filters.responsibility === 'MINE') {
    conds.push('w.assignee_identity_id = ?');
    binds.push(identity.identityId);
  }
  if (filters.providerId) {
    conds.push('w.service_provider_id = ?');
    binds.push(filters.providerId);
  }
  if (filters.workOrderId) {
    conds.push('w.installation_work_order_id = ?');
    binds.push(filters.workOrderId);
  }
  if (filters.kind) {
    if (!WORK_ITEM_KINDS.includes(filters.kind as (typeof WORK_ITEM_KINDS)[number])) return { error: 'KIND' };
    conds.push('w.item_kind = ?');
    binds.push(filters.kind);
  }
  if (filters.status) {
    const statuses = [...new Set(filters.status.split(','))];
    if (statuses.some(status => !WORK_ITEM_STATUSES.includes(status as (typeof WORK_ITEM_STATUSES)[number]))) return { error: 'STATUS' };
    conds.push('w.status IN (SELECT value FROM json_each(?))');
    binds.push(JSON.stringify(statuses));
  }
  if (filters.keyword) {
    conds.push('(w.title LIKE ? OR wo.source_id LIKE ? OR sp.display_name LIKE ?)');
    const like = `%${filters.keyword}%`;
    binds.push(like, like, like);
  }
  return { where: conds.join(' AND '), binds };
}

export async function queryWorkItems(
  db: D1Database,
  identity: ResolvedIdentity,
  filters: WorkItemFilters,
  page: number,
  pageSize: number
): Promise<{ list: WorkItemRow[]; total: number } | { error: 'KIND' | 'STATUS' }> {
  const built = buildFilter(identity, filters);
  if ('error' in built) return built;
  const { where, binds } = built;
  const totalRow = await db
    .prepare(`SELECT COUNT(*) AS n ${FROM_JOIN} WHERE ${where}`)
    .bind(...binds)
    .first<{ n: number }>();
  const rows = await db
    .prepare(
      `SELECT ${SELECT_COLS} ${FROM_JOIN} WHERE ${where}
       ORDER BY w.gmt_modified DESC, w.id DESC LIMIT ? OFFSET ?`
    )
    .bind(...binds, pageSize, (page - 1) * pageSize)
    .all<WorkItemRow>();
  return { list: rows.results ?? [], total: totalRow?.n ?? 0 };
}

export async function queryWorkItemSummary(
  db: D1Database,
  identity: ResolvedIdentity,
  filters: WorkItemFilters
): Promise<{ total: number; byStatus: { value: string; count: number }[]; byKind: { value: string; count: number }[] } | { error: 'KIND' | 'STATUS' }> {
  const built = buildFilter(identity, filters);
  if ('error' in built) return built;
  const { where, binds } = built;
  const totalRow = await db
    .prepare(`SELECT COUNT(*) AS n ${FROM_JOIN} WHERE ${where}`)
    .bind(...binds)
    .first<{ n: number }>();
  const byStatus = await db
    .prepare(`SELECT w.status AS value, COUNT(*) AS count ${FROM_JOIN} WHERE ${where} GROUP BY w.status ORDER BY w.status`)
    .bind(...binds)
    .all<{ value: string; count: number }>();
  const byKind = await db
    .prepare(`SELECT w.item_kind AS value, COUNT(*) AS count ${FROM_JOIN} WHERE ${where} GROUP BY w.item_kind ORDER BY w.item_kind`)
    .bind(...binds)
    .all<{ value: string; count: number }>();
  return {
    total: totalRow?.n ?? 0,
    byStatus: byStatus.results ?? [],
    byKind: byKind.results ?? [],
  };
}

export async function loadWorkItem(
  db: D1Database,
  identity: ResolvedIdentity,
  workItemId: string
): Promise<WorkItemRow | null> {
  const built = buildFilter(identity, { responsibility: 'VISIBLE' });
  if ('error' in built) return null;
  const { where, binds } = built;
  return db
    .prepare(`SELECT ${SELECT_COLS} ${FROM_JOIN} WHERE ${where} AND w.id = ?`)
    .bind(...binds, workItemId)
    .first<WorkItemRow>();
}

export function analysisStatusOf(row: WorkItemRow): 'NOT_READY' | 'AVAILABLE' | 'BLOCKED' {
  if (row.current_analysis_result_id || row.program_checked) return 'AVAILABLE';
  if (row.analysis_blocked) return 'BLOCKED';
  return 'NOT_READY';
}
