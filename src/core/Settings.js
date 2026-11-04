// Persistent settings (localStorage, failure tolerant).
const KEY = 'rocket-arena-settings-v1';

export const DEFAULT_BINDINGS = {
  throttle: ['KeyW', 'ArrowUp'],
  reverse: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space', 'Mouse2'],
  boost: ['ShiftLeft', 'Mouse0'],
  powerslide: ['ShiftRight', 'ControlLeft'],
  airRollLeft: ['KeyQ'],
  airRollRight: ['KeyE'],
  ballCam: ['KeyC'],
  reset: ['KeyR'],
  scoreboard: ['Tab'],
  pause: ['Escape'],
};

export const ACTION_LABELS = {
  throttle: 'Accélérer / Piquer du nez (air)',
  reverse: 'Reculer / Cabrer (air)',
  left: 'Tourner à gauche / Lacet gauche',
  right: 'Tourner à droite / Lacet droite',
  jump: 'Sauter (2× = double saut / flip)',
  boost: 'Boost',
  powerslide: 'Powerslide / Air roll libre',
  airRollLeft: 'Air roll gauche',
  airRollRight: 'Air roll droite',
  ballCam: 'Ball Cam (on/off)',
  reset: 'Réinitialiser (entraînement)',
  scoreboard: 'Tableau des scores',
  pause: 'Pause / Menu',
};

export function defaultSettings() {
  return {
    player: { name: 'Joueur' },
    car: { style: 'Octane', body: '#1f6bff', accent: '#111318', wheels: '#c8ccd4', boost: '#ff9a2a' },
    graphics: { quality: 'high', shadows: true, renderScale: 1, particles: true, showFps: false, crowd: true },
    audio: { master: 0.8, sfx: 0.9, engine: 0.55, ambient: 0.6 },
    camera: { fov: 110, distance: 270, height: 100, angle: -4, stiffness: 0.45, swivelSpeed: 5, ballCamDefault: true, mouseSwivel: false },
    controls: { bindings: structuredCloneSafe(DEFAULT_BINDINGS), deadzone: 0.12, dodgeDeadzone: 0.5, invertPitch: false },
    match: { duration: 300, difficulty: 'pro', unlimitedBoostFreeplay: true },
  };
}

function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)); }

function merge(base, over) {
  if (!over || typeof over !== 'object') return base;
  for (const k of Object.keys(base)) {
    if (over[k] === undefined) continue;
    if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) base[k] = merge(base[k], over[k]);
    else if (typeof over[k] === typeof base[k]) base[k] = over[k];
  }
  // bindings may contain unknown keys from older versions: keep only known actions
  return base;
}

export function loadSettings() {
  const s = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) merge(s, JSON.parse(raw));
  } catch (e) { /* storage unavailable */ }
  return s;
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
}
