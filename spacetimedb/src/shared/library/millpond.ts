// Built-in course. See .claude/course-guidelines.md before editing.
import {
  type Course, R, polyRect, polyNgon, polyStar,
  bumper, post, windmill, slider, pendulum, laser, rubber,
  sand, ice, water, slope, slopeTo, boost, jump, tele, conveyor, spinner, fan, trampoline, magnet, cannon, gfield, tunnel,
} from '../courses';
import { tri, low, mirrorTR, corner, star, open, lowRail, pond } from '../pieces';

// ---------------------------------------------------------------------------
// MILLPOND — water everywhere. The land is the floor (quays, causeways,
// islands, banks, every edge railed) and the ponds lie between as water
// over the lawn: nothing rolls into them, only flights come down in them.
// The dry way round is always there; the wet way is shorter.
// ---------------------------------------------------------------------------
const TB2 = R(0, 0, 20, 20), N1 = R(20, 8, 8, 4), S1 = R(28, 4, 12, 12), N2 = R(40, 8, 8, 4), S2 = R(48, 4, 12, 12), N3 = R(60, 8, 8, 4), S3 = R(68, 4, 12, 12), N4 = R(80, 8, 8, 4), CB2 = R(88, 0, 24, 50), TP1 = R(0, 20, 10, 30), TP2 = R(10, 40, 78, 10);
const TB7 = R(0, 0, 24, 24), L1 = R(28.7, 19, 6, 6), L2 = R(44.9, 29.5, 6, 6), L3 = R(58.9, 38.6, 6, 6), CB7 = R(70, 46, 34, 34), CW71 = R(0, 24, 8, 56), CW72 = R(8, 74, 62, 6);
const TB9 = R(0, 20, 30, 30), CW91 = R(30, 40, 20, 6), CW92 = R(50, 10, 6, 36), ISL9 = R(56, 4, 40, 40), CW93 = R(96, 30, 20, 6), EB9 = R(116, 10, 24, 50), J9 = R(124, 60, 8, 24);

export const MILLPOND: Course = {
  id: 14,
  name: 'Millpond',
  theme: 'park',
  holes: [
    {
      // Four quays round a harbour basin, a lighthouse island in the middle
      // with a causeway from the east quay. The cannon on the west quay lobs
      // you straight onto the island.
      name: 'The Harbour',
      par: 4,
      tip: 'Round the quays to the far one, or the cannon lobs you onto the island.',
      tee: { x: 9, y: 30 },
      cup: { x: 93, y: 30 },
      floor: [R(0, 0, 14, 60), R(14, 50, 72, 10), R(86, 0, 14, 60), R(14, 0, 72, 10), R(38, 20, 24, 18), R(62, 28, 24, 4)],
      zones: [
        ...pond(14, 10, 72, 40, R(38, 20, 24, 18), R(62, 28, 24, 4)), cannon(0, 40, 5, 6, 340, 44, 18),
        sand(40, 50, 4, 10), sand(86, 20, 14, 4), sand(40, 0, 4, 10), sand(0, 14, 14, 3), sand(86, 44, 14, 3),
      ],
      bumpers: [post(42, 24, 0.8), post(70, 55, 0.6), post(96, 36, 0.5), post(96, 24, 0.5), post(30, 5, 0.6), post(56, 33, 0.4)],
    },
    {
      // Three stepping stones on a diagonal, each with a pad at its far
      // corner: hop them at the right pace and the chain carries you to the
      // far bank. The towpath goes round the outside.
      name: 'Stepping Stones',
      par: 4,
      tip: 'Three stones joined by narrow necks: thread them straight, or walk the towpath.',
      tee: { x: 6, y: 10 },
      cup: { x: 98, y: 10 },
      floor: [TB2, N1, S1, N2, S2, N3, S3, N4, CB2, TP1, TP2],
      zones: [
        ...pond(0, 0, 112, 50, TB2, N1, S1, N2, S2, N3, S3, N4, CB2, TP1, TP2),
        sand(0, 30, 10, 3), sand(40, 40, 4, 10), sand(88, 40, 8, 10), sand(30, 12, 8, 4), sand(70, 4, 8, 4),
      ],
      bumpers: [post(93, 17, 0.5), post(104, 17, 0.5), post(54, 6, 0.5), post(64, 45, 0.6), post(100, 40, 0.5)],
    },
    {
      // Three lock basins at three heights. Walk the lock sides (kerbed) and
      // climb the gates — or take a fan across each pool.
      name: 'The Locks',
      par: 4,
      tip: 'Three basins, three levels. Walk the lock sides and gates, or hop the pads.',
      tee: { x: 4, y: 2 },
      cup: { x: 116, y: 20 },
      floor: [R(0, 0, 40, 24), R(40, 0, 40, 24, 1.5), R(80, 0, 44, 24, 3)],
      zones: [
        water(14, 6, 12, 12), slopeTo(32, 0, 8, 24, 180, 1.5), jump(26, 18, 4, 6, 12),
        water(54, 6, 12, 12), slopeTo(72, 0, 8, 24, 180, 1.5), jump(66, 18, 4, 6, 12),
        water(94, 6, 12, 12),
        sand(108, 0, 4, 6),
      ],
      blocks: [
        low(14, 5.5, 12, 0.5, 0.8), low(14, 18, 12, 0.5, 0.8), low(54, 5.5, 12, 0.5, 0.8), low(54, 18, 12, 0.5, 0.8), low(94, 5.5, 12, 0.5, 0.8), low(94, 18, 12, 0.5, 0.8),
      ],
      bumpers: [post(112, 12, 0.5), post(120, 14, 0.5), post(30, 3, 0.4), post(50, 3, 0.4), post(90, 3, 0.4)],
    },
    {
      // A river runs round two bends with rocks in it and a current that
      // carries you to the cup bank. The towpath inside the bend is slow
      // but nothing hits you.
      name: 'Rapids',
      par: 4,
      tip: 'Ride the rapids round two bends and leave for the bank before the fall. Or walk.',
      tee: { x: 4, y: 20 },
      cup: { x: 110, y: 62 },
      floor: [R(0, 0, 50, 14), R(50, 0, 14, 40), R(50, 40, 70, 14), R(0, 14, 50, 26), R(0, 40, 50, 28), R(50, 54, 70, 14)],
      zones: [
        conveyor(10, 1, 38, 12, 0, 10), conveyor(51, 12, 12, 26, 90, 10), conveyor(60, 41, 50, 12, 0, 10), water(110, 41, 10, 12),
        sand(24, 14, 4, 26), sand(20, 46, 4, 22), sand(70, 60, 4, 8), sand(92, 54, 4, 8),
      ],
      bumpers: [post(18, 5, 0.7), post(30, 9, 0.7), post(42, 4, 0.7), post(57, 22, 0.7), post(60, 33, 0.7), post(74, 45, 0.7), post(86, 49, 0.7), post(104, 58, 0.5), post(104, 66, 0.5), post(40, 30, 0.6)],
    },
    {
      // A Z-shaped lane crossed by two rivers. Each has a bridge (a gap in
      // the current with kerbs) and spills over a weir into a pool at its
      // end; cross anywhere else and the current carries you toward it.
      name: 'The Weir',
      par: 4,
      tip: 'Two rivers cross the lane. Take the bridges, or cross fast and drift with them.',
      tee: { x: 5, y: 12 },
      cup: { x: 110, y: 85 },
      floor: [R(0, 0, 60, 30), R(50, 30, 14, 40), R(50, 70, 70, 30)],
      zones: [
        conveyor(30, 0, 10, 10, 90, 9), conveyor(30, 14, 10, 12, 90, 9), water(30, 26, 10, 4),
        water(90, 70, 10, 4), conveyor(90, 74, 10, 10, 270, 9), conveyor(90, 88, 10, 12, 270, 9),
        sand(16, 20, 4, 10), sand(50, 50, 14, 3), sand(72, 90, 4, 10),
      ],
      blocks: [low(30, 10, 10, 0.5, 0.6), low(30, 13.5, 10, 0.5, 0.6), low(90, 84, 10, 0.5, 0.6), low(90, 87.5, 10, 0.5, 0.6)],
      bumpers: [post(46, 8, 0.6), post(57, 40, 0.6), post(80, 78, 0.6), post(106, 80, 0.5), post(106, 90, 0.5)],
    },
    {
      // A dam holds a reservoir. Up the ramp onto the dam road, along it and
      // off the downstream face into the valley, then up the outflow channel
      // to the cup. The sluice tunnel bores through the dam below.
      name: 'The Dam',
      par: 4,
      tip: 'Up onto the dam road and off its face into the valley, or through the sluice.',
      tee: { x: 8, y: 32 },
      cup: { x: 110, y: 7 },
      floor: [R(0, 30, 40, 12), R(40, 0, 8, 42, 2), R(48, 0, 20, 42), R(68, 0, 50, 14)],
      zones: [
        water(0, 0, 40, 30), slopeTo(32, 30, 8, 6, 180, 2), tunnel(40, 36, 8, 6), water(68, 14, 50, 6),
        sand(40, 10, 8, 4), sand(56, 0, 4, 30), sand(84, 0, 4, 14), sand(14, 30, 4, 12),
      ],
      blocks: [polyRect(31, 36, 1, 1)],
      bumpers: [post(52, 39, 0.6), post(44, 24, 0.5), post(100, 4, 0.5), post(104, 10, 0.5), post(60, 34, 0.6)],
    },
    {
      // Lily pads on a diagonal across the pond, every one a trampoline:
      // hit the bank pad at the right pace and you bounce pad to pad to the
      // far bank. The causeway winds round the west and south shores.
      name: 'Lily Pads',
      par: 4,
      tip: 'Bounce the lily pads corner to corner (one pace does it) or take the causeway.',
      tee: { x: 4, y: 4 },
      cup: { x: 96, y: 64 },
      floor: [TB7, L1, L2, L3, CB7, CW71, CW72],
      zones: [
        ...pond(0, 0, 104, 80, TB7, L1, L2, L3, CB7, CW71, CW72),
        jump(14, 10, 6, 6, 14), trampoline(28.7, 19, 6, 6, 14), trampoline(44.9, 29.5, 6, 6, 14), trampoline(58.9, 38.6, 6, 6, 14),
        sand(0, 44, 8, 4), sand(34, 74, 4, 6), sand(70, 66, 6, 8), sand(0, 66, 8, 3),
      ],
      bumpers: [post(90, 70, 0.5), post(100, 58, 0.5), post(52, 77, 0.6), post(4, 34, 0.5), post(84, 52, 0.6)],
    },
    {
      // The boathouse on the south shore is a portal to the east bank. Take
      // the boat, or walk the north bank all the way round.
      name: 'Boathouse',
      par: 2,
      tip: 'The boathouse door is a portal to the far shore. Take the boat, or the bank.',
      tee: { x: 6, y: 40 },
      cup: { x: 95, y: 31 },
      floor: [R(0, 0, 20, 50), R(20, 0, 60, 12), R(80, 0, 20, 50), R(20, 44, 24, 6)],
      zones: [
        ...pond(20, 12, 60, 32), tele(38, 44, 6, 6, 88, 28),
        sand(40, 0, 4, 12), sand(62, 0, 4, 12), sand(80, 20, 20, 4), sand(20, 44, 6, 6), sand(0, 20, 20, 3),
      ],
      bumpers: [post(52, 6, 0.6), post(88, 40, 0.5), post(96, 40, 0.5), post(90, 12, 0.6)],
    },
    {
      // The mill stands on an island in the middle of the pond, sails
      // sweeping the yard. Causeways in and out, a jetty for the cup, and a
      // cannon on the tee bank that lobs you straight onto the island.
      name: 'The Mill',
      par: 5,
      tip: 'Causeway in, round the sails, causeway out, down the jetty. Or the cannon.',
      tee: { x: 6, y: 45 },
      cup: { x: 128, y: 80 },
      floor: [TB9, CW91, CW92, ISL9, CW93, EB9, J9],
      zones: [
        ...pond(0, 0, 140, 90, TB9, CW91, CW92, ISL9, CW93, EB9, J9), cannon(2, 22, 6, 6, 350, 42, 22),
        sand(36, 40, 4, 6), sand(50, 20, 6, 3), sand(100, 30, 4, 6), sand(116, 40, 24, 3), sand(124, 66, 8, 3),
      ],
      blocks: [...windmill(76, 24, 10, 1.2, 4, 0.9)],
      bumpers: [post(66, 10, 0.6), post(66, 38, 0.6), post(86, 10, 0.6), post(86, 38, 0.6), post(126, 74, 0.4), post(130, 76, 0.4), post(20, 30, 0.6)],
    },
  ],
};
