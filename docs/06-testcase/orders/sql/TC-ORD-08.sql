-- TC-ORD-08.sql 材料 REFERENCED 读取（元数据未知字段为 null、/content 返回 42201）
-- 上游：material-apis.md §1；evidence-schema.md §2；02-subprd-orders-history.md §7 验收#6
-- 前置：已执行 TC-ORD-SEED.sql

-- ============ 数据准备 ============
-- 复用 TC-ORD-SEED.sql：smv-ord-002（read_state='REFERENCED'，全部内容字段为 NULL，无解析）。
-- 本用例不新增数据。

-- ============ 数据清理 ============
-- 无新增数据；SEED 受历史保护触发器约束，彻底还原重建隔离测试库。
