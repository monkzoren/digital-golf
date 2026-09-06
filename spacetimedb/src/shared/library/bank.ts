// Built-in course. See .claude/course-guidelines.md before editing.
import {
  type Course, R, polyRect, polyNgon, polyStar,
  bumper, post, windmill, slider, pendulum, laser, rubber,
  sand, ice, water, slope, slopeTo, boost, jump, tele, conveyor, spinner, fan, trampoline, magnet, cannon, gfield, tunnel,
} from '../courses';
import { tri, low, mirrorTR, corner, star, open, lowRail, pond } from '../pieces';

/** A 45° corner mirror faced with rubber: the carom comes off harder. */
const rcorner = (px: number, py: number, s: number, ix: 1 | -1, iy: 1 | -1, bounce = 1.4) => ({ ...corner(px, py, s, ix, iy), bounce });
/** A rack of billiard balls: a triangle of `rows` rows of posts with its apex at (ax, ay) pointing −x. */
function rack(ax: number, ay: number, rows: number, r = 0.9) {
  const out = [];
  for (let i = 0; i < rows; i++) for (let j = 0; j <= i; j++) out.push(post(ax + i * 2.1, ay + (j - i / 2) * 2.2, r));
  return out;
}
/** The six pockets of a table at (x, y, w, h): sand in every corner and
 *  both side pockets. The bottom-right pocket holds the cup, so it gets
 *  sand jaws along the rails only and stays green inside. */
const pockets = (x: number, y: number, w: number, h: number, s = 7, jaws = true) => [
  sand(x, y, s, s), sand(x + w - s, y, s, s), sand(x, y + h - s, s, s),
  ...(jaws ? [sand(x + w - s, y + h - 2.5, s, 2.5), sand(x + w - 2.5, y + h - s, 2.5, s - 2.5)] : []),
  sand(x + w / 2 - s / 2, y, s, 3.5), sand(x + w / 2 - s / 2, y + h - 3.5, s, 3.5),
];

// ---------------------------------------------------------------------------
// BANK SHOT ALLEY — a billiards hall. Cushions, racks, pockets and 45°
// mirrors: every ace is a carom and the honest route runs round the rails.
// ---------------------------------------------------------------------------
export const BANK: Course = {
  id: 3,
  name: 'Bank Shot Alley',
  theme: 'park',
  holes: [
    {
      // A pool table: six sand pockets, a rack of nine balls on the foot
      // spot and the cup in the far corner pocket. The rack blocks the
      // straight line; the honest route goes round it along the rails and
      // the ace banks off the head cushion.
      name: 'Break Shot',
      par: 3,
      tip: 'A pool table. Round the rack along the rails, or bank the cushion to the pocket.',
      tee: { x: 10, y: 8 },
      cup: { x: 79, y: 43 },
      floor: [R(0, 0, 84, 48)],
      zones: [...pockets(0, 0, 84, 48), ice(14, 8, 56, 32)],
      bumpers: [...rack(54, 24, 4, 1), post(44, 25, 1), post(28, 34, 1), post(68, 10, 1), post(73, 38, 0.7)],
    },
    {
      // Three cushions: an S of three lanes joined by 45° mirrors, ice on
      // the back two so a bank carries. Honest: a lane a stroke. Gamble: a
      // full drive off the first mirror slides down the leg and off the
      // second onto the middle lane.
      name: 'Three Cushions',
      par: 5,
      tip: 'An S of three lanes, a mirror in every corner. One drive can take two cushions.',
      tee: { x: 4, y: 5 },
      cup: { x: 54, y: 45 },
      floor: [R(0, 0, 60, 10), R(50, 0, 10, 30), R(0, 20, 60, 10), R(0, 20, 10, 30), R(0, 40, 60, 10)],
      blocks: [corner(60, 0, 6, -1, 1), corner(60, 30, 6, -1, -1), corner(0, 20, 6, 1, 1), corner(0, 50, 6, 1, -1)],
      zones: [ice(50, 10, 10, 10), ice(10, 20, 40, 10), sand(20, 40, 4, 10), sand(38, 44, 4, 6), sand(28, 0, 4, 6)],
      bumpers: [post(30, 25, 0.6), post(46, 46, 0.6), post(50, 42, 0.5), post(5, 34, 0.6)],
    },
    {
      // A kaleidoscope: a big chamber with a mirror in every corner and a
      // star in the middle. In along the bottom lane, out up the chimney,
      // back along the top to the cup. Caroms carry a drive round the
      // chamber's corners; the honest line is three strokes.
      name: 'Kaleidoscope',
      par: 4,
      tip: 'A mirrored chamber with a star inside. Out the chimney and back along the top.',
      tee: { x: 4, y: 75 },
      cup: { x: 34, y: 5 },
      floor: [R(0, 70, 40, 10), R(30, 40, 50, 50), R(60, 0, 10, 48), R(30, 0, 40, 10)],
      blocks: [corner(30, 40, 8, 1, 1), corner(80, 40, 8, -1, 1), corner(30, 90, 8, 1, -1), corner(80, 90, 8, -1, -1), star(52, 66, 6)],
      zones: [ice(40, 48, 40, 34), sand(60, 20, 10, 4), sand(40, 0, 4, 10), sand(64, 40, 6, 8)],
      bumpers: [post(52, 5, 0.6), post(38, 8, 0.5), post(65, 32, 0.6), post(36, 80, 0.6)],
    },
    {
      // A mirrored chamber: two 45° corners face each other across the
      // room and a third turns the exit lane down a stub to the cup. A
      // drive straight up the entry lane banks the top-right mirror, slides
      // the iced top rail into the exit lane and drops down the stub.
      name: 'Mirror Chamber',
      par: 3,
      tip: 'Up the lane, bank the top-right mirror, out the left and down the stub.',
      tee: { x: 60, y: 102 },
      cup: { x: 5, y: 66 },
      floor: [R(56, 66, 8, 40), R(20, 30, 44, 40), R(0, 32, 24, 10), R(0, 32, 10, 40)],
      blocks: [corner(64, 30, 11, -1, 1), corner(20, 70, 11, 1, -1), corner(0, 32, 6, 1, 1), star(40, 56, 4, 1.3, 6)],
      zones: [ice(20, 30, 44, 12), ice(0, 32, 24, 10), ice(0, 42, 10, 8), sand(56, 82, 8, 3), sand(0, 52, 10, 2), sand(24, 46, 6, 8)],
      bumpers: [post(30, 50, 0.6), post(48, 62, 0.6), post(4, 60, 0.5), post(7, 63, 0.5), post(26, 66, 0.6)],
    },
    {
      // Rubber stairs: three lanes stepping down and to the right, every
      // corner a rubber mirror that fires the ball on harder than it came.
      // The gamble is one hard drive riding two rubber caroms.
      name: 'Rubber Stairs',
      par: 4,
      tip: 'Three lanes, four rubber corners. Each carom comes off harder than it went in.',
      tee: { x: 4, y: 5 },
      cup: { x: 114, y: 65 },
      floor: [R(0, 0, 50, 10), R(40, 0, 10, 40), R(40, 30, 50, 10), R(80, 30, 10, 40), R(80, 60, 40, 10)],
      blocks: [rcorner(50, 0, 6, -1, 1), rcorner(40, 40, 6, 1, -1), rcorner(90, 30, 6, -1, 1), rcorner(80, 70, 6, 1, -1)],
      zones: [ice(40, 10, 10, 20), ice(50, 30, 30, 10), ice(80, 40, 10, 20), sand(96, 60, 4, 10), sand(20, 0, 4, 10)],
      bumpers: [post(64, 32, 0.6), post(72, 38, 0.6), post(106, 62, 0.6), post(109, 68, 0.6)],
    },
    {
      // A double dogleg: right, down the leg, back left, and a mirror on the
      // top wall of the return lane throws the ball down a stub to the cup.
      // Two caroms, two different mirrors; the honest line is four stages.
      name: 'Double Dogleg',
      par: 3,
      tip: 'Right, down the leg, back along the ice: the wall wedge kicks you up to the cup.',
      tee: { x: 4, y: 5 },
      cup: { x: 33, y: 15.5 },
      floor: [R(0, 0, 60, 10), R(50, 0, 10, 40), R(0, 30, 60, 10), R(28, 12, 10, 26)],
      blocks: [rcorner(60, 0, 6, -1, 1), rcorner(60, 40, 6, -1, -1), tri(30, 40, 38, 40, 30, 32)],
      zones: [ice(50, 0, 10, 30), ice(38, 30, 22, 10), ice(28, 22, 10, 16), sand(0, 30, 10, 10), sand(24, 0, 4, 10)],
      bumpers: [post(44, 34, 0.5), post(30, 14, 0.5), post(36.5, 18, 0.5), post(14, 8, 0.5), post(20, 34, 0.6)],
    },
    {
      // A snooker table: long, narrow, the colours on their spots down the
      // middle, the cup in the far corner pocket behind the black. The
      // honest route threads the colours; the ace banks the side cushion.
      name: 'Snooker',
      par: 3,
      tip: 'A long table, the colours on their spots. Thread them, or bank the side cushion.',
      tee: { x: 14, y: 22 },
      cup: { x: 132, y: 40 },
      floor: [R(0, 0, 136, 44)],
      zones: [...pockets(0, 0, 136, 44, 7, false), ice(40, 4, 60, 36), sand(60, 12, 3, 20)],
      bumpers: [post(26, 12, 1), post(26, 32, 1), post(46, 22, 1), post(68, 22, 1), post(92, 22, 1), ...rack(96, 22, 3, 0.9), post(116, 22, 1.2), post(120, 36, 0.8), post(126, 33, 0.8)],
    },
    {
      // A kick shot: the cup lies in a bay off a chamber, walled from the
      // lane. Three cushions of the chamber (two mirrors) put a drive into
      // the bay; the honest line is into the chamber, then a sharp turn back.
      name: 'Kick Shot',
      par: 4,
      tip: 'The cup is in a bay behind you. Two rubber cushions turn a hard drive into it.',
      tee: { x: 4, y: 6 },
      cup: { x: 46, y: 34 },
      floor: [R(0, 0, 90, 12), R(70, 0, 30, 40), R(40, 28, 36, 12)],
      blocks: [rcorner(100, 0, 8, -1, 1), rcorner(100, 40, 8, -1, -1), polyRect(70, 16, 8, 8)],
      zones: [ice(78, 12, 22, 28), ice(10, 0, 80, 12), ice(58, 28, 18, 12), sand(50, 28, 2, 12), sand(70, 12, 8, 4)],
      bumpers: [post(84, 24, 0.6), post(64, 30, 0.6), post(50, 31, 0.5), post(44, 38, 0.5)],
    },
    {
      // The finale: a lane onto a pool table, a mirror off the table's
      // foot into a leg, a rubber corner onto an iced return lane and a
      // wall wedge that drops the ball down the final stub. Four banks in
      // a row for the brave; a stage a stroke for everyone else.
      name: 'Grand Carom',
      par: 5,
      tip: 'Lane, table, leg, return, stub: four banks in a row. Or a stage a stroke.',
      tee: { x: 4, y: 5 },
      cup: { x: 37, y: 88 },
      floor: [R(0, 0, 50, 10), R(40, 0, 50, 40), R(80, 30, 10, 40), R(20, 60, 70, 10), R(32, 62, 10, 30)],
      blocks: [corner(90, 30, 7, -1, 1), rcorner(90, 70, 7, -1, -1), tri(34, 60, 42, 60, 34, 68)],
      zones: [
        sand(83, 0, 7, 7), sand(40, 33, 7, 7), sand(58, 0, 7, 3.5), sand(58, 36.5, 7, 3.5),
        ice(80, 40, 10, 20), ice(44, 60, 36, 10), sand(20, 60, 8, 10), sand(32, 76, 10, 3), sand(22, 0, 4, 10),
      ],
      bumpers: [...rack(58, 20, 3, 0.9), post(52, 34, 0.8), post(84, 52, 0.6), post(64, 63, 0.6), post(35, 84, 0.5), post(39, 86, 0.5)],
    },
  ],
};
