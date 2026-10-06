-- Foundation design candidate. Logical relations; no credentials stored here.
CREATE TABLE identity_reference (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 identity_source TEXT NOT NULL CHECK(length(trim(identity_source))>0),
 subject_id TEXT NOT NULL CHECK(length(trim(subject_id))>0),
 subject_type TEXT NOT NULL CHECK(subject_type IN ('HUMAN','SERVICE')),
 display_name TEXT NOT NULL CHECK(length(trim(display_name))>0),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified>=gmt_create),
 UNIQUE(identity_source,subject_id)
);
CREATE TABLE current_identity (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 identity_reference_id TEXT NOT NULL CHECK(length(trim(identity_reference_id))>0),
 subject_type TEXT NOT NULL CHECK(subject_type IN ('HUMAN','SERVICE')),
 verified_at INTEGER NOT NULL CHECK(typeof(verified_at)='integer' AND verified_at>=0),
 valid_until INTEGER CHECK(valid_until IS NULL OR (typeof(valid_until)='integer' AND valid_until>verified_at)),
 authorization_version TEXT CHECK(authorization_version IS NULL OR length(trim(authorization_version))>0),
 source_identities_json TEXT NOT NULL CHECK(CASE WHEN json_valid(source_identities_json) THEN json_type(source_identities_json)='array' ELSE 0 END),
 grant_count INTEGER NOT NULL CHECK(typeof(grant_count)='integer' AND grant_count>=0),
 request_key TEXT NOT NULL UNIQUE CHECK(length(trim(request_key))>0),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=verified_at),
 gmt_modified INTEGER NOT NULL CHECK(gmt_modified=gmt_create),
 CHECK(subject_type<>'SERVICE' OR json_array_length(source_identities_json)=0)
);
CREATE INDEX idx_current_identity_subject_time ON current_identity(identity_reference_id,verified_at DESC,id);
CREATE TABLE business_permission (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 context_id TEXT NOT NULL CHECK(length(trim(context_id))>0),
 grant_id TEXT NOT NULL CHECK(length(trim(grant_id))>0),
 business_role TEXT CHECK(business_role IS NULL OR business_role IN ('INSTALLATION_REVIEWER','BUSINESS_RECONCILER','PROVIDER_DOCUMENT_CLERK','PROVIDER_RECEIVABLE_OWNER','PROVIDER_INTEGRATION_CONTACT','FULFILLMENT_COORDINATOR')),
 actions_json TEXT NOT NULL CHECK(CASE WHEN json_valid(actions_json) THEN json_type(actions_json)='array' AND json_array_length(actions_json)>0 ELSE 0 END),
 scope_type TEXT NOT NULL CHECK(scope_type IN ('SERVICE_PROVIDER','INSTALLATION_WORK_ORDER','SOURCE_RECORD','CHANGE_FEED')),
 source_system TEXT,
 record_type TEXT,
 resource_ids_json TEXT NOT NULL CHECK(CASE WHEN json_valid(resource_ids_json) THEN json_type(resource_ids_json)='array' AND json_array_length(resource_ids_json)>0 ELSE 0 END),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(gmt_modified=gmt_create),
 UNIQUE(context_id,grant_id),
 CHECK((scope_type='SOURCE_RECORD' AND source_system IS NOT NULL AND length(trim(source_system))>0 AND record_type IS NOT NULL AND length(trim(record_type))>0)
  OR (scope_type<>'SOURCE_RECORD' AND source_system IS NULL AND record_type IS NULL))
);
CREATE TRIGGER tr_identity_reference_update BEFORE UPDATE ON identity_reference BEGIN
 SELECT CASE WHEN NEW.id IS NOT OLD.id OR NEW.identity_source IS NOT OLD.identity_source OR NEW.subject_id IS NOT OLD.subject_id OR NEW.subject_type IS NOT OLD.subject_type OR NEW.gmt_create<>OLD.gmt_create OR NEW.gmt_modified<OLD.gmt_modified THEN RAISE(ABORT,'identity_key_immutable') END;
END;
CREATE TRIGGER tr_business_permission_insert BEFORE INSERT ON business_permission BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM current_identity WHERE id=NEW.context_id) THEN RAISE(ABORT,'identity_context_sealed') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.resource_ids_json) WHERE type<>'text' OR length(trim(value))=0 OR value='*') OR
  (SELECT count(*) FROM json_each(NEW.resource_ids_json))<>(SELECT count(DISTINCT value) FROM json_each(NEW.resource_ids_json)) THEN RAISE(ABORT,'invalid_resource_scope') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.actions_json) WHERE type<>'text' OR value NOT IN
  ('READ_WORK_ITEM','READ_WORK_ORDER','READ_SOURCE_MATERIAL','READ_BILLING_RECORD','CONFIRM_INSTALLATION_DRAFT','SUBMIT_INSTALLATION_DETAIL','DECIDE_INSTALLATION_REVIEW','SUBMIT_SUPPLEMENT','REQUEST_BILLING_VERIFICATION','REPLY_BILLING_VERIFICATION','ENABLE_INTEGRATION_CONFIG','COMPLETE_FULFILLMENT_COORDINATION','RECORD_EXCEPTION_RESULT','READ_SOURCE_CHANGES','PREPARE_ANALYSIS')) OR
  (SELECT count(*) FROM json_each(NEW.actions_json))<>(SELECT count(DISTINCT value) FROM json_each(NEW.actions_json)) THEN RAISE(ABORT,'invalid_permission_action') END;
END;
CREATE TRIGGER tr_current_identity_seal BEFORE INSERT ON current_identity BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM identity_reference WHERE id=NEW.identity_reference_id AND subject_type=NEW.subject_type) THEN RAISE(ABORT,'identity_subject_mismatch') END;
 SELECT CASE WHEN NEW.grant_count<>(SELECT count(*) FROM business_permission WHERE context_id=NEW.id) THEN RAISE(ABORT,'grant_count_mismatch') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM business_permission g WHERE g.context_id=NEW.id AND
  ((NEW.subject_type='SERVICE' AND (g.business_role IS NOT NULL OR EXISTS(SELECT 1 FROM json_each(g.actions_json) WHERE value NOT IN ('READ_WORK_ITEM','READ_WORK_ORDER','READ_SOURCE_MATERIAL','READ_BILLING_RECORD','READ_SOURCE_CHANGES','PREPARE_ANALYSIS')))) OR
   (NEW.subject_type='HUMAN' AND (g.business_role IS NULL OR EXISTS(SELECT 1 FROM json_each(g.actions_json) WHERE value IN ('READ_SOURCE_CHANGES','PREPARE_ANALYSIS')))))) THEN RAISE(ABORT,'subject_permission_mismatch') END;
END;
CREATE TRIGGER tr_current_identity_fixed BEFORE UPDATE ON current_identity BEGIN SELECT RAISE(ABORT,'authorization_history_immutable'); END;
CREATE TRIGGER tr_business_permission_fixed BEFORE UPDATE ON business_permission BEGIN SELECT RAISE(ABORT,'authorization_history_immutable'); END;
CREATE TRIGGER tr_identity_reference_no_delete BEFORE DELETE ON identity_reference BEGIN SELECT RAISE(ABORT,'identity_delete_forbidden'); END;
CREATE TRIGGER tr_current_identity_no_delete BEFORE DELETE ON current_identity BEGIN SELECT RAISE(ABORT,'identity_delete_forbidden'); END;
CREATE TRIGGER tr_business_permission_no_delete BEFORE DELETE ON business_permission BEGIN SELECT RAISE(ABORT,'identity_delete_forbidden'); END;
CREATE TRIGGER tr_identity_reference_no_replace BEFORE INSERT ON identity_reference WHEN EXISTS(SELECT 1 FROM identity_reference WHERE id=NEW.id OR (identity_source=NEW.identity_source AND subject_id=NEW.subject_id)) BEGIN SELECT RAISE(ABORT,'identity_replace_forbidden'); END;
CREATE TRIGGER tr_current_identity_no_replace BEFORE INSERT ON current_identity WHEN EXISTS(SELECT 1 FROM current_identity WHERE id=NEW.id OR request_key=NEW.request_key) BEGIN SELECT RAISE(ABORT,'identity_replace_forbidden'); END;
CREATE TRIGGER tr_business_permission_no_replace BEFORE INSERT ON business_permission WHEN EXISTS(SELECT 1 FROM business_permission WHERE id=NEW.id OR (context_id=NEW.context_id AND grant_id=NEW.grant_id)) BEGIN SELECT RAISE(ABORT,'identity_replace_forbidden'); END;
