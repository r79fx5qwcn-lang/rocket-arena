import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const QUALITY_PRESETS = {
  low: { pixelRatio: 0.75, shadows: false, shadowMap: 1024, particles: 0.4, antialias: false },
  medium: { pixelRatio: 1, shadows: true, shadowMap: 1024, particles: 0.7, antialias: true },
  high: { pixelRatio: 1.5, shadows: true, shadowMap: 2048, particles: 1, antialias: true },
  ultra: { pixelRatio: 2, shadows: true, shadowMap: 4096, particles: 1, antialias: true },
};

export class GameRenderer {
  constructor(container, settings) {
    this.settings = settings;
    const q = QUALITY_PRESETS[settings.graphics.quality] || QUALITY_PRESETS.medium;
    this.renderer = new THREE.WebGLRenderer({ antialias: q.antialias, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.id = 'game-canvas';

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0b0d1a, 120, 520);
    this.camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 1200);
    // image based lighting so metallic paints / rims get reflections
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environmentIntensity = 0.55;
      pmrem.dispose();
    } catch (e) { console.warn('Environment map unavailable', e); }

    this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x2a3a2a, 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.4);
    this.sun.position.set(25, 60, 15);
    this.sun.shadow.camera.left = -32; this.sun.shadow.camera.right = 32;
    this.sun.shadow.camera.top = 32; this.sun.shadow.camera.bottom = -32;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 160;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
    const fill = new THREE.DirectionalLight(0x8899ff, 0.6);
    fill.position.set(-30, 40, -40);
    this.scene.add(fill);

    this.applyQuality();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  applyQuality() {
    const g = this.settings.graphics;
    const q = QUALITY_PRESETS[g.quality] || QUALITY_PRESETS.medium;
    const pr = Math.min(window.devicePixelRatio || 1, q.pixelRatio) * (g.renderScale || 1);
    this.renderer.setPixelRatio(pr);
    const shadows = g.shadows && q.shadows;
    this.renderer.shadowMap.enabled = shadows;
    this.sun.castShadow = shadows;
    if (shadows && this.sun.shadow.mapSize.x !== q.shadowMap) {
      this.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.quality = q;
    // materials must be recompiled when toggling shadows
    this.scene.traverse((o) => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach((mm) => { mm.needsUpdate = true; }); } });
    this.resize();
  }

  focusShadow(x, y, z) {
    this.sun.position.set(x + 25, y + 60, z + 15);
    this.sun.target.position.set(x, y, z);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.onResize) this.onResize(w, h);
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
