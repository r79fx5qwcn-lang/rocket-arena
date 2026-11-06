// Tiny procedural mesh toolkit (pure JS, no Three.js) used to build the cars.
// A mesh is { p: number[] (xyz...), i: number[] (triangles) } in uu, car local frame:
// +X forward, +Y up, +Z right.

export function mesh(p = [], i = []) { return { p, i }; }

export function merge(...ms) {
  const out = mesh();
  for (const m of ms) {
    const base = out.p.length / 3;
    for (const v of m.p) out.p.push(v);
    for (const k of m.i) out.i.push(k + base);
  }
  return out;
}

export function transform(m, fn) {
  const p = m.p.slice();
  for (let k = 0; k < p.length; k += 3) {
    const r = fn(p[k], p[k + 1], p[k + 2]);
    p[k] = r[0]; p[k + 1] = r[1]; p[k + 2] = r[2];
  }
  return mesh(p, m.i.slice());
}
export const translate = (m, x, y, z) => transform(m, (a, b, c) => [a + x, b + y, c + z]);
export const scale = (m, x, y, z) => transform(m, (a, b, c) => [a * x, b * y, c * z]);
export const rotX = (m, t) => { const c = Math.cos(t), s = Math.sin(t); return transform(m, (x, y, z) => [x, y * c - z * s, y * s + z * c]); };
export const rotY = (m, t) => { const c = Math.cos(t), s = Math.sin(t); return transform(m, (x, y, z) => [x * c + z * s, y, -x * s + z * c]); };
export const rotZ = (m, t) => { const c = Math.cos(t), s = Math.sin(t); return transform(m, (x, y, z) => [x * c - y * s, x * s + y * c, z]); };
export const mirrorZ = (m) => {
  const r = transform(m, (x, y, z) => [x, y, -z]);
  for (let k = 0; k < r.i.length; k += 3) { const t = r.i[k + 1]; r.i[k + 1] = r.i[k + 2]; r.i[k + 2] = t; }
  return r;
};

/** axis-aligned box centred at (cx,cy,cz) with full sizes (sx,sy,sz) */
export function box(sx, sy, sz, cx = 0, cy = 0, cz = 0) {
  const x = sx / 2, y = sy / 2, z = sz / 2;
  const p = [], i = [];
  const face = (a, b, c, d) => { const o = p.length / 3; p.push(...a, ...b, ...c, ...d); i.push(o, o + 1, o + 2, o, o + 2, o + 3); };
  face([x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z]);
  face([-x, -y, z], [-x, y, z], [-x, y, -z], [-x, -y, -z]);
  face([-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z]);
  face([-x, -y, z], [-x, -y, -z], [x, -y, -z], [x, -y, z]);
  face([-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]);
  face([x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]);
  return translate(mesh(p, i), cx, cy, cz);
}

function lerp(a, b, t) { return a + (b - a) * t; }

/**
 * Loft through cross-sections along X. Each section: { x, w (half width at the bottom),
 * wt (half width at the top), yb, yt, n (superellipse exponent: 2 = round, 6 = boxy) }.
 * Smooth shading inside, flat caps at both ends.
 */
export function loft(sections, M = 28, caps = true) {
  const p = [], i = [];
  const ring = (s) => {
    const pts = [];
    for (let k = 0; k < M; k++) {
      const th = (k / M) * Math.PI * 2;
      const c = Math.cos(th), sn = Math.sin(th);
      const e = 2 / (s.n || 4);
      const u = Math.sign(c) * Math.pow(Math.abs(c), e);
      const v = Math.sign(sn) * Math.pow(Math.abs(sn), e);
      const t = (v + 1) / 2;
      const hw = lerp(s.w, s.wt ?? s.w, t);
      pts.push([s.x, (s.yb + s.yt) / 2 + (v * (s.yt - s.yb)) / 2, u * hw]);
    }
    return pts;
  };
  const rings = sections.map(ring);
  for (const r of rings) for (const v of r) p.push(...v);
  for (let a = 0; a < rings.length - 1; a++) {
    for (let k = 0; k < M; k++) {
      const k2 = (k + 1) % M;
      const i0 = a * M + k, i1 = a * M + k2, i2 = (a + 1) * M + k, i3 = (a + 1) * M + k2;
      i.push(i0, i2, i1, i1, i2, i3);
    }
  }
  if (caps) {
    for (const [idx, dir] of [[0, -1], [rings.length - 1, 1]]) {
      const r = rings[idx];
      const o = p.length / 3;
      let cy = 0; for (const v of r) cy += v[1]; cy /= r.length;
      p.push(r[0][0], cy, 0);
      for (const v of r) p.push(...v);
      for (let k = 0; k < M; k++) {
        const a = o + 1 + k, b = o + 1 + ((k + 1) % M);
        if (dir > 0) i.push(o, b, a); else i.push(o, a, b);
      }
    }
  }
  return mesh(p, i);
}

/** cylinder along Z (wheel axis), centred at origin */
export function cylinderZ(r, w, seg = 24, caps = true) {
  const p = [], i = [];
  for (let k = 0; k < seg; k++) {
    const t = (k / seg) * Math.PI * 2;
    p.push(Math.cos(t) * r, Math.sin(t) * r, -w / 2, Math.cos(t) * r, Math.sin(t) * r, w / 2);
  }
  for (let k = 0; k < seg; k++) {
    const a = k * 2, b = ((k + 1) % seg) * 2;
    i.push(a, b, a + 1, b, b + 1, a + 1);
  }
  if (caps) {
    for (const zs of [-1, 1]) {
      const o = p.length / 3;
      p.push(0, 0, (zs * w) / 2);
      for (let k = 0; k < seg; k++) { const t = (k / seg) * Math.PI * 2; p.push(Math.cos(t) * r, Math.sin(t) * r, (zs * w) / 2); }
      for (let k = 0; k < seg; k++) {
        const a = o + 1 + k, b = o + 1 + ((k + 1) % seg);
        if (zs > 0) i.push(o, a, b); else i.push(o, b, a);
      }
    }
  }
  return mesh(p, i);
}

/** partial torus in the XY plane (axis Z): wheel arch flares */
export function torusArc(R, r, a0, a1, seg = 18, tube = 8) {
  const p = [], i = [];
  for (let k = 0; k <= seg; k++) {
    const a = a0 + ((a1 - a0) * k) / seg;
    for (let j = 0; j < tube; j++) {
      const b = (j / tube) * Math.PI * 2;
      const rr = R + r * Math.cos(b);
      p.push(Math.cos(a) * rr, Math.sin(a) * rr, r * Math.sin(b));
    }
  }
  for (let k = 0; k < seg; k++) for (let j = 0; j < tube; j++) {
    const j2 = (j + 1) % tube;
    const i0 = k * tube + j, i1 = k * tube + j2, i2 = (k + 1) * tube + j, i3 = (k + 1) * tube + j2;
    i.push(i0, i1, i2, i1, i3, i2);
  }
  return mesh(p, i);
}

/** flat quad-strip "panel" following a list of [x,y] points, extruded along Z between z0 and z1 */
export function strip(points, z0, z1) {
  const p = [], i = [];
  for (const [x, y] of points) p.push(x, y, z0, x, y, z1);
  for (let k = 0; k < points.length - 1; k++) { const a = k * 2; i.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  return mesh(p, i);
}
