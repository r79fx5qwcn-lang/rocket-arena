// Online multiplayer hook (architecture prepared, no backend required today).
//
// The simulation is a deterministic fixed-step (120 Hz) engine with no Three.js
// dependency (src/physics). This makes two classic architectures straightforward:
//
//  1) Server-authoritative: run PhysicsWorld in Node.js (it already runs headless,
//     see tests/physics.test.mjs), clients send packed Controls every tick
//     (Controls.pack() = 6 bytes), the server broadcasts snapshots
//     (Ball.serialize(), car states). Clients interpolate like the renderer already
//     does between physics ticks, and predict their own car locally.
//  2) Peer-to-peer rollback (WebRTC data channels): exchange inputs per tick and
//     re-simulate from the last confirmed state.
//
// To plug a real transport, implement this interface (e.g. WebSocketAdapter) and
// pass it to Game (game.net = new WebSocketAdapter(url)).
export class NetworkAdapter {
  /** called every physics tick with the local player's controls */
  sendInput(tick, controls) {}
  /** returns remote controls for car id at tick (or null to keep last) */
  getRemoteInput(carId, tick) { return null; }
  /** authoritative snapshot received from a server */
  onSnapshot(cb) { this._snap = cb; }
  get connected() { return false; }
}

/** Default offline adapter: does nothing (local play vs bots). */
export class LocalAdapter extends NetworkAdapter {}

/**
 * Example skeleton of a WebSocket client (not used by default).
 * Message format suggestion: {t:'input', tick, c:[...controls.pack()]}
 */
export class WebSocketAdapter extends NetworkAdapter {
  constructor(url) {
    super();
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';
    this.remote = new Map();
    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.t === 'input') this.remote.set(msg.id, msg.c);
        if (msg.t === 'snapshot' && this._snap) this._snap(msg);
      } catch (e) { /* ignore malformed */ }
    };
  }
  get connected() { return this.ws.readyState === 1; }
  sendInput(tick, controls) {
    if (this.connected) this.ws.send(JSON.stringify({ t: 'input', tick, c: controls.pack() }));
  }
  getRemoteInput(carId) { return this.remote.get(carId) || null; }
}
