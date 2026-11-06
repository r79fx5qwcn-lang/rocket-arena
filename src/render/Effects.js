// Visual effects: goal explosions, impacts, demolitions, boost pickups.
import * as THREE from 'three';
import { UU_TO_M as S } from '../physics/constants.js';
import { BLUE, ORANGE } from './ArenaView.js';

export class Effects {
  constructor(scene, particles, camCtl) {
    this.scene = scene;
    this.particles = particles;
    this.cam = camCtl;
    this.rings = [];
    this.flash = new THREE.PointLight(0xffffff, 0, 60, 2);
    scene.add(this.flash);
    this.flashT = 0;
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 48);
  }

  ring(pos, color, maxScale = 12, life = 0.6, normal = null) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(pos);
    if (normal) m.lookAt(pos.clone().add(normal)); else m.rotation.x = -Math.PI / 2;
    this.scene.add(m);
    this.rings.push({ m, t: 0, life, maxScale });
  }

  goal(posUU, team, speed) {
    const p = new THREE.Vector3(posUU.x * S, posUU.y * S, posUU.z * S);
    const c = team === 0 ? BLUE : ORANGE;
    const white = new THREE.Color(1, 1, 1);
    const k = 1 + Math.min(1.5, speed / 3000);
    this.particles.burst(p.x, p.y, p.z, 500 * k, 32 * k, [c, white, c], 1.6, 2.2, { drag: 1.4, gravity: 4, grow: 1.2 });
    this.particles.burst(p.x, p.y, p.z, 200, 60 * k, [white], 0.7, 1.2, { drag: 2.5, gravity: 2 });
    this.ring(p, c, 30 * k, 1.0, new THREE.Vector3(0, 0, 1));
    this.ring(p.clone().setY(0.1), c, 25 * k, 1.2);
    this.flash.color.copy(c); this.flash.position.copy(p); this.flash.intensity = 4000; this.flashT = 1;
    this.cam.shake(1.0);
  }

  impact(pointUU, strength) {
    if (strength < 600) return;
    const p = new THREE.Vector3(pointUU.x * S, pointUU.y * S, pointUU.z * S);
    const k = Math.min(1, (strength - 600) / 2500);
    this.particles.burst(p.x, p.y, p.z, 20 + 60 * k, 10 + 20 * k, [new THREE.Color(1, 0.85, 0.5), new THREE.Color(1, 1, 1)], 0.35, 0.5, { drag: 2, gravity: 9 });
    if (k > 0.35) this.ring(p, 0xffffff, 3 + 6 * k, 0.35, null); // no camera shake on hits (keeps flicks / dribbles readable)
  }

  demo(pointUU, team) {
    const p = new THREE.Vector3(pointUU.x * S, pointUU.y * S, pointUU.z * S);
    const c = team === 0 ? BLUE : ORANGE;
    this.particles.burst(p.x, p.y, p.z, 260, 18, [new THREE.Color(1, 0.5, 0.1), new THREE.Color(1, 0.9, 0.4), c], 1.2, 1.4, { drag: 2, gravity: 3, grow: 1.5 });
    this.particles.burst(p.x, p.y, p.z, 80, 8, [new THREE.Color(0.25, 0.25, 0.28)], 2.2, 2.5, { drag: 1.2, gravity: -1, grow: 2 });
    this.flash.color.setRGB(1, 0.6, 0.2); this.flash.position.copy(p); this.flash.intensity = 1500; this.flashT = 0.6;
    this.cam.shake(0.5);
  }

  pickup(x, z, big) {
    const c = new THREE.Color(1, 0.7, 0.2);
    this.particles.burst(x * S, (big ? 0.8 : 0.2), z * S, big ? 40 : 12, big ? 6 : 3, c, big ? 0.6 : 0.35, 0.5, { drag: 3, up: 2 });
  }

  landingDust(posUU, strength) {
    const k = Math.min(1, strength / 1500);
    this.particles.burst(posUU.x * S, 0.1, posUU.z * S, 10 + 20 * k, 3 + 3 * k, new THREE.Color(0.6, 0.75, 0.6), 0.6, 0.6, { drag: 3, gravity: 1, grow: 1.5 });
  }

  update(dt) {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const t = r.t / r.life;
      const s = 0.2 + r.maxScale * (1 - Math.pow(1 - Math.min(1, t), 3));
      r.m.scale.set(s, s, s);
      r.m.material.opacity = Math.max(0, 0.9 * (1 - t));
      if (t >= 1) { this.scene.remove(r.m); r.m.material.dispose(); this.rings.splice(i, 1); }
    }
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt);
      this.flash.intensity *= Math.exp(-dt * 4);
      if (this.flashT === 0) this.flash.intensity = 0;
    }
  }
}
