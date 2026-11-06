// Fixed-step (120 Hz) simulation of the whole match: ball, cars, boost pads, goals.
// Deterministic given the same inputs -> ready for lockstep / server-authoritative
// online play later (see src/net/NetworkAdapter.js).
import { DT, CAR, RESPAWN_SPOTS, BALL } from './constants.js';
import { Ball } from './Ball.js';
import { BoostPads } from './BoostPads.js';
import { collideCarArena, collideCarBall, collideCars, dribbleAssist } from './collisions.js';
import { isInGoal } from './Arena.js';
import { Vec3 } from './math.js';

const _f = new Vec3();

export class PhysicsWorld {
  constructor() {
    this.ball = new Ball();
    this.cars = [];
    this.pads = new BoostPads();
    this.tick = 0;
    this.time = 0;
    this.events = [];
    this.goalDetection = true;
    this.lastTouch = null;
    this.ballTouchTick = -10;
    this.dribbleAssist = 0; // 0..1, see collisions.dribbleAssist
  }

  addCar(car) { this.cars.push(car); return car; }
  removeCar(car) { this.cars = this.cars.filter((c) => c !== car); }

  step(dt = DT) {
    this.tick++;
    this.time += dt;
    const ball = this.ball, cars = this.cars, ev = this.events;
    ball.savePrev();
    for (const car of cars) {
      car.savePrev();
      car.prevSpeedForBump = car.vel.dot(car.forward(_f));
    }

    // forces, suspension, controls
    for (const car of cars) {
      car.update(dt, ball);
      for (const e of car.events) ev.push({ type: e, car });
      car.events.length = 0;
    }
    ball.integrateForces(dt);

    // collisions
    for (const car of cars) {
      const hit = collideCarBall(car, ball, this.tick);
      if (hit) {
        const isNewTouch = this.tick > (car.lastTouchTick ?? -10) + 2;
        car.lastTouchTick = this.tick;
        this.lastTouch = car;
        if (isNewTouch) {
          car.stats.touches++;
          ev.push({ type: 'ballHit', car, strength: hit.strength, point: hit.point.clone(), ballSpeed: ball.vel.length() });
        }
      }
    }
    if (this.dribbleAssist > 0) for (const car of cars) dribbleAssist(car, ball, dt, this.dribbleAssist);
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const r = collideCars(cars[i], cars[j], this.time);
        if (!r) continue;
        if (r.type === 'demo') {
          r.victim.demolish();
          r.attacker.stats.demos++;
          ev.push({ type: 'demo', attacker: r.attacker, victim: r.victim, point: r.point });
        } else if (r.type === 'bump') {
          ev.push({ type: 'bump', attacker: r.attacker, victim: r.victim, point: r.point, strength: r.strength });
        } else if (r.strength > 150) {
          ev.push({ type: 'carHit', strength: r.strength, point: r.point.clone() });
        }
      }
    }
    const bImpact = ball.collideArena();
    if (bImpact > 250) ev.push({ type: 'ballBounce', strength: bImpact, pos: ball.pos.clone() });
    for (const car of cars) {
      const imp = collideCarArena(car);
      if (imp > 500) ev.push({ type: 'carImpact', car, strength: imp });
    }

    // integrate
    ball.integratePositions(dt);
    for (const car of cars) car.integratePositions(dt);

    this.pads.update(dt, cars, ev);

    // demolished cars respawn
    for (const car of cars) {
      if (!car.demolished) continue;
      car.respawnTimer -= dt;
      if (car.respawnTimer <= 0) this.respawnCar(car);
    }

    // goals
    if (this.goalDetection && !ball.frozen) {
      const g = isInGoal(ball.pos.z, BALL.RADIUS);
      if (g !== 0) {
        this.goalDetection = false;
        ev.push({ type: 'goal', scoringTeam: g > 0 ? 0 : 1, lastTouch: this.lastTouch, pos: ball.pos.clone(), speed: ball.vel.length() });
      }
    }
  }

  /** goal explosion: blows the nearby cars away and up, like in the original game */
  goalBlast(pos) {
    for (const car of this.cars) {
      if (car.demolished) continue;
      const dx = car.pos.x - pos.x, dy = car.pos.y - pos.y, dz = car.pos.z - pos.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const R = 2600;
      if (d > R) continue;
      const k = 1 - d / R;
      const inv = 1 / Math.max(d, 1);
      car.vel.x += dx * inv * 2100 * k; car.vel.z += dz * inv * 2100 * k;
      car.vel.y += 900 * k + Math.max(0, dy * inv) * 900 * k;
      car.angVel.x += (Math.random() - 0.5) * 9 * k; car.angVel.y += (Math.random() - 0.5) * 6 * k; car.angVel.z += (Math.random() - 0.5) * 9 * k;
      car.frozen = false;
    }
  }

  respawnCar(car) {
    const s = RESPAWN_SPOTS[Math.floor(Math.random() * RESPAWN_SPOTS.length)];
    const m = car.team === 0 ? 1 : -1;
    car.spawn(s.x * m, s.z * m, 0, m, CAR.BOOST_SPAWN);
    this.events.push({ type: 'respawn', car });
  }

  getState() {
    return { k: this.tick, t: Math.round(this.time * 1000) / 1000, b: this.ball.getState(), c: this.cars.map((c) => c.getState()),
      p: this.pads.getState(), lt: this.lastTouch ? this.lastTouch.id : -1 };
  }

  setState(s) {
    this.tick = s.k; this.time = s.t;
    this.ball.setState(s.b);
    for (const cs of s.c) { const car = this.cars.find((c) => c.id === cs[0]); if (car) car.setState(cs); }
    this.pads.setState(s.p);
    this.lastTouch = this.cars.find((c) => c.id === s.lt) || null;
  }

  consumeEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
