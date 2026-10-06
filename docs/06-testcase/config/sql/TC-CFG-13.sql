-- TC-CFG-13.sql 待确认问题展示（非空逐条展示 / 空数组"无待确认问题"）
-- 场景：cfg-13 候选 cfgv-13-1 带 2 条待确认问题；空数组侧复用 SEED 的 wi-cfg-01（openQuestions=[]）。
-- ========== 数据准备 ==========

INSERT OR REPLACE INTO integration_config
  (id, service_provider_id, source_system, purpose, business_scope_key, current_version_id, current_activation_result_id, row_version, gmt_create, gmt_modified)
VALUES
  ('cfg-13', 'sp-01', 'ANJIE-ERP', 'INSTALLATION', 'anjie-install-scope-m', NULL, NULL, 1, 1789862400000, 1789862400000);

INSERT OR REPLACE INTO work_item
  (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, responsibility_version, row_version, analysis_generation, current_analysis_result_id, current_reconciliation_id, integration_config_id, current_configuration_version_id, active_supplement_request_id, pending_write_id, blocked_reason, completion_code, completion_basis_json, completion_decision_id, completed_at, gmt_create, gmt_modified)
VALUES
  ('wi-cfg-13', 'sp-01', NULL, 'CONFIGURATION', '14b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9020',
   '["sp-01","CONFIGURATION","CONFIG_SCOPE","LOCAL","anjie-install-scope-m","PROVIDER_FORMAT","ANJIE-ERP","AJ-FMT","ENABLE_CONFIGURATION"]',
   'cre-cfg-13-new-202609', '安捷充电-安装资料接入配置确认（范围M）', 'READY', 'identity-tester-01', 1, 2, 1, NULL, NULL, 'cfg-13', 'cfgv-13-1', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1789862400000, 1789866000000);

INSERT OR REPLACE INTO analysis_input_item
  (id, snapshot_id, input_key, input_kind, record_type, source_system, source_record_id, source_version, data_json, parsing_id, retrieved_at, gmt_create, gmt_modified)
VALUES
  ('item-cfg-13-0a', 'snap-cfg-13-0', 'AJ-REC-0013', 'RECORD', 'PROVIDER_RECORD', 'ANJIE-ERP', 'AJ-REC-0013', '2026.03', '{"rows":[{"用量":"3","规格":"国标"}]}', NULL, 1789862400500, 1789862400500, 1789862400500);

INSERT OR REPLACE INTO analysis_input_snapshot
  (id, work_item_id, service_provider_id, expected_work_item_version, analysis_generation, skill, skill_version, output_schema_version, config_versions_json, required_input_state, input_issues_json, input_item_count, content_sha256, gmt_create, gmt_modified)
VALUES
  ('snap-cfg-13-0', 'wi-cfg-13', 'sp-01', 1, 1, 'INTEGRATION_CONFIGURATION', '1.0.0', '1.0.0', '[]', 'INCOMPLETE', '[{"code":"MISSING_FIELD","description":"原资料缺少字段定义说明"}]', 1, 'b14430adc5104b03aa294f02c181b0bf896662b6c0627b2a9692018778ff2b45', 1789862401000, 1789862401000);

INSERT OR REPLACE INTO analysis_result
  (id, run_id, work_item_id, snapshot_id, profile_id, implementation_version, status, summary, findings_json, open_questions_json, validated_at, gmt_create, gmt_modified)
VALUES
  ('ar-cfg-13-1', 'run-cfg-13-1', 'wi-cfg-13', 'snap-cfg-13-0', 'profile-provider-mapping-1', 'provider-mapping-config-1.0.0', 'NEEDS_INFORMATION', '部分字段含义待核实',
   '[]',
   '[{"questionId":"q-1","description":"原字段「用量」无定义，不能确认为实际安装数量或领料数量"},{"questionId":"q-2","description":"原字段「规格」值「国标」缺单位与适用范围依据"}]',
   1789862402000, 1789862402000, 1789862402000);

INSERT OR REPLACE INTO integration_config_version
  (id, integration_config_id, work_item_id, version_no, parent_version_id, analysis_result_id, origin, editor_identity_id, save_key, format_status, source_format_id, source_format_version, applicability_json, rules_json, open_questions_json, rule_catalog_version, edit_notes_json, gmt_create, gmt_modified)
VALUES
  ('cfgv-13-1', 'cfg-13', 'wi-cfg-13', 1, NULL, 'ar-cfg-13-1', 'AI', NULL, 'save-cfg-13-v1', 'PROVIDED', 'AJ-FMT', '2026.03',
   '{"serviceProviderId":"sp-01","sourceSystem":"ANJIE-ERP","purpose":"INSTALLATION","businessScopeKey":"anjie-install-scope-m","formatStatus":"PROVIDED","sourceFormatId":"AJ-FMT","sourceFormatVersion":"2026.03","rowPath":"/rows","conditions":[],"basisReferences":["item-cfg-13-0a"],"unknownConditions":["用量含义"]}',
   '[]',
   '[{"questionId":"q-1","description":"原字段「用量」无定义，不能确认为实际安装数量或领料数量"},{"questionId":"q-2","description":"原字段「规格」值「国标」缺单位与适用范围依据"}]',
   'charging-transform-1', '[]', 1789862403000, 1789862403000);

-- ========== 数据清理 ==========
-- 本域历史表受 DDL 触发器保护，禁止 DELETE/REPLACE；执行后重置本地库（重载各域 DDL + TC-CFG-SEED.sql）恢复基线。
