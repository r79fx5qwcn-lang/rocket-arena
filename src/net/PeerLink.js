// Peer-to-peer link between two browsers (WebRTC data channel via PeerJS).
// No server of our own: PeerJS's free public broker is only used to introduce the two
// players to each other; game data then flows directly between the two browsers.
const PREFIX = 'rocket-arena-v1-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode(n = 6) {
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export function normalizeCode(c) { return (c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); }

async function loadPeer() {
  const mod = await import('peerjs');
  return mod.Peer || mod.default;
}

const ERRORS = {
  'peer-unavailable': 'Partie introuvable : vérifie le code (l\'hôte doit garder sa page ouverte).',
  'network': 'Problème de connexion réseau.',
  'server-error': 'Le service de mise en relation est indisponible, réessaie dans un instant.',
  'socket-error': 'Le service de mise en relation est injoignable.',
  'browser-incompatible': 'Ce navigateur ne supporte pas WebRTC.',
  'unavailable-id': 'Ce code est déjà utilisé.',
};
export const describeError = (e) => ERRORS[e && e.type] || (e && e.message) || 'Erreur de connexion.';

export class PeerLink {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.code = null;
    this.handlers = { message: [], close: [], status: [] };
    this.rtt = 0;
    this.closed = false;
  }

  on(ev, fn) { this.handlers[ev].push(fn); }
  emit(ev, data) { for (const f of this.handlers[ev]) f(data); }

  /** Host: create a game. Resolves with the invitation code once registered. */
  async host(onGuestConnected) {
    const Peer = await loadPeer();
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = randomCode();
      try {
        await new Promise((resolve, reject) => {
          const peer = new Peer(PREFIX + code, { debug: 1 });
          this.peer = peer;
          peer.on('open', () => resolve());
          peer.on('error', (e) => { if (!this.code) { peer.destroy(); reject(e); } else this.emit('status', describeError(e)); });
          peer.on('connection', (conn) => {
            if (this.conn && this.conn.open) { conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 500); }); return; }
            this.attach(conn);
            conn.on('open', () => onGuestConnected && onGuestConnected());
          });
          peer.on('disconnected', () => { if (!this.closed && !this.conn) { try { peer.reconnect(); } catch (e) { /* ignore */ } } });
        });
        this.code = code;
        return code;
      } catch (e) {
        if (e && e.type === 'unavailable-id') continue;
        throw e;
      }
    }
    throw new Error('Impossible de créer une partie, réessaie.');
  }

  /** Guest: join with a code. Resolves when the data channel is open. */
  async join(code) {
    const Peer = await loadPeer();
    this.code = normalizeCode(code);
    await new Promise((resolve, reject) => {
      const peer = new Peer(undefined, { debug: 1 });
      this.peer = peer;
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; reject(new Error('Délai dépassé : l\'hôte ne répond pas.')); } }, 15000);
      peer.on('error', (e) => { if (!done) { done = true; clearTimeout(timer); reject(e); } else this.emit('status', describeError(e)); });
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' });
        this.attach(conn);
        conn.on('open', () => { if (!done) { done = true; clearTimeout(timer); resolve(); } });
      });
    });
  }

  attach(conn) {
    this.conn = conn;
    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'ping') { this.send({ t: 'pong', ts: msg.ts }); return; }
      if (msg.t === 'pong') { this.rtt = performance.now() - msg.ts; return; }
      this.emit('message', msg);
    });
    conn.on('close', () => { if (!this.closed) this.emit('close'); });
    conn.on('error', () => { if (!this.closed) this.emit('close'); });
    this.pingTimer = setInterval(() => { if (conn.open) this.send({ t: 'ping', ts: performance.now() }); }, 1000);
  }

  get connected() { return !!(this.conn && this.conn.open); }

  send(msg) {
    if (this.conn && this.conn.open) {
      try { this.conn.send(msg); } catch (e) { /* channel closing */ }
    }
  }

  close() {
    this.closed = true;
    clearInterval(this.pingTimer);
    try { if (this.conn) this.conn.close(); } catch (e) { /* ignore */ }
    try { if (this.peer) this.peer.destroy(); } catch (e) { /* ignore */ }
  }
}
