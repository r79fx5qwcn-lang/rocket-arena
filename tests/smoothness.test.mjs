// Drives cars on random paths along floor/walls/ceiling and reports "snags":
// hard hitbox impacts while the wheels were already on a surface (= a ledge/edge).
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { Car } from '../src/physics/Car.js';
let seed = 12345; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const runs = +(process.argv[2] || 300);
const snags = [];
let speedLoss = 0;
for (let r = 0; r < runs; r++) {
  const w = new PhysicsWorld(); w.goalDetection = false;
  const car = w.addCar(new Car(0, 0));
  const x = (rnd() - 0.5) * 7000, z = (rnd() - 0.5) * 9000, a = rnd() * Math.PI * 2;
  car.spawn(x, z, Math.cos(a), Math.sin(a), 100);
  car.infiniteBoost = rnd() < 0.5;
  w.ball.reset(0, 92, 0); w.ball.frozen = true; w.ball.pos.set(0, -5000, 0);
  const steer = rnd() < 0.5 ? 0 : (rnd() - 0.5) * 0.6;
  let prevWheels = 4, prevSpeed = 0;
  for (let i = 0; i < 120 * 7; i++) {
    car.controls.throttle = 1; car.controls.steer = steer; car.controls.boost = car.infiniteBoost;
    w.step();
    for (const e of w.consumeEvents()) {
      if (e.type === 'carImpact' && prevWheels >= 3 && e.strength > 300) {
        snags.push({ x: Math.round(car.pos.x), y: Math.round(car.pos.y), z: Math.round(car.pos.z), s: Math.round(e.strength), v: Math.round(prevSpeed) });
      }
    }
    const sp = car.vel.length();
    if (prevWheels >= 3 && car.surfaceContacts >= 3 && prevSpeed - sp > 120) speedLoss++;
    prevWheels = car.surfaceContacts; prevSpeed = sp;
  }
}
console.log(`runs ${runs}: snags ${snags.length}, sudden speed losses ${speedLoss}`);
for (const s of snags.slice(0, 25)) console.log(' ', JSON.stringify(s));
process.exitCode = snags.length > runs * 0.02 ? 1 : 0;
