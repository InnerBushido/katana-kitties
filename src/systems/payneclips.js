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

   THREE TAKES, ALL KLING 3.0 AT 960x960, 24fps, on flat magenta, locked off.
   They are cut so she never changes drawing between them:
   · MASK  (72ea3ebe, 121 frames) — from her approved `held` drawing, the
     helmet goes ON. Played BACKWARDS it is the unmask; forwards, the re-mask.
     Her face is always the approved one, because every take starts from it.
   · TALK  (8ad8a78d, 241 frames) — from `held`: unmasked, helmet under her
     arm, talking, pointing up, counting, waving, laughing.
   · MASKED (289ff712, 241 frames) — from MASK's last frame: masked talking,
     hands to the helmet, and a salute at the end.

   THE TEA CEREMONY SHIPPED 192px A CELL. These are 768 tall — four times —
   and as wide as her widest gesture needs (one crop for EVERY frame of every
   take, so she neither swims nor changes size at a cut).

   EIGHT FRAMES A SECOND, EVERY THIRD FRAME: real time, "on threes", which is
   how hand-drawn animation is timed anyway. `step: 2` is twelve.

   A CLIP IS `take`, `from`..`to` (24fps frame numbers read off a contact
   sheet of the take — out/payne/*_contact.png) by `step`, and how it plays:
   `pingpong` loops forward and back (a talking loop with no seam), `once`
   plays and holds its last frame.
--------------------------------------------------------------------------- */

export const INTRO_TAKES = {
  mask: 'docs/art-masters/video/payne_mask_72ea3ebe.mp4',
  talk: 'docs/art-masters/video/payne_talk_8ad8a78d.mp4',
  masked: 'docs/art-masters/video/payne_masked_289ff712.mp4',
};

export const INTRO_FPS = 8;
/** Cells across a page; a page is at most `INTRO_PER_PAGE` cells. */
export const INTRO_COLS = 4;
export const INTRO_PER_PAGE = 16;
/** Cell height, full and on the cautious tier (`device.atlasMax` reduced). */
export const INTRO_CELL_H = 768;
export const INTRO_CELL_H_HALF = 384;

export const INTRO_CLIPS = {
  // Masked, hands out, talking (MASKED 70-110).
  maskedTalk: { take: 'masked', from: 70, to: 110, step: 3, loop: 'pingpong' },
  // "...a face you can't see, right? Fine. Fine!" — hands go to the helmet.
  maskedHands: { take: 'masked', from: 112, to: 130, step: 2, loop: 'once' },
  // The helmet going on, peace sign to fist on hip. Backwards: coming off.
  mask: { take: 'mask', from: 0, to: 120, step: 3, loop: 'once' },
  talk: { take: 'talk', from: 14, to: 64, step: 3, loop: 'pingpong' },
  // "Look up." — her arm goes up and points.
  // Not to 112: by then the arm is down and it is the count's first finger.
  point: { take: 'talk', from: 72, to: 105, step: 3, loop: 'pingpong' },
  // One finger, then two: counting the job off.
  count: { take: 'talk', from: 116, to: 160, step: 3, loop: 'pingpong' },
  wave: { take: 'talk', from: 166, to: 196, step: 3, loop: 'pingpong' },
  laugh: { take: 'talk', from: 204, to: 240, step: 3, loop: 'pingpong' },
  // "Payne, out!"
  salute: { take: 'masked', from: 196, to: 240, step: 3, loop: 'once' },
};

/** The source frame numbers a clip is cut from, in order. */
export const clipFrames = (c) => {
  const out = [];
  for (let f = c.from; f <= c.to; f += c.step) out.push(f);
  return out;
};

/** How many pages a clip is laid on, and the file of page `k`. */
export const clipPages = (name) => Math.ceil(clipFrames(INTRO_CLIPS[name]).length / INTRO_PER_PAGE);
export const pagePath = (name, k, half = false) => `/sprites/payne/intro/${half ? 'half/' : ''}${name}_${k}.webp`;
