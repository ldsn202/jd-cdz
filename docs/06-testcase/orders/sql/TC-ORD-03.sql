-- TC-ORD-03.sql 工单详情聚合读取（四区数据、VISIBLE 事项范围、配置事项不出现）
-- 上游：workbench-apis.md §6.2—6.3；02-subprd-orders-history.md §7 验收#3 与补充验收第 2、4 行
-- 前置：已执行 TC-ORD-SEED.sql

-- ============ 数据准备 ============
-- 复用 TC-ORD-SEED.sql：wo-ord-01 + ctx-ord-01（购买订单/方案/两条材料索引，MAT-ORD-009 未导入）、
-- wi-ord-prep（COMPLETED）/ wi-ord-rev（READY）/ wi-ord-recon（PROCESSING）/ wi-ord-cfg（配置事项，不属于工单）。
-- 本用例不新增数据。

-- ============ 数据清理 ============
-- 无新增数据；SEED 受历史保护触发器约束，彻底还原重建隔离测试库。
