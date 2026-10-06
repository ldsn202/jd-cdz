import type { Bindings } from '../index';
import type { DiscoveryAdoption } from './source-discovery';
import type { ResolvedIdentity } from './identity';
import { ServiceError, newId, nowMs, requireService } from './change-batch';
import { materialParsingTarget, buildMaterialParsingAdoption } from './material-parsing';
import { loadMaterialVersion } from './material-read';
import { externalTarget, scheduleExternalQuery } from './external-recovery';
import { MANUAL_ANALYSIS_JOB_ALLOWED, requiresManualAnalysis } from './analysis-trigger';

export const JOB_PURPOSES = [
  'DISCOVER_RELATIONS', 'READ_SOURCE', 'PARSE_MATERIAL', 'ANALYZE_SKILL', 'RECONCILE',
  'TRIAL_CONFIG', 'WRITE_EXTERNAL', 'QUERY_EXTERNAL', 'CONTINUE_LOCAL',
] as const;

export type DispatchConfig = {
  manualAnalysis?: boolean;
  leaseMs: number;
  maxAttempts: number;
  retryBackoffMs: number;
};

export function dispatchConfigFromEnv(env: {
  TASK_LEASE_MS?: string; TASK_MAX_ATTEMPTS?: string; TASK_RETRY_BACKOFF_MS?: string;
  EXTERNAL_MODE?: string;
}): DispatchConfig {
  return {
    manualAnalysis: requiresManualAnalysis(env),
    leaseMs: Number(env.TASK_LEASE_MS ?? 600000),
    maxAttempts: Number(env.TASK_MAX_ATTEMPTS ?? 3),
    retryBackoffMs: Number(env.TASK_RETRY_BACKOFF_MS ?? 60000),
  };
}

type JobRow = {
  id: string;
  purpose: string;
  service_provider_id: string;
  target_json: string;
  status: string;
  lease_epoch: number;
  row_version: number;
  external_write_id: string | null;
};

export async function claimJobs(
  db: D1Database,
  identity: ResolvedIdentity,
  cfg: DispatchConfig,
  body: { purposes: string[]; limit: number }
): Promise<{ claims: { jobId: string; attemptId: string; purpose: string; target: unknown; leaseToken: string; leaseEpoch: number; leaseUntil: number }[] }> {
  requireService(identity);
  if (!Array.isArray(body?.purposes) || body.purposes.some((p) => !(JOB_PURPOSES as readonly string[]).includes(p))) {
    throw new ServiceError(400, 40002, 'purposes 含非法任务目的');
  }
  const limit = Number(body.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
    throw new ServiceError(400, 40001, 'limit 须为 1—10 的整数');
  }

  const now = nowMs();
  const providerIds = [...new Set(identity.grants.filter(g => g.scopeType === 'SERVICE_PROVIDER'
    && g.actions.includes('PREPARE_ANALYSIS')&&g.sourceSystem==null&&g.recordType==null).flatMap(g => g.resourceIds))];
  if (providerIds.length === 0 || body.purposes.length === 0) return { claims: [] };
  const candidates = await db
    .prepare(
      `SELECT id, purpose, service_provider_id, target_json, status, lease_epoch, row_version, external_write_id
       FROM background_job
       WHERE purpose IN (${body.purposes.map(() => '?').join(',')})
         AND service_provider_id IN (SELECT value FROM json_each(?))
         AND (?=0 OR ${MANUAL_ANALYSIS_JOB_ALLOWED})
         AND ((status IN ('READY','RETRY_WAIT') AND (available_at IS NULL OR available_at <= ?))
           OR (status = 'RUNNING' AND lease_until < ?))
       ORDER BY gmt_create, id LIMIT ?`
    )
    .bind(...body.purposes, JSON.stringify(providerIds), cfg.manualAnalysis ? 1 : 0, now, now, limit)
    .all<JobRow>();

  const claims = [];
  for (const job of candidates.results ?? []) {
    const token = newId('lease');
    const epoch = job.lease_epoch + 1;
    const until = now + cfg.leaseMs;
    const updated = await db
      .prepare(
        `UPDATE background_job
         SET status = 'RUNNING', lease_token = ?, lease_epoch = ?, lease_owner = ?, lease_until = ?,
             row_version = row_version + 1, gmt_modified = ?
         WHERE id = ? AND row_version = ?
           AND (?=0 OR ${MANUAL_ANALYSIS_JOB_ALLOWED})
           AND ((status IN ('READY','RETRY_WAIT') AND (available_at IS NULL OR available_at <= ?))
             OR (status = 'RUNNING' AND lease_until < ?))`
      )
      .bind(token, epoch, identity.identityId, until, now, job.id, job.row_version, cfg.manualAnalysis ? 1 : 0, now, now)
      .run();
    if (!updated.meta.changes) continue;

    const attemptNoRow = await db
      .prepare('SELECT COALESCE(MAX(attempt_no), 0) + 1 AS n FROM execution_attempt WHERE job_id = ?')
      .bind(job.id)
      .first<{ n: number }>();
    const parseTarget = job.purpose === 'PARSE_MATERIAL' ? await materialParsingTarget(db, job.id, JSON.parse(job.target_json)) : null;
    const attemptId = newId('ea');
    await db
      .prepare(
        `INSERT INTO execution_attempt (id, job_id, attempt_no, executor_identity_id, capability_call_id, lease_epoch, lease_token, authorization_contexts_json, dispatch_state, status, started_at, gmt_create, gmt_modified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'NOT_SENT', 'RUNNING', ?, ?, ?)`
      )
      .bind(
        attemptId, job.id, attemptNoRow?.n ?? 1, identity.identityId, parseTarget?.runId ?? null, epoch, token,
        JSON.stringify([{ role: 'EXECUTOR', identityId: identity.identityId, verifiedAt: now }]),
        now, now, now
      )
      .run();
    let inputTarget: Record<string,unknown> | null=null;
    if(job.purpose==='READ_SOURCE'){
      const row=await db.prepare('SELECT w.item_kind FROM work_item w JOIN background_job j ON j.work_item_id=w.id WHERE j.id=?').bind(job.id).first<{item_kind:string}>();
      const names:Record<string,string>={CONFIGURATION:'INTEGRATION_CONFIGURATION',INSTALLATION_PREPARATION:'INSTALLATION_EXTRACTION',INSTALLATION_REVIEW:'INSTALLATION_EVIDENCE',RECONCILIATION:'RECONCILIATION_EXPLANATION'};
      inputTarget={...JSON.parse(job.target_json),skill:row?names[row.item_kind]:null};
    }
    claims.push({
      jobId: job.id,
      attemptId,
      purpose: job.purpose,
      target: job.external_write_id && ['WRITE_EXTERNAL', 'QUERY_EXTERNAL'].includes(job.purpose)
        ? await externalTarget(db, job.external_write_id, job.purpose === 'QUERY_EXTERNAL')
        : inputTarget ?? parseTarget ?? JSON.parse(job.target_json),
      leaseToken: token,
      leaseEpoch: epoch,
      leaseUntil: until,
    });
  }
  return { claims };
}

type AttemptJoin = {
  service_provider_id: string;
  attempt_id: string;
  job_id: string;
  lease_epoch: number;
  lease_token: string;
  dispatch_state: string;
  attempt_status: string;
  attempt_no: number;
  job_status: string;
  job_lease_epoch: number;
  lease_owner: string | null;
  lease_until: number | null;
  purpose: string;
  external_write_id: string | null;
  work_item_id: string | null;
  target_json: string;
};

async function loadAttempt(db: D1Database, attemptId: string): Promise<AttemptJoin | null> {
  return db
    .prepare(
      `SELECT a.id AS attempt_id, a.job_id, a.lease_epoch, a.lease_token, a.dispatch_state,
              a.status AS attempt_status, a.attempt_no,
              j.status AS job_status, j.lease_epoch AS job_lease_epoch, j.lease_owner, j.lease_until,
              j.purpose, j.service_provider_id, j.external_write_id, j.work_item_id, j.target_json
       FROM execution_attempt a JOIN background_job j ON j.id = a.job_id WHERE a.id = ?`
    )
    .bind(attemptId)
    .first<AttemptJoin>();
}

function checkLease(
  identity: ResolvedIdentity,
  row: AttemptJoin,
  body: { leaseToken?: string; leaseEpoch?: number }
): void {
  requireService(identity);
  if(!identity.grants.some(g=>g.scopeType==='SERVICE_PROVIDER'&&g.actions.includes('PREPARE_ANALYSIS')&&g.sourceSystem==null&&g.recordType==null&&g.resourceIds.includes(row.service_provider_id)))throw new ServiceError(403,40301,'当前服务身份已无该任务服务商范围权限');
  const now = nowMs();
  if (
    row.lease_token !== body.leaseToken ||
    row.lease_epoch !== body.leaseEpoch ||
    row.job_lease_epoch !== body.leaseEpoch ||
    row.lease_owner !== identity.identityId ||
    row.job_status !== 'RUNNING' ||
    (row.lease_until ?? 0) <= now
  ) {
    throw new ServiceError(409, 40901, '失去领取权：令牌、代次、身份或时效不匹配');
  }
}

export async function heartbeat(
  db: D1Database,
  identity: ResolvedIdentity,
  cfg: DispatchConfig,
  attemptId: string,
  body: { leaseToken?: string; leaseEpoch?: number }
): Promise<{ attemptId: string; leaseUntil: number }> {
  const row = await loadAttempt(db, attemptId);
  if (!row) throw new ServiceError(404, 40404, '资源不存在或不可见');
  checkLease(identity, row, body);
  const until = nowMs() + cfg.leaseMs;
  await db
    .prepare('UPDATE background_job SET lease_until = ?, row_version = row_version + 1, gmt_modified = ? WHERE id = ? AND lease_epoch = ?')
    .bind(until, nowMs(), row.job_id, row.job_lease_epoch)
    .run();
  return { attemptId, leaseUntil: until };
}

export async function dispatchStart(
  db: D1Database,
  identity: ResolvedIdentity,
  attemptId: string,
  body: { leaseToken?: string; leaseEpoch?: number }
): Promise<{ attemptId: string; dispatchState: string }> {
  const row = await loadAttempt(db, attemptId);
  if (!row) throw new ServiceError(404, 40404, '资源不存在或不可见');
  checkLease(identity, row, body);
  if (row.dispatch_state !== 'NOT_SENT') {
    throw new ServiceError(409, 40901, `当前 dispatch_state=${row.dispatch_state}，不可重复登记发出`);
  }

  const now = nowMs();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(`UPDATE execution_attempt SET dispatch_state = 'MAY_HAVE_BEEN_SENT', gmt_modified = ? WHERE id = ? AND dispatch_state = 'NOT_SENT'`)
      .bind(now, attemptId),
  ];

  if (row.purpose === 'WRITE_EXTERNAL') {
    if (!row.external_write_id) throw new ServiceError(422, 42201, '外部写入任务缺少关联操作');
    const op = await db
      .prepare('SELECT id, status, row_version FROM external_write_operation WHERE id = ?')
      .bind(row.external_write_id)
      .first<{ id: string; status: string; row_version: number }>();
    if (!op) throw new ServiceError(422, 42201, '外部写入操作不存在');
    // A takeover of a dispatched write can only query the original operation.
    if (op.status === 'REGISTERED') statements.push(
      db
        .prepare(`UPDATE external_write_operation SET status = 'PROCESSING', row_version = row_version + 1, gmt_modified = ? WHERE id = ? AND status = 'REGISTERED' AND row_version = ?`)
        .bind(now, op.id, op.row_version)
    );
  }

  await db.batch(statements);
  return { attemptId, dispatchState: 'MAY_HAVE_BEEN_SENT' };
}

export async function reportResult(
  db: D1Database,
  identity: ResolvedIdentity,
  cfg: DispatchConfig,
  attemptId: string,
  body: {
    leaseToken?: string;
    leaseEpoch?: number;
    status?: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
    dispatchState?: string;
    result?: unknown;
    errorCode?: string;
  } , serverAdoption?: DiscoveryAdoption
): Promise<{ attemptId: string; jobId: string; adopted: boolean; jobStatus: string }> {
  const row = await loadAttempt(db, attemptId);
  if (!row) throw new ServiceError(404, 40404, '资源不存在或不可见');
  checkLease(identity, row, body);
  const status = body.status;
  if (!status || !['SUCCEEDED', 'FAILED', 'UNKNOWN'].includes(status)) {
    throw new ServiceError(400, 40002, 'status 须为 SUCCEEDED / FAILED / UNKNOWN');
  }

  const now = nowMs();
  const dispatchState = body.dispatchState === 'RESPONSE_RECEIVED' ? 'RESPONSE_RECEIVED' : row.dispatch_state;
  let resultJson =
    body.result !== null && typeof body.result === 'object' ? JSON.stringify(body.result) : '{}';

  let jobStatus: string;
  let outcome: string;
  let availableAt: number | null = null;
  if (status === 'SUCCEEDED') {
    jobStatus = 'SUCCEEDED';
    outcome = JSON.stringify({ result: body.result ?? null });
  } else if (status === 'FAILED') {
    if (row.attempt_no < cfg.maxAttempts) {
      jobStatus = 'RETRY_WAIT';
      availableAt = now + cfg.retryBackoffMs;
      outcome = JSON.stringify({ errorCode: body.errorCode ?? 'UNKNOWN', attemptNo: row.attempt_no });
    } else {
      jobStatus = 'FAILED';
      outcome = JSON.stringify({ errorCode: body.errorCode ?? 'UNKNOWN', attemptNo: row.attempt_no });
    }
  } else {
    jobStatus = 'RETRY_WAIT';
    availableAt = now + cfg.retryBackoffMs;
    outcome = JSON.stringify({ errorCode: body.errorCode ?? 'RESULT_UNKNOWN', attemptNo: row.attempt_no });
  }

  let adopted = false;
  const extraStatements: D1PreparedStatement[] = [];
  if (status === 'SUCCEEDED' && row.purpose === 'DISCOVER_RELATIONS') {
    if(!serverAdoption)throw new ServiceError(403,40301,'来源关系必须由服务端实际核实');
    extraStatements.push(...serverAdoption.statements);adopted=true;jobStatus=serverAdoption.jobStatus;
    resultJson=JSON.stringify(serverAdoption.result);outcome=JSON.stringify({result:serverAdoption.result});availableAt=serverAdoption.jobStatus==='RETRY_WAIT'?now+cfg.retryBackoffMs:null;
  }

  if (status === 'SUCCEEDED' && row.purpose === 'ANALYZE_SKILL') {
    const { buildAnalysisAdoption } = await import('./analysis-pipeline');
    const adoption = await buildAnalysisAdoption(
      db,
      { id: row.job_id, work_item_id: row.work_item_id, target_json: row.target_json },
      body.result
    );
    if (adoption.ok) {
      extraStatements.push(...adoption.statements);
      adopted = true;
    } else {
      jobStatus = 'FAILED';
      availableAt = null;
      outcome = JSON.stringify({ errorCode: adoption.errorCode, attemptNo: row.attempt_no });
    }
  }

  if (status === 'SUCCEEDED' && row.purpose === 'PARSE_MATERIAL') {
    const adoption = await buildMaterialParsingAdoption(db, { id: row.job_id, target_json: row.target_json }, body.result);
    if (adoption.ok) {
      extraStatements.push(...adoption.statements);
      adopted = true;
      jobStatus = adoption.jobStatus;
      availableAt = null;
    } else {
      jobStatus = 'FAILED';
      availableAt = null;
      outcome = JSON.stringify({ errorCode: adoption.errorCode, attemptNo: row.attempt_no });
    }
  }

  if (status === 'SUCCEEDED' && row.purpose === 'TRIAL_CONFIG') {
    const scope=await db.prepare('SELECT service_provider_id FROM background_job WHERE id=?').bind(row.job_id).first<{service_provider_id:string}>();
    if(!scope||!identity.grants.some(g=>g.scopeType==='SERVICE_PROVIDER'&&g.actions.includes('PREPARE_ANALYSIS')&&g.sourceSystem==null&&g.recordType==null&&g.resourceIds.includes(scope.service_provider_id)))throw new ServiceError(403,40301,'当前服务身份无该配置服务商范围权限');
    const { buildConfigurationTrialAdoption } = await import('./config-execution');
    const trial = await buildConfigurationTrialAdoption(db, {id:row.job_id,work_item_id:row.work_item_id,target_json:row.target_json});
    availableAt = null;
    if (trial.ok) {
      extraStatements.push(...trial.statements);
      adopted = true;
      jobStatus = trial.jobStatus;
      resultJson = JSON.stringify(trial.result);
      outcome = resultJson;
    } else {
      jobStatus = 'FAILED';
      outcome = JSON.stringify({errorCode:trial.errorCode});
    }
  }

  if (row.purpose === 'WRITE_EXTERNAL' || row.purpose === 'QUERY_EXTERNAL') {
    const { buildWriteAdoption } = await import('./write-adoption');
    const adoption = await buildWriteAdoption(
      db,
      {
        id: row.job_id,
        external_write_id: row.external_write_id,
        work_item_id: row.work_item_id,
        target_json: row.target_json,
      },
      status as 'SUCCEEDED' | 'FAILED' | 'UNKNOWN',
      dispatchState,
      body.result
    );
    if (!adoption.ok) {
      jobStatus = 'FAILED';
      availableAt = null;
      outcome = JSON.stringify({ errorCode: adoption.errorCode, attemptNo: row.attempt_no });
    } else {
      extraStatements.push(...adoption.statements);
      adopted = true;
      if (adoption.jobStatus === 'SUCCEEDED') {
        jobStatus = 'SUCCEEDED';
        availableAt = null;
        outcome = JSON.stringify({ result: body.result ?? null });
      } else if (adoption.jobStatus === 'BLOCKED') {
        jobStatus = 'BLOCKED';
        availableAt = null;
        outcome = JSON.stringify({ errorCode: body.errorCode ?? 'RESULT_UNKNOWN', attemptNo: row.attempt_no });
      }
      const receiptStatus = (body.result as { submissionStatus?: string; operationStatus?: string } | null);
      const pending = status !== 'SUCCEEDED' || receiptStatus?.submissionStatus === 'PENDING' || receiptStatus?.operationStatus === 'PENDING';
      if (pending && row.external_write_id) {
        if (row.purpose === 'QUERY_EXTERNAL') {
          jobStatus = 'RETRY_WAIT';
          availableAt = now + cfg.retryBackoffMs;
        } else {
          extraStatements.push(scheduleExternalQuery(db, row.external_write_id, row.job_id, now));
        }
      }
    }
  }

  await db.batch([
    db
      .prepare(
        `UPDATE execution_attempt
         SET status = ?, ended_at = ?, result_json = ?, error_code = ?, dispatch_state = ?, gmt_modified = ?
         WHERE id = ?`
      )
      .bind(
        status, now, resultJson, body.errorCode ?? null,
        dispatchState, now, attemptId
      ),
    db
      .prepare(
        `UPDATE background_job
         SET status = ?, available_at = ?, lease_token = NULL, lease_owner = NULL, lease_until = NULL,
             outcome_json = ?, row_version = row_version + 1, gmt_modified = ?
         WHERE id = ? AND lease_epoch = ?`
      )
      .bind(jobStatus, availableAt, outcome, now, row.job_id, row.job_lease_epoch),
    ...extraStatements,
  ]);

  return { attemptId, jobId: row.job_id, adopted, jobStatus };
}

// File bytes are available only to the current service lease, without exposing R2 locators to Node.
export async function readAttemptMaterial(db: D1Database, identity: ResolvedIdentity, attemptId: string, body: { leaseToken?: string; leaseEpoch?: number }) {
  const row = await loadAttempt(db, attemptId);
  if (!row) throw new ServiceError(404, 40404, '资源不存在或不可见');
  checkLease(identity, row, body);
  if (row.purpose !== 'PARSE_MATERIAL') throw new ServiceError(403, 40301, '仅材料解析任务可读取原文件');
  const scope = await db.prepare('SELECT service_provider_id FROM background_job WHERE id=?').bind(row.job_id).first<{ service_provider_id: string }>();
  if (!scope || !identity.grants.some(g => g.scopeType === 'SERVICE_PROVIDER' && g.actions.includes('PREPARE_ANALYSIS')&&g.sourceSystem==null&&g.recordType==null && g.resourceIds.includes(scope.service_provider_id))) {
    throw new ServiceError(403, 40301, '当前服务身份无该材料所属服务商范围权限');
  }
  const target = await materialParsingTarget(db, row.job_id, JSON.parse(row.target_json));
  const material = await loadMaterialVersion(db, target.materialVersionId);
  if (!material || material.content_sha256 !== target.parseInput.contentSha256) throw new ServiceError(409, 40901, '原文件绑定已变化');
  return material;
}

// Node requests deterministic execution; supplied client output/checks are never used.
export async function executeAttemptConfigurationTrial(db:D1Database,identity:ResolvedIdentity,cfg:DispatchConfig,attemptId:string,lease:{leaseToken?:string;leaseEpoch?:number}) {
  const row=await loadAttempt(db,attemptId);
  if(!row)throw new ServiceError(404,40404,'资源不存在或不可见');
  checkLease(identity,row,lease);
  if(row.purpose!=='TRIAL_CONFIG')throw new ServiceError(403,40301,'仅配置试转换任务可调用此入口');
  return reportResult(db,identity,cfg,attemptId,{...lease,status:'SUCCEEDED',dispatchState:'RESPONSE_RECEIVED'});
}


async function authorizeSourceAttempt(db:D1Database,identity:ResolvedIdentity,attemptId:string,lease:{leaseToken?:string;leaseEpoch?:number},purpose:string){
 const attempt=await loadAttempt(db,attemptId);
 if(!attempt)throw new ServiceError(404,40404,'资源不存在或不可见');
 checkLease(identity,attempt,lease);
 if(attempt.purpose!==purpose)throw new ServiceError(403,40301,'任务目的不匹配');
 const scope=await db.prepare('SELECT service_provider_id FROM background_job WHERE id=?').bind(attempt.job_id).first<{service_provider_id:string}>();
 if(!scope||!identity.grants.some(g=>g.scopeType==='SERVICE_PROVIDER'&&g.actions.includes('PREPARE_ANALYSIS')&&g.sourceSystem==null&&g.recordType==null&&g.resourceIds.includes(scope.service_provider_id)))throw new ServiceError(403,40301,'当前身份没有任务服务商权限');
 return {...attempt,service_provider_id:scope.service_provider_id};
}
export async function executeAttemptSourceDiscovery(db:D1Database,env:Bindings,identity:ResolvedIdentity,cfg:DispatchConfig,attemptId:string,lease:{leaseToken?:string;leaseEpoch?:number}){
 const row=await authorizeSourceAttempt(db,identity,attemptId,lease,'DISCOVER_RELATIONS');
 const {buildSourceDiscovery}=await import('./source-discovery');
 const adoption=await buildSourceDiscovery(db,env,{id:row.job_id,service_provider_id:row.service_provider_id,target_json:row.target_json});
 return reportResult(db,identity,cfg,attemptId,{...lease,status:'SUCCEEDED',dispatchState:'RESPONSE_RECEIVED'},adoption);
}
export async function executeAttemptInputPreparation(db:D1Database,env:Bindings,identity:ResolvedIdentity,cfg:DispatchConfig,attemptId:string,body:{leaseToken?:string;leaseEpoch?:number;skillPackageDigest?:string}){
 const row=await authorizeSourceAttempt(db,identity,attemptId,body,'READ_SOURCE');
 const target=JSON.parse(row.target_json);
 const item=await db.prepare('SELECT id,item_kind,analysis_generation,status,pending_write_id FROM work_item WHERE id=? AND service_provider_id=?').bind(row.work_item_id,row.service_provider_id).first<{id:string;item_kind:string;analysis_generation:number;status:string;pending_write_id:string|null}>();
 if(!item)throw new ServiceError(404,40404,'准备事项不存在');
 if(item.analysis_generation!==target.analysisGeneration||item.status==='COMPLETED')return reportResult(db,identity,cfg,attemptId,{...body,status:'SUCCEEDED',result:{skipped:'INPUT_SUPERSEDED'}});
 if(item.pending_write_id||['PROCESSING','WAITING_SUPPLEMENT','WAITING_REPLY','EXCEPTION'].includes(item.status))throw new ServiceError(409,40901,'事项等待原操作或人员回复，暂不重做分析');
 const skills={CONFIGURATION:'INTEGRATION_CONFIGURATION',INSTALLATION_PREPARATION:'INSTALLATION_EXTRACTION',INSTALLATION_REVIEW:'INSTALLATION_EVIDENCE',RECONCILIATION:'RECONCILIATION_EXPLANATION'} as const;
 const skill=skills[item.item_kind as keyof typeof skills];if(!skill)throw new ServiceError(422,42201,'此事项没有对应分析能力');
 if(!/^[a-f0-9]{64}$/.test(body.skillPackageDigest??''))throw new ServiceError(400,40001,'必须提供实际Skill包摘要');
 const {prepareAndRegisterAnalysis}=await import('./analysis-pipeline');
 const runId=`analysis:${item.id}:${item.analysis_generation}`;
 const prepared=await prepareAndRegisterAnalysis(db,env,identity,{runId,profileId:'opencode-skill',implementationVersion:'1.0.0',skillPackageDigest:body.skillPackageDigest!,analysisInput:{workItemId:item.id,skill}}, {beforeStatements:async()=>{
   await authorizeSourceAttempt(db,identity,attemptId,body,'READ_SOURCE');
   const id=newId('input-lease');const now=nowMs();
   return [db.prepare(`INSERT INTO transaction_assertion(id,passed,gmt_create,gmt_modified) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM background_job j JOIN execution_attempt a ON a.job_id=j.id JOIN work_item w ON w.id=j.work_item_id WHERE a.id=? AND a.status='RUNNING' AND j.status='RUNNING' AND j.lease_token=? AND j.lease_epoch=? AND j.lease_owner=? AND j.lease_until>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) AND w.analysis_generation=? AND w.pending_write_id IS NULL AND w.status IN ('PREPARING','READY','BLOCKED')) THEN 1 ELSE 0 END,?,?`).bind(id,attemptId,body.leaseToken,body.leaseEpoch,identity.identityId,item.analysis_generation,now,now),db.prepare('DELETE FROM transaction_assertion WHERE id=?').bind(id)];
 }});
 return reportResult(db,identity,cfg,attemptId,{...body,status:'SUCCEEDED',result:prepared});
}
