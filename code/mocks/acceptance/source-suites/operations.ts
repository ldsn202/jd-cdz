export type OpResult = { id: string; name: string; positive: boolean; pass: boolean; detail: string };

async function req(base: string, method: string, p: string, opts: { token?: string; body?: unknown } = {}): Promise<{ http: number; json: any }> {
  const res = await fetch(`${base}${p}`, {
    method,
    headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { http: res.status, json: await res.json().catch(() => null) };
}

async function session(base: string, accountId: string): Promise<string> {
  const r = await req(base, 'POST', '/api/admin/mock/external/identity/sessions', { body: { accountId } });
  return r.json.data.token as string;
}

export async function runOperationsSuite(base: string, seed: {
  anyWorkOrder: { id: string; providerId: string; purchaseOrderId: string; planVersion: string; version: string; materials: { sourceMaterialId: string; sourceVersion: string }[] };
  otherWorkOrderId: string;
  billGroup: { jdBillId: string; providerReceivableId: string; serviceProviderId: string; workOrderId: string };
  providerRecord: { providerId: string; recordId: string };
  material: { fileId: string; version: string; sha256: string; byteLength: number; providerId: string };
  runTag: string;
}): Promise<OpResult[]> {
  const R: OpResult[] = [];
  const add = (id: string, name: string, positive: boolean, pass: boolean, detail: string) => R.push({ id, name, positive, pass, detail });
  const tokReview = await session(base, 'acc-jd-business');
  const tokRecon = tokReview;
  const tokProvider = await session(base, `acc-${seed.anyWorkOrder.providerId.toLowerCase()}`);

  const c1 = await req(base, 'GET', '/api/admin/mock/external/identity/current-context', { token: tokReview });
  add('OP-01+', '身份上下文', true, c1.http === 200 && c1.json.data.subjectId === 'acc-jd-business' && c1.json.data.grants.length > 0, `200 grants=${c1.json.data?.grants?.length}`);
  const c1n = await req(base, 'GET', '/api/admin/mock/external/identity/current-context');
  add('OP-01-', '身份上下文无凭据', false, c1n.http === 401 && c1n.json.code === 40101, `40101`);

  const c2 = await req(base, 'GET', `/api/admin/mock/external/installation/work-orders/${seed.anyWorkOrder.id}/context`, { token: tokProvider });
  add('OP-02+', '工单上下文', true, c2.http === 200 && c2.json.data.installationWorkOrder.installationWorkOrderId === seed.anyWorkOrder.id && Array.isArray(c2.json.data.sourceMaterials), `200 completeness=${c2.json.data?.completeness}`);
  const c2n = await req(base, 'GET', `/api/admin/mock/external/installation/work-orders/${seed.otherWorkOrderId}/context`, { token: tokProvider });
  add('OP-02-', '工单跨服务商', false, c2n.http === 403 && c2n.json.code === 40301, `40301`);

  const c3 = await req(base, 'GET', `/api/admin/mock/external/purchase-orders/${seed.anyWorkOrder.purchaseOrderId}/installation-entitlements?installationWorkOrderId=${seed.anyWorkOrder.id}`, { token: tokProvider });
  add('OP-03+', '购买权益', true, c3.http === 200 && c3.json.data.entitlements[0]?.applicability === 'APPLICABLE', `200 LIMITED 上限 ${c3.json.data?.entitlements?.[0]?.includedQuantity}`);
  const c3n = await req(base, 'GET', `/api/admin/mock/external/purchase-orders/PO-9999-XXXX/installation-entitlements?installationWorkOrderId=${seed.anyWorkOrder.id}`, { token: tokProvider });
  add('OP-03-', '订单不存在', false, c3n.http === 404 && c3n.json.code === 40401, `40401`);

  const c4 = await req(base, 'GET', `/api/admin/mock/external/sources/provider-docs/service-providers/${seed.providerRecord.providerId}/records/${seed.providerRecord.recordId}/documents`, { token: tokReview });
  add('OP-04+', '服务商原资料', true, c4.http === 200 && ['PROVIDED', 'NOT_PROVIDED'].includes(c4.json.data.formatStatus), `200 formatStatus=${c4.json.data?.formatStatus}`);
  const c4n = await req(base, 'GET', `/api/admin/mock/external/sources/no-such/service-providers/${seed.providerRecord.providerId}/records/${seed.providerRecord.recordId}/documents`, { token: tokReview });
  add('OP-04-', '来源未配置', false, c4n.http === 400 && c4n.json.code === 40001, `40001`);

  const tokMat = await session(base, `acc-${seed.material.providerId.toLowerCase()}`);
  const c5 = await req(base, 'GET', `/api/admin/mock/external/sources/file-service/materials/${seed.material.fileId}?sourceVersion=${seed.material.version}`, { token: tokMat });
  const bytes = c5.json.data ? Buffer.from(c5.json.data.contentBase64, 'base64') : Buffer.alloc(0);
  add('OP-05+', '原始文件字节', true, c5.http === 200 && c5.json.data.byteLength === seed.material.byteLength && bytes.length === seed.material.byteLength, `200 ${bytes.length}B 摘要=${c5.json.data?.contentSha256?.slice(0, 12)}…`);
  const c5n = await req(base, 'GET', `/api/admin/mock/external/sources/file-service/materials/${seed.material.fileId}?sourceVersion=material-99`, { token: tokMat });
  add('OP-05-', '文件版本不可取得', false, c5n.http === 409 && c5n.json.code === 40901, `40901`);

  const c6 = await req(base, 'GET', `/api/admin/mock/external/jd-bills/${seed.billGroup.jdBillId}?installationWorkOrderId=${seed.billGroup.workOrderId}`, { token: tokRecon });
  add('OP-06+', '京东账单', true, c6.http === 200 && c6.json.data.jdBillId === seed.billGroup.jdBillId && c6.json.data.currency === 'CNY', `200 总额=${c6.json.data?.reportedTotalAmount}`);
  const c6n = await req(base, 'GET', `/api/admin/mock/external/jd-bills/${seed.billGroup.jdBillId}?installationWorkOrderId=${seed.anyWorkOrder.id}`, { token: tokRecon });
  add('OP-06-', '账单工单不符', false, c6n.http === 409 && c6n.json.code === 40901, `40901`);

  const c7 = await req(base, 'GET', `/api/admin/mock/external/sources/provider-receivable/service-providers/${seed.billGroup.serviceProviderId}/receivables/${seed.billGroup.providerReceivableId}?installationWorkOrderId=${seed.billGroup.workOrderId}`, { token: tokRecon });
  add('OP-07+', '服务商应收', true, c7.http === 200 && c7.json.data.providerReceivableId === seed.billGroup.providerReceivableId, `200 总额=${c7.json.data?.reportedTotalAmount}`);
  const c7n = await req(base, 'GET', `/api/admin/mock/external/sources/provider-receivable/service-providers/${seed.billGroup.serviceProviderId}/receivables/REC-XXXX?installationWorkOrderId=${seed.billGroup.workOrderId}`, { token: tokRecon });
  add('OP-07-', '应收不存在', false, c7n.http === 404 && c7n.json.code === 40401, `40401`);

  const c8 = await req(base, 'GET', `/api/admin/mock/external/installation-work-orders/${seed.billGroup.workOrderId}/fee-evidence?serviceProviderId=${seed.billGroup.serviceProviderId}`, { token: tokRecon });
  add('OP-08+', '费用依据', true, c8.http === 200 && c8.json.data.lookupScope.includes(seed.billGroup.workOrderId), `200 terms=${c8.json.data?.terms?.length} approvals=${c8.json.data?.approvals?.length}`);
  const c8n = await req(base, 'GET', `/api/admin/mock/external/installation-work-orders/${seed.billGroup.workOrderId}/fee-evidence?serviceProviderId=${seed.billGroup.serviceProviderId}`, { token: tokProvider });
  const c8nExpected = seed.billGroup.serviceProviderId === seed.anyWorkOrder.providerId ? 200 : 403;
  add('OP-08-', '费用依据越权', false, c8n.http === c8nExpected, `${c8n.http}（按范围控制）`);

  const submitBody = {
    submissionId: `SUB-T41-${seed.runTag}`,
    humanDecisionId: 'HD-T41',
    installationDraftId: 'DRAFT-T41',
    confirmedDraftVersion: 'draft-1',
    expectedWorkOrderVersion: seed.anyWorkOrder.version,
    expectedPlanVersion: seed.anyWorkOrder.planVersion,
    expectedDetailVersion: null,
    items: [{ installationItem: '桥架安装', installedQuantity: 11, unit: '米', materialSupplier: '服务商', serviceScope: '供料及安装' }],
    sourceMaterials: seed.anyWorkOrder.materials.map((m) => ({ sourceSystem: 'file-service', sourceMaterialId: m.sourceMaterialId, sourceVersion: m.sourceVersion })),
  };
  const c9 = await req(base, 'POST', `/api/admin/mock/external/installation/work-orders/${seed.anyWorkOrder.id}/installation-detail-submissions`, { token: tokProvider, body: submitBody });
  add('OP-09+', '明细提交写入', true, c9.http === 200 && c9.json.data.submissionStatus === 'SUCCEEDED' && c9.json.data.installationDetail.sourceVersion === 'detail-1', `SUCCEEDED detail-1`);
  const c9n = await req(base, 'POST', `/api/admin/mock/external/installation/work-orders/${seed.anyWorkOrder.id}/installation-detail-submissions`, { token: tokProvider, body: { ...submitBody, submissionId: `SUB-T41-V-${seed.runTag}`, expectedPlanVersion: 'plan-99' } });
  add('OP-09-', '提交版本不符', false, c9n.http === 409 && c9n.json.code === 40901, `40901`);

  const c10 = await req(base, 'GET', `/api/admin/mock/external/installation/work-orders/${seed.anyWorkOrder.id}/installation-detail-submissions/${submitBody.submissionId}`, { token: tokProvider });
  add('OP-10+', '提交回查', true, c10.http === 200 && c10.json.data.submissionStatus === 'SUCCEEDED', `回查一致`);
  const c10n = await req(base, 'GET', `/api/admin/mock/external/installation/work-orders/${seed.anyWorkOrder.id}/installation-detail-submissions/SUB-XXXX`, { token: tokProvider });
  add('OP-10-', '回查不存在', false, c10n.http === 404 && c10n.json.code === 40401, `40401`);

  const reviewBody = {
    operationId: `OP-T41-${seed.runTag}`,
    workItemId: 'WI-T41',
    expectedWorkItemVersion: 'item-1',
    humanDecisionId: 'HD-T41-R',
    action: 'REQUEST_SUPPLEMENT',
    installationDetailId: c9.json.data.installationDetail.installationDetailId,
    expectedDetailVersion: 'detail-1',
    expectedWorkOrderVersion: seed.anyWorkOrder.version,
    expectedAnalysisVersion: 'analysis-1',
    replyToOperationId: null,
    comment: '请补充变更依据。',
    sourceMaterials: [],
  };
  const c11 = await req(base, 'POST', `/api/admin/mock/external/installation/work-orders/${seed.anyWorkOrder.id}/review-actions`, { token: tokReview, body: reviewBody });
  add('OP-11+', '退回补充写入', true, c11.http === 200 && c11.json.data.operationStatus === 'SUCCEEDED', `SUCCEEDED`);
  const c11n = await req(base, 'POST', `/api/admin/mock/external/installation/work-orders/${seed.anyWorkOrder.id}/review-actions`, { token: tokReview, body: { ...reviewBody, operationId: `OP-T41-E-${seed.runTag}`, comment: '  ' } });
  add('OP-11-', '退回意见为空', false, c11n.http === 400 && c11n.json.code === 40001, `40001`);

  const c12 = await req(base, 'GET', `/api/admin/mock/external/installation/work-orders/${seed.anyWorkOrder.id}/review-actions/${reviewBody.operationId}`, { token: tokReview });
  add('OP-12+', '动作回查', true, c12.http === 200 && c12.json.data.operationStatus === 'SUCCEEDED', `回查一致`);
  const c12n = await req(base, 'GET', `/api/admin/mock/external/installation/work-orders/${seed.anyWorkOrder.id}/review-actions/OP-XXXX`, { token: tokReview });
  add('OP-12-', '动作不存在', false, c12n.http === 404 && c12n.json.code === 40401, `40401`);

  const tokService = await session(base, 'acc-svc-backend-t41');
  const feedId = `feed-t41-${seed.runTag}`;
  await req(base, 'POST', '/api/admin/mock/control/change-feeds', { token: tokService, body: { feedId, sourceSystem: 'installation-admin', serviceProviderId: seed.anyWorkOrder.providerId } });
  const c13 = await req(base, 'GET', `/api/admin/mock/external/change-feeds/${feedId}/changes?cursor=cur-1-0&pageSize=50`, { token: tokService });
  const foundSubmit = c13.json.data?.list?.some((e: any) => e.recordType === 'INSTALLATION_DETAIL');
  add('OP-13+', '变化发现', true, c13.http === 200 && c13.json.data.list.length > 0 && foundSubmit, `基线+写入事件 ${c13.json.data?.list?.length} 条（含明细提交事件=${foundSubmit}）`);
  const c13n = await req(base, 'GET', `/api/admin/mock/external/change-feeds/${feedId}/changes?cursor=cur-1-0`, { token: tokProvider });
  add('OP-13-', '变化发现越权', false, c13n.http === 403 && c13n.json.code === 40301, `40301`);

  const faultId = `fault-t41-${seed.runTag}`;
  await req(base, 'POST', '/api/admin/mock/control/faults', { token: tokProvider, body: { faultId, route: 'detail-submission-write', phase: 'AFTER_WRITE_LOST_RESPONSE', times: 1 } });
  const otherWo = seed.otherWorkOrderId;
  const reviewCtx = await req(base, 'GET', `/api/admin/mock/external/installation/work-orders/${otherWo}/context`, { token: tokReview });
  const otherProvider = reviewCtx.json.data?.installationWorkOrder?.serviceProviderId;
  const tokOther = await session(base, `acc-${otherProvider.toLowerCase()}`);
  const lostBody = {
    ...submitBody,
    submissionId: `SUB-T41-L-${seed.runTag}`,
    expectedWorkOrderVersion: reviewCtx.json.data.installationWorkOrder.sourceVersion,
    expectedPlanVersion: reviewCtx.json.data.installationPlan.sourceVersion,
    sourceMaterials: (reviewCtx.json.data.sourceMaterials ?? []).map((m: any) => ({ sourceSystem: 'file-service', sourceMaterialId: m.sourceMaterialId, sourceVersion: m.sourceVersion })),
  };
  const lost = await req(base, 'POST', `/api/admin/mock/external/installation/work-orders/${otherWo}/installation-detail-submissions`, { token: tokOther, body: lostBody });
  const recheckLost = await req(base, 'GET', `/api/admin/mock/external/installation/work-orders/${otherWo}/installation-detail-submissions/${lostBody.submissionId}`, { token: tokOther });
  add('OP-14+', '丢响应恢复', true, lost.http === 504 && recheckLost.http === 200 && recheckLost.json.data.submissionStatus === 'SUCCEEDED',
    `504→回查 SUCCEEDED（没有收到响应≠没有写入）`);
  await req(base, 'POST', `/api/admin/mock/control/faults/${faultId}/clear`, { token: tokProvider });

  return R;
}
