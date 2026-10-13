import * as THREE from 'three';
import { GEAR_ITEMS } from '../dream/gear.js';

/* ---------------------------------------------------------------------------
   THE HOLODECK — the Dream Dojo's way in, at home.

   Richard: "We should have in the holodeck the same tubes and VR equipment
   the player needs to equip that is also in the Dream Dojo island. The player
   should need to grab all 3 items to poof into their VR gear, then they need
   to walk to the tube and press interact to get transported into the
   simulator using their tube ... Once player has on all the gear, we can let
   them run around their island wearing the gear, if they leave their island,
   they automatically remove the gear and go back to normal. When returning
   from the simulator, the player removes their gear automatically, just like
   in the Dream Dojo island, and their equipment is automatically respawned
   where they grabbed it from."

   It used to send her to the ARCADE's tube and run the arcade's sequence, so
   she saw the Dream Dojo island on the way in and walked out onto it on the
   way back, and then got teleported home. Now the sim takes her from HER
   tube (`DreamDojo.enterFrom` with `s.home`).

   The racks are the room's, not hers: a piece somebody has picked up is gone
   from its rack until she takes the gear off, the same way one real headset
   cannot be on two heads. A sister who walks up to the empty rack is told
   who has it (non-negotiable 6). The poof and the un-poof are the arcade's
   own (`suitAt`, `unsuitAt`), so the two ways in look the same.

   `holoLayout` is pure, so world-check can measure that the racks fit in every
   room a holodeck can be bought for.
--------------------------------------------------------------------------- */

/** How near a rack counts as picking its piece up: walk INTO it, no button. */
export const HOLO_GRAB = 1.5;
/** The pieces float smaller than the arcade's, because the rooms are smaller. */
export const HOLO_GEAR_SCALE = 0.7;
/**
 * Her tube's glass, in the room's own height: from the top of its base to
 * under its cap, which is under the ceiling slab (4.26 on a lower storey).
 * She floats HOME_FLOAT_H (dreamdojo.js) and is 2.5 tall, so her ears are at
 * about 3.05 — inside, with room to spare. world-check measures both.
 */
export const HOLO_TUBE = { bottom: 0.4, top: 3.9, r: 1.25 };
const _tw = new THREE.Vector3();

/**
 * Where the tube and the three racks stand, in the room's own frame (x along
 * its width, z along its depth). The tube at one end of the LONG axis, the
 * racks in a row across the other end, so the walk from the last rack to the
 * tube is the length of the room. `out` is the way she walks out of the tube.
 */
export function holoLayout(room) {
  const alongX = room.w >= room.d;
  const L = alongX ? room.w : room.d;
  const S = alongX ? room.d : room.w;
  const put = (long, short) => (alongX ? { x: long, z: short } : { x: short, z: long });
  const step = Math.min(S / 3, 2.6);
  return {
    tube: put(-L / 2 + 2, 0),
    racks: GEAR_ITEMS.map((it, k) => ({ id: it.id, ...put(L / 2 - 1.5, (k - 1) * step) })),
    out: put(1, 0),
  };
}

export class HoloDeck {
  constructor(housing) {
    this.H = housing;
    /** `${site}:${room}:${item}` -> the seat holding that piece. */
    this.taken = new Map();
    /** seat -> { site, room, items: Set, suited, name } */
    this.bags = new Map();
    this.t = 0;
  }

  get game() { return this.H.game; }

  _key(site, room, id) { return `${site}:${room}:${id}`; }

  /** Everything she was holding goes back on its rack. */
  release(i) {
    for (const [k, v] of [...this.taken]) if (v === i) this.taken.delete(k);
    this.bags.delete(i);
  }

  drop(i) { this.release(i); }

  /** A kitten's progress, for the prompt and the checks. */
  bagOf(i) { return this.bags.get(i) ?? null; }

  update(dt, players) {
    this.t += dt;
    const g = this.game;
    const D = g.dream;
    const pull = g.tournament?.active || g._sceneActive?.();
    for (const p of players) {
      if (!p) continue;
      const st = D?.stateOf?.(p.index);
      const busy = !!st?.phase || D?.realmOf?.(p) === 'sim';
      let bag = this.bags.get(p.index);
      if (bag && !busy) {
        const I = this.H.isleOf(bag.site);
        const here = !!I?.over(p.position.x, p.position.z, 2);
        if (bag.suited) {
          // Out of it — back from the sim, or a scene or the arena took it off.
          if (!p.simLook) { this.release(p.index); continue; }
          if (pull) {
            if (st) st.homeSuit = false;
            p.setSimLook?.(false);
            this.release(p.index);
            continue;
          }
          if (!here && D?.unsuitAt?.(p)) {
            g.toast?.(`${p.name} — the VR gear stays on your island: it is back on its racks.`, p.index);
          }
        } else if (!here || pull) {
          if (bag.items.size) g.toast?.(`${p.name} — the VR gear went back on its racks.`, p.index);
          this.release(p.index);
          bag = null;
        }
      }
      // the step onto a rack, remembered on EVERY frame, suited or not
      this._on ??= new Map();
      const on = this._rackUnder(p);
      const stepped = !!on && on.key !== this._on.get(p.index);
      this._on.set(p.index, on?.key ?? null);
      if (busy || p.simLook || pull || bag?.suited) continue;
      if (stepped) this._grab(p, on);
    }
    // The racks: a piece shows while nobody has it, and turns slowly.
    for (const I of this.H.isles) {
      for (const R of I.holoRooms ?? []) {
        /* Her tube streams light the way the arcade's does — faster, and in
           HER colour, while somebody is in it (dreamdojo.js `s.home`). */
        if (R.tube) {
          const u = R.tube.u;
          u.uTime.value = this.t;
          const w = R.tube.mesh.getWorldPosition(_tw);
          const inIt = (players ?? g.players ?? []).find((q) => {
            const h = q && g.dream?.st?.[q.index]?.phase && g.dream.st[q.index].home;
            return h && Math.hypot(h.x - w.x, h.z - w.z) < 0.5;
          });
          const want = inIt ? 1 : 0;
          u.uGlow.value += (want - u.uGlow.value) * Math.min(1, dt * 3);
          if (inIt?.style?.colour != null) u.uColor.value.set(inIt.style.colour);
          else if (!inIt && u.uGlow.value < 0.05) u.uColor.value.set(0x35d7f0);
        }
        for (const r of R.racks) {
          const has = this.taken.has(this._key(I.site.id, R.room, r.id));
          r.mesh.visible = !has;
          r.mesh.rotation.y = r.yaw + this.t * 0.8;
          r.mesh.position.y = r.baseY + Math.sin(this.t * 2 + r.phase) * 0.08;
          if (r.ring) r.ring.visible = !has;
        }
      }
    }
  }

  /**
   * A RACK ACTS ON THE STEP ONTO IT, not on every frame she stands there.
   * Richard: "it is spamming the screen with messages ... This message should
   * not be spamming the screen and should only appear once every time a
   * player steps on it." Standing still on a rack used to be a press a frame:
   * when the suit-up was refused (`_suit` — the gear goes back on its racks)
   * the very next frame took it off them again, and refused again, sixty
   * times a second. `_on` is the rack each kitten is standing on; nothing
   * happens until that changes.
   */
  _rackUnder(p) {
    for (const I of this.H.isles) {
      if (!I.holoRooms?.length || !I.over(p.position.x, p.position.z, 2)) continue;
      for (const R of I.holoRooms) {
        for (const r of R.racks) {
          if (Math.hypot(p.position.x - r.x, p.position.z - r.z) > HOLO_GRAB) continue;
          if (Math.abs(p.position.y - r.y) > 2.5) continue;
          return { I, R, r, key: this._key(I.site.id, R.room, r.id) };
        }
      }
    }
    return null;
  }

  /** She has just stepped onto rack `on` (`_rackUnder`). */
  _grab(p, on) {
    const g = this.game;
    const { I, R, r, key } = on;
    const item = GEAR_ITEMS.find((x) => x.id === r.id);
    const who = this.taken.get(key);
    if (who != null) {
      if (who !== p.index) {
        g.toast?.(`${p.name} — ${this.bags.get(who)?.name ?? 'somebody'} has the ${item.name}. It comes back when she takes the gear off.`, p.index);
      }
      return;
    }
    let bag = this.bags.get(p.index);
    if (bag && (bag.site !== I.site.id || bag.room !== R.room)) { this.release(p.index); bag = null; }
    if (!bag) { bag = { site: I.site.id, room: R.room, items: new Set(), suited: false, name: p.name }; this.bags.set(p.index, bag); }
    this.taken.set(key, p.index);
    bag.items.add(r.id);
    g.sfx?.('orb');
    g.toast?.(`${p.name} — ${item.name} ✓ (${bag.items.size} of ${GEAR_ITEMS.length})`, p.index);
    if (bag.items.size === GEAR_ITEMS.length) this._suit(p, bag);
  }

  _suit(p, bag) {
    const g = this.game;
    if (g.dream?.suitAt?.(p)) {
      bag.suited = true;
      g.toast?.(`${p.name} — suited up! Step into your tube and press ACTION.`, p.index);
      return;
    }
    // The Dream Dojo is what owns the poof; without it the gear goes back.
    g.sfx?.('deny');
    g.toast?.(`${p.name} — the holodeck is not ready yet. Try again in a moment.`, p.index);
    this.release(p.index);
  }

  /** ACTION at the tube. */
  enter(p, s) {
    const g = this.game;
    const D = g.dream;
    const bag = this.bags.get(p.index);
    if (!D?.enterFrom) {
      g.toast?.('The holodeck is warming up… (needs the Dream Dojo built)', p.index);
      return;
    }
    if (!p.simLook || !bag?.suited) {
      g.sfx?.('deny');
      const n = bag?.items.size ?? 0;
      g.toast?.(`${p.name} — put on all three pieces of VR gear first (${n} of 3): they are on the racks across the room.`, p.index);
      return;
    }
    const ok = D.enterFrom(p, { x: s.x, y: s.y, z: s.z, out: s.out });
    if (!ok) g.toast?.(`${p.name} — the holodeck will not start right now.`, p.index);
  }
}
