import { subtractAmount } from './money';

export type ReconItemView = {
  billItemId: string;
  inputItemId: string;
  sourceSystem: string;
  sourceRecordId: string;
  sourceVersion: string;
  name: string | null;
  quantity: string | null;
  unit: string | null;
  unitPrice: string | null;
  amount: string | null;
};

export type ReconGroupView = {
  groupId: string;
  status: string | null;
  jdItems: ReconItemView[];
  providerItems: ReconItemView[];
  jdAmount: string | null;
  providerAmount: string | null;
  difference: string | null;
  matchBasis: unknown;
  evidenceRefs: unknown[];
};

export type ReconReplyView = {
  replyActionId: string;
  decisionId: string;
  replyText: string;
  materialVersionIds: string[];
  actor: string | null;
  repliedAt: number | null;
};

export type ReconQuestionView = {
  reconciliationId: string;
  questionActionId: string;
  requestDecisionId: string;
  items: { itemId: string; groupId: string | null; question: string; evidenceRefs: unknown[] }[];
  askedBy: string | null;
  askedAt: number | null;
  replies: ReconReplyView[];
  isClosed: boolean;
};

export type ReconciliationView = {
  reconciliationId: string | null;
  inputSnapshotId: string | null;
  status: 'PREPARING' | 'NEEDS_INFORMATION' | 'DIFFERENT' | 'RECONCILED';
  currency: string | null;
  jdTotal: string | null;
  providerTotal: string | null;
  difference: string | null;
  groups: ReconGroupView[];
  openIssues: unknown[];
  analysisResultId: string | null;
  questions: ReconQuestionView[];
  rowVersion: number;
};

type RecordRow = {
  id: string;
  snapshot_id: string;
  status: 'MATCHED' | 'DIFFERENCE' | 'NEEDS_INFORMATION';
  currency: string | null;
  jd_amount: string | null;
  provider_amount: string | null;
  difference_amount: string | null;
  groups_json: string;
  open_issues_json: string;
};

type InputItemRow = {
  id: string;
  source_system: string | null;
  source_record_id: string | null;
  source_version: string | null;
  record_type: string | null;
  data_json: string | null;
};

function buildBillItem(inputItemId: string, row: InputItemRow, billItemId: string): ReconItemView | null {
  if (!row.data_json) return null;
  let data: { items?: Record<string, unknown>[] };
  try {
    data = JSON.parse(row.data_json) as { items?: Record<string, unknown>[] };
  } catch {
    return null;
  }
  const item = (data.items ?? []).find((it) => it.billItemId === billItemId);
  if (!item) return null;
  const text = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null);
  return {
    billItemId,
    inputItemId,
    sourceSystem: row.source_system ?? '',
    sourceRecordId: row.source_record_id ?? '',
    sourceVersion: row.source_version ?? '',
    name: text(item.itemName ?? item.name),
    quantity: text(item.billedQuantity ?? item.quantity),
    unit: text(item.unit),
    unitPrice: text(item.unitPrice),
    amount: text(item.amount),
  };
}

async function loadQuestionViews(db: D1Database, itemId: string): Promise<ReconQuestionView[]> {
  const questions = await db
    .prepare(
      `SELECT f.id, f.reconciliation_id, f.human_decision_id, f.is_closed, h.content_json, h.actor_identity_id, h.confirmed_at
       FROM fee_verification_action f JOIN human_decision h ON h.id = f.human_decision_id
       WHERE h.work_item_id = ? AND f.action_kind = 'QUESTION'
       ORDER BY f.gmt_create, f.id`
    )
    .bind(itemId)
    .all<{
      id: string;
      reconciliation_id: string;
      human_decision_id: string;
      is_closed: number;
      content_json: string;
      actor_identity_id: string | null;
      confirmed_at: number | null;
    }>();
  const views: ReconQuestionView[] = [];
  for (const q of questions.results ?? []) {
    let items: ReconQuestionView['items'] = [];
    try {
      const parsed = JSON.parse(q.content_json) as { questions?: ReconQuestionView['items'] };
      items = parsed.questions ?? [];
    } catch {
      items = [];
    }
    const replies = await db
      .prepare(
        `SELECT f.id, f.human_decision_id, h.content_json, h.actor_identity_id, h.confirmed_at
         FROM fee_verification_action f JOIN human_decision h ON h.id = f.human_decision_id
         WHERE f.question_action_id = ? AND f.action_kind = 'REPLY'
         ORDER BY f.gmt_create, f.id`
      )
      .bind(q.id)
      .all<{
        id: string;
        human_decision_id: string;
        content_json: string;
        actor_identity_id: string | null;
        confirmed_at: number | null;
      }>();
    views.push({
      reconciliationId: q.reconciliation_id,
      questionActionId: q.id,
      requestDecisionId: q.human_decision_id,
      items,
      askedBy: q.actor_identity_id,
      askedAt: q.confirmed_at,
      isClosed: q.is_closed === 1,
      replies: (replies.results ?? []).map((r) => {
        let replyText = '';
        let materialVersionIds: string[] = [];
        try {
          const c = JSON.parse(r.content_json) as { replyText?: string; materialVersionIds?: string[] };
          replyText = c.replyText ?? '';
          materialVersionIds = c.materialVersionIds ?? [];
        } catch {
          replyText = '';
        }
        return {
          replyActionId: r.id,
          decisionId: r.human_decision_id,
          replyText,
          materialVersionIds,
          actor: r.actor_identity_id,
          repliedAt: r.confirmed_at,
        };
      }),
    });
  }
  return views;
}

export async function readReconciliation(
  db: D1Database,
  workItemId: string,
  currentReconciliationId: string | null,
  rowVersion: number
): Promise<ReconciliationView> {
  const historicalQuestions = await loadQuestionViews(db, workItemId);
  const empty: ReconciliationView = {
    reconciliationId: null,
    inputSnapshotId: null,
    status: 'PREPARING',
    currency: null,
    jdTotal: null,
    providerTotal: null,
    difference: null,
    groups: [],
    openIssues: [
      {
        issueId: 'no-comparison',
        kind: 'PENDING_COMPARISON',
        description: '尚未取得可靠比较结果，待账单与依据读取完成后生成',
      },
    ],
    analysisResultId: null,
    questions: historicalQuestions,
    rowVersion,
  };
  if (!currentReconciliationId) return empty;

  const record = await db
    .prepare(
      `SELECT id, snapshot_id, status, currency, jd_amount, provider_amount, difference_amount, groups_json, open_issues_json
       FROM reconciliation_record WHERE id = ? AND work_item_id = ?`
    )
    .bind(currentReconciliationId, workItemId)
    .first<RecordRow>();
  if (!record) return empty;

  const groupsRaw = JSON.parse(record.groups_json) as {
    groupId?: string;
    status?: string;
    jdAmount?: string | null;
    providerAmount?: string | null;
    differenceAmount?: string | null;
    mappingBasis?: unknown;
    evidenceRefs?: unknown[];
    members?: { inputItemId?: string; billItemId?: string }[];
  }[];

  const inputIds = [...new Set(groupsRaw.flatMap((g) => (g.members ?? []).map((m) => m.inputItemId ?? '')))]
    .filter((x) => x.length > 0);
  const inputMap = new Map<string, InputItemRow>();
  if (inputIds.length > 0) {
    const rows = await db
      .prepare(
        `SELECT id, source_system, source_record_id, source_version, record_type, data_json
         FROM analysis_input_item WHERE snapshot_id = ? AND id IN (SELECT value FROM json_each(?))`
      )
      .bind(record.snapshot_id, JSON.stringify(inputIds))
      .all<InputItemRow>();
    for (const r of rows.results ?? []) inputMap.set(r.id, r);
  }

  const groups: ReconGroupView[] = groupsRaw.map((g, index) => {
    const jdItems: ReconItemView[] = [];
    const providerItems: ReconItemView[] = [];
    for (const m of g.members ?? []) {
      if (!m.inputItemId || !m.billItemId) continue;
      const input = inputMap.get(m.inputItemId);
      if (!input) continue;
      const view = buildBillItem(m.inputItemId, input, m.billItemId);
      if (!view) continue;
      if (input.record_type === 'JD_BILL') jdItems.push(view);
      else if (input.record_type === 'PROVIDER_RECEIVABLE') providerItems.push(view);
    }
    const jdAmount = g.jdAmount ?? null;
    const providerAmount = g.providerAmount ?? null;
    const difference =
      g.differenceAmount != null && jdAmount !== null && providerAmount !== null
        ? subtractAmount(providerAmount, jdAmount)
        : null;
    return {
      groupId: g.groupId ?? `g${index + 1}`,
      status: g.status ?? null,
      jdItems,
      providerItems,
      jdAmount,
      providerAmount,
      difference,
      matchBasis: g.mappingBasis ?? null,
      evidenceRefs: g.evidenceRefs ?? [],
    };
  });

  const questionViews = await loadQuestionViews(db, workItemId);
  const allClosed = questionViews.every((q) => q.isClosed);
  let status: ReconciliationView['status'];
  if (record.status === 'MATCHED') status = allClosed ? 'RECONCILED' : 'NEEDS_INFORMATION';
  else if (record.status === 'DIFFERENCE') status = 'DIFFERENT';
  else status = 'NEEDS_INFORMATION';

  const link = await db
    .prepare('SELECT analysis_result_id FROM reconciliation_analysis_link WHERE reconciliation_id = ? LIMIT 1')
    .bind(record.id)
    .first<{ analysis_result_id: string }>();

  const difference =
    record.difference_amount !== null && record.jd_amount !== null && record.provider_amount !== null
      ? subtractAmount(record.provider_amount, record.jd_amount)
      : null;

  return {
    reconciliationId: record.id,
    inputSnapshotId: record.snapshot_id,
    status,
    currency: record.currency,
    jdTotal: record.jd_amount,
    providerTotal: record.provider_amount,
    difference,
    groups,
    openIssues: JSON.parse(record.open_issues_json) as unknown[],
    analysisResultId: link?.analysis_result_id ?? null,
    questions: questionViews,
    rowVersion,
  };
}
