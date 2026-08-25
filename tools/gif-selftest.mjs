/* Round-trips gif.mjs: encode synthetic frames, decode the bytes back, and
   assert the decoder sees what the encoder was given. A codec you cannot read
   back is a codec that quietly writes the wrong pixels — the same argument
   png.mjs's header makes. Run: node tools/gif-selftest.mjs
   ======================================================================= */
import { encodeGIF } from './gif.mjs';
import { writeFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  (cond ? (pass++) : (fail++));
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
};

/* --- synthetic clip: a red square sliding across a blue->green gradient --- */
const W = 64, H = 48, N = 6, SQ = 12;
const frames = [];
for (let f = 0; f < N; f++) {
  const d = new Uint8Array(W * H * 4);
  const sx = 2 + f * 8; // square's left edge, moves 8px/frame
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const q = (y * W + x) * 4;
      const inSq = x >= sx && x < sx + SQ && y >= 18 && y < 18 + SQ;
      if (inSq) { d[q] = 220; d[q + 1] = 30; d[q + 2] = 30; }
      else { d[q] = 20; d[q + 1] = Math.round((x / W) * 200); d[q + 2] = Math.round((1 - x / W) * 200); }
      d[q + 3] = 255;
    }
  }
  frames.push(d);
}

const buf = encodeGIF(frames, { width: W, height: H, delayMs: 80, loop: 0 });
writeFileSync(new URL('./gif-selftest.gif', import.meta.url), buf);

/* --- structural checks on the raw bytes --- */
ok('header is GIF89a', buf.slice(0, 6).toString('ascii') === 'GIF89a');
ok('logical width', buf.readUInt16LE(6) === W);
ok('logical height', buf.readUInt16LE(8) === H);
ok('trailer byte', buf[buf.length - 1] === 0x3b);
ok('has NETSCAPE loop block', buf.includes(Buffer.from('NETSCAPE2.0')));

/* --- decode it back --- */
const dec = decodeGIF(buf);
ok('decoded width/height', dec.width === W && dec.height === H, `${dec.width}x${dec.height}`);
ok('decoded frame count', dec.frames.length === N, `(${dec.frames.length})`);
ok('decoded delay (cs)', dec.delayCs === 8, `(${dec.delayCs})`);

/* Mean per-channel error should be tiny — six flat-ish colours quantise well. */
let err = 0, cnt = 0;
for (let f = 0; f < N; f++) {
  const a = frames[f], b = dec.frames[f];
  for (let i = 0; i < W * H * 4; i += 4) {
    err += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    cnt += 3;
  }
}
const mean = err / cnt;
ok('round-trip colour error is small', mean < 6, `(mean ${mean.toFixed(2)}/255)`);

/* The moving square must land where it was drawn — proves frames are distinct
   and in order, not one frame repeated N times. */
let placed = 0;
for (let f = 0; f < N; f++) {
  const sx = 2 + f * 8;
  const cx = sx + (SQ >> 1), cy = 18 + (SQ >> 1);
  const q = (cy * W + cx) * 4;
  const b = dec.frames[f];
  if (b[q] > 150 && b[q + 1] < 90 && b[q + 2] < 90) placed++;
}
ok('the moving square is in the right place every frame', placed === N, `(${placed}/${N})`);

/* --- per-frame delays ---
   A Help clip has to STOP on the beat that introduces a new instruction, and
   holding by duplicating frames costs a whole frame each time (this encoder
   stores every frame in full, with no differencing). `delaysMs` is what makes a
   three-second card one frame that sits for three seconds, so these assert the
   table actually reaches the file rather than the single delay winning. */
const perFrame = [1000, 60, 3000, 60, 500, 2000];
const buf2 = encodeGIF(frames, { width: W, height: H, delayMs: 80, delaysMs: perFrame, loop: 0 });
const dec2 = decodeGIF(buf2);
ok('per-frame delays survive the round trip',
  JSON.stringify(dec2.delays) === JSON.stringify(perFrame.map((d) => Math.round(d / 10))),
  `(${dec2.delays.join(',')})`);
ok('delaysMs beats delayMs', dec2.delays[0] === 100 && dec2.delays[0] !== 8);
ok('a clip with no delaysMs still uses the single delay',
  dec.delays.every((d) => d === 8), `(${dec.delays.join(',')})`);
/* A short table must not leave the rest of the clip on 0cs, which browsers
   treat as "as fast as possible" and reads as the tail of the clip vanishing. */
const dec3 = decodeGIF(encodeGIF(frames, { width: W, height: H, delayMs: 80, delaysMs: [500, 500], loop: 0 }));
ok('a short delaysMs table falls back to delayMs for the rest',
  dec3.delays.length === N && dec3.delays[0] === 50 && dec3.delays.slice(2).every((d) => d === 8),
  `(${dec3.delays.join(',')})`);
/* GIF stores centiseconds; 2cs is the floor browsers honour. */
ok('a sub-20ms entry is floored, not written as zero',
  decodeGIF(encodeGIF(frames, { width: W, height: H, delaysMs: [1, 1, 1, 1, 1, 1], loop: 0 })).delays
    .every((d) => d === 2));

/* --- interframe differencing ---
   The clip above is a red square sliding across a fixed gradient, which is the
   shape every Help clip has: a small thing moves, most of the picture does
   not. These assert that the saving is real, that the picture survives it, and
   that the three ways it can silently corrupt a file are all covered — a frame
   cropped to the wrong rectangle, a transparent index that is also a drawable
   colour, and the disposal method that decides whether "transparent" means
   "keep" or "erase to background". */
const bufD = encodeGIF(frames, { width: W, height: H, delayMs: 80, loop: 0, dither: false });
const bufF = encodeGIF(frames, { width: W, height: H, delayMs: 80, loop: 0, dither: false, diff: false });
const decD = decodeGIF(bufD);
ok('differencing shrinks the file', bufD.length < bufF.length * 0.75,
  `(${bufF.length} -> ${bufD.length} bytes)`);
ok('every frame still decodes to the right size', decD.frames.length === N
  && decD.frames.every((f) => f.length === W * H * 4));
/* The pixels are what matters: a diffed clip that decodes to the wrong picture
   is worse than a big one. Undithered, this must be EXACT, not merely close. */
let exact = true;
for (let f = 0; f < N; f++) {
  const a = decodeGIF(bufF).frames[f], b = decD.frames[f];
  for (let i = 0; i < W * H * 4; i++) if (a[i] !== b[i]) { exact = false; break; }
}
ok('a diffed clip decodes identically to a whole-frame one', exact);
ok('the first frame is whole and opaque',
  decD.rects[0].w === W && decD.rects[0].h === H && !decD.rects[0].trans);
ok('later frames are cropped to what moved',
  decD.rects.slice(1).every((r) => r.w < W && r.trans),
  `(f1 ${decD.rects[1].w}x${decD.rects[1].h} at ${decD.rects[1].left},${decD.rects[1].top})`);
/* Disposal 0 would clear each frame to the background before the next, which
   turns "unchanged" into "erased" and makes the clip strobe. */
ok('every frame asks for disposal 1, do not dispose',
  decD.rects.every((r) => r.disposal === 1));
/* A held beat is one pixel now rather than a whole frame. */
const still = [frames[0], frames[0], frames[0]];
const decS = decodeGIF(encodeGIF(still, { width: W, height: H, delayMs: 80, loop: 0, dither: false }));
ok('a frame identical to the last one costs one pixel',
  decS.rects[1].w === 1 && decS.rects[1].h === 1 && decS.rects[2].w === 1);
ok('...and still decodes to the same picture',
  decS.frames[2].every((v, i) => v === decS.frames[0][i]));
/* `diff: false` has to mean it, or a caller who knows their clip cannot use it
   (dithered footage) has no way out. */
ok('diff:false writes whole frames',
  decodeGIF(bufF).rects.every((r) => r.w === W && r.h === H && !r.trans));

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);

/* ------------------------- a minimal GIF decoder ------------------------- */
/* Only enough to read what encodeGIF writes: GIF89a, one global table, full
   frames, LZW. Not a general decoder. */
function decodeGIF(buf) {
  let p = 6; // skip signature
  const width = buf.readUInt16LE(p); p += 2;
  const height = buf.readUInt16LE(p); p += 2;
  const packed = buf[p]; p += 1;
  p += 2; // bg, aspect
  const gctSize = 2 << (packed & 7);
  const gct = [];
  for (let i = 0; i < gctSize; i++) { gct.push([buf[p], buf[p + 1], buf[p + 2]]); p += 3; }

  const frames = [];
  const delays = [];
  const rects = [];
  let delayCs = 0;
  let transIdx = -1;
  let disposal = 0;
  /* THE CANVAS PERSISTS BETWEEN FRAMES, because the encoder diffs. A decoder
     that re-decoded each image descriptor into a fresh buffer would read a
     correct file as a clip of small floating rectangles on black — which is
     exactly the bug this round-trip exists to catch. */
  const canvas = new Uint8Array(width * height * 4);
  while (p < buf.length) {
    const b = buf[p++];
    if (b === 0x3b) break;            // trailer
    if (b === 0x21) {                  // extension
      const label = buf[p++];
      if (label === 0xf9) {
        p++;                                     // block size
        const flags = buf[p++];
        disposal = (flags >> 2) & 7;
        delayCs = buf.readUInt16LE(p); p += 2;
        const ti = buf[p++];
        transIdx = (flags & 1) ? ti : -1;
      }
      // skip sub-blocks
      while (buf[p] !== 0) p += buf[p] + 1;
      p++;
      continue;
    }
    if (b === 0x2c) {                  // image descriptor
      const left = buf.readUInt16LE(p); p += 2;
      const top = buf.readUInt16LE(p); p += 2;
      const fw = buf.readUInt16LE(p); p += 2;
      const fh = buf.readUInt16LE(p); p += 2;
      const lp = buf[p++];
      if (lp & 0x80) p += 3 * (2 << (lp & 7)); // local table (we never write one)
      const minCode = buf[p++];
      const data = [];
      while (buf[p] !== 0) { const n = buf[p++]; for (let i = 0; i < n; i++) data.push(buf[p++]); }
      p++;
      const idx = lzwDecode(data, minCode, fw * fh);
      for (let y = 0; y < fh; y++) {
        for (let x = 0; x < fw; x++) {
          const ci = idx[y * fw + x];
          if (ci === transIdx) continue;         // leave what was underneath
          const c = gct[ci] ?? [0, 0, 0];
          const q = ((y + top) * width + (x + left)) * 4;
          canvas[q] = c[0]; canvas[q + 1] = c[1]; canvas[q + 2] = c[2]; canvas[q + 3] = 255;
        }
      }
      frames.push(canvas.slice());
      rects.push({ left, top, w: fw, h: fh, trans: transIdx >= 0, disposal });
      /* The delay in force WHEN THIS FRAME WAS WRITTEN, kept per frame — a
         single trailing value cannot tell a clip that pauses to be read from
         one that never stops. See the delaysMs checks above. */
      delays.push(delayCs);
    }
  }
  return { width, height, frames, delayCs, delays, rects };
}

function lzwDecode(data, minCode, expected) {
  const clear = 1 << minCode;
  const eoi = clear + 1;
  let dict = [];
  const reset = () => { dict = []; for (let i = 0; i < clear; i++) dict.push([i]); dict.push(null); dict.push(null); };
  reset();
  let codeSize = minCode + 1;
  const out = [];
  let bitBuf = 0, bits = 0, dp = 0;
  const read = () => {
    while (bits < codeSize) { bitBuf |= (data[dp++] ?? 0) << bits; bits += 8; }
    const code = bitBuf & ((1 << codeSize) - 1);
    bitBuf >>= codeSize; bits -= codeSize;
    return code;
  };
  let prev = null;
  while (out.length < expected) {
    const code = read();
    if (code === clear) { reset(); codeSize = minCode + 1; prev = null; continue; }
    if (code === eoi) break;
    let entry;
    if (code < dict.length && dict[code]) entry = dict[code];
    else if (prev) entry = prev.concat(prev[0]);
    else break;
    for (const s of entry) out.push(s);
    if (prev) {
      dict.push(prev.concat(entry[0]));
      if (dict.length === (1 << codeSize) && codeSize < 12) codeSize++;
    }
    prev = entry;
  }
  return out;
}
