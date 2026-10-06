import type { FormatCondition, GeneratorConfig, MaterialForm } from './config.ts';
import { FORMAT_CONDITIONS, MATERIAL_FORMS } from './config.ts';
import { shuffled, mulberry32 } from './random.ts';

export type ProviderFact = {
  providerId: string;
  displayName: string;
  form: MaterialForm;
  formatCondition: FormatCondition;
  formatId: string;
  formatVersion: string;
  orderCapacity: number;
  configurationPurpose: 'INSTALLATION';
  businessScopeKey: string;
};

const NAME_PREFIX = [
  '安达', '恒捷', '远程机电', '中联', '天佑', '鹏程', '宏基', '华能', '瑞通', '精诚',
  '广汇', '立信', '众合', '凯旋', '旭日', '鼎力', '博世', '蓝湾', '骏业', '永泰',
];
const NAME_SUFFIX = ['充电桩安装', '机电工程', '电力安装', '新能源服务', '智能工程'];

export function buildProviders(config: GeneratorConfig): ProviderFact[] {
  const rand = mulberry32(config.seed ^ 0x1234);

  const conditions: FormatCondition[] = [];
  for (const c of FORMAT_CONDITIONS) {
    for (let i = 0; i < config.formatVersions[c]; i++) conditions.push(c);
  }
  const forms: MaterialForm[] = [];
  for (const f of MATERIAL_FORMS) {
    for (let i = 0; i < config.materialForms[f]; i++) forms.push(f);
  }
  if (conditions.length !== config.providers || forms.length !== config.providers) {
    throw new Error(`内部分配失败：条件 ${conditions.length} / 形态 ${forms.length} / 服务商 ${config.providers}`);
  }

  const shuffledConditions = shuffled(conditions, rand);
  const shuffledForms = shuffled(forms, rand);

  const capacities: number[] = [];
  let total = 0;
  for (let i = 0; i < config.providers; i++) {
    const cap = Math.max(1, Math.floor(config.workOrders / config.providers) + ((i * 7) % 5) - 2);
    capacities.push(cap);
    total += cap;
  }
  let diff = config.workOrders - total;
  let cursor = 0;
  while (diff !== 0) {
    const idx = cursor % config.providers;
    if (diff > 0) {
      capacities[idx] += 1;
      diff -= 1;
    } else if (capacities[idx] > 1) {
      capacities[idx] -= 1;
      diff += 1;
    }
    cursor += 1;
    if (cursor > config.providers * (config.workOrders + 10)) {
      throw new Error('内部分配失败：工单容量无法配平');
    }
  }

  const providers: ProviderFact[] = [];
  for (let i = 0; i < config.providers; i++) {
    const seq = String(i + 1).padStart(3, '0');
    providers.push({
      providerId: `SP-${seq}`,
      displayName: `${NAME_PREFIX[i % NAME_PREFIX.length]}${NAME_SUFFIX[Math.floor(i / NAME_PREFIX.length) % NAME_SUFFIX.length]}（${seq}）`,
      form: config.datasetId.startsWith('demo-10-v') ? (['clear_table','clear_table','pdf_record','image_record','clear_table','pdf_record','image_record','clear_table','clear_table','clear_table'] as MaterialForm[])[i] : shuffledForms[i],
      formatCondition: config.datasetId.startsWith('demo-10-v') ? (i===9?'meaning_unknown':'complete') : shuffledConditions[i],
      formatId: `FMT-${seq}`,
      formatVersion: 'fv-1',
      orderCapacity: capacities[i],
      configurationPurpose: 'INSTALLATION',
      businessScopeKey: 'installation-materials',
    });
  }
  return providers;
}
