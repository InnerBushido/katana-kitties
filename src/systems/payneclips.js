/* ---------------------------------------------------------------------------
   PAYNE'S INTRODUCTION, AS ANIMATION — which frames of which take, and how
   they play. Read by the game (systems/payneintro.js) AND by the tool that
   cuts them (tools/capture/payne-sheet.mjs), so a clip cannot be cut with one
   length and played with another.

   Richard, Oct 2026: "let's create the animations in a similar way we
   generated the animations for the Tea Ceremony ... using a video generator
   and then generating a sprite sheet/atlas from the video, let's make sure
   that the video quality is high quality and that we generate the sprites in
   a high quality as well, at least 3 or 4x's higher quality than we did for
   the tea ceremony as that looked low resolution."

   SIX TAKES, ALL KLING 3.0 (std), 24fps, on flat magenta, locked off. Every
   one starts from an approved drawing, so her face is always the approved
   one and she never changes drawing at a cut:
   · MASK  (72ea3ebe, 960x960, 121 frames) — from `held`, the helmet goes ON.
     Played BACKWARDS it is the unmask; forwards, the re-mask.
   · TALK  (8ad8a78d, 960x960, 241) — from `held`: talking, counting,
     waving, laughing. Its pointing is retired (POINT replaces it).
   · HALT  (c6b72072, 720x1280, 121) — from `town`, helmet ON: palm out,
     a laugh, a beckon, back to her pose (an end image pins the return).
   · SHRUG (6975fd35, 720x1280, 121) — from `town`: palms up, then a salute
     held to the end.
   · POINT (bb16dc52, 720x1280, 121) — from `held`: ta-daa, then pointing
     straight up and HELD.
   · WAG   (999697c0, 720x1280, 121) — from `held`: a peace-sign waggle and
     a thumb at herself, back to her pose.
   The four tall ones were made Oct 2026 for two notes of Richard's: the old
   MASKED take "shows her with the helmet on but you can see her face" (from
   about frame 60 Kling turned the closed helmet into a half-mask with her
   grin under it), and "when she points to the sky, her hand is getting cut
   off" (the old point's fingertip reached y=3 of 960). They are 9:16 with the
   start drawing at 60% of the frame's height, so a raised arm has 0.58 of her
   own height above her head to go into; and the masked prompts say, in as
   many words, that the faceplate never opens. MASKED (289ff712) is retired
   and kept in docs/art-masters/video/ as the record of what went wrong.

   ONE SCALE FOR EVERY TAKE, MEASURED. The 960 takes have her ~940px tall and
   the tall ones ~770: `payne-sheet.mjs` measures each take's FIRST frame,
   which is the approved drawing it started from (`from`, below), and makes
   that drawing's ink height one unit and its feet the origin. Every clip is
   cropped to its own ink in those units, and the game places it by its feet
   (payneframes.js, generated), so she neither swims nor changes size at a
   cut, and a clip with her arm up is simply taller than one with it down.

   EIGHT FRAMES A SECOND, EVERY THIRD FRAME: real time, "on threes", which is
   how hand-drawn animation is timed anyway.

   A CLIP IS `take`, `from`..`to` (24fps frame numbers read off a contact
   sheet of the take) by `step`, and it plays ONCE and holds its last frame.
   Richard, Oct 2026: "We shouldn't repeat the animations in a loop or
   ping-pong as it looks strange. It is okay if she holds some still frames
   when needed after an animation or can add some slight bobbing animations
   during dull moments". The `pingpong` loops that were here are gone, and a
   held frame bobs (systems/payneintro.js).
   ONE EXCEPTION, ASKED FOR LATER: `back: true` plays it there and back ONCE
   — out, held `apex` seconds, and home — and then holds its FIRST frame.
   Richard, on "kidding": "ping-pong the shrug animation at the end so that
   it ends at RestMasked like we started". A return, not a loop: it never
   goes round twice.
--------------------------------------------------------------------------- */
import CLIPS from '../payneclips.json' with { type: 'json' };

export const INTRO_TAKES = {
  mask: 'docs/art-masters/video/payne_mask_72ea3ebe.mp4',
  talk: 'docs/art-masters/video/payne_talk_8ad8a78d.mp4',
  halt: 'docs/art-masters/video/payne_halt_c6b72072.mp4',
  shrug: 'docs/art-masters/video/payne_shrug_6975fd35.mp4',
  point: 'docs/art-masters/video/payne_point_bb16dc52.mp4',
  wag: 'docs/art-masters/video/payne_wag_999697c0.mp4',
};

/** The approved drawing each take started from — its first frame IS that
 *  drawing, which is what the scale is measured off. `town` is masked. */
export const TAKE_FROM = { mask: 'held', talk: 'held', halt: 'town', shrug: 'town', point: 'held', wag: 'held' };

export const INTRO_FPS = 8;
/** At most this many cells across a page, and no page past `PAGE_MAX` px. */
export const INTRO_COLS = 4;
export const PAGE_MAX = 4096;
/** Pixels a cell gives one unit of her height: full, and the cautious tier. */
export const INTRO_UNIT_PX = 760;
export const INTRO_UNIT_PX_HALF = 380;

/* THE CLIPS ARE DATA, in src/payneclips.json, so the sprite editor can make
   and save them (/sprites.html, its PAYNE tab) and the review page can name
   them. Richard, Oct 2026: "section off and create my own sprite animation
   clips in the Sprite Editor that I can save and can reference, by name ...
   so that it can be used in the cutscene editor". Each is
   { take, from, to, step, note } and optionally `back` (see `clipRun`). A
   clip added there is cut into pages by payne-sheet.mjs like any other. */
export const INTRO_CLIPS = CLIPS;

/** The source frame numbers a clip is cut from, in order. */
export const clipFrames = (c) => {
  const out = [];
  for (let f = c.from; f <= c.to; f += c.step) out.push(f);
  return out;
};

/**
 * Where a clip is `t` seconds after it started: the cell, and how long the
 * frame it stopped on has been held (0 while it moves — the bob waits on it).
 * ONE FUNCTION FOR THE GAME AND THE SPRITE EDITOR, so a clip previewed there
 * is the clip played here. `from`/`to` are FRAMES OF THE TAKE — the same
 * numbers the clip itself is cut from — backwards when to < from, and held to
 * the clip's own ends; `rate` a speed-up. A `back` clip goes out, holds `apex`
 * seconds, comes home, and holds its first cell.
 *
 * THEY WERE CELLS until Oct 30, counted from the clip's first frame. Richard:
 * "I trimmed out the first 6 frames of mask, but in line 2, rather than
 * starting after the trim, it is still starting at frame 0 but just showing no
 * sprite." A trim slid every cell number along under the cues that used it,
 * so line 2's "cell 40" pointed past the end of what was now a 39-cell clip,
 * and drew nothing. A frame of the take does not move when a clip is trimmed,
 * and one the trim has cut off is held at the clip's end rather than drawn as
 * a hole: it degrades instead of vanishing.
 */
export function clipRun(C, t, { from, to, rate = 1 } = {}) {
  const n = clipFrames(C).length;
  const cellOf = (f) => Math.max(0, Math.min(n - 1, Math.round((f - C.from) / C.step)));
  const a = from == null ? 0 : cellOf(from);
  const b = to == null ? n - 1 : cellOf(to);
  const len = Math.abs(b - a);
  const dir = Math.sign(b - a);
  const fps = INTRO_FPS * rate;
  const s = Math.max(0, t);
  const run = s * fps;
  if (!C.back || len === 0) {
    const k = Math.min(Math.floor(run), len);
    return { cell: a + dir * k, held: len === 0 ? s : Math.max(0, (run - len) / fps) };
  }
  const apex = (C.apex ?? 0) * fps;
  const total = 2 * len + apex;
  let k;
  if (run < len) k = Math.floor(run);
  else if (run < len + apex) k = len;
  else k = Math.max(0, len - Math.floor(run - len - apex));
  return { cell: a + dir * k, held: Math.max(0, (run - total) / fps) };
}

/** The file of page `k` of a clip, full or half. */
export const pagePath = (name, k, half = false) => `/sprites/payne/intro/${half ? 'half/' : ''}${name}_${k}.webp`;

/**
 * Draw `cell` of a clip off its loaded `page` into `rect` ([x, y, w, h]).
 * `G` is the clip's INTRO_GEO entry. Shared by her actor in the game and the
 * sprite editor's PAYNE tab, so the editor cannot show a cell the game would
 * cut differently.
 * MEASURED OFF THE PAGE, NEVER ASSUMED (eighth non-negotiable): a page holds
 * `on` cells `cols` across, so its cell is its own width and height over
 * those — the half set is the same code.
 */
export function blitCell(g, page, G, cell, rect) {
  const on = Math.min(G.perPage, G.n - Math.floor(cell / G.perPage) * G.perPage);
  const cols = Math.min(G.cols, on);
  const rows = Math.ceil(on / G.cols);
  const cw = page.naturalWidth / cols;
  const ch = page.naturalHeight / rows;
  const j = cell % G.perPage;
  g.drawImage(page, (j % G.cols) * cw, Math.floor(j / G.cols) * ch, cw, ch, ...rect);
}
