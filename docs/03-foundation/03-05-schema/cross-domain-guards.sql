-- Load LAST after all seven domain candidates. Additional combined-schema guards.
-- A transient SQL assertion converts a zero-row CAS into a batch failure.
CREATE TABLE transaction_assertion (
 id TEXT NOT NULL PRIMARY KEY,
 passed INTEGER NOT NULL CHECK(typeof(passed)='integer' AND passed=1),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(gmt_modified=gmt_create)
);
CREATE TRIGGER guard_new_work_item_pointers BEFORE INSERT ON work_item WHEN NEW.current_analysis_result_id IS NOT NULL OR NEW.pending_write_id IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'new_item_pointers_must_be_empty');
END;
CREATE TRIGGER guard_local_decision_identity BEFORE INSERT ON human_decision WHEN NEW.origin='LOCAL' BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM current_identity c JOIN identity_reference i ON i.id=c.identity_reference_id JOIN work_item w ON w.id=NEW.work_item_id WHERE c.id=NEW.identity_context_id AND i.id=NEW.actor_identity_id AND i.subject_type='HUMAN' AND c.subject_type='HUMAN' AND c.verified_at<=NEW.confirmed_at AND (c.valid_until IS NULL OR c.valid_until>NEW.confirmed_at) AND w.assignee_identity_id=i.id AND w.service_provider_id=NEW.service_provider_id AND w.row_version=NEW.expected_work_item_version AND w.responsibility_version=NEW.expected_responsibility_version AND w.status<>'COMPLETED') THEN RAISE(ABORT,'local_decision_identity_or_version_mismatch') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.matched_grants_json) g WHERE g.type<>'text' OR NOT EXISTS(SELECT 1 FROM business_permission p WHERE p.context_id=NEW.identity_context_id AND p.grant_id=g.value)) THEN RAISE(ABORT,'decision_grants_mismatch') END;
END;
CREATE TRIGGER guard_work_item_identity_insert BEFORE INSERT ON work_item WHEN NEW.assignee_identity_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM identity_reference WHERE id=NEW.assignee_identity_id AND subject_type='HUMAN') THEN RAISE(ABORT,'assignee_requires_human') END;
END;
CREATE TRIGGER guard_work_item_identity_update BEFORE UPDATE ON work_item WHEN NEW.assignee_identity_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM identity_reference WHERE id=NEW.assignee_identity_id AND subject_type='HUMAN') THEN RAISE(ABORT,'assignee_requires_human') END;
END;
CREATE TRIGGER guard_current_analysis BEFORE UPDATE ON work_item WHEN NEW.current_analysis_result_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM analysis_result r JOIN analysis_input_snapshot s ON s.id=r.snapshot_id WHERE r.id=NEW.current_analysis_result_id AND r.work_item_id=NEW.id AND s.work_item_id=NEW.id AND s.service_provider_id=NEW.service_provider_id AND s.analysis_generation=NEW.analysis_generation) THEN RAISE(ABORT,'current_analysis_scope_or_generation_mismatch') END;
END;
CREATE TRIGGER guard_parsing_call BEFORE INSERT ON material_parsing BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM capability_call c WHERE c.id=NEW.run_id AND c.operation='PARSE_MATERIAL' AND c.source_material_version_id=NEW.source_material_version_id AND c.input_sha256=NEW.content_sha256 AND c.profile_id=NEW.profile_id AND c.implementation_version=NEW.implementation_version) THEN RAISE(ABORT,'parsing_call_mismatch') END;
END;
CREATE TRIGGER guard_analysis_call BEFORE INSERT ON analysis_result BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM capability_call c WHERE c.id=NEW.run_id AND c.operation='ANALYZE_SKILL' AND c.input_snapshot_id=NEW.snapshot_id AND c.profile_id=NEW.profile_id AND c.implementation_version=NEW.implementation_version) THEN RAISE(ABORT,'analysis_call_mismatch') END;
END;
CREATE TRIGGER guard_submission_write BEFORE INSERT ON installation_detail_submission BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM external_write_operation o WHERE o.id=NEW.id AND o.interface_kind='INSTALLATION_SUBMIT' AND o.human_decision_id=NEW.human_decision_id AND o.work_item_id=NEW.work_item_id AND o.service_provider_id=NEW.service_provider_id AND o.installation_work_order_id=NEW.installation_work_order_id AND o.source_system=NEW.target_source_system AND o.request_json=NEW.request_json AND o.status='REGISTERED') THEN RAISE(ABORT,'submission_operation_identity_mismatch') END;
END;
CREATE TRIGGER guard_pending_write BEFORE UPDATE ON work_item WHEN NEW.pending_write_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM external_write_operation o WHERE o.id=NEW.pending_write_id AND o.work_item_id=NEW.id AND o.service_provider_id=NEW.service_provider_id AND o.installation_work_order_id=NEW.installation_work_order_id AND o.status NOT IN ('SUCCEEDED','REJECTED')) THEN RAISE(ABORT,'pending_write_mismatch') END;
END;
