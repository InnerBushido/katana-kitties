import { GATE, inRail, inGateway, throughGate, railCorrect } from './gate.js';

/* ---------------------------------------------------------------------------
   THE WAY IN — the stones, the fall, and the dome's front door.

   Richard, on one afternoon's play:
   · "If a player falls off while jumping, we can just spawn them back to the
     start on the Dojo of the Turning Circle before they started jumping ...
     let them fall for 2 - 3 seconds before respawning them."
   · "When a player is flying a dragon and tries to enter the Dream Dojo, the
     dragon is not flying through, it is getting blocked, but the player is
     able to fly through still." The dragon is hung off its rider
     (`Player._updateFlight`: "the dragon is hung off the kitten's position"),
     so pushing the DRAGON moved a body that was put straight back under her
     next frame, and she sailed on in. The rider is pushed now, and the dragon
     goes with her.
   · "...only let them enter if they jump to the dojo on the floating
     platforms at the entrance. If a player tries to jump off of a dragon to
     fall into the dojo, that should be prevented as well and they should slide
     off the sides of the sphere and fall and respawn on the Dojo of the
     Turning Circle as if they fell while jumping."

   So the dome is a WALL for a kitten on foot, everywhere except one DOOR: the
   torii on the deck (dream/gate.js), low down, exactly the deck's width. A
   kitten who touches the dome anywhere else is laid on its surface and slid
   off it. Once she has stood on the pad she is IN and the dome lets her be —
   and the RAILING keeps her on the pad and the deck, so the only way out is
   back through the gate. Richard: "that it is the only way to enter the
   dojo, so we can put a railing all around the dojo that ends at the
   entrance to force players to enter from the entrance." 

   WHAT IT REMEMBERS is two flags per kitten — `cheat` (she tried the wall or a
   dragon) and `fell` (she fell off the stones) — which are the two things
   Lionheart has something to say about (dream/lecture.js). Nothing here
   decides a story; it only notices.

   Pure where a check needs it to be: `domeContact` and `fallZone` take
   numbers and return numbers, and so do the gate's own tests (dream/gate.js).
--------------------------------------------------------------------------- */

/** "let them fall for 2 - 3 seconds". Counted from the moment she is below
 *  the stone she left, so the whole drop from the take-off reads as ~2.5s. */
export const FALL_HOLD = 2.2;
/** How far below the lowest stone counts as having fallen. A missed hop that
 *  catches the stone's edge on the way down is not a fall. */
export const FALL_DROP = 1.5;
/** ...and how high above the deck the door goes: the torii's tie beam. A
 *  double jump off the last stone peaks about 4 above the deck; a dragon's
 *  dismount is far above it. */
export const DOOR_TOP = GATE.nuki;
/** How hard the dome slides a kitten outward, units/s². At the top of the
 *  sphere she would otherwise balance there forever. */
export const SLIDE = 22;

/**
 * Where the dome's surface puts a kitten at `pos`, or null if she is clear of
 * it. Returns the corrected point and the outward normal. The dome is a
 * hemisphere: below its equator it is a cylinder wall, so a kitten falling
 * past its rim is pushed outward rather than snapped up onto the top.
 */
export function domeContact(pos, centre, R) {
  const dx = pos.x - centre.x;
  const dz = pos.z - centre.z;
  const dy = Math.max(0, pos.y - centre.y);
  const r = Math.hypot(dx, dy, dz);
  if (r >= R) return null;
  if (r < 1e-4) return { x: centre.x + R, y: pos.y, z: centre.z, n: { x: 1, y: 0, z: 0 } };
  const n = { x: dx / r, y: dy / r, z: dz / r };
  return { x: centre.x + n.x * R, y: centre.y + n.y * R + (pos.y < centre.y ? pos.y - centre.y : 0), z: centre.z + n.z * R, n };
}

export class Approach {
  /** @param {import('../dreamdojo.js').DreamDojo} dream */
  constructor(dream, { arcade, domeR }) {
    this.dream = dream;
    this.arcade = arcade;
    this.domeR = domeR;
    /** Player index -> { inside, fallT, safe, cheat, fell, yellAt }. Absent
     *  for a kitten who has never come near — the two-player guarantee. */
    this.st = [];
    this.t = 0;
  }

  of(p) {
    return (this.st[p.index] ??= { inside: false, fallT: 0, cheat: false, fell: false, yellAt: -99, inT: 0 });
  }

  /** Has this kitten got in the proper way since she last tried the wall? */
  get layout() { return this.dream.layout; }

  /** Is she somewhere a fall should be caught — over the gap, the stones, or
   *  the air round the dome — rather than over the Dojo or out at sea? */
  fallZone(p) {
    const L = this.layout;
    const A = this.arcade;
    const pos = p.position;
    const dc = this.dream.game.world?.dojoCentre;
    if (!L || !dc) return false;
    if (Math.hypot(pos.x - dc.x, pos.z - dc.z) < 60) return false;
    if (Math.hypot(pos.x - A.x, pos.z - A.z) < this.domeR + 14) return true;
    return L.stones.some((s) => Math.hypot(pos.x - s.x, pos.z - s.z) < s.r + 7);
  }

  _onFoot(p) {
    return !p.mount && !p.rideAlong && !p.pandaMount && !p.carried && !p.angel && !p.pinnedAt
      && this.dream.realmOf(p) !== 'sim' && !this.dream.st[p.index]?.phase;
  }

  update(dt) {
    this.t += dt;
    const D = this.dream;
    const g = D.game;
    const L = this.layout;
    if (!L) return;
    const A = this.arcade;
    const lowest = Math.min(...L.stones.map((s) => s.y));
    for (const p of g.players ?? []) {
      if (!p) continue;
      const pos = p.position;
      const h = Math.hypot(pos.x - A.x, pos.z - A.z);
      /* A kitten nowhere near gets no state at all. */
      if (!this.st[p.index] && h > this.domeR + 40) continue;
      const s = this.of(p);
      if (!this._onFoot(p)) { s.fallT = 0; continue; }

      /* IN: standing on the pad. OUT: well clear of the dome. */
      if (h < A.r - 0.4 && p.onGround && Math.abs(pos.y - A.y) < 1.2) {
        if (!s.inside) s.inT = this.t;
        s.inside = true;
      }
      if (h > this.domeR + 2) s.inside = false;

      /* --- the dome is a wall, except at the door --- */
      /* ...and not for a kitten inside the railing: on the deck short of the
         gate she is already in, and the rail is what holds her there. With
         both, the dome slid her outward off the deck's side while the rail
         pulled her back onto it, and the dome won. */
      if (!s.inside && !s.railIn && pos.y > A.y - 2) {
        /* THE DOOR IS THE DECK'S STRIP, not a wedge. It was an angle seen from
           the pad's centre (±20° round a hop between two stones), and an
           angle narrows as she walks in: a kitten 2.45 off the axis was in
           the door at the dome's skin and in the WALL three units further
           on, and was slid back out of a gate she had just walked through. */
        const door = inGateway(pos.x, pos.z, A, L.gate) && pos.y < A.y + DOOR_TOP;
        const hit = door ? null : domeContact(pos, { x: A.x, y: A.y, z: A.z }, this.domeR + 0.4);
        if (hit) {
          pos.set(hit.x, hit.y, hit.z);
          const v = p.velocity;
          const vn = v.x * hit.n.x + v.y * hit.n.y + v.z * hit.n.z;
          if (vn < 0) { v.x -= hit.n.x * vn; v.y -= hit.n.y * vn; v.z -= hit.n.z * vn; }
          /* SLIDE OFF. Outward along the ground's direction of the normal; at
             the very top that direction is undefined, so it is the door's
             opposite — away from the stones, which is where she must not land. */
          let hx = hit.n.x;
          let hz = hit.n.z;
          const hl = Math.hypot(hx, hz);
          if (hl < 0.05) { hx = -Math.cos(L.door); hz = -Math.sin(L.door); } else { hx /= hl; hz /= hl; }
          v.x += hx * SLIDE * dt;
          v.z += hz * SLIDE * dt;
          p.onGround = false;
          s.cheat = true;
          this._yell(p, s, hit.n.y > 0.5 ? 'drop' : 'wall');
        }
      }

      /* --- the railing: in through the gate, and out only through it --- */
      if (pos.y > A.y - 1.5 && pos.y < A.y + DOOR_TOP) {
        const f = L.gate;
        const isIn = inRail(pos.x, pos.z, A, f);
        /* Only a kitten who WALKED out from inside it: one picked up and put
           somewhere (a fall, a scene, a summons) has jumped further in a
           frame than any kitten can run. */
        if (s.railIn && !isIn && s.railAt && Math.hypot(pos.x - s.railAt.x, pos.z - s.railAt.z) < 3
          && !throughGate(pos.x, pos.z, A, f)) {
          const c = railCorrect(pos.x, pos.z, A, f);
          pos.x = c.x;
          pos.z = c.z;
          const v = p.velocity;
          const vn = v.x * c.nx + v.z * c.nz;
          if (vn > 0) { v.x -= c.nx * vn; v.z -= c.nz * vn; }
        }
        s.railIn = inRail(pos.x, pos.z, A, f);
        (s.railAt ??= { x: 0, z: 0 }).x = pos.x;
        s.railAt.z = pos.z;
      } else {
        s.railIn = false;
      }

      /* --- the fall --- */
      if (p.onGround) {
        s.fallT = 0;
        const dc = g.world?.dojoCentre;
        // Her footing on the Dojo near the way across, which is where a fall
        // puts her back if it is fresh.
        if (dc && Math.hypot(pos.x - L.launch.x, pos.z - L.launch.z) < 10 && Math.abs(pos.y - dc.y) < 2) {
          (s.safe ??= pos.clone()).copy(pos);
        }
      } else if (this.fallZone(p) && pos.y < lowest - FALL_DROP) {
        s.fallT += dt;
        if (s.fallT >= FALL_HOLD) this._putBack(p, s);
      }
    }
  }

  /** Back on the Dojo, facing the first stone. */
  _putBack(p, s) {
    const D = this.dream;
    const g = D.game;
    const L = this.layout;
    const dc = g.world.dojoCentre;
    /* SPREAD OUT along the rim, so two sisters who fell together do not land
       inside each other. Her own safe footing if she has one. */
    const side = { x: -(L.stones[0].z - L.launch.z), z: L.stones[0].x - L.launch.x };
    const sl = Math.hypot(side.x, side.z) || 1;
    const off = (p.index - 1.5) * 1.6;
    const at = s.safe ?? { x: L.launch.x + (side.x / sl) * off, z: L.launch.z + (side.z / sl) * off };
    const y = g.world.heightAt?.(at.x, at.z, dc.y + 20)?.y ?? dc.y;
    p.position.set(at.x, y + 0.05, at.z);
    p.velocity.set(0, 0, 0);
    p.facing = Math.atan2(-(L.stones[0].x - at.x), -(L.stones[0].z - at.z));
    p.onGround = true;
    s.fallT = 0;
    s.fell = true;
    s.inside = false;
    g.sfx?.('pandapoof');
    D.poof?.(p, 'small');
    g.toast?.(`${p.name} — whoops! Back to the start. Jump across the stones!`, p.index);
  }

  /** Lionheart has seen her try it. Loud, and not more than once in ten
   *  seconds — a kitten pressed against the wall for a while is one attempt. */
  _yell(p, s, kind) {
    const D = this.dream;
    if (this.t - s.yellAt < 10) return;
    s.yellAt = this.t;
    const g = D.game;
    D.yell?.(kind, p);
    g.sfx?.('deny');
    g.toast?.(`${p.name} — the dome only opens at the gate! Go round to the front door.`, p.index);
  }

  /** Forget everything — a new game. */
  reset() { this.st = []; }
}
