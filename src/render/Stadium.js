// Stadium decoration: stands, simplified animated crowd, light towers, sky.
import * as THREE from 'three';
import { ARENA, UU_TO_M as S } from '../physics/constants.js';
import { makeSkyTexture } from './textures.js';
import { THEMES } from './themes.js';

const W = ARENA.HALF_W * S, L = ARENA.HALF_L * S;

export class Stadium {
  constructor(scene, quality = 'medium', theme = THEMES.night) {
    this.group = new THREE.Group();
    this.scene = scene;
    this.theme = theme;
    scene.add(this.group);
    this.excitement = 0;
    this.t = 0;

    // sky dome
    const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.MeshBasicMaterial({ map: makeSkyTexture(theme), side: THREE.BackSide, depthWrite: false, fog: false }));
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
    if (theme.stars) this.group.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xaab4ff, size: 1.2, sizeAttenuation: false, fog: false })));

    // ground outside the arena
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshStandardMaterial({ color: theme.ground, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05;
    this.group.add(ground);

    // stands
    const standMat = new THREE.MeshStandardMaterial({ color: theme.stands, roughness: 0.85, metalness: 0.2 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x0e1220, emissive: theme.trim, emissiveIntensity: 0.8 });
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
    const lampMat = new THREE.MeshBasicMaterial({ color: theme.lamps });
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
    this.buildDecor(theme);
    this.buildWeather(theme, quality);
  }

  buildDecor(theme) {
    const g = this.group;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const ring = (n, rMin, rMax, fn) => { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, r = rnd(rMin, rMax); fn(Math.cos(a) * r, Math.sin(a) * r * 1.15, i); } };
    if (theme.decor === 'city') {
      const winTex = cityTexture();
      const mats = [0xff2fd0, 0x22d3ee, 0x8a3cff].map((c) => new THREE.MeshStandardMaterial({ color: 0x08060f, emissive: c, emissiveMap: winTex, emissiveIntensity: 1.4 }));
      ring(70, 140, 320, (x, z, i) => {
        const h = rnd(30, 130), w = rnd(12, 30);
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mats[i % 3]);
        m.position.set(x, h / 2, z); g.add(m);
      });
    } else if (theme.decor === 'pines' || theme.decor === 'trees') {
      const trunk = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 1 });
      const leafCols = theme.decor === 'pines' ? [0x2a4a3a, 0xdfe8f0] : [0xc8601a, 0xe0a020, 0x9a3010, 0x4a7a2a];
      const leaves = leafCols.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
      ring(160, 110, 300, (x, z, i) => {
        const h = rnd(14, 30);
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, h * 0.35, 6), trunk); t.position.set(x, h * 0.17, z); g.add(t);
        const geo = theme.decor === 'pines' ? new THREE.ConeGeometry(h * 0.28, h * 0.8, 8) : new THREE.IcosahedronGeometry(h * 0.33, 0);
        const l = new THREE.Mesh(geo, leaves[i % leaves.length]); l.position.set(x, h * 0.6, z); g.add(l);
      });
    } else if (theme.decor === 'rocks') {
      const rock = [0x8a4a2a, 0xa86a3a, 0x6a3a20].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true }));
      ring(60, 130, 330, (x, z, i) => {
        const r = rnd(8, 30);
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rock[i % 3]);
        m.scale.set(1, rnd(0.6, 2.2), 1); m.position.set(x, r * 0.5, z); m.rotation.y = rnd(0, 3); g.add(m);
      });
    } else if (theme.decor === 'palms') {
      const trunk = new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 1 });
      const leaf = new THREE.MeshStandardMaterial({ color: 0x1a3a20, roughness: 1, side: THREE.DoubleSide });
      ring(70, 120, 280, (x, z) => {
        const h = rnd(16, 28);
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, h, 6), trunk); t.position.set(x, h / 2, z); t.rotation.z = rnd(-0.15, 0.15); g.add(t);
        for (let k = 0; k < 6; k++) {
          const l = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 8), leaf);
          l.position.set(x, h, z); l.rotation.set(1.1, (k / 6) * Math.PI * 2, 0); g.add(l);
        }
      });
    }
  }

  buildWeather(theme, quality) {
    this.weather = null;
    if (!theme.weather || theme.weather === 'none') return;
    const n = { low: 600, medium: 1500, high: 2600, ultra: 3500 }[quality] || 1500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 120; pos[i * 3 + 1] = Math.random() * 40; pos[i * 3 + 2] = (Math.random() - 0.5) * 140; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const cfg = {
      snow: { color: 0xffffff, size: 0.18, vy: -2.2, sway: 1.2, opacity: 0.9 },
      rain: { color: 0x9fd8ff, size: 0.08, vy: -26, sway: 0.2, opacity: 0.6 },
      dust: { color: 0xffc890, size: 0.12, vy: -0.4, sway: 2.5, opacity: 0.5 },
      leaves: { color: 0xe07a20, size: 0.25, vy: -1.6, sway: 2.0, opacity: 0.9 },
    }[theme.weather];
    const mat = new THREE.PointsMaterial({ color: cfg.color, size: cfg.size, transparent: true, opacity: cfg.opacity, depthWrite: false });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.group.add(pts);
    this.weather = { pts, pos, cfg, t: 0 };
  }

  dispose() { this.scene.remove(this.group); }

  cheer(amount = 1) { this.excitement = Math.min(2, this.excitement + amount); }

  update(dt) {
    this.t += dt;
    if (this.weather) {
      const w = this.weather, p = w.pos, c = w.cfg;
      w.t += dt;
      for (let i = 0; i < p.length; i += 3) {
        p[i] += Math.sin(w.t * 0.7 + i) * c.sway * dt;
        p[i + 1] += c.vy * dt;
        if (p[i + 1] < 0) p[i + 1] += 40;
      }
      w.pts.geometry.attributes.position.needsUpdate = true;
    }
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

function cityTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 64, 128);
  for (let y = 4; y < 128; y += 8) for (let x = 4; x < 64; x += 10) if (Math.random() < 0.55) { g.fillStyle = `rgba(255,255,255,${0.4 + Math.random() * 0.6})`; g.fillRect(x, y, 5, 4); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
