-- TC-REV-09.sql 证据原文版本校验（API）— PRD：05-subprd-installation-review.md §7 验收#13
-- 前置：已执行 TC-REV-SEED.sql（本用例不新增数据，直接使用 SEED 中两个材料版本）

-- ============ 数据准备 ============
-- 无新增数据。依赖 SEED 已有：
--   smv-photo-v1   read_state=REFERENCED（未取得正文，content 字段全 NULL）
--   smv-yanshou-v1 read_state=VERIFIED（media_type=application/pdf，byte_length=102400，
--                  content_sha256=2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae）
-- 环境要求：测试文件存储中须存有与 smv-yanshou-v1 摘要一致的真实字节（content_locator=testfs://charging/yanshou-ys-v1.pdf）

-- ============ 数据清理 ============
-- 无（本用例不修改数据）
