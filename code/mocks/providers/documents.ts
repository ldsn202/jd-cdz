import type { DatabaseSync } from 'node:sqlite';
import { hasAction, type Account } from '../identity/sessions.ts';
import { ROLE_ACTIONS } from '../identity/roles.ts';

export type RouteResult = { http: number; body: { code: number; msg: string; data: unknown } };

type Auth = { account: Account; grants: { grantId: string; scopeProviderIds: string[] }[] };

function recs(db: DatabaseSync, kind: string) {
  return (db.prepare("SELECT record_id, source_version, source_updated_at, payload_json FROM source_record WHERE kind = ?").all(kind) as any[]).map((r) => ({
    id: r.record_id,
    version: r.source_version,
    updatedAt: r.source_updated_at,
    payload: JSON.parse(r.payload_json),
  }));
}

export function getProviderDocuments(providerDocsDb: DatabaseSync, fileServiceDb: DatabaseSync, auth: Auth, sourceSystem: string, serviceProviderId: string, sourceRecordId: string): RouteResult {
  if (sourceSystem !== 'provider-docs') {
    return { http: 400, body: { code: 40001, msg: `来源未配置：${sourceSystem}`, data: null } };
  }
  if (!hasAction(auth, 'READ_SOURCE_MATERIAL', serviceProviderId, ROLE_ACTIONS)) {
    return { http: 403, body: { code: 40301, msg: '当前身份无权读取该服务商资料', data: null } };
  }
  const record = recs(providerDocsDb, 'provider_record').find((r) => r.id === sourceRecordId);
  if (!record || record.payload.serviceProviderId !== serviceProviderId) {
    return { http: 404, body: { code: 40401, msg: '授权范围内资料记录不存在', data: null } };
  }

  const p = record.payload;
  const materials: object[] = [];
  if (p.fileMaterialId) {
    const meta = recs(fileServiceDb, 'file_meta').find((f) => f.payload.fileId === p.fileMaterialId);
    if (meta) {
      materials.push({
        sourceSystem: 'file-service',
        sourceMaterialId: meta.payload.fileId,
        sourceVersion: meta.payload.sourceVersion,
        name: meta.payload.name,
        mediaType: meta.payload.mediaType,
        sourceUpdatedAt: meta.updatedAt,
      });
    }
  }

  const spec = recs(providerDocsDb, 'format_spec').find((f) => f.payload.formatId === p.sourceFormatId) ?? null;
  let formatStatus: string;
  let formatDefinition: unknown = null;
  const missingParts: string[] = [];
  if(!['INSTALLATION','RECONCILIATION'].includes(p.configurationPurpose)||typeof p.businessScopeKey!=='string'||!p.businessScopeKey.trim())missingParts.push('CONFIGURATION_SCOPE');
  if (!spec) {
    formatStatus = 'NOT_PROVIDED';
  } else {
    formatStatus = 'PROVIDED';
    formatDefinition = {
      formatId: spec.payload.formatId,
      sourceVersion: spec.payload.sourceVersion,
      notes: spec.payload.notes ?? null,
      fields: spec.payload.fields,
      sourceMaterials: [],
    };
    if (spec.payload.sourceVersion !== p.sourceFormatVersion) {
      missingParts.push('FORMAT_ASSOCIATION');
    }
  }

  return {
    http: 200,
    body: {
      code: 0,
      msg: 'success',
      data: {
        retrievedAt: new Date().toISOString(),
        sourceRecord: {
          sourceSystem: 'provider-docs',
          serviceProviderId,
          sourceRecordId,
          sourceVersion: record.version,
          sourceUpdatedAt: record.updatedAt,
          purpose: p.purpose ?? 'UNKNOWN',
          configurationPurpose: p.configurationPurpose ?? null,
          businessScopeKey: p.businessScopeKey ?? null,
          installationWorkOrderId: p.installationWorkOrderId ?? null,
          sourceFormatId: p.sourceFormatId ?? null,
          sourceFormatVersion: p.sourceFormatVersion ?? null,
        },
        contentComplete: true,
        rawJson: p.rawJson ?? null,
        sourceMaterials: materials,
        formatStatus,
        formatDefinition,
        completeness: missingParts.length === 0 ? 'COMPLETE' : 'INCOMPLETE',
        missingParts,
      },
    },
  };
}
