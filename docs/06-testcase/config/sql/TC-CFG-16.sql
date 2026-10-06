-- TC-CFG-16.sql 试转换 FAILED 展示（UI 侧）
-- 场景：cfg-16 候选 cfgv-16-1 的试转换 ct-16-1 为 FAILED（单位冲突），无生效版。
-- ========== 数据准备 ==========

INSERT OR REPLACE INTO integration_config
  (id, service_provider_id, source_system, purpose, business_scope_key, current_version_id, current_activation_result_id, row_version, gmt_create, gmt_modified)
VALUES
  ('cfg-16', 'sp-01', 'ANJIE-ERP', 'INSTALLATION', 'anjie-install-scope-q', NULL, NULL, 1, 1789862400000, 1789862400000);

INSERT OR REPLACE INTO work_item
  (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, responsibility_version, row_version, analysis_generation, current_analysis_result_id, current_reconciliation_id, integration_config_id, current_configuration_version_id, active_supplement_request_id, pending_write_id, blocked_reason, completion_code, completion_basis_json, completion_decision_id, completed_at, gmt_create, gmt_modified)
VALUES
  ('wi-cfg-16', 'sp-01', NULL, 'CONFIGURATION', '20b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9026',
   '["sp-01","CONFIGURATION","CONFIG_SCOPE","LOCAL","anjie-install-scope-q","PROVIDER_FORMAT","ANJIE-ERP","AJ-FMT","ENABLE_CONFIGURATION"]',
   'cre-wi-cfg-16-new-202609', '安捷充电-安装资料接入配置确认（范围Q）', 'READY', 'identity-tester-01', 1, 2, 1, NULL, NULL, 'cfg-16', 'cfgv-16-1', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1789862400000, 1789866000000);

INSERT OR REPLACE INTO analysis_input_item
  (id, snapshot_id, input_key, input_kind, record_type, source_system, source_record_id, source_version, data_json, parsing_id, retrieved_at, gmt_create, gmt_modified)
VALUES
  ('item-cfg-16-0a', 'snap-cfg-16-0', 'AJ-REC-X', 'RECORD', 'PROVIDER_RECORD', 'ANJIE-ERP', 'AJ-REC-X', '2026.03', '{"rows":[{"实装长度":"4.00米"}]}', NULL, 1789862400500, 1789862400500, 1789862400500);

INSERT OR REPLACE INTO analysis_input_snapshot
  (id, work_item_id, service_provider_id, expected_work_item_version, analysis_generation, skill, skill_version, output_schema_version, config_versions_json, required_input_state, input_issues_json, input_item_count, content_sha256, gmt_create, gmt_modified)
VALUES
  ('snap-cfg-16-0', 'wi-cfg-16', 'sp-01', 1, 1, 'INTEGRATION_CONFIGURATION', '1.0.0', '1.0.0', '[]', 'COMPLETE', '[]', 1, 'a257e60942e5aaff9a0dbdf40cc96a8a5b4f550fe1cd691ed311d36b70dbf3ba', 1789862401000, 1789862401000);

INSERT OR REPLACE INTO analysis_result
  (id, run_id, work_item_id, snapshot_id, profile_id, implementation_version, status, summary, findings_json, open_questions_json, validated_at, gmt_create, gmt_modified)
VALUES
  ('ar-cfg-16-1', 'run-ar-cfg-16-1', 'wi-cfg-16', 'snap-cfg-16-0', 'profile-provider-mapping-1', 'provider-mapping-config-1.0.0', 'ANALYZED', '已生成安装资料转换候选规则', '[]', '[]', 1789862402000, 1789862402000, 1789862402000);

INSERT OR REPLACE INTO integration_config_version
  (id, integration_config_id, work_item_id, version_no, parent_version_id, analysis_result_id, origin, editor_identity_id, save_key, format_status, source_format_id, source_format_version, applicability_json, rules_json, open_questions_json, rule_catalog_version, edit_notes_json, gmt_create, gmt_modified)
VALUES
  ('cfgv-16-1', 'cfg-16', 'wi-cfg-16', 1, NULL, 'ar-cfg-16-1', 'AI', NULL, 'save-cfgv-16-1', 'PROVIDED', 'AJ-FMT', '2026.03',
   '{"serviceProviderId":"sp-01","sourceSystem":"ANJIE-ERP","purpose":"INSTALLATION","businessScopeKey":"anjie-install-scope-q","formatStatus":"PROVIDED","sourceFormatId":"AJ-FMT","sourceFormatVersion":"2026.03","rowPath":"/rows","conditions":[],"basisReferences":["item-cfg-16-0a"],"unknownConditions":[]}',
   '[{"ruleId":"actual-length","sourceFields":["/实装长度"],"targetField":"installedQuantity","operation":"PIPELINE","parameters":{"steps":[{"op":"field","path":"/实装长度"},{"op":"stripSuffix","value":"米"},{"op":"decimal"},{"op":"scale","factor":"0.3048"}]},"conditions":[]}]',
   '[]', 'charging-transform-1', '[]', 1789862403000, 1789862403000);

INSERT OR REPLACE INTO analysis_input_item
  (id, snapshot_id, input_key, input_kind, record_type, source_system, source_record_id, source_version, data_json, parsing_id, retrieved_at, gmt_create, gmt_modified)
VALUES
  ('item-cfg-16-t1a', 'snap-cfg-16-t1', 'AJ-REC-X', 'RECORD', 'PROVIDER_RECORD', 'ANJIE-ERP', 'AJ-REC-X', '2026.03', '{"rows":[{"实装长度":"4.00米"}]}', NULL, 1789862403500, 1789862403500, 1789862403500);

INSERT OR REPLACE INTO analysis_input_snapshot
  (id, work_item_id, service_provider_id, expected_work_item_version, analysis_generation, skill, skill_version, output_schema_version, config_versions_json, required_input_state, input_issues_json, input_item_count, content_sha256, gmt_create, gmt_modified)
VALUES
  ('snap-cfg-16-t1', 'wi-cfg-16', 'sp-01', 1, 1, 'INTEGRATION_CONFIGURATION', '1.0.0', '1.0.0', '[{"configurationId":"cfg-16","configurationVersionId":"cfgv-16-1","usage":"TRIAL_CANDIDATE"}]', 'COMPLETE', '[]', 1, '3f7f9e5cdeeed59668dadf20060d0e79baeb223b2259d0b0e654241806e23cb1', 1789862404000, 1789862404000);

INSERT OR REPLACE INTO configuration_trial
  (id, configuration_version_id, snapshot_id, execution_key, transformer_version, status, output_json, rule_results_json, issues_json, checks_json, gmt_create, gmt_modified)
VALUES
  ('ct-16-1', 'cfgv-16-1', 'snap-cfg-16-t1', 'exec-ct-16-1', 'charging-transformer-1.0', 'FAILED',
   NULL,
   '[{"ruleId":"actual-length","status":"FAILED","inputReferences":["/rows/0/实装长度"],"outputReferences":[],"issues":[{"code":"UNIT_CONFLICT","description":"输入单位为米，规则追加英尺换算比例，单位冲突"}]}]',
   '[{"code":"UNIT_CONFLICT","description":"输入单位为米，规则追加英尺换算比例，单位冲突"}]',
   '{"input_complete":true,"scope_valid":true,"rules_covered":true,"outputs_valid":false,"meanings_resolved":true}', 1789862405000, 1789862405000);
-- ========== 数据清理 ==========
-- 本域历史表受 DDL 触发器保护，禁止 DELETE/REPLACE；执行后重置本地库（重载各域 DDL + TC-CFG-SEED.sql）恢复基线。
