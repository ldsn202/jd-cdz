-- TC-WB-02.sql 默认责任范围 MINE 与 VISIBLE（对应 TC-WB-02）
-- 前置：已执行 TC-WB-SEED.sql

-- ============================================================
-- 数据准备
-- wi-wb02-001/002 责任人为张三；wi-wb02-003 责任人为赵六（同服务商甲，可见范围内）
-- ============================================================
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb02-001', 'provider-dev-a', 'wo-test-001', 'INSTALLATION_REVIEW', 'bk-wb02-001',
 '["provider-dev-a","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-001","PROBLEM","MOCK_SOURCE","p-011","REVIEW"]',
 'ck-wb02-001', '春和庭安装资料核查甲', 'READY', 'user-wb-reviewer', 1789862400000, 1789862403000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb02-001');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb02-002', 'provider-dev-a', 'wo-test-001', 'COORDINATION', 'bk-wb02-002',
 '["provider-dev-a","COORDINATION","WORK_ORDER","MOCK_SOURCE","wo-test-001","PROBLEM","MOCK_SOURCE","p-012","COORDINATE"]',
 'ck-wb02-002', '春和庭履约协同', 'READY', 'user-wb-reviewer', 1789862400000, 1789862402000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb02-002');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb02-003', 'provider-dev-a', 'wo-test-001', 'INSTALLATION_REVIEW', 'bk-wb02-003',
 '["provider-dev-a","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-001","PROBLEM","MOCK_SOURCE","p-013","REVIEW"]',
 'ck-wb02-003', '春和庭安装资料核查乙', 'READY', 'user-wb-other', 1789862400000, 1789862401000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb02-003');

-- ============================================================
-- 数据清理
-- work_item 受 no_delete 触发器保护，不支持逐行 DELETE；本用例数据随测试库整体重建还原，
-- 见 tc-workbench.md「二、前置条件」第 4 条。
-- ============================================================
