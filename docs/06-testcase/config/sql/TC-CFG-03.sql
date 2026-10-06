-- TC-CFG-03.sql 试转换 NEEDS_INFORMATION / 尚无终态记录禁止启用
-- 场景 A：cfg-03 无生效版，候选 cfgv-03-1 的试转换 ct-03-1 为 NEEDS_INFORMATION。
-- 场景 B：cfg-04 无生效版，候选 cfgv-04-1 已保存但无任何试转换终态记录（后台执行中）。
-- ========== 数据准备 ==========

INSERT OR REPLACE INTO integration_config
  (id, service_provider_id, source_system, purpose, business_scope_key, current_version_id, current_activation_result_id, row_version, gmt_create, gmt_modified)
VALUES
  ('cfg-03', 'sp-01', 'ANJIE-ERP', 'INSTALLATION', 'anjie-install-scope-c', NULL, NULL, 1, 1789862400000, 1789862400000),
  ('cfg-04', 'sp-01', 'ANJIE-ERP', 'INSTALLATION', 'anjie-install-scope-d', NULL, NULL, 1, 1789862400000, 1789862400000);

INSERT OR REPLACE INTO work_item
  (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, responsibility_version, row_version, analysis_generation, current_analysis_result_id, current_reconciliation_id, integration_config_id, current_configuration_version_id, active_supplement_request_id, pending_write_id, blocked_reason, completion_code, completion_basis_json, completion_decision_id, completed_at, gmt_create, gmt_modified)
VALUES
  ('wi-cfg-03', 'sp-01', NULL, 'CONFIGURATION', '03b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9009',
   '["sp-01","CONFIGURATION","CONFIG_SCOPE","LOCAL","anjie-install-scope-c","PROVIDER_FORMAT","ANJIE-ERP","AJ-FMT","ENABLE_CONFIGURATION"]',
   'cre-cfg-03-new-202609', '安捷充电-安装资料接入配置确认（范围C）', 'READY', 'identity-tester-01', 1, 2, 1, NULL, NULL, 'cfg-03', 'cfgv-03-1', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1789862400000, 1789866000000),
  ('wi-cfg-04', 'sp-01', NULL, 'CONFIGURATION', '04b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9010',
   '["sp-01","CONFIGURATION","CONFIG_SCOPE","LOCAL","anjie-install-scope-d","PROVIDER_FORMAT","ANJIE-ERP","AJ-FMT","ENABLE_CONFIGURATION"]',
   'cre-cfg-04-new-202609', '安捷充电-安装资料接入配置确认（范围D）', 'READY', 'identity-tester-01', 1, 2, 1, NULL, NULL, 'cfg-04', 'cfgv-04-1', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1789862400000, 1789866000000);

INSERT OR REPLACE INTO analysis_input_item
  (id, snapshot_id, input_key, input_kind, record_type, source_system, source_record_id, source_version, data_json, parsing_id, retrieved_at, gmt_create, gmt_modified)
VALUES
  ('item-cfg-03-0a', 'snap-cfg-03-0', 'AJ-REC-0003', 'RECORD', 'PROVIDER_RECORD', 'ANJIE-ERP', 'AJ-REC-0003', '2026.03', '{"rows":[{"数量":"5"}]}', NULL, 1789862400500, 1789862400500, 1789862400500),
  ('item-cfg-04-0a', 'snap-cfg-04-0', 'AJ-REC-0004', 'RECORD', 'PROVIDER_RECORD', 'ANJIE-ERP', 'AJ-REC-0004', '2026.03', '{"rows":[{"实装长度":"7.25米"}]}', NULL, 1789862400500, 1789862400500, 1789862400500);

INSERT OR REPLACE INTO analysis_input_snapshot
  (id, work_item_id, service_provider_id, expected_work_item_version, analysis_generation, skill, skill_version, output_schema_version, config_versions_json, required_input_state, input_issues_json, input_item_count, content_sha256, gmt_create, gmt_modified)
VALUES
  ('snap-cfg-03-0', 'wi-cfg-03', 'sp-01', 1, 1, 'INTEGRATION_CONFIGURATION', '1.0.0', '1.0.0', '[]', 'COMPLETE', '[]', 1, '8742e887f1a3a36f67ac92b0bc3d58f55e2d148c70fcacdf33f7174a04ffff6c', 1789862401000, 1789862401000),
  ('snap-cfg-04-0', 'wi-cfg-04', 'sp-01', 1, 1, 'INTEGRATION_CONFIGURATION', '1.0.0', '1.0.0', '[]', 'COMPLETE', '[]', 1, 'e92737c70d4915be205e6d71870a08f0afff2084c0bb4221bd02b5acce7e0d2f', 1789862401000, 1789862401000);

INSERT OR REPLACE INTO analysis_result
  (id, run_id, work_item_id, snapshot_id, profile_id, implementation_version, status, summary, findings_json, open_questions_json, validated_at, gmt_create, gmt_modified)
VALUES
  ('ar-cfg-03-1', 'run-cfg-03-1', 'wi-cfg-03', 'snap-cfg-03-0', 'profile-provider-mapping-1', 'provider-mapping-config-1.0.0', 'ANALYZED', '已生成安装资料转换候选规则', '[]', '[]', 1789862402000, 1789862402000, 1789862402000),
  ('ar-cfg-04-1', 'run-cfg-04-1', 'wi-cfg-04', 'snap-cfg-04-0', 'profile-provider-mapping-1', 'provider-mapping-config-1.0.0', 'ANALYZED', '已生成安装资料转换候选规则', '[]', '[]', 1789862402000, 1789862402000, 1789862402000);

INSERT OR REPLACE INTO integration_config_version
  (id, integration_config_id, work_item_id, version_no, parent_version_id, analysis_result_id, origin, editor_identity_id, save_key, format_status, source_format_id, source_format_version, applicability_json, rules_json, open_questions_json, rule_catalog_version, edit_notes_json, gmt_create, gmt_modified)
VALUES
  ('cfgv-03-1', 'cfg-03', 'wi-cfg-03', 1, NULL, 'ar-cfg-03-1', 'AI', NULL, 'save-cfg-03-v1', 'PROVIDED', 'AJ-FMT', '2026.03',
   '{"serviceProviderId":"sp-01","sourceSystem":"ANJIE-ERP","purpose":"INSTALLATION","businessScopeKey":"anjie-install-scope-c","formatStatus":"PROVIDED","sourceFormatId":"AJ-FMT","sourceFormatVersion":"2026.03","rowPath":"/rows","conditions":[],"basisReferences":["item-cfg-03-0a"],"unknownConditions":["数量含义"]}',
   '[{"ruleId":"actual-length","sourceFields":["/数量"],"targetField":"installedQuantity","operation":"PIPELINE","parameters":{"steps":[{"op":"field","path":"/数量"},{"op":"decimal"}]},"conditions":[]}]',
   '[]', 'charging-transform-1', '[]', 1789862403000, 1789862403000),
  ('cfgv-04-1', 'cfg-04', 'wi-cfg-04', 1, NULL, 'ar-cfg-04-1', 'AI', NULL, 'save-cfg-04-v1', 'PROVIDED', 'AJ-FMT', '2026.03',
   '{"serviceProviderId":"sp-01","sourceSystem":"ANJIE-ERP","purpose":"INSTALLATION","businessScopeKey":"anjie-install-scope-d","formatStatus":"PROVIDED","sourceFormatId":"AJ-FMT","sourceFormatVersion":"2026.03","rowPath":"/rows","conditions":[],"basisReferences":["item-cfg-04-0a"],"unknownConditions":[]}',
   '[{"ruleId":"actual-length","sourceFields":["/实装长度"],"targetField":"installedQuantity","operation":"PIPELINE","parameters":{"steps":[{"op":"field","path":"/实装长度"},{"op":"stripSuffix","value":"米"},{"op":"decimal"}]},"conditions":[]}]',
   '[]', 'charging-transform-1', '[]', 1789862403000, 1789862403000);

-- 场景 A：NEEDS_INFORMATION 终态；"数量"含义不清，不能猜成 installedQuantity（先输入项、后快照、再试转换）
INSERT OR REPLACE INTO analysis_input_item
  (id, snapshot_id, input_key, input_kind, record_type, source_system, source_record_id, source_version, data_json, parsing_id, retrieved_at, gmt_create, gmt_modified)
VALUES
  ('item-cfg-03-t1a', 'snap-cfg-03-t1', 'AJ-REC-0003', 'RECORD', 'PROVIDER_RECORD', 'ANJIE-ERP', 'AJ-REC-0003', '2026.03', '{"rows":[{"数量":"5"}]}', NULL, 1789862403500, 1789862403500, 1789862403500);

INSERT OR REPLACE INTO analysis_input_snapshot
  (id, work_item_id, service_provider_id, expected_work_item_version, analysis_generation, skill, skill_version, output_schema_version, config_versions_json, required_input_state, input_issues_json, input_item_count, content_sha256, gmt_create, gmt_modified)
VALUES
  ('snap-cfg-03-t1', 'wi-cfg-03', 'sp-01', 1, 1, 'INTEGRATION_CONFIGURATION', '1.0.0', '1.0.0', '[{"configurationId":"cfg-03","configurationVersionId":"cfgv-03-1","usage":"TRIAL_CANDIDATE"}]', 'COMPLETE', '[]', 1, '8742e887f1a3a36f67ac92b0bc3d58f55e2d148c70fcacdf33f7174a04ffff6d', 1789862404000, 1789862404000);

INSERT OR REPLACE INTO configuration_trial
  (id, configuration_version_id, snapshot_id, execution_key, transformer_version, status, output_json, rule_results_json, issues_json, checks_json, gmt_create, gmt_modified)
VALUES
  ('ct-03-1', 'cfgv-03-1', 'snap-cfg-03-t1', 'exec-cfg-03-v1', 'charging-transformer-1.0', 'NEEDS_INFORMATION',
   NULL,
   '[{"ruleId":"actual-length","status":"NOT_EXECUTED","inputReferences":["/rows/0/数量"],"outputReferences":[],"issues":[{"code":"MEANING_UNRESOLVED","description":"原字段「数量」无定义，不能确认为实际安装数量"}]}]',
   '[{"code":"MEANING_UNRESOLVED","description":"原字段「数量」无定义，不能确认为实际安装数量"}]',
   '{"input_complete":true,"scope_valid":true,"rules_covered":false,"outputs_valid":false,"meanings_resolved":false}', 1789862405000, 1789862405000);
-- 场景 B：cfgv-04-1 不插入任何 configuration_trial 记录（后台执行中，运行中不插终态）

-- ========== 数据清理 ==========
-- 本域历史表受 DDL 触发器保护，禁止 DELETE/REPLACE；执行后重置本地库（重载各域 DDL + TC-CFG-SEED.sql）恢复基线。
-- 残留核验（两次 42201 后应无启用产物、无生效指针）：
-- SELECT COUNT(*) FROM configuration_enablement WHERE configuration_version_id IN ('cfgv-03-1','cfgv-04-1');
-- SELECT id, current_version_id, row_version FROM integration_config WHERE id IN ('cfg-03','cfg-04');
