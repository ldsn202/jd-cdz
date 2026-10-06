-- TC-WB-18.sql 列表接口 503 真实呈现（对应 TC-WB-18；数据场景同 TC-WB-01，id 前缀 wi-wb18-）
-- 前置：已执行 TC-WB-SEED.sql

-- ============================================================
-- 数据准备
-- ============================================================
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb18-001', 'provider-dev-a', 'wo-test-001', 'INSTALLATION_REVIEW', 'bk-wb18-001',
 '["provider-dev-a","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-001","PROBLEM","MOCK_SOURCE","p-181","REVIEW"]',
 'ck-wb18-001', '春和庭安装资料核查', 'READY', 'user-wb-reviewer', 1789862400000, 1789862403000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb18-001');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb18-002', 'provider-dev-a', 'wo-test-002', 'RECONCILIATION', 'bk-wb18-002',
 '["provider-dev-a","RECONCILIATION","WORK_ORDER","MOCK_SOURCE","wo-test-002","PROBLEM","MOCK_SOURCE","p-182","RECONCILE"]',
 'ck-wb18-002', '尚澜府业务对账', 'READY', 'user-wb-reviewer', 1789862400000, 1789862402000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb18-002');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb18-003', 'provider-dev-a', 'wo-test-001', 'COORDINATION', 'bk-wb18-003',
 '["provider-dev-a","COORDINATION","WORK_ORDER","MOCK_SOURCE","wo-test-001","PROBLEM","MOCK_SOURCE","p-183","COORDINATE"]',
 'ck-wb18-003', '春和庭履约协同', 'READY', 'user-wb-reviewer', 1789862400000, 1789862401000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb18-003');

-- ============================================================
-- 数据清理
-- work_item 受 no_delete 触发器保护，不支持逐行 DELETE；本用例数据随测试库整体重建还原，
-- 见 tc-workbench.md「二、前置条件」第 4 条。
-- ============================================================
