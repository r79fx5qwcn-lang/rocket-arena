// Rocket League style camera: car cam + ball cam, smooth, never jerky.
import * as THREE from 'three';
import { UU_TO_M as S } from '../physics/constants.js';
import { arenaSdf, arenaNormal } from '../physics/Arena.js';
import { Vec3 } from '../physics/math.js';

const _dir = new THREE.Vector3(), _f = new THREE.Vector3(), _target = new THREE.Vector3(), _desired = new THREE.Vector3();
const _look = new THREE.Vector3(), _tmp = new THREE.Vector3(), _q = new THREE.Quaternion();
const _nrm = new Vec3();
const _step = new THREE.Vector3(), _carD = new THREE.Vector3(), _camUp = new THREE.Vector3(), _fw = new THREE.Vector3();
const _vp = new THREE.Vector3();
const _off = new THREE.Vector3(), _ax = new THREE.Vector3(), _q2 = new THREE.Quaternion();
const _cand = new THREE.Vector3(), _toCar = new THREE.Vector3(), _axis = new THREE.Vector3();
const _alt = new THREE.Vector3(), _up = new THREE.Vector3(), _anchor = new THREE.Vector3(), _seg = new THREE.Vector3(), _probe = new THREE.Vector3();

/**
 * Rotates unit vector v toward unit vector target by the fraction k of the angle between
 * them (a lerp would pass through zero when they are opposite, e.g. floor <-> ceiling).
 */
function turnToward(v, target, k, fallbackAxis) {
  const d = THREE.MathUtils.clamp(v.dot(target), -1, 1);
  const ang = Math.acos(d);
  if (ang < 1e-4) { v.copy(target); return; }
  _ax.crossVectors(v, target);
  if (_ax.lengthSq() < 1e-8) {
    // opposite vectors: turn around the viewing direction (or any perpendicular axis)
    _ax.copy(fallbackAxis).addScaledVector(v, -fallbackAxis.dot(v));
    if (_ax.lengthSq() < 1e-8) { _ax.set(1, 0, 0).addScaledVector(v, -v.x); if (_ax.lengthSq() < 1e-8) _ax.set(0, 0, 1); }
  }
  _ax.normalize();
  _q2.setFromAxisAngle(_ax, ang * k);
  v.applyQuaternion(_q2).normalize();
}

export class CameraController {
  constructor(camera, settings) {
    this.camera = camera;
    this.settings = settings;
    this.dir = new THREE.Vector3(0, 0, 1); // viewing direction (perpendicular to up)
    this.up = new THREE.Vector3(0, 1, 0);
    this.off = new THREE.Vector3(0, 1, 0); // side of the car the camera sits on
    this.prevCar = new THREE.Vector3();
    this.surfN = new THREE.Vector3(0, 1, 0); this.airT = 1;
    this.lookDir = new THREE.Vector3(0, 0, 1); this.snapLook = true;
    this.bpitch = 0;      // ball cam: elevation of the car -> ball direction
    this.velS = new THREE.Vector3(); // smoothed car velocity (m/s)
    this.bob = 0;         // vertical lag absorbing the car's small bounces
    this.camUp = new THREE.Vector3(0, 1, 0);
    this.view = new THREE.Vector3(0, 0, 1);
    this.pos = new THREE.Vector3(0, 5, -10);
    this.lookAt = new THREE.Vector3();
    this.swivel = 0; this.swivelPitch = 0;
    this.shakeAmp = 0;
    this.mode = 'follow';
    this.orbit = { center: new THREE.Vector3(), radius: 14, height: 5, angle: 0, speed: 0.25 };
    this.fovKick = 0;
    this.initialized = false;
    this.ballCamBlend = 1;
  }

  shake(amount) { this.shakeAmp = Math.min(1.2, this.shakeAmp + amount); }

  setOrbit(center, radius = 14, height = 5, speed = 0.25) {
    this.mode = 'orbit';
    this.orbit.center.copy(center); this.orbit.radius = radius; this.orbit.height = height; this.orbit.speed = speed;
    this.orbit.angle = Math.atan2(this.pos.x - center.x, this.pos.z - center.z);
  }

  follow() { this.mode = 'follow'; }

  /** broadcast-style replay camera; goalSide = sign of the z of the goal being scored into */
  setReplay(goalSide) {
    this.mode = 'replay';
    this.replaySide = goalSide;
    this.replaySideX = Math.random() < 0.5 ? -1 : 1;
    this.replayInit = false;
  }

  snap() { this.initialized = false; }

  updateFov(aspect, extra = 0) {
    const hfov = THREE.MathUtils.degToRad(this.settings.fov + extra);
    const v = 2 * Math.atan(Math.tan(hfov / 2) / aspect);
    const vdeg = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(v), 30, 100);
    if (Math.abs(this.camera.fov - vdeg) > 0.01) { this.camera.fov = vdeg; this.camera.updateProjectionMatrix(); }
  }

  /**
   * carPos/ballPos in render units (m). carQuat THREE.Quaternion. carVel in uu/s (physics Vec3)
   */
  update(dt, ctx) {
    const st = this.settings;
    const cam = this.camera;
    this.fovKick += ((ctx.boosting ? 2 : 0) + (ctx.supersonic ? 3 : 0) - this.fovKick) * (1 - Math.exp(-dt * 1.5));
    this.updateFov(cam.aspect, this.fovKick);

    if (this.mode === 'replay') {
      const b = ctx.replayBall;
      _desired.set(b.x + this.replaySideX * 7, Math.max(b.y, 1) + 3.2, b.z - this.replaySide * 11);
      _anchor.copy(b); _anchor.y = Math.max(b.y, 1.5);
      this.clampInside(_desired, _anchor);
      if (!this.replayInit) { this.pos.copy(_desired); this.lookAt.copy(b); this.replayInit = true; }
      this.pos.lerp(_desired, 1 - Math.exp(-dt * 2.2));
      this.lookAt.lerp(b, 1 - Math.exp(-dt * 6));
      this.up.set(0, 1, 0); this.camUp.set(0, 1, 0); cam.up.set(0, 1, 0);
      cam.position.copy(this.pos);
      cam.lookAt(this.lookAt);
      return;
    }
    if (this.mode === 'orbit') {
      const o = this.orbit;
      o.angle += o.speed * dt;
      _desired.set(o.center.x + Math.sin(o.angle) * o.radius, o.center.y + o.height, o.center.z + Math.cos(o.angle) * o.radius);
      this.clampInside(_desired, o.center);
      const k = 1 - Math.exp(-dt * 3);
      this.pos.lerp(_desired, k);
      this.lookAt.lerp(o.center, k);
      this.up.set(0, 1, 0); this.camUp.set(0, 1, 0);
      cam.up.set(0, 1, 0);
      cam.position.copy(this.pos);
      cam.lookAt(this.lookAt);
      return;
    }

    const carPos = ctx.carPos, ballPos = ctx.ballPos;
    // ---- two reference vectors:
    //  - `off`: side of the car the camera sits on = the surface the car drives on (floor,
    //    wall, ceiling), world up in the air. This keeps the camera inside the arena.
    //  - `up`: the camera's own up. Surface normal on walls, but WORLD up on the floor, in the
    //    air and on the ceiling: on the ceiling the picture stays the right way up (the car is
    //    seen from below) and nothing flips when the car drops off.
    _up.set(0, 1, 0); _off.set(0, 1, 0);
    // the surface is remembered for a moment after the wheels leave it (bumps, small hops,
    // wheels flickering on a ramp): the camera frame does not wobble
    if (ctx.onSurface) {
      this.airT = 0;
      if (ctx.groundNormal) this.surfN.set(ctx.groundNormal.x, ctx.groundNormal.y, ctx.groundNormal.z).normalize();
      else this.surfN.set(0, 1, 0).applyQuaternion(ctx.carQuat);
    } else this.airT += dt;
    // Ball cam works in the world frame, like in Rocket League (no tilt on walls / ceiling)
    if (this.airT < 0.3) {
      _off.copy(this.surfN);
      if (_off.y > 0.8) _off.set(0, 1, 0); // flat-ish floor: keep a level horizon
      if (ctx.ballCam) { /* picture stays level, only the camera's side follows the surface */ }
      else if (_off.y > -0.3) _up.copy(_off);
      else {
        // wall -> ceiling: blend from the (horizontal) wall normal to world up
        const t = Math.min(1, (-_off.y - 0.3) / 0.5);
        _tmp.set(_off.x, 0, _off.z);
        if (_tmp.lengthSq() > 1e-6) _tmp.normalize();
        _up.set(_tmp.x * (1 - t), t, _tmp.z * (1 - t));
        if (_up.lengthSq() < 1e-6) _up.set(0, 1, 0);
        _up.normalize();
      }
    }
    if (!this.initialized) { this.up.copy(_up); this.off.copy(_off); }
    turnToward(this.up, _up, 1 - Math.exp(-dt * 4), this.dir);
    turnToward(this.off, _off, 1 - Math.exp(-dt * 5), this.dir);
    const up = this.up, off = this.off;

    // ---- desired viewing direction, in the plane perpendicular to `up`
    this.ballCamBlend += ((ctx.ballCam ? 1 : 0) - this.ballCamBlend) * (1 - Math.exp(-dt * 6));
    let ballW = 1;
    if (ctx.ballCam) {
      _dir.copy(ballPos).sub(carPos);
      // ball (almost) right above the car — dribbles, flicks, air dribbles: its horizontal
      // direction is meaningless, so keep the previous heading instead of spinning around
      const vert = _dir.dot(up);
      const horiz = Math.sqrt(Math.max(0, _dir.lengthSq() - vert * vert));
      ballW = THREE.MathUtils.clamp((horiz - 1.5) / 4.5, 0, 1); // 1.5 m .. 6 m
      ballW = ballW * ballW * (3 - 2 * ballW);
      if (ballW < 1 && this.initialized) {
        _dir.addScaledVector(up, -vert);
        if (_dir.lengthSq() > 1e-6) _dir.normalize();
        _dir.multiplyScalar(ballW).addScaledVector(this.dir, 1 - ballW);
      }
    } else {
      _dir.set(1, 0, 0).applyQuaternion(ctx.carQuat);
      const along = Math.abs(_dir.dot(up));
      if (ctx.dodging) {
        // during a flip / flick the nose sweeps through the vertical: keep the view steady
        _dir.copy(this.dir);
      } else if (along > 0.75) {
        // nose pointing up/down (aerial, wall transition): keep the previous heading
        _dir.copy(this.dir);
      }
    }
    _dir.addScaledVector(up, -_dir.dot(up));
    if (_dir.lengthSq() < 1e-4) _dir.copy(this.dir);
    _dir.normalize();
    // keep the previous direction in the new plane
    this.dir.addScaledVector(up, -this.dir.dot(up));
    if (this.dir.lengthSq() < 1e-4 || !this.initialized) this.dir.copy(_dir);
    this.dir.normalize();
    // rotate smoothly toward the target around `up` (handles 180° turns)
    let rate = THREE.MathUtils.lerp(3.5, 16, st.stiffness);
    if (ctx.airborne && !ctx.ballCam) rate *= 0.5;
    _tmp.crossVectors(this.dir, _dir);
    const ang = Math.atan2(_tmp.dot(up), this.dir.dot(_dir));
    const maxStep = (ctx.ballCam ? 2.6 : 4.5) * dt; // rad/s cap: no sudden whip-pans
    _q.setFromAxisAngle(up, THREE.MathUtils.clamp(ang * (1 - Math.exp(-dt * rate)), -maxStep, maxStep));
    this.dir.applyQuaternion(_q).normalize();

    // swivel (right stick / mouse)
    const sw = ctx.swivel || { x: 0, y: 0 };
    const swRate = 1 - Math.exp(-dt * st.swivelSpeed * 2);
    this.swivel += (sw.x * Math.PI * 0.95 - this.swivel) * swRate;
    this.swivelPitch += (sw.y * 0.6 - this.swivelPitch) * swRate;
    _q.setFromAxisAngle(up, -this.swivel);
    const view = _f.copy(this.dir).applyQuaternion(_q);
    this.view.copy(view);

    // ---- position
    const speed = ctx.carVel.length();
    const dist = st.distance * S * (1 + Math.min(1, speed / 2300) * 0.12);
    const height = st.height * S + this.swivelPitch * 2;
    _anchor.copy(carPos).addScaledVector(off, 1.1);
    if (arenaSdf(_anchor.x / S, _anchor.y / S, _anchor.z / S) > -90) {
      // car close to a wall/ceiling in the air: anchor the camera away from that surface
      arenaNormal(carPos.x / S, carPos.y / S, carPos.z / S, _nrm);
      _anchor.set(carPos.x + _nrm.x * 1.1, carPos.y + _nrm.y * 1.1, carPos.z + _nrm.z * 1.1);
    }
    // "behind the car" is measured along the surface the camera sits over (`off`), so that on
    // a wall or the ceiling the camera slides along it instead of being pushed into it
    const vp = _vp.copy(view).addScaledVector(off, -view.dot(off));
    if (vp.lengthSq() < 0.04) vp.copy(view); else vp.normalize();
    // Ball cam (Rocket League): the camera, the car and the ball are in line. The camera sits
    // behind the car on the car -> ball axis: when the ball is high the camera drops low
    // behind the car and looks up, so both the car and the ball stay in the picture.
    let bp = 0;
    if (ctx.ballCam) {
      _tmp.copy(ballPos).sub(carPos).addScaledVector(off, -height);
      const v = _tmp.dot(off);
      const h = Math.sqrt(Math.max(0, _tmp.lengthSq() - v * v));
      // ball right above the car (dribble, flick): only part of the tilt, the view stays calm
      bp = Math.atan2(v, Math.max(h, 0.5)) * (0.45 + 0.55 * ballW);
      bp = THREE.MathUtils.clamp(bp, -0.5, 0.95);
    }
    if (!this.initialized) this.bpitch = bp;
    const dp = (bp - this.bpitch) * (1 - Math.exp(-dt * 8));
    this.bpitch += THREE.MathUtils.clamp(dp, -2 * dt, 2 * dt);
    const cb = Math.cos(this.bpitch), sb = Math.sin(this.bpitch);
    // the camera itself never dives under the surface the car drives on (as in the game, it
    // stops just above the floor and keeps tilting up toward the ball)
    const sbPos = this.airT < 0.3 ? Math.min(sb, (height - 0.3) / dist) : sb;
    const cbPos = Math.sqrt(Math.max(0, 1 - sbPos * sbPos));
    // the car's small bounces (suspension, landings, bumps) are not passed on to the camera
    if (!this.initialized) this.bob = 0;
    else this.bob = THREE.MathUtils.clamp((this.bob - (carPos.x - this.prevCar.x) * off.x - (carPos.y - this.prevCar.y) * off.y - (carPos.z - this.prevCar.z) * off.z) * Math.exp(-dt * 9), -0.45, 0.45);
    _desired.copy(carPos).addScaledVector(vp, -dist * cbPos).addScaledVector(off, height - dist * sbPos + this.bob);
    const frac = this.clampInside(_desired, _anchor);
    // (in ball cam the camera simply moves in along the axis when a wall is in the way)
    if (frac < (ctx.ballCam ? 0.7 : 0.8)) {
      // blocked by a wall/ceiling behind the car: try higher / more top-down viewpoints and
      // keep the one that stays furthest from the car (the car must never fill the screen)
      let best = frac * dist, bestK = -1;
      arenaNormal(carPos.x / S, carPos.y / S, carPos.z / S, _nrm);
      for (let k = 0; k < 4; k++) {
        const back = k === 0 ? 0.55 : k === 1 ? 0.2 : 0.35, lift = k === 0 ? 0.5 : 0.95;
        if (k < 2) _alt.copy(carPos).addScaledVector(vp, -dist * back).addScaledVector(off, height + dist * lift);
        // squeezed against a wall / the ceiling: step back from that surface instead
        else if (k === 3) {
          // car pressed against a wall with nothing behind it: look down on it from above
          _alt.copy(carPos).addScaledVector(off, dist * 0.85);
          _alt.x += _nrm.x * dist * 0.4; _alt.y += _nrm.y * dist * 0.4; _alt.z += _nrm.z * dist * 0.4;
        } else {
          // (never in front of the car: the camera would have to look backwards at it)
          _alt.set(_nrm.x * dist * 0.95, _nrm.y * dist * 0.95, _nrm.z * dist * 0.95).addScaledVector(vp, -dist * back);
          const ahead = _alt.dot(vp) + dist * 0.25;
          if (ahead > 0) _alt.addScaledVector(vp, -ahead);
          _alt.add(carPos);
        }
        this.clampInside(_alt, _anchor);
        // score: distance kept from the car, minus a penalty for viewpoints in front of it
        // (they make the view swing around when the normal viewpoint becomes free again)
        const ahead = (_alt.x - carPos.x) * vp.x + (_alt.y - carPos.y) * vp.y + (_alt.z - carPos.z) * vp.z;
        const clear = _alt.distanceTo(carPos) - Math.max(0, ahead) * 1.5;
        if (clear > best * 1.05 + 0.05) { best = clear; bestK = k; _cand.copy(_alt); }
      }
      if (bestK >= 0) _desired.copy(_cand);
    }

    // ---- look target
    const angle = THREE.MathUtils.degToRad(st.angle);
    _look.copy(carPos).addScaledVector(view, dist * 2 * cb).addScaledVector(off, height + this.bob + (Math.tan(angle) + sb * 0.667) * dist * 3);

    const wasInit = this.initialized;
    const kp = this.initialized ? 1 - Math.exp(-dt * 14) : 1;
    const kl = this.initialized ? 1 - Math.exp(-dt * 16) : 1;
    // position: the camera orbits the car. Its offset from the car turns toward the wanted
    // one (never faster than 4 rad/s) and its length eases in, so the camera never jumps and
    // never cuts through the car when the viewpoint changes near a wall or the ceiling.
    // A small lag behind the car's velocity keeps the feeling of speed.
    if (!this.initialized) this.velS.set(0, 0, 0);
    _tmp.set(ctx.carVel.x * S, ctx.carVel.y * S, ctx.carVel.z * S);
    this.velS.lerp(_tmp, 1 - Math.exp(-dt * 5)); // dodges / hits change the speed at once: eased
    _step.copy(_desired).sub(carPos).addScaledVector(this.velS, -0.04);
    _carD.copy(this.pos).sub(this.prevCar);
    const dl = _step.length(), cl = _carD.length();
    if (!this.initialized || this.prevCar.distanceTo(carPos) > 6 || cl < 0.05 || dl < 0.05) { this.pos.copy(carPos).add(_step); this.snapLook = true; } else {
      _step.multiplyScalar(1 / dl); _carD.multiplyScalar(1 / cl);
      const ang = Math.acos(THREE.MathUtils.clamp(_carD.dot(_step), -1, 1));
      if (ang > 1e-4) turnToward(_carD, _step, Math.min(kp, 4 * dt / ang), off);
      this.pos.copy(carPos).addScaledVector(_carD, cl + (dl - cl) * kp);
    }
    this.prevCar.copy(carPos);
    this.clampInside(this.pos, _anchor); // the smoothed position must stay inside too
    // viewing direction: eased as a direction (never faster than 7 rad/s), so the picture
    // cannot whip around when the camera passes close to the point it looks at
    _tmp.copy(_look).sub(this.pos);
    if (_tmp.lengthSq() > 1e-6) {
      _tmp.normalize();
      if (!wasInit || this.snapLook) this.lookDir.copy(_tmp);
      else {
        const la = Math.acos(THREE.MathUtils.clamp(this.lookDir.dot(_tmp), -1, 1));
        if (la > 1e-4) turnToward(this.lookDir, _tmp, Math.min(kl, 7 * dt / la), up);
      }
    }
    this.snapLook = false;
    this.lookAt.copy(this.pos).addScaledVector(this.lookDir, 10);
    this.initialized = true;
    this.keepCarInFrame(carPos);
    this.lookDir.copy(this.lookAt).sub(this.pos).normalize();

    cam.position.copy(this.pos);
    if (this.shakeAmp > 0.001) {
      const t = performance.now() * 0.05;
      cam.position.x += Math.sin(t * 1.3) * this.shakeAmp * 0.1;
      cam.position.y += Math.sin(t * 1.7 + 1) * this.shakeAmp * 0.08;
      cam.position.z += Math.cos(t * 1.1) * this.shakeAmp * 0.1;
      this.shakeAmp *= Math.exp(-dt * 6);
    }
    // roll: the screen's up is carried from frame to frame and eased toward `up`, so the
    // picture can never flip in a single frame, even when the camera looks straight along
    // `up` (top-down view of a car against a wall or the ceiling)
    _fw.copy(this.lookAt).sub(cam.position);
    if (_fw.lengthSq() > 1e-8) _fw.normalize(); else _fw.copy(this.view);
    const cu = this.camUp;
    cu.addScaledVector(_fw, -cu.dot(_fw));
    if (cu.lengthSq() < 1e-6) cu.copy(up).addScaledVector(_fw, -up.dot(_fw));
    if (cu.lengthSq() < 1e-6) cu.copy(this.view).addScaledVector(_fw, -this.view.dot(_fw));
    cu.normalize();
    _camUp.copy(up).addScaledVector(_fw, -up.dot(_fw));
    const tl = _camUp.length();
    if (tl > 0.05) {
      _camUp.multiplyScalar(1 / tl);
      if (wasInit) turnToward(cu, _camUp, (1 - Math.exp(-dt * 10)) * Math.min(1, tl * 2), _fw); else cu.copy(_camUp);
    }
    cam.up.copy(cu);
    cam.lookAt(this.lookAt);
  }

  /**
   * The player's car must always be on screen: if the look direction (ball cam on a high
   * ball, flips, walls...) drifts too far from the car, rotate it back toward the car.
   */
  keepCarInFrame(carPos) {
    const vHalf = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const maxAng = vHalf * 0.78; // the car stays well inside the frame (not on the edge)
    _look.copy(this.lookAt).sub(this.pos);
    const lookLen = _look.length();
    _toCar.copy(carPos).sub(this.pos);
    if (lookLen < 1e-4 || _toCar.lengthSq() < 1e-6) return;
    _look.multiplyScalar(1 / lookLen);
    _toCar.normalize();
    const ang = Math.acos(THREE.MathUtils.clamp(_look.dot(_toCar), -1, 1));
    if (ang <= maxAng) return;
    // rotate the look direction toward the car around their common axis
    _axis.crossVectors(_look, _toCar);
    if (_axis.lengthSq() < 1e-8) _axis.copy(this.up);
    _axis.normalize();
    _q.setFromAxisAngle(_axis, ang - maxAng);
    _look.applyQuaternion(_q);
    this.lookAt.copy(this.pos).addScaledVector(_look, Math.max(lookLen, 5));
  }

  /**
   * Keep the camera inside the arena with a safety margin: march from the anchor (car)
   * toward the wanted position and stop before the first wall.
   */
  clampInside(p, anchor) {
    const margin = 70; // uu
    if (arenaSdf(p.x / S, p.y / S, p.z / S) < -margin) return 1;
    _seg.copy(p).sub(anchor);
    let lo = 0, hi = 1;
    // if even the anchor is too close to a wall, accept it (car hugging the surface)
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      _probe.copy(anchor).addScaledVector(_seg, mid);
      if (arenaSdf(_probe.x / S, _probe.y / S, _probe.z / S) < -margin) lo = mid; else hi = mid;
    }
    p.copy(anchor).addScaledVector(_seg, lo);
    return lo;
  }
}
