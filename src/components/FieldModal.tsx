'use client';

import { useEffect, useRef, useState } from 'react';
import { Field } from '@/lib/types';
import { signatureFont } from '@/lib/fonts';

const SIG_FAMILY = signatureFont.style.fontFamily;

interface Props {
  field: Field;
  initialValue?: string;
  /** Suggested text for name fields and typed signatures. */
  suggestedName?: string;
  onDone: (value: string) => void;
  onClose: () => void;
}

type Tab = 'draw' | 'type' | 'upload';

/** Re-encodes any image the browser can read as a trimmed PNG, at most 800×300. */
async function imageFileToPng(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 800 / bitmap.width, 300 / bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/png');
}

async function typedToPng(text: string, initials: boolean): Promise<string> {
  const size = initials ? 56 : 48;
  await document.fonts.load(`600 ${size}px ${SIG_FAMILY}`);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `600 ${size}px ${SIG_FAMILY}`;
  canvas.width = Math.ceil(ctx.measureText(text).width) + 24;
  canvas.height = Math.round(size * 1.6);
  ctx.font = `600 ${size}px ${SIG_FAMILY}`;
  ctx.fillStyle = '#1e2a78';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 12, canvas.height / 2);
  return canvas.toDataURL('image/png');
}

function DrawPad({ onDone }: { onDone: (v: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = ref.current!.getContext('2d')!;
    const p = pos(e);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(last.current!.x, last.current!.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    setEmpty(false);
  }
  function up() {
    drawing.current = false;
    last.current = null;
  }
  function clear() {
    const c = ref.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
  }

  return (
    <div>
      <canvas
        ref={ref}
        width={700}
        height={220}
        className="w-full border border-gray-300 rounded-lg bg-white touch-none cursor-crosshair"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-label="Draw your signature"
      />
      <div className="flex items-center mt-3">
        <button type="button" className="btn btn-sm" onClick={clear}>Clear</button>
        <button type="button" className="btn btn-primary ml-auto" disabled={empty} onClick={() => onDone(ref.current!.toDataURL('image/png'))}>
          Apply
        </button>
      </div>
    </div>
  );
}

export default function FieldModal({ field, initialValue = '', suggestedName = '', onDone, onClose }: Props) {
  const isImage = field.type === 'signature' || field.type === 'initials';
  const initials = field.type === 'initials';
  const defaultTyped = initials
    ? suggestedName.split(/\s+/).filter(Boolean).map(w => w[0]?.toUpperCase()).join('')
    : suggestedName;
  const [tab, setTab] = useState<Tab>('draw');
  const [typed, setTyped] = useState(defaultTyped);
  const [text, setText] = useState(initialValue || (field.type === 'name' ? suggestedName : ''));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function onUpload(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      onDone(await imageFileToPng(file));
    } catch {
      setError('That image could not be read. Try a PNG or JPG.');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={field.label}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{field.label}</h2>
          <button type="button" className="text-2xl leading-none text-gray-400 hover:text-gray-700" onClick={onClose} aria-label="Close">×</button>
        </div>

        {isImage ? (
          <>
            <div className="flex gap-1 mb-4 border-b border-gray-200">
              {(['draw', 'type', 'upload'] as Tab[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`px-3 py-2 text-sm font-semibold -mb-px border-b-2 ${tab === t ? 'border-[var(--brand)] text-[var(--brand)]' : 'border-transparent text-gray-500'}`}
                >
                  {t === 'draw' ? 'Draw' : t === 'type' ? 'Type' : 'Upload'}
                </button>
              ))}
            </div>
            {tab === 'draw' && <DrawPad onDone={onDone} />}
            {tab === 'type' && (
              <div>
                <input className="input mb-3" value={typed} onChange={e => setTyped(e.target.value)}
                  placeholder={initials ? 'Your initials' : 'Your full name'} autoFocus maxLength={initials ? 6 : 80} />
                <div className="h-20 flex items-center px-3 mb-3 rounded-lg bg-gray-50 border border-gray-200 overflow-hidden"
                  style={{ fontFamily: SIG_FAMILY, fontWeight: 600, fontSize: 36, color: '#1e2a78' }}>
                  {typed || <span className="hint" style={{ fontFamily: 'inherit', fontSize: 14 }}>Preview</span>}
                </div>
                <button type="button" className="btn btn-primary w-full" disabled={!typed.trim()}
                  onClick={async () => onDone(await typedToPng(typed.trim(), initials))}>
                  Apply
                </button>
              </div>
            )}
            {tab === 'upload' && (
              <div>
                <p className="hint mb-3">Upload a photo or scan of your {initials ? 'initials' : 'signature'} on a light background.</p>
                <input type="file" accept="image/*" className="input" onChange={e => onUpload(e.target.files?.[0])} />
              </div>
            )}
          </>
        ) : (
          <form onSubmit={e => { e.preventDefault(); if (text.trim() || !field.required) onDone(text.trim()); }}>
            {field.multiline ? (
              <textarea className="input mb-3" rows={6} value={text} onChange={e => setText(e.target.value)} autoFocus maxLength={5000} />
            ) : (
              <input className="input mb-3" value={text} onChange={e => setText(e.target.value)} autoFocus maxLength={500}
                placeholder={field.type === 'name' ? 'Full name' : ''} />
            )}
            <button type="submit" className="btn btn-primary w-full" disabled={field.required && !text.trim()}>Apply</button>
          </form>
        )}
        {error && <p className="error-box mt-3">{error}</p>}
      </div>
    </div>
  );
}
