// Rocket League style car: rigid body + 4 ray-cast wheels (spring/damper suspension),
// tyre friction impulses, sticky forces (wall/ceiling driving), boost, jump,
// double jump, dodges (flips) with flip-cancel, Z-damping, air control, auto-flip.
// All mechanics (speed flip, half flip, wave dash, flicks, flip resets...) emerge
// from these rules + player input, exactly like in the original game.
import { Vec3, Quat, clamp, lerp } from './math.js';
import {
  CAR, GRAVITY, DRIVE_ACCEL_CURVE, STEER_ANGLE_CURVE, POWERSLIDE_STEER_CURVE,
  LAT_FRICTION_CURVE, HANDBRAKE_LAT_FACTOR, NON_STICKY_FRICTION_CURVE,
} from './constants.js';
import { arenaRaycast } from './Arena.js';
import { Controls } from './Controls.js';

// scratch
const _f = new Vec3(), _u = new Vec3(), _r = new Vec3();
const _a = new Vec3(), _b = new Vec3(), _c = new Vec3(), _d = new Vec3(), _n = new Vec3();
const _q = new Quat();
const _ia = new Vec3(), _ib = new Vec3();
const _imp = [new Vec3(), new Vec3(), new Vec3(), new Vec3()];
const _impRel = [new Vec3(), new Vec3(), new Vec3(), new Vec3()];

function raySphere(o, dir, c, R, maxDist) {
  // returns t or -1
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const cc = ox * ox + oy * oy + oz * oz - R * R;
  const disc = b * b - cc;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  if (t < 0 || t > maxDist) return -1;
  return t;
}

export class Car {
  constructor(id, team = 0) {
    this.id = id;
    this.team = team; // 0 blue, 1 orange
    this.pos = new Vec3(0, CAR.REST_HEIGHT, 0);
    this.vel = new Vec3();
    this.angVel = new Vec3();
    this.rot = new Quat();
    this.prevPos = this.pos.clone();
    this.prevRot = this.rot.clone();
    this.invMass = 1 / CAR.MASS;
    this.invI = { x: 1 / CAR.INERTIA.x, y: 1 / CAR.INERTIA.y, z: 1 / CAR.INERTIA.z };

    this.controls = new Controls();
    this.lastControls = new Controls();

    this.wheels = CAR.WHEELS.map((w) => ({
      def: w,
      contact: false, onBall: false,
      length: CAR.SUSP_REST, // current suspension length (visual)
      point: new Vec3(), normal: new Vec3(0, 1, 0),
      steer: 0, spin: 0,
    }));
    this.surfaceContacts = 0;
    this.ballContacts = 0;
    this.onGround = false;
    this.groundNormal = new Vec3(0, 1, 0);

    this.boost = CAR.BOOST_SPAWN;
    this.infiniteBoost = false;
    this.isBoosting = false;
    this.boostingTime = 0;
    this.handbrakeVal = 0;

    // jump state
    this.hasJumped = false; this.isJumping = false; this.jumpTime = 0;
    this.hasDoubleJumped = false; this.hasFlipped = false;
    this.isFlipping = false; this.flipTime = 0;
    this.flipRelTorque = new Vec3(); // x = roll, z = pitch (local)
    this.airTime = 0; this.airTimeSinceJump = 0;
    this.hasFlipDir = false;
    this.autoFlipTimer = 0;

    this.bodyContact = false;
    this.bodyContactNormal = new Vec3(0, 1, 0);

    this.isSupersonic = false; this.supersonicTime = 0;
    this.demolished = false; this.respawnTimer = 0;
    this.frozen = false;

    this.lastExtraHitTick = -10;
    this.renderOffset = new Vec3(); // visual smoothing after network corrections
    this.bumpCooldowns = {};
    this.prevSpeedForBump = 0;
    this.events = []; // queued gameplay events consumed by the world (jump, flip, flipReset...)
    this.stats = { goals: 0, shots: 0, saves: 0, touches: 0, demos: 0, boostUsed: 0, flipResets: 0 };
    this.name = 'Car';
    this.isBot = false;
  }

  // ---------- helpers ----------
  forward(out) { return out.set(1, 0, 0).applyQuat(this.rot); }
  up(out) { return out.set(0, 1, 0).applyQuat(this.rot); }
  right(out) { return out.set(0, 0, 1).applyQuat(this.rot); }
  toWorld(lx, ly, lz, out) { return out.set(lx, ly, lz).applyQuat(this.rot).add(this.pos); }

  /** out = I_world^-1 * v */
  applyInvInertia(v, out) {
    out.copy(v).applyQuatInv(this.rot);
    out.x *= this.invI.x; out.y *= this.invI.y; out.z *= this.invI.z;
    return out.applyQuat(this.rot);
  }
  /** impulse J applied at world-relative point rel */
  applyImpulse(J, rel, angScale = 1) {
    this.vel.addScaled(J, this.invMass);
    _ia.crossVectors(rel, J);
    this.applyInvInertia(_ia, _ia);
    this.angVel.addScaled(_ia, angScale);
  }
  /** effective inverse mass along direction n at relative point rel */
  effInvMass(rel, n, angScale = 1) {
    _ia.crossVectors(rel, n);
    this.applyInvInertia(_ia, _ib);
    _ib.cross(rel);
    return this.invMass + _ib.dot(n) * angScale;
  }
  pointVelocity(rel, out) { return out.crossVectors(this.angVel, rel).add(this.vel); }

  savePrev() { this.prevPos.copy(this.pos); this.prevRot.copy(this.rot); }

  // ---------- network state (everything needed to resume the simulation exactly) ----------
  getState() {
    const r = (v) => Math.round(v * 100) / 100;
    const v3 = (v) => [r(v.x), r(v.y), r(v.z)];
    const f = (this.hasJumped ? 1 : 0) | (this.isJumping ? 2 : 0) | (this.hasDoubleJumped ? 4 : 0) | (this.hasFlipped ? 8 : 0) |
      (this.isFlipping ? 16 : 0) | (this.hasFlipDir ? 32 : 0) | (this.isBoosting ? 64 : 0) | (this.isSupersonic ? 128 : 0) |
      (this.demolished ? 256 : 0) | (this.frozen ? 512 : 0) | (this.infiniteBoost ? 1024 : 0);
    const st = this.stats;
    return [this.id, v3(this.pos), v3(this.vel), v3(this.angVel),
      [this.rot.x, this.rot.y, this.rot.z, this.rot.w].map((x) => Math.round(x * 1e5) / 1e5),
      r(this.boost), f, r(this.jumpTime), r(this.flipTime), r(this.airTime), r(this.airTimeSinceJump), v3(this.flipRelTorque),
      r(this.handbrakeVal), r(this.boostingTime), r(this.autoFlipTimer), r(this.supersonicTime), r(this.respawnTimer),
      this.controls.pack(), this.lastControls.pack(),
      [st.goals, st.shots, st.saves, st.touches, st.demos, Math.round(st.boostUsed), st.flipResets],
      this.lastExtraHitTick, this.lastTouchTick ?? -10];
  }

  setState(a) {
    const set3 = (v, x) => v.set(x[0], x[1], x[2]);
    set3(this.pos, a[1]); set3(this.vel, a[2]); set3(this.angVel, a[3]);
    this.rot.set(a[4][0], a[4][1], a[4][2], a[4][3]).normalize();
    this.boost = a[5];
    const f = a[6];
    this.hasJumped = !!(f & 1); this.isJumping = !!(f & 2); this.hasDoubleJumped = !!(f & 4); this.hasFlipped = !!(f & 8);
    this.isFlipping = !!(f & 16); this.hasFlipDir = !!(f & 32); this.isBoosting = !!(f & 64); this.isSupersonic = !!(f & 128);
    this.demolished = !!(f & 256); this.frozen = !!(f & 512); this.infiniteBoost = !!(f & 1024);
    this.jumpTime = a[7]; this.flipTime = a[8]; this.airTime = a[9]; this.airTimeSinceJump = a[10];
    set3(this.flipRelTorque, a[11]);
    this.handbrakeVal = a[12]; this.boostingTime = a[13]; this.autoFlipTimer = a[14]; this.supersonicTime = a[15]; this.respawnTimer = a[16];
    this.controls.unpack(a[17]); this.lastControls.unpack(a[18]);
    const st = this.stats, s = a[19];
    st.goals = s[0]; st.shots = s[1]; st.saves = s[2]; st.touches = s[3]; st.demos = s[4]; st.boostUsed = s[5]; st.flipResets = s[6];
    this.lastExtraHitTick = a[20]; this.lastTouchTick = a[21];
  }

  spawn(x, z, yawFwdX, yawFwdZ, boost = CAR.BOOST_SPAWN) {
    this.pos.set(x, CAR.REST_HEIGHT, z);
    _a.set(yawFwdX, 0, yawFwdZ).normalize();
    _b.set(0, 1, 0);
    this.rot.setFromBasis(_a, _b);
    this.vel.set(0, 0, 0); this.angVel.set(0, 0, 0);
    this.boost = boost;
    this.hasJumped = this.isJumping = this.hasDoubleJumped = this.hasFlipped = this.isFlipping = false;
    this.jumpTime = this.flipTime = this.airTime = this.airTimeSinceJump = 0;
    this.demolished = false; this.respawnTimer = 0;
    this.isSupersonic = false; this.supersonicTime = 0;
    this.handbrakeVal = 0; this.isBoosting = false; this.boostingTime = 0;
    this.controls.reset(); this.lastControls.reset();
    this.savePrev();
  }

  get forwardSpeed() { return this.vel.dot(this.forward(_a)); }

  // ---------- main update (forces & velocity) ----------
  update(dt, ball) {
    if (this.demolished || this.frozen) {
      this.lastControls.copy(this.controls);
      return;
    }
    const c = this.controls;
    const f = this.forward(_f), u = this.up(_u), r = this.right(_r);

    // ---- handbrake ramp
    if (c.handbrake) this.handbrakeVal = Math.min(1, this.handbrakeVal + CAR.POWERSLIDE_RISE * dt);
    else this.handbrakeVal = Math.max(0, this.handbrakeVal - CAR.POWERSLIDE_FALL * dt);

    // ---- wheel ray casts
    const fwdSpeed = this.vel.dot(f);
    const absSpd = Math.abs(fwdSpeed);
    const steerAngle = c.steer * lerp(STEER_ANGLE_CURVE.get(absSpd), POWERSLIDE_STEER_CURVE.get(absSpd), this.handbrakeVal);
    let surf = 0, onBall = 0;
    _n.set(0, 0, 0);
    for (const w of this.wheels) {
      const d = w.def;
      const conn = this.toWorld(d.x, d.y, d.z, _a);
      _b.copy(u).scale(-1);
      const maxLen = CAR.SUSP_REST + d.r;
      let t = arenaRaycast(conn, _b, maxLen, w.normal);
      w.onBall = false;
      if (ball) {
        const tb = raySphere(conn, _b, ball.pos, ball.radius, maxLen);
        if (tb >= 0 && (t < 0 || tb < t)) {
          t = tb; w.onBall = true;
          w.normal.copy(conn).addScaled(_b, tb).sub(ball.pos).normalize();
        }
      }
      w.steer = d.front ? steerAngle : 0;
      if (t >= 0) {
        w.contact = true;
        w.length = Math.max(0, t - d.r);
        w.point.copy(conn).addScaled(_b, t);
        if (w.onBall) onBall++; else { surf++; _n.add(w.normal); }
      } else {
        w.contact = false;
        w.length = Math.min(CAR.SUSP_REST, w.length + 300 * dt); // visual extension
      }
      // visual wheel spin
      w.spin += fwdSpeed / d.r * dt;
    }
    this.surfaceContacts = surf;
    this.ballContacts = onBall;
    const wasOnGround = this.onGround;
    this.onGround = surf >= 3;
    if (surf > 0) this.groundNormal.copy(_n).normalize();

    // ---- flip reset (wheels touching the ball while airborne)
    if (!this.onGround && onBall >= 3 && surf === 0 && (this.hasFlipped || this.hasDoubleJumped || this.hasJumped)) {
      this.hasFlipped = false; this.hasDoubleJumped = false; this.hasJumped = false;
      this.airTimeSinceJump = 0; this.isFlipping = false;
      this.stats.flipResets++;
      this.events.push('flipReset');
    }
    if (this.onGround && !wasOnGround) this.events.push('land');

    // ---- suspension
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      if (!w.contact) continue;
      const comp = CAR.SUSP_REST - w.length;
      const rel = _c.copy(w.point).sub(this.pos);
      const pv = this.pointVelocity(rel, _d);
      if (w.onBall) {
        _a.copy(w.point).sub(ball.pos);
        _b.crossVectors(ball.angVel, _a).add(ball.vel);
        pv.sub(_b);
      }
      const compVel = -pv.dot(w.normal);
      const damp = compVel > 0 ? CAR.SUSP_DAMP_COMP : CAR.SUSP_DAMP_RELAX;
      let acc = CAR.SUSP_STIFFNESS * comp + damp * compVel;
      // progressive bump-stop: keeps the chassis off the surface in hard landings / wall transitions
      const over = comp - CAR.SUSP_BUMPSTOP;
      if (over > 0) acc += CAR.SUSP_BUMPSTOP_K * over * over + damp * 2 * Math.max(compVel, 0);
      if (acc < 0) acc = 0;
      // wheels hitting a surface at a steep angle (e.g. nose-down during a flip) push much less
      const align = u.dot(w.normal);
      if (align < 0.85) acc *= align <= 0.45 ? 0 : (align - 0.45) / 0.4;
      if (acc > 6000) acc = 6000;
      const J = _imp[i].copy(w.normal).scale(acc * CAR.MASS * dt);
      // apply at contact point, vertical lever removed to avoid tipping artefacts
      const relApp = _impRel[i].copy(w.point).sub(this.pos);
      relApp.addScaled(u, -relApp.dot(u));
      this.applyImpulse(J, relApp);
      if (w.onBall) {
        ball.vel.addScaled(J, -ball.invMass);
      }
    }

    // ---- ground driving
    let throttle = c.throttle;
    const boosting = this.updateBoost(dt);
    if (boosting) throttle = 1;
    if (surf > 0) {
      const gn = this.groundNormal;
      const fwdG = _a.copy(f).addScaled(gn, -f.dot(gn)).normalize();
      const factor = surf / 4;
      const spd = this.vel.dot(fwdG);
      const aspd = Math.abs(spd);
      let driveAcc = 0, brakeAcc = 0;
      if (Math.abs(throttle) > 0.001) {
        if (throttle * spd < 0 && aspd > CAR.STOPPING_SPEED) brakeAcc = CAR.BRAKE_ACCEL;
        else driveAcc = throttle * DRIVE_ACCEL_CURVE.get(aspd);
      } else {
        brakeAcc = aspd < CAR.STOPPING_SPEED ? CAR.BRAKE_ACCEL : CAR.COAST_ACCEL;
      }
      // the powerslide makes braking weaker
      if (this.handbrakeVal > 0 && brakeAcc > 0 && Math.abs(throttle) < 0.001) brakeAcc *= 1 - this.handbrakeVal * 0.9;
      if (driveAcc !== 0) this.vel.addScaled(fwdG, driveAcc * factor * dt);
      if (brakeAcc > 0 && aspd > 0) {
        const dv = Math.min(brakeAcc * factor * dt, aspd);
        this.vel.addScaled(fwdG, -Math.sign(spd) * dv);
      }

      // ---- tyre lateral friction (Jacobi like Bullet's ray cast vehicle)
      const fullStick = Math.abs(throttle) > 0.001 || aspd > CAR.STOPPING_SPEED;
      for (let i = 0; i < 4; i++) {
        _imp[i].set(0, 0, 0);
        const w = this.wheels[i];
        if (!w.contact) continue;
        const n = w.normal;
        // wheel forward axis
        const wf = _b.copy(f);
        if (w.steer !== 0) { _q.setFromAxisAngle(u, -w.steer); wf.applyQuat(_q); }
        wf.addScaled(n, -wf.dot(n)).normalize();
        const side = _d.crossVectors(n, wf).normalize();
        const rel = _impRel[i].copy(w.point).sub(this.pos);
        rel.addScaled(u, -rel.dot(u));
        const pv = this.pointVelocity(rel, _c);
        if (w.onBall) {
          _n.copy(w.point).sub(ball.pos);
          pv.sub(_n.crossVectors(ball.angVel, _n).add(ball.vel));
        }
        const latVel = pv.dot(side), longVel = pv.dot(wf);
        const sum = Math.abs(latVel) + Math.abs(longVel);
        const slip = sum > 10 ? Math.abs(latVel) / sum : 0;
        let fric = LAT_FRICTION_CURVE.get(slip) * lerp(1, HANDBRAKE_LAT_FACTOR, this.handbrakeVal);
        if (!fullStick) fric *= NON_STICKY_FRICTION_CURVE.get(Math.abs(n.y));
        const k = this.effInvMass(rel, side);
        const j = -0.2 * fric * latVel / k;
        _imp[i].copy(side).scale(j);
      }
      for (let i = 0; i < 4; i++) {
        if (!this.wheels[i].contact) continue;
        this.applyImpulse(_imp[i], _impRel[i]);
        if (this.wheels[i].onBall) ball.vel.addScaled(_imp[i], -ball.invMass);
      }

      // ---- sticky force (lets cars drive on walls and ceiling)
      if (surf >= 3 && !this.isJumping) {
        let scale = 0.5;
        if (fullStick) scale += 1 - u.y;
        this.vel.addScaled(u, -GRAVITY * scale * dt);
      }
    }

    // ---- auto-roll: only some wheels touching -> align with surface
    if (surf > 0 && surf < 3 && !this.isJumping) {
      const gn = this.groundNormal;
      _a.crossVectors(u, gn); // axis to rotate u toward gn
      this.angVel.addScaled(_a, CAR.AUTOROLL_TORQUE * 0.0959 * dt * 3);
      this.vel.addScaled(gn, -CAR.AUTOROLL_FORCE * dt);
    }

    // ---- self-righting: lying on its side, the car tips back onto its wheels
    if (surf === 0 && this.bodyContact && !this.isJumping) {
      const n = this.bodyContactNormal;
      const d = u.dot(n);
      if (d > -0.55 && d < 0.8) {
        _a.crossVectors(u, n);
        const len = _a.length();
        if (len > 1e-3) {
          this.angVel.addScaled(_a, (CAR.SELF_RIGHT_TORQUE / len) * Math.min(1, len * 1.5) * dt);
          this.vel.addScaled(n, CAR.SELF_RIGHT_LIFT * dt);
        }
      }
    }

    this.updateJump(dt, u);
    this.updateFlipOrDoubleJump(dt, f, u);
    this.updateAirControl(dt, f, u, surf + onBall);

    // ---- auto flip (car on its roof)
    if (this.autoFlipTimer > 0) this.autoFlipTimer -= dt;
    if (c.jump && !this.lastControls.jump && surf === 0 && this.bodyContact && u.dot(this.bodyContactNormal) < -0.6) {
      this.vel.addScaled(this.bodyContactNormal, CAR.AUTOFLIP_IMPULSE * 1.4);
      const dir = r.dot(this.bodyContactNormal) > 0 ? 1 : -1; // roll toward the side facing up
      this.angVel.copy(f).scale(-dir * 7.5);
      this.autoFlipTimer = CAR.AUTOFLIP_TIME;
      this.events.push('jump');
    }

    // ---- boost & air throttle forces
    if (boosting) {
      this.vel.addScaled(f, (this.onGround ? CAR.BOOST_ACCEL_GROUND : CAR.BOOST_ACCEL_AIR) * dt);
    } else if (surf === 0 && onBall === 0) {
      this.vel.addScaled(f, c.throttle * CAR.THROTTLE_AIR_ACCEL * dt);
    }

    // ---- gravity
    this.vel.y -= GRAVITY * dt;

    // ---- supersonic
    const spd = this.vel.length();
    if (this.isSupersonic) {
      if (spd < CAR.SUPERSONIC_MAINTAIN) this.isSupersonic = false;
    } else if (spd >= CAR.SUPERSONIC_START) this.isSupersonic = true;
    this.supersonicTime = this.isSupersonic ? this.supersonicTime + dt : 0;

    this.lastControls.copy(c);
  }

  updateBoost(dt) {
    const c = this.controls;
    const canBoost = this.infiniteBoost || this.boost > 0;
    if (this.isBoosting) {
      if ((!c.boost && this.boostingTime >= CAR.BOOST_MIN_TIME) || !canBoost) this.isBoosting = false;
    } else if (c.boost && canBoost) {
      this.isBoosting = true; this.boostingTime = 0;
    }
    if (this.isBoosting) {
      this.boostingTime += dt;
      if (!this.infiniteBoost) {
        const used = Math.min(this.boost, CAR.BOOST_PER_SECOND * dt);
        this.boost -= used; this.stats.boostUsed += used;
      }
    }
    return this.isBoosting;
  }

  updateJump(dt, u) {
    const c = this.controls;
    if (this.onGround && !this.isJumping) {
      if (this.hasJumped && this.jumpTime < CAR.JUMP_MIN_TIME + CAR.JUMP_RESET_PAD) {
        // too early to reset
      } else {
        this.hasJumped = false; this.jumpTime = 0;
      }
    }
    if (this.isJumping) {
      if (this.jumpTime < CAR.JUMP_MIN_TIME || (c.jump && this.jumpTime < CAR.JUMP_MAX_TIME)) {
        this.isJumping = true;
      } else this.isJumping = false;
    } else if (this.onGround && c.jump && !this.lastControls.jump) {
      this.isJumping = true; this.jumpTime = 0; this.hasJumped = true;
      this.vel.addScaled(u, CAR.JUMP_IMMEDIATE);
      this.events.push('jump');
    }
    if (this.isJumping) {
      this.hasJumped = true;
      this.vel.addScaled(u, CAR.JUMP_ACCEL * dt);
      this.jumpTime += dt;
    } else if (this.hasJumped) {
      this.jumpTime += dt;
    }
  }

  updateFlipOrDoubleJump(dt, f, u) {
    const c = this.controls;
    if (this.onGround) {
      this.hasDoubleJumped = false; this.hasFlipped = false;
      this.airTime = 0; this.airTimeSinceJump = 0;
      if (this.flipTime > 0.1) this.isFlipping = false;
    } else {
      this.airTime += dt;
      if (this.hasJumped && !this.isJumping) this.airTimeSinceJump += dt;
      else this.airTimeSinceJump = 0;

      if (c.jump && !this.lastControls.jump && this.airTimeSinceJump < CAR.DOUBLEJUMP_MAX_DELAY &&
          !this.isJumping && !this.hasDoubleJumped && !this.hasFlipped && this.autoFlipTimer <= 0) {
        const mag = Math.abs(c.yaw) + Math.abs(c.pitch) + Math.abs(c.roll);
        if (mag >= CAR.DODGE_DEADZONE) this.startFlip(f, u);
        else {
          this.vel.addScaled(u, CAR.JUMP_IMMEDIATE);
          this.hasDoubleJumped = true;
          this.events.push('doubleJump');
        }
      }
    }

    if (this.isFlipping) {
      this.flipTime += dt;
      if (this.flipTime <= CAR.FLIP_TORQUE_TIME) {
        // Z damping: the flip "stalls" vertical motion
        if (this.flipTime < CAR.FLIP_Z_DAMP_END && (this.vel.y < 0 || this.flipTime < CAR.FLIP_Z_DAMP_START)) {
          this.vel.y *= Math.pow(1 - CAR.FLIP_Z_DAMP_120, dt * 120);
        }
      } else if (this.flipTime > CAR.FLIP_TORQUE_TIME) {
        this.isFlipping = false;
      }
    }
  }

  startFlip(f, u) {
    const c = this.controls;
    this.isFlipping = true; this.flipTime = 0; this.hasFlipped = true;
    let dx = -c.pitch, dy = c.yaw + c.roll;
    if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) { dx = 0; dy = 0; }
    const len = Math.hypot(dx, dy);
    if (len > 0) { dx /= len; dy /= len; }
    if (Math.abs(dx) < 0.1) dx = 0;
    if (Math.abs(dy) < 0.1) dy = 0;
    this.hasFlipDir = dx !== 0 || dy !== 0;
    // local torque direction: roll (x) from side input, pitch (z) from forward input
    this.flipRelTorque.set(dy, 0, -dx);
    this.events.push('flip');
    if (!this.hasFlipDir) return;

    // horizontal (yaw-only) basis
    const f2 = _a.set(f.x, 0, f.z);
    if (f2.lengthSq() < 1e-4) f2.set(-u.x, 0, -u.z).scale(Math.sign(f.y) || 1);
    f2.normalize();
    const r2 = _b.set(-f2.z, 0, f2.x); // right of f2 (y up): rotate +90° toward +Z
    const forwardSpeed = this.vel.dot(f2);
    const ratio = Math.abs(forwardSpeed) / CAR.MAX_SPEED;
    const backwards = Math.abs(forwardSpeed) < 100 ? dx < 0 : (dx >= 0) !== (forwardSpeed >= 0);
    let vx = dx * CAR.FLIP_INITIAL_VEL, vy = dy * CAR.FLIP_INITIAL_VEL;
    const maxScaleX = backwards ? CAR.FLIP_BACKWARD_SCALE : CAR.FLIP_FORWARD_SCALE;
    vx *= (maxScaleX - 1) * ratio + 1;
    vy *= (CAR.FLIP_SIDE_SCALE - 1) * ratio + 1;
    if (backwards) vx *= CAR.FLIP_BACKWARD_X_SCALE;
    this.vel.addScaled(f2, vx).addScaled(r2, vy);
  }

  updateAirControl(dt, f, u, contacts) {
    const c = this.controls;
    if (contacts > 0) return;
    let pitch = c.pitch, yaw = c.yaw, roll = c.roll;
    if (c.airRoll) { if (roll === 0) roll = yaw; yaw = 0; }

    const wl = _c.copy(this.angVel).applyQuatInv(this.rot); // x roll, y yaw(left+), z pitch(nose up +)
    const T = CAR.AIR_TORQUE, D = CAR.AIR_DAMP;
    let ax = 0, ay = 0, az = 0;
    let pitchScale = 1;
    const flipActive = this.isFlipping && this.hasFlipDir && this.flipTime <= CAR.FLIP_TORQUE_TIME;
    let tRoll = 0;
    if (flipActive) {
      let tPitch = this.flipRelTorque.z;
      tRoll = this.flipRelTorque.x;
      if (tPitch !== 0) {
        // flip cancel: pitch input opposite to the dodge's pitch direction scales its torque down
        if (pitch !== 0 && Math.sign(tPitch) !== Math.sign(pitch)) tPitch *= 1 - Math.min(Math.abs(pitch), 1);
        else pitchScale = 0; // pitch lock during the dodge
      }
      ax += tRoll * CAR.FLIP_TORQUE_ROLL;
      az += tPitch * CAR.FLIP_TORQUE_PITCH;
    }
    // player torque
    ax += roll * T.roll;
    ay += -yaw * T.yaw;
    az += pitch * T.pitch * pitchScale;
    // damping (disabled on the axes driven by an active dodge)
    if (!(flipActive && tRoll !== 0)) ax -= wl.x * D.roll;
    ay -= wl.y * D.yaw * (1 - Math.abs(yaw));
    if (!flipActive) az -= wl.z * D.pitch * (1 - Math.abs(pitch));
    _d.set(ax, ay, az).applyQuat(this.rot);
    this.angVel.addScaled(_d, dt);
  }

  clampVelocities() {
    this.vel.clampLength(CAR.MAX_SPEED);
    // During the dodge the spin can exceed the normal cap so that a flip completes a
    // full rotation (~0.65 s) like in the original game.
    const dodging = this.isFlipping && this.hasFlipDir && this.flipTime <= CAR.FLIP_TORQUE_TIME;
    this.angVel.clampLength(dodging ? CAR.FLIP_MAX_ANG_SPEED : CAR.MAX_ANG_SPEED);
  }

  integratePositions(dt) {
    if (this.demolished || this.frozen) return;
    this.clampVelocities();
    this.pos.addScaled(this.vel, dt);
    this.rot.integrate(this.angVel, dt);
  }

  demolish() {
    this.demolished = true;
    this.respawnTimer = CAR.DEMO_RESPAWN_TIME;
    this.vel.set(0, 0, 0); this.angVel.set(0, 0, 0);
    this.isBoosting = false;
  }
}
