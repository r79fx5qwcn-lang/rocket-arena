import * as THREE from 'three';
import { BALL, UU_TO_M as S } from '../physics/constants.js';
import { makeBallTexture, makeShadowTexture, makeRadialSprite } from './textures.js';
import { loadModelData, loadTex } from './CarModel.js';

// Ball 3D model supplied by the player (public/models/ball), procedural sphere until loaded.
let ballModel = null, ballPromise = null;
const ballCbs = new Set();
export function preloadBallModel() {
  if (ballPromise || typeof fetch === 'undefined') return ballPromise;
  ballPromise = loadModelData('ball', 'ball').then((data) => {
    ballModel = { ...data, map: loadTex('ball/ball.jpg', true), shadow: loadTex('ball/ball_shadow.png') };
    for (const cb of [...ballCbs]) cb();
    ballCbs.clear();
  }).catch((e) => console.warn('Modèle de balle indisponible, balle procédurale utilisée :', e.message));
  return ballPromise;
}

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
    this.scene = scene;
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
    if (ballModel) this.useModel(); else ballCbs.add(this._onModel = () => this.useModel());
  }

  /** replaces the procedural sphere with the supplied 3D ball */
  useModel() {
    if (this.disposed || !ballModel) return;
    const g = new THREE.Group();
    const inner = new THREE.Group();
    inner.scale.setScalar(S * BALL.VISUAL_RADIUS / ballModel.layout.radius);
    g.add(inner);
    for (const [name, geo] of Object.entries(ballModel.geos)) {
      const glow = name === 'Mat.4';
      const mat = glow
        ? new THREE.MeshStandardMaterial({ color: 0x66d1a0, emissive: 0x33b088, emissiveIntensity: 1.6, roughness: 0.4 })
        : new THREE.MeshStandardMaterial({ map: ballModel.map, roughness: 0.42, metalness: 0.2, emissive: 0x112233, emissiveIntensity: 0.15 });
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = !glow;
      inner.add(m);
    }
    g.position.copy(this.mesh.position);
    g.quaternion.copy(this.mesh.quaternion);
    this.scene.remove(this.mesh);
    this.mesh = g;
    this.scene.add(g);
    if (ballModel.shadow) { this.shadow.material.map = ballModel.shadow; this.shadow.material.needsUpdate = true; }
  }

  dispose(scene) { this.disposed = true; if (this._onModel) ballCbs.delete(this._onModel); scene.remove(this.mesh, this.halo, this.shadow); }

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
