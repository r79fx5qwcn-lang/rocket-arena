// Procedural sports car (Octane-like proportions). Local axes: +X forward, +Y up, +Z right.
// All dimensions are written in uu and converted with S.
import * as THREE from 'three';
import { CAR, UU_TO_M as S } from '../physics/constants.js';

export const PAINTS = {
  body: [
    { name: 'Bleu Électrique', hex: '#1f6bff' }, { name: 'Orange Fusion', hex: '#ff7a1a' },
    { name: 'Rouge Racing', hex: '#e0202e' }, { name: 'Vert Toxique', hex: '#3ddc3d' },
    { name: 'Violet Néon', hex: '#8a3cff' }, { name: 'Noir Carbone', hex: '#1b1d22' },
    { name: 'Blanc Titane', hex: '#e9edf2' }, { name: 'Jaune Solaire', hex: '#ffd21a' },
    { name: 'Rose Cyber', hex: '#ff3fa6' }, { name: 'Cyan Glacier', hex: '#22d3ee' },
  ],
  accent: ['#111318', '#ffffff', '#ffd21a', '#22d3ee', '#ff3fa6', '#e0202e', '#3ddc3d', '#8a3cff'],
  wheels: ['#c8ccd4', '#1b1d22', '#ffd21a', '#ff7a1a', '#1f6bff', '#e0202e', '#3ddc3d'],
  boost: ['#ff9a2a', '#3ab0ff', '#b44dff', '#3dff8a', '#ff3355', '#ffffff', '#ffe23d'],
  styles: ['Octane', 'Dominus', 'Breakout'],
};

function sideProfile(points) {
  const sh = new THREE.Shape();
  sh.moveTo(points[0][0] * S, points[0][1] * S);
  for (let i = 1; i < points.length; i++) sh.lineTo(points[i][0] * S, points[i][1] * S);
  sh.closePath();
  return sh;
}

function extrudeCentered(shape, width, bevel) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width * S, bevelEnabled: true, bevelThickness: bevel * S, bevelSize: bevel * S, bevelSegments: 3, steps: 1, curveSegments: 4,
  });
  geo.translate(0, 0, -(width * S) / 2);
  geo.computeVertexNormals();
  return geo;
}

const STYLE_SHAPES = {
  Octane: {
    body: [[-46, 8], [66, 8], [74, 13], [72, 22], [58, 27], [24, 31], [-36, 34], [-48, 30], [-50, 16]],
    cabin: [[24, 31], [6, 50], [-22, 51], [-38, 36], [-36, 33]],
    width: 72, cabinWidth: 58,
  },
  Dominus: {
    body: [[-50, 8], [70, 8], [78, 12], [76, 19], [60, 23], [20, 27], [-40, 30], [-52, 27], [-54, 14]],
    cabin: [[18, 27], [-2, 41], [-30, 42], [-44, 31], [-40, 29]],
    width: 76, cabinWidth: 56,
  },
  Breakout: {
    body: [[-48, 8], [74, 8], [82, 12], [78, 17], [56, 22], [16, 26], [-38, 30], [-52, 28], [-54, 14]],
    cabin: [[14, 26], [-6, 40], [-26, 41], [-42, 30], [-38, 28]],
    width: 70, cabinWidth: 52,
  },
};

export function buildCarModel(opts = {}) {
  const paint = new THREE.Color(opts.body || '#1f6bff');
  const accent = new THREE.Color(opts.accent || '#111318');
  const wheelCol = new THREE.Color(opts.wheels || '#c8ccd4');
  const boostCol = new THREE.Color(opts.boost || '#ff9a2a');
  const style = STYLE_SHAPES[opts.style] || STYLE_SHAPES.Octane;

  const root = new THREE.Group();
  const mats = {
    body: new THREE.MeshPhysicalMaterial({ color: paint, metalness: 0.55, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12 }),
    accent: new THREE.MeshStandardMaterial({ color: accent, metalness: 0.4, roughness: 0.4 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0b0f18, metalness: 0.2, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.92 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x15171c, metalness: 0.3, roughness: 0.7 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }),
    rim: new THREE.MeshStandardMaterial({ color: wheelCol, metalness: 0.85, roughness: 0.25 }),
    head: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdfe8ff, emissiveIntensity: 2 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1020, emissiveIntensity: 1.5 }),
    flame: new THREE.MeshBasicMaterial({ color: boostCol, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    flameCore: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
  };

  const chassis = new THREE.Group();
  chassis.position.y = -12 * S;
  root.add(chassis);
  const body = new THREE.Mesh(extrudeCentered(sideProfile(style.body), style.width, 4), mats.body);
  const cabin = new THREE.Mesh(extrudeCentered(sideProfile(style.cabin), style.cabinWidth, 3), mats.glass);
  cabin.position.y = -0.5 * S;
  body.castShadow = true; cabin.castShadow = true;
  chassis.add(body, cabin);

  // roof panel in body colour
  const roof = new THREE.Mesh(new THREE.BoxGeometry(22 * S, 2 * S, (style.cabinWidth - 8) * S), mats.body);
  roof.position.set(-8 * S, (style.cabin[2][1] + 0.5) * S, 0);
  chassis.add(roof);

  // accent stripes
  const stripeL = new THREE.Mesh(new THREE.BoxGeometry(90 * S, 3 * S, 1 * S), mats.accent);
  stripeL.position.set(8 * S, 18 * S, (style.width / 2 + 4.2) * S);
  const stripeR = stripeL.clone(); stripeR.position.z *= -1;
  const hood = new THREE.Mesh(new THREE.BoxGeometry(40 * S, 1 * S, 10 * S), mats.accent);
  hood.position.set(46 * S, 27 * S, 0); hood.rotation.z = -0.12;
  chassis.add(stripeL, stripeR, hood);

  // bumpers / skirts
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(100 * S, 5 * S, (style.width + 10) * S), mats.dark);
  skirt.position.set(12 * S, 8 * S, 0);
  const front = new THREE.Mesh(new THREE.BoxGeometry(10 * S, 7 * S, (style.width + 6) * S), mats.dark);
  front.position.set(74 * S, 10 * S, 0);
  chassis.add(skirt, front);

  // lights
  for (const z of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(3 * S, 4 * S, 12 * S), mats.head);
    hl.position.set(73 * S, 17 * S, z * (style.width / 2 - 8) * S);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(2 * S, 4 * S, 16 * S), mats.tail);
    tl.position.set(-51 * S, 24 * S, z * (style.width / 2 - 10) * S);
    chassis.add(hl, tl);
  }

  // spoiler
  const wing = new THREE.Mesh(new THREE.BoxGeometry(16 * S, 2.5 * S, (style.width + 8) * S), mats.accent);
  wing.position.set(-48 * S, 46 * S, 0); wing.rotation.z = 0.1;
  chassis.add(wing);
  for (const z of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(5 * S, 13 * S, 2 * S), mats.dark);
    strut.position.set(-44 * S, 39 * S, z * 20 * S);
    chassis.add(strut);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(14 * S, 8 * S, 1.5 * S), mats.accent);
    fin.position.set(-48 * S, 47 * S, z * (style.width / 2 + 4) * S);
    chassis.add(fin);
  }

  // boost nozzle + flame
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(6 * S, 8 * S, 8 * S, 12, 1, true), mats.dark);
  nozzle.rotation.z = Math.PI / 2; nozzle.position.set(-52 * S, 18 * S, 0);
  chassis.add(nozzle);
  const flame = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.ConeGeometry(7 * S, 60 * S, 14, 1, true), mats.flame);
  outer.rotation.z = Math.PI / 2; outer.position.x = -30 * S;
  const core = new THREE.Mesh(new THREE.ConeGeometry(3.5 * S, 34 * S, 10, 1, true), mats.flameCore);
  core.rotation.z = Math.PI / 2; core.position.x = -17 * S;
  flame.add(outer, core);
  flame.position.set(-56 * S, 18 * S, 0);
  flame.visible = false;
  chassis.add(flame);

  // wheels
  const wheels = [];
  for (const wd of CAR.WHEELS) {
    const pivot = new THREE.Group(); // steering
    const spinner = new THREE.Group(); // rolling
    const r = wd.r * S, wdt = 11 * S;
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, wdt, 22), mats.tire);
    tire.rotation.x = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.66, r * 0.66, wdt * 1.04, 10), mats.rim);
    rim.rotation.x = Math.PI / 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(r * 1.2, r * 0.2, wdt * 1.08), mats.dark);
    const spoke2 = spoke.clone(); spoke2.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    spinner.add(tire, rim, spoke, spoke2);
    pivot.add(spinner);
    pivot.position.set(wd.x * S, (wd.y - CAR.SUSP_REST + 12) * S, (wd.z + Math.sign(wd.z) * 10) * S);
    root.add(pivot);
    wheels.push({ pivot, spinner, def: wd });
  }

  // the model geometry is authored with its origin at the center of mass
  return { root, chassis, wheels, flame, mats, boostColor: boostCol };
}
