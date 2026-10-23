import crypto from 'crypto';
import { db } from './db';
import {
  AuditEvent, DocumentStatus, Field, FieldValues, PageBox, SignDocument, Template,
} from './types';

type Row = Record<string, unknown>;

const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : (v as string | null) ?? null);

export function newId(): string {
  return crypto.randomUUID();
}

// ── Templates ──────────────────────────────────────────────────────────────────

function toTemplate(r: Row): Template {
  return {
    id: r.id as string,
    name: r.name as string,
    pages: r.pages as PageBox[],
    fields: (r.fields as Field[]) ?? [],
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
  };
}

export async function createTemplate(name: string, pdf: Uint8Array, pages: PageBox[]): Promise<Template> {
  const sql = await db();
  const [row] = await sql`
    INSERT INTO templates (id, name, pdf, pages)
    VALUES (${newId()}, ${name}, ${Buffer.from(pdf)}, ${sql.json(pages as never)})
    RETURNING id, name, pages, fields, created_at, updated_at
  `;
  return toTemplate(row);
}

export async function listTemplates(): Promise<(Template & { documentCount: number })[]> {
  const sql = await db();
  const rows = await sql`
    SELECT t.id, t.name, t.pages, t.fields, t.created_at, t.updated_at,
           (SELECT COUNT(*) FROM documents d WHERE d.template_id = t.id)::int AS document_count
    FROM templates t
    WHERE NOT t.archived
    ORDER BY t.updated_at DESC
  `;
  return rows.map(r => ({ ...toTemplate(r), documentCount: r.document_count as number }));
}

export async function getTemplate(id: string): Promise<Template | null> {
  const sql = await db();
  const [row] = await sql`
    SELECT id, name, pages, fields, created_at, updated_at FROM templates WHERE id = ${id} AND NOT archived
  `;
  return row ? toTemplate(row) : null;
}

export async function getTemplatePdf(id: string): Promise<Uint8Array | null> {
  const sql = await db();
  const [row] = await sql`SELECT pdf FROM templates WHERE id = ${id}`;
  return row ? (row.pdf as Uint8Array) : null;
}

export async function updateTemplate(id: string, patch: { name?: string; fields?: Field[] }): Promise<Template | null> {
  const sql = await db();
  const [row] = await sql`
    UPDATE templates SET
      name = COALESCE(${patch.name ?? null}, name),
      fields = COALESCE(${patch.fields ? sql.json(patch.fields as never) : null}, fields),
      updated_at = NOW()
    WHERE id = ${id} AND NOT archived
    RETURNING id, name, pages, fields, created_at, updated_at
  `;
  return row ? toTemplate(row) : null;
}

/**
 * Deletes a template that was never used; archives it (hides it) otherwise,
 * because existing documents still reference its PDF.
 */
export async function removeTemplate(id: string): Promise<void> {
  const sql = await db();
  const [{ used }] = await sql`SELECT EXISTS (SELECT 1 FROM documents WHERE template_id = ${id}) AS used`;
  if (used) {
    await sql`UPDATE templates SET archived = true WHERE id = ${id}`;
  } else {
    await sql`DELETE FROM templates WHERE id = ${id}`;
  }
}

// ── Documents ──────────────────────────────────────────────────────────────────

const DOC_COLUMNS = `
  id, template_id, title, status, signer_name, signer_email, message, sender_values,
  expires_days, created_at, sent_at, viewed_at, signed_at, voided_at, last_reminder_at, reminder_count
`;

function toDocument(r: Row): SignDocument {
  return {
    id: r.id as string,
    templateId: r.template_id as string,
    title: r.title as string,
    status: r.status as DocumentStatus,
    signerName: r.signer_name as string,
    signerEmail: r.signer_email as string,
    message: r.message as string,
    senderValues: (r.sender_values as FieldValues) ?? {},
    expiresDays: r.expires_days as number,
    createdAt: iso(r.created_at)!,
    sentAt: iso(r.sent_at),
    viewedAt: iso(r.viewed_at),
    signedAt: iso(r.signed_at),
    voidedAt: iso(r.voided_at),
    lastReminderAt: iso(r.last_reminder_at),
    reminderCount: r.reminder_count as number,
  };
}

/** Internal view of a document, including what was frozen at send time. */
export interface DocumentRecord extends SignDocument {
  signingToken: string | null;
  tokenIssuedAt: string | null;
  fieldSnapshot: Field[] | null;
  pageSnapshot: PageBox[] | null;
  signerValues: FieldValues | null;
}

function toRecord(r: Row): DocumentRecord {
  return {
    ...toDocument(r),
    signingToken: (r.signing_token as string | null) ?? null,
    tokenIssuedAt: iso(r.token_issued_at),
    fieldSnapshot: (r.field_snapshot as Field[] | null) ?? null,
    pageSnapshot: (r.page_snapshot as PageBox[] | null) ?? null,
    signerValues: (r.signer_values as FieldValues | null) ?? null,
  };
}

export async function createDocument(template: Template, title: string, expiresDays: number): Promise<SignDocument> {
  const sql = await db();
  // Sender text fields start from the template's default text.
  const senderValues: FieldValues = {};
  for (const f of template.fields) {
    if (f.role === 'sender' && f.type === 'text' && f.defaultValue) senderValues[f.id] = f.defaultValue;
  }
  const id = newId();
  const [row] = await sql`
    INSERT INTO documents (id, template_id, title, sender_values, expires_days)
    VALUES (${id}, ${template.id}, ${title}, ${sql.json(senderValues)}, ${expiresDays})
    RETURNING ${sql.unsafe(DOC_COLUMNS)}
  `;
  await addAudit(id, 'created');
  return toDocument(row);
}

export async function listDocuments(): Promise<(SignDocument & { templateName: string })[]> {
  const sql = await db();
  const rows = await sql`
    SELECT ${sql.unsafe(DOC_COLUMNS.split(',').map(c => `d.${c.trim()}`).join(', '))}, t.name AS template_name
    FROM documents d JOIN templates t ON t.id = d.template_id
    ORDER BY d.created_at DESC
    LIMIT 500
  `;
  return rows.map(r => ({ ...toDocument(r), templateName: r.template_name as string }));
}

export async function getDocument(id: string): Promise<DocumentRecord | null> {
  const sql = await db();
  const [row] = await sql`SELECT * FROM documents WHERE id = ${id}`;
  return row ? toRecord(row) : null;
}

export async function getDocumentByToken(token: string): Promise<DocumentRecord | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const sql = await db();
  const [row] = await sql`SELECT * FROM documents WHERE signing_token = ${token}`;
  return row ? toRecord(row) : null;
}

/** Edits a draft. Returns null when the document is missing or no longer a draft. */
export async function updateDraft(id: string, patch: {
  title?: string;
  signerName?: string;
  signerEmail?: string;
  message?: string;
  senderValues?: FieldValues;
  expiresDays?: number;
}): Promise<SignDocument | null> {
  const sql = await db();
  const [row] = await sql`
    UPDATE documents SET
      title         = COALESCE(${patch.title ?? null}, title),
      signer_name   = COALESCE(${patch.signerName ?? null}, signer_name),
      signer_email  = COALESCE(${patch.signerEmail ?? null}, signer_email),
      message       = COALESCE(${patch.message ?? null}, message),
      sender_values = COALESCE(${patch.senderValues ? sql.json(patch.senderValues) : null}, sender_values),
      expires_days  = COALESCE(${patch.expiresDays ?? null}, expires_days)
    WHERE id = ${id} AND status = 'draft'
    RETURNING ${sql.unsafe(DOC_COLUMNS)}
  `;
  return row ? toDocument(row) : null;
}

export async function deleteDraft(id: string): Promise<boolean> {
  const sql = await db();
  const rows = await sql`DELETE FROM documents WHERE id = ${id} AND status = 'draft' RETURNING id`;
  return rows.length > 0;
}

/**
 * Freezes a draft for signing: stores the sent PDF, the field and page
 * geometry it was drawn with, and the signing token, in one transaction.
 * Returns false if the document is not a draft anymore.
 */
export async function markSent(params: {
  id: string;
  token: string;
  fields: Field[];
  pages: PageBox[];
  senderValues: FieldValues;
  pdf: Uint8Array;
  sha256: string;
  ip: string;
  userAgent: string;
}): Promise<boolean> {
  const sql = await db();
  return sql.begin(async tx => {
    const rows = await tx`
      UPDATE documents SET
        status = 'sent', sent_at = NOW(),
        signing_token = ${params.token}, token_issued_at = NOW(),
        field_snapshot = ${tx.json(params.fields as never)},
        page_snapshot = ${tx.json(params.pages as never)},
        sender_values = ${tx.json(params.senderValues)}
      WHERE id = ${params.id} AND status = 'draft'
      RETURNING id
    `;
    if (rows.length === 0) return false;
    await tx`
      INSERT INTO document_files (document_id, kind, pdf, sha256)
      VALUES (${params.id}, 'sent', ${Buffer.from(params.pdf)}, ${params.sha256})
    `;
    await tx`
      INSERT INTO audit_events (document_id, event, ip, user_agent)
      VALUES (${params.id}, 'sent', ${params.ip}, ${params.userAgent})
    `;
    return true;
  }) as Promise<boolean>;
}

/** Puts a sent document back to draft when its invitation email failed. */
export async function revertSend(id: string): Promise<void> {
  const sql = await db();
  await sql.begin(async tx => {
    await tx`DELETE FROM document_files WHERE document_id = ${id} AND kind = 'sent'`;
    await tx`DELETE FROM audit_events WHERE document_id = ${id} AND event = 'sent'`;
    await tx`
      UPDATE documents SET status = 'draft', sent_at = NULL, signing_token = NULL, token_issued_at = NULL,
        field_snapshot = NULL, page_snapshot = NULL
      WHERE id = ${id} AND status = 'sent'
    `;
  });
}

export async function markViewed(id: string, ip: string, userAgent: string): Promise<void> {
  const sql = await db();
  const rows = await sql`
    UPDATE documents SET status = 'viewed', viewed_at = NOW()
    WHERE id = ${id} AND status = 'sent'
    RETURNING id
  `;
  if (rows.length > 0) await addAudit(id, 'viewed', { ip, userAgent });
}

/**
 * Records the signature: flips status to signed, stores the final PDF and the
 * signer's values, and logs the event, atomically. Returns false if the
 * document was not awaiting a signature (already signed, voided, or a race).
 */
export async function markSigned(params: {
  id: string;
  signerValues: FieldValues;
  signedAt: Date;
  pdf: Uint8Array;
  sha256: string;
  ip: string;
  userAgent: string;
}): Promise<boolean> {
  const sql = await db();
  return sql.begin(async tx => {
    const rows = await tx`
      UPDATE documents SET status = 'signed', signed_at = ${params.signedAt},
        signer_values = ${tx.json(params.signerValues)}
      WHERE id = ${params.id} AND status IN ('sent', 'viewed')
      RETURNING id
    `;
    if (rows.length === 0) return false;
    await tx`
      INSERT INTO document_files (document_id, kind, pdf, sha256)
      VALUES (${params.id}, 'signed', ${Buffer.from(params.pdf)}, ${params.sha256})
    `;
    await tx`
      INSERT INTO audit_events (document_id, event, at, ip, user_agent)
      VALUES (${params.id}, 'signed', ${params.signedAt}, ${params.ip}, ${params.userAgent})
    `;
    return true;
  }) as Promise<boolean>;
}

export async function voidDocument(id: string): Promise<boolean> {
  const sql = await db();
  const rows = await sql`
    UPDATE documents SET status = 'voided', voided_at = NOW(), signing_token = NULL
    WHERE id = ${id} AND status IN ('sent', 'viewed')
    RETURNING id
  `;
  if (rows.length > 0) await addAudit(id, 'voided');
  return rows.length > 0;
}

/**
 * Reserves a reminder send. At most one per 60 seconds per document, and only
 * while it awaits a signature. Optionally rotates in a fresh token (renew).
 */
export async function claimReminder(id: string, newToken?: string): Promise<boolean> {
  const sql = await db();
  const rows = await sql`
    UPDATE documents SET
      last_reminder_at = NOW(),
      reminder_count = reminder_count + 1,
      signing_token = COALESCE(${newToken ?? null}, signing_token),
      token_issued_at = CASE WHEN ${newToken ?? null}::text IS NULL THEN token_issued_at ELSE NOW() END
    WHERE id = ${id} AND status IN ('sent', 'viewed')
      AND (last_reminder_at IS NULL OR last_reminder_at < NOW() - INTERVAL '60 seconds')
    RETURNING id
  `;
  if (rows.length > 0) await addAudit(id, 'reminded', { detail: newToken ? 'new link issued' : null });
  return rows.length > 0;
}

export async function getFile(documentId: string, kind: 'sent' | 'signed'): Promise<{ pdf: Uint8Array; sha256: string } | null> {
  const sql = await db();
  const [row] = await sql`SELECT pdf, sha256 FROM document_files WHERE document_id = ${documentId} AND kind = ${kind}`;
  return row ? { pdf: row.pdf as Uint8Array, sha256: row.sha256 as string } : null;
}

// ── Audit trail ────────────────────────────────────────────────────────────────

export async function addAudit(
  documentId: string,
  event: AuditEvent['event'],
  extra: { ip?: string; userAgent?: string; detail?: string | null } = {},
): Promise<void> {
  const sql = await db();
  await sql`
    INSERT INTO audit_events (document_id, event, ip, user_agent, detail)
    VALUES (${documentId}, ${event}, ${extra.ip ?? null}, ${extra.userAgent ?? null}, ${extra.detail ?? null})
  `;
}

export async function listAudit(documentId: string): Promise<AuditEvent[]> {
  const sql = await db();
  const rows = await sql`
    SELECT event, at, ip, user_agent, detail FROM audit_events
    WHERE document_id = ${documentId}
    -- Insertion order: 'signed' is stamped with the app server's clock and the
    -- rest with the database's, so ordering by time could misorder close events.
    ORDER BY id ASC
  `;
  return rows.map(r => ({
    event: r.event as AuditEvent['event'],
    at: iso(r.at)!,
    ip: (r.ip as string | null) ?? null,
    userAgent: (r.user_agent as string | null) ?? null,
    detail: (r.detail as string | null) ?? null,
  }));
}
