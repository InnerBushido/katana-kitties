import { HOUSE_BY_ID, ITEM_BY_ID, houseSpecs, homeRooms, pathPosts } from './catalog.js';
import { houseFoot, houseShape, stairBlocks } from './homehouse.js';
import { linkWhy, toIsle, underBridgeWhy } from './links.js';

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
  /* NOT ON THE STAIRS, AND NOT OVER THE HOLE THEY COME UP THROUGH: the
     stairwell is a gap in the floor above now (homehouse.js `stairWells`),
     and a chest on it would hang in the air over the steps. */
  const x0 = room.cx - room.w / 2 + gx * 2, z0 = room.cz - room.d / 2 + gz * 2;
  for (const W of stairBlocks(room.house, room.floor)) {
    if (x0 < W.x1 && x0 + w * 2 > W.x0 && z0 < W.z1 && z0 + d * 2 > W.z0) return false;
  }
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
/** The landing at the island end of the town bridge stays this clear. */
const LANDING_R = 4.5;
/** What a yard thing keeps off a house's plinth. Was a CIRCLE round the
 *  plinth's corners plus half a unit — 12 from a minka's middle for a lantern
 *  that fits 7 from it; Richard: "there seems to be a big 'No build buffer
 *  zone' around houses that should be smaller". Now the plinth's own
 *  rectangle and this much. */
const HOUSE_GAP = 0.3;

/** Outdoor footprint radius of an item. */
export const yardR = (it) => it?.r ?? 2;
/** ...and the radius it COLLIDES at, which may be smaller (the koi pond's rim). */
export const hitR = (it) => it?.hit ?? yardR(it);

/* ----- shapes: a circle, or an oriented rectangle (a path, a house) ----- */

/** An oriented box in the island's frame, turned like `toIsle`. */
export const obb = (x, z, hx, hz, rot = 0) => ({ x, z, hx, hz, c: Math.cos(rot), s: Math.sin(rot) });
const _proj = (o, ax, az) => o.hx * Math.abs(o.c * ax - o.s * az) + o.hz * Math.abs(o.s * ax + o.c * az);
/** Two boxes overlap (separating axes), by more than `pad` if pad < 0. */
export function obbHit(A, B, pad = 0) {
  for (const o of [A, B]) {
    for (const [ax, az] of [[o.c, -o.s], [o.s, o.c]]) {
      const d = Math.abs((B.x - A.x) * ax + (B.z - A.z) * az);
      if (d >= _proj(A, ax, az) + _proj(B, ax, az) + pad) return false;
    }
  }
  return true;
}
/** A circle and a box overlap. */
export function circleHit(o, x, z, r) {
  const dx = x - o.x, dz = z - o.z;
  const lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c;
  const qx = Math.max(-o.hx, Math.min(o.hx, lx)), qz = Math.max(-o.hz, Math.min(o.hz, lz));
  return Math.hypot(lx - qx, lz - qz) < r;
}
/** A house's ground as a box, grown by pad. */
export function houseBox(s, pad = 0) {
  const R = houseFoot(s.house);
  const c = toIsle(s, (R.x0 + R.x1) / 2, (R.z0 + R.z1) / 2);
  return obb(c.x, c.z, (R.x1 - R.x0) / 2 + pad, (R.z1 - R.z0) / 2 + pad, s.rot);
}
/** A yard thing's shape where it stands: a box for a path, else a circle. */
export function thingShape(it, x, z, rot = 0) {
  if (it?.path) return { box: obb(x, z, it.pw / 2, it.len / 2, rot) };
  return { x, z, r: hitR(it) };
}
/** Yard things that ARE a floor — water, sand, soil, a level. A path would
 *  vanish under one, so these still refuse a path, flat or not. */
export const YARD_FLOORS = new Set(['koipond', 'onsen', 'volleyball', 'bamboofarm', 'pen', 'paddy', 'treehouse', 'bladeforest', 'stones', 'zengarden']);

/** A posted path's posts as circles where it stands (`pathPosts`), else null. */
export function postShapes(it, x, z, rot = 0) {
  const P = pathPosts(it);
  if (!P) return null;
  const c = Math.cos(rot), s = Math.sin(rot);
  return P.at.map(([fx, fz]) => ({ x: x + fx * c + fz * s, z: z - fx * s + fz * c, r: P.r }));
}
const shapesHit = (a, b, pad = 0) => {
  if (a.box && b.box) return obbHit(a.box, b.box, pad);
  if (a.box) return circleHit(a.box, b.x, b.z, b.r + pad);
  if (b.box) return circleHit(b.box, a.x, a.z, a.r + pad);
  return Math.hypot(a.x - b.x, a.z - b.z) < a.r + b.r + pad;
};
/** The four corners of a box. */
const corners = (o) => [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([i, j]) => ({
  x: o.x + i * o.hx * o.c + j * o.hz * o.s, z: o.z - i * o.hx * o.s + j * o.hz * o.c,
}));

/** `env` was the island's radius; it is `{ r, rot, landing, gyAt, groundAt }` now. Both work. */
const envOf = (env) => (typeof env === 'number' ? { r: env } : (env ?? {}));

/**
 * May `it` stand at island-local (x, z) on this home's island?
 *
 *   on the island        — its whole footprint inside the rim
 *   off every house      — clear of each one's plinth, by HOUSE_GAP; a path
 *                          may run right up to the porch steps
 *   off the landing      — where the town bridge arrives stays clear, or a
 *                          pond could seal her out of her own home
 *   not on another thing — paths may cross and touch each other, and a
 *                          thing may stand ON a flat path (Richard, Oct 2026:
 *                          "ground paths (not tiki) can be built under yard
 *                          objects"); a torch or lantern path is in the way
 *                          only where its posts are
 *   under a bridge       — only if it fits under (links.js)
 *
 * The strip from the front door to the bridge used to be kept clear too.
 * Richard: "Let's remove the restriction that doesn't let players build in
 * front of their house because of the path". It is gone — the paths are hers
 * to lay now.
 *
 * Returns null when it fits, or the reason as a sentence when it does not —
 * the ghost turns red and the card says WHY (non-negotiable 6).
 */
export function yardWhy(H, it, x, z, skip = -1, env = 50) {
  if (!it) return 'Nothing to place.';
  const E = envOf(env);
  const R = E.r ?? 50;
  const me = thingShape(it, x, z, E.rot ?? 0);
  const out = me.box ? corners(me.box).some((p) => Math.hypot(p.x, p.z) > R - 1.5) : Math.hypot(x, z) + me.r > R - RIM;
  if (out) return 'Too close to the edge of the island.';
  for (const s of houseSpecs(H)) {
    const B = houseBox(s, it.path ? -0.6 : HOUSE_GAP);
    if (me.box ? obbHit(B, me.box) : circleHit(B, x, z, me.r)) return `That is on top of the ${HOUSE_BY_ID[s.house].short}.`;
  }
  if (E.landing && !it.path && (me.box ? circleHit(me.box, E.landing.x, E.landing.z, LANDING_R) : Math.hypot(x - E.landing.x, z - E.landing.z) < me.r + LANDING_R)) {
    return 'Keep the landing at the end of your bridge clear.';
  }
  for (const [k, q] of (H.outdoor ?? []).entries()) {
    if (k === skip) continue;
    const qi = ITEM_BY_ID[q.id];
    if (!qi) continue;
    if (it.path && qi.path) continue;
    const flatOn = (a, b) => a.path && !pathPosts(a) && !YARD_FLOORS.has(b.id);
    if (flatOn(it, qi) || flatOn(qi, it)) continue;
    // a posted path is only its posts, except to a floor, which it may not cross at all
    const mine = (!YARD_FLOORS.has(qi.id) && postShapes(it, x, z, E.rot ?? 0)) || [me];
    const theirs = (!YARD_FLOORS.has(it.id) && postShapes(qi, q.x, q.z, q.rot ?? 0)) || [thingShape(qi, q.x, q.z, q.rot ?? 0)];
    if (mine.some((a) => theirs.some((b) => shapesHit(a, b, -0.2)))) return `It overlaps the ${qi.name}.`;
  }
  return underBridgeWhy(H, it, x, z, E);
}

export const yardFits = (H, it, x, z, skip = -1, env = 50) => yardWhy(H, it, x, z, skip, env) == null;

/**
 * May a house stand at `spec` ({ hk, house, x, z, rot }; hk null for a new
 * one)? Null, or why not. Bridges to THIS house are re-laid wherever it goes
 * (and the card warns which would have to be sold back — `brokenLinks`);
 * a bridge between two OTHER houses that it would land on is a refusal.
 */
export function houseWhy(H, spec, env = 50) {
  const E = envOf(env);
  const R = E.r ?? 50;
  const B = houseBox(spec);
  if (corners(B).some((p) => Math.hypot(p.x, p.z) > R - RIM)) return 'Too close to the edge of the island.';
  for (const s of houseSpecs(H)) {
    if (s.hk === spec.hk) continue;
    if (obbHit(houseBox(s, 0.8), B)) return `It would bump into the ${HOUSE_BY_ID[s.house].short}.`;
  }
  if (E.landing && circleHit(B, E.landing.x, E.landing.z, LANDING_R + 1)) return 'Keep the landing at the end of your bridge clear.';
  for (const q of H.outdoor ?? []) {
    const qi = ITEM_BY_ID[q.id];
    if (!qi) continue;
    if (shapesHit({ box: B }, thingShape(qi, q.x, q.z, q.rot ?? 0), -0.1)) return `The ${qi.name} is in the way — move it first.`;
  }
  const T = withHouse(H, spec);
  for (const L of H.links ?? []) {
    if (L.a.hk === spec.hk || L.b.hk === spec.hk) continue;
    if (linkWhy(T, L, E)) return 'A bridge is in the way — move it first.';
  }
  return null;
}

/** Bridges to the house at `spec` that could not be built where it now is. */
export function brokenLinks(H, spec, env = 50) {
  const E = envOf(env);
  const T = withHouse(H, spec);
  return (H.links ?? []).filter((L) => (L.a.hk === spec.hk || L.b.hk === spec.hk) && linkWhy(T, L, E));
}

/** A copy of H with the house at `spec` moved there (or added, hk null). */
export function withHouse(H, spec) {
  const at = { x: spec.x, z: spec.z, rot: spec.rot ?? 0 };
  if (spec.hk === 'main') return { ...H, at };
  const annex = (H.annex ?? []).map((a) => (`a${a.uid}` === spec.hk ? { ...a, ...at } : a));
  if (!spec.hk) annex.push({ uid: -1, house: spec.house, ...at });
  return { ...H, annex };
}

/** The first free spot for `it` outdoors — rings out from the house, back first; or null. */
export function firstYardSpot(H, it, siteR = 50) {
  const r = hitR(it);
  /* FROM THE MIDDLE, IN 1-UNIT RINGS. It started at r + 4 in 1.5 steps with
     a point every 1.25 units of arc, on the theory that the middle is always a
     house — which stopped being true the day a house could be moved, and the
     coarse grid stepped clean over the one gap a big pond fitted in. */
  for (let d = 0; d < siteR - RIM - r + 0.01; d += 1) {
    const n = d < 0.5 ? 1 : Math.max(12, Math.round(d * 1.6));
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
  const rooms = homeRooms(H).filter((r) => !H.rooms?.[r.id]?.type || H.rooms[r.id].type === 'living');
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

/**
 * WINDOWS IN EVERY NEW HOUSE. Richard: "Built houses should have front doors
 * and windows where appropriate." One shoji window in the middle of each
 * outside wall of each room, as ordinary wall things she can move or sell —
 * marked `free`, because they came with the house and sell for nothing.
 */
export function defaultWindows(H, hk = 'main') {
  H.rooms ??= {};
  for (const room of homeRooms(H)) {
    if (room.hk !== hk) continue;
    const R = (H.rooms[room.id] ??= { type: 'living', items: [] });
    R.wall ??= [];
    const bySide = {};
    for (const S of wallSlots(room.house, room)) (bySide[S.side] ??= []).push(S);
    for (const list of Object.values(bySide)) {
      const S = list[Math.floor(list.length / 2)];
      if (wallFree(R, S.side, S.k)) R.wall.push({ id: 'window', side: S.side, k: S.k, free: true });
    }
  }
  return H;
}

/** Sell-back for one item: the same 75% as a house. */
export const ITEM_SELL = 0.75;
