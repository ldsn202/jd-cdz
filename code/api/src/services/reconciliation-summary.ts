import { subtractAmount } from './money';
import type { ResolvedIdentity } from './identity';
import type { WorkItemRow } from './work-item-query';

export type ReconciliationSummary = {
  reconciliationId: string;
  inputSnapshotId: string;
  status: 'PREPARING' | 'DIFFERENT' | 'NEEDS_INFORMATION' | 'RECONCILED';
  currency: string | null;
  jdTotal: string | null;
  providerTotal: string | null;
  difference: string | null;
};

export type SummaryAccess = 'NOT_APPLICABLE' | 'FORBIDDEN' | 'ALLOWED';

export function billingReadable(identity: ResolvedIdentity, providerId: string): boolean {
  return identity.grants.some(
    (g) =>
      g.scopeType === 'SERVICE_PROVIDER' &&
      g.actions.includes('READ_BILLING_RECORD') &&
      g.resourceIds.includes(providerId)
  );
}

export function summaryAccessOf(identity: ResolvedIdentity, row: WorkItemRow): SummaryAccess {
  if (row.item_kind !== 'RECONCILIATION') return 'NOT_APPLICABLE';
  if (!billingReadable(identity, row.service_provider_id)) return 'FORBIDDEN';
  return 'ALLOWED';
}

export async function loadSummaries(
  db: D1Database,
  items: WorkItemRow[]
): Promise<Map<string, ReconciliationSummary | null>> {
  const map = new Map<string, ReconciliationSummary | null>();
  const ids = items
    .filter((r) => r.item_kind === 'RECONCILIATION' && r.current_reconciliation_id)
    .map((r) => `${r.id}::${r.current_reconciliation_id}`);
  if (ids.length === 0) return map;
  const recIds = [...new Set(items.map((r) => r.current_reconciliation_id).filter((x): x is string => !!x))];
  if (recIds.length === 0) return map;
  const rows = await db
    .prepare(
      `SELECT id, work_item_id, snapshot_id, status, currency, jd_amount, provider_amount, difference_amount
       FROM reconciliation_record WHERE id IN (SELECT value FROM json_each(?))`
    )
    .bind(JSON.stringify(recIds))
    .all<{
      id: string;
      work_item_id: string;
      snapshot_id: string;
      status: 'MATCHED' | 'DIFFERENCE' | 'NEEDS_INFORMATION';
      currency: string | null;
      jd_amount: string | null;
      provider_amount: string | null;
      difference_amount: string | null;
    }>();
  const open = await db.prepare(`SELECT DISTINCT h.work_item_id FROM fee_verification_action f
    JOIN human_decision h ON h.id=f.human_decision_id
    WHERE f.action_kind='QUESTION' AND f.is_closed=0
      AND h.work_item_id IN (SELECT value FROM json_each(?))`)
    .bind(JSON.stringify(items.map(i => i.id))).all<{work_item_id:string}>();
  const unresolved = new Set(open.results.map(r => r.work_item_id));
  const byItem = new Map((rows.results ?? []).map((r) => [r.work_item_id, r]));
  for (const item of items) {
    if (item.item_kind !== 'RECONCILIATION') continue;
    const rec = item.current_reconciliation_id ? byItem.get(item.id) : undefined;
    if (!rec || rec.id !== item.current_reconciliation_id) {
      map.set(item.id, {
        reconciliationId: item.current_reconciliation_id ?? '',
        inputSnapshotId: '',
        status: 'PREPARING',
        currency: null,
        jdTotal: null,
        providerTotal: null,
        difference: null,
      });
      continue;
    }
    map.set(item.id, {
      reconciliationId: rec.id,
      inputSnapshotId: rec.snapshot_id,
      status: rec.status === 'MATCHED' ? (unresolved.has(item.id) ? 'NEEDS_INFORMATION' : 'RECONCILED') : rec.status === 'DIFFERENCE' ? 'DIFFERENT' : rec.status,
      currency: rec.currency,
      jdTotal: rec.jd_amount,
      providerTotal: rec.provider_amount,
      difference: rec.difference_amount !== null && rec.jd_amount !== null && rec.provider_amount !== null ? subtractAmount(rec.provider_amount, rec.jd_amount) : null,
    });
  }
  return map;
}
