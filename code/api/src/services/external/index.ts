import { aiPost, externalGet, externalPost, type ExternalEnv } from './client.ts';
import type {
  AiRunData,
  AiRunRequest,
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
} from './types.ts';

export * from './client.ts';
export * from './types.ts';

const q = encodeURIComponent;

export function createExternalClient(env: ExternalEnv) {
  return {
    workOrderContext: {
      getContext: (installationWorkOrderId: string) =>
        externalGet<WorkOrderContextData>(
          env,
          `/api/admin/mock/external/installation/work-orders/${q(installationWorkOrderId)}/context`
        ),
    },
    sourceMaterial: {
      getMaterial: (sourceSystem: string, sourceMaterialId: string, sourceVersion: string) =>
        externalGet<SourceMaterialData>(
          env,
          `/api/admin/mock/external/sources/${q(sourceSystem)}/materials/${q(sourceMaterialId)}?sourceVersion=${q(sourceVersion)}`
        ),
    },
    entitlements: {
      getEntitlements: (purchaseOrderId: string, installationWorkOrderId: string) =>
        externalGet<EntitlementsData>(
          env,
          `/api/admin/mock/external/purchase-orders/${q(purchaseOrderId)}/installation-entitlements?installationWorkOrderId=${q(installationWorkOrderId)}`
        ),
    },
    providerDocuments: {
      getDocuments: (sourceSystem: string, serviceProviderId: string, sourceRecordId: string) =>
        externalGet<ProviderDocumentsData>(
          env,
          `/api/admin/mock/external/sources/${q(sourceSystem)}/service-providers/${q(serviceProviderId)}/records/${q(sourceRecordId)}/documents`
        ),
    },
    installationSubmit: {
      submit: (installationWorkOrderId: string, body: InstallationSubmissionRequest) =>
        externalPost<InstallationSubmissionData>(
          env,
          `/api/admin/mock/external/installation/work-orders/${q(installationWorkOrderId)}/installation-detail-submissions`,
          body
        ),
      getSubmission: (installationWorkOrderId: string, submissionId: string) =>
        externalGet<InstallationSubmissionData>(
          env,
          `/api/admin/mock/external/installation/work-orders/${q(installationWorkOrderId)}/installation-detail-submissions/${q(submissionId)}`
        ),
    },
    reviewSync: {
      postAction: (installationWorkOrderId: string, body: ReviewActionRequest) =>
        externalPost<ReviewActionData>(
          env,
          `/api/admin/mock/external/installation/work-orders/${q(installationWorkOrderId)}/review-actions`,
          body
        ),
      getAction: (installationWorkOrderId: string, operationId: string) =>
        externalGet<ReviewActionData>(
          env,
          `/api/admin/mock/external/installation/work-orders/${q(installationWorkOrderId)}/review-actions/${q(operationId)}`
        ),
    },
    jdBill: {
      getBill: (jdBillId: string, installationWorkOrderId: string) =>
        externalGet<JdBillData>(
          env,
          `/api/admin/mock/external/jd-bills/${q(jdBillId)}?installationWorkOrderId=${q(installationWorkOrderId)}`
        ),
    },
    providerReceivable: {
      getReceivable: (
        sourceSystem: string,
        serviceProviderId: string,
        providerReceivableId: string,
        installationWorkOrderId: string
      ) =>
        externalGet<ProviderReceivableData>(
          env,
          `/api/admin/mock/external/sources/${q(sourceSystem)}/service-providers/${q(serviceProviderId)}/receivables/${q(providerReceivableId)}?installationWorkOrderId=${q(installationWorkOrderId)}`
        ),
    },
    billingTerms: {
      getFeeEvidence: (installationWorkOrderId: string, serviceProviderId: string) =>
        externalGet<FeeEvidenceData>(
          env,
          `/api/admin/mock/external/installation-work-orders/${q(installationWorkOrderId)}/fee-evidence?serviceProviderId=${q(serviceProviderId)}`
        ),
    },
    changes: {
      getChanges: (feedId: string, cursor: string, pageSize?: number) =>
        externalGet<ChangesData>(
          env,
          `/api/admin/mock/external/change-feeds/${q(feedId)}/changes?cursor=${q(cursor)}${pageSize ? `&pageSize=${pageSize}` : ''}`
        ),
    },
    identityContext: {
      getCurrentContext: () =>
        externalGet<IdentityContextData>(env, `/api/admin/mock/external/identity/current-context`),
    },
    ai: {
      postRun: (body: AiRunRequest) => aiPost<AiRunData>(env, `/api/admin/mock/external/ai-runs`, body),
    },
  };
}

export type ExternalClient = ReturnType<typeof createExternalClient>;
