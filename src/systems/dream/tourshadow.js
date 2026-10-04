import * as THREE from 'three';
import { Billboard } from '../../core/gfx.js';
import { holoMat } from './targets.js';
import { isleSpot } from './kiosk.js';
import { ARENA_AT, SHADOW_H, POSE, SLAM, SWEEP, CROSS, crossBars } from './shadow.js';

/* ---------------------------------------------------------------------------
   SHADOW LIONHEART, FOR THE TOUR — the cutscene's own actor.

   Richard: "When watching the Dream Dojo simulation cutscene while talking to
   Payne, when showing the Shadow Lionheart, we do not see him there, it would
   be cool to see him there, moving around and doing his attack moves during
   that cutscene focusing on him." The `simShadow` shot looked at his island
   and his island was empty: he only exists while a fight is live
   (`ShadowFight._spawn`), and nobody is fighting during a tour.

   NOT THE REAL BOSS. A cutscene's figures are the cutscene's own (the
   game-cutscene-director's rule): `ShadowBoss` is a Target, joins the
   training gate, has a bar and can be hit, and spawning one would start
   counting a fight. This is a billboard of HIS OWN SHEET and three floor
   tells, owned by the scene and removed when its line ends or is skipped.

   THE SAME MOVES, THE SAME SHAPES. Each tell is drawn from the numbers the
   real fight reads (`SLAM`, `SWEEP`, `CROSS` in dream/shadow.js), and the
   pose on each is the cell the real fight shows for it (`POSE`), so the
   tour does not teach a move the fight does not have.

   PURE WHERE A CHECK NEEDS IT: `shadowActAt(t)` says where he is, which
   cell, and which tell is how far along, for any second of the line.
--------------------------------------------------------------------------- */

/**
 * HIS ROUTINE, in seconds from the start of the line, in the ring's own
 * frame: `a` toward the camera, `b` across it. Walk, SLAM, walk, SWEEP, walk,
 * CROSS — the order the fight teaches them in, the Cross last because it is
 * the phase-two move. Tells last exactly as long as the real ones. One pass
 * is 8.6s and `lion_tour_shadow` runs 8.1 (+0.5 hold): the Cross is told on
 * "a SPECIAL Kotodama", measured at 6.3. A longer line loops it.
 */
export const ROUTINE = [
  { kind: 'walk', d: 0.9, to: [-1, -4] },
  { kind: 'tell', what: 'slam', d: SLAM.tell },
  { kind: 'hold', what: 'slam', d: 0.6 },
  { kind: 'walk', d: 0.8, to: [-3, 4] },
  { kind: 'tell', what: 'sweep', d: SWEEP.tell },
  { kind: 'hold', what: 'sweep', d: 0.6 },
  { kind: 'walk', d: 0.7, to: [1, 0] },
  { kind: 'tell', what: 'cross', d: CROSS.tell },
  { kind: 'hold', what: 'cross', d: 1.7 },
];
export const ROUTINE_T = ROUTINE.reduce((s, r) => s + r.d, 0);
/** Where he starts, upstage, in the same frame. */
export const ROUTINE_FROM = [-6, -1];
/** How far in front of him the Cross's X is centred: where she would stand. */
export const CROSS_AHEAD = 5;

/** What he is doing `t` seconds into the line. Pure. */
export function shadowActAt(t) {
  let tt = ((t % ROUTINE_T) + ROUTINE_T) % ROUTINE_T;
  let at = ROUTINE_FROM;
  for (const r of ROUTINE) {
    if (tt <= r.d) {
      const k = r.d > 0 ? tt / r.d : 1;
      if (r.kind === 'walk') {
        const e = k * k * (3 - 2 * k);
        return { pose: POSE.guard, a: at[0] + (r.to[0] - at[0]) * e, b: at[1] + (r.to[1] - at[1]) * e, tell: null, walking: true };
      }
      return { pose: POSE[r.what], a: at[0], b: at[1], tell: { what: r.what, k: r.kind === 'tell' ? k : 1, landed: r.kind === 'hold' } };
    }
    tt -= r.d;
    if (r.kind === 'walk') at = r.to;
  }
  return { pose: POSE.guard, a: at[0], b: at[1], tell: null };
}

export class TourShadow {
  /** @param {object} dream the DreamDojo */
  constructor(dream) {
    this.dream = dream;
    this.group = null;
  }

  /** The ring's middle, in the layer's coordinates, or null with no island. */
  centre() {
    const isle = this.dream.isles?.shadow;
    return isle ? isleSpot(isle, ...ARENA_AT) : null;
  }

  start(ctx, shotPos) {
    this.stop();
    const root = this.dream.sim?.root;
    const c = this.centre();
    if (!root || !c) return;
    this.c = c;
    /* THE RING'S FRAME, off the shot's own lens: `a` runs from the ring's
       middle toward the camera, so every tell is drawn coming at the lens,
       where it can be read — the fight's own staging (`upstageSpot`).
       The lens is in WORLD coordinates and the ring in the layer's, which
       sits SIM.dx/dz away: taken as it came, the "toward the camera" axis was
       the direction of the simulator from the town, and the first look in the
       browser had the slam swinging off to his side. */
    const cam = shotPos ? { x: shotPos.x - root.position.x, z: shotPos.z - root.position.z } : { x: c.x - 1, z: c.z };
    let ax = cam.x - c.x;
    let az = cam.z - c.z;
    const al = Math.hypot(ax, az) || 1;
    ax /= al; az /= al;
    this.fa = { x: ax, z: az };
    this.fb = { x: -az, z: ax };
    this.group = new THREE.Group();
    this.group.name = 'tour-shadow';
    root.add(this.group);
    const g = this.dream.game;
    const art = g?.shadowArt?.texture ? g.shadowArt : this.dream.lionArt;
    this.posed = (art?.cols ?? 1) >= 4;
    if (art?.texture) {
      const quad = SHADOW_H / (art.contentScale || 1);
      this.sprite = new Billboard(art.texture, {
        cols: this.posed ? art.cols : 1, rows: 1, width: quad, height: quad,
        footOffset: (art.pad ?? 0) * quad, mirror: false,
      });
      // His fight's tint: lighter on his own sheet (see `ShadowBoss.dress`).
      this.sprite.mat.color.set(this.posed ? 0xc8a8ff : 0x7a3cff);
      this.sprite.mat.transparent = true;
      this.sprite.mat.opacity = 0.9;
      this.group.add(this.sprite);
    }
    const aura = new THREE.Mesh(new THREE.CircleGeometry(3.2, 32).rotateX(-Math.PI / 2), holoMat(0x2a0a44, 0.55));
    aura.position.y = 0.04;
    this.aura = aura;
    this.group.add(aura);
    const ring = new THREE.Mesh(new THREE.RingGeometry(SWEEP.r - 0.4, SWEEP.r, 48).rotateX(-Math.PI / 2), holoMat(0xff2050, 0.35));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(SWEEP.r, 48).rotateX(-Math.PI / 2), holoMat(0xff2050, 0.35));
    const slam = new THREE.Mesh(new THREE.PlaneGeometry(SLAM.half * 2, SLAM.len).rotateX(-Math.PI / 2).translate(0, 0, SLAM.len / 2), holoMat(0xff2050, 0.35));
    const cross = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      cross.add(new THREE.Mesh(new THREE.PlaneGeometry(CROSS.half * 2, CROSS.len).rotateX(-Math.PI / 2), holoMat(0xff2050, 0.35)));
    }
    this.tells = { slam, sweep: new THREE.Group().add(ring, disc), cross };
    for (const m of Object.values(this.tells)) {
      m.visible = false;
      m.renderOrder = 5;
      this.group.add(m);
    }
    this.t = 0;
  }

  /** Where the routine puts him, in layer coordinates. */
  spot(act) {
    const c = this.c;
    return {
      x: c.x + this.fa.x * act.a + this.fb.x * act.b,
      y: c.y,
      z: c.z + this.fa.z * act.a + this.fb.z * act.b,
    };
  }

  update(t, camera) {
    if (!this.group) return;
    this.t = t;
    const act = shadowActAt(t);
    const at = this.spot(act);
    const bob = act.walking ? Math.abs(Math.sin(t * 9)) * 0.18 : 0;
    if (this.sprite) {
      this.sprite.position.set(at.x, at.y + 0.08 + bob, at.z);
      if (camera) this.sprite.faceCamera(camera);
      if (this.posed) this.sprite._setCell(act.pose, 0, false);
      // His fight's flicker, held steady while a blow is landing.
      this.sprite.mat.opacity = !act.tell?.landed && Math.sin(t * 23) > 0.96 ? 0.55 : 0.9;
    }
    this.aura.position.set(at.x, at.y + 0.04, at.z);
    for (const [what, m] of Object.entries(this.tells)) {
      const on = act.tell?.what === what;
      m.visible = on;
      if (!on) continue;
      const k = act.tell.k;
      // Brighter as it comes, a flare on the blow, then fading as he holds.
      const op = act.tell.landed ? 0.75 : 0.18 + 0.4 * k;
      m.traverse((o) => { if (o.material) o.material.opacity = op; });
      // He faces the lens, so a slam comes down TOWARD the camera.
      const yaw = Math.atan2(this.fa.x, this.fa.z);
      if (what === 'slam') {
        m.position.set(at.x, at.y + 0.08, at.z);
        m.rotation.y = yaw;
      } else if (what === 'sweep') {
        m.position.set(at.x, at.y + 0.07, at.z);
      } else {
        const cx = at.x + this.fa.x * CROSS_AHEAD;
        const cz = at.z + this.fa.z * CROSS_AHEAD;
        const bars = crossBars(yaw);
        m.children.forEach((bar, i) => {
          bar.position.set(cx, at.y + 0.09, cz);
          bar.rotation.y = Math.atan2(bars[i].x, bars[i].z);
        });
      }
    }
  }

  /** Off the island and out of memory — the line ended, or it was skipped. */
  stop() {
    if (!this.group) return;
    this.group.removeFromParent();
    this.group.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material && o !== this.sprite?.mesh) o.material.dispose?.();
    });
    this.sprite?.mat?.dispose?.();
    this.group = null;
    this.sprite = null;
  }
}
