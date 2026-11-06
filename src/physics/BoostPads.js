import { BOOST_PADS, CAR } from './constants.js';

export class BoostPads {
  constructor() {
    this.pads = [];
    for (const [x, z] of BOOST_PADS.BIG) this.pads.push({ x, z, big: true, active: true, timer: 0 });
    for (const [x, z] of BOOST_PADS.SMALL) this.pads.push({ x, z, big: false, active: true, timer: 0 });
  }
  getState() { return this.pads.map((p) => (p.active ? -1 : Math.round(p.timer * 100) / 100)); }
  setState(a) { a.forEach((t, i) => { const p = this.pads[i]; if (!p) return; p.active = t < 0; p.timer = t < 0 ? 0 : t; }); }

  reset() { for (const p of this.pads) { p.active = true; p.timer = 0; } }

  update(dt, cars, events) {
    for (const p of this.pads) {
      if (!p.active) {
        p.timer -= dt;
        if (p.timer <= 0) p.active = true;
        continue;
      }
      const R = p.big ? BOOST_PADS.BIG_RADIUS : BOOST_PADS.SMALL_RADIUS;
      for (const car of cars) {
        if (car.demolished || car.boost >= CAR.BOOST_MAX) continue;
        if (car.pos.y > (p.big ? 168 : 165) + 17) continue;
        const dx = car.pos.x - p.x, dz = car.pos.z - p.z;
        if (dx * dx + dz * dz > R * R) continue;
        car.boost = Math.min(CAR.BOOST_MAX, car.boost + (p.big ? BOOST_PADS.BIG_AMOUNT : BOOST_PADS.SMALL_AMOUNT));
        p.active = false;
        p.timer = p.big ? BOOST_PADS.BIG_COOLDOWN : BOOST_PADS.SMALL_COOLDOWN;
        if (events) events.push({ type: 'boostPickup', car, big: p.big, x: p.x, z: p.z });
        break;
      }
    }
  }
}
