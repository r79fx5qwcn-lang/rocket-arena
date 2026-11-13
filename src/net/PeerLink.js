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
// Several public STUN servers: they help both browsers find a DIRECT route to each other
// (lowest ping). The TURN relay is only a last resort when no direct route exists (strict
// NAT / firewall): the data then makes a detour through a relay server and the ping rises.
const PEER_OPTIONS = {
  debug: 1,
  config: {
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
    ],
  },
};
const median = (a) => { const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };

export const describeError = (e) => ERRORS[e && e.type] || (e && e.message) || 'Erreur de connexion.';

export class PeerLink {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.code = null;
    this.handlers = { message: [], close: [], status: [] };
    this.rtt = 0;          // ping measured by the game over the channel that carries the match
    this.netRtt = null;    // pure network ping reported by WebRTC (no game / PC delay)
    this.relayed = false;  // true if the data goes through a TURN relay (no direct route)
    this.samples = [];
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
          const peer = new Peer(PREFIX + code, PEER_OPTIONS);
          this.peer = peer;
          peer.on('open', () => resolve());
          peer.on('error', (e) => { if (!this.code) { peer.destroy(); reject(e); } else this.emit('status', describeError(e)); });
          peer.on('connection', (conn) => {
            if (conn.label === 'fast') {
              // unreliable / unordered channel for snapshots and inputs (no lag spikes on packet loss)
              if (this.conn && conn.peer === this.conn.peer) this.attachFast(conn); else conn.close();
              return;
            }
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
      const peer = new Peer(undefined, PEER_OPTIONS);
      this.peer = peer;
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; reject(new Error('Délai dépassé : l\'hôte ne répond pas.')); } }, 15000);
      peer.on('error', (e) => { if (!done) { done = true; clearTimeout(timer); reject(e); } else this.emit('status', describeError(e)); });
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + this.code, { label: 'ctrl', reliable: true, serialization: 'json' });
        this.attach(conn);
        conn.on('open', () => {
          if (!done) { done = true; clearTimeout(timer); resolve(); }
          const fast = peer.connect(PREFIX + this.code, { label: 'fast', reliable: false, serialization: 'json' });
          this.attachFast(fast);
        });
      });
    });
  }

  attach(conn) {
    this.conn = conn;
    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'ping') { this.send({ t: 'pong', ts: msg.ts }); return; }
      if (msg.t === 'pong') { if (!this.fastOpen()) this.addSample(performance.now() - msg.ts); return; }
      this.emit('message', msg);
    });
    conn.on('close', () => { if (!this.closed) this.emit('close'); });
    conn.on('error', () => { if (!this.closed) this.emit('close'); });
    // ping every 0.5 s on the fast channel (the one that carries the game), the reliable
    // channel being only a fallback before the fast one is open
    this.pingTimer = setInterval(() => {
      if (this.fastOpen()) { try { this.fast.send({ t: 'fp', ts: performance.now() }); } catch (e) { /* closing */ } } else if (conn.open) this.send({ t: 'ping', ts: performance.now() });
    }, 500);
    this.statsTimer = setInterval(() => this.readStats(), 2000);
  }

  fastOpen() { return !!(this.fast && this.fast.open); }

  addSample(ms) {
    this.samples.push(ms);
    if (this.samples.length > 7) this.samples.shift();
    this.rtt = median(this.samples); // median: a single late packet doesn't make the number jump
  }

  /** real network round trip time and route type, straight from WebRTC */
  async readStats() {
    const c = this.fastOpen() ? this.fast : this.conn;
    const pc = c && c.peerConnection;
    if (!pc || !pc.getStats) return;
    try {
      const stats = await pc.getStats();
      let pair = null;
      stats.forEach((r) => { if (r.type === 'transport' && r.selectedCandidatePairId) pair = stats.get(r.selectedCandidatePairId); });
      if (!pair) stats.forEach((r) => { if (r.type === 'candidate-pair' && r.state === 'succeeded' && (r.nominated || r.selected) && !pair) pair = r; });
      if (!pair) return;
      if (typeof pair.currentRoundTripTime === 'number') this.netRtt = pair.currentRoundTripTime * 1000;
      const loc = stats.get(pair.localCandidateId), rem = stats.get(pair.remoteCandidateId);
      this.relayed = !!((loc && loc.candidateType === 'relay') || (rem && rem.candidateType === 'relay'));
    } catch (e) { /* stats unavailable */ }
  }

  attachFast(conn) {
    this.fast = conn;
    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'fp') { try { conn.send({ t: 'fq', ts: msg.ts }); } catch (e) { /* closing */ } return; }
      if (msg.t === 'fq') { this.addSample(performance.now() - msg.ts); return; }
      this.emit('message', msg);
    });
    conn.on('close', () => { if (this.fast === conn) this.fast = null; });
    conn.on('error', () => { if (this.fast === conn) this.fast = null; });
  }

  get connected() { return !!(this.conn && this.conn.open); }

  /**
   * Time-critical messages (snapshots, inputs): unreliable channel. A message is simply
   * skipped when the channel is congested instead of queuing up and adding latency.
   */
  sendFast(msg) {
    const c = this.fast && this.fast.open ? this.fast : this.conn;
    if (!c || !c.open) return;
    const dc = c.dataChannel;
    if (dc && dc.bufferedAmount > 32 * 1024) { this.skipped = (this.skipped || 0) + 1; return; }
    try { c.send(msg); } catch (e) { /* channel closing */ }
  }

  send(msg) {
    if (this.conn && this.conn.open) {
      try { this.conn.send(msg); } catch (e) { /* channel closing */ }
    }
  }

  close() {
    this.closed = true;
    clearInterval(this.pingTimer);
    clearInterval(this.statsTimer);
    try { if (this.fast) this.fast.close(); } catch (e) { /* ignore */ }
    try { if (this.conn) this.conn.close(); } catch (e) { /* ignore */ }
    try { if (this.peer) this.peer.destroy(); } catch (e) { /* ignore */ }
  }
}
