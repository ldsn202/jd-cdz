import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { ERR, fail, newRequestId, ok } from '../lib/contract';
import {
  loadLatestParsing,
  loadMaterialVersion,
  materialVisible,
} from '../services/material-read';

const materials = new Hono<{ Bindings: Bindings; Variables: Variables }>();

materials.get('/material-versions/:materialVersionId', async (c) => {
  const requestId = newRequestId();
  const identity = c.get('identity');
  const id = c.req.param('materialVersionId');
  const row = await loadMaterialVersion(c.env.DB, id);
  if (!row || !(await materialVisible(c.env.DB, identity, row))) {
    return fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', requestId);
  }

  let parsing: unknown = null;
  if (row.read_state === 'VERIFIED') {
    const p = await loadLatestParsing(c.env.DB, row.id);
    if (p) {
      parsing = {
        parseId: p.id,
        runId: p.run_id,
        completeness: p.completeness,
        units: JSON.parse(p.units_json),
        blocks: JSON.parse(p.blocks_json),
        issues: JSON.parse(p.issues_json),
      };
    }
  }

  return ok(
    c,
    {
      materialVersionId: row.id,
      sourceSystem: row.source_system,
      sourceMaterialId: row.source_material_source_id,
      sourceVersion: row.source_version,
      name: row.name,
      mediaType: row.media_type,
      byteLength: row.byte_length,
      sha256: row.content_sha256,
      readState: row.read_state,
      parsing,
    },
    requestId
  );
});

materials.get('/material-versions/:materialVersionId/content', async (c) => {
  const requestId = newRequestId();
  const identity = c.get('identity');
  const id = c.req.param('materialVersionId');
  const row = await loadMaterialVersion(c.env.DB, id);
  if (!row || !(await materialVisible(c.env.DB, identity, row))) {
    return fail(c, 404, ERR.NOT_FOUND, '资源不存在或不可见', requestId);
  }
  if (row.read_state !== 'VERIFIED' || !row.content_locator) {
    return fail(c, 422, ERR.UNPROCESSABLE, '原文件正文未取得，不可提供内容', requestId);
  }
  const object = await c.env.FILES.get(row.content_locator);
  if (!object) {
    return fail(c, 422, ERR.UNPROCESSABLE, '原文件正文未取得，不可提供内容', requestId);
  }
  const safeName = (row.name ?? 'file').replace(/[^\w.一-龥-]/g, '_');
  return new Response(object.body, {
    status: 200,
    headers: {
      'Content-Type': row.media_type ?? 'application/octet-stream',
      'Content-Length': String(row.byte_length ?? object.size),
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `${c.req.query('preview')==='true'?'inline':'attachment'}; filename="${encodeURIComponent(safeName)}"`,
    },
  });
});

export default materials;
