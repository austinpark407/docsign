import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { Field } from '@/lib/types';

// 1×1 grey PNG (valid zlib stream, accepted by pdf-lib's decoder).
export const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mNoaGgAAAMEAYF1LgG8AAAAAElFTkSuQmCC';

/** A two-page Letter PDF with some printed text, like a real template. */
export async function makeTemplatePdf(opts: { rotateSecondPage?: boolean; cropOffset?: boolean } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 2; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Sample agreement page ${i + 1}`, { x: 72, y: 720, size: 14, font });
    if (opts.cropOffset && i === 0) page.setCropBox(20, 30, 572, 732);
  }
  if (opts.rotateSecondPage) doc.getPages()[1].setRotation(degrees(90));
  return doc.save();
}

export function field(partial: Partial<Field> & Pick<Field, 'id' | 'type' | 'role'>): Field {
  return {
    label: partial.type,
    page: 1,
    x: 72, y: 100, width: 200, height: 24,
    required: true,
    fontSize: 11,
    multiline: false,
    cover: false,
    defaultValue: '',
    ...partial,
  };
}
