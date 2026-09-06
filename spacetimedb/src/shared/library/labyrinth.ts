// Built-in course. See .claude/course-guidelines.md before editing.
import {
  type Course, R, polyRect, polyNgon, polyStar,
  bumper, post, windmill, slider, pendulum, laser, rubber,
  sand, ice, water, slope, slopeTo, boost, jump, tele, conveyor, spinner, fan, trampoline, magnet, cannon, gfield, tunnel,
} from '../courses';
import { tri, low, mirrorTR, corner, star, open, lowRail, pond } from '../pieces';

// ---------------------------------------------------------------------------
// NEON LABYRINTH — a maze on neon, mirrors in every corner. Corridors of
// sliding doors and laser gates, a real labyrinth with dead ends, a black
// hole in a bend, a wormhole that skips half the maze, and raised maze
// walls with tunnels bored through them as the gambles.
// ---------------------------------------------------------------------------
export const LABYRINTH: Course = {
  id: 11,
  name: 'Neon Labyrinth',
  theme: 'neon',
  holes: [
    {
      name: 'Two Doors',
      par: 4,
      tip: 'Three corridors, sliding doors in the bends. The middle wall has a tunnel under.',
      tee: { x: 4, y: 4 },
      cup: { x: 36, y: 40 },
      floor: [R(0, 0, 40, 8), R(32, 8, 8, 10), R(0, 18, 40, 8), R(0, 26, 8, 10), R(0, 36, 40, 8), R(8, 26, 32, 10, 2)],
      blocks: [
        corner(40, 0, 8, -1, 1), corner(40, 26, 8, -1, -1), corner(0, 18, 8, 1, 1), corner(0, 44, 8, 1, -1),
        slider(32, 12, 8, 1.2, 8, 0, 3), slider(0, 30, 8, 1.2, -8, 0, 3, 0.5),
      ],
      zones: [tunnel(20, 26, 4, 10), ice(8, 18, 24, 8), sand(20, 0, 4, 3.5), sand(12, 36, 4, 4)],
      bumpers: [post(30, 38, 0.5), post(30, 42, 0.5)],
    },
    {
      name: 'Spiral In',
      par: 3,
      tip: 'Six mirrored corners inward. A wormhole on the first drop lands you inside.',
      tee: { x: 4, y: 4 },
      cup: { x: 13, y: 23.8 },
      floor: [R(0, 0, 50, 8), R(42, 0, 8, 40), R(0, 32, 50, 8), R(0, 10, 8, 30), R(0, 10, 32, 8), R(24, 10, 8, 18), R(10, 20, 22, 8)],
      blocks: [
        corner(50, 0, 8, -1, 1), corner(50, 40, 8, -1, -1), corner(0, 40, 8, 1, -1), corner(0, 10, 8, 1, 1),
        corner(32, 10, 8, -1, 1), corner(32, 28, 8, -1, -1),
      ],
      zones: [ice(42, 8, 8, 24), ice(8, 32, 34, 8), tele(47.5, 20, 1.5, 2, 27, 16), sand(20, 0, 4, 3.5), sand(0, 22, 4, 4), sand(14, 10, 4, 8)],
      bumpers: [post(18, 22, 0.5), post(18, 26.5, 0.5), post(28, 36, 0.5)],
    },
    {
      name: 'Hall of Gates',
      par: 5,
      tip: 'Laser gates across every corridor. Tunnels under both walls skip a bend each.',
      tee: { x: 4, y: 4 },
      cup: { x: 46, y: 36 },
      floor: [R(0, 0, 50, 8), R(42, 8, 8, 8), R(0, 16, 50, 8), R(0, 24, 8, 8), R(0, 32, 50, 8), R(8, 8, 32, 8, 2), R(12, 24, 30, 8, 2)],
      blocks: [
        corner(50, 0, 8, -1, 1), corner(50, 24, 8, -1, -1), corner(0, 16, 8, 1, 1), corner(0, 40, 8, 1, -1),
        laser(20, 0, 1, 8, 2.4, 0.5, 0), laser(36, 0, 1, 8, 2.4, 0.5, 0.5), laser(26, 16, 1, 8, 2.4, 0.5, 0.25),
        laser(20, 32, 1, 8, 2.4, 0.5, 0.5), laser(36, 32, 1, 8, 2.4, 0.5, 0),
      ],
      zones: [tunnel(28, 8, 4, 8), tunnel(30, 24, 4, 8), ice(8, 16, 34, 8), sand(12, 0, 4, 3.5), sand(40, 16, 4, 8)],
      bumpers: [post(42, 34, 0.5), post(42, 38, 0.5)],
    },
    {
      name: 'Black Hole Bend',
      par: 4,
      tip: 'An S-bend, a black hole in the middle corridor, a tunnel under the last wall.',
      tee: { x: 4, y: 5 },
      cup: { x: 54, y: 45 },
      floor: [R(0, 0, 60, 10), R(50, 10, 10, 10), R(0, 20, 60, 10), R(0, 30, 10, 10), R(0, 40, 60, 10), R(10, 30, 50, 10, 2)],
      blocks: [corner(60, 0, 10, -1, 1), corner(60, 30, 10, -1, -1), corner(0, 20, 10, 1, 1), corner(0, 50, 10, 1, -1)],
      zones: [magnet(20, 20, 20, 10, 20), water(29, 24, 2, 2), tunnel(42, 30, 4, 10), ice(10, 40, 30, 10), sand(24, 0, 4, 4), sand(46, 44, 4, 6)],
      bumpers: [post(50, 42, 0.5), post(50, 48, 0.5), post(40, 6, 0.5)],
    },
    {
      name: 'Mirror Maze',
      par: 3,
      tip: 'Four corners, four mirrors, the straights iced. The ace is a four-cushion carom.',
      tee: { x: 4, y: 4 },
      cup: { x: 57, y: 37.7 },
      floor: [R(0, 0, 40, 8), R(32, 8, 8, 16), R(32, 16, 48, 8), R(72, 24, 8, 16), R(20, 32, 60, 8)],
      blocks: [corner(40, 0, 8, -1, 1), corner(32, 24, 8, 1, -1), corner(80, 16, 8, -1, 1), corner(80, 40, 8, -1, -1)],
      zones: [ice(0, 0, 32, 8), ice(32, 8, 8, 8), ice(40, 16, 32, 8), ice(72, 24, 8, 8), ice(20, 32, 60, 8), sand(20, 4.5, 3, 3.5), sand(56, 16, 3, 3.5)],
      bumpers: [post(63, 34, 0.5), post(63, 39.5, 0.5), post(60, 20, 0.5)],
    },
    {
      name: 'Belt Bend',
      par: 5,
      tip: 'An express belt out, belts down both bends, a turntable between them.',
      tee: { x: 4, y: 5 },
      cup: { x: 50, y: 49 },
      floor: [R(0, 0, 56, 10), R(46, 10, 10, 12), R(0, 22, 56, 12), R(0, 34, 12, 10), R(0, 44, 56, 10)],
      blocks: [corner(56, 0, 10, -1, 1), corner(56, 34, 10, -1, -1), corner(0, 22, 12, 1, 1), corner(0, 54, 10, 1, -1)],
      zones: [
        conveyor(14, 0, 24, 4.5, 0, 7), conveyor(46, 10, 10, 12, 90, 8), spinner(20, 22, 12, 12, 2.5),
        conveyor(0, 34, 12, 10, 90, 8), ice(12, 44, 30, 10), sand(40, 22, 4, 12),
      ],
      bumpers: [post(44, 46, 0.5), post(44, 52, 0.5), post(40, 4, 0.5)],
    },
    {
      name: 'Labyrinth',
      par: 4,
      tip: 'A real maze, two dead ends, the cup in the middle. The right-wall portal skips.',
      tee: { x: 4, y: 4 },
      cup: { x: 23, y: 23 },
      floor: [R(0, 0, 58, 8), R(50, 0, 8, 38), R(10, 30, 48, 8), R(10, 10, 8, 28), R(10, 10, 28, 8), R(30, 10, 8, 18), R(20, 20, 18, 8), R(0, 0, 8, 28), R(40, 10, 8, 20)],
      blocks: [
        corner(58, 0, 8, -1, 1), corner(58, 38, 8, -1, -1), corner(10, 38, 8, 1, -1), corner(10, 10, 8, 1, 1),
        corner(38, 10, 8, -1, 1), corner(38, 28, 8, -1, -1),
      ],
      zones: [ice(50, 8, 8, 22), ice(18, 30, 32, 8), tele(55, 14, 3, 3, 20, 12), sand(24, 0, 4, 3.5), sand(0, 20, 8, 8), sand(40, 10, 8, 6), sand(14, 20, 4, 4)],
      bumpers: [post(27, 21.5, 0.5), post(27, 26.5, 0.5)],
    },
    {
      name: 'Switchyard',
      par: 5,
      tip: 'Doors slide across all three corridors and both bends. Time them, trust mirrors.',
      tee: { x: 4, y: 4 },
      cup: { x: 56, y: 36 },
      floor: [R(0, 0, 60, 8), R(52, 8, 8, 8), R(0, 16, 60, 8), R(0, 24, 8, 8), R(0, 32, 60, 8), R(12, 24, 40, 8, 2)],
      blocks: [
        corner(60, 0, 8, -1, 1), corner(60, 24, 8, -1, -1), corner(0, 16, 8, 1, 1), corner(0, 40, 8, 1, -1),
        slider(24, 0, 1.2, 5, 0, 3, 3), slider(52, 11, 8, 1.2, 8, 0, 3, 0.5), slider(30, 16, 1.2, 5, 0, 3, 3, 0.5),
        slider(0, 27, 8, 1.2, -8, 0, 3), slider(24, 32, 1.2, 5, 0, 3, 3),
      ],
      zones: [tunnel(38, 24, 4, 8), ice(8, 16, 44, 8), sand(40, 0, 4, 3.5), sand(46, 32, 4, 8)],
      bumpers: [post(52, 34, 0.5), post(52, 38, 0.5)],
    },
    {
      name: 'Grand Circuit',
      par: 5,
      tip: 'Round two neon towers, either way. The courtyard opens far side, off a bank.',
      tee: { x: 14, y: 46 },
      cup: { x: 94, y: 22.5 },
      floor: [R(0, 0, 120, 10), R(0, 40, 120, 10), R(0, 0, 10, 50), R(110, 0, 10, 50), R(56, 10, 8, 30), R(84, 10, 26, 16), R(10, 10, 46, 30, 2), R(64, 10, 20, 30, 2), R(84, 26, 26, 14, 2)],
      blocks: [
        corner(0, 0, 10, 1, 1), corner(120, 0, 10, -1, 1), { ...corner(120, 50, 10, -1, -1), bounce: 1.15 }, corner(0, 50, 10, 1, -1),
        { ...tri(120, 16, 120, 28, 108, 16), bounce: 1.15 },
      ],
      zones: [tunnel(64, 18, 20, 4), ice(40, 40, 70, 10), ice(110, 10, 10, 30), sand(30, 40, 4, 5), sand(80, 40, 4, 5), sand(30, 0, 4, 5), sand(100, 10, 8, 5)],
      bumpers: [bumper(50, 5), bumper(70, 5), post(102, 16, 0.5), post(106, 25, 0.5)],
    },
  ],
};
