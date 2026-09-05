// The on-the-wire map format: a hole is stored as one JSON string per
// `hole` row. Both the module (before it accepts a save) and the editor
// (before it lets you publish) validate through here, so a map that passes
// in the browser passes on the server.
import type { Block, Bumper, Hole, Motion, Rect, Zone, ZoneKind } from './courses';
import { pointInFloor } from './courses';

export const LIMITS = {
  holesPerCourse: 18,
  floorRects: 48,
  blocks: 48,
  blockPts: 24,
  zones: 48,
  bumpers: 32,
  holeBytes: 14_000,
  courseNameLen: 28,
  holeNameLen: 24,
  tipLen: 80,
  coord: 400, // |x|,|y| ≤ this
  size: 400,
  par: 12,
  floorZ: 20, // tallest platform
};

export const THEME_NAMES = ['park', 'neon', 'space'];
const ZONE_KINDS: ZoneKind[] = ['sand', 'ice', 'water', 'slope', 'boost', 'jump', 'tele', 'conveyor', 'spinner', 'fan', 'trampoline', 'magnet', 'cannon', 'gravity', 'tunnel'];
/** zones whose `power` may be negative (it flips their direction) */
const SIGNED_POWER: ZoneKind[] = ['spinner', 'magnet'];

const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

function cleanRect(v: any, what: string, floor = false): Rect {
  if (!v || !num(v.x) || !num(v.y) || !num(v.w) || !num(v.h)) throw new Error(`${what}: bad rect`);
  if (v.w < 0.5 || v.h < 0.5) throw new Error(`${what}: too small (min 0.5)`);
  if (v.w > LIMITS.size || v.h > LIMITS.size) throw new Error(`${what}: too big`);
  if (Math.abs(v.x) > LIMITS.coord || Math.abs(v.y) > LIMITS.coord) throw new Error(`${what}: out of range`);
  const out: Rect = { x: r2(v.x), y: r2(v.y), w: r2(v.w), h: r2(v.h) };
  if (floor && v.z != null) {
    if (!num(v.z)) throw new Error(`${what}: bad height`);
    const z = r2(clampN(v.z, 0, LIMITS.floorZ));
    if (z > 0) out.z = z;
  }
  return out;
}

function cleanPts(v: any, what: string): number[] {
  if (!Array.isArray(v) || v.length < 6 || v.length % 2 !== 0) throw new Error(`${what}: needs ≥ 3 points`);
  if (v.length / 2 > LIMITS.blockPts) throw new Error(`${what}: too many points (max ${LIMITS.blockPts})`);
  const out: number[] = [];
  for (const n of v) {
    if (!num(n) || Math.abs(n) > LIMITS.coord) throw new Error(`${what}: bad point`);
    out.push(r2(n));
  }
  return out;
}

function cleanMotion(v: any): Motion | undefined {
  if (v == null) return undefined;
  if (v.type === 'rotate') {
    if (!num(v.cx) || !num(v.cy) || !num(v.speed)) throw new Error('rotate: bad params');
    return { type: 'rotate', cx: r2(v.cx), cy: r2(v.cy), speed: r2(clampN(v.speed, -6, 6)) };
  }
  if (v.type === 'slide') {
    if (!num(v.dx) || !num(v.dy) || !num(v.period)) throw new Error('slide: bad params');
    const m: Motion = {
      type: 'slide', dx: r2(clampN(v.dx, -60, 60)), dy: r2(clampN(v.dy, -60, 60)),
      period: r2(clampN(v.period, 0.5, 30)),
    };
    if (num(v.phase)) m.phase = r2(v.phase);
    return m;
  }
  if (v.type === 'swing') {
    if (!num(v.cx) || !num(v.cy) || !num(v.amp) || !num(v.period)) throw new Error('swing: bad params');
    const m: Motion = {
      type: 'swing', cx: r2(v.cx), cy: r2(v.cy), amp: r2(clampN(v.amp, 5, 180)), period: r2(clampN(v.period, 0.5, 30)),
    };
    if (num(v.phase)) m.phase = r2(v.phase);
    return m;
  }
  if (v.type === 'blink') {
    if (!num(v.period) || !num(v.duty)) throw new Error('blink: bad params');
    const m: Motion = { type: 'blink', period: r2(clampN(v.period, 0.5, 30)), duty: r2(clampN(v.duty, 0.1, 0.9)) };
    if (num(v.phase)) m.phase = r2(v.phase);
    return m;
  }
  throw new Error('unknown motion');
}

/** Validate + normalise a hole object (any JSON). Throws with a message. */
export function cleanHole(raw: any): Hole {
  if (!raw || typeof raw !== 'object') throw new Error('hole is not an object');
  const name = String(raw.name ?? 'Untitled').trim().slice(0, LIMITS.holeNameLen) || 'Untitled';
  const par = num(raw.par) ? clampN(Math.round(raw.par), 1, LIMITS.par) : 3;
  if (!Array.isArray(raw.floor) || raw.floor.length === 0) throw new Error('a hole needs at least one floor');
  if (raw.floor.length > LIMITS.floorRects) throw new Error(`too many floor pieces (max ${LIMITS.floorRects})`);
  const floor = raw.floor.map((r: any, i: number) => cleanRect(r, `floor ${i + 1}`, true));
  if (!raw.tee || !num(raw.tee.x) || !num(raw.tee.y)) throw new Error('missing tee');
  if (!raw.cup || !num(raw.cup.x) || !num(raw.cup.y)) throw new Error('missing cup');
  const tee = { x: r2(raw.tee.x), y: r2(raw.tee.y) };
  const cup = { x: r2(raw.cup.x), y: r2(raw.cup.y) };
  const hole: Hole = { name, par, tee, cup, floor };
  if (!pointInFloor(tee.x, tee.y, hole)) throw new Error('the tee must sit on the floor');
  if (!pointInFloor(cup.x, cup.y, hole)) throw new Error('the cup must sit on the floor');
  if (Math.hypot(tee.x - cup.x, tee.y - cup.y) < 3) throw new Error('tee and cup are too close');
  if (raw.theme != null) {
    const theme = String(raw.theme);
    if (THEME_NAMES.includes(theme)) hole.theme = theme;
  }
  if (raw.tip != null) {
    const tip = String(raw.tip).trim().slice(0, LIMITS.tipLen);
    if (tip) hole.tip = tip;
  }
  if (raw.gravity != null) {
    if (!num(raw.gravity)) throw new Error('bad gravity');
    const gr = r2(clampN(raw.gravity, 0.3, 2));
    if (gr !== 1) hole.gravity = gr;
  }
  if (raw.blocks != null) {
    if (!Array.isArray(raw.blocks)) throw new Error('blocks must be a list');
    if (raw.blocks.length > LIMITS.blocks) throw new Error(`too many blocks (max ${LIMITS.blocks})`);
    hole.blocks = raw.blocks.map((b: any, i: number): Block => {
      const out: Block = { pts: cleanPts(b?.pts, `block ${i + 1}`) };
      if (b.h != null) { if (!num(b.h)) throw new Error(`block ${i + 1}: bad height`); out.h = r2(clampN(b.h, 0.1, 50)); }
      const m = cleanMotion(b.motion);
      if (m) out.motion = m;
      if (b.hub != null) { if (!num(b.hub)) throw new Error(`block ${i + 1}: bad hub`); out.hub = r2(clampN(b.hub, 0.2, 5)); }
      if (b.bounce != null) {
        if (!num(b.bounce)) throw new Error(`block ${i + 1}: bad bounce`);
        const bo = r2(clampN(b.bounce, 0.2, 2.5));
        if (bo !== 1) out.bounce = bo;
      }
      if (b.gen && typeof b.gen === 'object') {
        if (b.gen.kind === 'windmill' && num(b.gen.len) && num(b.gen.width) && num(b.gen.blades)) {
          out.gen = { kind: 'windmill', len: r2(clampN(b.gen.len, 0.5, 60)), width: r2(clampN(b.gen.width, 0.2, 10)), blades: clampN(Math.round(b.gen.blades), 2, 6) };
        } else if (b.gen.kind === 'rect' && num(b.gen.w) && num(b.gen.h) && num(b.gen.rot)) {
          out.gen = { kind: 'rect', w: r2(clampN(b.gen.w, 0.2, 400)), h: r2(clampN(b.gen.h, 0.2, 400)), rot: r2(b.gen.rot) };
        } else if (b.gen.kind === 'tri' && num(b.gen.w) && num(b.gen.h) && num(b.gen.rot)) {
          out.gen = { kind: 'tri', w: r2(clampN(b.gen.w, 0.2, 400)), h: r2(clampN(b.gen.h, 0.2, 400)), rot: r2(b.gen.rot) };
        } else if (b.gen.kind === 'bar' && num(b.gen.len) && num(b.gen.width)) {
          out.gen = { kind: 'bar', len: r2(clampN(b.gen.len, 0.5, 60)), width: r2(clampN(b.gen.width, 0.2, 10)) };
        }
      }
      return out;
    });
  }
  if (raw.zones != null) {
    if (!Array.isArray(raw.zones)) throw new Error('zones must be a list');
    if (raw.zones.length > LIMITS.zones) throw new Error(`too many zones (max ${LIMITS.zones})`);
    hole.zones = raw.zones.map((z: any, i: number): Zone => {
      if (!ZONE_KINDS.includes(z?.kind)) throw new Error(`zone ${i + 1}: unknown kind`);
      const out: Zone = { kind: z.kind, ...cleanRect(z, `zone ${i + 1}`) };
      if (z.angle != null) { if (!num(z.angle)) throw new Error(`zone ${i + 1}: bad angle`); out.angle = r2(((z.angle % 360) + 360) % 360); }
      if (z.power != null) {
        if (!num(z.power)) throw new Error(`zone ${i + 1}: bad power`);
        out.power = r2(clampN(z.power, SIGNED_POWER.includes(out.kind) ? -80 : 0, 80));
      }
      if (z.lift != null) { if (!num(z.lift)) throw new Error(`zone ${i + 1}: bad lift`); out.lift = r2(clampN(z.lift, 0, 30)); }
      if (out.kind === 'tunnel' && z.level != null) {
        if (!num(z.level)) throw new Error(`zone ${i + 1}: bad tunnel level`);
        out.level = r2(clampN(z.level, 0, LIMITS.floorZ));
      }
      if (out.kind === 'tele') {
        if (!num(z.tx) || !num(z.ty)) throw new Error(`zone ${i + 1}: teleporter has no exit`);
        out.tx = r2(z.tx); out.ty = r2(z.ty);
        if (!pointInFloor(out.tx, out.ty, hole)) throw new Error(`zone ${i + 1}: teleporter exit must be on the floor`);
      }
      return out;
    });
  }
  if (raw.bumpers != null) {
    if (!Array.isArray(raw.bumpers)) throw new Error('bumpers must be a list');
    if (raw.bumpers.length > LIMITS.bumpers) throw new Error(`too many bumpers (max ${LIMITS.bumpers})`);
    hole.bumpers = raw.bumpers.map((b: any, i: number): Bumper => {
      if (!num(b?.x) || !num(b?.y) || !num(b?.r)) throw new Error(`bumper ${i + 1}: bad values`);
      return { x: r2(b.x), y: r2(b.y), r: r2(clampN(b.r, 0.3, 6)), kick: num(b.kick) ? r2(clampN(b.kick, 0, 25)) : 0 };
    });
  }
  return hole;
}

export function serializeHole(h: Hole): string {
  return JSON.stringify(h);
}

export function parseHole(json: string): Hole {
  if (json.length > LIMITS.holeBytes) throw new Error(`hole data too large (max ${LIMITS.holeBytes} bytes)`);
  let raw: any;
  try { raw = JSON.parse(json); } catch { throw new Error('hole data is not valid JSON'); }
  return cleanHole(raw);
}

export function cleanCourseName(raw: string): string {
  const n = raw.trim().replace(/\s+/g, ' ').slice(0, LIMITS.courseNameLen);
  if (!n) throw new Error('give the course a name');
  return n;
}
