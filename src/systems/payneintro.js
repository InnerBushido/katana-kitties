/* ---------------------------------------------------------------------------
   PAYNE'S INTRODUCTION TO THE WORLD.

   Richard, Oct 2026: a cutscene "the first time a player talks to Payne",
   replayable from her card as INTRODUCTION TO THE WORLD, that explains why
   knocking things over releases kotodama, how the islands came apart and will
   come back together, bad karma and caring for nature in the Shinto way, and
   what there is to do — "similar in feel to the ending", with Payne masked,
   then unmasked, then masked again for her "space mission" to worlds with too
   much order and boredom.

   IT IS A STORYSCENE SCRIPT (systems/dream/storyscene.js), not a new player.
   That scene already does everything a scene here has to: Escape or a pad's
   Start and nothing else skips it (seventh non-negotiable), a line lasts as
   long as its recording and degrades to a reading time without one (ninth),
   the typewriter follows the clip's own playhead, and the shots are data
   asked for by name. What this file adds is WHERE THE SHOTS ARE (`introShot`,
   pure, over `introCtx`'s places, cut on words by `INTRO_CUTS`) and PAYNE
   HERSELF (`PayneActor`), animated off the sheets `payneclips.js` describes.

   SHE STANDS IN THE WORLD, WHERE SHE STANDS. The first cut had her as a
   canvas in the cutscene's DOM, stood on the letterbox bar on the right with
   every shot leaning left to clear her. Richard, Oct 2026: "we don't have to
   have her on screen the whole time ... Let's put her standing where she
   should be standing in the world, in 3D world space rather than having her
   attached to the screen. Let's make sure she is facing towards the player".
   So she is a quad on her market spot, turned to the lens — and the shots
   that are about her are over the shoulder of the kitten who came to talk to
   her, so the lens and the kitten are on the same side of her.
   STILL ONE UPLOAD PER CHANGE OF FRAME, not per page: every clip's cells are
   drawn into one small STAGE canvas placed by her feet (payneframes.js), and
   that canvas is the quad's texture. Uploading a page as a texture was the
   other way, and a page of pointing cells is 2500x3000 — 30MB of GPU each,
   for one frame of it on show.

   NOTHING HANGS OFF IT FINISHING. `Payne.startIntro` marks every seated
   kitten as having seen it, and the kitten who opened her as having met her,
   BEFORE `start` — skip it on its first frame and both are already true.
   Everything the scene puts in the world for itself (her quad, the sky
   island it furnishes, the stars) goes in `stop`, which the skip runs too.
--------------------------------------------------------------------------- */
import * as THREE from 'three';
import { INTRO_CLIPS, INTRO_FPS, TAKE_FROM, clipFrames, pagePath } from './payneclips.js';
import { INTRO_GEO, INTRO_REST, INTRO_STAGE } from './payneframes.js';
import { IntroSet } from './payneset.js';

/**
 * THE SCRIPT. The card and the recording are one string (docs/notes/voices.md):
 * `payne_intro_N` is a render of exactly `text`, Pixie, like all her lines.
 * THE WORDS ARE LOCKED; only what she does and where the lens is may move.
 *
 * `act` is what she does, cued on the clip's own clock: each entry
 * `[clip, at, from?, to?, rate?]` starts at `at` seconds, plays ONCE and
 * holds its last frame until the next entry. `from`/`to` are cell indices,
 * for playing part of a clip or playing it backwards (`mask` backwards is
 * the helmet coming OFF); `rate` speeds a clip up.
 * The `at`s are WORDS, measured — faster-whisper large-v3 word timestamps
 * (whose starts run early) checked against silencedetect -32dB/0.12s, which
 * wins where they disagree. The word each cue is on is in the comment beside
 * it, so a re-recorded line can be re-cued by ear.
 */
const P = (n, text, act, extra = {}) => ({ who: 'payne', voice: `payne_intro_${n}`, text, shot: `l${n}`, act, ...extra });

export const PAYNE_INTRO = [
  P(1, "Halt, traveller! ...Ha, kidding. Nobody ever halts. Come closer — this bit's important.",
    [['halt', 0], ['haha', 1.34 /* Ha, */], ['beckon', 4.94 /* Come */]]),
  // Her hands go up to the helmet on "a face", and it is off by "Fine!".
  P(2, "You can't trust a face you can't see, right? Fine. Fine!",
    [['restMasked', 0], ['mask', 0.25 /* trust */, 40, 0, 1.33]]),
  P(3, 'Ta-daa! Payne. Goblin. Professional helper. Hello!',
    [['tadaa', 0], ['thumb', 1.0 /* Payne. — once the ta-daa has landed */], ['wave', 3.8 /* Hello! */]]),
  P(4, 'Look up. These islands used to be ONE world. Then it got too tidy. Too still. And everything fell asleep — even the magic.',
    [['pointUp', 0, 2, 24], ['talk', 8.0 /* And everything */]]),
  P(5, "Every barrel, every lantern, every cane of bamboo is holding a tiny bit of sleeping power. Knock it over and — pop! — it's out.",
    [['restHeld', 0], ['count', 3.96 /* is holding */], ['laugh', 8.14 /* pop */]]),
  P(6, "That power is kotodama. Word-spirits. Catch them and they're yours: run faster, jump higher, cut further.",
    [['talk', 0], ['count', 6.69 /* Run */]]),
  P(7, "In the old Shinto way, there's a spirit in every tree, every river, every living thing. So: furniture, fair game. But the dragons, the pandas, the little critters — you look after them. Hurt what's alive and that's bad karma, and bad karma follows you home.",
    [['restHeld', 0], ['laugh', 6.84 /* So, */], ['talk', 13.56 /* you look after */]]),
  P(8, "So here's the job. Find the seven dragon stars. Knock over EVERYTHING. Wake every sleeping kotodama.",
    [['count', 0], ['wave', 5.92 /* Wake */]]),
  P(9, 'Win the arena. Buy a home in the sky. Bring the clans and their creatures back where they belong.',
    [['restHeld', 0]]),
  P(10, "Learn the maths the universe is secretly written in. Spoiler: it's circles.",
    [['restHeld', 0], ['laugh', 3.62 /* Spoiler */]]),
  P(11, "And become the greatest fighter there ever was. ...Second greatest. I'll be around.",
    [['restHeld', 0], ['thumb', 3.46 /* Second */]]),
  /* "Me?" is a thumb at herself; the two "too much"es are counted off; and
     the helmet goes back on as the lens leaves the ground, done before the
     line is (40 cells at 1.4x is 3.6s, from 7.6 to 11.2 of 11.76). */
  P(12, "Me? I've got a mission. Out there are worlds with the opposite problem — too much order, too much boredom. Somebody has to go and mess them up.",
    [['thumb', 0], ['count', 5.86 /* Too much order */], ['mask', 7.6, 0, 40, 1.4]]),
  /* Held a beat past the clip so the salute is SEEN before the fade: the
     salute is 1.6s from "Payne," at 2.36 and the line is 3.52. */
  P(13, 'Stuck? Come and find me. Payne, out!',
    [['shrug', 0], ['salute', 2.36 /* Payne, */]], { hold: 0.9 }),
];

/** Clips she is wearing the helmet in. */
const MASKED = new Set(Object.keys(INTRO_CLIPS).filter((c) => TAKE_FROM[INTRO_CLIPS[c].take] === 'town'));
/** The `mask` clip's cell from which the helmet is on (read off its proof). */
const MASK_ON = 22;
/** How long the last frame of one clip takes to fade under the next. */
export const CROSSFADE = 0.22;
/** Two cells this close in the same take are one performance: no fade. */
const SEAMLESS = 6;
/** Held this long, a frame starts to bob. */
const IDLE_AFTER = 0.3;

const cellsOf = (clip) => clipFrames(INTRO_CLIPS[clip]).length;

/**
 * The cell on show `t` seconds into a line's `act`. Pure, so world-check can
 * walk every line without a browser. `held` is how long the frame has been
 * held after its clip ran out (0 while it is moving) — what the bob is for.
 * @returns {{clip: string, cell: number, entry: number, held: number}}
 */
export function actFrame(act, t) {
  let j = 0;
  for (let i = 0; i < act.length; i++) if (t >= act[i][1]) j = i;
  const [clip, at, from, to, rate = 1] = act[j];
  const n = cellsOf(clip);
  const run = Math.max(0, t - at) * INTRO_FPS * rate;
  const a = from ?? 0;
  const b = to ?? n - 1;
  const len = Math.abs(b - a);
  const k = Math.min(Math.floor(run), len);
  const held = len === 0 ? Math.max(0, t - at) : Math.max(0, (run - len) / (INTRO_FPS * rate));
  return { clip, cell: a + Math.sign(b - a) * k, entry: j, held };
}

/** The source frame a cell is, for telling whether two cells are one move. */
export const srcFrame = (clip, cell) => clipFrames(INTRO_CLIPS[clip])[cell];

/** Is the move from (clip a, cell i) to (clip b, cell j) one performance? */
export function seamless(a, i, b, j) {
  if (!a || INTRO_CLIPS[a].take !== INTRO_CLIPS[b].take) return false;
  return Math.abs(srcFrame(a, i) - srcFrame(b, j)) <= SEAMLESS;
}

/** Is she masked in this cell? */
export const maskedIn = (clip, cell) => MASKED.has(clip) || (clip === 'mask' && cell >= MASK_ON);

/* ------------------------------- the shots -------------------------------- */

const v3 = (x, y, z) => ({ x, y, z });
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerpP = (a, b, k) => v3(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k));
const flatDir = (a, b) => {
  const dx = b.x - a.x, dz = b.z - a.z;
  const d = Math.hypot(dx, dz) || 1;
  return { x: dx / d, z: dz / d };
};

/** Which way the market looks at a subject from: from the town's middle out. */
function headingFrom(a, b) {
  return Math.atan2(b.z - a.z, b.x - a.x);
}

/** An orbiting frame on `P`: `dist` back, `up` high (a fraction of the
 *  distance), from heading `yaw0` to `yaw1` (radians) as `k` runs 0..1,
 *  aimed `lookY` above it. A dolly keeps `up` proportional, so it does not
 *  turn into a crane (the skill's rule). */
function orbit(P, { dist, to = dist, up, lookY = 2, yaw0 = 0, yaw1 = yaw0 }, k) {
  const e = ease(clamp01(k));
  const a = lerp(yaw0, yaw1, e);
  const d = lerp(dist, to, e);
  return { pos: v3(P.x - Math.cos(a) * d, P.y + up * d, P.z - Math.sin(a) * d), look: v3(P.x, P.y + lookY, P.z), loc: 'real' };
}

/**
 * THE TWO OF THEM: Payne, and the kitten who came to talk to her. `u` runs
 * from Payne to the kitten and `n` across it, so a lens `back` along `u`
 * behind the kitten and a little to one `side` is over her shoulder, and
 * Payne — turned to the lens — is turned to her. A kitten more than `near`
 * away is treated as standing there: the frame is about a conversation.
 */
function pair(ctx) {
  const Pn = ctx.payne ?? ctx.town ?? v3(0, 4, 20);
  let K = ctx.kitten;
  let u = K ? flatDir(Pn, K) : null;
  if (!u || !Number.isFinite(u.x) || (K && Math.hypot(K.x - Pn.x, K.z - Pn.z) < 0.5)) {
    // no kitten (a replay from a card with nobody near): toward the town
    u = flatDir(Pn, ctx.town ?? v3(Pn.x, Pn.y, Pn.z + 10));
    K = null;
  }
  const near = 7;
  const kd = K ? Math.min(near, Math.hypot(K.x - Pn.x, K.z - Pn.z)) : 5;
  const Kp = v3(Pn.x + u.x * kd, K?.y ?? Pn.y, Pn.z + u.z * kd);
  return { P: Pn, K: Kp, u, n: { x: -u.z, z: u.x }, kd };
}

/** A frame placed off the pair: `along` behind her along u, `side` across,
 *  `y` up, aimed at `aim` (0 = Payne, 1 = the kitten) `lookY` up. */
function pairShot(ctx, { along, side = 0, y, aim = 0, lookY = 3, to = null }, k) {
  const { P: Pn, K, u, n } = pair(ctx);
  const at = (o) => v3(Pn.x + u.x * o.along + n.x * (o.side ?? 0), Pn.y + o.y, Pn.z + u.z * o.along + n.z * (o.side ?? 0));
  const e = ease(clamp01(k));
  const a = at({ along, side, y });
  const pos = to ? lerpP(a, at({ along: to.along ?? along, side: to.side ?? side, y: to.y ?? y }), e) : a;
  const T = lerpP(Pn, K, aim);
  return { pos, look: v3(T.x, T.y + lookY, T.z), loc: 'real' };
}

/**
 * THE BLAST-OFF. Richard: "when talking about going to space at the end,
 * instead of looking up at an empty sky, we can have the camera 'blast off'
 * focusing on the player and Payne and starting slowly, but accelerating
 * quickly and fast into the air, like a rocket going to space". The lens
 * stays on the two of them and rises on an EXPONENTIAL — slow off the pad,
 * then away — and for its last stretch tips up off the shrinking town to the
 * stars the scene has lit (payneset.js `space`). `s` is seconds in, `T` the
 * length of the cut. Ends on black, so the next line comes back in from it.
 */
export const BLAST = { h0: 5, top: 2600, tau: 0.2, tilt: 0.62, black: 0.35, lean: 0.45 };
function blast(ctx, s, T) {
  const { P: Pn, K, u } = pair(ctx);
  const M = lerpP(Pn, K, 0.5);
  const q = (Math.exp(clamp01(s / T) / BLAST.tau) - 1) / (Math.exp(1 / BLAST.tau) - 1);
  const h = BLAST.h0 + q * BLAST.top;
  /* LEANING, NEVER OVERHEAD: she is an upright picture turned to the lens
     about the vertical, so straight down she is edge-on and gone — the first
     cut lost both of them a second off the pad. `lean` keeps the lens back
     by a share of its height, about 65 degrees down, all the way up. */
  const back = 14 + h * BLAST.lean;
  const pos = v3(M.x + u.x * back, M.y + h, M.z + u.z * back);
  const down = v3(M.x, M.y + 2.5, M.z);
  // the last stretch: off the ground and up to the horizon, where the stars are
  const t = ease(clamp01((s / T - BLAST.tilt) / (1 - BLAST.tilt)));
  const far = v3(pos.x + u.x * 900, pos.y + 200, pos.z + u.z * 900);
  const look = lerpP(down, far, t);
  const black = clamp01((s - (T - BLAST.black)) / BLAST.black);
  return { pos, look, loc: 'real', black, alt: h };
}

/**
 * EVERY SHOT, BY NAME, `k` 0..1 through its cut and `s` seconds in. Each is
 * aimed at a named place out of `introCtx`, every one of which has a
 * fallback, so a world with no arena or no grotto aims somewhere real and
 * never at NaN (ninth non-negotiable).
 * The places that are NOT her are looked at from the far side, toward the
 * town or the other islands — "should have interesting background ... we
 * have parts where we are showing empty space in the sky, we shouldn't do
 * that" — so a landmark has the archipelago behind it rather than air.
 */
const SHOTS = {
  // The establishing frame: both of them, from the side, a slow push.
  two: (c, k) => pairShot(c, { along: 5, side: 15, y: 5, aim: 0.45, lookY: 2.6, to: { along: 4, side: 12, y: 4.2 } }, k),
  twoOther: (c, k) => pairShot(c, { along: 4, side: -13, y: 4.4, aim: 0.4, lookY: 2.8, to: { side: -11 } }, k),
  // Over the kitten's shoulder, at her. Payne faces the kitten AND the lens.
  ots: (c, k) => pairShot(c, { along: 13, side: 3.2, y: 4.6, aim: 0, lookY: 3.0, to: { along: 11.5, y: 4.2 } }, k),
  // Close on her, for the unmask and the punchlines.
  herClose: (c, k) => pairShot(c, { along: 8.5, side: 2.8, y: 3.9, aim: 0, lookY: 3.5, to: { along: 7.6 } }, k),
  /* Low, for "Look up.": her pointing hand is 1.33 of her height up. On the
     far side from the kitten — from her side, her head was the bottom half
     of the frame. */
  herLow: (c, k) => pairShot(c, { along: 2, side: -8.5, y: 1.6, aim: 0, lookY: 5.0, to: { along: 1.6, side: -8 } }, k),
  // Wide of the kitten's line: from on it, her head was a quarter of the frame.
  her: (c, k) => pairShot(c, { along: 9, side: -6.5, y: 4.4, aim: 0.1, lookY: 3.0, to: { along: 8.2, side: -6 } }, k),
  /* The kitten, from Payne's side of her but wide of Payne. NEVER A REVERSE
     ANGLE THROUGH PAYNE: she is a picture turned to the lens, so from behind
     she shows her front, facing away from the kitten she is talking to. */
  kit: (c, k) => pairShot(c, { along: 1.5, side: 6, y: 2.6, aim: 1, lookY: 1.4, to: { along: 2.2, side: 5.2 } }, k),
  /* "These islands used to be ONE world." Short and moving: "We show the
     islands zoomed out for too long, gets boring after a while". */
  archi: (c, k) => {
    const C = c.centre ?? c.town ?? v3(0, 0, 0);
    const R = c.radius ?? 200;
    const h0 = headingFrom(c.town ?? C, c.payne ?? C);
    return orbit(C, { dist: R * 1.0, to: R * 0.86, up: 0.42, lookY: 0, yaw0: h0 + 0.2, yaw1: h0 + 0.42 }, k);
  },
  townWide: (c, k) => {
    const T = c.town ?? v3(0, 0, 0);
    const h0 = headingFrom(T, c.payne ?? T);
    return orbit(T, { dist: 92, to: 70, up: 0.42, lookY: 0, yaw0: h0 + 2.2, yaw1: h0 + 2.5 }, k);
  },
  /* "Then it got too tidy. Too still." — low along a row of standing props,
     still, with the town behind them. */
  tidy: (c, k) => {
    const H = c.heap ?? c.town ?? v3(0, 0, 0);
    const h = headingFrom(c.town ?? H, H) + Math.PI;
    return orbit(H, { dist: 11, to: 9.5, up: 0.16, lookY: 1.6, yaw0: h + 0.5, yaw1: h + 0.62 }, k);
  },
  barrel: (c, k) => near(c.barrel ?? c.heap, c, { dist: 6, to: 5, up: 0.32, lookY: 1.1, swing: 0.35 }, k),
  crate: (c, k) => near(c.crate ?? c.heap, c, { dist: 6.5, to: 5.5, up: 0.3, lookY: 1.0, swing: -0.4 }, k),
  /* "every cane of bamboo" — Richard: "The bamboo camera angle and area is
     not good, should have interesting background and we are holding on it
     for too long". Low among the canes, looking back across the grove at
     the town, and under two seconds. */
  bamboo: (c, k) => near(c.bamboo, c, { dist: 9, to: 6.5, up: 0.12, lookY: 3.5, swing: 0.25 }, k),
  heap: (c, k) => near(c.heap, c, { dist: 15, to: 12, up: 0.36, lookY: 1.4, swing: 0.6 }, k),
  shrine: (c, k) => near(c.shrine, c, { dist: 24, to: 19, up: 0.3, lookY: 4, swing: 0.3 }, k),
  /* "every river" — the grotto, from out along its doorway's axis, looking
     at the mouth. From r+9 it was a lens in the doorway's frame looking at a
     wall; from r+24 and 7 up it is the dome, the mouth and the hill round it. */
  grotto: (c, k) => {
    const G = c.grotto;
    if (!G) return SHOTS.shrine(c, k);
    const a = (G.yaw ?? 0);
    const at = (d) => v3(G.x + Math.sin(a) * (G.r + d), G.y, G.z + Math.cos(a) * (G.r + d));
    const e = ease(clamp01(k));
    const out = at(lerp(24, 20, e));
    const mouth = at(4.5);
    return { pos: v3(out.x, out.y + 7, out.z), look: v3(mouth.x, mouth.y + 4, mouth.z), loc: 'real' };
  },
  clan: (c, k) => near(c.clan ?? c.shrine, c, { dist: 26, to: 21, up: 0.3, lookY: 4, swing: -0.35 }, k),
  dragon: (c, k) => near(c.dragon ?? c.shrine, c, { dist: 26, to: 20, up: 0.28, lookY: 4, swing: 0.35 }, k),
  /* A panda if anybody has raised one; before that, the clan that raises
     them — at 9 units from a dragon the fallback was a dragon's belly. */
  panda: (c, k) => (c.panda
    ? near(c.panda, c, { dist: 11, to: 9, up: 0.3, lookY: 1.8, swing: -0.3 }, k)
    : near(c.pandaHall ?? c.shrine, c, { dist: 24, to: 19, up: 0.3, lookY: 4, swing: -0.3 }, k)),
  // "the little critters" — the farm's own animals, in the pen on the island the scene furnished
  pen: (c, k) => near(c.set?.pen ?? c.set?.home ?? c.panda, c, { dist: 16, to: 13, up: 0.4, lookY: 1.2, swing: 0.3, from: c.set?.home }, k),
  star: (c, k) => near(c.star ?? c.shrine, c, { dist: 9, to: 7, up: 0.3, lookY: 1.5, swing: 0.5 }, k),
  arena: (c, k) => near(c.arena, c, { dist: 92, to: 76, up: 0.42, lookY: 4, swing: 0.3 }, k),
  ring: (c, k) => near(c.arena, c, { dist: 34, to: 26, up: 0.2, lookY: 4, swing: -0.3, side: 1.4 }, k),
  dojo: (c, k) => near(c.dojo, c, { dist: 70, to: 60, up: 0.9, lookY: 0, swing: 0.4 }, k),
  /* "Buy a home in the sky." — the castle the scene built on a sky island,
     across its bridge-level walkway, the other islands behind it. */
  home: (c, k) => {
    const S = c.set;
    if (!S?.home) return SHOTS.townWide(c, k);
    // from outside it, looking back toward the home island: the town behind, not the sky
    const h = S.facing ?? 0;
    return orbit(v3(S.home.x, S.home.y, S.home.z), { dist: 62, to: 52, up: 0.34, lookY: 7, yaw0: h + 0.55, yaw1: h + 0.8 }, k);
  },
};

/** Orbit a landmark from its FAR side from the town (or from `from`),
 *  looking back at it, so what is behind it is the town and not the sky;
 *  `side` turns off that line, and the move drifts `swing` across it. */
function near(T, c, { dist, to, up, lookY, swing = 0.3, side = 0, from = null }, k) {
  const town = from ?? c.town ?? v3(0, 0, 0);
  const M = T ?? c.town ?? v3(0, 0, 0);
  let h = headingFrom(town, M) + Math.PI + side;
  if (Math.hypot(M.x - town.x, M.z - town.z) < 1) h = side;
  return orbit(M, { dist, to, up, lookY, yaw0: h - swing / 2, yaw1: h + swing / 2 }, k);
}

/**
 * THE CUTS, per line, on WORDS: `[shot, at]` from `at` seconds of the clip
 * to the next cut (the last to the line's `len`, its measured length). Kept
 * beside the words they are cued to. Richard's notes on the first cut, which
 * had one shot a line: "consider cutting back to Payne while she is talking
 * ... cut back to Payne after showing a few different sections".
 */
export const INTRO_CUTS = {
  l1: { len: 7.79, cuts: [['two', 0], ['ots', 3.06 /* Nobody */]] },
  l2: { len: 4.08, cuts: [['ots', 0], ['herClose', 1.72 /* right? */]] },
  l3: { len: 5.2, cuts: [['herClose', 0], ['twoOther', 1.48 /* Goblin. */], ['ots', 3.88 /* Hello! */]] },
  l4: { len: 12.27, cuts: [['herLow', 0], ['archi', 1.15 /* These islands */], ['tidy', 4.46 /* Then it got */], ['her', 8.0 /* And everything */]] },
  l5: { len: 10.08, cuts: [['barrel', 0], ['crate', 0.92 /* every lantern */], ['bamboo', 2.06 /* every cane */], ['her', 3.96 /* is holding */], ['heap', 6.93 /* Knock */], ['herClose', 8.14 /* pop */]] },
  l6: { len: 10.37, cuts: [['herClose', 0], ['shrine', 2.65 /* Word-spirits */], ['two', 4.41 /* Catch them */], ['kit', 6.69 /* Run faster */]] },
  l7: { len: 21.36, cuts: [['shrine', 0], ['grotto', 3.82 /* every river */], ['clan', 5.18 /* every living thing */], ['herClose', 6.84 /* So: furniture */], ['dragon', 9.88 /* But the dragons */], ['panda', 11.42 /* the pandas */], ['pen', 12.34 /* the little critters */], ['ots', 13.56 /* you look after */], ['herClose', 15.54 /* Hurt */]] },
  l8: { len: 8.8, cuts: [['her', 0], ['star', 1.04 /* Find */], ['townWide', 3.28 /* Knock over */], ['ots', 5.92 /* Wake */]] },
  l9: { len: 6.72, cuts: [['arena', 0], ['home', 0.92 /* buy a home */], ['clan', 2.68 /* bring the clans */], ['dragon', 4.46 /* creatures */]] },
  l10: { len: 6.64, cuts: [['dojo', 0], ['herClose', 3.3 /* Spoiler */]] },
  l11: { len: 5.94, cuts: [['ring', 0], ['herClose', 2.93 /* ...Second */]] },
  l12: { len: 11.76, cuts: [['herClose', 0], ['two', 2.28 /* Out there */], ['blast', 8.1 /* ...boredom. Somebody */]] },
  l13: { len: 3.52, cuts: [['ots', 0]] },
};

/** Which cut of a line is live `cue` seconds in, and how far through it. */
export function cutAt(line, cue) {
  const L = INTRO_CUTS[line];
  if (!L) return null;
  const t = Math.max(0, cue ?? 0);
  let j = 0;
  for (let i = 0; i < L.cuts.length; i++) if (t >= L.cuts[i][1]) j = i;
  const at = L.cuts[j][1];
  const end = j + 1 < L.cuts.length ? L.cuts[j + 1][1] : Math.max(L.len, at + 0.5);
  return { name: L.cuts[j][0], j, s: t - at, T: end - at, k: clamp01((t - at) / (end - at)) };
}

/**
 * The camera for a line, `cue` seconds into its clip (StoryScene's
 * `ctx.shot(name, ctx, k, cue)`). `k` is the line's own 0..1, used only when
 * there is no clip clock yet. Returns StoryScene's shape: {pos, look, loc}.
 */
export function introShot(name, ctx, k = 0, cue = null) {
  const L = INTRO_CUTS[name];
  const c = cutAt(name, cue ?? k * (L?.len ?? 1));
  if (!c) return SHOTS.her(ctx, k);
  if (c.name === 'blast') return blast(ctx, c.s, c.T);
  if (c.name === 'archi' || c.name === 'townWide') return SHOTS[c.name](ctx, c.k);
  const at = (kk, turn) => turned(SHOTS[c.name](ctx, kk), turn);
  return at(c.k, clearTurn(ctx, `${name}:${c.j}`, (turn) => [0, 0.5, 1].map((kk) => at(kk, turn))));
}

/**
 * NOTHING BETWEEN THE LENS AND WHAT IT IS FOR. The first cut put the lens
 * INSIDE a cherry tree for "Knock it over", and a market lantern stood in
 * front of Payne's knees in every over-the-shoulder — none of it visible in
 * the numbers, all of it on screen. Every cut is tried at a few turns about
 * its own subject (`TURNS`, nearest first) and keeps the first whose whole
 * move — start, middle, end — is clear by `ctx.blocked`; failing that, the
 * least blocked. Chosen once a cut and kept (`ctx._turns`), so it costs a
 * search on the cut and nothing a frame after, and a cut never swings
 * mid-move. With no `blocked` (world-check) every turn is 0.
 */
export const TURNS = [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.25, -1.25, 1.6, -1.6];
function clearTurn(ctx, key, framesAt) {
  if (!ctx.blocked) return 0;
  const memo = (ctx._turns ??= {});
  if (memo[key] != null) return memo[key];
  let best = 0, bestN = Infinity;
  for (const t of TURNS) {
    const n = framesAt(t).reduce((a, f) => a + ctx.blocked(f.pos, f.look), 0);
    if (n < bestN) { best = t; bestN = n; }
    if (n === 0) break;
  }
  memo[key] = best;
  return best;
}

/** A frame turned `a` radians about its own aim point, in the ground plane. */
function turned(f, a) {
  if (!a) return f;
  const dx = f.pos.x - f.look.x, dz = f.pos.z - f.look.z;
  const c = Math.cos(a), s = Math.sin(a);
  return { ...f, pos: v3(f.look.x + dx * c - dz * s, f.pos.y, f.look.z + dx * s + dz * c) };
}

/**
 * The places, off the world as it is this afternoon. The heap is the
 * densest knot of props STILL STANDING near the town — "knock it over" is
 * said over things that can still be knocked over — falling back to any
 * props, and then to the market. `kitten` is the one who opened her, where
 * she stood when she did.
 */
export function introCtx(game, kitten = null) {
  const w = game.world;
  const town = game.townCentre?.() ?? w?.townCentre ?? null;
  const B = game._worldBounds?.();
  const pick = (a) => (a && Number.isFinite(a.x) && Number.isFinite(a.z) ? v3(a.x, a.y ?? 0, a.z) : null);
  const ground = (x, z, y = 0) => {
    const g = w?.heightAt?.(x, z);
    return g && Number.isFinite(g.y) ? g.y : y;
  };
  const her = pick(game.payne?.position);
  const props = (w?.props ?? []).filter((p) => p?.home && !p.gone);
  /* `off`: not the one at her feet — the first barrel was, and the shot of
     "every barrel" was a shot of Payne's shins. */
  const nearest = (kinds, off = 10) => {
    let best = null, bd = Infinity;
    for (const p of props) {
      if (p.knocked || !kinds.includes(p.kind)) continue;
      const d = her ? Math.hypot(p.home.x - her.x, p.home.z - her.z) : 0;
      if (her && d < off) continue;
      if (d < bd) { bd = d; best = p; }
    }
    return best ? v3(best.home.x, best.home.y, best.home.z) : null;
  };
  const heapOf = (standing) => {
    const list = props.filter((p) => (!standing || !p.knocked) && p.kind !== 'bamboo'
      && (!town || Math.hypot(p.home.x - town.x, p.home.z - town.z) < 70));
    let best = 0;
    let at = null;
    for (const a of list) {
      let n = 0;
      let x = 0, y = 0, z = 0;
      for (const b of list) {
        if (Math.hypot(a.home.x - b.home.x, a.home.z - b.home.z) > 9) continue;
        n++; x += b.home.x; y += b.home.y; z += b.home.z;
      }
      if (n > best) { best = n; at = v3(x / n, y / n, z / n); }
    }
    return best >= 3 ? at : null;
  };
  const grove = w?.groves?.[0];
  const G = w?.grottos?.[0];
  /* The clan shot is a DIFFERENT shrine from the shrine shot — the first
     hall is the first shrine, and the two cuts were one picture twice — and
     never the panda clan, which has a shot of its own. */
  const halls = w?.clanHalls ?? [];
  const s0 = w?.shrines?.[0]?.position;
  const hall = halls.filter((h) => h.clan?.id !== 'panda' && h.shrine !== w?.shrines?.[0])
    .sort((a, b) => (s0 ? Math.hypot(a.x - s0.x, a.z - s0.z) - Math.hypot(b.x - s0.x, b.z - s0.z) : 0))[0] ?? halls[0];
  const pandaHall = halls.find((h) => h.clan?.id === 'panda');
  const dragon = (game.dragons ?? []).find((d) => d?.position && !d.hidden && d.visible !== false);
  // a panda is a kitten's (`player.panda`) or parked for one who left; early on there are none
  const panda = [...(game.players ?? []).map((p) => p?.panda), ...(game._parkedPandas?.values?.() ?? [])]
    .find((p) => p?.position);
  const ball = (w?.dragonBalls ?? game.balls ?? []).find?.((b) => !b?.held && !b?.taken && (b?.position || b?.group?.position));
  return {
    blocked: occluders(game),
    town: pick(town),
    payne: her,
    kitten: pick(kitten),
    centre: pick(B?.centre),
    radius: B?.radius,
    heap: heapOf(true) ?? heapOf(false),
    barrel: nearest(['barrel']),
    crate: nearest(['lantern']) ?? nearest(['crate', 'basket']),
    bamboo: grove ? v3(grove.x, ground(grove.x, grove.z), grove.z) : nearest(['bamboo']),
    grotto: G ? { x: G.x, y: G.y, z: G.z, r: G.r ?? 6, yaw: G.yaw ?? 0 } : null,
    clan: hall ? v3(hall.x, ground(hall.x, hall.z), hall.z) : null,
    pandaHall: pandaHall ? v3(pandaHall.x, ground(pandaHall.x, pandaHall.z), pandaHall.z) : null,
    shrine: pick(w?.shrines?.[0]?.position),
    dragon: pick(dragon?.position),
    panda: pick(panda?.position),
    star: pick(ball?.position ?? ball?.group?.position),
    arena: pick(w?.arenaCentre),
    dojo: pick(w?.dojoCentre),
    // `set` (the island the scene furnishes, payneset.js) is the actor's: Payne.startIntro
  };
}

/**
 * WHAT CAN STAND BETWEEN A LENS AND ITS SUBJECT, as upright cylinders: the
 * houses and trees the kittens bump into (`world.solids`, a tree's canopy
 * far wider than the trunk it collides with), the lanterns and gates
 * (`world.landmarks`, which no kitten collides with — the lantern in front
 * of Payne is one), the props still standing, and the ground itself. A
 * returned function counts the blocked samples along eye -> look, stopping
 * short of the look so the subject's own collider never counts against it.
 * Cylinders and not a raycast: a ray against the town's merged meshes is
 * 17ms (measured, 828 meshes, the terrain alone 7.6), and a cut tries a
 * dozen frames.
 */
function occluders(game) {
  const w = game.world;
  if (!w) return null;
  const C = [];
  for (const s of w.solids ?? []) {
    if (!Number.isFinite(s.x) || s.off) continue;
    if (s.house) C.push({ x: s.x, z: s.z, r: s.r + 0.5, top: 16 });
    else if (s.tree) C.push({ x: s.x, z: s.z, r: Math.max(3.2, s.r * 3.5), top: 12 });
    else C.push({ x: s.x, z: s.z, r: s.r + 0.3, top: 4 });
  }
  for (const L of w.landmarks ?? []) {
    if (!Number.isFinite(L.x)) continue;
    const sc = L.s ?? 1;
    // its cap, not its post: 0.9 let the cap stand over her shin
    if (L.kind === 'lantern') C.push({ x: L.x, z: L.z, r: 1.4 * sc, top: 2.4 * sc });
    else if (L.kind === 'torii') C.push({ x: L.x, z: L.z, r: 1.2 * sc, top: 9 * sc });
  }
  for (const p of w.props ?? []) {
    if (!p?.home || p.knocked || p.gone || p.kind === 'bamboo') continue;
    C.push({ x: p.home.x, z: p.home.z, r: 0.9, top: 2.2 });
  }
  const ground = (x, z) => {
    const g = w.heightAt?.(x, z);
    return g && Number.isFinite(g.y) ? g.y : -Infinity;
  };
  /* TWO SIGHT LINES, to the aim and to what stands under it: the lantern in
     front of Payne is 2 units tall and the line to her chest passes clean
     over it, while her knees are behind it. */
  const line = (eye, look) => {
    const dx = look.x - eye.x, dy = look.y - eye.y, dz = look.z - eye.z;
    const D = Math.hypot(dx, dz);
    /* SHORT OF THE LOOK BY LESS THAN A LANTERN: the one in front of Payne is
       2 units from her, and a 2.5 margin walked straight past it. Her own
       collider is `own`, so it needs no margin to keep it out. */
    const stop = Math.max(0, 1 - 0.6 / Math.max(D, 0.6));
    // the subject's own house or tree is what is being looked AT, not in the way
    // INSIDE it, not near it: `r + 1` swallowed the lantern 2 units from Payne once it grew
    const own = C.filter((o) => Math.hypot(o.x - look.x, o.z - look.z) < Math.max(1, o.r - 0.3));
    let n = 0;
    for (let i = 0; i <= 10; i++) {
      const t = (i / 10) * stop;
      const x = eye.x + dx * t, y = eye.y + dy * t, z = eye.z + dz * t;
      if (y < ground(x, z) + 0.2) { n++; continue; }
      for (const o of C) {
        if (Math.abs(o.x - x) > o.r || Math.abs(o.z - z) > o.r || own.includes(o)) continue;
        const base = ground(o.x, o.z);
        if (Math.hypot(o.x - x, o.z - z) < o.r && y < base + o.top) { n++; break; }
      }
    }
    return n;
  };
  return (eye, look) => {
    const low = Math.max(ground(look.x, look.z) + 1, look.y - 2.5);
    return line(eye, look) + (low < look.y - 0.5 ? line(eye, v3(look.x, low, look.z)) : 0);
  };
}

/* -------------------------------- her, drawn ------------------------------- */

/** Pixels a unit of her height gets on the stage canvas: full, and cautious. */
const STAGE_PX = 640;
const STAGE_PX_HALF = 320;
/** The bob of a held frame: world units, and seconds a breath. */
const BOB = { amp: 0.07, period: 1.7, breathe: 0.007, ease: 0.35 };

/**
 * PAYNE IN THE WORLD — StoryScene's `ctx.stage`: `start(row)` at each line,
 * `update(cue, dt)` on the clip's clock, `stop()` on the end AND the skip.
 *
 * THE PAGES ARE LOADED WHEN SHE IS, and each is drawn the moment it lands.
 * A cell whose page has not arrived falls back to her nearest real drawing
 * — `town` masked, `held` unmasked, the two the market already has, placed
 * by their own feet (payneframes.js `INTRO_REST`) — so a slow connection, a
 * missing folder or an old cache gets a still Payne who says every word
 * rather than nobody (ninth non-negotiable: delete public/sprites/payne/intro/
 * and the scene plays, minus the animation).
 */
export class PayneActor {
  /**
   * @param {object} game
   * @param {number} height her standing height in world units (PAYNE_HEIGHT)
   */
  constructor(game, height = 6) {
    this.game = game;
    this.height = height;
    /** clip -> [Image|null per page]. */
    this.pages = new Map();
    this.row = null;
    this.entry = -1;
    this.last = null; // { clip, cell }
    this.fadeT = 0;
    this.drawn = '';
    this.t = 0;
    this.bob = 0;
    this.group = null;
    this.set = new IntroSet(game);
  }

  /** The cautious tier gets the half-size set: a page's decode is the cost. */
  get half() {
    const max = this.game.device?.atlasMax ?? 2048;
    return max < 2048;
  }

  /** Fetch every page (once). The browser decodes as they are drawn. */
  load() {
    if (typeof Image === 'undefined') return;
    for (const clip of Object.keys(INTRO_CLIPS)) {
      if (this.pages.has(clip)) continue;
      const list = [];
      for (let k = 0; k < (INTRO_GEO[clip]?.pages ?? 0); k++) {
        const img = new Image();
        img.decoding = 'async';
        img.onerror = () => { list[k] = null; };
        img.src = pagePath(clip, k, this.half);
        list.push(img);
      }
      this.pages.set(clip, list);
    }
  }

  /** Let the pages go — they are ~15MB of WebP and a few hundred decoded. */
  unload() { this.pages.clear(); }

  /** Her quad, on her market spot: the stage canvas as its texture. */
  _build() {
    if (this.group || typeof document === 'undefined') return !!this.group;
    const S = INTRO_STAGE;
    const px = this.half ? STAGE_PX_HALF : STAGE_PX;
    this.px = px;
    this.cv = document.createElement('canvas');
    this.cv.width = Math.round((S.x1 - S.x0) * px);
    this.cv.height = Math.round((S.y1 - S.y0) * px);
    this.g2 = this.cv.getContext('2d');
    this.prev = document.createElement('canvas');
    this.prev.width = this.cv.width;
    this.prev.height = this.cv.height;
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.generateMipmaps = false;
    this.tex.minFilter = THREE.LinearFilter;
    const H = this.height;
    const geo = new THREE.PlaneGeometry((S.x1 - S.x0) * H, (S.y1 - S.y0) * H);
    // her FEET at the group's origin, wherever the stage's rectangle puts them
    geo.translate((S.x0 + S.x1) / 2 * H, (S.y0 + S.y1) / 2 * H, 0);
    this.mat = new THREE.MeshBasicMaterial({
      map: this.tex, transparent: true, alphaTest: 0.04, depthWrite: true,
      side: THREE.DoubleSide, toneMapped: false,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    const sg = new THREE.CircleGeometry(0.85 * H / 3.7, 18);
    sg.rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({
      color: 0x2a1830, transparent: true, opacity: 0.34, depthWrite: false,
    }));
    this.shadow.position.y = 0.03;
    this.group.add(this.shadow);
    return true;
  }

  start(row) {
    this.load();
    if (!this.on) {
      this.on = true;
      this._build();
      const P = this.game.payne;
      if (this.group && P?.position) {
        this.base = P.position.clone?.() ?? { ...P.position };
        this.group.position.set(this.base.x, this.base.y, this.base.z);
        this.game.scene?.add(this.group);
        /* HER OTHER SELF STEPS OFF. The market billboard is where this one
           stands, and two Paynes in one frame is a bug a nine-year-old would
           name. Back on in `stop`. */
        if (P.group) P.group.visible = false;
      }
      this.set.start();
    }
    if (this.row) this._hold();
    this.row = row;
    this.entry = -1;
    this.set.line(row);
  }

  /** Keep the frame on show, to fade out under the next clip. */
  _hold() {
    if (!this.cv) return;
    const g = this.prev.getContext('2d');
    g.clearRect(0, 0, this.prev.width, this.prev.height);
    g.drawImage(this.cv, 0, 0);
    this.fadeT = CROSSFADE;
  }

  update(cue, dt = 1 / 60) {
    this.t += dt;
    const cam = this.game.storyScene?.camera;
    this.set.update(dt, cam);
    if (!this.row?.act || !this.g2) return;
    const { clip, cell, entry, held } = actFrame(this.row.act, Math.max(0, cue));
    /* A CUT BETWEEN CLIPS IS A CROSSFADE — two takes do not meet on the same
       pose — UNLESS it is one performance carried on (the halt into its
       laugh, the shrug into its salute, the unmask across two lines). */
    if (entry !== this.entry) {
      if (this.last && !seamless(this.last.clip, this.last.cell, clip, cell)) this._hold();
      this.entry = entry;
    }
    this.last = { clip, cell };
    this.fadeT = Math.max(0, this.fadeT - dt);
    const key = `${clip}:${cell}:${this.fadeT > 0 ? Math.round(this.fadeT * 60) : 0}`;
    if (key !== this.drawn) {
      this.drawn = key;
      this._draw(clip, cell);
      this.tex.needsUpdate = true;
    }
    /* A HELD FRAME BREATHES. Richard: "It is okay if she holds some still
       frames when needed after an animation or can add some slight bobbing
       animations during dull moments". Eased in once a frame has been held
       a moment, and out the instant she moves again. */
    const want = held > IDLE_AFTER ? 1 : 0;
    this.bob += (want - this.bob) * Math.min(1, dt / BOB.ease);
    const ph = (this.t / BOB.period) * Math.PI * 2;
    if (this.group && this.base) {
      this.group.position.y = this.base.y + this.bob * BOB.amp * (0.5 - 0.5 * Math.cos(ph));
      this.mesh.scale.y = 1 + this.bob * BOB.breathe * Math.sin(ph);
    }
    // TURNED TO THE LENS, about the vertical only, so she stands up straight.
    if (cam && this.group) {
      this.mesh.rotation.y = Math.atan2(cam.position.x - this.group.position.x, cam.position.z - this.group.position.z);
    }
  }

  /** Where a rectangle in her units lands on the stage, in pixels. */
  _rect(g) {
    const S = INTRO_STAGE;
    const px = this.px;
    return [(g.x0 - S.x0) * px, (S.y1 - g.y1) * px, (g.x1 - g.x0) * px, (g.y1 - g.y0) * px];
  }

  _draw(clip, cell) {
    const cv = this.cv;
    const g = this.g2;
    const G = INTRO_GEO[clip];
    const page = G && this.pages.get(clip)?.[Math.floor(cell / G.perPage)];
    const ok = page && page.complete && page.naturalWidth > 0;
    g.clearRect(0, 0, cv.width, cv.height);
    if (ok) {
      /* MEASURED OFF THE PAGE, NEVER ASSUMED (eighth non-negotiable): a page
         holds `on` cells `cols` across, so its cell is its own width and
         height over those — the half set is the same code. */
      const on = Math.min(G.perPage, G.n - Math.floor(cell / G.perPage) * G.perPage);
      const cols = Math.min(G.cols, on);
      const rows = Math.ceil(on / G.cols);
      const cw = page.naturalWidth / cols;
      const ch = page.naturalHeight / rows;
      const j = cell % G.perPage;
      g.drawImage(page, (j % G.cols) * cw, Math.floor(j / G.cols) * ch, cw, ch, ...this._rect(G));
    } else {
      // Her still: the market's own drawing, by its own feet.
      const art = maskedIn(clip, cell) ? 'town' : 'held';
      const img = this.game.payne?.img?.[art];
      if (img?.naturalWidth) g.drawImage(img, ...this._rect(INTRO_REST[art]));
    }
    if (this.fadeT > 0) {
      g.globalAlpha = this.fadeT / CROSSFADE;
      g.drawImage(this.prev, 0, 0);
      g.globalAlpha = 1;
    }
  }

  stop() {
    this.row = null;
    this.entry = -1;
    this.last = null;
    this.fadeT = 0;
    this.drawn = '';
    this.bob = 0;
    this.on = false;
    if (this.group) {
      this.group.parent?.remove(this.group);
      this.mesh.geometry.dispose();
      this.shadow.geometry.dispose();
      this.shadow.material.dispose();
      this.mat.dispose();
      this.tex.dispose();
      this.group = null;
    }
    const P = this.game.payne;
    if (P?.group) P.group.visible = true;
    this.set.stop();
    this.unload();
  }
}
