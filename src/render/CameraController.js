// Rocket League style camera: car cam + ball cam, smooth, never jerky.
import * as THREE from 'three';
import { UU_TO_M as S } from '../physics/constants.js';
import { arenaSdf } from '../physics/Arena.js';

const _dir = new THREE.Vector3(), _f = new THREE.Vector3(), _target = new THREE.Vector3(), _desired = new THREE.Vector3();
const _look = new THREE.Vector3(), _tmp = new THREE.Vector3(), _q = new THREE.Quaternion();

export class CameraController {
  constructor(camera, settings) {
    this.camera = camera;
    this.settings = settings;
    this.dir = new THREE.Vector3(0, 0, 1); // horizontal viewing direction
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
      cam.position.copy(this.pos);
      cam.lookAt(this.lookAt);
      return;
    }

    const carPos = ctx.carPos, ballPos = ctx.ballPos;
    // ---- desired horizontal direction
    this.ballCamBlend += ((ctx.ballCam ? 1 : 0) - this.ballCamBlend) * (1 - Math.exp(-dt * 6));
    if (ctx.ballCam) {
      _dir.set(ballPos.x - carPos.x, 0, ballPos.z - carPos.z);
    } else {
      _f.set(1, 0, 0).applyQuaternion(ctx.carQuat);
      _dir.set(_f.x, 0, _f.z);
      if (_dir.lengthSq() < 0.04) {
        // car pointing up/down (wall, aerial): use velocity, then keep previous
        _dir.set(ctx.carVel.x, 0, ctx.carVel.z);
        if (_dir.lengthSq() < 100 * 100) _dir.copy(this.dir);
      }
      // reversing on the ground: RL keeps looking forward
    }
    if (_dir.lengthSq() < 1e-6) _dir.copy(this.dir);
    _dir.normalize();
    if (!this.initialized) { this.dir.copy(_dir); }
    const rate = THREE.MathUtils.lerp(3.5, 16, st.stiffness);
    // rotate this.dir toward _dir smoothly (handles 180° turns)
    const cur = Math.atan2(this.dir.x, this.dir.z), tgt = Math.atan2(_dir.x, _dir.z);
    let d = tgt - cur;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const ang = cur + d * (1 - Math.exp(-dt * rate));
    this.dir.set(Math.sin(ang), 0, Math.cos(ang));

    // swivel (right stick / mouse)
    const sw = ctx.swivel || { x: 0, y: 0 };
    const swRate = 1 - Math.exp(-dt * st.swivelSpeed * 2);
    this.swivel += (sw.x * Math.PI * 0.95 - this.swivel) * swRate;
    this.swivelPitch += (sw.y * 0.6 - this.swivelPitch) * swRate;
    const yaw = Math.atan2(this.dir.x, this.dir.z) + this.swivel;
    _dir.set(Math.sin(yaw), 0, Math.cos(yaw));

    // ---- position
    const speed = ctx.carVel.length();
    const dist = st.distance * S * (1 + Math.min(1, speed / 2300) * 0.12);
    const height = st.height * S;
    _desired.copy(carPos).addScaledVector(_dir, -dist);
    _desired.y = carPos.y + height + this.swivelPitch * 2;
    this.clampInside(_desired, carPos);

    // ---- look target
    const angle = THREE.MathUtils.degToRad(st.angle);
    _look.copy(carPos).addScaledVector(_dir, dist * Math.cos(angle) * 2);
    _look.y = carPos.y + height + Math.tan(angle) * dist * 2;
    if (this.ballCamBlend > 0.001) {
      // ball cam: look toward the ball but keep the car in frame (clamped elevation)
      _tmp.copy(ballPos).sub(_desired);
      const horiz = Math.hypot(_tmp.x, _tmp.z);
      let elev = Math.atan2(_tmp.y, Math.max(horiz, 0.01));
      elev = THREE.MathUtils.clamp(elev, THREE.MathUtils.degToRad(-25), THREE.MathUtils.degToRad(38));
      const lx = _tmp.x / Math.max(horiz, 0.01), lz = _tmp.z / Math.max(horiz, 0.01);
      _target.set(_desired.x + lx * 10, _desired.y + Math.tan(elev) * 10, _desired.z + lz * 10);
      // keep the car in view: blend toward the car when the ball is high above
      _look.lerp(_target, this.ballCamBlend);
    }

    const kp = this.initialized ? 1 - Math.exp(-dt * 14) : 1;
    const kl = this.initialized ? 1 - Math.exp(-dt * 16) : 1;
    this.pos.lerp(_desired, kp);
    this.lookAt.lerp(_look, kl);
    this.initialized = true;

    cam.position.copy(this.pos);
    if (this.shakeAmp > 0.001) {
      const t = performance.now() * 0.05;
      cam.position.x += Math.sin(t * 1.3) * this.shakeAmp * 0.25;
      cam.position.y += Math.sin(t * 1.7 + 1) * this.shakeAmp * 0.2;
      cam.position.z += Math.cos(t * 1.1) * this.shakeAmp * 0.25;
      this.shakeAmp *= Math.exp(-dt * 6);
    }
    cam.lookAt(this.lookAt);
  }

  // keep the camera inside the arena (and above the floor)
  clampInside(p, anchor) {
    for (let i = 0; i < 6; i++) {
      const d = arenaSdf(p.x / S, p.y / S, p.z / S);
      if (d < -60) break;
      p.lerp(anchor, 0.25);
    }
    if (p.y < 0.4) p.y = 0.4;
  }
}
