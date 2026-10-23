import crypto from 'crypto';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { AuditEvent, Field, FieldValues, PageBox } from './types';

export const MAX_TEMPLATE_BYTES = 4 * 1024 * 1024;  // Vercel caps request bodies at 4.5 MB
export const MAX_TEMPLATE_PAGES = 100;

const INK = rgb(0.06, 0.06, 0.08);

export function sha256(bytes: Uint8Array): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/**
 * Validates an uploaded template and measures its pages. Returns the page
 * boxes, or a human-readable reason the file can't be used.
 */
export async function inspectTemplate(bytes: Uint8Array): Promise<PageBox[] | string> {
  if (bytes.length > MAX_TEMPLATE_BYTES) return 'PDF is too large (max 4 MB).';
  if (Buffer.from(bytes.subarray(0, 5)).toString('latin1') !== '%PDF-') return 'That file is not a PDF.';
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (/encrypt/i.test(msg)) return 'This PDF is password-protected or encrypted. Remove the protection and upload it again.';
    return 'This PDF could not be read. Try re-saving it with "Print to PDF".';
  }
  const pages = doc.getPages();
  if (pages.length === 0) return 'This PDF has no pages.';
  if (pages.length > MAX_TEMPLATE_PAGES) return `This PDF has more than ${MAX_TEMPLATE_PAGES} pages.`;
  const boxes: PageBox[] = [];
  for (const [i, page] of pages.entries()) {
    if (page.getRotation().angle % 360 !== 0) {
      return `Page ${i + 1} is rotated. Re-save the PDF with "Print to PDF" so pages are upright, then upload it again.`;
    }
    const box = page.getCropBox();
    boxes.push({ width: box.width, height: box.height, ox: box.x, oy: box.y });
  }
  return boxes;
}

// ── Text helpers ───────────────────────────────────────────────────────────────

/** Standard fonts use WinAnsi encoding; drop characters they cannot draw (emoji, CJK, …). */
export function winAnsiSafe(text: string, font: PDFFont): string {
  let out = '';
  for (const ch of text.replace(/\t/g, '    ').replace(/\r\n?/g, '\n')) {
    if (ch === '\n') { out += ch; continue; }
    try {
      font.encodeText(ch);
      font.widthOfTextAtSize(ch, 10);
      out += ch;
    } catch { /* unsupported glyph */ }
  }
  return out;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      const candidate = line + word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || line === '') {
        // A single word wider than the box gets hard-broken.
        if (font.widthOfTextAtSize(candidate, size) > maxWidth && line === '') {
          let chunk = '';
          for (const ch of word) {
            if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth && chunk) { lines.push(chunk); chunk = ''; }
            chunk += ch;
          }
          line = chunk;
        } else {
          line = candidate;
        }
      } else {
        lines.push(line.trimEnd());
        line = word.trimStart();
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

function drawSingleLine(page: PDFPage, text: string, font: PDFFont, f: Field, x: number, y: number) {
  const pad = 2;
  const maxW = f.width - pad * 2;
  let size = Math.min(f.fontSize, f.height * 0.85);
  while (size > 6 && font.widthOfTextAtSize(text, size) > maxW) size -= 0.5;
  let shown = text;
  if (font.widthOfTextAtSize(shown, size) > maxW) {
    while (shown && font.widthOfTextAtSize(shown + '…', size) > maxW) shown = shown.slice(0, -1);
    shown += '…';
  }
  page.drawText(shown, { x: x + pad, y: y + f.height / 2 - size * 0.35, size, font, color: INK });
}

function drawMultiline(page: PDFPage, text: string, font: PDFFont, f: Field, x: number, y: number) {
  const pad = 2;
  const maxW = f.width - pad * 2;
  let size = f.fontSize;
  let lines = wrap(text, font, size, maxW);
  while (size > 6 && lines.length * size * 1.2 > f.height - pad * 2) {
    size -= 0.5;
    lines = wrap(text, font, size, maxW);
  }
  const step = size * 1.2;
  const maxLines = Math.max(1, Math.floor((f.height - pad * 2) / step));
  lines.slice(0, maxLines).forEach((line, i) => {
    page.drawText(line, { x: x + pad, y: y + f.height - pad - size * 0.85 - i * step, size, font, color: INK });
  });
}

async function drawImage(doc: PDFDocument, page: PDFPage, dataUrl: string, f: Field, x: number, y: number) {
  const [header, b64] = dataUrl.split(',');
  // Copy into a standalone Uint8Array: pdf-lib's decoders ignore byteOffset on pooled Node Buffers.
  const bytes = new Uint8Array(Buffer.from(b64, 'base64'));
  const image = header.includes('image/jpeg') ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
  const dims = image.scaleToFit(f.width - 2, f.height - 2);
  page.drawImage(image, {
    x: x + (f.width - dims.width) / 2,
    y: y + (f.height - dims.height) / 2,
    width: dims.width,
    height: dims.height,
  });
}

function drawCheck(page: PDFPage, f: Field, x: number, y: number) {
  const s = Math.min(f.width, f.height);
  const ox = x + (f.width - s) / 2;
  const oy = y + (f.height - s) / 2;
  const t = Math.max(1, s / 8);
  page.drawLine({ start: { x: ox + s * 0.18, y: oy + s * 0.5 }, end: { x: ox + s * 0.42, y: oy + s * 0.22 }, thickness: t, color: INK });
  page.drawLine({ start: { x: ox + s * 0.42, y: oy + s * 0.22 }, end: { x: ox + s * 0.85, y: oy + s * 0.82 }, thickness: t, color: INK });
}

/**
 * Draws values for the given fields as flat page content (no form fields, so
 * nothing stays editable). Fields marked `cover` get a white box first when
 * `paintCovers` is set, hiding the template's own printing beneath them.
 */
async function drawFields(
  doc: PDFDocument,
  boxes: PageBox[],
  fields: Field[],
  values: FieldValues,
  { paintCovers }: { paintCovers: boolean },
): Promise<void> {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  for (const f of fields) {
    const page = pages[f.page - 1];
    const box = boxes[f.page - 1];
    if (!page || !box) continue;
    const x = box.ox + f.x;
    const y = box.oy + f.y;

    if (paintCovers && f.cover) {
      page.drawRectangle({ x, y, width: f.width, height: f.height, color: rgb(1, 1, 1) });
    }
    const value = values[f.id];
    if (!value) continue;

    if (f.type === 'signature' || f.type === 'initials') {
      await drawImage(doc, page, value, f, x, y);
    } else if (f.type === 'checkbox') {
      if (value === 'true') drawCheck(page, f, x, y);
    } else {
      const text = winAnsiSafe(value, font);
      if (!text.trim()) continue;
      if (f.multiline) drawMultiline(page, text, font, f, x, y);
      else drawSingleLine(page, text.replace(/\n/g, ' '), font, f, x, y);
    }
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Builds the PDF that goes to the signer: the template with every cover box
 * and every sender value drawn in. Signer fields stay blank; the signing page
 * overlays them.
 */
export async function renderSentPdf(
  templatePdf: Uint8Array,
  boxes: PageBox[],
  fields: Field[],
  senderValues: FieldValues,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(templatePdf);
  // Cover boxes for every field first, then sender values on top.
  await drawFields(doc, boxes, fields.filter(f => f.cover), {}, { paintCovers: true });
  await drawFields(doc, boxes, fields.filter(f => f.role === 'sender'), senderValues, { paintCovers: false });
  // Drop the template's own form fields so nothing stays editable.
  try { doc.getForm().flatten(); } catch { /* no form */ }
  return doc.save();
}

export interface CertificateInfo {
  title: string;
  documentId: string;
  orgName: string;
  signerName: string;
  signerEmail: string;
  sentSha256: string;
  events: AuditEvent[];
}

/**
 * Builds the final record: the exact sent PDF with the signer's values drawn
 * in, plus a signing certificate page with the audit trail.
 */
export async function renderSignedPdf(
  sentPdf: Uint8Array,
  boxes: PageBox[],
  fields: Field[],
  signerValues: FieldValues,
  certificate: CertificateInfo,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(sentPdf);
  await drawFields(doc, boxes, fields.filter(f => f.role === 'signer'), signerValues, { paintCovers: false });
  await appendCertificate(doc, certificate);
  doc.setTitle(certificate.title);
  doc.setProducer('docsign');
  return doc.save();
}

const EVENT_LABELS: Record<AuditEvent['event'], string> = {
  created: 'Created',
  sent: 'Sent for signature',
  reminded: 'Reminder sent',
  viewed: 'Opened by signer',
  signed: 'Signed',
  voided: 'Voided',
};

async function appendCertificate(doc: PDFDocument, info: CertificateInfo): Promise<void> {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 54;
  let page = doc.addPage([W, H]);
  let y = H - M;
  const gray = rgb(0.4, 0.4, 0.45);
  const rule = () => {
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: rgb(0.8, 0.8, 0.84) });
  };
  const text = (s: string, opts: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; x?: number } = {}) => {
    const size = opts.size ?? 10;
    const f = opts.f ?? font;
    for (const line of wrap(winAnsiSafe(s, f), f, size, W - M - (opts.x ?? M))) {
      if (y < M + 20) { page = doc.addPage([W, H]); y = H - M; }
      page.drawText(line, { x: opts.x ?? M, y, size, font: f, color: opts.color ?? INK });
      y -= size * 1.45;
    }
  };

  text('Signing Certificate', { size: 18, f: bold });
  y -= 4;
  text(`Issued by ${info.orgName} using docsign`, { color: gray });
  y -= 8; rule(); y -= 18;

  const row = (label: string, value: string) => {
    const before = y;
    text(label, { f: bold, size: 9, color: gray });
    y = before;
    text(value, { x: M + 120 });
  };
  row('Document', info.title);
  row('Document ID', info.documentId);
  row('Signer', `${info.signerName} <${info.signerEmail}>`);
  row('Sent PDF SHA-256', info.sentSha256);
  y -= 6; rule(); y -= 18;

  text('Activity', { size: 12, f: bold });
  y -= 2;
  for (const e of info.events) {
    const when = new Date(e.at).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
    text(`${when}   ${EVENT_LABELS[e.event]}${e.detail ? ` (${e.detail})` : ''}`, { f: bold, size: 9.5 });
    if (e.ip || e.userAgent) {
      text(`IP ${e.ip ?? 'unknown'}${e.userAgent ? `   ·   ${e.userAgent.slice(0, 160)}` : ''}`, { size: 8, color: gray, x: M + 12 });
    }
    y -= 4;
  }

  y -= 8; rule(); y -= 16;
  text(
    'The signer agreed to sign electronically. Their signature, name and the signing date were applied to the '
    + 'document exactly as sent. This page was generated when the document was signed.',
    { size: 8.5, color: gray },
  );
  // Subtle page marker so a printed certificate is still identifiable.
  page.drawText('docsign', { x: W - M - 40, y: M - 24, size: 8, font, color: gray });
}
