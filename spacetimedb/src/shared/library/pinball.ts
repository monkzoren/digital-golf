// Built-in course. See .claude/course-guidelines.md before editing.
import {
  type Block, type Course, R, polyRect, polyNgon,
  bumper, post, laser, rubber,
  sand, ice, slopeTo, jump, tele, spinner, gfield, tunnel,
} from '../courses';
import { tri, low, corner } from '../pieces';

// ---------------------------------------------------------------------------
// PINBALL PALACE — real pinball tables, tall, played from the plunger at the
// bottom to the cup at the top. Rubber flippers, slingshots, pop bumpers,
// spinners, drop targets, inlanes and outlanes, a kickback behind the cup.
// The tilt is a gravity field pulling toward the flippers (a slope zone
// would bury the bumpers: blocks stand on the slab, not the wedge), so a
// slow ball drains back and every drive up-table is shorter than it looks.
// ---------------------------------------------------------------------------

/** A rubber flipper hinged on the left at (x, y), tip to the right. */
const flipL = (x: number, y: number): Block => ({ ...tri(x, y, x + 9, y + 5, x, y + 8), bounce: 1.4 });
/** A rubber flipper hinged on the right at (x, y), tip to the left. */
const flipR = (x: number, y: number): Block => ({ ...tri(x, y, x - 9, y + 5, x, y + 8), bounce: 1.4 });
/** A slingshot: a rubber wedge on the left rail whose face throws the ball across the table. */
const slingL = (x: number, y: number): Block => ({ ...tri(x, y, x + 7, y + 11, x, y + 14), bounce: 1.6 });
const slingR = (x: number, y: number): Block => ({ ...tri(x, y, x - 7, y + 11, x, y + 14), bounce: 1.6 });
/** A rubber diamond ("kicker") standing in the playfield. */
const kicker = (cx: number, cy: number, r = 2.2, bounce = 1.5): Block => ({ pts: polyNgon(cx, cy, r, 4), bounce });
/** A bank of drop targets: thin low walls with gaps between them. */
const targets = (x: number, y: number, n: number, w = 4, gap = 2): Block[] =>
  Array.from({ length: n }, (_, i) => low(x + i * (w + gap), y, w, 1, 0.8));

export const PINBALL: Course = {
  id: 15,
  name: 'Pinball Palace',
  theme: 'neon',
  holes: [
    {
      name: 'Flipper Deck',
      par: 4,
      tip: 'Plunge up the lane, round the arch and down through the bumpers to the pocket.',
      tee: { x: 52.5, y: 98 },
      cup: { x: 8, y: 26 },
      floor: [R(0, 0, 56, 12), R(0, 12, 48, 92), R(49, 12, 7, 92)],
      blocks: [
        corner(56, 0, 7, -1, 1), corner(0, 0, 7, 1, 1),
        ...targets(9, 56, 3), ...targets(29, 56, 3),
        slingL(0, 62), slingR(48, 62),
        polyRect(6, 80, 1, 14), polyRect(41, 80, 1, 14),
        flipL(12, 96), flipR(36, 96),
      ],
      bumpers: [bumper(18, 30), bumper(30, 26), bumper(24, 40), post(6, 19, 0.6), post(13, 22, 0.6), post(24, 6, 0.6), post(36, 8, 0.6)],
      zones: [gfield(0, 12, 48, 82, 90, 2), sand(0, 94, 6, 10), sand(42, 94, 6, 10), sand(21, 100, 6, 4)],
    },
    {
      name: 'Slingshot Alley',
      par: 3,
      tip: 'Rubber rails and kickers zigzag you up the alley; the lane beside it is sand.',
      tee: { x: 14, y: 106 },
      cup: { x: 27, y: 5 },
      floor: [R(0, 100, 32, 12), R(0, 0, 32, 12), R(0, 12, 20, 88), R(21, 12, 11, 88)],
      blocks: [
        rubber(0, 20, 0.6, 72, 1.6), rubber(19.4, 20, 0.6, 72, 1.6),
        kicker(10, 82), kicker(5, 60), kicker(15, 40), kicker(9, 22),
        corner(0, 0, 6, 1, 1),
      ],
      zones: [gfield(0.6, 12, 18.8, 88, 90, 2), sand(21, 36, 11, 3), sand(21, 66, 11, 3), sand(21, 92, 11, 3)],
      bumpers: [post(24, 20, 0.6), post(29, 52, 0.6), post(23, 8, 0.5), post(30, 9, 0.5), post(18, 6, 0.6)],
    },
    {
      name: 'Spinner Tower',
      par: 5,
      tip: 'Three turntables up the tower, each spinning the other way. Or the slow lane.',
      tee: { x: 13, y: 112 },
      cup: { x: 10, y: 5 },
      floor: [R(0, 0, 44, 118)],
      blocks: [polyRect(26, 12, 1, 94), polyRect(0, 100, 20, 1), polyRect(20, 100, 6, 1)],
      zones: [
        spinner(6, 78, 14, 14, 3), spinner(6, 48, 14, 14, -3), spinner(6, 18, 14, 14, 3),
        gfield(0, 12, 26, 88, 90, 1.5),
        sand(27, 30, 17, 3), sand(27, 60, 17, 3), sand(27, 90, 17, 3), sand(30, 106, 14, 4),
      ],
      bumpers: [post(22, 64, 0.6), post(4, 64, 0.6), post(22, 34, 0.6), post(4, 34, 0.6), post(35, 45, 0.6), post(35, 75, 0.6), post(14, 8, 0.5), post(6, 10, 0.5), post(30, 6, 0.6)],
    },
    {
      name: 'Multiball',
      par: 3,
      tip: 'The portal drops you in the bumper cage by the cup. The lane goes the long way.',
      tee: { x: 6, y: 92 },
      cup: { x: 30, y: 72 },
      floor: [R(0, 0, 12, 106), R(0, 0, 60, 12), R(48, 0, 12, 106), R(20, 50, 28, 40)],
      blocks: [polyRect(47.5, 50, 1, 30), corner(0, 0, 6, 1, 1), corner(60, 0, 6, -1, 1), kicker(38, 58, 2, 1.4)],
      zones: [gfield(0, 12, 12, 82, 90, 2), tele(2, 66, 4, 4, 30, 56), gfield(48, 12, 12, 80, 90, 2), sand(48, 92, 12, 14), sand(0, 94, 12, 12)],
      bumpers: [bumper(40, 66), bumper(38, 82), bumper(26, 84), post(24, 66, 0.6), post(55, 24, 0.6), post(5, 30, 0.6), post(30, 6, 0.6)],
    },
    {
      name: 'Upper Deck',
      par: 4,
      tip: 'A raised playfield with a subway under it. Ramp up and drop off, or tunnel.',
      tee: { x: 16, y: 114 },
      cup: { x: 21, y: 6 },
      floor: [R(0, 76, 50, 42), R(0, 40, 6, 36), R(44, 40, 6, 36), R(0, 0, 50, 40), R(6, 40, 38, 36, 2)],
      zones: [
        slopeTo(34, 76, 8, 10, 90, 2), tunnel(19, 40, 5, 36),
        sand(0, 48, 6, 4), sand(0, 66, 6, 4), sand(44, 56, 6, 4), sand(0, 100, 20, 3), sand(30, 96, 20, 3), sand(32, 20, 12, 3),
        gfield(0, 80, 33, 14, 90, 2), gfield(43, 80, 7, 14, 90, 2),
      ],
      blocks: [polyRect(33, 85, 1, 1), polyRect(42, 85, 1, 1), slingL(6, 58), slingR(44, 44), ...targets(7, 42, 2, 3, 2), low(26, 42, 6, 1, 0.8), polyRect(12, 0, 1, 12), polyRect(30, 0, 1, 12)],
      bumpers: [bumper(12, 50), bumper(30, 48), bumper(36, 66), bumper(28, 62), post(21, 18, 0.6), post(15, 12, 0.5), post(27, 12, 0.5), post(8, 26, 0.6), post(40, 30, 0.6)],
    },
    {
      name: 'Drop Targets',
      par: 3,
      tip: 'A bank of drop targets across the table. Jump it off the pad or thread a gap.',
      tee: { x: 22, y: 90 },
      cup: { x: 30.6, y: 8 },
      floor: [R(0, 0, 44, 96)],
      blocks: [...targets(3.5, 46, 7, 3, 3), flipL(8, 86), flipR(36, 86), slingL(0, 66), slingR(44, 66), corner(0, 0, 8, 1, 1)],
      zones: [jump(31, 52, 4, 4, 11), gfield(0, 50, 44, 16, 90, 1.5), sand(18, 90, 8, 6), sand(0, 86, 6, 10), sand(38, 86, 6, 10), ice(4, 22, 36, 20), sand(36, 0, 8, 16), sand(14, 0, 22, 3)],
      bumpers: [bumper(14, 74), bumper(30, 78), bumper(18, 58), post(34, 12, 0.6), post(26, 18, 0.6), post(12, 24, 0.6), post(38, 30, 0.6), post(22, 80, 0.6)],
    },
    {
      name: 'Kickback',
      par: 3,
      tip: 'Up the lane and along the top, or portal to the pocket. Rubber fires you back.',
      tee: { x: 35, y: 96 },
      cup: { x: 7, y: 7 },
      floor: [R(28, 0, 14, 104), R(0, 0, 42, 14), R(0, 14, 14, 42)],
      blocks: [rubber(2, 0, 10, 1.2, 2.2), corner(42, 0, 8, -1, 1), ...targets(29, 40, 2, 4, 2), low(0, 48, 5, 1, 0.8)],
      zones: [gfield(28, 14, 14, 78, 90, 2), tele(32, 60, 5, 4, 7, 46), sand(28, 92, 14, 3), sand(16, 2, 4, 12), sand(0, 14, 5, 4), sand(9, 14, 5, 4), ice(20, 2, 18, 10)],
      bumpers: [bumper(30, 8), bumper(24, 4), post(35, 30, 0.6), post(32, 78, 0.6), post(12, 9, 0.5), post(2, 11, 0.5), post(38, 12, 0.6)],
    },
    {
      name: 'Tilt',
      par: 4,
      tip: 'The table leans hard at you. Up the middle past the bumpers or a laser lane.',
      tee: { x: 30, y: 118 },
      cup: { x: 7, y: 6 },
      floor: [R(0, 12, 52, 110), R(0, 0, 22, 12)],
      blocks: [polyRect(10, 20, 1, 84), polyRect(41, 20, 1, 84), laser(0, 44, 10, 1, 2.5, 0.5, 0), laser(42, 44, 10, 1, 2.5, 0.5, 0.5), laser(0, 78, 10, 1, 2.5, 0.5, 0.5), laser(42, 78, 10, 1, 2.5, 0.5, 0), flipL(12, 110), flipR(40, 110), corner(52, 12, 8, -1, 1)],
      zones: [gfield(0, 20, 52, 84, 90, 4), sand(0, 108, 10, 14), sand(42, 108, 10, 14), sand(23, 116, 6, 6), sand(14, 2, 4, 10)],
      bumpers: [bumper(20, 46), bumper(32, 46), bumper(26, 62), bumper(18, 80), bumper(34, 80), bumper(26, 30), post(22, 14, 0.5), post(30, 14, 0.5), post(5, 60, 0.6), post(47, 60, 0.6), post(5, 30, 0.6), post(47, 30, 0.6), post(8, 12.5, 0.5)],
    },
    {
      name: 'Wizard Mode',
      par: 5,
      tip: 'Plunger, upper deck, subway, bumper cage, flippers, kickback. Everything is lit.',
      tee: { x: 64.5, y: 116 },
      cup: { x: 9, y: 20 },
      floor: [R(0, 0, 68, 12), R(0, 12, 60, 110), R(61, 12, 7, 110), R(8, 44, 28, 30, 2)],
      blocks: [
        corner(68, 0, 8, -1, 1), corner(0, 0, 8, 1, 1),
        rubber(0, 26, 6, 1.5, 2.2), polyRect(16, 14, 1, 16),
        polyRect(33, 79, 1, 1), polyRect(42, 79, 1, 1),
        polyRect(40, 42, 1, 26), polyRect(40, 42, 20, 1), polyRect(46, 74, 14, 1),
        ...targets(9, 46, 2, 3, 2), kicker(30, 50, 2, 1.4),
        slingL(0, 84), slingR(60, 84),
        polyRect(8, 100, 1, 14), polyRect(51, 100, 1, 14),
        flipL(14, 116), flipR(46, 116),
      ],
      zones: [
        slopeTo(34, 74, 8, 6, 90, 2), tunnel(18, 44, 5, 30),
        tele(4, 90, 4, 4, 48, 56),
        gfield(0, 12, 16, 30, 90, 2), gfield(17, 12, 43, 30, 90, 2), gfield(0, 74, 33, 26, 90, 2), gfield(43, 74, 17, 26, 90, 2), gfield(34, 80, 8, 20, 90, 2), gfield(0, 44, 8, 30, 90, 2),
        sand(0, 114, 8, 8), sand(52, 114, 8, 8), sand(25, 118, 10, 4), sand(44, 20, 4, 6), sand(38, 100, 6, 3), sand(18, 100, 6, 3),
      ],
      bumpers: [bumper(46, 50), bumper(54, 62), bumper(48, 68), bumper(28, 62), bumper(14, 66), bumper(26, 24), bumper(38, 30), post(6, 30, 0.5), post(14, 30, 0.5), post(12, 40, 0.6), post(40, 8, 0.6), post(24, 6, 0.6), post(55, 30, 0.6)],
    },
  ],
};
