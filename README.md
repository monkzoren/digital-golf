# Digital Golf

A Golf It-style online minigolf arcade game for the browser, built on the
[Digital Tennis](https://github.com/monkzoren/digital-tennis) framework —
and it looks like it: the same Virtua Tennis-style stadium (crowd, sponsor
hoardings, jumbotron, floodlights), the same 18-character roster rendered as
real 3D rigs (now holding putters), the same behind-the-player camera and
the same navy-and-gold broadcast UI. SpacetimeDB is the entire backend —
rooms, the authoritative 30 Hz ball simulation, scoring, chat and the
course library all live in one SpacetimeDB module. The client is a Vite +
TypeScript three.js game with a built-in course editor.

## What it plays like

- **Everyone shoots at once.** Up to 32 players per room, no turns. Press,
  pull back and release to putt (or hold ←/→ to aim, Shift for fine, and
  hold Space for power). The arrow shows direction and power only — no
  bounce preview, reading the walls is the skill. Balls collide with each
  other — bump a rival off the line, or get bumped. A ball a moving block
  squeezes into a wall is reset, never left stuck.
- **Real hazards.** Bouncy walls, pinball bumpers, posts, sand, ice, water
  (+1 stroke and back you go), real ramps (a wedge you roll up, drop off the
  top of and bounce off the back of), boost pads, jump pads that launch the
  ball over low walls and water, teleporters, spinning windmills and sliding
  doors. The cup pulls slow balls in and skips fast ones.
- **The toy box.** Conveyor belts, spinners (turntables that fling the
  ball), blower fans that float it across water, trampolines that bounce a
  falling ball back up, magnets that pull (or, negative, push), cannons that
  fire the ball in a fixed arc, pendulums, blinking laser gates, rubber
  walls that return the ball harder than it arrived, and per-hole gravity
  (moon holes). Every piece has its own hole on the built-in *Toy Box*
  course — duplicate it in the editor to see how each one is set up.
- **Rounds, not holes.** A room plays a whole course: intro card, timed hole,
  scorecard, next hole, podium. Round options: max strokes, time per hole,
  ball collisions on/off, water penalty (+1 stroke or a free reset), shot
  power (soft / normal / turbo). The host can change them in the lobby.
  Late joiners drop straight onto the tee. Refreshing mid-round keeps your
  seat for 25 s.
- **Nine built-in courses, 81 holes.** Sunny Park (the tutorial), Neon
  Orbit and Toy Box (one hole per gadget) show the pieces off; the launch
  library — Bank Shot Alley, Clockwork, Ramp Ridge, Machine Works, Frost &
  Flame and the championship Grand Tour — is built around **hidden
  holes-in-one**: every hole has an ace line, verified with the real
  physics, that is never the obvious one (a carom, a timed gap, a launch,
  a gadget chain) and is narrow enough to be a feat. Plus **unlimited
  player-made courses.**
- **Course editor.** Draw floors, walls, movers, surfaces and hazards on a
  grid, tweak every parameter in a properties panel, undo/redo, duplicate,
  import/export JSON, **test-play on the real 3D stage with the exact
  physics the server runs**, save drafts, publish to everyone. Built-in courses can be duplicated as a
  starting point. Published courses appear under *Community* when creating a
  room, sorted by plays.
- **The tennis presentation, one to one.** Menu → SELECT A GOLFER (live
  animated 3D previews on every card) → SELECT A COURSE → lobby → play,
  with the broadcast wipe between screens, HUD plates, gold toasts for
  birdies and holes-in-one, name tags and emote pops over the balls, the
  settings panel (resolution, shadows, anti-aliasing, ambient occlusion,
  bloom, particles, crowd detail, film grade, VHS, FPS cap) and the 4:3
  stage. Every hole is built as meshes on the arena floor: felt slabs,
  wooden walls, extruded blocks, textured hazards, spinning windmills,
  sliding doors, the cup with its flag.
- **Physically based rendering.** Every surface is a PBR material lit by
  the sun and a prefiltered sky (image-based lighting): felt with a pile,
  oak-grain walls with rounded edges, lacquered dimpled balls, rippling
  reflective water, glossy ice. The frame goes through a post chain —
  ground-truth ambient occlusion, bloom on the over-bright emitters,
  filmic tone mapping, SMAA — with a shadow map fitted to the hole. All
  textures are painted procedurally at start-up; there are no art assets
  to download.
- Public room browser, live-now list, invite links (`?lobby=CODE`), room
  chat, emotes, scorecard, fullscreen, synthesized SFX (no assets).

## How it works

```
client/  (Vite + TS, three.js)           spacetimedb/  (TypeScript module)
┌──────────────────────────────┐         ┌─────────────────────────────────┐
│ send intent:                 │ ──────► │ tables: lobby, player, chat,    │
│   shoot(angle, power)        │reducers │   course, hole (+ my_courses)   │
│   save_course(json) …        │         │ reducers: create/join/leave,    │
│ render from subscriptions:   │ ◄────── │   shoot, settings, save/publish │
│   lobby / player / hole rows │  subs   │ game_tick (scheduled, 30 Hz):   │
│ + interpolation; the editor  │         │   ball physics, collisions,     │
│   test-plays w/ SHARED physics│         │   hazards, cup, phases, scores  │
└──────────────────────────────┘         └─────────────────────────────────┘
                      spacetimedb/src/shared/  ← imported by BOTH
                      courses.ts (types, geometry, built-ins)
                      physics.ts (the simulation)   mapformat.ts (validation)
```

- **Server-authoritative:** the client only sends a shot's angle and power.
  The scheduled `game_tick` reducer moves every ball, resolves walls,
  bumpers, movers, zones and ball-ball hits, detects the cup, applies
  penalties, caps strokes, runs the hole timer and phases. No client can
  cheat.
- **One physics, two uses:** `shared/physics.ts` is bundled into the
  module *and* the client. The server simulates with it and the editor's
  test mode plays with it, so what you test is what you get. There is no
  trajectory preview in play — the aim arrow shows direction and power,
  reading the bounces is your skill.
- **Courses are data.** A `course` row is metadata; each hole is a `hole` row
  holding a validated JSON document (`shared/mapformat.ts` is the schema and
  the validator, used by both ends). Clients subscribe only to the holes of
  the course they are playing or editing, so the library can grow without
  bloating anyone's initial sync. Built-ins are seeded from
  `shared/courses.ts` on init and re-synced on every publish
  (`seed_builtins`); they are read-only, everything else belongs to its
  author (private drafts via the `my_courses` view, published courses
  listed for all).
- **Identity:** anonymous SpacetimeDB identities kept in `localStorage`
  (`dg_token`). There are no accounts yet — see *Next steps*.

## Designing holes

`spacetimedb/scripts/course-check.ts` plays every built-in hole with the
shared physics: it sweeps angle × power (× shot timing when things move)
for hole-in-one lines and measures how wide the window is, then plays the
hole greedily to make sure it finishes near par and never soft-locks.

```bash
cd spacetimedb && npm run check-courses            # every course
npm run check-courses -- "Bank"                     # one course
VERBOSE=1 npm run check-courses -- "Grand"          # print the ace lines
```

A library hole passes when an ace exists, spans at least a few fine-grid
cells (humanly hittable), covers under ~4.5% of random shots (hidden), and
the greedy player finishes within par + 1. Ramps are wedges: enter them
from the low edge — a ramp met side-on or from its top is a step the ball
bounces off.

## Run it locally

Prerequisites: Node 22+, the [SpacetimeDB CLI](https://spacetimedb.com/install) 2.8+.

```bash
spacetime start                              # local server on :3000
cd spacetimedb && npm install && cd ..
spacetime publish digital-golf --module-path spacetimedb -y
cd client && npm install && npm run dev      # http://localhost:5173
```

After editing the module:

```bash
spacetime publish digital-golf --module-path spacetimedb -y
spacetime generate --lang typescript --out-dir client/src/module_bindings --module-path spacetimedb -y
```

Two browser tabs share one identity (one player). For local multiplayer
use two browser profiles or an incognito window.

## Self-hosting (Docker)

```bash
cp .env.example .env
docker compose up -d --build
```

Three services: `spacetimedb` (data in a volume, JWT keys inside it so
redeploys never re-key), `module-publisher` (mints a deterministic owner
identity from the server key, publishes, re-seeds built-ins, idles) and
`client` (nginx serving the bundle and proxying `/v1` same-origin). Point a
domain / TLS proxy at the client's port and you're done. See
`spacetimedb/publish.sh` for what happens on a breaking schema change
(`ALLOW_CLEAR=1` wipes the database — player-made courses included).

## Course format

A hole is a JSON object (`shared/courses.ts` `Hole`): `name`, `par`, `tee`,
`cup`, `floor` (a union of axis-aligned rects — every boundary edge is a
wall, touching rects join up), optional `blocks` (polygons, optional `h` for
jumpable low walls, optional `motion` rotate/slide), `zones` (sand · ice ·
water · slope · boost · jump · tele rects), `bumpers` (round; `kick` > 0
makes them pinball bumpers), `tip`, `theme`. Limits and normalisation are in
`shared/mapformat.ts`. The editor's *Export* copies a whole course as JSON;
*Import* accepts a course or a single hole.

## Next steps

- Accounts and persistent stats (the tennis framework's Firebase +
  `profiles` sidecar port over directly).
- Course ratings and a featured rotation; thumbnails in the picker.
- Spectating.
- More obstacle types (ramps with real height, portals with direction,
  fans, conveyor belts) — each is one `Zone`/`Block` kind in the shared
  physics plus a renderer and an editor tool.
