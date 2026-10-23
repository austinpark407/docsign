'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PdfPages from '@/components/PdfPages';
import FieldBox from '@/components/FieldBox';
import FieldModal from '@/components/FieldModal';
import StatusBadge from '@/components/StatusBadge';
import { AuditEvent, Field, FieldValues, PageBox, SignDocument } from '@/lib/types';

interface Payload {
  document: SignDocument;
  templateName: string | null;
  fields: Field[];
  pages: PageBox[];
  audit: AuditEvent[];
  signingLink: string | null;
  linkExpiresAt: string | null;
  linkExpired: boolean;
  emailConfigured: boolean;
}

const EVENT_TEXT: Record<AuditEvent['event'], string> = {
  created: 'Created', sent: 'Sent', reminded: 'Reminder sent', viewed: 'Opened by signer', signed: 'Signed', voided: 'Voided',
};

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const today = () => new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

export default function DocumentView({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', signerName: '', signerEmail: '', message: '', expiresDays: 30 });
  const [values, setValues] = useState<FieldValues>({});
  const [editing, setEditing] = useState<Field | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Record<string, unknown>>({});

  const load = useCallback(async () => {
    const res = await fetch(`/api/documents/${id}`).catch(() => null);
    if (res?.status === 401) { router.push('/'); return; }
    if (!res?.ok) { setLoadError('Document not found.'); return; }
    const p: Payload = await res.json();
    setData(p);
    setForm({
      title: p.document.title, signerName: p.document.signerName, signerEmail: p.document.signerEmail,
      message: p.document.message, expiresDays: p.document.expiresDays,
    });
    setValues(p.document.senderValues);
  }, [id, router]);

  useEffect(() => {
    // Deferred so the effect body itself doesn't set state.
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  // Debounced autosave for drafts.
  const queueSave = useCallback((patch: Record<string, unknown>) => {
    pending.current = { ...pending.current, ...patch };
    setSaveState('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const body = pending.current;
      pending.current = {};
      const res = await fetch(`/api/documents/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }).catch(() => null);
      if (res?.ok) setSaveState('saved');
      else {
        setSaveState('error');
        const err = await res?.json().catch(() => null);
        setNotice({ kind: 'error', text: err?.error || 'Could not save your changes.' });
      }
    }, 700);
  }, [id]);

  async function flushSave() {
    if (!saveTimer.current || Object.keys(pending.current).length === 0) return true;
    clearTimeout(saveTimer.current);
    const body = pending.current;
    pending.current = {};
    const res = await fetch(`/api/documents/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).catch(() => null);
    setSaveState(res?.ok ? 'saved' : 'error');
    return !!res?.ok;
  }

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(f => ({ ...f, [key]: value }));
    queueSave({ [key]: value });
  }

  function setValue(fieldId: string, value: string) {
    const next = { ...values, [fieldId]: value };
    if (!value) delete next[fieldId];
    setValues(next);
    queueSave({ senderValues: next });
  }

  async function post(path: string, body: unknown = {}) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/documents/${id}/${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      return { ok: res.ok, json };
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!(await flushSave())) return;
    if (!window.confirm(`Send "${form.title}" to ${form.signerName} <${form.signerEmail}> for signature?\n\nIt can't be edited after sending.`)) return;
    const { ok, json } = await post('send', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    if (ok) {
      await load();
      setNotice({ kind: 'ok', text: json.emailed ? `Sent to ${form.signerEmail}.` : 'Ready to sign. Copy the signing link below and send it to the signer.' });
    } else setNotice({ kind: 'error', text: json.error || 'Could not send.' });
  }

  async function remind(renew: boolean) {
    const { ok, json } = await post('remind', { renew });
    if (ok) {
      await load();
      setNotice({ kind: 'ok', text: json.emailed ? (renew ? 'New link sent.' : 'Reminder sent.') : 'New link created. Copy it below.' });
    } else setNotice({ kind: 'error', text: json.error || 'Could not send the reminder.' });
  }

  async function voidDoc() {
    if (!window.confirm('Void this document? The signing link will stop working. This cannot be undone.')) return;
    const { ok, json } = await post('void');
    if (ok) { await load(); setNotice({ kind: 'ok', text: 'Document voided.' }); }
    else setNotice({ kind: 'error', text: json.error || 'Could not void.' });
  }

  async function deleteDraft() {
    if (!window.confirm('Delete this draft?')) return;
    const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    if (res.ok) router.push('/');
    else setNotice({ kind: 'error', text: 'Could not delete the draft.' });
  }

  if (loadError) return <main className="max-w-3xl mx-auto px-4 py-10"><p className="error-box">{loadError}</p></main>;
  if (!data) return <main className="max-w-3xl mx-auto px-4 py-10 hint">Loading…</main>;

  const doc = data.document;
  const isDraft = doc.status === 'draft';
  const waiting = doc.status === 'sent' || doc.status === 'viewed';
  const senderFields = data.fields.filter(f => f.role === 'sender');
  const missing = senderFields.filter(f => f.required && f.type !== 'date' && !(f.type === 'checkbox' ? values[f.id] === 'true' : values[f.id]));
  const hasSignerField = data.fields.some(f => f.role === 'signer');
  const pdfUrl = doc.status === 'signed' ? `/api/documents/${id}/download` : isDraft ? `/api/templates/${doc.templateId}/pdf` : `/api/documents/${id}/preview`;

  function overlay(page: number, scale: number) {
    const box = data!.pages[page - 1];
    return data!.fields.filter(f => f.page === page).map(f => {
      const mine = f.role === 'sender';
      if (!isDraft) {
        // Sent: sender values are printed in the PDF; show where the signer will sign.
        if (mine || doc.status === 'signed') return null;
        return <FieldBox key={f.id} field={f} page={box} scale={scale} interactive={false} lockedLabel={`Signer: ${f.label}`} />;
      }
      return (
        <FieldBox
          key={f.id} field={f} page={box} scale={scale}
          value={values[f.id]}
          interactive={mine}
          lockedLabel={`Signer: ${f.label}`}
          onClick={() => (f.type === 'checkbox' ? setValue(f.id, values[f.id] === 'true' ? '' : 'true') : setEditing(f))}
        />
      );
    });
  }

  return (
    <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-3.5rem)]">
      <div className="flex-1 overflow-auto p-4 sm:p-6 bg-[#eceef1] order-2 lg:order-1">
        <PdfPages url={pdfUrl} pages={data.pages} renderOverlay={overlay} />
      </div>

      <aside className="lg:w-96 shrink-0 bg-white border-b lg:border-b-0 lg:border-l border-[var(--line)] overflow-auto p-5 flex flex-col gap-4 order-1 lg:order-2">
        <div className="flex items-center gap-2">
          <Link href="/" className="hint hover:text-gray-900">← Documents</Link>
          <span className="ml-auto"><StatusBadge status={doc.status} /></span>
        </div>

        {notice && <p className={notice.kind === 'ok' ? 'ok-box' : 'error-box'} role="status">{notice.text}</p>}

        {isDraft ? (
          <>
            <div>
              <label className="label" htmlFor="title">Document title</label>
              <input id="title" className="input" value={form.title} onChange={e => setField('title', e.target.value)} maxLength={200} />
              <p className="hint mt-1">From template: {data.templateName}</p>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="label" htmlFor="sname">Signer name</label>
                <input id="sname" className="input" value={form.signerName} onChange={e => setField('signerName', e.target.value)} autoComplete="off" />
              </div>
              <div>
                <label className="label" htmlFor="semail">Signer email</label>
                <input id="semail" type="email" className="input" value={form.signerEmail} onChange={e => setField('signerEmail', e.target.value)} autoComplete="off" />
              </div>
              <div>
                <label className="label" htmlFor="msg">Message <span className="hint font-normal">(optional, included in the email)</span></label>
                <textarea id="msg" className="input" rows={3} value={form.message} onChange={e => setField('message', e.target.value)} maxLength={2000} />
              </div>
              <div>
                <label className="label" htmlFor="exp">Link expires after</label>
                <select id="exp" className="input" value={form.expiresDays} onChange={e => setField('expiresDays', Number(e.target.value))}>
                  {[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>{d} days</option>)}
                  <option value={0}>Never</option>
                </select>
              </div>
            </div>

            {senderFields.length > 0 && (
              <div className="border-t border-[var(--line)] pt-4">
                <p className="font-semibold mb-1">Your fields</p>
                <p className="hint mb-2">Click the yellow boxes on the document to fill them in. Blank date fields get today&apos;s date when you send.</p>
                <ul className="flex flex-col gap-1">
                  {senderFields.map(f => {
                    const done = f.type === 'checkbox' ? values[f.id] === 'true' : !!values[f.id];
                    return (
                      <li key={f.id}>
                        <button className="w-full text-left text-sm flex items-center gap-2 py-1 hover:underline"
                          onClick={() => (f.type === 'checkbox' ? setValue(f.id, done ? '' : 'true') : setEditing(f))}>
                          <span className={done ? 'text-green-600' : 'text-gray-300'}>{done ? '●' : '○'}</span>
                          {f.label}{f.required && f.type !== 'date' ? ' *' : ''}
                          <span className="hint ml-auto">p.{f.page}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="border-t border-[var(--line)] pt-4 flex flex-col gap-2">
              {!hasSignerField && (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  This template has no signer fields. <Link className="underline" href={`/templates/${doc.templateId}`}>Add one</Link> before sending.
                </p>
              )}
              {missing.length > 0 && <p className="hint">Still needed: {missing.map(f => f.label).join(', ')}</p>}
              <a className="btn" href={`/api/documents/${id}/preview`} target="_blank" rel="noreferrer" onClick={() => flushSave()}>
                Preview PDF
              </a>
              <button className="btn btn-primary" onClick={send}
                disabled={busy || !hasSignerField || missing.length > 0 || !form.signerName.trim() || !form.signerEmail.trim()}>
                {busy ? 'Sending…' : data.emailConfigured ? 'Send for signature' : 'Create signing link'}
              </button>
              {!data.emailConfigured && <p className="hint">Email isn&apos;t set up, so you&apos;ll get a link to send yourself.</p>}
              <p className="hint text-center">
                {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'All changes saved' : saveState === 'error' ? 'Not saved' : ''}
              </p>
              <button className="btn btn-sm btn-danger self-start" onClick={deleteDraft}>Delete draft</button>
            </div>
          </>
        ) : (
          <>
            <div>
              <h1 className="text-lg font-semibold">{doc.title}</h1>
              <p className="hint">{doc.signerName} · {doc.signerEmail}</p>
            </div>

            {waiting && data.signingLink && (
              <div className="card p-3 bg-gray-50">
                <p className="label">Signing link</p>
                <p className="text-sm break-all text-[var(--brand)] mb-2">{data.signingLink}</p>
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-sm" onClick={() => {
                    navigator.clipboard.writeText(data.signingLink!);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}>{copied ? 'Copied' : 'Copy link'}</button>
                </div>
                {data.linkExpiresAt && (
                  <p className={`hint mt-2 ${data.linkExpired ? '!text-red-700' : ''}`}>
                    {data.linkExpired ? 'Expired' : 'Expires'} {fmt(data.linkExpiresAt)}
                  </p>
                )}
              </div>
            )}

            {waiting && (
              <div className="flex flex-wrap gap-2">
                {data.emailConfigured && !data.linkExpired && (
                  <button className="btn" disabled={busy} onClick={() => remind(false)}>Send reminder</button>
                )}
                <button className="btn" disabled={busy} onClick={() => remind(true)}>
                  {data.emailConfigured ? 'Send new link' : 'Create new link'}
                </button>
                <button className="btn btn-danger" disabled={busy} onClick={voidDoc}>Void</button>
              </div>
            )}

            {doc.status === 'signed' && (
              <a className="btn btn-primary" href={`/api/documents/${id}/download`}>Download signed PDF</a>
            )}
            {waiting && <a className="btn" href={`/api/documents/${id}/download`}>Download sent copy</a>}

            <div className="border-t border-[var(--line)] pt-4">
              <p className="font-semibold mb-2">Activity</p>
              <ol className="flex flex-col gap-2">
                {data.audit.map((e, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium">{EVENT_TEXT[e.event]}</span>
                    {e.detail && <span className="hint"> ({e.detail})</span>}
                    <br /><span className="hint">{fmt(e.at)}{e.ip ? ` · ${e.ip}` : ''}</span>
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}
      </aside>

      {editing && (
        <FieldModal
          field={editing}
          initialValue={values[editing.id] ?? (editing.type === 'date' ? today() : '')}
          onDone={v => { setValue(editing.id, v); setEditing(null); }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
