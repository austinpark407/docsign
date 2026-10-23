'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PdfPages from '@/components/PdfPages';
import { fieldToScreen, screenToField } from '@/lib/geometry';
import {
  DEFAULT_FIELD_SIZE, FIELD_TYPE_LABELS, Field, FieldRole, FieldType, PageBox, Template,
} from '@/lib/types';

const TYPES: FieldType[] = ['signature', 'initials', 'name', 'date', 'text', 'checkbox'];
const ROLE_COLORS: Record<FieldRole, { border: string; bg: string; text: string }> = {
  signer: { border: '#2563eb', bg: 'rgb(37 99 235 / 0.12)', text: '#1e40af' },
  sender: { border: '#9333ea', bg: 'rgb(147 51 234 / 0.12)', text: '#6b21a8' },
};
const MIN = 6; // points

type Drag =
  | { kind: 'draw'; page: number; startX: number; startY: number; x: number; y: number }
  | { kind: 'move' | 'resize'; id: string; startX: number; startY: number; orig: Field; scale: number };

function newFieldId(): string {
  return `f_${Math.random().toString(36).slice(2, 10)}`;
}

function clampToPage(f: Field, page: PageBox): Field {
  const width = Math.min(Math.max(f.width, MIN), page.width);
  const height = Math.min(Math.max(f.height, MIN), page.height);
  return {
    ...f,
    width, height,
    x: Math.min(Math.max(f.x, 0), page.width - width),
    y: Math.min(Math.max(f.y, 0), page.height - height),
  };
}

export default function TemplateEditor({ id }: { id: string }) {
  const router = useRouter();
  const [template, setTemplate] = useState<Template | null>(null);
  const [name, setName] = useState('');
  const [fields, setFields] = useState<Field[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<FieldType | null>(null);
  const [role, setRole] = useState<FieldRole>('signer');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);

  useEffect(() => {
    fetch(`/api/templates/${id}`)
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((t: Template) => { setTemplate(t); setName(t.name); setFields(t.fields); })
      .catch(s => (s === 401 ? router.push('/') : setStatus({ kind: 'error', text: 'Template not found.' })));
  }, [id, router]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const pages = useMemo(() => template?.pages ?? [], [template]);
  const selected = fields.find(f => f.id === selectedId) ?? null;

  const update = useCallback((fid: string, patch: Partial<Field>) => {
    setFields(list => list.map(f => {
      if (f.id !== fid) return f;
      const next = { ...f, ...patch };
      return pages[next.page - 1] ? clampToPage(next, pages[next.page - 1]) : next;
    }));
    setDirty(true);
  }, [pages]);

  const removeField = useCallback((fid: string) => {
    setFields(list => list.filter(f => f.id !== fid));
    setSelectedId(s => (s === fid ? null : s));
    setDirty(true);
  }, []);

  // Keyboard: Delete removes, arrows nudge (Shift = 10pt), Escape cancels the tool.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Escape') { setTool(null); setSelectedId(null); return; }
      if (!selected) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeField(selected.id); return; }
      const step = e.shiftKey ? 10 : 1;
      const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      if (delta[e.key]) {
        e.preventDefault();
        update(selected.id, { x: selected.x + delta[e.key][0], y: selected.y + delta[e.key][1] });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, removeField, update]);

  function setDragState(d: Drag | null) {
    dragRef.current = d;
    setDrag(d);
  }

  function localPoint(e: React.PointerEvent, el: HTMLElement) {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onOverlayDown(e: React.PointerEvent<HTMLDivElement>, page: number) {
    if (e.target !== e.currentTarget) return;
    if (!tool) { setSelectedId(null); return; }
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = localPoint(e, e.currentTarget);
    setDragState({ kind: 'draw', page, startX: p.x, startY: p.y, x: p.x, y: p.y });
  }

  function onOverlayMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (d?.kind !== 'draw') return;
    const p = localPoint(e, e.currentTarget);
    setDragState({ ...d, x: p.x, y: p.y });
  }

  function onOverlayUp(e: React.PointerEvent<HTMLDivElement>, page: number, scale: number) {
    const d = dragRef.current;
    if (d?.kind !== 'draw' || !tool) return;
    setDragState(null);
    const box = pages[page - 1];
    const w = Math.abs(d.x - d.startX), h = Math.abs(d.y - d.startY);
    const size = DEFAULT_FIELD_SIZE[tool];
    // A click places a default-size field centred on the pointer; a drag uses the drawn box.
    const rect = w < 8 && h < 8
      ? { left: d.startX - (size.width * scale) / 2, top: d.startY - (size.height * scale) / 2, width: size.width * scale, height: size.height * scale }
      : { left: Math.min(d.x, d.startX), top: Math.min(d.y, d.startY), width: w, height: h };
    const geo = screenToField(rect, box, scale);
    const field = clampToPage({
      id: newFieldId(),
      type: tool,
      role,
      label: FIELD_TYPE_LABELS[tool],
      page,
      ...geo,
      required: true,
      fontSize: 11,
      multiline: false,
      cover: false,
      defaultValue: '',
    }, box);
    setFields(list => [...list, field]);
    setSelectedId(field.id);
    setTool(null);
    setDirty(true);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }

  function onFieldDown(e: React.PointerEvent<HTMLDivElement>, f: Field, scale: number, kind: 'move' | 'resize') {
    e.stopPropagation();
    if (tool) setTool(null);
    setSelectedId(f.id);
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragState({ kind, id: f.id, startX: e.clientX, startY: e.clientY, orig: f, scale });
  }

  function onFieldMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d || d.kind === 'draw') return;
    const dx = (e.clientX - d.startX) / d.scale;
    const dy = (e.clientY - d.startY) / d.scale;
    if (d.kind === 'move') {
      update(d.id, { x: d.orig.x + dx, y: d.orig.y - dy });
    } else {
      // Resize from the bottom-right corner: the top edge stays put.
      const height = Math.max(MIN, d.orig.height + dy);
      update(d.id, { width: Math.max(MIN, d.orig.width + dx), height, y: d.orig.y + d.orig.height - height });
    }
  }

  function onFieldUp() {
    if (dragRef.current && dragRef.current.kind !== 'draw') setDragState(null);
  }

  function duplicate(f: Field) {
    const box = pages[f.page - 1];
    const copy = clampToPage({ ...f, id: newFieldId(), x: f.x + 12, y: f.y - 12 }, box);
    setFields(list => [...list, copy]);
    setSelectedId(copy.id);
    setDirty(true);
  }

  async function save() {
    if (!template) return;
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, fields }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setFields(data.fields);
        setDirty(false);
        setStatus({ kind: 'ok', text: 'Saved.' });
      } else {
        setStatus({ kind: 'error', text: data.error || 'Save failed.' });
      }
    } catch {
      setStatus({ kind: 'error', text: 'Connection error. Your changes are not saved yet.' });
    } finally {
      setSaving(false);
    }
  }

  function renderOverlay(page: number, scale: number) {
    const box = pages[page - 1];
    const d = drag;
    return (
      <div
        className="absolute inset-0"
        style={{ cursor: tool ? 'crosshair' : 'default', touchAction: tool ? 'none' : 'auto' }}
        onPointerDown={e => onOverlayDown(e, page)}
        onPointerMove={onOverlayMove}
        onPointerUp={e => onOverlayUp(e, page, scale)}
      >
        {fields.filter(f => f.page === page).map(f => {
          const r = fieldToScreen(f, box, scale);
          const c = ROLE_COLORS[f.role];
          const isSel = f.id === selectedId;
          return (
            <div
              key={f.id}
              className="absolute select-none flex items-center overflow-hidden"
              style={{
                left: r.left, top: r.top, width: r.width, height: r.height,
                border: `${isSel ? 2 : 1}px solid ${c.border}`, background: f.cover ? 'rgb(255 255 255 / 0.85)' : c.bg,
                borderRadius: 3, cursor: 'move', touchAction: 'none', zIndex: isSel ? 20 : 10,
              }}
              onPointerDown={e => onFieldDown(e, f, scale, 'move')}
              onPointerMove={onFieldMove}
              onPointerUp={onFieldUp}
              title={`${f.label} (${f.role})`}
            >
              <span className="px-1 truncate font-medium" style={{ color: c.text, fontSize: Math.max(9, Math.min(12, r.height * 0.55)) }}>
                {f.type === 'checkbox' ? '' : f.defaultValue || f.label}
              </span>
              {isSel && (
                <div
                  className="absolute right-0 bottom-0 w-3 h-3"
                  style={{ background: c.border, cursor: 'nwse-resize', touchAction: 'none' }}
                  onPointerDown={e => onFieldDown(e, f, scale, 'resize')}
                  onPointerMove={onFieldMove}
                  onPointerUp={onFieldUp}
                />
              )}
            </div>
          );
        })}
        {d?.kind === 'draw' && d.page === page && (
          <div className="absolute border-2 border-dashed pointer-events-none"
            style={{
              borderColor: ROLE_COLORS[role].border,
              left: Math.min(d.x, d.startX), top: Math.min(d.y, d.startY),
              width: Math.abs(d.x - d.startX), height: Math.abs(d.y - d.startY),
            }} />
        )}
      </div>
    );
  }

  if (!template) {
    return <main className="max-w-6xl mx-auto px-4 py-10">{status ? <p className="error-box">{status.text}</p> : <p className="hint">Loading…</p>}</main>;
  }

  const signerCount = fields.filter(f => f.role === 'signer').length;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="bg-white border-b border-[var(--line)] px-4 py-2 flex flex-wrap items-center gap-3">
        <Link href="/templates" className="hint hover:text-gray-900">← Templates</Link>
        <input className="input max-w-sm font-semibold" value={name} aria-label="Template name"
          onChange={e => { setName(e.target.value); setDirty(true); }} />
        <span className="hint">{fields.length} field{fields.length === 1 ? '' : 's'}</span>
        <div className="ml-auto flex items-center gap-3">
          {status && <span className={`text-sm ${status.kind === 'ok' ? 'text-green-700' : 'text-red-700'}`}>{status.text}</span>}
          {dirty && !status && <span className="hint">Unsaved changes</span>}
          <button className="btn btn-primary" onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
        <div className="flex-1 overflow-auto p-4 sm:p-6 bg-[#eceef1]">
          <PdfPages url={`/api/templates/${id}/pdf`} pages={pages} renderOverlay={renderOverlay} />
        </div>

        <aside className="lg:w-80 shrink-0 bg-white border-t lg:border-t-0 lg:border-l border-[var(--line)] overflow-auto p-4 flex flex-col gap-5">
          <section>
            <p className="label">Who fills it in</p>
            <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-lg mb-1">
              {(['signer', 'sender'] as FieldRole[]).map(r => (
                <button key={r} onClick={() => setRole(r)}
                  className={`py-1.5 rounded-md text-sm font-semibold ${role === r ? 'bg-white shadow-sm' : 'text-gray-500'}`}
                  style={role === r ? { color: ROLE_COLORS[r].text } : undefined}>
                  {r === 'signer' ? 'Signer' : 'You (sender)'}
                </button>
              ))}
            </div>
            <p className="hint mb-3">
              {role === 'signer'
                ? 'The person you send it to fills these in when they sign.'
                : 'You fill these in before sending, e.g. price, scope, or your own signature.'}
            </p>
            <p className="label">Add a field</p>
            <div className="grid grid-cols-2 gap-2">
              {TYPES.map(t => (
                <button key={t} onClick={() => setTool(tool === t ? null : t)}
                  className={`btn btn-sm justify-start ${tool === t ? '!border-[var(--brand)] !bg-blue-50 !text-[var(--brand)]' : ''}`}>
                  {FIELD_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
            <p className="hint mt-2">{tool ? `Click on the page to place it, or drag to draw its size. Esc cancels.` : 'Pick a field, then click on the page.'}</p>
          </section>

          {selected ? (
            <section className="border-t border-[var(--line)] pt-4 flex flex-col gap-3">
              <p className="font-semibold">Selected field</p>
              <div>
                <label className="label" htmlFor="f-label">Label</label>
                <input id="f-label" className="input" value={selected.label} maxLength={100}
                  onChange={e => update(selected.id, { label: e.target.value })} />
                <p className="hint mt-1">Shown on the box and in error messages.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label" htmlFor="f-type">Type</label>
                  <select id="f-type" className="input" value={selected.type}
                    onChange={e => update(selected.id, { type: e.target.value as FieldType, multiline: false })}>
                    {TYPES.map(t => <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="f-role">Filled by</label>
                  <select id="f-role" className="input" value={selected.role}
                    onChange={e => update(selected.id, { role: e.target.value as FieldRole })}>
                    <option value="signer">Signer</option>
                    <option value="sender">You (sender)</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selected.required} onChange={e => update(selected.id, { required: e.target.checked })} />
                Required
              </label>
              {(selected.type === 'text' || selected.type === 'name' || selected.type === 'date') && (
                <div>
                  <label className="label" htmlFor="f-size">Font size</label>
                  <input id="f-size" type="number" min={6} max={36} className="input w-24" value={selected.fontSize}
                    onChange={e => update(selected.id, { fontSize: Math.min(36, Math.max(6, Number(e.target.value) || 11)) })} />
                </div>
              )}
              {selected.type === 'text' && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selected.multiline} onChange={e => update(selected.id, { multiline: e.target.checked })} />
                  Multiple lines (wraps text)
                </label>
              )}
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={selected.cover} onChange={e => update(selected.id, { cover: e.target.checked })} />
                <span>White out what&apos;s underneath<br /><span className="hint">Hides the template&apos;s printed text in this box so your text replaces it.</span></span>
              </label>
              {selected.type === 'text' && selected.role === 'sender' && (
                <div>
                  <label className="label" htmlFor="f-default">Default text</label>
                  <textarea id="f-default" className="input" rows={selected.multiline ? 5 : 2} value={selected.defaultValue}
                    maxLength={5000} onChange={e => update(selected.id, { defaultValue: e.target.value })} />
                  <p className="hint mt-1">Pre-filled on every new document. You can still change it per document.</p>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button className="btn btn-sm" onClick={() => duplicate(selected)}>Duplicate</button>
                <button className="btn btn-sm btn-danger ml-auto" onClick={() => removeField(selected.id)}>Delete field</button>
              </div>
              <p className="hint">Drag to move, drag the corner to resize, arrow keys to nudge.</p>
            </section>
          ) : (
            <section className="border-t border-[var(--line)] pt-4">
              <p className="hint">Select a field on the page to edit it.</p>
              {signerCount === 0 && (
                <p className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  Add at least one <strong>Signer</strong> field (usually a Signature) so this template can be sent.
                </p>
              )}
            </section>
          )}

          <section className="border-t border-[var(--line)] pt-4 mt-auto">
            <p className="label">Legend</p>
            <p className="text-sm flex items-center gap-2"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: ROLE_COLORS.signer.border }} />Signer fills in</p>
            <p className="text-sm flex items-center gap-2"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: ROLE_COLORS.sender.border }} />You fill in</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
