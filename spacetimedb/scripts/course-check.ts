// Course analyzer: plays every built-in hole with the real shared physics.
//
// For each hole it
//   1. validates the map through the same code the server uses,
//   2. sweeps angle × power (× shot time, when things move) looking for
//      hole-in-one lines, then refines around each hit to see how wide the
//      window is — an ace should exist, but be a narrow, deliberate line,
//   3. plays the hole greedily (best shot from wherever the ball stops) to
//      make sure it is finishable near par and never soft-locks.
//
//   npm run check-courses            # all courses
//   npm run check-courses -- "Bank"  # courses whose name contains "Bank"
//   npm run check-courses -- "Bank" "Ridge"  # ... only its holes whose name contains "Ridge"
//   VERBOSE=1 npm run check-courses  # print the ace lines
import { cannonAt, geomOf, groundZ, newEvents, restingOn, shotFrom, stepBall, DT, type BallState, type HoleGeom } from '../src/shared/physics';
import { COURSES, type Course, type Hole } from '../src/shared/courses';
import { LIBRARY } from '../src/shared/library';
import { cleanHole } from '../src/shared/mapformat';

// a plain node script; the module's tsconfig has no node types and needs none
declare const process: { argv: string[]; env: Record<string, string | undefined>; exit(code: number): void };

const ALL: Course[] = [...COURSES, ...LIBRARY];
const filter = process.argv[2]?.toLowerCase() ?? '';
const holeFilter = process.argv[3]?.toLowerCase() ?? '';
const VERBOSE = !!process.env.VERBOSE;

const MAX_TICKS = 900; // 30 s: the server stops a ball still rolling after this (ROLL_LIMIT_SECS)
const COARSE_ANGLE = 3; // degrees
const COARSE_POWER = 0.1;
const TIMED_SAMPLES = 12; // shot times spread over 6 s when the hole has movers
const HIDDEN_MAX = 0.045; // aces on more than ~1 in 22 random shots = obvious
const MIN_CLUSTER = 4; // fine-grid cells an ace must span to be humanly hittable
const MIN_ACES = 3; // library courses: at least this many of 9 holes must have a (hidden) ace — most do; timing courses fewest
// tutorial / showcase courses: their aces are meant to be easy to find
const SHOWCASE = new Set(['Sunny Park', 'Neon Orbit', 'Toy Box']);

interface ShotResult { holed: boolean; water: number; resets: number; rest: { x: number; y: number }; ticks: number; settled: boolean; travel: number }

function play(g: HoleGeom, from: { x: number; y: number }, angle: number, power: number, t0: number): ShotResult {
  const v = shotFrom(g, from.x, from.y, angle, power);
  const z0 = groundZ(g, from.x, from.y);
  const b: BallState = { x: from.x, y: from.y, z: v.vz > 0 ? z0 + 0.01 : z0, vx: v.vx, vy: v.vy, vz: v.vz, teleTicks: 0 };
  let water = 0, resets = 0, travel = 0;
  for (let tick = 1; tick <= MAX_TICKS; tick++) {
    const ev = newEvents();
    const px = b.x, py = b.y;
    stepBall(b, g, t0 + tick * DT, ev);
    if (!ev.tele) travel += Math.hypot(b.x - px, b.y - py);
    if (ev.holed) return { holed: true, water, resets, rest: { x: b.x, y: b.y }, ticks: tick, settled: true, travel };
    if (ev.water || ev.oob) {
      // the server puts the ball back where it was struck from
      if (ev.water) water++; else resets++;
      b.x = from.x; b.y = from.y; b.z = groundZ(g, from.x, from.y); b.vx = b.vy = b.vz = 0; b.teleTicks = 0;
      return { holed: false, water, resets, rest: { x: b.x, y: b.y }, ticks: tick, settled: true, travel };
    }
    if (restingOn(g, b)) return { holed: false, water, resets, rest: { x: b.x, y: b.y }, ticks: tick, settled: true, travel };
  }
  // still creeping along (a slow slide on ice) counts as settled: it will stop
  const creeping = Math.hypot(b.vx, b.vy) < 1.5 && b.vz === 0;
  return { holed: false, water, resets, rest: { x: b.x, y: b.y }, ticks: MAX_TICKS, settled: creeping, travel };
}

const hasMovers = (h: Hole) => (h.blocks ?? []).some(b => b.motion) || (h.zones ?? []).some(z => z.kind === 'spinner');

interface Ace { angle: number; power: number; t0: number; cluster: number }
interface AceReport { coarseHits: number; coarseCells: number; best: Ace | null; unsettled: number; byTime: number }

function findAces(h: Hole, g: HoleGeom): AceReport {
  const times = hasMovers(h) ? Array.from({ length: TIMED_SAMPLES }, (_, i) => (i * 6) / TIMED_SAMPLES) : [0];
  let coarseHits = 0, coarseCells = 0, unsettled = 0, timesWithAce = 0;
  const hits: { angle: number; power: number; t0: number }[] = [];
  for (const t0 of times) {
    let hitAtTime = 0;
    for (let a = 0; a < 360; a += COARSE_ANGLE) {
      for (let p = COARSE_POWER; p <= 1.0001; p += COARSE_POWER) {
        coarseCells++;
        const r = play(g, h.tee, (a * Math.PI) / 180, p, t0);
        if (!r.settled) { unsettled++; if (VERBOSE && unsettled <= 3) console.log(`      never settled: angle ${a}° power ${p.toFixed(2)} t0=${t0} → (${r.rest.x.toFixed(1)}, ${r.rest.y.toFixed(1)})`); }
        if (r.holed) { coarseHits++; hitAtTime++; hits.push({ angle: a, power: p, t0 }); }
      }
    }
    if (hitAtTime) timesWithAce++;
  }
  // refine: how many fine cells around each hit also ace? (a lone cell is a fluke)
  let best: Ace | null = null;
  for (const hit of hits.slice(0, 40)) {
    let cluster = 0;
    for (let da = -2; da <= 2; da += 0.5) {
      for (let dp = -0.05; dp <= 0.0501; dp += 0.0125) {
        const p = hit.power + dp;
        if (p < 0.02 || p > 1) continue;
        if (play(g, h.tee, ((hit.angle + da) * Math.PI) / 180, p, hit.t0).holed) cluster++;
      }
    }
    if (!best || cluster > best.cluster) best = { angle: hit.angle, power: hit.power, t0: hit.t0, cluster };
  }
  return { coarseHits, coarseCells: coarseCells / times.length, best, unsettled, byTime: times.length > 1 ? timesWithAce / times.length : 1 };
}

/** Greedy play: from wherever the ball stops, take the shot that ends
 *  nearest the cup. With `noise`, the chosen shot is executed with a human
 *  wobble (angle ± noise°, power ± noise/50) — a decent player, not a robot. */
function greedy(h: Hole, g: HoleGeom, maxStrokes = 8, noise = 0, seed = 1): { strokes: number; holed: boolean; unsettled: number; travel: number } {
  const route = routeTo(h);
  let pos = { ...h.tee };
  let strokes = 0, unsettled = 0, travel = 0;
  let t = 0;
  let rng = seed * 7919 + 17;
  const rand = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };
  for (let s = 0; s < maxStrokes; s++) {
    let bestR: ShotResult | null = null, bestD = Infinity, bestA = 0, bestP = 0;
    for (let a = 0; a < 360; a += 6) {
      for (let p = 0.1; p <= 1.0001; p += 0.1) {
        const r = play(g, pos, (a * Math.PI) / 180, p, t);
        if (!r.settled) { unsettled++; if (VERBOSE && noise === 0 && unsettled <= 3) console.log(`      never settled (greedy from ${pos.x.toFixed(1)},${pos.y.toFixed(1)}): angle ${a}° power ${p.toFixed(2)} → (${r.rest.x.toFixed(1)}, ${r.rest.y.toFixed(1)})`); continue; }
        // the decent player does not know the hidden line: a hole-out from
        // far away is not a shot they would pick
        if (noise > 0 && r.holed && route(pos.x, pos.y) > 25) continue;
        let d = r.holed ? -1 : route(r.rest.x, r.rest.y) + (r.water + r.resets) * 30;
        // loaded in a NEW cannon: the next shot flies (hopping in place in the same one is not progress)
        if (!r.holed && !r.water && !r.resets) { const c = cannonAt(g, r.rest.x, r.rest.y); if (c && c !== cannonAt(g, pos.x, pos.y)) d = Math.max(0.1, d - 45); }
        if (d < bestD) { bestD = d; bestR = r; bestA = a; bestP = p; }
      }
    }
    if (!bestR) return { strokes: strokes + 1, holed: false, unsettled, travel };
    if (process.env.TRACE_HOLE && h.name === process.env.TRACE_HOLE) console.log(`      ${noise ? 'decent' : 'greedy'} #${seed} stroke ${strokes + 1} from (${pos.x.toFixed(1)},${pos.y.toFixed(1)}): ${bestA}° p${bestP.toFixed(1)} → ${bestR.holed ? 'HOLED' : `(${bestR.rest.x.toFixed(1)},${bestR.rest.y.toFixed(1)})`}${bestR.water ? ' water' : ''} routeD=${route(bestR.rest.x, bestR.rest.y).toFixed(1)}`);
    if (noise > 0) {
      const a = bestA + (rand() * 2 - 1) * noise;
      const p = Math.max(0.02, Math.min(1, bestP + (rand() * 2 - 1) * noise / 50));
      const r = play(g, pos, (a * Math.PI) / 180, p, t);
      if (r.settled) bestR = r; else unsettled++;
    }
    strokes += 1 + bestR.water;
    travel += bestR.travel;
    t += bestR.ticks * DT + 1;
    if (bestR.holed) return { strokes, holed: true, unsettled, travel };
    pos = bestR.rest;
  }
  return { strokes, holed: false, unsettled, travel };
}

/** Distance to the cup ALONG the floor: through the doorways between
 *  floor rects, so a greedy player in a dogleg heads for the corner
 *  instead of parking against the wall nearest the cup. */
type Rc = { x: number; y: number; w: number; h: number };
function routeTo(h: Hole): (x: number, y: number) => number {
  const inRect = (x: number, y: number, r: Rc) => x >= r.x - 0.01 && x <= r.x + r.w + 0.01 && y >= r.y - 0.01 && y <= r.y + r.h + 0.01;
  const goal = h.floor.findIndex(r => inRect(h.cup.x, h.cup.y, r));
  if (h.floor.length < 2 || goal < 0) return (x, y) => Math.hypot(x - h.cup.x, y - h.cup.y);
  const touches = (a: Rc, b: Rc) => a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
  const door = (a: Rc, b: Rc) => ({ x: (Math.max(a.x, b.x) + Math.min(a.x + a.w, b.x + b.w)) / 2, y: (Math.max(a.y, b.y) + Math.min(a.y + a.h, b.y + b.h)) / 2 });
  // BFS from the goal rect outward: next[i] = the rect to go to from rect i
  const next = new Map<number, number>(); next.set(goal, -1);
  const queue = [goal];
  while (queue.length) {
    const i = queue.shift()!;
    h.floor.forEach((r, j) => { if (!next.has(j) && touches(h.floor[i], r)) { next.set(j, i); queue.push(j); } });
  }
  return (x, y) => {
    let i = h.floor.findIndex(r => inRect(x, y, r));
    if (i < 0 || !next.has(i)) return Math.hypot(x - h.cup.x, y - h.cup.y);
    let d = 0, px = x, py = y;
    while (i !== goal) {
      const j = next.get(i)!;
      const dr = door(h.floor[i], h.floor[j]);
      d += Math.hypot(dr.x - px, dr.y - py); px = dr.x; py = dr.y; i = j;
    }
    return d + Math.hypot(h.cup.x - px, h.cup.y - py);
  };
}

/** How long is the hole, really: tee → cup as the crow flies, plus the
 *  detour a dogleg forces (through the floor rects' centres in order). */
function holeLength(h: Hole): number {
  const direct = Math.hypot(h.cup.x - h.tee.x, h.cup.y - h.tee.y);
  if (h.floor.length < 2) return direct;
  const inRect = (x: number, y: number, r: Rc) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  const start = h.floor.findIndex(r => inRect(h.tee.x, h.tee.y, r)), goal = h.floor.findIndex(r => inRect(h.cup.x, h.cup.y, r));
  if (start < 0 || goal < 0 || start === goal) return direct;
  const touches = (a: Rc, b: Rc) => a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
  const centre = (r: Rc) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const prev = new Map<number, number>(); const queue = [start]; prev.set(start, -1);
  while (queue.length) {
    const i = queue.shift()!;
    if (i === goal) break;
    h.floor.forEach((r, j) => { if (!prev.has(j) && touches(h.floor[i], r)) { prev.set(j, i); queue.push(j); } });
  }
  if (!prev.has(goal)) return direct;
  const path: { x: number; y: number }[] = [h.cup];
  for (let i = prev.get(goal)!; i !== -1 && i !== start; i = prev.get(i)!) path.push(centre(h.floor[i]));
  path.push(h.tee);
  let len = 0; for (let i = 1; i < path.length; i++) len += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  return Math.max(direct, len);
}
const MIN_LENGTH: Record<number, number> = { 1: 0, 2: 30, 3: 55, 4: 75, 5: 95 };
const NOISE_DEG = 3; // the "decent player": ±3° and ±6% power
const NOISY_TRIALS = 6;

let problems = 0;
const rows: string[] = [];
for (const course of ALL) {
  if (filter && !course.name.toLowerCase().includes(filter)) continue;
  console.log(`\n== ${course.name} (${course.holes.length} holes, ${course.theme}) ==`);
  let acesInCourse = 0;
  course.holes.forEach((raw, i) => {
    if (holeFilter && !raw.name.toLowerCase().includes(holeFilter)) return;
    const label = `${course.name} ${i + 1} "${raw.name}"`;
    let h: Hole;
    try { h = cleanHole(JSON.parse(JSON.stringify(raw))); }
    catch (e) { console.log(`  ✗ ${label}: INVALID — ${(e as Error).message}`); problems++; return; }
    const g = geomOf(h);
    const t0 = Date.now();
    const ace = findAces(h, g);
    const gr = greedy(h, g);
    // a decent player's average — par should be about this, and the hole
    // should not be over in one for anyone but the ace-hunter
    let noisySum = 0, noisyDone = 0;
    for (let k = 0; k < NOISY_TRIALS; k++) { const r = greedy(h, g, 9, NOISE_DEG, k + 1); if (r.holed) { noisySum += r.strokes; noisyDone++; } else noisySum += 10; }
    const noisy = noisySum / NOISY_TRIALS;
    // how far the ball actually travels to finish: banks and detours count
    const length = gr.holed ? Math.max(gr.travel, holeLength(h)) : holeLength(h);
    const frac = ace.coarseHits / (ace.coarseCells * (hasMovers(h) ? TIMED_SAMPLES : 1));
    const flags: string[] = [];
    const warnings: string[] = [];
    if (!ace.best && !SHOWCASE.has(course.name)) warnings.push('no ace');
    else if (ace.best && ace.best.cluster < MIN_CLUSTER) warnings.push(`ace too fluky (cluster ${ace.best.cluster})`);
    if (frac > HIDDEN_MAX && !SHOWCASE.has(course.name)) flags.push(`ACE OBVIOUS (${(frac * 100).toFixed(1)}% of shots)`);
    if (!gr.holed) flags.push(`NOT FINISHED in ${gr.strokes}`);
    else if (gr.strokes > h.par + 1) flags.push(`HARD (greedy ${gr.strokes} vs par ${h.par})`);
    if (!SHOWCASE.has(course.name)) {
      if (length < (MIN_LENGTH[h.par] ?? 95)) flags.push(`SHORT (${length.toFixed(0)} u for par ${h.par})`);
      if (noisy < h.par - 0.6) flags.push(`EASY (decent player ${noisy.toFixed(1)} vs par ${h.par})`);
      if (noisy > h.par + 1.5) flags.push(`PAR TOO LOW (decent player ${noisy.toFixed(1)})`);
      if (noisyDone < NOISY_TRIALS - 1) flags.push(`${NOISY_TRIALS - noisyDone}/${NOISY_TRIALS} decent-player runs never finished`);
    }
    // a rare pinball loop is caught by the server's roll clock; a common one is a design flaw
    const sims = ace.coarseCells * (hasMovers(h) ? TIMED_SAMPLES : 1);
    if (ace.unsettled + gr.unsettled > sims * 0.01) flags.push(`${ace.unsettled + gr.unsettled} shots never settled`);
    const ok = flags.length === 0;
    if (!ok) problems++;
    if (ace.best && (!ace.best || ace.best.cluster >= MIN_CLUSTER)) acesInCourse++;
    if (warnings.length) flags.push(...warnings.map(w => `(${w})`));
    const aceStr = ace.best ? `ace ${(frac * 100).toFixed(2)}% (cluster ${ace.best.cluster}${hasMovers(h) ? `, ${Math.round(ace.byTime * 100)}% of timings` : ''})` : 'no ace';
    console.log(`  ${ok ? '✓' : '✗'} ${label}: par ${h.par} · ${length.toFixed(0)} u · ${aceStr} · greedy ${gr.holed ? gr.strokes : 'DNF'} · decent ${noisy.toFixed(1)} · ${((Date.now() - t0) / 1000).toFixed(1)}s${flags.length ? ' · ' + flags.join(' · ') : ''}`);
    if (VERBOSE && ace.best) console.log(`      ace line: angle ${ace.best.angle}° power ${ace.best.power.toFixed(2)} at t=${ace.best.t0}s`);
    rows.push(`| ${course.name} | ${i + 1} | ${h.name} | ${h.par} | ${length.toFixed(0)} | ${ace.best ? (frac * 100).toFixed(2) + '%' : '—'} | ${noisy.toFixed(1)} | ${flags.join(', ') || 'ok'} |`);
  });
  if (!SHOWCASE.has(course.name) && !holeFilter) {
    const ok = acesInCourse >= MIN_ACES;
    if (!ok) problems++;
    console.log(`  ${ok ? '✓' : '✗'} ${course.name}: ${acesInCourse}/${course.holes.length} holes have a hidden ace${ok ? '' : ` — need ${MIN_ACES}`}`);
  }
}
console.log(`\n${problems ? `${problems} hole(s) need work` : 'every hole passes'}`);
if (process.env.TABLE) console.log('\n| course | # | hole | par | length | ace window | decent player | notes |\n|---|---|---|---|---|---|---|---|\n' + rows.join('\n'));
process.exit(problems ? 1 : 0);
