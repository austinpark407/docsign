import { NextRequest } from 'next/server';
import { getDocumentByToken, getFile } from '@/lib/repo';
import { jsonError, pdfResponse } from '@/lib/http';
import { fileName } from '@/lib/documents';

/** Lets the signer download their completed copy from the same link. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const doc = await getDocumentByToken((await params).token);
  if (!doc || doc.status !== 'signed') return jsonError('Signed copy not available.', 404);
  const file = await getFile(doc.id, 'signed');
  return file ? pdfResponse(file.pdf, fileName(doc.title, 'signed'), false) : jsonError('Signed copy not available.', 404);
}
