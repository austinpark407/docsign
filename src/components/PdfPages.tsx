'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
// The legacy build polyfills newer JS (e.g. Map.getOrInsertComputed), so PDFs
// render in older browsers too. The modern build leaves pages blank there.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PageBox } from '@/lib/types';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

const GAP = 16;

interface Props {
  url: string;
  pages: PageBox[];
  /** Absolutely-positioned content drawn over page `page` (1-based) at the given px-per-point scale. */
  renderOverlay?: (page: number, scale: number) => ReactNode;
  /** Max on-screen page width in px. */
  maxWidth?: number;
}

/**
 * Renders every page of a PDF to canvas, scaled to the container width, with
 * an overlay layer per page for fields.
 */
export default function PdfPages({ url, pages, renderOverlay, maxWidth = 900 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  // Actual page sizes from the PDF. A signed PDF has extra pages (the certificate)
  // beyond the template's, so the template boxes are only a placeholder until load.
  const [sizes, setSizes] = useState<{ width: number; height: number }[] | null>(null);
  const [width, setWidth] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const task = pdfjs.getDocument({ url });
    let alive = true;
    task.promise
      .then(async pdf => {
        const measured = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const vp = (await pdf.getPage(i)).getViewport({ scale: 1 });
          measured.push({ width: vp.width, height: vp.height });
        }
        if (alive) { setError(null); setSizes(measured); setDoc(pdf); }
      })
      .catch(err => {
        if (alive && err?.name !== 'AbortException') setError(err?.message || 'Could not load the PDF.');
      });
    return () => {
      alive = false;
      task.destroy().catch(() => {});
    };
  }, [url, attempt]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => setWidth(Math.min(entries[0].contentRect.width, maxWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxWidth]);

  const layout = sizes ?? pages;

  useEffect(() => {
    if (!doc || !sizes || width === 0) return;
    const tasks: pdfjs.RenderTask[] = [];
    let cancelled = false;
    const dpr = window.devicePixelRatio || 1;
    (async () => {
      for (let i = 1; i <= doc.numPages; i++) {
        if (cancelled) return;
        const page = await doc.getPage(i);
        const canvas = canvasRefs.current[i - 1];
        if (!canvas || cancelled) continue;
        const viewport = page.getViewport({ scale: width / sizes[i - 1].width });
        canvas.width = Math.round(viewport.width * dpr);
        canvas.height = Math.round(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const task = page.render({ canvas: null, canvasContext: ctx, viewport });
        tasks.push(task);
        await task.promise.catch(err => {
          if (err?.name !== 'RenderingCancelledException') console.error(`[PdfPages] page ${i}:`, err);
        });
      }
    })().catch(err => console.error('[PdfPages]', err));
    return () => {
      cancelled = true;
      for (const t of tasks) t.cancel();
    };
  }, [doc, sizes, width]);

  if (error) {
    return (
      <div ref={containerRef} className="card p-8 text-center">
        <p className="font-semibold text-red-700 mb-1">Could not load the document.</p>
        <p className="hint mb-4">{error}</p>
        <button className="btn" onClick={() => { setError(null); setAttempt(a => a + 1); }}>Try again</button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full flex flex-col items-center" style={{ gap: GAP }}>
      {width > 0 && layout.map((p, i) => {
        const scale = width / p.width;
        return (
          <div
            key={i}
            className="relative bg-white shadow-[0_1px_4px_rgba(0,0,0,0.18)]"
            style={{ width: p.width * scale, height: p.height * scale }}
            data-page={i + 1}
          >
            <canvas ref={el => { canvasRefs.current[i] = el; }} className="block" />
            {!doc && <div className="absolute inset-0 flex items-center justify-center hint">Loading page {i + 1}…</div>}
            {renderOverlay && pages[i] && <div className="absolute inset-0">{renderOverlay(i + 1, width / pages[i].width)}</div>}
          </div>
        );
      })}
    </div>
  );
}
