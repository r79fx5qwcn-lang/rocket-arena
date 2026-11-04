import * as THREE from 'three';
import { BALL, UU_TO_M as S } from '../physics/constants.js';
import { makeBallTexture, makeShadowTexture, makeRadialSprite } from './textures.js';

const _q0 = new THREE.Quaternion(), _q1 = new THREE.Quaternion();

export class BallView {
  constructor(scene, ball, particles) {
    this.ball = ball;
    this.particles = particles;
    const r = BALL.VISUAL_RADIUS * S;
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(r, 48, 32),
      new THREE.MeshStandardMaterial({ map: makeBallTexture(), roughness: 0.35, metalness: 0.15, emissive: 0x223355, emissiveIntensity: 0.25 }),
    );
    this.mesh.castShadow = true;
    scene.add(this.mesh);
    // glow halo
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeRadialSprite('rgba(170,200,255,0.55)', 'rgba(170,200,255,0)'), depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    this.halo.scale.set(r * 3.2, r * 3.2, 1);
    scene.add(this.halo);
    // ground shadow indicator (like in RL)
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(r * 1.05, 32), new THREE.MeshBasicMaterial({ map: makeShadowTexture(), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 1;
    scene.add(this.shadow);
    this.trailAcc = 0;
  }

  dispose(scene) { scene.remove(this.mesh, this.halo, this.shadow); }

  update(alpha, dt) {
    const b = this.ball;
    const m = this.mesh;
    m.position.set(
      (b.prevPos.x + (b.pos.x - b.prevPos.x) * alpha) * S,
      (b.prevPos.y + (b.pos.y - b.prevPos.y) * alpha) * S,
      (b.prevPos.z + (b.pos.z - b.prevPos.z) * alpha) * S,
    );
    _q0.set(b.prevRot.x, b.prevRot.y, b.prevRot.z, b.prevRot.w);
    _q1.set(b.rot.x, b.rot.y, b.rot.z, b.rot.w);
    m.quaternion.slerpQuaternions(_q0, _q1, alpha);
    m.visible = !b.hidden;
    this.halo.visible = !b.hidden;
    this.halo.position.copy(m.position);
    this.shadow.visible = !b.hidden;
    this.shadow.position.set(m.position.x, 0.02, m.position.z);
    const h = m.position.y;
    this.shadow.material.opacity = Math.max(0.15, 0.85 - h * 0.035);
    const sc = Math.max(0.6, 1.25 - h * 0.02);
    this.shadow.scale.set(sc, sc, 1);

    const speed = b.vel.length();
    if (speed > 1800 && !b.hidden) {
      this.trailAcc += dt * 80 * Math.min(2, (speed - 1800) / 1500 + 0.3);
      while (this.trailAcc >= 1) {
        this.trailAcc -= 1;
        this.particles.emit(m.position.x + (Math.random() - 0.5) * 0.6, m.position.y + (Math.random() - 0.5) * 0.6, m.position.z + (Math.random() - 0.5) * 0.6,
          0, 0, 0, 0.7, 0.8, 1, 0.9, 0.35, { drag: 0, grow: -0.6 });
      }
    }
  }
}
