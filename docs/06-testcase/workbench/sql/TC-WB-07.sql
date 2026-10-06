-- TC-WB-07.sql providers 可见范围与越权 providerId（对应 TC-WB-07）
-- 前置：已执行 TC-WB-SEED.sql

-- ============================================================
-- 数据准备
-- wi-wb07-001 服务商甲（张三授权范围内）、wi-wb07-002 服务商乙（范围外）
-- ============================================================
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb07-001', 'provider-dev-a', 'wo-test-001', 'INSTALLATION_REVIEW', 'bk-wb07-001',
 '["provider-dev-a","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-001","PROBLEM","MOCK_SOURCE","p-051","REVIEW"]',
 'ck-wb07-001', '春和庭安装资料核查', 'READY', 'user-wb-reviewer', 1789862400000, 1789862402000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb07-001');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb07-002', 'provider-dev-b', 'wo-test-003', 'INSTALLATION_REVIEW', 'bk-wb07-002',
 '["provider-dev-b","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-003","PROBLEM","MOCK_SOURCE","p-052","REVIEW"]',
 'ck-wb07-002', '清河湾安装资料核查', 'READY', 'user-wb-reviewer', 1789862400000, 1789862401000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb07-002');

-- ============================================================
-- 数据清理
-- work_item 受 no_delete 触发器保护，不支持逐行 DELETE；本用例数据随测试库整体重建还原，
-- 见 tc-workbench.md「二、前置条件」第 4 条。
-- ============================================================
