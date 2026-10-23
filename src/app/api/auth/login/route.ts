import { NextRequest, NextResponse } from 'next/server';
import { checkPassword, createSession } from '@/lib/session';
import { checkRateLimit, resetRateLimit } from '@/lib/ratelimit';
import { clientIp, isSameOrigin, jsonError } from '@/lib/http';

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError('Forbidden', 403);
  const ip = clientIp(req);
  const limit = checkRateLimit(`login:${ip}`);
  if (!limit.allowed) {
    const minutes = Math.ceil((limit.resetAt - Date.now()) / 60000);
    return jsonError(`Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`, 429);
  }
  const body = await req.json().catch(() => ({}));
  if (!checkPassword(body?.password)) {
    return jsonError('Incorrect password.', 401);
  }
  resetRateLimit(`login:${ip}`);
  await createSession();
  return NextResponse.json({ ok: true });
}
