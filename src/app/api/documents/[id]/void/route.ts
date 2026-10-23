import { NextRequest, NextResponse } from 'next/server';
import { jsonError, requireAdmin } from '@/lib/http';
import { voidDocument } from '@/lib/repo';

/** Cancels a sent document; its signing link stops working. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(req, true);
  if (denied) return denied;
  const ok = await voidDocument((await params).id);
  return ok ? NextResponse.json({ ok: true }) : jsonError('Only documents waiting for a signature can be voided.', 409);
}
