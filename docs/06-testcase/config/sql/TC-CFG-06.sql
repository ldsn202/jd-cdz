-- TC-CFG-06.sql 首次启用成功（expectedActiveVersionId=null）
-- 场景：cfg-06 从未启用过（current_version_id 为 NULL、row_version=1），候选 cfgv-06-1 有同版本同输入 PASSED 试转换。
-- ========== 数据准备 ==========

INSERT OR REPLACE INTO integration_config
  (id, service_provider_id, source_system, purpose, business_scope_key, current_version_id, current_activation_result_id, row_version, gmt_create, gmt_modified)
VALUES
  ('cfg-06', 'sp-01', 'ANJIE-ERP', 'INSTALLATION', 'anjie-install-scope-f', NULL, NULL, 1, 1789862400000, 1789862400000);

INSERT OR REPLACE INTO work_item
  (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, responsibility_version, row_version, analysis_generation, current_analysis_result_id, current_reconciliation_id, integration_config_id, current_configuration_version_id, active_supplement_request_id, pending_write_id, blocked_reason, completion_code, completion_basis_json, completion_decision_id, completed_at, gmt_create, gmt_modified)
VALUES
  ('wi-cfg-06', 'sp-01', NULL, 'CONFIGURATION', '08b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9014',
   '["sp-01","CONFIGURATION","CONFIG_SCOPE","LOCAL","anjie-install-scope-f","PROVIDER_FORMAT","ANJIE-ERP","AJ-FMT","ENABLE_CONFIGURATION"]',
   'cre-cfg-06-new-202609', '安捷充电-安装资料接入配置确认（范围F）', 'READY', 'identity-tester-01', 1, 2, 1, NULL, NULL, 'cfg-06', 'cfgv-06-1', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1789862400000, 1789866000000);

INSERT OR REPLACE INTO analysis_input_item
  (id, snapshot_id, input_key, input_kind, record_type, source_system, source_record_id, source_version, data_json, parsing_id, retrieved_at, gmt_create, gmt_modified)
VALUES
  ('item-cfg-06-0a', 'snap-cfg-06-0', 'AJ-REC-0006', 'RECORD', 'PROVIDER_RECORD', 'ANJIE-ERP', 'AJ-REC-0006', '2026.03', '{"rows":[{"实装长度":"9.50米"}]}', NULL, 1789862400500, 1789862400500, 1789862400500),
  ('item-cfg-06-t1a', 'snap-cfg-06-t1', 'AJ-REC-0006', 'RECORD', 'PROVIDER_RECORD', 'ANJIE-ERP', 'AJ-REC-0006', '2026.03', '{"rows":[{"实装长度":"9.50米"}]}', NULL, 1789862403500, 1789862403500, 1789862403500);

INSERT OR REPLACE INTO analysis_input_snapshot
  (id, work_item_id, service_provider_id, expected_work_item_version, analysis_generation, skill, skill_version, output_schema_version, config_versions_json, required_input_state, input_issues_json, input_item_count, content_sha256, gmt_create, gmt_modified)
VALUES
  ('snap-cfg-06-0', 'wi-cfg-06', 'sp-01', 1, 1, 'INTEGRATION_CONFIGURATION', '1.0.0', '1.0.0', '[]', 'COMPLETE', '[]', 1, '18b204e0c72bd9a0e13fbefa8c596a82ae37f0b3e801d0f4609c6ee31527802f', 1789862401000, 1789862401000),
  ('snap-cfg-06-t1', 'wi-cfg-06', 'sp-01', 2, 1, 'INTEGRATION_CONFIGURATION', '1.0.0', '1.0.0', '[{"configurationId":"cfg-06","configurationVersionId":"cfgv-06-1","usage":"TRIAL_CANDIDATE"}]', 'COMPLETE', '[]', 1, '1e8014c914941e671112c03ce4fc7027a280579700343b8899fbfe7f3249eebb', 1789862404000, 1789862404000);

INSERT OR REPLACE INTO analysis_result
  (id, run_id, work_item_id, snapshot_id, profile_id, implementation_version, status, summary, findings_json, open_questions_json, validated_at, gmt_create, gmt_modified)
VALUES
  ('ar-cfg-06-1', 'run-cfg-06-1', 'wi-cfg-06', 'snap-cfg-06-0', 'profile-provider-mapping-1', 'provider-mapping-config-1.0.0', 'ANALYZED', '已生成安装资料转换候选规则', '[]', '[]', 1789862402000, 1789862402000, 1789862402000);

INSERT OR REPLACE INTO integration_config_version
  (id, integration_config_id, work_item_id, version_no, parent_version_id, analysis_result_id, origin, editor_identity_id, save_key, format_status, source_format_id, source_format_version, applicability_json, rules_json, open_questions_json, rule_catalog_version, edit_notes_json, gmt_create, gmt_modified)
VALUES
  ('cfgv-06-1', 'cfg-06', 'wi-cfg-06', 1, NULL, 'ar-cfg-06-1', 'AI', NULL, 'save-cfg-06-v1', 'PROVIDED', 'AJ-FMT', '2026.03',
   '{"serviceProviderId":"sp-01","sourceSystem":"ANJIE-ERP","purpose":"INSTALLATION","businessScopeKey":"anjie-install-scope-f","formatStatus":"PROVIDED","sourceFormatId":"AJ-FMT","sourceFormatVersion":"2026.03","rowPath":"/rows","conditions":[],"basisReferences":["item-cfg-06-0a"],"unknownConditions":[]}',
   '[{"ruleId":"actual-length","sourceFields":["/实装长度"],"targetField":"installedQuantity","operation":"PIPELINE","parameters":{"steps":[{"op":"field","path":"/实装长度"},{"op":"stripSuffix","value":"米"},{"op":"decimal"}]},"conditions":[]}]',
   '[]', 'charging-transform-1', '[]', 1789862403000, 1789862403000);

INSERT OR REPLACE INTO configuration_trial
  (id, configuration_version_id, snapshot_id, execution_key, transformer_version, status, output_json, rule_results_json, issues_json, checks_json, gmt_create, gmt_modified)
VALUES
  ('ct-06-1', 'cfgv-06-1', 'snap-cfg-06-t1', 'exec-cfg-06-v1', 'charging-transformer-1.0', 'PASSED',
   '{"installedQuantity":"9.5"}',
   '[{"ruleId":"actual-length","status":"PASSED","inputReferences":["/rows/0/实装长度"],"outputReferences":["installedQuantity"],"issues":[]}]',
   '[]', '{"input_complete":true,"scope_valid":true,"rules_covered":true,"outputs_valid":true,"meanings_resolved":true}', 1789862405000, 1789862405000);

-- ========== 数据清理 ==========
-- 本域历史表受 DDL 触发器保护，禁止 DELETE/REPLACE；启用接口产生的决定/确认/结果/指针推进同样不可删。
-- 执行后重置本地库（重载各域 DDL + TC-CFG-SEED.sql）恢复基线。
-- 启用成功核验（应各返回 1）：
-- SELECT COUNT(*) FROM configuration_activation_result r JOIN configuration_enablement e ON e.id=r.enablement_id
--   WHERE e.configuration_version_id='cfgv-06-1' AND e.expected_active_version_id IS NULL AND r.outcome='APPLIED';
-- SELECT COUNT(*) FROM integration_config WHERE id='cfg-06' AND current_version_id='cfgv-06-1' AND row_version=2;
