import * as THREE from 'three';
import { paint } from '../core/gfx.js';
import {
  PALETTE, buildTorii, buildTree, buildHouse, mergeParts, transformParts, valueNoise,
} from './build.js';

/* ---------------------------------------------------------------------------
   SNAKE WAY — the roads that used to join the islands, and come back at the
   ending.

   "After the ending cutscene, should add some of the Dragonball Z bridges
   (Snake Way) in the background of the worlds going through the clouds, since
   that is how the islands used to be connected." And then: staircases through
   the clouds that the girls can RUN, "a smooth surface, so that while running
   up it, the player is locked to the smooth surface and can glide smoothly to
   the island."

   THE STORY ALREADY HAD THE LINE FOR IT. Patchfur's third: "The islands did
   not drift apart because something broke. They drifted because nobody was
   crossing between them any more." So the ending is the moment they are
   crossed again, and the roads grow out of the home island while the sky
   clears over the whole archipelago. See `SummonScene` (`snake` on the shot
   table) for when, and `World.setBridges` for what that does.

   WHAT IS IN HERE IS PURE GEOMETRY AND ONE QUERY. The path is worked out from
   where the islands actually are, not typed: every road leaves its island from
   a stretch of rim that is measured clear of trees, props, shrines and stars,
   winds as far out sideways as it needs to keep its slope under `SNAKE.grade`,
   and is thrown away and re-wound if it passes through any island on the way.
   `tools/world-check.mjs` asserts every one of those rules against the built
   roads, so a tenth island dropped somewhere awkward fails a check rather than
   growing a road through its own cliff.

   NOTHING HERE EXISTS BEFORE THE ENDING. The meshes are hidden, the decks are
   not ground (`World.heightAt` skips them while `snakeOpen` is false) and the
   torii posts are `off` solids — the same three locks the arena uses, for the
   same reason: a thing that is not in the sky yet must not be a floor, a wall
   or a shape.
--------------------------------------------------------------------------- */

export const SNAKE = {
  /** Walkable half-width of the deck. Six across fits four kittens and the
   *  rails, and is narrow enough to read as a road rather than a pier. */
  halfW: 3.0,
  /** How far from the centre line a kitten STANDING on it may go. The rails
   *  start at `halfW`; this keeps her body inside them. Airborne she is free,
   *  which is how jumping off works. */
  lock: 2.3,
  /** Steepest rise per unit of horizontal run anywhere on a road. 0.3 is about
   *  17 degrees — a hill, not a ladder, at a sprint. */
  grade: 0.3,
  /** Straight run past the rim before the road starts to wind, so it leaves
   *  an island like a road and never bends back under its own cliff. */
  lead: 10,
  /** Fraction of the climb eased in at each end, so it does not start and
   *  stop rising with a kink. */
  ease: 0.14,
  /** Sample spacing along the road, in world units. Also the width of one
   *  painted scale band. */
  step: 1.2,
  /** Speed on the deck, as a multiple of whatever she would run at anyway.
   *  "Glide smoothly to the island" — and a 300-unit road at a walk is a
   *  thirty-second corridor. */
  glide: 1.35,
  /** Seconds of climbing before a kitten who set off from a group gets her
   *  own pane and the ride camera. "After 2 - 3 seconds of climbing up, they
   *  get their own camera with the camera sequence." */
  splitT: 2.5,
  /** Each road starts growing this fraction of the whole build after the one
   *  before it, so they go out one after another rather than as one flash. */
  stagger: 0.12,
};

/** Which islands get a road from the home island, by biome or by kind.
 *  NOT THE ARENA: it is a place Mr Satan's griffin TAKES them (see
 *  `World._buildIslands`), and a road to it would be a way round him. */
export const SNAKE_LINKS = ['bamboo', 'dusk', 'ash', 'frost', 'dojo', 'autumn'];
/* IN THE ORDER THEY ARE LAID — see `World.buildSnakeWay` for why bamboo is
   first. */

/* The painted colours. Snake Way is a golden road on a scaled body; the gold
   is the deck and the burnt orange is the belly and the rails. */
const GOLD = 0xf4c542;
const GOLD_B = 0xe2ac34;
const RAIL = 0xd9702c;
const BELLY = 0xc9862e;
const BELLY_B = 0xa86a22;

/**
 * The cross-section, as [lateral, up] from the walking line, going round the
 * loop: over the top from left to right, down the right flank, under the
 * belly and back up the left. `deck` marks the one edge you stand on.
 *
 * THE BELLY IS WHAT MAKES IT A SNAKE AND NOT A PLANK. Seen from below — which
 * is how most of any road is seen, from an island above it — a flat ribbon is
 * a sheet of paper and a rounded body is an animal.
 */
function profile(hw) {
  return [
    [-hw - 0.55, 0.55, RAIL],
    [-hw + 0.05, 0.55, RAIL],
    [-hw + 0.25, 0.02, 'deck'],
    [hw - 0.25, 0.02, RAIL],
    [hw - 0.05, 0.55, RAIL],
    [hw + 0.55, 0.55, 'belly'],
    [hw + 0.75, -0.3, 'belly'],
    [hw * 0.75, -1.5, 'belly'],
    [0, -2.2, 'belly'],
    [-hw * 0.75, -1.5, 'belly'],
    [-hw - 0.75, -0.3, RAIL],
  ];
}

/* ------------------------------ landings ------------------------------- */

/**
 * Where a road meets an island: a stretch of rim facing `toward`, clear all
 * the way from the torii to the edge.
 *
 * SEARCHED, NOT PLACED, and the first spot it would have picked is why. The
 * straight line from the town to the frost island leaves the home island
 * through the middle of the west bamboo grove — forty props a road would have
 * been laid on top of. So it walks round the rim either side of the direct
 * bearing, nearest first, and takes the first corridor nothing is standing in.
 *
 * @returns {{x,z,y,out:{x,z},rimD:number}|null}
 */
export function findLanding(world, isl, toward, avoid = []) {
  return findLandings(world, isl, toward, avoid, 1)[0] ?? null;
}

/** Up to `max` landings, nearest the direct bearing first, one per bearing. */
export function findLandings(world, isl, toward, avoid = [], max = 6) {
  const found = [];
  const base = Math.atan2(toward.z - isl.z, toward.x - isl.x);
  const hw = SNAKE.halfW;
  const offs = [0];
  /* Out to 1.4 radians either side. The autumn island's side facing home is
     taken by a dragon's perch, and its road has to come in round the flank. */
  for (let k = 1; k <= 16; k++) offs.push(k * 0.09, -k * 0.09);
  const fracs = [0.82, 0.78, 0.86, 0.74, 0.7];
  for (const o of offs) {
    for (const f of fracs) {
      const a = base + o;
      const out = { x: Math.cos(a), z: Math.sin(a) };
      const sx = isl.x + out.x * isl.radius * f;
      const sz = isl.z + out.z * isl.radius * f;
      const got = landingClear(world, isl, sx, sz, out, hw, avoid);
      if (got) {
        /* Not two landings on the same stretch of rim: a second choice that
           is the first moved one unit along is not a choice. */
        if (!found.some((f) => Math.hypot(f.x - got.x, f.z - got.z) < 10)) found.push(got);
        break;
      }
    }
    if (found.length >= max) break;
  }
  return found;
}

/** The corridor test behind `findLanding`, exported so the check can ask it
 *  the same question about the landing that was chosen. */
export function landingClear(world, isl, sx, sz, out, hw = SNAKE.halfW, avoid = []) {
  const R = { x: -out.z, z: out.x };
  let top = -Infinity;
  let low = Infinity;
  let rimD = null;
  /* From six units BEHIND the torii — room to walk up to it — out to where
     the island ends. */
  for (let d = -6; d <= 60; d += 2) {
    const px = sx + out.x * d;
    const pz = sz + out.z * d;
    const y = isl.heightAt(px, pz);
    if (y == null) {
      if (d < 4) return null;          // the rim is too close to stand a gate on
      rimD = d;
      break;
    }
    if (d >= 0) { top = Math.max(top, y); low = Math.min(low, y); }
    /* Both sides of the deck, not just its middle: a tree two units off the
       centre line is a tree growing through the rail. */
    for (const side of [-1, 0, 1]) {
      const qx = px + R.x * side * (hw + 0.9);
      const qz = pz + R.z * side * (hw + 0.9);
      if (blocked(world, qx, qz, hw, avoid)) return null;
    }
  }
  if (rimD == null) return null;
  /* A landing on a slope is a deck with a lip at one end and a gap at the
     other. The rim falls away on every island, so some drop is expected. */
  if (top - low > 3.2) return null;
  const y = isl.heightAt(sx, sz);
  if (y == null) return null;
  /* A HAND'S HEIGHT ABOVE THE GRASS, which is the grass. The ground detail is
     scattered long before any road exists and its tufts stand 0.42 tall, so a
     deck laid flush on the ground had them growing up through the gold. 0.45
     is a kerb she steps up without noticing — platforms take a 0.6 step. */
  return { x: sx, z: sz, y: Math.max(y, top) + 0.45, out, rimD, island: isl };
}

function blocked(world, x, z, hw, avoid) {
  for (const s of world.solids) {
    if (s.off || s.snake) continue;
    if (Math.hypot(x - s.x, z - s.z) < s.r + 1.2) return true;
  }
  for (const p of world.props) {
    const h = p.home ?? p.position;
    if (h && Math.hypot(x - h.x, z - h.z) < 2.2) return true;
  }
  for (const c of world.keepClear) {
    if (Math.hypot(x - c.x, z - c.z) < c.r + 1) return true;
  }
  for (const c of world.clanHalls) {
    if (Math.hypot(x - c.x, z - c.z) < c.r + 4) return true;
  }
  for (const m of world.landmarks) {
    if (Math.hypot(x - m.x, z - m.z) < 2.5) return true;
  }
  for (const p of world.platforms) {
    if (p.snake) continue;
    if (x > p.x0 - 1.5 && x < p.x1 + 1.5 && z > p.z0 - 1.5 && z < p.z1 + 1.5) return true;
  }
  for (const a of avoid) {
    if (Math.hypot(x - a.x, z - a.z) < (a.r ?? 9)) return true;
  }
  return false;
}

/* -------------------------------- paths -------------------------------- */

const bez = (a, b, c, d, t) => {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
};

/**
 * The winding middle of a road, from A1 to B1 (both already past their rims),
 * as dense horizontal points.
 *
 * IT WINDS BY HEADING, NOT BY OFFSET, and the first version is why. That one
 * laid a sine ACROSS a base curve and solved the sine's height until the road
 * was long enough to climb. Fine on a long gap; on a short one the swing had to
 * be several times the wavelength, and an offset curve that swings that far
 * folds back through itself — measured, the frost road came out with a cusp
 * where it doubled back on the spot and a grade of 0.455, and the ash road
 * 0.815. A road written as "which way is it going at each step" and then walked
 * cannot fold: its heading swings either side of the way to the island, as far
 * as it must, and at the widest it loops round like a switchback with a real
 * radius to its turns.
 *
 * `turns` is how many times it swings each way; the size of the swing is
 * SOLVED so the road covers exactly the gap in exactly the length the climb
 * needs. What is left over sideways is spread along it with a smootherstep,
 * which moves neither end and does not change either end's heading.
 */
function windPath(A1, outA, B1, outB, dy, turns, sign) {
  const gap = Math.hypot(B1.x - A1.x, B1.z - A1.z);
  const need = Math.abs(dy) / (SNAKE.grade * (1 - SNAKE.ease)) * 1.07;
  let L = Math.max(need, gap * 1.08);
  const hA = Math.atan2(outA.z, outA.x);
  const hB = Math.atan2(-outB.z, -outB.x);
  const turn = Math.atan2(Math.sin(hB - hA), Math.cos(hB - hA));
  const N = 240;
  const sm = (t) => t * t * (3 - 2 * t);
  /* TWO SHAPES, SOLVED TOGETHER. `swing` is the snake, winding either side of
     the way to the island `turns` times. `lean` is a symmetric bow that moves
     the far end sideways. Two unknowns, two conditions (end on B1, in x and
     z), solved by Newton's method at a fixed length. Two cheaper versions came
     first: solving the swing alone and dragging the sideways miss back in with
     a correction made the ash road a 2.05-radian hairpin inside ten units, and
     bisecting the two one after the other had no bracket to work in when the
     landings faced across each other and let the frost road grow to 1011
     units. Newton from a straight start converges on every road here in a
     handful of steps; where it does not, the road is lengthened and it tries
     again. */
  /* The parts of each step's heading that do not depend on the unknowns,
     worked out once. The Newton loop below walks the road a few hundred times
     per candidate and was 90% of the build's time before this. */
  const BASE = new Float64Array(N);
  const ENV = new Float64Array(N);
  const WAVE = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const u = (i + 0.5) / N;
    ENV[i] = Math.pow(Math.sin(Math.PI * u), 1.2);
    BASE[i] = hA + turn * sm(u);
    WAVE[i] = sign * ENV[i] * Math.sin(Math.PI * 2 * turns * u);
  }
  const walk = (swing, lean, len) => {
    const ds = len / N;
    const pts = [{ x: A1.x, z: A1.z }];
    let x = A1.x;
    let z = A1.z;
    for (let i = 0; i < N; i++) {
      const h = BASE[i] + swing * WAVE[i] + lean * ENV[i];
      x += Math.cos(h) * ds;
      z += Math.sin(h) * ds;
      pts.push({ x, z });
    }
    return pts;
  };
  const miss = (swing, lean, len) => {
    const ds = len / N;
    let x = A1.x;
    let z = A1.z;
    for (let i = 0; i < N; i++) {
      const h = BASE[i] + swing * WAVE[i] + lean * ENV[i];
      x += Math.cos(h) * ds;
      z += Math.sin(h) * ds;
    }
    return [x - B1.x, z - B1.z];
  };
  let sol = null;
  for (let grow = 0; grow < 14 && !sol; grow++) {
    let sw = 0.8;
    let le = 0;
    for (let it = 0; it < 40; it++) {
      const f = miss(sw, le, L);
      const err = Math.hypot(f[0], f[1]);
      if (err < 0.05) { sol = { sw, le }; break; }
      const h = 1e-3;
      const fs = miss(sw + h, le, L);
      const fl = miss(sw, le + h, L);
      const a = (fs[0] - f[0]) / h;
      const c = (fs[1] - f[1]) / h;
      const bb = (fl[0] - f[0]) / h;
      const d = (fl[1] - f[1]) / h;
      const det = a * d - bb * c;
      if (Math.abs(det) < 1e-9) break;
      let dsw = -(d * f[0] - bb * f[1]) / det;
      let dle = -(-c * f[0] + a * f[1]) / det;
      const cap = Math.max(Math.abs(dsw), Math.abs(dle));
      if (cap > 0.3) { dsw *= 0.3 / cap; dle *= 0.3 / cap; }
      sw += dsw;
      le += dle;
      /* A SWING PAST 2.7 IS A LOOP-THE-LOOP, not a road. Out of range means
         this length cannot be wound into this gap; lengthen and start over. */
      if (Math.abs(sw) > 2.7 || Math.abs(le) > 1.6) break;
    }
    /* A NEGATIVE SWING IS THE OTHER SIGN'S ROAD; that candidate is tried on its
       own, so this one only counts if it came out the way it was asked. */
    if (sol && sol.sw < 0.15) sol = null;
    if (!sol) L *= 1.08;
  }
  if (!sol) return null;
  const pts = walk(sol.sw, sol.le, L);
  const ex = B1.x - pts[N].x;
  const ez = B1.z - pts[N].z;
  const ss = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  for (let i = 0; i <= N; i++) {
    const k = ss(i / N);
    pts[i].x += ex * k;
    pts[i].z += ez * k;
  }
  return { pts, amp: sol.sw, lean: sol.le };
}

/**
 * The whole road, landing to landing, sampled every `SNAKE.step` of 3D length.
 * Each sample: { x, y, z, s } plus the unit tangent (tx, ty, tz).
 */
function assemble(A, A1, mid, B1, B, dy) {
  // Horizontal polyline: A -> A1 (flat), the winding middle, B1 -> B (flat).
  const H = [];
  const push = (x, z, tag) => H.push({ x, z, tag });
  const flat = (P, Q, tag) => {
    const L = Math.hypot(Q.x - P.x, Q.z - P.z);
    const n = Math.max(1, Math.ceil(L / 0.5));
    for (let i = 0; i < n; i++) push(P.x + (Q.x - P.x) * (i / n), P.z + (Q.z - P.z) * (i / n), tag);
  };
  flat(A, A1, 'a');
  for (let i = 0; i < mid.length - 1; i++) push(mid[i].x, mid[i].z, 'm');
  flat(B1, B, 'b');
  push(B.x, B.z, 'b');
  // Horizontal arc length along it, and how much of that is the middle.
  let h = 0;
  let m0 = null;
  let m1 = null;
  for (let i = 0; i < H.length; i++) {
    if (i) h += Math.hypot(H[i].x - H[i - 1].x, H[i].z - H[i - 1].z);
    H[i].h = h;
    if (H[i].tag === 'm' && m0 == null) m0 = h;
    if (H[i].tag === 'm') m1 = h;
  }
  /* THE CLIMB, spread over the winding middle only. Linear through the middle
     and eased at each end over `SNAKE.ease` of it, so the slope rises from
     flat to its steady value and back — the integral of a smoothstep-shouldered
     plateau, done numerically because the samples are already here. */
  const e = SNAKE.ease;
  const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const slope = (u) => sm(u / e) * sm((1 - u) / e);
  const K = 2000;
  const cum = new Float64Array(K + 1);
  for (let i = 1; i <= K; i++) cum[i] = cum[i - 1] + slope((i - 0.5) / K);
  const ramp = (u) => {
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    const f = u * K;
    const i = Math.floor(f);
    return (cum[i] + (cum[Math.min(K, i + 1)] - cum[i]) * (f - i)) / cum[K];
  };
  const span = Math.max(1e-6, m1 - m0);
  for (const p of H) p.y = A.y + dy * ramp((p.h - m0) / span);

  // Resample by 3D length.
  const out = [];
  let s = 0;
  let next = 0;
  out.push({ x: H[0].x, y: H[0].y, z: H[0].z, s: 0 });
  for (let i = 1; i < H.length; i++) {
    const a = H[i - 1];
    const b = H[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (L <= 0) continue;
    while (next + SNAKE.step <= s + L) {
      next += SNAKE.step;
      const f = (next - s) / L;
      out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, s: next });
    }
    s += L;
  }
  const last = H[H.length - 1];
  if (s - next > 0.05) out.push({ x: last.x, y: last.y, z: last.z, s });
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 1)];
    const b = out[Math.min(out.length - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1;
    out[i].tx = (b.x - a.x) / l;
    out[i].ty = (b.y - a.y) / l;
    out[i].tz = (b.z - a.z) / l;
  }
  return { pts: out, midFrom: m0, midTo: m1 };
}

/**
 * Everything wrong with a candidate road, as a list — empty means it is good.
 * The check calls this too, on the roads that were built.
 */
export function roadFaults(pts, islands, from, to, others = []) {
  const bad = [];
  const hw = SNAKE.halfW;
  let steep = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const run = Math.hypot(b.x - a.x, b.z - a.z);
    if (run > 1e-6) steep = Math.max(steep, Math.abs(b.y - a.y) / run);
  }
  if (steep > SNAKE.grade + 0.015) bad.push(`grade ${steep.toFixed(3)}`);
  for (const p of pts) {
    if (p.tag !== 'm') continue;
    for (const L of islands) {
      const d = Math.hypot(p.x - L.x, p.z - L.z);
      /* Its own two islands may be close at the ends — the road is leaving
         them — but never back underneath them; every other island gets the
         deck's own width and some sky. */
      const own = L === from || L === to;
      const need = L.radius + (own ? 2 : hw + 8);
      if (d < need) { bad.push(`through ${L.kind ?? L.biome}`); break; }
    }
    if (bad.length > 1) break;
  }
  /* TURNS WITH A RADIUS A CAMERA CAN FOLLOW. The ride camera swings round
     her, and a bend tighter than this at a glide throws the whole picture
     round faster than the eye follows it. */
  let tight = Infinity;
  for (let i = 4; i < pts.length - 4; i += 2) {
    const a = pts[i - 4];
    const b = pts[i + 4];
    const ha = Math.atan2(a.tz, a.tx);
    const hb = Math.atan2(b.tz, b.tx);
    const d = Math.abs(Math.atan2(Math.sin(hb - ha), Math.cos(hb - ha)));
    const run = Math.hypot(b.x - a.x, b.z - a.z);
    if (d > 1e-3) tight = Math.min(tight, (8 * SNAKE.step) / d);
    void run;
  }
  if (tight < 7.5) bad.push(`bend radius ${tight.toFixed(1)}`);
  /* AND NEVER OVER ITSELF CLOSER THAN A KITTEN CAN FALL CLEAN THROUGH. A loop
     may cross its own earlier stretch in plan, as a switchback on a hill does,
     but only with nine units of sky between the two decks. */
  for (let i = 0; i < pts.length; i += 3) {
    for (let j = i + 24; j < pts.length; j += 3) {
      const p = pts[i];
      const q = pts[j];
      if (Math.hypot(p.x - q.x, p.z - q.z) < hw * 2 + 3 && Math.abs(p.y - q.y) < 9) {
        bad.push('crosses itself');
        i = pts.length;
        break;
      }
    }
  }
  for (const o of others) {
    for (let i = 0; i < pts.length; i += 3) {
      const p = pts[i];
      for (let j = 0; j < o.length; j += 3) {
        const q = o[j];
        if (Math.hypot(p.x - q.x, p.z - q.z) < hw * 2 + 3 && Math.abs(p.y - q.y) < 9) {
          bad.push('touches another road');
          i = pts.length;
          break;
        }
      }
    }
  }
  return bad;
}

/**
 * Wind a road from landing A to landing B, trying a few shapes and keeping the
 * best one that breaks no rule.
 *
 * TRIED IN ORDER OF HOW QUIET THEY ARE. One long wave first, then more waves
 * with less swing, each on both sides — so a road that CAN be a gentle S is
 * one, and only a road boxed in by its neighbours gets tighter. Scored by how
 * far it strays sideways, because the further out it swings the more likely it
 * is to be in somebody else's view of somewhere else.
 */
export function windRoad(As, Bs, islands, others = []) {
  const lead = SNAKE.lead;
  let best = null;
  const la = Array.isArray(As) ? As : [As];
  const lb = Array.isArray(Bs) ? Bs : [Bs];
  /* FIRST GOOD PAIR WINS. Landings come nearest-the-direct-bearing first, so
     the first pair that winds a road with no fault in it is the one a person
     would have drawn; scoring every pair of every landing cost over a second
     at load for no road anybody could tell apart. */
  for (const A of la) {
    for (const B of lb) {
      let pair = null;
      const A1 = { x: A.x + A.out.x * (A.rimD + lead), z: A.z + A.out.z * (A.rimD + lead) };
      const B1 = { x: B.x + B.out.x * (B.rimD + lead), z: B.z + B.out.z * (B.rimD + lead) };
      const dy = B.y - A.y;
      for (const n of [1, 1.5, 2]) {
        for (const sign of [1, -1]) {
          const wound = windPath(A1, A.out, B1, B.out, dy, n, sign);
          if (!wound) continue;
          const road = assemble(A, A1, wound.pts, B1, B, dy);
          for (const p of road.pts) {
            const h = horizAlong(road.pts, p);
            p.tag = h > road.midFrom + 1 && h < road.midTo - 1 ? 'm' : 'end';
          }
          const faults = roadFaults(road.pts, islands, A.island, B.island, others);
          /* SCORED ON HOW FAR IT STRAYS, because the further out a road swings
             the more of somebody else's view it is in, and on its length. */
          let stray = 0;
          const gx = B1.x - A1.x;
          const gz = B1.z - A1.z;
          const gl = Math.hypot(gx, gz) || 1;
          for (const p of wound.pts) {
            stray = Math.max(stray, Math.abs(((p.x - A1.x) * gz - (p.z - A1.z) * gx) / gl));
          }
          const len = road.pts[road.pts.length - 1].s;
          const score = stray + len * 0.15 + faults.length * 1000;
          if (!pair || score < pair.score) {
            pair = { ...road, amp: wound.amp, n, sign, faults, score, stray, A, B };
          }
        }
      }
      if (pair && (!best || pair.score < best.score)) best = pair;
      if (best && !best.faults.length) return best;
    }
  }
  return best;
}

// Horizontal distance along a resampled road to point p (it is one of them).
function horizAlong(pts, p) {
  if (p._h != null) return p._h;
  let h = 0;
  pts[0]._h = 0;
  for (let i = 1; i < pts.length; i++) {
    h += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    pts[i]._h = h;
  }
  return p._h;
}

/* -------------------------------- a road -------------------------------- */

/**
 * One built road: its samples, a grid to find the deck fast, and its meshes.
 *
 * `heightAt` is the hottest function in the game — every kitten, dragon,
 * critter and shadow asks it every frame — so a deck that answers by walking
 * three hundred samples would be felt. The grid is 6-unit cells, each holding
 * the few segments whose deck crosses it, and a point over empty sky finds an
 * empty cell and leaves.
 */
/** How close in height two stretches of deck are before they are one deck. */
const LAYER = 3;

export class SnakeRoad {
  constructor(id, pts, from, to, islands) {
    this.id = id;
    this.pts = pts;
    this.from = from;
    this.to = to;
    this.islands = islands;
    this.length = pts[pts.length - 1].s;
    this.cell = 6;
    this.grid = new Map();
    const hw = SNAKE.halfW + 0.6;
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    let top = -Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const ax = Math.min(a.x, b.x) - hw;
      const bx = Math.max(a.x, b.x) + hw;
      const az = Math.min(a.z, b.z) - hw;
      const bz = Math.max(a.z, b.z) + hw;
      x0 = Math.min(x0, ax); x1 = Math.max(x1, bx);
      z0 = Math.min(z0, az); z1 = Math.max(z1, bz);
      top = Math.max(top, a.y, b.y);
      for (let cx = Math.floor(ax / this.cell); cx <= Math.floor(bx / this.cell); cx++) {
        for (let cz = Math.floor(az / this.cell); cz <= Math.floor(bz / this.cell); cz++) {
          const k = `${cx},${cz}`;
          if (!this.grid.has(k)) this.grid.set(k, []);
          this.grid.get(k).push(i);
        }
      }
    }
    this.box = { x0, x1, z0, z1, top };
  }

  /**
   * The deck under (x, z), or null.
   *
   * ONE-WAY, like every platform: only a deck at or below `fromY + step`
   * counts, so a kitten under a road is under it and is not snapped up through
   * the belly. Where a road winds back over itself, the HIGHEST reachable deck
   * wins — the one she is on, not the one below.
   *
   * @returns {{y:number, s:number, lat:number, i:number, tx:number, tz:number}|null}
   *   `s` is how far along the road, `lat` is signed distance right of the
   *   centre line (right as seen walking from `from` to `to`).
   */
  locate(x, z, fromY = Infinity, halfW = SNAKE.halfW, step = 0.6) {
    const list = this.grid.get(`${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`);
    if (!list) return null;
    let best = null;
    for (const i of list) {
      const a = this.pts[i];
      const b = this.pts[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const L2 = dx * dx + dz * dz;
      if (L2 < 1e-9) continue;
      let f = ((x - a.x) * dx + (z - a.z) * dz) / L2;
      /* Past either END of the road is off it — the two landings are where
         the deck stops, and ground takes over there. Everywhere else a point
         just past a joint belongs to the next segment. */
      if ((i === 0 && f < -0.05) || (i === this.pts.length - 2 && f > 1.05)) continue;
      f = Math.max(0, Math.min(1, f));
      const qx = a.x + dx * f;
      const qz = a.z + dz * f;
      const L = Math.sqrt(L2);
      /* THE WHOLE DISTANCE TO THE SEGMENT, NOT ITS PERPENDICULAR PART. With
         the projection clamped, the perpendicular alone ignores how far PAST
         the end of the segment the point is — so a stretch of road ten steps
         further round a bend, whose line happened to run through her, claimed
         her with its own (higher) deck, and "highest wins" took it. That was
         four failures that looked like four bugs: a deck half a unit above the
         road, a rail clamp pushing her off the wrong edge, the ride dropping
         her on the way back down, and a road wider than its mesh. A capsule
         round each segment is the right shape; its sign is still the side of
         the RIGHT-hand normal (-tz, tx) of travel. */
      const px = ((x - qx) * -dz + (z - qz) * dx) / L;
      const d = Math.hypot(x - qx, z - qz);
      if (d > halfW) continue;
      const lat = px < 0 ? -d : d;
      const y = a.y + (b.y - a.y) * f;
      if (fromY + step < y) continue;
      /* THE HIGHEST DECK, THEN THE NEAREST SEGMENT ON IT. "Highest wins" on
         its own is right between two decks — where the road winds back over
         itself she is on the upper one — and wrong within one: on a climb
         the NEXT segment's start is a hair higher than where she stands and
         inside the capsule, so it won, and handed back a `lat` measured from
         a point two units ahead of her, flipping side every frame. Decks of
         the same road are never within 9 of each other (`roadFaults`), so
         anything within `LAYER` is the same deck. */
      if (!best || y > best.y + LAYER || (Math.abs(y - best.y) <= LAYER && d < best.d)) {
        best = { y, s: a.s + (b.s - a.s) * f, lat, i, tx: dx / L, tz: dz / L, d };
      }
    }
    return best;
  }

  /** The road's frame at arc length s: position and unit tangent. */
  frameAt(s) {
    const P = this.pts;
    const f = Math.max(0, Math.min(P.length - 1.0001, s / SNAKE.step));
    const i = Math.floor(f);
    const t = f - i;
    const a = P[i];
    const b = P[Math.min(P.length - 1, i + 1)];
    const tx = a.tx + (b.tx - a.tx) * t;
    const ty = a.ty + (b.ty - a.ty) * t;
    const tz = a.tz + (b.tz - a.tz) * t;
    const l = Math.hypot(tx, ty, tz) || 1;
    return {
      x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t,
      tx: tx / l, ty: ty / l, tz: tz / l,
    };
  }

  /** The platform `World.heightAt` reads. */
  platform() {
    const b = this.box;
    return {
      x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, y: b.top,
      yAt: (x, z, fromY) => this.locate(x, z, fromY)?.y ?? null,
      step: 0.6,
      snake: this,
    };
  }
}

/* -------------------------------- meshes -------------------------------- */

/**
 * The road's body, swept along its samples, with the index buffer in order
 * from the home end — so `drawRange` over a prefix of it IS the road having
 * grown that far. That is the whole construction effect, and it costs nothing
 * once it is finished.
 */
export function buildRoadMesh(road) {
  const P = road.pts;
  const prof = profile(SNAKE.halfW);
  const E = prof.length;
  const pos = [];
  const nrm = [];
  const col = [];
  const idx = [];
  const c = new THREE.Color();
  const frame = (p) => {
    // Right = horizontal normal of travel; up = world up. The deck stays LEVEL
    // across its width at every slope, so a kitten standing on it is upright.
    const hl = Math.hypot(p.tx, p.tz) || 1;
    return { rx: -p.tz / hl, rz: p.tx / hl };
  };
  const put = (p, F, j, colour, nx, ny, nz) => {
    const [lat, up] = prof[j];
    pos.push(p.x + F.rx * lat, p.y + up, p.z + F.rz * lat);
    nrm.push(nx, ny, nz);
    c.set(colour);
    col.push(c.r, c.g, c.b);
  };
  const perSeg = E * 6;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i];
    const b = P[i + 1];
    const Fa = frame(a);
    const Fb = frame(b);
    const band = Math.floor(a.s / (SNAKE.step * 2)) % 2;
    for (let j = 0; j < E; j++) {
      const k = (j + 1) % E;
      const kind = prof[j][2];
      const colour = kind === 'deck' ? (band ? GOLD_B : GOLD)
        : kind === 'belly' ? (band ? BELLY_B : BELLY) : RAIL;
      // Outward normal of this profile edge: edge direction x tangent.
      const ex = (prof[k][0] - prof[j][0]);
      const ey = (prof[k][1] - prof[j][1]);
      const nFor = (F, p) => {
        // edge in world = R*ex + U*ey ; N = E x T
        const Ex = F.rx * ex;
        const Ey = ey;
        const Ez = F.rz * ex;
        let nx = Ey * p.tz - Ez * p.ty;
        let ny = Ez * p.tx - Ex * p.tz;
        let nz = Ex * p.ty - Ey * p.tx;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
        return [nx, ny, nz];
      };
      const na = nFor(Fa, a);
      const nb = nFor(Fb, b);
      const v0 = pos.length / 3;
      put(a, Fa, j, colour, ...na);
      put(a, Fa, k, colour, ...na);
      put(b, Fb, k, colour, ...nb);
      put(b, Fb, j, colour, ...nb);
      idx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
    }
  }
  /* The two ends are capped, or the far end of every road is a hole you can
     see into the snake through. */
  for (const [end, sgn] of [[0, -1], [P.length - 1, 1]]) {
    const p = P[end];
    const F = frame(p);
    const v0 = pos.length / 3;
    const h = Math.hypot(p.tx, p.tz) || 1;
    for (let j = 0; j < E; j++) {
      const [lat, up] = prof[j];
      pos.push(p.x + F.rx * lat, p.y + up, p.z + F.rz * lat);
      nrm.push((p.tx / h) * sgn, 0, (p.tz / h) * sgn);
      c.set(BELLY_B);
      col.push(c.r, c.g, c.b);
    }
    for (let j = 1; j < E - 1; j++) {
      if (sgn > 0) idx.push(v0, v0 + j, v0 + j + 1);
      else idx.push(v0, v0 + j + 1, v0 + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return { geometry: g, perSeg, segs: P.length - 1, caps: idx.length - perSeg * (P.length - 1) };
}

/**
 * The snake's head, at the far end, reared up beside the landing and looking
 * back down its own road — which is where Snake Way's head is: at the end you
 * are running TO.
 */
export function buildSnakeHead(seed = 0) {
  const parts = [];
  const ball = (r, w, h, d, colour, x, y, z) => {
    const g = new THREE.SphereGeometry(r, 12, 9);
    g.scale(w, h, d);
    paint(g, colour);
    g.translate(x, y, z);
    parts.push(g);
  };
  // A coil on the ground, then the neck rising out of it.
  const coil = new THREE.TorusGeometry(2.4, 1.0, 8, 18);
  coil.rotateX(Math.PI / 2);
  paint(coil, BELLY);
  coil.translate(0, 1.0, 0);
  parts.push(coil);
  const neck = new THREE.CylinderGeometry(0.95, 1.2, 6.4, 12);
  paint(neck, GOLD);
  neck.rotateX(-0.28);
  neck.translate(0, 4.2, 0.6);
  parts.push(neck);
  // The head: long, flat-topped, snout forward (+z).
  ball(1.6, 1.15, 0.8, 1.55, GOLD, 0, 7.6, 1.9);
  ball(1.0, 1.05, 0.62, 1.3, GOLD_B, 0, 7.25, 3.6);
  // Jaw, open a little.
  ball(0.95, 1.0, 0.35, 1.4, BELLY, 0, 6.6, 3.1);
  // Eyes, ridged over.
  for (const s of [-1, 1]) {
    ball(0.42, 1, 1, 1, 0xfff6e0, s * 0.95, 8.25, 2.6);
    ball(0.22, 1, 1.3, 1, 0x1a1210, s * 1.08, 8.28, 2.85);
    const brow = new THREE.ConeGeometry(0.34, 1.5, 6);
    paint(brow, RAIL);
    brow.rotateX(-1.1);
    brow.translate(s * 0.9, 8.9, 1.2);
    parts.push(brow);
  }
  // Forked tongue.
  for (const s of [-1, 1]) {
    const t = new THREE.BoxGeometry(0.14, 0.08, 1.1);
    paint(t, 0xd43a3a);
    t.rotateY(s * 0.25);
    t.translate(s * 0.14, 6.75, 4.7);
    parts.push(t);
  }
  void seed;
  return parts;
}

/** The two gates at a road's ends, scaled so the posts stand outside the
 *  rails. `buildTorii` is 4.4 between posts at scale 1. */
export function toriiScale() {
  return (SNAKE.halfW + 1.0) / 2.2;
}

/* -------------------------------- clouds -------------------------------- */

/**
 * The cloud banks the roads run through.
 *
 * "It would be cool to have the clouds between the islands as well and then
 * having staircases going through the clouds." Banks sit on each road's middle
 * and the deck goes straight through them — some puffs below and beside it,
 * a couple right across it, so a kitten running the road goes in and comes
 * out the other side. Puffs rather than the flat shelves the ending's ring
 * uses (`World._buildClouds`), because these are seen from INSIDE and a flat
 * plate seen edge-on is a line.
 */
export function buildSnakeClouds(roads) {
  const parts = [];
  roads.forEach((road, r) => {
    const P = road.pts.filter((p) => p.tag === 'm');
    if (P.length < 10) return;
    for (const [bi, u] of [0.3, 0.52, 0.74].entries()) {
      const p = P[Math.floor(u * (P.length - 1))];
      const hl = Math.hypot(p.tx, p.tz) || 1;
      const rx = -p.tz / hl;
      const rz = p.tx / hl;
      const fx = p.tx / hl;
      const fz = p.tz / hl;
      const puffs = 9;
      for (let j = 0; j < puffs; j++) {
        const n = (a) => valueNoise(r * 31 + bi * 7 + j, a, 17);
        /* The first three straddle the deck — those are the ones she runs
           through. The rest spread out beside and below it into a bank. */
        const across = j < 3;
        const lat = across ? (n(1) - 0.5) * 4 : (n(1) - 0.5) * 34;
        const along = (n(2) - 0.5) * (across ? 10 : 26);
        const up = across ? 0.4 + n(3) * 1.2 : -3 - n(3) * 7;
        const rad = across ? 4.2 + n(4) * 1.8 : 6 + n(4) * 7;
        const g = new THREE.IcosahedronGeometry(rad, 1);
        g.scale(1.25, 0.62, 1.0);
        g.rotateY(n(5) * Math.PI);
        const top = new THREE.Color(0xfff8ec);
        const under = new THREE.Color(0xf0d4bf);
        const pa = g.attributes.position;
        const arr = new Float32Array(pa.count * 3);
        const cc = new THREE.Color();
        for (let v = 0; v < pa.count; v++) {
          const k = Math.min(1, Math.max(0, pa.getY(v) / (rad * 0.62) * 0.5 + 0.5));
          cc.copy(under).lerp(top, k);
          arr[v * 3] = cc.r; arr[v * 3 + 1] = cc.g; arr[v * 3 + 2] = cc.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        g.translate(p.x + rx * lat + fx * along, p.y + up, p.z + rz * lat + fz * along);
        parts.push(g);
      }
    }
  });
  return parts;
}

/* ------------------------------ far islands ------------------------------ */

/** Streaks for the waterfalls, as a DataTexture so it builds without a DOM. */
export function waterTexture() {
  const W = 16;
  const H = 64;
  const data = new Uint8Array(W * H * 4);
  for (let x = 0; x < W; x++) {
    const col = valueNoise(x, 3, 77);
    for (let y = 0; y < H; y++) {
      const streak = valueNoise(x * 3.1, y * 0.35, 91);
      const b = 0.55 + 0.45 * Math.max(0, Math.min(1, streak * 1.8 + col * 0.5 - 0.2));
      const i = (y * W + x) * 4;
      data[i] = Math.round(170 + 85 * b);
      data[i + 1] = Math.round(210 + 45 * b);
      data[i + 2] = 255;
      data[i + 3] = Math.round(150 + 100 * b);
    }
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/**
 * New worlds on the horizon, with waterfalls — the reference frame
 * (`out/trailer/shots/s01.png`) is floating islands with pagodas, torii,
 * cherry trees and water pouring off their rims into the clouds.
 *
 * "Can also add new worlds and islands in the distance with the waterfalls to
 * bring some interesting elements to the backgrounds... mainly to build
 * excitement and make the world look cool." They are backdrop and nothing
 * else: never collided with, never ground, and far enough out (430+) that no
 * dragon flight in the game reaches them. They RISE OUT OF THE CLOUDS with the
 * dawn — see `World.setSky` — so the ending's wide shot has them coming up.
 *
 * @param avoid {x, z, r}[] places they must keep away from — the arena, whose
 *              ring of backdrop is already cleared (see `_buildDistantScenery`)
 */
export function buildFarIsles(avoid = []) {
  const land = [];
  const falls = [];
  const isles = [];
  const COUNT = 7;
  for (let i = 0; i < COUNT; i++) {
    const n = (a) => valueNoise(i, a, 131);
    const ang = (i / COUNT) * Math.PI * 2 + 0.35 + (n(1) - 0.5) * 0.5;
    const dist = 440 + n(2) * 200;
    const x = Math.cos(ang) * dist;
    const z = Math.sin(ang) * dist;
    if (avoid.some((a) => Math.hypot(x - a.x, z - a.z) < a.r)) continue;
    const y = 30 + n(3) * 110;
    const r = 26 + n(4) * 20;
    isles.push({ x, y, z, r });

    // Grass top, a lip of rock, and a long keel of stone beneath.
    const top = new THREE.CylinderGeometry(r, r * 0.94, 4, 18);
    paint(top, PALETTE.grass);
    top.translate(x, y - 2, z);
    land.push(top);
    const keel = new THREE.ConeGeometry(r * 0.94, r * 2.1, 12);
    keel.rotateX(Math.PI);
    const pa = keel.attributes.position;
    const arr = new Float32Array(pa.count * 3);
    const cc = new THREE.Color();
    for (let v = 0; v < pa.count; v++) {
      const k = pa.getY(v) / (r * 2.1) + 0.5;
      cc.set(PALETTE.rockDark).lerp(new THREE.Color(PALETTE.rock), k);
      arr[v * 3] = cc.r; arr[v * 3 + 1] = cc.g; arr[v * 3 + 2] = cc.b;
    }
    keel.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    keel.translate(x, y - 4 - r * 1.05, z);
    land.push(keel);

    // A pagoda on every other one, a house on the rest — facing the middle.
    const face = Math.atan2(-x, -z);
    const tall = i % 2 === 0;
    const house = buildHouse({
      w: 7, d: 6, floors: tall ? 3 : 2,
      tile: tall ? PALETTE.tileRed : PALETTE.tileIndigo,
    });
    land.push(...transformParts(house, x + Math.sin(face) * -r * 0.2, y, z + Math.cos(face) * -r * 0.2,
      face, 2.4));
    // A torii on the near rim, and cherry trees round it.
    land.push(...transformParts(buildTorii(1), x + Math.sin(face) * r * 0.62, y,
      z + Math.cos(face) * r * 0.62, face + Math.PI / 2, 2.2));
    for (let t = 0; t < 4; t++) {
      const ta = face + 1.2 + t * 1.3 + n(10 + t) * 0.6;
      const td = r * (0.45 + n(20 + t) * 0.35);
      land.push(...transformParts(buildTree(i * 7 + t, 1, 'blossom'),
        x + Math.sin(ta) * td, y, z + Math.cos(ta) * td, n(30 + t) * 6, 2.3));
    }

    /* The waterfall: a ribbon off the rim, down past the keel into the
       clouds, on the side facing the archipelago so it is the side you see.
       A stream across the grass leads to it. */
    const fa = face + (n(40) - 0.5) * 0.9;
    const fx = x + Math.sin(fa) * (r + 0.4);
    const fz = z + Math.cos(fa) * (r + 0.4);
    const drop = 110 + n(41) * 70;
    const wide = 5 + n(42) * 4;
    const sheet = new THREE.PlaneGeometry(wide, drop, 1, 12);
    // Bow it outward as it falls, the way water leaves an edge.
    const sp = sheet.attributes.position;
    for (let v = 0; v < sp.count; v++) {
      const fall = (drop / 2 - sp.getY(v)) / drop;
      sp.setZ(v, fall * fall * 16 + fall * 3);
    }
    sheet.computeVertexNormals();
    const uv = sheet.attributes.uv;
    for (let v = 0; v < uv.count; v++) uv.setXY(v, uv.getX(v) * 1.2, uv.getY(v) * drop / 22);
    sheet.rotateY(fa);
    sheet.translate(fx, y - drop / 2 - 0.5, fz);
    falls.push(sheet);
    const stream = new THREE.BoxGeometry(wide * 0.8, 0.3, r * 0.7);
    paint(stream, 0x7fc7e8);
    stream.translate(0, 0.1, r * 0.65);
    stream.rotateY(fa);
    stream.translate(x, y, z);
    land.push(stream);
  }
  return { land, falls, isles };
}

export { mergeParts };
