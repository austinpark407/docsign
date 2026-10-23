// Generates examples/sample-agreement.pdf, a generic two-page service agreement
// to try docsign with. Run: node scripts/make-sample-pdf.mjs
import { writeFileSync } from 'node:fs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
const ink = rgb(0.1, 0.1, 0.12);
const gray = rgb(0.45, 0.45, 0.5);
const M = 72;

function wrap(text, f, size, max) {
  const out = []; let line = '';
  for (const w of text.split(' ')) {
    const t = line ? `${line} ${w}` : w;
    if (f.widthOfTextAtSize(t, size) > max && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

// Page 1
let p = doc.addPage([612, 792]);
let y = 720;
p.drawText('SERVICE AGREEMENT', { x: M, y, size: 20, font: bold, color: ink }); y -= 22;
p.drawText('Sample template for docsign. Replace it with your own PDF.', { x: M, y, size: 10, font, color: gray }); y -= 36;
for (const [label, line] of [['Client', 300], ['Address', 300], ['Date', 160]]) {
  p.drawText(`${label}:`, { x: M, y, size: 11, font: bold, color: ink });
  p.drawLine({ start: { x: M + 70, y: y - 3 }, end: { x: M + 70 + line, y: y - 3 }, thickness: 0.6, color: gray });
  y -= 30;
}
y -= 6;
p.drawText('1. Scope of work', { x: M, y, size: 13, font: bold, color: ink }); y -= 20;
p.drawRectangle({ x: M, y: y - 150, width: 468, height: 150, borderColor: rgb(0.8, 0.8, 0.84), borderWidth: 0.8 });
p.drawText('[Describe the work here]', { x: M + 8, y: y - 18, size: 10, font, color: gray });
y -= 180;
p.drawText('2. Price', { x: M, y, size: 13, font: bold, color: ink }); y -= 24;
p.drawText('Total price: $', { x: M, y, size: 11, font, color: ink });
p.drawLine({ start: { x: M + 75, y: y - 3 }, end: { x: M + 220, y: y - 3 }, thickness: 0.6, color: gray });
y -= 24;
for (const l of wrap('50% is due at signing and the balance on completion. Prices are valid for 30 days from the date above.', font, 11, 468)) {
  p.drawText(l, { x: M, y, size: 11, font, color: ink }); y -= 15;
}
p.drawText('Page 1 of 2', { x: 612 - M - 50, y: 40, size: 9, font, color: gray });

// Page 2
p = doc.addPage([612, 792]);
y = 720;
p.drawText('3. Terms', { x: M, y, size: 13, font: bold, color: ink }); y -= 20;
const terms = [
  'The provider will perform the work described above in a professional manner and in line with applicable codes.',
  'The client will provide reasonable access to the property and will tell the provider about any known hazards.',
  'Changes to the scope must be agreed in writing and may change the price.',
  'Either party may cancel in writing before work begins. Deposits for special-order materials are non-refundable.',
  'This agreement is the entire agreement between the parties and is governed by the laws of the provider\'s state.',
];
terms.forEach((t, i) => {
  for (const [j, l] of wrap(`${String.fromCharCode(97 + i)}) ${t}`, font, 11, 468).entries()) {
    p.drawText(l, { x: M + (j ? 14 : 0), y, size: 11, font, color: ink }); y -= 15;
  }
  y -= 6;
});
y -= 10;
p.drawText('I have read and agree to the terms above.', { x: M, y, size: 11, font, color: ink });
y -= 70;
for (const [x, who] of [[M, 'Client signature'], [M + 260, 'Provider signature']]) {
  p.drawLine({ start: { x, y }, end: { x: x + 210, y }, thickness: 0.8, color: ink });
  p.drawText(who, { x, y: y - 14, size: 9, font, color: gray });
  p.drawLine({ start: { x, y: y - 50 }, end: { x: x + 210, y: y - 50 }, thickness: 0.8, color: ink });
  p.drawText('Printed name', { x, y: y - 64, size: 9, font, color: gray });
  p.drawLine({ start: { x, y: y - 100 }, end: { x: x + 120, y: y - 100 }, thickness: 0.8, color: ink });
  p.drawText('Date', { x, y: y - 114, size: 9, font, color: gray });
}
p.drawText('Page 2 of 2', { x: 612 - M - 50, y: 40, size: 9, font, color: gray });

doc.setTitle('Sample service agreement');
writeFileSync('examples/sample-agreement.pdf', await doc.save());
console.log('wrote examples/sample-agreement.pdf');
