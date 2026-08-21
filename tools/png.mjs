/* ---------------------------------------------------------------------------
   A PNG reader for the smoke test, in one file and with no dependencies.

   `world-check` runs with no DOM and no GPU, so it cannot ask a canvas to
   decode an image — and the sprite loader's background removal is exactly the
   kind of code that has to be checked against the REAL sheets. A synthetic
   fixture proves the rule is self-consistent; it cannot prove that Mr. Satan's
   teeth survive it, which is the thing that broke.

   Scope is deliberately the four lines the project's own sheets are: 8 bits a
   channel, non-interlaced. Anything else throws rather than guessing, because
   a decoder that quietly returns the wrong pixels turns every check that reads
   them into a lie.
--------------------------------------------------------------------------- */

import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * @param {string|URL} file
 * @returns {{w:number, h:number, d:Uint8ClampedArray}} RGBA, one byte each.
 */
export function readPNG(file) {
  const buf = readFileSync(file);
  let p = 8; // skip the signature
  let w = 0;
  let h = 0;
  let depth = 0;
  let colour = 0;
  let palette = null;
  let trns = null;
  const idat = [];

  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      colour = data[9];
      if (data[12] !== 0) throw new Error(`${file}: interlaced PNG unsupported`);
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8) throw new Error(`${file}: bit depth ${depth} unsupported`);
  const chan = CHANNELS[colour];
  if (!chan) throw new Error(`${file}: colour type ${colour} unsupported`);

  /* Un-filter. Each scanline picks one of five predictors and stores the
     residual against it, so a row can only be reconstructed after the one
     above it — which is why this is a loop and not a map. */
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * chan;
  const flat = Buffer.alloc(h * stride);
  let ip = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[ip++];
    const row = raw.subarray(ip, ip + stride);
    ip += stride;
    const o = y * stride;
    const up = o - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= chan ? flat[o + x - chan] : 0;          // left
      const b = y > 0 ? flat[up + x] : 0;                    // above
      const c = x >= chan && y > 0 ? flat[up + x - chan] : 0; // above-left
      let v = row[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const q = a + b - c;
        const pa = Math.abs(q - a);
        const pb = Math.abs(q - b);
        const pc = Math.abs(q - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`${file}: bad filter ${filter}`);
      flat[o + x] = v & 255;
    }
  }

  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (colour === 6) {
      d[o] = flat[i * 4]; d[o + 1] = flat[i * 4 + 1];
      d[o + 2] = flat[i * 4 + 2]; d[o + 3] = flat[i * 4 + 3];
    } else if (colour === 2) {
      d[o] = flat[i * 3]; d[o + 1] = flat[i * 3 + 1];
      d[o + 2] = flat[i * 3 + 2]; d[o + 3] = 255;
    } else if (colour === 0) {
      d[o] = d[o + 1] = d[o + 2] = flat[i]; d[o + 3] = 255;
    } else if (colour === 4) {
      d[o] = d[o + 1] = d[o + 2] = flat[i * 2]; d[o + 3] = flat[i * 2 + 1];
    } else {
      const k = flat[i];
      d[o] = palette[k * 3]; d[o + 1] = palette[k * 3 + 1];
      d[o + 2] = palette[k * 3 + 2];
      d[o + 3] = trns && k < trns.length ? trns[k] : 255;
    }
  }
  return { w, h, d };
}

/**
 * Every opaque run of pixels satisfying `hit`, 4-connected, as boxes with a
 * pixel count. Used to ask what the background removal actually did to a
 * region of a sheet.
 */
export function blobs(d, w, h, hit) {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const out = [];
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || !hit(s)) continue;
    let sp = 0;
    let n = 0;
    stack[sp++] = s;
    seen[s] = 1;
    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;
    while (sp > 0) {
      const p = stack[--sp];
      n++;
      const x = p % w;
      const y = (p / w) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (const q of [x < w - 1 ? p + 1 : -1, x > 0 ? p - 1 : -1,
        y < h - 1 ? p + w : -1, y > 0 ? p - w : -1]) {
        if (q < 0 || seen[q] || !hit(q)) continue;
        seen[q] = 1;
        stack[sp++] = q;
      }
    }
    // `seed` is a pixel that really is IN the blob — a bbox corner need not be.
    out.push({ n, seed: s, minX, maxX, minY, maxY });
  }
  return out.sort((a, b) => b.n - a.n);
}

/* ---------------------------------------------------------------------------
   ...AND A WRITER, ADDED FOR tools/steam-art.mjs.

   Steam wants four fixed sizes and Windows wants a `.ico`, and the source for
   all of them is `public/sprites/title_art.png` — the game's own art, which is
   the point: the shortcut should be the game, not a picture of a game. So the
   art gets cropped, scaled and composited by a script that can be re-run, and
   that needs the other half of this file.

   PNG output is deliberately the dullest possible: 8-bit RGBA, no interlace,
   filter 0 on every row. Filters exist to make zlib's job easier and would save
   maybe a third of the bytes on artwork this size; artwork this size is written
   once, by hand, into a repo. Not worth a bug.
--------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/**
 * @param {number} w
 * @param {number} h
 * @param {Uint8ClampedArray} d RGBA, one byte each — the shape `readPNG` returns.
 * @returns {Buffer}
 */
export function writePNG(w, h, d) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(d.buffer, d.byteOffset + y * stride, stride)
      .copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * A Windows icon, as PNG-in-ICO — supported since Vista and the only sane way
 * to carry a 256px entry, since the old BMP form has no room for one (the
 * width byte is literally a byte, and 0 means 256).
 *
 * @param {{size:number, png:Buffer}[]} entries
 * @returns {Buffer}
 */
export function writeICO(entries) {
  const head = Buffer.alloc(6 + entries.length * 16);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2); // 1 = icon
  head.writeUInt16LE(entries.length, 4);
  let offset = head.length;
  entries.forEach((e, i) => {
    const p = 6 + i * 16;
    head[p] = e.size >= 256 ? 0 : e.size;
    head[p + 1] = e.size >= 256 ? 0 : e.size;
    head[p + 2] = 0;   // palette size: none
    head[p + 3] = 0;   // reserved
    head.writeUInt16LE(1, p + 4);  // colour planes
    head.writeUInt16LE(32, p + 6); // bits per pixel
    head.writeUInt32LE(e.png.length, p + 8);
    head.writeUInt32LE(offset, p + 12);
    offset += e.png.length;
  });
  return Buffer.concat([head, ...entries.map((e) => e.png)]);
}
