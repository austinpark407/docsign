import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticatedRequest } from './session';

export function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || req.headers.get('x-real-ip')
    || '127.0.0.1';
}

/** Rejects cross-origin state-changing requests (CSRF). */
export function isSameOrigin(req: NextRequest): boolean {
  const host = req.headers.get('host') ?? '';
  const origin = req.headers.get('origin') ?? req.headers.get('referer');
  if (!origin) return true; // non-browser client
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Guard for admin API routes. Returns an error response to send back, or null
 * when the request may proceed. Pass `mutating` for anything that changes data.
 */
export function requireAdmin(req: NextRequest, mutating = false): NextResponse | null {
  if (!isAuthenticatedRequest(req)) return jsonError('Unauthorized', 401);
  if (mutating && !isSameOrigin(req)) return jsonError('Forbidden', 403);
  return null;
}

export function pdfResponse(pdf: Uint8Array, filename: string, inline = true): NextResponse {
  const safe = filename.replace(/[^\w\- .]/g, '').trim() || 'document';
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${safe}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
