-- TC-REV-06.sql 过期分析结果被拒（API）— PRD：05-subprd-installation-review.md §7 验收#9
-- 前置：已执行 TC-REV-SEED.sql

-- ============ 数据准备 ============
-- 事项当前为第 2 代次（回复成功后代次递增），当前结果为 g2 快照的 ar-rev06-cur；
-- ar-rev06-old 为 g1 旧代次已采用历史结果（提交时应被拒）
INSERT INTO analysis_input_snapshot (analysis_generation, id, work_item_id, service_provider_id, expected_work_item_version, skill, skill_version, output_schema_version, config_versions_json, required_input_state, input_issues_json, input_item_count, content_sha256, gmt_create, gmt_modified) VALUES
(1, 'ais-rev06-g1', 'wi-rev-cht', 'sp-hongrun', 1, 'install-evidence-finder', '1.0.0', 'io-contract-1.0', '[]', 'COMPLETE', '[]', 1, 'sha-ais-rev06-g1', 1789920002500, 1789920002500),
(2, 'ais-rev06-g2', 'wi-rev-cht', 'sp-hongrun', 2, 'install-evidence-finder', '1.0.0', 'io-contract-1.0', '[]', 'COMPLETE', '[]', 1, 'sha-ais-rev06-g2', 1789920002600, 1789920002600);

INSERT INTO analysis_input_item (id, snapshot_id, input_key, input_kind, record_type, source_system, source_record_id, source_version, data_json, parsing_id, retrieved_at, gmt_create, gmt_modified) VALUES
('aii-rev06-g1-dtl', 'ais-rev06-g1', 'rec-dtl-cht', 'RECORD', 'INSTALLATION_DETAIL', 'jd-install-oms', 'DTL-CHT-01', 'dtl-v1', '{"items":[{"installationItem":"充电桩电缆敷设","installedQuantity":18,"unit":"米"}]}', NULL, 1789920002500, 1789920002500, 1789920002500),
('aii-rev06-g2-dtl', 'ais-rev06-g2', 'rec-dtl-cht', 'RECORD', 'INSTALLATION_DETAIL', 'jd-install-oms', 'DTL-CHT-01', 'dtl-v2', '{"items":[{"installationItem":"充电桩电缆敷设","installedQuantity":18,"unit":"米"}]}', NULL, 1789920002600, 1789920002600, 1789920002600);

INSERT INTO analysis_result (id, run_id, work_item_id, snapshot_id, profile_id, implementation_version, status, summary, findings_json, open_questions_json, validated_at, gmt_create, gmt_modified) VALUES
('ar-rev06-old', 'run-ana-rev06-old', 'wi-rev-cht', 'ais-rev06-g1', 'profile-evidence-1', 'ief-1.0.0', 'ANALYZED', '第 1 代次旧分析结果', '[]', '[]', 1789920002550, 1789920002550, 1789920002550),
('ar-rev06-cur', 'run-ana-rev06-cur', 'wi-rev-cht', 'ais-rev06-g2', 'profile-evidence-1', 'ief-1.0.0', 'ANALYZED', '第 2 代次当前分析结果：差异均有依据', '[{"findingId":"f-rev06-1","type":"EVIDENCE_CHECK","content":{"topic":"电缆敷设施工事实","explanation":"验收单支持 18 米施工事实","assessment":"SUPPORTED"},"evidenceRefs":[{"inputId":"mp-yanshou-v1","blockId":"b1","jsonPointer":null,"quote":"施工验收：电缆敷设 18 米，施工方签字确认"}]}]', '[]', 1789920002650, 1789920002650, 1789920002650);

UPDATE work_item SET analysis_generation=2, current_analysis_result_id='ar-rev06-cur', row_version=2 WHERE id='wi-rev-cht';

-- ============ 数据清理 ============
-- UPDATE work_item SET analysis_generation=1, current_analysis_result_id=NULL, row_version=1 WHERE id='wi-rev-cht';
-- DELETE FROM analysis_result WHERE id IN ('ar-rev06-old','ar-rev06-cur');
-- DELETE FROM analysis_input_item WHERE snapshot_id IN ('ais-rev06-g1','ais-rev06-g2');
-- DELETE FROM analysis_input_snapshot WHERE id IN ('ais-rev06-g1','ais-rev06-g2');
-- DELETE FROM human_decision WHERE work_item_id='wi-rev-cht' AND request_key LIKE '%rev06%';
