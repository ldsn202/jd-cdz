-- T2.6 来源变化事件日志：每个来源库记录本来源的变化事件，与业务写入同事务提交。

CREATE TABLE IF NOT EXISTS source_event (
  event_seq INTEGER PRIMARY KEY AUTOINCREMENT,
  change_id TEXT NOT NULL UNIQUE,
  provider_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  source_version TEXT,
  change_type TEXT NOT NULL,
  source_updated_at TEXT,
  related_work_order_ids TEXT NOT NULL DEFAULT '[]',
  association_complete INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_source_event_seq ON source_event(event_seq);
