// All sounds are synthesised with the Web Audio API (no audio files to load).
export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.ready = false;
    this.listener = { x: 0, y: 0, z: 0 };
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4;
    this.master.connect(this.comp); this.comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.engineBus = ctx.createGain(); this.engineBus.connect(this.master);
    this.ambient = ctx.createGain(); this.ambient.connect(this.master);

    // noise buffers
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.03; b1 = 0.985 * b1 + w * 0.06; b2 = 0.95 * b2 + w * 0.12;
      d[i] = (b0 + b1 + b2 + w * 0.12) * 0.6; // pinkish noise
    }

    // engine
    this.engOsc1 = ctx.createOscillator(); this.engOsc1.type = 'sawtooth';
    this.engOsc2 = ctx.createOscillator(); this.engOsc2.type = 'square';
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.Q.value = 3;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    this.engOsc1.connect(this.engFilter); this.engOsc2.connect(g2); g2.connect(this.engFilter);
    this.engFilter.connect(this.engGain); this.engGain.connect(this.engineBus);
    this.engOsc1.start(); this.engOsc2.start();

    // boost loop
    this.boostSrc = this.loopNoise();
    this.boostFilter = ctx.createBiquadFilter(); this.boostFilter.type = 'bandpass'; this.boostFilter.frequency.value = 900; this.boostFilter.Q.value = 0.7;
    this.boostGain = ctx.createGain(); this.boostGain.gain.value = 0;
    this.boostSrc.connect(this.boostFilter); this.boostFilter.connect(this.boostGain); this.boostGain.connect(this.sfx);

    // crowd ambience
    this.crowdSrc = this.loopNoise();
    this.crowdFilter = ctx.createBiquadFilter(); this.crowdFilter.type = 'bandpass'; this.crowdFilter.frequency.value = 700; this.crowdFilter.Q.value = 0.5;
    this.crowdGain = ctx.createGain(); this.crowdGain.gain.value = 0;
    this.crowdSrc.connect(this.crowdFilter); this.crowdFilter.connect(this.crowdGain); this.crowdGain.connect(this.ambient);

    this.ready = true;
    this.applyVolumes();
  }

  loopNoise() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise; s.loop = true; s.start(0, Math.random() * 1.5);
    return s;
  }

  applyVolumes() {
    if (!this.ready) return;
    const a = this.settings.audio;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(a.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(a.sfx, t, 0.05);
    this.engineBus.gain.setTargetAtTime(a.engine, t, 0.05);
    this.ambient.gain.setTargetAtTime(a.ambient, t, 0.05);
  }

  setListener(p) { this.listener = p; }

  attenuation(pos) {
    if (!pos) return 1;
    const dx = pos.x - this.listener.x, dy = pos.y - this.listener.y, dz = pos.z - this.listener.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz); // render units (m)
    return 1 / (1 + d * 0.06);
  }

  /** Called every frame with the player's car state */
  updateCar(car, inMatch) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    if (!car || car.demolished || !inMatch) {
      this.engGain.gain.setTargetAtTime(0, t, 0.1);
      this.boostGain.gain.setTargetAtTime(0, t, 0.05);
      return;
    }
    const speed = car.vel.length();
    const r = Math.min(1, speed / 2300);
    const thr = Math.abs(car.controls.throttle) || (car.isBoosting ? 1 : 0);
    const base = car.onGround ? 42 + r * 95 + thr * 12 : 55 + r * 70 + thr * 8;
    this.engOsc1.frequency.setTargetAtTime(base, t, 0.06);
    this.engOsc2.frequency.setTargetAtTime(base * 0.5, t, 0.06);
    this.engFilter.frequency.setTargetAtTime(300 + r * 1400 + thr * 500, t, 0.06);
    this.engGain.gain.setTargetAtTime(0.05 + thr * 0.07 + r * 0.06, t, 0.08);
    this.boostGain.gain.setTargetAtTime(car.isBoosting ? 0.5 : 0, t, car.isBoosting ? 0.03 : 0.12);
    this.boostFilter.frequency.setTargetAtTime(car.isSupersonic ? 1400 : 900, t, 0.2);
  }

  setCrowd(level) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.crowdGain.gain.setTargetAtTime(0.06 + level * 0.35, t, level > 0.5 ? 0.15 : 1.2);
    this.crowdFilter.frequency.setTargetAtTime(600 + level * 700, t, 0.4);
  }

  // ---------- one-shots ----------
  env(node, peak, attack, decay, start = this.ctx.currentTime) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
    node.connect(g); g.connect(this.sfx);
    return g;
  }

  noiseShot(type, freq, q, peak, attack, decay, sweepTo = null) {
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + decay);
    s.connect(f); this.env(f, peak, attack, decay);
    s.start(t, Math.random()); s.stop(t + attack + decay + 0.05);
  }

  tone(type, f0, f1, peak, attack, decay, delay = 0) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
    this.env(o, peak, attack, decay, t);
    o.start(t); o.stop(t + attack + decay + 0.05);
  }

  play(name, opts = {}) {
    if (!this.ready) return;
    const a = this.attenuation(opts.pos);
    const k = opts.strength ?? 1;
    switch (name) {
      case 'jump': this.noiseShot('highpass', 1200, 0.7, 0.25 * a, 0.005, 0.18, 3000); this.tone('sine', 180, 320, 0.15 * a, 0.005, 0.12); break;
      case 'doubleJump': this.noiseShot('highpass', 1500, 0.7, 0.2 * a, 0.005, 0.15, 3500); break;
      case 'flip': this.noiseShot('bandpass', 400, 1.2, 0.35 * a, 0.02, 0.35, 2200); break;
      case 'land': this.noiseShot('lowpass', 300, 1, 0.25 * a * k, 0.003, 0.15); break;
      case 'ballHit': {
        const s = Math.min(1, k / 3500);
        this.tone('sine', 150 + s * 90, 45, (0.35 + s * 0.6) * a, 0.002, 0.25 + s * 0.2);
        this.noiseShot('bandpass', 1800 + s * 1500, 1.5, (0.2 + s * 0.5) * a, 0.001, 0.12 + s * 0.1);
        if (s > 0.6) this.noiseShot('lowpass', 500, 1, 0.5 * a, 0.002, 0.5);
        break;
      }
      case 'ballBounce': { const s = Math.min(1, k / 2500); this.tone('sine', 110, 50, 0.25 * s * a, 0.002, 0.2); this.noiseShot('lowpass', 900, 1, 0.12 * s * a, 0.001, 0.1); break; }
      case 'carImpact': { const s = Math.min(1, k / 2000); this.noiseShot('lowpass', 700, 1.5, 0.4 * s * a, 0.002, 0.18); this.tone('square', 90, 40, 0.08 * s * a, 0.002, 0.12); break; }
      case 'bump': this.noiseShot('lowpass', 900, 2, 0.6 * a, 0.002, 0.25); this.tone('sawtooth', 120, 40, 0.2 * a, 0.002, 0.2); break;
      case 'demo':
        this.noiseShot('lowpass', 1200, 1, 0.9 * a, 0.005, 1.2, 80);
        this.tone('sawtooth', 90, 30, 0.4 * a, 0.005, 0.9);
        break;
      case 'boostStart': this.noiseShot('bandpass', 500, 1, 0.25 * a, 0.01, 0.25, 2500); break;
      case 'pickupSmall': this.tone('sine', 880, 1320, 0.12 * a, 0.005, 0.12); break;
      case 'pickupBig': this.tone('sine', 660, 1320, 0.18 * a, 0.01, 0.3); this.tone('triangle', 990, 1980, 0.1 * a, 0.01, 0.3, 0.05); break;
      case 'goal': {
        this.noiseShot('lowpass', 2000, 0.8, 1.0, 0.005, 2.2, 60);
        this.tone('sawtooth', 70, 35, 0.6, 0.01, 1.6);
        // stadium horn
        for (const [f, dl] of [[220, 0.25], [277, 0.25], [330, 0.25], [220, 1.1], [277, 1.1], [330, 1.1]]) this.tone('sawtooth', f, f, 0.08, 0.05, 0.75, dl);
        break;
      }
      case 'beep': this.tone('sine', 620, 620, 0.25, 0.005, 0.25); break;
      case 'go': this.tone('sine', 930, 930, 0.3, 0.005, 0.5); this.tone('triangle', 1860, 1860, 0.1, 0.005, 0.4); break;
      case 'click': this.tone('triangle', 900, 1200, 0.08, 0.002, 0.06); break;
      case 'hover': this.tone('sine', 1500, 1500, 0.025, 0.002, 0.04); break;
      case 'whistle': this.tone('sine', 2100, 2000, 0.2, 0.01, 0.6); this.tone('sine', 2600, 2500, 0.1, 0.01, 0.6); break;
      case 'flipReset': this.tone('sine', 1200, 2400, 0.15, 0.005, 0.18); break;
      default: break;
    }
  }
}
