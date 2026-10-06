import type { DatabaseSync } from 'node:sqlite';
import type { RouteResult } from '../jd-bills/read.ts';

export function postAiRun(identityDb: DatabaseSync, body: Record<string, unknown>): RouteResult {
  const runId = body.runId;
  const operation = body.operation;
  const profileId = body.profileId;
  if (typeof runId !== 'string' || runId.trim() === '' || typeof profileId !== 'string' || profileId.trim() === '') {
    return { http: 400, body: { code: 40001, msg: 'runId/profileId 必填', data: null } };
  }
  if (operation !== 'PARSE_MATERIAL' && operation !== 'ANALYZE_SKILL') {
    return { http: 400, body: { code: 40001, msg: 'operation 须为 PARSE_MATERIAL / ANALYZE_SKILL', data: null } };
  }
  const existing = identityDb.prepare("SELECT payload_json FROM source_record WHERE kind = 'ai_run' AND record_id = ?").get(runId) as { payload_json: string } | undefined;
  if (existing) {
    const p = JSON.parse(existing.payload_json);
    if (JSON.stringify(p.request) !== JSON.stringify(body)) {
      return { http: 409, body: { code: 40902, msg: '同 runId 已用于另一份请求', data: null } };
    }
    return { http: 200, body: { code: 0, msg: 'success', data: p.response } };
  }

  const now = new Date().toISOString();
  const parseInput = body.parseInput as { sourceSystem: string; sourceMaterialId: string; sourceVersion: string; contentSha256: string; mediaType: string } | null;
  const analysisInput = body.analysisInput as { skill: string; skillVersion: string; outputSchemaVersion: string; inputSnapshotId: string } | null;
  const response = {
    runId,
    operation,
    profileId,
    implementationVersion: 'mock-ai-1.0.0',
    inputSnapshotId: analysisInput?.inputSnapshotId ?? null,
    parsing:
      operation === 'PARSE_MATERIAL' && parseInput
        ? {
            parseId: `parse-${runId}`,
            sourceSystem: parseInput.sourceSystem,
            sourceMaterialId: parseInput.sourceMaterialId,
            sourceVersion: parseInput.sourceVersion,
            contentSha256: parseInput.contentSha256,
            completeness: 'COMPLETE',
            units: [{ unitId: `unit-${runId}-1`, kind: 'DOCUMENT', index: 1, name: null, status: 'READ' }],
            blocks: [],
            issues: ['MOCK_AI_NO_REAL_PARSE：本结果由明确标记的 AI mock 流程产生，未执行真实解析'],
          }
        : null,
    analysis:
      operation === 'ANALYZE_SKILL' && analysisInput
        ? {
            skill: analysisInput.skill,
            skillVersion: analysisInput.skillVersion,
            outputSchemaVersion: analysisInput.outputSchemaVersion,
            inputSnapshotId: analysisInput.inputSnapshotId,
            runStatus: 'SUCCEEDED',
            issues: ['MOCK_AI_NO_REAL_ANALYSIS：本结果由明确标记的 AI mock 流程产生，未经 OpenCode 真实执行'],
          }
        : null,
    mock: true,
    mockNotice: 'AI mock 流程（AI_MODE=mock），单独标记，不得充当真实分析通过证据',
    completedAt: now,
  };
  identityDb.prepare("INSERT INTO source_record (kind, record_id, source_version, source_updated_at, payload_json) VALUES ('ai_run', ?, 'ai-run-1', ?, ?)")
    .run(runId, now, JSON.stringify({ request: body, response }));
  return { http: 200, body: { code: 0, msg: 'success', data: response } };
}
