// Visual arena. The geometry mirrors exactly the physics SDF (src/physics/Arena.js):
// rounded rectangle plan, curved floor/wall and wall/ceiling transitions, goal openings.
import * as THREE from 'three';
import { ARENA, UU_TO_M as S } from '../physics/constants.js';
import { makeFieldTexture, makeWallTexture, makeNetTexture } from './textures.js';

const { HALF_W: W, HALF_L: L, HEIGHT: H, CORNER_R: RC, FILLET_R: RF, GOAL_HALF_W: GW, GOAL_H: GH, GOAL_DEPTH: GD } = ARENA;
export const BLUE = new THREE.Color(0.12, 0.42, 1.0);
export const ORANGE = new THREE.Color(1.0, 0.45, 0.08);

function linspace(a, b, step, breaks = []) {
  const pts = [a];
  const dir = Math.sign(b - a);
  const inner = breaks.filter((x) => (x - a) * dir > 1 && (b - x) * dir > 1).sort((x, y) => (x - y) * dir);
  const stops = [...inner, b];
  let cur = a;
  for (const s of stops) {
    const n = Math.max(1, Math.ceil(Math.abs(s - cur) / step));
    for (let i = 1; i <= n; i++) pts.push(cur + ((s - cur) * i) / n);
    cur = s;
  }
  return pts;
}

/** Perimeter of the flat floor (arena inset by the fillet radius). */
export function floorPerimeter() {
  const a = W - RF, b = L - RF, rc = RC - RF, a2 = a - rc, b2 = b - rc;
  const pts = [];
  const push = (x, z, nx, nz, end = 0) => pts.push({ x, z, nx, nz, end });
  const arc = (cx, cz, t0, t1) => {
    const n = 14;
    for (let i = 1; i < n; i++) {
      const t = t0 + ((t1 - t0) * i) / n;
      push(cx + rc * Math.cos(t), cz - rc * Math.sin(t), Math.cos(t), -Math.sin(t));
    }
  };
  for (const z of linspace(b2, -b2, 600).slice(0, -1)) push(a, z, 1, 0);
  push(a, -b2, 1, 0);
  arc(a2, -b2, 0, Math.PI / 2);
  for (const x of linspace(a2, -a2, 300, [GW, -GW])) push(x, -b, 0, -1, -1);
  arc(-a2, -b2, Math.PI / 2, Math.PI);
  for (const z of linspace(-b2, b2, 600)) push(-a, z, -1, 0);
  arc(-a2, b2, Math.PI, Math.PI * 1.5);
  for (const x of linspace(-a2, a2, 300, [GW, -GW])) push(x, b, 0, 1, 1);
  arc(a2, b2, Math.PI * 1.5, Math.PI * 2);
  return pts;
}

function profile() {
  // (o = outward offset, h = height) along the wall cross-section
  const p = [];
  const n = 10;
  for (let i = 0; i <= n; i++) { const t = (i / n) * Math.PI / 2; p.push({ o: RF * Math.sin(t), h: RF * (1 - Math.cos(t)), part: 0 }); }
  for (const h of linspace(RF, H - RF, 300, [GH]).slice(1)) p.push({ o: RF, h, part: 1 });
  for (let i = 1; i <= n; i++) { const t = (i / n) * Math.PI / 2; p.push({ o: RF * Math.cos(t), h: H - RF + RF * Math.sin(t), part: 2 }); }
  return p;
}

function teamColor(z, out) {
  const t = THREE.MathUtils.smoothstep(z, -1800, 1800);
  return out.copy(BLUE).lerp(ORANGE, t);
}

function sweepGeometry(per, prof, j0, j1, { colors = true } = {}) {
  const pos = [], uv = [], col = [], idx = [];
  const n = per.length, c = new THREE.Color();
  let sAcc = 0;
  const sArr = [0];
  for (let i = 1; i <= n; i++) {
    const p0 = per[i - 1], p1 = per[i % n];
    sAcc += Math.hypot(p1.x - p0.x, p1.z - p0.z);
    sArr.push(sAcc);
  }
  const vArr = [0];
  for (let j = 1; j < prof.length; j++) vArr.push(vArr[j - 1] + Math.hypot(prof[j].o - prof[j - 1].o, prof[j].h - prof[j - 1].h));
  const rows = j1 - j0 + 1;
  for (let i = 0; i <= n; i++) {
    const p = per[i % n];
    for (let j = j0; j <= j1; j++) {
      const q = prof[j];
      const x = p.x + p.nx * q.o, y = q.h, z = p.z + p.nz * q.o;
      pos.push(x * S, y * S, z * S);
      uv.push(sArr[i] / 512, vArr[j] / 512);
      if (colors) { teamColor(z, c); col.push(c.r, c.g, c.b); }
    }
  }
  for (let i = 0; i < n; i++) {
    const pa = per[i], pb = per[(i + 1) % n];
    const inMouth = pa.end !== 0 && pa.end === pb.end && Math.abs(pa.x) <= GW + 1 && Math.abs(pb.x) <= GW + 1;
    for (let j = j0; j < j1; j++) {
      if (inMouth && prof[j + 1].h <= GH + 1) continue; // goal opening
      const a = i * rows + (j - j0), b = (i + 1) * rows + (j - j0);
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

function capGeometry(per, y, fieldUV) {
  const pos = [0, y * S, 0], uv = [0.5, 0.5], idx = [];
  for (const p of per) {
    pos.push(p.x * S, y * S, p.z * S);
    uv.push((p.x + W) / (2 * W), 1 - (p.z + L) / (2 * L));
  }
  const n = per.length;
  for (let i = 0; i < n; i++) idx.push(0, 1 + i, 1 + ((i + 1) % n));
  // make sure the triangles face up
  const ax = pos[3] - pos[0], az = pos[5] - pos[2], bx = pos[6] - pos[0], bz = pos[8] - pos[2];
  const ny = az * bx - ax * bz;
  if (ny < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (fieldUV) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const nrm = [];
  for (let i = 0; i < pos.length / 3; i++) nrm.push(0, 1, 0);
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
    const per = floorPerimeter();
    const prof = profile();
    const jWallStart = prof.findIndex((p) => p.part === 1) - 1;
    const jWallEnd = prof.findIndex((p) => p.part === 2) - 1;

    // ---- floor
    const fieldTex = makeFieldTexture(maxAniso);
    const floorMat = new THREE.MeshStandardMaterial({ map: fieldTex, roughness: 0.92, metalness: 0.0, side: THREE.DoubleSide });
    const floor = new THREE.Mesh(capGeometry(per, 0, true), floorMat);
    floor.receiveShadow = true;
    this.group.add(floor);

    // ---- curved floor/wall transitions (opaque, turf-like)
    const rampMat = new THREE.MeshStandardMaterial({ color: 0x2a4a3a, roughness: 0.8, metalness: 0.1, vertexColors: false, side: THREE.DoubleSide });
    const ramp = new THREE.Mesh(sweepGeometry(per, prof, 0, jWallStart, { colors: false }), rampMat);
    ramp.receiveShadow = true;
    this.group.add(ramp);
    // glowing team line along the base of the walls
    const rampGlow = new THREE.Mesh(sweepGeometry(per, prof, 0, jWallStart),
      new THREE.MeshBasicMaterial({ map: makeWallTexture(), vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    this.group.add(rampGlow);

    // ---- walls (translucent glass + glowing panels)
    const wallGeo = sweepGeometry(per, prof, jWallStart, prof.length - 1);
    const wallTex = makeWallTexture();
    const glass = new THREE.Mesh(wallGeo, new THREE.MeshBasicMaterial({ color: 0x0a1630, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
    const panels = new THREE.Mesh(wallGeo, new THREE.MeshBasicMaterial({ map: wallTex, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    glass.renderOrder = 2; panels.renderOrder = 3;
    this.group.add(glass, panels);

    // ---- ceiling
    const ceilTex = makeWallTexture();
    ceilTex.repeat.set(16, 20);
    const ceiling = new THREE.Mesh(capGeometry(per, H, true), new THREE.MeshBasicMaterial({ map: ceilTex, color: 0x6688ff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    ceiling.renderOrder = 3;
    this.group.add(ceiling);

    // ---- goals
    this.goals = [];
    for (const side of [-1, 1]) this.goals.push(this.buildGoal(side, prof, floorMat, rampMat));
  }

  buildGoal(side, prof, floorMat, rampMat) {
    const g = new THREE.Group();
    const color = side < 0 ? BLUE : ORANGE;
    const b = L - RF, z1 = side * (L + GD), zL = side * L;
    // floor patch in the goal mouth (where the curved transition is removed) + goal floor
    const mouth = new THREE.Mesh(quad(-GW, 0, side * b, GW, 0, side * b, GW, 0, zL, -GW, 0, zL), floorMat);
    // field UVs for the patch
    const uvs = [];
    for (const [x, z] of [[-GW, side * b], [GW, side * b], [GW, zL], [-GW, zL]]) uvs.push((x + W) / (2 * W), 1 - (z + L) / (2 * L));
    mouth.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    mouth.geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    mouth.receiveShadow = true;
    const goalFloorMat = new THREE.MeshStandardMaterial({ color: 0x1d2a24, roughness: 0.9, side: THREE.DoubleSide });
    const gfloor = new THREE.Mesh(quad(-GW, 0.5, zL, GW, 0.5, zL, GW, 0.5, z1, -GW, 0.5, z1), goalFloorMat);
    gfloor.geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    gfloor.receiveShadow = true;
    g.add(mouth, gfloor);

    // wedges closing the curved transition beside the mouth
    for (const sx of [-1, 1]) {
      const pts = [0, 0, zL];
      const bot = prof.filter((p) => p.part === 0);
      for (const p of bot) pts.push(sx * GW, p.h, side * (b + p.o));
      pts[0] = sx * GW;
      const pos = [], idx = [];
      for (let i = 0; i < pts.length; i += 3) pos.push(pts[i] * S, pts[i + 1] * S, pts[i + 2] * S);
      for (let i = 1; i < pos.length / 3 - 1; i++) idx.push(0, i, i + 1);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      g.add(new THREE.Mesh(geo, rampMat));
    }

    // net (back, sides, roof)
    const netTex = makeNetTexture();
    const netMat = new THREE.MeshBasicMaterial({ map: netTex, color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const backGlow = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(0.25), transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
    const nScale = (a, bb) => [a / 60, bb / 60];
    const back = quad(-GW, 0, z1, GW, 0, z1, GW, GH, z1, -GW, GH, z1, nScale(2 * GW, GH));
    g.add(new THREE.Mesh(back, netMat), new THREE.Mesh(back, backGlow));
    for (const sx of [-1, 1]) g.add(new THREE.Mesh(quad(sx * GW, 0, zL, sx * GW, 0, z1, sx * GW, GH, z1, sx * GW, GH, zL, nScale(GD, GH)), netMat));
    g.add(new THREE.Mesh(quad(-GW, GH, zL, GW, GH, zL, GW, GH, z1, -GW, GH, z1, nScale(2 * GW, GD)), netMat));

    // glowing frame
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 2.2, roughness: 0.3, metalness: 0.6 });
    const t = 26;
    const post = new THREE.BoxGeometry(t * S, GH * S, t * S);
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(post, frameMat);
      m.position.set(sx * (GW + t / 2) * S, (GH / 2) * S, zL * S);
      g.add(m);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry((2 * GW + 2 * t) * S, t * S, t * S), frameMat);
    bar.position.set(0, (GH + t / 2) * S, zL * S);
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
