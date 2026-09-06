// Built-in course. See .claude/course-guidelines.md before editing.
import {
  type Course, R, polyRect, polyNgon, polyStar,
  bumper, post, windmill, slider, pendulum, laser, rubber,
  sand, ice, water, slope, slopeTo, boost, jump, tele, conveyor, spinner, fan, trampoline, magnet, cannon, gfield, tunnel,
} from '../courses';
import { tri, low, mirrorTR, corner, star, open, lowRail, pond } from '../pieces';

// ---------------------------------------------------------------------------
// MACHINE WORKS — the ball is a part moving through a factory. Belts, sorting
// discs, pneumatic tubes, turbines, a crane, a gantry line and, at the end,
// the whole assembly in one Rube Goldberg chain. Neon.
// ---------------------------------------------------------------------------
export const MACHINE: Course = {
  id: 6,
  name: 'Machine Works',
  theme: 'neon',
  holes: [
    {
      // An S of three lanes. Cross belts in the first, a belt river down the
      // second, a sand gate in the third. Two corner mirrors chain a hard
      // drive right round the S: down the river and out along the last lane.
      name: 'Loading Bay',
      par: 3,
      tip: 'Cross the belts, ride the river down, sand gate to the cup. Or carom the lot.',
      tee: { x: 4, y: 7 },
      cup: { x: 92, y: 56 },
      floor: [R(0, 0, 52, 14), R(40, 14, 12, 36), R(40, 50, 64, 12)],
      zones: [
        conveyor(14, 0, 8, 14, 90, 7), conveyor(30, 0, 8, 14, 270, 7),
        conveyor(40, 16, 12, 16, 90, 14), sand(40, 34, 12, 4),
        sand(66, 50, 3, 12), sand(84, 50, 6, 3),
      ],
      blocks: [corner(52, 0, 12, -1, 1), corner(40, 62, 12, 1, -1)],
      bumpers: [post(26, 7, 0.6), post(43, 24, 0.6), post(50, 44, 0.5), post(98, 52, 0.5), post(98, 60, 0.5), post(78, 51.5, 0.5), post(78, 60.5, 0.5)],
    },
    {
      // The sorter: a turntable in the junction sends you to the upper belt
      // lane (fast, into a mirror that drops you straight down the exit lane)
      // or the lower lane (plain, sand gate). Both end in the same exit lane.
      name: 'Sorting Line',
      par: 4,
      tip: 'The disc sorts you: fast belt lane above, sand lane below. Both meet at the end.',
      tee: { x: 4, y: 17 },
      cup: { x: 83, y: 40 },
      floor: [R(0, 12, 16, 10), R(16, 0, 16, 34), R(32, 24, 44, 10), R(32, 0, 44, 10), R(76, 0, 12, 44)],
      zones: [
        spinner(16, 9, 16, 16, 3),
        conveyor(36, 0, 32, 10, 0, 26),
        sand(46, 24, 4, 10), sand(64, 24, 4, 10),
      ],
      blocks: [corner(88, 0, 8, -1, 1), tri(32, 10, 32, 24, 26, 17)],
      bumpers: [post(74, 6, 0.6), post(56, 30, 0.6), post(79, 36, 0.5), post(85, 36, 0.5), post(84, 20, 0.6)],
    },
    {
      // A pneumatic tube: you start loaded. Fire over the lava onto the sand,
      // roll into the second tube, fire again up onto the platform. The
      // service corridor runs under both pools and climbs a ramp at the end.
      name: 'Pneumatic Tube',
      par: 4,
      tip: 'You start loaded: tube, sand, tube, platform. Or the corridor below and a ramp.',
      tee: { x: 8.5, y: 19 },
      cup: { x: 108, y: 10 },
      floor: [R(0, 0, 116, 48), R(76, 4, 40, 32, 2.5)],
      zones: [
        cannon(6, 16, 5, 6, 0, 30, 12), water(14, 8, 10, 24), sand(30, 10, 4, 20),
        cannon(48, 16, 6, 8, 0, 30, 20), water(56, 8, 12, 24), sand(68, 8, 8, 24),
        slopeTo(76, 36, 10, 8, 90, 2.5),
        sand(84, 6, 3, 28), sand(40, 38, 4, 10), sand(60, 40, 4, 8), sand(100, 28, 4, 8),
      ],
      blocks: [polyRect(14, 0, 10, 8), polyRect(56, 0, 14, 8), polyRect(75, 43, 1, 1), polyRect(86, 43, 1, 1)],
      bumpers: [post(24, 40, 0.6), post(50, 44, 0.6), post(96, 14, 0.5), post(104, 16, 0.5), post(104, 5, 0.5), post(92, 40, 0.6)],
    },
    {
      // The turbine hall: an S round a raised engine block, a counter-rotating
      // turbine in every lane, a sand gate before the cup. A tunnel bores
      // straight through the block from the first lane to the last.
      name: 'Turbine Hall',
      par: 3,
      tip: 'Three turbines, an S round the engine block. The tunnel through it skips two.',
      tee: { x: 10, y: 6 },
      cup: { x: 76, y: 6 },
      floor: [R(0, 0, 20, 52), R(20, 40, 40, 12), R(60, 0, 20, 52), R(20, 10, 40, 8), R(20, 0, 40, 40, 2)],
      zones: [
        tunnel(20, 12, 40, 4),
        spinner(2, 20, 16, 16, 3), spinner(29, 40, 12, 12, -3), spinner(62, 18, 16, 16, -3),
        sand(60, 36, 20, 3), sand(44, 42, 4, 10), sand(2, 46, 8, 6), sand(60, 4, 8, 6),
      ],
      blocks: [tri(80, 10, 80, 20, 70, 20)],
      bumpers: [post(10, 40, 0.6), post(16, 12, 0.5), post(64, 24, 0.6), post(70, 46, 0.6), post(72, 10, 0.4)],
    },
    {
      // The crane yard. The honest line is a U round the raised yard; a jump
      // pad off the tee line hops you up onto it, the magnet drags you to the
      // hook and the hook drops you beside the cup.
      name: 'Magnet Crane',
      par: 4,
      tip: 'Round the yard the long way, or hop the pad onto it and let the crane hook you.',
      tee: { x: 4, y: 3 },
      cup: { x: 6, y: 46 },
      floor: [R(0, 0, 60, 12), R(48, 12, 12, 28), R(0, 40, 60, 12), R(20, 12, 28, 28, 2)],
      zones: [
        jump(18, 6, 4, 4, 12), magnet(20, 12, 28, 28, 16), tele(32, 24, 4, 4, 14, 46),
        sand(38, 0, 4, 12), sand(48, 24, 12, 3), sand(30, 40, 4, 12), sand(10, 44, 3, 8),
      ],
      bumpers: [post(54, 36, 0.6), post(22, 46, 0.6), post(44, 4, 0.5), post(10, 42, 0.4), post(10, 50, 0.4)],
    },
    {
      // An overhead belt runs along a gantry with no rails over the shop floor
      // and drops you on the cup platform. Below, the honest route winds
      // through the yard to a ramp at the far end.
      name: 'Overhead Line',
      par: 4,
      tip: 'Enter the gantry belt straight and it carries you over. Or the yard and ramp.',
      tee: { x: 4, y: 40 },
      cup: { x: 104, y: 14 },
      floor: [R(0, 0, 110, 48), R(78, 8, 32, 24, 2.5), open(18, 17, 60, 6, 2.5)],
      zones: [
        slopeTo(10, 17, 8, 6, 180, 2.5), conveyor(20, 17, 56, 6, 0, 12),
        sand(30, 30, 4, 18), sand(56, 24, 4, 24), sand(96, 10, 3, 20), sand(20, 0, 10, 8),
        slopeTo(80, 32, 10, 8, 90, 2.5),
      ],
      blocks: [polyRect(18, 17, 60, 6), polyRect(9, 16, 1, 1), polyRect(9, 23, 1, 1), polyRect(79, 40, 1, 1), polyRect(90, 40, 1, 1)],
      bumpers: [post(44, 40, 0.6), post(70, 44, 0.6), post(100, 20, 0.5), post(100, 8, 0.5), post(40, 6, 0.6)],
    },
    {
      // The drop forge. You tee off on a high platform; the cup is on another.
      // Honest: roll off the front, cross the floor, climb the ramp. Gamble:
      // off the side onto the trampoline, which throws you up onto the cup.
      name: 'Drop Forge',
      par: 3,
      tip: 'Off the front and round to the ramp, or off the side onto the trampoline. Fly.',
      tee: { x: 4, y: 10 },
      cup: { x: 80, y: 10 },
      floor: [R(0, 0, 100, 50), R(0, 0, 20, 20, 4), R(60, 0, 40, 20, 2.5)],
      zones: [
        trampoline(30, 6, 10, 8, 20),
        slopeTo(84, 20, 10, 8, 90, 2.5),
        sand(34, 22, 4, 28), sand(52, 30, 4, 20), sand(86, 2, 3, 16), sand(24, 14, 12, 6),
      ],
      blocks: [polyRect(83, 27, 1, 1), polyRect(94, 27, 1, 1)],
      bumpers: [post(44, 42, 0.6), post(20, 34, 0.6), post(70, 16.5, 0.5), post(70, 3.5, 0.5), post(70, 40, 0.6)],
    },
    {
      // The induction coil: a square spiral of lanes with a belt in each ring
      // and a mirror in each corner. Hit the first belt at pace and the coil
      // carries you round three rings — if the windmill lets you past.
      name: 'Induction Coil',
      par: 3,
      tip: 'A spiral. Ride the belts ring by ring, or hit the first hard and time the mill.',
      tee: { x: 4, y: 9 },
      cup: { x: 48, y: 24 },
      floor: [R(0, 0, 70, 12), R(58, 0, 12, 52), R(20, 40, 50, 12), R(20, 20, 12, 32), R(32, 20, 20, 8)],
      zones: [
        conveyor(8, 1, 50, 4, 0, 20), conveyor(59, 12, 4, 28, 90, 20), conveyor(32, 47, 26, 4, 180, 20), conveyor(27, 32, 4, 8, 270, 20),
        sand(24, 6, 6, 6), sand(20, 36, 4, 4), sand(42, 44, 4, 8),
      ],
      blocks: [corner(70, 0, 12, -1, 1), corner(70, 52, 12, -1, -1), corner(20, 52, 12, 1, -1), corner(20, 20, 12, 1, 1), ...windmill(64, 26, 5, 1.6, 2, 0.8)],
      bumpers: [post(40, 8, 0.6), post(36, 46, 0.5), post(42, 21, 0.4), post(42, 27, 0.4)],
    },
    {
      // The assembly: belt → sorter disc → launch ramp → trampoline → magnet →
      // cannon → cup, the whole factory in one chain across the hall. The
      // honest route is the sandy service corridor round the bottom.
      name: 'The Assembly',
      par: 5,
      tip: 'Belt, disc, ramp, trampoline, magnet, cannon, cup. Or the service corridor.',
      tee: { x: 4, y: 52 },
      cup: { x: 138, y: 30 },
      floor: [R(0, 44, 110, 16), R(0, 0, 110, 44), R(110, 0, 34, 60)],
      zones: [
        conveyor(8, 26, 20, 8, 0, 18), spinner(30, 22, 16, 16, 3), slope(50, 26, 6, 8, 180, 10),
        trampoline(62, 26, 8, 8, 14), magnet(84, 18, 24, 24, 20), cannon(93, 27, 6, 6, 0, 30, 14),
        water(110, 18, 8, 24), sand(120, 22, 4, 16),
        sand(24, 44, 4, 16), sand(52, 44, 4, 16), sand(80, 44, 4, 16), sand(110, 0, 34, 4),
        sand(8, 36, 20, 8), sand(46, 8, 10, 10),
      ],
      blocks: [polyRect(12, 42, 98, 2), polyRect(108, 0, 2, 44)],
      bumpers: [post(40, 52, 0.6), post(66, 56, 0.6), post(96, 50, 0.6), post(134, 26, 0.5), post(134, 34, 0.5), post(116, 10, 0.6), post(124, 44, 0.6), post(60, 14, 0.6)],
    },
  ],
};
