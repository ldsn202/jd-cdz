-- Design candidate for work-item-schema.md; not a deployed migration.
-- Cross-table relationships are logical and require guarded service transactions.
CREATE TABLE service_provider (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 source_system TEXT NOT NULL CHECK(length(trim(source_system))>0),
 source_id TEXT NOT NULL CHECK(length(trim(source_id))>0),
 display_name TEXT,
 source_version TEXT,
 source_state TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK(source_state IN ('ACTIVE','INACTIVE','REMOVED','UNKNOWN')),
 verified_at INTEGER CHECK(verified_at IS NULL OR (typeof(verified_at)='integer' AND verified_at>=0)),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified>=gmt_create)
);
CREATE UNIQUE INDEX uk_service_provider_source ON service_provider(source_system,source_id);

CREATE TABLE installation_work_order (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 source_system TEXT NOT NULL CHECK(length(trim(source_system))>0),
 source_id TEXT NOT NULL CHECK(length(trim(source_id))>0),
 current_service_provider_id TEXT CHECK(current_service_provider_id IS NULL OR length(trim(current_service_provider_id))>0),
 source_version TEXT,
 source_state TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK(source_state IN ('ACTIVE','CANCELLED','REMOVED','UNKNOWN')),
 context_snapshot_id TEXT CHECK(context_snapshot_id IS NULL OR length(trim(context_snapshot_id))>0),
 verified_at INTEGER CHECK(verified_at IS NULL OR (typeof(verified_at)='integer' AND verified_at>=0)),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified>=gmt_create)
);
CREATE UNIQUE INDEX uk_installation_work_order_source ON installation_work_order(source_system,source_id);
CREATE INDEX idx_installation_work_order_provider ON installation_work_order(current_service_provider_id,id);

CREATE TABLE work_item (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 service_provider_id TEXT NOT NULL CHECK(length(trim(service_provider_id))>0),
 installation_work_order_id TEXT CHECK(installation_work_order_id IS NULL OR length(trim(installation_work_order_id))>0),
 item_kind TEXT NOT NULL CHECK(item_kind IN ('INSTALLATION_PREPARATION','INSTALLATION_REVIEW','RECONCILIATION','CONFIGURATION','COORDINATION')),
 business_key TEXT NOT NULL CHECK(length(trim(business_key))>0),
 business_identity_json TEXT NOT NULL CHECK(CASE WHEN json_valid(business_identity_json) THEN json_type(business_identity_json)='array' AND json_array_length(business_identity_json)>0 ELSE 0 END),
 creation_key TEXT NOT NULL CHECK(length(trim(creation_key))>0),
 title TEXT NOT NULL CHECK(length(trim(title))>0),
 status TEXT NOT NULL DEFAULT 'PREPARING' CHECK(status IN ('PREPARING','READY','WAITING_SUPPLEMENT','WAITING_REPLY','PROCESSING','EXCEPTION','BLOCKED','COMPLETED')),
 assignee_identity_id TEXT CHECK(assignee_identity_id IS NULL OR length(trim(assignee_identity_id))>0),
 responsibility_version INTEGER NOT NULL DEFAULT 1 CHECK(typeof(responsibility_version)='integer' AND responsibility_version>=1),
 row_version INTEGER NOT NULL DEFAULT 1 CHECK(typeof(row_version)='integer' AND row_version>=1),
 analysis_generation INTEGER NOT NULL DEFAULT 1 CHECK(typeof(analysis_generation)='integer' AND analysis_generation>=1),
 current_analysis_result_id TEXT CHECK(current_analysis_result_id IS NULL OR length(trim(current_analysis_result_id))>0),
 current_reconciliation_id TEXT CHECK(current_reconciliation_id IS NULL OR (length(trim(current_reconciliation_id))>0 AND item_kind='RECONCILIATION')),
 integration_config_id TEXT CHECK(integration_config_id IS NULL OR (length(trim(integration_config_id))>0 AND item_kind='CONFIGURATION')),
 current_configuration_version_id TEXT CHECK(current_configuration_version_id IS NULL OR (length(trim(current_configuration_version_id))>0 AND item_kind='CONFIGURATION')),
 active_supplement_request_id TEXT CHECK(active_supplement_request_id IS NULL OR length(trim(active_supplement_request_id))>0),
 pending_write_id TEXT CHECK(pending_write_id IS NULL OR length(trim(pending_write_id))>0),
 blocked_reason TEXT,
 completion_code TEXT,
 completion_basis_json TEXT CHECK(completion_basis_json IS NULL OR CASE WHEN json_valid(completion_basis_json) THEN json_type(completion_basis_json)='object' ELSE 0 END),
 completion_decision_id TEXT CHECK(completion_decision_id IS NULL OR length(trim(completion_decision_id))>0),
 completed_at INTEGER CHECK(completed_at IS NULL OR (typeof(completed_at)='integer' AND completed_at>=gmt_create AND completed_at<=gmt_modified)),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified>=gmt_create),
 CHECK((item_kind='CONFIGURATION' AND installation_work_order_id IS NULL) OR
       (item_kind<>'CONFIGURATION' AND installation_work_order_id IS NOT NULL AND length(trim(installation_work_order_id))>0)),
 CHECK(status<>'WAITING_SUPPLEMENT' OR (item_kind='INSTALLATION_REVIEW' AND active_supplement_request_id IS NOT NULL)),
 CHECK(active_supplement_request_id IS NULL OR (item_kind='INSTALLATION_REVIEW' AND status<>'COMPLETED')),
 CHECK(status<>'WAITING_REPLY' OR item_kind='RECONCILIATION'),
 CHECK(status<>'BLOCKED' OR (blocked_reason IS NOT NULL AND length(trim(blocked_reason))>0)),
 CHECK(
  (status='COMPLETED' AND completion_code IS NOT NULL AND completed_at IS NOT NULL AND
   completion_basis_json IS NOT NULL AND pending_write_id IS NULL AND
   (completion_code IN ('EXCEPTION_RESOLVED','BUSINESS_STOPPED') OR
    (item_kind='INSTALLATION_PREPARATION' AND completion_code='INSTALLATION_SUBMITTED') OR
    (item_kind='INSTALLATION_REVIEW' AND completion_code='REVIEW_APPROVED') OR
    (item_kind='RECONCILIATION' AND completion_code='RECONCILED') OR
    (item_kind='CONFIGURATION' AND completion_code='CONFIGURATION_ENABLED') OR
    (item_kind='COORDINATION' AND completion_code='COORDINATION_RESOLVED')))
  OR
  (status<>'COMPLETED' AND completion_code IS NULL AND completion_basis_json IS NULL AND
   completed_at IS NULL AND completion_decision_id IS NULL)
 )
);
CREATE UNIQUE INDEX uk_work_item_creation ON work_item(creation_key);
CREATE UNIQUE INDEX uk_work_item_active_business ON work_item(service_provider_id,item_kind,business_key) WHERE status<>'COMPLETED';
CREATE INDEX idx_work_item_assignee_status ON work_item(assignee_identity_id,status,gmt_modified DESC,id DESC);
CREATE INDEX idx_work_item_provider_status ON work_item(service_provider_id,status,gmt_modified DESC,id DESC);
CREATE INDEX idx_work_item_order ON work_item(installation_work_order_id,item_kind,gmt_create,id);

CREATE TABLE work_item_link (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 from_work_item_id TEXT NOT NULL CHECK(length(trim(from_work_item_id))>0),
 to_work_item_id TEXT NOT NULL CHECK(length(trim(to_work_item_id))>0),
 reason_code TEXT NOT NULL CHECK(reason_code IN ('EXCEPTION_CONTINUATION','AFTER_COMPLETION_CHANGE','STAGE_HANDOFF')),
 cause_key TEXT NOT NULL CHECK(length(trim(cause_key))>0),
 basis_json TEXT NOT NULL CHECK(CASE WHEN json_valid(basis_json) THEN json_type(basis_json)='object' ELSE 0 END),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified=gmt_create),
 CHECK(from_work_item_id<>to_work_item_id)
);
CREATE UNIQUE INDEX uk_work_item_link_cause ON work_item_link(from_work_item_id,reason_code,cause_key);
CREATE INDEX idx_work_item_link_target ON work_item_link(to_work_item_id,gmt_create,id);

CREATE TABLE human_decision (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 work_item_id TEXT NOT NULL CHECK(length(trim(work_item_id))>0),
 service_provider_id TEXT NOT NULL CHECK(length(trim(service_provider_id))>0),
 origin TEXT NOT NULL CHECK(origin IN ('LOCAL','SOURCE')),
 action_type TEXT NOT NULL CHECK(action_type IN ('SUBMIT_INSTALLATION','APPROVE','REQUEST_SUPPLEMENT','SUBMIT_SUPPLEMENT','REQUEST_FEE_VERIFICATION','REPLY_FEE_VERIFICATION','RECORD_FEE_FACTS','ENABLE_CONFIGURATION','OPEN_EXCEPTION','CLOSE_EXCEPTION','COMPLETE_COORDINATION','STOP_WORK','SOURCE_UNMAPPED')),
 request_key TEXT CHECK(request_key IS NULL OR length(trim(request_key))>0),
 actor_identity_id TEXT CHECK(actor_identity_id IS NULL OR length(trim(actor_identity_id))>0),
 identity_context_id TEXT CHECK(identity_context_id IS NULL OR length(trim(identity_context_id))>0),
 matched_grants_json TEXT CHECK(matched_grants_json IS NULL OR CASE WHEN json_valid(matched_grants_json) THEN json_type(matched_grants_json)='array' AND json_array_length(matched_grants_json)>0 ELSE 0 END),
 expected_work_item_version INTEGER CHECK(expected_work_item_version IS NULL OR (typeof(expected_work_item_version)='integer' AND expected_work_item_version>=1)),
 expected_responsibility_version INTEGER CHECK(expected_responsibility_version IS NULL OR (typeof(expected_responsibility_version)='integer' AND expected_responsibility_version>=1)),
 analysis_result_id TEXT CHECK(analysis_result_id IS NULL OR length(trim(analysis_result_id))>0),
 confirmed_at INTEGER CHECK(confirmed_at IS NULL OR (typeof(confirmed_at)='integer' AND confirmed_at>=0)),
 content_json TEXT NOT NULL CHECK(CASE WHEN json_valid(content_json) THEN json_type(content_json)='object' ELSE 0 END),
 source_system TEXT,
 source_record_type TEXT,
 source_record_id TEXT CHECK(source_record_id IS NULL OR length(trim(source_record_id))>0),
 source_actor_ref_json TEXT CHECK(source_actor_ref_json IS NULL OR CASE WHEN json_valid(source_actor_ref_json) THEN json_type(source_actor_ref_json)='object' ELSE 0 END),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified=gmt_create),
 CHECK(
  (origin='LOCAL' AND request_key IS NOT NULL AND length(trim(request_key))>0 AND
   actor_identity_id IS NOT NULL AND identity_context_id IS NOT NULL AND matched_grants_json IS NOT NULL AND
   expected_work_item_version IS NOT NULL AND expected_responsibility_version IS NOT NULL AND confirmed_at IS NOT NULL AND
   source_system IS NULL AND source_record_type IS NULL AND source_record_id IS NULL AND action_type<>'SOURCE_UNMAPPED')
  OR
  (origin='SOURCE' AND request_key IS NULL AND identity_context_id IS NULL AND matched_grants_json IS NULL AND
   source_system IS NOT NULL AND length(trim(source_system))>0 AND
   source_record_type IS NOT NULL AND length(trim(source_record_type))>0 AND
   source_record_id IS NOT NULL AND length(trim(source_record_id))>0)
 ),
 CHECK(origin<>'LOCAL' OR action_type NOT IN ('APPROVE','REQUEST_SUPPLEMENT') OR analysis_result_id IS NOT NULL)
);
CREATE UNIQUE INDEX uk_human_decision_request ON human_decision(request_key) WHERE origin='LOCAL';
CREATE UNIQUE INDEX uk_human_decision_source ON human_decision(source_system,source_record_type,source_record_id) WHERE origin='SOURCE';
CREATE INDEX idx_human_decision_item ON human_decision(work_item_id,gmt_create,id);
CREATE INDEX idx_human_decision_provider ON human_decision(service_provider_id,gmt_create,id);

CREATE TABLE supplemental_response (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 work_item_id TEXT NOT NULL CHECK(length(trim(work_item_id))>0),
 service_provider_id TEXT NOT NULL CHECK(length(trim(service_provider_id))>0),
 request_decision_id TEXT NOT NULL CHECK(length(trim(request_decision_id))>0),
 submit_decision_id TEXT NOT NULL CHECK(length(trim(submit_decision_id))>0),
 reply_text TEXT NOT NULL CHECK(length(trim(reply_text))>0),
 materials_json TEXT NOT NULL CHECK(CASE WHEN json_valid(materials_json) THEN json_type(materials_json)='array' ELSE 0 END),
 success_verified_at INTEGER CHECK(success_verified_at IS NULL OR (typeof(success_verified_at)='integer' AND success_verified_at>=gmt_create AND success_verified_at<=gmt_modified)),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified>=gmt_create),
 CHECK(request_decision_id<>submit_decision_id)
);
CREATE UNIQUE INDEX uk_supplemental_response_submission ON supplemental_response(submit_decision_id);
CREATE UNIQUE INDEX uk_supplemental_response_success ON supplemental_response(request_decision_id) WHERE success_verified_at IS NOT NULL;
CREATE INDEX idx_supplemental_response_item ON supplemental_response(work_item_id,gmt_create,id);

CREATE TABLE activity_record (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 work_item_id TEXT NOT NULL CHECK(length(trim(work_item_id))>0),
 event_key TEXT NOT NULL CHECK(length(trim(event_key))>0),
 event_type TEXT NOT NULL CHECK(event_type IN ('WORK_CREATED','ANALYSIS_COMPLETED','DECISION_CONFIRMED','SOURCE_WRITE_RESULT','PROGRESS_SAVED','RESPONSIBILITY_CHANGED','FOLLOWUP_LINKED','SOURCE_CHANGE_RECORDED')),
 actor_identity_id TEXT CHECK(actor_identity_id IS NULL OR length(trim(actor_identity_id))>0),
 fact_type TEXT,
 fact_id TEXT CHECK(fact_id IS NULL OR length(trim(fact_id))>0),
 occurred_at INTEGER CHECK(occurred_at IS NULL OR (typeof(occurred_at)='integer' AND occurred_at>=0)),
 details_json TEXT NOT NULL CHECK(CASE WHEN json_valid(details_json) THEN json_type(details_json)='object' ELSE 0 END),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified=gmt_create),
 CHECK((fact_type IS NULL AND fact_id IS NULL) OR (fact_type IS NOT NULL AND fact_id IS NOT NULL)),
 CHECK((event_type='PROGRESS_SAVED' AND actor_identity_id IS NOT NULL AND occurred_at IS NOT NULL)
       OR (event_type<>'PROGRESS_SAVED' AND fact_type IS NOT NULL AND fact_id IS NOT NULL))
);
CREATE UNIQUE INDEX uk_activity_record_event ON activity_record(work_item_id,event_key);
CREATE INDEX idx_activity_record_item_time ON activity_record(work_item_id,gmt_create,id);

CREATE TRIGGER tr_work_item_update BEFORE UPDATE ON work_item BEGIN
 SELECT CASE WHEN NEW.analysis_generation<OLD.analysis_generation OR NEW.analysis_generation>OLD.analysis_generation+1 THEN RAISE(ABORT,'analysis_generation_conflict') END;
 SELECT CASE WHEN OLD.status='COMPLETED' THEN RAISE(ABORT,'completed_work_item_immutable') END;
 SELECT CASE WHEN NEW.id IS NOT OLD.id OR NEW.service_provider_id IS NOT OLD.service_provider_id
  OR NEW.installation_work_order_id IS NOT OLD.installation_work_order_id OR NEW.item_kind IS NOT OLD.item_kind
  OR NEW.business_key IS NOT OLD.business_key OR NEW.business_identity_json IS NOT OLD.business_identity_json
  OR NEW.creation_key IS NOT OLD.creation_key OR NEW.gmt_create IS NOT OLD.gmt_create
  OR (OLD.integration_config_id IS NOT NULL AND NEW.integration_config_id IS NOT OLD.integration_config_id)
  THEN RAISE(ABORT,'work_item_scope_immutable') END;
 SELECT CASE WHEN NEW.row_version<>OLD.row_version+1 OR NEW.gmt_modified<OLD.gmt_modified
  THEN RAISE(ABORT,'work_item_version_required') END;
 SELECT CASE WHEN (NEW.assignee_identity_id IS NOT OLD.assignee_identity_id AND NEW.responsibility_version<>OLD.responsibility_version+1)
  OR (NEW.assignee_identity_id IS OLD.assignee_identity_id AND NEW.responsibility_version<>OLD.responsibility_version)
  THEN RAISE(ABORT,'responsibility_version_mismatch') END;
END;

CREATE TRIGGER tr_supplemental_response_update BEFORE UPDATE ON supplemental_response BEGIN
 SELECT CASE WHEN NEW.success_verified_at IS NOT NULL AND EXISTS(SELECT 1 FROM supplemental_response WHERE request_decision_id=NEW.request_decision_id AND success_verified_at IS NOT NULL AND id<>OLD.id) THEN RAISE(ABORT,'supplement_success_conflict') END;
 SELECT CASE WHEN OLD.success_verified_at IS NOT NULL OR NEW.success_verified_at IS NULL
  OR NEW.id IS NOT OLD.id OR NEW.work_item_id IS NOT OLD.work_item_id
  OR NEW.service_provider_id IS NOT OLD.service_provider_id OR NEW.request_decision_id IS NOT OLD.request_decision_id
  OR NEW.submit_decision_id IS NOT OLD.submit_decision_id OR NEW.reply_text IS NOT OLD.reply_text
  OR NEW.materials_json IS NOT OLD.materials_json OR NEW.gmt_create IS NOT OLD.gmt_create
  OR NEW.gmt_modified<OLD.gmt_modified
  THEN RAISE(ABORT,'supplement_content_immutable') END;
END;

CREATE TRIGGER tr_human_decision_immutable BEFORE UPDATE ON human_decision BEGIN
 SELECT RAISE(ABORT,'historical_record_immutable');
END;

CREATE TRIGGER tr_work_item_link_immutable BEFORE UPDATE ON work_item_link BEGIN
 SELECT RAISE(ABORT,'historical_record_immutable');
END;

CREATE TRIGGER tr_activity_record_immutable BEFORE UPDATE ON activity_record BEGIN
 SELECT RAISE(ABORT,'historical_record_immutable');
END;

CREATE TRIGGER tr_service_provider_no_delete BEFORE DELETE ON service_provider BEGIN
 SELECT RAISE(ABORT,'business_history_delete_forbidden');
END;

CREATE TRIGGER tr_installation_work_order_no_delete BEFORE DELETE ON installation_work_order BEGIN
 SELECT RAISE(ABORT,'business_history_delete_forbidden');
END;

CREATE TRIGGER tr_work_item_no_delete BEFORE DELETE ON work_item BEGIN
 SELECT RAISE(ABORT,'business_history_delete_forbidden');
END;

CREATE TRIGGER tr_work_item_link_no_delete BEFORE DELETE ON work_item_link BEGIN
 SELECT RAISE(ABORT,'business_history_delete_forbidden');
END;

CREATE TRIGGER tr_human_decision_no_delete BEFORE DELETE ON human_decision BEGIN
 SELECT RAISE(ABORT,'business_history_delete_forbidden');
END;

CREATE TRIGGER tr_supplemental_response_no_delete BEFORE DELETE ON supplemental_response BEGIN
 SELECT RAISE(ABORT,'business_history_delete_forbidden');
END;

CREATE TRIGGER tr_activity_record_no_delete BEFORE DELETE ON activity_record BEGIN
 SELECT RAISE(ABORT,'business_history_delete_forbidden');
END;

CREATE TRIGGER tr_service_provider_source_identity BEFORE UPDATE ON service_provider BEGIN
 SELECT CASE WHEN NEW.id IS NOT OLD.id OR NEW.source_system IS NOT OLD.source_system OR NEW.source_id IS NOT OLD.source_id OR NEW.gmt_create IS NOT OLD.gmt_create OR NEW.gmt_modified<OLD.gmt_modified THEN RAISE(ABORT,'source_identity_immutable') END;
END;

CREATE TRIGGER tr_installation_work_order_source_identity BEFORE UPDATE ON installation_work_order BEGIN
 SELECT CASE WHEN NEW.id IS NOT OLD.id OR NEW.source_system IS NOT OLD.source_system OR NEW.source_id IS NOT OLD.source_id OR NEW.gmt_create IS NOT OLD.gmt_create OR NEW.gmt_modified<OLD.gmt_modified THEN RAISE(ABORT,'source_identity_immutable') END;
END;

-- Generated explicit history guards; rebuild with build-schema-guards.py.
CREATE TRIGGER guard_service_provider_no_replace BEFORE INSERT ON service_provider WHEN EXISTS(SELECT 1 FROM service_provider old WHERE old.id=NEW.id OR (old.source_system=NEW.source_system AND old.source_id=NEW.source_id)) BEGIN SELECT RAISE(ABORT,'replacement_write_forbidden'); END;
CREATE TRIGGER guard_installation_work_order_no_replace BEFORE INSERT ON installation_work_order WHEN EXISTS(SELECT 1 FROM installation_work_order old WHERE old.id=NEW.id OR (old.source_system=NEW.source_system AND old.source_id=NEW.source_id)) BEGIN SELECT RAISE(ABORT,'replacement_write_forbidden'); END;
CREATE TRIGGER guard_work_item_no_replace BEFORE INSERT ON work_item WHEN EXISTS(SELECT 1 FROM work_item old WHERE old.id=NEW.id OR (old.service_provider_id=NEW.service_provider_id AND old.item_kind=NEW.item_kind AND old.business_key=NEW.business_key AND (old.status<>'COMPLETED') AND (NEW.status<>'COMPLETED')) OR (old.creation_key=NEW.creation_key)) BEGIN SELECT RAISE(ABORT,'replacement_write_forbidden'); END;
CREATE TRIGGER guard_work_item_link_no_replace BEFORE INSERT ON work_item_link WHEN EXISTS(SELECT 1 FROM work_item_link old WHERE old.id=NEW.id OR (old.from_work_item_id=NEW.from_work_item_id AND old.reason_code=NEW.reason_code AND old.cause_key=NEW.cause_key)) BEGIN SELECT RAISE(ABORT,'replacement_write_forbidden'); END;
CREATE TRIGGER guard_human_decision_no_replace BEFORE INSERT ON human_decision WHEN EXISTS(SELECT 1 FROM human_decision old WHERE old.id=NEW.id OR (old.source_system=NEW.source_system AND old.source_record_type=NEW.source_record_type AND old.source_record_id=NEW.source_record_id AND (old.origin='SOURCE') AND (NEW.origin='SOURCE')) OR (old.request_key=NEW.request_key AND (old.origin='LOCAL') AND (NEW.origin='LOCAL'))) BEGIN SELECT RAISE(ABORT,'replacement_write_forbidden'); END;
CREATE TRIGGER guard_supplemental_response_no_replace BEFORE INSERT ON supplemental_response WHEN EXISTS(SELECT 1 FROM supplemental_response old WHERE old.id=NEW.id OR (old.request_decision_id=NEW.request_decision_id AND (old.success_verified_at IS NOT NULL) AND (NEW.success_verified_at IS NOT NULL)) OR (old.submit_decision_id=NEW.submit_decision_id)) BEGIN SELECT RAISE(ABORT,'replacement_write_forbidden'); END;
CREATE TRIGGER guard_activity_record_no_replace BEFORE INSERT ON activity_record WHEN EXISTS(SELECT 1 FROM activity_record old WHERE old.id=NEW.id OR (old.work_item_id=NEW.work_item_id AND old.event_key=NEW.event_key)) BEGIN SELECT RAISE(ABORT,'replacement_write_forbidden'); END;
