// The course editor: draw floors, obstacles and hazards on a top-down grid,
// tweak them in a properties panel, then test-play the hole on the real 3D
// stage with the SAME physics the server runs, and save/publish. Everything
// here is local until Save.
import {
  type Block, type Bumper, type Hole, type Rect, type Zone, type ZoneKind,
  TUNNEL_LID, TUNNEL_MIN_CLEAR, WALL_H, barPts, holeBounds, pointInFloor, pointInPoly, pointInRect, rectPts, tunnelLevel, windmillPts,
} from '@shared/courses';
import { cleanHole, LIMITS, THEME_NAMES } from '@shared/mapformat';
import {
  type BallState, BALL_R, CANNON_DEFAULT_LIFT, DT, FRICTION, ZONE_DEFAULT_POWER, geomOf, groundZ, invalidateGeom, newEvents, rampRise,
  restingOn, shotFrom, stepBall,
} from '@shared/physics';
import { type Camera, drawAim, drawBall, drawHole, fitCamera, powerToSpeed, s2w, THEMES, w2s } from './render';
import { type AimBasis, type GolfScene, addShake, burstAt, cameraGroundBasis, canvasCssSize, drawScene, resetScene } from './render3d';
import { dragAim, smoothAngle } from './aim';
import { sfx } from './audio';

export interface EditorOpts {
  courseId: bigint;
  name: string;
  holes: Hole[];
  published: boolean;
  myName: string;
  /** roster character + ball colour for the test-play golfer */
  myCharacter: number;
  myColor: number;
  onSave(courseId: bigint, name: string, holesJson: string): void;
  onPublish(courseId: bigint, published: boolean): void;
  onExit(): void;
  findSaved(name: string): { id: bigint; published: boolean } | null;
}

type Tool =
  | 'select' | 'pan' | 'swing' | 'floor' | 'block' | 'lowblock' | 'tri' | 'windmill' | 'slider' | 'pendulum' | 'laser' | 'rubber'
  | 'bumper' | 'post' | 'tee' | 'cup' | ZoneKind;

type Sel =
  | { kind: 'floor'; i: number } | { kind: 'block'; i: number } | { kind: 'zone'; i: number }
  | { kind: 'bumper'; i: number } | { kind: 'tee' } | { kind: 'cup' } | { kind: 'teleExit'; i: number } | null;

const TOOL_DEFS: { id: Tool; label: string; color: string; group: string; hint: string; key?: string }[] = [
  { id: 'select', label: 'Select / move', color: '#fff', group: 'Tools', hint: 'Click to select · drag to move · grips resize, knobs turn · Shift+wheel turns · Alt+wheel raises · Del removes' },
  { id: 'pan', label: 'Pan', color: '#9fc2a8', group: 'Tools', hint: 'Drag to pan · wheel zooms (or hold Space with any tool)' },
  { id: 'swing', key: 'p', label: 'Swing preview', color: '#ffd60a', group: 'Tools', hint: 'Click to drop a ghost ball · drag to aim (arrow length = power) · Shift-drag moves the ball · ←/→ turn · ↑/↓ power · Del clears' },
  { id: 'floor', key: 'f', label: 'Floor', color: '#3fae4f', group: 'Layout', hint: 'Drag a rectangle of green. Touching floors join up; give one a height and it is a platform.' },
  { id: 'tee', label: 'Tee', color: '#ffffff', group: 'Layout', hint: 'Click where the ball starts' },
  { id: 'cup', label: 'Cup', color: '#0b1a10', group: 'Layout', hint: 'Click where the hole is' },
  { id: 'tunnel', label: 'Tunnel', color: '#2b1d10', group: 'Layout', hint: 'Drag across a platform, green to green: the ball rolls under it while another rolls over' },
  { id: 'block', key: 'b', label: 'Wall block', color: '#c9a36b', group: 'Obstacles', hint: 'Drag a solid block' },
  { id: 'lowblock', label: 'Low wall (jumpable)', color: '#e0c391', group: 'Obstacles', hint: 'Drag a low wall a jumping ball clears' },
  { id: 'tri', label: 'Triangle wall', color: '#c9a36b', group: 'Obstacles', hint: 'Drag from the right-angle corner: a triangle fills the box (a corner mirror caroms the ball)' },
  { id: 'windmill', label: 'Windmill', color: '#c9a36b', group: 'Obstacles', hint: 'Click to place a spinning windmill' },
  { id: 'slider', label: 'Sliding block', color: '#c9a36b', group: 'Obstacles', hint: 'Drag a block that slides back and forth' },
  { id: 'pendulum', label: 'Pendulum', color: '#c9a36b', group: 'Obstacles', hint: 'Click to hang a swinging arm from that point' },
  { id: 'laser', label: 'Laser gate', color: '#ff2d55', group: 'Obstacles', hint: 'Drag a wall that blinks on and off' },
  { id: 'rubber', label: 'Rubber wall', color: '#ff7ad9', group: 'Obstacles', hint: 'Drag a wall that fires the ball back harder' },
  { id: 'bumper', label: 'Bumper', color: '#ff4b4b', group: 'Obstacles', hint: 'Click to place a pinball bumper' },
  { id: 'post', label: 'Post', color: '#8d99b5', group: 'Obstacles', hint: 'Click to place a round post' },
  { id: 'sand', key: 's', label: 'Sand', color: '#e9d18c', group: 'Surfaces', hint: 'Drag a sand trap (slow)' },
  { id: 'ice', key: 'i', label: 'Ice', color: '#cfeeff', group: 'Surfaces', hint: 'Drag an ice patch (slippery)' },
  { id: 'water', key: 'w', label: 'Water', color: '#2f8fd8', group: 'Surfaces', hint: 'Drag a water hazard (+1 stroke, ball resets)' },
  { id: 'slope', label: 'Ramp (slope)', color: '#6b6b6b', group: 'Surfaces', hint: 'Drag a ramp; arrows point downhill, strength sets how steep' },
  { id: 'boost', label: 'Boost pad', color: '#ff8a3d', group: 'Surfaces', hint: 'Drag a booster; set its direction in the panel' },
  { id: 'jump', key: 'j', label: 'Jump pad', color: '#ffd60a', group: 'Surfaces', hint: 'Drag a jump pad (needs speed to trigger)' },
  { id: 'tele', label: 'Teleporter', color: '#c77dff', group: 'Surfaces', hint: 'Drag a gate, then move its exit ring' },
  { id: 'conveyor', label: 'Conveyor belt', color: '#2a2a33', group: 'Toy box', hint: 'Drag a belt that carries the ball along' },
  { id: 'spinner', label: 'Spinner', color: '#7c5cff', group: 'Toy box', hint: 'Drag a turntable that flings the ball' },
  { id: 'fan', label: 'Blower fan', color: '#5bd1ff', group: 'Toy box', hint: 'Drag a fan that floats the ball across' },
  { id: 'trampoline', label: 'Trampoline', color: '#3d7bff', group: 'Toy box', hint: 'Drag a pad that bounces a falling ball back up' },
  { id: 'magnet', label: 'Magnet', color: '#ff5fb8', group: 'Toy box', hint: 'Drag a field that pulls (or pushes) the ball' },
  { id: 'cannon', label: 'Cannon', color: '#3a3f4a', group: 'Toy box', hint: 'Drag a cannon; roll in, then aim and fire a lofted shot' },
  { id: 'gravity', label: 'Gravity field', color: '#b39cff', group: 'Toy box', hint: 'Drag a field that pulls the ball one way — rolling or flying' },
];

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
function toast(msg: string, error = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (error ? ' error' : '');
  el.textContent = msg;
  $('toasts').appendChild(el);
  if (error) sfx.error();
  setTimeout(() => el.remove(), 3600);
}

function blankHole(n: number): Hole {
  return {
    name: `Hole ${n}`, par: 3, tee: { x: 4, y: 5 }, cup: { x: 28, y: 5 },
    floor: [{ x: 0, y: 0, w: 32, h: 10 }], blocks: [], zones: [], bumpers: [],
  };
}

let open = false;
let opts: EditorOpts | null = null;
let holes: Hole[] = [];
let cur = 0;
let courseName = '';
let courseId = 0n;
let published = false;
let dirty = false;
let tool: Tool = 'select';
let sel: Sel = null;
let undoStack: string[] = [];
let redoStack: string[] = [];
let cam: Camera = { x: 16, y: 5, scale: 24 };
let W = 0, H = 0, DPR = 1;
let raf = 0;
let snap = 0.5;
let hoverWorld = { x: 0, y: 0 };
let spaceHeld = false;

// drag state
type Drag =
  | { mode: 'create'; x0: number; y0: number; x1: number; y1: number }
  | { mode: 'move'; sel: Sel; start: { x: number; y: number }; orig: Hole }
  | { mode: 'grip'; sel: Sel; grip: Handle; orig: Hole } // a gizmo grip (resize / rotate / aim / stretch)
  | { mode: 'pan'; sx: number; sy: number; cx: number; cy: number }
  | { mode: 'swingMove' } | { mode: 'swingAim' }
  | null;
let drag: Drag = null;

// swing preview — a ghost ball, an angle and a power; the shot is simulated
// with the shared physics and its whole path drawn on the editor canvas so
// corners, bumpers and cups can be placed to a line. Local; never saved.
interface SwingSetup { holeIdx: number; x: number; y: number; angleDeg: number; power: number; t0: number }
interface SwingPt { x: number; y: number; lift: number; air: boolean; tele: boolean }
interface SwingMark { x: number; y: number; kind: 'wall' | 'bumper' | 'jump' | 'land' | 'tele'; v: number }
interface SwingPath {
  key: string; pts: SwingPt[]; marks: SwingMark[];
  end: 'rest' | 'holed' | 'water' | 'oob' | 'timeout'; secs: number; travel: number; maxSpeed: number; toCup: number; summary: string;
}
let swing: SwingSetup | null = null;
let swingPath: SwingPath | null = null;
let swingPlay = 0; // playhead, seconds since the swing
const SWING_MAX_TICKS = 450; // 15 s: the server's roll_clock stops a ball still rolling after this
const SWING_HOLD = 1.2; // the playhead rests at the end this long before looping
const SWING_ARROW_MIN = 2, SWING_ARROW_SPAN = 7; // drawAim's arrow length (u) = MIN + power × SPAN: the drag reads it back

// test mode — played on the game's 3D stage (render3d), the editor hidden
let testing = false;
let testBall: BallState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, teleTicks: 0 };
let testStrokes = 0;
let testT = 0;
let testAcc = 0;
interface TestAim { active: boolean; angle: number; shown: number; power: number; x0: number; y0: number; basis: AimBasis }
let testAim: TestAim = { active: false, angle: 0, shown: 0, power: 0, x0: 0, y0: 0, basis: { rx: 1, ry: 0, fx: 0, fy: -1 } };
let testSafe = { x: 0, y: 0 };
let testStruck = false;
let testGen = 0; // bumps per test session: a new holeKey rebuilds the 3D hole
let testCam: GolfScene['cam'] = 'play';
let testShotSeq = 0;
let testShotPower = 0;
let testFacing = 0;

const canvas = () => $('ed-canvas') as HTMLCanvasElement;
const gameCanvas = () => $('game-canvas') as HTMLCanvasElement;
const hole = () => holes[cur];

export function editorIsOpen() { return open; }

export function openEditor(o: EditorOpts) {
  opts = o;
  open = true;
  holes = o.holes.length ? clone(o.holes) : [blankHole(1)];
  cur = 0;
  courseName = o.name;
  courseId = o.courseId;
  published = o.published;
  dirty = false;
  sel = null;
  tool = 'select';
  undoStack = []; redoStack = [];
  testing = false;
  swing = null; swingPath = null;
  ($('ed-title') as HTMLInputElement).value = courseName;
  buildTools();
  renderHoleTabs();
  renderProps();
  resize();
  fitView();
  if (!raf) raf = requestAnimationFrame(frame);
  wire();
}

export function closeEditor() {
  stopTest();
  open = false;
  if (raf) { cancelAnimationFrame(raf); raf = 0; }
}

function fitView() {
  if (W === 0 || H === 0) resize();
  if (W === 0 || H === 0) { cam = { x: 16, y: 5, scale: 24 }; return; }
  const f = fitCamera(hole(), W, H, 4);
  cam = { ...f };
}

function resize() {
  const c = canvas();
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = c.clientWidth; H = c.clientHeight;
  c.width = Math.round(W * DPR); c.height = Math.round(H * DPR);
}

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  window.addEventListener('resize', () => { if (open) resize(); });
  const c = canvas();
  c.addEventListener('pointerdown', onDown);
  c.addEventListener('pointermove', onMove);
  c.addEventListener('pointerup', onUp);
  c.addEventListener('pointercancel', () => { drag = null; });
  c.addEventListener('wheel', e => {
    e.preventDefault();
    if (wheelAdjust(e)) return;
    const before = s2w(cam, W, H, e.offsetX, e.offsetY);
    cam.scale = Math.max(4, Math.min(80, cam.scale * (e.deltaY < 0 ? 1.12 : 0.89)));
    const after = s2w(cam, W, H, e.offsetX, e.offsetY);
    cam.x += before.x - after.x; cam.y += before.y - after.y;
  }, { passive: false });
  c.addEventListener('contextmenu', e => e.preventDefault());
  wireProps();
  // test play happens on the game canvas (main.ts's own handlers on it
  // stand down while the editor is open)
  const gc = gameCanvas();
  gc.addEventListener('pointerdown', testDown);
  gc.addEventListener('pointermove', testMove);
  gc.addEventListener('pointerup', testUp);
  gc.addEventListener('pointercancel', () => { testAim.active = false; });
  $('ed-test-stop').onclick = () => stopTest();
  $('ed-test-reset').onclick = () => resetTestBall();
  $('ed-test-cam').onclick = () => toggleTestCam();
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', e => { if (e.key === ' ') spaceHeld = false; });
  $('ed-exit').onclick = () => {
    if (dirty && !confirm('You have unsaved changes. Leave anyway?')) return;
    opts?.onExit();
  };
  $('ed-title').oninput = () => { courseName = ($('ed-title') as HTMLInputElement).value; dirty = true; };
  $('ed-add-hole').onclick = () => {
    if (holes.length >= LIMITS.holesPerCourse) { toast(`Max ${LIMITS.holesPerCourse} holes`, true); return; }
    holes.push(blankHole(holes.length + 1));
    cur = holes.length - 1; sel = null; undoStack = []; redoStack = [];
    dirty = true; renderHoleTabs(); renderProps(); fitView();
  };
  $('ed-undo').onclick = undo;
  $('ed-redo').onclick = redo;
  $('ed-test').onclick = () => (testing ? stopTest() : startTest());
  $('ed-save').onclick = save;
  $('ed-publish').onclick = togglePublish;
  $('ed-export').onclick = () => {
    const json = JSON.stringify({ name: courseName, holes });
    navigator.clipboard?.writeText(json).then(() => toast('Course JSON copied to clipboard')).catch(() => prompt('Copy this JSON:', json));
  };
  $('ed-import').onclick = () => {
    const txt = prompt('Paste course JSON (or a single hole):');
    if (!txt) return;
    try {
      const raw = JSON.parse(txt);
      const list = Array.isArray(raw) ? raw : Array.isArray(raw.holes) ? raw.holes : [raw];
      const cleaned = list.map((h: any) => cleanHole(h));
      if (!cleaned.length) throw new Error('no holes in there');
      if (!Array.isArray(raw) && raw.name && !courseName) { courseName = String(raw.name); ($('ed-title') as HTMLInputElement).value = courseName; }
      holes = [...holes.filter(h => !(holes.length === 1 && isBlank(h))), ...cleaned].slice(0, LIMITS.holesPerCourse);
      cur = holes.length - 1; sel = null; dirty = true;
      renderHoleTabs(); renderProps(); fitView();
      toast(`Imported ${cleaned.length} hole(s)`);
    } catch (e) { toast(`Import failed: ${(e as Error).message}`, true); }
  };
}
const isBlank = (h: Hole) => h.floor.length === 1 && !(h.blocks?.length) && !(h.zones?.length) && !(h.bumpers?.length) && h.name.startsWith('Hole ');

function buildTools() {
  const el = $('ed-tools');
  el.innerHTML = '';
  let group = '';
  for (const t of TOOL_DEFS) {
    if (t.group !== group) { group = t.group; const h = document.createElement('h3'); h.textContent = group; el.appendChild(h); }
    const b = document.createElement('button');
    b.dataset.tool = t.id;
    b.innerHTML = `<i style="background:${t.color}"></i>${esc(t.label)}`;
    b.className = t.id === tool ? 'active' : '';
    b.onclick = () => { tool = t.id; if (t.id !== 'select') sel = null; buildTools(); renderProps(); };
    el.appendChild(b);
  }
}

function renderHoleTabs() {
  const el = $('ed-holes');
  el.innerHTML = '';
  holes.forEach((_, i) => {
    const b = document.createElement('button');
    b.textContent = String(i + 1);
    b.className = i === cur ? 'active' : '';
    b.onclick = () => { if (testing) stopTest(); cur = i; sel = null; undoStack = []; redoStack = []; renderHoleTabs(); renderProps(); fitView(); };
    el.appendChild(b);
  });
}

// ---------------------------------------------------------------------------
// Outliner — every piece of the hole as a row, grouped by kind. Click selects
// (and switches to the select tool), double-click frames it, and a badge flags
// anything with no floor under it (the canvas still draws it, ghosted).
// ---------------------------------------------------------------------------
type OutlineRow = { sel: NonNullable<Sel>; name: string; dim: string; color: string; cx: number; cy: number; floorHit: 'on' | 'part' | 'off' | 'na' };
const toolColor = (id: Tool) => TOOL_DEFS.find(t => t.id === id)?.color ?? '#fff';
const sameSel = (a: Sel, b: Sel) => !!a && !!b && a.kind === b.kind && ('i' in a ? a.i : -1) === ('i' in b ? b.i : -1);
/** how much of a set of points has floor under it */
function floorHitOf(h: Hole, pts: [number, number][]): OutlineRow['floorHit'] {
  let n = 0;
  for (const [x, y] of pts) if (pointInFloor(x, y, h)) n++;
  return n === pts.length ? 'on' : n === 0 ? 'off' : 'part';
}
const rectSamples = (r: Rect): [number, number][] => [
  [r.x + r.w / 2, r.y + r.h / 2], [r.x + 0.05, r.y + 0.05], [r.x + r.w - 0.05, r.y + 0.05], [r.x + 0.05, r.y + r.h - 0.05], [r.x + r.w - 0.05, r.y + r.h - 0.05],
];
function blockName(b: Block): { name: string; tool: Tool } {
  if (b.gen?.kind === 'windmill') return { name: `Windmill ×${b.gen.blades}`, tool: 'windmill' };
  if (b.gen?.kind === 'bar' || b.motion?.type === 'swing') return { name: 'Pendulum', tool: 'pendulum' };
  if (b.motion?.type === 'blink') return { name: 'Laser gate', tool: 'laser' };
  if (b.motion?.type === 'slide') return { name: 'Slider', tool: 'slider' };
  if ((b.bounce ?? 1) > 1) return { name: 'Rubber wall', tool: 'rubber' };
  if (b.gen?.kind === 'tri') return { name: 'Triangle', tool: 'tri' };
  if (b.h !== undefined && b.h < WALL_H) return { name: 'Low wall', tool: 'lowblock' };
  return { name: b.motion?.type === 'rotate' ? 'Rotating block' : 'Wall block', tool: 'block' };
}
const fmtDim = (w: number, h: number) => `${round1(w)}×${round1(h)}`;
function outlineRows(h: Hole): { group: string; rows: OutlineRow[] }[] {
  const layout: OutlineRow[] = [
    { sel: { kind: 'tee' }, name: 'Tee', dim: `${round1(h.tee.x)}, ${round1(h.tee.y)}`, color: toolColor('tee'), cx: h.tee.x, cy: h.tee.y, floorHit: floorHitOf(h, [[h.tee.x, h.tee.y]]) },
    { sel: { kind: 'cup' }, name: 'Cup', dim: `${round1(h.cup.x)}, ${round1(h.cup.y)}`, color: '#222', cx: h.cup.x, cy: h.cup.y, floorHit: floorHitOf(h, [[h.cup.x, h.cup.y]]) },
  ];
  const floors: OutlineRow[] = h.floor.map((r, i) => ({
    sel: { kind: 'floor', i }, name: r.z ? `Platform ▲${round1(r.z)}` : r.wall === 0 ? 'Floor (open edge)' : r.wall !== undefined ? `Floor (rail ${round1(r.wall)})` : 'Floor',
    dim: fmtDim(r.w, r.h), color: toolColor('floor'), cx: r.x + r.w / 2, cy: r.y + r.h / 2, floorHit: 'na',
  }));
  const zones: OutlineRow[] = (h.zones ?? []).map((z, i) => ({
    sel: { kind: 'zone', i }, name: z.kind === 'tele' ? 'Teleporter' : z.kind, dim: fmtDim(z.w, z.h), color: toolColor(z.kind),
    cx: z.x + z.w / 2, cy: z.y + z.h / 2, floorHit: floorHitOf(h, rectSamples(z)),
  }));
  (h.zones ?? []).forEach((z, i) => {
    if (z.kind === 'tele' && z.tx !== undefined && z.ty !== undefined)
      zones.push({ sel: { kind: 'teleExit', i }, name: `↳ exit of tele ${i + 1}`, dim: `${round1(z.tx)}, ${round1(z.ty)}`, color: toolColor('tele'), cx: z.tx, cy: z.ty, floorHit: floorHitOf(h, [[z.tx, z.ty]]) });
  });
  const blocks: OutlineRow[] = (h.blocks ?? []).map((b, i) => {
    const { name, tool } = blockName(b);
    const c = b.motion && (b.motion.type === 'rotate' || b.motion.type === 'swing') ? { x: b.motion.cx, y: b.motion.cy } : centroid(b.pts);
    const pts: [number, number][] = [[c.x, c.y]];
    for (let k = 0; k < b.pts.length; k += 2) pts.push([b.pts[k], b.pts[k + 1]]);
    const dim = b.gen && (b.gen.kind === 'rect' || b.gen.kind === 'tri') ? fmtDim(b.gen.w, b.gen.h) : b.gen ? `len ${round1(b.gen.len)}` : `${b.pts.length / 2} pts`;
    return { sel: { kind: 'block', i }, name, dim, color: toolColor(tool), cx: c.x, cy: c.y, floorHit: floorHitOf(h, pts) };
  });
  const bumpers: OutlineRow[] = (h.bumpers ?? []).map((b, i) => ({
    sel: { kind: 'bumper', i }, name: b.kick > 0 ? 'Bumper' : 'Post', dim: `r ${round1(b.r)}`, color: toolColor(b.kick > 0 ? 'bumper' : 'post'),
    cx: b.x, cy: b.y, floorHit: floorHitOf(h, [[b.x, b.y]]),
  }));
  return [
    { group: 'Layout', rows: [...layout, ...floors] },
    { group: 'Zones', rows: zones },
    { group: 'Blocks', rows: blocks },
    { group: 'Bumpers', rows: bumpers },
  ];
}
let outlineSig = '';
let outlineAt = 0;
function renderOutline(force = false) {
  const el = $('ed-outline');
  const h = hole();
  const groups = outlineRows(h);
  const sig = JSON.stringify([groups, sel]);
  if (!force && sig === outlineSig) return;
  outlineSig = sig;
  const top = el.scrollTop;
  el.innerHTML = '';
  for (const { group, rows } of groups) {
    const head = document.createElement('h3');
    head.innerHTML = `${esc(group)}<span>${rows.length}</span>`;
    el.appendChild(head);
    if (!rows.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = 'none'; el.appendChild(e); continue; }
    for (const r of rows) {
      const row = document.createElement('div');
      row.className = 'row' + (sameSel(sel, r.sel) ? ' active' : '');
      const idx = 'i' in r.sel && r.sel.kind !== 'teleExit' ? `${r.sel.i + 1} · ` : '';
      const warn = r.floorHit === 'off' ? `<span class="warn bad" title="No floor under it — the ball can't reach this. Move it onto the green or draw a floor under it.">⚠</span>`
        : r.floorHit === 'part' ? `<span class="warn" title="Partly off the floor — only the part over the green is in play.">◐</span>` : '';
      row.innerHTML = `<i style="background:${r.color}"></i><span class="name">${idx}${esc(r.name)}</span><span class="dim">${esc(r.dim)}</span>${warn}`;
      row.onclick = () => { sel = r.sel; if (tool !== 'select') { tool = 'select'; buildTools(); } renderProps(); };
      row.ondblclick = () => { sel = r.sel; cam.x = r.cx; cam.y = r.cy; renderProps(); };
      el.appendChild(row);
    }
  }
  el.scrollTop = top;
  el.querySelector('.row.active')?.scrollIntoView({ block: 'nearest' });
}

// ---------------------------------------------------------------------------
// Undo
// ---------------------------------------------------------------------------
function pushUndo() {
  undoStack.push(JSON.stringify(hole()));
  if (undoStack.length > 80) undoStack.shift();
  redoStack = [];
  dirty = true;
}
function undo() {
  const s = undoStack.pop();
  if (!s) return;
  redoStack.push(JSON.stringify(hole()));
  holes[cur] = JSON.parse(s);
  keepSel(); renderProps();
}
function redo() {
  const s = redoStack.pop();
  if (!s) return;
  undoStack.push(JSON.stringify(hole()));
  holes[cur] = JSON.parse(s);
  keepSel(); renderProps();
}
/** after a restore, the selection survives if what it points at still exists */
function keepSel() {
  const h = hole();
  if (!sel) return;
  const n = sel.kind === 'floor' ? h.floor.length : sel.kind === 'zone' || sel.kind === 'teleExit' ? (h.zones?.length ?? 0) : sel.kind === 'bumper' ? (h.bumpers?.length ?? 0) : sel.kind === 'block' ? (h.blocks?.length ?? 0) : 1;
  if ('i' in sel && sel.i >= n) sel = null;
}

// ---------------------------------------------------------------------------
// Pointer handling
// ---------------------------------------------------------------------------
const snapV = (v: number) => Math.round(v / snap) * snap;
function worldAt(e: PointerEvent) {
  const r = canvas().getBoundingClientRect();
  return s2w(cam, W, H, e.clientX - r.left, e.clientY - r.top);
}

function onDown(e: PointerEvent) {
  if (!open || testing) return;
  canvas().setPointerCapture(e.pointerId);
  const w = worldAt(e);
  if (e.button === 1 || e.button === 2 || tool === 'pan' || spaceHeld) {
    drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y };
    return;
  }
  const h = hole();
  const sx = snapV(w.x), sy = snapV(w.y);
  switch (tool) {
    case 'select': {
      // a gizmo grip on the selection?
      const grip = gripAt(w);
      if (grip && sel) { drag = { mode: 'grip', sel, grip: grip.h, orig: clone(h) }; pushUndo(); canvas().style.cursor = grip.h.kind === 'rotate' || grip.h.kind === 'angle' ? 'grabbing' : grip.cursor; return; }
      const hit = pick(w);
      sel = hit;
      renderProps();
      if (hit) { drag = { mode: 'move', sel: hit, start: w, orig: clone(h) }; pushUndo(); }
      return;
    }
    case 'tee': pushUndo(); h.tee = { x: sx, y: sy }; sel = { kind: 'tee' }; renderProps(); return;
    case 'cup': pushUndo(); h.cup = { x: sx, y: sy }; sel = { kind: 'cup' }; renderProps(); return;
    case 'swing': {
      const s = swing && swing.holeIdx === cur ? swing : null;
      const onBall = !!s && Math.hypot(s.x - w.x, s.y - w.y) < BALL_R + 10 / cam.scale;
      if (!s) { placeSwing(sx, sy); drag = { mode: 'swingMove' }; }
      else if (e.shiftKey || onBall) drag = { mode: 'swingMove' };
      else { aimSwing(w); drag = { mode: 'swingAim' }; }
      return;
    }
    case 'bumper': case 'post': {
      pushUndo();
      h.bumpers ??= [];
      if (h.bumpers.length >= LIMITS.bumpers) { toast('Too many bumpers', true); return; }
      h.bumpers.push({ x: sx, y: sy, r: tool === 'bumper' ? 1.1 : 0.8, kick: tool === 'bumper' ? 9 : 0 });
      sel = { kind: 'bumper', i: h.bumpers.length - 1 }; tool = 'select'; buildTools(); renderProps();
      return;
    }
    case 'windmill': {
      pushUndo();
      h.blocks ??= [];
      if (h.blocks.length >= LIMITS.blocks) { toast('Too many blocks', true); return; }
      const gen = { kind: 'windmill' as const, len: 4, width: 0.8, blades: 2 };
      h.blocks.push({ pts: windmillPts(sx, sy, gen.len, gen.width, gen.blades), motion: { type: 'rotate', cx: sx, cy: sy, speed: 1.5 }, hub: 0.7, gen });
      sel = { kind: 'block', i: h.blocks.length - 1 }; tool = 'select'; buildTools(); renderProps();
      return;
    }
    case 'pendulum': {
      pushUndo();
      h.blocks ??= [];
      if (h.blocks.length >= LIMITS.blocks) { toast('Too many blocks', true); return; }
      const gen = { kind: 'bar' as const, len: 6, width: 1.2 };
      h.blocks.push({ pts: barPts(sx, sy, gen.len, gen.width), motion: { type: 'swing', cx: sx, cy: sy, amp: 60, period: 3 }, hub: 0.9, gen });
      sel = { kind: 'block', i: h.blocks.length - 1 }; tool = 'select'; buildTools(); renderProps();
      return;
    }
    default:
      drag = { mode: 'create', x0: sx, y0: sy, x1: sx, y1: sy };
  }
}

let propsSyncAt = 0;
/** keep the panel's numbers in step with a canvas drag (throttled — nothing is focused during one) */
function syncPropsLive() {
  const now = performance.now();
  if (now - propsSyncAt < 80) return;
  propsSyncAt = now;
  renderProps();
}

function onMove(e: PointerEvent) {
  if (!open || testing) return;
  const w = worldAt(e);
  hoverWorld = w;
  if (!drag) {
    // the cursor says what a press would do
    const c = canvas();
    if (spaceHeld || tool === 'pan') c.style.cursor = 'grab';
    else if (tool !== 'select') c.style.cursor = 'crosshair';
    else { const gp = gripAt(w); c.style.cursor = gp ? gp.cursor : pick(w) ? 'move' : 'default'; }
    return;
  }
  const h = hole();
  if (drag.mode === 'pan') {
    cam.x = drag.cx - (e.clientX - drag.sx) / cam.scale;
    cam.y = drag.cy - (e.clientY - drag.sy) / cam.scale;
  } else if (drag.mode === 'create') {
    drag.x1 = snapV(w.x); drag.y1 = snapV(w.y);
  } else if (drag.mode === 'swingMove') {
    if (swing) { swing.x = snapV(w.x); swing.y = snapV(w.y); syncSwingPanel(); }
  } else if (drag.mode === 'swingAim') {
    aimSwing(w);
  } else if (drag.mode === 'move') {
    const dx = snapV(w.x - drag.start.x), dy = snapV(w.y - drag.start.y);
    holes[cur] = moved(drag.orig, drag.sel, dx, dy);
    syncPropsLive();
  } else if (drag.mode === 'grip') {
    dragGrip(h, drag.orig, drag.sel, drag.grip, w, e.altKey);
    syncPropsLive();
  }
}

function onUp(e: PointerEvent) {
  if (!open || testing) return;
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.mode === 'swingMove' || d.mode === 'swingAim') { renderProps(); return; }
  if (d.mode !== 'create') { if (d.mode !== 'pan') renderProps(); return; }
  const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1);
  const w = Math.abs(d.x1 - d.x0), hh = Math.abs(d.y1 - d.y0);
  if (w < 0.5 || hh < 0.5) return; // a click, not a drag
  const h = hole();
  pushUndo();
  switch (tool) {
    case 'floor':
      if (h.floor.length >= LIMITS.floorRects) { toast('Too many floor pieces', true); return; }
      h.floor.push({ x, y, w, h: hh }); sel = { kind: 'floor', i: h.floor.length - 1 }; break;
    case 'block': case 'lowblock': case 'slider': case 'laser': case 'rubber': {
      h.blocks ??= [];
      if (h.blocks.length >= LIMITS.blocks) { toast('Too many blocks', true); return; }
      const b: Block = { pts: rectPts({ x, y, w, h: hh }), gen: { kind: 'rect', w, h: hh, rot: 0 } };
      if (tool === 'lowblock') b.h = 0.5;
      if (tool === 'slider') b.motion = { type: 'slide', dx: 0, dy: 4, period: 3 };
      if (tool === 'laser') b.motion = { type: 'blink', period: 2.5, duty: 0.5 };
      if (tool === 'rubber') b.bounce = 2;
      h.blocks.push(b); sel = { kind: 'block', i: h.blocks.length - 1 }; break;
    }
    case 'tri': {
      // the right angle sits where the drag started; the legs run toward where it ended
      h.blocks ??= [];
      if (h.blocks.length >= LIMITS.blocks) { toast('Too many blocks', true); return; }
      const dx = d.x1 - d.x0, dy = d.y1 - d.y0;
      const rot = dx >= 0 && dy >= 0 ? 0 : dx < 0 && dy >= 0 ? 90 : dx < 0 ? 180 : 270;
      const [lw, lh] = rot === 0 || rot === 180 ? [w, hh] : [hh, w];
      const gen = { kind: 'tri' as const, w: lw, h: lh, rot };
      h.blocks.push({ pts: triPts(d.x0, d.y0, lw, lh, rot), gen });
      sel = { kind: 'block', i: h.blocks.length - 1 }; break;
    }
    default: {
      h.zones ??= [];
      if (h.zones.length >= LIMITS.zones) { toast('Too many zones', true); return; }
      const z: Zone = { kind: tool as ZoneKind, x, y, w, h: hh };
      const p = ZONE_DEFAULT_POWER[z.kind];
      if (p) z.power = p;
      if (DIRECTIONAL.includes(z.kind)) z.angle = 0;
      if (z.kind === 'cannon') z.lift = CANNON_DEFAULT_LIFT;
      if (z.kind === 'tele') { z.tx = x + w + 3; z.ty = y + hh / 2; }
      h.zones.push(z); sel = { kind: 'zone', i: h.zones.length - 1 };
    }
  }
  tool = 'select';
  buildTools();
  renderProps();
  void e;
}

// ---------------------------------------------------------------------------
// Gizmo — grips drawn on the selection that resize, rotate, aim and stretch
// it in place. Alt while dragging turns the grid snap off.
// ---------------------------------------------------------------------------
const DIRECTIONAL: ZoneKind[] = ['slope', 'boost', 'conveyor', 'fan', 'cannon', 'gravity'];
type Handle =
  | { kind: 'corner'; i: number } // floor / zone rect corner (0 top-left, clockwise)
  | { kind: 'edge'; i: number }   // floor / zone rect mid-edge (0 top, 1 right, 2 bottom, 3 left)
  | { kind: 'angle' }             // directional zone: the arrow tip
  | { kind: 'radius' }            // bumper / post rim
  | { kind: 'bcorner'; i: number } // rect block corner in its own rotated frame (opposite corner stays put)
  | { kind: 'rotate' }            // rect block: the knob above its top edge
  | { kind: 'len' }               // windmill / pendulum arm tip
  | { kind: 'travel'; sign: 1 | -1 }; // sliding block: either end of its travel
interface Grip { h: Handle; x: number; y: number; shape: 'square' | 'knob'; cursor: string }
const norm360 = (a: number) => ((a % 360) + 360) % 360;
const norm180 = (a: number) => norm360(a + 180) - 180;
const rad = (deg: number) => (deg * Math.PI) / 180;
const pivotOf = (b: Block) => (b.motion && (b.motion.type === 'rotate' || b.motion.type === 'swing') ? b.motion : null);
/** where the arrow of a directional zone points to (the aim grip) */
function arrowTip(z: Zone) {
  const a = rad(z.angle ?? 0);
  const L = Math.min(z.w, z.h) / 2 + Math.max(1, 18 / cam.scale);
  return { x: z.x + z.w / 2 + Math.cos(a) * L, y: z.y + z.h / 2 + Math.sin(a) * L };
}
function gripsOf(h: Hole, s: Sel): Grip[] {
  const out: Grip[] = [];
  if (!s) return out;
  const reach = Math.max(1, 18 / cam.scale); // how far a knob stands off its object, in world units
  if (s.kind === 'floor' || s.kind === 'zone') {
    const r = s.kind === 'floor' ? h.floor[s.i] : h.zones![s.i];
    const cs = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
    cs.forEach(([x, y], i) => out.push({ h: { kind: 'corner', i }, x, y, shape: 'square', cursor: i % 2 ? 'nesw-resize' : 'nwse-resize' }));
    const es = [[r.x + r.w / 2, r.y], [r.x + r.w, r.y + r.h / 2], [r.x + r.w / 2, r.y + r.h], [r.x, r.y + r.h / 2]];
    es.forEach(([x, y], i) => out.push({ h: { kind: 'edge', i }, x, y, shape: 'square', cursor: i % 2 ? 'ew-resize' : 'ns-resize' }));
    if (s.kind === 'zone' && DIRECTIONAL.includes((r as Zone).kind)) { const t = arrowTip(r as Zone); out.push({ h: { kind: 'angle' }, x: t.x, y: t.y, shape: 'knob', cursor: 'grab' }); }
  } else if (s.kind === 'bumper') {
    const b = h.bumpers![s.i];
    out.push({ h: { kind: 'radius' }, x: b.x + b.r, y: b.y, shape: 'square', cursor: 'ew-resize' });
  } else if (s.kind === 'block') {
    const b = h.blocks![s.i];
    const g = b.gen;
    const pv = pivotOf(b);
    if (g?.kind === 'rect') {
      const c = centroid(b.pts);
      const a = rad(g.rot), ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
      for (let i = 0; i < 4; i++) {
        const sx = i === 1 || i === 2 ? 1 : -1, sy = i >= 2 ? 1 : -1;
        out.push({ h: { kind: 'bcorner', i }, x: c.x + ux * sx * g.w / 2 + vx * sy * g.h / 2, y: c.y + uy * sx * g.w / 2 + vy * sy * g.h / 2, shape: 'square', cursor: i % 2 ? 'nesw-resize' : 'nwse-resize' });
      }
      out.push({ h: { kind: 'rotate' }, x: c.x - vx * (g.h / 2 + reach), y: c.y - vy * (g.h / 2 + reach), shape: 'knob', cursor: 'grab' });
    }
    if (g?.kind === 'tri') {
      // pts[0] is the right-angle corner; the other two ends resize a leg each
      const a = rad(g.rot), ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
      const cx = b.pts[0], cy = b.pts[1];
      out.push({ h: { kind: 'bcorner', i: 0 }, x: cx + ux * g.w, y: cy + uy * g.w, shape: 'square', cursor: 'move' });
      out.push({ h: { kind: 'bcorner', i: 1 }, x: cx + vx * g.h, y: cy + vy * g.h, shape: 'square', cursor: 'move' });
      out.push({ h: { kind: 'rotate' }, x: cx + (ux * g.w + vx * g.h) / 2 + (ux + vx) * reach, y: cy + (uy * g.w + vy * g.h) / 2 + (uy + vy) * reach, shape: 'knob', cursor: 'grab' });
    }
    if (pv && g && (g.kind === 'windmill' || g.kind === 'bar')) {
      const tip = g.kind === 'windmill' ? { x: pv.cx + g.len, y: pv.cy } : { x: pv.cx, y: pv.cy + g.len };
      out.push({ h: { kind: 'len' }, x: tip.x, y: tip.y, shape: 'square', cursor: 'move' });
    }
    if (b.motion?.type === 'slide') {
      const c = centroid(b.pts);
      out.push({ h: { kind: 'travel', sign: 1 }, x: c.x + b.motion.dx, y: c.y + b.motion.dy, shape: 'knob', cursor: 'move' });
      out.push({ h: { kind: 'travel', sign: -1 }, x: c.x - b.motion.dx, y: c.y - b.motion.dy, shape: 'knob', cursor: 'move' });
    }
  }
  return out;
}
/** the grip under a world point (knobs win over the squares they may overlap) */
function gripAt(w: { x: number; y: number }): Grip | null {
  if (!sel) return null;
  const tol = 9 / cam.scale;
  const gs = gripsOf(hole(), sel);
  for (let i = gs.length - 1; i >= 0; i--) if (Math.hypot(gs[i].x - w.x, gs[i].y - w.y) < tol) return gs[i];
  return null;
}
/** rebuild a generated block's polygon from its `gen` (after a size / rotation change) */
function regenBlock(b: Block) {
  const gen = b.gen;
  const pv = pivotOf(b);
  if (gen?.kind === 'rect') {
    const c = centroid(b.pts);
    b.pts = rotRect(c.x, c.y, gen.w, gen.h, gen.rot);
  } else if (gen?.kind === 'tri') {
    // pts[0] is the right-angle corner: the shape turns about it
    b.pts = triPts(b.pts[0], b.pts[1], gen.w, gen.h, gen.rot);
  } else if (gen?.kind === 'windmill' && pv) {
    b.pts = windmillPts(pv.cx, pv.cy, gen.len, gen.width, gen.blades);
    b.hub = Math.max(0.5, gen.width * 0.9);
  } else if (gen?.kind === 'bar' && pv) {
    b.pts = barPts(pv.cx, pv.cy, gen.len, gen.width);
    b.hub = Math.max(0.4, gen.width * 0.8);
  }
}
function dragGrip(h: Hole, o: Hole, s: Sel, gp: Handle, w: { x: number; y: number }, free: boolean) {
  if (!s) return;
  const sn = (v: number) => (free ? round2(v) : snapV(v));
  const snapDeg = (a: number) => (free ? Math.round(a) : Math.round(a / 5) * 5);
  if (s.kind === 'floor' || s.kind === 'zone') {
    const r0 = s.kind === 'floor' ? o.floor[s.i] : o.zones![s.i];
    const r = s.kind === 'floor' ? h.floor[s.i] : h.zones![s.i];
    if (gp.kind === 'corner' || gp.kind === 'edge') {
      let x0 = r0.x, y0 = r0.y, x1 = r0.x + r0.w, y1 = r0.y + r0.h;
      const nx = sn(w.x), ny = sn(w.y);
      if (gp.kind === 'corner') { if (gp.i === 0 || gp.i === 3) x0 = nx; else x1 = nx; if (gp.i === 0 || gp.i === 1) y0 = ny; else y1 = ny; }
      else if (gp.i === 0) y0 = ny; else if (gp.i === 1) x1 = nx; else if (gp.i === 2) y1 = ny; else x0 = nx;
      Object.assign(r, { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.max(0.5, Math.abs(x1 - x0)), h: Math.max(0.5, Math.abs(y1 - y0)) });
    } else if (gp.kind === 'angle') {
      const z = r as Zone;
      z.angle = norm360(snapDeg((Math.atan2(w.y - (z.y + z.h / 2), w.x - (z.x + z.w / 2)) * 180) / Math.PI));
    }
  } else if (s.kind === 'bumper' && gp.kind === 'radius') {
    const b = h.bumpers![s.i];
    b.r = Math.max(0.3, Math.min(6, Math.round(Math.hypot(w.x - b.x, w.y - b.y) * 10) / 10));
  } else if (s.kind === 'block') {
    const b = h.blocks![s.i], b0 = o.blocks![s.i];
    const g = b.gen, g0 = b0.gen;
    const pv = pivotOf(b);
    if (gp.kind === 'rotate' && g?.kind === 'rect') {
      const c = centroid(b0.pts);
      g.rot = norm180(snapDeg((Math.atan2(w.y - c.y, w.x - c.x) * 180) / Math.PI + 90));
      b.pts = rotRect(c.x, c.y, g.w, g.h, g.rot);
    } else if (gp.kind === 'bcorner' && g?.kind === 'rect' && g0?.kind === 'rect') {
      const c = centroid(b0.pts);
      const a = rad(g0.rot), ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
      const sx = gp.i === 1 || gp.i === 2 ? 1 : -1, sy = gp.i >= 2 ? 1 : -1;
      // the opposite corner is the anchor; the dragged corner follows the pointer in the block's own frame
      const ax = c.x - (ux * sx * g0.w + vx * sy * g0.h) / 2, ay = c.y - (uy * sx * g0.w + vy * sy * g0.h) / 2;
      const eu = (w.x - ax) * ux + (w.y - ay) * uy, ev = (w.x - ax) * vx + (w.y - ay) * vy;
      const nw = Math.max(0.2, sn(Math.abs(eu))), nh = Math.max(0.2, sn(Math.abs(ev)));
      const du = (eu < 0 ? -1 : 1) * nw, dv = (ev < 0 ? -1 : 1) * nh;
      g.w = nw; g.h = nh;
      b.pts = rotRect(ax + (ux * du + vx * dv) / 2, ay + (uy * du + vy * dv) / 2, nw, nh, g.rot);
    } else if (gp.kind === 'rotate' && g?.kind === 'tri') {
      // turn about the right-angle corner, which stays put
      const cx = b0.pts[0], cy = b0.pts[1];
      g.rot = norm180(snapDeg((Math.atan2(w.y - cy, w.x - cx) * 180) / Math.PI - 45));
      b.pts = triPts(cx, cy, g.w, g.h, g.rot);
    } else if (gp.kind === 'bcorner' && g?.kind === 'tri' && g0?.kind === 'tri') {
      const cx = b0.pts[0], cy = b0.pts[1];
      const a = rad(g0.rot), ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
      // project the pointer onto the leg being dragged
      const leg = gp.i === 0 ? (w.x - cx) * ux + (w.y - cy) * uy : (w.x - cx) * vx + (w.y - cy) * vy;
      const nv = Math.max(0.2, sn(Math.abs(leg)));
      if (gp.i === 0) g.w = nv; else g.h = nv;
      b.pts = triPts(cx, cy, g.w, g.h, g.rot);
    } else if (gp.kind === 'len' && pv && g && (g.kind === 'windmill' || g.kind === 'bar')) {
      g.len = Math.max(0.5, Math.min(60, sn(Math.hypot(w.x - pv.cx, w.y - pv.cy))));
      regenBlock(b);
    } else if (gp.kind === 'travel' && b.motion?.type === 'slide') {
      const c = centroid(b0.pts);
      b.motion.dx = sn((w.x - c.x) * gp.sign);
      b.motion.dy = sn((w.y - c.y) * gp.sign);
    }
  }
}
/** Shift+wheel turns the selection, Alt+wheel raises / grows it; true when the wheel was used up */
function wheelAdjust(e: WheelEvent): boolean {
  if (!sel || !(e.shiftKey || e.altKey)) return false;
  const h = hole();
  const up = (e.deltaY || e.deltaX) < 0;
  const d = up ? 1 : -1;
  let did = false;
  const adjust = (fn: () => void) => { beginGesture(); fn(); did = true; };
  if (sel.kind === 'block') {
    const b = h.blocks![sel.i];
    if (e.shiftKey && (b.gen?.kind === 'rect' || b.gen?.kind === 'tri')) { const g = b.gen; adjust(() => { g.rot = norm180(g.rot + 5 * d); regenBlock(b); }); }
    else if (e.altKey) adjust(() => { const v = Math.round(((b.h ?? WALL_H) + 0.1 * d) * 100) / 100; setBlockHeight(b, v); });
  } else if (sel.kind === 'zone') {
    const z = h.zones![sel.i];
    if (e.shiftKey && DIRECTIONAL.includes(z.kind)) adjust(() => { z.angle = norm360((z.angle ?? 0) + 5 * d); });
    else if (e.altKey && POWER_FIELDS[z.kind]) { const pf = POWER_FIELDS[z.kind]!; adjust(() => { z.power = Math.max(pf[2], Math.min(pf[3], round2((z.power ?? ZONE_DEFAULT_POWER[z.kind] ?? 0) + pf[1] * d))); }); }
    else if (e.altKey && z.kind === 'tunnel') adjust(() => { z.level = Math.max(0, Math.min(LIMITS.floorZ, round2(tunnelLevel(h, z) + 0.25 * d))); });
  } else if (sel.kind === 'floor' && e.altKey) {
    const r = h.floor[sel.i];
    adjust(() => { setFloorZ(r, (r.z ?? 0) + 0.25 * d); });
  } else if (sel.kind === 'bumper' && e.altKey) {
    const b = h.bumpers![sel.i];
    adjust(() => { b.r = Math.max(0.3, Math.min(6, Math.round((b.r + 0.1 * d) * 10) / 10)); });
  }
  if (did) settleGesture();
  return did;
}
function setBlockHeight(b: Block, v: number) {
  if (Math.abs(v - WALL_H) < 1e-6) delete b.h; else b.h = Math.max(0.1, Math.min(50, v));
}
function setFloorWall(r: Rect, v: number) {
  const w = Math.max(0, Math.min(LIMITS.wallH, Math.round(v * 100) / 100));
  if (Math.abs(w - WALL_H) < 1e-6) delete r.wall; else r.wall = w;
}
function setFloorZ(r: Rect, v: number) {
  const z = Math.max(0, Math.min(LIMITS.floorZ, Math.round(v * 100) / 100));
  if (z > 0) r.z = z; else delete r.z;
}

function pick(w: { x: number; y: number }): Sel {
  const h = hole();
  const tol = 10 / cam.scale;
  if (Math.hypot(h.tee.x - w.x, h.tee.y - w.y) < 0.9 + tol) return { kind: 'tee' };
  if (Math.hypot(h.cup.x - w.x, h.cup.y - w.y) < 0.8 + tol) return { kind: 'cup' };
  const zs = h.zones ?? [];
  for (let i = zs.length - 1; i >= 0; i--) {
    const z = zs[i];
    if (z.kind === 'tele' && z.tx !== undefined && Math.hypot(z.tx - w.x, z.ty! - w.y) < 0.8 + tol) return { kind: 'teleExit', i };
  }
  const bs = h.bumpers ?? [];
  for (let i = bs.length - 1; i >= 0; i--) if (Math.hypot(bs[i].x - w.x, bs[i].y - w.y) < bs[i].r + tol) return { kind: 'bumper', i };
  const bl = h.blocks ?? [];
  for (let i = bl.length - 1; i >= 0; i--) {
    const b = bl[i];
    if (b.motion?.type === 'rotate' || b.motion?.type === 'swing') { const g = b.gen; const len = g && (g.kind === 'windmill' || g.kind === 'bar') ? g.len : 4; if (Math.hypot(b.motion.cx - w.x, b.motion.cy - w.y) < len) return { kind: 'block', i }; }
    if (pointInPoly(w.x, w.y, b.pts)) return { kind: 'block', i };
    if (b.motion?.type === 'slide') { const c = centroid(b.pts); if (Math.hypot(c.x - w.x, c.y - w.y) < 2) return { kind: 'block', i }; }
  }
  for (let i = zs.length - 1; i >= 0; i--) if (pointInRect(w.x, w.y, zs[i])) return { kind: 'zone', i };
  for (let i = h.floor.length - 1; i >= 0; i--) if (pointInRect(w.x, w.y, h.floor[i])) return { kind: 'floor', i };
  return null;
}

function centroid(pts: number[]) { let x = 0, y = 0; const n = pts.length / 2; for (let i = 0; i < pts.length; i += 2) { x += pts[i]; y += pts[i + 1]; } return { x: x / n, y: y / n }; }

function moved(orig: Hole, s: Sel, dx: number, dy: number): Hole {
  const h = clone(orig);
  if (!s) return h;
  switch (s.kind) {
    case 'tee': h.tee.x += dx; h.tee.y += dy; break;
    case 'cup': h.cup.x += dx; h.cup.y += dy; break;
    case 'floor': h.floor[s.i].x += dx; h.floor[s.i].y += dy; break;
    case 'zone': h.zones![s.i].x += dx; h.zones![s.i].y += dy; if (h.zones![s.i].tx !== undefined) { h.zones![s.i].tx! += dx; h.zones![s.i].ty! += dy; } break;
    case 'teleExit': h.zones![s.i].tx! += dx; h.zones![s.i].ty! += dy; break;
    case 'bumper': h.bumpers![s.i].x += dx; h.bumpers![s.i].y += dy; break;
    case 'block': {
      const b = h.blocks![s.i];
      for (let i = 0; i < b.pts.length; i += 2) { b.pts[i] += dx; b.pts[i + 1] += dy; }
      if (b.motion?.type === 'rotate' || b.motion?.type === 'swing') { b.motion.cx += dx; b.motion.cy += dy; }
      break;
    }
  }
  return h;
}

function deleteSel() {
  if (!sel) return;
  const h = hole();
  pushUndo();
  switch (sel.kind) {
    case 'floor': if (h.floor.length > 1) h.floor.splice(sel.i, 1); else toast('A hole needs at least one floor', true); break;
    case 'zone': case 'teleExit': h.zones!.splice(sel.i, 1); break;
    case 'bumper': h.bumpers!.splice(sel.i, 1); break;
    case 'block': h.blocks!.splice(sel.i, 1); break;
    default: toast('Move the tee/cup instead of deleting it'); break;
  }
  sel = null;
  renderProps();
}

function onKey(e: KeyboardEvent) {
  if (!open) return;
  const inInput = (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.tagName === 'SELECT';
  if (e.key === 'Escape') { if (testing) stopTest(); else { sel = null; tool = 'select'; buildTools(); renderProps(); } (document.activeElement as HTMLElement)?.blur?.(); return; }
  if (inInput) return;
  if (e.key === ' ') { spaceHeld = true; e.preventDefault(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
  if (testing) {
    if (e.key === 'r' || e.key === 'R') resetTestBall();
    if (e.key === 'u' || e.key === 'U') { placeTestBall(testSafe.x, testSafe.y); testStruck = false; testAim.active = false; }
    if (e.key === 'c' || e.key === 'C') toggleTestCam();
    return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && tool === 'swing' && !sel) { clearSwing(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { deleteSel(); return; }
  if (e.key === 'g') { snap = snap === 0.5 ? 1 : snap === 1 ? 0.25 : 0.5; toast(`Grid snap ${snap}`); return; }
  if (e.key === 't') { startTest(); return; }
  if (e.key === 'p') { tool = 'swing'; sel = null; buildTools(); renderProps(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && sel) { e.preventDefault(); duplicateSel(); return; }
  const nudge: Record<string, [number, number]> = { ArrowLeft: [-snap, 0], ArrowRight: [snap, 0], ArrowUp: [0, -snap], ArrowDown: [0, snap] };
  if (nudge[e.key] && sel) { e.preventDefault(); pushUndo(); holes[cur] = moved(hole(), sel, nudge[e.key][0], nudge[e.key][1]); renderProps(); return; }
  if (nudge[e.key] && tool === 'swing' && swing && swing.holeIdx === cur) {
    // fine-tune the preview shot: ←/→ turn (1°, Shift 0.1°), ↑/↓ power (2%, Shift 0.5%)
    e.preventDefault();
    const fine = e.shiftKey;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') swing.angleDeg = round1(wrapDeg(swing.angleDeg + (e.key === 'ArrowLeft' ? -1 : 1) * (fine ? 0.1 : 1)));
    else swing.power = Math.round(clamp01(swing.power + (e.key === 'ArrowUp' ? 1 : -1) * (fine ? 0.005 : 0.02)) * 200) / 200;
    syncSwingPanel();
    return;
  }
  if (e.key === 'v') { tool = 'select'; buildTools(); return; }
  const t = TOOL_DEFS.find(d => d.key === e.key.toLowerCase() && !e.ctrlKey && !e.metaKey);
  if (t) { tool = t.id; sel = null; buildTools(); renderProps(); }
}

function duplicateSel() {
  const h = hole();
  if (!sel) return;
  pushUndo();
  const off = 2;
  if (sel.kind === 'floor') { h.floor.push({ ...h.floor[sel.i], x: h.floor[sel.i].x + off, y: h.floor[sel.i].y + off }); sel = { kind: 'floor', i: h.floor.length - 1 }; }
  else if (sel.kind === 'zone' || sel.kind === 'teleExit') { const z = clone(h.zones![sel.i]); z.x += off; z.y += off; if (z.tx !== undefined) { z.tx += off; z.ty! += off; } h.zones!.push(z); sel = { kind: 'zone', i: h.zones!.length - 1 }; }
  else if (sel.kind === 'bumper') { h.bumpers!.push({ ...h.bumpers![sel.i], x: h.bumpers![sel.i].x + off, y: h.bumpers![sel.i].y + off }); sel = { kind: 'bumper', i: h.bumpers!.length - 1 }; }
  else if (sel.kind === 'block') { const tmp = moved({ ...h, blocks: [h.blocks![sel.i]] }, { kind: 'block', i: 0 }, off, off); h.blocks!.push(tmp.blocks![0]); sel = { kind: 'block', i: h.blocks!.length - 1 }; }
  renderProps();
}

// ---------------------------------------------------------------------------
// Properties panel — every number is a slider beside a value box. Both drive
// the hole LIVE (the canvas redraws each frame); a label scrubs its value
// sideways, and the wheel steps any of them (Shift = ×10). One undo step per
// gesture — a slider drag, a wheel burst, a scrub, a typed edit.
// ---------------------------------------------------------------------------
function field(label: string, input: string) { return `<div class="field"><label>${label}</label>${input}</div>`; }
/** slider + number: `min`/`max` bound the value, `span` (default: the same) is what the slider spans */
function numIn(id: string, v: number, step = 0.5, min = -LIMITS.coord, max = LIMITS.coord, span?: [number, number]) {
  const [lo, hi] = span ?? [min, max];
  return `<div class="ctl"><input type="range" id="${id}-r" min="${Math.min(lo, v)}" max="${Math.max(hi, v)}" step="${step}" value="${v}" /><input type="number" id="${id}" value="${round2(v)}" step="${step}" min="${min}" max="${max}" /></div>`;
}
type Apply = (v: number, final: boolean, from?: HTMLInputElement) => void;
type NumInput = HTMLInputElement & { __apply?: Apply };
let gesture: string | null = null; // the hole as it was when the current gesture began
function beginGesture() { if (gesture === null) gesture = JSON.stringify(hole()); }
function endGesture() {
  if (gesture === null) return;
  const before = gesture;
  gesture = null;
  if (before === JSON.stringify(hole())) return;
  undoStack.push(before);
  if (undoStack.length > 80) undoStack.shift();
  redoStack = [];
  dirty = true;
}
let settleTimer = 0;
/** wheel bursts have no "release": the gesture ends when the wheel goes quiet */
function settleGesture() {
  clearTimeout(settleTimer);
  settleTimer = window.setTimeout(() => { endGesture(); renderProps(); }, 450);
}
const clampTo = (num: HTMLInputElement, v: number) => Math.max(num.min === '' ? -Infinity : Number(num.min), Math.min(num.max === '' ? Infinity : Number(num.max), v));
function bind(id: string, fn: (v: number) => void) {
  const num = $(id) as NumInput | null;
  if (!num) return;
  const range = $(`${id}-r`) as HTMLInputElement | null;
  const apply: Apply = (v, final, from) => {
    if (!Number.isFinite(v)) return;
    beginGesture();
    fn(v);
    dirty = true;
    if (final) { endGesture(); renderProps(); return; }
    if (from !== num) num.value = String(round2(v));
    if (range && from !== range) range.value = String(v);
  };
  num.__apply = apply;
  num.oninput = () => apply(Number(num.value), false, num);
  num.onchange = () => apply(Number(num.value), true, num);
  if (range) {
    range.oninput = () => apply(Number(range.value), false, range);
    range.onchange = () => apply(Number(range.value), true, range);
  }
}
/** the panel-wide wheel and label-scrub handlers (once) */
function wireProps() {
  const el = $('ed-props');
  el.addEventListener('wheel', e => {
    const t = e.target as HTMLElement;
    if (!(t instanceof HTMLInputElement) || (t.type !== 'number' && t.type !== 'range')) return;
    const num = (t.type === 'number' ? t : $(t.id.slice(0, -2))) as NumInput | null;
    if (!num?.__apply) return;
    e.preventDefault();
    const step = (Number(num.step) || 1) * (e.shiftKey ? 10 : 1);
    const d = (e.deltaY || e.deltaX) < 0 ? 1 : -1;
    num.__apply(round2(clampTo(num, Number(num.value) + d * step)), false);
    settleGesture();
  }, { passive: false });
  el.addEventListener('pointerdown', e => {
    const lab = (e.target as HTMLElement).closest?.('label');
    if (!lab || e.button !== 0) return;
    const num = lab.parentElement?.querySelector('input[type=number]') as NumInput | null;
    if (!num?.__apply) return;
    e.preventDefault();
    const v0 = Number(num.value), x0 = e.clientX, step = Number(num.step) || 1;
    let scrubbed = false;
    lab.setPointerCapture(e.pointerId);
    const mv = (ev: PointerEvent) => {
      const k = Math.round((ev.clientX - x0) / 6) * (ev.shiftKey ? 10 : 1);
      if (k) scrubbed = true;
      num.__apply!(round2(clampTo(num, v0 + k * step)), false);
    };
    const up = () => {
      lab.removeEventListener('pointermove', mv); lab.removeEventListener('pointerup', up); lab.removeEventListener('pointercancel', up);
      if (scrubbed) { endGesture(); renderProps(); }
      else { gesture = null; num.focus(); num.select(); }
    };
    lab.addEventListener('pointermove', mv); lab.addEventListener('pointerup', up); lab.addEventListener('pointercancel', up);
  });
}
/** zone power: label, step, min, max */
const POWER_FIELDS: Partial<Record<ZoneKind, [string, number, number, number]>> = {
  slope: ['Steepness (u/s² downhill)', 0.5, 0.5, 30],
  boost: ['Boost (u/s²)', 0.5, 0, 80],
  jump: ['Launch (vz)', 0.5, 2, 30],
  conveyor: ['Belt speed (u/s)', 0.5, 0.5, 30],
  spinner: ['Spin (rad/s · negative = the other way)', 0.5, -8, 8],
  fan: ['Blow (u/s²)', 1, 5, 80],
  trampoline: ['Bounce (vz)', 0.5, 3, 30],
  magnet: ['Pull (u/s² · negative = push away)', 1, -80, 80],
  cannon: ['Muzzle speed at full power (u/s)', 1, 5, 46],
  gravity: ['Pull (u/s²)', 0.5, 0, 80],
};
function renderProps() {
  const el = $('ed-props');
  const top = el.scrollTop;
  renderPropsInto(el);
  el.scrollTop = top;
  renderOutline();
}
function renderPropsInto(el: HTMLElement) {
  const h = hole();
  const s = sel;
  if (tool === 'swing' && !s) { renderSwingProps(el); return; }
  // position sliders span the hole with some lawn either side; the boxes take anything the format allows
  const bb = holeBounds(h);
  const spanX: [number, number] = [Math.floor(bb.minX - 16), Math.ceil(bb.maxX + 16)];
  const spanY: [number, number] = [Math.floor(bb.minY - 16), Math.ceil(bb.maxY + 16)];
  const posIn = (id: string, v: number, axis: 'x' | 'y') => numIn(id, v, 0.5, -LIMITS.coord, LIMITS.coord, axis === 'x' ? spanX : spanY);
  const sizeIn = (id: string, v: number, min = 0.5) => numIn(id, v, 0.5, min, LIMITS.size, [min, Math.max(20, Math.ceil(Math.max(bb.w, bb.h)))]);
  if (!s) {
    el.innerHTML = `<h3>Hole ${cur + 1} of ${holes.length}</h3>
      ${field('Name', `<input type="text" id="p-name" value="${esc(h.name)}" maxlength="${LIMITS.holeNameLen}" />`)}
      ${field('Par', numIn('p-par', h.par, 1, 1, LIMITS.par))}
      ${field('Tip (intro card)', `<input type="text" id="p-tip" value="${esc(h.tip ?? '')}" maxlength="${LIMITS.tipLen}" />`)}
      ${field('Theme', `<select id="p-theme">${THEME_NAMES.map(t => `<option value="${t}"${(h.theme ?? 'park') === t ? ' selected' : ''}>${t.toUpperCase()}</option>`).join('')}</select>`)}
      ${field('Gravity (1 = earth · 0.4 = moon · 2 = heavy)', numIn('p-gravity', h.gravity ?? 1, 0.05, 0.3, 2))}
      <div class="row wrap" style="margin-top:8px">
        <button class="btn small" id="p-dup">Duplicate hole</button>
        <button class="btn small" id="p-left" ${cur === 0 ? 'disabled' : ''}>◀ Move</button>
        <button class="btn small" id="p-right" ${cur === holes.length - 1 ? 'disabled' : ''}>Move ▶</button>
        <button class="btn small danger" id="p-del" ${holes.length <= 1 ? 'disabled' : ''}>Delete hole</button>
      </div>
      <h3>Stats</h3>
      <div class="tiny">${h.floor.length} floors · ${h.blocks?.length ?? 0} blocks · ${h.zones?.length ?? 0} zones · ${h.bumpers?.length ?? 0} bumpers</div>
      <h3>Shortcuts</h3>
      <div class="tiny">V select · F floor · B block · S sand · I ice · W water · J jump<br>P swing preview · T test in 3D · G grid snap (${snap}) · Ctrl+Z undo · Ctrl+D duplicate · Del delete<br>Wheel zoom · Space/right-drag pan<br>Drag the green grips to resize, the gold knobs to turn or aim · Alt = no snap<br>Shift+wheel turns the selection · Alt+wheel raises / grows it<br>Drag a label sideways to scrub its value · wheel over any number steps it</div>`;
    ($('p-name') as HTMLInputElement).onchange = e => { pushUndo(); h.name = (e.target as HTMLInputElement).value.slice(0, LIMITS.holeNameLen) || 'Untitled'; };
    ($('p-tip') as HTMLInputElement).onchange = e => { pushUndo(); h.tip = (e.target as HTMLInputElement).value.slice(0, LIMITS.tipLen); };
    ($('p-theme') as HTMLSelectElement).onchange = e => { pushUndo(); h.theme = (e.target as HTMLSelectElement).value; };
    bind('p-par', v => { h.par = Math.max(1, Math.min(LIMITS.par, Math.round(v))); });
    bind('p-gravity', v => { const gr = Math.max(0.3, Math.min(2, v)); if (gr === 1) delete h.gravity; else h.gravity = gr; });
    $('p-dup').onclick = () => { if (holes.length >= LIMITS.holesPerCourse) return; holes.splice(cur + 1, 0, clone(h)); cur++; dirty = true; renderHoleTabs(); renderProps(); };
    $('p-left').onclick = () => { [holes[cur - 1], holes[cur]] = [holes[cur], holes[cur - 1]]; cur--; dirty = true; renderHoleTabs(); renderProps(); };
    $('p-right').onclick = () => { [holes[cur + 1], holes[cur]] = [holes[cur], holes[cur + 1]]; cur++; dirty = true; renderHoleTabs(); renderProps(); };
    $('p-del').onclick = () => { if (!confirm(`Delete hole ${cur + 1}?`)) return; holes.splice(cur, 1); cur = Math.max(0, cur - 1); dirty = true; undoStack = []; renderHoleTabs(); renderProps(); fitView(); };
    return;
  }
  let html = '';
  const delBtn = '<div class="row wrap" style="margin-top:8px"><button class="btn small" id="p-duplicate" title="A copy, offset a little (Ctrl+D)">Duplicate (Ctrl+D)</button><button class="btn small danger" id="p-delete">Delete (Del)</button></div>';
  if (s.kind === 'tee' || s.kind === 'cup') {
    const pt = s.kind === 'tee' ? h.tee : h.cup;
    html = `<h3>${s.kind.toUpperCase()}</h3><div class="grid2">${field('X', posIn('p-x', pt.x, 'x'))}${field('Y', posIn('p-y', pt.y, 'y'))}</div><div class="tiny">Or just drag it on the canvas.</div>`;
    el.innerHTML = html;
    bind('p-x', v => { pt.x = v; }); bind('p-y', v => { pt.y = v; });
    return;
  }
  if (s.kind === 'floor' || s.kind === 'zone') {
    const r: Rect | Zone = s.kind === 'floor' ? h.floor[s.i] : h.zones![s.i];
    const z = s.kind === 'zone' ? (r as Zone) : null;
    html = `<h3>${z ? z.kind.toUpperCase() : (r as Rect).z ? 'PLATFORM' : 'FLOOR'}</h3>
      <div class="grid2">${field('X', posIn('p-x', r.x, 'x'))}${field('Y', posIn('p-y', r.y, 'y'))}${field('W', sizeIn('p-w', r.w))}${field('H', sizeIn('p-h', r.h))}</div>`;
    if (!z) html += field('Height (0 = ground level; raised = a platform)', numIn('p-z', (r as Rect).z ?? 0, 0.25, 0, LIMITS.floorZ, [0, 8])) + `<div class="tiny">A platform's edges are cliff faces: a ball below bounces off them, a ball on top rolls off. Ramps climb onto it (a ramp of steepness ${'`'}power${'`'} rises ${'`'}rampRise${'`'}: match the height). Blocks, hazards and the cup on it sit at its level. Alt+wheel over the canvas raises it too.</div>`
      + field(`Wall height (${WALL_H} = standard · 0 = no walls)`, numIn('p-wall', (r as Rect).wall ?? WALL_H, 0.1, 0, LIMITS.wallH, [0, 3])) + '<div class="tiny">The rails along this piece\'s outer edges. A low rail is a low wall (a jumping ball clears it); 0 leaves the edge open — the ball rolls off the course and comes back to where it was struck once it stops.</div>';
    if (z) {
      const dirLabel = z.kind === 'slope' ? 'Downhill direction (° · 0 = right, 90 = down)' : z.kind === 'cannon' ? 'Barrel rests pointing (° · the player aims it)' : z.kind === 'gravity' ? 'Pulls toward (° · 0 = right, 90 = down)' : 'Direction (° · 0 = right, 90 = down)';
      if (DIRECTIONAL.includes(z.kind)) html += field(dirLabel, numIn('p-angle', z.angle ?? 0, 1, 0, 359)) + '<div class="tiny">Or drag the gold arrow tip on the canvas · Shift+wheel turns it.</div>';
      const power = z.power ?? ZONE_DEFAULT_POWER[z.kind];
      const pf = POWER_FIELDS[z.kind];
      if (pf) html += field(pf[0], numIn('p-power', power, pf[1], pf[2], pf[3]));
      if (z.kind === 'slope') html += `<div class="tiny">Ramp rises ${rampRise(z).toFixed(2)} u from its bottom edge to its top edge. The ball climbs it, drops off the top and bounces off the back and sides.</div>`;
      if (z.kind === 'cannon') html += field('Loft (launch vz)', numIn('p-lift', z.lift ?? CANNON_DEFAULT_LIFT, 0.5, 0, 30)) + '<div class="tiny">Roll in and the cannon loads the ball; the next shot is aimed and powered by the player and flies with this loft.</div>';
      if (z.kind === 'spinner') html += '<div class="tiny">The disc fills the smaller side of the rectangle.</div>';
      if (z.kind === 'fan') html += '<div class="tiny">Works on the ground and in the air: floats the ball ~2 u up and shoves it along.</div>';
      if (z.kind === 'trampoline') html += '<div class="tiny">Only a FALLING ball bounces — pair it with a ramp, jump pad or cannon.</div>';
      if (z.kind === 'gravity') html += `<div class="tiny">Sideways gravity: pulls the ball on the ground and in the air. Above ${FRICTION} (the felt's grip) nothing rests in it — the ball rolls until a wall holds it.</div>`;
      if (z.kind === 'tele') html += `<div class="grid2">${field('Exit X', posIn('p-tx', z.tx ?? 0, 'x'))}${field('Exit Y', posIn('p-ty', z.ty ?? 0, 'y'))}</div><div class="tiny">Drag the dashed ring to move the exit.</div>`;
      if (z.kind === 'tunnel') {
        const auto = z.level === undefined;
        html += field(`Passage floor height${auto ? ' (auto)' : ''}`, numIn('p-level', tunnelLevel(h, z), 0.25, 0, LIMITS.floorZ, [0, 8]))
          + (auto ? '' : '<button class="btn small" id="p-level-auto" title="Follow the lower green the tunnel touches">Auto</button>')
          + `<div class="tiny">Draw it across a platform from the green on one side to the green on the other. The platform keeps a ${TUNNEL_LID} thick roof over the passage and needs ${TUNNEL_MIN_CLEAR} of headroom under it (a lower platform is not bored). Left on auto the floor is the highest lower green the tunnel touches; a ball rolling over the top and one rolling through never meet. Alt+wheel raises the floor.</div>`;
      }
    }
    el.innerHTML = html + delBtn;
    bind('p-x', v => { r.x = v; }); bind('p-y', v => { r.y = v; }); bind('p-w', v => { r.w = Math.max(0.5, v); }); bind('p-h', v => { r.h = Math.max(0.5, v); });
    if (!z) { bind('p-z', v => { setFloorZ(r as Rect, v); }); bind('p-wall', v => { setFloorWall(r as Rect, v); }); }
    if (z) {
      bind('p-angle', v => { z.angle = norm360(Math.round(v)); });
      bind('p-power', v => { z.power = v; });
      bind('p-lift', v => { z.lift = v; });
      bind('p-tx', v => { z.tx = v; }); bind('p-ty', v => { z.ty = v; });
      bind('p-level', v => { z.level = Math.max(0, Math.min(LIMITS.floorZ, v)); });
      const autoBtn = document.getElementById('p-level-auto');
      if (autoBtn) autoBtn.onclick = () => { pushUndo(); delete z.level; renderProps(); };
    }
    $('p-delete').onclick = deleteSel; $('p-duplicate').onclick = duplicateSel;
    return;
  }
  if (s.kind === 'teleExit') {
    const z = h.zones![s.i];
    el.innerHTML = `<h3>TELEPORTER EXIT</h3><div class="grid2">${field('X', posIn('p-tx', z.tx ?? 0, 'x'))}${field('Y', posIn('p-ty', z.ty ?? 0, 'y'))}</div>`;
    bind('p-tx', v => { z.tx = v; }); bind('p-ty', v => { z.ty = v; });
    return;
  }
  if (s.kind === 'bumper') {
    const b = h.bumpers![s.i];
    el.innerHTML = `<h3>${b.kick > 0 ? 'BUMPER' : 'POST'}</h3><div class="grid2">${field('X', posIn('p-x', b.x, 'x'))}${field('Y', posIn('p-y', b.y, 'y'))}</div>${field('Radius', numIn('p-r', b.r, 0.1, 0.3, 6))}${field('Kick (0 = passive post)', numIn('p-kick', b.kick, 1, 0, 25))}<div class="tiny">Drag the grip on its rim to resize · Alt+wheel too.</div>${delBtn}`;
    bind('p-x', v => { b.x = v; }); bind('p-y', v => { b.y = v; }); bind('p-r', v => { b.r = Math.max(0.3, Math.min(6, v)); }); bind('p-kick', v => { b.kick = Math.max(0, v); });
    $('p-delete').onclick = deleteSel; $('p-duplicate').onclick = duplicateSel;
    return;
  }
  if (s.kind === 'block') {
    const b = h.blocks![s.i];
    const c = centroid(b.pts);
    const gen = b.gen;
    const mt = b.motion?.type;
    const title = mt === 'rotate' ? 'WINDMILL' : mt === 'slide' ? 'SLIDING BLOCK' : mt === 'swing' ? 'PENDULUM' : mt === 'blink' ? 'LASER GATE'
      : b.bounce && b.bounce > 1 ? 'RUBBER WALL' : b.h !== undefined && b.h < WALL_H ? 'LOW WALL' : gen?.kind === 'tri' ? 'TRIANGLE WALL' : 'WALL BLOCK';
    html = `<h3>${title}</h3>`;
    const pivot = pivotOf(b);
    if (pivot) html += `<div class="grid2">${field('Pivot X', posIn('p-cx', round2(pivot.cx), 'x'))}${field('Pivot Y', posIn('p-cy', round2(pivot.cy), 'y'))}</div>`;
    else html += `<div class="grid2">${field('Centre X', posIn('p-cx', round2(c.x), 'x'))}${field('Centre Y', posIn('p-cy', round2(c.y), 'y'))}</div>`;
    if (gen?.kind === 'rect') html += `<div class="grid2">${field('Width', sizeIn('p-w', gen.w, 0.2))}${field('Height', sizeIn('p-h', gen.h, 0.2))}</div>${field('Rotation °', numIn('p-rot', norm180(gen.rot), 5, -180, 180))}<div class="tiny">Drag the corner grips to resize, the gold knob to turn (Shift+wheel too) · Alt = no snap.</div>`;
    if (gen?.kind === 'tri') html += `<div class="grid2">${field('Leg along X', sizeIn('p-w', gen.w, 0.2))}${field('Leg along Y', sizeIn('p-h', gen.h, 0.2))}</div>${field('Rotation °', numIn('p-rot', norm180(gen.rot), 5, -180, 180))}<div class="tiny">A right triangle, turned about its right-angle corner. Equal legs make a 45° mirror that turns a shot a clean 90°. Drag the gold knob to turn it (Shift+wheel too).</div>`;
    if (gen?.kind === 'windmill') html += `<div class="grid2">${field('Blade length', numIn('p-len', gen.len, 0.5, 0.5, 60, [0.5, 20]))}${field('Blade width', numIn('p-wid', gen.width, 0.1, 0.2, 10, [0.2, 4]))}</div>${field('Blades', numIn('p-blades', gen.blades, 1, 2, 6))}<div class="tiny">Drag the grip at the blade tip to set the length.</div>`;
    if (gen?.kind === 'bar') html += `<div class="grid2">${field('Arm length', numIn('p-len', gen.len, 0.5, 0.5, 60, [0.5, 20]))}${field('Arm width', numIn('p-wid', gen.width, 0.1, 0.2, 10, [0.2, 4]))}</div><div class="tiny">Drag the grip at the arm tip to set the length.</div>`;
    if (b.motion?.type === 'rotate') html += field('Spin (rad/s, − reverses)', numIn('p-speed', b.motion.speed, 0.1, -6, 6));
    if (b.motion?.type === 'swing') html += `<div class="grid2">${field('Swing ± °', numIn('p-amp', b.motion.amp, 5, 5, 180))}${field('Period (s)', numIn('p-period', b.motion.period, 0.5, 0.5, 30, [0.5, 12]))}</div>${field('Phase (0–1)', numIn('p-phase', b.motion.phase ?? 0, 0.05, 0, 1))}<div class="tiny">The arm hangs down (+y) from its pivot and swings side to side.</div>`;
    if (b.motion?.type === 'slide') html += `<div class="grid2">${field('Travel X', numIn('p-dx', b.motion.dx, 0.5, -60, 60, [-20, 20]))}${field('Travel Y', numIn('p-dy', b.motion.dy, 0.5, -60, 60, [-20, 20]))}</div><div class="grid2">${field('Period (s)', numIn('p-period', b.motion.period, 0.5, 0.5, 30, [0.5, 12]))}${field('Phase (0–1)', numIn('p-phase', b.motion.phase ?? 0, 0.05, 0, 1))}</div><div class="tiny">The block slides between the two gold knobs — drag either to set its travel.</div>`;
    if (b.motion?.type === 'blink') html += `<div class="grid2">${field('Period (s)', numIn('p-period', b.motion.period, 0.5, 0.5, 30, [0.5, 12]))}${field('On for (0–1 of period)', numIn('p-duty', b.motion.duty, 0.05, 0.1, 0.9))}</div>${field('Phase (0–1)', numIn('p-phase', b.motion.phase ?? 0, 0.05, 0, 1))}<div class="tiny">Solid while lit. A ball caught inside when it lights up is reset.</div>`;
    html += field('Bounce (1 = wall · 2 = rubber · 0.5 = dead)', numIn('p-bounce', b.bounce ?? 1, 0.05, 0.2, 2.5));
    html += field(`Height (${WALL_H} = a standard wall; a ball higher than this flies over)`, numIn('p-hgt', b.h ?? WALL_H, 0.1, 0.1, 50, [0.1, 6]));
    el.innerHTML = html + delBtn;
    const ox = pivot ? pivot.cx : c.x, oy = pivot ? pivot.cy : c.y;
    bind('p-cx', v => { holes[cur] = moved(h, s, v - ox, 0); });
    bind('p-cy', v => { holes[cur] = moved(h, s, 0, v - oy); });
    if (gen?.kind === 'rect' || gen?.kind === 'tri') { bind('p-w', v => { gen.w = Math.max(0.2, v); regenBlock(b); }); bind('p-h', v => { gen.h = Math.max(0.2, v); regenBlock(b); }); bind('p-rot', v => { gen.rot = norm180(v); regenBlock(b); }); }
    if (gen?.kind === 'windmill') { bind('p-len', v => { gen.len = Math.max(0.5, v); regenBlock(b); }); bind('p-wid', v => { gen.width = Math.max(0.2, v); regenBlock(b); }); bind('p-blades', v => { gen.blades = Math.max(2, Math.min(6, Math.round(v))); regenBlock(b); }); }
    if (gen?.kind === 'bar') { bind('p-len', v => { gen.len = Math.max(0.5, v); regenBlock(b); }); bind('p-wid', v => { gen.width = Math.max(0.2, v); regenBlock(b); }); }
    if (b.motion?.type === 'rotate') bind('p-speed', v => { (b.motion as any).speed = v; });
    if (b.motion?.type === 'swing') { bind('p-amp', v => { (b.motion as any).amp = v; }); bind('p-period', v => { (b.motion as any).period = Math.max(0.5, v); }); bind('p-phase', v => { (b.motion as any).phase = v; }); }
    if (b.motion?.type === 'slide') { bind('p-dx', v => { (b.motion as any).dx = v; }); bind('p-dy', v => { (b.motion as any).dy = v; }); bind('p-period', v => { (b.motion as any).period = Math.max(0.5, v); }); bind('p-phase', v => { (b.motion as any).phase = v; }); }
    if (b.motion?.type === 'blink') { bind('p-period', v => { (b.motion as any).period = Math.max(0.5, v); }); bind('p-duty', v => { (b.motion as any).duty = Math.max(0.1, Math.min(0.9, v)); }); bind('p-phase', v => { (b.motion as any).phase = v; }); }
    bind('p-bounce', v => { if (v === 1) delete b.bounce; else b.bounce = Math.max(0.2, Math.min(2.5, v)); });
    bind('p-hgt', v => { setBlockHeight(b, v); });
    $('p-delete').onclick = deleteSel; $('p-duplicate').onclick = duplicateSel;
  }
}
const round2 = (v: number) => Math.round(v * 100) / 100;
/** A right triangle: the right angle at (cx, cy), legs w along +x and h along +y, the pair turned by rotDeg. */
function triPts(cx: number, cy: number, w: number, h: number, rotDeg: number): number[] {
  const a = (rotDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [round2(cx), round2(cy), round2(cx + w * c), round2(cy + w * s), round2(cx - h * s), round2(cy + h * c)];
}
function rotRect(cx: number, cy: number, w: number, h: number, rotDeg: number): number[] {
  const a = (rotDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const out: number[] = [];
  for (const [px, py] of [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]) {
    out.push(round2(cx + px * c - py * s), round2(cy + px * s + py * c));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Save / publish
// ---------------------------------------------------------------------------
function validateAll(): Hole[] | null {
  const out: Hole[] = [];
  for (let i = 0; i < holes.length; i++) {
    try { out.push(cleanHole(holes[i])); }
    catch (e) { cur = i; renderHoleTabs(); renderProps(); fitView(); toast(`Hole ${i + 1}: ${(e as Error).message}`, true); return null; }
  }
  return out;
}
function save() {
  if (!opts) return;
  courseName = ($('ed-title') as HTMLInputElement).value.trim();
  if (!courseName) { toast('Give the course a name first', true); $('ed-title').focus(); return; }
  const clean = validateAll();
  if (!clean) return;
  opts.onSave(courseId, courseName, JSON.stringify(clean));
  dirty = false;
  toast(courseId === 0n ? 'Course created (draft)' : 'Course saved');
  if (courseId === 0n) {
    // learn the id the server gave us so publish / later saves target it
    let tries = 0;
    const poll = () => {
      const found = opts!.findSaved(courseName);
      if (found) { courseId = found.id; published = found.published; updatePublishBtn(); }
      else if (tries++ < 20) setTimeout(poll, 150);
    };
    setTimeout(poll, 150);
  }
  updatePublishBtn();
}
function togglePublish() {
  if (!opts) return;
  if (courseId === 0n) { toast('Save the course first', true); return; }
  if (dirty) { toast('Save your changes first', true); return; }
  published = !published;
  opts.onPublish(courseId, published);
  toast(published ? 'Published! It is now listed under Community.' : 'Unpublished — back to a private draft.');
  updatePublishBtn();
}
function updatePublishBtn() {
  $('ed-publish').textContent = published ? 'Unpublish' : 'Publish';
  $('ed-publish').classList.toggle('gold', !published);
}

// ---------------------------------------------------------------------------
// Test play: the editor steps aside and the hole is played on the game's
// 3D stage — same renderer, same camera, same drag-to-putt, and the exact
// physics the server runs. Local only; nothing is sent anywhere.
// ---------------------------------------------------------------------------
const TEST_ID = 'editor-test';
function startTest() {
  const h = hole();
  try { cleanHole(h); } catch (e) { toast(`Fix first: ${(e as Error).message}`, true); return; }
  testing = true;
  testGen++;
  invalidateGeom(h);
  placeTestBall(h.tee.x, h.tee.y);
  testSafe = { x: h.tee.x, y: h.tee.y };
  testStrokes = 0; testT = 0; testAcc = 0; testStruck = false;
  testAim.active = false;
  testFacing = Math.atan2(h.cup.y - h.tee.y, h.cup.x - h.tee.x);
  testAim.angle = testAim.shown = testFacing;
  testCam = 'play';
  sel = null;
  $('ed-test').textContent = '■ Stop test';
  $('editor').classList.add('testing');
  document.body.classList.add('ed-testing');
  $('ed-test-bar').classList.remove('hidden');
  toast('TEST · press and pull back to putt · C camera · R back to the tee · U redo the last shot · Esc back to the editor');
}
function stopTest() {
  if (!testing) return;
  testing = false;
  testAim.active = false;
  $('ed-test').textContent = '▶ Test';
  $('editor').classList.remove('testing');
  document.body.classList.remove('ed-testing');
  $('ed-test-bar').classList.add('hidden');
  resetScene();
  renderProps();
}
function placeTestBall(x: number, y: number) {
  testBall = { x, y, z: groundZ(geomOf(hole()), x, y), vx: 0, vy: 0, vz: 0, teleTicks: 0 };
}
const testResting = () => restingOn(geomOf(hole()), testBall);
function resetTestBall() {
  const h = hole();
  placeTestBall(h.tee.x, h.tee.y);
  testSafe = { x: h.tee.x, y: h.tee.y };
  testStrokes = 0; testStruck = false; testAim.active = false;
  testAim.angle = testAim.shown = Math.atan2(h.cup.y - h.tee.y, h.cup.x - h.tee.x);
}
function toggleTestCam() {
  testCam = testCam === 'play' ? 'overview' : 'play';
  $('ed-test-cam').textContent = testCam === 'play' ? 'Camera' : 'Camera: overview';
}
/** Test play is on the game stage (main.ts's free look serves it too). */
export const editorTesting = () => open && testing;
/** A primary press on the stage would start a putt right now. */
export const editorTestAimable = () => open && testing && testResting();
/** A second finger turned the pull into a look — no shot. */
export function editorCancelTestAim() { testAim.active = false; }
function testDown(e: PointerEvent) {
  if (e.button === 2 && testAim.active) { testAim.active = false; return; } // right button: never mind
  if (!open || !testing || e.button !== 0 || testAim.active || !testResting()) return;
  gameCanvas().setPointerCapture(e.pointerId);
  testAim = { active: true, angle: testAim.angle, shown: testAim.angle, power: 0, x0: e.clientX, y0: e.clientY, basis: cameraGroundBasis() };
}
function testMove(e: PointerEvent) {
  if (!testAim.active) return;
  if (e.buttons & 2) { testAim.active = false; return; } // right button mid-pull: cancel
  const r = dragAim(e.clientX - testAim.x0, e.clientY - testAim.y0, testAim.basis, canvasCssSize().h, testAim.angle);
  testAim.angle = r.angle;
  testAim.power = r.power;
}
function testUp(e: PointerEvent) {
  if (!testAim.active) return;
  testMove(e);
  testAim.active = false;
  if (testAim.power < 0.04 || !testResting()) return;
  const v = shotFrom(geomOf(hole()), testBall.x, testBall.y, testAim.angle, testAim.power);
  testSafe = { x: testBall.x, y: testBall.y };
  testBall.vx = v.vx; testBall.vy = v.vy; testBall.vz = v.vz; if (v.vz > 0) testBall.z += 0.01; testStruck = true;
  testStrokes++;
  testShotSeq++;
  testShotPower = testAim.power;
  sfx.putt(testAim.power);
  burstAt(testBall.x, testBall.y, 0, 0xffffff, 6, 6);
}
function testStep(dt: number) {
  testAcc += dt;
  const geom = geomOf(hole());
  let guard = 0;
  while (testAcc >= DT && guard++ < 8) {
    testAcc -= DT;
    testT += DT;
    const ev = newEvents();
    const ox = testBall.x, oy = testBall.y;
    stepBall(testBall, geom, testT, ev);
    if (ev.wall > 2.5) { sfx.wall(ev.wall); burstAt(testBall.x, testBall.y, 0, 0xfff8a0, 6 + Math.min(12, ev.wall / 3), 8 + ev.wall / 3); if (ev.wall > 20) addShake(0.3); }
    if (ev.bumper) { sfx.bumper(); burstAt(testBall.x, testBall.y, 0, 0xff8a8a, 18, 16); addShake(0.5); }
    if (ev.jump) { sfx.jump(); burstAt(testBall.x, testBall.y, 0, 0xffd60a, 10, 10); }
    if (ev.land) { sfx.land(); burstAt(testBall.x, testBall.y, 0, 0xc9c9c9, 8, 7); }
    if (ev.tele) { sfx.tele(); burstAt(testBall.x, testBall.y, 0, 0xc77dff, 24, 14); burstAt(ox, oy, 0, 0xc77dff, 14, 10); }
    if (ev.boost) sfx.boost();
    if (ev.holed) {
      const h = hole();
      sfx.holed(testStrokes, h.par);
      burstAt(testBall.x, testBall.y, 0, 0xffd400, 30, 22, -30);
      addShake(0.6);
      toast(`IN! ${testStrokes} stroke${testStrokes === 1 ? '' : 's'} (par ${h.par})`);
      placeTestBall(h.tee.x, h.tee.y);
      testSafe = { x: h.tee.x, y: h.tee.y };
      testStrokes = 0; testStruck = false;
    } else if (ev.water || ev.oob) {
      if (ev.water) { sfx.water(); burstAt(ox, oy, 0, 0x7fc8ff, 24, 14, -30); if (testStruck) testStrokes++; toast('Splash! +1'); }
      else { sfx.reset(); toast(pointInFloor(testBall.x, testBall.y, hole()) ? 'Squeezed into a wall — reset' : 'Off the map — reset'); }
      placeTestBall(testSafe.x, testSafe.y);
      testStruck = false;
    }
    if (testResting()) testStruck = false;
  }
}
/** Draw the test on the 3D stage (the editor's own canvas is hidden). */
function drawTest(dt: number) {
  const h = hole();
  testStep(dt);
  if (testAim.active) testAim.shown = smoothAngle(testAim.shown, testAim.angle, dt);
  const resting = testResting();
  const speed = Math.hypot(testBall.vx, testBall.vy);
  if (testAim.active) testFacing = testAim.shown;
  else if (speed > 1.5) testFacing = Math.atan2(testBall.vy, testBall.vx);
  else if (resting) testFacing = Math.atan2(h.cup.y - testBall.y, h.cup.x - testBall.x);
  // dead-reckon the leftover sub-tick so a 30 Hz step reads smooth at any frame rate
  const lead = resting ? 0 : testAcc;
  drawScene({
    hole: h, holeKey: `edit:${testGen}`, t: testT + testAcc,
    players: [{
      id: TEST_ID, name: opts?.myName ?? 'TEST', characterId: opts?.myCharacter ?? 0, color: opts?.myColor ?? 0xffd60a,
      x: testBall.x + testBall.vx * lead, y: testBall.y + testBall.vy * lead, z: Math.max(0, testBall.z + testBall.vz * lead),
      vx: testBall.vx, vy: testBall.vy, resting, holed: false, ghost: false, me: true, facing: testFacing,
      seat: 0, shotSeq: testShotSeq, shotPower: testShotPower,
    }],
    aim: testAim.active ? { angle: testAim.shown, power: testAim.power, lockCam: true } : null,
    cam: testCam, meId: TEST_ID,
  });
  $('ed-test-info').textContent = `TEST · HOLE ${cur + 1} · ${h.name.toUpperCase()} · STROKES ${testStrokes} · PAR ${h.par}`;
  $('ed-test-hint').textContent = resting ? (testAim.active ? `POWER ${Math.round(testAim.power * 100)}%` : 'PRESS AND PULL BACK · RELEASE TO PUTT · RIGHT-DRAG LOOK · WHEEL ZOOM') : 'ROLLING… · DRAG TO LOOK AROUND';
}

// ---------------------------------------------------------------------------
// Swing preview: a ghost golfer. Place a ball, set an angle and a power, and
// the editor plays the shot with the shared physics (the exact code the
// server runs) and draws every tick of it — bounces, flights, the cup or the
// water — so a corner or a bumper can be nudged until the line is right.
// The path is recomputed whenever the hole or the swing changes and is
// drawn under every tool, so moving a block with Select updates it live.
// ---------------------------------------------------------------------------
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const wrapDeg = (d: number) => ((d % 360) + 360) % 360;
const round1 = (v: number) => Math.round(v * 10) / 10;

function placeSwing(x: number, y: number) {
  const h = hole();
  const prev = swing && swing.holeIdx === cur ? swing : null;
  swing = {
    holeIdx: cur, x, y,
    angleDeg: prev ? prev.angleDeg : round1(wrapDeg((Math.atan2(h.cup.y - y, h.cup.x - x) * 180) / Math.PI)),
    power: prev ? prev.power : 0.5, t0: prev ? prev.t0 : 0,
  };
  swingPlay = 0;
}
function clearSwing() { swing = null; swingPath = null; if (tool === 'swing') renderProps(); }
/** Drag from the ball: the arrow points at the pointer and its length (as drawAim draws it) is the power. */
function aimSwing(w: { x: number; y: number }) {
  if (!swing) return;
  const dx = w.x - swing.x, dy = w.y - swing.y;
  const dist = Math.hypot(dx, dy);
  if (dist < BALL_R) return;
  swing.angleDeg = round1(wrapDeg((Math.atan2(dy, dx) * 180) / Math.PI));
  swing.power = Math.round(clamp01((dist - SWING_ARROW_MIN) / SWING_ARROW_SPAN) * 200) / 200;
  syncSwingPanel();
}

/** Simulate the swing; the key says which hole + swing this path belongs to. */
function simulateSwing(h: Hole, s: SwingSetup, key: string): SwingPath {
  const g = geomOf(h);
  const angle = (s.angleDeg * Math.PI) / 180;
  const v = shotFrom(g, s.x, s.y, angle, s.power);
  const z0 = groundZ(g, s.x, s.y);
  const b: BallState = { x: s.x, y: s.y, z: v.vz > 0 ? z0 + 0.01 : z0, vx: v.vx, vy: v.vy, vz: v.vz, teleTicks: 0 };
  const pts: SwingPt[] = [{ x: b.x, y: b.y, lift: 0, air: false, tele: false }];
  const marks: SwingMark[] = [];
  let end: SwingPath['end'] = 'timeout';
  let ticks = SWING_MAX_TICKS, travel = 0, maxSpeed = Math.hypot(b.vx, b.vy);
  for (let tick = 1; tick <= SWING_MAX_TICKS; tick++) {
    const ev = newEvents();
    const px = b.x, py = b.y;
    stepBall(b, g, s.t0 + tick * DT, ev);
    const ground = groundZ(g, b.x, b.y, b.z);
    if (!ev.tele) travel += Math.hypot(b.x - px, b.y - py);
    maxSpeed = Math.max(maxSpeed, Math.hypot(b.vx, b.vy));
    if (ev.wall > 2.5) marks.push({ x: b.x, y: b.y, kind: 'wall', v: ev.wall });
    if (ev.bumper) marks.push({ x: b.x, y: b.y, kind: 'bumper', v: 0 });
    if (ev.jump) marks.push({ x: b.x, y: b.y, kind: 'jump', v: 0 });
    if (ev.land) marks.push({ x: b.x, y: b.y, kind: 'land', v: 0 });
    if (ev.tele) { marks.push({ x: px, y: py, kind: 'tele', v: 0 }); marks.push({ x: b.x, y: b.y, kind: 'tele', v: 1 }); }
    pts.push({ x: b.x, y: b.y, lift: Math.max(0, b.z - ground), air: b.z > ground + 0.02, tele: ev.tele });
    if (ev.holed) { end = 'holed'; ticks = tick; break; }
    if (ev.water) { end = 'water'; ticks = tick; break; }
    if (ev.oob) { end = 'oob'; ticks = tick; break; }
    if (restingOn(g, b)) { end = 'rest'; ticks = tick; break; }
  }
  const secs = ticks * DT;
  const toCup = Math.hypot(b.x - h.cup.x, b.y - h.cup.y);
  const bounces = marks.filter(m => m.kind === 'wall').length;
  const bumps = marks.filter(m => m.kind === 'bumper').length;
  const bits = [`${round1(travel)} u travelled`, `top speed ${round1(maxSpeed)} u/s`];
  if (bounces) bits.push(`${bounces} wall bounce${bounces === 1 ? '' : 's'}`);
  if (bumps) bits.push(`${bumps} bumper${bumps === 1 ? '' : 's'}`);
  const headline =
    end === 'holed' ? `IN THE CUP after ${round1(secs)} s` :
    end === 'rest' ? `Stops at (${round1(b.x)}, ${round1(b.y)}) after ${round1(secs)} s · ${round1(toCup)} u from the cup` :
    end === 'water' ? `SPLASH at ${round1(secs)} s · +1, back to the ball` :
    end === 'oob' ? `${pointInFloor(b.x, b.y, h) ? 'Squeezed into a wall' : 'Off the map'} at ${round1(secs)} s · reset` :
    'Still rolling at 15 s · the server stops it there';
  return { key, pts, marks, end, secs, travel, maxSpeed, toCup, summary: `${headline}\n${bits.join(' · ')}` };
}

/** Recompute the path when the hole or the swing changed; advance the playhead. */
function updateSwing(h: Hole, dt: number) {
  if (!swing) { swingPath = null; return; }
  const key = `${JSON.stringify(h)}|${swing.x},${swing.y},${swing.angleDeg},${swing.power},${swing.t0}`;
  if (!swingPath || swingPath.key !== key) {
    swingPath = simulateSwing(h, swing, key);
    const out = document.getElementById('p-sw-result');
    if (out) out.textContent = swingPath.summary;
  }
  const loop = swingPath.secs + SWING_HOLD;
  swingPlay = (swingPlay + dt) % loop;
}

function drawSwing(g: CanvasRenderingContext2D, h: Hole) {
  const s = swing, path = swingPath;
  if (!s || !path) return;
  const sc = cam.scale;
  const color = '#' + (opts?.myColor ?? 0xffd60a).toString(16).padStart(6, '0');
  const ptAt = (p: SwingPt) => w2s(cam, W, H, p.x, p.y);
  // the path: a dark bed, then gold on the felt and cyan dashes in the air
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const pass of [0, 1]) {
    let air = path.pts[0].air;
    const begin = () => { g.beginPath(); g.strokeStyle = pass === 0 ? 'rgba(0,0,0,0.55)' : air ? '#5bd1ff' : '#ffd60a'; g.lineWidth = Math.max(pass === 0 ? 4 : 2, (pass === 0 ? 0.22 : 0.12) * sc); g.setLineDash(pass === 1 && air ? [0.35 * sc, 0.35 * sc] : []); };
    begin();
    let q = ptAt(path.pts[0]);
    g.moveTo(q.x, q.y);
    for (let i = 1; i < path.pts.length; i++) {
      const p = path.pts[i];
      if (p.tele) { g.stroke(); begin(); q = ptAt(p); g.moveTo(q.x, q.y); continue; }
      if (p.air !== air) { g.stroke(); air = p.air; begin(); g.moveTo(q.x, q.y); }
      q = ptAt(p);
      g.lineTo(q.x, q.y);
    }
    g.stroke();
  }
  g.setLineDash([]);
  // half-second pips along the line
  g.fillStyle = 'rgba(255,255,255,0.8)';
  for (let i = 15; i < path.pts.length; i += 15) { const q = ptAt(path.pts[i]); g.beginPath(); g.arc(q.x, q.y, Math.max(1.5, 0.07 * sc), 0, Math.PI * 2); g.fill(); }
  // events
  const MARK: Record<SwingMark['kind'], string> = { wall: '#fff8a0', bumper: '#ff8a8a', jump: '#ffd60a', land: '#c9c9c9', tele: '#c77dff' };
  g.lineWidth = Math.max(1.5, 0.08 * sc);
  for (const m of path.marks) {
    const q = w2s(cam, W, H, m.x, m.y);
    const r = (m.kind === 'wall' ? 0.3 + Math.min(0.5, m.v / 40) : m.kind === 'bumper' ? 0.6 : 0.35) * sc;
    g.strokeStyle = MARK[m.kind];
    g.beginPath(); g.arc(q.x, q.y, r, 0, Math.PI * 2); g.stroke();
    if (m.kind === 'jump' || m.kind === 'land') { g.beginPath(); g.moveTo(q.x - r, q.y); g.lineTo(q.x + r, q.y); g.moveTo(q.x, q.y - r); g.lineTo(q.x, q.y + r); g.stroke(); }
  }
  // where it ends
  const last = path.pts[path.pts.length - 1];
  const e = ptAt(last);
  const endColor = path.end === 'holed' ? '#ffd400' : path.end === 'rest' ? '#a4ff3d' : path.end === 'timeout' ? '#ff9f43' : '#ff4b4b';
  g.strokeStyle = endColor; g.lineWidth = Math.max(2, 0.12 * sc); g.setLineDash([0.3 * sc, 0.25 * sc]);
  g.beginPath(); g.arc(e.x, e.y, 0.9 * sc, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
  if (path.end === 'water' || path.end === 'oob') {
    const r = 0.5 * sc;
    g.beginPath(); g.moveTo(e.x - r, e.y - r); g.lineTo(e.x + r, e.y + r); g.moveTo(e.x + r, e.y - r); g.lineTo(e.x - r, e.y + r); g.stroke();
  }
  const tag = path.end === 'holed' ? 'IN!' : path.end === 'rest' ? `${round1(path.toCup)} u to cup` : path.end === 'water' ? 'SPLASH' : path.end === 'oob' ? 'RESET' : 'STILL ROLLING';
  g.font = `700 ${Math.max(10, Math.min(15, sc * 0.5))}px Chakra Petch, sans-serif`;
  g.textAlign = 'center';
  const tw = g.measureText(tag).width;
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fillRect(e.x - tw / 2 - 4, e.y - 1.0 * sc - 18, tw + 8, 14);
  g.fillStyle = endColor;
  g.fillText(tag, e.x, e.y - 1.0 * sc - 7);
  // the ghost ball, its aim, and the playhead running the line
  drawBall(g, cam, W, H, s.x, s.y, 0, color, { ghost: true, label: 'SWING' });
  drawAim(g, cam, W, H, s.x, s.y, (s.angleDeg * Math.PI) / 180, s.power, color);
  const f = swingPlay / DT;
  const i = Math.min(path.pts.length - 1, Math.floor(f));
  const a = path.pts[i], bpt = path.pts[Math.min(path.pts.length - 1, i + 1)];
  const k = bpt.tele ? 0 : f - i;
  drawBall(g, cam, W, H, a.x + (bpt.x - a.x) * k, a.y + (bpt.y - a.y) * k, a.lift + (bpt.lift - a.lift) * k, color, { me: true });
  g.restore();
  void h;
}

function renderSwingProps(el: HTMLElement) {
  const h = hole();
  const s = swing && swing.holeIdx === cur ? swing : null;
  const movers = !!geomOf(h).movers.length;
  let html = `<h3>SWING PREVIEW</h3>
    <div class="tiny">Click the map to drop a ghost ball. Drag from it to aim: the arrow points the shot and its length is the power. Shift-drag (or drag the ball) moves it. ←/→ turn 1° (Shift 0.1°) · ↑/↓ power 2% (Shift 0.5%).</div>`;
  if (!s) { el.innerHTML = html + `<div class="row wrap" style="margin-top:8px"><button class="btn small" id="p-sw-tee">Ball on the tee</button></div>`; $('p-sw-tee').onclick = () => { placeSwing(h.tee.x, h.tee.y); renderProps(); }; return; }
  const bb = holeBounds(h);
  html += `<div class="grid2">${field('Ball X', numIn('p-sw-x', s.x, 0.5, -LIMITS.coord, LIMITS.coord, [Math.floor(bb.minX - 16), Math.ceil(bb.maxX + 16)]))}${field('Ball Y', numIn('p-sw-y', s.y, 0.5, -LIMITS.coord, LIMITS.coord, [Math.floor(bb.minY - 16), Math.ceil(bb.maxY + 16)]))}</div>
    ${field('Angle (° · 0 = right, 90 = down)', numIn('p-sw-angle', s.angleDeg, 0.1, 0, 359.9))}
    ${field('Power (%)', numIn('p-sw-power', round1(s.power * 100), 0.5, 0, 100) + `<div class="tiny" id="p-sw-speed">${round1(powerToSpeed(s.power))} u/s off the club</div>`)}`;
  if (movers) html += field('Swing at (s after the hole starts)', numIn('p-sw-t0', s.t0, 0.1, 0, 120)) + '<div class="tiny">This hole has moving parts: the windmill / pendulum / slider / laser is drawn where it is at the playhead, so scrub this to time the shot.</div>';
  html += `<div class="row wrap" style="margin-top:8px">
      <button class="btn small" id="p-sw-cup">Aim at cup</button>
      <button class="btn small" id="p-sw-tee">Ball on the tee</button>
      <button class="btn small" id="p-sw-next" title="Move the ball to where this shot stops">Next shot from there</button>
      <button class="btn small danger" id="p-sw-clear">Clear (Del)</button>
    </div>
    <h3>Result</h3>
    <div class="tiny" id="p-sw-result" style="white-space:pre-line">${swingPath ? esc(swingPath.summary) : '…'}</div>
    <div class="tiny" style="margin-top:6px">Gold = rolling · cyan dashes = in the air · pips every ½ s · rings mark wall hits (bigger = harder), bumpers, jumps and landings. The path updates live while you move things with any tool.</div>`;
  el.innerHTML = html;
  // the swing is not part of the hole, so these never touch undo or the dirty
  // flag — they drive both halves of the slider+box control live
  const num = (id: string, fn: (v: number) => void) => {
    const box = $(id) as HTMLInputElement | null, range = document.getElementById(`${id}-r`) as HTMLInputElement | null;
    const apply = (raw: string, from: HTMLInputElement) => { const v = Number(raw); if (Number.isFinite(v)) { fn(v); syncSwingPanel(from); } };
    if (box) { box.oninput = () => apply(box.value, box); box.onchange = () => apply(box.value, box); }
    if (range) { range.oninput = () => apply(range.value, range); range.onchange = () => apply(range.value, range); }
  };
  num('p-sw-x', v => { s.x = v; });
  num('p-sw-y', v => { s.y = v; });
  num('p-sw-angle', v => { s.angleDeg = round1(wrapDeg(v)); });
  num('p-sw-power', v => { s.power = clamp01(v / 100); });
  if (movers) num('p-sw-t0', v => { s.t0 = Math.max(0, v); swingPlay = 0; });
  $('p-sw-cup').onclick = () => { s.angleDeg = round1(wrapDeg((Math.atan2(h.cup.y - s.y, h.cup.x - s.x) * 180) / Math.PI)); renderProps(); };
  $('p-sw-tee').onclick = () => { s.x = h.tee.x; s.y = h.tee.y; renderProps(); };
  $('p-sw-next').onclick = () => {
    if (!swingPath || swingPath.end !== 'rest') { toast(swingPath?.end === 'holed' ? 'That one is in the cup already' : 'The ball does not come to rest on this shot', true); return; }
    const last = swingPath.pts[swingPath.pts.length - 1];
    s.x = round2(last.x); s.y = round2(last.y);
    s.angleDeg = round1(wrapDeg((Math.atan2(h.cup.y - s.y, h.cup.x - s.x) * 180) / Math.PI));
    if (movers) s.t0 = round1(s.t0 + swingPath.secs + 1);
    renderProps();
  };
  $('p-sw-clear').onclick = clearSwing;
}
/** Push the swing's numbers into the panel without rebuilding it (mid-drag, arrow keys). */
function syncSwingPanel(from?: HTMLInputElement) {
  const s = swing;
  if (!s || tool !== 'swing') return;
  // both halves of each control (slider `id-r` + value box `id`) — skipping only
  // the one the value came from, so typing in a box is not clobbered but the box
  // still follows when its slider moves
  const set = (id: string, v: number) => {
    for (const el of [document.getElementById(id), document.getElementById(`${id}-r`)]) {
      if (el && el !== from) (el as HTMLInputElement).value = String(v);
    }
  };
  set('p-sw-x', s.x); set('p-sw-y', s.y);
  set('p-sw-angle', s.angleDeg);
  set('p-sw-power', round1(s.power * 100));
  const sp = document.getElementById('p-sw-speed');
  if (sp) sp.textContent = `${round1(powerToSpeed(s.power))} u/s off the club`;
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------
let lastT = performance.now();
let animT = 0;
function frame(now: number) {
  raf = requestAnimationFrame(frame);
  if (!open) return;
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  animT += dt;
  if (testing) { drawTest(dt); return; }
  if (W !== canvas().clientWidth || H !== canvas().clientHeight) resize();
  if (!Number.isFinite(cam.scale) || cam.scale <= 0.01 || !Number.isFinite(cam.x) || !Number.isFinite(cam.y)) fitView();
  if (W === 0 || H === 0) return;
  const g = canvas().getContext('2d')!;
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  const h = hole();
  // the hole object is edited in place, so its derived geometry must not be
  // cached across frames while editing (test mode keeps it stable)
  invalidateGeom(h);
  const theme = THEMES[h.theme ?? 'park'] ?? THEMES.park;
  const selObj = selectedObject();
  // a swing preview owns the clock: movers are drawn where they are at the
  // playhead, so a windmill reads true against the ball running its path
  if (swing && swing.holeIdx !== cur) clearSwing();
  updateSwing(h, dt);
  drawHole(g, h, cam, W, H, { t: swing ? swing.t0 + swingPlay : animT, theme, editor: true, selected: selObj });

  // editor overlays
  drawSwing(g, h);
  drawSelection(g, h);
  if (drag?.mode === 'create') {
    const x = Math.min(drag.x0, drag.x1), y = Math.min(drag.y0, drag.y1);
    const p = w2s(cam, W, H, x, y);
    const def = TOOL_DEFS.find(t => t.id === tool)!;
    g.fillStyle = def.color; g.globalAlpha = 0.4;
    g.fillRect(p.x, p.y, Math.abs(drag.x1 - drag.x0) * cam.scale, Math.abs(drag.y1 - drag.y0) * cam.scale);
    g.globalAlpha = 1; g.strokeStyle = '#fff'; g.setLineDash([4, 4]);
    g.strokeRect(p.x, p.y, Math.abs(drag.x1 - drag.x0) * cam.scale, Math.abs(drag.y1 - drag.y0) * cam.scale);
    g.setLineDash([]);
  }
  if (now - outlineAt > 250) { outlineAt = now; renderOutline(); }
  const b = holeBounds(h);
  const tdef = TOOL_DEFS.find(t => t.id === tool)!;
  $('ed-status').textContent = `${tdef.label.toUpperCase()} — ${tdef.hint} · (${snapV(hoverWorld.x)}, ${snapV(hoverWorld.y)}) · hole ${round2(b.w)}×${round2(b.h)}${dirty ? ' · UNSAVED' : ''}`;
}

function selectedObject(): unknown {
  const h = hole();
  if (!sel) return undefined;
  if (sel.kind === 'block') return h.blocks?.[sel.i];
  if (sel.kind === 'zone' || sel.kind === 'teleExit') return h.zones?.[sel.i];
  return undefined;
}

function drawSelection(g: CanvasRenderingContext2D, h: Hole) {
  if (!sel) return;
  const P = (x: number, y: number) => w2s(cam, W, H, x, y);
  g.strokeStyle = '#a4ff3d'; g.lineWidth = 2; g.setLineDash([6, 4]);
  const ring = (x: number, y: number, r: number) => { const p = P(x, y); g.beginPath(); g.arc(p.x, p.y, r * cam.scale, 0, Math.PI * 2); g.stroke(); };
  const line = (x0: number, y0: number, x1: number, y1: number) => { const a = P(x0, y0), b = P(x1, y1); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); };
  switch (sel.kind) {
    case 'tee': ring(h.tee.x, h.tee.y, 1.2); break;
    case 'cup': ring(h.cup.x, h.cup.y, 1.1); break;
    case 'bumper': { const b: Bumper = h.bumpers![sel.i]; ring(b.x, b.y, b.r + 0.3); break; }
    case 'floor': { const r = h.floor[sel.i]; const p = P(r.x, r.y); g.strokeRect(p.x, p.y, r.w * cam.scale, r.h * cam.scale); break; }
    case 'zone': {
      const z = h.zones![sel.i]; const p = P(z.x, z.y); g.strokeRect(p.x, p.y, z.w * cam.scale, z.h * cam.scale);
      if (DIRECTIONAL.includes(z.kind)) {
        // the aim arrow, centre → grip
        const t = arrowTip(z); const c = P(z.x + z.w / 2, z.y + z.h / 2), q = P(t.x, t.y);
        g.setLineDash([]); g.strokeStyle = '#ffd60a'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(q.x, q.y); g.stroke();
        const a = Math.atan2(q.y - c.y, q.x - c.x);
        g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x - 10 * Math.cos(a - 0.5), q.y - 10 * Math.sin(a - 0.5)); g.lineTo(q.x - 10 * Math.cos(a + 0.5), q.y - 10 * Math.sin(a + 0.5)); g.closePath(); g.fillStyle = '#ffd60a'; g.fill();
      }
      break;
    }
    case 'teleExit': { const z = h.zones![sel.i]; ring(z.tx!, z.ty!, 1.0); break; }
    case 'block': {
      const b = h.blocks![sel.i];
      const pv = pivotOf(b);
      if (pv) ring(pv.cx, pv.cy, (b.gen?.kind === 'windmill' || b.gen?.kind === 'bar' ? b.gen.len : 4) + 0.3);
      if (b.gen?.kind === 'rect') {
        // stalk from the top edge to the rotation knob
        const c = centroid(b.pts); const a = rad(b.gen.rot); const vx = -Math.sin(a), vy = Math.cos(a);
        const reach = Math.max(1, 18 / cam.scale);
        g.setLineDash([]); g.strokeStyle = '#ffd60a'; g.lineWidth = 1.5;
        line(c.x - vx * b.gen.h / 2, c.y - vy * b.gen.h / 2, c.x - vx * (b.gen.h / 2 + reach), c.y - vy * (b.gen.h / 2 + reach));
      }
      if (b.motion?.type === 'slide') {
        // the two ends of the travel and ghosts of the block there
        const c = centroid(b.pts); const m = b.motion;
        g.setLineDash([4, 4]); g.strokeStyle = '#ffd60a'; g.lineWidth = 1.5;
        line(c.x - m.dx, c.y - m.dy, c.x + m.dx, c.y + m.dy);
        g.globalAlpha = 0.35;
        for (const k of [1, -1]) {
          g.beginPath();
          for (let i = 0; i < b.pts.length; i += 2) { const p = P(b.pts[i] + m.dx * k, b.pts[i + 1] + m.dy * k); if (i === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y); }
          g.closePath(); g.stroke();
        }
        g.globalAlpha = 1;
      }
      break;
    }
  }
  g.setLineDash([]);
  // the grips: green squares resize, gold knobs turn / aim / stretch
  for (const gp of gripsOf(h, sel)) {
    const p = P(gp.x, gp.y);
    if (gp.shape === 'square') {
      g.fillStyle = '#a4ff3d'; g.strokeStyle = '#0b1a10'; g.lineWidth = 1.5;
      g.fillRect(p.x - 4.5, p.y - 4.5, 9, 9); g.strokeRect(p.x - 4.5, p.y - 4.5, 9, 9);
    } else {
      g.beginPath(); g.arc(p.x, p.y, 6.5, 0, Math.PI * 2);
      g.fillStyle = '#ffd60a'; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
    }
  }
}
