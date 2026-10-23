import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { clientIp, jsonError, requireAdmin } from '@/lib/http';
import { getDocument, getTemplate, getTemplatePdf, markSent, revertSend } from '@/lib/repo';
import { renderSentPdf, sha256 } from '@/lib/pdf';
import { isEmail, validateValues } from '@/lib/validate';
import { emailConfigured, sendInvitation, signingUrl } from '@/lib/email';
import { formatSigningDate } from '@/lib/documents';

/**
 * Freezes the draft and invites the signer. With email configured the link is
 * emailed; otherwise it is returned for the sender to share.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(req, true);
  if (denied) return denied;
  const { id } = await params;
  const doc = await getDocument(id);
  if (!doc) return jsonError('Document not found.', 404);
  if (doc.status !== 'draft') return jsonError('This document has already been sent.', 409);
  if (!doc.signerName.trim()) return jsonError("Enter the signer's name.", 400);
  if (!isEmail(doc.signerEmail)) return jsonError("Enter a valid email address for the signer.", 400);

  const [template, templatePdf] = await Promise.all([getTemplate(doc.templateId), getTemplatePdf(doc.templateId)]);
  if (!template || !templatePdf) return jsonError('The template for this document no longer exists.', 404);
  if (!template.fields.some(f => f.role === 'signer')) {
    return jsonError('The template has no signer fields. Open the template and add at least a signature field for the signer.', 400);
  }

  const body = await req.json().catch(() => ({})) as { timeZone?: unknown };
  const values = { ...doc.senderValues };
  // Sender date fields left blank get today's date.
  for (const f of template.fields) {
    if (f.role === 'sender' && f.type === 'date' && !values[f.id]) values[f.id] = formatSigningDate(new Date(), body.timeZone);
  }
  const checked = validateValues(template.fields, 'sender', values, { requireAll: true });
  if (typeof checked === 'string') return jsonError(checked, 400);

  const pdf = await renderSentPdf(templatePdf, template.pages, template.fields, checked);
  const token = crypto.randomBytes(32).toString('hex');
  const sent = await markSent({
    id, token, fields: template.fields, pages: template.pages, senderValues: checked,
    pdf, sha256: sha256(pdf), ip: clientIp(req), userAgent: req.headers.get('user-agent') ?? '',
  });
  if (!sent) return jsonError('This document has already been sent.', 409);

  let emailed = false;
  if (emailConfigured()) {
    try {
      await sendInvitation({ to: doc.signerEmail, name: doc.signerName, title: doc.title, message: doc.message, token });
      emailed = true;
    } catch (err) {
      await revertSend(id);
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[send] invitation email failed:', msg);
      return jsonError(`The email could not be sent (${msg}). The document is still a draft.`, 502);
    }
  }
  return NextResponse.json({ ok: true, emailed, signingLink: signingUrl(token) });
}
