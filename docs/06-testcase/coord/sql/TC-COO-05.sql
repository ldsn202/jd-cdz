-- TC-COO-05.sql 完成协同（可追溯 + 不改写核查/对账事项）
-- 上游（我引用）：work-item-schema.md §3、§5、§7；coordination-apis.md §3；07-subprd-coordination.md §3.3
-- 下游（引用我）：docs/06-testcase/coord/tc-coord-用例详情.md TC-COO-05
-- 前置：已执行 TC-COO-SEED.sql

-- ===== 数据准备 =====
-- 被测协同事项
INSERT INTO work_item
 (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, responsibility_version, row_version, analysis_generation, gmt_create, gmt_modified)
VALUES
 ('wi-coo-05', 'sp-lanshan-dev', 'wo-lanshan-001', 'COORDINATION', 'bk-coo-05',
  '["sp-lanshan-dev","COORDINATION","WORK_ORDER","JD-INSTALL","WO-LANSHAN-001","ENTRY_TIME","JD-INSTALL","WO-LANSHAN-001","CONFIRM_ENTRY"]',
  'ck-coo-05', '澜山府物业入场时间待确认', 'READY', 'id-coord-zhang', 1, 1, 1, 1789948800000, 1789948800000),
-- 同工单核查事项（验收#14 对照：完成后状态须不变）
 ('wi-rev-05', 'sp-lanshan-dev', 'wo-lanshan-001', 'INSTALLATION_REVIEW', 'bk-rev-05',
  '["sp-lanshan-dev","INSTALLATION_REVIEW","WORK_ORDER","JD-INSTALL","WO-LANSHAN-001","DETAIL_CHECK","JD-INSTALL","WO-LANSHAN-001","DECIDE_INSTALLATION_REVIEW"]',
  'ck-rev-05', '澜山府安装明细差异核查', 'READY', 'id-review-li', 1, 1, 1, 1789948800000, 1789948800000),
-- 同工单对账事项（验收#14 对照）
 ('wi-rec-05', 'sp-lanshan-dev', 'wo-lanshan-001', 'RECONCILIATION', 'bk-rec-05',
  '["sp-lanshan-dev","RECONCILIATION","WORK_ORDER","JD-INSTALL","WO-LANSHAN-001","BILLING","JD-INSTALL","WO-LANSHAN-001","REQUEST_BILLING_VERIFICATION"]',
  'ck-rec-05', '澜山府工单费用对账', 'WAITING_REPLY', 'id-recon-wang', 1, 1, 1, 1789948800000, 1789948800000);

-- ===== 数据清理 =====
DELETE FROM activity_record WHERE work_item_id IN ('wi-coo-05', 'wi-rev-05', 'wi-rec-05');
DELETE FROM human_decision WHERE work_item_id IN ('wi-coo-05', 'wi-rev-05', 'wi-rec-05');
DELETE FROM work_item WHERE id IN ('wi-coo-05', 'wi-rev-05', 'wi-rec-05');
