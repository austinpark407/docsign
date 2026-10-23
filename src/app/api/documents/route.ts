import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, jsonError } from '@/lib/http';
import { createDocument, getTemplate, listDocuments } from '@/lib/repo';
import { config } from '@/lib/config';

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  return NextResponse.json(await listDocuments());
}

/** Start a draft from a template. Body: { templateId, title? } */
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req, true);
  if (denied) return denied;
  const body = await req.json().catch(() => ({})) as { templateId?: unknown; title?: unknown };
  const template = typeof body.templateId === 'string' ? await getTemplate(body.templateId) : null;
  if (!template) return jsonError('Template not found.', 404);
  const title = (typeof body.title === 'string' && body.title.trim()) || template.name;
  const doc = await createDocument(template, title.slice(0, 200), config.defaultExpiresDays);
  return NextResponse.json(doc, { status: 201 });
}
