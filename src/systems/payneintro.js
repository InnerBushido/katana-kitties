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
   asked for by name. What this file adds is the two things that scene could
   not know: WHERE THE SHOTS ARE (`introShot`, pure, over `introCtx`'s places)
   and PAYNE HERSELF on the stage (`PayneActor`), animated off the sheets
   `payneclips.js` describes.

   SHE IS A CANVAS IN THE CUTSCENE'S DOM, NOT A QUAD IN THE WORLD. The
   ending's Patchfur is a quad parked in front of the lens; that was right for
   one still drawing and is wrong for 150 frames of 603x768: a quad is a GPU
   upload every time the frame changes, and its size on a phone is a sum of
   field-of-view and distance that the stylesheet cannot reach. A canvas under
   #cs-fade dips to black with the picture, stands on the bottom letterbox bar
   like a stage, and has a `body.touch-ui` rule like every other screen.

   NOTHING HANGS OFF IT FINISHING. `Payne.startIntro` marks every seated
   kitten as having seen it, and the kitten who opened her as having met her,
   BEFORE `start` — skip it on its first frame and both are already true.
--------------------------------------------------------------------------- */
import {
  INTRO_CLIPS, INTRO_FPS, INTRO_COLS, INTRO_PER_PAGE, clipFrames, clipPages, pagePath,
} from './payneclips.js';

/**
 * THE SCRIPT. The card and the recording are one string (docs/notes/voices.md):
 * `payne_intro_N` is a render of exactly `text`, Pixie, like all her lines.
 *
 * `act` is what she does on the stage, cued on the clip's own clock — each
 * entry `[clip, at, from?, to?]` starts at `at` seconds and runs until the
 * next. `from`/`to` are cell indices into the clip, for the one clip played
 * both ways (`mask`: backwards is the helmet coming OFF). The cues are the
 * recordings' measured pauses (silencedetect -32dB, 0.12s):
 *   2 "Fine." 2.72, "Fine!" 3.53 — her hands go up on the first, and the
 *     helmet starts to lift on the second, so it is OFF on "Ta-daa".
 *   3 "Payne." 0.80, "Hello!" 4.31.   4 "Look up." ends 0.41, talk from 4.66.
 *   6 "run faster" 7.06.   7 "So: furniture, fair game" 10.49.
 *   10 "Spoiler" 3.74.   11 "...Second greatest" 3.46.
 *   12 the re-mask is 41 cells, 5.1s, and lands before the clip's 11.76.
 */
const P = (n, text, shot, act) => ({ who: 'payne', voice: `payne_intro_${n}`, text, shot, act });

export const PAYNE_INTRO = [
  P(1, "Halt, traveller! ...Ha, kidding. Nobody ever halts. Come closer — this bit's important.",
    'market', [['maskedTalk', 0]]),
  P(2, "You can't trust a face you can't see, right? Fine. Fine!",
    'marketClose', [['maskedTalk', 0], ['maskedHands', 2.4], ['mask', 3.55, 28, 20]]),
  P(3, 'Ta-daa! Payne. Goblin. Professional helper. Hello!',
    'marketClose', [['mask', 0, 20, 0], ['wave', 3.9]]),
  P(4, 'Look up. These islands used to be ONE world. Then it got too tidy. Too still. And everything fell asleep — even the magic.',
    'lookUp', [['point', 0], ['talk', 4.66]]),
  P(5, "Every barrel, every lantern, every cane of bamboo is holding a tiny bit of sleeping power. Knock it over and — pop! — it's out.",
    'heap', [['talk', 0]]),
  P(6, "That power is kotodama. Word-spirits. Catch them and they're yours: run faster, jump higher, cut further.",
    'heapLow', [['talk', 0], ['count', 7.0]]),
  P(7, "In the old Shinto way, there's a spirit in every tree, every river, every living thing. So: furniture, fair game. But the dragons, the pandas, the little critters — you look after them. Hurt what's alive and that's bad karma, and bad karma follows you home.",
    'shrine', [['talk', 0], ['laugh', 10.49], ['talk', 12.3]]),
  P(8, "So here's the job. Find the seven dragon stars. Knock over EVERYTHING. Wake every sleeping kotodama.",
    'townWide', [['count', 0]]),
  P(9, 'Win the arena. Buy a home in the sky. Bring the clans and their creatures back where they belong.',
    'arena', [['count', 0]]),
  P(10, "Learn the maths the universe is secretly written in. Spoiler: it's circles.",
    'dojo', [['talk', 0], ['laugh', 3.74]]),
  P(11, "And become the greatest fighter there ever was. ...Second greatest. I'll be around.",
    'ring', [['point', 0], ['laugh', 3.46]]),
  P(12, "Me? I've got a mission. Out there are worlds with the opposite problem — too much order, too much boredom. Somebody has to go and mess them up.",
    'sky', [['talk', 0], ['mask', 6.15, 0, 40]]),
  P(13, 'Stuck? Come and find me. Payne, out!', 'market', [['salute', 0]]),
];

/** Clips she is wearing the helmet in, for the still she falls back to. */
const MASKED = new Set(['maskedTalk', 'maskedHands', 'salute']);
/** The `mask` clip's cell from which the helmet is on (read off its proof). */
const MASK_ON = 22;
/** How long the last frame of one clip takes to fade under the next. */
export const CROSSFADE = 0.22;

/**
 * The cell on show `t` seconds into an `act` entry. Pure, so world-check can
 * walk every line without a browser.
 * @returns {{clip: string, cell: number}}
 */
export function actFrame(act, t) {
  let j = 0;
  for (let i = 0; i < act.length; i++) if (t >= act[i][1]) j = i;
  const [clip, at, from, to] = act[j];
  const n = clipFrames(INTRO_CLIPS[clip]).length;
  const f = Math.max(0, Math.floor((t - at) * INTRO_FPS));
  if (from != null) {
    const len = Math.abs(to - from);
    const k = Math.min(f, len);
    return { clip, cell: from + Math.sign(to - from) * k, entry: j };
  }
  if (INTRO_CLIPS[clip].loop === 'once') return { clip, cell: Math.min(f, n - 1), entry: j };
  // pingpong: 0..n-1..1, period 2n-2.
  const p = Math.max(1, 2 * n - 2);
  const q = f % p;
  return { clip, cell: q < n ? q : p - q, entry: j };
}

/** Is she masked in this cell? Decides the still she falls back to. */
export const maskedIn = (clip, cell) => MASKED.has(clip) || (clip === 'mask' && cell >= MASK_ON);

/* ------------------------------- the shots -------------------------------- */

const v3 = (x, y, z) => ({ x, y, z });
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerpP = (a, b, k) => v3(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k));

/**
 * SHE STANDS ON THE RIGHT, SO EVERY SUBJECT IS FRAMED LEFT OF CENTRE. The
 * lens looks `LEAN` of its distance to the RIGHT of what it is about, which
 * puts the subject about a fifth of the frame left (fov 42, 16:9) — clear of
 * the 30% of the frame she takes, and over the dialogue box rather than
 * under it.
 */
export const LEAN = 0.2;

/** An orbiting frame on `P`: `dist` back, `up` high, from heading `yaw0` to
 *  `yaw1` (radians) as `k` runs 0..1, aimed `lookY` above it and leaning. */
function orbit(P, { dist, to = dist, up, lookY = 2, yaw0 = 0, yaw1 = yaw0 }, k) {
  const e = ease(clamp01(k));
  const a = lerp(yaw0, yaw1, e);
  const d = lerp(dist, to, e);
  const fx = Math.cos(a);
  const fz = Math.sin(a);
  const eye = v3(P.x - fx * d, P.y + up * d, P.z - fz * d);
  // Screen-right from this eye is (-fz, fx) in the ground plane.
  const look = v3(P.x - fz * d * LEAN, P.y + lookY, P.z + fx * d * LEAN);
  return { eye, look };
}

/** Which way the market looks at its subject from: from the town's middle
 *  out toward her, so the stalls are behind her rather than the sea. */
function headingFrom(a, b) {
  return Math.atan2(b.z - a.z, b.x - a.x);
}

/**
 * The camera for a named shot, `k` (0..1) through its line. `ctx` is
 * `introCtx`'s places; every one has a fallback, so a world with no arena or
 * no shrine aims somewhere real and never at NaN (ninth non-negotiable).
 * Returns StoryScene's shape: {pos, look, loc}.
 */
export function introShot(name, ctx, k = 0) {
  const town = ctx.town ?? v3(0, 4, 20);
  const her = ctx.payne ?? town;
  const out = (f) => ({ pos: f.eye, look: f.look, loc: 'real' });
  const h0 = headingFrom(town, her);
  switch (name) {
    case 'market':
      return out(orbit(her, { dist: 20, to: 16, up: 0.32, lookY: 3, yaw0: h0 - 0.35, yaw1: h0 - 0.15 }, k));
    case 'marketClose':
      return out(orbit(her, { dist: 13, to: 11, up: 0.28, lookY: 3, yaw0: h0 - 0.1, yaw1: h0 + 0.08 }, k));
    case 'lookUp': {
      /* "Look up." — a crane off the market into the sky over the
         archipelago, the ending's wide frame (`ctx.centre`, `ctx.radius`).
         The rise lands on "ONE world" (~2.2s of a 12.8s line). */
      const C = ctx.centre ?? town;
      const R = ctx.radius ?? 200;
      const a = orbit(her, { dist: 14, up: 0.3, lookY: 3, yaw0: h0 }, 0);
      const wide = orbit(C, { dist: R * 1.15, up: 0.55, lookY: 0, yaw0: h0, yaw1: h0 + 0.5 }, k);
      const e = ease(clamp01(k / 0.22));
      // Up first, then out: the look tips to the sky before the eye leaves.
      const look = e < 0.5
        ? lerpP(a.look, v3(a.look.x, a.look.y + 60, a.look.z), ease(e * 2))
        : lerpP(v3(a.look.x, a.look.y + 60, a.look.z), wide.look, ease(e * 2 - 1));
      return { pos: lerpP(a.eye, wide.eye, e), look, loc: 'real' };
    }
    case 'heap':
      return out(orbit(ctx.heap ?? town, { dist: 24, to: 19, up: 0.42, lookY: 1.5, yaw0: h0 + 0.6, yaw1: h0 + 0.95 }, k));
    case 'heapLow':
      return out(orbit(ctx.heap ?? town, { dist: 13, to: 11, up: 0.16, lookY: 2.5, yaw0: h0 + 1.6, yaw1: h0 + 1.9 }, k));
    case 'shrine': {
      /* A shrine for the spirit in every tree, then the dragon for "the
         dragons, the pandas, the little critters" (~6.9s of 21.9: 0.32). */
      if (k < 0.32 || !ctx.dragon) {
        const S = ctx.shrine ?? town;
        return out(orbit(S, { dist: 26, to: 21, up: 0.3, lookY: 4, yaw0: headingFrom(town, S) + Math.PI, yaw1: headingFrom(town, S) + Math.PI + 0.35 }, clamp01(k / 0.32)));
      }
      const D = ctx.dragon;
      return out(orbit(D, { dist: 30, to: 24, up: 0.3, lookY: 4, yaw0: headingFrom(town, D) + 2.4, yaw1: headingFrom(town, D) + 2.8 }, (k - 0.32) / 0.68));
    }
    case 'townWide':
      return out(orbit(town, { dist: 90, to: 80, up: 0.5, lookY: 0, yaw0: h0 + 2.2, yaw1: h0 + 2.6 }, k));
    case 'arena': {
      const A = ctx.arena ?? town;
      return out(orbit(A, { dist: 90, to: 74, up: 0.45, lookY: 4, yaw0: headingFrom(town, A), yaw1: headingFrom(town, A) + 0.3 }, k));
    }
    case 'dojo': {
      // From high over the rim: the circle is the subject, and it reads as one.
      const D = ctx.dojo ?? town;
      return out(orbit(D, { dist: 70, to: 62, up: 0.9, lookY: 0, yaw0: headingFrom(town, D) + 0.4, yaw1: headingFrom(town, D) + 0.8 }, k));
    }
    case 'ring': {
      const A = ctx.arena ?? town;
      return out(orbit(A, { dist: 34, to: 26, up: 0.22, lookY: 4, yaw0: headingFrom(town, A) + 1.4, yaw1: headingFrom(town, A) + 1.7 }, k));
    }
    case 'sky': {
      // From the market, tipping up and away into the sky: "out there".
      const a = orbit(her, { dist: 18, up: 0.24, lookY: 4, yaw0: h0 + 3.0 }, 0);
      const e = ease(clamp01(k));
      const fx = Math.cos(h0 + 3.0);
      const fz = Math.sin(h0 + 3.0);
      const far = v3(a.eye.x + fx * 600, a.eye.y + 420, a.eye.z + fz * 600);
      return { pos: lerpP(a.eye, v3(a.eye.x - fx * 6, a.eye.y + 3, a.eye.z - fz * 6), e), look: lerpP(a.look, far, e), loc: 'real' };
    }
    default:
      return out(orbit(her, { dist: 18, up: 0.3, lookY: 3, yaw0: h0 }, k));
  }
}

/**
 * The places, off the world as it is this afternoon. The heap is the
 * densest knot of props STILL STANDING near the town — "knock it over" is
 * said over things that can still be knocked over — falling back to any
 * props, and then to the market.
 */
export function introCtx(game) {
  const w = game.world;
  const town = game.townCentre?.() ?? w?.townCentre ?? null;
  const B = game._worldBounds?.();
  const pick = (a) => (a ? v3(a.x, a.y, a.z) : null);
  const heapOf = (standing) => {
    const props = (w?.props ?? []).filter((p) => p?.home && !p.gone && (!standing || !p.knocked)
      && (!town || Math.hypot(p.home.x - town.x, p.home.z - town.z) < 70));
    let best = 0;
    let at = null;
    for (const a of props) {
      let n = 0;
      let x = 0, y = 0, z = 0;
      for (const b of props) {
        if (Math.hypot(a.home.x - b.home.x, a.home.z - b.home.z) > 9) continue;
        n++; x += b.home.x; y += b.home.y; z += b.home.z;
      }
      if (n > best) { best = n; at = v3(x / n, y / n, z / n); }
    }
    return best >= 3 ? at : null;
  };
  const dragon = (game.dragons ?? []).find((d) => d?.position && !d.hidden && d.visible !== false);
  return {
    town: pick(town),
    payne: pick(game.payne?.position),
    centre: pick(B?.centre),
    radius: B?.radius,
    heap: heapOf(true) ?? heapOf(false),
    shrine: pick(w?.shrines?.[0]?.position),
    dragon: pick(dragon?.position),
    arena: pick(w?.arenaCentre),
    dojo: pick(w?.dojoCentre),
  };
}

/* -------------------------------- her, drawn ------------------------------- */

/**
 * PAYNE ON THE STAGE — StoryScene's `ctx.stage`: `start(row)` at each line,
 * `update(cue)` on the clip's clock, `stop()` on the end AND the skip.
 *
 * THE PAGES ARE LOADED WHEN SHE IS, and each is drawn the moment it lands.
 * A cell whose page has not arrived falls back to her nearest real drawing
 * — `town` masked, `held` unmasked, the two the market already has — so a
 * slow connection, a missing folder or an old cache gets a still Payne who
 * says every word rather than an empty stage (ninth non-negotiable: delete
 * public/sprites/payne/intro/ and the scene plays, minus the animation).
 */
export class PayneActor {
  constructor(game) {
    this.game = game;
    this.cv = typeof document !== 'undefined' ? document.getElementById('cs-actor') : null;
    this.g2 = this.cv?.getContext?.('2d') ?? null;
    /** clip -> [Image|null per page]. */
    this.pages = new Map();
    this.row = null;
    this.prev = null;
    this.fadeT = 0;
    this.drawn = '';
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
      for (let k = 0; k < clipPages(clip); k++) {
        const img = new Image();
        img.decoding = 'async';
        img.onerror = () => { list[k] = null; };
        img.src = pagePath(clip, k, this.half);
        list.push(img);
      }
      this.pages.set(clip, list);
    }
  }

  /** Let the pages go — they are ~8MB of WebP and ~280MB decoded. */
  unload() { this.pages.clear(); }

  start(row) {
    this.load();
    if (this.row) this._hold();
    this.row = row;
    this.entry = -1;
    if (this.cv) this.cv.classList.add('on');
    /* HER OTHER SELF STEPS OFF. Her billboard in the market is in two of
       the shots, and two Paynes in one frame is a bug a nine-year-old
       would name. Back on in `stop`. */
    const P = this.game.payne;
    if (P?.group) P.group.visible = false;
  }

  /** Keep the frame on show, to fade out under the next clip. */
  _hold() {
    if (!this.cv || !this.g2) return;
    this.prev ??= document.createElement('canvas');
    this.prev.width = this.cv.width;
    this.prev.height = this.cv.height;
    const g = this.prev.getContext('2d');
    g.clearRect(0, 0, this.prev.width, this.prev.height);
    g.drawImage(this.cv, 0, 0);
    this.fadeT = CROSSFADE;
  }

  update(cue, dt = 1 / 60) {
    if (!this.row?.act || !this.g2) return;
    const { clip, cell, entry } = actFrame(this.row.act, Math.max(0, cue));
    /* A CUT BETWEEN CLIPS IS A CROSSFADE. Two takes do not meet on the same
       pose, and the jump reads as a glitch on a drawing this big; a fifth of
       a second of the last frame fading under the next reads as a move. A
       `mask` entry continuing the last one (2 -> 3) is the same performance
       and is not faded. */
    if (entry !== this.entry) {
      const was = this.row.act[this.entry];
      const now = this.row.act[entry];
      if (this.entry >= 0 && !(was?.[0] === 'mask' && now[0] === 'mask')) this._hold();
      this.entry = entry;
    }
    this.fadeT = Math.max(0, this.fadeT - dt);
    const key = `${clip}:${cell}:${this.fadeT > 0 ? Math.round(this.fadeT * 60) : 0}`;
    if (key === this.drawn) return;
    this.drawn = key;
    this._draw(clip, cell);
  }

  _draw(clip, cell) {
    const cv = this.cv;
    const g = this.g2;
    const page = this.pages.get(clip)?.[Math.floor(cell / INTRO_PER_PAGE)];
    const ok = page && page.complete && page.naturalWidth > 0;
    if (ok) {
      /* MEASURED OFF THE PAGE, NEVER ASSUMED (eighth non-negotiable): a page
         holds `n` cells `INTRO_COLS` across, so its cell is its own width and
         height over those — the half set is the same code. */
      const onPage = Math.min(INTRO_PER_PAGE, clipFrames(INTRO_CLIPS[clip]).length - Math.floor(cell / INTRO_PER_PAGE) * INTRO_PER_PAGE);
      const cols = Math.min(INTRO_COLS, onPage);
      const rows = Math.ceil(onPage / INTRO_COLS);
      const cw = page.naturalWidth / cols;
      const ch = page.naturalHeight / rows;
      if (cv.width !== Math.round(cw) || cv.height !== Math.round(ch)) {
        cv.width = Math.round(cw);
        cv.height = Math.round(ch);
      }
      const j = cell % INTRO_PER_PAGE;
      g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(page, (j % INTRO_COLS) * cw, Math.floor(j / INTRO_COLS) * ch, cw, ch, 0, 0, cv.width, cv.height);
    } else {
      // Her still: the market's own drawing, feet on the canvas's bottom.
      const img = this.game.payne?.img?.[maskedIn(clip, cell) ? 'town' : 'held'];
      g.clearRect(0, 0, cv.width, cv.height);
      if (img?.naturalWidth) {
        const s = cv.height / img.naturalHeight;
        const w = img.naturalWidth * s;
        g.drawImage(img, (cv.width - w) / 2, 0, w, cv.height);
      }
    }
    if (this.fadeT > 0 && this.prev) {
      g.globalAlpha = this.fadeT / CROSSFADE;
      g.drawImage(this.prev, 0, 0, cv.width, cv.height);
      g.globalAlpha = 1;
    }
  }

  stop() {
    this.row = null;
    this.prev = null;
    this.fadeT = 0;
    this.drawn = '';
    if (this.cv) {
      this.cv.classList.remove('on');
      this.g2?.clearRect(0, 0, this.cv.width, this.cv.height);
    }
    const P = this.game.payne;
    if (P?.group) P.group.visible = true;
    this.unload();
  }
}
