import type { DatabaseSync } from 'node:sqlite';

export type SmokeRecord = {
  recordId: string;
  payload: unknown;
  sourceVersion: string;
  operationId: string;
  createdMs: number;
};

export class DuplicateOperationError extends Error {
  readonly operationId: string;
  constructor(operationId: string) {
    super(`操作编号已存在：${operationId}`);
    this.name = 'DuplicateOperationError';
    this.operationId = operationId;
  }
}

export class SourceStore {
  private readonly db: DatabaseSync;
  readonly systemId: string;

  constructor(db: DatabaseSync, systemId: string) {
    this.db = db;
    this.systemId = systemId;
  }

  putSmokeRecord(input: {
    recordId: string;
    payload: unknown;
    sourceVersion: string;
    operationId: string;
  }): SmokeRecord {
    const createdMs = Date.now();
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(
          'INSERT INTO smoke_record (record_id, payload_json, source_version, operation_id, created_ms) VALUES (?, ?, ?, ?, ?)'
        )
        .run(input.recordId, JSON.stringify(input.payload), input.sourceVersion, input.operationId, createdMs);
      this.db
        .prepare(
          'INSERT OR IGNORE INTO source_version_log (source_version, first_operation_id, first_seen_ms) VALUES (?, ?, ?)'
        )
        .run(input.sourceVersion, input.operationId, createdMs);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      if (e instanceof Error && /UNIQUE constraint failed: smoke_record\.operation_id/.test(e.message)) {
        throw new DuplicateOperationError(input.operationId);
      }
      throw e;
    }
    return {
      recordId: input.recordId,
      payload: input.payload,
      sourceVersion: input.sourceVersion,
      operationId: input.operationId,
      createdMs,
    };
  }

  getSmokeRecord(recordId: string): SmokeRecord | null {
    const row = this.db
      .prepare('SELECT record_id, payload_json, source_version, operation_id, created_ms FROM smoke_record WHERE record_id = ?')
      .get(recordId) as
      | { record_id: string; payload_json: string; source_version: string; operation_id: string; created_ms: number }
      | undefined;
    if (!row) return null;
    return {
      recordId: row.record_id,
      payload: JSON.parse(row.payload_json),
      sourceVersion: row.source_version,
      operationId: row.operation_id,
      createdMs: row.created_ms,
    };
  }
}
