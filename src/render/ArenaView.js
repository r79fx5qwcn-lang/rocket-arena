// Visual arena. The geometry follows exactly the physics SDF (src/physics/Arena.js):
// rounded rectangle plan + goal notches with rounded posts, curved floor/wall transition
// (radius varying near the goals), walls, curved wall/ceiling transition, ceiling.
import * as THREE from 'three';
import { ARENA, UU_TO_M as S } from '../physics/constants.js';
import { floorFilletRadius } from '../physics/Arena.js';
import { makeFieldTexture, makeWallTexture, makeNetTexture } from './textures.js';

const { HALF_W: W, HALF_L: L, HEIGHT: H, CORNER_R: RC, FILLET_R: RF, GOAL_HALF_W: GW, GOAL_H: GH, GOAL_DEPTH: GD } = ARENA;
const RCG = ARENA.GOAL_CORNER_R;
const RP = 220; // visual plan radius of the posts (matches the SDF smooth union)
export const BLUE = new THREE.Color(0.12, 0.42, 1.0);
export const ORANGE = new THREE.Color(1.0, 0.45, 0.08);

// ------------------------------------------------------------------ plan paths
function line(out, x0, z0, x1, z1, nx, nz, step = 150) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / step));
  for (let i = 1; i <= n; i++) out.push({ x: x0 + ((x1 - x0) * i) / n, z: z0 + ((z1 - z0) * i) / n, nx, nz });
}
function arc(out, cx, cz, r, a0, a1, reflex, step = 0.12) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step));
  for (let i = 1; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const c = Math.cos(a), s = Math.sin(a);
    out.push({ x: cx + r * c, z: cz + r * s, nx: reflex ? -c : c, nz: reflex ? -s : s });
  }
}

/** Boundary of the floor plan (walls + goal notches). Normals point into the walls. */
export function boundaryPath() {
  const h = [{ x: W, z: 0, nx: 1, nz: 0 }];
  const Lg = L + GD;
  line(h, W, 0, W, -(L - RC), 1, 0, 400);
  arc(h, W - RC, -(L - RC), RC, 0, -Math.PI / 2, false);
  line(h, W - RC, -L, GW + RP, -L, 0, -1, 120);
  arc(h, GW + RP, -L - RP, RP, Math.PI / 2, Math.PI, true);
  line(h, GW, -L - RP, GW, -Lg + RCG, 1, 0, 120);
  arc(h, GW - RCG, -Lg + RCG, RCG, 0, -Math.PI / 2, false);
  line(h, GW - RCG, -Lg, -(GW - RCG), -Lg, 0, -1, 150);
  arc(h, -(GW - RCG), -Lg + RCG, RCG, -Math.PI / 2, -Math.PI, false);
  line(h, -GW, -Lg + RCG, -GW, -L - RP, -1, 0, 120);
  arc(h, -GW - RP, -L - RP, RP, 0, Math.PI / 2, true);
  line(h, -GW - RP, -L, -(W - RC), -L, 0, -1, 120);
  arc(h, -(W - RC), -(L - RC), RC, -Math.PI / 2, -Math.PI, false);
  line(h, -W, -(L - RC), -W, 0, -1, 0, 400);
  // point symmetry gives the orange half
  const full = h.slice();
  for (let i = 1; i < h.length - 1; i++) { const p = h[i]; full.push({ x: -p.x, z: -p.z, nx: -p.nx, nz: -p.nz }); }
  return full;
}

/** Plain arena perimeter (no goals), used above the crossbar. */
function arenaPath() {
  const p = [];
  line(p, W, L - RC, W, -(L - RC), 1, 0, 400);
  arc(p, W - RC, -(L - RC), RC, 0, -Math.PI / 2, false);
  line(p, W - RC, -L, -(W - RC), -L, 0, -1, 300);
  arc(p, -(W - RC), -(L - RC), RC, -Math.PI / 2, -Math.PI, false);
  line(p, -W, -(L - RC), -W, L - RC, -1, 0, 400);
  arc(p, -(W - RC), L - RC, RC, Math.PI, Math.PI / 2, false);
  line(p, -(W - RC), L, W - RC, L, 0, 1, 300);
  arc(p, W - RC, L - RC, RC, Math.PI / 2, 0, false);
  return p;
}

function teamColor(z, out) {
  const t = THREE.MathUtils.smoothstep(z, -1800, 1800);
  return out.copy(BLUE).lerp(ORANGE, t);
}

/**
 * Generic sweep: for every path point and every profile index j, profile(p, j) returns
 * {o, h}: offset along the wall normal (from the wall plane) and height.
 */
function sweep(path, rows, profile, { colors = true, closed = true } = {}) {
  const pos = [], uv = [], col = [], idx = [];
  const c = new THREE.Color();
  const n = path.length;
  const cols = closed ? n + 1 : n;
  let sAcc = 0;
  for (let i = 0; i < cols; i++) {
    const p = path[i % n];
    if (i > 0) { const q = path[(i - 1) % n]; sAcc += Math.hypot(p.x - q.x, p.z - q.z); }
    let vAcc = 0, prev = null;
    for (let j = 0; j < rows; j++) {
      const { o, h } = profile(p, j);
      const x = p.x + p.nx * o, z = p.z + p.nz * o;
      if (prev) vAcc += Math.hypot(o - prev.o, h - prev.h);
      prev = { o, h };
      pos.push(x * S, h * S, z * S);
      uv.push(sAcc / 512, vAcc / 512);
      if (colors) { teamColor(z, c); col.push(c.r, c.g, c.b); }
    }
  }
  for (let i = 0; i < cols - 1; i++) {
    for (let j = 0; j < rows - 1; j++) {
      const a = i * rows + j, b = (i + 1) * rows + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const ARC_N = 10, WALL_N = 3;
// lower part: floor/wall transition (radius varies with |x|) then wall up to the crossbar
const rampProfile = (p, j) => {
  const r = floorFilletRadius(Math.abs(p.x));
  const t = (j / ARC_N) * Math.PI / 2;
  return { o: -r + r * Math.sin(t), h: r * (1 - Math.cos(t)) };
};
const lowerWallProfile = (p, j) => {
  const r = floorFilletRadius(Math.abs(p.x));
  return { o: 0, h: r + ((GH - r) * j) / WALL_N };
};
// upper part (above the crossbar): wall then curved transition to the ceiling
const UPPER_WALL_N = 4;
const upperProfile = (p, j) => {
  if (j <= UPPER_WALL_N) return { o: 0, h: GH + ((H - RF - GH) * j) / UPPER_WALL_N };
  const t = ((j - UPPER_WALL_N) / ARC_N) * Math.PI / 2;
  return { o: -RF + RF * Math.cos(t), h: H - RF + RF * Math.sin(t) };
};

function floorGeometry(path, inset) {
  // floor polygon = boundary pushed inward by the transition radius
  const pts = [];
  for (const p of path) {
    const r = inset(p);
    const v = new THREE.Vector2(p.x - p.nx * r, p.z - p.nz * r);
    if (!pts.length || pts[pts.length - 1].distanceTo(v) > 1) pts.push(v);
  }
  if (pts[0].distanceTo(pts[pts.length - 1]) < 1) pts.pop();
  const tris = THREE.ShapeUtils.triangulateShape(pts, []);
  const pos = [], uv = [], nrm = [], idx = [];
  for (const v of pts) {
    pos.push(v.x * S, 0, v.y * S);
    uv.push(THREE.MathUtils.clamp((v.x + W) / (2 * W), 0, 1), THREE.MathUtils.clamp(1 - (v.y + L) / (2 * L), 0, 1));
    nrm.push(0, 1, 0);
  }
  for (const t of tris) idx.push(t[0], t[1], t[2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

function quad(x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3, uvScale = [1, 1]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3].map((v) => v * S), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, uvScale[0], 0, uvScale[0], uvScale[1], 0, uvScale[1]], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
}

export class ArenaView {
  constructor(scene, renderer) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const path = boundaryPath();
    const upperPath = arenaPath();

    // ---- floor (field + goal floors)
    const fieldTex = makeFieldTexture(maxAniso);
    const floorMat = new THREE.MeshStandardMaterial({ map: fieldTex, roughness: 0.92, metalness: 0.0, side: THREE.DoubleSide });
    const floor = new THREE.Mesh(floorGeometry(path, (p) => floorFilletRadius(Math.abs(p.x))), floorMat);
    floor.receiveShadow = true;
    this.group.add(floor);

    // ---- curved floor/wall transitions (opaque, turf-like) + glowing team line
    const rampGeoPlain = sweep(path, ARC_N + 1, rampProfile, { colors: false });
    const rampMat = new THREE.MeshStandardMaterial({ color: 0x2a4a3a, roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide });
    const ramp = new THREE.Mesh(rampGeoPlain, rampMat);
    ramp.receiveShadow = true;
    this.group.add(ramp);
    const rampGlow = new THREE.Mesh(sweep(path, ARC_N + 1, rampProfile),
      new THREE.MeshBasicMaterial({ map: makeWallTexture(), vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    this.group.add(rampGlow);

    // ---- walls (translucent glass + glowing panels)
    const wallTex = makeWallTexture();
    const glassMat = new THREE.MeshBasicMaterial({ color: 0x0a1630, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
    const panelMat = new THREE.MeshBasicMaterial({ map: wallTex, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    for (const geo of [sweep(path, WALL_N + 1, lowerWallProfile), sweep(upperPath, UPPER_WALL_N + ARC_N + 1, upperProfile)]) {
      const glass = new THREE.Mesh(geo, glassMat);
      const panels = new THREE.Mesh(geo, panelMat);
      glass.renderOrder = 2; panels.renderOrder = 3;
      this.group.add(glass, panels);
    }

    // ---- ceiling
    const ceilTex = makeWallTexture();
    ceilTex.repeat.set(16, 20);
    const ceilGeo = floorGeometry(upperPath, () => RF);
    ceilGeo.translate(0, H * S, 0);
    const ceiling = new THREE.Mesh(ceilGeo, new THREE.MeshBasicMaterial({ map: ceilTex, color: 0x6688ff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    ceiling.renderOrder = 3;
    this.group.add(ceiling);

    // ---- goals
    this.goals = [];
    for (const side of [-1, 1]) this.goals.push(this.buildGoal(side));
  }

  buildGoal(side) {
    const g = new THREE.Group();
    const color = side < 0 ? BLUE : ORANGE;
    const z1 = side * (L + GD), zL = side * L;
    const rg = ARENA.GOAL_FLOOR_R;

    // nets (back, sides, roof) drawn slightly inside the solid surfaces
    const netTex = makeNetTexture();
    const netMat = new THREE.MeshBasicMaterial({ map: netTex, color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const backGlow = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(0.25), transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
    const nScale = (a, bb) => [a / 60, bb / 60];
    const back = quad(-GW + RCG, rg, z1, GW - RCG, rg, z1, GW - RCG, GH, z1, -GW + RCG, GH, z1, nScale(2 * GW, GH));
    g.add(new THREE.Mesh(back, netMat), new THREE.Mesh(back, backGlow));
    for (const sx of [-1, 1]) {
      g.add(new THREE.Mesh(quad(sx * GW, rg, zL + side * RP, sx * GW, rg, z1 - side * RCG, sx * GW, GH, z1 - side * RCG, sx * GW, GH, zL + side * RP, nScale(GD, GH)), netMat));
    }
    g.add(new THREE.Mesh(quad(-GW, GH, zL, GW, GH, zL, GW, GH, z1, -GW, GH, z1, nScale(2 * GW, GD)), netMat));

    // glowing frame: rounded posts + crossbar
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 2.2, roughness: 0.3, metalness: 0.6 });
    const postR = 22;
    const px = GW + RP * (1 - Math.SQRT1_2), pz = L + RP * (1 - Math.SQRT1_2);
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(postR * S, postR * S, GH * S, 16), frameMat);
      m.position.set(sx * px * S, (GH / 2) * S, side * pz * S);
      g.add(m);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(postR * S, postR * S, 2 * px * S, 16), frameMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, (GH + postR * 0.5) * S, side * (L + postR * 0.5) * S);
    g.add(bar);
    // goal line
    const line = new THREE.Mesh(new THREE.PlaneGeometry(2 * GW * S, 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    line.rotation.x = -Math.PI / 2; line.position.set(0, 0.012, zL * S);
    g.add(line);
    // goal light
    const light = new THREE.PointLight(color, 0, 30, 2);
    light.position.set(0, GH * S * 0.6, (zL + side * GD * 0.5) * S);
    g.add(light);
    this.group.add(g);
    return { group: g, light, frameMat, color, side };
  }

  flashGoal(side) {
    const goal = this.goals.find((gg) => gg.side === side);
    if (goal) goal.flash = 1;
  }

  update(dt) {
    for (const g of this.goals) {
      if (g.flash > 0) {
        g.flash = Math.max(0, g.flash - dt * 0.5);
        g.light.intensity = g.flash * 400;
        g.frameMat.emissiveIntensity = 2.2 + g.flash * 6 * (0.6 + 0.4 * Math.sin(performance.now() * 0.03));
      }
    }
  }
}
