import { providerSample } from '../provider-samples.ts';
import type { DatabaseSync } from 'node:sqlite';
import type { BusinessFacts, BillGroupFact, WorkOrderFact } from '../business-facts.ts';
import type { SourceSystemId } from '../../src/sources/systems.ts';

export type SourceRecordRow = {
  kind: string;
  recordId: string;
  sourceVersion: string;
  sourceUpdatedAt: string;
  payload: Record<string, unknown>;
};

export function insertRecords(db: DatabaseSync, rows: SourceRecordRow[]): number {
  const stmt = db.prepare(
    'INSERT INTO source_record (kind, record_id, source_version, source_updated_at, payload_json) VALUES (?, ?, ?, ?, ?)'
  );
  db.exec('BEGIN');
  try {
    for (const r of rows) stmt.run(r.kind, r.recordId, r.sourceVersion, r.sourceUpdatedAt, JSON.stringify(r.payload));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return rows.length;
}

function orderSeq(workOrderId: string): string {
  return workOrderId.slice('WO-2609-'.length);
}

function projectIdentity(facts: BusinessFacts): SourceRecordRow[] {
  const t0 = facts.config.initialBusinessTime;
  const rows: SourceRecordRow[] = [];
  for (const a of facts.accounts) {
    rows.push({
      kind: 'account',
      recordId: a.accountId,
      sourceVersion: 'account-1',
      sourceUpdatedAt: t0,
      payload: { accountId: a.accountId, displayName: a.displayName, role: a.role, serviceProviderId: a.serviceProviderId, active: true },
    });
    rows.push({
      kind: 'grant',
      recordId: `grant-${a.accountId}`,
      sourceVersion: 'grant-1',
      sourceUpdatedAt: t0,
      payload: { grantId: `grant-${a.accountId}`, accountId: a.accountId, scopeProviderIds: a.scopeProviderIds, role: a.role },
    });
  }
  return rows;
}

function projectInstallationAdmin(facts: BusinessFacts): SourceRecordRow[] {
  const rows: SourceRecordRow[] = facts.providers.map(p => ({
    kind: 'service_provider', recordId: p.providerId, sourceVersion: 'provider-1',
    sourceUpdatedAt: facts.config.initialBusinessTime,
    payload: { serviceProviderId: p.providerId, displayName: p.displayName },
  }));
  for (const w of facts.workOrders) {
    const seq = orderSeq(w.installationWorkOrderId);
    rows.push({
      kind: 'work_order',
      recordId: w.installationWorkOrderId,
      sourceVersion: w.sourceVersion,
      sourceUpdatedAt: w.sourceUpdatedAt,
      payload: {
        installationWorkOrderId: w.installationWorkOrderId,
        serviceProviderId: w.serviceProviderId,
        purchaseOrderId: w.purchaseOrderId,
        status: 'OPEN',
        coordinationNote: w.coordinationNote,
      },
    });
    rows.push({
      kind: 'installation_plan',
      recordId: `PLAN-${seq}`,
      sourceVersion: 'plan-1',
      sourceUpdatedAt: w.sourceUpdatedAt,
      payload: {
        installationPlanId: `PLAN-${seq}`,
        installationWorkOrderId: w.installationWorkOrderId,
        items: w.planItems.map((p) => ({
          installationItem: p.installationItem,
          plannedQuantity: p.quantity,
          unit: p.unit,
          materialSupplier: p.materialSupplier,
          serviceScope: p.serviceScope,
        })),
      },
    });
    if (w.detailStatus === 'SUBMITTED' && w.detailItems) {
      rows.push({
        kind: 'installation_detail',
        recordId: `DTL-${seq}`,
        sourceVersion: 'detail-1',
        sourceUpdatedAt: w.sourceUpdatedAt,
        payload: {
          installationDetailId: `DTL-${seq}`,
          installationWorkOrderId: w.installationWorkOrderId,
          items: w.detailItems.map((d) => ({
            installationItem: d.installationItem,
            installedQuantity: d.quantity,
            unit: d.unit,
            materialSupplier: d.materialSupplier,
            serviceScope: d.serviceScope,
          })),
        },
      });
    }
    for (const m of w.materials) {
      rows.push({
        kind: 'material_index',
        recordId: m.sourceMaterialId,
        sourceVersion: m.sourceVersion,
        sourceUpdatedAt: w.sourceUpdatedAt,
        payload: {
          sourceMaterialId: m.sourceMaterialId,
          installationWorkOrderId: w.installationWorkOrderId,
          name: m.name,
          mediaType: m.mediaType,
          fileRef: { sourceSystem: 'file-service', fileId: m.sourceMaterialId, sourceVersion: m.sourceVersion },
        },
      });
    }
  }
  return rows;
}

function projectOrderEntitlement(facts: BusinessFacts): SourceRecordRow[] {
  const rows: SourceRecordRow[] = [];
  for (const w of facts.workOrders) {
    rows.push({
      kind: 'purchase_order',
      recordId: w.purchaseOrderId,
      sourceVersion: 'order-1',
      sourceUpdatedAt: facts.config.initialBusinessTime,
      payload: {
        purchaseOrderId: w.purchaseOrderId,
        serviceProviderId: w.serviceProviderId,
        installationWorkOrderId: w.installationWorkOrderId,
        status: 'EFFECTIVE',
      },
    });
    rows.push({
      kind: 'installation_entitlement',
      recordId: w.entitlementId,
      sourceVersion: 'ent-1',
      sourceUpdatedAt: facts.config.initialBusinessTime,
      payload: {
        entitlementId: w.entitlementId,
        purchaseOrderId: w.purchaseOrderId,
        installationWorkOrderId: w.installationWorkOrderId,
        serviceScope: '充电桩安装',
        quantityUpperLimit: 1,
        effective: true,
        applicableBasis: `购买订单 ${w.purchaseOrderId} 所含安装权益`,
      },
    });
  }
  return rows;
}

const FORM_RAW_JSON: Record<string, string> = {
  clear_table: JSON.stringify({ 项目: '桥架安装', 数量: '12', 单位: '米', 供料方: '服务商', 施工范围: '供料及安装' }),
  restructured_table: JSON.stringify({ 分段记录: [{ 段号: 1, 桥架: { 供料: '12米', 安装: '12米' }, 电缆: { 敷设: '45米' } }] }),
  alt_unit_table: JSON.stringify({ 桥架: '3段×4米', 电缆: '48m', 基础: '1处' }),
};

function projectProviderDocs(facts: BusinessFacts): SourceRecordRow[] {
  const t0 = facts.config.initialBusinessTime;
  const rows: SourceRecordRow[] = [];
  for (const p of facts.providers) {
    const seq = p.providerId.slice('SP-'.length);
    const recordId = `PROV-DOC-${seq}`;
    const isFileForm = p.form === 'pdf_record' || p.form === 'image_record';
    const declaredVersion = p.formatCondition === 'association_mismatch' ? 'fv-2' : p.formatVersion;
    rows.push({
      kind: 'provider_record',
      recordId,
      sourceVersion: 'doc-1',
      sourceUpdatedAt: t0,
      payload: {
        sourceRecordId: recordId,
        serviceProviderId: p.providerId,
        purpose: 'CONFIGURATION',
        configurationPurpose: p.configurationPurpose,
        businessScopeKey: p.businessScopeKey,
        installationWorkOrderId: null,
        sourceFormatId: p.formatId,
        sourceFormatVersion: declaredVersion,
        materialForm: p.form,
        rawJson: facts.config.datasetId.startsWith('demo-10-v') ? JSON.stringify({rows:providerSample(p).rows}) : isFileForm ? null : FORM_RAW_JSON[p.form],
        fileMaterialId: isFileForm || facts.config.datasetId.startsWith('demo-10-v') ? `PROV-FILE-${seq}` : null,
      },
    });
    if (p.formatCondition !== 'no_spec') {
      const meaningUnknown = p.formatCondition === 'meaning_unknown';
      rows.push({
        kind: 'format_spec',
        recordId: `${p.formatId}@${p.formatVersion}`,
        sourceVersion: 'format-1',
        sourceUpdatedAt: t0,
        payload: {
          formatId: p.formatId,
          sourceVersion: p.formatVersion,
          serviceProviderId: p.providerId,
          notes: meaningUnknown ? '本说明未覆盖全部字段含义。' : `${p.displayName} 安装资料格式说明（字段含义以原说明为准）。`,
          fields: facts.config.datasetId.startsWith('demo-10-v') ? providerSample(p).fields : p.form === 'clear_table' ? [
            { fieldKey: '项目', label: '项目', meaning: meaningUnknown ? null : '实际安装项目名称', unit: null },
            { fieldKey: '数量', label: '数量', meaning: meaningUnknown ? null : '实际安装数量，单位取同一行单位字段', unit: null },
            { fieldKey: '单位', label: '单位', meaning: '实际安装数量的计量单位', unit: null },
            { fieldKey: '供料方', label: '供料方', meaning: '材料提供方', unit: null },
            { fieldKey: '施工范围', label: '施工范围', meaning: '本行实际完成的施工服务范围', unit: null },
          ] : [
            { fieldKey: '桥架安装', label: '桥架安装', meaning: meaningUnknown ? null : '桥架敷设安装长度', unit: '米' },
            { fieldKey: '电缆敷设', label: '电缆敷设', meaning: '电缆敷设长度', unit: '米' },
            { fieldKey: '供料方', label: '供料方', meaning: meaningUnknown ? null : '材料提供方', unit: null },
          ],
        },
      });
    }
  }
  if(facts.config.datasetId.startsWith('demo-10-v')){
    const w=facts.workOrders.find(w=>w.installationWorkOrderId==='WO-2609-0001')!;
    const p=facts.providers.find(p=>p.providerId===w.serviceProviderId)!;
    const names=providerSample(p).sheetRows[0];
    const actual=w.detailItems??w.planItems;
    rows.push({kind:'provider_record',recordId:'PROV-INSTALL-0001',sourceVersion:'doc-1',sourceUpdatedAt:t0,payload:{
      sourceRecordId:'PROV-INSTALL-0001',serviceProviderId:p.providerId,purpose:'INSTALLATION',
      configurationPurpose:p.configurationPurpose,businessScopeKey:p.businessScopeKey,installationWorkOrderId:w.installationWorkOrderId,
      sourceFormatId:p.formatId,sourceFormatVersion:p.formatVersion,materialForm:p.form,
      rawJson:JSON.stringify({rows:actual.map(it=>Object.fromEntries(names.map((n,i)=>[n,[it.installationItem,String(it.quantity),it.unit,it.materialSupplier,it.serviceScope][i]])))}),fileMaterialId:null
    }});
  }
  return rows;
}

function projectFileService(facts: BusinessFacts): SourceRecordRow[] {
  const t0 = facts.config.initialBusinessTime;
  const rows: SourceRecordRow[] = [];
  for (const w of facts.workOrders) {
    for (const m of w.materials) {
      if (!m.fileAvailable) continue;
      rows.push({
        kind: 'file_meta',
        recordId: `${m.sourceMaterialId}@${m.sourceVersion}`,
        sourceVersion: 'file-1',
        sourceUpdatedAt: t0,
        payload: {
          fileId: m.sourceMaterialId,
          sourceVersion: m.sourceVersion,
          mediaType: m.mediaType,
          name: m.name,
          bytePlan: 'T1.2 实际字节生成后补 sha256 与大小',
          sha256: null,
          sizeBytes: null,
        },
      });
    }
  }
  for (const p of facts.providers) {
    if (p.form !== 'pdf_record' && p.form !== 'image_record' && facts.config.datasetId.startsWith('demo-10-v') === false) continue;
    const seq = p.providerId.slice('SP-'.length);
    const fileId = `PROV-FILE-${seq}`;
    const usePng = p.form === 'image_record' && Number(seq) % 2 === 1;
    const excel = facts.config.datasetId.startsWith('demo-10-v');
    const mediaType = excel ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : p.form === 'pdf_record' ? 'application/pdf' : usePng ? 'image/png' : 'image/jpeg';
    const ext = excel ? 'xlsx' : p.form === 'pdf_record' ? 'pdf' : usePng ? 'png' : 'jpg';
    rows.push({
      kind: 'file_meta',
      recordId: `${fileId}@file-1`,
      sourceVersion: 'file-1',
      sourceUpdatedAt: t0,
      payload: {
        fileId,
        sourceVersion: 'file-1',
        mediaType,
        name: excel ? `安装明细样表-${seq}.xlsx` : p.form === 'pdf_record' ? `安装资料说明-${seq}.pdf` : `安装资料照片-${seq}.${ext}`,
        bytePlan: 'T1.2 实际字节生成后补 sha256 与大小',
        sha256: null,
        sizeBytes: null,
      },
    });
  }
  return rows;
}

function billPayload(g: BillGroupFact) {
  const single = g.workOrderIds.length === 1;
  return {
    billingPeriod: g.billingPeriod,
    serviceProviderId: g.serviceProviderId,
    relatedWorkOrderIds: g.workOrderIds,
    currency: 'CNY',
    taxBasis: 'TAX_INCLUDED',
    sourceStatus: '已出账',
    effectiveStatus: 'EFFECTIVE',
    reportedTotalAmount: g.jdReportedTotal,
    targetWorkOrderAmounts: single ? { [g.workOrderIds[0]]: g.jdReportedTotal } : null,
  };
}

function projectJdBilling(facts: BusinessFacts): SourceRecordRow[] {
  const t0 = facts.config.initialBusinessTime;
  return facts.billGroups.map((g) => ({
    kind: 'jd_bill',
    recordId: g.jdBillId,
    sourceVersion: g.sourceVersion,
    sourceUpdatedAt: t0,
    payload: { jdBillId: g.jdBillId, ...billPayload(g), items: g.jdItems },
  }));
}

function projectProviderReceivable(facts: BusinessFacts): SourceRecordRow[] {
  const t0 = facts.config.initialBusinessTime;
  return facts.billGroups.map((g) => {
    const single = g.workOrderIds.length === 1;
    return {
      kind: 'provider_receivable',
      recordId: g.providerReceivableId,
      sourceVersion: 'receivable-1',
      sourceUpdatedAt: t0,
      payload: {
        providerReceivableId: g.providerReceivableId,
        serviceProviderId: g.serviceProviderId,
        billingPeriod: g.billingPeriod,
        relatedWorkOrderIds: g.workOrderIds,
        currency: 'CNY',
        taxBasis: 'TAX_INCLUDED',
        sourceStatus: '应收确认中',
        effectiveStatus: 'EFFECTIVE',
        reportedTotalAmount: g.receivableReportedTotal,
        targetWorkOrderAmounts: single ? { [g.workOrderIds[0]]: g.receivableReportedTotal } : null,
        previousSourceVersion: null,
        sourceRevisionNote: null,
        items: g.receivableItems,
      },
    };
  });
}

function projectBillingTerms(facts: BusinessFacts): SourceRecordRow[] {
  const t0 = facts.config.initialBusinessTime;
  const rows: SourceRecordRow[] = [];
  const termsKeys = new Set<string>();
  for (const g of facts.billGroups) {
    if (!g.evidenceMissingParts.includes('BILLING_TERMS') && !termsKeys.has(g.termsId)) {
      termsKeys.add(g.termsId);
      rows.push({
        kind: 'billing_terms',
        recordId: g.termsId,
        sourceVersion: 'terms-1',
        sourceUpdatedAt: t0,
        payload: {
          termsId: g.termsId,
          serviceProviderId: g.serviceProviderId,
          billingPeriod: g.billingPeriod,
          coveredItems: ['桥架安装', '电缆敷设', '充电桩基础施工', '接地装置安装', '入场搬运'],
          effectiveRange: `${g.billingPeriod}-01 至 ${g.billingPeriod} 月末`,
          text: facts.config.datasetId.startsWith('demo-10-v') ? `本期已确认合同：${g.jdItems.map(i=>`${i.itemName}，单价 ${i.unitPrice} 元/${i.unit}，验收数量 ${i.billedQuantity}${i.unit}`).join('；')}。计费数量采用本工单验收数量，单价采用上述含税合同单价；未经另行批准不得增加数量或调整单价。` : '按已确认计费条款执行：按量收费项目以明细数量×条款单价计，固定收费按项计。',
        },
      });
    }
    if (g.approvalId) {
      rows.push({
        kind: 'fee_approval',
        recordId: g.approvalId,
        sourceVersion: 'approval-1',
        sourceUpdatedAt: t0,
        payload: {
          approvalId: g.approvalId,
          jdBillId: g.jdBillId,
          serviceProviderId: g.serviceProviderId,
          approvedWorkOrderIds: g.workOrderIds,
          approver: '京东费用审批（开发数据）',
          approvedAt: t0,
          recordText: facts.config.datasetId.startsWith('demo-10-v') ? `批准本工单按已验收数量及本期合同单价结算。${g.jdItems.map(i=>`${i.itemName}：${i.billedQuantity}${i.unit}，含税单价 ${i.unitPrice} 元`).join('；')}。本次完整查询没有其他数量增加或单价调整的批准记录。服务商应收如与这些依据不同，须核实并修订原应收，不能直接按差额付款。` : undefined,
        },
      });
    }
  }
  return rows;
}

export const PROJECTORS: Record<SourceSystemId, (facts: BusinessFacts) => SourceRecordRow[]> = {
  identity: projectIdentity,
  'installation-admin': projectInstallationAdmin,
  'order-entitlement': projectOrderEntitlement,
  'provider-docs': projectProviderDocs,
  'file-service': projectFileService,
  'jd-billing': projectJdBilling,
  'provider-receivable': projectProviderReceivable,
  'billing-terms': projectBillingTerms,
};
