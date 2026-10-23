'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Template } from '@/lib/types';

type Row = Template & { documentCount: number };

export default function TemplateList() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Row[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/templates')
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setTemplates)
      .catch(status => (status === 401 ? router.refresh() : setError('Could not load templates.')));
  }, [router]);

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.type && file.type !== 'application/pdf') {
      setError('Templates must be PDF files.');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError('That PDF is larger than 4 MB. Compress it (for example with "Reduce File Size" in Preview) and try again.');
      return;
    }
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch('/api/templates', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (res.ok) router.push(`/templates/${data.id}`);
      else setError(data.error || 'Upload failed.');
    } catch {
      setError('Connection error. Try again.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remove(t: Row) {
    const msg = t.documentCount > 0
      ? `Remove "${t.name}"? Its ${t.documentCount} document(s) are kept; you just can't start new ones from it.`
      : `Delete "${t.name}"?`;
    if (!window.confirm(msg)) return;
    const res = await fetch(`/api/templates/${t.id}`, { method: 'DELETE' });
    if (res.ok) setTemplates(list => list?.filter(x => x.id !== t.id) ?? null);
    else setError('Could not remove the template.');
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">Templates</h1>
      <p className="hint mb-6">Upload a PDF once, place the fields, then send copies of it for signature as often as you like.</p>

      <div
        className={`card border-2 border-dashed p-8 text-center mb-6 transition-colors ${dragOver ? 'border-[var(--brand)] bg-blue-50' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files?.[0]); }}
      >
        <p className="font-semibold mb-1">{uploading ? 'Uploading…' : 'Drop a PDF here'}</p>
        <p className="hint mb-4">Up to 4 MB.</p>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={e => upload(e.target.files?.[0])} />
        <button className="btn btn-primary" disabled={uploading} onClick={() => inputRef.current?.click()}>Choose PDF</button>
      </div>

      {error && <p className="error-box mb-4" role="alert">{error}</p>}

      {templates === null ? <p className="hint">Loading…</p> : templates.length === 0 ? null : (
        <ul className="card divide-y divide-[var(--line)]">
          {templates.map(t => {
            const signer = t.fields.filter(f => f.role === 'signer').length;
            const sender = t.fields.length - signer;
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/templates/${t.id}`} className="font-semibold hover:underline">{t.name}</Link>
                  <p className="hint">
                    {t.pages.length} page{t.pages.length === 1 ? '' : 's'} · {signer} signer / {sender} sender field{t.fields.length === 1 ? '' : 's'}
                    {t.documentCount > 0 && ` · used ${t.documentCount}×`}
                  </p>
                  {signer === 0 && <p className="text-[12.5px] text-amber-700">Add at least one signer field before sending.</p>}
                </div>
                <Link href={`/templates/${t.id}`} className="btn btn-sm">Edit fields</Link>
                <button className="btn btn-sm btn-danger" onClick={() => remove(t)}>Delete</button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
