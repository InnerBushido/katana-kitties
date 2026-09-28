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
import {
  floodBackground, clearSealedPockets, chromaKey, CHROMA_MAGENTA,
} from '../src/core/spritesheet.js';

const MASTERS = 'docs/art-masters';
const SHIP = 'public/sprites';
const PROOF = 'out/bake';

/* --- what gets built ------------------------------------------------------
   `deep` turns the depth bound off. It is per-file and it means somebody has
   opened the proof image for that file and seen that every cleared region is
   sky. Do not add a file here without doing that.

   `chroma` IS THE ROUTE FOR ANYTHING NEW, and it is not a variant of `key` —
   it replaces it. Generate the sheet on flat magenta (255,0,255), drop the
   master in `docs/art-masters/`, and give it `{ chroma: true }`. No flood, no
   depth bound, no size floor, no `deep` judgement call, and no proof image to
   squint at for a pocket that should not have gone: a per-pixel test on a
   colour nothing in this game is drawn in cannot reach the wrong pixel. The
   whole argument is above `chromaKey` in src/core/spritesheet.js, and the
   prompt wording to use is in docs/notes/art.md.

   The two dragons keep `key` because they were generated on white long before
   this existed, and regenerating art the kids have already seen to save a tool
   a branch is the wrong trade. */
/* `out` IS WHERE IT LANDS UNDER `public/sprites/`, AND IT IS NOT `file`.
   The masters are a flat handful and the shipped tree is foldered by subject
   (`beasts/`, `kittens/`, `leaders/`...), so the two stopped matching the day
   the sprites were tidied up. Defaulting `out` to `file` rather than deriving
   it keeps a master free to be named after the drawing while the shipped copy
   is named after where it is used. */
const WORK = [
  { file: 'dragon_sheet.png', out: 'beasts/dragon_sheet.png', to: [1376, 768], key: true, deep: true },
  { file: 'dragon_fly.png', out: 'beasts/dragon_fly.png', to: [1376, 768], key: true, deep: true },
  { file: 'title_art.png', webp: 92 },
  /* The arena's stretcher-bearers: a nurse-capped tabby, ten views round and
     two poses (standing, walking), arms down at her sides so the stretcher
     can be carried at her hips. Generated on magenta, same column order as
     Ember's sheet (0 front, 2-3 facing right, 5 back, 7 facing left). */
  { file: 'hospital_cat.png', out: 'hospital/cat.png', to: [1792, 1013], chroma: true },
  /* The arena's record board (src/systems/arenaboard.js). One champion pose
     per SHEET, not per kitten: Storm and Blossom are Ember and Frost
     recoloured at runtime with their style's `recolour`, exactly as their
     walk sheets are. Mr. Satan's four are the board's "advertisements", and
     were prompted from his own satan.png as the only image reference — the
     photos Richard sent for the pose were described in words, never uploaded.
     640 because the board's canvas is 1280x720 and a pose is drawn at most
     ~600 tall on it; the 1024 masters would be downloaded for nothing. */
  { file: 'ember_champion.png', out: 'kittens/ember/champion.png', to: [640, 640], chroma: true },
  { file: 'frost_champion.png', out: 'kittens/frost/champion.png', to: [640, 640], chroma: true },
  /* THE GOBLIN SWEEP, on the kitten who learned it from Payne: crouched, one
     leg out, a swoosh round her ankles. "let's also generate a 'sweep trip'
     image/animation for the players similar to public/sprites/payne sweep
     ability and have that play when the player does the sweep ability". One
     per SHEET again — Storm and Blossom are these recoloured by `Game`. Each
     was prompted with that kitten's own `bless.png` as the only reference.
     768 like the other single poses (`inhale`, `warp`, `scared`), because it
     is drawn at her full height in the world and not on the board. */
  { file: 'ember_sweep.png', out: 'kittens/ember/sweep.png', to: [768, 768], chroma: true },
  { file: 'frost_sweep.png', out: 'kittens/frost/sweep.png', to: [768, 768], chroma: true },
  { file: 'satan_flex_zyzz.png', out: 'satan/flex_zyzz.png', to: [640, 640], chroma: true },
  { file: 'satan_flex_biceps.png', out: 'satan/flex_biceps.png', to: [640, 640], chroma: true },
  { file: 'satan_flex_trophy.png', out: 'satan/flex_trophy.png', to: [640, 640], chroma: true },
  { file: 'satan_flex_kiss.png', out: 'satan/flex_kiss.png', to: [640, 640], chroma: true },
  /* PAYNE, THE QUEST GIVER — a real person, Payne of Belegarth, who said yes
     to being in the game and approves the result. Her photos WERE uploaded as
     references, with her permission (unlike the bodybuilder photos above).
     Five masters, and the split is Richard's: "we will want to generate her
     whole body ... that we can use to expand on", so `base` is her with her
     face showing and nothing in her hands, kept for the day she becomes a
     fighter; `helmet` is the Gundam helmet ON ITS OWN, for the face reveal at
     the ending where she holds it; `town` is her wearing it, which is how she
     stands in the market all afternoon ("the helmet ... will be her starting
     pose in the town"); `sweep` is the trick she teaches, and it shows her
     face because she can only teach it after the ending — see
     systems/payne.js; and `held` is the ending itself, the helmet off and
     under her arm ("she can be holding the helmet instead of wearing it"),
     generated off `base` and `helmet` as references so it is the same girl
     and the same helmet. A pasted helmet layer was tried first and did not sit on
     her head; the model drawing her wearing it did. 768 for the two she is
     drawn big in (the town billboard and the portrait crop off it). */
  { file: 'payne_town.png', out: 'payne/town.png', to: [768, 768], chroma: true },
  { file: 'payne_base.png', out: 'payne/base.png', to: [768, 768], chroma: true },
  { file: 'payne_helmet.png', out: 'payne/helmet.png', to: [512, 512], chroma: true },
  { file: 'payne_sweep.png', out: 'payne/sweep.png', to: [640, 640], chroma: true },
  { file: 'payne_held.png', out: 'payne/held.png', to: [768, 768], chroma: true },
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
    const out = `${SHIP}/${(job.out ?? job.file).replace(/\.png$/, '.webp')}`;
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
      '-i', src, '-c:v', 'libwebp', '-quality', String(job.webp),
      '-compression_level', '6', out], { stdio: ['ignore', 'inherit', 'inherit'] });
    console.log(`${job.file.padEnd(18)} ${kb(was)} -> ${kb(statSync(out).size)}  ${out} (webp q${job.webp}, full size)`);
    continue;
  }

  const { w, h, d } = readPNG(src);
  if (job.chroma) {
    /* AND NOTHING ELSE. No flood and no pocket pass — running either after a
       chroma key would put back exactly the guessing this route exists to
       avoid, on a sheet where the answer is already known per pixel. */
    const rgb = Array.isArray(job.chroma) ? job.chroma : CHROMA_MAGENTA;
    const cleared = chromaKey(d, w, h, rgb);
    /* LOUD, because the one way this can fail is a master that was generated
       on white after all, where the key finds nothing and the sheet ships with
       its background baked in — which looks like a working file until it is on
       screen with a white box around it. */
    if (cleared < w * h * 0.05) {
      throw new Error(`${job.file}: chroma key cleared only ${cleared}px `
        + `(${(cleared / (w * h) * 100).toFixed(1)}%) — was this master really `
        + `generated on ${rgb.join(',')}?`);
    }
  } else if (job.key) {
    floodBackground(d, w, h);
    /* depthFrac 1 puts the whole sheet inside the "near the outside" mask, so
       every sealed pocket over the size floor goes. The floor stays on: it is
       what keeps flecks of paper inside the lineart from being punched out. */
    clearSealedPockets(d, w, h, undefined, job.deep ? 1 : undefined);
  }

  const [nw, nh] = job.to ?? [w, h];
  const out = nw === w && nh === h ? d : resample(d, w, h, nw, nh);
  const png = writePNG(nw, nh, out);
  writeFileSync(`${SHIP}/${job.out ?? job.file}`, png);

  let clear = 0;
  for (let i = 0; i < nw * nh; i++) if (out[i * 4 + 3] === 0) clear++;
  console.log(`${job.file.padEnd(18)} ${w}x${h} ${kb(was)} -> ${nw}x${nh} ${kb(png.length)}`
    + `  ${(clear / (nw * nh) * 100).toFixed(0)}% transparent`);

  if (wantProof) {
    writeFileSync(`${PROOF}/${job.file}`, writePNG(nw, nh, proof(out, nw, nh)));
    console.log(`${''.padEnd(18)} proof -> ${PROOF}/${job.file}`);
  }
}
