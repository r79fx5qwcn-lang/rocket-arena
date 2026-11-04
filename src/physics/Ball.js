import { Vec3, Quat } from './math.js';
import { BALL, GRAVITY } from './constants.js';
import { arenaSdf, arenaNormal } from './Arena.js';

const _n = new Vec3(), _r = new Vec3(), _vr = new Vec3(), _vt = new Vec3(), _tmp = new Vec3();

export class Ball {
  constructor() {
    this.pos = new Vec3(0, BALL.RADIUS, 0);
    this.vel = new Vec3();
    this.angVel = new Vec3();
    this.rot = new Quat();
    this.radius = BALL.RADIUS;
    this.invMass = 1 / BALL.MASS;
    this.invInertia = 1 / BALL.INERTIA;
    // previous state for render interpolation
    this.prevPos = this.pos.clone();
    this.prevRot = this.rot.clone();
    this.lastWallImpact = 0; // speed of the last arena impact (for audio/fx)
    this.frozen = false;
  }

  reset(x = 0, y = BALL.RADIUS, z = 0) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.angVel.set(0, 0, 0); this.rot.identity();
    this.prevPos.copy(this.pos); this.prevRot.copy(this.rot);
  }

  savePrev() { this.prevPos.copy(this.pos); this.prevRot.copy(this.rot); }

  integrateForces(dt) {
    if (this.frozen) return;
    this.vel.y -= GRAVITY * dt;
    const damp = Math.pow(1 - BALL.DRAG, dt);
    this.vel.scale(damp);
  }

  clampVelocities() {
    this.vel.clampLength(BALL.MAX_SPEED);
    this.angVel.clampLength(BALL.MAX_ANG_SPEED);
  }

  integratePositions(dt) {
    if (this.frozen) return;
    this.clampVelocities();
    this.pos.addScaled(this.vel, dt);
    this.rot.integrate(this.angVel, dt);
  }

  /** Resolve collision against the arena SDF. Returns impact normal speed (0 if no impact). */
  collideArena() {
    if (this.frozen) return 0;
    const p = this.pos, R = this.radius;
    const d = arenaSdf(p.x, p.y, p.z);
    if (d < -R) return 0;
    const pen = R + d;
    arenaNormal(p.x, p.y, p.z, _n);
    // contact point relative to center
    _r.copy(_n).scale(-R);
    // velocity of contact point
    _vr.crossVectors(this.angVel, _r).add(this.vel);
    const vn = _vr.dot(_n);
    let impact = 0;
    if (vn < 0) {
      impact = -vn;
      const e = -vn > 60 ? BALL.RESTITUTION : 0;
      const jn = -(1 + e) * vn / this.invMass;
      // tangential (Coulomb friction with rolling coupling, solid sphere)
      _vt.copy(_vr).addScaled(_n, -vn);
      const vtLen = _vt.length();
      let jt = 0;
      if (vtLen > 1e-4) {
        // effective mass for tangential impulse at contact: 1/m + R^2/I
        const kt = this.invMass + R * R * this.invInertia;
        jt = Math.min(vtLen / kt, BALL.FRICTION * jn);
        _vt.scale(1 / vtLen);
      }
      // apply impulses
      this.vel.addScaled(_n, jn * this.invMass);
      if (jt > 0) {
        this.vel.addScaled(_vt, -jt * this.invMass);
        // angular: dw = I^-1 (r x J)
        _tmp.crossVectors(_r, _vt).scale(-jt * this.invInertia);
        this.angVel.add(_tmp);
      }
    }
    // positional correction
    if (pen > 0) p.addScaled(_n, pen);
    return impact;
  }

  serialize() {
    return { p: this.pos.toArray(), v: this.vel.toArray(), w: this.angVel.toArray() };
  }
}
