/* ---------------------------------------------------------------------------
   PAYNE'S INTRODUCTION, CUT OUT OF THREE VIDEOS.
   Run: node tools/capture/payne-sheet.mjs

   The tea ceremony's route (tools/capture/tea-sheet.mjs) at four times the
   size: a video model draws one performance whose frames agree with each
   other, which an image model cannot, and this tool picks the frames
   `src/systems/payneclips.js` names out of it. The masters are the videos in
   docs/art-masters/video/ and are never shipped.

   ONE CROP FOR EVERY FRAME OF EVERY TAKE — the union of her ink across all
   the picks, feet on the bottom, centred across. Per take it would be three
   sizes of her, and the cut from the unmask into the talking loop would be a
   jump in scale; per frame she would slide sideways every time she points.

   KEYED HERE, NOT IN sprite-bake. The pages are WebP (a page of PNG cells
   is ~6MB; WebP with alpha is a tenth of it), sprite-bake's chroma route
   writes PNG, and a VIDEO's magenta needs a different key from a still's —
   see `magentaKey`. The downsample is sprite-bake's own (tools/premul.mjs).

   TWO SETS: 768-tall cells, and 384 for the cautious tier, where a page's
   decode is the cost (a 768x480 cell is 1.4MB decoded; the half set is a
   quarter of that). systems/payneintro.js picks one off `device.atlasMax`.

   Writes public/sprites/payne/intro/<clip>_<page>.webp (and half/), and
   out/payne/<clip>.png — every page of a clip over a checker, to look at.
--------------------------------------------------------------------------- */
import { mkdirSync, writeFileSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readPNG, writePNG } from '../png.mjs';
import { resample } from '../premul.mjs';
import {
  INTRO_TAKES, INTRO_CLIPS, INTRO_COLS, INTRO_PER_PAGE, INTRO_CELL_H, INTRO_CELL_H_HALF,
  clipFrames, pagePath,
} from '../../src/systems/payneclips.js';

const OUT = 'out/payne';
const SHIP = 'public';
const ff = (...a) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a]);

/* --- every frame of every take, once ------------------------------------- */
const frames = {};
for (const [take, video] of Object.entries(INTRO_TAKES)) {
  if (!existsSync(video)) throw new Error(`missing ${video}`);
  const dir = `${OUT}/frames/${take}`;
  if (!existsSync(dir) || readdirSync(dir).length === 0) {
    mkdirSync(dir, { recursive: true });
    ff('-i', video, '-vsync', '0', `${dir}/%04d.png`);
  }
  frames[take] = readdirSync(dir).sort().map((f) => `${dir}/${f}`);
}
const cache = new Map();
const frame = (take, n) => {
  const f = frames[take][n];
  if (!f) throw new Error(`${take}: frame ${n} past the end (${frames[take].length})`);
  if (!cache.has(f)) cache.set(f, readPNG(f));
  return cache.get(f);
};

/* --- the key, per frame: a copy, keyed --------------------------------------
   NOT `chromaKey`, which was tried first and left two things on her:
   · A PURPLE RIM. A video's edge is a BLEND — half ink, half background —
     and a black line half over magenta is (110,10,105): 150+ from magenta, so
     the distance key calls it paint and draws it opaque. Every outline she
     has came out with a dark-purple pixel either side of it.
   · A GROUND SHADOW. Kling drew one under her feet in the MASKED take, a
     darker magenta (~130,20,120), which is 180 from the key: paint again.
   And the take's magenta is not (255,0,255) anyway: MASKED's corners are
   (225,16,211), MASK's and TALK's (240,3,240), 35 apart.

   SO THE KEY IS HOW MUCH MAGENTA IS IN A PIXEL, `min(r,b) - g`, which is the
   one thing nothing she wears has. Measured over a frame of each take: her
   paint is at or under 10 (skin, hair and checks are well below 0; the red
   stripe is ~10), the background is 180-240, and the blends are the ramp
   between. Opaque under `M0`, gone over `M1`, and between them the pixel is
   UN-MIXED — the frame's own background (its corners) taken back out at the
   fraction it is being faded — so a half-magenta ink edge comes back as a
   half-transparent BLACK edge, which is what it was drawn as.
   The shadow is the bottom `SHADOW_BAND` of the frame, where only her
   sneakers are (black and white, m ~0): anything with magenta in it there is
   floor, and goes.
   AND MAGENTA HAS RED AND BLUE EQUAL. Her belt is VIOLET, measured at
   (100,37,134) over 600 pixels: m 63, so the first cut un-mixed it into a
   blue belt. The background's red and blue are never more than 15 apart
   (corners above), so past `RB` of BLUE OVER RED a pixel is paint whatever
   its m says, at three times the gap. ONE-SIDED: the first version used
   |b - r|, and then every olive sleeve's edge over magenta (~170,56,150,
   red over blue) was 'paint' too and kept a pink fringe. */
const RB = 12;
const M0 = 20;
const M1 = 175;
const SHADOW_BAND = 0.09;
const SHADOW_M = 45;
function magentaKey(src, w, h) {
  const d = new Uint8ClampedArray(src);
  const corner = [[4, 4], [w - 5, 4], [4, h - 5], [w - 5, h - 5]].map(([x, y]) => (y * w + x) * 4);
  const K = [0, 1, 2].map((c) => corner.reduce((s, i) => s + d[i + c], 0) / corner.length);
  const band = h * (1 - SHADOW_BAND);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    const m = Math.min(d[i], d[i + 2]) - d[i + 1] - 3 * Math.max(0, d[i + 2] - d[i] - RB);
    if (m <= M0) continue;
    if (m >= M1 || (p / w >= band && m > SHADOW_M)) { d[i + 3] = 0; continue; }
    const a = (M1 - m) / (M1 - M0);
    for (let c = 0; c < 3; c++) d[i + c] = (d[i + c] - (1 - a) * K[c]) / a;
    d[i + 3] = Math.round(255 * a);
  }
  return d;
}
const keyed = new Map();
const keyedFrame = (take, n) => {
  const k = `${take}:${n}`;
  if (keyed.has(k)) return keyed.get(k);
  const { w, h, d } = frame(take, n);
  const out = { w, h, d: magentaKey(d, w, h) };
  keyed.set(k, out);
  return out;
};

/* --- one crop for everything ------------------------------------------------
   Ink is what survives the key with real opacity. A 3px border of the frame
   is ignored: Kling softens the very edge and it can read as faint ink. */
let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
for (const c of Object.values(INTRO_CLIPS)) {
  for (const n of clipFrames(c)) {
    const { w, h, d } = keyedFrame(c.take, n);
    for (let y = 3; y < h - 3; y++) {
      for (let x = 3; x < w - 3; x++) {
        if (d[(y * w + x) * 4 + 3] < 128) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
}
const M = 8;
const { w: FW, h: FH } = frame('mask', 0);
const cropH = Math.min(FH, y1 - y0 + 1 + M * 2);
const cropW = Math.min(FW, x1 - x0 + 1 + M * 2);
const cx0 = Math.max(0, Math.min(FW - cropW, Math.round((x0 + x1) / 2 - cropW / 2)));
const cy0 = Math.max(0, Math.min(FH - cropH, y1 + M + 1 - cropH));
console.log(`ink ${x1 - x0 + 1}x${y1 - y0 + 1} at (${x0},${y0}); crop ${cropW}x${cropH} at (${cx0},${cy0})`);

/** The crop of one keyed frame, at full size. */
function cropOf(take, n) {
  const { w, d } = keyedFrame(take, n);
  const o = new Uint8ClampedArray(cropW * cropH * 4);
  for (let y = 0; y < cropH; y++) {
    const s = ((cy0 + y) * w + cx0) * 4;
    o.set(d.subarray(s, s + cropW * 4), y * cropW * 4);
  }
  return o;
}

/** Over a loud checker, for a human to look at. */
function proof(d, w, h) {
  const o = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const x = i % w, y = (i / w) | 0;
    const c = (((x >> 4) + (y >> 4)) & 1) ? [70, 140, 210] : [40, 90, 150];
    const a = d[i * 4 + 3] / 255;
    for (let k = 0; k < 3; k++) o[i * 4 + k] = d[i * 4 + k] * a + c[k] * (1 - a);
    o[i * 4 + 3] = 255;
  }
  return o;
}

const kb = (n) => `${(n / 1024).toFixed(0)}K`;
mkdirSync(`${SHIP}/sprites/payne/intro/half`, { recursive: true });
let total = 0, totalHalf = 0, cells = 0;

for (const [name, clip] of Object.entries(INTRO_CLIPS)) {
  const picks = clipFrames(clip);
  cells += picks.length;
  const scaled = {};
  for (const [tag, ch] of [['full', INTRO_CELL_H], ['half', INTRO_CELL_H_HALF]]) {
    const cw = Math.round(cropW * ch / cropH);
    scaled[tag] = { cw, ch, cells: picks.map((n) => resample(cropOf(clip.take, n), cropW, cropH, cw, ch, [0, 0, 0])) };
  }
  for (let k = 0; k * INTRO_PER_PAGE < picks.length; k++) {
    const slice = picks.slice(k * INTRO_PER_PAGE, (k + 1) * INTRO_PER_PAGE);
    const rows = Math.ceil(slice.length / INTRO_COLS);
    const cols = Math.min(INTRO_COLS, slice.length);
    for (const tag of ['full', 'half']) {
      const { cw, ch, cells: cs } = scaled[tag];
      const W = cols * cw, H = rows * ch;
      const page = new Uint8ClampedArray(W * H * 4);
      slice.forEach((_, j) => {
        const src = cs[k * INTRO_PER_PAGE + j];
        const ox = (j % INTRO_COLS) * cw, oy = Math.floor(j / INTRO_COLS) * ch;
        for (let y = 0; y < ch; y++) page.set(src.subarray(y * cw * 4, (y + 1) * cw * 4), ((oy + y) * W + ox) * 4);
      });
      const png = `${OUT}/pages/${tag}_${name}_${k}.png`;
      mkdirSync(`${OUT}/pages`, { recursive: true });
      writeFileSync(png, writePNG(W, H, page));
      const dest = `${SHIP}${pagePath(name, k, tag === 'half')}`;
      /* LOSSY COLOUR, ALPHA KEPT. Under a cleared pixel `resample` leaves
         BLACK, and that is deliberate here: yuv420 averages colour over 2x2,
         so whatever is under the transparency bleeds one pixel into her edge,
         and her edge is a black ink line. White (sprite-bake's choice, for its
         runtime keyer, which these pages never meet) would have drawn a pale
         rim round her. ffmpeg's libwebp has no `-exact` to sidestep it. */
      ff('-i', png, '-c:v', 'libwebp', '-quality', '88', '-compression_level', '6',
        '-pix_fmt', 'yuva420p', dest);
      if (tag === 'full') total += statSync(dest).size; else totalHalf += statSync(dest).size;
      if (tag === 'full') writeFileSync(`${OUT}/${name}_${k}.png`, writePNG(W, H, proof(page, W, H)));
    }
  }
  console.log(`${name.padEnd(12)} ${clip.take.padEnd(7)} ${clip.from}-${clip.to}/${clip.step}  ${String(picks.length).padStart(2)} cells  ${scaled.full.cw}x${scaled.full.ch}`);
}
console.log(`${cells} cells: ${kb(total)} full, ${kb(totalHalf)} half`);
