'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PdfPages from '@/components/PdfPages';
import FieldBox from '@/components/FieldBox';
import FieldModal from '@/components/FieldModal';
import { Field, FieldValues, PageBox } from '@/lib/types';

interface SignPayload {
  title: string;
  orgName: string;
  signerName: string;
  message: string;
  pages: PageBox[];
  fields: Field[];
}

function isDone(f: Field, values: FieldValues): boolean {
  if (f.type === 'date') return true;
  if (f.type === 'checkbox') return values[f.id] === 'true';
  return !!values[f.id];
}

export default function SignView({ token }: { token: string }) {
  const router = useRouter();
  const [data, setData] = useState<SignPayload | null>(null);
  const [blocked, setBlocked] = useState<{ text: string; signed?: boolean } | null>(null);
  const [values, setValues] = useState<FieldValues>({});
  const [editing, setEditing] = useState<Field | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A signature drawn once is reused for the other signature boxes (same for initials).
  const adopted = useRef<{ signature?: string; initials?: string }>({});
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    fetch(`/api/sign/${token}`)
      .then(async res => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) { setBlocked({ text: json.error || 'This link is not valid.', signed: json.signed }); return; }
        setData(json);
        fetch(`/api/sign/${token}/view`, { method: 'POST' }).catch(() => {});
      })
      .catch(() => setBlocked({ text: 'Could not load the document. Check your connection and refresh.' }));
  }, [token]);

  if (blocked) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="card max-w-md w-full p-8 text-center">
          <p className="text-lg font-semibold mb-2">{blocked.signed ? 'Already signed' : 'Unavailable'}</p>
          <p className="hint mb-5">{blocked.text}</p>
          {blocked.signed && <a className="btn btn-primary" href={`/api/sign/${token}/download`}>Download signed copy</a>}
        </div>
      </main>
    );
  }
  if (!data) return <main className="min-h-screen flex items-center justify-center hint">Loading document…</main>;

  const signerFields = data.fields
    .filter(f => f.role === 'signer')
    .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const required = signerFields.filter(f => f.required && f.type !== 'date');
  const remaining = required.filter(f => !isDone(f, values));
  const allDone = remaining.length === 0;

  function set(f: Field, v: string) {
    setValues(prev => {
      const next = { ...prev, [f.id]: v };
      if (!v) delete next[f.id];
      return next;
    });
  }

  function open(f: Field) {
    setActiveId(f.id);
    if (f.type === 'checkbox') { set(f, values[f.id] === 'true' ? '' : 'true'); return; }
    const kind = f.type === 'signature' || f.type === 'initials' ? f.type : null;
    if (kind && !values[f.id] && adopted.current[kind]) { set(f, adopted.current[kind]!); return; }
    setEditing(f);
  }

  function goNext() {
    const next = remaining[0] ?? signerFields.find(f => f.type !== 'date' && !isDone(f, values));
    if (!next) return;
    setActiveId(next.id);
    refs.current[next.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function finish() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sign/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values, consent, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok || json.signed) { router.push(`/sign/${token}/done`); return; }
      setError(json.error || 'Something went wrong. Please try again.');
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function overlay(page: number, scale: number) {
    const box = data!.pages[page - 1];
    return signerFields.filter(f => f.page === page).map(f => (
      <FieldBox
        key={f.id}
        field={f}
        page={box}
        scale={scale}
        value={values[f.id]}
        interactive
        active={activeId === f.id}
        autoText={f.type === 'date' ? 'Auto-dated' : undefined}
        onClick={() => open(f)}
        domRef={el => { refs.current[f.id] = el; }}
      />
    ));
  }

  return (
    <div className="min-h-screen pb-40">
      <header className="sticky top-0 z-30 bg-white border-b border-[var(--line)]">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold truncate">{data.title}</p>
            <p className="hint truncate">From {data.orgName} · {required.length - remaining.length} of {required.length} required fields done</p>
          </div>
          {!allDone && <button className="btn btn-primary" onClick={goNext}>Next field</button>}
        </div>
        <div className="h-1 bg-gray-100">
          <div className="h-1 bg-[var(--brand)] transition-all" style={{ width: `${required.length ? ((required.length - remaining.length) / required.length) * 100 : 100}%` }} />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-5">
        <div className="card p-4 mb-4">
          <p className="font-semibold mb-1">Hi {data.signerName},</p>
          <p className="text-sm text-gray-600">
            Please review the document below. Tap each <span className="px-1 rounded bg-yellow-100 border border-yellow-600">highlighted box</span> to fill it in, then finish at the bottom.
          </p>
          {data.message && <p className="text-sm mt-3 pl-3 border-l-2 border-gray-200 whitespace-pre-wrap">{data.message}</p>}
        </div>
        <PdfPages url={`/api/sign/${token}/pdf`} pages={data.pages} renderOverlay={overlay} />
      </main>

      <footer className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-[var(--line)] shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
        <div className="max-w-4xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="flex items-start gap-2 text-[13px] sm:text-sm flex-1">
            <input type="checkbox" className="mt-1 w-4 h-4" checked={consent} onChange={e => setConsent(e.target.checked)} />
            <span>I agree to sign this document electronically, and that my electronic signature is as valid as a handwritten one.</span>
          </label>
          <div className="flex flex-col items-stretch sm:items-end gap-1">
            <button className="btn btn-primary min-w-40" disabled={!allDone || !consent || submitting} onClick={finish}>
              {submitting ? 'Finishing…' : 'Finish and sign'}
            </button>
            {!allDone && <span className="hint">{remaining.length} field{remaining.length === 1 ? '' : 's'} left</span>}
          </div>
        </div>
        {error && <p className="error-box mx-4 mb-3 max-w-4xl sm:mx-auto" role="alert">{error}</p>}
      </footer>

      {editing && (
        <FieldModal
          field={editing}
          initialValue={values[editing.id]}
          suggestedName={data.signerName}
          onDone={v => {
            if (editing.type === 'signature' || editing.type === 'initials') adopted.current[editing.type] = v;
            set(editing, v);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
