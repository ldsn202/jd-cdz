-- TC-COO-11.sql（UI）协同详情渲染：analysis=null 空态与 relatedItems
-- 数据形态同 TC-COO-01，使用独立事项 id 避免与 API 用例残留冲突
-- 上游（我引用）：work-item-schema.md §3—4；07-subprd-coordination.md §3.1、§3.6
-- 下游（引用我）：docs/06-testcase/coord/tc-coord-用例详情.md TC-COO-11
-- 前置：已执行 TC-COO-SEED.sql

-- ===== 数据准备 =====
INSERT INTO work_item
 (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, responsibility_version, row_version, analysis_generation, current_analysis_result_id, gmt_create, gmt_modified)
VALUES
 ('wi-coo-11', 'sp-lanshan-dev', 'wo-lanshan-001', 'COORDINATION', 'bk-coo-11',
  '["sp-lanshan-dev","COORDINATION","WORK_ORDER","JD-INSTALL","WO-LANSHAN-001","ENTRY_TIME","JD-INSTALL","WO-LANSHAN-001","CONFIRM_ENTRY"]',
  'ck-coo-11', '澜山府物业入场时间待确认', 'READY', 'id-coord-zhang', 1, 1, 1, NULL, 1789948800000, 1789948800000);

-- 历史已完成前序事项（构造 relatedItems 输入；完成字段为历史事实，非本次被测输出）
INSERT INTO work_item
 (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, responsibility_version, row_version, analysis_generation, completion_code, completion_basis_json, completion_decision_id, completed_at, gmt_create, gmt_modified)
VALUES
 ('wi-pre-done-11', 'sp-lanshan-dev', 'wo-lanshan-001', 'INSTALLATION_PREPARATION', 'bk-pre-done-11',
  '["sp-lanshan-dev","INSTALLATION_PREPARATION","WORK_ORDER","JD-INSTALL","WO-LANSHAN-001","DRAFT","JD-INSTALL","WO-LANSHAN-001","SUBMIT_INSTALLATION"]',
  'ck-pre-done-11', '澜山府安装资料提交', 'COMPLETED', 'id-coord-zhang', 1, 2, 1,
  'INSTALLATION_SUBMITTED', '{"resultType":"INSTALLATION_SUBMITTED","note":"历史种子事实"}', NULL, 1789850000000, 1789800000000, 1789850000000);

INSERT INTO work_item_link
 (id, from_work_item_id, to_work_item_id, reason_code, cause_key, basis_json, gmt_create, gmt_modified)
VALUES
 ('wil-coo-11', 'wi-pre-done-11', 'wi-coo-11', 'STAGE_HANDOFF', 'cause-pre-done-11',
  '{"reason":"资料提交后衔接履约协同"}', 1789850000000, 1789850000000);

-- ===== 数据清理 =====
DELETE FROM work_item_link WHERE id = 'wil-coo-11';
DELETE FROM work_item WHERE id IN ('wi-coo-11', 'wi-pre-done-11');
