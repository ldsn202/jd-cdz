-- TC-ORD-07.sql 外部操作结果块（status 与 localContinuationStatus 分开返回）
-- 上游：workbench-apis.md §4；execution-schema.md §2（external_write_operation）；02-subprd-orders-history.md §7 验收#12
-- 前置：已执行 TC-ORD-SEED.sql

-- ============ 数据准备 ============
-- 复用 TC-ORD-SEED.sql：op-ord-01（status='SUCCEEDED'、receipt_json 非空、verified_at 非空）及其原确认 hd-ord-01。
-- 本用例不新增数据。

-- ============ 数据清理 ============
-- 无新增数据；SEED 受历史保护触发器约束，彻底还原重建隔离测试库。
