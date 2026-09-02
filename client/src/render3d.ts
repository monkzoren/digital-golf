import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CHARACTERS, type Character, type HairStyle } from './characters';
import { getGraphics, onGraphicsChange, type GraphicsSettings } from './graphics';
import type { Hole, Zone, Block, Rect } from '@shared/courses';
import { holeBounds, motionAngle, moverActive, rampFrac } from '@shared/courses';
import { BALL_R, CUP_R, geomOf, groundZ, rampRise, zonePower } from '@shared/physics';

// ---------------------------------------------------------------------------
// Real-3D Virtua Tennis-style renderer (Three.js / WebGL), inherited from
// Digital Tennis: the same lighting, character rigs and body builder — with
// the court swapped for a minigolf hole on an open lawn (the stadium bowl is
// gone: it could not hold a big course). The whole hole (felt, walls,
// hazards, movers) is built as meshes once per hole; the balls and the
// golfers are pooled and repositioned every frame.
//
// Golf world coords: x right, y DOWN (the 2D course format), z up.
// Three.js coords:   (x - cx, z, y - cy) — the hole is centred on the
// lawn; the camera sits behind the local ball looking down the line.
// ---------------------------------------------------------------------------

/** One golfer as the client sees them (built from the player row). */
export interface GolfPlayer {
  id: string; // identity hex — stable key for the rig/ball pools
  name: string;
  characterId: number;
  color: number; // ball colour (hex)
  x: number; // ball, golf world
  y: number;
  z: number;
  vx: number;
  vy: number;
  resting: boolean;
  holed: boolean;
  ghost: boolean; // still on the tee (drawn translucent)
  me: boolean;
  /** shot direction the golfer is set up for (radians, golf world) */
  facing: number;
  /** join order — alternates which side of the ball the golfer stands on */
  seat: number;
  /** bumps on each stroke — starts the putt animation */
  shotSeq: number;
  shotPower: number;
  emote?: string;
}

export interface GolfScene {
  hole: Hole | null;
  holeKey: string; // change = rebuild the hole meshes
  t: number; // seconds since the hole went live (drives movers)
  players: GolfPlayer[];
  /** local aim in progress: angle (golf world radians), power 0..1. No
   *  trajectory preview — reading the bounces is the player's skill.
   *  `lockCam`: a mouse drag is in progress, so the camera must not swing
   *  under the pointer (it would change the aim it is being read from). */
  aim: { angle: number; power: number; lockCam?: boolean } | null;
  /** 'play' behind the local ball · 'overview' whole hole · 'cup' slow orbit */
  cam: 'play' | 'overview' | 'cup';
  /** the local player's id (camera follows their ball) */
  meId: string | null;
}

// Stereo position for a sound at three x (camera looks down -z).
const panOf = (x: number) => Math.max(-1, Math.min(1, x / 45));

// The lawn is open ground: no stands, so a hole of any size fits. It runs
// to the fog (and well past it), so any camera angle lands on grass.
const GROUND_R = 1500; // half-size of the ground plane
const GROUND_TILE = 120; // the grass texture repeats every this many units

const COLORS = {
  sky: 0xbcd8ee,
  netPost: 0x2e4a2e,
  shorts: 0xf5f5f5,
  skin: 0xe8ae7e,
  hair: 0x3a2414,
  shoe: 0xffffff,
  ball: 0xd8f838,
};

// ---------------------------------------------------------------------------
// Materials are physically based: every surface is a MeshStandardMaterial
// lit by the sun plus a prefiltered sky environment (image-based lighting),
// so plastics, felt, wood and metal each read as their own stuff instead
// of one flat Lambert. `std` is the one constructor everything goes
// through — the default is a matte, non-metal surface (cloth, felt, paint).
// ---------------------------------------------------------------------------
const std = (p: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0, ...p });
/** Brushed metal: shafts, posts, rims. */
const metal = (p: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.9, ...p });
/** Glossy plastic / lacquer. */
const gloss = (p: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0, ...p });

// Sun direction shared by the key light, the sky's sun glow and the
// environment map, so specular highlights land where the shadows say.
const SUN_POS = new THREE.Vector3(-40, 70, 30);

let renderer: THREE.WebGLRenderer;
let scene3: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let sun: THREE.DirectionalLight;
let envTex: THREE.Texture | null = null; // PMREM sky, owned by `renderer`
// Post-processing chain: scene → ambient occlusion → bloom → tone map → SMAA.
let composer: EffectComposer | null = null;
let aoPass: GTAOPass | null = null;
let bloomPass: UnrealBloomPass | null = null;
let smaaPass: SMAAPass | null = null;
let hostCanvas: HTMLCanvasElement;
let gfx: GraphicsSettings = getGraphics();

// The canvas's CSS size, cached via ResizeObserver: reading clientWidth every
// frame forces a layout flush (DOM overlays are also written every frame),
// so per-frame consumers use this instead of touching layout.
let cssW = 0;
let cssH = 0;
let sizeObserver: ResizeObserver | null = null;

function observeCanvasSize() {
  cssW = hostCanvas.clientWidth;
  cssH = hostCanvas.clientHeight;
  sizeObserver?.disconnect();
  if (typeof ResizeObserver !== 'undefined') {
    sizeObserver = new ResizeObserver(() => {
      cssW = hostCanvas.clientWidth;
      cssH = hostCanvas.clientHeight;
    });
    sizeObserver.observe(hostCanvas);
  }
}

// The hole is centred on the lawn: (cx, cy) is the current hole's
// bounds centre in golf world units (set by setHole).
let holeCX = 0;
let holeCY = 0;
const FLOOR_Y = 0.3; // the felt sits this high on the grass
const toThree = (wx: number, wy: number, wz: number) =>
  new THREE.Vector3(wx - holeCX, FLOOR_Y + wz, wy - holeCY);

// ---------------------------------------------------------------------------
// JUICE: camera shake + particle bursts
// ---------------------------------------------------------------------------
// Dreamcast VT-style camera: a touch lower and wider, court filling the frame
const CAM_POS = new THREE.Vector3(0, 34, 84);
const CAM_TARGET = new THREE.Vector3(0, -3, -14);
let shakeAmp = 0;

export function addShake(strength: number) {
  shakeAmp = Math.min(2.2, shakeAmp + strength);
}

// Screen-space anchors for DOM overlays (name tags, emotes, chat bubbles):
// a point above a golfer's head / above their ball, in CSS pixels.
const headProj = new THREE.Vector3();
export function headScreenPos(playerId: string): { x: number; y: number } | null {
  if (!renderer || !camera) return null;
  const slot = rigByPlayer.get(playerId);
  if (slot === undefined) return null;
  const rig = playerRigs[slot];
  if (!rig || !rig.root.visible) return null;
  rig.head.getWorldPosition(headProj);
  headProj.y += 0.85;
  headProj.project(camera);
  if (headProj.z > 1) return null;
  return { x: (headProj.x * 0.5 + 0.5) * cssW, y: (-headProj.y * 0.5 + 0.5) * cssH };
}
export function ballScreenPos(playerId: string): { x: number; y: number } | null {
  if (!renderer || !camera) return null;
  const b = ballByPlayer.get(playerId);
  if (!b || !b.mesh.visible) return null;
  headProj.copy(b.mesh.position);
  headProj.y += BALL_R * 2.2;
  headProj.project(camera);
  if (headProj.z > 1) return null;
  return { x: (headProj.x * 0.5 + 0.5) * cssW, y: (-headProj.y * 0.5 + 0.5) * cssH };
}

/** The live canvas's CSS size, from the ResizeObserver cache (no layout
 *  read per frame). */
export function canvasCssSize(): { w: number; h: number } {
  return { w: cssW, h: cssH };
}

/** The camera's screen axes on the ground, in golf-world units: `r` is
 *  screen-right, `f` is screen-up (away from the camera). Drag aiming maps
 *  pointer deltas through this so a pull reads the same wherever the camera
 *  sits — and, frozen at pointer-down, stays put while the camera moves. */
export interface AimBasis { rx: number; ry: number; fx: number; fy: number }
export function cameraGroundBasis(): AimBasis {
  if (!camera) return { rx: 1, ry: 0, fx: 0, fy: -1 };
  const e = camera.matrixWorld.elements; // column-major: x axis 0..2, z axis 8..10
  let rx = e[0], ry = e[2];
  let l = Math.hypot(rx, ry) || 1;
  rx /= l; ry /= l;
  let fx = -e[8], fy = -e[10];
  l = Math.hypot(fx, fy) || 1;
  fx /= l; fy /= l;
  return { rx, ry, fx, fy };
}

/** True while transient FX (particles, camera shake) are still settling —
 *  lets an otherwise static scene stop re-rendering only once they're done. */
export function sceneIsAnimating(): boolean {
  if (shakeAmp > 0) return true;
  for (const p of particles) if (p.life > 0) return true;
  return false;
}

interface Particle {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  gravity: number;
}
const particles: Particle[] = [];

function initParticles() {
  if (!gfx.particles || particles.length) return;
  const geo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
  for (let i = 0; i < 220; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene3.add(mesh);
    particles.push({ mesh, mat, vel: new THREE.Vector3(), life: 0, maxLife: 1, gravity: -60 });
  }
}

function spawnBurst(
  pos: THREE.Vector3,
  color: number,
  count: number,
  speed: number,
  upBias = 0.5,
  gravity = -60
) {
  if (!gfx.particles) return;
  let spawned = 0;
  for (const p of particles) {
    if (spawned >= count) break;
    if (p.life > 0) continue;
    spawned++;
    p.mesh.visible = true;
    p.mesh.position.copy(pos);
    p.mat.color.setHex(color);
    p.mat.opacity = 1;
    p.maxLife = p.life = 0.25 + Math.random() * 0.35;
    p.gravity = gravity;
    const theta = Math.random() * Math.PI * 2;
    const up = Math.random() * upBias + (1 - upBias) * 0.3;
    p.vel.set(Math.cos(theta), up * 1.6, Math.sin(theta)).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
    const s = 0.5 + Math.random();
    p.mesh.scale.set(s, s, s);
  }
}

// Film grade: a touch punchier than the raw render. Paired with ACES tone
// mapping under the FILM GRADE switch; the VHS overlay is its own option.
const BASE_FILTER = 'saturate(1.08) contrast(1.06)';

function updateParticles(dt: number) {
  if (!gfx.particles) return;
  for (const p of particles) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.mesh.visible = false;
      continue;
    }
    p.vel.y += p.gravity * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    if (p.mesh.position.y < 0.1) {
      p.mesh.position.y = 0.1;
      p.vel.y = Math.abs(p.vel.y) * 0.4;
      p.vel.x *= 0.7;
      p.vel.z *= 0.7;
    }
    const k = p.life / p.maxLife;
    p.mat.opacity = k;
    p.mesh.rotation.x += dt * 9;
    p.mesh.rotation.y += dt * 7;
  }
}

// ---------------------------------------------------------------------------
// Player rig: articulated joints we pose procedurally every frame.
// ---------------------------------------------------------------------------
type SwingKind = 'putt';

interface Pose {
  twist: number; // upper body Y twist
  leanF: number; // forward lean
  leanS: number; // sideways lean
  thighL: number; calfL: number; thighR: number; calfR: number;
  shLx: number; shLz: number; elL: number;
  shRx: number; shRz: number; elR: number;
  yawOff: number; // extra facing rotation (turn toward ball)
  crouch: number; // root lowering for low balls / ready stance
}

const POSE_KEYS = [
  'twist', 'leanF', 'leanS', 'thighL', 'calfL', 'thighR', 'calfR',
  'shLx', 'shLz', 'elL', 'shRx', 'shRz', 'elR', 'yawOff', 'crouch',
] as const;

// Rotation convention: arms hang along -Y; NEGATIVE X rotation swings the
// arm forward (+Z in model space), positive swings it behind the body.
const ZERO_POSE: Pose = {
  twist: 0, leanF: 0, leanS: 0,
  thighL: 0, calfL: 0, thighR: 0, calfR: 0,
  shLx: -0.2, shLz: 0.1, elL: -0.45,
  shRx: -0.2, shRz: -0.1, elR: -0.45,
  yawOff: 0, crouch: 0,
};

interface PlayerRig {
  root: THREE.Group;
  upper: THREE.Group;
  thighL: THREE.Group; calfL: THREE.Group;
  thighR: THREE.Group; calfR: THREE.Group;
  // The skeleton is permanent; the visible body meshes inside each joint are
  // rebuilt per character by buildBody (banana body, corgi body, ...).
  torsoGroup: THREE.Group; // physique: scaled wider with the power stat
  hipGroup: THREE.Group; // shorts/skirt/tail; physique: lifted with leg length
  shoulderL: THREE.Group; elbowL: THREE.Group;
  shoulderR: THREE.Group; elbowR: THREE.Group;
  torsoMat: THREE.MeshStandardMaterial;
  sleeveMatL: THREE.MeshStandardMaterial;
  sleeveMatR: THREE.MeshStandardMaterial;
  skinMat: THREE.MeshStandardMaterial;
  headMat: THREE.MeshStandardMaterial;
  hairMat: THREE.MeshStandardMaterial;
  accentMat: THREE.MeshStandardMaterial;
  hairGroup: THREE.Group;
  charKey: string; // look currently dressed on this rig (see charLookKey)
  head: THREE.Mesh;
  pose: Pose;
  yaw: number; // current facing (blended toward movement / ball)
  runSeed: number;
  runPhase: number; // stride cycle, advanced by ground distance (not time)
  prevPX: number; // last frame's render position — measures that distance
  prevPZ: number;
  // animation state
  swingStart: number; // -1 = not swinging
  swingKind: SwingKind;
  swingLow: boolean;
  swingStretch: boolean; // reach-to-hit: full-body lean, no dive
  swingPower: number; // 0..1 from the outgoing ball speed
  swingMs: number; // stroke duration (power hits whip faster)
  windupStart: number; // when the button went down (coil deepens while held)
  contactPoint: THREE.Vector3 | null; // frozen ball position at the hit event
  prevSwingTicks: number;
  readyT: number; // 0..1 anticipation coil — peaks at the PERFECT press moment
  glintArmed: boolean; // one racket glint per approach, re-armed between shots
  // dive/roll state
  diveStart: number; // -1 = not diving
  diveDir: number; // roll/spin direction sign
  diveKind: number; // 0 short hop, 1 full dive, 2 huge layout
  diveMs: number;
  diveYaw: number; // world heading of the leap (head-first direction)
  diveFromX: number; // where the leap started (render space)
  diveFromZ: number;
  diveLanded: boolean;
  prevLunge: number;
}

const DIVE_MS = 800; // matches the server's lunge recovery window

// Piecewise channel evaluator with smoothstep easing between keys.
function ch(t: number, keys: [number, number][]): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1];
      const [t1, v1] = keys[i];
      const k = (t - t0) / (t1 - t0);
      const s = k * k * (3 - 2 * k);
      return v0 + (v1 - v0) * s;
    }
  }
  return keys[keys.length - 1][1];
}

// Authored dive keyframes. The body launches into a horizontal "superman"
// reach, lands, barrel-rolls around its own long axis (which can never clip
// the floor), and scrambles up.
function blendAngle(current: number, target: number, rate: number, dt: number): number {
  return current + wrapAngle(target - current) * (1 - Math.exp(-rate * dt));
}

function capsule(r: number, len: number, mat: THREE.Material, pivotTop = true): THREE.Mesh {
  const geo = new THREE.CapsuleGeometry(r, len, 4, 10);
  geo.translate(0, pivotTop ? -(len / 2 + r) : 0, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// Character look: canvas-painted textures + per-character body dressing.
// Textures are drawn in near-white/grayscale where the material color tints
// them (shirt, ball) and in true color where they carry it (face).
// ---------------------------------------------------------------------------
const cssHex = (n: number) => '#' + n.toString(16).padStart(6, '0');

const faceTexCache = new Map<string, THREE.CanvasTexture>();

// Face painted onto the head sphere: eyes, brows, mouth, cheek shading.
// The sphere's forward (+Z, the rig's facing) is at u=0.25.
function makeFaceTexture(char: Character): THREE.CanvasTexture {
  const faceKey = `${char.face ?? 'human'}|${char.skin}|${char.eyes}`;
  const cached = faceTexCache.get(faceKey);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = cssHex(char.skin);
  g.fillRect(0, 0, c.width, c.height);
  // top light and jaw shadow so the head reads as a form, not a flat ball
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, 'rgba(255,255,255,0.13)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  // skin grain
  for (let n = 0; n < 900; n++) {
    const s = Math.sin(n * 91.7) * 43758.5453;
    const r = s - Math.floor(s);
    const s2 = Math.sin(n * 271.3) * 12543.21;
    const r2 = s2 - Math.floor(s2);
    g.fillStyle = r > 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(80,40,20,0.03)';
    g.fillRect(r * c.width, r2 * c.height, 2, 2);
  }
  const cx = c.width * 0.25;
  const eyeY = 122;
  const face = char.face ?? 'human';

  if (face === 'robot') {
    // one dark visor band with two glowing LED eyes and a speaker mouth
    g.fillStyle = 'rgba(12,14,20,0.92)';
    g.beginPath();
    g.roundRect(cx - 62, eyeY - 19, 124, 38, 12);
    g.fill();
    for (const s of [-1, 1]) {
      g.fillStyle = char.eyes;
      g.shadowColor = char.eyes;
      g.shadowBlur = 10;
      g.beginPath();
      g.roundRect(cx + s * 30 - 9, eyeY - 8, 18, 16, 4);
      g.fill();
      g.shadowBlur = 0;
    }
    g.fillStyle = 'rgba(12,14,20,0.85)';
    for (const dx of [-12, -4, 4, 12]) g.fillRect(cx + dx - 2, 172, 4, 16);
    // panel seams + rivets
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 2;
    g.strokeRect(cx - 78, 60, 156, 150);
    g.fillStyle = 'rgba(0,0,0,0.4)';
    for (const [rx, ry] of [[-70, 68], [70, 68], [-70, 200], [70, 200]] as const) {
      g.beginPath();
      g.arc(cx + rx, ry, 3, 0, Math.PI * 2);
      g.fill();
    }
  } else if (face === 'toon') {
    // huge glossy cartoon eyes (alien / octopus / yeti), no whites, no brows
    for (const s of [-1, 1]) {
      const ex = cx + s * 32;
      g.fillStyle = '#101010';
      g.beginPath();
      g.ellipse(ex, eyeY, 16, 22, s * 0.15, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = char.eyes === '#0c0c0c' || char.eyes === '#101010' ? '#101010' : char.eyes;
      g.beginPath();
      g.ellipse(ex, eyeY + 3, 10, 14, s * 0.15, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.92)';
      g.beginPath();
      g.arc(ex - s * 4, eyeY - 7, 4.2, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(ex + s * 3, eyeY + 8, 1.8, 0, Math.PI * 2);
      g.fill();
    }
    // tiny content mouth
    g.strokeStyle = 'rgba(30,20,20,0.8)';
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx - 8, 182);
    g.quadraticCurveTo(cx, 188, cx + 8, 182);
    g.stroke();
  } else if (face === 'snout') {
    // dog face: light muzzle patch, round eyes, big nose, happy open mouth
    g.fillStyle = 'rgba(255,250,238,0.9)';
    g.beginPath();
    g.ellipse(cx, 172, 46, 40, 0, 0, Math.PI * 2);
    g.fill();
    // blaze up the forehead
    g.beginPath();
    g.ellipse(cx, 100, 14, 42, 0, 0, Math.PI * 2);
    g.fill();
    for (const s of [-1, 1]) {
      const ex = cx + s * 33;
      g.fillStyle = '#181008';
      g.beginPath();
      g.arc(ex, eyeY - 6, 7.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.beginPath();
      g.arc(ex - s * 2, eyeY - 9, 2.4, 0, Math.PI * 2);
      g.fill();
    }
    // nose
    g.fillStyle = '#181210';
    g.beginPath();
    g.ellipse(cx, 156, 12, 9, 0, 0, Math.PI * 2);
    g.fill();
    // mouth: the classic dog "w" + tongue
    g.strokeStyle = 'rgba(40,24,14,0.85)';
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx, 158);
    g.lineTo(cx, 172);
    g.quadraticCurveTo(cx - 12, 184, cx - 22, 174);
    g.moveTo(cx, 172);
    g.quadraticCurveTo(cx + 12, 184, cx + 22, 174);
    g.stroke();
    g.fillStyle = '#e0656e';
    g.beginPath();
    g.ellipse(cx, 190, 9, 12, 0, 0, Math.PI);
    g.fill();
  } else {
    // human base (also under fangs / patch / specs accessories)
    for (const s of [-1, 1]) {
      const ex = cx + s * 30;
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.ellipse(ex, eyeY, 13, 8.5, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = char.eyes;
      g.beginPath();
      g.arc(ex + s * 1.5, eyeY, 5.6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#101010';
      g.beginPath();
      g.arc(ex + s * 1.5, eyeY, 2.6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.beginPath();
      g.arc(ex + s * 1.5 - 1.6, eyeY - 1.8, 1.3, 0, Math.PI * 2);
      g.fill();
      // upper lid crease
      g.strokeStyle = 'rgba(60,30,15,0.5)';
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(ex, eyeY, 13, 8.5, 0, Math.PI, Math.PI * 2);
      g.stroke();
      // brow in the hair color
      g.strokeStyle = cssHex(char.hair);
      g.lineWidth = 5;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(ex - s * 13, eyeY - 15);
      g.quadraticCurveTo(ex, eyeY - 22, ex + s * 13, eyeY - 16);
      g.stroke();
    }
    // cheek warmth
    g.fillStyle = 'rgba(220,90,70,0.10)';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(cx + s * 42, 158, 14, 9, 0, 0, Math.PI * 2);
      g.fill();
    }
    if (face === 'fangs') {
      // open grin with two fangs — pale lips, red gleam in the smile
      g.fillStyle = 'rgba(60,10,20,0.9)';
      g.beginPath();
      g.moveTo(cx - 20, 178);
      g.quadraticCurveTo(cx, 196, cx + 20, 178);
      g.quadraticCurveTo(cx, 186, cx - 20, 178);
      g.fill();
      g.fillStyle = '#f4f6f8';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(cx + s * 13 - 3, 180);
        g.lineTo(cx + s * 13 + 3, 180);
        g.lineTo(cx + s * 13, 192);
        g.closePath();
        g.fill();
      }
    } else {
      // mouth
      g.strokeStyle = 'rgba(120,50,40,0.85)';
      g.lineWidth = 4;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx - 16, 180);
      g.quadraticCurveTo(cx, 190, cx + 16, 180);
      g.stroke();
    }
    if (face === 'patch') {
      // eyepatch over the left eye, strap wrapping the head band
      g.strokeStyle = 'rgba(14,12,10,0.92)';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(0, 118);
      g.lineTo(cx - 44, 108);
      g.moveTo(cx - 18, 104);
      g.lineTo(c.width * 0.75, 92);
      g.stroke();
      g.fillStyle = 'rgba(14,12,10,0.95)';
      g.beginPath();
      g.ellipse(cx - 30, eyeY, 17, 14, -0.12, 0, Math.PI * 2);
      g.fill();
    }
    if (face === 'specs') {
      // round granny glasses + chain hint
      g.strokeStyle = 'rgba(40,44,52,0.9)';
      g.lineWidth = 3.5;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.arc(cx + s * 30, eyeY, 17, 0, Math.PI * 2);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(cx - 13, eyeY - 3);
      g.quadraticCurveTo(cx, eyeY - 8, cx + 13, eyeY - 3);
      g.stroke();
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx - 47, eyeY + 4);
      g.quadraticCurveTo(cx - 62, eyeY + 26, cx - 70, eyeY + 20);
      g.moveTo(cx + 47, eyeY + 4);
      g.quadraticCurveTo(cx + 62, eyeY + 26, cx + 70, eyeY + 20);
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  faceTexCache.set(faceKey, tex);
  return tex;
}

const shirtTexCache = new Map<number, THREE.CanvasTexture>();

// Kit shirt for the torso lathe, drawn near-white so the material color
// tints it with the character color. u=0 is the front seam, u=0.5 the back
// (where the squad number goes); v=1 is the collar end.
function makeShirtTexture(id: number): THREE.CanvasTexture {
  const cached = shirtTexCache.get(id);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e2e2e2';
  g.fillRect(0, 0, c.width, c.height);
  // lit from above: bright shoulders fading toward the hem
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, 'rgba(255,255,255,0.20)');
  grad.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  // underarm / side shading at u=0.25 and u=0.75
  for (const ux of [0.25, 0.75]) {
    const gx = g.createLinearGradient((ux - 0.12) * c.width, 0, (ux + 0.12) * c.width, 0);
    gx.addColorStop(0, 'rgba(0,0,0,0)');
    gx.addColorStop(0.5, 'rgba(0,0,0,0.17)');
    gx.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gx;
    g.fillRect((ux - 0.12) * c.width, 0, 0.24 * c.width, c.height);
  }
  // fabric weave
  for (let n = 0; n < 1400; n++) {
    const s = Math.sin(n * 127.1) * 43758.5453;
    const r = s - Math.floor(s);
    const s2 = Math.sin(n * 311.7) * 12543.21;
    const r2 = s2 - Math.floor(s2);
    g.fillStyle = r > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';
    g.fillRect(r * c.width, r2 * c.height, 2, 1);
  }
  // wrinkle hints above the hem
  g.strokeStyle = 'rgba(0,0,0,0.07)';
  g.lineWidth = 3;
  for (const [wx, wy, ww] of [[60, 214, 90], [230, 226, 120], [400, 210, 80]] as const) {
    g.beginPath();
    g.moveTo(wx, wy);
    g.quadraticCurveTo(wx + ww / 2, wy + 8, wx + ww, wy - 2);
    g.stroke();
  }
  // collar band + front placket at the u=0 seam
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, 16);
  g.fillRect(0, 0, 7, 110);
  g.fillRect(c.width - 7, 0, 7, 110);
  // squad number on the back — dark, since the tint caps how bright white
  // can get and a light number would wash out against the kit color
  g.font = '900 92px "Arial Black", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(15,15,25,0.62)';
  g.fillText(String(id === 255 ? 99 : id + 1), c.width * 0.5, 96);
  // hem shadow
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, c.height - 6, c.width, 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  shirtTexCache.set(id, tex);
  return tex;
}

// Felt tennis ball with the classic curved seam, drawn near-white so the
// material color keeps providing the yellow (and screw-shot purple) tint.
function makeBallTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4f4ec';
  g.fillRect(0, 0, c.width, c.height);
  for (let n = 0; n < 1200; n++) {
    const s = Math.sin(n * 127.1) * 43758.5453;
    const r = s - Math.floor(s);
    const s2 = Math.sin(n * 311.7) * 12543.21;
    const r2 = s2 - Math.floor(s2);
    g.fillStyle = r > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(90,90,60,0.05)';
    g.fillRect(r * c.width, r2 * c.height, 2, 2);
  }
  const seam = (color: string, w: number) => {
    g.strokeStyle = color;
    g.lineWidth = w;
    g.lineJoin = 'round';
    g.beginPath();
    for (let x = 0; x <= c.width; x += 4) {
      const y = 64 + Math.sin((x / c.width) * Math.PI * 4) * 30;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  };
  seam('rgba(110,110,95,0.45)', 9); // fuzzy seam shadow
  seam('#ffffff', 3.5);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Human torso silhouette: waist → chest → shoulders, lathed and squashed
// front-to-back into an elliptical cross-section.
function makeTorsoGeometry(): THREE.BufferGeometry {
  const profile: [number, number][] = [
    [0.20, -0.10],
    [0.60, 0.02],
    [0.64, 0.38],
    [0.76, 0.88],
    [0.80, 1.28],
    [0.64, 1.56],
    [0.28, 1.72],
  ];
  const geo = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    20
  );
  geo.scale(1.08, 1, 0.66);
  return geo;
}

// Rebuild the hair meshes for a character's style (parented to the head so
// ball-watching reads through the hair too).
function buildHair(grp: THREE.Group, mat: THREE.MeshStandardMaterial, style: HairStyle) {
  for (const child of [...grp.children]) {
    grp.remove(child);
    (child as THREE.Mesh).geometry?.dispose();
  }
  const add = (geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, 0, rz);
    m.castShadow = true;
    grp.add(m);
    return m;
  };
  // caps are tilted back so the hairline sits above the brows in front and
  // drops to the nape behind
  const cap = (r: number, cover: number, y: number, tilt = -0.35) =>
    add(new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI * cover), 0, y, 0, tilt);
  switch (style) {
    case 'buzz':
      cap(0.615, 0.46, 0.05, -0.3);
      break;
    case 'spiky': {
      cap(0.63, 0.5, 0.04);
      const spike = () => new THREE.ConeGeometry(0.16, 0.45, 6);
      add(spike(), 0, 0.68, 0.05, -0.15, 0);
      add(spike(), 0.27, 0.58, 0.12, -0.25, -0.55);
      add(spike(), -0.27, 0.58, 0.12, -0.25, 0.55);
      add(spike(), 0.17, 0.6, -0.24, 0.6, -0.3);
      add(spike(), -0.17, 0.6, -0.24, 0.6, 0.3);
      break;
    }
    case 'ponytail': {
      cap(0.64, 0.55, 0.04, -0.4);
      add(new THREE.SphereGeometry(0.16, 10, 8), 0, 0.34, -0.52); // bun
      const tail = capsule(0.115, 0.5, mat); // pivot-top: hangs from the bun
      tail.position.set(0, 0.3, -0.56);
      tail.rotation.x = 0.55;
      grp.add(tail);
      break;
    }
    case 'bob':
      cap(0.65, 0.5, 0.03);
      // back + side shell leaving the face open (face is at phi=π/2)
      add(
        new THREE.SphereGeometry(0.65, 18, 12, Math.PI * 0.85, Math.PI * 1.3, 0, Math.PI * 0.68),
        0, 0.02, 0
      );
      break;
    // ---- wacky roster ---------------------------------------------------
    case 'peel': {
      // banana: a stem on top and four peel flaps curling out and down
      cap(0.63, 0.4, 0.05, -0.2);
      add(new THREE.CylinderGeometry(0.06, 0.09, 0.3, 8), 0, 0.72, 0);
      for (const a of [0.5, 2.1, -2.1, -0.5]) {
        add(
          new THREE.ConeGeometry(0.17, 0.52, 8),
          Math.sin(a) * 0.42, 0.5, Math.cos(a) * 0.42,
          Math.cos(a) * 1.25, -Math.sin(a) * 1.25
        );
      }
      break;
    }
    case 'corgi': {
      // fur cap + two big upright triangular ears
      cap(0.63, 0.42, 0.05, -0.25);
      add(new THREE.ConeGeometry(0.2, 0.46, 4), 0.34, 0.6, -0.02, -0.1, -0.35);
      add(new THREE.ConeGeometry(0.2, 0.46, 4), -0.34, 0.6, -0.02, -0.1, 0.35);
      break;
    }
    case 'antenna': {
      // robot: dome plate, boingy antenna, side bolts over the ears
      cap(0.62, 0.32, 0.1, -0.2);
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.4, 6), 0, 0.78, 0);
      add(new THREE.SphereGeometry(0.08, 8, 8), 0, 1.0, 0);
      for (const s of [-1, 1]) {
        const bolt = add(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 8), s * 0.63, 0.02, 0);
        bolt.rotation.z = Math.PI / 2;
      }
      break;
    }
    case 'antennae': {
      // alien: two stalks with glowing-ish bobble tips
      for (const s of [-1, 1]) {
        add(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 6), s * 0.2, 0.72, 0, 0, -s * 0.45);
        add(new THREE.SphereGeometry(0.09, 8, 8), s * 0.36, 0.92, 0);
      }
      break;
    }
    case 'slick': {
      // slicked-back vampire do with a widow's peak on the forehead
      cap(0.62, 0.48, 0.05, -0.28);
      add(new THREE.ConeGeometry(0.13, 0.32, 3), 0, 0.36, 0.5, 2.7, 0);
      break;
    }
    case 'tricorn': {
      // pirate hat: wide brim + rounded crown, tipped back
      cap(0.62, 0.35, 0.06, -0.2);
      add(new THREE.CylinderGeometry(0.72, 0.72, 0.07, 18), 0, 0.34, 0, -0.12, 0);
      add(new THREE.SphereGeometry(0.52, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), 0, 0.34, 0, -0.12, 0);
      break;
    }
    case 'shag': {
      // yeti: oversized shaggy dome with tufts sticking out everywhere
      cap(0.68, 0.62, 0.0, -0.15);
      for (const [x, y, z] of [
        [0.4, 0.35, 0.3], [-0.4, 0.35, 0.3], [0.45, 0.3, -0.3],
        [-0.45, 0.3, -0.3], [0, 0.4, -0.45], [0, 0.66, 0.15],
      ] as const) {
        add(new THREE.SphereGeometry(0.16, 8, 6), x, y, z);
      }
      break;
    }
    case 'bun': {
      cap(0.63, 0.5, 0.04, -0.3);
      add(new THREE.SphereGeometry(0.19, 10, 8), 0, 0.62, -0.18);
      break;
    }
    case 'afro': {
      const fro = add(new THREE.SphereGeometry(0.62, 18, 14), 0, 0.34, -0.06);
      fro.scale.set(1.15, 1.0, 1.05);
      break;
    }
    case 'tentacles': {
      // octopus: mantle cap + tentacles hanging around the sides and back
      cap(0.64, 0.5, 0.03, -0.2);
      for (const a of [1.2, -1.2, 2.0, -2.0, 2.9, -2.9]) {
        const tent = capsule(0.09, 0.42, mat); // pivot-top: hangs like the ponytail
        tent.position.set(Math.sin(a) * 0.5, 0.28, Math.cos(a) * 0.5);
        tent.rotation.set(Math.cos(a) * 0.55, 0, -Math.sin(a) * 0.55);
        grp.add(tent);
      }
      break;
    }
    case 'flower': {
      // cactus: no hair, just the classic little flower on top
      add(new THREE.SphereGeometry(0.09, 8, 8), 0, 0.7, 0);
      for (const k of [0.4, 1.65, 2.9, 4.15, 5.4]) {
        add(new THREE.SphereGeometry(0.075, 8, 6), Math.sin(k) * 0.15, 0.72, Math.cos(k) * 0.15);
      }
      break;
    }
    case 'wizard': {
      // pointy hat with a brim, plus a long beard hanging under the chin
      add(new THREE.CylinderGeometry(0.78, 0.78, 0.06, 18), 0, 0.3, 0, -0.15, 0);
      add(new THREE.ConeGeometry(0.5, 0.95, 14), 0, 0.76, -0.05, -0.15, 0.06);
      add(new THREE.ConeGeometry(0.26, 0.62, 8), 0, -0.5, 0.3, Math.PI, 0);
      break;
    }
    default:
      cap(0.63, 0.52, 0.06);
  }
}

// One string per distinct LOOK. Roster characters key on their id alone;
// career pros share id 255 but differ per player (and per edit), so the key
// folds in every field the dressing below actually reads — colors, hair,
// face, body, and the physique-shaping stat pips.
function charLookKey(char: Character): string {
  return [
    char.id, char.color, char.skin, char.hair, char.hairStyle,
    char.face ?? '', char.body ?? '',
    char.physique?.legs ?? 1, char.physique?.arms ?? 1, char.physique?.bulk ?? 1,
    char.stats.speed, char.stats.reach, char.stats.power,
  ].join('|');
}

// Dress a rig as a character: kit colors, skin tone, face, hair, body.
function applyCharacter(rig: PlayerRig, char: Character) {
  const key = charLookKey(char);
  if (rig.charKey === key) return;
  rig.charKey = key;
  rig.torsoMat.color.setHex(char.color);
  rig.torsoMat.map = makeShirtTexture(char.id);
  rig.torsoMat.needsUpdate = true;
  rig.sleeveMatL.color.setHex(char.color);
  rig.sleeveMatR.color.setHex(char.color);
  rig.accentMat.color.setHex(char.color);
  rig.skinMat.color.setHex(char.skin);
  rig.headMat.map = makeFaceTexture(char);
  rig.headMat.needsUpdate = true;
  rig.hairMat.color.setHex(char.hair);
  buildBody(rig, char);
  buildHair(rig.hairGroup, rig.hairMat, char.hairStyle);
  applyPhysique(rig, char);
}

// Body proportions mirror the stat sheet, so you can read an athlete at a
// glance: speed = longer legs, reach = longer arms (racket grows with
// them), power = broader torso and wider shoulders. Limbs get UNIFORM
// scales — their child joints rotate, and a non-uniform parent scale would
// shear a bent elbow/knee.
const HIP_Y = 2.25; // matches the thigh pivot height in makePlayerRig
function applyPhysique(rig: PlayerRig, char: Character) {
  const s = char.stats;
  // per-character overrides on top of the stat-derived shape (corgi legs,
  // octopus arms, yeti bulk — see Character.physique)
  const o = char.physique;
  const legK = (1 + (s.speed - 3) * 0.05) * (o?.legs ?? 1); // 0.90 (VOLT) … 1.10 (KAI)
  const armK = (1 + (s.reach - 3) * 0.06) * (o?.arms ?? 1); // 0.88 (KAI/ROSA) … 1.12 (VOLT)
  const bulkK = (1 + (s.power - 3) * 0.05) * (o?.bulk ?? 1); // 0.90 (KAI) … 1.10 (BLAZE)

  // legs: scale the whole chain and raise the hips so the feet stay on
  // the floor — everything above rides up with them
  rig.thighL.scale.setScalar(legK);
  rig.thighR.scale.setScalar(legK);
  rig.thighL.position.y = HIP_Y * legK;
  rig.thighR.position.y = HIP_Y * legK;
  const lift = HIP_Y * (legK - 1);
  rig.hipGroup.position.y = lift;
  rig.upper.position.y = 2.62 + lift;

  // arms: longer AND proportionally beefier (uniform), racket included
  rig.shoulderL.scale.setScalar(armK);
  rig.shoulderR.scale.setScalar(armK);

  // torso: power broadens the chest and pushes the shoulders out
  rig.torsoGroup.scale.set(bulkK, 1, 1 + (bulkK - 1) * 0.6);
  rig.shoulderL.position.x = -0.98 * bulkK;
  rig.shoulderR.position.x = 0.98 * bulkK;
}

// ---------------------------------------------------------------------------
// Body builds: the skeleton (joint groups + racket) is permanent, and every
// visible mesh hangs off a joint inside a wrapper group marked as a body
// part. Swapping characters strips those wrappers and rebuilds them, so a
// banana, a corgi and a robot all animate through the exact same joints.
// ---------------------------------------------------------------------------

// Shared static materials — per-character colors live on the rig's own mats.
const SHORTS_MAT = std({ color: COLORS.shorts });
const SHOE_MAT = std({ color: COLORS.shoe, roughness: 0.55 });
const SOLE_MAT = std({ color: 0x50525a, roughness: 0.95 });
const WHITE_MAT = std({ color: 0xf0f2f4 });
const WOOD_MAT = std({ color: 0x7a4a26 });
const DARK_MAT = std({ color: 0x23252d });
const METAL_MAT = metal({ color: 0xb8bcc4 });

function bodyPart(parent: THREE.Object3D): THREE.Group {
  const g = new THREE.Group();
  g.userData.bodyPart = true;
  parent.add(g);
  return g;
}

function clearBodyParts(rig: PlayerRig) {
  const joints = [
    rig.torsoGroup, rig.hipGroup, rig.head,
    rig.thighL, rig.thighR, rig.calfL, rig.calfR,
    rig.shoulderL, rig.shoulderR, rig.elbowL, rig.elbowR,
  ];
  for (const joint of joints) {
    for (const child of [...joint.children]) {
      if (!child.userData.bodyPart) continue;
      child.traverse(o => (o as THREE.Mesh).geometry?.dispose());
      joint.remove(child);
    }
  }
}

function padd(
  g: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material,
  x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  g.add(m);
  return m;
}

interface LegOpts {
  r: number; len: number; calfR: number; calfLen: number; mat: THREE.Material;
  hem?: THREE.Material; // shorts hem over the thigh
  sock?: THREE.Material;
  foot?: 'shoe' | 'paw' | 'ball' | 'box' | 'none';
  footMat?: THREE.Material;
  flare?: THREE.Material; // bell-bottom cone over the calf
  curl?: boolean; // tentacle tip curling forward instead of a foot
}
function stdLeg(rig: PlayerRig, right: boolean, o: LegOpts) {
  const thigh = bodyPart(right ? rig.thighR : rig.thighL);
  const calf = bodyPart(right ? rig.calfR : rig.calfL);
  thigh.add(capsule(o.r, o.len, o.mat));
  if (o.hem) padd(thigh, new THREE.CylinderGeometry(o.r + 0.06, o.r + 0.1, 0.55, 12), o.hem, 0, -0.38, 0);
  calf.add(capsule(o.calfR, o.calfLen, o.mat));
  const footY = -(o.calfLen + o.calfR + 0.15);
  if (o.sock) padd(calf, new THREE.CylinderGeometry(o.calfR + 0.015, o.calfR + 0.025, 0.42, 10), o.sock, 0, footY + 0.18, 0);
  if (o.flare) padd(calf, new THREE.CylinderGeometry(o.calfR + 0.03, o.calfR + 0.3, 0.85, 12), o.flare, 0, -0.48, 0);
  if (o.curl) padd(calf, new THREE.CapsuleGeometry(o.calfR * 0.75, 0.3, 4, 8), o.mat, 0, footY + 0.1, 0.16, 1.15, 0, 0);
  const fm = o.footMat ?? SHOE_MAT;
  switch (o.foot ?? 'shoe') {
    case 'shoe': {
      const shoe = new THREE.Group();
      shoe.position.set(0, footY, 0.14);
      const up = padd(shoe, new THREE.SphereGeometry(0.32, 14, 10), fm);
      up.scale.set(0.82, 0.55, 1.55);
      padd(shoe, new THREE.BoxGeometry(0.55, 0.09, 0.44), rig.accentMat, 0, 0, 0.05);
      padd(shoe, new THREE.BoxGeometry(0.5, 0.09, 0.95), SOLE_MAT, 0, -0.1, 0);
      calf.add(shoe);
      break;
    }
    case 'paw': {
      const paw = padd(calf, new THREE.SphereGeometry(0.3, 12, 9), fm, 0, footY + 0.04, 0.12);
      paw.scale.set(0.9, 0.55, 1.35);
      break;
    }
    case 'ball': {
      const b = padd(calf, new THREE.SphereGeometry(0.32, 12, 9), fm, 0, footY + 0.04, 0.1);
      b.scale.set(1, 0.6, 1.5);
      break;
    }
    case 'box':
      padd(calf, new THREE.BoxGeometry(0.46, 0.24, 0.85), fm, 0, footY + 0.02, 0.14);
      break;
  }
}

interface ArmOpts {
  sleeve?: { r: number; len: number } | null; // null = bare (no kit sleeve)
  r: number; len: number; foreR: number; foreLen: number; mat: THREE.Material;
  wrist?: THREE.Material | null; // null = no wristband
  hand?: 'ball' | 'paw' | 'hook' | 'none';
  handR?: number; handMat?: THREE.Material;
  cuff?: THREE.Material; // wide flared sleeve cuff over the forearm (wizard)
}
function stdArm(rig: PlayerRig, right: boolean, o: ArmOpts) {
  const sh = bodyPart(right ? rig.shoulderR : rig.shoulderL);
  const el = bodyPart(right ? rig.elbowR : rig.elbowL);
  const sleeveMat = right ? rig.sleeveMatR : rig.sleeveMatL;
  if (o.sleeve !== null) {
    const s = o.sleeve ?? { r: 0.21, len: 0.28 };
    sh.add(capsule(s.r, s.len, sleeveMat));
  }
  const ua = capsule(o.r, o.len, o.mat);
  ua.position.y = -0.18;
  sh.add(ua);
  el.add(capsule(o.foreR, o.foreLen, o.mat));
  const handY = -(o.foreLen + o.foreR + 0.22);
  if (o.wrist !== null) {
    padd(el, new THREE.CylinderGeometry(o.foreR + 0.015, o.foreR + 0.015, 0.14, 10), o.wrist ?? SHOE_MAT, 0, handY + 0.14, 0);
  }
  if (o.cuff) padd(el, new THREE.CylinderGeometry(o.foreR + 0.02, o.foreR + 0.22, 0.55, 12), o.cuff, 0, -0.5, 0);
  const hm = o.handMat ?? o.mat;
  switch (o.hand ?? 'ball') {
    case 'ball':
      padd(el, new THREE.SphereGeometry(o.handR ?? 0.17, 10, 8), hm, 0, handY, 0);
      break;
    case 'paw': {
      const p = padd(el, new THREE.SphereGeometry(o.handR ?? 0.19, 10, 8), WHITE_MAT, 0, handY, 0);
      p.scale.set(0.9, 1.1, 0.9);
      break;
    }
    case 'hook':
      padd(el, new THREE.CylinderGeometry(0.17, 0.15, 0.22, 10), DARK_MAT, 0, handY + 0.05, 0);
      padd(el, new THREE.TorusGeometry(0.14, 0.04, 8, 14, Math.PI * 1.55), METAL_MAT, 0, handY - 0.2, 0, 0, Math.PI / 2, 0);
      break;
  }
}

// Classic lathe torso + skin neck (worn by all the human-ish bodies).
function stdTorso(rig: PlayerRig) {
  const t = bodyPart(rig.torsoGroup);
  padd(t, makeTorsoGeometry(), rig.torsoMat);
  padd(t, new THREE.CylinderGeometry(0.2, 0.24, 0.34, 12), rig.skinMat, 0, 1.8, 0);
  return t;
}

function stdShorts(rig: PlayerRig, mat: THREE.Material = SHORTS_MAT) {
  const hp = bodyPart(rig.hipGroup);
  const shorts = padd(hp, new THREE.CylinderGeometry(0.66, 0.71, 0.8, 16), mat, 0, 2.28, 0);
  shorts.scale.set(1.1, 1, 0.76);
  const belt = padd(hp, new THREE.CylinderGeometry(0.7, 0.7, 0.14, 16), rig.accentMat, 0, 2.6, 0);
  belt.scale.set(1.1, 1, 0.76);
  return hp;
}

function humanHead(rig: PlayerRig, band = true) {
  const hd = bodyPart(rig.head);
  const nose = padd(hd, new THREE.SphereGeometry(0.085, 8, 8), rig.skinMat, 0, -0.04, 0.58);
  nose.scale.set(0.75, 1.1, 1);
  for (const s of [-1, 1]) {
    const ear = padd(hd, new THREE.SphereGeometry(0.11, 8, 8), rig.skinMat, s * 0.58, -0.02, -0.02);
    ear.scale.set(0.45, 0.9, 0.7);
  }
  if (band) padd(hd, new THREE.CylinderGeometry(0.645, 0.645, 0.13, 20), rig.accentMat, 0, 0.24, 0);
}

// Build a character's body onto the shared skeleton. Every case must dress
// all four limbs, the torso, and the hips — the skeleton starts bare.
function buildBody(rig: PlayerRig, char: Character) {
  clearBodyParts(rig);
  rig.head.scale.set(0.94, 1.06, 0.97); // default skull; bodies may override
  const skin = rig.skinMat, kit = rig.torsoMat, acc = rig.accentMat, hair = rig.hairMat;
  const sides: boolean[] = [false, true];
  switch (char.body ?? 'athlete') {
    case 'banana': {
      // the body IS the banana: fat curved middle tapering toward the head,
      // with a kit-color sash so the team still reads
      const t = bodyPart(rig.torsoGroup);
      const mid = padd(t, new THREE.CapsuleGeometry(0.58, 1.0, 6, 14), skin, 0, 0.8, 0.04, 0.14, 0, 0);
      mid.scale.set(0.94, 1, 0.78);
      padd(t, new THREE.ConeGeometry(0.4, 0.7, 12), skin, 0, 1.75, -0.08, -0.22, 0, 0);
      const sash = padd(t, new THREE.CylinderGeometry(0.63, 0.69, 0.35, 14), kit, 0, 0.5, 0.05, 0.14, 0, 0);
      sash.scale.set(0.95, 1, 0.8);
      const hp = bodyPart(rig.hipGroup);
      const briefs = padd(hp, new THREE.CylinderGeometry(0.52, 0.56, 0.6, 14), kit, 0, 2.35, 0);
      briefs.scale.set(1, 1, 0.8);
      for (const rt of sides) {
        stdLeg(rig, rt, { r: 0.15, len: 0.78, calfR: 0.12, calfLen: 0.72, mat: skin, foot: 'ball', footMat: DARK_MAT });
        stdArm(rig, rt, { sleeve: null, r: 0.11, len: 0.55, foreR: 0.1, foreLen: 0.55, mat: skin, wrist: null, handR: 0.13 });
      }
      break;
    }
    case 'corgi': {
      const t = bodyPart(rig.torsoGroup);
      const fur = padd(t, new THREE.SphereGeometry(0.85, 16, 12), skin, 0, 0.8, 0);
      fur.scale.set(1.05, 1.1, 0.9);
      const chest = padd(t, new THREE.SphereGeometry(0.55, 14, 10), WHITE_MAT, 0, 0.6, 0.38);
      chest.scale.set(0.85, 1.0, 0.55);
      padd(t, new THREE.CylinderGeometry(0.24, 0.3, 0.4, 12), skin, 0, 1.75, 0);
      padd(t, new THREE.TorusGeometry(0.31, 0.07, 8, 16), acc, 0, 1.9, 0, Math.PI / 2, 0, 0); // collar
      const hp = bodyPart(rig.hipGroup);
      const rump = padd(hp, new THREE.SphereGeometry(0.6, 14, 10), skin, 0, 2.3, -0.05);
      rump.scale.set(1.05, 0.8, 0.9);
      const tail = padd(hp, new THREE.SphereGeometry(0.17, 10, 8), skin, 0, 2.5, -0.58);
      tail.scale.set(0.8, 0.8, 1.4);
      tail.rotation.x = -0.7;
      padd(hp, new THREE.SphereGeometry(0.1, 8, 6), WHITE_MAT, 0, 2.64, -0.76); // white tip
      const hd = bodyPart(rig.head);
      const muzzle = padd(hd, new THREE.SphereGeometry(0.3, 12, 9), WHITE_MAT, 0, -0.14, 0.42);
      muzzle.scale.set(0.85, 0.62, 0.95);
      padd(hd, new THREE.SphereGeometry(0.09, 8, 8), DARK_MAT, 0, -0.05, 0.66); // nose
      for (const rt of sides) {
        stdLeg(rig, rt, { r: 0.22, len: 0.7, calfR: 0.18, calfLen: 0.62, mat: skin, foot: 'paw', footMat: WHITE_MAT });
        stdArm(rig, rt, { sleeve: null, r: 0.14, len: 0.5, foreR: 0.12, foreLen: 0.5, mat: skin, wrist: null, hand: 'paw' });
      }
      break;
    }
    case 'robot': {
      const t = bodyPart(rig.torsoGroup);
      padd(t, new THREE.BoxGeometry(1.2, 1.5, 0.72), skin, 0, 0.85, 0);
      padd(t, new THREE.BoxGeometry(0.72, 0.5, 0.1), kit, 0, 1.05, 0.38); // kit chest panel
      padd(t, new THREE.BoxGeometry(0.5, 0.26, 0.1), DARK_MAT, 0, 0.42, 0.38); // vent
      padd(t, new THREE.CylinderGeometry(0.16, 0.16, 0.4, 10), DARK_MAT, 0, 1.75, 0); // neck piston
      const hp = bodyPart(rig.hipGroup);
      padd(hp, new THREE.BoxGeometry(1.0, 0.55, 0.62), DARK_MAT, 0, 2.32, 0);
      padd(hp, new THREE.BoxGeometry(1.04, 0.16, 0.66), acc, 0, 2.62, 0);
      for (const rt of sides) {
        stdLeg(rig, rt, { r: 0.16, len: 0.7, calfR: 0.13, calfLen: 0.64, mat: skin, foot: 'box', footMat: skin });
        stdArm(rig, rt, { sleeve: { r: 0.24, len: 0.16 }, r: 0.13, len: 0.55, foreR: 0.11, foreLen: 0.55, mat: skin, wrist: DARK_MAT, handR: 0.16, handMat: DARK_MAT });
      }
      break;
    }
    case 'alien': {
      rig.head.scale.set(1.22, 1.26, 1.16); // that famous cranium
      const t = bodyPart(rig.torsoGroup);
      padd(t, new THREE.CapsuleGeometry(0.34, 0.85, 6, 12), skin, 0, 0.85, 0);
      padd(t, new THREE.CylinderGeometry(0.42, 0.48, 0.7, 12), kit, 0, 0.8, 0); // tiny tank top
      padd(t, new THREE.CylinderGeometry(0.11, 0.14, 0.5, 10), skin, 0, 1.85, 0); // spindly neck
      const hp = bodyPart(rig.hipGroup);
      padd(hp, new THREE.CylinderGeometry(0.42, 0.46, 0.5, 12), kit, 0, 2.38, 0);
      for (const rt of sides) {
        stdLeg(rig, rt, { r: 0.11, len: 0.78, calfR: 0.09, calfLen: 0.7, mat: skin, foot: 'ball', footMat: skin });
        stdArm(rig, rt, { sleeve: null, r: 0.09, len: 0.58, foreR: 0.08, foreLen: 0.55, mat: skin, wrist: null, handR: 0.15 });
      }
      break;
    }
    case 'vampire': {
      const t = stdTorso(rig);
      // high collar + full-length cape (hair mat = jet black, double-sided)
      for (const s of [-1, 1]) {
        padd(t, new THREE.BoxGeometry(0.3, 0.44, 0.1), hair, s * 0.3, 1.72, -0.14, 0.18, 0, -s * 0.45);
      }
      padd(t, new THREE.CylinderGeometry(0.5, 1.45, 2.6, 14, 1, true, Math.PI / 2, Math.PI), hair, 0, 0.35, -0.12);
      stdShorts(rig, DARK_MAT);
      humanHead(rig, false);
      for (const rt of sides) {
        stdLeg(rig, rt, { r: 0.2, len: 0.75, calfR: 0.16, calfLen: 0.7, mat: hair, foot: 'shoe', footMat: DARK_MAT });
        stdArm(rig, rt, { sleeve: { r: 0.19, len: 0.45 }, r: 0.15, len: 0.5, foreR: 0.13, foreLen: 0.55, mat: hair, wrist: null, handR: 0.16, handMat: skin });
      }
      break;
    }
    case 'pirate': {
      const t = stdTorso(rig);
      padd(t, new THREE.CylinderGeometry(0.8, 1.05, 0.8, 14, 1, true), kit, 0, -0.25, 0); // coat skirt
      padd(t, new THREE.BoxGeometry(0.3, 0.22, 0.08), WHITE_MAT, 0, 0.08, 0.5); // buckle
      stdShorts(rig, DARK_MAT);
      humanHead(rig, false);
      // left leg in a boot; right leg ends in the peg
      stdLeg(rig, false, { r: 0.24, len: 0.75, calfR: 0.19, calfLen: 0.7, mat: skin, hem: DARK_MAT, sock: DARK_MAT, foot: 'shoe', footMat: DARK_MAT });
      const th = bodyPart(rig.thighR);
      th.add(capsule(0.24, 0.75, skin));
      padd(th, new THREE.CylinderGeometry(0.3, 0.34, 0.55, 12), DARK_MAT, 0, -0.38, 0);
      const cf = bodyPart(rig.calfR);
      padd(cf, new THREE.CylinderGeometry(0.1, 0.07, 0.95, 10), WOOD_MAT, 0, -0.5, 0);
      padd(cf, new THREE.CylinderGeometry(0.11, 0.11, 0.1, 10), WOOD_MAT, 0, -1.0, 0);
      stdArm(rig, false, { sleeve: { r: 0.2, len: 0.45 }, r: 0.16, len: 0.5, foreR: 0.14, foreLen: 0.5, mat: kit, wrist: null, hand: 'hook' });
      stdArm(rig, true, { sleeve: { r: 0.2, len: 0.45 }, r: 0.16, len: 0.5, foreR: 0.14, foreLen: 0.5, mat: kit, wrist: null, handR: 0.16, handMat: skin });
      break;
    }
    case 'yeti': {
      const t = bodyPart(rig.torsoGroup);
      const fur = padd(t, new THREE.SphereGeometry(0.95, 16, 12), skin, 0, 0.85, 0);
      fur.scale.set(1.1, 1.05, 0.85);
      const tank = padd(t, new THREE.CylinderGeometry(0.97, 1.02, 0.55, 16), kit, 0, 0.5, 0);
      tank.scale.set(1, 1, 0.85);
      padd(t, new THREE.CylinderGeometry(0.3, 0.36, 0.4, 12), skin, 0, 1.75, 0);
      const hp = bodyPart(rig.hipGroup);
      padd(hp, new THREE.CylinderGeometry(0.72, 0.78, 0.7, 14), skin, 0, 2.28, 0);
      padd(hp, new THREE.CylinderGeometry(0.76, 0.76, 0.14, 14), acc, 0, 2.6, 0);
      for (const rt of sides) {
        stdLeg(rig, rt, { r: 0.3, len: 0.62, calfR: 0.26, calfLen: 0.52, mat: skin, foot: 'ball', footMat: skin });
        stdArm(rig, rt, { sleeve: null, r: 0.24, len: 0.55, foreR: 0.2, foreLen: 0.55, mat: skin, wrist: acc, handR: 0.24 });
      }
      break;
    }
    case 'granny': {
      const t = stdTorso(rig);
      // string of pearls over the cardigan
      for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) {
        padd(t, new THREE.SphereGeometry(0.055, 8, 6), WHITE_MAT, Math.sin(a) * 0.3, 1.62 - Math.cos(a) * 0.08, Math.cos(a) * 0.32);
      }
      const hp = bodyPart(rig.hipGroup);
      padd(hp, new THREE.CylinderGeometry(0.68, 1.05, 1.15, 16), kit, 0, 2.05, 0); // skirt
      padd(hp, new THREE.CylinderGeometry(0.7, 0.7, 0.14, 16), acc, 0, 2.62, 0);
      humanHead(rig, false);
      for (const rt of sides) {
        stdLeg(rig, rt, { r: 0.16, len: 0.72, calfR: 0.13, calfLen: 0.68, mat: skin, sock: WHITE_MAT, foot: 'shoe', footMat: DARK_MAT });
        stdArm(rig, rt, { sleeve: { r: 0.2, len: 0.4 }, r: 0.13, len: 0.5, foreR: 0.115, foreLen: 0.52, mat: skin, wrist: null, handR: 0.15 });
      }
      break;
    }
    case 'disco': {
      const t = stdTorso(rig);
      for (const s of [-1, 1]) {
        padd(t, new THREE.BoxGeometry(0.34, 0.16, 0.06), kit, s * 0.3, 1.62, 0.3, -0.2, 0, s * 0.55); // collar wings
      }
      padd(t, new THREE.TorusGeometry(0.24, 0.035, 8, 14), acc, 0, 1.42, 0.32, 1.25, 0, 0); // chain
      stdShorts(rig, kit);
      humanHead(rig, false);
      for (const rt of sides) {
        stdLeg(rig, rt, { r: 0.2, len: 0.72, calfR: 0.15, calfLen: 0.62, mat: kit, flare: kit, foot: 'shoe', footMat: WHITE_MAT });
        stdArm(rig, rt, { r: 0.17, len: 0.55, foreR: 0.15, foreLen: 0.55, mat: skin });
      }
      break;
    }
    case 'octopus': {
      const t = bodyPart(rig.torsoGroup);
      const mantle = padd(t, new THREE.CapsuleGeometry(0.55, 0.7, 6, 14), skin, 0, 0.9, 0);
      mantle.scale.set(1, 1.05, 0.9);
      padd(t, new THREE.CylinderGeometry(0.58, 0.64, 0.6, 14), kit, 0, 0.75, 0); // tank top
      // tentacle skirt hanging around the hips
      const hp = bodyPart(rig.hipGroup);
      for (const a of [0.45, -0.45, 1.25, -1.25, 2.1, -2.1, 2.9, -2.9]) {
        const tnt = capsule(0.12, 0.6, skin);
        tnt.position.set(Math.sin(a) * 0.45, 2.5, Math.cos(a) * 0.42);
        tnt.rotation.set(Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4);
        hp.add(tnt);
      }
      for (const rt of sides) {
        stdLeg(rig, rt, { r: 0.16, len: 0.72, calfR: 0.13, calfLen: 0.62, mat: skin, foot: 'none', curl: true });
        stdArm(rig, rt, { sleeve: null, r: 0.13, len: 0.55, foreR: 0.1, foreLen: 0.55, mat: skin, wrist: acc, handR: 0.11 });
      }
      break;
    }
    case 'cactus': {
      const t = bodyPart(rig.torsoGroup);
      const barrel = padd(t, new THREE.CapsuleGeometry(0.6, 0.85, 6, 14), skin, 0, 0.8, 0);
      barrel.scale.set(1, 1, 0.85);
      for (const a of [0.5, 1.55, 2.6, -2.6, -1.55, -0.5]) { // ribs
        padd(t, new THREE.CapsuleGeometry(0.05, 1.0, 4, 8), skin, Math.sin(a) * 0.56, 1.35, Math.cos(a) * 0.48);
      }
      for (const [a, y] of [[0.3, 1.2], [-0.6, 0.9], [1.1, 0.6], [-1.4, 1.3], [2.4, 0.8], [-2.6, 1.15], [3.0, 1.35], [1.9, 1.05]] as const) {
        padd(t, new THREE.ConeGeometry(0.03, 0.16, 5), WHITE_MAT, Math.sin(a) * 0.6, y, Math.cos(a) * 0.52, Math.cos(a) * 1.4, 0, -Math.sin(a) * 1.4);
      }
      const hp = bodyPart(rig.hipGroup);
      padd(hp, new THREE.CylinderGeometry(0.62, 0.66, 0.6, 14), kit, 0, 2.34, 0);
      for (const rt of sides) {
        stdLeg(rig, rt, { r: 0.18, len: 0.68, calfR: 0.15, calfLen: 0.62, mat: skin, foot: 'shoe', footMat: WHITE_MAT });
        stdArm(rig, rt, { sleeve: null, r: 0.16, len: 0.5, foreR: 0.14, foreLen: 0.5, mat: skin, wrist: acc, handR: 0.14 });
      }
      break;
    }
    case 'wizard': {
      stdTorso(rig);
      const hp = bodyPart(rig.hipGroup);
      padd(hp, new THREE.CylinderGeometry(0.72, 1.2, 1.5, 16), kit, 0, 1.85, 0); // robe
      padd(hp, new THREE.TorusGeometry(0.72, 0.05, 8, 18), acc, 0, 2.58, 0, Math.PI / 2, 0, 0); // rope belt
      humanHead(rig, false);
      for (const rt of sides) {
        stdLeg(rig, rt, { r: 0.17, len: 0.72, calfR: 0.14, calfLen: 0.68, mat: DARK_MAT, foot: 'shoe', footMat: DARK_MAT });
        stdArm(rig, rt, { sleeve: { r: 0.2, len: 0.35 }, r: 0.14, len: 0.5, foreR: 0.12, foreLen: 0.5, mat: skin, wrist: null, handR: 0.15, cuff: kit });
      }
      break;
    }
    default: { // athlete — the classic pro build
      stdTorso(rig);
      stdShorts(rig);
      humanHead(rig);
      for (const rt of sides) {
        stdLeg(rig, rt, { r: 0.24, len: 0.75, calfR: 0.19, calfLen: 0.7, mat: skin, hem: SHORTS_MAT, sock: SHOE_MAT, foot: 'shoe' });
        stdArm(rig, rt, { r: 0.17, len: 0.55, foreR: 0.15, foreLen: 0.55, mat: skin });
      }
    }
  }
}

function makePlayerRig(side: number, intoScene: THREE.Scene = scene3): PlayerRig {
  const skinMat = std({ color: 0xe8ae7e, roughness: 0.62 });
  const headMat = std({ color: 0xffffff, roughness: 0.62 });
  // double-sided: capes and coat skirts are open shells built from this mat
  const hairMat = std({ color: 0x3a2414, side: THREE.DoubleSide });
  const torsoMat = std({ color: 0xffffff });
  const sleeveMatL = std({ color: 0xffffff });
  const sleeveMatR = std({ color: 0xffffff });
  const accentMat = std({ color: 0xffffff });

  const root = new THREE.Group();

  // Bare skeleton: joint groups only — buildBody dresses them per character.
  const mkLeg = (x: number) => {
    const thigh = new THREE.Group();
    thigh.position.set(x, HIP_Y, 0);
    const calf = new THREE.Group();
    calf.position.set(0, -1.15, 0);
    thigh.add(calf);
    root.add(thigh);
    return { thigh, calf };
  };
  const legL = mkLeg(-0.42);
  const legR = mkLeg(0.42);

  const hipGroup = new THREE.Group();
  root.add(hipGroup);

  const upper = new THREE.Group();
  upper.position.y = 2.62;
  root.add(upper);

  const torsoGroup = new THREE.Group();
  upper.add(torsoGroup);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.6, 24, 18), headMat);
  head.position.y = 2.28;
  head.scale.set(0.94, 1.06, 0.97); // gentle oval — skull, not a ball
  head.castShadow = true;
  upper.add(head); // rotated at runtime to watch the ball

  const hairGroup = new THREE.Group();
  head.add(hairGroup);

  const mkArm = (x: number) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(x, 1.55, 0);
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.95, 0);
    shoulder.add(elbow);
    upper.add(shoulder);
    return { shoulder, elbow };
  };
  const armL = mkArm(-0.98);
  const armR = mkArm(0.98);

  // putter in the right hand: a long shaft down to a blade at the feet
  const racket = new THREE.Group();
  racket.position.set(0, -0.95, 0);
  racket.rotation.x = 0.12;
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.06, 2.9, 8),
    metal({ color: 0xc8ccd4 })
  );
  shaft.position.y = -1.45;
  shaft.castShadow = true;
  racket.add(shaft);
  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.07, 0.75, 8),
    std({ color: 0x23252d })
  );
  grip.position.y = -0.3;
  racket.add(grip);
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.85, 0.22, 0.24),
    metal({ color: 0xe8e8ee, roughness: 0.3 })
  );
  blade.position.set(0.28, -2.9, 0.1);
  blade.castShadow = true;
  racket.add(blade);
  armR.elbow.add(racket); // permanent — survives body rebuilds

  root.rotation.order = 'YZX'; // yaw first, then dive-roll about the local Z
  intoScene.add(root);
  return {
    root,
    upper,
    thighL: legL.thigh, calfL: legL.calf,
    thighR: legR.thigh, calfR: legR.calf,
    torsoGroup, hipGroup,
    shoulderL: armL.shoulder, elbowL: armL.elbow,
    shoulderR: armR.shoulder, elbowR: armR.elbow,
    torsoMat, sleeveMatL, sleeveMatR,
    skinMat, headMat, hairMat, accentMat,
    hairGroup,
    charKey: '',
    head,
    pose: { ...ZERO_POSE },
    yaw: side === 0 ? Math.PI : 0,
    runSeed: side * 2.7,
    runPhase: side * 2.7,
    prevPX: 0,
    prevPZ: 0,
    swingStart: -1,
    swingKind: 'putt',
    swingLow: false,
    swingStretch: false,
    swingPower: 0.5,
    swingMs: 520,
    windupStart: 0,
    contactPoint: null,
    prevSwingTicks: 0,
    readyT: 0,
    glintArmed: true,
    diveStart: -1,
    diveDir: 1,
    diveKind: 1,
    diveMs: 800,
    diveYaw: 0,
    diveFromX: 0,
    diveFromZ: 0,
    diveLanded: false,
    prevLunge: 0,
  };
}

let playerRigs: PlayerRig[] = [];

function applyPose(
  rig: PlayerRig,
  target: Pose,
  rate: number,
  dt: number,
  finalYaw: number,
  now: number
) {
  const a = 1 - Math.exp(-rate * dt);
  const p = rig.pose as any;
  for (const k of POSE_KEYS) p[k] += ((target as any)[k] - p[k]) * a;

  // breathing / micro-motion layer: nothing is ever perfectly still
  const b1 = Math.sin(now / 820 + rig.runSeed * 7) * 0.02;
  const b2 = Math.sin(now / 640 + rig.runSeed * 3) * 0.025;
  const b3 = Math.sin(now / 710 + rig.runSeed * 5 + 2) * 0.025;

  rig.upper.rotation.set(p.leanF + b1, p.twist, p.leanS);
  rig.thighL.rotation.x = p.thighL;
  rig.calfL.rotation.x = p.calfL;
  rig.thighR.rotation.x = p.thighR;
  rig.calfR.rotation.x = p.calfR;
  rig.shoulderL.rotation.set(p.shLx + b2, 0, p.shLz);
  rig.elbowL.rotation.x = p.elL;
  rig.shoulderR.rotation.set(p.shRx + b3, 0, p.shRz);
  rig.elbowR.rotation.x = p.elR;
  rig.root.rotation.y = finalYaw;
  rig.root.position.y = FLOOR_Y - p.crouch;
}

// --- pose library -----------------------------------------------------------
function readyPose(now: number, seed: number): Pose {
  const sway = Math.sin(now / 550 + seed) * 0.04;
  return {
    ...ZERO_POSE,
    leanF: 0.22,
    crouch: 0.22 + Math.sin(now / 275 + seed) * 0.03,
    thighL: -0.32, calfL: 0.5, thighR: -0.32, calfR: 0.5,
    // two-handed ready grip in front
    shLx: -0.85 + sway, shLz: 0.55, elL: -1.15,
    shRx: -0.85 + sway, shRz: -0.55, elR: -1.15,
  };
}

// Stride cadence: radians of run cycle per world unit of ground covered.
// One full cycle (two steps) then spans ~2π/0.85 ≈ 7.4 units — about what
// these legs actually cover at full extension, so the shoes grip instead
// of skating. The phase is fed from measured movement, not wall-clock time.
const RUN_STRIDE_RATE = 0.85;

function runPose(phase: number, lean: number): Pose {
  const t = phase;
  const s = Math.sin(t);
  const c = Math.sin(t + Math.PI);
  return {
    ...ZERO_POSE,
    leanF: 0.3,
    leanS: lean * 0.12,
    twist: s * 0.14, // hips/shoulders counter-rotate with the stride
    crouch: 0.12 + Math.abs(Math.sin(t)) * 0.05,
    thighL: s * 1.0, calfL: Math.max(0, -s) * 1.15 + 0.15,
    thighR: c * 1.0, calfR: Math.max(0, -c) * 1.15 + 0.15,
    shLx: c * 0.7 - 0.25, shLz: 0.15, elL: -0.9,
    shRx: s * 0.7 - 0.25, shRz: -0.15, elR: -0.9,
  };
}

// --- golf poses --------------------------------------------------------------
// Standing between shots: upright, putter resting in front, tiny sway.
function golfIdlePose(now: number, seed: number): Pose {
  const sway = Math.sin(now / 900 + seed) * 0.03;
  return {
    ...ZERO_POSE,
    leanF: 0.08,
    crouch: 0.02,
    thighL: -0.05, calfL: 0.08, thighR: 0.05, calfR: 0.08,
    shLx: -0.55 + sway, shLz: 0.42, elL: -0.35,
    shRx: -0.55 + sway, shRz: -0.42, elR: -0.35,
  };
}

// Addressing the ball: bent from the hips, arms hanging to the club.
function golfAddressPose(now: number, seed: number): Pose {
  const breathe = Math.sin(now / 700 + seed) * 0.015;
  return {
    ...ZERO_POSE,
    leanF: 0.55 + breathe,
    crouch: 0.16,
    thighL: -0.2, calfL: 0.35, thighR: -0.2, calfR: 0.35,
    shLx: -0.95, shLz: 0.5, elL: -0.15,
    shRx: -0.95, shRz: -0.5, elR: -0.15,
  };
}

// The putt. t: 0 backswing → 0.42 CONTACT → 1 follow-through settled.
// `power` scales the arc: a tap barely moves, a full hit swings wide.
function golfSwingPose(t: number, power: number, now: number, seed: number): Pose {
  const base = golfAddressPose(now, seed);
  const amp = 0.25 + 0.9 * power;
  const cnt = 0.42;
  // sideways club angle: positive = hands to the golfer's right (backswing)
  const back = ch(t, [[0, 0], [0.32, amp], [cnt, 0], [0.75, -amp * 1.15], [1, -amp * 0.55]]);
  return {
    ...base,
    twist: -back * 0.35,
    leanS: back * 0.08,
    shLz: base.shLz + back,
    shRz: base.shRz + back,
    shLx: base.shLx - Math.abs(back) * 0.12,
    shRx: base.shRx - Math.abs(back) * 0.12,
  };
}

function golfCheerPose(now: number): Pose {
  const bounce = Math.abs(Math.sin(now / 160));
  return {
    ...ZERO_POSE,
    crouch: -bounce * 0.25,
    thighL: -0.2, calfL: 0.3, thighR: -0.2, calfR: 0.3,
    shLx: -2.6, shLz: 0.35, elL: -0.4,
    shRx: -2.6, shRz: -0.35, elR: -0.4,
  };
}

function golfSlumpPose(now: number): Pose {
  return {
    ...ZERO_POSE,
    leanF: 0.7 + Math.sin(now / 500) * 0.03,
    crouch: 0.3,
    thighL: -0.3, calfL: 0.5, thighR: -0.3, calfR: 0.5,
    shLx: -1.5, shLz: 0.3, elL: -1.3, // head in hands
    shRx: -1.5, shRz: -0.3, elR: -1.3,
  };
}

// Grass: a tile of the lawn. The hole itself is built as meshes on top.
function makeGroundTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = gfx.detail ? 1024 : 512;
  c.height = c.width * 1.5;
  const g = c.getContext('2d')!;
  g.fillStyle = '#458f45';
  g.fillRect(0, 0, c.width, c.height);
  // mowing stripes running the length of the tile
  const stripe = c.width / 14;
  for (let i = 0; i < 14; i++) {
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
    g.fillRect(i * stripe, 0, stripe, c.height);
  }
  if (gfx.detail) {
    for (let i = 0; i < 14000; i++) {
      g.fillStyle = texHash(i * 1.3) > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
      g.fillRect(texHash(i * 7.1) * c.width, texHash(i * 3.7) * c.height, 1.5, 1.5);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const texHash = (n: number) => {
  const s = Math.sin(n) * 43758.5453;
  return s - Math.floor(s);
};

// The sky as an equirectangular panorama: zenith blue down to a warm haze
// at the horizon, a sun glow where the key light sits, cumulus puffs, and a
// muted grass-green lower hemisphere. One texture serves twice — as the
// background (it turns with the camera, so the sky is a place rather than
// a wallpaper) and, prefiltered, as the image-based lighting every PBR
// surface reflects.
let skyTex: THREE.Texture | null = null;
function makeSkyTexture(): THREE.Texture {
  if (skyTex) return skyTex;
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 1024;
  const W = c.width, H = c.height;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#1e4f9a');
  grad.addColorStop(0.22, '#3a7cc4');
  grad.addColorStop(0.42, '#8fbde4');
  grad.addColorStop(0.495, '#e8eef0'); // haze band right at the horizon
  grad.addColorStop(0.505, '#7c9a6a');
  grad.addColorStop(0.6, '#4f7a42');
  grad.addColorStop(1, '#2f4a2a');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // sun glow at the key light's direction (equirect: u from atan2(z, x),
  // v from elevation; canvas row 0 is the zenith)
  const d = SUN_POS.clone().normalize();
  const su = (Math.atan2(d.z, d.x) / (Math.PI * 2) + 0.5) * W;
  const sv = (0.5 - Math.asin(d.y) / Math.PI) * H;
  const glow = g.createRadialGradient(su, sv, 0, su, sv, 260);
  glow.addColorStop(0, 'rgba(255,250,232,1)');
  glow.addColorStop(0.06, 'rgba(255,247,220,0.9)');
  glow.addColorStop(0.3, 'rgba(255,240,205,0.3)');
  glow.addColorStop(1, 'rgba(255,236,196,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H / 2);
  // clouds live in the band between ~12° and ~40° above the horizon
  for (let i = 0; i < 26; i++) {
    const cx = texHash(i * 3.1) * W;
    const cy = H * (0.28 + texHash(i * 5.7) * 0.17);
    const sc = (0.8 + texHash(i * 7.9)) * (1 + (cy / H - 0.28) * 2);
    g.fillStyle = `rgba(255,255,255,${0.12 + texHash(i * 2.3) * 0.16})`;
    for (let p = 0; p < 7; p++) {
      const px = cx + (texHash(i * 11.3 + p) - 0.5) * 170 * sc;
      const py = cy + (texHash(i * 13.7 + p) - 0.5) * 30 * sc;
      const pr = (18 + texHash(i * 17.9 + p) * 26) * sc;
      g.beginPath();
      g.ellipse(px, py, pr, pr * 0.5, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  skyTex = tex;
  return tex;
}

/** Prefilter the sky into an environment map for a renderer (PMREM output
 *  belongs to the WebGL context that made it, so each renderer gets its
 *  own). */
function makeEnvironment(r: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(r);
  const env = pmrem.fromEquirectangular(makeSkyTexture()).texture;
  pmrem.dispose();
  return env;
}

let groundMat: THREE.MeshStandardMaterial;
let groundBaked = false;

function bakeGround() {
  if (groundBaked) return;
  groundBaked = true;
  const old = groundMat.map;
  const map = makeGroundTexture();
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set((GROUND_R * 2) / GROUND_TILE, (GROUND_R * 2) / (GROUND_TILE * 1.5));
  groundMat.map = map;
  if (!groundMat.normalMap) {
    // turf: the felt's pile normal tiled fine, so the lawn has a nap that
    // shifts with the sun instead of reading as painted plastic
    groundMat.normalMap = surfaces().feltN.clone(); // own repeat, shared pixels
    groundMat.normalMap.repeat.set((GROUND_R * 2) / 3, (GROUND_R * 2) / 3);
    groundMat.normalMap.needsUpdate = true;
    groundMat.normalScale.set(0.55, 0.55);
    groundMat.roughness = 0.95;
  }
  groundMat.needsUpdate = true;
  old?.dispose();
}

// Bake a texture repeat into the geometry's UVs so meshes of different
// sizes (pond basins, wall runs) can share one material.
function scaleUv(geo: THREE.BufferGeometry, kx: number, ky = 1) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * kx, uv.getY(i) * ky);
  uv.needsUpdate = true;
}

function buildEnvironment() {
  groundMat = std({});
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_R * 2, GROUND_R * 2), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene3.add(ground);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
// The scene is framed for a 4:3 window with a ~46° vertical FOV. Narrower
// frames (portrait phones fill the whole screen) keep the same HORIZONTAL
// FOV — the full hole width stays in view and the extra height shows
// sky above / foreground lawn below instead of cropping the sides.
const BASE_ASPECT = 4 / 3;

function fovForAspect(baseFov: number): number {
  if (camera.aspect >= BASE_ASPECT) return baseFov;
  const halfH = Math.tan(THREE.MathUtils.degToRad(baseFov / 2)) * BASE_ASPECT;
  return THREE.MathUtils.radToDeg(Math.atan(halfH / camera.aspect)) * 2;
}

// Match the drawing buffer to the canvas's on-screen size (the stage is
// 4:3 on desktop but fills the viewport on portrait phones), scaled by the
// resolution option — the browser stretches whatever we draw back over the
// same CSS box, so a smaller buffer is a straight fill-rate saving.
function resizeToDisplay(canvas: HTMLCanvasElement) {
  if (!sizeObserver) {
    // no ResizeObserver support: fall back to per-frame layout reads
    cssW = canvas.clientWidth;
    cssH = canvas.clientHeight;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2) * gfx.resolution;
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

export function initRenderer(canvas: HTMLCanvasElement) {
  hostCanvas = canvas;
  gfx = getGraphics(); // settings may have changed since this module loaded
  observeCanvasSize();
  buildScene();
  onGraphicsChange(applyGraphics);
}

function buildScene() {
  renderer = new THREE.WebGLRenderer({
    canvas: hostCanvas,
    antialias: false, // MSAA is done on the composer's render target instead
    stencil: false,
    preserveDrawingBuffer: false,
  });

  scene3 = new THREE.Scene();
  scene3.background = makeSkyTexture();
  scene3.backgroundIntensity = 1.0;
  envTex = makeEnvironment(renderer);
  scene3.environment = envTex;
  scene3.environmentIntensity = 0.5;
  scene3.fog = new THREE.Fog(0xdce8f2, FOG_NEAR_MIN, FOG_NEAR_MIN * FOG_FAR_MUL);

  const aspect =
    hostCanvas.clientHeight > 0 ? hostCanvas.clientWidth / hostCanvas.clientHeight : BASE_ASPECT;
  camera = new THREE.PerspectiveCamera(46, aspect, 0.5, GROUND_R * 2);
  camera.position.copy(CAM_POS);
  camera.lookAt(CAM_TARGET);
  camPos.copy(CAM_POS);
  camLook.copy(CAM_TARGET);

  sun = new THREE.DirectionalLight(0xfff1dc, 3.6);
  sun.position.copy(SUN_POS);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.035;
  fitShadowFrustum(null);
  scene3.add(sun);
  // the sky map does most of the fill; this only lifts the deepest shade
  scene3.add(new THREE.HemisphereLight(0xcfe4ff, 0x3a6b32, 0.25));

  buildEnvironment();
  bakeGround();
  initParticles();

  // eight golfers, eight balls
  playerRigs = [];
  for (let i = 0; i < MAX_RIGS; i++) {
    const rig = makePlayerRig(0);
    rig.root.visible = false;
    rig.runSeed = i * 2.7;
    rig.runPhase = i * 2.7;
    playerRigs.push(rig);
  }
  rigByPlayer.clear();
  ballByPlayer.clear();
  ballPool.length = 0;
  const ballGeo = new THREE.SphereGeometry(BALL_R, 20, 14);
  const blobGeo = new THREE.CircleGeometry(BALL_R * 1.6, 20);
  const sf = surfaces();
  const ballTex = makeGolfBallTexture();
  for (let i = 0; i < MAX_GOLFERS; i++) {
    // lacquered plastic: a clearcoat over the paint, dimples in the normal
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map: ballTex, normalMap: sf.dimpleN, normalScale: new THREE.Vector2(0.5, 0.5),
      roughness: 0.42, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.18,
    });
    const mesh = new THREE.Mesh(ballGeo, mat);
    mesh.castShadow = true;
    mesh.visible = false;
    scene3.add(mesh);
    const blob = new THREE.Mesh(
      blobGeo,
      new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: sf.blob, transparent: true, opacity: 0.4, depthWrite: false })
    );
    blob.rotation.x = -Math.PI / 2;
    blob.visible = false;
    scene3.add(blob);
    ballPool.push({ mesh, blob, mat });
  }

  // aim arrow (direction + power only — no bounce preview)
  aimArrow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0xa4ff3d, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, side: THREE.DoubleSide })
  );
  aimArrow.rotation.x = -Math.PI / 2;
  aimArrow.visible = false;
  aimArrow.renderOrder = 10;
  scene3.add(aimArrow);
  aimHead = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 3),
    new THREE.MeshBasicMaterial({ color: 0xa4ff3d, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, side: THREE.DoubleSide })
  );
  aimHead.rotation.x = -Math.PI / 2;
  aimHead.visible = false;
  aimHead.renderOrder = 10;
  scene3.add(aimHead);

  holeGroup = new THREE.Group();
  scene3.add(holeGroup);
  builtHoleKey = '';

  buildComposer();
  applyResolution();
  applyShadows();
  applyGrade();
}

// ---------------------------------------------------------------------------
// Post-processing. The scene renders into a half-float (HDR) target, then:
// ground-truth ambient occlusion (contact shade under balls, along wall
// feet, between limbs), bloom (only what is brighter than white glows:
// lasers, portals, the aim arrow, floodlights), the tone-mapped output, and
// SMAA to catch the shading aliasing MSAA cannot. Passes toggle with the
// graphics options.
//
// MSAA lives in the scene pass alone. The composer's own buffers must NOT
// be multisampled: the bloom pass blends its glow additively back into the
// buffer it just read, and three.js invalidates a multisampled buffer's
// contents after every resolve, so on GPUs that honour the invalidate
// (Apple, mobile) the blend lands on garbage and the frame flickers.
// ---------------------------------------------------------------------------

/** Renders the scene through a multisampled HDR target and hands the
 *  resolved image to the composer as an ordinary single-sample buffer. */
class ScenePass extends Pass {
  private msaa: THREE.WebGLRenderTarget | null;
  private quad: FullScreenQuad;
  private copy: THREE.ShaderMaterial;
  constructor(w: number, h: number, samples: number) {
    super();
    this.needsSwap = true;
    this.msaa = samples > 0 ? new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples }) : null;
    this.copy = new THREE.ShaderMaterial({ ...CopyShader, uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms), depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.copy);
  }
  override setSize(w: number, h: number) { this.msaa?.setSize(w, h); }
  override dispose() { this.msaa?.dispose(); this.copy.dispose(); this.quad.dispose(); }
  override render(r: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget) {
    if (!this.msaa) {
      r.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      r.render(scene3, camera);
      return;
    }
    r.setRenderTarget(this.msaa);
    r.render(scene3, camera); // resolved into msaa.texture when this returns
    this.copy.uniforms.tDiffuse.value = this.msaa.texture;
    r.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(r);
  }
}

function buildComposer() {
  if (composer) {
    for (const p of composer.passes) p.dispose(); // the composer only frees its own buffers
    composer.dispose();
  }
  const w = Math.max(2, hostCanvas.width), h = Math.max(2, hostCanvas.height);
  const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
  composer = new EffectComposer(renderer, target);
  composer.addPass(new ScenePass(w, h, gfx.antialias ? 4 : 0));
  aoPass = new GTAOPass(scene3, camera, w, h);
  aoPass.output = GTAOPass.OUTPUT.Default;
  // world-space radius: about two ball widths, so the occlusion hugs the
  // felt-to-wall seam and the underside of a resting ball
  aoPass.updateGtaoMaterial({ radius: 1.1, distanceExponent: 1, thickness: 1, scale: 1.1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
  aoPass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 12 });
  aoPass.blendIntensity = 0.85;
  composer.addPass(aoPass);
  bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.42, 0.55, 1.35);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  smaaPass = new SMAAPass();
  composer.addPass(smaaPass);
  applyPost();
}

function applyPost() {
  if (aoPass) aoPass.enabled = gfx.ao;
  if (bloomPass) bloomPass.enabled = gfx.bloom;
  if (smaaPass) smaaPass.enabled = gfx.antialias;
}

// ---------------------------------------------------------------------------
// Graphics options
// ---------------------------------------------------------------------------
// Shadow-map and tone-mapping state is compiled into every shader, so those
// two switches need the whole scene's materials rebuilt.
function markMaterialsDirty() {
  scene3.traverse(obj => {
    const mat = (obj as THREE.Mesh).material;
    if (!mat) return;
    if (Array.isArray(mat)) for (const m of mat) m.needsUpdate = true;
    else mat.needsUpdate = true;
  });
}

// Render at a fraction of the canvas and let the browser scale it up: the
// cheapest big win there is, since the whole frame is fill-rate bound.
function applyResolution() {
  resizeToDisplay(hostCanvas); // takes effect now rather than on the next frame
}

// The shadow map covers the hole, not the lawn: an orthographic frustum
// wrapped around the hole bounds (plus room for the golfers and the flag)
// spends every shadow texel where the eye is, so the golfers' shadows have
// edges instead of stair-steps. With no hole built it falls back to a patch
// around the origin for the idle lawn behind the menus.
// The fog closes in past the hole: near enough to soften the empty lawn
// on a small hole, far enough that a big one is never lost in it.
const FOG_NEAR_MIN = 200;
const FOG_FAR_MUL = 1.7;

function fitShadowFrustum(b: ReturnType<typeof holeBounds> | null) {
  const cam = sun.shadow.camera;
  let r = 80;
  if (b) {
    const hw = b.w / 2 + 10, hh = b.h / 2 + 10;
    // the light looks down its own axis: size the box by the hole's
    // footprint projected onto the light's view plane (generous — the
    // golfers stand off the felt and the flag rises above it)
    r = Math.hypot(hw, hh) * 0.85 + 4;
  }
  cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
  cam.far = SUN_POS.length() + r + 20;
  cam.updateProjectionMatrix();
  const fog = scene3.fog as THREE.Fog;
  fog.near = Math.max(FOG_NEAR_MIN, b ? Math.hypot(b.w, b.h) * 1.3 : 0);
  fog.far = fog.near * FOG_FAR_MUL;
}

function applyShadows() {
  const on = gfx.shadows > 0;
  renderer.shadowMap.enabled = on;
  renderer.shadowMap.type = THREE.PCFShadowMap; // (PCFSoft is deprecated in this three.js)
  sun.shadow.radius = gfx.shadows >= 2 ? 2.5 : 1; // blur the filtered edge on HIGH
  sun.castShadow = on;
  const size = gfx.shadows >= 2 ? 2048 : 1024;
  if (!on || sun.shadow.mapSize.x !== size) {
    sun.shadow.mapSize.set(size, size);
    sun.shadow.map?.dispose(); // hand the render target back — or re-make it
    sun.shadow.map = null;     // at the new size on the next shadow pass
  }
  renderer.shadowMap.needsUpdate = true;
  markMaterialsDirty();
}

// The scene is lit in HDR (sun + sky add up past white), so some tone
// mapping is always on: the FILM GRADE switch picks the filmic ACES curve
// with the colour wash, or a neutral curve that keeps the colours as authored.
function applyGrade() {
  renderer.domElement.style.filter = gfx.grade ? BASE_FILTER : '';
  renderer.toneMapping = gfx.grade ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
  renderer.toneMappingExposure = gfx.grade ? 1.1 : 1.0;
  markMaterialsDirty();
}

function applyGraphics(next: GraphicsSettings, prev: GraphicsSettings) {
  gfx = next;
  if (next.antialias !== prev.antialias) buildComposer(); // MSAA is baked into the scene pass's target
  else if (next.ao !== prev.ao || next.bloom !== prev.bloom) applyPost();
  if (next.resolution !== prev.resolution) applyResolution();
  if (next.shadows !== prev.shadows) applyShadows();
  if (next.grade !== prev.grade) applyGrade();
  if (next.detail !== prev.detail) {
    groundBaked = false; // re-bake the grass at the new detail level
    bakeGround();
  }
  if (next.particles) {
    initParticles(); // no-op unless the pool was skipped at build time
  } else {
    for (const p of particles) {
      p.life = 0;
      p.mesh.visible = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Golf scene state: pooled golfers + balls, the built hole, aim props, camera
// ---------------------------------------------------------------------------
const MAX_GOLFERS = 32; // balls
const MAX_RIGS = 10; // full 3D golfers: you + the nearest nine
const WALL_H = 1.1;
const rigByPlayer = new Map<string, number>();
interface BallProp { mesh: THREE.Mesh; blob: THREE.Mesh; mat: THREE.MeshPhysicalMaterial }
const ballPool: BallProp[] = [];
const ballByPlayer = new Map<string, BallProp>();
let aimArrow: THREE.Mesh;
let aimHead: THREE.Mesh;
let holeGroup: THREE.Group;
let builtHoleKey = '';
let builtGeom: ReturnType<typeof geomOf> | null = null;
interface MoverProp { block: Block; group: THREE.Group; pivotX: number; pivotY: number; mesh?: THREE.Mesh }
let movers: MoverProp[] = [];
let waterMats: THREE.MeshPhysicalMaterial[] = [];
// scrolling surfaces: the texture slides along the zone's own direction
let boostMats: { mat: THREE.MeshStandardMaterial; dx: number; dy: number; rate: number }[] = [];
let teleMats: THREE.MeshBasicMaterial[] = [];
// the toy box: things that spin, whirr and pulse every frame
let spinners: { group: THREE.Group; speed: number }[] = [];
// conveyor end rollers: faceted drums turning at the belt's speed
let rollers: { mesh: THREE.Mesh; rate: number }[] = [];
let fanBlades: THREE.Group[] = [];
let magnetMats: THREE.MeshBasicMaterial[] = [];
let cannons: { zone: Zone; group: THREE.Group; restAngle: number }[] = [];
let flagMesh: THREE.Mesh | null = null;
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const camDir = new THREE.Vector3(1, 0, 0);
let camMode: GolfScene['cam'] | '' = '';

// Free look: a yaw / pitch / distance offset the player lays over the
// automatic camera (drag to orbit, wheel or pinch to zoom — see freelook.ts).
// It rides on top of whatever the mode wants, so the camera still follows
// the ball, and it clears whenever the view cuts (new hole, new mode).
const look = { yaw: 0, pitch: 0, zoom: 1 };
let lookMovedAt = -1e9; // the camera snaps to the hand while it is being dragged
const LOOK_ZOOM_MIN = 0.45, LOOK_ZOOM_MAX = 2.4;

/** Orbit the view: radians of yaw (around up) and pitch (elevation). */
export function orbitLook(dyaw: number, dpitch: number) {
  look.yaw += dyaw;
  look.pitch = THREE.MathUtils.clamp(look.pitch + dpitch, -1.4, 1.4);
  lookMovedAt = performance.now();
}
/** Scale the camera's distance from what it looks at (> 1 backs away). */
export function zoomLook(factor: number) {
  look.zoom = THREE.MathUtils.clamp(look.zoom * factor, LOOK_ZOOM_MIN, LOOK_ZOOM_MAX);
  lookMovedAt = performance.now();
}
export function resetLook() {
  look.yaw = 0; look.pitch = 0; look.zoom = 1;
}
const lookIsDefault = () => look.yaw === 0 && look.pitch === 0 && look.zoom === 1;

// per-rig animation bookkeeping (index = rig slot)
interface GolferState {
  px: number; pz: number; // current feet position (three)
  swingStart: number; swingPower: number; swingMs: number;
  lastShotSeq: number;
  holedAt: number; // when they holed out (-1 = not)
  wasHoled: boolean;
  lastFacing: number;
}
const golfers: GolferState[] = [];

function golferState(slot: number): GolferState {
  while (golfers.length <= slot) {
    golfers.push({ px: 0, pz: 0, swingStart: -1, swingPower: 0.5, swingMs: 700, lastShotSeq: -1, holedAt: -1, wasHoled: false, lastFacing: 0 });
  }
  return golfers[slot];
}

// ---------------------------------------------------------------------------
// Procedural surfaces. Nothing here is loaded: albedo and normal maps are
// painted on canvases at start-up (a few hundred KB of GPU memory, zero
// network), which keeps the client a single bundle.
// ---------------------------------------------------------------------------

/** Tangent-space normal map from a height function h(x, y) in [0, 1] over a
 *  tiling canvas of `size` px; `strength` scales the slope. */
function heightToNormal(size: number, strength: number, h: (x: number, y: number) => number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const d = img.data;
  const hv = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) hv[y * size + x] = h(x / size, y / size);
  const at = (x: number, y: number) => hv[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      d[i] = (-dx / l * 0.5 + 0.5) * 255;
      d[i + 1] = (dy / l * 0.5 + 0.5) * 255; // canvas y is down; tangent-space +y is up
      d[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

// Smooth tiling value noise (bilinear on a hashed lattice), a few octaves.
function vnoise(x: number, y: number, cells: number): number {
  const fx = x * cells, fy = y * cells;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const lat = (i: number, j: number) => texHash((((i % cells) + cells) % cells) * 131.1 + (((j % cells) + cells) % cells) * 7.7 + cells * 0.37);
  const a = lat(x0, y0), b = lat(x0 + 1, y0), c = lat(x0, y0 + 1), d = lat(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm(x: number, y: number, base: number, octaves = 3): number {
  let v = 0, amp = 0.5, cells = base, sum = 0;
  for (let o = 0; o < octaves; o++) { v += vnoise(x, y, cells) * amp; sum += amp; amp *= 0.5; cells *= 2; }
  return v / sum;
}

// Felt: fibrous pile, a fine random grain that catches the light softly.
function makeFeltNormal(): THREE.CanvasTexture {
  return heightToNormal(256, 1.6, (x, y) => fbm(x, y, 64, 3));
}

// Wood: plank grain running along u, with knots and slight ring wobble.
function woodHeight(x: number, y: number): number {
  const wob = fbm(x, y, 4, 2) * 0.35;
  const rings = 0.5 + 0.5 * Math.sin((y * 9 + wob * 6 + x * 0.6) * Math.PI * 2);
  return rings * 0.7 + fbm(x, y, 48, 2) * 0.3;
}
function makeWoodTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const img = g.createImageData(512, 512);
  const d = img.data;
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const h = woodHeight(x / 512, y / 512);
      const i = (y * 512 + x) * 4;
      // light oak: bright early wood, darker late wood
      d[i] = 176 + h * 42 - 14;
      d[i + 1] = 128 + h * 40 - 10;
      d[i + 2] = 78 + h * 34 - 8;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
function makeWoodNormal(): THREE.CanvasTexture {
  return heightToNormal(512, 2.2, woodHeight);
}

// Golf ball dimples: a hex-packed field of round dents on the sphere's
// equirect wrap (the count is chosen so the seam tiles).
function makeDimpleNormal(): THREE.CanvasTexture {
  const NX = 24, NY = 12;
  return heightToNormal(256, 3.0, (x, y) => {
    const row = Math.floor(y * NY);
    const ox = (row % 2) * 0.5;
    const fx = ((x * NX + ox) % 1) - 0.5, fy = ((y * NY) % 1) - 0.5;
    const r = Math.hypot(fx, fy);
    return r < 0.36 ? 1 - Math.cos((r / 0.36) * Math.PI * 0.5) : 1;
  });
}

// Water: two crossed wave trains, scrolled at runtime for a live surface.
function makeRippleNormal(): THREE.CanvasTexture {
  return heightToNormal(256, 1.4, (x, y) =>
    0.5 + 0.25 * Math.sin((x * 3 + y * 1) * Math.PI * 2) + 0.25 * Math.sin((x * -1 + y * 4 + fbm(x, y, 8, 2) * 0.4) * Math.PI * 2));
}

// Soft contact shadow under the ball: radial falloff used as an alpha map.
function makeBlobTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.45, '#b0b0b0');
  grad.addColorStop(1, '#000000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// The cup seen from above: black at the bottom, the far wall catching a
// little light, so the hole reads as a recess rather than a black sticker.
function makeCupTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#05090a';
  g.fillRect(0, 0, 128, 128);
  const wall = g.createRadialGradient(64, 64, 34, 64, 64, 64);
  wall.addColorStop(0, 'rgba(60,70,66,0)');
  wall.addColorStop(0.7, 'rgba(70,80,74,0.55)');
  wall.addColorStop(1, 'rgba(120,130,122,0.9)');
  g.fillStyle = wall;
  g.fillRect(0, 0, 128, 128);
  // the sunlit side of the inner wall (sun comes from -x, +z)
  const lit = g.createLinearGradient(20, 20, 108, 108);
  lit.addColorStop(0, 'rgba(0,0,0,0.5)');
  lit.addColorStop(1, 'rgba(255,255,240,0.35)');
  g.fillStyle = lit;
  g.beginPath();
  g.arc(64, 64, 64, 0, Math.PI * 2);
  g.arc(64, 64, 40, 0, Math.PI * 2, true);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Pond bed: wet pebbles in silt, seen through the water.
function makeBedTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3a3a2e';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    const x = texHash(i * 3.3) * 256, y = texHash(i * 7.1) * 256, r = 4 + texHash(i * 5.7) * 10;
    const l = 26 + texHash(i * 9.9) * 26;
    g.fillStyle = `hsl(${30 + texHash(i * 2.1) * 30}, ${8 + texHash(i * 4.4) * 12}%, ${l}%)`;
    g.beginPath();
    g.ellipse(x, y, r, r * 0.75, texHash(i) * 3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.09)';
    g.beginPath();
    g.ellipse(x - r * 0.25, y - r * 0.3, r * 0.35, r * 0.25, 0, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

let surf: {
  feltN: THREE.CanvasTexture; wood: THREE.CanvasTexture; woodN: THREE.CanvasTexture;
  dimpleN: THREE.CanvasTexture; rippleN: THREE.CanvasTexture; blob: THREE.CanvasTexture; cup: THREE.CanvasTexture;
  bed: THREE.CanvasTexture;
} | null = null;
function surfaces() {
  if (surf) return surf;
  const wood = makeWoodTexture(), woodN = makeWoodNormal();
  wood.repeat.set(0.25, 0.25); // one plank tile = 4 world units
  woodN.repeat.set(0.25, 0.25);
  surf = { feltN: makeFeltNormal(), wood, woodN, dimpleN: makeDimpleNormal(), rippleN: makeRippleNormal(), blob: makeBlobTexture(), cup: makeCupTexture(), bed: makeBedTexture() };
  return surf;
}

/** Dimpled white golf ball. */
function makeGolfBallTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = 0; y < c.height; y += 8) {
    for (let x = (y / 8) % 2 ? 4 : 0; x < c.width; x += 8) {
      g.beginPath();
      g.arc(x + 4, y + 4, 2.2, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeFeltTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#36a24a';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)';
    g.fillRect(i * 32, 0, 32, 256);
  }
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = texHash(i * 1.7) > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    g.fillRect(texHash(i * 3.3) * 256, texHash(i * 5.9) * 256, 1.5, 1.5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeZoneTexture(z: Zone): THREE.CanvasTexture {
  const PX = 24;
  const c = document.createElement('canvas');
  // a spinner's texture wraps its disc (which fills the rect's shorter
  // side), so it is square; everything else spans the rect
  const tw = z.kind === 'spinner' ? Math.min(z.w, z.h) : z.w, th = z.kind === 'spinner' ? Math.min(z.w, z.h) : z.h;
  c.width = Math.max(8, Math.min(1024, Math.round(tw * PX)));
  c.height = Math.max(8, Math.min(1024, Math.round(th * PX)));
  const g = c.getContext('2d')!;
  const W = c.width, H = c.height;
  const arrows = (color: string, spacing: number) => {
    const a = ((z.angle ?? 0) * Math.PI) / 180;
    const ux = Math.cos(a), uy = Math.sin(a);
    const vx = -uy, vy = ux;
    const cx = W / 2, cy = H / 2;
    const len = Math.hypot(W, H);
    g.strokeStyle = color;
    g.lineWidth = 3;
    g.lineCap = 'round';
    for (let d = -len / 2; d < len / 2; d += spacing * PX) {
      for (let s2 = -len / 2; s2 < len / 2; s2 += spacing * PX) {
        const bx = cx + ux * d + vx * s2, by = cy + uy * d + vy * s2;
        g.beginPath();
        g.moveTo(bx - ux * 5 + vx * 12, by - uy * 5 + vy * 12);
        g.lineTo(bx + ux * 12, by + uy * 12);
        g.lineTo(bx - ux * 5 - vx * 12, by - uy * 5 - vy * 12);
        g.stroke();
      }
    }
  };
  switch (z.kind) {
    case 'sand':
      g.fillStyle = '#e9d18c'; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      for (let i = 0; i < (W * H) / 60; i++) g.fillRect(texHash(i * 7.9) * W, texHash(i * 3.1) * H, 2, 2);
      break;
    case 'ice':
      g.fillStyle = '#cfeeff'; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2;
      for (let x = -H; x < W; x += 60) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + H, 0); g.stroke(); }
      break;
    case 'water': {
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#3a9ae6'); grad.addColorStop(1, '#1f5f9c');
      g.fillStyle = grad; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 2;
      for (let y = 10; y < H; y += 26) {
        g.beginPath();
        for (let x = 0; x <= W; x += 6) { const yy = y + 5 * Math.sin(x / 14); if (x === 0) g.moveTo(x, yy); else g.lineTo(x, yy); }
        g.stroke();
      }
      break;
    }
    case 'slope': {
      const a = ((z.angle ?? 0) * Math.PI) / 180;
      const grad = g.createLinearGradient(W / 2 - Math.cos(a) * W / 2, H / 2 - Math.sin(a) * H / 2, W / 2 + Math.cos(a) * W / 2, H / 2 + Math.sin(a) * H / 2);
      grad.addColorStop(0, '#5cc25f'); grad.addColorStop(1, '#2d7d38');
      g.fillStyle = grad; g.fillRect(0, 0, W, H);
      arrows('rgba(255,255,255,0.35)', 3);
      break;
    }
    case 'boost': {
      // a rubber speed mat: warm gradient, dark hazard border, bright chevrons
      const grad = g.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#c9622f'); grad.addColorStop(1, '#a4441f');
      g.fillStyle = grad; g.fillRect(0, 0, W, H);
      arrows('#ffc27a', 2);
      g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 6; g.strokeRect(0, 0, W, H);
      g.strokeStyle = 'rgba(255,205,120,0.5)'; g.lineWidth = 2; g.strokeRect(5, 5, W - 10, H - 10);
      break;
    }
    case 'jump':
      g.fillStyle = '#ffd60a'; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(0,0,0,0.75)';
      for (let x = -H; x < W; x += 30) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + H, 0); g.lineTo(x + H + 12, 0); g.lineTo(x + 12, H); g.closePath(); g.fill(); }
      break;
    case 'tele':
      g.fillStyle = '#8a3fd8'; g.fillRect(0, 0, W, H);
      g.strokeStyle = '#e9c8ff'; g.lineWidth = 4; g.strokeRect(4, 4, W - 8, H - 8);
      for (let r = 6; r < Math.min(W, H) / 2; r += 12) { g.beginPath(); g.arc(W / 2, H / 2, r, 0, Math.PI * 2); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.stroke(); }
      break;
    case 'conveyor': {
      // black rubber belt: cross-ribs every half unit (a light edge over a
      // dark one so they read as relief) with the chevrons riding on top
      g.fillStyle = '#1f2228'; g.fillRect(0, 0, W, H);
      const a = ((z.angle ?? 0) * Math.PI) / 180;
      const ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
      const cx = W / 2, cy = H / 2, len = Math.hypot(W, H);
      g.lineCap = 'butt';
      for (let d = -len / 2; d < len / 2; d += 0.5 * PX) {
        for (const [off, col, wdt] of [[1.5, 'rgba(0,0,0,0.55)', 3], [-1, 'rgba(255,255,255,0.13)', 2]] as [number, string, number][]) {
          g.strokeStyle = col; g.lineWidth = wdt;
          g.beginPath();
          g.moveTo(cx + ux * (d + off) - vx * len, cy + uy * (d + off) - vy * len);
          g.lineTo(cx + ux * (d + off) + vx * len, cy + uy * (d + off) + vy * len);
          g.stroke();
        }
      }
      arrows('#ffd60a', 1.5);
      break;
    }
    case 'spinner': {
      // a felt turntable: twelve wedges in two purples, a few turned grooves
      // and chevrons around the outer ring that point the way it spins
      g.clearRect(0, 0, W, H);
      const r = Math.min(W, H) / 2, cx = W / 2, cy = H / 2;
      for (let i = 0; i < 12; i++) {
        g.beginPath(); g.moveTo(cx, cy);
        g.arc(cx, cy, r, (i / 12) * Math.PI * 2, ((i + 1) / 12) * Math.PI * 2);
        g.closePath();
        g.fillStyle = i % 2 ? '#6647d6' : '#8a6cff';
        g.fill();
      }
      g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 1.5;
      for (const k of [0.32, 0.5, 0.86]) { g.beginPath(); g.arc(cx, cy, r * k, 0, Math.PI * 2); g.stroke(); }
      const s = zonePower(z) < 0 ? -1 : 1;
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
      for (let i = 0; i < 6; i++) {
        const t = (i / 6) * Math.PI * 2 + Math.PI / 12;
        const nx = Math.cos(t), ny = Math.sin(t);
        const tx = -ny * s, ty = nx * s; // the felt's direction of travel here
        const ring = r * 0.68, px = cx + nx * ring, py = cy + ny * ring;
        const arm = Math.max(5, r * 0.09);
        g.beginPath();
        g.moveTo(px - tx * arm * 0.6 + nx * arm, py - ty * arm * 0.6 + ny * arm);
        g.lineTo(px + tx * arm, py + ty * arm);
        g.lineTo(px - tx * arm * 0.6 - nx * arm, py - ty * arm * 0.6 - ny * arm);
        g.stroke();
      }
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3;
      g.beginPath(); g.arc(cx, cy, r - 2.5, 0, Math.PI * 2); g.stroke();
      break;
    }
    case 'fan':
      g.fillStyle = '#2f6f8a'; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let y = 0; y < H; y += 10) g.fillRect(0, y, W, 4); // grille
      arrows('#9fe6ff', 2);
      break;
    case 'trampoline': {
      g.fillStyle = '#3d7bff'; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3;
      for (let k = 0.25; k <= 1; k += 0.25) { g.beginPath(); g.ellipse(W / 2, H / 2, (W / 2) * k, (H / 2) * k, 0, 0, Math.PI * 2); g.stroke(); }
      break;
    }
    case 'magnet': {
      const repel = zonePower(z) < 0;
      g.fillStyle = '#1a1424'; g.fillRect(0, 0, W, H);
      g.strokeStyle = repel ? '#ff8a3d' : '#ff5fb8'; g.lineWidth = 3;
      const rmax = Math.min(W, H) / 2;
      for (let k = 0.2; k <= 1; k += 0.2) { g.beginPath(); g.arc(W / 2, H / 2, rmax * k, 0, Math.PI * 2); g.stroke(); }
      g.beginPath(); g.arc(W / 2, H / 2, 6, 0, Math.PI * 2); g.fillStyle = repel ? '#ff8a3d' : '#ff5fb8'; g.fill();
      break;
    }
    case 'cannon':
      g.fillStyle = '#3a3f4a'; g.fillRect(0, 0, W, H);
      g.strokeStyle = '#ffd60a'; g.lineWidth = 3; g.strokeRect(3, 3, W - 6, H - 6);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      for (let x = 0; x < W; x += 16) for (let y = 0; y < H; y += 16) g.fillRect(x + 6, y + 6, 4, 4);
      break;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (z.kind === 'water' || z.kind === 'boost' || z.kind === 'conveyor' || z.kind === 'fan') { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; }
  return tex;
}

/** A slope zone as a real wedge: a tilted felt top over wooden faces. */
function rampMesh(z: Zone, ox: number, oy: number, topMat: THREE.Material): THREE.Group {
  const rise = rampRise(z);
  const c = [[z.x, z.y], [z.x + z.w, z.y], [z.x + z.w, z.y + z.h], [z.x, z.y + z.h]];
  const top = c.map(([x, y]) => new THREE.Vector3(x - ox, FLOOR_Y + rise * (1 - rampFrac(z, x, y)), y - oy));
  const base = c.map(([x, y]) => new THREE.Vector3(x - ox, FLOOR_Y - 0.02, y - oy));
  const group = new THREE.Group();
  // top: two triangles wound to face up, uv across the rect
  {
    const pos: number[] = [], uv: number[] = [];
    const tri = (i: number, j: number, k: number) => {
      for (const idx of [i, j, k]) { pos.push(top[idx].x, top[idx].y, top[idx].z); uv.push(idx === 1 || idx === 2 ? 1 : 0, idx === 2 || idx === 3 ? 0 : 1); }
    };
    tri(0, 2, 1); tri(0, 3, 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, topMat);
    m.receiveShadow = true;
    m.castShadow = true;
    group.add(m);
  }
  // sides: a quad per edge from the felt up to the top edge
  {
    const pos: number[] = [];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const a = base[i], b = base[j], cT = top[j], dT = top[i];
      pos.push(a.x, a.y, a.z, cT.x, cT.y, cT.z, b.x, b.y, b.z);
      pos.push(a.x, a.y, a.z, dT.x, dT.y, dT.z, cT.x, cT.y, cT.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, WALL_SIDE_MAT);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  return group;
}

function shapeFromPts(pts: number[], ox: number, oy: number): THREE.Shape {
  const sh = new THREE.Shape();
  for (let i = 0; i < pts.length; i += 2) {
    // extrude along +z, then rotate -90° about x: shape y becomes -z
    const x = pts[i] - ox, y = -(pts[i + 1] - oy);
    if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
  }
  sh.closePath();
  return sh;
}

const SPINNER_H = 0.07; // the turntable stands this proud of the felt
const BELT_H = 0.06; // belt slab thickness
const ROLLER_R = 0.11;

/** A spinner: a felt turntable in a steel collar set straight into the felt,
 *  with a chromed hub. The disc (and hub) turn; the collar stays put. */
function spinnerMesh(z: Zone, cx: number, cz: number, topMat: THREE.Material): THREE.Group {
  const r = Math.min(z.w, z.h) / 2;
  const root = new THREE.Group();
  root.position.set(cx, FLOOR_Y, cz);
  // the collar: a flat steel ring around the disc with a gap it turns in
  const collar = new THREE.Mesh(new THREE.RingGeometry(r + 0.05, r + 0.22, 64), SPINNER_RIM_MAT);
  collar.rotation.x = -Math.PI / 2;
  collar.position.y = SPINNER_H + 0.012;
  collar.receiveShadow = true;
  root.add(collar);
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.22, r + 0.22, SPINNER_H, 64, 1, true), SPINNER_RIM_MAT);
  lip.position.y = SPINNER_H / 2 + 0.011;
  lip.castShadow = true;
  root.add(lip);
  const group = new THREE.Group();
  group.position.y = 0.012;
  const rd = r - 0.01;
  const top = new THREE.Mesh(new THREE.CircleGeometry(rd, 64), topMat);
  top.rotation.x = -Math.PI / 2;
  top.position.y = SPINNER_H;
  top.receiveShadow = true;
  group.add(top);
  const side = new THREE.Mesh(new THREE.CylinderGeometry(rd, rd, SPINNER_H, 64, 1, true), SPINNER_RIM_MAT);
  side.position.y = SPINNER_H / 2;
  side.castShadow = true;
  group.add(side);
  const hr = Math.max(0.28, r * 0.13);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(hr * 0.9, hr, 0.1, 24), HUB_MAT);
  hub.position.y = SPINNER_H + 0.05;
  hub.castShadow = true;
  group.add(hub);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.75, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), HUB_MAT);
  dome.position.y = SPINNER_H + 0.1;
  dome.castShadow = true;
  group.add(dome);
  root.add(group);
  spinners.push({ group, speed: zonePower(z) });
  return root;
}

/** A conveyor: a rubber belt slab in a steel tray. Belts running along an
 *  axis get yellow rails down their sides and a faceted roller at each end
 *  that turns at belt speed; a belt set at an odd angle gets a plain frame. */
function conveyorMesh(z: Zone, cx: number, cz: number, topMat: THREE.MeshStandardMaterial): THREE.Group {
  const root = new THREE.Group();
  root.position.set(cx, FLOOR_Y + 0.012, cz);
  const angle = ((z.angle ?? 0) % 360 + 360) % 360;
  const alongX = angle % 180 === 0, alongY = angle % 180 === 90;
  const speed = zonePower(z);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(z.w, BELT_H, z.h), [BELT_SIDE_MAT, BELT_SIDE_MAT, topMat, BELT_SIDE_MAT, BELT_SIDE_MAT, BELT_SIDE_MAT]);
  belt.position.y = BELT_H / 2;
  belt.receiveShadow = true;
  belt.castShadow = true;
  root.add(belt);
  const RAIL_W = 0.16, RAIL_H = 0.16;
  const rail = (w: number, d: number, x: number, zz: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, RAIL_H, d), RAIL_MAT);
    m.position.set(x, RAIL_H / 2, zz);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  };
  if (alongX || alongY) {
    // rails on the edges the belt runs along; rollers across the two ends
    const L = alongX ? z.w : z.h, Wd = alongX ? z.h : z.w;
    for (const s of [-1, 1]) {
      if (alongX) rail(z.w, RAIL_W, 0, s * (z.h / 2 - RAIL_W / 2));
      else rail(RAIL_W, z.h, s * (z.w / 2 - RAIL_W / 2), 0);
    }
    // three's +x is golf +x and +z is golf +y, so the belt's direction is
    // (cos a, 0, sin a); a roller's axis lies across it
    const a = (angle * Math.PI) / 180;
    const axis = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
      pivot.position.set(alongX ? s * (L / 2 - ROLLER_R) : 0, BELT_H - ROLLER_R + 0.02, alongY ? s * (L / 2 - ROLLER_R) : 0);
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(ROLLER_R, ROLLER_R, Wd - RAIL_W * 2 - 0.04, 10), ROLLER_MAT);
      drum.castShadow = true;
      pivot.add(drum);
      root.add(pivot);
      // spinning about the axis by +θ moves the top of the drum against the
      // belt direction (θ̇·axis × up), so turn it the other way
      rollers.push({ mesh: drum, rate: -speed / ROLLER_R });
    }
  } else {
    const t = 0.1;
    rail(z.w, t, 0, -(z.h / 2 - t / 2));
    rail(z.w, t, 0, z.h / 2 - t / 2);
    rail(t, z.h - t * 2, -(z.w / 2 - t / 2), 0);
    rail(t, z.h - t * 2, z.w / 2 - t / 2, 0);
  }
  return root;
}

function extrudedBlock(pts: number[], ox: number, oy: number, height: number, mat: THREE.Material): THREE.Mesh {
  const geo = new THREE.ExtrudeGeometry(shapeFromPts(pts, ox, oy), {
    depth: height, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelOffset: -0.05, bevelSegments: 2,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const FELT_MAT = std({ color: 0xffffff, roughness: 0.92 });
const WALL_MAT = std({ color: 0xffffff, roughness: 0.55 });
const WALL_LOW_MAT = std({ color: 0xf3dfbc, roughness: 0.55 });
const WALL_SIDE_MAT = std({ color: 0xb59468, roughness: 0.6, side: THREE.DoubleSide });
const RUBBER_MAT = gloss({ color: 0xff7ad9, emissive: 0x3a0d2c, roughness: 0.45 });
const LASER_ON_MAT = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.35, 0.8), transparent: true, opacity: 0.9 });
const LASER_OFF_MAT = new THREE.MeshBasicMaterial({ color: 0xff2d55, transparent: true, opacity: 0.12 });
const CANNON_MAT = metal({ color: 0x2b2f3a, roughness: 0.5, metalness: 0.7 });
const CANNON_RIM_MAT = metal({ color: 0xffd60a, roughness: 0.3 });
const FAN_BLADE_MAT = gloss({ color: 0xe8f6ff });
const BED_MAT = std({ color: 0xffffff, roughness: 1, side: THREE.BackSide });
// the toy box's hardware: painted steel frames, brushed rollers, a chromed hub
const BELT_SIDE_MAT = metal({ color: 0x353a45, roughness: 0.55, metalness: 0.6 });
const RAIL_MAT = gloss({ color: 0xffc21a, roughness: 0.4 });
const ROLLER_MAT = metal({ color: 0xb8bcc4, roughness: 0.3, flatShading: true });
const SPINNER_RIM_MAT = metal({ color: 0x9aa4b8, roughness: 0.42 });
const HUB_MAT = metal({ color: 0xc9cfd8, roughness: 0.34 });
const STOCK_MATS: THREE.Material[] = [FELT_MAT, WALL_MAT, WALL_LOW_MAT, WALL_SIDE_MAT, RUBBER_MAT, LASER_ON_MAT, LASER_OFF_MAT, CANNON_MAT, CANNON_RIM_MAT, FAN_BLADE_MAT, BED_MAT,
  BELT_SIDE_MAT, RAIL_MAT, ROLLER_MAT, SPINNER_RIM_MAT, HUB_MAT];

// Water is a real pond: the felt is carved away over the zone, a pebble bed
// sits a little way down, and a translucent, rippling surface lies over it.
// Transparency only sells with depth beneath it — over the felt it would
// read as a spill.
const POND_DEPTH = 0.26; // must stay above the lawn plane (y = 0), which would otherwise show through

/** Axis-aligned rectangle subtraction: `a` minus `cut`, as up to four rects. */
function subtractRect(a: Rect, cut: Rect): Rect[] {
  const x0 = Math.max(a.x, cut.x), y0 = Math.max(a.y, cut.y);
  const x1 = Math.min(a.x + a.w, cut.x + cut.w), y1 = Math.min(a.y + a.h, cut.y + cut.h);
  if (x1 - x0 <= 0.001 || y1 - y0 <= 0.001) return [a];
  const out: Rect[] = [];
  if (y0 > a.y) out.push({ x: a.x, y: a.y, w: a.w, h: y0 - a.y }); // above
  if (a.y + a.h > y1) out.push({ x: a.x, y: y1, w: a.w, h: a.y + a.h - y1 }); // below
  if (x0 > a.x) out.push({ x: a.x, y: y0, w: x0 - a.x, h: y1 - y0 }); // left
  if (a.x + a.w > x1) out.push({ x: x1, y: y0, w: a.x + a.w - x1, h: y1 - y0 }); // right
  return out;
}

/** The floor with the ponds cut out of it. Another zone laid over a pond
 *  (a sand island, a jump pad) keeps its felt underneath, so it reads as a
 *  platform in the water rather than a slab floating over the bed. */
function carvedFloor(hole: Hole): Rect[] {
  const zones = hole.zones ?? [];
  let rects: Rect[] = hole.floor.map(r => ({ ...r }));
  for (const z of zones) {
    if (z.kind !== 'water') continue;
    let cuts: Rect[] = [z];
    for (const o of zones) if (o !== z && o.kind !== 'water') cuts = cuts.flatMap(c => subtractRect(c, o));
    for (const c of cuts) rects = rects.flatMap(r => subtractRect(r, c));
  }
  return rects;
}

/** Radial alpha for a pond surface: clearer at the banks, deeper in the middle. */
function makePondAlpha(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 40);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.7, '#d8d8d8');
  grad.addColorStop(1, '#9a9a9a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function pondMesh(z: Zone, cx: number, cz: number): THREE.Group {
  const sf = surfaces();
  const group = new THREE.Group();
  // the basin: a back-faced box whose inside is the bed and the banks
  if (!BED_MAT.map) {
    BED_MAT.map = sf.bed;
    BED_MAT.normalMap = sf.feltN.clone();
    BED_MAT.normalMap.needsUpdate = true;
    BED_MAT.normalScale.set(0.7, 0.7);
    BED_MAT.needsUpdate = true;
  }
  const basinGeo = new THREE.BoxGeometry(z.w, POND_DEPTH, z.h);
  scaleUv(basinGeo, Math.max(1, z.w / 4), Math.max(1, z.h / 4));
  const basin = new THREE.Mesh(basinGeo, BED_MAT);
  basin.position.set(cx, FLOOR_Y - POND_DEPTH / 2, cz);
  basin.receiveShadow = true;
  group.add(basin);
  // the surface, a hair below the felt so the banks show a lip
  const ripple = sf.rippleN.clone();
  ripple.repeat.set(z.w / 3, z.h / 3);
  ripple.needsUpdate = true;
  // the painted wave lines carry the stylised read; the physical layer
  // adds the sky reflection and sun sparkle over them
  const waves = makeZoneTexture(z);
  const mat = new THREE.MeshPhysicalMaterial({
    map: waves, color: 0x9ed4ff, transparent: true, opacity: 0.76, alphaMap: makePondAlpha(),
    roughness: 0.12, metalness: 0, normalMap: ripple, normalScale: new THREE.Vector2(0.9, 0.9),
    envMapIntensity: 1.6, depthWrite: false,
  });
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(z.w, z.h), mat);
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(cx, FLOOR_Y - 0.07, cz);
  surface.receiveShadow = true;
  surface.renderOrder = 2; // after the bed, so the blend sees it
  group.add(surface);
  waterMats.push(mat);
  return group;
}
const BUMPER_MAT = gloss({ color: 0xe03030, emissive: 0x400000, roughness: 0.28 });
const POST_MAT = metal({ color: 0x9aa4b8, roughness: 0.45 });
const CUP_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff });
const FLAG_MAT = std({ color: 0xe83828, side: THREE.DoubleSide, roughness: 0.9 });
let feltTex: THREE.CanvasTexture | null = null;

function disposeHole() {
  holeGroup.traverse(obj => {
    const mesh = obj as THREE.Mesh;
    mesh.geometry?.dispose();
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as (THREE.Material & { map?: THREE.Texture | null; normalMap?: THREE.Texture | null; alphaMap?: THREE.Texture | null })[];
    for (const mat of mats) {
      if (!mat || [...STOCK_MATS, BUMPER_MAT, POST_MAT, CUP_MAT, FLAG_MAT].includes(mat as any)) continue; // shared, lives on
      mat.map?.dispose();
      mat.normalMap?.dispose(); // per-zone clones of the tiling normals
      mat.alphaMap?.dispose();
      mat.dispose();
    }
  });
  holeGroup.clear();
  movers = [];
  waterMats = [];
  boostMats = [];
  teleMats = [];
  spinners = [];
  rollers = [];
  fanBlades = [];
  magnetMats = [];
  cannons = [];
  flagMesh = null;
  builtGeom = null;
}

/** Build the hole's meshes. Called when scene.holeKey changes. */
function setHole(hole: Hole) {
  disposeHole();
  const b = holeBounds(hole);
  holeCX = b.minX + b.w / 2;
  holeCY = b.minY + b.h / 2;
  fitShadowFrustum(b);
  if (!feltTex) {
    const sf = surfaces();
    feltTex = makeFeltTexture();
    FELT_MAT.map = feltTex;
    FELT_MAT.normalMap = sf.feltN;
    FELT_MAT.normalScale.set(0.35, 0.35);
    FELT_MAT.needsUpdate = true;
    for (const m of [WALL_MAT, WALL_LOW_MAT, WALL_SIDE_MAT]) {
      m.map = sf.wood;
      m.normalMap = sf.woodN;
      m.normalScale.set(0.6, 0.6);
      m.needsUpdate = true;
    }
  }

  // felt: one slab per floor rect (they overlap where rects join — fine),
  // with the ponds cut out
  for (const r of carvedFloor(hole)) {
    const geo = new THREE.BoxGeometry(r.w, FLOOR_Y, r.h);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * r.w / 6, uv.getY(i) * r.h / 6);
    const m = new THREE.Mesh(geo, FELT_MAT);
    m.position.set(r.x + r.w / 2 - holeCX, FLOOR_Y / 2, r.y + r.h / 2 - holeCY);
    m.receiveShadow = true;
    holeGroup.add(m);
  }
  // boundary walls
  const geom = geomOf(hole);
  builtGeom = geom;
  for (const seg of geom.staticSegs) {
    if (seg.h < 5 || seg.e !== undefined) continue; // block edges are built as solids below
    const dx = seg.bx - seg.ax, dy = seg.by - seg.ay;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) continue;
    const wgeo = new RoundedBoxGeometry(len + 0.5, WALL_H, 0.5, 2, 0.07);
    scaleUv(wgeo, (len + 0.5) / 4, 1);
    const m = new THREE.Mesh(wgeo, WALL_MAT);
    m.position.set((seg.ax + seg.bx) / 2 - holeCX, WALL_H / 2, (seg.ay + seg.by) / 2 - holeCY);
    m.rotation.y = -Math.atan2(dy, dx);
    m.castShadow = true;
    m.receiveShadow = true;
    holeGroup.add(m);
  }
  // blocks
  for (const bl of hole.blocks ?? []) {
    const low = bl.h !== undefined && bl.h < 5;
    const height = low ? Math.max(0.2, bl.h!) : WALL_H;
    const rubber = bl.bounce !== undefined && bl.bounce > 1;
    const mat = rubber ? RUBBER_MAT : low ? WALL_LOW_MAT : WALL_MAT;
    if (!bl.motion) {
      const m = extrudedBlock(bl.pts, holeCX, holeCY, height, mat);
      m.position.y = FLOOR_Y;
      holeGroup.add(m);
      continue;
    }
    let px: number, py: number;
    if (bl.motion.type === 'rotate' || bl.motion.type === 'swing') { px = bl.motion.cx; py = bl.motion.cy; }
    else { let sx = 0, sy = 0; const n = bl.pts.length / 2; for (let i = 0; i < bl.pts.length; i += 2) { sx += bl.pts[i]; sy += bl.pts[i + 1]; } px = sx / n; py = sy / n; }
    const group = new THREE.Group();
    group.position.set(px - holeCX, FLOOR_Y, py - holeCY);
    const laser = bl.motion.type === 'blink';
    const body = extrudedBlock(bl.pts, px, py, laser ? height * 1.3 : height, laser ? LASER_ON_MAT : mat);
    if (laser) { body.castShadow = false; body.receiveShadow = false; }
    group.add(body);
    if (bl.hub && (bl.motion.type === 'rotate' || bl.motion.type === 'swing')) {
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(bl.hub, bl.hub, height + 0.3, 16), WALL_MAT);
      hub.position.y = (height + 0.3) / 2;
      hub.castShadow = true;
      group.add(hub);
    }
    holeGroup.add(group);
    movers.push({ block: bl, group, pivotX: px, pivotY: py, mesh: laser ? body : undefined });
  }
  // zones
  (hole.zones ?? []).forEach((z, i) => {
    const cx = z.x + z.w / 2 - holeCX, cz = z.y + z.h / 2 - holeCY;
    if (z.kind === 'water') { holeGroup.add(pondMesh(z, cx, cz)); return; }
    const tex = makeZoneTexture(z);
    const flat = z.kind === 'tele' || z.kind === 'magnet';
    // portals and magnets are emitters (over-bright so they bloom)
    const glow = 1.7;
    const mat = flat
      ? new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(glow, glow, glow), transparent: true, opacity: 0.85 })
      : std({ map: tex });
    if (!flat) {
      const sm = mat as THREE.MeshStandardMaterial;
      const sf = surfaces();
      // zone planes map uv 0..1 over the whole rect, so each zone gets its
      // own copy of the tiling normal map with the repeat set in world units
      const tiled = (n: THREE.CanvasTexture, unit: number) => {
        const t = n.clone();
        t.repeat.set(z.w / unit, z.h / unit);
        t.needsUpdate = true;
        return t;
      };
      if (z.kind === 'ice') {
        sm.roughness = 0.14;
      } else if (z.kind === 'sand') {
        sm.roughness = 1; sm.normalMap = tiled(sf.feltN, 3); sm.normalScale.set(0.9, 0.9);
      } else if (z.kind === 'slope') {
        sm.roughness = 0.92; sm.normalMap = tiled(sf.feltN, 6); sm.normalScale.set(0.35, 0.35);
      } else if (z.kind === 'conveyor') {
        sm.roughness = 0.62; sm.metalness = 0.05; // rubber, not steel
      } else if (z.kind === 'spinner') {
        const d = Math.min(z.w, z.h);
        sm.roughness = 0.9; sm.normalMap = sf.feltN.clone(); sm.normalMap.repeat.set(d / 6, d / 6); sm.normalMap.needsUpdate = true; sm.normalScale.set(0.35, 0.35);
      } else if (z.kind === 'cannon') {
        sm.roughness = 0.5; sm.metalness = 0.4;
      } else if (z.kind === 'jump' || z.kind === 'boost' || z.kind === 'trampoline') {
        sm.roughness = 0.45;
      }
    }
    if (z.kind === 'slope') {
      holeGroup.add(rampMesh(z, holeCX, holeCY, mat));
      return;
    }
    if (z.kind === 'spinner') {
      holeGroup.add(spinnerMesh(z, cx, cz, mat));
      return;
    }
    if (z.kind === 'conveyor') {
      holeGroup.add(conveyorMesh(z, cx, cz, mat as THREE.MeshStandardMaterial));
    } else {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(z.w, z.h), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(cx, FLOOR_Y + 0.012 + i * 0.001, cz);
      m.receiveShadow = true;
      holeGroup.add(m);
    }
    if (z.kind === 'boost' || z.kind === 'conveyor' || z.kind === 'fan') {
      // texture u runs along golf +x, v along golf −y (the plane is laid flat
      // by rotating −90° about x), so scroll u with cos and v against sin
      const a = ((z.angle ?? 0) * Math.PI) / 180;
      const rate = z.kind === 'conveyor' ? Math.max(1, zonePower(z)) * 0.06 : z.kind === 'fan' ? 0.9 : 0.6;
      boostMats.push({ mat: mat as THREE.MeshStandardMaterial, dx: Math.cos(a) * z.w, dy: Math.sin(a) * z.h, rate });
    }
    if (z.kind === 'magnet') magnetMats.push(mat as THREE.MeshBasicMaterial);
    if (z.kind === 'fan') {
      // a propeller whirring in a hub at the centre
      const group = new THREE.Group();
      group.position.set(cx, FLOOR_Y + 0.35, cz);
      const r = Math.min(z.w, z.h) * 0.32;
      for (let k = 0; k < 3; k++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(r, 0.08, 0.34), FAN_BLADE_MAT);
        blade.position.set(Math.cos((k / 3) * Math.PI * 2) * r * 0.5, 0, Math.sin((k / 3) * Math.PI * 2) * r * 0.5);
        blade.rotation.y = -(k / 3) * Math.PI * 2;
        blade.rotation.x = 0.5;
        group.add(blade);
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.5, 12), CANNON_MAT);
      group.add(hub);
      holeGroup.add(group);
      fanBlades.push(group);
    }
    if (z.kind === 'cannon') {
      // a barrel on a base, cocked up for the loft; it swings to follow the
      // aim of whoever is loaded in it (see drawScene)
      const len = Math.max(1.2, Math.min(z.w, z.h) * 0.9);
      const group = new THREE.Group();
      group.position.set(cx, FLOOR_Y + 0.55, cz);
      const dir = new THREE.Vector3(1, 0.55, 0).normalize();
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, len, 16), CANNON_MAT);
      barrel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      barrel.position.set(dir.x * len * 0.25, dir.y * len * 0.25, dir.z * len * 0.25);
      barrel.castShadow = true;
      group.add(barrel);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.06, 8, 20), CANNON_RIM_MAT);
      rim.quaternion.copy(barrel.quaternion);
      rim.rotateX(Math.PI / 2);
      rim.position.set(dir.x * len * 0.75, dir.y * len * 0.75, dir.z * len * 0.75);
      group.add(rim);
      const restAngle = ((z.angle ?? 0) * Math.PI) / 180;
      group.rotation.y = -restAngle;
      holeGroup.add(group);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.5, 16), CANNON_MAT);
      base.position.set(cx, FLOOR_Y + 0.25, cz);
      base.castShadow = true;
      holeGroup.add(base);
      cannons.push({ zone: z, group, restAngle });
    }
    if (z.kind === 'tele') {
      teleMats.push(mat as THREE.MeshBasicMaterial);
      if (z.tx !== undefined && z.ty !== undefined) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.09, 8, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.9, 2.4) }));
        ring.rotation.x = Math.PI / 2;
        ring.position.set(z.tx - holeCX, FLOOR_Y + 0.05, z.ty - holeCY);
        holeGroup.add(ring);
      }
    }
  });
  // bumpers + posts
  for (const bp of hole.bumpers ?? []) {
    const h = bp.kick > 0 ? 0.9 : 1.1;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(bp.r, bp.r * 1.05, h, 20), bp.kick > 0 ? BUMPER_MAT : POST_MAT);
    body.position.set(bp.x - holeCX, FLOOR_Y + h / 2, bp.y - holeCY);
    body.castShadow = true;
    holeGroup.add(body);
    if (bp.kick > 0) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(bp.r * 0.8, 0.07, 8, 24), gloss({ color: 0xffffff }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(bp.x - holeCX, FLOOR_Y + h + 0.02, bp.y - holeCY);
      holeGroup.add(ring);
    }
  }
  // cup + flag
  {
    const cup = new THREE.Mesh(new THREE.CircleGeometry(CUP_R, 28), CUP_MAT);
    if (!CUP_MAT.map) { CUP_MAT.map = surfaces().cup; CUP_MAT.needsUpdate = true; }
    cup.rotation.x = -Math.PI / 2;
    cup.position.set(hole.cup.x - holeCX, FLOOR_Y + 0.02, hole.cup.y - holeCY);
    holeGroup.add(cup);
    const rim = new THREE.Mesh(new THREE.RingGeometry(CUP_R, CUP_R + 0.14, 28), gloss({ color: 0xf0f0f0, roughness: 0.4 }));
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(hole.cup.x - holeCX, FLOOR_Y + 0.021, hole.cup.y - holeCY);
    holeGroup.add(rim);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 5, 8), gloss({ color: 0xf4f4f4, roughness: 0.4 }));
    stick.position.set(hole.cup.x - holeCX, FLOOR_Y + 2.5, hole.cup.y - holeCY);
    stick.castShadow = true;
    holeGroup.add(stick);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.0, 12, 4), FLAG_MAT);
    flag.position.set(hole.cup.x - holeCX + 0.85, FLOOR_Y + 4.4, hole.cup.y - holeCY);
    flag.castShadow = true;
    holeGroup.add(flag);
    flagMesh = flag;
    // tee marker
    const tee = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
    tee.rotation.x = -Math.PI / 2;
    tee.position.set(hole.tee.x - holeCX, FLOOR_Y + 0.012, hole.tee.y - holeCY);
    holeGroup.add(tee);
  }
}

/** Particle burst at a golf-world point (impact FX driven by main.ts). */
export function burstAt(x: number, y: number, z: number, color: number, count = 14, speed = 12, gravity = -40) {
  spawnBurst(toThree(x, y, z + 0.2), color, count, speed, 0.7, gravity);
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _UPV = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------------------
// Per-frame update
// ---------------------------------------------------------------------------
let lastFrame = 0;

export function drawScene(scene: GolfScene) {
  if (!renderer) return;
  resizeToDisplay(renderer.domElement);
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrame) / 1000 || 0.016);
  lastFrame = now;

  if (scene.hole && scene.holeKey !== builtHoleKey) {
    builtHoleKey = scene.holeKey;
    setHole(scene.hole);
    resetLook();
    // everybody's golfer teleports to the new tee — no walking across holes
    for (const g of golfers) { g.px = NaN; g.holedAt = -1; g.wasHoled = false; g.swingStart = -1; }
  }
  if (!scene.hole && builtHoleKey) { builtHoleKey = ''; disposeHole(); fitShadowFrustum(null); }
  const hole = scene.hole;

  // movers + surface animation
  const t = scene.t;
  for (const m of movers) {
    const mo = m.block.motion!;
    if (mo.type === 'rotate' || mo.type === 'swing') m.group.rotation.y = -motionAngle(mo, t);
    else if (mo.type === 'slide') {
      const k = Math.sin(((t / mo.period) + (mo.phase ?? 0)) * Math.PI * 2);
      m.group.position.set(m.pivotX - holeCX + mo.dx * k, FLOOR_Y, m.pivotY - holeCY + mo.dy * k);
    } else if (mo.type === 'blink' && m.mesh) {
      m.mesh.material = moverActive(m.block, t) ? LASER_ON_MAT : LASER_OFF_MAT;
    }
  }
  for (const s of spinners) s.group.rotation.y = -s.speed * t;
  for (const r of rollers) r.mesh.rotation.y = (r.rate * t) % (Math.PI * 2);
  // a loaded cannon tracks the loaded player's aim; otherwise it rests
  const meAim = scene.players.find(p => p.me);
  for (const c of cannons) {
    const loaded = !!meAim && scene.aim && meAim.x >= c.zone.x && meAim.x <= c.zone.x + c.zone.w && meAim.y >= c.zone.y && meAim.y <= c.zone.y + c.zone.h;
    const want = loaded && scene.aim ? scene.aim.angle : c.restAngle;
    let d = -want - c.group.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    c.group.rotation.y += d * (1 - Math.exp(-10 * dt));
  }
  for (const f of fanBlades) f.rotation.y = -(now / 45) % (Math.PI * 2);
  for (const mm of magnetMats) mm.opacity = 0.65 + 0.3 * Math.sin(now / 180);
  for (const w of waterMats) if (w.normalMap) {
    // two drifts at different rates so the ripple never visibly loops
    w.normalMap.offset.x = (now / 7000) % 1;
    w.normalMap.offset.y = (now / 11000) % 1 + Math.sin(now / 1900) * 0.03;
    if (w.map) { w.map.offset.x = (now / 9000) % 1; w.map.offset.y = Math.sin(now / 1400) * 0.02; }
  }
  for (const bm of boostMats) if (bm.mat.map) {
    // image moves toward −u as offset.x grows, so subtract along the belt
    const k = (now / 1000) * bm.rate;
    bm.mat.map.offset.x = -((k * bm.dx) / Math.max(1, Math.abs(bm.dx) || 1)) % 1;
    bm.mat.map.offset.y = ((k * bm.dy) / Math.max(1, Math.abs(bm.dy) || 1)) % 1;
  }
  for (const tm of teleMats) tm.opacity = 0.7 + 0.25 * Math.sin(now / 250);
  if (flagMesh) {
    // cloth ripple: waves run out from the pole and grow toward the free edge
    flagMesh.rotation.y = Math.sin(now / 350) * 0.25;
    const pos = flagMesh.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const k = (pos.getX(i) + 0.85) / 1.7;
      pos.setZ(i, Math.sin(k * 7 - now / 140) * 0.13 * k * k + Math.sin(k * 3 + now / 300) * 0.05 * k);
    }
    pos.needsUpdate = true;
    flagMesh.geometry.computeVertexNormals();
  }

  // --- balls -----------------------------------------------------------------
  const seen = new Set<string>();
  for (const p of scene.players) {
    seen.add(p.id);
    let prop = ballByPlayer.get(p.id);
    if (!prop) {
      prop = ballPool.find(b => ![...ballByPlayer.values()].includes(b));
      if (!prop) continue;
      ballByPlayer.set(p.id, prop);
      prop.mat.color.setHex(p.color);
    }
    if (p.holed || !hole) { prop.mesh.visible = false; prop.blob.visible = false; continue; }
    const pos = toThree(p.x, p.y, p.z);
    pos.y += BALL_R;
    // rolling: spin about the axis perpendicular to travel
    const dxm = pos.x - prop.mesh.position.x, dzm = pos.z - prop.mesh.position.z;
    const moved = Math.hypot(dxm, dzm);
    if (moved > 0.0005 && moved < 5) {
      _axis.set(dzm, 0, -dxm).normalize();
      prop.mesh.rotateOnWorldAxis(_axis, moved / BALL_R);
    }
    prop.mesh.position.copy(pos);
    prop.mesh.visible = true;
    prop.mat.transparent = p.ghost;
    prop.mat.opacity = p.ghost ? 0.45 : 1;
    prop.mat.needsUpdate = false;
    prop.blob.visible = true;
    // the shadow lies on the felt under the ball — up a ramp when it is on one
    const ground = builtGeom ? groundZ(builtGeom, p.x, p.y) : 0;
    prop.blob.position.set(pos.x, FLOOR_Y + ground + 0.03, pos.z);
    const sc = Math.max(0.5, 1 - Math.max(0, p.z - ground) / 12);
    prop.blob.scale.set(sc, sc, sc);
    (prop.blob.material as THREE.MeshBasicMaterial).opacity = p.ghost ? 0.15 : 0.45 * sc;
  }
  for (const [id, prop] of [...ballByPlayer]) {
    if (!seen.has(id)) { prop.mesh.visible = false; prop.blob.visible = false; ballByPlayer.delete(id); }
  }

  // --- golfers ---------------------------------------------------------------
  // Only the nearest few players get a full 3D golfer (a 32-player tee would
  // be a wall of bodies); everyone else is a ball with a name tag.
  const meP = scene.players.find(p => p.me);
  const rigged = new Set<string>();
  if (meP) {
    const byDist = [...scene.players].sort((a, b) => (a.me ? -1 : b.me ? 1 : 0) || (Math.hypot(a.x - meP.x, a.y - meP.y) - Math.hypot(b.x - meP.x, b.y - meP.y)));
    for (const p of byDist.slice(0, MAX_RIGS)) rigged.add(p.id);
  } else for (const p of scene.players.slice(0, MAX_RIGS)) rigged.add(p.id);
  for (const [id, slot] of [...rigByPlayer]) if (!seen.has(id) || !rigged.has(id)) { rigByPlayer.delete(id); playerRigs[slot].root.visible = false; }
  let myBall: THREE.Vector3 | null = null;
  let myPlayer: GolfPlayer | null = null;
  for (const p of scene.players) {
    if (p.me) { const bp = toThree(p.x, p.y, 0); bp.y += BALL_R; myBall = bp; myPlayer = p; }
    if (!rigged.has(p.id)) continue;
    let slot = rigByPlayer.get(p.id);
    if (slot === undefined) {
      const used = new Set(rigByPlayer.values());
      slot = playerRigs.findIndex((_r, i) => !used.has(i));
      if (slot < 0) continue;
      rigByPlayer.set(p.id, slot);
      golferState(slot).px = NaN;
    }
    const rig = playerRigs[slot];
    const st = golferState(slot);
    if (!hole) { rig.root.visible = false; continue; }
    rig.root.visible = true;
    const character = CHARACTERS[p.characterId] ?? CHARACTERS[0];
    applyCharacter(rig, character);

    const ballPos = toThree(p.x, p.y, 0);
    // stance: beside the ball, facing across the target line
    const facing = p.holed ? st.lastFacing : p.facing;
    st.lastFacing = facing;
    const sx = Math.cos(facing), sz = Math.sin(facing);
    // golfer faces across the target line (right-handers: target to their
    // left); odd seats set up on the far side so a shared tee reads as a
    // group instead of one body inside another
    const side = p.seat % 2 ? -1 : 1;
    const fx = -sz * side, fz = sx * side;
    // and spread along the line by seat, so a crowded tee fans out
    const along = ((Math.floor(p.seat / 2) % 4) - 1.5) * 1.4;
    const anchor = p.holed ? toThree(hole.cup.x, hole.cup.y, 0) : ballPos;
    const tx = anchor.x - fx * 1.9 + sx * along, tz = anchor.z - fz * 1.9 + sz * along;
    if (Number.isNaN(st.px)) { st.px = tx; st.pz = tz; }
    const ddx = tx - st.px, ddz = tz - st.pz;
    const dist = Math.hypot(ddx, ddz);
    let moving = false;
    let moveYaw = 0;
    if (dist > 0.2 && p.resting) {
      const step = Math.min(dist, 9 * dt);
      st.px += (ddx / dist) * step;
      st.pz += (ddz / dist) * step;
      rig.runPhase += step * RUN_STRIDE_RATE;
      moving = dist > 0.5;
      moveYaw = Math.atan2(ddx, ddz);
    }
    rig.root.position.x = st.px;
    rig.root.position.z = st.pz;

    // shot → putt animation, timed so contact lands now
    if (p.shotSeq !== st.lastShotSeq) {
      if (st.lastShotSeq !== -1) {
        st.swingPower = p.shotPower;
        st.swingMs = 820 - 260 * p.shotPower;
        st.swingStart = now - st.swingMs * 0.42;
      }
      st.lastShotSeq = p.shotSeq;
    }
    if (p.holed && !st.wasHoled) { st.holedAt = now; }
    st.wasHoled = p.holed;

    let target: Pose;
    let rate = 12;
    const yawStance = Math.atan2(fx, fz);
    let yaw = yawStance;
    if (moving) { target = runPose(rig.runPhase, 0); rate = 16; yaw = moveYaw; }
    else if (st.swingStart >= 0 && now - st.swingStart < st.swingMs) {
      target = golfSwingPose((now - st.swingStart) / st.swingMs, st.swingPower, now, rig.runSeed);
      rate = 28;
    } else if (p.holed && now - st.holedAt < 3000) {
      target = golfCheerPose(now); rate = 14;
    } else if (p.me && scene.aim) {
      target = golfAddressPose(now, rig.runSeed); rate = 10;
    } else if (!p.resting && !p.holed) {
      // watching the ball roll: stay down over the shot
      target = golfAddressPose(now, rig.runSeed); target.leanF *= 0.6; rate = 6;
    } else if (!p.holed && !p.me && dist <= 0.2) {
      target = golfIdlePose(now, rig.runSeed);
    } else {
      target = golfIdlePose(now, rig.runSeed);
    }
    rig.yaw = blendAngle(rig.yaw, yaw, moving ? 12 : 8, dt);
    applyPose(rig, target, rate, dt, rig.yaw, now);
    rig.root.rotation.x = 0;
    rig.root.rotation.z = 0;

    // eyes on the ball (or the cup when done)
    const look = p.holed ? toThree(hole.cup.x, hole.cup.y, 0) : ballPos;
    const hy = wrapAngle(Math.atan2(look.x - st.px, look.z - st.pz) - rig.yaw);
    const targetY = THREE.MathUtils.clamp(hy - rig.pose.twist, -0.9, 0.9);
    const horiz = Math.hypot(look.x - st.px, look.z - st.pz);
    const targetX = THREE.MathUtils.clamp(-Math.atan2(look.y - 4.5, Math.max(1.5, horiz)), -0.5, 0.45);
    const ha = 1 - Math.exp(-8 * dt);
    rig.head.rotation.y += (targetY - rig.head.rotation.y) * ha;
    rig.head.rotation.x += (targetX - rig.head.rotation.x) * ha;
  }

  // --- aim props -------------------------------------------------------------
  if (scene.aim && myBall && myPlayer) {
    const a = scene.aim;
    const sx = Math.cos(a.angle), sz = Math.sin(a.angle);
    const len = 2 + a.power * 7;
    aimArrow.visible = true;
    aimArrow.scale.set(len, 0.32, 1);
    aimArrow.rotation.order = 'YXZ';
    aimArrow.rotation.y = -Math.atan2(sz, sx);
    aimArrow.rotation.x = -Math.PI / 2;
    aimArrow.position.set(myBall.x + sx * (BALL_R + len / 2), FLOOR_Y + 0.04, myBall.z + sz * (BALL_R + len / 2));
    aimHead.visible = true;
    aimHead.rotation.order = 'YXZ';
    aimHead.rotation.y = -Math.atan2(sz, sx);
    aimHead.rotation.x = -Math.PI / 2;
    aimHead.position.set(myBall.x + sx * (BALL_R + len + 0.3), FLOOR_Y + 0.045, myBall.z + sz * (BALL_R + len + 0.3));
    const heat = new THREE.Color().setHSL(THREE.MathUtils.lerp(0.25, 0.0, a.power), 1, 0.55).multiplyScalar(1.9);
    (aimArrow.material as THREE.MeshBasicMaterial).color.copy(heat);
    (aimHead.material as THREE.MeshBasicMaterial).color.copy(heat);
  } else {
    aimArrow.visible = false;
    aimHead.visible = false;
  }

  // --- juice -----------------------------------------------------------------
  updateParticles(dt);
  shakeAmp *= Math.exp(-dt * 5.5);
  if (shakeAmp < 0.005) shakeAmp = 0;

  // --- camera ----------------------------------------------------------------
  const targetFov = fovForAspect(46);
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov = targetFov;
    camera.updateProjectionMatrix();
  }
  const wantPos = _v1;
  const wantLook = _v2;
  let rate = 3.2;
  const b = hole ? holeBounds(hole) : null;
  const cut = camMode !== scene.cam;
  camMode = scene.cam;
  if (scene.cam === 'play' && myBall && myPlayer && hole) {
    // direction: the aim while aiming (held still during a pointer drag —
    // the drag is read in screen space, so a camera that chased the aim
    // would feed back into it and judder), the roll while rolling, else the cup
    let dx: number, dz: number;
    if (scene.aim && scene.aim.lockCam) { dx = camDir.x; dz = camDir.z; }
    else if (scene.aim) { dx = Math.cos(scene.aim.angle); dz = Math.sin(scene.aim.angle); }
    else if (!myPlayer.resting && Math.hypot(myPlayer.vx, myPlayer.vy) > 2) { const l = Math.hypot(myPlayer.vx, myPlayer.vy); dx = myPlayer.vx / l; dz = myPlayer.vy / l; }
    else if (myPlayer.holed) { dx = camDir.x; dz = camDir.z; }
    else { const cx = hole.cup.x - holeCX - myBall.x, cz = hole.cup.y - holeCY - myBall.z; const l = Math.hypot(cx, cz) || 1; dx = cx / l; dz = cz / l; }
    const dr = 1 - Math.exp(-(scene.aim ? 5 : 2.5) * dt);
    camDir.x += (dx - camDir.x) * dr;
    camDir.z += (dz - camDir.z) * dr;
    camDir.y = 0;
    if (camDir.lengthSq() < 0.01) camDir.set(1, 0, 0);
    camDir.normalize();
    const back = scene.aim ? 18.5 : 17, up = scene.aim ? 10 : 8.5;
    wantPos.set(myBall.x - camDir.x * back, myBall.y + up, myBall.z - camDir.z * back);
    wantLook.set(myBall.x + camDir.x * 5, myBall.y + 0.4, myBall.z + camDir.z * 5);
    rate = scene.aim ? 6 : 3.2;
  } else if (scene.cam === 'cup' && hole) {
    const c = toThree(hole.cup.x, hole.cup.y, 0);
    const ang = now / 5000;
    wantPos.set(c.x + Math.cos(ang) * 16, c.y + 7.5, c.z + Math.sin(ang) * 16);
    wantLook.set(c.x, c.y + 0.5, c.z);
    rate = 2;
  } else if (b) {
    const H = Math.max(b.w, b.h * 1.4) * 0.72 + 14;
    wantPos.set(0, H, H * 0.62 + 4);
    wantLook.set(0, 0, -2);
    rate = 2.2;
  } else {
    wantPos.copy(CAM_POS);
    wantLook.copy(CAM_TARGET);
  }
  if (cut) resetLook();
  if (!lookIsDefault()) {
    // swing the mode's camera around its own look target
    const off = _v3.subVectors(wantPos, wantLook);
    const az = Math.atan2(off.z, off.x) + look.yaw;
    const elev = THREE.MathUtils.clamp(Math.atan2(off.y, Math.hypot(off.x, off.z)) + look.pitch, 0.06, 1.5);
    const dist = off.length() * look.zoom;
    wantPos.set(
      wantLook.x + Math.cos(az) * Math.cos(elev) * dist,
      wantLook.y + Math.sin(elev) * dist,
      wantLook.z + Math.sin(az) * Math.cos(elev) * dist
    );
    if (now - lookMovedAt < 250) rate = Math.max(rate, 14); // no lag under the hand
  }
  // never below the felt, never off the lawn
  wantPos.y = Math.max(wantPos.y, FLOOR_Y + 2.5);
  wantPos.x = THREE.MathUtils.clamp(wantPos.x, -GROUND_R + 6, GROUND_R - 6);
  wantPos.z = THREE.MathUtils.clamp(wantPos.z, -GROUND_R + 6, GROUND_R - 6);
  if (cut) { camPos.copy(wantPos); camLook.copy(wantLook); }
  else {
    const k = 1 - Math.exp(-rate * dt);
    camPos.lerp(wantPos, k);
    camLook.lerp(wantLook, k);
  }
  const sx = (Math.sin(now * 0.081) + Math.sin(now * 0.023)) * 0.5 * shakeAmp;
  const sy = (Math.sin(now * 0.097 + 2) + Math.sin(now * 0.031 + 1)) * 0.5 * shakeAmp;
  camera.position.set(camPos.x + sx, camPos.y + sy, camPos.z + sx * 0.4);
  camera.lookAt(camLook.x + sx * 0.5, camLook.y + sy * 0.5, camLook.z);
  if (targetFov > 46) camera.rotateX(-THREE.MathUtils.degToRad((targetFov - 46) * 0.14));

  if (!document.hidden) composer!.render();
}

/** Reset pooled state when leaving a room (rigs/balls hide until reused). */
export function resetScene() {
  rigByPlayer.clear();
  for (const r of playerRigs) r.root.visible = false;
  for (const [, prop] of ballByPlayer) { prop.mesh.visible = false; prop.blob.visible = false; }
  ballByPlayer.clear();
  camMode = '';
  resetLook();
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// ---------------------------------------------------------------------------
// Character-select live previews: every card shows its character as a real
// animated 3D rig. One shared WebGL canvas is laid over the select screen
// and scissored into a viewport per card (18 separate canvases would blow
// through the browser's WebGL context limit); rects are re-read every frame
// so scrolling and hover transforms stay aligned, and every draw is
// scissored to the scroll panel so characters vanish at its edges. The loop
// self-throttles: while the select screen is hidden every slot rect is
// zero and the frame exits before touching the GPU.
// ---------------------------------------------------------------------------
interface PreviewSlot {
  scene: THREE.Scene;
  rig: PlayerRig;
  el: HTMLElement;
  seed: number;
  clip?: HTMLElement; // per-slot clip container (default: the select grid)
}
let previewRenderer: THREE.WebGLRenderer | null = null;
let previewEnv: THREE.Texture | null = null; // the preview context's own PMREM sky
let previewCam: THREE.PerspectiveCamera | null = null;
let previewSlots: PreviewSlot[] = [];
// scroll container the characters are clipped to — without it they would
// keep drawing above/below the panel once their card scrolls out of it
let previewClip: HTMLElement | null = null;

export function initCharacterPreviews(
  canvas: HTMLCanvasElement,
  slots: { char: Character; el: HTMLElement }[],
  clipEl: HTMLElement
) {
  previewClip = clipEl;
  previewRenderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  previewRenderer.toneMappingExposure = 1.1;
  previewEnv = makeEnvironment(previewRenderer);
  previewCam = new THREE.PerspectiveCamera(40, 1, 0.5, 60);
  previewSlots = slots.map(({ char, el }, i) => ({ ...previewScene(char), el, seed: i * 1.73 }));
  requestAnimationFrame(previewFrame);
}

// Add a preview slot after init — the career-pro card and the creator both
// show a look that changes at runtime. Returns an updater that re-dresses
// the slot's rig (applyCharacter no-ops when the look key is unchanged).
export function registerPreviewSlot(
  char: Character,
  el: HTMLElement,
  clip?: HTMLElement
): (next: Character) => void {
  const slot = previewScene(char);
  previewSlots.push({ ...slot, el, clip, seed: previewSlots.length * 1.73 });
  return next => applyCharacter(slot.rig, next);
}

// One character on a showcase plinth: key light from the front-left, the
// sky map for fill and the same lacquered/cloth materials as in the game.
function previewScene(char: Character): { scene: THREE.Scene; rig: PlayerRig } {
  const scene = new THREE.Scene();
  scene.environment = previewEnv;
  scene.environmentIntensity = 0.6;
  const rig = makePlayerRig(0, scene);
  applyCharacter(rig, char);
  const sun = new THREE.DirectionalLight(0xfff2df, 3.2);
  sun.position.set(-3, 6, 5);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x39406b, 0.3));
  return { scene, rig };
}

let previewDrew = false; // last frame put pixels on the canvas
let previewHadVisible = false;
let previewShownAt = 0; // when slots (re)appeared — drives the entrance fade

function previewFrame() {
  requestAnimationFrame(previewFrame);
  const now = performance.now();
  const r = previewRenderer!;
  const canvas = r.domElement;
  const canvasRect = canvas.getBoundingClientRect();
  const defaultClip = previewClip!.getBoundingClientRect();
  const clipOf = (s: PreviewSlot) =>
    s.clip ? s.clip.getBoundingClientRect() : defaultClip;

  // slots collapse to zero rects while their screen is display:none —
  // one final clear wipes the canvas, then frames become no-ops
  const visible = previewSlots.filter(s => {
    const rect = s.el.getBoundingClientRect();
    const clip = clipOf(s);
    return (
      rect.width > 0 &&
      rect.right > clip.left && rect.left < clip.right &&
      rect.bottom > clip.top && rect.top < clip.bottom
    );
  });
  if (visible.length === 0 && !previewDrew) {
    previewHadVisible = false;
    return;
  }

  // the cards stagger in over ~0.7s when the screen (re)opens; fade the
  // canvas alongside them so the characters don't pop in over empty cards
  if (visible.length > 0 && !previewHadVisible) previewShownAt = now;
  previewHadVisible = visible.length > 0;
  canvas.style.opacity = Math.min(1, Math.max(0, (now - previewShownAt - 100) / 450)).toFixed(3);

  const cw = canvas.clientWidth;
  const chh = canvas.clientHeight;
  if (cw === 0 || chh === 0) return;
  if (canvas.width !== Math.floor(cw * r.getPixelRatio()) || canvas.height !== Math.floor(chh * r.getPixelRatio())) {
    r.setSize(cw, chh, false);
  }

  // clear the whole canvas (transparent), then scissor per card
  r.setScissorTest(false);
  r.setClearColor(0x000000, 0);
  r.clear();
  r.setScissorTest(true);
  previewDrew = visible.length > 0;

  for (const s of visible) {
    const rect = s.el.getBoundingClientRect();
    const clip = clipOf(s);

    // idle life: slow showcase sway (mostly front-facing), breathing, and a
    // relaxed arm hang with a tiny sway — the game's pose system is not
    // running here, so the joints are posed directly
    const t = now / 1000 + s.seed;
    const rig = s.rig;
    rig.root.rotation.y = Math.sin(t * 0.55) * 0.65;
    rig.root.position.y = Math.sin(t * 2.0) * 0.035;
    rig.upper.rotation.x = 0.04 + Math.sin(t * 2.0) * 0.02;
    rig.shoulderL.rotation.set(-0.22 + Math.sin(t * 1.7) * 0.05, 0, 0.14);
    rig.elbowL.rotation.x = -0.5;
    rig.shoulderR.rotation.set(-0.3 + Math.sin(t * 1.7 + 1.2) * 0.05, 0, -0.16);
    rig.elbowR.rotation.x = -0.55;

    // viewport spans the full slot (so a half-scrolled character clips
    // rather than squashes); scissor is the slot ∩ scroll panel ∩ canvas
    const sx0 = Math.max(rect.left, clip.left, canvasRect.left);
    const sx1 = Math.min(rect.right, clip.right, canvasRect.right);
    const sy0 = Math.max(rect.top, clip.top, canvasRect.top);
    const sy1 = Math.min(rect.bottom, clip.bottom, canvasRect.bottom);
    if (sx1 <= sx0 || sy1 <= sy0) continue;
    const left = rect.left - canvasRect.left;
    const bottom = canvasRect.bottom - rect.bottom;
    r.setViewport(left, bottom, rect.width, rect.height);
    r.setScissor(sx0 - canvasRect.left, canvasRect.bottom - sy1, sx1 - sx0, sy1 - sy0);
    previewCam!.aspect = rect.width / rect.height;
    previewCam!.updateProjectionMatrix();
    // frames the full height range: GRANNY's shoes up to MYSTO's hat tip
    previewCam!.position.set(0, 3.3, 9.4);
    previewCam!.lookAt(0, 2.85, 0);
    r.render(s.scene, previewCam!);
  }
}
