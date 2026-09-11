// Built-in course. See .claude/course-guidelines.md before editing.
import {
  type Course, R, polyRect, polyNgon, polyStar,
  bumper, post, windmill, slider, pendulum, laser, rubber, prop, dress,
  sand, ice, water, slope, slopeTo, boost, jump, tele, conveyor, spinner, fan, trampoline, magnet, cannon, gfield, tunnel,
} from '../courses';
import { tri, low, mirrorTR, corner, star, open, lowRail, pond } from '../pieces';

// ---------------------------------------------------------------------------
// MAIN STAGE — a festival stage and its backstage: the loading dock, the
// keyboard, the drum kit, the decks, the mosh pit, the amp wall, the
// metronome, the lighting rig and the encore. Every hole is a raised set
// piece with an honest way round and a gamble through, over or under it.
// ---------------------------------------------------------------------------
export const MUSIC: Course = {
  id: 20,
  name: 'Main Stage',
  theme: 'music',
  holes: [
    {
      // The loading dock runs along the back of the stage (a 2-high
      // platform); the cup is out front, in the pit. Honest: ride the
      // roadies' belt east to the backstage plaza, up the case ramp, across
      // the stage between the speaker stacks and off the front edge. The
      // gamble: the cable duct, a 4-wide tunnel under the stage straight
      // from the dock to the pit.
      name: 'Sound Check',
      par: 3,
      tip: 'Belt, backstage ramp, across the stage and off the front. Or the cable duct.',
      tee: { x: 44, y: 58 },
      cup: { x: 44, y: 7 },
      floor: [R(6, 34, 100, 12), R(40, 46, 16, 16), R(26, 20, 80, 14, 2), R(106, 20, 20, 26), R(6, 0, 100, 20)],
      zones: [
        conveyor(56, 37, 34, 6, 0, 14), tunnel(46, 20, 4, 14), slopeTo(106, 22, 10, 10, 0, 2),
        sand(110, 36, 12, 3), sand(90, 22, 4, 10), sand(30, 4, 4, 12), sand(84, 0, 4, 8), sand(10, 36, 4, 10), sand(42, 48, 3, 6),
      ],
      blocks: [
        dress(low(58, 22, 3.5, 3.5, 3), 'speaker'), dress(low(72, 28, 3.5, 3.5, 3), 'speaker'), dress(low(36, 28, 3.5, 3.5, 3), 'speaker'),
        dress(low(40, 22, 3.5, 3.5, 3), 'speaker'), polyRect(105, 21, 1, 1), polyRect(105, 32, 1, 1),
      ],
      bumpers: [post(45.5, 36.5, 0.5), post(50.5, 36.5, 0.5), post(58, 12, 0.5), post(96, 40, 0.5), post(36, 12, 0.5), post(48, 3, 0.5)],
      props: [
        prop('speaker', 40, -4, 90, 1.5), prop('speaker', 84, -4, 90, 1.5), prop('mic', 62, -3, 90), prop('guitar', 50, -3.5, 90),
        prop('amp', 130, 20, 180), prop('amp', 130, 30, 180), prop('crate', 2, 38), prop('crate', 2, 44, 30),
        prop('sign', 60, 51, 270, 1.2), prop('fence', 20, 50, 0, 1.5), prop('fence', 90, 50, 0, 1.5), prop('spotlight', 1, 5, 0, 1.2),
      ],
    },
    {
      // The keyboard: the white keys are the ground lane, the black keys
      // raised platforms along its back. Two black keys span the whole
      // lane: the first is climbed by a short ramp and dropped off, the
      // last carries the cup and its own ramp. The gamble: the 4-wide gap
      // under the first black key, a straight line onto the second ramp.
      name: 'Piano Keys',
      par: 3,
      tip: 'Up and over the first black key, or under it. The cup is on the last one.',
      tee: { x: 10, y: 22 },
      cup: { x: 102, y: 32.5 },
      floor: [
        R(6, 20, 104, 14), R(16, 6, 6, 14, 1.5), R(28, 6, 6, 14, 1.5), R(46, 6, 12, 28, 1.5), R(66, 6, 6, 14, 1.5), R(78, 6, 6, 14, 1.5), R(96, 6, 14, 28, 1.5),
      ],
      zones: [
        slopeTo(36, 20, 10, 6, 180, 1.5), tunnel(46, 28, 12, 4), slopeTo(86, 28, 10, 6, 180, 1.5),
        sand(70, 22, 4, 6), sand(98, 6, 3, 10), sand(24, 30, 4, 4),
      ],
      blocks: [polyRect(35, 25.5, 1, 1), polyRect(85, 27, 1, 1), dress(low(88, 20, 3, 3, 2.5), 'amp')],
      bumpers: [post(62, 24, 0.5), post(100, 26, 0.5), post(106, 12, 0.5)],
      props: [
        prop('keys', 20, 1, 0, 1.4), prop('keys', 52, 1, 0, 1.4), prop('keys', 84, 1, 0, 1.4), prop('note', 40, 2, 0, 1.2), prop('note', 72, 1.5, 30),
        prop('note', 114, 12, 0, 1.3), prop('mic', 114, 26), prop('guitar', 2, 14, 90), prop('amp', 2, 30, 0), prop('speaker', 60, 39, 270, 1.3), prop('sign', 30, 39, 270),
      ],
    },
    {
      // The drum kit seen from above: snare, hi tom, floor tom and bass drum
      // are raised drums (open tops, no rims) on the stage floor; the skins
      // between them are trampolines. Roll off a drum onto a skin and you
      // bounce onto the next; cymbals (turntable spinners) twist the ground
      // route along the front. Honest: the floor and the ramp up onto the
      // bass drum from the front.
      name: 'Drum Kit',
      par: 4,
      tip: 'Bounce drum to drum off the skins, or roll the floor to the bass-drum ramp.',
      tee: { x: 18, y: 36 },
      cup: { x: 94, y: 18 },
      floor: [
        R(6, 6, 104, 44),
        open(12, 30, 16, 12, 1.5), open(16, 26, 8, 20, 1.5),
        open(36, 14, 16, 12, 1.5), open(40, 10, 8, 20, 1.5),
        open(62, 30, 16, 12, 1.5), open(66, 26, 8, 20, 1.5),
        open(84, 10, 20, 20, 1.5), open(88, 6, 12, 28, 1.5),
      ],
      zones: [
        trampoline(29, 26, 6, 8, 15), trampoline(53, 26, 8, 6, 15), trampoline(78, 22, 6, 8, 15),
        slopeTo(90, 34, 8, 8, 90, 1.5), spinner(46, 38, 10, 10, 3), spinner(24, 8, 8, 8, -3),
        sand(80, 42, 4, 8), sand(56, 44, 6, 6),
      ],
      blocks: [
        polyRect(89, 41, 1, 1), polyRect(98, 41, 1, 1),
        low(84, 10, 20, 0.6, 1.2), low(84, 10.6, 0.6, 19.4, 1.2), low(103.4, 10.6, 0.6, 19.4, 1.2), low(88, 6, 12, 0.6, 1.2),
        dress(low(30, 44, 3, 3, 2.5), 'amp'),
      ],
      bumpers: [post(86, 46, 0.5), post(72, 12, 0.5), post(58, 12, 0.5)],
      props: [
        prop('cymbal', 24, 1, 0, 1.4), prop('cymbal', 46, 1, 0, 1.6), prop('drum', 70, 0, 0, 1.3), prop('drum', 96, 0, 0, 1.6),
        prop('speaker', 1, 16, 0, 1.4), prop('speaker', 1, 40, 0, 1.4), prop('mic', 115, 20), prop('amp', 115, 36, 180), prop('note', 40, 55, 0, 1.2), prop('note', 80, 55, 20),
      ],
    },
    {
      // Two decks: each a turntable spinner on its own square, joined by the
      // crossfader — a railed gantry 3 up, reached by a ramp in the tee
      // deck's corner and dropped off onto the cup deck. Below it the
      // groove lane runs deck to deck under the tone arm, a long pendulum.
      name: 'Turntables',
      par: 4,
      tip: 'Up the ramp and along the crossfader, or under the tone arm by the groove lane.',
      tee: { x: 10, y: 9 },
      cup: { x: 100, y: 30 },
      floor: [R(6, 6, 30, 30), R(76, 6, 30, 30), R(36, 26, 40, 10), R(36, 8, 40, 10, 3)],
      zones: [
        spinner(10, 14, 18, 18, 2.5), spinner(82, 10, 18, 18, -2.5), slopeTo(26, 6, 10, 8, 180, 3),
        sand(60, 26, 3, 10), sand(40, 30, 4, 6), sand(78, 30, 6, 6), sand(102, 6, 4, 8),
      ],
      blocks: [pendulum(56, 26, 9, 1.2, 60, 3), polyRect(25, 14, 1, 1), dress(low(66, 10, 3, 6, 2.5), 'amp'), dress(low(30, 30, 3, 3, 2.5), 'speaker')],
      bumpers: [post(20, 9, 0.5), post(94, 30, 0.5), post(104, 24, 0.5), post(84, 33, 0.5)],
      props: [
        prop('speaker', 20, 1, 90, 1.5), prop('speaker', 92, 1, 90, 1.5), prop('mic', 56, 3, 90), prop('note', 46, 2, 0, 1.2), prop('note', 66, 2, 30),
        prop('amp', 1, 20, 0), prop('amp', 111, 20, 180), prop('crate', 56, 41), prop('crate', 46, 41, 20), prop('sign', 90, 41, 270, 1.2), prop('guitar', 20, 41, 90),
      ],
    },
    {
      // The stage lip drops you into the mosh pit: a sunken floor full of
      // bumpers (the crowd). Round it by the barrier lane down the east side
      // and up the ramp onto the crowd-surf platform, or roll into the
      // pit's cannon and get thrown over the crowd onto the platform.
      name: 'Mosh Pit',
      par: 4,
      tip: 'Drop in, work through the crowd to the barrier lane and the ramp — or the cannon.',
      tee: { x: 12, y: 24 },
      cup: { x: 54, y: 50 },
      floor: [R(6, 14, 20, 20, 2), R(26, 6, 50, 36), R(76, 6, 14, 50), R(36, 42, 40, 14, 2)],
      zones: [
        cannon(48, 12, 6, 6, 90, 34, 14), slopeTo(76, 44, 10, 12, 0, 2),
        sand(78, 26, 8, 3), sand(36, 44, 4, 10), sand(64, 50, 6, 6), sand(70, 8, 6, 8),
      ],
      blocks: [polyRect(75, 43, 1, 1), dress(low(6, 14, 20, 0.6, 3), 'fence')],
      bumpers: [
        bumper(34, 18), bumper(40, 30), bumper(58, 22), bumper(64, 34), bumper(46, 36), bumper(70, 18), bumper(32, 36),
        post(40, 12, 0.6), post(60, 12, 0.6), post(82, 40, 0.5), post(48, 47, 0.5),
      ],
      props: [
        prop('speaker', 1, 18, 0, 1.5), prop('speaker', 1, 30, 0, 1.5), prop('fence', 40, 1, 0, 1.5), prop('fence', 60, 1, 0, 1.5), prop('fence', 82, 1, 0, 1.5),
        prop('spotlight', 30, 2, 90), prop('mic', 12, 39), prop('guitar', 20, 40, 90), prop('sign', 60, 61, 270, 1.2), prop('crate', 95, 20), prop('crate', 95, 40, 30), prop('amp', 95, 52, 180),
      ],
    },
    {
      // The amp wall: a long alley with rubber cabinets staggered down it
      // that fire a banked ball on harder, a ramp up onto the amp-stack
      // platform, and up there the feedback loop — a gravity field along
      // the open back edge that drags anything slow off the stage. The
      // gamble: the pad beside the ramp flies the cliff straight onto the top.
      name: 'Amplifier',
      par: 4,
      tip: 'Bank off the cabs to the ramp — or the pad. Up top, feedback pulls toward the drop.',
      tee: { x: 10, y: 36 },
      cup: { x: 106, y: 32 },
      floor: [R(6, 30, 70, 12), R(76, 18, 40, 24, 2), open(76, 6, 40, 12, 2)],
      zones: [
        slopeTo(66, 30, 10, 8, 180, 2), jump(69, 38, 4, 4, 15), gfield(76, 6, 40, 16, 270, 8),
        sand(14, 30, 4, 5), sand(52, 36, 4, 6), sand(80, 22, 4, 20), sand(96, 36, 6, 6),
      ],
      blocks: [
        dress({ ...rubber(26, 30, 4, 7, 2), h: 3 }, 'amp'), dress({ ...rubber(44, 35, 4, 7, 2), h: 3 }, 'amp'), dress({ ...rubber(58, 30, 4, 6, 2), h: 3 }, 'amp'),
        dress(low(98, 24, 4, 4, 3), 'speaker'), polyRect(65, 29, 1, 1), low(76, 18, 0.6, 24, 1.2),
      ],
      bumpers: [post(36, 39, 0.5), post(90, 30, 0.5), post(110, 26, 0.5)],
      props: [
        prop('amp', 20, 25, 90, 1.4), prop('amp', 40, 25, 90, 1.4), prop('amp', 60, 25, 90, 1.4), prop('speaker', 86, 1, 90, 1.5), prop('speaker', 106, 1, 90, 1.5),
        prop('guitar', 30, 47, 270), prop('guitar', 50, 47, 270), prop('mic', 96, 47), prop('note', 121, 14, 0, 1.3), prop('note', 121, 30, 20), prop('sign', 1, 36, 0, 1.2),
      ],
    },
    {
      // The metronome: a stair of two steps up the main lane, each climbed
      // by a short ramp, with a swinging arm over every step — time the
      // beat or be swept off the side into the strobe lane below. That
      // lane runs the length of the stair under two blinking laser gates
      // to a cannon that lobs you straight up onto the top step.
      name: 'Metronome',
      par: 3,
      tip: 'Climb the steps between the beats, or run the strobe lane to the cannon.',
      tee: { x: 10, y: 26 },
      cup: { x: 100, y: 25 },
      floor: [R(6, 20, 34, 12), R(40, 20, 34, 12, 1.5), R(74, 20, 34, 12, 3), R(6, 32, 102, 10)],
      zones: [
        slopeTo(30, 22, 10, 8, 180, 1.5), slopeTo(64, 22, 10, 8, 180, 1.5), cannon(94, 34, 6, 6, 270, 28, 16),
        sand(16, 34, 4, 8), sand(52, 22, 4, 4), sand(84, 28, 6, 4), sand(60, 36, 6, 6),
      ],
      blocks: [
        pendulum(50, 20.5, 5, 1.2, 55, 2.6), pendulum(84, 20.5, 5, 1.2, 55, 2.6, 0.5),
        laser(36, 32, 1, 10, 2.5, 0.5, 0), laser(70, 32, 1, 10, 2.5, 0.5, 0.5),
        polyRect(29, 21, 1, 1), polyRect(63, 21, 1, 1),
      ],
      bumpers: [post(22, 24, 0.5), post(104, 30, 0.5), post(80, 40, 0.5)],
      props: [
        prop('speaker', 20, 14, 90, 1.5), prop('speaker', 60, 14, 90, 1.5), prop('speaker', 100, 14, 90, 1.5), prop('mic', 40, 15, 90), prop('keys', 80, 14, 0, 1.3),
        prop('amp', 1, 24, 0), prop('amp', 113, 24, 180), prop('note', 30, 47, 0, 1.2), prop('note', 70, 47, 20), prop('sign', 50, 47, 270, 1.2), prop('drum', 96, 47, 0, 1.2),
      ],
    },
    {
      // The lighting rig: a catwalk five up, open on every side, with the
      // spotlights standing on it. Two ramps climb to it — stage floor to
      // the truss base, truss base to the catwalk — or the stage cannon
      // lobs the ball clean up onto the rig from the floor.
      name: 'Lighting Rig',
      par: 4,
      tip: 'Two ramps up to the catwalk, or load the stage cannon and fly onto the rig.',
      tee: { x: 12, y: 46 },
      cup: { x: 116, y: 26 },
      floor: [R(6, 6, 60, 50), R(66, 6, 20, 50, 2.5), open(86, 20, 40, 12, 5)],
      zones: [
        slopeTo(56, 30, 10, 10, 180, 2.5), slopeTo(76, 21, 10, 10, 180, 2.5), cannon(44, 12, 6, 6, 0, 40, 22),
        sand(30, 34, 4, 8), sand(70, 10, 12, 4), sand(70, 42, 12, 4), sand(94, 22, 3, 8),
      ],
      blocks: [
        polyRect(55, 29, 1, 1), polyRect(55, 40, 1, 1), polyRect(75, 31, 1, 1), low(66, 6, 0.6, 50, 1.2),
        dress(low(20, 20, 4, 4, 3), 'speaker'), dress(low(40, 44, 4, 4, 3), 'speaker'), dress(low(30, 8, 3, 3, 2.5), 'amp'),
      ],
      bumpers: [post(100, 23, 0.5), post(108, 30, 0.5), post(76, 26, 0.5), post(26, 36, 0.5)],
      props: [
        prop('spotlight', 90, 15, 90, 1.2), prop('spotlight', 104, 15, 90, 1.2), prop('spotlight', 118, 15, 90, 1.2), prop('spotlight', 90, 37, 270, 1.2), prop('spotlight', 118, 37, 270, 1.2),
        prop('speaker', 20, 1, 90, 1.5), prop('speaker', 50, 1, 90, 1.5), prop('mic', 36, 1, 90), prop('guitar', 1, 30, 0), prop('amp', 1, 16, 0), prop('crate', 30, 61), prop('sign', 60, 61, 270, 1.2),
      ],
    },
    {
      // The encore: the whole show in one lap. Belt along the dock and up
      // onto the keys; off the back of the keys into the drum pit — bounce
      // off the skin or take the ramp — up onto the decks (a spinner in
      // the way), west along them to the rig by the steep ramp or the
      // cannon, and the stage dive: five down off the rig's front edge to
      // the cup on the stage apron.
      name: 'Encore',
      par: 7,
      tip: 'Dock, keys, drum pit, decks, rig, stage dive. Skins and the cannon skip a step each.',
      tee: { x: 10, y: 56 },
      cup: { x: 18, y: 38 },
      floor: [R(6, 50, 60, 12), R(66, 40, 30, 22, 1.5), R(66, 20, 30, 20), R(36, 6, 60, 14, 2), open(6, 6, 30, 24, 5), R(6, 30, 30, 12)],
      zones: [
        conveyor(16, 53, 30, 6, 0, 12), slopeTo(56, 52, 10, 8, 180, 1.5), trampoline(70, 28, 8, 8, 16), slopeTo(86, 20, 8, 10, 90, 2),
        spinner(66, 8, 10, 10, 2.5), slopeTo(36, 8, 10, 10, 0, 3), cannon(50, 7, 6, 6, 180, 30, 20),
        sand(40, 58, 4, 4), sand(82, 42, 4, 12), sand(66, 34, 4, 6), sand(84, 12, 4, 6), sand(22, 8, 4, 18), sand(26, 32, 6, 4),
      ],
      blocks: [
        polyRect(55, 51, 1, 1), polyRect(85, 29, 1, 1), polyRect(46, 7, 1, 1), polyRect(46, 18, 1, 1), low(36, 6, 60, 0.6, 1.2),
        dress(low(72, 44, 4, 4, 3), 'keys'), dress(low(88, 52, 4, 4, 3), 'speaker'), dress(low(60, 14, 3, 3, 2.5), 'amp'),
      ],
      bumpers: [post(30, 56, 0.5), post(90, 46, 0.5), post(74, 24, 0.6), post(80, 16, 0.5), post(14, 14, 0.5), post(28, 24, 0.5), post(24, 40, 0.5)],
      props: [
        prop('spotlight', 10, 1, 90, 1.2), prop('spotlight', 24, 1, 90, 1.2), prop('speaker', 50, 1, 90, 1.5), prop('speaker', 80, 1, 90, 1.5), prop('drum', 101, 30, 180, 1.3),
        prop('cymbal', 101, 22, 180, 1.3), prop('keys', 101, 50, 180, 1.3), prop('amp', 1, 18, 0), prop('mic', 1, 36), prop('guitar', 1, 56, 0),
        prop('crate', 30, 67), prop('crate', 40, 67, 30), prop('sign', 50, 46, 0, 1.2), prop('note', 44, 40, 0, 1.2), prop('note', 54, 26, 20),
      ],
    },
  ],
};
