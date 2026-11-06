// In-match HUD: score, timer, boost meter, speed, ball cam, notifications, scoreboard, end screen.
import { MatchManager } from '../modes/MatchManager.js';

const RING = 2 * Math.PI * 70 * 0.75; // 270° arc

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('hud');
    this.el.innerHTML = `
      <div class="scorebar"><div class="team blue" data-s0>0</div><div class="time" data-time>5:00</div><div class="team orange" data-s1>0</div></div>
      <div class="feed" data-feed></div>
      <div class="notify-wrap" data-notify></div>
      <div class="countdown hidden" data-count></div>
      <div data-goal></div>
      <div class="training-help hidden" data-training></div>
      <div class="flipstate" data-flip></div>
      <div class="camtag" data-cam>BALL CAM</div>
      <div class="speedo" data-speed>0<small>KM/H</small></div>
      <div class="boost-meter" data-boost>
        <svg viewBox="0 0 160 160"><defs><linearGradient id="boostGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd34a"/><stop offset="1" stop-color="#ff5a1a"/></linearGradient></defs>
          <circle class="bg" cx="80" cy="80" r="70" fill="none" stroke-width="12" stroke-dasharray="${RING} 999" stroke-linecap="round"/>
          <circle class="fg" cx="80" cy="80" r="70" fill="none" stroke-width="12" stroke-dasharray="${RING} 999" stroke-dashoffset="0" stroke-linecap="round"/></svg>
        <div class="num"><span data-boostnum>33</span><small>BOOST</small></div>
      </div>
      <div class="scoreboard hidden" data-board></div>
      <div data-end></div>
      <div class="fps hidden" data-fps></div>
      <div class="ping hidden" data-ping></div>`;
    const q = (k) => this.el.querySelector(`[data-${k}]`);
    this.$ = { s0: q('s0'), s1: q('s1'), time: q('time'), feed: q('feed'), notify: q('notify'), count: q('count'), goal: q('goal'), training: q('training'), flip: q('flip'), cam: q('cam'), speed: q('speed'), boost: q('boost'), boostnum: q('boostnum'), board: q('board'), end: q('end'), fps: q('fps'), ping: q('ping') };
    this.$.ring = this.el.querySelector('.boost-meter .fg');
    this.lastBoost = -1; this.lastSpeed = -1; this.boardVisible = false;
  }

  hide() { this.el.classList.add('hidden'); this.$.end.innerHTML = ''; }

  onSessionStart(session) {
    this.$.end.innerHTML = ''; this.$.goal.innerHTML = '';
    this.$.notify.innerHTML = ''; this.$.feed.innerHTML = '';
    if (session.attract) { this.hide(); return; }
    this.el.classList.remove('hidden');
    const free = session.mode.freeplay;
    this.el.querySelector('.scorebar').classList.toggle('hidden', free);
    this.$.training.classList.toggle('hidden', !free);
    const k = (a) => this.game.input.keyLabel(this.game.settings.controls.bindings[a]?.[0]);
    this.$.training.innerHTML = `<b>ENTRAÎNEMENT LIBRE</b><br>${k('reset')} : réinitialiser · B : boost illimité · F : stop<br>1 balle roulante · 2 aérien · 3 sur le toit<br>4 mur · 5 air dribble · 6 plafond<br>${k('ballCam')} : ball cam · ${k('pause')} : pause`;
    this.score([0, 0]);
    this.ballCam(this.game.ballCam);
    this.$.time.textContent = MatchManager.formatTime(session.match.duration);
    this.$.time.classList.remove('ot', 'low');
  }

  score(s) { this.$.s0.textContent = s[0]; this.$.s1.textContent = s[1]; }

  ballCam(on) { this.$.cam.textContent = on ? 'BALL CAM' : 'CAR CAM'; this.$.cam.classList.toggle('on', on); }

  countdown(n) {
    const el = this.$.count;
    el.classList.remove('hidden', 'pop');
    void el.offsetWidth;
    el.textContent = n > 0 ? n : 'GO !';
    el.classList.add('pop');
  }

  notify(text, cls = '') {
    const d = document.createElement('div');
    d.className = 'notify ' + cls;
    d.textContent = text;
    this.$.notify.appendChild(d);
    setTimeout(() => d.remove(), 2300);
    while (this.$.notify.children.length > 4) this.$.notify.firstChild.remove();
  }

  feed(text, team) {
    const d = document.createElement('div');
    d.className = 't' + team; d.textContent = text;
    this.$.feed.appendChild(d);
    setTimeout(() => d.remove(), 4100);
  }

  touch(ballSpeed) {
    const old = this.el.querySelector('.touch-info');
    if (old) old.remove();
    const d = document.createElement('div');
    d.className = 'touch-info';
    d.textContent = `Vitesse de balle : ${Math.round(ballSpeed * 0.036)} km/h`;
    this.el.appendChild(d);
    setTimeout(() => d.remove(), 2000);
  }

  goal(g, session) {
    const team = g.team === 0 ? 'blue' : 'orange';
    const who = g.scorer ? g.scorer.name : (g.ownGoal ? 'Contre son camp !' : '');
    const kmh = Math.round(g.speed * 0.036);
    this.$.goal.innerHTML = `<div class="goal-banner ${team}"><div class="g">BUT !</div>${who || session.mode.freeplay ? `<div class="who">${who ? who + ' · ' : ''}${kmh} km/h</div>` : ''}</div>`;
    setTimeout(() => { this.$.goal.innerHTML = ''; }, 3000);
  }

  showScoreboard(on, session) {
    if (session.mode.freeplay) on = false;
    if (on === this.boardVisible && !on) return;
    this.boardVisible = on;
    this.$.board.classList.toggle('hidden', !on);
    if (on) this.$.board.innerHTML = this.statsTable(session);
  }

  statsTable(session) {
    const cars = session.world.cars.slice().sort((a, b) => a.team - b.team || this.points(b) - this.points(a));
    return `<table><tr><th>Joueur</th><th>Score</th><th>Buts</th><th>Tirs</th><th>Arrêts</th><th>Touches</th><th>Démos</th><th>Boost</th></tr>
      ${cars.map((c) => `<tr class="t${c.team} ${c === session.player ? 'me' : ''}"><td>${c.name}</td><td>${this.points(c)}</td><td>${c.stats.goals}</td><td>${c.stats.shots}</td><td>${c.stats.saves}</td><td>${c.stats.touches}</td><td>${c.stats.demos}</td><td>${Math.round(c.stats.boostUsed)}</td></tr>`).join('')}</table>`;
  }

  points(c) { return c.stats.goals * 100 + c.stats.shots * 20 + c.stats.saves * 50 + c.stats.touches * 2 + c.stats.demos * 25; }

  endScreen(d, session) {
    const myTeam = session.player ? session.player.team : 0;
    const win = d.score[myTeam] > d.score[1 - myTeam];
    this.$.end.innerHTML = `<div class="end-screen">
      <div class="result ${win ? 'win' : ''}">${win ? 'VICTOIRE' : 'DÉFAITE'}</div>
      <div class="final"><span class="b">${d.score[0]}</span> - <span class="o">${d.score[1]}</span></div>
      <div class="panel">${this.statsTable(session)}</div>
      <div class="row">${session.online
        ? (session.online.role === 'host' ? '<button class="btn primary" data-a="again"><span>Revanche</span></button>' : '<div class="notify" style="animation:none">L\'hôte peut lancer une revanche…</div>')
        : '<button class="btn primary" data-a="again"><span>Rejouer</span></button>'}<button class="btn ghost" data-a="menu"><span>Menu principal</span></button></div>
    </div>`;
    const again = this.$.end.querySelector('[data-a="again"]');
    if (again) again.addEventListener('click', () => {
      this.$.end.innerHTML = '';
      if (session.online) { if (this.game.online.active) this.game.online.startMatch(); else { this.game.backToMenu(); this.game.ui.show('main'); } return; }
      this.game.startGame(session.mode.id, { difficulty: this.game.settings.match.difficulty, duration: this.game.settings.match.duration });
    });
    this.$.end.querySelector('[data-a="menu"]').addEventListener('click', () => {
      this.$.end.innerHTML = '';
      this.game.backToMenu();
      this.game.ui.show('main');
    });
  }

  update(session, dt) {
    const car = session.player;
    const m = session.match;
    if (!session.mode.freeplay) {
      const t = m.overtime ? m.overtimeTime : m.timeLeft;
      const txt = MatchManager.formatTime(t, m.overtime);
      if (this.$.time.textContent !== txt) {
        this.$.time.textContent = txt;
        this.$.time.classList.toggle('ot', m.overtime);
        this.$.time.classList.toggle('low', !m.overtime && m.timeLeft <= 30);
      }
    }
    const b = car.infiniteBoost ? 100 : Math.round(car.boost);
    if (b !== this.lastBoost) {
      this.lastBoost = b;
      this.$.boostnum.textContent = car.infiniteBoost ? '∞' : b;
      this.$.ring.setAttribute('stroke-dashoffset', String(RING * (1 - b / 100)));
      this.$.boost.classList.toggle('empty', b <= 0);
    }
    const kmh = Math.round(car.vel.length() * 0.036);
    if (kmh !== this.lastSpeed) {
      this.lastSpeed = kmh;
      this.$.speed.innerHTML = `${kmh}<small>${car.isSupersonic ? 'SUPERSONIQUE' : 'KM/H'}</small>`;
      this.$.speed.classList.toggle('ss', car.isSupersonic);
    }
    const flipAvail = !car.onGround && !car.hasFlipped && !car.hasDoubleJumped && car.airTimeSinceJump < 1.25;
    const flipTxt = car.onGround ? '' : (flipAvail ? '<b>FLIP DISPONIBLE</b>' : 'FLIP UTILISÉ');
    if (this._flip !== flipTxt) { this._flip = flipTxt; this.$.flip.innerHTML = flipTxt; }
    if (this.boardVisible) {
      this._boardAcc = (this._boardAcc || 0) + dt;
      if (this._boardAcc > 0.5) { this._boardAcc = 0; this.$.board.innerHTML = this.statsTable(session); }
    }
    this.$.ping.classList.toggle('hidden', !session.online);
    if (session.online) {
      this._pingAcc = (this._pingAcc || 0) + dt;
      if (this._pingAcc > 0.5) {
        this._pingAcc = 0;
        const rtt = session.online.link ? Math.round(session.online.link.rtt) : 0;
        this.$.ping.textContent = `${session.online.role === 'host' ? 'Hôte' : 'Invité'} · ping ${rtt} ms`;
        this.$.ping.classList.toggle('bad', rtt > 150);
      }
    }
    const showFps = this.game.settings.graphics.showFps;
    this.$.fps.classList.toggle('hidden', !showFps);
    if (showFps) this.$.fps.textContent = Math.round(this.game.fps) + ' FPS';
  }
}
