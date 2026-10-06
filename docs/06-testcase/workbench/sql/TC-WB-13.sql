-- TC-WB-13.sql 汇总区直透展示（对应 TC-WB-13；数据场景同 TC-WB-08 授权范围部分，id 前缀 wi-wb13-）
-- 前置：已执行 TC-WB-SEED.sql

-- ============================================================
-- 数据准备
-- 张三服务商甲 12 条：READY×8（核查×6、对账×1、协同×1）、WAITING_SUPPLEMENT×3、COMPLETED×1
-- 预期：总数 12（第 1 页仅 10 行）；byStatus 待处理 8 / 待补充 3 / 已完成 1；
-- byKind INSTALLATION_REVIEW 10 / RECONCILIATION 1 / COORDINATION 1
-- ============================================================
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb13-001', 'provider-dev-a', 'wo-test-001', 'INSTALLATION_REVIEW', 'bk-wb13-001', '["provider-dev-a","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-001","PROBLEM","MOCK_SOURCE","p-121","REVIEW"]', 'ck-wb13-001', '春和庭安装资料核查一', 'READY', 'user-wb-reviewer', 1789862400000, 1789862512000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb13-001');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb13-002', 'provider-dev-a', 'wo-test-002', 'RECONCILIATION', 'bk-wb13-002', '["provider-dev-a","RECONCILIATION","WORK_ORDER","MOCK_SOURCE","wo-test-002","PROBLEM","MOCK_SOURCE","p-122","RECONCILE"]', 'ck-wb13-002', '尚澜府业务对账', 'READY', 'user-wb-reviewer', 1789862400000, 1789862511000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb13-002');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb13-003', 'provider-dev-a', 'wo-test-001', 'COORDINATION', 'bk-wb13-003', '["provider-dev-a","COORDINATION","WORK_ORDER","MOCK_SOURCE","wo-test-001","PROBLEM","MOCK_SOURCE","p-123","COORDINATE"]', 'ck-wb13-003', '春和庭履约协同', 'READY', 'user-wb-reviewer', 1789862400000, 1789862510000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb13-003');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb13-004', 'provider-dev-a', 'wo-test-001', 'INSTALLATION_REVIEW', 'bk-wb13-004', '["provider-dev-a","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-001","PROBLEM","MOCK_SOURCE","p-124","REVIEW"]', 'ck-wb13-004', '春和庭安装资料核查二', 'READY', 'user-wb-reviewer', 1789862400000, 1789862509000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb13-004');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb13-005', 'provider-dev-a', 'wo-test-002', 'INSTALLATION_REVIEW', 'bk-wb13-005', '["provider-dev-a","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-002","PROBLEM","MOCK_SOURCE","p-125","REVIEW"]', 'ck-wb13-005', '尚澜府安装资料核查一', 'READY', 'user-wb-reviewer', 1789862400000, 1789862508000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb13-005');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb13-006', 'provider-dev-a', 'wo-test-001', 'INSTALLATION_REVIEW', 'bk-wb13-006', '["provider-dev-a","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-001","PROBLEM","MOCK_SOURCE","p-126","REVIEW"]', 'ck-wb13-006', '春和庭安装资料核查三', 'READY', 'user-wb-reviewer', 1789862400000, 1789862507000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb13-006');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb13-007', 'provider-dev-a', 'wo-test-002', 'INSTALLATION_REVIEW', 'bk-wb13-007', '["provider-dev-a","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-002","PROBLEM","MOCK_SOURCE","p-127","REVIEW"]', 'ck-wb13-007', '尚澜府安装资料核查二', 'READY', 'user-wb-reviewer', 1789862400000, 1789862506000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb13-007');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb13-008', 'provider-dev-a', 'wo-test-001', 'INSTALLATION_REVIEW', 'bk-wb13-008', '["provider-dev-a","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-001","PROBLEM","MOCK_SOURCE","p-128","REVIEW"]', 'ck-wb13-008', '春和庭安装资料核查四', 'READY', 'user-wb-reviewer', 1789862400000, 1789862505000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb13-008');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, active_supplement_request_id, gmt_create, gmt_modified)
SELECT 'wi-wb13-009', 'provider-dev-a', 'wo-test-001', 'INSTALLATION_REVIEW', 'bk-wb13-009', '["provider-dev-a","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-001","PROBLEM","MOCK_SOURCE","p-129","REVIEW"]', 'ck-wb13-009', '春和庭安装资料核查（待补充一）', 'WAITING_SUPPLEMENT', 'user-wb-reviewer', 'hd-wb13-009', 1789862400000, 1789862504000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb13-009');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, active_supplement_request_id, gmt_create, gmt_modified)
SELECT 'wi-wb13-010', 'provider-dev-a', 'wo-test-002', 'INSTALLATION_REVIEW', 'bk-wb13-010', '["provider-dev-a","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-002","PROBLEM","MOCK_SOURCE","p-130","REVIEW"]', 'ck-wb13-010', '尚澜府安装资料核查（待补充）', 'WAITING_SUPPLEMENT', 'user-wb-reviewer', 'hd-wb13-010', 1789862400000, 1789862503000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb13-010');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, active_supplement_request_id, gmt_create, gmt_modified)
SELECT 'wi-wb13-011', 'provider-dev-a', 'wo-test-001', 'INSTALLATION_REVIEW', 'bk-wb13-011', '["provider-dev-a","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-001","PROBLEM","MOCK_SOURCE","p-131","REVIEW"]', 'ck-wb13-011', '春和庭安装资料核查（待补充二）', 'WAITING_SUPPLEMENT', 'user-wb-reviewer', 'hd-wb13-011', 1789862400000, 1789862502000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb13-011');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, completion_code, completed_at, completion_basis_json, gmt_create, gmt_modified)
SELECT 'wi-wb13-012', 'provider-dev-a', 'wo-test-002', 'INSTALLATION_REVIEW', 'bk-wb13-012', '["provider-dev-a","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-002","PROBLEM","MOCK_SOURCE","p-132","REVIEW"]', 'ck-wb13-012', '尚澜府安装资料核查（已完成）', 'COMPLETED', 'user-wb-reviewer', 'REVIEW_APPROVED', 1789862501000, '{"resultType":"REVIEW","refs":[]}', 1789862400000, 1789862501000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb13-012');

-- WAITING_SUPPLEMENT 的当前待回应退回决定（schema §3：active_supplement_request_id 指向 REQUEST_SUPPLEMENT 决定）
INSERT INTO human_decision (id, work_item_id, service_provider_id, origin, action_type, content_json, source_system, source_record_type, source_record_id, gmt_create, gmt_modified)
SELECT 'hd-wb13-009', 'wi-wb13-009', 'provider-dev-a', 'SOURCE', 'REQUEST_SUPPLEMENT', '{"questions":["请补充现场照片"]}', 'MOCK_SOURCE', 'REVIEW_DECISION', 'RD-WB13-009', 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM human_decision WHERE id = 'hd-wb13-009');
INSERT INTO human_decision (id, work_item_id, service_provider_id, origin, action_type, content_json, source_system, source_record_type, source_record_id, gmt_create, gmt_modified)
SELECT 'hd-wb13-010', 'wi-wb13-010', 'provider-dev-a', 'SOURCE', 'REQUEST_SUPPLEMENT', '{"questions":["请补充领料单"]}', 'MOCK_SOURCE', 'REVIEW_DECISION', 'RD-WB13-010', 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM human_decision WHERE id = 'hd-wb13-010');
INSERT INTO human_decision (id, work_item_id, service_provider_id, origin, action_type, content_json, source_system, source_record_type, source_record_id, gmt_create, gmt_modified)
SELECT 'hd-wb13-011', 'wi-wb13-011', 'provider-dev-a', 'SOURCE', 'REQUEST_SUPPLEMENT', '{"questions":["请补充安装数量说明"]}', 'MOCK_SOURCE', 'REVIEW_DECISION', 'RD-WB13-011', 1789862400000, 1789862400000
WHERE NOT EXISTS (SELECT 1 FROM human_decision WHERE id = 'hd-wb13-011');

-- ============================================================
-- 数据清理
-- work_item 受 no_delete 触发器保护，不支持逐行 DELETE；本用例数据随测试库整体重建还原，
-- 见 tc-workbench.md「二、前置条件」第 4 条。
-- ============================================================
