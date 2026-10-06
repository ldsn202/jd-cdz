-- TC-REV-05.sql 退回-回复接续全链（API 场景）— PRD：05-subprd-installation-review.md §7 验收#7、#8 及评审补充场景
-- 前置：已执行 TC-REV-SEED.sql
-- 说明：标注【mock 替代段】的语句模拟"源端成功/拒绝 + 本地接续完成"的终态；真实链路应经外部 mock 接口驱动，
--       无驱动入口时在测试库直接落终态。执行域表字段取自 execution-schema.md §2 external_write_operation。

-- ============ 数据准备 ============
-- 当前分析：含一条 INSUFFICIENT 发现（退回问题挂到该 finding）+ 待核实问题
INSERT INTO analysis_input_snapshot (analysis_generation, id, work_item_id, service_provider_id, expected_work_item_version, skill, skill_version, output_schema_version, config_versions_json, required_input_state, input_issues_json, input_item_count, content_sha256, gmt_create, gmt_modified)
VALUES (1, 'ais-rev05-g1', 'wi-rev-cht', 'sp-hongrun', 1, 'install-evidence-finder', '1.0.0', 'io-contract-1.0', '[]', 'INCOMPLETE', '["增量施工原因依据不足"]', 3, 'sha-ais-rev05-g1', 1789920001800, 1789920001800);

INSERT INTO analysis_input_item (id, snapshot_id, input_key, input_kind, record_type, source_system, source_record_id, source_version, data_json, parsing_id, retrieved_at, gmt_create, gmt_modified) VALUES
('aii-rev05-plan', 'ais-rev05-g1', 'rec-plan-cht', 'RECORD', 'INSTALLATION_PLAN', 'jd-install-oms', 'PLAN-CHT-01', 'plan-v3', '{"items":[{"installationItem":"充电桩电缆敷设","plannedQuantity":12,"unit":"米","materialSupplier":"服务商","serviceScope":"车位线槽敷设"}]}', NULL, 1789920001800, 1789920001800, 1789920001800),
('aii-rev05-dtl',  'ais-rev05-g1', 'rec-dtl-cht',  'RECORD', 'INSTALLATION_DETAIL', 'jd-install-oms', 'DTL-CHT-01', 'dtl-v2', '{"items":[{"installationItem":"充电桩电缆敷设","installedQuantity":18,"unit":"米","materialSupplier":"服务商","serviceScope":"车位线槽敷设"}]}', NULL, 1789920001800, 1789920001800, 1789920001800),
('aii-rev05-parse','ais-rev05-g1', 'mp-yanshou-v1', 'PARSED_MATERIAL', NULL, NULL, NULL, NULL, NULL, 'mp-yanshou-v1', 1789920001800, 1789920001800, 1789920001800);

INSERT INTO analysis_result (id, run_id, work_item_id, snapshot_id, profile_id, implementation_version, status, summary, findings_json, open_questions_json, validated_at, gmt_create, gmt_modified)
VALUES ('ar-rev05', 'run-ana-rev05', 'wi-rev-cht', 'ais-rev05-g1', 'profile-evidence-1', 'ief-1.0.0', 'NEEDS_INFORMATION',
 '方案 12 米与明细 18 米不一致；增量原因依据不足',
 '[{"findingId":"f-rev05-1","type":"EVIDENCE_CHECK","content":{"topic":"增量原因确认","explanation":"现场照片为疑似签字，文字不可辨识","assessment":"INSUFFICIENT"},"evidenceRefs":[{"inputId":"mp-yanshou-v1","blockId":"b2","jsonPointer":null,"quote":null}]}]',
 '[{"questionId":"q-rev05-1","question":"增量 6 米的施工原因与变更确认依据是什么？"}]',
 1789920001900, 1789920001900, 1789920001900);

UPDATE work_item SET current_analysis_result_id='ar-rev05' WHERE id='wi-rev-cht';

-- ============ 【mock 替代段 A】步骤 2：退回源端 SUCCEEDED 且本地接续完成 ============
-- 前提：步骤 1 已 202 受理，返回 decisionId（记为 <退回decisionId>）与 operationId（记为 <退回operationId>）
-- UPDATE external_write_operation SET status='SUCCEEDED', receipt_json='{"accepted":true,"externalReceiptId":"ext-rcpt-rev05"}', verified_at=1789920002000, row_version=row_version+1 WHERE id='<退回operationId>';
-- UPDATE work_item SET status='WAITING_SUPPLEMENT', active_supplement_request_id='<退回decisionId>', pending_write_id=NULL, assignee_identity_id='idt-provider-wang', responsibility_version=2, row_version=row_version+1 WHERE id='wi-rev-cht';

-- ============ 【mock 替代段 B】步骤 3a：第一次回复被源端 REJECTED，本地清理完成 ============
-- UPDATE external_write_operation SET status='REJECTED', receipt_json='{"accepted":false,"rejectReason":"回复未关联原问题"}', verified_at=1789920002100, row_version=row_version+1 WHERE id='<回复A operationId>';
-- UPDATE work_item SET status='WAITING_SUPPLEMENT', pending_write_id=NULL, row_version=row_version+1 WHERE id='wi-rev-cht';

-- ============ 【mock 替代段 C】步骤 3b：第二次回复 SUCCEEDED 且本地接续完成 ============
-- UPDATE external_write_operation SET status='SUCCEEDED', receipt_json='{"accepted":true,"externalReceiptId":"ext-rcpt-rev05-sup"}', verified_at=1789920002200, row_version=row_version+1 WHERE id='<回复B operationId>';
-- UPDATE supplemental_response SET success_verified_at=1789920002200 WHERE submit_decision_id='<回复B decisionId>';
-- UPDATE work_item SET status='PREPARING', active_supplement_request_id=NULL, pending_write_id=NULL, analysis_generation=2, current_analysis_result_id=NULL, assignee_identity_id='idt-reviewer-li', responsibility_version=3, row_version=row_version+1 WHERE id='wi-rev-cht';

-- ============ 【mock 替代段 D】步骤 4：后台准备第 2 代次输入（回复成功事实封存） ============
-- 仅选成功回复 B 为 SUPPLEMENTAL_RESPONSE RECORD；原退回为 INSTALLATION_REVIEW RECORD；明细 RECORD 保持 installedQuantity=18 不被文字覆盖
-- INSERT INTO analysis_input_snapshot (analysis_generation, id, work_item_id, service_provider_id, expected_work_item_version, skill, skill_version, output_schema_version, config_versions_json, required_input_state, input_issues_json, input_item_count, content_sha256, gmt_create, gmt_modified)
-- VALUES (2, 'ais-rev05-g2', 'wi-rev-cht', 'sp-hongrun', <当前row_version>, 'install-evidence-finder', '1.0.0', 'io-contract-1.0', '[]', 'COMPLETE', '[]', 4, 'sha-ais-rev05-g2', 1789920002300, 1789920002300);
-- INSERT INTO analysis_input_item (id, snapshot_id, input_key, input_kind, record_type, source_system, source_record_id, source_version, data_json, parsing_id, retrieved_at, gmt_create, gmt_modified) VALUES
-- ('aii-rev05-g2-req',  'ais-rev05-g2', 'rec-review-request', 'RECORD', 'INSTALLATION_REVIEW', 'charging_workbench', '<退回decisionId>', 'review-v1:<退回decisionId>', '{"action":"REQUEST_SUPPLEMENT","questions":[{"findingId":"f-rev05-1","question":"增量 6 米的施工原因与变更确认依据是什么？","requiredMaterialDescription":"增量施工变更确认记录"}],"externalReceiptId":"ext-rcpt-rev05"}', NULL, 1789920002300, 1789920002300, 1789920002300),
-- ('aii-rev05-g2-reply','ais-rev05-g2', 'rec-supplement-reply','RECORD', 'SUPPLEMENTAL_RESPONSE', 'charging_workbench', '<回复B supplemental_response.id>', 'supplement-v1:<回复B supplemental_response.id>', '{"replyText":"增量 6 米为现场管线绕行，变更确认记录已在上轮说明；施工时间段为 9 月 10 日白班","requestDecisionId":"<退回decisionId>","materialVersionIds":[],"successVerifiedAt":1789920002200}', NULL, 1789920002300, 1789920002300, 1789920002300),
-- ('aii-rev05-g2-dtl',  'ais-rev05-g2', 'rec-dtl-cht', 'RECORD', 'INSTALLATION_DETAIL', 'jd-install-oms', 'DTL-CHT-01', 'dtl-v2', '{"items":[{"installationItem":"充电桩电缆敷设","installedQuantity":18,"unit":"米","materialSupplier":"服务商","serviceScope":"车位线槽敷设"}]}', NULL, 1789920002300, 1789920002300, 1789920002300),
-- ('aii-rev05-g2-plan', 'ais-rev05-g2', 'rec-plan-cht','RECORD', 'INSTALLATION_PLAN', 'jd-install-oms', 'PLAN-CHT-01', 'plan-v3', '{"items":[{"installationItem":"充电桩电缆敷设","plannedQuantity":12,"unit":"米","materialSupplier":"服务商","serviceScope":"车位线槽敷设"}]}', NULL, 1789920002300, 1789920002300, 1789920002300);

-- ============ 【mock 替代段 E】步骤 5：旧代次晚到结果（只留历史，不发布） ============
-- INSERT INTO analysis_result (id, run_id, work_item_id, snapshot_id, profile_id, implementation_version, status, summary, findings_json, open_questions_json, validated_at, gmt_create, gmt_modified)
-- VALUES ('ar-rev05-late', 'run-ana-rev05-late', 'wi-rev-cht', 'ais-rev05-g1', 'profile-evidence-1', 'ief-1.0.0', 'ANALYZED', '旧代次晚到结果：不应覆盖第 2 代次当前指针', '[]', '[]', 1789920002400, 1789920002400, 1789920002400);

-- ============ 数据清理 ============
-- UPDATE work_item SET status='READY', assignee_identity_id='idt-reviewer-li', responsibility_version=1, row_version=1, analysis_generation=1, current_analysis_result_id=NULL, active_supplement_request_id=NULL, pending_write_id=NULL WHERE id='wi-rev-cht';
-- DELETE FROM analysis_result WHERE id IN ('ar-rev05','ar-rev05-late');
-- DELETE FROM analysis_input_item WHERE snapshot_id IN ('ais-rev05-g1','ais-rev05-g2');
-- DELETE FROM analysis_input_snapshot WHERE id IN ('ais-rev05-g1','ais-rev05-g2');
-- DELETE FROM supplemental_response WHERE work_item_id='wi-rev-cht';
-- DELETE FROM external_write_operation WHERE work_item_id='wi-rev-cht';
-- DELETE FROM human_decision WHERE work_item_id='wi-rev-cht';
