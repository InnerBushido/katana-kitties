/* ---------------------------------------------------------------------------
   Payne's Goblin Sweep, made visible.

   One flat ring per kitten that snaps out from her feet to the sweep's real
   reach and fades, in Payne's green with the kitten's own colour inside it.
   THE RING IS THE HITBOX: its outer edge is `ATTACKS.sweep.reach`, which is
   all `_doSweep` uses (no buff grows it), so a barrel just outside it visibly
   stays up (eighth non-negotiable read across to combat, as `ATTACKS.claw` does).

   A POLLER, like crossfx, dodgefx and clanfx, and for their reason: it reads
   `sweepSeq` and nothing in player.js knows it exists. A new number is a new
   sweep; the ring runs its own short clock and hides itself, so no way of a
   round ending can strand one.

   The ring lies flat, so four cameras from four sides all see it right, and
   it is one mesh per kitten, built the first time she sweeps and reused.
--------------------------------------------------------------------------- */

import * as THREE from 'three';
import { ATTACKS } from '../entities/player.js';

/** Payne's green, the colour of her card border and her map diamond. */
const GOBLIN = 0x7fd35a;
/** How long the ring takes to reach its edge, then to fade. */
const OUT = 0.22;
const FADE = 0.3;

export class SweepFx {
  constructor(scene) {
    this.scene = scene;
    /** player -> { mesh, inner, seq, t } */
    this.rigs = new Map();
  }

  _rig(p) {
    let r = this.rigs.get(p);
    if (r) return r;
    const mat = new THREE.MeshBasicMaterial({
      color: GOBLIN, transparent: true, opacity: 0, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 6;
    const inner = new THREE.Mesh(
      new THREE.RingGeometry(0.72, 0.8, 48),
      new THREE.MeshBasicMaterial({
        color: p.style?.colour ?? 0xffffff, transparent: true, opacity: 0,
        depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    mesh.add(inner);
    mesh.visible = false;
    this.scene.add(mesh);
    /* `seq: 0`, NOT HER CURRENT COUNT. The rig is built on the frame of her
       FIRST sweep, so seeding it from `sweepSeq` swallowed exactly that one:
       found in the browser, where the first sweep drew nothing. */
    r = { mesh, inner, seq: 0, t: 0, reach: 1 };
    this.rigs.set(p, r);
    return r;
  }

  update(dt, players) {
    for (const p of players ?? []) {
      const seq = p.sweepSeq ?? 0;
      let r = this.rigs.get(p);
      if (!r && !seq) continue;          // never swept: allocate nothing
      r ??= this._rig(p);
      if (seq !== r.seq) {
        r.seq = seq;
        r.t = OUT + FADE;
        r.reach = ATTACKS.sweep.reach;   // unbuffed, as the sweep is
      }
      if (r.t <= 0) { r.mesh.visible = false; continue; }
      r.t = Math.max(0, r.t - dt);
      const age = OUT + FADE - r.t;
      const grow = Math.min(1, age / OUT);
      const s = r.reach * (0.25 + 0.75 * (1 - (1 - grow) ** 3));
      const a = age < OUT ? 0.9 : 0.9 * (r.t / FADE);
      r.mesh.visible = true;
      r.mesh.position.set(p.position.x, p.position.y + 0.12, p.position.z);
      r.mesh.scale.setScalar(s);
      r.mesh.material.opacity = a;
      r.inner.material.opacity = a * 0.8;
    }
  }

  reset() {
    for (const r of this.rigs.values()) { r.mesh.visible = false; r.t = 0; }
  }
}
