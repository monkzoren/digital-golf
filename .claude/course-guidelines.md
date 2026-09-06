# Course design guidelines

How to build a built-in course for Digital Golf that plays well AND passes
`npm run check-courses`. Read this before touching `shared/library.ts`,
any file under `shared/library/` or adding a course file. Everything here was learned
the hard way while building the expansion set (Highland Terraces, Rooftops,
Millpond, Pinball Palace, Asteroid Belt, Crossroads).

## Where things live

- `spacetimedb/src/shared/courses.ts` — types, geometry helpers, zone/block
  builders (`R`, `polyRect`, `sand`, `ice`, `water`, `slope`, `slopeTo`,
  `boost`, `jump`, `tele`, `conveyor`, `spinner`, `fan`, `trampoline`,
  `magnet`, `cannon`, `gfield`, `tunnel`, `bumper`, `post`, `windmill`,
  `slider`, `pendulum`, `laser`, `rubber`) and the tutorial courses
  (`PARK`, `NEON`, `TOYBOX`).
- `spacetimedb/src/shared/pieces.ts` — small builders shared by the course
  files: `tri` (any polygon from flat points), `low` (jumpable wall),
  `mirrorTR`, `corner` (45° mirror in a corner), `star`, `open` (a floor
  rect with NO rails), `lowRail`, `pond(x, y, w, h, ...islands)` (water
  minus island rects). Course files import from here, never from each other.
- `spacetimedb/src/shared/library/<slug>.ts` — ONE FILE PER COURSE (the
  launch nine, ids 3–11: bank, clockwork, ridge, machine, frost, grand,
  galaxy, hairpin, labyrinth; the expansion six, ids 12–17: terraces,
  rooftops, millpond, pinball, asteroids, crossroads). `library.ts` just
  imports them and exports `LAUNCH`, `EXPANSION` and `LIBRARY`.
- A new course: a new file under `library/`, imported and listed in
  `library.ts`, unique `id` (next free: 18), `theme` of `park` | `neon` |
  `space`, nine holes. It is seeded into the DB by `seed_builtins`
  (publish.sh runs it) — no schema change, no bindings.
- `spacetimedb/scripts/course-check.ts` — the checker. Run it on the course
  you touched (`npm run check-courses -- "Millpond"`), then on everything
  before committing (about 10 minutes; run it in the background).

## Coordinates and units

- x right, y DOWN, z up. Ball radius 0.36. A comfortable lane is 8–12
  wide; a whole hole is 100–200 units of route. Keep coordinates ≥ 0 for
  readability (negatives are legal).
- Speed: MAX_SHOT 34 u/s, FRICTION 6.3. A full drive rolls about 92 units
  on green, about 17 on sand (FRICTION_SAND 34), a very long way on ice.
- Angles: 0 = +x (right), 90 = +y (DOWN), 180 = −x, 270 = −y (up).
- A hole is a JOURNEY of three to five stages. The checker demands a
  route of ≥ 50 units for par 2, ≥ 80 for par 3, ≥ 110 for par 4, ≥ 140
  for par 5 ("route" = tee to cup through the floor rects' doorways and
  up ramps, so a fork or loop counts); most holes should be 100–180 and
  a finale 200+. Short straight lanes with a hazard dropped in were the
  owner's main complaint about the first drafts — build set pieces that
  look like something (a clock face, a harbour, a keep, a table).

## Floors, platforms, cliffs, tunnels

- `R(x, y, w, h)` is green at height 0 with rails (WALL_H 1.1) on every
  edge that faces nothing. Overlapping rects are fine.
- `R(x, y, w, h, z)` is a raised platform. Every edge that faces a LOWER
  slab is a cliff face: a ball below bounces off it, a ball on top rolls
  off it (no rail there). Its edges over the lawn get both a rail on top
  and a cliff face below (a ball flying below the top hits the side).
- A ball only gets ONTO a platform up a ramp or by flying (jump pad,
  trampoline, cannon, launch off a wedge) high enough: it must be ABOVE
  the platform's z when it crosses the edge. A ball rolling off one roof
  toward another at the same height falls immediately and hits the next
  roof's cliff — gaps between platforms need a jump pad or a pit with a
  trampoline, never just pace.
- `open(x, y, w, h, z)` has no rails: roll off and the ball is reset
  once it stops on the lawn. Use for roofs and ledges.
- `tunnel(x, y, w, h, level?)` bores through every platform it covers
  that is high enough (platform z − 0.4 − level ≥ 1; so z ≥ 1.4 for a
  ground-level tunnel, z ≥ 2.9 for a tunnel at level 1.5). Draw it from
  the green on one side right across the platform to the green on the
  other side. NOTHING else may lie over a tunnel: zones apply by x/y at
  every level, so water, sand, ice, a belt or a magnet on the platform
  top also acts on a ball in the tunnel underneath.
- The cup captures only on its own surface: a cup on a platform ignores
  a ball rolling through the tunnel under it.
- Keep every zone inside one level (do not straddle a platform edge).

## Ramps (slope zones) — the number-one source of bugs

- A slope is a wedge. `angle` points DOWNHILL: 180 = the top edge is at
  +x (climb it moving right), 0 = top at −x, 90 = top at −y (climb it
  moving up the screen), 270 = top at +y.
- `slopeTo(x, y, w, h, angle, rise)` climbs exactly `rise` to meet a
  platform; `slope(..., power)` is a free wedge (power 8–12 launches a
  fast ball off its top). Base height is the slab under the ramp's
  CENTRE, so a ramp on a 1.5 platform rising 1.5 tops out at 3.
- Enter a ramp from its LOW edge only. Met side-on or from the top it is
  a step the ball bounces off. So: in a lane that runs along x, ramps
  climb along x; a ramp that climbs along y must leave lane space below
  its low edge (a ramp that fills the whole alley width has its low edge
  on the outer rail and cannot be entered at all).
- A ramp's top edge must actually touch the platform it serves (same x
  range for a ramp climbing in y, same y range for one climbing in x).
  The checker's route only recognises a climb when the slope stands on
  the lower rect and its edge touches the higher one.
- A ramp must not cover a tunnel mouth (its top is at platform height,
  the tunnel floor is not). Put the ramp beside the mouth, as in Toy Box
  "Underpass".
- A small 1×1 block at the ramp's low corner (`polyRect(13, 3.5, 1, 1)`)
  stops balls sliding along the ramp's side face.

## Gadgets — numbers that work

- Jump pad `jump(..., vz)`: flight time 2·vz/32 s (vz 11 → 0.69 s, 9 →
  0.56 s); height vz²/64 (11 → 1.9, 12 → 2.25, 13 → 2.6). Range =
  ball speed × flight time. Needs speed > 2.5 to fire. Use a pad 3–4
  wide and put it OFF the tee line so the flight is a chosen line, not
  the default straight drive.
- Trampoline `trampoline(..., vz)` bounces a LANDING ball; a pit under a
  roof gap with a trampoline (vz 15) throws a fast ball back onto the
  next roof, plus a ramp out of the pit for the slow ones.
- Cannon `cannon(x, y, w, h, angle, muzzle, lift)`: rolling in loads the
  ball (one stroke); the next shot is a lofted launch at up to `muzzle`
  u/s with vertical `lift`. Height lift²/64 (15 → 3.5, 20 → 6.25). Put
  the TEE inside the cannon ("you start loaded") when the launch should
  be stroke one. A cannon 5–6 wide is hittable; 4 wide is missed by the
  decent player.
- Fan `fan(..., angle, 30)` floats the ball ~2.2 high and shoves it;
  crosses about 10 units of water reliably.
- Magnet (black hole) `magnet(..., power)`: 25–34 over a 20×20 field is a
  slingshot; the same power over 48×24 with a water eye is a death trap
  that no wobbling player survives. Keep big fields ≤ 15 or eyes tiny.
- Gravity field `gfield(..., angle, power)`: sideways pull; above 6.3
  nothing rests in it.
- Conveyor as a river: `conveyor(..., angle, 9–11)`; posts in it are rocks.
- Zone priority when zones overlap: water > tele > cannon > jump >
  trampoline > boost > conveyor > spinner > magnet > fan > gravity >
  slope > sand > ice. Sand under a magnet does nothing.
- Blocks: `low(x, y, w, h, 1.2)` is jumpable, `rubber(..., 2)` fires the
  ball back harder, `corner(px, py, s, ix, iy)` is a 45° mirror in a
  corner, `star(cx, cy, r, bounce?)` a rock. Movers: `windmill`,
  `pendulum`, `slider`, `laser` (blink gate).

## Design rules

1. Two real routes to every cup: an honest line (longer, robust to a ±3°
   / ±6% wobble, ends near the cup) and a gamble (tunnel, jump, launch,
   cannon, mirror bank). The hidden ace usually sits on the gamble.
2. The honest route must be the one the greedy checker player prefers:
   it picks the shot that ENDS nearest the cup along the route, then the
   "decent player" executes that same line with a wobble. If the gamble
   ends nearer than the honest line, the decent player mimics the gamble,
   drowns, and the hole fails PAR TOO LOW / never finished. Make the
   gamble's landing worse than the honest line's (sand where the launch
   lands, posts at the tunnel exit) or its window narrower, never its
   payoff bigger.
3. Water and off-the-edge resets cost two strokes each in the checker
   (stroke + water). A hazard beside the honest line that swallows a 3°
   miss makes the hole unplayable for the checker: use sand there.
4. Forks need doorways: two lanes leaving a tee stub must each overlap
   the stub (or a junction rect) by at least the lane width. Rects that
   only touch at a corner or along a 1-unit strip are not connected in
   play and confuse the route. Use a full-height junction rect and a
   wedge block to split it.
5. Straight tee lines are the enemy: a pad, tunnel mouth or ramp exactly
   on the tee line makes the ace obvious or the gamble the default. Offset
   the cup, offset the pads, add a post picket.
6. Ice on a narrow ledge or causeway = water for a wobbling player. Ice is
   for wide areas.
7. Sand strips 3–4 wide are stroke-costing gates; a 10-unit sand corridor
   is a wall. A "landing zone" of sand on an island makes every shot off
   the island a full-power ricochet — leave islands green.
8. Par: set it from the checker. A hole passes when the decent player
   averages within [par − 0.6, par + 1.5] and the greedy finishes within
   par + 1; pick the highest par that the route length allows. Par 2 is
   fine for a 60-unit hole the decent player does in 2.3.
9. Three of nine holes need a hidden ace (cluster ≥ 4, under 4.5% of
   random shots). Give every course a couple of holes where a straight
   line at the right pace goes in through a 4-wide tunnel or over a pad.
10. Tips are ONE line of at most 80 characters (`LIMITS.tipLen`; longer
    is silently truncated) and name both routes.

## Working with the checker

```bash
cd spacetimedb
npm run check-courses -- "Millpond"                 # one course
npm run check-courses -- "Millpond" "Mill"          # one hole
TRACE_HOLE="The Mill" npm run check-courses -- "Millpond" "Mill"   # every stroke of the greedy / decent runs
VERBOSE=1 npm run check-courses -- "Millpond"       # ace lines, never-settled shots
DEBUG_LEN="The Mill" npm run check-courses -- "zzz" # a hole's route length
```

- Flags and what they usually mean: EASY → lower the par or add a gate on
  the honest line; PAR TOO LOW / never finished → the greedy line is a
  fragile gamble (rule 2) or a door is missing (rule 4); SHORT → the route
  is measured through doorways and ramps, so a loop that the route can cut
  across is not counted (move the tee, or lower the par); HARD → the
  greedy cannot find the way (a ramp entered side-on, a missing door);
  N shots never settled → a pinball loop (ice + bumpers in a closed cage);
  ACE OBVIOUS → the straight line goes in (offset the cup or a post).
- Trace repeats of the same stroke from the same spot mean the executed
  shot was reset (water/lawn) — the greedy line is on a knife edge.
- For a tick-by-tick look at one shot, write a small esbuild-bundled script
  that calls `stepBall` from `shared/physics.ts` (see the session that built
  the expansion set: it printed x, y, z, v and groundZ every 5 ticks).
- Check several courses in parallel by running the checker per course in
  background processes writing to separate files.
- The 3D look: `client/preview.html?course=Millpond&hole=9&cam=play&look=0.6`
  on the Vite dev server; headless Chromium at `/opt/pw-browsers/chromium`
  with `--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader
  --virtual-time-budget=8000 --screenshot=...` renders it.

## After the course passes

- Update README (course count and hole count) and, if a new mechanic or
  lesson came out of it, CLAUDE.md and this file.
- The DB is seeded from code: `publish.sh` republishes and runs
  `seed_builtins`. Without the `spacetime` CLI (as in remote sessions),
  commit and push and say the publish step is pending.
