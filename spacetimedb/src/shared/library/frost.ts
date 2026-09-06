// Built-in course. See .claude/course-guidelines.md before editing.
import {
  type Course, R, polyRect, polyNgon, polyStar,
  bumper, post, windmill, slider, pendulum, laser, rubber,
  sand, ice, water, slope, slopeTo, boost, jump, tele, conveyor, spinner, fan, trampoline, magnet, cannon, gfield, tunnel,
} from '../courses';
import { tri, low, mirrorTR, corner, star, open, lowRail, pond } from '../pieces';

// ---------------------------------------------------------------------------
// FROST & FLAME — ice and lava on a big scale. A frozen lake, a lava river,
// a volcano, an ice cave, a glacier, a moated castle, steam vents, an icefall
// and a meltdown that runs through all of it. Neon.
// ---------------------------------------------------------------------------
export const FROST: Course = {
  id: 7,
  name: 'Frost & Flame',
  theme: 'neon',
  holes: [
    {
      // A huge ice sheet with sand stepping stones to stop on, rocks in the
      // way, lava in the corners and a green shore round the cup. Hop the
      // stones or send one long slide across the lot.
      name: 'Frozen Lake',
      par: 3,
      tip: 'A hundred units of ice. Stop on the sand stones, or slide the whole lake in one.',
      tee: { x: 6, y: 25 },
      cup: { x: 100, y: 36 },
      floor: [R(0, 0, 110, 50)],
      zones: [
        ice(8, 0, 82, 50),
        sand(28, 18, 6, 6), sand(50, 30, 6, 6), sand(72, 12, 6, 6),
        water(0, 0, 8, 8), water(0, 42, 8, 8), water(92, 0, 18, 6),
      ],
      bumpers: [post(40, 10, 0.8), post(60, 40, 0.8), post(80, 24, 0.8), post(94, 30, 0.5), post(94, 42, 0.5)],
    },
    {
      // A lava river across the hole with two ice bridges: a wide one up the
      // top (a dogleg to reach it) and a needle straight ahead of the tee.
      name: 'Lava River',
      par: 3,
      tip: 'Two ice bridges over the lava: wide and far up, or three units wide dead ahead.',
      tee: { x: 4, y: 38 },
      cup: { x: 94, y: 14 },
      floor: [R(0, 0, 100, 44)],
      zones: [
        water(40, 12, 12, 18), water(40, 33, 12, 11),
        ice(34, 2, 24, 10), ice(34, 30, 24, 3),
        sand(52, 29, 6, 5), sand(72, 0, 3, 22), sand(14, 8, 6, 12),
      ],
      blocks: [polyRect(40, 12, 12, 0.8), corner(100, 0, 10, -1, 1)],
      bumpers: [post(66, 22, 0.7), post(86, 20, 0.5), post(80, 8, 0.5), post(26, 24, 0.6)],
    },
    {
      // A volcano: two terraces up to a crater of lava round the cup on a
      // sand island, open on one side. Climb the ramps and walk round — or
      // roll into the cannon by the tee and fire straight into the crater.
      name: 'Volcano',
      par: 4,
      tip: 'Two ramps up and round to the crater mouth, or the cannon fires you straight in.',
      tee: { x: 6, y: 10 },
      cup: { x: 63, y: 30 },
      floor: [R(0, 0, 120, 64), R(30, 8, 70, 56, 2), R(44, 14, 48, 36, 4)],
      zones: [
        cannon(20, 27, 6, 6, 0, 34, 20),
        slopeTo(22, 40, 8, 8, 180, 2), slopeTo(70, 50, 8, 6, 90, 2),
        water(50, 18, 22, 4), water(50, 22, 4, 16), water(50, 38, 22, 4), sand(54, 22, 18, 16),
        water(0, 54, 14, 10), water(104, 0, 16, 8), water(34, 10, 10, 4),
        sand(50, 56, 4, 8), sand(94, 30, 6, 20), sand(84, 42, 3, 8),
      ],
      blocks: [polyRect(21, 39, 1, 1), polyRect(21, 48, 1, 1), polyRect(69, 56, 1, 1), polyRect(78, 56, 1, 1)],
      bumpers: [post(38, 26, 0.6), post(40, 58, 0.6), post(80, 22, 0.6), post(76, 34, 0.5), post(14, 30, 0.5)],
    },
    {
      // A cave: a raised block of ice with a long tunnel straight through it
      // and a crossing tunnel that lets you out the sides. Ice on the low
      // green either end. Over the top by the ramp, or through the dark.
      name: 'Ice Cave',
      par: 3,
      tip: 'Through the cave (mind the crossing) or up the ramp and over the top of it.',
      tee: { x: 4, y: 30 },
      cup: { x: 122, y: 28 },
      floor: [R(0, 0, 130, 56), R(30, 8, 70, 40, 3)],
      zones: [
        tunnel(30, 26, 70, 4), tunnel(62, 8, 4, 40),
        ice(0, 8, 30, 40), ice(100, 8, 20, 40),
        slopeTo(22, 12, 8, 8, 180, 3),
        sand(46, 8, 4, 18), sand(80, 30, 4, 18), sand(36, 34, 8, 14),
        sand(70, 0, 4, 8), sand(70, 48, 4, 8), water(0, 0, 8, 8), water(0, 48, 8, 8),
      ],
      blocks: [polyRect(21, 11, 1, 1), polyRect(21, 20, 1, 1)],
      bumpers: [post(14, 22, 0.7), post(112, 40, 0.7), post(112, 14, 0.7), post(118, 22, 0.4), post(118, 34, 0.4)],
    },
    {
      // The glacier: from the summit, a steep ice slope straight into a field
      // of kickers, or the long gentle side ramp into a walled corridor with
      // sand gates. Both come out above the moraine before the cup.
      name: 'Glacier',
      par: 3,
      tip: 'Straight down the glacier into the kickers, or the long ramp and the corridor.',
      tee: { x: 10, y: 15 },
      cup: { x: 118, y: 15 },
      floor: [R(0, 0, 20, 30, 4), R(20, 0, 110, 30)],
      zones: [
        slopeTo(20, 8, 30, 14, 0, 4), slopeTo(20, 0, 50, 6, 0, 4),
        sand(74, 0, 3, 6), sand(100, 8, 4, 22), water(0, 0, 6, 6), water(0, 24, 6, 6), water(20, 24, 30, 6),
      ],
      blocks: [polyRect(20, 6, 70, 1.2), polyRect(20, 22, 1, 1)],
      bumpers: [bumper(60, 14), bumper(60, 24), bumper(72, 19), bumper(84, 12), bumper(84, 24), post(110, 9, 0.5), post(110, 21, 0.5)],
    },
    {
      // A castle: a walled keep on a mound with a lava moat all round it. In
      // by the drawbridge ramp and the blinking portcullis, or hop the pad
      // over the moat and the wall onto the sand in the ward.
      name: 'Lava Moat',
      par: 4,
      tip: 'Over the drawbridge when the portcullis blinks, or jump the moat and the wall.',
      tee: { x: 6, y: 70 },
      cup: { x: 116, y: 40 },
      floor: [R(0, 0, 140, 80), R(66, 16, 58, 48, 3)],
      zones: [
        ...pond(60, 10, 70, 60, R(66, 16, 58, 48), R(60, 34, 6, 12)),
        slopeTo(60, 34, 6, 12, 180, 3), jump(48, 46, 4, 6, 18),
        sand(74, 30, 12, 12), sand(34, 36, 4, 16), sand(104, 18, 3, 12), sand(104, 50, 3, 12), water(0, 0, 20, 10),
      ],
      blocks: [
        laser(66, 34, 1, 12, 3, 0.5),
        polyRect(66, 16, 58, 1), polyRect(66, 63, 58, 1), polyRect(123, 16, 1, 48), polyRect(66, 16, 1, 18), polyRect(66, 46, 1, 18),
        polyRect(59, 33, 1, 1), polyRect(59, 46, 1, 1),
      ],
      bumpers: [post(96, 32, 0.6), post(96, 48, 0.6), post(106, 46, 0.5), post(110, 24, 0.6), post(30, 60, 0.6)],
    },
    {
      // Steam vents: a Z of three legs, each with a lava channel and a vent
      // (fan) that floats you across it. A portal in the first corner sucks
      // you past the second leg altogether.
      name: 'Steam Vents',
      par: 4,
      tip: 'Three lava channels, a steam vent before each. The corner portal skips one.',
      tee: { x: 4, y: 10 },
      cup: { x: 112, y: 60 },
      floor: [R(0, 0, 60, 20), R(48, 20, 12, 30), R(48, 50, 70, 20)],
      zones: [
        fan(20, 4, 6, 12, 0, 30), water(28, 0, 8, 20), sand(40, 0, 4, 20),
        fan(50, 24, 8, 6, 90, 30), water(48, 32, 12, 8), sand(48, 44, 12, 3),
        fan(72, 54, 6, 12, 0, 30), water(80, 50, 8, 20), sand(94, 50, 4, 20),
        tele(56, 1, 3, 3, 54, 62), ice(6, 4, 8, 12),
      ],
      bumpers: [post(52, 12, 0.5), post(66, 66, 0.6), post(106, 54, 0.5), post(106, 66, 0.5)],
    },
    {
      // An icefall: three steps of ice with a crevasse of lava in the middle
      // of each. Slide the middle and fly the crevasses, or walk the green
      // edges step by step. A sand gate at the bottom before the cup.
      name: 'Icefall',
      par: 3,
      tip: 'Three ice steps down. Fly the crevasses at pace, or creep down the green edges.',
      tee: { x: 6, y: 10 },
      cup: { x: 128, y: 10 },
      floor: [R(0, 0, 30, 20, 6), R(30, 0, 30, 20, 4), R(60, 0, 30, 20, 2), R(90, 0, 50, 20)],
      zones: [
        ice(8, 4, 22, 12), ice(34, 4, 26, 12), ice(64, 4, 26, 12),
        water(30, 8, 4, 4), water(60, 8, 4, 4),
        sand(100, 0, 4, 20), sand(24, 0, 6, 4), sand(24, 16, 6, 4), sand(54, 0, 6, 4), sand(54, 16, 6, 4),
        sand(132, 0, 8, 4), sand(132, 16, 8, 4),
      ],
      bumpers: [post(114, 6, 0.5), post(114, 14, 0.5), post(122, 3, 0.5), post(122, 17, 0.5)],
    },
    {
      // The meltdown: the frozen lake, the lava river (ice bridge or pad),
      // up the volcano and down the glacier (or the tunnel through it), the
      // ice field of rocks and the castle moat with a gap. Everything.
      name: 'Meltdown',
      par: 5,
      tip: 'Lake, river, volcano, glacier, moat. The pad and the tunnel are the short cuts.',
      tee: { x: 6, y: 30 },
      cup: { x: 152, y: 30 },
      floor: [R(0, 0, 160, 60), R(70, 10, 40, 40, 3)],
      zones: [
        ice(0, 0, 40, 60), sand(20, 26, 6, 8), sand(34, 12, 4, 8),
        water(44, 0, 8, 26), water(44, 34, 8, 26), ice(40, 26, 16, 8), jump(38, 42, 4, 6, 12),
        slopeTo(62, 26, 8, 8, 180, 3), water(80, 12, 20, 8), sand(80, 36, 20, 6), slopeTo(110, 26, 12, 8, 0, 3),
        tunnel(70, 44, 40, 4),
        ice(122, 10, 20, 40), water(142, 0, 4, 22), water(142, 38, 4, 22), sand(58, 46, 4, 10),
        water(0, 0, 10, 6), water(150, 52, 10, 8),
      ],
      blocks: [polyRect(61, 25, 1, 1), polyRect(61, 34, 1, 1)],
      bumpers: [post(130, 20, 0.7), post(134, 40, 0.7), post(148, 24, 0.5), post(148, 36, 0.5), post(66, 52, 0.6), post(26, 44, 0.6)],
    },
  ],
};
