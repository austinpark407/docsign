import { sanitizeFields, validateImageDataUrl, validateValues } from '@/lib/validate';
import { PNG_DATA_URL, field } from './helpers';

const pages = [{ width: 612, height: 792, ox: 0, oy: 0 }];

describe('sanitizeFields', () => {
  it('clamps geometry onto the page and fills defaults', () => {
    const out = sanitizeFields([{ id: 'a', type: 'text', role: 'signer', page: 1, x: 900, y: -5, width: 100, height: 20 }], pages);
    expect(Array.isArray(out) && out[0]).toMatchObject({ x: 512, y: 0, label: 'Text', fontSize: 11, required: true });
  });

  it('rejects unknown types, missing pages and duplicate ids', () => {
    expect(sanitizeFields([{ id: 'a', type: 'video', role: 'signer' }], pages)).toMatch(/Unknown field type/);
    expect(sanitizeFields([{ id: 'a', type: 'text', role: 'signer', page: 3 }], pages)).toMatch(/does not exist/);
    expect(sanitizeFields([
      { id: 'a', type: 'text', role: 'signer', page: 1 },
      { id: 'a', type: 'text', role: 'signer', page: 1 },
    ], pages)).toMatch(/unique id/);
  });
});

describe('validateImageDataUrl', () => {
  it('accepts a PNG and rejects spoofed or foreign types', () => {
    expect(validateImageDataUrl(PNG_DATA_URL, 'sig')).toBeNull();
    expect(validateImageDataUrl(PNG_DATA_URL.replace('image/png', 'image/jpeg'), 'sig')).toMatch(/does not match/);
    expect(validateImageDataUrl('data:image/svg+xml;base64,PHN2Zz4=', 'sig')).toMatch(/PNG or JPEG/);
  });
});

describe('validateValues', () => {
  const fields = [
    field({ id: 'sig', type: 'signature', role: 'signer', label: 'Signature' }),
    field({ id: 'note', type: 'text', role: 'signer', required: false }),
    field({ id: 'agree', type: 'checkbox', role: 'signer', label: 'I agree' }),
    field({ id: 'date', type: 'date', role: 'signer' }),
    field({ id: 'price', type: 'text', role: 'sender' }),
  ];

  it('requires required signer fields and ignores other parties and server dates', () => {
    expect(validateValues(fields, 'signer', { agree: true }, { requireAll: true })).toMatch(/"Signature" is required/);
    expect(validateValues(fields, 'signer', { sig: PNG_DATA_URL }, { requireAll: true })).toMatch(/"I agree" must be checked/);
    expect(validateValues(fields, 'signer', { sig: PNG_DATA_URL, agree: true, date: 'x', price: '9' }, { requireAll: true }))
      .toEqual({ sig: PNG_DATA_URL, agree: 'true' });
  });
});
