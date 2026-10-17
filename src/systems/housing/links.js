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
  const dx = B.x - A.x, dz = B.z - A.z;
  const len = Math.hypot(dx, dz) || 1e-6;
  const ux = dx / len, uz = dz / len;
  const st = LINK_BY_ID[L.style] ?? LINK_BY_ID.plank;
  return { A, B, len, ux, uz, a: Math.atan2(ux, uz), w: st.w, style: st, rise: B.y - A.y };
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
  // the two doors have to look at each other, or the bridge would go through a house
  if (G.ux * G.A.nx + G.uz * G.A.nz < 0.25 || -(G.ux * G.B.nx + G.uz * G.B.nz) < 0.25) {
    return 'Those two walls face away from each other — pick walls that look at each other.';
  }
  if (G.len > LINK_MAX) return `Too far apart for one bridge — ${Math.round(G.len)} long, and ${LINK_MAX} is the most.`;
  if (G.len < LINK_MIN) return 'Those houses are too close together for a bridge.';
  if (Math.abs(G.rise) / G.len > LINK_GRADE) {
    return 'Too steep to climb — move the houses further apart, or join floors nearer in height.';
  }
  // through a third house?
  for (const s of houseSpecs(H)) {
    if (s.hk === L.a.hk || s.hk === L.b.hk) continue;
    const top = houseHeight(s.house) + gyAt(s.x, s.z);
    for (let d = 0; d <= G.len; d += 0.5) {
      const y = linkY(G, d);
      if (y > top) continue;
      for (const o of [-G.w / 2, 0, G.w / 2]) {
        const x = G.A.x + G.ux * d + G.uz * o, z = G.A.z + G.uz * d - G.ux * o;
        if (inFoot(s, x, z)) return `It would go straight through the ${HOUSE_BY_ID[s.house].short}.`;
      }
    }
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
  const deckC = { plank: PALETTE.wood, rope: 0x9a7448, stone: 0x9a958e, vermilion: 0x6a4630, sakura: 0x7a5236 }[st.id] ?? PALETTE.wood;
  const railC = { plank: PALETTE.woodDark, rope: 0xcdb27a, stone: 0x8a857c, vermilion: 0xc0302a, sakura: 0xd96a8a }[st.id] ?? PALETTE.woodDark;
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
  if (st.id === 'plank' || st.id === 'rope') {
    out.push({ id: 'lantern-post-f47665', x: hw + 0.35, y: Y(0.6), z: 0.6, ry: -Math.PI / 2, h: 2.4 });
    out.push({ id: 'lantern-post-f47665', x: -(hw + 0.35), y: Y(len - 0.6), z: len - 0.6, ry: Math.PI / 2, h: 2.4 });
  } else if (st.id === 'stone') {
    for (const d of [0.9, len - 0.9]) for (const s of [-1, 1]) out.push({ id: 'stone-lantern-d56d0a', x: s * (hw - 0.5), y: Y(d), z: d, ry: 0, h: 1.3 });
  } else if (st.id === 'vermilion') {
    // a torii is 2.6 wide for 3.19 tall: fit it to the bridge's width and it stands ~4 high, over the 3.1 door
    if (len > 4) for (const d of [1.2, len - 1.2]) out.push({ id: 'torii-gate-402f30', x: 0, y: Y(d), z: d, ry: 0, h: 3.19 * (w + 0.9) / 2.6 });
  } else if (st.id === 'sakura') {
    for (let d = 1; d < len - 0.6; d += 2.2) {
      for (const s of [-1, 1]) out.push({ id: 'flower-planter-500ed2', x: s * (hw - 0.45), y: Y(d), z: d, ry: Math.PI / 2, h: 0.5, stand: s });
    }
  }
  return out;
}
