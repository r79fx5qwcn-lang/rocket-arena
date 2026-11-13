// Ceiling: a fast car stays on it, a slow car drops off (and lands on its wheels).
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { Car } from '../src/physics/Car.js';
import { Vec3 } from '../src/physics/math.js';
const up = (car) => new Vec3(0, 1, 0).applyQuat(car.rot);
let fails = 0;
const check = (name, ok, info) => { if (!ok) fails++; console.log(`${ok ? '✔' : '✘'} ${name.padEnd(52)} ${info}`); };
function run(model, mode) {
  const w = new PhysicsWorld(); w.goalDetection = false;
  const car = w.addCar(new Car(0, 0, model)); car.spawn(1500, 0, 1, 0, 100); car.infiniteBoost = true; w.ball.reset(0, 92, 4000);
  let onCeilAt = -1, leftAt = -1, ceilTime = 0, landed = false, speedAtDrop = 0;
  for (let i = 0; i < 120 * 14; i++) {
    const c = car.controls; c.throttle = 1; c.boost = true; c.steer = 0;
    const uy = up(car).y, onCeil = car.onGround && uy < -0.95;
    if (onCeil && onCeilAt < 0) onCeilAt = i;
    if (onCeilAt >= 0 && leftAt < 0) {
      if (mode === 'fast') { c.boost = true; if (i - onCeilAt > 60) c.steer = 0.25; } // circle on the ceiling
      if (mode === 'coast') { c.throttle = 0; c.boost = false; }
      if (mode === 'slow') { c.boost = false; c.throttle = car.vel.length() > 600 ? -1 : 0.3; }
      if (onCeil) ceilTime = (i - onCeilAt) / 120;
      if (!car.onGround && i - onCeilAt > 12 && car.pos.y < 1750) { leftAt = i; speedAtDrop = car.vel.length(); }
    }
    if (leftAt >= 0) { c.throttle = 0; c.boost = false; c.roll = uy < 0.9 ? 1 : 0; if (car.onGround && uy > 0.95) { landed = true; break; } } // the player air-rolls upright
    w.step();
    if (mode === 'fast' && onCeilAt >= 0 && i - onCeilAt > 120 * 5) break;
  }
  return { onCeilAt, leftAt, ceilTime, landed, speedAtDrop };
}
for (const model of ['Octane', 'Dominus', 'Fennec']) {
  const f = run(model, 'fast');
  check(`${model}: fast car stays on the ceiling (5 s, turning)`, f.onCeilAt >= 0 && f.leftAt < 0, `time on ceiling ${f.ceilTime.toFixed(1)} s`);
  const s = run(model, 'slow');
  check(`${model}: braking on the ceiling -> the car drops`, s.leftAt >= 0 && s.ceilTime < 3, `dropped after ${s.ceilTime.toFixed(1)} s at ${s.speedAtDrop | 0} uu/s`);
  check(`${model}: ... and can air roll to land on its wheels`, s.landed, '');
  const c = run(model, 'coast');
  check(`${model}: coasting on the ceiling -> the car drops`, c.leftAt >= 0 && c.ceilTime < 4, `dropped after ${c.ceilTime.toFixed(1)} s at ${c.speedAtDrop | 0} uu/s`);
}
console.log(fails ? `${fails} ceiling check(s) failed` : 'All ceiling checks passed');
process.exitCode = fails ? 1 : 0;
