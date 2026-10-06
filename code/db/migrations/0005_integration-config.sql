-- Integration configuration candidate; local SQLite checks only.
-- Load after work-item, evidence, installation and reconciliation candidates.

CREATE TABLE integration_config (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 service_provider_id TEXT NOT NULL CHECK(length(trim(service_provider_id))>0),
 source_system TEXT NOT NULL CHECK(length(trim(source_system))>0),
 purpose TEXT NOT NULL CHECK(purpose IN ('INSTALLATION','RECONCILIATION')),
 business_scope_key TEXT NOT NULL CHECK(length(trim(business_scope_key))>0),
 current_version_id TEXT CHECK(current_version_id IS NULL OR length(trim(current_version_id))>0),
 current_activation_result_id TEXT CHECK(current_activation_result_id IS NULL OR length(trim(current_activation_result_id))>0),
 row_version INTEGER NOT NULL CHECK(typeof(row_version)='integer' AND row_version>=1),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified>=gmt_create),
 CHECK((current_version_id IS NULL)=(current_activation_result_id IS NULL))
);
CREATE UNIQUE INDEX uk_integration_config_scope ON integration_config(service_provider_id,source_system,purpose,business_scope_key);
CREATE INDEX idx_integration_config_provider ON integration_config(service_provider_id,purpose,id);
CREATE TRIGGER integration_config_no_delete BEFORE DELETE ON integration_config
BEGIN SELECT RAISE(ABORT,'configuration history cannot be deleted'); END;
CREATE TRIGGER integration_config_no_replace BEFORE INSERT ON integration_config
WHEN EXISTS (SELECT 1 FROM integration_config old WHERE old.id=NEW.id OR (old.service_provider_id=NEW.service_provider_id AND old.source_system=NEW.source_system AND old.purpose=NEW.purpose AND old.business_scope_key=NEW.business_scope_key))
BEGIN SELECT RAISE(ABORT,'read existing record; never replace history'); END;

CREATE TABLE integration_config_version (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 integration_config_id TEXT NOT NULL CHECK(length(trim(integration_config_id))>0),
 work_item_id TEXT NOT NULL CHECK(length(trim(work_item_id))>0),
 version_no INTEGER NOT NULL CHECK(typeof(version_no)='integer' AND version_no>=1),
 parent_version_id TEXT CHECK(parent_version_id IS NULL OR length(trim(parent_version_id))>0),
 analysis_result_id TEXT NOT NULL CHECK(length(trim(analysis_result_id))>0),
 origin TEXT NOT NULL CHECK(origin IN ('AI','HUMAN')),
 editor_identity_id TEXT CHECK(editor_identity_id IS NULL OR length(trim(editor_identity_id))>0),
 save_key TEXT NOT NULL CHECK(length(trim(save_key))>0),
 format_status TEXT NOT NULL CHECK(format_status IN ('PROVIDED','NOT_PROVIDED','UNKNOWN')),
 source_format_id TEXT CHECK(source_format_id IS NULL OR length(trim(source_format_id))>0),
 source_format_version TEXT CHECK(source_format_version IS NULL OR length(trim(source_format_version))>0),
 applicability_json TEXT NOT NULL CHECK(CASE WHEN json_valid(applicability_json) THEN json_type(applicability_json)='object' ELSE 0 END),
 rules_json TEXT NOT NULL CHECK(CASE WHEN json_valid(rules_json) THEN json_type(rules_json)='array' ELSE 0 END),
 open_questions_json TEXT NOT NULL CHECK(CASE WHEN json_valid(open_questions_json) THEN json_type(open_questions_json)='array' ELSE 0 END),
 rule_catalog_version TEXT NOT NULL CHECK(length(trim(rule_catalog_version))>0),
 edit_notes_json TEXT NOT NULL CHECK(CASE WHEN json_valid(edit_notes_json) THEN json_type(edit_notes_json)='array' ELSE 0 END),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified=gmt_create),
 CHECK((version_no=1 AND parent_version_id IS NULL) OR (version_no>1 AND parent_version_id IS NOT NULL)),
 CHECK((origin='AI' AND editor_identity_id IS NULL) OR (origin='HUMAN' AND editor_identity_id IS NOT NULL)),
 CHECK((format_status='PROVIDED' AND source_format_id IS NOT NULL) OR (format_status!='PROVIDED' AND source_format_id IS NULL AND source_format_version IS NULL))
);
CREATE UNIQUE INDEX uk_integration_config_version_no ON integration_config_version(integration_config_id,version_no);
CREATE UNIQUE INDEX uk_integration_config_version_save ON integration_config_version(integration_config_id,save_key);
CREATE INDEX idx_integration_config_version_item ON integration_config_version(work_item_id,gmt_create,id);
CREATE TRIGGER integration_config_version_no_delete BEFORE DELETE ON integration_config_version
BEGIN SELECT RAISE(ABORT,'configuration history cannot be deleted'); END;
CREATE TRIGGER integration_config_version_no_update BEFORE UPDATE ON integration_config_version
BEGIN SELECT RAISE(ABORT,'configuration history is fixed'); END;
CREATE TRIGGER integration_config_version_no_replace BEFORE INSERT ON integration_config_version
WHEN EXISTS (SELECT 1 FROM integration_config_version old WHERE old.id=NEW.id OR (old.integration_config_id=NEW.integration_config_id AND old.version_no=NEW.version_no) OR (old.integration_config_id=NEW.integration_config_id AND old.save_key=NEW.save_key))
BEGIN SELECT RAISE(ABORT,'read existing record; never replace history'); END;

CREATE TABLE configuration_trial (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 configuration_version_id TEXT NOT NULL CHECK(length(trim(configuration_version_id))>0),
 snapshot_id TEXT NOT NULL CHECK(length(trim(snapshot_id))>0),
 execution_key TEXT NOT NULL CHECK(length(trim(execution_key))>0),
 transformer_version TEXT NOT NULL CHECK(length(trim(transformer_version))>0),
 status TEXT NOT NULL CHECK(status IN ('PASSED','FAILED','NEEDS_INFORMATION')),
 output_json TEXT CHECK(output_json IS NULL OR CASE WHEN json_valid(output_json) THEN json_type(output_json)='object' ELSE 0 END),
 rule_results_json TEXT NOT NULL CHECK(CASE WHEN json_valid(rule_results_json) THEN json_type(rule_results_json)='array' ELSE 0 END),
 issues_json TEXT NOT NULL CHECK(CASE WHEN json_valid(issues_json) THEN json_type(issues_json)='array' ELSE 0 END),
 checks_json TEXT NOT NULL CHECK(CASE WHEN json_valid(checks_json) THEN json_type(checks_json)='object' ELSE 0 END),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified=gmt_create),
 CHECK(status='PASSED' OR json_array_length(issues_json)>0),
 CHECK(status!='PASSED' OR (output_json IS NOT NULL AND json_array_length(issues_json)=0)),
 CHECK(status!='PASSED' OR COALESCE(json_type(checks_json,'$.input_complete')='true',0)),
 CHECK(status!='PASSED' OR COALESCE(json_type(checks_json,'$.scope_valid')='true',0)),
 CHECK(status!='PASSED' OR COALESCE(json_type(checks_json,'$.rules_covered')='true',0)),
 CHECK(status!='PASSED' OR COALESCE(json_type(checks_json,'$.outputs_valid')='true',0)),
 CHECK(status!='PASSED' OR COALESCE(json_type(checks_json,'$.meanings_resolved')='true',0))
);
CREATE UNIQUE INDEX uk_configuration_trial_execution ON configuration_trial(execution_key);
CREATE INDEX idx_configuration_trial_version ON configuration_trial(configuration_version_id,gmt_create,id);
CREATE TRIGGER configuration_trial_no_delete BEFORE DELETE ON configuration_trial
BEGIN SELECT RAISE(ABORT,'configuration history cannot be deleted'); END;
CREATE TRIGGER configuration_trial_no_update BEFORE UPDATE ON configuration_trial
BEGIN SELECT RAISE(ABORT,'configuration history is fixed'); END;
CREATE TRIGGER configuration_trial_no_replace BEFORE INSERT ON configuration_trial
WHEN EXISTS (SELECT 1 FROM configuration_trial old WHERE old.id=NEW.id OR (old.execution_key=NEW.execution_key))
BEGIN SELECT RAISE(ABORT,'read existing record; never replace history'); END;

CREATE TABLE configuration_enablement (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 human_decision_id TEXT NOT NULL CHECK(length(trim(human_decision_id))>0),
 configuration_version_id TEXT NOT NULL CHECK(length(trim(configuration_version_id))>0),
 trial_id TEXT NOT NULL CHECK(length(trim(trial_id))>0),
 expected_config_version INTEGER NOT NULL CHECK(typeof(expected_config_version)='integer' AND expected_config_version>=1),
 expected_active_version_id TEXT CHECK(expected_active_version_id IS NULL OR length(trim(expected_active_version_id))>0),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified=gmt_create)
);
CREATE UNIQUE INDEX uk_configuration_enablement_decision ON configuration_enablement(human_decision_id);
CREATE INDEX idx_configuration_enablement_version ON configuration_enablement(configuration_version_id,gmt_create,id);
CREATE TRIGGER configuration_enablement_no_delete BEFORE DELETE ON configuration_enablement
BEGIN SELECT RAISE(ABORT,'configuration history cannot be deleted'); END;
CREATE TRIGGER configuration_enablement_no_update BEFORE UPDATE ON configuration_enablement
BEGIN SELECT RAISE(ABORT,'configuration history is fixed'); END;
CREATE TRIGGER configuration_enablement_no_replace BEFORE INSERT ON configuration_enablement
WHEN EXISTS (SELECT 1 FROM configuration_enablement old WHERE old.id=NEW.id OR (old.human_decision_id=NEW.human_decision_id))
BEGIN SELECT RAISE(ABORT,'read existing record; never replace history'); END;

CREATE TABLE configuration_activation_result (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 enablement_id TEXT NOT NULL CHECK(length(trim(enablement_id))>0),
 outcome TEXT NOT NULL CHECK(outcome IN ('APPLIED','REJECTED')),
 reason_code TEXT CHECK(reason_code IS NULL OR length(trim(reason_code))>0),
 detail_json TEXT NOT NULL CHECK(CASE WHEN json_valid(detail_json) THEN json_type(detail_json)='object' ELSE 0 END),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified=gmt_create),
 CHECK((outcome='APPLIED' AND reason_code IS NULL) OR (outcome='REJECTED' AND reason_code IS NOT NULL))
);
CREATE UNIQUE INDEX uk_configuration_activation_enablement ON configuration_activation_result(enablement_id);
CREATE INDEX idx_configuration_activation_time ON configuration_activation_result(gmt_create,id);
CREATE TRIGGER configuration_activation_result_no_delete BEFORE DELETE ON configuration_activation_result
BEGIN SELECT RAISE(ABORT,'configuration history cannot be deleted'); END;
CREATE TRIGGER configuration_activation_result_no_update BEFORE UPDATE ON configuration_activation_result
BEGIN SELECT RAISE(ABORT,'configuration history is fixed'); END;
CREATE TRIGGER configuration_activation_result_no_replace BEFORE INSERT ON configuration_activation_result
WHEN EXISTS (SELECT 1 FROM configuration_activation_result old WHERE old.id=NEW.id OR (old.enablement_id=NEW.enablement_id))
BEGIN SELECT RAISE(ABORT,'read existing record; never replace history'); END;


CREATE TRIGGER integration_config_initial BEFORE INSERT ON integration_config
WHEN NEW.current_version_id IS NOT NULL OR NEW.current_activation_result_id IS NOT NULL OR NEW.row_version!=1
BEGIN SELECT RAISE(ABORT,'configuration begins without active version'); END;

CREATE TRIGGER integration_config_version_scope BEFORE INSERT ON integration_config_version
BEGIN
 SELECT CASE WHEN NOT EXISTS
 (SELECT 1 FROM integration_config c JOIN work_item w ON w.id=NEW.work_item_id
 JOIN analysis_result a ON a.id=NEW.analysis_result_id JOIN analysis_input_snapshot s ON s.id=a.snapshot_id
 WHERE c.id=NEW.integration_config_id AND w.integration_config_id=c.id AND w.item_kind='CONFIGURATION'
 AND w.installation_work_order_id IS NULL AND w.service_provider_id=c.service_provider_id
 AND a.work_item_id=w.id AND s.service_provider_id=c.service_provider_id AND s.skill='INTEGRATION_CONFIGURATION'
 AND a.gmt_create<=NEW.gmt_create AND c.gmt_create<=NEW.gmt_create)
 THEN RAISE(ABORT,'candidate config, item and analysis scope mismatch') END;
 SELECT CASE WHEN NEW.parent_version_id IS NOT NULL AND NOT EXISTS
 (SELECT 1 FROM integration_config_version v WHERE v.id=NEW.parent_version_id
 AND v.integration_config_id=NEW.integration_config_id AND v.version_no=NEW.version_no-1 AND v.gmt_create<=NEW.gmt_create)
 THEN RAISE(ABORT,'candidate requires preceding fixed config version') END;
 SELECT CASE WHEN EXISTS (SELECT 1 FROM json_each(NEW.rules_json)
 WHERE COALESCE(json_type(value,'$.ruleId')='text' AND length(trim(json_extract(value,'$.ruleId')))>0,0)=0)
 OR EXISTS (SELECT 1 FROM json_each(NEW.rules_json) GROUP BY json_extract(value,'$.ruleId') HAVING count(*)>1)
 THEN RAISE(ABORT,'rule identities must be nonempty and unique') END;
END;

CREATE TRIGGER configuration_trial_scope BEFORE INSERT ON configuration_trial
BEGIN
 SELECT CASE WHEN NOT EXISTS
 (SELECT 1 FROM integration_config_version v JOIN analysis_input_snapshot s ON s.id=NEW.snapshot_id
 JOIN integration_config c ON c.id=v.integration_config_id
 WHERE v.id=NEW.configuration_version_id AND s.work_item_id=v.work_item_id AND s.service_provider_id=c.service_provider_id
 AND s.skill='INTEGRATION_CONFIGURATION' AND v.gmt_create<=NEW.gmt_create AND s.gmt_create<=NEW.gmt_create
 AND EXISTS (SELECT 1 FROM json_each(s.config_versions_json) x
 WHERE json_extract(x.value,'$.configurationId')=c.id
 AND json_extract(x.value,'$.configurationVersionId')=v.id AND json_extract(x.value,'$.usage')='TRIAL_CANDIDATE'))
 THEN RAISE(ABORT,'trial must use exact candidate and its own fixed input') END;
 SELECT CASE WHEN NEW.status='PASSED' AND NOT EXISTS
 (SELECT 1 FROM integration_config_version v JOIN analysis_input_snapshot s ON s.id=NEW.snapshot_id
 WHERE v.id=NEW.configuration_version_id AND s.required_input_state='COMPLETE'
 AND v.format_status!='UNKNOWN' AND (v.format_status!='PROVIDED' OR v.source_format_version IS NOT NULL)
 AND json_array_length(v.open_questions_json)=0 AND json_array_length(v.rules_json)>0
 AND json_array_length(v.rules_json)=json_array_length(NEW.rule_results_json))
 THEN RAISE(ABORT,'passing trial requires complete inputs and resolved candidate') END;
 SELECT CASE WHEN NEW.status='PASSED' AND (
 EXISTS (SELECT 1 FROM json_each(NEW.rule_results_json) x
 WHERE COALESCE(json_extract(x.value,'$.status')='PASSED',0)=0 OR NOT EXISTS
 (SELECT 1 FROM integration_config_version v JOIN json_each(v.rules_json) r
 WHERE v.id=NEW.configuration_version_id AND json_extract(r.value,'$.ruleId')=json_extract(x.value,'$.ruleId')))
 OR EXISTS (SELECT 1 FROM json_each(NEW.rule_results_json) GROUP BY json_extract(value,'$.ruleId') HAVING count(*)>1))
 THEN RAISE(ABORT,'each required rule needs its own passing result') END;
END;

CREATE TRIGGER configuration_enablement_scope BEFORE INSERT ON configuration_enablement
WHEN NOT EXISTS
 (SELECT 1 FROM integration_config_version v JOIN integration_config c ON c.id=v.integration_config_id
 JOIN configuration_trial t ON t.id=NEW.trial_id JOIN human_decision h ON h.id=NEW.human_decision_id
 WHERE v.id=NEW.configuration_version_id AND t.configuration_version_id=v.id AND t.status='PASSED'
 AND h.work_item_id=v.work_item_id AND h.service_provider_id=c.service_provider_id AND h.origin='LOCAL'
 AND h.action_type='ENABLE_CONFIGURATION' AND (h.analysis_result_id IS NULL OR h.analysis_result_id=v.analysis_result_id)
 AND h.gmt_create<=NEW.gmt_create AND t.gmt_create<=NEW.gmt_create)
BEGIN SELECT RAISE(ABORT,'enablement requires actual human decision and same passing trial'); END;

CREATE TRIGGER configuration_activation_scope BEFORE INSERT ON configuration_activation_result
BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM configuration_enablement e
 WHERE e.id=NEW.enablement_id AND e.gmt_create<=NEW.gmt_create)
 THEN RAISE(ABORT,'result needs original enablement') END;
 SELECT CASE WHEN NEW.outcome='APPLIED' AND NOT EXISTS
 (SELECT 1 FROM configuration_enablement e JOIN integration_config_version v ON v.id=e.configuration_version_id
 JOIN integration_config c ON c.id=v.integration_config_id WHERE e.id=NEW.enablement_id
 AND e.expected_config_version=c.row_version AND e.expected_active_version_id IS c.current_version_id)
 THEN RAISE(ABORT,'configuration changed since confirmation') END;
END;

CREATE TRIGGER integration_config_activate BEFORE UPDATE ON integration_config
BEGIN
 SELECT CASE WHEN NEW.id IS NOT OLD.id OR NEW.service_provider_id IS NOT OLD.service_provider_id
 OR NEW.source_system IS NOT OLD.source_system OR NEW.purpose IS NOT OLD.purpose
 OR NEW.business_scope_key IS NOT OLD.business_scope_key OR NEW.gmt_create IS NOT OLD.gmt_create
 OR NEW.row_version!=OLD.row_version+1 OR NEW.gmt_modified<OLD.gmt_modified
 OR NEW.current_activation_result_id IS OLD.current_activation_result_id
 THEN RAISE(ABORT,'only conditional active pointer change is allowed') END;
 SELECT CASE WHEN NOT EXISTS
 (SELECT 1 FROM configuration_activation_result r JOIN configuration_enablement e ON e.id=r.enablement_id
 JOIN integration_config_version v ON v.id=e.configuration_version_id
 WHERE r.id=NEW.current_activation_result_id AND r.outcome='APPLIED'
 AND v.id=NEW.current_version_id AND v.integration_config_id=OLD.id
 AND e.expected_config_version=OLD.row_version AND e.expected_active_version_id IS OLD.current_version_id
 AND r.gmt_create<=NEW.gmt_modified)
 THEN RAISE(ABORT,'current version needs its successful conditional activation') END;
END;

