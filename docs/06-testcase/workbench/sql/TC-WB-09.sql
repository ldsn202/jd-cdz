-- TC-WB-09.sql 字段缺失项返回 null（对应 TC-WB-09）
-- 前置：已执行 TC-WB-SEED.sql

-- ============================================================
-- 数据准备
-- wi-wb09-001 接入配置事项：installation_work_order_id 必须为 NULL（schema §3）、assignee NULL（待分配）
-- wi-wb09-002 安装核查事项：assignee NULL（待分配）
-- ============================================================
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb09-001', 'provider-dev-a', NULL, 'CONFIGURATION', 'bk-wb09-001',
 '["provider-dev-a","CONFIGURATION","PROVIDER","MOCK_SOURCE","provider-dev-a","PROBLEM","MOCK_SOURCE","p-081","CONFIGURE"]',
 'ck-wb09-001', '服务商甲接入配置确认', 'READY', NULL, 1789862400000, 1789862402000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb09-001');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb09-002', 'provider-dev-a', 'wo-test-001', 'INSTALLATION_REVIEW', 'bk-wb09-002',
 '["provider-dev-a","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-001","PROBLEM","MOCK_SOURCE","p-082","REVIEW"]',
 'ck-wb09-002', '春和庭安装资料核查（待分配）', 'READY', NULL, 1789862400000, 1789862401000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb09-002');

-- ============================================================
-- 数据清理
-- work_item 受 no_delete 触发器保护，不支持逐行 DELETE；本用例数据随测试库整体重建还原，
-- 见 tc-workbench.md「二、前置条件」第 4 条。
-- ============================================================
