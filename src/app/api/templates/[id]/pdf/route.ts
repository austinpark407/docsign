import { NextRequest } from 'next/server';
import { requireAdmin, jsonError, pdfResponse } from '@/lib/http';
import { getTemplatePdf } from '@/lib/repo';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const pdf = await getTemplatePdf((await params).id);
  return pdf ? pdfResponse(pdf, 'template') : jsonError('Template not found.', 404);
}
