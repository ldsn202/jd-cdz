import type { WorkItemsSummary } from '../../api';

export type OverviewCard = {
  key: 'actionable' | 'waiting' | 'processing' | 'blocked';
  label: string;
  value: number;
  note: string;
  tone: 'red' | 'blue' | 'gray' | 'amber';
  statuses: readonly string[];
};

export const OVERVIEW_GROUPS: Omit<OverviewCard, 'value'>[] = [
  { key: 'actionable', label: '待我确认', statuses: ['READY'], note: '分析已完成，可以进入处理', tone: 'red' },
  { key: 'waiting', label: '等待补充 / 回复', statuses: ['WAITING_SUPPLEMENT', 'WAITING_REPLY'], note: '等待相关人员补充信息', tone: 'blue' },
  { key: 'processing', label: '待运行 / 处理中', statuses: ['PREPARING', 'PROCESSING'], note: '查看待运行和正在处理的事项', tone: 'gray' },
  { key: 'blocked', label: '异常与受阻', statuses: ['EXCEPTION', 'BLOCKED'], note: '需要优先核实处理状态', tone: 'amber' },
];

export function buildOverviewCards(summary: WorkItemsSummary): OverviewCard[] {
  const count = (...statuses: string[]) => summary.byStatus
    .filter((entry) => statuses.includes(entry.value))
    .reduce((total, entry) => total + entry.count, 0);

  return OVERVIEW_GROUPS.map(group => ({ ...group, value: count(...group.statuses) }));
}
