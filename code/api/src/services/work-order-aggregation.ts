import type { ResolvedIdentity } from './identity';
import { orderReadableProviderIds, readableProviderIds } from './work-item-query';

export type WorkOrderRow = {
  id: string;
  source_system: string;
  source_id: string;
  current_service_provider_id: string | null;
  provider_name: string | null;
  source_state: string;
  source_version: string | null;
  verified_at: number | null;
  context_snapshot_id: string | null;
  gmt_modified: number;
  purchase_order_id: string | null;
};

export type ItemAggregate = {
  activeKinds: string[];
  activeItemCount: number;
  maxItemModified: number | null;
};

const KIND_ORDER = [
  'INSTALLATION_PREPARATION',
  'INSTALLATION_REVIEW',
  'RECONCILIATION',
  'CONFIGURATION',
  'COORDINATION',
];

export function sortKinds(kinds: string[]): string[] {
  return KIND_ORDER.filter((k) => kinds.includes(k));
}

function itemScopeSql(itemIds: string[]): { sql: string; binds: string[] } {
  if (itemIds.length === 0) return { sql: '1=0', binds: [] };
  return {
    sql: `w.service_provider_id IN (SELECT value FROM json_each(?))`,
    binds: [JSON.stringify(itemIds)],
  };
}

export async function queryWorkOrders(
  db: D1Database,
  identity: ResolvedIdentity,
  opts: { providerId?: string; keyword?: string }
): Promise<WorkOrderRow[]> {
  const orderIds = orderReadableProviderIds(identity);
  if (orderIds.length === 0) return [];
  const binds: (string | number)[] = [JSON.stringify(orderIds)];
  const conds: string[] = [`wo.current_service_provider_id IN (SELECT value FROM json_each(?))`];
  if (opts.providerId) {
    conds.push('wo.current_service_provider_id = ?');
    binds.push(opts.providerId);
  }
  if (opts.keyword) {
    conds.push(
      `(wo.source_id LIKE ? OR EXISTS (
        SELECT 1 FROM installation_context_snapshot s
        WHERE s.id = wo.context_snapshot_id
          AND json_extract(s.context_json, '$.installationWorkOrder.purchaseOrderId') LIKE ?))`
    );
    binds.push(`%${opts.keyword}%`, `%${opts.keyword}%`);
  }
  const rows = await db
    .prepare(
      `SELECT wo.id, wo.source_system, wo.source_id, wo.current_service_provider_id,
              sp.display_name AS provider_name, wo.source_state, wo.source_version, wo.verified_at,
              wo.context_snapshot_id, wo.gmt_modified,
              (SELECT json_extract(s.context_json, '$.installationWorkOrder.purchaseOrderId')
                 FROM installation_context_snapshot s WHERE s.id = wo.context_snapshot_id) AS purchase_order_id
       FROM installation_work_order wo
       LEFT JOIN service_provider sp ON sp.id = wo.current_service_provider_id
       WHERE ${conds.join(' AND ')}`
    )
    .bind(...binds)
    .all<WorkOrderRow>();
  return rows.results ?? [];
}

export async function aggregateItems(
  db: D1Database,
  identity: ResolvedIdentity,
  workOrderId: string
): Promise<ItemAggregate> {
  const itemIds = readableProviderIds(identity);
  const scope = itemScopeSql(itemIds);
  const kindsRows = await db
    .prepare(
      `SELECT DISTINCT w.item_kind AS k FROM work_item w
       WHERE w.installation_work_order_id = ? AND w.status <> 'COMPLETED' AND ${scope.sql}`
    )
    .bind(workOrderId, ...scope.binds)
    .all<{ k: string }>();
  const countRow = await db
    .prepare(
      `SELECT COUNT(*) AS n, MAX(w.gmt_modified) AS mx FROM work_item w
       WHERE w.installation_work_order_id = ? AND w.status <> 'COMPLETED' AND ${scope.sql}`
    )
    .bind(workOrderId, ...scope.binds)
    .first<{ n: number; mx: number | null }>();
  const allTimeMax = await db
    .prepare(
      `SELECT MAX(w.gmt_modified) AS mx FROM work_item w
       WHERE w.installation_work_order_id = ? AND ${scope.sql}`
    )
    .bind(workOrderId, ...scope.binds)
    .first<{ mx: number | null }>();
  return {
    activeKinds: sortKinds((kindsRows.results ?? []).map((r) => r.k)),
    activeItemCount: countRow?.n ?? 0,
    maxItemModified: allTimeMax?.mx ?? null,
  };
}

export async function loadWorkOrder(
  db: D1Database,
  identity: ResolvedIdentity,
  workOrderId: string
): Promise<WorkOrderRow | null> {
  const orderIds = orderReadableProviderIds(identity);
  if (orderIds.length === 0) return null;
  return db
    .prepare(
      `SELECT wo.id, wo.source_system, wo.source_id, wo.current_service_provider_id,
              sp.display_name AS provider_name, wo.source_state, wo.source_version, wo.verified_at,
              wo.context_snapshot_id, wo.gmt_modified,
              (SELECT json_extract(s.context_json, '$.installationWorkOrder.purchaseOrderId')
                 FROM installation_context_snapshot s WHERE s.id = wo.context_snapshot_id) AS purchase_order_id
       FROM installation_work_order wo
       LEFT JOIN service_provider sp ON sp.id = wo.current_service_provider_id
       WHERE wo.id = ? AND wo.current_service_provider_id IN (SELECT value FROM json_each(?))`
    )
    .bind(workOrderId, JSON.stringify(orderIds))
    .first<WorkOrderRow>();
}

export async function aggregateItemMap(db:D1Database,identity:ResolvedIdentity,workOrderIds:string[]):Promise<Map<string,ItemAggregate>>{
 const map=new Map(workOrderIds.map(id=>[id,{activeKinds:[] as string[],activeItemCount:0,maxItemModified:null as number|null}]));
 const providers=readableProviderIds(identity);if(!workOrderIds.length||!providers.length)return map;
 const rows=await db.prepare(`SELECT installation_work_order_id,item_kind,SUM(CASE WHEN status<>'COMPLETED' THEN 1 ELSE 0 END) AS active_count,MAX(gmt_modified) AS modified
 FROM work_item WHERE service_provider_id IN (SELECT value FROM json_each(?)) AND installation_work_order_id IN (SELECT value FROM json_each(?)) GROUP BY installation_work_order_id,item_kind`)
 .bind(JSON.stringify(providers),JSON.stringify(workOrderIds)).all<{installation_work_order_id:string;item_kind:string;active_count:number;modified:number}>();
 for(const row of rows.results){const agg=map.get(row.installation_work_order_id)!;agg.activeItemCount+=row.active_count;agg.maxItemModified=Math.max(agg.maxItemModified??0,row.modified);if(row.active_count>0)agg.activeKinds.push(row.item_kind);}
 for(const agg of map.values())agg.activeKinds=sortKinds(agg.activeKinds);
 return map;
}
