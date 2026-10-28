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
--------------------------------------------------------------------------- */

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

export const INTRO_CLIPS = {
  // Her two poses, standing: the first frame of a take, which is the drawing.
  restMasked: { take: 'halt', from: 0, to: 0, step: 1 },
  restHeld: { take: 'wag', from: 0, to: 0, step: 1 },
  // "Halt, traveller!" — palm out, held.
  halt: { take: 'halt', from: 4, to: 40, step: 3 },
  // "...Ha, kidding." — the palm drops into a laugh.
  haha: { take: 'halt', from: 46, to: 82, step: 3 },
  // "Come closer" — a beckon, and back to her pose.
  beckon: { take: 'halt', from: 84, to: 120, step: 3 },
  // "Stuck?" — palms up.
  shrug: { take: 'shrug', from: 28, to: 82, step: 3 },
  // "Payne, out!" — and held.
  salute: { take: 'shrug', from: 84, to: 120, step: 3 },
  // The helmet going on, peace sign to fist on hip. Backwards: coming off.
  mask: { take: 'mask', from: 0, to: 120, step: 3 },
  // "Ta-daa!" — the free arm flung out.
  tadaa: { take: 'point', from: 22, to: 46, step: 3 },
  // "Look up." — from her pose, up, and HELD with the fingertip in frame.
  pointUp: { take: 'point', from: 46, to: 120, step: 3 },
  // A peace sign, waggled.
  wag: { take: 'wag', from: 4, to: 61, step: 3 },
  // "Payne." / "Me?" — a thumb at herself, and back.
  thumb: { take: 'wag', from: 64, to: 118, step: 3 },
  talk: { take: 'talk', from: 14, to: 64, step: 3 },
  // One finger, then two: counting the job off.
  count: { take: 'talk', from: 116, to: 160, step: 3 },
  wave: { take: 'talk', from: 166, to: 196, step: 3 },
  laugh: { take: 'talk', from: 204, to: 240, step: 3 },
};

/** The source frame numbers a clip is cut from, in order. */
export const clipFrames = (c) => {
  const out = [];
  for (let f = c.from; f <= c.to; f += c.step) out.push(f);
  return out;
};

/** The file of page `k` of a clip, full or half. */
export const pagePath = (name, k, half = false) => `/sprites/payne/intro/${half ? 'half/' : ''}${name}_${k}.webp`;
