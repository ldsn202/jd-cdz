-- Reconciliation storage candidate. No production migration or decimal calculation engine.
-- Load after work-item, evidence and installation schema candidates.
CREATE TABLE billing_document (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 side TEXT NOT NULL CHECK(side IN ('JD','PROVIDER')),
 source_system TEXT NOT NULL CHECK(length(trim(source_system))>0),
 source_id TEXT NOT NULL CHECK(length(trim(source_id))>0),
 service_provider_id TEXT NOT NULL CHECK(length(trim(service_provider_id))>0),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified=gmt_create)
);
CREATE UNIQUE INDEX uk_billing_document_jd ON billing_document(source_system,source_id) WHERE side='JD';
CREATE UNIQUE INDEX uk_billing_document_provider ON billing_document(source_system,service_provider_id,source_id) WHERE side='PROVIDER';
CREATE INDEX idx_billing_document_provider ON billing_document(service_provider_id,side,id);
CREATE TRIGGER billing_document_no_delete BEFORE DELETE ON billing_document
BEGIN SELECT RAISE(ABORT,'reconciliation history cannot be deleted'); END;
CREATE TRIGGER billing_document_no_update BEFORE UPDATE ON billing_document
BEGIN SELECT RAISE(ABORT,'reconciliation history is fixed'); END;
CREATE TRIGGER billing_document_no_replace BEFORE INSERT ON billing_document
WHEN EXISTS (SELECT 1 FROM billing_document old WHERE old.id=NEW.id OR (old.source_system=NEW.source_system AND old.source_id=NEW.source_id AND old.side='JD' AND NEW.side='JD') OR (old.source_system=NEW.source_system AND old.service_provider_id=NEW.service_provider_id AND old.source_id=NEW.source_id AND old.side='PROVIDER' AND NEW.side='PROVIDER'))
BEGIN SELECT RAISE(ABORT,'read existing identity and compare, never replace'); END;

CREATE TABLE fee_basis_record (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 record_kind TEXT NOT NULL CHECK(record_kind IN ('TERM','APPROVAL')),
 source_system TEXT NOT NULL CHECK(length(trim(source_system))>0),
 source_id TEXT NOT NULL CHECK(length(trim(source_id))>0),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified=gmt_create)
);
CREATE UNIQUE INDEX uk_fee_basis_record_source ON fee_basis_record(record_kind,source_system,source_id);
CREATE TRIGGER fee_basis_record_no_delete BEFORE DELETE ON fee_basis_record
BEGIN SELECT RAISE(ABORT,'reconciliation history cannot be deleted'); END;
CREATE TRIGGER fee_basis_record_no_update BEFORE UPDATE ON fee_basis_record
BEGIN SELECT RAISE(ABORT,'reconciliation history is fixed'); END;
CREATE TRIGGER fee_basis_record_no_replace BEFORE INSERT ON fee_basis_record
WHEN EXISTS (SELECT 1 FROM fee_basis_record old WHERE old.id=NEW.id OR (old.record_kind=NEW.record_kind AND old.source_system=NEW.source_system AND old.source_id=NEW.source_id))
BEGIN SELECT RAISE(ABORT,'read existing identity and compare, never replace'); END;

CREATE TABLE reconciliation_record (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 work_item_id TEXT NOT NULL CHECK(length(trim(work_item_id))>0),
 installation_work_order_id TEXT NOT NULL CHECK(length(trim(installation_work_order_id))>0),
 service_provider_id TEXT NOT NULL CHECK(length(trim(service_provider_id))>0),
 snapshot_id TEXT NOT NULL CHECK(length(trim(snapshot_id))>0),
 execution_key TEXT NOT NULL CHECK(length(trim(execution_key))>0),
 comparator_version TEXT NOT NULL CHECK(length(trim(comparator_version))>0),
 status TEXT NOT NULL CHECK(status IN ('MATCHED','DIFFERENCE','NEEDS_INFORMATION')),
 currency TEXT CHECK(currency IS NULL OR length(trim(currency))>0),
 tax_basis TEXT NOT NULL CHECK(tax_basis IN ('TAX_INCLUDED','TAX_EXCLUDED','UNKNOWN')),
 jd_amount TEXT CHECK(jd_amount IS NULL OR (length((CASE WHEN substr(jd_amount,1,1) IN ('-','+') THEN substr(jd_amount,2) ELSE jd_amount END))>0 AND (CASE WHEN substr(jd_amount,1,1) IN ('-','+') THEN substr(jd_amount,2) ELSE jd_amount END) NOT GLOB '*[^0-9.]*' AND (CASE WHEN substr(jd_amount,1,1) IN ('-','+') THEN substr(jd_amount,2) ELSE jd_amount END) GLOB '[0-9]*' AND substr((CASE WHEN substr(jd_amount,1,1) IN ('-','+') THEN substr(jd_amount,2) ELSE jd_amount END),-1) GLOB '[0-9]' AND length((CASE WHEN substr(jd_amount,1,1) IN ('-','+') THEN substr(jd_amount,2) ELSE jd_amount END))-length(replace((CASE WHEN substr(jd_amount,1,1) IN ('-','+') THEN substr(jd_amount,2) ELSE jd_amount END),'.',''))<=1)),
 provider_amount TEXT CHECK(provider_amount IS NULL OR (length((CASE WHEN substr(provider_amount,1,1) IN ('-','+') THEN substr(provider_amount,2) ELSE provider_amount END))>0 AND (CASE WHEN substr(provider_amount,1,1) IN ('-','+') THEN substr(provider_amount,2) ELSE provider_amount END) NOT GLOB '*[^0-9.]*' AND (CASE WHEN substr(provider_amount,1,1) IN ('-','+') THEN substr(provider_amount,2) ELSE provider_amount END) GLOB '[0-9]*' AND substr((CASE WHEN substr(provider_amount,1,1) IN ('-','+') THEN substr(provider_amount,2) ELSE provider_amount END),-1) GLOB '[0-9]' AND length((CASE WHEN substr(provider_amount,1,1) IN ('-','+') THEN substr(provider_amount,2) ELSE provider_amount END))-length(replace((CASE WHEN substr(provider_amount,1,1) IN ('-','+') THEN substr(provider_amount,2) ELSE provider_amount END),'.',''))<=1)),
 difference_amount TEXT CHECK(difference_amount IS NULL OR (length((CASE WHEN substr(difference_amount,1,1) IN ('-','+') THEN substr(difference_amount,2) ELSE difference_amount END))>0 AND (CASE WHEN substr(difference_amount,1,1) IN ('-','+') THEN substr(difference_amount,2) ELSE difference_amount END) NOT GLOB '*[^0-9.]*' AND (CASE WHEN substr(difference_amount,1,1) IN ('-','+') THEN substr(difference_amount,2) ELSE difference_amount END) GLOB '[0-9]*' AND substr((CASE WHEN substr(difference_amount,1,1) IN ('-','+') THEN substr(difference_amount,2) ELSE difference_amount END),-1) GLOB '[0-9]' AND length((CASE WHEN substr(difference_amount,1,1) IN ('-','+') THEN substr(difference_amount,2) ELSE difference_amount END))-length(replace((CASE WHEN substr(difference_amount,1,1) IN ('-','+') THEN substr(difference_amount,2) ELSE difference_amount END),'.',''))<=1)),
 selected_bills_json TEXT NOT NULL CHECK(CASE WHEN json_valid(selected_bills_json) THEN json_type(selected_bills_json)='array' ELSE 0 END),
 groups_json TEXT NOT NULL CHECK(CASE WHEN json_valid(groups_json) THEN json_type(groups_json)='array' ELSE 0 END),
 basis_inputs_json TEXT NOT NULL CHECK(CASE WHEN json_valid(basis_inputs_json) THEN json_type(basis_inputs_json)='array' ELSE 0 END),
 basis_lookup_json TEXT NOT NULL CHECK(CASE WHEN json_valid(basis_lookup_json) THEN json_type(basis_lookup_json)='object' ELSE 0 END),
 checks_json TEXT NOT NULL CHECK(CASE WHEN json_valid(checks_json) THEN json_type(checks_json)='object' ELSE 0 END),
 open_issues_json TEXT NOT NULL CHECK(CASE WHEN json_valid(open_issues_json) THEN json_type(open_issues_json)='array' ELSE 0 END),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified=gmt_create),
 CHECK(difference_amount IS NULL OR (jd_amount IS NOT NULL AND provider_amount IS NOT NULL AND currency IS NOT NULL AND tax_basis!='UNKNOWN')),
 CHECK(status!='DIFFERENCE' OR (difference_amount IS NOT NULL AND json_array_length(open_issues_json)>0)),
 CHECK(status!='NEEDS_INFORMATION' OR json_array_length(open_issues_json)>0),
 CHECK(status!='MATCHED' OR (jd_amount IS NOT NULL AND provider_amount IS NOT NULL AND difference_amount='0' AND currency IS NOT NULL AND tax_basis!='UNKNOWN' AND json_array_length(open_issues_json)=0 AND json_array_length(groups_json)>0)),
 CHECK(status!='MATCHED' OR COALESCE(json_type(checks_json,'$.source_current')='true',0)),
 CHECK(status!='MATCHED' OR COALESCE(json_type(checks_json,'$.scope_confirmed')='true',0)),
 CHECK(status!='MATCHED' OR COALESCE(json_type(checks_json,'$.currency_tax_confirmed')='true',0)),
 CHECK(status!='MATCHED' OR COALESCE(json_type(checks_json,'$.items_complete')='true',0)),
 CHECK(status!='MATCHED' OR COALESCE(json_type(checks_json,'$.mapping_confirmed')='true',0)),
 CHECK(status!='MATCHED' OR COALESCE(json_type(checks_json,'$.total_checks_passed')='true',0)),
 CHECK(status!='MATCHED' OR COALESCE(json_type(checks_json,'$.groups_balanced')='true',0)),
 CHECK(status!='MATCHED' OR COALESCE(json_type(checks_json,'$.issues_resolved')='true',0))
);
CREATE UNIQUE INDEX uk_reconciliation_record_execution ON reconciliation_record(execution_key);
CREATE INDEX idx_reconciliation_record_item ON reconciliation_record(work_item_id,gmt_create,id);
CREATE INDEX idx_reconciliation_record_snapshot ON reconciliation_record(snapshot_id,id);
CREATE TRIGGER reconciliation_record_no_delete BEFORE DELETE ON reconciliation_record
BEGIN SELECT RAISE(ABORT,'reconciliation history cannot be deleted'); END;
CREATE TRIGGER reconciliation_record_no_update BEFORE UPDATE ON reconciliation_record
BEGIN SELECT RAISE(ABORT,'reconciliation history is fixed'); END;
CREATE TRIGGER reconciliation_record_no_replace BEFORE INSERT ON reconciliation_record
WHEN EXISTS (SELECT 1 FROM reconciliation_record old WHERE old.id=NEW.id OR (old.execution_key=NEW.execution_key))
BEGIN SELECT RAISE(ABORT,'read existing identity and compare, never replace'); END;

CREATE TABLE reconciliation_analysis_link (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 reconciliation_id TEXT NOT NULL CHECK(length(trim(reconciliation_id))>0),
 analysis_result_id TEXT NOT NULL CHECK(length(trim(analysis_result_id))>0),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified=gmt_create)
);
CREATE UNIQUE INDEX uk_reconciliation_analysis_result ON reconciliation_analysis_link(analysis_result_id);
CREATE INDEX idx_reconciliation_analysis_record ON reconciliation_analysis_link(reconciliation_id,gmt_create,id);
CREATE TRIGGER reconciliation_analysis_link_no_delete BEFORE DELETE ON reconciliation_analysis_link
BEGIN SELECT RAISE(ABORT,'reconciliation history cannot be deleted'); END;
CREATE TRIGGER reconciliation_analysis_link_no_update BEFORE UPDATE ON reconciliation_analysis_link
BEGIN SELECT RAISE(ABORT,'reconciliation history is fixed'); END;
CREATE TRIGGER reconciliation_analysis_link_no_replace BEFORE INSERT ON reconciliation_analysis_link
WHEN EXISTS (SELECT 1 FROM reconciliation_analysis_link old WHERE old.id=NEW.id OR (old.analysis_result_id=NEW.analysis_result_id))
BEGIN SELECT RAISE(ABORT,'read existing identity and compare, never replace'); END;

CREATE TABLE fee_verification_action (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 human_decision_id TEXT NOT NULL CHECK(length(trim(human_decision_id))>0),
 reconciliation_id TEXT NOT NULL CHECK(length(trim(reconciliation_id))>0),
 action_kind TEXT NOT NULL CHECK(action_kind IN ('QUESTION','REPLY','FACT')),
 question_action_id TEXT CHECK(question_action_id IS NULL OR length(trim(question_action_id))>0),
 is_closed INTEGER NOT NULL CHECK(typeof(is_closed)='integer' AND is_closed IN (0,1)),
 closed_by_kind TEXT CHECK(closed_by_kind IS NULL OR closed_by_kind IN ('COMPARISON','HUMAN_FACT')),
 closed_by_id TEXT CHECK(closed_by_id IS NULL OR length(trim(closed_by_id))>0),
 close_basis_json TEXT CHECK(close_basis_json IS NULL OR CASE WHEN json_valid(close_basis_json) THEN json_type(close_basis_json)='object' ELSE 0 END),
 closed_at INTEGER CHECK(closed_at IS NULL OR (typeof(closed_at)='integer' AND closed_at>=gmt_create AND closed_at<=gmt_modified)),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified>=gmt_create),
 CHECK((action_kind='QUESTION' AND question_action_id IS NULL) OR (action_kind='REPLY' AND question_action_id IS NOT NULL) OR action_kind='FACT'),
 CHECK(question_action_id IS NULL OR question_action_id<>id),
 CHECK((is_closed=0 AND closed_by_kind IS NULL AND closed_by_id IS NULL AND close_basis_json IS NULL AND closed_at IS NULL) OR (is_closed=1 AND action_kind='QUESTION' AND closed_by_kind IS NOT NULL AND closed_by_id IS NOT NULL AND close_basis_json IS NOT NULL AND closed_at IS NOT NULL))
);
CREATE UNIQUE INDEX uk_fee_verification_decision ON fee_verification_action(human_decision_id);
CREATE INDEX idx_fee_verification_question ON fee_verification_action(question_action_id,gmt_create,id);
CREATE INDEX idx_fee_verification_comparison ON fee_verification_action(reconciliation_id,id);
CREATE TRIGGER fee_verification_action_no_delete BEFORE DELETE ON fee_verification_action
BEGIN SELECT RAISE(ABORT,'reconciliation history cannot be deleted'); END;
CREATE TRIGGER fee_verification_action_no_replace BEFORE INSERT ON fee_verification_action
WHEN EXISTS (SELECT 1 FROM fee_verification_action old WHERE old.id=NEW.id OR (old.human_decision_id=NEW.human_decision_id))
BEGIN SELECT RAISE(ABORT,'read existing identity and compare, never replace'); END;

CREATE TRIGGER reconciliation_record_inputs BEFORE INSERT ON reconciliation_record
BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM analysis_input_snapshot s JOIN work_item w ON w.id=s.work_item_id
 WHERE s.id=NEW.snapshot_id AND w.id=NEW.work_item_id AND w.item_kind='RECONCILIATION'
 AND w.installation_work_order_id=NEW.installation_work_order_id AND w.service_provider_id=NEW.service_provider_id
 AND s.service_provider_id=NEW.service_provider_id AND s.skill='RECONCILIATION_EXPLANATION' AND s.gmt_create<=NEW.gmt_create
 AND (NEW.status!='MATCHED' OR s.required_input_state='COMPLETE'))
 THEN RAISE(ABORT,'comparison scope and fixed input mismatch') END;
 SELECT CASE WHEN EXISTS (SELECT 1 FROM json_each(NEW.selected_bills_json) x WHERE NOT EXISTS
 (SELECT 1 FROM analysis_input_item i JOIN billing_document b ON b.id=json_extract(x.value,'$.billingDocumentId')
 WHERE i.id=json_extract(x.value,'$.inputItemId') AND i.snapshot_id=NEW.snapshot_id
 AND i.input_kind='RECORD' AND i.source_system=b.source_system AND i.source_record_id=b.source_id
 AND b.service_provider_id=NEW.service_provider_id AND (NEW.status!='MATCHED' OR i.source_version IS NOT NULL)
 AND i.record_type=CASE b.side WHEN 'JD' THEN 'JD_BILL' ELSE 'PROVIDER_RECEIVABLE' END))
 THEN RAISE(ABORT,'selected bill must be its own actual fixed input') END;
 SELECT CASE WHEN EXISTS (SELECT 1 FROM json_each(NEW.selected_bills_json)
 GROUP BY json_extract(value,'$.billingDocumentId') HAVING count(*)>1)
 OR EXISTS (SELECT 1 FROM json_each(NEW.selected_bills_json)
 GROUP BY json_extract(value,'$.inputItemId') HAVING count(*)>1)
 THEN RAISE(ABORT,'bill or version counted twice') END;
 SELECT CASE WHEN EXISTS (SELECT 1 FROM json_each(NEW.basis_inputs_json) x WHERE NOT EXISTS
 (SELECT 1 FROM analysis_input_item i JOIN fee_basis_record b ON b.id=json_extract(x.value,'$.feeBasisId')
 WHERE i.id=json_extract(x.value,'$.inputItemId') AND i.snapshot_id=NEW.snapshot_id
 AND i.input_kind='RECORD' AND i.source_system=b.source_system AND i.source_record_id=b.source_id
 AND i.record_type=CASE b.record_kind WHEN 'TERM' THEN 'BILLING_TERM' ELSE 'FEE_APPROVAL_RECORD' END))
 THEN RAISE(ABORT,'fee basis must belong to this actual input') END;
 SELECT CASE WHEN EXISTS (SELECT 1 FROM json_each(NEW.groups_json) g
 WHERE COALESCE(json_type(g.value,'$.groupId')='text' AND length(trim(json_extract(g.value,'$.groupId')))>0,0)=0
 OR COALESCE(json_type(g.value,'$.members')='array' AND json_array_length(g.value,'$.members')>0,0)=0)
 OR EXISTS (SELECT 1 FROM json_each(NEW.groups_json) GROUP BY json_extract(value,'$.groupId') HAVING count(*)>1)
 THEN RAISE(ABORT,'comparison groups need unique IDs and actual members') END;
 SELECT CASE WHEN EXISTS (SELECT 1 FROM json_each(NEW.groups_json) g JOIN json_each(g.value,'$.members') m
 WHERE COALESCE(json_type(m.value,'$.billItemId')='text' AND length(trim(json_extract(m.value,'$.billItemId')))>0,0)=0
 OR NOT EXISTS (SELECT 1 FROM json_each(NEW.selected_bills_json) b
 WHERE json_extract(b.value,'$.inputItemId')=json_extract(m.value,'$.inputItemId')))
 OR EXISTS (SELECT 1 FROM json_each(NEW.groups_json) g JOIN json_each(g.value,'$.members') m
 GROUP BY json_extract(m.value,'$.inputItemId'),json_extract(m.value,'$.billItemId') HAVING count(*)>1)
 THEN RAISE(ABORT,'source item not selected or counted twice') END;
 SELECT CASE WHEN NEW.status='MATCHED' AND
 ((SELECT count(DISTINCT b.side) FROM json_each(NEW.selected_bills_json) x JOIN billing_document b
 ON b.id=json_extract(x.value,'$.billingDocumentId'))!=2
 OR EXISTS (SELECT 1 FROM json_each(NEW.groups_json) WHERE
 COALESCE(json_extract(value,'$.status')='MATCHED',0)=0 OR COALESCE(json_extract(value,'$.differenceAmount')='0',0)=0))
 THEN RAISE(ABORT,'matched comparison requires both sides and balanced groups') END;
END;

CREATE TRIGGER reconciliation_analysis_scope BEFORE INSERT ON reconciliation_analysis_link
WHEN NOT EXISTS (SELECT 1 FROM reconciliation_record r JOIN analysis_result a ON a.id=NEW.analysis_result_id
 JOIN analysis_input_snapshot s ON s.id=a.snapshot_id
 WHERE r.id=NEW.reconciliation_id AND r.work_item_id=a.work_item_id AND r.snapshot_id=a.snapshot_id
 AND s.skill='RECONCILIATION_EXPLANATION' AND r.gmt_create<=NEW.gmt_create AND a.gmt_create<=NEW.gmt_create)
BEGIN SELECT RAISE(ABORT,'explanation must use the exact comparison input'); END;

CREATE TRIGGER fee_verification_action_scope BEFORE INSERT ON fee_verification_action
BEGIN
 SELECT CASE WHEN NEW.is_closed!=0 THEN RAISE(ABORT,'question must begin open') END;
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM human_decision h JOIN reconciliation_record r ON r.id=NEW.reconciliation_id
 WHERE h.id=NEW.human_decision_id AND h.origin='LOCAL' AND h.work_item_id=r.work_item_id
 AND h.service_provider_id=r.service_provider_id AND h.gmt_create<=NEW.gmt_create AND r.gmt_create<=NEW.gmt_create
 AND h.action_type=CASE NEW.action_kind WHEN 'QUESTION' THEN 'REQUEST_FEE_VERIFICATION'
 WHEN 'REPLY' THEN 'REPLY_FEE_VERIFICATION' ELSE 'RECORD_FEE_FACTS' END)
 THEN RAISE(ABORT,'fee action requires its actual human decision and comparison') END;
 SELECT CASE WHEN NEW.question_action_id IS NOT NULL AND NOT EXISTS
 (SELECT 1 FROM fee_verification_action q JOIN reconciliation_record old_r ON old_r.id=q.reconciliation_id
 JOIN reconciliation_record new_r ON new_r.id=NEW.reconciliation_id
 WHERE q.id=NEW.question_action_id AND q.action_kind='QUESTION' AND q.is_closed=0
 AND old_r.work_item_id=new_r.work_item_id AND q.gmt_create<=NEW.gmt_create)
 THEN RAISE(ABORT,'reply or fact requires an open question in the same item') END;
 SELECT CASE WHEN EXISTS (SELECT 1 FROM human_decision h WHERE h.id=NEW.human_decision_id
 AND h.analysis_result_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM reconciliation_analysis_link l
 WHERE l.reconciliation_id=NEW.reconciliation_id AND l.analysis_result_id=h.analysis_result_id))
 THEN RAISE(ABORT,'human action analysis belongs to another comparison') END;
END;

CREATE TRIGGER fee_verification_action_close BEFORE UPDATE ON fee_verification_action
BEGIN
 SELECT CASE WHEN OLD.action_kind!='QUESTION' OR OLD.is_closed!=0 OR NEW.is_closed!=1
 OR NEW.id IS NOT OLD.id OR NEW.human_decision_id IS NOT OLD.human_decision_id
 OR NEW.reconciliation_id IS NOT OLD.reconciliation_id OR NEW.action_kind IS NOT OLD.action_kind
 OR NEW.question_action_id IS NOT OLD.question_action_id OR NEW.gmt_create IS NOT OLD.gmt_create
 OR NEW.gmt_modified<OLD.gmt_modified
 THEN RAISE(ABORT,'only question resolution may be written once') END;
 SELECT CASE WHEN NEW.closed_by_kind='COMPARISON' AND NOT EXISTS
 (SELECT 1 FROM reconciliation_record old_r JOIN reconciliation_record new_r ON new_r.id=NEW.closed_by_id
 WHERE old_r.id=OLD.reconciliation_id AND old_r.work_item_id=new_r.work_item_id AND new_r.gmt_create<=NEW.closed_at)
 THEN RAISE(ABORT,'resolution comparison must belong to this item') END;
 SELECT CASE WHEN NEW.closed_by_kind='HUMAN_FACT' AND NOT EXISTS
 (SELECT 1 FROM fee_verification_action f WHERE f.id=NEW.closed_by_id AND f.action_kind='FACT'
 AND f.question_action_id=OLD.id AND f.gmt_create<=NEW.closed_at)
 THEN RAISE(ABORT,'resolution fact must address this question') END;
END;
