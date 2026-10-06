-- TC-WB-03.sql summary 计数与列表一致性（对应 TC-WB-03）
-- 前置：已执行 TC-WB-SEED.sql

-- ============================================================
-- 数据准备
-- 张三 8 条：READY×5（安装核查×3、对账×1、协同×1）、WAITING_SUPPLEMENT×2（安装核查）、
-- COMPLETED×1（安装核查，按 schema §3.3 补全完成字段）
-- 预期 byKind：INSTALLATION_REVIEW 6 / RECONCILIATION 1 / COORDINATION 1
-- ============================================================
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb03-001', 'provider-dev-a', 'wo-test-001', 'INSTALLATION_REVIEW', 'bk-wb03-001',
 '["provider-dev-a","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-001","PROBLEM","MOCK_SOURCE","p-021","REVIEW"]',
 'ck-wb03-001', '春和庭安装资料核查一', 'READY', 'user-wb-reviewer', 1789862400000, 1789862408000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb03-001');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb03-002', 'provider-dev-a', 'wo-test-001', 'INSTALLATION_REVIEW', 'bk-wb03-002',
 '["provider-dev-a","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-001","PROBLEM","MOCK_SOURCE","p-022","REVIEW"]',
 'ck-wb03-002', '春和庭安装资料核查二', 'READY', 'user-wb-reviewer', 1789862400000, 1789862407000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb03-002');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb03-003', 'provider-dev-a', 'wo-test-002', 'INSTALLATION_REVIEW', 'bk-wb03-003',
 '["provider-dev-a","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-002","PROBLEM","MOCK_SOURCE","p-023","REVIEW"]',
 'ck-wb03-003', '尚澜府安装资料核查', 'READY', 'user-wb-reviewer', 1789862400000, 1789862406000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb03-003');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb03-004', 'provider-dev-a', 'wo-test-002', 'RECONCILIATION', 'bk-wb03-004',
 '["provider-dev-a","RECONCILIATION","WORK_ORDER","MOCK_SOURCE","wo-test-002","PROBLEM","MOCK_SOURCE","p-024","RECONCILE"]',
 'ck-wb03-004', '尚澜府业务对账', 'READY', 'user-wb-reviewer', 1789862400000, 1789862405000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb03-004');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb03-005', 'provider-dev-a', 'wo-test-001', 'COORDINATION', 'bk-wb03-005',
 '["provider-dev-a","COORDINATION","WORK_ORDER","MOCK_SOURCE","wo-test-001","PROBLEM","MOCK_SOURCE","p-025","COORDINATE"]',
 'ck-wb03-005', '春和庭履约协同', 'READY', 'user-wb-reviewer', 1789862400000, 1789862404000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb03-005');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, active_supplement_request_id, gmt_create, gmt_modified)
SELECT 'wi-wb03-006', 'provider-dev-a', 'wo-test-001', 'INSTALLATION_REVIEW', 'bk-wb03-006',
 '["provider-dev-a","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-001","PROBLEM","MOCK_SOURCE","p-026","REVIEW"]',
 'ck-wb03-006', '春和庭安装资料核查三', 'WAITING_SUPPLEMENT', 'user-wb-reviewer', 'hd-wb03-006', 1789862400000, 1789862403000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb03-006');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, active_supplement_request_id, gmt_create, gmt_modified)
SELECT 'wi-wb03-007', 'provider-dev-a', 'wo-test-002', 'INSTALLATION_REVIEW', 'bk-wb03-007',
 '["provider-dev-a","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-002","PROBLEM","MOCK_SOURCE","p-027","REVIEW"]',
 'ck-wb03-007', '尚澜府安装资料核查（待补充）', 'WAITING_SUPPLEMENT', 'user-wb-reviewer', 'hd-wb03-007', 1789862400000, 1789862402000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb03-007');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, completion_code, completed_at, completion_basis_json, gmt_create, gmt_modified)
SELECT 'wi-wb03-008', 'provider-dev-a', 'wo-test-001', 'INSTALLATION_REVIEW', 'bk-wb03-008',
 '["provider-dev-a","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-001","PROBLEM","MOCK_SOURCE","p-028","REVIEW"]',
 'ck-wb03-008', '春和庭安装资料核查（已完成）', 'COMPLETED', 'user-wb-reviewer',
 'REVIEW_APPROVED', 1789862401000, '{"resultType":"REVIEW","refs":[]}', 1789862400000, 1789862401000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb03-008');

-- WAITING_SUPPLEMENT 的当前待回应退回决定（schema §3：active_supplement_request_id 指向 REQUEST_SUPPLEMENT 决定）
INSERT INTO human_decision (id, work_item_id, service_provider_id, origin, action_type, content_json, source_system, source_record_type, source_record_id, gmt_create, gmt_modified)
SELECT 'hd-wb03-006', 'wi-wb03-006', 'provider-dev-a', 'SOURCE', 'REQUEST_SUPPLEMENT', '{"questions":["请补充春和庭现场照片"]}', 'MOCK_SOURCE', 'REVIEW_DECISION', 'RD-WB03-006', 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM human_decision WHERE id = 'hd-wb03-006');
INSERT INTO human_decision (id, work_item_id, service_provider_id, origin, action_type, content_json, source_system, source_record_type, source_record_id, gmt_create, gmt_modified)
SELECT 'hd-wb03-007', 'wi-wb03-007', 'provider-dev-a', 'SOURCE', 'REQUEST_SUPPLEMENT', '{"questions":["请补充尚澜府领料单"]}', 'MOCK_SOURCE', 'REVIEW_DECISION', 'RD-WB03-007', 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM human_decision WHERE id = 'hd-wb03-007');

-- ============================================================
-- 数据清理
-- work_item 受 no_delete 触发器保护，不支持逐行 DELETE；本用例数据随测试库整体重建还原，
-- 见 tc-workbench.md「二、前置条件」第 4 条。
-- ============================================================
