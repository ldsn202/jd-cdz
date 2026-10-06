import {currentInstallationBasis,installationInputFence} from './installation-input';
import {assertConfigurationWrite} from './config-transaction';
import type { ResolvedIdentity } from './identity';
import { PendingWriteError, ServiceError, newId, nowMs } from './change-batch';
import type { WorkItemRow } from './work-item-query';

export const EDITABLE_FIELDS = [
  'installationItem',
  'installedQuantity',
  'unit',
  'materialSupplier',
  'serviceScope',
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

export type DraftItem = {
  installationItem: string;
  installedQuantity: number | null;
  unit: string | null;
  materialSupplier: string | null;
  serviceScope: string | null;
};

export type EditNoteInput = { itemIndex: number; field: string; reason: string };

export type DraftRow = {
  id: string;
  work_item_id: string;
  current_version_id: string;
  row_version: number;
  gmt_create: number;
  gmt_modified: number;
};

export type DraftVersionRow = {
  id: string;
  installation_draft_id: string;
  work_item_id: string;
  version_no: number;
  parent_version_id: string | null;
  analysis_result_id: string;
  context_snapshot_id: string;
  origin: string;
  editor_identity_id: string | null;
  items_json: string;
  source_materials_json: string;
  open_questions_json: string;
  edit_notes_json: string;
  save_key: string;
  gmt_create: number;
  gmt_modified: number;
};

export type DraftView = {
  draftId: string | null;
  draftVersionId: string | null;
  versionNo: number | null;
  origin: string | null;
  editorIdentityId: string | null;
  contextSnapshotId: string | null;
  analysisResultId: string | null;
  items: DraftItem[];
  sourceMaterials: unknown[];
  openQuestions: unknown[];
  editNotes: unknown[];
};

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export async function loadDraft(db: D1Database, workItemId: string): Promise<DraftRow | null> {
  return db
    .prepare('SELECT id, work_item_id, current_version_id, row_version, gmt_create, gmt_modified FROM installation_draft WHERE work_item_id = ?')
    .bind(workItemId)
    .first<DraftRow>();
}

export async function loadDraftVersion(db: D1Database, versionId: string): Promise<DraftVersionRow | null> {
  return db
    .prepare(
      `SELECT id, installation_draft_id, work_item_id, version_no, parent_version_id, analysis_result_id,
              context_snapshot_id, origin, editor_identity_id, items_json, source_materials_json,
              open_questions_json, edit_notes_json, save_key, gmt_create, gmt_modified
       FROM installation_draft_version WHERE id = ?`
    )
    .bind(versionId)
    .first<DraftVersionRow>();
}

export async function readDraftView(db: D1Database, workItemId: string): Promise<DraftView> {
  const draft = await loadDraft(db, workItemId);
  if (!draft) {
    return {
      draftId: null,
      draftVersionId: null,
      versionNo: null,
      origin: null,
      editorIdentityId: null,
      contextSnapshotId: null,
      analysisResultId: null,
      items: [],
      sourceMaterials: [],
      openQuestions: [],
      editNotes: [],
    };
  }
  const version = await loadDraftVersion(db, draft.current_version_id);
  if (!version) throw new ServiceError(500, 50001, '草稿指针与版本不一致');
  return {
    draftId: draft.id,
    draftVersionId: version.id,
    versionNo: version.version_no,
    origin: version.origin,
    editorIdentityId: version.editor_identity_id,
    contextSnapshotId: version.context_snapshot_id,
    analysisResultId: version.analysis_result_id,
    items: JSON.parse(version.items_json) as DraftItem[],
    sourceMaterials: JSON.parse(version.source_materials_json) as unknown[],
    openQuestions: JSON.parse(version.open_questions_json) as unknown[],
    editNotes: JSON.parse(version.edit_notes_json) as unknown[],
  };
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new ServiceError(400, 40001, `${label} 必须为字符串或 null`);
  return value;
}

function decimalRoundTrips(value: number): boolean {
  if (!Number.isFinite(value) || value < 0) return false;
  return Number(value.toString()) === value;
}

export function validateItems(raw: unknown): DraftItem[] {
  if (!Array.isArray(raw)) throw new ServiceError(400, 40001, 'items 必须为数组');
  return raw.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ServiceError(400, 40001, `items[${index}] 必须为对象`);
    }
    const o = entry as Record<string, unknown>;
    const installationItem = o.installationItem;
    if (typeof installationItem !== 'string' || installationItem.trim().length === 0) {
      throw new ServiceError(400, 40001, `items[${index}].installationItem 必填且非空`);
    }
    let installedQuantity: number | null = null;
    if (o.installedQuantity !== null && o.installedQuantity !== undefined) {
      if (typeof o.installedQuantity !== 'number' || !decimalRoundTrips(o.installedQuantity)) {
        throw new ServiceError(400, 40001, `items[${index}].installedQuantity 必须为有限非负且精度可精确表达的 number 或 null`);
      }
      installedQuantity = o.installedQuantity;
    }
    return {
      installationItem,
      installedQuantity,
      unit: nullableString(o.unit, `items[${index}].unit`),
      materialSupplier: nullableString(o.materialSupplier, `items[${index}].materialSupplier`),
      serviceScope: nullableString(o.serviceScope, `items[${index}].serviceScope`),
    };
  });
}

export function validateEditNotes(raw: unknown, newLen: number, oldLen: number): EditNoteInput[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new ServiceError(400, 40001, 'editNotes 必须为数组');
  const limit = Math.max(newLen, oldLen);
  return raw.map((entry, i) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ServiceError(400, 40001, `editNotes[${i}] 必须为对象`);
    }
    const o = entry as Record<string, unknown>;
    if (!Number.isInteger(o.itemIndex) || (o.itemIndex as number) < 0 || (o.itemIndex as number) >= limit) {
      throw new ServiceError(400, 40001, `editNotes[${i}].itemIndex 越界`);
    }
    if (typeof o.field !== 'string' || !(EDITABLE_FIELDS as readonly string[]).includes(o.field)) {
      if (o.field !== 'row') {
        throw new ServiceError(400, 40002, `editNotes[${i}].field 非可编辑字段`);
      }
    }
    if (typeof o.reason !== 'string' || o.reason.trim().length === 0) {
      throw new ServiceError(400, 40001, `editNotes[${i}].reason 必填且非空`);
    }
    return { itemIndex: o.itemIndex as number, field: o.field as string, reason: o.reason };
  });
}

function changedFields(oldItem: DraftItem | undefined, newItem: DraftItem): EditableField[] {
  if (!oldItem) return [...EDITABLE_FIELDS];
  const changed: EditableField[] = [];
  for (const f of EDITABLE_FIELDS) {
    if (oldItem[f] !== newItem[f]) changed.push(f);
  }
  return changed;
}

export type SaveDraftBody = {
  expectedWorkItemVersion: number;
  expectedResponsibilityVersion: number;
  expectedDraftVersionId: string;
  items: unknown;
  editNotes: unknown;
};

export type SaveDraftResult = {
  draftId: string;
  draftVersionId: string;
  versionNo: number;
  workItemId: string;
  rowVersion: number;
  status: 'SAVED';
};

export async function saveHumanDraft(
  db: D1Database,
  identity: ResolvedIdentity,
  row: WorkItemRow,
  idempotencyKey: string,
  body: SaveDraftBody
): Promise<SaveDraftResult> {
  if (!Number.isInteger(body.expectedWorkItemVersion) || !Number.isInteger(body.expectedResponsibilityVersion)) {
    throw new ServiceError(400, 40001, 'expectedWorkItemVersion 与 expectedResponsibilityVersion 必填且为整数');
  }
  if (typeof body.expectedDraftVersionId !== 'string' || body.expectedDraftVersionId.trim().length === 0) {
    throw new ServiceError(400, 40001, 'expectedDraftVersionId 必填');
  }

  const draft = await loadDraft(db, row.id);
  if (!draft) throw new ServiceError(422, 42201, '尚未整理出可编辑草稿');
  const current = await loadDraftVersion(db, draft.current_version_id);
  if (!current) throw new ServiceError(500, 50001, '草稿指针与版本不一致');

  const newItems = validateItems(body.items);
  const oldItems = JSON.parse(current.items_json) as DraftItem[];
  const notes = validateEditNotes(body.editNotes, newItems.length, oldItems.length);

  const saveKey = `draft:${identity.identityId}:${row.id}:${idempotencyKey}`;
  const replayItems = stableStringify(newItems);
  const existing = await db
    .prepare('SELECT * FROM installation_draft_version WHERE installation_draft_id = ? AND save_key = ?')
    .bind(draft.id, saveKey)
    .first<DraftVersionRow>();
  if (existing) {
    const sameItems = stableStringify(JSON.parse(existing.items_json)) === replayItems;
    // edit_notes_json 保存的是服务端补全的差异记录，重放比对只取人员输入的身份三元组。
    const storedNotes = (JSON.parse(existing.edit_notes_json) as EditNoteInput[])
      .map((n) => ({ itemIndex: n.itemIndex, field: n.field, reason: n.reason }))
      .sort((a, b) => a.itemIndex - b.itemIndex || a.field.localeCompare(b.field));
    const inputNotes = [...notes].sort((a, b) => a.itemIndex - b.itemIndex || a.field.localeCompare(b.field));
    const sameNotes = stableStringify(storedNotes) === stableStringify(inputNotes);
    if (!sameItems || !sameNotes) {
      throw new ServiceError(409, 40902, '同一保存键已用于不同内容');
    }
    return {
      draftId: draft.id,
      draftVersionId: existing.id,
      versionNo: existing.version_no,
      workItemId: row.id,
      rowVersion: row.row_version,
      status: 'SAVED',
    };
  }

  if (row.pending_write_id) {
    const op = await db
      .prepare('SELECT status FROM external_write_operation WHERE id = ?')
      .bind(row.pending_write_id)
      .first<{ status: string }>();
    throw new PendingWriteError(row.pending_write_id, op?.status ?? 'UNKNOWN', '事项存在未决外部写入，暂不可保存新草稿版本');
  }
  if (row.status === 'COMPLETED') {
    throw new ServiceError(409, 40901, '事项已完成，不可再保存草稿版本');
  }
  if (row.row_version !== body.expectedWorkItemVersion) {
    throw new ServiceError(409, 40901, '事项版本已变化，请刷新后核实');
  }
  if (row.responsibility_version !== body.expectedResponsibilityVersion) {
    throw new ServiceError(409, 40901, '责任版本已变化，请刷新后核实');
  }
  if (draft.current_version_id !== body.expectedDraftVersionId) {
    throw new ServiceError(409, 40901, '草稿当前版本已变化，请刷新后核实');
  }

  const basis=await currentInstallationBasis(db,row,{analysisId:current.analysis_result_id,contextId:current.context_snapshot_id});
  if((basis.id!==current.analysis_result_id||basis.contextId!==current.context_snapshot_id)&&!notes.length)throw new ServiceError(400,40001,'输入已更新，请核对人工内容并填写重新确认的理由');
  const required = new Map<string, EditNoteInput>();
  for (const n of notes) required.set(`${n.itemIndex}:${n.field}`, n);
  const enriched: Record<string, unknown>[] = [];
  for (let i = 0; i < newItems.length; i++) {
    const oldItem = oldItems[i];
    if (!oldItem) {
      const note = required.get(`${i}:row`);
      if (!note) throw new ServiceError(400, 40001, `items[${i}] 为新增行但缺少修改理由`);
      enriched.push({ itemIndex: i, field: 'row', oldValue: null, newValue: null, reason: note.reason });
      continue;
    }
    for (const field of changedFields(oldItem, newItems[i])) {
      const note = required.get(`${i}:${field}`);
      if (!note) throw new ServiceError(400, 40001, `items[${i}].${field} 有实质修改但缺少修改理由`);
      enriched.push({
        itemIndex: i,
        field,
        oldValue: (oldItem as unknown as Record<string, unknown>)[field],
        newValue: (newItems[i] as unknown as Record<string, unknown>)[field],
        reason: note.reason,
      });
    }
  }
  if (oldItems.length > newItems.length) {
    const removal = notes.find((n) => n.field === 'row' && n.itemIndex >= newItems.length);
    if (!removal) throw new ServiceError(400, 40001, '存在被删除的明细行但缺少修改理由');
    enriched.push({ itemIndex: removal.itemIndex, field: 'row', oldValue: null, newValue: null, reason: removal.reason });
  }
  for (const n of notes) {
    if (!enriched.some((e) => e.itemIndex === n.itemIndex && e.field === n.field)) {
      enriched.push({ itemIndex: n.itemIndex, field: n.field, oldValue: null, newValue: null, reason: n.reason });
    }
  }

  const now = nowMs();
  const versionId = newId('dv');
  const rowVersion = draft.row_version + 1;
  const insert = db
    .prepare(
      `INSERT INTO installation_draft_version
       (id, installation_draft_id, work_item_id, version_no, parent_version_id, analysis_result_id, context_snapshot_id,
        origin, editor_identity_id, items_json, source_materials_json, open_questions_json, edit_notes_json, save_key, gmt_create, gmt_modified)
       SELECT ?, ?, ?, ?, ?, ?, ?, 'HUMAN', ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (
         SELECT 1 FROM installation_draft_version WHERE installation_draft_id = ? AND (version_no = ? OR save_key = ?))`
    )
    .bind(
      versionId, draft.id, row.id, current.version_no + 1, current.id, basis.id, basis.contextId,
      identity.identityId, JSON.stringify(newItems), basis.sourceMaterialsJson, basis.open_questions_json,
      JSON.stringify(enriched), saveKey, now, now, draft.id, current.version_no + 1, saveKey
    );
  const advance = db
    .prepare(
      `UPDATE installation_draft SET current_version_id = ?, row_version = ?, gmt_modified = ?
       WHERE id = ? AND row_version = ? AND current_version_id = ?`
    )
    .bind(versionId, rowVersion, now, draft.id, draft.row_version, draft.current_version_id);

  try{await db.batch([...installationInputFence(db,row,now),insert,...assertConfigurationWrite(db,now),advance,...assertConfigurationWrite(db,now)]);}catch(error){if(/transaction_assertion|passed/.test((error as Error).message))throw new ServiceError(409,40901,'草稿条件已变化，保存已全部回滚');throw error;}

  return {
    draftId: draft.id,
    draftVersionId: versionId,
    versionNo: current.version_no + 1,
    workItemId: row.id,
    rowVersion: row.row_version,
    status: 'SAVED',
  };
}
