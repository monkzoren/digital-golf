// Prop models for the 3D renderer: every `PROP_KINDS` entry built from
// three.js primitives, procedurally, with no art assets. A model is built
// in a UNIT BOX — x and z in [-0.5, 0.5], y (up) in [0, 1] — and the caller
// scales it: a scenery prop (`Hole.props`) to `PROP_SIZE[kind]` × its `s`,
// a dressed block (`Block.look`) to the polygon's bounding box × its height,
// so a dressed block is drawn exactly as big as it collides.
//
// Materials are shared across every prop and every hole (`userData.shared`
// tells disposeHole to leave them alone); geometries belong to the hole.
import * as THREE from 'three';
import type { PropKind } from '@shared/courses';

/** Default world size (w, h, d) of each prop; `s` on the prop scales it. */
export const PROP_SIZE: Record<PropKind, [number, number, number]> = {
  screen: [12, 7, 0.8], projector: [2, 1.6, 2.2], reel: [2.4, 2.4, 0.5], popcorn: [1.6, 2.1, 1.6],
  clapper: [1.8, 1.7, 0.5], spotlight: [1.4, 4.2, 1.4], seats: [3.2, 1.5, 1.3], camera: [1.8, 3.2, 1.8],
  palm: [4.5, 8.5, 4.5], barrel: [1.5, 1.7, 1.5], chest: [1.9, 1.4, 1.3], anchor: [2.2, 3.2, 0.7],
  mast: [7, 13, 1.2], crate: [1.6, 1.6, 1.6], skull: [1.5, 1.5, 1.5], rock: [2.8, 1.8, 2.4],
  speaker: [1.7, 3.2, 1.7], drum: [2.2, 1.3, 2.2], note: [1.3, 2.6, 0.5], mic: [1, 3.4, 1],
  keys: [4.5, 0.7, 1.6], amp: [1.9, 1.7, 1.1], cymbal: [1.9, 2.8, 1.9], guitar: [1.3, 3.1, 0.9],
  cheese: [3, 1.7, 2.2], mousetrap: [3.2, 1.1, 1.7], can: [1.7, 2.8, 1.7], book: [3.2, 1.3, 2.4],
  mug: [1.6, 1.7, 1.6], fork: [4.2, 0.35, 0.9], rat: [1.8, 1, 1.1], plate: [3.2, 0.25, 3.2],
  tree: [4, 6.5, 4], fence: [4.5, 1.3, 0.35], giraffe: [2.6, 6.5, 1.6], elephant: [3.8, 3.2, 2.2],
  sign: [1.8, 2.8, 0.35], bush: [2.2, 1.3, 2.2], cage: [3.2, 2.6, 3.2], flamingo: [1.1, 2.6, 1.1],
};

// ---------------------------------------------------------------------------
// Shared materials
// ---------------------------------------------------------------------------
const matCache = new Map<string, THREE.MeshStandardMaterial>();
function M(color: number, roughness = 0.7, metalness = 0, extra: Partial<THREE.MeshStandardMaterialParameters> & { glow?: [number, number, number]; flat?: boolean } = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${roughness}|${metalness}|${JSON.stringify(extra)}`;
  let m = matCache.get(key);
  if (m) return m;
  const { glow, flat, ...rest } = extra;
  m = new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: !!flat, ...rest });
  if (glow) { m.emissive.setRGB(glow[0], glow[1], glow[2]); m.emissiveIntensity = 1; }
  m.userData.shared = true;
  matCache.set(key, m);
  return m;
}
const MAT = {
  wood: () => M(0x8a5a2b, 0.75), darkWood: () => M(0x4a2e16, 0.8), paleWood: () => M(0xc9a46b, 0.8),
  steel: () => M(0x9aa3ad, 0.35, 0.8), chrome: () => M(0xd8dde4, 0.2, 0.9), iron: () => M(0x2b2f36, 0.55, 0.6),
  black: () => M(0x121216, 0.6), grey: () => M(0x6b6f77, 0.85), white: () => M(0xf2f2f0, 0.6), bone: () => M(0xe8e0c8, 0.7),
  red: () => M(0xc4242a, 0.5), velvet: () => M(0x8a1420, 0.95), gold: () => M(0xe0b23a, 0.3, 0.8), brass: () => M(0xb8892e, 0.4, 0.7),
  leaf: () => M(0x3f8a34, 0.85), leafDark: () => M(0x2e6b28, 0.9), trunk: () => M(0x7a5a36, 0.9), canvas: () => M(0xe9e2cf, 0.9, 0, { side: THREE.DoubleSide }),
  yellow: () => M(0xf2c53d, 0.6), cheese: () => M(0xf5c542, 0.55), paper: () => M(0xf4efe2, 0.9), pink: () => M(0xf08ab0, 0.6),
  orange: () => M(0xe86f2c, 0.6), blue: () => M(0x2f6fd0, 0.5), teal: () => M(0x2aa4a0, 0.5), skin: () => M(0x8d8d92, 0.8),
  giraffe: () => M(0xe4b453, 0.8), patch: () => M(0x7a4a1e, 0.85), elephant: () => M(0x8a8c90, 0.85), dirt: () => M(0x6b4f2e, 1),
  glass: () => M(0xcfe8ff, 0.1, 0, { transparent: true, opacity: 0.35 }),
  bulb: () => M(0xffffff, 0.3, 0, { glow: [2.6, 2.4, 2.0] }),
  screenLit: () => M(0xffffff, 0.4, 0, { glow: [1.5, 1.6, 1.8] }),
  neonPink: () => M(0xff3d9a, 0.4, 0, { glow: [1.8, 0.3, 1.0] }),
  neonCyan: () => M(0x4be3ff, 0.4, 0, { glow: [0.3, 1.4, 1.7] }),
  cola: () => M(0xc4242a, 0.35, 0.2), grill: () => M(0x1a1a1c, 0.95), cone: () => M(0x2a2a2e, 0.6),
};

// ---------------------------------------------------------------------------
// Primitive helpers (all in the unit box)
// ---------------------------------------------------------------------------
type Grp = THREE.Group;
function add(g: Grp, m: THREE.Mesh, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
const box = (g: Grp, w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) =>
  add(g, new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), x, y, z, rx, ry, rz);
const cyl = (g: Grp, rt: number, rb: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 16) =>
  add(g, new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat), x, y, z, rx, ry, rz);
const ball = (g: Grp, r: number, mat: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
  const m = add(g, new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), mat), x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
};
const ring = (g: Grp, r: number, tube: number, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, arc = Math.PI * 2) =>
  add(g, new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 24, arc), mat), x, y, z, rx, ry, rz);
const cone = (g: Grp, r: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 12) =>
  add(g, new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat), x, y, z, rx, ry, rz);
const H = Math.PI / 2;

// ---------------------------------------------------------------------------
// The models
// ---------------------------------------------------------------------------
const BUILDERS: Record<PropKind, (g: Grp) => void> = {
  // ---- cinema -------------------------------------------------------------
  screen(g) {
    box(g, 1, 0.94, 0.3, MAT.black(), 0, 0.53, 0);
    box(g, 0.92, 0.8, 0.02, MAT.screenLit(), 0, 0.56, 0.16); // the lit silver screen faces +z
    box(g, 1, 0.06, 0.34, MAT.velvet(), 0, 0.03, 0);
    box(g, 0.05, 0.9, 0.36, MAT.velvet(), -0.5, 0.55, 0.02);
    box(g, 0.05, 0.9, 0.36, MAT.velvet(), 0.5, 0.55, 0.02);
  },
  projector(g) {
    box(g, 0.6, 0.45, 0.8, MAT.iron(), 0, 0.28, -0.05);
    cyl(g, 0.12, 0.16, 0.3, MAT.steel(), 0, 0.33, 0.45, H);
    ball(g, 0.1, MAT.glass(), 0, 0.33, 0.6);
    cyl(g, 0.04, 0.04, 0.3, MAT.steel(), 0, 0.65, -0.1);
    for (const [z, r] of [[-0.3, 0.3], [0.15, 0.24]] as const) {
      cyl(g, r, r, 0.08, MAT.steel(), 0, 0.72 + r * 0.6, z, 0, 0, H, 24);
      cyl(g, r * 0.35, r * 0.35, 0.1, MAT.black(), 0, 0.72 + r * 0.6, z, 0, 0, H);
    }
    box(g, 0.5, 0.06, 0.5, MAT.black(), 0, 0.03, 0);
  },
  reel(g) {
    cyl(g, 0.5, 0.5, 0.35, MAT.iron(), 0, 0.5, 0, H, 0, 0, 32);
    cyl(g, 0.2, 0.2, 0.55, MAT.steel(), 0, 0.5, 0, H, 0, 0, 20);
    ring(g, 0.5, 0.06, MAT.steel(), 0, 0.5, 0);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      cyl(g, 0.11, 0.11, 0.6, MAT.black(), Math.cos(a) * 0.32, 0.5 + Math.sin(a) * 0.32, 0, H, 0, 0, 12);
    }
  },
  popcorn(g) {
    const stripes = 8;
    for (let i = 0; i < stripes; i++) {
      const a0 = (i / stripes) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.34, 0.66, 3, 1, false, a0, (Math.PI * 2) / stripes), i % 2 ? MAT.white() : MAT.red());
      add(g, m, 0, 0.33, 0);
    }
    cyl(g, 0.34, 0.34, 0.04, MAT.white(), 0, 0.02, 0);
    for (let i = 0; i < 11; i++) {
      const a = i * 2.4, r = i < 6 ? 0.28 : 0.12;
      ball(g, 0.12 + (i % 3) * 0.02, i % 2 ? MAT.paper() : MAT.yellow(), Math.cos(a) * r, 0.7 + (i < 6 ? 0.05 : 0.2) + (i % 3) * 0.03, Math.sin(a) * r, 1, 0.85, 1);
    }
  },
  clapper(g) {
    box(g, 0.9, 0.62, 0.12, MAT.black(), 0, 0.34, 0);
    box(g, 0.7, 0.04, 0.005, MAT.white(), 0, 0.42, 0.065);
    box(g, 0.7, 0.04, 0.005, MAT.white(), 0, 0.28, 0.065);
    const top = new THREE.Group();
    top.position.set(-0.45, 0.66, 0);
    top.rotation.z = 0.45;
    for (let i = 0; i < 6; i++) box(top, 0.15, 0.14, 0.12, i % 2 ? MAT.white() : MAT.black(), 0.075 + i * 0.15, 0.07, 0);
    g.add(top);
    box(g, 0.9, 0.14, 0.12, MAT.black(), 0, 0.72, 0);
    for (let i = 0; i < 6; i++) box(g, 0.15, 0.14, 0.125, i % 2 ? MAT.black() : MAT.white(), -0.375 + i * 0.15, 0.72, 0);
    cyl(g, 0.06, 0.08, 0.1, MAT.steel(), 0, 0.06, 0, 0, 0, 0, 10);
  },
  spotlight(g) {
    cyl(g, 0.2, 0.28, 0.06, MAT.iron(), 0, 0.03, 0);
    for (let i = 0; i < 3; i++) cyl(g, 0.02, 0.02, 0.6, MAT.steel(), Math.cos(i * 2.1) * 0.18, 0.3, Math.sin(i * 2.1) * 0.18, Math.sin(i * 2.1) * 0.5, 0, -Math.cos(i * 2.1) * 0.5, 6);
    cyl(g, 0.025, 0.025, 0.7, MAT.steel(), 0, 0.55, 0);
    const head = new THREE.Group();
    head.position.set(0, 0.86, 0);
    head.rotation.x = -0.55;
    cyl(head, 0.17, 0.13, 0.32, MAT.iron(), 0, 0, 0, H);
    cyl(head, 0.15, 0.15, 0.02, MAT.bulb(), 0, 0, 0.17, H);
    ring(head, 0.17, 0.02, MAT.steel(), 0, 0, 0.17);
    box(head, 0.05, 0.08, 0.2, MAT.iron(), 0, 0.16, -0.05);
    g.add(head);
  },
  seats(g) {
    box(g, 1, 0.06, 0.9, MAT.black(), 0, 0.03, 0);
    for (let i = 0; i < 3; i++) {
      const x = -0.33 + i * 0.33;
      box(g, 0.28, 0.1, 0.4, MAT.velvet(), x, 0.32, 0.12);
      box(g, 0.28, 0.6, 0.1, MAT.velvet(), x, 0.6, -0.16, -0.15);
      box(g, 0.04, 0.34, 0.42, MAT.wood(), x - 0.16, 0.36, 0.06);
      box(g, 0.04, 0.34, 0.42, MAT.wood(), x + 0.16, 0.36, 0.06);
      box(g, 0.28, 0.24, 0.1, MAT.iron(), x, 0.15, 0.1);
    }
  },
  camera(g) {
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + 0.5;
      cyl(g, 0.02, 0.02, 0.74, MAT.iron(), Math.cos(a) * 0.22, 0.37, Math.sin(a) * 0.22, Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55, 6);
    }
    box(g, 0.32, 0.3, 0.5, MAT.black(), 0, 0.82, -0.02);
    cyl(g, 0.09, 0.12, 0.32, MAT.iron(), 0, 0.82, 0.38, H);
    ball(g, 0.07, MAT.glass(), 0, 0.82, 0.55);
    for (const z of [-0.2, 0.06]) { cyl(g, 0.16, 0.16, 0.08, MAT.iron(), 0, 1.0 - 0.16 + 0.12, z, 0, 0, H, 20); ring(g, 0.16, 0.02, MAT.steel(), 0, 0.96, z, 0, H, 0); }
    box(g, 0.06, 0.08, 0.12, MAT.steel(), 0.19, 0.7, -0.1);
  },
  // ---- pirate -------------------------------------------------------------
  palm(g) {
    const trunk = new THREE.Group();
    for (let i = 0; i < 4; i++) cyl(trunk, 0.05 - i * 0.006, 0.065 - i * 0.006, 0.2, MAT.trunk(), 0.02 * i * i, 0.1 + i * 0.185, 0, 0, 0, -0.12 * i, 10);
    g.add(trunk);
    const top = new THREE.Vector3(0.2, 0.78, 0);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const frond = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.14), i % 2 ? MAT.leaf() : MAT.leafDark());
      frond.position.set(top.x + Math.cos(a) * 0.24, top.y - 0.04, top.z + Math.sin(a) * 0.24);
      frond.rotation.set(0, -a, -0.55);
      frond.castShadow = true;
      g.add(frond);
    }
    for (let i = 0; i < 3; i++) ball(g, 0.05, MAT.darkWood(), top.x + Math.cos(i * 2.1) * 0.06, top.y - 0.06, top.z + Math.sin(i * 2.1) * 0.06);
  },
  barrel(g) {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(0.42 + Math.sin(t * Math.PI) * 0.08, t)); }
    const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), MAT.darkWood());
    add(g, body);
    cyl(g, 0.42, 0.42, 0.02, MAT.wood(), 0, 1.0, 0);
    for (const y of [0.15, 0.5, 0.85]) ring(g, 0.42 + Math.sin(y * Math.PI) * 0.08, 0.025, MAT.iron(), 0, y, 0, H);
  },
  chest(g) {
    box(g, 1, 0.5, 0.7, MAT.darkWood(), 0, 0.27, 0);
    box(g, 1, 0.06, 0.72, MAT.brass(), 0, 0.05, 0);
    box(g, 0.06, 0.5, 0.72, MAT.brass(), -0.47, 0.27, 0);
    box(g, 0.06, 0.5, 0.72, MAT.brass(), 0.47, 0.27, 0);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1, 16, 1, false, 0, Math.PI), MAT.darkWood());
    add(g, lid, 0, 0.52, 0, 0, 0, -H);
    lid.scale.set(1, 1, 1.37);
    ring(g, 0.35, 0.04, MAT.brass(), -0.48, 0.52, 0, 0, H, 0, Math.PI);
    ring(g, 0.35, 0.04, MAT.brass(), 0.48, 0.52, 0, 0, H, 0, Math.PI);
    box(g, 0.14, 0.14, 0.06, MAT.gold(), 0, 0.45, 0.36);
  },
  anchor(g) {
    cyl(g, 0.05, 0.05, 0.8, MAT.iron(), 0, 0.45, 0);
    ring(g, 0.09, 0.03, MAT.iron(), 0, 0.93, 0);
    box(g, 0.55, 0.06, 0.06, MAT.wood(), 0, 0.78, 0);
    ring(g, 0.42, 0.045, MAT.iron(), 0, 0.42, 0, 0, 0, Math.PI, Math.PI);
    cone(g, 0.1, 0.18, MAT.iron(), -0.42, 0.48, 0, 0, 0, 0.35);
    cone(g, 0.1, 0.18, MAT.iron(), 0.42, 0.48, 0, 0, 0, -0.35);
  },
  mast(g) {
    cyl(g, 0.018, 0.028, 1, MAT.wood(), 0, 0.5, 0);
    cyl(g, 0.014, 0.014, 0.9, MAT.wood(), 0, 0.72, 0, 0, 0, H);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.42, 8, 4), MAT.canvas());
    const pos = sail.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / 0.8 + 0.5) * Math.PI) * 0.09 * (0.4 + 0.6 * (0.21 - pos.getY(i)) / 0.42));
    sail.geometry.computeVertexNormals();
    add(g, sail, 0, 0.5, 0);
    cyl(g, 0.014, 0.014, 0.45, MAT.wood(), 0, 0.92, 0, 0, 0, H);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2), M(0x111114, 0.9, 0, { side: THREE.DoubleSide }));
    flag.position.set(0.2, 0.9, 0.01);
    g.add(flag);
    ball(g, 0.045, MAT.bone(), 0.2, 0.92, 0.02, 1, 1.1, 0.5);
    box(g, 0.14, 0.02, 0.01, MAT.bone(), 0.2, 0.86, 0.02, 0, 0, 0.6);
    box(g, 0.14, 0.02, 0.01, MAT.bone(), 0.2, 0.86, 0.02, 0, 0, -0.6);
    cyl(g, 0.06, 0.08, 0.02, MAT.darkWood(), 0, 0.01, 0);
  },
  crate(g) {
    box(g, 0.92, 0.92, 0.92, MAT.wood(), 0, 0.46, 0);
    for (const [x, z] of [[-0.46, -0.46], [0.46, -0.46], [-0.46, 0.46], [0.46, 0.46]]) box(g, 0.08, 1, 0.08, MAT.darkWood(), x, 0.5, z);
    for (const y of [0.04, 0.96]) { box(g, 1, 0.08, 0.08, MAT.darkWood(), 0, y, 0.46); box(g, 1, 0.08, 0.08, MAT.darkWood(), 0, y, -0.46); box(g, 0.08, 0.08, 1, MAT.darkWood(), 0.46, y, 0); box(g, 0.08, 0.08, 1, MAT.darkWood(), -0.46, y, 0); }
    box(g, 1.15, 0.07, 0.04, MAT.darkWood(), 0, 0.5, 0.47, 0, 0, 0.72);
    box(g, 1.15, 0.07, 0.04, MAT.darkWood(), 0, 0.5, -0.47, 0, 0, -0.72);
  },
  skull(g) {
    ball(g, 0.42, MAT.bone(), 0, 0.58, 0, 1, 1, 0.9);
    box(g, 0.5, 0.26, 0.4, MAT.bone(), 0, 0.2, 0.05);
    for (const x of [-0.16, 0.16]) ball(g, 0.11, MAT.black(), x, 0.62, 0.34);
    cone(g, 0.06, 0.12, MAT.black(), 0, 0.42, 0.4, H);
    for (let i = -2; i <= 2; i++) box(g, 0.06, 0.1, 0.03, MAT.white(), i * 0.08, 0.3, 0.26);
  },
  rock(g) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 1), M(0x6e6a66, 0.95, 0, { flat: true }));
    add(g, m, 0, 0.42, 0, 0.3, 0.5, 0.1);
    m.scale.set(1, 0.85, 0.9);
    const m2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), M(0x5a5652, 0.95, 0, { flat: true }));
    add(g, m2, 0.32, 0.2, 0.25, 0.7, 0.2, 0.4);
  },
  // ---- music --------------------------------------------------------------
  speaker(g) {
    for (const [y, h] of [[0.27, 0.54], [0.78, 0.44]] as const) {
      box(g, 0.94, h, 0.9, MAT.black(), 0, y, 0);
      box(g, 0.84, h - 0.08, 0.02, MAT.grill(), 0, y, 0.45);
      const r = h * 0.34;
      cyl(g, r, r, 0.03, MAT.iron(), 0, y - h * 0.08, 0.47, H, 0, 0, 24);
      cyl(g, r * 0.35, r * 0.6, 0.04, MAT.grey(), 0, y - h * 0.08, 0.485, H, 0, 0, 20);
      ring(g, r, 0.02, MAT.steel(), 0, y - h * 0.08, 0.48);
    }
    box(g, 1, 0.04, 0.96, MAT.iron(), 0, 0.53, 0);
  },
  drum(g) {
    cyl(g, 0.48, 0.48, 0.86, MAT.red(), 0, 0.5, 0, 0, 0, 0, 28);
    cyl(g, 0.48, 0.48, 0.03, MAT.paper(), 0, 0.95, 0, 0, 0, 0, 28);
    ring(g, 0.48, 0.03, MAT.chrome(), 0, 0.96, 0, H);
    ring(g, 0.48, 0.03, MAT.chrome(), 0, 0.06, 0, H);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; cyl(g, 0.03, 0.03, 0.3, MAT.chrome(), Math.cos(a) * 0.49, 0.5, Math.sin(a) * 0.49, 0, 0, 0, 8); }
  },
  note(g) {
    const mat = MAT.neonPink();
    ball(g, 0.2, mat, -0.25, 0.28, 0, 1.15, 0.8, 0.5);
    box(g, 0.06, 0.7, 0.06, mat, -0.06, 0.6, 0, 0, 0, -0.1);
    box(g, 0.32, 0.12, 0.06, mat, 0.13, 0.9, 0, 0, 0, -0.5);
    box(g, 0.22, 0.1, 0.06, mat, 0.2, 0.74, 0, 0, 0, -0.35);
  },
  mic(g) {
    cyl(g, 0.3, 0.34, 0.05, MAT.iron(), 0, 0.025, 0, 0, 0, 0, 20);
    cyl(g, 0.02, 0.02, 0.62, MAT.chrome(), 0, 0.36, 0);
    cyl(g, 0.016, 0.016, 0.42, MAT.chrome(), 0.16, 0.8, 0, 0, 0, -1.0);
    cyl(g, 0.05, 0.06, 0.16, MAT.black(), 0.32, 0.9, 0, 0, 0, -1.0);
    ball(g, 0.09, M(0x9aa3ad, 0.5, 0.6), 0.4, 0.95, 0);
  },
  keys(g) {
    box(g, 1, 0.5, 1, MAT.black(), 0, 0.25, 0);
    const n = 12;
    for (let i = 0; i < n; i++) box(g, 1 / n - 0.008, 0.08, 0.6, MAT.white(), -0.5 + (i + 0.5) / n, 0.54, 0.15);
    for (let i = 0; i < n - 1; i++) if (i % 7 !== 2 && i % 7 !== 6) box(g, 1 / n * 0.55, 0.12, 0.34, MAT.black(), -0.5 + (i + 1) / n, 0.6, 0.0);
    box(g, 1, 0.04, 0.3, MAT.red(), 0, 0.52, -0.35);
  },
  amp(g) {
    box(g, 1, 0.94, 1, M(0x26221f, 0.9), 0, 0.47, 0);
    box(g, 0.9, 0.62, 0.02, MAT.grill(), 0, 0.36, 0.5);
    box(g, 0.9, 0.16, 0.02, MAT.chrome(), 0, 0.8, 0.5);
    for (let i = 0; i < 6; i++) cyl(g, 0.035, 0.035, 0.04, MAT.black(), -0.32 + i * 0.13, 0.8, 0.52, H, 0, 0, 10);
    ball(g, 0.03, MAT.neonPink(), 0.42, 0.8, 0.52);
    box(g, 0.32, 0.05, 0.14, MAT.black(), 0, 0.98, 0);
  },
  cymbal(g) {
    cyl(g, 0.28, 0.32, 0.04, MAT.iron(), 0, 0.02, 0, 0, 0, 0, 20);
    cyl(g, 0.02, 0.02, 0.86, MAT.chrome(), 0, 0.45, 0);
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.09, 32, 1, true), M(0xd9a83a, 0.35, 0.85, { side: THREE.DoubleSide }));
    add(g, c, 0, 0.92, 0, 0.12, 0, 0);
    cyl(g, 0.06, 0.06, 0.06, MAT.gold(), 0, 0.98, 0, 0.12, 0, 0, 12);
  },
  guitar(g) {
    const grp = new THREE.Group();
    grp.rotation.z = -0.22;
    grp.position.set(0.05, 0, 0);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.12, 24), M(0xb5321f, 0.35));
    add(grp, body, 0, 0.3, 0, H);
    body.scale.set(1, 1, 1.3);
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 24), M(0xb5321f, 0.35));
    add(grp, shoulder, 0, 0.58, 0, H);
    cyl(grp, 0.09, 0.09, 0.02, MAT.black(), 0, 0.36, 0.07, H);
    box(grp, 0.09, 0.62, 0.05, MAT.darkWood(), 0, 0.85, 0);
    box(grp, 0.14, 0.14, 0.05, MAT.black(), 0, 1.16, 0);
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) cyl(grp, 0.012, 0.012, 0.06, MAT.chrome(), s * 0.08, 1.12 + i * 0.035, 0, 0, 0, H, 6);
    grp.scale.set(0.85, 0.82, 1);
    g.add(grp);
    cyl(g, 0.02, 0.02, 0.5, MAT.iron(), -0.25, 0.25, -0.1, 0, 0, 0.5);
    cyl(g, 0.02, 0.02, 0.5, MAT.iron(), -0.25, 0.25, 0.1, 0, 0, 0.5);
  },
  // ---- kitchen ------------------------------------------------------------
  cheese(g) {
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, 0.5); shape.lineTo(0.5, 0.5); shape.lineTo(-0.5, -0.5); shape.closePath();
    const wedge = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelOffset: -0.03, bevelSegments: 2 }), MAT.cheese());
    add(g, wedge, 0, 0, 0, -H);
    for (const [x, y, z, r] of [[-0.3, 0.7, 0.55, 0.09], [0.0, 0.35, 0.53, 0.07], [-0.2, 0.25, 0.52, 0.11], [-0.42, 0.5, 0.05, 0.08]] as const) ball(g, r, M(0xc9961f, 0.7), x, y, z, 1, 1, 0.5);
  },
  mousetrap(g) {
    box(g, 1, 0.12, 1, MAT.paleWood(), 0, 0.06, 0);
    ring(g, 0.12, 0.03, M(0xb87333, 0.4, 0.8), -0.15, 0.2, 0, 0, H, 0);
    const bar = new THREE.Group();
    bar.position.set(-0.15, 0.2, 0);
    bar.rotation.z = -1.25;
    box(bar, 0.06, 0.7, 0.06, MAT.steel(), 0, 0.35, -0.42);
    box(bar, 0.06, 0.7, 0.06, MAT.steel(), 0, 0.35, 0.42);
    box(bar, 0.06, 0.06, 0.9, MAT.steel(), 0, 0.7, 0);
    g.add(bar);
    box(g, 0.24, 0.18, 0.24, MAT.cheese(), 0.28, 0.21, 0, 0, 0.4);
    box(g, 0.02, 0.5, 0.02, MAT.steel(), 0.42, 0.37, 0, 0, 0, -0.6);
  },
  can(g) {
    cyl(g, 0.44, 0.44, 0.9, MAT.cola(), 0, 0.5, 0, 0, 0, 0, 28);
    cyl(g, 0.42, 0.46, 0.06, MAT.chrome(), 0, 0.97, 0, 0, 0, 0, 28);
    cyl(g, 0.46, 0.4, 0.06, MAT.chrome(), 0, 0.03, 0, 0, 0, 0, 28);
    box(g, 0.14, 0.02, 0.32, MAT.chrome(), 0, 1.0, 0.06);
    box(g, 0.92, 0.18, 0.005, MAT.white(), 0, 0.55, 0.44, 0, 0, -0.2);
  },
  book(g) {
    for (const [y, h, w, d, col, a] of [[0, 0.5, 1, 0.86, 0x1f4e9a, 0.06], [0.5, 0.42, 0.9, 0.78, 0xa32626, -0.1]] as const) {
      const b = new THREE.Group();
      b.position.set(0, y, 0);
      b.rotation.y = a;
      box(b, w, h, d, M(col, 0.85), 0, h / 2, 0);
      box(b, w - 0.05, h - 0.1, d - 0.03, MAT.paper(), 0.03, h / 2, 0.02);
      box(b, 0.04, h, d, M(col, 0.85), -w / 2 + 0.02, h / 2, 0); // spine
      g.add(b);
    }
  },
  mug(g) {
    cyl(g, 0.36, 0.34, 0.9, M(0x2fb1a8, 0.4), 0, 0.45, 0, 0, 0, 0, 28);
    cyl(g, 0.3, 0.3, 0.02, M(0x3a1e0c, 0.6), 0, 0.88, 0, 0, 0, 0, 28);
    ring(g, 0.2, 0.05, M(0x2fb1a8, 0.4), 0.42, 0.5, 0, 0, 0, 0, Math.PI).rotation.z = -H;
  },
  fork(g) {
    box(g, 0.55, 0.06, 0.18, MAT.chrome(), -0.22, 0.06, 0, 0, 0, 0);
    box(g, 0.14, 0.06, 0.34, MAT.chrome(), 0.12, 0.06, 0);
    for (let i = 0; i < 4; i++) box(g, 0.3, 0.05, 0.05, MAT.chrome(), 0.35, 0.06, -0.13 + i * 0.087);
  },
  rat(g) {
    ball(g, 0.3, MAT.skin(), -0.08, 0.32, 0, 1.3, 0.95, 1);
    ball(g, 0.2, MAT.skin(), 0.32, 0.36, 0, 1.2, 0.9, 0.9);
    for (const z of [-0.12, 0.12]) cyl(g, 0.1, 0.1, 0.03, MAT.pink(), 0.28, 0.56, z, H, 0, 0, 14);
    for (const z of [-0.09, 0.09]) ball(g, 0.035, MAT.black(), 0.5, 0.42, z);
    ball(g, 0.05, MAT.pink(), 0.56, 0.32, 0);
    ring(g, 0.28, 0.02, MAT.pink(), -0.5, 0.2, 0, 0, 0, 0, Math.PI * 0.8).rotation.set(H, 0, -0.4);
    for (const z of [-0.14, 0.14]) { cyl(g, 0.04, 0.04, 0.1, MAT.pink(), -0.2, 0.05, z, 0, 0, 0, 8); cyl(g, 0.04, 0.04, 0.1, MAT.pink(), 0.22, 0.05, z, 0, 0, 0, 8); }
  },
  plate(g) {
    cyl(g, 0.34, 0.3, 0.05, MAT.white(), 0, 0.025, 0, 0, 0, 0, 32);
    cyl(g, 0.5, 0.36, 0.05, MAT.white(), 0, 0.075, 0, 0, 0, 0, 32);
    ring(g, 0.46, 0.012, MAT.blue(), 0, 0.105, 0, H);
  },
  // ---- zoo ----------------------------------------------------------------
  tree(g) {
    cyl(g, 0.06, 0.09, 0.5, MAT.trunk(), 0, 0.25, 0, 0, 0, 0, 10);
    ball(g, 0.3, MAT.leaf(), 0, 0.7, 0);
    ball(g, 0.24, MAT.leafDark(), -0.2, 0.62, 0.12);
    ball(g, 0.22, MAT.leaf(), 0.2, 0.66, -0.14);
    ball(g, 0.2, MAT.leafDark(), 0.05, 0.86, 0.05);
  },
  fence(g) {
    for (let i = 0; i < 5; i++) { box(g, 0.05, 0.94, 0.16, MAT.paleWood(), -0.5 + 0.02 + i * 0.24, 0.47, 0); cone(g, 0.04, 0.06, MAT.paleWood(), -0.5 + 0.02 + i * 0.24, 0.97, 0, 0, 0, 0, 4); }
    box(g, 1, 0.08, 0.06, MAT.paleWood(), 0, 0.72, 0.09);
    box(g, 1, 0.08, 0.06, MAT.paleWood(), 0, 0.32, 0.09);
  },
  giraffe(g) {
    for (const [x, z] of [[-0.2, -0.16], [0.2, -0.16], [-0.2, 0.16], [0.2, 0.16]]) cyl(g, 0.04, 0.045, 0.42, MAT.giraffe(), x, 0.21, z, 0, 0, 0, 8);
    box(g, 0.66, 0.2, 0.36, MAT.giraffe(), 0, 0.5, 0);
    cyl(g, 0.06, 0.09, 0.44, MAT.giraffe(), 0.34, 0.78, 0, 0, 0, -0.35, 10);
    box(g, 0.24, 0.1, 0.14, MAT.giraffe(), 0.5, 0.97, 0);
    for (const z of [-0.05, 0.05]) { cyl(g, 0.015, 0.015, 0.08, MAT.patch(), 0.44, 1.05, z, 0, 0, 0, 6); ball(g, 0.02, MAT.patch(), 0.44, 1.09, z); }
    for (const z of [-0.08, 0.08]) ball(g, 0.02, MAT.black(), 0.56, 1.0, z);
    for (let i = 0; i < 7; i++) box(g, 0.09, 0.07, 0.06, MAT.patch(), -0.26 + (i % 4) * 0.16, 0.52 + (i % 2) * 0.05, i < 4 ? 0.16 : -0.16);
    box(g, 0.2, 0.02, 0.02, MAT.patch(), -0.4, 0.5, 0, 0, 0, 0.5);
  },
  elephant(g) {
    ball(g, 0.34, MAT.elephant(), -0.05, 0.56, 0, 1.3, 0.95, 1);
    for (const [x, z] of [[-0.3, -0.18], [0.16, -0.18], [-0.3, 0.18], [0.16, 0.18]]) cyl(g, 0.08, 0.09, 0.36, MAT.elephant(), x, 0.18, z, 0, 0, 0, 10);
    ball(g, 0.22, MAT.elephant(), 0.38, 0.62, 0);
    for (const z of [-0.26, 0.26]) cyl(g, 0.16, 0.16, 0.03, MAT.elephant(), 0.34, 0.66, z, 0, 0.4 * Math.sign(z), 0, 16);
    cyl(g, 0.06, 0.05, 0.3, MAT.elephant(), 0.56, 0.44, 0, 0, 0, -0.6, 10);
    cyl(g, 0.05, 0.04, 0.3, MAT.elephant(), 0.62, 0.2, 0, 0, 0, 0.3, 10);
    for (const z of [-0.09, 0.09]) cone(g, 0.03, 0.22, MAT.bone(), 0.56, 0.5, z, 0, 0, -1.6);
    for (const z of [-0.1, 0.1]) ball(g, 0.025, MAT.black(), 0.56, 0.72, z);
    cyl(g, 0.02, 0.01, 0.3, MAT.elephant(), -0.55, 0.5, 0, 0, 0, 0.5, 6);
  },
  sign(g) {
    cyl(g, 0.035, 0.04, 0.6, MAT.paleWood(), 0, 0.3, 0, 0, 0, 0, 8);
    box(g, 1, 0.42, 0.08, MAT.paleWood(), 0, 0.75, 0);
    box(g, 0.9, 0.32, 0.01, MAT.paper(), 0, 0.75, 0.045);
    box(g, 0.7, 0.05, 0.005, MAT.black(), 0, 0.8, 0.052);
    box(g, 0.5, 0.05, 0.005, MAT.black(), 0, 0.7, 0.052);
    cone(g, 0.1, 0.2, MAT.red(), 0.4, 0.72, 0.06, 0, 0, -H, 3);
  },
  bush(g) {
    ball(g, 0.34, MAT.leaf(), -0.1, 0.36, 0, 1, 0.9, 1);
    ball(g, 0.28, MAT.leafDark(), 0.22, 0.3, 0.1, 1, 0.9, 1);
    ball(g, 0.24, MAT.leaf(), 0.05, 0.3, -0.24, 1, 0.9, 1);
    ball(g, 0.2, MAT.leafDark(), -0.05, 0.6, 0.05);
  },
  cage(g) {
    box(g, 1, 0.08, 1, MAT.iron(), 0, 0.04, 0);
    const bars = 6;
    for (let i = 0; i < bars; i++) {
      const t = -0.46 + (i / (bars - 1)) * 0.92;
      for (const [x, z] of [[t, -0.46], [t, 0.46], [-0.46, t], [0.46, t]]) cyl(g, 0.02, 0.02, 0.86, MAT.steel(), x, 0.5, z, 0, 0, 0, 6);
    }
    box(g, 1, 0.06, 0.06, MAT.iron(), 0, 0.94, 0.46); box(g, 1, 0.06, 0.06, MAT.iron(), 0, 0.94, -0.46);
    box(g, 0.06, 0.06, 1, MAT.iron(), 0.46, 0.94, 0); box(g, 0.06, 0.06, 1, MAT.iron(), -0.46, 0.94, 0);
    box(g, 1, 0.04, 1, MAT.iron(), 0, 0.98, 0);
  },
  flamingo(g) {
    for (const z of [-0.06, 0.06]) cyl(g, 0.012, 0.012, 0.5, MAT.pink(), 0.02, 0.25, z, 0, 0, 0, 6);
    ball(g, 0.16, MAT.pink(), 0, 0.58, 0, 1.4, 0.9, 1);
    cyl(g, 0.035, 0.05, 0.3, MAT.pink(), 0.22, 0.78, 0, 0, 0, -0.5, 8);
    cyl(g, 0.03, 0.035, 0.16, MAT.pink(), 0.3, 0.94, 0, 0, 0, 0.35, 8);
    ball(g, 0.055, MAT.pink(), 0.28, 1.0, 0);
    cone(g, 0.03, 0.14, MAT.black(), 0.35, 0.97, 0, 0, 0, -H - 0.6, 8);
    ball(g, 0.012, MAT.black(), 0.3, 1.02, 0.045);
    box(g, 0.2, 0.03, 0.12, MAT.pink(), -0.18, 0.62, 0, 0, 0, 0.4);
  },
};

/** Build a prop model in the unit box; null for an unknown kind. */
export function buildProp(kind: string): THREE.Group | null {
  const b = BUILDERS[kind as PropKind];
  if (!b) return null;
  const g = new THREE.Group();
  b(g);
  return g;
}

export const isPropKind = (k: string): k is PropKind => k in BUILDERS;
