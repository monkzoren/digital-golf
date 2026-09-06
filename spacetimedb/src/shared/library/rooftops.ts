// Built-in course. See .claude/course-guidelines.md before editing.
import {
  type Course, R, polyRect, polyNgon, polyStar,
  bumper, post, windmill, slider, pendulum, laser, rubber,
  sand, ice, water, slope, slopeTo, boost, jump, tele, conveyor, spinner, fan, trampoline, magnet, cannon, gfield, tunnel,
} from '../courses';
import { tri, low, mirrorTR, corner, star, open, lowRail, pond } from '../pieces';

// ---------------------------------------------------------------------------
// ROOFTOPS — a city block at night. Roofs are open platforms with no rails
// and gaps between them; the alleys below have fire escapes (short ramps)
// back up. Hop the roofs, or take the alley and climb at the end.
// ---------------------------------------------------------------------------
export const ROOFTOPS: Course = {
  id: 13,
  name: 'Rooftops',
  theme: 'neon',
  holes: [
    {
      // Three roofs in a row over one long alley. The pads sit in the far
      // corners, trampolines in the pits under the gaps, and the fire
      // escape climbs out of the alley's end onto the cup roof.
      name: 'The Block',
      par: 4,
      tip: 'Hop three roofs by the corner pads, or take the alley and the fire escape.',
      tee: { x: 5, y: 8 },
      cup: { x: 114, y: 20 },
      floor: [open(0, 0, 24, 16, 2), R(24, 0, 6, 16), open(30, 0, 30, 16, 2), R(60, 0, 6, 16), open(66, 0, 30, 16, 2), R(0, 16, 96, 10), open(96, 10, 30, 20, 2)],
      zones: [
        jump(18, 0, 4, 5, 11), trampoline(24, 2, 6, 8, 15), jump(54, 11, 4, 5, 11), trampoline(60, 2, 6, 8, 15), slopeTo(88, 16, 8, 10, 180, 2),
        sand(40, 18, 6, 8), sand(70, 20, 6, 6), sand(100, 10, 3, 8),
      ],
      blocks: [low(96, 10, 30, 1, 1.2), low(125, 10, 1, 20, 1.2), low(96, 29, 30, 1, 1.2), polyRect(87, 15, 1, 1)],
      bumpers: [post(46, 8, 0.5), post(84, 5, 0.5), post(108, 16, 0.5), post(108, 25, 0.5), post(120, 14, 0.5)],
    },
    {
      // Two tall roofs joined by a narrow skybridge over an alley of lasers.
      // Fall off the bridge and you are in the alley: through the gates,
      // into the pocket and up the long ramp.
      name: 'Skybridge',
      par: 3,
      tip: 'The bridge is five wide and straight. The alley runs under it to a ramp.',
      tee: { x: 6, y: 15 },
      cup: { x: 96, y: 15 },
      floor: [open(0, 0, 20, 30, 4), open(20, 12.5, 40, 5, 4), open(60, 0, 44, 30, 4), R(20, 0, 40, 46), R(60, 30, 20, 16)],
      zones: [tunnel(36, 12, 8, 6), slopeTo(66, 30, 10, 10, 90, 4), sand(24, 32, 6, 14), sand(50, 2, 4, 9), sand(50, 19, 4, 9), sand(84, 20, 4, 10), sand(70, 2, 4, 8)],
      blocks: [laser(28, 0, 1, 11, 2.5, 0.5, 0), laser(28, 19, 1, 11, 2.5, 0.5, 0), low(103, 0, 1, 30, 1.2), low(60, 0, 44, 1, 1.2), polyRect(60, 30, 6, 10), polyRect(76, 30, 4, 10)],
      bumpers: [post(40, 36, 0.6), post(88, 9, 0.5), post(88, 21, 0.5), post(78, 26, 0.5)],
    },
    {
      // Three roofs, each higher than the last: a trampoline pit, then a pad,
      // then a trampoline pit again. The alley below ends in a pocket with
      // a steep fire escape straight up to the top roof.
      name: 'Fire Escape',
      par: 4,
      tip: 'Bounce and hop up three roofs, or take the alley to the steep ramp.',
      tee: { x: 5, y: 10 },
      cup: { x: 98, y: 6 },
      floor: [open(0, 0, 24, 20, 2), R(24, 0, 8, 20), open(32, 0, 40, 20, 3.5), R(72, 0, 8, 20), open(80, 0, 30, 20, 5), R(0, 20, 80, 16), R(80, 20, 10, 20)],
      zones: [
        trampoline(24, 4, 8, 10, 17), jump(66, 0, 4, 5, 14), trampoline(72, 4, 8, 10, 19), slopeTo(80, 20, 10, 10, 90, 5),
        sand(30, 22, 6, 14), sand(56, 24, 6, 12), sand(86, 6, 3, 14),
      ],
      blocks: [low(80, 0, 30, 1, 1.2), low(109, 0, 1, 20, 1.2), low(89, 30, 1, 10, 1.2)],
      bumpers: [post(50, 5, 0.5), post(94, 12, 0.5), post(102, 14, 0.5), post(70, 30, 0.6)],
    },
    {
      // A burst water tower has flooded the roof round the cup: a causeway
      // crosses the pond to the island. The corner pad flies you straight to
      // the island; the alley climbs onto the far end of the roof.
      name: 'Water Tower',
      par: 4,
      tip: 'Alley, fire escape, quay, causeway, island. The pocket pad flies straight in.',
      tee: { x: 5, y: 12 },
      cup: { x: 60, y: 15 },
      floor: [open(0, 0, 30, 28, 2), R(30, 0, 6, 28), open(36, 0, 50, 28, 2), R(0, 28, 100, 8), open(86, 10, 14, 26, 2), R(48, 36, 6, 6)],
      zones: [
        ...pond(36, 0, 50, 28, R(54, 11, 12, 8), R(66, 13, 12, 4), R(78, 4, 8, 24)), jump(48, 36, 6, 6, 15),
        slopeTo(76, 28, 10, 8, 180, 2), sand(60, 30, 6, 6), sand(88, 28, 11, 6), sand(80, 4, 6, 4), sand(80, 24, 6, 4), sand(16, 29, 6, 7),
      ],
      blocks: [
        low(36, 0, 64, 1, 1.2), low(99, 10, 1, 26, 1.2), polyRect(75, 27, 1, 1), low(77.5, 4, 0.5, 9, 1), low(77.5, 17, 0.5, 11, 1), low(66, 12.5, 12, 0.5, 0.6), low(66, 17, 12, 0.5, 0.6),
        low(54, 11, 12, 0.5, 1), low(54, 18.5, 12, 0.5, 1), low(54, 11.5, 0.5, 1.5, 1), low(54, 17, 0.5, 1.5, 1), low(65.5, 11.5, 0.5, 1.5, 1), low(65.5, 17, 0.5, 1.5, 1),
      ],
      bumpers: [post(92, 20, 0.5), post(40, 33, 0.5), post(72, 11, 0.4), post(72, 19, 0.4)],
    },
    {
      // A rubber billboard on the tee roof throws the ball back across the
      // gap by way of the pad behind the tee. The alley below runs west to a
      // pocket and a fire escape onto the cup roof.
      name: 'Billboard',
      par: 3,
      tip: 'Drive INTO the billboard: it throws you back over the gap. Or take the alley.',
      tee: { x: 62, y: 12 },
      cup: { x: 10, y: 4 },
      floor: [open(50, 0, 30, 24, 2), R(40, 0, 10, 24), open(0, 0, 40, 24, 2), R(0, 24, 80, 16)],
      zones: [jump(51, 8, 4, 8, 11), slopeTo(0, 24, 10, 10, 90, 2), sand(30, 4, 4, 20), sand(20, 26, 6, 14), sand(56, 28, 6, 12)],
      blocks: [rubber(77, 2, 2, 20, 2), low(0, 0, 40, 1, 1.2), low(0, 1, 1, 23, 1.2), low(50, 0, 30, 1, 1.2), polyRect(10, 33, 1, 1)],
      bumpers: [post(14, 10, 0.5), post(6, 12, 0.5), post(66, 5, 0.5), post(66, 19, 0.5)],
    },
    {
      // A crane arm sweeps the long roof and shoves slow balls off into the
      // alley. The alley has laser gates; the pit at the roof's end has a
      // trampoline; the fire escape climbs onto the cup roof.
      name: 'Crane',
      par: 4,
      tip: 'Time the crane along the roof, or take the laser alley and the fire escape.',
      tee: { x: 5, y: 7 },
      cup: { x: 104, y: 12 },
      floor: [open(0, 0, 80, 14, 2), R(80, 0, 10, 14), R(0, 14, 90, 10), open(90, 4, 20, 20, 2)],
      zones: [trampoline(80, 2, 10, 10, 15), slopeTo(82, 14, 8, 10, 180, 2), sand(24, 16, 4, 8), sand(56, 16, 4, 8), sand(94, 4, 3, 14)],
      blocks: [...windmill(40, 7, 6, 1.4, 2, 0.8), laser(30, 14, 1, 10, 2.5, 0.5, 0), laser(64, 14, 1, 10, 2.5, 0.5, 0.5), low(90, 4, 20, 1, 1.2), low(109, 4, 1, 20, 1.2), low(90, 23, 20, 1, 1.2), polyRect(81, 23, 1, 1)],
      bumpers: [post(20, 3, 0.5), post(60, 11, 0.5), post(100, 8, 0.5), post(100, 17, 0.5)],
    },
    {
      // A whole building in the middle of the block. Round it by the street
      // (honest), over it by the ramp and its open roof, or under it through
      // the subway tunnel — the one straight line to the cup.
      name: 'Subway',
      par: 2,
      tip: 'Round the block by the street, over the roof, or straight through the subway.',
      tee: { x: 6, y: 23 },
      cup: { x: 95, y: 23 },
      floor: [R(0, 0, 20, 40), R(20, 0, 70, 30, 2), R(90, 0, 20, 40), R(20, 30, 70, 10)],
      zones: [tunnel(20, 20, 70, 6), slopeTo(12, 6, 8, 10, 180, 2), sand(36, 32, 4, 8), sand(66, 32, 4, 8), sand(94, 30, 4, 10), sand(92, 12, 4, 6), sand(50, 2, 4, 16)],
      blocks: [polyRect(11, 5, 1, 1), polyRect(11, 16, 1, 1)],
      bumpers: [post(16, 19, 0.5), post(16, 27, 0.5), post(90.5, 19, 0.5), post(90.5, 27, 0.5), post(52, 36, 0.6), post(100, 34, 0.5), post(104, 12, 0.5)],
    },
    {
      // The cup is on the penthouse, two storeys up. The street ends at a
      // ramp onto the mid roof; a second ramp climbs north to the penthouse.
      // The cannon in the street lobs you straight onto the top.
      name: 'Penthouse',
      par: 4,
      tip: 'Street, mid roof, penthouse by two ramps — or load the street cannon and fly.',
      tee: { x: 5, y: 39 },
      cup: { x: 90, y: 6 },
      floor: [R(0, 30, 70, 12), open(70, 20, 30, 22, 3), open(80, 0, 20, 20, 6)],
      zones: [slopeTo(60, 30, 10, 12, 180, 3), slopeTo(84, 20, 12, 10, 90, 3), cannon(30, 30, 6, 5, 300, 40, 22), sand(44, 36, 4, 6), sand(74, 22, 3, 8), sand(90, 10, 4, 10)],
      blocks: [low(99, 20, 1, 22, 1.2), low(70, 41, 30, 1, 1.2), low(80, 0, 20, 1, 1.2), low(80, 1, 1, 19, 1.2), low(99, 1, 1, 19, 1.2), polyRect(83, 30, 1, 1), polyRect(96, 30, 1, 1)],
      bumpers: [post(76, 36, 0.5), post(86, 12, 0.5), post(20, 34, 0.5), post(86, 12, 0.4)],
    },
    {
      // The finale: roof, pit, roof, pit, penthouse — each higher than the
      // last — over one long alley with laser gates, a cannon and a fire
      // escape onto the penthouse annex.
      name: 'Skyline',
      par: 5,
      tip: 'Bounce and hop the skyline, or take the alley: lasers, fire escapes, cannon.',
      tee: { x: 5, y: 10 },
      cup: { x: 104, y: 6 },
      floor: [
        open(0, 0, 40, 20, 2), R(40, 0, 8, 20), open(48, 0, 42, 20, 3.5), R(90, 0, 8, 20), open(98, 0, 42, 20, 5), R(0, 20, 140, 16),
      ],
      zones: [
        trampoline(40, 4, 8, 12, 17), jump(84, 0, 4, 5, 14), trampoline(90, 4, 8, 12, 19),
        slopeTo(60, 20, 10, 10, 90, 3.5), slopeTo(120, 20, 10, 10, 90, 5), cannon(30, 22, 6, 6, 330, 40, 24),
        sand(76, 22, 4, 10), sand(110, 22, 4, 10), sand(116, 4, 4, 12), sand(14, 24, 6, 8),
      ],
      blocks: [
        laser(100, 20, 1, 16, 2.5, 0.5, 0), low(98, 0, 42, 1, 1.2), low(139, 1, 1, 19, 1.2),
        polyRect(59, 20, 1, 10), polyRect(70, 20, 1, 10), polyRect(119, 20, 1, 10), polyRect(130, 20, 1, 10),
      ],
      bumpers: [post(70, 6, 0.5), post(110, 14, 0.5), post(126, 8, 0.5), post(126, 14, 0.5), post(30, 5, 0.5), post(90, 32, 0.6)],
    },
  ],
};
