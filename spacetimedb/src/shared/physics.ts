// Ball physics — SHARED between the module (authoritative) and the client
// (editor test play, dead-reckoning). Deterministic, allocation-light, and
// pure: no SpacetimeDB, no DOM, no randomness.
import {
  type Block, type Bumper, type Hole, type Seg, type Zone,
  WALL_H, blockPtsAt, floorWalls, moverActive, pointInFloor, pointInPoly, pointInRect, polySegs,
  rampExtent, rampFrac,
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
export const MAX_SHOT = 30;
export const MAX_SPEED = 46;
export const CUP_R = 0.78; // capture radius (ball centre)
export const CUP_PULL_R = 2.1; // the cup gently pulls slow balls in
export const CUP_PULL = 4.5;
export const CAPTURE_SPEED = 12.5; // faster than this and the ball skips the cup
export const TELE_COOLDOWN_TICKS = 24;
export const JUMP_MIN_SPEED = 2.5;
export const BUMPER_KICK_MAX_SPEED = 18;
export const RAMP_MAX_SIN = 0.7; // steepest ramp: ~45°
export const MOVER_MAX_SPEED = 16; // a windmill / pendulum shoves, it does not launch
export const RUBBER_MAX_SPEED = 20; // the most a rubber wall hands back
export const BUMPER_KICK_MIN_APPROACH = 1.5; // creep into a bumper and it just bounces you
export const BUMPER_OUT_MAX = 14; // the fastest a bumper kick sends the ball out
export const FAN_HOVER_Z = 2.2; // a blower floats the ball about this high
export const STEP_CLIMB = 0.25; // a rolling ball climbs a ramp side this much lower than its centre
export const RAMP_STICK = 0.2; // a rolling ball follows a ramp down unless the drop is bigger than this
export const RAMP_FRICTION_MUL = 0.4; // a wedge is smooth: less rolling friction than the flat felt
export const BUMPER_H = 0.9; // a pinball bumper's height (as drawn); a ball above it flies over
export const POST_H = WALL_H; // a plain round post is as tall as a wall
export const HUB_EXTRA = 0.3; // a windmill / pendulum hub stands this much above its blades
export const ON_TOP = 0.001; // a ball this close under a wall's top is on it, not against it
export const bumperH = (p: Bumper) => (p.kick > 0 ? BUMPER_H : POST_H);
/** a ramp steeper than this (its downhill acceleration beats the friction on it) never lets a ball rest */
export const rampRolls = (z: Zone) => zonePower(z) > FRICTION * RAMP_FRICTION_MUL;

// Defaults for the zone `power` field (and cannon `lift`), by kind.
export const ZONE_DEFAULT_POWER: Record<Zone['kind'], number> = {
  sand: 0, ice: 0, water: 0, tele: 0,
  slope: 3.5, boost: 40, jump: 11,
  conveyor: 6, spinner: 3, fan: 30, trampoline: 12, magnet: 25, cannon: 34,
};
export const CANNON_DEFAULT_LIFT = 10;
export const zonePower = (z: Zone) => z.power ?? ZONE_DEFAULT_POWER[z.kind];

export interface BallState {
  x: number;
  y: number;
  /** height above the felt — absolute, so a ball on a ramp carries the ramp's height */
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** ticks until the ball may use a teleporter / cannon again */
  teleTicks: number;
}

export interface StepEvents {
  wall: number; // strongest wall impact this tick (normal speed), 0 = none
  bumper: boolean;
  water: boolean;
  jump: boolean; // jump pad, trampoline, cannon
  tele: boolean;
  boost: boolean; // boost pad, conveyor, fan
  holed: boolean;
  land: boolean;
  oob: boolean; // fell off the world / stuck in a wall — caller resets the ball
}

export const newEvents = (): StepEvents => ({
  wall: 0, bumper: false, water: false, jump: false, tele: false, boost: false,
  holed: false, land: false, oob: false,
});

interface RampFace { seg: Seg; zone: Zone }

export interface HoleGeom {
  hole: Hole;
  staticSegs: Seg[];
  /** static blocks as polygons (for the "is the ball inside a wall" test) */
  solids: Block[];
  movers: Block[];
  bumpers: Bumper[];
  zones: Zone[];
  /** slope zones — each is a wedge the ball rolls up and down */
  ramps: Zone[];
  /** the wedges' outer faces: a ball on the flat bounces off them like a low wall */
  rampFaces: RampFace[];
  gravity: number;
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
  const solids: Block[] = [];
  for (const b of hole.blocks ?? []) {
    if (b.motion) movers.push(b);
    else { solids.push(b); staticSegs.push(...polySegs(b.pts, b.h, wallE(b))); }
  }
  const zones = hole.zones ?? [];
  const ramps = zones.filter(z => z.kind === 'slope');
  const rampFaces: RampFace[] = [];
  for (const z of ramps) {
    const c = [z.x, z.y, z.x + z.w, z.y, z.x + z.w, z.y + z.h, z.x, z.y + z.h];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      // h is a placeholder: hitRampFace measures the wedge's real height at the contact point
      rampFaces.push({ seg: { ax: c[i * 2], ay: c[i * 2 + 1], bx: c[j * 2], by: c[j * 2 + 1], h: 1e9 }, zone: z });
    }
  }
  g = {
    hole, staticSegs, solids, movers, bumpers: hole.bumpers ?? [], zones, ramps, rampFaces,
    gravity: GRAVITY * (hole.gravity ?? 1),
  };
  geomCache.set(hole, g);
  return g;
}

/** Restitution of a block's walls: rubber walls bounce harder than they are hit. */
export function wallE(b: Block): number | undefined {
  return b.bounce !== undefined && b.bounce !== 1 ? Math.min(1.6, WALL_E * b.bounce) : undefined;
}

/** How much a slope zone rises from its bottom edge to its top edge: the
 *  acceleration it applies is g·sin θ, so the wedge is drawn to match. */
export function rampRise(z: Zone): number {
  const sin = Math.min(RAMP_MAX_SIN, Math.max(0, zonePower(z) / GRAVITY));
  return rampExtent(z) * Math.tan(Math.asin(sin));
}

/** The slope zone under (x, y), if any. */
export function rampAt(g: HoleGeom, x: number, y: number): Zone | null {
  for (const z of g.ramps) if (pointInRect(x, y, z)) return z;
  return null;
}

/** Height of the surface under (x, y) for a ball at height `z`: 0 on the
 *  flat, up the wedge on a slope — and the top of a wall block the ball is
 *  above (a ball that flies onto a wall lands on it and rolls along it).
 *  Without `z` only the felt counts. */
export function groundZ(g: HoleGeom, x: number, y: number, z = -Infinity): number {
  const r = rampAt(g, x, y);
  let ground = r ? rampRise(r) * (1 - rampFrac(r, x, y)) : 0;
  for (const s of g.solids) {
    const top = s.h ?? WALL_H;
    if (top > ground && z >= top - ON_TOP && pointInPoly(x, y, s.pts)) ground = top;
  }
  return ground;
}

/** The wedge's grade (rise over run). */
export const rampGrade = (z: Zone) => rampRise(z) / (rampExtent(z) || 1);

/** `mul` is the room's shot-power option (1 = normal, 1.3 = turbo). */
export function shotVelocity(angle: number, power: number, mul = 1) {
  const p = Math.max(0, Math.min(1, power));
  const speed = Math.min(MAX_SPEED, (MIN_SHOT + (MAX_SHOT - MIN_SHOT) * p) * mul);
  return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
}

/** The cannon zone a resting ball is loaded in, if any. */
export function cannonAt(g: HoleGeom, x: number, y: number): Zone | null {
  for (const z of g.zones) if (z.kind === 'cannon' && pointInRect(x, y, z)) return z;
  return null;
}

/** A shot from where the ball sits: a putt on the felt, or — loaded in a
 *  cannon — a lofted launch at the cannon's muzzle speed. The player aims
 *  and powers both the same way. */
export function shotFrom(g: HoleGeom, x: number, y: number, angle: number, power: number, mul = 1): { vx: number; vy: number; vz: number } {
  const c = cannonAt(g, x, y);
  if (!c) return { ...shotVelocity(angle, power, mul), vz: 0 };
  const p = Math.max(0, Math.min(1, power));
  const speed = Math.min(MAX_SPEED, (MIN_SHOT + (zonePower(c) - MIN_SHOT) * p) * mul);
  return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, vz: c.lift ?? CANNON_DEFAULT_LIFT };
}

export const speedOf = (b: { vx: number; vy: number }) => Math.hypot(b.vx, b.vy);

/** At rest on the felt (`ground` = the felt height under the ball). */
export function isResting(b: BallState, ground = 0): boolean {
  return b.z <= ground + 0.001 && b.vz === 0 && b.vx === 0 && b.vy === 0;
}

/** isResting against the real felt height at the ball's position. */
export function restingOn(g: HoleGeom, b: BallState): boolean {
  return isResting(b, groundZ(g, b.x, b.y, b.z));
}

// Priority when zones overlap: the first kind listed wins.
const ZONE_PRIORITY: Record<Zone['kind'], number> = {
  water: 0, tele: 1, cannon: 2, jump: 3, trampoline: 4, boost: 5, conveyor: 6, spinner: 7,
  magnet: 8, fan: 9, slope: 10, sand: 11, ice: 12,
};

function zoneAt(g: HoleGeom, x: number, y: number): Zone | null {
  let best: Zone | null = null;
  for (const z of g.zones) {
    if (!pointInRect(x, y, z)) continue;
    if (!best || ZONE_PRIORITY[z.kind] < ZONE_PRIORITY[best.kind]) best = z;
  }
  return best;
}

const zoneCentre = (z: Zone) => ({ x: z.x + z.w / 2, y: z.y + z.h / 2 });
const dirOf = (z: Zone) => { const a = ((z.angle ?? 0) * Math.PI) / 180; return { x: Math.cos(a), y: Math.sin(a) }; };

/** Velocity of a point on a moving block (for pushing the ball). */
function moverVelocity(b: Block, t: number, px: number, py: number, out: { x: number; y: number }) {
  const m = b.motion!;
  if (m.type === 'rotate' || m.type === 'swing') {
    let w: number;
    if (m.type === 'rotate') w = m.speed;
    else {
      const ph = ((t / m.period) + (m.phase ?? 0)) * Math.PI * 2;
      w = ((m.amp * Math.PI) / 180) * Math.cos(ph) * ((Math.PI * 2) / m.period);
    }
    out.x = -(py - m.cy) * w;
    out.y = (px - m.cx) * w;
  } else if (m.type === 'slide') {
    const w = (Math.PI * 2) / m.period;
    const k = Math.cos(((t / m.period) + (m.phase ?? 0)) * Math.PI * 2) * w;
    out.x = m.dx * k;
    out.y = m.dy * k;
  } else {
    out.x = 0; out.y = 0;
  }
}

const tmpV = { x: 0, y: 0 };

function capSpeed(b: BallState) {
  const sp = speedOf(b);
  if (sp > MAX_SPEED) { b.vx *= MAX_SPEED / sp; b.vy *= MAX_SPEED / sp; }
}

/** Resolve the ball against one wall segment. Returns impact normal speed (0 = no hit). */
/** Top of a wall for the ball where it is: rails ride the felt (up a wedge
 *  with it, never up a block), blocks stand on the flat. */
const wallTop = (g: HoleGeom, b: BallState, s: Seg) => (s.rail ? s.h + groundZ(g, b.x, b.y) : s.h);

function hitSeg(g: HoleGeom, b: BallState, s: Seg, surfVx: number, surfVy: number): number {
  if (b.z >= wallTop(g, b, s) - ON_TOP) return 0; // over it, or riding along its top
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
  const e = s.e ?? WALL_E;
  let out = -vn * e; // normal speed leaving the wall
  // rubber: fires slow balls back harder, but never past RUBBER_MAX_SPEED —
  // and a fast ball just gets a normal bounce (no perpetual ping-pong)
  if (e > WALL_E && out > RUBBER_MAX_SPEED) out = Math.max(RUBBER_MAX_SPEED, -vn * WALL_E);
  const j = -vn + out;
  b.vx += nx * j;
  b.vy += ny * j;
  // a touch of tangential scrub
  b.vx *= 0.985;
  b.vy *= 0.985;
  if (e > WALL_E) capSpeed(b);
  return -vn;
}

/** A wedge's outer face: solid to a ball on the flat beside it that sits
 *  lower than the face at that point (a real ball climbs a small step). */
function hitRampFace(g: HoleGeom, b: BallState, f: RampFace): number {
  if (pointInRect(b.x, b.y, f.zone)) return 0; // on the ramp itself
  const s = f.seg;
  const dx = s.bx - s.ax, dy = s.by - s.ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((b.x - s.ax) * dx + (b.y - s.ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = s.ax + dx * t, cy = s.ay + dy * t;
  const faceH = rampRise(f.zone) * (1 - rampFrac(f.zone, cx, cy));
  if (b.z + STEP_CLIMB >= faceH) return 0;
  return hitSeg(g, b, s, 0, 0);
}

function hitBumper(b: BallState, p: Bumper): boolean {
  if (b.z > bumperH(p)) return false; // sailing over it
  let nx = b.x - p.x, ny = b.y - p.y;
  const rr = p.r + BALL_R;
  const d2 = nx * nx + ny * ny;
  if (d2 >= rr * rr) return false;
  const d = Math.sqrt(d2) || 1e-6;
  nx /= d; ny /= d;
  b.x = p.x + nx * rr;
  b.y = p.y + ny * rr;
  const vn = b.vx * nx + b.vy * ny;
  // A pinball bumper fires balls that ARRIVE with some pace back out hard;
  // fast ones only bounce (with some loss) and a ball creeping in just
  // bounces elastically — so a ball trapped between a bumper and a wall
  // runs out of energy instead of being kicked for ever.
  const fast = speedOf(b) > BUMPER_KICK_MAX_SPEED;
  if (vn >= 0) return false;
  const e = p.kick > 0 ? (fast ? 0.7 : 1.0) : WALL_E;
  const j = -(1 + e) * vn;
  b.vx += nx * j;
  b.vy += ny * j;
  if (p.kick > 0 && !fast && -vn > BUMPER_KICK_MIN_APPROACH) {
    // fire it out — but to a ceiling, not "however fast it came plus kick":
    // a ball caught between a bumper and a wall must lose energy overall
    const want = Math.min(BUMPER_OUT_MAX, -vn + p.kick);
    const extra = want - -vn * e;
    if (extra > 0) { b.vx += nx * extra; b.vy += ny * extra; }
    capSpeed(b);
    return true;
  }
  return p.kick > 0 && fast;
}

/** Is the ball's centre somewhere it can never legitimately be: off the
 *  floor, or inside a wall block / moving block at time `t`? A ball that
 *  gets there (squeezed by a mover) is stuck for good — the caller resets it. */
export function insideSolid(g: HoleGeom, x: number, y: number, z: number, t: number): boolean {
  if (!pointInFloor(x, y, g.hole)) return true;
  for (const s of g.solids) {
    if (z >= (s.h ?? WALL_H) - ON_TOP) continue;
    if (pointInPoly(x, y, s.pts)) return true;
  }
  for (const m of g.movers) {
    if (z >= (m.h ?? WALL_H) - ON_TOP) continue;
    if (!moverActive(m, t)) continue;
    if (pointInPoly(x, y, blockPtsAt(m, t))) return true;
  }
  return false;
}

/** Resolve the ball against every moving block (edges + windmill hubs) at
 *  time `tt`. Returns the strongest impact. */
function hitMovers(b: BallState, g: HoleGeom, tt: number): number {
  let wall = 0;
  for (const m of g.movers) {
    const mh = m.h ?? WALL_H;
    if (b.z > mh + HUB_EXTRA) continue; // above the block and its hub
    if (!moverActive(m, tt)) continue;
    const pts = blockPtsAt(m, tt);
    const cnt = pts.length / 2;
    const e = wallE(m);
    for (let k = 0; k < cnt; k++) {
      const j = (k + 1) % cnt;
      const seg: Seg = { ax: pts[k * 2], ay: pts[k * 2 + 1], bx: pts[j * 2], by: pts[j * 2 + 1], h: mh };
      if (e !== undefined) seg.e = e;
      moverVelocity(m, tt, b.x, b.y, tmpV);
      const before = speedOf(b);
      const imp = hitSeg(g, b, seg, tmpV.x, tmpV.y);
      if (imp > wall) wall = imp;
      // a mover shoves the ball along, it does not smash it across the map
      const after = speedOf(b);
      if (imp > 0 && after > MOVER_MAX_SPEED && after > before) {
        const k = Math.max(before, MOVER_MAX_SPEED) / after;
        b.vx *= k; b.vy *= k;
      }
    }
    if (m.hub && m.motion && (m.motion.type === 'rotate' || m.motion.type === 'swing')) {
      // the hub stands a little proud of the blades (as drawn)
      if (b.z <= mh + HUB_EXTRA) hitBumper(b, { x: m.motion.cx, y: m.motion.cy, r: m.hub, kick: 0 });
    }
  }
  return wall;
}

/** Which way a surface under a resting ball would carry it (null: none). */
function surfacePush(zone: Zone | null, b: BallState): { x: number; y: number } | null {
  if (!zone) return null;
  switch (zone.kind) {
    case 'conveyor': case 'fan': return dirOf(zone);
    case 'slope': return rampRolls(zone) ? dirOf(zone) : null;
    case 'magnet': {
      const c = zoneCentre(zone);
      const dx = c.x - b.x, dy = c.y - b.y, d = Math.hypot(dx, dy);
      if (d < 0.8) return null;
      const s = zonePower(zone) < 0 ? -1 : 1;
      return { x: (dx / d) * s, y: (dy / d) * s };
    }
    case 'spinner': {
      const c = zoneCentre(zone);
      const dx = b.x - c.x, dy = b.y - c.y, d = Math.hypot(dx, dy);
      const w = zonePower(zone);
      // too close to the middle to be flung faster than it would settle
      if (d < 0.3 || d > Math.min(zone.w, zone.h) / 2 || d * Math.abs(w) < 2.5) return null;
      const s = w < 0 ? -1 : 1;
      return { x: (-dy / d) * s, y: (dx / d) * s };
    }
    default: return null;
  }
}

/** Would a nudge that way run the ball straight into a wall? (A belt that
 *  pins the ball against a wall must not keep it "rolling" for ever.) */
function pushBlocked(g: HoleGeom, b: BallState, dx: number, dy: number): boolean {
  const px = b.x + dx * 0.12, py = b.y + dy * 0.12;
  const near = (s: Seg) => {
    if (b.z >= wallTop(g, b, s) - ON_TOP) return false;
    const ex = s.bx - s.ax, ey = s.by - s.ay;
    const len2 = ex * ex + ey * ey;
    let t = len2 > 0 ? ((px - s.ax) * ex + (py - s.ay) * ey) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = s.ax + ex * t, cy = s.ay + ey * t;
    return Math.hypot(px - cx, py - cy) < BALL_R - 0.01;
  };
  for (const s of g.staticSegs) if (near(s)) return true;
  for (const p of g.bumpers) if (Math.hypot(px - p.x, py - p.y) < p.r + BALL_R - 0.01) return true;
  return false;
}

/** Advance the ball one tick (with substeps). `t` = seconds since the hole
 *  started (drives moving blocks). Writes what happened into `ev`. */
export function stepBall(b: BallState, g: HoleGeom, t: number, ev: StepEvents, collide = true): void {
  const G = g.gravity;
  const g0 = groundZ(g, b.x, b.y, b.z);
  if (isResting(b, g0)) {
    if (b.teleTicks > 0) b.teleTicks--;
    if (b.z < g0) b.z = g0; // placed under a ramp (tee on a slope): sit on it
    if (!collide) return;
    // A moving block shoves a ball that is sitting in its path — and if it
    // has already swept over the ball's centre, the ball is stuck: reset.
    if (g.movers.length) {
      const imp = hitMovers(b, g, t + DT);
      if (imp > ev.wall) ev.wall = imp;
    }
    if (isResting(b, g0)) {
      if (g.movers.length && insideSolid(g, b.x, b.y, b.z, t + DT)) { ev.oob = true; return; }
      // a belt, fan, magnet, spinner or cannon under the ball wakes it up —
      // unless it would only grind the ball into a wall
      const push = surfacePush(zoneAt(g, b.x, b.y), b);
      if (!push || pushBlocked(g, b, push.x, push.y)) return;
      b.vx = push.x * 0.01; b.vy = push.y * 0.01;
    }
  }
  const sp = Math.hypot(b.vx, b.vy, b.vz);
  const n = Math.max(1, Math.min(14, Math.ceil((sp * DT) / (BALL_R * 0.45))));
  const h = DT / n;
  const cup = g.hole.cup;
  const x0 = b.x, y0 = b.y;
  let stuck = false;
  let carried: Zone | null = null; // a surface that drove the ball this tick
  for (let i = 0; i < n; i++) {
    const tt = t + (i + 1) * h;
    const ground = groundZ(g, b.x, b.y, b.z);
    const onGround = b.z <= ground + 0.001 && b.vz <= 0;
    const zone = zoneAt(g, b.x, b.y);
    if (onGround) {
      b.z = ground; b.vz = 0;
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
              b.z = groundZ(g, b.x, b.y);
              b.teleTicks = TELE_COOLDOWN_TICKS;
              ev.tele = true;
            }
            break;
          case 'cannon': {
            // roll in and the cannon loads you: the ball stops in the
            // barrel and the NEXT shot (shotFrom) is a lofted launch
            const c = zoneCentre(zone);
            if (Math.hypot(b.x - c.x, b.y - c.y) > 0.05 || speedOf(b) > 0) {
              b.x = c.x; b.y = c.y; b.z = groundZ(g, c.x, c.y);
              b.vx = 0; b.vy = 0; b.vz = 0;
              ev.boost = true;
              return;
            }
            break;
          }
          case 'jump': {
            const s = speedOf(b);
            if (s > JUMP_MIN_SPEED) {
              b.vz = zonePower(zone);
              b.z = ground + 0.01;
              ev.jump = true;
            }
            break;
          }
          case 'boost': {
            const d = dirOf(zone);
            const p = zonePower(zone);
            b.vx += d.x * p * h;
            b.vy += d.y * p * h;
            capSpeed(b);
            fr = FRICTION * 0.4;
            ev.boost = true;
            break;
          }
          case 'conveyor': {
            // the belt drags the ball's along-belt speed toward its own;
            // across the belt it rolls freely, so a crossing ball drifts
            // downstream and a shot upstream can still punch through
            const d = dirOf(zone);
            const s = zonePower(zone);
            const along = b.vx * d.x + b.vy * d.y;
            const k = Math.min(1, 3 * h);
            const dv = (s - along) * k;
            b.vx += d.x * dv;
            b.vy += d.y * dv;
            fr = FRICTION * 0.6;
            carried = zone;
            break;
          }
          case 'spinner': {
            // a turntable: inside its disc the felt itself is moving
            const c = zoneCentre(zone);
            const dx = b.x - c.x, dy = b.y - c.y;
            const r = Math.min(zone.w, zone.h) / 2;
            if (dx * dx + dy * dy < r * r) {
              const w = zonePower(zone);
              const k = Math.min(1, 6 * h);
              b.vx += (-dy * w - b.vx) * k;
              b.vy += (dx * w - b.vy) * k;
              fr = FRICTION * 0.5;
              carried = zone;
            }
            break;
          }
          case 'magnet': {
            // pulls toward (or, negative, shoves away from) its centre;
            // lets go once the ball is in close and slow, so it can settle
            const c = zoneCentre(zone);
            const dx = c.x - b.x, dy = c.y - b.y;
            const d = Math.hypot(dx, dy);
            const p = zonePower(zone);
            if (d > 0.05 && (p < 0 || d > 0.8 || speedOf(b) > 1)) {
              b.vx += (dx / d) * p * h;
              b.vy += (dy / d) * p * h;
              capSpeed(b);
              carried = zone;
            }
            break;
          }
          case 'slope': {
            const d = dirOf(zone);
            const p = zonePower(zone);
            b.vx += d.x * p * h;
            b.vy += d.y * p * h;
            fr = FRICTION * RAMP_FRICTION_MUL;
            if (rampRolls(zone)) carried = zone; // it keeps rolling until something stops it
            break;
          }
          case 'sand': fr = FRICTION_SAND; break;
          case 'ice': fr = FRICTION_ICE; break;
        }
      }
      // rolling friction — a constant deceleration, never past zero
      if (b.z <= ground + 0.001) {
        const s = speedOf(b);
        if (s > 0) {
          const ns = Math.max(0, s - fr * h);
          b.vx *= ns / s; b.vy *= ns / s;
        }
      }
    } else {
      b.vz -= G * h;
      const k = 1 - AIR_DRAG * h;
      b.vx *= k; b.vy *= k;
    }
    // a blower works on the ground and in the air: it shoves the ball along
    // and floats it a couple of units up, so it sails off the far side
    if (zone && zone.kind === 'fan') {
      const d = dirOf(zone);
      const p = zonePower(zone);
      b.vx += d.x * p * h;
      b.vy += d.y * p * h;
      capSpeed(b);
      if (b.z < ground + FAN_HOVER_Z) {
        b.vz += (G + p * 0.35) * h;
        if (b.z <= ground + 0.001) b.z = ground + 0.01;
      }
      ev.boost = true;
      carried = zone;
    }
    // cup pull + capture (felt level only)
    if (b.z - ground < 0.3) {
      const cx = cup.x - b.x, cy = cup.y - b.y;
      const d = Math.hypot(cx, cy);
      const s = speedOf(b);
      if (d < CUP_R && s < CAPTURE_SPEED) {
        b.x = cup.x; b.y = cup.y; b.z = groundZ(g, cup.x, cup.y);
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
    const rampWas = onGround ? rampAt(g, px, py) : null;
    b.x += b.vx * h;
    b.y += b.vy * h;
    const groundNow = groundZ(g, b.x, b.y, b.z);
    // a ball that rolls UP a wedge and off it keeps climbing: the wedge is a
    // launch ramp, so it leaves with the slope's vertical share of its pace
    if (rampWas && rampWas !== rampAt(g, b.x, b.y)) {
      const d = dirOf(rampWas);
      const up = -(b.vx * d.x + b.vy * d.y); // pace along the uphill direction
      if (up > 0) { b.vz = up * rampGrade(rampWas); ev.jump = ev.jump || b.vz > 3; }
    }
    // rolling DOWN a ramp the felt falls away a hair each substep: stay on
    // it rather than skipping down in micro-hops (a real step still drops)
    if (onGround && b.vz <= 0 && b.z > groundNow && b.z - groundNow < RAMP_STICK) { b.z = groundNow; b.vz = 0; }
    if (b.z > groundNow + 0.001 || b.vz > 0) {
      b.z += b.vz * h;
      if (b.z <= groundNow) {
        b.z = groundNow;
        const landing = zoneAt(g, b.x, b.y);
        if (landing && landing.kind === 'trampoline' && b.vz < -1) {
          // boing: back up at least the pad's launch speed
          b.vz = Math.max(zonePower(landing), -b.vz * 0.9);
          b.z = groundNow + 0.01;
          ev.jump = true;
        } else if (b.vz < -3) { b.vz = -b.vz * 0.42; ev.land = true; } // a hard landing skips — off water too
        else {
          b.vz = 0;
          if (landing && landing.kind === 'water' && groundNow <= 0) {
            // a soft drop into a pond is a splash even when the ball comes
            // down dead vertical: otherwise it sits on the water, resting,
            // and is never looked at again
            ev.water = true;
            b.vx = 0; b.vy = 0;
            return;
          }
        }
      }
    } else if (b.z < groundNow) {
      b.z = groundNow; // rolling up a ramp: stay on the felt
    }
    if (!collide) continue;
    for (const s of g.staticSegs) {
      const imp = hitSeg(g, b, s, 0, 0);
      if (imp > ev.wall) ev.wall = imp;
    }
    for (const f of g.rampFaces) {
      const imp = hitRampFace(g, b, f);
      if (imp > ev.wall) ev.wall = imp;
    }
    if (g.movers.length) {
      const imp = hitMovers(b, g, tt);
      if (imp > ev.wall) ev.wall = imp;
    }
    for (const p of g.bumpers) if (hitBumper(b, p)) ev.bumper = true;
    // A moving block can squeeze the ball against a wall and through it —
    // off the floor or into a block, where the wall pushes it the wrong way
    // for ever. Rather than let it through, hold it where it was so the
    // mover passes and the ball is free again; if where it was is already
    // inside something too, it is stuck and gets reset (ev.oob).
    if (g.movers.length && insideSolid(g, b.x, b.y, b.z, tt)) {
      if (insideSolid(g, px, py, b.z, tt)) stuck = true;
      else { b.x = px; b.y = py; b.vx *= 0.5; b.vy *= 0.5; }
    }
  }
  if (b.teleTicks > 0) b.teleTicks--;
  const gz = groundZ(g, b.x, b.y, b.z);
  const grounded = b.z <= gz + 0.001 && b.vz === 0;
  const onRollingRamp = carried !== null && carried.kind === 'slope' && pointInRect(b.x, b.y, carried);
  if (grounded && speedOf(b) < REST_SPEED && !onRollingRamp) {
    b.vx = 0; b.vy = 0; b.z = gz;
  }
  // pinned: a belt / fan / magnet driving the ball into a wall moves it
  // nowhere — let it come to rest there rather than "roll" (or hover) for ever
  if (carried && (grounded || carried.kind === 'fan') && Math.hypot(b.x - x0, b.y - y0) < 0.012) {
    b.vx = 0; b.vy = 0; b.vz = 0; b.z = gz;
  }
  if (stuck || !pointInFloor(b.x, b.y, g.hole)) ev.oob = true;
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
