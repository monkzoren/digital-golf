// Built-in course. See .claude/course-guidelines.md before editing.
import {
  type Course, R, polyRect, polyNgon, polyStar,
  bumper, post, windmill, slider, pendulum, laser, rubber,
  sand, ice, water, slope, slopeTo, boost, jump, tele, conveyor, spinner, fan, trampoline, magnet, cannon, gfield, tunnel,
} from '../courses';
import { tri, low, mirrorTR, corner, star, open, lowRail, pond } from '../pieces';

/** The 1×1 stop at a ramp's low corner (keeps balls off its side face). */
const stop = (x: number, y: number) => polyRect(x, y, 1, 1);

// ---------------------------------------------------------------------------
// RAMP RIDGE — the course climbs and drops. Terraces, cliffs, ramps, tunnels,
// launch wedges and trampolines: every hole has an over and an under.
// ---------------------------------------------------------------------------
export const RIDGE: Course = {
  id: 5,
  name: 'Ramp Ridge',
  theme: 'park',
  holes: [
    {
      // Two terraces across the lane and a tunnel under both. Honest: up
      // the two ramps and off the back of the top terrace. Gamble: the
      // 60-unit tunnel along the bottom rail, straight to the cup.
      name: 'Foothills',
      par: 3,
      tip: 'Two ramps up and a drop off the back — or the long tunnel under both terraces.',
      tee: { x: 4, y: 4 },
      cup: { x: 104, y: 12 },
      floor: [R(0, 0, 110, 14), R(30, 0, 30, 14, 1.5), R(60, 0, 30, 14, 3)],
      zones: [slopeTo(24, 0, 6, 8, 180, 1.5), slopeTo(54, 0, 6, 8, 180, 1.5), tunnel(30, 10, 60, 4, 0), sand(40, 0, 4, 8), sand(74, 0, 4, 8), sand(92, 0, 4, 8), sand(14, 10, 3, 4), sand(90, 10, 4, 4)],
      blocks: [stop(23, 8), stop(53, 8)],
      bumpers: [post(40, 4, 0.5), post(99, 8, 0.5), post(99, 15, 0.4), post(84, 3, 0.5)],
    },
    {
      // A ski jump: a long start platform ends in a steep wedge over a
      // valley; the landing platform beyond runs to the cup. Honest: drop
      // into the valley and climb the far ramp. Gamble: hit the wedge hard.
      name: 'Ski Jump',
      par: 3,
      tip: 'Full pace off the wedge clears the valley. Less: down the ramp, up the far one.',
      tee: { x: 4, y: 7 },
      cup: { x: 102, y: 7 },
      floor: [R(0, 0, 50, 14, 3), R(50, 0, 12, 14), R(62, 0, 58, 14, 3)],
      zones: [slope(40, 2, 10, 10, 180, 11), slopeTo(56, 4, 6, 6, 180, 3), sand(50, 0, 6, 3), sand(50, 11, 6, 3), sand(80, 0, 4, 4), sand(80, 10, 4, 4), sand(20, 0, 4, 5)],
      blocks: [stop(55, 3), stop(55, 10)],
      bumpers: [post(100, 3.5, 0.5), post(100, 10.5, 0.5), post(112, 7, 0.6), post(30, 12, 0.6)],
    },
    {
      // A halfpipe: down one wall, across the floor, up the other and out
      // onto a platform where a mirror turns the leg. Pace down the first
      // wall is pace up the second.
      name: 'Halfpipe',
      par: 3,
      tip: 'Down the pipe, up the far wall, round the mirror. Carry pace or climb in two.',
      tee: { x: 4, y: 7 },
      cup: { x: 81, y: 40 },
      floor: [R(0, 0, 30, 14, 3), R(30, 0, 40, 14), R(70, 0, 14, 44, 3)],
      zones: [slopeTo(30, 2, 10, 10, 0, 3), slopeTo(60, 2, 10, 10, 180, 3), sand(44, 0, 4, 4), sand(52, 10, 4, 4), sand(70, 24, 6, 3), sand(14, 0, 4, 4)],
      blocks: [stop(40, 1), stop(40, 12), stop(59, 1), stop(59, 12), corner(84, 0, 8, -1, 1)],
      bumpers: [post(76, 37, 0.5), post(79, 44, 0.5), post(48, 7, 0.5)],
    },
    {
      // A canyon between two rims. Two trampolines in the canyon floor
      // bounce a ball that drops off the near rim across to the far one.
      // Honest: drop in, cross the floor, climb the far ramp.
      name: 'Canyon',
      par: 3,
      tip: 'Drop off the rim onto the trampolines and bounce across, or climb the far ramp.',
      tee: { x: 4, y: 10 },
      cup: { x: 118, y: 10 },
      floor: [R(0, 0, 44, 20, 3), R(44, 0, 44, 20), R(88, 0, 40, 20, 3)],
      zones: [trampoline(50, 7, 8, 6, 18), trampoline(68, 7, 16, 6, 18), slopeTo(82, 14, 6, 6, 180, 3), sand(100, 0, 4, 6), sand(100, 14, 4, 6), sand(20, 0, 4, 6), sand(60, 0, 6, 4)],
      blocks: [stop(81, 13)],
      bumpers: [post(112, 5.5, 0.5), post(112, 14.5, 0.5), post(62, 16, 0.5), post(30, 15, 0.6)],
    },
    {
      // A downhill run: three terraces stepping down, every ramp goes down
      // and the pace builds. A mirror at the bottom turns the run into a leg
      // with a sand gate — arrive too hot and you fly past everything.
      name: 'Downhill',
      par: 3,
      tip: 'Three drops, pace building all the way. The mirror turns it; the sand tames it.',
      tee: { x: 4, y: 6 },
      cup: { x: 90, y: 44 },
      floor: [R(0, 0, 20, 12, 6), R(20, 0, 30, 12, 4), R(50, 0, 30, 12, 2), R(80, 0, 12, 50)],
      zones: [slopeTo(20, 3, 8, 6, 0, 2), slopeTo(50, 3, 8, 6, 0, 2), slopeTo(80, 3, 8, 6, 0, 2), sand(36, 0, 4, 3), sand(66, 9, 4, 3), sand(80, 12, 4, 4)],
      blocks: [corner(92, 0, 8, -1, 1)],
      bumpers: [post(84, 30, 0.6), post(86, 40, 0.5), post(85, 47, 0.5), post(40, 9, 0.5), post(70, 2, 0.5)],
    },
    {
      // A mountain of three terraces with switchback ramps at alternate
      // ends. Or roll into the cannon by the tee and fire straight up over
      // all three to the summit.
      name: 'Switchback',
      par: 5,
      tip: 'Three terraces, ramps at alternate ends. Or the cannon by the tee, straight up.',
      tee: { x: 4, y: 58 },
      cup: { x: 8, y: 8 },
      floor: [R(0, 48, 44, 16), R(0, 32, 44, 16, 1.5), R(0, 16, 44, 16, 3), R(0, 0, 44, 16, 4.5)],
      zones: [
        slopeTo(34, 48, 8, 8, 90, 1.5), slopeTo(2, 32, 8, 8, 90, 1.5), slopeTo(34, 16, 8, 8, 90, 1.5),
        cannon(14, 52, 6, 6, 270, 28, 18), sand(16, 36, 6, 8), sand(16, 20, 6, 8), sand(20, 2, 4, 10), sand(24, 60, 4, 4),
      ],
      blocks: [stop(33, 56), stop(42, 56), stop(1, 40), stop(10, 40), stop(33, 24), stop(42, 24)],
      bumpers: [post(12, 5, 0.5), post(6, 12, 0.5), post(28, 44, 0.6), post(24, 30, 0.6)],
    },
    {
      // A mesa with the cup on top and a tunnel right under it. The only
      // ramp is on the far side: tunnel through (or go round), climb, and
      // come back. Or hit the launch wedge and land on the mesa.
      name: 'The Mesa',
      par: 4,
      tip: 'The only ramp is round the back: tunnel under the cup and climb. Or wedge up.',
      tee: { x: 4, y: 31 },
      cup: { x: 58, y: 22 },
      floor: [R(0, 0, 110, 44), R(36, 10, 44, 24, 2.5)],
      zones: [
        tunnel(36, 20, 44, 4), slopeTo(80, 26, 6, 8, 0, 2.5), slope(50, 35, 6, 6, 90, 11),
        sand(40, 10, 6, 8), sand(46, 26, 6, 8), sand(96, 4, 4, 12), sand(12, 0, 8, 6), sand(86, 36, 8, 8),
      ],
      blocks: [stop(86, 25), stop(86, 34), stop(49, 41), stop(56, 41)],
      bumpers: [post(54, 14, 0.6), post(63, 29, 0.6), post(90, 4, 0.6), post(24, 8, 0.6)],
    },
    {
      // A crater: a raised ring round a sunken floor with the cup in the
      // middle. Honest: along the bottom, up the ramp on the far side, over
      // the rim and drop in. Gamble: a launch wedge under the near rim.
      name: 'Crater',
      par: 4,
      tip: 'Round to the far ramp, over the rim and drop in — or launch over the near rim.',
      tee: { x: 6, y: 80 },
      cup: { x: 60, y: 45 },
      floor: [R(0, 70, 100, 16), R(30, 20, 60, 10, 3), R(30, 60, 60, 10, 3), R(30, 20, 10, 50, 3), R(80, 20, 10, 50, 3), R(40, 30, 40, 30)],
      zones: [slopeTo(70, 70, 14, 8, 90, 3), slope(50, 71, 8, 6, 90, 12), sand(20, 70, 8, 4), sand(60, 20, 6, 10), sand(48, 34, 6, 6), sand(62, 70, 4, 6)],
      blocks: [stop(69, 78), stop(84, 78), stop(49, 77), stop(58, 77)],
      bumpers: [post(66, 42, 0.5), post(55, 50, 0.5), post(84, 64, 0.6), post(40, 82, 0.6), post(72, 82, 0.6)],
    },
    {
      // The summit: a two-step pyramid with the cup on top. Honest: the left
      // ramp onto the first terrace, along the south corridor to the right
      // ramp, up. Gamble: the tunnel under the summit to the cannon on the
      // north corridor, and fire back over the edge onto the top.
      name: 'Summit',
      par: 5,
      tip: 'Ramp, terrace, ramp, top. Or tunnel under the summit to the cannon behind it.',
      tee: { x: 6, y: 43 },
      cup: { x: 90, y: 30 },
      floor: [R(0, 12, 140, 36), R(24, 12, 116, 36, 2), R(64, 20, 50, 20, 4)],
      zones: [
        slopeTo(18, 38, 6, 10, 180, 2), slopeTo(114, 25, 6, 10, 0, 2),
        tunnel(96, 20, 4, 20, 2), cannon(87, 13, 6, 6, 90, 26, 18),
        sand(64, 20, 32, 3), sand(100, 20, 14, 3), sand(70, 12, 6, 8), sand(130, 12, 6, 8), sand(8, 20, 6, 8), sand(40, 24, 6, 8),
      ],
      blocks: [stop(17, 37), stop(17, 47), stop(120, 24), stop(120, 35)],
      bumpers: [post(86, 26, 0.5), post(94, 34, 0.5), post(76, 30, 0.6), post(130, 40, 0.6), post(30, 16, 0.6)],
    },
  ],
};
