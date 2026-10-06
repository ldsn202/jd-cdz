import type { OpResult } from './source-suites/operations.ts';
import type { TcStatus } from './source-suites/tc-map.ts';

export type PhaseResult = { phase: string; pass: boolean; detail: string };

export type AcceptanceReport = {
  runAt: string;
  envId: string;
  datasetId: string;
  phases: PhaseResult[];
  operationResults: OpResult[];
  tcStatus: TcStatus[];
  tcSummary: { total: number; generationPass: number; sourcePass: number; businessBlocked: number };
  reproducibility: { comparedWith: string; sourceRecordsIdentical: boolean; filesIdentical: boolean } | null;
  conclusion: string;
};

export function renderMarkdown(r: AcceptanceReport): string {
  const ops = r.operationResults;
  const opPass = ops.filter((o) => o.pass).length;
  const lines: string[] = [];
  lines.push(`# T4.1 模拟来源自动验收 — 证据包（${r.envId}）`, '');
  lines.push(`> 执行时间：${r.runAt}｜数据集：${r.datasetId}｜环境：${r.envId}`, '');
  lines.push('## 阶段结果', '');
  lines.push('| 阶段 | 结果 | 说明 |', '| --- | --- | --- |');
  for (const p of r.phases) lines.push(`| ${p.phase} | ${p.pass ? 'PASS' : 'FAIL'} | ${p.detail} |`);
  lines.push('', '## 业务操作正反例', '');
  lines.push('| 操作 | 性质 | 结果 | 说明 |', '| --- | --- | --- | --- |');
  for (const o of ops) lines.push(`| ${o.id} ${o.name} | ${o.positive ? '正例' : '反例'} | ${o.pass ? 'PASS' : 'FAIL'} | ${o.detail} |`);
  lines.push('', `操作合计 ${ops.length} 项，通过 ${opPass} 项。`, '');
  lines.push('## 用例分阶段状态（生成 / 来源接口 / 业务联调）', '');
  lines.push('| 用例 | 生成 | 来源接口 | 业务联调 |', '| --- | --- | --- | --- |');
  for (const t of r.tcStatus) lines.push(`| ${t.tcId} ${t.name} | ${t.generationStage} | ${t.sourceStage} | ${t.businessStage} |`);
  lines.push('');
  lines.push(`29 组用例：生成阶段 PASS ${r.tcSummary.generationPass}，来源阶段 PASS ${r.tcSummary.sourcePass}，业务联调 BLOCKED ${r.tcSummary.businessBlocked}（依赖：${r.tcStatus[0]?.businessDependency ?? ''}）。`);
  if (r.reproducibility) {
    lines.push('', '## 可复现性', '');
    lines.push(`对照环境 ${r.reproducibility.comparedWith}：来源记录一致=${r.reproducibility.sourceRecordsIdentical}；文件摘要一致=${r.reproducibility.filesIdentical}。`);
  }
  lines.push('', '## 阶段结论', '', r.conclusion);
  return lines.join('\n');
}
