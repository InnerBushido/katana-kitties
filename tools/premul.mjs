/* ---------------------------------------------------------------------------
   THE DOWNSAMPLE EVERY KEYED SPRITE GOES THROUGH. One copy, used by
   tools/sprite-bake.mjs and tools/capture/payne-sheet.mjs, so a sprite cut
   out of a video has the same edge as one baked from a still. It was a copy
   in each until the second one was written.
--------------------------------------------------------------------------- */

/**
 * Area-average downsample in PREMULTIPLIED alpha.
 *
 * Straight per-channel averaging is the bug that makes a keyed sprite grow a
 * pale halo: a pixel half on the wing and half on the (now transparent, still
 * WHITE) background averages to something halfway to white, and then gets 50%
 * alpha, so the fringe is drawn. Weighting colour by alpha means a cleared
 * pixel contributes nothing but its emptiness, which is the whole point of it.
 *
 * `under` is the colour left under a fully cleared pixel — white by default,
 * for sprite-bake's reason below; payne-sheet passes black for its own (its
 * pages are lossy WebP, where the colour under the clear bleeds a pixel in).
 */
export function resample(d, w, h, nw, nh, under = [255, 255, 255]) {
  const o = new Uint8ClampedArray(nw * nh * 4);
  const sx = w / nw;
  const sy = h / nh;
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.min(h, Math.ceil((y + 1) * sy));
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.min(w, Math.ceil((x + 1) * sx));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const p = (yy * w + xx) * 4;
          const al = d[p + 3] / 255;
          r += d[p] * al;
          g += d[p + 1] * al;
          b += d[p + 2] * al;
          a += al;
          n++;
        }
      }
      const q = (y * nw + x) * 4;
      if (a > 0) {
        o[q] = Math.round(r / a);
        o[q + 1] = Math.round(g / a);
        o[q + 2] = Math.round(b / a);
      } else {
        /* WHITE, NOT BLACK, under a fully cleared pixel. The runtime keyer
           runs again on the shipped file and floods from the border by
           COLOUR — `isBackgroundish` never looks at alpha — so a black
           border would stop the flood dead on its first pixel. Nothing is
           drawn from it either way; it just has to stay walkable. */
        o[q] = under[0]; o[q + 1] = under[1]; o[q + 2] = under[2];
      }
      o[q + 3] = Math.round((a / n) * 255);
    }
  }
  return o;
}
