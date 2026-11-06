// Headless physics verification: `npm run test:physics`
// Each check simulates the real engine at 120 Hz and compares against Rocket League reference values.
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { Car } from '../src/physics/Car.js';
import { Vec3 } from '../src/physics/math.js';
import { ARENA, CAR_MODELS } from '../src/physics/constants.js';

function makeWorld() {
  const w = new PhysicsWorld();
  const car = w.addCar(new Car(0, 0));
  car.spawn(0, 0, 0, 1, 100);
  w.ball.reset(0, 92, 3000);
  return { w, car };
}
function run(w, seconds, fn) { const n = Math.round(seconds * 120); for (let i = 0; i < n; i++) { if (fn) fn(i / 120); w.step(); } }
const up = (car) => new Vec3(0, 1, 0).applyQuat(car.rot);
const fwd = (car) => new Vec3(1, 0, 0).applyQuat(car.rot);

let failed = 0;
function check(name, value, min, max, unit = '') {
  const ok = value >= min && value <= max;
  if (!ok) failed++;
  console.log(`${ok ? '✔' : '✘'} ${name.padEnd(46)} ${value.toFixed(2).padStart(9)} ${unit.padEnd(6)} [${min} .. ${max}]`);
}

{ const { w, car } = makeWorld(); run(w, 2);
  check('Car rest height', car.pos.y, 14, 20, 'uu'); check('Car rest is level (up.y)', up(car).y, 0.999, 1.001); }
{ const { w, car } = makeWorld(); car.controls.throttle = 1; run(w, 4);
  check('Max throttle speed', car.vel.length(), 1380, 1440, 'uu/s'); }
{ const { w, car } = makeWorld(); car.spawn(0, -4500, 0, 1, 100); car.controls.boost = true; let t = -1;
  run(w, 3, (tt) => { if (t < 0 && car.isSupersonic) t = tt; });
  check('Time to supersonic (boost from rest)', t, 1.3, 2.0, 's'); check('Max speed', car.vel.length(), 2290, 2300.1, 'uu/s'); }
{ const { w, car } = makeWorld(); car.spawn(500, -1500, 1, 0, 100); car.controls.boost = true; run(w, 1);
  check('Boost consumption over 1 s', 100 - car.boost, 32, 35, 'pts'); }
{ const { w, car } = makeWorld(); car.spawn(0, -4500, 0, 1, 0); car.controls.throttle = 1; run(w, 1.5);
  check('Small pad pickup (+12 boost)', car.boost, 12, 12, 'pts'); }
{ const { w, car } = makeWorld(); car.spawn(3072, -3500, 0, -1, 0); car.controls.throttle = 1; run(w, 1.2);
  check('Big pad pickup (=100 boost)', car.boost, 100, 100, 'pts'); }
{ const { w, car } = makeWorld(); car.controls.throttle = 0.15; run(w, 2); car.controls.steer = 1; run(w, 1);
  check('Turn curvature @~550 uu/s', Math.abs(car.angVel.y) / car.vel.length() * 1000, 3.4, 4.2, 'x1e-3'); }
{ const { w, car } = makeWorld(); car.spawn(0, -4000, 0, 1, 100); car.controls.throttle = 1; run(w, 2.5); car.controls.steer = 1; run(w, 1);
  check('Turn curvature @1400 uu/s', Math.abs(car.angVel.y) / car.vel.length() * 1000, 1.2, 1.6, 'x1e-3'); }
for (const [hold, lo, hi] of [[0, 60, 110], [0.2, 215, 260]]) { const { w, car } = makeWorld(); run(w, 1); const y0 = car.pos.y; let m = 0;
  run(w, 2, (t) => { car.controls.jump = t < Math.max(hold, 1 / 120); m = Math.max(m, car.pos.y); });
  check(`Jump apex (hold ${hold}s)`, m - y0, lo, hi, 'uu'); }
{ const { w, car } = makeWorld(); run(w, 1); const y0 = car.pos.y; let m = 0;
  run(w, 3, (t) => { car.controls.jump = t < 0.2 || (t > 0.25 && t < 0.3); m = Math.max(m, car.pos.y); });
  check('Double jump apex', m - y0, 450, 560, 'uu'); }
{ const { w, car } = makeWorld(); car.controls.throttle = 1; run(w, 1); const v0 = car.vel.length(); let vm = 0, land = -1;
  run(w, 2, (t) => { car.controls.jump = t < 0.15 || (t > 0.25 && t < 0.3); car.controls.pitch = (t > 0.22 && t < 0.35) ? -1 : 0;
    vm = Math.max(vm, car.vel.length()); if (land < 0 && t > 0.4 && car.onGround) land = t; });
  check('Front flip speed gain', vm - v0, 450, 620, 'uu/s'); check('Front flip lands on wheels (up.y)', up(car).y, 0.95, 1.01); check('Front flip landing time', land, 0.8, 1.4, 's'); }
{ const { w, car } = makeWorld(); car.controls.throttle = 1; run(w, 1); const r0 = new Vec3(0, 0, 1).applyQuat(car.rot); let vside = 0;
  run(w, 1.5, (t) => { car.controls.jump = t < 0.15 || (t > 0.25 && t < 0.3); car.controls.yaw = (t > 0.22 && t < 0.35) ? 1 : 0; vside = Math.max(vside, car.vel.dot(r0)); });
  check('Side flip lateral impulse @1400', vside, 650, 1000, 'uu/s'); check('Side flip lands on wheels', up(car).y, 0.95, 1.01); }
{ const { w, car } = makeWorld(); car.controls.throttle = -1; run(w, 1.2); const f0 = fwd(car);
  run(w, 2.5, (t) => { const c = car.controls; c.throttle = 0; c.jump = t < 0.05 || (t > 0.1 && t < 0.15);
    c.pitch = t < 0.1 ? 0 : (t < 0.18 ? 1 : (t < 0.9 ? -1 : 0)); c.roll = (t > 0.3 && t < 0.9) ? 1 : 0; });
  check('Half flip: car turned around (fwd·f0)', fwd(car).dot(f0), -1, -0.9); check('Half flip: lands upright', up(car).y, 0.95, 1.01); }
{ const { w, car } = makeWorld(); car.controls.throttle = 1; run(w, 0.6); const v0 = car.vel.length(); let flipT = -1, vAfter = 0;
  run(w, 2, (t) => { const c = car.controls; c.jump = t < 0.1; c.pitch = (t > 0.1 && t < 0.4) ? 0.35 : 0;
    if (flipT < 0 && t > 0.3 && car.vel.y < 0 && car.pos.y < 45) flipT = t;
    if (flipT > 0 && t >= flipT && t < flipT + 0.05) { c.jump = true; c.pitch = -1; }
    if (flipT > 0 && Math.abs(t - flipT - 0.3) < 0.005) vAfter = car.vel.length(); });
  check('Wave dash speed gain', vAfter - v0, 350, 750, 'uu/s'); }
{ const { w, car } = makeWorld(); car.pos.y = 800; car.controls.roll = 1; run(w, 1);
  check('Air roll max angular speed', car.angVel.length(), 5.4, 5.51, 'rad/s'); }
{ const { w, car } = makeWorld(); car.spawn(2000, 0, 1, 0, 100); car.controls.throttle = 1; run(w, 3.0);
  check('Wall ride: car on side wall (up.x)', up(car).x, -1.01, -0.95); check('Wall ride: height reached', car.pos.y, 500, ARENA.HEIGHT - 400, 'uu'); }
{ const { w, car } = makeWorld(); car.spawn(1000, 0, 1, 0, 100); car.infiniteBoost = true; car.controls.boost = true; let vmin = 9999;
  run(w, 4.5, (t) => { if (t > 1.9 && t < 2.6) vmin = Math.min(vmin, car.vel.length()); });
  check('Floor→wall transition keeps speed (min)', vmin, 1900, 2301, 'uu/s'); check('Ceiling driving (up.y)', up(car).y, -1.01, -0.95); check('Ceiling height', car.pos.y, ARENA.HEIGHT - 100, ARENA.HEIGHT, 'uu'); }
{ const { w, car } = makeWorld(); w.ball.reset(2000, 1000, 0); const peaks = []; let pv = 0;
  run(w, 4, () => { const vy = w.ball.vel.y; if (pv > 0 && vy <= 0) peaks.push(w.ball.pos.y - 91.25); pv = vy; });
  check('Ball bounce ratio (restitution 0.6 → 0.36)', peaks[0] / (1000 - 91.25), 0.32, 0.40); }
{ const { w, car } = makeWorld(); car.controls.throttle = 1; w.ball.reset(0, 92, 2500); let m = 0;
  run(w, 3, () => { m = Math.max(m, w.ball.vel.length()); }); check('Ball speed after hit @1410', m, 1800, 2400, 'uu/s'); }
{ const { w, car } = makeWorld(); car.spawn(0, -4000, 0, 1, 100); car.infiniteBoost = true; car.controls.boost = true; w.ball.reset(0, 92, 1500); let m = 0;
  run(w, 4, () => { m = Math.max(m, w.ball.vel.length()); }); check('Ball speed after supersonic hit', m, 2900, 4200, 'uu/s'); }
{ const { w, car } = makeWorld(); w.ball.reset(0, 800, 0); car.pos.set(0, 800 - 91 - 50, 0);
  car.rot.setFromBasis(new Vec3(0, 0, 1), new Vec3(0, -1, 0)); car.vel.set(0, 300, 0); car.hasJumped = true; car.hasFlipped = true; let resets = 0;
  run(w, 0.4, () => { for (const e of w.events) if (e.type === 'flipReset') resets++; w.events.length = 0; });
  check('Flip reset when wheels touch the ball', resets, 1, 1); check('Flip available again', car.hasFlipped ? 0 : 1, 1, 1); }
{ const { w, car } = makeWorld(); w.ball.reset(0, 92.75, 0); car.spawn(0, 0, 0, 1, 0); car.pos.z = -400;
  car.controls.throttle = 1; let goals = 0; w.ball.reset(0, 92, 4900); w.ball.vel.set(0, 0, 800);
  run(w, 2, () => { for (const e of w.events) if (e.type === 'goal') goals++; w.events.length = 0; });
  check('Goal detection', goals, 1, 1); }
{ const w = new PhysicsWorld(); const a = w.addCar(new Car(0, 0)), b = w.addCar(new Car(1, 1));
  a.spawn(0, -1500, 0, 1, 100); a.infiniteBoost = true; b.spawn(0, 1500, 1, 0, 0); w.ball.reset(3000, 92, 0); let demo = 0;
  run(w, 2.5, () => { a.controls.boost = true; for (const e of w.events) if (e.type === 'demo') demo++; w.events.length = 0; });
  check('Supersonic demolition', demo, 1, 1); }
{ const w = new PhysicsWorld(); const a = w.addCar(new Car(0, 0)); a.spawn(0, 4300, 0, 1, 0); w.ball.reset(0, 300, 5300); const vy0 = a.vel.y;
  w.goalBlast(w.ball.pos);
  check('Goal explosion blows nearby cars up/back', a.vel.y - vy0, 300, 2000, 'uu/s'); check('Goal explosion pushes away from the goal', -a.vel.z, 300, 2500, 'uu/s'); }
{ const w = new PhysicsWorld(); w.dribbleAssist = 1; const car = w.addCar(new Car(0, 0)); car.spawn(0, -4000, 0, 1, 100);
  w.ball.reset(0, car.pos.y + car.ho.y + car.hb.y + 92, -4000); let on = 0;
  run(w, 5, (t) => { car.controls.throttle = 0.5; car.controls.steer = Math.sin(t) * 0.5; if (w.ball.pos.y - car.pos.y > 80 && w.ball.pos.distanceTo(car.pos) < 200) on++; });
  check('Dribble assist keeps the ball on the roof', on / 600, 0.85, 1.01); }
for (const model of CAR_MODELS) {
  const w = new PhysicsWorld(); const car = w.addCar(new Car(0, 0, model)); car.spawn(0, 0, 0, 1, 100); w.ball.reset(3000, 92, 0);
  run(w, 2);
  check(`${model}: rest height`, car.pos.y, 13, 21, 'uu'); check(`${model}: level at rest (up.y)`, up(car).y, 0.999, 1.001);
  car.controls.throttle = 1; run(w, 1); car.controls.throttle = 0;
  let land = -1; run(w, 2, (t) => { car.controls.jump = t < 0.15 || (t > 0.25 && t < 0.3); car.controls.pitch = (t > 0.22 && t < 0.35) ? -1 : 0; if (land < 0 && t > 0.4 && car.onGround) land = t; });
  check(`${model}: front flip lands on wheels`, up(car).y, 0.95, 1.01);
}
console.log(failed ? `\n${failed} check(s) failed` : '\nAll physics checks passed');
process.exit(failed ? 1 : 0);
