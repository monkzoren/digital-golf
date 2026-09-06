// Built-in course. See .claude/course-guidelines.md before editing.
import {
  type Course, R, polyRect, polyNgon, polyStar,
  bumper, post, windmill, slider, pendulum, laser, rubber,
  sand, ice, water, slope, slopeTo, boost, jump, tele, conveyor, spinner, fan, trampoline, magnet, cannon, gfield, tunnel,
} from '../courses';
import { tri, low, mirrorTR, corner, star, open, lowRail, pond } from '../pieces';

// ---------------------------------------------------------------------------
// GRAND TOUR — the championship course. Every hole is a tour of three or four
// mechanics with a name to match, and the last one is all of them at once.
// Park.
// ---------------------------------------------------------------------------
export const GRAND: Course = {
  id: 8,
  name: 'Grand Tour',
  theme: 'park',
  holes: [
    {
      // A dogleg right: a mirror in the elbow drops you down a lane with a
      // boost pad, a ramp climbs to a raised green with a second mirror in
      // its corner. Two caroms and the pad chain the whole thing.
      name: 'The Opening Drive',
      par: 3,
      tip: 'Round the dogleg in stages, or carom the elbow, hit the pad and carom again.',
      tee: { x: 4, y: 5 },
      cup: { x: 110, y: 74 },
      floor: [R(0, 0, 70, 14), R(58, 14, 12, 50), R(58, 64, 60, 12, 2)],
      zones: [sand(30, 0, 6, 4), sand(30, 10, 6, 4), boost(60, 28, 8, 10, 90, 72), slopeTo(58, 56, 12, 8, 270, 2), sand(82, 64, 3, 12)],
      blocks: [corner(70, 0, 12, -1, 1), corner(58, 76, 12, 1, -1)],
      bumpers: [post(50, 3, 0.5), post(50, 11, 0.5), post(61, 46, 0.4), post(68, 24, 0.4), post(102, 66, 0.5)],
    },
    {
      // An island green: a raised green in a pond. The causeway crosses the
      // water under a pendulum and climbs a ramp; the cannon on the north
      // shore fires you straight onto the island.
      name: 'Island Green',
      par: 3,
      tip: 'The causeway under the pendulum and up the ramp, or the cannon on the far shore.',
      tee: { x: 8, y: 36 },
      cup: { x: 104, y: 35 },
      floor: [R(0, 0, 16, 70), R(16, 0, 130, 70), R(84, 26, 30, 18, 2)],
      zones: [
        ...pond(40, 10, 90, 60, R(84, 26, 30, 18), R(40, 30, 44, 10)),
        slopeTo(76, 30, 8, 10, 180, 2), sand(44, 30, 3, 10), cannon(60, 2, 6, 6, 40, 34, 18),
        sand(20, 20, 6, 20), sand(132, 24, 4, 22),
      ],
      blocks: [polyRect(39, 29, 1, 1), polyRect(39, 40, 1, 1), polyRect(66, 0, 2, 10)],
      bumpers: [post(96, 29, 0.5), post(96, 41, 0.5), post(58, 32, 0.5), post(66, 38, 0.5), post(30, 50, 0.6), post(34, 8, 0.6)],
    },
    {
      // A windmill on a hill with cliffs all round: up the ramp, past the
      // mill, off the far edge and through the sand to the cup. Or the tunnel
      // straight through the hill.
      name: 'Windmill Hill',
      par: 3,
      tip: 'Up the ramp and past the mill, or straight through the tunnel under it.',
      tee: { x: 6, y: 14 },
      cup: { x: 104, y: 30 },
      floor: [R(0, 0, 120, 40), R(40, 4, 50, 32, 2.5)],
      zones: [slopeTo(32, 12, 8, 16, 180, 2.5), tunnel(40, 27, 50, 6), boost(30, 27, 8, 6, 0, 60), sand(48, 6, 4, 20), sand(94, 4, 4, 23), sand(16, 32, 6, 8)],
      blocks: [...windmill(65, 15, 6, 1.5, 3, 0.9), polyRect(31, 11, 1, 1), polyRect(31, 27, 1, 1)],
      bumpers: [post(100, 22, 0.5), post(100, 38, 0.5), post(92, 2, 0.5), post(26, 4, 0.6)],
    },
    {
      // The carousel: a great turntable in a field of kickers. The only way
      // out of the arena is the tunnel in the far wall, then the exit lane.
      name: 'The Carousel',
      par: 3,
      tip: 'Round the disc or across it, into the tunnel, and along the exit lane.',
      tee: { x: 8, y: 40 },
      cup: { x: 116, y: 42 },
      floor: [R(0, 0, 80, 80), R(80, 36, 24, 8), R(80, 30, 24, 20, 2), R(104, 20, 20, 44)],
      zones: [spinner(22, 32, 32, 32, 1.5), tunnel(80, 36, 24, 8), boost(68, 36, 8, 8, 0, 45), sand(106, 20, 16, 4), sand(106, 60, 16, 4), sand(6, 6, 10, 10), sand(6, 64, 10, 10)],
      bumpers: [bumper(16, 18), bumper(62, 18), bumper(14, 72), bumper(64, 72), post(70, 28, 0.6), post(72, 54, 0.6), post(110, 34, 0.5), post(110, 50, 0.5)],
    },
    {
      // Three terraces, a ramp between each, and laser gates in a zigzag on
      // the upper two. The jump pad on the middle terrace hops the top
      // terrace's cliff and skips half the gates.
      name: 'Laser Maze',
      par: 5,
      tip: 'Ramp, gates, ramp, gates. The pad on the middle terrace jumps the top cliff.',
      tee: { x: 6, y: 54 },
      cup: { x: 114, y: 50 },
      floor: [R(0, 0, 40, 60), R(40, 0, 40, 60, 2), R(80, 0, 40, 60, 4)],
      zones: [slopeTo(32, 40, 8, 12, 180, 2), slopeTo(72, 4, 8, 12, 180, 2), jump(56, 44, 4, 6, 15), sand(20, 44, 4, 16), sand(96, 44, 4, 16), sand(44, 4, 4, 16)],
      blocks: [
        laser(52, 0, 1, 40, 2.5, 0.5, 0), laser(66, 20, 1, 40, 2.5, 0.5, 0.5), laser(94, 20, 1, 40, 2.5, 0.5, 0.25), laser(106, 0, 1, 40, 2.5, 0.5, 0.75),
        polyRect(31, 39, 1, 1), polyRect(31, 52, 1, 1), polyRect(71, 3, 1, 1), polyRect(71, 16, 1, 1),
      ],
      bumpers: [post(60, 10, 0.6), post(88, 30, 0.6), post(110, 56, 0.4), post(14, 20, 0.6)],
    },
    {
      // A pendulum pass: a raised bridge across the lane with a tunnel under
      // it, and a pendulum swinging across each mouth. Over the bridge by
      // the ramp, or time the arms and roll under.
      name: 'Pendulum Pass',
      par: 3,
      tip: 'Up and over the bridge, or time the pendulums and take the tunnel underneath.',
      tee: { x: 6, y: 15 },
      cup: { x: 98, y: 15 },
      floor: [R(0, 0, 110, 30), R(40, 0, 40, 30, 3)],
      zones: [tunnel(40, 12, 40, 6), slopeTo(32, 18, 8, 12, 180, 3), sand(60, 18, 4, 12), boost(18, 12, 6, 6, 0, 40), sand(14, 0, 6, 8), sand(86, 20, 6, 10)],
      blocks: [pendulum(38, 2, 14, 1.4, 40, 3), pendulum(84, 2, 14, 1.4, 40, 3, 0.5), polyRect(31, 17, 1, 1)],
      bumpers: [post(90, 8, 0.5), post(104, 9, 0.5), post(104, 21, 0.5), post(20, 24, 0.6)],
    },
    {
      // Belt and braces: two belts drag you down toward the rubber walls at
      // the bottom, which throw you back up; a lava pool between them takes
      // anything drifting through the middle.
      name: 'Belt and Braces',
      par: 4,
      tip: 'The belts drag you down, the rubber throws you back. Pass the pool high or low.',
      tee: { x: 6, y: 44 },
      cup: { x: 114, y: 8 },
      floor: [R(0, 0, 12, 50), R(12, 0, 108, 30)],
      zones: [conveyor(30, 0, 10, 30, 90, 6), conveyor(70, 0, 10, 30, 90, 6), water(48, 8, 14, 12), sand(94, 0, 4, 30), sand(16, 22, 6, 8)],
      blocks: [rubber(30, 28, 10, 2, 1.4), rubber(70, 28, 10, 2, 1.4)],
      bumpers: [post(64, 24, 0.6), post(64, 4, 0.5), post(106, 14, 0.5), post(106, 2, 0.5)],
    },
    {
      // A hairpin with a black hole in the elbow. Stop short and putt round
      // it, or drive into the field and let it sling you into the return
      // lane, past the windmill.
      name: 'Hairpin Hole',
      par: 4,
      tip: 'Stop before the elbow and putt round, or let the black hole sling you back.',
      tee: { x: 96, y: 7 },
      cup: { x: 96, y: 33 },
      floor: [R(12, 0, 90, 14), R(0, 0, 24, 40), R(12, 26, 90, 14)],
      zones: [magnet(2, 12, 20, 16, 20), sand(56, 0, 4, 14), sand(50, 26, 4, 14), sand(72, 26, 3, 14)],
      blocks: [...windmill(34, 33, 5, 1.4, 2, 0.8)],
      bumpers: [post(30, 4, 0.5), post(30, 10, 0.5), post(84, 29, 0.5), post(84, 37, 0.5)],
    },
    {
      // The Gauntlet: windmill, sand, mirror elbow, belt and laser, a hill
      // with a ramp over and a tunnel under, the pendulum, a black hole in
      // the hairpin, and a long run home. Every mechanic on the tour.
      name: 'The Gauntlet',
      par: 6,
      tip: 'Mill, mirror, belt, gate, hill, pendulum, black hole, home. Every trick at once.',
      tee: { x: 124, y: 7 },
      cup: { x: 62, y: 107 },
      floor: [R(70, 0, 60, 14), R(70, 14, 12, 40), R(2, 54, 80, 14), R(30, 54, 30, 14, 2.5), R(2, 54, 16, 60), R(2, 100, 68, 14)],
      zones: [
        conveyor(70, 20, 12, 20, 90, 10),
        tunnel(30, 64, 30, 4), slopeTo(60, 54, 8, 10, 0, 2.5),
        magnet(2, 94, 16, 20, 14), sand(40, 100, 4, 14), sand(2, 72, 16, 3),
      ],
      blocks: [
        ...windmill(100, 7, 5, 1.4, 2, 0.8), corner(70, 0, 12, 1, 1), laser(70, 44, 12, 1, 2.5, 0.5),
        pendulum(20, 54, 12, 1.4, 40, 3), polyRect(68, 53, 1, 1),
      ],
      bumpers: [post(112, 3, 0.5), post(112, 11, 0.5), post(76, 36, 0.4), post(24, 66, 0.5)],
    },
  ],
};
