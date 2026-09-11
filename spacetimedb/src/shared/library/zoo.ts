// Built-in course. See .claude/course-guidelines.md before editing.
import {
  type Course, R, polyRect, polyNgon, polyStar,
  bumper, post, windmill, slider, pendulum, laser, rubber, prop, dress,
  sand, ice, water, slope, slopeTo, boost, jump, tele, conveyor, spinner, fan, trampoline, magnet, cannon, gfield, tunnel,
} from '../courses';
import { tri, low, mirrorTR, corner, star, open, lowRail, pond } from '../pieces';

/** A run of fence panels (a dressed low wall the ball can hop with a pad). */
const fence = (x: number, y: number, w: number, h: number, height = 1.2) => dress(low(x, y, w, h, height), 'fence');

// ---------------------------------------------------------------------------
// SAFARI PARK — a day at the zoo. Turnstiles at the gate, the penguin pool,
// the monkey bars, the elephant house, the aviary, the reptile house, the
// giraffe walk, the petting zoo and a grand tour to the gift shop. Every
// hole is an enclosure with a keeper's route round it and a shortcut
// through, over or under it.
// ---------------------------------------------------------------------------
export const ZOO: Course = {
  id: 22,
  name: 'Safari Park',
  theme: 'zoo',
  holes: [
    {
      // The entrance. A plaza splits into two queues, each barred by a
      // turning turnstile, that meet again in the ticket hall; the ticket
      // kiosk is a raised platform with the cup on it, up a ramp from the
      // hall. The queue belt in the hall's north strip runs straight at the
      // ramp: a ball through the north turnstile at the right pace rides it
      // up onto the kiosk and drops in. A jump pad in the hall's south
      // corner hops onto the kiosk for those who trust their pace.
      name: 'Turnstiles',
      par: 3,
      tip: 'Two queues, two turnstiles, the belt and ramp onto the kiosk. The pad hops onto it.',
      tee: { x: 6, y: 15 },
      cup: { x: 112.4, y: 5.8 },
      floor: [R(0, 0, 24, 30), R(24, 0, 44, 12), R(24, 18, 44, 12), R(68, 0, 32, 30), R(100, 0, 22, 24, 2)],
      zones: [
        slopeTo(90, 0, 10, 22, 180, 2), jump(94, 24, 5, 5, 12), conveyor(68, 0, 22, 10, 0, 18),
        sand(36, 18, 4, 12), sand(74, 22, 6, 6), sand(116, 20, 4, 4),
      ],
      blocks: [
        ...windmill(46, 6, 4, 1.8, 2), ...windmill(46, 24, 4, -1.8, 2),
        polyRect(89, 22, 1, 1),
        dress(polyRect(110, 20, 3, 3), 'crate'), dress(polyRect(104, 21, 3, 3), 'crate'),
      ],
      bumpers: [post(84, 15, 0.6), post(110, 10, 0.5), post(114, 15, 0.5)],
      props: [
        prop('sign', 4, -4, 90, 1.4), prop('tree', -6, 4, 0, 1.4), prop('tree', -6, 26, 0, 1.2),
        prop('fence', 30, 15, 0, 1), prop('fence', 36, 15, 0, 1), prop('fence', 42, 15, 0, 1), prop('fence', 54, 15, 0, 1), prop('fence', 60, 15, 0, 1),
        prop('flamingo', 126, 10, 200, 1), prop('flamingo', 127, 18, 160, 0.9), prop('bush', 108, 28, 0, 1.2), prop('tree', 90, -5, 0, 1.3),
        prop('giraffe', 40, 36, 180, 1.2),
      ],
    },
    {
      // The penguin pool. The tee is on the ice shelf, a slippery platform
      // that slides down onto the poolside deck. The deck stands over the
      // pool: the keeper's railed walkway runs round the north side to the
      // far quay and back along a fenced causeway to the penguins' rock in
      // the middle, where the cup sits in a ring of sand. The diving board
      // on the near deck launches you clean over the water onto the rock —
      // the sand and the fences keep a well-paced landing on it.
      name: 'Penguin Pool',
      par: 4,
      tip: 'Round the keeper\'s walkway to the causeway, or fly the diving board onto the rock.',
      tee: { x: 6, y: 12 },
      cup: { x: 79, y: 45 },
      floor: [R(0, 0, 40, 24, 3.5), R(40, 0, 20, 50, 1.5), R(60, 0, 60, 10, 1.5), R(104, 10, 16, 40, 1.5), R(60, 10, 44, 40), R(86, 42, 18, 8, 1.5), R(74, 38, 12, 12, 1.5)],
      zones: [
        ice(4, 2, 34, 20), slopeTo(40, 6, 10, 12, 0, 2), slope(52, 40, 8, 8, 180, 10),
        ...pond(60, 10, 44, 40, R(74, 38, 12, 12), R(86, 42, 18, 8)),
        sand(83, 42, 3, 8), sand(70, 0, 4, 10), sand(108, 22, 4, 6),
      ],
      blocks: [
        fence(59.5, 10, 0.5, 30), fence(59.5, 48, 0.5, 2), fence(60, 9.5, 44, 0.5), fence(104, 10, 0.5, 32),
        fence(86, 42, 18, 0.5), fence(74, 38, 12, 0.5), fence(85.5, 38, 0.5, 4.5),
        corner(120, 50, 8, -1, -1),
        dress(polyRect(51, 40, 1, 1), 'rock'), dress(polyRect(51, 47, 1, 1), 'rock'),
        dress({ pts: polyNgon(114, 5, 2, 10) }, 'rock'), dress({ pts: polyNgon(46, 34, 2, 10) }, 'rock'),
      ],
      bumpers: [post(90, 5, 0.5), post(50, 24, 0.5)],
      props: [
        prop('sign', 20, -4, 90, 1.2), prop('tree', -6, 8, 0, 1.3), prop('bush', -5, 20, 0, 1),
        prop('rock', 50, -4, 0, 1.2), prop('rock', 100, -4, 30, 0.9), prop('rock', 124, 26, 0, 1.4), prop('rock', 80, 54, 0, 1.1),
        prop('fence', 60, 54, 0, 1), prop('fence', 68, 54, 0, 1), prop('fence', 100, 54, 0, 1), prop('fence', 108, 54, 0, 1),
        prop('tree', 125, 46, 0, 1.2), prop('flamingo', 30, 30, 240, 1),
      ],
    },
    {
      // The monkey bars: three bars (open platforms, each higher than the
      // last) over a ground alley, with a trampoline pit between each pair.
      // Up the ramp onto the first bar, drop into the pit and bounce onto the
      // next, and off the far end of the top bar onto the exit lawn where the
      // cup is. The alley below runs to the second pit and through the tyre
      // tube — a tunnel under the top bar — to the same exit.
      name: 'Monkey Bars',
      par: 3,
      tip: 'Climb the bars and bounce the pits, or take the alley and the tyre tube under them.',
      tee: { x: 6, y: 22 },
      cup: { x: 112, y: 7 },
      floor: [R(0, 0, 24, 30), open(24, 0, 20, 14, 2), R(44, 0, 8, 14), open(52, 0, 20, 14, 3.5), R(72, 0, 8, 14), open(80, 0, 24, 14, 5), R(24, 14, 76, 16), R(104, 0, 20, 14), R(72, 4, 34, 6)],
      zones: [
        slopeTo(14, 0, 10, 14, 180, 2), trampoline(44, 2, 8, 10, 17), trampoline(72, 2, 6, 10, 19), tunnel(78, 4, 28, 6), conveyor(80, 4, 24, 6, 0, 9),
        sand(56, 18, 4, 12), sand(90, 24, 8, 6), sand(30, 2, 3, 10),
      ],
      blocks: [
        fence(24, 0, 20, 0.5), fence(52, 0, 20, 0.5), fence(80, 0, 24, 0.5), polyRect(13, 13.5, 1, 1),
        dress(polyRect(8, 2, 3, 3), 'crate'), dress(polyRect(108, 10, 3, 3), 'crate'),
      ],
      bumpers: [post(40, 22, 0.5), post(76, 20, 0.5), post(112, 3, 0.5), post(66, 26, 0.5)],
      props: [
        prop('cage', 34, -5, 90, 1.2), prop('cage', 62, -5, 90, 1.2), prop('cage', 92, -5, 90, 1.2),
        prop('tree', -6, 6, 0, 1.3), prop('tree', -6, 26, 0, 1.1), prop('sign', 10, 34, 270, 1.2),
        prop('bush', 50, 34, 0, 1.1), prop('bush', 84, 34, 0, 1), prop('tree', 128, 4, 0, 1.4), prop('bush', 128, 12, 0, 1),
        prop('fence', 108, 18, 0, 1), prop('fence', 116, 18, 0, 1),
      ],
    },
    {
      // The elephant house. The yard has the wallow, a pond with a rock in
      // it, in the middle; the keeper's hose (a belt) runs along the north
      // side toward the elephant's rubber flank in the north-east corner.
      // The mud bank is a platform along the south, up a ramp from the east
      // lane. The keeper's way: north lane, east lane, ramp, bank. The
      // gamble: drive into the flank — the rubber fires you back down the
      // east lane and up the ramp in one.
      name: 'Elephant House',
      par: 4,
      tip: 'North lane, east lane, ramp, mud bank. Or bounce off the flank straight up the ramp.',
      tee: { x: 5, y: 22 },
      cup: { x: 34, y: 52 },
      floor: [R(0, 14, 20, 16), R(20, 0, 60, 44), R(20, 44, 60, 16, 2)],
      zones: [
        ...pond(30, 14, 40, 18, R(46, 19, 8, 8)), conveyor(24, 4, 40, 6, 0, 8), slopeTo(70, 30, 10, 14, 270, 2),
        sand(34, 34, 6, 8), sand(24, 36, 4, 6),
      ],
      blocks: [
        rubber(70, 0, 10, 2, 2), fence(20, 44, 50, 0.5), polyRect(69, 29, 1, 1),
        fence(29.5, 14, 0.5, 18), fence(70, 14, 0.5, 18), fence(30, 13.5, 40, 0.5), fence(30, 32, 40, 0.5),
        dress({ pts: polyNgon(50, 23, 2.2, 10) }, 'rock'), dress(polyRect(22, 0, 3, 3), 'barrel'), dress(polyRect(74, 55, 3, 3), 'crate'),
      ],
      bumpers: [post(44, 40, 0.5), post(62, 40, 0.5), post(28, 50, 0.5), post(60, 56, 0.5)],
      props: [
        prop('elephant', 60, -8, 200, 1.4), prop('tree', -6, 14, 0, 1.3), prop('bush', -5, 30, 0, 1),
        prop('sign', 8, 8, 60, 1.2), prop('fence', 30, -4, 0, 1), prop('fence', 38, -4, 0, 1), prop('fence', 46, -4, 0, 1),
        prop('barrel', 86, 6, 0, 1), prop('crate', 86, 14, 20, 1), prop('tree', 86, 36, 0, 1.4), prop('bush', 86, 52, 0, 1.1),
        prop('tree', 40, 66, 0, 1.2), prop('rock', 12, 60, 0, 1.2),
      ],
    },
    {
      // The aviary: a big cage with the bird bath in the middle and two
      // perches, a low one and a high ledge along the east wall where the
      // cup is. The keeper's way goes round the bath to the ramp onto the
      // low perch and up a second ramp onto the ledge. The wingbeat fan by
      // the bath floats a ball straight up onto the low perch, and the
      // feeder chute (a cannon under the perch) lobs one clean onto the
      // ledge.
      name: 'Aviary',
      par: 4,
      tip: 'Round the bath, up two ramps to the ledge. The fan lifts you; the feeder lobs you.',
      tee: { x: 5, y: 17 },
      cup: { x: 93, y: 12 },
      floor: [R(0, 10, 20, 14), R(20, 0, 80, 50), R(60, 6, 26, 24, 1.5), R(86, 0, 14, 50, 3)],
      zones: [
        water(30, 10, 16, 16), fan(46, 8, 14, 20, 0, 30), slopeTo(72, 30, 10, 10, 90, 1.5), slopeTo(76, 10, 10, 10, 180, 1.5),
        cannon(60, 40, 6, 6, 300, 40, 20),
        sand(40, 30, 4, 14), sand(66, 10, 4, 10), sand(90, 30, 6, 4), sand(24, 2, 6, 6),
      ],
      blocks: [
        polyRect(71, 39, 1, 1), polyRect(82, 39, 1, 1), polyRect(75, 9, 1, 1), polyRect(75, 20, 1, 1),
        fence(30, 10, 16, 0.5), fence(30, 25.5, 16, 0.5), fence(29.5, 10, 0.5, 16), fence(45.5, 10, 0.5, 16), fence(86, 0, 0.5, 6),
        dress(polyRect(22, 42, 3, 3), 'crate'), dress({ pts: polyNgon(94, 44, 1.6, 10) }, 'barrel'),
      ],
      bumpers: [post(30, 40, 0.5), post(56, 36, 0.5), post(92, 22, 0.5), post(70, 24, 0.5)],
      props: [
        prop('cage', 40, -5, 90, 1.6), prop('cage', 70, -5, 90, 1.6), prop('flamingo', 26, 55, 300, 1), prop('flamingo', 34, 56, 250, 0.9),
        prop('tree', -6, 12, 0, 1.3), prop('bush', -5, 24, 0, 1), prop('sign', 10, 4, 60, 1.2),
        prop('tree', 106, 8, 0, 1.4), prop('tree', 106, 40, 0, 1.2), prop('bush', 60, 56, 0, 1.1), prop('bush', 84, 56, 0, 1),
        prop('flamingo', 104, 26, 180, 1),
      ],
    },
    {
      // The reptile house: a dark hall with the terrarium (a platform) in
      // the middle and the cool room, an ice floor, at the far end. The
      // snake tube bores through the terrarium: three belts slither the
      // ball along it and out onto the ice, where it glides toward the cup.
      // The keeper's way is the south corridor past the swinging python.
      name: 'Reptile House',
      par: 3,
      tip: 'The snake tube slithers you onto the ice. Or take the corridor past the python.',
      tee: { x: 5, y: 8 },
      cup: { x: 93, y: 27 },
      floor: [R(0, 0, 20, 16), R(20, 0, 60, 48), R(40, 0, 30, 36, 2.5), R(80, 0, 30, 48), R(40, 14, 30, 8)],
      zones: [
        tunnel(38, 14, 34, 8), conveyor(42, 14, 9, 8, 20, 9), conveyor(51, 14, 9, 8, 340, 9), conveyor(60, 14, 12, 8, 20, 9),
        ice(72, 2, 36, 44), sand(28, 36, 4, 12), sand(56, 40, 4, 8),
      ],
      blocks: [
        pendulum(66, 36.5, 9, 1, 40, 3), dress(polyRect(22, 0, 4, 4), 'crate'), dress(polyRect(24, 42, 3, 3), 'barrel'),
        dress({ pts: polyNgon(100, 40, 2, 10) }, 'rock'), dress({ pts: polyNgon(84, 4, 1.6, 10) }, 'rock'),
      ],
      bumpers: [post(30, 20, 0.5), post(96, 8, 0.5), post(100, 26, 0.5), post(84, 30, 0.5)],
      props: [
        prop('cage', 50, -5, 90, 1.4), prop('cage', 64, -5, 90, 1.4), prop('sign', 8, -4, 90, 1.2),
        prop('tree', -6, 4, 0, 1.2), prop('bush', -5, 14, 0, 1), prop('rock', 40, 53, 0, 1.2), prop('rock', 70, 53, 20, 1),
        prop('bush', 95, 53, 0, 1.1), prop('tree', 116, 10, 0, 1.3), prop('bush', 116, 36, 0, 1), prop('crate', 30, 53, 30, 1),
      ],
    },
    {
      // The giraffe walk: a switchback of three ramps climbs from the
      // paddock to the viewing platform, five high, where the cup is. The
      // paddock slopes (a gravity field pulls south) so the first drive
      // bends. The keeper's hay chute — a cannon in the paddock — lobs you
      // straight up onto the platform, over the giraffes' heads.
      name: 'Giraffe Walk',
      par: 5,
      tip: 'Three switchback ramps up to the viewing platform. The hay chute lobs you straight up.',
      tee: { x: 5, y: 4 },
      cup: { x: 82, y: 52 },
      floor: [R(0, 0, 60, 16), R(60, 0, 12, 32, 1.7), R(12, 16, 48, 16, 1.7), R(0, 16, 12, 32, 3.4), R(12, 32, 48, 16, 3.4), R(60, 32, 30, 28, 5)],
      zones: [
        gfield(14, 0, 32, 16, 90, 5), slopeTo(50, 2, 10, 12, 180, 1.7), slopeTo(12, 18, 10, 12, 0, 1.7), slopeTo(50, 34, 10, 12, 180, 1.6),
        cannon(30, 10, 6, 6, 45, 24, 22), sand(34, 18, 4, 12), sand(30, 34, 4, 12), sand(64, 2, 8, 4),
      ],
      blocks: [
        polyRect(49, 1, 1, 1), polyRect(49, 14, 1, 1), polyRect(22, 17, 1, 1), polyRect(22, 30, 1, 1), polyRect(49, 33, 1, 1), polyRect(49, 46, 1, 1),
        fence(60, 32, 30, 0.5), dress(polyRect(84, 34, 3, 3), 'crate'), dress(polyRect(62, 55, 3, 3), 'crate'),
      ],
      bumpers: [post(66, 26, 0.5), post(6, 26, 0.5), post(6, 40, 0.5), post(72, 38, 0.5), post(66, 50, 0.5)],
      props: [
        prop('giraffe', 96, 40, 180, 1.4), prop('giraffe', 98, 54, 200, 1.2), prop('giraffe', 30, -6, 0, 1.3),
        prop('tree', -6, 6, 0, 1.3), prop('tree', -6, 44, 0, 1.2), prop('sign', 10, -4, 90, 1.2),
        prop('fence', 20, 53, 0, 1), prop('fence', 30, 53, 0, 1), prop('fence', 40, 53, 0, 1), prop('fence', 50, 53, 0, 1),
        prop('bush', 78, -4, 0, 1.1), prop('bush', 94, 24, 0, 1), prop('tree', 96, 8, 0, 1.4),
      ],
    },
    {
      // The petting zoo: three fenced pens in a serpentine — a gap at the
      // far end of each fence — with the goats' turning feeder (a spinner)
      // in the middle pen and the blinking electric gate at the last gap. The hay
      // loft at the east end is a platform up a ramp, with the cup on it.
      // The hay chute, a cannon by the tee, lobs you over the pens to the
      // foot of the ramp. The feed belt runs along the south side through a
      // four-wide hatch in the middle fence: time the gate and it carries
      // a ball straight up the ramp to the cup.
      name: 'Petting Zoo',
      par: 2,
      tip: 'Through the pens, past the gate, up onto the hay loft. The chute lobs you over.',
      tee: { x: 6, y: 34 },
      cup: { x: 80, y: 34 },
      floor: [R(0, 0, 68, 40), R(68, 8, 24, 32, 2)],
      zones: [
        spinner(38, 14, 12, 12, 3), slopeTo(58, 20, 10, 20, 180, 2), cannon(6, 2, 6, 6, 10, 40, 22), conveyor(21, 30, 37, 8, 0, 20),
        sand(26, 2, 4, 10), sand(40, 2, 4, 8),
      ],
      blocks: [
        fence(20, 0, 0.5, 28), fence(36, 12, 0.5, 20), fence(36, 36, 0.5, 4), fence(52, 0, 0.5, 28), laser(52, 28, 0.5, 12, 2.5, 0.5, 0),
        polyRect(57, 19, 1, 1), polyRect(57, 39, 1, 1),
        dress(polyRect(60, 2, 3, 3), 'crate'), dress({ pts: polyNgon(88, 12, 1.6, 10) }, 'barrel'),
      ],
      bumpers: [post(28, 8, 0.5), post(62, 6, 0.5), post(86, 16, 0.5)],
      props: [
        prop('sign', 8, -4, 90, 1.2), prop('tree', -6, 8, 0, 1.3), prop('bush', -5, 32, 0, 1),
        prop('fence', 28, 45, 0, 1), prop('fence', 44, 45, 0, 1), prop('fence', 60, 45, 0, 1),
        prop('bush', 30, -5, 0, 1.1), prop('tree', 50, -6, 0, 1.2), prop('flamingo', 96, 4, 200, 1), prop('tree', 98, 30, 0, 1.4),
        prop('crate', 76, 37, 20, 1), prop('barrel', 84, 37, 0, 1),
      ],
    },
    {
      // The grand tour: through the turnstile, along the penguin pool's
      // causeway, up onto the monkey bars and down the trampoline pit (or
      // down the alley beside them), west along the giraffe walk to the
      // ramp onto the gift shop, where the cup is. The monorail — a cannon
      // on the walk — flies you most of the way there.
      name: 'Grand Tour',
      par: 6,
      tip: 'Turnstile, causeway, monkey bars or alley, the walk west, ramp or monorail to the shop.',
      tee: { x: 5, y: 8 },
      cup: { x: 12, y: 70 },
      floor: [
        R(0, 0, 24, 16), R(24, 0, 36, 16), R(60, 0, 30, 16), R(90, 0, 32, 16), R(110, 16, 12, 52), R(90, 16, 20, 10),
        open(90, 26, 20, 16, 2), R(90, 42, 20, 8), open(90, 50, 20, 18, 3.5), R(40, 68, 82, 14), open(0, 60, 40, 22, 2),
      ],
      zones: [
        ...pond(62, 2, 26, 12, R(62, 5, 26, 6)), slopeTo(92, 16, 16, 10, 270, 2), trampoline(92, 42, 16, 8, 17),
        slopeTo(40, 70, 10, 10, 0, 2), cannon(70, 72, 6, 6, 180, 40, 20),
        sand(100, 2, 4, 12), sand(112, 30, 8, 4), sand(112, 52, 8, 4), sand(90, 72, 4, 8), sand(20, 62, 4, 18),
      ],
      blocks: [
        ...windmill(42, 8, 4, 1.8, 2), fence(62, 5, 26, 0.5), fence(62, 10.5, 26, 0.5), fence(90, 26, 0.5, 16), fence(90, 50, 0.5, 18),
        fence(0, 60, 40, 0.5), fence(0, 60.5, 0.5, 21.5), fence(0, 81.5, 40, 0.5), polyRect(91, 15, 1, 1), polyRect(108, 15, 1, 1),
        polyRect(50, 69, 1, 1), polyRect(50, 81, 1, 1),
      ],
      bumpers: [post(30, 12, 0.5), post(116, 44, 0.5), post(60, 76, 0.5), post(8, 76, 0.5), post(30, 66, 0.5)],
      props: [
        prop('sign', 4, -4, 90, 1.4), prop('tree', -6, 4, 0, 1.3), prop('fence', 30, -4, 0, 1), prop('fence', 50, -4, 0, 1),
        prop('rock', 76, -4, 0, 1.2), prop('flamingo', 84, 20, 250, 1), prop('cage', 80, 30, 0, 1.4),
        prop('giraffe', 64, 60, 180, 1.4), prop('giraffe', 80, 62, 200, 1.2), prop('elephant', 100, 88, 90, 1.4),
        prop('tree', 126, 30, 0, 1.4), prop('bush', 126, 60, 0, 1), prop('tree', 20, 88, 0, 1.3), prop('sign', 46, 88, 270, 1.2),
      ],
    },
  ],
};
