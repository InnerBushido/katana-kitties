import { HOUSE_BY_ID, ITEM_BY_ID } from './catalog.js';
import { houseRadius, houseShape } from './homehouse.js';

/* ---------------------------------------------------------------------------
   FURNISHING — the tatami grid, the walls and the yard, as data.

   A room is a grid of 2-unit tatami cells (`room.w / 2` by `room.d / 2`);
   a placed item is `{ id, gx, gz, rot }` and covers `cells` (swapped on a
   quarter turn). The rules live here, pure, so the card and world-check ask
   the same questions:
     fits(room, items, it, gx, gz, rot) — inside the grid, overlapping nothing
     yardWhy(H, it, x, z)               — outdoors: on the island, off the
                                          house and the door's path, clear
     wallSlots(houseId, room)           — the outer-wall spans a window or a
                                          scroll can hang on
   The yard was seven fixed plots of four kinds until Oct 2026; it is free
   placement now (catalog.js, `where: 'yard'`).
--------------------------------------------------------------------------- */

export function gridOf(room) {
  return { cols: Math.max(1, Math.floor(room.w / 2)), rows: Math.max(1, Math.floor(room.d / 2)) };
}

export function footprint(it, rot = 0) {
  const [a, b] = it.cells ?? [1, 1];
  return rot % 2 ? [b, a] : [a, b];
}

export function fits(room, items, it, gx, gz, rot = 0, skip = -1) {
  const { cols, rows } = gridOf(room);
  const [w, d] = footprint(it, rot);
  if (gx < 0 || gz < 0 || gx + w > cols || gz + d > rows) return false;
  for (const [k, q] of (items ?? []).entries()) {
    if (k === skip) continue;
    const qi = ITEM_BY_ID[q.id];
    if (!qi) continue;
    const [qw, qd] = footprint(qi, q.rot);
    if (gx < q.gx + qw && gx + w > q.gx && gz < q.gz + qd && gz + d > q.gz) return false;
  }
  return true;
}

/** The first free spot for `it` in a room, scanning rows; or null. */
export function firstFit(room, items, it) {
  const { cols, rows } = gridOf(room);
  for (let rot = 0; rot < 2; rot++) {
    for (let gz = 0; gz < rows; gz++) {
      for (let gx = 0; gx < cols; gx++) {
        if (fits(room, items, it, gx, gz, rot)) return { gx, gz, rot };
      }
    }
  }
  return null;
}

/* ------------------------------ the yard -------------------------------- */

/** How far in from the island's rim a thing's edge may come. */
const RIM = 3;
/** Half-width of the path kept clear from the front door to the bridge. */
const PATH_W = 4.5;

/** Outdoor footprint radius of an item. */
export const yardR = (it) => it?.r ?? 2;

/**
 * May `it` stand at house-local (x, z) on this home's island?
 *
 *   on the island        — its whole footprint inside the rim
 *   off the house        — clear of the plinth (houseRadius)
 *   off the bridge path  — the strip from the door to the landing stays
 *                          walkable, or a pond could seal her out of her
 *                          own home
 *   not on another thing — circles, `skip` being the one being moved
 *
 * Returns null when it fits, or the reason as a sentence when it does not —
 * the ghost turns red and the card says WHY (non-negotiable 6).
 */
export function yardWhy(H, it, x, z, skip = -1, siteR = 50) {
  if (!it) return 'Nothing to place.';
  const r = yardR(it);
  if (Math.hypot(x, z) + r > siteR - RIM) return 'Too close to the edge of the island.';
  const hr = houseRadius(H.house);
  if (Math.hypot(x, z) < hr + r + 0.5) return 'That is on top of the house.';
  if (z > 0 && Math.abs(x) < PATH_W + r) return 'Keep the path from your door to the bridge clear.';
  for (const [k, q] of (H.outdoor ?? []).entries()) {
    if (k === skip) continue;
    const qi = ITEM_BY_ID[q.id];
    if (!qi) continue;
    if (Math.hypot(x - q.x, z - q.z) < r + yardR(qi) - 0.2) return `It overlaps the ${qi.name}.`;
  }
  return null;
}

export const yardFits = (H, it, x, z, skip = -1, siteR = 50) => yardWhy(H, it, x, z, skip, siteR) == null;

/** The first free spot for `it` outdoors — rings out from the house, back first; or null. */
export function firstYardSpot(H, it, siteR = 50) {
  const r = yardR(it);
  const hr = houseRadius(H.house);
  for (let d = hr + r + 1; d < siteR - RIM - r + 0.01; d += 1.5) {
    const n = Math.max(8, Math.round(d * 0.8));
    for (let k = 0; k < n; k++) {
      // start at the back (-z) and fan out both ways
      const s = k % 2 ? 1 : -1;
      const a = Math.PI + s * Math.ceil(k / 2) * (Math.PI * 2 / n);
      const x = Math.sin(a) * d;
      const z = Math.cos(a) * d;
      if (yardFits(H, it, x, z, -1, siteR)) return { x: +x.toFixed(2), z: +z.toFixed(2), rot: 0 };
    }
  }
  return null;
}

/** A new outdoor row, with an id koi/farm state and the editor can hold on to. */
export function addOutdoor(H, id, x, z, rot = 0) {
  H.outdoor ??= [];
  H.uid = (H.uid ?? 0) + 1;
  const q = { uid: H.uid, id, x, z, rot };
  H.outdoor.push(q);
  return q;
}

/* ------------------------------ the walls ------------------------------- */

/**
 * The 2-unit spans of a room's OUTER walls a wall thing can hang on.
 * `side` 0 is the front (+z), 1 is +x, 2 the back, 3 is -x; `k` counts along
 * it. A room side that is not on the house's outer wall (the castle's inner
 * divisions have no wall at all) offers none, and the front of the ground
 * floor keeps its door clear. Each slot carries where it is (house-local, on
 * the wall's INSIDE face) and the way it faces (into the room).
 */
export function wallSlots(houseId, room) {
  const S = houseShape(houseId);
  const [hw, hd] = S.floors[room.floor] ?? S.floors[0];
  const out = [];
  const sides = [
    { side: 0, on: Math.abs(room.cz + room.d / 2 - hd) < 1.2, along: 'x', fixed: hd - 0.22, ry: Math.PI },
    { side: 1, on: Math.abs(room.cx + room.w / 2 - hw) < 1.2, along: 'z', fixed: hw - 0.22, ry: -Math.PI / 2 },
    { side: 2, on: Math.abs(room.cz - room.d / 2 + hd) < 1.2, along: 'x', fixed: -hd + 0.22, ry: 0 },
    { side: 3, on: Math.abs(room.cx - room.w / 2 + hw) < 1.2, along: 'z', fixed: -hw + 0.22, ry: Math.PI / 2 },
  ];
  for (const s of sides) {
    if (!s.on) continue;
    const span = s.along === 'x' ? room.w : room.d;
    const c0 = s.along === 'x' ? room.cx : room.cz;
    const n = Math.floor(span / 2);
    for (let k = 0; k < n; k++) {
      const a = c0 - span / 2 + 1 + k * 2;
      // the corner posts, and the ground floor's front door
      if (Math.abs(a) > (s.along === 'x' ? hw : hd) - 1) continue;
      if (s.side === 0 && room.floor === 0 && Math.abs(a) < 2.4) continue;
      out.push({
        side: s.side, k,
        x: s.along === 'x' ? a : s.fixed,
        z: s.along === 'z' ? a : s.fixed,
        ry: s.ry,
      });
    }
  }
  return out;
}

/** Is slot (side, k) of this room free? `skip` is the wall row being moved. */
export function wallFree(R, side, k, skip = -1) {
  return !(R?.wall ?? []).some((q, i) => i !== skip && q.side === side && q.k === k);
}

/**
 * A preset, furnished: its room things into the first rooms that take them
 * and its yard things into the first free spots. Whatever does not fit is
 * skipped — a preset is a head start, not a promise.
 */
export function autoLayout(H, preset, isle) {
  const def = HOUSE_BY_ID[H.house];
  const rooms = (def?.rooms ?? []).filter((r) => !H.rooms?.[r.id]?.type || H.rooms[r.id].type === 'living');
  H.rooms ??= {};
  for (const id of preset.room ?? []) {
    const it = ITEM_BY_ID[id];
    if (!it) continue;
    for (const room of rooms) {
      const R = (H.rooms[room.id] ??= { type: 'living', items: [] });
      R.items ??= [];
      const at = firstFit(room, R.items, it);
      if (at) { R.items.push({ id, ...at }); break; }
    }
  }
  H.outdoor ??= [];
  for (const id of preset.yard ?? []) {
    const it = ITEM_BY_ID[id];
    const at = it && firstYardSpot(H, it, isle?.radius ?? 50);
    if (at) addOutdoor(H, id, at.x, at.z, at.rot);
  }
  return H;
}

/** Sell-back for one item: the same 75% as a house. */
export const ITEM_SELL = 0.75;
