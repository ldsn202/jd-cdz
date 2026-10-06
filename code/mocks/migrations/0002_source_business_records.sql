-- T1.1 来源业务记录：每个来源库保存本来源自己的原字段记录（payload 为该来源原始结构）。
-- kind 区分记录类型（work_order / plan / detail / bill / receivable / account / format_spec 等，由各来源投影定义）。

CREATE TABLE IF NOT EXISTS source_record (
  kind TEXT NOT NULL,
  record_id TEXT NOT NULL,
  source_version TEXT NOT NULL,
  source_updated_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (kind, record_id)
);

CREATE INDEX IF NOT EXISTS idx_source_record_kind ON source_record(kind);
