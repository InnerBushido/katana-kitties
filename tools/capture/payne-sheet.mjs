/* ---------------------------------------------------------------------------
   PAYNE'S INTRODUCTION, CUT OUT OF SIX VIDEOS.
   Run: node tools/capture/payne-sheet.mjs

   The tea ceremony's route (tools/capture/tea-sheet.mjs) at four times the
   size: a video model draws one performance whose frames agree with each
   other, which an image model cannot, and this tool picks the frames
   `src/systems/payneclips.js` names out of it. The masters are the videos in
   docs/art-masters/video/ and are never shipped.

   ONE SCALE FOR EVERY TAKE, ONE CROP PER CLIP. Each take's first frame is
   the approved drawing it started from; its ink height is one unit and its
   feet the origin, and every clip is cropped to its own ink in those units
   (see "one unit per take", below, for why the old union crop had to go).
   The rectangles go to src/systems/payneframes.js, which this writes.

   KEYED HERE, NOT IN sprite-bake. The pages are WebP (a page of PNG cells
   is ~6MB; WebP with alpha is a tenth of it), sprite-bake's chroma route
   writes PNG, and a VIDEO's magenta needs a different key from a still's —
   see `magentaKey`. The downsample is sprite-bake's own (tools/premul.mjs).

   TWO SETS: 760px to a unit of her height, and 380 for the cautious tier,
   where a page's decode is the cost (the half set is a quarter of it).
   systems/payneintro.js picks one off `device.atlasMax`.

   Writes public/sprites/payne/intro/<clip>_<page>.webp (and half/), and
   out/payne/<clip>.png — every page of a clip over a checker, to look at.
--------------------------------------------------------------------------- */
import { mkdirSync, writeFileSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readPNG, writePNG } from '../png.mjs';
import { resample } from '../premul.mjs';
import {
  INTRO_TAKES, TAKE_FROM, INTRO_CLIPS, INTRO_COLS, PAGE_MAX, INTRO_UNIT_PX, INTRO_UNIT_PX_HALF,
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

/* --- ink, measured ----------------------------------------------------------
   Ink is what survives the key with real opacity. A 3px border of the frame
   is ignored: Kling softens the very edge and it can read as faint ink. */
function inkBox(take, n) {
  const { w, h, d } = keyedFrame(take, n);
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 3; y < h - 3; y++) {
    for (let x = 3; x < w - 3; x++) {
      if (d[(y * w + x) * 4 + 3] < 128) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return { x0, y0, x1, y1 };
}

/* --- one unit per take -------------------------------------------------------
   WAS ONE CROP FOR EVERY FRAME OF EVERY TAKE, which held while every take was
   960 square with her the same size in it. The tall takes have her 770px
   tall, not 940, and a union crop over both would have drawn her a fifth
   smaller every time the scene cut from a TALK clip to a HALT one. So each
   take is measured off its FIRST frame — the approved drawing it started
   from (TAKE_FROM) — and that drawing's ink height is one unit and its feet,
   bottom-centre, are the origin. Measured, not reasoned from the 60% the
   start image was made at: Kling re-renders the frame, and the eighth
   non-negotiable is about exactly this. */
const unitOf = {};
for (const take of Object.keys(INTRO_TAKES)) {
  const b = inkBox(take, 0);
  unitOf[take] = { U: b.y1 - b.y0 + 1, fx: (b.x0 + b.x1 + 1) / 2, fy: b.y1 + 1 };
  const { w, h } = frame(take, 0);
  console.log(`${take.padEnd(6)} ${w}x${h}  from ${TAKE_FROM[take].padEnd(4)}  unit ${unitOf[take].U}px, feet (${unitOf[take].fx.toFixed(1)},${unitOf[take].fy})`);
}

/* --- one crop per clip, in units ---------------------------------------------
   Her own ink across the clip's frames, plus a margin, so a pointing clip is
   tall and a standing one is not and neither pays for the other's air. The
   game draws each cell at this rectangle, relative to her feet, which is what
   keeps her planted across a cut (payneframes.js). */
const M = 8;
const geo = {};
for (const [name, clip] of Object.entries(INTRO_CLIPS)) {
  const { w: FW, h: FH } = frame(clip.take, 0);
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (const n of clipFrames(clip)) {
    const b = inkBox(clip.take, n);
    x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0);
    x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
  }
  const cx0 = Math.max(0, x0 - M), cy0 = Math.max(0, y0 - M);
  const cx1 = Math.min(FW, x1 + 1 + M), cy1 = Math.min(FH, y1 + 1 + M);
  // THE CHECK THAT WOULD HAVE CAUGHT THE CUT-OFF HAND: ink within the margin
  // of the frame's top is an arm the take did not have room for.
  if (y0 <= 3 + 2) console.warn(`  ! ${name}: ink touches the top of the frame (y ${y0}) — the take has no headroom`);
  const { U, fx, fy } = unitOf[clip.take];
  geo[name] = {
    crop: { x: cx0, y: cy0, w: cx1 - cx0, h: cy1 - cy0 },
    // units, x right of her feet, y up from them
    x0: (cx0 - fx) / U, x1: (cx1 - fx) / U, y0: (fy - cy1) / U, y1: (fy - cy0) / U,
    U,
  };
}

/** The crop of one keyed frame, at full size. */
function cropOf(take, n, c) {
  const { w, d } = keyedFrame(take, n);
  const o = new Uint8ClampedArray(c.w * c.h * 4);
  for (let y = 0; y < c.h; y++) {
    const s = ((c.y + y) * w + c.x) * 4;
    o.set(d.subarray(s, s + c.w * 4), y * c.w * 4);
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
const r4 = (v) => +v.toFixed(4);
// a re-cut must not leave pages of a clip that no longer exists, or of a page count that shrank
rmSync(`${SHIP}/sprites/payne/intro`, { recursive: true, force: true });
mkdirSync(`${SHIP}/sprites/payne/intro/half`, { recursive: true });
let total = 0, totalHalf = 0, cells = 0;
const out = {};

for (const [name, clip] of Object.entries(INTRO_CLIPS)) {
  const picks = clipFrames(clip);
  const G = geo[name];
  cells += picks.length;
  const scaled = {};
  for (const [tag, px] of [['full', INTRO_UNIT_PX], ['half', INTRO_UNIT_PX_HALF]]) {
    const cw = Math.round(G.crop.w / G.U * px);
    const ch = Math.round(G.crop.h / G.U * px);
    scaled[tag] = { cw, ch, cells: picks.map((n) => resample(cropOf(clip.take, n, G.crop), G.crop.w, G.crop.h, cw, ch, [0, 0, 0])) };
  }
  /* AS MANY TO A PAGE AS FIT UNDER PAGE_MAX, decided on the FULL set and
     kept for the half, so the two sets have the same pages. A pointing cell
     is ~1.5 units tall, 1100px, and a 16-cell page of those would be 4400. */
  const { cw, ch } = scaled.full;
  const cols = Math.max(1, Math.min(INTRO_COLS, picks.length, Math.floor(PAGE_MAX / cw)));
  const perPage = cols * Math.max(1, Math.floor(PAGE_MAX / ch));
  const pages = Math.ceil(picks.length / perPage);
  for (let k = 0; k < pages; k++) {
    const slice = picks.slice(k * perPage, (k + 1) * perPage);
    const rows = Math.ceil(slice.length / cols);
    const across = Math.min(cols, slice.length);
    for (const tag of ['full', 'half']) {
      const { cw: w, ch: h, cells: cs } = scaled[tag];
      const W = across * w, H = rows * h;
      const page = new Uint8ClampedArray(W * H * 4);
      slice.forEach((_, j) => {
        const src = cs[k * perPage + j];
        const ox = (j % cols) * w, oy = Math.floor(j / cols) * h;
        for (let y = 0; y < h; y++) page.set(src.subarray(y * w * 4, (y + 1) * w * 4), ((oy + y) * W + ox) * 4);
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
  out[name] = { n: picks.length, cols, perPage, pages, x0: r4(G.x0), x1: r4(G.x1), y0: r4(G.y0), y1: r4(G.y1) };
  console.log(`${name.padEnd(11)} ${clip.take.padEnd(6)} ${clip.from}-${clip.to}/${clip.step}  ${String(picks.length).padStart(2)} cells  ${cw}x${ch}  ${pages}p  y ${G.y0.toFixed(2)}..${G.y1.toFixed(2)}`);
}
console.log(`${cells} cells: ${kb(total)} full, ${kb(totalHalf)} half`);

/* --- the market's own two drawings, in the same units ------------------------
   What the stage draws when a page has not arrived (or the folder is gone):
   the whole image, placed by ITS feet. Measured off the shipped PNG, whose
   size is not the master's. */
const rest = {};
for (const art of ['town', 'held']) {
  const { w, h, d } = readPNG(`${SHIP}/sprites/payne/${art}.png`);
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] < 128) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const U = y1 - y0 + 1, fx = (x0 + x1 + 1) / 2, fy = y1 + 1;
  rest[art] = { x0: r4(-fx / U), x1: r4((w - fx) / U), y0: r4((fy - h) / U), y1: r4(fy / U) };
}

/* --- the stage: every clip's rectangle at once, so one canvas holds any of
   them, and a crossfade between two clips is two draws into the same frame. */
const all = [...Object.values(out), ...Object.values(rest)];
const stage = {
  x0: r4(Math.min(...all.map((g) => g.x0))), x1: r4(Math.max(...all.map((g) => g.x1))),
  y0: r4(Math.min(...all.map((g) => g.y0))), y1: r4(Math.max(...all.map((g) => g.y1))),
};
console.log(`stage ${stage.x0}..${stage.x1} x ${stage.y0}..${stage.y1} units`);

const js = `/* GENERATED by tools/capture/payne-sheet.mjs — do not edit; re-run the tool.

   Where every intro clip's cells sit, in units of HER STANDING HEIGHT with
   her feet at the origin (x right, y up), and how its pages are laid out.
   A cell covers exactly [x0,x1] x [y0,y1]; \`stage\` is all of them at once.
   \`rest\` is the market's own two drawings, whole, in the same units. */

export const INTRO_GEO = ${JSON.stringify(out, null, 2)};

export const INTRO_REST = ${JSON.stringify(rest, null, 2)};

export const INTRO_STAGE = ${JSON.stringify(stage)};
`;
writeFileSync('src/systems/payneframes.js', js.replace(/\n/g, '\r\n'));
console.log('wrote src/systems/payneframes.js');
