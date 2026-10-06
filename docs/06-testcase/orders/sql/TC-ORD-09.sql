-- TC-ORD-09.sql 材料 VERIFIED 空文件与解析不全的元数据区分
-- 上游：material-apis.md §1；evidence-schema.md §3.2；02-subprd-orders-history.md §7 验收#7、#10
-- 前置：已执行 TC-ORD-SEED.sql

-- ============ 数据准备 ============
-- 复用 TC-ORD-SEED.sql：smv-ord-003 + mp-ord-003（VERIFIED 且 blocks=[] 的真实空白文件）、
-- smv-ord-004 + mp-ord-004（completeness='INCOMPLETE'、issues 非空、含 UNREADABLE 单元）。
-- 本用例不新增数据。

-- ============ 数据清理 ============
-- 无新增数据；SEED 受历史保护触发器约束，彻底还原重建隔离测试库。
