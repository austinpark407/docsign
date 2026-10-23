export type FieldType = 'text' | 'name' | 'date' | 'signature' | 'initials' | 'checkbox';
export type FieldRole = 'sender' | 'signer';

/**
 * A field placed on a template page. Geometry is in PDF points measured from
 * the bottom-left corner of the page's visible area (its crop box).
 */
export interface Field {
  id: string;
  type: FieldType;
  role: FieldRole;
  label: string;
  page: number;          // 1-based
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  fontSize: number;
  multiline: boolean;
  /** Paint a white box under the value, hiding whatever the template printed there. */
  cover: boolean;
  /** Pre-filled value for sender text fields, editable per document. */
  defaultValue: string;
}

/** Visible-area geometry of one template page, in PDF points. */
export interface PageBox {
  width: number;
  height: number;
  /** Offset of the crop box inside the page's coordinate space. */
  ox: number;
  oy: number;
}

export interface Template {
  id: string;
  name: string;
  pages: PageBox[];
  fields: Field[];
  createdAt: string;
  updatedAt: string;
}

export type DocumentStatus = 'draft' | 'sent' | 'viewed' | 'signed' | 'voided';

/** Field id → value. Text as-is, signatures as PNG/JPEG data URLs, checkboxes 'true' or ''. */
export type FieldValues = Record<string, string>;

export interface SignDocument {
  id: string;
  templateId: string;
  title: string;
  status: DocumentStatus;
  signerName: string;
  signerEmail: string;
  message: string;
  senderValues: FieldValues;
  expiresDays: number;
  createdAt: string;
  sentAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  voidedAt: string | null;
  lastReminderAt: string | null;
  reminderCount: number;
}

export interface AuditEvent {
  event: 'created' | 'sent' | 'reminded' | 'viewed' | 'signed' | 'voided';
  at: string;
  ip: string | null;
  userAgent: string | null;
  detail: string | null;
}

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Text',
  name: 'Full name',
  date: 'Date',
  signature: 'Signature',
  initials: 'Initials',
  checkbox: 'Checkbox',
};

/** Default size in PDF points for a newly placed field. */
export const DEFAULT_FIELD_SIZE: Record<FieldType, { width: number; height: number }> = {
  text: { width: 160, height: 18 },
  name: { width: 160, height: 18 },
  date: { width: 100, height: 18 },
  signature: { width: 180, height: 40 },
  initials: { width: 60, height: 30 },
  checkbox: { width: 14, height: 14 },
};
