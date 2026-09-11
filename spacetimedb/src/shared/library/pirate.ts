// Built-in course. See .claude/course-guidelines.md before editing.
import {
  type Course, type Block, R, polyRect, polyNgon,
  post, windmill, pendulum, laser, prop, dress,
  sand, water, slopeTo, conveyor, spinner, fan, trampoline, magnet, cannon, gfield, tunnel,
} from '../courses';
import { tri, low, corner, star, lowRail, pond } from '../pieces';

/** A barrel: a round solid block, `bounce` > 1 makes it a powder keg. */
const barrel = (cx: number, cy: number, r = 1.5, bounce?: number): Block => {
  const b: Block = { pts: polyNgon(cx, cy, r, 12) };
  if (bounce !== undefined) b.bounce = bounce;
  return dress(b, 'barrel');
};
/** A crate: a box block fitted to the rect. */
const crate = (x: number, y: number, w: number, h: number): Block => dress(polyRect(x, y, w, h), 'crate');
/** A chest: a box block, chest-shaped. */
const chest = (x: number, y: number, w: number, h: number): Block => dress(polyRect(x, y, w, h), 'chest');
/** A rock: a star-shaped block dressed as a boulder. */
const rock = (cx: number, cy: number, r: number): Block => dress(star(cx, cy, r, undefined, 7), 'rock');
/** A skull: a low box block with a skull on it (jumpable). */
const skull = (x: number, y: number, s: number): Block => dress(low(x, y, s, s, 1.2), 'skull');

// ---------------------------------------------------------------------------
// SKULL COVE — a buccaneers' island: the quay and a beached galleon, powder
// stores, sea caves, a whirlpool and the treasure. Every hole climbs a deck,
// a mast, a cliff or a vault and has two ways up: an honest one round the
// hull, and a plank, a cannon, a tunnel or a whirlpool for the bold.
// ---------------------------------------------------------------------------
export const PIRATE: Course = {
  id: 19,
  name: 'Skull Cove',
  theme: 'pirate',
  holes: [
    {
      // The galleon lies alongside the quay. The gangplank runs from the
      // wharf's north end up onto the bow; the pier runs east under the hull
      // to the stern, where a fire-escape ramp climbs onto the poop deck.
      // The cup sits aft between the barrels either way.
      name: 'Gangplank',
      par: 4,
      tip: 'Up the plank onto the bow, or along the pier and up the stern ramp.',
      tee: { x: 5, y: 30 },
      cup: { x: 100, y: 6 },
      floor: [R(0, 20, 30, 14), R(0, 0, 10, 20), R(10, 2, 30, 6), R(40, 0, 70, 22, 2.5), R(30, 22, 80, 12), R(110, 12, 16, 22, 2.5)],
      zones: [
        slopeTo(28, 2, 12, 6, 180, 2.5), slopeTo(100, 22, 10, 12, 180, 2.5),
        sand(60, 24, 4, 10), sand(84, 14, 6, 8), sand(114, 14, 8, 3),
      ],
      blocks: [
        barrel(60, 6), barrel(60, 17), barrel(80, 11, 1.4), barrel(92, 4, 1.3), crate(70, 8, 4, 4), crate(48, 14, 4, 4),
      ],
      bumpers: [post(75, 3, 0.9), post(45, 31, 0.5), post(80, 24.6, 0.5), post(118, 30, 0.5), post(94, 24.6, 0.5), post(5, 12, 0.5)],
      props: [
        prop('anchor', -4, 30, 90), prop('palm', -4, 4, 0, 1.2), prop('palm', 40, 38, 0, 1.3), prop('palm', 70, 39, 20),
        prop('barrel', 20, 14), prop('crate', 33, 14, 30), prop('mast', 60, -5, 0, 1.4), prop('mast', 90, -5, 0, 1.4),
        prop('rock', 100, 39, 0, 1.4), prop('chest', 130, 20), prop('skull', 130, 30), prop('palm', 118, 39, 0, 1.1),
      ],
    },
    {
      // The cup is in the crow's nest, three storeys up the mast. Two lengths
      // of rigging (ramps) climb it: the long deck to the yard, the yard to
      // the nest (a basket: its rails are high). The yard's south edge is
      // open — a ball that misses the second rigging drops back to the deck.
      name: "Crow's Nest",
      par: 5,
      tip: 'Along the deck, up the rigging to the yard, up again to the nest. Miss and you drop.',
      tee: { x: 5, y: 40 },
      cup: { x: 96, y: 5 },
      floor: [R(0, 32, 84, 20), R(84, 12, 24, 40, 2.75), lowRail(88, 0, 16, 12, 2.5, 5.5)],
      zones: [
        slopeTo(74, 34, 10, 10, 180, 2.75), slopeTo(88, 12, 16, 12, 90, 2.75),
        sand(84, 46, 24, 3), sand(30, 33, 3, 8), sand(52, 44, 3, 8),
      ],
      blocks: [
        polyRect(73, 33, 1, 1), polyRect(73, 44, 1, 1), polyRect(87, 24, 1, 1), polyRect(104, 24, 1, 1),
        barrel(16, 48, 1.4), barrel(40, 36, 1.4), barrel(62, 49, 1.3), crate(24, 33, 4, 3), crate(104, 40, 3, 3),
      ],
      bumpers: [post(80, 50, 0.5), post(86, 30, 0.5), post(94, 28, 0.6), post(90, 3, 0.4), post(102, 9, 0.4)],
      props: [
        prop('mast', 96, -5, 0, 1.6), prop('mast', 114, 20, 0, 1.2), prop('anchor', 30, 56, 90), prop('barrel', 8, 56),
        prop('palm', -5, 36, 0, 1.2), prop('palm', 50, 56, 15), prop('crate', 112, 44), prop('skull', 112, 10),
        prop('rock', 20, 26, 0, 1.3), prop('palm', 40, 26, -20), prop('barrel', 70, 26),
      ],
    },
    {
      // Two ships lie broadside on across a strip of heaving sea. Drop off
      // the tee ship's deck, ride the swell (belts pull north and south),
      // climb the far hull's boarding ramp and roll off the poop onto the
      // pier — or load the bow chaser and fly across. The gun-deck tunnel
      // through the far hull runs straight at the cup for a hard, low shot.
      name: 'Broadside',
      par: 3,
      tip: 'Cross the swell to the boarding ramp, fire the bow chaser, or thread the gun deck.',
      tee: { x: 6, y: 18 },
      cup: { x: 86, y: 12 },
      floor: [R(0, 0, 24, 24, 2), R(24, 0, 32, 24), R(56, 0, 24, 24, 2), R(80, 0, 12, 24)],
      zones: [
        cannon(3, 3, 6, 6, 0, 44, 22), conveyor(28, 0, 6, 24, 90, 9), conveyor(40, 0, 6, 16, 270, 9),
        slopeTo(46, 16, 10, 8, 180, 2), tunnel(56, 9.5, 24, 5), sand(84, 0, 4, 6), sand(84, 18, 4, 6), sand(66, 0, 4, 6),
      ],
      blocks: [
        polyRect(45, 15, 1, 1), barrel(12, 14, 1.4), crate(16, 2, 4, 4), barrel(62, 4, 1.3), barrel(74, 20, 1.3), crate(70, 2, 4, 3),
      ],
      bumpers: [post(37, 12, 0.7), post(50, 6, 0.6), post(76, 12, 0.5), post(20, 21, 0.4)],
      props: [
        prop('mast', 12, -5, 0, 1.5), prop('mast', 68, -5, 0, 1.5), prop('anchor', -4, 6, 0), prop('anchor', 95, 20, 180),
        prop('barrel', -4, 18), prop('crate', 40, 28, 15), prop('rock', 30, 28, 0, 1.2), prop('palm', 95, 4, 0, 1.2),
        prop('skull', 60, 28), prop('palm', 4, 28, 10),
      ],
    },
    {
      // A kraken sits in the lagoon, four tentacles sweeping. The tee is on
      // the lookout rock: drop off it, cross the causeway to the junction
      // isle, then south past the tentacles to the cup isle (honest) or north
      // over the tidal pool where the whirlpool tugs everything to its eye.
      name: 'Kraken',
      par: 3,
      tip: 'Off the rock, along the causeway; south past the tentacles or north through the whirlpool.',
      tee: { x: 6, y: 32 },
      cup: { x: 94, y: 44 },
      floor: [R(0, 0, 20, 50), R(0, 24, 16, 16, 2.5), R(20, 0, 80, 50)],
      zones: [
        ...pond(20, 0, 80, 50, R(20, 27, 24, 10), R(44, 20, 14, 30), R(44, 4, 36, 16), R(58, 38, 22, 12), R(80, 4, 20, 46)),
        magnet(50, 4, 24, 16, 12), water(60, 9, 3, 3), sand(80, 24, 6, 8),
      ],
      blocks: [...windmill(69, 29, 10, 0.8, 4, 0.9), rock(3, 4, 2.2), rock(16, 46, 2)],
      bumpers: [post(84, 12, 0.5), post(96, 30, 0.5), post(84, 40, 0.4)],
      props: [
        prop('palm', -5, 10, 0, 1.3), prop('palm', -5, 40, 20, 1.1), prop('rock', 30, -5, 0, 1.5), prop('rock', 70, -5, 0, 1.2),
        prop('skull', 104, 10), prop('palm', 104, 30, 0, 1.2), prop('chest', 104, 44), prop('rock', 50, 55, 0, 1.4),
        prop('anchor', 80, 55, 270), prop('barrel', 10, 55),
      ],
    },
    {
      // The powder room: from the upper store a ramp runs down into the
      // cellar, crates are stacked in a maze, and the far corner is a stack
      // of rubber powder kegs set at 45°. Hit them and the blast fires you
      // north up the alley and the ramp onto the magazine, where the cup is.
      // The honest way: through the crates, into the alley, up the ramp.
      name: 'Powder Room',
      par: 3,
      tip: 'Down into the cellar, through the crates, up the alley — or bank off the powder kegs.',
      tee: { x: 5, y: 38 },
      cup: { x: 82, y: 6 },
      floor: [R(0, 28, 16, 20, 2.5), R(16, 28, 64, 20), R(66, 12, 14, 16), R(62, 0, 24, 12, 2.5)],
      zones: [slopeTo(16, 32, 10, 12, 0, 2.5), slopeTo(68, 12, 10, 10, 90, 2.5), sand(64, 4, 4, 8), sand(60, 42, 4, 6)],
      blocks: [
        polyRect(26, 31, 1, 1), polyRect(26, 44, 1, 1), polyRect(67, 22, 1, 1), polyRect(78, 22, 1, 1),
        { ...tri(80, 48, 68, 48, 80, 36), bounce: 2 },
        barrel(34, 29.6, 1.4, 2), barrel(37, 29.6, 1.4, 2), barrel(40, 29.6, 1.4, 2),
        crate(32, 36, 4, 4), crate(44, 41, 4, 4), crate(50, 30, 4, 5), crate(56, 36, 5, 4), crate(44, 32, 3, 3),
        chest(64, 1, 3, 3), barrel(72, 14, 1.2, 2), barrel(84, 4, 1.2),
      ],
      bumpers: [post(60, 34, 0.5), post(70, 40, 0.5), post(72, 5, 0.4), post(4, 44, 0.4)],
      props: [
        prop('barrel', -4, 32), prop('barrel', -4, 44), prop('crate', 30, 52, 20), prop('crate', 60, 52, -10),
        prop('skull', 84, 30), prop('palm', 90, 16, 0, 1.2), prop('chest', 90, 4), prop('crate', 56, -4, 15),
        prop('barrel', 30, 24), prop('rock', 50, 24, 0, 1.2),
      ],
    },
    {
      // A sea cave bores under the headland: a stalactite drips at the mouth
      // (laser gate) and the far mouth opens onto wet sand. The headland is
      // climbed by a ramp at the beach's north end; its far edge is a cliff
      // dropping onto the beach by the cup.
      name: 'Sea Cave',
      par: 2,
      tip: 'Through the cave (mind the drip) to the beach, or up the headland and off the cliff.',
      tee: { x: 5, y: 18 },
      cup: { x: 77, y: 13 },
      floor: [R(0, 0, 24, 30), R(24, 0, 50, 30, 3), R(74, 0, 30, 30)],
      zones: [
        tunnel(24, 11, 50, 4), slopeTo(14, 0, 10, 8, 180, 3), sand(74, 17, 6, 4), sand(74, 5, 6, 4), water(80, 22, 14, 6), sand(40, 20, 6, 8),
      ],
      blocks: [laser(22.5, 11, 1, 4, 2.5, 0.5), polyRect(13, 8, 1, 1), rock(40, 4, 2), rock(62, 24, 2.2), skull(60, 2, 3)],
      bumpers: [post(90, 6, 0.5), post(86, 16, 0.5), post(10, 26, 0.5), post(30, 24, 0.5)],
      props: [
        prop('rock', 30, -5, 0, 1.6), prop('rock', 50, -5, 0, 1.3), prop('skull', 46, 35), prop('palm', 10, 35, 0, 1.3),
        prop('palm', 86, 35, 10, 1.2), prop('anchor', 108, 22, 180), prop('chest', 108, 8), prop('barrel', -4, 8),
        prop('rock', 64, 35, 0, 1.2), prop('palm', -5, 24, 0, 1.1),
      ],
    },
    {
      // The treasure vault of a ship going down by the stern. Up the hall,
      // through the swords swinging across the doorway, into the hold — where
      // the list of the ship pulls everything to the bilge. The fore ramp at
      // the top of the hold is the short way onto the strongroom; the honest
      // way rolls with the tilt into the bilge and climbs the aft ramp.
      name: 'Plunder',
      par: 4,
      tip: 'Through the swords, then fight the list to the fore ramp or take the bilge and the aft ramp.',
      tee: { x: 7, y: 34 },
      cup: { x: 98, y: 6 },
      floor: [R(0, 0, 14, 40), R(14, 0, 26, 14), R(40, 0, 50, 30), R(40, 30, 50, 10), R(90, 0, 16, 40, 2)],
      zones: [gfield(44, 0, 38, 30, 90, 3), slopeTo(82, 1, 8, 8, 180, 2), slopeTo(80, 31, 10, 8, 180, 2), sand(92, 26, 14, 3), sand(46, 32, 6, 8), sand(70, 32, 6, 8), sand(84, 12, 6, 6)],
      blocks: [
        corner(14, 0, 8, -1, 1), pendulum(27, 0, 6, 1.2, 40, 3),
        polyRect(81, 0, 1, 1), polyRect(81, 9, 1, 1), polyRect(79, 30, 1, 1), polyRect(79, 39, 1, 1),
        chest(92, 12, 4, 3), chest(100, 20, 4, 3), crate(60, 12, 4, 4), barrel(70, 22, 1.4), crate(4, 2, 4, 4),
      ],
      bumpers: [post(50, 6, 0.5), post(66, 4, 0.5), post(94, 34, 0.5), post(10, 20, 0.5)],
      props: [
        prop('chest', 110, 6), prop('skull', 110, 20), prop('chest', 110, 34), prop('barrel', -4, 30), prop('barrel', -4, 10),
        prop('mast', 30, -6, 0, 1.3), prop('anchor', 60, -5, 270), prop('crate', 60, 45, 10), prop('crate', 20, 20, -15),
        prop('palm', 30, 26, 0, 1.2),
      ],
    },
    {
      // The maelstrom: a great spinning pool with a bottomless eye, and a
      // gust off the shore that carries a ball across the shallows to the far
      // beach and its ramp onto the sea rock. The rock is split by a pit
      // with a trampoline — fall in at pace and you bounce onto the cup rock.
      // The honest way keeps south along the causeway to the back lane and
      // the back ramp; the cup sits just over its crest.
      name: 'Maelstrom',
      par: 3,
      tip: 'South by the causeway and up the back ramp, or ride the whirlpool, the gust and the pit.',
      tee: { x: 14, y: 36 },
      cup: { x: 100.5, y: 36 },
      floor: [R(0, 0, 30, 42), R(30, 0, 54, 30), R(84, 0, 8, 30, 2.5), R(92, 0, 6, 30), R(98, 0, 12, 46, 2.5), R(30, 30, 54, 12), R(84, 30, 14, 16)],
      zones: [
        spinner(30, 1, 28, 28, 1.5), sand(41, 12, 6, 6), fan(58, 4, 6, 22, 0, 30), sand(64, 0, 10, 30),
        slopeTo(74, 10, 10, 10, 180, 2.5), trampoline(92, 0, 6, 20, 15), slopeTo(88, 34, 10, 8, 180, 2.5),
        sand(50, 30, 4, 3), sand(50, 39, 4, 3), sand(70, 30, 4, 4), sand(70, 38, 4, 4), sand(100, 20, 4, 8),
      ],
      blocks: [
        polyRect(73, 9, 1, 1), polyRect(73, 20, 1, 1), polyRect(87, 33, 1, 1), polyRect(87, 42, 1, 1),
        rock(86, 4, 1.6), rock(89, 26, 1.6), rock(106, 20, 1.6), crate(12, 8, 4, 4), barrel(20, 20, 1.4),
      ],
      bumpers: [post(62, 31, 0.5), post(80, 32, 0.5), post(101, 10, 0.5), post(24, 30, 0.5)],
      props: [
        prop('rock', 45, -5, 0, 1.6), prop('rock', 70, -5, 0, 1.3), prop('rock', 95, -5, 0, 1.4), prop('skull', 114, 10),
        prop('palm', 114, 26, 0, 1.2), prop('palm', 100, 50, 10, 1.3), prop('anchor', 60, 47, 0), prop('barrel', 20, 47),
        prop('rock', 90, 50, 0, 1.2),
        prop('palm', -5, 10, 0, 1.2), prop('mast', -5, 30, 0, 1.2), prop('chest', 114, 42),
      ],
    },
    {
      // The finale: Davy Jones' locker. Up the plank onto the wreck's deck,
      // off the deck into the bay where the whirlpool turns, up the cliff
      // ramp or through the sea cave, along the beach and up the last ramp
      // onto the treasure. The mast cannon on the deck fires clean over the
      // bay and the cliff onto the beach.
      name: "Davy Jones' Locker",
      par: 6,
      tip: 'Plank, deck, bay, cliff or cave, beach, treasure. The mast cannon flies the bay.',
      tee: { x: 5, y: 7 },
      cup: { x: 28, y: 66 },
      floor: [R(0, 0, 40, 14), R(60, 0, 60, 50), R(40, 0, 60, 14, 2.5), R(60, 50, 60, 20, 3), R(40, 70, 80, 20), R(20, 60, 20, 30, 2.5)],
      zones: [
        slopeTo(30, 0, 10, 14, 180, 2.5), cannon(92, 8, 6, 6, 0, 46, 24), magnet(64, 20, 24, 24, 12), water(74, 30, 4, 4),
        tunnel(96, 50, 6, 20), slopeTo(108, 40, 8, 10, 270, 3), sand(96, 70, 6, 4), slopeTo(40, 74, 10, 10, 0, 2.5),
        sand(100, 20, 4, 10), sand(70, 76, 6, 10), sand(22, 78, 6, 4),
      ],
      blocks: [
        polyRect(107, 39, 1, 1), polyRect(116, 39, 1, 1), polyRect(50, 73, 1, 1), polyRect(50, 84, 1, 1),
        barrel(56, 4, 1.4), barrel(72, 7, 1.4), barrel(84, 3, 1.3), crate(62, 8, 3, 3), rock(70, 56, 2), rock(110, 60, 2.2), skull(84, 62, 3),
        chest(22, 84, 4, 3), chest(34, 62, 4, 3), barrel(110, 76, 1.4), crate(60, 84, 4, 4),
      ],
      bumpers: [post(20, 4, 0.5), post(92, 30, 0.6), post(116, 10, 0.5), post(90, 80, 0.5), post(36, 76, 0.5), post(30, 88, 0.4)],
      props: [
        prop('anchor', -4, 7, 90), prop('palm', -5, 18, 0, 1.2), prop('mast', 70, -5, 0, 1.6), prop('mast', 90, -5, 0, 1.4),
        prop('rock', 124, 20, 0, 1.4), prop('rock', 124, 50, 0, 1.6), prop('skull', 124, 74), prop('palm', 124, 86, 0, 1.3),
        prop('chest', 12, 66), prop('skull', 12, 82), prop('palm', 30, 94, 0, 1.4), prop('barrel', 50, 26), prop('crate', 50, 40, 20),
        prop('rock', 50, 60, 0, 1.3),
      ],
    },
  ],
};
