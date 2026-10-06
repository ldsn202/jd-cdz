import { detailedMockCall, ExternalError, type ExternalEnv } from '../../services/external/client.ts';
import type { AiRunData, AiRunRequest } from '../../services/external/types.ts';
import type { Traced } from '../external/trace.ts';

export type AiRunResult = Traced<AiRunData> & { aiMode: 'mock' | 'real' };

export async function runAiOperation(env: ExternalEnv, request: AiRunRequest): Promise<AiRunResult> {
  const mode = env.AI_MODE ?? 'mock';
  if (mode === 'real') {
    if (!env.TASK_RUNNER_BASE_URL) {
      throw new ExternalError(503, 50301, 'AI_MODE=real：真实分析经内部任务路由（job-dispatch + OpenCode），无直接 HTTP AI 服务；未配置 TASK_RUNNER_BASE_URL，不回退为固定答案');
    }
    throw new ExternalError(503, 50301, 'AI_MODE=real：直接 HTTP AI 调用不在本适配层开放，真实分析经内部任务路由执行；不自动切换 mock 答案');
  }
  const base = env.MOCK_BASE_URL;
  if (!base) throw new ExternalError(503, 50301, 'AI_MODE=mock 但 MOCK_BASE_URL 未配置');
  const r = await detailedMockCall<AiRunData>(env, `/api/admin/mock/external/ai-runs`, { method: 'POST', body: JSON.stringify(request) });
  return {
    data: r.data,
    aiMode: 'mock',
    trace: {
      mode: 'mock',
      path: '/api/admin/mock/external/ai-runs',
      requestId: r.requestId,
      retrievedAt: new Date().toISOString(),
      recordId: request.runId,
    },
  };
}
