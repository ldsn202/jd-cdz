-- TC-CFG-SEED.sql 服务商接入配置域共用种子数据（SQLite/D1 方言）
-- 上游字段来源：integration-config-schema.md §2、work-item-schema.md §2/§3/§5、evidence-schema.md §2
-- 场景：服务商 sp-01 的配置 cfg-01 已有生效版 cfgv-01-1（首次启用历史 hd-cfg-01-1/ce-01-1/car-01-1），
--       当前调整事项 wi-cfg-01 持有候选 cfgv-01-2（HUMAN 修订版）及其 PASSED 试转换 ct-01-2。
--
-- 重要执行约束（来自候选 DDL 触发器，非本文件假设）：
-- 1. 各历史表（service_provider / work_item / human_decision / analysis_* / integration_config* /
--    configuration_*）禁止 DELETE 与替换写入，INSERT OR REPLACE 对已存在行同样被拒绝。
--    因此本文件只能在全新库上执行一次；任何用例执行后须重置本地库（重载各域 DDL + 本 SEED）恢复基线。
-- 2. 写入顺序固定：输入项 → 快照 → 分析结果 → 配置版本 → 试转换 → 人员决定 → 启用确认 →
--    生效结果 → 条件 UPDATE 切换 integration_config 指针（插入时指针必须为空、row_version 必须为 1）。
-- 3. 快照 skill 字段按 DDL 校验取分析类型 'INTEGRATION_CONFIGURATION'。

-- ========== 数据准备 ==========

INSERT OR REPLACE INTO service_provider
  (id, source_system, source_id, display_name, source_version, source_state, verified_at, gmt_create, gmt_modified)
VALUES
  ('sp-01', 'JD-INSTALL-BIZ', 'P-ANJIE-001', '安捷充电安装服务有限公司', '2026.03', 'UNKNOWN', NULL, 1789862400000, 1789862400000);

-- 配置身份：插入时无生效指针、row_version=1（DDL 强制）
INSERT OR REPLACE INTO integration_config
  (id, service_provider_id, source_system, purpose, business_scope_key, current_version_id, current_activation_result_id, row_version, gmt_create, gmt_modified)
VALUES
  ('cfg-01', 'sp-01', 'ANJIE-ERP', 'INSTALLATION', 'anjie-install-materials', NULL, NULL, 1, 1789862400000, 1789862400000);

INSERT OR REPLACE INTO work_item
  (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, responsibility_version, row_version, analysis_generation, current_analysis_result_id, current_reconciliation_id, integration_config_id, current_configuration_version_id, active_supplement_request_id, pending_write_id, blocked_reason, completion_code, completion_basis_json, completion_decision_id, completed_at, gmt_create, gmt_modified)
VALUES
  ('wi-cfg-01', 'sp-01', NULL, 'CONFIGURATION', 'd1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9004',
   '["sp-01","CONFIGURATION","CONFIG_SCOPE","LOCAL","anjie-install-materials","PROVIDER_FORMAT","ANJIE-ERP","AJ-FMT","ENABLE_CONFIGURATION"]',
   'cre-cfg-01-adjust-202609', '安捷充电-安装资料接入配置确认', 'READY', 'identity-tester-01', 1, 3, 1, NULL, NULL, 'cfg-01', 'cfgv-01-2', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1789862400000, 1789866000000);

-- 候选原分析：先输入项、后快照（封存校验计数与时间）、再分析结果
INSERT OR REPLACE INTO analysis_input_item
  (id, snapshot_id, input_key, input_kind, record_type, source_system, source_record_id, source_version, data_json, parsing_id, retrieved_at, gmt_create, gmt_modified)
VALUES
  ('item-cfg-01-0a', 'snap-cfg-01-0', 'AJ-REC-0001', 'RECORD', 'PROVIDER_RECORD', 'ANJIE-ERP', 'AJ-REC-0001', '2026.03', '{"rows":[{"实装长度":"１８.５０米","单位":"m"}]}', NULL, 1789862400500, 1789862400500, 1789862400500);

INSERT OR REPLACE INTO analysis_input_snapshot
  (id, work_item_id, service_provider_id, expected_work_item_version, analysis_generation, skill, skill_version, output_schema_version, config_versions_json, required_input_state, input_issues_json, input_item_count, content_sha256, gmt_create, gmt_modified)
VALUES
  ('snap-cfg-01-0', 'wi-cfg-01', 'sp-01', 1, 1, 'INTEGRATION_CONFIGURATION', '1.0.0', '1.0.0', '[]', 'COMPLETE', '[]', 1, 'aa844cd416dc142566dfb12be025d6757f7b0e6cf4acca0ac9316d3b3482eb19', 1789862401000, 1789862401000);

INSERT OR REPLACE INTO analysis_result
  (id, run_id, work_item_id, snapshot_id, profile_id, implementation_version, status, summary, findings_json, open_questions_json, validated_at, gmt_create, gmt_modified)
VALUES
  ('ar-cfg-01-1', 'run-cfg-01-1', 'wi-cfg-01', 'snap-cfg-01-0', 'profile-provider-mapping-1', 'provider-mapping-config-1.0.0', 'ANALYZED', '已生成安装资料转换候选规则', '[{"findingId":"f-1","type":"TRANSFORMATION_CONFIG","content":{"ruleCatalogVersion":"charging-transform-1","purpose":"INSTALLATION","sourceFormatId":"AJ-FMT","sourceFormatVersion":"2026.03","rowPath":"/rows"},"evidenceRefs":["item-cfg-01-0a"]}]', '[]', 1789862402000, 1789862402000, 1789862402000);

-- 版本 1（AI 起点）与版本 2（HUMAN 修订，当前候选；新增单位对照规则）
INSERT OR REPLACE INTO integration_config_version
  (id, integration_config_id, work_item_id, version_no, parent_version_id, analysis_result_id, origin, editor_identity_id, save_key, format_status, source_format_id, source_format_version, applicability_json, rules_json, open_questions_json, rule_catalog_version, edit_notes_json, gmt_create, gmt_modified)
VALUES
  ('cfgv-01-1', 'cfg-01', 'wi-cfg-01', 1, NULL, 'ar-cfg-01-1', 'AI', NULL, 'save-cfg-01-v1', 'PROVIDED', 'AJ-FMT', '2026.03',
   '{"serviceProviderId":"sp-01","sourceSystem":"ANJIE-ERP","purpose":"INSTALLATION","businessScopeKey":"anjie-install-materials","formatStatus":"PROVIDED","sourceFormatId":"AJ-FMT","sourceFormatVersion":"2026.03","rowPath":"/rows","conditions":[],"basisReferences":["item-cfg-01-0a"],"unknownConditions":[]}',
   '[{"ruleId":"actual-length","sourceFields":["/实装长度"],"targetField":"installedQuantity","operation":"PIPELINE","parameters":{"steps":[{"op":"field","path":"/实装长度"},{"op":"halfwidth"},{"op":"stripSuffix","value":"米"},{"op":"decimal"}]},"conditions":[]}]',
   '[]', 'charging-transform-1', '[]', 1789862403000, 1789862403000),
  ('cfgv-01-2', 'cfg-01', 'wi-cfg-01', 2, 'cfgv-01-1', 'ar-cfg-01-1', 'HUMAN', 'identity-tester-01', 'save-cfg-01-v2', 'PROVIDED', 'AJ-FMT', '2026.03',
   '{"serviceProviderId":"sp-01","sourceSystem":"ANJIE-ERP","purpose":"INSTALLATION","businessScopeKey":"anjie-install-materials","formatStatus":"PROVIDED","sourceFormatId":"AJ-FMT","sourceFormatVersion":"2026.03","rowPath":"/rows","conditions":[],"basisReferences":["item-cfg-01-0a"],"unknownConditions":[]}',
   '[{"ruleId":"actual-length","sourceFields":["/实装长度"],"targetField":"installedQuantity","operation":"PIPELINE","parameters":{"steps":[{"op":"field","path":"/实装长度"},{"op":"halfwidth"},{"op":"stripSuffix","value":"米"},{"op":"decimal"}]},"conditions":[]},{"ruleId":"unit-lookup","sourceFields":["/单位"],"targetField":"unit","operation":"PIPELINE","parameters":{"steps":[{"op":"field","path":"/单位"},{"op":"lookup","entries":[{"from":"m","to":"米"},{"from":"米","to":"米"}],"onMiss":"HOLD"}]},"conditions":[]}]',
   '[]', 'charging-transform-1',
   '[{"fieldPath":"rules[1]","before":null,"after":{"ruleId":"unit-lookup","targetField":"unit"},"reason":"原格式说明 2026.03 明确单位列存在 m/米 两种写法，补充单位对照规则","basisReferences":["item-cfg-01-0a"]}]',
   1789866000000, 1789866000000);

-- 试转换固定输入（独立于原分析快照，config_versions_json 标记 TRIAL_CANDIDATE）：先输入项、后快照
INSERT OR REPLACE INTO analysis_input_item
  (id, snapshot_id, input_key, input_kind, record_type, source_system, source_record_id, source_version, data_json, parsing_id, retrieved_at, gmt_create, gmt_modified)
VALUES
  ('item-cfg-01-t1a', 'snap-cfg-01-t1', 'AJ-REC-0001', 'RECORD', 'PROVIDER_RECORD', 'ANJIE-ERP', 'AJ-REC-0001', '2026.03', '{"rows":[{"实装长度":"１８.５０米","单位":"米"}]}', NULL, 1789862403500, 1789862403500, 1789862403500),
  ('item-cfg-01-t2a', 'snap-cfg-01-t2', 'AJ-REC-0001', 'RECORD', 'PROVIDER_RECORD', 'ANJIE-ERP', 'AJ-REC-0001', '2026.03', '{"rows":[{"实装长度":"１８.５０米","单位":"m"}]}', NULL, 1789866000500, 1789866000500, 1789866000500);

INSERT OR REPLACE INTO analysis_input_snapshot
  (id, work_item_id, service_provider_id, expected_work_item_version, analysis_generation, skill, skill_version, output_schema_version, config_versions_json, required_input_state, input_issues_json, input_item_count, content_sha256, gmt_create, gmt_modified)
VALUES
  ('snap-cfg-01-t1', 'wi-cfg-01', 'sp-01', 1, 1, 'INTEGRATION_CONFIGURATION', '1.0.0', '1.0.0', '[{"configurationId":"cfg-01","configurationVersionId":"cfgv-01-1","usage":"TRIAL_CANDIDATE"}]', 'COMPLETE', '[]', 1, '2a81c8d11d4f227e9f20055c5b6fede8408455205b5b00f7d44db3993ae1c77c', 1789862404000, 1789862404000),
  ('snap-cfg-01-t2', 'wi-cfg-01', 'sp-01', 3, 1, 'INTEGRATION_CONFIGURATION', '1.0.0', '1.0.0', '[{"configurationId":"cfg-01","configurationVersionId":"cfgv-01-2","usage":"TRIAL_CANDIDATE"}]', 'COMPLETE', '[]', 1, '0c0c60523bf04a5053ddeaac4a2aeeb627bbd50adb661b691c210fa20b149a4e', 1789866001000, 1789866001000);

-- 试转换终态：ct-01-1（v1 PASSED，首次启用依据）、ct-01-2（v2 PASSED，当前展示）
INSERT OR REPLACE INTO configuration_trial
  (id, configuration_version_id, snapshot_id, execution_key, transformer_version, status, output_json, rule_results_json, issues_json, checks_json, gmt_create, gmt_modified)
VALUES
  ('ct-01-1', 'cfgv-01-1', 'snap-cfg-01-t1', 'exec-cfg-01-v1', 'charging-transformer-1.0', 'PASSED',
   '{"installedQuantity":"18.5"}',
   '[{"ruleId":"actual-length","status":"PASSED","inputReferences":["/rows/0/实装长度"],"outputReferences":["installedQuantity"],"issues":[]}]',
   '[]', '{"input_complete":true,"scope_valid":true,"rules_covered":true,"outputs_valid":true,"meanings_resolved":true}', 1789862405000, 1789862405000),
  ('ct-01-2', 'cfgv-01-2', 'snap-cfg-01-t2', 'exec-cfg-01-v2', 'charging-transformer-1.0', 'PASSED',
   '{"installedQuantity":"18.5","unit":"米"}',
   '[{"ruleId":"actual-length","status":"PASSED","inputReferences":["/rows/0/实装长度"],"outputReferences":["installedQuantity"],"issues":[]},{"ruleId":"unit-lookup","status":"PASSED","inputReferences":["/rows/0/单位"],"outputReferences":["unit"],"issues":[]}]',
   '[]', '{"input_complete":true,"scope_valid":true,"rules_covered":true,"outputs_valid":true,"meanings_resolved":true}', 1789866002000, 1789866002000);

-- 首次启用历史：人员决定 → 启用确认（expected_active_version_id 为 NULL）→ APPLIED 结果 → 条件 UPDATE 切指针
INSERT OR REPLACE INTO human_decision
  (id, work_item_id, service_provider_id, origin, action_type, request_key, actor_identity_id, identity_context_id, matched_grants_json, expected_work_item_version, expected_responsibility_version, analysis_result_id, confirmed_at, content_json, source_system, source_record_type, source_record_id, source_actor_ref_json, gmt_create, gmt_modified)
VALUES
  ('hd-cfg-01-1', 'wi-cfg-01', 'sp-01', 'LOCAL', 'ENABLE_CONFIGURATION', 'req-cfg-01-enable-v1', 'identity-tester-01', 'ictx-tester-01', '["grant-cfg-01"]', 2, 1, NULL, 1789862405500,
   '{"candidateVersionId":"cfgv-01-1","trialId":"ct-01-1","comment":"含义已核实，试转换通过"}', NULL, NULL, NULL, NULL, 1789862405500, 1789862405500);

INSERT OR REPLACE INTO configuration_enablement
  (id, human_decision_id, configuration_version_id, trial_id, expected_config_version, expected_active_version_id, gmt_create, gmt_modified)
VALUES
  ('ce-01-1', 'hd-cfg-01-1', 'cfgv-01-1', 'ct-01-1', 1, NULL, 1789862406000, 1789862406000);

INSERT OR REPLACE INTO configuration_activation_result
  (id, enablement_id, outcome, reason_code, detail_json, gmt_create, gmt_modified)
VALUES
  ('car-01-1', 'ce-01-1', 'APPLIED', NULL, '{"checkedAt":1789862406000,"note":"条件全部成立，指针切换"}', 1789862406000, 1789862406000);

UPDATE integration_config SET current_version_id='cfgv-01-1', current_activation_result_id='car-01-1', row_version=2, gmt_modified=1789862406000 WHERE id='cfg-01' AND row_version=1 AND current_version_id IS NULL;

-- ========== 数据清理 ==========
-- 配置域与证据域历史表受 DDL 触发器保护，禁止 DELETE/REPLACE。重置基线方式：
-- 删除本地测试库文件，按 schema 文档顺序重载 work-item / evidence / installation / reconciliation /
-- integration-config 候选 DDL，再执行本文件。
-- 基线核验（应各返回 1）：
-- SELECT COUNT(*) FROM integration_config WHERE id='cfg-01' AND current_version_id='cfgv-01-1' AND row_version=2;
-- SELECT COUNT(*) FROM configuration_trial WHERE configuration_version_id='cfgv-01-2' AND status='PASSED';
