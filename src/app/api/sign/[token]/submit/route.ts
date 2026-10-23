import { NextRequest, NextResponse } from 'next/server';
import { loadSignable } from '@/lib/signing';
import { getFile, listAudit, markSigned } from '@/lib/repo';
import { clientIp, isSameOrigin, jsonError } from '@/lib/http';
import { renderSignedPdf, sha256 } from '@/lib/pdf';
import { validateValues } from '@/lib/validate';
import { fileName, formatSigningDate } from '@/lib/documents';
import { emailConfigured, sendCompleted } from '@/lib/email';
import { config } from '@/lib/config';

/**
 * Applies the signer's values to the frozen sent PDF, appends the signing
 * certificate, and stores the result. Body: { values, consent: true, timeZone? }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (!isSameOrigin(req)) return jsonError('Forbidden', 403);
  const doc = await loadSignable((await params).token);
  if (doc instanceof NextResponse) return doc;

  const body = await req.json().catch(() => null) as { values?: unknown; consent?: unknown; timeZone?: unknown } | null;
  if (body?.consent !== true) return jsonError('Please agree to sign electronically.', 400);

  const fields = doc.fieldSnapshot ?? [];
  const pages = doc.pageSnapshot ?? [];
  const values = validateValues(fields, 'signer', body.values, { requireAll: true });
  if (typeof values === 'string') return jsonError(values, 400);

  const signedAt = new Date();
  const dateText = formatSigningDate(signedAt, body.timeZone);
  for (const f of fields) if (f.role === 'signer' && f.type === 'date') values[f.id] = dateText;

  const sent = await getFile(doc.id, 'sent');
  if (!sent) return jsonError('Document file missing.', 500);

  const ip = clientIp(req);
  const userAgent = req.headers.get('user-agent') ?? '';
  const events = [...await listAudit(doc.id), { event: 'signed' as const, at: signedAt.toISOString(), ip, userAgent, detail: null }];
  const pdf = await renderSignedPdf(sent.pdf, pages, fields, values, {
    title: doc.title,
    documentId: doc.id,
    orgName: config.orgName,
    signerName: doc.signerName,
    signerEmail: doc.signerEmail,
    sentSha256: sent.sha256,
    events,
  });

  const ok = await markSigned({ id: doc.id, signerValues: values, signedAt, pdf, sha256: sha256(pdf), ip, userAgent });
  if (!ok) return NextResponse.json({ error: 'This document has already been signed.', signed: true }, { status: 409 });

  if (emailConfigured()) {
    const recipients = [{ to: doc.signerEmail, name: doc.signerName }];
    if (process.env.NOTIFY_EMAIL) recipients.push({ to: process.env.NOTIFY_EMAIL, name: config.orgName });
    const results = await Promise.allSettled(recipients.map(r =>
      sendCompleted({ ...r, title: doc.title, pdf, filename: fileName(doc.title, 'signed') })));
    results.forEach((r, i) => {
      if (r.status === 'rejected') console.error(`[submit] completion email to ${recipients[i].to} failed:`, r.reason);
    });
  }
  return NextResponse.json({ ok: true });
}
