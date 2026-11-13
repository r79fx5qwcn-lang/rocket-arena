// Flicks from a real dribble: ball settled on the roof, jump, then dodge. Whatever the car,
// the speed, where the ball sits and the timing, the ball must leave in the dodge direction
// with real power, and the car must land on its wheels.
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { Car } from '../src/physics/Car.js';
import { Vec3 } from '../src/physics/math.js';
import { CAR_MODELS, GRAVITY } from '../src/physics/constants.js';

const up = (car) => new Vec3(0, 1, 0).applyQuat(car.rot);
const DIRS = {
  front: { P: -1, Y: 0, ok: (d) => d.fwd > 650 && d.up > 200 },
  diagonal: { P: -0.7, Y: 0.7, ok: (d) => d.fwd > 350 && d.side > 300 && d.up > 200 },
  side: { P: 0, Y: 1, ok: (d) => d.side > 450 && d.up > 200 },
  back: { P: 1, Y: 0, ok: (d) => d.fwd < -250 && d.up > 300 },
};
function flick(model, dir, speed, off, hold, delay) {
  const { P, Y } = DIRS[dir];
  const w = new PhysicsWorld(); w.dribbleAssist = 0.7; w.goalDetection = false;
  const car = w.addCar(new Car(0, 0, model)); car.spawn(0, -3500, 0, 1, 100);
  car.vel.set(0, 0, speed);
  w.ball.reset(0, car.pos.y + car.ho.y + car.hb.y + 91.5, -3500 + off); w.ball.vel.set(0, 0, speed);
  for (let i = 0; i < 150; i++) { car.controls.throttle = 0.02; w.step(); } // carry the ball
  const carried = Math.abs(w.ball.pos.z - car.pos.z) < 80 && w.ball.pos.y - car.pos.y > 100;
  const v0 = w.ball.vel.clone();
  let d = null, landed = false;
  const tFlick = hold + delay;
  for (let i = 0; i < 420; i++) {
    const t = i / 120, c = car.controls;
    c.throttle = 0;
    c.jump = t < hold || (t > tFlick && t < tFlick + 0.05);
    const fl = t > tFlick - 0.02 && t < tFlick + 0.3;
    c.pitch = fl ? P : 0; c.yaw = fl ? Y : 0;
    w.step();
    if (!d && t >= tFlick + 0.12) {
      // speed gained by the ball since the dribble, gravity removed (the car drives along +Z)
      d = { fwd: w.ball.vel.z - v0.z, side: Math.abs(w.ball.vel.x - v0.x), up: w.ball.vel.y - v0.y + GRAVITY * 0 };
    }
    if (t > tFlick + 0.4 && car.onGround && up(car).y > 0.95) landed = true;
  }
  return { carried, d, landed };
}

let total = 0, weak = 0, notLanded = 0, notCarried = 0;
const examples = [];
for (const model of CAR_MODELS) for (const dir of Object.keys(DIRS)) {
  let n = 0, bad = 0, sums = { fwd: 0, side: 0, up: 0 };
  for (const speed of [0, 700, 1300]) for (const off of [-20, 10, 35]) for (const hold of [0.05, 0.15]) for (const delay of [0.04, 0.12, 0.25]) {
    const r = flick(model, dir, speed, off, hold, delay);
    total++;
    if (!r.carried) { notCarried++; continue; }
    n++; sums.fwd += r.d.fwd; sums.side += r.d.side; sums.up += r.d.up;
    if (!DIRS[dir].ok(r.d)) { bad++; weak++; if (examples.length < 8) examples.push(`${model} ${dir} v${speed} off${off} hold${hold} delay${delay}: fwd ${r.d.fwd | 0} side ${r.d.side | 0} up ${r.d.up | 0}`); }
    if (!r.landed) { notLanded++; if (examples.length < 8) examples.push(`${model} ${dir} v${speed} off${off} hold${hold} delay${delay}: did not land on its wheels`); }
  }
  console.log(`${bad ? '✘' : '✔'} ${model.padEnd(8)} ${dir.padEnd(9)} ${n} flicks, weak or wrong direction: ${bad}  (average: forward ${(sums.fwd / n) | 0}, sideways ${(sums.side / n) | 0}, up ${(sums.up / n) | 0} uu/s)`);
}
for (const e of examples) console.log('   ', e);
console.log(`${total} flicks: ${weak} weak, ${notLanded} bad landings, ${notCarried} setups where the ball was not carried`);
const failed = weak + notLanded > 0 || notCarried > total * 0.1;
console.log(failed ? 'Flick checks FAILED' : 'All flick checks passed');
process.exitCode = failed ? 1 : 0;
