import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { ERR, fail, newRequestId, ok } from '../lib/contract';
import { receiveChangeBatch, ServiceError, type ChangeBatchBody } from '../services/change-batch';
import {
  claimJobs,
  executeAttemptConfigurationTrial,
  executeAttemptSourceDiscovery,
  executeAttemptInputPreparation,
  dispatchConfigFromEnv,
  dispatchStart,
  heartbeat,
  reportResult,
  readAttemptMaterial,
} from '../services/job-dispatch';
import { getAgentRun, registerAgentRun, type AgentRunBody } from '../services/agent-run';

const internal = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function handle(c: Parameters<typeof fail>[0], requestId: string, e: unknown) {
  if (e instanceof ServiceError) return fail(c, e.httpStatus, e.code, e.message, requestId);
  throw e;
}

internal.post('/internal/change-batches', async (c) => {
  const requestId = newRequestId();
  try {
    const body = (await c.req.json()) as ChangeBatchBody;
    const result = await receiveChangeBatch(c.env.DB, c.get('identity'), body);
    return ok(c, result, requestId);
  } catch (e) {
    return handle(c, requestId, e);
  }
});

internal.post('/internal/job-claims', async (c) => {
  const requestId = newRequestId();
  try {
    const body = (await c.req.json()) as { purposes: string[]; limit: number };
    const result = await claimJobs(c.env.DB, c.get('identity'), dispatchConfigFromEnv(c.env), body);
    return ok(c, result, requestId);
  } catch (e) {
    return handle(c, requestId, e);
  }
});

internal.post('/internal/job-attempts/:attemptId/heartbeats', async (c) => {
  const requestId = newRequestId();
  try {
    const body = (await c.req.json()) as { leaseToken?: string; leaseEpoch?: number };
    const result = await heartbeat(
      c.env.DB, c.get('identity'), dispatchConfigFromEnv(c.env), c.req.param('attemptId'), body
    );
    return ok(c, result, requestId);
  } catch (e) {
    return handle(c, requestId, e);
  }
});

internal.post('/internal/job-attempts/:attemptId/results', async (c) => {
  const requestId = newRequestId();
  try {
    const body = (await c.req.json()) as {
      leaseToken?: string; leaseEpoch?: number;
      status?: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
      dispatchState?: string; result?: unknown; errorCode?: string;
    };
    const result = await reportResult(
      c.env.DB, c.get('identity'), dispatchConfigFromEnv(c.env), c.req.param('attemptId'), body
    );
    return ok(c, result, requestId);
  } catch (e) {
    return handle(c, requestId, e);
  }
});

internal.post('/internal/job-attempts/:attemptId/dispatch-start', async (c) => {
  const requestId = newRequestId();
  try {
    const body = (await c.req.json()) as { leaseToken?: string; leaseEpoch?: number };
    const result = await dispatchStart(c.env.DB, c.get('identity'), c.req.param('attemptId'), body);
    return ok(c, result, requestId);
  } catch (e) {
    return handle(c, requestId, e);
  }
});

internal.post('/internal/agent-runs', async (c) => {
  const requestId = newRequestId();
  try {
    const body = (await c.req.json()) as AgentRunBody;
    const result = await registerAgentRun(c.env.DB, c.env, c.get('identity'), body);
    return c.json({ code: 0, msg: 'success', requestId, data: result }, 202);
  } catch (e) {
    return handle(c, requestId, e);
  }
});

internal.get('/internal/agent-runs/:runId', async (c) => {
  const requestId = newRequestId();
  try {
    const result = await getAgentRun(c.env.DB, c.get('identity'), c.req.param('runId'));
    return ok(c, result, requestId);
  } catch (e) {
    return handle(c, requestId, e);
  }
});

internal.post('/internal/job-attempts/:attemptId/material-content', async (c) => {
  const requestId = newRequestId();
  try {
    const lease = await c.req.json() as { leaseToken?: string; leaseEpoch?: number };
    const material = await readAttemptMaterial(c.env.DB, c.get('identity'), c.req.param('attemptId'), lease);
    if (!material.content_locator) throw new ServiceError(422, 42201, '原文件正文未取得');
    const object = await c.env.FILES.get(material.content_locator);
    if (!object) throw new ServiceError(422, 42201, '原文件正文未取得');
    return new Response(object.body, { headers: {
      'Content-Type': material.media_type ?? 'application/octet-stream',
      'Content-Length': String(object.size), 'Cache-Control': 'private, no-store',
      'X-Content-SHA256': material.content_sha256 ?? '',
    } });
  } catch (error) { return handle(c, requestId, error); }
});

internal.post('/internal/job-attempts/:attemptId/configuration-trial', async (c) => {
  const requestId=newRequestId();
  try {
    const lease=await c.req.json() as {leaseToken?:string;leaseEpoch?:number};
    return ok(c,await executeAttemptConfigurationTrial(c.env.DB,c.get('identity'),dispatchConfigFromEnv(c.env),c.req.param('attemptId'),lease),requestId);
  }catch(e){return handle(c,requestId,e);}
});

internal.post('/internal/job-attempts/:attemptId/source-discovery',async c=>{
 const id=newRequestId();try{return ok(c,await executeAttemptSourceDiscovery(c.env.DB,c.env,c.get('identity'),dispatchConfigFromEnv(c.env),c.req.param('attemptId'),await c.req.json()),id);}catch(e){return handle(c,id,e);}
});
internal.post('/internal/job-attempts/:attemptId/input-preparation',async c=>{
 const id=newRequestId();try{return ok(c,await executeAttemptInputPreparation(c.env.DB,c.env,c.get('identity'),dispatchConfigFromEnv(c.env),c.req.param('attemptId'),await c.req.json()),id);}catch(e){return handle(c,id,e);}
});
export default internal;
