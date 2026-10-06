export type ActionRequest = { path: string; method: string; key: string; body: string | FormData };
export function createActionRequest(path: string, body: unknown, method = 'POST'): ActionRequest {
  return { path, method, key: crypto.randomUUID(), body: body instanceof FormData ? body : JSON.stringify(body) };
}
export function replayAction<T>(request: ActionRequest, send: (path: string, init: RequestInit) => Promise<T>): Promise<T> {
  return send(request.path, { method: request.method, headers: { 'Idempotency-Key': request.key }, body: request.body });
}
export function uploadForm(item: { workItemId: string; providerId: string | null; rowVersion?: string | number }, file: File, purpose: string): FormData {
  const form = new FormData();
  form.set('file', file);
  form.set('providerId', item.providerId ?? '');
  form.set('purpose', purpose);
  form.set('workItemId', item.workItemId);
  form.set('expectedWorkItemVersion', String(item.rowVersion));
  return form;
}
export const DRAFT_FIELDS = ['installationItem', 'installedQuantity', 'unit', 'materialSupplier', 'serviceScope'] as const;
export type DraftItem = { installationItem: string; installedQuantity: number | null; unit: string | null; materialSupplier: string | null; serviceScope: string | null };
export function draftChanges(original: DraftItem[], edited: DraftItem[], reason: string) {
  return edited.flatMap((row, itemIndex) => DRAFT_FIELDS.filter((field) => original[itemIndex]?.[field] !== row[field]).map((field) => ({ itemIndex, field, reason })));
}
export function canEnableConfiguration(view: { candidateVersion: { versionId: string } | null; trial: { configurationVersionId: string; status: string } | null; openQuestions: unknown[] }): boolean {
  return !!view.candidateVersion && view.trial?.configurationVersionId === view.candidateVersion.versionId && view.trial.status === 'PASSED' && view.openQuestions.length === 0;
}
export function createActionExecutor<T>(send: (path: string, init: RequestInit) => Promise<T>) {
  let pending: Promise<T> | null = null;
  return {
    isRunning: () => pending !== null,
    execute(request: ActionRequest): Promise<T> {
      if (pending) return pending;
      pending = replayAction(request, send).finally(() => { pending = null; });
      return pending;
    },
  };
}
export function isUncertainWrite(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('httpStatus' in error)) return true;
  const e = error as { httpStatus: number; code?: number };
  return e.httpStatus >= 500 || e.code === 40903;
}
