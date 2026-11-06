// Arena themes (visual only: the playing field geometry is identical everywhere).
export const THEMES = {
  night: {
    name: 'Stade Nocturne',
    sky: ['#05060f', '#151a3a', '#2b2350', '#0b0c18'], stars: true,
    fog: 0x0b0d1a, fogNear: 120, fogFar: 520, exposure: 1.05,
    hemi: [0xbfd4ff, 0x2a3a2a, 1.1], sun: [0xffffff, 2.4], fill: [0x8899ff, 0.6],
    grass: ['#2f7d32', '#378c3a'], lines: 'rgba(255,255,255,0.85)',
    ramp: 0x2a4a3a, glass: 0x0a1630, glassOpacity: 0.28, panelOpacity: 0.55, ceiling: 0x6688ff,
    stands: 0x1b2030, trim: 0x2244aa, ground: 0x0c0f18, lamps: 0xf4f6ff,
    weather: 'none', decor: 'towers',
  },
  sunset: {
    name: 'Coucher de Soleil',
    sky: ['#2a1b4a', '#a8456a', '#ff9a4a', '#3a2030'], stars: false,
    fog: 0x6a3a40, fogNear: 140, fogFar: 600, exposure: 1.12,
    hemi: [0xffd2a8, 0x3a3020, 1.15], sun: [0xffb070, 2.6], fill: [0xff7aa0, 0.5],
    grass: ['#4a8a2e', '#55993a'], lines: 'rgba(255,248,235,0.85)',
    ramp: 0x4a4a30, glass: 0x2a1426, glassOpacity: 0.22, panelOpacity: 0.45, ceiling: 0xffaa77,
    stands: 0x3a2a30, trim: 0xff7a3a, ground: 0x2a1c18, lamps: 0xfff0d0,
    weather: 'none', decor: 'palms',
  },
  neon: {
    name: 'Néo Métropole',
    sky: ['#03010a', '#1a0630', '#3a0a4a', '#05020c'], stars: false,
    fog: 0x12051e, fogNear: 100, fogFar: 480, exposure: 1.1,
    hemi: [0xb48cff, 0x101020, 1.0], sun: [0xd0b0ff, 1.9], fill: [0x22d3ee, 0.9],
    grass: ['#1f5a3a', '#256a44'], lines: 'rgba(120,255,255,0.9)',
    ramp: 0x1a1a3a, glass: 0x14062a, glassOpacity: 0.32, panelOpacity: 0.75, ceiling: 0xff3fa6,
    stands: 0x140c24, trim: 0xff2fd0, ground: 0x07040e, lamps: 0x9ff8ff,
    weather: 'rain', decor: 'city',
  },
  tundra: {
    name: 'Toundra Gelée',
    sky: ['#6f8fb8', '#b9cde6', '#e6eef8', '#9fb2c8'], stars: false,
    fog: 0xc4d2e4, fogNear: 110, fogFar: 460, exposure: 1.0,
    hemi: [0xe8f2ff, 0x8899aa, 1.3], sun: [0xf0f6ff, 2.2], fill: [0xaaccff, 0.6],
    grass: ['#5a8a6e', '#669a7a'], lines: 'rgba(255,255,255,0.95)',
    ramp: 0xa8b8c8, glass: 0x8aa8c8, glassOpacity: 0.18, panelOpacity: 0.35, ceiling: 0xd8ecff,
    stands: 0x6a7888, trim: 0x88ccff, ground: 0xe8eef6, lamps: 0xffffff,
    weather: 'snow', decor: 'pines',
  },
  desert: {
    name: 'Désert Rouge',
    sky: ['#6a3a20', '#c8703a', '#f0b070', '#8a5a3a'], stars: false,
    fog: 0xc08050, fogNear: 120, fogFar: 520, exposure: 1.05,
    hemi: [0xffd8a0, 0x6a4020, 1.2], sun: [0xffc080, 2.7], fill: [0xff9050, 0.4],
    grass: ['#7a8a3a', '#869a44'], lines: 'rgba(255,250,235,0.85)',
    ramp: 0x8a6a40, glass: 0x3a2010, glassOpacity: 0.22, panelOpacity: 0.4, ceiling: 0xffc080,
    stands: 0x5a4030, trim: 0xff8a2a, ground: 0xc89a60, lamps: 0xfff0d0,
    weather: 'dust', decor: 'rocks',
  },
  forest: {
    name: 'Forêt d\'Automne',
    sky: ['#4a7ab8', '#8ab8e0', '#d8e8f0', '#6a8a6a'], stars: false,
    fog: 0x9ab0a0, fogNear: 130, fogFar: 520, exposure: 1.0,
    hemi: [0xdfeeff, 0x4a5a30, 1.25], sun: [0xfff2dd, 2.5], fill: [0xffc080, 0.4],
    grass: ['#3a8a34', '#44983c'], lines: 'rgba(255,255,255,0.9)',
    ramp: 0x4a5a3a, glass: 0x1a2a20, glassOpacity: 0.2, panelOpacity: 0.4, ceiling: 0xcceeff,
    stands: 0x4a3a2a, trim: 0xff9a3a, ground: 0x3a4a24, lamps: 0xffffff,
    weather: 'leaves', decor: 'trees',
  },
  day: {
    name: 'Plein Jour',
    sky: ['#2a6ad0', '#6aa8f0', '#cfe6ff', '#7aa0c8'], stars: false,
    fog: 0xa8c8e8, fogNear: 150, fogFar: 650, exposure: 1.0,
    hemi: [0xeaf4ff, 0x5a6a4a, 1.35], sun: [0xffffff, 2.8], fill: [0xaaccff, 0.5],
    grass: ['#3a9a3a', '#46aa44'], lines: 'rgba(255,255,255,0.95)',
    ramp: 0x3a5a4a, glass: 0x1a2a40, glassOpacity: 0.18, panelOpacity: 0.35, ceiling: 0xaaccff,
    stands: 0x3a4250, trim: 0x2a7bff, ground: 0x4a5a3a, lamps: 0xffffff,
    weather: 'none', decor: 'towers',
  },
};

export const THEME_IDS = Object.keys(THEMES);
export function pickTheme(id) {
  if (!id || id === 'random' || !THEMES[id]) return THEME_IDS[Math.floor(Math.random() * THEME_IDS.length)];
  return id;
}
