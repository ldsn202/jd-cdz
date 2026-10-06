import { detailedMockCall, ExternalError, type ExternalEnv } from '../../services/external/client.ts';
import type {
  ChangesData,
  EntitlementsData,
  FeeEvidenceData,
  IdentityContextData,
  InstallationSubmissionData,
  InstallationSubmissionRequest,
  JdBillData,
  ProviderDocumentsData,
  ProviderReceivableData,
  ReviewActionData,
  ReviewActionRequest,
  SourceMaterialData,
  WorkOrderContextData,
} from '../../services/external/types.ts';
import type { AdapterTrace, Traced } from './trace.ts';

const q = encodeURIComponent;

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function traced<T>(env: ExternalEnv, path: string, enrich: (data: T) => Partial<AdapterTrace>, init?: RequestInit): Promise<Traced<T>> {
  const r = await detailedMockCall<T>(env, path, init);
  return {
    data: r.data,
    trace: {
      mode: (env.EXTERNAL_MODE ?? 'mock') === 'mock' ? 'mock' : 'real',
      path,
      requestId: r.requestId,
      retrievedAt: new Date().toISOString(),
      ...enrich(r.data),
    },
  };
}

export function createTracedExternalClient(env: ExternalEnv) {
  return {
    identityContext: {
      getCurrentContext: () =>
        traced<IdentityContextData>(env, `/api/admin/mock/external/identity/current-context`, (d) => ({
          sourceSystem: d.identitySource,
          recordId: d.subjectId,
          sourceVersion: d.authorizationVersion,
        })),
    },
    workOrderContext: {
      getContext: (installationWorkOrderId: string) =>
        traced<WorkOrderContextData>(env, `/api/admin/mock/external/installation/work-orders/${q(installationWorkOrderId)}/context`, (d) => ({
          sourceSystem: d.installationWorkOrder.sourceSystem,
          recordId: d.installationWorkOrder.installationWorkOrderId,
          sourceVersion: d.installationWorkOrder.sourceVersion,
        })),
    },
    entitlements: {
      getEntitlements: (purchaseOrderId: string, installationWorkOrderId: string) =>
        traced<EntitlementsData>(env, `/api/admin/mock/external/purchase-orders/${q(purchaseOrderId)}/installation-entitlements?installationWorkOrderId=${q(installationWorkOrderId)}`, (d) => ({
          sourceSystem: d.purchaseOrder?.sourceSystem,
          recordId: d.purchaseOrder?.purchaseOrderId,
          sourceVersion: d.purchaseOrder?.sourceVersion ?? null,
        })),
    },
    providerDocuments: {
      getDocuments: (sourceSystem: string, serviceProviderId: string, sourceRecordId: string) =>
        traced<ProviderDocumentsData>(env, `/api/admin/mock/external/sources/${q(sourceSystem)}/service-providers/${q(serviceProviderId)}/records/${q(sourceRecordId)}/documents`, (d) => ({
          sourceSystem: d.sourceRecord.sourceSystem,
          recordId: d.sourceRecord.sourceRecordId,
          sourceVersion: d.sourceRecord.sourceVersion,
        })),
    },
    sourceMaterial: {
      getMaterial: async (sourceSystem: string, sourceMaterialId: string, sourceVersion: string): Promise<Traced<SourceMaterialData>> => {
        const path = `/api/admin/mock/external/sources/${q(sourceSystem)}/materials/${q(sourceMaterialId)}?sourceVersion=${q(sourceVersion)}`;
        const r = await detailedMockCall<SourceMaterialData>(env, path);
        const bytes = base64ToBytes(r.data.contentBase64);
        const digest = await sha256Hex(bytes);
        if (bytes.length !== r.data.byteLength || digest !== r.data.contentSha256) {
          throw new ExternalError(502, 50201, '文件字节数或摘要与返回声明不一致，拒绝消费');
        }
        return {
          data: r.data,
          trace: {
            mode: (env.EXTERNAL_MODE ?? 'mock') === 'mock' ? 'mock' : 'real',
            path,
            requestId: r.requestId,
            retrievedAt: new Date().toISOString(),
            sourceSystem: r.data.sourceSystem,
            recordId: r.data.sourceMaterialId,
            sourceVersion: r.data.sourceVersion,
            contentSha256: digest,
            byteLength: bytes.length,
            digestVerified: true,
          },
        };
      },
    },
    jdBill: {
      getBill: (jdBillId: string, installationWorkOrderId: string) =>
        traced<JdBillData>(env, `/api/admin/mock/external/jd-bills/${q(jdBillId)}?installationWorkOrderId=${q(installationWorkOrderId)}`, (d) => ({
          sourceSystem: d.sourceSystem,
          recordId: d.jdBillId,
          sourceVersion: d.sourceVersion,
        })),
    },
    providerReceivable: {
      getReceivable: (sourceSystem: string, serviceProviderId: string, providerReceivableId: string, installationWorkOrderId: string) =>
        traced<ProviderReceivableData>(env, `/api/admin/mock/external/sources/${q(sourceSystem)}/service-providers/${q(serviceProviderId)}/receivables/${q(providerReceivableId)}?installationWorkOrderId=${q(installationWorkOrderId)}`, (d) => ({
          sourceSystem: d.sourceSystem,
          recordId: d.providerReceivableId,
          sourceVersion: d.sourceVersion,
        })),
    },
    billingTerms: {
      getFeeEvidence: (installationWorkOrderId: string, serviceProviderId: string) =>
        traced<FeeEvidenceData>(env, `/api/admin/mock/external/installation-work-orders/${q(installationWorkOrderId)}/fee-evidence?serviceProviderId=${q(serviceProviderId)}`, () => ({
          recordId: installationWorkOrderId,
        })),
    },
    installationSubmit: {
      submit: (installationWorkOrderId: string, body: InstallationSubmissionRequest) =>
        traced<InstallationSubmissionData>(env, `/api/admin/mock/external/installation/work-orders/${q(installationWorkOrderId)}/installation-detail-submissions`, (d) => ({
          recordId: d.submissionId,
          sourceVersion: d.installationDetail?.sourceVersion ?? null,
        }), { method: 'POST', body: JSON.stringify(body) }),
      getSubmission: (installationWorkOrderId: string, submissionId: string) =>
        traced<InstallationSubmissionData>(env, `/api/admin/mock/external/installation/work-orders/${q(installationWorkOrderId)}/installation-detail-submissions/${q(submissionId)}`, (d) => ({
          recordId: d.submissionId,
          sourceVersion: d.installationDetail?.sourceVersion ?? null,
        })),
    },
    reviewSync: {
      postAction: (installationWorkOrderId: string, body: ReviewActionRequest) =>
        traced<ReviewActionData>(env, `/api/admin/mock/external/installation/work-orders/${q(installationWorkOrderId)}/review-actions`, (d) => ({
          recordId: d.operationId,
          sourceVersion: d.sourceRecord?.sourceVersion ?? null,
        }), { method: 'POST', body: JSON.stringify(body) }),
      getAction: (installationWorkOrderId: string, operationId: string) =>
        traced<ReviewActionData>(env, `/api/admin/mock/external/installation/work-orders/${q(installationWorkOrderId)}/review-actions/${q(operationId)}`, (d) => ({
          recordId: d.operationId,
          sourceVersion: d.sourceRecord?.sourceVersion ?? null,
        })),
    },
    changes: {
      getChanges: (feedId: string, cursor: string, pageSize?: number) =>
        traced<ChangesData>(env, `/api/admin/mock/external/change-feeds/${q(feedId)}/changes?cursor=${q(cursor)}${pageSize ? `&pageSize=${pageSize}` : ''}`, (d) => ({
          sourceSystem: d.sourceSystem,
          recordId: d.feedId,
        })),
    },
  };
}

export type TracedExternalClient = ReturnType<typeof createTracedExternalClient>;
