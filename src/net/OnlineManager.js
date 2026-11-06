// Online play (1v1, 2v2, 3v3 with bots filling the teams): lobby, handshake, match glue.
import { PeerLink, describeError } from './PeerLink.js';
import { HostSync, GuestSync, NET_VERSION } from './NetSync.js';
import { Vec3 } from '../physics/math.js';

const BOT_NAMES = ['Ziggy', 'Viper', 'Blaze', 'Nova', 'Turbo', 'Kaze', 'Rex', 'Mako'];
const BOT_PAINTS = [
  [{ body: '#3a7bff', accent: '#111318', wheels: '#c8ccd4', boost: '#3ab0ff', style: 'Dominus' }, { body: '#2456c8', accent: '#22d3ee', wheels: '#c8ccd4', boost: '#3ab0ff', style: 'Breakout' }],
  [{ body: '#ff8c3a', accent: '#ffffff', wheels: '#c8ccd4', boost: '#ff9a2a', style: 'Dominus' }, { body: '#e8641a', accent: '#ffd21a', wheels: '#c8ccd4', boost: '#ff9a2a', style: 'Breakout' }],
];
const r2 = (v) => Math.round(v * 100) / 100;

export class OnlineManager {
  constructor(game) {
    this.game = game;
    this.link = null;
    this.role = null;
    this.opts = null;
    this.guestInfo = null;
    this.onStatus = () => {};
  }

  get active() { return !!this.link; }

  // ------------------------------------------------------------------ lobby
  async createGame(opts, onStatus) {
    this.leave();
    this.role = 'host';
    this.opts = opts;
    this.onStatus = onStatus;
    const link = this.link = new PeerLink();
    link.on('message', (m) => this.onMessage(m));
    link.on('close', () => this.onClose());
    link.on('status', (s) => this.onStatus(s));
    try {
      const code = await link.host(() => this.onStatus('Ami connecté ! Lancement du match…'));
      return code;
    } catch (e) {
      this.leave();
      throw new Error(describeError(e));
    }
  }

  async joinGame(code, onStatus) {
    this.leave();
    this.role = 'guest';
    this.onStatus = onStatus;
    const link = this.link = new PeerLink();
    link.on('message', (m) => this.onMessage(m));
    link.on('close', () => this.onClose());
    try {
      await link.join(code);
    } catch (e) {
      this.leave();
      throw new Error(describeError(e));
    }
    const s = this.game.settings;
    link.send({ t: 'hello', v: NET_VERSION, name: s.player.name || 'Ami', paint: s.car });
    this.onStatus('Connecté ! En attente du lancement par l\'hôte…');
  }

  leave() {
    if (this.link) { this.link.send({ t: 'bye' }); this.link.close(); }
    this.link = null;
    this.role = null;
  }

  // ------------------------------------------------------------------ messages
  onMessage(m) {
    const g = this.game, s = g.session;
    if (this.role === 'host') {
      if (m.t === 'hello') {
        if (m.v !== NET_VERSION) { this.link.send({ t: 'error', msg: 'Versions du jeu différentes : rechargez la page tous les deux.' }); return; }
        this.guestInfo = { name: String(m.name || 'Ami').slice(0, 16), paint: m.paint || {} };
        this.startMatch();
      } else if (m.t === 'in') {
        if (s && s.online && s.online.sync.onMessage) s.online.sync.onMessage(m);
      } else if (m.t === 'bye') this.onClose();
      return;
    }
    // guest
    if (m.t === 'start') {
      g.ui.hideAll();
      g.startGame('online', { online: { role: 'guest', roster: m.roster, myId: m.you, link: this.link, teamSize: m.teamSize }, duration: m.duration });
    } else if (m.t === 's') {
      if (s && s.online) s.online.sync.onMessage(m);
    } else if (m.t === 'ev') {
      if (s && s.online) this.applyHostEvent(s, m);
    } else if (m.t === 'full') {
      this.onStatus('Cette partie est déjà complète.');
    } else if (m.t === 'error') {
      this.onStatus(m.msg);
    } else if (m.t === 'bye') this.onClose();
  }

  onClose() {
    if (!this.link) return;
    const g = this.game;
    this.link.close();
    this.link = null;
    const inGame = g.session && g.session.online;
    this.role = null;
    if (inGame) {
      g.hud.notify('Connexion perdue avec ton ami', 'big');
      setTimeout(() => { if (g.session && g.session.online) { g.backToMenu(); g.ui.show('main'); } }, 2500);
    } else this.onStatus('Connexion perdue.');
  }

  // ------------------------------------------------------------------ host
  startMatch() {
    const g = this.game, o = this.opts, st = g.settings;
    const roster = [];
    let id = 0;
    roster.push({ id: id++, team: 0, name: st.player.name || 'Hôte', paint: st.car, human: 'host' });
    roster.push({ id: id++, team: 1, name: this.guestInfo.name, paint: this.guestInfo.paint, human: 'guest' });
    const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    for (const team of [0, 1]) {
      for (let i = 1; i < o.teamSize; i++) roster.push({ id: id++, team, name: names[id % names.length] + ' (bot)', paint: BOT_PAINTS[team][i % 2], bot: true });
    }
    this.link.send({ t: 'start', v: NET_VERSION, roster, you: 1, duration: o.duration, teamSize: o.teamSize });
    g.ui.hideAll();
    g.startGame('online', { online: { role: 'host', roster, myId: 0, link: this.link, teamSize: o.teamSize }, duration: o.duration, difficulty: o.difficulty });
  }

  /** builds session.online for a freshly created session */
  attach(session, cfg) {
    const world = session.world, link = cfg.link;
    if (cfg.role === 'host') {
      const remote = world.cars.find((c) => c.id === 1);
      const sync = new HostSync(world, link, remote);
      const m = session.match;
      const send = (e, d) => link.send({ t: 'ev', e, d });
      m.on('countdown', (n) => send('countdown', n));
      m.on('overtime', () => send('overtime'));
      m.on('kickoff', () => send('kickoff'));
      m.on('goal', (gd) => send('goal', { team: gd.team, scorer: gd.scorer ? gd.scorer.id : -1, ownGoal: gd.ownGoal, speed: Math.round(gd.speed), pos: [r2(gd.pos.x), r2(gd.pos.y), r2(gd.pos.z)], score: gd.score }));
      m.on('end', (d) => send('end', { score: d.score }));
      session.online = {
        role: 'host', sync, link,
        beforeStep: () => sync.beforeStep(),
        afterStep: () => sync.afterStep({ s: m.state, tl: r2(m.timeLeft), ot: m.overtime, ott: r2(m.overtimeTime), sc: m.score }),
        beforeFrame() {}, afterFrame() {},
      };
    } else {
      const sync = new GuestSync(world, link, session.player);
      const m = session.match;
      session.online = {
        role: 'guest', sync, link,
        beforeFrame: () => {
          if (sync.reconcile() && sync.matchState) {
            const ms = sync.matchState;
            m.state = ms.s; m.timeLeft = ms.tl; m.overtime = ms.ot; m.overtimeTime = ms.ott; m.score = ms.sc;
          }
        },
        afterFrame: () => sync.flush(),
        step: (controls) => sync.step(controls),
      };
    }
  }

  applyHostEvent(session, msg) {
    const m = session.match, w = session.world;
    const d = msg.d;
    switch (msg.e) {
      case 'goal': {
        m.score = d.score;
        const scorer = w.cars.find((c) => c.id === d.scorer) || null;
        m.emit('goal', { team: d.team, scorer, ownGoal: d.ownGoal, speed: d.speed, pos: new Vec3(d.pos[0], d.pos[1], d.pos[2]), score: d.score });
        break;
      }
      case 'end': m.score = d.score; m.state = 'ended'; m.emit('end', { score: d.score, cars: w.cars }); break;
      case 'countdown': m.emit('countdown', d); break;
      case 'overtime': m.overtime = true; m.emit('overtime'); break;
      case 'kickoff': m.emit('kickoff', {}); break;
      default: break;
    }
  }
}
