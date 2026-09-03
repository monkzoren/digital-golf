// Digital Golf client — connection, screens, the room, the 3D game view and
// HUD. Built on the Digital Tennis client: same screen flow (menu → player
// select → course select → lobby → play), same broadcast skin, same three.js
// lawn + character rigs (render3d.ts). The course editor is editor.ts.
import { DbConnection } from './module_bindings';
import type { Player, Lobby, Course, Hole as HoleRow, Chat } from './module_bindings/types';
import type { Identity } from 'spacetimedb';
import type { Hole } from '@shared/courses';
import { parseHole } from '@shared/mapformat';
import { type BallState, DT, TICK_HZ, geomOf, newEvents, shotFrom, stepBall } from '@shared/physics';
import {
  COLORS, DATABASE_NAME, EMOTES, EV, L_FINISHED, L_OPEN, L_RUNNING, MAX_PLAYERS, POWER_MULS,
  PH_FINAL, PH_INTRO, PH_PLAY, PH_RESULTS, SPACETIMEDB_URI,
} from './config';
import {
  type AimBasis, type GolfPlayer, type GolfScene, addShake, ballScreenPos, burstAt, cameraGroundBasis, headScreenPos,
  canvasCssSize, drawScene, initCharacterPreviews, initRenderer, resetScene,
} from './render3d';
import { KB_TURN_RATE, KB_TURN_RATE_FINE, dragAim, smoothAngle } from './aim';
import { CHARACTERS, type Character } from './characters';
import { type GraphicsSettings, type PresetName, applyPreset, getGraphics, onGraphicsChange, presetOf, setGraphics } from './graphics';
import { isMuted, setMuted, sfx, unlockAudio } from './audio';
import { openEditor, closeEditor, editorIsOpen, editorTesting, editorTestAimable, editorCancelTestAim } from './editor';
import { bindFreeLook } from './freelook';
import { drawHole, fitCamera, themeFor } from './render';

declare const __BUILD_ID__: string;

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
function notify(msg: string, error = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (error ? ' error' : '');
  el.textContent = msg;
  $('toasts').appendChild(el);
  if (error) sfx.error();
  setTimeout(() => el.remove(), 3200);
}
function staggerChildren(container: HTMLElement) {
  let i = 0;
  for (const el of container.children) (el as HTMLElement).style.setProperty('--i', String(i++));
}
$('build-chip').textContent = `DIGITAL GOLF · ${__BUILD_ID__.slice(0, 10)}`;

// ---------------------------------------------------------------------------
// Screens: the tennis broadcast wipe between overlays
// ---------------------------------------------------------------------------
type OverlayName = 'connecting' | 'menu' | 'select-player' | 'select-course' | 'waiting' | 'gameover';
const OVERLAYS: OverlayName[] = ['connecting', 'menu', 'select-player', 'select-course', 'waiting', 'gameover'];
let overlayTarget: OverlayName | null | undefined = undefined;
let appliedOverlay: OverlayName | null | undefined = undefined;
const wipeEl = $('wipe');
const wipeBar1 = wipeEl.querySelector('.b1') as HTMLElement;
let wipeRunning = false;
let wipeWatchdog = 0;
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function applyOverlay(name: OverlayName | null) {
  appliedOverlay = name;
  for (const o of OVERLAYS) $(o).classList.toggle('hidden', o !== name);
  const inGame = name === null;
  $('hud').classList.toggle('hidden', !inGame);
  if (inGame) { $('hud').classList.add('enter'); window.setTimeout(() => $('hud').classList.remove('enter'), 800); }
  $('help').classList.toggle('hidden', !inGame);
  $('emote-bar').classList.toggle('hidden', !inGame);
  $('chat-feed').classList.toggle('hidden', !inGame);
  if (!inGame) { $('chat-input').classList.remove('open'); $('hole-intro').classList.add('hidden'); $('results-card').classList.add('hidden'); $('match-menu').classList.add('hidden'); $('scores-modal').classList.add('hidden'); }
  if (name === 'menu') renderMenu();
  if (name === 'waiting') renderRoom();
  if (name === 'select-player') refreshCharSelection();
  if (name === 'select-course') renderCourseGrid();
  if (name === 'gameover') renderGameOver();
}
function runWipe() {
  if (wipeRunning) return;
  wipeRunning = true;
  wipeEl.classList.remove('out');
  wipeEl.classList.add('run', 'in');
  clearTimeout(wipeWatchdog);
  wipeWatchdog = window.setTimeout(finishWipe, 2000);
}
function finishWipe() {
  clearTimeout(wipeWatchdog);
  wipeEl.classList.remove('run', 'in', 'out');
  wipeRunning = false;
  if (overlayTarget !== appliedOverlay) applyOverlay(overlayTarget ?? null);
}
wipeBar1.addEventListener('animationend', () => {
  if (wipeEl.classList.contains('in')) {
    applyOverlay(overlayTarget ?? null);
    wipeEl.classList.remove('in');
    wipeEl.classList.add('out');
  } else if (wipeEl.classList.contains('out')) finishWipe();
});
function showOverlay(name: OverlayName | null) {
  if (name === overlayTarget) return;
  const firstShow = overlayTarget === undefined;
  overlayTarget = name;
  if (firstShow || reducedMotion || document.hidden) { applyOverlay(name); return; }
  runWipe();
}
function modal(id: string, open: boolean) { $(id).classList.toggle('hidden', !open); }

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------
let conn: DbConnection;
let myIdentity: Identity | null = null;
let subscribed = false;
let connectGen = 0;
let reconnectTimer: number | null = null;

function scheduleReconnect() {
  if (reconnectTimer !== null) return;
  reconnectTimer = window.setTimeout(() => { reconnectTimer = null; connect(); }, 2000);
}
function connect() {
  const gen = ++connectGen;
  const token = store.get('dg_token') ?? undefined;
  // a fresh connection has no subscriptions: forget the dead handles, or
  // subscribeCourse would think the holes are still on their way and the
  // next hole would say LOADING for the rest of the round
  holeSubs.clear();
  gameHoleObj = null; gameHoleKey = '';
  courseDetailSig = '';
  conn = DbConnection.builder()
    .withUri(SPACETIMEDB_URI)
    .withDatabaseName(DATABASE_NAME)
    .withToken(token)
    .onDisconnect(() => {
      if (gen !== connectGen) return;
      subscribed = false;
      $('connecting-sub').textContent = 'CONNECTION LOST — RECONNECTING…';
      showOverlay('connecting');
      scheduleReconnect();
    })
    .onConnect((_c, identity, tok) => {
      if (gen !== connectGen) return;
      console.log('[dg] connected as', identity.toHexString());
      myIdentity = identity;
      store.set('dg_token', tok);
      conn.subscriptionBuilder()
        .onApplied(() => { subscribed = true; try { onSubscribed(); } catch (e) { console.error('[dg] onSubscribed threw', e); } })
        .onError(e => { console.error('[dg] subscription error', e); $('connecting-sub').textContent = 'SUBSCRIPTION ERROR — VERSION MISMATCH?'; })
        .subscribe([
          'SELECT * FROM lobby',
          'SELECT * FROM player',
          'SELECT * FROM chat',
          'SELECT * FROM course WHERE published = true',
          'SELECT * FROM my_courses',
        ]);
      try { wireRowEvents(); } catch (e) { console.error('[dg] wireRowEvents threw', e); }
    })
    .onConnectError((_c, err) => {
      if (gen !== connectGen) return;
      console.error('[dg] connect error', err);
      if (/verify token|unauthorized|401/i.test(String((err as any)?.message ?? err))) store.del('dg_token');
      $('connecting-sub').textContent = 'CONNECTION FAILED — IS THE SERVER RUNNING? RETRYING…';
      showOverlay('connecting');
      scheduleReconnect();
    })
    .build();
  (window as any).__dg = { get conn() { return conn; } };
}

/** Reducer calls that surface a rejection (SenderError) as a toast. */
const errMsg = (e: unknown) => String((e as any)?.message ?? e).replace(/^.*?SenderError:?\s*/i, '');
function rd(): typeof conn.reducers {
  return new Proxy({} as any, {
    get: (_t, k: string) => (args: any) => (conn.reducers as any)[k](args ?? {}).catch((e: unknown) => notify(errMsg(e), true)),
  });
}

// Per-course hole subscriptions: only the courses being played / browsed.
const holeSubs = new Map<string, { unsubscribe(): void }>();
function subscribeCourse(courseId: bigint) {
  const key = courseId.toString();
  if (holeSubs.has(key)) return;
  const h = conn.subscriptionBuilder()
    .onError(e => console.error('[dg] hole sub error', e))
    .subscribe([`SELECT * FROM hole WHERE course_id = ${key}`]);
  holeSubs.set(key, h);
  if (holeSubs.size > 40) {
    const oldest = holeSubs.keys().next().value!;
    if (oldest !== key) { try { holeSubs.get(oldest)!.unsubscribe(); } catch { /* */ } holeSubs.delete(oldest); }
  }
}

// ---------------------------------------------------------------------------
// Row access
// ---------------------------------------------------------------------------
const me = (): Player | undefined => (myIdentity ? conn.db.player.identity.find(myIdentity) ?? undefined : undefined);
const isMe = (id: Identity) => !!myIdentity && id.isEqual(myIdentity);
function myLobby(): Lobby | undefined {
  const p = me();
  if (!p || p.lobbyId === 0n) return undefined;
  return conn.db.lobby.id.find(p.lobbyId) ?? undefined;
}
function lobbyPlayers(lobbyId: bigint): Player[] {
  const out: Player[] = [];
  for (const p of conn.db.player.iter()) if (p.lobbyId === lobbyId) out.push(p);
  out.sort((a, b) => a.seat - b.seat);
  return out;
}
function lobbyChat(lobbyId: bigint): Chat[] {
  const out: Chat[] = [];
  for (const c of conn.db.chat.iter()) if (c.lobbyId === lobbyId) out.push(c);
  out.sort((a, b) => (a.id < b.id ? -1 : 1));
  return out;
}
function courseById(id: bigint): Course | undefined {
  const c = conn.db.course.id.find(id);
  if (c) return c;
  for (const m of conn.db.myCourses.iter()) if (m.id === id) return m as unknown as Course;
  return undefined;
}
function holeRows(courseId: bigint): HoleRow[] {
  const out: HoleRow[] = [];
  for (const h of conn.db.hole.iter()) if (h.courseId === courseId) out.push(h);
  out.sort((a, b) => a.index - b.index);
  return out;
}
const parsedHoles = new Map<string, Hole>();
function parsedHole(row: HoleRow): Hole | null {
  const key = row.id.toString();
  let h = parsedHoles.get(key);
  if (h) return h;
  try { h = parseHole(row.data); } catch (e) { console.warn('[dg] bad hole row', e); return null; }
  if (parsedHoles.size > 200) parsedHoles.delete(parsedHoles.keys().next().value!);
  parsedHoles.set(key, h);
  return h;
}
function currentHole(lobby: Lobby): Hole | null {
  const row = conn.db.hole.id.find(lobby.holeId);
  return row ? parsedHole(row) : null;
}
const charOf = (p: Player): Character => CHARACTERS[p.characterId] ?? CHARACTERS[0];

// ---------------------------------------------------------------------------
// Flow state
// ---------------------------------------------------------------------------
type Intent = 'create' | 'join' | 'change' | 'setchar' | null;
let intent: Intent = null;
let joinCode = '';
let selectedChar = Number(store.get('dg_char') ?? 0) || 0;
let selectedCourse: bigint | null = null;
let courseTab: 'featured' | 'community' | 'mine' = 'featured';
let rules = {
  isPublic: false,
  maxStrokes: Number(store.get('dg_strokes') ?? 10) || 10,
  holeSecs: Number(store.get('dg_time') ?? 90) || 90,
  collisions: (store.get('dg_collide') ?? '1') === '1',
  waterPenalty: (store.get('dg_water') ?? '1') === '1',
  powerMul: Number(store.get('dg_power') ?? 100) || 100,
};
const saveRules = () => { store.set('dg_strokes', String(rules.maxStrokes)); store.set('dg_time', String(rules.holeSecs)); store.set('dg_collide', rules.collisions ? '1' : '0'); store.set('dg_water', rules.waterPenalty ? '1' : '0'); store.set('dg_power', String(rules.powerMul)); };
let pendingJoin: string | null = null;
{
  const code = new URLSearchParams(location.search).get('lobby');
  if (code) pendingJoin = code.toUpperCase();
}

function onSubscribed() {
  const p = me();
  if (!p) { setTimeout(onSubscribed, 100); return; }
  const stored = (store.get('dg_name') ?? '').trim();
  if (!p.name && stored) rd().setName({ name: stored });
  else if (p.name && !stored) store.set('dg_name', p.name);
  if (store.get('dg_char') !== null && p.characterId !== selectedChar) rd().setCharacter({ characterId: selectedChar });
  else selectedChar = p.characterId;
  const storedColor = store.get('dg_color');
  if (storedColor !== null && Number(storedColor) !== p.color && p.lobbyId === 0n) rd().setColor({ color: Number(storedColor) });
  if (!p.name && !stored) { modal('name-modal', true); ($('name-input') as HTMLInputElement).focus(); }
  if (pendingJoin) { joinCode = pendingJoin; pendingJoin = null; intent = 'join'; showOverlay('select-player'); return; }
  route();
}

function route() {
  if (editorIsOpen()) return;
  const p = me();
  if (!p) return;
  const lobby = myLobby();
  if (!lobby) {
    if (intent === 'join' || intent === 'create' || intent === 'setchar') {
      if (overlayTarget === 'select-player' || overlayTarget === 'select-course') return;
    }
    if (overlayTarget !== 'menu') showOverlay('menu'); else renderMenu();
    return;
  }
  if (lobby.status === L_OPEN) {
    if (intent === 'change' && overlayTarget === 'select-course') return;
    if (overlayTarget !== 'waiting') showOverlay('waiting'); else renderRoom();
    return;
  }
  if (lobby.status === L_FINISHED && lobby.phase === PH_FINAL) {
    if (overlayTarget !== 'gameover') showOverlay('gameover'); else renderGameOver();
    return;
  }
  if (overlayTarget !== null) { showOverlay(null); enterGame(); }
}

// ---------------------------------------------------------------------------
// Name gate + chips
// ---------------------------------------------------------------------------
function submitName() {
  const name = ($('name-input') as HTMLInputElement).value.trim().slice(0, 16);
  if (!name) return;
  unlockAudio();
  store.set('dg_name', name);
  rd().setName({ name });
  modal('name-modal', false);
  sfx.ui();
  renderMenu();
}
$('name-ok').onclick = submitName;
$('name-input').addEventListener('keydown', e => { if (e.key === 'Enter') submitName(); });
$('name-edit').onclick = () => { ($('name-input') as HTMLInputElement).value = me()?.name ?? ''; modal('name-modal', true); $('name-input').focus(); };
$('char-chip').onclick = () => { intent = 'setchar'; showOverlay('select-player'); };

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
function renderMenu() {
  const p = me();
  if (!p) return;
  $('name-edit').textContent = p.name || 'GUEST';
  $('char-chip').textContent = charOf(p).name;
  ($('char-chip') as HTMLElement).style.borderColor = charOf(p).css;
  const pub = $('lobby-list'), live = $('live-list');
  pub.innerHTML = ''; live.innerHTML = '';
  const lobbies = [...conn.db.lobby.iter()].filter(l => l.isPublic).sort((a, b) => (a.id < b.id ? 1 : -1));
  for (const l of lobbies) {
    const players = lobbyPlayers(l.id);
    const host = players.find(x => x.identity.isEqual(l.hostId));
    const row = document.createElement('div');
    row.className = 'lobby-row' + (l.status === L_RUNNING ? ' live' : '');
    if (l.status === L_OPEN) {
      row.innerHTML = `<div class="lobby-mode">⛳ ${esc(l.courseName)}</div><div class="lobby-meta"><span class="lobby-host">HOST ${esc(host?.name ?? '?')}</span> · ${l.holeCount} HOLES · ${players.length}/${MAX_PLAYERS}</div><button class="lobby-join">Join</button>`;
      row.querySelector('button')!.onclick = () => startJoin(l.code);
      pub.appendChild(row);
    } else if (l.status === L_RUNNING) {
      row.innerHTML = `<div class="lobby-mode">● ${esc(l.courseName)} · HOLE ${l.holeIndex + 1}/${l.holeCount}</div><div class="lobby-meta">${players.map(x => esc(x.name)).join(', ')}</div><button class="lobby-join">Jump in</button>`;
      row.querySelector('button')!.onclick = () => startJoin(l.code);
      live.appendChild(row);
    }
  }
  if (!pub.childElementCount) pub.innerHTML = '<div class="lobby-empty">NO OPEN ROUNDS — CREATE ONE AND MAKE IT PUBLIC</div>';
  if (!live.childElementCount) live.innerHTML = '<div class="lobby-empty">NOBODY ON THE COURSE RIGHT NOW</div>';
  staggerChildren(pub); staggerChildren(live);
}
function startJoin(code: string) {
  unlockAudio();
  const lobby = [...conn.db.lobby.iter()].find(l => l.code === code);
  if (!lobby) { $('status-msg').textContent = 'NO ROUND WITH THAT CODE'; ($('code-input') as HTMLInputElement).classList.add('bad'); sfx.error(); return; }
  if (lobby.status === L_FINISHED) { $('status-msg').textContent = 'THAT ROUND IS OVER'; sfx.error(); return; }
  if (lobbyPlayers(lobby.id).length >= MAX_PLAYERS) { $('status-msg').textContent = 'THAT ROUND IS FULL'; sfx.error(); return; }
  $('status-msg').textContent = '';
  joinCode = code;
  intent = 'join';
  showOverlay('select-player');
}
$('create-btn').onclick = () => { unlockAudio(); intent = 'create'; showOverlay('select-player'); };
$('join-btn').onclick = () => startJoin(($('code-input') as HTMLInputElement).value.trim().toUpperCase());
$('code-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('join-btn').click(); });
$('code-input').addEventListener('input', () => $('code-input').classList.remove('bad'));
$('editor-btn').onclick = () => { unlockAudio(); openMine(); };
$('menu-settings-btn').onclick = () => modal('settings-modal', true);
$('menu-fullscreen-btn').onclick = toggleFullscreen;
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else $('app').requestFullscreen?.().catch(() => {});
}

// ---------------------------------------------------------------------------
// Player select — live 3D previews on every card (render3d.ts)
// ---------------------------------------------------------------------------
function buildCharGrid() {
  const grid = $('char-grid');
  const slots: { char: Character; el: HTMLElement }[] = [];
  for (const c of CHARACTERS) {
    const card = document.createElement('button');
    card.className = 'sel-card';
    card.dataset.id = String(c.id);
    card.innerHTML =
      `<span class="preview-slot" style="--glow:${c.css}"></span>` +
      `<div class="cname">${c.name}</div><div class="cmeta">${c.flag} ${c.country} · ${c.style}</div>`;
    card.addEventListener('click', () => { selectedChar = c.id; sfx.ui(); refreshCharSelection(); });
    grid.appendChild(card);
    slots.push({ char: c, el: card.querySelector('.preview-slot')! });
  }
  staggerChildren(grid);
  initCharacterPreviews($('char-preview') as HTMLCanvasElement, slots, grid);
}
function refreshCharSelection() {
  document.querySelectorAll('#char-grid .sel-card').forEach(el => el.classList.toggle('selected', Number((el as HTMLElement).dataset.id) === selectedChar));
  const c = CHARACTERS[selectedChar] ?? CHARACTERS[0];
  $('char-style').textContent = `${c.name} · ${c.country} · ${c.style}`;
  $('step-course').textContent = intent === 'join' ? '2 · JOIN' : '2 · COURSE';
  document.querySelectorAll('#select-player .step')[2].textContent = '3 · PLAY';
}
$('char-back').onclick = () => { intent = null; showOverlay('menu'); };
$('char-confirm').onclick = () => {
  store.set('dg_char', String(selectedChar));
  rd().setCharacter({ characterId: selectedChar });
  sfx.ui();
  if (intent === 'join') { rd().joinLobby({ code: joinCode }); intent = null; return; }
  if (intent === 'setchar') { intent = null; showOverlay('menu'); return; }
  showOverlay('select-course');
};

// ---------------------------------------------------------------------------
// Course select
// ---------------------------------------------------------------------------
function coursesFor(tab: typeof courseTab): Course[] {
  const all: Course[] = [];
  for (const c of conn.db.course.iter()) all.push(c);
  if (tab === 'featured') return all.filter(c => c.builtin).sort((a, b) => (a.id < b.id ? -1 : 1));
  if (tab === 'community') return all.filter(c => !c.builtin && c.published).sort((a, b) => b.plays - a.plays || (a.id < b.id ? 1 : -1));
  const mine: Course[] = [];
  for (const c of conn.db.myCourses.iter()) mine.push(c as unknown as Course);
  return mine.sort((a, b) => (a.id < b.id ? 1 : -1));
}
// The picker: a scrolling list of courses (any number — rows are cheap and
// their thumbnails load only as they scroll into view) beside a detail pane
// for the chosen course: hole 1 large, every hole small, the round options.
let courseSearch = '';
const courseRows = new Map<string, HTMLButtonElement>(); // course id → row element
let courseListOrder = '';
let courseDetailSig = '';
const thumbWatcher = typeof IntersectionObserver !== 'undefined'
  ? new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { const id = (e.target as HTMLElement).dataset.id; if (id) subscribeCourse(BigInt(id)); }
  }, { root: null, rootMargin: '120px' })
  : null;

function drawThumb(cv: HTMLCanvasElement, h: Hole, w: number, hgt: number, margin = 2) {
  cv.width = w; cv.height = hgt;
  const g = cv.getContext('2d')!;
  drawHole(g, h, fitCamera(h, w, hgt, margin), w, hgt, { t: 0, theme: themeFor(h, h.theme) });
}

function matchesSearch(c: Course): boolean {
  if (!courseSearch) return true;
  const q = courseSearch.toLowerCase();
  return c.name.toLowerCase().includes(q) || c.authorName.toLowerCase().includes(q);
}

function renderCourseGrid(force = false) {
  document.querySelectorAll('#course-tabs .sel-card').forEach(b => b.classList.toggle('selected', (b as HTMLElement).dataset.tab === courseTab));
  const list = $('course-list');
  const all = coursesFor(courseTab);
  const rows = all.filter(matchesSearch);
  if (selectedCourse === null || !rows.some(c => c.id === selectedCourse)) selectedCourse = rows[0]?.id ?? null;
  // rows are keyed by course id and updated in place, so a hole row arriving
  // (thumbnail) or a selection change never rebuilds the list or loses scroll
  const order = rows.map(c => c.id.toString()).join(',');
  if (force || order !== courseListOrder) {
    courseListOrder = order;
    for (const [id, el] of courseRows) if (!rows.some(c => c.id.toString() === id)) { thumbWatcher?.unobserve(el); el.remove(); courseRows.delete(id); }
    list.querySelector('.course-empty')?.remove();
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'course-empty';
      empty.textContent = courseSearch ? 'NO COURSE MATCHES THAT' : courseTab === 'mine' ? 'YOU HAVE NO COURSES YET — OPEN THE COURSE EDITOR' : 'NOTHING HERE YET — BE THE FIRST TO PUBLISH ONE';
      list.appendChild(empty);
    }
    for (const c of rows) {
      const key = c.id.toString();
      let row = courseRows.get(key);
      if (!row) {
        row = document.createElement('button');
        row.className = 'sel-card course-row';
        row.dataset.id = key;
        row.innerHTML = `<span class="course-art"></span><span class="course-text"><div class="cname"></div><div class="cmeta"></div></span>`;
        row.onclick = () => { selectedCourse = c.id; sfx.ui(); renderCourseGrid(); };
        courseRows.set(key, row);
        thumbWatcher?.observe(row);
      }
      list.appendChild(row); // (re)append in order
    }
    if (!thumbWatcher) for (const c of rows.slice(0, 12)) subscribeCourse(c.id);
  }
  for (const c of rows) {
    const row = courseRows.get(c.id.toString())!;
    row.classList.toggle('selected', c.id === selectedCourse);
    (row.querySelector('.cname') as HTMLElement).textContent = c.name;
    (row.querySelector('.cmeta') as HTMLElement).textContent = `${c.holeCount} HOLES · PAR ${c.totalPar}${c.builtin ? ' · ★' : ` · ${c.authorName}`}${c.published ? '' : ' · DRAFT'}`;
    const art = row.querySelector('.course-art') as HTMLElement;
    art.classList.toggle('neon', c.name.toLowerCase().includes('neon'));
    if (!art.classList.contains('has-art')) {
      const first = holeRows(c.id)[0];
      const h0 = first ? parsedHole(first) : null;
      if (h0) { const cv = document.createElement('canvas'); drawThumb(cv, h0, 168, 84); art.appendChild(cv); art.classList.add('has-art'); }
    }
  }
  $('course-count').textContent = rows.length === all.length ? `${all.length} COURSE${all.length === 1 ? '' : 'S'}` : `${rows.length} OF ${all.length} COURSES`;
  renderCourseDetail();
  $('mode-options').classList.toggle('hidden', intent === 'change');
  document.querySelectorAll('#visibility-grid .sel-card').forEach(b => b.classList.toggle('selected', ((b as HTMLElement).dataset.vis === '1') === rules.isPublic));
  renderRuleSegs();
  ($('course-confirm') as HTMLButtonElement).disabled = selectedCourse === null;
}

function renderCourseDetail() {
  const c = selectedCourse !== null ? courseById(selectedCourse) : undefined;
  const hero = $('course-hero');
  if (!c) {
    if (courseDetailSig !== '') { courseDetailSig = ''; hero.classList.remove('has-art'); $('course-detail-name').textContent = '—'; $('course-detail-meta').textContent = ''; $('course-holes').innerHTML = ''; }
    return;
  }
  subscribeCourse(c.id);
  const rows = holeRows(c.id);
  const sig = `${c.id}:${c.rev}:${c.plays}:${rows.length}`;
  if (sig === courseDetailSig) return;
  courseDetailSig = sig;
  $('course-detail-name').textContent = c.name.toUpperCase();
  $('course-detail-meta').textContent = `${c.holeCount} HOLES · PAR ${c.totalPar} · ${c.builtin ? '★ FEATURED' : `BY ${c.authorName.toUpperCase()} · ${c.plays} PLAYS`}${c.published ? '' : ' · DRAFT'}`;
  const first = rows[0] ? parsedHole(rows[0]) : null;
  if (first) { drawThumb($('course-hero-canvas') as HTMLCanvasElement, first, 960, 360, 2.5); hero.classList.add('has-art'); }
  else hero.classList.remove('has-art');
  const strip = $('course-holes');
  strip.innerHTML = '';
  if (!rows.length) { strip.innerHTML = `<div class="course-empty">${c.holeCount ? 'LOADING HOLES…' : 'NO HOLES YET'}</div>`; return; }
  rows.forEach((r, i) => {
    const h = parsedHole(r);
    if (!h) return;
    const chip = document.createElement('div');
    chip.className = 'hole-chip';
    const cv = document.createElement('canvas');
    drawThumb(cv, h, 236, 124, 2);
    chip.appendChild(cv);
    // (not innerHTML += — that would rebuild the canvas and lose the drawing)
    chip.insertAdjacentHTML('beforeend', `<div class="hname">${i + 1} · ${esc(h.name.toUpperCase())}</div><div class="hpar">PAR ${h.par}</div>`);
    strip.appendChild(chip);
  });
}
document.querySelectorAll('#course-tabs .sel-card').forEach(b => { (b as HTMLButtonElement).onclick = () => { courseTab = (b as HTMLElement).dataset.tab as any; selectedCourse = null; sfx.ui(); renderCourseGrid(true); }; });
$('course-search').addEventListener('input', () => { courseSearch = ($('course-search') as HTMLInputElement).value.trim(); renderCourseGrid(); });
$('course-search').addEventListener('keydown', e => { if (e.key === 'Escape') { ($('course-search') as HTMLInputElement).value = ''; courseSearch = ''; renderCourseGrid(); } e.stopPropagation(); });
document.querySelectorAll('#visibility-grid .sel-card').forEach(b => { (b as HTMLButtonElement).onclick = () => { rules.isPublic = (b as HTMLElement).dataset.vis === '1'; renderCourseGrid(); }; });
$('course-back').onclick = () => { if (intent === 'change') { intent = null; showOverlay('waiting'); } else showOverlay('select-player'); };
$('course-confirm').onclick = () => {
  if (selectedCourse === null) return;
  sfx.ui();
  if (intent === 'change') {
    const l = myLobby();
    if (l) rd().setSettings({ courseId: selectedCourse, isPublic: l.isPublic, maxStrokes: l.maxStrokes, holeSecs: l.holeSecs, collisions: l.collisions, waterPenalty: l.waterPenalty, powerMul: l.powerMul });
    intent = null;
    showOverlay('waiting');
    return;
  }
  rd().createLobby({ courseId: selectedCourse, isPublic: rules.isPublic, maxStrokes: rules.maxStrokes, holeSecs: rules.holeSecs, collisions: rules.collisions, waterPenalty: rules.waterPenalty, powerMul: rules.powerMul });
};

// rules modal (shared by the course screen and the host's lobby)
const STROKE_OPTS = [6, 8, 10, 12, 15, 20];
const TIME_OPTS: [number, string][] = [[45, '45 S'], [60, '60 S'], [90, '90 S'], [120, '2 MIN'], [180, '3 MIN'], [300, '5 MIN']];
function seg(container: HTMLElement, opts: { label: string; value: any; selected: boolean; sub?: string }[], pick: (v: any) => void) {
  container.innerHTML = '';
  for (const o of opts) {
    const b = document.createElement('button');
    b.className = 'sel-card' + (o.selected ? ' selected' : '');
    b.innerHTML = `<div class="cname">${o.label}</div>${o.sub ? `<div class="cmeta">${o.sub}</div>` : ''}`;
    b.onclick = () => { pick(o.value); sfx.ui(); };
    container.appendChild(b);
  }
}
function renderRuleSegs() {
  const apply = (patch: Partial<typeof rules>) => { Object.assign(rules, patch); saveRules(); renderCourseGrid(); };
  seg($('strokes-grid'), STROKE_OPTS.map(v => ({ label: String(v), value: v, selected: rules.maxStrokes === v })), v => apply({ maxStrokes: v }));
  seg($('time-grid'), TIME_OPTS.map(([v, label]) => ({ label, value: v, selected: rules.holeSecs === v })), v => apply({ holeSecs: v }));
  seg($('collide-grid'), [{ label: 'ON', value: true, selected: rules.collisions, sub: 'BALLS BUMP' }, { label: 'OFF', value: false, selected: !rules.collisions, sub: 'GHOST BALLS' }], v => apply({ collisions: v }));
  seg($('water-grid'), [{ label: '+1 STROKE', value: true, selected: rules.waterPenalty, sub: 'CLASSIC' }, { label: 'FREE', value: false, selected: !rules.waterPenalty, sub: 'JUST RESET' }], v => apply({ waterPenalty: v }));
  seg($('power-grid'), POWER_MULS.map(([v, label]) => ({ label, value: v, selected: rules.powerMul === v, sub: `${v}%` })), v => apply({ powerMul: v }));
}

// ---------------------------------------------------------------------------
// Lobby (waiting room)
// ---------------------------------------------------------------------------
function renderRoom() {
  const lobby = myLobby();
  const p = me();
  if (!lobby || !p) return;
  subscribeCourse(lobby.courseId);
  const host = lobby.hostId.isEqual(p.identity);
  const course = courseById(lobby.courseId);
  $('lobby-code').textContent = lobby.code;
  $('lobby-link').textContent = `${location.origin}${location.pathname}?lobby=${lobby.code}`;
  $('waiting-title').textContent = lobby.isPublic ? 'PUBLIC ROUND' : 'PRIVATE ROUND';
  const membersNow = lobbyPlayers(lobby.id);
  const waitingOn = membersNow.filter(q => q.online && !q.ready);
  const allReady = waitingOn.length === 0;
  $('waiting-sub').textContent = allReady
    ? (host ? 'EVERYONE IS READY — START WHEN YOU LIKE' : 'EVERYONE IS READY — WAITING FOR THE HOST TO START')
    : `READY UP · WAITING ON ${waitingOn.map(q => (isMe(q.identity) ? 'YOU' : q.name.toUpperCase())).join(', ')}`;
  const pills = [
    ['COURSE', lobby.courseName], ['HOLES', String(lobby.holeCount)], ['PAR', String(course?.totalPar ?? '?')],
    ['BY', course?.authorName ?? '?'], ['MAX', `${lobby.maxStrokes} STROKES`], ['TIME', `${lobby.holeSecs} S / HOLE`],
    ['COLLISIONS', lobby.collisions ? 'ON' : 'OFF'], ['WATER', lobby.waterPenalty ? '+1 STROKE' : 'FREE RESET'],
    ['POWER', POWER_MULS.find(([v]) => v === lobby.powerMul)?.[1] ?? 'NORMAL'],
  ];
  $('lobby-info').innerHTML = pills.map(([k, v]) => `<span class="info-pill">${k} <span class="v">${esc(v)}</span></span>`).join('');
  staggerChildren($('lobby-info'));
  $('host-settings').classList.toggle('hidden', !host);
  if (host) {
    const rowBtns = (row: HTMLElement, opts: { label: string; on: boolean; pick: () => void }[]) => {
      row.querySelectorAll('button').forEach(b => b.remove());
      for (const o of opts) {
        const b = document.createElement('button');
        b.className = 'setting-btn' + (o.on ? ' selected' : '');
        b.textContent = o.label;
        b.onclick = () => { o.pick(); sfx.ui(); };
        row.appendChild(b);
      }
    };
    const set = (patch: Partial<{ maxStrokes: number; holeSecs: number; collisions: boolean; isPublic: boolean; waterPenalty: boolean; powerMul: number }>) =>
      rd().setSettings({ courseId: lobby.courseId, isPublic: patch.isPublic ?? lobby.isPublic, maxStrokes: patch.maxStrokes ?? lobby.maxStrokes, holeSecs: patch.holeSecs ?? lobby.holeSecs, collisions: patch.collisions ?? lobby.collisions, waterPenalty: patch.waterPenalty ?? lobby.waterPenalty, powerMul: patch.powerMul ?? lobby.powerMul });
    rowBtns($('host-strokes'), STROKE_OPTS.map(v => ({ label: String(v), on: lobby.maxStrokes === v, pick: () => set({ maxStrokes: v }) })));
    rowBtns($('host-time'), TIME_OPTS.map(([v, label]) => ({ label, on: lobby.holeSecs === v, pick: () => set({ holeSecs: v }) })));
    rowBtns($('host-misc'), [
      { label: 'COLLISIONS', on: lobby.collisions, pick: () => set({ collisions: !lobby.collisions }) },
      { label: 'WATER +1', on: lobby.waterPenalty, pick: () => set({ waterPenalty: !lobby.waterPenalty }) },
      { label: lobby.isPublic ? 'PUBLIC' : 'PRIVATE', on: lobby.isPublic, pick: () => set({ isPublic: !lobby.isPublic }) },
    ]);
    rowBtns($('host-power'), POWER_MULS.map(([v, label]) => ({ label, on: lobby.powerMul === v, pick: () => set({ powerMul: v }) })));
  }
  const players = lobbyPlayers(lobby.id);
  $('roster-head').textContent = `GOLFERS ${players.length}/${MAX_PLAYERS}`;
  const wp = $('waiting-players');
  wp.innerHTML = '';
  for (const q of players) {
    const chip = document.createElement('div');
    chip.className = 'player-chip' + (q.identity.isEqual(lobby.hostId) ? ' host' : '') + (isMe(q.identity) ? ' me' : '');
    chip.classList.toggle('ready', q.ready);
    chip.innerHTML = `<span class="chip-name">${esc(q.name)}${q.online ? '' : ' 💤'}${q.ready ? ' <span class="ready-tag">✓ READY</span>' : ''}</span><span class="chip-char"><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${COLORS[q.color]};margin-right:5px"></span>${charOf(q).name}</span>`;
    if (host && !isMe(q.identity)) chip.appendChild(kickButton(q));
    wp.appendChild(chip);
  }
  for (let i = players.length; i < Math.min(MAX_PLAYERS, players.length + 2); i++) {
    const chip = document.createElement('div');
    chip.className = 'player-chip open-slot';
    chip.innerHTML = '<span class="chip-name">OPEN</span>';
    wp.appendChild(chip);
  }
  staggerChildren(wp);
  $('start-btn').classList.toggle('hidden', !host);
  ($('start-btn') as HTMLButtonElement).disabled = !allReady;
  $('start-btn').title = allReady ? '' : 'Everyone has to ready up first';
  $('ready-btn').textContent = p.ready ? '✓ Ready' : 'Ready up';
  $('ready-btn').classList.toggle('primary', !p.ready);
  $('ready-btn').classList.toggle('alt', p.ready);
  renderChatFeed('lobby-chat-feed', lobby.id, 60);
}
/** The host's ✕ on another player's chip: one click, they are out (they
 *  can rejoin with the code — this is for the AFK seat holding a hole open). */
function kickButton(q: Player): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'chip-kick';
  b.title = `Remove ${q.name} from the room`;
  b.textContent = '✕';
  b.onclick = e => { e.stopPropagation(); sfx.ui(); rd().kickPlayer({ target: q.identity }); };
  return b;
}
/** The pause menu's room list (players + the host's kick buttons). */
function renderMatchMenu() {
  const lobby = myLobby(); const p = me();
  if (!lobby || !p) return;
  const host = lobby.hostId.isEqual(p.identity);
  const list = $('mm-players');
  list.innerHTML = '';
  for (const q of lobbyPlayers(lobby.id)) {
    const row = document.createElement('div');
    row.className = 'player-chip' + (q.identity.isEqual(lobby.hostId) ? ' host' : '') + (isMe(q.identity) ? ' me' : '');
    row.innerHTML = `<span class="chip-name"><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${COLORS[q.color]};margin-right:6px"></span>${esc(q.name)}${q.online ? '' : ' 💤'}${q.holed ? ' ⛳' : ''}</span>`;
    if (host && !isMe(q.identity)) row.appendChild(kickButton(q));
    list.appendChild(row);
  }
  $('mm-room-foot').textContent = host ? 'YOU HOST THIS ROOM · ✕ REMOVES A PLAYER' : `${lobbyPlayers(lobby.id).length} IN THE ROOM`;
}
$('change-course-btn').onclick = () => { intent = 'change'; courseTab = 'featured'; showOverlay('select-course'); };
$('start-btn').onclick = () => { unlockAudio(); rd().startGame({}); };
$('ready-btn').onclick = () => { unlockAudio(); const p = me(); if (p) { sfx.ui(); rd().setReady({ ready: !p.ready }); } };
$('leave-btn').onclick = () => { rd().leaveLobby({}); intent = null; resetScene(); showOverlay('menu'); };
$('waiting-settings-btn').onclick = () => modal('settings-modal', true);
$('copy-link-btn').onclick = async () => {
  const l = myLobby();
  if (!l) return;
  const url = `${location.origin}${location.pathname}?lobby=${l.code}`;
  try { await navigator.clipboard.writeText(url); $('copy-link-btn').classList.add('copied'); $('copy-link-btn').textContent = 'Copied!'; setTimeout(() => { $('copy-link-btn').classList.remove('copied'); $('copy-link-btn').textContent = 'Copy Link'; }, 1500); } catch { notify(url); }
};
function renderChatFeed(id: string, lobbyId: bigint, n: number) {
  const feed = $(id);
  const rows = lobbyChat(lobbyId).slice(-n);
  const html = rows.map(c => `<div class="chat-line${isMe(c.identity) ? ' mine' : ''}"><span class="who" style="color:${COLORS[c.color] ?? '#fff'}">${esc(c.name)}</span> ${esc(c.text)}</div>`).join('');
  if (feed.innerHTML !== html) { feed.innerHTML = html; feed.scrollTop = feed.scrollHeight; }
}
function sendChatFrom(inputId: string) {
  const input = $(inputId) as HTMLInputElement;
  const text = input.value.trim();
  input.value = '';
  if (text) rd().sendChat({ text });
}
$('lobby-chat-send').onclick = () => sendChatFrom('lobby-chat-input');
$('lobby-chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendChatFrom('lobby-chat-input'); });

// ---------------------------------------------------------------------------
// Editor entry
// ---------------------------------------------------------------------------
function openMine() { modal('mine-modal', true); renderMine(); }
function renderMine() {
  const list = $('mine-list');
  list.innerHTML = '';
  const mine = [...conn.db.myCourses.iter()].map(c => c as unknown as Course).sort((a, b) => (a.id < b.id ? 1 : -1));
  if (!mine.length) list.innerHTML = '<div class="course-empty">NOTHING YET — MAKE SOMETHING WILD</div>';
  for (const c of mine) {
    const row = document.createElement('div');
    row.className = 'lobby-row';
    row.innerHTML = `<div><div class="lobby-mode">${esc(c.name)} ${c.published ? '<span class="live-tag">PUBLISHED</span>' : ''}</div><div class="lobby-meta">${c.holeCount} HOLES · PAR ${c.totalPar} · ${c.plays} PLAYS${c.published ? '' : ' · DRAFT'}</div></div><button class="lobby-join">Edit</button><button class="lobby-join alt" data-del="1">✕</button>`;
    row.querySelector('button')!.onclick = () => launchEditor(c);
    (row.querySelector('[data-del]') as HTMLButtonElement).onclick = () => { if (confirm(`Delete "${c.name}"? This cannot be undone.`)) rd().deleteCourse({ courseId: c.id }); };
    list.appendChild(row);
  }
  const bl = $('mine-builtins');
  bl.innerHTML = '';
  for (const c of [...conn.db.course.iter()].filter(c => c.builtin)) {
    const row = document.createElement('div');
    row.className = 'lobby-row';
    row.innerHTML = `<div><div class="lobby-mode">${esc(c.name)}</div><div class="lobby-meta">${c.holeCount} HOLES · PAR ${c.totalPar}</div></div><button class="lobby-join">Duplicate</button>`;
    row.querySelector('button')!.onclick = () => launchEditor(c, true);
    bl.appendChild(row);
  }
}
$('mine-close').onclick = () => modal('mine-modal', false);
$('mine-new').onclick = () => launchEditor(null);
function launchEditor(course: Course | null, duplicate = false) {
  const start = () => {
    const holes: Hole[] = course ? holeRows(course.id).map(parsedHole).filter((h): h is Hole => !!h) : [];
    modal('mine-modal', false);
    $('editor').classList.remove('hidden');
    openEditor({
      courseId: course && !duplicate ? course.id : 0n,
      name: course ? (duplicate ? `${course.name} REMIX` : course.name) : '',
      holes,
      published: !!course && !duplicate && course.published,
      myName: me()?.name ?? 'ANON',
      myCharacter: me()?.characterId ?? 0,
      myColor: parseInt(COLORS[me()?.color ?? 0].slice(1), 16),
      onSave: (courseId, name, holesJson) => rd().saveCourse({ courseId, name, holesJson }),
      onPublish: (courseId, published) => rd().publishCourse({ courseId, published }),
      onExit: () => { closeEditor(); $('editor').classList.add('hidden'); route(); renderMenu(); },
      findSaved: name => {
        let best: Course | undefined;
        for (const c of conn.db.myCourses.iter()) { const cc = c as unknown as Course; if (cc.name === name && (!best || cc.id > best.id)) best = cc; }
        return best ? { id: best.id, published: best.published } : null;
      },
    });
  };
  if (course) {
    subscribeCourse(course.id);
    let tries = 0;
    const wait = () => { if (holeRows(course.id).length >= course.holeCount || tries++ > 30) start(); else setTimeout(wait, 100); };
    wait();
  } else start();
}

// ---------------------------------------------------------------------------
// Row events → refresh, SFX, VFX
// ---------------------------------------------------------------------------
interface Disp { x: number; y: number; z: number; sx: number; sy: number; sz: number; svx: number; svy: number; svz: number; at: number; emote: string; emoteUntil: number; lastEventSeq: number; lastShotSeq: number; lastEmoteSeq: number; facing: number }
const disp = new Map<string, Disp>();
let lastSeenPhase = -1;
let unreadChat = 0;

function wireRowEvents() {
  const refresh = () => {
    if (!subscribed) return;
    route();
    if (overlayTarget === 'menu') renderMenu();
    else if (overlayTarget === 'waiting') renderRoom();
    else if (overlayTarget === 'select-course') renderCourseGrid();
    else if (overlayTarget === 'gameover') renderGameOver();
    if (!$('mine-modal').classList.contains('hidden')) renderMine();
  };
  conn.db.lobby.onInsert(refresh);
  conn.db.lobby.onDelete(refresh);
  conn.db.lobby.onUpdate((_c, old, row) => {
    if (row.phase !== old.phase || row.status !== old.status || row.courseName !== old.courseName || row.isPublic !== old.isPublic || row.maxStrokes !== old.maxStrokes || row.holeSecs !== old.holeSecs || row.collisions !== old.collisions || row.holeIndex !== old.holeIndex || !row.hostId.isEqual(old.hostId)) refresh();
  });
  conn.db.player.onInsert(refresh);
  conn.db.player.onDelete(refresh);
  conn.db.player.onUpdate((_c, old, row) => {
    notePlayer(row, old);
    if (isMe(row.identity) && row.kicked && !old.kicked) { notify('THE HOST REMOVED YOU FROM THE ROOM', true); sfx.error(); }
    if (row.lobbyId !== old.lobbyId || row.name !== old.name || row.color !== old.color || row.online !== old.online || row.characterId !== old.characterId || row.ready !== old.ready) refresh();
  });
  conn.db.chat.onInsert((_c, row) => {
    const l = myLobby();
    if (!l || row.lobbyId !== l.id) return;
    renderChatFeed('lobby-chat-feed', l.id, 60);
    if (overlayTarget === null) { renderChatFeed('chat-feed', l.id, 5); if (!isMe(row.identity)) unreadChat++; }
  });
  conn.db.course.onInsert(refresh); conn.db.course.onUpdate(refresh); conn.db.course.onDelete(refresh);
  let holeRefresh = 0;
  conn.db.hole.onInsert(() => {
    if (overlayTarget !== 'select-course') return;
    clearTimeout(holeRefresh);
    holeRefresh = window.setTimeout(() => renderCourseGrid(), 80);
  });
  conn.db.hole.onDelete(() => {
    if (overlayTarget !== 'select-course') return;
    clearTimeout(holeRefresh);
    holeRefresh = window.setTimeout(() => { courseDetailSig = ''; renderCourseGrid(); }, 80);
  });
  conn.db.myCourses.onInsert(refresh); conn.db.myCourses.onUpdate(refresh); conn.db.myCourses.onDelete(refresh);
}

function dispOf(p: Player): Disp {
  const key = p.identity.toHexString();
  let d = disp.get(key);
  if (!d) {
    d = { x: p.x, y: p.y, z: p.z, sx: p.x, sy: p.y, sz: p.z, svx: p.vx, svy: p.vy, svz: p.vz, at: performance.now(), emote: '', emoteUntil: 0, lastEventSeq: p.eventSeq, lastShotSeq: p.shotSeq, lastEmoteSeq: p.emoteSeq, facing: 0 };
    disp.set(key, d);
  }
  return d;
}

function notePlayer(row: Player, old: Player) {
  const d = dispOf(row);
  const jumped = Math.hypot(row.x - old.x, row.y - old.y) > 4;
  d.sx = row.x; d.sy = row.y; d.sz = row.z; d.svx = row.vx; d.svy = row.vy; d.svz = row.vz; d.at = performance.now();
  if (jumped) { d.x = row.x; d.y = row.y; d.z = row.z; }
  const lobby = myLobby();
  const inMyRoom = !!lobby && row.lobbyId === lobby.id && overlayTarget === null;
  if (row.emoteSeq !== d.lastEmoteSeq) {
    d.lastEmoteSeq = row.emoteSeq;
    d.emote = EMOTES[row.emote] ?? '';
    d.emoteUntil = performance.now() + 2500;
    // a finished player heckling from the cup is usually off screen for the
    // ones still putting: their emote also lands as a toast
    if (inMyRoom && row.holed && !isMe(row.identity)) notify(`${row.name} ${d.emote}`);
  }
  if (row.shotSeq !== d.lastShotSeq) {
    const already = isMe(row.identity) && d.lastShotSeq === row.shotSeq; // predicted locally
    d.lastShotSeq = row.shotSeq;
    if (inMyRoom && !already) { sfx.putt(row.eventPower); burstAt(row.x, row.y, 0, 0xffffff, 6, 6); }
  }
  if (row.eventSeq !== d.lastEventSeq) {
    d.lastEventSeq = row.eventSeq;
    if (!inMyRoom) return;
    const color = parseInt(COLORS[row.color].slice(1), 16);
    switch (row.eventKind) {
      case EV.WALL: sfx.wall(row.eventPower); burstAt(row.x, row.y, 0, 0xfff8a0, 6 + Math.min(12, row.eventPower / 3), 8 + row.eventPower / 3); if (row.eventPower > 20) addShake(0.3); break;
      case EV.BUMPER: sfx.bumper(); burstAt(row.x, row.y, 0, 0xff8a8a, 18, 16); addShake(0.5); break;
      case EV.JUMP: sfx.jump(); burstAt(row.x, row.y, 0, 0xffd60a, 10, 10); break;
      case EV.LAND: sfx.land(); burstAt(row.x, row.y, 0, 0xc9c9c9, 8, 7); break;
      case EV.TELE: sfx.tele(); burstAt(row.x, row.y, 0, 0xc77dff, 24, 14); burstAt(old.x, old.y, 0, 0xc77dff, 14, 10); break;
      case EV.WATER: sfx.water(); burstAt(old.x, old.y, 0, 0x7fc8ff, 24, 14, -30); if (isMe(row.identity)) banner('SPLASH! +1 STROKE', 'lose'); break;
      case EV.RESET: sfx.reset(); if (isMe(row.identity)) banner(row.eventPower > 0 ? 'BALL RESET' : 'BACK YOU GO'); break;
      case EV.BOOST: sfx.boost(); break;
      case EV.HOLED: {
        const hole = currentHole(lobby!);
        const par = hole?.par ?? 3;
        sfx.holed(row.eventPower, par);
        burstAt(row.x, row.y, 0, 0xffd400, 30, 22, -30);
        burstAt(row.x, row.y, 0, color, 20, 16, -25);
        addShake(0.6);
        const label = scoreName(row.eventPower, par);
        if (isMe(row.identity)) toastBig(label); else banner(`${row.name}: ${label}`);
        break;
      }
    }
  }
}
function scoreName(score: number, par: number): string {
  if (score === 1) return 'HOLE IN ONE!!!';
  const d = score - par;
  if (d <= -3) return 'ALBATROSS!';
  if (d === -2) return 'EAGLE!';
  if (d === -1) return 'BIRDIE!';
  if (d === 0) return 'PAR';
  if (d === 1) return 'BOGEY';
  if (d === 2) return 'DOUBLE BOGEY';
  return `+${d}`;
}
const relPar = (delta: number) => (delta === 0 ? 'E' : delta > 0 ? `+${delta}` : `${delta}`);
const relClass = (delta: number) => (delta === 0 ? 'even' : delta > 0 ? 'over' : 'under');

let bannerTimer = 0;
function banner(text: string, kind = '') {
  const el = $('banner');
  el.textContent = text;
  el.className = kind;
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => { el.textContent = ''; }, 2200);
}
function toastBig(text: string) {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}

// ---------------------------------------------------------------------------
// Game: input, HUD, the per-frame scene
// ---------------------------------------------------------------------------
const canvas = $('game-canvas') as HTMLCanvasElement;
initRenderer(canvas);

// Pointer aim: a pull in screen space from where the pointer went down,
// through the camera axes frozen at that moment (see aim.ts). `angle` is
// the raw reading, `shown` the eased one the arrow and the shot both use.
interface DragAim { active: boolean; angle: number; shown: number; power: number; x0: number; y0: number; basis: AimBasis }
let drag: DragAim = { active: false, angle: 0, shown: 0, power: 0, x0: 0, y0: 0, basis: { rx: 1, ry: 0, fx: 0, fy: -1 } };
const kbAim = { active: false, angle: 0, charging: false, chargeStart: 0 };
const held = { left: false, right: false, fine: false };
// Client-side prediction: the ball (and the swing) go the instant you
// release — the server's copy takes over when it arrives a round trip
// later, so timing a windmill never depends on latency you can't see.
interface Predicted { ball: BallState; shotSeq: number; power: number; startedAt: number; t: number; acc: number }
let predicted: Predicted | null = null;
let gameHoleObj: Hole | null = null;
let gameHoleKey = '';
let tLocal = 0;

function enterGame() {
  unlockAudio();
  lastSeenPhase = -1;
  unreadChat = 0;
  $('chat-feed').innerHTML = '';
  const bar = $('emote-bar');
  if (!bar.childElementCount) EMOTES.forEach((e, i) => { const b = document.createElement('button'); b.textContent = e; b.onclick = () => rd().sendEmote({ index: i }); bar.appendChild(b); });
}
function canShoot(): boolean {
  const lobby = myLobby(); const p = me();
  return !!lobby && !!p && lobby.phase === PH_PLAY && p.resting && !p.holed && !predicted && p.strokes < lobby.maxStrokes && overlayTarget === null && $('match-menu').classList.contains('hidden');
}
/** Drop the pull in progress: nothing fires, the ball stays put. */
function cancelDrag() {
  if (!drag.active) return;
  drag.active = false;
  sfx.ui();
  notify('SHOT CANCELLED');
}
canvas.addEventListener('pointerdown', e => {
  unlockAudio();
  if (editorIsOpen()) return;
  // right button while pulling back: never mind
  if (e.button === 2 && drag.active) { cancelDrag(); return; }
  if (!canShoot()) return;
  if (e.button !== 0 || drag.active) return;
  canvas.setPointerCapture(e.pointerId);
  // press anywhere, then pull: the aim starts from wherever it was pointing
  drag = { active: true, angle: kbAim.angle, shown: kbAim.angle, power: 0, x0: e.clientX, y0: e.clientY, basis: cameraGroundBasis() };
  kbAim.active = false;
});
canvas.addEventListener('pointermove', e => {
  if (!drag.active) return;
  // a mouse already holding the left button reports a right-button press as
  // a move with the buttons bit set, not as a second pointerdown
  if (e.buttons & 2) { cancelDrag(); return; }
  updateDrag(e);
});
canvas.addEventListener('pointerup', e => {
  if (!drag.active) return;
  updateDrag(e);
  drag.active = false;
  // what you saw is what you get: the eased angle is the one that flies
  // the ball goes where your hand is at release, not where the eased arrow
  // was a frame ago
  if (drag.power > 0.04 && canShoot()) { kbAim.angle = drag.angle; fire(drag.angle, drag.power); }
});
/** Send the shot and start living it locally right now. */
function fire(angle: number, power: number) {
  const p = me(); const lobby = myLobby();
  if (!p || !lobby) return;
  // the hole tick we are looking at right now: the server applies the shot
  // THEN (lag compensation), so the windmill you timed is the one you hit
  rd().shoot({ angle, power, atTick: Math.max(0, Math.round(tLocal * TICK_HZ)) });
  const d = dispOf(p);
  const v = gameHoleObj ? shotFrom(geomOf(gameHoleObj), d.x, d.y, angle, power, lobby.powerMul / 100) : { vx: 0, vy: 0, vz: 0 };
  predicted = {
    ball: { x: d.x, y: d.y, z: v.vz > 0 ? d.z + 0.01 : d.z, vx: v.vx, vy: v.vy, vz: v.vz, teleTicks: 0 },
    shotSeq: p.shotSeq + 1, power, startedAt: performance.now(), t: tLocal, acc: 0,
  };
  d.lastShotSeq = predicted.shotSeq; // the server's echo of this shot is not a second putt
  sfx.putt(power);
  burstAt(d.x, d.y, d.z, 0xffffff, 6, 6);
}
canvas.addEventListener('pointercancel', () => { drag.active = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
// Looking around: right/middle drag, a primary drag that is not a putt, two
// fingers; wheel or pinch to zoom. Also serves the editor's test play.
bindFreeLook(canvas, {
  enabled: () => editorIsOpen() ? editorTesting() : overlayTarget === null,
  leftIsAim: () => editorIsOpen() ? editorTestAimable() : canShoot(),
  cancelAim: () => { drag.active = false; editorCancelTestAim(); },
});
/** C swaps the follow camera for the whole-hole view (cleared each hole). */
let camOverview = false;
/** Once holed out you ride along with someone still playing: their identity
 *  (hex), or null when there is nobody left to watch. ←/→ switch player. */
let spectateId: string | null = null;
/** The players I could be watching, in seat order. */
function spectatable(lobby: Lobby, p: Player): Player[] {
  if (lobby.phase !== PH_PLAY || !p.holed) return [];
  return lobbyPlayers(lobby.id).filter(q => !q.holed && !isMe(q.identity)).sort((a, b) => a.seat - b.seat);
}
function spectateCycle(dir: number) {
  const lobby = myLobby(); const p = me();
  if (!lobby || !p) return;
  const list = spectatable(lobby, p);
  if (!list.length) return;
  const i = list.findIndex(q => q.identity.toHexString() === spectateId);
  const next = list[((i < 0 ? 0 : i + dir) + list.length) % list.length];
  spectateId = next.identity.toHexString();
  sfx.ui();
}
function updateDrag(e: PointerEvent) {
  const r = dragAim(e.clientX - drag.x0, e.clientY - drag.y0, drag.basis, canvasCssSize().h, drag.angle);
  drag.angle = r.angle;
  drag.power = r.power;
}
const kbPower = () => { const t = (performance.now() - kbAim.chargeStart) / 1200; const k = t % 2; return k < 1 ? k : 2 - k; };

window.addEventListener('keydown', e => {
  if (editorIsOpen()) return;
  const tag = (e.target as HTMLElement)?.tagName;
  const inInput = tag === 'INPUT' || tag === 'TEXTAREA';
  if (e.key === 'Escape') {
    if (inInput) { (e.target as HTMLElement).blur(); $('chat-input').classList.remove('open'); return; }
    if (drag.active) { cancelDrag(); return; }
    for (const m of ['settings-modal', 'mine-modal', 'scores-modal']) if (!$(m).classList.contains('hidden')) { modal(m, false); return; }
    if (overlayTarget === null) { $('match-menu').classList.toggle('hidden'); renderMatchMenu(); }
    return;
  }
  if (inInput) return;
  if (e.key === 'g' || e.key === 'G') { modal('settings-modal', !$('settings-modal').classList.contains('hidden') ? false : true); return; }
  if (e.key === 'f' || e.key === 'F') { toggleFullscreen(); return; }
  if (e.key === 'm' || e.key === 'M') { setMuted(!isMuted()); notify(isMuted() ? 'MUTED' : 'SOUND ON'); return; }
  if (overlayTarget !== null) return;
  if (e.key === 'Enter') { const ci = $('chat-input'); ci.classList.add('open'); ci.focus(); unreadChat = 0; e.preventDefault(); return; }
  if (e.key === 'Tab') { e.preventDefault(); const open = $('scores-modal').classList.contains('hidden'); modal('scores-modal', open); if (open) renderScorecard('scores-table'); return; }
  if (e.key >= '1' && e.key <= '6') { rd().sendEmote({ index: Number(e.key) - 1 }); return; }
  // R: back to the tee · U: back to where the last shot was played from
  if (e.key === 'r' || e.key === 'R') { predicted = null; rd().resetBall({}); return; }
  if (e.key === 'u' || e.key === 'U') { predicted = null; rd().undoShot({}); return; }
  if (e.key === 'c' || e.key === 'C') { camOverview = !camOverview; return; }
  if (e.key === 'Shift') held.fine = true;
  if (spectateId) {
    // holed out: the aim keys pick who to watch instead
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { spectateCycle(-1); e.preventDefault(); return; }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { spectateCycle(1); e.preventDefault(); return; }
  }
  if (!canShoot()) return;
  // held keys turn the aim at a steady rate (integrated in the frame loop)
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { held.left = true; kbAim.active = true; e.preventDefault(); }
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { held.right = true; kbAim.active = true; e.preventDefault(); }
  if (e.key === ' ' && !kbAim.charging) { kbAim.active = true; kbAim.charging = true; kbAim.chargeStart = performance.now(); e.preventDefault(); }
});
window.addEventListener('keyup', e => {
  if (e.key === 'Shift') held.fine = false;
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') held.left = false;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') held.right = false;
  if (overlayTarget !== null || editorIsOpen()) return;
  if (e.key === ' ' && kbAim.charging) {
    kbAim.charging = false;
    const power = kbPower();
    if (canShoot() && power > 0.03) fire(kbAim.angle, power);
  }
});
window.addEventListener('blur', () => { held.left = held.right = held.fine = false; });
$('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') { sendChatFrom('chat-input'); $('chat-input').classList.remove('open'); $('chat-input').blur(); }
});
$('mm-resume').onclick = () => modal('match-menu', false);
$('mm-scores').onclick = () => { modal('match-menu', false); modal('scores-modal', true); renderScorecard('scores-table'); };
$('mm-settings').onclick = () => modal('settings-modal', true);
$('mm-leave').onclick = () => { modal('match-menu', false); rd().leaveLobby({}); intent = null; resetScene(); showOverlay('menu'); };
$('scores-close').onclick = () => modal('scores-modal', false);
$('again-btn').onclick = () => rd().playAgain({});
$('exit-btn').onclick = () => { rd().leaveLobby({}); intent = null; resetScene(); showOverlay('menu'); };

// ---------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------
let lastFrame = performance.now();
let lastTimerShown = -1;
const headAnnos = new Map<string, HTMLElement>();
const emptyScene: GolfScene = { hole: null, holeKey: '', t: 0, players: [], aim: null, cam: 'overview', meId: null };

function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (editorIsOpen()) return;
  const lobby = subscribed ? myLobby() : undefined;
  const p = subscribed ? me() : undefined;
  if (!lobby || !p || lobby.status === L_OPEN) {
    // behind the menus: the lawn idles; behind the lobby the round's holes
    // drift past under the blur, a slow fly-by that moves on every so often
    for (const el of headAnnos.values()) el.style.visibility = 'hidden';
    const rows = lobby && lobby.status === L_OPEN ? holeRows(lobby.courseId) : [];
    if (rows.length) {
      const row = rows[Math.floor(now / 14000) % rows.length];
      const hole = parsedHole(row);
      if (hole) { drawScene({ hole, holeKey: `preview:${row.id}`, t: now / 1000, players: [], aim: null, cam: 'preview', meId: null }); return; }
    }
    drawScene(emptyScene);
    return;
  }
  if (lobby.holeId.toString() !== gameHoleKey) {
    gameHoleKey = lobby.holeId.toString();
    gameHoleObj = currentHole(lobby);
    camOverview = false;
    spectateId = null;
    tLocal = lobby.holeTick / TICK_HZ;
  }
  if (!gameHoleObj) { gameHoleObj = currentHole(lobby); if (!gameHoleObj) subscribeCourse(lobby.courseId); }
  const hole = gameHoleObj;
  const players = lobbyPlayers(lobby.id);
  // mover clock: free-running, nudged toward the server's tick
  const tServer = lobby.holeTick / TICK_HZ;
  tLocal += dt;
  if (lobby.phase !== PH_PLAY) tLocal = tServer;
  else tLocal += (tServer - tLocal) * 0.1;

  const shootable = canShoot();
  if (shootable && !drag.active && (held.left || held.right)) {
    const rate = held.fine ? KB_TURN_RATE_FINE : KB_TURN_RATE;
    kbAim.angle += ((held.right ? 1 : 0) - (held.left ? 1 : 0)) * rate * dt;
  }
  if (drag.active) drag.shown = smoothAngle(drag.shown, drag.angle, dt);
  const aiming = shootable && (drag.active || kbAim.active);
  const aimAngle = drag.active ? drag.shown : kbAim.angle;
  const aimPower = drag.active ? drag.power : kbAim.charging ? kbPower() : 0.35;

  // prediction: step my ball locally with the shared physics until the
  // server row carrying this shot arrives (or it has clearly been lost)
  if (predicted && hole) {
    if (p.shotSeq >= predicted.shotSeq || now - predicted.startedAt > 2000 || lobby.phase !== PH_PLAY) predicted = null;
    else {
      const geom = geomOf(hole);
      predicted.acc += dt;
      let guard = 0;
      while (predicted.acc >= DT && guard++ < 6) {
        predicted.acc -= DT; predicted.t += DT;
        const ev = newEvents();
        stepBall(predicted.ball, geom, predicted.t, ev);
        if (ev.holed || ev.water || ev.oob || ev.tele) { predicted.startedAt = -1e9; break; } // let the server tell it
      }
    }
  }
  const scenePlayers: GolfPlayer[] = [];
  for (const q of players) {
    const d = dispOf(q);
    const mine = isMe(q.identity);
    const age = Math.min(0.15, (now - d.at) / 1000);
    let tx = d.sx + d.svx * age, ty = d.sy + d.svy * age, tz = Math.max(0, d.sz + d.svz * age);
    if (mine && predicted && predicted.startedAt > 0) { const b = predicted.ball; tx = b.x + b.vx * predicted.acc; ty = b.y + b.vy * predicted.acc; tz = Math.max(0, b.z + b.vz * predicted.acc); }
    const k = 1 - Math.exp(-dt * (mine && predicted ? 40 : 22));
    d.x += (tx - d.x) * k; d.y += (ty - d.y) * k; d.z += (tz - d.z) * k;
    const pv = mine && predicted && predicted.startedAt > 0 ? predicted.ball : null;
    const speed = pv ? Math.hypot(pv.vx, pv.vy) : Math.hypot(q.vx, q.vy);
    if (mine && aiming) d.facing = aimAngle;
    else if (pv && speed > 1.5) d.facing = Math.atan2(pv.vy, pv.vx);
    else if (speed > 1.5) d.facing = Math.atan2(q.vy, q.vx);
    else if (q.resting && hole && !q.holed) {
      // set up toward the cup once the ball has stopped (keep the shot facing briefly)
      const toCup = Math.atan2(hole.cup.y - q.y, hole.cup.x - q.x);
      d.facing = toCup;
    }
    scenePlayers.push({
      id: q.identity.toHexString(), name: q.name, characterId: q.characterId,
      color: parseInt(COLORS[q.color].slice(1), 16),
      x: d.x, y: d.y, z: d.z, vx: pv ? pv.vx : q.vx, vy: pv ? pv.vy : q.vy, resting: pv ? false : q.resting, holed: q.holed,
      ghost: q.strokes === 0 && !mine && lobby.collisions, me: mine, facing: d.facing,
      shotSeq: mine && predicted ? Math.max(q.shotSeq, predicted.shotSeq) : q.shotSeq, shotPower: mine && predicted ? predicted.power : q.eventPower,
      emote: d.emoteUntil > now ? d.emote : undefined,
      seat: q.seat,
    });
  }
  // holed out: ride along with someone still playing (a rolling ball first,
  // then whoever is online) until there is nobody left — then orbit the cup
  const watchable = spectatable(lobby, p);
  if (!watchable.length) spectateId = null;
  else if (!spectateId || !watchable.some(q => q.identity.toHexString() === spectateId)) {
    const pick = watchable.find(q => !q.resting && q.online) ?? watchable.find(q => q.online) ?? watchable[0];
    spectateId = pick.identity.toHexString();
  }
  const cam: GolfScene['cam'] = lobby.phase === PH_INTRO ? 'overview' : lobby.phase === PH_RESULTS ? 'cup' : lobby.phase === PH_FINAL ? 'overview'
    : camOverview ? 'overview' : p.holed ? (spectateId ? 'play' : 'cup') : 'play';
  drawScene({
    hole, holeKey: hole ? gameHoleKey : '', t: tLocal, players: scenePlayers,
    aim: aiming && hole ? { angle: aimAngle, power: aimPower, lockCam: drag.active } : null,
    cam, meId: spectateId ?? p.identity.toHexString(),
  });
  if (kbAim.active && !drag.active) kbAim.active = kbAim.charging || kbAim.active; // stays until the shot
  if (overlayTarget === null) renderHud(lobby, p, players, hole, now, aiming, aimPower);
}

function renderHud(lobby: Lobby, p: Player, players: Player[], hole: Hole | null, now: number, aiming: boolean, aimPower: number) {
  $('hud-me-name').textContent = p.name;
  $('hud-me-char').textContent = charOf(p).name;
  $('hud-me-strokes').textContent = p.holed ? '⛳' : String(p.strokes);
  const played = parThrough(lobby, p.holeScores.length - 1);
  $('hud-me-total').textContent = p.holeScores.length ? relPar(p.total - played) : 'E';
  ($('hud-power-fill') as HTMLElement).style.width = aiming ? `${Math.round(aimPower * 100)}%` : '0%';
  $('hud-hole-name').textContent = hole ? hole.name.toUpperCase() : 'LOADING';
  $('hud-hole-par').textContent = hole ? `PAR ${hole.par}` : '';
  $('hud-hole-n').textContent = `${lobby.holeIndex + 1}/${lobby.holeCount}`;
  const secs = lobby.phase === PH_PLAY ? Math.ceil(lobby.phaseTicks / TICK_HZ) : lobby.holeSecs;
  ($('hud-time-fill') as HTMLElement).style.width = `${Math.round((secs / lobby.holeSecs) * 100)}%`;
  if (secs !== lastTimerShown) {
    lastTimerShown = secs;
    $('hud-timer').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const cd = $('countdown');
    if (lobby.phase === PH_PLAY && secs <= 5 && secs > 0 && !p.holed) { cd.textContent = String(secs); cd.classList.remove('pop'); void cd.offsetWidth; cd.classList.add('pop'); sfx.tick(); }
    else cd.textContent = '';
  }
  // leaderboard
  const rankedAll = [...players].sort((a, b) => a.total - b.total || a.seat - b.seat);
  const ranked = rankedAll.slice(0, 8);
  if (!ranked.some(q => isMe(q.identity))) { const mine = rankedAll.find(q => isMe(q.identity)); if (mine) ranked.push(mine); }
  const html = ranked.map(q => {
    const cur = q.holed ? `${q.holeScores[lobby.holeIndex] ?? q.strokes}` : `${q.strokes}`;
    const tot = q.holeScores.length ? relPar(q.total - parThrough(lobby, q.holeScores.length - 1)) : '—';
    return `<div class="r${q.holed ? ' done' : ''}${isMe(q.identity) ? ' me' : ''}"><span class="dot" style="background:${COLORS[q.color]}"></span><span class="nm">${esc(q.name)}${q.online ? '' : ' 💤'}</span><span class="sc">${q.holed ? '⛳' : ''}${cur} · ${tot}</span></div>`;
  }).join('');
  const board = $('board');
  const more = rankedAll.length - ranked.length;
  const boardHtml = html + (more > 0 ? `<div class="r"><span class="nm" style="color:var(--dim)">+${more} MORE · TAB</span></div>` : '');
  if (board.innerHTML !== boardHtml) board.innerHTML = boardHtml;
  const watching = spectateId ? players.find(q => q.identity.toHexString() === spectateId) : undefined;
  const chip = $('spectate-chip');
  chip.classList.toggle('hidden', !watching);
  if (watching) { const label = `👁 WATCHING ${watching.name.toUpperCase()}`; if (chip.textContent !== label) chip.textContent = label; }
  $('help').textContent = !hole ? 'LOADING THE HOLE…' : p.holed ? (watching ? `IN THE HOLE — WATCHING ${watching.name.toUpperCase()} · ←/→ SWITCH PLAYER · 1-6 EMOTE · C OVERVIEW · RIGHT-DRAG LOOK · TAB SCORECARD` : 'IN THE HOLE — WAITING FOR THE OTHERS · 1-6 EMOTE') : lobby.phase === PH_PLAY
    ? (p.resting && !predicted ? (p.strokes >= lobby.maxStrokes ? 'OUT OF STROKES' : 'PRESS AND PULL BACK · RELEASE TO PUTT · RIGHT-CLICK OR ESC CANCELS · ←/→ AIM · R TEE · U REDO SHOT · RIGHT-DRAG LOOK · WHEEL ZOOM · C OVERVIEW · TAB SCORECARD · ENTER CHAT · ESC MENU') : 'ROLLING… · DRAG TO LOOK AROUND')
    : '';
  // name tags + emotes above the other balls
  const seen = new Set<string>();
  for (const q of players) {
    const key = q.identity.toHexString();
    seen.add(key);
    let el = headAnnos.get(key);
    if (!el) { el = document.createElement('div'); el.className = 'head-anno'; el.innerHTML = '<span class="name-tag"></span><span class="emote-pop"></span>'; $('head-annos').appendChild(el); headAnnos.set(key, el); }
    const d = dispOf(q);
    const pos = q.holed ? headScreenPos(key) : ballScreenPos(key);
    if (!pos) { el.style.visibility = 'hidden'; continue; }
    el.style.visibility = 'visible';
    el.style.left = `${pos.x}px`; el.style.top = `${pos.y}px`;
    const tag = el.querySelector('.name-tag') as HTMLElement;
    tag.textContent = isMe(q.identity) ? '' : q.name;
    tag.style.display = isMe(q.identity) ? 'none' : '';
    const pop = el.querySelector('.emote-pop') as HTMLElement;
    const showEmote = d.emoteUntil > now;
    pop.textContent = showEmote ? d.emote : '';
    pop.classList.toggle('show', showEmote);
  }
  for (const [key, el] of headAnnos) if (!seen.has(key)) { el.remove(); headAnnos.delete(key); }

  // phase overlays
  if (lobby.phase !== lastSeenPhase) {
    lastSeenPhase = lobby.phase;
    $('hole-intro').classList.toggle('hidden', lobby.phase !== PH_INTRO);
    modal('results-card', lobby.phase === PH_RESULTS);
    if (lobby.phase === PH_INTRO && hole) {
      $('hi-round').textContent = `HOLE ${lobby.holeIndex + 1} OF ${lobby.holeCount}`;
      $('hi-name').textContent = hole.name.toUpperCase();
      $('hi-par').textContent = `PAR ${hole.par} · MAX ${lobby.maxStrokes}`;
      $('hi-tip').textContent = hole.tip ?? '';
      sfx.ui();
    }
    if (lobby.phase === PH_PLAY) { kbAim.angle = hole ? Math.atan2(hole.cup.y - p.y, hole.cup.x - p.x) : 0; kbAim.active = false; }
    if (lobby.phase === PH_RESULTS) { $('results-title').textContent = `HOLE ${lobby.holeIndex + 1} · ${hole?.name.toUpperCase() ?? ''}`; renderScorecard('results-table'); }
  }
  if (lobby.phase === PH_RESULTS) {
    $('results-next').textContent = lobby.holeIndex + 1 < lobby.holeCount ? `NEXT HOLE IN ${Math.ceil(lobby.phaseTicks / TICK_HZ)}…` : `FINAL RESULTS IN ${Math.ceil(lobby.phaseTicks / TICK_HZ)}…`;
    renderScorecard('results-table');
  }
}

function parThrough(lobby: Lobby, holeIndex: number): number {
  const rows = holeRows(lobby.courseId);
  let s = 0;
  for (let i = 0; i <= holeIndex && i < rows.length; i++) s += rows[i].par;
  return s;
}

function renderScorecard(targetId: string) {
  const lobby = myLobby(); if (!lobby) return;
  const rows = holeRows(lobby.courseId);
  const players = lobbyPlayers(lobby.id).sort((a, b) => a.total - b.total || a.finishedTick - b.finishedTick);
  const n = Math.max(rows.length, lobby.holeCount);
  let html = '<table class="score"><tr><th class="name">Golfer</th>';
  for (let i = 0; i < n; i++) html += `<th${i === lobby.holeIndex ? ' style="color:var(--gold)"' : ''}>${i + 1}</th>`;
  html += '<th>Tot</th><th>±</th></tr><tr><td class="name" style="color:var(--dim)">Par</td>';
  let parTot = 0;
  for (let i = 0; i < n; i++) { const par = rows[i]?.par ?? 0; parTot += par; html += `<td style="color:var(--dim)">${par || '·'}</td>`; }
  html += `<td style="color:var(--dim)">${parTot}</td><td></td></tr>`;
  for (const q of players) {
    html += `<tr${isMe(q.identity) ? ' class="me"' : ''}><td class="name"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${COLORS[q.color]};margin-right:6px"></span>${esc(q.name)}</td>`;
    let played = 0;
    for (let i = 0; i < n; i++) {
      const sc = q.holeScores[i];
      if (sc === undefined) { html += `<td>${i === lobby.holeIndex && lobby.phase === PH_PLAY ? `<span class="even">${q.strokes || ''}</span>` : ''}</td>`; continue; }
      played += rows[i]?.par ?? 0;
      const d = sc - (rows[i]?.par ?? 3);
      html += `<td class="${relClass(d)}">${sc}${sc === 1 ? '★' : ''}</td>`;
    }
    html += `<td class="tot">${q.total}</td><td class="${relClass(q.total - played)}">${q.holeScores.length ? relPar(q.total - played) : ''}</td></tr>`;
  }
  html += '</table>';
  const el = $(targetId);
  if (el.innerHTML !== html) el.innerHTML = html;
}

function renderGameOver() {
  const lobby = myLobby(); const p = me();
  if (!lobby || !p) return;
  const players = lobbyPlayers(lobby.id);
  const ranked = [...players].sort((a, b) => a.total - b.total || a.finishedTick - b.finishedTick);
  const winner = ranked[0];
  $('gameover-title').textContent = winner && isMe(winner.identity) && ranked.length > 1 ? 'YOU WIN!' : 'ROUND COMPLETE';
  $('gameover-score').textContent = winner ? `${winner.name.toUpperCase()} TAKES ${lobby.courseName.toUpperCase()} · ${winner.total} STROKES` : '';
  const crowns = $('crowns');
  crowns.innerHTML = ranked.slice(0, 3).map((q, i) => `<div class="crown-card"><div class="c-label">${['🥇 CHAMPION', '🥈 SECOND', '🥉 THIRD'][i]}</div><div class="c-name">${esc(q.name)}</div><div class="c-sub">${charOf(q).name} · ${q.total} STROKES</div></div>`).join('');
  crowns.classList.toggle('hidden', !ranked.length);
  renderScorecard('match-summary');
  $('match-summary').classList.remove('hidden');
  const host = lobby.hostId.isEqual(p.identity);
  $('again-btn').classList.toggle('hidden', !host);
  if (lobby.phase === PH_FINAL && lastSeenPhase !== PH_FINAL) { lastSeenPhase = PH_FINAL; sfx.fanfare(); }
}

// ---------------------------------------------------------------------------
// Settings (graphics + sound) — the tennis options panel
// ---------------------------------------------------------------------------
interface GfxOption { label: string; value: number | boolean }
const ON_OFF: GfxOption[] = [{ label: 'ON', value: true }, { label: 'OFF', value: false }];
const GFX_ROWS: { key: keyof GraphicsSettings; name: string; hint: string; opts: GfxOption[] }[] = [
  { key: 'resolution', name: 'RESOLUTION', hint: 'internal render scale — the biggest win', opts: [{ label: '100%', value: 1 }, { label: '75%', value: 0.75 }, { label: '50%', value: 0.5 }] },
  { key: 'shadows', name: 'SHADOWS', hint: 'sun shadow map', opts: [{ label: 'HIGH', value: 2 }, { label: 'LOW', value: 1 }, { label: 'OFF', value: 0 }] },
  { key: 'antialias', name: 'ANTI-ALIASING', hint: 'smooth edges (MSAA + SMAA)', opts: ON_OFF },
  { key: 'ao', name: 'AMBIENT OCCLUSION', hint: 'contact shade under balls and along walls — costs fill rate', opts: ON_OFF },
  { key: 'bloom', name: 'BLOOM', hint: 'glow on lasers, portals and the aim arrow', opts: ON_OFF },
  { key: 'particles', name: 'PARTICLES', hint: 'impact sparks and splashes', opts: ON_OFF },
  { key: 'detail', name: 'GRASS DETAIL', hint: 'fine grain on the lawn', opts: ON_OFF },
  { key: 'grade', name: 'FILM GRADE', hint: 'filmic tone curve and color punch (off = neutral)', opts: ON_OFF },
  { key: 'vhs', name: 'VHS FILTER', hint: 'retro scanlines, flicker and tracking band', opts: ON_OFF },
  { key: 'fpsCap', name: 'FPS LIMIT', hint: 'caps GPU work — the game ticks at 30Hz anyway', opts: [{ label: 'MAX', value: 0 }, { label: '120', value: 120 }, { label: '60', value: 60 }, { label: '30', value: 30 }] },
];
const GFX_PRESETS: { label: string; value: PresetName }[] = [{ label: 'HIGH', value: 'high' }, { label: 'MEDIUM', value: 'medium' }, { label: 'LOW', value: 'low' }];
function gfxRow(parent: HTMLElement, name: string, hint: string): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'gfx-row';
  const label = document.createElement('div');
  label.className = 'gfx-name';
  label.textContent = name;
  const sub = document.createElement('div');
  sub.className = 'gfx-hint';
  sub.textContent = hint;
  label.appendChild(sub);
  const opts = document.createElement('div');
  opts.className = 'gfx-opts';
  row.append(label, opts);
  parent.appendChild(row);
  return opts;
}
function buildGfxPanel() {
  const rows = $('gfx-rows');
  rows.innerHTML = '';
  const g = getGraphics();
  const presetOpts = gfxRow(rows, 'PRESET', 'one click for the whole set');
  for (const pr of GFX_PRESETS) {
    const b = document.createElement('button');
    b.className = 'gfx-opt' + (presetOf(g) === pr.value ? ' selected' : '');
    b.textContent = pr.label;
    b.onclick = () => { applyPreset(pr.value); buildGfxPanel(); };
    presetOpts.appendChild(b);
  }
  for (const r of GFX_ROWS) {
    const opts = gfxRow(rows, r.name, r.hint);
    for (const o of r.opts) {
      const b = document.createElement('button');
      b.className = 'gfx-opt' + (g[r.key] === o.value ? ' selected' : '');
      b.textContent = o.label;
      b.onclick = () => { setGraphics({ [r.key]: o.value } as any); buildGfxPanel(); };
      opts.appendChild(b);
    }
  }
  const snd = gfxRow(rows, 'SOUND', 'putts, bumpers, splashes, jingles (M)');
  for (const on of [true, false]) {
    const b = document.createElement('button');
    b.className = 'gfx-opt' + (isMuted() !== on ? ' selected' : '');
    b.textContent = on ? 'ON' : 'OFF';
    b.onclick = () => { setMuted(!on); buildGfxPanel(); };
    snd.appendChild(b);
  }
  const fs = gfxRow(rows, 'FULLSCREEN', 'fill the whole screen (F)');
  for (const on of [true, false]) {
    const b = document.createElement('button');
    b.className = 'gfx-opt' + (!!document.fullscreenElement === on ? ' selected' : '');
    b.textContent = on ? 'ON' : 'OFF';
    b.onclick = () => { if (!!document.fullscreenElement !== on) toggleFullscreen(); setTimeout(buildGfxPanel, 300); };
    fs.appendChild(b);
  }
  $('vhs').classList.toggle('hidden', !g.vhs);
}
onGraphicsChange(() => buildGfxPanel());
$('settings-close').onclick = () => modal('settings-modal', false);
buildGfxPanel();

buildCharGrid();
requestAnimationFrame(frame);
connect();
