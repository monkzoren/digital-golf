// Built-in course. See .claude/course-guidelines.md before editing.
import {
  type Course, R, polyRect,
  post, slider, cannon,
  sand, ice, water, slopeTo, boost, jump, tele, trampoline, magnet, gfield, tunnel,
} from '../courses';
import { star, corner } from '../pieces';

// ---------------------------------------------------------------------------
// ASTEROID BELT — rocks in space. Star blocks are asteroids, black holes
// bend the ball round corners, wormholes skip a leg, gravity fields are the
// solar wind, and the big rocks are platforms with mining tunnels bored
// through them. Water is the void; sand is dust.
// ---------------------------------------------------------------------------
export const ASTEROIDS: Course = {
  id: 16,
  name: 'Asteroid Belt',
  theme: 'space',
  holes: [
    {
      name: 'Debris Field',
      par: 3,
      tip: 'A field of rocks. Thread the middle, ride the top where a field drags, or dust.',
      tee: { x: 5, y: 18 },
      cup: { x: 116, y: 18 },
      floor: [R(0, 10, 30, 16), R(30, 0, 60, 36), R(90, 10, 32, 16)],
      blocks: [star(40, 8, 2.6), star(46, 25, 2.4), star(55, 15, 2.8), star(63, 29, 2.2), star(70, 7, 2.6), star(77, 20, 2.4), star(85, 11, 2), star(84, 30, 2.2)],
      zones: [gfield(30, 0, 60, 5, 90, 8), sand(30, 31, 60, 5), sand(100, 10, 3, 6), sand(100, 20, 3, 6), sand(20, 10, 3, 16)],
      bumpers: [post(110, 13, 0.5), post(110, 23, 0.5), post(96, 18, 0.6)],
    },
    {
      name: 'Slingshot',
      par: 4,
      tip: 'A black hole in the corner of the bend. Whip round it with pace or hug the wall.',
      tee: { x: 5, y: 46 },
      cup: { x: 120, y: 16 },
      floor: [R(0, 40, 50, 12), R(50, 10, 36, 42), R(86, 10, 40, 12)],
      zones: [magnet(52, 12, 22, 22, 26), sand(30, 40, 3, 12), sand(56, 44, 4, 8), sand(78, 24, 8, 4), sand(100, 10, 3, 12), ice(62, 34, 24, 18)],
      blocks: [star(63, 23, 2), star(40, 43, 1.6), star(112, 13, 1.6)],
      bumpers: [post(80, 42, 0.6), post(116, 19, 0.5), post(70, 36, 0.6)],
    },
    {
      name: 'Wormhole Triangle',
      par: 3,
      tip: 'Three wormholes: one lands by the cup, one sends you home, one into dust.',
      tee: { x: 7, y: 4 },
      cup: { x: 105.5, y: 64 },
      floor: [R(0, 0, 14, 50), R(0, 50, 60, 30), R(60, 56, 50, 12)],
      zones: [tele(2, 64, 4, 4, 105.5, 58), tele(34, 70, 4, 4, 7, 10), tele(48, 52, 4, 4, 28, 74), sand(24, 70, 10, 10), sand(0, 24, 14, 3), sand(70, 56, 4, 12), sand(90, 56, 4, 12), sand(8, 74, 12, 6)],
      blocks: [star(30, 60, 2.2), star(44, 66, 2), star(14, 64, 1.8), corner(60, 80, 8, -1, -1)],
      bumpers: [post(82, 60, 0.6), post(100, 60, 0.5), post(56, 54, 0.6), post(11, 40, 0.6)],
    },
    {
      name: 'Low Orbit',
      par: 3,
      tip: 'Half gravity: the pads throw you over the voids into dust. The road has a boost.',
      tee: { x: 6, y: 25 },
      cup: { x: 118, y: 26 },
      floor: [R(0, 0, 12, 30), R(12, 20, 100, 10), R(12, 0, 100, 18), R(112, 0, 12, 30)],
      zones: [
        jump(18, 3, 4, 8, 9), water(24, 0, 20, 18), sand(44, 0, 14, 18), jump(60, 3, 4, 8, 9), water(66, 0, 20, 18), sand(86, 0, 14, 18), sand(112, 0, 12, 12),
        boost(24, 22, 6, 8, 0, 40), sand(0, 0, 12, 12),
      ],
      bumpers: [post(60, 23, 0.6), post(90, 27, 0.6), post(114, 22, 0.5), post(122, 22, 0.5), post(104, 8, 0.6)],
      gravity: 0.5,
    },
    {
      name: 'Asteroid Hop',
      par: 5,
      tip: 'Three rocks at three heights, ramps between. Or the cannon on the first rock.',
      tee: { x: 4, y: 8 },
      cup: { x: 106, y: 56 },
      floor: [R(0, 0, 114, 16), R(20, 0, 20, 16, 1.5), R(40, 0, 20, 16, 3), R(60, 0, 24, 16, 4.5), R(98, 16, 16, 44)],
      zones: [
        slopeTo(14, 0, 6, 8, 180, 1.5), cannon(23, 9, 5, 5, 0, 32, 20), slopeTo(34, 0, 6, 8, 180, 1.5), slopeTo(54, 0, 6, 8, 180, 1.5),
        sand(28, 1, 4, 6), sand(48, 9, 6, 6), sand(64, 10, 6, 6), sand(76, 0, 3, 8), sand(90, 10, 6, 6), sand(98, 30, 5, 6), sand(109, 42, 5, 6),
      ],
      blocks: [polyRect(13, 8, 1, 1), polyRect(33, 8, 1, 1), polyRect(53, 8, 1, 1), star(46, 4, 1.4), star(72, 4, 1.6), star(104, 24, 1.8)],
      bumpers: [post(88, 4, 0.5), post(102, 52, 0.5), post(110, 54, 0.5)],
    },
    {
      name: 'Solar Wind',
      par: 3,
      tip: 'The wind blows the lane into the void. Aim upstream twice, or pad, trampoline.',
      tee: { x: 5, y: 5 },
      cup: { x: 113, y: 22 },
      floor: [R(0, 0, 120, 26)],
      zones: [
        gfield(14, 0, 26, 16, 90, 6), sand(14, 16, 26, 5), water(14, 21, 26, 5),
        jump(40, 2, 4, 10, 9), trampoline(44, 2, 12, 10, 16),
        gfield(56, 0, 20, 16, 90, 6), sand(56, 16, 20, 5), water(56, 21, 20, 5),
        sand(104, 2, 16, 6), sand(44, 12, 12, 6), ice(90, 0, 14, 16), sand(76, 18, 8, 8),
      ],
      blocks: [star(100, 20, 2), star(8, 20, 1.8)],
      bumpers: [post(52, 20, 0.6), post(108, 14, 0.5), post(116, 14, 0.5), post(96, 22, 0.6)],
    },
    {
      name: 'Mining Tunnel',
      par: 4,
      tip: 'A tunnel bored under the great rock, sliding boulders on top. Under or over.',
      tee: { x: 5, y: 12 },
      cup: { x: 92, y: 44 },
      floor: [R(0, 0, 84, 24), R(30, 0, 40, 24, 3), R(84, 0, 16, 50)],
      zones: [tunnel(30, 10, 40, 4), slopeTo(24, 0, 6, 8, 180, 3), sand(70, 0, 4, 8), sand(70, 16, 4, 8), sand(84, 20, 8, 4), sand(92, 32, 8, 4), sand(16, 14, 6, 10), sand(60, 18, 8, 6)],
      blocks: [polyRect(23, 8, 1, 1), slider(38, 1, 2, 8, 6, 0, 3), slider(58, 15, 2, 8, -6, 0, 3, 0.5), corner(100, 0, 8, -1, 1), star(46, 20, 1.6)],
      bumpers: [post(76, 12, 0.6), post(88, 40, 0.5), post(96, 46, 0.5), post(92, 12, 0.6)],
    },
    {
      name: 'Binary',
      par: 3,
      tip: 'Two black holes pull either side, then two white holes push. The middle is calm.',
      tee: { x: 5, y: 15 },
      cup: { x: 118, y: 15 },
      floor: [R(0, 0, 124, 30)],
      zones: [magnet(24, 0, 20, 10, 22), magnet(24, 20, 20, 10, 22), sand(50, 0, 4, 30), magnet(64, 0, 20, 10, -18), magnet(64, 20, 20, 10, -18), sand(96, 0, 3, 10), sand(96, 20, 3, 10), ice(100, 4, 14, 22)],
      blocks: [star(34, 4, 2), star(34, 26, 2), star(92, 15, 1.8)],
      bumpers: [post(112, 10, 0.5), post(112, 20, 0.5), post(58, 15, 0.6)],
    },
    {
      name: 'Event Horizon',
      par: 5,
      tip: 'A black hole fills the chamber, the exit beyond. Whip round it or ride the rim.',
      tee: { x: 5, y: 57 },
      cup: { x: 164, y: 17 },
      floor: [R(0, 50, 40, 14), R(40, 0, 90, 80), R(130, 10, 40, 14)],
      zones: [magnet(70, 26, 30, 30, 14), sand(20, 50, 3, 14), sand(150, 10, 4, 14), sand(44, 4, 12, 8), sand(100, 60, 4, 20), sand(100, 26, 30, 4), ice(70, 4, 26, 16)],
      blocks: [star(85, 41, 2.6), star(55, 20, 2.4), star(120, 66, 2.2), star(64, 68, 2), star(112, 34, 2), corner(130, 0, 10, -1, 1), corner(130, 80, 10, -1, -1)],
      bumpers: [post(160, 13, 0.5), post(160, 21, 0.5), post(140, 17, 0.6), post(48, 40, 0.6)],
    },
  ],
};
