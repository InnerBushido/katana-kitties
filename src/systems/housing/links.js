import * as THREE from 'three';
import { paint } from '../../core/gfx.js';
import { PALETTE } from '../../world/build.js';
import { HOUSE_BY_ID, ITEM_BY_ID, LINK_BY_ID, houseSpecs } from './catalog.js';
import { floorOf, houseFoot, houseHeight, PORT_H } from './homehouse.js';

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

/** The longest bridge: a long walk, not a road. */
export const LINK_MAX = 40;
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
/** The most turns a bridge can have (four parts). */
export const LINK_TURNS_MAX = 3;
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
  return { x: p.x, z: p.z, y: F.y + gyAt(s.x, s.z), nx: n.x, nz: n.z, spec: s, F };
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
    const t = smooth ? R * Math.tan(Math.min(theta, Math.PI * 0.9) / 2) : hw;
    // the side (as `linkParts` numbers them: +1 is (uz, -ux)) the bridge turns toward
    const inner = c > 1e-9 ? -1 : c < -1e-9 ? 1 : 0;
    return { x: v.x, z: v.z, smooth, theta, t, inner, R, pad: hw * Math.SQRT2, in: a, out: b };
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
 * A sharp turn's landing rail: its circle at radius `rad`, less the two
 * openings where the runs come in. Each run's square end spans 45° either side
 * of its axis on the landing's edge (that is what the √2 is for), so the
 * circle is sampled and every stretch outside both openings is a rail —
 * at any angle of turn, with no case for which side is inside.
 */
function padRails(T, rad) {
  const N = 48;
  const c45 = Math.SQRT1_2 - 1e-6;
  const open = [];
  for (let j = 0; j < N; j++) {
    const a = (j / N) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
    open.push(-(dx * T.in.ux + dz * T.in.uz) >= c45 || dx * T.out.ux + dz * T.out.uz >= c45);
  }
  const s0 = open.indexOf(true);
  if (s0 < 0) return [];
  const lines = [];
  let cur = null;
  for (let k = 1; k <= N; k++) {
    const j = (s0 + k) % N;
    if (open[j]) { if (cur?.length > 1) lines.push(cur); cur = null; continue; }
    const a = (j / N) * Math.PI * 2;
    (cur ??= []).push({ x: T.x + Math.sin(a) * rad, z: T.z + Math.cos(a) * rad });
  }
  if (cur?.length > 1) lines.push(cur);
  return lines;
}

/**
 * THE BRIDGE'S COLLIDERS, pure, in the island's frame with heights relative
 * to its ground: a deck per run and per turn (`homeisle.js` reads a deck's
 * `frame` as a treehouse branch's), and the rails as walls. World-check
 * walks these.
 */
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
    const lo = Math.min(r.A.y, r.B.y), hi = Math.max(r.A.y, r.B.y);
    for (const s of [-1, 1]) {
      const ox = r.uz * s * (hw - 0.05), oz = -r.ux * s * (hw - 0.05);
      walls.push({
        ax: r.A.x + ox, az: r.A.z + oz, bx: r.B.x + ox, bz: r.B.z + oz,
        y0: lo + 0.2, y1: hi + 1.3, rail: true,
      });
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

/** Is a doorway at `at` on this wall a possible place for a bridge door? */
export function portWhy(H, e, w, skipUid = null) {
  const s = specOf(H, e.hk);
  const F = s && floorOf(s.house, e.floor);
  if (!F) return 'That floor is not there.';
  const half = e.side % 2 ? F.hd : F.hw;
  if (Math.abs(e.at) > half - PORT_EDGE - w / 2 + 0.2) return 'Too close to the corner of the house.';
  if (e.side === 0 && e.floor === 0 && Math.abs(e.at) < 1.4 + w / 2 + 0.3) return 'That is the front door!';
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
  return null;
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
  // ---- supports down to the ground (no colliders), every few units
  const deep = { plank: 0x5a3e26, rope: 0x5a3e26, stone: 0x8a857c, vermilion: 0x8a2a22, sakura: 0x6a4630 }[st.id] ?? 0x5a3e26;
  for (let d = Math.min(3, len / 2); d < len - 1; d += 5) {
    const top = Y(d) - 0.3;
    const g = ground(d);
    const h = top - g;
    if (h < 0.6) continue;
    for (const s of st.id === 'stone' ? [0] : [-1, 1]) {
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

/** A level box from p to q (island frame, relative to an origin), its top at `top`. */
function chord(wd, h, p, q, top, c) {
  const l = Math.hypot(q.x - p.x, q.z - p.z);
  const g = new THREE.BoxGeometry(wd, h, l + 0.04);
  paint(g, c);
  g.rotateY(Math.atan2(q.x - p.x, q.z - p.z));
  g.translate((p.x + q.x) / 2, top - h / 2, (p.z + q.z) / 2);
  return g;
}

/**
 * One turn's parts, in the ISLAND's axes with the corner at the origin and
 * its level deck's top at y 0: the landing or the arc, its rails, and a post
 * down to `ground` (the island's height under the corner, relative to the
 * deck) if it is high enough to need one.
 */
export function turnParts(G, T, ground) {
  const st = G.style;
  const hw = G.w / 2;
  const { deckC, railC } = linkColours(st);
  const solid = [];
  const rel = (c) => c.map((p) => ({ x: p.x - T.x, z: p.z - T.z }));
  const rails = [];
  if (T.smooth) {
    const C = turnArc(T);
    const n = Math.max(4, Math.ceil(Math.abs(C.sweep) / (Math.PI / 12)));
    const mid = rel(arcCurve(T, T.R, n));
    for (let j = 0; j < n; j++) solid.push(chord(G.w, 0.3, mid[j], mid[j + 1], 0, j % 2 ? deckC : new THREE.Color(deckC).multiplyScalar(0.9).getHex()));
    rails.push(rel(arcCurve(T, T.R - hw + 0.1, n)), rel(arcCurve(T, T.R + hw - 0.1, n)));
  } else {
    const d = new THREE.CylinderGeometry(T.pad, T.pad, 0.3, 32);
    paint(d, deckC);
    d.translate(0, -0.15, 0);
    solid.push(d);
    rails.push(...padRails(T, T.pad - 0.1).map(rel));
  }
  for (const c of rails) {
    for (let j = 0; j + 1 < c.length; j++) {
      if (st.id === 'stone') {
        solid.push(chord(0.36, 1.05, c[j], c[j + 1], 1.05, railC), chord(0.46, 0.14, c[j], c[j + 1], 1.12 + 0.07, 0xb0aba3));
      } else {
        const [t, b] = st.id === 'rope' ? [0.07, 0.05] : [0.14, 0.08];
        solid.push(chord(t, t, c[j], c[j + 1], (st.id === 'rope' ? 1.05 : 1.1) + t / 2, railC), chord(b, b, c[j], c[j + 1], 0.55 + b / 2, railC));
      }
    }
    if (st.id !== 'stone') for (const p of [c[0], c[c.length - 1]]) solid.push(bx(0.22, 1.2, 0.22, st.id === 'rope' ? 0x6a4a2a : railC, p.x, 0.6, p.z));
  }
  const h = -0.3 - ground;
  if (h > 0.6) solid.push(bx(st.id === 'stone' ? G.w * 0.5 : 0.4, h, st.id === 'stone' ? G.w * 0.5 : 0.4, 0x5a3e26, 0, -0.3 - h / 2, 0));
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
    const P = linkParts(run, (d) => ground(r.A.x + r.ux * d, r.A.z + r.uz * d) - r.A.y);
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
    const P = turnParts(G, T, ground(T.x, T.z) - T.y);
    const o = into(T.x, T.z);
    solid.push(...P.solid.map((g) => { g.rotateY(-a0); g.translate(o.x, T.y - A0.y, o.z); return g; }));
  }
  return { solid, glow, models: mods };
}

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
    for (const d of [atA && 0.9, atB && len - 0.9]) if (d !== false) for (const s of [-1, 1]) out.push({ id: 'stone-lantern-d56d0a', x: s * (hw - 0.5), y: Y(d), z: d, ry: 0, h: 1.3 });
  } else if (st.id === 'vermilion') {
    // a torii is 2.6 wide for 3.19 tall: fit it to the bridge's width and it stands ~4 high, over the 3.1 door
    if (len > 4) for (const d of [atA && 1.2, atB && len - 1.2]) if (d !== false) out.push({ id: 'torii-gate-402f30', x: 0, y: Y(d), z: d, ry: 0, h: 3.19 * (w + 0.9) / 2.6 });
  } else if (st.id === 'sakura') {
    for (let d = 1; d < len - 0.6; d += 2.2) {
      for (const s of [-1, 1]) out.push({ id: 'flower-planter-500ed2', x: s * (hw - 0.45), y: Y(d), z: d, ry: Math.PI / 2, h: 0.5, stand: s });
    }
  }
  return out;
}
