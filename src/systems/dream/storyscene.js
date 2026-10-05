import * as THREE from 'three';
import { voicePath } from '../../core/audio.js';
import { SIM } from '../../world/simworld.js';
import { beatOver } from '../cutscene.js';
import { STAGE, isleAt, kataFloorAt } from './tourcast.js';

/* ---------------------------------------------------------------------------
   THE DREAM DOJO'S SCENES — Payne's tour, and Lionheart's two talks.

   One player for three scripts (dream/stories.js). Built on the shrine
   scene's furniture and rules (systems/shrinescene.js) and the arena exit's
   shape (systems/arenaexit.js), because those are the scenes the kids
   already know how to watch and skip:

   · SKIPPED BY ESCAPE OR A PAD'S START, AND NOTHING ELSE (seventh
     non-negotiable). The Game asks `_skipPressed` and calls `skip`.
   · NOTHING HANGS OFF IT FINISHING. Whoever starts it spends it: a talk is
     marked heard in `Approach.lecture` BEFORE `start`, and the tour changes
     nothing at all.
   · THE SHOTS ARE DATA. `shotFor(name, ctx, k)` is pure — a name, the places
     it reads, and how far through the line we are — so world-check can put
     every shot through the real lens and ask whether it frames what it is
     for. Every place has a fallback, so a missing island aims somewhere real
     rather than at NaN.
   · THE TALKS ARE OVER THE SHOULDER. Richard: "camera zoom in on the player
     when they are near Lionheart and have the player looking towards
     Lionheart and camera is behind, over the shoulder, and have Lionheart
     facing the player ... if more than one player is nearby ... then all the
     players are in the cutscene." The kittens are stood on marks in front of
     him (`marks`), facing him; his drawing is front-facing and turns to the
     lens, so from behind them he is facing them.
   · A LINE LASTS AS LONG AS ITS RECORDING, measured off the clip when it has
     loaded, and a reading time when there is none — voice degrades to text
     (ninth non-negotiable).
--------------------------------------------------------------------------- */

/**
 * PAYNE'S TOUR, SCORED — the shot a row opens on, and the piece that starts
 * with it (core/audio.js `tourPayne` and the rest, for why each). A row whose
 * shot is not here keeps the piece already playing. Read by `Game._wantedTrack`
 * through `musicTrack`, which is null for every other scene and outside one.
 * Only the tour: Lionheart's two talks happen in his arcade, under its own
 * `vr`, and are his voice in his room.
 */
export const TOUR_MUSIC = {
  isleWide: 'tourPayne',
  lionClose: 'tourLion',
  simHub: 'vr',
  lionHero: 'tourCreed',
  isleEnd: 'tourPayne',
};

const FADE = 0.5;
/** A black dip at a change of place — the real world to the simulator — and
 *  only there: a cut between two shots of the same island is a cut. */
const DIP = 0.35;
/** Reading time for a line with no recording: a beat per word and a breath. */
const WORDS_PER_S = 2.6;
const TYPE_LEAD = 0.72;
/** How far in front of Lionheart the first kitten stands, and how far apart
 *  her sisters stand beside her. */
export const TALK_GAP = 4.6;
export const MARK_SPREAD = 1.9;

const v3 = (x, y, z) => ({ x, y, z });
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);
const lerpP = (a, b, k) => v3(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k));

/**
 * Where the kittens stand for a talk. The first on the line from Lionheart to
 * the middle of the pad, `TALK_GAP` out; the rest alternately to either side
 * of her on a shallow arc, so all of them face him and nobody hides anybody.
 */
export function marks(lion, padCentre, n) {
  let dx = padCentre.x - lion.x;
  let dz = padCentre.z - lion.z;
  const d = Math.hypot(dx, dz) || 1;
  dx /= d; dz /= d;
  const out = [];
  for (let i = 0; i < n; i++) {
    const side = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2);
    const a = side * (MARK_SPREAD / TALK_GAP);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const rx = dx * ca - dz * sa;
    const rz = dz * ca + dx * sa;
    out.push({ x: lion.x + rx * TALK_GAP, z: lion.z + rz * TALK_GAP, facing: Math.atan2(-rx, -rz) });
  }
  return out;
}

/**
 * THE TOUR'S SIMULATOR LINES PAN THE ISLANDS, ONE PER WORD THAT NAMES ONE.
 *
 * Richard, first: "It would be good if the camera can pan through each of the
 * islands and different activities that there is to do, and likely no need
 * to focus on the Dojo of the Turning Circle unless it is directly mentioned
 * in the dialog". So each line is a list of STOPS, cued on the word that
 * names a place (`word`) at the second that word STARTS (`at`). `world-check`
 * asks that every `word` is in its row's text and every stop in its clip.
 *
 * THE RECUT. Richard, second:
 *   "the transition from seeing the entire map to seeing the Kotodama Gallery
 *   is a jarring and not good transition ... doesn't have the camera do a 180
 *   degrees along y-axis like it currently is doing" — the map's eye circled
 *   OUTSIDE the archipelago looking IN at the hub, and an island's eye stands
 *   INSIDE it looking OUT, so every map -> island swing turned the lens round.
 *   Now the wide frame is told which island comes next (`map.toward`) and
 *   turns so it arrives BEHIND the hub from it: the swing is a dive along one
 *   heading, and the heading changes by under 10 degrees.
 *   "real sword skills ... we should have some bamboo to cut shown" / "In the
 *   Arena School ... animals running around and 4 players fighting" / "show
 *   gameplay for these islands" — the islands were empty floors. The tour now
 *   has a cast (dream/tourcast.js) and these frames are aimed at IT.
 *   "skip showing the Holo-sentries island and keep the camera viewing the
 *   Arena School longer" — the school holds from "how to fight" to the end
 *   of the line, with a slow push.
 *   "For the 'every island is a lesson' section, instead of being so zoomed
 *   out, can just have the camera panning around the center or outskirts of
 *   the islands" — `pan`: an eye on the hub's outskirts looking out, turning
 *   across the ring of islands, and arriving facing the storm.
 *   "When saying 'Timing' we can skip showing the Bamboo Infiltration island
 *   and instead stay on Kudamono Storm longer" — storm from "aim" to "kata".
 *   "For Kata, we can stay on the Kata Trace longer so that we can actually
 *   show Lionheart doing a kata routine ... When it says 'even the maths of
 *   the circle' we can have the camera move around the Kata Trace island so
 *   that the Sine Gauntlet or Turning Circle island is in the background" —
 *   the orbit, which ends with the Sine Gauntlet behind his floor (measured:
 *   it is straight behind at a yaw of ~97 degrees; past ~130 it leaves frame).
 *   "When saying 'earn stars' we can keep showing the kata and then slowly
 *   fade out and when saying 'climb the ranks of kenshi' we can fade in on the
 *   Kenshi card with the Lionheart info on it. Then can fade out and in
 *   quickly at the end before transitioning to the Shadow Lionheart scene."
 *
 * THE STORM TO THE KATA IS A CUT, under a 0.18s dip either side: they are
 * 166 degrees apart round the hub, and any swing between them is the 180
 * this recut exists to remove.
 *
 * THE CUES ARE MEASURED off a 25ms RMS envelope at -30dB, where each word
 * starts (the first table was silencedetect at -35dB and read 0.2-0.6s early,
 * because breath noise filled the pauses):
 *   learn: "In here you learn your" 0.05, Kotodama 1.30, "your clan powers"
 *          2.50, "real sword skills" 4.20, "and how to fight" 6.10, "and you
 *          get a little better" 7.65, "every single day" 9.15; clip 10.82s.
 *   isles: "Every island is a lesson" 0.10, aim 2.55, timing 3.45, kata 4.40,
 *          "even the maths of the circle" 5.70, "Earn stars" 8.27, "and
 *          climb" 9.17, KENSHI ends 11.31; clip 11.58s.
 */
export const TOUR_PANS = {
  simHub: [
    { at: 0, word: 'In here', map: { toward: 'gallery' } },
    // The dive lands on "Kotodama" (1.30 -> 1.95).
    { at: 0.95, word: 'Kotodama', isle: 'gallery', swing: 0.85, blend: 'line', frame: { yaw: 8 } },
    { at: 2.5, word: 'clan powers', isle: 'hall', frame: { yaw: -8 } },
    { at: 4.2, word: 'real sword skills', isle: 'range', frame: { look: [3, 0, 2.2], dist: 17, up: 0.42, drift: 2 } },
    { at: 6.1, word: 'how to fight', isle: 'school', swing: 0.8, frame: { look: [1, 0, 3], dist: 42, up: 0.5, drift: 1.5, push: { to: 0.68, over: 5 } } },
  ],
  simIsles: [
    { at: 0, word: 'Every island', pan: { toward: 'storm' } },
    // Pushes in along the pan's own heading and lands on "aim" (2.55).
    { at: 1.75, word: 'aim', isle: 'storm', swing: 0.8, blend: 'line', frame: { look: [0, 0, 2.6], dist: 17, up: 0.4, drift: 2 } },
    { at: 4.4, word: 'kata', isle: 'kata', cut: 0.18, frame: 'kata' },
    { at: 5.7, word: 'maths of the circle', hold: true },
    { at: 8.27, word: 'Earn stars', hold: true, fadeOut: 9.17 },
    { at: 9.17, word: 'climb the ranks of KENSHI', card: true, fadeIn: 0.5 },
  ],
};
/** The black the isles line ends on — after KENSHI (11.31), and complete
 *  before the clip's end (11.58), because the cue clock is the clip's own
 *  playhead and stops there. The Shadow's line then dips in out of it. */
export const TOUR_TAIL = { simIsles: { from: 11.3, to: 11.55 } };
/** The Kata Trace's frame: on his floor (`STAGE.kata`), from the hub's side,
 *  and from "the maths of the circle" round it, coming down as it goes so the
 *  islands behind rise into the frame. Aimed near the floor, not at his chest:
 *  at 2.6 up the marks he steps on were under the subtitles. */
export const KATA_FRAME = { dist: 16, up: 0.5, lookY: 1.0, orbit: { at: 5.7, to: 105, over: 3.47, up: 0.22, lookY: 1.6 } };
/** The card's close-up, in the frame ABOVE the subtitles: they cover NDC
 *  -0.38 to -0.75 at 16:9, and centred the card's stat rows were behind them.
 *  Aimed `down` below its middle and far enough back that its 8.4 height
 *  runs from the top edge to just over the box, with a slow push for life. */
export const CARD_FRAME = { dist: 18, to: 16.8, over: 2.4, up: 0.3, down: 2.1 };
/** How long a swing from one stop to the next takes, unless the stop says. */
export const PAN_T = 0.6;
/** The lines' lengths (clip + the half second a line is given), for a lens
 *  asked with no clock (`k` only). */
const PAN_LINE_T = { simHub: 11.32, simIsles: 12.08 };
/** The wide frame: how far out and up from the holo-Dojo, and how fast it
 *  turns (radians a second) — "rotating fairly quickly". */
export const MAP_FRAME = { r: 430, h: 330, spin: 0.32 };
/** The "every island" pan: an eye this far out from the hub and this high,
 *  looking at a point `aim` out at `aimY`, turning at `spin`. Out past the
 *  Dojo's own rim (66), so the Turning Circle is not what it shows, and as
 *  near the ring of islands as the eye can stand without one passing through
 *  the lens: from 45 out they were a fifth of the frame wide. */
export const PAN_FRAME = { r: 72, h: 20, aim: 150, aimY: 4, spin: 0.55 };
/** An island's default frame: back toward the hub by this many of its radii,
 *  and up by this fraction of that. A 24-radius island fills ~57% of a 16:9
 *  frame. */
export const ISLE_FRAME = { back: 2.3, up: 0.54, lookY: 2 };

const angOf = (p, hub) => Math.atan2(p.z - hub.z, p.x - hub.x);
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const RAD = Math.PI / 180;

/** The stop whose frame is live at stop `i`: a `hold` keeps the last one. */
function frameIndex(stops, i) {
  let j = i;
  while (j > 0 && stops[j].hold) j--;
  return j;
}

/** An island frame's eye and aim at `t`, in the layer. `yaw` turns the eye
 *  round the aim, from the hub's side (0) toward the island's +b side. */
function isleFrame(isle, fr, t, at) {
  const f = isle.fwd ?? { x: 1, z: 0 };
  const L = fr.look ?? [0, 0, fr.lookY ?? ISLE_FRAME.lookY];
  let dist = fr.dist ?? isle.r * ISLE_FRAME.back;
  let up = fr.up ?? ISLE_FRAME.up;
  let yaw = (fr.yaw ?? 0) + (fr.drift ?? 0) * (t - at);
  let lookY = L[2];
  if (fr.push) dist *= lerp(1, fr.push.to, ease(clamp01((t - at) / fr.push.over)));
  if (fr.orbit) {
    const e = ease(clamp01((t - fr.orbit.at) / fr.orbit.over));
    yaw += fr.orbit.to * e;
    up = lerp(up, fr.orbit.up, e);
    lookY = lerp(lookY, fr.orbit.lookY ?? lookY, e);
  }
  const look = isleAt(isle, L[0], L[1], lookY);
  const ea = -Math.cos(yaw * RAD) * dist;
  const eb = Math.sin(yaw * RAD) * dist;
  const eye = v3(look.x + f.x * ea - f.z * eb, look.y + dist * up, look.z + f.z * ea + f.x * eb);
  return { eye, look };
}

/** One stop's lens at `t`, in the layer: {eye, look}. */
function stopFrame(stops, i, ctx, t) {
  const hub = ctx.dojo;
  const s = stops[i];
  const next = stops[i + 1];
  if (s.map || s.pan) {
    const k = (s.map ?? s.pan).toward;
    const isle = ctx.isles?.[k];
    const u = ctx.u ?? { x: 1, z: 0 };
    const ai = isle ? angOf(isle, hub) : Math.atan2(u.z, u.x);
    const left = (next?.at ?? t) - t;
    if (s.map) {
      // Behind the hub from the island it is heading for, turning onto it.
      const a = ai + Math.PI - MAP_FRAME.spin * left;
      return { eye: v3(hub.x + Math.cos(a) * MAP_FRAME.r, hub.y + MAP_FRAME.h, hub.z + Math.sin(a) * MAP_FRAME.r), look: v3(hub.x, hub.y, hub.z) };
    }
    const a = ai - PAN_FRAME.spin * left;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    return {
      eye: v3(hub.x + c * PAN_FRAME.r, hub.y + PAN_FRAME.h, hub.z + sn * PAN_FRAME.r),
      look: v3(hub.x + c * PAN_FRAME.aim, hub.y + PAN_FRAME.aimY, hub.z + sn * PAN_FRAME.aim),
    };
  }
  if (s.card) {
    const sc = ctx.isles?.school;
    if (!sc) return { eye: v3(hub.x, hub.y + 40, hub.z - 80), look: v3(hub.x, hub.y, hub.z) };
    const c = isleAt(sc, STAGE.school.card[0], STAGE.school.card[1], STAGE.school.card[2]);
    const d = lerp(CARD_FRAME.dist, CARD_FRAME.to, ease(clamp01((t - s.at) / CARD_FRAME.over)));
    return { eye: v3(c.x - sc.fwd.x * d, c.y - CARD_FRAME.down + CARD_FRAME.up, c.z - sc.fwd.z * d), look: v3(c.x, c.y - CARD_FRAME.down, c.z) };
  }
  const isle = ctx.isles?.[s.isle];
  if (!isle) return { eye: v3(hub.x, hub.y + MAP_FRAME.h, hub.z - MAP_FRAME.r), look: v3(hub.x, hub.y, hub.z) };
  if (s.frame === 'kata') {
    const [a, b] = kataFloorAt(STAGE.kata.floor);
    return isleFrame(isle, { ...KATA_FRAME, look: [a, b, KATA_FRAME.lookY] }, t, s.at);
  }
  return isleFrame(isle, s.frame ?? {}, t, s.at);
}

/** How black the pan is at `t`: a stop's dip either side of a cut, a fade
 *  out to a stop's `fadeOut`, a fade in over its `fadeIn`, and the tail. */
export function panBlack(name, t) {
  const stops = TOUR_PANS[name];
  let b = 0;
  for (const s of stops) {
    if (s.cut) b = Math.max(b, 1 - Math.abs(t - s.at) / s.cut);
    if (s.fadeOut && t >= s.at && t <= s.fadeOut) b = Math.max(b, ease(clamp01((t - s.at) / (s.fadeOut - s.at))));
    if (s.fadeIn && t >= s.at) b = Math.max(b, 1 - (t - s.at) / s.fadeIn);
  }
  const tail = TOUR_TAIL[name];
  if (tail && t >= tail.from) b = Math.max(b, ease(clamp01((t - tail.from) / (tail.to - tail.from))));
  return clamp01(b);
}

/** The pan's lens at `t`: the stop that is live, swung into from the last —
 *  round the hub between two islands (both look out from it, so turning
 *  about it is a pan), along a straight line out of a map or a pan (which
 *  already face the island, so only distance changes), and a cut under a
 *  dip or a fade. */
export function panShot(name, ctx, t) {
  const stops = TOUR_PANS[name];
  const hub = ctx.dojo;
  let i = 0;
  for (let j = 0; j < stops.length; j++) if (t >= stops[j].at) i = j;
  const fi = frameIndex(stops, i);
  const s = stops[fi];
  let f = stopFrame(stops, fi, ctx, t);
  const swing = s.swing ?? PAN_T;
  if (fi > 0 && !s.cut && !s.fadeIn && t - s.at < swing) {
    const prev = stopFrame(stops, frameIndex(stops, fi - 1), ctx, t);
    const e = ease((t - s.at) / swing);
    if (s.blend === 'line') {
      f = { eye: lerpP(prev.eye, f.eye, e), look: lerpP(prev.look, f.look, e) };
    } else {
      const polar = (p) => ({ a: angOf(p, hub), r: Math.hypot(p.x - hub.x, p.z - hub.z), y: p.y });
      const mix = (p, q) => {
        const P = polar(p);
        const Q = polar(q);
        const a = P.a + wrapA(Q.a - P.a) * e;
        const r = lerp(P.r, Q.r, e);
        return v3(hub.x + Math.cos(a) * r, lerp(P.y, Q.y, e), hub.z + Math.sin(a) * r);
      };
      f = { eye: mix(prev.eye, f.eye), look: mix(prev.look, f.look) };
    }
  }
  const w = (p) => v3(p.x + SIM.dx, p.y, p.z + SIM.dz);
  return { pos: w(f.eye), look: w(f.look), loc: 'sim', stop: stops[i], black: panBlack(name, t) };
}

/**
 * THE SHADOW'S SHOT: on his ring, from the hub's side, where the cutscene's
 * own Shadow Lionheart (dream/tourshadow.js) walks and swings. It looked at
 * the island's middle from 42-60 back with nobody on it; now it is on the
 * ring's middle (`ctx.shadowStage`, the fight's own `ARENA_AT`), 22 → 16
 * back. Measured in the browser, as a share of the frame's height: 34 → 24
 * back had him at a fifth; 30 → 20 at 24-37%. "Focusing on him" wants more,
 * and his blows are drawn coming at the lens, so the lens can come in until
 * the slam's far end runs off the bottom edge. `world-check` puts him,
 * head to feet, through this lens at every tenth of a second of the line.
 */
export const SHADOW_SHOT = { from: { back: 22, up: 9, off: 6 }, to: { back: 16, up: 6.5, off: 3.5 }, aimUp: 3.2 };

/**
 * The camera for a named shot, `k` (0..1) through its line.
 *
 * `ctx` is the places: `arcade` {x,y,z,r}, `lion`, `sign` {x,y,z}, `stones`,
 * `tubes`, `gear` (rack spots), `u` (Dojo → arcade), `v` (screen-right), `dojo`
 * (the Turning Circle's centre), `isles` (sim islands, layer coordinates) and
 * `cast` (the kittens' marks for a talk). Returns {pos, look, loc}; `loc` is
 * 'real' or 'sim' and decides where a dip to black goes.
 */
export function shotFor(name, ctx, k = 0, t = null) {
  const A = ctx.arcade;
  const u = ctx.u;
  const v = ctx.v;
  const e = ease(Math.max(0, Math.min(1, k)));
  const at = (a, b, y = A.y) => v3(A.x + u.x * a + v.x * b, y, A.z + u.z * a + v.z * b);
  const lion = ctx.lion ?? at(-2, -9);
  const toPad = (() => {
    const dx = A.x - lion.x;
    const dz = A.z - lion.z;
    const d = Math.hypot(dx, dz) || 1;
    return { x: dx / d, z: dz / d };
  })();
  const side = { x: -toPad.z, z: toPad.x };
  const sim = (p) => v3(p.x + SIM.dx, p.y, p.z + SIM.dz);
  const face = v3(lion.x, A.y + 4.4, lion.z);

  switch (name) {
    /* --- the tour, in the real world --- */
    case 'isleWide': {
      // From over the Turning Circle's rim: the island floating out ahead.
      const from = v3(ctx.dojo.x + u.x * 40 - v.x * 14, A.y + 20, ctx.dojo.z + u.z * 40 - v.z * 14);
      const to = v3(ctx.dojo.x + u.x * 52 - v.x * 10, A.y + 16, ctx.dojo.z + u.z * 52 - v.z * 10);
      return { pos: lerpP(from, to, e), look: v3(A.x, A.y + 5, A.z), loc: 'real' };
    }
    case 'stones': {
      const s = ctx.stones?.length ? ctx.stones : [at(-20, -8)];
      const mid = v3((s[0].x + s.at(-1).x) / 2, s[0].y + 1.5, (s[0].z + s.at(-1).z) / 2);
      const from = v3(mid.x - v.x * 22 - u.x * 6, mid.y + 10, mid.z - v.z * 22 - u.z * 6);
      const to = v3(mid.x - v.x * 18 + u.x * 2, mid.y + 8, mid.z - v.z * 18 + u.z * 2);
      return { pos: lerpP(from, to, e), look: mid, loc: 'real' };
    }
    case 'sign': {
      const s = ctx.sign ?? at(12.6, 0, A.y + 9.5);
      const from = at(-30, 4, A.y + 12);
      const to = at(-20, 2, A.y + 10);
      return { pos: lerpP(from, to, e), look: v3(lerp(A.x, s.x, 0.6), lerp(A.y + 4, s.y, 0.7), lerp(A.z, s.z, 0.6)), loc: 'real' };
    }
    case 'lionClose': {
      const from = v3(lion.x + toPad.x * 10, A.y + 4.2, lion.z + toPad.z * 10);
      const to = v3(lion.x + toPad.x * 7.5, A.y + 4, lion.z + toPad.z * 7.5);
      return { pos: lerpP(from, to, e), look: face, loc: 'real' };
    }
    case 'lionOrbit': {
      const a = lerp(-0.5, 0.35, e);
      const dx = toPad.x * Math.cos(a) - toPad.z * Math.sin(a);
      const dz = toPad.z * Math.cos(a) + toPad.x * Math.sin(a);
      return { pos: v3(lion.x + dx * 9, A.y + 4.5, lion.z + dz * 9), look: face, loc: 'real' };
    }
    case 'gear': {
      const g = ctx.gear?.length ? ctx.gear : [at(0, 9)];
      const mid = v3(g.reduce((s, q) => s + q.x, 0) / g.length, A.y + 1.8, g.reduce((s, q) => s + q.z, 0) / g.length);
      const dx = A.x - mid.x;
      const dz = A.z - mid.z;
      const d = Math.hypot(dx, dz) || 1;
      const from = v3(mid.x + (dx / d) * 15 - (dz / d) * 4, A.y + 8, mid.z + (dz / d) * 15 + (dx / d) * 4);
      const to = v3(mid.x + (dx / d) * 11 + (dz / d) * 3, A.y + 6, mid.z + (dz / d) * 11 - (dx / d) * 3);
      return { pos: lerpP(from, to, e), look: mid, loc: 'real' };
    }
    case 'tubes': {
      const t = ctx.tubes?.length ? ctx.tubes : [at(6, 0)];
      const mid = v3(t.reduce((s, q) => s + q.x, 0) / t.length, A.y + 3, t.reduce((s, q) => s + q.z, 0) / t.length);
      const from = at(-9, -3, A.y + 7);
      const to = at(-5, 1, A.y + 5.5);
      return { pos: lerpP(from, to, e), look: mid, loc: 'real' };
    }
    /* --- the tour, in the simulator --- */
    case 'simHub':
    case 'simIsles':
      // Cued on words: `t` is the clip's own clock; without one, `k` of it.
      return panShot(name, ctx, t ?? k * PAN_LINE_T[name]);
    case 'simShadow': {
      const s = ctx.isles?.shadow ?? ctx.isles?.school;
      const st = ctx.shadowStage ?? s;
      const c = st ? sim(st) : sim(v3(ctx.dojo.x + u.x * 200, ctx.dojo.y, ctx.dojo.z + u.z * 200));
      const f = s?.fwd ?? u;
      const sd = { x: -f.z, z: f.x };
      const fr = SHADOW_SHOT.from;
      const to = SHADOW_SHOT.to;
      const p = (q) => v3(c.x - f.x * q.back + sd.x * q.off, c.y + q.up, c.z - f.z * q.back + sd.z * q.off);
      return { pos: lerpP(p(fr), p(to), e), look: v3(c.x, c.y + SHADOW_SHOT.aimUp, c.z), loc: 'sim' };
    }
    /* --- back with him --- */
    case 'lionHero':
    case 'lionHero2': {
      // Low, looking up at him: the man with the mission.
      const k0 = name === 'lionHero' ? 0 : 0.5;
      const kk = lerp(k0, k0 + 0.5, e);
      const dx = toPad.x + side.x * lerp(0.5, -0.2, kk);
      const dz = toPad.z + side.z * lerp(0.5, -0.2, kk);
      const d = Math.hypot(dx, dz) || 1;
      const r = lerp(8.5, 6.8, kk);
      return { pos: v3(lion.x + (dx / d) * r, A.y + 1.3, lion.z + (dz / d) * r), look: v3(lion.x, A.y + 4.6, lion.z), loc: 'real' };
    }
    case 'skyPull':
    case 'skyPull2': {
      // Away, and up, until the island is one of many in the sky.
      const k0 = name === 'skyPull' ? 0 : 0.5;
      const kk = lerp(k0, k0 + 0.5, e);
      const r = lerp(30, 340, kk * kk);
      const h = lerp(14, 210, kk * kk);
      const look = lerpP(v3(A.x, A.y + 4, A.z), v3(ctx.dojo.x * 0.5, 0, ctx.dojo.z * 0.5), kk);
      return { pos: v3(A.x - u.x * r - v.x * r * 0.35, A.y + h, A.z - u.z * r - v.z * r * 0.35), look, loc: 'real' };
    }
    case 'isleEnd': {
      const from = at(-46, -14, A.y + 22);
      const to = at(-36, -10, A.y + 17);
      return { pos: lerpP(from, to, e), look: v3(A.x, A.y + 5, A.z), loc: 'real' };
    }

    /* --- the talks: over the shoulder --- */
    case 'ots':
    case 'otsLion':
    case 'otsWide': {
      const cast = ctx.cast?.length ? ctx.cast : [v3(lion.x + toPad.x * TALK_GAP, A.y, lion.z + toPad.z * TALK_GAP)];
      const n = cast.length;
      const c = cast.reduce((s, q) => v3(s.x + q.x / n, A.y, s.z + q.z / n), v3(0, 0, 0));
      let bx = c.x - lion.x;
      let bz = c.z - lion.z;
      const bd = Math.hypot(bx, bz) || 1;
      bx /= bd; bz /= bd;
      const sx = -bz;
      const sz = bx;
      /* Back far enough for the whole party: each sister beside her widens
         the group by MARK_SPREAD, and the lens has to hold all of them. */
      const spread = (n - 1) * MARK_SPREAD;
      if (name === 'otsWide') {
        const r = lerp(15, 13, e) + spread;
        return { pos: v3(c.x + bx * r + sx * 4, A.y + 8, c.z + bz * r + sz * 4), look: v3(lerp(c.x, lion.x, 0.5), A.y + 2.8, lerp(c.z, lion.z, 0.5)), loc: 'real' };
      }
      const tight = name === 'otsLion';
      const r = (tight ? lerp(6.4, 5.6, e) : lerp(7.6, 7.0, e)) + spread * 0.9;
      const off = tight ? 1.5 : 2.1;
      return {
        pos: v3(c.x + bx * r + sx * off, A.y + (tight ? 3.4 : 3.9), c.z + bz * r + sz * off),
        look: v3(lerp(c.x, lion.x, tight ? 0.86 : 0.7), A.y + (tight ? 3.9 : 3.2), lerp(c.z, lion.z, tight ? 0.86 : 0.7)),
        loc: 'real',
      };
    }
    default:
      return { pos: at(-30, 0, A.y + 14), look: v3(A.x, A.y + 4, A.z), loc: 'real' };
  }
}

export class StoryScene {
  /** @param {object} game */
  constructor(game) {
    this.game = game;
    this.active = false;
    this.kind = null;
    this.rows = [];
    this.camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 6000);
    this.els = new Map();
    const $ = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);
    this.el = $('cutscene');
    this.boxEl = $('cs-box');
    this.nameEl = $('cs-name');
    this.textEl = $('cs-text');
    this.portraitEl = $('cs-portrait');
    this.fadeEl = $('cs-fade');
    this.barEl = $('cs-progress');
    /** What the scene wants playing (`TOUR_MUSIC`), or null. */
    this.musicTrack = null;
  }

  /** Buffer every clip of a script, once. */
  _load(rows) {
    if (typeof window === 'undefined' || !window.Audio) return;
    for (const r of rows) {
      if (this.els.has(r.voice)) continue;
      const el = new window.Audio(voicePath(r.voice));
      el.preload = 'auto';
      this.els.set(r.voice, el);
    }
  }

  /**
   * Play a script. `ctx` is the places (see `shotFor`); `cast` the kittens a
   * talk is about, already stood on their marks by the caller. Returns false
   * (and starts nothing) for an empty script.
   */
  start(kind, rows, ctx, cast = []) {
    if (this.active || !rows?.length) return false;
    this._load(rows);
    this.active = true;
    this.kind = kind;
    this.rows = rows;
    this.ctx = ctx;
    this.cast = cast;
    this.i = -1;
    this.t = 0;
    this.total = 0;
    this.fadeIn = FADE;
    this.ending = false;
    this.musicTrack = null;
    this.el?.classList.remove('hidden');
    this.game.audio?.sfx?.('menu');
    this._next();
    return true;
  }

  _dur(row) {
    const d = this.els.get(row.voice)?.duration;
    if (Number.isFinite(d) && d > 0) return d + 0.5;
    return Math.max(3, row.text.split(/\s+/).length / WORDS_PER_S + 1.2);
  }

  /** The actor a shot brings on (`ctx.actors[shot]`), started with the
   *  line and stopped with it. */
  _stopActor() {
    this.actor?.stop?.();
    this.actor = null;
  }

  _next() {
    this.i += 1;
    this.t = 0;
    this.lineEndedAt = null;
    this.typed = 0;
    this._stopActor();
    const row = this.rows[this.i];
    if (!row) { this.finish(); return; }
    // The music turns with the picture: on the row's own shot (TOUR_MUSIC).
    if (this.kind === 'tour' && TOUR_MUSIC[row.shot]) this.musicTrack = TOUR_MUSIC[row.shot];
    /* A SHOT MAY BRING ON AN ACTOR — the tour's Shadow Lionheart, who
       otherwise exists only while a fight is live. Owned by the scene: on
       with the line, off with the next one, off on a skip. */
    const act = this.ctx?.actors?.[row.shot];
    if (act) {
      // The shot's name too: the tour's cast plays two lines, differently.
      act.start?.(this.ctx, shotFor(row.shot, this.ctx, 0, 0).pos, row.shot);
      this.actor = act;
    }
    const prev = this.rows[this.i - 1];
    const prevEnd = prev ? shotFor(prev.shot, this.ctx, 1) : null;
    /* A DIP AT A CHANGE OF PLACE, AND OUT OF A LINE THAT ENDED BLACK — the
       isles line fades out on its last word ("fade out and in quickly at the
       end before transitioning to the Shadow Lionheart scene"), and the next
       line coming up out of that black is the "in". */
    this.dipAt = prev && (prevEnd.loc !== shotFor(row.shot, this.ctx, 0).loc || (prevEnd.black ?? 0) >= 0.99) ? 0 : -1;
    this.dur = this._dur(row);
    this.voiceEl = this.game.audio?.speak?.(this.els.get(row.voice) ?? null) ?? null;
    const lion = row.who === 'lion';
    const colour = lion ? '#ff4b4b' : '#7fd35a';
    if (this.nameEl) {
      this.nameEl.textContent = lion ? 'LIONHEART  ·  the Dream Dojo' : 'PAYNE  ·  the goblin';
      this.nameEl.style.color = colour;
    }
    this.boxEl?.style.setProperty('--cs-accent', colour);
    if (this.textEl) this.textEl.textContent = '';
    this._portrait(row.who, colour);
  }

  _portrait(who, colour) {
    const cv = this.portraitEl;
    const g = cv?.getContext?.('2d');
    if (!g) return;
    g.clearRect(0, 0, cv.width, cv.height);
    cv.style.borderColor = colour;
    if (who === 'payne') {
      cv.style.display = '';
      this.game.payne?.drawFace?.(cv);
      return;
    }
    const img = this.game.dream?.lionArt?.texture?.image;
    cv.style.display = img ? '' : 'none';
    if (!img) return;
    // His head: the top of the drawn figure, measured the shrine scene's way.
    const art = this.game.dream.lionArt;
    const cell = img.width;
    const figure = cell * (art.contentScale ?? 0.8);
    const head = cell * (1 - (art.pad ?? 0.06)) - figure;
    const s = Math.min(figure * 0.42, cell);
    const sx = Math.max(0, Math.min(cell - s, cell / 2 - s / 2));
    const sy = Math.max(0, Math.min(img.height - s, head));
    g.drawImage(img, sx, sy, s, s, 0, 0, cv.width, cv.height);
  }

  skip() { if (this.active) this.finish(); }

  finish() {
    if (!this.active) return;
    this.active = false;
    this._stopActor();
    this.el?.classList.add('hidden');
    if (this.fadeEl) this.fadeEl.style.opacity = '0';
    this.game.audio?.stopSpeaking?.();
    this.rows = [];
    this.cast = [];
    this.kind = null;
    // Skipped or played out, the islands have their own themes back.
    this.musicTrack = null;
  }

  _lineFinished() {
    const el = this.voiceEl;
    if (!el) return true;
    const d = el.duration;
    if (el.ended) return true;
    return el.currentTime > 0 && Number.isFinite(d) && el.currentTime >= d - 0.06;
  }

  update(dt) {
    if (!this.active) return false;
    this.t += dt;
    this.total += dt;
    this.fadeIn = Math.max(0, this.fadeIn - dt);
    const row = this.rows[this.i];
    if (!row) { this.finish(); return false; }

    const k = Math.min(1, this.t / this.dur);
    /* The pans are cued on WORDS, at seconds measured off the clip — so they
       read the clip's own playhead when it is playing, not the line's clock,
       which starts before a clip that is still buffering. */
    const cue = this.voiceEl && this.voiceEl.currentTime > 0 ? this.voiceEl.currentTime : this.t;
    const s = shotFor(row.shot, this.ctx, k, cue);
    this.camera.position.set(s.pos.x, s.pos.y, s.pos.z);
    this.camera.lookAt(s.look.x, s.look.y, s.look.z);
    this.camera.updateMatrixWorld?.();
    // On the same clock as the lens: the Shadow's Cross is cued on a word.
    this.actor?.update?.(cue, this.camera);
    /* WHICH WORLD THIS LENS IS IN, for the renderer (`Game._renderView`).
       A pane is drawn with the simulator in it only when its kittens are in
       the simulator, and a scene's lens has no kittens — so the tour's three
       sim shots were drawn with the whole layer switched off, and the only
       thing left was the holo-Dojo's MathDojo, which hangs off the scene
       rather than the layer. Richard: "I can only see the dojo of the turning
       circle parts of the cutscene and everything else is not being shown". */
    this.loc = s.loc;

    // Typewriter, on the clip's own playhead when it has one.
    const clock = this.voiceEl && this.voiceEl.currentTime > 0 ? this.voiceEl.currentTime : this.t;
    const rate = row.text.length / Math.max(0.6, (this.dur - 0.5) * TYPE_LEAD);
    const want = Math.min(row.text.length, Math.floor(clock * rate));
    if (want > this.typed && this.textEl) {
      this.typed = want;
      this.textEl.textContent = row.text.slice(0, want);
    }

    const last = this.i === this.rows.length - 1;
    let black = this.fadeIn / FADE;
    if (this.dipAt >= 0) black = Math.max(black, 1 - Math.min(1, this.t / DIP));
    if (last) black = Math.max(black, Math.max(0, FADE - (this.dur - this.t)) / FADE);
    // A shot's own fades, on its own clock (the tour's cut to the Kata, and
    // its fade from the kata to the card).
    black = Math.max(black, s.black ?? 0);
    if (this.fadeEl) this.fadeEl.style.opacity = String(Math.min(1, black));
    if (this.barEl) this.barEl.style.width = `${((this.i + k) / this.rows.length) * 100}%`;

    if (this.lineEndedAt == null && this._lineFinished()) this.lineEndedAt = this.t;
    const started = !!this.voiceEl && this.voiceEl.currentTime > 0;
    if (beatOver(this.t, this.dur, this.lineEndedAt, started)) this._next();
    return this.active;
  }
}
