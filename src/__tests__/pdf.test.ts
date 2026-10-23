import { PDFDict, PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import { inspectTemplate, renderSentPdf, renderSignedPdf, winAnsiSafe } from '@/lib/pdf';
import { PageBox } from '@/lib/types';
import { PNG_DATA_URL, field, makeTemplatePdf } from './helpers';

function imageCount(doc: PDFDocument, pageIndex: number): number {
  const xobj = doc.getPages()[pageIndex].node.Resources()?.lookup(PDFName.of('XObject'));
  return xobj instanceof PDFDict ? xobj.keys().length : 0;
}

describe('inspectTemplate', () => {
  it('measures pages, including crop box offsets', async () => {
    const boxes = await inspectTemplate(await makeTemplatePdf({ cropOffset: true })) as PageBox[];
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toEqual({ width: 572, height: 732, ox: 20, oy: 30 });
    expect(boxes[1]).toEqual({ width: 612, height: 792, ox: 0, oy: 0 });
  });

  it('rejects files that are not PDFs', async () => {
    expect(await inspectTemplate(new TextEncoder().encode('hello'))).toMatch(/not a PDF/);
  });

  it('rejects rotated pages', async () => {
    expect(await inspectTemplate(await makeTemplatePdf({ rotateSecondPage: true }))).toMatch(/Page 2 is rotated/);
  });
});

describe('winAnsiSafe', () => {
  it('drops characters standard fonts cannot draw and expands tabs', async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    expect(winAnsiSafe('Price\t$5 ✅ “ok” 你好', font)).toBe('Price    $5  “ok” ');
  });
});

describe('render pipeline', () => {
  const fields = [
    field({ id: 'scope', type: 'text', role: 'sender', multiline: true, height: 80, cover: true }),
    field({ id: 'price', type: 'text', role: 'sender', y: 200 }),
    field({ id: 'sender-sig', type: 'signature', role: 'sender', y: 250, height: 40 }),
    field({ id: 'agree', type: 'checkbox', role: 'signer', page: 2, width: 14, height: 14 }),
    field({ id: 'signer-sig', type: 'signature', role: 'signer', page: 2, y: 300, height: 40 }),
    field({ id: 'signed-on', type: 'date', role: 'signer', page: 2, y: 360 }),
  ];

  it('draws sender values into the sent PDF and leaves no form fields', async () => {
    const template = await makeTemplatePdf();
    const boxes = await inspectTemplate(template) as PageBox[];
    const sent = await renderSentPdf(template, boxes, fields, {
      scope: 'Drill a well 🚰\nInstall pump\tand tank',
      price: '$12,000',
      'sender-sig': PNG_DATA_URL,
    });
    const doc = await PDFDocument.load(sent);
    expect(doc.getPageCount()).toBe(2);
    expect(imageCount(doc, 0)).toBe(1);
    expect(imageCount(doc, 1)).toBe(0);
    expect(doc.getForm().getFields()).toHaveLength(0);
  });

  it('builds the signed PDF from the sent bytes and appends a certificate page', async () => {
    const template = await makeTemplatePdf();
    const boxes = await inspectTemplate(template) as PageBox[];
    const sent = await renderSentPdf(template, boxes, fields, { price: '$1' });
    const signed = await renderSignedPdf(sent, boxes, fields, {
      agree: 'true', 'signer-sig': PNG_DATA_URL, 'signed-on': 'October 23, 2026',
    }, {
      title: 'Well agreement', documentId: 'doc-1', orgName: 'Acme', signerName: 'Pat Doe',
      signerEmail: 'pat@example.com', sentSha256: 'abc',
      events: [
        { event: 'sent', at: '2026-10-23T10:00:00Z', ip: '1.2.3.4', userAgent: 'Mozilla/5.0', detail: null },
        { event: 'signed', at: '2026-10-23T11:00:00Z', ip: '1.2.3.4', userAgent: 'Mozilla/5.0', detail: null },
      ],
    });
    const doc = await PDFDocument.load(signed);
    expect(doc.getPageCount()).toBe(3);
    expect(imageCount(doc, 1)).toBe(1);
    expect(doc.getTitle()).toBe('Well agreement');
  });
});
