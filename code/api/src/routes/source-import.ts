import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { fail, newRequestId, ok } from '../lib/contract';
import { ServiceError } from '../services/change-batch';
import { ExternalError } from '../services/external';
import { sourceImportScope, startSourceImport, importSourcePage } from '../services/source-import';
import {initializeSourceMonitor,pollSourceMonitor} from '../services/source-monitor';
import {syncProviderDirectory} from '../services/provider-directory';
const routes = new Hono<{Bindings:Bindings;Variables:Variables}>();
function failure(c: Parameters<typeof fail>[0], requestId:string, e:unknown) {
  if (e instanceof ServiceError || e instanceof ExternalError) return fail(c,e.httpStatus,e.code,e.message,requestId);
  if (e instanceof SyntaxError) return fail(c,400,40001,'请求体必须为合法 JSON',requestId);
  throw e;
}
routes.get('/internal/source-import/scope',async c=>{
  const id=newRequestId();
  try {return ok(c,await sourceImportScope(c.env,c.get('identity')),id);} catch(e){return failure(c,id,e);}
});
routes.post('/internal/source-import/providers',async c=>{
  const id=newRequestId();
  try {return ok(c,await syncProviderDirectory(c.env.DB,c.env,c.get('identity')),id);} catch(e){return failure(c,id,e);}
});
routes.post('/internal/source-import/feeds',async c=>{
  const id=newRequestId();
  try {return ok(c,await startSourceImport(c.env,c.get('identity'),await c.req.json()),id);} catch(e){return failure(c,id,e);}
});
routes.post('/internal/source-import/pages',async c=>{
  const id=newRequestId();
  try {return ok(c,await importSourcePage(c.env.DB,c.env,c.get('identity'),await c.req.json()),id);} catch(e){return failure(c,id,e);}
});
routes.post('/internal/source-monitor/initialize',async c=>{
 const id=newRequestId();try{const body=await c.req.json();return ok(c,await initializeSourceMonitor(c.env.DB,c.env,c.get('identity'),body.serviceProviderId,body.sourceSystem),id);}catch(e){return failure(c,id,e);}
});
routes.post('/internal/source-monitor/poll',async c=>{
 const id=newRequestId();try{const body=await c.req.json();return ok(c,await pollSourceMonitor(c.env.DB,c.env,c.get('identity'),body.feedId),id);}catch(e){return failure(c,id,e);}
});
export default routes;
