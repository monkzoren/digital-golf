// Built-in course. See .claude/course-guidelines.md before editing.
import {
  type Course, R, polyRect, polyNgon, polyStar,
  bumper, post, windmill, slider, pendulum, laser, rubber,
  sand, ice, water, slope, slopeTo, boost, jump, tele, conveyor, spinner, fan, trampoline, magnet, cannon, gfield, tunnel,
} from '../courses';
import { tri, low, mirrorTR, corner, star, open, lowRail, pond } from '../pieces';

// ---------------------------------------------------------------------------
// HAIRPIN HOLLOW — corners. Never a straight lane: every outer corner is a
// 45° mirror the width of the lane, so a drive at the right pace caroms
// round the bend. The hollow has hills in it: hairpins that drop off a
// cliff, switchbacks that climb, tunnels through the hill as the gamble,
// and ice in the return lanes.
// ---------------------------------------------------------------------------
export const HAIRPIN: Course = {
  id: 10,
  name: 'Hairpin Hollow',
  theme: 'park',
  holes: [
    {
      name: 'First Bend',
      par: 3,
      tip: 'Out, round the mirror, back on the ice. The hill between has a tunnel in it.',
      tee: { x: 4, y: 5 },
      cup: { x: 8, y: 26.5 },
      floor: [R(0, 0, 60, 10), R(50, 10, 10, 14), R(0, 24, 60, 10), R(0, 10, 46, 14, 2)],
      blocks: [corner(60, 0, 10, -1, 1), corner(60, 34, 10, -1, -1)],
      zones: [tunnel(30, 10, 4, 14), ice(10, 0, 40, 10), sand(24, 0, 4, 4), ice(20, 24, 26, 10)],
      bumpers: [post(13, 30.5, 0.5), post(20, 31.5, 0.5), post(46, 32, 0.5)],
    },
    {
      name: 'Cliff Hairpin',
      par: 4,
      tip: 'The out lane is an icy ridge. Round the mirror and off the cliff, or drop early.',
      tee: { x: 4, y: 5 },
      cup: { x: 8, y: 23 },
      floor: [R(0, 0, 70, 10, 1.5), R(60, 10, 14, 10), R(0, 20, 74, 10), R(33, 10, 4, 10)],
      blocks: [corner(70, 0, 10, -1, 1), corner(74, 30, 14, -1, -1)],
      zones: [ice(10, 0, 50, 10), sand(30, 0, 4, 4), ice(10, 20, 50, 10), sand(60, 10, 10, 3)],
      bumpers: [post(14, 27, 0.5), post(20, 27.5, 0.5), post(48, 8, 0.5)],
    },
    {
      name: 'Switchback Hill',
      par: 5,
      tip: 'Three terraces, ramps in the corners, ice in the middle. The cannon fires up.',
      tee: { x: 4, y: 6 },
      cup: { x: 62, y: 45 },
      floor: [R(0, 0, 70, 10), R(60, 10, 10, 10), R(0, 20, 70, 10, 1.5), R(0, 30, 10, 10, 1.5), R(0, 40, 70, 10, 3)],
      blocks: [corner(70, 0, 10, -1, 1), corner(70, 30, 10, -1, -1), corner(0, 20, 10, 1, 1), corner(0, 50, 10, 1, -1)],
      zones: [slopeTo(60, 10, 10, 10, 270, 1.5), slopeTo(0, 30, 10, 10, 270, 1.5), ice(10, 20, 50, 10), cannon(30, 0, 6, 4, 90, 26, 18), sand(44, 6, 4, 4), sand(40, 40, 4, 4)],
      bumpers: [post(56, 42, 0.5), post(56, 48, 0.5), post(20, 26, 0.5)],
    },
    {
      name: 'Tunnel Hill',
      par: 4,
      tip: 'Round the hill by road, or through it by tunnel. A pendulum guards the far bend.',
      tee: { x: 4, y: 5 },
      cup: { x: 8, y: 32 },
      floor: [R(0, 0, 72, 10), R(62, 10, 10, 20), R(0, 30, 72, 10), R(10, 10, 50, 20, 2)],
      blocks: [corner(72, 0, 10, -1, 1), corner(72, 40, 10, -1, -1), pendulum(72, 14, 8, 1.2, 45, 3)],
      zones: [tunnel(32, 10, 4, 20), ice(10, 0, 52, 10), ice(62, 10, 10, 20), ice(10, 30, 50, 10), sand(24, 0, 4, 4), sand(50, 6, 4, 4)],
      bumpers: [post(14, 36.5, 0.5), post(20, 37, 0.5), post(56, 36, 0.5)],
    },
    {
      name: 'Square Spiral',
      par: 5,
      tip: 'Six mirrored corners inward. The garden wall in the middle has an arch in it.',
      tee: { x: 4, y: 5 },
      cup: { x: 16, y: 29 },
      floor: [R(0, 0, 60, 10), R(50, 0, 10, 46), R(0, 36, 60, 10), R(0, 12, 10, 34), R(0, 12, 38, 10), R(28, 12, 10, 22), R(12, 24, 26, 10), R(12, 22, 16, 2, 2)],
      blocks: [
        corner(60, 0, 10, -1, 1), corner(60, 46, 10, -1, -1), corner(0, 46, 10, 1, -1), corner(0, 12, 10, 1, 1),
        corner(38, 12, 10, -1, 1), corner(38, 34, 10, -1, -1),
      ],
      zones: [tunnel(18, 21, 4, 4), ice(50, 10, 10, 26), ice(10, 36, 40, 10), sand(24, 0, 4, 4), sand(0, 24, 5, 4), sand(24, 12, 4, 10)],
      bumpers: [post(20, 28, 0.5), post(32, 30, 0.5), post(30, 42, 0.5)],
    },
    {
      name: 'Corner Pockets',
      par: 5,
      tip: 'Eight mirrors down a staircase, a level per step. The cannon on step five skips.',
      tee: { x: 3, y: 4 },
      cup: { x: 84, y: 68 },
      floor: [R(0, 0, 24, 8, 3), R(16, 8, 8, 8, 3), R(16, 16, 24, 8, 2), R(32, 24, 8, 8, 2), R(32, 32, 24, 8, 1), R(48, 40, 8, 8, 1), R(48, 48, 24, 8), R(64, 56, 8, 8), R(64, 64, 24, 8)],
      blocks: [
        corner(24, 0, 8, -1, 1), corner(16, 24, 8, 1, -1), corner(40, 16, 8, -1, 1), corner(32, 40, 8, 1, -1),
        corner(56, 32, 8, -1, 1), corner(48, 56, 8, 1, -1), corner(72, 48, 8, -1, 1), corner(64, 72, 8, 1, -1),
      ],
      zones: [ice(24, 16, 12, 8), ice(56, 48, 12, 8), sand(8, 0, 4, 3.5), cannon(49, 32, 6, 2.5, 68, 32, 20), sand(56, 48, 3, 4)],
      bumpers: [post(80, 66, 0.5), post(80, 70, 0.5)],
    },
    {
      name: 'Figure Eight',
      par: 3,
      tip: 'Two islands. Left loop is ice, right loop bumpers; the cup is in the crossing.',
      tee: { x: 46, y: 3 },
      cup: { x: 45, y: 37 },
      floor: [R(0, 0, 90, 10), R(0, 30, 90, 10), R(0, 0, 10, 40), R(80, 0, 10, 40), R(40, 0, 10, 14), R(40, 16, 10, 24)],
      blocks: [corner(0, 0, 10, 1, 1), corner(0, 40, 10, 1, -1), corner(90, 0, 10, -1, 1), corner(90, 40, 10, -1, -1)],
      zones: [ice(10, 0, 30, 10), ice(0, 10, 10, 20), ice(10, 30, 30, 10), sand(60, 0, 4, 4), sand(66, 30, 4, 4), sand(40, 16, 10, 8)],
      bumpers: [bumper(66, 6), bumper(85, 20), bumper(64, 35), post(20, 20, 0.6), post(42, 33, 0.5), post(48, 33, 0.5)],
    },
    {
      name: 'Crankshaft',
      par: 4,
      tip: 'Right, down, right, down, back. A windmill mid-way, a tunnel under the hill.',
      tee: { x: 4, y: 5 },
      cup: { x: 28, y: 45 },
      floor: [R(0, 0, 44, 10), R(34, 10, 10, 10), R(34, 20, 50, 10), R(74, 30, 10, 10), R(24, 40, 60, 10), R(34, 30, 38, 10, 2)],
      blocks: [corner(44, 0, 10, -1, 1), corner(34, 30, 10, 1, -1), corner(84, 20, 10, -1, 1), corner(84, 50, 10, -1, -1), ...windmill(60, 25, 3.5, 2)],
      zones: [tunnel(44, 30, 4, 10), ice(50, 20, 24, 10), sand(20, 0, 4, 4), sand(74, 32, 10, 3), sand(60, 44, 4, 6)],
      bumpers: [post(32, 42.5, 0.5), post(32, 47.5, 0.5), post(40, 14, 0.5)],
    },
    {
      name: 'Grand Hairpin',
      par: 5,
      tip: 'A long ridge out, a cliff, a long way back past the pond: ice above, safe below.',
      tee: { x: 4, y: 5 },
      cup: { x: 8, y: 29 },
      floor: [R(0, 0, 120, 10, 1.5), R(110, 10, 14, 10), R(0, 20, 124, 18)],
      blocks: [corner(120, 0, 10, -1, 1), corner(124, 38, 14, -1, -1)],
      zones: [water(50, 25, 30, 5), ice(84, 20, 26, 5), ice(50, 20, 30, 5), sand(30, 0, 4, 4), sand(76, 6, 4, 4), sand(110, 10, 10, 3), sand(30, 20, 4, 5)],
      bumpers: [post(14, 24, 0.5), post(96, 30, 0.6), post(40, 22, 0.5)],
    },
  ],
};
