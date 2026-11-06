// Keyboard (+ mouse buttons) and gamepad input -> Controls.
// Bindings use KeyboardEvent.code (physical key position): the default ZQSD layout on
// an AZERTY keyboard is automatically WASD on a QWERTY keyboard.
import { Controls } from '../physics/Controls.js';

const AZERTY_LABELS = { KeyW: 'Z', KeyA: 'Q', KeyQ: 'A', KeyZ: 'W', KeyM: ',', Semicolon: 'M' };

export class InputManager {
  constructor(settings) {
    this.settings = settings;
    this.down = new Set();
    this.pressedOnce = new Set(); // edge-triggered meta actions
    this.controls = new Controls();
    this.capture = null;
    this.layoutMap = null;
    this.gamepadIndex = -1;
    this.lastGamepadButtons = [];
    this.swivel = { x: 0, y: 0 };
    this.mouseSwivel = { x: 0, y: 0 };
    this.usingGamepad = false;
    this.enabled = true;

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('mousedown', (e) => this.onMouse(e, true));
    window.addEventListener('mouseup', (e) => this.onMouse(e, false));
    window.addEventListener('contextmenu', (e) => { if (this.enabled && this.inGame) e.preventDefault(); });
    window.addEventListener('blur', () => this.down.clear());
    window.addEventListener('gamepadconnected', (e) => { this.gamepadIndex = e.gamepad.index; this.onGamepadChange?.(e.gamepad.id); });
    window.addEventListener('gamepaddisconnected', () => { this.gamepadIndex = -1; this.onGamepadChange?.(null); });
    window.addEventListener('mousemove', (e) => {
      if (this.inGame && this.settings.camera.mouseSwivel && document.pointerLockElement) {
        this.mouseSwivel.x = Math.max(-1, Math.min(1, this.mouseSwivel.x + e.movementX * 0.003));
        this.mouseSwivel.y = Math.max(-1, Math.min(1, this.mouseSwivel.y + e.movementY * 0.003));
      }
    });
    try {
      if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
        navigator.keyboard.getLayoutMap().then((m) => { this.layoutMap = m; this.onLayout?.(); }).catch(() => {});
      }
    } catch (e) { /* ignore */ }
    this.inGame = false;
  }

  keyLabel(code) {
    if (!code) return '—';
    if (code.startsWith('Mouse')) return ['Clic gauche', 'Clic molette', 'Clic droit', 'Souris 4', 'Souris 5'][+code.slice(5)] || code;
    const special = {
      Space: 'Espace', ShiftLeft: 'Maj gauche', ShiftRight: 'Maj droite', ControlLeft: 'Ctrl gauche', ControlRight: 'Ctrl droite',
      AltLeft: 'Alt', AltRight: 'Alt Gr', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Échap', Tab: 'Tab', Enter: 'Entrée',
    };
    if (special[code]) return special[code];
    if (this.layoutMap && this.layoutMap.get(code)) return this.layoutMap.get(code).toUpperCase();
    const fr = (navigator.language || '').toLowerCase().startsWith('fr');
    if (fr && AZERTY_LABELS[code]) return AZERTY_LABELS[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    return code;
  }

  onKey(e, isDown) {
    if (this.capture && isDown) {
      e.preventDefault();
      const cb = this.capture; this.capture = null;
      cb(e.code === 'Escape' ? null : e.code);
      return;
    }
    if (!this.enabled) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (this.inGame && (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow'))) e.preventDefault();
    if (isDown) {
      if (!this.down.has(e.code)) this.pressedOnce.add(e.code);
      this.down.add(e.code);
    } else this.down.delete(e.code);
  }

  onMouse(e, isDown) {
    const code = 'Mouse' + e.button;
    if (this.capture && isDown) { const cb = this.capture; this.capture = null; cb(code); e.preventDefault(); return; }
    if (!this.enabled || !this.inGame) return;
    if (e.target && e.target.closest && e.target.closest('button, .panel, .menu')) return;
    if (isDown) { if (!this.down.has(code)) this.pressedOnce.add(code); this.down.add(code); } else this.down.delete(code);
  }

  captureNext(cb) { this.capture = cb; }

  isDown(action) {
    const b = this.settings.controls.bindings[action];
    if (!b) return false;
    for (const c of b) if (c && this.down.has(c)) return true;
    return false;
  }

  /** edge triggered (true once per press) for meta actions */
  consume(action) {
    const b = this.settings.controls.bindings[action] || [];
    let hit = false;
    for (const c of b) if (c && this.pressedOnce.has(c)) { hit = true; this.pressedOnce.delete(c); }
    if (this.gpPressed && this.gpPressed.has(action)) { this.gpPressed.delete(action); hit = true; }
    return hit;
  }

  clearEdges() { this.pressedOnce.clear(); if (this.gpPressed) this.gpPressed.clear(); }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    if (this.gamepadIndex >= 0) gp = pads[this.gamepadIndex];
    if (!gp) for (const p of pads) if (p) { gp = p; this.gamepadIndex = p.index; break; }
    return gp;
  }

  update() {
    const c = this.controls;
    const kb = (a) => (this.isDown(a) ? 1 : 0);
    let throttle = kb('throttle') - kb('reverse');
    let steer = kb('right') - kb('left');
    let pitch = kb('reverse') - kb('throttle'); // forward key = nose down
    if (this.settings.controls.invertPitch) pitch = -pitch;
    let roll = kb('airRollRight') - kb('airRollLeft');
    let jump = this.isDown('jump'), boost = this.isDown('boost'), slide = this.isDown('powerslide');
    let freeRoll = this.isDown('airRoll');

    this.swivel.x = this.mouseSwivel.x; this.swivel.y = this.mouseSwivel.y;
    if (!this.settings.camera.mouseSwivel || !document.pointerLockElement) { this.mouseSwivel.x *= 0.9; this.mouseSwivel.y *= 0.9; }

    const gp = this.pollGamepad();
    if (gp) {
      const dz = this.settings.controls.deadzone;
      const ax = (v) => (Math.abs(v) < dz ? 0 : Math.sign(v) * (Math.abs(v) - dz) / (1 - dz));
      const btn = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
      const val = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);
      const lx = ax(gp.axes[0] || 0), ly = ax(gp.axes[1] || 0);
      const rx = ax(gp.axes[2] || 0), ry = ax(gp.axes[3] || 0);
      const gThrottle = val(7) - val(6);
      const anyInput = Math.abs(lx) + Math.abs(ly) + Math.abs(gThrottle) + (btn(0) || btn(1) ? 1 : 0) > 0.05;
      if (anyInput) this.usingGamepad = true;
      if (Math.abs(gThrottle) > Math.abs(throttle)) throttle = gThrottle;
      if (Math.abs(lx) > Math.abs(steer)) steer = lx;
      const gPitch = this.settings.controls.invertPitch ? -ly : ly;
      if (Math.abs(gPitch) > Math.abs(pitch)) pitch = gPitch;
      if (btn(4)) roll = -1; if (btn(5)) roll = 1;
      jump = jump || btn(0);
      boost = boost || btn(1);
      slide = slide || btn(2);
      if (Math.abs(rx) > 0.05 || Math.abs(ry) > 0.05) { this.swivel.x = rx; this.swivel.y = ry; }
      // edge-triggered gamepad buttons
      if (!this.gpPressed) this.gpPressed = new Set();
      const map = { 3: 'ballCam', 9: 'pause', 8: 'scoreboard', 13: 'reset' };
      for (const [i, action] of Object.entries(map)) {
        const p = btn(+i);
        if (p && !this.lastGamepadButtons[i]) this.gpPressed.add(action);
        this.lastGamepadButtons[i] = p;
      }
    }

    c.throttle = Math.max(-1, Math.min(1, throttle));
    c.steer = Math.max(-1, Math.min(1, steer));
    c.yaw = c.steer;
    c.pitch = Math.max(-1, Math.min(1, pitch));
    c.roll = roll;
    c.jump = jump; c.boost = boost; c.handbrake = slide; c.airRoll = slide || freeRoll;
    return c;
  }
}
