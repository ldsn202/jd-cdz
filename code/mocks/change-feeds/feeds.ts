import type { DatabaseSync } from 'node:sqlite';
import { recs, type RouteResult } from '../jd-bills/read.ts';
import { listEvents, type SourceEvent } from '../src/storage/source-events.ts';

type Feed = {
  feedId: string;
  sourceSystem: string;
  serviceProviderId: string;
  generation: number;
  baseline: { recordType: string; sourceRecordId: string; sourceVersion: string | null; relatedWorkOrderIds: string[] }[];
  createdAt: string;
};

type Ctx = { woProvider: Map<string, string>; poProvider: Map<string, string> };

const BASELINE_KINDS: Record<string, { kind: string; recordType: string; woOf: (p: any) => string[]; providerOf: (p: any, ctx: Ctx) => string | null }[]> = {
  'provider-receivable': [{ kind: 'provider_receivable', recordType: 'PROVIDER_RECEIVABLE', woOf: (p) => p.relatedWorkOrderIds ?? [], providerOf: (p) => p.serviceProviderId ?? null }],
  'installation-admin': [
    { kind: 'work_order', recordType: 'INSTALLATION_WORK_ORDER', woOf: (p) => [p.installationWorkOrderId], providerOf: (p) => p.serviceProviderId ?? null },
    { kind: 'installation_plan', recordType: 'INSTALLATION_PLAN', woOf: (p) => [p.installationWorkOrderId], providerOf: (p, ctx) => ctx.woProvider.get(p.installationWorkOrderId) ?? null },
    { kind: 'installation_detail', recordType: 'INSTALLATION_DETAIL', woOf: (p) => [p.installationWorkOrderId], providerOf: (p, ctx) => ctx.woProvider.get(p.installationWorkOrderId) ?? null },
    { kind: 'material_index', recordType: 'SOURCE_MATERIAL', woOf: (p) => [p.installationWorkOrderId], providerOf: (p, ctx) => ctx.woProvider.get(p.installationWorkOrderId) ?? null },
  ],
  'provider-docs': [
    { kind: 'provider_record', recordType: 'PROVIDER_RECORD', woOf: (p) => (p.installationWorkOrderId ? [p.installationWorkOrderId] : []), providerOf: (p) => p.serviceProviderId ?? null },
    { kind: 'format_spec', recordType: 'PROVIDER_FORMAT', woOf: () => [], providerOf: (p) => p.serviceProviderId ?? null },
  ],
  'jd-billing': [{ kind: 'jd_bill', recordType: 'JD_BILL', woOf: (p) => p.relatedWorkOrderIds ?? [], providerOf: (p) => p.serviceProviderId ?? null }],
  'billing-terms': [
    { kind: 'billing_terms', recordType: 'BILLING_TERM', woOf: () => [], providerOf: (p) => p.serviceProviderId ?? null },
    { kind: 'fee_approval', recordType: 'FEE_APPROVAL_RECORD', woOf: (p) => p.approvedWorkOrderIds ?? [], providerOf: (p) => p.serviceProviderId ?? null },
  ],
  'order-entitlement': [
    { kind: 'purchase_order', recordType: 'PURCHASE_ORDER', woOf: (p) => [p.installationWorkOrderId], providerOf: (p) => p.serviceProviderId ?? null },
    { kind: 'installation_entitlement', recordType: 'INSTALLATION_ENTITLEMENT', woOf: (p) => [p.installationWorkOrderId], providerOf: (p, ctx) => ctx.poProvider.get(p.purchaseOrderId) ?? null },
  ],
};

function buildCtx(sourceDb: DatabaseSync): Ctx {
  const woProvider = new Map<string, string>();
  const poProvider = new Map<string, string>();
  try {
    for (const r of recs(sourceDb, 'work_order')) woProvider.set(r.id, r.payload.serviceProviderId);
  } catch { /* 来源无工单表 */ }
  try {
    for (const r of recs(sourceDb, 'purchase_order')) poProvider.set(r.id, r.payload.serviceProviderId);
  } catch { /* 来源无订单表 */ }
  return { woProvider, poProvider };
}

export function registerFeed(identityDb: DatabaseSync, sourceDb: DatabaseSync, feedId: string, sourceSystem: string, serviceProviderId: string): RouteResult {
  if (!feedId || !sourceSystem || !serviceProviderId) {
    return { http: 400, body: { code: 40001, msg: 'feedId/sourceSystem/serviceProviderId 必填', data: null } };
  }
  const existing = recs(identityDb, 'change_feed').find((f) => f.payload.feedId === feedId);
  if (existing) return { http: 409, body: { code: 40901, msg: 'feedId 已登记', data: null } };
  const specs = BASELINE_KINDS[sourceSystem];
  if (!specs) return { http: 400, body: { code: 40001, msg: `来源未配置变化发现：${sourceSystem}`, data: null } };

  const baseline: Feed['baseline'] = [];
  const ctx = buildCtx(sourceDb);
  for (const s of specs) {
    for (const r of recs(sourceDb, s.kind)) {
      if (s.providerOf(r.payload, ctx) !== serviceProviderId) continue;
      baseline.push({ recordType: s.recordType, sourceRecordId: r.id, sourceVersion: r.version, relatedWorkOrderIds: s.woOf(r.payload) });
    }
  }
  const feed: Feed = { feedId, sourceSystem, serviceProviderId, generation: 1, baseline, createdAt: new Date().toISOString() };
  identityDb
    .prepare('INSERT INTO source_record (kind, record_id, source_version, source_updated_at, payload_json) VALUES (?, ?, ?, ?, ?)')
    .run('change_feed', feedId, 'feed-1', feed.createdAt, JSON.stringify(feed));
  return {
    http: 201,
    body: {
      code: 0,
      msg: 'success',
      data: { feedId, sourceSystem, serviceProviderId, generation: 1, startCursor: `cur-1-0`, baselineCount: baseline.length, note: '初始记录清单已保存为待读取项，不从“现在”静默开始' },
    },
  };
}

type Change = {
  changeId: string;
  recordType: string;
  sourceRecordId: string;
  sourceVersion: string | null;
  changeType: string;
  sourceUpdatedAt: string | null;
  relatedWorkOrderIds: string[];
  associationComplete: boolean;
};

function feedItems(feed: Feed, sourceDb: DatabaseSync): Change[] {
  const baseline: Change[] = feed.baseline.map((b, i) => ({
    changeId: `chg-base-${feed.feedId}-${i}`,
    recordType: b.recordType,
    sourceRecordId: b.sourceRecordId,
    sourceVersion: b.sourceVersion,
    changeType: 'UPSERT',
    sourceUpdatedAt: null,
    relatedWorkOrderIds: b.relatedWorkOrderIds,
    associationComplete: true,
  }));
  const events: Change[] = listEvents(sourceDb, feed.serviceProviderId, 0).map((e: SourceEvent) => ({
    changeId: e.changeId,
    recordType: e.recordType,
    sourceRecordId: e.sourceRecordId,
    sourceVersion: e.sourceVersion,
    changeType: e.changeType,
    sourceUpdatedAt: e.sourceUpdatedAt,
    relatedWorkOrderIds: e.relatedWorkOrderIds,
    associationComplete: e.associationComplete,
  }));
  return [...baseline, ...events];
}

export function getFeedChanges(identityDb: DatabaseSync, sourceDb: DatabaseSync, feedId: string, cursor: string | undefined, pageSizeRaw: string | null): RouteResult {
  const feedRow = recs(identityDb, 'change_feed').find((f) => f.payload.feedId === feedId);
  if (!feedRow) return { http: 404, body: { code: 40401, msg: '已授权范围内配置不存在', data: null } };
  const feed = feedRow.payload as Feed;
  if (!cursor) return { http: 400, body: { code: 40001, msg: 'cursor 必填', data: null } };
  const m = /^cur-(\d+)-(\d+)$/.exec(cursor);
  if (!m) return { http: 409, body: { code: 40901, msg: 'cursor 与 feed 或当前配置代次不符', data: null } };
  if (Number(m[1]) !== feed.generation) {
    return { http: 409, body: { code: 40901, msg: 'cursor 与 feed 或当前配置代次不符', data: null } };
  }
  const position = Number(m[2]);
  let pageSize = 10;
  if (pageSizeRaw !== null) {
    pageSize = Number(pageSizeRaw);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
      return { http: 400, body: { code: 40001, msg: 'pageSize 越界（1-50）', data: null } };
    }
  }
  const items = feedItems(feed, sourceDb);
  if (position > items.length) {
    return { http: 409, body: { code: 40902, msg: '变化读取位置已失效，需补查并确认覆盖范围后继续', data: null } };
  }
  const batch = items.slice(position, position + pageSize);
  const nextPosition = position + batch.length;
  const hasMore = nextPosition < items.length;
  const nextCursor = batch.length === 0 ? cursor : `cur-${feed.generation}-${nextPosition}`;
  return {
    http: 200,
    body: {
      code: 0,
      msg: 'success',
      data: {
        feedId,
        sourceSystem: feed.sourceSystem,
        serviceProviderId: feed.serviceProviderId,
        discoveryMode: 'SOURCE_FEED',
        retrievedAt: new Date().toISOString(),
        sourceCheckedAt: new Date().toISOString(),
        coverageThrough: null,
        cursor,
        nextCursor,
        hasMore,
        list: batch,
      },
    },
  };
}
