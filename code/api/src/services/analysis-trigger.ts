export const requiresManualAnalysis = (env: {EXTERNAL_MODE?: string}) => (env.EXTERNAL_MODE ?? 'mock') === 'mock';

export const MANUAL_ANALYSIS_TRIGGER = `EXISTS(SELECT 1 FROM activity_record trigger_record
  WHERE trigger_record.work_item_id=w.id AND trigger_record.event_type='PROGRESS_SAVED'
    AND trigger_record.event_key LIKE 'manual-analysis:%' AND trigger_record.actor_identity_id IS NOT NULL
    AND json_extract(trigger_record.details_json,'$.manualTrigger')=1
    AND json_extract(trigger_record.details_json,'$.analysisGeneration')=w.analysis_generation)`;

// Legacy startup recovery used the same event prefix, but never recorded manualTrigger.
// Recheck this predicate when acquiring the lease, so a concurrent source update cannot
// release a job using permission from an earlier analysis generation.
export const MANUAL_ANALYSIS_JOB_ALLOWED = `(purpose NOT IN ('READ_SOURCE','ANALYZE_SKILL','RECONCILE','TRIAL_CONFIG','PARSE_MATERIAL')
  OR (purpose='PARSE_MATERIAL' AND json_extract(target_json,'$.uploadId') IS NOT NULL)
  OR EXISTS(SELECT 1 FROM work_item w WHERE w.id=background_job.work_item_id
    AND ${MANUAL_ANALYSIS_TRIGGER}
    AND (purpose NOT IN ('READ_SOURCE','PARSE_MATERIAL') OR json_extract(target_json,'$.analysisGeneration')=w.analysis_generation)
    AND (purpose<>'ANALYZE_SKILL' OR EXISTS(SELECT 1 FROM analysis_input_snapshot s
      WHERE s.id=json_extract(target_json,'$.snapshotId') AND s.work_item_id=w.id AND s.analysis_generation=w.analysis_generation))))`;

export async function hasManualAnalysisTrigger(db:D1Database, workItemId:string) {
  return !!await db.prepare(`SELECT w.id FROM work_item w WHERE w.id=? AND ${MANUAL_ANALYSIS_TRIGGER}`).bind(workItemId).first();
}
