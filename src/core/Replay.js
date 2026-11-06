// Goal replays: the last seconds of the match are recorded at 60 Hz and played back
// through the normal car / ball views (with lightweight "proxy" objects).
import { Vec3, Quat } from '../physics/math.js';

const RATE = 60;

export class ReplayRecorder {
  constructor(seconds = 7) {
    this.max = seconds * RATE;
    this.frames = [];
  }
  clear() { this.frames.length = 0; }

  record(world) {
    const b = world.ball;
    const f = {
      b: [b.pos.x, b.pos.y, b.pos.z, b.rot.x, b.rot.y, b.rot.z, b.rot.w, b.hidden ? 1 : 0, b.vel.length()],
      c: world.cars.map((c) => [c.pos.x, c.pos.y, c.pos.z, c.rot.x, c.rot.y, c.rot.z, c.rot.w,
        (c.isBoosting ? 1 : 0) | (c.isSupersonic ? 2 : 0) | (c.demolished ? 4 : 0),
        c.wheels[0].length, c.wheels[1].length, c.wheels[2].length, c.wheels[3].length, c.wheels[0].steer, c.wheels[0].spin, c.wheels[2].spin,
        c.vel.x, c.vel.y, c.vel.z]),
    };
    this.frames.push(f);
    if (this.frames.length > this.max) this.frames.shift();
  }

  /** copy of the last `seconds` */
  take(seconds) { return this.frames.slice(-Math.round(seconds * RATE)); }
}

function carProxy(car) {
  return {
    team: car.team, demolished: false, isBoosting: false, isSupersonic: false,
    pos: new Vec3(), prevPos: new Vec3(), rot: new Quat(), prevRot: new Quat(), vel: new Vec3(), renderOffset: new Vec3(),
    wheels: car.wheels.map(() => ({ length: 30, steer: 0, spin: 0 })),
  };
}

export class ReplayPlayer {
  constructor(frames, session) {
    this.frames = frames;
    this.session = session;
    this.t = 0;
    this.done = frames.length < 4;
    this.goalFrame = frames.findIndex((f) => f.b[7]);
    this.goalFired = false;
    const w = session.world;
    this.carProxies = w.cars.map(carProxy);
    this.ballProxy = { pos: new Vec3(), prevPos: new Vec3(), rot: new Quat(), prevRot: new Quat(), vel: new Vec3(), renderOffset: new Vec3(), hidden: false };
    // swap the views onto the proxies
    this.saved = session.carViews.map((v) => v.car);
    session.carViews.forEach((v) => { const i = w.cars.indexOf(v.car); v.car = this.carProxies[i]; });
    this.savedBall = session.ballView.ball;
    session.ballView.ball = this.ballProxy;
  }

  /** advance; returns interpolation alpha for the views */
  update(dt) {
    if (this.done) return 1;
    this.t += dt * RATE;
    const n = this.frames.length;
    if (this.t >= n - 1) { this.t = n - 1; this.done = true; }
    const i = Math.min(n - 2, Math.floor(this.t));
    const a = this.frames[i], b = this.frames[i + 1];
    const set = (out, prev, fa, fb) => {
      prev.pos.set(fa[0], fa[1], fa[2]); prev.rot.set(fa[3], fa[4], fa[5], fa[6]);
      out.pos.set(fb[0], fb[1], fb[2]); out.rot.set(fb[3], fb[4], fb[5], fb[6]);
    };
    // ball
    const B = this.ballProxy;
    B.prevPos.set(a.b[0], a.b[1], a.b[2]); B.prevRot.set(a.b[3], a.b[4], a.b[5], a.b[6]);
    B.pos.set(b.b[0], b.b[1], b.b[2]); B.rot.set(b.b[3], b.b[4], b.b[5], b.b[6]);
    B.hidden = !!b.b[7];
    B.vel.set(b.b[8], 0, 0);
    this.carProxies.forEach((p, k) => {
      const fa = a.c[k], fb = b.c[k];
      if (!fa || !fb) return;
      p.prevPos.set(fa[0], fa[1], fa[2]); p.prevRot.set(fa[3], fa[4], fa[5], fa[6]);
      p.pos.set(fb[0], fb[1], fb[2]); p.rot.set(fb[3], fb[4], fb[5], fb[6]);
      p.isBoosting = !!(fb[7] & 1); p.isSupersonic = !!(fb[7] & 2); p.demolished = !!(fb[7] & 4);
      for (let w = 0; w < 4; w++) { p.wheels[w].length = fb[8 + w]; p.wheels[w].steer = w < 2 ? fb[12] : 0; p.wheels[w].spin = w < 2 ? fb[13] : fb[14]; }
      p.vel.set(fb[15], fb[16], fb[17]);
    });
    void set;
    this.justScored = false;
    if (!this.goalFired && this.goalFrame >= 0 && i >= this.goalFrame - 1) { this.goalFired = true; this.justScored = true; }
    return this.t - i;
  }

  get ballPos() { return this.ballProxy.pos; }

  restore() {
    const s = this.session;
    s.carViews.forEach((v, k) => { v.car = this.saved[k]; });
    s.ballView.ball = this.savedBall;
  }
}
