// Arena collision geometry expressed as an analytic signed distance field (SDF).
// Negative = inside the playable volume, positive = inside the walls.
// The shape: rounded rectangle in plan (curved corners), curved floor/wall and
// wall/ceiling transitions (allowing wall riding), and two goal boxes cut into the
// back walls. Using an SDF gives perfectly smooth surfaces, exact normals and
// cheap ray casts (sphere tracing), with no tunnelling or ghost edges.
import { ARENA } from './constants.js';
import { Vec3 } from './math.js';

const { HALF_W: W, HALF_L: L, HEIGHT: H, CORNER_R: RC, FILLET_R: RF, GOAL_HALF_W: GW, GOAL_H: GH, GOAL_DEPTH: GD } = ARENA;
const L_EXT = L + GD + 2500;
const GOAL_Z0 = L - 3000, GOAL_Z1 = L + GD;
const GOAL_ZC = (GOAL_Z0 + GOAL_Z1) / 2, GOAL_HZ = (GOAL_Z1 - GOAL_Z0) / 2;

function roundedArena(x, y, z, halfL) {
  const qx = Math.abs(x) - (W - RC);
  const qz = Math.abs(z) - (halfL - RC);
  const mx = qx > 0 ? qx : 0, mz = qz > 0 ? qz : 0;
  const dh = Math.sqrt(mx * mx + mz * mz) + Math.min(Math.max(qx, qz), 0) - RC;
  const dv = Math.abs(y - H / 2) - H / 2;
  const ax = dh + RF, ay = dv + RF;
  const px = ax > 0 ? ax : 0, py = ay > 0 ? ay : 0;
  return Math.sqrt(px * px + py * py) + Math.min(Math.max(ax, ay), 0) - RF;
}

function goalBox(x, y, az) {
  const qx = Math.abs(x) - GW;
  const qy = Math.abs(y - GH / 2) - GH / 2;
  const qz = Math.abs(az - GOAL_ZC) - GOAL_HZ;
  const mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0, mz = qz > 0 ? qz : 0;
  return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0);
}

export function arenaSdf(x, y, z) {
  const az = Math.abs(z);
  if (az > L) {
    return Math.min(roundedArena(x, y, z, L), goalBox(x, y, az));
  }
  if (Math.abs(x) < GW && y < GH) {
    // In front of a goal mouth: the back wall is open here, only the goal frame (posts,
    // crossbar) remains, plus the regular floor / side walls / ceiling.
    const dA = roundedArena(x, y, z, L_EXT);
    const dz = L - az;
    const dp = Math.min(GW - Math.abs(x), GH - y);
    const dRim = Math.sqrt(dz * dz + dp * dp);
    return Math.max(dA, -dRim);
  }
  return roundedArena(x, y, z, L);
}

/** Outward normal of the playable volume boundary pointing INTO the playable space. */
export function arenaNormal(x, y, z, out) {
  const e = 0.5;
  const nx = arenaSdf(x - e, y, z) - arenaSdf(x + e, y, z);
  const ny = arenaSdf(x, y - e, z) - arenaSdf(x, y + e, z);
  const nz = arenaSdf(x, y, z - e) - arenaSdf(x, y, z + e);
  out.set(nx, ny, nz).normalize();
  if (out.lengthSq() < 0.5) out.set(0, 1, 0);
  return out;
}

const _p = new Vec3();
/**
 * Sphere-traced ray cast. Returns distance to the surface or -1 if nothing within maxDist.
 * `normalOut` receives the surface normal (pointing into the playable space).
 */
export function arenaRaycast(origin, dir, maxDist, normalOut) {
  let t = 0;
  for (let i = 0; i < 48; i++) {
    _p.copy(origin).addScaled(dir, t);
    const d = arenaSdf(_p.x, _p.y, _p.z);
    if (d > -0.05) {
      if (normalOut) arenaNormal(_p.x, _p.y, _p.z, normalOut);
      return t;
    }
    t += -d;
    if (t > maxDist) return -1;
  }
  return -1;
}

export function isInGoal(z, radius) {
  // returns +1 if ball fully crossed orange goal line (z>0), -1 for blue goal, 0 otherwise
  if (z > L + radius) return 1;
  if (z < -(L + radius)) return -1;
  return 0;
}
