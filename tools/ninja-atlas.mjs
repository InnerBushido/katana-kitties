/* ---------------------------------------------------------------------------
   THE BAMBOO INFILTRATION ATLASES — one texture per character, every action.

   Run: node tools/ninja-atlas.mjs            # rebuild public/sprites/ninja/
        node tools/ninja-atlas.mjs --proof    # ...and out/bake/ninja_*.png

   Richard: "lets make sure we are using the sprite sheets and atlasing to the
   fullest ... for NPC's, having 4-directions with more animation frames may be
   better and for the player character animations and actions, can stick with
   8-directions where it makes sense and for longer animations, can do
   4-directions." So each ACTION was generated as its own sheet (one row per
   direction, one column per frame — an image model draws one action across a
   page far better than six), and this tool packs all of a character's actions
   into ONE atlas, with `src/systems/dream/ninjaclips.js` (GENERATED) saying
   where each clip sits. A clip is `dirs` rows of `frames` cells; the
   Billboard's `clips` mode picks the row from the direction and the column
   from the frame, and never mirrors, because every direction was drawn.

   EVERYTHING ABOUT A FIGURE IS MEASURED, because a generated sheet's grid is
   only roughly a grid (non-negotiable 8). Per sheet:

     1. chroma-key the magenta (`chromaKey`, the route for anything new);
     2. find every blob of ink, take the `rows x cols` largest as the figures,
        and sort them into rows by height and columns by x — the sheet has to
        come out as exactly the grid it was asked for, or the tool stops and
        says which sheet, because a figure read into the wrong cell is a kitten
        who faces backwards for one frame in eight;
     3. hand every smaller blob (a flying shuriken, a sweat drop, KO stars) to
        the figure whose box it is nearest, so it travels with its frame;
     4. SCALE BY INK AREA, NOT BY HEIGHT. A kitten crawling and a kitten with
        her paws in the air are the same kitten, and a height fit would draw
        the crawl half again as long as she is. Ink area does not care which
        way a drawing is stretched — the argument, and the 9% it was measured
        to, is `contentArea` in src/core/spritesheet.js. Each sheet is scaled so
        its median figure covers the same area as every other sheet's;
     5. anchor each row on ITS OWN ground line (the lowest foot in the row,
        exactly as the loader does it) so a frame that leaves the floor still
        leaves it, or — `align: 'top'` — on its own highest paw, for the clips
        that HANG from something, where the paws are what must not move;
     6. centre each frame across on the MEDIAN column of its ink, which a
        thrown shuriken at the edge of a cell cannot drag the way it drags a
        bounding box.

   The shipped atlas is an exact grid, so it loads with `uniform: true` and
   `pad: 0` — the margin is already in every cell, put there by this tool.
--------------------------------------------------------------------------- */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { readPNG, writePNG, blobs } from './png.mjs';
import { chromaKey, CHROMA_MAGENTA } from '../src/core/spritesheet.js';

const TAKES = 'docs/art-masters/bamboo';
const SHIP = 'public/sprites/ninja';
const PROOF = 'out/bake';
const CLIPS_JS = 'src/systems/dream/ninjaclips.js';

/** Row orders the sheets were asked for, as directions. 4-way sheets are
 *  front, RIGHT profile, back, LEFT profile; the 8-way crawl turns clockwise
 *  from the front. Index = the direction the Billboard asks for (see
 *  `clipDir` in gfx.js: 0 is facing the camera, counting toward screen-right). */
const FOUR = [0, 1, 2, 3];
const EIGHT = [0, 1, 2, 3, 4, 5, 6, 7];

/* `cols` is what the sheet has, measured by eye and then checked by step 2;
   `use` is which of them ship, when a take has a frame that does not belong
   (the mount's last column flips her upside down, which the rope she lands on
   was not drawn as). `fps` and `loop` are the clip's own; the game may scale
   the rate by speed. */
const KITTEN = (s) => [
  { clip: 'sneak', file: `${s}_sneak.png`, rows: 8, cols: 4, dirs: EIGHT, fps: 7, loop: true },
  { clip: 'mount', file: `${s}_mount.png`, rows: 4, cols: 6, dirs: FOUR, use: [0, 1, 2, 3, 4], fps: 10, loop: false },
  { clip: 'rope', file: `${s}_rope.png`, rows: 4, cols: s === 'frost' ? 7 : 6, dirs: FOUR, fps: 8, loop: true, align: 'top' },
  { clip: 'climb', file: `${s}_climb.png`, rows: 4, cols: 6, dirs: FOUR, fps: 8, loop: true },
  { clip: 'throw', file: `${s}_throw.png`, rows: 4, cols: 6, dirs: FOUR, fps: 14, loop: false },
  { clip: 'handsup', file: `${s}_handsup.png`, rows: 4, cols: 6, dirs: FOUR, fps: 6, loop: false },
];

/* `mirror: { 3: 1 }` draws row 3 as row 1 flipped. ONE PLACE ONLY, the
   archer's shot, and only because two takes running could not draw it: asked
   for a LEFT profile drawing his bow, the model gave a cat standing still
   (take 1) and a cat facing left with his arrow pointing right (take 2), while
   the RIGHT row was clean both times. His armour is near enough symmetric that
   the flip costs nothing a player can see, and a shot that reads beats one
   that is drawn. Every other row in every other sheet is its own drawing. */
const ENEMY = (who) => [
  { clip: 'idle', file: `${who}_idle.png`, rows: 4, cols: 6, dirs: FOUR, fps: 5, loop: true },
  { clip: 'walk', file: `${who}_walk.png`, rows: 4, cols: 6, dirs: FOUR, fps: 8, loop: true },
  { clip: 'sprint', file: `${who}_sprint.png`, rows: 4, cols: 6, dirs: FOUR, fps: 12, loop: true },
  { clip: 'alert', file: `${who}_alert.png`, rows: 4, cols: 6, dirs: FOUR, fps: 9, loop: false },
  who === 'archer'
    ? { clip: 'attack', file: 'archer_shoot.png', rows: 4, cols: 6, dirs: FOUR, fps: 9, loop: false, mirror: { 3: 1 } }
    : { clip: 'attack', file: 'samurai_throw.png', rows: 4, cols: 6, dirs: FOUR, fps: 10, loop: false },
  { clip: 'ko', file: `${who}_ko.png`, rows: 4, cols: 6, dirs: FOUR, fps: 7, loop: false },
];

/* THE CELL IS CHOSEN, NOT SET: every grid width from 6 to 20 is packed, and
   the one that allows the biggest square cell inside MAX_PX x MAX_PX wins.
   The first cut fixed 144 x 14 and came out 2304 tall — a texture over 2048,
   which the loader would have quietly shrunk anyway (`packMetrics`'s
   `maxAtlas`). One texture per character is the whole point; MAX_PX is the
   size every device here takes, and a lower tier still shrinks it on load. */
const MAX_PX = 2048;
const CHARS = [
  { id: 'ember', jobs: KITTEN('ember'), stand: ['throw', 0, 0] },
  { id: 'frost', jobs: KITTEN('frost'), stand: ['throw', 0, 0] },
  { id: 'samurai', jobs: ENEMY('samurai'), stand: ['idle', 0, 0] },
  { id: 'archer', jobs: ENEMY('archer'), stand: ['idle', 0, 0] },
];

/** Transparent margin left inside every cell, as a fraction of it. */
const PAD = 0.04;
/** Ink below this alpha is fringe, not drawing. */
const INK = 40;

/* ========================================================================== */

/** Cut one sheet into its figures, measured. Returns rows of frames. */
function measureSheet(job) {
  const src = `${TAKES}/${job.file}`;
  if (!existsSync(src)) throw new Error(`missing take: ${src}`);
  const { w, h, d } = readPNG(src);
  const cleared = chromaKey(d, w, h, CHROMA_MAGENTA);
  if (cleared < w * h * 0.3) throw new Error(`${job.file}: chroma key cleared only ${(cleared / (w * h) * 100).toFixed(0)}% — not on magenta?`);

  const all = blobs(d, w, h, (p) => d[p * 4 + 3] > INK).filter((b) => b.n >= 12);
  const want = job.rows * job.cols;
  if (all.length < want) throw new Error(`${job.file}: ${all.length} blobs, want ${want}`);
  /* THE GAP between the smallest figure and the largest leftover is the
     evidence that step 2 picked figures and not fragments. Under 2x and a
     figure has probably been split in two (a tail drawn detached) — stop. */
  const figs = all.slice(0, want);
  const rest = all.slice(want);
  const gap = rest.length ? figs[want - 1].n / rest[0].n : Infinity;
  if (gap < 2) throw new Error(`${job.file}: smallest figure ${figs[want - 1].n}px vs largest fragment ${rest[0].n}px — a figure is split, or a cell is missing`);

  // Rows by centre height: sort, then cut into `rows` equal runs.
  const cy = (b) => (b.minY + b.maxY) / 2;
  const cx = (b) => (b.minX + b.maxX) / 2;
  figs.sort((a, b) => cy(a) - cy(b));
  const grid = [];
  for (let r = 0; r < job.rows; r++) {
    const row = figs.slice(r * job.cols, (r + 1) * job.cols).sort((a, b) => cx(a) - cx(b));
    // A row that overlaps its neighbour in height was sorted across a boundary.
    if (r > 0) {
      const above = Math.max(...grid[r - 1].map(cy));
      const here = Math.min(...row.map(cy));
      if (here <= above) throw new Error(`${job.file}: rows ${r} and ${r + 1} interleave — the grid is not ${job.rows} rows`);
    }
    grid.push(row.map((b) => ({ ...b, parts: [b] })));
  }

  // Every fragment joins the figure whose box it is nearest.
  const flat = grid.flat();
  for (const f of rest) {
    let best = null, bd = Infinity;
    for (const g of flat) {
      const dx = Math.max(g.minX - f.maxX, f.minX - g.maxX, 0);
      const dy = Math.max(g.minY - f.maxY, f.minY - g.maxY, 0);
      const dd = dx * dx + dy * dy;
      if (dd < bd) { bd = dd; best = g; }
    }
    // Further than half a cell from every figure is a stray mark, not a prop.
    if (Math.sqrt(bd) > Math.min(w / job.cols, h / job.rows) * 0.5) continue;
    best.parts.push(f);
    best.minX = Math.min(best.minX, f.minX); best.maxX = Math.max(best.maxX, f.maxX);
    best.minY = Math.min(best.minY, f.minY); best.maxY = Math.max(best.maxY, f.maxY);
  }

  /* Per figure: its ink mask (only its own parts — a neighbour's tail reaching
     into the box is not this frame's), its area, and its median column. */
  const owner = new Int32Array(w * h).fill(-1);
  flat.forEach((g, gi) => {
    for (const part of g.parts) {
      // Re-flood the part from its seed to mark exactly its pixels.
      const stack = [part.seed];
      owner[part.seed] = gi;
      while (stack.length) {
        const p = stack.pop();
        const x = p % w, y = (p / w) | 0;
        for (const q of [x < w - 1 ? p + 1 : -1, x > 0 ? p - 1 : -1, y < h - 1 ? p + w : -1, y > 0 ? p - w : -1]) {
          if (q < 0 || owner[q] !== -1 || d[q * 4 + 3] <= INK) continue;
          owner[q] = gi;
          stack.push(q);
        }
      }
    }
  });
  flat.forEach((g, gi) => {
    let n = 0;
    const cols = new Int32Array(g.maxX - g.minX + 1);
    for (let y = g.minY; y <= g.maxY; y++) {
      for (let x = g.minX; x <= g.maxX; x++) {
        if (owner[y * w + x] === gi) { n++; cols[x - g.minX]++; }
      }
    }
    let acc = 0, mx = g.minX;
    for (let i = 0; i < cols.length; i++) { acc += cols[i]; if (acc >= n / 2) { mx = g.minX + i; break; } }
    g.ink = n;
    g.midX = mx;
    g.gi = gi;
  });

  const inks = flat.map((g) => Math.sqrt(g.ink)).sort((a, b) => a - b);
  return { job, w, h, d, owner, grid, size: inks[inks.length >> 1], gap };
}

/** First-fit a `cw x ch` block into an occupancy grid `width` cells wide. */
function place(occ, width, cw, ch) {
  for (let r = 0; ; r++) {
    for (let c = 0; c + cw <= width; c++) {
      let free = true;
      for (let y = r; y < r + ch && free; y++) for (let x = c; x < c + cw; x++) if (occ[y]?.[x]) { free = false; break; }
      if (!free) continue;
      for (let y = r; y < r + ch; y++) { occ[y] ??= []; for (let x = c; x < c + cw; x++) occ[y][x] = 1; }
      return { row: r, col: c };
    }
  }
}

/** Area-average downsample of one figure's own pixels into the atlas. */
function blit(m, g, scale, out, ow, ox, oy, flip = false) {
  const { w, d, owner } = m;
  const bw = g.maxX - g.minX + 1, bh = g.maxY - g.minY + 1;
  const nw = Math.max(1, Math.round(bw * scale)), nh = Math.max(1, Math.round(bh * scale));
  const sx = bw / nw, sy = bh / nh;
  for (let y = 0; y < nh; y++) {
    const y0 = g.minY + Math.floor(y * sy), y1 = g.minY + Math.min(bh, Math.ceil((y + 1) * sy));
    for (let x = 0; x < nw; x++) {
      const x0 = g.minX + Math.floor(x * sx), x1 = g.minX + Math.min(bw, Math.ceil((x + 1) * sx));
      let r = 0, gg = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const p = yy * w + xx;
          n++;
          if (owner[p] !== g.gi) continue;
          const al = d[p * 4 + 3] / 255;
          r += d[p * 4] * al; gg += d[p * 4 + 1] * al; b += d[p * 4 + 2] * al; a += al;
        }
      }
      const tx = ox + (flip ? nw - 1 - x : x), ty = oy + y;
      if (a <= 0 || tx < 0 || ty < 0 || tx >= ow) continue;
      const q = (ty * ow + tx) * 4;
      out[q] = Math.round(r / a); out[q + 1] = Math.round(gg / a); out[q + 2] = Math.round(b / a);
      out[q + 3] = Math.round((a / n) * 255);
    }
  }
}

function proof(d, w, h) {
  const o = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const c = (((x >> 4) + (y >> 4)) & 1) ? [70, 70, 80] : [110, 110, 120];
      const a = d[p + 3] / 255;
      for (let i = 0; i < 3; i++) o[p + i] = d[p + i] * a + c[i] * (1 - a);
      o[p + 3] = 255;
    }
  }
  return o;
}

/* ========================================================================== */

const wantProof = process.argv.includes('--proof');
mkdirSync(SHIP, { recursive: true });
if (wantProof) mkdirSync(PROOF, { recursive: true });
const manifest = {};

for (const ch of CHARS) {
  const sheets = ch.jobs.map(measureSheet);
  /* One reference size for the whole character: the median of the sheets'
     median figures. Each sheet is scaled to it (step 4), then the lot is
     scaled down together until the biggest frame fits its cell. */
  const ref = sheets.map((s) => s.size).sort((a, b) => a - b)[sheets.length >> 1];
  const blocks = sheets.map((s) => ({ s, use: s.job.use ?? [...Array(s.job.cols).keys()], at: null }));
  // Tallest blocks first, so the 8-row crawl is not left for a gap that cannot take it.
  const order = [...blocks].sort((a, b) => b.s.job.rows - a.s.job.rows || b.use.length - a.use.length);
  let best = null;
  // Never narrower than the widest clip, or `place` looks for room forever.
  for (let width = Math.max(...blocks.map((bk) => bk.use.length)); width <= 20; width++) {
    const occ = [];
    const at = order.map((bk) => place(occ, width, bk.use.length, bk.s.job.rows));
    const cell = Math.floor(MAX_PX / Math.max(width, occ.length));
    if (!best || cell > best.cell) best = { width, rows: occ.length, cell, at };
  }
  order.forEach((bk, i) => { bk.at = best.at[i]; });
  ch.cell = best.cell;
  ch.width = best.width;
  const usable = ch.cell * (1 - PAD * 2);
  let fit = Infinity;
  for (const s of sheets) {
    const k = ref / s.size;
    for (const g of s.grid.flat()) {
      // Half-widths from the median column, since that is where it is centred.
      const half = Math.max(g.midX - g.minX, g.maxX - g.midX) * 2;
      fit = Math.min(fit, usable / ((g.maxY - g.minY + 1) * k), usable / (half * k));
    }
  }

  const clips = {};
  const rows = best.rows;
  const W = ch.width * ch.cell, H = rows * ch.cell;
  const out = new Uint8ClampedArray(W * H * 4);
  // Fully clear pixels are WHITE underneath, as in sprite-bake's `resample`.
  for (let i = 0; i < W * H; i++) { out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = 255; }

  let standPx = 0;
  for (const { s, use, at } of blocks) {
    const scale = (ref / s.size) * fit;
    const top = s.job.align === 'top';
    let hang = 0;
    s.grid.forEach((own, ri) => {
      const from = s.job.mirror?.[ri];
      const flip = from != null;
      const row = flip ? s.grid[from] : own;
      const picked = use.map((i) => row[i]);
      // The row's own line: lowest foot, or highest paw for a hanging clip.
      const line = top ? Math.min(...picked.map((g) => g.minY)) : Math.max(...picked.map((g) => g.maxY));
      picked.forEach((g, fi) => {
        const cx0 = (at.col + fi) * ch.cell, cy0 = (at.row + ri) * ch.cell;
        // Flipped, the median column lands as far from the RIGHT edge as it was from the left.
        const ox = Math.round(cx0 + ch.cell / 2 - (flip ? g.maxX - g.midX : g.midX - g.minX) * scale);
        const oy = top
          ? Math.round(cy0 + ch.cell * PAD + (g.minY - line) * scale)
          : Math.round(cy0 + ch.cell * (1 - PAD) - (g.maxY - g.minY + 1) * scale - (line - g.maxY) * scale);
        blit(s, g, scale, out, W, ox, oy, flip);
        if (top) hang = Math.max(hang, (g.maxY - line + 1) * scale);
      });
    });
    clips[s.job.clip] = {
      row: at.row, col: at.col, dirs: s.job.dirs.length, frames: use.length,
      fps: s.job.fps, loop: s.job.loop, align: top ? 'top' : 'feet',
    };
    if (s.job.clip === ch.stand[0]) {
      const g = s.grid[ch.stand[1]][use[ch.stand[2]]];
      standPx = Math.round((g.maxY - g.minY + 1) * scale);
    }
    console.log(`  ${s.job.file.padEnd(22)} gap ${s.gap === Infinity ? '-' : s.gap.toFixed(1)}x  scale ${scale.toFixed(3)}  -> ${s.job.clip} @ r${at.row} c${at.col}`);
  }

  writeFileSync(`${SHIP}/${ch.id}.png`, writePNG(W, H, out));
  if (wantProof) writeFileSync(`${PROOF}/ninja_${ch.id}.png`, writePNG(W, H, proof(out, W, H)));
  manifest[ch.id] = {
    cols: ch.width, rows, cell: ch.cell, pad: PAD,
    /* Pixels, in a cell, that her standing height is. The game sizes the quad
       as `cell / stand` of her world height, so every clip draws her at the
       size she is in the ordinary sheet whatever this packing came to. */
    stand: standPx,
    clips,
  };
  console.log(`${ch.id}: ${W}x${H} (${ch.width}x${rows} cells of ${ch.cell}), stands ${standPx}px`);
}

const js = `/* GENERATED by tools/ninja-atlas.mjs — do not edit; re-run it.
   Where each Bamboo Infiltration clip sits in its character's atlas
   (public/sprites/ninja/<id>.png): a clip is \`dirs\` rows from (row, col),
   one per direction, of \`frames\` cells each. See the tool's header. */
export const NINJA_ATLAS = ${JSON.stringify(manifest, null, 2)};
`;
writeFileSync(CLIPS_JS, js);
console.log(`wrote ${CLIPS_JS}`);
