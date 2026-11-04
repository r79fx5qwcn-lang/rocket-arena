// Headless 3v3 bot match: checks the AI + match flow run without errors / NaN and that bots play.
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { Car } from '../src/physics/Car.js';
import { BallPredictor } from '../src/physics/BallPredictor.js';
import { BotController } from '../src/ai/BotController.js';
import { MatchManager, MODES } from '../src/modes/MatchManager.js';
import { DT } from '../src/physics/constants.js';

const diff = process.argv[2] || 'pro';
const size = +(process.argv[3] || 3);
const seconds = +(process.argv[4] || 120);
const w = new PhysicsWorld();
const pred = new BallPredictor(4, 1 / 60);
const shared = { slices: pred.slices, kickoff: false };
const bots = [];
let id = 0;
for (const team of [0, 1]) for (let i = 0; i < size; i++) { const c = w.addCar(new Car(id++, team)); c.name = `T${team}-${i}`; bots.push(new BotController(c, w, shared, diff)); }
const m = new MatchManager(w, size === 1 ? MODES.duel : size === 2 ? MODES.doubles : MODES.standard, { duration: seconds });
let goals = 0, ended = false, touches = 0, aerialTouches = 0, demos = 0, maxBall = 0;
m.on('end', () => { ended = true; });
m.newKickoffVariant(); m.start();
let tick = 0;
const t0 = Date.now();
while (!ended && tick < (seconds + 200) * 120) {
  tick++;
  shared.kickoff = m.state === 'countdown' || (m.state === 'playing' && w.lastTouch === null);
  if (tick % 4 === 0) pred.update(w.ball);
  for (const b of bots) b.update(DT);
  w.step(DT);
  m.tick(DT);
  for (const e of w.consumeEvents()) {
    if (e.type === 'goal') { m.onGoal(e); goals++; }
    if (e.type === 'ballHit') { touches++; if (e.point.y > 300) aerialTouches++; maxBall = Math.max(maxBall, e.ballSpeed); }
    if (e.type === 'demo') demos++;
  }
  for (const c of w.cars) if (!Number.isFinite(c.pos.x + c.pos.y + c.pos.z + c.vel.x)) { console.error('NaN car', c.name, tick); process.exit(1); }
  if (!Number.isFinite(w.ball.pos.x + w.ball.pos.y)) { console.error('NaN ball'); process.exit(1); }
  for (const c of w.cars) if (!c.demolished && (Math.abs(c.pos.x) > 4200 || c.pos.y < -50 || c.pos.y > 2100 || Math.abs(c.pos.z) > 6100)) { console.error('car escaped arena', c.name, c.pos); process.exit(1); }
  if (Math.abs(w.ball.pos.x) > 4100 || w.ball.pos.y < 0 || w.ball.pos.y > 2050) { console.error('ball escaped', w.ball.pos); process.exit(1); }
}
console.log(`${diff} ${size}v${size}: score ${m.score.join('-')}, goals ${goals}, touches ${touches}, aerial touches ${aerialTouches}, demos ${demos}, max ball ${Math.round(maxBall)} uu/s, ended ${ended}, sim ${(tick / 120).toFixed(0)}s in ${(Date.now() - t0) / 1000}s`);
console.log('stats', w.cars.map((c) => `${c.name}: g${c.stats.goals} t${c.stats.touches}`).join(' | '));
