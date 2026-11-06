// Rocket League style camera: car cam + ball cam, smooth, never jerky.
import * as THREE from 'three';
import { UU_TO_M as S } from '../physics/constants.js';
import { arenaSdf, arenaNormal } from '../physics/Arena.js';
import { Vec3 } from '../physics/math.js';

const _dir = new THREE.Vector3(), _f = new THREE.Vector3(), _target = new THREE.Vector3(), _desired = new THREE.Vector3();
const _look = new THREE.Vector3(), _tmp = new THREE.Vector3(), _q = new THREE.Quaternion();
const _nrm = new Vec3();
const _alt = new THREE.Vector3(), _up = new THREE.Vector3(), _anchor = new THREE.Vector3(), _seg = new THREE.Vector3(), _probe = new THREE.Vector3();

export class CameraController {
  constructor(camera, settings) {
    this.camera = camera;
    this.settings = settings;
    this.dir = new THREE.Vector3(0, 0, 1); // viewing direction (perpendicular to up)
    this.up = new THREE.Vector3(0, 1, 0);
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
    this.fovKick += ((ctx.boosting ? 4 : 0) + (ctx.supersonic ? 3 : 0) - this.fovKick) * (1 - Math.exp(-dt * 3));
    this.updateFov(cam.aspect, this.fovKick);

    if (this.mode === 'orbit') {
      const o = this.orbit;
      o.angle += o.speed * dt;
      _desired.set(o.center.x + Math.sin(o.angle) * o.radius, o.center.y + o.height, o.center.z + Math.cos(o.angle) * o.radius);
      this.clampInside(_desired, o.center);
      const k = 1 - Math.exp(-dt * 3);
      this.pos.lerp(_desired, k);
      this.lookAt.lerp(o.center, k);
      this.up.set(0, 1, 0);
      cam.up.set(0, 1, 0);
      cam.position.copy(this.pos);
      cam.lookAt(this.lookAt);
      return;
    }

    const carPos = ctx.carPos, ballPos = ctx.ballPos;
    // ---- camera "up": follows the surface the car drives on (walls, ceiling) like in RL,
    // world up in the air. This keeps the camera inside the arena on walls / ceiling.
    _up.set(0, 1, 0);
    if (ctx.onSurface) {
      _up.set(0, 1, 0).applyQuaternion(ctx.carQuat);
      if (_up.y > 0.8) _up.set(0, 1, 0); // flat-ish floor: keep a level horizon
    }
    if (!this.initialized) this.up.copy(_up);
    this.up.lerp(_up, 1 - Math.exp(-dt * 4)).normalize();
    const up = this.up;

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
    const maxStep = (ctx.ballCam ? 2.4 : 4.5) * dt; // rad/s cap: no sudden whip-pans
    _q.setFromAxisAngle(up, THREE.MathUtils.clamp(ang * (1 - Math.exp(-dt * rate)), -maxStep, maxStep));
    this.dir.applyQuaternion(_q).normalize();

    // swivel (right stick / mouse)
    const sw = ctx.swivel || { x: 0, y: 0 };
    const swRate = 1 - Math.exp(-dt * st.swivelSpeed * 2);
    this.swivel += (sw.x * Math.PI * 0.95 - this.swivel) * swRate;
    this.swivelPitch += (sw.y * 0.6 - this.swivelPitch) * swRate;
    _q.setFromAxisAngle(up, -this.swivel);
    const view = _f.copy(this.dir).applyQuaternion(_q);

    // ---- position
    const speed = ctx.carVel.length();
    const dist = st.distance * S * (1 + Math.min(1, speed / 2300) * 0.12);
    const height = st.height * S + this.swivelPitch * 2;
    _anchor.copy(carPos).addScaledVector(up, 1.1);
    if (arenaSdf(_anchor.x / S, _anchor.y / S, _anchor.z / S) > -90) {
      // car close to a wall/ceiling in the air: anchor the camera away from that surface
      arenaNormal(carPos.x / S, carPos.y / S, carPos.z / S, _nrm);
      _anchor.set(carPos.x + _nrm.x * 1.1, carPos.y + _nrm.y * 1.1, carPos.z + _nrm.z * 1.1);
    }
    _desired.copy(carPos).addScaledVector(view, -dist).addScaledVector(up, height);
    const frac = this.clampInside(_desired, _anchor);
    if (frac < 0.8) {
      // blocked by a wall/ceiling behind the car: try a higher, closer viewpoint
      _alt.copy(carPos).addScaledVector(view, -dist * 0.55).addScaledVector(up, height + dist * 0.5);
      const fracAlt = this.clampInside(_alt, _anchor);
      if (fracAlt * _alt.distanceTo(carPos) > frac * _desired.distanceTo(carPos) * 1.0 + 0.05) _desired.copy(_alt);
    }

    // ---- look target
    const angle = THREE.MathUtils.degToRad(st.angle);
    _look.copy(carPos).addScaledVector(view, dist * 2).addScaledVector(up, height + Math.tan(angle) * dist * 3);
    if (this.ballCamBlend > 0.001) {
      // ball cam: look toward the ball but keep the car in frame (clamped elevation)
      _tmp.copy(ballPos).sub(_desired);
      const vert = _tmp.dot(up);
      _tmp.addScaledVector(up, -vert);
      const horiz = Math.max(_tmp.length(), 0.01);
      let elev = Math.atan2(vert, horiz);
      elev = THREE.MathUtils.clamp(elev, THREE.MathUtils.degToRad(-25), THREE.MathUtils.degToRad(38));
      _tmp.multiplyScalar(1 / horiz);
      _target.copy(_desired).addScaledVector(_tmp, 10).addScaledVector(up, Math.tan(elev) * 10);
      _look.lerp(_target, this.ballCamBlend * (0.35 + 0.65 * ballW));
    }

    const kp = this.initialized ? 1 - Math.exp(-dt * 14) : 1;
    const kl = this.initialized ? 1 - Math.exp(-dt * 16) : 1;
    this.pos.lerp(_desired, kp);
    this.lookAt.lerp(_look, kl);
    this.clampInside(this.pos, _anchor); // the smoothed position must stay inside too
    this.initialized = true;

    cam.position.copy(this.pos);
    if (this.shakeAmp > 0.001) {
      const t = performance.now() * 0.05;
      cam.position.x += Math.sin(t * 1.3) * this.shakeAmp * 0.25;
      cam.position.y += Math.sin(t * 1.7 + 1) * this.shakeAmp * 0.2;
      cam.position.z += Math.cos(t * 1.1) * this.shakeAmp * 0.25;
      this.shakeAmp *= Math.exp(-dt * 6);
    }
    cam.up.copy(up);
    cam.lookAt(this.lookAt);
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
