// Built-in course. See .claude/course-guidelines.md before editing.
import {
  type Course, R, polyRect, polyNgon, polyStar, barPts,
  bumper, post, windmill, slider, pendulum, laser, rubber,
  sand, ice, water, slope, slopeTo, boost, jump, tele, conveyor, spinner, fan, trampoline, magnet, cannon, gfield, tunnel,
} from '../courses';
import { tri, low, mirrorTR, corner, star, open, lowRail, pond } from '../pieces';

/** The hour marks of a clock face: posts on a ring of radius `r` about
 *  (cx, cy), skipping the hours in `skip` (where the cup or a lane is). */
function hourMarks(cx: number, cy: number, r: number, skip: number[] = [], pr = 0.7) {
  const out = [];
  for (let h = 1; h <= 12; h++) {
    if (skip.includes(h)) continue;
    const a = (h / 12) * Math.PI * 2;
    out.push(post(cx + Math.sin(a) * r, cy - Math.cos(a) * r, pr));
  }
  return out;
}
/** One clock hand: a single arm of length `len` turning about (cx, cy) at
 *  `speed` rad/s, starting at `startDeg` (0 = pointing down the screen,
 *  toward six o'clock; −90 = three o'clock; 180 = twelve). */
function hand(cx: number, cy: number, len: number, width: number, speed: number, startDeg: number) {
  const a = (startDeg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  const raw = barPts(cx, cy, len, width), pts: number[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    const x = raw[i] - cx, y = raw[i + 1] - cy;
    pts.push(cx + x * c - y * sn, cy + x * sn + y * c);
  }
  return { pts, motion: { type: 'rotate' as const, cx, cy, speed }, hub: Math.max(0.5, width * 0.9) };
}
/** A clock's hands: a long minute hand (starting at three) and a short,
 *  slow hour hand (starting at nine) turning about the same pivot. */
const hands = (cx: number, cy: number, len: number, speed: number) => [
  hand(cx, cy, len, 1.1, speed, -90),
  hand(cx, cy, len * 0.62, 1.7, speed / 2.5, 90),
];

// ---------------------------------------------------------------------------
// CLOCKWORK — every hole is a machine and every machine has a beat. Hands,
// pendulums, gates, pistons and gears: the aces are all about WHEN you hit.
// ---------------------------------------------------------------------------
export const CLOCKWORK: Course = {
  id: 4,
  name: 'Clockwork',
  theme: 'park',
  holes: [
    {
      // Two metronome arms swing across the lane half a beat apart, then a
      // mirror turns the corner into an iced leg with a half-door sliding
      // across it. Honest: through the arms, round the corner, wait for
      // the door. Gamble: a drive timed with the first arm runs the lot.
      name: 'Metronome',
      par: 3,
      tip: 'Two arms half a beat apart (2.5 s). Go as the first clears, then bank the turn.',
      tee: { x: 4, y: 10 },
      cup: { x: 82, y: 47 },
      floor: [R(0, 0, 84, 12), R(72, 0, 12, 52)],
      blocks: [pendulum(24, 0, 8, 1.2, 70, 2.5), pendulum(48, 0, 8, 1.2, 70, 2.5, 0.5), corner(84, 0, 12, -1, 1), slider(72, 28, 6, 1.5, 6, 0, 3)],
      zones: [sand(36, 0, 4, 4), ice(56, 0, 28, 12), ice(72, 12, 12, 26), sand(72, 38, 5, 4), sand(60, 0, 6, 3)],
      bumpers: [post(77, 44, 0.5), post(76, 49, 0.5), post(66, 2, 0.5)],
    },
    {
      // A clock face: a round dial built from three rects, eleven hour
      // posts, the cup at twelve, the tee in a stub at six, two hands
      // turning about the hub. The dial is ice. The line from six to twelve
      // passes just right of the hub — when the hands let it.
      name: 'Clock Face',
      par: 3,
      tip: 'Six to twelve across the dial, or round the rim. The hands sweep every 8 s.',
      tee: { x: 46, y: 96 },
      cup: { x: 40, y: 3 },
      floor: [R(40, 80, 12, 20), R(20, 0, 40, 80), R(0, 20, 80, 40), R(8, 8, 64, 64)],
      blocks: [...hands(40, 40, 22, 0.4), tri(34, 0, 39, 0, 34, 5), tri(41, 0, 46, 0, 46, 5)],
      zones: [ice(18, 18, 44, 44), sand(40, 84, 12, 3), sand(22, 0, 10, 4), sand(48, 0, 10, 4)],
      bumpers: [...hourMarks(40, 40, 30, [12, 6])],
    },
    {
      // A gear train: three turntables meshing like gears, the middle one
      // turning the other way. Ride the rim of one onto the next; the
      // fling off the last gear runs the exit lane to the cup.
      name: 'Gear Train',
      par: 4,
      tip: 'Three gears, the middle one backwards. Ride the rims or creep round the sand.',
      tee: { x: 4, y: 20 },
      cup: { x: 122, y: 20 },
      floor: [R(0, 16, 30, 8), R(26, 0, 56, 40), R(78, 16, 50, 8)],
      zones: [spinner(30, 14, 12, 12, 2.5), spinner(46, 2, 12, 12, -2.5), spinner(62, 14, 12, 12, 2.5), sand(40, 28, 6, 12), sand(58, 28, 6, 12), sand(90, 16, 3, 8), sand(108, 16, 3, 4), sand(16, 16, 3, 8)],
      bumpers: [post(100, 18, 0.5), post(116, 22, 0.5), post(118, 17, 0.5), post(48, 34, 0.6), post(72, 8, 0.6)],
    },
    {
      // An escapement: four laser gates down an iced corridor open one after
      // another, so one pace threads all four. Round the corner a pendulum
      // guards the return lane.
      name: 'Escapement',
      par: 5,
      tip: 'Four gates open in turn (2 s beat), a corner, a pendulum. One pace threads them.',
      tee: { x: 4, y: 5 },
      cup: { x: 45, y: 35 },
      floor: [R(0, 0, 90, 10), R(80, 0, 10, 40), R(40, 30, 50, 10)],
      blocks: [laser(20, 0, 1, 10, 2, 0.45, 0), laser(36, 0, 1, 10, 2, 0.45, 0.4), laser(52, 0, 1, 10, 2, 0.45, 0.8), laser(68, 0, 1, 10, 2, 0.45, 0.2), corner(90, 0, 6, -1, 1), corner(90, 40, 6, -1, -1), pendulum(64, 30, 9, 1.2, 50, 3)],
      zones: [ice(12, 0, 60, 10), sand(74, 0, 3, 10), ice(80, 10, 10, 20), sand(52, 30, 3, 10)],
      bumpers: [post(48, 32, 0.5), post(49, 38, 0.5), post(85, 24, 0.5)],
    },
    {
      // A cuckoo clock: a raised house across the lane with a tunnel through
      // it, and a pendulum swinging across the tunnel mouth — the cuckoo.
      // Honest: up the ramp, over the roof, drop off the back. Gamble: time
      // the cuckoo and drive straight through the tunnel.
      name: 'Cuckoo',
      par: 3,
      tip: 'Over the house by the ramp, or through the tunnel as the cuckoo swings clear.',
      tee: { x: 4, y: 6 },
      cup: { x: 116, y: 6 },
      floor: [R(0, 0, 120, 16), R(40, 0, 20, 16, 2)],
      zones: [tunnel(40, 4, 20, 4), slopeTo(34, 11, 6, 5, 180, 2), sand(44, 11, 6, 5), ice(62, 2, 34, 8), sand(70, 11, 4, 5), sand(102, 10, 4, 6)],
      blocks: [pendulum(37, 0, 6, 1.1, 45, 3), polyRect(33, 10, 1, 1)],
      bumpers: [post(84, 12, 0.6), post(110, 3, 0.5), post(110, 9, 0.5), post(20, 12, 0.6)],
    },
    {
      // A pendulum gallery: an L of two halls. Three arms hang from the top
      // wall of the first hall over a bed of sand; two more swing out from
      // the walls of the second. Stay low under the first three, then pick
      // your moment past the last two.
      name: 'Pendulum Gallery',
      par: 5,
      tip: 'Three arms over sand, a corner, two more from the walls. Each has its own beat.',
      tee: { x: 4, y: 18 },
      cup: { x: 62, y: 80 },
      floor: [R(0, 0, 70, 24), R(50, 16, 24, 68)],
      blocks: [pendulum(16, 0, 14, 1.2, 50, 3, 0), pendulum(32, 0, 14, 1.2, 50, 3, 0.33), pendulum(48, 0, 14, 1.2, 50, 3, 0.66), pendulum(74, 40, 14, 1.2, 70, 3.5, 0), pendulum(50, 60, 14, 1.2, 70, 3.5, 0.5)],
      zones: [sand(8, 0, 48, 10), sand(50, 30, 6, 6), sand(56, 72, 12, 3), ice(50, 40, 24, 20)],
      bumpers: [post(60, 26, 0.6), post(58, 77, 0.5), post(66, 76, 0.5), post(40, 20, 0.5)],
    },
    {
      // A piston row: a raised bed with no rails, four pistons pumping in
      // from either side. Up the ramp, thread the pistons, drop off the end
      // to the cup — or fall off the side and try the jump pad back up.
      name: 'Piston Row',
      par: 4,
      tip: 'Up onto the bed; four pistons pump across it (2.5 s). The pad puts fallers back.',
      tee: { x: 4, y: 15 },
      cup: { x: 124, y: 15 },
      floor: [R(0, 0, 130, 30), R(20, 10, 80, 10, 2)],
      zones: [slopeTo(14, 10, 6, 10, 180, 2), jump(70, 23, 4, 5, 13), sand(0, 0, 130, 4), sand(0, 26, 130, 4), sand(104, 10, 3, 10), sand(114, 0, 3, 30)],
      blocks: [
        polyRect(13, 9, 1, 1), polyRect(13, 20, 1, 1),
        slider(32, 10, 2, 7, 0, 6, 2.5, 0), slider(48, 13, 2, 7, 0, -6, 2.5, 0.5), slider(64, 10, 2, 7, 0, 6, 2.5, 0), slider(80, 13, 2, 7, 0, -6, 2.5, 0.5),
      ],
      bumpers: [post(120, 12, 0.5), post(120, 18, 0.5), post(56, 8, 0.6), post(88, 22, 0.6)],
    },
    {
      // An airlock: four rooms stepping down the page, a sliding door in
      // every wall between them. Each door is half open at any moment and
      // the halves alternate. Read which half is open before you swing.
      name: 'Airlock',
      par: 4,
      tip: 'Four rooms, three sliding doors, each half open at a time (3 s). Read the doors.',
      tee: { x: 4, y: 4 },
      cup: { x: 114, y: 54 },
      floor: [R(0, 0, 30, 30), R(30, 10, 30, 30), R(60, 20, 30, 30), R(90, 30, 30, 30)],
      blocks: [slider(29, 10, 2, 10, 0, 10, 3, 0), slider(59, 20, 2, 10, 0, 10, 3, 0.5), slider(89, 30, 2, 10, 0, 10, 3, 0)],
      zones: [ice(30, 10, 30, 30), sand(60, 42, 8, 8), sand(60, 20, 8, 8), ice(90, 30, 30, 30), sand(0, 22, 8, 8), sand(20, 0, 10, 4)],
      bumpers: [post(45, 35, 0.6), post(75, 35, 0.6), post(110, 50, 0.5), post(116, 58, 0.5), post(104, 40, 0.6)],
    },
    {
      // The Grand Clock: a laser gate into the dial (hour posts, two hands),
      // out through a pendulum gate below six o'clock, along the bottom over
      // a balance wheel and past one last sliding door to the cup.
      name: 'Grand Clock',
      par: 5,
      tip: 'A gate, the dial, the pendulum, the wheel, a last door. Each keeps its own time.',
      tee: { x: 4, y: 46 },
      cup: { x: 120, y: 100 },
      floor: [R(0, 40, 44, 12), R(40, 20, 52, 52), R(66, 68, 12, 34), R(66, 94, 60, 12)],
      blocks: [
        laser(22, 40, 1, 12, 2.5, 0.4, 0.5),
        corner(92, 20, 8, -1, 1), corner(40, 72, 8, 1, -1), corner(92, 72, 8, -1, -1),
        ...hands(66, 46, 16, 0.4),
        pendulum(72, 74, 8, 1.2, 30, 2.5),
        slider(108, 94, 1.5, 6, 0, 6, 3),
      ],
      zones: [ice(52, 32, 28, 28), sand(66, 84, 12, 3), spinner(92, 94, 12, 12, 2), sand(34, 40, 3, 12), sand(114, 94, 3, 12)],
      bumpers: [...hourMarks(66, 46, 20, [6, 9], 0.6), post(117, 97, 0.5), post(123, 103, 0.5), post(72, 90, 0.5)],
    },
  ],
};
