// Built-in course. See .claude/course-guidelines.md before editing.
import {
  type Course, R, polyRect, polyNgon, polyStar,
  bumper, post, windmill, slider, pendulum, laser, rubber, prop, dress,
  sand, ice, water, slope, slopeTo, boost, jump, tele, conveyor, spinner, fan, trampoline, magnet, cannon, gfield, tunnel,
} from '../courses';
import { tri, low, mirrorTR, corner, star, open, lowRail, pond } from '../pieces';

// ---------------------------------------------------------------------------
// SILVER SCREEN — a night at the movies: the box office queue, the red
// carpet, the popcorn machine, the projection booth, the backlot and the
// auditorium, ending on the stage in front of the giant screen. Every hole
// climbs or drops (booths, bleachers, counters, gantries, roofs, tiers) and
// has an honest line and a gamble.
// ---------------------------------------------------------------------------
export const CINEMA: Course = {
  id: 18,
  name: 'Silver Screen',
  theme: 'cinema',
  holes: [
    {
      // The queue for tickets: fences snake the lobby into three lanes
      // (east along the bottom, west along the middle on the red-carpet
      // belt, east again along the top) and the aisle stairs at the end
      // climb onto the ticket-booth platform. The gamble: a pad by the tee
      // lofts you over both fences straight into the top lane.
      name: 'Box Office',
      par: 4,
      tip: 'Snake the queue barriers to the booth stairs, or hop both fences off the pad.',
      tee: { x: 4, y: 31 },
      cup: { x: 80, y: 6 },
      floor: [R(0, 25, 52, 11), R(52, 12, 12, 24), R(0, 12, 52, 12), R(0, 0, 12, 24), R(12, 0, 52, 11), R(64, 0, 26, 12, 2)],
      zones: [conveyor(14, 14, 36, 8, 180, 7), slopeTo(54, 0, 10, 11, 180, 2), jump(12, 25, 4, 4, 14), sand(36, 31, 4, 5), sand(20, 0, 4, 6), sand(68, 1, 3, 10)],
      blocks: [dress(low(0, 24, 52, 1, 1.2), 'fence'), dress(low(12, 11, 52, 1, 1.2), 'fence'), polyRect(53, 0, 1, 1), polyRect(53, 10, 1, 1)],
      bumpers: [post(44, 28, 0.5), post(30, 18, 0.5), post(6, 8, 0.5), post(40, 5, 0.5), post(74, 3, 0.5), post(74, 9, 0.5)],
      props: [
        prop('sign', 96, 6, 180, 1.4), prop('popcorn', 96, 16), prop('spotlight', -5, -4, 45), prop('spotlight', 68, -4, 135),
        prop('camera', -6, 30, 0), prop('reel', 20, 41), prop('reel', 44, 41), prop('clapper', 94, -4, 200), prop('seats', 30, -5, 90),
      ],
    },
    {
      // The premiere carpet: a belt runs the length of the hall between
      // velvet-rope posts, with bleachers (raised, seated) along both sides
      // reached by short aisle ramps. Ride the carpet through the posts, or
      // climb a bleacher, roll along the seats and drop off by the cup.
      name: 'Red Carpet',
      par: 3,
      tip: 'Ride the carpet through the rope posts, or climb a bleacher and drop off by the cup.',
      tee: { x: 5, y: 15 },
      cup: { x: 94, y: 15 },
      floor: [R(0, 0, 100, 30), R(0, 0, 100, 8, 2), R(0, 22, 100, 8, 2)],
      zones: [
        conveyor(10, 13, 78, 4, 0, 7), slopeTo(14, 8, 8, 5, 90, 2), slopeTo(14, 17, 8, 5, 270, 2),
        sand(40, 1, 4, 6), sand(70, 23, 4, 6), sand(84, 9, 3, 4), sand(84, 17, 3, 4),
      ],
      blocks: [
        dress(polyRect(30, 1, 8, 4), 'seats'), dress(polyRect(56, 3, 8, 4), 'seats'), dress(polyRect(30, 25, 8, 4), 'seats'), dress(polyRect(56, 23, 8, 4), 'seats'),
        polyRect(13, 8, 1, 1), polyRect(13, 21, 1, 1),
      ],
      bumpers: [post(40, 15, 0.5), post(60, 13.5, 0.5), post(60, 16.5, 0.5), post(78, 15, 0.5), post(90, 11, 0.5), post(90, 19, 0.5)],
      props: [
        prop('screen', 106, 15, 180, 1.4), prop('spotlight', -5, -4, 45), prop('spotlight', -5, 34, -45), prop('spotlight', 104, -4, 135), prop('spotlight', 104, 34, 225),
        prop('camera', 30, -5, 90), prop('camera', 70, 35, 270), prop('reel', 50, -6), prop('popcorn', 10, 36), prop('clapper', -6, 15),
      ],
    },
    {
      // The popcorn machine: the lobby floor ends at the glass — a drop
      // into the kettle, a pit of trampolines (the popping kernels). A ball
      // driven off the edge lands on a kernel and pops out over the glass
      // onto the counter where the cup waits. The honest way is the service
      // ramp at the back of the kettle.
      name: 'Popcorn Machine',
      par: 3,
      tip: 'Drop into the kettle and pop out onto the counter, or take the service ramp.',
      tee: { x: 5, y: 22 },
      cup: { x: 86, y: 14 },
      floor: [R(0, 16, 40, 12, 2), R(40, 4, 24, 36), R(64, 4, 32, 36, 3)],
      zones: [
        trampoline(41, 6, 12, 10, 16), trampoline(41, 17, 12, 10, 16), trampoline(53, 8, 9, 14, 16), slopeTo(54, 28, 10, 10, 180, 3),
        sand(66, 6, 4, 26), sand(78, 30, 4, 10), sand(20, 17, 4, 10),
      ],
      blocks: [dress(polyRect(41, 30, 8, 5), 'popcorn'), polyRect(53, 27, 1, 1), polyRect(53, 38, 1, 1), dress(polyRect(88, 28, 6, 6), 'popcorn')],
      bumpers: [bumper(58, 25, 1, 6), post(80, 8, 0.5), post(80, 20, 0.5), post(30, 26, 0.5)],
      props: [
        prop('popcorn', 100, 12, 180, 1.6), prop('popcorn', 100, 30, 180), prop('sign', 52, -2, 90), prop('spotlight', -5, 12, 45), prop('spotlight', 36, 32, -45),
        prop('seats', 20, 33, 0), prop('reel', 70, 44), prop('camera', 10, 10, 90),
      ],
    },
    {
      // The projection booth stands across the auditorium. The beam of
      // light is a tunnel straight through it (the one line to the cup);
      // the stairs climb onto the booth roof past the projector and the
      // reels, and the far side is a drop into the screen hall.
      name: 'Projector Room',
      par: 3,
      tip: 'Up the stairs and over the booth, or ride the beam: the tunnel straight through.',
      tee: { x: 5, y: 15 },
      cup: { x: 92, y: 15 },
      floor: [R(0, 0, 30, 30), R(30, 0, 40, 30, 2.5), R(70, 0, 30, 30)],
      zones: [tunnel(30, 12, 40, 6), slopeTo(20, 0, 10, 10, 180, 2.5), sand(34, 22, 4, 8), sand(60, 0, 4, 10), sand(78, 24, 4, 6), sand(10, 4, 4, 8)],
      blocks: [
        polyRect(19, 10, 1, 1), dress(polyRect(46, 3, 6, 4), 'projector'),
        dress({ pts: polyNgon(42, 24, 2.5, 12) }, 'reel'), dress({ pts: polyNgon(62, 22, 2.5, 12) }, 'reel'),
      ],
      bumpers: [post(74, 12.5, 0.5), post(74, 17.5, 0.5), post(26, 12, 0.5), post(26, 18, 0.5), post(84, 8, 0.5), post(84, 22, 0.5), post(14, 26, 0.5)],
      props: [
        prop('screen', 104, 15, 180, 1.6), prop('spotlight', -5, -4, 45), prop('spotlight', -5, 34, -45), prop('reel', 40, -6), prop('reel', 56, 36),
        prop('projector', -6, 22, 0), prop('seats', 80, 36, 270), prop('seats', 90, 36, 270), prop('camera', 30, 36, 270),
      ],
    },
    {
      // Reel to reel: the film runs up onto a gantry, round the take-up
      // reel (a spinner), along the film strip (a belt) and round the feed
      // reel, then drops off the gantry's end to the cup floor. Underneath
      // the gantry a service tunnel runs the whole length.
      name: 'Reel to Reel',
      par: 4,
      tip: 'Up onto the gantry and past both reels, or the service tunnel underneath.',
      tee: { x: 5, y: 30 },
      cup: { x: 114, y: 6 },
      floor: [R(0, 20, 30, 14), R(30, 0, 66, 34, 3), R(96, 0, 24, 34)],
      zones: [
        slopeTo(20, 20, 10, 6, 180, 3), tunnel(30, 27, 66, 6), spinner(32, 2, 22, 22, 3), conveyor(54, 10, 14, 6, 0, 9), spinner(68, 4, 22, 22, -3),
        sand(90, 2, 4, 20), sand(104, 26, 6, 6), sand(100, 8, 3, 10),
      ],
      blocks: [polyRect(19, 26, 1, 1), dress({ pts: polyNgon(43, 13, 2.2, 12) }, 'reel'), dress({ pts: polyNgon(79, 15, 2.2, 12) }, 'reel'), dress(polyRect(84, 28, 6, 4), 'projector')],
      bumpers: [post(98, 28, 0.5), post(98, 32, 0.5), post(110, 12, 0.5), post(14, 24, 0.5), post(60, 30, 0.4)],
      props: [
        prop('reel', 43, -6, 0, 1.5), prop('reel', 79, -6, 0, 1.5), prop('projector', 126, 6, 180, 1.4), prop('spotlight', -5, 16, 45), prop('spotlight', 126, 38, 225),
        prop('camera', 10, 40, 270), prop('clapper', 60, 40), prop('sign', 100, -6, 90), prop('popcorn', -6, 36),
      ],
    },
    {
      // The backlot car chase: a street with stunt cars sliding across the
      // lanes, a jump ramp at its end that flies the gap onto the roof (the
      // stunt), and the alley that goes round the block to a fire escape up
      // the back of the same roof.
      name: 'Car Chase',
      par: 4,
      tip: 'Dodge the cars, then jump the gap onto the roof — or take the alley round the block.',
      tee: { x: 5, y: 6 },
      cup: { x: 108, y: 4 },
      floor: [R(0, 0, 90, 12), R(80, 12, 10, 26), R(80, 30, 54, 8), R(124, 12, 10, 26), open(100, 0, 34, 12, 2.5)],
      zones: [jump(84, 4, 4, 4, 15), slopeTo(125, 12, 8, 8, 90, 2.5), sand(40, 8, 4, 4), sand(82, 20, 6, 4), sand(104, 32, 6, 6), sand(114, 1, 3, 10)],
      blocks: [
        dress(slider(24, 0, 4, 3, 0, 9, 3, 0), 'crate'), dress(slider(48, 9, 4, 3, 0, -9, 3.5, 0.3), 'crate'), dress(slider(66, 0, 4, 3, 0, 9, 3, 0.6), 'crate'),
        low(100, 0, 34, 1, 1.2), low(133, 1, 1, 11, 1.2), low(100, 11, 24, 1, 1.2), polyRect(124, 20, 1, 1), polyRect(133, 20, 1, 1),
      ],
      bumpers: [post(86, 14, 0.5), post(129, 26, 0.5), post(120, 6, 0.5), post(110, 34, 0.5)],
      props: [
        prop('camera', 60, -6, 90), prop('camera', 94, 16, 45), prop('clapper', 20, -6), prop('spotlight', -5, -4, 45), prop('spotlight', 138, -4, 135),
        prop('sign', 95, -4, 270), prop('crate', 70, 42), prop('crate', 76, 42, 30), prop('seats', 30, 16, 270), prop('screen', 110, 44, 270, 1.2),
      ],
    },
    {
      // The auditorium: stalls, then three tiers of seating each higher
      // than the last, joined by aisle stairs at alternate ends, the cup on
      // the balcony by the screen. The cannon in the stalls (a spotlight
      // mount) lobs you straight up onto the balcony.
      name: 'Balcony',
      par: 5,
      tip: 'Aisle stairs zig-zag up three tiers to the balcony, or load the cannon and fly.',
      tee: { x: 6, y: 42 },
      cup: { x: 20, y: 6 },
      floor: [R(0, 36, 72, 12), R(0, 24, 72, 12, 1.5), R(0, 12, 72, 12, 3), R(0, 0, 72, 12, 4.5)],
      zones: [
        slopeTo(62, 36, 10, 6, 90, 1.5), slopeTo(0, 24, 10, 6, 90, 1.5), slopeTo(62, 12, 10, 6, 90, 1.5), cannon(28, 38, 6, 6, 285, 30, 20),
        sand(44, 40, 4, 8), sand(30, 26, 4, 8), sand(40, 14, 4, 8), sand(34, 1, 4, 10),
      ],
      blocks: [
        tri(56, 36, 62, 36, 62, 42), tri(16, 24, 10, 24, 10, 30), tri(56, 12, 62, 12, 62, 18),
        dress(polyRect(22, 28, 8, 4), 'seats'), dress(polyRect(44, 28, 8, 4), 'seats'), dress(polyRect(14, 16, 8, 4), 'seats'), dress(polyRect(44, 16, 8, 4), 'seats'),
        dress(polyRect(56, 4, 8, 4), 'seats'), dress(polyRect(4, 4, 6, 4), 'seats'),
      ],
      bumpers: [post(52, 40, 0.5), post(8, 34, 0.5), post(36, 20, 0.5), post(26, 10, 0.5), post(14, 14, 0.5)],
      props: [
        prop('screen', 36, -8, 90, 2), prop('spotlight', -5, 44, 0), prop('spotlight', 76, 44, 180), prop('spotlight', -5, 2, 45), prop('spotlight', 76, 2, 135),
        prop('projector', 36, 54, 270, 1.4), prop('popcorn', -6, 28), prop('camera', 76, 26, 180), prop('clapper', 10, 54),
      ],
    },
    {
      // The cutting room: laser gates (the censor's scissors) and a swinging
      // arm cross the lane, a gravity field drags the ball sideways, and the
      // editing desk stands at the end — straight through under it by the
      // tunnel, or up the stairs and over past the monitor and the reel.
      name: 'Final Cut',
      par: 3,
      tip: 'Through the scissors and the swing, then under the desk — or up and over it.',
      tee: { x: 4, y: 12 },
      cup: { x: 92, y: 12 },
      floor: [R(0, 0, 54, 16), R(54, 0, 24, 36, 2.5), R(78, 0, 24, 36)],
      zones: [
        tunnel(54, 9, 24, 6), slopeTo(44, 1, 10, 6, 180, 2.5), gfield(10, 0, 10, 16, 90, 7),
        sand(66, 18, 4, 14), sand(84, 24, 4, 10), sand(96, 2, 4, 6),
      ],
      blocks: [
        laser(24, 0, 1, 8, 2.5, 0.5, 0), laser(24, 8, 1, 8, 2.5, 0.5, 1.25), laser(40, 0, 1, 8, 2.5, 0.5, 0.7), laser(40, 8, 1, 8, 2.5, 0.5, 1.95), pendulum(32, 0, 8, 1.2, 50, 3),
        polyRect(43, 7, 1, 1), dress(polyRect(58, 22, 8, 6), 'screen'), dress({ pts: polyNgon(72, 30, 2.5, 12) }, 'reel'),
      ],
      bumpers: [post(80, 8.5, 0.5), post(80, 15.5, 0.5), post(88, 6, 0.5), post(50, 14, 0.5)],
      props: [
        prop('screen', 108, 18, 180, 1.3), prop('reel', 30, -6), prop('reel', 46, -6), prop('clapper', -6, 5), prop('spotlight', -5, 20, -45),
        prop('projector', 60, 42, 270), prop('camera', 90, 42, 270), prop('seats', 20, 22, 0), prop('popcorn', 106, 40),
      ],
    },
    {
      // The premiere: the red carpet belt past the rope posts, the stairs
      // up to the foyer, the foyer north past the popcorn stand, a second
      // flight up into the lobby with its spotlights, then the drop off the
      // lobby's edge onto the stage beside the marquee and a putt to the
      // cup in front of the giant screen. The gamble: the pad in the lobby
      // flies you over the marquee, straight down onto the stage.
      name: 'Premiere',
      par: 5,
      tip: 'Carpet, foyer, lobby, drop beside the marquee — or fly the lobby pad over it.',
      tee: { x: 5, y: 66 },
      cup: { x: 132, y: 38 },
      floor: [R(0, 60, 90, 12), lowRail(90, 20, 14, 52, 2.2, 1.5), R(80, 0, 70, 20, 3), R(114, 20, 36, 24, 1.5), open(122, 24, 26, 8, 5)],
      zones: [
        conveyor(14, 63, 56, 6, 0, 7), slopeTo(80, 61, 10, 10, 180, 1.5), slopeTo(90, 20, 14, 8, 90, 1.5), jump(126, 14, 4, 4, 16),
        sand(30, 61, 4, 3), sand(96, 40, 6, 4), sand(84, 2, 4, 8), sand(110, 12, 4, 8), sand(146, 4, 4, 12), sand(116, 36, 4, 8),
      ],
      blocks: [
        polyRect(79, 60, 1, 1), polyRect(79, 71, 1, 1),
        dress(polyRect(92, 50, 4, 4), 'popcorn'), dress(polyRect(140, 2, 8, 4), 'seats'), dress(polyRect(96, 2, 8, 4), 'seats'),
      ],
      bumpers: [post(24, 66, 0.5), post(50, 64, 0.5), post(70, 68, 0.5), bumper(98, 34, 1, 6), bumper(106, 8, 1.1, 8), bumper(120, 12, 1.1, 8), bumper(136, 6, 1.1, 8), post(118, 24, 0.5), post(144, 36, 0.5)],
      props: [
        prop('screen', 132, 50, 270, 2.2), prop('spotlight', -5, 58, 45), prop('spotlight', -5, 76, -45), prop('spotlight', 154, -4, 135), prop('spotlight', 154, 48, 225),
        prop('camera', 30, 76, 270), prop('camera', 84, 50, 90), prop('reel', 100, -6), prop('reel', 130, -6), prop('popcorn', 66, 56), prop('sign', 116, -6, 90, 1.3), prop('clapper', 20, 56), prop('seats', 109, 30, 0), prop('seats', 109, 38, 0),
      ],
    },
  ],
};
