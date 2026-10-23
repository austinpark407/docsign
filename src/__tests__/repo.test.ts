/**
 * Database lifecycle test. Runs only when TEST_DATABASE_URL points at a
 * disposable PostgreSQL database, e.g.
 *   TEST_DATABASE_URL=postgres://localhost:5432/docsign_test npm test
 */
import { randomBytes } from 'crypto';
import { inspectTemplate, renderSentPdf, sha256 } from '@/lib/pdf';
import { PageBox } from '@/lib/types';
import { PNG_DATA_URL, field, makeTemplatePdf } from './helpers';

const url = process.env.TEST_DATABASE_URL;
const maybe = url ? describe : describe.skip;

maybe('document lifecycle (PostgreSQL)', () => {
  let repo: typeof import('@/lib/repo');

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    repo = await import('@/lib/repo');
  });

  afterAll(async () => {
    await (await import('@/lib/db')).closeDb();
  });

  it('runs draft → sent → viewed → signed exactly once', async () => {
    const pdf = await makeTemplatePdf();
    const pages = await inspectTemplate(pdf) as PageBox[];
    const template = await repo.createTemplate('Lifecycle test', pdf, pages);
    const fields = [
      field({ id: 'price', type: 'text', role: 'sender', defaultValue: '$100' }),
      field({ id: 'sig', type: 'signature', role: 'signer', y: 300, height: 40 }),
    ];
    const saved = await repo.updateTemplate(template.id, { fields });
    expect(saved?.fields).toHaveLength(2);

    const doc = await repo.createDocument(saved!, 'Test agreement', 30);
    expect(doc.senderValues).toEqual({ price: '$100' });
    expect(await repo.updateDraft(doc.id, { signerName: 'Pat', signerEmail: 'pat@example.com' })).toMatchObject({ signerName: 'Pat' });

    const sentPdf = await renderSentPdf(pdf, pages, fields, doc.senderValues);
    const token = randomBytes(32).toString('hex');
    const send = { id: doc.id, token, fields, pages, senderValues: doc.senderValues, pdf: sentPdf, sha256: sha256(sentPdf), ip: '1.1.1.1', userAgent: 'jest' };
    expect(await repo.markSent(send)).toBe(true);
    expect(await repo.markSent(send)).toBe(false);
    expect(await repo.updateDraft(doc.id, { title: 'changed' })).toBeNull();

    const byToken = await repo.getDocumentByToken(token);
    expect(byToken?.fieldSnapshot).toHaveLength(2);
    expect((await repo.getFile(doc.id, 'sent'))?.sha256).toBe(sha256(sentPdf));

    await repo.markViewed(doc.id, '2.2.2.2', 'jest');
    expect((await repo.getDocument(doc.id))?.status).toBe('viewed');

    expect(await repo.claimReminder(doc.id)).toBe(true);
    expect(await repo.claimReminder(doc.id)).toBe(false); // throttled

    const signed = { id: doc.id, signerValues: { sig: PNG_DATA_URL }, signedAt: new Date(), pdf: sentPdf, sha256: 'x', ip: '3.3.3.3', userAgent: 'jest' };
    expect(await repo.markSigned(signed)).toBe(true);
    expect(await repo.markSigned(signed)).toBe(false);
    expect(await repo.voidDocument(doc.id)).toBe(false);

    const events = (await repo.listAudit(doc.id)).map(e => e.event);
    expect(events).toEqual(['created', 'sent', 'viewed', 'reminded', 'signed']);

    // A used template is archived, not deleted.
    await repo.removeTemplate(template.id);
    expect(await repo.getTemplate(template.id)).toBeNull();
    expect(await repo.getTemplatePdf(template.id)).not.toBeNull();
  });

  it('reverts a failed send back to an editable draft', async () => {
    const pdf = await makeTemplatePdf();
    const pages = await inspectTemplate(pdf) as PageBox[];
    const template = await repo.createTemplate('Revert test', pdf, pages);
    const doc = await repo.createDocument(template, 'Revert', 30);
    await repo.markSent({ id: doc.id, token: randomBytes(32).toString('hex'), fields: [], pages, senderValues: {}, pdf, sha256: 'y', ip: '', userAgent: '' });
    await repo.revertSend(doc.id);
    const after = await repo.getDocument(doc.id);
    expect(after?.status).toBe('draft');
    expect(after?.signingToken).toBeNull();
    expect(await repo.getFile(doc.id, 'sent')).toBeNull();
    expect(await repo.deleteDraft(doc.id)).toBe(true);
    await repo.removeTemplate(template.id);
  });
});
