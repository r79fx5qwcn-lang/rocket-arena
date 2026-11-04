import * as THREE from 'three';
import { UU_TO_M as S, BOOST_PADS } from '../physics/constants.js';
import { makeRadialSprite } from './textures.js';

export class BoostPadView {
  constructor(scene, pads) {
    this.pads = pads;
    this.items = [];
    this.groups = [];
    this.scene = scene;
    const glow = makeRadialSprite('rgba(255,190,80,0.9)', 'rgba(255,140,20,0)');
    const baseBig = new THREE.CylinderGeometry(BOOST_PADS.BIG_RADIUS * S * 0.75, BOOST_PADS.BIG_RADIUS * S * 0.85, 0.08, 24);
    const baseSmall = new THREE.CylinderGeometry(BOOST_PADS.SMALL_RADIUS * S * 0.45, BOOST_PADS.SMALL_RADIUS * S * 0.55, 0.05, 18);
    const orbGeo = new THREE.IcosahedronGeometry(0.42, 1);
    const smallGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.06, 16);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, metalness: 0.6, roughness: 0.4, emissive: 0x2a1600, emissiveIntensity: 0.4 });
    for (const p of pads.pads) {
      const g = new THREE.Group();
      g.position.set(p.x * S, 0, p.z * S);
      const base = new THREE.Mesh(p.big ? baseBig : baseSmall, baseMat);
      base.position.y = 0.03;
      base.receiveShadow = true;
      g.add(base);
      const activeMat = new THREE.MeshStandardMaterial({ color: 0xffb030, emissive: 0xff8a00, emissiveIntensity: 2.4, roughness: 0.3, transparent: true });
      const core = new THREE.Mesh(p.big ? orbGeo : smallGeo, activeMat);
      core.position.y = p.big ? 0.75 : 0.07;
      g.add(core);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      const hs = p.big ? 2.6 : 1.1;
      halo.scale.set(hs, hs, 1);
      halo.position.y = p.big ? 0.75 : 0.15;
      g.add(halo);
      scene.add(g);
      this.groups.push(g);
      this.items.push({ pad: p, core, halo, mat: activeMat, phase: Math.random() * 6 });
    }
    this.t = 0;
  }

  dispose() { for (const g of this.groups) this.scene.remove(g); }

  update(dt) {
    this.t += dt;
    for (const it of this.items) {
      const active = it.pad.active;
      it.core.visible = active || !it.pad.big;
      it.halo.visible = active;
      it.mat.emissiveIntensity = active ? 2.2 + Math.sin(this.t * 4 + it.phase) * 0.5 : 0.05;
      it.mat.opacity = active ? 1 : 0.35;
      if (it.pad.big && active) {
        it.core.rotation.y += dt * 1.5;
        it.core.rotation.x += dt * 0.7;
        it.core.position.y = 0.75 + Math.sin(this.t * 2 + it.phase) * 0.08;
      }
    }
  }
}
