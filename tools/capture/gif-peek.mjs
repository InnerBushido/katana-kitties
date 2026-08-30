/* Decode a GIF and write chosen frames as PNGs, so an exact frame can be looked
   at rather than guessed about. This is how a take is checked before it is
   wired into Help — a clip that plays past at 16fps hides everything.

   Usage: node tools/capture/gif-peek.mjs <gif> [frame,frame,...]
          (default: a spread of six across the clip)
   Writes into tools/capture/.out, or KK_SCRATCH if it is set. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { sep } from 'node:path';

/* Derived, never typed — see the note in assetserver.mjs. Split on `path.sep`
   so this file carries no escaped backslash for a shell to eat. */
const norm = (q) => q.split(sep).join('/').replace(/\/+$/, '');
const REPO = norm(fileURLToPath(new URL('../../', import.meta.url)));
const { writePNG } = await import(pathToFileURL(`${REPO}/tools/png.mjs`).href);

const gifPath = process.argv[2];
const buf = readFileSync(gifPath);
const dec = decodeGIF(buf);
console.log(`decoded ${dec.frames.length} frames, ${dec.width}x${dec.height}`);

let want;
if (process.argv[3]) want = process.argv[3].split(',').map(Number);
else { const n = dec.frames.length; want = [0,1,2,3,4,5].map(i => Math.floor(i*(n-1)/5)); }

const outDir = norm(process.env.KK_SCRATCH || `${REPO}/tools/capture/.out`);
mkdirSync(outDir, { recursive: true });
for (const i of want) {
  if (i < 0 || i >= dec.frames.length) continue;
  const png = writePNG(dec.width, dec.height, Buffer.from(dec.frames[i]));
  writeFileSync(`${outDir}/peek-${String(i).padStart(2,'0')}.png`, png);
  console.log(`wrote peek-${String(i).padStart(2,'0')}.png`);
}

/* --- decoder (same as gif-selftest's) --- */
function decodeGIF(buf) {
  let p = 6;
  const width = buf.readUInt16LE(p); p += 2;
  const height = buf.readUInt16LE(p); p += 2;
  const packed = buf[p]; p += 1; p += 2;
  const gctSize = 2 << (packed & 7);
  const gct = [];
  for (let i = 0; i < gctSize; i++) { gct.push([buf[p], buf[p+1], buf[p+2]]); p += 3; }
  const frames = []; let delayCs = 0;
  while (p < buf.length) {
    const b = buf[p++];
    if (b === 0x3b) break;
    if (b === 0x21) {
      const label = buf[p++];
      if (label === 0xf9) { p++; p++; delayCs = buf.readUInt16LE(p); p += 2; p++; }
      while (buf[p] !== 0) p += buf[p] + 1; p++; continue;
    }
    if (b === 0x2c) {
      p += 8; const lp = buf[p++];
      if (lp & 0x80) p += 3 * (2 << (lp & 7));
      const minCode = buf[p++]; const data = [];
      while (buf[p] !== 0) { const n = buf[p++]; for (let i=0;i<n;i++) data.push(buf[p++]); } p++;
      const idx = lzwDecode(data, minCode, width*height);
      const rgba = new Uint8Array(width*height*4);
      for (let i=0;i<idx.length;i++){ const c=gct[idx[i]]??[0,0,0]; rgba[i*4]=c[0];rgba[i*4+1]=c[1];rgba[i*4+2]=c[2];rgba[i*4+3]=255; }
      frames.push(rgba);
    }
  }
  return { width, height, frames, delayCs };
}
function lzwDecode(data, minCode, expected) {
  const clear=1<<minCode, eoi=clear+1; let dict=[];
  const reset=()=>{dict=[];for(let i=0;i<clear;i++)dict.push([i]);dict.push(null);dict.push(null);};
  reset(); let codeSize=minCode+1; const out=[]; let bitBuf=0,bits=0,dp=0;
  const read=()=>{while(bits<codeSize){bitBuf|=(data[dp++]??0)<<bits;bits+=8;}const c=bitBuf&((1<<codeSize)-1);bitBuf>>=codeSize;bits-=codeSize;return c;};
  let prev=null;
  while(out.length<expected){const code=read();if(code===clear){reset();codeSize=minCode+1;prev=null;continue;}if(code===eoi)break;let e;if(code<dict.length&&dict[code])e=dict[code];else if(prev)e=prev.concat(prev[0]);else break;for(const s of e)out.push(s);if(prev){dict.push(prev.concat(e[0]));if(dict.length===(1<<codeSize)&&codeSize<12)codeSize++;}prev=e;}
  return out;
}
