// Stadium decoration: stands, simplified animated crowd, light towers, sky.
import * as THREE from 'three';
import { ARENA, UU_TO_M as S } from '../physics/constants.js';
import { makeSkyTexture } from './textures.js';

const W = ARENA.HALF_W * S, L = ARENA.HALF_L * S;

export class Stadium {
  constructor(scene, quality = 'medium') {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.excitement = 0;
    this.t = 0;

    // sky dome
    const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.MeshBasicMaterial({ map: makeSkyTexture(), side: THREE.BackSide, depthWrite: false, fog: false }));
    this.group.add(sky);
    // stars
    const starGeo = new THREE.BufferGeometry();
    const sp = [];
    for (let i = 0; i < 1500; i++) {
      const u = Math.random() * Math.PI * 2, v = Math.random() * 0.45 + 0.05;
      const r = 560;
      sp.push(Math.cos(u) * Math.cos(v * Math.PI) * r * 0 + Math.cos(u) * r * Math.cos(v), Math.sin(v) * r, Math.sin(u) * r * Math.cos(v));
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.group.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xaab4ff, size: 1.2, sizeAttenuation: false, fog: false })));

    // ground outside the arena
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshStandardMaterial({ color: 0x0c0f18, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05;
    this.group.add(ground);

    // stands
    const standMat = new THREE.MeshStandardMaterial({ color: 0x1b2030, roughness: 0.85, metalness: 0.2 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x0e1220, emissive: 0x2244aa, emissiveIntensity: 0.6 });
    const tiers = 9, tierH = 1.6, tierD = 2.6, gap = 5;
    const crowdPos = [];
    const sides = [
      { axis: 'x', sign: 1, len: 2 * L + 10, offset: W + gap },
      { axis: 'x', sign: -1, len: 2 * L + 10, offset: W + gap },
      { axis: 'z', sign: 1, len: 2 * W + 10, offset: L + gap + ARENA.GOAL_DEPTH * S },
      { axis: 'z', sign: -1, len: 2 * W + 10, offset: L + gap + ARENA.GOAL_DEPTH * S },
    ];
    for (const sd of sides) {
      for (let k = 0; k < tiers; k++) {
        const h = 2 + k * tierH;
        const d = sd.offset + k * tierD + tierD / 2;
        const geo = sd.axis === 'x' ? new THREE.BoxGeometry(tierD, h, sd.len) : new THREE.BoxGeometry(sd.len, h, tierD);
        const m = new THREE.Mesh(geo, standMat);
        if (sd.axis === 'x') m.position.set(sd.sign * d, h / 2, 0); else m.position.set(0, h / 2, sd.sign * d);
        this.group.add(m);
        // seat rows
        const rowN = Math.floor(sd.len / 0.9);
        for (let i = 0; i < rowN; i++) {
          const along = -sd.len / 2 + (i + 0.5) * (sd.len / rowN);
          if (sd.axis === 'x') crowdPos.push([sd.sign * (d - 0.3), h + 0.45, along]);
          else crowdPos.push([along, h + 0.45, sd.sign * (d - 0.3)]);
        }
      }
      // top trim / roof edge
      const topD = sd.offset + tiers * tierD + 1;
      const trim = sd.axis === 'x' ? new THREE.BoxGeometry(1, 0.6, sd.len) : new THREE.BoxGeometry(sd.len, 0.6, 1);
      const tm = new THREE.Mesh(trim, trimMat);
      if (sd.axis === 'x') tm.position.set(sd.sign * topD, 2 + tiers * tierH + 3, 0); else tm.position.set(0, 2 + tiers * tierH + 3, sd.sign * topD);
      this.group.add(tm);
    }

    // crowd
    const density = { low: 0.25, medium: 0.55, high: 1 }[quality] ?? 0.55;
    const chosen = crowdPos.filter(() => Math.random() < density);
    const body = new THREE.BoxGeometry(0.5, 0.9, 0.5);
    const crowdMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.crowd = new THREE.InstancedMesh(body, crowdMat, chosen.length);
    this.crowdBase = chosen;
    this.crowdPhase = chosen.map(() => Math.random() * Math.PI * 2);
    const palette = [0x1e6bff, 0xff7a1a, 0xffffff, 0x333a4a, 0x2a8cff, 0xff9a3a, 0xd0d0d0, 0x6a3cff];
    const col = new THREE.Color();
    const mtx = new THREE.Matrix4();
    chosen.forEach((p, i) => {
      // fans of the blue team on the blue (-z) half, orange on the other
      const r = Math.random();
      if (r < 0.6) col.setHex(p[2] < 0 ? 0x2a6bff : 0xff7a1a); else col.setHex(palette[Math.floor(Math.random() * palette.length)]);
      this.crowd.setColorAt(i, col);
      mtx.makeTranslation(p[0], p[1], p[2]);
      this.crowd.setMatrixAt(i, mtx);
    });
    this.crowd.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (this.crowd.instanceColor) this.crowd.instanceColor.needsUpdate = true;
    this.group.add(this.crowd);
    this._m = mtx;
    this._acc = 0;

    // light towers
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x222838, roughness: 0.7, metalness: 0.5 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xf4f6ff });
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = sx * (W + 34), z = sz * (L + 22);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1, 45, 8), towerMat);
      pole.position.set(x, 22.5, z);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 1), lampMat);
      panel.position.set(x, 46, z);
      panel.lookAt(0, 0, 0);
      this.group.add(pole, panel);
    }
    // big screens above the goals
    for (const sz of [-1, 1]) {
      const scr = new THREE.Mesh(new THREE.BoxGeometry(30, 10, 0.8), new THREE.MeshStandardMaterial({ color: 0x050710, emissive: sz < 0 ? 0x1040a0 : 0xa04010, emissiveIntensity: 0.9 }));
      scr.position.set(0, 34, sz * (L + 34));
      this.group.add(scr);
    }
  }

  cheer(amount = 1) { this.excitement = Math.min(2, this.excitement + amount); }

  update(dt) {
    this.t += dt;
    this.excitement = Math.max(0, this.excitement - dt * 0.25);
    this._acc += dt;
    if (this._acc < 1 / 30) return;
    this._acc = 0;
    const amp = 0.05 + this.excitement * 0.35;
    const speed = 3 + this.excitement * 6;
    const m = this._m;
    for (let i = 0; i < this.crowdBase.length; i++) {
      const p = this.crowdBase[i];
      const y = p[1] + Math.max(0, Math.sin(this.t * speed + this.crowdPhase[i])) * amp;
      m.makeTranslation(p[0], y, p[2]);
      this.crowd.setMatrixAt(i, m);
    }
    this.crowd.instanceMatrix.needsUpdate = true;
  }
}
