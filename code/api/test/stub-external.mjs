// 开发用外部来源 stub：仅提供 WO-DEV-0001 上下文端点，供 T2.3 分析链路取数验证。
// 这是适配层验证 stub，不是 mock 专题的模拟服务，不作为 mock 验收证据。
import http from 'node:http';

const ctx = {
  retrievedAt: '2026-09-20T00:00:00Z',
  completeness: 'COMPLETE',
  missingParts: [],
  installationWorkOrder: {
    installationWorkOrderId: 'WO-DEV-0001',
    serviceProviderId: 'provider-dev-a',
    purchaseOrderId: 'PO-DEV-1',
    sourceSystem: 'DEV',
    sourceVersion: 'dev-v1',
    sourceUpdatedAt: null,
  },
  installationPlan: {
    installationPlanId: 'plan-dev-1',
    sourceSystem: 'DEV',
    sourceVersion: 'plan-v1',
    sourceUpdatedAt: null,
    items: [
      { installationItem: '电缆敷设', plannedQuantity: 120, unit: '米', materialSupplier: '服务商甲', serviceScope: '春和庭车库' },
      { installationItem: '充电桩安装', plannedQuantity: 4, unit: '台', materialSupplier: '服务商甲', serviceScope: '春和庭车库' },
    ],
  },
  installationDetailStatus: 'SUBMITTED',
  installationDetail: {
    installationDetailId: 'detail-dev-1',
    sourceSystem: 'DEV',
    sourceVersion: 'detail-v1',
    sourceUpdatedAt: null,
    items: [
      { installationItem: '电缆敷设', installedQuantity: 118, unit: '米', materialSupplier: '服务商甲', serviceScope: '春和庭车库' },
      { installationItem: '充电桩安装', installedQuantity: 4, unit: '台', materialSupplier: '服务商甲', serviceScope: '春和庭车库' },
    ],
  },
  sourceMaterialIndexComplete: true,
  sourceMaterials: [],
};

export function startStub(port = 8790) {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api/admin/mock/external/installation/work-orders/WO-DEV-0001/context') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ code: 0, msg: 'success', requestId: 'stub-1', data: ctx }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ code: 40404, msg: 'not found', requestId: 'stub-1', data: null }));
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r(server)));
}

if (process.argv[1] && process.argv[1].endsWith('stub-external.mjs')) {
  const port = Number(process.argv[2] ?? 8790);
  await startStub(port);
  console.log(`stub-external listening on ${port}`);
}
