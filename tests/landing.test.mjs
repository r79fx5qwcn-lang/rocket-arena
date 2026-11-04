// Flicks / ball contacts / landings: the car must end up on its wheels.
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { Car } from '../src/physics/Car.js';
import { Vec3 } from '../src/physics/math.js';
const up = (car) => new Vec3(0, 1, 0).applyQuat(car.rot);
let failed = 0;
function flick(name, P, Y, off, hold, delay, speed, minGain) {
  const w = new PhysicsWorld(); const car = w.addCar(new Car(0, 0)); car.spawn(0, -3000, 0, 1, 100);
  w.goalDetection = false;
  // dribble: ball balanced on the roof, car and ball moving together
  car.vel.set(0, 0, speed);
  w.ball.reset(0, 17 + 56 + 92, -3000 + off); w.ball.vel.set(0, 0, speed);
  for (let i = 0; i < 60; i++) { car.controls.throttle = 0.02; w.step(); }
  const v0 = w.ball.vel.length(); let vm = 0;
  for (let i = 0; i < 420; i++) {
    const t = i / 120, c = car.controls;
    c.throttle = 0;
    c.jump = t < hold || (t > hold + delay && t < hold + delay + 0.05);
    const flipping = t > hold + delay - 0.02 && t < hold + delay + 0.3;
    c.pitch = flipping ? P : (P > 0 && t < hold + delay ? 1 : 0);
    c.yaw = flipping ? Y : 0;
    w.step(); vm = Math.max(vm, w.ball.vel.length());
  }
  const gain = vm - v0;
  const ok = up(car).y > 0.9 && car.onGround && gain >= minGain;
  if (!ok) failed++;
  console.log(`${ok ? '✔' : '✘'} ${name.padEnd(26)} ball +${String(Math.round(gain)).padStart(5)} uu/s (min ${minGain})  landed up.y=${up(car).y.toFixed(2)} onGround=${car.onGround}`);
}
for (const sp of [0, 700]) {
  flick(`front flick @${sp}`, -1, 0, 40, 0.15, 0.12, sp, 600);
  flick(`45° flick @${sp}`, -0.7, 0.7, 40, 0.15, 0.06, sp, 600);
  flick(`musty flick @${sp}`, 1, 0, -40, 0.08, 0.06, sp, 400);
}
// car dropped on its side must recover by itself
{ const w = new PhysicsWorld(); const car = w.addCar(new Car(0, 0)); car.spawn(0, 0, 0, 1, 0);
  car.rot.setFromBasis(new Vec3(0, 0, 1), new Vec3(1, 0, 0)); car.pos.y = 80; w.ball.reset(3000, 92, 0);
  for (let i = 0; i < 360; i++) w.step();
  const ok = up(car).y > 0.9; if (!ok) failed++;
  console.log(`${ok ? '✔' : '✘'} car on its side self-rights      up.y=${up(car).y.toFixed(2)}`); }
console.log(failed ? `${failed} failed` : 'All landing checks passed');
process.exitCode = failed ? 1 : 0;
