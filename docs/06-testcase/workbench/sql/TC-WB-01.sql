-- TC-WB-01.sql 列表正常返回三种类型事项（对应 tc-workbench-用例详情.md TC-WB-01）
-- 前置：已执行 TC-WB-SEED.sql；时间基准 1789862400000 = 2026-09-20T00:00:00Z

-- ============================================================
-- 数据准备
-- 3 条 READY 事项，责任人张三，服务商甲；gmt_modified 递减以固定排序（001 最新）
-- ============================================================
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb01-001', 'provider-dev-a', 'wo-test-001', 'INSTALLATION_REVIEW', 'bk-wb01-001',
 '["provider-dev-a","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-001","PROBLEM","MOCK_SOURCE","p-001","REVIEW"]',
 'ck-wb01-001', '春和庭安装资料核查', 'READY', 'user-wb-reviewer', 1789862400000, 1789862403000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb01-001');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb01-002', 'provider-dev-a', 'wo-test-002', 'RECONCILIATION', 'bk-wb01-002',
 '["provider-dev-a","RECONCILIATION","WORK_ORDER","MOCK_SOURCE","wo-test-002","PROBLEM","MOCK_SOURCE","p-002","RECONCILE"]',
 'ck-wb01-002', '尚澜府业务对账', 'READY', 'user-wb-reviewer', 1789862400000, 1789862402000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb01-002');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb01-003', 'provider-dev-a', 'wo-test-001', 'COORDINATION', 'bk-wb01-003',
 '["provider-dev-a","COORDINATION","WORK_ORDER","MOCK_SOURCE","wo-test-001","PROBLEM","MOCK_SOURCE","p-003","COORDINATE"]',
 'ck-wb01-003', '春和庭履约协同', 'READY', 'user-wb-reviewer', 1789862400000, 1789862401000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb01-003');

-- ============================================================
-- 数据清理
-- work_item 受 no_delete 触发器保护，不支持逐行 DELETE；本用例数据随测试库整体重建还原，
-- 见 tc-workbench.md「二、前置条件」第 4 条。
-- ============================================================
