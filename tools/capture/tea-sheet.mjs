/* ---------------------------------------------------------------------------
   THE TEA CEREMONY'S ANIMATION, CUT OUT OF A VIDEO.
   Run: node tools/capture/tea-sheet.mjs [ember|frost]
        then node tools/sprite-bake.mjs --proof

   Richard, Oct 2026: "Let's get a new animated sprite sheet that shows the
   player drinking the tea ... from seiza sideways to seated facing the camera,
   then slowly drinks the tea ... 5 - 10x's, then animated sitting back in seiza
   and then the tea cup goes back to the table ... 24 or more sprites, 32 would
   be good. Get creative, show me what can be done with animated sprites."

   An image model cannot draw 32 frames of one cat that agree with each other;
   a video model can, because they are one performance. So each kitten's pray
   drawing (docs/art-masters/<s>_pray.png, which is ALREADY her seiza side-on)
   went to Higgsfield's grok_video as the start frame — 9 credits, 6s, flat
   magenta, locked-off camera — and this tool picks 32 of its 145 frames.

   ONE CROP FOR ALL 32. Every frame is cut through the same box (the union of
   her ink across the picks, squared, feet on the bottom) so she does not
   swim: the loader takes the cells whole (`loadSpriteAtlas`'s `uniform`)
   rather than centring each on its own ink, which would slide her sideways
   every time she leans for the bowl.

   THE PICKS ARE PER KITTEN AND MEASURED: they are 24fps frame numbers read off
   a contact sheet of her own take (two takes do not keep the same time), laid
   into the five segments `TEA_SHEET.seg` names, which is all the game knows.
   The sip is cut so it plays FORWARD AND BACK — bowl at the chest, to the
   mouth, held, and down again — and the ceremony loops it as many times as
   the clock allows (activities.js `_updateTea`).

   Writes docs/art-masters/<s>_tea.png (magenta, for sprite-bake to key) and
   out/tea/<s>_picks.png, the picks at a glance. The source videos live in
   docs/art-masters/video/ and are never shipped — public/ is copied whole.
--------------------------------------------------------------------------- */
import { mkdirSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readPNG, writePNG } from '../png.mjs';
import { TEA_SHEET } from '../../src/systems/housing/teahouse.js';

/* The 24fps frame numbers, segment by segment. Ember's take (Higgsfield
   fff3e549): she turns 0-21, the bowl is solid at her knees from 33 (30 is still
   half there), it is at her mouth 72-92, down by 126, prayer 129-144. Frames
   22-32 are skipped on purpose — the bowl fades in out of nothing there, and
   the game hides that moment behind its own 3D bowl arriving at her knees.
   Frost's (81c17e93) runs differently: she prays to you with the bowl already
   there at 24-33, reaches 36-63, sips 66-99, it is down by 120 and she
   smiles through the prayer to the end. */
const PICKS = {
  ember: {
    turn: [0, 4, 8, 12, 16, 21],
    pick: [33, 37, 41, 45, 49, 53, 57, 60],
    sip: [63, 66, 69, 72, 76, 80, 86, 92],
    down: [102, 107, 112, 117, 122, 126],
    pray: [129, 133, 138, 144],
  },
  frost: {
    turn: [0, 4, 9, 13, 17, 21],
    pick: [27, 33, 39, 45, 51, 56, 61, 66],
    sip: [68, 71, 74, 77, 80, 84, 88, 92],
    down: [99, 104, 108, 112, 116, 120],
    pray: [126, 132, 138, 144],
  },
};

const MAG = [255, 0, 255];
const isInk = (d, i) => Math.hypot(d[i] - MAG[0], d[i + 1] - MAG[1], d[i + 2] - MAG[2]) > 150;

const who = process.argv[2] ? [process.argv[2]] : Object.keys(PICKS);
for (const s of who) {
  const P = PICKS[s];
  if (!P) throw new Error(`no picks for ${s} — read a contact sheet of her take and add them`);
  const video = `docs/art-masters/video/${s}_tea.mp4`;
  if (!existsSync(video)) throw new Error(`missing ${video}`);
  const order = Object.entries(TEA_SHEET.seg).flatMap(([k, [a, b]]) => {
    if (P[k]?.length !== b - a) throw new Error(`${s}.${k}: ${P[k]?.length} picks for ${b - a} cells`);
    return P[k];
  });

  const tmp = `out/tea/${s}`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', video, '-vsync', '0', `${tmp}/%04d.png`]);
  const files = readdirSync(tmp).sort();
  const frames = order.map((n) => {
    if (!files[n]) throw new Error(`${s}: frame ${n} past the end (${files.length})`);
    return readPNG(`${tmp}/${files[n]}`);
  });

  // the union of her ink over every pick — one crop for all of them
  const { w, h } = frames[0];
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (const f of frames) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!isInk(f.d, (y * w + x) * 4)) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  // squared, centred across, feet on the bottom, a margin of magenta round it
  const M = 12;
  const side = Math.max(x1 - x0, y1 - y0) + 1 + M * 2;
  const cx0 = Math.round((x0 + x1) / 2 - side / 2);
  const cy0 = y1 + M + 1 - side;
  const { cols, rows } = TEA_SHEET;
  const W = cols * side, H = rows * side;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { out[i * 4] = 255; out[i * 4 + 2] = 255; out[i * 4 + 3] = 255; }
  frames.forEach((f, k) => {
    const ox = (k % cols) * side, oy = Math.floor(k / cols) * side;
    for (let y = 0; y < side; y++) {
      const sy = cy0 + y;
      if (sy < 0 || sy >= h) continue;
      for (let x = 0; x < side; x++) {
        const sx = cx0 + x;
        if (sx < 0 || sx >= w) continue;
        const si = (sy * w + sx) * 4, di = ((oy + y) * W + ox + x) * 4;
        out[di] = f.d[si]; out[di + 1] = f.d[si + 1]; out[di + 2] = f.d[si + 2];
      }
    }
  });
  /* ...and down to a 512 cell for the master: the video is the real master,
     and a 7000-pixel PNG of it would be 20MB in git for a sheet that ships
     at 256 a cell (sprite-bake `to`). */
  writeFileSync(`${tmp}/full.png`, writePNG(W, H, out));
  const MC = TEA_SHEET.master;
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', `${tmp}/full.png`,
    '-vf', `scale=${cols * MC}:${rows * MC}:flags=lanczos`, `docs/art-masters/${s}_tea.png`]);
  console.log(`${s}: ${order.length} frames, ink ${x1 - x0 + 1}x${y1 - y0 + 1}, cell ${side} -> ${MC}`);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', `docs/art-masters/${s}_tea.png`,
    '-vf', 'scale=1280:-1', `out/tea/${s}_picks.png`]);
}
