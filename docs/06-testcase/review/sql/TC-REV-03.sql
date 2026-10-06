-- TC-REV-03.sql 费用依据核查（API）— PRD：05-subprd-installation-review.md §7 验收#3
-- 前置：已执行 TC-REV-SEED.sql

-- ============ 数据准备 ============
-- 尚澜府场景：费用相关差异仅有施工验收签字证据
INSERT INTO analysis_input_snapshot (analysis_generation, id, work_item_id, service_provider_id, expected_work_item_version, skill, skill_version, output_schema_version, config_versions_json, required_input_state, input_issues_json, input_item_count, content_sha256, gmt_create, gmt_modified)
VALUES (1, 'ais-rev03-g1', 'wi-rev-slf', 'sp-hongrun', 1, 'install-evidence-finder', '1.0.0', 'io-contract-1.0', '[]', 'INCOMPLETE', '["增量费用是否获批无适用依据"]', 3, 'sha-ais-rev03-g1', 1789920001400, 1789920001400);

INSERT INTO analysis_input_item (id, snapshot_id, input_key, input_kind, record_type, source_system, source_record_id, source_version, data_json, parsing_id, retrieved_at, gmt_create, gmt_modified) VALUES
('aii-rev03-plan', 'ais-rev03-g1', 'rec-plan-slf', 'RECORD', 'INSTALLATION_PLAN', 'jd-install-oms', 'PLAN-SLF-01', 'plan-v1', '{"items":[{"installationItem":"充电桩电缆敷设","plannedQuantity":12,"unit":"米","materialSupplier":"服务商","serviceScope":"车位线槽敷设"}]}', NULL, 1789920001400, 1789920001400, 1789920001400),
('aii-rev03-dtl',  'ais-rev03-g1', 'rec-dtl-slf',  'RECORD', 'INSTALLATION_DETAIL', 'jd-install-oms', 'DTL-SLF-01', 'dtl-v1', '{"items":[{"installationItem":"充电桩电缆敷设","installedQuantity":18,"unit":"米","materialSupplier":"服务商","serviceScope":"车位线槽敷设"}]}', NULL, 1789920001400, 1789920001400, 1789920001400),
('aii-rev03-parse','ais-rev03-g1', 'mp-yanshou-v1', 'PARSED_MATERIAL', NULL, NULL, NULL, NULL, NULL, 'mp-yanshou-v1', 1789920001400, 1789920001400, 1789920001400);

-- 施工事实 SUPPORTED（验收签字仅覆盖施工事实）；费用批准疑点保留在 openQuestions，不消除
INSERT INTO analysis_result (id, run_id, work_item_id, snapshot_id, profile_id, implementation_version, status, summary, findings_json, open_questions_json, validated_at, gmt_create, gmt_modified)
VALUES ('ar-rev03', 'run-ana-rev03', 'wi-rev-slf', 'ais-rev03-g1', 'profile-evidence-1', 'ief-1.0.0', 'NEEDS_INFORMATION',
 '增量 6 米施工事实有验收签字支持；增量费用是否获批无适用依据',
 '[{"findingId":"f-rev03-1","type":"EVIDENCE_CHECK","content":{"topic":"增量施工事实","explanation":"施工验收单签字证明增量 6 米实际施工事实","assessment":"SUPPORTED"},"evidenceRefs":[{"inputId":"mp-yanshou-v1","blockId":"b1","jsonPointer":null,"quote":"施工验收：电缆敷设 18 米，施工方签字确认"}]},{"findingId":"f-rev03-2","type":"EVIDENCE_CHECK","content":{"topic":"增量费用批准依据","explanation":"现有材料未见费用批准条款或批件","assessment":"INSUFFICIENT"},"evidenceRefs":[{"inputId":"mp-yanshou-v1","blockId":"b2","jsonPointer":null,"quote":null}]}]',
 '[{"questionId":"q-rev03-1","question":"增量 6 米对应额外费用是否已获批准？请补充适用计费条款或批件"}]',
 1789920001500, 1789920001500, 1789920001500);

UPDATE work_item SET current_analysis_result_id='ar-rev03' WHERE id='wi-rev-slf';

-- ============ 数据清理 ============
-- UPDATE work_item SET current_analysis_result_id=NULL WHERE id='wi-rev-slf';
-- DELETE FROM analysis_result WHERE id='ar-rev03';
-- DELETE FROM analysis_input_item WHERE snapshot_id='ais-rev03-g1';
-- DELETE FROM analysis_input_snapshot WHERE id='ais-rev03-g1';
