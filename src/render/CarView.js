import * as THREE from 'three';
import { UU_TO_M as S } from '../physics/constants.js';
import { buildCarModel } from './CarModel.js';
import { makeShadowTexture, makeTextSprite } from './textures.js';

const _q0 = new THREE.Quaternion(), _q1 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _back = new THREE.Vector3();
let shadowTex = null;

export class CarView {
  constructor(scene, car, paint, particles, opts = {}) {
    this.car = car;
    this.scene = scene;
    this.particles = particles;
    this.paint = paint;
    this.model = buildCarModel(paint);
    scene.add(this.model.root);
    this.wheelLen = this.model.wheels.map(() => 30);
    this.boostColor = new THREE.Color(paint.boost || '#ff9a2a');
    this.teamColor = new THREE.Color(car.team === 0 ? 0x3a8bff : 0xff8a2a);
    if (!shadowTex) shadowTex = makeShadowTexture();
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.6 }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 1;
    scene.add(this.shadow);
    if (opts.name) {
      this.label = makeTextSprite(opts.name, car.team === 0 ? '#8fc0ff' : '#ffc28f');
      scene.add(this.label);
    }
    this.emitAcc = 0;
    this.trailAcc = 0;
  }

  dispose() {
    this.scene.remove(this.model.root, this.shadow);
    if (this.label) this.scene.remove(this.label);
  }

  update(alpha, dt, camera) {
    const car = this.car, root = this.model.root;
    root.visible = !car.demolished;
    this.shadow.visible = !car.demolished;
    if (this.label) this.label.visible = !car.demolished;
    if (car.demolished) return;

    root.position.set(
      (car.prevPos.x + (car.pos.x - car.prevPos.x) * alpha) * S,
      (car.prevPos.y + (car.pos.y - car.prevPos.y) * alpha) * S,
      (car.prevPos.z + (car.pos.z - car.prevPos.z) * alpha) * S,
    );
    _q0.set(car.prevRot.x, car.prevRot.y, car.prevRot.z, car.prevRot.w);
    _q1.set(car.rot.x, car.rot.y, car.rot.z, car.rot.w);
    root.quaternion.slerpQuaternions(_q0, _q1, alpha);

    // wheels: suspension, steering, rolling
    const k = 1 - Math.exp(-dt * 30);
    this.model.wheels.forEach((w, i) => {
      const pw = car.wheels[i];
      this.wheelLen[i] += (pw.length - this.wheelLen[i]) * k;
      w.pivot.position.y = (w.def.y - this.wheelLen[i]) * S;
      w.pivot.rotation.y = -pw.steer;
      w.spinner.rotation.z = -pw.spin;
    });

    // shadow blob on the floor
    const h = root.position.y;
    this.shadow.position.set(root.position.x, 0.015, root.position.z);
    _v.set(1, 0, 0).applyQuaternion(root.quaternion);
    this.shadow.rotation.set(-Math.PI / 2, 0, Math.atan2(-_v.z, _v.x));
    const sc = Math.max(0.3, 1.2 - h * 0.05);
    this.shadow.scale.set(sc, sc, 1);
    this.shadow.material.opacity = Math.max(0, 0.65 - h * 0.03);

    if (this.label) {
      this.label.position.set(root.position.x, root.position.y + 1.25, root.position.z);
      const d = camera ? camera.position.distanceTo(root.position) : 10;
      this.label.material.opacity = THREE.MathUtils.clamp((d - 4) / 6, 0, 1);
    }

    // boost flame + particles
    const fl = this.model.flame;
    fl.visible = car.isBoosting;
    if (car.isBoosting) {
      const f = 0.8 + Math.random() * 0.4;
      fl.scale.set(f, 0.9 + Math.random() * 0.2, 0.9 + Math.random() * 0.2);
      this.emitAcc += dt * 140;
      const nozzle = _v.set(this.model.nozzle.x, this.model.nozzle.y, 0).applyQuaternion(root.quaternion).add(root.position);
      _back.set(-1, 0, 0).applyQuaternion(root.quaternion);
      const vx = car.vel.x * S, vy = car.vel.y * S, vz = car.vel.z * S;
      const c = this.boostColor;
      while (this.emitAcc >= 1) {
        this.emitAcc -= 1;
        const sp = 6 + Math.random() * 6;
        this.particles.emit(
          nozzle.x + (Math.random() - 0.5) * 0.1, nozzle.y + (Math.random() - 0.5) * 0.1, nozzle.z + (Math.random() - 0.5) * 0.1,
          vx * 0.35 + _back.x * sp + (Math.random() - 0.5), vy * 0.35 + _back.y * sp + (Math.random() - 0.5), vz * 0.35 + _back.z * sp + (Math.random() - 0.5),
          c.r, c.g, c.b, 0.55 + Math.random() * 0.4, 0.35 + Math.random() * 0.25, { drag: 3, grow: 1.6 });
      }
    }
    // supersonic trail
    if (car.isSupersonic) {
      this.trailAcc += dt * 90;
      const c = this.teamColor;
      while (this.trailAcc >= 1) {
        this.trailAcc -= 1;
        for (const z of [-30, 30]) {
          const p = _v2.set(-45 * S, 2 * S, z * S).applyQuaternion(root.quaternion).add(root.position);
          this.particles.emit(p.x, p.y, p.z, 0, 0, 0, c.r * 0.8 + 0.2, c.g * 0.8 + 0.2, c.b * 0.8 + 0.2, 0.35, 0.45, { drag: 0, grow: -0.5 });
        }
      }
    }
  }
}
