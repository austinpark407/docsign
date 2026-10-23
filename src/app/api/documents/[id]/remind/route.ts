import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { jsonError, requireAdmin } from '@/lib/http';
import { claimReminder, getDocument } from '@/lib/repo';
import { emailConfigured, sendInvitation, signingUrl } from '@/lib/email';
import { isLinkExpired } from '@/lib/documents';

/**
 * Re-sends the invitation. Body { renew: true } issues a fresh link (resetting
 * expiry); required once the current link has expired.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(req, true);
  if (denied) return denied;
  const { id } = await params;
  const doc = await getDocument(id);
  if (!doc) return jsonError('Document not found.', 404);
  if (doc.status !== 'sent' && doc.status !== 'viewed') return jsonError('This document is not waiting for a signature.', 409);

  const body = await req.json().catch(() => ({})) as { renew?: unknown };
  const renew = body.renew === true;
  if (!renew && isLinkExpired(doc)) return jsonError('The signing link has expired. Renew it to send a new one.', 400);
  if (!renew && !emailConfigured()) return jsonError('Email is not configured. Copy the signing link and send it yourself.', 400);

  const token = renew ? crypto.randomBytes(32).toString('hex') : doc.signingToken!;
  if (!(await claimReminder(id, renew ? token : undefined))) {
    return jsonError('A reminder was just sent. Wait a minute before sending another.', 429);
  }
  let emailed = false;
  if (emailConfigured()) {
    try {
      await sendInvitation({ to: doc.signerEmail, name: doc.signerName, title: doc.title, message: doc.message, token, reminder: true });
      emailed = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[remind] email failed:', msg);
      return jsonError(renew
        ? `A new link was created but the email failed (${msg}). Copy the link from this page instead.`
        : `The reminder email failed: ${msg}`, 502);
    }
  }
  return NextResponse.json({ ok: true, emailed, signingLink: signingUrl(token) });
}
