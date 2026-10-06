-- T0.1 来源核心存储：每个来源系统各自的 SQLite 库均应用本迁移。
-- 唯一约束：来源版本（source_version_log.source_version）与操作编号（smoke_record.operation_id）。

CREATE TABLE IF NOT EXISTS smoke_record (
  record_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  source_version TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  created_ms INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_smoke_record_operation
  ON smoke_record(operation_id);

CREATE TABLE IF NOT EXISTS source_version_log (
  source_version TEXT PRIMARY KEY,
  first_operation_id TEXT NOT NULL,
  first_seen_ms INTEGER NOT NULL
);
