'use client';

import { Field, PageBox } from '@/lib/types';
import { fieldToScreen } from '@/lib/geometry';

interface Props {
  field: Field;
  page: PageBox;
  scale: number;
  value?: string;
  /** Fillable by the current viewer. */
  interactive: boolean;
  active?: boolean;
  /** Text shown in an empty locked box, e.g. "Signer". */
  lockedLabel?: string;
  /** Hide empty locked boxes entirely (e.g. sender fields already printed into the PDF). */
  hideWhenLocked?: boolean;
  onClick?: () => void;
  autoText?: string;
  domRef?: (el: HTMLDivElement | null) => void;
}

/** One field drawn over a PDF page in fill mode (sender preparing, or signer signing). */
export default function FieldBox({
  field, page, scale, value, interactive, active, lockedLabel, hideWhenLocked, onClick, autoText, domRef,
}: Props) {
  if (!interactive && hideWhenLocked) return null;
  const r = fieldToScreen(field, page, scale);
  const filled = !!value;
  const auto = !!autoText;
  const fontPx = Math.max(8, Math.min(r.height * 0.6, field.fontSize * scale));

  let bg = 'rgb(254 249 195 / 0.85)', border = '#ca8a04';           // needs input
  if (!interactive) { bg = 'rgb(243 244 246 / 0.75)'; border = '#9ca3af'; }
  else if (auto) { bg = 'rgb(219 234 254 / 0.8)'; border = '#3b82f6'; }
  else if (filled) { bg = 'rgb(220 252 231 / 0.55)'; border = '#16a34a'; }
  // White-out fields hide the printed template underneath, as they will in the PDF.
  if (field.cover && interactive) bg = filled ? 'rgb(255 255 255 / 0.97)' : 'rgb(255 253 235 / 0.97)';

  let content: React.ReactNode;
  if (filled && (field.type === 'signature' || field.type === 'initials')) {
    // eslint-disable-next-line @next/next/no-img-element
    content = <img src={value} alt={field.label} className="max-w-full max-h-full object-contain" />;
  } else if (field.type === 'checkbox') {
    content = value === 'true' ? <span style={{ fontSize: r.height * 0.9, lineHeight: 1 }}>✓</span> : null;
  } else if (filled) {
    content = (
      <span className="px-0.5 w-full" style={{
        fontSize: fontPx, color: '#111', whiteSpace: field.multiline ? 'pre-wrap' : 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis', alignSelf: field.multiline ? 'flex-start' : 'center',
      }}>{value}</span>
    );
  } else {
    content = (
      <span className="px-1 truncate" style={{ fontSize: Math.min(fontPx, 12), color: interactive ? '#854d0e' : '#6b7280' }}>
        {auto ? autoText : interactive ? `${field.label}${field.required ? ' *' : ''}` : lockedLabel ?? field.label}
      </span>
    );
  }

  const clickable = interactive && !auto && !!onClick;
  return (
    <div
      ref={domRef}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? field.label : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={clickable ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick!(); } } : undefined}
      className="absolute flex items-center justify-center overflow-hidden"
      style={{
        left: r.left, top: r.top, width: Math.max(r.width, 6), height: Math.max(r.height, 6),
        background: bg, border: `1px solid ${border}`, borderRadius: 3,
        cursor: clickable ? 'pointer' : 'default',
        animation: active ? 'field-pulse 1.2s ease-in-out infinite' : undefined,
        outline: active ? '2px solid var(--brand)' : undefined,
      }}
    >
      {content}
    </div>
  );
}
