-- TC-ORD-18.sql UI：解析原文定位（evidenceRefs blockId → 内容块与原位置）
-- 前置：已执行 TC-ORD-SEED.sql

-- ============ 数据准备 ============
-- 复用 TC-ORD-SEED.sql：ar-ord-seed.findings_json 的 evidenceRefs（inputId=mp-ord-001-v1、blockId=blk-ord-1、
-- quote 与块 text 一致），定位链为 evidenceRefs → mp-ord-001-v1 的 blk-ord-1 → unit-1（PDF_PAGE 第 1 页）。
-- 本用例不新增数据。

-- ============ 数据清理 ============
-- 无新增数据；SEED 受历史保护触发器约束，彻底还原重建隔离测试库。
