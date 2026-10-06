-- TC-REV-11.sql 差异与证据区渲染（UI）— PRD：05-subprd-installation-review.md §7 验收#1
-- 前置：已执行 TC-REV-SEED.sql
-- 数据与 TC-REV-01 相同；若两用例接连执行，先运行 TC-REV-01.sql 的数据清理段

-- ============ 数据准备 ============
INSERT INTO analysis_input_snapshot (analysis_generation, id, work_item_id, service_provider_id, expected_work_item_version, skill, skill_version, output_schema_version, config_versions_json, required_input_state, input_issues_json, input_item_count, content_sha256, gmt_create, gmt_modified)
VALUES (1, 'ais-rev01-g1', 'wi-rev-cht', 'sp-hongrun', 1, 'install-evidence-finder', '1.0.0', 'io-contract-1.0', '[]', 'COMPLETE', '[]', 3, 'sha-ais-rev01-g1', 1789920001000, 1789920001000);

INSERT INTO analysis_input_item (id, snapshot_id, input_key, input_kind, record_type, source_system, source_record_id, source_version, data_json, parsing_id, retrieved_at, gmt_create, gmt_modified) VALUES
('aii-rev01-plan', 'ais-rev01-g1', 'rec-plan-cht', 'RECORD', 'INSTALLATION_PLAN', 'jd-install-oms', 'PLAN-CHT-01', 'plan-v3', '{"items":[{"installationItem":"充电桩电缆敷设","plannedQuantity":12,"unit":"米","materialSupplier":"服务商","serviceScope":"车位线槽敷设"}]}', NULL, 1789920001000, 1789920001000, 1789920001000),
('aii-rev01-dtl',  'ais-rev01-g1', 'rec-dtl-cht',  'RECORD', 'INSTALLATION_DETAIL', 'jd-install-oms', 'DTL-CHT-01', 'dtl-v2', '{"items":[{"installationItem":"充电桩电缆敷设","installedQuantity":18,"unit":"米","materialSupplier":"服务商","serviceScope":"车位线槽敷设"}]}', NULL, 1789920001000, 1789920001000, 1789920001000),
('aii-rev01-parse','ais-rev01-g1', 'mp-yanshou-v1', 'PARSED_MATERIAL', NULL, NULL, NULL, NULL, NULL, 'mp-yanshou-v1', 1789920001000, 1789920001000, 1789920001000);

INSERT INTO analysis_result (id, run_id, work_item_id, snapshot_id, profile_id, implementation_version, status, summary, findings_json, open_questions_json, validated_at, gmt_create, gmt_modified)
VALUES ('ar-rev01', 'run-ana-rev01', 'wi-rev-cht', 'ais-rev01-g1', 'profile-evidence-1', 'ief-1.0.0', 'NEEDS_INFORMATION',
 '方案 12 米与明细 18 米数量不一致；施工事实有验收单支持；增量原因依据不足',
 '[{"findingId":"f-rev01-1","type":"EVIDENCE_CHECK","content":{"topic":"电缆敷设施工事实","explanation":"施工验收单记载 18 米并有施工方签字","assessment":"SUPPORTED"},"evidenceRefs":[{"inputId":"mp-yanshou-v1","blockId":"b1","jsonPointer":null,"quote":"施工验收：电缆敷设 18 米，施工方签字确认"}]},{"findingId":"f-rev01-2","type":"EVIDENCE_CHECK","content":{"topic":"方案与明细数量一致性","explanation":"方案 12 米、明细 18 米，两者明确不一致","assessment":"CONFLICTING"},"evidenceRefs":[{"inputId":"rec-plan-cht","blockId":null,"jsonPointer":"/items/0/plannedQuantity","quote":"12"},{"inputId":"rec-dtl-cht","blockId":null,"jsonPointer":"/items/0/installedQuantity","quote":"18"}]},{"findingId":"f-rev01-3","type":"EVIDENCE_CHECK","content":{"topic":"增量原因确认","explanation":"现场照片为疑似签字，文字不可辨识","assessment":"INSUFFICIENT"},"evidenceRefs":[{"inputId":"mp-yanshou-v1","blockId":"b2","jsonPointer":null,"quote":null}]}]',
 '[{"questionId":"q-rev01-1","question":"增量 6 米的施工原因与变更确认依据是什么？"}]',
 1789920001100, 1789920001100, 1789920001100);

UPDATE work_item SET current_analysis_result_id='ar-rev01' WHERE id='wi-rev-cht';

-- ============ 数据清理 ============
-- UPDATE work_item SET current_analysis_result_id=NULL WHERE id='wi-rev-cht';
-- DELETE FROM analysis_result WHERE id='ar-rev01';
-- DELETE FROM analysis_input_item WHERE snapshot_id='ais-rev01-g1';
-- DELETE FROM analysis_input_snapshot WHERE id='ais-rev01-g1';
