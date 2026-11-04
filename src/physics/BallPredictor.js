// Predicts the future ball trajectory (arena bounces only, no cars).
// Used by bots (intercepts, aerials) and for the shot/save statistics.
import { Ball } from './Ball.js';
import { Vec3 } from './math.js';
import { ARENA, BALL } from './constants.js';

export class BallPredictor {
  constructor(seconds = 4, step = 1 / 60) {
    this.step = step;
    this.count = Math.round(seconds / step);
    this.slices = [];
    for (let i = 0; i < this.count; i++) this.slices.push({ t: 0, pos: new Vec3(), vel: new Vec3() });
    this.sim = new Ball();
  }

  update(ball) {
    const s = this.sim;
    s.pos.copy(ball.pos); s.vel.copy(ball.vel); s.angVel.copy(ball.angVel); s.frozen = false;
    const sub = 2, dt = this.step / sub;
    for (let i = 0; i < this.count; i++) {
      for (let k = 0; k < sub; k++) {
        s.integrateForces(dt);
        s.collideArena();
        s.integratePositions(dt);
      }
      const sl = this.slices[i];
      sl.t = (i + 1) * this.step; sl.pos.copy(s.pos); sl.vel.copy(s.vel);
    }
    return this.slices;
  }

  /** returns +1 / -1 if the predicted ball enters the orange(+z) / blue(-z) goal, else 0 */
  goalPrediction(maxTime = 3) {
    for (const sl of this.slices) {
      if (sl.t > maxTime) break;
      if (sl.pos.z > ARENA.HALF_L + BALL.RADIUS) return 1;
      if (sl.pos.z < -(ARENA.HALF_L + BALL.RADIUS)) return -1;
    }
    return 0;
  }
}
