import { ITEM_BY_ID, HOUSE_BY_ID, homeRooms } from './catalog.js';
import { fits, firstFit, wallSlots, wallFree } from './editor.js';

/**
 * A WHOLE-ROOM DOJO OR HOLODECK INTO A FEATURE of a mixed room (catalog
 * `mixed`): the castle's ground floor was one or the other, and is now a
 * tatami room that can have both. What she paid comes with it as the
 * feature's price (`typePaid`, or today's price for a room older than that),
 * so selling it back later pays what selling the room would have. The
 * holodeck's kit rows stay and are re-fitted into its strip by
 * `ensureHoloKit` when the island is drawn. True if anything changed.
 */
export function migrateMixedRooms(H, roomPrice) {
  let changed = false;
  for (const room of homeRooms(H)) {
    const R = H.rooms?.[room.id];
    if (!room.mixed || !R || !room.mixed[R.type]) continue;
    R.feats = { ...(R.feats ?? {}), [R.type]: Number.isFinite(R.typePaid) ? R.typePaid : roomPrice(R.type) };
    R.type = 'living';
    delete R.typePaid;
    changed = true;
  }
  return changed;
}

/* ---------------------------------------------------------------------------
   OLD HOMES INTO NEW ROOMS — the castle's four rooms into two.

   Richard, Oct 2026: "lets remove the idea of having 2 rooms on a single
   floor, and make the 1st and 2nd floor 1 room each". A castle saved before
   that has `rooms.east`/`west` (the ground floor, split down the middle) and
   `north`/`south` (upstairs); the catalog now has `ground` and `middle`, each
   the two halves' union (catalog.js). Nothing is lost, which is the fourth
   non-negotiable said about a girl's furniture:

     - every thing keeps the spot it stood on, in the house's own frame. The
       ground floor's cells line up with both halves'; upstairs, south's are
       half a cell off the new grid, so its things move ONE UNIT north. A
       thing that no longer fits there (it cannot, by construction, except on
       a hand-edited save) goes to the nearest free cell, and failing that
       into the STORAGE CHEST, never the bin;
     - a wall thing (a window, a scroll) goes on the nearest free slot of the
       same wall; with none, a bought one into the chest and a free window
       nowhere (it was the house's, not hers);
     - the room's TYPE: one kendo dojo or holodeck between the two halves
       becomes the floor's; two different ones keep the first and pay the
       other back IN FULL into the bank under the owner who claimed it (or the
       first owner) — she bought something the new layout has no room for;
     - claims: a half claimed by one owner makes the floor hers; two different
       owners' halves leave it unclaimed, for them to pick again under the new
       rules. A claim costs nothing, so dropping one loses nothing.

   PURE: `H` in, `H` out (and the bank), so world-check runs it on a planted
   old castle. Idempotent — a castle with no old ids is returned untouched.
--------------------------------------------------------------------------- */

/** new floor room <- the old halves it is made of, in the order that wins a tie */
export const CASTLE_MERGE = { ground: ['east', 'west'], middle: ['north', 'south'] };

/** The old rooms' rects, house-local, as the catalog had them until Oct 2026. */
export const OLD_CASTLE_ROOMS = {
  east: { id: 'east', floor: 0, cx: 5, cz: 0, w: 9, d: 18, house: 'castle' },
  west: { id: 'west', floor: 0, cx: -5, cz: 0, w: 9, d: 18, house: 'castle' },
  north: { id: 'north', floor: 1, cx: 0, cz: -3, w: 16, d: 7, house: 'castle' },
  south: { id: 'south', floor: 1, cx: 0, cz: 3.5, w: 16, d: 6, house: 'castle' },
};

/**
 * Fold an old castle's halves into its floors. `price(type)` is what a room
 * type costs today (for a half that never recorded `typePaid`); `bank` is the
 * store's, credited by name. Returns how many old rooms it folded.
 */
export function migrateCastleRooms(H, bank = {}, price = () => 0) {
  if (!H || H.house !== 'castle' || !H.rooms) return 0;
  const def = HOUSE_BY_ID.castle;
  let folded = 0;
  for (const [id, parts] of Object.entries(CASTLE_MERGE)) {
    const olds = parts.filter((k) => H.rooms[k]);
    if (!olds.length) continue;
    const room = def.rooms.find((r) => r.id === id);
    const R = (H.rooms[id] ??= { type: 'living', items: [] });
    R.items ??= [];
    R.wall ??= [];
    H.chest ??= [];
    // the type: the first non-living half's; a second, different one paid back
    for (const k of olds) {
      const O = H.rooms[k];
      const t = O.type ?? 'living';
      if (t === 'living') continue;
      if (!R.type || R.type === 'living') {
        R.type = t;
        if (Number.isFinite(O.typePaid)) R.typePaid = O.typePaid;
      } else if (R.type !== t) {
        const who = O.claim ?? H.owners[0];
        const back = Number.isFinite(O.typePaid) ? O.typePaid : price(t);
        if (who && back > 0) bank[who] = (bank[who] ?? 0) + back;
      }
    }
    // claims: one name between them keeps it; two different names drop it
    const names = [...new Set(olds.map((k) => H.rooms[k].claim).filter(Boolean))];
    if (names.length === 1 && !R.claim) R.claim = names[0];
    // the things, at the spot they stood on (a holodeck's kit is re-laid by `ensureHoloKit`)
    for (const k of olds) {
      const old = OLD_CASTLE_ROOMS[k];
      for (const q of H.rooms[k].items ?? []) {
        const it = ITEM_BY_ID[q.id];
        if (!it) continue;
        if (it.holo) { if (R.type === 'holodeck') R.items.push({ ...q, ...moved(old, room, q, it) }); continue; }
        const at = moved(old, room, q, it);
        const spot = fits(room, R.items, it, at.gx, at.gz, q.rot ?? 0) ? { ...at, rot: q.rot ?? 0 } : nearest(room, R.items, it, at);
        if (spot) R.items.push({ ...q, ...spot });
        else H.chest.push(q.id);
      }
      const slots = wallSlots('castle', room);
      const oldSlots = wallSlots('castle', old);
      for (const q of H.rooms[k].wall ?? []) {
        const S = oldSlots.find((s) => s.side === q.side && s.k === q.k);
        const best = S && slots.filter((s) => s.side === q.side && wallFree(R, s.side, s.k))
          .sort((a, b) => Math.hypot(a.x - S.x, a.z - S.z) - Math.hypot(b.x - S.x, b.z - S.z))[0];
        if (best) R.wall.push({ ...q, side: best.side, k: best.k });
        else if (!q.free) H.chest.push(q.id);
      }
      delete H.rooms[k];
      folded++;
    }
  }
  return folded;
}

/** Where thing `q` of `old` lands on `room`'s grid: the same house-local cell, rounded down. */
function moved(old, room, q, it) {
  const x0 = old.cx - old.w / 2 + q.gx * 2;
  const z0 = old.cz - old.d / 2 + q.gz * 2;
  return {
    gx: Math.floor((x0 - (room.cx - room.w / 2)) / 2 + 1e-6),
    gz: Math.floor((z0 - (room.cz - room.d / 2)) / 2 + 1e-6),
  };
}

/** The free cell nearest `at` that `it` fits in (either turn), or null. */
function nearest(room, items, it, at) {
  let best = null;
  let bd = Infinity;
  const cols = Math.floor(room.w / 2);
  const rows = Math.floor(room.d / 2);
  for (let rot = 0; rot < 2; rot++) {
    for (let gz = 0; gz < rows; gz++) {
      for (let gx = 0; gx < cols; gx++) {
        if (!fits(room, items, it, gx, gz, rot)) continue;
        const d = Math.hypot(gx - at.gx, gz - at.gz) + rot * 0.01;
        if (d < bd) { bd = d; best = { gx, gz, rot }; }
      }
    }
  }
  return best ?? firstFit(room, items, it);
}
