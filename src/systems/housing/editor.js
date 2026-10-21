import { HOUSE_BY_ID, ITEM_BY_ID, LINK_BY_ID, houseSpecs, homeRooms, pathPosts, roomWith, DOOR_MATS } from './catalog.js';
import { houseFoot, houseFoots, houseShape, stairBlocks, rampOf } from './homehouse.js';
import { linkWhy, toIsle, toHouse, underBridgeWhy } from './links.js';

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
  /* A MIXED ROOM'S ZONES (catalog `mixed`): the holodeck's kit stands in its
     strip and nowhere else, and furniture stays out of a zone once it is
     bought (`roomWith` hands `feats` in; without them a zone is open floor). */
  const M = room.mixed;
  if (M) {
    const inZ = (c) => gx >= c[0] && gz >= c[1] && gx + w <= c[2] && gz + d <= c[3];
    const hits = (c) => gx < c[2] && gx + w > c[0] && gz < c[3] && gz + d > c[1];
    if (it.holo) { if (!M.holodeck || !inZ(M.holodeck)) return false; }
    else for (const f of Object.keys(M)) if (room.feats?.[f] != null && hits(M[f])) return false;
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
/** A house's ground as a box, grown by pad: the bounds of plinth and ramp together. */
export function houseBox(s, pad = 0) {
  const R = houseFoot(s.house);
  const c = toIsle(s, (R.x0 + R.x1) / 2, (R.z0 + R.z1) / 2);
  return obb(c.x, c.z, (R.x1 - R.x0) / 2 + pad, (R.z1 - R.z0) / 2 + pad, s.rot);
}
/** ...and as what is really there: the plinth's box and the ramp's (`houseFoots`), each grown by pad. */
export function houseBoxes(s, pad = 0, foot = 0) {
  return houseFoots(s.house).map((F) => {
    const R = F.ramp && foot ? { ...F, z1: Math.max(F.z0 + 0.1, F.z1 - foot) } : F;
    const c = toIsle(s, (R.x0 + R.x1) / 2, (R.z0 + R.z1) / 2);
    return Object.assign(obb(c.x, c.z, (R.x1 - R.x0) / 2 + pad, (R.z1 - R.z0) / 2 + pad, s.rot), { ramp: !!R.ramp });
  });
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

/**
 * Does a path's box lie on house `s`'s ramp — every corner within its width,
 * none further in than the front wall? Then the house does not refuse it: it
 * runs up the slope and over the porch to the door, and homeisle.js bends it
 * onto them (`rampLift`). Richard, Oct 2026: "Allow players to place paths on
 * ramps". A path that only touches the ramp's side still meets the strip's
 * box, as before — half on the slope and half in the wall is not a path.
 */
export function onRamp(s, box) {
  const R = rampOf(s.house);
  if (!R || !box) return false;
  return corners(box).every((p) => {
    const l = toHouse(s, p.x, p.z);
    return Math.abs(l.x) <= R.hw + 0.05 && l.z >= R.door - 0.05;
  });
}

/** How far above the grass a ramp or its porch is at island (x, z), or 0. */
export function rampLift(H, x, z) {
  for (const s of houseSpecs(H)) {
    const R = rampOf(s.house);
    if (!R) continue;
    const l = toHouse(s, x, z);
    if (Math.abs(l.x) <= R.hw + 0.05 && l.z >= R.door - 0.05 && l.z <= R.z1) return R.yAt(l.z);
  }
  return 0;
}

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
    if (it.path && onRamp(s, me.box)) continue;
    /* A path may lap over the last PATH_RAMP_FOOT of a ramp: the slope there
       is a hand's height, and a walk turning off the foot for the bridge
       (`layDoorPath`) has its inside edge across it — refused, it slid two
       units clear and left lawn at the corner. */
    for (const B of houseBoxes(s, it.path ? -0.6 : HOUSE_GAP, it.path ? PATH_RAMP_FOOT : 0)) {
      if (me.box ? obbHit(B, me.box) : circleHit(B, x, z, me.r)) return `That is on top of the ${HOUSE_BY_ID[s.house].short}.`;
    }
  }
  if (E.landing && !it.path && (me.box ? circleHit(me.box, E.landing.x, E.landing.z, LANDING_R) : Math.hypot(x - E.landing.x, z - E.landing.z) < me.r + LANDING_R)) {
    return 'Keep the landing at the end of your bridge clear.';
  }
  // her statues and the boombox by the gate (Housing.envOf `entrance`)
  if (!it.path && (E.entrance ?? []).some((o) => shapesHit(me, o, -0.1))) return 'That is in the way of your statues and the boombox at the gate.';
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
  const Bs = houseBoxes(spec);
  if (Bs.some((B) => corners(B).some((p) => Math.hypot(p.x, p.z) > R - RIM))) return 'Too close to the edge of the island.';
  for (const s of houseSpecs(H)) {
    if (s.hk === spec.hk) continue;
    if (houseBoxes(s, 0.8).some((A) => Bs.some((B) => obbHit(A, B)))) return `It would bump into the ${HOUSE_BY_ID[s.house].short}.`;
  }
  if (E.landing && Bs.some((B) => circleHit(B, E.landing.x, E.landing.z, LANDING_R + 1))) return 'Keep the landing at the end of your bridge clear.';
  for (const q of H.outdoor ?? []) {
    const qi = ITEM_BY_ID[q.id];
    if (!qi) continue;
    if (Bs.some((B) => shapesHit({ box: B }, thingShape(qi, q.x, q.z, q.rot ?? 0), -0.1))) return `The ${qi.name} is in the way — move it first.`;
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

/* ------------------------- the walk to the door ------------------------- */

/**
 * THE PATH IT COMES WITH. Richard, Oct 2026: "When I bought an island, there
 * was a Cherry Tree infront of the door/walking path, we should ensure there
 * is no objects directly in the walking path of the front door. We should
 * also include some walking paths from the bridge gate to the front of the
 * door. Depending on the housetype, it should define the quality of the
 * walking paths. The Castle should get red carpet or sakura petals, Dojo
 * house should get Flagstone path or Raked Gravel Path, and Small Japanese
 * house should get Stepping Stone or Boardwalk." Which of the two is the
 * island's (`doorPathId`), so a home always gets the same one.
 */
export const DOOR_PATHS = {
  castle: ['path_carpet', 'path_petal'],
  dojohouse: ['path_flag', 'path_gravel'],
  minka: ['path_stone', 'path_wood'],
};
/** How far up from its foot a path may lap over a ramp's side (`yardWhy`). */
export const PATH_RAMP_FOOT = 1.6;
/** How much wider than the path the strip kept clear of a preset's yard is, each side. */
export const DOOR_WALK_PAD = 1.2;

/** The path piece for this home: one of its house's two, by the island. */
export function doorPathId(H) {
  const pair = DOOR_PATHS[H.house] ?? DOOR_PATHS.minka;
  let h = 0;
  for (const c of String(H.site ?? '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return pair[h % pair.length];
}

/**
 * From the foot of the main house's front steps to the landing, in the
 * island's frame: `{ a, b, len, rot }`, or null when there is no landing to
 * walk to. The front is the house's +z, and `houseFoot` already reaches the
 * bottom of a raised house's ramp (homehouse.js) — the ramp itself is its own
 * leg (`rampWalk`), because the landing is seldom straight ahead and a walk
 * that left the ramp at an angle would be half in its wall.
 */
export function doorWalk(H, env = 50) {
  const E = envOf(env);
  const s = houseSpecs(H)[0];
  if (!s || !E.landing) return null;
  /* From the ramp's own foot where there is one: `houseFoot` measures the
     ramp as base / 0.32, which on the castle is 1.75 past where its slope
     meets the grass (`rampOf`), and the walk started there — a strip of lawn
     between the carpet on the ramp and the carpet to the bridge. */
  const R = rampOf(s.house);
  const a = toIsle(s, 0, R ? R.z1 : houseFoot(s.house).z1 + 0.4);
  const b = { x: E.landing.x, z: E.landing.z };
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  if (len < 1) return null;
  return { a, b, len, rot: Math.atan2(b.x - a.x, b.z - a.z) };
}

/**
 * ...and the leg before it: from the main house's front door straight down
 * its ramp to the grass, or null for a house with a step. Richard, Oct 2026:
 * "Auto walking paths should go up the castle and Dojo House ramps to the
 * front door, truncated to fit". The walk used to stop at the ramp's foot.
 */
export function rampWalk(H) {
  const s = houseSpecs(H)[0];
  const R = s && rampOf(s.house);
  if (!R) return null;
  const a = toIsle(s, 0, R.door), b = toIsle(s, 0, R.z1);
  return { a, b, len: R.z1 - R.door, rot: Math.atan2(b.x - a.x, b.z - a.z) };
}

/** The walk as a box, `pad` wider each side than the path (DOOR_WALK_PAD). */
export function doorWalkBox(H, env = 50, pad = DOOR_WALK_PAD) {
  const W = doorWalk(H, env);
  if (!W) return null;
  const it = ITEM_BY_ID[doorPathId(H)];
  return obb((W.a.x + W.b.x) / 2, (W.a.z + W.b.z) / 2, (it?.pw ?? 3) / 2 + pad, W.len / 2, W.rot);
}

/**
 * Lay the walk: pieces of the house's path end to end from the door to the
 * landing, overlapping a little so no grass shows at a joint. Each is an
 * ordinary yard row she can move or sell, marked `free` like the windows a
 * house comes with — it sells for nothing because it cost nothing. A piece
 * the yard refuses (`yardWhy`) is left out rather than forced. Returns how
 * many were laid.
 */
export function layDoorPath(H, env = 50) {
  const W = doorWalk(H, env);
  const id = doorPathId(H);
  const it = ITEM_BY_ID[id];
  if (!W || !it) return 0;
  layDoorMat(H, env);
  const F = frontWalk(H, W, it);
  // the KNEE: one piece on the corner itself, turned halfway between the two legs
  const knee = { a: W.a, len: it.len, rot: F.rot + Math.atan2(Math.sin(W.rot - F.rot), Math.cos(W.rot - F.rot)) / 2 };
  return layWalk(H, F, id, env) + layWalk(H, { ...knee, a: { x: W.a.x - Math.sin(knee.rot) * it.len / 2, z: W.a.z - Math.cos(knee.rot) * it.len / 2 } }, id, env, true) + layWalk(H, W, id, env);
}

/**
 * NO GRASS AT THE ELBOW. Richard, Oct 2026: "Paths in front of a bought
 * building must connect or overlap, with no gaps." The walk leaves the door
 * STRAIGHT — up the ramp where there is one, a stub off the step where there
 * is not — and runs on past where the walk to the bridge turns away by the
 * path's width, so the outside of that corner is under this leg's last piece
 * rather than between the two (measured over four landings: a castle's walk
 * was lawn at up to 335 of 2320 points, a Dojo House's 192, a minka's 5 at
 * its step; all 0 now, `world-check`).
 */
function frontWalk(H, W, it) {
  const R = rampWalk(H);
  if (R) return { ...R, len: R.len + it.pw };
  const s = houseSpecs(H)[0];
  const o = toIsle(s, 0, 0), f = toIsle(s, 0, 1);
  // from the step itself, not the walk's start 0.4 out: a walk leaving at a slant opens a corner behind that
  const z = houseFoot(s.house).z1;
  return { a: toIsle(s, 0, z), len: it.pw + 0.4, rot: Math.atan2(f.x - o.x, f.z - o.z) };
}

/**
 * A DOOR MAT at the main house's door: on the porch at the top of a ramp, on
 * the lawn at the foot of a step. Free, like the walk, and one of DOOR_MATS
 * by the island (the same hash as `doorPathId`), so a home always gets the
 * same one until she picks another. Returns how many were laid (0 or 1).
 */
export function layDoorMat(H, env = 50) {
  const s = houseSpecs(H)[0];
  const it = ITEM_BY_ID.path_mat;
  if (!s || !it) return 0;
  const R = rampOf(s.house);
  const z = (R ? R.door : houseFoot(s.house).z1) + 0.1;
  const a = toIsle(s, 0, z), f = toIsle(s, 0, z + 1);
  const n = layWalk(H, { a, len: it.len, rot: Math.atan2(f.x - a.x, f.z - a.z) }, 'path_mat', env);
  let h = 7;
  for (const c of String(H.site ?? '')) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  const m = DOOR_MATS[h % DOOR_MATS.length];
  if (n && m !== DOOR_MATS[0]) H.outdoor[H.outdoor.length - 1].look = { style: m.id };
  return n;
}

/** Only the ramp's leg — for a home whose walk was laid before it had one (housing.js `_applyStore`). */
export function layRampPath(H, env = 50) {
  const R = rampWalk(H), id = doorPathId(H);
  // run on past the foot like a new home's (`frontWalk`), so it meets the walk it was added to
  return layWalk(H, R && { ...R, len: R.len + (ITEM_BY_ID[id]?.pw ?? 0) }, id, env);
}

/** One leg of the walk (`doorWalk`, `rampWalk`), laid in pieces of `id`.
 *  `fwd`: a refused piece only ever slides on, never back (the knee). */
function layWalk(H, W, id, env, fwd = false) {
  const it = ITEM_BY_ID[id];
  if (!W || !it) return 0;
  /* END TO END, EXACTLY: the first piece's end on the leg's start (the door,
     or the foot of the steps), the last's on its end, the rest shared out
     between. They used to be centred on n equal steps, which put the first
     piece's end (len - step) / 2 behind the start — harmless at the foot of a
     step, but at the top of a ramp that is the wall, and the piece was
     refused. A leg shorter than one piece (the Dojo House's ramp, 4.4) starts
     at its start and runs on past its end, onto the grass. */
  const n = Math.max(1, Math.ceil((W.len - 0.6) / (it.len - 0.6)));
  const step = n > 1 ? (W.len - it.len) / (n - 1) : 0;
  let laid = 0;
  const rot = +W.rot.toFixed(4);
  /* A REFUSED PIECE SLIDES, IT IS NOT DROPPED. The first piece of a walk
     that leaves the house at an angle has its back corner in the house's
     plinth and the yard refuses it; it used to be left out, which was a
     whole piece of lawn between the door and the rest (the Dojo House's
     at 192 of 1895 points). It slides on along the leg, a quarter unit at a
     time, never back past the leg's start; a later piece tries both ways. */
  const slides = (k) => {
    const out = [0];
    for (let d = 0.25; d <= it.len / 2 + 1e-9; d += 0.25) { out.push(d); if (k > 0 && !fwd) out.push(-d); }
    return out;
  };
  for (let k = 0; k < n; k++) {
    for (const d of slides(k)) {
      const t = it.len / 2 + k * step + d;
      const x = +(W.a.x + Math.sin(W.rot) * t).toFixed(2);
      const z = +(W.a.z + Math.cos(W.rot) * t).toFixed(2);
      if (yardWhy(H, it, x, z, -1, { ...envOf(env), rot })) continue;
      addOutdoor(H, id, x, z, rot).free = true;
      laid++;
      break;
    }
  }
  return laid;
}

/** The first free spot for `it` outdoors — rings out from the house, back first; or null.
 *  `keep`: boxes nothing may stand on (the walk to the door, `doorWalkBox`). */
export function firstYardSpot(H, it, siteR = 50, keep = []) {
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
      if (keep.some((B) => B && shapesHit({ box: B }, thingShape(it, x, z, 0)))) continue;
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
export function wallSlots(houseId, room, { strict = false } = {}) {
  const S = houseShape(houseId);
  const [hw, hd] = S.floors[room.floor] ?? S.floors[0];
  const out = [];
  /* ON AN OUTSIDE WALL: within 1.2 of it, or — Richard, Oct 2026: "There are
     no windows on the castle's 1st floor ... 'This room has no outside wall
     to hang things on', but it does have an outside wall and a front door" —
     further in with NO OTHER ROOM of its floor between it and the wall. The
     castle's rooms are cell-aligned inside stone walls: the ground floor's
     19 x 18 sits 1.5 and 2 in from walls at 11, the second floor's 1 and 2.5
     in from 9, so only two of its sides and none of the ground floor's ever
     counted. `strict` is the old rule, for the one-time window fill. */
  const others = strict ? [] : (HOUSE_BY_ID[houseId]?.rooms ?? []).filter((r) => r.floor === room.floor && r.id !== room.id);
  const clear = (x0, x1, z0, z1) => !others.some((r) => r.cx + r.w / 2 > x0 && r.cx - r.w / 2 < x1 && r.cz + r.d / 2 > z0 && r.cz - r.d / 2 < z1);
  const rx0 = room.cx - room.w / 2, rx1 = room.cx + room.w / 2, rz0 = room.cz - room.d / 2, rz1 = room.cz + room.d / 2;
  const near = (gap, strip) => gap < 1.2 || (!strict && gap < WALL_GAP && strip());
  const sides = [
    { side: 0, on: near(Math.abs(rz1 - hd), () => clear(rx0, rx1, rz1, hd)), along: 'x', fixed: hd - 0.22, ry: Math.PI },
    { side: 1, on: near(Math.abs(rx1 - hw), () => clear(rx1, hw, rz0, rz1)), along: 'z', fixed: hw - 0.22, ry: -Math.PI / 2 },
    { side: 2, on: near(Math.abs(rz0 + hd), () => clear(rx0, rx1, -hd, rz0)), along: 'x', fixed: -hd + 0.22, ry: 0 },
    { side: 3, on: near(Math.abs(rx0 + hw), () => clear(-hw, rx0, rz0, rz1)), along: 'z', fixed: -hw + 0.22, ry: Math.PI / 2 },
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
        // where the front door's leaf slides to when it opens (`FRONT_DOOR_CLEAR`)
        byDoor: s.side === 0 && room.floor === 0 && Math.abs(a) < FRONT_DOOR_CLEAR,
      });
    }
  }
  return out;
}

/**
 * NO WINDOW WHERE A DOOR SLIDES. Richard, Oct 2026: "We shouldn't place a
 * window too close to the door, like in the castle, because then the sliding
 * door interferes with the window and even when window is opened, it is being
 * obstructed by the open sliding door." The front door is 2.8 wide and its
 * two leaves part to `w/4 + (w/2 + 0.05)` from the middle, each w/2 wide
 * (the door step in homeisle.js, `d.panels.forEach`), so an open leaf's outer edge is at 2.85; a
 * window (1.6, WINDOW in homehouse.js) must start beyond it. The castle's
 * front wall had windows at +-2.5, spanning 1.7..3.3: half of each behind an
 * open door. A sliding door's leaves (SLIDE_W 1.8) reach 1.85 from its own
 * middle, so it and a window can never be on neighbouring slots (2 apart).
 */
export const FRONT_DOOR_CLEAR = 2.8 + 0.05 + 1.6 / 2;
export const SLIDE_CLEAR = 1.8 + 0.05 + 1.6 / 2;

/** May a window or a sliding door go on slot S of this room's wall, given what hangs there? Null, or why not. */
export function openingWhy(room, R, S, id, skip = -1) {
  if (id !== 'window' && id !== 'slidedoor') return null;
  if (S.byDoor) return 'Too close to the front door — it slides open over there.';
  const at = S.side % 2 ? S.z : S.x;
  const slots = wallSlots(room.house, room);
  for (const [i, q] of (R?.wall ?? []).entries()) {
    if (i === skip || q.side !== S.side || q.k === S.k) continue;
    if (!((q.id === 'slidedoor' && (id === 'window' || id === 'slidedoor')) || (q.id === 'window' && id === 'slidedoor'))) continue;
    const T = slots.find((x) => x.side === q.side && x.k === q.k);
    if (T && Math.abs((T.side % 2 ? T.z : T.x) - at) < SLIDE_CLEAR) return 'Too close to the sliding door — it slides open over there.';
  }
  return null;
}

/** How far in from its outer wall a room may sit and still own it, with no other room between (`wallSlots`): the castle's second floor is 2.5 in. */
export const WALL_GAP = 3;

/** Is slot (side, k) of this room free? `skip` is the wall row being moved. */
export function wallFree(R, side, k, skip = -1) {
  return !(R?.wall ?? []).some((q, i) => i !== skip && q.side === side && q.k === k);
}

/**
 * A preset, furnished: its room things into the first rooms that take them
 * and its yard things into the first free spots. Whatever does not fit is
 * skipped — a preset is a head start, not a promise.
 */
export function autoLayout(H, preset, isle, env = null) {
  const rooms = homeRooms(H).filter((r) => !H.rooms?.[r.id]?.type || H.rooms[r.id].type === 'living');
  H.rooms ??= {};
  for (const id of preset.room ?? []) {
    const it = ITEM_BY_ID[id];
    if (!it) continue;
    for (const room of rooms) {
      const R = (H.rooms[room.id] ??= { type: 'living', items: [] });
      R.items ??= [];
      const at = firstFit(roomWith(room, R), R.items, it);
      if (at) { R.items.push({ id, ...at }); break; }
    }
  }
  H.outdoor ??= [];
  // nothing a preset brings may stand on the walk from the bridge to the door
  const keep = env ? [doorWalkBox(H, env)] : [];
  for (const id of preset.yard ?? []) {
    const it = ITEM_BY_ID[id];
    const at = it && firstYardSpot(H, it, isle?.radius ?? 50, keep);
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
export function defaultWindows(H, hk = 'main', onlyNew = false) {
  H.rooms ??= {};
  for (const room of homeRooms(H)) {
    if (hk != null && room.hk !== hk) continue;
    const R = (H.rooms[room.id] ??= { type: 'living', items: [] });
    R.wall ??= [];
    const bySide = {};
    // `onlyNew`: just the walls `wallSlots`' looser rule opened, so a window she sold is not put back
    const had = onlyNew ? new Set(wallSlots(room.house, room, { strict: true }).map((S) => S.side)) : new Set();
    // not in a bridge's doorway, which a castle already lived in has on these walls (build.js `buildWhy`'s rule)
    const door = (S) => (H.links ?? []).some((L) => [L.a, L.b].some((e) => e.hk === room.hk && e.floor === room.floor && e.side === S.side
      && Math.abs(e.at - (S.side % 2 ? S.z : S.x)) < (LINK_BY_ID[L.style] ?? LINK_BY_ID.plank).w / 2 + 1.1));
    for (const S of wallSlots(room.house, room)) if (!had.has(S.side) && !door(S) && !openingWhy(room, R, S, 'window')) (bySide[S.side] ??= []).push(S);
    for (const list of Object.values(bySide)) {
      const S = list[Math.floor(list.length / 2)];
      if (wallFree(R, S.side, S.k)) R.wall.push({ id: 'window', side: S.side, k: S.k, free: true });
    }
  }
  return H;
}

/** Sell-back for one item: the same 75% as a house. */
export const ITEM_SELL = 0.75;
