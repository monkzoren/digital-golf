// Digital Golf client: connection, menus, the room, the game loop and HUD.
// The server owns the world; this file sends intent (shots, chat, settings)
// and renders rows. The course editor lives in editor.ts.
import { DbConnection } from './module_bindings';
import type { Player, Lobby, Course, Hole as HoleRow, Chat } from './module_bindings/types';
import type { Identity } from 'spacetimedb';
import type { Hole } from '@shared/courses';
import { parseHole } from '@shared/mapformat';
import {
  type BallState, BALL_R, TICK_HZ, geomOf, newEvents, shotVelocity, stepBall,
} from '@shared/physics';
import {
  COLORS, COLOR_NAMES, DATABASE_NAME, EMOTES, EV, L_FINISHED, L_OPEN, L_RUNNING, MAX_PLAYERS,
  PH_FINAL, PH_INTRO, PH_PLAY, PH_RESULTS, SPACETIMEDB_URI,
} from './config';
import { type Camera, Particles, drawAim, drawBall, drawHole, fitCamera, s2w, themeFor, w2s } from './render';
import { isMuted, setMuted, sfx, unlockAudio } from './audio';
import { openEditor, closeEditor, editorIsOpen } from './editor';

declare const __BUILD_ID__: string;

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const screens = ['connecting', 'name-modal', 'menu', 'profile-modal', 'picker', 'room', 'game', 'editor', 'mine-modal'] as const;
type Screen = (typeof screens)[number];
let currentScreen: Screen = 'connecting';
function show(id: Screen) {
  for (const s of screens) $(s).classList.toggle('hidden', s !== id);
  currentScreen = id;
  if (id === 'game') resizeCanvas();
}
function toast(msg: string, error = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (error ? ' error' : '');
  el.textContent = msg;
  $('toasts').appendChild(el);
  if (error) sfx.error();
  setTimeout(() => el.remove(), 3200);
}
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
$('build-id').textContent = `build ${__BUILD_ID__.slice(0, 16)} · db ${DATABASE_NAME}`;

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
  conn = DbConnection.builder()
    .withUri(SPACETIMEDB_URI)
    .withDatabaseName(DATABASE_NAME)
    .withToken(token)
    .onDisconnect(() => {
      if (gen !== connectGen) return;
      subscribed = false;
      $('connecting-sub').textContent = 'CONNECTION LOST — RECONNECTING…';
      show('connecting');
      scheduleReconnect();
    })
    .onConnect((_c, identity, tok) => {
      console.log('[dg] connected as', identity.toHexString());
      if (gen !== connectGen) return;
      myIdentity = identity;
      store.set('dg_token', tok);
      conn.subscriptionBuilder()
        .onApplied(() => {
          console.log('[dg] subscription applied');
          subscribed = true;
          try { onSubscribed(); } catch (e) { console.error('[dg] onSubscribed threw', e); }
        })
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
      show('connecting');
      scheduleReconnect();
    })
    .build();
  (window as any).__dg = { get conn() { return conn; } };
}

/** Reducer calls that surface a rejection (SenderError) as a toast. */
const errMsg = (e: unknown) => String((e as any)?.message ?? e).replace(/^.*?SenderError:?\s*/i, '');
function rd(): typeof conn.reducers {
  return new Proxy({} as any, {
    get: (_t, k: string) => (args: any) => (conn.reducers as any)[k](args ?? {}).catch((e: unknown) => toast(errMsg(e), true)),
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
  if (holeSubs.size > 6) {
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

// ---------------------------------------------------------------------------
// Boot / name gate
// ---------------------------------------------------------------------------
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
  const storedColor = store.get('dg_color');
  if (storedColor !== null && Number(storedColor) !== p.color && p.lobbyId === 0n) {
    rd().setColor({ color: Number(storedColor) });
  }
  if (!p.name && !stored) { show('name-modal'); renderSwatches('name-swatches', p.color); return; }
  if (pendingJoin) { const c = pendingJoin; pendingJoin = null; rd().joinLobby({ code: c }); }
  route();
}

function route() {
  if (editorIsOpen()) return;
  const p = me();
  if (!p || (!p.name && !(store.get('dg_name') ?? '').trim())) return; // the name gate owns the screen
  const lobby = myLobby();
  if (!lobby) { if (currentScreen !== 'menu' && currentScreen !== 'profile-modal' && currentScreen !== 'picker' && currentScreen !== 'mine-modal') show('menu'); renderMenu(); return; }
  if (lobby.status === L_OPEN) {
    const changingCourse = currentScreen === 'picker' && pickerMode === 'change';
    if (currentScreen !== 'room' && !changingCourse) show('room');
    renderRoom();
    return;
  }
  if (currentScreen !== 'game') { show('game'); enterGame(); }
}

let selectedNameColor = 0;
function renderSwatches(id: string, selected: number, taken: Set<number> = new Set(), onPick?: (c: number) => void) {
  const el = $(id);
  el.innerHTML = '';
  COLORS.forEach((c, i) => {
    const s = document.createElement('div');
    s.className = 'swatch' + (i === selected ? ' selected' : '') + (taken.has(i) ? ' taken' : '');
    s.style.background = c;
    s.title = COLOR_NAMES[i];
    s.onclick = () => { if (taken.has(i)) return; (onPick ?? ((n: number) => { selectedNameColor = n; renderSwatches(id, n, taken, onPick); }))(i); };
    el.appendChild(s);
  });
  if (!onPick) selectedNameColor = selected;
}

$('name-form').onsubmit = e => {
  e.preventDefault();
  unlockAudio();
  const name = ($('name-input') as HTMLInputElement).value.trim().slice(0, 16);
  if (!name) return;
  store.set('dg_name', name);
  store.set('dg_color', String(selectedNameColor));
  rd().setName({ name });
  rd().setColor({ color: selectedNameColor });
  sfx.ui();
  if (pendingJoin) { const c = pendingJoin; pendingJoin = null; rd().joinLobby({ code: c }); }
  show('menu');
  renderMenu();
};

// profile
$('account-chip').onclick = () => {
  const p = me();
  if (!p) return;
  ($('profile-name') as HTMLInputElement).value = p.name;
  ($('profile-mute') as HTMLInputElement).checked = isMuted();
  let pick = p.color;
  renderSwatches('profile-swatches', p.color, new Set(), c => { pick = c; renderSwatches('profile-swatches', c, new Set(), undefined); (window as any).__pick = c; });
  (window as any).__pick = pick;
  show('profile-modal');
};
$('profile-cancel').onclick = () => { show('menu'); };
$('profile-form').onsubmit = e => {
  e.preventDefault();
  const name = ($('profile-name') as HTMLInputElement).value.trim().slice(0, 16);
  if (name) { rd().setName({ name }); store.set('dg_name', name); }
  const pick = Number((window as any).__pick ?? me()?.color ?? 0);
  store.set('dg_color', String(pick));
  rd().setColor({ color: pick });
  setMuted(($('profile-mute') as HTMLInputElement).checked);
  show('menu');
  renderMenu();
};

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
function renderMenu() {
  const p = me();
  if (!p) return;
  $('account-name').textContent = p.name || 'GUEST';
  $('account-dot').style.background = COLORS[p.color] ?? '#fff';
  const pub = $('public-list'), live = $('live-list');
  pub.innerHTML = ''; live.innerHTML = '';
  let nPub = 0, nLive = 0;
  const lobbies = [...conn.db.lobby.iter()].filter(l => l.isPublic).sort((a, b) => (a.id < b.id ? 1 : -1));
  for (const l of lobbies) {
    const players = lobbyPlayers(l.id);
    const host = players.find(x => x.identity.isEqual(l.hostId));
    const item = document.createElement('div');
    item.className = 'item';
    if (l.status === L_OPEN) {
      nPub++;
      item.innerHTML = `<span class="dot" style="background:${COLORS[host?.color ?? 0]}"></span><div class="grow"><div class="name">${esc(l.courseName)}</div><div class="tiny">HOST ${esc(host?.name ?? '?')} · ${l.holeCount} HOLES</div></div><span class="pill">${players.length}/${MAX_PLAYERS}</span>`;
      item.onclick = () => rd().joinLobby({ code: l.code });
      pub.appendChild(item);
    } else if (l.status === L_RUNNING) {
      nLive++;
      const names = players.map(x => esc(x.name)).join(', ');
      item.innerHTML = `<div class="grow"><div class="name">${esc(l.courseName)} <span class="pill lime">HOLE ${l.holeIndex + 1}/${l.holeCount}</span></div><div class="tiny">${names}</div></div><span class="pill">${players.length}/${MAX_PLAYERS}</span>`;
      item.title = 'Join mid-round';
      item.onclick = () => rd().joinLobby({ code: l.code });
      live.appendChild(item);
    }
  }
  if (!nPub) pub.innerHTML = '<div class="empty">No public rooms right now — host one!</div>';
  if (!nLive) live.innerHTML = '<div class="empty">Nobody is on the course.</div>';
}

$('btn-new').onclick = () => { unlockAudio(); openPicker('create'); };
$('join-form').onsubmit = e => {
  e.preventDefault();
  unlockAudio();
  const code = ($('join-input') as HTMLInputElement).value.trim().toUpperCase();
  if (code.length !== 5) { toast('Room codes are 5 letters', true); return; }
  rd().joinLobby({ code });
};
$('btn-editor').onclick = () => { unlockAudio(); openMine(); };

// ---------------------------------------------------------------------------
// Course picker
// ---------------------------------------------------------------------------
let pickerMode: 'create' | 'change' = 'create';
let pickerTab: 'featured' | 'community' | 'mine' = 'featured';
let pickerSelected: bigint | null = null;

function openPicker(mode: 'create' | 'change') {
  pickerMode = mode;
  pickerSelected = null;
  $('picker-title').textContent = mode === 'create' ? 'Pick a course' : 'Change course';
  $('picker-public-wrap').classList.toggle('hidden', mode !== 'create');
  ($('picker-go') as HTMLButtonElement).textContent = mode === 'create' ? 'Create room' : 'Use this course';
  show('picker');
  renderPicker();
}
function pickerCourses(): Course[] {
  const all: Course[] = [];
  for (const c of conn.db.course.iter()) all.push(c);
  const mine: Course[] = [];
  for (const c of conn.db.myCourses.iter()) mine.push(c as unknown as Course);
  if (pickerTab === 'featured') return all.filter(c => c.builtin).sort((a, b) => (a.id < b.id ? -1 : 1));
  if (pickerTab === 'community') return all.filter(c => !c.builtin && c.published).sort((a, b) => b.plays - a.plays || (a.id < b.id ? 1 : -1));
  return mine.sort((a, b) => (a.id < b.id ? 1 : -1));
}
function renderPicker() {
  document.querySelectorAll('#picker-tabs button').forEach(b => b.classList.toggle('active', (b as HTMLElement).dataset.tab === pickerTab));
  const list = $('picker-list');
  list.innerHTML = '';
  const rows = pickerCourses();
  if (!rows.length) {
    list.innerHTML = `<div class="empty">${pickerTab === 'mine' ? 'You have no courses yet — open the Course Editor.' : 'Nothing here yet. Be the first to publish a course!'}</div>`;
  }
  for (const c of rows) {
    const item = document.createElement('div');
    item.className = 'item' + (pickerSelected === c.id ? ' selected' : '');
    item.innerHTML = `<div class="grow"><div class="name">${esc(c.name)} ${c.builtin ? '<span class="pill gold">FEATURED</span>' : ''}${!c.published ? '<span class="pill">DRAFT</span>' : ''}</div><div class="tiny">BY ${esc(c.authorName)} · ${c.holeCount} HOLES · PAR ${c.totalPar} · ${c.plays} PLAYS</div></div>`;
    item.onclick = () => { pickerSelected = c.id; sfx.ui(); renderPicker(); };
    list.appendChild(item);
  }
  ($('picker-go') as HTMLButtonElement).disabled = pickerSelected === null || !rows.some(c => c.id === pickerSelected && c.holeCount > 0);
}
document.querySelectorAll('#picker-tabs button').forEach(b => {
  (b as HTMLButtonElement).onclick = () => { pickerTab = (b as HTMLElement).dataset.tab as any; pickerSelected = null; renderPicker(); };
});
$('picker-close').onclick = () => { show(myLobby() ? 'room' : 'menu'); route(); };
$('picker-go').onclick = () => {
  if (pickerSelected === null) return;
  const isPublic = ($('picker-public') as HTMLInputElement).checked;
  if (pickerMode === 'create') {
    rd().createLobby({ courseId: pickerSelected, isPublic });
  } else {
    const l = myLobby();
    if (l) rd().setSettings({ courseId: pickerSelected, isPublic: l.isPublic, maxStrokes: l.maxStrokes, holeSecs: l.holeSecs, collisions: l.collisions });
    show('room');
  }
  sfx.ui();
};

// ---------------------------------------------------------------------------
// Room
// ---------------------------------------------------------------------------
let roomChatSeen = 0;
function renderRoom() {
  const lobby = myLobby();
  const p = me();
  if (!lobby || !p) return;
  subscribeCourse(lobby.courseId);
  const host = lobby.hostId.isEqual(p.identity);
  $('room-code').textContent = lobby.code;
  const players = lobbyPlayers(lobby.id);
  $('room-count').textContent = `${players.length}/${MAX_PLAYERS}`;
  $('room-public-pill').classList.toggle('hidden', !lobby.isPublic);
  const pl = $('room-players');
  pl.innerHTML = '';
  for (const q of players) {
    const d = document.createElement('div');
    d.className = 'p' + (isMe(q.identity) ? ' me' : '') + (q.online ? '' : ' offline');
    d.innerHTML = `<span class="dot" style="background:${COLORS[q.color]}"></span><span class="name">${esc(q.name)}</span>${q.identity.isEqual(lobby.hostId) ? '<span class="pill gold">HOST</span>' : ''}${q.online ? '' : '<span class="pill">AWAY</span>'}`;
    pl.appendChild(d);
  }
  const course = courseById(lobby.courseId);
  $('room-course-name').textContent = lobby.courseName;
  $('room-course-meta').textContent = `${lobby.holeCount} HOLES · PAR ${course?.totalPar ?? '?'} · BY ${course?.authorName ?? '?'}`;
  $('room-course-change').classList.toggle('hidden', !host);
  $('room-start').classList.toggle('hidden', !host);
  $('room-wait').classList.toggle('hidden', host);
  for (const id of ['set-strokes', 'set-time', 'set-collide', 'set-public']) ($(id) as HTMLInputElement).disabled = !host;
  if (document.activeElement?.id !== 'set-strokes') ($('set-strokes') as HTMLSelectElement).value = String(lobby.maxStrokes);
  if (document.activeElement?.id !== 'set-time') ($('set-time') as HTMLSelectElement).value = String(lobby.holeSecs);
  ($('set-collide') as HTMLInputElement).checked = lobby.collisions;
  ($('set-public') as HTMLInputElement).checked = lobby.isPublic;
  renderChat('room-chat-log', lobby.id);
}
function pushSettings() {
  const l = myLobby();
  if (!l) return;
  rd().setSettings({
    courseId: l.courseId,
    isPublic: ($('set-public') as HTMLInputElement).checked,
    maxStrokes: Number(($('set-strokes') as HTMLSelectElement).value),
    holeSecs: Number(($('set-time') as HTMLSelectElement).value),
    collisions: ($('set-collide') as HTMLInputElement).checked,
  });
}
for (const id of ['set-strokes', 'set-time', 'set-collide', 'set-public']) $(id).onchange = pushSettings;
$('room-course-change').onclick = () => openPicker('change');
$('room-start').onclick = () => { unlockAudio(); rd().startGame({}); };
$('room-leave').onclick = () => { rd().leaveLobby({}); show('menu'); renderMenu(); };
$('room-copy').onclick = async () => {
  const l = myLobby();
  if (!l) return;
  const url = `${location.origin}${location.pathname}?lobby=${l.code}`;
  try { await navigator.clipboard.writeText(url); toast('Invite link copied'); } catch { toast(url); }
};
function renderChat(logId: string, lobbyId: bigint) {
  const log = $(logId);
  const rows = lobbyChat(lobbyId);
  const html = rows.map(c => `<div><b style="color:${COLORS[c.color] ?? '#fff'}">${esc(c.name)}</b> ${esc(c.text)}</div>`).join('');
  if (log.innerHTML !== html) { log.innerHTML = html; log.scrollTop = log.scrollHeight; }
}
function sendChat(inputId: string) {
  const input = $(inputId) as HTMLInputElement;
  const text = input.value.trim();
  input.value = '';
  if (text) rd().sendChat({ text });
}
$('room-chat-form').onsubmit = e => { e.preventDefault(); sendChat('room-chat-input'); };
$('game-chat-form').onsubmit = e => { e.preventDefault(); sendChat('game-chat-input'); $('game-chat-input').blur(); };

// ---------------------------------------------------------------------------
// Editor entry (my courses)
// ---------------------------------------------------------------------------
function openMine() {
  show('mine-modal');
  renderMine();
}
function renderMine() {
  const list = $('mine-list');
  list.innerHTML = '';
  const mine = [...conn.db.myCourses.iter()].map(c => c as unknown as Course).sort((a, b) => (a.id < b.id ? 1 : -1));
  if (!mine.length) list.innerHTML = '<div class="empty">Nothing yet. Make something wild.</div>';
  for (const c of mine) {
    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = `<div class="grow"><div class="name">${esc(c.name)} ${c.published ? '<span class="pill lime">PUBLISHED</span>' : '<span class="pill">DRAFT</span>'}</div><div class="tiny">${c.holeCount} HOLES · PAR ${c.totalPar} · ${c.plays} PLAYS</div></div><button class="btn small danger" data-del="1">✕</button>`;
    item.onclick = e => {
      if ((e.target as HTMLElement).dataset.del) {
        if (confirm(`Delete "${c.name}"? This cannot be undone.`)) rd().deleteCourse({ courseId: c.id });
        return;
      }
      launchEditor(c);
    };
    list.appendChild(item);
  }
  const bl = $('mine-builtins');
  bl.innerHTML = '';
  for (const c of [...conn.db.course.iter()].filter(c => c.builtin)) {
    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = `<div class="grow"><div class="name">${esc(c.name)}</div><div class="tiny">${c.holeCount} HOLES · PAR ${c.totalPar}</div></div><span class="pill">DUPLICATE</span>`;
    item.onclick = () => launchEditor(c, true);
    bl.appendChild(item);
  }
}
$('mine-close').onclick = () => { show('menu'); renderMenu(); };
$('mine-new').onclick = () => launchEditor(null);

function launchEditor(course: Course | null, duplicate = false) {
  const start = () => {
    const holes: Hole[] = course ? holeRows(course.id).map(parsedHole).filter((h): h is Hole => !!h) : [];
    show('editor');
    openEditor({
      courseId: course && !duplicate ? course.id : 0n,
      name: course ? (duplicate ? `${course.name} REMIX` : course.name) : '',
      holes,
      published: !!course && !duplicate && course.published,
      myName: me()?.name ?? 'ANON',
      onSave: (courseId, name, holesJson) => rd().saveCourse({ courseId, name, holesJson }),
      onPublish: (courseId, published) => rd().publishCourse({ courseId, published }),
      onExit: () => { closeEditor(); show('menu'); renderMenu(); },
      findSaved: (name) => {
        // after a fresh save the new course id is whatever my newest course with that name is
        let best: Course | undefined;
        for (const c of conn.db.myCourses.iter()) {
          const cc = c as unknown as Course;
          if (cc.name === name && (!best || cc.id > best.id)) best = cc;
        }
        return best ? { id: best.id, published: best.published } : null;
      },
    });
  };
  if (course) {
    subscribeCourse(course.id);
    // hole rows may still be in flight — wait for them briefly
    const want = course.holeCount;
    let tries = 0;
    const wait = () => {
      if (holeRows(course.id).length >= want || tries++ > 30) start();
      else setTimeout(wait, 100);
    };
    wait();
  } else start();
}

// ---------------------------------------------------------------------------
// Row events → UI refresh, SFX, VFX
// ---------------------------------------------------------------------------
interface Disp { x: number; y: number; z: number; sx: number; sy: number; sz: number; svx: number; svy: number; svz: number; at: number; emote: string; emoteUntil: number; lastEventSeq: number; lastShotSeq: number; lastEmoteSeq: number }
const disp = new Map<string, Disp>();
const particles = new Particles();
let lastSeenPhase = -1;

function wireRowEvents() {
  const refresh = () => { if (subscribed) { route(); if (currentScreen === 'menu') renderMenu(); else if (currentScreen === 'room') renderRoom(); else if (currentScreen === 'picker') renderPicker(); else if (currentScreen === 'mine-modal') renderMine(); } };
  conn.db.lobby.onInsert(refresh);
  conn.db.lobby.onDelete(refresh);
  conn.db.lobby.onUpdate((_c, old, row) => {
    if (row.phase !== old.phase || row.status !== old.status || row.courseName !== old.courseName || row.isPublic !== old.isPublic || row.maxStrokes !== old.maxStrokes || row.holeSecs !== old.holeSecs || row.collisions !== old.collisions || row.holeIndex !== old.holeIndex || !row.hostId.isEqual(old.hostId)) refresh();
  });
  conn.db.player.onInsert(refresh);
  conn.db.player.onDelete(refresh);
  conn.db.player.onUpdate((_c, old, row) => {
    notePlayer(row, old);
    if (row.lobbyId !== old.lobbyId || row.name !== old.name || row.color !== old.color || row.online !== old.online) refresh();
  });
  conn.db.chat.onInsert(() => { const l = myLobby(); if (l) { renderChat('room-chat-log', l.id); renderChat('game-chat-log', l.id); if (currentScreen === 'game' && $('game-chat-box').classList.contains('hidden')) unreadChat++; } });
  conn.db.course.onInsert(refresh); conn.db.course.onUpdate(refresh); conn.db.course.onDelete(refresh);
  conn.db.myCourses.onInsert(refresh); conn.db.myCourses.onUpdate(refresh); conn.db.myCourses.onDelete(refresh);
}

function dispOf(p: Player): Disp {
  const key = p.identity.toHexString();
  let d = disp.get(key);
  if (!d) {
    d = { x: p.x, y: p.y, z: p.z, sx: p.x, sy: p.y, sz: p.z, svx: p.vx, svy: p.vy, svz: p.vz, at: performance.now(), emote: '', emoteUntil: 0, lastEventSeq: p.eventSeq, lastShotSeq: p.shotSeq, lastEmoteSeq: p.emoteSeq };
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
  const inMyRoom = !!lobby && row.lobbyId === lobby.id && currentScreen === 'game';
  if (row.emoteSeq !== d.lastEmoteSeq) {
    d.lastEmoteSeq = row.emoteSeq;
    d.emote = EMOTES[row.emote] ?? '';
    d.emoteUntil = performance.now() + 2500;
  }
  if (row.shotSeq !== d.lastShotSeq) {
    d.lastShotSeq = row.shotSeq;
    if (inMyRoom) sfx.putt(row.eventPower);
  }
  if (row.eventSeq !== d.lastEventSeq) {
    d.lastEventSeq = row.eventSeq;
    if (!inMyRoom) return;
    const color = COLORS[row.color];
    switch (row.eventKind) {
      case EV.WALL: sfx.wall(row.eventPower); particles.burst(row.x, row.y, 4 + Math.min(10, row.eventPower / 3), '#ffffff', 3, 0.12, 0.3); break;
      case EV.BUMPER: sfx.bumper(); particles.burst(row.x, row.y, 14, '#ff8a8a', 7, 0.16, 0.45); break;
      case EV.JUMP: sfx.jump(); particles.burst(row.x, row.y, 8, '#ffd60a', 4, 0.14, 0.4); break;
      case EV.LAND: sfx.land(); particles.burst(row.x, row.y, 6, '#c9c9c9', 3, 0.12, 0.3); break;
      case EV.TELE: sfx.tele(); particles.burst(row.x, row.y, 20, '#c77dff', 6, 0.18, 0.6); break;
      case EV.WATER: sfx.water(); particles.burst(old.x, old.y, 18, '#7fc8ff', 5, 0.18, 0.7, 12); if (isMe(row.identity)) toast('SPLASH! +1 stroke'); break;
      case EV.RESET: sfx.reset(); if (isMe(row.identity)) toast('Back you go'); break;
      case EV.BOOST: sfx.boost(); break;
      case EV.HOLED: {
        const hole = currentHole(lobby!);
        const par = hole?.par ?? 3;
        sfx.holed(row.eventPower, par);
        particles.confetti(row.x, row.y);
        particles.burst(row.x, row.y, 20, color, 6, 0.2, 0.8);
        if (isMe(row.identity)) toast(scoreName(row.eventPower, par));
        else toast(`${row.name}: ${scoreName(row.eventPower, par)}`);
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

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------
const canvas = $('game-canvas') as HTMLCanvasElement;
const g = canvas.getContext('2d')!;
let W = 0, H = 0, DPR = 1;
function resizeCanvas() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
}
window.addEventListener('resize', () => { if (currentScreen === 'game') resizeCanvas(); });

const cam: Camera = { x: 0, y: 0, scale: 20 };
let camHoleId = 0n;
const MIN_SCALE = 12;
let unreadChat = 0;
let gameHoleObj: Hole | null = null;
let holeStartAt = 0;

function enterGame() {
  unlockAudio();
  resizeCanvas();
  particles;
  lastSeenPhase = -1;
  $('game-chat-box').classList.add('hidden');
  const bar = $('emote-bar');
  if (!bar.childElementCount) EMOTES.forEach((e, i) => { const b = document.createElement('button'); b.textContent = e; b.onclick = () => rd().sendEmote({ index: i }); bar.appendChild(b); });
}

// aim state
let drag: { active: boolean; angle: number; power: number; px: number; py: number } = { active: false, angle: 0, power: 0, px: 0, py: 0 };
let kbAim = { active: false, angle: 0, charging: false, chargeStart: 0 };
const MAX_DRAG_UNITS = 7;
let previewPath: { x: number; y: number }[] = [];
let previewKey = '';

function canShoot(): boolean {
  const lobby = myLobby(); const p = me();
  return !!lobby && !!p && lobby.phase === PH_PLAY && p.resting && !p.holed && p.strokes < lobby.maxStrokes;
}
function ballScreen(): { x: number; y: number } | null {
  const p = me(); if (!p) return null;
  const d = dispOf(p);
  return w2s(cam, W, H, d.x, d.y);
}

canvas.addEventListener('pointerdown', e => {
  unlockAudio();
  if (!canShoot()) return;
  if (currentScreen !== 'game') return;
  canvas.setPointerCapture(e.pointerId);
  drag = { active: true, angle: 0, power: 0, px: e.clientX, py: e.clientY };
  kbAim.active = false;
  updateDrag(e.clientX, e.clientY);
});
canvas.addEventListener('pointermove', e => { if (drag.active) updateDrag(e.clientX, e.clientY); });
canvas.addEventListener('pointerup', e => {
  if (!drag.active) return;
  updateDrag(e.clientX, e.clientY);
  drag.active = false;
  if (drag.power > 0.04 && canShoot()) rd().shoot({ angle: drag.angle, power: drag.power });
  $('power-legend').classList.add('hidden');
});
canvas.addEventListener('pointercancel', () => { drag.active = false; $('power-legend').classList.add('hidden'); });
function updateDrag(cx: number, cy: number) {
  const b = ballScreen(); if (!b) return;
  const rect = canvas.getBoundingClientRect();
  const sx = cx - rect.left, sy = cy - rect.top;
  // slingshot: pull away from the ball; the shot goes the other way
  const dx = b.x - sx, dy = b.y - sy;
  const dist = Math.hypot(dx, dy) / cam.scale;
  drag.angle = Math.atan2(dy, dx);
  drag.power = Math.min(1, Math.max(0, (dist - 0.4) / MAX_DRAG_UNITS));
  $('power-legend').classList.remove('hidden');
  ($('power-fill') as HTMLElement).style.width = `${Math.round(drag.power * 100)}%`;
}

function computePreview(angle: number, power: number) {
  const p = me(); const lobby = myLobby();
  if (!p || !lobby || !gameHoleObj) { previewPath = []; return; }
  const key = `${angle.toFixed(2)}|${power.toFixed(2)}|${p.x}|${p.y}`;
  if (key === previewKey) return;
  previewKey = key;
  const v = shotVelocity(angle, power);
  const b: BallState = { x: p.x, y: p.y, z: 0, vx: v.vx, vy: v.vy, vz: 0, teleTicks: 0 };
  const geom = geomOf(gameHoleObj);
  const t0 = lobby.holeTick / TICK_HZ;
  const path = [{ x: b.x, y: b.y }];
  const ev = newEvents();
  for (let i = 0; i < 45; i++) {
    stepBall(b, geom, t0 + i / TICK_HZ, ev);
    if (i % 2 === 0) path.push({ x: b.x, y: b.y });
    if (ev.holed || ev.water || ev.oob || ev.tele) break;
    if (b.vx === 0 && b.vy === 0 && b.z === 0) break;
  }
  previewPath = path;
}

// keyboard
window.addEventListener('keydown', e => {
  if (editorIsOpen()) return;
  const inInput = (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA';
  if (currentScreen !== 'game') return;
  if (e.key === 'Escape') {
    if (!$('game-chat-box').classList.contains('hidden')) { toggleChat(false); return; }
    if (!$('scores-overlay').classList.contains('hidden')) { $('scores-overlay').classList.add('hidden'); return; }
    $('esc-menu').classList.toggle('hidden');
    return;
  }
  if (inInput) return;
  if (e.key === 'Enter') { toggleChat(true); e.preventDefault(); return; }
  if (e.key === 'Tab') { e.preventDefault(); $('scores-overlay').classList.toggle('hidden'); renderScorecard('scores-table'); return; }
  if (e.key >= '1' && e.key <= '6') { rd().sendEmote({ index: Number(e.key) - 1 }); return; }
  if (e.key === 'f' || e.key === 'F') { toggleFullscreen(); return; }
  if (!canShoot()) return;
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { kbAim.active = true; kbAim.angle -= e.shiftKey ? 0.01 : 0.05; e.preventDefault(); }
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { kbAim.active = true; kbAim.angle += e.shiftKey ? 0.01 : 0.05; e.preventDefault(); }
  if (e.key === ' ' && !kbAim.charging) { kbAim.active = true; kbAim.charging = true; kbAim.chargeStart = performance.now(); e.preventDefault(); }
});
window.addEventListener('keyup', e => {
  if (currentScreen !== 'game' || editorIsOpen()) return;
  if (e.key === ' ' && kbAim.charging) {
    kbAim.charging = false;
    const power = kbPower();
    if (canShoot() && power > 0.03) rd().shoot({ angle: kbAim.angle, power });
  }
});
const kbPower = () => { const t = (performance.now() - kbAim.chargeStart) / 1200; const k = t % 2; return k < 1 ? k : 2 - k; };

function toggleChat(open: boolean) {
  $('game-chat-box').classList.toggle('hidden', !open);
  if (open) { unreadChat = 0; ($('game-chat-input') as HTMLInputElement).focus(); const l = myLobby(); if (l) renderChat('game-chat-log', l.id); }
  else ($('game-chat-input') as HTMLInputElement).blur();
}
$('btn-chat').onclick = () => toggleChat($('game-chat-box').classList.contains('hidden'));
$('btn-scores').onclick = () => { $('scores-overlay').classList.toggle('hidden'); renderScorecard('scores-table'); };
$('scores-close').onclick = () => $('scores-overlay').classList.add('hidden');
$('btn-esc').onclick = () => $('esc-menu').classList.toggle('hidden');
$('esc-resume').onclick = () => $('esc-menu').classList.add('hidden');
$('esc-leave').onclick = () => { $('esc-menu').classList.add('hidden'); rd().leaveLobby({}); show('menu'); renderMenu(); };
$('esc-mute').onclick = () => { setMuted(!isMuted()); $('esc-mute').textContent = isMuted() ? 'Unmute' : 'Mute'; };
$('esc-fullscreen').onclick = toggleFullscreen;
$('btn-fullscreen').onclick = toggleFullscreen;
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
$('final-again').onclick = () => rd().playAgain({});
$('final-lobby').onclick = () => rd().playAgain({});
$('final-leave').onclick = () => { rd().leaveLobby({}); show('menu'); renderMenu(); };

// ---------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------
let lastFrame = performance.now();
let lastTimerShown = -1;
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (currentScreen !== 'game' || !subscribed) return;
  const lobby = myLobby(); const p = me();
  if (!lobby || !p) return;
  if (lobby.status === L_OPEN) { route(); return; }
  if (lobby.holeId !== camHoleId) { camHoleId = lobby.holeId; gameHoleObj = currentHole(lobby); if (gameHoleObj) { const f = fitCamera(gameHoleObj, W, H); cam.x = f.x; cam.y = f.y; cam.scale = f.scale; } holeStartAt = now; }
  if (!gameHoleObj) { gameHoleObj = currentHole(lobby); if (!gameHoleObj) { subscribeCourse(lobby.courseId); drawWaiting(); return; } }
  const hole = gameHoleObj;
  const players = lobbyPlayers(lobby.id);

  // interpolate balls
  for (const q of players) {
    const d = dispOf(q);
    const age = Math.min(0.15, (now - d.at) / 1000);
    const tx = d.sx + d.svx * age, ty = d.sy + d.svy * age, tz = Math.max(0, d.sz + d.svz * age);
    const k = 1 - Math.exp(-dt * 22);
    d.x += (tx - d.x) * k; d.y += (ty - d.y) * k; d.z += (tz - d.z) * k;
  }
  // camera: whole hole if it fits, else follow my ball
  {
    const fit = fitCamera(hole, W, H);
    const me_ = dispOf(p);
    let want: Camera;
    if (fit.scale >= MIN_SCALE) want = fit;
    else {
      const b = holeBoundsCached(hole);
      const halfW = W / 2 / MIN_SCALE, halfH = H / 2 / MIN_SCALE;
      want = { scale: MIN_SCALE, x: clamp(me_.x, b.minX + halfW - 2, b.maxX - halfW + 2), y: clamp(me_.y, b.minY + halfH - 2, b.maxY - halfH + 2) };
      if (b.w + 4 < halfW * 2) want.x = b.minX + b.w / 2;
      if (b.h + 4 < halfH * 2) want.y = b.minY + b.h / 2;
    }
    const k = 1 - Math.exp(-dt * 4);
    cam.x += (want.x - cam.x) * k; cam.y += (want.y - cam.y) * k; cam.scale += (want.scale - cam.scale) * k;
  }
  particles.step(dt);

  // draw
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  const t = lobby.phase === PH_PLAY ? lobby.holeTick / TICK_HZ + (now - lastTickAt) / 1000 * 0 : lobby.holeTick / TICK_HZ;
  const theme = themeFor(hole, hole.theme);
  drawHole(g, hole, cam, W, H, { t: t + (now - holeStartAt) / 1000 * 0.0001, theme });
  // moving blocks are driven by the server's holeTick; smooth between ticks
  void t;
  const sorted = [...players].sort((a, b) => (isMe(a.identity) ? 1 : 0) - (isMe(b.identity) ? 1 : 0));
  for (const q of sorted) {
    if (q.holed) continue;
    const d = dispOf(q);
    drawBall(g, cam, W, H, d.x, d.y, d.z, COLORS[q.color], {
      label: isMe(q.identity) ? undefined : q.name, me: isMe(q.identity), ghost: q.strokes === 0 && !isMe(q.identity),
      emote: d.emoteUntil > now ? d.emote : undefined,
    });
  }
  if (p.holed) { const d = dispOf(p); if (d.emoteUntil > now) drawBall(g, cam, W, H, hole.cup.x, hole.cup.y - 1.2, 0, COLORS[p.color], { ghost: true, emote: d.emote }); }
  particles.draw(g, cam, W, H);
  // aim
  if (canShoot()) {
    const d = dispOf(p);
    if (drag.active) { computePreview(drag.angle, drag.power); drawAim(g, cam, W, H, d.x, d.y, drag.angle, drag.power, COLORS[p.color], previewPath); }
    else if (kbAim.active) {
      const pw = kbAim.charging ? kbPower() : 0.35;
      computePreview(kbAim.angle, pw);
      drawAim(g, cam, W, H, d.x, d.y, kbAim.angle, pw, COLORS[p.color], previewPath);
      $('power-legend').classList.toggle('hidden', !kbAim.charging);
      if (kbAim.charging) ($('power-fill') as HTMLElement).style.width = `${Math.round(pw * 100)}%`;
    } else {
      // idle pulse ring so you can find your ball
      const s = w2s(cam, W, H, d.x, d.y);
      g.beginPath(); g.arc(s.x, s.y, (BALL_R + 0.5 + 0.2 * Math.sin(now / 200)) * cam.scale, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(164,255,61,0.7)'; g.lineWidth = 2; g.stroke();
    }
  }
  renderHud(lobby, p, players, hole, now);
}
let lastTickAt = 0;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const boundsCache = new WeakMap<Hole, ReturnType<typeof holeBoundsImpl>>();
function holeBoundsImpl(h: Hole) { let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; for (const r of h.floor) { minX = Math.min(minX, r.x); minY = Math.min(minY, r.y); maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h); } return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY }; }
function holeBoundsCached(h: Hole) { let b = boundsCache.get(h); if (!b) { b = holeBoundsImpl(h); boundsCache.set(h, b); } return b; }
function drawWaiting() {
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.fillStyle = '#061a10'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#9fc2a8'; g.font = '700 18px Chakra Petch, sans-serif'; g.textAlign = 'center';
  g.fillText('LOADING HOLE…', W / 2, H / 2);
}

function renderHud(lobby: Lobby, p: Player, players: Player[], hole: Hole, now: number) {
  $('hud-hole-k').textContent = `HOLE ${lobby.holeIndex + 1} / ${lobby.holeCount}`;
  $('hud-hole-name').textContent = hole.name;
  $('hud-hole-par').textContent = `PAR ${hole.par} · MAX ${lobby.maxStrokes}`;
  $('hud-strokes-n').textContent = p.holed ? '✓' : String(p.strokes);
  const secs = lobby.phase === PH_PLAY ? Math.ceil(lobby.phaseTicks / TICK_HZ) : lobby.holeSecs;
  if (secs !== lastTimerShown) {
    lastTimerShown = secs;
    $('hud-timer').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    $('hud-timer').classList.toggle('low', lobby.phase === PH_PLAY && secs <= 10);
    if (lobby.phase === PH_PLAY && secs <= 5 && secs > 0 && !p.holed) sfx.tick();
  }
  // mini board
  const board = $('hud-board');
  const ranked = [...players].sort((a, b) => a.total - b.total || a.seat - b.seat);
  const parSoFar = parThrough(lobby, lobby.holeIndex);
  const html = ranked.map(q => {
    const done = q.holed;
    const cur = done ? `${q.holeScores[lobby.holeIndex] ?? q.strokes}` : `${q.strokes}`;
    const tot = q.holeScores.length ? relPar(q.total - parThrough(lobby, q.holeScores.length - 1)) : '—';
    return `<div class="r${done ? ' done' : ''}${isMe(q.identity) ? ' me' : ''}"><span class="dot" style="background:${COLORS[q.color]}"></span><span class="name">${esc(q.name)}${q.online ? '' : ' 💤'}</span><span class="sc">${done ? '⛳' : ''}${cur} · ${tot}</span></div>`;
  }).join('');
  void parSoFar;
  if (board.innerHTML !== html) board.innerHTML = html;
  $('btn-chat').textContent = unreadChat ? `💬 ${unreadChat}` : '💬';
  $('hud-hint').textContent = p.holed ? 'IN THE HOLE — WAITING FOR THE OTHERS' : lobby.phase === PH_PLAY
    ? (p.resting ? (p.strokes >= lobby.maxStrokes ? 'OUT OF STROKES' : 'DRAG BACK FROM YOUR BALL · RELEASE TO PUTT  ·  ⌨ ←/→ AIM, HOLD SPACE') : 'ROLLING…')
    : '';

  // phase overlays
  if (lobby.phase !== lastSeenPhase) {
    lastSeenPhase = lobby.phase;
    $('intro-overlay').classList.toggle('hidden', lobby.phase !== PH_INTRO);
    $('results-overlay').classList.toggle('hidden', lobby.phase !== PH_RESULTS);
    $('final-overlay').classList.toggle('hidden', lobby.phase !== PH_FINAL);
    $('scores-overlay').classList.add('hidden');
    if (lobby.phase === PH_INTRO) {
      $('intro-k').textContent = `HOLE ${lobby.holeIndex + 1} OF ${lobby.holeCount}`;
      $('intro-name').textContent = hole.name;
      $('intro-par').textContent = `PAR ${hole.par}`;
      $('intro-tip').textContent = hole.tip ?? '';
      sfx.ui();
    }
    if (lobby.phase === PH_RESULTS) {
      $('results-title').textContent = `Hole ${lobby.holeIndex + 1} · ${hole.name}`;
      renderScorecard('results-table');
    }
    if (lobby.phase === PH_FINAL) { renderFinal(lobby, players); sfx.fanfare(); }
  }
  if (lobby.phase === PH_RESULTS) {
    $('results-next').textContent = lobby.holeIndex + 1 < lobby.holeCount ? `Next hole in ${Math.ceil(lobby.phaseTicks / TICK_HZ)}…` : `Final results in ${Math.ceil(lobby.phaseTicks / TICK_HZ)}…`;
    renderScorecard('results-table');
  }
  if (lobby.phase === PH_FINAL) {
    const host = lobby.hostId.isEqual(p.identity);
    $('final-again').classList.toggle('hidden', !host);
    $('final-lobby').classList.toggle('hidden', true);
  }
  void now;
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
  let html = '<table class="score"><tr><th class="name">Player</th>';
  for (let i = 0; i < n; i++) html += `<th${i === lobby.holeIndex ? ' style="color:#a4ff3d"' : ''}>${i + 1}</th>`;
  html += '<th>Tot</th><th>±</th></tr>';
  html += '<tr><td class="name" style="color:#9fc2a8">Par</td>';
  let parTot = 0;
  for (let i = 0; i < n; i++) { const par = rows[i]?.par ?? 0; parTot += par; html += `<td style="color:#9fc2a8">${par || '·'}</td>`; }
  html += `<td style="color:#9fc2a8">${parTot}</td><td></td></tr>`;
  for (const q of players) {
    html += `<tr${isMe(q.identity) ? ' class="me"' : ''}><td class="name"><span class="dot" style="background:${COLORS[q.color]};width:10px;height:10px;margin-right:6px"></span>${esc(q.name)}</td>`;
    let played = 0;
    for (let i = 0; i < n; i++) {
      const sc = q.holeScores[i];
      if (sc === undefined) { html += `<td>${i === lobby.holeIndex && lobby.phase === PH_PLAY ? `<span class="even">${q.strokes || ''}</span>` : ''}</td>`; continue; }
      played += rows[i]?.par ?? 0;
      const par = rows[i]?.par ?? 3;
      const d = sc - par;
      html += `<td class="${relClass(d)}">${sc}${sc === 1 ? '★' : ''}</td>`;
    }
    html += `<td class="tot">${q.total}</td><td class="${relClass(q.total - played)}">${q.holeScores.length ? relPar(q.total - played) : ''}</td></tr>`;
  }
  html += '</table>';
  const el = $(targetId);
  if (el.innerHTML !== html) el.innerHTML = html;
}

function renderFinal(lobby: Lobby, players: Player[]) {
  const ranked = [...players].sort((a, b) => a.total - b.total || a.finishedTick - b.finishedTick);
  const pod = $('podium');
  pod.innerHTML = '';
  const order = [1, 0, 2];
  for (const idx of order) {
    const q = ranked[idx];
    if (!q) continue;
    const d = document.createElement('div');
    d.className = 'p' + (idx === 0 ? ' first' : '');
    const hgt = idx === 0 ? 90 : idx === 1 ? 64 : 48;
    d.innerHTML = `<div class="bar" style="height:${hgt}px;border-top:4px solid ${COLORS[q.color]}">${idx + 1}</div><div class="nm">${esc(q.name)}</div><div class="sc">${q.total} STROKES</div>`;
    pod.appendChild(d);
  }
  renderScorecard('final-table');
  void lobby;
}

requestAnimationFrame(frame);
connect();
