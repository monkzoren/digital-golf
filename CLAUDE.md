# Digital Golf — project notes

Golf It-style online minigolf built on the Digital Tennis framework. See
README.md for architecture and run instructions. Key facts:

- `spacetimedb/src/index.ts` — the module: schema + reducers + the 30 Hz
  `game_tick` scheduled reducer (server-authoritative ball physics, hole
  phases, scoring). `spacetimedb/src/shared/` is imported by BOTH the module
  and the client (`@shared/*` alias in the client): `courses.ts` (types,
  geometry helpers, built-in courses), `physics.ts` (the simulation),
  `mapformat.ts` (hole JSON validation/limits). Keep them pure — no
  SpacetimeDB, DOM, timers or randomness.
- `client/src/main.ts` owns connection, menus, room, game loop, HUD.
  `render.ts` draws holes/balls/effects (shared by game + editor).
  `editor.ts` is the course editor (local test mode uses `stepBall`).
- After editing the module: `spacetime publish digital-golf --module-path
  spacetimedb -y`, then `spacetime generate --lang typescript --out-dir
  client/src/module_bindings --module-path spacetimedb -y`. Never hand-edit
  bindings.
- Courses live in the DB: `course` (metadata) + `hole` (one JSON row per
  hole). Clients subscribe per course (`SELECT * FROM hole WHERE course_id =
  N`); drafts are visible through the `my_courses` view. Built-ins are
  seeded from `shared/courses.ts` in `init` and re-synced by the
  `seed_builtins` reducer (publish.sh calls it).
- Hole rows are immutable (a save replaces them), so the module caches
  parsed holes by row id; the client caches by row id too. `geomOf(hole)` is
  a WeakMap on the Hole object — the editor mutates holes in place and must
  call `invalidateGeom`.
- Table columns are append-only (SpacetimeDB auto-migrates appended columns
  with defaults only). `publish.sh` refuses `--clear-database` without
  `ALLOW_CLEAR=1`; a wipe loses player-made courses.
- The module entrypoint may ONLY export SpacetimeDB constructs (reducers,
  views, lifecycle hooks, the schema default) — exporting plain constants
  breaks publish; that is why constants like `TICK_HZ` live in `shared/`.
- Reducer promises reject with `SenderError` messages on the client; call
  them through `rd()` in `main.ts` so rejections become toasts.
- Local server is `spacetime start`; DB name `digital-golf`.
