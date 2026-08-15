import * as THREE from 'three';

/* ---------------------------------------------------------------------------
   Turns a generated character turnaround (N views on a white background, at
   whatever spacing and scale the image model felt like) into a clean, uniform
   N-cell sprite atlas with a transparent background.

   Two steps that matter:

   1. Background removal is a *flood fill from the borders*, not a global white
      threshold. The cats have cream chests, white paws and white eyes — a
      threshold would punch holes straight through them. Flooding inward stops
      at the black lineart, so interior whites survive.

   2. Views get re-packed. The model spaces the four poses unevenly and draws
      them at slightly different sizes; left as-is the sprite visibly jumps and
      resizes as the player turns. Detecting each view's bounding box and
      re-drawing them at a shared scale, bottom-aligned, kills that.
--------------------------------------------------------------------------- */

function isBackgroundish(d, i) {
  const r = d[i];
  const g = d[i + 1];
  const b = d[i + 2];
  if (r < 218 || g < 218 || b < 218) return false;
  // Reject anything with a colour cast — keeps pale cream fur out of the fill.
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx - mn < 26;
}

/**
 * Mark every pixel within `radius` of the keyed-out background.
 *
 * A multi-source BFS seeded from the transparent pixels that touch something
 * opaque — not from all of them, which on a sheet that is mostly background
 * would be millions of starts for the same answer. Any path from deeper
 * background to an opaque pixel crosses one of those seeds, so the two agree.
 */
function nearOutsideMask(d, w, h, radius) {
  const seen = new Uint8Array(w * h);
  const q = new Int32Array(w * h);
  const clear = (p) => d[p * 4 + 3] === 0;
  let tail = 0;

  for (let p = 0; p < w * h; p++) {
    if (!clear(p)) continue;
    const x = p % w;
    const y = (p / w) | 0;
    if ((x > 0 && !clear(p - 1)) || (x < w - 1 && !clear(p + 1))
      || (y > 0 && !clear(p - w)) || (y < h - 1 && !clear(p + w))) {
      seen[p] = 1;
      q[tail++] = p;
    }
  }

  let head = 0;
  let edge = tail;
  for (let step = 0; step < radius; step++) {
    while (head < edge) {
      const p = q[head++];
      const x = p % w;
      const y = (p / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const np = ny * w + nx;
          if (seen[np]) continue;
          seen[np] = 1;
          q[tail++] = np;
        }
      }
    }
    edge = tail;
  }
  return seen;
}

/**
 * Clear SEALED pockets of background the border flood could never reach.
 *
 * The flood is the right algorithm and the reason is in the header: the cats
 * have cream chests and white paws, so a global white threshold punches holes
 * through them. But it has one blind spot by construction — background that
 * the drawn lineart completely encloses. Ryuuseki's whiskers meet his jaw and
 * seal a pocket under his chin, which came through as a solid white blob
 * hanging off the front of the dragon.
 *
 * SIZE AND PURITY WERE THE FIRST RULE AND THEY ATE MR. SATAN'S FACE. Measured
 * on Ryuuseki's sheet they looked decisive — the chin pockets were pure and
 * thousands of pixels, the teeth were 190 — so the rule was "big and pure".
 * Then a character arrived who is drawn grinning, and his teeth and one eye
 * are 1155, 621 and 609 px of near-perfect white. He came into the game with
 * the world showing through his eyes and his mouth. **Size cannot separate
 * these**, and not by a margin either: as a fraction of its own sheet his
 * mouth (0.0011) is BIGGER than either of the pockets the rule was built for
 * (0.00092, 0.0006). Any floor that clears the dragon eats the champion.
 *
 * DEPTH IS THE THING THAT ACTUALLY DIFFERS, because it is the thing the two
 * are: a background pocket is outdoors, pinched shut by a hairline — a whisker
 * crossing a jaw, a wing meeting a flank — and an eye is indoors, behind a
 * whole head. Measured as the distance from the pocket to real transparency:
 *
 * ```
 *   ryuuseki  chin pockets   3770 px, 2487 px    depth 12,  8   <- background
 *   griffin   under a wing   1829 px             depth  3       <- background
 *   satan     mouth, teeth   1155 px,  621 px    depth 53, 49   <- DRAWN
 *   satan     eye whites      609 px,  347 px    depth 70, 36   <- DRAWN
 * ```
 *
 * Six times the separation, and it is structural rather than lucky. The bound
 * scales with the sheet because a hairline is a couple of strokes wide and a
 * stroke scales with the drawing.
 *
 * All three tests are kept, since each rejects something the others let past:
 * purity keeps drawn off-whites, size keeps flecks in the lineart, depth keeps
 * faces. `tools/world-check.mjs` asserts the outcome on all three sheets.
 *
 * It stays opt-in (`clearPockets`), because the sheets already in the game do
 * not need it and a loader change that silently repaints working art is
 * exactly the kind of thing this file has been bitten by before.
 */
export const POCKET_MIN_FRAC = 0.0005;
export const POCKET_DEPTH_FRAC = 0.025;

/** Near-PURE white. The drawn whites on these sheets all carry a tint.
 *  Exported so the smoke test asks the sheets the same question the loader
 *  does rather than a paraphrase of it. */
export const purelyWhite = (d, p) => {
  const i = p * 4;
  return d[i + 3] > 200 && d[i] > 246 && d[i + 1] > 246 && d[i + 2] > 246;
};

/** The size floor, in pixels, for the sheet's own dimensions. */
export const pocketFloor = (w, h, minFrac = POCKET_MIN_FRAC) =>
  Math.max(64, Math.floor(w * h * minFrac));

export function clearSealedPockets(
  d, w, h, minFrac = POCKET_MIN_FRAC, depthFrac = POCKET_DEPTH_FRAC
) {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const minPx = pocketFloor(w, h, minFrac);
  const shallow = nearOutsideMask(d, w, h,
    Math.max(8, Math.round(Math.min(w, h) * depthFrac)));
  const pure = (p) => purelyWhite(d, p);

  for (let s = 0; s < w * h; s++) {
    if (seen[s] || !pure(s)) continue;
    let sp = 0;
    let n = 0;
    stack[sp++] = s;
    seen[s] = 1;
    const found = [];
    let outdoors = false;
    while (sp > 0) {
      const p = stack[--sp];
      found.push(p);
      n++;
      if (shallow[p]) outdoors = true;
      const x = p % w;
      const y = (p / w) | 0;
      for (const q of [x < w - 1 ? p + 1 : -1, x > 0 ? p - 1 : -1,
        y < h - 1 ? p + w : -1, y > 0 ? p - w : -1]) {
        if (q < 0 || seen[q] || !pure(q)) continue;
        seen[q] = 1;
        stack[sp++] = q;
      }
    }
    if (n >= minPx && outdoors) for (const p of found) d[p * 4 + 3] = 0;
  }
}

/**
 * Flood transparency inward from every border pixel. Pixel data in, pixel data
 * out — no canvas, which is what lets `tools/world-check.mjs` run the real
 * background removal over the real sheets with no DOM and no GPU.
 */
export function floodBackground(d, w, h) {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;

  const pushIf = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (seen[p]) return;
    if (!isBackgroundish(d, p * 4)) return;
    seen[p] = 1;
    stack[sp++] = p;
  };

  for (let x = 0; x < w; x++) {
    pushIf(x, 0);
    pushIf(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    pushIf(0, y);
    pushIf(w - 1, y);
  }

  while (sp > 0) {
    const p = stack[--sp];
    const x = p % w;
    const y = (p / w) | 0;
    d[p * 4 + 3] = 0;
    pushIf(x + 1, y);
    pushIf(x - 1, y);
    pushIf(x, y + 1);
    pushIf(x, y - 1);
  }
}

function keyOutBackground(ctx, w, h, clearPockets = false) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  floodBackground(d, w, h);
  // ...and then the pockets the flood is structurally unable to reach.
  if (clearPockets) clearSealedPockets(d, w, h);

  // Soften the cut edge: any surviving pale pixel touching transparency gets
  // partial alpha, so the sprite doesn't get a hard white fringe.
  const out = new Uint8ClampedArray(d);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (d[p * 4 + 3] === 0) continue;
      if (!isBackgroundish(d, p * 4)) continue;
      let open = 0;
      if (d[(p - 1) * 4 + 3] === 0) open++;
      if (d[(p + 1) * 4 + 3] === 0) open++;
      if (d[(p - w) * 4 + 3] === 0) open++;
      if (d[(p + w) * 4 + 3] === 0) open++;
      if (open) out[p * 4 + 3] = Math.max(0, 255 - open * 85);
    }
  }
  img.data.set(out);
  ctx.putImageData(img, 0, 0);
  return img;
}

/**
 * Work out the atlas cell size, how far the source is scaled into it, and the
 * two measurements the game sizes quads from.
 *
 * Pure arithmetic over measured boxes, and lifted out of `loadSpriteAtlas` so
 * `tools/world-check.mjs` can ask what a sheet WILL pack to without a canvas —
 * the drawn size of a critter's poses is now a rule with a check on it, and a
 * check that re-derives the packing by hand is a check that can agree with
 * itself while disagreeing with the game.
 *
 * THE CELL SIZE IS DERIVED, AND THIS IS WHY THE DRAGONS LOOKED LOW-RES. Every
 * sheet used to be packed into the same fixed cell — 384 through
 * `_loadSprite`. That is roughly right for a kitten, because ten directions
 * across four poses fill a 384-cell atlas honestly. It is badly wrong for a
 * dragon, and the reason is the SHAPE of the drawing rather than its size: the
 * dragon is one long horizontal creature squeezed into a SQUARE cell, so the
 * fit is decided by its width and its height gets whatever falls out.
 *
 *     dragon_sheet.png   2752x1536 source, one figure
 *     packed into 384    ~338 px wide -> about 127 px TALL
 *
 * 127 pixels, stretched across an animal that fills a third of the screen when
 * you are riding it. The art was never the problem — it is 2752 wide on disk,
 * which is exactly why it looks sharp opened in a viewer and soft in the game.
 *
 * So `cell` is a FLOOR and the real size is the largest of:
 *   - `ideal`: big enough that the art is not downscaled at all (scale ~ 1),
 *   - clamped by `maxAtlas` so the texture stays a sane size,
 *   - never below whatever the caller asked for.
 *
 * A single-figure sheet (both dragons, Ryuuseki, the pandas, the leaders) goes
 * to its own resolution. A ten-by-four kitten sheet is limited by
 * `maxAtlas / cols` to less than the floor, so it lands on the floor and is
 * BYTE-FOR-BYTE UNCHANGED — which matters, because the sprite-direction checks
 * measure real cells out of these sheets and a repack would move every number
 * they assert.
 */
export function packMetrics({
  tallest, widest, inked = 0, cols = 1, rows = 1,
  cell = 512, pad = 0.06, maxAtlas = 2048,
}) {
  const ideal = Math.ceil(Math.max(tallest, widest) / (1 - pad * 2));
  const roomPerCell = Math.floor(maxAtlas / Math.max(cols, rows));
  const cellPx = Math.max(cell, Math.min(ideal, roomPerCell));

  const usable = cellPx * (1 - pad * 2);
  /* Capped at 1: upscaling the source into a bigger cell would invent detail
     that isn't there and cost the memory of pretending otherwise. */
  const scale = Math.min(usable / tallest, usable / widest, 1);

  return {
    cellPx,
    scale,
    contentScale: (tallest * scale) / cellPx,
    contentArea: (Math.sqrt(inked) * scale) / cellPx,
  };
}

/**
 * How many pixels inside `box` survived the background key.
 *
 * Pixel data in, a number out — no canvas — so `tools/world-check.mjs` can
 * measure the real sheets the same way the loader does. `imgData` is either an
 * ImageData or anything with a `.data` of RGBA bytes.
 */
export function countInk(imgData, w, box) {
  const d = imgData.data ?? imgData;
  let n = 0;
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) if (d[(y * w + x) * 4 + 3] > 8) n++;
  }
  return n;
}

/**
 * Find one bounding box per drawn view.
 *
 * Projecting occupied columns is the obvious approach and it fails here: a cat
 * with a swept tail or a raised sword overlaps its neighbour's column range,
 * so the runs merge and four views read as two. Labelling connected components
 * instead gives one blob per character regardless of overlap; detached bits
 * (the dragon's lightning arcs) are then folded back in by clustering the
 * blobs on x and splitting at the widest gaps.
 */
function findViewBoxes(imgData, w, h, expected, expectedRows = 1) {
  const d = imgData.data;

  // Label at quarter resolution — plenty for separating characters, and 16x
  // less work than the full image.
  const S = 4;
  const mw = Math.ceil(w / S);
  const mh = Math.ceil(h / S);
  const mask = new Uint8Array(mw * mh);
  for (let y = 0; y < h; y++) {
    const my = (y / S) | 0;
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (d[(row + x) * 4 + 3] > 40) mask[my * mw + ((x / S) | 0)] = 1;
    }
  }

  const label = new Int32Array(mw * mh).fill(-1);
  const stack = new Int32Array(mw * mh);
  const blobs = [];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start] >= 0) continue;
    const id = blobs.length;
    let sp = 0;
    stack[sp++] = start;
    label[start] = id;
    let minX = mw;
    let maxX = 0;
    let minY = mh;
    let maxY = 0;
    let area = 0;

    while (sp > 0) {
      const p = stack[--sp];
      const x = p % mw;
      const y = (p / mw) | 0;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      // 8-connected, so a single-pixel diagonal doesn't split a blob.
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= mw || ny >= mh) continue;
          const np = ny * mw + nx;
          if (!mask[np] || label[np] >= 0) continue;
          label[np] = id;
          stack[sp++] = np;
        }
      }
    }
    blobs.push({ minX, maxX, minY, maxY, area });
  }

  if (blobs.length === 0) return [];

  // Drop specks — anything under 1% of the biggest blob is noise.
  const maxArea = Math.max(...blobs.map((b) => b.area));
  const solid = blobs.filter((b) => b.area > maxArea * 0.01);

  const byPos = (items, lo, hi) =>
    [...items].sort((a, b) => (lo(a) + hi(a)) - (lo(b) + hi(b)));

  /** Split a list into exactly `n` clusters by cutting at the n-1 widest gaps. */
  const cluster = (items, n, lo, hi) => {
    const sorted = byPos(items, lo, hi);
    if (sorted.length <= n) return sorted.map((b) => [b]);
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push({ i, size: lo(sorted[i]) - hi(sorted[i - 1]) });
    }
    gaps.sort((a, b) => b.size - a.size);
    const cuts = new Set(gaps.slice(0, n - 1).map((g) => g.i));
    const groups = [];
    let cur = [];
    sorted.forEach((b, i) => {
      if (i > 0 && cuts.has(i)) { groups.push(cur); cur = []; }
      cur.push(b);
    });
    groups.push(cur);
    return groups;
  };

  /**
   * Split wherever the gap is large relative to how wide the figures are,
   * without being told how many there should be.
   *
   * Image models do not reliably honour "exactly 8 columns" — asking for 8
   * repeatedly returns 10. Counting what was actually drawn is more robust
   * than forcing a number and slicing characters in half, and the game maps
   * however many cells it gets evenly around the circle.
   */
  const autoCluster = (items, lo, hi) => {
    const sorted = byPos(items, lo, hi);
    if (sorted.length < 2) return sorted.map((b) => [b]);
    const widths = sorted.map((b) => hi(b) - lo(b)).sort((a, b) => a - b);
    const medianW = widths[widths.length >> 1] || 1;
    /* Small relative to a figure's width. Sheets are drawn tightly packed —
       measured gaps run about 20-50% of a figure's width — so a generous
       threshold merges neighbours and silently halves the direction count.
       Anything closer than this is treated as a detached piece of the same
       figure (a thrown katana, a raised tail) rather than a new cell. */
    const threshold = Math.max(1, medianW * 0.12);
    const groups = [];
    let cur = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      if (lo(sorted[i]) - hi(sorted[i - 1]) > threshold) {
        groups.push(cur);
        cur = [];
      }
      cur.push(sorted[i]);
    }
    groups.push(cur);
    return groups;
  };

  const toBox = (grp) => {
    const minX = Math.min(...grp.map((b) => b.minX));
    const maxX = Math.max(...grp.map((b) => b.maxX));
    const minY = Math.min(...grp.map((b) => b.minY));
    const maxY = Math.max(...grp.map((b) => b.maxY));
    return {
      x0: minX * S,
      x1: Math.min(w - 1, maxX * S + S - 1),
      y0: minY * S,
      y1: Math.min(h - 1, maxY * S + S - 1),
      get w() { return this.x1 - this.x0 + 1; },
      get h() { return this.y1 - this.y0 + 1; },
    };
  };

  // Rows first (vertical bands), then columns within each row. Doing it in
  // this order matters: a jumping figure sits higher than a walking one, so
  // clustering globally on x would mix poses from different rows into the
  // same column.
  const rowGroups = expectedRows > 1
    ? cluster(solid, expectedRows, (b) => b.minY, (b) => b.maxY)
    : [solid];

  const lo = (b) => b.minX;
  const hi = (b) => b.maxX;

  if (expected !== 'auto') {
    return rowGroups.map((r) => cluster(r, expected, lo, hi).map(toBox));
  }

  const perRow = rowGroups.map((r) => autoCluster(r, lo, hi));

  // The count most rows agreed on is the truth about the sheet.
  const tally = new Map();
  for (const r of perRow) tally.set(r.length, (tally.get(r.length) ?? 0) + 1);
  let target = 0;
  let best = -1;
  for (const [n, count] of tally) {
    if (count > best || (count === best && n > target)) { best = count; target = n; }
  }

  /* Derive one set of column boundaries from the rows that agree, and slice
     EVERY row with them.
     Rows can't be trusted individually. In an attack row the drawn katanas
     cross, so two neighbouring figures touch and label as a single blob — that
     row comes back one column short with one box twice the normal width. Left
     alone that box becomes the widest thing on the sheet and drags the shared
     scale down for every frame (the whole character renders at half size), and
     the row's last cell ends up empty. Slicing by the majority grid splits the
     merged pair back apart and keeps every row the same width. */
  const goodRows = perRow.filter((r) => r.length === target);
  const edges = [];
  for (let k = 0; k < target; k++) {
    const centres = goodRows.map((r) => {
      const g = r[k];
      return (Math.min(...g.map(lo)) + Math.max(...g.map(hi))) / 2;
    });
    edges.push(centres.reduce((a, b) => a + b, 0) / centres.length);
  }
  // Cut halfway between adjacent column centres.
  const bounds = [-Infinity];
  for (let k = 1; k < target; k++) bounds.push((edges[k - 1] + edges[k]) / 2);
  bounds.push(Infinity);

  return rowGroups.map((rowBlobs) => {
    const cells = [];
    for (let k = 0; k < target; k++) {
      const x0 = bounds[k];
      const x1 = bounds[k + 1];
      // Every blob overlapping this column, clipped to it. A merged pair
      // contributes to both of the columns it straddles.
      const parts = rowBlobs.filter((b) => hi(b) >= x0 && lo(b) <= x1);
      if (!parts.length) { cells.push(null); continue; }
      const box = toBox(parts);
      box.x0 = Math.max(box.x0, Math.ceil(x0 * S));
      box.x1 = Math.min(box.x1, Math.floor(x1 * S) + S - 1);
      cells.push(box);
    }
    // A column with nothing in it would render as a hole; borrow the
    // neighbour rather than drop the cell.
    return cells.map((c, k) => c || cells[(k + 1) % target] || cells[0]);
  });
}

/**
 * @returns {Promise<{texture: THREE.CanvasTexture, cols: number, rows: number,
 *                    aspect: number}>}
 */
export async function loadSpriteAtlas(url, opts = {}) {
  /* `pad` is transparent margin left around every cell's art. Sprite atlases
     bleed without it: bilinear filtering and mipmaps sample past the cell
     boundary and drag the neighbouring frame in along the edge. Padding plus
     the half-texel UV inset in Billboard._setCell keeps frames isolated. */
  const {
    views = 4, rows: wantRows = 1, cell = 512, footroom = 0.02, pad = 0.06,
    /* Ceiling on the packed atlas in either dimension. `cell` is a FLOOR, not
       the answer: the real cell size is worked out below from how big the art
       actually is, because a fixed cell throws away resolution on exactly the
       sheets that need it most. See the note above `cellPx`. */
    maxAtlas = 2048,
    /* Also clear background the lineart has completely sealed in — see
       clearSealedPockets. Opt-in, because the sheets already in the game do
       not need it. */
    clearPockets = false,
  } = opts;

  const img = await new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => res(im);
    im.onerror = () => rej(new Error(`sprite load failed: ${url}`));
    im.src = url;
  });

  const src = document.createElement('canvas');
  src.width = img.naturalWidth;
  src.height = img.naturalHeight;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(img, 0, 0);

  const keyed = keyOutBackground(sctx, src.width, src.height, clearPockets);
  const grid = findViewBoxes(keyed, src.width, src.height, views, wantRows);

  const flat = grid.flat();
  if (flat.length === 0) throw new Error(`no sprite content found in ${url}`);

  /* One shared scale across the WHOLE sheet, not per row. Scaling each row to
     fit its own tallest figure would make the character change size the
     instant it started walking. */
  const tallest = Math.max(...flat.map((b) => b.h));
  const widest = Math.max(...flat.map((b) => b.w));
  /* How much INK the biggest frame has in it, in source pixels. A bounding box
     says how far a drawing reaches; it does not say how big the animal is. See
     `contentArea` below. */
  const inked = Math.max(...flat.map((b) => countInk(keyed, src.width, b)));

  const cols = Math.max(...grid.map((r) => r.length));
  const rows = grid.length;

  /* The cell size is DERIVED from how big the art actually is, and `cell` is
     only a floor — see `packMetrics`, which owns that arithmetic and the
     reason for it. */
  const { cellPx, scale, contentScale, contentArea } = packMetrics({
    tallest, widest, inked, cols, rows, cell, pad, maxAtlas,
  });

  const out = document.createElement('canvas');
  out.width = cellPx * cols;
  out.height = cellPx * rows;
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';

  /* Each row is aligned to ITS OWN ground line — the lowest figure in that
     row — and that ground line goes to the bottom of the cell. Figures drawn
     higher than their row's ground line keep that lift, so a pose that leaves
     the floor still reads as leaving the floor.
     Baselines must be compared within a row, never across rows: rows sit at
     different absolute heights in the source image, so a sheet-wide baseline
     lifts the top row clean out of its cell. */
  grid.forEach((rowBoxes, ri) => {
    const rowBase = Math.max(...rowBoxes.map((b) => b.y1));
    const cellBottom = ri * cellPx + cellPx - cellPx * pad;
    rowBoxes.forEach((b, ci) => {
      const dw = b.w * scale;
      const dh = b.h * scale;
      const dx = ci * cellPx + (cellPx - dw) / 2;
      const lift = (rowBase - b.y1) * scale;
      const dy = Math.max(ri * cellPx, cellBottom - dh - lift);
      octx.drawImage(src, b.x0, b.y0, b.w, b.h, dx, dy, dw, dh);
    });
  });

  const texture = new THREE.CanvasTexture(out);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;

  return {
    texture,
    cols,
    rows,
    // How wide the drawn character is relative to its height — lets the game
    // size the billboard quad without distorting the art.
    aspect: widest / tallest,
    /* Fraction of a cell's height the tallest drawn frame occupies. The game
       divides by this to size the quad, so a character ends up the world
       height it asked for no matter how loosely the sheet happened to pack.
       Without it, apparent size silently tracks the packing: two sheets that
       pack differently give two characters of visibly different size. */
    contentScale,
    /* THE SIDE OF A SQUARE WITH THE SAME AREA AS THE DRAWN INK, as a fraction
       of the cell — an orientation-free measure of how big the animal is,
       where `contentScale` measures only how far up the cell it reaches.

       It exists because `contentScale` is the wrong yardstick the moment one
       creature has more than one drawing. Normalising on height means every
       pose is scaled until its bounding box is the same height, so a rabbit
       drawn flat out mid-run comes out the same height as one drawn sitting up
       — which makes the running one enormously longer, and the two read as two
       animals of different sizes. Ink area does not care which way the drawing
       is stretched: the same rabbit drawn in any pose covers about the same
       amount of paper. Measured on the three rabbit sheets, whose bounding
       boxes disagree by 45% and whose ink areas agree inside 9%.

       `Critter.poseQuad` is the consumer; everything with a single drawing is
       untouched, because a sheet has nothing to be consistent with. */
    contentArea,
    /** Transparent margin left around each cell, as a fraction of the cell. */
    pad,
  };
}

/* ---------------------------------------------------------------------------
   Recolouring — how players 3 and 4 exist without new art.

   There are exactly TWO turnaround sheets in this project and generating a
   third is the riskiest operation in it: `frost_grid_v2.png` sits in
   docs/unused-art/ because its jump and attack rows came back mirrored against
   its idle and walk rows, and no per-sheet setting can correct a sheet that
   contradicts itself. So a third and fourth kitten are TRANSFORMS OF THE DRAWN
   CELL — the same call the hit flash, the KO pose and the angel already make,
   and for the same reason.

   IT RUNS AFTER PACKING, ON THE PACKED CANVAS, AND THAT IS THE WHOLE SAFETY
   ARGUMENT. Every measured thing about a sheet — the cell grid, `cols`,
   `contentScale`, `contentArea`, `pad`, and the direction mapping every sprite
   check in world-check asserts — is computed from the ALPHA channel during
   packing. This touches red, green and blue and never alpha, on a canvas where
   all of that has already been decided. A recoloured kitten therefore cannot
   slice, size or face differently from the one she was copied from. Doing it to
   the SOURCE image instead would put a colour transform upstream of background
   removal, which keys on colour — that version is a real risk and this one is
   not.

   TWO KNOBS, BECAUSE ONE CANNOT DO IT. Measured over cell (0,0) of each sheet:

     ember_grid_v2   mean saturation 0.631,  2.5% grey
                     orange fur 0-60, blue kimono 210-240, red trim 330-360
     frost_grid      mean saturation 0.195, 37.0% grey
                     GREY/WHITE FUR, pink kimono 300-360, cream 0-60

   Ember is saturated everywhere, so rotating every hue by a constant moves her
   whole palette while preserving the relationships inside it: the fur and the
   kimono stay as different from each other as they were drawn. Frost is a GREY
   CAT, and a rotation does nothing to a pixel with no saturation to rotate —
   it would recolour her kimono and hand back the same grey animal.

   And the gap cannot be closed by choosing a better angle. A grey pixel has no
   hue, so whatever hue the transform gives it is the SAME hue for every grey
   pixel; the distance from there to her rotated kimono is her kimono's original
   hue, which does not depend on the rotation at all. Rotating harder moves both
   and separates neither. So the greys are given their own hue outright, and the
   two knobs are independent by construction:

     hue      degrees to rotate pixels that ALREADY have a colour
     tint     the hue to hand pixels that have none, chosen independently
     tintSat  how much saturation to give them

   The two are cross-faded on the pixel's own saturation rather than switched at
   a threshold, or the boundary between "rotated" and "tinted" draws a visible
   seam across her flank at whatever saturation the cutoff sat at.

   LINEART AND SPECULARS ARE PROTECTED AT BOTH ENDS. A saturation lift applied
   to near-black puts a colour cast on every outline, which reads as bad
   printing rather than as a different cat, and one applied to the brightest
   highlights kills the specular. The lift is windowed on lightness; the hue
   rotation is not, because rotating the hue of something with no saturation is
   already a no-op.
--------------------------------------------------------------------------- */

/** Below this lightness a pixel is lineart and takes no saturation lift. */
const LINE_L = 0.16;
/** ...ramping to full effect by here. */
const LINE_FULL = 0.30;
/** Above this a pixel is a specular highlight and the lift tapers back out. */
const SPEC_L = 0.97;
/** Saturation at which a pixel counts as fully coloured rather than grey. */
const GREY_S = 0.16;

function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (mx === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hue2rgb(p, q, t) {
  let u = t;
  if (u < 0) u += 1;
  if (u > 1) u -= 1;
  if (u < 1 / 6) return p + (q - p) * 6 * u;
  if (u < 1 / 2) return q;
  if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
  return p;
}

function hsl2rgb(h, s, l) {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const t = ((h % 360) + 360) / 360 % 1;
  return [
    Math.round(hue2rgb(p, q, t + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, t) * 255),
    Math.round(hue2rgb(p, q, t - 1 / 3) * 255),
  ];
}

/** Shortest-arc blend between two hues, so a cross-fade never sweeps the wheel. */
function mixHue(a, b, k) {
  let d = ((b - a) % 360 + 540) % 360 - 180;
  return ((a + d * k) % 360 + 360) % 360;
}

/**
 * How much saturation lift a pixel of this lightness may take: nothing on the
 * lineart, full through the midtones, tapering back out on the speculars.
 */
export function liftWindow(l) {
  if (l <= LINE_L || l >= 1) return 0;
  if (l < LINE_FULL) return (l - LINE_L) / (LINE_FULL - LINE_L);
  if (l > SPEC_L) return Math.max(0, (1 - l) / (1 - SPEC_L));
  return 1;
}

/**
 * The pixel transform, exported on its own so `tools/world-check.mjs` can run
 * the REAL rule over the REAL sheets with no canvas and no GPU — the same
 * arrangement `floodBackground` and `packMetrics` already use, and for the same
 * reason: a check against a fixture only proves the rule agrees with itself.
 *
 * Mutates `d` in place. ALPHA IS NEVER READ AND NEVER WRITTEN.
 */
export function recolourPixels(d, {
  hue = 0, tint = null, tintSat = 0, greyS = GREY_S,
} = {}) {
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;          // fully transparent: nothing to tint
    const [h, s, l] = rgb2hsl(d[i], d[i + 1], d[i + 2]);
    // 1 for a pixel with no colour of its own, 0 for a fully coloured one.
    const g = tint == null ? 0 : 1 - Math.min(1, s / greyS);
    const hOut = g > 0 ? mixHue(h + hue, tint, g) : h + hue;
    const sOut = Math.min(1, s + tintSat * g * liftWindow(l));
    const [r, gg, b] = hsl2rgb(hOut, sOut, l);
    d[i] = r; d[i + 1] = gg; d[i + 2] = b;
  }
  return d;
}

/**
 * A recoloured copy of an already-loaded atlas.
 *
 * Shares every measured field with its source by construction — they are copied
 * across rather than recomputed, so there is no arithmetic here that could
 * disagree with the packing. Only the texture differs.
 */
export function recolourAtlas(atlas, opts = {}) {
  const src = atlas.texture.image;
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  recolourPixels(img.data, opts);
  ctx.putImageData(img, 0, 0);

  const texture = new THREE.CanvasTexture(out);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return { ...atlas, texture };
}
