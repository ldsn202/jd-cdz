-- TC-REV-07.sql 无权限/非责任人决定被拒（API 决策表）— PRD：05-subprd-installation-review.md §7 验收#11
-- 前置：已执行 TC-REV-SEED.sql

-- ============ 数据准备 ============
-- 春和庭、尚澜府各挂一份当前有效分析（APPROVE 前置），另建一份待分配事项（行 c 用）
INSERT INTO analysis_input_snapshot (analysis_generation, id, work_item_id, service_provider_id, expected_work_item_version, skill, skill_version, output_schema_version, config_versions_json, required_input_state, input_issues_json, input_item_count, content_sha256, gmt_create, gmt_modified) VALUES
(1, 'ais-rev07-cht', 'wi-rev-cht', 'sp-hongrun', 1, 'install-evidence-finder', '1.0.0', 'io-contract-1.0', '[]', 'COMPLETE', '[]', 1, 'sha-ais-rev07-cht', 1789920002700, 1789920002700),
(1, 'ais-rev07-slf', 'wi-rev-slf', 'sp-hongrun', 1, 'install-evidence-finder', '1.0.0', 'io-contract-1.0', '[]', 'COMPLETE', '[]', 1, 'sha-ais-rev07-slf', 1789920002700, 1789920002700);

INSERT INTO analysis_input_item (id, snapshot_id, input_key, input_kind, record_type, source_system, source_record_id, source_version, data_json, parsing_id, retrieved_at, gmt_create, gmt_modified) VALUES
('aii-rev07-cht-dtl', 'ais-rev07-cht', 'rec-dtl-cht', 'RECORD', 'INSTALLATION_DETAIL', 'jd-install-oms', 'DTL-CHT-01', 'dtl-v2', '{"items":[{"installationItem":"充电桩电缆敷设","installedQuantity":18,"unit":"米"}]}', NULL, 1789920002700, 1789920002700, 1789920002700),
('aii-rev07-slf-dtl', 'ais-rev07-slf', 'rec-dtl-slf', 'RECORD', 'INSTALLATION_DETAIL', 'jd-install-oms', 'DTL-SLF-01', 'dtl-v1', '{"items":[{"installationItem":"充电桩电缆敷设","installedQuantity":18,"unit":"米"}]}', NULL, 1789920002700, 1789920002700, 1789920002700);

INSERT INTO analysis_result (id, run_id, work_item_id, snapshot_id, profile_id, implementation_version, status, summary, findings_json, open_questions_json, validated_at, gmt_create, gmt_modified) VALUES
('ar-rev07-cht', 'run-ana-rev07-cht', 'wi-rev-cht', 'ais-rev07-cht', 'profile-evidence-1', 'ief-1.0.0', 'ANALYZED', '差异均有依据', '[{"findingId":"f-rev07-1","type":"EVIDENCE_CHECK","content":{"topic":"电缆敷设施工事实","explanation":"验收单支持 18 米施工事实","assessment":"SUPPORTED"},"evidenceRefs":[{"inputId":"mp-yanshou-v1","blockId":"b1","jsonPointer":null,"quote":"施工验收：电缆敷设 18 米，施工方签字确认"}]}]', '[]', 1789920002750, 1789920002750, 1789920002750),
('ar-rev07-slf', 'run-ana-rev07-slf', 'wi-rev-slf', 'ais-rev07-slf', 'profile-evidence-1', 'ief-1.0.0', 'ANALYZED', '差异均有依据', '[{"findingId":"f-rev07-2","type":"EVIDENCE_CHECK","content":{"topic":"电缆敷设施工事实","explanation":"验收单支持 18 米施工事实","assessment":"SUPPORTED"},"evidenceRefs":[{"inputId":"mp-yanshou-v1","blockId":"b1","jsonPointer":null,"quote":"施工验收：电缆敷设 18 米，施工方签字确认"}]}]', '[]', 1789920002750, 1789920002750, 1789920002750);

UPDATE work_item SET current_analysis_result_id='ar-rev07-cht' WHERE id='wi-rev-cht';
UPDATE work_item SET current_analysis_result_id='ar-rev07-slf' WHERE id='wi-rev-slf';

-- 行 c：退回已生效但资料责任人未知的待分配事项（assignee=NULL，blockedReasons 应含 RESPONSIBILITY_UNRESOLVED）
INSERT INTO human_decision (id, work_item_id, service_provider_id, origin, action_type, request_key, actor_identity_id, identity_context_id, matched_grants_json, expected_work_item_version, expected_responsibility_version, analysis_result_id, confirmed_at, content_json, source_system, source_record_type, source_record_id, source_actor_ref_json, gmt_create, gmt_modified)
VALUES ('hd-rev07-req', 'wi-rev-jxl', 'sp-hongrun', 'LOCAL', 'REQUEST_SUPPLEMENT', 'rk-rev07-req', 'idt-reviewer-li', 'ctx-rev07-li', '["grant-review-li"]', 1, 1, NULL, 1789920002800, '{"action":"REQUEST_SUPPLEMENT","questions":[{"findingId":null,"question":"请补充现场照片可辨识原件","requiredMaterialDescription":"可辨识签字照片"}]}', NULL, NULL, NULL, NULL, 1789920002800, 1789920002800);

UPDATE work_item SET status='WAITING_SUPPLEMENT', blocked_reason=NULL, active_supplement_request_id='hd-rev07-req', assignee_identity_id=NULL, responsibility_version=2, row_version=2 WHERE id='wi-rev-jxl';

-- ============ 数据清理 ============
-- UPDATE work_item SET current_analysis_result_id=NULL WHERE id IN ('wi-rev-cht','wi-rev-slf');
-- UPDATE work_item SET status='BLOCKED', blocked_reason='材料读取失败：现场照片 MAT-PH-01 版本 ph-v1 未取得正文', active_supplement_request_id=NULL, assignee_identity_id='idt-reviewer-li', responsibility_version=1, row_version=1 WHERE id='wi-rev-jxl';
-- DELETE FROM analysis_result WHERE id IN ('ar-rev07-cht','ar-rev07-slf');
-- DELETE FROM analysis_input_item WHERE snapshot_id IN ('ais-rev07-cht','ais-rev07-slf');
-- DELETE FROM analysis_input_snapshot WHERE id IN ('ais-rev07-cht','ais-rev07-slf');
-- DELETE FROM human_decision WHERE id='hd-rev07-req';
