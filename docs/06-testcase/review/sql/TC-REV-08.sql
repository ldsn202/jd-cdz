-- TC-REV-08.sql 未决写入与幂等（API）— PRD：05-subprd-installation-review.md §7 验收#12
-- 前置：已执行 TC-REV-SEED.sql

-- ============ 数据准备 ============
-- 部分 a：春和庭存在未决写入（已受理的 REQUEST_SUPPLEMENT，外部执行 PROCESSING）
INSERT INTO analysis_input_snapshot (analysis_generation, id, work_item_id, service_provider_id, expected_work_item_version, skill, skill_version, output_schema_version, config_versions_json, required_input_state, input_issues_json, input_item_count, content_sha256, gmt_create, gmt_modified)
VALUES (1, 'ais-rev08-cht', 'wi-rev-cht', 'sp-hongrun', 1, 'install-evidence-finder', '1.0.0', 'io-contract-1.0', '[]', 'COMPLETE', '[]', 1, 'sha-ais-rev08-cht', 1789920002900, 1789920002900);
INSERT INTO analysis_input_item (id, snapshot_id, input_key, input_kind, record_type, source_system, source_record_id, source_version, data_json, parsing_id, retrieved_at, gmt_create, gmt_modified)
VALUES ('aii-rev08-cht-dtl', 'ais-rev08-cht', 'rec-dtl-cht', 'RECORD', 'INSTALLATION_DETAIL', 'jd-install-oms', 'DTL-CHT-01', 'dtl-v2', '{"items":[{"installationItem":"充电桩电缆敷设","installedQuantity":18,"unit":"米"}]}', NULL, 1789920002900, 1789920002900, 1789920002900);
INSERT INTO analysis_result (id, run_id, work_item_id, snapshot_id, profile_id, implementation_version, status, summary, findings_json, open_questions_json, validated_at, gmt_create, gmt_modified)
VALUES ('ar-rev08-cht', 'run-ana-rev08-cht', 'wi-rev-cht', 'ais-rev08-cht', 'profile-evidence-1', 'ief-1.0.0', 'NEEDS_INFORMATION', '增量原因依据不足', '[]', '[{"questionId":"q-rev08-1","question":"增量施工原因？"}]', 1789920002950, 1789920002950, 1789920002950);

INSERT INTO human_decision (id, work_item_id, service_provider_id, origin, action_type, request_key, actor_identity_id, identity_context_id, matched_grants_json, expected_work_item_version, expected_responsibility_version, analysis_result_id, confirmed_at, content_json, source_system, source_record_type, source_record_id, source_actor_ref_json, gmt_create, gmt_modified)
VALUES ('hd-rev08-pending', 'wi-rev-cht', 'sp-hongrun', 'LOCAL', 'REQUEST_SUPPLEMENT', 'rk-rev08-pending', 'idt-reviewer-li', 'ctx-rev08-li', '["grant-review-li"]', 1, 1, 'ar-rev08-cht', 1789920003000, '{"action":"REQUEST_SUPPLEMENT","questions":[{"findingId":null,"question":"增量施工原因？","requiredMaterialDescription":"变更确认记录"}]}', NULL, NULL, NULL, NULL, 1789920003000, 1789920003000);

INSERT INTO external_write_operation (id, human_decision_id, work_item_id, service_provider_id, installation_work_order_id, source_system, interface_kind, action, request_json, content_sha256, status, receipt_json, verified_at, row_version, gmt_create, gmt_modified)
VALUES ('ewo-rev08-pending', 'hd-rev08-pending', 'wi-rev-cht', 'sp-hongrun', 'wo-chunheting', 'jd-install-oms', 'REVIEW_SYNC', 'REQUEST_SUPPLEMENT', '{"decisionId":"hd-rev08-pending","action":"REQUEST_SUPPLEMENT"}', 'sha-ewo-rev08-pending', 'PROCESSING', NULL, NULL, 1, 1789920003000, 1789920003000);

UPDATE work_item SET current_analysis_result_id='ar-rev08-cht', pending_write_id='ewo-rev08-pending', status='PROCESSING', row_version=2 WHERE id='wi-rev-cht';

-- 部分 b：尚澜府用于幂等重放（当前有效分析，无未决写入）
INSERT INTO analysis_input_snapshot (analysis_generation, id, work_item_id, service_provider_id, expected_work_item_version, skill, skill_version, output_schema_version, config_versions_json, required_input_state, input_issues_json, input_item_count, content_sha256, gmt_create, gmt_modified)
VALUES (1, 'ais-rev08-slf', 'wi-rev-slf', 'sp-hongrun', 1, 'install-evidence-finder', '1.0.0', 'io-contract-1.0', '[]', 'COMPLETE', '[]', 1, 'sha-ais-rev08-slf', 1789920003100, 1789920003100);
INSERT INTO analysis_input_item (id, snapshot_id, input_key, input_kind, record_type, source_system, source_record_id, source_version, data_json, parsing_id, retrieved_at, gmt_create, gmt_modified)
VALUES ('aii-rev08-slf-dtl', 'ais-rev08-slf', 'rec-dtl-slf', 'RECORD', 'INSTALLATION_DETAIL', 'jd-install-oms', 'DTL-SLF-01', 'dtl-v1', '{"items":[{"installationItem":"充电桩电缆敷设","installedQuantity":18,"unit":"米"}]}', NULL, 1789920003100, 1789920003100, 1789920003100);
INSERT INTO analysis_result (id, run_id, work_item_id, snapshot_id, profile_id, implementation_version, status, summary, findings_json, open_questions_json, validated_at, gmt_create, gmt_modified)
VALUES ('ar-rev08-slf', 'run-ana-rev08-slf', 'wi-rev-slf', 'ais-rev08-slf', 'profile-evidence-1', 'ief-1.0.0', 'ANALYZED', '差异均有依据', '[{"findingId":"f-rev08-1","type":"EVIDENCE_CHECK","content":{"topic":"电缆敷设施工事实","explanation":"验收单支持 18 米施工事实","assessment":"SUPPORTED"},"evidenceRefs":[{"inputId":"mp-yanshou-v1","blockId":"b1","jsonPointer":null,"quote":"施工验收：电缆敷设 18 米，施工方签字确认"}]}]', '[]', 1789920003150, 1789920003150, 1789920003150);

UPDATE work_item SET current_analysis_result_id='ar-rev08-slf' WHERE id='wi-rev-slf';

-- ============ 数据清理 ============
-- UPDATE work_item SET status='READY', pending_write_id=NULL, row_version=1, current_analysis_result_id=NULL WHERE id='wi-rev-cht';
-- UPDATE work_item SET status='READY', pending_write_id=NULL, row_version=1, current_analysis_result_id=NULL WHERE id='wi-rev-slf';
-- DELETE FROM external_write_operation WHERE id='ewo-rev08-pending' OR work_item_id='wi-rev-slf';
-- DELETE FROM human_decision WHERE id='hd-rev08-pending' OR work_item_id='wi-rev-slf';
-- DELETE FROM analysis_result WHERE id IN ('ar-rev08-cht','ar-rev08-slf');
-- DELETE FROM analysis_input_item WHERE snapshot_id IN ('ais-rev08-cht','ais-rev08-slf');
-- DELETE FROM analysis_input_snapshot WHERE id IN ('ais-rev08-cht','ais-rev08-slf');
