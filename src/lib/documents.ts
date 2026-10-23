import { DocumentRecord } from './repo';

/** When the current signing link stops working, or null if it never expires. */
export function linkExpiresAt(doc: Pick<DocumentRecord, 'tokenIssuedAt' | 'sentAt' | 'expiresDays'>): Date | null {
  const base = doc.tokenIssuedAt ?? doc.sentAt;
  if (!base || doc.expiresDays <= 0) return null;
  const d = new Date(base);
  d.setDate(d.getDate() + doc.expiresDays);
  return d;
}

export function isLinkExpired(doc: Pick<DocumentRecord, 'tokenIssuedAt' | 'sentAt' | 'expiresDays'>): boolean {
  const at = linkExpiresAt(doc);
  return at !== null && Date.now() > at.getTime();
}

/** Formats a date for a date field, in the given IANA time zone when it is valid. */
export function formatSigningDate(date: Date, timeZone?: unknown): string {
  const fallback = process.env.TIMEZONE || 'UTC';
  let tz = typeof timeZone === 'string' && timeZone ? timeZone : fallback;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    tz = fallback;
  }
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: tz });
}

export function fileName(title: string, suffix: string): string {
  const base = title.replace(/[^\w\- ]/g, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'document';
  return `${base}-${suffix}`;
}
