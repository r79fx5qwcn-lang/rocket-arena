// Original car designs (three body types matching the three hitboxes in physics/constants.js).
// Pure data + meshgen: no Three.js here, so the shapes can be previewed / tested in Node.
// Coordinates in uu, relative to the centre of mass. The ground is ~16.7 uu below.
import { loft, box, cylinderZ, torusArc, rotY, rotZ, translate, merge, mirrorZ } from './meshgen.js';

const GROUND = -16.7;

const DESIGNS = {
  // all-round hybrid: compact, high bubble cabin, big rear wheels, tall wing
  Vortex: {
    label: 'Vortex', tagline: 'Polyvalente · hitbox hybride',
    wheels: { front: { r: 13, w: 13, z: 35.5 }, back: { r: 15.5, w: 15, z: 35.5 } },
    body: [
      { x: -49, w: 33, wt: 28, yb: -4, yt: 22, n: 3.2 }, { x: -45, w: 38, wt: 33, yb: -8, yt: 27, n: 4 },
      { x: -30, w: 40, wt: 35, yb: -9, yt: 29, n: 4.5 }, { x: -10, w: 40, wt: 35, yb: -9, yt: 29, n: 4.5 },
      { x: 15, w: 40, wt: 34, yb: -9, yt: 27, n: 4.5 }, { x: 40, w: 39, wt: 32, yb: -9, yt: 21, n: 4.2 },
      { x: 60, w: 37, wt: 28, yb: -8, yt: 15, n: 3.8 }, { x: 70, w: 33, wt: 24, yb: -6, yt: 10, n: 3.2 },
      { x: 75, w: 26, wt: 17, yb: -4, yt: 6, n: 3 },
    ],
    glass: [
      { x: -40, w: 31, wt: 20, yb: 24, yt: 34, n: 3 }, { x: -30, w: 32, wt: 23, yb: 25, yt: 44, n: 3.5 },
      { x: -12, w: 32, wt: 24, yb: 25, yt: 47, n: 3.5 }, { x: 5, w: 31, wt: 22, yb: 24, yt: 45, n: 3.5 },
      { x: 18, w: 30, wt: 18, yb: 23, yt: 36, n: 3 }, { x: 28, w: 28, wt: 14, yb: 22, yt: 26, n: 2.6 },
    ],
    roof: [
      { x: -29, w: 23, wt: 20, yb: 42.5, yt: 46.8, n: 3 }, { x: -12, w: 24.5, wt: 21, yb: 45, yt: 49.2, n: 3.2 },
      { x: 3, w: 23, wt: 19, yb: 43, yt: 47, n: 3 },
    ],
    extras(add) {
      // rear wing
      add('accent', rotZ(box(15, 2.6, 76), 0.08), -47, 47, 0);
      for (const z of [-1, 1]) {
        add('accent', box(16, 11, 1.6), -47, 45, z * 38);
        add('dark', box(4, 15, 2.2), -44, 37, z * 17);
      }
      addFront(add, { x: 73, yLamp: 8, zLamp: 22, lampW: 13, grilleW: 30, splitterW: 70 });
      addRear(add, { x: -49.5, yLamp: 18, zLamp: 21, lampW: 18, diffW: 58, exhaustZ: 11 });
      sides(add, { x0: -35, x1: 55, y: 13.5, z: 40.3, skirtY: -8.5, skirtZ: 40 });
      mirrors(add, 22, 28, 32.5);
    },
  },

  // long, low and flat: muscle-car proportions, fastback cabin set back, ducktail
  Sabre: {
    label: 'Sabre', tagline: 'Longue et plate · hitbox « plank »',
    wheels: { front: { r: 12.5, w: 14, z: 36 }, back: { r: 14, w: 16, z: 37 } },
    body: [
      { x: -61, w: 34, wt: 30, yb: -5, yt: 18, n: 4 }, { x: -57, w: 40, wt: 36, yb: -8, yt: 22, n: 5 },
      { x: -35, w: 42, wt: 37, yb: -9, yt: 23, n: 5 }, { x: -5, w: 41, wt: 36, yb: -9, yt: 22, n: 5 },
      { x: 25, w: 40, wt: 35, yb: -9, yt: 19.5, n: 5 }, { x: 55, w: 39, wt: 33, yb: -9, yt: 16, n: 4.5 },
      { x: 72, w: 35, wt: 27, yb: -8, yt: 11, n: 4 }, { x: 79, w: 28, wt: 20, yb: -6, yt: 6, n: 3.5 },
    ],
    glass: [
      { x: -51, w: 30, wt: 18, yb: 20, yt: 24, n: 3 }, { x: -38, w: 32, wt: 22, yb: 20, yt: 34, n: 3.5 },
      { x: -18, w: 32, wt: 23, yb: 20, yt: 37, n: 3.5 }, { x: -2, w: 31, wt: 21, yb: 19, yt: 34, n: 3.3 },
      { x: 14, w: 29, wt: 16, yb: 18, yt: 23, n: 2.8 },
    ],
    roof: [
      { x: -34, w: 24, wt: 20, yb: 32.5, yt: 36.2, n: 3 }, { x: -18, w: 25, wt: 21, yb: 35, yt: 38.8, n: 3 },
      { x: -5, w: 24, wt: 20, yb: 32.5, yt: 36, n: 3 },
    ],
    extras(add) {
      add('accent', rotZ(box(11, 3, 76), 0.28), -58, 22.5, 0); // ducktail
      add('dark', box(20, 3, 15), 38, 18.4, 0); // hood scoop
      add('accent', box(26, 0.8, 4), 48, 17.8, -9); add('accent', box(26, 0.8, 4), 48, 17.8, 9); // hood stripes
      addFront(add, { x: 78, yLamp: 5, zLamp: 23, lampW: 14, grilleW: 34, splitterW: 74 });
      addRear(add, { x: -61.5, yLamp: 14, zLamp: 22, lampW: 20, diffW: 64, exhaustZ: 14 });
      sides(add, { x0: -45, x1: 60, y: 10, z: 41.3, skirtY: -8.5, skirtZ: 41 });
      mirrors(add, 10, 22, 33);
    },
  },

  // boxy and wide: square cabin, flat hood, square fender flares, light bar
  Bulldog: {
    label: 'Bulldog', tagline: 'Carrée et large · hitbox « box »',
    wheels: { front: { r: 14, w: 16, z: 37 }, back: { r: 15, w: 16, z: 37 } },
    boxyFlares: true,
    body: [
      { x: -52, w: 36, wt: 34, yb: -6, yt: 24, n: 7 }, { x: -49, w: 41, wt: 39, yb: -10, yt: 27, n: 8 },
      { x: -25, w: 42, wt: 40, yb: -10, yt: 28, n: 8 }, { x: 5, w: 42, wt: 40, yb: -10, yt: 28, n: 8 },
      { x: 30, w: 42, wt: 39, yb: -10, yt: 24, n: 8 }, { x: 58, w: 41, wt: 37, yb: -10, yt: 22, n: 7 },
      { x: 68, w: 39, wt: 34, yb: -9, yt: 19, n: 6 }, { x: 72, w: 34, wt: 29, yb: -7, yt: 15, n: 5 },
    ],
    glass: [
      { x: -47, w: 34, wt: 30, yb: 26, yt: 30, n: 6 }, { x: -43, w: 35, wt: 30, yb: 26, yt: 49, n: 7 },
      { x: 0, w: 35, wt: 30, yb: 26, yt: 50, n: 7 }, { x: 16, w: 34, wt: 28, yb: 26, yt: 47, n: 6 },
      { x: 28, w: 33, wt: 26, yb: 25, yt: 30, n: 5 },
    ],
    roof: [
      { x: -44, w: 31, wt: 29, yb: 47.5, yt: 52, n: 7 }, { x: 12, w: 31, wt: 28, yb: 48.5, yt: 52, n: 7 },
    ],
    extras(add) {
      add('accent', box(9, 2, 60), -44, 53.5, 0); // roof spoiler
      add('dark', box(4, 3.5, 44), 8, 54, 0); // light bar
      for (const z of [-15, -5, 5, 15]) add('head', box(1.2, 2.5, 7), 10.2, 54, z);
      for (const z of [-1, 1]) {
        add('head', box(2, 6, 9), 71.5, 8, z * 25);
        add('head', box(2, 6, 9), 71.5, 8, z * 14);
        add('dark', box(1.2, 9, 11), -22, -8, z * 39); // mud flaps behind the front wheels
      }
      // window pillars (A, B, C) in body colour
      for (const z of [-1, 1]) {
        add('body', rotZ(box(3.5, 21, 3), 0.62), 22, 38.5, z * 31);
        add('body', box(4, 23, 3), -12, 37.5, z * 34.6);
        add('body', rotZ(box(4, 24, 3), 0.12), -42, 37.5, z * 34);
      }
      add('dark', box(7, 9, 82), 71, -4, 0); // bumpers
      add('dark', box(7, 9, 82), -51.5, -4, 0);
      add('dark', box(2, 8, 40), 72.2, 3, 0); // grille
      for (const z of [-1, 1]) add('tail', box(1.5, 8, 10), -52.2, 16, z * 26);
      sides(add, { x0: -38, x1: 56, y: 12, z: 42.3, skirtY: -9, skirtZ: 42 });
      mirrors(add, 24, 30, 36);
    },
  },
};

function addFront(add, o) {
  for (const z of [-1, 1]) add('head', rotY(box(3, 4, o.lampW), z * 0.35), o.x - 1.5, o.yLamp, z * o.zLamp);
  add('dark', box(2.5, 6, o.grilleW), o.x + 1, 0, 0);
  add('dark', box(10, 2, o.splitterW), o.x - 4, -8.5, 0);
}
function addRear(add, o) {
  for (const z of [-1, 1]) add('tail', box(1.6, 4, o.lampW), o.x, o.yLamp, z * o.zLamp);
  add('tail', box(1.2, 1.2, o.zLamp * 2 - o.lampW), o.x - 0.2, o.yLamp, 0);
  add('dark', box(8, 5, o.diffW), o.x + 3, -6, 0);
  for (const z of [-1, 1]) add('chrome', rotY(cylinderZ(3, 6, 12), Math.PI / 2), o.x - 1, -3, z * o.exhaustZ);
}
function sides(add, o) {
  for (const z of [-1, 1]) {
    add('accent', box(o.x1 - o.x0, 2, 0.8), (o.x0 + o.x1) / 2, o.y, z * o.z);
    add('dark', box(o.x1 - o.x0 + 10, 4, 2), (o.x0 + o.x1) / 2, o.skirtY, z * o.skirtZ);
  }
}
function mirrors(add, x, y, z) {
  for (const s of [-1, 1]) add('accent', box(5, 3.5, 4), x, y, s * z);
}

export const CAR_DESIGN_LIST = Object.keys(DESIGNS);
export function designInfo(name) { const d = DESIGNS[name] || DESIGNS.Vortex; return { label: d.label, tagline: d.tagline }; }

/**
 * Returns { parts: [{ mat, mesh }], wheel: { front, back } } where part meshes are already
 * in chassis coordinates. `wheelDefs` = physics wheel connection points (for the arches).
 */
export function buildDesign(name, wheelDefs) {
  const d = DESIGNS[name] || DESIGNS.Vortex;
  const parts = [];
  const add = (mat, m, x = 0, y = 0, z = 0) => parts.push({ mat, mesh: translate(m, x, y, z) });
  add('body', loft(d.body, 32));
  add('glass', loft(d.glass, 28));
  add('body', loft(d.roof, 24));
  d.extras(add);
  // wheel arches over each wheel
  for (const wd of wheelDefs) {
    const wv = wd.front ? d.wheels.front : d.wheels.back;
    const yc = GROUND + wv.r;
    const z = Math.sign(wd.z) * (wv.z + 1);
    if (d.boxyFlares) {
      add('body', box(wv.r * 2 + 14, 6, 9), wd.x, yc + wv.r + 2, z);
      add('body', box(6, wv.r + 2, 9), wd.x - wv.r - 6, yc + wv.r / 2, z);
      add('body', box(6, wv.r + 2, 9), wd.x + wv.r + 6, yc + wv.r / 2, z);
    } else {
      add('body', torusArc(wv.r + 4.5, 4.2, -0.15, Math.PI + 0.15, 20, 8), wd.x, yc, z);
    }
  }
  return { parts, wheel: d.wheels };
}

/** wheel parts around the wheel centre; side = +1 (right) / -1 (left): spokes face outward */
export function buildWheel(wv, side) {
  const { r, w } = wv;
  const parts = [];
  parts.push({ mat: 'tire', mesh: cylinderZ(r, w, 30) });
  parts.push({ mat: 'tire', mesh: translate(torusArc(r - 2.2, 2.4, 0, Math.PI * 2, 30, 8), 0, 0, w / 2 - 1.5) });
  parts.push({ mat: 'tire', mesh: translate(torusArc(r - 2.2, 2.4, 0, Math.PI * 2, 30, 8), 0, 0, -w / 2 + 1.5) });
  let rim = merge(
    translate(cylinderZ(r * 0.66, 1.6, 22), 0, 0, w / 2 - 0.2),
    translate(cylinderZ(r * 0.2, 2.4, 14), 0, 0, w / 2 + 0.6),
  );
  for (let k = 0; k < 5; k++) rim = merge(rim, rotZ(translate(box(r * 0.62, 2.6, 2), r * 0.33, 0, w / 2 + 0.8), (k / 5) * Math.PI * 2));
  if (side < 0) rim = mirrorZ(rim);
  parts.push({ mat: 'rim', mesh: rim });
  parts.push({ mat: 'dark', mesh: translate(cylinderZ(r * 0.5, 1, 16), 0, 0, side * (w / 2 - 1.2)) }); // brake disc look
  return parts;
}
