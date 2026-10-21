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
                cloud rolls in and the torii appears through it — and WITH
                it the doors, the hologram across them and the ramp's start,
                together; then the shot HOLDS on them (GATE_HOLD) — Richard,
                Oct 2026: "appear together. Wait 1-2s, then the bridge grows"
     3 BRIDGE   the snake bridge grows out from the gate in her colours,
                from the ramp's start on
     4 STATUE   her statue rises at the entrance, the name over the gate
     5 WIDE     the whole road out to her island

   WAITING ON THE ROAD. The roads are wound in the background from the
   moment Roshi's card opens; if that is somehow not finished, shot 2 holds
   on a "the builders are laying the bridge" caption until it is. A road that
   could not be wound at all skips 2–4 and says so (`Housing._pumpRoads`
   warns) — the island is still hers and she can fly there.
--------------------------------------------------------------------------- */

/** The gate shot: the entrance comes up over GATE_REVEAL, then is held for GATE_HOLD. */
export const GATE_REVEAL = 2.2;
export const GATE_HOLD = 1.5;
const SHOTS = [
  { id: 'reform', dur: 3.2, cap: (n) => `${n}'s island is taking shape…` },
  { id: 'gate', dur: GATE_REVEAL + GATE_HOLD, cap: () => 'A gate appears through the clouds…' },
  { id: 'bridge', dur: 4.4, cap: (n) => `…and a bridge grows in ${n}'s colours!` },
  { id: 'statue', dur: 2.8, cap: (n, many) => (many ? `Statues of ${n} guard the way.` : `A statue of ${n} guards the way.`) },
  { id: 'wide', dur: 2.6, cap: (n) => `Welcome home, ${n}!` },
];

/** The statue shot: how much of the frame the row may fill, and how far back it may go to. */
const STATUE_FILL = 0.88;
const STATUE_FAR = 60;
const _box = new THREE.Box3();
const _v = new THREE.Vector3();

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
      B.setEntrance?.(0);
      B.sceneField = 0;
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
    if (this.waiting) { this.waiting = false; this._caption(S.cap(this.name, this.owners.length > 1)); }
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
      case 'gate': {
        // the reveal over its own seconds, the same curve for every piece of the entrance
        const r = Math.min(1, this.t / GATE_REVEAL);
        B.cloudMat.opacity = Math.min(0.9, r * 2) * (1 - ease((r - 0.6) / 0.4) * 0.6);
        const k = ease((r - 0.25) / 0.75);
        B.gateMat.reveal = k;
        B.setEntrance?.(k);
        B.sceneField = k;
        this._gateCam(B, r);
        break;
      }
      case 'bridge': {
        B.cloudMat.opacity = Math.max(0, 0.35 - u);
        B.gateMat.reveal = 1;
        // the hologram stood for the reveal; from here it is the lock's again
        B.sceneField = null;
        const k0 = B.entranceGrow?.() ?? 0;
        B.setGrow(k0 + (1 - k0) * ease(u));
        this._bridgeCam(B, ease(u));
        break;
      }
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
      this._caption(SHOTS[this.shot].cap(this.name, this.owners.length > 1));
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
    const s = B.start;
    /* EVERY OWNER'S STATUE. Richard, Oct 2026: "The statues shot in the
       purchase cutscene must include all co-owners' statues." It looked at
       slot 0 from 8 away, so a castle bought by three showed one statue and
       an elbow. Now it aims at the middle of the row and backs off ALONG ITS
       OWN RAY (height with distance, so the angle that was liked is kept)
       until the TOP HALF of every statue's measured box is inside the frame.
       The top half because the liked shot is a close-up: one statue at 8
       has her head at 0.28 and her plinth off the bottom of the frame, and
       still comes out at exactly 8. A guessed width (3.2) was wrong — the
       box is 4.8 — so it is measured, here, every frame. */
    const kids = B.statue?.children ?? [];
    const ps = kids.map((c) => c.getWorldPosition(new THREE.Vector3()));
    const p = ps.length
      ? { x: ps.reduce((t, q) => t + q.x, 0) / ps.length, z: ps.reduce((t, q) => t + q.z, 0) / ps.length }
      : B.statueSpot;
    // the boxes at REST, whatever the rise has done to the group (`B._statueY0`)
    const lift = (B._statueY0 ?? B.statue?.position.y ?? 0) - (B.statue?.position.y ?? 0);
    const pts = [];
    for (const c of kids) {
      _box.setFromObject(c);
      if (_box.isEmpty()) continue;
      const mid = (_box.min.y + _box.max.y) / 2 + lift;
      for (const x of [_box.min.x, _box.max.x]) for (const z of [_box.min.z, _box.max.z]) for (const y of [mid, _box.max.y + lift]) pts.push(new THREE.Vector3(x, y, z));
    }
    /* FROM THE TOWN SIDE, CLOSE: she faces the people walking up to her
       bridge, so that is where her face is. Close, because the town side is
       where the bamboo is (see `_gateCam`), and 8 units in front of her is
       inside any grove's clearing. */
    const a = Math.atan2(B.fx, B.fz) + Math.PI + 0.45 - u * 0.25;
    const place = (d) => {
      this.camera.position.set(p.x + Math.sin(a) * d, s.y + 4 * (d / 8), p.z + Math.cos(a) * d);
      this.camera.lookAt(p.x, s.y + 3, p.z);
      this.camera.updateMatrixWorld(true);
    };
    for (let d = 8; d <= STATUE_FAR; d += 0.5) {
      place(d);
      if (pts.every((q) => { _v.copy(q).project(this.camera); return Math.abs(_v.x) <= STATUE_FILL && _v.y <= STATUE_FILL && _v.z < 1; })) return;
    }
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
      B.setEntrance?.(1);
      B.sceneField = null;
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
