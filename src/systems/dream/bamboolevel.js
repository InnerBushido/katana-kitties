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
     decks      floating floors, { a, b, r, y }
     ropes      { from: [a, b], to: [a, b], y } — she hangs under them
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
/** Cover heights: anything lower than the sight line where it crosses does not block. */
export const COVER = { clump: 6, barrel: 1.35, crate: 1.1, thicket: 1.0, smoke: 4.5, forest: 99 };
export const RADII = { clump: 0.9, barrel: 0.6, crate: 0.75, thicket: 1.6, smoke: 3.5 };
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
/** Seconds added to a run's time per capture — the score is the time. */
export const CAUGHT_COST = 15;

const deg = (d) => (d * Math.PI) / 180;
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
    const gaps = (H.doors ?? []).filter((d) => d.side === k).map((d) => [d.at - d.w / 2, d.at + d.w / 2]).sort((x, y) => x[0] - y[0]);
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
  /* THE FENCE: a cane post at every forest point within reach of the walkable
     ground, on a 0.7 lattice — dense enough that a kitten (r 0.5) cannot pass
     between two, sparse enough to stay a few hundred solids. Further in, the
     forest is drawing only: nobody can get to it. */
  const fence = [];
  const near = 1.25;
  const step = 0.7;
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
  const walls = (C.houses ?? []).flatMap(houseWalls);
  const cover = [
    ...(C.clumps ?? []).map((c) => ({ ...c, kind: 'clump', r: c.r ?? RADII.clump, top: COVER.clump, solid: true, samuraiOnly: true })),
    ...(C.barrels ?? []).map((c) => ({ ...c, kind: 'barrel', r: RADII.barrel, top: COVER.barrel, solid: true })),
    ...(C.crates ?? []).map((c) => ({ ...c, kind: 'crate', r: RADII.crate, top: COVER.crate, solid: true })),
    ...(C.thickets ?? []).map((c) => ({ ...c, kind: 'thicket', r: c.r ?? RADII.thicket, top: COVER.thicket, solid: false, samuraiOnly: true })),
  ];
  const L = { C, nA, nB, walk, forest, fence, walls, cover, ca, cb, cell: (a, b) => cellOf(a, b, nA, nB) };
  /* WHERE A GUARD CAN WALK: walkable, and clear of every wall and every solid
     by half a unit, so an investigation never routes him through a barrel. */
  const path = new Uint8Array(nA * nB);
  for (let i = 0; i < nA; i++) for (let j = 0; j < nB; j++) {
    if (!walk[i * nB + j]) continue;
    const a = ca(i); const b = cb(j);
    if (walls.some((w) => segDist(a, b, w.a0, w.b0, w.a1, w.b1) < 0.45)) continue;
    if (cover.some((c) => c.solid && Math.hypot(a - c.a, b - c.b) < c.r + 0.3)) continue;
    if ((C.towers ?? []).some((t) => Math.hypot(a - t.a, b - t.b) < (t.r ?? 1.4) + 0.3)) continue;
    path[i * nB + j] = 1;
  }
  L.path = path;
  _levels.set(C.id, L);
  return L;
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
      if (c >= 0 && L.forest[c]) return true;
    }
  }
  for (const c of L.cover) {
    if (c.samuraiOnly && who === 'archer') continue;
    const u = ((c.a - e.a) * da + (c.b - e.b) * db) / (d * d || 1);
    if (u <= 0 || u >= 1) continue;
    if (Math.hypot(e.a + da * u - c.a, e.b + db * u - c.b) < c.r && yAt(u) < c.top) return true;
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
  for (let i = 0; i < nA; i++) for (let j = 0; j < nB; j++) {
    const a = R.a0 + (i + 0.5) * cell; const b = R.b0 + (j + 0.5) * cell;
    const c = L.cell(a, b);
    if (c >= 0 && L.path[c]) ok[i * nB + j] = 1;
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
