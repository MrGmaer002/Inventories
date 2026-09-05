import { randomUUID } from 'node:crypto';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { toIsoDate } from '../../shared/src/index.ts';
export { toIsoDate };

/** Prefix + uuid slug, e.g. itm_9f3a… */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function toIsoNow(): string {
  return new Date().toISOString();
}

/** Local date YYYY-MM-DD */
export function todayLocal(): string {
  return toIsoDate(new Date());
}

/** Local time HH:mm (24h) */
export function timeLocal(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Password hashing (scrypt) — never store plain text
// ---------------------------------------------------------------------------

const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEY_LEN).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, KEY_LEN);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
