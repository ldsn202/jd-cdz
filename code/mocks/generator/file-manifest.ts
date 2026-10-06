export type FileManifestEntry = {
  fileId: string;
  sourceVersion: string;
  name: string;
  mediaType: string;
  ownerKind: 'work_order_material' | 'provider_doc';
  ownerId: string;
  installationWorkOrderId: string | null;
  serviceProviderId: string;
  relativePath: string;
  sizeBytes: number;
  sha256: string;
  pages: number | null;
  sheets: string[] | null;
  contentPositions: string[];
  descriptionText: string | null;
  extractedText: string | null;
};

export type FileNegative = {
  negativeId: string;
  kind: 'DAMAGED_FILE' | 'MISSING_PAGE';
  fileId: string;
  counterpartFileId: string;
  installationWorkOrderId: string;
  expectedHandling: string;
};

export type FileManifest = {
  datasetId: string;
  generatorVersion: string;
  generatedAt: string;
  note: string;
  files: FileManifestEntry[];
  negatives: FileNegative[];
};
