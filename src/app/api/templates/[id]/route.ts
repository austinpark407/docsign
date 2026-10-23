import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, jsonError } from '@/lib/http';
import { getTemplate, removeTemplate, updateTemplate } from '@/lib/repo';
import { sanitizeFields } from '@/lib/validate';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const template = await getTemplate((await params).id);
  return template ? NextResponse.json(template) : jsonError('Template not found.', 404);
}

/** Save the template's name and/or field layout. */
export async function PUT(req: NextRequest, { params }: Ctx) {
  const denied = requireAdmin(req, true);
  if (denied) return denied;
  const { id } = await params;
  const template = await getTemplate(id);
  if (!template) return jsonError('Template not found.', 404);

  const body = await req.json().catch(() => null) as { name?: unknown; fields?: unknown } | null;
  const patch: Parameters<typeof updateTemplate>[1] = {};
  if (typeof body?.name === 'string') {
    const name = body.name.trim().slice(0, 120);
    if (!name) return jsonError('Template name cannot be empty.', 400);
    patch.name = name;
  }
  if (body?.fields !== undefined) {
    const fields = sanitizeFields(body.fields, template.pages);
    if (typeof fields === 'string') return jsonError(fields, 400);
    patch.fields = fields;
  }
  return NextResponse.json(await updateTemplate(id, patch));
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const denied = requireAdmin(req, true);
  if (denied) return denied;
  await removeTemplate((await params).id);
  return NextResponse.json({ ok: true });
}
