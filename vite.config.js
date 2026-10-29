import { defineConfig } from 'vite';
import { writeFileSync, readFileSync, readdirSync, openSync, readSync, closeSync, statSync, existsSync, mkdirSync, createReadStream } from 'node:fs';
import { resolve as resolvePath, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

/* ---------------------------------------------------------------------------
   Vite config — one job: let the dev server be told which port to use.

   VITE DOES NOT READ `PORT` ON ITS OWN. It defaults to 5173 and, without
   `strictPort`, quietly increments past anything already listening. That is
   fine on one machine with one developer and wrong the moment something
   outside the project is choosing the port — a harness that assigns one and
   then watches it, for instance, ends up watching a port Vite never bound.
   The failure is confusing rather than loud: the server starts, reports
   success, and nothing is there.

   So the port comes from the environment when it is set, and falls back to
   Vite's own default when it is not. Deliberately NOT `strictPort`: if the
   caller has not expressed an opinion, a busy 5173 should still start rather
   than refuse.
--------------------------------------------------------------------------- */

const port = Number(process.env.PORT) || undefined;

/* ---------------------------------------------------------------------------
   The balance page's save button — `tuning.html`, `src/core/tuning.js`.

   ONE POST, AND IT ONLY EXISTS IN DEV. `apply` is not set to 'build', it is
   `configureServer` — a hook the production build never calls — so there is no
   route to this on Vercel and nothing to switch off before shipping. That is
   the property that matters: a page that writes a file into the source tree is
   a fine thing on Richard's laptop and an appalling one on the open internet.

   IT REWRITES THE FILE RATHER THAN PATCHING IT, and the page always sends the
   complete override set, so removing a field on the page removes it here. The
   body is parsed and re-serialised rather than written through: a malformed
   POST must fail here, loudly, with the old file intact, rather than land a
   broken JSON import that takes the dev server down on the next reload.

   VALUES ONLY, NUMBERS ONLY, TWO LEVELS DEEP. `src/core/tuning.js` already
   ignores anything that is not a finite number, so this is the belt to that
   pair of braces — but it is the half that keeps the FILE clean, and a
   tuning.json somebody has to read in a diff is worth more than one that
   merely happens not to crash.
--------------------------------------------------------------------------- */
const FILE = new URL('./src/tuning.json', import.meta.url);

function clean(o, depth = 0) {
  const out = {};
  if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
  for (const [k, v] of Object.entries(o)) {
    /* Keys are written into a source file, so they are held to what a
       JavaScript identifier can be. Nothing else can name a real constant. */
    if (!/^[A-Za-z_$][\w$]*$/.test(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (depth < 2 && v && typeof v === 'object') {
      const sub = clean(v, depth + 1);
      if (Object.keys(sub).length) out[k] = sub;
    }
  }
  return out;
}

const tuningServer = {
  name: 'katana-tuning',
  configureServer(server) {
    server.middlewares.use('/__tuning', (req, res) => {
      if (req.method === 'GET') {
        res.setHeader('content-type', 'application/json');
        res.end(readFileSync(FILE, 'utf8'));
        return;
      }
      if (req.method !== 'POST') { res.statusCode = 405; res.end('POST or GET'); return; }
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(body); } catch {
          res.statusCode = 400;
          res.end('not JSON — nothing written');
          return;
        }
        const kept = clean(parsed);
        /* Two-space, sorted, trailing newline: this file is committed and read
           in diffs, and key order that follows whatever the page happened to
           iterate would make every save look like a whole-file change. */
        const sorted = {};
        for (const k of Object.keys(kept).sort()) {
          sorted[k] = Object.fromEntries(Object.entries(kept[k]).sort(([a], [b]) => a.localeCompare(b)));
        }
        writeFileSync(FILE, `${JSON.stringify(sorted, null, 2)}
`);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, saved: sorted }));
      });
    });
  },
};

/* ---------------------------------------------------------------------------
   The sprite editor's save button — `sprites.html`, `src/core/spritefix.js`.

   THE SAME SHAPE AS THE TUNING SAVE, and for the same reasons: dev only
   (`configureServer`), the whole file rewritten from what the page sends,
   parsed and cleaned here so a bad POST leaves the old file standing. Its
   own cleaner because its file has lists in it: a sheet's `order` and `flip`
   are whole numbers, a pose's `s`, `x` and `y` finite ones, and the keys are
   `sheet/file` (a pose), a path under public/sprites (a sheet, `kittens/ember/
   grid_v2`), or a path and a clip (`ninja/ember:sneak`) — anything else is
   dropped rather than written. `off` is a sheet's list of switched-off cells,
   by name or by index.

   AND ONE LISTING: GET /__spritefix/list is every png under public/sprites
   with its size, so the editor's Sheets tab offers a sheet the day it is
   added, with nobody remembering to tell it.
--------------------------------------------------------------------------- */
const SPRITE_FILE = new URL('./src/spritefix.json', import.meta.url);
// `sheet/file`, a clip `ninja/ember:mount`, one facing of a clip `ninja/ember:mount@2`, one row of a sheet `kittens/frost/vr@2` (spritefix.js clipKey)
const KEY = /^[a-z0-9_]+(\/[A-Za-z0-9_]+)+(:[a-z0-9_]+)?(@[0-9])?$/;
const ints = (a) => (Array.isArray(a) ? a.filter((v) => Number.isInteger(v) && v >= 0 && v < 256) : []);

export function cleanSpriteFix(o) {
  const poses = {};
  const sheets = {};
  const off = {};
  for (const k of Object.keys(o?.poses ?? {}).filter((q) => KEY.test(q)).sort()) {
    const f = o.poses[k];
    const out = {};
    for (const n of ['s', 'x', 'y']) if (typeof f?.[n] === 'number' && Number.isFinite(f[n])) out[n] = Math.round(f[n] * 10000) / 10000;
    if (Object.keys(out).length) poses[k] = out;
  }
  for (const k of Object.keys(o?.sheets ?? {}).filter((q) => KEY.test(q)).sort()) {
    const order = ints(o.sheets[k]?.order);
    if (order.length) sheets[k] = { order, flip: ints(o.sheets[k]?.flip) };
  }
  for (const k of Object.keys(o?.off ?? {}).filter((q) => KEY.test(q)).sort()) {
    const list = Array.isArray(o.off[k]) ? o.off[k] : [];
    const ids = [...new Set(list.filter((v) => (typeof v === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(v)) || (Number.isInteger(v) && v >= 0 && v < 4096)))];
    if (ids.length) off[k] = ids;
  }
  return { poses, sheets, off };
}

/* Every png under public/sprites, `{ id, w, h }`, its size read off the IHDR (bytes 16-23), which is
   all a picker needs and spares decoding forty sheets to fill a <select>. */
const SPRITES_DIR = new URL('./public/sprites/', import.meta.url);
export function listSprites(dir = SPRITES_DIR, pre = '') {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...listSprites(new URL(`${e.name}/`, dir), `${pre}${e.name}/`));
    else if (/\.png$/i.test(e.name)) {
      const b = Buffer.alloc(24);
      const fd = openSync(new URL(e.name, dir), 'r');
      try { readSync(fd, b, 0, 24, 0); } finally { closeSync(fd); }
      out.push({ id: pre + e.name.replace(/\.png$/i, ''), w: b.readUInt32BE(16), h: b.readUInt32BE(20) });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

const spriteServer = {
  name: 'katana-spritefix',
  configureServer(server) {
    server.middlewares.use('/__spritefix', (req, res) => {
      // connect strips the mount path: /__spritefix/list arrives as /list
      if (req.method === 'GET' && req.url?.startsWith('/list')) {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(listSprites()));
        return;
      }
      if (req.method === 'GET') {
        res.setHeader('content-type', 'application/json');
        res.end(readFileSync(SPRITE_FILE, 'utf8'));
        return;
      }
      if (req.method !== 'POST') { res.statusCode = 405; res.end('POST or GET'); return; }
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(body); } catch {
          res.statusCode = 400;
          res.end('not JSON — nothing written');
          return;
        }
        const kept = cleanSpriteFix(parsed);
        // one pose per line, so a diff of a nudge is one line
        const one = (v) => JSON.stringify(v).replace(/([:,])/g, '$1 ').replace(/^\{/, '{ ').replace(/\}$/, ' }');
        const block = (o) => Object.entries(o).map(([k, v]) => `    ${JSON.stringify(k)}: ${one(v)}`).join(',\n');
        const nl = (s) => (s ? `\n${s}\n  ` : '');
        writeFileSync(SPRITE_FILE, `{\n  "poses": {${nl(block(kept.poses))}},\n  "sheets": {${nl(block(kept.sheets))}},\n  "off": {${nl(block(kept.off))}}\n}\n`);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, saved: kept }));
      });
    });
  },
};

/* ---------------------------------------------------------------------------
   The cutscene review page — `review.html`, `src/review/`.

   DEV ONLY, LIKE THE OTHER TWO: `configureServer`, never built. Five routes:

   GET  /__review/videos       every video under `Design Ideas/` and
                               `out/review/`, newest first. Those are where
                               Richard puts recordings, and neither ships:
                               `Design Ideas/` is excluded from git and `out/`
                               is the local-only repo. A video in `public/`
                               would be copied into every build (N9).
   GET  /__review/video?p=     one of them, WITH RANGE REQUESTS. Without them
                               a <video> cannot seek: Firefox plays from the
                               start and the scrubber does nothing. Only a
                               path that resolves inside one of those two
                               folders is served.
   GET  /__review/reviews?scene=        every saved review of a scene, for
                               bringing notes onto a new recording of it
   GET  /__review/notes?scene=&video=   the saved review, or 404
   POST /__review/notes        writes docs/reviews/<scene>/<video>.json,
                               which is where a session reads it from. The
                               body is parsed and re-serialised, never written
                               through, so a bad POST leaves the old file.
--------------------------------------------------------------------------- */
const REVIEW_ROOTS = ['Design Ideas', 'out/review'].map((d) => resolvePath(fileURLToPath(new URL('.', import.meta.url)), d));
const VIDEO_EXT = /\.(mp4|m4v|webm|mov|mkv)$/i;
const REVIEWS = fileURLToPath(new URL('./docs/reviews/', import.meta.url));
const slug = (s) => String(s ?? '').replace(/\.[a-z0-9]+$/i, '').replace(/[^A-Za-z0-9_.-]+/g, '_').slice(0, 120);

export function listVideos() {
  const out = [];
  const walk = (dir, root) => {
    let ents = [];
    try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = resolvePath(dir, e.name);
      if (e.isDirectory()) walk(p, root);
      else if (VIDEO_EXT.test(e.name)) {
        const st = statSync(p);
        // relative to the REPO, which is what videoFile resolves against. It was
        // relative to the root's parent: right for 'Design Ideas', and for
        // 'out/review' it listed 'review/x.mp4', which 404'd, and the sync then
        // reported the 404 page as "Unable to decode audio data"
        out.push({ p: relative(fileURLToPath(new URL('.', import.meta.url)), p).replace(/\\/g, '/'), name: e.name, size: st.size, mtime: st.mtimeMs });
      }
    }
  };
  for (const r of REVIEW_ROOTS) walk(r, r);
  return out.sort((a, b) => b.mtime - a.mtime);
}

export function videoFile(p) {
  const base = fileURLToPath(new URL('.', import.meta.url));
  const abs = resolvePath(base, String(p ?? ''));
  return REVIEW_ROOTS.some((r) => abs.startsWith(r + sep)) && VIDEO_EXT.test(abs) && existsSync(abs) ? abs : null;
}

/** A video, WITH RANGE REQUESTS: without them a <video> cannot seek. */
function serveVideo(req, res, f) {
  const size = statSync(f).size;
  const type = /\.webm$/i.test(f) ? 'video/webm' : /\.mov$/i.test(f) ? 'video/quicktime' : 'video/mp4';
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
  res.setHeader('accept-ranges', 'bytes');
  res.setHeader('content-type', type);
  if (!m) { res.setHeader('content-length', size); createReadStream(f).pipe(res); return; }
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  res.statusCode = 206;
  res.setHeader('content-range', `bytes ${start}-${end}/${size}`);
  res.setHeader('content-length', end - start + 1);
  createReadStream(f, { start, end }).pipe(res);
}

const reviewServer = {
  name: 'katana-review',
  configureServer(server) {
    server.middlewares.use('/__review', (req, res) => {
      const url = new URL(req.url ?? '/', 'http://x');
      const json = (v, code = 200) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(v)); };
      if (req.method === 'GET' && url.pathname === '/videos') return json(listVideos());
      if (req.method === 'GET' && url.pathname === '/video') {
        const f = videoFile(url.searchParams.get('p'));
        if (!f) return json({ error: 'not a video under Design Ideas/ or out/review/' }, 404);
        return serveVideo(req, res, f);
      }
      // every saved review of one scene: what a new recording can bring notes across from
      if (req.method === 'GET' && url.pathname === '/reviews') {
        const dir = resolvePath(REVIEWS, slug(url.searchParams.get('scene')));
        let files = [];
        try { files = readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { /* none yet */ }
        return json(files.map((f) => {
          try {
            const r = JSON.parse(readFileSync(resolvePath(dir, f), 'utf8'));
            return { video: r.video?.name, saved: r.saved, notes: r.notes?.length ?? 0, done: (r.notes ?? []).filter((n) => n.done).length };
          } catch { return null; }
        }).filter(Boolean));
      }
      if (url.pathname === '/notes') {
        if (req.method === 'GET') {
          const f = resolvePath(REVIEWS, slug(url.searchParams.get('scene')), `${slug(url.searchParams.get('video'))}.json`);
          return existsSync(f) ? json(JSON.parse(readFileSync(f, 'utf8'))) : json({ error: 'none yet' }, 404);
        }
        if (req.method !== 'POST') return json({ error: 'GET or POST' }, 405);
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          let r;
          try { r = JSON.parse(body); } catch { return json({ error: 'not JSON — nothing written' }, 400); }
          if (!r?.scene || !r?.video?.name || !Array.isArray(r.notes)) return json({ error: 'needs scene, video.name and notes — nothing written' }, 400);
          const dir = resolvePath(REVIEWS, slug(r.scene));
          mkdirSync(dir, { recursive: true });
          const f = resolvePath(dir, `${slug(r.video.name)}.json`);
          // one note per line, so a diff of one edit is one line
          const { notes, anchors = [], ...head } = r;
          const rows = (xs) => xs.map((n) => `    ${JSON.stringify(n)}`).join(',\n');
          const lines = rows(notes);
          const top = `${JSON.stringify(head, null, 2).replace(/\n}$/, '')},\n  "anchors": [\n${rows(anchors)}\n  ]`;
          writeFileSync(f, `${top},\n  "notes": [${lines ? `\n${lines}\n  ` : ''}]\n}\n`);
          json({ ok: true, path: relative(fileURLToPath(new URL('.', import.meta.url)), f).replace(/\\/g, '/') });
        });
        return;
      }
      json({ error: 'unknown route' }, 404);
    });
  },
};

/* ---------------------------------------------------------------------------
   Payne's animation clips — the sprite editor's PAYNE tab, src/payneclips.json.

   Richard, Oct 2026: "section off and create my own sprite animations clips
   in the Sprite Editor that I can save and can reference, by name or
   what-not, so that it can be used in the cutscene editor." DEV ONLY, like
   the rest of this file's servers:

   GET  /__payne/take?p=     a take (docs/art-masters/video/payne_*.mp4),
                             with range requests, for scrubbing. Nothing else
                             in docs/ is served by this.
   POST /__payne/clips       rewrites src/payneclips.json. CHECKED WHOLE AND
                             REFUSED WHOLE: one bad clip and nothing is
                             written, with the reason — a save that quietly
                             dropped a clip would break a scene that names it.
   POST /__payne/cut?only=   runs tools/capture/payne-sheet.mjs --only=...,
                             one at a time, and answers with its log.
--------------------------------------------------------------------------- */
const PAYNE_FILE = new URL('./src/payneclips.json', import.meta.url);
const TAKES_DIR = fileURLToPath(new URL('./docs/art-masters/video/', import.meta.url));
const takeNames = () => readdirSync(TAKES_DIR).map((f) => /^payne_([a-z]+)_[0-9a-f]+\.mp4$/.exec(f)?.[1]).filter(Boolean);

export function cleanPayneClips(o, takes = takeNames()) {
  const out = {};
  const bad = [];
  for (const [name, c] of Object.entries(o ?? {})) {
    if (!/^[a-z][A-Za-z0-9]{0,31}$/.test(name)) { bad.push(`"${name}" is not a name (a letter, then letters or digits)`); continue; }
    const why = !takes.includes(c?.take) ? `no take "${c?.take}"`
      : ![c.from, c.to, c.step].every(Number.isInteger) ? 'from, to and step must be whole frame numbers'
      : c.from < 0 || c.to < c.from || c.to > 999 ? `frames ${c.from}-${c.to} run backwards or off the take`
      : c.step < 1 || c.step > 12 ? `step ${c.step} is not 1 to 12`
      : c.apex != null && !(Number.isFinite(c.apex) && c.apex >= 0 && c.apex <= 5) ? 'apex must be 0 to 5 seconds'
      : null;
    if (why) { bad.push(`${name}: ${why}`); continue; }
    out[name] = {
      take: c.take, from: c.from, to: c.to, step: c.step,
      ...(c.back ? { back: true, apex: c.apex ?? 0 } : {}),
      note: String(c.note ?? '').slice(0, 400),
    };
  }
  return { clips: out, bad };
}

let payneCutting = null;
const payneServer = {
  name: 'katana-payne',
  configureServer(server) {
    server.middlewares.use('/__payne', (req, res) => {
      const url = new URL(req.url ?? '/', 'http://x');
      const json = (v, code = 200) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(v)); };
      if (req.method === 'GET' && url.pathname === '/take') {
        const name = String(url.searchParams.get('p') ?? '').split('/').pop();
        const f = /^payne_[a-z]+_[0-9a-f]+\.mp4$/.test(name) ? resolvePath(TAKES_DIR, name) : null;
        if (!f || !existsSync(f)) return json({ error: 'not one of Payne\'s takes' }, 404);
        return serveVideo(req, res, f);
      }
      if (req.method === 'POST' && url.pathname === '/clips') {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(body); } catch { return json({ error: 'not JSON — nothing written' }, 400); }
          const { clips, bad } = cleanPayneClips(parsed);
          if (bad.length) return json({ error: `nothing written: ${bad.join('; ')}` }, 400);
          // one clip per line, so a diff of one clip is one line
          // key by key, not a regex over the JSON, which would also space out a `":` inside a note
          const one = (v) => `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${JSON.stringify(x)}`).join(', ')} }`;
          writeFileSync(PAYNE_FILE, `{\n${Object.entries(clips).map(([k, v]) => `  ${JSON.stringify(k)}: ${one(v)}`).join(',\n')}\n}\n`);
          json({ ok: true, clips });
        });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/cut') {
        if (payneCutting) return json({ error: `already cutting ${payneCutting} — wait for it to finish` }, 409);
        const have = JSON.parse(readFileSync(PAYNE_FILE, 'utf8'));
        const only = String(url.searchParams.get('only') ?? '').split(',').filter(Boolean);
        const missing = only.filter((n) => !have[n]);
        if (!only.length || missing.length) return json({ error: missing.length ? `not saved yet: ${missing.join(', ')} — save the clips first` : 'which clips?' }, 400);
        payneCutting = only.join(', ');
        const log = [];
        const p = spawn(process.execPath, ['tools/capture/payne-sheet.mjs', `--only=${only.join(',')}`], { cwd: fileURLToPath(new URL('.', import.meta.url)) });
        p.stdout.on('data', (d) => log.push(String(d)));
        p.stderr.on('data', (d) => log.push(String(d)));
        p.on('close', (code) => { payneCutting = null; json({ ok: code === 0, code, log: log.join('') }, code === 0 ? 200 : 500); });
        p.on('error', (e) => { payneCutting = null; json({ error: e.message }, 500); });
        return;
      }
      json({ error: 'unknown route' }, 404);
    });
  },
};

export default defineConfig({
  plugins: [tuningServer, spriteServer, reviewServer, payneServer],
  /* THE REPO LIVES IN ONEDRIVE, and OneDrive turns node_modules into cloud
     files: every one a reparse point (tag 0x9000e01a), pinned or not. Vite 8
     resolves with Rolldown's resolver, which follows symlinks by default and
     cannot canonicalise those — so `import 'three'` failed in the dev server
     AND the build with "Does the file exist?" while Node, world-check and the
     files themselves were fine. Measured with Rolldown's own ResolverFactory:
     `symlinks: true` → "Cannot find module 'three'", `false` → resolved.
     Nothing in this project is a symlinked package, so not following them
     costs nothing. Clearing node_modules/.vite and pinning the folder
     "always keep on this device" were both tried first; neither helps. */
  resolve: { preserveSymlinks: true },
  server: {
    port,
    // Only insist on the port when somebody actually asked for one — an
    // assigned port that silently moves is the whole bug this file fixes.
    strictPort: port != null,
  },
});
