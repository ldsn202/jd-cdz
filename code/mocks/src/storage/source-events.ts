import type { DatabaseSync } from 'node:sqlite';

export type SourceEventInput = {
  changeId: string;
  providerId: string;
  recordType: string;
  sourceRecordId: string;
  sourceVersion: string | null;
  changeType: 'UPSERT' | 'REMOVED';
  sourceUpdatedAt: string | null;
  relatedWorkOrderIds: string[];
  associationComplete: boolean;
};

export type SourceEvent = SourceEventInput & { eventSeq: number; createdAt: string };

export function emitEvent(db: DatabaseSync, input: SourceEventInput): void {
  db.prepare(
    `INSERT INTO source_event (change_id, provider_id, record_type, source_record_id, source_version, change_type, source_updated_at, related_work_order_ids, association_complete, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.changeId,
    input.providerId,
    input.recordType,
    input.sourceRecordId,
    input.sourceVersion,
    input.changeType,
    input.sourceUpdatedAt,
    JSON.stringify(input.relatedWorkOrderIds),
    input.associationComplete ? 1 : 0,
    new Date().toISOString()
  );
}

export function listEvents(db: DatabaseSync, providerId: string, afterSeq: number): SourceEvent[] {
  const rows = db
    .prepare('SELECT * FROM source_event WHERE provider_id = ? AND event_seq > ? ORDER BY event_seq')
    .all(providerId, afterSeq) as any[];
  return rows.map((r) => ({
    eventSeq: r.event_seq,
    changeId: r.change_id,
    providerId: r.provider_id,
    recordType: r.record_type,
    sourceRecordId: r.source_record_id,
    sourceVersion: r.source_version,
    changeType: r.change_type,
    sourceUpdatedAt: r.source_updated_at,
    relatedWorkOrderIds: JSON.parse(r.related_work_order_ids),
    associationComplete: r.association_complete === 1,
    createdAt: r.created_at,
  }));
}

export function maxEventSeq(db: DatabaseSync, providerId: string): number {
  const row = db.prepare('SELECT COALESCE(MAX(event_seq), 0) AS m FROM source_event WHERE provider_id = ?').get(providerId) as { m: number };
  return row.m;
}
