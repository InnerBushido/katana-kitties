import * as THREE from 'three';
import { paint } from '../../core/gfx.js';
import { PALETTE } from '../../world/build.js';
import { HOUSE_BY_ID, ITEM_BY_ID, LINK_BY_ID, houseSpecs } from './catalog.js';
import { floorOf, houseFoot, houseHeight, stairBlocks, PORT_H } from './homehouse.js';

/* ---------------------------------------------------------------------------
   BRIDGES BETWEEN HOUSES — a door in one house's wall, a door in another's,
   and whatever bridge those two doors make.

   Richard, Oct 2026: "a way for houses to be connected together with bridges,
   if so, a hole needs to be cut in the wall of the house ... The bridges should
   be able to be dynamic and can even be rotated. The bridges should work on
   the 1st, 2nd, or 3rd floor and should be able to connect a 2nd floor to a
   3rd floor ... There should be different ramps or steps on the bridges to
   connect the different floor heights."

   SO A BRIDGE IS ITS TWO ENDS AND NOTHING ELSE (`{ uid, a, b, style }`, an end
   `{ hk, floor, side, at }`). Its angle, length and climb are worked out from
   where the two doors are, every time — which is what makes it "dynamic":
   move a house and its bridges re-lay themselves, and one that can no longer
   be built (too long, too steep, through a house) is sold back, out loud.

   Everything here is PURE — island-local numbers in, island-local numbers
   out — so the card, the ghost, the build and `world-check` agree. Heights are
   relative to the island's own ground height; `gyAt(x, z)` is the ground
   under a house's centre (zero in a check, the island's real hill in the game).
--------------------------------------------------------------------------- */

/** The longest bridge: a long walk, not a road. Richard, Oct 2026: "there is
 *  a limit for how long a bridge can be, is there a specific reason for this?
 *  If not, we can remove the length restriction or at least double it". There
 *  was no reason but taste; it is doubled, from 40. The island's edge is the
 *  real limit now (a turn off it is refused), and a bridge that climbs is
 *  still held to LINK_GRADE. */
export const LINK_MAX = 80;
export const LINK_MIN = 1.5;
/** Steepest climb, rise over run: a staircase's (homehouse.js STAIR_GRADE). */
export const LINK_GRADE = 0.5;
/** A bridge door stays this far from a corner post and from another door. */
const PORT_EDGE = 1.4;

/* ---------------------------------------------------------------------------
   TURNS. Richard, Oct 2026: "she sets the number of turns or parts, and
   places each turn's start and end; each extra turn adds 25% to the price;
   optional smooth 90° turns, each also +25%, flat and level at the junction;
   the segments take up the height difference."

   A bridge with turns is its two doors and `via`, the corners between them in
   the island's frame (`{ x, z, smooth }`), in order from A. Between every two
   points is a RUN — a straight bridge exactly like a turnless one, drawn by
   the same `linkParts` — and at every corner a LEVEL junction:
     sharp  — both runs stop half a width short of the corner, and a round
              landing of radius half a width times √2 joins them. That radius
              passes exactly through the four corners of the two runs' square
              ends whatever the angle, so the landing closes every gap at any
              turn and its rail is the circle less the two openings. (The
              first try ran the runs right INTO the corner with a landing the
              bridge's own width: no gaps, but each run's slope started at the
              corner itself, and the floor a step from the middle of the turn
              was 0.05 off level — measured, and not "flat at the junction".)
     smooth — the corner is cut back on both runs and a level arc of radius
              one bridge-width joins them.
   The rise is shared between the runs in proportion to their length, so the
   whole bridge is one grade and every junction is flat. With no turns there
   is one run and every number is the turnless bridge's, bit for bit.
--------------------------------------------------------------------------- */

/** Each turn adds this much of the bridge's price; a smooth one the same again. */
export const TURN_PRICE = 0.25;
/** The most turns a bridge can have. Richard, Oct 2026: "Player should be able
 *  to build as many bridge sections as they want instead of limiting it to
 *  only 3". It was 3; twelve is more than an island has room for, and keeps
 *  the price (a quarter a turn) and the card's count readable. LEFT/RIGHT on
 *  the HOW MANY TURNS step sets it (cards.js `_v_linkturns`). */
export const LINK_TURNS_MAX = 12;
/** A run shorter than this between two turns is "too tight". */
export const RUN_MIN = 1;
/** A smooth turn's middle radius, in bridge widths. */
const ARC_W = 1;

/** The price multiplier for bridge L: 1 + 25% a turn + 25% a smooth turn. */
export const linkPriceK = (L) => 1 + TURN_PRICE * ((L?.via?.length ?? 0) + (L?.via ?? []).filter((v) => v.smooth).length);

/** A house's spec by key. */
export const specOf = (H, hk) => houseSpecs(H).find((s) => s.hk === hk) ?? null;

/** House-local (lx, lz) of spec `s` into the island's frame. */
export function toIsle(s, lx, lz) {
  const c = Math.cos(s.rot), n = Math.sin(s.rot);
  return { x: s.x + lx * c + lz * n, z: s.z - lx * n + lz * c };
}

/** The island's frame into spec `s`'s house frame. */
export function toHouse(s, x, z) {
  const c = Math.cos(s.rot), n = Math.sin(s.rot);
  const dx = x - s.x, dz = z - s.z;
  return { x: dx * c - dz * n, z: dx * n + dz * c };
}

/**
 * Where an end is: its doorway's middle on the OUTSIDE face of the wall, in
 * the island's frame, its floor's height, and which way out the wall faces.
 * Null if that floor or wall is not there.
 */
export function endAt(H, e, gyAt = () => 0) {
  const s = specOf(H, e.hk);
  const F = s && floorOf(s.house, e.floor);
  if (!F) return null;
  const o = 0.16;
  const [lx, lz, nx, nz] = [
    [e.at, F.hd + o, 0, 1], [F.hw + o, e.at, 1, 0], [e.at, -F.hd - o, 0, -1], [-F.hw - o, e.at, -1, 0],
  ][e.side] ?? [];
  if (lx == null) return null;
  const p = toIsle(s, lx, lz);
  const n = toIsle({ ...s, x: 0, z: 0 }, nx, nz);
  return { x: p.x, z: p.z, y: F.y + gyAt(s.x, s.z), nx: n.x, nz: n.z, spec: s, F, floor: e.floor };
}

/**
 * The bridge two ends make: A and B, its direction, length, the climb, and
 * the deck's frame for `heightAt` (homeisle.js reads `frame` the same way it
 * reads a treehouse branch's).
 */
export function linkGeom(H, L, gyAt) {
  const A = endAt(H, L.a, gyAt);
  const B = endAt(H, L.b, gyAt);
  if (!A || !B) return null;
  const st = LINK_BY_ID[L.style] ?? LINK_BY_ID.plank;
  const w = st.w, hw = w / 2;
  const via = L.via ?? [];
  const pts = [A, ...via, B];
  // each leg, corner to corner
  const legs = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const dx = pts[k + 1].x - pts[k].x, dz = pts[k + 1].z - pts[k].z;
    const len = Math.hypot(dx, dz) || 1e-6;
    legs.push({ len, ux: dx / len, uz: dz / len });
  }
  // each corner: how far it turns, which side is inside, and how much it cuts off both legs
  const turns = via.map((v, i) => {
    const a = legs[i], b = legs[i + 1];
    const c = a.ux * b.uz - a.uz * b.ux;
    const theta = Math.acos(Math.max(-1, Math.min(1, a.ux * b.ux + a.uz * b.uz)));
    const smooth = !!v.smooth;
    const R = w * ARC_W;
    /* A SHARP TURN TIGHTER THAN A RIGHT ANGLE STOPS ITS RUNS FURTHER BACK.
       Richard, Oct 2026: "if the corner angle is less than 90 degrees on a
       corner piece, then the railings are passing through the model". They
       were: both runs stopped half a width short of the corner whatever the
       angle, and the two INNER rails only meet at hw * tan(theta / 2) from it —
       exactly hw at a right angle, further out past one, so each run's inner
       rail ran on through the other run. Now a run stops where its inner rail
       meets the other's, and the landing's radius is the distance to the
       corners of those square ends, so the landing still closes every gap. At
       a right angle or wider, every number is what it was. */
    const t = smooth ? R * Math.tan(Math.min(theta, Math.PI * 0.9) / 2) : hw * Math.max(1, Math.tan(Math.min(theta, Math.PI * 0.8) / 2));
    // the side (as `linkParts` numbers them: +1 is (uz, -ux)) the bridge turns toward
    const inner = c > 1e-9 ? -1 : c < -1e-9 ? 1 : 0;
    const pad = smooth ? hw * Math.SQRT2 : Math.hypot(t, hw);
    return { x: v.x, z: v.z, smooth, theta, t, inner, R, pad, open: smooth ? Math.SQRT1_2 : t / pad, in: a, out: b };
  });
  // the runs: each leg less what its turns cut off
  const runs = legs.map((g, k) => {
    const t0 = k > 0 ? turns[k - 1].t : 0, t1 = k < turns.length ? turns[k].t : 0;
    const p = pts[k];
    return { ...g, raw: g.len, len: g.len - t0 - t1, x0: p.x + g.ux * t0, z0: p.z + g.uz * t0 };
  });
  const total = runs.reduce((s, r) => s + Math.max(0, r.len), 0) || 1e-6;
  const rise = B.y - A.y;
  let walked = 0;
  const out = runs.map((r, k) => {
    const len = Math.max(r.len, 1e-6);
    const y0 = A.y + rise * (walked / total);
    walked += Math.max(0, r.len);
    const y1 = k === runs.length - 1 ? B.y : A.y + rise * (walked / total);
    const a0 = k === 0 ? A : { x: r.x0, z: r.z0, y: y0 };
    const b0 = k === runs.length - 1 ? B : { x: r.x0 + r.ux * len, z: r.z0 + r.uz * len, y: y1 };
    return {
      A: a0, B: b0, len, ux: r.ux, uz: r.uz, a: Math.atan2(r.ux, r.uz), w, style: st, rise: y1 - y0,
      first: k === 0, last: k === runs.length - 1, k, tight: r.len < (via.length ? RUN_MIN : 0),
    };
  });
  turns.forEach((T, i) => { T.y = out[i].B.y; });
  const r0 = out[0];
  return {
    A, B, w, style: st, rise, runs: out, turns,
    // the first run's, so a turnless bridge is the same object it always was
    len: via.length ? total : r0.len, ux: r0.ux, uz: r0.uz, a: r0.a,
    tight: out.some((r) => r.tight),
  };
}

/**
 * WHERE n TURNS START, before she moves them: a bridge that can already be
 * built, wherever that is easy to find. One turn goes where the two doors'
 * straight-out lines cross (two walls at right angles: an L); otherwise
 * every shape steps straight out of each door first, so the first and last
 * runs always leave their doors square.
 */
export function defaultVia(H, a, b, n, gyAt) {
  const A = a && endAt(H, a, gyAt), B = b && endAt(H, b, gyAt);
  if (!A || !B || !n) return [];
  const dx = B.x - A.x, dz = B.z - A.z;
  const D = Math.hypot(dx, dz) || 1;
  const pt = (x, z) => ({ x: +x.toFixed(2), z: +z.toFixed(2), smooth: false });
  if (n === 1) {
    const den = A.nx * B.nz - A.nz * B.nx;
    if (Math.abs(den) > 0.3) {
      const s = (dx * B.nz - B.nx * dz) / den, t = (dx * A.nz - A.nx * dz) / den;
      if (s > 2 && t > 2) return [pt(A.x + A.nx * s, A.z + A.nz * s)];
    }
    // facing doors: a shallow V off to one side
    return [pt((A.x + B.x) / 2 + A.nz * D / 4, (A.z + B.z) / 2 - A.nx * D / 4)];
  }
  const h = Math.max(3, D / 4);
  const pa = { x: A.x + A.nx * h, z: A.z + A.nz * h }, pb = { x: B.x + B.nx * h, z: B.z + B.nz * h };
  if (n === 2) return [pt(pa.x, pa.z), pt(pb.x, pb.z)];
  const sx = pb.x - pa.x, sz = pb.z - pa.z, sl = Math.hypot(sx, sz) || 1;
  return [pt(pa.x, pa.z), pt((pa.x + pb.x) / 2 + (sz / sl) * D / 6, (pa.z + pb.z) / 2 - (sx / sl) * D / 6), pt(pb.x, pb.z)];
}

/** A smooth turn's arc: centre, radius and the two angles (atan2(dx, dz)), sweeping `sweep`. */
export function turnArc(T) {
  const sx = T.x - T.in.ux * T.t, sz = T.z - T.in.uz * T.t;
  // the centre is R to the inside of where the arc starts
  const s = T.inner || 1;
  const cx = sx + s * T.in.uz * T.R, cz = sz - s * T.in.ux * T.R;
  const a0 = Math.atan2(sx - cx, sz - cz);
  const ex = T.x + T.out.ux * T.t, ez = T.z + T.out.uz * T.t;
  let sweep = Math.atan2(ex - cx, ez - cz) - a0;
  while (sweep > Math.PI) sweep -= Math.PI * 2;
  while (sweep < -Math.PI) sweep += Math.PI * 2;
  return { cx, cz, R: T.R, a0, sweep };
}

/** Points along a smooth turn's arc at radius `rad`, in the island's frame. */
function arcCurve(T, rad, n) {
  const C = turnArc(T);
  const pts = [];
  for (let j = 0; j <= n; j++) {
    const a = C.a0 + (C.sweep * j) / n;
    pts.push({ x: C.cx + Math.sin(a) * rad, z: C.cz + Math.cos(a) * rad });
  }
  return pts;
}

/**
 * A sharp turn's landing rail, as ARCS of its circle (`{ a0, sweep }`, angles
 * as atan2(dx, dz)): the circle less the two openings where the runs come in.
 * Each run's square end spans `atan(hw / t)` either side of its axis on the
 * landing's edge (45° at a right angle or wider — the √2), and the rail is
 * whatever lies outside both, at any angle of turn, with no case for which
 * side is inside.
 */
export function padArcs(T) {
  const h = Math.acos(Math.min(1, T.open ?? Math.SQRT1_2));
  const ai = Math.atan2(-T.in.ux, -T.in.uz), ao = Math.atan2(T.out.ux, T.out.uz);
  // the two openings as [from, to], then the gaps between them going round
  const norm = (a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const ops = [[norm(ai - h), 2 * h], [norm(ao - h), 2 * h]].sort((p, q) => p[0] - q[0]);
  const out = [];
  for (let k = 0; k < 2; k++) {
    const [s, w] = ops[k];
    const e = s + w;
    const next = ops[(k + 1) % 2][0] + (k === 1 ? Math.PI * 2 : 0);
    if (next - e > 0.02) out.push({ a0: e, sweep: next - e });
  }
  return out;
}

/** The landing rail as polylines at radius `rad`, for the colliders and the check. */
function padRails(T, rad) {
  return padArcs(T).map(({ a0, sweep }) => {
    const n = Math.max(2, Math.ceil(sweep / (Math.PI / 24)));
    const pts = [];
    for (let j = 0; j <= n; j++) {
      const a = a0 + (sweep * j) / n;
      pts.push({ x: T.x + Math.sin(a) * rad, z: T.z + Math.cos(a) * rad });
    }
    return pts;
  });
}

/**
 * A CURVED SOLID — the part of a ring between radii r0 and r1, heights y0 to
 * y1, from angle a0 round by `sweep` — as ONE closed mesh, about (cx, cz).
 * Richard, Oct 2026: "The curve on the stone bridge is having some z-fighting
 * issues and is not very smooth, seems like just stretched cubes fanning out
 * instead of being one polygonal smooth model." It was: every 15° a box, each
 * 0.04 longer than its chord so the joins closed, and every two neighbours
 * overlapping in a wedge whose faces were coplanar — alternate colours, too.
 * This is the deck, the parapet and every rail round a turn: one surface,
 * faceted every 5° or less.
 */
export function ringBand(cx, cz, r0, r1, y0, y1, a0, sweep, colour) {
  const n = Math.max(3, Math.ceil(Math.abs(sweep) / (Math.PI / 36)));
  const pos = [];
  const idx = [];
  // per step: inner bottom, inner top, outer top, outer bottom
  for (let j = 0; j <= n; j++) {
    const a = a0 + (sweep * j) / n, s = Math.sin(a), c = Math.cos(a);
    pos.push(cx + s * r0, y0, cz + c * r0, cx + s * r0, y1, cz + c * r0, cx + s * r1, y1, cz + c * r1, cx + s * r1, y0, cz + c * r1);
  }
  // wound so the faces point out whichever way it sweeps
  const flip = sweep > 0;
  const quad = (a, b, c, d) => (flip ? idx.push(a, c, b, a, d, c) : idx.push(a, b, c, a, c, d));
  for (let j = 0; j < n; j++) {
    const p = j * 4, q = p + 4;
    quad(p + 1, q + 1, q + 2, p + 2);   // top
    quad(p + 3, q + 3, q, p);           // bottom
    quad(p, q, q + 1, p + 1);           // inner
    quad(p + 2, q + 2, q + 3, p + 3);   // outer
  }
  const e = n * 4;
  quad(0, 1, 2, 3);                     // the start's end
  quad(e + 3, e + 2, e + 1, e);         // the finish's end
  // un-indexed, so every face has its own flat normal (a toon edge, not a smear)
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  paint(flat, colour);
  return flat;
}

/**
 * THE BRIDGE'S COLLIDERS, pure, in the island's frame with heights relative
 * to its ground: a deck per run and per turn (`homeisle.js` reads a deck's
 * `frame` as a treehouse branch's), and the rails as walls. World-check
 * walks these.
 */
/** How long one piece of a run's rail collider is (see `linkColliders`). */
export const RAIL_SEG = 1;

export function linkColliders(G) {
  const hw = G.w / 2;
  const decks = [];
  const walls = [];
  for (const r of G.runs) {
    const y0 = r.A.y;
    decks.push({
      x0: -hw, x1: hw, z0: r.first ? -0.4 : 0, z1: r.last ? r.len + 0.4 : r.len, y: Math.max(r.A.y, r.B.y), step: 0.6,
      frame: { x: r.A.x, z: r.A.z, a: r.a },
      yAt: (x, z) => y0 + r.rise * Math.min(1, Math.max(0, z / r.len)),
    });
    /* The rails IN PIECES, each a metre long with its own heights. One wall
       the length of a sloping run spanned from its lowest deck to its highest
       rail, so a bridge climbing to a third floor put an invisible wall in
       the room under it. Richard: "a bridge base going through the 1st-floor
       ceiling collides with a player inside". */
    const n = Math.max(1, Math.ceil(r.len / RAIL_SEG));
    for (const s of [-1, 1]) {
      const ox = r.uz * s * (hw - 0.05), oz = -r.ux * s * (hw - 0.05);
      for (let j = 0; j < n; j++) {
        const t0 = j / n, t1 = (j + 1) / n;
        const ya = y0 + r.rise * t0, yb = y0 + r.rise * t1;
        walls.push({
          ax: r.A.x + (r.B.x - r.A.x) * t0 + ox, az: r.A.z + (r.B.z - r.A.z) * t0 + oz,
          bx: r.A.x + (r.B.x - r.A.x) * t1 + ox, bz: r.A.z + (r.B.z - r.A.z) * t1 + oz,
          y0: Math.min(ya, yb) + 0.2, y1: Math.max(ya, yb) + 1.3, rail: true,
        });
      }
    }
  }
  for (const T of G.turns) {
    const rails = [];
    if (T.smooth) {
      const C = turnArc(T);
      const n = Math.max(4, Math.ceil(Math.abs(C.sweep) / (Math.PI / 12)));
      const mid = arcCurve(T, T.R, n);
      for (let j = 0; j < n; j++) {
        const p = mid[j], q = mid[j + 1];
        const l = Math.hypot(q.x - p.x, q.z - p.z);
        decks.push({ x0: -hw, x1: hw, z0: -0.15, z1: l + 0.15, y: T.y, step: 0.6, frame: { x: p.x, z: p.z, a: Math.atan2(q.x - p.x, q.z - p.z) }, turn: true });
      }
      rails.push(arcCurve(T, T.R - hw + 0.05, n), arcCurve(T, T.R + hw - 0.05, n));
    } else {
      // the landing: the square round it (the rail keeps her off its corners), square to the run coming in
      decks.push({ x0: -T.pad, x1: T.pad, z0: -T.pad, z1: T.pad, y: T.y, step: 0.6, frame: { x: T.x, z: T.z, a: G.runs[G.turns.indexOf(T)].a }, turn: true });
      rails.push(...padRails(T, T.pad - 0.05));
    }
    for (const c of rails) {
      for (let j = 0; j + 1 < c.length; j++) {
        walls.push({ ax: c[j].x, az: c[j].z, bx: c[j + 1].x, bz: c[j + 1].z, y0: T.y + 0.2, y1: T.y + 1.3, rail: true });
      }
    }
  }
  return { decks, walls };
}

/** The floor height along the bridge at distance d from A. */
export const linkY = (G, d) => G.A.y + G.rise * Math.min(1, Math.max(0, d / G.len));

/** How far into the room a bridge door's floor has to be clear of the stairs. */
export const PORT_IN = 2.6;

/** Is a doorway at `at` on this wall a possible place for a bridge door? */
export function portWhy(H, e, w, skipUid = null) {
  const s = specOf(H, e.hk);
  const F = s && floorOf(s.house, e.floor);
  if (!F) return 'That floor is not there.';
  const half = e.side % 2 ? F.hd : F.hw;
  if (Math.abs(e.at) > half - PORT_EDGE - w / 2 + 0.2) return 'Too close to the corner of the house.';
  if (e.side === 0 && e.floor === 0 && Math.abs(e.at) < 1.4 + w / 2 + 0.3) return 'That is the front door!';
  /* NOT BESIDE THE STAIRS. Richard, Oct 2026: "Bridges entrance/exit
     shouldn't be able to be built on second floor next to the stairs". A door
     opens onto the strip of floor inside it — PORT_IN deep, a step wider than
     the doorway each side — and that strip may not touch the stairs coming
     up through this floor or the stairs going on up from it. */
  const lo = e.at - w / 2 - 0.6, hi = e.at + w / 2 + 0.6;
  const strip = [
    // `at` is house x on the front and back walls and house z on the sides (`endAt`)
    { x0: lo, x1: hi, z0: F.hd - PORT_IN, z1: F.hd }, { x0: F.hw - PORT_IN, x1: F.hw, z0: lo, z1: hi },
    { x0: lo, x1: hi, z0: -F.hd, z1: -F.hd + PORT_IN }, { x0: -F.hw, x1: -F.hw + PORT_IN, z0: lo, z1: hi },
  ][e.side];
  if (strip && stairBlocks(s.house, e.floor).some((W) => strip.x0 < W.x1 && strip.x1 > W.x0 && strip.z0 < W.z1 && strip.z1 > W.z0)) {
    return 'The stairs are right there — pick a spot further along the wall.';
  }
  for (const L of H.links ?? []) {
    if (L.uid === skipUid) continue;
    for (const o of [L.a, L.b]) {
      if (o.hk !== e.hk || o.floor !== e.floor || o.side !== e.side) continue;
      const ow = (LINK_BY_ID[L.style] ?? LINK_BY_ID.plank).w;
      if (Math.abs(o.at - e.at) < (w + ow) / 2 + 0.6) return 'Another bridge already goes from there.';
    }
  }
  return null;
}

/** Point (x, z) in spec `s`'s ground rectangle, grown by `pad`? */
export function inFoot(s, x, z, pad = 0) {
  const R = houseFoot(s.house);
  const L = toHouse(s, x, z);
  return L.x > R.x0 - pad && L.x < R.x1 + pad && L.z > R.z0 - pad && L.z < R.z1 + pad;
}

/**
 * Why this bridge cannot be built, or null. `env.r` is the island's radius.
 * Things in the yard under it are NOT a reason — they are `linkBlockers`,
 * which the card offers to sell.
 */
export function linkWhy(H, L, env = {}) {
  const gyAt = env.gyAt ?? (() => 0);
  if (!L.a || !L.b) return 'Pick both ends first.';
  if (L.a.hk === L.b.hk) return 'A bridge goes between two different houses.';
  const st = LINK_BY_ID[L.style] ?? LINK_BY_ID.plank;
  const pa = portWhy(H, L.a, st.w, L.uid);
  if (pa) return pa;
  const pb = portWhy(H, L.b, st.w, L.uid);
  if (pb) return pb;
  const G = linkGeom(H, L, gyAt);
  if (!G) return 'One of those doors is not there any more.';
  const turned = G.turns.length > 0;
  const r0 = G.runs[0], rN = G.runs[G.runs.length - 1];
  // the two doors have to look at each other, or the bridge would go through a house
  if (r0.ux * G.A.nx + r0.uz * G.A.nz < 0.25 || -(rN.ux * G.B.nx + rN.uz * G.B.nz) < 0.25) {
    return turned ? 'The bridge has to leave each door straight out — move the first or last turn in front of its door.'
      : 'Those two walls face away from each other — pick walls that look at each other.';
  }
  if (turned) {
    const lim = (env.r ?? 50) - 1;
    if (L.via.some((v) => Math.hypot(v.x, v.z) > lim)) return 'A turn is off the edge of the island — bring it back in.';
    if (G.tight) return 'A turn is too tight — move it further from the door or from the next turn.';
  }
  if (G.len > LINK_MAX) return `Too ${turned ? 'long' : 'far apart'} for one bridge — ${Math.round(G.len)} long, and ${LINK_MAX} is the most.`;
  if (G.len < LINK_MIN) return 'Those houses are too close together for a bridge.';
  if (Math.abs(G.rise) / G.len > LINK_GRADE) {
    return turned ? 'Too steep to climb — make the bridge longer with its turns, or join floors nearer in height.'
      : 'Too steep to climb — move the houses further apart, or join floors nearer in height.';
  }
  /* Through a house? A straight bridge is only asked about the houses it does
     not join (its two doors face each other, which keeps it off its own).
     A turned one can double back, so it is asked about its own two as well,
     everywhere but the run out of each one's door. */
  const hw = G.w / 2;
  for (const s of houseSpecs(H)) {
    const own = s.hk === L.a.hk || s.hk === L.b.hk;
    if (own && !turned) continue;
    const top = houseHeight(s.house) + gyAt(s.x, s.z);
    const name = `It would go straight through the ${HOUSE_BY_ID[s.house].short}.`;
    for (const r of G.runs) {
      if ((r.first && s.hk === L.a.hk) || (r.last && s.hk === L.b.hk)) continue;
      for (let d = 0; d <= r.len; d += 0.5) {
        const y = linkY(r, d);
        if (y > top) continue;
        for (const o of [-hw, 0, hw]) {
          const x = r.A.x + r.ux * d + r.uz * o, z = r.A.z + r.uz * d - r.ux * o;
          if (inFoot(s, x, z)) return name;
        }
      }
    }
    for (const T of G.turns) if (T.y <= top && inFoot(s, T.x, T.z, hw)) return name;
  }
  /* NOT THROUGH ANOTHER BRIDGE — but under or over one, with room for a
     kitten between. Richard, Oct 2026: "Bridges shouldn't be able to be built
     intersecting through each other, but should be able to be built under
     another bridge if not intersecting or colliding." Every half unit along
     this bridge, middle and both edges, and every landing, asks the other
     bridges for their deck there; nearer than LINK_CLEAR in height is through. */
  const others = (H.links ?? []).filter((M) => M !== L && (L.uid == null || M.uid !== L.uid)).map((M) => linkGeom(H, M, gyAt)).filter(Boolean);
  if (others.length) {
    const near = (x, z, y, r) => others.some((GM) => { const yo = overStrip(GM, x, z, r); return yo != null && Math.abs(yo - y) < LINK_CLEAR; });
    for (const r of G.runs) {
      for (let d = 0; d <= r.len; d += 0.5) {
        const y = linkY(r, d);
        for (const o of [-hw, 0, hw]) if (near(r.A.x + r.ux * d + r.uz * o, r.A.z + r.uz * d - r.ux * o, y, 0.2)) return 'It would run into another bridge — go over or under it, with room to walk.';
      }
    }
    for (const T of G.turns) if (near(T.x, T.z, T.y, T.smooth ? hw : T.pad)) return 'It would run into another bridge — go over or under it, with room to walk.';
  }
  return null;
}

/** How far apart two bridges that cross have to be: a kitten (2.9), a deck and a rail between. */
export const LINK_CLEAR = 3.4;

/**
 * WHERE A BRIDGE'S POSTS MAY STAND: `(x, z, y)` — an island point under a deck
 * at height y — to the ground there, or NULL where a post would go into
 * something: any house (its plinth, and its eave band beyond it) or another
 * bridge lower down. `linkAll` and `turnParts` skip a null post.
 */
export function supportGround(H, L, gyAt = () => 0) {
  const others = (H?.links ?? []).filter((M) => M !== L && (L?.uid == null || M.uid !== L.uid)).map((M) => linkGeom(H, M, gyAt)).filter(Boolean);
  const specs = H ? houseSpecs(H) : [];
  return (x, z, y = Infinity) => {
    for (const s of specs) if (inFoot(s, x, z, 1.4)) return null;
    for (const GM of others) { const yo = overStrip(GM, x, z, 0.4); if (yo != null && yo < y) return null; }
    return gyAt(x, z);
  };
}

/** How high a yard thing stands, for "does it fit under the bridge?". */
export function yardH(it) {
  if (!it) return 3;
  if (it.path) return 0.15;
  const built = { koipond: 0.6, onsen: 0.7, volleyball: 3.4, bamboofarm: 6, pen: 1.4, treehouse: 18, stones: 0.5, toriigarden: 4 };
  return built[it.id] ?? it.size?.h ?? 3;
}

/** Circle (x, z, r) against the bridge strip of G; the deck's height there or null. */
export function overStrip(G, x, z, r) {
  if (G.runs?.length > 1) {
    let lo = null;
    for (const R of G.runs) { const y = overStrip(R, x, z, r); if (y != null) lo = lo == null ? y : Math.min(lo, y); }
    for (const T of G.turns) {
      if (Math.hypot(x - T.x, z - T.z) < (T.smooth ? G.w / 2 + T.t * 1.5 : T.pad) + r) lo = lo == null ? T.y : Math.min(lo, T.y);
    }
    return lo;
  }
  const vx = x - G.A.x, vz = z - G.A.z;
  const d = vx * G.ux + vz * G.uz;
  const off = Math.abs(vx * G.uz - vz * G.ux);
  if (d < -r || d > G.len + r || off > G.w / 2 + r) return null;
  // the LOWEST point of the deck over the circle is what it has to fit under
  return Math.min(linkY(G, d - r), linkY(G, d + r));
}

/**
 * Yard things under bridge L that do NOT fit under it, as indices into
 * `H.outdoor`. "If the objects fit under the bridge, then they can stay ...
 * if an object is interfering with building the bridge, then we can offer to
 * the player to automatically sell the object interfering and build the
 * bridge anyways."
 */
export function linkBlockers(H, L, env = {}) {
  const G = linkGeom(H, L, env.gyAt);
  if (!G) return [];
  const ground = env.groundAt ?? (() => 0);
  const out = [];
  (H.outdoor ?? []).forEach((q, k) => {
    const it = ITEM_BY_ID[q.id];
    if (!it) return;
    const y = overStrip(G, q.x, q.z, it.path ? 0.1 : (it.r ?? 2));
    if (y == null) return;
    if (y - 0.45 - ground(q.x, q.z) < yardH(it)) out.push(k);
  });
  return out;
}

/** Why a yard thing at (x, z) cannot go under a bridge there, or null. */
export function underBridgeWhy(H, it, x, z, env = {}) {
  for (const L of H.links ?? []) {
    const G = linkGeom(H, L, env.gyAt);
    if (!G) continue;
    const y = overStrip(G, x, z, it.path ? 0.1 : (it.r ?? 2));
    if (y == null) continue;
    if (y - 0.45 - (env.groundAt?.(x, z) ?? 0) < yardH(it)) return 'It will not fit under the bridge there.';
  }
  return null;
}

/**
 * Every place a bridge door could go: each floor of each house, each wall,
 * every 2 units along it, keeping off corners and the front door. With the
 * island-frame point just outside the wall, so the selector can hop between
 * them with the stick.
 */
export function portSpots(H, w = 3, gyAt) {
  const out = [];
  for (const s of houseSpecs(H)) {
    const def = HOUSE_BY_ID[s.house];
    for (let f = 0; f < def.floors; f++) {
      const F = floorOf(s.house, f);
      for (let side = 0; side < 4; side++) {
        const half = side % 2 ? F.hd : F.hw;
        for (let at = -Math.floor(half); at <= half; at += 2) {
          const e = { hk: s.hk, floor: f, side, at };
          if (portWhy(H, e, w)) continue;
          const E = endAt(H, e, gyAt);
          out.push({ ...e, x: E.x, z: E.z, y: E.y });
        }
      }
    }
  }
  return out;
}

/* ------------------------------- drawing -------------------------------- */

const bx = (w, h, d, c, x = 0, y = 0, z = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  paint(g, c);
  g.translate(x, y, z);
  return g;
};

/**
 * One bridge's parts in ITS OWN frame: A at the origin, B at (0, rise, len),
 * deck surface y = 0 at A. `ground(d)` is the island's height under the
 * middle at distance d, relative to A's floor, for the supports.
 * Returns `{ solid: geometry[], glow: geometry[] }` — glow is the lanterns'
 * paper, drawn unlit so it reads as lit at dusk.
 *
 * THE SUPPORTS HAVE NO COLLIDERS (Richard: "supports under the bridges, but
 * they may need to not have colliders so they don't block building any
 * outdoor objects underneath them").
 */
export function linkParts(G, ground) {
  const st = G.style;
  const { len, rise, w } = G;
  const hw = w / 2;
  const solid = [];
  const glow = [];
  const Y = (d) => rise * Math.min(1, Math.max(0, d / len));
  const { deckC, railC } = linkColours(st);
  const sloped = (wd, h, d0, d1, c, x = 0, lift = 0) => {
    const L = Math.hypot(d1 - d0, Y(d1) - Y(d0));
    const g = new THREE.BoxGeometry(wd, h, L);
    paint(g, c);
    g.rotateX(-Math.atan2(Y(d1) - Y(d0), d1 - d0));
    g.translate(x, (Y(d0) + Y(d1)) / 2 - h / 2 + lift, (d0 + d1) / 2);
    return g;
  };
  // ---- the deck: treads on a climb for the stepped styles, else a sloped walk
  const climbs = Math.abs(rise) > 0.05;
  if (st.steps && climbs) {
    const n = Math.max(3, Math.round(Math.abs(rise) / 0.3));
    const run = len / n;
    for (let k = 0; k < n; k++) {
      const d0 = k * run;
      const top = rise > 0 ? Y(d0 + run) : Y(d0);
      const lo = Math.min(Y(d0), Y(d0 + run)) - 0.35;
      solid.push(bx(w, top - lo, run + 0.02, k % 2 ? deckC : new THREE.Color(deckC).multiplyScalar(0.82).getHex(), 0, (top + lo) / 2, d0 + run / 2));
    }
  } else {
    solid.push(sloped(w, 0.3, -0.2, len + 0.2, deckC));
    // planks across, for the wooden ones
    if (st.id === 'plank' || st.id === 'rope') {
      for (let d = 0.4; d < len; d += 0.8) solid.push(bx(w + 0.1, 0.05, 0.12, 0x5a3e26, 0, Y(d) + 0.01, d));
    }
  }
  /* ---- THE THRESHOLD: the deck carried on through the doorway to the
     room's floor. Richard, Oct 2026: "The entrance/exit of the bridge should
     be merged better with the doorway to the house." The deck stopped 0.2
     past the wall's outside face and the floor stops at the wall's middle, so
     an upstairs doorway was a slot of sky between the two. A slab 0.45 deep
     fills it, a hair under the floor so the two tops are never one plane.
     Upstairs only: on the ground floor the plinth is already there. */
  const atA0 = G.first ?? true, atB0 = G.last ?? true;
  if (atA0 && (G.A?.floor ?? 0) > 0) solid.push(bx(w, 0.3, 0.45, deckC, 0, -0.162, -0.42));
  if (atB0 && (G.B?.floor ?? 0) > 0) solid.push(bx(w, 0.3, 0.45, deckC, 0, rise - 0.162, len + 0.42));
  // ---- posts and rails, both sides
  const postEvery = st.id === 'stone' ? len : 2.6;
  const postsAt = [];
  for (let d = 0.3; d < len; d += postEvery) postsAt.push(d);
  postsAt.push(len - 0.3);
  for (const s of [-1, 1]) {
    const x = s * (hw - 0.1);
    if (st.id === 'stone') {
      // a solid parapet, stepped with the treads
      solid.push(sloped(0.36, 1.05, 0, len, railC, x, 1.05));
      solid.push(sloped(0.46, 0.14, 0, len, 0xb0aba3, x, 1.12));
      // a squared pillar where the parapet meets the house: an end, not a cut
      if (atA0) solid.push(bx(0.48, 1.4, 0.5, railC, x, 0.7, 0.3));
      if (atB0) solid.push(bx(0.48, 1.4, 0.5, railC, x, rise + 0.7, len - 0.3));
    } else if (st.id === 'rope') {
      solid.push(sloped(0.07, 0.07, 0, len, railC, x, 1.05));
      solid.push(sloped(0.05, 0.05, 0, len, railC, x, 0.55));
    } else {
      solid.push(sloped(0.14, 0.14, 0, len, railC, x, 1.1));
      solid.push(sloped(0.08, 0.08, 0, len, railC, x, 0.55));
    }
    for (const d of postsAt) {
      if (st.id === 'stone') break;
      const h = st.id === 'vermilion' || st.id === 'sakura' ? 1.35 : 1.2;
      solid.push(bx(0.22, h, 0.22, st.id === 'rope' ? 0x6a4a2a : railC, x, Y(d) + h / 2, d));
      if (st.id === 'vermilion') {
        // giboshi — the brass onion on a shrine bridge's posts
        const gb = new THREE.SphereGeometry(0.17, 8, 6);
        paint(gb, 0xd8a83a);
        gb.translate(x, Y(d) + h + 0.12, d);
        solid.push(gb);
      }
      if (st.id === 'sakura') {
        const fl = new THREE.DodecahedronGeometry(0.22, 0);
        paint(fl, 0xffc4d8);
        fl.translate(x, Y(d) + h + 0.12, d);
        solid.push(fl);
      }
    }
  }
  // ---- the fancy ones' extras
  if (st.id === 'vermilion' || st.id === 'sakura') {
    for (const d of [len * 0.25, len * 0.75]) {
      for (const s of [-1, 1]) {
        const x = s * (hw + 0.05);
        solid.push(bx(0.06, 0.5, 0.06, PALETTE.woodDark, x, Y(d) + 1.55, d));
        const lamp = new THREE.CylinderGeometry(0.22, 0.22, 0.5, 10);
        paint(lamp, st.id === 'sakura' ? 0xffe0ec : 0xfff0c8);
        lamp.translate(x, Y(d) + 1.25, d);
        glow.push(lamp);
      }
    }
  }
  if (st.id === 'sakura' && !G.models) {
    // flower boxes along the deck edge (the planter MODELS take over in `linkModels`)
    for (let d = 1; d < len - 0.6; d += 2.2) {
      for (const s of [-1, 1]) {
        solid.push(bx(0.4, 0.3, 1.2, 0x7a5236, s * (hw - 0.45), Y(d) + 0.15, d));
        for (let k = 0; k < 3; k++) {
          const f = new THREE.DodecahedronGeometry(0.16, 0);
          paint(f, [0xff8fb8, 0xffd0e0, 0xffffff][k]);
          f.translate(s * (hw - 0.45), Y(d) + 0.38, d - 0.4 + k * 0.4);
          solid.push(f);
        }
      }
    }
    // the blossom arch over the middle
    const mid = len / 2;
    const arch = new THREE.TorusGeometry(hw + 0.2, 0.12, 6, 18, Math.PI);
    paint(arch, 0x6a4630);
    arch.translate(0, Y(mid) + 1.0, mid);
    solid.push(arch);
    for (let k = 0; k <= 10; k++) {
      const t = (k / 10) * Math.PI;
      const b = new THREE.DodecahedronGeometry(0.32 + (k % 3) * 0.06, 0);
      paint(b, k % 2 ? 0xffb7cf : 0xff9fc0);
      b.translate(Math.cos(t) * (hw + 0.2), Y(mid) + 1.0 + Math.sin(t) * (hw + 0.2), mid);
      solid.push(b);
    }
  }
  /* ---- supports down to the ground (no colliders), every few units — but
     NONE THAT WOULD STAND IN SOMETHING. Richard, Oct 2026: "a bridge going to
     the 3rd floor is drawing supports underneath that are going into the 1st
     floor ... if a bridge is above another bridge, supports should not be
     drawn beneath it if it would collide/intersect with a bridge below it."
     `ground(d, o)` is null over a house or a lower bridge (`supportGround`),
     and each post asks for its own foot, so one side of a pair can stand
     while the other, over a roof, does not. */
  const deep = { plank: 0x5a3e26, rope: 0x5a3e26, stone: 0x8a857c, vermilion: 0x8a2a22, sakura: 0x6a4630 }[st.id] ?? 0x5a3e26;
  for (let d = Math.min(3, len / 2); d < len - 1; d += 5) {
    const top = Y(d) - 0.3;
    for (const s of st.id === 'stone' ? [0] : [-1, 1]) {
      const g = ground(d, s * (hw - 0.3));
      if (g == null) continue;
      const h = top - g;
      if (h < 0.6) continue;
      const wd = st.id === 'stone' ? w * 0.7 : 0.3;
      solid.push(bx(wd, h, st.id === 'stone' ? 1.0 : 0.3, deep, s * (hw - 0.3), g + h / 2, d));
    }
  }
  return { solid, glow };
}

/** A style's deck and rail colours (a run's and a turn's are the same bridge). */
export function linkColours(st) {
  return {
    deckC: { plank: PALETTE.wood, rope: 0x9a7448, stone: 0x9a958e, vermilion: 0x6a4630, sakura: 0x7a5236 }[st.id] ?? PALETTE.wood,
    railC: { plank: PALETTE.woodDark, rope: 0xcdb27a, stone: 0x8a857c, vermilion: 0xc0302a, sakura: 0xd96a8a }[st.id] ?? PALETTE.woodDark,
  };
}

/**
 * One turn's parts, in the ISLAND's axes with the corner at the origin and
 * its level deck's top at y 0: the landing or the arc and its rails — each
 * ONE curved solid (`ringBand`) — and a post down to the ground under it if
 * it is high enough to need one. `groundAt(x, z)` is the ground at an island
 * point relative to the deck, or null where a post may not stand (a house,
 * a lower bridge: `supportGround`).
 *
 * THE POST STANDS UNDER THE DECK. Richard, Oct 2026: "Seems the corner pieces
 * of the bridges are floating in space needlessly on sharp turns ... if the
 * support is not connected to the bridge or underneath it, let's remove it".
 * It stood under the CORNER — the point the two runs would meet at — and a
 * smooth turn's arc cuts inside that point by most of a width, so the post was
 * a beam on its own beside the curve. It is under the arc's middle now.
 */
export function turnParts(G, T, groundAt = () => null) {
  const st = G.style;
  const hw = G.w / 2;
  const { deckC, railC } = linkColours(st);
  const solid = [];
  // each curve: centre (relative to the corner), radius, start angle, sweep
  const rails = [];
  let post = { x: 0, z: 0 };
  if (T.smooth) {
    const C = turnArc(T);
    const cx = C.cx - T.x, cz = C.cz - T.z;
    solid.push(ringBand(cx, cz, T.R - hw, T.R + hw, -0.3, 0, C.a0, C.sweep, deckC));
    rails.push({ cx, cz, r: T.R - hw + 0.1, a0: C.a0, sweep: C.sweep }, { cx, cz, r: T.R + hw - 0.1, a0: C.a0, sweep: C.sweep });
    const am = C.a0 + C.sweep / 2;
    post = { x: cx + Math.sin(am) * T.R, z: cz + Math.cos(am) * T.R };
  } else {
    const d = new THREE.CylinderGeometry(T.pad, T.pad, 0.3, 48);
    paint(d, deckC);
    d.translate(0, -0.15, 0);
    solid.push(d);
    for (const A of padArcs(T)) rails.push({ cx: 0, cz: 0, r: T.pad - 0.1, ...A });
  }
  for (const c of rails) {
    const band = (wd, y0, y1, col) => solid.push(ringBand(c.cx, c.cz, c.r - wd / 2, c.r + wd / 2, y0, y1, c.a0, c.sweep, col));
    if (st.id === 'stone') {
      band(0.36, 0, 1.05, railC);
      band(0.46, 1.12, 1.26, 0xb0aba3);
    } else {
      const [t, b] = st.id === 'rope' ? [0.07, 0.05] : [0.14, 0.08];
      const top = st.id === 'rope' ? 1.05 : 1.1;
      band(t, top, top + t, railC);
      band(b, 0.55, 0.55 + b, railC);
      for (const a of [c.a0, c.a0 + c.sweep]) {
        solid.push(bx(0.22, 1.2, 0.22, st.id === 'rope' ? 0x6a4a2a : railC, c.cx + Math.sin(a) * c.r, 0.6, c.cz + Math.cos(a) * c.r));
      }
    }
  }
  const g = groundAt(T.x + post.x, T.z + post.z);
  const h = g == null ? 0 : -0.3 - g;
  if (h > 0.6) solid.push(bx(st.id === 'stone' ? G.w * 0.5 : 0.4, h, st.id === 'stone' ? G.w * 0.5 : 0.4, 0x5a3e26, post.x, -0.3 - h / 2, post.z));
  return { solid };
}

/**
 * THE WHOLE BRIDGE AS ONE GROUP'S PARTS: every run's `linkParts` and models
 * and every turn's `turnParts`, all in the FIRST run's frame (A at the origin,
 * its turn), which is where homeisle.js and the build ghost stand the group.
 * `ground(x, z)` is the island's height there, relative to its ground. With
 * no turns this is `linkParts(G)` and `linkModels(G)` unchanged.
 */
export function linkAll(G, ground, models = false) {
  const A0 = G.runs[0].A, a0 = G.runs[0].a;
  const c0 = Math.cos(a0), s0 = Math.sin(a0);
  const into = (x, z) => { const dx = x - A0.x, dz = z - A0.z; return { x: dx * c0 - dz * s0, z: dx * s0 + dz * c0 }; };
  const solid = [], glow = [], mods = [];
  for (const r of G.runs) {
    const run = { ...r, models };
    // (d along the run, o across it) to the ground there, relative to the run's start; null: no post here
    const P = linkParts(run, (d, o = 0) => {
      const v = ground(r.A.x + r.ux * d + r.uz * o, r.A.z + r.uz * d - r.ux * o, r.A.y + r.rise * Math.min(1, Math.max(0, d / r.len)));
      return v == null ? null : v - r.A.y;
    });
    const o = into(r.A.x, r.A.z);
    const da = r.a - a0;
    const place = (g) => { g.rotateY(da); g.translate(o.x, r.A.y - A0.y, o.z); return g; };
    solid.push(...P.solid.map(place));
    glow.push(...P.glow.map(place));
    if (models) {
      const cd = Math.cos(da), sd = Math.sin(da);
      for (const m of linkModels(run)) {
        mods.push({ ...m, x: o.x + m.x * cd + m.z * sd, z: o.z - m.x * sd + m.z * cd, y: m.y + r.A.y - A0.y, ry: m.ry + da });
      }
    }
  }
  for (const T of G.turns) {
    const P = turnParts(G, T, (x, z) => { const v = ground(x, z, T.y); return v == null ? null : v - T.y; });
    const o = into(T.x, T.z);
    solid.push(...P.solid.map((g) => { g.rotateY(-a0); g.translate(o.x, T.y - A0.y, o.z); return g; }));
  }
  return { solid, glow, models: mods };
}

/** How far in from its door a stone bridge's parapet lanterns and a vermilion bridge's torii stand. */
export const LANTERN_IN = 1.8;
export const TORII_IN = 3.6;

/** The door heights a bridge needs: as tall as the front door. */
export const LINK_DOOR_H = PORT_H;

/**
 * THE MODELS ON A BRIDGE — Polyfork pieces, in the bridge's own frame (A at
 * the origin, z along it, y up from A's floor). Richard: "We can use Tripo or
 * Polyfork to create some bridges or to create some models to add to decorate
 * the bridges to make them look nice." The bridge itself stays drawn, because
 * it is a different length every time and a model cannot stretch; these stand
 * on it. Each is `{ id, x, y, z, ry, h }` — `h` the height to fit it to, the
 * same `size.h` the yard's things use, so a generator's scale never matters.
 * A plain bridge gets a lantern post at each end, the stone one a stone
 * lantern at each corner, the vermilion one a torii over each end, the blossom
 * one flower planters down both edges. Every piece degrades to nothing: the
 * bridge underneath is whole on its own.
 */
export function linkModels(G) {
  const st = G.style;
  const { len, rise, w } = G;
  const hw = w / 2;
  const Y = (d) => rise * Math.min(1, Math.max(0, d / len));
  const out = [];
  // a run of a turned bridge has its end pieces only at the bridge's own two ends
  const atA = G.first ?? true, atB = G.last ?? true;
  if (st.id === 'plank' || st.id === 'rope') {
    if (atA) out.push({ id: 'lantern-post-f47665', x: hw + 0.35, y: Y(0.6), z: 0.6, ry: -Math.PI / 2, h: 2.4 });
    if (atB) out.push({ id: 'lantern-post-f47665', x: -(hw + 0.35), y: Y(len - 0.6), z: len - 0.6, ry: Math.PI / 2, h: 2.4 });
  } else if (st.id === 'stone') {
    /* ON THE PARAPET, not on the deck. Richard, Oct 2026: "The stone bridge
       has some lanterns on the ground that get in the way, maybe they should
       be on the railing instead and make sure they are not going through the
       houses wall". They stood on the deck 0.5 in from each edge, 0.9 from the
       door — in her way, and half in the wall. Now each sits on the parapet's
       cap (1.26 up), a lantern's width clear of the end pillar. */
    if (len > 4.2) for (const d of [atA && LANTERN_IN, atB && len - LANTERN_IN]) if (d !== false) for (const s of [-1, 1]) out.push({ id: 'stone-lantern-d56d0a', x: s * (hw - 0.1), y: Y(d) + 1.26, z: d, ry: 0, h: 0.85, parapet: true });
  } else if (st.id === 'vermilion') {
    /* A torii is 2.6 wide for 3.19 tall: fit it to the bridge's width and it
       stands ~4 high, over the 3.1 door. TORII_IN FROM THE DOOR, three times
       what it was. Richard, Oct 2026: "the torii gates on the vermillion bridge
       are intersecting with the roofs of the building. Easy solution is to
       have them built further away from the building ... Maybe twice or 3
       times further away." At 1.2 a 4.6-tall gate stood under the eave. */
    if (len > 4) for (const d of [atA && Math.min(TORII_IN, len * 0.3), atB && len - Math.min(TORII_IN, len * 0.3)]) if (d !== false) out.push({ id: 'torii-gate-402f30', x: 0, y: Y(d), z: d, ry: 0, h: 3.19 * (w + 0.9) / 2.6 });
  } else if (st.id === 'sakura') {
    for (let d = 1; d < len - 0.6; d += 2.2) {
      for (const s of [-1, 1]) out.push({ id: 'flower-planter-500ed2', x: s * (hw - 0.45), y: Y(d), z: d, ry: Math.PI / 2, h: 0.5, stand: s });
    }
  }
  return out;
}
