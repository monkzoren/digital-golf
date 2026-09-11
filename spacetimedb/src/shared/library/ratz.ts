// Built-in course. See .claude/course-guidelines.md before editing.
import {
  type Course, R, polyRect, polyNgon, polyStar,
  bumper, post, windmill, slider, pendulum, laser, rubber, prop, dress,
  sand, ice, water, slope, slopeTo, boost, jump, tele, conveyor, spinner, fan, trampoline, magnet, cannon, gfield, tunnel,
} from '../courses';
import { tri, low, mirrorTR, corner, star, open, lowRail, pond } from '../pieces';

// ---------------------------------------------------------------------------
// RATZ — you are mouse-sized in a giant kitchen (de_rats / "Oasis" scale).
// Countertops are cliffs, the sink is a lake, books are stairs, a mousetrap
// is a hazard and a soda can is a tower. Every hole is a vertical set piece
// with an honest route round the furniture and a gamble over or under it.
// ---------------------------------------------------------------------------

/** A table leg: a tall square block dressed as a stack of books. */
const leg = (x: number, y: number, s = 3) => dress(polyRect(x, y, s, s), 'book');

export const RATZ: Course = {
  id: 21,
  name: 'Ratz',
  theme: 'kitchen',
  holes: [
    {
      // An L of kitchen floor under the table: the tee lane runs east between
      // two table legs and a picket of chair legs, then turns north to the cup.
      // A slumped tablecloth (ramp) in the inner corner climbs onto the chair
      // seat (open platform, 3 high); roll across the seat and drop off its
      // far edge straight into the cup lane — the gamble skips the corner.
      name: 'Under the Table',
      par: 3,
      tip: 'Round the corner past the table legs, or up the tablecloth onto the chair seat.',
      tee: { x: 5, y: 27 },
      cup: { x: 104, y: 6 },
      floor: [R(0, 20, 72, 14), R(60, 0, 12, 34), R(60, 0, 50, 12), open(30, 0, 30, 20, 3)],
      zones: [slopeTo(34, 20, 8, 8, 90, 3), sand(50, 20, 4, 14), sand(64, 14, 8, 3), sand(84, 0, 3, 12), sand(66, 2, 4, 4)],
      blocks: [
        leg(16, 20), leg(16, 31), leg(70, 20, 2), polyRect(33, 27, 1, 1), polyRect(42, 27, 1, 1),
        polyRect(30, 0, 30, 1.5), polyRect(30, 1.5, 1.5, 18.5),
      ],
      bumpers: [post(26, 32, 0.5), post(56, 22, 0.5), post(56, 32, 0.5), post(66, 30, 0.5), post(96, 4, 0.5), post(96, 9, 0.5)],
      props: [
        prop('rat', 2, 40, 180, 1.2), prop('mug', 20, 40, 0, 2), prop('plate', 44, 40, 0, 2.5), prop('fork', 80, 40, 30, 2),
        prop('cheese', 116, 6, 200, 1.6), prop('can', 84, 18, 0, 2), prop('book', 100, 18, 15, 2), prop('mousetrap', 20, 12, 0, 2),
        prop('plate', 5, 10, 0, 2), prop('mug', 116, 20, 0, 2),
      ],
    },
    {
      // Three books stacked in a spiral, each 1.5 higher than the last: the
      // kitchen floor runs east to the first ramp, the bottom book runs
      // north, the middle book runs west along the top, the top book (the
      // cup) fills the west side. The straw cannon in the floor's south pocket
      // lobs you straight onto the top book — landing in a bookmark of sand.
      name: 'Book Stairs',
      par: 6,
      tip: 'Climb three books by their ramps, or load the straw cannon and lob onto the top.',
      tee: { x: 40, y: 31 },
      cup: { x: 8, y: 34 },
      floor: [
        R(24, 28, 40, 12), R(64, 28, 24, 12, 1.5), R(76, 0, 12, 28, 1.5), R(64, 0, 12, 12, 1.5),
        R(24, 0, 40, 12, 3), R(0, 0, 24, 40, 4.5), R(24, 40, 14, 10),
      ],
      zones: [
        slopeTo(54, 28, 10, 12, 180, 1.5), slopeTo(64, 0, 10, 12, 0, 1.5), slopeTo(24, 0, 10, 12, 0, 1.5),
        cannon(26, 42, 6, 6, 240, 22, 19), sand(4, 22, 16, 6), sand(80, 28, 4, 12), sand(76, 14, 12, 4), sand(44, 0, 4, 12),
      ],
      blocks: [
        polyRect(53, 27, 1, 1), polyRect(75, 12, 1, 1), polyRect(35, 12, 1, 1),
        dress(polyRect(24, 0, 20, 1.5), 'book'), dress(polyRect(64, 26.5, 12, 1.5), 'book'), dress(polyRect(0, 0, 24, 1.5), 'book'),
        slider(40, 2, 2, 8, 16, 0, 5),
      ],
      bumpers: [post(82, 6, 0.5), post(70, 34, 0.5), post(14, 30, 0.5), post(6, 14, 0.5), post(18, 14, 0.5)],
      props: [
        prop('rat', 44, 46, 200, 1.2), prop('book', 56, 48, 10, 2.5), prop('book', 100, 10, 90, 2.5), prop('book', 100, 30, 80, 2.2),
        prop('mug', 50, -8, 0, 2), prop('can', 10, -8, 0, 2), prop('plate', 76, -8, 0, 2.5), prop('cheese', -8, 34, 0, 1.6),
        prop('fork', -8, 10, 90, 2), prop('mousetrap', 72, 48, 0, 2),
      ],
    },
    {
      // The kitchen sink. Tee and cup stand on the counter either side of the
      // basin; the rim (a lip keeps you on it) is the honest way round. The
      // draining board slopes down into the drained half of the basin, where
      // the plughole (a magnet with a wet eye) pulls at you; a causeway
      // crosses the full half to a ramp back up beside the tap.
      name: 'The Sink',
      par: 4,
      tip: 'Round the rim past the tap, or down the draining board, past the plughole, over the causeway.',
      tee: { x: 6, y: 44 },
      cup: { x: 90, y: 6 },
      floor: [R(0, 0, 20, 50, 1.5), R(20, 0, 60, 10, 1.5), R(80, 0, 16, 50, 1.5), R(20, 10, 60, 40)],
      zones: [
        slopeTo(20, 30, 10, 6, 0, 1.5), magnet(30, 12, 16, 14, 12), water(37, 18, 2, 2),
        ...pond(50, 10, 30, 40, R(50, 36, 30, 12), R(60, 18, 10, 8)), slopeTo(70, 38, 10, 8, 180, 1.5),
        sand(46, 0, 4, 10), sand(84, 24, 8, 4), sand(6, 20, 8, 4), sand(50, 36, 4, 12),
      ],
      blocks: [
        low(20, 9.4, 60, 0.6, 0.5), dress(polyRect(60, 18, 10, 8), 'plate'), dress({ pts: polyNgon(44, 22, 3, 12) }, 'mug'),
        polyRect(69, 37, 1, 1), polyRect(69, 46, 1, 1), polyRect(30, 29, 1, 1), polyRect(30, 36, 1, 1),
      ],
      bumpers: [post(60, 5, 0.5), post(86, 14, 0.5), post(92, 30, 0.6), post(12, 34, 0.5), post(40, 44, 0.5)],
      props: [
        prop('spotlight', 100, 25, 180, 2.2), prop('mug', 30, 56, 0, 2), prop('plate', 60, 56, 0, 2.5), prop('fork', 10, -6, 0, 2),
        prop('rat', 50, -6, 0, 1.2), prop('cheese', 80, -6, 0, 1.5), prop('can', -8, 10, 0, 2), prop('book', -8, 40, 90, 2),
        prop('mousetrap', 100, 45, 0, 2),
      ],
    },
    {
      // The mousetrap sits on its wooden base, a step up from the floor. Two
      // baited lanes cross it: the north lane under two snapping bars
      // (pendulums), the south lane through laser gates; both drop off the
      // far edge into the cheese pocket. Under the trap's bar (a higher ledge)
      // runs a straight tunnel from the floor to the cup — the one ace.
      name: 'Mousetrap',
      par: 2,
      tip: 'Up onto the trap: dodge the bars or time the gates. The tunnel under the bar is the ace.',
      tee: { x: 25, y: 30 },
      cup: { x: 94, y: 37 },
      floor: [R(0, 8, 44, 32), R(44, 0, 40, 34, 1.5), R(44, 34, 40, 6, 3), R(84, 8, 22, 32)],
      zones: [
        slopeTo(34, 14, 10, 12, 180, 1.5), tunnel(44, 35, 40, 4, 0), sand(50, 0, 4, 12), sand(86, 8, 4, 16), sand(66, 26, 4, 8), sand(6, 20, 6, 8),
      ],
      blocks: [
        polyRect(33, 13, 1, 1), polyRect(33, 26, 1, 1),
        dress(polyRect(54, 12, 22, 6), 'mousetrap'),
        pendulum(58, 0, 11, 1.4, 75, 2.4), pendulum(72, 0, 11, 1.4, 75, 2.4, 1.2),
        laser(60, 18, 1, 16, 2.5, 0.5, 0), laser(74, 18, 1, 16, 2.5, 0.5, 0.7),
        dress(polyRect(90, 22, 8, 8), 'cheese'),
      ],
      bumpers: [post(80, 6, 0.5), post(80, 30, 0.5), post(96, 14, 0.5), post(102, 28, 0.5), post(14, 34, 0.5)],
      props: [
        prop('rat', 2, 46, 0, 1.2), prop('cheese', 112, 40, 0, 1.6), prop('cheese', 64, 46, 30, 1.2), prop('book', 56, -8, 0, 2.5),
        prop('book', 74, -8, 15, 2.2), prop('mug', 96, -4, 0, 2), prop('plate', 20, -2, 0, 2.5), prop('can', 112, 12, 0, 2),
        prop('fork', 116, 26, 90, 2),
      ],
    },
    {
      // Fridge door open: the vegetable drawer along the bottom is the honest
      // lane (cans to weave, a sand strip to pace). The freezer shelf above it
      // is ice; the ice maker (a belt) carries you along the back, the cold
      // draught (a fan) shoves you toward the shelf edge, and the cold drop
      // lands you in the drawer beside the cup.
      name: 'Fridge',
      par: 3,
      tip: 'The drawer between the cans, or up to the freezer shelf: ice, belt and a cold drop.',
      tee: { x: 5, y: 37 },
      cup: { x: 94, y: 37 },
      floor: [R(0, 0, 30, 44), R(30, 30, 70, 14), R(30, 0, 70, 30, 3)],
      zones: [
        slopeTo(20, 8, 10, 12, 180, 3), ice(30, 0, 70, 30), conveyor(40, 4, 40, 8, 0, 9), fan(70, 14, 12, 8, 90, 20),
        sand(4, 26, 8, 6), sand(90, 30, 4, 4),
      ],
      blocks: [
        polyRect(19, 7, 1, 1), polyRect(19, 20, 1, 1), dress(polyRect(58, 30, 3, 6), 'crate'), dress(polyRect(58, 38.5, 3, 5.5), 'crate'),
        dress({ pts: polyNgon(50, 33, 3, 12) }, 'can'), dress({ pts: polyNgon(72, 41, 3, 12) }, 'can'),
        dress({ pts: polyNgon(56, 20, 3, 12) }, 'can'), dress(polyRect(84, 4, 10, 8), 'plate'),
      ],
      bumpers: [post(38, 20, 0.5), post(84, 22, 0.5), post(10, 12, 0.5)],
      props: [
        prop('rat', 2, 50, 20, 1.2), prop('can', 40, 50, 0, 2), prop('can', 50, 52, 0, 1.6), prop('mug', 90, 50, 0, 2),
        prop('plate', 110, 10, 0, 2.5), prop('book', 110, 30, 90, 2), prop('cheese', 20, -6, 0, 1.5), prop('fork', 70, -6, 0, 2),
        prop('mousetrap', -8, 20, 0, 2),
      ],
    },
    {
      // A toaster on the floor by the counter. Its two slots are jump pads
      // that pop the ball up onto the counter, where crumbs (sand) catch it;
      // the honest way is the crumb trail up the long ramp at the south end.
      // On the counter a carriage lever slides across the lane and a mug
      // stands in the middle of the line to the cup.
      name: 'Toaster',
      par: 3,
      tip: 'Pop out of a toaster slot onto the counter, or take the crumb ramp round the south.',
      tee: { x: 5, y: 20 },
      cup: { x: 92, y: 20 },
      floor: [R(0, 0, 30, 40), R(30, 0, 70, 40, 3)],
      zones: [
        jump(14, 10, 3, 6, 15), jump(14, 24, 3, 6, 15), slopeTo(14, 32, 16, 8, 180, 3),
        sand(30, 4, 8, 28), sand(20, 34, 3, 4), sand(60, 2, 4, 10), sand(60, 28, 4, 10),
      ],
      blocks: [
        polyRect(13, 31, 1, 1), dress(polyRect(10, 6, 3, 28), 'crate'),
        dress({ pts: polyNgon(56, 20, 4, 12) }, 'mug'), slider(44, 2, 2, 10, 0, 26, 5),
      ],
      bumpers: [post(80, 12, 0.5), post(80, 28, 0.5), post(24, 6, 0.5), post(70, 20, 0.6)],
      props: [
        prop('rat', 2, 46, 30, 1.2), prop('plate', 40, 46, 0, 2.5), prop('mug', 70, 46, 0, 2), prop('book', 106, 10, 90, 2.5),
        prop('book', 106, 30, 80, 2.2), prop('cheese', 90, -6, 0, 1.5), prop('can', 50, -6, 0, 2), prop('fork', 20, -6, 0, 2),
      ],
    },
    {
      // A soda can is a tower. The floor lane runs east under it; a spiral
      // of three ramps climbs the shelves round the can — east, north, west —
      // to the lid where the cup sits by the pull tab. The straw (a cannon
      // in the floor) fires you straight up onto the lid.
      name: 'Soda Can',
      par: 5,
      tip: 'Spiral up three ramps round the can, or load the straw and fire onto the lid.',
      tee: { x: 16, y: 56 },
      cup: { x: 30, y: 36 },
      floor: [R(12, 50, 48, 12), R(50, 10, 12, 52, 1.5), R(0, 10, 62, 12, 3), R(0, 10, 12, 52, 4.5), R(12, 22, 26, 26, 4.5)],
      zones: [
        slopeTo(38, 50, 12, 12, 180, 1.5), slopeTo(50, 22, 12, 12, 90, 1.5), slopeTo(12, 10, 12, 12, 0, 1.5),
        cannon(22, 52, 6, 6, 270, 17, 20), conveyor(50, 34, 12, 16, 270, 6), spinner(30, 10, 12, 12, 3),
        sand(12, 22, 26, 6), sand(50, 40, 12, 4), sand(4, 30, 6, 6),
      ],
      blocks: [polyRect(37, 49, 1, 1), polyRect(49, 34, 1, 1), polyRect(24, 9, 1, 1), polyRect(24, 22, 1, 1), dress({ pts: polyNgon(20, 40, 2.5, 12) }, 'can')],
      bumpers: [post(32, 56, 0.5), post(56, 16, 0.5), post(6, 50, 0.5), post(34, 42, 0.5)],
      props: [
        prop('can', 44, 36, 0, 3), prop('rat', 8, 66, 0, 1.2), prop('mug', 40, 66, 0, 2), prop('plate', 70, 30, 0, 2.5),
        prop('fork', 70, 50, 90, 2), prop('book', 30, 2, 0, 2.5), prop('cheese', -8, 30, 0, 1.5), prop('mousetrap', -8, 56, 0, 2),
      ],
    },
    {
      // The drainpipe runs under the countertop from the floor by the tee to
      // the floor by the cup: a long straight tunnel with a slant (gravity
      // field) that hurries you along. Over the top: up the cutting board
      // ramp, round the fork lying across the counter, off the far edge.
      name: 'Drainpipe',
      par: 2,
      tip: 'Up the cutting board and over the counter past the fork, or straight down the drainpipe.',
      tee: { x: 5, y: 12 },
      cup: { x: 128, y: 22.5 },
      floor: [R(0, 0, 44, 30), R(44, 0, 76, 30, 3), R(120, 0, 26, 30)],
      zones: [
        slopeTo(32, 2, 12, 10, 180, 3), tunnel(44, 20, 76, 5, 0), gfield(50, 20, 64, 5, 0, 5),
        spinner(86, 2, 12, 12, 3), sand(60, 2, 4, 14), sand(14, 22, 6, 6),
      ],
      blocks: [
        polyRect(31, 1, 1, 1), polyRect(31, 12, 1, 1), dress(polyRect(76, 0, 3, 17), 'fork'),
        dress({ pts: polyNgon(104, 10, 3.5, 12) }, 'mug'),
      ],
      bumpers: [post(116, 8, 0.5), post(138, 8, 0.5), post(38, 26, 0.5), post(20, 8, 0.5)],
      props: [
        prop('rat', 2, 36, 0, 1.2), prop('plate', 60, 36, 0, 2.5), prop('mug', 100, 36, 0, 2), prop('cheese', 152, 5, 180, 1.6),
        prop('book', 152, 24, 90, 2.5), prop('can', 80, -6, 0, 2), prop('fork', 40, -6, 0, 2), prop('mousetrap', 120, -6, 0, 2),
      ],
    },
    {
      // The finale: a run across the whole kitchen. Floor, two books up onto
      // the counter, round the sink rim (or through it), then either pop off
      // the toaster pads across the gap to the far counter and drop, or take
      // the ramp down to the floor; past the snapping bar to the cheese pocket.
      name: 'Kitchen Run',
      par: 5,
      tip: 'Books, counter, sink rim, then the toaster pads or the ramp down; the cheese pocket ends it.',
      tee: { x: 5, y: 47 },
      cup: { x: 196, y: 66 },
      floor: [
        R(0, 40, 40, 14), R(40, 40, 20, 14, 1.5), R(60, 0, 60, 54, 3), R(130, 0, 30, 54, 3),
        R(100, 54, 76, 24), R(176, 54, 30, 24),
      ],
      zones: [
        slopeTo(30, 40, 10, 14, 180, 1.5), slopeTo(50, 40, 10, 14, 180, 1.5), water(72, 12, 40, 28),
        jump(116, 2, 4, 8, 13), jump(116, 44, 4, 8, 13), slopeTo(104, 54, 12, 12, 90, 3),
        sand(132, 20, 6, 14), sand(150, 60, 4, 18), sand(178, 56, 4, 20), sand(20, 42, 4, 10), sand(64, 22, 6, 10),
      ],
      blocks: [
        polyRect(29, 39, 1, 1), polyRect(49, 39, 1, 1), polyRect(103, 66, 1, 1), polyRect(116, 66, 1, 1),
        dress(polyRect(60, 0, 60, 1.5), 'book'), dress(polyRect(184, 60, 6, 8), 'cheese'),
        pendulum(140, 54, 12, 1.5, 70, 2.4), dress({ pts: polyNgon(90, 46, 3, 12) }, 'mug'),
      ],
      bumpers: [post(66, 6, 0.5), post(126, 27, 0.6), post(170, 62, 0.5), post(170, 72, 0.5), post(200, 60, 0.5)],
      props: [
        prop('rat', 2, 60, 0, 1.2), prop('book', 44, 60, 10, 2.5), prop('book', 20, 30, 0, 2.2), prop('spotlight', 90, -8, 90, 2.2),
        prop('can', 40, 30, 0, 2), prop('mug', 140, -6, 0, 2), prop('plate', 170, 40, 0, 2.5), prop('fork', 190, 44, 0, 2),
        prop('cheese', 212, 66, 180, 1.8), prop('mousetrap', 120, 84, 0, 2), prop('can', 60, 84, 0, 2), prop('plate', 30, 60, 0, 2.5),
      ],
    },
  ],
};
