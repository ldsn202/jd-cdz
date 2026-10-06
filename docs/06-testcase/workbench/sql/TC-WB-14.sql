-- TC-WB-14.sql 组合筛选同时重查与页码重置（对应 TC-WB-14；数据场景同 TC-WB-04，id 前缀 wi-wb14-）
-- 前置：已执行 TC-WB-SEED.sql

-- ============================================================
-- 数据准备
-- ============================================================
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb14-001', 'provider-dev-a', 'wo-test-002', 'RECONCILIATION', 'bk-wb14-001', '["provider-dev-a","RECONCILIATION","WORK_ORDER","MOCK_SOURCE","wo-test-002","PROBLEM","MOCK_SOURCE","p-141","RECONCILE"]', 'ck-wb14-001', '尚澜府业务对账一', 'READY', 'user-wb-reviewer', 1789862400000, 1789862405000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb14-001');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb14-002', 'provider-dev-a', 'wo-test-002', 'RECONCILIATION', 'bk-wb14-002', '["provider-dev-a","RECONCILIATION","WORK_ORDER","MOCK_SOURCE","wo-test-002","PROBLEM","MOCK_SOURCE","p-142","RECONCILE"]', 'ck-wb14-002', '尚澜府业务对账二', 'READY', 'user-wb-reviewer', 1789862400000, 1789862404000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb14-002');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb14-003', 'provider-dev-a', 'wo-test-001', 'RECONCILIATION', 'bk-wb14-003', '["provider-dev-a","RECONCILIATION","WORK_ORDER","MOCK_SOURCE","wo-test-001","PROBLEM","MOCK_SOURCE","p-143","RECONCILE"]', 'ck-wb14-003', '春和庭业务对账', 'READY', 'user-wb-reviewer', 1789862400000, 1789862403000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb14-003');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb14-004', 'provider-dev-a', 'wo-test-002', 'RECONCILIATION', 'bk-wb14-004', '["provider-dev-a","RECONCILIATION","WORK_ORDER","MOCK_SOURCE","wo-test-002","PROBLEM","MOCK_SOURCE","p-144","RECONCILE"]', 'ck-wb14-004', '尚澜府业务对账（处理中）', 'PROCESSING', 'user-wb-reviewer', 1789862400000, 1789862402000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb14-004');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb14-005', 'provider-dev-a', 'wo-test-001', 'INSTALLATION_REVIEW', 'bk-wb14-005', '["provider-dev-a","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-001","PROBLEM","MOCK_SOURCE","p-145","REVIEW"]', 'ck-wb14-005', '春和庭安装资料核查', 'READY', 'user-wb-reviewer', 1789862400000, 1789862401000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb14-005');

-- ============================================================
-- 数据清理
-- work_item 受 no_delete 触发器保护，不支持逐行 DELETE；本用例数据随测试库整体重建还原，
-- 见 tc-workbench.md「二、前置条件」第 4 条。
-- ============================================================
