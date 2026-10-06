-- TC-COO-14.sql（UI）异常登记交互与异常视图
-- 数据形态同 TC-COO-06，独立事项 id
-- 上游（我引用）：work-item-schema.md §3；coordination-apis.md §2；07-subprd-coordination.md §3.4
-- 下游（引用我）：docs/06-testcase/coord/tc-coord-用例详情.md TC-COO-14
-- 前置：已执行 TC-COO-SEED.sql

-- ===== 数据准备 =====
INSERT INTO work_item
 (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, responsibility_version, row_version, analysis_generation, gmt_create, gmt_modified)
VALUES
 ('wi-rev-14', 'sp-lanshan-dev', 'wo-lanshan-001', 'INSTALLATION_REVIEW', 'bk-rev-14',
  '["sp-lanshan-dev","INSTALLATION_REVIEW","WORK_ORDER","JD-INSTALL","WO-LANSHAN-001","DETAIL_CHECK","JD-INSTALL","WO-LANSHAN-001","DECIDE_INSTALLATION_REVIEW"]',
  'ck-rev-14', '澜山府安装明细差异核查', 'READY', 'id-review-li', 1, 1, 1, 1789948800000, 1789948800000);

-- ===== 数据清理 =====
DELETE FROM activity_record WHERE work_item_id = 'wi-rev-14';
DELETE FROM human_decision WHERE work_item_id = 'wi-rev-14';
DELETE FROM work_item WHERE id = 'wi-rev-14';
