// The built-in course library: one file per course under `library/`.
// Every hole is verified by `npm run check-courses` (spacetimedb/scripts) —
// see .claude/course-guidelines.md for how a hole is judged and how to
// build one that passes.
import type { Course } from './courses';
import { BANK } from './library/bank';
import { CLOCKWORK } from './library/clockwork';
import { RIDGE } from './library/ridge';
import { MACHINE } from './library/machine';
import { FROST } from './library/frost';
import { GRAND } from './library/grand';
import { GALAXY } from './library/galaxy';
import { HAIRPIN } from './library/hairpin';
import { LABYRINTH } from './library/labyrinth';
import { TERRACES } from './library/terraces';
import { ROOFTOPS } from './library/rooftops';
import { MILLPOND } from './library/millpond';
import { PINBALL } from './library/pinball';
import { ASTEROIDS } from './library/asteroids';
import { CROSSROADS } from './library/crossroads';

export { BANK, CLOCKWORK, RIDGE, MACHINE, FROST, GRAND, GALAXY, HAIRPIN, LABYRINTH, TERRACES, ROOFTOPS, MILLPOND, PINBALL, ASTEROIDS, CROSSROADS };
/** The launch nine. */
export const LAUNCH: Course[] = [BANK, CLOCKWORK, RIDGE, MACHINE, FROST, GRAND, GALAXY, HAIRPIN, LABYRINTH];
/** The expansion set (six courses, every hole a fork). */
export const EXPANSION: Course[] = [TERRACES, ROOFTOPS, MILLPOND, PINBALL, ASTEROIDS, CROSSROADS];
/** Every library course, in picker order. */
export const LIBRARY: Course[] = [...LAUNCH, ...EXPANSION];
