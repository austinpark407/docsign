// Copies the pdf.js worker (legacy build, works on older browsers) into public/
// so its version always matches the installed pdfjs-dist.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
try {
  const src = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs');
  mkdirSync('public', { recursive: true });
  copyFileSync(src, path.join('public', 'pdf.worker.min.mjs'));
} catch (err) {
  console.warn('[copy-pdf-worker] skipped:', err.message);
}
