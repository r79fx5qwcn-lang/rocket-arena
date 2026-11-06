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

export const NET_VERSION = 2;
export const SNAPSHOT_EVERY = 2; // ticks (120 / 2 = 60 snapshots per second)
export const INPUT_REDUNDANCY = 12; // every input packet repeats the last 12 inputs (lost packets don't matter)
const BUFFER_TARGET = 3, BUFFER_HIGH = 7;

export class HostSync {
  constructor(world, link, remoteCar) {
    this.world = world;
    this.link = link;
    this.remote = remoteCar;
    this.queue = [];
    this.lastQueued = -1;
    this.ack = -1;
    this.over = 0;
  }

  onMessage(msg) {
    if (msg.t !== 'in') return;
    for (const [k, c] of msg.i) {
      if (k > this.lastQueued) { this.queue.push([k, c]); this.lastQueued = k; }
    }
  }

  /** before each host physics step: consume one guest input */
  beforeStep() {
    // adaptive jitter buffer: if inputs pile up (clock drift, burst after a lag spike),
    // drop at most one extra input per tick until we are back near the target size.
    if (this.queue.length > BUFFER_HIGH) this.over++; else this.over = 0;
    if (this.over > 12 && this.queue.length > BUFFER_TARGET) this.queue.shift();
    if (this.queue.length > 60) this.queue.splice(0, this.queue.length - BUFFER_TARGET);
    const it = this.queue.shift();
    if (it) { this.remote.controls.unpack(it[1]); this.ack = it[0]; }
  }

  /** after each host physics step */
  afterStep(matchState) {
    if (this.world.tick % SNAPSHOT_EVERY !== 0) return;
    // unreliable channel, and skipped if the link is congested (no latency build-up)
    this.link.sendFast({ t: 's', a: this.ack, w: this.world.getState(), m: matchState });
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
    if (this.pending.length > INPUT_REDUNDANCY * 4) this.pending.splice(0, this.pending.length - INPUT_REDUNDANCY * 4);
    this.link.sendFast({ t: 'in', i: this.pending });
    // keep the last inputs: they are sent again with the next packets (loss protection)
    if (this.pending.length > INPUT_REDUNDANCY) this.pending.splice(0, this.pending.length - INPUT_REDUNDANCY);
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
      this.pending = this.pending.filter((p) => p[0] > ack);
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
