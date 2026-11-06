// Visual effects: goal explosions, impacts, demolitions, boost pickups.
import * as THREE from 'three';
import { UU_TO_M as S } from '../physics/constants.js';
import { BLUE, ORANGE } from './ArenaView.js';

export const EXPLOSIONS = {
  classic: 'Classique', fireworks: 'Feu d\'artifice', vortex: 'Tornade', pixels: 'Pixels',
  lightning: 'Foudre', confetti: 'Confettis', implosion: 'Trou noir',
};

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
    this.cubeGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    this.timers = [];
    this.debris = [];
  }

  ring(pos, color, maxScale = 12, life = 0.6, normal = null) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(pos);
    if (normal) m.lookAt(pos.clone().add(normal)); else m.rotation.x = -Math.PI / 2;
    this.scene.add(m);
    this.rings.push({ m, t: 0, life, maxScale });
  }

  later(delay, fn) { this.timers.push({ t: delay, fn }); }

  goal(posUU, team, speed, style = 'classic') {
    const p = new THREE.Vector3(posUU.x * S, posUU.y * S, posUU.z * S);
    const c = team === 0 ? BLUE : ORANGE;
    const white = new THREE.Color(1, 1, 1);
    const k = 1 + Math.min(1.5, speed / 3000);
    this.flash.color.copy(c); this.flash.position.copy(p); this.flash.intensity = 4000; this.flashT = 1;
    this.cam.shake(1.0);
    const P = this.particles;
    const rainbow = [0xff3355, 0xffd21a, 0x3ddc84, 0x22d3ee, 0x8a3cff, 0xff7a1a].map((h) => new THREE.Color(h));
    switch (style) {
      case 'fireworks':
        for (let i = 0; i < 7; i++) this.later(i * 0.18, () => {
          const q = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 14, Math.random() * 8 + 2, (Math.random() - 0.5) * 6));
          const col = rainbow[i % rainbow.length];
          P.burst(q.x, q.y, q.z, 160, 18, [col, white], 0.9, 1.6, { drag: 1.2, gravity: 5 });
          this.ring(q, col, 8, 0.5, new THREE.Vector3(0, 0, 1));
        });
        return;
      case 'vortex':
        for (let i = 0; i < 40; i++) this.later(i * 0.03, () => {
          for (let j = 0; j < 14; j++) {
            const a = (i * 0.5 + j / 14 * Math.PI * 2), r = 1 + i * 0.12;
            P.emit(p.x + Math.cos(a) * r, p.y - 1 + i * 0.25, p.z + Math.sin(a) * r, -Math.sin(a) * 14, 6, Math.cos(a) * 14,
              j % 2 ? c.r : 1, j % 2 ? c.g : 1, j % 2 ? c.b : 1, 1.1, 1.4, { drag: 0.6, grow: 1 });
          }
        });
        this.ring(p.clone().setY(0.1), c, 22, 1.6);
        return;
      case 'pixels':
        for (let i = 0; i < 60; i++) {
          const m = new THREE.Mesh(this.cubeGeo, new THREE.MeshBasicMaterial({ color: i % 3 ? c : white, transparent: true }));
          m.position.copy(p);
          const v = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.4, (Math.random() - 0.5) * 2).normalize().multiplyScalar(10 + Math.random() * 18);
          m.scale.setScalar(0.4 + Math.random() * 0.9);
          this.scene.add(m);
          this.debris.push({ m, v, t: 0, life: 2 + Math.random(), spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6) });
        }
        this.ring(p, c, 20, 0.6, new THREE.Vector3(0, 0, 1));
        return;
      case 'lightning':
        for (let i = 0; i < 6; i++) this.later(i * 0.12, () => this.bolt(p, c));
        P.burst(p.x, p.y, p.z, 250, 30 * k, [white, c], 0.8, 1.0, { drag: 2.5, gravity: 2 });
        return;
      case 'confetti':
        P.burst(p.x, p.y + 2, p.z, 700, 22, rainbow, 0.55, 4.5, { drag: 1.8, gravity: 2.2, up: 10 });
        this.ring(p, white, 18, 0.8, new THREE.Vector3(0, 0, 1));
        return;
      case 'implosion':
        for (let i = 0; i < 260; i++) {
          const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(14);
          P.emit(p.x + d.x, p.y + d.y, p.z + d.z, -d.x * 1.8, -d.y * 1.8, -d.z * 1.8, c.r, c.g, c.b, 0.8, 0.55, { drag: 0 });
        }
        this.later(0.55, () => {
          P.burst(p.x, p.y, p.z, 600, 45 * k, [c, white, new THREE.Color(0, 0, 0.1)], 1.5, 1.8, { drag: 1.6, gravity: 1, grow: 1.4 });
          this.ring(p, c, 40, 1.0, new THREE.Vector3(0, 0, 1));
          this.cam.shake(1.0);
        });
        return;
      default: break;
    }
    this.particles.burst(p.x, p.y, p.z, 500 * k, 32 * k, [c, white, c], 1.6, 2.2, { drag: 1.4, gravity: 4, grow: 1.2 });
    this.particles.burst(p.x, p.y, p.z, 200, 60 * k, [white], 0.7, 1.2, { drag: 2.5, gravity: 2 });
    this.ring(p, c, 30 * k, 1.0, new THREE.Vector3(0, 0, 1));
    this.ring(p.clone().setY(0.1), c, 25 * k, 1.2);
  }

  bolt(p, c) {
    const pts = [];
    const end = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 30, Math.random() * 14 - 2, (Math.random() - 0.5) * 20));
    for (let i = 0; i <= 10; i++) {
      const q = p.clone().lerp(end, i / 10);
      if (i > 0 && i < 10) q.add(new THREE.Vector3((Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 2.5));
      pts.push(q);
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: c.clone().lerp(new THREE.Color(1, 1, 1), 0.5), transparent: true }));
    this.scene.add(line);
    this.debris.push({ m: line, v: null, t: 0, life: 0.35 });
    this.flash.intensity = 2500; this.flashT = 0.3;
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
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.t += dt;
      if (d.v) {
        d.v.y -= 9 * dt; d.v.multiplyScalar(Math.exp(-dt * 0.8));
        d.m.position.addScaledVector(d.v, dt);
        if (d.m.position.y < 0.2) { d.m.position.y = 0.2; d.v.y = Math.abs(d.v.y) * 0.4; }
        d.m.rotation.x += d.spin.x * dt; d.m.rotation.y += d.spin.y * dt;
      }
      d.m.material.opacity = Math.max(0, 1 - d.t / d.life);
      if (d.t >= d.life) { this.scene.remove(d.m); d.m.material.dispose(); if (!d.v) d.m.geometry.dispose(); this.debris.splice(i, 1); }
    }
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
