import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { ERR, fail, newRequestId, ok } from './lib/contract';
import { resolveIdentity, type ResolvedIdentity } from './services/identity';
import { LOCAL_ACCOUNT_COOKIE, localAccountSwitching } from './services/local-accounts';
import sessionRoutes from './routes/session';
import workItemRoutes from './routes/work-items';
import workOrderRoutes from './routes/work-orders';
import materialRoutes from './routes/material-versions';
import installationRoutes from './routes/installation';
import uploadRoutes from './routes/uploads';
import reviewRoutes from './routes/review';
import reconciliationRoutes from './routes/reconciliation';
import configurationRoutes from './routes/configuration';
import coordinationRoutes from './routes/coordination';
import internalExecutionRoutes from './routes/internal-execution';
import sourceImportRoutes from './routes/source-import';
import businessMaterialRoutes from './routes/business-materials';
import demoCaseRoutes from './routes/demo-cases';

export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  FILES: R2Bucket;
  EXTERNAL_MODE: string;
  AI_MODE: string;
  ANALYSIS_RUNTIME_ERROR?: string;
  MOCK_BASE_URL?: string;
  DEV_IDENTITY_TOKENS?: string;
  LOCAL_ACCOUNT_SWITCHING?: string;
  LOCAL_UI_ORIGIN?: string;
  TASK_LEASE_MS?: string;
  TASK_MAX_ATTEMPTS?: string;
  TASK_RETRY_BACKOFF_MS?: string;
};

export type Variables = {
  identity: ResolvedIdentity;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.get('/api/health', (c) => {
  return ok(
    c,
    {
      ok: true,
      service: 'jd-charging-api',
      externalMode: c.env.EXTERNAL_MODE ?? 'mock',
      aiMode: c.env.AI_MODE ?? 'mock',
    },
    newRequestId()
  );
});

app.use('/api/admin/charging/*', async (c, next) => {
  const explicit = c.req.header('Authorization');
  const cookie = localAccountSwitching(c.env, c.req.url) ? getCookie(c, LOCAL_ACCOUNT_COOKIE) : undefined;
  const identity = await resolveIdentity(c.env.DB, c.env, explicit ?? (cookie ? 'Bearer ' + cookie : undefined));
  if (!identity || (!explicit && cookie && identity.subjectType !== 'HUMAN')) {
    return fail(c, 401, ERR.UNAUTHORIZED, '当前凭据无效', newRequestId());
  }
  c.set('identity', identity);
  await next();
});

app.route('/api/admin/charging', sessionRoutes);
app.route('/api/admin/charging', workItemRoutes);
app.route('/api/admin/charging', businessMaterialRoutes);
app.route('/api/admin/charging', demoCaseRoutes);
app.route('/api/admin/charging', workOrderRoutes);
app.route('/api/admin/charging', materialRoutes);
app.route('/api/admin/charging', installationRoutes);
app.route('/api/admin/charging', uploadRoutes);
app.route('/api/admin/charging', reviewRoutes);
app.route('/api/admin/charging', reconciliationRoutes);
app.route('/api/admin/charging', configurationRoutes);
app.route('/api/admin/charging', coordinationRoutes);
app.route('/api/admin/charging', internalExecutionRoutes);
app.route('/api/admin/charging', sourceImportRoutes);

app.notFound((c) => fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', newRequestId()));

app.onError((err, c) => {
  console.error('unhandled', err.message);
  return fail(c, 500, ERR.INTERNAL, '本系统内部失败', newRequestId());
});

export default app;
