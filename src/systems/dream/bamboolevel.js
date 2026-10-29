/* ---------------------------------------------------------------------------
   忍 BAMBOO INFILTRATION'S NUMBERS — every course as data, and the few pure
   functions that turn the data into a place: what she can walk on, what the
   forest fences off, who is standing where at time t, and whether a guard at
   one point can see a kitten at another. NOTHING HERE DRAWS. bamboo.js lays
   the drawing on it; world-check and tools/bamboo-map.mjs read it without a
   scene, which is the point: the sight a guard has in the game, the cone
   drawn on the floor and the check that proves a course can be crossed all
   ask `canSee`, so none of the three can disagree with the others.

   THE ISLAND'S FRAME is (a, b): `a` from the bridge across the island, `b` to
   its right (kiosk.js `isleSpot`). Angles are measured from +a toward +b, so
   a look of θ points along (cos θ, sin θ).

   A COURSE IS:
     paths      corridors, [[a, b], ...] polylines `w` wide
     rects      open ground, { a0, a1, b0, b1 }
     rings      open ground round a centre, { a, b, r0, r1 } — a disc if r0 is 0
     houses     a room you can walk into: walls `h` high with doors, a roof at
                `h` you can stand on, and (if it has one) a ladder
     towers     a post with a floor on top — where an archer stands
     trails     corridors like `paths`, walked THROUGH bamboo: open ground with
                canes standing in it, off its middle (`trailCanes`), that hide
                her from a samurai the way the forest does. The way to a place
                that is meant to be found — "it should not look like a bug"
     decks      floating floors, { a, b, r, y }
     ropes      { from: [a, b], to: [a, b] } — she hangs under them; each end
                tied ROPE_RISE over the roof under it (`ropeEnds`)
     clumps / thickets / barrels / crates   cover, of different heights
     lanterns   checkpoints, each listing the difficulties it is lit on
     pickups    shuriken and smoke bombs, likewise
     guards     samurai and archers, each with a patrol and a `minDiff`
   and the forest is EVERYTHING ELSE inside the course's rim: `fenceOf`
   plants a wall of canes along every edge of the walkable ground, so a
   corridor is a corridor because the bamboo says so and a course cannot have
   a hole in its side that nobody drew.

   NOTHING HERE HURTS ANYBODY (non-negotiable 3). Seen is CAUGHT: she is
   walked back to her last lantern and the clock keeps running.
--------------------------------------------------------------------------- */

/** The raster everything is measured on, in island units. */
export const GRID = 0.5;
/** The course's corner of the island: behind a < A0 is the plaza. */
export const REGION = { a0: -19.5, a1: 28, b0: -28, b1: 28, r: 27.8 };
/** No walkable ground further out than this, so the fence always fits inside the rim. */
export const WALK_R = 25.6;
/** The gate from the plaza into the course, and where a run starts. */
export const GATE = { a: -19, b: 0, w: 3.2 };
export const START = { a: -16.5, b: 0 };
/** The plaza: kiosk, board, its filter kiosk, where a kitten is let out. */
export const PLAZA = {
  kiosk: { a: -24, b: 6.5 },
  board: { a: -23.5, b: -10, lift: 4.4 },
  boardKiosk: { a: -21.6, b: -13.6 },
  out: [{ a: -23, b: 2 }, { a: -23, b: -2 }, { a: -25.5, b: 3 }, { a: -25.5, b: -3 }],
};

/** Heights a kitten's eyes and a guard's are at, above the floor they stand on. */
export const EYE = { guard: 2.3, stand: 1.6, crawl: 0.5 };
/** Cover heights: anything lower than the sight line where it crosses does not block.
 *  A `crate` is a STACK now — boxes, firewood or rice bales, drawn by bamboo.js
 *  `_stack` — and stands taller than the one box it replaced: Richard, "replace
 *  with something more interesting that looks like an obstacle". */
export const COVER = { clump: 6, barrel: 1.35, crate: 1.6, thicket: 1.0, smoke: 4.5, forest: 99 };
export const RADII = { clump: 0.9, barrel: 0.6, crate: 0.8, thicket: 1.6, smoke: 3.5 };
/**
 * THE KITTEN'S SIZE, as the course is measured against it. `Player.radius` is
 * PLAYER_RADIUS (0.75) for every kitten at every screen size — the collider
 * never scales with the pane. Copied, not imported: this file is read by
 * tools that load no scene, and world-check holds the two equal.
 */
export const KITTEN_R = 0.75;
/**
 * A DOOR IS THIS WIDE AT LEAST. A wall is posts r 0.3 every 0.45 INCLUDING
 * one on each edge of the opening, so a 1.8 door had 1.2 of clear width for a
 * kitten 1.5 across — Richard, Oct 2026: "the doors are very tight and may
 * need to be bigger in general". Nobody fitted; the ones who got through were
 * squeezed through by the order the posts pushed in. 2.8 leaves 0.35 a side.
 */
export const DOOR_MIN = 2.8;
/**
 * THE FENCE: a cane post every 0.7 on forest ground within `near` of the
 * walkable, solid to `top` — under the 5.2 roofs, so a rope between two of
 * them is not stopped by the canes it crosses ("the collider there needs to be
 * lower on the bamboo area") — and drawn `thick` deep in a denser band, so the
 * edge of a course reads as a wall. The wall that HOLDS is `walkAt`: bamboo.js
 * puts a kitten back on the last walkable ground she stood over, so no post
 * spacing, barrel or jump can let her out.
 */
export const FENCE = { near: 1.25, step: 0.7, r: 0.35, top: 5.0, thick: 2.6 };
/** A trail's canes: `r` each, none nearer than `lane` to its middle. */
export const TRAIL = { lane: 1.15, r: 0.18 };
/** A tower's post, as a sight line and a shot meet it (bamboo.js draws it 0.45–0.6). */
export const TOWER_POST = 0.6;
/** A samurai does not look up: a kitten more than this above his floor is not seen by him. */
export const SAMURAI_UP = 3.2;
/** An archer on a tower looks down as far as he likes, and up this far. */
export const ARCHER_UP = 7;

/**
 * THE THREE DIFFICULTIES. Richard: "We can add the checkpoints where useful,
 * depends on the level design and difficulty ... more checkpoints on easier
 * difficulty and less on harder". Everything a guard is measured by is here,
 * so a course is one layout at three strengths rather than three layouts:
 *   range/half    the cone (units, radians either side)
 *   seeT          seconds in his cone before he has her (a meter, not a coin)
 *   walk/run      his patrol pace and his sprint to an arrest
 *   noise         how far a step is heard — walking, sprinting, a landing
 *   pebble        how far a thrown pebble's clatter carries
 *   ko            how long a shuriken puts him down for
 *   arrow         an archer's seconds between shots, and how wide they go
 *   throws        whether a samurai who half-sees her throws a shuriken
 */
export const DIFFS = [
  { key: 'e', name: 'EASY', range: 8, half: 0.42, seeT: 0.75, walk: 2.8, run: 7, noise: { walk: 3.2, run: 7.5, land: 4 }, pebble: 8.5, ko: 25, arrow: { cd: 2.0, spread: 0.16 }, throws: false, archer: { range: 1.4, half: 1.55 } },
  { key: 'n', name: 'NORMAL', range: 10, half: 0.48, seeT: 0.4, walk: 3.3, run: 8, noise: { walk: 4.6, run: 9.5, land: 5.5 }, pebble: 8, ko: 18, arrow: { cd: 1.45, spread: 0.11 }, throws: true, archer: { range: 1.45, half: 1.6 } },
  { key: 'h', name: 'HARD', range: 12, half: 0.55, seeT: 0.18, walk: 3.8, run: 9, noise: { walk: 6, run: 12, land: 7 }, pebble: 7.5, ko: 12, arrow: { cd: 1.0, spread: 0.07 }, throws: true, archer: { range: 1.5, half: 1.65 } },
];

/** Her crawl, as a fraction of her walk (`Player.gaitK`). WALK_SPEED is 10.5. */
export const SNEAK = { gait: 0.4, speed: 10.5 * 0.4 };
/**
 * HER SPRINT IN HERE: 1.2x her walk, not the game's 17 (1.6x). Richard: "make
 * them run slightly faster, like 1.15x's faster to have some benefit but not
 * break the course" — and, Oct 2026, "1.2x" once it had been played. As a gait over SPRINT_SPEED, so `Player` knows nothing
 * of it; world-check holds player.js's 10.5 and 17 to these. And a samurai's
 * meter fills `meterK` times as fast on a kitten who is sprinting — "their
 * 'arrest' time is half the amount of time".
 */
export const SPRINT = { k: 1.2, walk: 10.5, run: 17, gait: (10.5 * 1.2) / 17, meterK: 2 };
/** Seconds added to a run's time per capture — the score is the time. */
export const CAUGHT_COST = 15;

const deg = (d) => (d * Math.PI) / 180;
const NONE = [];
export const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));

/* ------------------------------- geometry ------------------------------- */

export function segDist(px, pz, ax, az, bx, bz) {
  const ex = bx - ax; const ez = bz - az;
  const L2 = ex * ex + ez * ez || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / L2));
  return Math.hypot(px - (ax + ex * t), pz - (az + ez * t));
}

function polyDist(pts, a, b) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(a, b, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  return d;
}

/** Where two segments cross, as the parameter along the first, or -1. */
function crossT(ax, az, bx, bz, cx, cz, dx, dz) {
  const rx = bx - ax; const rz = bz - az;
  const sx = dx - cx; const sz = dz - cz;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return -1;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den;
  const u = ((cx - ax) * rz - (cz - az) * rx) / den;
  return t > 0 && t < 1 && u >= 0 && u <= 1 ? t : -1;
}

/** A house's four walls as segments, each split round its doors. */
export function houseWalls(H) {
  const { a0, a1, b0, b1 } = H;
  // Sides, each from one corner to the next: s = 'a0' runs along b at a = a0.
  const sides = {
    a0: [[a0, b0], [a0, b1]], a1: [[a1, b0], [a1, b1]],
    b0: [[a0, b0], [a1, b0]], b1: [[a0, b1], [a1, b1]],
  };
  const out = [];
  for (const [k, [p, q]] of Object.entries(sides)) {
    const along = k[0] === 'a' ? 1 : 0;          // which coordinate runs along the side
    const lo = p[along]; const hi = q[along];
    const gaps = (H.doors ?? []).filter((d) => d.side === k).map((d) => [d.at - doorW(d) / 2, d.at + doorW(d) / 2]).sort((x, y) => x[0] - y[0]);
    let from = lo;
    for (const [g0, g1] of [...gaps, [hi, hi]]) {
      if (g0 > from + 0.05) {
        const s = [...p]; const e = [...p];
        s[along] = from; e[along] = Math.min(g0, hi);
        out.push({ a0: s[0], b0: s[1], a1: e[0], b1: e[1], top: H.h, house: H });
      }
      from = Math.max(from, g1);
    }
  }
  return out;
}

/** A door's width: what the course says, never under DOOR_MIN. */
export const doorW = (d) => Math.max(d.w ?? DOOR_MIN, DOOR_MIN);

/** The middle of a door's opening, and the unit normal OUT of the house. */
export function doorMouth(H, d) {
  if (d.side === 'a0') return { a: H.a0, b: d.at, na: -1, nb: 0 };
  if (d.side === 'a1') return { a: H.a1, b: d.at, na: 1, nb: 0 };
  if (d.side === 'b0') return { a: d.at, b: H.b0, na: 0, nb: -1 };
  return { a: d.at, b: H.b1, na: 0, nb: 1 };
}

/** Where a house's ladder stands: outside the wall it names, at `at` along it,
 *  with `face` the bearing from its foot into the wall (she climbs facing it). */
export function ladderFoot(H) {
  const s = H.ladder.side; const at = H.ladder.at;
  if (s === 'a0') return { a: H.a0 - 0.55, b: at, face: 0 };
  if (s === 'a1') return { a: H.a1 + 0.55, b: at, face: Math.PI };
  if (s === 'b0') return { a: at, b: H.b0 - 0.55, face: Math.PI / 2 };
  return { a: at, b: H.b1 + 0.55, face: -Math.PI / 2 };
}

/** Is (a, b) inside a house's footprint? */
export const inHouse = (H, a, b) => a > H.a0 && a < H.a1 && b > H.b0 && b < H.b1;

/* ------------------------------- the level ------------------------------- */

const _levels = new Map();

/**
 * THE PLACE, built once per course: the walkable raster, the forest, the
 * fence posts along it, every wall, and the cover — the same for every
 * difficulty (only who is out, and what they see, changes with it).
 */
export function levelOf(C) {
  if (_levels.has(C.id)) return _levels.get(C.id);
  const R = REGION;
  const nA = Math.ceil((R.a1 - R.a0) / GRID);
  const nB = Math.ceil((R.b1 - R.b0) / GRID);
  const walk = new Uint8Array(nA * nB);
  const ca = (i) => R.a0 + (i + 0.5) * GRID;
  const cb = (j) => R.b0 + (j + 0.5) * GRID;
  const gate = [[GATE.a - 2.5, 0], [START.a + 1, 0]];
  const inRegion = (a, b) => a >= R.a0 && Math.hypot(a, b) <= R.r;
  const walkable = (a, b) => {
    if (polyDist(gate, a, b) <= GATE.w / 2) return true;
    if (a < R.a0 + 0.9 || Math.hypot(a, b) > WALK_R) return false;
    for (const P of C.paths ?? []) if (polyDist(P.pts, a, b) <= P.w / 2) return true;
    for (const P of C.trails ?? []) if (polyDist(P.pts, a, b) <= P.w / 2) return true;
    for (const r of C.rects ?? []) if (a >= r.a0 && a <= r.a1 && b >= r.b0 && b <= r.b1) return true;
    for (const d of C.rings ?? []) { const r = Math.hypot(a - d.a, b - d.b); if (r <= d.r1 && r >= (d.r0 ?? 0)) return true; }
    for (const H of C.houses ?? []) if (a >= H.a0 && a <= H.a1 && b >= H.b0 && b <= H.b1) return true;
    return false;
  };
  for (let i = 0; i < nA; i++) for (let j = 0; j < nB; j++) walk[i * nB + j] = walkable(ca(i), cb(j)) ? 1 : 0;
  const forest = new Uint8Array(nA * nB);
  for (let i = 0; i < nA; i++) for (let j = 0; j < nB; j++) {
    forest[i * nB + j] = !walk[i * nB + j] && inRegion(ca(i), cb(j)) ? 1 : 0;
  }
  /* A TRAIL is walkable AND bamboo: a samurai's sight stops in it as it does
     in the forest (`blocked`), and the canes standing in it (`trailCanes`)
     are solid, so it reads as — and is — a way through the woods rather than
     a hole in the fence. Its own raster: walking on it is not the forest. */
  const trail = new Uint8Array(nA * nB);
  const onTrail = (a, b) => (C.trails ?? []).some((P) => polyDist(P.pts, a, b) <= P.w / 2)
    && !(C.paths ?? []).some((P) => polyDist(P.pts, a, b) <= P.w / 2)
    && !(C.rects ?? []).some((r) => a >= r.a0 && a <= r.a1 && b >= r.b0 && b <= r.b1)
    && !(C.houses ?? []).some((H) => a >= H.a0 && a <= H.a1 && b >= H.b0 && b <= H.b1);
  for (let i = 0; i < nA; i++) for (let j = 0; j < nB; j++) trail[i * nB + j] = walk[i * nB + j] && onTrail(ca(i), cb(j)) ? 1 : 0;
  /* THE CANES IN A TRAIL, seeded off the course id so a trail is the same
     trail every visit: either side of its middle, never ON it — the clear lane
     is 2 × (FENCE.trailLane − cane r) = 1.94 across, over a kitten's 1.5. */
  const trailCanes = [];
  {
    let s = 0x7a11 ^ (C.id.length * 131);
    const R = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (const P of C.trails ?? []) {
      for (let k = 0; k < P.pts.length - 1; k++) {
        const [a0, b0] = P.pts[k]; const [a1, b1] = P.pts[k + 1];
        const len = Math.hypot(a1 - a0, b1 - b0);
        const ua = (a1 - a0) / len; const ub = (b1 - b0) / len;
        for (let t = 0.4; t < len; t += 0.55) {
          for (const side of [-1, 1]) {
            if (R() < 0.25) continue;
            const off = side * (TRAIL.lane + R() * (P.w / 2 - TRAIL.lane - 0.1));
            const a = a0 + ua * t - ub * off; const b = b0 + ub * t + ua * off;
            // Off the middle of EVERY leg of every trail — a bend's canes must not land in the next leg's lane.
            if ((C.trails ?? []).some((Q) => polyDist(Q.pts, a, b) < TRAIL.lane)) continue;
            if (!walkable(a, b) || !onTrail(a, b)) continue;
            // ...nor at a ladder's foot, or across a door: the trail leads TO those.
            if ((C.houses ?? []).some((H) => (H.ladder && Math.hypot(a - ladderFoot(H).a, b - ladderFoot(H).b) < 2.4)
              || (H.doors ?? []).some((d) => { const m = doorMouth(H, d); return Math.hypot(a - m.a, b - m.b) < doorW(d) / 2 + 1.6; }))) continue;
            trailCanes.push({ a, b, r: TRAIL.r, h: 3.4 + R() * 2.6 });
          }
        }
      }
    }
  }
  /* THE FENCE: a cane post at every forest point within reach of the walkable
     ground, on a 0.7 lattice — dense enough that a kitten (r 0.75) cannot pass
     between two, sparse enough to stay a few hundred solids. Further in, the
     forest is drawing only, and `walkAt` is the wall: nobody can get to it. */
  const fence = [];
  const near = FENCE.near;
  const step = FENCE.step;
  for (let a = R.a0 + 0.2; a <= R.a1; a += step) {
    for (let b = R.b0; b <= R.b1; b += step) {
      if (!inRegion(a, b) || walkable(a, b)) continue;
      // Within `near` of walkable ground? Sample the raster round it.
      let hit = false;
      for (let da = -near; da <= near && !hit; da += GRID) {
        for (let db = -near; db <= near && !hit; db += GRID) {
          if (da * da + db * db > near * near) continue;
          if (cellOf(a + da, b + db, nA, nB) >= 0 && walk[cellOf(a + da, b + db, nA, nB)]) hit = true;
        }
      }
      if (hit) fence.push({ a, b });
    }
  }
  /* THE DENSE BAND: forest within FENCE.thick of the walkable, drawn thick
     (bamboo.js), so the edge of a course is a wall of canes and not a hedge
     with the forest's ordinary spacing showing through it. */
  const band = new Uint8Array(nA * nB);
  {
    const k = Math.ceil(FENCE.thick / GRID);
    for (let i = 0; i < nA; i++) for (let j = 0; j < nB; j++) {
      if (!walk[i * nB + j]) continue;
      for (let di = -k; di <= k; di++) for (let dj = -k; dj <= k; dj++) {
        if (di * di + dj * dj > k * k) continue;
        const ii = i + di; const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nA || jj >= nB) continue;
        if (forest[ii * nB + jj]) band[ii * nB + jj] = 1;
      }
    }
  }
  const walls = (C.houses ?? []).flatMap(houseWalls);
  /* A TOWER'S POST stops a sight line and a shot below its floor — an archer
     on top looks over it, a kitten behind it is behind it. Not cover in the
     list (it is not crouched behind), so it is asked on its own in `blocked`. */
  const posts = (C.towers ?? []).map((t) => ({ a: t.a, b: t.b, r: TOWER_POST, top: t.h }));
  const cover = [
    ...(C.clumps ?? []).map((c) => ({ ...c, kind: 'clump', r: c.r ?? RADII.clump, top: COVER.clump, solid: true, samuraiOnly: true })),
    ...(C.barrels ?? []).map((c) => ({ ...c, kind: 'barrel', r: RADII.barrel, top: COVER.barrel, solid: true })),
    ...(C.crates ?? []).map((c) => ({ ...c, kind: 'crate', r: RADII.crate, top: COVER.crate, solid: true })),
    ...(C.thickets ?? []).map((c) => ({ ...c, kind: 'thicket', r: c.r ?? RADII.thicket, top: COVER.thicket, solid: false, samuraiOnly: true })),
  ];
  const L = { C, nA, nB, walk, forest, trail, trailCanes, band, fence, walls, posts, cover, ca, cb, cell: (a, b) => cellOf(a, b, nA, nB) };
  /* WHERE A GUARD CAN WALK: walkable, and clear of every wall and every solid
     by half a unit, so an investigation never routes him through a barrel. */
  const path = new Uint8Array(nA * nB);
  for (let i = 0; i < nA; i++) for (let j = 0; j < nB; j++) {
    if (!walk[i * nB + j]) continue;
    const a = ca(i); const b = cb(j);
    if (walls.some((w) => segDist(a, b, w.a0, w.b0, w.a1, w.b1) < 0.45)) continue;
    if (cover.some((c) => c.solid && Math.hypot(a - c.a, b - c.b) < c.r + 0.3)) continue;
    if ((C.towers ?? []).some((t) => Math.hypot(a - t.a, b - t.b) < (t.r ?? 1.4) + 0.3)) continue;
    if (trailCanes.some((c) => Math.hypot(a - c.a, b - c.b) < c.r + 0.3)) continue;
    path[i * nB + j] = 1;
  }
  L.path = path;
  _levels.set(C.id, L);
  return L;
}

/** Is (a, b) ground a kitten may stand over — the course's floor, a house, a trail? */
export function walkAt(L, a, b) {
  const c = L.cell(a, b);
  return c >= 0 && !!L.walk[c];
}

/**
 * WHERE A KITTEN'S MIDDLE CAN BE, at her real size: over walkable ground, and
 * KITTEN_R clear of every post, wall, solid and cane the game will push her
 * off. The question "can she get there" is asked on this, not on `path` (a
 * guard's, half a unit clear) — "many times the box obstacles are in front of
 * a door" and "a box blocking the walking path to the ladder" are both places
 * where a guard fitted and she did not.
 *
 * ON ITS OWN, FINER RASTER (KIT_GRID). On the half-unit one a 3-wide corridor
 * running diagonally has a clear band 0.9 across with no cell centres in it
 * for a stretch, and the flood called four of the five courses uncrossable
 * that kittens cross every afternoon. At a quarter it agrees with the game.
 */
export const KIT_GRID = 0.25;
export function kittenRaster(L) {
  if (L.kit) return L.kit;
  const R = REGION;
  const nA = Math.ceil((R.a1 - R.a0) / KIT_GRID);
  const nB = Math.ceil((R.b1 - R.b0) / KIT_GRID);
  const kit = new Uint8Array(nA * nB);
  // Point solids binned 2 units square, so each cell asks only its neighbours.
  const pts = [
    ...L.cover.filter((c) => c.solid).map((c) => ({ a: c.a, b: c.b, r: c.r })),
    ...L.fence.map((f) => ({ a: f.a, b: f.b, r: FENCE.r })),
    ...L.trailCanes.map((c) => ({ a: c.a, b: c.b, r: c.r })),
    ...(L.C.towers ?? []).map((t) => ({ a: t.a, b: t.b, r: t.r ?? 1.4 })),
  ];
  const BIN = 2;
  const bins = new Map();
  const key = (u, v) => `${Math.floor(u / BIN)},${Math.floor(v / BIN)}`;
  for (const q of pts) { const k = key(q.a, q.b); if (!bins.has(k)) bins.set(k, []); bins.get(k).push(q); }
  const near = (a, b) => {
    const out = [];
    for (let du = -BIN; du <= BIN; du += BIN) for (let dv = -BIN; dv <= BIN; dv += BIN) out.push(...(bins.get(key(a + du, b + dv)) ?? []));
    return out;
  };
  for (let i = 0; i < nA; i++) for (let j = 0; j < nB; j++) {
    const a = R.a0 + (i + 0.5) * KIT_GRID; const b = R.b0 + (j + 0.5) * KIT_GRID;
    if (!walkAt(L, a, b)) continue;
    if (L.walls.some((w) => segDist(a, b, w.a0, w.b0, w.a1, w.b1) < 0.3 + KITTEN_R)) continue;
    if (near(a, b).some((q) => Math.hypot(a - q.a, b - q.b) < q.r + KITTEN_R)) continue;
    kit[i * nB + j] = 1;
  }
  kit.nA = nA; kit.nB = nB;
  kit.cell = (a, b) => {
    const i = Math.floor((a - R.a0) / KIT_GRID); const j = Math.floor((b - R.b0) / KIT_GRID);
    return i < 0 || j < 0 || i >= nA || j >= nB ? -1 : i * nB + j;
  };
  L.kit = kit;
  return kit;
}

/**
 * WHERE HER MIDDLE MAY BE ON THE GROUND, as far as the BAMBOO is concerned:
 * walkable, and KITTEN_R clear of every fence and trail cane. The edge of the
 * course is this raster, held by `_bounds` — the canes are drawn, not pushed.
 * Richard, Oct 2026: "when trying to walk across the bamboo between the two
 * building in The Village, it is teleporting the player around the bamboo
 * area because of the colliders, instead it should just prevent the player
 * from going there". Three hundred point colliders 0.7 apart each shove her
 * out along its own radius, and `walkAt` then snapped her back to the last
 * cell she was on: two rules fighting, which reads as a teleport.
 *
 * NOT `kittenRaster`: that one keeps her 1.05 off every WALL too, which the
 * walls already do at her own radius, and would stop her a third of a unit
 * short of every wall and door jamb as an invisible margin.
 */
export function edgeRaster(L) {
  if (L.edge) return L.edge;
  const R = REGION;
  const nA = Math.ceil((R.a1 - R.a0) / KIT_GRID);
  const nB = Math.ceil((R.b1 - R.b0) / KIT_GRID);
  const edge = new Uint8Array(nA * nB);
  const pts = [...L.fence.map((f) => ({ a: f.a, b: f.b, r: FENCE.r })), ...L.trailCanes.map((c) => ({ a: c.a, b: c.b, r: c.r }))];
  const BIN = 2;
  const bins = new Map();
  const key = (u, v) => `${Math.floor(u / BIN)},${Math.floor(v / BIN)}`;
  for (const q of pts) { const k = key(q.a, q.b); if (!bins.has(k)) bins.set(k, []); bins.get(k).push(q); }
  for (let i = 0; i < nA; i++) for (let j = 0; j < nB; j++) {
    const a = R.a0 + (i + 0.5) * KIT_GRID; const b = R.b0 + (j + 0.5) * KIT_GRID;
    if (!walkAt(L, a, b)) continue;
    let clear = true;
    for (let du = -BIN; du <= BIN && clear; du += BIN) for (let dv = -BIN; dv <= BIN && clear; dv += BIN) {
      for (const q of bins.get(key(a + du, b + dv)) ?? []) if (Math.hypot(a - q.a, b - q.b) < q.r + KITTEN_R) { clear = false; break; }
    }
    if (clear) edge[i * nB + j] = 1;
  }
  edge.at = (a, b) => {
    const i = Math.floor((a - R.a0) / KIT_GRID); const j = Math.floor((b - R.b0) / KIT_GRID);
    return i >= 0 && j >= 0 && i < nA && j < nB && edge[i * nB + j] === 1;
  };
  L.edge = edge;
  return edge;
}

/**
 * EVERY CELL (of `kittenRaster`) A KITTEN CAN WALK TO FROM `from`, on the
 * ground, at her size: 8 neighbours, no corner cutting. Roofs are not in it —
 * they are reached by ladders, and `courseProblems` asks about those.
 */
export function reachable(L, from = START) {
  const kit = kittenRaster(L);
  const { nA, nB } = kit;
  const seen = new Uint8Array(nA * nB);
  seen.cell = kit.cell;
  const s = kit.cell(from.a, from.b);
  if (s < 0 || !kit[s]) return seen;
  seen[s] = 1;
  const q = [s];
  for (let h = 0; h < q.length; h++) {
    const k = q[h]; const i = Math.floor(k / nB); const j = k % nB;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      const ii = i + di; const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nA || jj >= nB) continue;
      const kk = ii * nB + jj;
      if (!kit[kk] || seen[kk]) continue;
      if (di && dj && !(kit[i * nB + jj] && kit[ii * nB + j])) continue;
      seen[kk] = 1;
      q.push(kk);
    }
  }
  return seen;
}

/** Can she stand somewhere within `r` of (a, b), reached from the start? */
export function reachesNear(L, seen, a, b, r) {
  for (let da = -r; da <= r; da += KIT_GRID) for (let db = -r; db <= r; db += KIT_GRID) {
    if (da * da + db * db > r * r) continue;
    const c = seen.cell(a + da, b + db);
    if (c >= 0 && seen[c]) return true;
  }
  return false;
}

/** How near a ladder's foot she climbs it from (bamboo.js LADDER.reach). */
export const LADDER_REACH = 0.9;
/**
 * HOW NEAR A BARREL'S MIDDLE SHE CLIMBS IN FROM (bamboo.js HIDE_R). It was 1.4
 * against a barrel r 0.6 and a kitten r 0.75 — 1.35 apart at the closest the
 * collider lets them be, so the press worked in a 5 cm sliver, and only once
 * she had already walked into the barrel.
 */
export const HIDE_REACH = 1.9;
/** A rope is hung from when it is this far above her feet (bamboo.js ROPE). */
export const HANG = { lo: 1.6, hi: 3.8 };
/**
 * HOW HIGH A ROPE IS TIED: this far above the roof under each end, so it can
 * slope from a low roof to a high one. Richard, Oct 2026: "the player is
 * falling through the building below the roof line ... Seems the rope lines
 * are too low". They were one hand-set `y` for both ends, and a level rope
 * between a 4.4 roof and a 5.2 one cannot clear both. MEASURED off the rope
 * clip's ink (public/sprites/ninja/*.png, every facing): she hangs 1.21 of her
 * height below the rope (Ember; Frost 1.19), and the mount clip — stood on the
 * roof — reaches 1.23 of it up. So at 1.26 of her height (3.65 for a 2.9
 * kitten) the hang ends with her feet just over the roof she is let down onto,
 * and the mount ends with her paws on the rope.
 */
export const ROPE_RISE = 1.26 * 2.9;
/** The roof (house) under a rope's end, or none. */
export const roofUnder = (C, a, b) => (C.houses ?? []).find((H) => inHouse(H, a, b)) ?? null;
/** A rope's two ends, each at ROPE_RISE over the roof under it (or the ground). */
export function ropeEnds(C, R) {
  const H0 = roofUnder(C, R.from[0], R.from[1]);
  const H1 = roofUnder(C, R.to[0], R.to[1]);
  return { H0, H1, y0: (H0?.h ?? 0) + ROPE_RISE, y1: (H1?.h ?? 0) + ROPE_RISE };
}

/**
 * EVERYTHING ABOUT A COURSE'S LAYOUT THAT WOULD STILL LOOK FINE ON SCREEN
 * WHILE BEING BROKEN, as sentences — empty when there is nothing. Asked at
 * her real size (`kittenRaster`), from the start:
 *   every door has ground she can reach on both sides of it, and nothing
 *     solid in its mouth ("many times the box obstacles are in front of a door")
 *   every ladder's foot can be stood at, and the roof it climbs to is a roof
 *   every lantern, pickup and barrel can be got to, and so can the scroll
 *   every rope hangs over a roof at both ends, low enough to grab from it,
 *     and at least one of those roofs has a ladder she can get to
 * world-check fails on any; tools/bamboo-probe.mjs prints them.
 */
export function courseProblems(C) {
  const L = levelOf(C);
  const seen = reachable(L, START);
  const out = [];
  const at = (p) => `(${(+p.a).toFixed(1)}, ${(+p.b).toFixed(1)})`;
  const solids = [...L.cover.filter((c) => c.solid), ...L.trailCanes.map((c) => ({ ...c, kind: 'trail cane' }))];
  for (const H of C.houses ?? []) {
    for (const d of H.doors ?? []) {
      const m = doorMouth(H, d);
      const name = `${H.id}'s ${d.side} door at ${d.at}`;
      if (doorW(d) < DOOR_MIN) out.push(`${name} is ${doorW(d)} wide, under ${DOOR_MIN}`);
      for (const [k, side] of [[1.6, 'outside'], [-1.6, 'inside']]) {
        if (!reachesNear(L, seen, m.a + m.na * k, m.b + m.nb * k, 0.8)) out.push(`${name}: she cannot get to its ${side}`);
      }
      for (const c of solids) {
        if (segDist(c.a, c.b, m.a - m.na * 1.6, m.b - m.nb * 1.6, m.a + m.na * 2.2, m.b + m.nb * 2.2) < c.r + KITTEN_R + 0.15) {
          out.push(`a ${c.kind} at ${at(c)} stands in ${name}`);
        }
      }
    }
    if (H.ladder) {
      const f = ladderFoot(H);
      if (!reachesNear(L, seen, f.a, f.b, LADDER_REACH)) out.push(`${H.id}'s ladder: she cannot stand at its foot ${at(f)}`);
      // Not one on the far side of the wall: a barrel indoors does not crowd a ladder outdoors.
      for (const c of solids) if (!inHouse(H, c.a, c.b) && Math.hypot(c.a - f.a, c.b - f.b) < c.r + KITTEN_R + 0.6) out.push(`a ${c.kind} at ${at(c)} crowds ${H.id}'s ladder`);
    }
  }
  const all = (xs) => xs ?? [];
  for (const l of all(C.lanterns)) if (!reachesNear(L, seen, l.a, l.b, 1.1)) out.push(`the lantern at ${at(l)} cannot be reached`);
  for (const k of all(C.pickups)) if (!reachesNear(L, seen, k.a, k.b, 1.0)) out.push(`the ${k.kind} at ${at(k)} cannot be reached`);
  for (const b of all(C.barrels)) if (!reachesNear(L, seen, b.a, b.b, HIDE_REACH - 0.1)) out.push(`the barrel at ${at(b)} cannot be got into`);
  if (!reachesNear(L, seen, C.scroll.a, C.scroll.b, 1.5)) out.push(`the scroll at ${at(C.scroll)} cannot be reached`);
  const roofOf = (a, b) => all(C.houses).find((H) => inHouse(H, a, b));
  const climbable = (H) => !!H?.ladder && reachesNear(L, seen, ladderFoot(H).a, ladderFoot(H).b, LADDER_REACH);
  for (const R of all(C.ropes)) {
    const E = ropeEnds(C, R);
    const ends = [R.from, R.to].map(([a, b], k) => ({ a, b, H: roofOf(a, b), y: k ? E.y1 : E.y0 }));
    for (const e of ends) {
      if (!e.H) out.push(`a rope's end at ${at(e)} is over no roof`);
      else if (e.y - e.H.h < HANG.lo || e.y - e.H.h > HANG.hi) out.push(`a rope's end over ${e.H.id} hangs ${(e.y - e.H.h).toFixed(1)} above its roof — not grabbable`);
    }
    if (R.y != null) out.push(`the rope ${at(ends[0])}–${at(ends[1])} still sets its own y: its height is the roofs' (ropeEnds)`);
    if (!ends.some((e) => climbable(e.H))) out.push(`the rope ${at(ends[0])}–${at(ends[1])} has no ladder up to either end`);
  }
  return out;
}

function cellOf(a, b, nA, nB) {
  const i = Math.floor((a - REGION.a0) / GRID);
  const j = Math.floor((b - REGION.b0) / GRID);
  return i < 0 || j < 0 || i >= nA || j >= nB ? -1 : i * nB + j;
}

/** Which guards are out on difficulty `n`. */
export const guardsOn = (C, n) => (C.guards ?? []).filter((g) => (g.minDiff ?? 0) <= n && (g.maxDiff ?? 2) >= n);
/** Which lanterns are lit-able on difficulty `n` — more on EASY, fewer on HARD. */
export const lanternsOn = (C, n) => (C.lanterns ?? []).filter((l) => l.d.includes(n));
export const pickupsOn = (C, n) => (C.pickups ?? []).filter((q) => q.d.includes(n));

/* ------------------------------- patrols -------------------------------- */

/**
 * A PATROL AS A PURE FUNCTION OF TIME. A route is waypoints `{a, b, wait,
 * look, scan}`, walked in a loop at the difficulty's pace: on a leg he looks
 * where he walks (with a little sway), and at a waypoint he stands `wait`
 * seconds sweeping his look `look ± scan` on a sine — the same sweep the
 * first version's watchers had, so a kitten who waits at the edge of a
 * clearing is watching a sine wave swing. A route of ONE waypoint is a
 * sentry who never moves. A `circle` is a guard who walks round and round a
 * centre (the Shrine Circle's): θ = θ₀ + ω t, and he looks along it.
 */
export function patrolAt(g, D, t) {
  if (g.circle) {
    const c = g.circle;
    const w = (c.speed ?? D.walk) / c.R * (c.dir ?? 1);
    const th = deg(c.th0 ?? 0) + w * t;
    const a = c.a + c.R * Math.cos(th);
    const b = c.b + c.R * Math.sin(th);
    const along = th + (c.dir ?? 1) * Math.PI / 2;
    return { a, b, look: along + (c.lookIn ?? 0) * (c.dir ?? 1) + 0.25 * Math.sin(t * 1.3 + (c.th0 ?? 0)), moving: true, th };
  }
  const W = g.route;
  const sweep = (wp, tt) => deg(wp.look ?? 0) + deg(wp.scan ?? 40) * Math.sin(tt * (wp.rate ?? 0.9) + (wp.ph ?? 0));
  if (W.length === 1) return { a: W[0].a, b: W[0].b, look: sweep(W[0], t), moving: false };
  const plan = g._plan ??= new Map();
  let P = plan.get(D.key);
  if (!P) {
    P = [];
    let T = 0;
    for (let i = 0; i < W.length; i++) {
      const p = W[i]; const q = W[(i + 1) % W.length];
      const dur = Math.hypot(q.a - p.a, q.b - p.b) / (g.speed ?? D.walk);
      P.push({ kind: 'leg', p, q, t0: T, t1: T + dur });
      T += dur;
      if (q.wait) { P.push({ kind: 'wait', p: q, t0: T, t1: T + q.wait }); T += q.wait; }
    }
    P.T = T;
    plan.set(D.key, P);
  }
  const tt = ((t + (g.t0 ?? 0)) % P.T + P.T) % P.T;
  const s = P.find((x) => tt >= x.t0 && tt < x.t1) ?? P[P.length - 1];
  if (s.kind === 'wait') return { a: s.p.a, b: s.p.b, look: sweep(s.p, tt - s.t0), moving: false };
  const k = (tt - s.t0) / (s.t1 - s.t0 || 1);
  const dir = Math.atan2(s.q.b - s.p.b, s.q.a - s.p.a);
  return { a: s.p.a + (s.q.a - s.p.a) * k, b: s.p.b + (s.q.b - s.p.b) * k, look: dir + 0.18 * Math.sin(tt * 2.1), moving: true, dir };
}

/* --------------------------------- sight --------------------------------- */

/**
 * IS THE LINE FROM ONE POINT TO ANOTHER BLOCKED? Heights matter: cover only
 * blocks where the sight line crosses it LOWER than its top, so a crate hides
 * a crawling kitten from a samurai and not one standing up, and an archer on a
 * tower sees over it. `who` is 'samurai' (bamboo hides from him) or 'archer'
 * (it does not: "sees through bamboo"). `smokes` are live smoke clouds.
 */
export function blocked(L, e, k, who, smokes = []) {
  const da = k.a - e.a; const db = k.b - e.b;
  const d = Math.hypot(da, db);
  const yAt = (u) => e.y + (k.y - e.y) * u;
  for (const s of smokes) {
    if (Math.hypot(k.a - s.a, k.b - s.b) < s.r || Math.hypot(e.a - s.a, e.b - s.b) < s.r) return true;
    const u = ((s.a - e.a) * da + (s.b - e.b) * db) / (d * d || 1);
    if (u > 0 && u < 1 && Math.hypot(e.a + da * u - s.a, e.b + db * u - s.b) < s.r && yAt(u) < COVER.smoke) return true;
  }
  /* THE FOREST, marched in half-units — for the samurai only. A ray that
     passes over bamboo canes high enough (a kitten on a rope against a guard
     on a roof) is not stopped by them: the canes are COVER.forest high, so
     in practice it is. */
  if (who !== 'archer') {
    const n = Math.ceil(d / (GRID * 0.8));
    for (let s = 1; s < n; s++) {
      const u = s / n;
      const c = L.cell(e.a + da * u, e.b + db * u);
      // A trail's canes hide her as the forest's do — under their tops.
      if (c >= 0 && (L.forest[c] || (L.trail?.[c] && yAt(u) < COVER.clump))) return true;
    }
  }
  // Two loops, not one over a spread: this runs for every ray of every cone, every other frame.
  for (const list of [L.cover, L.posts ?? NONE]) {
    for (const c of list) {
      if (c.samuraiOnly && who === 'archer') continue;
      const u = ((c.a - e.a) * da + (c.b - e.b) * db) / (d * d || 1);
      if (u <= 0 || u >= 1) continue;
      if (Math.hypot(e.a + da * u - c.a, e.b + db * u - c.b) < c.r && yAt(u) < c.top) return true;
    }
  }
  for (const w of L.walls) {
    const u = crossT(e.a, e.b, k.a, k.b, w.a0, w.b0, w.a1, w.b1);
    if (u >= 0 && yAt(u) < w.top) return true;
  }
  /* A ROOF: a line that enters a house over its walls came through the roof.
     Asked of whichever end is inside a house and below its roof — a kitten
     indoors seen from a tower, or a guard indoors looking up and out. */
  for (const H of L.C.houses ?? []) {
    const kin = inHouse(H, k.a, k.b) && k.y < H.h;
    const ein = inHouse(H, e.a, e.b) && e.y < H.h;
    if (kin === ein) continue;
    for (const [p, q] of [[[H.a0, H.b0], [H.a1, H.b0]], [[H.a0, H.b1], [H.a1, H.b1]], [[H.a0, H.b0], [H.a0, H.b1]], [[H.a1, H.b0], [H.a1, H.b1]]]) {
      const u = crossT(e.a, e.b, k.a, k.b, p[0], p[1], q[0], q[1]);
      if (u >= 0 && yAt(u) >= H.h - 0.05) return true;
    }
  }
  return false;
}

/**
 * CAN GUARD `g` (at `at`, looking `at.look`, his feet at `at.y`) SEE A KITTEN
 * whose eyes are at (a, b, y)? In range, inside the cone, not above where he
 * looks, and nothing in the way. THE ONE PLACE: the game, the cone on the
 * floor and the solver all ask this.
 */
export function canSee(L, g, at, D, k, smokes = []) {
  const archer = g.kind === 'archer';
  const range = D.range * (archer ? D.archer.range : 1);
  const half = D.half * (archer ? D.archer.half : 1);
  const da = k.a - at.a; const db = k.b - at.b;
  const d = Math.hypot(da, db);
  if (d > range || d < 1e-3) return false;
  if (Math.abs(wrap(Math.atan2(db, da) - at.look)) > half) return false;
  if (k.y - at.y > (archer ? ARCHER_UP : SAMURAI_UP)) return false;
  return !blocked(L, { a: at.a, b: at.b, y: at.y + EYE.guard }, k, archer ? 'archer' : 'samurai', smokes);
}

/** How far along bearing `th` a guard's sight reaches at kitten-crawl height —
 *  what the cone on the floor is drawn from, so its shadows are `blocked`'s. */
export function reach(L, g, at, D, th, y = EYE.crawl, smokes = []) {
  const archer = g.kind === 'archer';
  const range = D.range * (archer ? D.archer.range : 1);
  let lo = 0; let hi = range;
  const ok = (r) => !blocked(L, { a: at.a, b: at.b, y: at.y + EYE.guard }, { a: at.a + Math.cos(th) * r, b: at.b + Math.sin(th) * r, y: at.y0 + y }, archer ? 'archer' : 'samurai', smokes);
  if (ok(hi)) return hi;
  // The first blocked distance, to a quarter unit: a few halvings over a march.
  for (let r = GRID; r <= range; r += GRID) if (!ok(r)) { hi = r; lo = r - GRID; break; }
  for (let n = 0; n < 2; n++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
  return lo;
}

/* -------------------------------- solving -------------------------------- */

/**
 * CAN A PATIENT KITTEN GET FROM THE START TO THE SCROLL UNSEEN — crawling,
 * on the ground, with no pebble, no shuriken, no smoke and no rope? A search
 * over (cell, time): every `dt` she may stay or step to a neighbour, and a
 * state any guard can see her in is not one she may be in. Returns the
 * earliest arrival in seconds, or null. world-check asks this of every course
 * at every difficulty, and the star times are set off its answer.
 *
 * Optimistic in one way on purpose — a diagonal step costs what a straight one
 * does — and strict in another: one frame in a cone is a capture, where the
 * game gives her `seeT`. The two roughly cancel, and the check is about
 * whether a way EXISTS, not how fast.
 */
export function solve(C, n, { tMax = 200, cell = 1.0, from = START, guards = null, trace = false } = {}) {
  const L = levelOf(C);
  const D = DIFFS[n];
  const gs = guards ?? guardsOn(C, n);
  const R = REGION;
  const nA = Math.ceil((R.a1 - R.a0) / cell);
  const nB = Math.ceil((R.b1 - R.b0) / cell);
  const ok = new Uint8Array(nA * nB);
  /* Where SHE fits (`kittenRaster`), sampled at this search's cell. On the
     guards' raster the solver crawled a 1.5-wide kitten through 1.2-wide
     doors — which is how the doors stayed too tight for a whole version. */
  const kit = kittenRaster(L);
  for (let i = 0; i < nA; i++) for (let j = 0; j < nB; j++) {
    const a = R.a0 + (i + 0.5) * cell; const b = R.b0 + (j + 0.5) * cell;
    // Any kitten cell in this search cell: the search is coarse, she is not.
    let fit = false;
    for (let u = -cell / 2 + KIT_GRID / 2; u < cell / 2 && !fit; u += KIT_GRID) {
      for (let v = -cell / 2 + KIT_GRID / 2; v < cell / 2 && !fit; v += KIT_GRID) {
        const c = kit.cell(a + u, b + v);
        if (c >= 0 && kit[c]) fit = true;
      }
    }
    if (fit) ok[i * nB + j] = 1;
  }
  const dt = cell / SNEAK.speed;
  const goal = C.scroll;
  const idx = (a, b) => Math.floor((a - R.a0) / cell) * nB + Math.floor((b - R.b0) / cell);
  let front = new Set([idx(from.a, from.b)]);
  // With `trace`, every layer's parents, so the route can be read back (tools/bamboo-map.mjs).
  const layers = trace ? [new Map([[idx(from.a, from.b), -1]])] : null;
  const centre = (k) => ({ a: R.a0 + (Math.floor(k / nB) + 0.5) * cell, b: R.b0 + ((k % nB) + 0.5) * cell });
  const done = (k, t) => {
    if (!trace) return t;
    const path = [];
    for (let s = layers.length - 1; s >= 0 && k >= 0; s--) { path.push(centre(k)); k = layers[s].get(k); }
    return { t, path: path.reverse() };
  };
  const seen = (k, t) => {
    const i = Math.floor(k / nB); const j = k % nB;
    const kt = { a: R.a0 + (i + 0.5) * cell, b: R.b0 + (j + 0.5) * cell, y: EYE.crawl };
    for (const g of gs) {
      const at = guardAt(g, D, t);
      if (canSee(L, g, at, D, kt)) return true;
    }
    return false;
  };
  const gk = idx(goal.a, goal.b);
  for (let s = 0, t = 0; t < tMax; s++, t += dt) {
    const won = [...front].find((k) => k === gk || Math.hypot(centre(k).a - goal.a, centre(k).b - goal.b) < 1.6);
    if (won != null) return done(won, t);
    const next = new Set();
    const par = trace ? new Map() : null;
    for (const k of front) {
      const i = Math.floor(k / nB); const j = k % nB;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const ii = i + di; const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nA || jj >= nB) continue;
        const kk = ii * nB + jj;
        if (!ok[kk] || next.has(kk)) continue;
        // A diagonal only if both straight neighbours are open: no corner-cutting through a post.
        if (di && dj && !(ok[i * nB + jj] && ok[ii * nB + j])) continue;
        if (seen(kk, t + dt)) continue;
        next.add(kk);
        par?.set(kk, k);
      }
    }
    if (!next.size) return null;
    front = next;
    layers?.push(par);
  }
  return null;
}

/**
 * A GUARD'S WALK FROM ONE POINT TO ANOTHER, round the walls and the cover:
 * a breadth-first search over `L.path` (8 neighbours, no corner cutting),
 * read back as waypoints with every straight run collapsed to its ends. For
 * the walk to a noise and back, and the sprint to an arrest. A point off the
 * path (a pebble that landed in a thicket) is answered with the nearest path
 * cell within 3 units; null if there is none, or no way there.
 */
export function walkPath(L, from, to) {
  const near = (a, b) => {
    const c = L.cell(a, b);
    if (c >= 0 && L.path[c]) return c;
    let best = -1; let bd = 3;
    for (let da = -3; da <= 3; da += GRID) for (let db = -3; db <= 3; db += GRID) {
      const k = L.cell(a + da, b + db);
      const d = Math.hypot(da, db);
      if (k >= 0 && L.path[k] && d < bd) { bd = d; best = k; }
    }
    return best;
  };
  const s = near(from.a, from.b); const e = near(to.a, to.b);
  if (s < 0 || e < 0) return null;
  const { nA, nB } = L;
  const par = new Int32Array(nA * nB).fill(-2);
  par[s] = -1;
  const q = [s];
  for (let h = 0; h < q.length && par[e] === -2; h++) {
    const k = q[h]; const i = Math.floor(k / nB); const j = k % nB;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      const ii = i + di; const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nA || jj >= nB) continue;
      const kk = ii * nB + jj;
      if (!L.path[kk] || par[kk] !== -2) continue;
      if (di && dj && !(L.path[i * nB + jj] && L.path[ii * nB + j])) continue;
      par[kk] = k;
      q.push(kk);
    }
  }
  if (par[e] === -2) return null;
  const cells = [];
  for (let k = e; k >= 0; k = par[k]) cells.push(k);
  cells.reverse();
  const pt = (k) => ({ a: L.ca(Math.floor(k / nB)), b: L.cb(k % nB) });
  const out = [pt(cells[0])];
  for (let n = 1; n < cells.length - 1; n++) {
    const p = cells[n - 1]; const c = cells[n]; const x = cells[n + 1];
    if (c - p !== x - c) out.push(pt(c));
  }
  if (cells.length > 1) out.push(pt(cells[cells.length - 1]));
  return out;
}

/** Where a guard is at time t, with his floor's height — a tower's top for an archer. */
export function guardAt(g, D, t) {
  const at = patrolAt(g, D, t);
  at.y = g.y ?? 0;
  at.y0 = 0;
  return at;
}

/* ------------------------------- the courses ------------------------------ */

export { COURSES, courseById, starsId } from './bamboocourses.js';
