-- TC-REV-16.sql 202 受理与决定进展（UI）— PRD：05-subprd-installation-review.md §7 验收#6
-- 前置：已执行 TC-REV-SEED.sql
-- 数据与 TC-REV-04 相同；若两用例接连执行，先运行 TC-REV-04.sql 的数据清理段

-- ============ 数据准备 ============
INSERT INTO analysis_input_snapshot (analysis_generation, id, work_item_id, service_provider_id, expected_work_item_version, skill, skill_version, output_schema_version, config_versions_json, required_input_state, input_issues_json, input_item_count, content_sha256, gmt_create, gmt_modified)
VALUES (1, 'ais-rev04-g1', 'wi-rev-cht', 'sp-hongrun', 1, 'install-evidence-finder', '1.0.0', 'io-contract-1.0', '[]', 'COMPLETE', '[]', 3, 'sha-ais-rev04-g1', 1789920001600, 1789920001600);

INSERT INTO analysis_input_item (id, snapshot_id, input_key, input_kind, record_type, source_system, source_record_id, source_version, data_json, parsing_id, retrieved_at, gmt_create, gmt_modified) VALUES
('aii-rev04-plan', 'ais-rev04-g1', 'rec-plan-cht', 'RECORD', 'INSTALLATION_PLAN', 'jd-install-oms', 'PLAN-CHT-01', 'plan-v3', '{"items":[{"installationItem":"充电桩电缆敷设","plannedQuantity":12,"unit":"米","materialSupplier":"服务商","serviceScope":"车位线槽敷设"}]}', NULL, 1789920001600, 1789920001600, 1789920001600),
('aii-rev04-dtl',  'ais-rev04-g1', 'rec-dtl-cht',  'RECORD', 'INSTALLATION_DETAIL', 'jd-install-oms', 'DTL-CHT-01', 'dtl-v2', '{"items":[{"installationItem":"充电桩电缆敷设","installedQuantity":18,"unit":"米","materialSupplier":"服务商","serviceScope":"车位线槽敷设"}]}', NULL, 1789920001600, 1789920001600, 1789920001600),
('aii-rev04-parse','ais-rev04-g1', 'mp-yanshou-v1', 'PARSED_MATERIAL', NULL, NULL, NULL, NULL, NULL, 'mp-yanshou-v1', 1789920001600, 1789920001600, 1789920001600);

INSERT INTO analysis_result (id, run_id, work_item_id, snapshot_id, profile_id, implementation_version, status, summary, findings_json, open_questions_json, validated_at, gmt_create, gmt_modified)
VALUES ('ar-rev04', 'run-ana-rev04', 'wi-rev-cht', 'ais-rev04-g1', 'profile-evidence-1', 'ief-1.0.0', 'ANALYZED',
 '差异均有依据：增量 6 米有验收签字与变更确认',
 '[{"findingId":"f-rev04-1","type":"EVIDENCE_CHECK","content":{"topic":"电缆敷设施工事实","explanation":"施工验收单记载 18 米并有施工方签字","assessment":"SUPPORTED"},"evidenceRefs":[{"inputId":"mp-yanshou-v1","blockId":"b1","jsonPointer":null,"quote":"施工验收：电缆敷设 18 米，施工方签字确认"}]}]',
 '[]',
 1789920001700, 1789920001700, 1789920001700);

UPDATE work_item SET current_analysis_result_id='ar-rev04' WHERE id='wi-rev-cht';

-- ============ 【mock 替代段】步骤 3：通过源端 SUCCEEDED 且本地接续完成（事项以 REVIEW_APPROVED 完成） ============
-- UPDATE external_write_operation SET status='SUCCEEDED', receipt_json='{"accepted":true,"externalReceiptId":"ext-rcpt-rev16"}', verified_at=1789920003600, row_version=row_version+1 WHERE id='<步骤1返回的operationId>';
-- UPDATE work_item SET status='COMPLETED', pending_write_id=NULL, completion_code='REVIEW_APPROVED',
--   completion_basis_json='{"resultType":"EXTERNAL_WRITE_SUCCEEDED","operationId":"<步骤1返回的operationId>","decisionId":"<步骤1返回的decisionId>","verifiedAt":1789920003600}',
--   completion_decision_id='<步骤1返回的decisionId>', completed_at=1789920003600, row_version=row_version+1 WHERE id='wi-rev-cht';

-- ============ 数据清理 ============
-- UPDATE work_item SET status='READY', pending_write_id=NULL, row_version=1, current_analysis_result_id=NULL, completion_code=NULL, completion_basis_json=NULL, completion_decision_id=NULL, completed_at=NULL WHERE id='wi-rev-cht';
-- DELETE FROM external_write_operation WHERE work_item_id='wi-rev-cht';
-- DELETE FROM human_decision WHERE work_item_id='wi-rev-cht';
-- DELETE FROM analysis_result WHERE id='ar-rev04';
-- DELETE FROM analysis_input_item WHERE snapshot_id='ais-rev04-g1';
-- DELETE FROM analysis_input_snapshot WHERE id='ais-rev04-g1';
