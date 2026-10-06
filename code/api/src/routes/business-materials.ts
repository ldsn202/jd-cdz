import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { fail, newRequestId, ok } from '../lib/contract';
import { ServiceError } from '../services/change-batch';
import { hasAction } from '../services/permission-guard';
import { loadWorkItem } from '../services/work-item-query';
import { collectAnalysisSources, type AnalysisItem } from '../services/analysis-sources';
import { createExternalClient, ExternalError } from '../services/external';
import { ALLOWED_MEDIA_TYPES, MAX_UPLOAD_BYTES } from '../services/upload-store';
import { readConfigurationUpload } from '../services/uploaded-configuration';
import {readMaterialTexts,canReviewMaterialText,confirmMaterialText} from '../services/material-text-review';

const routes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
routes.get('/work-items/:workItemId/material-texts',async c=>{
 const requestId=newRequestId(),row=await loadWorkItem(c.env.DB,c.get('identity'),c.req.param('workItemId'));
 if(!row||!hasAction(c.get('identity'),'READ_SOURCE_MATERIAL','SERVICE_PROVIDER',row.service_provider_id))return fail(c,404,40404,'资料不可见',requestId);
 return ok(c,{list:await readMaterialTexts(c.env.DB,row.id),canConfirm:canReviewMaterialText(c.get('identity'),row)},requestId);
});
routes.post('/work-items/:workItemId/material-text-confirmations',async c=>{
 const requestId=newRequestId(),row=await loadWorkItem(c.env.DB,c.get('identity'),c.req.param('workItemId'));
 if(!row)return fail(c,404,40404,'事项不可见',requestId);
 try{return ok(c,await confirmMaterialText(c.env.DB,c.get('identity'),row,await c.req.json()),requestId);}
 catch(e){if(e instanceof ServiceError)return fail(c,e.httpStatus,e.code,e.message,requestId);throw e;}
});
const skills: Record<string, string> = { CONFIGURATION: 'INTEGRATION_CONFIGURATION', INSTALLATION_PREPARATION: 'INSTALLATION_EXTRACTION', INSTALLATION_REVIEW: 'INSTALLATION_EVIDENCE', RECONCILIATION: 'RECONCILIATION_EXPLANATION', COORDINATION: 'INSTALLATION_EVIDENCE' };

async function readableItem(db: D1Database, identity: Variables['identity'], id: string) {
  const row = await loadWorkItem(db, identity, id);
  if (!row) throw new ServiceError(404, 40404, '资源不存在或不可见');
  if (!hasAction(identity, 'READ_SOURCE_MATERIAL', 'SERVICE_PROVIDER', row.service_provider_id)
    || (row.installation_work_order_id && !hasAction(identity, 'READ_WORK_ORDER', 'SERVICE_PROVIDER', row.service_provider_id))
    || (row.item_kind === 'RECONCILIATION' && !hasAction(identity, 'READ_BILLING_RECORD', 'SERVICE_PROVIDER', row.service_provider_id))) {
    throw new ServiceError(403, 40301, '无该事项的业务资料读取权限');
  }
  return (await db.prepare(`SELECT w.*,wo.source_id wo_source_id,wo.source_system wo_source_system FROM work_item w
    LEFT JOIN installation_work_order wo ON wo.id=w.installation_work_order_id WHERE w.id=?`).bind(id).first<AnalysisItem>())!;
}

// Reading source facts does not prepare inputs, parse files, or enqueue analysis.
routes.get('/work-items/:workItemId/business-materials', async c => {
  const requestId = newRequestId();
  try {
    const item = await readableItem(c.env.DB, c.get('identity'), c.req.param('workItemId'));
    const uploads = await c.env.DB.prepare(`SELECT v.id materialVersionId,v.name,v.media_type mediaType,v.byte_length byteLength,v.source_version sourceVersion,
      j.status parsingStatus,v.gmt_create uploadedAt FROM background_job j
      JOIN source_material_version v ON v.id=json_extract(j.target_json,'$.materialVersionId')
      WHERE j.work_item_id=? AND j.service_provider_id=? AND j.purpose='PARSE_MATERIAL'
      AND json_extract(j.target_json,'$.uploadId') IS NOT NULL ORDER BY v.gmt_create DESC,v.id`)
      .bind(item.id, item.service_provider_id).all();
    try {
      const source = await collectAnalysisSources(c.env.DB, c.env, item, skills[item.item_kind]);
      const mappingUpload = await readConfigurationUpload(c.env.DB, item, source.records);
      return ok(c, { records: source.records, sourceMaterials: source.materials, uploads: uploads.results, mappingUpload, issues: source.issues, sourceError: null, retrievedAt: new Date().toISOString() }, requestId);
    } catch (error) {
      if (!(error instanceof ServiceError || error instanceof ExternalError)) throw error;
      return ok(c, { records: [], sourceMaterials: [], uploads: uploads.results, issues: [], sourceError: error.message, retrievedAt: new Date().toISOString() }, requestId);
    }
  } catch (error) {
    if (error instanceof ServiceError) return fail(c, error.httpStatus, error.code, error.message, requestId);
    throw error;
  }
});

routes.get('/work-items/:workItemId/business-materials/content', async c => {
  const requestId = newRequestId();
  try {
    const item = await readableItem(c.env.DB, c.get('identity'), c.req.param('workItemId'));
    const source = await collectAnalysisSources(c.env.DB, c.env, item, skills[item.item_kind]);
    const ref = source.materials.find(m => m.sourceSystem === c.req.query('sourceSystem') && m.sourceMaterialId === c.req.query('sourceMaterialId') && m.sourceVersion === c.req.query('sourceVersion'));
    if (!ref) throw new ServiceError(404, 40404, '材料不在本事项的可见范围');
    const file = await createExternalClient(c.env).sourceMaterial.getMaterial(ref.sourceSystem, ref.sourceMaterialId, ref.sourceVersion);
    if (file.sourceSystem !== ref.sourceSystem || file.sourceMaterialId !== ref.sourceMaterialId || file.sourceVersion !== ref.sourceVersion
      || !(ALLOWED_MEDIA_TYPES as readonly string[]).includes(file.mediaType)
      || !Number.isSafeInteger(file.byteLength) || file.byteLength <= 0 || file.byteLength > MAX_UPLOAD_BYTES
      || typeof file.contentBase64 !== 'string' || file.contentBase64.length > Math.ceil(MAX_UPLOAD_BYTES / 3) * 4) {
      throw new ServiceError(502, 50201, '来源文件身份、类型或大小不符合约定');
    }
    let bytes: Uint8Array;
    try { bytes = Uint8Array.from(atob(file.contentBase64), ch => ch.charCodeAt(0)); }
    catch { throw new ServiceError(502, 50201, '来源文件编码无效'); }
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
    if (bytes.byteLength !== file.byteLength || digest !== file.contentSha256) throw new ServiceError(502, 50201, '来源文件大小或摘要不一致');
    const name = encodeURIComponent(file.name || ref.sourceMaterialId).replace(/'/g, '%27');
    return new Response(bytes, { headers: { 'Content-Type': file.mediaType, 'Content-Length': String(bytes.byteLength), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `attachment; filename*=UTF-8''${name}` } });
  } catch (error) {
    if (error instanceof ServiceError || error instanceof ExternalError) return fail(c, error.httpStatus, error.code, error.message, requestId);
    throw error;
  }
});

export default routes;
