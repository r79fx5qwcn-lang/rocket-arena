// Arena collision geometry expressed as an analytic signed distance field (SDF).
// Negative = inside the playable volume, positive = inside the walls.
//
// Shape (and the visual mesh in render/ArenaView.js follows exactly the same rules):
//  - floor plan = rounded rectangle UNION goal notches (rounded corners). The goal posts
//    are rounded in plan, so the curved floor/wall transition wraps around the posts and
//    continues inside the goals: there is no ledge or wedge anywhere on the floor.
//  - curved floor/wall transition (radius FILLET_R, fading to GOAL_FLOOR_R near the
//    goals) and wall/ceiling transition: cars can drive everywhere, walls and ceiling.
//  - the wall above each goal + the goal roof are a solid block above the crossbar.
// An SDF gives perfectly smooth surfaces, exact normals and cheap ray casts (sphere
// tracing), with no tunnelling and no "ghost edges" like triangle meshes have.
import { ARENA } from './constants.js';
import { Vec3 } from './math.js';

const { HALF_W: W, HALF_L: L, HEIGHT: H, CORNER_R: RC, FILLET_R: RF, GOAL_HALF_W: GW, GOAL_H: GH, GOAL_DEPTH: GD } = ARENA;
const RG = ARENA.GOAL_FLOOR_R;     // transition radius inside the goals / at the posts
const TAPER = ARENA.GOAL_TAPER;     // width over which the transition grows from RG to RF
const RCG = ARENA.GOAL_CORNER_R;    // plan radius of the back corners of the goal
const POST_K = ARENA.POST_BLEND;    // rounding of the goal posts in plan
const ROOF_K = 300;
const GOAL_CZ = (L + GD) / 2, GOAL_HZ = (L + GD) / 2;

/** radius of the floor/wall transition as a function of |x| */
export function floorFilletRadius(ax) {
  if (ax >= GW + TAPER) return RF;
  if (ax <= GW) return RG;
  const t = (ax - GW) / TAPER;
  return RG + (RF - RG) * t * t * (3 - 2 * t);
}

function planArena(ax, az) {
  const qx = ax - (W - RC), qz = az - (L - RC);
  const mx = qx > 0 ? qx : 0, mz = qz > 0 ? qz : 0;
  return Math.sqrt(mx * mx + mz * mz) + Math.min(Math.max(qx, qz), 0) - RC;
}

function planGoal(ax, az) {
  const qx = ax - GW + RCG, qz = Math.abs(az - GOAL_CZ) - GOAL_HZ + RCG;
  const mx = qx > 0 ? qx : 0, mz = qz > 0 ? qz : 0;
  return Math.sqrt(mx * mx + mz * mz) + Math.min(Math.max(qx, qz), 0) - RCG;
}

function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// combine a horizontal distance (to the walls) and a vertical distance (to floor/ceiling)
// with a round fillet of radius r
function fillet(dh, dv, r) {
  const a = dh + r, b = dv + r;
  const pa = a > 0 ? a : 0, pb = b > 0 ? b : 0;
  return Math.sqrt(pa * pa + pb * pb) + Math.min(Math.max(a, b), 0) - r;
}

export function arenaSdf(x, y, z) {
  const ax = Math.abs(x), az = Math.abs(z);
  const dv = Math.abs(y - H / 2) - H / 2;
  if (y >= H / 2) return fillet(planArena(ax, az), dv, RF);
  const dp = smin(planArena(ax, az), planGoal(ax, az), POST_K);
  const f = fillet(dp, dv, floorFilletRadius(ax));
  // solid block above the goal mouth: { y >= GH and |z| >= L }
  const sy = GH - y, sz = L - az;
  const dS = sy > 0 || sz > 0 ? Math.hypot(sy > 0 ? sy : 0, sz > 0 ? sz : 0) : Math.max(sy, sz);
  if (az > L) {
    // inside the goal: rounded edges between the walls and the goal roof (drivable)
    const a = f, b = -dS, h = Math.max(ROOF_K - Math.abs(a - b), 0) / ROOF_K;
    return Math.max(a, b) + h * h * ROOF_K * 0.25;
  }
  return f > -dS ? f : -dS;
}

/** Normal of the boundary pointing INTO the playable space. */
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
  for (let i = 0; i < 64; i++) {
    _p.copy(origin).addScaled(dir, t);
    const d = arenaSdf(_p.x, _p.y, _p.z);
    if (d > -0.05) {
      if (normalOut) arenaNormal(_p.x, _p.y, _p.z, normalOut);
      return t;
    }
    t += -d * 0.9;
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
