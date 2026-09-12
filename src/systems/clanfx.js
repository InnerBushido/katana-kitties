import * as THREE from 'three';
import { STEAL, DBREATH } from '../entities/clanpower.js';

/* ---------------------------------------------------------------------------
   THE TWO ARENA CLAN POWERS, MADE VISIBLE.

     THE MARK. 盗 Steal Mischief chooses somebody and then does nothing for up
     to five seconds, which is the whole move — the press is a promise and the
     hit is the payment. A promise nobody can see is indistinguishable from a
     button that did not work, so whoever was marked wears a ring in the
     THIEF'S colour, and the ring SHRINKS as the window runs out. She can tell
     that she is the one being hunted, by whom, and roughly how long she has to
     stay out of reach — three facts, no numbers, no HUD.

     THE INHALE. 息 Dragon Breath spends 0.8 seconds rearing back before
     anything happens, and that pause exists entirely for the other kitten: it
     is her chance to move. So it is loud on screen — shards dragged INWARDS to
     the mouth, tightening and brightening as they arrive.

     THE FLAME. A cone of shards fired from the mouth, which is the same
     drawing a dragon's breath is (`Dragon._updateBreath`) at a kitten's size,
     because it is the same trick: `DBREATH.range` and `DBREATH.spread` are
     authored exactly as a breed's `range` and `spread` are, and the ATTACKS row
     the strike gate reads is derived from those same two numbers. Eighth
     non-negotiable, across two files — what you can see IS the hitbox.

   ------------------------------------------------------------------ WHY HERE

   NOTHING IN THIS FILE IS DRIVEN BY A CALLBACK. It is the argument
   `systems/dodgefx.js` and `systems/crossfx.js` both make at length: `update`
   reads the kitten's own clocks — `stealMarkT`, `stealTarget`, `breathChargeT`,
   `breathFireT` — and derives what should be on screen. A clan power can end
   six ways (it lands, the window runs out, she is knocked out, the round ends
   under her, she is dragged onto an animal, `_clearSpecials` fires) and a
   callback would be one path per ending. The one that got missed would leave a
   ring welded to somebody's head for the rest of the afternoon.

   FLAT RINGS AND SOLID SHARDS, NO BILLBOARDS. Up to four cameras render this
   scene every frame. A hand-turned billboard faces whichever camera asked
   last — edge-on in the other three panes — so everything here is either a
   torus lying flat on the deck or a lump of geometry that looks the same from
   any angle. `dodgefx` solves the same problem with `THREE.Sprite`, which
   three.js turns per camera; either answer is fine, and geometry is cheaper
   than a texture for a shape this simple.
--------------------------------------------------------------------------- */

/** How big the mark is when it lands, and how small it gets before it goes. */
const MARK_R0 = 1.45;
const MARK_R1 = 0.85;
/** Shards in one flame. The dragon uses 26 over 17-20 units; this is a third
 *  the length, so it is a third the shards and reads at the same density. */
const PUFFS = 9;

export class ClanFx {
  constructor(scene) {
    this.scene = scene;
    /** One rig per player INDEX, not per player — a kitten who leaves and
     *  rejoins is the same seat, and a rig keyed on the object would leak one
     *  per rejoin. Same rule `dodgefx` follows. */
    this.rigs = new Map();
    this._m = new THREE.Matrix4();
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
  }

  update(dt, players) {
    for (const p of players ?? []) {
      const r = this._rig(p);
      if (!r) continue;
      this._mark(dt, p, r);
      this._breath(dt, p, r);
    }
  }

  /**
   * Everything back to nothing.
   *
   * A restart must not leave a mark on somebody who is about to be a different
   * player, and the flame must not be left hanging in the air over a deck that
   * no longer has a fight on it. The clocks this polls are all cleared by
   * `Player._clearSpecials`, so this is belt and braces — but the rig belongs
   * to this file and clearing it is this file's job.
   */
  reset() {
    for (const r of this.rigs.values()) {
      r.mark.visible = false;
      r.flame.visible = false;
      r.gather.visible = false;
    }
  }

  _rig(p) {
    if (!p) return null;
    let r = this.rigs.get(p.index);
    if (r) return r;

    const colour = p.style?.colour ?? 0xffffff;

    /* THE MARK IS IN THE THIEF'S COLOUR, not the victim's and not the clan's.
       Four kittens in a free-for-all can be marking each other at once, and the
       only useful thing a ring round your feet can tell you is WHO. */
    const ringGeo = new THREE.TorusGeometry(1, 0.075, 6, 28);
    ringGeo.rotateX(Math.PI / 2);
    const mark = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: colour, transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
    }));
    mark.renderOrder = 26;
    mark.visible = false;
    this.scene.add(mark);

    const flame = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.3, 0),
      new THREE.MeshBasicMaterial({
        color: DBREATH.color, transparent: true, opacity: 0,
        depthWrite: false, toneMapped: false,
      }),
      PUFFS
    );
    flame.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    /* NOT CULLED. The instanced matrices are written every frame and three.js
       culls on the mesh's own bounding sphere, which is the geometry's — one
       shard at the origin. A cone eight units long would be culled the moment
       she turned away from the camera it was measured against. */
    flame.frustumCulled = false;
    flame.visible = false;
    this.scene.add(flame);

    const gather = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.42, 1),
      new THREE.MeshBasicMaterial({
        color: DBREATH.color, transparent: true, opacity: 0,
        depthWrite: false, toneMapped: false,
      })
    );
    gather.renderOrder = 25;
    gather.visible = false;
    this.scene.add(gather);

    r = {
      mark,
      flame,
      gather,
      seed: Array.from({ length: PUFFS }, (_, i) => ({
        t: i / PUFFS,
        a: Math.random() * Math.PI * 2,
        r: Math.random(),
        s: 0.6 + Math.random() * 0.9,
      })),
      spin: 0,
    };
    this.rigs.set(p.index, r);
    return r;
  }

  /** The ring on whoever this kitten has marked. */
  _mark(dt, p, r) {
    const t = p.stealMarked ? p.stealTarget : null;
    if (!t) {
      r.mark.visible = false;
      return;
    }
    r.spin += dt * 1.6;
    /* IT SHRINKS TOWARDS HER AS THE WINDOW CLOSES, which is the only number
       this move has and the only one worth drawing. Full width is a fresh
       mark; a ring tight round her ankles is half a second left. */
    const left = Math.min(1, Math.max(0, p.stealMarkT / STEAL.window));
    const rad = MARK_R1 + (MARK_R0 - MARK_R1) * left;
    r.mark.visible = true;
    r.mark.position.set(t.position.x, t.position.y + 0.09, t.position.z);
    r.mark.scale.setScalar(rad);
    r.mark.rotation.y = r.spin;
    /* A PULSE, SO IT CANNOT BE MISTAKEN FOR THE PLAYER RING SHE ALWAYS WEARS.
       That one is steady and in her OWN colour; this one beats and is in
       somebody else's. */
    r.mark.material.opacity = 0.55 + Math.sin(r.spin * 3.4) * 0.22;
  }

  /** The inhale, and then the cone. */
  _breath(dt, p, r) {
    const charging = p.breathChargeT > 0;
    const firing = !charging && p.breathFireT > 0;
    if (!charging && !firing) {
      r.flame.visible = false;
      r.gather.visible = false;
      return;
    }

    /* WHERE HER MOUTH IS. Two thirds of the way up the drawn kitten and a
       little in front of her, which is where a dragon's `mouthOffset` puts the
       start of its cone for the same reason: a flame that leaves from between
       her feet reads as something she is standing in. */
    const fx = Math.sin(p.facing);
    const fz = Math.cos(p.facing);
    const mouth = {
      x: p.position.x + fx * 0.55,
      y: p.position.y + p.height * 0.66,
      z: p.position.z + fz * 0.55,
    };

    if (charging) {
      r.flame.visible = false;
      r.gather.visible = true;
      /* 0 AT THE PRESS, 1 AT THE FLAME. `breathChargeT` counts DOWN, so this
         is the fraction gathered rather than the fraction left — the ball
         swells and brightens into the moment it goes off. */
      const k = 1 - Math.min(1, Math.max(0, p.breathChargeT / DBREATH.charge));
      r.gather.position.set(mouth.x, mouth.y, mouth.z);
      r.gather.scale.setScalar(0.35 + k * 0.75);
      r.gather.material.opacity = 0.25 + k * 0.65;
      r.gather.rotation.y += dt * 6;
      r.gather.rotation.x += dt * 3;
      return;
    }

    r.gather.visible = false;
    r.flame.visible = true;
    const life = Math.max(0, p.breathFireT / DBREATH.fire);
    r.flame.material.opacity = life * 0.95;

    for (let i = 0; i < PUFFS; i++) {
      const q = r.seed[i];
      // March each shard out along the cone, wrapping as it reaches the tip.
      const k = (q.t + (1 - life) * 1.3) % 1;
      const reach = k * DBREATH.range;
      const spread = k * DBREATH.spread * DBREATH.range * 0.42 * q.r;
      this._v.set(
        mouth.x + fx * reach + Math.cos(q.a) * spread,
        mouth.y + Math.sin(q.a) * spread * 0.7,
        mouth.z + fz * reach + Math.sin(q.a) * spread
      );
      this._s.setScalar(Math.max(0.001, q.s * (0.4 + k * 1.5) * life));
      this._m.compose(this._v, this._q, this._s);
      r.flame.setMatrixAt(i, this._m);
    }
    r.flame.instanceMatrix.needsUpdate = true;
  }
}
