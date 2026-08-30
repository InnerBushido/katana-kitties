/* ------------------------- a minimal GIF decoder ------------------------- */
/* Only enough to read what encodeGIF writes: GIF89a, one global table, full
   frames, LZW. Not a general decoder. */
export function decodeGIF(buf) {
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
  let delayCs = 0;
  while (p < buf.length) {
    const b = buf[p++];
    if (b === 0x3b) break;            // trailer
    if (b === 0x21) {                  // extension
      const label = buf[p++];
      if (label === 0xf9) { p++; /* size */ p++; delayCs = buf.readUInt16LE(p); p += 2; p++; /* transp */ }
      // skip sub-blocks
      while (buf[p] !== 0) p += buf[p] + 1;
      p++;
      continue;
    }
    if (b === 0x2c) {                  // image descriptor
      p += 8;                          // left, top, w, h (full frame)
      const lp = buf[p++];
      if (lp & 0x80) p += 3 * (2 << (lp & 7)); // local table (we never write one)
      const minCode = buf[p++];
      const data = [];
      while (buf[p] !== 0) { const n = buf[p++]; for (let i = 0; i < n; i++) data.push(buf[p++]); }
      p++;
      const idx = lzwDecode(data, minCode, width * height);
      const rgba = new Uint8Array(width * height * 4);
      for (let i = 0; i < idx.length; i++) {
        const c = gct[idx[i]] ?? [0, 0, 0];
        rgba[i * 4] = c[0]; rgba[i * 4 + 1] = c[1]; rgba[i * 4 + 2] = c[2]; rgba[i * 4 + 3] = 255;
      }
      frames.push(rgba);
      /* The delay in force WHEN THIS FRAME WAS WRITTEN, kept per frame — a
         single trailing value cannot tell a clip that pauses to be read from
         one that never stops. See the delaysMs checks above. */
      delays.push(delayCs);
    }
  }
  return { width, height, frames, delayCs, delays };
}

export function lzwDecode(data, minCode, expected) {
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
