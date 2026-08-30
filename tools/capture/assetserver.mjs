/* The capture/asset rig for the Help-imagery task. Localhost only, CORS open,
   dies with the session. One server does three jobs:

     GET  /file?p=<abs-or-repo-relative>   serve a file to the browser (CORS-ok,
          crossOrigin=anonymous), so a canvas that draws it stays untainted and
          toBlob() works — this is how the resampled stills reach the browser to
          be JPEG-encoded, and how the procedural controller art could too.
     POST /put?path=<repo-relative>        write the request body to a file under
          the repo (the browser POSTs an encoded JPEG/PNG here).
     POST /gif/begin?name&w&h  /gif/frame?name  /gif/end?name&delay&colors&dither
          the frame sink: begin opens a clip, each frame is raw RGBA, end encodes
          with tools/gif.mjs into public/help/<name>.gif.

   Run: node tools/capture/assetserver.mjs   (port 7799)
   Frames and working files land in tools/capture/.out unless KK_SCRATCH says
   otherwise. LOCALHOST ONLY and CORS-open on purpose — it writes files into the
   repo on an unauthenticated POST, so it must never be reachable from anywhere
   but the machine filming. Start it for a shoot, stop it after. */
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';

/* DERIVED, NOT TYPED. Both of these were absolute paths to one machine and one
   session directory for as long as this file lived in a scratchpad, which was
   fine while it died with the session and is useless now that it does not.
   REPO is two levels up from `tools/capture/`. SCRATCH is where dumped frames
   and working files go; it defaults to `tools/capture/.out` (git-ignored) and
   can be pointed anywhere with KK_SCRATCH — an agent working in a session
   scratchpad should set it there so the repo stays clean. */
/* Split on `path.sep` rather than matching a backslash, so this file contains
   no escaped backslashes at all — every shell and patch script that has touched
   this rig has mangled one at least once. */
const norm = (p) => p.split(sep).join('/').replace(/\/+$/, '');
const REPO = norm(fileURLToPath(new URL('../../', import.meta.url)));
const SCRATCH = norm(process.env.KK_SCRATCH || `${REPO}/tools/capture/.out`);
mkdirSync(SCRATCH, { recursive: true });
const { encodeGIF } = await import(pathToFileURL(`${REPO}/tools/gif.mjs`).href);

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif' };
const jobs = new Map(); // name -> { w, h, frames: [Uint8Array] }
let last = { frames: [], w: 0, h: 0 }; // most recent finished clip, for a quick re-encode

const readBody = (req) => new Promise((res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => res(Buffer.concat(chunks)));
});

/* Resolve a caller-supplied path but refuse anything outside repo or scratch. */
const safe = (p) => {
  const abs = /^[A-Za-z]:/.test(p) ? resolve(p) : resolve(REPO, p);
  const n = abs.replace(/\\/g, '/');
  if (!n.startsWith(REPO) && !n.startsWith(SCRATCH)) throw new Error('path escapes sandbox: ' + n);
  return abs;
};

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/file') {
      const f = safe(url.searchParams.get('p'));
      const body = readFileSync(f);
      res.writeHead(200, { 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream' });
      res.end(body);
      return;
    }
    if (url.pathname === '/put') {
      const f = safe(url.searchParams.get('path'));
      const body = await readBody(req);
      writeFileSync(f, body);
      res.writeHead(200); res.end(JSON.stringify({ bytes: body.length, out: f }));
      console.log(`put ${url.searchParams.get('path')} -> ${(body.length / 1024).toFixed(0)}KB`);
      return;
    }
    if (url.pathname === '/gif/begin') {
      const name = url.searchParams.get('name');
      jobs.set(name, { w: +url.searchParams.get('w'), h: +url.searchParams.get('h'), frames: [] });
      res.writeHead(200); res.end('ok');
      console.log(`gif begin ${name}`);
      return;
    }
    if (url.pathname === '/gif/frame') {
      const job = jobs.get(url.searchParams.get('name'));
      job.frames.push(new Uint8Array(await readBody(req)));
      res.writeHead(200); res.end(String(job.frames.length));
      return;
    }
    if (url.pathname === '/gif/end') {
      const name = url.searchParams.get('name');
      const delayMs = +(url.searchParams.get('delay') || 55);
      const maxColors = +(url.searchParams.get('colors') || 256);
      const dither = url.searchParams.get('dither') === '1';
      const job = jobs.get(name);
      /* Per-frame delays arrive as the POST body ({delays:[ms,...]}) so a held
         beat is one frame that sits for a second rather than seven copies. */
      let delaysMs = null;
      const raw = await readBody(req);
      if (raw.length) { try { delaysMs = JSON.parse(raw.toString()).delays; } catch (e) {} }
      const buf = encodeGIF(job.frames, { width: job.w, height: job.h, delayMs, delaysMs, loop: 0, maxColors, dither });
      writeFileSync(`${REPO}/public/help/${name}.gif`, buf);
      last = job; last.name = name; last.delayMs = delayMs;
      jobs.delete(name);
      res.writeHead(200); res.end(JSON.stringify({ bytes: buf.length, frames: job.frames.length }));
      const secs = delaysMs ? (delaysMs.reduce((a, b) => a + b, 0) / 1000).toFixed(1)
        : (job.frames.length * delayMs / 1000).toFixed(1);
      console.log(`gif end ${name}: ${job.frames.length}f ${maxColors}c dither=${dither} ${secs}s -> ${(buf.length / 1024).toFixed(0)}KB`);
      return;
    }
    res.writeHead(404); res.end('no');
  } catch (e) {
    console.error('ERR', url.pathname, e.message);
    res.writeHead(500); res.end(String(e.message));
  }
});
server.listen(7799, () => console.log('assetserver on http://localhost:7799'));
