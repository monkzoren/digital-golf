// Course + hole definitions. SHARED between the SpacetimeDB module (which
// simulates against them) and the client (which renders them and previews
// shots). Pure data + pure geometry helpers — nothing in here may touch
// SpacetimeDB, the DOM, timers or randomness.
//
// World units: the ball has radius BALL_R (see physics.ts); a comfortable
// lane is 7–9 units wide; a whole hole fits in roughly 48 × 30. Axes: x to
// the right, y DOWN (screen-like), z up (only the ball has a z).

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ZoneKind = 'sand' | 'ice' | 'water' | 'slope' | 'boost' | 'jump' | 'tele';

export interface Zone extends Rect {
  kind: ZoneKind;
  /** slope / boost: direction in degrees (0 = +x, 90 = +y i.e. down). */
  angle?: number;
  /** slope: acceleration (u/s²) · boost: acceleration (u/s²) · jump: vz. */
  power?: number;
  /** tele: where the ball comes out. */
  tx?: number;
  ty?: number;
}

export interface Bumper {
  x: number;
  y: number;
  r: number;
  /** extra speed handed to the ball on contact (0 = a plain round post). */
  kick: number;
}

export type Motion =
  | { type: 'rotate'; cx: number; cy: number; speed: number } // rad/s, about (cx,cy)
  | { type: 'slide'; dx: number; dy: number; period: number; phase?: number }; // seconds

/** A solid polygon. Static when it has no motion. `h` = wall height
 *  (default: unjumpable); the ball clears a low wall when its z exceeds h. */
export interface Block {
  pts: number[]; // flat x0,y0,x1,y1,… — convex or concave, any orientation
  h?: number;
  motion?: Motion;
  /** for rotating blocks: a hub disc drawn/collided at (cx, cy) */
  hub?: number;
  /** editor metadata: how the polygon was generated (so it can be re-generated) */
  gen?: { kind: 'windmill'; len: number; width: number; blades: number } | { kind: 'rect'; w: number; h: number; rot: number };
}

export interface Hole {
  name: string;
  par: number;
  tee: { x: number; y: number };
  cup: { x: number; y: number };
  /** The playable floor: a union of axis-aligned rects. Every boundary edge
   *  of the union is an (unjumpable) wall. */
  floor: Rect[];
  blocks?: Block[];
  zones?: Zone[];
  bumpers?: Bumper[];
  /** One-line hint shown on the hole intro card. */
  tip?: string;
  /** Visual theme (see client THEMES); defaults to the course's. */
  theme?: string;
}

export interface Course {
  id: number;
  name: string;
  theme: 'park' | 'neon';
  holes: Hole[];
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
export interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** wall height — the ball ignores this wall while its z is above it */
  h: number;
}

const WALL_TALL = 1e9;

export const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
export const rectPts = (r: Rect) => [r.x, r.y, r.x + r.w, r.y, r.x + r.w, r.y + r.h, r.x, r.y + r.h];
export const polyRect = (x: number, y: number, w: number, h: number): Block => ({ pts: rectPts(R(x, y, w, h)) });

/** Points of a regular polygon / star-ish shape, for wacky obstacles. */
export function polyNgon(cx: number, cy: number, r: number, n: number, rot = 0): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return out;
}

/** The polygon of a windmill: `blades` arms of length `len` and width
 *  `width` joined at the centre — one concave polygon, one rotating block. */
export function windmillPts(cx: number, cy: number, len: number, width: number, blades: number): number[] {
  const out: number[] = [];
  const n = Math.max(2, Math.min(6, Math.round(blades)));
  const hw = width * 0.5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const dx = Math.cos(a), dy = Math.sin(a);
    const nx = -dy, ny = dx;
    // base-left → tip-left → tip-right → base-right, going around clockwise
    out.push(cx + nx * hw + dx * hw * 0.6, cy + ny * hw + dy * hw * 0.6);
    out.push(cx + dx * len + nx * hw, cy + dy * len + ny * hw);
    out.push(cx + dx * len - nx * hw, cy + dy * len - ny * hw);
    out.push(cx - nx * hw + dx * hw * 0.6, cy - ny * hw + dy * hw * 0.6);
  }
  return out;
}

/** A windmill block rotating about (cx,cy) at `speed` rad/s. */
export function windmill(cx: number, cy: number, len: number, speed: number, blades = 2, width = 0.7): Block[] {
  return [{
    pts: windmillPts(cx, cy, len, width, blades),
    motion: { type: 'rotate', cx, cy, speed },
    hub: Math.max(0.5, width * 0.9),
    gen: { kind: 'windmill', len, width, blades },
  }];
}

export function pointInRect(px: number, py: number, r: Rect): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

export function pointInFloor(px: number, py: number, hole: Hole): boolean {
  for (const r of hole.floor) if (pointInRect(px, py, r)) return true;
  return false;
}

export function pointInPoly(px: number, py: number, pts: number[]): boolean {
  let inside = false;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2], yi = pts[i * 2 + 1];
    const xj = pts[j * 2], yj = pts[j * 2 + 1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Boundary of a union of axis-aligned rects as wall segments: each rect
 *  edge minus the parts that lie inside (or on the boundary of) another
 *  rect. Two rects sharing an edge therefore open a doorway between them. */
export function floorWalls(floor: Rect[]): Seg[] {
  const out: Seg[] = [];
  const EPS = 1e-6;
  for (let i = 0; i < floor.length; i++) {
    const r = floor[i];
    const edges: [number, number, number, number][] = [
      [r.x, r.y, r.x + r.w, r.y],
      [r.x + r.w, r.y, r.x + r.w, r.y + r.h],
      [r.x + r.w, r.y + r.h, r.x, r.y + r.h],
      [r.x, r.y + r.h, r.x, r.y],
    ];
    for (const [ax, ay, bx, by] of edges) {
      // parametrise the edge 0..1 and cut out covered intervals
      let pieces: [number, number][] = [[0, 1]];
      for (let j = 0; j < floor.length; j++) {
        if (i === j) continue;
        const o = floor[j];
        // interval of t where the edge lies within o's closed box
        let t0: number, t1: number;
        if (Math.abs(ay - by) < EPS) {
          // horizontal edge
          if (ay < o.y - EPS || ay > o.y + o.h + EPS) continue;
          const lo = Math.max(Math.min(ax, bx), o.x), hi = Math.min(Math.max(ax, bx), o.x + o.w);
          if (hi - lo <= EPS) continue;
          t0 = (lo - ax) / (bx - ax); t1 = (hi - ax) / (bx - ax);
        } else {
          if (ax < o.x - EPS || ax > o.x + o.w + EPS) continue;
          const lo = Math.max(Math.min(ay, by), o.y), hi = Math.min(Math.max(ay, by), o.y + o.h);
          if (hi - lo <= EPS) continue;
          t0 = (lo - ay) / (by - ay); t1 = (hi - ay) / (by - ay);
        }
        const c0 = Math.min(t0, t1), c1 = Math.max(t0, t1);
        const next: [number, number][] = [];
        for (const [p0, p1] of pieces) {
          if (c1 <= p0 + EPS || c0 >= p1 - EPS) { next.push([p0, p1]); continue; }
          if (c0 > p0 + EPS) next.push([p0, c0]);
          if (c1 < p1 - EPS) next.push([c1, p1]);
        }
        pieces = next;
      }
      for (const [p0, p1] of pieces) {
        out.push({
          ax: ax + (bx - ax) * p0, ay: ay + (by - ay) * p0,
          bx: ax + (bx - ax) * p1, by: ay + (by - ay) * p1,
          h: WALL_TALL,
        });
      }
    }
  }
  return out;
}

export function polySegs(pts: number[], h = WALL_TALL): Seg[] {
  const out: Seg[] = [];
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    out.push({ ax: pts[i * 2], ay: pts[i * 2 + 1], bx: pts[j * 2], by: pts[j * 2 + 1], h });
  }
  return out;
}

/** A moving block's polygon at time t (seconds since the hole started). */
export function blockPtsAt(b: Block, t: number): number[] {
  const m = b.motion;
  if (!m) return b.pts;
  const out = new Array<number>(b.pts.length);
  if (m.type === 'rotate') {
    const a = m.speed * t;
    const c = Math.cos(a), s = Math.sin(a);
    for (let i = 0; i < b.pts.length; i += 2) {
      const x = b.pts[i] - m.cx, y = b.pts[i + 1] - m.cy;
      out[i] = m.cx + x * c - y * s;
      out[i + 1] = m.cy + x * s + y * c;
    }
  } else {
    const k = Math.sin(((t / m.period) + (m.phase ?? 0)) * Math.PI * 2);
    for (let i = 0; i < b.pts.length; i += 2) {
      out[i] = b.pts[i] + m.dx * k;
      out[i + 1] = b.pts[i + 1] + m.dy * k;
    }
  }
  return out;
}

export function holeBounds(hole: Hole) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of hole.floor) {
    minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------
const sand = (x: number, y: number, w: number, h: number): Zone => ({ kind: 'sand', x, y, w, h });
const ice = (x: number, y: number, w: number, h: number): Zone => ({ kind: 'ice', x, y, w, h });
const water = (x: number, y: number, w: number, h: number): Zone => ({ kind: 'water', x, y, w, h });
const slope = (x: number, y: number, w: number, h: number, angle: number, power = 3.5): Zone =>
  ({ kind: 'slope', x, y, w, h, angle, power });
const boost = (x: number, y: number, w: number, h: number, angle: number, power = 40): Zone =>
  ({ kind: 'boost', x, y, w, h, angle, power });
const jump = (x: number, y: number, w: number, h: number, power = 11): Zone =>
  ({ kind: 'jump', x, y, w, h, power });
const tele = (x: number, y: number, w: number, h: number, tx: number, ty: number): Zone =>
  ({ kind: 'tele', x, y, w, h, tx, ty });
const bumper = (x: number, y: number, r = 1.1, kick = 9): Bumper => ({ x, y, r, kick });
const post = (x: number, y: number, r = 0.8): Bumper => ({ x, y, r, kick: 0 });
const slider = (x: number, y: number, w: number, h: number, dx: number, dy: number, period: number, phase = 0): Block =>
  ({ pts: rectPts(R(x, y, w, h)), motion: { type: 'slide', dx, dy, period, phase } });

export const PARK: Course = {
  id: 0,
  name: 'Sunny Park',
  theme: 'park',
  holes: [
    {
      name: 'First Putt',
      par: 2,
      tip: 'Drag back from your ball and let go. Further = harder.',
      tee: { x: 4, y: 5 },
      cup: { x: 30, y: 5 },
      floor: [R(0, 0, 34, 10)],
      zones: [sand(20, 6.5, 6, 3.5)],
    },
    {
      name: 'Dogleg',
      par: 3,
      tip: 'Bank it off the far wall — walls are bouncy.',
      tee: { x: 4, y: 4 },
      cup: { x: 32, y: 22 },
      floor: [R(0, 0, 36, 8), R(28, 8, 8, 18)],
      zones: [sand(29, 12, 6, 3)],
      bumpers: [post(24, 3)],
    },
    {
      name: 'Pinball',
      par: 3,
      tip: 'Red bumpers fire the ball back out. Aim between them.',
      tee: { x: 4, y: 11 },
      cup: { x: 34, y: 11 },
      floor: [R(0, 0, 38, 22)],
      bumpers: [bumper(15, 6), bumper(15, 16), bumper(22, 11), bumper(29, 5), bumper(29, 17)],
    },
    {
      name: 'Windmill',
      par: 3,
      tip: 'Time your shot through the blades.',
      tee: { x: 4, y: 6 },
      cup: { x: 40, y: 6 },
      floor: [R(0, 0, 44, 12)],
      blocks: [
        polyRect(20, 0, 2, 3.2), polyRect(20, 8.8, 2, 3.2),
        ...windmill(21, 6, 4.2, 1.6, 2, 0.8),
      ],
    },
    {
      name: 'Sand Island',
      par: 3,
      tip: 'The slope drags balls left; come in with pace.',
      tee: { x: 4, y: 14 },
      cup: { x: 33, y: 8 },
      floor: [R(0, 0, 40, 28)],
      zones: [
        sand(24, 0, 16, 5), sand(24, 12, 16, 6), sand(36, 5, 4, 7),
        slope(12, 0, 12, 28, 180, 3),
        sand(0, 22, 40, 6),
      ],
      blocks: [polyRect(18, 8, 2, 12)],
    },
    {
      name: 'Splash',
      par: 3,
      tip: 'Hit the yellow jump pad with speed to fly over the water.',
      tee: { x: 4, y: 5 },
      cup: { x: 40, y: 5 },
      floor: [R(0, 0, 44, 10)],
      zones: [jump(14, 2, 3, 6, 11), water(19, 0, 8, 10)],
    },
    {
      name: 'Ice Rink',
      par: 3,
      tip: 'Ice barely slows the ball. Tap it.',
      tee: { x: 4, y: 12 },
      cup: { x: 36, y: 12 },
      floor: [R(0, 0, 40, 24)],
      zones: [ice(8, 0, 26, 24)],
      blocks: [
        { pts: polyNgon(16, 7, 2.2, 4, Math.PI / 4) },
        { pts: polyNgon(24, 17, 2.2, 4, Math.PI / 4) },
        { pts: polyNgon(28, 8, 1.8, 6) },
      ],
    },
    {
      name: 'Turbo Lane',
      par: 3,
      tip: 'Boost pads accelerate you in the direction of the arrows.',
      tee: { x: 4, y: 4 },
      cup: { x: 4, y: 24 },
      floor: [R(0, 0, 40, 8), R(32, 8, 8, 12), R(0, 20, 40, 8)],
      zones: [boost(14, 1, 6, 6, 0), boost(33, 10, 6, 6, 90), boost(22, 21, 6, 6, 180)],
      blocks: [slider(12, 22, 1.5, 4, 0, 2, 3)],
    },
    {
      name: 'The Gauntlet',
      par: 5,
      tip: 'Everything at once. Good luck.',
      tee: { x: 4, y: 5 },
      cup: { x: 52, y: 25 },
      floor: [R(0, 0, 56, 10), R(46, 10, 10, 20)],
      blocks: [
        polyRect(16, 0, 2, 2.8), polyRect(16, 7.2, 2, 2.8),
        ...windmill(17, 5, 3.6, 2.2, 2, 0.7),
        slider(48, 15, 6, 1.4, 0, 0, 1),
      ],
      zones: [jump(23, 2, 3, 6, 11), water(28, 0, 6, 10), sand(47, 20, 8, 3), slope(46, 10, 10, 10, 90, 2.5)],
      bumpers: [bumper(40, 3), bumper(40, 7)],
    },
  ],
};

export const NEON: Course = {
  id: 1,
  name: 'Neon Orbit',
  theme: 'neon',
  holes: [
    {
      name: 'Warp Gate',
      par: 2,
      tip: 'Purple gates teleport the ball, keeping its speed.',
      tee: { x: 4, y: 5 },
      cup: { x: 44, y: 21 },
      floor: [R(0, 0, 20, 10), R(28, 16, 20, 10)],
      zones: [tele(15, 2, 4, 6, 31, 21)],
    },
    {
      name: 'Spinner',
      par: 3,
      tip: 'Three blades, two gaps. Wait for your window.',
      tee: { x: 4, y: 12 },
      cup: { x: 36, y: 12 },
      floor: [R(0, 0, 40, 24)],
      blocks: [...windmill(20, 12, 7, 1.2, 3, 0.9)],
      zones: [ice(0, 0, 40, 24)],
    },
    {
      name: 'Bounce House',
      par: 3,
      tip: 'Bumpers on ice. Chaos.',
      tee: { x: 4, y: 4 },
      cup: { x: 32, y: 22 },
      floor: [R(0, 0, 36, 26)],
      zones: [ice(8, 0, 28, 26)],
      bumpers: [bumper(14, 8), bumper(22, 14), bumper(14, 20), bumper(28, 6), bumper(30, 15)],
    },
    {
      name: 'Slidewinder',
      par: 4,
      tip: 'The doors slide. Patience or pace.',
      tee: { x: 4, y: 5 },
      cup: { x: 46, y: 5 },
      floor: [R(0, 0, 50, 10)],
      blocks: [
        polyRect(14, 0, 1.6, 4), slider(14, 4, 1.6, 6, 0, 3.5, 2.6),
        polyRect(28, 6, 1.6, 4), slider(28, 0, 1.6, 6, 0, 3.5, 2.6, 0.5),
        polyRect(40, 0, 1.6, 4), slider(40, 4, 1.6, 6, 0, 3.5, 2),
      ],
    },
    {
      name: 'Lava Moat',
      par: 3,
      tip: 'Boost, then jump. Short balls take a swim.',
      tee: { x: 4, y: 6 },
      cup: { x: 46, y: 6 },
      floor: [R(0, 0, 50, 12)],
      zones: [boost(9, 3, 5, 6, 0, 55), jump(16, 3, 3, 6, 13), water(21, 0, 12, 12)],
    },
    {
      name: 'Diamond Field',
      par: 3,
      tip: 'Thread the diamonds — or slam through with a bank.',
      tee: { x: 4, y: 12 },
      cup: { x: 40, y: 12 },
      floor: [R(0, 0, 44, 24)],
      blocks: [
        { pts: polyNgon(14, 6, 2.4, 4) }, { pts: polyNgon(14, 18, 2.4, 4) },
        { pts: polyNgon(22, 12, 2.4, 4) },
        { pts: polyNgon(30, 6, 2.4, 4) }, { pts: polyNgon(30, 18, 2.4, 4) },
      ],
      zones: [slope(34, 0, 10, 24, 270, 2.5)],
    },
    {
      name: 'Hill Climb',
      par: 4,
      tip: 'The whole lane tilts back at you. Commit.',
      tee: { x: 5, y: 26 },
      cup: { x: 5, y: 3 },
      floor: [R(0, 0, 10, 30), R(10, 0, 10, 8), R(10, 22, 10, 8), R(20, 0, 10, 30)],
      zones: [slope(0, 0, 10, 22, 90, 4.2), slope(20, 0, 10, 30, 90, 4.2), boost(12, 24, 6, 4, 0, 50), boost(22, 2, 6, 4, 180, 50)],
      blocks: [polyRect(4, 12, 6, 1.5)],
    },
    {
      name: 'Orbit',
      par: 3,
      tip: 'Two gates, one loop. Read the exits.',
      tee: { x: 4, y: 4 },
      cup: { x: 24, y: 14 },
      floor: [R(0, 0, 48, 8), R(0, 8, 8, 20), R(40, 8, 8, 20), R(8, 20, 32, 8), R(20, 8, 8, 12)],
      zones: [tele(42, 22, 5, 5, 4, 12), tele(2, 22, 5, 5, 44, 4), sand(20, 8, 8, 4)],
      bumpers: [post(24, 4, 1.0), bumper(44, 10, 1.1, 8)],
    },
    {
      name: 'Final Boss',
      par: 5,
      tip: 'Spinners, sliders, lava and a summit. Everything you learned.',
      tee: { x: 4, y: 14 },
      cup: { x: 56, y: 4 },
      floor: [R(0, 0, 40, 28), R(40, 0, 20, 8)],
      blocks: [
        ...windmill(16, 14, 6, 1.4, 4, 0.8),
        slider(28, 4, 1.4, 8, 0, 6, 3.2),
        slider(28, 16, 1.4, 8, 0, 6, 3.2, 0.5),
      ],
      zones: [
        ice(0, 0, 12, 28), sand(30, 24, 10, 4),
        boost(34, 2, 5, 5, 0, 55), jump(40, 2, 3, 4, 12), water(44, 0, 6, 8),
        slope(50, 0, 10, 8, 180, 3),
      ],
      bumpers: [bumper(34, 14, 1.2, 10)],
    },
  ],
};

export const COURSES: Course[] = [PARK, NEON];

export function courseOf(id: number): Course {
  return COURSES[id] ?? COURSES[0];
}

export function holeOf(courseId: number, holeIndex: number): Hole {
  const c = courseOf(courseId);
  return c.holes[Math.min(holeIndex, c.holes.length - 1)];
}
