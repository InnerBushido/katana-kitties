/**
 * The little rasteriser the Help page's PLACEHOLDER stills are drawn with.
 *
 * LIFTED OUT OF `help-blink-placeholder.mjs` WHEN A SECOND ONE NEEDED IT
 * (`help-riposte-placeholder.mjs`), and lifted rather than copied: two copies
 * of an antialiased ellipse drift the first time somebody fixes one of them,
 * and then the two stills in one grid stop looking like one set. The move was
 * checked byte for byte — `blink.png` regenerated through this module is the
 * same file it was before, which is what makes the lift safe to have made.
 *
 * Everything here is alpha-over onto one RGBA buffer, in the order it is
 * called; `silhouette` is the one exception, and its note says why.
 */

/** @returns the buffer and every drawing call, bound to it. */
export function raster(W, H) {
  const d = new Uint8ClampedArray(W * H * 4);

  /* A SILHOUETTE IS DRAWN ONCE OR IT IS NOT TRANSLUCENT. Everything below builds
     its shapes out of overlapping discs, and alpha-over is not idempotent: a
     ghost at 0.2 stacked forty deep along one arm comes out opaque, which is
     precisely what the first render of the Flash Step still did — the two
     vanishing kittens were faint everywhere except their arms, where they were
     solid. So a body is drawn into a COVERAGE MASK (max, not add, so overlap is
     free) and composited in a single pass at the end. Same reason the game's
     own translucent things are one material and not a pile of them. */
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

  /** A ring of a given thickness. `gapAt` cuts the four bracket gaps that
   *  make it read as a TARGET and not as a bubble — the same `cos(4a)` test
   *  `systems/dodgefx.js` draws its ring with. */
  function ring(cx, cy, r, thick, c, a = 1, gapAt = null) {
    for (let y = Math.floor(cy - r - thick); y <= cy + r + thick; y++) {
      for (let x = Math.floor(cx - r - thick); x <= cx + r + thick; x++) {
        const t = Math.hypot(x - cx, y - cy);
        const e = Math.abs(t - r);
        if (e > thick) continue;
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

  /** The arena at dusk over warm planks, and a vignette — the ground both
   *  stills stand on, so two of them side by side are one set. */
  function stage(horizon) {
    for (let y = 0; y < horizon; y++) {
      const t = y / horizon;
      bar(0, y, W, 1, [22 + t * 26, 20 + t * 30, 44 + t * 40]);
    }
    for (let y = horizon; y < H; y++) {
      const t = (y - horizon) / (H - horizon);
      bar(0, y, W, 1, [96 + t * 34, 66 + t * 26, 42 + t * 16]);
    }
    for (let y = horizon + 10; y < H; y += 22) bar(0, y, W, 1, [70, 48, 30], 0.5);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = Math.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2));
        if (t > 0.72) px(x, y, [0, 0, 0], (t - 0.72) * 0.55);
      }
    }
  }

  /** One cat, in white, feet at (x, ground), for `silhouette` to colour.
   *  `pose` picks the arms; `face` is -1 to mirror her (she looks left).
   *  `extra(x, h, bw, bh, hy, hr)` draws anything a still needs that the two
   *  shared poses do not have. */
  function body(x, h, ground, pose, face = 1, extra = null) {
    const c = [255, 255, 255], a = 1;
    const y = ground;
    const bw = h * 0.21, bh = h * 0.31;
    const hy = y - h * 0.72, hr = h * 0.19;
    const f = face;
    // tail — a flick of discs, so the silhouette is unmistakably a cat
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      /* `f * bw * 0.9` and `f * t * h * 0.26`, NOT `f * (bw * 0.9 + ...)`:
         at f = 1 these are the Flash Step still's own expressions to the
         last bit, which is what let it be regenerated byte-identical. */
      disc(x - f * bw * 0.9 - f * t * h * 0.26, y - h * 0.34 - Math.sin(t * 2.1) * h * 0.20,
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
      /* TWO FINGERS TO THE FOREHEAD — the Flash Step's own sprite sheet. */
      seg(x - f * bw * 0.6, y - bh * 1.1, x - f * hr * 0.42, hy - hr * 0.22, h * 0.045, c, a);
      disc(x - f * hr * 0.30, hy - hr * 0.30, h * 0.05, c, a);
    } else if (pose === 'blade') {
      // the arm, and the katana out along it
      seg(x + f * bw * 0.5, y - bh * 1.2, x + f * h * 0.30, y - h * 0.86, h * 0.04, c, a);
      seg(x + f * h * 0.30, y - h * 0.86, x + f * h * 0.52, y - h * 1.16, h * 0.028, c, a);
    }
    extra?.(x, h, bw, bh, hy, hr, c, a);
  }

  return { d, px, silhouette, ell, disc, ring, bar, seg, text, stage, body };
}

/* --------------------------------------------------------------------------
   A 5x7 alphabet, and only the letters these pictures say. UNKNOWN LETTERS
   DRAW A BOX rather than nothing: a caption that has silently lost half its
   letters is worse than one that is visibly missing a glyph, and the box is
   the thing that sends whoever changed the wording back down here.
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

export const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
