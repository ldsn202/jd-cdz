export const KIND_LABEL: Record<string, string> = {
  INSTALLATION_PREPARATION: '安装资料整理',
  INSTALLATION_REVIEW: '安装核查',
  RECONCILIATION: '业务对账',
  CONFIGURATION: '接入配置',
  COORDINATION: '履约协同',
};

export const STATUS_LABEL: Record<string, string> = {
  PREPARING: '准备中',
  READY: '待处理',
  WAITING_SUPPLEMENT: '待补充',
  WAITING_REPLY: '待回复',
  PROCESSING: '处理中',
  EXCEPTION: '异常处理中',
  BLOCKED: '待核实',
  COMPLETED: '已完成',
};

export const ANALYSIS_LABEL: Record<string, string> = {
  AVAILABLE: '',
  NOT_READY: '待分析',
  BLOCKED: '分析异常，需重试',
};

export const ROLE_LABEL: Record<string, string> = {
  INSTALLATION_REVIEWER: '安装核查',
  BUSINESS_RECONCILER: '业务对账',
  PROVIDER_DOCUMENT_CLERK: '服务商资料',
  PROVIDER_RECEIVABLE_OWNER: '服务商应收',
  PROVIDER_INTEGRATION_CONTACT: '服务商对接',
  FULFILLMENT_COORDINATOR: '履约协同',
};

export function roleSummary(roles: string[]): string {
  const jdRoles = ['INSTALLATION_REVIEWER', 'BUSINESS_RECONCILER', 'FULFILLMENT_COORDINATOR'];
  const unified = jdRoles.every(role => roles.includes(role));
  const providerRoles = ['PROVIDER_DOCUMENT_CLERK', 'PROVIDER_RECEIVABLE_OWNER', 'PROVIDER_INTEGRATION_CONTACT'];
  const providerUnified = providerRoles.every(role => roles.includes(role));
  const labels = roles.filter(role => (!unified || !jdRoles.includes(role)) && (!providerUnified || !providerRoles.includes(role))).map(role => ROLE_LABEL[role] ?? role);
  return [...(unified ? ['京东业务'] : []), ...(providerUnified ? ['服务商'] : []), ...labels].join(' · ') || '业务人员';
}

export const ANALYSIS_RESULT_LABEL: Record<string, string> = {
  ANALYZED: '分析完成', BLOCKED: '分析受阻', FAILED: '分析失败', PREPARING: '正在准备',
  ACCEPTED: '等待分析', RUNNING: '正在分析', COMPLETE: '分析完成', INCOMPLETE: '资料不完整',
};
export const FINDING_TOPIC_LABEL: Record<string, string> = {
  QUANTITY: '安装数量', MATERIAL_SUPPLIER: '供料方', SERVICE_SCOPE: '服务范围',
  INSTALLATION_QUANTITY: '安装数量', ITEM_MATCH: '项目对应', PRICE: '费用单价', AMOUNT: '费用金额',
  BILLING: '费用核对', ENTITLEMENT: '权益依据', FEE_BASIS: '费用依据', OTHER: '其他发现',
};
