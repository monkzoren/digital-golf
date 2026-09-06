// Built-in course. See .claude/course-guidelines.md before editing.
import {
  type Course, R, polyRect, polyNgon, polyStar,
  bumper, post, windmill, slider, pendulum, laser, rubber,
  sand, ice, water, slope, slopeTo, boost, jump, tele, conveyor, spinner, fan, trampoline, magnet, cannon, gfield, tunnel,
} from '../courses';
import { tri, low, mirrorTR, corner, star, open, lowRail, pond } from '../pieces';

// ---------------------------------------------------------------------------
// MILLPOND — water everywhere. Causeways, islands, fans, cannons and a weir.
// The dry way round is always there; the wet way is shorter.
// ---------------------------------------------------------------------------
export const MILLPOND: Course = {
  id: 14,
  name: 'Millpond',
  theme: 'park',
  holes: [
    {
      name: 'Causeway',
      par: 3,
      tip: 'A narrow causeway crosses the pond. Thread it, or hit the jump pad and fly the top half of the water.',
      tee: { x: 4, y: 10 },
      cup: { x: 66, y: 4 },
      floor: [R(0, 0, 72, 20)],
      zones: [jump(13, 2, 3, 5, 11), ...pond(22, 0, 18, 20, R(22, 8, 18, 4)), sand(40, 8, 4, 4), sand(48, 14, 8, 6), sand(60, 0, 3, 8)],
      bumpers: [post(52, 6, 0.6), post(58, 10, 0.6), post(63, 8, 0.5), post(46, 3, 0.5)],
    },
    {
      name: 'Islands',
      par: 5,
      tip: 'Fans blow you from island to island across the top. The bank along the bottom is dry, sandy and long.',
      tee: { x: 4, y: 8 },
      cup: { x: 84, y: 6 },
      floor: [R(0, 0, 90, 26)],
      zones: [
        fan(8, 0, 6, 16, 0, 32), water(14, 0, 10, 18), fan(28, 0, 6, 16, 0, 32), water(36, 0, 10, 18), fan(50, 0, 6, 16, 0, 32), water(58, 0, 10, 18),
        sand(20, 20, 6, 6), sand(44, 18, 6, 8), sand(64, 20, 8, 6), sand(74, 0, 3, 12), sand(80, 12, 10, 6),
      ],
      bumpers: [post(34, 22, 0.6), post(72, 22, 0.6), post(78, 4, 0.5), post(80, 9, 0.5)],
    },
    {
      name: 'Stepping Stones',
      par: 3,
      tip: 'Three stones across the pond, each a little further on. Hop them, or take the towpath round the bottom.',
      tee: { x: 4, y: 12 },
      cup: { x: 66, y: 6 },
      floor: [R(0, 0, 72, 28)],
      zones: [...pond(12, 0, 46, 20, R(18, 6, 6, 6), R(30, 10, 6, 6), R(42, 4, 6, 6), R(48, 12, 10, 8)), sand(20, 22, 10, 6), sand(40, 20, 6, 8), sand(58, 14, 4, 14), sand(60, 0, 3, 6)],
      bumpers: [post(62, 10, 0.6), post(8, 24, 0.6), post(34, 25, 0.6)],
    },
    {
      name: 'Lily Pads',
      par: 3,
      tip: 'The pads are trampolines: land on one with pace and it throws you to the next. Or walk the bank, slowly.',
      tee: { x: 4, y: 6 },
      cup: { x: 70, y: 6 },
      floor: [R(0, 0, 76, 20)],
      zones: [jump(10, 2, 3, 8, 12), ...pond(14, 0, 44, 12, R(24, 2, 6, 8), R(38, 2, 6, 8), R(52, 2, 6, 8)), trampoline(24, 2, 6, 8, 12), trampoline(38, 2, 6, 8, 12), trampoline(52, 2, 6, 8, 12), sand(14, 14, 8, 6), sand(36, 12, 4, 8), sand(60, 14, 8, 6), sand(64, 0, 3, 10)],
      bumpers: [post(28, 16, 0.6), post(50, 16, 0.6), post(66, 5, 0.5), post(66, 9, 0.5)],
    },
    {
      name: 'Weir',
      par: 3,
      tip: 'A river runs across the lane and over a weir. Cross on the little bridge, or cross anywhere fast and let it carry you.',
      tee: { x: 4, y: 8 },
      cup: { x: 68, y: 22 },
      floor: [R(0, 0, 74, 30)],
      zones: [conveyor(24, 0, 8, 12, 90, 9), conveyor(24, 16, 8, 8, 90, 9), water(24, 24, 8, 6), sand(10, 20, 8, 6), sand(40, 4, 8, 6), sand(52, 24, 10, 6), sand(60, 8, 3, 12)],
      blocks: [low(24, 12, 8, 0.5, 0.6), low(24, 15.5, 8, 0.5, 0.6)],
      bumpers: [post(44, 16, 0.6), post(56, 14, 0.6), post(64, 20, 0.5), post(64, 26, 0.5)],
    },
    {
      name: 'The Dam',
      par: 4,
      tip: 'A dam across the valley with the reservoir behind it. The sluice tunnel runs low along the bottom; the dam top is a drop into water — except at its end.',
      tee: { x: 4, y: 12 },
      cup: { x: 76, y: 12 },
      floor: [R(0, 0, 82, 24), R(30, 0, 8, 24, 2)],
      zones: [slopeTo(24, 0, 6, 8, 180, 2), tunnel(30, 18, 8, 4), water(38, 0, 22, 16), sand(42, 18, 6, 6), sand(60, 0, 4, 10), sand(68, 16, 14, 8), ice(60, 10, 16, 6)],
      blocks: [polyRect(23, 8, 1, 1)],
      bumpers: [post(52, 20, 0.6), post(64, 20, 0.6), post(72, 8, 0.5), post(66, 6, 0.6)],
    },
    {
      name: 'Boathouse',
      par: 2,
      tip: 'The boathouse door is a portal to the far shore. Take the boat, or the long sandy bank.',
      tee: { x: 4, y: 20 },
      cup: { x: 54, y: 6 },
      floor: [R(0, 0, 60, 26)],
      zones: [tele(4, 2, 4, 4, 46, 4), water(14, 0, 30, 18), sand(16, 20, 6, 6), sand(30, 18, 6, 8), sand(44, 18, 6, 8), sand(50, 12, 10, 3)],
      bumpers: [post(24, 22, 0.6), post(38, 22, 0.6), post(50, 9, 0.5), post(57, 3, 0.5)],
    },
    {
      name: 'Rapids',
      par: 4,
      tip: 'The river runs toward the cup, fast, with rocks in it. The towpath beside it is slow and sandy but nothing hits you.',
      tee: { x: 4, y: 8 },
      cup: { x: 84, y: 8 },
      floor: [R(0, 0, 90, 20)],
      zones: [conveyor(12, 6, 60, 10, 0, 11), water(12, 16, 60, 4), sand(20, 0, 4, 6), sand(40, 0, 4, 6), sand(60, 0, 4, 6), sand(72, 12, 6, 8), sand(78, 0, 3, 8)],
      bumpers: [post(26, 10, 0.7), post(40, 13, 0.7), post(52, 8, 0.7), post(64, 12, 0.7), post(76, 6, 0.6), post(80, 11, 0.5)],
    },
    {
      name: 'The Mill',
      par: 5,
      tip: 'The mill stands on an island, sails turning. Causeways in and out, a windmill in the middle — or the cannon fires you straight onto the island.',
      tee: { x: 4, y: 24 },
      cup: { x: 94, y: 15 },
      floor: [R(0, 0, 100, 30)],
      zones: [
        cannon(3, 3, 5, 5, 0, 34, 18), ...pond(20, 0, 60, 30, R(38, 7, 24, 16), R(20, 11, 18, 8), R(62, 11, 18, 8)),
        sand(84, 0, 4, 10), sand(84, 20, 4, 10), sand(10, 12, 4, 6), sand(40, 7, 3, 16), sand(58, 7, 3, 16),
      ],
      blocks: [...windmill(50, 15, 3.6, 1.3, 3, 0.8)],
      bumpers: [post(88, 15, 0.6), post(91, 10, 0.5), post(91, 20, 0.5), post(14, 26, 0.6)],
    },
  ],
};
