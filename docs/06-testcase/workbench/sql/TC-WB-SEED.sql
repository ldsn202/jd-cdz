-- TC-WB-SEED.sql 工作台域共用种子数据（SQLite / D1）
-- 表与字段逐字取自 work-item-schema.md §2、identity-schema.md §2
-- 说明：identity_reference / service_provider / installation_work_order 受 no_replace、no_delete
-- 触发器保护，禁止 INSERT OR REPLACE 与 DELETE；本脚本用 WHERE NOT EXISTS 保证可重复执行。
-- 时间基准：1789862400000 = 2026-09-20T00:00:00Z（UTC 毫秒）

-- ============================================================
-- 数据准备
-- ============================================================

-- 身份引用：张三（核查，主测试身份）、李四（对账）、赵六（另一责任人）、王五（无业务权限）
INSERT INTO identity_reference (id, identity_source, subject_id, subject_type, display_name, gmt_create, gmt_modified)
SELECT 'user-wb-reviewer', 'DEV_IDENTITY_SIM', 'dev-reviewer-001', 'HUMAN', '张三', 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM identity_reference WHERE id = 'user-wb-reviewer');
INSERT INTO identity_reference (id, identity_source, subject_id, subject_type, display_name, gmt_create, gmt_modified)
SELECT 'user-wb-reconciler', 'DEV_IDENTITY_SIM', 'dev-reconciler-001', 'HUMAN', '李四', 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM identity_reference WHERE id = 'user-wb-reconciler');
INSERT INTO identity_reference (id, identity_source, subject_id, subject_type, display_name, gmt_create, gmt_modified)
SELECT 'user-wb-other', 'DEV_IDENTITY_SIM', 'dev-other-001', 'HUMAN', '赵六', 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM identity_reference WHERE id = 'user-wb-other');
INSERT INTO identity_reference (id, identity_source, subject_id, subject_type, display_name, gmt_create, gmt_modified)
SELECT 'user-wb-noperm', 'DEV_IDENTITY_SIM', 'dev-noperm-001', 'HUMAN', '王五', 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM identity_reference WHERE id = 'user-wb-noperm');

-- 服务商引用：服务商甲（张三授权范围内）、服务商乙（范围外，用于越权验证）
INSERT INTO service_provider (id, source_system, source_id, display_name, source_state, verified_at, gmt_create, gmt_modified)
SELECT 'provider-dev-a', 'MOCK_SOURCE', 'SP-A', '服务商甲', 'ACTIVE', 1789862400000, 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM service_provider WHERE id = 'provider-dev-a');
INSERT INTO service_provider (id, source_system, source_id, display_name, source_state, verified_at, gmt_create, gmt_modified)
SELECT 'provider-dev-b', 'MOCK_SOURCE', 'SP-B', '服务商乙', 'ACTIVE', 1789862400000, 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM service_provider WHERE id = 'provider-dev-b');

-- 安装工单引用：WO-SD-20260901 / 02 属服务商甲，WO-SD-20260903 属服务商乙
INSERT INTO installation_work_order (id, source_system, source_id, current_service_provider_id, source_state, gmt_create, gmt_modified)
SELECT 'wo-test-001', 'MOCK_SOURCE', 'WO-SD-20260901', 'provider-dev-a', 'ACTIVE', 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM installation_work_order WHERE id = 'wo-test-001');
INSERT INTO installation_work_order (id, source_system, source_id, current_service_provider_id, source_state, gmt_create, gmt_modified)
SELECT 'wo-test-002', 'MOCK_SOURCE', 'WO-SD-20260902', 'provider-dev-a', 'ACTIVE', 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM installation_work_order WHERE id = 'wo-test-002');
INSERT INTO installation_work_order (id, source_system, source_id, current_service_provider_id, source_state, gmt_create, gmt_modified)
SELECT 'wo-test-003', 'MOCK_SOURCE', 'WO-SD-20260903', 'provider-dev-b', 'ACTIVE', 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM installation_work_order WHERE id = 'wo-test-003');

-- 说明：当前身份的业务授权由开发身份模拟配置发放（common-contract §1），
-- current_identity / business_permission 为服务端封存事实，不由种子数据写入。

-- ============================================================
-- 数据清理
-- 本域表受 no_delete 触发器保护（work-item-schema.md §1），不支持逐行 DELETE；
-- 种子数据随测试库整体重建还原，见 tc-workbench.md「二、前置条件」第 4 条。
-- ============================================================
