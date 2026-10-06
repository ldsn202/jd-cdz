-- TC-WB-05.sql 关键词搜索（对应 TC-WB-05）
-- 前置：已执行 TC-WB-SEED.sql（工单来源编号 WO-SD-20260901/02 属服务商甲，03 属服务商乙）

-- ============================================================
-- 数据准备
-- wi-wb05-001 春和庭（挂 wo-test-001 / WO-SD-20260901）
-- wi-wb05-002 尚澜府（挂 wo-test-002 / WO-SD-20260902）
-- wi-wb05-003 清河湾（挂 wo-test-003 / WO-SD-20260903，服务商乙，张三越权）
-- ============================================================
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb05-001', 'provider-dev-a', 'wo-test-001', 'INSTALLATION_REVIEW', 'bk-wb05-001',
 '["provider-dev-a","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-001","PROBLEM","MOCK_SOURCE","p-041","REVIEW"]',
 'ck-wb05-001', '春和庭安装资料核查', 'READY', 'user-wb-reviewer', 1789862400000, 1789862403000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb05-001');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb05-002', 'provider-dev-a', 'wo-test-002', 'INSTALLATION_REVIEW', 'bk-wb05-002',
 '["provider-dev-a","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-002","PROBLEM","MOCK_SOURCE","p-042","REVIEW"]',
 'ck-wb05-002', '尚澜府安装资料核查', 'READY', 'user-wb-reviewer', 1789862400000, 1789862402000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb05-002');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb05-003', 'provider-dev-b', 'wo-test-003', 'INSTALLATION_REVIEW', 'bk-wb05-003',
 '["provider-dev-b","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-003","PROBLEM","MOCK_SOURCE","p-043","REVIEW"]',
 'ck-wb05-003', '清河湾安装资料核查', 'READY', 'user-wb-reviewer', 1789862400000, 1789862401000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb05-003');

-- ============================================================
-- 数据清理
-- work_item 受 no_delete 触发器保护，不支持逐行 DELETE；本用例数据随测试库整体重建还原，
-- 见 tc-workbench.md「二、前置条件」第 4 条。
-- ============================================================
