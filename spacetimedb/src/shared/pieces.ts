// Small block builders shared by the built-in course files (`library.ts`,
// `expansion.ts`). Pure data helpers — keep them free of SpacetimeDB, the
// DOM, timers and randomness like everything else in shared/.
import { type Block, type Rect, type Zone, R, polyRect, polyStar, water } from './courses';

/** A triangle / any polygon block from flat points. */
export const tri = (...pts: number[]): Block => ({ pts });
/** A low (jumpable) wall block. */
export const low = (x: number, y: number, w: number, h: number, height = 1.2): Block => ({ ...polyRect(x, y, w, h), h: height });
/** A 45° mirror filling the top-right corner of a lane that ends at x=right, y=0..size. */
export const mirrorTR = (right: number, size: number): Block => tri(right - size, 0, right, 0, right, size);
/** A 45° mirror filling the corner at (px, py); ix/iy point INTO the floor. */
export const corner = (px: number, py: number, s: number, ix: 1 | -1, iy: 1 | -1): Block => tri(px, py, px + ix * s, py, px, py + iy * s);
/** A star-shaped block (5 tips); `bounce` > 1 makes it a rubber "power star". */
export const star = (cx: number, cy: number, r: number, bounce?: number, tips = 5): Block => {
  const b: Block = { pts: polyStar(cx, cy, r, tips) };
  if (bounce !== undefined) b.bounce = bounce;
  return b;
};
/** A floor rect with no rails at all: an open edge the ball rolls off (and
 *  is reset once it stops out on the lawn). */
export const open = (x: number, y: number, w: number, h: number, z?: number): Rect => ({ ...R(x, y, w, h, z), wall: 0 });
/** A floor rect with low rails (`wall`) a lofted ball can clear. */
export const lowRail = (x: number, y: number, w: number, h: number, wall: number, z?: number): Rect => ({ ...R(x, y, w, h, z), wall });
/** A pond with islands: water rects covering `(x, y, w, h)` minus each of
 *  the `islands` (which must lie inside it and not overlap each other). */
export function pond(x: number, y: number, w: number, h: number, ...islands: Rect[]): Zone[] {
  let rects: Rect[] = [R(x, y, w, h)];
  for (const i of islands) {
    const next: Rect[] = [];
    for (const r of rects) {
      const ox = Math.max(r.x, i.x), oy = Math.max(r.y, i.y), ox2 = Math.min(r.x + r.w, i.x + i.w), oy2 = Math.min(r.y + r.h, i.y + i.h);
      if (ox2 <= ox || oy2 <= oy) { next.push(r); continue; }
      if (oy > r.y) next.push(R(r.x, r.y, r.w, oy - r.y));
      if (oy2 < r.y + r.h) next.push(R(r.x, oy2, r.w, r.y + r.h - oy2));
      if (ox > r.x) next.push(R(r.x, oy, ox - r.x, oy2 - oy));
      if (ox2 < r.x + r.w) next.push(R(ox2, oy, r.x + r.w - ox2, oy2 - oy));
    }
    rects = next;
  }
  return rects.map(r => water(r.x, r.y, r.w, r.h));
}
