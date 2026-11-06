// Network synchronisation core (independent from rendering / UI, testable in Node).
//
// Model: host-authoritative simulation + client-side prediction with reconciliation.
//  - The HOST runs the real simulation (120 Hz). It applies the guest's inputs from an
//    input buffer and sends a full snapshot ~30 times per second, with the number of
//    the last guest input it has applied ("ack").
//  - The GUEST runs the same simulation locally with its own inputs applied immediately
//    (no input lag for its own car). When a snapshot arrives, it rewinds to the host
//    state and re-simulates its inputs that the host has not processed yet. Small
//    corrections are smoothed visually with a decaying render offset.
import { Controls } from '../physics/Controls.js';
import { Vec3 } from '../physics/math.js';

export const NET_VERSION = 1;
export const SNAPSHOT_EVERY = 4; // ticks (120 / 4 = 30 snapshots per second)

export class HostSync {
  constructor(world, link, remoteCar) {
    this.world = world;
    this.link = link;
    this.remote = remoteCar;
    this.queue = [];
    this.lastQueued = -1;
    this.ack = -1;
  }

  onMessage(msg) {
    if (msg.t !== 'in') return;
    for (const [k, c] of msg.i) {
      if (k > this.lastQueued) { this.queue.push([k, c]); this.lastQueued = k; }
    }
  }

  /** before each host physics step: consume one guest input */
  beforeStep() {
    // keep the buffer short (catch up if the guest's clock runs a bit fast)
    if (this.queue.length > 8) this.queue.splice(0, this.queue.length - 3);
    const it = this.queue.shift();
    if (it) { this.remote.controls.unpack(it[1]); this.ack = it[0]; }
  }

  /** after each host physics step */
  afterStep(matchState) {
    if (this.world.tick % SNAPSHOT_EVERY !== 0) return;
    this.link.send({ t: 's', a: this.ack, w: this.world.getState(), m: matchState });
  }
}

const _old = new Vec3();

export class GuestSync {
  constructor(world, link, playerCar) {
    this.world = world;
    this.link = link;
    this.player = playerCar;
    this.tick = 0;
    this.history = new Map();
    this.pending = [];
    this.latest = null;
    this.matchState = null;
    this.tmp = new Controls();
    this.corrections = 0;
    this.lastError = 0;
    world.goalDetection = false; // goals are decided by the host
  }

  onMessage(msg) {
    if (msg.t === 's' && (!this.latest || msg.w.k > this.latest.w.k)) this.latest = msg;
  }

  /** one local predicted step with the player's controls. Returns the world events. */
  step(controls) {
    this.tick++;
    const packed = controls.pack();
    this.history.set(this.tick, packed);
    this.pending.push([this.tick, packed]);
    this.player.controls.unpack(packed); // same quantisation as on the host
    this.world.step();
    return this.world.consumeEvents();
  }

  /** send the inputs produced since the last call (once per rendered frame) */
  flush() {
    if (!this.pending.length) return;
    this.link.send({ t: 'in', i: this.pending });
    this.pending = [];
  }

  /** apply the latest host snapshot and re-simulate the inputs not yet acknowledged */
  reconcile() {
    const snap = this.latest;
    if (!snap) return false;
    this.latest = null;
    this.matchState = snap.m;
    const w = this.world;
    const before = w.cars.map((c) => c.pos.clone());
    const ballBefore = w.ball.pos.clone();

    w.setState(snap.w);
    w.goalDetection = false;
    const ack = snap.a;
    if (ack >= 0 && ack <= this.tick) {
      for (let k = ack + 1; k <= this.tick; k++) {
        const c = this.history.get(k);
        if (c) this.player.controls.unpack(c);
        w.step();
        w.consumeEvents(); // already heard / seen during the first prediction
      }
      for (const k of this.history.keys()) if (k <= ack) this.history.delete(k);
    }
    // visual smoothing of the correction
    let err = 0;
    w.cars.forEach((c, i) => {
      _old.copy(before[i]).sub(c.pos);
      const d = _old.length();
      if (c === this.player) err = d;
      if (d < 400) c.renderOffset.add(_old); else c.renderOffset.set(0, 0, 0);
      c.prevPos.copy(c.pos);
    });
    _old.copy(ballBefore).sub(w.ball.pos);
    if (_old.length() < 400) w.ball.renderOffset.add(_old); else w.ball.renderOffset.set(0, 0, 0);
    w.ball.prevPos.copy(w.ball.pos);
    this.lastError = err;
    this.corrections++;
    return true;
  }
}
