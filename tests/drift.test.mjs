// Drift (powerslide) behaviour: the rear swings out, the car slides through the turn
// without spinning out, keeps its speed and straightens when the button is released.
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { Car } from '../src/physics/Car.js';
import { CAR_MODELS } from '../src/physics/constants.js';

let fails = 0;
const check = (name, v, lo, hi, unit = '') => {
  const ok = v >= lo && v <= hi; if (!ok) fails++;
  console.log(`${ok ? '✔' : '✘'} ${name.padEnd(46)} ${v.toFixed(2).padStart(9)} ${unit.padEnd(5)} [${lo} .. ${hi}]`);
};
for (const model of CAR_MODELS) {
  const w = new PhysicsWorld(); w.goalDetection = false;
  const car = w.addCar(new Car(0, 0, model)); car.spawn(0, -3000, 0, 1, 100); w.ball.reset(3500, 92, 3500);
  const c = car.controls;
  const fwd = () => car.forward(new car.pos.constructor());
  for (let i = 0; i < 180; i++) { c.throttle = 1; w.step(); } // ~1250 uu/s
  const v0 = car.vel.length();
  let maxSlip = 0, maxYaw = 0;
  for (let i = 0; i < 120; i++) { // 1 s of drift
    c.throttle = 1; c.steer = 1; c.handbrake = true; w.step();
    const vd = car.vel.clone().normalize(); const f = fwd();
    maxSlip = Math.max(maxSlip, Math.acos(Math.max(-1, Math.min(1, vd.x * f.x + vd.z * f.z))) * 180 / Math.PI);
    maxYaw = Math.max(maxYaw, Math.abs(car.angVel.y));
  }
  const v1 = car.vel.length();
  check(`${model}: drift angle (slip between nose & velocity)`, maxSlip, 20, 75, '°');
  check(`${model}: drift does not spin out (yaw rate)`, maxYaw, 1.5, 3.4, 'rad/s');
  check(`${model}: speed kept through the drift`, v1 / v0, 0.5, 1.2);
  for (let i = 0; i < 150; i++) { c.throttle = 1; c.steer = 0; c.handbrake = false; w.step(); }
  const vd = car.vel.clone().normalize(), f = fwd();
  check(`${model}: straightens after release (slip)`, Math.acos(Math.max(-1, Math.min(1, vd.x * f.x + vd.z * f.z))) * 180 / Math.PI, 0, 8, '°');
  check(`${model}: still on its wheels`, car.up(new car.pos.constructor()).y, 0.98, 1.01);
}
console.log(fails ? `\n${fails} drift check(s) failed` : '\nAll drift checks passed');
process.exit(fails ? 1 : 0);
