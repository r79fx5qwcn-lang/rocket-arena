// Car models. The cars use the 3D models supplied by the player (public/models/<car>/,
// converted from FBX) painted with their owner's colours. Until a model has loaded (or if
// its files are missing), a procedural car from carDesigns.js is shown instead.
// Local axes: +X forward, +Y up, +Z right. Model data is in uu, converted with S.
import * as THREE from 'three';
import { UU_TO_M as S, getPreset, CAR_MODELS } from '../physics/constants.js';
import { buildDesign, buildWheel } from './carDesigns.js';

// ---------------------------------------------------------------- model files
export const MODELS_BASE = ((typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/') + 'models/';
const REST_Y = -16.72; // the model's ground is this far below the centre of mass at rest
// offX: model space -> centre-of-mass space along the car (aligns the axles with the physics wheels)
// mats: model material name -> role
const MODEL_DEFS = {
  Fennec: {
    offX: 5.96,
    mats: { 'Fennec - Body': 'paint', Paint: 'trim', 'Fennec Chassis': 'chassis', Window: 'glass', Headlights: 'lights', 'Alpha Rim': 'rim', 'Dieci Tread': 'tread' },
    tex: { chassis: 'chassis.jpg', chassisN: 'chassis_n.jpg', rim: 'rim_mask.jpg', rimN: 'rim_n.jpg' },
  },
  Octane: {
    offX: 6.645,
    mats: { 'Octane Body': 'paintMask', Paint: 'trim', 'Octane Chassis': 'chassis', Window: 'glass', Headlights: 'lights', 'Dieci Rim': 'rim', 'Dieci Tread': 'tread' },
    tex: { chassis: 'chassis.jpg', bodyMask: 'body_mask.jpg' },
  },
  Dominus: {
    offX: 9.105,
    mats: { 'Dominus Body': 'paint', Paint: 'trim', 'Dominus Chassis': 'chassis', Window: 'glass', Headlights: 'lights', Cristiano: 'rim', Tread: 'tread' },
    tex: { chassis: 'chassis.jpg' },
  },
};
export const CAR_LABELS = {
  Octane: { label: 'Octane', tagline: 'Polyvalente · hitbox Octane' },
  Dominus: { label: 'Dominus', tagline: 'Longue et plate · hitbox Dominus' },
  Fennec: { label: 'Fennec', tagline: 'Carrée · hitbox Octane' },
};

const loaded = {}; // style -> { geos, layout, tex }
let shared = null, preloadPromise = null;
const readyCbs = new Set();

export function isCarModelReady(style) { return !!loaded[getPreset(style).name]; }
/** cb(style) is called each time a car model finishes loading */
export function onCarModelReady(cb) { readyCbs.add(cb); return () => readyCbs.delete(cb); }

const TYPED = { float32: Float32Array, int8: Int8Array, uint16: Uint16Array, uint32: Uint32Array };
/** loads <dir>/<name>.json + .bin and returns { layout, geos: {partName: BufferGeometry} } */
export async function loadModelData(dir, name) {
  const [layout, bin] = await Promise.all([
    fetch(MODELS_BASE + dir + '/' + name + '.json').then((r) => { if (!r.ok) throw new Error(name + '.json ' + r.status); return r.json(); }),
    fetch(MODELS_BASE + dir + '/' + name + '.bin').then((r) => { if (!r.ok) throw new Error(name + '.bin ' + r.status); return r.arrayBuffer(); }),
  ]);
  const arr = (a) => new TYPED[a.t](bin, a.o, a.n);
  const geos = {};
  for (const p of layout.parts) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr(p.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(arr(p.nrm), 3, true));
    g.setAttribute('uv', new THREE.BufferAttribute(arr(p.uv), 2));
    g.setIndex(new THREE.BufferAttribute(arr(p.idx), 1));
    g.computeBoundingSphere();
    geos[p.name] = g;
  }
  return { layout, geos };
}

let texLoader = null;
export function loadTex(path, srgb = false) {
  if (!texLoader) texLoader = new THREE.TextureLoader();
  const t = texLoader.load(MODELS_BASE + path);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function preloadCarModel() {
  if (preloadPromise || typeof fetch === 'undefined') return preloadPromise;
  shared = { tread: loadTex('shared/tread.jpg', true), treadN: loadTex('shared/tread_n.png'), shadow: loadTex('shared/car_shadow.png') };
  preloadPromise = Promise.all(Object.entries(MODEL_DEFS).map(async ([style, def]) => {
    try {
      const dir = style.toLowerCase();
      const data = await loadModelData(dir, dir);
      const tex = {};
      for (const [k, f] of Object.entries(def.tex)) tex[k] = loadTex(dir + '/' + f, k === 'chassis' || k === 'rim');
      loaded[style] = { ...data, tex };
      for (const cb of [...readyCbs]) { try { cb(style); } catch (e) { console.error(e); } }
    } catch (e) { console.warn(`Modèle ${style} indisponible, voiture procédurale utilisée :`, e.message); }
  }));
  return preloadPromise;
}
export function carShadowTexture() { return shared && shared.shadow; }

export const PAINTS = {
  body: [
    { name: 'Bleu Électrique', hex: '#1f6bff' }, { name: 'Orange Fusion', hex: '#ff7a1a' },
    { name: 'Rouge Racing', hex: '#e0202e' }, { name: 'Vert Toxique', hex: '#3ddc3d' },
    { name: 'Violet Néon', hex: '#8a3cff' }, { name: 'Noir Carbone', hex: '#1b1d22' },
    { name: 'Blanc Titane', hex: '#e9edf2' }, { name: 'Jaune Solaire', hex: '#ffd21a' },
    { name: 'Rose Cyber', hex: '#ff3fa6' }, { name: 'Cyan Glacier', hex: '#22d3ee' },
    { name: 'Vert Forêt', hex: '#1f6b3a' }, { name: 'Bordeaux', hex: '#7a1426' },
  ],
  accent: ['#111318', '#ffffff', '#ffd21a', '#22d3ee', '#ff3fa6', '#e0202e', '#3ddc3d', '#8a3cff'],
  wheels: ['#c8ccd4', '#1b1d22', '#ffd21a', '#ff7a1a', '#1f6bff', '#e0202e', '#3ddc3d'],
  boost: ['#ff9a2a', '#3ab0ff', '#b44dff', '#3dff8a', '#ff3355', '#ffffff', '#ffe23d'],
  styles: CAR_MODELS,
};

const geoCache = new Map();
function toGeometry(m) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.p.map((v) => v * S), 3));
  g.setIndex(m.i);
  g.computeVertexNormals();
  return g;
}

function buildMaterials(opts) {
  const paint = new THREE.Color(opts.body || '#1f6bff');
  const accent = new THREE.Color(opts.accent || '#111318');
  const wheelCol = new THREE.Color(opts.wheels || '#c8ccd4');
  const boostCol = new THREE.Color(opts.boost || '#ff9a2a');
  return {
    body: new THREE.MeshPhysicalMaterial({ color: paint, metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 }),
    accent: new THREE.MeshPhysicalMaterial({ color: accent, metalness: 0.35, roughness: 0.4, clearcoat: 0.6 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0a0e16, metalness: 0.1, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x17191e, metalness: 0.3, roughness: 0.75 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xd9dde6, metalness: 1, roughness: 0.18 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 }),
    rim: new THREE.MeshStandardMaterial({ color: wheelCol, metalness: 0.9, roughness: 0.22 }),
    head: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8efff, emissiveIntensity: 2.2 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1426, emissiveIntensity: 1.8 }),
    flame: new THREE.MeshBasicMaterial({ color: boostCol, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    flameCore: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
}

function cachedDesign(style) {
  if (!geoCache.has(style)) {
    const preset = getPreset(style);
    const d = buildDesign({ Octane: 'Vortex', Dominus: 'Sabre', Fennec: 'Bulldog' }[style] || 'Vortex', preset.WHEELS);
    // merge parts per material: few draw calls per car
    const byMat = new Map();
    for (const p of d.parts) {
      if (!byMat.has(p.mat)) byMat.set(p.mat, []);
      byMat.get(p.mat).push(p.mesh);
    }
    const chassis = [];
    for (const [mat, list] of byMat) {
      const merged = { p: [], i: [] };
      for (const m of list) { const base = merged.p.length / 3; merged.p.push(...m.p); for (const k of m.i) merged.i.push(k + base); }
      chassis.push({ mat, geo: toGeometry(merged) });
    }
    const wheels = preset.WHEELS.map((wd) => {
      const wv = wd.front ? d.wheel.front : d.wheel.back;
      const side = Math.sign(wd.z);
      return { wv, side, parts: buildWheel(wv, side).map((p) => ({ mat: p.mat, geo: toGeometry(p.mesh) })) };
    });
    const rearX = Math.min(...d.parts.filter((p) => p.mat === 'body').map((p) => Math.min(...p.mesh.p.filter((_, k) => k % 3 === 0))));
    geoCache.set(style, { chassis, wheels, rearX, preset });
  }
  return geoCache.get(style);
}

function buildFromModel(style, opts) {
  const preset = getPreset(style);
  const def = MODEL_DEFS[style], data = loaded[style], t = data.tex;
  const mats = buildMaterials(opts);
  const accentCol = mats.accent.color.clone();
  const paintMask = mats.body.clone();
  if (t.bodyMask) {
    // body texture = paint mask: white -> main paint, grey -> accent colour
    paintMask.map = t.bodyMask;
    paintMask.onBeforeCompile = (sh) => {
      sh.uniforms.accentCol = { value: accentCol };
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', 'uniform vec3 accentCol;\nvoid main() {')
        .replace('#include <map_fragment>', 'float pmask = smoothstep(0.35, 0.75, texture2D(map, vMapUv).r);\ndiffuseColor.rgb = mix(accentCol, diffuseColor.rgb, pmask);');
    };
  }
  const roles = {
    paint: mats.body,
    paintMask,
    trim: mats.accent,
    chassis: new THREE.MeshStandardMaterial({ color: 0xffffff, map: t.chassis, normalMap: t.chassisN || null, metalness: 0.35, roughness: 0.55 }),
    glass: mats.glass,
    lights: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2e0, emissiveIntensity: 2.4 }),
    rim: new THREE.MeshStandardMaterial({ color: mats.rim.color, map: t.rim || null, normalMap: t.rimN || null, metalness: 0.85, roughness: 0.28 }),
    tread: new THREE.MeshStandardMaterial({ color: 0xffffff, map: shared.tread, normalMap: shared.treadN, metalness: 0, roughness: 0.92 }),
  };
  const matFor = (name) => roles[def.mats[name.split(':')[1]]] || roles.chassis;

  const root = new THREE.Group();
  const chassis = new THREE.Group();
  root.add(chassis);
  const body = new THREE.Group();
  body.scale.setScalar(S);
  body.position.set(def.offX * S, REST_Y * S, 0);
  chassis.add(body);
  for (const [name, geo] of Object.entries(data.geos)) {
    if (!name.startsWith('body:')) continue;
    const m = new THREE.Mesh(geo, matFor(name));
    m.castShadow = !name.endsWith('Headlights');
    body.add(m);
  }

  // boost flame out of the rear
  const rearX = data.layout.bbox.min[0] + def.offX;
  const nozzle = { x: (rearX + 4) * S, y: 2 * S };
  const flame = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.ConeGeometry(7 * S, 60 * S, 14, 1, true), mats.flame);
  outer.rotation.z = Math.PI / 2; outer.position.x = -30 * S;
  const core = new THREE.Mesh(new THREE.ConeGeometry(3.5 * S, 34 * S, 10, 1, true), mats.flameCore);
  core.rotation.z = Math.PI / 2; core.position.x = -17 * S;
  flame.add(outer, core);
  flame.position.set((rearX + 2) * S, 2 * S, 0);
  flame.visible = false;
  chassis.add(flame);

  // wheels: one mesh (outer face towards +Z), mirrored for the other side, scaled per axle
  const wheelR = data.layout.wheelR || 12.47;
  const wheels = preset.WHEELS.map((wd) => {
    const pivot = new THREE.Group();
    const spinner = new THREE.Group();
    const holder = new THREE.Group();
    const k = wd.r / wheelR;
    holder.scale.set(k * S, k * S, (wd.z < 0 ? -k : k) * S);
    for (const [name, geo] of Object.entries(data.geos)) {
      if (!name.startsWith('wheel:')) continue;
      const role = def.mats[name.split(':')[1]];
      const m = new THREE.Mesh(geo, role === 'tread' ? roles.tread : roles.rim);
      m.castShadow = role === 'tread';
      holder.add(m);
    }
    spinner.add(holder);
    pivot.add(spinner);
    pivot.position.set(wd.x * S, (wd.y - 28) * S, wd.z * S);
    root.add(pivot);
    return { pivot, spinner, def: wd };
  });
  return { root, chassis, wheels, flame, mats: Object.assign(mats, roles), nozzle, fromModel: true };
}

export function buildCarModel(opts = {}) {
  const style = getPreset(opts.style).name;
  if (loaded[style]) return buildFromModel(style, opts);
  const design = cachedDesign(style);
  const mats = buildMaterials(opts);
  const root = new THREE.Group();
  const chassis = new THREE.Group();
  root.add(chassis);
  for (const c of design.chassis) {
    const m = new THREE.Mesh(c.geo, mats[c.mat] || mats.dark);
    m.castShadow = c.mat === 'body' || c.mat === 'glass';
    chassis.add(m);
  }

  // boost nozzle + flame
  const nozzleX = design.rearX - 2, nozzleY = 4;
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(6 * S, 8 * S, 8 * S, 14, 1, true), mats.dark);
  nozzle.rotation.z = Math.PI / 2; nozzle.position.set((nozzleX + 2) * S, nozzleY * S, 0);
  chassis.add(nozzle);
  const flame = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.ConeGeometry(7 * S, 60 * S, 14, 1, true), mats.flame);
  outer.rotation.z = Math.PI / 2; outer.position.x = -30 * S;
  const core = new THREE.Mesh(new THREE.ConeGeometry(3.5 * S, 34 * S, 10, 1, true), mats.flameCore);
  core.rotation.z = Math.PI / 2; core.position.x = -17 * S;
  flame.add(outer, core);
  flame.position.set((nozzleX - 2) * S, nozzleY * S, 0);
  flame.visible = false;
  chassis.add(flame);

  // wheels (pivot = steering, spinner = rolling)
  const wheels = design.preset.WHEELS.map((wd, i) => {
    const wdesign = design.wheels[i];
    const pivot = new THREE.Group();
    const spinner = new THREE.Group();
    for (const p of wdesign.parts) {
      const m = new THREE.Mesh(p.geo, mats[p.mat] || mats.dark);
      m.castShadow = p.mat === 'tire';
      spinner.add(m);
    }
    pivot.add(spinner);
    pivot.position.set(wd.x * S, (wd.y - 30) * S, wdesign.side * wdesign.wv.z * S);
    root.add(pivot);
    return { pivot, spinner, def: wd };
  });

  return { root, chassis, wheels, flame, mats, nozzle: { x: (nozzleX - 4) * S, y: nozzleY * S } };
}
