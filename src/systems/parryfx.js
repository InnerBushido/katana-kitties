/* ---------------------------------------------------------------------------
   返 Riposte, made visible.

   TWO THINGS, AND THE FIRST ONE IS THE RULE. While her window is open a flat
   HALF-DISC lies on the floor at her feet, centred on the way she is facing:
   that is exactly the half of the world `Player.parries` answers yes for
   ("within a 180 degree of the riposte angle direction ... infront of the
   player doing the riposte and not behind them"), so a sister can SEE which
   side is guarded and go round to the other one — and the kitten parrying can
   see that her guard points where she pushed. It shrinks toward her as the
   window runs down, so it is also the clock. The half-disc is the hitbox read
   across to combat, as the Goblin Sweep's ring is (eighth non-negotiable).

   The second is the catch: a white burst at her chest the moment a blow is
   stopped, so the loudest sound a sword makes in this game has a picture to
   go with it.

   A POLLER, like sweepfx, crossfx, dodgefx and clanfx, and for their reason:
   it reads `parrySeq` / `parryHitSeq` / `parryT` and nothing in player.js
   knows it exists. A parry can end five ways (it catches, it whiffs, she is
   hit from behind, the round resets, she is knocked out) and every one of them
   is just `parryT` reaching zero here.

   Flat on the floor, so four cameras from four sides all read it right.
   Built the first time she parries and reused; nothing is allocated per frame.
--------------------------------------------------------------------------- */

import * as THREE from 'three';

/** The guard's radius, in metres. A little under a standing slash's reach
 *  (3.4): it is a picture of a DIRECTION, not a distance — the parry catches
 *  a blow from as far away as a blow can come — and at full slash size four
 *  of them in a scrap would paper the floor. */
export const GUARD_R = 2.2;
/** How long the catch's burst lasts. */
const BURST = 0.32;

/**
 * The half-disc, in its own frame: centred on local +X.
 *
 * `CircleGeometry` sweeps from `thetaStart` anticlockwise in the XY plane, so
 * -90..+90 degrees is the half facing +X; laid flat by `rotateX(-PI/2)`, that
 * half still faces +X. `yawFor` then turns +X onto a game heading.
 */
export function guardGeometry(r = 1) {
  const g = new THREE.CircleGeometry(r, 32, -Math.PI / 2, Math.PI);
  g.rotateX(-Math.PI / 2);
  return g;
}

/**
 * The mesh `rotation.y` that points local +X along game heading `h`.
 *
 * The game's heading puts forward at (sin h, cos h) in x/z (see
 * `Player._stickHeading`); a turn of phi about Y takes +X to
 * (cos phi, 0, -sin phi). Solving the two gives phi = h - PI/2. Written out
 * rather than found by eye because a guard drawn a quarter-turn off would
 * point at the side she is NOT guarding, and `world-check` asserts it against
 * `Player.parries` directly.
 */
export const yawFor = (h) => h - Math.PI / 2;

export class ParryFx {
  constructor(scene) {
    this.scene = scene;
    /** player -> { guard, rim, burst, seq, hitSeq, burstT } */
    this.rigs = new Map();
  }

  _rig(p) {
    let r = this.rigs.get(p);
    if (r) return r;
    const guard = new THREE.Mesh(
      guardGeometry(1),
      new THREE.MeshBasicMaterial({
        color: p.style?.colour ?? 0xffffff, transparent: true, opacity: 0,
        depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    guard.renderOrder = 6;
    /* THE RIM IS THE STEEL: a bright arc along the curved edge, the half
       of the circle a blade has to come through. */
    const rimGeo = new THREE.RingGeometry(0.9, 1, 32, 1, -Math.PI / 2, Math.PI);
    rimGeo.rotateX(-Math.PI / 2);
    const rim = new THREE.Mesh(rimGeo, new THREE.MeshBasicMaterial({
      color: 0xf2f4ff, transparent: true, opacity: 0, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }));
    rim.position.y = 0.01;
    guard.add(rim);
    guard.visible = false;
    this.scene.add(guard);
    /* THE CATCH: a ring standing up at her chest, which from a low camera
       reads as a flash and from above as a ring — both are "something hit
       something". A `Sprite` would face whichever of four cameras is drawing
       it; a ring that faces nobody reads from all of them. */
    const burst = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 1, 28),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      }),
    );
    burst.renderOrder = 7;
    burst.visible = false;
    this.scene.add(burst);
    /* SEEDED AT ZERO, NOT FROM HER COUNTS — sweepfx's lesson: the rig is
       built on the frame of her first parry, so seeding from `parrySeq`
       would swallow exactly that one. */
    r = { guard, rim, burst, seq: 0, hitSeq: 0, burstT: 0 };
    this.rigs.set(p, r);
    return r;
  }

  update(dt, players) {
    for (const p of players ?? []) {
      let r = this.rigs.get(p);
      if (!r && !p.parrySeq) continue;       // never parried: allocate nothing
      r ??= this._rig(p);
      r.seq = p.parrySeq ?? 0;

      const live = (p.parryT ?? 0) > 0 && !p.ko;
      if (live) {
        const left = p.parryWin > 0 ? p.parryT / p.parryWin : 1;
        r.guard.visible = true;
        r.guard.position.set(p.position.x, p.position.y + 0.1, p.position.z);
        r.guard.rotation.y = yawFor(p.parryDir ?? 0);
        r.guard.scale.setScalar(GUARD_R * (0.45 + 0.55 * left));
        r.guard.material.opacity = 0.22 + 0.12 * left;
        r.rim.material.opacity = 0.75;
      } else {
        r.guard.visible = false;
      }

      if ((p.parryHitSeq ?? 0) !== r.hitSeq) {
        r.hitSeq = p.parryHitSeq ?? 0;
        r.burstT = BURST;
      }
      if (r.burstT > 0) {
        r.burstT = Math.max(0, r.burstT - dt);
        const age = 1 - r.burstT / BURST;
        r.burst.visible = r.burstT > 0;
        r.burst.position.set(p.position.x, p.position.y + (p.height ?? 2) * 0.55, p.position.z);
        /* Square to the way she is facing, so it stands between her and
           whoever she just caught. */
        r.burst.rotation.set(0, p.facing ?? 0, 0);
        r.burst.scale.setScalar(0.4 + 1.6 * (1 - (1 - age) ** 3));
        r.burst.material.opacity = 0.95 * (1 - age);
      }
    }
  }

  reset() {
    for (const r of this.rigs.values()) {
      r.guard.visible = false;
      r.burst.visible = false;
      r.burstT = 0;
    }
  }
}
