import { defineConfig } from 'vite';
import { writeFileSync, readFileSync, readdirSync, openSync, readSync, closeSync } from 'node:fs';

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
const KEY = /^[a-z0-9_]+(\/[A-Za-z0-9_]+)+(:[a-z0-9_]+)?$/;
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

export default defineConfig({
  plugins: [tuningServer, spriteServer],
  server: {
    port,
    // Only insist on the port when somebody actually asked for one — an
    // assigned port that silently moves is the whole bug this file fixes.
    strictPort: port != null,
  },
});
