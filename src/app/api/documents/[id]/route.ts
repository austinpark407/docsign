import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, jsonError } from '@/lib/http';
import { DocumentRecord, deleteDraft, getDocument, getTemplate, listAudit, updateDraft } from '@/lib/repo';
import { SignDocument } from '@/lib/types';
import { validateValues } from '@/lib/validate';
import { emailConfigured, signingUrl } from '@/lib/email';
import { isLinkExpired, linkExpiresAt } from '@/lib/documents';

type Ctx = { params: Promise<{ id: string }> };

/** Drops the internal snapshot and token fields before sending a document to the browser. */
function toPublic(doc: DocumentRecord): SignDocument {
  return {
    id: doc.id, templateId: doc.templateId, title: doc.title, status: doc.status,
    signerName: doc.signerName, signerEmail: doc.signerEmail, message: doc.message,
    senderValues: doc.senderValues, expiresDays: doc.expiresDays, createdAt: doc.createdAt,
    sentAt: doc.sentAt, viewedAt: doc.viewedAt, signedAt: doc.signedAt, voidedAt: doc.voidedAt,
    lastReminderAt: doc.lastReminderAt, reminderCount: doc.reminderCount,
  };
}

/** Everything the document page needs: the document, its fields and pages, audit trail. */
export async function GET(req: NextRequest, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const doc = await getDocument((await params).id);
  if (!doc) return jsonError('Document not found.', 404);
  // Drafts follow the live template; sent documents use what was frozen at send.
  const template = await getTemplate(doc.templateId);
  const fields = doc.fieldSnapshot ?? template?.fields ?? [];
  const pages = doc.pageSnapshot ?? template?.pages ?? [];
  return NextResponse.json({
    document: toPublic(doc),
    templateName: template?.name ?? null,
    fields,
    pages,
    audit: await listAudit(doc.id),
    signingLink: doc.signingToken && (doc.status === 'sent' || doc.status === 'viewed') ? signingUrl(doc.signingToken) : null,
    linkExpiresAt: linkExpiresAt(doc)?.toISOString() ?? null,
    linkExpired: isLinkExpired(doc),
    emailConfigured: emailConfigured(),
  });
}

/** Edit a draft: title, signer, message, expiry, and sender field values. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = requireAdmin(req, true);
  if (denied) return denied;
  const { id } = await params;
  const doc = await getDocument(id);
  if (!doc) return jsonError('Document not found.', 404);
  if (doc.status !== 'draft') return jsonError('This document has been sent and can no longer be edited.', 409);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const patch: Parameters<typeof updateDraft>[1] = {};
  if (typeof body.title === 'string') patch.title = body.title.trim().slice(0, 200) || 'Untitled document';
  if (typeof body.signerName === 'string') patch.signerName = body.signerName.trim().slice(0, 200);
  if (typeof body.signerEmail === 'string') patch.signerEmail = body.signerEmail.trim().slice(0, 254);
  if (typeof body.message === 'string') patch.message = body.message.slice(0, 2000);
  if (body.expiresDays !== undefined) {
    const n = Math.trunc(Number(body.expiresDays));
    if (!Number.isFinite(n) || n < 0 || n > 365) return jsonError('Link expiry must be 0 to 365 days (0 = never).', 400);
    patch.expiresDays = n;
  }
  if (body.senderValues !== undefined) {
    const template = await getTemplate(doc.templateId);
    const values = validateValues(template?.fields ?? [], 'sender', body.senderValues, { requireAll: false });
    if (typeof values === 'string') return jsonError(values, 400);
    patch.senderValues = values;
  }
  const updated = await updateDraft(id, patch);
  return updated ? NextResponse.json(updated) : jsonError('This document can no longer be edited.', 409);
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const denied = requireAdmin(req, true);
  if (denied) return denied;
  const ok = await deleteDraft((await params).id);
  return ok ? NextResponse.json({ ok: true }) : jsonError('Only drafts can be deleted. Void a sent document instead.', 409);
}
