/**
 * The still that stands in for a `help/ability/riposte.gif` until it is filmed.
 *
 * THE FLASH STEP'S ARGUMENT, A SECOND TIME. Every other cell in the abilities
 * grid is an engine capture; a grid with a hole in it reads as broken, so this
 * is a diagram of the move, in the move's own colours, at the clip's exact
 * size, stamped PLACEHOLDER — see `help-blink-placeholder.mjs`, whose drawing
 * code this shares (`placeholder-raster.mjs`).
 *
 * WHAT IT HAS TO SAY IS THE RULE, NOT THE POSE. The move is "a blow from in
 * front is stopped and answered; from behind it is not", and the one thing on
 * screen in the real game that says which half is guarded is the half-disc
 * `systems/parryfx.js` lays on the floor. So the half-disc is the biggest thing
 * here, drawn toward the sister swinging at her, with the clash where her blade
 * meets the guard and the answer already on its way back.
 *
 *   node tools/help-riposte-placeholder.mjs
 */
import { writeFileSync } from 'node:fs';
import { writePNG } from './png.mjs';
import { raster, rgb } from './placeholder-raster.mjs';
import { ORB_BY_ID } from '../src/entities/powerorb.js';
import { PLAYER_STYLE } from '../src/core/palette.js';

const W = 640, H = 362;
const STEEL = rgb(ORB_BY_ID.parry.color);
const EMBER = rgb(PLAYER_STYLE[0].colour);
const FOE = rgb(PLAYER_STYLE[1].colour);

const { d, px, silhouette, ell, disc, ring, bar, seg, text, stage, body } = raster(W, H);

const HORIZON = 196;
const GROUND = 268;
const HT = 118;
stage(HORIZON);

const ME = 388;          // Ember, guarding, facing LEFT
const THEM = 214;        // her sister, lunging in from the left

/* THE GUARD. Half an ellipse on the deck — a circle seen from the camera's
   height — on the side facing the blade, and nothing on the other side: the
   picture of "infront of the player doing the riposte and not behind them".
   Its rim is the steel. */
{
  const rx = 132, ry = 32, cy = GROUND + 2;
  /* One pass of `px`, not a disc per pixel: overlapping discs stack their
     alpha, which is `silhouette`'s whole lesson, and the first render of this
     came out as a fill nobody could see at 0.08 and would have come out solid
     at anything higher. */
  for (let y = Math.floor(cy - ry) - 1; y <= cy + ry + 1; y++) {
    for (let x = ME - rx - 1; x <= ME; x++) {
      const t = Math.hypot((x - ME) / rx, (y - cy) / ry);
      if (t <= 1) px(x, y, EMBER, 0.22 * (0.5 + 0.5 * t));
    }
  }
  for (let i = 0; i <= 180; i++) {
    const a = Math.PI / 2 + (i / 180) * Math.PI;
    disc(ME + Math.cos(a) * rx, cy + Math.sin(a) * ry, 2.2, STEEL, 0.8);
  }
  seg(ME, cy - ry, ME, cy + ry, 1.2, STEEL, 0.35);           // the flat edge: the line she cannot see past
}

const CLASH = [ME - HT * 0.40, GROUND - HT * 1.02];
const HAND = [THEM + HT * 0.34, GROUND - HT * 0.74];

/* HER SISTER, mid-lunge, arm out toward her. NOT the shared 'blade' pose:
   that one draws the katana INSIDE the silhouette, pointing up and away, and
   the first render had a pink sword going one way and the steel going the
   other. Here the arm is fur and the whole blade is steel. */
silhouette(() => body(THEM, HT, GROUND, null, 1, (x, h, bw, bh, hy, hr, c, a) => {
  seg(x + bw * 0.5, GROUND - bh * 1.2, HAND[0], HAND[1], h * 0.04, c, a);
}), FOE, 1);
ell(THEM, GROUND + 3, HT * 0.24, HT * 0.07, [24, 16, 12], 0.42);

// EMBER, facing her, blade up across the line of it.
silhouette(() => body(ME, HT, GROUND, null, -1, (x, h, bw, bh, hy, hr, c, a) => {
  seg(x - bw * 0.5, GROUND - bh * 1.2, x - h * 0.30, GROUND - h * 0.80, h * 0.04, c, a);
}), EMBER, 1);
ell(ME, GROUND + 3, HT * 0.24, HT * 0.07, [24, 16, 12], 0.42);

/* The two blades, in steel, on top of their silhouettes — the sister's
   reaching in, Ember's upright and crossing it. */
seg(HAND[0], HAND[1], CLASH[0] - 4, CLASH[1] + 6, HT * 0.026, [236, 241, 255], 1);
seg(ME - HT * 0.30, GROUND - HT * 0.80, ME - HT * 0.46, GROUND - HT * 1.30, HT * 0.026, [236, 241, 255], 1);

// THE CLASH: a burst of rays and a ring, the loudest thing a sword does.
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2 + 0.2;
  const r0 = 8, r1 = i % 2 ? 26 : 40;
  seg(CLASH[0] + Math.cos(a) * r0, CLASH[1] + Math.sin(a) * r0,
    CLASH[0] + Math.cos(a) * r1, CLASH[1] + Math.sin(a) * r1, 1.6, [255, 255, 255], 0.9);
}
ring(CLASH[0], CLASH[1], 20, 2.4, STEEL, 0.9);
disc(CLASH[0], CLASH[1], 7, [255, 255, 255], 1);

/* THE ANSWER, already on its way: a crescent in her colour from under the
   clash down across her sister's chest — below the blades, so the catch and
   the reply are two things and not one tangle. Dashed at its tail and solid
   at its head, so it reads as a swing that is happening, not a shape that is
   there. A quadratic curve, because that is the arc a cut makes on screen. */
{
  const S = [ME - HT * 0.22, GROUND - HT * 0.62];
  const C = [ME - HT * 0.95, GROUND - HT * 0.20];
  const E = [THEM + HT * 0.30, GROUND - HT * 0.44];
  for (let i = 0; i <= 90; i++) {
    const t = i / 90;
    const u = 1 - t;
    const x = u * u * S[0] + 2 * u * t * C[0] + t * t * E[0];
    const y = u * u * S[1] + 2 * u * t * C[1] + t * t * E[1];
    if (t < 0.4 && i % 6 > 2) continue;
    disc(x, y, 1.4 + t * 3.6, EMBER, 0.4 + t * 0.55);
  }
  /* The head of it, where it lands: a short slash-mark on her sister. */
  seg(E[0] - 16, E[1] - 14, E[0] + 10, E[1] + 12, 2.2, [255, 255, 255], 0.9);
}

bar(0, H - 30, 150, 30, [10, 12, 18], 0.82);
bar(0, H - 30, 150, 2, STEEL, 0.9);
text('PLACEHOLDER', 10, H - 21, 2, STEEL, 0.95);

writeFileSync(new URL('../public/help/ability/riposte.png', import.meta.url), writePNG(W, H, d));
console.log(`[help] ability-riposte.png  ${W}x${H}  steel #${ORB_BY_ID.parry.color.toString(16)}`);
