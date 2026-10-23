import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, jsonError } from '@/lib/http';
import { createTemplate, listTemplates } from '@/lib/repo';
import { inspectTemplate, MAX_TEMPLATE_BYTES } from '@/lib/pdf';

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  return NextResponse.json(await listTemplates());
}

/** Upload a PDF as a new template (multipart form: `file`, optional `name`). */
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req, true);
  if (denied) return denied;

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return jsonError('Choose a PDF file to upload.', 400);
  if (file.size > MAX_TEMPLATE_BYTES) return jsonError('PDF is too large (max 4 MB).', 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const pages = await inspectTemplate(bytes);
  if (typeof pages === 'string') return jsonError(pages, 400);

  const rawName = String(form?.get('name') || file.name || 'Untitled template');
  const name = rawName.replace(/\.pdf$/i, '').trim().slice(0, 120) || 'Untitled template';
  const template = await createTemplate(name, bytes, pages);
  return NextResponse.json(template, { status: 201 });
}
