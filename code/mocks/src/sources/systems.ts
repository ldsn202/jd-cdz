export const SOURCE_SYSTEMS = [
  { id: 'identity', name: '身份与权限系统' },
  { id: 'installation-admin', name: '原安装管理系统' },
  { id: 'order-entitlement', name: '订单及安装权益系统' },
  { id: 'provider-docs', name: '服务商资料系统' },
  { id: 'file-service', name: '文件服务' },
  { id: 'jd-billing', name: '京东账单系统' },
  { id: 'provider-receivable', name: '服务商应收系统' },
  { id: 'billing-terms', name: '计费依据系统' },
] as const;

export type SourceSystemId = (typeof SOURCE_SYSTEMS)[number]['id'];

export function isSourceSystem(id: string): id is SourceSystemId {
  return SOURCE_SYSTEMS.some((s) => s.id === id);
}
