import { NextRequest } from 'next/server';
import { requireAdmin, jsonError, pdfResponse } from '@/lib/http';
import { getDocument, getFile } from '@/lib/repo';
import { fileName } from '@/lib/documents';

/** Signed PDF when complete, otherwise the sent copy. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const doc = await getDocument((await params).id);
  if (!doc) return jsonError('Document not found.', 404);
  const signed = await getFile(doc.id, 'signed');
  if (signed) return pdfResponse(signed.pdf, fileName(doc.title, 'signed'), false);
  const sent = await getFile(doc.id, 'sent');
  if (sent) return pdfResponse(sent.pdf, fileName(doc.title, 'sent'), false);
  return jsonError('Nothing to download yet. Use Preview for drafts.', 404);
}
