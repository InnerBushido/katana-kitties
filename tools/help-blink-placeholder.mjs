/**
 * The still that stands in for `help/ability/blink.gif` until it is filmed.
 *
 * WHY A DRAWING AND NOT A CAPTURE. Every other picture in the abilities card is
 * an engine capture, and this one will be too — `tools/capture/shots/` gets a
 * `blink.js` and the <img> swaps `src=` for `data-help-gif=`, which is the one
 * attribute the Help card was written to change. Until then the card would have
 * a hole in it, and a four-up grid with a gap reads as broken to the person it
 * was built for. So: a diagram of the move, in the move's own colours, sized
 * exactly like the clip that will replace it, so the swap moves nothing.
 *
 * IT IS NOT ALLOWED TO INVENT ITS COLOURS. The jade is read out of the orb
 * roster and the kitten out of `PLAYER_STYLE`, so a session that re-tints
 * either gets a placeholder that still matches the game — the same reason
 * nothing else in this project hard-codes a swatch. What it DOES invent is the
 * staging (where she stood, where she landed), and that is the whole reason it
 * says PLACEHOLDER across the corner: a diagram may lie about a pose, a capture
 * cannot, and nobody should mistake which one they are looking at.
 *
 *   node tools/help-blink-placeholder.mjs
 */
import { writeFileSync } from 'node:fs';
import { writePNG } from './png.mjs';
import { raster, rgb } from './placeholder-raster.mjs';
import { ORB_BY_ID } from '../src/entities/powerorb.js';
import { PLAYER_STYLE } from '../src/core/palette.js';

/* The clip's frame, to the pixel — see the `<img width height>` on the four
   beside it, which world-check reads back off the GIF headers. */
const W = 640, H = 362;

const JADE = rgb(ORB_BY_ID.blink.color);
const EMBER = rgb(PLAYER_STYLE[0].colour);
const FOE = rgb(PLAYER_STYLE[1].colour);

/* THE RASTERISER IS SHARED NOW (`placeholder-raster.mjs`), with the
   Riposte's still — see there for why it was lifted and how the lift was
   checked. */
const { d, px, silhouette, ell, disc, ring, bar, seg, text, stage, body: cat } = raster(W, H);

/* --------------------------------------------------------------------------
   The picture. Left to right it is the move in order: she was there, she is
   gone, something silly is standing in the smoke, and she is behind him.
-------------------------------------------------------------------------- */
const HORIZON = 196;
const GROUND = 268;                 // where all four pairs of feet sit

stage(HORIZON);

const FROM = 146, TO = 404, FOE_X = 536;

/* The path, drawn as a dashed jade arc. It is dashed because she is NOT on it
   — nothing travels, that is the point of the move — and an unbroken streak
   would teach a dash. */
for (let i = 0; i <= 60; i++) {
  if (i % 6 > 3) continue;
  const t = i / 60;
  const x = FROM + (TO - FROM) * t;
  const y = GROUND - 58 - Math.sin(t * Math.PI) * 46;
  disc(x, y, 2.6, JADE, 0.5);
}

/** One kitten, feet at (x, GROUND). `pose` picks the arms. */
function kitten(x, h, c, a, pose) {
  silhouette(() => body(x, h, pose), c, a);
  // the shadow she casts, or does not
  if (a > 0.5) ell(x, y0(), h * 0.24, h * 0.07, [24, 16, 12], 0.42 * a);
}

const y0 = () => GROUND + 3;

const body = (x, h, pose) => cat(x, h, GROUND, pose);

const HT = 118;

// 1. WHERE SHE WAS — two ghosts, going.
kitten(FROM, HT, EMBER, 0.20, 'warp');
kitten(FROM + 44, HT, EMBER, 0.10, 'warp');

// 2. THE SMOKE, AND THE THING LEFT STANDING IN IT.
for (let i = 0; i < 34; i++) {
  const ang = (i / 34) * Math.PI * 2 + i * 0.7;
  const rad = 16 + (i % 5) * 11;
  disc(FROM + Math.cos(ang) * rad * 1.1, GROUND - 34 + Math.sin(ang) * rad * 0.62,
    9 + (i % 4) * 4, [226, 231, 240], 0.13);
}
{ /* THE NINJA LOG, ON END, WITH ITS GRAIN SHOWING. Lighter than the deck it
     stands on, because the first pass drew it in almost the plank's own brown
     and it read as a hole in the floor rather than as a thing. */
  const lx = FROM, lw = 21, top = GROUND - 74, bot = GROUND - 2;
  ell(lx, bot, lw, 8, [96, 60, 32], 1);                              // it sits ON the deck
  bar(lx - lw, top, lw * 2, bot - top, [124, 80, 44], 1);            // a CYLINDER, not a vase
  bar(lx - lw, top, 7, bot - top, [150, 100, 56], 0.55);             // lit edge
  bar(lx + lw - 6, top, 6, bot - top, [86, 54, 28], 0.5);            // and the dark one
  ell(lx, top, lw, 8, [186, 140, 88], 1);                            // the cut end
  ring(lx, top, 12, 1.8, [138, 96, 54], 0.85);                       // rings, because it is a log
  ring(lx, top, 6, 1.5, [138, 96, 54], 0.7);
  disc(lx + 7, GROUND - 40, 4.2, [88, 56, 30], 0.9);                 // a knot
  ell(lx, GROUND + 4, lw * 1.2, 7, [24, 16, 12], 0.4);
}

// 3. THE ONE SHE PIVOTED AROUND, AND THE TARGET LOCKED ONTO HIM.
kitten(FOE_X, HT, FOE, 1, null);
{
  const cy = GROUND - HT * 0.62;
  ring(FOE_X, cy, 52, 3.0, EMBER, 0.95, 0);      // her colour, not his — she aimed it
  ring(FOE_X, cy, 40, 1.6, EMBER, 0.45);
  for (const [sx, sy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    seg(FOE_X + sx * 62, cy + sy * 62, FOE_X + sx * 46, cy + sy * 46, 1.8, EMBER, 0.85);
  }
  disc(FOE_X, cy, 3, EMBER, 0.9);
}

// 4. WHERE SHE CAME OUT — solid, on her feet, already facing him.
kitten(TO, HT, EMBER, 1, 'blade');
/* The steel goes on AFTER the silhouette, in its own colour — inside it the
   mask would have flattened it to fur. */
seg(TO + HT * 0.30, GROUND - HT * 0.86, TO + HT * 0.52, GROUND - HT * 1.16,
  HT * 0.026, [236, 241, 255], 1);
ring(TO, GROUND - 6, 40, 2.2, JADE, 0.55);       // the jade flash under her landing
ring(TO, GROUND - 6, 26, 1.4, JADE, 0.30);

/* THE CORNER TAB. Bottom-left, where no clip has anything in it, and in the
   orb's own jade so it reads as part of the move rather than as an error. */
bar(0, H - 30, 150, 30, [10, 12, 18], 0.82);
bar(0, H - 30, 150, 2, JADE, 0.9);
text('PLACEHOLDER', 10, H - 21, 2, JADE, 0.95);

writeFileSync(new URL('../public/help/ability/blink.png', import.meta.url), writePNG(W, H, d));
console.log(`[help] ability-blink.png  ${W}x${H}  jade #${ORB_BY_ID.blink.color.toString(16)}`);
