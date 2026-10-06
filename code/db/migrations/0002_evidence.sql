-- Evidence domain design candidate, not a production migration.
-- Load after work-item-schema.sql. No physical foreign keys; service guards remain required.
CREATE TABLE source_material (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 source_system TEXT NOT NULL CHECK(length(trim(source_system))>0),
 source_material_id TEXT NOT NULL CHECK(length(trim(source_material_id))>0),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified=gmt_create)
);
CREATE UNIQUE INDEX uk_source_material_source ON source_material(source_system,source_material_id);
CREATE TRIGGER source_material_no_delete BEFORE DELETE ON source_material
BEGIN SELECT RAISE(ABORT,'history cannot be deleted'); END;
CREATE TRIGGER source_material_no_update BEFORE UPDATE ON source_material
BEGIN SELECT RAISE(ABORT,'fixed history cannot be updated'); END;

CREATE TABLE source_material_version (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 source_material_id TEXT NOT NULL CHECK(length(trim(source_material_id))>0),
 source_version TEXT NOT NULL CHECK(length(trim(source_version))>0),
 read_state TEXT NOT NULL CHECK(read_state IN ('REFERENCED','VERIFIED')),
 name TEXT CHECK(name IS NULL OR length(trim(name))>0),
 media_type TEXT CHECK(media_type IS NULL OR media_type IN ('application/pdf','image/png','image/jpeg','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
 byte_length INTEGER CHECK(byte_length IS NULL OR (typeof(byte_length)='integer' AND byte_length>0)),
 content_sha256 TEXT CHECK(content_sha256 IS NULL OR (length(content_sha256)=64 AND content_sha256 NOT GLOB '*[^0-9a-f]*')),
 content_locator TEXT CHECK(content_locator IS NULL OR length(trim(content_locator))>0),
 retrieved_at INTEGER CHECK(retrieved_at IS NULL OR (typeof(retrieved_at)='integer' AND retrieved_at>=0 AND retrieved_at<=gmt_modified)),
 source_updated_at INTEGER CHECK(source_updated_at IS NULL OR (typeof(source_updated_at)='integer' AND source_updated_at>=0)),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified>=gmt_create),
 CHECK((read_state='REFERENCED' AND name IS NULL AND media_type IS NULL AND byte_length IS NULL AND content_sha256 IS NULL AND content_locator IS NULL AND retrieved_at IS NULL AND source_updated_at IS NULL) OR (read_state='VERIFIED' AND name IS NOT NULL AND media_type IS NOT NULL AND byte_length IS NOT NULL AND content_sha256 IS NOT NULL AND content_locator IS NOT NULL AND retrieved_at IS NOT NULL))
);
CREATE UNIQUE INDEX uk_source_material_version_source ON source_material_version(source_material_id,source_version);
CREATE TRIGGER source_material_version_no_delete BEFORE DELETE ON source_material_version
BEGIN SELECT RAISE(ABORT,'history cannot be deleted'); END;

CREATE TABLE material_parsing (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 run_id TEXT NOT NULL CHECK(length(trim(run_id))>0),
 source_material_version_id TEXT NOT NULL CHECK(length(trim(source_material_version_id))>0),
 content_sha256 TEXT NOT NULL CHECK((length(content_sha256)=64 AND content_sha256 NOT GLOB '*[^0-9a-f]*')),
 profile_id TEXT NOT NULL CHECK(length(trim(profile_id))>0),
 implementation_version TEXT NOT NULL CHECK(length(trim(implementation_version))>0),
 completeness TEXT NOT NULL CHECK(completeness IN ('COMPLETE','INCOMPLETE')),
 units_json TEXT NOT NULL CHECK(CASE WHEN json_valid(units_json) THEN json_type(units_json)='array' ELSE 0 END),
 blocks_json TEXT NOT NULL CHECK(CASE WHEN json_valid(blocks_json) THEN json_type(blocks_json)='array' ELSE 0 END),
 issues_json TEXT NOT NULL CHECK(CASE WHEN json_valid(issues_json) THEN json_type(issues_json)='array' ELSE 0 END),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified=gmt_create),
 CHECK(json_array_length(units_json)>0),
 CHECK(completeness!='INCOMPLETE' OR json_array_length(issues_json)>0)
);
CREATE UNIQUE INDEX uk_material_parsing_run ON material_parsing(run_id);
CREATE INDEX idx_material_parsing_version ON material_parsing(source_material_version_id,gmt_create,id);
CREATE TRIGGER material_parsing_no_delete BEFORE DELETE ON material_parsing
BEGIN SELECT RAISE(ABORT,'history cannot be deleted'); END;
CREATE TRIGGER material_parsing_no_update BEFORE UPDATE ON material_parsing
BEGIN SELECT RAISE(ABORT,'fixed history cannot be updated'); END;

CREATE TABLE analysis_input_snapshot (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 analysis_generation INTEGER NOT NULL DEFAULT 1 CHECK(typeof(analysis_generation)='integer' AND analysis_generation>=1),
 work_item_id TEXT NOT NULL CHECK(length(trim(work_item_id))>0),
 service_provider_id TEXT NOT NULL CHECK(length(trim(service_provider_id))>0),
 expected_work_item_version INTEGER NOT NULL CHECK(typeof(expected_work_item_version)='integer' AND expected_work_item_version>=1),
 skill TEXT NOT NULL CHECK(skill IN ('INTEGRATION_CONFIGURATION','INSTALLATION_EXTRACTION','INSTALLATION_EVIDENCE','RECONCILIATION_EXPLANATION')),
 skill_version TEXT NOT NULL CHECK(length(trim(skill_version))>0),
 output_schema_version TEXT NOT NULL CHECK(length(trim(output_schema_version))>0),
 config_versions_json TEXT NOT NULL CHECK(CASE WHEN json_valid(config_versions_json) THEN json_type(config_versions_json)='array' ELSE 0 END),
 required_input_state TEXT NOT NULL CHECK(required_input_state IN ('COMPLETE','INCOMPLETE','UNKNOWN')),
 input_issues_json TEXT NOT NULL CHECK(CASE WHEN json_valid(input_issues_json) THEN json_type(input_issues_json)='array' ELSE 0 END),
 input_item_count INTEGER NOT NULL CHECK(typeof(input_item_count)='integer' AND input_item_count>=0),
 content_sha256 TEXT NOT NULL CHECK((length(content_sha256)=64 AND content_sha256 NOT GLOB '*[^0-9a-f]*')),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified=gmt_create),
 CHECK(required_input_state='COMPLETE' OR json_array_length(input_issues_json)>0)
);
CREATE INDEX idx_analysis_input_snapshot_item ON analysis_input_snapshot(work_item_id,gmt_create,id);
CREATE TRIGGER analysis_input_snapshot_no_delete BEFORE DELETE ON analysis_input_snapshot
BEGIN SELECT RAISE(ABORT,'history cannot be deleted'); END;
CREATE TRIGGER analysis_input_snapshot_no_update BEFORE UPDATE ON analysis_input_snapshot
BEGIN SELECT RAISE(ABORT,'fixed history cannot be updated'); END;

CREATE TABLE analysis_input_item (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 snapshot_id TEXT NOT NULL CHECK(length(trim(snapshot_id))>0),
 input_key TEXT NOT NULL CHECK(length(trim(input_key))>0),
 input_kind TEXT NOT NULL CHECK(input_kind IN ('RECORD','PARSED_MATERIAL')),
 record_type TEXT CHECK(record_type IS NULL OR length(trim(record_type))>0),
 source_system TEXT CHECK(source_system IS NULL OR length(trim(source_system))>0),
 source_record_id TEXT CHECK(source_record_id IS NULL OR length(trim(source_record_id))>0),
 source_version TEXT CHECK(source_version IS NULL OR length(trim(source_version))>0),
 data_json TEXT CHECK(data_json IS NULL OR CASE WHEN json_valid(data_json) THEN json_type(data_json)='object' ELSE 0 END),
 parsing_id TEXT CHECK(parsing_id IS NULL OR length(trim(parsing_id))>0),
 retrieved_at INTEGER NOT NULL CHECK(typeof(retrieved_at)='integer' AND retrieved_at>=0 AND retrieved_at<=gmt_create),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified=gmt_create),
 CHECK((input_kind='RECORD' AND record_type IS NOT NULL AND source_system IS NOT NULL AND source_record_id IS NOT NULL AND data_json IS NOT NULL AND parsing_id IS NULL) OR (input_kind='PARSED_MATERIAL' AND parsing_id IS NOT NULL AND input_key=parsing_id AND record_type IS NULL AND source_system IS NULL AND source_record_id IS NULL AND source_version IS NULL AND data_json IS NULL))
);
CREATE UNIQUE INDEX uk_analysis_input_item_key ON analysis_input_item(snapshot_id,input_key);
CREATE INDEX idx_analysis_input_item_parsing ON analysis_input_item(parsing_id,snapshot_id);
CREATE INDEX idx_analysis_input_item_source ON analysis_input_item(source_system,record_type,source_record_id,snapshot_id);
CREATE TRIGGER analysis_input_item_no_delete BEFORE DELETE ON analysis_input_item
BEGIN SELECT RAISE(ABORT,'history cannot be deleted'); END;
CREATE TRIGGER analysis_input_item_no_update BEFORE UPDATE ON analysis_input_item
BEGIN SELECT RAISE(ABORT,'fixed history cannot be updated'); END;

CREATE TABLE analysis_result (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 run_id TEXT NOT NULL CHECK(length(trim(run_id))>0),
 work_item_id TEXT NOT NULL CHECK(length(trim(work_item_id))>0),
 snapshot_id TEXT NOT NULL CHECK(length(trim(snapshot_id))>0),
 profile_id TEXT NOT NULL CHECK(length(trim(profile_id))>0),
 implementation_version TEXT NOT NULL CHECK(length(trim(implementation_version))>0),
 status TEXT NOT NULL CHECK(status IN ('ANALYZED','NEEDS_INFORMATION')),
 summary TEXT NOT NULL CHECK(length(trim(summary))>0),
 findings_json TEXT NOT NULL CHECK(CASE WHEN json_valid(findings_json) THEN json_type(findings_json)='array' ELSE 0 END),
 open_questions_json TEXT NOT NULL CHECK(CASE WHEN json_valid(open_questions_json) THEN json_type(open_questions_json)='array' ELSE 0 END),
 validated_at INTEGER NOT NULL CHECK(typeof(validated_at)='integer' AND validated_at>=0 AND validated_at<=gmt_create),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified=gmt_create),
 CHECK(status!='NEEDS_INFORMATION' OR json_array_length(open_questions_json)>0)
);
CREATE UNIQUE INDEX uk_analysis_result_run ON analysis_result(run_id);
CREATE INDEX idx_analysis_result_item ON analysis_result(work_item_id,gmt_create,id);
CREATE INDEX idx_analysis_result_snapshot ON analysis_result(snapshot_id,gmt_create,id);
CREATE TRIGGER analysis_result_no_delete BEFORE DELETE ON analysis_result
BEGIN SELECT RAISE(ABORT,'history cannot be deleted'); END;
CREATE TRIGGER analysis_result_no_update BEFORE UPDATE ON analysis_result
BEGIN SELECT RAISE(ABORT,'fixed history cannot be updated'); END;

CREATE TRIGGER source_material_version_verify_once BEFORE UPDATE ON source_material_version
WHEN OLD.read_state!='REFERENCED' OR NEW.read_state!='VERIFIED'
 OR NEW.id IS NOT OLD.id OR NEW.source_material_id IS NOT OLD.source_material_id
 OR NEW.source_version IS NOT OLD.source_version OR NEW.gmt_create IS NOT OLD.gmt_create
 OR NEW.gmt_modified<OLD.gmt_modified
BEGIN SELECT RAISE(ABORT,'only first verified content may be filled'); END;

CREATE TRIGGER material_parsing_verified_input BEFORE INSERT ON material_parsing
WHEN NOT EXISTS (SELECT 1 FROM source_material_version v WHERE v.id=NEW.source_material_version_id
 AND v.read_state='VERIFIED' AND v.content_sha256=NEW.content_sha256 AND v.gmt_modified<=NEW.gmt_create)
BEGIN SELECT RAISE(ABORT,'parsing requires the verified exact file'); END;

CREATE TRIGGER analysis_input_item_frozen_snapshot BEFORE INSERT ON analysis_input_item
WHEN EXISTS (SELECT 1 FROM analysis_input_snapshot s WHERE s.id=NEW.snapshot_id)
BEGIN SELECT RAISE(ABORT,'snapshot input set already frozen'); END;

CREATE TRIGGER analysis_input_item_existing_parse BEFORE INSERT ON analysis_input_item
WHEN NEW.input_kind='PARSED_MATERIAL'
 AND NOT EXISTS (SELECT 1 FROM material_parsing p WHERE p.id=NEW.parsing_id AND p.gmt_create<=NEW.retrieved_at)
BEGIN SELECT RAISE(ABORT,'parsed material must exist'); END;

CREATE TRIGGER analysis_input_snapshot_seal BEFORE INSERT ON analysis_input_snapshot
WHEN NEW.input_item_count!=(SELECT count(*) FROM analysis_input_item i WHERE i.snapshot_id=NEW.id)
 OR EXISTS (SELECT 1 FROM analysis_input_item i WHERE i.snapshot_id=NEW.id AND i.gmt_create>NEW.gmt_create)
BEGIN SELECT RAISE(ABORT,'snapshot count or local time mismatch'); END;

CREATE TRIGGER analysis_result_fixed_input BEFORE INSERT ON analysis_result
WHEN NOT EXISTS (SELECT 1 FROM analysis_input_snapshot s WHERE s.id=NEW.snapshot_id
 AND s.work_item_id=NEW.work_item_id AND s.gmt_create<=NEW.validated_at
 AND (s.required_input_state='COMPLETE' OR NEW.status='NEEDS_INFORMATION'))
BEGIN SELECT RAISE(ABORT,'analysis snapshot scope or required input mismatch'); END;


-- Reject replacement writes explicitly, even when recursive_triggers is off.
CREATE TRIGGER source_material_no_replace BEFORE INSERT ON source_material
WHEN EXISTS (SELECT 1 FROM source_material old WHERE (old.id=NEW.id) OR (old.source_system=NEW.source_system AND old.source_material_id=NEW.source_material_id))
BEGIN SELECT RAISE(ABORT,'existing identity must be read and compared, not replaced'); END;

CREATE TRIGGER source_material_version_no_replace BEFORE INSERT ON source_material_version
WHEN EXISTS (SELECT 1 FROM source_material_version old WHERE (old.id=NEW.id) OR (old.source_material_id=NEW.source_material_id AND old.source_version=NEW.source_version))
BEGIN SELECT RAISE(ABORT,'existing identity must be read and compared, not replaced'); END;

CREATE TRIGGER material_parsing_no_replace BEFORE INSERT ON material_parsing
WHEN EXISTS (SELECT 1 FROM material_parsing old WHERE (old.id=NEW.id) OR (old.run_id=NEW.run_id))
BEGIN SELECT RAISE(ABORT,'existing identity must be read and compared, not replaced'); END;

CREATE TRIGGER analysis_input_snapshot_no_replace BEFORE INSERT ON analysis_input_snapshot
WHEN EXISTS (SELECT 1 FROM analysis_input_snapshot old WHERE (old.id=NEW.id))
BEGIN SELECT RAISE(ABORT,'existing identity must be read and compared, not replaced'); END;

CREATE TRIGGER analysis_input_item_no_replace BEFORE INSERT ON analysis_input_item
WHEN EXISTS (SELECT 1 FROM analysis_input_item old WHERE (old.id=NEW.id) OR (old.snapshot_id=NEW.snapshot_id AND old.input_key=NEW.input_key))
BEGIN SELECT RAISE(ABORT,'existing identity must be read and compared, not replaced'); END;

CREATE TRIGGER analysis_result_no_replace BEFORE INSERT ON analysis_result
WHEN EXISTS (SELECT 1 FROM analysis_result old WHERE (old.id=NEW.id) OR (old.run_id=NEW.run_id))
BEGIN SELECT RAISE(ABORT,'existing identity must be read and compared, not replaced'); END;
