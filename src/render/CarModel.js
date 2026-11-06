// Car models: converts the procedural designs of carDesigns.js into Three.js meshes.
// Local axes: +X forward, +Y up, +Z right. Designs are in uu, converted with S.
import * as THREE from 'three';
import { UU_TO_M as S, getPreset, CAR_MODELS } from '../physics/constants.js';
import { buildDesign, buildWheel } from './carDesigns.js';

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
    const d = buildDesign(preset.name, preset.WHEELS);
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

export function buildCarModel(opts = {}) {
  const design = cachedDesign(getPreset(opts.style).name);
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
