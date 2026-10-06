import { useRef, useState, type ReactNode } from 'react';
import { ApiError, apiFetch, errorKind, getOperation, type WorkItemDetail } from '../../api';
import { useApiData, fmtTime } from '../../hooks';
import { Skeleton, StateView } from '../../components/PageShell';
import { createActionRequest, createActionExecutor, isUncertainWrite, type ActionRequest } from './action-request';

export type PanelProps = { item: WorkItemDetail; onChanged: () => void };
export const itemPath = (item: WorkItemDetail, suffix: string) => `/api/admin/charging/work-items/${encodeURIComponent(item.workItemId)}/${suffix}`;
export const versions = (item: WorkItemDetail) => ({ expectedWorkItemVersion: item.rowVersion, expectedResponsibilityVersion: item.responsibilityVersion });
export const allowed = (item: WorkItemDetail, action: string) => (item.allowedActions ?? []).includes(action);
export function Panel({ title, children }: { title: string; children: ReactNode }) { return <section className="panel detail-panel"><h3 className="section-title">{title}</h3>{children}</section>; }
export function ReadError({ error, retry }: { error: unknown; retry: () => void }) {
  const kind = errorKind(error);
  return <StateView kind={kind === 'NOT_FOUND' ? 'not-found' : kind === 'FORBIDDEN' ? 'forbidden' : kind === 'CONFLICT' ? 'conflict' : 'unavailable'} onRetry={retry} />;
}
export function OperationStatus({ operationId, onChanged, onResolved }: { operationId: string; onChanged?: () => void; onResolved?: () => void }) {
  const [state, retry] = useApiData(() => getOperation(operationId), [operationId]);
  if (state.status === 'loading') return <Skeleton lines={2} />;
  if (state.status === 'failed') return <ReadError error={state.error} retry={retry} />;
  const op = state.data;
  const labels: Record<string, string> = { REGISTERED: '已受理，等待提交原系统', PREPARED: '已受理，等待提交', SUBMITTING: '原系统正在处理', PROCESSING: '原系统正在处理', RESULT_UNKNOWN: '原系统结果暂时无法确定，请继续查原操作', SUCCEEDED: '已证实原系统处理成功', REJECTED: '原系统明确拒绝' };
  return <div className="operation-block" role="status"><strong>{op.status === 'SUCCEEDED' && op.localContinuationStatus && !['APPLIED', 'COMPLETED', 'SUCCEEDED', 'DONE'].includes(op.localContinuationStatus) ? '已提交，核查衔接中' : labels[op.status] ?? op.status}</strong><p className="state-desc">操作 {op.operationId}{op.verifiedAt && ` · 核实于 ${fmtTime(op.verifiedAt)}`}</p>{op.localContinuationStatus && <p>本地后续处理：{({ NOT_READY: '等待原系统确认', PENDING: '等待核查衔接', FAILED: '衔接受阻，等待恢复，无需重复提交', APPLIED: '后续处理已生效', COMPLETED: '后续处理已完成', DONE: '后续处理已完成', SUCCEEDED: '后续处理已完成' } as Record<string, string>)[op.localContinuationStatus] ?? op.localContinuationStatus}</p>}<button className="btn-link" onClick={() => { retry(); onChanged?.(); }}>查询原操作最新结果</button>{onResolved && ['SUCCEEDED', 'REJECTED'].includes(op.status) && <button className="btn-link" onClick={() => { onResolved(); onChanged?.(); }}>原操作已有终态，刷新后继续</button>}</div>;
}
type State = { status: 'idle' | 'posting' | 'done' | 'failed'; result?: Record<string, unknown>; error?: unknown };
export function useAction(onChanged: () => void) {
  const [state, setState] = useState<State>({ status: 'idle' });
  const request = useRef<ActionRequest | null>(null);
  const executor = useRef(createActionExecutor(apiFetch<Record<string, unknown>>));
  const perform = async (req: ActionRequest) => {
    if (executor.current.isRunning()) return;
    setState({ status: 'posting' });
    try {
      const result = await executor.current.execute(req);
      setState({ status: 'done', result });
      onChanged();
    } catch (error) { setState({ status: 'failed', error }); }

  };
  const uncertain = state.status === 'failed' && isUncertainWrite(state.error);
  const busy = state.status === 'posting' || uncertain;
  const run = async (path: string, body: unknown, label: string, method = 'POST') => {
    if (executor.current.isRunning() || busy) return;
    if (!window.confirm(`${label}？请核对当前内容、事项版本与依据。`)) return;
    request.current = createActionRequest(path, body, method);
    await perform(request.current);
  };
  const retry = () => request.current ? perform(request.current) : Promise.resolve();
  const reset = () => { if (!busy) { request.current = null; setState({ status: 'idle' }); } };
  const resolve = () => { request.current = null; setState({ status: 'idle' }); };
  return { state, run, retry, reset, resolve, busy };
}
export function ActionStatus({ action, onRefresh }: { action: ReturnType<typeof useAction>; onRefresh: () => void }) {
  const { state } = action;
  if (state.status === 'idle') return null;
  if (state.status === 'posting') return <p role="status">正在提交，等待实际结果…</p>;
  if (state.status === 'done') {
    const result = state.result!;
    return <div className="operation-block" role="status"><strong>{result.status === 'SAVED' ? '已保存' : result.status === 'APPLIED' ? '已生效' : '已受理，后续处理尚待核实'}</strong>{typeof result.operationId === 'string' && <OperationStatus operationId={result.operationId} onChanged={onRefresh} />}{typeof result.uploadId === 'string' && <UploadStatus uploadId={result.uploadId} onChanged={onRefresh} />}<button className="btn-link" onClick={onRefresh}>刷新业务结果</button></div>;
  }
  const error = state.error;
  const kind = errorKind(error);
  const pending = error instanceof ApiError ? error.pendingOperation : null;
  return <div className="action-error" role="alert"><strong>{kind === 'NOT_FOUND' ? '资源不存在或不可见' : kind === 'FORBIDDEN' ? '无操作权限' : kind === 'CONFLICT' ? '处理状态或版本已变化' : kind === 'UNAVAILABLE' ? '结果暂时无法确定' : '请求未完成'}</strong><p>{error instanceof Error ? error.message : '未知错误'}</p>{error instanceof ApiError && error.requestId && <p className="state-desc">查询编号 {error.requestId}</p>}{pending ? <OperationStatus operationId={pending.operationId} onChanged={onRefresh} onResolved={action.resolve} /> : action.busy && <button className="btn-primary" onClick={action.retry}>使用原请求查询受理结果</button>}{kind === 'CONFLICT' && !pending && <><p>填写内容已保留。刷新后核对最新资料，再次确认提交。</p><button className="btn-primary" onClick={() => { onRefresh(); action.reset(); }}>刷新最新版本并保留输入</button></>}</div>;
}
function UploadStatus({ uploadId, onChanged }: { uploadId: string; onChanged: () => void }) {
  const [state, retry] = useApiData(() => apiFetch<{ status: string; issues?: unknown[] }>(`/api/admin/charging/uploads/${encodeURIComponent(uploadId)}`), [uploadId]);
  return <div>{state.status === 'ready' && <><p>材料处理：{({ RECEIVED: '已接收', PREPARING: '解析准备中', READY: '解析已就绪，等待当前分析', BLOCKED: '处理受阻' } as Record<string, string>)[state.data.status] ?? state.data.status}</p>{state.data.issues?.map((issue, i) => <p key={i}>{typeof issue === 'string' ? issue : (issue as {description?: string}).description ?? '材料解析尚未完成'}</p>)}</>}{state.status === 'failed' && <ReadError error={state.error} retry={retry} />}<button className="btn-link" onClick={() => { retry(); onChanged(); }}>查询材料处理状态</button></div>;
}
