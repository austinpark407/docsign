import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import crypto from 'crypto';

const SESSION_COOKIE = 'docsign_session';
const MAX_AGE = 60 * 60 * 12; // 12 hours

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET must be set to a random string of at least 32 characters.');
  }
  return s;
}

function mac(value: string): string {
  return crypto.createHmac('sha256', secret()).update(value).digest('hex');
}

function sign(value: string): string {
  return `${value}.${mac(value)}`;
}

/** Returns true when the cookie value carries a valid, unexpired signature. */
function isValid(token: string | undefined): boolean {
  if (!token) return false;
  const lastDot = token.lastIndexOf('.');
  if (lastDot < 0) return false;
  const value = token.slice(0, lastDot);
  const given = Buffer.from(token.slice(lastDot + 1), 'hex');
  const expected = Buffer.from(mac(value), 'hex');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return false;
  const [kind, ts] = value.split(':');
  if (kind !== 'admin') return false;
  return Date.now() - Number(ts) <= MAX_AGE * 1000;
}

export async function createSession(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, sign(`admin:${Date.now()}`), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE,
    path: '/',
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return isValid(store.get(SESSION_COOKIE)?.value);
}

export function isAuthenticatedRequest(req: NextRequest): boolean {
  return isValid(req.cookies.get(SESSION_COOKIE)?.value);
}

/** Constant-time password check against ADMIN_PASSWORD. */
export function checkPassword(input: unknown): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new Error('ADMIN_PASSWORD is not set.');
  const a = crypto.createHash('sha256').update(String(input ?? '')).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}
