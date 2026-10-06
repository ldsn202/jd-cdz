import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { ERR, fail, newRequestId, ok, parsePage, toIso, nowMs } from '../lib/contract';
import { materialReadable } from '../services/material-read';
import {
  aggregateItems,
  aggregateItemMap,
  loadWorkOrder,
  queryWorkOrders,
  type ItemAggregate,
  type WorkOrderRow,
} from '../services/work-order-aggregation';

const workOrders = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function mapListItem(row: WorkOrderRow, agg: ItemAggregate) {
  const updatedMs = Math.max(row.gmt_modified, agg.maxItemModified ?? 0);
  return {
    workOrderId: row.id,
    sourceSystem: row.source_system,
    sourceId: row.source_id,
    providerId: row.current_service_provider_id,
    providerName: row.provider_name,
    purchaseOrderId: row.purchase_order_id,
    sourceState: row.source_state,
    sourceVersion: row.source_version,
    verifiedAt: row.verified_at ? toIso(row.verified_at) : null,
    activeKinds: agg.activeKinds,
    activeItemCount: agg.activeItemCount,
    updatedAt: toIso(updatedMs),
  };
}

workOrders.get('/work-orders', async (c) => {
  const requestId = newRequestId();
  const parsed = parsePage(c, requestId);
  if (parsed instanceof Response) return parsed;
  const identity = c.get('identity');
  const providerId = c.req.query('providerId') || undefined;
  const keyword = c.req.query('keyword') || undefined;

  const all = await queryWorkOrders(c.env.DB, identity, { providerId, keyword });
  const aggregates=await aggregateItemMap(c.env.DB,identity,all.map(row=>row.id));
  const withAgg=all.map(row=>({row,agg:aggregates.get(row.id)!}));
  withAgg.sort((a, b) => {
    const ta = Math.max(a.row.gmt_modified, a.agg.maxItemModified ?? 0);
    const tb = Math.max(b.row.gmt_modified, b.agg.maxItemModified ?? 0);
    if (ta !== tb) return tb - ta;
    return b.row.id < a.row.id ? -1 : 1;
  });
  const total = withAgg.length;
  const start = (parsed.page - 1) * parsed.pageSize;
  const list = withAgg.slice(start, start + parsed.pageSize).map(({ row, agg }) => mapListItem(row, agg));
  return ok(c, { list, total, page: parsed.page, pageSize: parsed.pageSize, asOf: toIso(nowMs()) }, requestId);
});

workOrders.get('/work-orders/:workOrderId', async (c) => {
  const requestId = newRequestId();
  const identity = c.get('identity');
  const workOrderId = c.req.param('workOrderId');
  const row = await loadWorkOrder(c.env.DB, identity, workOrderId);
  if (!row) {
    return fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', requestId);
  }
  const agg = await aggregateItems(c.env.DB, identity, row.id);

  let contextSnapshotId: string | null = null;
  let context: unknown = null;
  let materialReferences: unknown[] = [];
  if (row.context_snapshot_id) {
    const snap = await c.env.DB.prepare(
      `SELECT id, context_json, retrieved_at, completeness, missing_parts_json
       FROM installation_context_snapshot WHERE id = ? AND installation_work_order_id = ?`
    )
      .bind(row.context_snapshot_id, row.id)
      .first<{
        id: string; context_json: string; retrieved_at: number;
        completeness: string; missing_parts_json: string;
      }>();
    if (snap) {
      contextSnapshotId = snap.id;
      const ctx = JSON.parse(snap.context_json) as Record<string, unknown> & {
        sourceMaterials?: {
          sourceSystem: string; sourceMaterialId: string; sourceVersion: string;
          name?: string; mediaType?: string;
        }[];
      };
      context = { ...ctx, retrievedAt: toIso(snap.retrieved_at), completeness: snap.completeness, missingParts: JSON.parse(snap.missing_parts_json) };
      for (const m of ctx.sourceMaterials ?? []) {
        if (!row.current_service_provider_id || !materialReadable(identity, row.current_service_provider_id)) continue;
        const v = await c.env.DB.prepare(
          `SELECT v.id FROM source_material_version v
           JOIN source_material mm ON mm.id = v.source_material_id
           WHERE mm.source_system = ? AND mm.source_material_id = ? AND v.source_version = ?`
        )
          .bind(m.sourceSystem, m.sourceMaterialId, m.sourceVersion)
          .first<{ id: string }>();
        materialReferences.push({
          materialVersionId: v?.id ?? null,
          sourceSystem: m.sourceSystem,
          sourceMaterialId: m.sourceMaterialId,
          sourceVersion: m.sourceVersion,
          name: m.name ?? null,
          mediaType: m.mediaType ?? null,
        });
      }
    }
  }

  let entitlementRead: { status: string; data: unknown; errorCode: string | null };
  if (!row.purchase_order_id) {
    entitlementRead = { status: 'NOT_LINKED', data: null, errorCode: null };
  } else {
    entitlementRead = { status: 'UNAVAILABLE', data: null, errorCode: 'ENTITLEMENT_ADAPTER_PENDING' };
  }

  const itemSummary = await buildItemSummary(c.env.DB, identity, row.id);

  return ok(
    c,
    {
      ...mapListItem(row, agg),
      contextSnapshotId,
      context,
      entitlementRead,
      materialReferences,
      itemSummary,
      asOf: toIso(nowMs()),
    },
    requestId
  );
});

async function buildItemSummary(db: D1Database, identity: Variables['identity'], workOrderId: string) {
  const { readableProviderIds } = await import('../services/work-item-query');
  const itemIds = readableProviderIds(identity);
  const scope = itemIds.length > 0 ? `w.service_provider_id IN (SELECT value FROM json_each(?))` : '1=0';
  const binds = itemIds.length ? [workOrderId, JSON.stringify(itemIds)] : [workOrderId];
  const visible = await db
    .prepare(`SELECT COUNT(*) AS n FROM work_item w WHERE w.installation_work_order_id = ? AND ${scope}`)
    .bind(...binds)
    .first<{ n: number }>();
  const active = await db
    .prepare(`SELECT COUNT(*) AS n FROM work_item w WHERE w.installation_work_order_id = ? AND w.status <> 'COMPLETED' AND ${scope}`)
    .bind(...binds)
    .first<{ n: number }>();
  const byKind = await db
    .prepare(`SELECT w.item_kind AS value, COUNT(*) AS count FROM work_item w WHERE w.installation_work_order_id = ? AND ${scope} GROUP BY w.item_kind ORDER BY w.item_kind`)
    .bind(...binds)
    .all<{ value: string; count: number }>();
  const byStatus = await db
    .prepare(`SELECT w.status AS value, COUNT(*) AS count FROM work_item w WHERE w.installation_work_order_id = ? AND ${scope} GROUP BY w.status ORDER BY w.status`)
    .bind(...binds)
    .all<{ value: string; count: number }>();
  return {
    visibleTotal: visible?.n ?? 0,
    activeCount: active?.n ?? 0,
    byKind: byKind.results ?? [],
    byStatus: byStatus.results ?? [],
  };
}

export default workOrders;
