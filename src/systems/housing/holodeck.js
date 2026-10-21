import * as THREE from 'three';
import { GEAR_ITEMS } from '../dream/gear.js';
import { ITEM_BY_ID, mixedZone, roomHas } from './catalog.js';
import { fits, gridOf, footprint } from './editor.js';

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

   A RACK HOLDS ONE SET PER KITTEN ON THE ISLAND (`rackStock`). Richard, Oct
   2026: "if multiple players are on the player's home island, then there
   should be extra VR gear for them to grab ... Currently it is possible for
   players to grab different parts of the VR gear and there are no extra's,
   therefore neither can obtain all 3 parts and cannot enter the simulator."
   With one piece a rack, two sisters who each picked up a different piece
   were stuck for good: each was waiting on the other's. Now `taken` is a set
   of seats per rack, a rack only shows empty once every kitten there has
   taken from it, and any tube in the room takes any of them.

   `holoLayout` is pure, so world-check can measure that the racks fit in every
   room a holodeck can be bought for.

   THE KIT IS HERS TO ARRANGE. Richard, Oct 2026: "after building a holodeck,
   players should be able to place the VR Tubes and VR equipment where it fits
   best in the room ... placing the 3 pieces of VR equipment and 1 tube should
   be mandatory, but player can place up to 4." So the tube and the racks are
   rows in the room's `items` (catalog `holo`), moved in the ordinary build
   mode. `holoLayout` is now only where `holoKit` puts them FIRST — snapped to
   the nearest free tatami — and the room is drawn from the rows.
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

/** How many of a rack's piece there are: one for every kitten on the island,
 *  and never fewer than one. Pure, so the check can ask it. */
export function rackStock(players, I) {
  const n = (players ?? []).filter((p) => p?.position && I?.over?.(p.position.x, p.position.z, 2)).length;
  return Math.max(1, n);
}

/**
 * Where the tube and the three racks stand, in the room's own frame (x along
 * its width, z along its depth). The tube at one end of the LONG axis, the
 * racks in a row across the other end, so the walk from the last rack to the
 * tube is the length of the room. `out` is the way she walks out of the tube.
 */
export function holoLayout(room) {
  /* A MIXED ROOM'S STRIP (catalog `mixed`): the racks down its inner column
     at one end, the tube at the OTHER end — beside them, a rack's grab
     reached the tube (world-check wants HOLO_GRAB + 2.2 between). */
  const Z = mixedZone(room, 'holodeck');
  if (Z) {
    const c = Z.cells;
    const at = (gx, gz) => ({ x: -room.w / 2 + gx * 2, z: -room.d / 2 + gz * 2 });
    return {
      tube: at(c[2] - 1, c[3] - 1),
      racks: GEAR_ITEMS.map((it, k) => ({ id: it.id, ...at(c[0] + 0.5, c[1] + 0.5 + k) })),
      out: { x: -1, z: 0 },
    };
  }
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

/** The kit's catalog ids. */
export const HOLO_TUBE_ID = 'holotube';
export const holoRackId = (gear) => `holorack_${gear}`;
/** "player can place up to 4" tubes. */
export const HOLO_MAX_TUBES = 4;

/** A grid row's centre, room-relative (build.js `cellLocal`, minus the room's centre). */
export function holoCell(room, q) {
  const [cw, cd] = footprint(ITEM_BY_ID[q.id], q.rot ?? 0);
  return { x: -room.w / 2 + (q.gx + cw / 2) * 2, z: -room.d / 2 + (q.gz + cd / 2) * 2 };
}

/** The free cell nearest room-relative (x, z) that `id` fits at, or null. */
function nearestFit(room, items, id, x, z) {
  const it = ITEM_BY_ID[id];
  const { cols, rows } = gridOf(room);
  let best = null;
  let bd = Infinity;
  for (let gz = 0; gz < rows; gz++) {
    for (let gx = 0; gx < cols; gx++) {
      if (!fits(room, items, it, gx, gz, 0)) continue;
      const c = holoCell(room, { id, gx, gz });
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bd - 1e-6) { bd = d; best = { id, gx, gz, rot: 0 }; }
    }
  }
  return best;
}

/**
 * The room's kit: whatever of it `have` already holds, and the missing ones
 * (a tube, each rack) added nearest where `holoLayout` would stand them. Pure.
 * A new holodeck is `holoKit(room)`; an old save's, which kept no rows for its
 * kit, is completed by the same call when the island is drawn.
 */
export function holoKit(room, have = [], others = []) {
  const L = holoLayout(room);
  /* A ROW THAT NO LONGER FITS WHERE IT IS GOES TO THE NEAREST CELL THAT DOES.
     Richard, Oct 2026: "The VR equipment spawns inside the staircase ... no
     item may stand on the stairs." `fits` has kept the stairs and the hole
     over them clear since stairwells were cut, but this only ever ADDED the
     missing pieces — a row saved before that, or carried over from a room
     whose shape changed (migrate.js), stood where it was for good. Now every
     kept row is asked `fits` again, in order, and one that fails is moved to
     the free cell nearest where it was rather than dropped (the tube count
     is hers). */
  /* `others`: the furniture of a mixed room, which the kit is fitted round
     and never returned with — a holodeck that is a whole room has none. */
  const items = [];
  const all = () => [...others, ...items];
  for (const q of have.filter((x) => ITEM_BY_ID[x.id]?.holo)) {
    if (fits(room, all(), ITEM_BY_ID[q.id], q.gx, q.gz, q.rot ?? 0)) { items.push(q); continue; }
    const c = holoCell(room, q);
    const s = nearestFit(room, all(), q.id, c.x, c.z);
    if (s) items.push(s);
  }
  const add = (id, at) => {
    if (items.some((q) => q.id === id)) return;
    const s = nearestFit(room, all(), id, at.x, at.z);
    if (s) items.push(s);
  };
  add(HOLO_TUBE_ID, L.tube);
  for (const r of L.racks) add(holoRackId(r.id), r);
  return items;
}

/** Make a holodeck room's rows its kit (and only its kit). True if it changed. */
export function ensureHoloKit(room, R) {
  if (!roomHas(R, 'holodeck')) return false;
  const before = JSON.stringify(R.items ?? []);
  // a mixed room's furniture stays, and the kit is fitted round it
  const others = (R.items ?? []).filter((q) => !ITEM_BY_ID[q.id]?.holo);
  R.items = [...others, ...holoKit(room, R.items ?? [], others)];
  return JSON.stringify(R.items) !== before;
}

/** Why row `k` of a holodeck room cannot be taken out, or null. */
export function holoWhyRemove(R, k) {
  const q = R?.items?.[k];
  const it = ITEM_BY_ID[q?.id];
  if (!it?.holo) return null;
  if (it.holo === 'rack') return 'Every holodeck needs all three gear racks — you can MOVE it instead.';
  const tubes = R.items.filter((x) => x.id === HOLO_TUBE_ID).length;
  return tubes <= 1 ? 'Your holodeck needs at least one tube — you can MOVE it instead.' : null;
}

/** How many tubes a holodeck room has. */
export const holoTubes = (R) => (R?.items ?? []).filter((q) => q.id === HOLO_TUBE_ID).length;

/**
 * The way out of a tube, room-relative: toward the middle of the room, since
 * the tube can stand anywhere now and the old "along the long axis" walked her
 * into the wall from a tube in the far corner. A tube dead in the middle
 * keeps the old answer.
 */
export function holoOut(room, c) {
  const d = Math.hypot(c.x, c.z);
  if (d < 0.5) return holoLayout(room).out;
  return { x: -c.x / d, z: -c.z / d };
}

export class HoloDeck {
  constructor(housing) {
    this.H = housing;
    /** `${site}:${room}:${item}` -> the SEATS holding one of that piece. */
    this.taken = new Map();
    /** seat -> { site, room, items: Set, suited, name } */
    this.bags = new Map();
    this.t = 0;
  }

  get game() { return this.H.game; }

  _key(site, room, id) { return `${site}:${room}:${id}`; }

  /** Everything she was holding goes back on its rack. */
  release(i) {
    for (const [k, v] of [...this.taken]) {
      v.delete(i);
      if (!v.size) this.taken.delete(k);
    }
    this.bags.delete(i);
  }

  /** How many of rack `key`'s pieces are off it. */
  _out(key) { return this.taken.get(key)?.size ?? 0; }

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
        for (const tube of R.tubes ?? []) {
          const u = tube.u;
          u.uTime.value = this.t;
          const w = tube.mesh.getWorldPosition(_tw);
          const inIt = (players ?? g.players ?? []).find((q) => {
            const h = q && g.dream?.st?.[q.index]?.phase && g.dream.st[q.index].home;
            return h && Math.hypot(h.x - w.x, h.z - w.z) < 0.5;
          });
          const want = inIt ? 1 : 0;
          u.uGlow.value += (want - u.uGlow.value) * Math.min(1, dt * 3);
          if (inIt?.style?.colour != null) u.uColor.value.set(inIt.style.colour);
          else if (!inIt && u.uGlow.value < 0.05) u.uColor.value.set(0x35d7f0);
        }
        const stock = rackStock(players ?? g.players, I);
        for (const r of R.racks) {
          // empty only once every kitten here has one of it (`rackStock`)
          const has = this._out(this._key(I.site.id, R.room, r.id)) >= stock;
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
    /* THE NEAREST, not the first: she may stand her racks side by side now,
       one tatami apart, and both are inside HOLO_GRAB of the seam. */
    let best = null;
    let bd = HOLO_GRAB;
    for (const I of this.H.isles) {
      if (!I.holoRooms?.length || !I.over(p.position.x, p.position.z, 2)) continue;
      for (const R of I.holoRooms) {
        for (const r of R.racks) {
          const d = Math.hypot(p.position.x - r.x, p.position.z - r.z);
          if (d > bd) continue;
          if (Math.abs(p.position.y - r.y) > 2.5) continue;
          bd = d;
          best = { I, R, r, key: this._key(I.site.id, R.room, r.id) };
        }
      }
    }
    return best;
  }

  /** She has just stepped onto rack `on` (`_rackUnder`). */
  _grab(p, on) {
    const g = this.game;
    const { I, R, r, key } = on;
    const item = GEAR_ITEMS.find((x) => x.id === r.id);
    const held = this.taken.get(key) ?? new Set();
    if (held.has(p.index)) return;
    if (held.size >= rackStock(g.players, I)) {
      const who = [...held].map((i) => this.bags.get(i)?.name).filter(Boolean);
      g.toast?.(`${p.name} — ${who.join(' and ') || 'somebody'} ${who.length > 1 ? 'have' : 'has'} the ${item.name}. It comes back when the gear comes off.`, p.index);
      return;
    }
    let bag = this.bags.get(p.index);
    if (bag && (bag.site !== I.site.id || bag.room !== R.room)) { this.release(p.index); bag = null; }
    if (!bag) { bag = { site: I.site.id, room: R.room, items: new Set(), suited: false, name: p.name }; this.bags.set(p.index, bag); }
    this.taken.set(key, held.add(p.index));
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
    /* ONE KITTEN PER TUBE. Richard, Oct 2026: "While a player is entering
       the tube for the holodeck, another player shouldn't be able to enter
       the tube at the same time. Also, only 1 player per tube". A tube is
       taken from the moment a sister's rise in it starts until she has walked
       back out of it — the whole time the Dream Dojo holds her `home` on it. */
    const who = this.tubeTaken(s, p);
    if (who) {
      g.sfx?.('deny');
      g.toast?.(`${p.name} — ${who.name} is using this tube. Wait for her to come out, or use another one.`, p.index);
      return;
    }
    const ok = D.enterFrom(p, { x: s.x, y: s.y, z: s.z, out: s.out });
    if (!ok) g.toast?.(`${p.name} — the holodeck will not start right now.`, p.index);
  }

  /** The kitten in tube `s` (rising, inside, or on her way out), or null. */
  tubeTaken(s, p = null) {
    const D = this.game.dream;
    for (const q of this.game.players ?? []) {
      if (!q || q === p) continue;
      const h = D?.st?.[q.index]?.home;
      if (h && Math.hypot(h.x - s.x, h.z - s.z) < 0.5 && Math.abs(h.y - s.y) < 2) return q;
    }
    return null;
  }
}
