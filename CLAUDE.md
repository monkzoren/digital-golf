# Digital Golf — project notes

Golf It-style online minigolf built on the Digital Tennis framework. See
README.md for architecture and run instructions. Key facts:

- `spacetimedb/src/index.ts` — the module: schema + reducers + the 30 Hz
  `game_tick` scheduled reducer (server-authoritative ball physics, hole
  phases, scoring). `spacetimedb/src/shared/` is imported by BOTH the module
  and the client (`@shared/*` alias in the client): `courses.ts` (types,
  geometry helpers, built-in courses), `physics.ts` (the simulation),
  `mapformat.ts` (hole JSON validation/limits). Keep them pure — no
  SpacetimeDB, DOM, timers or randomness. The ball's `z` is ABSOLUTE height:
  slope zones are real wedges (`groundZ`/`rampRise`), so "on the ground"
  means `z <= groundZ(x, y, z)`; use `restingOn(geom, ball)` not `isResting`.
  Nothing collides that is not drawn: every wall is exactly as tall in the
  physics as on screen (`WALL_H` = 1.1 for floor rails and blocks without
  `h`; bumpers/posts/hubs have their drawn heights), a ball above a wall
  flies over it, a wall block's top is ground (the ball lands and rolls on
  it), floor rails ride the felt (they climb a wedge with it — render3d
  splits and pitches them), and a ball rolling off the top of a wedge is
  launched with the slope's vertical share of its pace.
  Every zone kind (the toy box: conveyor, spinner, fan, trampoline, magnet,
  cannon), block motion (rotate/slide/swing/blink) and block `bounce` must
  be handled in physics.ts, mapformat.ts, render.ts (2D), render3d.ts (3D)
  and editor.ts (tool + props); `TOYBOX` in courses.ts has one hole per piece.
- `spacetimedb/src/shared/library.ts` holds the launch courses (six, all
  designed around hidden holes-in-one); `spacetimedb/scripts/course-check.ts`
  (`npm run check-courses` in spacetimedb/) verifies every built-in hole
  with the real physics: ace exists, is narrow (< 4.5% of shots) and
  hittable, greedy play finishes within par + 1, a ±3° "decent player"
  averages about par, the ball travels ≥ 55/75/95 units for par 3/4/5, no
  shot rolls for ever. MAX_SHOT is 30 (≈ 87 units of roll on green): a hole
  should take several shots. Cannons LOAD a ball that rolls in; the next
  shot uses `shotFrom` (lofted). The `shoot` reducer takes `atTick` and
  rewinds ≤ 12 ticks (lag compensation).
  Run it after touching physics or courses. The module's private
  `roll_clock` table stops any ball still rolling after 15 s (pinball
  loops) — a safety net, not a design tool.
- `client/src/main.ts` owns connection, screens (tennis-style overlays +
  wipe), room, game loop, HUD. `aim.ts` is the drag-to-putt reading (screen-space
  pull through a camera basis frozen at pointer-down) shared with the
  editor's test mode, which hides `#editor` and plays on the game stage via
  `render3d.drawScene`. There is deliberately no shot-path preview. Shots are
  predicted client-side (`predicted` in main.ts steps the shared physics from
  release until the server row with that `shotSeq` arrives) so the swing and
  launch are instant on timing holes. The course picker is a keyed list
  (rows updated in place, thumbnails subscribed as they scroll into view via
  IntersectionObserver) beside a detail pane; it must never rebuild on a
  hole-row insert. `render3d.ts` is the three.js renderer
  copied from Digital Tennis and adapted: rigs/body builder/previews are
  the tennis code (the stadium bowl, crowd and umpire are gone — holes sit
  on an open lawn so any course size fits; fog and the shadow frustum scale
  with the hole bounds in `fitShadowFrustum`); `setHole` builds a hole
  as meshes, `drawScene` takes a `GolfScene`. Free look (`orbitLook`,
  `zoomLook`) is an offset over the automatic camera, driven by
  `freelook.ts`. Rendering is PBR: every
  material goes through `std`/`metal`/`gloss` (MeshStandardMaterial) or
  MeshPhysicalMaterial (balls), lit by the sun plus a PMREM sky
  (`makeEnvironment`, one per WebGL context — the character previews make
  their own). Surface detail (felt pile, oak grain, dimples, ripples) is
  painted procedurally in `surfaces()`; zones clone the tiling normal maps
  so each can set its own repeat. Water zones are real ponds: `carvedFloor` cuts
  them out of the felt slabs (keeping felt under any other zone laid over
  the pond), `pondMesh` adds a back-faced basin with a pebble bed and a
  translucent rippling surface just below felt level. Frames go through an EffectComposer
  (`buildComposer`: RenderPass → GTAO → UnrealBloom → OutputPass → SMAA);
  MSAA lives on the composer's render target, so changing anti-aliasing
  rebuilds the composer, not the WebGL context. Bloom only catches colours
  brighter than 1.35 in linear light — emitters (lasers, portals, the aim
  arrow, floodlights) use over-bright `THREE.Color` values on purpose. The
  sun's shadow frustum is fitted to the hole bounds (`fitShadowFrustum`).
  `graphics.ts` owns the knobs (`ao`, `bloom` are the post-chain ones). Golf world (x, y-down, z-up)
  maps to three as `(x - cx, FLOOR_Y + z, y - cy)` with the hole centred.
  `render.ts` is the 2D top-down renderer (editor + course thumbnails).
  `characters.ts` and `graphics.ts` are copied from tennis — keep the
  roster order in sync with `N_CHARACTERS` in the module.
- `index.html` carries the ENTIRE Digital Tennis stylesheet plus a golf
  block at the end; reuse its classes (`.overlay`, `.menu-card`,
  `.sel-card`, `.plate`, `.gfx-card`, …) rather than adding new ones.
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
