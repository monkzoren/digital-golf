// Scene themes for the 3D renderer: everything about a hole's WORLD that is
// not the hole itself — the sky it sits under (which is also the light every
// PBR surface reflects), the ground it sits on (or does not: a space hole
// floats), the fog, the sun and the fill, the felt, the rails and blocks,
// the tints of the hazards, and any scenery built around the hole.
//
// A theme is one record here plus a palette in render.ts (`THEMES`, the 2D
// look for the editor and thumbnails) and its name in `THEME_NAMES`
// (shared/mapformat.ts). The painters draw procedurally onto canvases — there
// are no art assets — and every one is deterministic (texHash), so a theme
// looks the same on every machine.
import * as THREE from 'three';
import { buildProp, PROP_SIZE } from './props3d';
import type { PropKind } from '@shared/courses';

export type Painter = (g: CanvasRenderingContext2D, W: number, H: number) => void;

export interface MatSpec {
  color: number;
  roughness: number;
  metalness?: number;
  /** over-bright emissive colours (> 1.35 in any channel) bloom */
  emissive?: THREE.Color;
  emissiveIntensity?: number;
  /** oak grain + rounded edges (the park's wooden rails) */
  wood?: boolean;
}

export interface SceneTheme {
  /** the equirect panorama: background and image-based lighting in one. `sun` is the key light's direction. */
  sky: (g: CanvasRenderingContext2D, W: number, H: number, sun: THREE.Vector3) => void;
  /** panorama width in texels (default 2048; a starfield wants more so the stars stay points) */
  skySize?: number;
  backgroundIntensity: number;
  envIntensity: number;
  fog: number;
  sun: { color: number; intensity: number };
  hemi: { sky: number; ground: number; intensity: number };
  /** the ground plane's tile, or null: no ground, the hole floats in the sky */
  ground: Painter | null;
  felt: { paint: Painter; roughness: number; glow?: number };
  rail: MatSpec;
  block: MatSpec;
  low: MatSpec;
  flag: number;
  /** hazard tints: what "sand" and "water" are in this world */
  sand: { base: string; speck: string };
  water: { top: string; bottom: string; lines: string; surface: number; opacity: number; bed: string; stars?: boolean };
  slope: [string, string];
  /** extra scenery built with each hole (its half-size in world units is passed) */
  decor?: (group: THREE.Group, radius: number) => void;
}

export const texHash = (n: number) => {
  const s = Math.sin(n) * 43758.5453;
  return s - Math.floor(s);
};

/** Where a direction lands on the equirect canvas (row 0 is the zenith). */
function equirect(d: THREE.Vector3, W: number, H: number) {
  const n = d.clone().normalize();
  return { u: (Math.atan2(n.z, n.x) / (Math.PI * 2) + 0.5) * W, v: (0.5 - Math.asin(n.y) / Math.PI) * H };
}

function stars(g: CanvasRenderingContext2D, W: number, H: number, count: number, seed: number, band?: (u: number) => number) {
  for (let i = 0; i < count; i++) {
    const u = texHash(seed + i * 3.7) * W;
    let v = texHash(seed + i * 7.3) * H;
    // a share of the stars crowd the galactic band
    if (band && i % 3 === 0) v = band(u) + (texHash(seed + i * 5.1) - 0.5) * H * 0.22;
    const size = 0.4 + texHash(seed + i * 2.9) ** 3 * 1.9;
    const t = texHash(seed + i * 11.1);
    const col = t < 0.12 ? '190,210,255' : t < 0.22 ? '255,214,170' : '255,255,255';
    g.fillStyle = `rgba(${col},${0.35 + texHash(seed + i * 1.3) * 0.65})`;
    g.beginPath();
    g.arc(u, v, size, 0, Math.PI * 2);
    g.fill();
    if (size > 2.1) {
      // the brightest few flare
      g.strokeStyle = `rgba(${col},0.22)`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(u - size * 3, v); g.lineTo(u + size * 3, v);
      g.moveTo(u, v - size * 3); g.lineTo(u, v + size * 3);
      g.stroke();
    }
  }
}

function glow(g: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, a: number) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(${rgb},${a})`);
  gr.addColorStop(0.5, `rgba(${rgb},${a * 0.35})`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

/** A planet: a lit sphere with bands, optionally ringed. `light` is the direction the sun is on (canvas). */
function planet(g: CanvasRenderingContext2D, x: number, y: number, r: number, hues: [string, string, string], light: { x: number; y: number }, ring?: string) {
  if (ring) {
    g.save();
    g.translate(x, y);
    g.rotate(-0.35);
    g.strokeStyle = ring;
    for (const [k, w, a] of [[1.45, r * 0.32, 0.55], [1.85, r * 0.14, 0.35], [2.05, r * 0.06, 0.25]] as const) {
      g.globalAlpha = a;
      g.lineWidth = w;
      g.beginPath();
      g.ellipse(0, 0, r * k, r * k * 0.3, 0, Math.PI, Math.PI * 2); // the far half, behind the planet
      g.stroke();
    }
    g.restore();
  }
  g.save();
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.clip();
  const base = g.createLinearGradient(x, y - r, x, y + r);
  base.addColorStop(0, hues[0]); base.addColorStop(0.5, hues[1]); base.addColorStop(1, hues[2]);
  g.fillStyle = base;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  for (let i = 0; i < 9; i++) {
    const yy = y - r + (i / 9) * r * 2 + texHash(i * 4.4) * r * 0.2;
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)';
    g.fillRect(x - r, yy, r * 2, r * (0.08 + texHash(i * 2.2) * 0.14));
  }
  // the night side
  const shade = g.createRadialGradient(x + light.x * r * 0.7, y + light.y * r * 0.7, r * 0.3, x, y, r * 1.05);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(0.7, 'rgba(0,0,0,0.25)');
  shade.addColorStop(1, 'rgba(0,0,0,0.85)');
  g.fillStyle = shade;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.restore();
  if (ring) {
    g.save();
    g.translate(x, y);
    g.rotate(-0.35);
    g.strokeStyle = ring;
    for (const [k, w, a] of [[1.45, r * 0.32, 0.75], [1.85, r * 0.14, 0.5], [2.05, r * 0.06, 0.35]] as const) {
      g.globalAlpha = a;
      g.lineWidth = w;
      g.beginPath();
      g.ellipse(0, 0, r * k, r * k * 0.3, 0, 0, Math.PI); // the near half, in front
      g.stroke();
    }
    g.restore();
  }
}

// ---------------------------------------------------------------------------
// Skies
// ---------------------------------------------------------------------------
/** A summer afternoon: zenith blue to a warm haze, the sun, cumulus, a green
 *  lower hemisphere so the lawn's reflections read as grass. */
const parkSky: SceneTheme['sky'] = (g, W, H, sunDir) => {
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
  const { u: su, v: sv } = equirect(sunDir, W, H);
  const sunGlow = g.createRadialGradient(su, sv, 0, su, sv, 260);
  sunGlow.addColorStop(0, 'rgba(255,250,232,1)');
  sunGlow.addColorStop(0.06, 'rgba(255,247,220,0.9)');
  sunGlow.addColorStop(0.3, 'rgba(255,240,205,0.3)');
  sunGlow.addColorStop(1, 'rgba(255,236,196,0)');
  g.fillStyle = sunGlow;
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
};

/** Synthwave night: a deep blue dome, stars, a striped neon sun sinking into
 *  a magenta horizon over a dark gridded plain. */
const neonSky: SceneTheme['sky'] = (g, W, H, sunDir) => {
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#03021a');
  grad.addColorStop(0.3, '#120a4a');
  grad.addColorStop(0.46, '#4a1b7a');
  grad.addColorStop(0.495, '#ff3d9a');
  grad.addColorStop(0.505, '#2a0f4a');
  grad.addColorStop(0.62, '#0b0730');
  grad.addColorStop(1, '#05031a');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  stars(g, W, H, 1400, 17);
  // the striped sun, where the key light comes from
  const { u: su } = equirect(sunDir, W, H);
  const sy = H * 0.47, sr = 150;
  glow(g, su, sy, sr * 3.2, '255,90,180', 0.45);
  g.save();
  g.beginPath();
  g.arc(su, sy, sr, 0, Math.PI * 2);
  g.clip();
  const sunGrad = g.createLinearGradient(0, sy - sr, 0, sy + sr);
  sunGrad.addColorStop(0, '#fff2a8');
  sunGrad.addColorStop(0.5, '#ff8a3d');
  sunGrad.addColorStop(1, '#ff2d7a');
  g.fillStyle = sunGrad;
  g.fillRect(su - sr, sy - sr, sr * 2, sr * 2);
  g.fillStyle = 'rgba(40,10,70,0.9)';
  for (let i = 0; i < 7; i++) {
    const yy = sy + sr * (0.05 + i * 0.14);
    g.fillRect(su - sr, yy, sr * 2, 3 + i * 3);
  }
  g.restore();
  // horizon glow all the way round, brighter toward the sun
  for (let x = 0; x < W; x += 64) {
    const d = Math.min(Math.abs(x - su), W - Math.abs(x - su)) / W;
    glow(g, x + 32, H * 0.5, 120, '255,61,154', 0.12 + 0.2 * (1 - d * 2));
  }
  // the plain below: a perspective grid fading into the dark
  g.strokeStyle = 'rgba(75,227,255,0.35)';
  g.lineWidth = 1.2;
  for (let i = 1; i < 14; i++) {
    const y = H * 0.5 + (i * i) * 2.2;
    if (y > H) break;
    g.globalAlpha = Math.max(0, 1 - i / 14);
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 40; i++) {
    const x = (i / 40) * W;
    g.globalAlpha = 0.5;
    g.beginPath(); g.moveTo(x, H * 0.5); g.lineTo(x + (x - W / 2) * 0.02, H * 0.5 + 400); g.stroke();
  }
  g.globalAlpha = 1;
};

/** Deep space: a galactic band of nebulae, a few thousand stars all round,
 *  a ringed gas giant, two moons, and a hard blue-white star for the key light. */
const spaceSky: SceneTheme['sky'] = (g, W, H, sunDir) => {
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#020109');
  grad.addColorStop(0.5, '#07041c');
  grad.addColorStop(1, '#030110');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // the band wraps the panorama continuously (u is periodic)
  const band = (u: number) => H * 0.5 + Math.sin((u / W) * Math.PI * 2 + 0.6) * H * 0.17;
  const palette = ['120,60,220', '60,180,230', '220,70,190', '90,90,255', '255,120,90'];
  for (let i = 0; i < 90; i++) {
    const u = texHash(i * 3.3) * W;
    const v = band(u) + (texHash(i * 5.9) - 0.5) * H * 0.18;
    const r = 70 + texHash(i * 7.7) * 230;
    glow(g, u, v, r, palette[i % palette.length], 0.05 + texHash(i * 2.2) * 0.1);
  }
  // dust lanes threading the band
  for (let i = 0; i < 30; i++) {
    const u = texHash(i * 13.1 + 1) * W;
    const v = band(u) + (texHash(i * 17.3) - 0.5) * H * 0.08;
    glow(g, u, v, 60 + texHash(i * 3.1) * 120, '2,1,10', 0.35);
  }
  stars(g, W, H, 9000, 5, band);
  // the key light: a white-blue star with a wide glare
  const { u: su, v: sv } = equirect(sunDir, W, H);
  glow(g, su, sv, 320, '170,200,255', 0.45);
  glow(g, su, sv, 70, '255,255,255', 1);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(su, sv, 9, 0, Math.PI * 2); g.fill();
  // worlds: a ringed giant off to one side, a small ice moon, a red dwarf world low behind
  const lit = { x: Math.sign(su - W * 0.72) || 1, y: -0.3 };
  planet(g, W * 0.72, H * 0.36, 118, ['#f3d9a8', '#d99a5a', '#8a4a2e'], lit, 'rgba(230,210,170,1)');
  planet(g, W * 0.18, H * 0.3, 42, ['#dff6ff', '#7fb8d8', '#3b5f8a'], { x: Math.sign(su - W * 0.18) || 1, y: -0.4 });
  planet(g, W * 0.46, H * 0.66, 64, ['#ff9a6a', '#b0402a', '#4a1410'], { x: Math.sign(su - W * 0.46) || 1, y: -0.6 });
};

// ---------------------------------------------------------------------------
// Grounds and felts
// ---------------------------------------------------------------------------
const grass: Painter = (g, W, H) => {
  g.fillStyle = '#458f45';
  g.fillRect(0, 0, W, H);
  const stripe = W / 14;
  for (let i = 0; i < 14; i++) {
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
    g.fillRect(i * stripe, 0, stripe, H);
  }
  if (W >= 1024) {
    for (let i = 0; i < 14000; i++) {
      g.fillStyle = texHash(i * 1.3) > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
      g.fillRect(texHash(i * 7.1) * W, texHash(i * 3.7) * H, 1.5, 1.5);
    }
  }
};

/** Dark asphalt ruled with a cyan grid (the synthwave plain). */
const gridPlain: Painter = (g, W, H) => {
  g.fillStyle = '#0a0824';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(75,227,255,0.45)';
  g.lineWidth = Math.max(1.5, W / 400);
  const n = 12;
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    g.moveTo((i / n) * W, 0); g.lineTo((i / n) * W, H);
    g.moveTo(0, (i / (n * 1.5)) * H); g.lineTo(W, (i / (n * 1.5)) * H);
  }
  g.stroke();
  g.strokeStyle = 'rgba(255,61,154,0.18)';
  g.lineWidth = Math.max(1, W / 900);
  g.beginPath();
  for (let i = 0; i <= n * 4; i++) {
    g.moveTo((i / (n * 4)) * W, 0); g.lineTo((i / (n * 4)) * W, H);
    g.moveTo(0, (i / (n * 6)) * H); g.lineTo(W, (i / (n * 6)) * H);
  }
  g.stroke();
};

const feltGreen: Painter = (g, W, H) => {
  g.fillStyle = '#36a24a';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)';
    g.fillRect((i * W) / 8, 0, W / 8, H);
  }
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = texHash(i * 1.7) > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    g.fillRect(texHash(i * 3.3) * W, texHash(i * 5.9) * H, 1.5, 1.5);
  }
};

const feltIndigo: Painter = (g, W, H) => {
  g.fillStyle = '#2b2b6e';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    g.fillRect((i * W) / 8, 0, W / 8, H);
  }
  g.strokeStyle = 'rgba(75,227,255,0.16)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, 1); g.lineTo(W, 1); g.moveTo(1, 0); g.lineTo(1, H);
  g.stroke();
  for (let i = 0; i < 900; i++) {
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(texHash(i * 1.9) * W, texHash(i * 6.1) * H, 1.5, 1.5);
  }
};

/** A rainbow road: seven translucent neon bands over dark glass, a sparkle of stardust. */
const feltRainbow: Painter = (g, W, H) => {
  g.fillStyle = '#1b1446';
  g.fillRect(0, 0, W, H);
  const bands = ['#ff4b6e', '#ff9a3d', '#ffe34b', '#5dff7a', '#4be3ff', '#5b7bff', '#c65bff'];
  const bw = W / bands.length;
  bands.forEach((c, i) => {
    g.globalAlpha = 0.62;
    g.fillStyle = c;
    g.fillRect(i * bw, 0, bw, H);
    // a soft highlight down each band's middle
    const hl = g.createLinearGradient(i * bw, 0, (i + 1) * bw, 0);
    hl.addColorStop(0, 'rgba(255,255,255,0)');
    hl.addColorStop(0.5, 'rgba(255,255,255,0.16)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalAlpha = 1;
    g.fillStyle = hl;
    g.fillRect(i * bw, 0, bw, H);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(i * bw - 1, 0, 2, H);
  });
  for (let i = 0; i < 700; i++) {
    g.fillStyle = `rgba(255,255,255,${0.15 + texHash(i * 2.3) * 0.5})`;
    const s = 1 + texHash(i * 4.1) * 1.6;
    g.fillRect(texHash(i * 3.3) * W, texHash(i * 5.9) * H, s, s);
  }
};

// ---------------------------------------------------------------------------
// Decor
// ---------------------------------------------------------------------------
/** A drifting cloud of star bits around the hole (over-bright, so they bloom). */
function starCloud(group: THREE.Group, radius: number) {
  const n = 520;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const tints = [[1.9, 1.9, 2.2], [2.2, 1.6, 0.6], [1.2, 1.8, 2.4], [2.2, 1.0, 1.9]];
  for (let i = 0; i < n; i++) {
    const a = texHash(i * 3.1) * Math.PI * 2;
    const r = radius * (1.15 + texHash(i * 5.3) * 2.6);
    const y = -35 + texHash(i * 7.9) * 120;
    pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.sin(a) * r;
    const t = tints[Math.floor(texHash(i * 2.7) * tints.length)];
    const k = 0.5 + texHash(i * 9.1) * 0.5;
    col[i * 3] = t[0] * k; col[i * 3 + 1] = t[1] * k; col[i * 3 + 2] = t[2] * k;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  const mat = new THREE.PointsMaterial({
    size: 1.3, map: new THREE.CanvasTexture(c), vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.name = 'decor-spin';
  group.add(pts);
}


// ---------------------------------------------------------------------------
// The worlds: cinema, pirate cove, concert stage, kitchen, zoo
// ---------------------------------------------------------------------------
/** Premiere night: a deep indigo sky, a few stars, a city glow along the
 *  horizon and searchlight beams sweeping up from behind the lot. */
const cinemaSky: SceneTheme['sky'] = (g, W, H, sunDir) => {
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#05030f');
  grad.addColorStop(0.35, '#120a2e');
  grad.addColorStop(0.48, '#3a1a4a');
  grad.addColorStop(0.5, '#6a2a3a');
  grad.addColorStop(0.52, '#1a0a12');
  grad.addColorStop(1, '#08050a');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  stars(g, W, H, 700, 41);
  // the moon where the key light is
  const { u: su, v: sv } = equirect(sunDir, W, H);
  glow(g, su, sv, 220, '255,240,210', 0.35);
  g.fillStyle = '#fff6df';
  g.beginPath(); g.arc(su, sv, 26, 0, Math.PI * 2); g.fill();
  // city glow along the horizon
  for (let x = 0; x < W; x += 48) glow(g, x + 24, H * 0.5, 140, '255,120,90', 0.08 + texHash(x) * 0.08);
  // searchlights fanning up from the lot
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) {
    const x0 = texHash(i * 7.7 + 3) * W;
    const lean = (texHash(i * 3.3) - 0.5) * 900;
    const beam = g.createLinearGradient(x0, H * 0.5, x0 + lean, H * 0.08);
    beam.addColorStop(0, 'rgba(255,235,200,0.32)');
    beam.addColorStop(1, 'rgba(255,235,200,0)');
    g.fillStyle = beam;
    g.beginPath();
    g.moveTo(x0 - 12, H * 0.5); g.lineTo(x0 + 12, H * 0.5); g.lineTo(x0 + lean + 70, H * 0.08); g.lineTo(x0 + lean - 70, H * 0.08);
    g.closePath(); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
};

/** Late afternoon over a tropical bay: a teal zenith warming to gold and
 *  coral at the horizon, low clouds, a green-blue sea below. */
const pirateSky: SceneTheme['sky'] = (g, W, H, sunDir) => {
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0f4c6e');
  grad.addColorStop(0.25, '#2a86b0');
  grad.addColorStop(0.42, '#e8b268');
  grad.addColorStop(0.49, '#ff8a5a');
  grad.addColorStop(0.505, '#1f6f7a');
  grad.addColorStop(0.62, '#155a66');
  grad.addColorStop(1, '#0a3a44');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const { u: su, v: sv } = equirect(sunDir, W, H);
  glow(g, su, sv, 300, '255,214,140', 0.6);
  g.fillStyle = '#fff3d0';
  g.beginPath(); g.arc(su, sv, 30, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 22; i++) {
    const cx = texHash(i * 3.9 + 1) * W, cy = H * (0.36 + texHash(i * 5.1) * 0.11);
    const sc = 1 + texHash(i * 7.3) * 1.4;
    for (let p = 0; p < 6; p++) {
      const px = cx + (texHash(i * 11.7 + p) - 0.5) * 180 * sc, py = cy + (texHash(i * 13.1 + p) - 0.5) * 20 * sc;
      const pr = (16 + texHash(i * 17.3 + p) * 22) * sc;
      g.fillStyle = `rgba(${p % 2 ? '255,220,190' : '255,245,235'},${0.22 + texHash(i * 2.9 + p) * 0.2})`;
      g.beginPath(); g.ellipse(px, py, pr, pr * 0.42, 0, 0, Math.PI * 2); g.fill();
    }
  }
  // sun glitter on the sea
  for (let i = 0; i < 400; i++) {
    const x = su + (texHash(i * 3.1) - 0.5) * 500, y = H * 0.505 + texHash(i * 5.3) ** 2 * H * 0.2;
    g.fillStyle = `rgba(255,240,200,${0.1 + texHash(i * 7.7) * 0.4})`;
    g.fillRect(x, y, 2 + texHash(i) * 3, 1);
  }
};

/** A festival at night: near-black sky, a haze of stage smoke over the
 *  horizon, coloured laser fans and moving-head beams, a crowd's glow. */
const musicSky: SceneTheme['sky'] = (g, W, H, sunDir) => {
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#030208');
  grad.addColorStop(0.4, '#0c0620');
  grad.addColorStop(0.49, '#3a1060');
  grad.addColorStop(0.505, '#160a24');
  grad.addColorStop(1, '#050208');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  stars(g, W, H, 500, 77);
  const { u: su, v: sv } = equirect(sunDir, W, H);
  glow(g, su, sv, 200, '200,160,255', 0.5);
  g.globalCompositeOperation = 'lighter';
  const cols = ['255,61,154', '75,227,255', '120,255,120', '255,200,60', '160,90,255'];
  for (let i = 0; i < 26; i++) {
    const x0 = texHash(i * 5.3 + 9) * W;
    const lean = (texHash(i * 2.1) - 0.5) * 1400;
    const c = cols[i % cols.length];
    const beam = g.createLinearGradient(x0, H * 0.5, x0 + lean, H * 0.12);
    beam.addColorStop(0, `rgba(${c},0.55)`);
    beam.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = beam;
    g.beginPath();
    g.moveTo(x0 - 4, H * 0.5); g.lineTo(x0 + 4, H * 0.5); g.lineTo(x0 + lean + 22, H * 0.12); g.lineTo(x0 + lean - 22, H * 0.12);
    g.closePath(); g.fill();
  }
  for (let x = 0; x < W; x += 40) glow(g, x + 20, H * 0.5, 160, cols[(x / 40) % cols.length], 0.1);
  g.globalCompositeOperation = 'source-over';
  // the crowd: a dark silhouette band with phone lights
  g.fillStyle = '#0a0612';
  g.fillRect(0, H * 0.5, W, H * 0.06);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(255,255,255,${0.2 + texHash(i * 1.9) * 0.6})`;
    g.fillRect(texHash(i * 3.7) * W, H * (0.5 + texHash(i * 5.9) * 0.05), 1.5, 1.5);
  }
};

/** A kitchen seen from the floor: a white ceiling with a fluorescent
 *  strip light, cream walls with a tiled splashback, cupboards, a window,
 *  and a checkerboard floor going away below the horizon. */
const kitchenSky: SceneTheme['sky'] = (g, W, H, sunDir) => {
  // ceiling
  const ceil = g.createLinearGradient(0, 0, 0, H * 0.3);
  ceil.addColorStop(0, '#f4f2ea'); ceil.addColorStop(1, '#d9d6ca');
  g.fillStyle = ceil;
  g.fillRect(0, 0, W, H * 0.3);
  // walls
  const wall = g.createLinearGradient(0, H * 0.3, 0, H * 0.5);
  wall.addColorStop(0, '#e6dcc4'); wall.addColorStop(1, '#cdbf9c');
  g.fillStyle = wall;
  g.fillRect(0, H * 0.3, W, H * 0.2);
  // the cornice
  g.fillStyle = '#bfb7a3';
  g.fillRect(0, H * 0.295, W, 6);
  // the strip light where the key light is
  const { u: su } = equirect(sunDir, W, H);
  glow(g, su, H * 0.12, 500, '255,250,235', 0.7);
  g.fillStyle = '#fffdf3';
  g.fillRect(su - 260, H * 0.1, 520, 28);
  // cupboards along the wall, a window, a splashback of tiles
  for (let i = 0; i < 14; i++) {
    const x = (i / 14) * W, w = W / 14 - 8;
    if (i === 5 || i === 6) {
      g.fillStyle = '#9fd3ff'; g.fillRect(x, H * 0.31, w, H * 0.13);
      g.fillStyle = '#f4f2ea'; g.fillRect(x + w / 2 - 3, H * 0.31, 6, H * 0.13); g.fillRect(x, H * 0.375, w, 5);
      continue;
    }
    g.fillStyle = i % 2 ? '#8a5a3a' : '#7a4c2e';
    g.fillRect(x, H * 0.31, w, H * 0.11);
    g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(x + 4, H * 0.315, w - 8, H * 0.1);
    g.fillStyle = '#d8d8d8'; g.fillRect(x + w / 2 - 2, H * 0.4, 4, 12);
  }
  g.fillStyle = '#e8f2f4';
  g.fillRect(0, H * 0.44, W, H * 0.06);
  g.strokeStyle = 'rgba(120,140,150,0.5)';
  g.lineWidth = 1.5;
  for (let x = 0; x < W; x += 28) { g.beginPath(); g.moveTo(x, H * 0.44); g.lineTo(x, H * 0.5); g.stroke(); }
  for (let y = H * 0.44; y <= H * 0.5; y += 14) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  // the floor: a checkerboard receding
  g.fillStyle = '#2b2b30';
  g.fillRect(0, H * 0.5, W, H * 0.5);
  for (let row = 0; row < 40; row++) {
    const y0 = H * 0.5 + (row * row) * 0.9;
    if (y0 > H) break;
    const y1 = Math.min(H, H * 0.5 + ((row + 1) ** 2) * 0.9);
    const cell = 40 + row * 6;
    for (let x = 0; x < W; x += cell) {
      g.fillStyle = ((Math.floor(x / cell) + row) % 2) ? '#d9d2c2' : '#3a6a6e';
      g.fillRect(x, y0, cell - 2, y1 - y0 - 1);
    }
  }
};

/** Savanna afternoon: a high blue sky, thin cloud streaks, a warm dusty
 *  horizon, and dry gold grass below with distant acacia silhouettes. */
const zooSky: SceneTheme['sky'] = (g, W, H, sunDir) => {
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#1d5fb0');
  grad.addColorStop(0.28, '#4c93d8');
  grad.addColorStop(0.45, '#b7d6ea');
  grad.addColorStop(0.495, '#f1e2c0');
  grad.addColorStop(0.505, '#a9925a');
  grad.addColorStop(0.62, '#7d8a45');
  grad.addColorStop(1, '#4a5a2a');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const { u: su, v: sv } = equirect(sunDir, W, H);
  glow(g, su, sv, 240, '255,246,220', 0.8);
  g.fillStyle = '#fffbe8';
  g.beginPath(); g.arc(su, sv, 22, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 18; i++) {
    const cx = texHash(i * 3.3 + 2) * W, cy = H * (0.26 + texHash(i * 5.5) * 0.14);
    g.fillStyle = `rgba(255,255,255,${0.1 + texHash(i * 2.7) * 0.14})`;
    g.beginPath(); g.ellipse(cx, cy, 120 + texHash(i * 7.1) * 200, 6 + texHash(i * 9.3) * 8, 0, 0, Math.PI * 2); g.fill();
  }
  // acacias on the skyline
  g.fillStyle = '#3a3a22';
  for (let i = 0; i < 30; i++) {
    const x = texHash(i * 4.1 + 5) * W, s = 0.6 + texHash(i * 6.1) * 0.9;
    g.fillRect(x - 2 * s, H * 0.5 - 22 * s, 4 * s, 22 * s);
    g.beginPath(); g.ellipse(x, H * 0.5 - 22 * s, 26 * s, 8 * s, 0, 0, Math.PI * 2); g.fill();
  }
};

// grounds
/** Studio lot asphalt: charcoal with a faint sheen, painted parking lines. */
const asphalt: Painter = (g, W, H) => {
  g.fillStyle = '#2a282e';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = texHash(i * 1.7) > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
    g.fillRect(texHash(i * 3.1) * W, texHash(i * 5.3) * H, 2, 2);
  }
  g.fillStyle = 'rgba(255,220,80,0.35)';
  for (let i = 0; i < 6; i++) g.fillRect((i / 6) * W + 20, 0, 6, H);
};
/** Beach sand: pale gold with darker damp streaks and shell specks. */
const beach: Painter = (g, W, H) => {
  g.fillStyle = '#d9c28f';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(120,90,50,${0.03 + texHash(i * 3.3) * 0.04})`;
    g.beginPath(); g.ellipse(texHash(i * 5.1) * W, texHash(i * 7.7) * H, 30 + texHash(i) * 60, 20 + texHash(i * 2) * 40, texHash(i * 9) * 3, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 12000; i++) {
    g.fillStyle = texHash(i * 1.3) > 0.6 ? 'rgba(255,255,255,0.12)' : 'rgba(90,60,30,0.1)';
    g.fillRect(texHash(i * 7.1) * W, texHash(i * 3.7) * H, 1.5, 1.5);
  }
};
/** A stage floor: matte black boards with tape marks and coloured light spill. */
const stageFloor: Painter = (g, W, H) => {
  g.fillStyle = '#141218';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 16; i++) {
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.12)';
    g.fillRect((i / 16) * W, 0, W / 16, H);
  }
  const cols = ['255,61,154', '75,227,255', '255,200,60'];
  for (let i = 0; i < 7; i++) glow(g, texHash(i * 3.1) * W, texHash(i * 5.3) * H, 120 + texHash(i) * 160, cols[i % 3], 0.12);
  g.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 10; i++) g.fillRect(texHash(i * 7.9) * W, texHash(i * 11.3) * H, 30, 4);
};
/** Kitchen lino: a checkerboard of cream and teal tiles, worn at the joins. */
const lino: Painter = (g, W, H) => {
  const n = 6;
  const cw = W / n, chh = H / (n * 1.5);
  for (let i = 0; i < n; i++) for (let j = 0; j < n * 1.5; j++) {
    g.fillStyle = (i + j) % 2 ? '#e4dccb' : '#3d7b7e';
    g.fillRect(i * cw, j * chh, cw, chh);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(i * cw, j * chh, cw, 3); g.fillRect(i * cw, j * chh, 3, chh);
  }
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = 'rgba(0,0,0,0.05)';
    g.fillRect(texHash(i * 3.1) * W, texHash(i * 5.3) * H, 2, 2);
  }
};
/** Dry savanna grass with a trodden dirt path. */
const savanna: Painter = (g, W, H) => {
  g.fillStyle = '#8f9a4a';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(${texHash(i) > 0.5 ? '200,170,90' : '90,120,50'},${0.08 + texHash(i * 3.3) * 0.12})`;
    g.beginPath(); g.ellipse(texHash(i * 5.1) * W, texHash(i * 7.7) * H, 40 + texHash(i * 1.1) * 160, 20 + texHash(i * 2.2) * 60, 0, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 14000; i++) {
    g.fillStyle = texHash(i * 1.3) > 0.5 ? 'rgba(255,240,180,0.08)' : 'rgba(40,60,20,0.1)';
    g.fillRect(texHash(i * 7.1) * W, texHash(i * 3.7) * H, 1.5, 3);
  }
  for (let i = 0; i < 6; i++) {
    g.fillStyle = 'rgba(150,110,60,0.35)';
    g.beginPath(); g.ellipse(texHash(i * 9.1 + 4) * W, texHash(i * 4.7 + 2) * H, 60 + texHash(i * 1.7) * 120, 30 + texHash(i * 2.9) * 40, texHash(i * 5.3) * 3, 0, Math.PI * 2); g.fill();
  }
};

// felts
/** Red carpet: a deep burgundy pile with a gold border stripe. */
const feltCarpet: Painter = (g, W, H) => {
  g.fillStyle = '#8a1424';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = texHash(i * 1.7) > 0.5 ? 'rgba(255,200,200,0.06)' : 'rgba(0,0,0,0.08)';
    g.fillRect(texHash(i * 3.3) * W, texHash(i * 5.9) * H, 1.5, 1.5);
  }
  g.fillStyle = 'rgba(230,180,60,0.22)';
  g.fillRect(0, 0, W, 3); g.fillRect(0, 0, 3, H);
};
/** Island turf: a coarse sun-bleached green with sandy patches. */
const feltIsland: Painter = (g, W, H) => {
  g.fillStyle = '#5f9e4a';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 10; i++) {
    g.fillStyle = 'rgba(200,180,110,0.12)';
    g.beginPath(); g.ellipse(texHash(i * 5.1) * W, texHash(i * 7.7) * H, 20 + texHash(i) * 50, 10 + texHash(i * 2) * 20, 0, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = texHash(i * 1.7) > 0.5 ? 'rgba(255,255,200,0.07)' : 'rgba(0,40,0,0.07)';
    g.fillRect(texHash(i * 3.3) * W, texHash(i * 5.9) * H, 1.5, 2);
  }
};
/** Stage deck: dark boards with a cyan edge glow-line. */
const feltStage: Painter = (g, W, H) => {
  g.fillStyle = '#342a58';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 10; i++) {
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.1)';
    g.fillRect(0, (i * H) / 10, W, H / 10);
  }
  g.strokeStyle = 'rgba(75,227,255,0.35)';
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 1.5); g.lineTo(W, 1.5); g.moveTo(1.5, 0); g.lineTo(1.5, H); g.stroke();
  for (let i = 0; i < 700; i++) {
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(texHash(i * 1.9) * W, texHash(i * 6.1) * H, 1.5, 1.5);
  }
};
/** A woven placemat: teal and cream threads. */
const feltPlacemat: Painter = (g, W, H) => {
  g.fillStyle = '#3f9a8a';
  g.fillRect(0, 0, W, H);
  const t = W / 24;
  for (let i = 0; i < 24; i++) {
    g.fillStyle = i % 2 ? 'rgba(255,250,230,0.16)' : 'rgba(0,0,0,0.06)';
    g.fillRect(i * t, 0, t, H);
    g.fillStyle = i % 2 ? 'rgba(255,250,230,0.10)' : 'rgba(0,0,0,0.05)';
    g.fillRect(0, i * t, W, t);
  }
  for (let i = 0; i < 1200; i++) {
    g.fillStyle = 'rgba(0,0,0,0.05)';
    g.fillRect(texHash(i * 3.3) * W, texHash(i * 5.9) * H, 1.5, 1.5);
  }
};

// decor
/** Stand `kinds` round the hole at `radius` × 1.15–1.5, one every `step`
 *  radians, deterministically jittered; scale is the prop's default. */
function ringOfProps(group: THREE.Group, radius: number, kinds: PropKind[], count: number, seed: number, lift = 0) {
  for (let i = 0; i < count; i++) {
    const kind = kinds[i % kinds.length];
    const model = buildProp(kind);
    if (!model) continue;
    const a = (i / count) * Math.PI * 2 + texHash(seed + i * 3.1) * 0.5;
    const r = radius * (1.2 + texHash(seed + i * 5.7) * 0.35) + 6;
    const [w, h, d] = PROP_SIZE[kind];
    const k = 0.9 + texHash(seed + i * 7.3) * 0.5;
    model.scale.set(w * k, h * k, d * k);
    model.position.set(Math.cos(a) * r, lift, Math.sin(a) * r);
    model.rotation.y = -a + Math.PI / 2 + (texHash(seed + i * 9.9) - 0.5);
    group.add(model);
  }
}
/** Premiere: spotlight towers round the lot, their beams tilted in over the hole. */
function studioLot(group: THREE.Group, radius: number) {
  ringOfProps(group, radius, ['spotlight', 'camera', 'reel', 'seats', 'popcorn'], 8, 3);
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.1, 0.9), transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide });
  beamMat.userData.shared = true;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    const r = radius * 1.7 + 10;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 4, 60, 12, 1, true), beamMat);
    beam.position.set(Math.cos(a) * r, 30, Math.sin(a) * r);
    beam.lookAt(0, 80, 0);
    beam.rotateX(Math.PI / 2);
    group.add(beam);
  }
}
/** The cove: palms, rocks and barrels on the beach round the island. */
function cove(group: THREE.Group, radius: number) {
  ringOfProps(group, radius, ['palm', 'rock', 'palm', 'barrel', 'palm', 'chest', 'anchor', 'crate'], 12, 11);
}
/** The rig: a ring of speakers and spotlights with coloured beams over the stage. */
function festival(group: THREE.Group, radius: number) {
  ringOfProps(group, radius, ['speaker', 'spotlight', 'amp', 'spotlight', 'speaker', 'mic'], 10, 23);
  const cols: [number, number, number][] = [[2.0, 0.4, 1.2], [0.4, 1.7, 2.0], [0.7, 2.0, 0.6], [2.0, 1.6, 0.4]];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = radius * 1.5 + 8;
    const c = cols[i % cols.length];
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...c), transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 2.5, 50, 10, 1, true), mat);
    beam.position.set(Math.cos(a) * r, 25, Math.sin(a) * r);
    beam.lookAt(Math.cos(a + 2.5) * radius * 0.5, 60, Math.sin(a + 2.5) * radius * 0.5);
    beam.rotateX(Math.PI / 2);
    group.add(beam);
  }
}
/** The kitchen floor at a mouse's height: giant crockery and cutlery. */
function kitchenFloor(group: THREE.Group, radius: number) {
  ringOfProps(group, radius, ['mug', 'can', 'book', 'plate', 'cheese', 'fork', 'rat', 'mousetrap'], 10, 31);
  // it is all three times life size: the props' defaults are already large, scale them up more
  for (const c of group.children) if (c.type === 'Group') c.scale.multiplyScalar(2.2);
}
/** The zoo: trees, fences, bushes and the animals round the paddock. */
function paddock(group: THREE.Group, radius: number) {
  ringOfProps(group, radius, ['tree', 'fence', 'bush', 'giraffe', 'tree', 'fence', 'elephant', 'bush', 'flamingo', 'sign', 'tree', 'cage'], 14, 47);
}

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------
export const SCENE_THEMES: Record<string, SceneTheme> = {
  park: {
    sky: parkSky, backgroundIntensity: 1.0, envIntensity: 0.5, fog: 0xdce8f2,
    sun: { color: 0xfff1dc, intensity: 3.6 },
    hemi: { sky: 0xcfe4ff, ground: 0x3a6b32, intensity: 0.25 },
    ground: grass,
    felt: { paint: feltGreen, roughness: 0.92 },
    rail: { color: 0xffffff, roughness: 0.55, wood: true },
    block: { color: 0xffffff, roughness: 0.55, wood: true },
    low: { color: 0xf3dfbc, roughness: 0.55, wood: true },
    flag: 0xe83828,
    sand: { base: '#e9d18c', speck: 'rgba(0,0,0,0.12)' },
    water: { top: '#3a9ae6', bottom: '#1f5f9c', lines: 'rgba(255,255,255,0.28)', surface: 0x9ed4ff, opacity: 0.76, bed: '#3a3a2e' },
    slope: ['#5cc25f', '#2d7d38'],
  },
  neon: {
    sky: neonSky, backgroundIntensity: 1.0, envIntensity: 0.7, fog: 0x14082e,
    sun: { color: 0xffb4d8, intensity: 2.6 },
    hemi: { sky: 0x6a5cff, ground: 0x1a0f3a, intensity: 0.5 },
    ground: gridPlain,
    felt: { paint: feltIndigo, roughness: 0.85 },
    rail: { color: 0x0b1a2e, roughness: 0.35, emissive: new THREE.Color(0.3, 1.1, 1.45), emissiveIntensity: 1 },
    block: { color: 0x2a0a22, roughness: 0.35, emissive: new THREE.Color(1.45, 0.3, 0.8), emissiveIntensity: 1 },
    low: { color: 0x0b1a2e, roughness: 0.4, emissive: new THREE.Color(0.2, 0.8, 1.0), emissiveIntensity: 1 },
    flag: 0x4be3ff,
    sand: { base: '#8a6fd8', speck: 'rgba(0,0,0,0.18)' },
    water: { top: '#ff5a8a', bottom: '#a01c48', lines: 'rgba(255,220,120,0.35)', surface: 0xff7aa8, opacity: 0.9, bed: '#3a0a1c' },
    slope: ['#4a4aa8', '#1e1e52'],
  },
  space: {
    sky: spaceSky, skySize: 4096, backgroundIntensity: 1.0, envIntensity: 0.9, fog: 0x07051a,
    sun: { color: 0xdde8ff, intensity: 3.2 },
    hemi: { sky: 0x6a5cff, ground: 0x1a0f3a, intensity: 0.55 },
    ground: null,
    felt: { paint: feltRainbow, roughness: 0.45, glow: 0.4 },
    rail: { color: 0x102038, roughness: 0.3, metalness: 0.2, emissive: new THREE.Color(0.25, 1.0, 1.42), emissiveIntensity: 1 },
    block: { color: 0xffd86b, roughness: 0.35, metalness: 0.3, emissive: new THREE.Color(1.45, 1.05, 0.25), emissiveIntensity: 0.9 },
    low: { color: 0xffd86b, roughness: 0.4, metalness: 0.3, emissive: new THREE.Color(1.2, 0.9, 0.25), emissiveIntensity: 0.6 },
    flag: 0xffd60a,
    sand: { base: '#b9b4c9', speck: 'rgba(0,0,0,0.2)' },
    water: { top: '#1a0b3d', bottom: '#020108', lines: 'rgba(180,140,255,0.22)', surface: 0x5a3fa0, opacity: 0.93, bed: '#08041a', stars: true },
    slope: ['#5a4bb8', '#2a1f66'],
    decor: starCloud,
  },
  cinema: {
    sky: cinemaSky, backgroundIntensity: 1.0, envIntensity: 0.55, fog: 0x14081a,
    sun: { color: 0xfff0d0, intensity: 2.4 },
    hemi: { sky: 0x6a4a8a, ground: 0x1a0a12, intensity: 0.45 },
    ground: asphalt,
    felt: { paint: feltCarpet, roughness: 0.95 },
    rail: { color: 0xd8b04a, roughness: 0.3, metalness: 0.8 },
    block: { color: 0x1a1618, roughness: 0.3, metalness: 0.2 },
    low: { color: 0x7a1020, roughness: 0.95 },
    flag: 0xffd35a,
    sand: { base: '#f3e2a8', speck: 'rgba(200,120,20,0.25)' },
    water: { top: '#4a2610', bottom: '#150801', lines: 'rgba(255,220,160,0.25)', surface: 0x5a2c12, opacity: 0.9, bed: '#1a0a02' },
    slope: ['#a83a4a', '#5a1020'],
    decor: studioLot,
  },
  pirate: {
    sky: pirateSky, backgroundIntensity: 1.0, envIntensity: 0.6, fog: 0xf0c8a0,
    sun: { color: 0xffe0b0, intensity: 3.4 },
    hemi: { sky: 0xffd9a8, ground: 0x2f6f5a, intensity: 0.3 },
    ground: beach,
    felt: { paint: feltIsland, roughness: 0.92 },
    rail: { color: 0x8a6a4a, roughness: 0.65, wood: true },
    block: { color: 0x6a4a2a, roughness: 0.7, wood: true },
    low: { color: 0xd8c49a, roughness: 0.8 },
    flag: 0x111114,
    sand: { base: '#e6cf98', speck: 'rgba(0,0,0,0.12)' },
    water: { top: '#2fb8c8', bottom: '#0e5f80', lines: 'rgba(255,255,255,0.3)', surface: 0x8fe4f0, opacity: 0.72, bed: '#c8b070' },
    slope: ['#7cb85c', '#3d7a34'],
    decor: cove,
  },
  music: {
    sky: musicSky, backgroundIntensity: 1.0, envIntensity: 0.65, fog: 0x120a20,
    sun: { color: 0xd8c0ff, intensity: 2.6 },
    hemi: { sky: 0x7a5cff, ground: 0x1a0f2a, intensity: 0.5 },
    ground: stageFloor,
    felt: { paint: feltStage, roughness: 0.6 },
    rail: { color: 0x9aa3ad, roughness: 0.3, metalness: 0.85 },
    block: { color: 0x141216, roughness: 0.4, emissive: new THREE.Color(1.45, 0.25, 0.9), emissiveIntensity: 0.6 },
    low: { color: 0x2a2010, roughness: 0.4, emissive: new THREE.Color(1.5, 1.1, 0.2), emissiveIntensity: 0.7 },
    flag: 0xff3d9a,
    sand: { base: '#e6d8ff', speck: 'rgba(255,61,154,0.35)' },
    water: { top: '#6a2ad8', bottom: '#1e0a5a', lines: 'rgba(75,227,255,0.35)', surface: 0x9a6aff, opacity: 0.85, bed: '#0e0620' },
    slope: ['#5a4a8a', '#2a2050'],
    decor: festival,
  },
  kitchen: {
    sky: kitchenSky, backgroundIntensity: 1.0, envIntensity: 0.7, fog: 0xe8e2d0,
    sun: { color: 0xfff8e8, intensity: 3.0 },
    hemi: { sky: 0xf4f2ea, ground: 0x3d7b7e, intensity: 0.35 },
    ground: lino,
    felt: { paint: feltPlacemat, roughness: 0.9 },
    rail: { color: 0xd8dde4, roughness: 0.25, metalness: 0.9 },
    block: { color: 0xc9a46b, roughness: 0.7, wood: true },
    low: { color: 0xc8a878, roughness: 0.9 },
    flag: 0xe0342a,
    sand: { base: '#f7f2ea', speck: 'rgba(0,0,0,0.08)' },
    water: { top: '#8ad0e8', bottom: '#4a90b0', lines: 'rgba(255,255,255,0.5)', surface: 0xcfeeff, opacity: 0.7, bed: '#e8e8e8' },
    slope: ['#5fb0a0', '#2a7a6a'],
    decor: kitchenFloor,
  },
  zoo: {
    sky: zooSky, backgroundIntensity: 1.0, envIntensity: 0.55, fog: 0xe8e0c8,
    sun: { color: 0xfff4dc, intensity: 3.6 },
    hemi: { sky: 0xcfe4ff, ground: 0x6a6a30, intensity: 0.28 },
    ground: savanna,
    felt: { paint: feltGreen, roughness: 0.92 },
    rail: { color: 0x2e6b3a, roughness: 0.45, metalness: 0.5 },
    block: { color: 0x9a9080, roughness: 0.95 },
    low: { color: 0xc9a46b, roughness: 0.7, wood: true },
    flag: 0xff8a2a,
    sand: { base: '#c8a070', speck: 'rgba(60,30,10,0.2)' },
    water: { top: '#3a9a8a', bottom: '#1a5a50', lines: 'rgba(255,255,255,0.25)', surface: 0x8fd8c8, opacity: 0.78, bed: '#4a4a30' },
    slope: ['#5cc25f', '#2d7d38'],
    decor: paddock,
  },
};

export function sceneThemeFor(name: string | undefined): SceneTheme {
  return SCENE_THEMES[name ?? ''] ?? SCENE_THEMES.park;
}
