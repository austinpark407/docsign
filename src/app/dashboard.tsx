'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DocumentStatus, SignDocument, Template } from '@/lib/types';
import StatusBadge from '@/components/StatusBadge';

type Row = SignDocument & { templateName: string };
type Filter = 'waiting' | 'signed' | 'draft' | 'all';

const FILTERS: { key: Filter; label: string; match: (s: DocumentStatus) => boolean }[] = [
  { key: 'waiting', label: 'Waiting for signature', match: s => s === 'sent' || s === 'viewed' },
  { key: 'signed', label: 'Signed', match: s => s === 'signed' },
  { key: 'draft', label: 'Drafts', match: s => s === 'draft' },
  { key: 'all', label: 'All', match: () => true },
];

function when(doc: Row): string {
  const d = doc.signedAt ?? doc.viewedAt ?? doc.sentAt ?? doc.createdAt;
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Dashboard() {
  const router = useRouter();
  const [docs, setDocs] = useState<Row[] | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [filter, setFilter] = useState<Filter>('waiting');
  const [search, setSearch] = useState('');
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/documents').then(r => (r.ok ? r.json() : Promise.reject(r.status))),
      fetch('/api/templates').then(r => (r.ok ? r.json() : Promise.reject(r.status))),
    ])
      .then(([d, t]) => {
        setDocs(d);
        setTemplates(t);
        // Land on the most useful tab.
        if (!(d as Row[]).some(x => x.status === 'sent' || x.status === 'viewed')) setFilter('all');
      })
      .catch(status => (status === 401 ? router.refresh() : setError('Could not load documents. Check the database connection.')));
  }, [router]);

  const counts = useMemo(() => Object.fromEntries(
    FILTERS.map(f => [f.key, docs?.filter(d => f.match(d.status)).length ?? 0]),
  ) as Record<Filter, number>, [docs]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = FILTERS.find(f => f.key === filter)!.match;
    return (docs ?? []).filter(d => match(d.status) && (!q
      || d.title.toLowerCase().includes(q) || d.signerName.toLowerCase().includes(q) || d.signerEmail.toLowerCase().includes(q)));
  }, [docs, filter, search]);

  async function startDocument(templateId: string) {
    setError(null);
    const res = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) router.push(`/documents/${data.id}`);
    else setError(data.error || 'Could not create the document.');
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold mr-auto">Documents</h1>
        <button className="btn btn-primary" onClick={() => setPicking(true)}>New document</button>
      </div>

      {error && <p className="error-box mb-4">{error}</p>}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`btn btn-sm ${filter === f.key ? '!bg-gray-900 !text-white !border-gray-900' : ''}`}>
            {f.label} <span className="opacity-60">{counts[f.key]}</span>
          </button>
        ))}
        <input className="input sm:ml-auto sm:max-w-xs" placeholder="Search title or signer" value={search}
          onChange={e => setSearch(e.target.value)} aria-label="Search documents" />
      </div>

      <div className="card overflow-hidden">
        {docs === null ? (
          <p className="p-8 text-center hint">Loading…</p>
        ) : visible.length === 0 ? (
          <div className="p-10 text-center">
            {docs.length === 0 ? (
              templates.length === 0 ? (
                <>
                  <p className="font-semibold mb-1">Start by uploading a template</p>
                  <p className="hint mb-4">Any PDF works: a contract, a proposal, a waiver. Then place signature fields on it.</p>
                  <Link href="/templates" className="btn btn-primary">Upload a PDF template</Link>
                </>
              ) : (
                <>
                  <p className="font-semibold mb-1">No documents yet</p>
                  <p className="hint mb-4">Create one from a template and send it for signature.</p>
                  <button className="btn btn-primary" onClick={() => setPicking(true)}>New document</button>
                </>
              )
            ) : <p className="hint">Nothing here.</p>}
          </div>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {visible.map(d => (
              <li key={d.id}>
                <Link href={`/documents/${d.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-gray-50">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{d.title}</p>
                    <p className="hint truncate">{d.signerName ? `${d.signerName} · ${d.signerEmail}` : 'No signer yet'} · {d.templateName}</p>
                  </div>
                  <StatusBadge status={d.status} />
                  <span className="hint w-28 text-right">{when(d)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {picking && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true"
          onMouseDown={e => { if (e.target === e.currentTarget) setPicking(false); }}>
          <div className="card w-full max-w-md p-5 shadow-xl">
            <h2 className="text-lg font-semibold mb-3">Choose a template</h2>
            {templates.length === 0 ? (
              <>
                <p className="hint mb-4">You need a template first.</p>
                <Link href="/templates" className="btn btn-primary">Upload a PDF template</Link>
              </>
            ) : (
              <ul className="flex flex-col gap-2 max-h-[60vh] overflow-auto">
                {templates.map(t => {
                  const signerFields = t.fields.filter(f => f.role === 'signer').length;
                  return (
                    <li key={t.id}>
                      <button className="w-full text-left card px-4 py-3 hover:border-[var(--brand)]" onClick={() => startDocument(t.id)}>
                        <p className="font-semibold">{t.name}</p>
                        <p className="hint">
                          {t.pages.length} page{t.pages.length === 1 ? '' : 's'} · {signerFields
                            ? `${signerFields} signer field${signerFields === 1 ? '' : 's'}`
                            : 'no signer fields yet'}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-4 text-right"><button className="btn" onClick={() => setPicking(false)}>Cancel</button></div>
          </div>
        </div>
      )}
    </main>
  );
}
