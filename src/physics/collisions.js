// Collision detection & impulse resolution: car vs arena, car vs ball, car vs car.
import { Vec3 } from './math.js';
import { CAR, BALL_HIT, BUMP_VEL_GROUND_CURVE, BUMP_VEL_AIR_CURVE, BUMP_UPWARD_CURVE } from './constants.js';
import { arenaSdf, arenaNormal } from './Arena.js';

const HB = CAR.HITBOX_HALF, HO = CAR.HITBOX_OFFSET;

// 26 sample points on the car hitbox (corners, edge midpoints, face centres), local frame
const SAMPLE_POINTS = [];
for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
  if (i === 0 && j === 0 && k === 0) continue;
  SAMPLE_POINTS.push(new Vec3(HO.x + i * HB.x, HO.y + j * HB.y, HO.z + k * HB.z));
}

const _p = new Vec3(), _n = new Vec3(), _rel = new Vec3(), _v = new Vec3(), _vt = new Vec3(), _J = new Vec3();
const _l = new Vec3(), _cp = new Vec3(), _rb = new Vec3(), _vb = new Vec3(), _tmp = new Vec3(), _tmp2 = new Vec3();
const contacts = [];
for (let i = 0; i < 26; i++) contacts.push({ p: new Vec3(), n: new Vec3(), pen: 0 });

/** Car hitbox vs arena. Returns impact speed (for audio) */
export function collideCarArena(car) {
  car.bodyContact = false;
  if (car.demolished) return 0;
  let impact = 0;
  // positional correction (iterative, deepest point first)
  for (let iter = 0; iter < 3; iter++) {
    let best = 0, bi = -1;
    for (let i = 0; i < SAMPLE_POINTS.length; i++) {
      const lp = SAMPLE_POINTS[i];
      _p.copy(lp).applyQuat(car.rot).add(car.pos);
      const d = arenaSdf(_p.x, _p.y, _p.z);
      if (d > best) { best = d; bi = i; }
    }
    if (bi < 0) break;
    _p.copy(SAMPLE_POINTS[bi]).applyQuat(car.rot).add(car.pos);
    arenaNormal(_p.x, _p.y, _p.z, _n);
    car.pos.addScaled(_n, best + 0.01);
  }
  // velocity impulses at touching points
  let count = 0;
  for (let i = 0; i < SAMPLE_POINTS.length; i++) {
    _p.copy(SAMPLE_POINTS[i]).applyQuat(car.rot).add(car.pos);
    const d = arenaSdf(_p.x, _p.y, _p.z);
    if (d > -1.5) {
      const c = contacts[count++];
      c.p.copy(_p); c.pen = d;
      arenaNormal(_p.x, _p.y, _p.z, c.n);
    }
  }
  if (count === 0) return 0;
  car.bodyContact = true;
  car.bodyContactNormal.set(0, 0, 0);
  for (let i = 0; i < count; i++) car.bodyContactNormal.add(contacts[i].n);
  car.bodyContactNormal.normalize();
  // two passes of sequential impulses
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < count; i++) {
      const c = contacts[i];
      _rel.copy(c.p).sub(car.pos);
      car.pointVelocity(_rel, _v);
      const vn = _v.dot(c.n);
      if (vn >= 0) continue;
      if (pass === 0) impact = Math.max(impact, -vn);
      const e = -vn > 100 && pass === 0 ? CAR.WORLD_RESTITUTION : 0;
      const kn = car.effInvMass(_rel, c.n);
      const jn = -(1 + e) * vn / kn / (pass === 0 ? Math.min(count, 4) : count);
      _J.copy(c.n).scale(jn);
      // friction
      _vt.copy(_v).addScaled(c.n, -vn);
      const vtl = _vt.length();
      if (vtl > 1e-3) {
        _vt.scale(1 / vtl);
        const kt = car.effInvMass(_rel, _vt);
        const jt = Math.min(vtl / kt / count, CAR.WORLD_FRICTION * jn);
        _J.addScaled(_vt, -jt);
      }
      car.applyImpulse(_J, _rel);
    }
  }
  return impact;
}

/** Car vs ball. Returns null or hit info {impulse, point, extra} */
export function collideCarBall(car, ball, tick) {
  if (car.demolished || ball.frozen) return null;
  const R = ball.radius;
  // ball centre in hitbox local frame
  _l.copy(ball.pos).sub(car.pos).applyQuatInv(car.rot);
  _l.x -= HO.x; _l.y -= HO.y; _l.z -= HO.z;
  // quick reject
  if (Math.abs(_l.x) > HB.x + R || Math.abs(_l.y) > HB.y + R || Math.abs(_l.z) > HB.z + R) return null;
  const cx = Math.max(-HB.x, Math.min(HB.x, _l.x));
  const cy = Math.max(-HB.y, Math.min(HB.y, _l.y));
  const cz = Math.max(-HB.z, Math.min(HB.z, _l.z));
  let dx = _l.x - cx, dy = _l.y - cy, dz = _l.z - cz;
  let dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  let pen;
  if (dist > 1e-6) {
    if (dist >= R) return null;
    pen = R - dist;
    _n.set(dx / dist, dy / dist, dz / dist);
    _cp.set(cx, cy, cz);
  } else {
    // centre inside the box: use axis of least penetration
    const px = HB.x - Math.abs(_l.x), py = HB.y - Math.abs(_l.y), pz = HB.z - Math.abs(_l.z);
    if (px <= py && px <= pz) { _n.set(Math.sign(_l.x) || 1, 0, 0); pen = px + R; }
    else if (py <= pz) { _n.set(0, Math.sign(_l.y) || 1, 0); pen = py + R; }
    else { _n.set(0, 0, Math.sign(_l.z) || 1); pen = pz + R; }
    _cp.copy(_l);
  }
  // to world
  _n.applyQuat(car.rot);
  _cp.x += HO.x; _cp.y += HO.y; _cp.z += HO.z;
  _cp.applyQuat(car.rot).add(car.pos);

  // relative velocity before the contact (for the Psyonix extra impulse)
  _tmp2.copy(ball.vel).sub(car.vel);
  const preRelSpeed = Math.min(_tmp2.length(), BALL_HIT.MAX_DELTA_VEL);

  _rel.copy(_cp).sub(car.pos);
  _rb.copy(_n).scale(-R);
  car.pointVelocity(_rel, _v);
  _vb.crossVectors(ball.angVel, _rb).add(ball.vel);
  _vb.sub(_v); // relative velocity ball - car at contact
  const vn = _vb.dot(_n);
  let jn = 0;
  if (vn < 0) {
    const kn = ball.invMass + car.effInvMass(_rel, _n);
    jn = -(1 + CAR.BALL_RESTITUTION) * vn / kn;
    _J.copy(_n).scale(jn);
    // friction
    _vt.copy(_vb).addScaled(_n, -vn);
    const vtl = _vt.length();
    if (vtl > 1e-3) {
      _vt.scale(1 / vtl);
      // ball effective tangential inverse mass: 1/m + R²/I
      const kt = ball.invMass + R * R * ball.invInertia + car.effInvMass(_rel, _vt);
      const jt = Math.min(vtl / kt, CAR.BALL_FRICTION * jn);
      _J.addScaled(_vt, -jt);
    }
    // apply: +J to ball, -J to car
    ball.vel.addScaled(_J, ball.invMass);
    _tmp.crossVectors(_rb, _J).scale(ball.invInertia);
    ball.angVel.add(_tmp);
    _J.scale(-1);
    car.applyImpulse(_J, _rel);
  }
  // positional correction (ball takes most of it)
  const wb = 0.85;
  ball.pos.addScaled(_n, pen * wb);
  car.pos.addScaled(_n, -pen * (1 - wb));

  // Psyonix "extra impulse": makes hits feel like Rocket League
  let extra = 0;
  // not re-applied while the contact is sustained (ball resting / dribbled on the roof)
  if (tick > car.lastExtraHitTick + 4 && preRelSpeed > 0) {
    _tmp.copy(ball.pos).sub(car.pos);
    _tmp.y *= BALL_HIT.Z_SCALE;
    _tmp.normalize();
    car.forward(_tmp2);
    const fd = _tmp.dot(_tmp2);
    _tmp.addScaled(_tmp2, -fd * (1 - BALL_HIT.FORWARD_SCALE)).normalize();
    extra = preRelSpeed * BALL_HIT.FACTOR_CURVE.get(preRelSpeed);
    ball.vel.addScaled(_tmp, extra);
  }
  car.lastExtraHitTick = tick;
  return { strength: Math.max(-vn, 0) + extra, point: _cp, normal: _n };
}

// ---------- car vs car ----------
function deepestPointInBox(a, b, out) {
  // finds the sample point of car a that penetrates deepest inside car b's hitbox
  let bestPen = 0, found = false;
  for (let i = 0; i < SAMPLE_POINTS.length; i++) {
    _p.copy(SAMPLE_POINTS[i]).applyQuat(a.rot).add(a.pos);
    _l.copy(_p).sub(b.pos).applyQuatInv(b.rot);
    _l.x -= HO.x; _l.y -= HO.y; _l.z -= HO.z;
    const px = HB.x - Math.abs(_l.x), py = HB.y - Math.abs(_l.y), pz = HB.z - Math.abs(_l.z);
    if (px <= 0 || py <= 0 || pz <= 0) continue;
    let pen, nx = 0, ny = 0, nz = 0;
    if (px <= py && px <= pz) { pen = px; nx = Math.sign(_l.x); }
    else if (py <= pz) { pen = py; ny = Math.sign(_l.y); }
    else { pen = pz; nz = Math.sign(_l.z); }
    if (pen > bestPen) {
      bestPen = pen; found = true;
      out.p.copy(_p);
      out.n.set(nx, ny, nz).applyQuat(b.rot); // out of b, toward a
    }
  }
  out.pen = bestPen;
  return found;
}

const _ca = { p: new Vec3(), n: new Vec3(), pen: 0 };
const _cb = { p: new Vec3(), n: new Vec3(), pen: 0 };
const _ra = new Vec3(), _rb2 = new Vec3(), _va = new Vec3(), _vb2 = new Vec3(), _fa = new Vec3();

/** Returns null or {type:'bump'|'demo'|'touch', attacker, victim, strength, point} */
export function collideCars(a, b, time) {
  if (a.demolished || b.demolished) return null;
  if (a.pos.distanceTo(b.pos) > 200) return null;
  const hitA = deepestPointInBox(a, b, _ca); // a's point inside b, normal from b to a
  const hitB = deepestPointInBox(b, a, _cb); // b's point inside a, normal from a to b
  if (!hitA && !hitB) return null;
  let c, sign;
  if (hitA && (!hitB || _ca.pen >= _cb.pen)) { c = _ca; sign = 1; } else { c = _cb; sign = -1; }
  // n: direction pushing a away from b
  _n.copy(c.n).scale(sign);
  const pen = c.pen;
  a.pos.addScaled(_n, pen * 0.5);
  b.pos.addScaled(_n, -pen * 0.5);

  _ra.copy(c.p).sub(a.pos);
  _rb2.copy(c.p).sub(b.pos);
  a.pointVelocity(_ra, _va);
  b.pointVelocity(_rb2, _vb2);
  _v.copy(_va).sub(_vb2); // relative velocity a - b
  const vn = _v.dot(_n);
  let result = null;
  if (vn < 0) {
    const kn = a.effInvMass(_ra, _n) + b.effInvMass(_rb2, _n);
    const jn = -(1 + CAR.CAR_CAR_RESTITUTION) * vn / kn;
    _J.copy(_n).scale(jn);
    _vt.copy(_v).addScaled(_n, -vn);
    const vtl = _vt.length();
    if (vtl > 1e-3) {
      _vt.scale(1 / vtl);
      const kt = a.effInvMass(_ra, _vt) + b.effInvMass(_rb2, _vt);
      _J.addScaled(_vt, -Math.min(vtl / kt, CAR.CAR_CAR_FRICTION * jn));
    }
    a.applyImpulse(_J, _ra);
    _J.scale(-1);
    b.applyImpulse(_J, _rb2);
    result = { type: 'touch', attacker: a, victim: b, strength: -vn, point: c.p };
  }

  // bumps & demolitions: the attacker hits with its front
  for (const [att, vic] of [[a, b], [b, a]]) {
    const key = vic.id;
    if ((att.bumpCooldowns[key] || 0) > time) continue;
    _l.copy(c.p).sub(att.pos).applyQuatInv(att.rot);
    if (_l.x < HO.x + HB.x * 0.6) continue; // must be the front of the attacker
    att.forward(_fa);
    _tmp.copy(vic.pos).sub(att.pos).normalize();
    const speedTowards = att.prevSpeedForBump;
    if (speedTowards < 400 || _fa.dot(_tmp) < 0.3) continue;
    att.bumpCooldowns[key] = time + CAR.BUMP_COOLDOWN;
    if (att.isSupersonic && att.team !== vic.team) {
      return { type: 'demo', attacker: att, victim: vic, strength: speedTowards, point: c.p.clone() };
    }
    const onGround = vic.onGround;
    const bumpSpeed = (onGround ? BUMP_VEL_GROUND_CURVE : BUMP_VEL_AIR_CURVE).get(speedTowards);
    const up = BUMP_UPWARD_CURVE.get(speedTowards);
    _tmp.set(_fa.x, 0, _fa.z).normalize();
    vic.vel.addScaled(_tmp, bumpSpeed).y += up;
    return { type: 'bump', attacker: att, victim: vic, strength: speedTowards, point: c.p.clone() };
  }
  return result;
}
