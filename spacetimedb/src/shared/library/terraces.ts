// Built-in course. See .claude/course-guidelines.md before editing.
import {
  type Course, R, polyRect, polyNgon, polyStar,
  bumper, post, windmill, slider, pendulum, laser, rubber,
  sand, ice, water, slope, slopeTo, boost, jump, tele, conveyor, spinner, fan, trampoline, magnet, cannon, gfield, tunnel,
} from '../courses';
import { tri, low, mirrorTR, corner, star, open, lowRail, pond } from '../pieces';

// ---------------------------------------------------------------------------
// HIGHLAND TERRACES — multi-level landscapes: platforms, cliffs, ramps and
// tunnels. Every hole climbs (or drops) through three or more levels; the
// honest way winds up the terraces, the gamble goes over or under them.
// ---------------------------------------------------------------------------
export const TERRACES: Course = {
  id: 12,
  name: 'Highland Terraces',
  theme: 'park',
  holes: [
    {
      // A square snail: ground lane east, first terrace north, second terrace
      // west, the keep at the top of the spiral. The bailey off the first
      // terrace holds a cannon that lobs you straight onto the keep.
      name: 'Hill Fort',
      par: 5,
      tip: 'Spiral up three terraces to the keep, or take the cannon in the bailey.',
      tee: { x: 6, y: 50 },
      cup: { x: 8, y: 16 },
      floor: [R(0, 44, 70, 12), R(58, 10, 12, 46, 1.5), R(16, 0, 54, 10, 3), R(0, 0, 16, 26, 4.5), R(16, 26, 42, 18, 1.5)],
      zones: [
        slopeTo(48, 44, 10, 12, 180, 1.5), slopeTo(58, 10, 12, 10, 90, 1.5), slopeTo(16, 0, 10, 10, 0, 1.5),
        cannon(20, 32, 6, 6, 232, 24, 16),
        sand(26, 44, 4, 12), sand(58, 28, 12, 4), sand(38, 0, 4, 10), sand(40, 26, 8, 18),
      ],
      bumpers: [post(6, 10, 0.5), post(12, 21, 0.5), post(64, 40, 0.6), post(30, 5, 0.5), post(34, 36, 0.6)],
    },
    {
      // Tee on one plateau, cup on another. A dam holds a reservoir across the
      // valley: over the dam by the ramp (honest) or through its sluice tunnel
      // (the gamble), then up the far ramp. The north cliff drops into water.
      name: 'Valley Crossing',
      par: 3,
      tip: 'Down the ramp, over the dam, up the far side. The sluice tunnel is shorter.',
      tee: { x: 6, y: 38 },
      cup: { x: 104, y: 32 },
      floor: [R(0, 0, 22, 44, 3), R(22, 0, 70, 44), R(52, 0, 10, 44, 1.5), R(92, 0, 24, 44, 3)],
      zones: [
        slopeTo(22, 34, 12, 10, 0, 3), water(22, 0, 30, 20), slopeTo(44, 36, 8, 8, 180, 1.5), tunnel(52, 26, 10, 6),
        sand(52, 0, 10, 22), water(62, 0, 20, 12), sand(66, 14, 6, 10), slopeTo(80, 26, 12, 12, 180, 3), sand(96, 0, 3, 28), sand(96, 36, 3, 8),
      ],
      blocks: [low(19, 0, 1, 22, 1.2), polyRect(33, 33, 1, 1), polyRect(43, 35, 1, 1), polyRect(79, 25, 1, 1), polyRect(79, 38, 1, 1)],
      bumpers: [post(40, 28, 0.6), post(74, 30, 0.6), post(100, 26, 0.5), post(100, 38, 0.5), post(110, 14, 0.6)],
    },
    {
      // A waterfall of terraces: tee on the top step, ramps down at every
      // corner of a U. The leap: a pad on the top step throws you over the
      // lawn straight down to the bottom step.
      name: 'The Cascade',
      par: 3,
      tip: 'Down the steps: east, south, west. Or take the pad and leap the whole cascade.',
      tee: { x: 4, y: 5 },
      cup: { x: 6, y: 54 },
      floor: [R(0, 0, 24, 20, 4.5), R(24, 0, 12, 48, 3), R(0, 48, 36, 12, 1.5)],
      zones: [
        slopeTo(24, 4, 8, 12, 180, 1.5), slopeTo(24, 48, 12, 8, 90, 1.5), jump(10, 14, 8, 6, 16),
        sand(32, 0, 4, 16), sand(24, 36, 12, 4), sand(22, 56, 6, 4),
      ],
      blocks: [polyRect(32, 3, 1, 1), polyRect(32, 16, 1, 1)],
      bumpers: [post(14, 51, 0.5), post(28, 26, 0.6), post(18, 58, 0.5)],
    },
    {
      // A mesa with a road spiralling round it: ground, east, north, west, and
      // the summit ledge. The cannon on the ground lane lobs you over the
      // summit ledge onto the parapeted top.
      name: 'The Mesa',
      par: 5,
      tip: 'The road winds round the mesa four times. The cannon on the first lane skips it.',
      tee: { x: 8, y: 39 },
      cup: { x: 24, y: 14 },
      floor: [R(4, 36, 50, 12), R(54, 8, 8, 40, 1.5), R(12, 0, 50, 8, 3), R(4, 0, 8, 28, 4.5), R(4, 28, 50, 8, 6), R(12, 8, 42, 20, 6)],
      zones: [
        slopeTo(46, 36.5, 8, 11.5, 180, 1.5), slopeTo(54.5, 8, 7.5, 8, 90, 1.5), slopeTo(12, 0, 8, 7.5, 0, 1.5), slopeTo(4, 20, 8, 8, 270, 1.5),
        cannon(28, 42, 6, 6, 270, 12, 26),
        sand(30, 0, 4, 8), sand(4, 10, 8, 3), sand(20, 28, 4, 8), sand(54, 26, 8, 3),
      ],
      blocks: [low(12, 8, 42, 1, 1.2), low(12, 9, 1, 19, 1.2), low(53, 9, 1, 19, 1.2), polyRect(46, 36, 8, 0.5), polyRect(54, 8, 0.5, 8), polyRect(12, 7.5, 8, 0.5)],
      bumpers: [post(18, 20, 0.5), post(30, 20, 0.5), post(24, 24, 0.5), post(58, 40, 0.5), post(40, 4, 0.5)],
    },
    {
      // Two plateaus with a pit between them. Fall in with pace and the
      // trampoline throws you onto the far plateau; the slow ones climb out
      // by the ramp. The pad in the corner flies the pit altogether.
      name: 'Twin Plateaus',
      par: 3,
      tip: 'Drop into the pit and bounce across, or hit the corner pad and fly it.',
      tee: { x: 5, y: 12 },
      cup: { x: 94, y: 10 },
      floor: [R(0, 3, 30, 14, 3), R(30, 0, 14, 20), R(44, 0, 56, 20, 1.5)],
      zones: [
        trampoline(34, 7, 6, 6, 15), slopeTo(34, 0, 10, 7, 180, 1.5), slopeTo(34, 13, 10, 7, 180, 1.5), jump(20, 3, 4, 5, 12),
        sand(60, 14, 8, 6), sand(72, 0, 6, 6),
      ],
      bumpers: [post(66, 6, 0.5), post(86, 5, 0.5), post(86, 15, 0.5), post(78, 10, 0.5)],
    },
    {
      // An S-bend canyon with a river running back down it and a ridge road
      // along the rim: fast, straight and no rails at all. The ridge drops
      // into the last leg of the canyon.
      name: 'Canyon Road',
      par: 4,
      tip: 'Walk the canyon round two bends, or climb to the ridge road and run its rim.',
      tee: { x: 5, y: 20 },
      cup: { x: 104, y: 43 },
      floor: [R(0, 10, 44, 14), R(44, 10, 14, 40), R(58, 36, 52, 14), open(0, 0, 58, 10, 3), open(58, 0, 10, 44, 3)],
      zones: [
        slopeTo(6, 10, 10, 6, 90, 3), conveyor(16, 10, 28, 4, 180, 9), conveyor(44, 14, 4, 22, 270, 9), conveyor(62, 36, 48, 4, 180, 9),
        water(10, 10, 6, 4), sand(30, 18, 4, 6), sand(50, 28, 8, 4), sand(80, 42, 4, 8),
      ],
      blocks: [polyRect(5, 15, 1, 1), polyRect(16, 15, 1, 1)],
      bumpers: [post(26, 12, 0.5), post(46, 24, 0.5), post(72, 38, 0.5), post(90, 38, 0.5), post(100, 40, 0.5), post(100, 47, 0.5)],
    },
    {
      // Three terraces in a zigzag with a hairpin plaza at each end. The cannon
      // by the tee fires straight over both terraces onto the top one.
      name: 'Switchback Climb',
      par: 5,
      tip: 'East, hairpin, west, hairpin, east to the cup. The tee cannon skips it all.',
      tee: { x: 4, y: 8.5 },
      cup: { x: 56, y: 25 },
      floor: [R(0, 0, 52, 10), R(52, 0, 10, 20, 1.5), R(12, 10, 40, 10, 1.5), R(0, 10, 12, 20, 3), R(12, 20, 48, 10, 3)],
      zones: [
        slopeTo(44, 0, 8, 9.5, 180, 1.5), slopeTo(12, 10, 8, 9.5, 0, 1.5), cannon(8, 0, 6, 6, 90, 18, 20),
      ],
      blocks: [low(12, 20, 48, 1, 1.2)],
      bumpers: [post(57, 8, 0.5), post(50, 22, 0.5), post(50, 28, 0.5), post(24, 15, 0.5), post(30, 27, 0.5)],
    },
    {
      // A high plateau over a pond. The long ramp down the south side keeps
      // your pace; the cliff is a flight over the water. The cup sits on a
      // shelf up a second ramp.
      name: 'Hanging Valley',
      par: 3,
      tip: 'Roll down the side ramp, or fly the cliff over the pond. Then up onto the shelf.',
      tee: { x: 6, y: 26 },
      cup: { x: 97, y: 13 },
      floor: [R(0, 0, 20, 30, 4.5), R(20, 0, 80, 30), R(70, 18, 30, 12, 1.5), R(88, 0, 12, 18, 1.5)],
      zones: [
        slopeTo(20, 22, 14, 8, 0, 4.5), water(20, 2, 14, 18), slopeTo(60, 18, 10, 12, 180, 1.5),
        sand(40, 6, 6, 10), sand(50, 2, 8, 8), sand(76, 18, 3, 4), sand(76, 26, 3, 4),
      ],
      blocks: [polyRect(33, 21, 1, 1), polyRect(59, 17, 1, 1), { ...corner(100, 30, 8, -1, -1), bounce: 1.28 }],
      bumpers: [post(46, 22, 0.6), post(84, 21, 0.5), post(84, 29, 0.5), post(66, 8, 0.6)],
    },
    {
      // The finale: a ring of terraces round a keep. Up onto the ring, round
      // the back, up the back ramp to the cup. The gate tunnel bores through
      // the keep, and a cannon on the lawn lobs you over the ring wall.
      name: 'Summit Keep',
      par: 5,
      tip: 'Ring, back ramp, keep. The gate tunnel cuts through; the lawn cannon flies over.',
      tee: { x: 46, y: 84 },
      cup: { x: 60, y: 28 },
      floor: [
        R(40, 70, 60, 20), R(52, 52, 12, 18), R(20, 42, 80, 10, 2), R(20, 14, 10, 28, 2), R(90, 14, 10, 28, 2), R(20, 0, 80, 14, 2),
        R(30, 14, 60, 28, 4),
      ],
      zones: [
        slopeTo(52, 52, 12, 8, 90, 2), slopeTo(70, 6, 8, 8, 270, 2), tunnel(82, 14, 6, 28, 2), cannon(88, 74, 6, 6, 225, 46, 20),
        sand(36, 42, 4, 10), sand(20, 24, 10, 4), sand(40, 0, 4, 14), sand(92, 20, 8, 4), sand(64, 74, 8, 8), sand(20, 42, 6, 10),
      ],
      blocks: [
        low(30, 14, 40, 1, 1.2), low(78, 14, 12, 1, 1.2), low(30, 15, 1, 27, 1.2), low(89, 15, 1, 27, 1.2), low(30, 41, 60, 1, 1.2),
        polyRect(69, 5, 1, 1), polyRect(78, 5, 1, 1),
      ],
      bumpers: [post(50, 28, 0.6), post(70, 30, 0.6), post(58, 50, 0.5), post(25, 8, 0.5), post(95, 8, 0.5), post(56, 16, 0.5), post(66, 40, 0.5)],
    },
  ],
};
