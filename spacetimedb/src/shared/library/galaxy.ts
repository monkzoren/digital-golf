// Built-in course. See .claude/course-guidelines.md before editing.
import {
  type Course, R, polyRect, polyNgon, polyStar,
  bumper, post, windmill, slider, pendulum, laser, rubber,
  sand, ice, water, slope, slopeTo, boost, jump, tele, conveyor, spinner, fan, trampoline, magnet, cannon, gfield, tunnel,
} from '../courses';
import { tri, low, mirrorTR, corner, star, open, lowRail, pond } from '../pieces';

// ---------------------------------------------------------------------------
// GALAXY ROAD — a rainbow road through space. Long winding roads with
// sideways gravity that flips half way, wormholes that keep your pace,
// black holes, star rocks and floating platforms. The void is water, the
// dust is sand. Every hole is a journey; Supernova is all of them at once.
// ---------------------------------------------------------------------------
export const GALAXY: Course = {
  id: 9,
  name: 'Galaxy Road',
  theme: 'space',
  holes: [
    {
      name: 'Launch Window',
      par: 3,
      tip: 'Ice out, round the mirror, back through two flipping fields, up onto the pad.',
      tee: { x: 4, y: 5 },
      cup: { x: 13, y: 26.5 },
      floor: [R(0, 0, 46, 10), R(36, 10, 10, 12), R(0, 22, 46, 10), R(0, 22, 18, 10, 1.5)],
      blocks: [corner(46, 0, 10, -1, 1), corner(46, 32, 10, -1, -1), star(26, 1.8, 1.4)],
      zones: [
        ice(10, 0, 26, 10), ice(36, 10, 10, 12), sand(24, 6.5, 4, 3.5), gfield(26, 22, 8, 10, 270, 4), gfield(34, 22, 8, 10, 90, 4),
        tele(32, 0, 3, 3, 22, 25), slopeTo(18, 22, 8, 10, 0, 1.5),
      ],
      bumpers: [post(16, 23, 0.5), post(16, 31, 0.5), post(40, 16, 0.5)],
    },
    {
      name: 'Orbit',
      par: 3,
      tip: 'A planet on a spinning ring. Enter at the top, ride it round, get flung out.',
      tee: { x: 4, y: 9 },
      cup: { x: 87, y: 48 },
      floor: [R(0, 4, 22, 10), R(20, 0, 40, 40), R(58, 26, 34, 12), R(82, 26, 10, 26)],
      zones: [spinner(22, 2, 36, 36, 1.4), sand(66, 26, 4, 12), sand(82, 42, 4, 4), sand(22, 30, 8, 8)],
      blocks: [corner(92, 26, 6, -1, 1), star(30, 6, 1.4), star(50, 34, 1.4)],
      bumpers: [post(40, 20, 4), post(76, 29, 0.5), post(76, 35, 0.5), post(86, 44, 0.5)],
    },
    {
      name: 'Comet Tail',
      par: 5,
      tip: 'Down the comet tail of flipping fields, round the hairpin and back. Aim up.',
      tee: { x: 4, y: 24 },
      cup: { x: 36, y: 40 },
      floor: [R(0, 0, 30, 30), R(30, 10, 70, 10), R(90, 20, 10, 14), R(30, 34, 70, 12)],
      blocks: [star(15, 15, 3), corner(100, 10, 6, -1, 1), corner(100, 34, 6, -1, -1), corner(30, 0, 6, 1, 1)],
      zones: [
        gfield(36, 10, 16, 10, 90, 5), gfield(56, 10, 16, 10, 270, 5), gfield(76, 10, 14, 10, 90, 5),
        sand(52, 10, 4, 4), water(72, 18, 12, 2),
        gfield(70, 34, 16, 12, 270, 5), gfield(50, 34, 16, 12, 90, 5), sand(44, 34, 4, 12),
      ],
      bumpers: [post(8, 6, 0.6), post(64, 12, 0.5), post(40, 37, 0.5), post(40, 43, 0.5)],
    },
    {
      name: 'Binary Star',
      par: 4,
      tip: 'Two black holes with void eyes. Hug the bottom rail, or slingshot between them.',
      tee: { x: 4, y: 30 },
      cup: { x: 26, y: 51 },
      floor: [R(0, 0, 70, 34), R(60, 34, 10, 10), R(20, 44, 50, 14)],
      zones: [magnet(14, 0, 20, 20, 24), water(22.5, 8.5, 3, 3), magnet(36, 8, 20, 20, 24), water(44.5, 16.5, 3, 3), sand(40, 44, 4, 14), sand(0, 0, 8, 8)],
      blocks: [corner(70, 0, 6, -1, 1), corner(70, 58, 6, -1, -1), corner(0, 34, 6, 1, -1), star(62, 8, 1.8), star(8, 16, 1.4)],
      bumpers: [post(30, 47, 0.5), post(30, 55, 0.5), post(58, 30, 0.5)],
    },
    {
      name: 'Space Station',
      par: 4,
      tip: 'Dock, ramp, deck, ramp, top deck. Or the tunnel under deck A into the cannon.',
      tee: { x: 7, y: 44 },
      cup: { x: 100, y: 5 },
      floor: [R(0, 0, 72, 18), R(0, 18, 14, 30), R(40, 0, 22, 18, 1.5), R(62, 0, 48, 10, 3)],
      zones: [
        slopeTo(32, 0, 8, 8, 180, 1.5), tunnel(40, 12, 22, 6), slopeTo(54, 0, 8, 10, 180, 1.5),
        cannon(64, 12, 6, 6, 270, 20, 20), sand(20, 10, 6, 8), sand(84, 0, 4, 10), sand(4, 22, 6, 8),
      ],
      blocks: [polyRect(31, 8, 1, 1), laser(76, 0, 1, 10, 2.5, 0.5), star(4, 32, 1.4)],
      bumpers: [post(94, 2, 0.5), post(94, 8, 0.5), post(14, 15, 0.5)],
      gravity: 0.6,
    },
    {
      name: 'Wormhole Junction',
      par: 3,
      tip: 'Four islands, no road. One wormhole per island goes on, one goes back.',
      tee: { x: 4, y: 12 },
      cup: { x: 120, y: 11.5 },
      floor: [R(0, 0, 24, 24), R(34, 0, 26, 24), R(68, 0, 26, 24), R(104, 0, 24, 24)],
      zones: [
        tele(19, 2, 3, 3, 38, 12), tele(19, 19, 3, 3, 4, 20), sand(0, 16, 10, 8),
        tele(56, 1.5, 3, 3, 72, 12), tele(55, 19, 3, 3, 40, 4), sand(34, 0, 10, 8),
        tele(90, 1.5, 3, 3, 108, 17.5), tele(89, 19, 3, 3, 72, 20), sand(68, 16, 10, 8),
        jump(88, 10, 3, 5, 11), sand(104, 0, 10, 6), sand(104, 18, 10, 6),
      ],
      blocks: [star(46, 12, 2), star(80, 12, 2), star(12, 18, 1.4)],
      bumpers: [post(115, 6, 0.5), post(115, 17, 0.5), post(124, 8, 0.5)],
    },
    {
      name: 'Dust Spiral',
      par: 4,
      tip: 'Seven corners inward to the eye. A wormhole on the second straight skips a lap.',
      tee: { x: 4, y: 5 },
      cup: { x: 17, y: 28 },
      floor: [R(0, 0, 60, 10), R(50, 0, 10, 48), R(0, 38, 60, 10), R(0, 12, 10, 36), R(0, 12, 40, 10), R(30, 12, 10, 24), R(12, 26, 28, 10), R(12, 24, 10, 12)],
      blocks: [
        corner(60, 0, 10, -1, 1), corner(60, 48, 10, -1, -1), corner(0, 48, 10, 1, -1), corner(0, 12, 10, 1, 1),
        corner(40, 12, 10, -1, 1), corner(40, 36, 10, -1, -1), corner(12, 36, 10, 1, -1),
        star(22, 8.6, 1.2), star(55, 44, 1.2),
      ],
      zones: [
        ice(10, 0, 40, 10), ice(50, 10, 10, 28), ice(10, 38, 40, 10), sand(0, 26, 10, 4),
        gfield(12, 12, 20, 10, 270, 4), tele(57.5, 28, 1.5, 2, 36, 19.5), sand(20, 12, 8, 10), sand(30, 36, 4, 2),
      ],
      bumpers: [post(30, 43, 0.5), post(24, 29, 0.5), post(20, 26.5, 0.5)],
    },
    {
      name: 'Figure Eight',
      par: 4,
      tip: 'One road round two planets. Left loop has a current, right loop is frozen.',
      tee: { x: 43, y: 3 },
      cup: { x: 45, y: 36 },
      floor: [R(0, 0, 90, 10), R(0, 30, 90, 10), R(0, 0, 10, 40), R(80, 0, 10, 40), R(40, 0, 10, 16), R(40, 24, 10, 16)],
      blocks: [
        corner(0, 0, 6, 1, 1), corner(0, 40, 6, 1, -1), corner(90, 0, 6, -1, 1), corner(90, 40, 6, -1, -1),
        low(40, 16, 10, 8, 2), star(20, 5, 1.4), star(70, 35, 1.4),
      ],
      zones: [
        gfield(10, 0, 30, 10, 180, 5), gfield(0, 10, 10, 20, 90, 5), gfield(10, 30, 30, 10, 0, 5),
        ice(50, 0, 30, 10), ice(80, 10, 10, 20), ice(50, 30, 30, 10), sand(24, 30, 4, 10), sand(60, 30, 4, 10),
      ],
      bumpers: [post(45, 30, 0.5), post(85, 20, 0.6), post(5, 20, 0.6), post(43, 12, 0.5)],
    },
    {
      name: 'Supernova',
      par: 5,
      tip: 'Fields, power stars, a mirror, a black hole, then the pod: ramp or cannon. Go.',
      tee: { x: 4, y: 7 },
      cup: { x: 6, y: 30 },
      floor: [R(0, 0, 100, 14), R(88, 14, 12, 12), R(0, 26, 100, 20), R(0, 26, 22, 20, 1.5)],
      blocks: [
        corner(100, 0, 6, -1, 1), corner(100, 46, 6, -1, -1), star(62, 3, 2, 1.4), star(70, 11, 2, 1.4),
        star(90, 32, 2.2), star(50, 33, 1.2),
      ],
      zones: [
        gfield(14, 0, 16, 14, 90, 5), gfield(32, 0, 16, 14, 270, 5), sand(50, 0, 4, 6),
        tele(80, 0, 3, 3, 94, 18), magnet(40, 26, 20, 14, 14),
        slopeTo(22, 26, 8, 20, 0, 1.5), cannon(30, 40, 6, 6, 180, 20, 16), sand(66, 34, 4, 12), sand(0, 40, 10, 6),
      ],
      bumpers: [post(94, 22, 0.5), post(14, 40, 0.5)],
    },
  ],
};
