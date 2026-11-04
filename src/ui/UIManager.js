// Menus: main, play (mode select), garage, settings, controls help, pause.
import * as THREE from 'three';
import { MODES } from '../modes/MatchManager.js';
import { DIFFICULTY } from '../ai/BotController.js';
import { PAINTS } from '../render/CarModel.js';
import { CarView } from '../render/CarView.js';
import { Car } from '../physics/Car.js';
import { ACTION_LABELS, DEFAULT_BINDINGS } from '../core/Settings.js';

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

export class UIManager {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui');
    this.current = null;
    this.selectedMode = 'duel';
    this.settingsTab = 'graphics';
    this.returnTo = 'main';
    this.show('main');
    this.root.addEventListener('mouseover', (e) => { if (e.target.closest('.btn, .card')) this.game.audio.play('hover'); });
    this.root.addEventListener('click', (e) => { if (e.target.closest('.btn, .card, .swatch, .seg button')) this.game.audio.play('click'); });
  }

  clear() { this.root.innerHTML = ''; }

  show(name) {
    this.clear();
    if (name !== 'garage' && this.game.garage) this.exitGarage();
    this.current = name;
    const fn = { main: this.mainMenu, play: this.playMenu, garage: this.garageMenu, settings: this.settingsMenu, help: this.helpMenu }[name];
    if (fn) fn.call(this);
  }

  hideAll() { this.clear(); this.current = null; }

  // ------------------------------------------------------------ main
  mainMenu() {
    const el = h(`<section class="screen">
      <div class="main-menu">
        <div class="logo">ROCKET<span>ARENA</span></div>
        <div class="tagline">Football · Voitures · Fusées</div>
        <button class="btn primary" data-a="play"><span>▶ Jouer</span></button>
        <button class="btn" data-a="freeplay"><span>Entraînement libre</span></button>
        <button class="btn" data-a="garage"><span>Garage</span></button>
        <button class="btn" data-a="settings"><span>Paramètres</span></button>
        <button class="btn" data-a="help"><span>Commandes &amp; mécaniques</span></button>
      </div>
      <div style="color:var(--muted);font-size:14px;letter-spacing:.1em">Manette recommandée (Xbox / PlayStation) · Clavier ZQSD supporté</div>
    </section>`);
    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      if (a === 'freeplay') { this.hideAll(); this.game.startGame('freeplay'); return; }
      if (a === 'settings') this.returnTo = 'main';
      this.show(a);
    });
    this.root.appendChild(el);
  }

  // ------------------------------------------------------------ play
  playMenu() {
    const st = this.game.settings.match;
    const desc = {
      freeplay: ['Solo', 'Une balle, aucun adversaire. Entraîne aérien, dribbles, flicks, flip resets. Raccourcis 1-6 pour les situations.'],
      duel: ['1v1', 'Toi contre un bot. Le mode le plus exigeant mécaniquement.'],
      doubles: ['2v2', 'Toi + un coéquipier bot contre deux bots. Rotations et passes.'],
      standard: ['3v3', 'Le format classique : toi + 2 bots contre 3 bots.'],
    };
    const el = h(`<section class="screen">
      <h2>Choisir un mode<small>Match contre des bots</small></h2>
      <div class="cards">
        ${Object.values(MODES).map((m) => `<div class="card ${m.id === this.selectedMode ? 'selected' : ''}" data-mode="${m.id}">
          <span class="tag">${desc[m.id][0]}</span><h3>${m.label}</h3><p>${desc[m.id][1]}</p></div>`).join('')}
      </div>
      <div class="row">
        <div class="field"><label>Difficulté des bots</label>
          <div class="seg" data-k="difficulty">${Object.entries(DIFFICULTY).map(([k, d]) => `<button data-v="${k}" class="${st.difficulty === k ? 'on' : ''}">${d.label}</button>`).join('')}</div></div>
        <div class="field"><label>Durée du match</label>
          <div class="seg" data-k="duration">${[[120, '2 min'], [300, '5 min'], [600, '10 min']].map(([v, l]) => `<button data-v="${v}" class="${st.duration === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      </div>
      <div class="row" style="margin-top:12px">
        <button class="btn primary" data-a="go"><span>Lancer le match</span></button>
        <button class="btn ghost" data-a="back"><span>Retour</span></button>
      </div>
    </section>`);
    el.addEventListener('click', (e) => {
      const card = e.target.closest('.card');
      if (card) { this.selectedMode = card.dataset.mode; el.querySelectorAll('.card').forEach((c) => c.classList.toggle('selected', c === card)); return; }
      const segBtn = e.target.closest('.seg button');
      if (segBtn) {
        const k = segBtn.parentElement.dataset.k;
        st[k] = k === 'duration' ? +segBtn.dataset.v : segBtn.dataset.v;
        segBtn.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === segBtn));
        this.game.saveSettings();
        return;
      }
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'back') this.show('main');
      if (a === 'go') { this.hideAll(); this.game.startGame(this.selectedMode, { difficulty: st.difficulty, duration: st.duration }); }
    });
    el.addEventListener('dblclick', (e) => {
      const card = e.target.closest('.card');
      if (card) { this.hideAll(); this.game.startGame(card.dataset.mode, { difficulty: st.difficulty, duration: st.duration }); }
    });
    this.root.appendChild(el);
  }

  // ------------------------------------------------------------ garage
  enterGarage() {
    const g = this.game;
    g.clearSession();
    g.state = 'garage';
    const car = new Car(99, 0);
    car.spawn(0, 0, 1, -0.35, 100);
    car.frozen = true;
    const garage = { car, view: null, t: 0 };
    garage.rebuild = () => {
      if (garage.view) garage.view.dispose();
      garage.view = new CarView(g.gfx.scene, car, g.settings.car, g.particles);
    };
    garage.update = (dt) => {
      garage.t += dt;
      car.isBoosting = Math.sin(garage.t * 0.7) > 0.6;
      for (const w of car.wheels) { w.spin += dt * 3; w.length = 28; }
      garage.view.update(1, dt, g.gfx.camera);
    };
    garage.rebuild();
    g.garage = garage;
    g.camCtl.setOrbit(new THREE.Vector3(0, 0.35, 0), 4.0, 1.1, 0.3);
    g.camCtl.pos.set(3, 2, 3);
  }

  exitGarage() {
    const g = this.game;
    if (!g.garage) return;
    g.garage.view.dispose();
    g.garage = null;
    g.startAttract();
  }

  garageMenu() {
    if (!this.game.garage) this.enterGarage();
    const c = this.game.settings.car;
    const sw = (key, list) => `<div class="swatches" data-k="${key}">${list.map((col) => {
      const hex = typeof col === 'string' ? col : col.hex;
      return `<div class="swatch ${c[key] === hex ? 'on' : ''}" title="${typeof col === 'string' ? hex : col.name}" data-v="${hex}" style="background:${hex}"></div>`;
    }).join('')}<label class="swatch" title="Couleur personnalisée" style="background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red)"><input type="color" value="${c[key]}" data-custom="${key}"></label></div>`;
    const el = h(`<section class="screen">
      <h2>Garage<small>Personnalise ta voiture</small></h2>
      <div class="garage panel">
        <div class="field"><label>Pseudo</label><input type="text" maxlength="16" value="${this.game.settings.player.name}" data-name></div>
        <div class="field"><label>Carrosserie</label><div class="seg" data-k="style">${PAINTS.styles.map((s) => `<button data-v="${s}" class="${c.style === s ? 'on' : ''}">${s}</button>`).join('')}</div></div>
        <div class="field"><label>Peinture</label>${sw('body', PAINTS.body)}</div>
        <div class="field"><label>Accents &amp; aileron</label>${sw('accent', PAINTS.accent)}</div>
        <div class="field"><label>Jantes</label>${sw('wheels', PAINTS.wheels)}</div>
        <div class="field"><label>Couleur du boost</label>${sw('boost', PAINTS.boost)}</div>
        <div class="row"><button class="btn primary small" data-a="back"><span>Valider</span></button></div>
      </div>
    </section>`);
    const apply = () => { this.game.saveSettings(); this.game.garage?.rebuild(); };
    el.addEventListener('click', (e) => {
      const s = e.target.closest('.swatch[data-v]');
      if (s) {
        const k = s.parentElement.dataset.k;
        c[k] = s.dataset.v;
        s.parentElement.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('on', x === s));
        apply();
        return;
      }
      const b = e.target.closest('.seg button');
      if (b) { c.style = b.dataset.v; b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); apply(); return; }
      if (e.target.closest('[data-a="back"]')) this.show('main');
    });
    el.addEventListener('input', (e) => {
      if (e.target.dataset.custom) { c[e.target.dataset.custom] = e.target.value; apply(); }
      if (e.target.hasAttribute('data-name')) { this.game.settings.player.name = e.target.value.slice(0, 16) || 'Joueur'; this.game.saveSettings(); }
    });
    this.root.appendChild(el);
  }

  // ------------------------------------------------------------ settings
  settingsMenu() {
    const tabs = { graphics: 'Graphismes', audio: 'Audio', camera: 'Caméra', controls: 'Commandes' };
    const el = h(`<section class="screen center">
      <div style="width:min(1100px,94vw)">
        <h2>Paramètres</h2>
        <div class="settings-wrap">
          <div class="tabs">${Object.entries(tabs).map(([k, l]) => `<button class="btn ${k === this.settingsTab ? 'on' : ''}" data-tab="${k}"><span>${l}</span></button>`).join('')}
            <div style="height:16px"></div>
            <button class="btn ghost" data-a="back"><span>Retour</span></button>
          </div>
          <div class="settings-content panel"></div>
        </div>
      </div>
    </section>`);
    const content = el.querySelector('.settings-content');
    const render = () => {
      content.innerHTML = '';
      this['settings_' + this.settingsTab](content);
    };
    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]');
      if (t) { this.settingsTab = t.dataset.tab; el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b === t)); render(); return; }
      if (e.target.closest('[data-a="back"]')) {
        if (this.returnTo === 'pause') { this.clear(); this.showPause(); } else this.show('main');
      }
    });
    render();
    this.root.appendChild(el);
  }

  slider(parent, label, obj, key, min, max, step, fmt = (v) => v, onChange, hint = '') {
    const row = h(`<div class="setting"><div>${label}${hint ? `<small>${hint}</small>` : ''}</div><input type="range" min="${min}" max="${max}" step="${step}" value="${obj[key]}"><div class="val">${fmt(obj[key])}</div></div>`);
    const inp = row.querySelector('input'), val = row.querySelector('.val');
    inp.addEventListener('input', () => { obj[key] = +inp.value; val.textContent = fmt(obj[key]); onChange && onChange(); this.game.saveSettings(); });
    parent.appendChild(row);
  }

  toggle(parent, label, obj, key, onChange, hint = '') {
    const row = h(`<div class="setting"><div>${label}${hint ? `<small>${hint}</small>` : ''}</div><div><button class="toggle ${obj[key] ? 'on' : ''}"></button></div><div></div></div>`);
    const b = row.querySelector('button');
    b.addEventListener('click', () => { obj[key] = !obj[key]; b.classList.toggle('on', obj[key]); onChange && onChange(); this.game.saveSettings(); });
    parent.appendChild(row);
  }

  select(parent, label, obj, key, options, onChange, hint = '') {
    const row = h(`<div class="setting"><div>${label}${hint ? `<small>${hint}</small>` : ''}</div><select>${options.map(([v, l]) => `<option value="${v}" ${obj[key] === v ? 'selected' : ''}>${l}</option>`).join('')}</select><div></div></div>`);
    const s = row.querySelector('select');
    s.addEventListener('change', () => { obj[key] = s.value; onChange && onChange(); this.game.saveSettings(); });
    parent.appendChild(row);
  }

  settings_graphics(p) {
    const g = this.game.settings.graphics;
    const apply = () => this.game.applyGraphics();
    this.select(p, 'Qualité graphique', g, 'quality', [['low', 'Basse'], ['medium', 'Moyenne'], ['high', 'Haute'], ['ultra', 'Ultra']], apply, 'Résolution interne, ombres, particules. L\'anti-aliasing s\'applique au prochain chargement.');
    this.slider(p, 'Échelle de rendu', g, 'renderScale', 0.5, 1, 0.05, (v) => Math.round(v * 100) + '%', apply, 'Baisser pour gagner des FPS');
    this.toggle(p, 'Ombres dynamiques', g, 'shadows', apply);
    this.toggle(p, 'Particules (boost, impacts, buts)', g, 'particles', apply);
    this.toggle(p, 'Public dans les tribunes', g, 'crowd', apply);
    this.toggle(p, 'Afficher les FPS', g, 'showFps', () => {});
  }

  settings_audio(p) {
    const a = this.game.settings.audio;
    const apply = () => this.game.audio.applyVolumes();
    const pct = (v) => Math.round(v * 100) + '%';
    this.slider(p, 'Volume général', a, 'master', 0, 1, 0.01, pct, apply);
    this.slider(p, 'Effets sonores', a, 'sfx', 0, 1, 0.01, pct, apply, 'Boost, sauts, impacts, buts');
    this.slider(p, 'Moteur', a, 'engine', 0, 1, 0.01, pct, apply);
    this.slider(p, 'Ambiance du stade', a, 'ambient', 0, 1, 0.01, pct, apply);
  }

  settings_camera(p) {
    const c = this.game.settings.camera;
    this.slider(p, 'Champ de vision (FOV)', c, 'fov', 60, 110, 1, (v) => v + '°');
    this.slider(p, 'Distance', c, 'distance', 100, 400, 10);
    this.slider(p, 'Hauteur', c, 'height', 40, 200, 5);
    this.slider(p, 'Angle', c, 'angle', -15, 0, 1, (v) => v + '°');
    this.slider(p, 'Rigidité', c, 'stiffness', 0, 1, 0.05, (v) => v.toFixed(2), null, 'Plus haut = la caméra suit plus fermement');
    this.slider(p, 'Sensibilité de rotation (swivel)', c, 'swivelSpeed', 1, 10, 0.5, (v) => v.toFixed(1), null, 'Stick droit de la manette / souris');
    this.toggle(p, 'Ball Cam activée par défaut', c, 'ballCamDefault');
    this.toggle(p, 'Rotation caméra à la souris', c, 'mouseSwivel', () => {
      if (c.mouseSwivel) this.game.gfx.renderer.domElement.addEventListener('click', this._lock ||= () => { if (this.game.state === 'playing' && this.game.settings.camera.mouseSwivel) this.game.gfx.renderer.domElement.requestPointerLock?.(); });
    }, 'Clique dans le jeu pour capturer la souris');
    const row = h('<div class="row" style="margin-top:14px"><button class="btn small ghost"><span>Valeurs Rocket League par défaut</span></button></div>');
    row.querySelector('button').addEventListener('click', () => { Object.assign(c, { fov: 110, distance: 270, height: 100, angle: -4, stiffness: 0.45, swivelSpeed: 5 }); this.game.saveSettings(); p.innerHTML = ''; this.settings_camera(p); });
    p.appendChild(row);
  }

  settings_controls(p) {
    const ctl = this.game.settings.controls;
    const inp = this.game.input;
    p.appendChild(h('<div class="bind-row" style="color:var(--muted);font-size:13px;letter-spacing:.2em;text-transform:uppercase"><div>Action</div><div>Touche 1</div><div>Touche 2</div></div>'));
    for (const action of Object.keys(DEFAULT_BINDINGS)) {
      const binds = ctl.bindings[action] || (ctl.bindings[action] = []);
      const row = h(`<div class="bind-row"><div>${ACTION_LABELS[action]}</div><button class="key" data-i="0">${inp.keyLabel(binds[0])}</button><button class="key" data-i="1">${inp.keyLabel(binds[1])}</button></div>`);
      row.querySelectorAll('.key').forEach((b) => b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        b.classList.add('capture'); b.textContent = 'Appuie sur une touche…';
        inp.captureNext((code) => {
          const i = +b.dataset.i;
          if (code) {
            // remove duplicates from other actions
            for (const k of Object.keys(ctl.bindings)) ctl.bindings[k] = ctl.bindings[k].map((c) => (c === code && !(k === action && ctl.bindings[k].indexOf(c) === i) ? null : c));
            binds[i] = code;
          } else binds[i] = null;
          this.game.saveSettings();
          p.innerHTML = ''; this.settings_controls(p);
        });
      }));
      p.appendChild(row);
    }
    this.slider(p, 'Zone morte du stick', ctl, 'deadzone', 0, 0.4, 0.01, (v) => v.toFixed(2));
    this.toggle(p, 'Inverser le tangage (air)', ctl, 'invertPitch');
    const row = h('<div class="row" style="margin-top:14px"><button class="btn small ghost"><span>Réinitialiser les touches</span></button></div>');
    row.querySelector('button').addEventListener('click', () => { ctl.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS)); this.game.saveSettings(); p.innerHTML = ''; this.settings_controls(p); });
    p.appendChild(row);
    p.appendChild(h(`<p style="color:var(--muted);font-size:15px;margin-top:14px">Manette : RT accélérer · LT reculer · A sauter · B boost · X powerslide / air roll · LB/RB air roll · Y ball cam · stick droit caméra · Start pause.<br>Les touches sont liées à leur position physique : ZQSD sur AZERTY = WASD sur QWERTY.</p>`));
  }

  // ------------------------------------------------------------ help
  helpMenu() {
    const k = (a) => this.game.input.keyLabel(this.game.settings.controls.bindings[a]?.[0]);
    const el = h(`<section class="screen center">
      <div style="width:min(1200px,94vw)">
      <h2>Commandes &amp; mécaniques</h2>
      <div class="help-grid">
        <div class="panel"><h3>Commandes de base</h3><table>
          <tr><td>${k('throttle')} / ${k('reverse')}</td><td>Accélérer / reculer — en l'air : piquer / cabrer</td></tr>
          <tr><td>${k('left')} / ${k('right')}</td><td>Tourner — en l'air : lacet</td></tr>
          <tr><td>${k('jump')}</td><td>Sauter (maintenir = plus haut). 2e appui = double saut, ou flip si une direction est tenue</td></tr>
          <tr><td>${k('boost')}</td><td>Boost (sol et air)</td></tr>
          <tr><td>${k('powerslide')}</td><td>Powerslide (drift) — en l'air : air roll libre</td></tr>
          <tr><td>${k('airRollLeft')} / ${k('airRollRight')}</td><td>Air roll gauche / droite</td></tr>
          <tr><td>${k('ballCam')}</td><td>Ball Cam</td></tr>
          <tr><td>Flèches</td><td>Commandes alternatives (conduite + aérien)</td></tr>
          <tr><td>${k('scoreboard')}</td><td>Tableau des scores</td></tr>
          <tr><td>${k('pause')}</td><td>Pause</td></tr>
        </table></div>
        <div class="panel"><h3>Mécaniques</h3><table>
          <tr><td>Front / back / side flip</td><td>Saut puis 2e saut avec une direction (avant, arrière, côté, diagonale)</td></tr>
          <tr><td>Speed flip</td><td>Boost, saut court, flip diagonal puis tirer en arrière (annule la rotation) + air roll pour rester à plat</td></tr>
          <tr><td>Half flip</td><td>En marche arrière : back flip, puis pousser vers l'avant pour annuler, puis air roll</td></tr>
          <tr><td>Wave dash</td><td>Petit saut, nez légèrement levé, flip juste avant que les roues touchent le sol</td></tr>
          <tr><td>Fast aerial</td><td>Saut maintenu + boost, puis double saut immédiat en cabrant</td></tr>
          <tr><td>Flip reset</td><td>Toucher la balle avec les 4 roues (≥3 roues) en l'air : le flip est récupéré</td></tr>
          <tr><td>Flicks / musty</td><td>Balle sur le toit, puis flip (avant, 45°, arrière après avoir levé le nez)</td></tr>
          <tr><td>Wall / ceiling</td><td>Accélère vers un mur : la voiture y adhère. Au plafond, relâche pour tomber avec ton flip</td></tr>
        </table></div>
        <div class="panel"><h3>Entraînement libre</h3><table>
          <tr><td>${k('reset')}</td><td>Réinitialiser voiture et balle</td></tr>
          <tr><td>1</td><td>Balle roulante vers toi</td></tr>
          <tr><td>2</td><td>Balle haute (aérien)</td></tr>
          <tr><td>3</td><td>Balle sur le toit (dribble, flicks)</td></tr>
          <tr><td>4</td><td>Balle vers le mur (wall shot)</td></tr>
          <tr><td>5</td><td>Balle levée (air dribble)</td></tr>
          <tr><td>6</td><td>Balle en hauteur (ceiling shot)</td></tr>
          <tr><td>B / F</td><td>Boost illimité on/off · stopper la voiture</td></tr>
        </table></div>
      </div>
      <div class="row" style="margin-top:18px"><button class="btn ghost" data-a="back"><span>Retour</span></button></div>
      </div>
    </section>`);
    el.querySelector('[data-a="back"]').addEventListener('click', () => this.show(this.returnTo === 'pause' ? 'main' : 'main'));
    this.root.appendChild(el);
  }

  // ------------------------------------------------------------ pause
  showPause() {
    this.clear();
    const free = this.game.session?.mode.freeplay;
    const el = h(`<section class="screen center pause-menu">
      <div class="main-menu" style="margin:0">
        <div class="logo" style="font-size:54px">PAUSE</div>
        <button class="btn primary" data-a="resume"><span>Reprendre</span></button>
        ${free ? '<button class="btn" data-a="reset"><span>Réinitialiser</span></button>' : '<button class="btn" data-a="restart"><span>Recommencer le match</span></button>'}
        <button class="btn" data-a="settings"><span>Paramètres</span></button>
        <button class="btn ghost" data-a="quit"><span>Quitter vers le menu</span></button>
      </div>
    </section>`);
    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      const g = this.game;
      if (a === 'resume') g.togglePause(false);
      if (a === 'reset') { g.session.match.kickoff(); g.togglePause(false); }
      if (a === 'restart') { const s = g.session; this.clear(); g.paused = false; g.startGame(s.mode.id, { difficulty: g.settings.match.difficulty, duration: g.settings.match.duration }); }
      if (a === 'settings') { this.returnTo = 'pause'; this.show('settings'); }
      if (a === 'quit') { g.paused = false; this.clear(); g.backToMenu(); this.show('main'); }
    });
    this.root.appendChild(el);
  }

  hidePause() { this.clear(); this.returnTo = 'main'; }
}
