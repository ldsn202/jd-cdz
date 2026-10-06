-- TC-REV-02.sql 证据缺项如实展示（API）— PRD：05-subprd-installation-review.md §7 验收#2
-- 前置：已执行 TC-REV-SEED.sql

-- ============ 数据准备 ============
-- 必需输入不足的快照：required_input_state=INCOMPLETE，input_issues 列明缺口
INSERT INTO analysis_input_snapshot (analysis_generation, id, work_item_id, service_provider_id, expected_work_item_version, skill, skill_version, output_schema_version, config_versions_json, required_input_state, input_issues_json, input_item_count, content_sha256, gmt_create, gmt_modified)
VALUES (1, 'ais-rev02-g1', 'wi-rev-cht', 'sp-hongrun', 1, 'install-evidence-finder', '1.0.0', 'io-contract-1.0', '[]', 'INCOMPLETE', '["缺少增量施工变更确认记录","现场照片不可辨识"]', 2, 'sha-ais-rev02-g1', 1789920001200, 1789920001200);

INSERT INTO analysis_input_item (id, snapshot_id, input_key, input_kind, record_type, source_system, source_record_id, source_version, data_json, parsing_id, retrieved_at, gmt_create, gmt_modified) VALUES
('aii-rev02-plan', 'ais-rev02-g1', 'rec-plan-cht', 'RECORD', 'INSTALLATION_PLAN', 'jd-install-oms', 'PLAN-CHT-01', 'plan-v3', '{"items":[{"installationItem":"充电桩电缆敷设","plannedQuantity":12,"unit":"米","materialSupplier":"服务商","serviceScope":"车位线槽敷设"}]}', NULL, 1789920001200, 1789920001200, 1789920001200),
('aii-rev02-dtl',  'ais-rev02-g1', 'rec-dtl-cht',  'RECORD', 'INSTALLATION_DETAIL', 'jd-install-oms', 'DTL-CHT-01', 'dtl-v2', '{"items":[{"installationItem":"充电桩电缆敷设","installedQuantity":18,"unit":"米","materialSupplier":"服务商","serviceScope":"车位线槽敷设"}]}', NULL, 1789920001200, 1789920001200, 1789920001200);

-- NEEDS_INFORMATION：findings 为空数组，openQuestions 恰 2 条（PRD §7#2 输入条件）
INSERT INTO analysis_result (id, run_id, work_item_id, snapshot_id, profile_id, implementation_version, status, summary, findings_json, open_questions_json, validated_at, gmt_create, gmt_modified)
VALUES ('ar-rev02', 'run-ana-rev02', 'wi-rev-cht', 'ais-rev02-g1', 'profile-evidence-1', 'ief-1.0.0', 'NEEDS_INFORMATION',
 '现有材料无法判断增量施工原因与确认依据',
 '[]',
 '[{"questionId":"q-rev02-1","question":"需补充增量施工变更确认记录"},{"questionId":"q-rev02-2","question":"需补充可辨识的现场签字照片或实际确认记录"}]',
 1789920001300, 1789920001300, 1789920001300);

UPDATE work_item SET current_analysis_result_id='ar-rev02' WHERE id='wi-rev-cht';

-- ============ 数据清理 ============
-- UPDATE work_item SET current_analysis_result_id=NULL WHERE id='wi-rev-cht';
-- DELETE FROM analysis_result WHERE id='ar-rev02';
-- DELETE FROM analysis_input_item WHERE snapshot_id='ais-rev02-g1';
-- DELETE FROM analysis_input_snapshot WHERE id='ais-rev02-g1';
