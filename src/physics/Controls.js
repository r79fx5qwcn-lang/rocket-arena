// Normalised control state, identical for humans, bots and (later) network players.
export class Controls {
  constructor() { this.reset(); }
  reset() {
    this.throttle = 0; // -1..1
    this.steer = 0;    // -1..1  (+ = right)
    this.pitch = 0;    // -1..1  (+ = nose up, - = nose down)
    this.yaw = 0;      // -1..1  (+ = right)
    this.roll = 0;     // -1..1  (+ = roll right)
    this.jump = false;
    this.boost = false;
    this.handbrake = false;
    this.airRoll = false; // "free air roll": yaw input becomes roll while airborne
    return this;
  }
  copy(c) {
    this.throttle = c.throttle; this.steer = c.steer; this.pitch = c.pitch; this.yaw = c.yaw; this.roll = c.roll;
    this.jump = c.jump; this.boost = c.boost; this.handbrake = c.handbrake; this.airRoll = c.airRoll;
    return this;
  }
  // Compact serialisation (for replays / future netcode)
  pack() {
    const q = (v) => Math.round(v * 127);
    return [q(this.throttle), q(this.steer), q(this.pitch), q(this.yaw), q(this.roll),
      (this.jump ? 1 : 0) | (this.boost ? 2 : 0) | (this.handbrake ? 4 : 0) | (this.airRoll ? 8 : 0)];
  }
  unpack(a) {
    this.throttle = a[0] / 127; this.steer = a[1] / 127; this.pitch = a[2] / 127; this.yaw = a[3] / 127; this.roll = a[4] / 127;
    this.jump = !!(a[5] & 1); this.boost = !!(a[5] & 2); this.handbrake = !!(a[5] & 4); this.airRoll = !!(a[5] & 8);
    return this;
  }
}
