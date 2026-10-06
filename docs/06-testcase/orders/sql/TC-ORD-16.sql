-- TC-ORD-16.sql UI：证据侧栏"原文未取得"与"文件内容为空"严格区分
-- 前置：已执行 TC-ORD-SEED.sql

-- ============ 数据准备 ============
-- 复用 TC-ORD-SEED.sql：smv-ord-002（REFERENCED）与 smv-ord-003 + mp-ord-003（VERIFIED 且 blocks=[]）。
-- 本用例不新增数据。

-- ============ 数据清理 ============
-- 无新增数据；SEED 受历史保护触发器约束，彻底还原重建隔离测试库。
