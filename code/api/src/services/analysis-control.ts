import type { ResolvedIdentity } from './identity';
import type { WorkItemRow } from './work-item-query';
import { hasAction } from './permission-guard';
import { newId, ServiceError } from './change-batch';
import { scheduleInputPreparation } from './source-discovery';
import { hasManualAnalysisTrigger } from './analysis-trigger';

const actions: Record<string, string[]> = {
  INSTALLATION_PREPARATION: ['CONFIRM_INSTALLATION_DRAFT', 'SUBMIT_INSTALLATION_DETAIL'],
  INSTALLATION_REVIEW: ['DECIDE_INSTALLATION_REVIEW'],
  RECONCILIATION: ['REQUEST_BILLING_VERIFICATION', 'REPLY_BILLING_VERIFICATION'],
  CONFIGURATION: ['ENABLE_INTEGRATION_CONFIG'],
};
export function canRequestAnalysis(identity: ResolvedIdentity, row: WorkItemRow) {
  return row.assignee_identity_id === identity.identityId && !row.pending_write_id
    && ['PREPARING', 'READY', 'BLOCKED'].includes(row.status)
    && (actions[row.item_kind] ?? []).some(action => hasAction(identity, action, 'SERVICE_PROVIDER', row.service_provider_id));
}

export const CURRENT_ANALYSIS_JOB = `(bj.purpose='READ_SOURCE' AND json_extract(bj.target_json,'$.analysisGeneration')=w.analysis_generation
 OR bj.purpose='ANALYZE_SKILL' AND EXISTS(SELECT 1 FROM analysis_input_snapshot s WHERE s.id=json_extract(bj.target_json,'$.snapshotId') AND s.work_item_id=w.id AND s.analysis_generation=w.analysis_generation))`;

export async function analysisProgress(db: D1Database, row: WorkItemRow, manualAnalysis = false) {
  const job = await db.prepare(`SELECT bj.purpose,bj.status,bj.outcome_json FROM background_job bj JOIN work_item w ON w.id=bj.work_item_id
    WHERE w.id=? AND (${CURRENT_ANALYSIS_JOB}) ORDER BY bj.gmt_create DESC,bj.id DESC LIMIT 1`)
    .bind(row.id).first<{purpose:string;status:string;outcome_json:string|null}>();
  if (row.current_analysis_result_id) return { state: 'AVAILABLE', description: '分析已完成', errorCode: null };
  if(row.blocked_reason?.startsWith('材料文字待核对'))return {state:'WAITING_MATERIALS',description:row.blocked_reason,errorCode:null};
  if(row.item_kind==='RECONCILIATION'&&row.current_reconciliation_id&&await db.prepare("SELECT id FROM reconciliation_record WHERE id=? AND status='MATCHED' AND snapshot_id IN (SELECT id FROM analysis_input_snapshot WHERE work_item_id=? AND analysis_generation=?)").bind(row.current_reconciliation_id,row.id,row.analysis_generation).first())
    return {state:'CHECKED',description:'程序已逐项核对，双方数量、单价、金额及费用范围一致，无需 AI 分析。',errorCode:null};
  if (row.item_kind === 'COORDINATION') return { state: 'NOT_APPLICABLE', description: '由履约人员跟进处理', errorCode: null };
  if (manualAnalysis && !await hasManualAnalysisTrigger(db, row.id)) return { state: 'WAITING_MANUAL', description: '等待手动运行。点击“运行分析”后，系统会准备资料并执行本事项的分析。', errorCode: null };
  if (job && ['FAILED', 'BLOCKED'].includes(job.status)) {
    const errorCode = job.outcome_json ? JSON.parse(job.outcome_json).errorCode ?? null : null;
    const reason = errorCode === 'MOCK_AI_NOT_ANALYSIS' ? '此前启动配置停用了真实分析，请恢复模型配置后重新分析。'
      : errorCode === 'SOURCE_PREPARATION_FAILED' ? '资料读取或分析准备失败，请检查来源状态后重试。'
      : '分析任务失败，请检查运行记录后重试。';
    return { state: 'FAILED', description: reason, errorCode };
  }
  if (job?.purpose === 'ANALYZE_SKILL') return { state: job.status === 'RUNNING' ? 'RUNNING' : 'QUEUED', description: job.status === 'RUNNING' ? '正在分析，请稍候。' : '运行请求已提交，等待执行。', errorCode: null };
  return { state: 'PREPARING', description: '正在读取来源资料并准备分析输入。', errorCode: null };
}

export async function requestAnalysis(db: D1Database, identity: ResolvedIdentity, row: WorkItemRow, key: string, expectedVersion: number) {
  const eventKey = `manual-analysis:${identity.identityId}:${key}`;
  const prior = await db.prepare('SELECT details_json FROM activity_record WHERE work_item_id=? AND event_key=?').bind(row.id, eventKey).first<{details_json:string}>();
  if (prior) {
    const details = JSON.parse(prior.details_json);
    if (details.expectedVersion !== expectedVersion) throw new ServiceError(409, 40902, '同一请求编号不能用于不同事项版本');
    return { status: 'ACCEPTED', analysisGeneration: details.analysisGeneration };
  }
  if (!canRequestAnalysis(identity, row)) throw new ServiceError(403, 40301, '当前账号或事项状态不允许重新分析');
  if (row.row_version !== expectedVersion) throw new ServiceError(409, 40901, '事项已变化，请刷新后重试');
  const running = await db.prepare(`SELECT bj.id FROM background_job bj JOIN work_item w ON w.id=bj.work_item_id WHERE w.id=? AND (${CURRENT_ANALYSIS_JOB}) AND bj.status IN ('READY','RUNNING','RETRY_WAIT') LIMIT 1`).bind(row.id).first();
  if (running) {
    if (await hasManualAnalysisTrigger(db, row.id)) return { status: 'ALREADY_QUEUED', analysisGeneration: row.analysis_generation };
    const now=Date.now();
    const saved=await db.prepare(`INSERT INTO activity_record(id,work_item_id,event_key,event_type,actor_identity_id,occurred_at,details_json,gmt_create,gmt_modified)
      SELECT ?,?,?,'PROGRESS_SAVED',?,?,?,?,? WHERE EXISTS(SELECT 1 FROM work_item WHERE id=? AND row_version=? AND analysis_generation=? AND assignee_identity_id=? AND pending_write_id IS NULL)`)
      .bind(newId('act'),row.id,eventKey,identity.identityId,now,JSON.stringify({description:'手动运行分析',expectedVersion,analysisGeneration:row.analysis_generation,manualTrigger:true}),now,now,row.id,expectedVersion,row.analysis_generation,identity.identityId).run();
    if (!saved.meta.changes) throw new ServiceError(409,40901,'事项已变化，请刷新后重试');
    return { status:'ACCEPTED', analysisGeneration:row.analysis_generation };
  }
  const now = Date.now(), generation = row.analysis_generation + 1, assertion = newId('assert');
  try {
    await db.batch([
      db.prepare(`INSERT INTO transaction_assertion SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM work_item WHERE id=? AND row_version=? AND assignee_identity_id=? AND pending_write_id IS NULL AND status IN ('PREPARING','READY','BLOCKED')) THEN 1 ELSE 0 END,?,?`).bind(assertion,row.id,expectedVersion,identity.identityId,now,now),
      db.prepare(`UPDATE work_item SET analysis_generation=analysis_generation+1,row_version=row_version+1,status='PREPARING',blocked_reason=NULL,current_analysis_result_id=NULL,current_reconciliation_id=NULL,gmt_modified=? WHERE id=? AND row_version=?`).bind(now,row.id,expectedVersion),
      scheduleInputPreparation(db,row.id,generation,row.service_provider_id,now),
      db.prepare(`INSERT INTO activity_record(id,work_item_id,event_key,event_type,actor_identity_id,occurred_at,details_json,gmt_create,gmt_modified) VALUES(?,?,?,'PROGRESS_SAVED',?,?,?,?,?)`).bind(newId('act'),row.id,eventKey,identity.identityId,now,JSON.stringify({description:'手动运行分析',expectedVersion,analysisGeneration:generation,manualTrigger:true}),now,now),
      db.prepare('DELETE FROM transaction_assertion WHERE id=?').bind(assertion),
    ]);
  } catch { throw new ServiceError(409,40901,'事项已变化，请刷新后重试'); }
  return { status: 'ACCEPTED', analysisGeneration: generation };
}
