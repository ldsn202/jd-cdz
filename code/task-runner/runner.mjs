#!/usr/bin/env node
// 后台任务程序：经内部路由领取 ANALYZE_SKILL 任务，调用 skill-runtime 真实执行 OpenCode + 业务 Skill，回报结果。
// Node 不直接写 D1；所有状态经 Worker 内部接口流转。
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMaterialBytes, fetchMaterialBytes, assertAnalysisMode } from './material-parser.mjs';
import { executeExternal } from './external-executor.mjs';
import { packageDigest } from '../skill-runtime/run-local.mjs';
import { registry } from '../skill-runtime/contract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const WORKER = process.env.WORKER_BASE_URL ?? 'http://localhost:8788';
const TOKEN = process.env.SERVICE_TOKEN ?? 'dev-token-service';
const MODEL = process.env.SKILL_MODEL ?? 'deepseek/deepseek-flash';
const PURPOSE_ARG = process.env.SKILL_PURPOSE ?? undefined;
const RUNS_ROOT = process.env.RUNS_ROOT ?? join(here, 'runs');
const RUN_LOCAL = resolve(here, '../skill-runtime/run-local.mjs');
const LOOP_INTERVAL_MS = Number(process.env.LOOP_INTERVAL_MS ?? 15000);

async function api(path, body) {
  const res = await fetch(`${WORKER}/api/admin/charging/internal${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`API ${path} -> ${json.code} ${json.msg}`);
  return json.data;
}

function runSkillRuntime(requestPath, evidenceDir, purpose) {
  return new Promise((done) => {
    const args = [RUN_LOCAL, requestPath, evidenceDir, MODEL];
    if (purpose ?? PURPOSE_ARG) args.push(purpose ?? PURPOSE_ARG);
    const child = spawn('node', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b) => (stdout += b));
    child.stderr.on('data', (b) => (stderr += b));
    child.on('error', (error) => done({ code: -1, stdout, stderr: error.message }));
    child.on('close', (code) => done({ code, stdout, stderr }));
  });
}

async function executeAnalysisClaim(claim) {
  // Both deployed Worker mode and executor opt-in are required before any paid model work.
  try {
    const healthResponse = await fetch(`${WORKER}/api/health`, { signal: AbortSignal.timeout(10000) });
    const health = await healthResponse.json();
    if (!healthResponse.ok || health.code !== 0) throw Object.assign(new Error('AI_MODE_UNVERIFIED'), { code: 'AI_MODE_UNVERIFIED' });
    assertAnalysisMode(health.data?.aiMode, process.env.AI_MODE);
    const skillName=registry[claim.target.skill]?.name;
    if(!skillName||await packageDigest(resolve(here,'../../docs/04-skills',skillName))!==claim.target.skillPackageDigest)
      throw Object.assign(new Error('SKILL_PACKAGE_CHANGED'),{code:'SKILL_PACKAGE_CHANGED'});
  } catch (error) {
    const adopted = await api(`/job-attempts/${claim.attemptId}/results`, {
      leaseToken: claim.leaseToken, leaseEpoch: claim.leaseEpoch,
      status: 'FAILED', errorCode: error.code ?? 'AI_MODE_UNVERIFIED', result: { issues: [error.message] },
    });
    return { runId: claim.target.runId, outcome: adopted.jobStatus, errorCode: error.code };
  }
  const t = claim.target;
  const runDir = join(RUNS_ROOT, t.runId.replace(/[^A-Za-z0-9._-]/g, '_'));
  await mkdir(runDir, { recursive: true });
  const request = {
    runId: t.runId,
    operation: 'ANALYZE_SKILL',
    profileId: t.profileId,
    parseInput: null,
    analysisInput: {
      skill: t.skill,
      skillVersion: t.skillVersion,
      outputSchemaVersion: t.outputSchemaVersion,
      inputSnapshotId: t.snapshotId,
      records: t.records,
      parsedMaterials: t.parsedMaterials ?? [],
    },
  };
  const requestPath = join(runDir, 'request.json');
  await writeFile(requestPath, JSON.stringify(request, null, 2));
  const evidenceDir = join(runDir, `evidence-${claim.attemptId}`);

  await api(`/job-attempts/${claim.attemptId}/dispatch-start`, {
    leaseToken: claim.leaseToken,
    leaseEpoch: claim.leaseEpoch,
  });

  const run = await runSkillRuntime(requestPath, evidenceDir, t.configurationPurpose);
  if (run.code === 0) {
    const result = JSON.parse(await readFile(join(evidenceDir, 'result.json'), 'utf8'));
    await api(`/job-attempts/${claim.attemptId}/results`, {
      leaseToken: claim.leaseToken,
      leaseEpoch: claim.leaseEpoch,
      status: 'SUCCEEDED',
      dispatchState: 'RESPONSE_RECEIVED',
      result,
    });
    return { runId: t.runId, outcome: 'SUCCEEDED' };
  }
  await api(`/job-attempts/${claim.attemptId}/results`, {
    leaseToken: claim.leaseToken,
    leaseEpoch: claim.leaseEpoch,
    status: 'FAILED',
    errorCode: 'SKILL_RUN_FAILED',
    result: { exitCode: run.code, stderrTail: run.stderr.slice(-500) },
  });
  return { runId: t.runId, outcome: 'FAILED', exitCode: run.code };
}

async function executeClaim(claim) {
  const lease = { leaseToken: claim.leaseToken, leaseEpoch: claim.leaseEpoch };
  let leaseError = null;
  let heartbeating = false;
  const interval = Math.max(100, Math.floor((claim.leaseUntil - Date.now()) / 3));
  const timer = setInterval(async () => {
    if (heartbeating || leaseError) return;
    heartbeating = true;
    try { await api(`/job-attempts/${claim.attemptId}/heartbeats`, lease); }
    catch (error) { leaseError = error; }
    finally { heartbeating = false; }
  }, interval);
  try {
    if (claim.purpose === 'ANALYZE_SKILL') return await executeAnalysisClaim(claim);
    await api(`/job-attempts/${claim.attemptId}/dispatch-start`, lease);
    if (claim.purpose === 'DISCOVER_RELATIONS' || claim.purpose === 'READ_SOURCE') {
      try {
        const body=claim.purpose==='READ_SOURCE'
          ? {...lease,skillPackageDigest:await packageDigest(resolve(here,'../../docs/04-skills',registry[claim.target.skill]?.name??'INVALID_SKILL'))}:lease;
        const adopted=await api(`/job-attempts/${claim.attemptId}/${claim.purpose==='READ_SOURCE'?'input-preparation':'source-discovery'}`,body);
        return {jobId:claim.jobId,purpose:claim.purpose,outcome:adopted.jobStatus};
      }catch(error){
        const adopted=await api(`/job-attempts/${claim.attemptId}/results`,{...lease,status:'FAILED',errorCode:'SOURCE_PREPARATION_FAILED',result:{issues:[error.message]}});
        return {jobId:claim.jobId,purpose:claim.purpose,outcome:adopted.jobStatus};
      }
    }
    if (claim.purpose === 'TRIAL_CONFIG') {
      const adopted = await api(`/job-attempts/${claim.attemptId}/configuration-trial`, lease);
      return {jobId:claim.jobId,purpose:claim.purpose,outcome:adopted.jobStatus};
    }
    let response;
    try {
      const result = claim.purpose === 'PARSE_MATERIAL'
        ? await parseMaterialBytes(await fetchMaterialBytes(WORKER, TOKEN, claim), claim.target)
        : await executeExternal(claim.target, process.env, async id=>{
          const r=await fetch(`${WORKER}/api/admin/charging/material-versions/${encodeURIComponent(id)}/content`,{headers:{authorization:`Bearer ${TOKEN}`}});
          if(!r.ok)throw new Error('上传材料读取失败');
          return new Uint8Array(await r.arrayBuffer());
        });
      response = { ...lease, status: 'SUCCEEDED', dispatchState: 'RESPONSE_RECEIVED', result };
    } catch (error) {
      response = claim.purpose === 'PARSE_MATERIAL'
        ? { ...lease, status: 'FAILED', dispatchState: 'RESPONSE_RECEIVED', errorCode: 'MATERIAL_PARSE_FAILED', result: { issues: [error.message] } }
        : { ...lease, status: 'UNKNOWN', errorCode: 'EXTERNAL_RESULT_UNKNOWN', result: { errorCode: error.code ?? 'NETWORK_ERROR' } };
    }
    if (leaseError) throw leaseError;
    const adopted = await api(`/job-attempts/${claim.attemptId}/results`, response);
    return { jobId: claim.jobId, purpose: claim.purpose, outcome: adopted.jobStatus };
  } finally { clearInterval(timer); }
}

async function pump() {
  const allowed = ['DISCOVER_RELATIONS', 'READ_SOURCE', 'TRIAL_CONFIG', 'PARSE_MATERIAL', 'WRITE_EXTERNAL', 'QUERY_EXTERNAL', 'ANALYZE_SKILL'];
  const purposes = (process.env.JOB_PURPOSES?.split(',') ?? allowed).filter(p => p !== 'ANALYZE_SKILL' || process.env.ANALYSIS_ENABLED !== 'false');
  if (!purposes.length || purposes.some(p => !allowed.includes(p))) throw new Error('Invalid JOB_PURPOSES');
  const { claims } = await api('/job-claims', { purposes, limit: 1 });
  const outcomes = [];
  for (const claim of claims) {
    outcomes.push(await executeClaim(claim));
  }
  return outcomes;
}

const once = process.argv.includes('--once');
const loop = process.argv.includes('--loop');
const drain = process.argv.includes('--drain');

if (loop) {
  console.log(`task-runner loop: worker=${WORKER} interval=${LOOP_INTERVAL_MS}ms`);
  let stopping = false;
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { stopping = true; });
  // Await each pass: a long model call must not overlap with a second pump.
  while (!stopping) {
    try { const result = await pump(); if (result.length) { console.log(JSON.stringify(result)); continue; } }
    catch (error) { console.error('pump error:', error.message); }
    if (!stopping) await new Promise(resolve => setTimeout(resolve, LOOP_INTERVAL_MS));
  }
} else if (drain) {
  let count = 0;
  for (;;) {
    const outcomes = await pump();
    if (!outcomes.length) break;
    count += outcomes.length;
    if (outcomes.some(o => o.outcome !== 'SUCCEEDED')) console.log(JSON.stringify(outcomes));
    if (count % 100 === 0) console.log(JSON.stringify({ processed: count }));
  }
  console.log(JSON.stringify({ processed: count, queueEmpty: true }));
} else {
  const outcomes = await pump();
  console.log(JSON.stringify({ claims: outcomes.length, outcomes }));
  if (!once) process.exitCode = 0;
}
