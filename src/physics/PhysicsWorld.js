// Fixed-step (120 Hz) simulation of the whole match: ball, cars, boost pads, goals.
// Deterministic given the same inputs -> ready for lockstep / server-authoritative
// online play later (see src/net/NetworkAdapter.js).
import { DT, CAR, RESPAWN_SPOTS, BALL } from './constants.js';
import { Ball } from './Ball.js';
import { BoostPads } from './BoostPads.js';
import { collideCarArena, collideCarBall, collideCars } from './collisions.js';
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

  respawnCar(car) {
    const s = RESPAWN_SPOTS[Math.floor(Math.random() * RESPAWN_SPOTS.length)];
    const m = car.team === 0 ? 1 : -1;
    car.spawn(s.x * m, s.z * m, 0, m, CAR.BOOST_SPAWN);
    this.events.push({ type: 'respawn', car });
  }

  consumeEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
