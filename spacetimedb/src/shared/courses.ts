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
  /** floor rects only: the height of this slab — a raised platform. Where
   *  it meets a lower slab its edge is a cliff face (a wall from the lower
   *  level up to this one, no rail on top) that a ball on the lower side
   *  hits and a ball on top rolls off. Ramps climb onto it; everything
   *  placed on it (blocks, bumpers, hazards, the cup) sits at its level. */
  z?: number;
}

export type ZoneKind =
  | 'sand' | 'ice' | 'water' | 'slope' | 'boost' | 'jump' | 'tele'
  | 'conveyor' | 'spinner' | 'fan' | 'trampoline' | 'magnet' | 'cannon' | 'gravity'
  /** a passage bored through a raised platform: the ball rolls under it at
   *  `level` while another ball rolls over the top */
  | 'tunnel';

export interface Zone extends Rect {
  kind: ZoneKind;
  /** slope / boost / conveyor / fan / cannon / gravity: direction in degrees (0 = +x, 90 = +y i.e. down). */
  angle?: number;
  /** slope: downhill acceleration (u/s², also sets how steep the ramp is) ·
   *  boost: acceleration · jump: launch vz · conveyor: belt speed ·
   *  spinner: rad/s (negative = the other way) · fan: blow acceleration ·
   *  trampoline: bounce vz · magnet: pull (negative = push) · cannon: muzzle speed ·
   *  gravity: sideways pull (u/s², on the ground AND in the air; stronger
   *  than the felt's grip and nothing ever rests in it). */
  power?: number;
  /** cannon: launch height (vz). */
  lift?: number;
  /** tele: where the ball comes out. */
  tx?: number;
  ty?: number;
  /** tunnel: the floor height the passage runs at. Left out, it is the
   *  highest lower green the tunnel touches (the lawn, 0, if none) — see
   *  `tunnelLevel`. */
  level?: number;
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
  | { type: 'slide'; dx: number; dy: number; period: number; phase?: number } // seconds
  | { type: 'swing'; cx: number; cy: number; amp: number; period: number; phase?: number } // pendulum: ±amp degrees about (cx,cy)
  | { type: 'blink'; period: number; duty: number; phase?: number }; // laser gate: solid for `duty` of each period

/** A solid polygon. Static when it has no motion. `h` = wall height
 *  (default: unjumpable); the ball clears a low wall when its z exceeds h. */
export interface Block {
  pts: number[]; // flat x0,y0,x1,y1,… — convex or concave, any orientation
  h?: number;
  motion?: Motion;
  /** for rotating / swinging blocks: a hub disc drawn/collided at (cx, cy) */
  hub?: number;
  /** wall bounciness multiplier (1 = a normal wall, 2 = rubber that fires the ball back harder) */
  bounce?: number;
  /** editor metadata: how the polygon was generated (so it can be re-generated) */
  gen?:
    | { kind: 'windmill'; len: number; width: number; blades: number }
    | { kind: 'rect'; w: number; h: number; rot: number }
    | { kind: 'tri'; w: number; h: number; rot: number } // a right triangle: pts[0] is the right-angle corner, legs w (along +x) and h (along +y) turned by rot
    | { kind: 'bar'; len: number; width: number }; // a pendulum arm hanging (+y) from its pivot
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
  /** Gravity multiplier (0.3 moon … 2 heavy); jumps, ramps and fans all feel it. */
  gravity?: number;
}

export interface Course {
  id: number;
  name: string;
  theme: 'park' | 'neon' | 'space';
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
  /** wall height — the ball ignores this wall while its z is above it. What
   *  the ball hits is exactly what is drawn: there are no invisible walls. */
  h: number;
  /** a floor rail: it runs along the felt, so `h` is measured from the
   *  ground under the ball (it climbs a wedge with the wedge) */
  rail?: true;
  /** a platform's cliff face: `h` is the platform's height (absolute) and,
   *  like a wedge's face, a ball whose centre is within a small step of the
   *  top climbs onto it (a ramp that meets the platform a hair low still works) */
  cliff?: true;
  /** restitution override (rubber walls); default WALL_E */
  e?: number;
}

/** Height of a standard wall (floor rails and blocks without an explicit
 *  `h`): drawn this tall AND simulated this tall, so a ball that gets
 *  higher than this flies over it. */
export const WALL_H = 1.1;
/** Downward gravity (u/s²) — here, not in physics.ts, so course helpers can size ramps. */
export const GRAVITY = 32;
/** A tunnel's roof: the platform keeps this much of its thickness over the
 *  passage (drawn and simulated — a ball in the tunnel bumps its head on it). */
export const TUNNEL_LID = 0.4;
/** Headroom a tunnel needs under the roof to be a tunnel at all (ball
 *  diameter 0.72 plus a little); a platform lower than that is not bored. */
export const TUNNEL_MIN_CLEAR = 1;

/** Height of the floor under (x, y): the tallest slab covering the point
 *  (a platform laid over a lower floor wins), 0 off the floor. */
export function floorZ(hole: Hole, x: number, y: number): number {
  let z = 0;
  for (const r of hole.floor) if (r.z && r.z > z && pointInRect(x, y, r)) z = r.z;
  return z;
}

const rectsTouch = (a: Rect, b: Rect, eps = 0.01) =>
  a.x < b.x + b.w + eps && b.x < a.x + a.w + eps && a.y < b.y + b.h + eps && b.y < a.y + a.h + eps;

/** The floor height a tunnel's passage runs at: its `level` when set,
 *  else the highest floor rect it touches that is lower than the slab over
 *  its centre (a tunnel drawn from one green across a platform picks up
 *  that green's height), else 0. */
export function tunnelLevel(hole: Hole, t: Zone): number {
  if (t.level !== undefined) return t.level;
  const top = floorZ(hole, t.x + t.w / 2, t.y + t.h / 2);
  let level = 0;
  for (const r of hole.floor) {
    const rz = r.z ?? 0;
    if (rz < top - 1e-6 && rz > level && rectsTouch(r, t)) level = rz;
  }
  return level;
}

/** Does a slab this high get a passage bored through it by a tunnel running at `level`? */
export const tunnelBores = (slabZ: number, level: number) => slabZ - TUNNEL_LID - level >= TUNNEL_MIN_CLEAR - 1e-6;

/** The walls of the tunnels: each tunnel edge, split where floor rects and
 *  other tunnels cross it, is a wall wherever a slab higher than the
 *  passage stands just outside it (the platform's mass to either side) and
 *  open where the outside is a green at the passage's level or lower (the
 *  mouths) or another tunnel at the same level. The wall is as tall as
 *  that slab (absolute), so a ball rolling over the top ignores it. */
export function tunnelWalls(hole: Hole, tunnels: Zone[]): Seg[] {
  const out: Seg[] = [];
  const EPS = 1e-6, PROBE = 1e-3;
  const floor = hole.floor;
  const levels = new Map<Zone, number>();
  for (const t of tunnels) levels.set(t, tunnelLevel(hole, t));
  for (const t of tunnels) {
    const lv = levels.get(t)!;
    const edges: [number, number, number, number, number, number][] = [
      [t.x, t.y, t.x + t.w, t.y, 0, -1],
      [t.x + t.w, t.y, t.x + t.w, t.y + t.h, 1, 0],
      [t.x + t.w, t.y + t.h, t.x, t.y + t.h, 0, 1],
      [t.x, t.y + t.h, t.x, t.y, -1, 0],
    ];
    for (const [ax, ay, bx, by, nx, ny] of edges) {
      const horizontal = Math.abs(ay - by) < EPS;
      const len = horizontal ? bx - ax : by - ay;
      const ts = new Set<number>([0, 1]);
      for (const o of [...floor, ...tunnels]) {
        if (o === t) continue;
        for (const v of horizontal ? [o.x, o.x + o.w] : [o.y, o.y + o.h]) {
          const tt = (v - (horizontal ? ax : ay)) / len;
          if (tt > EPS && tt < 1 - EPS) ts.add(tt);
        }
      }
      const sorted = [...ts].sort((a, b) => a - b);
      let run: { t0: number; t1: number; h: number } | null = null;
      const flush = () => {
        if (!run) return;
        out.push({ ax: ax + (bx - ax) * run.t0, ay: ay + (by - ay) * run.t0, bx: ax + (bx - ax) * run.t1, by: ay + (by - ay) * run.t1, h: run.h });
        run = null;
      };
      for (let i = 0; i + 1 < sorted.length; i++) {
        const t0 = sorted[i], t1 = sorted[i + 1];
        const tm = (t0 + t1) / 2;
        const mx = ax + (bx - ax) * tm + nx * PROBE, my = ay + (by - ay) * tm + ny * PROBE;
        const zIn = floorZ(hole, mx - nx * 2 * PROBE, my - ny * 2 * PROBE);
        const zOut = floorZ(hole, mx, my);
        let h = 0;
        // only where the passage is really bored on our side, and the outside is solid platform
        if (tunnelBores(zIn, lv) && zOut > lv + EPS) {
          h = zOut;
          for (const o of tunnels) if (o !== t && pointInRect(mx, my, o) && Math.abs(levels.get(o)! - lv) < 0.05 && tunnelBores(zOut, lv)) h = 0;
        }
        if (h > 0 && run && Math.abs(run.h - h) < EPS && Math.abs(run.t1 - t0) < EPS) run.t1 = t1;
        else { flush(); if (h > 0) run = { t0, t1, h }; }
      }
      flush();
    }
  }
  return out;
}

/** A platform's cliff faces with the tunnel mouths cut out of them: the
 *  part of a cliff that lies inside a tunnel bored through that slab is
 *  the mouth, open to a ball at the passage's level. */
export function cutTunnelMouths(hole: Hole, segs: Seg[], tunnels: Zone[]): Seg[] {
  if (!tunnels.length) return segs;
  const EPS = 0.01;
  const out: Seg[] = [];
  for (const s of segs) {
    if (!s.cliff) { out.push(s); continue; }
    let pieces: Seg[] = [s];
    for (const t of tunnels) {
      const lv = tunnelLevel(hole, t);
      if (!tunnelBores(s.h, lv)) continue;
      pieces = pieces.flatMap(p => {
        const horizontal = Math.abs(p.ay - p.by) < 1e-6;
        // the segment must lie along the tunnel's span in the other axis
        const across = horizontal ? p.ay : p.ax;
        const lo = horizontal ? t.y : t.x, hi = horizontal ? t.y + t.h : t.x + t.w;
        if (across < lo - EPS || across > hi + EPS) return [p];
        const a = horizontal ? p.ax : p.ay, b = horizontal ? p.bx : p.by;
        const c0 = horizontal ? t.x : t.y, c1 = horizontal ? t.x + t.w : t.y + t.h;
        const min = Math.min(a, b), max = Math.max(a, b);
        if (max <= c0 + EPS || min >= c1 - EPS) return [p];
        const keep: Seg[] = [];
        const mk = (u0: number, u1: number): Seg => {
          const q: Seg = horizontal ? { ...p, ax: u0, bx: u1 } : { ...p, ay: u0, by: u1 };
          return q;
        };
        // keep the parts outside [c0, c1], in the segment's own direction
        const dir = b >= a ? 1 : -1;
        const parts: [number, number][] = [];
        if (min < c0 - EPS) parts.push([min, c0]);
        if (max > c1 + EPS) parts.push([c1, max]);
        for (const [u0, u1] of parts) keep.push(dir > 0 ? mk(u0, u1) : mk(u1, u0));
        return keep;
      });
    }
    out.push(...pieces);
  }
  return out;
}

export const R = (x: number, y: number, w: number, h: number, z?: number): Rect => (z ? { x, y, w, h, z } : { x, y, w, h });
export const rectPts = (r: Rect) => [r.x, r.y, r.x + r.w, r.y, r.x + r.w, r.y + r.h, r.x, r.y + r.h];
export const polyRect = (x: number, y: number, w: number, h: number): Block => ({ pts: rectPts(R(x, y, w, h)) });

/** Points of a star: `n` tips at radius `r`, the notches between them at
 *  `r * inner`. A block shaped like this is a real star-shaped obstacle. */
export function polyStar(cx: number, cy: number, r: number, n = 5, inner = 0.45, rot = -Math.PI / 2): number[] {
  const out: number[] = [];
  const k = Math.max(3, Math.min(12, Math.round(n)));
  for (let i = 0; i < k * 2; i++) {
    const a = rot + (i / (k * 2)) * Math.PI * 2;
    const rr = i % 2 ? r * inner : r;
    out.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  return out;
}

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

/** Walls of a floor: the union's boundary as rails, and every step between
 *  slabs of different heights as a cliff face. Each rect edge is split at
 *  the other rects' boundaries and each piece is judged by what lies just
 *  outside it: nothing — a rail (rides the felt, WALL_H tall); a lower slab
 *  — a cliff face, a wall as tall as this slab (absolute; the ball on top
 *  rolls off it, the ball below bounces off it); a slab at least as high —
 *  a doorway, no wall (a higher one makes its own cliff). A piece buried
 *  under a higher slab on its inner side belongs to that slab, not this. */
export function floorWalls(floor: Rect[]): Seg[] {
  const out: Seg[] = [];
  const EPS = 1e-6, PROBE = 1e-3;
  const zAt = (x: number, y: number): number => {
    let z = -Infinity;
    for (const o of floor) if (pointInRect(x, y, o)) z = Math.max(z, o.z ?? 0);
    return z;
  };
  for (const r of floor) {
    const rz = r.z ?? 0;
    // edges with their outward normals
    const edges: [number, number, number, number, number, number][] = [
      [r.x, r.y, r.x + r.w, r.y, 0, -1],
      [r.x + r.w, r.y, r.x + r.w, r.y + r.h, 1, 0],
      [r.x + r.w, r.y + r.h, r.x, r.y + r.h, 0, 1],
      [r.x, r.y + r.h, r.x, r.y, -1, 0],
    ];
    for (const [ax, ay, bx, by, nx, ny] of edges) {
      const horizontal = Math.abs(ay - by) < EPS;
      const len = horizontal ? bx - ax : by - ay; // signed
      // split the edge where any other rect's boundary crosses it
      const ts = new Set<number>([0, 1]);
      for (const o of floor) {
        if (o === r) continue;
        for (const v of horizontal ? [o.x, o.x + o.w] : [o.y, o.y + o.h]) {
          const t = (v - (horizontal ? ax : ay)) / len;
          if (t > EPS && t < 1 - EPS) ts.add(t);
        }
      }
      const sorted = [...ts].sort((a, b) => a - b);
      let run: { t0: number; t1: number; h: number; rail: boolean } | null = null;
      const flush = () => {
        if (!run) return;
        const seg: Seg = {
          ax: ax + (bx - ax) * run.t0, ay: ay + (by - ay) * run.t0,
          bx: ax + (bx - ax) * run.t1, by: ay + (by - ay) * run.t1,
          h: run.h,
        };
        if (run.rail) seg.rail = true; else seg.cliff = true;
        out.push(seg);
        run = null;
      };
      for (let i = 0; i + 1 < sorted.length; i++) {
        const t0 = sorted[i], t1 = sorted[i + 1];
        const tm = (t0 + t1) / 2;
        const mx = ax + (bx - ax) * tm, my = ay + (by - ay) * tm;
        const zIn = zAt(mx - nx * PROBE, my - ny * PROBE);
        const zOut = zAt(mx + nx * PROBE, my + ny * PROBE);
        let kind: { h: number; rail: boolean } | null = null;
        if (zIn > rz + EPS) kind = null; // a higher slab covers this side: its edge, not ours
        else if (zOut === -Infinity) kind = { h: WALL_H, rail: true }; // the outside: a rail
        else if (zOut < rz - EPS) kind = { h: rz, rail: false }; // a drop: this slab's cliff face
        // else: level or higher next door — open
        if (kind && run && run.h === kind.h && run.rail === kind.rail && Math.abs(run.t1 - t0) < EPS) run.t1 = t1;
        else { flush(); if (kind) run = { t0, t1, ...kind }; }
      }
      flush();
    }
  }
  return out;
}

export function polySegs(pts: number[], h = WALL_H, e?: number): Seg[] {
  const out: Seg[] = [];
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const s: Seg = { ax: pts[i * 2], ay: pts[i * 2 + 1], bx: pts[j * 2], by: pts[j * 2 + 1], h };
    if (e !== undefined) s.e = e;
    out.push(s);
  }
  return out;
}

/** A pendulum arm: a bar of `len` × `width` hanging down (+y) from (cx, cy). */
export function barPts(cx: number, cy: number, len: number, width: number): number[] {
  const hw = width / 2;
  return [cx - hw, cy - hw * 0.5, cx + hw, cy - hw * 0.5, cx + hw, cy + len, cx - hw, cy + len];
}

/** Rotation (radians) of a rotate / swing block at time t; 0 for the rest. */
export function motionAngle(m: Motion, t: number): number {
  if (m.type === 'rotate') return m.speed * t;
  if (m.type === 'swing') return ((m.amp * Math.PI) / 180) * Math.sin(((t / m.period) + (m.phase ?? 0)) * Math.PI * 2);
  return 0;
}

/** Is a blinking (laser gate) block solid right now? Everything else: always. */
export function moverActive(b: Block, t: number): boolean {
  const m = b.motion;
  if (!m || m.type !== 'blink') return true;
  const f = ((t / m.period) + (m.phase ?? 0)) % 1;
  return (f < 0 ? f + 1 : f) < m.duty;
}

/** A moving block's polygon at time t (seconds since the hole started). */
export function blockPtsAt(b: Block, t: number): number[] {
  const m = b.motion;
  if (!m || m.type === 'blink') return b.pts;
  const out = new Array<number>(b.pts.length);
  if (m.type === 'rotate' || m.type === 'swing') {
    const a = motionAngle(m, t);
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

/** A ramp that climbs exactly `rise` units over its run (to meet a platform
 *  that high): the slope's power is the gravity share that makes the wedge
 *  that steep. Enter it from the low edge; `angle` points downhill. */
export function slopeTo(x: number, y: number, w: number, h: number, angle: number, rise: number): Zone {
  const ext = rampExtent({ kind: 'slope', x, y, w, h, angle });
  const power = Math.round(GRAVITY * Math.sin(Math.atan(rise / (ext || 1))) * 1000) / 1000;
  return { kind: 'slope', x, y, w, h, angle, power };
}

/** Length of a slope zone measured along its downhill direction. */
export function rampExtent(z: Zone): number {
  const a = ((z.angle ?? 0) * Math.PI) / 180;
  return Math.abs(z.w * Math.cos(a)) + Math.abs(z.h * Math.sin(a));
}

/** Where (x, y) sits along a slope's downhill run: 0 at the top edge, 1 at
 *  the bottom edge (clamped). Height is proportional to 1 − this. */
export function rampFrac(z: Zone, x: number, y: number): number {
  const a = ((z.angle ?? 0) * Math.PI) / 180;
  const ext = rampExtent(z) || 1;
  const s = ((x - (z.x + z.w / 2)) * Math.cos(a) + (y - (z.y + z.h / 2)) * Math.sin(a)) / ext + 0.5;
  return s < 0 ? 0 : s > 1 ? 1 : s;
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
export const sand = (x: number, y: number, w: number, h: number): Zone => ({ kind: 'sand', x, y, w, h });
export const ice = (x: number, y: number, w: number, h: number): Zone => ({ kind: 'ice', x, y, w, h });
export const water = (x: number, y: number, w: number, h: number): Zone => ({ kind: 'water', x, y, w, h });
export const slope = (x: number, y: number, w: number, h: number, angle: number, power = 3.5): Zone =>
  ({ kind: 'slope', x, y, w, h, angle, power });
export const boost = (x: number, y: number, w: number, h: number, angle: number, power = 40): Zone =>
  ({ kind: 'boost', x, y, w, h, angle, power });
export const jump = (x: number, y: number, w: number, h: number, power = 11): Zone =>
  ({ kind: 'jump', x, y, w, h, power });
export const tele = (x: number, y: number, w: number, h: number, tx: number, ty: number): Zone =>
  ({ kind: 'tele', x, y, w, h, tx, ty });
export const bumper = (x: number, y: number, r = 1.1, kick = 9): Bumper => ({ x, y, r, kick });
export const post = (x: number, y: number, r = 0.8): Bumper => ({ x, y, r, kick: 0 });
export const slider = (x: number, y: number, w: number, h: number, dx: number, dy: number, period: number, phase = 0): Block =>
  ({ pts: rectPts(R(x, y, w, h)), motion: { type: 'slide', dx, dy, period, phase } });
// the toy box
export const conveyor = (x: number, y: number, w: number, h: number, angle: number, power = 6): Zone =>
  ({ kind: 'conveyor', x, y, w, h, angle, power });
export const spinner = (x: number, y: number, w: number, h: number, power = 3): Zone => ({ kind: 'spinner', x, y, w, h, power });
export const fan = (x: number, y: number, w: number, h: number, angle: number, power = 30): Zone =>
  ({ kind: 'fan', x, y, w, h, angle, power });
export const trampoline = (x: number, y: number, w: number, h: number, power = 12): Zone => ({ kind: 'trampoline', x, y, w, h, power });
export const magnet = (x: number, y: number, w: number, h: number, power = 25): Zone => ({ kind: 'magnet', x, y, w, h, power });
export const cannon = (x: number, y: number, w: number, h: number, angle: number, power = 24, lift = 10): Zone =>
  ({ kind: 'cannon', x, y, w, h, angle, power, lift });
/** A gravity field: the ball is pulled toward `angle` at `power` u/s², rolling or flying. */
export const gfield = (x: number, y: number, w: number, h: number, angle: number, power = 12): Zone =>
  ({ kind: 'gravity', x, y, w, h, angle, power });
/** A tunnel under a platform: draw it across the platform from the green
 *  on one side to the green on the other; `level` pins the passage's floor. */
export const tunnel = (x: number, y: number, w: number, h: number, level?: number): Zone =>
  (level === undefined ? { kind: 'tunnel', x, y, w, h } : { kind: 'tunnel', x, y, w, h, level });
/** A pendulum arm hanging from (cx, cy), swinging ±amp degrees every `period` s. */
export function pendulum(cx: number, cy: number, len: number, width: number, amp: number, period: number, phase = 0): Block {
  return {
    pts: barPts(cx, cy, len, width), motion: { type: 'swing', cx, cy, amp, period, phase },
    hub: Math.max(0.4, width * 0.8), gen: { kind: 'bar', len, width },
  };
}
/** A laser gate: a wall that is only there `duty` of every `period` seconds. */
export function laser(x: number, y: number, w: number, h: number, period = 2.5, duty = 0.5, phase = 0): Block {
  return { pts: rectPts(R(x, y, w, h)), motion: { type: 'blink', period, duty, phase }, gen: { kind: 'rect', w, h, rot: 0 } };
}
/** A rubber wall block: bounces the ball back harder than it arrived. */
export function rubber(x: number, y: number, w: number, h: number, bounce = 2): Block {
  return { pts: rectPts(R(x, y, w, h)), bounce, gen: { kind: 'rect', w, h, rot: 0 } };
}

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
      // the ramp climbs away from the corridor and drops the ball toward the cup
      zones: [jump(23, 2, 3, 6, 11), water(28, 0, 6, 10), sand(47, 20, 8, 3), slope(46, 10, 10, 8, 270, 4)],
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
      // ice either side, green under the blades — on full ice the windmill
      // never let the ball settle
      zones: [ice(0, 0, 11, 24), ice(29, 0, 11, 24)],
    },
    {
      name: 'Bounce House',
      par: 3,
      tip: 'Bumpers on ice. Chaos.',
      tee: { x: 4, y: 4 },
      cup: { x: 32, y: 22 },
      floor: [R(0, 0, 36, 26)],
      // green strips along the walls: on wall-to-wall ice a bumper kick,
      // a wall bounce and another kick could go round for ever
      zones: [ice(8, 4, 28, 18)],
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
      // a gentle uphill finish, entered from its low edge
      zones: [slope(34, 0, 10, 24, 180, 2.5)],
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

/** Every toy in the box, one per hole — a tour for players and a crib
 *  sheet for map makers (duplicate it in the editor and pull it apart). */
export const TOYBOX: Course = {
  id: 2,
  name: 'Toy Box',
  theme: 'park',
  holes: [
    {
      name: 'Up and Over',
      par: 2,
      tip: 'A real ramp: roll up it with pace and drop off the top.',
      tee: { x: 4, y: 5 },
      cup: { x: 32, y: 5 },
      floor: [R(0, 0, 36, 10)],
      zones: [slope(12, 0, 8, 10, 180, 6)],
    },
    {
      name: 'Belts',
      par: 3,
      tip: 'Conveyor belts carry the ball sideways. Aim upstream.',
      tee: { x: 4, y: 7 },
      cup: { x: 36, y: 7 },
      floor: [R(0, 0, 40, 14)],
      zones: [conveyor(10, 0, 6, 14, 90, 7), conveyor(22, 0, 6, 14, 270, 7)],
      bumpers: [post(19, 3), post(19, 11)],
    },
    {
      name: 'Turntable',
      par: 3,
      tip: 'The spinner flings whatever rolls onto it. Use it or skirt it.',
      tee: { x: 4, y: 26 },
      cup: { x: 26, y: 4 },
      floor: [R(0, 0, 30, 30)],
      zones: [spinner(9, 9, 12, 12, 2.5)],
      bumpers: [post(24, 12), post(12, 24)],
    },
    {
      name: 'Blower',
      par: 2,
      tip: 'The fan floats the ball over the water — if you roll in with speed.',
      tee: { x: 4, y: 6 },
      cup: { x: 36, y: 6 },
      floor: [R(0, 0, 40, 12)],
      zones: [fan(9, 0, 6, 12, 0, 30), water(17, 0, 9, 12)],
    },
    {
      name: 'Boing',
      par: 3,
      tip: 'Off the ramp, onto the trampoline, over the wall. Flat out and you fly the wall yourself.',
      tee: { x: 4, y: 5 },
      cup: { x: 40, y: 5 },
      floor: [R(0, 0, 44, 10)],
      zones: [slope(10, 0, 6, 10, 180, 9), trampoline(16, 0, 11, 10, 14)],
      blocks: [{ ...polyRect(27, 0, 1, 10), h: 1.2 }],
    },
    {
      name: 'Force Field',
      par: 4,
      tip: 'The cup sits in a repulsor. Come in hard, or hunt for the calm spot.',
      tee: { x: 4, y: 10 },
      cup: { x: 30, y: 10 },
      floor: [R(0, 0, 36, 20)],
      zones: [magnet(25, 5, 10, 10, -28), magnet(10, 12, 8, 8, 22)],
    },
    {
      name: 'Cannon',
      par: 2,
      tip: 'Roll into the cannon to load it, then aim and fire: the shot flies.',
      tee: { x: 4, y: 5 },
      cup: { x: 46, y: 5 },
      floor: [R(0, 0, 50, 10)],
      zones: [cannon(14, 2, 4, 6, 0, 34, 9), water(20, 0, 12, 10)],
    },
    {
      name: 'Swing and Zap',
      par: 3,
      tip: 'A pendulum sweeps the lane, then a laser gate blinks. Watch the rhythm.',
      tee: { x: 4, y: 6 },
      cup: { x: 41, y: 6 },
      floor: [R(0, 0, 44, 12)],
      blocks: [pendulum(22, 0, 9, 1.2, 60, 3), laser(32, 0, 1, 12, 2.5, 0.5), rubber(37, 4, 1, 4, 2)],
    },
    {
      name: 'Moon',
      par: 2,
      tip: 'Low gravity: the jump pad sends you halfway to orbit.',
      tee: { x: 4, y: 5 },
      cup: { x: 36, y: 5 },
      floor: [R(0, 0, 40, 10)],
      zones: [jump(8, 0, 4, 10, 11), water(14, 0, 12, 10)],
      gravity: 0.4,
    },
    {
      name: 'Gravity Field',
      par: 3,
      tip: 'The purple field pulls the ball sideways — rolling or flying. Aim upstream; nothing rests in it.',
      tee: { x: 4, y: 4 },
      cup: { x: 40, y: 4 },
      floor: [R(0, 0, 44, 16)],
      zones: [gfield(12, 0, 20, 16, 90, 9), sand(34, 12, 10, 4)],
      bumpers: [post(37, 8, 0.6)],
    },
    {
      name: 'Platforms',
      par: 3,
      tip: 'A raised green. Climb the ramp onto it — too soft rolls back; the far edge is a drop to the cup.',
      tee: { x: 4, y: 6 },
      cup: { x: 46, y: 6 },
      floor: [R(0, 0, 50, 12), R(18, 0, 18, 12, 1.5)],
      zones: [slopeTo(12, 0, 6, 12, 180, 1.5), sand(40, 0, 3, 12)],
      bumpers: [post(27, 3, 0.6), post(27, 9, 0.6)],
    },
    {
      name: 'Underpass',
      par: 3,
      tip: 'A tunnel runs under the raised green. Roll through it — or climb the ramp and putt over the top.',
      tee: { x: 4, y: 6 },
      cup: { x: 44, y: 6 },
      floor: [R(0, 0, 48, 12), R(16, 0, 16, 12, 2)],
      zones: [tunnel(16, 4, 16, 4), slopeTo(10, 0, 6, 3, 180, 2), slopeTo(32, 9, 6, 3, 0, 2)],
      blocks: [polyRect(9, 3, 1, 1), polyRect(38, 8, 1, 1)],
    },
  ],
};

export const COURSES: Course[] = [PARK, NEON, TOYBOX];

export function courseOf(id: number): Course {
  return COURSES[id] ?? COURSES[0];
}

export function holeOf(courseId: number, holeIndex: number): Hole {
  const c = courseOf(courseId);
  return c.holes[Math.min(holeIndex, c.holes.length - 1)];
}
