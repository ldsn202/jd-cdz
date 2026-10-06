-- TC-REV-17.sql 退回待回复与待分配（UI）— PRD：05-subprd-installation-review.md §7 验收#7 及评审补充场景"退回成功但资料责任人未知"
-- 前置：已执行 TC-REV-SEED.sql

-- ============ 数据准备 ============
-- 春和庭：退回已生效（源端成功且本地接续完成），绑定本轮退回，交给服务商资料责任人王资料
INSERT INTO analysis_input_snapshot (analysis_generation, id, work_item_id, service_provider_id, expected_work_item_version, skill, skill_version, output_schema_version, config_versions_json, required_input_state, input_issues_json, input_item_count, content_sha256, gmt_create, gmt_modified)
VALUES (1, 'ais-rev17-g1', 'wi-rev-cht', 'sp-hongrun', 1, 'install-evidence-finder', '1.0.0', 'io-contract-1.0', '[]', 'INCOMPLETE', '["增量施工原因依据不足"]', 1, 'sha-ais-rev17-g1', 1789920003700, 1789920003700);
INSERT INTO analysis_input_item (id, snapshot_id, input_key, input_kind, record_type, source_system, source_record_id, source_version, data_json, parsing_id, retrieved_at, gmt_create, gmt_modified)
VALUES ('aii-rev17-dtl', 'ais-rev17-g1', 'rec-dtl-cht', 'RECORD', 'INSTALLATION_DETAIL', 'jd-install-oms', 'DTL-CHT-01', 'dtl-v2', '{"items":[{"installationItem":"充电桩电缆敷设","installedQuantity":18,"unit":"米"}]}', NULL, 1789920003700, 1789920003700, 1789920003700);
INSERT INTO analysis_result (id, run_id, work_item_id, snapshot_id, profile_id, implementation_version, status, summary, findings_json, open_questions_json, validated_at, gmt_create, gmt_modified)
VALUES ('ar-rev17', 'run-ana-rev17', 'wi-rev-cht', 'ais-rev17-g1', 'profile-evidence-1', 'ief-1.0.0', 'NEEDS_INFORMATION', '增量原因依据不足', '[]', '[{"questionId":"q-rev17-1","question":"增量 6 米的施工原因与变更确认依据是什么？"}]', 1789920003750, 1789920003750, 1789920003750);

INSERT INTO human_decision (id, work_item_id, service_provider_id, origin, action_type, request_key, actor_identity_id, identity_context_id, matched_grants_json, expected_work_item_version, expected_responsibility_version, analysis_result_id, confirmed_at, content_json, source_system, source_record_type, source_record_id, source_actor_ref_json, gmt_create, gmt_modified)
VALUES ('hd-rev17-req', 'wi-rev-cht', 'sp-hongrun', 'LOCAL', 'REQUEST_SUPPLEMENT', 'rk-rev17-req', 'idt-reviewer-li', 'ctx-rev17-li', '["grant-review-li"]', 1, 1, 'ar-rev17', 1789920003800, '{"action":"REQUEST_SUPPLEMENT","questions":[{"findingId":null,"question":"增量 6 米的施工原因与变更确认依据是什么？","requiredMaterialDescription":"增量施工变更确认记录"}]}', NULL, NULL, NULL, NULL, 1789920003800, 1789920003800);

INSERT INTO external_write_operation (id, human_decision_id, work_item_id, service_provider_id, installation_work_order_id, source_system, interface_kind, action, request_json, content_sha256, status, receipt_json, verified_at, row_version, gmt_create, gmt_modified)
VALUES ('ewo-rev17-req', 'hd-rev17-req', 'wi-rev-cht', 'sp-hongrun', 'wo-chunheting', 'jd-install-oms', 'REVIEW_SYNC', 'REQUEST_SUPPLEMENT', '{"decisionId":"hd-rev17-req","action":"REQUEST_SUPPLEMENT"}', 'sha-ewo-rev17-req', 'SUCCEEDED', '{"accepted":true,"externalReceiptId":"ext-rcpt-rev17"}', 1789920003900, 2, 1789920003800, 1789920003900);

UPDATE work_item SET status='WAITING_SUPPLEMENT', current_analysis_result_id='ar-rev17', active_supplement_request_id='hd-rev17-req', pending_write_id=NULL, assignee_identity_id='idt-provider-wang', responsibility_version=2, row_version=2 WHERE id='wi-rev-cht';

-- 锦绣里：退回已生效但资料责任人未知 → assignee=NULL，待分配（行 b 用）
INSERT INTO human_decision (id, work_item_id, service_provider_id, origin, action_type, request_key, actor_identity_id, identity_context_id, matched_grants_json, expected_work_item_version, expected_responsibility_version, analysis_result_id, confirmed_at, content_json, source_system, source_record_type, source_record_id, source_actor_ref_json, gmt_create, gmt_modified)
VALUES ('hd-rev17-req-jxl', 'wi-rev-jxl', 'sp-hongrun', 'LOCAL', 'REQUEST_SUPPLEMENT', 'rk-rev17-req-jxl', 'idt-reviewer-li', 'ctx-rev17-li', '["grant-review-li"]', 1, 1, NULL, 1789920003800, '{"action":"REQUEST_SUPPLEMENT","questions":[{"findingId":null,"question":"请补充现场照片可辨识原件","requiredMaterialDescription":"可辨识签字照片"}]}', NULL, NULL, NULL, NULL, 1789920003800, 1789920003800);

UPDATE work_item SET status='WAITING_SUPPLEMENT', blocked_reason=NULL, active_supplement_request_id='hd-rev17-req-jxl', assignee_identity_id=NULL, responsibility_version=2, row_version=2 WHERE id='wi-rev-jxl';

-- ============ 数据清理 ============
-- UPDATE work_item SET status='READY', current_analysis_result_id=NULL, active_supplement_request_id=NULL, assignee_identity_id='idt-reviewer-li', responsibility_version=1, row_version=1 WHERE id='wi-rev-cht';
-- UPDATE work_item SET status='BLOCKED', blocked_reason='材料读取失败：现场照片 MAT-PH-01 版本 ph-v1 未取得正文', active_supplement_request_id=NULL, assignee_identity_id='idt-reviewer-li', responsibility_version=1, row_version=1 WHERE id='wi-rev-jxl';
-- DELETE FROM external_write_operation WHERE id='ewo-rev17-req';
-- DELETE FROM human_decision WHERE id IN ('hd-rev17-req','hd-rev17-req-jxl');
-- DELETE FROM analysis_result WHERE id='ar-rev17';
-- DELETE FROM analysis_input_item WHERE snapshot_id='ais-rev17-g1';
-- DELETE FROM analysis_input_snapshot WHERE id='ais-rev17-g1';
