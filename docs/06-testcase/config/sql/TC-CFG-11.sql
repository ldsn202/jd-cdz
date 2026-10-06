-- TC-CFG-11.sql 接入事项列表渲染（2 条配置事项）
-- 场景：wi-cfg-01（SEED，补一份已发布分析 → analysisStatus=AVAILABLE）+ wi-cfg-11b（无分析结果 → NOT_READY）。
-- ========== 数据准备 ==========

INSERT OR REPLACE INTO analysis_input_item
  (id, snapshot_id, input_key, input_kind, record_type, source_system, source_record_id, source_version, data_json, parsing_id, retrieved_at, gmt_create, gmt_modified)
VALUES
  ('item-cfg-11-aa', 'snap-cfg-11-a', 'AJ-REC-0011', 'RECORD', 'PROVIDER_RECORD', 'ANJIE-ERP', 'AJ-REC-0011', '2026.03', '{"rows":[{"实装长度":"１８.５０米","单位":"m"}]}', NULL, 1789869600500, 1789869600500, 1789869600500);

INSERT OR REPLACE INTO analysis_input_snapshot
  (id, work_item_id, service_provider_id, expected_work_item_version, analysis_generation, skill, skill_version, output_schema_version, config_versions_json, required_input_state, input_issues_json, input_item_count, content_sha256, gmt_create, gmt_modified)
VALUES
  ('snap-cfg-11-a', 'wi-cfg-01', 'sp-01', 3, 1, 'INTEGRATION_CONFIGURATION', '1.0.0', '1.0.0', '[]', 'COMPLETE', '[]', 1, '5d43fd24521c5033b3b216b39202d69013a1f47d1e83866876c3b474388230e9', 1789869601000, 1789869601000);

INSERT OR REPLACE INTO analysis_result
  (id, run_id, work_item_id, snapshot_id, profile_id, implementation_version, status, summary, findings_json, open_questions_json, validated_at, gmt_create, gmt_modified)
VALUES
  ('ar-cfg-11-1', 'run-cfg-11-1', 'wi-cfg-01', 'snap-cfg-11-a', 'profile-provider-mapping-1', 'provider-mapping-config-1.0.0', 'ANALYZED', '候选配置分析完成', '[]', '[]', 1789869602000, 1789869602000, 1789869602000);

UPDATE work_item SET current_analysis_result_id='ar-cfg-11-1', row_version=4, gmt_modified=1789869602000 WHERE id='wi-cfg-01' AND row_version=3;

INSERT OR REPLACE INTO work_item
  (id, service_provider_id, installation_work_order_id, item_kind, business_key, business_identity_json, creation_key, title, status, assignee_identity_id, responsibility_version, row_version, analysis_generation, current_analysis_result_id, current_reconciliation_id, integration_config_id, current_configuration_version_id, active_supplement_request_id, pending_write_id, blocked_reason, completion_code, completion_basis_json, completion_decision_id, completed_at, gmt_create, gmt_modified)
VALUES
  ('wi-cfg-11b', 'sp-01', NULL, 'CONFIGURATION', '12b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9018',
   '["sp-01","CONFIGURATION","CONFIG_SCOPE","LOCAL","anjie-billing-scope","PROVIDER_FORMAT","ANJIE-ERP","AJ-FMT","ENABLE_CONFIGURATION"]',
   'cre-cfg-11b-new-202609', '安捷充电-费用项目对应接入配置确认', 'PREPARING', 'identity-tester-01', 1, 1, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1789873200000, 1789873200000);

-- ========== 数据清理 ==========
-- 本域历史表受 DDL 触发器保护，禁止 DELETE/REPLACE；执行后重置本地库（重载各域 DDL + TC-CFG-SEED.sql）恢复基线。
