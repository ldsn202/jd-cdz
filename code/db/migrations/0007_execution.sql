-- Foundation candidate; load after identity. Runtime services are not implemented.
CREATE TABLE change_feed (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 service_provider_id TEXT NOT NULL CHECK(length(trim(service_provider_id))>0),
 source_system TEXT NOT NULL CHECK(length(trim(source_system))>0),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(gmt_modified=gmt_create)
);
CREATE TABLE change_feed_generation (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 feed_id TEXT NOT NULL CHECK(length(trim(feed_id))>0),
 generation_no INTEGER NOT NULL CHECK(typeof(generation_no)='integer' AND generation_no>=1),
 scope_json TEXT NOT NULL CHECK(CASE WHEN json_valid(scope_json) THEN json_type(scope_json)='object' ELSE 0 END),
 start_cursor TEXT NOT NULL CHECK(length(start_cursor)>0),
 current_cursor TEXT NOT NULL CHECK(length(current_cursor)>0),
 state TEXT NOT NULL CHECK(state IN ('PREPARING','READY','GAP','RETIRED')),
 source_acquired_position TEXT,
 coverage_through INTEGER CHECK(coverage_through IS NULL OR (typeof(coverage_through)='integer' AND coverage_through>=0)),
 row_version INTEGER NOT NULL CHECK(typeof(row_version)='integer' AND row_version>=1),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified>=gmt_create),
 UNIQUE(feed_id,generation_no)
);
CREATE UNIQUE INDEX uk_feed_ready ON change_feed_generation(feed_id) WHERE state='READY';
CREATE TABLE source_change (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 feed_id TEXT NOT NULL CHECK(length(trim(feed_id))>0),
 source_change_id TEXT NOT NULL CHECK(length(trim(source_change_id))>0),
 record_type TEXT NOT NULL CHECK(length(trim(record_type))>0),
 source_record_id TEXT NOT NULL CHECK(length(trim(source_record_id))>0),
 source_version TEXT,
 change_type TEXT NOT NULL CHECK(change_type IN ('UPSERT','REMOVED')),
 association_completeness TEXT NOT NULL CHECK(association_completeness IN ('COMPLETE','INCOMPLETE','UNKNOWN')),
 associations_json TEXT NOT NULL CHECK(CASE WHEN json_valid(associations_json) THEN json_type(associations_json)='array' ELSE 0 END),
 payload_json TEXT NOT NULL CHECK(CASE WHEN json_valid(payload_json) THEN json_type(payload_json)='object' ELSE 0 END),
 payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256)=64 AND payload_sha256 NOT GLOB '*[^0-9a-f]*'),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(gmt_modified=gmt_create),
 UNIQUE(feed_id,source_change_id)
);
CREATE INDEX idx_source_change_record ON source_change(feed_id,record_type,source_record_id,gmt_create,id);
CREATE TABLE change_batch (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 generation_id TEXT NOT NULL CHECK(length(trim(generation_id))>0),
 from_cursor TEXT NOT NULL CHECK(length(from_cursor)>0),
 next_cursor TEXT NOT NULL CHECK(length(next_cursor)>0 AND next_cursor<>from_cursor),
 change_ids_json TEXT NOT NULL CHECK(CASE WHEN json_valid(change_ids_json) THEN json_type(change_ids_json)='array' AND json_array_length(change_ids_json)>0 ELSE 0 END),
 original_response_json TEXT NOT NULL CHECK(CASE WHEN json_valid(original_response_json) THEN json_type(original_response_json)='object' ELSE 0 END),
 retrieved_at INTEGER NOT NULL CHECK(typeof(retrieved_at)='integer' AND retrieved_at>=0 AND retrieved_at<=gmt_create),
 source_checked_at INTEGER CHECK(source_checked_at IS NULL OR (typeof(source_checked_at)='integer' AND source_checked_at>=0)),
 coverage_through INTEGER CHECK(coverage_through IS NULL OR (typeof(coverage_through)='integer' AND coverage_through>=0)),
 has_more INTEGER NOT NULL CHECK(has_more IN (0,1)),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(gmt_modified=gmt_create),
 UNIQUE(generation_id,from_cursor)
);
CREATE TABLE background_job (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 purpose TEXT NOT NULL CHECK(purpose IN ('DISCOVER_RELATIONS','READ_SOURCE','PARSE_MATERIAL','ANALYZE_SKILL','RECONCILE','TRIAL_CONFIG','WRITE_EXTERNAL','QUERY_EXTERNAL','CONTINUE_LOCAL')),
 service_provider_id TEXT NOT NULL CHECK(length(trim(service_provider_id))>0),
 work_item_id TEXT,
 external_write_id TEXT,
 target_json TEXT NOT NULL CHECK(CASE WHEN json_valid(target_json) THEN json_type(target_json)='object' ELSE 0 END),
 dedupe_key TEXT NOT NULL UNIQUE CHECK(length(trim(dedupe_key))>0),
 status TEXT NOT NULL CHECK(status IN ('READY','RUNNING','RETRY_WAIT','BLOCKED','SUCCEEDED','FAILED','CANCELLED')),
 available_at INTEGER CHECK(available_at IS NULL OR (typeof(available_at)='integer' AND available_at>=0)),
 lease_epoch INTEGER NOT NULL DEFAULT 0 CHECK(typeof(lease_epoch)='integer' AND lease_epoch>=0),
 lease_token TEXT,
 lease_owner TEXT,
 lease_until INTEGER,
 row_version INTEGER NOT NULL CHECK(typeof(row_version)='integer' AND row_version>=1),
 outcome_json TEXT CHECK(outcome_json IS NULL OR CASE WHEN json_valid(outcome_json) THEN json_type(outcome_json)='object' ELSE 0 END),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified>=gmt_create),
 CHECK((status='RUNNING' AND lease_token IS NOT NULL AND length(lease_token)>0 AND lease_owner IS NOT NULL AND length(lease_owner)>0 AND typeof(lease_until)='integer' AND lease_until>gmt_modified AND lease_epoch>0) OR
       (status<>'RUNNING' AND lease_token IS NULL AND lease_owner IS NULL AND lease_until IS NULL)),
 CHECK(purpose NOT IN ('WRITE_EXTERNAL','QUERY_EXTERNAL') OR external_write_id IS NOT NULL),
 CHECK(status NOT IN ('SUCCEEDED','FAILED','CANCELLED') OR outcome_json IS NOT NULL)
);
CREATE INDEX idx_job_ready ON background_job(status,available_at,id);
CREATE INDEX idx_job_item ON background_job(work_item_id,gmt_create,id);
CREATE TABLE job_change_trigger (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 job_id TEXT NOT NULL CHECK(length(trim(job_id))>0),
 source_change_id TEXT NOT NULL CHECK(length(trim(source_change_id))>0),
 generation_id TEXT NOT NULL CHECK(length(trim(generation_id))>0),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(gmt_modified=gmt_create),
 UNIQUE(job_id,source_change_id,generation_id)
);
CREATE INDEX idx_trigger_change ON job_change_trigger(source_change_id,generation_id,job_id);
CREATE TABLE capability_call (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 job_id TEXT NOT NULL CHECK(length(trim(job_id))>0),
 operation TEXT NOT NULL CHECK(operation IN ('PARSE_MATERIAL','ANALYZE_SKILL')),
 source_material_version_id TEXT,
 input_snapshot_id TEXT,
 profile_id TEXT NOT NULL CHECK(length(trim(profile_id))>0),
 implementation_version TEXT NOT NULL CHECK(length(trim(implementation_version))>0),
 config_json TEXT NOT NULL CHECK(CASE WHEN json_valid(config_json) THEN json_type(config_json)='object' ELSE 0 END),
 input_sha256 TEXT NOT NULL CHECK(length(input_sha256)=64 AND input_sha256 NOT GLOB '*[^0-9a-f]*'),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(gmt_modified=gmt_create),
 CHECK((operation='PARSE_MATERIAL' AND source_material_version_id IS NOT NULL AND input_snapshot_id IS NULL) OR (operation='ANALYZE_SKILL' AND input_snapshot_id IS NOT NULL AND source_material_version_id IS NULL))
);
CREATE INDEX idx_capability_job ON capability_call(job_id,id);
CREATE TABLE execution_attempt (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 job_id TEXT NOT NULL CHECK(length(trim(job_id))>0),
 attempt_no INTEGER NOT NULL CHECK(typeof(attempt_no)='integer' AND attempt_no>=1),
 executor_identity_id TEXT NOT NULL CHECK(length(trim(executor_identity_id))>0),
 capability_call_id TEXT,
 lease_epoch INTEGER NOT NULL CHECK(typeof(lease_epoch)='integer' AND lease_epoch>0),
 lease_token TEXT NOT NULL CHECK(length(trim(lease_token))>0),
 authorization_contexts_json TEXT NOT NULL CHECK(CASE WHEN json_valid(authorization_contexts_json) THEN json_type(authorization_contexts_json)='array' ELSE 0 END),
 dispatch_state TEXT NOT NULL CHECK(dispatch_state IN ('NOT_SENT','MAY_HAVE_BEEN_SENT','RESPONSE_RECEIVED')),
 status TEXT NOT NULL CHECK(status IN ('RUNNING','SUCCEEDED','FAILED','UNKNOWN')),
 started_at INTEGER NOT NULL CHECK(typeof(started_at)='integer' AND started_at>=0),
 ended_at INTEGER CHECK(ended_at IS NULL OR (typeof(ended_at)='integer' AND ended_at>=started_at)),
 result_json TEXT CHECK(result_json IS NULL OR CASE WHEN json_valid(result_json) THEN json_type(result_json)='object' ELSE 0 END),
 error_code TEXT,
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=started_at),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified>=gmt_create),
 UNIQUE(job_id,attempt_no),
 CHECK((status='RUNNING' AND ended_at IS NULL) OR (status<>'RUNNING' AND ended_at IS NOT NULL))
);
CREATE TABLE external_write_operation (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 human_decision_id TEXT NOT NULL UNIQUE CHECK(length(trim(human_decision_id))>0),
 work_item_id TEXT NOT NULL CHECK(length(trim(work_item_id))>0),
 service_provider_id TEXT NOT NULL CHECK(length(trim(service_provider_id))>0),
 installation_work_order_id TEXT NOT NULL CHECK(length(trim(installation_work_order_id))>0),
 source_system TEXT NOT NULL CHECK(length(trim(source_system))>0),
 interface_kind TEXT NOT NULL CHECK(interface_kind IN ('INSTALLATION_SUBMIT','REVIEW_SYNC')),
 action TEXT NOT NULL CHECK(action IN ('SUBMIT_INSTALLATION','APPROVE','REQUEST_SUPPLEMENT','SUBMIT_SUPPLEMENT')),
 request_json TEXT NOT NULL CHECK(CASE WHEN json_valid(request_json) THEN json_type(request_json)='object' ELSE 0 END),
 content_sha256 TEXT NOT NULL CHECK(length(content_sha256)=64 AND content_sha256 NOT GLOB '*[^0-9a-f]*'),
 status TEXT NOT NULL CHECK(status IN ('REGISTERED','PROCESSING','RESULT_UNKNOWN','SUCCEEDED','REJECTED')),
 receipt_json TEXT CHECK(receipt_json IS NULL OR CASE WHEN json_valid(receipt_json) THEN json_type(receipt_json)='object' ELSE 0 END),
 verified_at INTEGER CHECK(verified_at IS NULL OR (typeof(verified_at)='integer' AND verified_at>=gmt_create AND verified_at<=gmt_modified)),
 row_version INTEGER NOT NULL CHECK(typeof(row_version)='integer' AND row_version>=1),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified>=gmt_create),
 CHECK((interface_kind='INSTALLATION_SUBMIT' AND action='SUBMIT_INSTALLATION') OR (interface_kind='REVIEW_SYNC' AND action IN ('APPROVE','REQUEST_SUPPLEMENT','SUBMIT_SUPPLEMENT'))),
 CHECK((status IN ('SUCCEEDED','REJECTED') AND receipt_json IS NOT NULL AND verified_at IS NOT NULL) OR (status NOT IN ('SUCCEEDED','REJECTED') AND receipt_json IS NULL AND verified_at IS NULL))
);
CREATE UNIQUE INDEX uk_write_pending_order ON external_write_operation(installation_work_order_id) WHERE status NOT IN ('SUCCEEDED','REJECTED');
CREATE UNIQUE INDEX uk_write_pending_item ON external_write_operation(work_item_id) WHERE status NOT IN ('SUCCEEDED','REJECTED');
CREATE INDEX idx_write_history ON external_write_operation(work_item_id,gmt_create,id);

CREATE TRIGGER tr_feed_generation_insert BEFORE INSERT ON change_feed_generation BEGIN
 SELECT CASE WHEN NEW.current_cursor<>NEW.start_cursor OR NOT EXISTS(SELECT 1 FROM change_feed WHERE id=NEW.feed_id) THEN RAISE(ABORT,'invalid_feed_start') END;
END;
CREATE TRIGGER tr_feed_generation_update BEFORE UPDATE ON change_feed_generation BEGIN
 SELECT CASE WHEN NEW.state='READY' AND EXISTS(SELECT 1 FROM change_feed_generation WHERE feed_id=NEW.feed_id AND state='READY' AND id<>OLD.id) THEN RAISE(ABORT,'ready_generation_conflict') END;
 SELECT CASE WHEN NEW.id IS NOT OLD.id OR NEW.feed_id IS NOT OLD.feed_id OR NEW.generation_no<>OLD.generation_no OR NEW.scope_json IS NOT OLD.scope_json OR NEW.start_cursor IS NOT OLD.start_cursor OR NEW.gmt_create<>OLD.gmt_create OR NEW.gmt_modified<OLD.gmt_modified OR NEW.row_version<>OLD.row_version+1 OR OLD.state='RETIRED' THEN RAISE(ABORT,'feed_generation_conflict') END;
 SELECT CASE WHEN NEW.current_cursor<>OLD.current_cursor AND (OLD.state<>'READY' OR NOT EXISTS(SELECT 1 FROM change_batch WHERE generation_id=OLD.id AND from_cursor=OLD.current_cursor AND next_cursor=NEW.current_cursor)) THEN RAISE(ABORT,'cursor_requires_saved_batch') END;
END;
CREATE TRIGGER tr_trigger_scope BEFORE INSERT ON job_change_trigger BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM background_job j JOIN source_change c ON c.id=NEW.source_change_id JOIN change_feed_generation g ON g.id=NEW.generation_id AND g.feed_id=c.feed_id JOIN change_feed f ON f.id=c.feed_id AND f.service_provider_id=j.service_provider_id WHERE j.id=NEW.job_id) THEN RAISE(ABORT,'change_job_scope_mismatch') END;
END;
CREATE TRIGGER tr_batch_complete BEFORE INSERT ON change_batch BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM change_feed_generation WHERE id=NEW.generation_id AND current_cursor=NEW.from_cursor AND state='READY') THEN RAISE(ABORT,'batch_cursor_conflict') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.change_ids_json) i WHERE i.type<>'text' OR NOT EXISTS(SELECT 1 FROM source_change c JOIN change_feed_generation g ON g.feed_id=c.feed_id AND g.id=NEW.generation_id WHERE c.id=i.value) OR NOT EXISTS(SELECT 1 FROM job_change_trigger t WHERE t.source_change_id=i.value AND t.generation_id=NEW.generation_id)) OR
 (SELECT count(*) FROM json_each(NEW.change_ids_json))<>(SELECT count(DISTINCT value) FROM json_each(NEW.change_ids_json)) THEN RAISE(ABORT,'batch_missing_changes_or_jobs') END;
END;
CREATE TRIGGER tr_job_update BEFORE UPDATE ON background_job BEGIN
 SELECT CASE WHEN NEW.lease_token IS OLD.lease_token AND NEW.lease_owner IS NOT OLD.lease_owner THEN RAISE(ABORT,'lease_owner_conflict') END;
 SELECT CASE WHEN NEW.id IS NOT OLD.id OR NEW.purpose IS NOT OLD.purpose OR NEW.service_provider_id IS NOT OLD.service_provider_id OR NEW.work_item_id IS NOT OLD.work_item_id OR NEW.external_write_id IS NOT OLD.external_write_id OR NEW.target_json IS NOT OLD.target_json OR NEW.dedupe_key IS NOT OLD.dedupe_key OR NEW.gmt_create<>OLD.gmt_create OR NEW.gmt_modified<OLD.gmt_modified OR NEW.row_version<>OLD.row_version+1 OR OLD.status IN ('SUCCEEDED','FAILED','CANCELLED') THEN RAISE(ABORT,'job_update_conflict') END;
 SELECT CASE WHEN (NEW.lease_token IS NOT OLD.lease_token AND NEW.lease_token IS NOT NULL AND NEW.lease_epoch<>OLD.lease_epoch+1) OR ((NEW.lease_token IS OLD.lease_token OR NEW.lease_token IS NULL) AND NEW.lease_epoch<>OLD.lease_epoch) THEN RAISE(ABORT,'lease_epoch_conflict') END;
END;
CREATE TRIGGER tr_capability_input BEFORE INSERT ON capability_call BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM background_job WHERE id=NEW.job_id) THEN RAISE(ABORT,'capability_job_missing') END;
 SELECT CASE WHEN NEW.operation='PARSE_MATERIAL' AND NOT EXISTS(SELECT 1 FROM source_material_version WHERE id=NEW.source_material_version_id AND read_state='VERIFIED' AND content_sha256=NEW.input_sha256) THEN RAISE(ABORT,'capability_file_mismatch') END;
 SELECT CASE WHEN NEW.operation='ANALYZE_SKILL' AND NOT EXISTS(SELECT 1 FROM analysis_input_snapshot s JOIN background_job j ON j.id=NEW.job_id AND j.work_item_id=s.work_item_id AND j.service_provider_id=s.service_provider_id WHERE s.id=NEW.input_snapshot_id AND s.content_sha256=NEW.input_sha256) THEN RAISE(ABORT,'capability_snapshot_mismatch') END;
END;
CREATE TRIGGER tr_attempt_insert BEFORE INSERT ON execution_attempt BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM identity_reference WHERE id=NEW.executor_identity_id AND subject_type='SERVICE') THEN RAISE(ABORT,'attempt_requires_service') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM background_job WHERE id=NEW.job_id AND status='RUNNING' AND lease_epoch=NEW.lease_epoch AND lease_token=NEW.lease_token AND lease_owner=NEW.executor_identity_id AND lease_until>NEW.started_at) THEN RAISE(ABORT,'attempt_lease_mismatch') END;
 SELECT CASE WHEN NEW.capability_call_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM capability_call WHERE id=NEW.capability_call_id AND job_id=NEW.job_id) THEN RAISE(ABORT,'attempt_call_mismatch') END;
END;
CREATE TRIGGER tr_attempt_update BEFORE UPDATE ON execution_attempt BEGIN
 SELECT CASE WHEN OLD.status<>'RUNNING' OR NEW.id IS NOT OLD.id OR NEW.job_id IS NOT OLD.job_id OR NEW.attempt_no<>OLD.attempt_no OR NEW.executor_identity_id IS NOT OLD.executor_identity_id OR NEW.capability_call_id IS NOT OLD.capability_call_id OR NEW.lease_epoch<>OLD.lease_epoch OR NEW.lease_token IS NOT OLD.lease_token OR NEW.started_at<>OLD.started_at OR NEW.gmt_create<>OLD.gmt_create OR NEW.gmt_modified<OLD.gmt_modified THEN RAISE(ABORT,'attempt_history_fixed') END;
 SELECT CASE WHEN (OLD.dispatch_state<>'NOT_SENT' AND NEW.dispatch_state='NOT_SENT') OR (OLD.dispatch_state='RESPONSE_RECEIVED' AND NEW.dispatch_state<>'RESPONSE_RECEIVED') THEN RAISE(ABORT,'dispatch_cannot_rewind') END;
 SELECT CASE WHEN OLD.dispatch_state<>'NOT_SENT' AND NEW.authorization_contexts_json IS NOT OLD.authorization_contexts_json THEN RAISE(ABORT,'dispatched_authorization_fixed') END;
END;
CREATE TRIGGER tr_external_write_insert BEFORE INSERT ON external_write_operation BEGIN
 SELECT CASE WHEN NEW.status<>'REGISTERED' OR NEW.row_version<>1 THEN RAISE(ABORT,'new_write_must_be_registered') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM human_decision d JOIN work_item w ON w.id=d.work_item_id WHERE d.id=NEW.human_decision_id AND d.origin='LOCAL' AND d.action_type=NEW.action AND d.work_item_id=NEW.work_item_id AND d.service_provider_id=NEW.service_provider_id AND w.installation_work_order_id=NEW.installation_work_order_id AND w.service_provider_id=NEW.service_provider_id AND w.status<>'COMPLETED' AND (w.pending_write_id IS NULL OR w.pending_write_id=NEW.id)) THEN RAISE(ABORT,'write_decision_scope_mismatch') END;
END;
CREATE TRIGGER tr_external_write_update BEFORE UPDATE ON external_write_operation BEGIN
 SELECT CASE WHEN OLD.status IN ('SUCCEEDED','REJECTED') OR NEW.id IS NOT OLD.id OR NEW.human_decision_id IS NOT OLD.human_decision_id OR NEW.work_item_id IS NOT OLD.work_item_id OR NEW.service_provider_id IS NOT OLD.service_provider_id OR NEW.installation_work_order_id IS NOT OLD.installation_work_order_id OR NEW.source_system IS NOT OLD.source_system OR NEW.interface_kind IS NOT OLD.interface_kind OR NEW.action IS NOT OLD.action OR NEW.request_json IS NOT OLD.request_json OR NEW.content_sha256 IS NOT OLD.content_sha256 OR NEW.gmt_create<>OLD.gmt_create OR NEW.row_version<>OLD.row_version+1 OR NEW.gmt_modified<OLD.gmt_modified OR (OLD.status<>'REGISTERED' AND NEW.status='REGISTERED') OR (OLD.status='RESULT_UNKNOWN' AND NEW.status='PROCESSING') THEN RAISE(ABORT,'write_content_or_state_conflict') END;
END;

-- Generated explicit history guards; rebuild with build-schema-guards.py.
CREATE TRIGGER guard_change_feed_no_replace BEFORE INSERT ON change_feed WHEN EXISTS(SELECT 1 FROM change_feed old WHERE old.id=NEW.id) BEGIN SELECT RAISE(ABORT,'replacement_write_forbidden'); END;
CREATE TRIGGER guard_change_feed_no_delete BEFORE DELETE ON change_feed BEGIN SELECT RAISE(ABORT,'execution_history_delete_forbidden'); END;
CREATE TRIGGER guard_change_feed_fixed BEFORE UPDATE ON change_feed BEGIN SELECT RAISE(ABORT,'execution_history_immutable'); END;
CREATE TRIGGER guard_change_feed_generation_no_replace BEFORE INSERT ON change_feed_generation WHEN EXISTS(SELECT 1 FROM change_feed_generation old WHERE old.id=NEW.id OR (old.feed_id=NEW.feed_id AND (old.state='READY') AND (NEW.state='READY')) OR (old.feed_id=NEW.feed_id AND old.generation_no=NEW.generation_no)) BEGIN SELECT RAISE(ABORT,'replacement_write_forbidden'); END;
CREATE TRIGGER guard_change_feed_generation_no_delete BEFORE DELETE ON change_feed_generation BEGIN SELECT RAISE(ABORT,'execution_history_delete_forbidden'); END;
CREATE TRIGGER guard_source_change_no_replace BEFORE INSERT ON source_change WHEN EXISTS(SELECT 1 FROM source_change old WHERE old.id=NEW.id OR (old.feed_id=NEW.feed_id AND old.source_change_id=NEW.source_change_id)) BEGIN SELECT RAISE(ABORT,'replacement_write_forbidden'); END;
CREATE TRIGGER guard_source_change_no_delete BEFORE DELETE ON source_change BEGIN SELECT RAISE(ABORT,'execution_history_delete_forbidden'); END;
CREATE TRIGGER guard_source_change_fixed BEFORE UPDATE ON source_change BEGIN SELECT RAISE(ABORT,'execution_history_immutable'); END;
CREATE TRIGGER guard_change_batch_no_replace BEFORE INSERT ON change_batch WHEN EXISTS(SELECT 1 FROM change_batch old WHERE old.id=NEW.id OR (old.generation_id=NEW.generation_id AND old.from_cursor=NEW.from_cursor)) BEGIN SELECT RAISE(ABORT,'replacement_write_forbidden'); END;
CREATE TRIGGER guard_change_batch_no_delete BEFORE DELETE ON change_batch BEGIN SELECT RAISE(ABORT,'execution_history_delete_forbidden'); END;
CREATE TRIGGER guard_change_batch_fixed BEFORE UPDATE ON change_batch BEGIN SELECT RAISE(ABORT,'execution_history_immutable'); END;
CREATE TRIGGER guard_background_job_no_replace BEFORE INSERT ON background_job WHEN EXISTS(SELECT 1 FROM background_job old WHERE old.id=NEW.id OR (old.dedupe_key=NEW.dedupe_key)) BEGIN SELECT RAISE(ABORT,'replacement_write_forbidden'); END;
CREATE TRIGGER guard_background_job_no_delete BEFORE DELETE ON background_job BEGIN SELECT RAISE(ABORT,'execution_history_delete_forbidden'); END;
CREATE TRIGGER guard_job_change_trigger_no_replace BEFORE INSERT ON job_change_trigger WHEN EXISTS(SELECT 1 FROM job_change_trigger old WHERE old.id=NEW.id OR (old.job_id=NEW.job_id AND old.source_change_id=NEW.source_change_id AND old.generation_id=NEW.generation_id)) BEGIN SELECT RAISE(ABORT,'replacement_write_forbidden'); END;
CREATE TRIGGER guard_job_change_trigger_no_delete BEFORE DELETE ON job_change_trigger BEGIN SELECT RAISE(ABORT,'execution_history_delete_forbidden'); END;
CREATE TRIGGER guard_job_change_trigger_fixed BEFORE UPDATE ON job_change_trigger BEGIN SELECT RAISE(ABORT,'execution_history_immutable'); END;
CREATE TRIGGER guard_capability_call_no_replace BEFORE INSERT ON capability_call WHEN EXISTS(SELECT 1 FROM capability_call old WHERE old.id=NEW.id) BEGIN SELECT RAISE(ABORT,'replacement_write_forbidden'); END;
CREATE TRIGGER guard_capability_call_no_delete BEFORE DELETE ON capability_call BEGIN SELECT RAISE(ABORT,'execution_history_delete_forbidden'); END;
CREATE TRIGGER guard_capability_call_fixed BEFORE UPDATE ON capability_call BEGIN SELECT RAISE(ABORT,'execution_history_immutable'); END;
CREATE TRIGGER guard_execution_attempt_no_replace BEFORE INSERT ON execution_attempt WHEN EXISTS(SELECT 1 FROM execution_attempt old WHERE old.id=NEW.id OR (old.job_id=NEW.job_id AND old.attempt_no=NEW.attempt_no)) BEGIN SELECT RAISE(ABORT,'replacement_write_forbidden'); END;
CREATE TRIGGER guard_execution_attempt_no_delete BEFORE DELETE ON execution_attempt BEGIN SELECT RAISE(ABORT,'execution_history_delete_forbidden'); END;
CREATE TRIGGER guard_external_write_operation_no_replace BEFORE INSERT ON external_write_operation WHEN EXISTS(SELECT 1 FROM external_write_operation old WHERE old.id=NEW.id OR (old.work_item_id=NEW.work_item_id AND (old.status NOT IN ('SUCCEEDED','REJECTED')) AND (NEW.status NOT IN ('SUCCEEDED','REJECTED'))) OR (old.installation_work_order_id=NEW.installation_work_order_id AND (old.status NOT IN ('SUCCEEDED','REJECTED')) AND (NEW.status NOT IN ('SUCCEEDED','REJECTED'))) OR (old.human_decision_id=NEW.human_decision_id)) BEGIN SELECT RAISE(ABORT,'replacement_write_forbidden'); END;
CREATE TRIGGER guard_external_write_operation_no_delete BEFORE DELETE ON external_write_operation BEGIN SELECT RAISE(ABORT,'execution_history_delete_forbidden'); END;
