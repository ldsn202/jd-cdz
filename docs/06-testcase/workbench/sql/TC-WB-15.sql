-- TC-WB-15.sql 关键词搜索呈现（对应 TC-WB-15；数据场景同 TC-WB-05 授权范围部分，id 前缀 wi-wb15-）
-- 前置：已执行 TC-WB-SEED.sql

-- ============================================================
-- 数据准备
-- ============================================================
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb15-001', 'provider-dev-a', 'wo-test-001', 'INSTALLATION_REVIEW', 'bk-wb15-001',
 '["provider-dev-a","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-001","PROBLEM","MOCK_SOURCE","p-151","REVIEW"]',
 'ck-wb15-001', '春和庭安装资料核查', 'READY', 'user-wb-reviewer', 1789862400000, 1789862402000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb15-001');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb15-002', 'provider-dev-a', 'wo-test-002', 'INSTALLATION_REVIEW', 'bk-wb15-002',
 '["provider-dev-a","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-002","PROBLEM","MOCK_SOURCE","p-152","REVIEW"]',
 'ck-wb15-002', '尚澜府安装资料核查', 'READY', 'user-wb-reviewer', 1789862400000, 1789862401000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb15-002');

-- ============================================================
-- 数据清理
-- work_item 受 no_delete 触发器保护，不支持逐行 DELETE；本用例数据随测试库整体重建还原，
-- 见 tc-workbench.md「二、前置条件」第 4 条。
-- ============================================================
