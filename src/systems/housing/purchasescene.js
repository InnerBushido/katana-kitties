import * as THREE from 'three';

/* ---------------------------------------------------------------------------
   THE PURCHASE SCENE — a picture of something already true.

   Non-negotiable 7: the points left her purse and the home was written down
   the frame she said YES (`Housing.buy`). This scene changes NOTHING; it
   only animates what is already so, and `finish()` — which SKIP calls too —
   snaps every animated thing to its end state. Skipping it loses nothing.

   THE SHOT LIST (Richard's):
     1 REFORM   her island, the house rising out of it and the colours
                fading from neutral into hers
     2 GATE     the camera on the main island at the bridge's entrance; a
                cloud rolls in and the torii appears through it
     3 BRIDGE   the snake bridge grows out from the gate in her colours
     4 STATUE   her statue rises at the entrance, the name over the gate
     5 WIDE     the whole road out to her island

   WAITING ON THE ROAD. The roads are wound in the background from the
   moment Roshi's card opens; if that is somehow not finished, shot 2 holds
   on a "the builders are laying the bridge" caption until it is. A road that
   could not be wound at all skips 2–4 and says so (`Housing._pumpRoads`
   warns) — the island is still hers and she can fly there.
--------------------------------------------------------------------------- */

const SHOTS = [
  { id: 'reform', dur: 3.2, cap: (n) => `${n}'s island is taking shape…` },
  { id: 'gate', dur: 2.6, cap: () => 'A gate appears through the clouds…' },
  { id: 'bridge', dur: 4.4, cap: (n) => `…and a bridge grows in ${n}'s colours!` },
  { id: 'statue', dur: 2.8, cap: (n) => `A statue of ${n} guards the way.` },
  { id: 'wide', dur: 2.6, cap: (n) => `Welcome home, ${n}!` },
];

const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export class PurchaseScene {
  constructor(housing) {
    this.H = housing;
    this.active = false;
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 4000);
    this.k = -1;
    this._cap = null;
  }

  start(k, owners) {
    this.k = k;
    this.owners = owners;
    this.name = owners.length > 1 ? owners.join(' & ') : owners[0];
    this.shot = 0;
    this.t = 0;
    this.waiting = false;
    this.active = true;
    this.isle = this.H.isles[k];
    this.isle.setColours(null, 1);
    this._caption(SHOTS[0].cap(this.name));
    this.H.game.audio?.play?.('islerise');
  }

  /** The bridge, ready and drawn at its start state — or null. */
  _bridge() {
    if (!this.H.roadsReady) return null;
    const B = this.H.bridges[this.k];
    if (!B) return null;
    if (!B._sceneReady) {
      this.H._dressBridge(this.k);
      /* Her statue's resting height, read ONCE, before anything moves it —
         the rise is measured from here and `finish` puts it back here. */
      B._statueY0 ??= B.statue.position.y;
      B.group.visible = true;
      B.solid = false;
      B.setGrow(0);
      B.gateMat.reveal = 0;
      B.cloudMat.opacity = 0;
      B.statue.visible = false;
      B._sceneReady = true;
    }
    return B;
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const S = SHOTS[this.shot];
    const u = Math.min(1, this.t / S.dur);
    const I = this.isle;
    const B = S.id === 'reform' ? null : this._bridge();
    if (S.id !== 'reform' && !B) {
      if (this.H.roadsReady) { this.shot = SHOTS.length - 1; this.t = 0; this._wide(I, 0); return; }
      this.waiting = true;
      this._caption("Roshi's builders are laying the bridge…");
      this._gateCam(null, 0);
      this.t = 0;
      return;
    }
    if (this.waiting) { this.waiting = false; this._caption(S.cap(this.name)); }
    switch (S.id) {
      case 'reform': {
        /* THE HOUSE, NOT ITS PARENT: the house group sits at the island's
           height, so scaling the empty parent would scale that height too
           and sink the house into the ground. */
        /* ...AND WHAT IS IN IT: `rise` scales the furniture and windows
           about the same ground, so they come up with the walls instead of
           standing full-height inside a house a tenth built. */
        const e = ease(u);
        I.rise('main', e);
        I.setColours(this.H.coloursOf(I.home), ease((u - 0.3) / 0.7));
        // In front of the house (local +z faces home), drifting round it.
        const a = I.ry + 0.9 - u * 0.9;
        const r = 26 + I.houseR * 2.2;
        this.camera.position.set(I.x + Math.sin(a) * r, I.groundY + 9 + I.height * 0.6, I.z + Math.cos(a) * r);
        this.camera.lookAt(I.x, I.groundY + I.height * 0.45, I.z);
        break;
      }
      case 'gate':
        B.cloudMat.opacity = Math.min(0.9, u * 2) * (1 - ease((u - 0.6) / 0.4) * 0.6);
        B.gateMat.reveal = ease((u - 0.25) / 0.75);
        this._gateCam(B, u);
        break;
      case 'bridge':
        B.cloudMat.opacity = Math.max(0, 0.35 - u);
        B.gateMat.reveal = 1;
        B.setGrow(ease(u));
        this._bridgeCam(B, ease(u));
        break;
      case 'statue': {
        B.statue.visible = true;
        const e = ease(u * 1.3);
        B.statue.position.y = B._statueY0 + (e - 1) * 5;
        this._statueCam(B, u);
        break;
      }
      case 'wide':
        this._wide(I, u, B);
        break;
    }
    if (this.t >= S.dur) {
      this.shot++;
      this.t = 0;
      if (this.shot >= SHOTS.length) { this.finish(); return; }
      this._caption(SHOTS[this.shot].cap(this.name));
      if (SHOTS[this.shot].id === 'statue' && B) this.H.game.audio?.play?.('gong');
      if (SHOTS[this.shot].id === 'gate') this.H.game.audio?.play?.('gateform');
    }
  }

  _gateCam(B, u) {
    const s = B?.start ?? { x: 0, y: 20, z: 0 };
    const fx = B?.fx ?? 0;
    const fz = B?.fz ?? 1;
    /* OUT OVER THE SKY, LOOKING BACK AT THE GATE. The first cut stood on the
       town side looking out, and the town side of every gate is somebody's
       bamboo grove: the shot was leaves. From out here the gate is framed by
       sky and the town is the backdrop. */
    const out = 20 - u * 3;
    this.camera.position.set(s.x + fx * out + (B?.rx ?? 1) * 5, s.y + 7, s.z + fz * out + (B?.rz ?? 0) * 5);
    this.camera.lookAt(s.x, s.y + 6.5, s.z);
  }

  _bridgeCam(B, k) {
    const f = B.road.frameAt?.(B.road.length * Math.max(0.02, k * 0.9));
    const s = B.start;
    const tx = f?.x ?? s.x;
    const tz = f?.z ?? s.z;
    const ty = f?.y ?? s.y;
    // Off to one side of the road and above it, following the growing head.
    this.camera.position.set(s.x + B.fx * 10 + B.rx * 26, s.y + 14 + k * 14, s.z + B.fz * 10 + B.rz * 26);
    this.camera.lookAt(tx, ty, tz);
  }

  _statueCam(B, u) {
    const p = B.statueSpot;
    const s = B.start;
    /* FROM THE TOWN SIDE, CLOSE: she faces the people walking up to her
       bridge, so that is where her face is. Close, because the town side is
       where the bamboo is (see `_gateCam`), and 8 units in front of her is
       inside any grove's clearing. */
    const a = Math.atan2(B.fx, B.fz) + Math.PI + 0.45 - u * 0.25;
    this.camera.position.set(p.x + Math.sin(a) * 8, s.y + 4, p.z + Math.cos(a) * 8);
    this.camera.lookAt(p.x, s.y + 3, p.z);
  }

  _wide(I, u, B = null) {
    const s = B?.start ?? { x: 0, y: I.groundY, z: 0 };
    const mx = (s.x + I.x) / 2;
    const mz = (s.z + I.z) / 2;
    const span = Math.hypot(I.x - s.x, I.z - s.z);
    const nx = -(I.z - s.z) / (span || 1);
    const nz = (I.x - s.x) / (span || 1);
    this.camera.position.set(mx + nx * span * 0.75, I.groundY + span * 0.35 + u * 8, mz + nz * span * 0.75);
    this.camera.lookAt(mx, (s.y + I.groundY) / 2, mz);
  }

  skip() { this.finish(); }

  /** Every animated thing to its end state. Changes no fact. */
  finish() {
    if (!this.active) return;
    this.active = false;
    const I = this.isle;
    I.rise('main', 1);
    if (I.home) I.setColours(this.H.coloursOf(I.home), 1);
    const B = this.H.bridges[this.k];
    if (B) {
      B._sceneReady = false;
      if (B._statueY0 != null) B.statue.position.y = B._statueY0;
      if (B.statue) B.statue.visible = true;
      if (B.cloudMat) B.cloudMat.opacity = 0;
    }
    this.H._dressBridge(this.k);
    this._caption(null);
    this.H.game.toast?.(`${this.name}'s island is ready! Walk across the bridge — or fly there on a dragon.`, 0);
  }

  _caption(text) {
    if (typeof document === 'undefined' || !document.body) return;
    if (!this._cap) {
      const el = document.createElement('div');
      el.className = 'hs-caption';
      document.body.appendChild(el);
      this._cap = el;
    }
    this._cap.textContent = text ?? '';
    this._cap.style.display = text ? '' : 'none';
  }
}
