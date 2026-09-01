// Ball physics — SHARED between the module (authoritative) and the client
// (shot preview, dead-reckoning). Deterministic, allocation-light, and pure:
// no SpacetimeDB, no DOM, no randomness.
import {
  type Block, type Bumper, type Hole, type Seg, type Zone,
  blockPtsAt, floorWalls, pointInFloor, pointInRect, polySegs,
} from './courses';

export const TICK_HZ = 30;
export const DT = 1 / TICK_HZ;

export const BALL_R = 0.45;
export const WALL_E = 0.78; // wall restitution
export const GRAVITY = 32;
export const FRICTION = 5.2; // green: rolling deceleration, u/s²
export const FRICTION_SAND = 26;
export const FRICTION_ICE = 1.4;
export const AIR_DRAG = 0.12; // per second, airborne only
export const REST_SPEED = 0.42;
export const MIN_SHOT = 3;
export const MAX_SHOT = 36;
export const MAX_SPEED = 46;
export const CUP_R = 0.78; // capture radius (ball centre)
export const CUP_PULL_R = 2.1; // the cup gently pulls slow balls in
export const CUP_PULL = 4.5;
export const CAPTURE_SPEED = 12.5; // faster than this and the ball skips the cup
export const TELE_COOLDOWN_TICKS = 24;
export const JUMP_MIN_SPEED = 2.5;
export const BUMPER_KICK_MAX_SPEED = 18;

export interface BallState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** ticks until the ball may use a teleporter again */
  teleTicks: number;
}

export interface StepEvents {
  wall: number; // strongest wall impact this tick (normal speed), 0 = none
  bumper: boolean;
  water: boolean;
  jump: boolean;
  tele: boolean;
  boost: boolean;
  holed: boolean;
  land: boolean;
  oob: boolean; // fell off the world — caller resets the ball
}

export const newEvents = (): StepEvents => ({
  wall: 0, bumper: false, water: false, jump: false, tele: false, boost: false,
  holed: false, land: false, oob: false,
});

export interface HoleGeom {
  hole: Hole;
  staticSegs: Seg[];
  movers: Block[];
  bumpers: Bumper[];
  zones: Zone[];
}

// Geometry is derived once per Hole object and remembered for as long as
// that object lives — the module keeps parsed holes in a keyed cache, the
// client keeps the ones it is rendering.
const geomCache = new WeakMap<Hole, HoleGeom>();

/** Forget the cached geometry of a hole that was edited in place. */
export function invalidateGeom(hole: Hole) {
  geomCache.delete(hole);
}

export function geomOf(hole: Hole): HoleGeom {
  let g = geomCache.get(hole);
  if (g) return g;
  const staticSegs = floorWalls(hole.floor);
  const movers: Block[] = [];
  for (const b of hole.blocks ?? []) {
    if (b.motion) movers.push(b);
    else staticSegs.push(...polySegs(b.pts, b.h));
  }
  g = { hole, staticSegs, movers, bumpers: hole.bumpers ?? [], zones: hole.zones ?? [] };
  geomCache.set(hole, g);
  return g;
}

/** `mul` is the room's shot-power option (1 = normal, 1.3 = turbo). */
export function shotVelocity(angle: number, power: number, mul = 1) {
  const p = Math.max(0, Math.min(1, power));
  const speed = Math.min(MAX_SPEED, (MIN_SHOT + (MAX_SHOT - MIN_SHOT) * p) * mul);
  return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
}

export const speedOf = (b: { vx: number; vy: number }) => Math.hypot(b.vx, b.vy);

export function isResting(b: BallState): boolean {
  return b.z <= 0.001 && b.vz === 0 && b.vx === 0 && b.vy === 0;
}

// Priority when zones overlap: the first kind listed wins.
const ZONE_PRIORITY: Record<Zone['kind'], number> = {
  water: 0, tele: 1, jump: 2, boost: 3, slope: 4, sand: 5, ice: 6,
};

function zoneAt(g: HoleGeom, x: number, y: number): Zone | null {
  let best: Zone | null = null;
  for (const z of g.zones) {
    if (!pointInRect(x, y, z)) continue;
    if (!best || ZONE_PRIORITY[z.kind] < ZONE_PRIORITY[best.kind]) best = z;
  }
  return best;
}

/** Velocity of a point on a moving block (for pushing the ball). */
function moverVelocity(b: Block, t: number, px: number, py: number, out: { x: number; y: number }) {
  const m = b.motion!;
  if (m.type === 'rotate') {
    out.x = -(py - m.cy) * m.speed;
    out.y = (px - m.cx) * m.speed;
  } else {
    const w = (Math.PI * 2) / m.period;
    const k = Math.cos(((t / m.period) + (m.phase ?? 0)) * Math.PI * 2) * w;
    out.x = m.dx * k;
    out.y = m.dy * k;
  }
}

const tmpV = { x: 0, y: 0 };

/** Resolve the ball against one wall segment. Returns impact normal speed (0 = no hit). */
function hitSeg(b: BallState, s: Seg, surfVx: number, surfVy: number): number {
  if (b.z > s.h) return 0;
  const dx = s.bx - s.ax, dy = s.by - s.ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((b.x - s.ax) * dx + (b.y - s.ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = s.ax + dx * t, cy = s.ay + dy * t;
  let nx = b.x - cx, ny = b.y - cy;
  const d2 = nx * nx + ny * ny;
  if (d2 >= BALL_R * BALL_R) return 0;
  let d = Math.sqrt(d2);
  if (d < 1e-6) {
    // dead centre on the segment: push along its left normal
    const l = Math.sqrt(len2) || 1;
    nx = -dy / l; ny = dx / l; d = 1e-6;
  } else {
    nx /= d; ny /= d;
  }
  b.x = cx + nx * BALL_R;
  b.y = cy + ny * BALL_R;
  // relative velocity against the (possibly moving) surface
  const rvx = b.vx - surfVx, rvy = b.vy - surfVy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  const j = -(1 + WALL_E) * vn;
  b.vx += nx * j;
  b.vy += ny * j;
  // a touch of tangential scrub
  b.vx *= 0.985;
  b.vy *= 0.985;
  return -vn;
}

function hitBumper(b: BallState, p: Bumper): boolean {
  let nx = b.x - p.x, ny = b.y - p.y;
  const rr = p.r + BALL_R;
  const d2 = nx * nx + ny * ny;
  if (d2 >= rr * rr) return false;
  const d = Math.sqrt(d2) || 1e-6;
  nx /= d; ny /= d;
  b.x = p.x + nx * rr;
  b.y = p.y + ny * rr;
  const vn = b.vx * nx + b.vy * ny;
  // A pinball bumper fires slow balls out hard but only bounces fast ones
  // (with some loss), so a ball on ice cannot ping-pong forever.
  const fast = speedOf(b) > BUMPER_KICK_MAX_SPEED;
  if (vn < 0) {
    const e = p.kick > 0 ? (fast ? 0.7 : 1.0) : WALL_E;
    const j = -(1 + e) * vn;
    b.vx += nx * j;
    b.vy += ny * j;
  }
  if (p.kick > 0) {
    if (!fast) {
      b.vx += nx * p.kick;
      b.vy += ny * p.kick;
    }
    const sp = speedOf(b);
    if (sp > MAX_SPEED) { b.vx *= MAX_SPEED / sp; b.vy *= MAX_SPEED / sp; }
    return true;
  }
  return vn < 0;
}

/** Advance the ball one tick (with substeps). `t` = seconds since the hole
 *  started (drives moving blocks). Writes what happened into `ev`. */
export function stepBall(b: BallState, g: HoleGeom, t: number, ev: StepEvents, collide = true): void {
  if (isResting(b)) {
    if (b.teleTicks > 0) b.teleTicks--;
    return;
  }
  const sp = Math.hypot(b.vx, b.vy, b.vz);
  const n = Math.max(1, Math.min(14, Math.ceil((sp * DT) / (BALL_R * 0.45))));
  const h = DT / n;
  const cup = g.hole.cup;
  for (let i = 0; i < n; i++) {
    const tt = t + (i + 1) * h;
    const onGround = b.z <= 0.001 && b.vz <= 0;
    if (onGround) {
      b.z = 0; b.vz = 0;
      const zone = zoneAt(g, b.x, b.y);
      let fr = FRICTION;
      if (zone) {
        switch (zone.kind) {
          case 'water':
            ev.water = true;
            b.vx = 0; b.vy = 0;
            return;
          case 'tele':
            if (b.teleTicks === 0) {
              b.x = zone.tx!; b.y = zone.ty!;
              b.teleTicks = TELE_COOLDOWN_TICKS;
              ev.tele = true;
            }
            break;
          case 'jump': {
            const s = speedOf(b);
            if (s > JUMP_MIN_SPEED) {
              b.vz = zone.power ?? 11;
              b.z = 0.01;
              ev.jump = true;
            }
            break;
          }
          case 'boost': {
            const a = ((zone.angle ?? 0) * Math.PI) / 180;
            b.vx += Math.cos(a) * (zone.power ?? 40) * h;
            b.vy += Math.sin(a) * (zone.power ?? 40) * h;
            const s = speedOf(b);
            if (s > MAX_SPEED) { b.vx *= MAX_SPEED / s; b.vy *= MAX_SPEED / s; }
            fr = FRICTION * 0.4;
            ev.boost = true;
            break;
          }
          case 'slope': {
            const a = ((zone.angle ?? 0) * Math.PI) / 180;
            b.vx += Math.cos(a) * (zone.power ?? 3.5) * h;
            b.vy += Math.sin(a) * (zone.power ?? 3.5) * h;
            break;
          }
          case 'sand': fr = FRICTION_SAND; break;
          case 'ice': fr = FRICTION_ICE; break;
        }
      }
      // rolling friction — a constant deceleration, never past zero
      if (b.z <= 0.001) {
        const s = speedOf(b);
        if (s > 0) {
          const ns = Math.max(0, s - fr * h);
          b.vx *= ns / s; b.vy *= ns / s;
        }
      }
    } else {
      b.vz -= GRAVITY * h;
      const k = 1 - AIR_DRAG * h;
      b.vx *= k; b.vy *= k;
    }
    // cup pull + capture (ground level only)
    if (b.z < 0.3) {
      const cx = cup.x - b.x, cy = cup.y - b.y;
      const d = Math.hypot(cx, cy);
      const s = speedOf(b);
      if (d < CUP_R && s < CAPTURE_SPEED) {
        b.x = cup.x; b.y = cup.y; b.z = 0;
        b.vx = 0; b.vy = 0; b.vz = 0;
        ev.holed = true;
        return;
      }
      if (d < CUP_PULL_R && d > 1e-4) {
        b.vx += (cx / d) * CUP_PULL * h;
        b.vy += (cy / d) * CUP_PULL * h;
        // lip-out: a fast ball crossing the cup loses some pace
        if (d < CUP_R) { b.vx *= 0.94; b.vy *= 0.94; }
      }
    }
    const px = b.x, py = b.y;
    b.x += b.vx * h;
    b.y += b.vy * h;
    if (b.z > 0 || b.vz > 0) {
      b.z += b.vz * h;
      if (b.z <= 0) {
        b.z = 0;
        if (b.vz < -3) { b.vz = -b.vz * 0.42; ev.land = true; }
        else b.vz = 0;
      }
    }
    if (!collide) continue;
    for (const s of g.staticSegs) {
      const imp = hitSeg(b, s, 0, 0);
      if (imp > ev.wall) ev.wall = imp;
    }
    for (const m of g.movers) {
      if (m.h !== undefined && b.z > m.h) continue;
      const pts = blockPtsAt(m, tt);
      const cnt = pts.length / 2;
      for (let k = 0; k < cnt; k++) {
        const j = (k + 1) % cnt;
        const seg: Seg = { ax: pts[k * 2], ay: pts[k * 2 + 1], bx: pts[j * 2], by: pts[j * 2 + 1], h: m.h ?? 1e9 };
        moverVelocity(m, tt, b.x, b.y, tmpV);
        const imp = hitSeg(b, seg, tmpV.x, tmpV.y);
        if (imp > ev.wall) ev.wall = imp;
      }
      if (m.hub && m.motion && m.motion.type === 'rotate') {
        hitBumper(b, { x: m.motion.cx, y: m.motion.cy, r: m.hub, kick: 0 });
      }
    }
    for (const p of g.bumpers) if (hitBumper(b, p)) ev.bumper = true;
    // A moving block can squeeze the ball against a wall and out of the
    // world: rather than let it through, hold it where it was — the mover
    // passes and the ball is free again.
    if (g.movers.length && !pointInFloor(b.x, b.y, g.hole) && pointInFloor(px, py, g.hole)) {
      b.x = px; b.y = py;
      b.vx *= 0.5; b.vy *= 0.5;
    }
  }
  if (b.teleTicks > 0) b.teleTicks--;
  if (b.z <= 0.001 && b.vz === 0 && speedOf(b) < REST_SPEED) {
    b.vx = 0; b.vy = 0; b.z = 0;
  }
  if (!pointInFloor(b.x, b.y, g.hole)) ev.oob = true;
}

/** Elastic ball-vs-ball. Returns true when the two touched. */
export function collideBalls(a: BallState, b: BallState): boolean {
  if (Math.abs(a.z - b.z) > BALL_R * 1.6) return false;
  let nx = b.x - a.x, ny = b.y - a.y;
  const d2 = nx * nx + ny * ny;
  const rr = BALL_R * 2;
  if (d2 >= rr * rr || d2 < 1e-9) return false;
  const d = Math.sqrt(d2);
  nx /= d; ny /= d;
  const overlap = rr - d;
  a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5;
  b.x += nx * overlap * 0.5; b.y += ny * overlap * 0.5;
  const van = a.vx * nx + a.vy * ny;
  const vbn = b.vx * nx + b.vy * ny;
  if (van - vbn <= 0) return true; // separating already
  const e = 0.9;
  // equal masses: swap normal components (with restitution)
  const pa = ((1 + e) * (vbn - van)) / 2;
  a.vx += nx * pa; a.vy += ny * pa;
  b.vx -= nx * pa; b.vy -= ny * pa;
  return true;
}
