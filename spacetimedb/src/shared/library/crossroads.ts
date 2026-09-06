// Built-in course. See .claude/course-guidelines.md before editing.
import {
  type Block, type Course, R, polyRect,
  post, windmill, pendulum, laser,
  sand, ice, water, slope, slopeTo, boost, spinner, cannon, tunnel,
} from '../courses';
import { tri, open, corner } from '../pieces';

// ---------------------------------------------------------------------------
// CROSSROADS — every hole is a fork. The road leaves the tee, splits at a
// junction (a full-height rect with a wedge in it), runs two or three long
// lanes each with its own hazard, and merges again before the cup — often
// through a periscope of mirrors that caroms the fast lane into the cup lane.
// ---------------------------------------------------------------------------

/** The wedge that splits a junction: its tip points back at the tee. */
const splitter = (x: number, cy: number, depth = 9, half = 11): Block => tri(x, cy - half, x, cy + half, x - depth, cy);
/** A periscope in a merge junction whose right edge is at `x` and bottom
 *  edge at `bottom`: a mirror in the bottom corner turns the bottom lane's
 *  ball up, a second one turns it right again into the cup lane at `cy`. */
const periscopeUp = (x: number, bottom: number, cy: number): Block[] => [
  corner(x, bottom, 10, -1, -1),
  tri(x - 10, cy + 6, x, cy - 4, x - 10, cy - 4),
];
/** The same for a top lane: down the corner mirror, then right into the cup lane. */
const periscopeDown = (x: number, top: number, cy: number): Block[] => [
  corner(x, top, 10, -1, 1),
  tri(x - 10, cy - 6, x, cy + 4, x - 10, cy + 4),
];

export const CROSSROADS: Course = {
  id: 17,
  name: 'Crossroads',
  theme: 'park',
  holes: [
    {
      name: 'Sand or Ice',
      par: 3,
      tip: 'Sand gates up top, or the ice lane dead ahead caroms off mirrors into the cup.',
      tee: { x: 5, y: 44 },
      cup: { x: 121, y: 25 },
      floor: [R(0, 38, 14, 12), R(14, 0, 12, 50), R(26, 0, 70, 12), R(26, 38, 70, 12), R(96, 0, 16, 50), R(112, 18, 24, 14)],
      blocks: [splitter(26, 25), ...periscopeUp(112, 50, 26)],
      zones: [sand(44, 0, 4, 12), sand(72, 0, 4, 12), ice(26, 38, 70, 12), ice(96, 38, 16, 12), sand(128, 18, 8, 14)],
      bumpers: [post(98, 6, 0.6), post(116, 20, 0.5), post(116, 30, 0.5), post(60, 3, 0.5)],
    },
    {
      name: 'Windmill or Pendulum',
      par: 4,
      tip: 'A windmill sweeps the top lane, a pendulum the bottom. The top lane caroms in.',
      tee: { x: 5, y: 25 },
      cup: { x: 130, y: 25 },
      floor: [R(0, 20, 14, 10), R(14, 0, 12, 50), R(26, 0, 70, 12), R(26, 38, 70, 12), R(96, 0, 16, 50), R(112, 18, 24, 14)],
      blocks: [splitter(26, 25), ...windmill(58, 6, 4.6, 1.6, 3, 0.7), pendulum(70, 38, 10, 1.2, 50, 2.8), ...periscopeDown(112, 0, 24), polyRect(57, 0, 2, 1.2), polyRect(57, 10.8, 2, 1.2)],
      zones: [sand(80, 0, 4, 12), sand(84, 38, 4, 12), boost(30, 40, 6, 8, 0, 40), sand(118, 18, 3, 14), sand(96, 40, 8, 10)],
      bumpers: [post(40, 6, 0.6), post(50, 44, 0.6), post(126, 22, 0.5), post(126, 29, 0.5), post(100, 34, 0.6)],
    },
    {
      name: 'High Road',
      par: 3,
      tip: 'The high road is raised with no rails and drops into the merge. Low road: sand.',
      tee: { x: 5, y: 45 },
      cup: { x: 128, y: 24 },
      floor: [R(0, 40, 14, 10), R(14, 0, 12, 50), open(14, 0, 90, 14, 2), R(26, 36, 70, 14), R(96, 0, 16, 50), R(112, 18, 24, 12)],
      blocks: [...periscopeUp(112, 50, 24)],
      zones: [slopeTo(14, 14, 12, 8, 90, 2), sand(44, 36, 4, 14), sand(66, 36, 4, 14), sand(84, 36, 4, 14), sand(118, 18, 3, 12), sand(96, 14, 8, 6), sand(14, 26, 12, 4)],
      bumpers: [post(60, 7, 0.5), post(90, 5, 0.5), post(126, 21, 0.5), post(126, 27, 0.5), post(56, 43, 0.6), post(100, 8, 0.6)],
    },
    {
      name: 'Three Ways',
      par: 3,
      tip: 'Three lanes: the boosted sprint dead ahead caroms in; a laser gate; sand.',
      tee: { x: 5, y: 6 },
      cup: { x: 129, y: 46 },
      floor: [R(0, 0, 14, 12), R(14, 0, 12, 60), R(26, 0, 64, 12), R(26, 24, 64, 12), R(26, 48, 64, 12), R(90, 0, 16, 60), R(106, 36, 30, 12)],
      blocks: [tri(26, 12, 26, 24, 18, 18), tri(26, 36, 26, 48, 18, 42), laser(58, 24, 1, 12, 2.5, 0.5, 0), laser(74, 24, 1, 12, 2.5, 0.5, 0.5), corner(106, 0, 12, -1, 1), tri(96, 36, 106, 46, 96, 46)],
      zones: [boost(30, 2, 6, 8, 0, 45), boost(60, 2, 6, 8, 0, 45), sand(80, 0, 4, 12), sand(36, 48, 6, 12), sand(58, 48, 6, 12), sand(80, 48, 6, 12), ice(90, 0, 16, 48), sand(132, 36, 4, 12)],
      bumpers: [post(46, 54, 0.6), post(70, 52, 0.6), post(122, 39, 0.5), post(116, 41, 0.5), post(92, 56, 0.6)],
    },
    {
      name: 'Roundabout',
      par: 4,
      tip: 'An island with a turntable in the road either side. Go clockwise or against it.',
      tee: { x: 5, y: 36 },
      cup: { x: 134, y: 36 },
      floor: [R(0, 30, 40, 12), R(40, 0, 60, 72), R(100, 30, 40, 12)],
      blocks: [polyRect(56, 16, 28, 40), tri(56, 16, 56, 56, 46, 36), tri(84, 16, 84, 56, 94, 36), corner(100, 0, 6, -1, 1), corner(100, 72, 6, -1, -1)],
      zones: [spinner(60, 1, 14, 14, 2.5), spinner(66, 57, 14, 14, -2.5), sand(84, 0, 6, 8), sand(84, 64, 6, 8), sand(20, 30, 3, 12), sand(112, 30, 3, 12), sand(122, 30, 4, 4)],
      bumpers: [post(48, 8, 0.6), post(48, 64, 0.6), post(96, 20, 0.6), post(96, 52, 0.6), post(130, 33, 0.5), post(130, 39, 0.5)],
    },
    {
      name: 'Detour',
      par: 4,
      tip: 'Under the hill through the tunnel, or over it with a booster down the far side.',
      tee: { x: 5, y: 20 },
      cup: { x: 126, y: 20 },
      floor: [R(0, 14, 28, 12), R(28, 0, 12, 40), R(40, 0, 40, 40, 2), R(80, 0, 12, 40), R(92, 14, 40, 12)],
      blocks: [tri(34, 16, 34, 24, 28, 20), polyRect(33, 3, 1, 1), polyRect(33, 14, 1, 1)],
      zones: [slopeTo(34, 4, 6, 10, 180, 2), tunnel(40, 28, 40, 4), sand(50, 0, 4, 24), boost(70, 4, 6, 12, 0, 40), sand(60, 18, 20, 6), sand(80, 34, 12, 6), sand(112, 14, 3, 12), sand(6, 24, 8, 2)],
      bumpers: [post(84, 22, 0.6), post(88, 30, 0.5), post(122, 17, 0.5), post(122, 23, 0.5), post(100, 22, 0.6)],
    },
    {
      name: 'Hilltop',
      par: 4,
      tip: 'Straight over the hill, launched off the top, or round it through the sand.',
      tee: { x: 5, y: 30 },
      cup: { x: 134, y: 30 },
      floor: [R(0, 24, 30, 12), R(30, 0, 80, 60), R(110, 24, 30, 12)],
      blocks: [polyRect(50, 16, 24, 2), polyRect(50, 42, 24, 2), corner(110, 0, 8, -1, 1), corner(110, 60, 8, -1, -1)],
      zones: [slope(50, 18, 12, 24, 180, 9), slope(62, 18, 12, 24, 0, 9), sand(40, 0, 6, 16), sand(40, 44, 6, 16), sand(80, 4, 6, 12), sand(80, 44, 6, 12), sand(90, 24, 4, 12), sand(116, 24, 3, 12)],
      bumpers: [post(36, 8, 0.6), post(36, 52, 0.6), post(100, 12, 0.6), post(100, 48, 0.6), post(130, 27, 0.5), post(130, 33, 0.5), post(84, 30, 0.6)],
    },
    {
      name: 'Laser Crossing',
      par: 4,
      tip: 'Two roads cross at a laser gate. Through when it blinks, or up, over and down.',
      tee: { x: 10, y: 30 },
      cup: { x: 126, y: 30 },
      floor: [R(0, 24, 54, 12), R(54, 0, 12, 64), R(66, 24, 40, 12), R(66, 0, 50, 10), R(106, 0, 12, 36), R(106, 36, 26, 12), R(118, 24, 14, 12)],
      blocks: [laser(66, 24, 1, 12, 2.5, 0.5, 0), laser(53, 24, 1, 12, 2.5, 0.5, 0.5), corner(54, 0, 10, 1, 1), corner(116, 0, 8, -1, 1), corner(106, 48, 10, 1, -1), corner(132, 48, 8, -1, -1)],
      zones: [sand(84, 0, 4, 10), sand(54, 44, 12, 4), ice(54, 24, 52, 12), sand(106, 12, 12, 4), sand(112, 40, 6, 8), sand(20, 36, 12, 6)],
      bumpers: [post(100, 5, 0.5), post(122, 33.5, 0.5), post(122, 26.5, 0.5), post(60, 56, 0.6), post(36, 27, 0.5)],
    },
    {
      name: 'Grand Junction',
      par: 5,
      tip: 'Fork, fork, merge, merge: windmill or ice, then a cannon over lava or the hill.',
      tee: { x: 5, y: 32 },
      cup: { x: 194, y: 32 },
      floor: [R(0, 26, 20, 12), R(20, 0, 12, 64), R(32, 52, 60, 12), R(32, 0, 60, 12), R(92, 0, 12, 64), R(104, 40, 60, 12), R(104, 8, 60, 12), R(164, 0, 12, 52), R(176, 26, 24, 12)],
      blocks: [
        splitter(32, 32), ...windmill(62, 6, 4.6, 1.8, 3, 0.7), polyRect(61, 0, 2, 1.2), polyRect(61, 10.8, 2, 1.2),
        tri(104, 20, 104, 40, 96, 30), corner(104, 0, 8, -1, 1), corner(104, 64, 8, -1, -1),
        corner(176, 52, 10, -1, -1), tri(166, 36, 174, 28, 166, 28), corner(176, 0, 14, -1, 1),
      ],
      zones: [
        ice(36, 52, 52, 12), sand(40, 52, 3, 12),
        cannon(106, 8, 6, 12, 0, 32, 18), water(112, 8, 24, 12), sand(150, 8, 4, 12),
        slope(124, 40, 10, 12, 180, 7), slope(134, 40, 10, 12, 0, 7), sand(112, 40, 4, 12), sand(152, 40, 4, 12),
        sand(182, 26, 3, 12), sand(92, 26, 6, 8),
      ],
      bumpers: [post(40, 6, 0.6), post(98, 12, 0.6), post(98, 52, 0.6), post(145, 12, 0.6), post(168, 12, 0.6), post(190, 29, 0.5), post(190, 35, 0.5), post(84, 58, 0.5)],
    },
  ],
};
