import { NextRequest, NextResponse } from 'next/server';
import { loadSignable } from '@/lib/signing';
import { getFile } from '@/lib/repo';
import { jsonError, pdfResponse } from '@/lib/http';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const doc = await loadSignable((await params).token);
  if (doc instanceof NextResponse) return doc;
  const file = await getFile(doc.id, 'sent');
  return file ? pdfResponse(file.pdf, doc.title) : jsonError('Document file missing.', 404);
}
