#!/usr/bin/env node
/**
 * HER STATUE, IN 3D — Tripo image-to-model off her own champion drawing.
 *
 *   node tools/statue-bake.mjs              say what it would do and what it costs; spend nothing
 *   node tools/statue-bake.mjs --go         do it: ember and frost
 *   node tools/statue-bake.mjs --go ember   just one
 *
 * Writes `public/models/statues/<sheet>.glb`, which housing/statue.js picks up
 * by itself (`loadGenerated`) and scales to the drawn statue's 4.2 units —
 * MEASURED off the model's bounding box, never assumed, because a generator
 * hands back whatever scale and origin it likes. Delete the file and the drawn
 * statue is back: non-negotiable 9, every file degrades.
 *
 * TWO SHEETS, FOUR KITTENS. Storm and Blossom are recolours of Ember and Frost
 * in the game, and so are their statues: `tintGenerated` lerps the model's
 * material toward her colour, so a third Tripo run would buy nothing.
 *
 * THE SOURCE IS `docs/art-masters/<sheet>_champion.png` — a full-size pose on
 * the house magenta. The magenta is keyed to transparent HERE before upload
 * (the same "magenta, not white" rule sprite-bake follows): a generator handed
 * a magenta card either models the card or tints the cat pink at the edges.
 *
 * THE KEY: `TRIPO_API_KEY`, from the environment, and nowhere else. It is never
 * printed, never written to a file, and never put in a URL — it goes in one
 * header. A missing key is a sentence, not a stack trace.
 *
 * THE PRICE IS SAID BEFORE IT IS SPENT (non-negotiable 9). Without `--go` this
 * prints the plan and the estimate and stops. Tripo bills per task in its own
 * credits; image_to_model with texture is the 30-credit tier at the time of
 * writing (Oct 2026) — the estimate below is that number, so check the account
 * page if the pricing has moved.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readPNG, writePNG } from './png.mjs';

const ROOT = new URL('../', import.meta.url);
const P = (rel) => fileURLToPath(new URL(rel, ROOT));
const API = 'https://api.tripo3d.ai/v2/openapi';
const SHEETS = ['ember', 'frost'];
const CREDITS_EACH = 30;
const POLL_MS = 4000;
const TIMEOUT_MS = 10 * 60 * 1000;

const go = process.argv.includes('--go');
const asked = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const sheets = asked.length ? SHEETS.filter((s) => asked.includes(s)) : SHEETS;

console.log(`statue-bake: ${sheets.length} statue(s) — ${sheets.join(', ')}`);
console.log(`  estimate: ${sheets.length * CREDITS_EACH} Tripo credits (${CREDITS_EACH} each, textured image_to_model)`);
for (const s of sheets) {
  const out = P(`public/models/statues/${s}.glb`);
  console.log(`  ${s}: docs/art-masters/${s}_champion.png -> public/models/statues/${s}.glb${existsSync(out) ? '  (exists — will be replaced)' : ''}`);
}
if (!go) {
  console.log('\nNothing spent. Re-run with --go to generate.');
  process.exit(0);
}
const KEY = process.env.TRIPO_API_KEY;
if (!KEY) {
  console.log('\nTRIPO_API_KEY is not set in this shell. Set it as a user environment variable and open a new terminal.');
  process.exit(1);
}
const auth = { Authorization: `Bearer ${KEY}` };

/** The champion drawing with its magenta keyed out, as PNG bytes. */
function keyed(sheet) {
  const { w, h, d } = readPNG(P(`docs/art-masters/${sheet}_champion.png`));
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    // Magenta and its anti-aliased fringe: red and blue both well above green.
    if (r > 150 && b > 150 && g < 110) d[i + 3] = 0;
    else if (r > 120 && b > 120 && g < r * 0.55 && g < b * 0.55) d[i + 3] = 96;
  }
  return writePNG(w, h, d);
}

async function call(path, init) {
  const r = await fetch(`${API}${path}`, { ...init, headers: { ...auth, ...(init?.headers ?? {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.code !== 0) throw new Error(`${path}: HTTP ${r.status} ${j.message ?? ''}`.trim());
  return j.data;
}

async function bake(sheet) {
  const form = new FormData();
  form.append('file', new Blob([keyed(sheet)], { type: 'image/png' }), `${sheet}_champion.png`);
  const up = await call('/upload', { method: 'POST', body: form });
  const task = await call('/task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'image_to_model', file: { type: 'png', file_token: up.image_token }, texture: true, pbr: false }),
  });
  console.log(`  ${sheet}: task ${task.task_id}`);
  const t0 = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const s = await call(`/task/${task.task_id}`);
    if (s.status === 'success') {
      const url = s.output?.model ?? s.output?.pbr_model ?? s.output?.base_model;
      if (!url) throw new Error(`${sheet}: finished with no model in its output`);
      const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
      mkdirSync(P('public/models/statues'), { recursive: true });
      writeFileSync(P(`public/models/statues/${sheet}.glb`), bytes);
      console.log(`  ${sheet}: wrote public/models/statues/${sheet}.glb (${(bytes.length / 1e6).toFixed(2)} MB)`);
      return;
    }
    if (['failed', 'cancelled', 'banned', 'expired', 'unknown'].includes(s.status)) throw new Error(`${sheet}: ${s.status}`);
    if (Date.now() - t0 > TIMEOUT_MS) throw new Error(`${sheet}: still ${s.status} after 10 minutes — task ${task.task_id}`);
    process.stdout.write(`  ${sheet}: ${s.status} ${s.progress ?? ''}%\r`);
  }
}

for (const s of sheets) {
  try { await bake(s); } catch (e) { console.log(`  FAILED ${e.message}`); process.exitCode = 1; }
}
