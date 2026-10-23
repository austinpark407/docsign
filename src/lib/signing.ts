import { NextResponse } from 'next/server';
import { DocumentRecord, getDocumentByToken } from './repo';
import { isLinkExpired } from './documents';
import { jsonError } from './http';

/**
 * Loads the document behind a signing link and checks it can still be signed.
 * Returns the document, or a ready-to-send error response.
 */
export async function loadSignable(token: string): Promise<DocumentRecord | NextResponse> {
  const doc = await getDocumentByToken(token);
  if (!doc) return jsonError('This signing link is not valid. Ask the sender for a new one.', 404);
  if (doc.status === 'signed') return NextResponse.json({ error: 'This document has already been signed.', signed: true }, { status: 410 });
  if (doc.status === 'voided') return jsonError('The sender cancelled this document.', 410);
  if (doc.status !== 'sent' && doc.status !== 'viewed') return jsonError('This document is not ready to sign.', 404);
  if (isLinkExpired(doc)) return jsonError('This signing link has expired. Ask the sender to send a new one.', 410);
  return doc;
}
