// Main game orchestrator: fixed 120 Hz physics, interpolated rendering, sessions.
import * as THREE from 'three';
import { DT, UU_TO_M as S, BALL, CAR } from '../physics/constants.js';
import { PhysicsWorld } from '../physics/PhysicsWorld.js';
import { Car } from '../physics/Car.js';
import { BallPredictor } from '../physics/BallPredictor.js';
import { Vec3 } from '../physics/math.js';
import { GameRenderer } from '../render/GameRenderer.js';
import { ArenaView } from '../render/ArenaView.js';
import { Stadium } from '../render/Stadium.js';
import { BoostPadView } from '../render/BoostPadView.js';
import { CarView } from '../render/CarView.js';
import { BallView } from '../render/BallView.js';
import { Particles } from '../render/Particles.js';
import { Effects } from '../render/Effects.js';
import { CameraController } from '../render/CameraController.js';
import { AudioManager } from '../audio/AudioManager.js';
import { InputManager } from '../input/InputManager.js';
import { BotController, DIFFICULTY } from '../ai/BotController.js';
import { MatchManager, MODES } from '../modes/MatchManager.js';
import { loadSettings, saveSettings } from './Settings.js';
import { LocalAdapter } from '../net/NetworkAdapter.js';
import { OnlineManager } from '../net/OnlineManager.js';
import { Controls } from '../physics/Controls.js';

const BOT_NAMES = ['Ziggy', 'Viper', 'Blaze', 'Nova', 'Turbo', 'Kaze', 'Rex', 'Mako', 'Pixel', 'Orion', 'Bandit', 'Echo'];
const BOT_PAINTS = [
  { body: '#1f6bff', accent: '#ffffff', wheels: '#1b1d22', boost: '#3ab0ff', style: 'Octane' },
  { body: '#3a7bff', accent: '#111318', wheels: '#c8ccd4', boost: '#3ab0ff', style: 'Dominus' },
  { body: '#2456c8', accent: '#22d3ee', wheels: '#c8ccd4', boost: '#3ab0ff', style: 'Breakout' },
];
const BOT_PAINTS_ORANGE = [
  { body: '#ff7a1a', accent: '#111318', wheels: '#1b1d22', boost: '#ff9a2a', style: 'Octane' },
  { body: '#ff8c3a', accent: '#ffffff', wheels: '#c8ccd4', boost: '#ff9a2a', style: 'Dominus' },
  { body: '#e8641a', accent: '#ffd21a', wheels: '#c8ccd4', boost: '#ff9a2a', style: 'Breakout' },
];

export class Game {
  constructor(container, UIClass, HUDClass) {
    this.settings = loadSettings();
    this.gfx = new GameRenderer(container, this.settings);
    const scene = this.gfx.scene;
    this.particles = new Particles(scene, 6000);
    this.gfx.onResize = (w, h) => this.particles.setViewportHeight(h * this.gfx.renderer.getPixelRatio());
    this.gfx.resize();
    this.arena = new ArenaView(scene, this.gfx.renderer);
    this.stadium = new Stadium(scene, this.settings.graphics.quality);
    this.camCtl = new CameraController(this.gfx.camera, this.settings.camera);
    this.effects = new Effects(scene, this.particles, this.camCtl);
    this.audio = new AudioManager(this.settings);
    this.input = new InputManager(this.settings);
    this.predictor = new BallPredictor(4, 1 / 60);
    this.net = new LocalAdapter();
    this.applyGraphics();

    this.session = null;
    this.state = 'menu';
    this.paused = false;
    this.ballCam = this.settings.camera.ballCamDefault;
    this.acc = 0;
    this.last = performance.now();
    this.fps = 60; this.fpsAcc = 0; this.fpsFrames = 0;
    this.garage = null;

    this.online = new OnlineManager(this);
    this._noInput = new Controls();
    this.ui = new UIClass(this);
    this.hud = new HUDClass(this);

    const unlock = () => { this.audio.init(); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    this.startAttract();
    requestAnimationFrame((t) => this.loop(t));
  }

  saveSettings() { saveSettings(this.settings); }

  applyGraphics() {
    const g = this.settings.graphics;
    this.gfx.applyQuality();
    const q = this.gfx.quality;
    this.particles.enabled = g.particles;
    this.particles.densityScale = q.particles;
    this.stadium.crowd.visible = g.crowd;
    this.particles.setViewportHeight(window.innerHeight * this.gfx.renderer.getPixelRatio());
  }

  // ---------------------------------------------------------------- sessions
  clearSession() {
    const s = this.session;
    if (!s) return;
    for (const v of s.carViews) v.dispose();
    s.ballView.dispose(this.gfx.scene);
    s.padView.dispose();
    this.particles.clear();
    this.session = null;
  }

  /** mode: key of MODES; opts: {difficulty, duration, attract} */
  startSession(modeId, opts = {}) {
    this.clearSession();
    const mode = opts.online
      ? { id: 'online', label: 'En ligne', teamSize: opts.online.teamSize, opponents: opts.online.teamSize, online: true }
      : MODES[modeId];
    const world = new PhysicsWorld();
    const scene = this.gfx.scene;
    const session = { mode, world, bots: [], carViews: [], attract: !!opts.attract, player: null, tick: 0, shared: { slices: this.predictor.slices, kickoff: false } };
    let id = 0;
    const diff = opts.difficulty || this.settings.match.difficulty;
    if (opts.online) {
      // cars come from the roster decided by the host (same ids on both machines)
      for (const r of opts.online.roster) {
        const car = world.addCar(new Car(r.id, r.team));
        car.name = r.name;
        const me = r.id === opts.online.myId;
        if (me) session.player = car;
        session.carViews.push(new CarView(scene, car, r.paint || {}, this.particles, me ? {} : { name: r.name.replace(' (bot)', '') }));
        if (r.bot && opts.online.role === 'host') session.bots.push(new BotController(car, world, session.shared, diff));
      }
      // put the local player's view first (camera follows carViews[0])
      const pi = session.carViews.findIndex((v) => v.car === session.player);
      if (pi > 0) session.carViews.unshift(session.carViews.splice(pi, 1)[0]);
    } else if (!opts.attract) {
      const p = world.addCar(new Car(id++, 0));
      p.name = this.settings.player.name || 'Joueur';
      p.infiniteBoost = mode.freeplay && this.settings.match.unlimitedBoostFreeplay;
      session.player = p;
      session.carViews.push(new CarView(scene, p, this.settings.car, this.particles));
    }
    const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    const addBot = (team, idx) => {
      const car = world.addCar(new Car(id++, team));
      car.name = names[(id - 1) % names.length] + ' (bot)';
      const paints = team === 0 ? BOT_PAINTS : BOT_PAINTS_ORANGE;
      session.carViews.push(new CarView(scene, car, paints[idx % paints.length], this.particles, { name: names[(id - 1) % names.length] }));
      session.bots.push(new BotController(car, world, session.shared, diff));
    };
    if (!opts.online) {
      const teamSize = opts.attract ? 2 : mode.teamSize;
      const mates = opts.attract ? 2 : teamSize - 1;
      for (let i = 0; i < mates; i++) addBot(0, i);
      const opp = opts.attract ? 2 : mode.opponents;
      for (let i = 0; i < opp; i++) addBot(1, i);
    }

    session.ballView = new BallView(scene, world.ball, this.particles);
    session.padView = new BoostPadView(scene, world.pads);
    session.match = new MatchManager(world, opts.attract ? MODES.doubles : mode, { duration: opts.duration ?? this.settings.match.duration });
    this.session = session;
    this.hookMatch(session);
    if (opts.online) this.online.attach(session, opts.online);
    session.match.kickoffVariant = 0;
    if (!opts.online) session.match.newKickoffVariant();
    session.match.start();
    this.camCtl.snap();
    this.ballCam = this.settings.camera.ballCamDefault;
    if (opts.attract) {
      this.camCtl.setOrbit(new THREE.Vector3(0, 2, 0), 38, 12, 0.08);
    } else {
      this.camCtl.follow();
    }
    this.paused = false;
    this.acc = 0;
    this.input.inGame = !opts.attract;
    this.hud.onSessionStart(session);
    return session;
  }

  startAttract() {
    this.state = 'menu';
    this.startSession('doubles', { attract: true, difficulty: 'pro', duration: 99999 });
  }

  startGame(modeId, opts) {
    this.state = 'playing';
    this.audio.init();
    this.startSession(modeId, opts);
  }

  backToMenu() {
    if (this.online.active) this.online.leave();
    this.hud.hide();
    this.startAttract();
  }

  hookMatch(session) {
    const m = session.match;
    m.on('countdown', (n) => {
      if (session.attract) return;
      this.hud.countdown(n);
      this.audio.play(n > 0 ? 'beep' : 'go');
    });
    m.on('goal', (g) => {
      const pos = g.pos;
      this.effects.goal(pos, g.team, g.speed);
      this.arena.flashGoal(g.team === 0 ? 1 : -1);
      this.stadium.cheer(2);
      this.audio.play('goal');
      this.audio.setCrowd(1);
      setTimeout(() => this.audio.setCrowd(0.1), 2500);
      if (!session.attract) {
        this.hud.goal(g, session);
        this.camCtl.setOrbit(new THREE.Vector3(pos.x * S, 2, pos.z * S * 0.95), 16, 5, 0.3);
        setTimeout(() => { if (this.session === session && session.match.state !== 'ended') this.camCtl.follow(); }, 3100);
      }
      this.hud.score(g.score);
    });
    m.on('kickoff', () => { if (!session.attract) this.camCtl.follow(); session.kickoffArmed = true; this.hud.score(m.score); });
    m.on('overtime', () => { if (!session.attract) this.hud.notify('PROLONGATION !', 'big'); this.audio.play('whistle'); });
    m.on('end', (d) => {
      if (session.attract) { this.startAttract(); return; }
      this.audio.play('whistle');
      this.state = 'ended';
      this.input.inGame = false;
      this.camCtl.setOrbit(new THREE.Vector3(0, 2, 0), 34, 10, 0.1);
      setTimeout(() => this.hud.endScreen(d, session), 900);
    });
  }

  // ---------------------------------------------------------------- loop
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    if (dt < 0) dt = 0;
    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc > 0.5) { this.fps = this.fpsFrames / this.fpsAcc; this.fpsAcc = 0; this.fpsFrames = 0; }

    this.handleMetaInput();
    const s = this.session;
    // online games never pause (the pause menu only disables the local inputs)
    if (s && (!this.paused || s.online)) {
      if (s.online) s.online.beforeFrame();
      this.acc += dt;
      let steps = 0;
      while (this.acc >= DT && steps < 12) { this.physicsTick(s); this.acc -= DT; steps++; }
      if (steps >= 12) this.acc = 0;
      if (s.online) s.online.afterFrame();
    }
    const alpha = this.paused && !(s && s.online) ? 1 : this.acc / DT;
    this.render(dt, alpha);
    this.input.clearEdges();
  }

  handleMetaInput() {
    const inp = this.input;
    if (this.state === 'playing' && this.session && !this.session.attract) {
      if (inp.consume('pause')) { this.togglePause(); }
      if (this.paused) return;
      if (inp.consume('ballCam')) { this.ballCam = !this.ballCam; this.hud.ballCam(this.ballCam); }
      const sb = inp.isDown('scoreboard');
      this.hud.showScoreboard(sb, this.session);
      if (this.session.mode.freeplay) this.handleTraining();
    } else if (this.state === 'garage') {
      if (inp.consume('pause')) this.ui.show('main');
    }
  }

  togglePause(force) {
    if (!this.session || this.session.attract || this.state !== 'playing') return;
    this.paused = force !== undefined ? force : !this.paused;
    if (this.paused) { this.ui.showPause(); this.input.inGame = false; } else { this.ui.hidePause(); this.input.inGame = true; }
    this.audio.updateCar(null, false);
  }

  handleTraining() {
    const s = this.session, inp = this.input, w = s.world, car = s.player;
    const ball = w.ball;
    const pressed = (code) => { if (inp.pressedOnce.has(code)) { inp.pressedOnce.delete(code); return true; } return false; };
    if (inp.consume('reset')) { s.match.kickoff(); this.camCtl.snap(); return; }
    const f = car.forward(new Vec3()); f.y = 0; f.normalize();
    const place = (x, y, z, vx, vy, vz) => { ball.reset(x, y, z); ball.vel.set(vx, vy, vz); ball.frozen = false; ball.hidden = false; w.goalDetection = true; };
    if (pressed('Digit1')) { // rolling ball toward the car
      const p = car.pos.clone().addScaled(f, 2200); place(p.x, BALL.RADIUS, p.z, -f.x * 900, 0, -f.z * 900);
      this.hud.notify('Balle roulante');
    }
    if (pressed('Digit2')) { // high ball for aerials
      const p = car.pos.clone().addScaled(f, 2600); place(p.x, 300, p.z, -f.x * 300, 1300, -f.z * 300);
      this.hud.notify('Aérien : balle haute');
    }
    if (pressed('Digit3')) { // ball on the roof (dribbles & flicks)
      place(car.pos.x, car.pos.y + 160, car.pos.z, car.vel.x, 0, car.vel.z);
      ball.pos.addScaled(f, 10);
      this.hud.notify('Balle sur le toit : dribble / flick');
    }
    if (pressed('Digit4')) { // ball toward the wall
      const side = car.pos.x >= 0 ? 1 : -1; place(side * 2600, 400, car.pos.z + 1200, side * 1500, 900, 300);
      this.hud.notify('Tir mural');
    }
    if (pressed('Digit5')) { // pop up for air dribble
      const p = car.pos.clone().addScaled(f, 600); place(p.x, BALL.RADIUS, p.z, 0, 1100, 0);
      this.hud.notify('Air dribble : balle levée');
    }
    if (pressed('Digit6')) { // ball off the ceiling area for ceiling shots
      place(0, 1700, car.pos.z + 2000, 0, 300, 0);
      this.hud.notify('Ceiling shot : monte au plafond !');
    }
    if (pressed('KeyB')) { car.infiniteBoost = !car.infiniteBoost; this.settings.match.unlimitedBoostFreeplay = car.infiniteBoost; this.hud.notify(car.infiniteBoost ? 'Boost illimité' : 'Boost normal'); }
    if (pressed('KeyF')) { car.vel.set(0, 0, 0); car.angVel.set(0, 0, 0); this.hud.notify('Voiture stoppée'); }
  }

  physicsTick(s) {
    const w = s.world, m = s.match;
    if (s.online && s.online.role === 'guest') {
      // guest: local prediction, the host is authoritative
      s.tick++;
      const c = m.state === 'ended' || this.paused ? this._noInput.reset() : this.input.update();
      for (const e of s.online.step(c)) if (e.type !== 'goal') this.onEvent(e, s);
      return;
    }
    s.tick++;
    // player input
    if (s.player) {
      if (m.state === 'ended' || this.paused) s.player.controls.reset();
      else s.player.controls.copy(this.input.update());
      this.net.sendInput(s.tick, s.player.controls);
    }
    // bots
    if (s.bots.length) {
      s.shared.kickoff = m.state === 'countdown' || (m.state === 'playing' && w.lastTouch === null && Math.hypot(w.ball.pos.x, w.ball.pos.z) < 10);
      if (s.tick % 4 === 0) this.predictor.update(w.ball);
      for (const b of s.bots) b.update(DT);
    }
    const preHit = s.tick % 4 === 0 ? this.predictor.goalPrediction(2.5) : s.lastGoalPred;
    s.lastGoalPred = preHit;
    if (s.online) s.online.beforeStep();
    w.step(DT);
    m.tick(DT);
    if (s.online) s.online.afterStep();
    for (const e of w.consumeEvents()) this.onEvent(e, s);
  }

  onEvent(e, s) {
    const isPlayer = e.car && e.car === s.player;
    const camPos = this.gfx.camera.position;
    const posOf = (car) => ({ x: car.pos.x * S, y: car.pos.y * S, z: car.pos.z * S });
    switch (e.type) {
      case 'goal': s.match.onGoal(e); break;
      case 'ballHit': {
        this.audio.play('ballHit', { pos: { x: e.point.x * S, y: e.point.y * S, z: e.point.z * S }, strength: e.strength });
        this.effects.impact(e.point, e.strength);
        if (e.strength > 2200) this.stadium.cheer(0.4);
        // shots & saves statistics
        if (!s.mode.freeplay || s.attract) {
          const before = s.lastGoalPred || 0;
          this.predictor.update(s.world.ball);
          const after = this.predictor.goalPrediction(3);
          const attackDir = e.car.team === 0 ? 1 : -1;
          if (after === attackDir && before !== attackDir) { e.car.stats.shots++; if (isPlayer) this.hud.notify('Tir cadré !'); }
          if (before === -attackDir && after !== -attackDir) { e.car.stats.saves++; if (!s.attract) this.hud.notify(`${e.car.name} : arrêt !`, e.car.team === 0 ? 'blue' : 'orange'); this.stadium.cheer(0.8); }
          s.lastGoalPred = after;
        }
        if (isPlayer) this.hud.touch(e.ballSpeed);
        break;
      }
      case 'ballBounce': this.audio.play('ballBounce', { pos: { x: e.pos.x * S, y: e.pos.y * S, z: e.pos.z * S }, strength: e.strength }); break;
      case 'jump': this.audio.play('jump', { pos: posOf(e.car) }); break;
      case 'doubleJump': this.audio.play('doubleJump', { pos: posOf(e.car) }); break;
      case 'flip': this.audio.play('flip', { pos: posOf(e.car) }); break;
      case 'land': if (isPlayer) this.audio.play('land', { pos: posOf(e.car), strength: 0.5 }); break;
      case 'flipReset': if (isPlayer) { this.audio.play('flipReset'); this.hud.notify('FLIP RESET !', 'gold'); } break;
      case 'carImpact': this.audio.play('carImpact', { pos: posOf(e.car), strength: e.strength }); if (isPlayer && e.strength > 900) this.camCtl.shake(0.2); break;
      case 'carHit': this.audio.play('carImpact', { pos: { x: e.point.x * S, y: e.point.y * S, z: e.point.z * S }, strength: e.strength * 2 }); break;
      case 'bump': this.audio.play('bump', { pos: posOf(e.victim) }); if (e.victim === s.player || e.attacker === s.player) this.camCtl.shake(0.4); break;
      case 'demo':
        this.effects.demo(e.point, e.victim.team);
        this.audio.play('demo', { pos: { x: e.point.x * S, y: e.point.y * S, z: e.point.z * S } });
        this.stadium.cheer(0.6);
        if (!s.attract) this.hud.feed(`${e.attacker.name} 💥 ${e.victim.name}`, e.attacker.team);
        break;
      case 'boostPickup':
        this.effects.pickup(e.x, e.z, e.big);
        if (isPlayer) this.audio.play(e.big ? 'pickupBig' : 'pickupSmall');
        break;
      case 'respawn': break;
      default: break;
    }
    void camPos;
  }

  // ---------------------------------------------------------------- render
  render(dt, alpha) {
    const s = this.session;
    if (s) {
      for (const v of s.carViews) v.update(alpha, dt, this.gfx.camera);
      s.ballView.update(alpha, dt);
      s.padView.update(dt);
    }
    if (this.garage) this.garage.update(dt);

    // camera
    if (s && s.player && this.camCtl.mode === 'follow' && this.state === 'playing') {
      const car = s.player;
      const pv = s.carViews[0].model.root;
      const ballPos = s.ballView.mesh.position;
      if (!car.demolished) this.camCtl.update(dt, {
        carPos: pv.position, carQuat: pv.quaternion, carVel: car.vel, ballPos, onSurface: car.onGround,
        ballCam: this.ballCam && !s.world.ball.hidden, boosting: car.isBoosting, supersonic: car.isSupersonic, swivel: this.input.swivel,
      });
      this.gfx.focusShadow(pv.position.x, 0, pv.position.z);
    } else {
      if (s && this.camCtl.mode === 'orbit' && s.attract) this.camCtl.orbit.center.lerp(s.ballView.mesh.position, 1 - Math.exp(-dt * 0.8));
      this.camCtl.update(dt, {});
      const c = this.camCtl.orbit.center;
      this.gfx.focusShadow(c.x, 0, c.z);
    }

    this.particles.update(dt);
    this.effects.update(dt);
    this.arena.update(dt);
    this.stadium.update(dt);

    const cp = this.gfx.camera.position;
    this.audio.setListener({ x: cp.x, y: cp.y, z: cp.z });
    this.audio.updateCar(s && s.player, this.state === 'playing' && !this.paused);
    if (s && s.player) this.hud.update(s, dt);
    this.gfx.render();
  }
}

export { MODES, DIFFICULTY, CAR };
