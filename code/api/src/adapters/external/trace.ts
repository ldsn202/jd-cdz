export interface AdapterTrace {
  mode: 'mock' | 'real';
  path: string;
  requestId: string | null;
  retrievedAt: string;
  sourceSystem?: string;
  recordId?: string;
  sourceVersion?: string | null;
  contentSha256?: string;
  byteLength?: number;
  digestVerified?: boolean;
}

export interface Traced<T> {
  data: T;
  trace: AdapterTrace;
}
