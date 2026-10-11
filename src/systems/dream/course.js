import * as THREE from 'three';
import { segSegDist } from './targets.js';

/* ---------------------------------------------------------------------------
   THE SINE GAUNTLET'S COURSE — the numbers, and nothing that draws.

   Richard, the first time: "rather than making 4 separate lanes for each
   player, it may be better to turn this into more of a Ninja Warrior type
   course, with obstacles and different patterns, requiring different
   movements and techniques ... Can have the 4 lanes snake together".

   And the second: "it is too easy to just jump over everything, so I think we
   need to make the middle section longer, take up the entire length of the
   diameter of the circle, and make the jumping portion at least twice as long
   and potentially add 2 or 3 more of the spinning lasers on the ground and
   potentially have one or more in the air that can hit the player when they
   are jumping ... For the first section, since player does not need to move
   left/right much, but just forward and vertically, we can potentially cut
   that section in half so that we can turn it into 2 obstacle lanes they need
   to snake through with harder challenges in the 2nd lane. Same with the
   ending lasers ... keeping the first row or two relatively easy and it gets
   progressively harder. Keep in mind, player has sprint and double jump
   ability ... need to make sure that the lasers go high enough to hit a
   player that double jumps."

   SO THREE 10-WIDE LANES ARE FIVE: the first and the last were cut in half
   (5 wide — those stretches are forward-and-up, not side to side), and the
   middle one kept its width and runs rim to rim across the island:

     0  →  STANDING WAVE    three bars rising and falling together        easy
           TRAVELLING WAVE  three bars whose crest runs the way she does
     ↩
     1  ←  TWIN WAVE        each bar has a twin 5 above it: hop INTO the gap
           COUNTER WAVE     twins again, and the crest runs AT her, faster
     ↪
     2  →  SINE STONES      eight stones over a floor that zaps, half riding a
                            sine and half a cosine, under a SWEEPER IN THE AIR
           THE SWEEPERS     four arms turning on the floor, two pairs
     ↩
     3  ←  SLIDING GAPS     five curtains of light, too tall to jump, whose gap
                            slides as A·sin(ωt)
     ↪
     4  →  FINAL WAVE       six twins, crest at her, fastest of all
           FINISH

   THE DOUBLE JUMP IS WHY THE TWINS EXIST. Her feet top out at 2.41 on one
   jump and 4.20 on two (11.2 up, then 0.86 of it at the apex, gravity 26 —
   player.js's numbers, read by world-check), and every bar on the old course
   was under 3.6: two jumps cleared all of it whatever the waves were doing.
   A twin rides 5 above its bar, so a hop that clears the low one fits under
   the high one, and a double jump into it is a zap. The curtains are 5.9
   tall for the same reason, and the air sweeper turns at 5.6, which is just
   over a kitten standing on the highest stone and right where her head is if
   she hops off one.

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

/** How fast everything moves, per level. The waves keep their shapes.
 *
 *  L4 IS 秘 EXTRA HARD. Richard: "just for fun, lets make an 'Extra hard'
 *  difficulty that can be unlocked if the player beats the 'Hard' difficulty
 *  level with 3 stars ... designed to be near impossible to beat unless the
 *  player does everything perfectly." So it is faster than L3 again AND
 *  `restart`: a zap is back to the START, not the last checkpoint. It is
 *  never somebody's tier — only picked, once it is open (`extraOpen` in
 *  sine.js) — and world-check holds that a kitten who sprints and hops
 *  perfectly can still finish it. */
export const LEVELS = [
  { speed: 0.8 },
  { speed: 1.0 },
  { speed: 1.3 },
  { speed: 1.55, extra: true, restart: true },
];
/** The index of 秘 EXTRA HARD, and of the level that opens it with three stars. */
export const EXTRA_L = 3;
export const HARD_L = 2;

/** The five lanes' middles (a) and half-widths. Edge to edge they tile
 *  a −17 to 13 exactly: 5 + 5 + 10 + 5 + 5. */
export const LANES = [-14.5, -9.5, -2, 5.5, 10.5];
export const HALVES = [2.5, 2.5, 5, 2.5, 2.5];
/** The widest lane's half — the middle one. */
export const LANE_HALF = 5;
export const halfOf = (k) => HALVES[k] ?? LANE_HALF;
/** The course's own box: across (a) and along (b). */
export const COURSE_A = [-17, 13];
export const END_B = 24;
/** Each lane's ends, MEASURED against the island's rim (r 26, every wall post
 *  inside 25.8 — world-check's every-post-on-the-island test): the outer
 *  corners are where it runs out, so the first lane is the shortest
 *  (−17, ±19.3 is 25.72 out) and the middle one runs rim to rim, ±24
 *  (−7, ±24 is 25.0 out: within 1.1 of the edge at both ends). */
export const SPANS = [[-19.3, 19.3], [-22, 19.3], [-24, 24], [-22, 24], [-22, 22]];
/** How long a U-turn's opening is, at the end of a dividing wall. */
export const TURN = 4.3;
/** Which end each lane turns into the next at: +1 the +b end, −1 the −b end. */
const TURNS = [1, -1, 1, -1];
const turnB = (k) => (TURNS[k] > 0 ? Math.min(SPANS[k][1], SPANS[k + 1][1]) - TURN / 2 : Math.max(SPANS[k][0], SPANS[k + 1][0]) + TURN / 2);

/** The walls, as segments in (a, b): the outside, a stepped cap at each end
 *  (the lanes are different lengths), and a divider between each pair of
 *  lanes that stops short at ONE end, which is the turn. */
export const DIVIDERS = LANES.slice(0, -1).map((c, k) => {
  const a = c + HALVES[k];
  const lo = Math.min(SPANS[k][0], SPANS[k + 1][0]);
  const hi = Math.max(SPANS[k][1], SPANS[k + 1][1]);
  return TURNS[k] > 0 ? [[a, lo], [a, Math.min(SPANS[k][1], SPANS[k + 1][1]) - TURN]]
    : [[a, Math.max(SPANS[k][0], SPANS[k + 1][0]) + TURN], [a, hi]];
});
/** Where two lanes that turn into each other end at different places, the
 *  step between their ends beyond the turn — the middle lane runs on past the
 *  turn into it, to the rim, and this is the wall beside that last bit. */
export const STEPS = LANES.slice(0, -1).flatMap((c, k) => {
  const a = c + HALVES[k];
  const [e0, e1] = TURNS[k] > 0 ? [SPANS[k][1], SPANS[k + 1][1]] : [SPANS[k][0], SPANS[k + 1][0]];
  return e0 === e1 ? [] : [[[a, e0], [a, e1]]];
});
export const WALLS = [
  [[COURSE_A[0], SPANS[0][0]], [COURSE_A[0], SPANS[0][1]]],
  [[COURSE_A[1], SPANS[4][0]], [COURSE_A[1], SPANS[4][1]]],
  ...LANES.map((c, k) => [[c - HALVES[k], SPANS[k][1]], [c + HALVES[k], SPANS[k][1]]]),
  ...LANES.map((c, k) => [[c - HALVES[k], SPANS[k][0]], [c + HALVES[k], SPANS[k][0]]]),
  ...DIVIDERS,
  ...STEPS,
];
export const FINISH_B = 18;
/** Her route down the middle of it, start spot to finish line. */
export const START = { a: LANES[0], b: -17.5 };
export const START_LINE = -15.5;
export const PATH = [[LANES[0], START.b]];
LANES.forEach((c, k) => {
  if (k < LANES.length - 1) PATH.push([c, turnB(k)], [LANES[k + 1], turnB(k)]);
  else PATH.push([c, FINISH_B]);
});

/** Which lane `a` is in (the nearest, outside the box). */
export function laneOf(a) {
  for (let k = 0; k < LANES.length; k++) if (a <= LANES[k] + HALVES[k]) return k;
  return LANES.length - 1;
}

/** The stretches, in the order she meets them. `cp` is the checkpoint a zap
 *  sends her back to (in her lane, at that b). Bars are listed in the order
 *  she reaches them, so `n` counts the way she runs. `twin` is the height of
 *  a bar's twin above it. */
const GAUNTLET = [
  { key: 'stand', name: 'STANDING WAVE', lane: 0, cp: START.b, bars: [-11, -6.5, -2], wave: { A: 1.6, C: 2.0, w: 1.6, k: 0 } },
  { key: 'travel', name: 'TRAVELLING WAVE', lane: 0, cp: 1.5, bars: [5, 9, 13], wave: { A: 1.6, C: 2.0, w: 1.8, k: 0.8 } },
  { key: 'twin', name: 'TWIN WAVE', lane: 1, cp: 15.6, bars: [11, 6.5, 2], twin: 5, wave: { A: 1.6, C: 2.0, w: 1.8, k: 0.6 } },
  { key: 'counter', name: 'COUNTER WAVE', lane: 1, cp: -1.5, bars: [-5, -9.5, -14], twin: 5, wave: { A: 1.7, C: 2.0, w: 2.2, k: -0.9 } },
  { key: 'stones', name: 'SINE STONES', lane: 2, cp: -19.6,
    stones: [-15.8, -12.4, -9, -5.6, -2.2, 1.2, 4.6, 8], floor: [-17.8, 10.3],
    stone: { H: 1.3, A: 1.0, w: 1.4, k: 1.1, r: 1.5 },
    air: { a: 0, b: -3.8, R: 4.6, y: 5.6, w: 0.9, ph: 0 } },
  { key: 'sweep', name: 'THE SWEEPERS', lane: 2, cp: 11,
    arms: [
      { a: -2.5, b: 14.2, R: 2.2, y: 0.9, w: 1.5, ph: 0 },
      { a: 2.5, b: 14.2, R: 2.2, y: 0.9, w: -1.5, ph: Math.PI },
      { a: -2.5, b: 18.8, R: 2.2, y: 0.9, w: -1.7, ph: Math.PI / 2 },
      { a: 2.5, b: 18.8, R: 2.2, y: 0.9, w: 1.7, ph: -Math.PI / 2 },
    ] },
  { key: 'gaps', name: 'SLIDING GAPS', lane: 3, cp: 20.4, curtains: [14, 8, 2, -4, -10],
    gap: { half: 1.25, A: 1.0, w: 1.2, ph: [0, 1.9, 3.8, 5.7, 1.0] }, beams: [0.5, 1.4, 2.3, 3.2, 4.1, 5.0, 5.9] },
  { key: 'final', name: 'FINAL WAVE', lane: 4, cp: -19.2, bars: [-14, -9.5, -5, -0.5, 4, 8.5], twin: 5,
    wave: { A: 1.7, C: 2.0, w: 2.4, k: -0.9 } },
];

/* THE RIPPLE — the easy one. Richard: "add in 2 more extra courses, maybe an
   easier course and a harder course". The same eight stretches in the same
   lanes, so every wall, checkpoint and turn is the Gauntlet's and only the
   things that zap change: fewer bars on gentler waves, bigger and calmer
   stones, two sweepers instead of four, three curtains with wide gaps, and a
   final wave of three. */
const RIPPLE = [
  { key: 'stand', name: 'LITTLE WAVE', lane: 0, cp: START.b, bars: [-9, -2], wave: { A: 1.2, C: 1.9, w: 1.3, k: 0 } },
  { key: 'travel', name: 'ROLLING WAVE', lane: 0, cp: 1.5, bars: [6, 12], wave: { A: 1.2, C: 1.9, w: 1.4, k: 0.8 } },
  { key: 'twin', name: 'TWIN RIPPLE', lane: 1, cp: 15.6, bars: [10, 3], twin: 5.4, wave: { A: 1.2, C: 1.9, w: 1.4, k: 0.6 } },
  { key: 'counter', name: 'BACK RIPPLE', lane: 1, cp: -1.5, bars: [-6, -13], twin: 5.4, wave: { A: 1.3, C: 1.9, w: 1.6, k: -0.9 } },
  { key: 'stones', name: 'STEPPING STONES', lane: 2, cp: -19.6,
    stones: [-15.8, -12.4, -9, -5.6, -2.2, 1.2, 4.6, 8], floor: [-17.8, 10.3],
    stone: { H: 1.2, A: 0.6, w: 1.1, k: 1.1, r: 1.8 },
    air: { a: 0, b: -3.8, R: 4.6, y: 5.6, w: 0.6, ph: 0 } },
  { key: 'sweep', name: 'TWO SWEEPERS', lane: 2, cp: 11,
    arms: [
      { a: 0, b: 14.2, R: 2.2, y: 0.9, w: 1.1, ph: 0 },
      { a: 0, b: 18.8, R: 2.2, y: 0.9, w: -1.1, ph: Math.PI / 2 },
    ] },
  { key: 'gaps', name: 'WIDE GAPS', lane: 3, cp: 20.4, curtains: [12, 3, -6],
    gap: { half: 1.6, A: 0.8, w: 0.9, ph: [0, 2.1, 4.2] }, beams: [0.5, 1.4, 2.3, 3.2, 4.1, 5.0, 5.9] },
  { key: 'final', name: 'LAST RIPPLE', lane: 4, cp: -19.2, bars: [-12, -4, 4], twin: 5.4,
    wave: { A: 1.3, C: 1.9, w: 1.6, k: -0.9 } },
];

/* THE RIPTIDE — the hard one. "We can make it so that there are less
   platforms to jump on with the 'ground is lava' and maybe have the platforms
   moving in different directions as well to make it more challenging."
   SIX STONES, NOT EIGHT, AND EACH ONE GOES ROUND A CIRCLE: up and down by
   A·sin θ as before, and across the lane by `slide`·cos θ — so a stone is a
   point going round the unit circle, stood on its edge across her lane, and
   the sine stones and the cosine stones are going round a quarter-turn apart.
   Which is why the camera goes BEHIND her for them (sine.js `_shoulder`):
   "if we make the platforms move left and right, not just up and down, then
   we need to have the camera go behind the player". Everything else is the
   Gauntlet tightened: more bars, faster crests, curtains with narrow gaps. */
const RIPTIDE = [
  { key: 'stand', name: 'STANDING WAVE', lane: 0, cp: START.b, bars: [-12, -8, -4, 0], wave: { A: 1.7, C: 2.0, w: 1.9, k: 0 } },
  { key: 'travel', name: 'TRAVELLING WAVE', lane: 0, cp: 1.5, bars: [5, 8.5, 12, 15.5], wave: { A: 1.7, C: 2.0, w: 2.0, k: 0.9 } },
  { key: 'twin', name: 'TWIN WAVE', lane: 1, cp: 15.6, bars: [11, 7, 3], twin: 4.8, wave: { A: 1.6, C: 2.0, w: 2.0, k: 0.7 } },
  { key: 'counter', name: 'COUNTER WAVE', lane: 1, cp: -1.5, bars: [-5, -8.5, -12, -15.5], twin: 4.8, wave: { A: 1.7, C: 2.0, w: 2.4, k: -1.0 } },
  { key: 'stones', name: 'CIRCLING STONES', lane: 2, cp: -19.6,
    stones: [-15.6, -10.8, -6, -1.2, 3.6, 8.4], floor: [-17.8, 10.3],
    stone: { H: 1.4, A: 0.9, w: 1.1, k: 1.3, r: 1.7, slide: 2.0 },
    air: { a: 0, b: -3.8, R: 4.6, y: 5.6, w: 1.0, ph: 0 } },
  { key: 'sweep', name: 'THE SWEEPERS', lane: 2, cp: 11,
    arms: [
      { a: -2.5, b: 14.2, R: 2.2, y: 0.9, w: 1.8, ph: 0 },
      { a: 2.5, b: 14.2, R: 2.2, y: 0.9, w: -1.8, ph: Math.PI },
      { a: -2.5, b: 18.8, R: 2.2, y: 0.9, w: -2.0, ph: Math.PI / 2 },
      { a: 2.5, b: 18.8, R: 2.2, y: 0.9, w: 2.0, ph: -Math.PI / 2 },
    ] },
  { key: 'gaps', name: 'NARROW GAPS', lane: 3, cp: 20.4, curtains: [15, 10, 5, 0, -5, -10],
    gap: { half: 1.05, A: 1.1, w: 1.4, ph: [0, 1.6, 3.2, 4.8, 0.8, 2.4] }, beams: [0.5, 1.4, 2.3, 3.2, 4.1, 5.0, 5.9] },
  { key: 'final', name: 'FINAL WAVE', lane: 4, cp: -19.2, bars: [-15, -11, -7, -3, 1, 5, 9], twin: 4.8,
    wave: { A: 1.8, C: 2.0, w: 2.6, k: -1.0 } },
];

/**
 * THE THREE COURSES, easiest first — the order the picker cycles them in.
 * `ids(n)` is the progress key a level's stars go under: the Gauntlet keeps
 * the keys it always had (`sine.L1`...), so a save from before there were
 * three still has its stars on the course they were won on.
 * `bands` are per level, [one, two, three] seconds — see COURSE_BANDS and
 * `useCourse`. Measured 2026-10-11 (walker / sprinter, seconds):
 *   ripple    L1 23.63/16.77  L2 23.27/16.03  L3 22.10/15.53  L4 22.43/14.23
 *   gauntlet  L1 26.90/19.70  L2 26.63/18.57  L3 25.87/16.63  L4 23.60/14.33
 *   riptide   L1 28.63/22.83  L2 27.80/23.27  L3 25.50/19.93  L4 25.33/16.60
 * and on every one of the twelve, nobody gets through without hopping.
 */
export const COURSES = [
  { id: 'ripple', name: 'THE RIPPLE', kanji: '小波', blurb: 'the easy one: fewer beams, calmer stones', sections: RIPPLE,
    bands: [[240, 70.9, 35.4], [240, 69.8, 34.9], [240, 66.3, 33.2], [240, 19.9, 15.7]] },
  { id: 'gauntlet', name: 'THE GAUNTLET', kanji: '正弦', blurb: 'the course: eight obstacles to the gold line', sections: GAUNTLET,
    bands: [[240, 81, 40.5], [240, 80, 40], [240, 78, 39], [240, 20.1, 15.8]] },
  { id: 'riptide', name: 'THE RIPTIDE', kanji: '激流', blurb: 'the hard one: six stones that go round in circles', sections: RIPTIDE,
    bands: [[240, 85.9, 42.9], [240, 83.4, 41.7], [240, 76.5, 38.3], [240, 23.2, 18.3]] },
];
export const courseById = (id) => COURSES.find((c) => c.id === id) ?? null;
/** Where a level's stars go: see COURSES. */
export const starsId = (course, n) => (course === 'gauntlet' ? `sine.L${n + 1}` : `sine.${course}.L${n + 1}`);

/* THE COURSE BEING RUN — LIVE BINDINGS. Everything below reads these, and
   `useCourse` reassigns them, so sine.js (which imports them) and the checks
   see the swap without either being handed a course. One course is laid on
   the island at a time, which is the only reason this can be module state. */
export let COURSE_ID = 'gauntlet';
export let SECTIONS = GAUNTLET;
export let SECTION = {};
/** Every turning arm on the course — the ones on the floor and the one in the
 *  air over the stones — with its pivot worked out in island coordinates.
 *  The AIR one is the one whose cos and sin are drawn on the floor. */
export let ARMS = [];
export let MATH_ARM = null;

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

/** Bar `n` now, worked: the angle in degrees and the height it makes — and,
 *  for a twin, the gap between the two. */
export function barWorking(wave, t, n, speed = 1, twin = 0) {
  const y = barHeight(wave, t, n, speed);
  const rad = wave.w * speed * t - wave.k * n;
  const deg = ((Math.round((rad * 180) / Math.PI) % 360) + 360) % 360;
  const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
  const word = y >= UNDER ? 'WALK UNDER' : y <= JUMPABLE ? (twin ? 'HOP INTO THE GAP' : 'JUMP IT') : 'WAIT…';
  const text = `bar ${n + 1}: ${f1(wave.C)} + ${f1(wave.A)}·sin(${deg}°) = ${y.toFixed(2)}`;
  return { y, deg, word, text: twin ? `${text}   twin ${(y + twin).toFixed(1)}` : text };
}

/** Stone `n`'s top, above the floor. The even ones ride a SINE and the odd
 *  ones a COSINE of the same angle — a quarter-turn ahead, which is the whole
 *  difference between the two, and the colours on the floor say which. */
export const stoneIsCos = (n) => n % 2 === 1;
export function stoneHeight(sec, t, n, speed = 1) {
  const s = sec.stone;
  const th = s.w * speed * t - s.k * n;
  return s.H + s.A * (stoneIsCos(n) ? Math.cos(th) : Math.sin(th));
}

/** Stone `n`'s offset ACROSS the lane (a), for a course whose stones slide
 *  (`stone.slide`, the Riptide). The cos of the same angle whose sin is its
 *  height — so the stone goes round a circle on its edge — and for a cosine
 *  stone, the angle a quarter-turn on, the same as its height. 0 on a course
 *  whose stones only bob. */
export function stoneSlide(sec, t, n, speed = 1) {
  const s = sec.stone;
  if (!s.slide) return 0;
  const th = s.w * speed * t - s.k * n + (stoneIsCos(n) ? Math.PI / 2 : 0);
  return s.slide * Math.cos(th);
}

/** An arm's angle, and its two ends — (R·cos θ, R·sin θ) about the pivot,
 *  and the opposite point. `a` is the cos, `b` the sin. */
export function sweepAngle(arm, t, speed = 1) { return arm.w * speed * t + (arm.ph ?? 0); }
export function sweepEnds(arm, t, speed = 1) {
  const th = sweepAngle(arm, t, speed);
  const R = arm.R;
  return {
    th,
    p: { a: arm.pa + R * Math.cos(th), b: arm.pb + R * Math.sin(th) },
    q: { a: arm.pa - R * Math.cos(th), b: arm.pb - R * Math.sin(th) },
  };
}

/** Where curtain `i`'s gap is centred, across her lane. */
export function gapCentre(sec, t, i, speed = 1) {
  const g = sec.gap;
  return LANES[sec.lane] + g.A * Math.sin(g.w * speed * t + g.ph[i]);
}

/**
 * EVERY BEAM ON THE COURSE AT RUN TIME `t`, in island coordinates — the bars
 * and their twins, the arms and the curtains, in a fixed order and a fixed
 * number, so the game can hold one Laser per entry and only move them.
 * `high` marks a twin: the beam that is there for the double jump.
 */
export function beams(L, t) {
  const sp = L.speed;
  const out = [];
  for (const sec of SECTIONS) {
    const c = LANES[sec.lane];
    const h = HALVES[sec.lane];
    if (sec.bars) {
      sec.bars.forEach((b, n) => {
        const y = barHeight(sec.wave, t, n, sp);
        out.push({ sec: sec.key, n, a0: c - h + 0.05, b0: b, y0: y, a1: c + h - 0.05, b1: b, y1: y, thick: BAR_THICK });
        if (sec.twin) out.push({ sec: sec.key, n, high: true, a0: c - h + 0.05, b0: b, y0: y + sec.twin, a1: c + h - 0.05, b1: b, y1: y + sec.twin, thick: BAR_THICK });
      });
    }
    for (const arm of ARMS) {
      if ((arm.sec === 'air' ? 'stones' : 'sweep') !== sec.key) continue;
      const e = sweepEnds(arm, t, sp);
      out.push({ sec: arm.sec === 'air' ? 'air' : 'sweep', n: ARMS.indexOf(arm), high: arm.sec === 'air',
        a0: e.q.a, b0: e.q.b, y0: arm.y, a1: e.p.a, b1: e.p.b, y1: arm.y, thick: BAR_THICK });
    }
    if (sec.curtains) {
      sec.curtains.forEach((b, i) => {
        const g = gapCentre(sec, t, i, sp);
        for (const y of sec.beams) {
          out.push({ sec: sec.key, n: i, a0: c - h + 0.05, b0: b, y0: y, a1: g - sec.gap.half, b1: b, y1: y, thick: BAR_THICK });
          out.push({ sec: sec.key, n: i, a0: g + sec.gap.half, b0: b, y0: y, a1: c + h - 0.05, b1: b, y1: y, thick: BAR_THICK });
        }
      });
    }
  }
  return out;
}

/** The stones' tops at `t`: { a, b, r, y, cos } each. */
export function stones(L, t) {
  const sec = SECTION.stones;
  const c = LANES[sec.lane];
  return sec.stones.map((b, n) => ({ a: c + stoneSlide(sec, t, n, L.speed), b, r: sec.stone.r, y: stoneHeight(sec, t, n, L.speed), cos: stoneIsCos(n) }));
}

/** Is (a, b) on the floor that zaps? */
export function onZapFloor(a, b) {
  const sec = SECTION.stones;
  const c = LANES[sec.lane];
  return Math.abs(a - c) < HALVES[sec.lane] && b > sec.floor[0] && b < sec.floor[1];
}

/** The ground under (a, b) at `t`: the highest stone covering it, or the floor. */
export function groundAt(L, a, b, t) {
  let g = 0;
  if (Math.abs(a - LANES[SECTION.stones.lane]) < HALVES[SECTION.stones.lane]) {
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

/** How far along her route (a, b) is: the nearest point on it AMONG THE LEGS
 *  THAT RUN THROUGH HER LANE — her lane's own leg and the turns at its ends.
 *
 *  NOT simply the nearest leg. That was right when every lane was 10 wide and
 *  every wall stood halfway between two lane middles; with a 5-wide lane next
 *  to the 10-wide one, a kitten 0.5 inside the wide lane is 3 from the narrow
 *  lane's middle and 4.5 from her own, and the nearest leg would have put her
 *  a whole lane back (or on). The wall decides the lane, and the lane decides
 *  the leg. */
export function pathS(a, b) {
  const k = laneOf(a);
  const lo = LANES[k] - HALVES[k] - 1e-6; const hi = LANES[k] + HALVES[k] + 1e-6;
  let best = null;
  for (const g of SEGS) {
    if (Math.max(g.a0, g.a1) < lo || Math.min(g.a0, g.a1) > hi) continue;
    const da = g.a1 - g.a0; const db = g.b1 - g.b0;
    const u = Math.max(0, Math.min(1, ((a - g.a0) * da + (b - g.b0) * db) / (g.len * g.len || 1)));
    const d = Math.hypot(a - (g.a0 + da * u), b - (g.b0 + db * u));
    if (!best || d < best.d) best = { d, s: g.s0 + g.len * u };
  }
  return best.s;
}

/** Each checkpoint's distance along the route (`useCourse` sets it), and the finish line's. */
export let CP_S = [];
export const FINISH_S = pathS(LANES[LANES.length - 1], FINISH_B);

/** The checkpoint she has earned, having got as far as `sMax`. */
export function checkpointFor(sMax) {
  let k = 0;
  for (let i = 0; i < CP_S.length; i++) if (sMax >= CP_S[i] - 0.25) k = i;
  return k;
}

/**
 * HOW FAR SHE HAS GOT, given how far she had got and where she is now.
 *
 * Richard: "I seemed to have somehow skipped over a checkpoint when doing the
 * gauntlet and wasn't able to complete it when I got to the finish line ...
 * we need to make sure it's impossible to skip a checkpoint and that finishing
 * should still work even if one is skipped."
 *
 * THE OLD RULE took a new position only if it was within 6 of the last one —
 * meant to stop a hop over a wall counting, and what actually happened was
 * that ONE big step (a frame hitch, a nearest-leg mix-up at a turn) left her
 * further than 6 ahead of her own record, every later frame was further
 * still, and the record never moved again: the finish line asked for a
 * distance she could no longer be credited with.
 *
 * NOW: any step forward counts, however big, as long as it does not carry
 * her past the checkpoint AFTER the next one — she may be anywhere in her
 * section or the next, which a hitch can reach and a hop over a wall
 * cannot. A step that WOULD skip a checkpoint is answered `skip`, and the
 * course puts her back at the one she missed (sine.js) — so no checkpoint is
 * ever skipped, and the run can always still be finished.
 *
 * @returns {{ sMax: number, cp: number, skip: number|null }}
 */
export function advance(sMax, s) {
  const cp = checkpointFor(sMax);
  const limit = cp + 2 < CP_S.length ? CP_S[cp + 2] - 0.25 : Infinity;
  if (s >= limit) return { sMax, cp, skip: cp + 1 };
  const m = Math.max(sMax, s);
  return { sMax: m, cp: checkpointFor(m), skip: null };
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
  /* FEET ON THE RED FLOOR IS A ZAP, whatever is over her. It used to ask
     `groundAt` too, which is the highest stone COVERING (a, b) — so a kitten
     who had dropped onto the floor under a stone's edge was "on the stone"
     and could stand in the lava for as long as she liked. Richard: "if the
     player falls on the 'lava' lazers under the floating platforms, they will
     be invulnerable while touching the ground." A stone's top never comes
     lower than H − A (0.3), so feet this low are never on one. */
  if (feet < 0.08 && onZapFloor(a, b)) return 'stones';
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
 * `back` is how far behind the furthest point reached it still keeps
 * stepping. Every point behind it is reachable (she can always stand still)
 * but no fastest run waits further back than a section: 30, 12, 8 and 5 all
 * gave the same nine times to the hundredth but one (5 lost L3's sprint by
 * 0.27s), at 4.5s, 1.9s, 1.3s and 0.8s a level. The course doubled and so
 * did this; 8 is the cheapest that changes nothing.
 *
 * @returns {number|null} seconds from GO to the finish line, or null if
 *          there is no way through within `tMax`.
 */
export function fastestRun(L, { v = 17, dt = 1 / 30, jumpV = 11.2, gravity = 26, height = 2.6, tMax = 120, back = 8 } = {}) {
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
      if (Math.abs(a - LANES[sec.lane]) > HALVES[sec.lane]) continue;
      const zs = [...(sec.bars ?? []), ...(sec.stones ?? []), ...(sec.curtains ?? [])];
      if (sec.floor) zs.push(...sec.floor);
      for (const m of ARMS) if (Math.abs(m.pa - a) < LANE_HALF + m.R) zs.push(m.pb - m.R, m.pb, m.pb + m.R);
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
    for (let i = Math.max(0, front - Math.ceil(back / ds)); i <= Math.min(N - 1, front); i++) {
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
 *  middle — `fastestRun(L, { v: 10.5 })` — L1 26.9s, L2 26.6s, L3 25.9s on
 *  the doubled course (13.0 / 13.6 / 13.1 on the old one). Three stars is 1.5x
 *  that and two is 3x: a sprinter (17 u/s, 19.7 / 18.6 / 16.6s by the same
 *  search) has room to spare for three, and a nine-year-old who walks it and
 *  gets zapped a few times still earns two. One star is finishing inside the
 *  clock. world-check re-runs the search and holds 3★ between 1.4x and 1.6x
 *  of the walker, and 2★ at 2.5x or more. Nobody gets through WITHOUT
 *  hopping — the same search with no jump never finishes, which is the
 *  stones doing their job. */
export let COURSE_BANDS = COURSES[1].bands;
/** The clock: at this, the run ends where she got to. Doubled with the course. */
export const COURSE_TIME = 240;

/**
 * LAY COURSE `id` ON THE ISLAND: every live binding above, from its table.
 * Returns the course, or null for an id that is not one (and changes nothing).
 * THE BANDS OF THE OTHER TWO COURSES ARE MEASURED THE SAME WAY as the
 * Gauntlet's — `fastestRun` per level, 3★ at 1.5x the walker and 2★ at 2.5x —
 * and EXTRA HARD's off the SPRINTER, since it is a level for a kitten doing
 * everything right: 3★ at 1.1x the sprinter and 2★ at 1.4x. world-check
 * re-runs every search and holds every band to it.
 */
export function useCourse(id) {
  const C = courseById(id);
  if (!C) return null;
  COURSE_ID = C.id;
  SECTIONS = C.sections;
  SECTION = Object.fromEntries(SECTIONS.map((s) => [s.key, s]));
  ARMS = [
    { ...SECTION.stones.air, sec: 'air', pa: LANES[SECTION.stones.lane] + SECTION.stones.air.a, pb: SECTION.stones.air.b },
    ...SECTION.sweep.arms.map((m) => ({ ...m, sec: 'sweep', pa: LANES[SECTION.sweep.lane] + m.a, pb: m.b })),
  ];
  MATH_ARM = ARMS[0];
  CP_S = SECTIONS.map((sec) => pathS(LANES[sec.lane], sec.cp));
  COURSE_BANDS = C.bands;
  return C;
}
useCourse('gauntlet');
