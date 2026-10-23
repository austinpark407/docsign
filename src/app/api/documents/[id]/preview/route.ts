import { NextRequest } from 'next/server';
import { requireAdmin, jsonError, pdfResponse } from '@/lib/http';
import { getDocument, getFile, getTemplate, getTemplatePdf } from '@/lib/repo';
import { renderSentPdf } from '@/lib/pdf';

/**
 * The PDF as the signer sees it. Drafts are rendered from the current values;
 * sent documents return the frozen copy.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const doc = await getDocument((await params).id);
  if (!doc) return jsonError('Document not found.', 404);

  if (doc.status !== 'draft') {
    const file = await getFile(doc.id, 'sent');
    if (file) return pdfResponse(file.pdf, doc.title);
  }
  const [template, templatePdf] = await Promise.all([getTemplate(doc.templateId), getTemplatePdf(doc.templateId)]);
  if (!template || !templatePdf) return jsonError('Template not found.', 404);
  return pdfResponse(await renderSentPdf(templatePdf, template.pages, template.fields, doc.senderValues), doc.title);
}
