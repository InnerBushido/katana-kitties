/* ---------------------------------------------------------------------------
   BAKE THE BACKGROUND KEY INTO THE FILE, ONCE, INSTEAD OF EVERY LOAD.

   Run: node tools/sprite-bake.mjs            # rebuild everything in WORK
        node tools/sprite-bake.mjs --proof    # ...and write out/bake/*.png
   Reads `docs/art-masters/`, writes `public/sprites/`.

   WHY THE ART IS WHITE IN THE FIRST PLACE, since this is the file somebody
   will be standing in when they ask. Every sheet in this game came out of an
   image model as an OPAQUE picture — text-to-image returns RGB, and a
   transparent cut-out is a second, separate matting call. So the game grew a
   background keyer (`src/core/spritesheet.js`) and every sheet has been keyed
   at load time ever since. That works, it is fast, and it has exactly one
   structural blind spot: **a border flood cannot reach background that the
   lineart seals shut** — a wing meeting a flank, a whisker crossing a jaw.

   `clearSealedPockets` exists for those, and it is bounded by DEPTH, because
   size and purity alone ate Mr. Satan's teeth and eyes (the whole story is in
   spritesheet.js and it is worth reading before touching any of this). The
   bound is ~2.5% of the sheet's short side. Both dragons have a pocket far
   deeper than that:

       dragon_sheet   133,549 px between the neck ruff and the far wing, depth 145
       dragon_fly       2,731 px between the hind legs,                  depth  54

   No runtime rule can clear those and still keep a grinning champion's face,
   because from the inside they are the same shape: a big, pure, deeply
   enclosed white region. **The difference is not in the pixels, it is that a
   human can look at these two and could not look at every sheet a future
   session generates.** So the depth bound stays on at runtime, and this tool —
   which runs offline, on named files, and writes a proof image you are meant
   to open — turns it off.

   The resize is the other half, and it is free. `packMetrics` showed both
   dragons packing at **scale 0.698**: 2582 source pixels squeezed into a
   1802-pixel cell, thirty per cent of the art thrown away on every device on
   every load. `contentScale` and `contentArea` — the only two numbers the game
   sizes a dragon quad from — are RATIOS and do not move when the source is
   scaled uniformly, so a master resized to the point where it packs at 1.000
   draws at exactly the same size on screen and costs half the VRAM.

       dragon_sheet   2752x1536 4.5MB -> 1376x768 1.0MB, cell 2048 -> 1467
       dragon_fly     2752x1536 3.8MB -> 1376x768 0.6MB, cell 2048 -> 1467

   Nearly all of that saving is the resize, not the alpha: baking alpha at full
   size makes the file BIGGER (4.6MB -> 4.7MB), because `png.mjs` writes filter
   0 on every row and a fourth channel is a fourth channel. Worth knowing
   before anybody tries to "just add alpha" to a sheet they cannot shrink.

   `title_art.png` is a different problem and gets a different answer. It is
   not a sprite at all — it is the kids' painting, a CSS background on the
   title screen, never a GPU texture, and 5.5MB of the first load. It is also
   FULL BLEED, so there is nothing to key. Halving it would be 1.4MB and would
   halve the resolution of the one image in this game that is theirs, on the
   first screen anybody sees. WebP at q92 is 0.46MB at the FULL 2752x1536 —
   smaller than any PNG resize and sharper than the file we shipped. That is
   the only lossy image in the game and this is why.

   THE MASTERS DO NOT LIVE IN `public/`, and that is the mechanism rather than
   an ignore list: Vite copies `public/` wholesale into `dist`, so a file in
   there is downloaded by every player whether the code asks for it or not.
   `.vercelignore` does NOT help — it is consulted for CLI uploads and not for
   a Git deployment. See docs/notes/hosting.md, and `docs/unused-art/`, which
   is the same trick for the sheets nothing loads.
--------------------------------------------------------------------------- */

import { mkdirSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readPNG, writePNG } from './png.mjs';
import { floodBackground, clearSealedPockets } from '../src/core/spritesheet.js';

const MASTERS = 'docs/art-masters';
const SHIP = 'public/sprites';
const PROOF = 'out/bake';

/* --- what gets built ------------------------------------------------------
   `deep` turns the depth bound off. It is per-file and it means somebody has
   opened the proof image for that file and seen that every cleared region is
   sky. Do not add a file here without doing that. */
const WORK = [
  { file: 'dragon_sheet.png', to: [1376, 768], key: true, deep: true },
  { file: 'dragon_fly.png', to: [1376, 768], key: true, deep: true },
  { file: 'title_art.png', webp: 92 },
];

/* ========================================================================== */

/**
 * Area-average downsample in PREMULTIPLIED alpha.
 *
 * Straight per-channel averaging is the bug that makes a keyed sprite grow a
 * pale halo: a pixel half on the wing and half on the (now transparent, still
 * WHITE) background averages to something halfway to white, and then gets 50%
 * alpha, so the fringe is drawn. Weighting colour by alpha means a cleared
 * pixel contributes nothing but its emptiness, which is the whole point of it.
 */
function resample(d, w, h, nw, nh) {
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
        o[q] = 255; o[q + 1] = 255; o[q + 2] = 255;
      }
      o[q + 3] = Math.round((a / n) * 255);
    }
  }
  return o;
}

/** Composite over a loud checker so a human can see the alpha. Magenta because
 *  nothing in this game's palette is magenta — a grey checker under a grey
 *  dragon is a proof you cannot read. */
function proof(d, w, h) {
  const o = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const c = (((x >> 5) + (y >> 5)) & 1) ? [255, 64, 200] : [190, 40, 150];
      const a = d[p + 3] / 255;
      for (let i = 0; i < 3; i++) o[p + i] = d[p + i] * a + c[i] * (1 - a);
      o[p + 3] = 255;
    }
  }
  return o;
}

const kb = (n) => `${(n / 1024).toFixed(0)}K`;

const wantProof = process.argv.includes('--proof');
if (wantProof) mkdirSync(PROOF, { recursive: true });

for (const job of WORK) {
  const src = `${MASTERS}/${job.file}`;
  if (!existsSync(src)) throw new Error(`missing master: ${src}`);
  const was = statSync(src).size;

  if (job.webp) {
    /* THE ONE SHELL-OUT. `png.mjs` is a PNG codec and deliberately nothing
       else; WebP is a whole second format and this is one file that changes
       about once a year. ffmpeg is already a dependency of the trailer and
       the Steam capsules (tools/capture/trailer-cut.sh). Hard-fail rather
       than skip: a silent skip here ships whatever stale .webp is on disk. */
    const out = `${SHIP}/${job.file.replace(/\.png$/, '.webp')}`;
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
      '-i', src, '-c:v', 'libwebp', '-quality', String(job.webp),
      '-compression_level', '6', out], { stdio: ['ignore', 'inherit', 'inherit'] });
    console.log(`${job.file.padEnd(18)} ${kb(was)} -> ${kb(statSync(out).size)}  ${out} (webp q${job.webp}, full size)`);
    continue;
  }

  const { w, h, d } = readPNG(src);
  if (job.key) {
    floodBackground(d, w, h);
    /* depthFrac 1 puts the whole sheet inside the "near the outside" mask, so
       every sealed pocket over the size floor goes. The floor stays on: it is
       what keeps flecks of paper inside the lineart from being punched out. */
    clearSealedPockets(d, w, h, undefined, job.deep ? 1 : undefined);
  }

  const [nw, nh] = job.to ?? [w, h];
  const out = nw === w && nh === h ? d : resample(d, w, h, nw, nh);
  const png = writePNG(nw, nh, out);
  writeFileSync(`${SHIP}/${job.file}`, png);

  let clear = 0;
  for (let i = 0; i < nw * nh; i++) if (out[i * 4 + 3] === 0) clear++;
  console.log(`${job.file.padEnd(18)} ${w}x${h} ${kb(was)} -> ${nw}x${nh} ${kb(png.length)}`
    + `  ${(clear / (nw * nh) * 100).toFixed(0)}% transparent`);

  if (wantProof) {
    writeFileSync(`${PROOF}/${job.file}`, writePNG(nw, nh, proof(out, nw, nh)));
    console.log(`${''.padEnd(18)} proof -> ${PROOF}/${job.file}`);
  }
}
