// Match flow: kickoffs, countdown, timer, goals, overtime, end of match, stats.
import { KICKOFF_SPAWNS, BALL, CAR, ARENA } from '../physics/constants.js';

export const MODES = {
  freeplay: { id: 'freeplay', label: 'Entraînement libre', teamSize: 1, opponents: 0, freeplay: true },
  duel: { id: 'duel', label: '1 contre 1', teamSize: 1, opponents: 1 },
  doubles: { id: 'doubles', label: '2 contre 2', teamSize: 2, opponents: 2 },
  standard: { id: 'standard', label: '3 contre 3', teamSize: 3, opponents: 3 },
};

const KICKOFF_SETS = {
  1: [[0], [1], [2], [3], [4]],
  2: [[0, 1], [2, 3], [0, 4], [1, 4], [2, 4], [3, 4]],
  3: [[0, 1, 4], [2, 3, 4], [0, 1, 2], [0, 1, 3]],
};

export class MatchManager {
  constructor(world, mode, opts = {}) {
    this.world = world;
    this.mode = mode;
    this.duration = opts.duration ?? 300;
    this.timeLeft = this.duration;
    this.score = [0, 0];
    this.state = 'init';
    this.stateTime = 0;
    this.overtime = false;
    this.overtimeTime = 0;
    this.listeners = {};
    this.lastCountdown = -1;
    this.waitingBallGround = false;
  }

  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, data) { (this.listeners[ev] || []).forEach((f) => f(data)); }

  get cars() { return this.world.cars; }

  start() { this.kickoff(); }

  kickoff() {
    const w = this.world;
    w.ball.reset(0, BALL.VISUAL_RADIUS, 0);
    w.ball.hidden = false;
    w.ball.frozen = !this.mode.freeplay;
    w.goalDetection = true;
    w.lastTouch = null;
    w.pads.reset();
    if (this.mode.freeplay) {
      for (const car of this.cars) { car.spawn(0, -4608, 0, 1, CAR.BOOST_SPAWN); car.frozen = false; }
      this.state = 'playing';
      this.emit('kickoff', {});
      return;
    }
    for (const team of [0, 1]) {
      const teamCars = this.cars.filter((c) => c.team === team);
      const sets = KICKOFF_SETS[Math.min(3, Math.max(1, teamCars.length))];
      const set = sets[this.kickoffVariant ?? 0] || sets[0];
      teamCars.forEach((car, i) => {
        const sp = KICKOFF_SPAWNS[set[i] ?? (i % KICKOFF_SPAWNS.length)];
        const m = team === 0 ? 1 : -1;
        const x = sp.x * m, z = sp.z * m;
        let fx = 0, fz = m;
        if (Math.abs(sp.x) > 1000) { fx = -x; fz = -z; }
        car.spawn(x, z, fx, fz, CAR.BOOST_SPAWN);
        car.frozen = true;
      });
    }
    this.state = 'countdown';
    this.stateTime = 0;
    this.lastCountdown = -1;
    this.emit('kickoff', {});
  }

  newKickoffVariant() {
    const n = Math.max(1, ...[0, 1].map((t) => this.cars.filter((c) => c.team === t).length));
    const sets = KICKOFF_SETS[Math.min(3, n)];
    this.kickoffVariant = Math.floor(Math.random() * sets.length);
  }

  /** Called every physics tick */
  tick(dt) {
    this.stateTime += dt;
    const w = this.world;
    if (this.state === 'countdown') {
      const remaining = 3 - this.stateTime;
      const n = Math.ceil(remaining);
      if (n !== this.lastCountdown && n > 0) { this.lastCountdown = n; this.emit('countdown', n); }
      if (remaining <= 0) {
        this.state = 'playing';
        this.stateTime = 0;
        for (const c of this.cars) c.frozen = false;
        w.ball.frozen = false;
        this.emit('countdown', 0);
      }
      return;
    }
    if (this.state === 'playing') {
      if (this.mode.freeplay) return;
      if (this.overtime) { this.overtimeTime += dt; this.emit('timer', this.overtimeTime); return; }
      if (this.timeLeft > 0) {
        this.timeLeft = Math.max(0, this.timeLeft - dt);
        this.emit('timer', this.timeLeft);
      }
      if (this.timeLeft <= 0) {
        // the match ends when the ball touches the ground
        if (w.ball.pos.y < BALL.RADIUS + 5) {
          if (this.score[0] !== this.score[1]) this.end();
          else { this.overtime = true; this.overtimeTime = 0; this.emit('overtime'); this.newKickoffVariant(); this.kickoff(); }
        }
      }
      return;
    }
    if (this.state === 'goal') {
      if (this.stateTime > 3.2) {
        if (this.mode.freeplay) { this.kickoff(); return; }
        if (this.overtime || (this.timeLeft <= 0 && this.score[0] !== this.score[1])) { this.end(); return; }
        if (this.timeLeft <= 0) { this.overtime = true; this.overtimeTime = 0; this.emit('overtime'); }
        this.newKickoffVariant();
        this.kickoff();
      }
    }
  }

  onGoal(ev) {
    if (this.state !== 'playing') return;
    const team = ev.scoringTeam;
    if (!this.mode.freeplay) this.score[team]++;
    const scorer = ev.lastTouch && ev.lastTouch.team === team ? ev.lastTouch : null;
    if (scorer && !this.mode.freeplay) scorer.stats.goals++;
    this.state = 'goal';
    this.stateTime = 0;
    const w = this.world;
    w.ball.frozen = true;
    w.ball.hidden = true;
    this.emit('goal', { team, scorer, ownGoal: !!(ev.lastTouch && ev.lastTouch.team !== team), speed: ev.speed, pos: ev.pos, score: this.score.slice() });
  }

  end() {
    this.state = 'ended';
    for (const c of this.cars) c.frozen = true;
    this.world.ball.frozen = true;
    this.emit('end', { score: this.score.slice(), cars: this.cars });
  }

  static formatTime(t, overtime = false) {
    const s = Math.ceil(t - 1e-6);
    const m = Math.floor(s / 60), r = s % 60;
    return (overtime ? '+' : '') + m + ':' + String(r).padStart(2, '0');
  }
}

export { ARENA };
