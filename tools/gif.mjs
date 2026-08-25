/* A GIF89a encoder, dependency-free, to sit beside png.mjs.
   =======================================================================

   WHY THIS EXISTS. The Help menu wants short moving clips of the four special
   moves and the feast, and every other thing in this game is generated rather
   than recorded (ninth non-negotiable). A screen-grabber would have put a
   Windows window border, a mouse cursor and a paid watermark into a kids'
   how-to-play — so the frames are captured off the game's own canvas and
   encoded here instead. png.mjs already proved the shape of this: a small,
   commented, zlib-free codec that the tools own outright.

   WHAT IT DOES NOT DO. One GLOBAL palette for the whole clip, and no local
   colour tables. A shared 256 is what stops a clip flickering as the palette
   swaps under it, and gameplay footage — one sky, one set of cats, one deck —
   quantises to 256 without banding you would notice at 640px.

   WHAT IT DOES DO, SINCE THE MOVEMENT CLIP. Frames used to be full
   replacements, which was simpler to be sure of and cost what it cost. Then
   "Moving & fighting" came in at 121 frames of a detailed island and encoded
   to 4.1MB — twice the biggest clip in the game — and dropping the palette
   from 128 colours to 96 saved seven per cent, which is the number that says
   the palette was never the problem. Every frame was paying full price for a
   caption bar, an input diagram and most of a hillside that had not changed.

   So a frame now stores only what MOVED: pixels equal to the previous frame
   are written as a reserved transparent index, and the image descriptor is
   cropped to the bounding box of what actually differs, under disposal method
   1 (leave the previous frame in place). Two things make that safe here —
   the palette is global, so an unchanged pixel maps to the same index every
   time, and dithering is off for these clips, so "unchanged" really is
   bit-identical rather than merely close. With Floyd–Steinberg ON the error
   diffusion perturbs whole rows and almost nothing matches, so the diff
   quietly buys nothing; it is never WRONG, just pointless, and `diff: false`
   turns it off outright.

   THE TWO HARD PARTS, and how each is kept honest:
     - QUANTISE. Median-cut over a sample of every frame, so the palette is the
       clip's, not the first frame's. A move that flashes one bright colour on
       the third frame (the Cross Slash's seal is exactly this) would be
       posterised by a first-frame palette.
     - MAP. Nearest-colour is 256 comparisons per pixel and a clip is ~20M
       pixels, so it is cached in a 15-bit cube (32768 cells): each distinct
       colour is searched once and every later pixel of that colour is a
       lookup. Floyd–Steinberg dithering is on by default and diffuses the
       rounding error forward, which is what keeps the sky a gradient instead
       of three bands.

   The output is a Buffer. See tools/gif-selftest.mjs for the round-trip that
   proves a decoder can read what this writes. */

/* ------------------------------- median cut ------------------------------ */

/* One box in colour space: a slice of the sample it will average to a palette
   entry. Median cut splits the box with the widest channel, repeatedly, until
   there are as many boxes as colours wanted — which puts detail where the
   colours actually are rather than on a fixed grid. */
function medianCut(sample, maxColors) {
  // sample is a flat Uint8Array of RGB triples (alpha already dropped).
  const px = sample.length / 3;
  if (px === 0) return [[0, 0, 0]];
  let boxes = [{ lo: 0, hi: px }]; // half-open ranges into an index array
  const idx = new Uint32Array(px);
  for (let i = 0; i < px; i++) idx[i] = i;

  const channelRange = (lo, hi) => {
    let rmin = 255, gmin = 255, bmin = 255, rmax = 0, gmax = 0, bmax = 0;
    for (let i = lo; i < hi; i++) {
      const p = idx[i] * 3;
      const r = sample[p], g = sample[p + 1], b = sample[p + 2];
      if (r < rmin) rmin = r; if (r > rmax) rmax = r;
      if (g < gmin) gmin = g; if (g > gmax) gmax = g;
      if (b < bmin) bmin = b; if (b > bmax) bmax = b;
    }
    return [rmax - rmin, gmax - gmin, bmax - bmin];
  };

  while (boxes.length < maxColors) {
    // Split the box with the single widest channel. A box that is one colour
    // (range 0 on every channel) can never be worth splitting, so skip it.
    let best = -1, bestRange = 0, bestCh = 0;
    for (let bi = 0; bi < boxes.length; bi++) {
      const { lo, hi } = boxes[bi];
      if (hi - lo < 2) continue;
      const [dr, dg, db] = channelRange(lo, hi);
      const m = Math.max(dr, dg, db);
      if (m > bestRange) { bestRange = m; best = bi; bestCh = dr >= dg && dr >= db ? 0 : (dg >= db ? 1 : 2); }
    }
    if (best < 0) break; // every box is a single colour — done early

    const { lo, hi } = boxes[best];
    // Sort this box's slice by the widest channel and cut at the median.
    const slice = Array.from(idx.subarray(lo, hi));
    slice.sort((a, b) => sample[a * 3 + bestCh] - sample[b * 3 + bestCh]);
    for (let i = lo; i < hi; i++) idx[i] = slice[i - lo];
    const mid = (lo + hi) >> 1;
    boxes.splice(best, 1, { lo, hi: mid }, { lo: mid, hi });
  }

  // Each box averages to one palette colour.
  return boxes.map(({ lo, hi }) => {
    let r = 0, g = 0, b = 0;
    for (let i = lo; i < hi; i++) {
      const p = idx[i] * 3;
      r += sample[p]; g += sample[p + 1]; b += sample[p + 2];
    }
    const n = Math.max(1, hi - lo);
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  });
}

/* --------------------------- nearest, cached ----------------------------- */

/* A 15-bit cube (5 bits per channel) memoising colour -> palette index. The
   first pixel of a colour pays the 256-way search; every later one is a read.
   Keyed on the ROUNDED colour so dithered pixels, which are never exactly a
   sample colour, still share cells. */
function nearestFinder(palette) {
  const cache = new Int16Array(32768).fill(-1);
  const pr = palette.map((c) => c[0]);
  const pg = palette.map((c) => c[1]);
  const pb = palette.map((c) => c[2]);
  return (r, g, b) => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const hit = cache[key];
    if (hit >= 0) return hit;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const dr = r - pr[i], dg = g - pg[i], db = b - pb[i];
      // Rec.601-ish weighting: the eye reads green error hardest, blue softest.
      const d = dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114;
      if (d < bestD) { bestD = d; best = i; }
    }
    cache[key] = best;
    return best;
  };
}

/* --------------------------------- LZW ----------------------------------- */

/* GIF's variable-width LZW. Codes start at minCodeSize+1 bits and grow by one
   each time the dictionary fills, resetting on a clear code — the format's own
   dialect, not the same as PNG's DEFLATE, which is why this is hand-rolled. */
function lzwEncode(indices, minCodeSize) {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let dict = new Map();
  const resetDict = () => {
    dict = new Map();
    for (let i = 0; i < clear; i++) dict.set(String(i), i);
  };
  resetDict();
  let next = eoi + 1;
  let codeSize = minCodeSize + 1;

  const out = [];
  let cur = 0, curBits = 0;
  const emit = (code) => {
    cur |= code << curBits;
    curBits += codeSize;
    while (curBits >= 8) { out.push(cur & 0xff); cur >>= 8; curBits -= 8; }
  };

  emit(clear);
  let prefix = String(indices[0]);
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const combined = prefix + ',' + k;
    if (dict.has(combined)) {
      prefix = combined;
    } else {
      emit(dict.get(prefix));
      dict.set(combined, next++);
      if (next > (1 << codeSize) && codeSize < 12) codeSize++;
      else if (next > 4095) { emit(clear); resetDict(); next = eoi + 1; codeSize = minCodeSize + 1; }
      prefix = String(k);
    }
  }
  emit(dict.get(prefix));
  emit(eoi);
  if (curBits > 0) out.push(cur & 0xff);
  return out;
}

/* --------------------------------- write --------------------------------- */

const u16 = (n) => [n & 0xff, (n >> 8) & 0xff];

/**
 * Encode a clip to a GIF89a Buffer.
 *
 * @param {Array<Uint8Array|Uint8ClampedArray>} frames  one RGBA buffer per
 *        frame, each width*height*4 bytes, all the same size.
 * @param {object} opts
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {number} [opts.delayMs=60]  per-frame delay; GIF stores it in
 *        centiseconds, so it rounds to the nearest 10ms.
 * @param {number[]} [opts.delaysMs]  ONE DELAY PER FRAME, overriding delayMs.
 *        A held beat — "read this dialog", "look at what you just bought" — is
 *        then ONE frame that sits on screen for a second, not seven identical
 *        frames at 140ms. Short entries are floored at 20ms, which is what
 *        browsers honour.
 * @param {boolean} [opts.diff=true]  store only the pixels that changed since
 *        the previous frame, cropped to their bounding box. Worth roughly half
 *        the file on a clip with a static caption bar and overlay; worth
 *        nothing with `dither` on, because error diffusion perturbs pixels
 *        that did not really change. See the header.
 * @param {number} [opts.loop=0]      0 = forever (Netscape extension).
 * @param {number} [opts.maxColors=256]
 * @param {boolean} [opts.dither=true] Floyd–Steinberg.
 * @param {number} [opts.sample=20000] pixels per frame fed to the quantiser.
 * @returns {Buffer}
 */
export function encodeGIF(frames, opts) {
  const { width: w, height: h } = opts;
  const delayCs = Math.max(2, Math.round((opts.delayMs ?? 60) / 10));
  const perFrameCs = Array.isArray(opts.delaysMs)
    ? opts.delaysMs.map((d) => Math.max(2, Math.round((Number(d) || 0) / 10)))
    : null;
  const loop = opts.loop ?? 0;
  const maxColors = Math.min(256, opts.maxColors ?? 256);
  const dither = opts.dither !== false;
  if (!frames.length) throw new Error('gif: no frames');

  /* --- build the palette from a sample of every frame --- */
  const perFrame = Math.max(1, Math.floor((opts.sample ?? 20000)));
  const sample = new Uint8Array(frames.length * perFrame * 3);
  let sp = 0;
  for (const f of frames) {
    const px = (w * h);
    const step = Math.max(1, Math.floor(px / perFrame));
    for (let i = 0; i < px && sp < sample.length - 2; i += step) {
      const q = i * 4;
      sample[sp++] = f[q]; sample[sp++] = f[q + 1]; sample[sp++] = f[q + 2];
    }
  }
  /* ONE COLOUR IS SPENT ON THE TRANSPARENT SLOT, taken off the quantiser
     rather than hoped for afterwards. The first cut of this asked for the full
     `maxColors` and then used the transparent index only if the palette
     happened to come back short — which at the default of 256 it never does,
     so differencing was off exactly when the clips were biggest. Giving up one
     entry of 256 is invisible; giving up half the file size is not. */
  const wantDiff = opts.diff !== false && frames.length > 1;
  const palette = medianCut(sample.subarray(0, sp), Math.max(2, maxColors - (wantDiff ? 1 : 0)));

  /* THE MAPPER IS BUILT BEFORE THE TABLE IS PADDED, and that ordering is
     load-bearing twice over. `nearestFinder` searches every entry it is given,
     so padding first would let a near-black pixel match a filler [0,0,0] —
     and, worse, would let it match the TRANSPARENT slot, which would punch
     holes in the picture wherever the image happened to be dark. Only real
     quantised colours are ever visible to it. */
  const nearest = nearestFinder(palette);

  /* One index means "unchanged since the previous frame". It is appended
     after the mapper exists, so nothing can be mapped to it; its RGB is never
     drawn, and black is as good as anything. If the palette is genuinely full
     at 256 there is no room and differencing is simply off — that is the only
     case where the caller asks for it and does not get it. */
  const transIdx = (wantDiff && palette.length < 256) ? palette.length : -1;
  if (transIdx >= 0) palette.push([0, 0, 0]);

  while (palette.length < maxColors && palette.length < 256) palette.push([0, 0, 0]);

  // Global colour table must be a power of two; find how many bits it needs.
  let bits = 1;
  while ((1 << bits) < palette.length) bits++;
  const tableSize = 1 << bits;              // 2..256
  const minCodeSize = Math.max(2, bits);    // GIF floors the code size at 2

  /* --- map each frame to indices, dithering forward --- */
  const framesIdx = frames.map((f) => {
    const idx = new Uint8Array(w * h);
    // Work on a signed copy so error diffusion can push a channel past 0..255.
    const buf = dither ? Float32Array.from(f) : null;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const q = (y * w + x) * 4;
        let r, g, b;
        if (dither) {
          r = buf[q]; g = buf[q + 1]; b = buf[q + 2];
        } else {
          r = f[q]; g = f[q + 1]; b = f[q + 2];
        }
        const ci = nearest(clamp(r), clamp(g), clamp(b));
        idx[y * w + x] = ci;
        if (dither) {
          const er = r - palette[ci][0];
          const eg = g - palette[ci][1];
          const eb = b - palette[ci][2];
          spread(buf, w, h, x + 1, y, q + 4, er, eg, eb, 7 / 16);
          spread(buf, w, h, x - 1, y + 1, q + (w - 1) * 4, er, eg, eb, 3 / 16);
          spread(buf, w, h, x, y + 1, q + w * 4, er, eg, eb, 5 / 16);
          spread(buf, w, h, x + 1, y + 1, q + (w + 1) * 4, er, eg, eb, 1 / 16);
        }
      }
    }
    return idx;
  });

  /* --- assemble the file --- */
  const bytes = [];
  const push = (...b) => { for (const x of b) bytes.push(x); };
  // Header + logical screen descriptor.
  push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);      // "GIF89a"
  push(...u16(w), ...u16(h));
  push(0x80 | ((bits - 1) & 7));                  // global table, bits-1
  push(0, 0);                                     // bg index, aspect
  for (let i = 0; i < tableSize; i++) {
    const c = palette[i] ?? [0, 0, 0];
    push(c[0], c[1], c[2]);
  }
  // Netscape 2.0 loop extension.
  push(0x21, 0xff, 0x0b);
  push(...'NETSCAPE2.0'.split('').map((c) => c.charCodeAt(0)));
  push(0x03, 0x01, ...u16(loop), 0x00);

  let prev = null;
  for (let fi = 0; fi < framesIdx.length; fi++) {
    const idx = framesIdx[fi];

    /* What actually changed, and the smallest rectangle holding it. The first
       frame is always whole — there is nothing to leave underneath it. */
    let x0 = 0, y0 = 0, fw = w, fh = h, sub = idx, useTrans = false;
    if (prev && transIdx >= 0) {
      let minX = w, minY = h, maxX = -1, maxY = -1;
      for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
          if (idx[row + x] === prev[row + x]) continue;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      if (maxX < 0) {
        /* NOTHING MOVED. A zero-size image is not legal, so this writes the
           smallest one there is — a single transparent pixel — and the delay
           on it still counts. That is what a genuinely held beat costs now:
           one pixel. */
        minX = minY = 0; maxX = maxY = 0;
      }
      x0 = minX; y0 = minY; fw = maxX - minX + 1; fh = maxY - minY + 1;
      sub = new Uint8Array(fw * fh);
      for (let y = 0; y < fh; y++) {
        const srow = (y + y0) * w + x0, drow = y * fw;
        for (let x = 0; x < fw; x++) {
          const v = idx[srow + x];
          sub[drow + x] = (v === prev[srow + x]) ? transIdx : v;
        }
      }
      useTrans = true;
    }

    /* Graphic control extension. Disposal method 1 — LEAVE THE PREVIOUS FRAME
       IN PLACE — is what makes a transparent pixel mean "keep what was there"
       rather than "show the background colour"; with the default 0 the clip
       flickers to bare canvas wherever nothing changed. A per-frame delay
       table wins over the single delay; a short table falls back for the rest. */
    const cs = (perFrameCs && perFrameCs[fi] != null) ? perFrameCs[fi] : delayCs;
    const flags = (1 << 2) | (useTrans ? 1 : 0);
    push(0x21, 0xf9, 0x04, flags, ...u16(cs), useTrans ? transIdx : 0x00, 0x00);
    // Image descriptor: the changed rectangle, no local table.
    push(0x2c, ...u16(x0), ...u16(y0), ...u16(fw), ...u16(fh), 0x00);
    push(minCodeSize);
    prev = idx;
    const data = lzwEncode(sub, minCodeSize);
    // Sub-blocks of at most 255 bytes, terminated by a zero-length block.
    for (let i = 0; i < data.length; i += 255) {
      const chunk = data.slice(i, i + 255);
      push(chunk.length, ...chunk);
    }
    push(0x00);
  }
  push(0x3b); // trailer
  return Buffer.from(bytes);
}

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

function spread(buf, w, h, x, y, base, er, eg, eb, f) {
  if (x < 0 || x >= w || y < 0 || y >= h) return;
  buf[base] += er * f;
  buf[base + 1] += eg * f;
  buf[base + 2] += eb * f;
}
