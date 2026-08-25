/* Cut the Help panel's clan cards out of the sprite art.
   ===========================================================================
   Six leaders and six clan symbols, sized for a card in `#panel-help`.

   WHY THIS EXISTS AT ALL. The source art is twelve files totalling 4.7MB —
   six 1024x1024 leaders at 550-900KB each. The Help panel already streams its
   clips in one at a time and holds them off the wire until a kid opens Help
   (`Game._warmHelpClips`), and putting another 4.7MB on that queue ahead of
   the screenshots would push the pictures she actually asked for behind five
   megabytes of art she is about to see at 120 pixels tall. Six thumbnails come
   to a fraction of one clip.

   THE BACKGROUND IS KEYED WITH THE GAME'S OWN CODE, not a threshold written
   here. `floodBackground` is what `loadSpriteAtlas` runs on these exact files,
   it is pure pixel data with no canvas, and world-check already calls it
   headless — so the thumbnail's cut-out edge is the same edge the game draws.
   A local "white is anything over 240" would disagree with it the first time
   somebody re-exported a leader with a different anti-alias, and the panel
   would grow a halo nobody could trace back to here.

   AND THE CROP IS MEASURED. House rule 8: the boxes come off the alpha after
   keying, so re-exporting a leader with more or less margin changes nothing
   downstream. Nothing here is a coordinate somebody typed while looking at a
   picture.

   Run it when the leader or clan-symbol art changes:
       node tools/help-portraits.mjs
   It writes public/help/clan/. */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';

const { readPNG, writePNG } = await import(new URL('./png.mjs', import.meta.url).href);
/* The GAME'S keyer, imported from src. It is pure pixel data with no canvas
   and no three.js at module scope, which is the same property world-check
   relies on to run the real background removal headless. */
const { floodBackground } = await import(new URL('../src/core/spritesheet.js', import.meta.url).href);

const img = (w, h) => ({ w, h, d: new Uint8ClampedArray(w * h * 4) });

/* Separable triangle filter, verbatim from tools/steam-art.mjs, which carries
   the note explaining why: the shrinks here are 1024 -> 240, and a plain
   bilinear at 0.23x reads about one source pixel in eighteen — the lineart
   crawls and the whiskers break up. Premultiplied through the filter so the
   transparent side of the cut edge cannot drag white back into the fur. */
function resample(src, rect, dw, dh) {
  const { x = 0, y = 0, w = src.w, h = src.h } = rect;
  const pass = (s, sw, sh, tw, vertical) => {
    const outW = vertical ? sw : tw;
    const t = new Float32Array((vertical ? sw * tw : tw * sh) * 4);
    const scale = tw / (vertical ? sh : sw);
    const support = Math.max(1, 1 / scale);
    const span = vertical ? sh : sw;
    for (let o = 0; o < tw; o++) {
      const centre = (o + 0.5) / scale;
      const lo = Math.max(0, Math.ceil(centre - support - 0.5));
      const hi = Math.min(span - 1, Math.floor(centre + support - 0.5));
      for (let q = 0; q < (vertical ? sw : sh); q++) {
        let r = 0; let g = 0; let b = 0; let a = 0; let sum = 0;
        for (let i = lo; i <= hi; i++) {
          const wgt = 1 - Math.abs((i + 0.5 - centre) / support);
          if (wgt <= 0) continue;
          const si = (vertical ? (i * sw + q) : (q * sw + i)) * 4;
          const al = s[si + 3] * wgt;
          r += s[si] * al; g += s[si + 1] * al; b += s[si + 2] * al;
          a += al; sum += wgt;
        }
        const di = (vertical ? (o * outW + q) : (q * outW + o)) * 4;
        t[di] = a > 0 ? r / a : 0;
        t[di + 1] = a > 0 ? g / a : 0;
        t[di + 2] = a > 0 ? b / a : 0;
        t[di + 3] = sum > 0 ? a / sum : 0;
      }
    }
    return t;
  };
  const cut = new Float32Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const s = ((y + j) * src.w + (x + i)) * 4;
      const t = (j * w + i) * 4;
      cut[t] = src.d[s]; cut[t + 1] = src.d[s + 1];
      cut[t + 2] = src.d[s + 2]; cut[t + 3] = src.d[s + 3];
    }
  }
  const end = pass(pass(cut, w, h, dw, false), dw, h, dh, true);
  const out = img(dw, dh);
  for (let i = 0; i < out.d.length; i++) out.d[i] = Math.round(end[i]);
  return out;
}

/** The box of everything the keyer left standing. Alpha only — see house rule 8. */
function inkBox(src) {
  let x0 = src.w, y0 = src.h, x1 = -1, y1 = -1;
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      if (src.d[(y * src.w + x) * 4 + 3] <= 8) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w: src.w, h: src.h };
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function keyed(file) {
  const src = readPNG(file);
  floodBackground(src.d, src.w, src.h);
  return src;
}

/* Two sizes, both TWICE what the card shows, so the cards stay sharp on the
   2x screens these are actually read on. The leaders are sized by HEIGHT
   because they are standing cats of differing build — sizing by width would
   make the Maine Coon's ruff shrink her to a Siamese's shoulder height. */
const LEADER_H = 240;
const SYM = 96;
/* Slack around the widest cat on the common canvas. See ONE CANVAS, below. */
const LEADER_SLACK = 1.08;

const CLANS = [
  ['thunder', 'thunderpaw'],
  ['river', 'riverclaw'],
  ['shadow', 'shadowtail'],
  ['wind', 'windwhisker'],
  ['ice', 'icewhisker'],
  ['panda', 'pandapaw'],
];

mkdirSync('public/help/clan', { recursive: true });
let total = 0;
const say = (path, im) => {
  const bytes = writePNG(im.w, im.h, im.d);
  writeFileSync(path, bytes);
  total += bytes.length;
  console.log(`  ${path.padEnd(34)} ${`${im.w}x${im.h}`.padEnd(9)} ${(bytes.length / 1024).toFixed(0)}KB`);
};

/** Centre `small` on a transparent canvas, sitting on its bottom edge. */
function onCanvas(small, W, H, bottom = true) {
  const out = img(W, H);
  const ox = (W - small.w) >> 1;
  const oy = bottom ? H - small.h : (H - small.h) >> 1;
  for (let y = 0; y < small.h; y++) {
    for (let x = 0; x < small.w; x++) {
      const from = (y * small.w + x) * 4;
      const to = ((y + oy) * W + (x + ox)) * 4;
      for (let k = 0; k < 4; k++) out.d[to + k] = small.d[from + k];
    }
  }
  return out;
}

/* ONE CANVAS FOR ALL SIX, and it is measured here rather than guessed in CSS.
   The first cut wrote each portrait cropped to its own ink and let the card's
   `object-fit: contain` line them up. That works only while the slot is wider
   than the widest cat, and cropped-to-ink the Ragdoll is 249x240 against a
   104x100 slot — 0.2 of a pixel of margin. Re-export one leader with a fuller
   tail and three of the six silently shrink, in a rule nobody would think to
   look at. So the tool finds the widest of the six, pads them ALL onto that one
   canvas standing on the bottom edge, and the card just draws the file. Six
   identical boxes cannot fall out of alignment with each other. */
const boxes = CLANS.map(([, art]) => {
  const src = keyed(`public/sprites/leader_${art}.png`);
  return { src, box: inkBox(src) };
});
const widest = Math.max(...boxes.map(({ box }) => box.w / box.h));
const LEADER_W = Math.round(LEADER_H * widest * LEADER_SLACK);

console.log('\nclan cards -> public/help/clan/');
console.log(`  widest cat is ${widest.toFixed(3)}:1 -> a common ${LEADER_W}x${LEADER_H} canvas\n`);
CLANS.forEach(([id, art], ci) => {
  const { src, box } = boxes[ci];
  const w = Math.max(1, Math.round(box.w * (LEADER_H / box.h)));
  say(`public/help/clan/leader-${id}.png`,
    onCanvas(resample(src, box, w, LEADER_H), LEADER_W, LEADER_H));

  const sym = keyed(`public/sprites/clan_${id}.png`);
  const sbox = inkBox(sym);
  /* A symbol is a badge in a fixed round slot, so it is fitted into a SQUARE
     rather than sized by one edge — the bolt is tall and the paw is wide, and
     six badges of different heights in a row reads as a mistake. Centred both
     ways here, unlike the cats, who stand on the floor. */
  const s = SYM / Math.max(sbox.w, sbox.h);
  const sw = Math.max(1, Math.round(sbox.w * s));
  const sh = Math.max(1, Math.round(sbox.h * s));
  say(`public/help/clan/sym-${id}.png`,
    onCanvas(resample(sym, sbox, sw, sh), SYM, SYM, false));
});

const before = CLANS.reduce((n, [id, art]) => n
  + readFileSync(`public/sprites/leader_${art}.png`).length
  + readFileSync(`public/sprites/clan_${id}.png`).length, 0);
console.log(`\n  ${(before / 1024 / 1024).toFixed(2)}MB of source art -> ${(total / 1024).toFixed(0)}KB of cards\n`);
