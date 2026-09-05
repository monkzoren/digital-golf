// Canvas renderer for a hole: top-down with faux-extruded walls, themed
// surfaces, animated obstacles, balls with height, particles. Shared by the
// game and the editor.
import type { Hole, Zone, Block } from '@shared/courses';
import { WALL_H, blockPtsAt, floorWalls, holeBounds, moverActive, polySegs, rampFrac, rectPts, tunnelWalls } from '@shared/courses';
import { BALL_R, CUP_R, baseOf, geomOf, MAX_SHOT, MIN_SHOT, rampRise, zonePower } from '@shared/physics';

export interface Camera { x: number; y: number; scale: number }

export interface Theme {
  bg: string; bgLine: string;
  felt: string; feltStripe: string; feltEdge: string;
  wallTop: string; wallSide: string; wallLow: string;
  sand: string; ice: string; water: string; waterDeep: string; slope: string;
  boost: string; jump: string; tele: string; bumper: string; post: string;
  conveyor: string; spinner: string; fan: string; tramp: string; magnet: string; repel: string; cannon: string;
  gravity: string;
  rubber: string; laser: string;
  cup: string; flag: string;
}

// the toy-box colours are the same in every theme so a piece is always recognisable
const TOYS = {
  conveyor: '#2a2a33', spinner: '#7c5cff', fan: '#5bd1ff', tramp: '#3d7bff', magnet: '#ff5fb8', repel: '#ff8a3d',
  cannon: '#3a3f4a', gravity: '#b39cff', rubber: '#ff7ad9', laser: '#ff2d55',
};

export const THEMES: Record<string, Theme> = {
  park: {
    bg: '#0d2b1c', bgLine: 'rgba(255,255,255,0.03)',
    felt: '#3fae4f', feltStripe: 'rgba(255,255,255,0.05)', feltEdge: '#2b8a3a',
    wallTop: '#c9a36b', wallSide: '#7d5a30', wallLow: '#e0c391',
    sand: '#e9d18c', ice: '#cfeeff', water: '#2f8fd8', waterDeep: '#1f5f9c', slope: 'rgba(0,0,0,0.12)',
    boost: '#ff8a3d', jump: '#ffd60a', tele: '#c77dff', bumper: '#ff4b4b', post: '#8d99b5',
    ...TOYS,
    cup: '#0b1a10', flag: '#ff4b4b',
  },
  neon: {
    bg: '#0a0a24', bgLine: 'rgba(120,120,255,0.06)',
    felt: '#2b2b6e', feltStripe: 'rgba(255,255,255,0.05)', feltEdge: '#1e1e52',
    wallTop: '#4be3ff', wallSide: '#1a6f86', wallLow: '#9bf0ff',
    sand: '#8a6fd8', ice: '#dff6ff', water: '#ff3d77', waterDeep: '#a01c48', slope: 'rgba(255,255,255,0.08)',
    boost: '#ff8a3d', jump: '#ffe94b', tele: '#ff5fb8', bumper: '#ff3d3d', post: '#7c8fbf',
    ...TOYS,
    cup: '#05051a', flag: '#4be3ff',
  },
  // deep space: a rainbow road floating in the void, neon rails, moon-dust sand
  space: {
    bg: '#040211', bgLine: 'rgba(150,130,255,0.07)',
    felt: '#31257a', feltStripe: 'rgba(255,255,255,0.07)', feltEdge: '#1d1550',
    wallTop: '#7ef0ff', wallSide: '#1d6a80', wallLow: '#ffd86b',
    sand: '#b9b4c9', ice: '#dff6ff', water: '#1a0b3d', waterDeep: '#020108', slope: 'rgba(255,255,255,0.1)',
    boost: '#ff8a3d', jump: '#ffe94b', tele: '#ff5fb8', bumper: '#ff3d3d', post: '#8f9ccf',
    ...TOYS,
    cup: '#000000', flag: '#ffd60a',
  },
};

export function themeFor(hole: Hole, hint?: string): Theme {
  return THEMES[hint ?? ''] ?? THEMES.park;
}

export const w2s = (cam: Camera, W: number, H: number, x: number, y: number) =>
  ({ x: (x - cam.x) * cam.scale + W / 2, y: (y - cam.y) * cam.scale + H / 2 });
export const s2w = (cam: Camera, W: number, H: number, sx: number, sy: number) =>
  ({ x: (sx - W / 2) / cam.scale + cam.x, y: (sy - H / 2) / cam.scale + cam.y });

/** A camera that shows the whole hole (letterboxed) with some margin. */
export function fitCamera(hole: Hole, W: number, H: number, margin = 2.5): Camera {
  const b = holeBounds(hole);
  const scale = Math.min(W / (b.w + margin * 2), H / (b.h + margin * 2));
  return { x: b.minX + b.w / 2, y: b.minY + b.h / 2, scale };
}

function poly(g: CanvasRenderingContext2D, pts: number[], cam: Camera, W: number, H: number, dx = 0, dy = 0) {
  g.beginPath();
  for (let i = 0; i < pts.length; i += 2) {
    const p = w2s(cam, W, H, pts[i], pts[i + 1]);
    if (i === 0) g.moveTo(p.x + dx, p.y + dy); else g.lineTo(p.x + dx, p.y + dy);
  }
  g.closePath();
}

function rectPath(g: CanvasRenderingContext2D, z: { x: number; y: number; w: number; h: number }, cam: Camera, W: number, H: number) {
  const p = w2s(cam, W, H, z.x, z.y);
  g.rect(p.x, p.y, z.w * cam.scale, z.h * cam.scale);
}

function extruded(g: CanvasRenderingContext2D, pts: number[], cam: Camera, W: number, H: number, top: string, side: string, depth: number) {
  const d = depth * cam.scale;
  // side face: the polygon swept down by d
  g.fillStyle = side;
  for (let k = d; k > 0; k -= Math.max(1, d / 4)) {
    poly(g, pts, cam, W, H, 0, k);
    g.fill();
  }
  poly(g, pts, cam, W, H);
  g.fillStyle = top;
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 1;
  g.stroke();
}

export interface DrawOpts {
  t: number; // seconds since the hole started (movers)
  theme: Theme;
  editor?: boolean; // draw helper outlines
  selected?: unknown; // editor: highlight this object
}

export function drawHole(g: CanvasRenderingContext2D, hole: Hole, cam: Camera, W: number, H: number, o: DrawOpts) {
  const th = o.theme;
  const geom = geomOf(hole);
  const s = cam.scale;

  // background grid
  g.fillStyle = th.bg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = th.bgLine;
  g.lineWidth = 1;
  const step = s * 2;
  const ox = ((-cam.x * s + W / 2) % step + step) % step;
  const oy = ((-cam.y * s + H / 2) % step + step) % step;
  g.beginPath();
  for (let x = ox; x < W; x += step) { g.moveTo(x, 0); g.lineTo(x, H); }
  for (let y = oy; y < H; y += step) { g.moveTo(0, y); g.lineTo(W, y); }
  g.stroke();

  // floor union + mowing stripes
  g.save();
  g.beginPath();
  for (const r of hole.floor) rectPath(g, r, cam, W, H);
  g.fillStyle = th.felt;
  g.fill();
  g.clip();
  g.fillStyle = th.feltStripe;
  const b = holeBounds(hole);
  const stripe = 2;
  for (let x = Math.floor(b.minX / stripe / 2) * stripe * 2; x < b.maxX; x += stripe * 2) {
    const p = w2s(cam, W, H, x, b.minY);
    g.fillRect(p.x, p.y - 2, stripe * s, b.h * s + 4);
  }
  // raised platforms: lighter the higher they are, a cliff face down their
  // lower edges (the drop is drawn as a short extrusion), lowest first
  for (const r of [...hole.floor].filter(r => r.z).sort((a, c) => (a.z ?? 0) - (c.z ?? 0))) {
    const depth = Math.min(1.2, 0.25 + (r.z ?? 0) * 0.3);
    extruded(g, rectPts(r), cam, W, H, th.felt, th.wallSide, depth);
    g.fillStyle = `rgba(255,255,255,${Math.min(0.3, 0.07 + (r.z ?? 0) * 0.05)})`;
    g.beginPath(); rectPath(g, r, cam, W, H); g.fill();
    if (o.editor) {
      const p = w2s(cam, W, H, r.x + r.w / 2, r.y + 1.8);
      g.fillStyle = '#fff';
      g.font = `700 ${Math.max(9, s * 0.45)}px Chakra Petch, sans-serif`;
      g.textAlign = 'center';
      g.fillText(`▲ ${(r.z ?? 0).toFixed(1)}`, p.x, p.y);
    }
  }
  // zones
  for (const z of hole.zones ?? []) drawZone(g, z, cam, W, H, o);
  // tunnels: the passage's side walls (its mouths are open)
  if (geom.tunnels.length) {
    g.strokeStyle = th.wallSide;
    g.lineWidth = Math.max(2, 0.3 * s);
    g.lineCap = 'butt';
    g.beginPath();
    for (const seg of tunnelWalls(hole, geom.tunnels)) {
      const a = w2s(cam, W, H, seg.ax, seg.ay), b = w2s(cam, W, H, seg.bx, seg.by);
      g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
    }
    g.stroke();
    if (o.editor) {
      g.fillStyle = '#fff';
      g.font = `700 ${Math.max(9, s * 0.45)}px Chakra Petch, sans-serif`;
      g.textAlign = 'center';
      for (const z of geom.tunnels) {
        const p = w2s(cam, W, H, z.x + z.w / 2, z.y + z.h / 2);
        g.fillText(`TUNNEL ▼ ${baseOf(geom, z).toFixed(1)}`, p.x, p.y + s * 0.2);
      }
    }
  }
  // cup shadow ring on the felt
  g.restore();

  // cup
  {
    const p = w2s(cam, W, H, hole.cup.x, hole.cup.y);
    g.beginPath();
    g.arc(p.x, p.y, (CUP_R + 0.12) * s, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fill();
    g.beginPath();
    g.arc(p.x, p.y, CUP_R * s, 0, Math.PI * 2);
    g.fillStyle = th.cup;
    g.fill();
    g.beginPath();
    g.arc(p.x, p.y, CUP_R * s * 0.75, 0, Math.PI * 2);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fill();
    // flag
    g.strokeStyle = '#f4f4f4';
    g.lineWidth = Math.max(1.5, 0.12 * s);
    g.beginPath();
    g.moveTo(p.x, p.y);
    g.lineTo(p.x, p.y - 2.6 * s);
    g.stroke();
    g.fillStyle = th.flag;
    const wave = Math.sin(o.t * 6) * 0.15;
    g.beginPath();
    g.moveTo(p.x, p.y - 2.6 * s);
    g.lineTo(p.x + (1.3 + wave) * s, p.y - (2.15 + wave * 0.5) * s);
    g.lineTo(p.x, p.y - 1.7 * s);
    g.closePath();
    g.fill();
  }

  // tee marker
  {
    const p = w2s(cam, W, H, hole.tee.x, hole.tee.y);
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = Math.max(1, 0.08 * s);
    g.beginPath();
    g.arc(p.x, p.y, 0.9 * s, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.fill();
    if (o.editor) {
      g.fillStyle = '#fff';
      g.font = `700 ${Math.max(9, s * 0.5)}px Chakra Petch, sans-serif`;
      g.textAlign = 'center';
      g.fillText('TEE', p.x, p.y - 1.1 * s);
    }
  }

  // bumpers & posts
  for (const bp of hole.bumpers ?? []) {
    const p = w2s(cam, W, H, bp.x, bp.y);
    const r = bp.r * s;
    if (bp.kick > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(o.t * 5);
      g.beginPath();
      g.arc(p.x, p.y, r + 0.3 * s + pulse * 0.1 * s, 0, Math.PI * 2);
      g.fillStyle = `rgba(255,75,75,${0.18 + pulse * 0.12})`;
      g.fill();
    }
    g.beginPath();
    g.arc(p.x, p.y + 0.25 * s, r, 0, Math.PI * 2);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fill();
    const grad = g.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, r * 0.1, p.x, p.y, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.25, bp.kick > 0 ? th.bumper : th.post);
    grad.addColorStop(1, bp.kick > 0 ? '#7a1010' : '#3a4256');
    g.beginPath();
    g.arc(p.x, p.y, r, 0, Math.PI * 2);
    g.fillStyle = grad;
    g.fill();
    if (bp.kick > 0) {
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = Math.max(1, 0.1 * s);
      g.beginPath();
      g.arc(p.x, p.y, r * 0.6, 0, Math.PI * 2);
      g.stroke();
    }
  }

  // walls (floor boundary + static blocks) — drawn as extruded strips/polys;
  // blocks with an explicit height are drawn as polys of that height below
  const wallW = 0.5;
  const rails = floorWalls(hole.floor).filter(s => s.rail); // cliff faces are drawn with their platforms
  for (const bl of hole.blocks ?? []) if (!bl.motion && bl.h === undefined) rails.push(...polySegs(bl.pts));
  for (const seg of rails) {
    const dx = seg.bx - seg.ax, dy = seg.by - seg.ay;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * wallW * 0.5, ny = (dx / len) * wallW * 0.5;
    const pts = [seg.ax + nx, seg.ay + ny, seg.bx + nx, seg.by + ny, seg.bx - nx, seg.by - ny, seg.ax - nx, seg.ay - ny];
    extruded(g, pts, cam, W, H, th.wallTop, th.wallSide, 0.45);
  }
  for (const bl of hole.blocks ?? []) {
    if (bl.motion) continue;
    if (bl.h !== undefined) extruded(g, bl.pts, cam, W, H, bl.bounce && bl.bounce > 1 ? th.rubber : bl.h < WALL_H ? th.wallLow : th.wallTop, th.wallSide, Math.min(0.45, bl.h * 0.4));
    else if (bl.bounce && bl.bounce > 1) extruded(g, bl.pts, cam, W, H, th.rubber, th.wallSide, 0.45); // rubber: recoloured over the plain wall
    if (o.editor && o.selected === bl) highlightPoly(g, bl.pts, cam, W, H);
  }
  // the rounded caps hide the seams between wall strips
  g.fillStyle = th.wallTop;
  for (const seg of rails) {
    for (const [x, y] of [[seg.ax, seg.ay], [seg.bx, seg.by]]) {
      const p = w2s(cam, W, H, x, y);
      g.beginPath();
      g.arc(p.x, p.y, wallW * 0.5 * s, 0, Math.PI * 2);
      g.fill();
    }
  }

  // moving blocks
  for (const bl of geom.movers) {
    const pts = blockPtsAt(bl, o.t);
    const low = bl.h !== undefined && bl.h < WALL_H;
    if (bl.motion?.type === 'blink') {
      // laser gate: a glowing beam while solid, a faint outline while open
      const on = moverActive(bl, o.t);
      g.globalAlpha = on ? 0.9 : 0.22;
      poly(g, pts, cam, W, H);
      g.fillStyle = th.laser;
      g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = on ? '#fff' : th.laser;
      g.lineWidth = Math.max(1, 0.08 * s);
      g.setLineDash(on ? [] : [4, 4]);
      g.stroke();
      g.setLineDash([]);
      if (o.editor && o.selected === bl) highlightPoly(g, pts, cam, W, H);
      continue;
    }
    const top = bl.bounce && bl.bounce > 1 ? th.rubber : low ? th.wallLow : th.wallTop;
    extruded(g, pts, cam, W, H, top, th.wallSide, low ? 0.25 : 0.55);
    if (bl.hub && bl.motion && (bl.motion.type === 'rotate' || bl.motion.type === 'swing')) {
      const p = w2s(cam, W, H, bl.motion.cx, bl.motion.cy);
      g.beginPath();
      g.arc(p.x, p.y, bl.hub * s, 0, Math.PI * 2);
      g.fillStyle = th.wallSide;
      g.fill();
      g.beginPath();
      g.arc(p.x, p.y, bl.hub * s * 0.55, 0, Math.PI * 2);
      g.fillStyle = th.wallTop;
      g.fill();
    }
    if (o.editor && o.selected === bl) highlightPoly(g, pts, cam, W, H);
  }
}

function highlightPoly(g: CanvasRenderingContext2D, pts: number[], cam: Camera, W: number, H: number) {
  poly(g, pts, cam, W, H);
  g.strokeStyle = '#a4ff3d';
  g.lineWidth = 2;
  g.setLineDash([6, 4]);
  g.stroke();
  g.setLineDash([]);
}

function drawZone(g: CanvasRenderingContext2D, z: Zone, cam: Camera, W: number, H: number, o: DrawOpts) {
  const th = o.theme;
  const s = cam.scale;
  const p = w2s(cam, W, H, z.x, z.y);
  const w = z.w * s, h = z.h * s;
  g.save();
  g.beginPath();
  g.rect(p.x, p.y, w, h);
  g.clip();
  switch (z.kind) {
    case 'sand': {
      g.fillStyle = th.sand;
      g.fillRect(p.x, p.y, w, h);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      const speckles = Math.min(600, Math.max(0, Math.floor((z.w * z.h) / 2)) || 0);
      for (let i = 0; i < speckles; i++) {
        // deterministic speckle from index
        const fx = ((i * 7919) % 1000) / 1000, fy = ((i * 104729) % 1000) / 1000;
        g.fillRect(p.x + fx * w, p.y + fy * h, Math.max(1, 0.08 * s), Math.max(1, 0.08 * s));
      }
      break;
    }
    case 'ice': {
      g.fillStyle = th.ice;
      g.fillRect(p.x, p.y, w, h);
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = Math.max(1, 0.06 * s);
      g.beginPath();
      for (let i = -1; i < Math.min(200, (z.w + z.h) / 3); i++) {
        const x0 = p.x + i * 3 * s;
        g.moveTo(x0, p.y + h);
        g.lineTo(x0 + h, p.y);
      }
      g.stroke();
      break;
    }
    case 'water': {
      const grad = g.createLinearGradient(p.x, p.y, p.x, p.y + h);
      grad.addColorStop(0, th.water);
      grad.addColorStop(1, th.waterDeep);
      g.fillStyle = grad;
      g.fillRect(p.x, p.y, w, h);
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = Math.max(1, 0.07 * s);
      for (let row = 0; row < Math.min(z.h, 300); row += 1.5) {
        g.beginPath();
        for (let x = 0; x <= z.w; x += 0.25) {
          const y = row + 0.4 * Math.sin(x * 2 + o.t * 2.5 + row);
          const q = w2s(cam, W, H, z.x + x, z.y + y);
          if (x === 0) g.moveTo(q.x, q.y); else g.lineTo(q.x, q.y);
        }
        g.stroke();
      }
      break;
    }
    case 'slope': {
      // a wedge: bright at the top edge, shaded down the run, with a hard
      // shadow line along the top (the step the ball drops off)
      const a = ((z.angle ?? 0) * Math.PI) / 180;
      const cx = p.x + w / 2, cy = p.y + h / 2;
      const grad = g.createLinearGradient(cx - Math.cos(a) * w / 2, cy - Math.sin(a) * h / 2, cx + Math.cos(a) * w / 2, cy + Math.sin(a) * h / 2);
      grad.addColorStop(0, 'rgba(255,255,255,0.22)');
      grad.addColorStop(1, 'rgba(0,0,0,0.28)');
      g.fillStyle = grad;
      g.fillRect(p.x, p.y, w, h);
      drawArrows(g, z, cam, W, H, a, 'rgba(255,255,255,0.28)', 0, 3);
      const rise = rampRise(z);
      g.lineWidth = Math.max(2, Math.min(0.5, rise * 0.25) * s);
      g.strokeStyle = 'rgba(0,0,0,0.45)';
      g.beginPath();
      const corners = [[z.x, z.y], [z.x + z.w, z.y], [z.x + z.w, z.y + z.h], [z.x, z.y + z.h]];
      for (let i = 0; i < 4; i++) {
        const c0 = corners[i], c1 = corners[(i + 1) % 4];
        // an edge is the top edge when both its ends sit at the top of the run
        if (rampFrac(z, c0[0], c0[1]) < 0.01 && rampFrac(z, c1[0], c1[1]) < 0.01) {
          const q0 = w2s(cam, W, H, c0[0], c0[1]), q1 = w2s(cam, W, H, c1[0], c1[1]);
          g.moveTo(q0.x, q0.y); g.lineTo(q1.x, q1.y);
        }
      }
      g.stroke();
      if (o.editor) {
        g.fillStyle = '#fff';
        g.font = `700 ${Math.max(9, s * 0.45)}px Chakra Petch, sans-serif`;
        g.textAlign = 'center';
        g.fillText(`RAMP ↑${rise.toFixed(1)}`, cx, cy + h / 2 - 0.3 * s);
      }
      break;
    }
    case 'conveyor': {
      g.fillStyle = th.conveyor;
      g.fillRect(p.x, p.y, w, h);
      const a = ((z.angle ?? 0) * Math.PI) / 180;
      const sp = zonePower(z);
      drawArrows(g, z, cam, W, H, a, '#ffd60a', (o.t * Math.max(1, sp) * 0.5) % 1.5, 1.5);
      break;
    }
    case 'spinner': {
      const cx = p.x + w / 2, cy = p.y + h / 2;
      const r = Math.min(w, h) / 2;
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(p.x, p.y, w, h);
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fillStyle = th.spinner;
      g.fill();
      const ang = zonePower(z) * o.t;
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = Math.max(1.5, 0.12 * s);
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const t = ang + (i / 6) * Math.PI * 2;
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(t) * r * 0.92, cy + Math.sin(t) * r * 0.92);
      }
      g.stroke();
      g.beginPath();
      g.arc(cx, cy, r * 0.18, 0, Math.PI * 2);
      g.fillStyle = '#fff';
      g.fill();
      break;
    }
    case 'fan': {
      g.fillStyle = 'rgba(91,209,255,0.28)';
      g.fillRect(p.x, p.y, w, h);
      const a = ((z.angle ?? 0) * Math.PI) / 180;
      drawArrows(g, z, cam, W, H, a, th.fan, (o.t * 9) % 2, 2);
      const cx = p.x + w / 2, cy = p.y + h / 2;
      const r = Math.min(w, h) * 0.3;
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = Math.max(2, 0.18 * s);
      g.beginPath();
      for (let i = 0; i < 3; i++) {
        const t = o.t * 14 + (i / 3) * Math.PI * 2;
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(t) * r, cy + Math.sin(t) * r);
      }
      g.stroke();
      break;
    }
    case 'trampoline': {
      g.fillStyle = th.tramp;
      g.fillRect(p.x, p.y, w, h);
      const cx = p.x + w / 2, cy = p.y + h / 2;
      const r = Math.min(w, h) / 2;
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = Math.max(1.5, 0.1 * s);
      for (let k = 0.25; k <= 1; k += 0.25) {
        g.beginPath();
        g.ellipse(cx, cy, (w / 2) * k, (h / 2) * k, 0, 0, Math.PI * 2);
        g.stroke();
      }
      void r;
      break;
    }
    case 'magnet': {
      const repel = zonePower(z) < 0;
      const col = repel ? th.repel : th.magnet;
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(p.x, p.y, w, h);
      const cx = p.x + w / 2, cy = p.y + h / 2;
      const rmax = Math.min(w, h) / 2;
      g.strokeStyle = col;
      g.lineWidth = Math.max(1.5, 0.1 * s);
      for (let i = 0; i < 4; i++) {
        let k = ((o.t * 0.6 + i / 4) % 1);
        if (!repel) k = 1 - k;
        g.globalAlpha = 0.25 + 0.6 * (1 - k);
        g.beginPath();
        g.arc(cx, cy, rmax * k, 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.beginPath();
      g.arc(cx, cy, Math.max(3, 0.35 * s), 0, Math.PI * 2);
      g.fillStyle = col;
      g.fill();
      break;
    }
    case 'cannon': {
      g.fillStyle = th.cannon;
      g.fillRect(p.x, p.y, w, h);
      const a = ((z.angle ?? 0) * Math.PI) / 180;
      const cx = p.x + w / 2, cy = p.y + h / 2;
      const len = Math.min(w, h) * 0.45;
      g.strokeStyle = '#1a1d24';
      g.lineWidth = Math.max(4, 0.7 * s);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx - Math.cos(a) * len * 0.5, cy - Math.sin(a) * len * 0.5);
      g.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      g.stroke();
      g.strokeStyle = '#9aa3b5';
      g.lineWidth = Math.max(2, 0.4 * s);
      g.stroke();
      const flash = 0.5 + 0.5 * Math.sin(o.t * 6);
      g.beginPath();
      g.arc(cx + Math.cos(a) * len, cy + Math.sin(a) * len, Math.max(3, 0.45 * s), 0, Math.PI * 2);
      g.fillStyle = `rgba(255,214,10,${0.3 + flash * 0.5})`;
      g.fill();
      break;
    }
    case 'boost': {
      g.fillStyle = 'rgba(255,138,61,0.35)';
      g.fillRect(p.x, p.y, w, h);
      const a = ((z.angle ?? 0) * Math.PI) / 180;
      drawArrows(g, z, cam, W, H, a, th.boost, (o.t * 6) % 2, 2);
      break;
    }
    case 'gravity': {
      // a warped patch of space: dark, a faint grid bowing toward the pull,
      // streaming chevrons the way the ball is dragged
      g.fillStyle = 'rgba(20,10,60,0.55)';
      g.fillRect(p.x, p.y, w, h);
      g.strokeStyle = 'rgba(179,156,255,0.22)';
      g.lineWidth = 1;
      g.beginPath();
      for (let k = 0; k <= Math.min(200, z.w); k += 2) { const q = w2s(cam, W, H, z.x + k, z.y); g.moveTo(q.x, q.y); g.lineTo(q.x, q.y + h); }
      for (let k = 0; k <= Math.min(200, z.h); k += 2) { const q = w2s(cam, W, H, z.x, z.y + k); g.moveTo(q.x, q.y); g.lineTo(q.x + w, q.y); }
      g.stroke();
      const a = ((z.angle ?? 0) * Math.PI) / 180;
      const sp = zonePower(z);
      drawArrows(g, z, cam, W, H, a, th.gravity, (o.t * Math.min(12, 2 + sp * 0.5)) % 2.5, 2.5);
      if (o.editor) {
        g.fillStyle = '#fff';
        g.font = `700 ${Math.max(9, s * 0.45)}px Chakra Petch, sans-serif`;
        g.textAlign = 'center';
        g.fillText(`GRAVITY ${sp.toFixed(1)}`, p.x + w / 2, p.y + h / 2 + s * 0.2);
      }
      break;
    }
    case 'tunnel': {
      // an underpass: the platform's roof over it in shadow, hatched like a
      // grating so it reads as "under", with the dark of the passage showing
      g.fillStyle = 'rgba(0,0,0,0.42)';
      g.fillRect(p.x, p.y, w, h);
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = Math.max(1, 0.12 * s);
      g.beginPath();
      const stepPx = 1.1 * s;
      for (let k = -h; k < w; k += stepPx) { g.moveTo(p.x + k, p.y + h); g.lineTo(p.x + k + h, p.y); }
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.45)';
      g.lineWidth = Math.max(1, 0.08 * s);
      g.setLineDash([Math.max(3, 0.4 * s), Math.max(3, 0.4 * s)]);
      g.strokeRect(p.x + 1, p.y + 1, w - 2, h - 2);
      g.setLineDash([]);
      break;
    }
    case 'jump': {
      g.fillStyle = th.jump;
      g.fillRect(p.x, p.y, w, h);
      g.fillStyle = 'rgba(0,0,0,0.75)';
      for (let i = -1; i < Math.min(400, (z.w + z.h) / 1.2); i++) {
        const x0 = p.x + i * 1.2 * s;
        g.beginPath();
        g.moveTo(x0, p.y + h); g.lineTo(x0 + h, p.y); g.lineTo(x0 + h + 0.5 * s, p.y); g.lineTo(x0 + 0.5 * s, p.y + h);
        g.closePath();
        g.fill();
      }
      break;
    }
    case 'tele': {
      const pulse = 0.5 + 0.5 * Math.sin(o.t * 4);
      g.fillStyle = `rgba(199,125,255,${0.35 + pulse * 0.2})`;
      g.fillRect(p.x, p.y, w, h);
      g.strokeStyle = th.tele;
      g.lineWidth = Math.max(2, 0.15 * s);
      g.strokeRect(p.x + 2, p.y + 2, w - 4, h - 4);
      const cx = p.x + w / 2, cy = p.y + h / 2;
      for (let i = 0; i < 3; i++) {
        const r = ((o.t * 0.8 + i / 3) % 1) * Math.min(w, h) * 0.45;
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.strokeStyle = `rgba(255,255,255,${0.6 * (1 - r / (Math.min(w, h) * 0.45))})`;
        g.lineWidth = 2;
        g.stroke();
      }
      break;
    }
  }
  g.restore();
  if (z.kind === 'tele' && z.tx !== undefined && z.ty !== undefined) {
    const q = w2s(cam, W, H, z.tx, z.ty);
    g.beginPath();
    g.arc(q.x, q.y, 0.7 * s, 0, Math.PI * 2);
    g.strokeStyle = th.tele;
    g.lineWidth = Math.max(2, 0.12 * s);
    g.setLineDash([4, 4]);
    g.stroke();
    g.setLineDash([]);
    if (o.editor) {
      g.strokeStyle = 'rgba(199,125,255,0.5)';
      g.beginPath();
      g.moveTo(p.x + w / 2, p.y + h / 2);
      g.lineTo(q.x, q.y);
      g.stroke();
    }
  }
  if (o.editor && o.selected === z) {
    g.strokeStyle = '#a4ff3d';
    g.lineWidth = 2;
    g.setLineDash([6, 4]);
    g.strokeRect(p.x, p.y, w, h);
    g.setLineDash([]);
  }
}

function drawArrows(g: CanvasRenderingContext2D, z: Zone, cam: Camera, W: number, H: number, a: number, color: string, phase: number, spacing: number) {
  const s = cam.scale;
  const cx = z.x + z.w / 2, cy = z.y + z.h / 2;
  const ux = Math.cos(a), uy = Math.sin(a);
  const vx = -uy, vy = ux;
  const len = Math.min(400, Math.hypot(z.w, z.h));
  g.strokeStyle = color;
  g.lineWidth = Math.max(1.5, 0.14 * s);
  g.lineCap = 'round';
  for (let d = -len / 2 - spacing; d < len / 2 + spacing; d += spacing) {
    const dd = d + phase;
    for (let side = -len / 2; side <= len / 2; side += spacing) {
      const bx = cx + ux * dd + vx * side, by = cy + uy * dd + vy * side;
      const tip = w2s(cam, W, H, bx + ux * 0.6, by + uy * 0.6);
      const l = w2s(cam, W, H, bx - ux * 0.2 + vx * 0.6, by - uy * 0.2 + vy * 0.6);
      const r = w2s(cam, W, H, bx - ux * 0.2 - vx * 0.6, by - uy * 0.2 - vy * 0.6);
      g.beginPath();
      g.moveTo(l.x, l.y); g.lineTo(tip.x, tip.y); g.lineTo(r.x, r.y);
      g.stroke();
    }
  }
}

export function drawBall(
  g: CanvasRenderingContext2D, cam: Camera, W: number, H: number,
  x: number, y: number, z: number, color: string, opts: { label?: string; me?: boolean; ghost?: boolean; holed?: boolean; emote?: string }
) {
  const s = cam.scale;
  const p = w2s(cam, W, H, x, y);
  const r = BALL_R * s * (1 + z * 0.06);
  g.save();
  if (opts.ghost) g.globalAlpha = 0.45;
  // shadow (drifts away with height)
  g.beginPath();
  g.ellipse(p.x + z * 0.18 * s, p.y + 0.15 * s + z * 0.25 * s, r * 0.95, r * 0.6, 0, 0, Math.PI * 2);
  g.fillStyle = `rgba(0,0,0,${Math.max(0.15, 0.4 - z * 0.03)})`;
  g.fill();
  const by = p.y - z * 0.55 * s;
  const grad = g.createRadialGradient(p.x - r * 0.35, by - r * 0.4, r * 0.1, p.x, by, r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.3, color);
  grad.addColorStop(1, shade(color, 0.45));
  g.beginPath();
  g.arc(p.x, by, r, 0, Math.PI * 2);
  g.fillStyle = grad;
  g.fill();
  if (opts.me) {
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = Math.max(1, 0.06 * s);
    g.stroke();
  }
  if (opts.label) {
    g.font = `700 ${Math.max(10, Math.min(16, s * 0.55))}px Chakra Petch, sans-serif`;
    g.textAlign = 'center';
    g.fillStyle = 'rgba(0,0,0,0.6)';
    const tw = g.measureText(opts.label).width;
    g.fillRect(p.x - tw / 2 - 4, by - r - 18, tw + 8, 14);
    g.fillStyle = opts.me ? '#a4ff3d' : '#fff';
    g.fillText(opts.label, p.x, by - r - 7);
  }
  if (opts.emote) {
    g.font = `${Math.max(16, s * 1.2)}px sans-serif`;
    g.textAlign = 'center';
    g.fillText(opts.emote, p.x, by - r - 26);
  }
  g.restore();
}

export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k), gg = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
  return `rgb(${r},${gg},${b})`;
}

/** Aim indicator: arrow from the ball in the shot direction, plus a predicted path. */
export function drawAim(
  g: CanvasRenderingContext2D, cam: Camera, W: number, H: number,
  x: number, y: number, angle: number, power: number, color: string, path?: { x: number; y: number }[]
) {
  const s = cam.scale;
  const p = w2s(cam, W, H, x, y);
  const len = (2 + power * 7) * s;
  const ux = Math.cos(angle), uy = Math.sin(angle);
  if (path && path.length > 1) {
    g.beginPath();
    for (let i = 0; i < path.length; i++) {
      const q = w2s(cam, W, H, path[i].x, path[i].y);
      if (i === 0) g.moveTo(q.x, q.y); else g.lineTo(q.x, q.y);
    }
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = Math.max(1, 0.1 * s);
    g.setLineDash([0.4 * s, 0.5 * s]);
    g.stroke();
    g.setLineDash([]);
  }
  // pull-back handle
  g.beginPath();
  g.moveTo(p.x, p.y);
  g.lineTo(p.x - ux * len * 0.6, p.y - uy * len * 0.6);
  g.strokeStyle = 'rgba(255,255,255,0.3)';
  g.lineWidth = Math.max(2, 0.18 * s);
  g.stroke();
  // arrow
  const heat = power < 0.5 ? `rgb(${Math.round(164 + (255 - 164) * power * 2)},255,61)` : `rgb(255,${Math.round(255 - (255 - 75) * (power - 0.5) * 2)},51)`;
  g.strokeStyle = heat;
  g.lineWidth = Math.max(3, 0.28 * s);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(p.x + ux * BALL_R * s, p.y + uy * BALL_R * s);
  g.lineTo(p.x + ux * len, p.y + uy * len);
  g.stroke();
  const hx = p.x + ux * len, hy = p.y + uy * len;
  g.fillStyle = heat;
  g.beginPath();
  g.moveTo(hx + ux * 0.6 * s, hy + uy * 0.6 * s);
  g.lineTo(hx - uy * 0.45 * s, hy + ux * 0.45 * s);
  g.lineTo(hx + uy * 0.45 * s, hy - ux * 0.45 * s);
  g.closePath();
  g.fill();
  void color;
}

export const powerToSpeed = (p: number) => MIN_SHOT + (MAX_SHOT - MIN_SHOT) * p;

// ---------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; gravity: number }

export class Particles {
  private ps: Particle[] = [];
  burst(x: number, y: number, n: number, color: string, speed = 6, size = 0.18, life = 0.5, gravity = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.6);
      this.ps.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life, color, size: size * (0.6 + Math.random() * 0.8), gravity });
    }
  }
  confetti(x: number, y: number) {
    const cols = ['#ffd60a', '#ff4b4b', '#4b8bff', '#43e97b', '#c77dff', '#ffffff'];
    for (let i = 0; i < 60; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const sp = 8 + Math.random() * 10;
      this.ps.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.6, max: 1.6, color: cols[i % cols.length], size: 0.25, gravity: 18 });
    }
  }
  step(dt: number) {
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i];
      p.life -= dt;
      if (p.life <= 0) { this.ps.splice(i, 1); continue; }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.98; p.vy *= 0.98;
    }
  }
  draw(g: CanvasRenderingContext2D, cam: Camera, W: number, H: number) {
    for (const p of this.ps) {
      const q = w2s(cam, W, H, p.x, p.y);
      g.globalAlpha = Math.max(0, p.life / p.max);
      g.fillStyle = p.color;
      const r = p.size * cam.scale;
      g.fillRect(q.x - r / 2, q.y - r / 2, r, r);
    }
    g.globalAlpha = 1;
  }
  get count() { return this.ps.length; }
}

export function isMoverBlock(b: Block): boolean { return !!b.motion; }
