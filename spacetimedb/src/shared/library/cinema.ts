// Built-in course. See .claude/course-guidelines.md before editing.
import {
  type Course, R, polyRect, polyNgon, polyStar,
  bumper, post, windmill, slider, pendulum, laser, rubber, prop, dress,
  sand, ice, water, slope, slopeTo, boost, jump, tele, conveyor, spinner, fan, trampoline, magnet, cannon, gfield, tunnel,
} from '../courses';
import { tri, low, mirrorTR, corner, star, open, lowRail, pond } from '../pieces';

// ---------------------------------------------------------------------------
// SILVER SCREEN — placeholder, replaced by the course build.
// ---------------------------------------------------------------------------
export const CINEMA: Course = {
  id: 18,
  name: 'Silver Screen',
  theme: 'cinema',
  holes: [
    {
      name: 'Placeholder',
      par: 2,
      tip: 'Placeholder.',
      tee: { x: 4, y: 5 },
      cup: { x: 56, y: 5 },
      floor: [R(0, 0, 60, 10)],
      zones: [sand(30, 2, 4, 6)],
      bumpers: [post(45, 3, 0.5)],
    },
  ],
};
