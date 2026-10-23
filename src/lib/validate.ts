import { Field, FieldType, FieldRole, PageBox, DEFAULT_FIELD_SIZE } from './types';

const FIELD_TYPES: FieldType[] = ['text', 'name', 'date', 'signature', 'initials', 'checkbox'];
const ROLES: FieldRole[] = ['sender', 'signer'];
export const MAX_FIELDS = 300;

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

/**
 * Normalizes untrusted field definitions from the template editor: unknown
 * types are rejected, geometry is clamped onto its page, strings are capped.
 * Returns an error message or the cleaned list.
 */
export function sanitizeFields(input: unknown, pages: PageBox[]): Field[] | string {
  if (!Array.isArray(input)) return 'fields must be an array';
  if (input.length > MAX_FIELDS) return `A template can have at most ${MAX_FIELDS} fields.`;
  const seen = new Set<string>();
  const out: Field[] = [];
  for (const raw of input as Record<string, unknown>[]) {
    const type = raw?.type as FieldType;
    const role = raw?.role as FieldRole;
    if (!FIELD_TYPES.includes(type)) return `Unknown field type: ${String(raw?.type)}`;
    if (!ROLES.includes(role)) return `Unknown field role: ${String(raw?.role)}`;
    const id = str(raw.id, 64).replace(/[^\w-]/g, '');
    if (!id || seen.has(id)) return 'Each field needs a unique id.';
    seen.add(id);

    const page = Math.trunc(num(raw.page, 1));
    const box = pages[page - 1];
    if (!box) return `Field "${id}" is on page ${page}, which does not exist.`;

    const width = Math.min(Math.max(num(raw.width, DEFAULT_FIELD_SIZE[type].width), 6), box.width);
    const height = Math.min(Math.max(num(raw.height, DEFAULT_FIELD_SIZE[type].height), 6), box.height);
    const x = Math.min(Math.max(num(raw.x, 0), 0), box.width - width);
    const y = Math.min(Math.max(num(raw.y, 0), 0), box.height - height);

    out.push({
      id,
      type,
      role,
      label: str(raw.label, 100).trim() || defaultLabel(type),
      page,
      x, y, width, height,
      required: raw.required !== false,
      fontSize: Math.min(Math.max(num(raw.fontSize, 11), 6), 36),
      multiline: type === 'text' && raw.multiline === true,
      cover: raw.cover === true,
      defaultValue: type === 'text' ? str(raw.defaultValue, 5000) : '',
    });
  }
  return out;
}

export function defaultLabel(type: FieldType): string {
  return { text: 'Text', name: 'Full name', date: 'Date', signature: 'Signature', initials: 'Initials', checkbox: 'Checkbox' }[type];
}

/**
 * Validates a signature image data URL: PNG or JPEG only, magic bytes must
 * match the declared type, max 1 MB decoded. Returns an error or null.
 */
export function validateImageDataUrl(val: unknown, label: string): string | null {
  if (typeof val !== 'string') return `${label}: missing image`;
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(val);
  if (!m) return `${label}: must be a PNG or JPEG image`;
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length === 0) return `${label}: empty image`;
  if (buf.length > 1024 * 1024) return `${label}: image too large (max 1 MB)`;
  const png = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if ((m[1] === 'png' && !png) || (m[1] === 'jpeg' && !jpeg)) return `${label}: image data does not match its type`;
  return null;
}

export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/**
 * Checks values supplied for one party's fields. Required fields must be
 * present; signatures must be valid images; dates are filled by the server.
 * Returns the cleaned values or an error message.
 */
export function validateValues(
  fields: Field[],
  role: 'sender' | 'signer',
  input: unknown,
  { requireAll }: { requireAll: boolean },
): Record<string, string> | string {
  const values = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const f of fields.filter(f => f.role === role)) {
    const v = values[f.id];
    if (f.type === 'date' && role === 'signer') continue; // stamped by the server at signing
    if (f.type === 'checkbox') {
      out[f.id] = v === true || v === 'true' ? 'true' : '';
      if (requireAll && f.required && !out[f.id]) return `"${f.label}" must be checked.`;
      continue;
    }
    if (v === undefined || v === null || v === '') {
      if (requireAll && f.required) return `"${f.label}" is required.`;
      continue;
    }
    if (f.type === 'signature' || f.type === 'initials') {
      const err = validateImageDataUrl(v, f.label);
      if (err) return err;
      out[f.id] = v as string;
    } else {
      out[f.id] = str(v, f.multiline ? 5000 : 500);
    }
  }
  return out;
}
