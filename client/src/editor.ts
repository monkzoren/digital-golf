// The course editor: draw floors, obstacles and hazards on a grid, tweak
// them in a properties panel, test-play the hole with the SAME physics the
// server runs, then save/publish. Everything here is local until Save.
import {
  type Block, type Bumper, type Hole, type Rect, type Zone, type ZoneKind,
  holeBounds, pointInPoly, pointInRect, rectPts, windmillPts,
} from '@shared/courses';
import { cleanHole, LIMITS, THEME_NAMES } from '@shared/mapformat';
import { type BallState, BALL_R, DT, geomOf, invalidateGeom, isResting, newEvents, shotVelocity, stepBall } from '@shared/physics';
import { type Camera, drawAim, drawBall, drawHole, fitCamera, s2w, THEMES, w2s } from './render';
import { sfx } from './audio';

export interface EditorOpts {
  courseId: bigint;
  name: string;
  holes: Hole[];
  published: boolean;
  myName: string;
  onSave(courseId: bigint, name: string, holesJson: string): void;
  onPublish(courseId: bigint, published: boolean): void;
  onExit(): void;
  findSaved(name: string): { id: bigint; published: boolean } | null;
}

type Tool =
  | 'select' | 'pan' | 'floor' | 'block' | 'lowblock' | 'windmill' | 'slider'
  | 'bumper' | 'post' | 'tee' | 'cup' | ZoneKind;

type Sel =
  | { kind: 'floor'; i: number } | { kind: 'block'; i: number } | { kind: 'zone'; i: number }
  | { kind: 'bumper'; i: number } | { kind: 'tee' } | { kind: 'cup' } | { kind: 'teleExit'; i: number } | null;

const TOOL_DEFS: { id: Tool; label: string; color: string; group: string; hint: string }[] = [
  { id: 'select', label: 'Select / move', color: '#fff', group: 'Tools', hint: 'Click to select · drag to move · Del removes · arrows nudge' },
  { id: 'pan', label: 'Pan', color: '#9fc2a8', group: 'Tools', hint: 'Drag to pan · wheel zooms (or hold Space with any tool)' },
  { id: 'floor', label: 'Floor', color: '#3fae4f', group: 'Layout', hint: 'Drag a rectangle of green. Touching floors join up.' },
  { id: 'tee', label: 'Tee', color: '#ffffff', group: 'Layout', hint: 'Click where the ball starts' },
  { id: 'cup', label: 'Cup', color: '#0b1a10', group: 'Layout', hint: 'Click where the hole is' },
  { id: 'block', label: 'Wall block', color: '#c9a36b', group: 'Obstacles', hint: 'Drag a solid block' },
  { id: 'lowblock', label: 'Low wall (jumpable)', color: '#e0c391', group: 'Obstacles', hint: 'Drag a low wall a jumping ball clears' },
  { id: 'windmill', label: 'Windmill', color: '#c9a36b', group: 'Obstacles', hint: 'Click to place a spinning windmill' },
  { id: 'slider', label: 'Sliding block', color: '#c9a36b', group: 'Obstacles', hint: 'Drag a block that slides back and forth' },
  { id: 'bumper', label: 'Bumper', color: '#ff4b4b', group: 'Obstacles', hint: 'Click to place a pinball bumper' },
  { id: 'post', label: 'Post', color: '#8d99b5', group: 'Obstacles', hint: 'Click to place a round post' },
  { id: 'sand', label: 'Sand', color: '#e9d18c', group: 'Surfaces', hint: 'Drag a sand trap (slow)' },
  { id: 'ice', label: 'Ice', color: '#cfeeff', group: 'Surfaces', hint: 'Drag an ice patch (slippery)' },
  { id: 'water', label: 'Water', color: '#2f8fd8', group: 'Surfaces', hint: 'Drag a water hazard (+1 stroke, ball resets)' },
  { id: 'slope', label: 'Slope', color: '#6b6b6b', group: 'Surfaces', hint: 'Drag a slope; set its direction in the panel' },
  { id: 'boost', label: 'Boost pad', color: '#ff8a3d', group: 'Surfaces', hint: 'Drag a booster; set its direction in the panel' },
  { id: 'jump', label: 'Jump pad', color: '#ffd60a', group: 'Surfaces', hint: 'Drag a jump pad (needs speed to trigger)' },
  { id: 'tele', label: 'Teleporter', color: '#c77dff', group: 'Surfaces', hint: 'Drag a gate, then move its exit ring' },
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
  | { mode: 'resize'; sel: Sel; corner: number; orig: Hole }
  | { mode: 'pan'; sx: number; sy: number; cx: number; cy: number }
  | null;
let drag: Drag = null;

// test mode
let testing = false;
let testBall: BallState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, teleTicks: 0 };
let testStrokes = 0;
let testT = 0;
let testAcc = 0;
let testDrag: { active: boolean; angle: number; power: number } = { active: false, angle: 0, power: 0 };
let testSafe = { x: 0, y: 0 };
let testStruck = false;

const canvas = () => $('ed-canvas') as HTMLCanvasElement;
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
    const before = s2w(cam, W, H, e.offsetX, e.offsetY);
    cam.scale = Math.max(4, Math.min(80, cam.scale * (e.deltaY < 0 ? 1.12 : 0.89)));
    const after = s2w(cam, W, H, e.offsetX, e.offsetY);
    cam.x += before.x - after.x; cam.y += before.y - after.y;
  }, { passive: false });
  c.addEventListener('contextmenu', e => e.preventDefault());
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
  sel = null; renderProps();
}
function redo() {
  const s = redoStack.pop();
  if (!s) return;
  undoStack.push(JSON.stringify(hole()));
  holes[cur] = JSON.parse(s);
  sel = null; renderProps();
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
  if (!open) return;
  canvas().setPointerCapture(e.pointerId);
  const w = worldAt(e);
  if (testing) { testDown(w); return; }
  if (e.button === 1 || e.button === 2 || tool === 'pan' || spaceHeld) {
    drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y };
    return;
  }
  const h = hole();
  const sx = snapV(w.x), sy = snapV(w.y);
  switch (tool) {
    case 'select': {
      // resize handle on the selected rect?
      if (sel && (sel.kind === 'floor' || sel.kind === 'zone')) {
        const r = sel.kind === 'floor' ? h.floor[sel.i] : h.zones![sel.i];
        const corner = cornerAt(r, w);
        if (corner >= 0) { drag = { mode: 'resize', sel, corner, orig: clone(h) }; pushUndo(); return; }
      }
      const hit = pick(w);
      sel = hit;
      renderProps();
      if (hit) { drag = { mode: 'move', sel: hit, start: w, orig: clone(h) }; pushUndo(); }
      return;
    }
    case 'tee': pushUndo(); h.tee = { x: sx, y: sy }; sel = { kind: 'tee' }; renderProps(); return;
    case 'cup': pushUndo(); h.cup = { x: sx, y: sy }; sel = { kind: 'cup' }; renderProps(); return;
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
    default:
      drag = { mode: 'create', x0: sx, y0: sy, x1: sx, y1: sy };
  }
}

function onMove(e: PointerEvent) {
  if (!open) return;
  const w = worldAt(e);
  hoverWorld = w;
  if (testing) { if (testDrag.active) testAim(w); return; }
  if (!drag) return;
  const h = hole();
  if (drag.mode === 'pan') {
    cam.x = drag.cx - (e.clientX - drag.sx) / cam.scale;
    cam.y = drag.cy - (e.clientY - drag.sy) / cam.scale;
  } else if (drag.mode === 'create') {
    drag.x1 = snapV(w.x); drag.y1 = snapV(w.y);
  } else if (drag.mode === 'move') {
    const dx = snapV(w.x - drag.start.x), dy = snapV(w.y - drag.start.y);
    holes[cur] = moved(drag.orig, drag.sel, dx, dy);
  } else if (drag.mode === 'resize') {
    const o = drag.orig;
    const s = drag.sel as { kind: 'floor' | 'zone'; i: number };
    const r0 = s.kind === 'floor' ? o.floor[s.i] : o.zones![s.i];
    const nx = snapV(w.x), ny = snapV(w.y);
    let x0 = r0.x, y0 = r0.y, x1 = r0.x + r0.w, y1 = r0.y + r0.h;
    if (drag.corner === 0 || drag.corner === 3) x0 = nx; else x1 = nx;
    if (drag.corner === 0 || drag.corner === 1) y0 = ny; else y1 = ny;
    const nr = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.max(0.5, Math.abs(x1 - x0)), h: Math.max(0.5, Math.abs(y1 - y0)) };
    const target = s.kind === 'floor' ? h.floor[s.i] : h.zones![s.i];
    Object.assign(target, nr);
  }
}

function onUp(e: PointerEvent) {
  if (!open) return;
  if (testing) { if (testDrag.active) testFire(); return; }
  if (!drag) return;
  const d = drag;
  drag = null;
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
    case 'block': case 'lowblock': case 'slider': {
      h.blocks ??= [];
      if (h.blocks.length >= LIMITS.blocks) { toast('Too many blocks', true); return; }
      const b: Block = { pts: rectPts({ x, y, w, h: hh }), gen: { kind: 'rect', w, h: hh, rot: 0 } };
      if (tool === 'lowblock') b.h = 0.5;
      if (tool === 'slider') b.motion = { type: 'slide', dx: 0, dy: 4, period: 3 };
      h.blocks.push(b); sel = { kind: 'block', i: h.blocks.length - 1 }; break;
    }
    default: {
      h.zones ??= [];
      if (h.zones.length >= LIMITS.zones) { toast('Too many zones', true); return; }
      const z: Zone = { kind: tool as ZoneKind, x, y, w, h: hh };
      if (z.kind === 'slope') { z.angle = 90; z.power = 3.5; }
      if (z.kind === 'boost') { z.angle = 0; z.power = 40; }
      if (z.kind === 'jump') z.power = 11;
      if (z.kind === 'tele') { z.tx = x + w + 3; z.ty = y + hh / 2; }
      h.zones.push(z); sel = { kind: 'zone', i: h.zones.length - 1 };
    }
  }
  tool = 'select';
  buildTools();
  renderProps();
  void e;
}

function cornerAt(r: Rect, w: { x: number; y: number }): number {
  const cs = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
  const tol = 8 / cam.scale;
  for (let i = 0; i < 4; i++) if (Math.hypot(cs[i][0] - w.x, cs[i][1] - w.y) < tol) return i;
  return -1;
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
    if (b.motion?.type === 'rotate') { const g = b.gen; const len = g && g.kind === 'windmill' ? g.len : 4; if (Math.hypot(b.motion.cx - w.x, b.motion.cy - w.y) < len) return { kind: 'block', i }; }
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
      if (b.motion?.type === 'rotate') { b.motion.cx += dx; b.motion.cy += dy; }
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
  if (testing) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { deleteSel(); return; }
  if (e.key === 'g') { snap = snap === 0.5 ? 1 : snap === 1 ? 0.25 : 0.5; toast(`Grid snap ${snap}`); return; }
  if (e.key === 't') { startTest(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && sel) { e.preventDefault(); duplicateSel(); return; }
  const nudge: Record<string, [number, number]> = { ArrowLeft: [-snap, 0], ArrowRight: [snap, 0], ArrowUp: [0, -snap], ArrowDown: [0, snap] };
  if (nudge[e.key] && sel) { e.preventDefault(); pushUndo(); holes[cur] = moved(hole(), sel, nudge[e.key][0], nudge[e.key][1]); renderProps(); return; }
  const t = TOOL_DEFS.find(d => d.label[0].toLowerCase() === e.key.toLowerCase() && !e.ctrlKey && !e.metaKey);
  if (e.key === 'v') { tool = 'select'; buildTools(); return; }
  if (t && ['floor', 'block', 'bumper', 'sand', 'ice', 'water', 'jump'].includes(t.id)) { tool = t.id; sel = null; buildTools(); renderProps(); }
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
// Properties panel
// ---------------------------------------------------------------------------
function field(label: string, input: string) { return `<div class="field"><label>${label}</label>${input}</div>`; }
function numIn(id: string, v: number, step = 0.5, min?: number, max?: number) {
  return `<input type="number" id="${id}" value="${v}" step="${step}"${min !== undefined ? ` min="${min}"` : ''}${max !== undefined ? ` max="${max}"` : ''} />`;
}
function bind(id: string, fn: (v: number) => void) {
  const el = $(id) as HTMLInputElement | null;
  if (!el) return;
  el.onchange = () => { const v = Number(el.value); if (Number.isFinite(v)) { pushUndo(); fn(v); renderProps(); } };
}
function renderProps() {
  const el = $('ed-props');
  const h = hole();
  const s = sel;
  if (!s) {
    el.innerHTML = `<h3>Hole ${cur + 1} of ${holes.length}</h3>
      ${field('Name', `<input type="text" id="p-name" value="${esc(h.name)}" maxlength="${LIMITS.holeNameLen}" />`)}
      ${field('Par', numIn('p-par', h.par, 1, 1, LIMITS.par))}
      ${field('Tip (intro card)', `<input type="text" id="p-tip" value="${esc(h.tip ?? '')}" maxlength="${LIMITS.tipLen}" />`)}
      ${field('Theme', `<select id="p-theme">${THEME_NAMES.map(t => `<option value="${t}"${(h.theme ?? 'park') === t ? ' selected' : ''}>${t.toUpperCase()}</option>`).join('')}</select>`)}
      <div class="row wrap" style="margin-top:8px">
        <button class="btn small" id="p-dup">Duplicate hole</button>
        <button class="btn small" id="p-left" ${cur === 0 ? 'disabled' : ''}>◀ Move</button>
        <button class="btn small" id="p-right" ${cur === holes.length - 1 ? 'disabled' : ''}>Move ▶</button>
        <button class="btn small danger" id="p-del" ${holes.length <= 1 ? 'disabled' : ''}>Delete hole</button>
      </div>
      <h3>Stats</h3>
      <div class="tiny">${h.floor.length} floors · ${h.blocks?.length ?? 0} blocks · ${h.zones?.length ?? 0} zones · ${h.bumpers?.length ?? 0} bumpers</div>
      <h3>Shortcuts</h3>
      <div class="tiny">V select · F floor · B block · S sand · I ice · W water · J jump<br>T test · G grid snap (${snap}) · Ctrl+Z undo · Ctrl+D duplicate · Del delete<br>Wheel zoom · Space/right-drag pan</div>`;
    ($('p-name') as HTMLInputElement).onchange = e => { pushUndo(); h.name = (e.target as HTMLInputElement).value.slice(0, LIMITS.holeNameLen) || 'Untitled'; };
    ($('p-tip') as HTMLInputElement).onchange = e => { pushUndo(); h.tip = (e.target as HTMLInputElement).value.slice(0, LIMITS.tipLen); };
    ($('p-theme') as HTMLSelectElement).onchange = e => { pushUndo(); h.theme = (e.target as HTMLSelectElement).value; };
    bind('p-par', v => { h.par = Math.max(1, Math.min(LIMITS.par, Math.round(v))); });
    $('p-dup').onclick = () => { if (holes.length >= LIMITS.holesPerCourse) return; holes.splice(cur + 1, 0, clone(h)); cur++; dirty = true; renderHoleTabs(); renderProps(); };
    $('p-left').onclick = () => { [holes[cur - 1], holes[cur]] = [holes[cur], holes[cur - 1]]; cur--; dirty = true; renderHoleTabs(); renderProps(); };
    $('p-right').onclick = () => { [holes[cur + 1], holes[cur]] = [holes[cur], holes[cur + 1]]; cur++; dirty = true; renderHoleTabs(); renderProps(); };
    $('p-del').onclick = () => { if (!confirm(`Delete hole ${cur + 1}?`)) return; holes.splice(cur, 1); cur = Math.max(0, cur - 1); dirty = true; undoStack = []; renderHoleTabs(); renderProps(); fitView(); };
    return;
  }
  let html = '';
  const delBtn = '<button class="btn small danger" id="p-delete" style="margin-top:8px">Delete (Del)</button>';
  if (s.kind === 'tee' || s.kind === 'cup') {
    const pt = s.kind === 'tee' ? h.tee : h.cup;
    html = `<h3>${s.kind.toUpperCase()}</h3>${field('X', numIn('p-x', pt.x))}${field('Y', numIn('p-y', pt.y))}`;
    el.innerHTML = html;
    bind('p-x', v => { pt.x = v; }); bind('p-y', v => { pt.y = v; });
    return;
  }
  if (s.kind === 'floor' || s.kind === 'zone') {
    const r: Rect | Zone = s.kind === 'floor' ? h.floor[s.i] : h.zones![s.i];
    const z = s.kind === 'zone' ? (r as Zone) : null;
    html = `<h3>${z ? z.kind.toUpperCase() : 'FLOOR'}</h3>
      <div class="grid2">${field('X', numIn('p-x', r.x))}${field('Y', numIn('p-y', r.y))}${field('W', numIn('p-w', r.w, 0.5, 0.5))}${field('H', numIn('p-h', r.h, 0.5, 0.5))}</div>`;
    if (z && (z.kind === 'slope' || z.kind === 'boost')) html += field('Direction (° · 0 = right, 90 = down)', `<input type="range" id="p-angle" min="0" max="359" step="1" value="${z.angle ?? 0}" /><div class="tiny" id="p-angle-v">${z.angle ?? 0}°</div>`) + field(z.kind === 'slope' ? 'Strength (u/s²)' : 'Boost (u/s²)', numIn('p-power', z.power ?? (z.kind === 'slope' ? 3.5 : 40), 0.5, 0, 80));
    if (z && z.kind === 'jump') html += field('Launch (vz)', numIn('p-power', z.power ?? 11, 0.5, 2, 30));
    if (z && z.kind === 'tele') html += `<div class="grid2">${field('Exit X', numIn('p-tx', z.tx ?? 0))}${field('Exit Y', numIn('p-ty', z.ty ?? 0))}</div><div class="tiny">Drag the dashed ring to move the exit.</div>`;
    el.innerHTML = html + delBtn;
    bind('p-x', v => { r.x = v; }); bind('p-y', v => { r.y = v; }); bind('p-w', v => { r.w = Math.max(0.5, v); }); bind('p-h', v => { r.h = Math.max(0.5, v); });
    if (z) {
      const ang = $('p-angle') as HTMLInputElement | null;
      if (ang) ang.oninput = () => { z.angle = Number(ang.value); $('p-angle-v').textContent = `${z.angle}°`; dirty = true; };
      bind('p-power', v => { z.power = v; });
      bind('p-tx', v => { z.tx = v; }); bind('p-ty', v => { z.ty = v; });
    }
    $('p-delete').onclick = deleteSel;
    return;
  }
  if (s.kind === 'teleExit') {
    const z = h.zones![s.i];
    el.innerHTML = `<h3>TELEPORTER EXIT</h3><div class="grid2">${field('X', numIn('p-tx', z.tx ?? 0))}${field('Y', numIn('p-ty', z.ty ?? 0))}</div>`;
    bind('p-tx', v => { z.tx = v; }); bind('p-ty', v => { z.ty = v; });
    return;
  }
  if (s.kind === 'bumper') {
    const b = h.bumpers![s.i];
    el.innerHTML = `<h3>${b.kick > 0 ? 'BUMPER' : 'POST'}</h3><div class="grid2">${field('X', numIn('p-x', b.x))}${field('Y', numIn('p-y', b.y))}</div>${field('Radius', numIn('p-r', b.r, 0.1, 0.3, 6))}${field('Kick (0 = passive post)', numIn('p-kick', b.kick, 1, 0, 25))}${delBtn}`;
    bind('p-x', v => { b.x = v; }); bind('p-y', v => { b.y = v; }); bind('p-r', v => { b.r = v; }); bind('p-kick', v => { b.kick = v; });
    $('p-delete').onclick = deleteSel;
    return;
  }
  if (s.kind === 'block') {
    const b = h.blocks![s.i];
    const c = centroid(b.pts);
    const gen = b.gen;
    html = `<h3>${b.motion?.type === 'rotate' ? 'WINDMILL' : b.motion?.type === 'slide' ? 'SLIDING BLOCK' : b.h !== undefined ? 'LOW WALL' : 'WALL BLOCK'}</h3>`;
    html += `<div class="grid2">${field('Centre X', numIn('p-cx', round2(c.x)))}${field('Centre Y', numIn('p-cy', round2(c.y)))}</div>`;
    if (gen?.kind === 'rect') html += `<div class="grid2">${field('Width', numIn('p-w', gen.w, 0.5, 0.2))}${field('Height', numIn('p-h', gen.h, 0.5, 0.2))}</div>${field('Rotation °', numIn('p-rot', gen.rot, 5))}`;
    if (gen?.kind === 'windmill') html += `<div class="grid2">${field('Blade length', numIn('p-len', gen.len, 0.5, 0.5, 60))}${field('Blade width', numIn('p-wid', gen.width, 0.1, 0.2, 10))}</div>${field('Blades', numIn('p-blades', gen.blades, 1, 2, 6))}`;
    if (b.motion?.type === 'rotate') html += field('Spin (rad/s, − reverses)', numIn('p-speed', b.motion.speed, 0.1, -6, 6));
    if (b.motion?.type === 'slide') html += `<div class="grid2">${field('Travel X', numIn('p-dx', b.motion.dx, 0.5, -60, 60))}${field('Travel Y', numIn('p-dy', b.motion.dy, 0.5, -60, 60))}</div><div class="grid2">${field('Period (s)', numIn('p-period', b.motion.period, 0.5, 0.5, 30))}${field('Phase (0–1)', numIn('p-phase', b.motion.phase ?? 0, 0.25, 0, 1))}</div>`;
    html += field('Height (blank = solid, ≤ 1 = jumpable)', numIn('p-hgt', b.h ?? 0, 0.5, 0, 50));
    el.innerHTML = html + delBtn;
    const regen = () => {
      if (gen?.kind === 'rect') {
        const cc = centroid(b.pts);
        b.pts = rotRect(cc.x, cc.y, gen.w, gen.h, gen.rot);
      } else if (gen?.kind === 'windmill' && b.motion?.type === 'rotate') {
        b.pts = windmillPts(b.motion.cx, b.motion.cy, gen.len, gen.width, gen.blades);
        b.hub = Math.max(0.5, gen.width * 0.9);
      }
    };
    bind('p-cx', v => { holes[cur] = moved(h, s, v - c.x, 0); });
    bind('p-cy', v => { holes[cur] = moved(h, s, 0, v - c.y); });
    if (gen?.kind === 'rect') { bind('p-w', v => { gen.w = v; regen(); }); bind('p-h', v => { gen.h = v; regen(); }); bind('p-rot', v => { gen.rot = v; regen(); }); }
    if (gen?.kind === 'windmill') { bind('p-len', v => { gen.len = v; regen(); }); bind('p-wid', v => { gen.width = v; regen(); }); bind('p-blades', v => { gen.blades = Math.round(v); regen(); }); }
    if (b.motion?.type === 'rotate') bind('p-speed', v => { (b.motion as any).speed = v; });
    if (b.motion?.type === 'slide') { bind('p-dx', v => { (b.motion as any).dx = v; }); bind('p-dy', v => { (b.motion as any).dy = v; }); bind('p-period', v => { (b.motion as any).period = Math.max(0.5, v); }); bind('p-phase', v => { (b.motion as any).phase = v; }); }
    bind('p-hgt', v => { if (v <= 0) delete b.h; else b.h = v; });
    $('p-delete').onclick = deleteSel;
  }
}
const round2 = (v: number) => Math.round(v * 100) / 100;
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
// Test play (local physics — identical code to the server's)
// ---------------------------------------------------------------------------
function startTest() {
  const h = hole();
  try { cleanHole(h); } catch (e) { toast(`Fix first: ${(e as Error).message}`, true); return; }
  testing = true;
  invalidateGeom(h);
  testBall = { x: h.tee.x, y: h.tee.y, z: 0, vx: 0, vy: 0, vz: 0, teleTicks: 0 };
  testSafe = { x: h.tee.x, y: h.tee.y };
  testStrokes = 0; testT = 0; testAcc = 0; testStruck = false;
  $('ed-test').textContent = '■ Stop test';
  sel = null;
  toast('TEST: drag back from the ball to putt · Esc to stop');
}
function stopTest() {
  testing = false;
  testDrag.active = false;
  $('ed-test').textContent = '▶ Test';
  renderProps();
}
function testDown(w: { x: number; y: number }) {
  if (!isResting(testBall)) return;
  testDrag = { active: true, angle: 0, power: 0 };
  testAim(w);
}
function testAim(w: { x: number; y: number }) {
  const dx = testBall.x - w.x, dy = testBall.y - w.y;
  testDrag.angle = Math.atan2(dy, dx);
  testDrag.power = Math.min(1, Math.max(0, (Math.hypot(dx, dy) - 0.4) / 7));
}
function testFire() {
  testDrag.active = false;
  if (testDrag.power < 0.04 || !isResting(testBall)) return;
  const v = shotVelocity(testDrag.angle, testDrag.power);
  testSafe = { x: testBall.x, y: testBall.y };
  testBall.vx = v.vx; testBall.vy = v.vy; testStruck = true;
  testStrokes++;
  sfx.putt(testDrag.power);
}
function testStep(dt: number) {
  testAcc += dt;
  const geom = geomOf(hole());
  let guard = 0;
  while (testAcc >= DT && guard++ < 8) {
    testAcc -= DT;
    testT += DT;
    const ev = newEvents();
    stepBall(testBall, geom, testT, ev);
    if (ev.wall > 2.5) sfx.wall(ev.wall);
    if (ev.bumper) sfx.bumper();
    if (ev.jump) sfx.jump();
    if (ev.tele) sfx.tele();
    if (ev.holed) {
      sfx.holed(testStrokes, hole().par);
      toast(`IN! ${testStrokes} stroke${testStrokes === 1 ? '' : 's'} (par ${hole().par})`);
      const h = hole();
      testBall = { x: h.tee.x, y: h.tee.y, z: 0, vx: 0, vy: 0, vz: 0, teleTicks: 0 };
      testStrokes = 0; testStruck = false;
    } else if (ev.water || ev.oob) {
      if (ev.water) { sfx.water(); if (testStruck) testStrokes++; toast(ev.water ? 'Splash! +1' : 'Off the map — reset'); }
      testBall = { x: testSafe.x, y: testSafe.y, z: 0, vx: 0, vy: 0, vz: 0, teleTicks: 0 };
      testStruck = false;
    }
    if (isResting(testBall)) testStruck = false;
  }
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
  if (W !== canvas().clientWidth || H !== canvas().clientHeight) resize();
  if (!Number.isFinite(cam.scale) || cam.scale <= 0.01 || !Number.isFinite(cam.x) || !Number.isFinite(cam.y)) fitView();
  if (W === 0 || H === 0) return;
  const g = canvas().getContext('2d')!;
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  const h = hole();
  // the hole object is edited in place, so its derived geometry must not be
  // cached across frames while editing (test mode keeps it stable)
  if (!testing) invalidateGeom(h);
  if (testing) testStep(dt);
  const theme = THEMES[h.theme ?? 'park'] ?? THEMES.park;
  const selObj = selectedObject();
  drawHole(g, h, cam, W, H, { t: testing ? testT : animT, theme, editor: !testing, selected: selObj });

  if (testing) {
    drawBall(g, cam, W, H, testBall.x, testBall.y, testBall.z, '#ffd60a', { me: true });
    if (testDrag.active) drawAim(g, cam, W, H, testBall.x, testBall.y, testDrag.angle, testDrag.power, '#fff');
    $('ed-status').textContent = `TEST · strokes ${testStrokes} · par ${h.par}`;
    return;
  }
  // editor overlays
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
  g.strokeStyle = '#a4ff3d'; g.lineWidth = 2; g.setLineDash([6, 4]);
  const ring = (x: number, y: number, r: number) => { const p = w2s(cam, W, H, x, y); g.beginPath(); g.arc(p.x, p.y, r * cam.scale, 0, Math.PI * 2); g.stroke(); };
  const handles = (r: Rect) => {
    const p = w2s(cam, W, H, r.x, r.y);
    g.strokeRect(p.x, p.y, r.w * cam.scale, r.h * cam.scale);
    g.setLineDash([]);
    g.fillStyle = '#a4ff3d';
    for (const [x, y] of [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]]) { const q = w2s(cam, W, H, x, y); g.fillRect(q.x - 4, q.y - 4, 8, 8); }
  };
  switch (sel.kind) {
    case 'tee': ring(h.tee.x, h.tee.y, 1.2); break;
    case 'cup': ring(h.cup.x, h.cup.y, 1.1); break;
    case 'bumper': { const b: Bumper = h.bumpers![sel.i]; ring(b.x, b.y, b.r + 0.3); break; }
    case 'floor': handles(h.floor[sel.i]); break;
    case 'zone': handles(h.zones![sel.i]); break;
    case 'teleExit': { const z = h.zones![sel.i]; ring(z.tx!, z.ty!, 1.0); break; }
    case 'block': {
      const b = h.blocks![sel.i];
      if (b.motion?.type === 'rotate') ring(b.motion.cx, b.motion.cy, (b.gen?.kind === 'windmill' ? b.gen.len : 4) + 0.3);
      break;
    }
  }
  g.setLineDash([]);
  void BALL_R;
}
