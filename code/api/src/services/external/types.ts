// 外部契约类型：字段名逐字取自 docs/03-foundation/03-02-external-apis/ 十二份契约。

export interface Envelope<T> {
  code: number;
  msg: string;
  requestId: string;
  data: T;
}

export interface WorkOrderContextData {
  retrievedAt: string;
  completeness: 'COMPLETE' | 'INCOMPLETE';
  missingParts: string[];
  installationWorkOrder: {
    installationWorkOrderId: string;
    serviceProviderId: string;
    purchaseOrderId: string | null;
    sourceSystem: string;
    sourceVersion: string | null;
    sourceUpdatedAt: string | null;
  };
  installationPlan: {
    installationPlanId: string;
    installationWorkOrderId?: string;
    sourceSystem: string;
    sourceVersion: string;
    sourceUpdatedAt: string | null;
    items: InstallationPlanItem[];
  } | null;
  installationDetailStatus: 'NOT_SUBMITTED' | 'SUBMITTED' | 'UNKNOWN';
  installationDetail: {
    installationDetailId: string;
    installationWorkOrderId?: string;
    sourceSystem: string;
    sourceVersion: string;
    sourceUpdatedAt: string | null;
    items: InstallationDetailItem[];
  } | null;
  sourceMaterialIndexComplete: boolean;
  sourceMaterials: SourceMaterialRef[];
}

export interface InstallationPlanItem {
  installationItem: string;
  plannedQuantity: number | null;
  unit: string | null;
  materialSupplier: string | null;
  serviceScope: string | null;
}

export interface InstallationDetailItem {
  installationItem: string;
  installedQuantity: number | null;
  unit: string | null;
  materialSupplier: string | null;
  serviceScope: string | null;
}

export interface SourceMaterialRef {
  sourceSystem: string;
  sourceMaterialId: string;
  sourceVersion: string;
  name?: string | null;
  mediaType?: string | null;
  sourceUpdatedAt?: string | null;
}

export interface SourceMaterialData {
  sourceSystem: string;
  sourceMaterialId: string;
  sourceVersion: string;
  name: string;
  mediaType: string;
  sourceUpdatedAt: string | null;
  retrievedAt: string;
  byteLength: number;
  contentSha256: string;
  contentBase64: string;
}

export interface EntitlementsData {
  retrievedAt: string;
  installationWorkOrderId: string;
  workOrderSourceVersion: string | null;
  entitlementListComplete: boolean;
  completeness: 'COMPLETE' | 'INCOMPLETE';
  missingParts: string[];
  purchaseOrder: {
    purchaseOrderId: string;
    sourceSystem: string;
    sourceVersion: string | null;
    sourceUpdatedAt: string | null;
  } | null;
  entitlements: {
    installationEntitlementId: string;
    name: string;
    sourceSystem: string;
    sourceVersion: string | null;
    sourceUpdatedAt: string | null;
    coveredServiceScope: string | null;
    quantityType: 'LIMITED' | 'UNLIMITED' | 'NOT_QUANTITY_BASED' | 'UNKNOWN';
    includedQuantity: string | null;
    unit: string | null;
    validity: 'VALID' | 'INVALID' | 'UNKNOWN';
    validityBasis: string | null;
    applicability: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';
    applicabilityBasis: string | null;
  }[];
}

export interface ProviderDocumentsData {
  retrievedAt: string;
  contentComplete: boolean;
  rawJson: string | null;
  formatStatus: 'PROVIDED' | 'NOT_PROVIDED' | 'UNKNOWN';
  completeness: 'COMPLETE' | 'INCOMPLETE';
  missingParts: string[];
  sourceRecord: {
    sourceSystem: string;
    serviceProviderId: string;
    sourceRecordId: string;
    sourceVersion: string | null;
    sourceUpdatedAt: string | null;
    purpose: 'INSTALLATION' | 'CONFIGURATION' | 'UNKNOWN';
    configurationPurpose: 'INSTALLATION' | 'RECONCILIATION' | null;
    businessScopeKey: string | null;
    installationWorkOrderId: string | null;
    sourceFormatId: string | null;
    sourceFormatVersion: string | null;
  };
  sourceMaterials: SourceMaterialRef[];
  formatDefinition: {
    formatId: string;
    sourceVersion: string | null;
    notes: string | null;
    fields: { fieldKey: string; label: string; meaning: string | null; unit: string | null }[];
    sourceMaterials: SourceMaterialRef[];
  } | null;
}

export interface InstallationSubmissionRequest {
  submissionId: string;
  humanDecisionId: string;
  installationDraftId: string;
  confirmedDraftVersion: string;
  expectedWorkOrderVersion: string;
  expectedPlanVersion: string;
  expectedDetailVersion: string | null;
  items: InstallationDetailItem[];
  sourceMaterials: SourceMaterialRef[];
}

export interface InstallationSubmissionData {
  submissionId: string;
  installationWorkOrderId: string;
  submissionStatus: 'SUCCEEDED' | 'REJECTED' | 'PENDING';
  pendingReason: 'PROCESSING' | 'RESULT_UNKNOWN' | null;
  resultDescription: string | null;
  verifiedAt: string | null;
  installationDetail: {
    sourceSystem: string;
    installationDetailId: string;
    sourceVersion: string;
  } | null;
}

export interface ReviewActionRequest {
  operationId: string;
  workItemId: string;
  expectedWorkItemVersion: string;
  humanDecisionId: string;
  action: 'APPROVE' | 'REQUEST_SUPPLEMENT' | 'SUBMIT_SUPPLEMENT';
  installationDetailId: string;
  expectedDetailVersion: string;
  expectedWorkOrderVersion: string;
  expectedAnalysisVersion: string | null;
  replyToOperationId: string | null;
  comment: string;
  sourceMaterials: SourceMaterialRef[];
}

export interface ReviewActionData {
  operationId: string;
  workItemId: string;
  installationWorkOrderId: string;
  action: string;
  operationStatus: 'SUCCEEDED' | 'REJECTED' | 'PENDING';
  pendingReason: 'PROCESSING' | 'RESULT_UNKNOWN' | null;
  resultDescription: string | null;
  verifiedAt: string | null;
  sourceRecord: {
    sourceSystem: string;
    sourceRecordId: string;
    sourceVersion: string;
    workOrderSourceVersion: string | null;
  } | null;
}

export interface JdBillData {
  retrievedAt: string;
  jdBillId: string;
  installationWorkOrderId: string;
  serviceProviderId: string;
  sourceSystem: string;
  sourceVersion: string | null;
  sourceUpdatedAt: string | null;
  relatedWorkOrderIds: string[];
  currency: string | null;
  taxBasis: 'TAX_INCLUDED' | 'TAX_EXCLUDED' | 'UNKNOWN';
  sourceStatus: string | null;
  effectiveStatus: 'EFFECTIVE' | 'VOID' | 'UNKNOWN';
  reportedTotalAmount: string | null;
  targetWorkOrderAmount: string | null;
  itemsComplete: boolean;
  completeness: 'COMPLETE' | 'INCOMPLETE';
  missingParts: string[];
  items: BillItem[];
}

export interface BillItem {
  billItemId: string;
  itemName: string;
  installationWorkOrderId: string | null;
  chargeScope: string | null;
  billedQuantity: string | null;
  unit: string | null;
  unitPrice: string | null;
  amount: string | null;
}

export interface ProviderReceivableData extends Omit<JdBillData, 'jdBillId'> {
  providerReceivableId: string;
  previousSourceVersion: string | null;
  sourceRevisionNote: string | null;
}

export interface FeeEvidenceData {
  retrievedAt: string;
  installationWorkOrderId: string;
  serviceProviderId: string;
  workOrderSourceVersion: string | null;
  lookupScope: string;
  termListComplete: boolean;
  approvalListComplete: boolean;
  completeness: 'COMPLETE' | 'INCOMPLETE';
  missingParts: string[];
  terms: EvidenceRecord[];
  approvals: (EvidenceRecord & { decision: 'APPROVED' | 'REJECTED' | 'PENDING' | 'REVOKED' | 'UNKNOWN'; decidedAt: string | null })[];
}

export interface EvidenceRecord {
  sourceSystem: string;
  sourceRecordId: string;
  sourceVersion: string | null;
  sourceUpdatedAt: string | null;
  title: string;
  sourceStatus: string | null;
  scope: string | null;
  applicability: 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';
  applicabilityBasis: string | null;
  recordText: string | null;
  materialReferences: SourceMaterialRef[];
  effectiveStatus: 'EFFECTIVE' | 'VOID' | 'UNKNOWN';
}

export interface ChangesData {
  feedId: string;
  sourceSystem: string;
  serviceProviderId: string;
  discoveryMode: 'SOURCE_FEED' | 'SOURCE_SCAN' | 'AUTHORIZED_IMPORT';
  retrievedAt: string;
  sourceCheckedAt: string;
  coverageThrough: string;
  cursor: string;
  nextCursor: string;
  hasMore: boolean;
  list: {
    changeId: string;
    recordType: string;
    sourceRecordId: string;
    sourceVersion: string | null;
    changeType: 'UPSERT' | 'REMOVED';
    sourceUpdatedAt: string | null;
    relatedWorkOrderIds: string[];
    associationComplete: boolean;
  }[];
}

export interface IdentityContextData {
  identitySource: string;
  subjectId: string;
  subjectType: 'HUMAN' | 'SERVICE';
  displayName: string;
  verifiedAt: string;
  validUntil: string | null;
  authorizationVersion: string | null;
  sourceIdentities: { sourceSystem: string; sourceUserId: string }[];
  grants: {
    grantId: string;
    businessRole: string | null;
    actions: string[];
    scope: {
      scopeType: 'SERVICE_PROVIDER' | 'INSTALLATION_WORK_ORDER' | 'SOURCE_RECORD' | 'CHANGE_FEED';
      sourceSystem: string | null;
      recordType: string | null;
      resourceIds: string[];
    };
  }[];
}

export interface AiRunRequest {
  runId: string;
  operation: 'PARSE_MATERIAL' | 'ANALYZE_SKILL';
  profileId: string;
  parseInput: {
    sourceSystem: string;
    sourceMaterialId: string;
    sourceVersion: string;
    mediaType: string;
    byteLength: number;
    contentSha256: string;
    contentBase64: string;
  } | null;
  analysisInput: {
    skill: 'INTEGRATION_CONFIGURATION' | 'INSTALLATION_EXTRACTION' | 'INSTALLATION_EVIDENCE' | 'RECONCILIATION_EXPLANATION';
    skillVersion: string;
    outputSchemaVersion: string;
    inputSnapshotId: string;
    records: {
      inputId: string;
      recordType: string;
      sourceSystem: string;
      sourceRecordId: string;
      sourceVersion: string | null;
      data: Record<string, unknown>;
    }[];
    parsedMaterials: unknown[];
  } | null;
}

export interface AiRunData {
  runId: string;
  operation: string;
  profileId: string;
  implementationVersion: string;
  inputSnapshotId: string | null;
  parsing: {
    parseId: string;
    sourceSystem: string;
    sourceMaterialId: string;
    sourceVersion: string;
    contentSha256: string;
    completeness: 'COMPLETE' | 'INCOMPLETE';
    units: { unitId: string; kind: string; index: number; name: string | null; status: string }[];
    blocks: {
      blockId: string; unitId: string; kind: string; text: string | null;
      cellRange: string | null; formula: string | null; cachedValue: string | null;
    }[];
    issues: string[];
  } | null;
  analysis: {
    skill: string;
    skillVersion: string;
    outputSchemaVersion: string;
    inputSnapshotId: string;
    status: 'ANALYZED' | 'NEEDS_INFORMATION';
    summary: string;
    findings: {
      findingId: string;
      type: string;
      content: unknown;
      evidenceRefs: { inputId: string; blockId: string | null; jsonPointer: string | null; quote: string | null }[];
    }[];
    openQuestions: string[];
  } | null;
}
