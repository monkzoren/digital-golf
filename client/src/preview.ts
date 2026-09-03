// A server-free look at any built-in hole on the 3D stage — for theme and
// material work (and headless screenshots) without a SpacetimeDB running.
//
//   /preview.html?course=Galaxy&hole=3&cam=play&look=0.6
//
// `course` matches a course name (substring), `hole` is 1-based, `cam` is
// 'play' (behind the ball on the tee), 'overview' or 'cup'; `look` orbits the
// free-look camera by that many radians. `?theme=space` overrides the hole's
// theme; `pitch` tilts it. The page sets `window.previewReady` once the
// first frames are drawn.
import { COURSES } from '@shared/courses';
import { LIBRARY } from '@shared/library';
import { drawScene, initRenderer, orbitLook, type GolfScene } from './render3d';

const q = new URLSearchParams(location.search);
const all = [...COURSES, ...LIBRARY];
const want = (q.get('course') ?? 'Galaxy').toLowerCase();
const course = all.find(c => c.name.toLowerCase().includes(want)) ?? all[0];
const hole = { ...course.holes[Math.max(0, Math.min(course.holes.length - 1, Number(q.get('hole') ?? 1) - 1))] };
hole.theme = q.get('theme') ?? hole.theme ?? course.theme;
const cam = (q.get('cam') ?? 'play') as GolfScene['cam'];
const look = Number(q.get('look') ?? 0);
const pitch = Number(q.get('pitch') ?? 0);

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
initRenderer(canvas);

const scene: GolfScene = {
  hole, holeKey: `preview:${course.id}:${hole.name}`, t: 0, players: [{
    id: 'me', name: 'Preview', characterId: 0, color: 0xffd60a, x: hole.tee.x, y: hole.tee.y, z: 0, vx: 0, vy: 0,
    resting: true, holed: false, ghost: false, me: true, facing: Math.atan2(hole.cup.y - hole.tee.y, hole.cup.x - hole.tee.x),
    seat: 0, shotSeq: 0, shotPower: 0,
  }],
  aim: null, cam, meId: 'me',
};
const t0 = performance.now();
let frames = 0;
function frame() {
  scene.t = (performance.now() - t0) / 1000;
  drawScene(scene);
  if (++frames === 2 && (look || pitch)) orbitLook(look, pitch); // after the hole is built (building resets the look)
  if (frames === 8) (window as any).previewReady = true;
  requestAnimationFrame(frame);
}
frame();
