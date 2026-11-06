// Procedurally generated textures (no external assets -> instant load on Netlify).
import * as THREE from 'three';
import { ARENA } from '../physics/constants.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, { repeat = false, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

/** Football pitch: mowing stripes, field lines, team tinted halves. u = x, v = z. */
export function makeFieldTexture(maxAniso = 8, theme = null) {
  const grassA = theme ? theme.grass[0] : '#2f7d32', grassB = theme ? theme.grass[1] : '#378c3a';
  const lineCol = theme ? theme.lines : 'rgba(255,255,255,0.85)';
  const W = 1024, H = 1280;
  const [c, g] = canvas(W, H);
  const sx = W / (ARENA.HALF_W * 2), sz = H / (ARENA.HALF_L * 2);
  const X = (x) => (x + ARENA.HALF_W) * sx;
  const Z = (z) => (z + ARENA.HALF_L) * sz;
  // stripes
  const stripes = 16;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 ? grassA : grassB;
    g.fillRect(0, (i * H) / stripes, W, H / stripes + 1);
  }
  // subtle noise
  const img = g.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n * 0.5;
  }
  g.putImageData(img, 0, 0);
  // team tint
  let grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, 'rgba(40,110,255,0.42)');
  grd.addColorStop(0.18, 'rgba(40,110,255,0.22)');
  grd.addColorStop(0.45, 'rgba(40,110,255,0.0)');
  grd.addColorStop(0.55, 'rgba(255,130,20,0.0)');
  grd.addColorStop(0.82, 'rgba(255,130,20,0.24)');
  grd.addColorStop(1, 'rgba(255,130,20,0.45)');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);

  g.strokeStyle = lineCol;
  g.lineWidth = 6;
  // outline (rounded rect inset)
  const inset = 250;
  roundRect(g, X(-ARENA.HALF_W + inset), Z(-ARENA.HALF_L + inset), (ARENA.HALF_W - inset) * 2 * sx, (ARENA.HALF_L - inset) * 2 * sz, (ARENA.CORNER_R - inset) * sx);
  g.stroke();
  // midfield line & circle
  g.beginPath(); g.moveTo(X(-ARENA.HALF_W + inset), Z(0)); g.lineTo(X(ARENA.HALF_W - inset), Z(0)); g.stroke();
  g.beginPath(); g.arc(X(0), Z(0), 1000 * sx, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath(); g.arc(X(0), Z(0), 60 * sx, 0, Math.PI * 2); g.fill();
  // goal boxes
  for (const s of [-1, 1]) {
    const zLine = s * (ARENA.HALF_L - inset);
    const boxW = 2000, boxD = 1100, bigW = 3000, bigD = 2000;
    g.fillStyle = s < 0 ? 'rgba(40,110,255,0.30)' : 'rgba(255,130,20,0.30)';
    g.fillRect(X(-boxW / 2), Math.min(Z(zLine), Z(zLine - s * boxD)), boxW * sx, boxD * sz);
    g.strokeRect(X(-boxW / 2), Math.min(Z(zLine), Z(zLine - s * boxD)), boxW * sx, boxD * sz);
    g.strokeRect(X(-bigW / 2), Math.min(Z(zLine), Z(zLine - s * bigD)), bigW * sx, bigD * sz);
    g.beginPath(); g.arc(X(0), Z(zLine - s * bigD), 600 * sx, s > 0 ? Math.PI : 0, s > 0 ? Math.PI * 2 : Math.PI); g.stroke();
  }
  // big center logo ring
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 3;
  g.beginPath(); g.arc(X(0), Z(0), 1300 * sx, 0, Math.PI * 2); g.stroke();
  const t = finish(c, { aniso: maxAniso });
  return t;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

/** Panel grid for the arena walls (brightness used as alpha-ish emissive pattern). */
export function makeWallTexture() {
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
  g.strokeRect(S * 0.25, S * 0.25, S * 0.5, S * 0.5);
  g.beginPath(); g.moveTo(0, S / 2); g.lineTo(S * 0.25, S / 2); g.moveTo(S * 0.75, S / 2); g.lineTo(S, S / 2);
  g.moveTo(S / 2, 0); g.lineTo(S / 2, S * 0.25); g.moveTo(S / 2, S * 0.75); g.lineTo(S / 2, S); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 5; g.strokeRect(0, 0, S, S);
  return finish(c, { repeat: true });
}

export function makeNetTexture() {
  const S = 128;
  const [c, g] = canvas(S, S);
  g.clearRect(0, 0, S, S);
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(S, S); g.moveTo(S, 0); g.lineTo(0, S); g.stroke();
  return finish(c, { repeat: true });
}

export function makeBallTexture() {
  const W = 1024, H = 512;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#e9edf2'; g.fillRect(0, 0, W, H);
  // panel seams
  g.strokeStyle = '#9aa6b5'; g.lineWidth = 4;
  for (let i = 0; i < 12; i++) {
    const x = (i / 12) * W;
    g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 40, H * 0.3, x - 40, H * 0.7, x, H); g.stroke();
  }
  for (const y of [H * 0.25, H * 0.5, H * 0.75]) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  // dark hex patches
  g.fillStyle = '#2a3442';
  for (let i = 0; i < 18; i++) {
    const x = ((i % 6) + 0.5) / 6 * W + (Math.floor(i / 6) % 2 ? W / 12 : 0);
    const y = (Math.floor(i / 6) + 0.5) / 3 * H;
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      g.lineTo(x + Math.cos(a) * 34, y + Math.sin(a) * 30);
    }
    g.closePath(); g.fill();
  }
  return finish(c);
}

export function makeRadialSprite(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  const [c, g] = canvas(size, size);
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner); grd.addColorStop(1, outer);
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  return finish(c);
}

export function makeShadowTexture() {
  return makeRadialSprite('rgba(0,0,0,0.75)', 'rgba(0,0,0,0)', 128);
}

export function makeTextSprite(text, color = '#ffffff', bg = 'rgba(0,0,0,0.45)') {
  const [c, g] = canvas(1024, 128);
  let size = 64;
  g.font = `bold ${size}px Rajdhani, Arial, sans-serif`;
  while (g.measureText(text).width > 940 && size > 20) { size -= 4; g.font = `bold ${size}px Rajdhani, Arial, sans-serif`; }
  const w = Math.min(1000, g.measureText(text).width + 60);
  g.fillStyle = bg;
  g.beginPath(); if (g.roundRect) g.roundRect((1024 - w) / 2, 14, w, 100, 22); else g.rect((1024 - w) / 2, 14, w, 100); g.fill();
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 512, 66);
  const tex = finish(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(4.8, 0.6, 1);
  sp.userData.aspect = 8;
  return sp;
}

export function makeSkyTexture(theme = null) {
  const c4 = theme ? theme.sky : ['#05060f', '#151a3a', '#2b2350', '#0b0c18'];
  const [c, g] = canvas(16, 512);
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, c4[0]);
  grd.addColorStop(0.45, c4[1]);
  grd.addColorStop(0.7, c4[2]);
  grd.addColorStop(1, c4[3]);
  g.fillStyle = grd; g.fillRect(0, 0, 16, 512);
  return finish(c);
}
