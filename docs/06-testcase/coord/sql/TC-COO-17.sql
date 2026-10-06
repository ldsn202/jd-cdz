-- TC-COO-17.sql（UI）停止决定后的页面展示
-- 上游（我引用）：work-item-schema.md §3、§5；coordination-apis.md §4；07-subprd-coordination.md §3.5
-- 下游（引用我）：docs/06-testcase/coord/tc-coord-用例详情.md TC-COO-17
-- 前置：已执行 TC-COO-SEED.sql

-- ===== 数据准备 =====
INSERT INTO work_item
 (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, responsibility_version, row_version, analysis_generation, gmt_create, gmt_modified)
VALUES
 ('wi-coo-stop-17', 'sp-lanshan-dev', 'wo-lanshan-001', 'COORDINATION', 'bk-coo-stop-17',
  '["sp-lanshan-dev","COORDINATION","WORK_ORDER","JD-INSTALL","WO-LANSHAN-001","ENTRY_TIME","JD-INSTALL","WO-LANSHAN-001","CONFIRM_ENTRY"]',
  'ck-coo-stop-17', '澜山府物业入场时间待确认', 'READY', 'id-coord-zhang', 1, 1, 1, 1789948800000, 1789948800000);

-- ===== 数据清理 =====
DELETE FROM activity_record WHERE work_item_id = 'wi-coo-stop-17';
DELETE FROM human_decision WHERE work_item_id = 'wi-coo-stop-17';
DELETE FROM work_item WHERE id = 'wi-coo-stop-17';
