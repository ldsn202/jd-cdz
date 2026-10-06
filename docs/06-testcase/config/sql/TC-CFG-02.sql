-- TC-CFG-02.sql 试转换 FAILED 禁止启用（旧配置保持有效）
-- 场景：cfg-02 已有生效版 cfgv-02-1；当前候选 cfgv-02-2 的试转换 ct-02-2 为 FAILED。
-- 写入顺序遵循 DDL 触发器：输入项→快照→分析结果→配置(rv=1,无指针)→事项→版本→试转换→决定→启用→结果→UPDATE 指针。
-- ========== 数据准备 ==========

INSERT OR REPLACE INTO integration_config
  (id, service_provider_id, source_system, purpose, business_scope_key, current_version_id, current_activation_result_id, row_version, gmt_create, gmt_modified)
VALUES
  ('cfg-02', 'sp-01', 'ANJIE-ERP', 'INSTALLATION', 'anjie-install-materials-ext', NULL, NULL, 1, 1789862400000, 1789862400000);

INSERT OR REPLACE INTO work_item
  (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, responsibility_version, row_version, analysis_generation, current_analysis_result_id, current_reconciliation_id, integration_config_id, current_configuration_version_id, active_supplement_request_id, pending_write_id, blocked_reason, completion_code, completion_basis_json, completion_decision_id, completed_at, gmt_create, gmt_modified)
VALUES
  ('wi-cfg-02', 'sp-01', NULL, 'CONFIGURATION', 'f1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9006',
   '["sp-01","CONFIGURATION","CONFIG_SCOPE","LOCAL","anjie-install-materials-ext","PROVIDER_FORMAT","ANJIE-ERP","AJ-FMT","ENABLE_CONFIGURATION"]',
   'cre-cfg-02-adjust-202609', '安捷充电-安装资料接入配置确认（扩展范围）', 'READY', 'identity-tester-01', 1, 3, 1, NULL, NULL, 'cfg-02', 'cfgv-02-2', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1789862400000, 1789866000000);

INSERT OR REPLACE INTO analysis_input_item
  (id, snapshot_id, input_key, input_kind, record_type, source_system, source_record_id, source_version, data_json, parsing_id, retrieved_at, gmt_create, gmt_modified)
VALUES
  ('item-cfg-02-0a', 'snap-cfg-02-0', 'AJ-REC-0002', 'RECORD', 'PROVIDER_RECORD', 'ANJIE-ERP', 'AJ-REC-0002', '2026.03', '{"rows":[{"敷设长度":"12.00米","单位":"米"}]}', NULL, 1789862400500, 1789862400500, 1789862400500);

INSERT OR REPLACE INTO analysis_input_snapshot
  (id, work_item_id, service_provider_id, expected_work_item_version, analysis_generation, skill, skill_version, output_schema_version, config_versions_json, required_input_state, input_issues_json, input_item_count, content_sha256, gmt_create, gmt_modified)
VALUES
  ('snap-cfg-02-0', 'wi-cfg-02', 'sp-01', 1, 1, 'INTEGRATION_CONFIGURATION', '1.0.0', '1.0.0', '[]', 'COMPLETE', '[]', 1, '80e6a684a3c222f7b46f55b2beebd262348904af004c80c4896afd386d0bc157', 1789862401000, 1789862401000);

INSERT OR REPLACE INTO analysis_result
  (id, run_id, work_item_id, snapshot_id, profile_id, implementation_version, status, summary, findings_json, open_questions_json, validated_at, gmt_create, gmt_modified)
VALUES
  ('ar-cfg-02-1', 'run-cfg-02-1', 'wi-cfg-02', 'snap-cfg-02-0', 'profile-provider-mapping-1', 'provider-mapping-config-1.0.0', 'ANALYZED', '已生成安装资料转换候选规则', '[]', '[]', 1789862402000, 1789862402000, 1789862402000);

INSERT OR REPLACE INTO integration_config_version
  (id, integration_config_id, work_item_id, version_no, parent_version_id, analysis_result_id, origin, editor_identity_id, save_key, format_status, source_format_id, source_format_version, applicability_json, rules_json, open_questions_json, rule_catalog_version, edit_notes_json, gmt_create, gmt_modified)
VALUES
  ('cfgv-02-1', 'cfg-02', 'wi-cfg-02', 1, NULL, 'ar-cfg-02-1', 'AI', NULL, 'save-cfg-02-v1', 'PROVIDED', 'AJ-FMT', '2026.03',
   '{"serviceProviderId":"sp-01","sourceSystem":"ANJIE-ERP","purpose":"INSTALLATION","businessScopeKey":"anjie-install-materials-ext","formatStatus":"PROVIDED","sourceFormatId":"AJ-FMT","sourceFormatVersion":"2026.03","rowPath":"/rows","conditions":[],"basisReferences":["item-cfg-02-0a"],"unknownConditions":[]}',
   '[{"ruleId":"actual-length","sourceFields":["/敷设长度"],"targetField":"installedQuantity","operation":"PIPELINE","parameters":{"steps":[{"op":"field","path":"/敷设长度"},{"op":"stripSuffix","value":"米"},{"op":"decimal"}]},"conditions":[]}]',
   '[]', 'charging-transform-1', '[]', 1789862403000, 1789862403000),
  ('cfgv-02-2', 'cfg-02', 'wi-cfg-02', 2, 'cfgv-02-1', 'ar-cfg-02-1', 'HUMAN', 'identity-tester-01', 'save-cfg-02-v2', 'PROVIDED', 'AJ-FMT', '2026.03',
   '{"serviceProviderId":"sp-01","sourceSystem":"ANJIE-ERP","purpose":"INSTALLATION","businessScopeKey":"anjie-install-materials-ext","formatStatus":"PROVIDED","sourceFormatId":"AJ-FMT","sourceFormatVersion":"2026.03","rowPath":"/rows","conditions":[],"basisReferences":["item-cfg-02-0a"],"unknownConditions":[]}',
   '[{"ruleId":"actual-length","sourceFields":["/敷设长度"],"targetField":"installedQuantity","operation":"PIPELINE","parameters":{"steps":[{"op":"field","path":"/敷设长度"},{"op":"stripSuffix","value":"米"},{"op":"decimal"},{"op":"scale","factor":"0.3048"}]},"conditions":[]}]',
   '[]', 'charging-transform-1',
   '[{"fieldPath":"rules[0].parameters.steps","before":"decimal 结束","after":"decimal 后追加 scale 0.3048","reason":"误将米按英尺换算，试转换将暴露单位冲突","basisReferences":["item-cfg-02-0a"]}]',
   1789866000000, 1789866000000);

-- 试转换固定输入：v1 的 PASSED 快照与 v2 的 FAILED 快照
INSERT OR REPLACE INTO analysis_input_item
  (id, snapshot_id, input_key, input_kind, record_type, source_system, source_record_id, source_version, data_json, parsing_id, retrieved_at, gmt_create, gmt_modified)
VALUES
  ('item-cfg-02-t1a', 'snap-cfg-02-t1', 'AJ-REC-0002', 'RECORD', 'PROVIDER_RECORD', 'ANJIE-ERP', 'AJ-REC-0002', '2026.03', '{"rows":[{"敷设长度":"12.00米","单位":"米"}]}', NULL, 1789862403500, 1789862403500, 1789862403500),
  ('item-cfg-02-t2a', 'snap-cfg-02-t2', 'AJ-REC-0002', 'RECORD', 'PROVIDER_RECORD', 'ANJIE-ERP', 'AJ-REC-0002', '2026.03', '{"rows":[{"敷设长度":"12.00米","单位":"米"}]}', NULL, 1789866000500, 1789866000500, 1789866000500);

INSERT OR REPLACE INTO analysis_input_snapshot
  (id, work_item_id, service_provider_id, expected_work_item_version, analysis_generation, skill, skill_version, output_schema_version, config_versions_json, required_input_state, input_issues_json, input_item_count, content_sha256, gmt_create, gmt_modified)
VALUES
  ('snap-cfg-02-t1', 'wi-cfg-02', 'sp-01', 1, 1, 'INTEGRATION_CONFIGURATION', '1.0.0', '1.0.0', '[{"configurationId":"cfg-02","configurationVersionId":"cfgv-02-1","usage":"TRIAL_CANDIDATE"}]', 'COMPLETE', '[]', 1, '80e6a684a3c222f7b46f55b2beebd262348904af004c80c4896afd386d0bc158', 1789862404000, 1789862404000),
  ('snap-cfg-02-t2', 'wi-cfg-02', 'sp-01', 3, 1, 'INTEGRATION_CONFIGURATION', '1.0.0', '1.0.0', '[{"configurationId":"cfg-02","configurationVersionId":"cfgv-02-2","usage":"TRIAL_CANDIDATE"}]', 'COMPLETE', '[]', 1, '80e6a684a3c222f7b46f55b2beebd262348904af004c80c4896afd386d0bc159', 1789866001000, 1789866001000);

INSERT OR REPLACE INTO configuration_trial
  (id, configuration_version_id, snapshot_id, execution_key, transformer_version, status, output_json, rule_results_json, issues_json, checks_json, gmt_create, gmt_modified)
VALUES
  ('ct-02-1', 'cfgv-02-1', 'snap-cfg-02-t1', 'exec-cfg-02-v1', 'charging-transformer-1.0', 'PASSED',
   '{"installedQuantity":"12"}',
   '[{"ruleId":"actual-length","status":"PASSED","inputReferences":["/rows/0/敷设长度"],"outputReferences":["installedQuantity"],"issues":[]}]',
   '[]', '{"input_complete":true,"scope_valid":true,"rules_covered":true,"outputs_valid":true,"meanings_resolved":true}', 1789862405000, 1789862405000),
  ('ct-02-2', 'cfgv-02-2', 'snap-cfg-02-t2', 'exec-cfg-02-v2', 'charging-transformer-1.0', 'FAILED',
   NULL,
   '[{"ruleId":"actual-length","status":"FAILED","inputReferences":["/rows/0/敷设长度"],"outputReferences":[],"issues":[{"code":"UNIT_CONFLICT","description":"输入单位为米，规则追加英尺换算比例，单位冲突"}]}]',
   '[{"code":"UNIT_CONFLICT","description":"输入单位为米，规则追加英尺换算比例，单位冲突"}]',
   '{"input_complete":true,"scope_valid":true,"rules_covered":true,"outputs_valid":false,"meanings_resolved":true}', 1789866002000, 1789866002000);

-- v1 的启用历史与指针切换（使 cfg-02 进入"已有生效版"状态）
INSERT OR REPLACE INTO human_decision
  (id, work_item_id, service_provider_id, origin, action_type, request_key, actor_identity_id, identity_context_id, matched_grants_json, expected_work_item_version, expected_responsibility_version, analysis_result_id, confirmed_at, content_json, source_system, source_record_type, source_record_id, source_actor_ref_json, gmt_create, gmt_modified)
VALUES
  ('hd-cfg-02-1', 'wi-cfg-02', 'sp-01', 'LOCAL', 'ENABLE_CONFIGURATION', 'req-cfg-02-enable-v1', 'identity-tester-01', 'ictx-tester-01', '["grant-cfg-02"]', 2, 1, NULL, 1789862405500, '{"candidateVersionId":"cfgv-02-1","trialId":"ct-02-1","comment":"含义已核实，试转换通过"}', NULL, NULL, NULL, NULL, 1789862405500, 1789862405500);

INSERT OR REPLACE INTO configuration_enablement
  (id, human_decision_id, configuration_version_id, trial_id, expected_config_version, expected_active_version_id, gmt_create, gmt_modified)
VALUES
  ('ce-02-1', 'hd-cfg-02-1', 'cfgv-02-1', 'ct-02-1', 1, NULL, 1789862406000, 1789862406000);

INSERT OR REPLACE INTO configuration_activation_result
  (id, enablement_id, outcome, reason_code, detail_json, gmt_create, gmt_modified)
VALUES
  ('car-02-1', 'ce-02-1', 'APPLIED', NULL, '{"checkedAt":1789862406000}', 1789862406000, 1789862406000);

UPDATE integration_config SET current_version_id='cfgv-02-1', current_activation_result_id='car-02-1', row_version=2, gmt_modified=1789862406000 WHERE id='cfg-02' AND row_version=1 AND current_version_id IS NULL;

-- ========== 数据清理 ==========
-- 本域历史表受 DDL 触发器保护，禁止 DELETE/REPLACE；执行后重置本地库（重载各域 DDL + TC-CFG-SEED.sql）恢复基线。
-- 残留核验（42201 后应无新增启用产物）：
-- SELECT COUNT(*) FROM configuration_enablement WHERE configuration_version_id='cfgv-02-2';
-- SELECT COUNT(*) FROM configuration_activation_result WHERE enablement_id IN (SELECT id FROM configuration_enablement WHERE configuration_version_id='cfgv-02-2');
-- SELECT current_version_id, row_version FROM integration_config WHERE id='cfg-02';
