export type SetType = 'quick' | 'standard' | 'extension';

export type ScenarioKey =
  | 'pending_materials'
  | 'evidence_consistent'
  | 'quantity_diff'
  | 'material_lacking'
  | 'billing_matched'
  | 'billing_diff'
  | 'billing_evidence_incomplete'
  | 'coordination'
  | 'read_only';

export const SCENARIO_KEYS: ScenarioKey[] = [
  'pending_materials',
  'evidence_consistent',
  'quantity_diff',
  'material_lacking',
  'billing_matched',
  'billing_diff',
  'billing_evidence_incomplete',
  'coordination',
  'read_only',
];

export const SCENARIO_NAMES: Record<ScenarioKey, string> = {
  pending_materials: '待整理安装资料',
  evidence_consistent: '安装证据一致',
  quantity_diff: '安装数量差异',
  material_lacking: '安装材料不足',
  billing_matched: '双方账目可核对一致',
  billing_diff: '双方账目存在差异',
  billing_evidence_incomplete: '对账依据未取得完整',
  coordination: '履约协调',
  read_only: '工单只读查看',
};

export const FILE_INVOLVED_SCENARIOS: ScenarioKey[] = [
  'pending_materials',
  'evidence_consistent',
  'quantity_diff',
  'material_lacking',
];

export const BILLING_SCENARIOS: ScenarioKey[] = ['billing_matched', 'billing_diff', 'billing_evidence_incomplete'];

export type MaterialForm = 'clear_table' | 'restructured_table' | 'alt_unit_table' | 'pdf_record' | 'image_record';

export const MATERIAL_FORMS: MaterialForm[] = [
  'clear_table',
  'restructured_table',
  'alt_unit_table',
  'pdf_record',
  'image_record',
];

export const MATERIAL_FORM_NAMES: Record<MaterialForm, string> = {
  clear_table: '字段清楚的表格',
  restructured_table: '同义字段但结构不同的表格',
  alt_unit_table: '计量表达不同的表格',
  pdf_record: 'PDF施工记录',
  image_record: '图片施工记录',
};

export type FormatCondition = 'complete' | 'meaning_unknown' | 'no_spec' | 'association_mismatch';

export const FORMAT_CONDITIONS: FormatCondition[] = ['complete', 'meaning_unknown', 'no_spec', 'association_mismatch'];

export type GeneratorConfig = {
  datasetId: string;
  setType: SetType;
  generatorVersion: string;
  seed: number;
  initialBusinessTime: string;
  providers: number;
  workOrders: number;
  billingPeriods: string[];
  scenarios: Record<ScenarioKey, number>;
  formatVersions: Record<FormatCondition, number>;
  materialForms: Record<MaterialForm, number>;
};

export class ConfigError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`生成配置被拒绝：${issues.join('；')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function validateConfig(raw: unknown): GeneratorConfig {
  const issues: string[] = [];
  const c = raw as Partial<GeneratorConfig>;

  if (typeof c?.datasetId !== 'string' || !ID_PATTERN.test(c.datasetId)) issues.push('datasetId 缺失或非法');
  if (c?.setType !== 'quick' && c?.setType !== 'standard' && c?.setType !== 'extension') {
    issues.push('setType 必须是 quick / standard / extension');
  }
  if (typeof c?.generatorVersion !== 'string' || c.generatorVersion.trim() === '') issues.push('generatorVersion 缺失');
  if (typeof c?.seed !== 'number' || !Number.isInteger(c.seed)) issues.push('seed 缺失或不是整数');
  if (typeof c?.initialBusinessTime !== 'string' || Number.isNaN(Date.parse(c.initialBusinessTime))) {
    issues.push('initialBusinessTime 缺失或不是可解析时间');
  }
  if (typeof c?.providers !== 'number' || !Number.isInteger(c.providers) || c.providers < 1) issues.push('providers 缺失或非法');
  if (typeof c?.workOrders !== 'number' || !Number.isInteger(c.workOrders) || c.workOrders < 1) issues.push('workOrders 缺失或非法');
  if (!Array.isArray(c?.billingPeriods) || c.billingPeriods.length < 1 || !c.billingPeriods.every((p) => typeof p === 'string' && PERIOD_PATTERN.test(p))) {
    issues.push('billingPeriods 缺失或含非法账期（YYYY-MM）');
  }

  const scenarios = c?.scenarios as Partial<Record<ScenarioKey, unknown>> | undefined;
  if (!scenarios || typeof scenarios !== 'object') {
    issues.push('scenarios 缺失（九项主场景必须逐项明确数量，不隐式取整）');
  } else {
    for (const key of SCENARIO_KEYS) {
      const v = scenarios[key];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) issues.push(`scenarios.${key} 缺失或非法`);
    }
  }

  const formatVersions = c?.formatVersions as Partial<Record<FormatCondition, unknown>> | undefined;
  if (!formatVersions || typeof formatVersions !== 'object') {
    issues.push('formatVersions 缺失');
  } else {
    for (const key of FORMAT_CONDITIONS) {
      const v = formatVersions[key];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) issues.push(`formatVersions.${key} 缺失或非法`);
    }
  }

  const materialForms = c?.materialForms as Partial<Record<MaterialForm, unknown>> | undefined;
  if (!materialForms || typeof materialForms !== 'object') {
    issues.push('materialForms 缺失');
  } else {
    for (const key of MATERIAL_FORMS) {
      const v = materialForms[key];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) issues.push(`materialForms.${key} 缺失或非法`);
    }
  }

  if (issues.length > 0) throw new ConfigError(issues);
  const config = c as GeneratorConfig;

  const scenarioSum = SCENARIO_KEYS.reduce((acc, k) => acc + config.scenarios[k], 0);
  if (scenarioSum !== config.workOrders) {
    issues.push(`数量冲突：九项主场景合计 ${scenarioSum} 与声明工单数 ${config.workOrders} 不一致，不补隐形工单`);
  }

  const formatSum = FORMAT_CONDITIONS.reduce((acc, k) => acc + config.formatVersions[k], 0);
  if (formatSum !== config.providers) {
    issues.push(`数量冲突：初始格式版本合计 ${formatSum} 与服务商数 ${config.providers} 不一致（每家一份初始格式）`);
  }

  const formSum = MATERIAL_FORMS.reduce((acc, k) => acc + config.materialForms[k], 0);
  if (formSum !== config.providers) {
    issues.push(`数量冲突：五类资料形态分配合计 ${formSum} 与服务商数 ${config.providers} 不一致（每家归属一类形态）`);
  }

  const billingTotal = BILLING_SCENARIOS.reduce((acc, k) => acc + config.scenarios[k], 0);
  if (billingTotal > 0 && config.billingPeriods.length < 1) {
    issues.push('存在账单场景但 billingPeriods 为空');
  }

  if (config.datasetId.startsWith('demo-10-v')) {
    if (config.providers !== 10) issues.push('演示集必须恰好 10 家服务商');
  } else if (config.setType !== 'quick') {
    if (config.providers < 100) issues.push(`覆盖不足：常规/扩展集服务商 ${config.providers} 家，低于 100 家门槛`);
    for (const key of SCENARIO_KEYS) {
      const n = config.scenarios[key];
      if (n > 0 && n < 3) issues.push(`覆盖不足：场景 ${SCENARIO_NAMES[key]} 仅 ${n} 单，无法分布到至少 3 家服务商`);
    }
    for (const key of MATERIAL_FORMS) {
      if (config.materialForms[key] < 20) issues.push(`覆盖不足：资料形态 ${MATERIAL_FORM_NAMES[key]} 仅 ${config.materialForms[key]} 家，低于 20 家门槛`);
    }
    if (billingTotal > 0 && config.billingPeriods.length < 3) {
      issues.push(`覆盖不足：账单场景需跨 3 个账期，当前仅 ${config.billingPeriods.length} 个`);
    }
  }

  if (issues.length > 0) throw new ConfigError(issues);
  return config;
}
