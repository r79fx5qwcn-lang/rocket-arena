// Bot AI. Bots only drive through the same Controls a human uses: they obey
// exactly the same physics (no cheating). Features: kickoffs, ball prediction &
// intercepts, aimed shots, jump shots, dodges into the ball, aerials, defence,
// rotations (attacker / support / goalkeeper), boost collection, recovery.
import { Vec3, clamp } from '../physics/math.js';
import { ARENA, BALL, CAR, GRAVITY, BOOST_PADS } from '../physics/constants.js';

export const DIFFICULTY = {
  rookie: { label: 'Débutant', throttle: 0.75, boost: false, jumpShots: false, dodges: false, aerials: false, maxAerial: 0, aimError: 500, reaction: 0.35, kickoffFlip: false, speedMul: 1.6 },
  pro: { label: 'Pro', throttle: 1, boost: true, jumpShots: true, dodges: true, aerials: true, maxAerial: 900, aimError: 180, reaction: 0.12, kickoffFlip: true, speedMul: 1.2 },
  allstar: { label: 'All-Star', throttle: 1, boost: true, jumpShots: true, dodges: true, aerials: true, maxAerial: 1700, aimError: 60, reaction: 0.04, kickoffFlip: true, speedMul: 1.05 },
};

const _l = new Vec3(), _a = new Vec3(), _b = new Vec3(), _t = new Vec3(), _f = new Vec3(), _u = new Vec3(), _r = new Vec3();

function toLocal(car, p, out) { return out.copy(p).sub(car.pos).applyQuatInv(car.rot); }

export class BotController {
  constructor(car, world, shared, difficulty = 'pro') {
    this.car = car;
    this.world = world;
    this.shared = shared; // { predictor, slices, kickoff, teams }
    this.diff = DIFFICULTY[difficulty] || DIFFICULTY.pro;
    this.state = 'drive';
    this.timer = 0;
    this.seq = null; // scripted sequence (jump/dodge/aerial)
    this.stuckTime = 0;
    this.aimJitter = new Vec3();
    this.rejitter = 0;
    this.target = new Vec3();
    this.role = 'attack';
    car.isBot = true;
  }

  get attackSign() { return this.car.team === 0 ? 1 : -1; }

  reset() { this.seq = null; this.state = 'drive'; this.stuckTime = 0; }

  update(dt) {
    const car = this.car, c = car.controls;
    c.reset();
    if (car.demolished) return;
    this.timer += dt;
    this.rejitter -= dt;
    if (this.rejitter <= 0) {
      this.rejitter = 1.5;
      const e = this.diff.aimError;
      this.aimJitter.set((Math.random() - 0.5) * e, 0, 0);
    }
    // running scripted sequences (dodges, aerials)
    if (this.seq) {
      const done = this.seq(dt);
      if (!done) return;
      this.seq = null;
    }
    // airborne without a sequence: recover
    if (!car.onGround && car.surfaceContacts === 0) { this.recover(dt); return; }

    const ball = this.world.ball;
    if (this.shared.kickoff && this.isKickoffTaker()) { this.kickoff(dt); return; }

    this.chooseRole();
    if (this.role === 'attack') this.attack(dt);
    else if (this.role === 'goalie') this.goalie(dt);
    else this.support(dt);

    // anti stuck
    if (Math.abs(c.throttle) > 0.5 && car.vel.length() < 60 && car.onGround) this.stuckTime += dt; else this.stuckTime = 0;
    if (this.stuckTime > 1.2) {
      this.stuckTime = 0;
      this.startSequence(this.jumpSeq(0.1));
    }
  }

  // ---------- roles ----------
  isKickoffTaker() {
    const mates = this.world.cars.filter((o) => o.team === this.car.team && !o.demolished);
    let best = null, bd = 1e9;
    for (const m of mates) {
      const d = Math.hypot(m.pos.x, m.pos.z) + m.pos.x * 0.001; // tie break left/right
      if (d < bd) { bd = d; best = m; }
    }
    return best === this.car;
  }

  chooseRole() {
    const car = this.car, ball = this.world.ball;
    const mates = this.world.cars.filter((o) => o.team === car.team && !o.demolished);
    if (mates.length === 1) { this.role = this.shouldDefend() ? 'goalie' : 'attack'; if (this.role === 'goalie' && this.closeToBallFirst()) this.role = 'attack'; return; }
    // the teammate with the best (onside) time to the ball attacks
    const own = -this.attackSign * ARENA.HALF_L;
    const score = (m) => {
      const d = m.pos.distanceTo(ball.pos);
      const behind = (ball.pos.z - m.pos.z) * this.attackSign; // >0 when the car is behind the ball (good)
      return d / 1400 - (behind > 0 ? 0.4 : -0.6) + (m.boost < 15 ? 0.2 : 0);
    };
    const sorted = mates.slice().sort((a, b) => score(a) - score(b));
    const idx = sorted.indexOf(car);
    if (idx === 0) this.role = 'attack';
    else if (idx === sorted.length - 1 && Math.abs(ball.pos.z - own) < 7000) this.role = 'goalie';
    else this.role = 'support';
  }

  shouldDefend() {
    const ball = this.world.ball, car = this.car, s = this.attackSign;
    // ball moving fast toward our goal and we are on the wrong side
    const towards = -ball.vel.z * s;
    const carAhead = (car.pos.z - ball.pos.z) * s > 400;
    return towards > 800 && carAhead;
  }

  closeToBallFirst() {
    const ball = this.world.ball;
    return this.car.pos.distanceTo(ball.pos) < 900;
  }

  // ---------- behaviours ----------
  attack(dt) {
    const car = this.car;
    const slices = this.shared.slices;
    const s = this.attackSign;
    const oppGoal = _t.set(this.aimJitter.x, 0, s * (ARENA.HALF_L + 300));
    const speed = car.vel.length();
    let chosen = null;
    let aerial = false;
    for (let i = 0; i < slices.length; i += 2) {
      const sl = slices[i];
      const h = sl.pos.y;
      const dist = Math.hypot(sl.pos.x - car.pos.x, sl.pos.z - car.pos.z) - 150;
      const tReach = this.timeToReach(Math.max(0, dist), speed);
      if (h < 260) { if (tReach <= sl.t) { chosen = sl; break; } continue; }
      if (h < 420 && this.diff.jumpShots && tReach + 0.15 <= sl.t) { chosen = sl; break; }
      if (this.diff.aerials && h < this.diff.maxAerial && car.boost > 25 && car.onGround && sl.t > 0.6) {
        const need = this.aerialFeasible(sl);
        if (need) { chosen = sl; aerial = true; break; }
      }
    }
    if (!chosen) chosen = slices[Math.min(slices.length - 1, 90)] || { pos: this.world.ball.pos, t: 1.5 };

    // shot direction: toward the goal, or away from our own goal when defending deep
    const bp = chosen.pos;
    const shot = _a.copy(oppGoal).sub(bp); shot.y = 0; shot.normalize();
    const nearOwn = (bp.z * s) < -(ARENA.HALF_L - 1800);
    if (nearOwn) { shot.set(Math.sign(bp.x || 1) * 0.8, 0, s * 0.6).normalize(); }
    // aim far behind the ball when far (alignment), converge to the ball when close (contact)
    const dBall = Math.hypot(bp.x - car.pos.x, bp.z - car.pos.z);
    const offset = clamp(dBall * 0.4, 40, 700);
    const target = _b.copy(bp).addScaled(shot, -offset);
    target.y = car.pos.y;

    if (aerial) { this.startSequence(this.aerialSeq(chosen)); return; }

    // approach: avoid hitting the ball toward our own goal: if we're in front of the ball, go around
    const carBehind = (bp.z - car.pos.z) * s;
    if (carBehind < -200 && !nearOwn) {
      // go back toward own side, offset sideways
      target.set(bp.x + (car.pos.x > bp.x ? 700 : -700), car.pos.y, bp.z - s * 900);
    }
    const dist = Math.hypot(target.x - car.pos.x, target.z - car.pos.z);
    const tLeft = Math.max(0.05, chosen.t);
    let desiredSpeed = clamp(dist / tLeft * 1.1, 400, 2300);
    // well lined up behind the ball: go for a powerful shot
    _f.set(bp.x - car.pos.x, 0, bp.z - car.pos.z).normalize();
    if (_f.dot(shot) > 0.75 && dist < 2500) desiredSpeed = 2300;
    this.driveTo(target, desiredSpeed, dt);

    // jump shots
    const ballD = car.pos.distanceTo(bp);
    const local = toLocal(car, this.world.ball.pos, _l);
    if (this.diff.jumpShots && chosen.pos.y > 200 && chosen.t < 0.45 && chosen.t > 0.2 && Math.abs(Math.atan2(local.z, local.x)) < 0.4) {
      this.startSequence(this.jumpShotSeq(chosen.pos.y > 320));
      return;
    }
    // dodge into the ball for power
    if (this.diff.dodges && car.onGround && this.world.ball.pos.y < 200 && ballD < 420 && speed > 900 &&
        local.x > 0 && Math.abs(Math.atan2(local.z, local.x)) < 0.35) {
      this.startSequence(this.dodgeSeq(local.z / Math.max(1, Math.abs(local.x)) * 0.6, -1));
    }
  }

  support(dt) {
    const car = this.car, ball = this.world.ball, s = this.attackSign;
    // collect boost if low
    if (car.boost < 40 && this.diff.boost) {
      const pad = this.nearestBigPad();
      if (pad) { this.driveTo(_b.set(pad.x, car.pos.y, pad.z), 2300, 0); return; }
    }
    // shadow position: between ball and own goal, a bit off-center
    const tz = clamp(ball.pos.z - s * 2600, -ARENA.HALF_L + 900, ARENA.HALF_L - 900);
    const tx = clamp(ball.pos.x * 0.5, -2500, 2500);
    const target = _b.set(tx, car.pos.y, tz);
    const d = Math.hypot(target.x - car.pos.x, target.z - car.pos.z);
    if (d < 300) { this.faceTo(ball.pos); return; }
    this.driveTo(target, clamp(d * 1.2, 300, 2000), 0);
  }

  goalie(dt) {
    const car = this.car, ball = this.world.ball, s = this.attackSign;
    const goalZ = -s * (ARENA.HALF_L - 150);
    // if the ball is coming in close, go challenge it
    const ballDistOwn = Math.abs(ball.pos.z - goalZ);
    if (ballDistOwn < 2200 && ball.pos.y < 600) { this.attack(dt); return; }
    const target = _b.set(clamp(ball.pos.x * 0.3, -700, 700), car.pos.y, goalZ);
    const d = Math.hypot(target.x - car.pos.x, target.z - car.pos.z);
    if (d < 250) { this.faceTo(ball.pos); return; }
    // drive back to goal (allow reversing when close and facing the ball)
    this.driveTo(target, clamp(d * 1.3, 400, 2300), 0);
  }

  kickoff(dt) {
    const car = this.car, ball = this.world.ball;
    const c = car.controls;
    const d = car.pos.distanceTo(ball.pos);
    _b.copy(ball.pos); _b.y = car.pos.y;
    // aim slightly off-center so the hit goes toward the opponent half
    _b.z -= this.attackSign * 40;
    this.driveTo(_b, 2300, dt, true);
    c.boost = true; c.throttle = 1;
    if (this.diff.kickoffFlip && d < 760 && car.onGround) {
      this.startSequence(this.dodgeSeq(0, -1));
    }
  }

  // ---------- low level ----------
  timeToReach(dist, speed) {
    const boosting = this.diff.boost && this.car.boost > 10;
    const vmax = boosting ? 2300 : 1410 * this.diff.throttle;
    const acc = boosting ? 2200 : 1100;
    const v0 = Math.min(speed, vmax);
    const tAcc = (vmax - v0) / acc;
    const dAcc = v0 * tAcc + 0.5 * acc * tAcc * tAcc;
    const base = dist <= dAcc ? (-v0 + Math.sqrt(v0 * v0 + 2 * acc * dist)) / acc : tAcc + (dist - dAcc) / vmax;
    return base * this.diff.speedMul + this.diff.reaction;
  }

  driveTo(target, desiredSpeed, dt, forceBoost = false) {
    const car = this.car, c = car.controls;
    const local = toLocal(car, target, _l);
    const angle = Math.atan2(local.z, local.x); // + = target on the right
    const fwdSpeed = car.forwardSpeed;
    const dist = Math.hypot(local.x, local.z);
    // reverse when the target is right behind and close
    if (Math.abs(angle) > 2.5 && dist < 900 && fwdSpeed < 300) {
      c.throttle = -1;
      c.steer = clamp(-Math.sign(angle) * (Math.PI - Math.abs(angle)) * 3, -1, 1);
      return;
    }
    c.steer = clamp(angle * 3.2, -1, 1);
    // slow down for tight turns so the target is not orbited forever
    const aa = Math.abs(angle);
    if (aa > 0.25) desiredSpeed = Math.min(desiredSpeed, clamp((dist / (aa + 0.15)) * 0.9, 350, 2300));
    const speedErr = desiredSpeed - fwdSpeed;
    c.throttle = clamp(speedErr / 300, -1, 1) * this.diff.throttle;
    if (fwdSpeed < 200 && speedErr > 0) c.throttle = this.diff.throttle;
    c.handbrake = Math.abs(angle) > 1.7 && fwdSpeed > 500 && car.onGround;
    const wantBoost = this.diff.boost && (forceBoost || (speedErr > 350 && Math.abs(angle) < 0.35 && fwdSpeed < 2250));
    c.boost = wantBoost && car.boost > 0 && car.onGround;
  }

  faceTo(p) {
    const car = this.car, c = car.controls;
    const local = toLocal(car, p, _l);
    const angle = Math.atan2(local.z, local.x);
    if (Math.abs(angle) < 0.3) { c.throttle = 0; return; }
    c.steer = Math.sign(angle);
    c.throttle = Math.abs(angle) > 2 ? -0.6 : 0.6;
  }

  nearestBigPad() {
    let best = null, bd = 1e9;
    const s = this.attackSign;
    for (const p of this.world.pads.pads) {
      if (!p.active || !p.big) continue;
      if (p.z * s > 1000) continue; // stay on our half
      const d = Math.hypot(p.x - this.car.pos.x, p.z - this.car.pos.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  /** air orientation controller: point the nose to `fwd`, roof to `up` */
  orient(fwd, up) {
    const car = this.car, c = car.controls;
    const lf = _a.copy(fwd).applyQuatInv(car.rot);
    const lu = _b.copy(up).applyQuatInv(car.rot);
    const w = _r.copy(car.angVel).applyQuatInv(car.rot);
    const ePitch = Math.atan2(lf.y, lf.x);
    const eYaw = Math.atan2(lf.z, lf.x);
    const eRoll = Math.atan2(lu.z, lu.y);
    c.pitch = clamp(ePitch * 3.2 - w.z * 0.55, -1, 1);
    c.yaw = clamp(eYaw * 3.2 + w.y * 0.6, -1, 1);
    c.roll = clamp(eRoll * 2.5 - w.x * 0.35, -1, 1);
    return lf.x; // alignment (cos of the error)
  }

  recover() {
    const car = this.car;
    _f.set(car.vel.x, 0, car.vel.z);
    if (_f.lengthSq() < 100) car.forward(_f).y = 0;
    if (_f.lengthSq() < 1e-6) _f.set(0, 0, this.attackSign);
    _f.normalize();
    this.orient(_f, _u.set(0, 1, 0));
    car.controls.throttle = 1;
  }

  startSequence(seq) { this.seq = seq; }

  jumpSeq(holdTime) {
    let t = 0;
    return (dt) => { t += dt; this.car.controls.jump = t < holdTime; return t > holdTime + 0.05; };
  }

  dodgeSeq(side, pitch) {
    let t = 0;
    return (dt) => {
      const c = this.car.controls; t += dt;
      c.throttle = 1;
      if (t < 0.07) { c.jump = true; }
      else if (t < 0.12) { c.jump = false; }
      else if (t < 0.17) { c.jump = true; c.pitch = pitch; c.yaw = clamp(side, -1, 1); }
      else { c.jump = false; c.pitch = pitch * 0.5; }
      return t > 0.9 || (t > 0.35 && this.car.onGround);
    };
  }

  jumpShotSeq(doubleJump) {
    let t = 0;
    return (dt) => {
      const c = this.car.controls; t += dt;
      c.throttle = 1;
      c.jump = t < 0.2 || (doubleJump && t > 0.25 && t < 0.3);
      const ball = this.world.ball;
      const local = toLocal(this.car, ball.pos, _l);
      // flip into the ball when close for power
      if (this.diff.dodges && t > 0.32 && !this.car.hasFlipped && this.car.pos.distanceTo(ball.pos) < 260) {
        c.jump = true; c.pitch = -1; c.yaw = clamp(local.z / 120, -1, 1);
      }
      return t > 1.4 || (t > 0.4 && this.car.onGround);
    };
  }

  aerialFeasible(sl) {
    const car = this.car;
    // time to rise: approx with jump + boost
    const h = sl.pos.y - car.pos.y;
    const horiz = Math.hypot(sl.pos.x - car.pos.x, sl.pos.z - car.pos.z);
    const tNeeded = 0.35 + Math.sqrt((h * h + horiz * horiz)) / 1500 * 1.0;
    return Math.abs(tNeeded - sl.t) < 0.25 && sl.t < 2.6;
  }

  aerialSeq(slice) {
    let t = 0;
    const target = slice.pos.clone();
    const tArrive = slice.t;
    const s = this.attackSign;
    // aim behind the ball relative to the opponent goal
    const goal = new Vec3(0, 300, s * ARENA.HALF_L);
    const dir = goal.clone().sub(target).normalize();
    target.addScaled(dir, -110);
    return (dt) => {
      const car = this.car, c = car.controls; t += dt;
      const T = Math.max(0.05, tArrive - t);
      // required average acceleration to reach target at T
      const need = _a.copy(target).sub(car.pos).addScaled(car.vel, -T);
      need.y += 0.5 * GRAVITY * T * T;
      const accNeeded = need.length() / (0.5 * T * T);
      need.normalize();
      c.jump = t < 0.2 || (t > 0.25 && t < 0.29);
      const up = _u.set(0, 1, 0);
      const align = this.orient(_t.copy(need), up);
      c.boost = align > 0.85 && accNeeded > 300 && car.boost > 0;
      c.throttle = 1;
      if (t > 0.24 && t < 0.3) { c.pitch = 0; c.yaw = 0; c.roll = 0; } // clean double jump (no dodge)
      if (t > 0.3 && car.pos.distanceTo(this.world.ball.pos) < 230 && !car.hasFlipped && this.diff.dodges) {
        c.jump = true; c.pitch = -1;
      }
      return t > tArrive + 0.6 || (t > 0.5 && car.onGround) || car.boost <= 0 && t > 1.2;
    };
  }
}
