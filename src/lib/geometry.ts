import { Field, PageBox } from './types';

/** Field rectangle in on-screen pixels, relative to the page's top-left corner. */
export function fieldToScreen(f: Pick<Field, 'x' | 'y' | 'width' | 'height'>, page: PageBox, scale: number) {
  return {
    left: f.x * scale,
    top: (page.height - f.y - f.height) * scale,
    width: f.width * scale,
    height: f.height * scale,
  };
}

/** Inverse of fieldToScreen: screen pixels → PDF points (bottom-left origin). */
export function screenToField(r: { left: number; top: number; width: number; height: number }, page: PageBox, scale: number) {
  return {
    x: r.left / scale,
    y: page.height - (r.top + r.height) / scale,
    width: r.width / scale,
    height: r.height / scale,
  };
}
