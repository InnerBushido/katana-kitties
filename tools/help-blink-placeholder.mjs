/**
 * The still that stands in for `help/ability-blink.gif` until it is filmed.
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
import { ORB_BY_ID } from '../src/entities/powerorb.js';
import { PLAYER_STYLE } from '../src/core/palette.js';

/* The clip's frame, to the pixel — see the `<img width height>` on the four
   beside it, which world-check reads back off the GIF headers. */
const W = 640, H = 362;

const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const JADE = rgb(ORB_BY_ID.blink.color);
const EMBER = rgb(PLAYER_STYLE[0].colour);
const FOE = rgb(PLAYER_STYLE[1].colour);

const d = new Uint8ClampedArray(W * H * 4);

/* --------------------------------------------------------------------------
   A rasteriser, because png.mjs hands out bytes and nothing else. Every shape
   below is alpha-over on top of what is already there, so the order things are
   drawn in is the order they stack — the ghosts go down before the solid.
-------------------------------------------------------------------------- */
/* A SILHOUETTE IS DRAWN ONCE OR IT IS NOT TRANSLUCENT. Everything below builds
   its shapes out of overlapping discs, and alpha-over is not idempotent: a
   ghost at 0.2 stacked forty deep along one arm comes out opaque, which is
   precisely what the first render of this file did — the two vanishing kittens
   were faint everywhere except their arms, where they were solid. So a body is
   drawn into a COVERAGE MASK (max, not add, so overlap is free) and composited
   in a single pass at the end. Same reason the game's own translucent things
   are one material and not a pile of them. */
let MASK = null;

function px(x, y, c, a = 1) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  if (MASK) { const j = y * W + x; MASK[j] = Math.max(MASK[j], Math.min(1, a)); return; }
  const i = (y * W + x) * 4;
  const k = Math.min(1, a);
  d[i] = d[i] * (1 - k) + c[0] * k;
  d[i + 1] = d[i + 1] * (1 - k) + c[1] * k;
  d[i + 2] = d[i + 2] * (1 - k) + c[2] * k;
  d[i + 3] = 255;
}

/** Run `draw` into the mask, then lay the whole of it down in one colour. */
function silhouette(draw, c, a) {
  MASK = new Float32Array(W * H);
  draw();
  const m = MASK; MASK = null;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = m[y * W + x];
      if (k > 0) px(x, y, c, k * a);
    }
  }
}

/** A filled ellipse, antialiased on its rim so a silhouette is not a staircase. */
function ell(cx, cy, rx, ry, c, a = 1) {
  for (let y = Math.floor(cy - ry) - 1; y <= cy + ry + 1; y++) {
    for (let x = Math.floor(cx - rx) - 1; x <= cx + rx + 1; x++) {
      const u = (x - cx) / rx, v = (y - cy) / ry;
      const t = Math.hypot(u, v);
      if (t > 1.06) continue;
      px(x, y, c, a * Math.min(1, (1.06 - t) / (1.06 / Math.max(rx, ry) + 0.02)));
    }
  }
}

const disc = (cx, cy, r, c, a = 1) => ell(cx, cy, r, r, c, a);

/** A ring of a given thickness — the reticle is three of these. */
function ring(cx, cy, r, thick, c, a = 1, gapAt = null) {
  for (let y = Math.floor(cy - r - thick); y <= cy + r + thick; y++) {
    for (let x = Math.floor(cx - r - thick); x <= cx + r + thick; x++) {
      const t = Math.hypot(x - cx, y - cy);
      const e = Math.abs(t - r);
      if (e > thick) continue;
      /* The four bracket gaps that make it read as a TARGET and not as a
         bubble — the same `cos(4a)` test `systems/dodgefx.js` draws its ring
         with, so the placeholder and the real thing are the same shape. */
      if (gapAt !== null) {
        const ang = Math.atan2(y - cy, x - cx);
        if (Math.cos(4 * (ang - gapAt)) > 0.55) continue;
      }
      px(x, y, c, a * Math.min(1, (thick - e) / 1.2 + 0.2));
    }
  }
}

function bar(x0, y0, w, h, c, a = 1) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px(x, y, c, a);
}

function seg(x0, y0, x1, y1, w, c, a = 1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) * 2;
  for (let i = 0; i <= n; i++) disc(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, w, c, a);
}

/* --------------------------------------------------------------------------
   A 5x7 alphabet, and only the letters this picture says. UNKNOWN LETTERS DRAW
   A BOX rather than nothing: a caption that has silently lost half its letters
   is worse than one that is visibly missing a glyph, and the box is the thing
   that sends whoever changed the wording back down here.
-------------------------------------------------------------------------- */
const FONT = {
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#',
  C: '.###.|#...#|#....|#....|#....|#...#|.###.',
  D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
  E: '#####|#....|#....|####.|#....|#....|#####',
  H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  L: '#....|#....|#....|#....|#....|#....|#####',
  O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  P: '####.|#...#|#...#|####.|#....|#....|#....',
  R: '####.|#...#|#...#|####.|#..#.|#...#|#...#',
  ' ': '.....|.....|.....|.....|.....|.....|.....',
};
const MISSING = '#####|#...#|#...#|#...#|#...#|#...#|#####';

function text(s, x0, y0, k, c, a = 1) {
  let x = x0;
  for (const ch of s.toUpperCase()) {
    const rows = (FONT[ch] ?? MISSING).split('|');
    for (let r = 0; r < rows.length; r++) {
      for (let q = 0; q < rows[r].length; q++) {
        if (rows[r][q] === '#') bar(x + q * k, y0 + r * k, k, k, c, a);
      }
    }
    x += 6 * k;
  }
  return x;
}

/* --------------------------------------------------------------------------
   The picture. Left to right it is the move in order: she was there, she is
   gone, something silly is standing in the smoke, and she is behind him.
-------------------------------------------------------------------------- */
const HORIZON = 196;
const GROUND = 268;                 // where all four pairs of feet sit

// Sky: the arena at dusk, dark at the top so the jade reads off it.
for (let y = 0; y < HORIZON; y++) {
  const t = y / HORIZON;
  bar(0, y, W, 1, [22 + t * 26, 20 + t * 30, 44 + t * 40]);
}
// Deck: warm planks, banded rather than shaded so it stays flat and diagram-ish.
for (let y = HORIZON; y < H; y++) {
  const t = (y - HORIZON) / (H - HORIZON);
  bar(0, y, W, 1, [96 + t * 34, 66 + t * 26, 42 + t * 16]);
}
for (let y = HORIZON + 10; y < H; y += 22) bar(0, y, W, 1, [70, 48, 30], 0.5);

// Vignette, so the corners do not fight the caption tab.
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = Math.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2));
    if (t > 0.72) px(x, y, [0, 0, 0], (t - 0.72) * 0.55);
  }
}

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

function body(x, h, pose) {
  const c = [255, 255, 255], a = 1;
  const y = GROUND;
  const bw = h * 0.21, bh = h * 0.31;
  const hy = y - h * 0.72, hr = h * 0.19;
  // tail — a flick of discs, so the silhouette is unmistakably a cat
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    disc(x - bw * 0.9 - t * h * 0.26, y - h * 0.34 - Math.sin(t * 2.1) * h * 0.20,
      h * 0.045 * (1 - t * 0.5), c, a);
  }
  ell(x, y - h * 0.16, bw * 0.9, h * 0.16, c, a);          // haunches
  ell(x, y - bh - h * 0.06, bw, bh, c, a);                  // body
  disc(x, hy, hr, c, a);                                    // head
  for (const s of [-1, 1]) {                                // ears
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      disc(x + s * hr * (0.62 + t * 0.28), hy - hr * (0.72 + t * 0.62),
        hr * 0.30 * (1 - t * 0.85), c, a);
    }
  }
  if (pose === 'warp') {
    /* TWO FINGERS TO THE FOREHEAD. The whole reason the move gets its own
       sprite sheet, so the drawing that stands in for it had better show it. */
    seg(x - bw * 0.6, y - bh * 1.1, x - hr * 0.42, hy - hr * 0.22, h * 0.045, c, a);
    disc(x - hr * 0.30, hy - hr * 0.30, h * 0.05, c, a);
  } else if (pose === 'blade') {
    // ...and the one who arrived still has her katana out.
    seg(x + bw * 0.5, y - bh * 1.2, x + h * 0.30, y - h * 0.86, h * 0.04, c, a);
    seg(x + h * 0.30, y - h * 0.86, x + h * 0.52, y - h * 1.16, h * 0.028, c, a);
  }
}

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

writeFileSync(new URL('../public/help/ability-blink.png', import.meta.url), writePNG(W, H, d));
console.log(`[help] ability-blink.png  ${W}x${H}  jade #${ORB_BY_ID.blink.color.toString(16)}`);
