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
//   VERBOSE=1 npm run check-courses  # print the ace lines
import { geomOf, groundZ, newEvents, restingOn, shotVelocity, stepBall, DT, type BallState, type HoleGeom } from '../src/shared/physics';
import { COURSES, type Course, type Hole } from '../src/shared/courses';
import { LIBRARY } from '../src/shared/library';
import { cleanHole } from '../src/shared/mapformat';

// a plain node script; the module's tsconfig has no node types and needs none
declare const process: { argv: string[]; env: Record<string, string | undefined>; exit(code: number): void };

const ALL: Course[] = [...COURSES, ...LIBRARY];
const filter = process.argv[2]?.toLowerCase() ?? '';
const VERBOSE = !!process.env.VERBOSE;

const MAX_TICKS = 450; // 15 s: the server stops a ball still rolling after this (ROLL_LIMIT_SECS)
const COARSE_ANGLE = 3; // degrees
const COARSE_POWER = 0.1;
const TIMED_SAMPLES = 8; // shot times spread over 6 s when the hole has movers
const HIDDEN_MAX = 0.045; // aces on more than ~1 in 22 random shots = obvious
const MIN_CLUSTER = 4; // fine-grid cells an ace must span to be humanly hittable
// tutorial / showcase courses: their aces are meant to be easy to find
const SHOWCASE = new Set(['Sunny Park', 'Neon Orbit', 'Toy Box']);

interface ShotResult { holed: boolean; water: number; resets: number; rest: { x: number; y: number }; ticks: number; settled: boolean }

function play(g: HoleGeom, from: { x: number; y: number }, angle: number, power: number, t0: number): ShotResult {
  const v = shotVelocity(angle, power);
  const b: BallState = { x: from.x, y: from.y, z: groundZ(g, from.x, from.y), vx: v.vx, vy: v.vy, vz: 0, teleTicks: 0 };
  let water = 0, resets = 0;
  for (let tick = 1; tick <= MAX_TICKS; tick++) {
    const ev = newEvents();
    stepBall(b, g, t0 + tick * DT, ev);
    if (ev.holed) return { holed: true, water, resets, rest: { x: b.x, y: b.y }, ticks: tick, settled: true };
    if (ev.water || ev.oob) {
      // the server puts the ball back where it was struck from
      if (ev.water) water++; else resets++;
      b.x = from.x; b.y = from.y; b.z = groundZ(g, from.x, from.y); b.vx = b.vy = b.vz = 0; b.teleTicks = 0;
      return { holed: false, water, resets, rest: { x: b.x, y: b.y }, ticks: tick, settled: true };
    }
    if (restingOn(g, b)) return { holed: false, water, resets, rest: { x: b.x, y: b.y }, ticks: tick, settled: true };
  }
  // still creeping along (a slow slide on ice) counts as settled: it will stop
  const creeping = Math.hypot(b.vx, b.vy) < 1.5 && b.vz === 0;
  return { holed: false, water, resets, rest: { x: b.x, y: b.y }, ticks: MAX_TICKS, settled: creeping };
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

/** Greedy play: from wherever the ball stops, take the shot that ends nearest the cup. */
function greedy(h: Hole, g: HoleGeom, maxStrokes = 8): { strokes: number; holed: boolean; unsettled: number } {
  let pos = { ...h.tee };
  let strokes = 0, unsettled = 0;
  let t = 0;
  for (let s = 0; s < maxStrokes; s++) {
    let bestR: ShotResult | null = null, bestD = Infinity;
    for (let a = 0; a < 360; a += 6) {
      for (let p = 0.1; p <= 1.0001; p += 0.1) {
        const r = play(g, pos, (a * Math.PI) / 180, p, t);
        if (!r.settled) { unsettled++; if (VERBOSE && unsettled <= 3) console.log(`      never settled (greedy from ${pos.x.toFixed(1)},${pos.y.toFixed(1)}): angle ${a}° power ${p.toFixed(2)} → (${r.rest.x.toFixed(1)}, ${r.rest.y.toFixed(1)})`); continue; }
        const d = r.holed ? -1 : Math.hypot(r.rest.x - h.cup.x, r.rest.y - h.cup.y) + r.water * 6;
        if (d < bestD) { bestD = d; bestR = r; }
      }
    }
    if (!bestR) return { strokes: strokes + 1, holed: false, unsettled };
    strokes += 1 + bestR.water;
    t += bestR.ticks * DT + 1;
    if (bestR.holed) return { strokes, holed: true, unsettled };
    pos = bestR.rest;
  }
  return { strokes, holed: false, unsettled };
}

let problems = 0;
const rows: string[] = [];
for (const course of ALL) {
  if (filter && !course.name.toLowerCase().includes(filter)) continue;
  console.log(`\n== ${course.name} (${course.holes.length} holes, ${course.theme}) ==`);
  course.holes.forEach((raw, i) => {
    const label = `${course.name} ${i + 1} "${raw.name}"`;
    let h: Hole;
    try { h = cleanHole(JSON.parse(JSON.stringify(raw))); }
    catch (e) { console.log(`  ✗ ${label}: INVALID — ${(e as Error).message}`); problems++; return; }
    const g = geomOf(h);
    const t0 = Date.now();
    const ace = findAces(h, g);
    const gr = greedy(h, g);
    const frac = ace.coarseHits / (ace.coarseCells * (hasMovers(h) ? TIMED_SAMPLES : 1));
    const flags: string[] = [];
    if (!ace.best && !SHOWCASE.has(course.name)) flags.push('NO ACE');
    else if (ace.best && ace.best.cluster < MIN_CLUSTER) flags.push(`ACE TOO FLUKY (cluster ${ace.best.cluster})`);
    if (frac > HIDDEN_MAX && !SHOWCASE.has(course.name)) flags.push(`ACE OBVIOUS (${(frac * 100).toFixed(1)}% of shots)`);
    if (!gr.holed) flags.push(`NOT FINISHED in ${gr.strokes}`);
    else if (gr.strokes > h.par + 1) flags.push(`HARD (greedy ${gr.strokes} vs par ${h.par})`);
    // a rare pinball loop is caught by the server's roll clock; a common one is a design flaw
    const sims = ace.coarseCells * (hasMovers(h) ? TIMED_SAMPLES : 1);
    if (ace.unsettled + gr.unsettled > sims * 0.01) flags.push(`${ace.unsettled + gr.unsettled} shots never settled`);
    const ok = flags.length === 0;
    if (!ok) problems++;
    const aceStr = ace.best ? `ace ${(frac * 100).toFixed(2)}% (cluster ${ace.best.cluster}${hasMovers(h) ? `, ${Math.round(ace.byTime * 100)}% of timings` : ''})` : 'no ace';
    console.log(`  ${ok ? '✓' : '✗'} ${label}: par ${h.par} · ${aceStr} · greedy ${gr.holed ? gr.strokes : 'DNF'} · ${((Date.now() - t0) / 1000).toFixed(1)}s${flags.length ? ' · ' + flags.join(' · ') : ''}`);
    if (VERBOSE && ace.best) console.log(`      ace line: angle ${ace.best.angle}° power ${ace.best.power.toFixed(2)} at t=${ace.best.t0}s`);
    rows.push(`| ${course.name} | ${i + 1} | ${h.name} | ${h.par} | ${ace.best ? (frac * 100).toFixed(2) + '%' : '—'} | ${gr.holed ? gr.strokes : 'DNF'} | ${flags.join(', ') || 'ok'} |`);
  });
}
console.log(`\n${problems ? `${problems} hole(s) need work` : 'every hole passes'}`);
if (process.env.TABLE) console.log('\n| course | # | hole | par | ace window | greedy | notes |\n|---|---|---|---|---|---|---|\n' + rows.join('\n'));
process.exit(problems ? 1 : 0);
