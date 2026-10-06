import type { DatabaseSync } from 'node:sqlite';
import type { RouteResult } from '../jd-bills/read.ts';

export type FaultPhase = 'BEFORE_CALL' | 'AFTER_WRITE_LOST_RESPONSE' | 'RECHECK_FAIL' | 'LOCAL_CONTINUATION';

export type FaultSlip = {
  faultId: string;
  route: string;
  phase: FaultPhase;
  times: number;
  remaining: number;
  httpOverride: number | null;
  active: boolean;
  hits: { at: string; requestId: string; path: string }[];
  createdAt: string;
  clearedAt: string | null;
};

function loadSlips(db: DatabaseSync): FaultSlip[] {
  return (db.prepare("SELECT payload_json FROM source_record WHERE kind = 'fault_slip'").all() as any[]).map((r) => JSON.parse(r.payload_json));
}

function saveSlip(db: DatabaseSync, slip: FaultSlip): void {
  db.prepare("UPDATE source_record SET payload_json = ? WHERE kind = 'fault_slip' AND record_id = ?").run(JSON.stringify(slip), slip.faultId);
}

export function registerFault(db: DatabaseSync, body: Record<string, unknown>): RouteResult {
  const { faultId, route, phase, times } = body as { faultId?: string; route?: string; phase?: string; times?: number };
  if (!faultId || typeof faultId !== 'string') return { http: 400, body: { code: 40001, msg: 'faultId 必填', data: null } };
  if (!route || typeof route !== 'string') return { http: 400, body: { code: 40001, msg: 'route 必填（目标接口）', data: null } };
  if (phase !== 'BEFORE_CALL' && phase !== 'AFTER_WRITE_LOST_RESPONSE' && phase !== 'RECHECK_FAIL' && phase !== 'LOCAL_CONTINUATION') {
    return { http: 400, body: { code: 40001, msg: 'failurePhase 须为 BEFORE_CALL / AFTER_WRITE_LOST_RESPONSE / RECHECK_FAIL / LOCAL_CONTINUATION', data: null } };
  }
  if (typeof times !== 'number' || !Number.isInteger(times) || times < 1) {
    return { http: 400, body: { code: 40001, msg: 'times 须为正整数（命中次数）', data: null } };
  }
  if (phase === 'RECHECK_FAIL' && body.httpOverride !== 404 && body.httpOverride !== 503 && body.httpOverride !== 504) {
    return { http: 400, body: { code: 40001, msg: 'RECHECK_FAIL 须指定 httpOverride 为 404 / 503 / 504', data: null } };
  }
  if (loadSlips(db).some((s) => s.faultId === faultId && s.active)) {
    return { http: 409, body: { code: 40901, msg: 'faultId 已存在且未解除', data: null } };
  }
  const slip: FaultSlip = {
    faultId,
    route,
    phase,
    times,
    remaining: times,
    httpOverride: phase === 'RECHECK_FAIL' ? (body.httpOverride as number) : null,
    active: true,
    hits: [],
    createdAt: new Date().toISOString(),
    clearedAt: null,
  };
  db.prepare("INSERT INTO source_record (kind, record_id, source_version, source_updated_at, payload_json) VALUES ('fault_slip', ?, 'fault-1', ?, ?)")
    .run(faultId, slip.createdAt, JSON.stringify(slip));
  return { http: 201, body: { code: 0, msg: 'success', data: { faultId, route, phase, times, note: '故障控制单已登记；控制入口仅开发工具可访问，业务响应不返回答案' } } };
}

export function listFaults(db: DatabaseSync): RouteResult {
  return { http: 200, body: { code: 0, msg: 'success', data: loadSlips(db).map((s) => ({ ...s, hits: s.hits.slice(-10) })) } };
}

export function clearFault(db: DatabaseSync, faultId: string): RouteResult {
  const slip = loadSlips(db).find((s) => s.faultId === faultId);
  if (!slip) return { http: 404, body: { code: 40401, msg: '故障控制单不存在', data: null } };
  slip.active = false;
  slip.clearedAt = new Date().toISOString();
  saveSlip(db, slip);
  return { http: 200, body: { code: 0, msg: 'success', data: { faultId, cleared: true } } };
}

export function matchFault(db: DatabaseSync, route: string, phase: FaultPhase, requestId: string, path: string): FaultSlip | null {
  const slip = loadSlips(db).find((s) => s.active && s.route === route && s.phase === phase && s.remaining > 0);
  if (!slip) return null;
  slip.remaining -= 1;
  slip.hits.push({ at: new Date().toISOString(), requestId, path });
  if (slip.remaining === 0) slip.active = false;
  saveSlip(db, slip);
  return slip;
}
