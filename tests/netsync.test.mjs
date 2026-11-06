// Simulated online match (host + guest) with network latency, to verify prediction / reconciliation.
import { PhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { Car } from '../src/physics/Car.js';
import { Controls } from '../src/physics/Controls.js';
import { HostSync, GuestSync } from '../src/net/NetSync.js';
import { MatchManager, MODES } from '../src/modes/MatchManager.js';

function run(latencyMs, jitterMs) {
  const mk = () => { const w = new PhysicsWorld(); w.addCar(new Car(0, 0)); w.addCar(new Car(1, 1)); return w; };
  const hw = mk(), gw = mk();
  const hm = new MatchManager(hw, MODES.duel, { duration: 60 }); hm.kickoffVariant = 0; hm.start();
  const gm = new MatchManager(gw, MODES.duel, { duration: 60 }); gm.kickoffVariant = 0; gm.start();
  let now = 0;
  const toHost = [], toGuest = [];
  const delay = () => latencyMs / 2 + Math.random() * jitterMs;
  const host = new HostSync(hw, { send: (m) => toGuest.push([now + delay(), JSON.stringify(m)]) }, hw.cars[1]);
  const guest = new GuestSync(gw, { send: (m) => toHost.push([now + delay(), JSON.stringify(m)]) }, gw.cars[1]);
  const deliver = (q, fn) => { q.sort((a, b) => a[0] - b[0]); while (q.length && q[0][0] <= now) fn(JSON.parse(q.shift()[1])); };
  const gc = new Controls();
  let goals = 0, errSum = 0, errMax = 0, nErr = 0, maxMsg = 0;
  const frames = 60 * 50; // 50 s at 60 fps, 2 physics ticks per frame
  for (let f = 0; f < frames; f++) {
    // ---- host
    deliver(toHost, (m) => host.onMessage(m));
    for (let i = 0; i < 2; i++) {
      now += 1000 / 120;
      const hc = hw.cars[0].controls; const t = now / 1000;
      hc.throttle = 1; hc.steer = Math.sin(t * 0.7) * 0.6; hc.boost = (t % 6) < 2; hc.jump = (t % 3) < 0.2;
      host.beforeStep(); hw.step(); hm.tick(1 / 120);
      for (const e of hw.consumeEvents()) if (e.type === 'goal') { hm.onGoal(e); goals++; }
      const before = toGuest.length;
      host.afterStep({ s: hm.state });
      if (toGuest.length > before) maxMsg = Math.max(maxMsg, toGuest[toGuest.length - 1][1].length);
    }
    // ---- guest (frame: reconcile, 2 predicted steps, flush)
    deliver(toGuest, (m) => guest.onMessage(m));
    if (guest.reconcile()) { errSum += guest.lastError; nErr++; errMax = Math.max(errMax, guest.lastError); }
    for (let i = 0; i < 2; i++) {
      const t = now / 1000;
      gc.reset(); gc.throttle = 1; gc.steer = Math.cos(t * 0.5) * 0.7; gc.boost = (t % 5) < 1.5;
      gc.jump = (t % 4) > 1 && (t % 4) < 1.15; gc.pitch = (t % 8) > 5 && (t % 8) < 5.3 ? -1 : 0;
      guest.step(gc);
    }
    guest.flush();
  }
  // final agreement: compare the guest's car on both sides once inputs are synced
  const d = gw.cars[1].pos.distanceTo(hw.cars[1].pos);
  console.log(`latency ${latencyMs}±${jitterMs} ms: corrections ${nErr}, own-car prediction error avg ${(errSum / Math.max(1, nErr)).toFixed(1)} uu, max ${errMax.toFixed(0)} uu, snapshot size ${maxMsg} B, goals ${goals}, final host/guest gap ${d.toFixed(0)} uu`);
  return errSum / Math.max(1, nErr);
}
let fail = 0;
for (const [l, j] of [[0, 0], [60, 10], [120, 30], [200, 40]]) if (run(l, j) > 60) fail++;
process.exitCode = fail ? 1 : 0;
