import { defineConfig } from 'vite';
import { writeFileSync, readFileSync } from 'node:fs';

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

export default defineConfig({
  plugins: [tuningServer],
  server: {
    port,
    // Only insist on the port when somebody actually asked for one — an
    // assigned port that silently moves is the whole bug this file fixes.
    strictPort: port != null,
  },
});
