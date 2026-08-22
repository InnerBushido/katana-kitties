/**
 * The trailer's 十, drawn rather than typed.
 *
 *   node tools/brush-kanji.mjs out/trailer/cross.png
 *
 * WHY THIS EXISTS. The Cross Slash card wants the orb's own kanji big and
 * alone on screen, and every way of TYPING it was tried first and looks wrong:
 *
 *   - ffmpeg drawtext with Yu Gothic Bold gives two hairlines about 8px wide.
 *   - Fattening those with borderw=20 gives a BOLDER PLUS SIGN. Worse: it now
 *     reads confidently as arithmetic.
 *   - drawtext has no weight axis to ask a .ttc for, so there is no third
 *     setting between those two.
 *   - A Mincho face would fix it — the flares and the dew-drop foot are what
 *     say "kanji" and not "plus" — but this is Windows and the only Japanese
 *     faces installed are Yu Gothic and MS Gothic, both geometric sans. There
 *     is nothing to fall back to.
 *
 * So the glyph is two brush strokes with a width profile: a horizontal that
 * lands blunt, thins across the middle and swells again before it lifts, and a
 * vertical that presses in at the top and tapers to a point at the foot. That
 * profile, plus five degrees of rise on the horizontal, is the entire
 * difference between a kanji and a plus sign.
 *
 * It also puts the card in the same register as the title art, which is brush
 * lettering the kids painted — a font here would have been the one typeset
 * thing in the whole trailer.
 *
 * Dependency-free and procedural, like everything else that makes an image in
 * this repo. Ninth non-negotiable.
 *
 * NOT wired into the game, on purpose. `PowerOrb.mark` is a canvas `Label` and
 * the orb wears its kanji at 40-odd pixels on a glowing ball, where the ball
 * does the reading for it — the code even says so at powerorb.js:112. This is
 * only for the one place the glyph has to carry a frame on its own.
 */
import { writeFileSync } from 'node:fs';
import { writePNG } from './png.mjs';

const W = 520;
const H = 520;
const OFF = 20;          // the strokes are laid out in a 480-box; centre it

const PINK = [0xff, 0x6f, 0xae];   // ORBS.tri.colour, powerorb.js
const INK = [0x1b, 0x0f, 0x16];    // the outline: black with a little plum in it
const OUTLINE = 11;                // half-width added all round
const SHADOW = 7;                  // and dropped this far, at 45% black

/* ---------------------------------------------------------------- strokes --
   Cubic beziers with a width profile. `w` is HALF the brush width in pixels,
   sampled along the curve — the shape of that curve is the glyph. */

const bez = (p, t) => {
  const u = 1 - t;
  return [
    u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0],
    u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1],
  ];
};

/** Piecewise-linear width profile: [[t, halfwidth], ...], t ascending. */
function profile(stops) {
  return (t) => {
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const [t0, w0] = stops[i - 1];
        const [t1, w1] = stops[i];
        const k = (t - t0) / (t1 - t0 || 1);
        return w0 + (w1 - w0) * k;
      }
    }
    return stops[stops.length - 1][1];
  };
}

/* 一 — the horizontal. Rises about five degrees to the right, because a
   horizontal that is actually horizontal is the other half of why the typed
   version reads as a plus. Presses in at 0.05, thinnest at 0.6, swells at 0.94
   and lifts. */
const HORIZ = {
  p: [[36, 238], [160, 216], [300, 204], [438, 196]],
  w: profile([[0, 19], [0.08, 22], [0.6, 15], [0.93, 22], [1, 9]]),
};

/* 丨 — the vertical. Leans very slightly left as it falls, widest just under
   the shoulder, and tapers to a dew-drop rather than stopping square. */
const VERT = {
  p: [[248, 44], [242, 176], [236, 316], [228, 470]],
  w: profile([[0, 17], [0.1, 25], [0.55, 21], [0.85, 17], [1, 5]]),
};

/* THERE IS NO THIRD STROKE. A short diagonal press entering the vertical is
   what a brush actually does, and it was drawn here first — as a stub angled up
   and left off the top of the stem. At this size it does not read as a brush
   landing, it reads as a lump somebody forgot to clean off. The entry is a
   width ramp on the vertical itself instead: 17 to 25 over the first tenth. */
const STROKES = [HORIZ, VERT];

/**
 * Stamp the strokes into an alpha buffer, each brush disk grown by `grow`.
 * Analytic per-pixel coverage, so the edges are antialiased without
 * supersampling the whole canvas.
 */
function raster(grow, dx = 0, dy = 0) {
  const a = new Float32Array(W * H);
  for (const s of STROKES) {
    /* Half a pixel between samples: the union of overlapping disks is then
       smooth without any seam-filling. */
    const steps = 900;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const [cx0, cy0] = bez(s.p, t);
      const cx = cx0 + OFF + dx;
      const cy = cy0 + OFF + dy;
      const r = s.w(t) + grow;
      if (r <= 0) continue;
      const x0 = Math.max(0, Math.floor(cx - r - 1));
      const x1 = Math.min(W - 1, Math.ceil(cx + r + 1));
      const y0 = Math.max(0, Math.floor(cy - r - 1));
      const y1 = Math.min(H - 1, Math.ceil(cy + r + 1));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          const cov = Math.max(0, Math.min(1, r + 0.5 - d));
          const k = y * W + x;
          if (cov > a[k]) a[k] = cov;
        }
      }
    }
  }
  return a;
}

const core = raster(0);
const edge = raster(OUTLINE);
const shade = raster(OUTLINE, 0, SHADOW);

/* ------------------------------------------------------------ composite ---
   Shadow under, outline over that, colour on top. Straight (unpremultiplied)
   RGBA, which is what writePNG and ffmpeg's overlay both want. */
const d = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i++) {
  const ac = core[i];
  const ae = edge[i];
  const as = shade[i] * 0.45;

  /* The outline colour is already the shadow colour, so the two only have to
     be combined in alpha — no colour blend to get wrong. */
  const a = Math.max(ae, as);
  if (a <= 0) continue;

  const r = INK[0] + (PINK[0] - INK[0]) * ac;
  const g = INK[1] + (PINK[1] - INK[1]) * ac;
  const b = INK[2] + (PINK[2] - INK[2]) * ac;

  d[i * 4] = r;
  d[i * 4 + 1] = g;
  d[i * 4 + 2] = b;
  d[i * 4 + 3] = Math.round(a * 255);
}

const dest = process.argv[2] ?? 'out/trailer/cross.png';
writeFileSync(dest, writePNG(W, H, d));

/* Report the inked bounds. If a change to the profiles ever pushes a stroke
   off the canvas this is where it shows, and a clipped brush stroke is exactly
   the kind of thing that looks deliberate at a glance. */
let x0 = W; let y0 = H; let x1 = 0; let y1 = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (d[(y * W + x) * 4 + 3] > 8) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
}
console.log(`${dest}  ${W}x${H}  ink ${x0}..${x1} x ${y0}..${y1}`);
if (x0 < 2 || y0 < 2 || x1 > W - 3 || y1 > H - 3) {
  console.error('  ! ink touches the edge of the canvas — the glyph is clipped');
  process.exit(1);
}
