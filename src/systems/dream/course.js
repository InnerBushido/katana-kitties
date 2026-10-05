import * as THREE from 'three';
import { segSegDist } from './targets.js';

/* ---------------------------------------------------------------------------
   THE SINE GAUNTLET'S COURSE — the numbers, and nothing that draws.

   Richard: "the camera angle, lack of shadows on the lasers, shape of the
   lasers, and small area to navigate, makes it hard to navigate through
   without getting hit and makes for a bad experience ... rather than making 4
   separate lanes for each player, it may be better to turn this into more of
   a Ninja Warrior type course, with obstacles and different patterns,
   requiring different movements and techniques ... Can have the 4 lanes snake
   together ... just have 1 course lane and have the 4 players queue up in
   competition, going one by one and competing for the best time".

   SO THE FOUR 6-WIDE LANES ARE THREE 10-WIDE ONES THAT SNAKE into each other
   across the island, and every stretch of them asks for a different move:

     A  →  STANDING WAVE    three bars, every one rising and falling together
           TRAVELLING WAVE  three bars whose crest runs the way she does: ride it
     ↩
     B  ←  SINE STONES      stepping stones bobbing on a sine over a floor that zaps
           THE SWEEPER      a bar turning round a pivot: its ends are (R·cos θ, R·sin θ)
     ↪
     C  →  SLIDING GAPS     two curtains of light whose gap slides as A·sin(ωt)
           COUNTER WAVE     three bars whose crest runs AT her, faster
           FINISH

   The old Gauntlet's three levels each taught one of the three waves; now the
   course teaches all three in a row, and a level is how FAST it all moves.

   NON-NEGOTIABLE 1, AGAIN. `beams(L, t)` is the one place a hazard is: the
   game's lasers are laid on it every frame, the cards print its numbers, and
   `fastestRun` below — which is where the star bands come from — tests a
   kitten against it. A prettier course that lied about where its beams are
   would be worse than the old one.

   COORDINATES ARE THE ISLAND'S: `a` along its `fwd`, `b` to the right of it,
   `y` above its floor (see `isleSpot`). The bridge lands at (a −24, b 0), so
   the plaza — the kiosk, the stands, the board — is everything behind a −17.
   EVERY HAZARD IS A FUNCTION OF THE RUN'S OWN CLOCK, which starts at GO: four
   sisters racing for a time all face the same course at the same moments.
--------------------------------------------------------------------------- */

/** How fast everything moves, per level. The waves keep their shapes. */
export const LEVELS = [
  { speed: 0.8 },
  { speed: 1.0 },
  { speed: 1.3 },
];

/** The three lanes' middles (a), half their width, and their walls. */
export const LANES = [-12, -2, 8];
export const LANE_HALF = 5;
/* 19.3, NOT 19.5: the outer corners are the course's furthest points from
   the island's middle, and at 19.5 they stood 0.07 past its edge (25.87 of
   26) - found by world-check's every-post-on-the-island test. */
export const END_B = 19.3;
export const TURN_B = 17.15;
/** The walls, as segments in (a, b). The middle two each stop short at one
 *  end, which is the turn: A→B at +b, B→C at −b. */
export const WALLS = [
  [[-17, -END_B], [-17, END_B]],
  [[-7, -END_B], [-7, 15]],
  [[3, -15], [3, END_B]],
  [[13, -END_B], [13, END_B]],
  [[-17, -END_B], [13, -END_B]],
  [[-17, END_B], [13, END_B]],
];
/** Her route down the middle of it, start spot to finish line. */
export const PATH = [[-12, -17.5], [-12, TURN_B], [-2, TURN_B], [-2, -TURN_B], [8, -TURN_B], [8, 15]];
export const START = { a: -12, b: -17.5 };
export const START_LINE = -15.5;

/** The stretches, in the order she meets them. `cp` is the checkpoint a zap
 *  sends her back to (in her lane, at that b). Bars are listed in the order
 *  she reaches them, so `n` counts the way she runs. */
export const SECTIONS = [
  { key: 'stand', name: 'STANDING WAVE', lane: 0, cp: -17.5, bars: [-11, -7, -3], wave: { A: 1.6, C: 2.0, w: 1.6, k: 0 } },
  { key: 'travel', name: 'TRAVELLING WAVE', lane: 0, cp: 0, bars: [3, 7, 11], wave: { A: 1.6, C: 2.0, w: 1.8, k: 0.8 } },
  { key: 'stones', name: 'SINE STONES', lane: 1, cp: 15.5, stones: [11, 7.5, 4, 0.5], floor: [-1, 13],
    stone: { H: 1.3, A: 1.0, w: 1.4, k: 1.1, r: 1.5 } },
  { key: 'sweep', name: 'THE SWEEPER', lane: 1, cp: -2.2, pivot: -8, arm: { R: 4.4, y: 0.9, w: 1.5 } },
  { key: 'gaps', name: 'SLIDING GAPS', lane: 2, cp: -15.5, curtains: [-10, -4],
    gap: { half: 1.8, A: 2.6, w: 1.2, ph: [0, 1.9] }, beams: [0.5, 1.4, 2.3, 3.2, 4.1] },
  { key: 'counter', name: 'COUNTER WAVE', lane: 2, cp: -1, bars: [2, 6, 10], wave: { A: 1.7, C: 2.0, w: 2.4, k: -0.9 } },
];
export const SECTION = Object.fromEntries(SECTIONS.map((s) => [s.key, s]));
export const FINISH_B = 15;

/** A bar stands this thick, and hits a body within this much more of it —
 *  `Laser.distTo` against `thick + 0.45`. */
export const BAR_THICK = 0.3;
export const BODY_R = 0.45;
/** A bar at or above this is walked under; at or below this, hopped. Her body
 *  is feet+0.2 to feet+0.85·2.6, and the beam reaches 0.75. */
export const UNDER = 3.0;
export const JUMPABLE = 1.6;

/* ------------------------------- the waves ------------------------------- */

/** Height of bar `n` of a wave at run time `t`. THE ONE PLACE. */
export function barHeight(wave, t, n, speed = 1) {
  return wave.C + wave.A * Math.sin(wave.w * speed * t - wave.k * n);
}

/** The wave's equation with its own numbers in it. */
export function waveText(wave, speed = 1) {
  const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
  const k = wave.k === 0 ? '' : ` ${wave.k > 0 ? '−' : '+'} ${f1(Math.abs(wave.k))}n`;
  return `y = ${f1(wave.C)} + ${f1(wave.A)}·sin(${f1(wave.w * speed)}t${k})`;
}

/** Bar `n` now, worked: the angle in degrees and the height it makes. */
export function barWorking(wave, t, n, speed = 1) {
  const y = barHeight(wave, t, n, speed);
  const rad = wave.w * speed * t - wave.k * n;
  const deg = ((Math.round((rad * 180) / Math.PI) % 360) + 360) % 360;
  const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
  const word = y >= UNDER ? 'WALK UNDER' : y <= JUMPABLE ? 'JUMP IT' : 'WAIT…';
  return { y, deg, word, text: `bar ${n + 1}: ${f1(wave.C)} + ${f1(wave.A)}·sin(${deg}°) = ${y.toFixed(2)}` };
}

/** Stone `n`'s top, above the floor. */
export function stoneHeight(sec, t, n, speed = 1) {
  const s = sec.stone;
  return s.H + s.A * Math.sin(s.w * speed * t - s.k * n);
}

/** The sweeper's angle, and its two ends — (R·cos θ, R·sin θ) about the
 *  pivot, and the opposite point. `a` is the cos, `b` the sin. */
export function sweepAngle(sec, t, speed = 1) { return sec.arm.w * speed * t; }
export function sweepEnds(sec, t, speed = 1) {
  const th = sweepAngle(sec, t, speed);
  const a0 = LANES[sec.lane];
  const R = sec.arm.R;
  return {
    th,
    p: { a: a0 + R * Math.cos(th), b: sec.pivot + R * Math.sin(th) },
    q: { a: a0 - R * Math.cos(th), b: sec.pivot - R * Math.sin(th) },
  };
}

/** Where curtain `i`'s gap is centred, across her lane. */
export function gapCentre(sec, t, i, speed = 1) {
  const g = sec.gap;
  return LANES[sec.lane] + g.A * Math.sin(g.w * speed * t + g.ph[i]);
}

/**
 * EVERY BEAM ON THE COURSE AT RUN TIME `t`, in island coordinates — the bars,
 * the sweeper and the curtains, in a fixed order and a fixed number, so the
 * game can hold one Laser per entry and only move them.
 */
export function beams(L, t) {
  const sp = L.speed;
  const out = [];
  for (const sec of SECTIONS) {
    const c = LANES[sec.lane];
    if (sec.bars) {
      sec.bars.forEach((b, n) => {
        const y = barHeight(sec.wave, t, n, sp);
        out.push({ sec: sec.key, n, a0: c - LANE_HALF + 0.05, b0: b, y0: y, a1: c + LANE_HALF - 0.05, b1: b, y1: y, thick: BAR_THICK });
      });
    }
    if (sec.arm) {
      const e = sweepEnds(sec, t, sp);
      out.push({ sec: sec.key, n: 0, a0: e.q.a, b0: e.q.b, y0: sec.arm.y, a1: e.p.a, b1: e.p.b, y1: sec.arm.y, thick: BAR_THICK });
    }
    if (sec.curtains) {
      sec.curtains.forEach((b, i) => {
        const g = gapCentre(sec, t, i, sp);
        for (const y of sec.beams) {
          out.push({ sec: sec.key, n: i, a0: c - LANE_HALF + 0.05, b0: b, y0: y, a1: g - sec.gap.half, b1: b, y1: y, thick: BAR_THICK });
          out.push({ sec: sec.key, n: i, a0: g + sec.gap.half, b0: b, y0: y, a1: c + LANE_HALF - 0.05, b1: b, y1: y, thick: BAR_THICK });
        }
      });
    }
  }
  return out;
}

/** The stones' tops at `t`: { a, b, r, y } each. */
export function stones(L, t) {
  const sec = SECTION.stones;
  const c = LANES[sec.lane];
  return sec.stones.map((b, n) => ({ a: c, b, r: sec.stone.r, y: stoneHeight(sec, t, n, L.speed) }));
}

/** Is (a, b) on the floor that zaps? */
export function onZapFloor(a, b) {
  const sec = SECTION.stones;
  const c = LANES[sec.lane];
  return Math.abs(a - c) < LANE_HALF && b > sec.floor[0] && b < sec.floor[1];
}

/** The ground under (a, b) at `t`: the highest stone covering it, or the floor. */
export function groundAt(L, a, b, t) {
  let g = 0;
  if (Math.abs(a - LANES[SECTION.stones.lane]) < LANE_HALF) {
    for (const s of stones(L, t)) if (Math.hypot(a - s.a, b - s.b) <= s.r && s.y > g) g = s.y;
  }
  return g;
}

/* ------------------------------- her route ------------------------------- */

const SEGS = (() => {
  const out = [];
  let s = 0;
  for (let i = 1; i < PATH.length; i++) {
    const [a0, b0] = PATH[i - 1];
    const [a1, b1] = PATH[i];
    const len = Math.hypot(a1 - a0, b1 - b0);
    out.push({ a0, b0, a1, b1, len, s0: s });
    s += len;
  }
  return out;
})();
export const PATH_LEN = SEGS.at(-1).s0 + SEGS.at(-1).len;

/** The point `s` along her route. */
export function pathAt(s) {
  const k = Math.max(0, Math.min(PATH_LEN, s));
  const g = SEGS.find((q) => k <= q.s0 + q.len + 1e-9) ?? SEGS.at(-1);
  const u = g.len ? (k - g.s0) / g.len : 0;
  return { a: g.a0 + (g.a1 - g.a0) * u, b: g.b0 + (g.b1 - g.b0) * u };
}

/** How far along her route (a, b) is: the nearest point on it. A lane's
 *  walls stand halfway between lane middles, so the nearest leg is always
 *  the lane she is in. */
export function pathS(a, b) {
  let best = null;
  for (const g of SEGS) {
    const da = g.a1 - g.a0; const db = g.b1 - g.b0;
    const u = Math.max(0, Math.min(1, ((a - g.a0) * da + (b - g.b0) * db) / (g.len * g.len || 1)));
    const d = Math.hypot(a - (g.a0 + da * u), b - (g.b0 + db * u));
    if (!best || d < best.d) best = { d, s: g.s0 + g.len * u };
  }
  return best.s;
}

/** Each checkpoint's distance along the route, and the finish line's. */
export const CP_S = SECTIONS.map((sec) => pathS(LANES[sec.lane], sec.cp));
export const FINISH_S = pathS(LANES[2], FINISH_B);

/** The checkpoint she has earned, having got as far as `sMax`. */
export function checkpointFor(sMax) {
  let k = 0;
  for (let i = 0; i < CP_S.length; i++) if (sMax >= CP_S[i] - 0.25) k = i;
  return k;
}

/* --------------------------------- a hit --------------------------------- */

const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/** Would a body standing at (a, b) with its feet at `feet` be hit at `t`?
 *  The laser's own test (`Laser.distTo` < thick + 0.45), and the zap floor. */
export function hitAt(L, a, b, feet, t, { height = 2.6, list = null } = {}) {
  const bs = list ?? beams(L, t);
  _p0.set(a, feet + 0.2, b);
  _p1.set(a, feet + height * 0.85, b);
  for (const q of bs) {
    if (Math.min(q.b0, q.b1) > b + 6 || Math.max(q.b0, q.b1) < b - 6) continue;
    if (Math.min(q.a0, q.a1) > a + 6 || Math.max(q.a0, q.a1) < a - 6) continue;
    _a.set(q.a0, q.y0, q.b0);
    _b.set(q.a1, q.y1, q.b1);
    if (segSegDist(_a, _b, _p0, _p1) < q.thick + BODY_R) return q.sec;
  }
  if (feet < 0.08 && onZapFloor(a, b) && groundAt(L, a, b, t) < 0.08) return 'stones';
  return null;
}

/* ------------------------------ the stars ------------------------------- */

/**
 * THE FASTEST CLEAN RUN, by search — where the star bands come from.
 *
 * A raw kitten (no orbs, no clan: what the course takes off her) down the
 * middle of her route, who may SPRINT (17 u/s), stand still, or hop (11.2 up,
 * gravity 26 — player.js's own numbers, read by world-check) at full, half or
 * no forward speed. Every step is tested with `hitAt`, the same beams the
 * game draws. A stone carries her while she stands on it; the zap floor is
 * never touched.
 *
 * It is the BEST case, not the typical one: the centre line, perfect timing,
 * and no double jump (which only adds ways through). Bands are set above it.
 *
 * @returns {number|null} seconds from GO to the finish line, or null if
 *          there is no way through within `tMax`.
 */
export function fastestRun(L, { v = 17, dt = 1 / 30, jumpV = 11.2, gravity = 26, height = 2.6, tMax = 120 } = {}) {
  const ds = v * dt;
  const N = Math.ceil(PATH_LEN / ds) + 1;
  const goal = Math.ceil(FINISH_S / ds);
  const pts = Array.from({ length: N }, (_, i) => pathAt(i * ds));
  const steps = Math.ceil(tMax / dt);
  const hopT = (2 * jumpV) / gravity + 0.4;
  const W = Math.ceil(hopT / dt) + 2;
  const future = Array.from({ length: W }, () => new Uint8Array(N));
  let now = new Uint8Array(N);
  now[0] = 1;
  let front = 0;
  const near = (i) => {
    // Hops are only worth trying where something is in the way.
    const b = pts[i].b; const a = pts[i].a;
    for (const sec of SECTIONS) {
      if (Math.abs(a - LANES[sec.lane]) > LANE_HALF) continue;
      const zs = [...(sec.bars ?? []), ...(sec.stones ?? []), ...(sec.curtains ?? [])];
      if (sec.floor) zs.push(...sec.floor);
      if (sec.arm) zs.push(sec.pivot - sec.arm.R, sec.pivot, sec.pivot + sec.arm.R);
      if (zs.some((z) => Math.abs(z - b) < 5)) return true;
    }
    return false;
  };
  const hopFrom = pts.map((_, i) => near(i));
  const cache = new Map();
  const listAt = (kk) => {
    let v = cache.get(kk);
    if (!v) { v = beams(L, kk * dt); cache.set(kk, v); }
    return v;
  };
  for (let k = 0; k < steps; k++) {
    const t = k * dt;
    const t1 = t + dt;
    cache.delete(k - 1);
    const list1 = listAt(k + 1);
    const slot = future[(k + 1) % W];
    const next = slot;
    // Landings that were due this step are already in `slot`.
    for (let i = Math.max(0, front - Math.ceil(30 / ds)); i <= Math.min(N - 1, front); i++) {
      if (!now[i]) continue;
      const g0 = groundAt(L, pts[i].a, pts[i].b, t);
      for (const j of [i, i + 1, i - 1]) {
        if (j < 0 || j >= N || next[j]) continue;
        const g = groundAt(L, pts[j].a, pts[j].b, t1);
        if (g - g0 > 0.4) continue;            // a riser she cannot step up
        if (hitAt(L, pts[j].a, pts[j].b, g, t1, { height, list: list1 })) continue;
        next[j] = 1;
      }
      if (!hopFrom[i]) continue;
      for (const u of [1, 0.5, 0]) {
        let y = g0; let vy = jumpV; let si = i; let ok = true;
        for (let m = 1; m * dt < hopT; m++) {
          const tm = t + m * dt;
          vy -= gravity * dt;
          y += vy * dt;
          const sj = Math.min(N - 1, Math.round(i + u * m));
          if (sj !== si) si = sj;
          const p = pts[si];
          const g = groundAt(L, p.a, p.b, tm);
          const lm = listAt(k + m);
          if (vy < 0 && y <= g) {
            if (hitAt(L, p.a, p.b, g, tm, { height, list: lm })) { ok = false; break; }
            const at = future[(k + m) % W];
            if (m === 1) next[si] = 1; else at[si] = 1;
            break;
          }
          if (hitAt(L, p.a, p.b, Math.max(y, g), tm, { height, list: lm })) { ok = false; break; }
        }
        if (!ok) continue;
      }
    }
    now.fill(0);
    const prev = now;
    now = next;
    future[(k + 1) % W] = prev;
    for (let i = N - 1; i > front; i--) if (now[i]) { front = i; break; }
    if (now[goal] || front >= goal) return +(t1).toFixed(2);
  }
  return null;
}

/** Stars per level: [one, two, three], seconds, lower is better.
 *
 *  MEASURED, off a kitten who WALKS (10.5 u/s) and hops perfectly down the
 *  middle — `fastestRun(L, { v: 10.5 })` — L1 13.0s, L2 13.6s, L3 13.1s.
 *  Three stars is 1.5x that and two is 3x: a sprinter (17 u/s, 8.0-10.3s
 *  by the same search) has room to spare for three, and a nine-year-old who
 *  walks it and gets zapped twice still earns two. One star is finishing
 *  inside the clock. world-check re-runs the search and holds 3★ between
 *  1.4x and 1.6x of the walker, and 2★ at 2.5x or more. Nobody gets through
 *  WITHOUT hopping — the same search with no jump never finishes, which is
 *  the stones doing their job. */
export const COURSE_BANDS = [[150, 39, 19.5], [150, 40, 20], [150, 39, 19.5]];
/** The clock: at this, the run ends where she got to. */
export const COURSE_TIME = 150;
