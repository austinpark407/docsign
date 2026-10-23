import { NextRequest, NextResponse } from 'next/server';
import { loadSignable } from '@/lib/signing';
import { config } from '@/lib/config';

/** Public: what the signer needs to render the signing page. No sender values. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const doc = await loadSignable((await params).token);
  if (doc instanceof NextResponse) return doc;
  return NextResponse.json({
    title: doc.title,
    orgName: config.orgName,
    signerName: doc.signerName,
    message: doc.message,
    pages: doc.pageSnapshot ?? [],
    // Sender fields are already printed in the PDF; only their boxes matter for layout.
    fields: (doc.fieldSnapshot ?? []).map(f => (f.role === 'signer' ? f : { ...f, defaultValue: '' })),
  });
}
