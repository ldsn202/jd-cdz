export const DELIVERABLES = [
  { file: 'data-manifest.json', name: '数据清单', requiredKeys: ['datasetId', 'generatorVersion', 'seed', 'initialBusinessTime', 'totals', 'perSourceCounts', 'scenarioOrderIds', 'billGroupIndex'] },
  { file: 'file-manifest.json', name: '文件清单', requiredKeys: ['datasetId', 'files', 'negatives'] },
  { file: 'scenario-coverage.json', name: '场景覆盖表', requiredKeys: ['datasetId', 'scenarios', 'formatConditions', 'materialForms', 'multiWorkOrderBills', 'providerOrderCounts'] },
  { file: 'validation-report.json', name: '数据校验报告', requiredKeys: ['datasetId', 'generatedAt', 'checks', 'rawCounts'] },
  { file: 'scenario-expectations.json', name: '独立验收预期', requiredKeys: ['datasetId', 'frozenAt', 'expectations'] },
] as const;

export type DeliverableCheck = { file: string; name: string; exists: boolean; missingKeys: string[] };

export function checkDeliverables(deliveryDir: string, read: (p: string) => string | null): DeliverableCheck[] {
  return DELIVERABLES.map((d) => {
    const raw = read(`${deliveryDir}/${d.file}`);
    if (raw === null) return { file: d.file, name: d.name, exists: false, missingKeys: [...d.requiredKeys] };
    try {
      const obj = JSON.parse(raw);
      const missing = d.requiredKeys.filter((k) => !(k in obj));
      return { file: d.file, name: d.name, exists: true, missingKeys: missing };
    } catch {
      return { file: d.file, name: d.name, exists: true, missingKeys: ['<JSON 解析失败>'] };
    }
  });
}
