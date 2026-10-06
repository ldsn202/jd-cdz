import type { GeneratorConfig, MaterialForm, ScenarioKey } from './config.ts';
import { BILLING_SCENARIOS, SCENARIO_KEYS } from './config.ts';
import type { ProviderFact } from './providers.ts';
import { mulberry32, shuffled, centsToAmount, sumAmounts } from './random.ts';

export type PlanItemFact = {
  installationItem: string;
  quantity: number;
  unit: string;
  materialSupplier: string;
  serviceScope: string;
};

export type MaterialFact = {
  sourceMaterialId: string;
  name: string;
  mediaType: string;
  sourceVersion: string;
  fileAvailable: boolean;
};

export type WorkOrderFact = {
  installationWorkOrderId: string;
  serviceProviderId: string;
  scenario: ScenarioKey;
  purchaseOrderId: string;
  entitlementId: string;
  planItems: PlanItemFact[];
  detailStatus: 'NOT_SUBMITTED' | 'SUBMITTED';
  detailItems: PlanItemFact[] | null;
  changeBasisProvided: boolean | null;
  missingRequiredMaterial: boolean;
  materials: MaterialFact[];
  coordinationNote: string | null;
  billingPeriod: string | null;
  jdBillId: string | null;
  providerReceivableId: string | null;
  sourceVersion: string;
  sourceUpdatedAt: string;
};

export type BillItemFact = {
  billItemId: string;
  itemName: string;
  installationWorkOrderId: string | null;
  chargeScope: string | null;
  billedQuantity: string | null;
  unit: string | null;
  unitPrice: string | null;
  amount: string;
};

export type BillGroupFact = {
  jdBillId: string;
  providerReceivableId: string;
  serviceProviderId: string;
  billingPeriod: string;
  workOrderIds: string[];
  jdItems: BillItemFact[];
  jdReportedTotal: string;
  receivableItems: BillItemFact[];
  receivableReportedTotal: string;
  termsId: string;
  approvalId: string | null;
  evidenceComplete: boolean;
  evidenceMissingParts: string[];
  totalMismatchNegative: boolean;
  sourceVersion: string;
};

export type AccountFact = {
  accountId: string;
  displayName: string;
  role: string;
  serviceProviderId: string | null;
  scopeProviderIds: string[];
};

export type NegativeFact = {
  negativeId: string;
  kind: 'TOTAL_MISMATCH' | 'REQUIRED_MATERIAL_MISSING' | 'FILE_VERSION_NOT_FOUND';
  targetDescription: string;
  installationWorkOrderId: string;
  expectedHandling: string;
};

export type BusinessFacts = {
  config: GeneratorConfig;
  providers: ProviderFact[];
  workOrders: WorkOrderFact[];
  billGroups: BillGroupFact[];
  accounts: AccountFact[];
  negatives: NegativeFact[];
};

const ITEM_CATALOG: { name: string; unit: string; unitPriceCents: number }[] = [
  { name: '桥架安装', unit: '米', unitPriceCents: 3000 },
  { name: '电缆敷设', unit: '米', unitPriceCents: 4500 },
  { name: '充电桩基础施工', unit: '项', unitPriceCents: 80000 },
  { name: '接地装置安装', unit: '组', unitPriceCents: 35000 },
  { name: '入场搬运', unit: '次', unitPriceCents: 6000 },
];

const FORM_MEDIA: Record<MaterialForm, { mediaType: string; ext: string }> = {
  clear_table: { mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' },
  restructured_table: { mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' },
  alt_unit_table: { mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' },
  pdf_record: { mediaType: 'application/pdf', ext: 'pdf' },
  image_record: { mediaType: 'image/jpeg', ext: 'jpg' },
};

function constructionMedia(form: MaterialForm, materialSeq: number): { mediaType: string; ext: string } {
  if (form !== 'image_record') return FORM_MEDIA[form];
  return materialSeq % 2 === 0
    ? { mediaType: 'image/jpeg', ext: 'jpg' }
    : { mediaType: 'image/png', ext: 'png' };
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60000).toISOString();
}

function pickPlanItems(rand: () => number): PlanItemFact[] {
  const count = 2 + Math.floor(rand() * 3);
  const chosen = shuffled(ITEM_CATALOG, rand).slice(0, count);
  return chosen.map((c) => {
    const measured=5+Math.floor(rand()*56),supplier=rand()<0.7?'服务商':'京东';
    rand(); // preserve deterministic scenario distribution when adding coherence
    return {installationItem:c.name,quantity:c.unit==='米'?measured:1,unit:c.unit,
      materialSupplier:c.name==='入场搬运'?'不涉及材料':supplier,
      serviceScope:c.name==='入场搬运'?'搬运服务':supplier==='服务商'?'供料及安装':'仅安装'};
  });
}

export function buildBusinessFacts(config: GeneratorConfig, providers: ProviderFact[]): BusinessFacts {
  const rand = mulberry32(config.seed ^ 0x9e3779b9);
  const t0 = config.initialBusinessTime;

  const slots: ProviderFact[] = [];
  for (const p of providers) {
    for (let i = 0; i < p.orderCapacity; i++) slots.push(p);
  }
  const shuffledSlots = shuffled(slots, rand);
  if (shuffledSlots.length !== config.workOrders) {
    throw new Error(`内部分配失败：槽位 ${shuffledSlots.length} 与工单 ${config.workOrders} 不一致`);
  }

  // Fixed demonstration anchors, while preserving the declared per-provider capacities.
  if (config.datasetId.startsWith('demo-10-v')) {
    for (const [index, providerId] of [[0,'SP-001'],[1,'SP-003'],[2,'SP-004'],[3,'SP-007'],[35,'SP-006'],[45,'SP-008'],[50,'SP-005'],[60,'SP-009'],[61,'SP-002']] as [number,string][]) {
      const other=shuffledSlots.findIndex((p,j)=>j>=index&&p.providerId===providerId);
      if(other<0)throw Error('Missing demonstration provider '+providerId);
      [shuffledSlots[index],shuffledSlots[other]]=[shuffledSlots[other],shuffledSlots[index]];
    }
  }
  const scenarioQueue: ScenarioKey[] = [];
  for (const key of SCENARIO_KEYS) {
    for (let i = 0; i < config.scenarios[key]; i++) scenarioQueue.push(key);
  }

  const workOrders: WorkOrderFact[] = [];
  let materialSeq = 0;
  for (let i = 0; i < scenarioQueue.length; i++) {
    const scenario = scenarioQueue[i];
    const provider = shuffledSlots[i];
    const seq = String(i + 1).padStart(4, '0');
    const workOrderId = `WO-2609-${seq}`;
    const isBilling = (BILLING_SCENARIOS as ScenarioKey[]).includes(scenario);

    const planItems = pickPlanItems(rand);
    let detailStatus: WorkOrderFact['detailStatus'] = 'SUBMITTED';
    let detailItems: PlanItemFact[] | null = planItems.map((p) => ({ ...p }));
    let changeBasisProvided: boolean | null = null;
    let missingRequiredMaterial = false;
    let coordinationNote: string | null = null;

    switch (scenario) {
      case 'pending_materials':
        detailStatus = 'NOT_SUBMITTED';
        detailItems = null;
        break;
      case 'evidence_consistent':
        break;
      case 'quantity_diff': {
        const idx = Math.floor(rand() * detailItems!.length);
        detailItems![idx] = { ...detailItems![idx], quantity: detailItems![idx].quantity + 3 + Math.floor(rand() * 10) };
        changeBasisProvided = rand() < 0.5;
        break;
      }
      case 'material_lacking':
        missingRequiredMaterial = true;
        break;
      case 'coordination':
        coordinationNote = `进场受阻：物业审批未完成（第 ${seq} 批），需履约协同跟进`;
        break;
      default:
        break;
    }

    const materials: MaterialFact[] = [];
    if (!missingRequiredMaterial) {
      materialSeq += 1;
      const media = constructionMedia(provider.form, materialSeq);
      materials.push({
        sourceMaterialId: `MAT-${String(materialSeq).padStart(5, '0')}`,
        name: `现场施工记录-${seq}.${media.ext}`,
        mediaType: media.mediaType,
        sourceVersion: 'material-1',
        fileAvailable: true,
      });
    }
    if (scenario === 'quantity_diff' && changeBasisProvided) {
      materialSeq += 1;
      materials.push({
        sourceMaterialId: `MAT-${String(materialSeq).padStart(5, '0')}`,
        name: `现场变更确认单-${seq}.pdf`,
        mediaType: 'application/pdf',
        sourceVersion: 'material-1',
        fileAvailable: true,
      });
    }

    workOrders.push({
      installationWorkOrderId: workOrderId,
      serviceProviderId: provider.providerId,
      scenario,
      purchaseOrderId: `PO-2609-${seq}`,
      entitlementId: `ENT-2609-${seq}`,
      planItems,
      detailStatus,
      detailItems,
      changeBasisProvided,
      missingRequiredMaterial,
      materials,
      coordinationNote,
      billingPeriod: null,
      jdBillId: null,
      providerReceivableId: null,
      sourceVersion: 'work-order-1',
      sourceUpdatedAt: addMinutes(t0, i),
    });
  }

  const billGroups: BillGroupFact[] = [];
  let groupSeq = 0;
  let diffGroupSeq = 0;
  for (const scenarioKey of BILLING_SCENARIOS) {
    const scenarioOrders = workOrders
      .filter((w) => w.scenario === scenarioKey)
      .sort((a, b) => a.serviceProviderId.localeCompare(b.serviceProviderId) || a.installationWorkOrderId.localeCompare(b.installationWorkOrderId));
    let idx = 0;
    while (idx < scenarioOrders.length) {
      groupSeq += 1;
      if (scenarioKey === 'billing_diff') diffGroupSeq += 1;
      const first = scenarioOrders[idx];
      const period = config.billingPeriods[(groupSeq - 1) % config.billingPeriods.length];
      const groupOrders = [first];
      idx += 1;
      if (
        config.datasetId  .startsWith('demo-10-v') === false && groupSeq % 10 === 0 &&
        idx < scenarioOrders.length &&
        scenarioOrders[idx].serviceProviderId === first.serviceProviderId
      ) {
        groupOrders.push(scenarioOrders[idx]);
        idx += 1;
      }
      const scenario = scenarioKey;
      const gseq = String(groupSeq).padStart(4, '0');
      const jdBillId = `JD-BILL-2609-${gseq}`;
      const providerReceivableId = `REC-2609-${gseq}`;

    const jdItems: BillItemFact[] = [];
    let itemSeq = 0;
    for (const order of groupOrders) {
      for (const item of order.detailItems ?? []) {
        itemSeq += 1;
        const catalog = ITEM_CATALOG.find((c) => c.name === item.installationItem)!;
        jdItems.push({
          billItemId: `jd-item-${gseq}-${String(itemSeq).padStart(2, '0')}`,
          itemName: item.installationItem,
          installationWorkOrderId: order.installationWorkOrderId,
          chargeScope: '安装施工费用',
          billedQuantity: String(item.quantity),
          unit: item.unit,
          unitPrice: centsToAmount(catalog.unitPriceCents),
          amount: centsToAmount(catalog.unitPriceCents * item.quantity),
        });
      }
    }
    let jdReportedTotal = sumAmounts(jdItems.map((x) => x.amount ?? '0.00'));

    const receivableItems: BillItemFact[] = [];
    let rSeq = 0;
    if (config.datasetId.startsWith('demo-10-v') && ['billing_diff','billing_evidence_incomplete'].includes(scenario)) {
      for (const [i,j] of jdItems.entries()) {
        const extraQuantity=i===0 && groupSeq%2===0 ? 2 : 0;
        const priceCents=Math.round(Number(j.unitPrice)*100)+(i===0&&!extraQuantity?500:0);
        const quantity=Number(j.billedQuantity)+extraQuantity;
        receivableItems.push({...j,billItemId:j.billItemId.replace('jd-item','rec-item'),billedQuantity:String(quantity),unitPrice:centsToAmount(priceCents),amount:centsToAmount(quantity*priceCents)});
      }
    } else if (scenario === 'billing_diff') {
      for (const order of groupOrders) {
        const items = order.detailItems ?? [];
        const carrying = items.find((x) => x.installationItem === '入场搬运');
        for (const item of items) {
          if (item.installationItem === '入场搬运') continue;
          rSeq += 1;
          const catalog = ITEM_CATALOG.find((c) => c.name === item.installationItem)!;
          const bump = rSeq === 1 ? 5000 : 0;
          receivableItems.push({
            billItemId: `rec-item-${gseq}-${String(rSeq).padStart(2, '0')}`,
            itemName: item.installationItem,
            installationWorkOrderId: order.installationWorkOrderId,
            chargeScope: '安装施工费用',
            billedQuantity: String(item.quantity),
            unit: item.unit,
            unitPrice: centsToAmount(catalog.unitPriceCents),
            amount: centsToAmount(catalog.unitPriceCents * item.quantity + bump),
          });
        }
        if (carrying) {
          rSeq += 1;
          receivableItems.push({
            billItemId: `rec-item-${gseq}-${String(rSeq).padStart(2, '0')}`,
            itemName: '入场搬运（单列）',
            installationWorkOrderId: order.installationWorkOrderId,
            chargeScope: '单列费用',
            billedQuantity: null,
            unit: null,
            unitPrice: null,
            amount: centsToAmount(ITEM_CATALOG.find((c) => c.name === '入场搬运')!.unitPriceCents * carrying.quantity),
          });
        }
      }
      if (receivableItems.length === 0) {
        for (const j of jdItems) receivableItems.push({ ...j, billItemId: j.billItemId.replace('jd-item', 'rec-item') });
      }
    } else {
      for (const j of jdItems) {
        rSeq += 1;
        receivableItems.push({
          ...j,
          billItemId: `rec-item-${gseq}-${String(rSeq).padStart(2, '0')}`,
          chargeScope: j.chargeScope,
        });
      }
    }
    const receivableReportedTotal = sumAmounts(receivableItems.map((x) => x.amount ?? '0.00'));

    const totalMismatchNegative = scenario === 'billing_diff' && diffGroupSeq === (config.datasetId.startsWith('demo-10-v')?30:3);
    if (totalMismatchNegative) {
      jdReportedTotal = centsToAmount(Math.round(Number(jdReportedTotal) * 100) + 1000);
    }

    const evidenceComplete = scenario !== 'billing_evidence_incomplete';
    const evidenceMissingParts = evidenceComplete ? [] : (groupSeq % 2 === 0 ? ['FEE_APPROVAL'] : ['BILLING_TERMS', 'FEE_APPROVAL']);

    for (const order of groupOrders) {
      order.billingPeriod = period;
      order.jdBillId = jdBillId;
      order.providerReceivableId = providerReceivableId;
    }

    billGroups.push({
      jdBillId,
      providerReceivableId,
      serviceProviderId: first.serviceProviderId,
      billingPeriod: period,
      workOrderIds: groupOrders.map((o) => o.installationWorkOrderId),
      jdItems,
      jdReportedTotal,
      receivableItems,
      receivableReportedTotal,
      termsId: config.datasetId.startsWith('demo-10-v') ? `TERMS-${gseq}` : `TERMS-${first.serviceProviderId}-${period}`,
      approvalId: evidenceComplete || !evidenceMissingParts.includes('FEE_APPROVAL') ? `APR-2609-${gseq}` : null,
      evidenceComplete,
      evidenceMissingParts,
      totalMismatchNegative,
      sourceVersion: 'bill-1',
    });
    }
  }

  const accounts: AccountFact[] = [];
  for (const p of providers) {
    accounts.push({
      accountId: `acc-${p.providerId.toLowerCase()}`,
      displayName: `${p.displayName}账号`,
      role: 'PROVIDER_BUSINESS',
      serviceProviderId: p.providerId,
      scopeProviderIds: [p.providerId],
    });
  }
  const allProviderIds = providers.map((p) => p.providerId);
  accounts.push(
    { accountId: 'acc-svc-backend', displayName: '后台来源读取账号', role: 'SERVICE', serviceProviderId: null, scopeProviderIds: allProviderIds },
    { accountId: 'acc-jd-business', displayName: '京东业务账号', role: 'JD_BUSINESS', serviceProviderId: null, scopeProviderIds: allProviderIds },
  );

  const negatives: NegativeFact[] = [];
  const n1 = billGroups.find((g) => g.totalMismatchNegative);
  if (n1) {
    negatives.push({
      negativeId: 'NEG-01',
      kind: 'TOTAL_MISMATCH',
      targetDescription: `京东账单 ${n1.jdBillId} 原总额 ${n1.jdReportedTotal} 与其分项合计不一致（预设负例）`,
      installationWorkOrderId: n1.workOrderIds[0],
      expectedHandling: '总分不符进入核实，不得按总额一致关闭核对',
    });
  }
  const n2 = workOrders.find((w) => w.scenario === 'material_lacking');
  if (n2) {
    negatives.push({
      negativeId: 'NEG-02',
      kind: 'REQUIRED_MATERIAL_MISSING',
      targetDescription: `工单 ${n2.installationWorkOrderId} 必需现场施工记录实际缺失（预设负例）`,
      installationWorkOrderId: n2.installationWorkOrderId,
      expectedHandling: '缺项保持缺项，不得以其他材料或默认结论补齐',
    });
  }
  const n3 = workOrders.find((w) => w.scenario === 'evidence_consistent' && w.materials.length > 0);
  if (n3) {
    const mat = n3.materials[0];
    mat.sourceVersion = 'material-9';
    mat.fileAvailable = false;
    negatives.push({
      negativeId: 'NEG-03',
      kind: 'FILE_VERSION_NOT_FOUND',
      targetDescription: `材料 ${mat.sourceMaterialId}（${mat.name}）索引指向版本 material-9，文件服务不存在该版本（预设负例）`,
      installationWorkOrderId: n3.installationWorkOrderId,
      expectedHandling: '版本读取错误保持错误，不回退到其他版本或伪造正文',
    });
  }

  return { config, providers, workOrders, billGroups, accounts, negatives };
}
