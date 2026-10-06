-- Installation schema candidate. Load after work-item and evidence candidates.
-- No production migration; logical relations require service authorization and transactions.
CREATE TABLE installation_plan (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 installation_work_order_id TEXT NOT NULL CHECK(length(trim(installation_work_order_id))>0),
 source_system TEXT NOT NULL CHECK(length(trim(source_system))>0),
 source_id TEXT NOT NULL CHECK(length(trim(source_id))>0),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified=gmt_create)
);
CREATE UNIQUE INDEX uk_installation_plan_source ON installation_plan(source_system,source_id);
CREATE INDEX idx_installation_plan_order ON installation_plan(installation_work_order_id,id);
CREATE TRIGGER installation_plan_no_delete BEFORE DELETE ON installation_plan
BEGIN SELECT RAISE(ABORT,'installation history cannot be deleted'); END;
CREATE TRIGGER installation_plan_no_update BEFORE UPDATE ON installation_plan
BEGIN SELECT RAISE(ABORT,'installation history is fixed'); END;
CREATE TRIGGER installation_plan_no_replace BEFORE INSERT ON installation_plan
WHEN EXISTS (SELECT 1 FROM installation_plan old WHERE (old.id=NEW.id) OR (old.source_system=NEW.source_system AND old.source_id=NEW.source_id))
BEGIN SELECT RAISE(ABORT,'existing installation identity cannot be replaced'); END;

CREATE TABLE installation_detail (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 installation_work_order_id TEXT NOT NULL CHECK(length(trim(installation_work_order_id))>0),
 source_system TEXT NOT NULL CHECK(length(trim(source_system))>0),
 source_id TEXT NOT NULL CHECK(length(trim(source_id))>0),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified=gmt_create)
);
CREATE UNIQUE INDEX uk_installation_detail_source ON installation_detail(source_system,source_id);
CREATE INDEX idx_installation_detail_order ON installation_detail(installation_work_order_id,id);
CREATE TRIGGER installation_detail_no_delete BEFORE DELETE ON installation_detail
BEGIN SELECT RAISE(ABORT,'installation history cannot be deleted'); END;
CREATE TRIGGER installation_detail_no_update BEFORE UPDATE ON installation_detail
BEGIN SELECT RAISE(ABORT,'installation history is fixed'); END;
CREATE TRIGGER installation_detail_no_replace BEFORE INSERT ON installation_detail
WHEN EXISTS (SELECT 1 FROM installation_detail old WHERE (old.id=NEW.id) OR (old.source_system=NEW.source_system AND old.source_id=NEW.source_id))
BEGIN SELECT RAISE(ABORT,'existing installation identity cannot be replaced'); END;

CREATE TABLE installation_context_snapshot (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 installation_work_order_id TEXT NOT NULL CHECK(length(trim(installation_work_order_id))>0),
 service_provider_id TEXT NOT NULL CHECK(length(trim(service_provider_id))>0),
 source_work_order_version TEXT CHECK(source_work_order_version IS NULL OR length(trim(source_work_order_version))>0),
 installation_plan_id TEXT CHECK(installation_plan_id IS NULL OR length(trim(installation_plan_id))>0),
 source_plan_version TEXT CHECK(source_plan_version IS NULL OR length(trim(source_plan_version))>0),
 installation_detail_id TEXT CHECK(installation_detail_id IS NULL OR length(trim(installation_detail_id))>0),
 source_detail_version TEXT CHECK(source_detail_version IS NULL OR length(trim(source_detail_version))>0),
 detail_status TEXT NOT NULL CHECK(detail_status IN ('NOT_SUBMITTED','SUBMITTED','UNKNOWN')),
 completeness TEXT NOT NULL CHECK(completeness IN ('COMPLETE','INCOMPLETE')),
 missing_parts_json TEXT NOT NULL CHECK(CASE WHEN json_valid(missing_parts_json) THEN json_type(missing_parts_json)='array' ELSE 0 END),
 context_json TEXT NOT NULL CHECK(CASE WHEN json_valid(context_json) THEN json_type(context_json)='object' ELSE 0 END),
 retrieved_at INTEGER NOT NULL CHECK(typeof(retrieved_at)='integer' AND retrieved_at>=0 AND retrieved_at<=gmt_create),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified=gmt_create),
 CHECK((completeness='COMPLETE' AND json_array_length(missing_parts_json)=0) OR (completeness='INCOMPLETE' AND json_array_length(missing_parts_json)>0)),
 CHECK(installation_plan_id IS NOT NULL OR source_plan_version IS NULL),
 CHECK(installation_detail_id IS NOT NULL OR source_detail_version IS NULL),
 CHECK(detail_status!='NOT_SUBMITTED' OR (installation_detail_id IS NULL AND source_detail_version IS NULL)),
 CHECK(completeness!='COMPLETE' OR (source_work_order_version IS NOT NULL AND installation_plan_id IS NOT NULL AND source_plan_version IS NOT NULL AND (detail_status='NOT_SUBMITTED' OR (detail_status='SUBMITTED' AND installation_detail_id IS NOT NULL AND source_detail_version IS NOT NULL))))
);
CREATE INDEX idx_installation_context_order ON installation_context_snapshot(installation_work_order_id,gmt_create,id);
CREATE INDEX idx_installation_context_plan ON installation_context_snapshot(installation_plan_id,source_plan_version,id);
CREATE INDEX idx_installation_context_detail ON installation_context_snapshot(installation_detail_id,source_detail_version,id);
CREATE TRIGGER installation_context_snapshot_no_delete BEFORE DELETE ON installation_context_snapshot
BEGIN SELECT RAISE(ABORT,'installation history cannot be deleted'); END;
CREATE TRIGGER installation_context_snapshot_no_update BEFORE UPDATE ON installation_context_snapshot
BEGIN SELECT RAISE(ABORT,'installation history is fixed'); END;
CREATE TRIGGER installation_context_snapshot_no_replace BEFORE INSERT ON installation_context_snapshot
WHEN EXISTS (SELECT 1 FROM installation_context_snapshot old WHERE (old.id=NEW.id))
BEGIN SELECT RAISE(ABORT,'existing installation identity cannot be replaced'); END;

CREATE TABLE installation_draft (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 work_item_id TEXT NOT NULL CHECK(length(trim(work_item_id))>0),
 current_version_id TEXT NOT NULL CHECK(length(trim(current_version_id))>0),
 row_version INTEGER NOT NULL CHECK(typeof(row_version)='integer' AND row_version>=1),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified>=gmt_create)
);
CREATE UNIQUE INDEX uk_installation_draft_item ON installation_draft(work_item_id);
CREATE TRIGGER installation_draft_no_delete BEFORE DELETE ON installation_draft
BEGIN SELECT RAISE(ABORT,'installation history cannot be deleted'); END;
CREATE TRIGGER installation_draft_no_replace BEFORE INSERT ON installation_draft
WHEN EXISTS (SELECT 1 FROM installation_draft old WHERE (old.id=NEW.id) OR (old.work_item_id=NEW.work_item_id))
BEGIN SELECT RAISE(ABORT,'existing installation identity cannot be replaced'); END;

CREATE TABLE installation_draft_version (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 installation_draft_id TEXT NOT NULL CHECK(length(trim(installation_draft_id))>0),
 work_item_id TEXT NOT NULL CHECK(length(trim(work_item_id))>0),
 version_no INTEGER NOT NULL CHECK(typeof(version_no)='integer' AND version_no>=1),
 parent_version_id TEXT CHECK(parent_version_id IS NULL OR length(trim(parent_version_id))>0),
 analysis_result_id TEXT NOT NULL CHECK(length(trim(analysis_result_id))>0),
 context_snapshot_id TEXT NOT NULL CHECK(length(trim(context_snapshot_id))>0),
 origin TEXT NOT NULL CHECK(origin IN ('AI','HUMAN')),
 editor_identity_id TEXT CHECK(editor_identity_id IS NULL OR length(trim(editor_identity_id))>0),
 items_json TEXT NOT NULL CHECK(CASE WHEN json_valid(items_json) THEN json_type(items_json)='array' ELSE 0 END),
 source_materials_json TEXT NOT NULL CHECK(CASE WHEN json_valid(source_materials_json) THEN json_type(source_materials_json)='array' ELSE 0 END),
 open_questions_json TEXT NOT NULL CHECK(CASE WHEN json_valid(open_questions_json) THEN json_type(open_questions_json)='array' ELSE 0 END),
 edit_notes_json TEXT NOT NULL CHECK(CASE WHEN json_valid(edit_notes_json) THEN json_type(edit_notes_json)='array' ELSE 0 END),
 save_key TEXT NOT NULL CHECK(length(trim(save_key))>0),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified=gmt_create),
 CHECK((version_no=1 AND parent_version_id IS NULL) OR (version_no>1 AND parent_version_id IS NOT NULL)),
 CHECK((origin='AI' AND editor_identity_id IS NULL) OR (origin='HUMAN' AND editor_identity_id IS NOT NULL))
);
CREATE UNIQUE INDEX uk_installation_draft_version_number ON installation_draft_version(installation_draft_id,version_no);
CREATE UNIQUE INDEX uk_installation_draft_version_save ON installation_draft_version(installation_draft_id,save_key);
CREATE INDEX idx_installation_draft_version_analysis ON installation_draft_version(analysis_result_id,id);
CREATE INDEX idx_installation_draft_version_context ON installation_draft_version(context_snapshot_id,id);
CREATE TRIGGER installation_draft_version_no_delete BEFORE DELETE ON installation_draft_version
BEGIN SELECT RAISE(ABORT,'installation history cannot be deleted'); END;
CREATE TRIGGER installation_draft_version_no_update BEFORE UPDATE ON installation_draft_version
BEGIN SELECT RAISE(ABORT,'installation history is fixed'); END;
CREATE TRIGGER installation_draft_version_no_replace BEFORE INSERT ON installation_draft_version
WHEN EXISTS (SELECT 1 FROM installation_draft_version old WHERE (old.id=NEW.id) OR (old.installation_draft_id=NEW.installation_draft_id AND old.version_no=NEW.version_no) OR (old.installation_draft_id=NEW.installation_draft_id AND old.save_key=NEW.save_key))
BEGIN SELECT RAISE(ABORT,'existing installation identity cannot be replaced'); END;

CREATE TABLE installation_detail_submission (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(trim(id))>0),
 human_decision_id TEXT NOT NULL CHECK(length(trim(human_decision_id))>0),
 draft_version_id TEXT NOT NULL CHECK(length(trim(draft_version_id))>0),
 work_item_id TEXT NOT NULL CHECK(length(trim(work_item_id))>0),
 installation_work_order_id TEXT NOT NULL CHECK(length(trim(installation_work_order_id))>0),
 service_provider_id TEXT NOT NULL CHECK(length(trim(service_provider_id))>0),
 target_source_system TEXT NOT NULL CHECK(length(trim(target_source_system))>0),
 request_json TEXT NOT NULL CHECK(CASE WHEN json_valid(request_json) THEN json_type(request_json)='object' ELSE 0 END),
 gmt_create INTEGER NOT NULL CHECK(typeof(gmt_create)='integer' AND gmt_create>=0),
 gmt_modified INTEGER NOT NULL CHECK(typeof(gmt_modified)='integer' AND gmt_modified=gmt_create)
);
CREATE UNIQUE INDEX uk_installation_detail_submission_decision ON installation_detail_submission(human_decision_id);
CREATE INDEX idx_installation_detail_submission_order ON installation_detail_submission(installation_work_order_id,gmt_create,id);
CREATE INDEX idx_installation_detail_submission_version ON installation_detail_submission(draft_version_id,id);
CREATE TRIGGER installation_detail_submission_no_delete BEFORE DELETE ON installation_detail_submission
BEGIN SELECT RAISE(ABORT,'installation history cannot be deleted'); END;
CREATE TRIGGER installation_detail_submission_no_update BEFORE UPDATE ON installation_detail_submission
BEGIN SELECT RAISE(ABORT,'installation history is fixed'); END;
CREATE TRIGGER installation_detail_submission_no_replace BEFORE INSERT ON installation_detail_submission
WHEN EXISTS (SELECT 1 FROM installation_detail_submission old WHERE (old.id=NEW.id) OR (old.human_decision_id=NEW.human_decision_id))
BEGIN SELECT RAISE(ABORT,'existing installation identity cannot be replaced'); END;

CREATE TRIGGER installation_context_scope BEFORE INSERT ON installation_context_snapshot
WHEN NOT EXISTS (SELECT 1 FROM installation_work_order w WHERE w.id=NEW.installation_work_order_id)
 OR (NEW.installation_plan_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM installation_plan p
     WHERE p.id=NEW.installation_plan_id AND p.installation_work_order_id=NEW.installation_work_order_id))
 OR (NEW.installation_detail_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM installation_detail d
     WHERE d.id=NEW.installation_detail_id AND d.installation_work_order_id=NEW.installation_work_order_id))
BEGIN SELECT RAISE(ABORT,'context references a different or absent installation'); END;

CREATE TRIGGER installation_draft_version_scope BEFORE INSERT ON installation_draft_version
BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM work_item w JOIN installation_context_snapshot c
  ON c.id=NEW.context_snapshot_id WHERE w.id=NEW.work_item_id
  AND w.item_kind='INSTALLATION_PREPARATION' AND w.installation_work_order_id=c.installation_work_order_id
  AND w.service_provider_id=c.service_provider_id AND w.pending_write_id IS NULL AND w.status!='COMPLETED'
  AND c.gmt_create<=NEW.gmt_create)
 THEN RAISE(ABORT,'draft scope or unresolved write mismatch') END;
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM analysis_result a JOIN analysis_input_snapshot s
  ON s.id=a.snapshot_id WHERE a.id=NEW.analysis_result_id AND a.work_item_id=NEW.work_item_id
  AND s.skill='INSTALLATION_EXTRACTION' AND a.gmt_create<=NEW.gmt_create)
 THEN RAISE(ABORT,'draft requires its installation extraction result') END;
 SELECT CASE WHEN (NEW.version_no=1 AND EXISTS (SELECT 1 FROM installation_draft d WHERE d.id=NEW.installation_draft_id))
  OR (NEW.version_no>1 AND NOT EXISTS (SELECT 1 FROM installation_draft d JOIN installation_draft_version v
   ON v.id=d.current_version_id WHERE d.id=NEW.installation_draft_id AND d.work_item_id=NEW.work_item_id
   AND v.id=NEW.parent_version_id AND v.version_no+1=NEW.version_no AND v.gmt_create<=NEW.gmt_create))
 THEN RAISE(ABORT,'draft parent or sequence mismatch') END;
END;

CREATE TRIGGER installation_draft_initial BEFORE INSERT ON installation_draft
WHEN NEW.row_version!=1 OR NOT EXISTS (SELECT 1 FROM installation_draft_version v
 WHERE v.id=NEW.current_version_id AND v.installation_draft_id=NEW.id
 AND v.work_item_id=NEW.work_item_id AND v.version_no=1 AND v.gmt_create<=NEW.gmt_create)
BEGIN SELECT RAISE(ABORT,'draft requires its first complete version'); END;

CREATE TRIGGER installation_draft_advance BEFORE UPDATE ON installation_draft
BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM work_item w WHERE w.id=OLD.work_item_id
  AND w.pending_write_id IS NULL AND w.status!='COMPLETED')
 THEN RAISE(ABORT,'draft cannot advance during unresolved write or after completion') END;
 SELECT CASE WHEN NEW.id IS NOT OLD.id OR NEW.work_item_id IS NOT OLD.work_item_id
 OR NEW.gmt_create IS NOT OLD.gmt_create OR NEW.gmt_modified<OLD.gmt_modified
 OR NEW.row_version!=OLD.row_version+1
 THEN RAISE(ABORT,'draft identity or edit version changed incorrectly') END;
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM installation_draft_version v
 WHERE v.id=NEW.current_version_id AND v.installation_draft_id=OLD.id AND v.work_item_id=OLD.work_item_id
 AND v.parent_version_id=OLD.current_version_id AND v.gmt_create<=NEW.gmt_modified)
 THEN RAISE(ABORT,'draft may only advance to its next saved version') END;
END;

CREATE TRIGGER installation_submission_content BEFORE INSERT ON installation_detail_submission
BEGIN
 SELECT CASE WHEN COALESCE(json_extract(NEW.request_json,'$.submissionId')=NEW.id,0)=0
 OR COALESCE(json_extract(NEW.request_json,'$.humanDecisionId')=NEW.human_decision_id,0)=0
 OR COALESCE(json_extract(NEW.request_json,'$.confirmedDraftVersion')=NEW.draft_version_id,0)=0
 OR COALESCE(json_type(NEW.request_json,'$.items')='array',0)=0
 OR COALESCE(json_array_length(NEW.request_json,'$.items') BETWEEN 1 AND 100,0)=0
 OR COALESCE(json_type(NEW.request_json,'$.sourceMaterials')='array',0)=0
 OR json_type(NEW.request_json,'$.expectedDetailVersion') IS NULL
 THEN RAISE(ABORT,'submission request structure incomplete') END;
 SELECT CASE WHEN EXISTS (SELECT 1 FROM json_each(NEW.request_json,'$.items') j WHERE
 j.type!='object' OR COALESCE(json_type(j.value,'$.installationItem')='text' AND length(trim(json_extract(j.value,'$.installationItem')))>0,0)=0
 OR COALESCE(json_type(j.value,'$.installedQuantity') IN ('integer','real') AND json_extract(j.value,'$.installedQuantity') BETWEEN 0 AND 1.7976931348623157e308,0)=0
 OR COALESCE(json_type(j.value,'$.unit')='text' AND length(trim(json_extract(j.value,'$.unit')))>0,0)=0
 OR COALESCE(json_type(j.value,'$.materialSupplier')='text' AND length(trim(json_extract(j.value,'$.materialSupplier')))>0,0)=0
 OR COALESCE(json_type(j.value,'$.serviceScope')='text' AND length(trim(json_extract(j.value,'$.serviceScope')))>0,0)=0
 OR json_type(j.value,'$.plannedQuantity') IS NOT NULL)
 THEN RAISE(ABORT,'submission actual items are incomplete') END;
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM installation_draft_version v JOIN installation_draft d ON d.id=v.installation_draft_id
  WHERE v.id=NEW.draft_version_id AND d.current_version_id=v.id AND v.work_item_id=NEW.work_item_id
  AND json_extract(NEW.request_json,'$.installationDraftId')=d.id
  AND json_extract(NEW.request_json,'$.items')=json(v.items_json)
  AND json_extract(NEW.request_json,'$.sourceMaterials')=json(v.source_materials_json)
  AND json_array_length(v.open_questions_json)=0 AND v.gmt_create<=NEW.gmt_create)
 THEN RAISE(ABORT,'submission must use the current complete saved version') END;
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM installation_draft_version v JOIN installation_context_snapshot c ON c.id=v.context_snapshot_id
  WHERE v.id=NEW.draft_version_id AND c.completeness='COMPLETE'
  AND c.installation_work_order_id=NEW.installation_work_order_id AND c.service_provider_id=NEW.service_provider_id
  AND json_extract(NEW.request_json,'$.expectedWorkOrderVersion')=c.source_work_order_version
  AND json_extract(NEW.request_json,'$.expectedPlanVersion')=c.source_plan_version
  AND ((c.detail_status='NOT_SUBMITTED' AND json_type(NEW.request_json,'$.expectedDetailVersion')='null')
   OR (c.detail_status='SUBMITTED' AND json_extract(NEW.request_json,'$.expectedDetailVersion')=c.source_detail_version)))
 THEN RAISE(ABORT,'submission source versions or detail state unknown') END;
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM human_decision h JOIN installation_draft_version v ON v.id=NEW.draft_version_id
  WHERE h.id=NEW.human_decision_id AND h.origin='LOCAL' AND h.action_type='SUBMIT_INSTALLATION'
  AND h.work_item_id=NEW.work_item_id AND h.service_provider_id=NEW.service_provider_id
  AND h.analysis_result_id=v.analysis_result_id AND h.gmt_create<=NEW.gmt_create
  AND json(h.content_json)=json(NEW.request_json))
 THEN RAISE(ABORT,'submission requires matching human confirmation') END;
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM work_item w JOIN installation_work_order o ON o.id=w.installation_work_order_id
  JOIN human_decision h ON h.id=NEW.human_decision_id WHERE w.id=NEW.work_item_id
  AND w.item_kind='INSTALLATION_PREPARATION' AND w.status!='COMPLETED'
  AND w.installation_work_order_id=NEW.installation_work_order_id AND w.service_provider_id=NEW.service_provider_id
  AND o.source_system=NEW.target_source_system AND w.row_version=h.expected_work_item_version
  AND w.responsibility_version=h.expected_responsibility_version
  AND (w.pending_write_id IS NULL OR w.pending_write_id=NEW.id))
 THEN RAISE(ABORT,'submission scope or current condition changed') END;
END;
