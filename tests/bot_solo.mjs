import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { Car } from '../src/physics/Car.js';
import { BallPredictor } from '../src/physics/BallPredictor.js';
import { BotController } from '../src/ai/BotController.js';
const diff = process.argv[2] || 'pro';
let total = 0, scored = 0, own = 0;
for (let trial = 0; trial < 12; trial++) {
  const w = new PhysicsWorld(); const pred = new BallPredictor(4, 1/60); const shared = { slices: pred.slices, kickoff: false };
  const c = w.addCar(new Car(0, 0)); c.spawn((Math.random()-0.5)*4000, -3500, 0, 1, 50);
  const bot = new BotController(c, w, shared, diff);
  w.ball.reset((Math.random()-0.5)*5000, 93, (Math.random()-0.5)*6000);
  w.lastTouch = c;
  let t = 0, res = null;
  for (let i = 0; i < 120 * 30 && !res; i++) {
    if (i % 4 === 0) pred.update(w.ball);
    bot.update(1/120); w.step();
    for (const e of w.consumeEvents()) if (e.type === 'goal') res = e.scoringTeam === 0 ? 'goal' : 'own';
    t = i / 120;
  }
  if (res === 'goal') { scored++; total += t; } if (res === 'own') own++;
}
console.log(diff, 'scored', scored, '/12, own goals', own, 'avg time', (total / Math.max(1, scored)).toFixed(1), 's');
