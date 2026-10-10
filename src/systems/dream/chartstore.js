import { parseChart, chartId } from './beatmap.js';

/* ---------------------------------------------------------------------------
   THE CUSTOM BEAT MAPS, kept in this browser.

   localStorage, like the Dream Dojo's stars (dream/progress.js) and for the
   same reason: a chart a kitten wrote is the machine's, not one save's — a
   restart must not wipe the routine her sister spent twenty minutes on.

   STORED AS THE CHART'S OWN TEXT, re-read through `parseChart` on the way
   out, so a row that was hand-edited or written by an older build is either
   a chart the floor can play or it is skipped — never half of one. Every
   read and write is in a try: a private window, a full disk or blocked site
   data costs the custom charts and nothing else.
--------------------------------------------------------------------------- */

const KEY = 'katana-kitties.kata-charts';
/** More than a family will write; enough that a runaway loop cannot fill the quota. */
export const MAX_CHARTS = 60;

function readRaw() {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeRaw(rows) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(rows));
    return true;
  } catch {
    return false;
  }
}

/** Every custom chart that still reads: [{ id, chart, saved }], newest first. */
export function customCharts() {
  const out = [];
  for (const r of readRaw()) {
    const { chart } = parseChart(r?.text ?? '');
    if (chart && typeof r.id === 'string') out.push({ id: r.id, chart, saved: r.saved ?? 0 });
  }
  return out.sort((a, b) => b.saved - a.saved);
}

/**
 * Keep a chart. `id` to overwrite one already kept; otherwise a new one, its
 * id from its own text so saving the same chart twice is one row.
 * Returns { id } or { error }.
 */
export function saveChart(text, id = null) {
  const { chart, errors } = parseChart(text);
  if (!chart) return { error: errors[0] ?? 'not a chart' };
  const rows = readRaw();
  const newId = id ?? chartId(chart, true).replace(/^kata\.custom\./, 'c');
  const keep = rows.filter((r) => r?.id !== newId);
  if (keep.length >= MAX_CHARTS) return { error: `${MAX_CHARTS} charts is the most — delete one first` };
  keep.push({ id: newId, text: typeof text === 'string' ? text : JSON.stringify(text), saved: Date.now() });
  return writeRaw(keep) ? { id: newId } : { error: 'this browser would not save it (private window, or storage full)' };
}

export function deleteChart(id) {
  const rows = readRaw();
  const keep = rows.filter((r) => r?.id !== id);
  if (keep.length === rows.length) return false;
  return writeRaw(keep);
}
