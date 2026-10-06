import type { Context } from 'hono';

export const ERR = {
  FIELD_INVALID: 40001,
  ENUM_INVALID: 40002,
  UNAUTHORIZED: 40101,
  FORBIDDEN: 40301,
  NOT_FOUND: 40404,
  VERSION_CONFLICT: 40901,
  IDEMPOTENCY_CONFLICT: 40902,
  PENDING_WRITE: 40903,
  UNPROCESSABLE: 42201,
  PAYLOAD_TOO_LARGE: 41301,
  RATE_LIMITED: 42901,
  BAD_DEPENDENCY: 50201,
  DEPENDENCY_UNAVAILABLE: 50301,
  DEPENDENCY_TIMEOUT: 50401,
  INTERNAL: 50001,
} as const;

export function newRequestId(): string {
  return `req-${crypto.randomUUID()}`;
}

export function ok<T>(c: Context, data: T, requestId: string) {
  return c.json({ code: 0, msg: 'success', requestId, data });
}

export function fail(c: Context, httpStatus: number, code: number, msg: string, requestId: string) {
  return c.json({ code, msg, requestId, data: null }, httpStatus as 400);
}

export type PageParams = { page: number; pageSize: number };

export function parsePage(c: Context, requestId: string): PageParams | Response {
  const raw = { page: c.req.query('page'), pageSize: c.req.query('pageSize') };
  const page = raw.page === undefined ? 1 : Number(raw.page);
  const pageSize = raw.pageSize === undefined ? 10 : Number(raw.pageSize);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    return fail(c, 400, ERR.FIELD_INVALID, 'page 或 pageSize 非法：page>=1，1<=pageSize<=50', requestId);
  }
  return { page, pageSize };
}

export function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

export function nowMs(): number {
  return Date.now();
}
