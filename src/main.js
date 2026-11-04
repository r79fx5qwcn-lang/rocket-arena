import './styles/main.css';
import { Game } from './core/Game.js';
import { UIManager } from './ui/UIManager.js';
import { HUD } from './ui/HUD.js';

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2')) || !!c.getContext('webgl');
  } catch (e) { return false; }
}

const loading = document.getElementById('loading');
if (!webglAvailable()) {
  loading.querySelector('p').textContent = 'WebGL n\'est pas disponible sur ce navigateur. Active l\'accélération matérielle ou utilise Chrome / Firefox / Edge / Safari récent.';
} else {
  try {
    const game = new Game(document.getElementById('game-container'), UIManager, HUD);
    window.__game = game; // handy for debugging in the console
    requestAnimationFrame(() => setTimeout(() => loading.classList.add('done'), 300));
  } catch (err) {
    console.error(err);
    loading.querySelector('p').textContent = 'Erreur au démarrage : ' + err.message;
  }
}
