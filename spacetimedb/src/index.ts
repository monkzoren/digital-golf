// Digital Golf — SpacetimeDB module. Schema + reducers + the 30 Hz game tick
// (server-authoritative ball physics, hole flow, scoring). Everything a room
// needs lives here; the client only sends shots and renders rows.
//
// Built on the Digital Tennis framework: same lobby-by-code model, same
// scheduled-tick simulation, same "clients send intent, server owns the
// world" split.
import { schema, table, t, SenderError, ScheduleAt, type ReducerCtx } from 'spacetimedb/server';
import { Identity } from 'spacetimedb';
import { COURSES, type Hole } from './shared/courses';
import { LIBRARY } from './shared/library';
import { LIMITS, cleanCourseName, parseHole, serializeHole } from './shared/mapformat';
import {
  type BallState, type StepEvents, TICK_HZ, collideBalls, geomOf, groundZ, newEvents, restingOn,
  shotFrom, shotVelocity, stepBall,
} from './shared/physics';

const TICK_MICROS = BigInt(Math.round(1_000_000 / TICK_HZ));
const ticks = (seconds: number) => Math.max(1, Math.round(seconds * TICK_HZ));

// Lobby status
const L_OPEN = 0;
const L_RUNNING = 1;
const L_FINISHED = 2;

// Lobby phase (only meaningful while running / finished)
const PH_LOBBY = 0;
const PH_INTRO = 1;
const PH_PLAY = 2;
const PH_RESULTS = 3;
const PH_FINAL = 4;

// Player events, for client SFX/VFX — the strongest one per tick wins.
const EV_NONE = 0;
const EV_SHOT = 1;
const EV_WALL = 2;
const EV_BUMPER = 3;
const EV_JUMP = 4;
const EV_TELE = 5;
const EV_WATER = 6;
const EV_HOLED = 7;
const EV_LAND = 8;
const EV_BOOST = 9;
const EV_RESET = 10;

const MAX_PLAYERS = 32;

// The championship relay (digital-championship/relay) mints a token signed
// with THIS server's key carrying this issuer — the trick the tennis
// framework's profile service uses. It may open a room for a championship
// leg and nothing else; the room reports its result through `leg_result`.
// Mirrored in the hub and every sibling game — change everywhere.
const RELAY_ISSUER = 'digital-championship-relay';
const N_COLORS = 12;
const N_CHARACTERS = 18; // mirrors client/src/characters.ts
const INTRO_SECS = 3.5;
const RESULTS_SECS = 7;
const OFFLINE_GRACE_SECS = 25; // a refresh mid-round keeps your seat this long
const DEFAULT_MAX_STROKES = 10;
const DEFAULT_HOLE_SECS = 90;
const CHAT_MIN_GAP_MICROS = 700_000n;

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const Lobby = table(
  { name: 'lobby', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    code: t.string().unique(),
    hostId: t.identity(),
    status: t.u8(), // L_*
    phase: t.u8(), // PH_*
    courseId: t.u64(),
    courseName: t.string(), // denormalised so a room on a private draft still shows its name
    holeCount: t.u8(),
    holeId: t.u64(), // the `hole` row in play (0 = none yet)
    isPublic: t.bool(),
    holeIndex: t.u8(),
    phaseTicks: t.u32(), // ticks left in the current phase
    holeTick: t.u32(), // ticks since the hole went live (drives movers, timer)
    maxStrokes: t.u8(),
    holeSecs: t.u16(),
    collisions: t.bool(), // balls bump into each other
    round: t.u16(), // how many games this room has played (play again bumps it)
    championName: t.string(),
    createdAt: t.timestamp(),
    // NOTE: appended columns — more round options
    waterPenalty: t.bool().default(true), // water = +1 stroke (off: free reset)
    powerMul: t.u8().default(100), // shot power %, 80 soft · 100 normal · 130 turbo
    // NOTE: appended column — the championship leg this room plays (a hub
    // `leg` id; 0 = an ordinary room). Set only by create_championship_room.
    championshipLeg: t.u64().default(0n),
  }
);

// The finishing order of a championship room, written exactly once when the
// round's result is final. The relay reads it into the hub, which does the
// scoring (and drops non-entrants), so this is everyone on the scorecard,
// lowest total first.
const LegResult = table(
  {
    name: 'leg_result',
    public: true,
    indexes: [{ accessor: 'byLeg', algorithm: 'btree', columns: ['legId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    legId: t.u64(),
    placings: t.array(t.identity()),
    names: t.array(t.string()),
    finishedAt: t.timestamp(),
  }
);

const Player = table(
  {
    name: 'player',
    public: true,
    indexes: [{ accessor: 'byLobby', algorithm: 'btree', columns: ['lobbyId'] }],
  },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    lobbyId: t.u64(), // 0 = on the menu
    color: t.u8(),
    seat: t.u8(), // join order within the room; host passes to the lowest seat
    online: t.bool(),
    offlineTicks: t.u16(),
    // the ball
    x: t.f32(),
    y: t.f32(),
    z: t.f32(),
    vx: t.f32(),
    vy: t.f32(),
    vz: t.f32(),
    teleTicks: t.u8(),
    resting: t.bool(),
    holed: t.bool(),
    strokes: t.u8(), // this hole
    total: t.u16(), // whole round
    holeScores: t.array(t.u8()), // one entry per finished hole
    safeX: t.f32(), // where the ball goes back to after water / falling off
    safeY: t.f32(),
    struck: t.bool(), // in motion from the owner's own shot (water penalty applies)
    finishedTick: t.u32(), // holeTick when holed (tiebreak)
    shotSeq: t.u32(), // bumps on every stroke (client: swing animation)
    eventKind: t.u8(), // EV_*
    eventSeq: t.u32(), // bumps whenever eventKind is (re)set
    eventPower: t.f32(), // impact strength for EV_WALL / shot power for EV_SHOT
    emote: t.u8(),
    emoteSeq: t.u32(),
    lastChat: t.u64(),
    // NOTE: appended column — the roster character this golfer plays as
    // (client/src/characters.ts order). The ball keeps its own colour.
    characterId: t.u8().default(0),
    // NOTE: appended column — lobby ready-up (cleared on join / start / play again)
    ready: t.bool().default(false),
    /** set when the host threw them out (cleared on the next join) */
    kicked: t.bool().default(false),
  }
);


const Chat = table(
  {
    name: 'chat',
    public: true,
    indexes: [{ accessor: 'byLobby', algorithm: 'btree', columns: ['lobbyId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    lobbyId: t.u64(),
    identity: t.identity(),
    name: t.string(),
    color: t.u8(),
    text: t.string(),
    createdAt: t.timestamp(),
  }
);

// A course: metadata only — the holes live in `hole`, one row each, so a
// client subscribes to just the course it is playing or editing. Built-in
// courses are seeded from shared/courses.ts on init and re-synced by
// seed_builtins; everything else is player-made in the editor.
const Course = table(
  {
    name: 'course',
    public: true,
    indexes: [{ accessor: 'byOwner', algorithm: 'btree', columns: ['ownerId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    ownerId: t.identity(),
    authorName: t.string(),
    name: t.string(),
    holeCount: t.u8(),
    totalPar: t.u16(),
    published: t.bool(), // listed for everyone; drafts show only to their owner
    builtin: t.bool(),
    plays: t.u32(),
    rev: t.u32(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
    // NOTE: appended columns — player ratings, kept as a running total so the
    // picker can rank courses without loading every `rating` row. The
    // average is ratingSum / ratingCount (0 ratings = unrated).
    ratingSum: t.u32().default(0),
    ratingCount: t.u32().default(0),
  }
);

// One row per (course, player): the stars a player gave a course they have
// played. Private — the client only sees its own through `my_ratings`; the
// aggregates live on the course row.
const Rating = table(
  {
    name: 'rating',
    indexes: [
      { accessor: 'byCourse', algorithm: 'btree', columns: ['courseId'] },
      { accessor: 'byPlayer', algorithm: 'btree', columns: ['identity'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    courseId: t.u64(),
    identity: t.identity(),
    stars: t.u8(), // 1..5
    updatedAt: t.timestamp(),
  }
);
const MAX_STARS = 5;

const HoleTable = table(
  {
    name: 'hole',
    public: true,
    indexes: [{ accessor: 'byCourse', algorithm: 'btree', columns: ['courseId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    courseId: t.u64(),
    index: t.u8(),
    name: t.string(),
    par: t.u8(),
    data: t.string(), // JSON, see shared/mapformat.ts
  }
);

// One row per open socket. Two tabs are one player; the player only goes
// offline when the LAST socket closes.
const Session = table(
  { name: 'session' },
  {
    connectionId: t.connectionId().primaryKey(),
    identity: t.identity(),
  }
);

// Safety net: how long each ball has been rolling since it last rested. A
// ball still going after ROLL_LIMIT_SECS (pinballing between bumpers, say)
// is stopped where it is, so nobody is ever locked out of their next shot.
// Private, so the client bindings need not know about it.
const RollClock = table(
  { name: 'roll_clock' },
  {
    identity: t.identity().primaryKey(),
    ticks: t.u32(),
  }
);
const ROLL_LIMIT_SECS = 15;

const TickTimer = table(
  { name: 'tick_timer' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    lobbyId: t.u64(),
  }
);

const spacetimedb = schema({
  lobby: Lobby,
  player: Player,
  chat: Chat,
  course: Course,
  hole: HoleTable,
  rating: Rating,
  session: Session,
  rollClock: RollClock,
  tickTimer: TickTimer,
  legResult: LegResult,
});
export default spacetimedb;

type Ctx = ReducerCtx<typeof spacetimedb.schemaType>;
type PlayerRow = typeof Player.rowType.type;
type LobbyRow = typeof Lobby.rowType.type;
type CourseRow = typeof Course.rowType.type;
type HoleRow = typeof HoleTable.rowType.type;
type RatingRow = typeof Rating.rowType.type;

/** Drafts are visible to their author only; published courses to everyone. */
export const my_courses = spacetimedb.view(
  { name: 'my_courses', public: true },
  t.array(Course.rowType),
  ctx => [...ctx.db.course.byOwner.filter(ctx.sender)]
);

/** The ratings this player has given (the `rating` table itself is private). */
export const my_ratings = spacetimedb.view(
  { name: 'my_ratings', public: true },
  t.array(Rating.rowType),
  ctx => [...ctx.db.rating.byPlayer.filter(ctx.sender)]
);

// ---------------------------------------------------------------------------
// Parsed-hole cache. Hole rows are immutable (a save replaces them), so the
// row id is the whole key. Bounded so a busy server never grows without end.
// ---------------------------------------------------------------------------
const holeCache = new Map<bigint, Hole>();
function parsedHole(row: HoleRow): Hole {
  let h = holeCache.get(row.id);
  if (h) return h;
  h = parseHole(row.data);
  if (holeCache.size >= 256) holeCache.delete(holeCache.keys().next().value!);
  holeCache.set(row.id, h);
  return h;
}

function holeRowAt(ctx: Ctx, courseId: bigint, index: number): HoleRow | undefined {
  for (const h of ctx.db.hole.byCourse.filter(courseId)) if (h.index === index) return h;
  return undefined;
}

function courseHoles(ctx: Ctx, courseId: bigint): HoleRow[] {
  const rows = [...ctx.db.hole.byCourse.filter(courseId)];
  rows.sort((a, b) => a.index - b.index);
  return rows;
}

function currentHole(ctx: Ctx, lobby: LobbyRow): Hole | undefined {
  const row = ctx.db.hole.id.find(lobby.holeId);
  return row ? parsedHole(row) : undefined;
}

/** A course a player may host: published, or their own draft. */
function playableCourse(ctx: Ctx, courseId: bigint): CourseRow {
  const c = ctx.db.course.id.find(courseId);
  if (!c) throw new SenderError('That course no longer exists');
  if (!c.published && !c.ownerId.isEqual(ctx.sender)) throw new SenderError('That course is a private draft');
  if (c.holeCount === 0) throw new SenderError('That course has no holes yet');
  return c;
}

/** Replace a course's hole rows with a freshly validated set. */
function writeHoles(ctx: Ctx, courseId: bigint, holes: Hole[]) {
  for (const h of ctx.db.hole.byCourse.filter(courseId)) ctx.db.hole.id.delete(h.id);
  holes.forEach((h, i) => {
    ctx.db.hole.insert({ id: 0n, courseId, index: i, name: h.name, par: h.par, data: serializeHole(h) });
  });
}

const totalPar = (holes: Hole[]) => holes.reduce((s, h) => s + h.par, 0);

/** Seed / re-sync the built-in courses from code. Idempotent by name. */
function seedBuiltins(ctx: Ctx) {
  for (const c of [...COURSES, ...LIBRARY]) {
    let row: CourseRow | undefined;
    for (const r of ctx.db.course.iter()) if (r.builtin && r.name === c.name) { row = r; break; }
    if (row) {
      ctx.db.course.id.update({
        ...row, holeCount: c.holes.length, totalPar: totalPar(c.holes), rev: row.rev + 1, updatedAt: ctx.timestamp,
      });
      writeHoles(ctx, row.id, c.holes.map(h => ({ ...h, theme: c.theme })));
    } else {
      const inserted = ctx.db.course.insert({
        id: 0n, ownerId: ctx.sender, authorName: 'DIGITAL GOLF', name: c.name,
        holeCount: c.holes.length, totalPar: totalPar(c.holes), published: true, builtin: true,
        plays: 0, rev: 1, createdAt: ctx.timestamp, updatedAt: ctx.timestamp, ratingSum: 0, ratingCount: 0,
      });
      writeHoles(ctx, inserted.id, c.holes.map(h => ({ ...h, theme: c.theme })));
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const POWER_MULS = [80, 100, 130];
const cleanPowerMul = (v: number) => (POWER_MULS.includes(v) ? v : 100);

function getPlayer(ctx: Ctx): PlayerRow {
  const p = ctx.db.player.identity.find(ctx.sender);
  if (!p) throw new SenderError('No player record; reconnect and try again');
  return p;
}

function lobbyPlayers(ctx: Ctx, lobbyId: bigint): PlayerRow[] {
  const out = [...ctx.db.player.byLobby.filter(lobbyId)];
  out.sort((a, b) => a.seat - b.seat);
  return out;
}

function hasSession(ctx: Ctx, id: Identity): boolean {
  for (const s of ctx.db.session.iter()) if (s.identity.isEqual(id)) return true;
  return false;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function newCode(ctx: Ctx): string {
  for (let attempt = 0; attempt < 32; attempt++) {
    let code = '';
    for (let i = 0; i < 5; i++) code += CODE_ALPHABET[ctx.random.integerInRange(0, CODE_ALPHABET.length - 1)];
    if (!ctx.db.lobby.code.find(code)) return code;
  }
  throw new SenderError('Could not allocate a room code, try again');
}

function freeColor(ctx: Ctx, lobbyId: bigint, preferred: number): number {
  const taken = new Set<number>();
  for (const p of ctx.db.player.byLobby.filter(lobbyId)) taken.add(p.color);
  if (!taken.has(preferred)) return preferred;
  for (let c = 0; c < N_COLORS; c++) if (!taken.has(c)) return c;
  return preferred;
}

function startTicking(ctx: Ctx, lobbyId: bigint) {
  stopTicking(ctx, lobbyId);
  ctx.db.tickTimer.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(TICK_MICROS), lobbyId });
}

function stopTicking(ctx: Ctx, lobbyId: bigint) {
  for (const timer of ctx.db.tickTimer.iter()) {
    if (timer.lobbyId === lobbyId) ctx.db.tickTimer.scheduledId.delete(timer.scheduledId);
  }
}

function deleteLobby(ctx: Ctx, lobbyId: bigint) {
  stopTicking(ctx, lobbyId);
  for (const c of ctx.db.chat.byLobby.filter(lobbyId)) ctx.db.chat.id.delete(c.id);
  ctx.db.lobby.id.delete(lobbyId);
}

/** Put a player's ball on the tee with a clean hole state. */
function ballAtTee(p: PlayerRow, hole: Hole): PlayerRow {
  const g = geomOf(hole);
  return {
    ...p,
    x: hole.tee.x, y: hole.tee.y, z: groundZ(g, hole.tee.x, hole.tee.y), vx: 0, vy: 0, vz: 0,
    teleTicks: 0, resting: true, holed: false, strokes: 0,
    safeX: hole.tee.x, safeY: hole.tee.y, struck: false, finishedTick: 0,
  };
}

function withEvent(p: PlayerRow, kind: number, power = 0): PlayerRow {
  return { ...p, eventKind: kind, eventSeq: p.eventSeq + 1, eventPower: power };
}

/** Remove a player from their room; tear the room down or pass the host. */
function leaveCurrentLobby(ctx: Ctx, player: PlayerRow) {
  if (player.lobbyId === 0n) return;
  const lobbyId = player.lobbyId;
  ctx.db.player.identity.update({ ...player, lobbyId: 0n, offlineTicks: 0 });
  const lobby = ctx.db.lobby.id.find(lobbyId);
  if (!lobby) return;
  const rest = lobbyPlayers(ctx, lobbyId);
  if (rest.length === 0) {
    deleteLobby(ctx, lobbyId);
    return;
  }
  if (lobby.hostId.isEqual(player.identity)) {
    ctx.db.lobby.id.update({ ...lobby, hostId: rest[0].identity });
  }
}

/** Move the room to a hole: everyone on the tee, intro card up. */
function setupHole(ctx: Ctx, lobby: LobbyRow, holeIndex: number): boolean {
  const row = holeRowAt(ctx, lobby.courseId, holeIndex);
  if (!row) return false;
  const hole = parsedHole(row);
  const next: LobbyRow = {
    ...lobby,
    status: L_RUNNING,
    phase: PH_INTRO,
    holeIndex,
    holeId: row.id,
    phaseTicks: ticks(INTRO_SECS),
    holeTick: 0,
  };
  ctx.db.lobby.id.update(next);
  for (const p of lobbyPlayers(ctx, lobby.id)) {
    ctx.db.player.identity.update(withEvent(ballAtTee(p, hole), EV_NONE));
  }
  return true;
}

/** The course vanished (deleted mid-round): end the round where it stands. */
function abortRound(ctx: Ctx, lobby: LobbyRow) {
  const ranked = rankPlayers(lobbyPlayers(ctx, lobby.id));
  ctx.db.lobby.id.update({
    ...lobby, status: L_FINISHED, phase: PH_FINAL, phaseTicks: 0, championName: ranked[0]?.name ?? '',
  });
  recordLegResult(ctx, lobby, ranked);
  stopTicking(ctx, lobby.id);
}

// ---------------------------------------------------------------------------
// Championship legs. The hub (digital-championship) asks the relay to open a
// room here; the room is ordinary in every way except that its result is
// written to `leg_result` for the relay to carry back.
// ---------------------------------------------------------------------------
function requireRelay(ctx: Ctx) {
  if (ctx.senderAuth.jwt?.issuer !== RELAY_ISSUER) throw new SenderError('Not authorized');
}

/** Write the round's finishing order for the hub — once; PLAY AGAIN never rescores. */
function recordLegResult(ctx: Ctx, lobby: LobbyRow, ranked: PlayerRow[]) {
  if (lobby.championshipLeg === 0n) return;
  for (const r of ctx.db.legResult.byLeg.filter(lobby.championshipLeg)) if (r) return;
  ctx.db.legResult.insert({
    id: 0n,
    legId: lobby.championshipLeg,
    placings: ranked.map(p => p.identity),
    names: ranked.map(p => p.name),
    finishedAt: ctx.timestamp,
  });
}

function finishHoleFor(ctx: Ctx, lobby: LobbyRow, p: PlayerRow, score: number, holedNow: boolean): PlayerRow {
  const scores = [...p.holeScores];
  // guard against double-finishing (a timeout landing on a holed player)
  if (scores.length > lobby.holeIndex) return p;
  scores.push(score);
  let row: PlayerRow = {
    ...p, holed: true, resting: true, vx: 0, vy: 0, vz: 0, z: 0, struck: false,
    holeScores: scores, total: p.total + score,
    finishedTick: holedNow ? lobby.holeTick : lobby.holeTick + 1,
  };
  if (holedNow) row = withEvent(row, EV_HOLED, score);
  return row;
}

function rankPlayers(players: PlayerRow[]): PlayerRow[] {
  return [...players].sort((a, b) => {
    if (a.total !== b.total) return a.total - b.total;
    return a.finishedTick - b.finishedTick;
  });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
export const init = spacetimedb.init(ctx => {
  seedBuiltins(ctx);
});

export const onConnect = spacetimedb.clientConnected(ctx => {
  const connId = ctx.connectionId;
  if (connId) ctx.db.session.insert({ connectionId: connId, identity: ctx.sender });
  const existing = ctx.db.player.identity.find(ctx.sender);
  if (!existing) {
    ctx.db.player.insert({
      identity: ctx.sender,
      name: '',
      lobbyId: 0n,
      color: ctx.random.integerInRange(0, N_COLORS - 1),
      seat: 0,
      online: true,
      offlineTicks: 0,
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      teleTicks: 0,
      resting: true,
      holed: false,
      strokes: 0,
      total: 0,
      holeScores: [],
      safeX: 0, safeY: 0,
      struck: false,
      finishedTick: 0,
      shotSeq: 0,
      eventKind: 0,
      eventSeq: 0,
      eventPower: 0,
      emote: 0,
      emoteSeq: 0,
      lastChat: 0n,
      characterId: ctx.random.integerInRange(0, 5),
      ready: false,
      kicked: false,
    });
    return;
  }
  ctx.db.player.identity.update({ ...existing, online: true, offlineTicks: 0 });
});

export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  const connId = ctx.connectionId;
  if (connId) ctx.db.session.connectionId.delete(connId);
  if (hasSession(ctx, ctx.sender)) return; // another tab still holds the seat
  const player = ctx.db.player.identity.find(ctx.sender);
  if (!player) return;
  const offline = { ...player, online: false, offlineTicks: 0 };
  ctx.db.player.identity.update(offline);
  if (player.lobbyId === 0n) return;
  const lobby = ctx.db.lobby.id.find(player.lobbyId);
  // A running round holds the seat for a grace period (the tick reaps it);
  // a room that is still gathering frees it at once — ghosts block joiners.
  if (lobby && lobby.status === L_RUNNING) return;
  leaveCurrentLobby(ctx, offline);
});

// ---------------------------------------------------------------------------
// Menu / room reducers
// ---------------------------------------------------------------------------
export const set_name = spacetimedb.reducer({ name: t.string() }, (ctx, { name }) => {
  const trimmed = name.trim().slice(0, 16);
  if (!trimmed) throw new SenderError('Name cannot be empty');
  const p = getPlayer(ctx);
  ctx.db.player.identity.update({ ...p, name: trimmed });
});

export const set_character = spacetimedb.reducer({ characterId: t.u8() }, (ctx, { characterId }) => {
  if (characterId >= N_CHARACTERS) throw new SenderError('Unknown character');
  const p = getPlayer(ctx);
  ctx.db.player.identity.update({ ...p, characterId });
});

export const set_color = spacetimedb.reducer({ color: t.u8() }, (ctx, { color }) => {
  if (color >= N_COLORS) throw new SenderError('Unknown colour');
  const p = getPlayer(ctx);
  if (p.lobbyId !== 0n) {
    for (const o of ctx.db.player.byLobby.filter(p.lobbyId)) {
      if (o.color === color && !o.identity.isEqual(p.identity)) {
        throw new SenderError(`${o.name || 'Someone'} already has that colour`);
      }
    }
  }
  ctx.db.player.identity.update({ ...p, color });
});

export const create_lobby = spacetimedb.reducer(
  { courseId: t.u64(), isPublic: t.bool(), maxStrokes: t.u8(), holeSecs: t.u16(), collisions: t.bool(), waterPenalty: t.bool(), powerMul: t.u8() },
  (ctx, { courseId, isPublic, maxStrokes, holeSecs, collisions, waterPenalty, powerMul }) => {
    const course = playableCourse(ctx, courseId);
    const p = getPlayer(ctx);
    if (!p.name) throw new SenderError('Pick a name first');
    leaveCurrentLobby(ctx, p);
    const lobby = ctx.db.lobby.insert({
      id: 0n,
      code: newCode(ctx),
      hostId: ctx.sender,
      status: L_OPEN,
      phase: PH_LOBBY,
      courseId,
      courseName: course.name,
      holeCount: course.holeCount,
      holeId: 0n,
      isPublic,
      holeIndex: 0,
      phaseTicks: 0,
      holeTick: 0,
      maxStrokes: maxStrokes ? clamp(maxStrokes, 3, 30) : DEFAULT_MAX_STROKES,
      holeSecs: holeSecs ? clamp(holeSecs, 30, 600) : DEFAULT_HOLE_SECS,
      collisions,
      round: 0,
      championName: '',
      createdAt: ctx.timestamp,
      waterPenalty,
      powerMul: cleanPowerMul(powerMul),
      championshipLeg: 0n,
    });
    const fresh = ctx.db.player.identity.find(ctx.sender)!;
    ctx.db.player.identity.update({
      ...fresh, lobbyId: lobby.id, seat: 0, total: 0, holeScores: [], color: freeColor(ctx, lobby.id, fresh.color), ready: false, kicked: false,
    });
  }
);

/**
 * Open a room for a championship leg. Relay only. The hub picked the code
 * (six letters, so it can never clash with a five-letter one of ours) and
 * the championship host becomes the room host — the same identity here as
 * on the hub, because every game shares one Firebase project. Everyone
 * joins with the code and the host starts the round as usual. `venue` is a
 * course NAME (built-in, or any published course).
 */
export const create_championship_room = spacetimedb.reducer(
  { legId: t.u64(), code: t.string(), venue: t.string(), hostId: t.identity(), players: t.u8() },
  (ctx, { legId, code, venue, hostId, players }) => {
    requireRelay(ctx);
    if (legId === 0n) throw new SenderError('Bad leg id');
    for (const l of ctx.db.lobby.iter()) {
      if (l.championshipLeg === legId) return; // already open — an earlier ack was lost
    }
    const clean = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(clean)) throw new SenderError('Bad room code');
    if (ctx.db.lobby.code.find(clean)) throw new SenderError('Room code already in use');
    const wanted = venue.trim().toLowerCase();
    let course: CourseRow | null = null;
    for (const c of ctx.db.course.iter()) {
      if (!c.published || c.holeCount === 0 || c.name.toLowerCase() !== wanted) continue;
      if (!course || (c.builtin && !course.builtin)) course = c; // a built-in outranks a namesake
    }
    if (!course) throw new SenderError(`No published course called "${venue.trim()}"`);
    void players; // a round holds up to MAX_PLAYERS; nothing to size
    ctx.db.lobby.insert({
      id: 0n,
      code: clean,
      hostId,
      status: L_OPEN,
      phase: PH_LOBBY,
      courseId: course.id,
      courseName: course.name,
      holeCount: course.holeCount,
      holeId: 0n,
      isPublic: false,
      holeIndex: 0,
      phaseTicks: 0,
      holeTick: 0,
      maxStrokes: DEFAULT_MAX_STROKES,
      holeSecs: DEFAULT_HOLE_SECS,
      collisions: true,
      round: 0,
      championName: '',
      createdAt: ctx.timestamp,
      waterPenalty: true,
      powerMul: 100,
      championshipLeg: legId,
    });
  }
);

export const join_lobby = spacetimedb.reducer({ code: t.string() }, (ctx, { code }) => {
  const lobby = ctx.db.lobby.code.find(code.trim().toUpperCase());
  if (!lobby) throw new SenderError('No room with that code');
  const p = getPlayer(ctx);
  if (!p.name) throw new SenderError('Pick a name first');
  if (p.lobbyId === lobby.id) return;
  const members = lobbyPlayers(ctx, lobby.id);
  if (members.length >= MAX_PLAYERS) throw new SenderError('That room is full');
  if (lobby.status === L_FINISHED) throw new SenderError('That round is over');
  leaveCurrentLobby(ctx, p);
  const fresh = ctx.db.player.identity.find(ctx.sender)!;
  const seat = members.length ? members[members.length - 1].seat + 1 : 0;
  let row: PlayerRow = {
    ...fresh, lobbyId: lobby.id, seat, total: 0, holeScores: [], color: freeColor(ctx, lobby.id, fresh.color), ready: false, kicked: false,
  };
  if (lobby.status === L_RUNNING) {
    // Late joiner mid-round: par + 1 for every hole already played keeps the
    // scorecard honest, and the ball drops straight onto the tee.
    const holes = courseHoles(ctx, lobby.courseId);
    const scores: number[] = [];
    let total = 0;
    for (let h = 0; h < lobby.holeIndex; h++) {
      const par = (holes[h]?.par ?? 3) + 1;
      scores.push(par); total += par;
    }
    const hole = currentHole(ctx, lobby);
    if (!hole) throw new SenderError('That room is between holes, try again');
    row = ballAtTee({ ...row, holeScores: scores, total }, hole);
    if (lobby.phase === PH_RESULTS || lobby.phase === PH_FINAL) {
      row = finishHoleFor(ctx, lobby, row, hole.par + 1, false);
    }
  }
  ctx.db.player.identity.update(row);
});

export const leave_lobby = spacetimedb.reducer(ctx => {
  leaveCurrentLobby(ctx, getPlayer(ctx));
});

/** The host throws someone out — in the lobby or mid-round (an AFK seat
 *  otherwise holds every hole open until the clock runs out). */
export const kick_player = spacetimedb.reducer({ target: t.identity() }, (ctx, { target }) => {
  const p = getPlayer(ctx);
  const lobby = ctx.db.lobby.id.find(p.lobbyId);
  if (!lobby) throw new SenderError('Not in a room');
  if (!lobby.hostId.isEqual(ctx.sender)) throw new SenderError('Only the host can remove players');
  if (target.isEqual(ctx.sender)) throw new SenderError('You cannot remove yourself — leave the room instead');
  const victim = ctx.db.player.identity.find(target);
  if (!victim || victim.lobbyId !== lobby.id) throw new SenderError('They are not in this room');
  leaveCurrentLobby(ctx, { ...victim, kicked: true });
});

export const set_settings = spacetimedb.reducer(
  { courseId: t.u64(), isPublic: t.bool(), maxStrokes: t.u8(), holeSecs: t.u16(), collisions: t.bool(), waterPenalty: t.bool(), powerMul: t.u8() },
  (ctx, { courseId, isPublic, maxStrokes, holeSecs, collisions, waterPenalty, powerMul }) => {
    const p = getPlayer(ctx);
    const lobby = ctx.db.lobby.id.find(p.lobbyId);
    if (!lobby) throw new SenderError('Not in a room');
    if (!lobby.hostId.isEqual(ctx.sender)) throw new SenderError('Only the host can change settings');
    if (lobby.status === L_RUNNING) throw new SenderError('Settings lock once the round starts');
    const course = playableCourse(ctx, courseId);
    ctx.db.lobby.id.update({
      ...lobby, courseId, courseName: course.name, holeCount: course.holeCount, isPublic,
      maxStrokes: clamp(maxStrokes, 3, 30),
      holeSecs: clamp(holeSecs, 30, 600),
      collisions,
      waterPenalty,
      powerMul: cleanPowerMul(powerMul),
    });
  }
);

/** Lobby ready-up: the host can only start once everyone online is ready. */
export const set_ready = spacetimedb.reducer({ ready: t.bool() }, (ctx, { ready }) => {
  const p = getPlayer(ctx);
  const lobby = ctx.db.lobby.id.find(p.lobbyId);
  if (!lobby || lobby.status !== L_OPEN) return;
  ctx.db.player.identity.update({ ...p, ready });
});

export const start_game = spacetimedb.reducer(ctx => {
  const p = getPlayer(ctx);
  const lobby = ctx.db.lobby.id.find(p.lobbyId);
  if (!lobby) throw new SenderError('Not in a room');
  if (!lobby.hostId.isEqual(ctx.sender)) throw new SenderError('Only the host can start');
  if (lobby.status === L_RUNNING) throw new SenderError('Already playing');
  const members = lobbyPlayers(ctx, lobby.id);
  const notReady = members.filter(m => m.online && !m.ready);
  if (notReady.length) throw new SenderError(`Not everyone is ready: ${notReady.map(m => m.name || 'someone').join(', ')}`);
  for (const m of members) {
    ctx.db.player.identity.update({ ...m, total: 0, holeScores: [], finishedTick: 0, ready: false });
  }
  const course = playableCourse(ctx, lobby.courseId);
  ctx.db.course.id.update({ ...course, plays: course.plays + 1 });
  const fresh = ctx.db.lobby.id.find(lobby.id)!;
  const started = setupHole(
    ctx,
    { ...fresh, round: fresh.round + 1, championName: '', courseName: course.name, holeCount: course.holeCount },
    0
  );
  if (!started) throw new SenderError('That course has no holes');
  startTicking(ctx, lobby.id);
});

// ---------------------------------------------------------------------------
// Course editor reducers
// ---------------------------------------------------------------------------
export const save_course = spacetimedb.reducer(
  { courseId: t.u64(), name: t.string(), holesJson: t.string() },
  (ctx, { courseId, name, holesJson }) => {
    const p = getPlayer(ctx);
    const cleanName = cleanCourseName(name);
    if (holesJson.length > LIMITS.holeBytes * LIMITS.holesPerCourse) throw new SenderError('Course data too large');
    let rawHoles: unknown;
    try { rawHoles = JSON.parse(holesJson); } catch { throw new SenderError('Course data is not valid JSON'); }
    if (!Array.isArray(rawHoles)) throw new SenderError('Course data must be a list of holes');
    if (rawHoles.length > LIMITS.holesPerCourse) throw new SenderError(`At most ${LIMITS.holesPerCourse} holes`);
    const holes: Hole[] = [];
    try {
      rawHoles.forEach((raw, i) => {
        const json = JSON.stringify(raw);
        if (json.length > LIMITS.holeBytes) throw new Error(`hole ${i + 1} is too detailed`);
        holes.push(parseHole(json));
      });
    } catch (e) {
      throw new SenderError(`Hole rejected: ${(e as Error).message}`);
    }
    if (courseId === 0n) {
      const inserted = ctx.db.course.insert({
        id: 0n, ownerId: ctx.sender, authorName: p.name || 'ANON', name: cleanName,
        holeCount: holes.length, totalPar: totalPar(holes), published: false, builtin: false,
        plays: 0, rev: 1, createdAt: ctx.timestamp, updatedAt: ctx.timestamp, ratingSum: 0, ratingCount: 0,
      });
      writeHoles(ctx, inserted.id, holes);
      return;
    }
    const course = ctx.db.course.id.find(courseId);
    if (!course) throw new SenderError('That course no longer exists');
    if (!course.ownerId.isEqual(ctx.sender)) throw new SenderError('Only the author can edit this course');
    if (course.builtin) throw new SenderError('Built-in courses are read-only — duplicate it instead');
    ctx.db.course.id.update({
      ...course, name: cleanName, authorName: p.name || course.authorName,
      holeCount: holes.length, totalPar: totalPar(holes), rev: course.rev + 1, updatedAt: ctx.timestamp,
      // an edit to a published course with no holes left unpublishes it
      published: course.published && holes.length > 0,
    });
    writeHoles(ctx, course.id, holes);
    // rooms sitting on this course in their lobby pick up the new shape
    for (const l of ctx.db.lobby.iter()) {
      if (l.courseId === course.id && l.status === L_OPEN) {
        ctx.db.lobby.id.update({ ...l, courseName: cleanName, holeCount: holes.length });
      }
    }
  }
);

export const publish_course = spacetimedb.reducer(
  { courseId: t.u64(), published: t.bool() },
  (ctx, { courseId, published }) => {
    const course = ctx.db.course.id.find(courseId);
    if (!course) throw new SenderError('That course no longer exists');
    if (!course.ownerId.isEqual(ctx.sender)) throw new SenderError('Only the author can publish this course');
    if (course.builtin) throw new SenderError('Built-in courses are always published');
    if (published && course.holeCount === 0) throw new SenderError('Add a hole before publishing');
    ctx.db.course.id.update({ ...course, published, updatedAt: ctx.timestamp });
  }
);

export const delete_course = spacetimedb.reducer({ courseId: t.u64() }, (ctx, { courseId }) => {
  const course = ctx.db.course.id.find(courseId);
  if (!course) return;
  if (!course.ownerId.isEqual(ctx.sender)) throw new SenderError('Only the author can delete this course');
  if (course.builtin) throw new SenderError('Built-in courses cannot be deleted');
  for (const h of ctx.db.hole.byCourse.filter(courseId)) ctx.db.hole.id.delete(h.id);
  for (const r of ctx.db.rating.byCourse.filter(courseId)) ctx.db.rating.id.delete(r.id);
  ctx.db.course.id.delete(courseId);
});

/** Re-sync the built-in courses from code (after a module update). Idempotent. */
/**
 * Rate a published course 1–5 stars. Only players who have played it may
 * rate: the sender is in a room on that course past the lobby (mid-round or
 * at the final scoreboard), or has rated it before (proof of an earlier
 * round — a rating can always be revised). Authors cannot rate their own.
 */
export const rate_course = spacetimedb.reducer(
  { courseId: t.u64(), stars: t.u8() },
  (ctx, { courseId, stars }) => {
    if (stars < 1 || stars > MAX_STARS) throw new SenderError(`Rate 1 to ${MAX_STARS} stars`);
    const course = ctx.db.course.id.find(courseId);
    if (!course || !course.published) throw new SenderError('That course is not published');
    if (course.ownerId.isEqual(ctx.sender)) throw new SenderError('You cannot rate your own course');
    let mine: RatingRow | undefined;
    for (const r of ctx.db.rating.byPlayer.filter(ctx.sender)) if (r.courseId === courseId) { mine = r; break; }
    if (!mine) {
      const p = getPlayer(ctx);
      const lobby = p.lobbyId ? ctx.db.lobby.id.find(p.lobbyId) : undefined;
      if (!lobby || lobby.courseId !== courseId || lobby.status === L_OPEN) throw new SenderError('Play the course before rating it');
    }
    if (mine) {
      if (mine.stars === stars) return;
      ctx.db.rating.id.update({ ...mine, stars, updatedAt: ctx.timestamp });
      ctx.db.course.id.update({ ...course, ratingSum: course.ratingSum - mine.stars + stars });
    } else {
      ctx.db.rating.insert({ id: 0n, courseId, identity: ctx.sender, stars, updatedAt: ctx.timestamp });
      ctx.db.course.id.update({ ...course, ratingSum: course.ratingSum + stars, ratingCount: course.ratingCount + 1 });
    }
  }
);

export const seed_builtins = spacetimedb.reducer(ctx => {
  seedBuiltins(ctx);
});

export const play_again = spacetimedb.reducer(ctx => {
  const p = getPlayer(ctx);
  const lobby = ctx.db.lobby.id.find(p.lobbyId);
  if (!lobby) throw new SenderError('Not in a room');
  if (!lobby.hostId.isEqual(ctx.sender)) throw new SenderError('Only the host can restart');
  if (lobby.status !== L_FINISHED) throw new SenderError('The round is still going');
  ctx.db.lobby.id.update({ ...lobby, status: L_OPEN, phase: PH_LOBBY, holeIndex: 0, holeTick: 0, phaseTicks: 0 });
  for (const m of lobbyPlayers(ctx, lobby.id)) {
    ctx.db.player.identity.update({ ...m, total: 0, holeScores: [], holed: false, strokes: 0, finishedTick: 0, ready: false });
  }
});

// Lag compensation: the client says which hole tick it released on (the
// moment it SAW), and the shot is applied then — the ball is fast-forwarded
// through the ticks that passed while the shot was in flight to the server,
// against the movers as they were. Bounded, so nobody rewinds far.
const REWIND_MAX_TICKS = 12;

export const shoot = spacetimedb.reducer(
  { angle: t.f32(), power: t.f32(), atTick: t.u32() },
  (ctx, { angle, power, atTick }) => {
    const p = getPlayer(ctx);
    const lobby = ctx.db.lobby.id.find(p.lobbyId);
    if (!lobby || lobby.status !== L_RUNNING || lobby.phase !== PH_PLAY) return;
    if (p.holed || !p.resting) return;
    if (p.strokes >= lobby.maxStrokes) return;
    if (!Number.isFinite(angle) || !Number.isFinite(power)) throw new SenderError('Bad shot');
    const pw = clamp(power, 0.02, 1);
    const hole = currentHole(ctx, lobby);
    const geom = hole ? geomOf(hole) : null;
    const v = geom ? shotFrom(geom, p.x, p.y, angle, pw, lobby.powerMul / 100) : { ...shotVelocity(angle, pw, lobby.powerMul / 100), vz: 0 };
    // a lofted (cannon) shot leaves the felt at once
    const b: BallState = { x: p.x, y: p.y, z: v.vz > 0 ? p.z + 0.01 : p.z, vx: v.vx, vy: v.vy, vz: v.vz, teleTicks: 0 };
    // catch the ball up from the tick the player released on to now, stopping
    // short of any step that would hole / drown / warp it — the next real
    // tick will take that step for real, with all its bookkeeping
    const from = clamp(atTick, Math.max(0, lobby.holeTick - REWIND_MAX_TICKS), lobby.holeTick);
    if (geom && from < lobby.holeTick) {
      for (let tick = from + 1; tick <= lobby.holeTick; tick++) {
        const trial: BallState = { ...b };
        const ev = newEvents();
        stepBall(trial, geom, tick / TICK_HZ, ev);
        if (ev.holed || ev.water || ev.oob || ev.tele) break;
        Object.assign(b, trial);
      }
    }
    ctx.db.player.identity.update(
      withEvent(
        {
          ...p, x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, teleTicks: b.teleTicks,
          resting: false, struck: true,
          strokes: p.strokes + 1, safeX: p.x, safeY: p.y, shotSeq: p.shotSeq + 1,
        },
        EV_SHOT, pw
      )
    );
  }
);

/** Put the ball somewhere still, keeping the stroke count. Costs nothing but
 *  the strokes already spent — a retry, not a refund. `manual` (eventPower
 *  1) lets the client word it differently from a water reset. */
function placeBall(ctx: Ctx, p: PlayerRow, hole: Hole, x: number, y: number) {
  // on the felt there — up on a platform or a ramp, not buried under it
  const z = groundZ(geomOf(hole), x, y);
  ctx.db.player.identity.update(
    withEvent({ ...p, x, y, z, vx: 0, vy: 0, vz: 0, teleTicks: 0, resting: true, struck: false, safeX: x, safeY: y }, EV_RESET, 1)
  );
}

/** R: back to the tee. */
export const reset_ball = spacetimedb.reducer(ctx => {
  const p = getPlayer(ctx);
  const lobby = ctx.db.lobby.id.find(p.lobbyId);
  if (!lobby || lobby.status !== L_RUNNING || lobby.phase !== PH_PLAY || p.holed) return;
  const hole = currentHole(ctx, lobby);
  if (!hole) return;
  placeBall(ctx, p, hole, hole.tee.x, hole.tee.y);
});

/** F: back to where the last shot was played from. */
export const undo_shot = spacetimedb.reducer(ctx => {
  const p = getPlayer(ctx);
  const lobby = ctx.db.lobby.id.find(p.lobbyId);
  if (!lobby || lobby.status !== L_RUNNING || lobby.phase !== PH_PLAY || p.holed) return;
  const hole = currentHole(ctx, lobby);
  if (!hole) return;
  placeBall(ctx, p, hole, p.safeX, p.safeY);
});

export const send_chat = spacetimedb.reducer({ text: t.string() }, (ctx, { text }) => {
  const msg = text.trim().slice(0, 140);
  if (!msg) return;
  const p = getPlayer(ctx);
  if (p.lobbyId === 0n) throw new SenderError('Join a room to chat');
  const now = ctx.timestamp.microsSinceUnixEpoch;
  if (now - p.lastChat < CHAT_MIN_GAP_MICROS) return;
  ctx.db.player.identity.update({ ...p, lastChat: now });
  ctx.db.chat.insert({
    id: 0n, lobbyId: p.lobbyId, identity: ctx.sender, name: p.name, color: p.color, text: msg, createdAt: ctx.timestamp,
  });
  // keep the room's log short
  const rows = [...ctx.db.chat.byLobby.filter(p.lobbyId)];
  if (rows.length > 60) {
    rows.sort((a, b) => (a.id < b.id ? -1 : 1));
    for (let i = 0; i < rows.length - 60; i++) ctx.db.chat.id.delete(rows[i].id);
  }
});

export const send_emote = spacetimedb.reducer({ index: t.u8() }, (ctx, { index }) => {
  const p = getPlayer(ctx);
  if (p.lobbyId === 0n) return;
  ctx.db.player.identity.update({ ...p, emote: index, emoteSeq: p.emoteSeq + 1 });
});

// ---------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------
export const game_tick = spacetimedb.reducer(
  { onSchedule: TickTimer },
  { arg: TickTimer.rowType },
  (ctx, { arg }) => {
    const lobby = ctx.db.lobby.id.find(arg.lobbyId);
    if (!lobby || lobby.status !== L_RUNNING) {
      ctx.db.tickTimer.scheduledId.delete(arg.scheduledId);
      return;
    }
    let players = lobbyPlayers(ctx, lobby.id);

    // Reap seats whose player has been gone too long.
    const graceTicks = ticks(OFFLINE_GRACE_SECS);
    let anyLeft = false;
    for (const p of players) {
      if (p.online) continue;
      if (p.offlineTicks + 1 >= graceTicks) {
        leaveCurrentLobby(ctx, p);
        anyLeft = true;
      } else {
        ctx.db.player.identity.update({ ...p, offlineTicks: p.offlineTicks + 1 });
      }
    }
    if (anyLeft) {
      if (!ctx.db.lobby.id.find(lobby.id)) return; // the room emptied out
      players = lobbyPlayers(ctx, lobby.id);
    }
    if (players.length === 0) {
      deleteLobby(ctx, lobby.id);
      return;
    }
    const cur = ctx.db.lobby.id.find(lobby.id)!; // host may have changed above

    switch (cur.phase) {
      case PH_INTRO: {
        if (cur.phaseTicks > 1) {
          ctx.db.lobby.id.update({ ...cur, phaseTicks: cur.phaseTicks - 1 });
        } else {
          ctx.db.lobby.id.update({ ...cur, phase: PH_PLAY, phaseTicks: ticks(cur.holeSecs), holeTick: 0 });
        }
        return;
      }
      case PH_PLAY: {
        tickPlay(ctx, cur, players);
        return;
      }
      case PH_RESULTS: {
        if (cur.phaseTicks > 1) {
          ctx.db.lobby.id.update({ ...cur, phaseTicks: cur.phaseTicks - 1 });
          return;
        }
        if (cur.holeIndex + 1 < cur.holeCount && setupHole(ctx, cur, cur.holeIndex + 1)) {
          // next hole is up
        } else {
          const ranked = rankPlayers(lobbyPlayers(ctx, cur.id));
          ctx.db.lobby.id.update({
            ...cur, status: L_FINISHED, phase: PH_FINAL, phaseTicks: 0, championName: ranked[0]?.name ?? '',
          });
          recordLegResult(ctx, cur, ranked);
          ctx.db.tickTimer.scheduledId.delete(arg.scheduledId);
        }
        return;
      }
      default:
        ctx.db.tickTimer.scheduledId.delete(arg.scheduledId);
    }
  }
);

function tickPlay(ctx: Ctx, lobby: LobbyRow, players: PlayerRow[]) {
  const holeTick = lobby.holeTick + 1;
  const t = holeTick / TICK_HZ;
  const hole = currentHole(ctx, lobby);
  if (!hole) { abortRound(ctx, lobby); return; }
  const geom = geomOf(hole);
  const timeUp = lobby.phaseTicks <= 1;

  // 1. step every live ball
  const balls: (BallState | null)[] = [];
  const events: StepEvents[] = [];
  for (const p of players) {
    if (p.holed) { balls.push(null); events.push(newEvents()); continue; }
    const b: BallState = { x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, teleTicks: p.teleTicks };
    const ev = newEvents();
    stepBall(b, geom, t, ev);
    balls.push(b);
    events.push(ev);
  }
  // 2. ball-vs-ball (balls still sitting on the tee are ghosts)
  if (lobby.collisions) {
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (!a || players[i].strokes === 0) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (!b || players[j].strokes === 0) continue;
        if (collideBalls(a, b)) {
          const imp = Math.hypot(a.vx - b.vx, a.vy - b.vy);
          if (imp > events[i].wall) events[i].wall = imp;
          if (imp > events[j].wall) events[j].wall = imp;
        }
      }
    }
  }
  // 3. write back, resolving events
  let allDone = true;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const b = balls[i];
    if (!b) continue;
    const ev = events[i];
    let row: PlayerRow = { ...p, x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, teleTicks: b.teleTicks };
    if (ev.holed) {
      row = finishHoleFor(ctx, { ...lobby, holeTick }, row, row.strokes, true);
    } else if (ev.water || ev.oob) {
      const penalty = ev.water && row.struck && lobby.waterPenalty ? 1 : 0;
      row = withEvent(
        {
          ...row, x: row.safeX, y: row.safeY, z: groundZ(geom, row.safeX, row.safeY), vx: 0, vy: 0, vz: 0, teleTicks: 0,
          resting: true, struck: false, strokes: row.strokes + penalty,
        },
        ev.water ? EV_WATER : EV_RESET
      );
    } else {
      let resting = restingOn(geom, b);
      if (!resting) {
        const clock = ctx.db.rollClock.identity.find(p.identity);
        const rolled = (clock?.ticks ?? 0) + 1;
        const grounded = b.z <= groundZ(geom, b.x, b.y, b.z) + 0.001;
        if (rolled > ROLL_LIMIT_SECS * TICK_HZ && grounded) {
          // still going after all this time: call it stopped
          row.vx = 0; row.vy = 0; row.vz = 0; row.z = groundZ(geom, b.x, b.y, b.z);
          resting = true;
        } else if (clock) ctx.db.rollClock.identity.update({ ...clock, ticks: rolled });
        else ctx.db.rollClock.insert({ identity: p.identity, ticks: rolled });
      }
      if (resting) {
        const clock = ctx.db.rollClock.identity.find(p.identity);
        if (clock) ctx.db.rollClock.identity.delete(p.identity);
      }
      row.resting = resting;
      if (resting) row.struck = false;
      if (ev.tele) row = withEvent(row, EV_TELE);
      else if (ev.bumper) row = withEvent(row, EV_BUMPER);
      else if (ev.jump) row = withEvent(row, EV_JUMP);
      else if (ev.wall > 2.5) row = withEvent(row, EV_WALL, ev.wall);
      else if (ev.land) row = withEvent(row, EV_LAND);
      else if (ev.boost && p.eventKind !== EV_BOOST) row = withEvent(row, EV_BOOST);
    }
    // out of strokes and stopped: the hole is over for them
    if (!row.holed && row.resting && row.strokes >= lobby.maxStrokes) {
      row = finishHoleFor(ctx, { ...lobby, holeTick }, row, lobby.maxStrokes + 1, false);
    }
    if (timeUp && !row.holed) {
      row = finishHoleFor(ctx, { ...lobby, holeTick }, row, lobby.maxStrokes + 1, false);
    }
    if (!row.holed) allDone = false;
    ctx.db.player.identity.update(row);
  }
  if (allDone || timeUp) {
    ctx.db.lobby.id.update({ ...lobby, phase: PH_RESULTS, phaseTicks: ticks(RESULTS_SECS), holeTick });
  } else {
    ctx.db.lobby.id.update({ ...lobby, phaseTicks: lobby.phaseTicks - 1, holeTick });
  }
}
