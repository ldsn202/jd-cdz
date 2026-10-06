-- TC-WB-16.sql 分析失败标识与缺失字段兜底（对应 TC-WB-16）
-- 前置：已执行 TC-WB-SEED.sql

-- ============================================================
-- 数据准备
-- wi-wb16-001 安装核查 READY（接口需返回 analysisStatus=BLOCKED）
-- wi-wb16-002 接入配置 READY、无工单、待分配
--
-- [待确认-需产品明确]：analysisStatus=BLOCKED 由服务端按分析失败事实计算
-- （workbench-apis.md §7.1：失败按 analysisStatus=BLOCKED 及 blockedReasons 展示），
-- 其事实保存在分析/执行域，当前 work-item-schema.md 未提供可通过 SQL 构造的持久化入口，
-- 且服务端计算字段禁止预置。本脚本仅备事项行，BLOCKED 状态的实际构造方式待明确后补充。
-- ============================================================
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb16-001', 'provider-dev-a', 'wo-test-001', 'INSTALLATION_REVIEW', 'bk-wb16-001',
 '["provider-dev-a","INSTALLATION_REVIEW","WORK_ORDER","MOCK_SOURCE","wo-test-001","PROBLEM","MOCK_SOURCE","p-161","REVIEW"]',
 'ck-wb16-001', '锦绣里安装资料核查（分析失败）', 'READY', 'user-wb-reviewer', 1789862400000, 1789862402000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb16-001');
INSERT INTO work_item (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, gmt_create, gmt_modified)
SELECT 'wi-wb16-002', 'provider-dev-a', NULL, 'CONFIGURATION', 'bk-wb16-002',
 '["provider-dev-a","CONFIGURATION","PROVIDER","MOCK_SOURCE","provider-dev-a","PROBLEM","MOCK_SOURCE","p-162","CONFIGURE"]',
 'ck-wb16-002', '服务商甲接入配置确认', 'READY', NULL, 1789862400000, 1789862401000
WHERE NOT EXISTS (SELECT 1 FROM work_item WHERE id = 'wi-wb16-002');

-- ============================================================
-- 数据清理
-- work_item 受 no_delete 触发器保护，不支持逐行 DELETE；本用例数据随测试库整体重建还原，
-- 见 tc-workbench.md「二、前置条件」第 4 条。
-- ============================================================
