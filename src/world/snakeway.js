import * as THREE from 'three';
import { paint, toonVertexMat, xrayVertexMat } from '../core/gfx.js';
import { PALETTE, mergeParts, valueNoise } from './build.js';

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
  /** Seconds the stick must rest at centre before the next push is read
   *  through the camera again rather than against the direction she boarded
   *  with (`Player._snakeWish`). "If player lets go of the direction keys, or
   *  if the joystick goes back to center, then it will re-orient the input
   *  based on the direction the camera is facing." Not zero: a kid holding a
   *  stick lightly dips in and out of its deadzone, and every dip re-reading
   *  the orbiting camera is the bug the lock was made to fix. Six frames is
   *  shorter than any deliberate let-go and longer than a dither. */
  rebind: 0.1,
  /** Each road starts growing this fraction of the whole build after the one
   *  before it, so they go out one after another rather than as one flash. */
  stagger: 0.12,
  /** The share of the whole build that is the home gates forming, before any
   *  road starts — what `setBridges` uses when the ending has not measured
   *  its own (a save, the scene viewer). */
  gateShare: 0.35,
  /** ...and the share at the END that is the ground round the gates — the
   *  ramps, the grass, the stones — fading in once every road has landed. */
  apronShare: 0.08,
  /** Seconds ONE home gate takes, from its cloud gathering to its cloud gone.
   *  "The torii gates should take a bit longer to spawn in ... maybe 2 or 3
   *  x's as long": it was 0.5s; the torii itself now forms over about 1.1s of
   *  this, which is 2.2 times. */
  gateEach: 1.75,
  /** Seconds from the first gate starting to the LAST one starting, nearest
   *  the camera first, spread evenly however many there are. "We can have the
   *  torii gates spawn in faster together so that they all start to be spawned
   *  in, in about 0.5s keeping the staggered spawn in, but make it more
   *  uniform". It was a fixed 0.17s between each, a second for seven — which
   *  had been asked for as "2 or 3x's as long" than 0.07, and was then too
   *  slow. Each gate still takes its own `gateEach` to form. */
  gateAll: 0.5,
  /** One gate's show, as fractions of `gateEach`: the cloud gathers, the
   *  torii forms out of it, and only once it is whole does the cloud go —
   *  "after the torii gates are done spawning into existence, then the clouds
   *  would fade out and we would be left with the torii gate". */
  gateCloud: [0, 0.16],
  gateForm: [0.11, 0.74],
  gateClear: [0.74, 1],
  /** A coin's radius. The arena's is twice it. */
  coinR: 0.9,
};

/**
 * THE ARENA ROAD, which is not like the other six.
 *
 * "For the bridge to the arena, make it wider so all 4 players can run on it
 * together (maybe twice as wide) ... Should make the snake path longer and
 * more winding for the arena so they can hear at least 25% of the song, can
 * even have it go all the way around the arena island before landing at the
 * front of it."
 *
 * So it is twice the width, and it is not wound by `windRoad`: it is laid as
 * an approach, a loop round the far side of the arena island a little above
 * its seating, and a hook back in over the front to land where the griffin
 * sets them down, walking in through the arena's own torii.
 */
export const SNAKE_ARENA = {
  halfW: 6.0,
  lock: 5.3,
  /** How far outside the arena island's rim the loop runs. The deck is 12
   *  wide, so 18 leaves six units of sky between the rail and the rock. */
  clear: 18,
  /** How high over the arena's own ground the loop tops out, so the ring is
   *  the view from the whole lap rather than a cliff face. */
  peak: 14,
};

/** What a coin is worth: five bamboo canes. "They get the equivalent of '5x
 *  bamboo cut' added to their score." The price of a cane lives with the cane
 *  (`BAMBOO_POINTS`); this is only the count. */
export const COIN_CANES = 5;

/** Which islands get a WOUND road from the home island, by biome or by kind.
 *  The arena's road is not on this list because it is not wound — see
 *  `SNAKE_ARENA`. It used to be left out altogether, as a way round Mr
 *  Satan's griffin; it is drawn and solid only while the arena is OPEN, so it
 *  is a way to a place he has already opened and never round him. */
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
export function findLanding(world, isl, toward, avoid = [], hw = SNAKE.halfW) {
  return findLandings(world, isl, toward, avoid, 1, hw)[0] ?? null;
}

/** Up to `max` landings, nearest the direct bearing first, one per bearing. */
export function findLandings(world, isl, toward, avoid = [], max = 6, hw = SNAKE.halfW) {
  const found = [];
  const base = Math.atan2(toward.z - isl.z, toward.x - isl.x);
  const offs = [0];
  /* Out to 1.4 radians either side. The autumn island's side facing home is
     taken by a dragon's perch, and its road has to come in round the flank. */
  for (let k = 1; k <= 16; k++) offs.push(k * 0.09, -k * 0.09);
  const fracs = [0.82, 0.78, 0.86, 0.74, 0.7];
  /* THE OBSTACLES NEAR THIS ISLAND, GATHERED ONCE. `blocked` used to walk
     every solid and prop in the world for every probe of every candidate —
     thirteen milliseconds a call, and it is called twice a road. Nothing more
     than the corridor's reach (60) past the rim can be in a corridor. */
  const near = obstaclesNear(world, isl.x, isl.z, isl.radius + 75, avoid);
  for (const o of offs) {
    for (const f of fracs) {
      const a = base + o;
      const out = { x: Math.cos(a), z: Math.sin(a) };
      const sx = isl.x + out.x * isl.radius * f;
      const sz = isl.z + out.z * isl.radius * f;
      const got = landingClear(world, isl, sx, sz, out, hw, avoid, near);
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
export function landingClear(world, isl, sx, sz, out, hw = SNAKE.halfW, avoid = [], near = null) {
  near ??= obstaclesNear(world, sx, sz, 80, avoid);
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
      if (blocked(near, qx, qz)) return null;
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

/**
 * Is anything standing at (x, z)?
 *
 * ONLY WHAT THE WORLD WAS BUILT WITH, and the frost road is why. "The ice
 * island doesn't have a bridge, so it is the only island missing one." Every
 * road came out in every headless build and one was missing in the game, and
 * the difference was TIME: the roads are solved at the ending, and by then 100%
 * mischief has already scattered the Powerup Kotodama over every island, each
 * reserving `keepClear` round itself (`Kotodama._spawnPickups`). One of them
 * sat on the only stretch of the frost island's rim a road can land on, no
 * landing was found, and the loop in `World.buildSnakeWay` skipped the road
 * without a word. The comment there already claimed the answer "reads nothing
 * that play changes", and it did.
 *
 * So `World` notes how long each list was when the world finished building
 * (`snakeBase`), and this reads up to there and no further. The roads are the
 * same roads in every game, whatever was lying about at the end of it, and
 * anything play put down that a road now runs over is moved off it
 * afterwards (`World.offRoads`, from `Game._clearRoads`), rather than moving
 * the road.
 */
function obstaclesNear(world, cx, cz, reach, avoid = []) {
  const base = world.snakeBase ?? {};
  const circles = [];
  const rects = [];
  const put = (x, z, r) => {
    if (Math.hypot(x - cx, z - cz) < reach + r) circles.push(x, z, r);
  };
  const solids = world.solids;
  const nS = Math.min(solids.length, base.solids ?? Infinity);
  for (let i = 0; i < nS; i++) {
    const s = solids[i];
    if (s.off || s.snake) continue;
    put(s.x, s.z, s.r + 1.2);
  }
  for (const p of world.props) {
    const h = p.home ?? p.position;
    if (h) put(h.x, h.z, 2.2);
  }
  const clear = world.keepClear;
  const nC = Math.min(clear.length, base.keepClear ?? Infinity);
  for (let i = 0; i < nC; i++) put(clear[i].x, clear[i].z, clear[i].r + 1);
  for (const c of world.clanHalls) put(c.x, c.z, c.r + 4);
  for (const m of world.landmarks) put(m.x, m.z, 2.5);
  for (const a of avoid) put(a.x, a.z, a.r ?? 9);
  for (const p of world.platforms) {
    if (p.snake || p.snakeRamp) continue;
    rects.push(p.x0 - 1.5, p.x1 + 1.5, p.z0 - 1.5, p.z1 + 1.5);
  }
  return { circles: new Float64Array(circles), rects };
}

function blocked(near, x, z) {
  const C = near.circles;
  for (let i = 0; i < C.length; i += 3) {
    const dx = x - C[i];
    const dz = z - C[i + 1];
    const r = C[i + 2];
    if (dx * dx + dz * dz < r * r) return true;
  }
  const R = near.rects;
  for (let i = 0; i < R.length; i += 4) {
    if (x > R[i] && x < R[i + 1] && z > R[i + 2] && z < R[i + 3]) return true;
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
function* windPath(A1, outA, B1, outB, dy, turns, sign) {
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
    yield;
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
  return { pts: resample(H), midFrom: m0, midTo: m1 };
}

/**
 * A horizontal polyline that already has its heights, resampled every
 * `SNAKE.step` of 3D length with a unit tangent on each sample. Shared by the
 * wound roads and the arena's, which is laid rather than wound.
 */
function resample(H) {
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
  return out;
}

/**
 * Everything wrong with a candidate road, as a list — empty means it is good.
 * The check calls this too, on the roads that were built.
 */
export function roadFaults(pts, islands, from, to, others = [], hw = SNAKE.halfW) {
  const bad = [];
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
    /* `others` may carry its own width (the arena road's is twice the rest):
       two decks touch when the centre lines are closer than both halves. */
    const ohw = o.halfW ?? SNAKE.halfW;
    for (let i = 0; i < pts.length; i += 3) {
      const p = pts[i];
      for (let j = 0; j < o.length; j += 3) {
        const q = o[j];
        if (Math.hypot(p.x - q.x, p.z - q.z) < hw + ohw + 3 && Math.abs(p.y - q.y) < 9) {
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
  const g = windRoadSteps(As, Bs, islands, others);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

/**
 * `windRoad`, a candidate at a time: it yields after every shape it tries, so
 * the ending can wind the roads a few milliseconds a frame instead of in one
 * frame half a second long. See `World.prepareSnakeWay`.
 */
export function* windRoadSteps(As, Bs, islands, others = []) {
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
          const wound = yield* windPath(A1, A.out, B1, B.out, dy, n, sign);
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
          yield;
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
/** How far past either end of a road still counts as on it. */
const END_SLOP = 0.3;

export class SnakeRoad {
  /**
   * @param {object} [opts] `{ halfW, lock }` for a road that is not the
   *        standard width — the arena's. Everything that asks how wide a road
   *        is asks the road, not `SNAKE`, so one wide road needs no special
   *        case anywhere downstream.
   */
  constructor(id, pts, from, to, islands, opts = {}) {
    this.id = id;
    this.pts = pts;
    this.from = from;
    this.to = to;
    this.islands = islands;
    this.halfW = opts.halfW ?? SNAKE.halfW;
    this.lock = opts.lock ?? SNAKE.lock;
    this.length = pts[pts.length - 1].s;
    this.cell = 6;
    this.grid = new Map();
    const hw = this.halfW + 0.6;
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
  locate(x, z, fromY = Infinity, halfW = this.halfW, step = 0.6) {
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
      const L = Math.sqrt(L2);
      /* Past either END of the road is off it — the two landings are where
         the deck stops, and ground takes over there. Everywhere else a point
         just past a joint belongs to the next segment.
         MEASURED ALONG THE ROAD, FOR EVERY SEGMENT, NOT ONLY THE LAST. It was
         "the last segment, 5% past its end", and every OTHER segment's
         capsule is `halfW` round — so the deck reached a half-width past the
         landing whatever the last segment said: 2.3 units on a wound road,
         six on the arena's, which is a flat phantom deck laid over the whole
         of its landing ramp and a half-unit drop off the end of it. */
      const sAt = a.s + (b.s - a.s) * f;
      if (sAt < -END_SLOP || sAt > this.length + END_SLOP) continue;
      f = Math.max(0, Math.min(1, f));
      const qx = a.x + dx * f;
      const qz = a.z + dz * f;
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
      /* The arena road is ground only while the arena is — `heightAt`'s
         `arena` rule, which is the island's own. A deck running on into an
         island that is not in the sky is a pier to nowhere. */
      arena: !!this.arena,
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
  const prof = profile(road.halfW ?? SNAKE.halfW);
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
  /* Each colour parsed once: `Color.set` on a hex for every one of a long
     road's thirty thousand vertices was a measurable slice of the build. */
  const rgb = new Map();
  const put = (p, F, j, colour, nx, ny, nz) => {
    const [lat, up] = prof[j];
    pos.push(p.x + F.rx * lat, p.y + up, p.z + F.rz * lat);
    nrm.push(nx, ny, nz);
    let v = rgb.get(colour);
    if (!v) { c.set(colour); v = [c.r, c.g, c.b]; rgb.set(colour, v); }
    col.push(v[0], v[1], v[2]);
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
export function toriiScale(hw = SNAKE.halfW) {
  return (hw + 1.0) / 2.2;
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
  const g = snakeCloudSteps(roads, parts);
  while (!g.next().done);
  return parts;
}

/**
 * `buildSnakeClouds` a road at a time, into `parts`. Measured in Firefox as
 * the one slice of the ending's build still long enough to drop frames —
 * 15 to 47ms for all seven roads' banks at once — so it yields between roads.
 */
export function* snakeCloudSteps(roads, parts) {
  for (let r = 0; r < roads.length; r++) {
    const road = roads[r];
    const P = road.pts.filter((p) => p.tag === 'm');
    if (P.length < 10) continue;
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
        const hwk2 = (road.halfW ?? SNAKE.halfW) / SNAKE.halfW;
        const lat = across ? (n(1) - 0.5) * 4 * hwk2 : (n(1) - 0.5) * 34 * hwk2;
        const along = (n(2) - 0.5) * (across ? 10 : 26);
        const up = across ? 0.4 + n(3) * 1.2 : -3 - n(3) * 7;
        const hwk = (road.halfW ?? SNAKE.halfW) / SNAKE.halfW;
        const rad = (across ? 4.2 + n(4) * 1.8 : 6 + n(4) * 7) * (across ? hwk : 1);
        const g = cloudPuff(rad, r * 31 + bi * 7 + j);
        g.translate(p.x + rx * lat + fx * along, p.y + up, p.z + rz * lat + fz * along);
        parts.push(g);
      }
      /* A bank at a time, not a road at a time: a road's three were the
         slowest slice left in the build (5ms alone, 20-36ms in a busy tab). */
      yield;
    }
  }
}

/* ------------------------------ the arena road ------------------------------ */

/**
 * The road to the arena: out from the home island, once round the far side of
 * the arena island, and back in over its front to the griffin's landing.
 *
 * LAID, NOT WOUND. `windRoad` solves a wave between two rims so the road is as
 * short as its climb allows; this one is asked to be LONG — "so they can hear
 * at least 25% of the song, can even have it go all the way around the arena
 * island before landing at the front of it" — and a wave long enough to play
 * a song on folds over itself. So its shape is written down: an approach, a
 * lap of the island `clear` outside its rim, and a hook out over the front that
 * turns it in to land heading for the arena's own torii. A centripetal
 * Catmull-Rom through those points is what makes it a road, and `roadFaults`
 * judges it by exactly the rules the other six are judged by.
 *
 * BOTH WAYS ROUND ARE TRIED, and the first with no fault wins, for the same
 * reason the six try both signs of their wave: which side of the island is
 * clear depends on where the other roads went.
 *
 * @param landing where the griffin sets them down (`World.arenaLanding`),
 *        which is in front of the torii, so the road lands where a kitten
 *        already expects to walk in from.
 */
export function windArenaRoad(world, home, arena, landing, avoid = [], others = []) {
  const hw = SNAKE_ARENA.halfW;
  const C = { x: arena.x, z: arena.z };
  const Rc = arena.radius + SNAKE_ARENA.clear;
  const ol = Math.hypot(landing.x - C.x, landing.z - C.z) || 1;
  const nB = { x: (landing.x - C.x) / ol, z: (landing.z - C.z) / ol };
  // The far end sits four units out from where the griffin lands.
  const B = { x: landing.x + nB.x * 4, z: landing.z + nB.z * 4, out: nB, island: arena };
  let rimD = null;
  for (let d = 0; d <= 80; d += 1) {
    if (arena.heightAt(B.x + nB.x * d, B.z + nB.z * d) == null) { rimD = d; break; }
  }
  if (rimD == null) return null;
  let top = -Infinity;
  const R = { x: -nB.z, z: nB.x };
  for (let d = 0; d <= rimD; d += 1) {
    for (const s of [-1, 0, 1]) {
      const y = arena.heightAt(B.x + nB.x * d + R.x * s * hw, B.z + nB.z * d + R.z * s * hw);
      if (y != null) top = Math.max(top, y);
    }
  }
  B.y = top + 0.45;
  B.rimD = rimD;
  const As = findLandings(world, home, landing, avoid, 6, hw);
  let best = null;
  for (const A of As) {
    for (const sign of [1, -1]) {
      const road = layArena(A, B, C, Rc, sign);
      if (!road) continue;
      for (const p of road.pts) {
        const h = horizAlong(road.pts, p);
        p.tag = h > road.midFrom + 1 && h < road.midTo - 1 ? 'm' : 'end';
      }
      const faults = roadFaults(road.pts, world.islands, home, arena, others, hw);
      const cand = { ...road, faults, A, B, sign };
      if (!faults.length) return cand;
      if (!best || faults.length < best.faults.length) best = cand;
    }
  }
  return best;
}

function layArena(A, B, C, Rc, sign) {
  const lead = SNAKE.lead;
  const A1 = { x: A.x + A.out.x * (A.rimD + lead), z: A.z + A.out.z * (A.rimD + lead) };
  const B1 = { x: B.x + B.out.x * (B.rimD + lead), z: B.z + B.out.z * (B.rimD + lead) };
  const at = (r, th) => ({ x: C.x + Math.cos(th) * r, z: C.z + Math.sin(th) * r });
  const fB = Math.atan2(B.z - C.z, B.x - C.x);
  /* The lap leaves out the sixty degrees either side of the front: that is
     where the road comes in from home and where it hooks back to land. */
  const gap = 1.05;
  const th0 = fB + sign * gap;
  const th1 = fB + sign * (Math.PI * 2 - gap);
  const tan0 = { x: -Math.sin(th0) * sign, z: Math.cos(th0) * sign };
  const L0 = at(Rc, th0);
  const ctrl = [
    { x: A.x, z: A.z },
    A1,
    // Lined up behind the lap's first point, so the approach joins it on a tangent.
    { x: L0.x - tan0.x * 40, z: L0.z - tan0.z * 40 },
  ];
  const n = Math.ceil(Math.abs(th1 - th0) / 0.16);
  for (let i = 0; i <= n; i++) ctrl.push(at(Rc, th0 + (th1 - th0) * (i / n)));
  // The hook: out past the front, and round to face in.
  ctrl.push(at(Rc + 14, fB - sign * 0.62));
  ctrl.push(at(Rc + 30, fB - sign * 0.22));
  ctrl.push({ x: B1.x + B.out.x * 22, z: B1.z + B.out.z * 22 });
  ctrl.push(B1);
  ctrl.push({ x: B.x, z: B.z });
  const curve = new THREE.CatmullRomCurve3(
    ctrl.map((p) => new THREE.Vector3(p.x, 0, p.z)), false, 'centripetal',
  );
  const H = [];
  const flat = (P, Q, tag) => {
    const L = Math.hypot(Q.x - P.x, Q.z - P.z);
    const k = Math.max(1, Math.ceil(L / 0.5));
    for (let i = 0; i < k; i++) H.push({ x: P.x + (Q.x - P.x) * (i / k), z: P.z + (Q.z - P.z) * (i / k), tag });
  };
  flat(A, A1, 'a');
  const segs = ctrl.length - 1;
  const v = new THREE.Vector3();
  // Curve segments 1 .. segs-2 run A1 -> B1; the first and last are the flats.
  for (let s = 1; s < segs - 1; s++) {
    for (let k = 0; k < 14; k++) {
      curve.getPoint((s + k / 14) / segs, v);
      H.push({ x: v.x, z: v.z, tag: 'm' });
    }
  }
  flat(B1, B, 'b');
  H.push({ x: B.x, z: B.z, tag: 'b' });
  let h = 0;
  let m0 = null;
  let m1 = null;
  for (let i = 0; i < H.length; i++) {
    if (i) h += Math.hypot(H[i].x - H[i - 1].x, H[i].z - H[i - 1].z);
    H[i].h = h;
    if (H[i].tag === 'm' && m0 == null) m0 = h;
    if (H[i].tag === 'm') m1 = h;
  }
  /* UP TO THE LAP, OVER THE TOP OF IT, AND DOWN ONTO THE FRONT. The climb takes
     the approach and the first half of the lap, so the ring comes into view
     over the rim while she is still rising towards it; the descent is the
     back half and the hook. Smootherstep both ways, which is flat at every
     joint. */
  const peakY = B.y + SNAKE_ARENA.peak;
  const hP = m0 + (m1 - m0) * 0.55;
  const ss = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * t * (t * (t * 6 - 15) + 10); };
  for (const p of H) {
    p.y = p.h <= hP
      ? A.y + (peakY - A.y) * ss((p.h - m0) / (hP - m0))
      : peakY + (B.y - peakY) * ss((p.h - hP) / (m1 - hP));
  }
  return { pts: resample(H), midFrom: m0, midTo: m1 };
}

/* ------------------------------- the landings ------------------------------- */

/**
 * The ground round each end of a road: a ramp up onto the deck, a skirt of
 * rock down each side of it, and stones and grass along the foot of that.
 *
 * "The entrance to the bridges on the islands, seems to be a bit elevated,
 * which does not look natural. Should either have a ramp to the entrance of
 * the bridge from the island, or should add some rocks/grass/environment
 * around the entrance of the bridge to cover up the elevated entrance."
 *
 * BOTH, BECAUSE THEY ARE TWO DIFFERENT GAPS. The deck is laid 0.45 over the
 * highest tuft under it (see `landingClear`), so it starts with a step up
 * that the ramp takes away. And a rim falls away under the deck by up to three
 * units before the road leaves the island, which opened a slot of sky under
 * each rail — that is what the skirt closes, and the stones along its foot
 * are what stop the skirt reading as a wall.
 *
 * The ramp is a real surface: `platform` is a deck whose height is the same
 * blend the mesh is built from, so feet stay on it. Like the roads it is ground
 * only once they are (`snakeRamp`, which `World.heightAt` gates on `snakeOpen`).
 *
 * @param end 0 for the home end, 1 for the far one.
 * @param groundAt what a foot stands on at (x, z) — the island's own terrain
 *        if nothing better is given. The world hands in one that counts the
 *        stonework ON the island too: the arena's landing is on its plaza,
 *        and a ramp run down to the grass under the plaza ended half a unit
 *        inside it.
 * @returns {{parts: THREE.BufferGeometry[], platform: object}}
 */
export function buildLandingApron(road, end, isl, groundAt = null) {
  const P = road.pts;
  const hw = road.halfW ?? SNAKE.halfW;
  const E = end ? P[P.length - 1] : P[0];
  const hl = Math.hypot(E.tx, E.tz) || 1;
  // Into the island: back along the road at the home end, on along it at the far one.
  const ix = (end ? 1 : -1) * E.tx / hl;
  const iz = (end ? 1 : -1) * E.tz / hl;
  const rx = -iz;
  const rz = ix;
  const pal = isl.palette ?? {};
  const rock = pal.rock ?? PALETTE.rock;
  const rockDark = pal.rockDark ?? PALETTE.rockDark;
  const grass = pal.grass ?? PALETTE.grass;
  const grassDark = pal.grassDark ?? PALETTE.grassDark;
  const ground = groundAt ?? ((x, z) => isl.heightAt(x, z));
  const parts = [];
  const LR = 4.5;
  const w = hw - 0.25;
  const surf = (x, z) => {
    const f = Math.max(0, Math.min(1, ((x - E.x) * ix + (z - E.z) * iz) / LR));
    const g = ground(x, z);
    return (E.y + 0.02) * (1 - f) + ((g ?? E.y - 0.45) + 0.03) * f;
  };

  // The ramp: a sheet of the deck's gold, banded like it, sloping into the grass.
  {
    const NL = 6;
    const NA = 7;
    const pos = [];
    const col = [];
    const idx = [];
    const c = new THREE.Color();
    for (let a = 0; a <= NA; a++) {
      for (let l = 0; l <= NL; l++) {
        const along = (a / NA) * LR;
        const lat = -w + (l / NL) * w * 2;
        const x = E.x + ix * along + rx * lat;
        const z = E.z + iz * along + rz * lat;
        pos.push(x, surf(x, z), z);
        c.set(Math.floor(along / (SNAKE.step * 2)) % 2 ? GOLD_B : GOLD);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let a = 0; a < NA; a++) {
      for (let l = 0; l < NL; l++) {
        const i0 = a * (NL + 1) + l;
        const i1 = i0 + 1;
        const i2 = i0 + NL + 1;
        const i3 = i2 + 1;
        idx.push(i0, i2, i1, i1, i2, i3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // Wound for the side facing up whichever way the ramp points.
    if (g.attributes.normal.getY(0) < 0) {
      const ia = g.index.array;
      for (let i = 0; i < ia.length; i += 3) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; }
      g.computeVertexNormals();
    }
    parts.push(g);
  }

  /* The skirt: from under each rail down past the grass, over the stretch of
     deck that is still over the island, and down the ramp's two sides. */
  const skirt = (pts) => {
    // pts: [{x, z, top}] along one side, outermost lateral already applied
    const pos = [];
    const col = [];
    const idx = [];
    const c = new THREE.Color();
    for (let i = 0; i < pts.length; i++) {
      const q = pts[i];
      pos.push(q.x, q.top, q.z, q.bx, q.bot, q.bz);
      c.set(rock); col.push(c.r, c.g, c.b);
      c.set(rockDark); col.push(c.r, c.g, c.b);
      if (i) {
        const v = i * 2;
        idx.push(v - 2, v - 1, v, v, v - 1, v + 1);
        idx.push(v - 2, v, v - 1, v, v + 1, v - 1);   // both faces: seen from outside either side
      }
    }
    if (pts.length < 2) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(g);
  };
  const stones = [];
  for (const side of [-1, 1]) {
    const line = [];
    // Down the ramp's side, from its far foot to the gate...
    for (let a = LR; a >= 0; a -= 0.75) {
      const x = E.x + ix * a + rx * side * w;
      const z = E.z + iz * a + rz * side * w;
      const g = ground(x, z);
      if (g == null) continue;
      line.push({ x, z, top: surf(x, z) - 0.02, bx: x + rx * side * 0.8, bz: z + rz * side * 0.8, bot: g - 0.6 });
    }
    // ...then along the deck under the rail, until the island runs out.
    const n = P.length;
    for (let k = 0; k < n; k++) {
      const q = end ? P[n - 1 - k] : P[k];
      const qh = Math.hypot(q.tx, q.tz) || 1;
      const qrx = -q.tz / qh;
      const qrz = q.tx / qh;
      const lat = side * (end ? -1 : 1) * (hw + 0.75);
      const x = q.x + qrx * lat;
      const z = q.z + qrz * lat;
      const out = side * (end ? -1 : 1);
      const bx = x + qrx * out * 0.9;
      const bz = z + qrz * out * 0.9;
      const g = ground(bx, bz) ?? ground(x, z);
      if (g == null) break;
      line.push({ x, z, top: q.y - 0.3, bx, bz, bot: g - 0.6 });
      if (k % 2 === 0) stones.push({ x: bx + qrx * out * 0.5, z: bz + qrz * out * 0.5, k });
    }
    skirt(line);
    for (let a = 0; a <= LR; a += 1.5) {
      stones.push({
        x: E.x + ix * a + rx * side * (w + 1.2),
        z: E.z + iz * a + rz * side * (w + 1.2),
        k: 100 + a * 3 + (side > 0 ? 1 : 0),
      });
    }
  }
  // The two front corners of the ramp's foot, where the step would show most.
  for (const side of [-1, 1]) {
    stones.push({
      x: E.x + ix * (LR + 0.8) + rx * side * (w + 0.4),
      z: E.z + iz * (LR + 0.8) + rz * side * (w + 0.4),
      k: 300 + side,
    });
  }
  const seed = road.id * 97 + end * 13;
  for (const s of stones) {
    const g = ground(s.x, s.z);
    if (g == null) continue;
    const n = (a) => valueNoise(seed + s.k, a, 61);
    const r = 0.55 + n(1) * 0.8;
    const st = new THREE.IcosahedronGeometry(r, 0);
    st.scale(1.3, 0.8 + n(2) * 0.4, 1.1);
    st.rotateY(n(3) * Math.PI * 2);
    paint(st, n(4) > 0.5 ? rock : rockDark);
    st.translate(s.x, g + r * 0.35, s.z);
    parts.push(st);
    // A tuft or three at the foot of every stone.
    for (let t = 0; t < 3; t++) {
      const a = n(10 + t) * Math.PI * 2;
      const d = r + 0.2 + n(20 + t) * 0.5;
      const tx = s.x + Math.cos(a) * d;
      const tz = s.z + Math.sin(a) * d;
      const tg = ground(tx, tz);
      if (tg == null) continue;
      const tuft = new THREE.ConeGeometry(0.2, 0.7 + n(30 + t) * 0.4, 4);
      paint(tuft, t % 2 ? grass : grassDark);
      tuft.translate(tx, tg + 0.3, tz);
      parts.push(tuft);
    }
  }

  // The ramp as ground: the same blend the mesh is, inside its footprint.
  const corners = [];
  for (const a of [0, LR]) for (const l of [-w, w]) {
    corners.push({ x: E.x + ix * a + rx * l, z: E.z + iz * a + rz * l });
  }
  const platform = {
    x0: Math.min(...corners.map((c) => c.x)),
    x1: Math.max(...corners.map((c) => c.x)),
    z0: Math.min(...corners.map((c) => c.z)),
    z1: Math.max(...corners.map((c) => c.z)),
    y: E.y,
    step: 0.6,
    snakeRamp: true,
    arena: !!road.arena,
    yAt: (x, z) => {
      const a = (x - E.x) * ix + (z - E.z) * iz;
      const l = (x - E.x) * rx + (z - E.z) * rz;
      if (a < 0 || a > LR || Math.abs(l) > w) return null;
      return surf(x, z);
    },
  };
  return { parts, platform };
}

/* ----------------------------- Mr Satan's road ----------------------------- */

/* HIS COLOURS, off his own sprite: a white gi, black trousers and a black
   crest of hair, a red cape and a gold championship belt, on an orange tabby. */
const SATAN_WHITE = 0xf4f1ea;
const SATAN_BLACK = 0x1c1a1e;
const SATAN_RED = 0xc8262a;
const SATAN_GOLD = 0xf2c230;
const SATAN_FUR = 0xd98a3a;
const SATAN_STRIPE = 0x9a5520;

/**
 * The arena road's gates, in Mr Satan's colours. "Can have a different colored
 * Torii that matches Mr. Satan." White posts for the gi, a black top beam for
 * his hair, the red of his cape on the tie beam, and a gold plaque in the
 * middle that is the belt buckle. Same proportions as `buildTorii`, so the two
 * read as the same kind of thing painted by somebody with opinions.
 */
export function buildSatanTorii(scale = 1) {
  const parts = [];
  const h = 6 * scale;
  const w = 4.4 * scale;
  const r = 0.34 * scale;
  const cyl = (rt, rb, hh, col, x, y, z) => {
    const g = new THREE.CylinderGeometry(rt, rb, hh, 10);
    paint(g, col);
    g.translate(x, y, z);
    return g;
  };
  const box = (bw, bh, bd, col, x, y, z) => {
    const g = new THREE.BoxGeometry(bw, bh, bd);
    paint(g, col);
    g.translate(x, y, z);
    return g;
  };
  for (const s of [-1, 1]) {
    parts.push(cyl(r * 0.85, r, h, SATAN_WHITE, s * w / 2, h / 2, 0));
    // Black cuffs at the foot, like his trousers under the gi.
    parts.push(cyl(r * 1.25, r * 1.3, h * 0.12, SATAN_BLACK, s * w / 2, h * 0.06, 0));
  }
  parts.push(box(w + 1.1 * scale, 0.42 * scale, 0.52 * scale, SATAN_RED, 0, h * 0.76, 0));
  parts.push(box(w + 2.1 * scale, 0.44 * scale, 0.72 * scale, SATAN_WHITE, 0, h + 0.2 * scale, 0));
  parts.push(box(w + 2.5 * scale, 0.3 * scale, 0.86 * scale, SATAN_BLACK, 0, h + 0.52 * scale, 0));
  // The belt buckle, where a shrine's gate hangs its name.
  parts.push(box(1.3 * scale, 1.0 * scale, 0.5 * scale, SATAN_GOLD, 0, h * 0.88, 0));
  parts.push(box(0.9 * scale, 0.62 * scale, 0.56 * scale, 0xffe07a, 0, h * 0.88, 0));
  return parts;
}

/**
 * A guardian lion on a plinth, and the lion is Mr Satan.
 *
 * "Instead of having a snake at the entrance, can have a lion statue based on
 * Mr. Satan." Shrine gates in Japan are guarded by a PAIR of lions (komainu),
 * so the arena end gets two, facing out down the road. His crest of black hair
 * is the mane, spiked the way his is; the moustache, the grin, the gold belt
 * round the middle and the red cape over the back are his. The body is his
 * orange tabby with the dark stripes. Built facing +z.
 */
export function buildSatanLion(seed = 0) {
  const parts = [];
  const n = (a) => valueNoise(seed, a, 211);
  const ball = (r, sx, sy, sz, col, x, y, z) => {
    const g = new THREE.SphereGeometry(r, 12, 9);
    g.scale(sx, sy, sz);
    paint(g, col);
    g.translate(x, y, z);
    parts.push(g);
    return g;
  };
  const box = (w, h, d, col, x, y, z, rx = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    paint(g, col);
    g.translate(x, y, z);
    parts.push(g);
  };
  // The plinth: two steps of stone with a gold band.
  box(4.2, 1.2, 4.2, PALETTE.stone ?? 0xb8b0a0, 0, 0.6, 0);
  box(3.6, 0.9, 3.6, 0xd6d0c2, 0, 1.65, 0);
  box(3.66, 0.22, 3.66, SATAN_GOLD, 0, 2.02, 0);
  const B = 2.1;
  // Sitting: haunches, chest up, forelegs straight.
  ball(1.25, 1.1, 0.8, 1.3, SATAN_FUR, 0, B + 0.9, -0.5);
  ball(1.1, 1.05, 1.25, 0.95, SATAN_FUR, 0, B + 2.0, 0.35);
  for (const s of [-1, 1]) {
    const leg = new THREE.CylinderGeometry(0.34, 0.4, 1.9, 8);
    paint(leg, SATAN_FUR);
    leg.translate(s * 0.62, B + 0.95, 1.05);
    parts.push(leg);
    ball(0.42, 1.15, 0.6, 1.3, SATAN_FUR, s * 0.62, B + 0.12, 1.25);
    // Stripes on the flanks.
    for (let k = 0; k < 3; k++) box(0.12, 0.9, 0.34, SATAN_STRIPE, s * 1.28, B + 0.7 + k * 0.05, -0.9 + k * 0.55);
  }
  // The gold belt round his middle, with its buckle.
  const belt = new THREE.TorusGeometry(1.08, 0.2, 6, 20);
  belt.rotateX(Math.PI / 2);
  belt.scale(1.02, 1, 0.9);
  paint(belt, SATAN_BLACK);
  belt.translate(0, B + 1.55, 0.3);
  parts.push(belt);
  box(0.95, 0.7, 0.3, SATAN_GOLD, 0, B + 1.55, 1.28);
  // The red cape down his back.
  box(2.1, 2.4, 0.18, SATAN_RED, 0, B + 1.7, -0.95, 0.35);
  // Head.
  const HY = B + 3.45;
  ball(0.95, 1.1, 0.95, 0.95, SATAN_FUR, 0, HY, 0.75);
  // The mane: his crest, spiked, all the way round the face and up over it.
  for (let k = 0; k < 13; k++) {
    const a = (k / 13) * Math.PI * 2;
    const spike = new THREE.ConeGeometry(0.34, 1.35 + n(k) * 0.5, 5);
    spike.translate(0, 0.6, 0);
    spike.rotateZ(-a);
    spike.translate(Math.sin(a) * 0.95, HY + Math.cos(a) * 0.95, 0.35);
    paint(spike, SATAN_BLACK);
    parts.push(spike);
  }
  // The crest itself, standing up off the top of the head.
  for (let k = -2; k <= 2; k++) {
    const spike = new THREE.ConeGeometry(0.26, 1.5 - Math.abs(k) * 0.18, 5);
    spike.rotateX(-0.35);
    spike.translate(k * 0.26, HY + 1.35, 0.55 - Math.abs(k) * 0.05);
    paint(spike, SATAN_BLACK);
    parts.push(spike);
  }
  // Muzzle, the grin, and THE moustache.
  ball(0.5, 1.2, 0.72, 0.8, 0xf0c28a, 0, HY - 0.28, 1.55);
  box(0.9, 0.14, 0.12, SATAN_WHITE, 0, HY - 0.55, 1.88);
  for (const s of [-1, 1]) {
    const m = new THREE.CylinderGeometry(0.14, 0.22, 0.95, 6);
    m.rotateZ(s * 1.05);
    paint(m, SATAN_BLACK);
    m.translate(s * 0.42, HY - 0.25, 1.9);
    parts.push(m);
    // Eyes, and the eyebrows he is always raising at somebody.
    ball(0.17, 1, 1, 0.6, SATAN_WHITE, s * 0.38, HY + 0.22, 1.58);
    ball(0.09, 1, 1, 0.6, SATAN_BLACK, s * 0.38, HY + 0.22, 1.68);
    box(0.5, 0.14, 0.14, SATAN_BLACK, s * 0.4, HY + 0.48, 1.55);
    // Ears through the mane.
    const ear = new THREE.ConeGeometry(0.3, 0.6, 4);
    paint(ear, SATAN_FUR);
    ear.translate(s * 0.72, HY + 0.95, 0.6);
    parts.push(ear);
  }
  ball(0.13, 1.2, 0.8, 0.8, 0x6a2e22, 0, HY - 0.05, 1.98);
  // A tail curled up round the plinth side, tabby-ringed.
  for (let k = 0; k < 6; k++) {
    const t = k / 5;
    ball(0.26, 1, 1, 1, k % 2 ? SATAN_STRIPE : SATAN_FUR,
      1.2 + Math.sin(t * 2.4) * 0.3, B + 0.3 + t * 1.5, -1.6 + t * 0.5);
  }
  return parts;
}

/* ---------------------------------- coins ---------------------------------- */

/**
 * The face of a coin, drawn on a canvas: gold, a raised rim, and either the
 * snake of Snake Way coiled round a pearl or Mr Satan's grinning face.
 *
 * "The coin can have a dragon or snake emblem on it. The one for the arena can
 * have a Mr. Satan emblem." Drawn, not loaded: ninth non-negotiable. With no
 * document (a headless check) it degrades to a plain gold texture rather than
 * throwing — a coin with no picture is still a coin.
 */
export function coinFace(kind = 'snake') {
  const doc = globalThis.document;
  const cv = doc?.createElement?.('canvas');
  const ctx = cv?.getContext?.('2d');
  if (!ctx) {
    const t = new THREE.DataTexture(new Uint8Array([242, 194, 64, 255]), 1, 1, THREE.RGBAFormat);
    t.needsUpdate = true;
    return t;
  }
  const S = 256;
  cv.width = S;
  cv.height = S;
  const c = S / 2;
  const g = ctx.createRadialGradient?.(c * 0.8, c * 0.7, 10, c, c, c);
  if (g?.addColorStop) {
    g.addColorStop(0, '#fff2a8');
    g.addColorStop(0.55, '#f2c230');
    g.addColorStop(1, '#b8801a');
    ctx.fillStyle = g;
  } else ctx.fillStyle = '#f2c230';
  ctx.beginPath();
  ctx.arc(c, c, c - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#a8701a';
  ctx.beginPath();
  ctx.arc(c, c, c - 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffe89a';
  ctx.beginPath();
  ctx.arc(c, c, c - 20, 0, Math.PI * 2);
  ctx.stroke();
  const ink = '#7a4a10';
  if (kind === 'satan') {
    // His face: tabby-orange, a black crest, the brows, the moustache, the grin.
    ctx.fillStyle = '#d98a3a';
    ctx.beginPath();
    ctx.arc(c, c + 10, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1c1a1e';
    ctx.beginPath();
    for (let k = 0; k <= 6; k++) {
      const x = c - 54 + k * 18;
      ctx.lineTo(x, c - 40);
      ctx.lineTo(x + 9, c - 92 - (k % 3) * 10);
    }
    ctx.lineTo(c + 62, c - 30);
    ctx.lineTo(c - 62, c - 30);
    ctx.fill();
    ctx.fillRect(c - 44, c - 14, 32, 9);
    ctx.fillRect(c + 12, c - 14, 32, 9);
    ctx.fillStyle = '#fff';
    ctx.fillRect(c - 38, c - 2, 18, 14);
    ctx.fillRect(c + 20, c - 2, 18, 14);
    ctx.fillStyle = '#1c1a1e';
    ctx.fillRect(c - 32, c + 2, 8, 9);
    ctx.fillRect(c + 26, c + 2, 8, 9);
    ctx.beginPath();
    ctx.moveTo(c, c + 26);
    ctx.bezierCurveTo(c - 30, c + 18, c - 58, c + 30, c - 64, c + 50);
    ctx.bezierCurveTo(c - 40, c + 38, c - 18, c + 42, c, c + 36);
    ctx.bezierCurveTo(c + 18, c + 42, c + 40, c + 38, c + 64, c + 50);
    ctx.bezierCurveTo(c + 58, c + 30, c + 30, c + 18, c, c + 26);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(c - 26, c + 44, 52, 12);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(c, c + 10, 62, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // The snake, coiled once round a pearl, head up, tongue out.
    ctx.strokeStyle = ink;
    ctx.lineCap = 'round';
    ctx.lineWidth = 20;
    ctx.beginPath();
    for (let k = 0; k <= 60; k++) {
      const t = k / 60;
      const a = -Math.PI * 0.5 + t * Math.PI * 3.2;
      const r = 70 - t * 34;
      const x = c + Math.cos(a) * r;
      const y = c + Math.sin(a) * r;
      if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = '#ffe07a';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse?.(c, c - 88, 20, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff6d0';
    ctx.beginPath();
    ctx.arc(c + 7, c - 92, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c8262a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(c + 18, c - 86);
    ctx.lineTo(c + 32, c - 84);
    ctx.lineTo(c + 38, c - 90);
    ctx.moveTo(c + 32, c - 84);
    ctx.lineTo(c + 38, c - 79);
    ctx.stroke();
    ctx.fillStyle = '#fff8e0';
    ctx.beginPath();
    ctx.arc(c, c, 16, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * One coin, standing on its edge so it spins about its own up: a gold rim and
 * the face on both sides.
 */
export function buildCoin(radius, face) {
  const g = new THREE.CylinderGeometry(radius, radius, radius * 0.22, 32);
  g.rotateX(Math.PI / 2);
  const rim = new THREE.MeshToonMaterial({ color: 0xe0a82a });
  const faceMat = new THREE.MeshBasicMaterial({ map: face, toneMapped: false });
  const mesh = new THREE.Mesh(g, [rim, faceMat, faceMat]);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.7, 16, 12),
    new THREE.MeshBasicMaterial({
      color: 0xffe28a, transparent: true, opacity: 0.22, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }),
  );
  const group = new THREE.Group();
  group.add(mesh);
  group.add(glow);
  return { group, mesh, glow };
}

/* ------------------------- clouds that come and go -------------------------- */

/** One puff of cloud, lit white on top and warm underneath. */
export function cloudPuff(rad, seed, squash = 0.62) {
  const g = new THREE.IcosahedronGeometry(rad, 1);
  g.scale(1.25, squash, 1.0);
  g.rotateY(valueNoise(seed, 5, 17) * Math.PI);
  const top = new THREE.Color(0xfff8ec);
  const under = new THREE.Color(0xf0d4bf);
  const pa = g.attributes.position;
  const arr = new Float32Array(pa.count * 3);
  const cc = new THREE.Color();
  for (let v = 0; v < pa.count; v++) {
    const k = Math.min(1, Math.max(0, pa.getY(v) / (rad * squash) * 0.5 + 0.5));
    cc.copy(under).lerp(top, k);
    arr[v * 3] = cc.r; arr[v * 3 + 1] = cc.g; arr[v * 3 + 2] = cc.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** How many independently faded, moved and scaled clusters one puff mesh holds. */
export const PUFF_SLOTS = 32;

/** The seconds every cloud billows by: one uniform, shared by reference into
 *  every `puffMaterial`, so the world ticks it once a frame. */
const PUFF_TIME = { value: 0 };
export function tickPuffs(t) { PUFF_TIME.value = t % 10000; }

/**
 * Glue clusters of puffs into ONE mesh, each cluster tagged with the slot that
 * drives it. `mergeParts` keeps only the attributes every mesh here shares, so
 * the slot is written here rather than taught to it.
 *
 * @param {{parts: THREE.BufferGeometry[], slot: number}[]} clusters, each built
 *        round its own origin — the slot's offset is where it goes.
 */
export function mergeSlotted(clusters) {
  const g = mergeSlottedSteps(clusters);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

/**
 * `mergeSlotted`, yielding by the VERTEX, not by the cluster — see
 * `snakeCloudSteps`. It yielded every six clusters, and one of those six was
 * every cloud bank on every road; that and the final copy were the two worst
 * slices of the whole build. `SLICE_VERTS` is about 2ms of either.
 */
const SLICE_VERTS = 12000;
export function* mergeSlottedSteps(clusters) {
  const geos = [];
  let since = 0;
  for (const c of clusters) {
    if (!c.parts.length) continue;
    const g = mergeParts(c.parts);
    geos.push({ g, slot: c.slot });
    since += g.attributes.position.count;
    if (since > SLICE_VERTS) { since = 0; yield; }
  }
  let nv = 0;
  let ni = 0;
  for (const { g } of geos) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3);
  const nrm = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 3);
  const slot = new Float32Array(nv);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0;
  let io = 0;
  for (const { g, slot: s } of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    nrm.set(g.attributes.normal.array, vo * 3);
    col.set(g.attributes.color.array, vo * 3);
    slot.fill(s, vo, vo + n);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    io += gi.length;
    vo += n;
    since += n;
    if (since > SLICE_VERTS * 3) { since = 0; yield; }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('slot', new THREE.BufferAttribute(slot, 1));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

/**
 * The material every cloud that appears, moves or thins out is drawn with:
 * Snake Way's banks, the portals the gates and the far islands come through,
 * and the puff that runs ahead of a growing road.
 *
 * SLOTS, NOT MESHES. Each cluster is faded, moved and scaled by its own entry
 * in two uniform arrays, so twenty-odd clouds doing twenty-odd different things
 * are one draw call and one program. A mesh per cloud was the obvious version
 * and it is twenty transparent draws the sorter has to order every frame.
 *
 * AND IT THINS ROUND A KITTEN. "Let's use the xray shader when player is
 * running through the clouds, shouldn't be too aggressive, so maybe 50% and
 * about as big as the player." It is the same question `xrayVertexMat` asks —
 * is this fragment between the lens and her? — and the same world-space
 * capsule. But these puffs are already transparent, so where the x-ray has to
 * `discard` through a dither, this can simply take half its alpha away: a
 * soft hole with no pattern to it. The capsule is a CONE from the lens, so the
 * hole is the size of her on screen at every distance, which is "about as big
 * as the player".
 *
 * AND IT BILLOWS, AND ITS EDGES ARE SOFT. "The clouds that are around the
 * torii gates ... does not look good, the idea was that large clouds would
 * fade in, slightly moving clouds". What was there was a squashed icosahedron
 * drawn flat — a white disc with a hard outline, standing still — and a
 * cluster of them read as a pile of plates. Now every vertex drifts on a slow
 * wave of its own (`billow` world units, `wave` per unit of distance, so a
 * forty-unit bank moves like a big thing and a four-unit puff like a small
 * one), the whole cluster breathes a little, and a puff thins to nothing
 * where it turns away from the lens, so where two overlap there is no line
 * between them. The normals it needs are the icosahedron's own, carried
 * through `mergeSlotted`.
 *
 * @param opts.billow how far a vertex drifts, in world units at scale 1
 * @param opts.wave   how many waves per world unit
 */
export function puffMaterial({ billow = 0.45, wave = 0.3 } = {}) {
  const N = PUFF_SLOTS;
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, fog: true,
  });
  const u = {
    /* ONE CLOCK FOR EVERY CLOUD, shared by reference — see `tickPuffs`. */
    uPuffTime: PUFF_TIME,
    uBillow: { value: billow },
    uWave: { value: wave },
    uSlotA: { value: Array.from({ length: N }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uSlotS: { value: new Float32Array(N).fill(1) },
    uCamPos: { value: new THREE.Vector3() },
    uCutPos: { value: Array.from({ length: 4 }, () => new THREE.Vector3()) },
    uCutOn: { value: new Float32Array(4) },
    /* 1.7 AT HER: she is 2.9 tall and stands on her feet, so a cone aimed at
       her middle that is 1.7 across at her is her, and a little round her. */
    uCutR: { value: 1.7 },
    /* HALF. The request's own number: "maybe 50%". */
    uCutK: { value: 0.5 },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float slot;
        uniform vec4 uSlotA[${N}];
        uniform float uSlotS[${N}];
        uniform float uPuffTime;
        uniform float uBillow;
        uniform float uWave;
        varying float vPuffFade;
        varying vec3 vPuffWorld;
        varying vec3 vPuffN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        int puffI = int(slot + 0.5);
        float puffS = uSlotS[puffI];
        /* The wave's phase is where the vertex sits, so neighbours move
           together and a puff rolls rather than jitters; the slot offsets it
           so two clusters never move in step. */
        vec3 puffP = transformed * uWave + vec3(slot * 1.7);
        float puffT = uPuffTime;
        vec3 puffD = vec3(
          sin(puffT * 0.55 + puffP.y * 1.3 + puffP.z * 0.7),
          sin(puffT * 0.47 + puffP.x * 1.1 + puffP.z * 0.9) * 0.6,
          cos(puffT * 0.61 + puffP.x * 0.8 + puffP.y * 1.2));
        float puffBreath = 1.0 + 0.035 * sin(puffT * 0.7 + slot * 2.3);
        transformed = (transformed + puffD * uBillow) * puffS * puffBreath + uSlotA[puffI].xyz;
        vPuffN = normalize(normal);
        vPuffFade = uSlotA[puffI].w;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vPuffWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vPuffFade;
        varying vec3 vPuffWorld;
        varying vec3 vPuffN;
        uniform vec3 uCamPos;
        uniform vec3 uCutPos[4];
        uniform float uCutOn[4];
        uniform float uCutR;
        uniform float uCutK;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float puffCut = 0.0;
        for (int i = 0; i < 4; i++) {
          if (uCutOn[i] < 0.5) continue;
          vec3 ab = uCutPos[i] - uCamPos;
          float len2 = max(dot(ab, ab), 1e-4);
          vec3 av = vPuffWorld - uCamPos;
          float t = dot(av, ab) / len2;
          if (t <= 0.0 || t >= 1.0) continue;
          float d = length(av - ab * t);
          float rad = uCutR * max(t, 0.12);
          puffCut = max(puffCut, 1.0 - smoothstep(rad * 0.55, rad, d));
        }
        /* SOFT AT THE EDGE: a puff thins to nothing where its surface turns
           away from the lens, so a cluster is one cloud, not a stack of
           outlined discs; and it is a shade warmer underneath. */
        vec3 puffV = normalize(cameraPosition - vPuffWorld);
        float puffRim = smoothstep(0.05, 0.6, abs(dot(normalize(vPuffN), puffV)));
        diffuseColor.rgb *= mix(0.9, 1.04, clamp(vPuffN.y * 0.5 + 0.5, 0.0, 1.0));
        diffuseColor.a *= vPuffFade * puffRim * (1.0 - uCutK * puffCut);
        if (diffuseColor.a < 0.004) discard;`);
  };
  mat.customProgramCacheKey = () => 'snake-puff';
  /** Aim the thinning at whoever is on screen, for the camera about to draw. */
  mat.setCuts = (camPos, points) => {
    u.uCamPos.value.copy(camPos);
    for (let i = 0; i < 4; i++) {
      const p = points?.[i];
      u.uCutOn.value[i] = p ? 1 : 0;
      if (p) u.uCutPos.value[i].copy(p);
    }
  };
  mat.slot = (i, x, y, z, fade, scale = 1) => {
    u.uSlotA.value[i].set(x, y, z, fade);
    u.uSlotS.value[i] = scale;
  };
  mat.uniformsRef = u;
  return mat;
}

/**
 * A toon material that is conjured rather than switched on: below `reveal` a
 * fragment is there, above it it is not, and the threshold is world-space
 * noise so the thing forms in patches, with a gold edge on the patches still
 * forming. The gates and the far-end statues come into the ending this way,
 * through their cloud.
 *
 * ONE PER OBJECT, SHARING A PROGRAM. A uniform on a shared material is set
 * once per material, not per mesh, so twenty gates forming at twenty different
 * moments need twenty materials; `customProgramCacheKey` keeps them one
 * compile. At `reveal` 1 the test is skipped outright, so a finished gate
 * costs nothing it did not cost before.
 */
export function dissolveMat({ xray = false } = {}) {
  /* `xray`: THE X-RAY UNDER THE DISSOLVE, for the arena road's torii and
     lions at the arena's door. "The xray shader for most of the items at the
     entrance of the arena are not being applied" — they are drawn with this,
     one material each, and so were never in any x-ray pile. The x-ray's own
     patch runs first and leaves every include it patched in place, so the
     dissolve's patch below finds the same lines either way. */
  const mat = xray ? xrayVertexMat() : toonVertexMat();
  const base = xray ? mat.onBeforeCompile : null;
  const u = { uReveal: { value: 0 } };
  mat.onBeforeCompile = (shader, renderer) => {
    base?.(shader, renderer);
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vDisWorld;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vDisWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vDisWorld;
        uniform float uReveal;
        float disHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float disNoise(vec3 p) {
          vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(disHash(i), disHash(i + vec3(1,0,0)), f.x),
                         mix(disHash(i + vec3(0,1,0)), disHash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(disHash(i + vec3(0,0,1)), disHash(i + vec3(1,0,1)), f.x),
                         mix(disHash(i + vec3(0,1,1)), disHash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        if (uReveal < 0.999) {
          float disN = disNoise(vDisWorld * 0.55) * 0.7 + disNoise(vDisWorld * 1.9) * 0.3;
          float disT = uReveal * 1.15 - 0.08;
          if (disN > disT) discard;
          float disEdge = 1.0 - smoothstep(0.0, 0.07, disT - disN);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.86, 0.45), disEdge);
        }`);
  };
  mat.customProgramCacheKey = () => (xray ? 'snake-dissolve-xray' : 'snake-dissolve');
  Object.defineProperty(mat, 'reveal', {
    get: () => u.uReveal.value,
    set: (v) => { u.uReveal.value = v; },
  });
  return mat;
}

export { mergeParts };
