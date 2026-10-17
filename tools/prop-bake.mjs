#!/usr/bin/env node
/**
 * PROPS POLYFORK DOES NOT HAVE — Tripo text-to-model, small.
 *
 *   node tools/prop-bake.mjs              the plan and the estimate; spends nothing
 *   node tools/prop-bake.mjs --go         every prop missing from public/models/props/
 *   node tools/prop-bake.mjs --go wings   just one (replaces it)
 *
 * Writes `public/models/props/<id>.glb`. housing/models.js loads an id with a
 * slash in it (`props/wings`) from `/models/<id>.glb`, keeps its texture, and
 * fits it to the stand-in's size — MEASURED off the bounding box, because a
 * generator hands back whatever scale and origin it likes. Delete the file and
 * the drawn stand-in is back (non-negotiable 9).
 *
 * `face_limit` keeps a take to a few thousand triangles: the statues came back
 * at 460k and needed tools/capture/statue-shrink.mjs; a prop should not.
 * The raw response is also kept in out/props-raw/ (gitignored) — it was paid for.
 *
 * TRIPO_API_KEY from the environment only; never printed, never in a URL.
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const P = (rel) => fileURLToPath(new URL(rel, ROOT));
const API = 'https://api.tripo3d.ai/v2/openapi';
const CREDITS_EACH = 30;
const POLL_MS = 4000;
const TIMEOUT_MS = 10 * 60 * 1000;

/* What each one is FOR is in the comment; the prompt is what Tripo reads. */
export const PROPS = {
  // the sliding door in every doorway (IsleHome._door): one leaf, two used
  'shoji-door': 'a single Japanese shoji sliding door panel, dark wooden lattice frame with white rice paper squares, flat rectangular, standing upright, low poly stylized game asset, clean simple shapes',
  // a fallen kitten's wings (boons.js, the angel)
  'angel-wings': 'a pair of white feathered angel wings spread open, symmetrical, soft cartoon style, back view, no body, low poly stylized game asset',
  // a pet's mess on the pen floor (PetPlay._pile)
  'mess-pile': 'a small cute cartoon brown poop swirl pile with smooth rounded coils, stylized kid friendly game asset, low poly',
};

const go = process.argv.includes('--go');
const asked = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ids = asked.length ? asked.filter((a) => PROPS[a]) : Object.keys(PROPS).filter((id) => !existsSync(P(`public/models/props/${id}.glb`)));

console.log(`prop-bake: ${ids.length} prop(s) — ${ids.join(', ') || 'nothing missing'}`);
console.log(`  estimate: ${ids.length * CREDITS_EACH} Tripo credits (${CREDITS_EACH} each, textured text_to_model)`);
if (!go || !ids.length) { console.log(go ? '' : '\nNothing spent. Re-run with --go to generate.'); process.exit(0); }
const KEY = process.env.TRIPO_API_KEY;
if (!KEY) { console.log('\nTRIPO_API_KEY is not set in this shell.'); process.exit(1); }
const auth = { Authorization: `Bearer ${KEY}` };

async function call(path, init) {
  const r = await fetch(`${API}${path}`, { ...init, headers: { ...auth, ...(init?.headers ?? {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.code !== 0) throw new Error(`${path}: HTTP ${r.status} ${j.message ?? ''}`.trim());
  return j.data;
}

async function bake(id) {
  const task = await call('/task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'text_to_model', prompt: PROPS[id], face_limit: 4000, texture: true, pbr: false }),
  });
  console.log(`  ${id}: task ${task.task_id}`);
  const t0 = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const s = await call(`/task/${task.task_id}`);
    if (s.status === 'success') {
      const url = s.output?.model ?? s.output?.pbr_model ?? s.output?.base_model;
      if (!url) throw new Error(`${id}: finished with no model`);
      const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
      mkdirSync(P('public/models/props'), { recursive: true });
      mkdirSync(P('out/props-raw'), { recursive: true });
      writeFileSync(P(`out/props-raw/${id}.glb`), bytes);
      writeFileSync(P(`public/models/props/${id}.glb`), bytes);
      console.log(`  ${id}: wrote public/models/props/${id}.glb (${(bytes.length / 1e6).toFixed(2)} MB)`);
      return;
    }
    if (['failed', 'cancelled', 'banned', 'expired', 'unknown'].includes(s.status)) throw new Error(`${id}: ${s.status}`);
    if (Date.now() - t0 > TIMEOUT_MS) throw new Error(`${id}: still ${s.status} after 10 minutes`);
  }
}

await Promise.all(ids.map((id) => bake(id).catch((e) => { console.log(`  FAILED ${e.message}`); process.exitCode = 1; })));
