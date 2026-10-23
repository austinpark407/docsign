import { NextRequest, NextResponse } from 'next/server';
import { loadSignable } from '@/lib/signing';
import { markViewed } from '@/lib/repo';
import { clientIp } from '@/lib/http';

/** Records that the signer opened the document (first time only). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const doc = await loadSignable((await params).token);
  if (doc instanceof NextResponse) return doc;
  await markViewed(doc.id, clientIp(req), req.headers.get('user-agent') ?? '');
  return NextResponse.json({ ok: true });
}
