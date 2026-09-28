#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   MR. SATAN CALLS THE FIGHTERS BY NAME — the cutter for the roll call.

   Asked for: "Announcer says 'Round 1, ember versus frost' Let's only use this
   if it actually is ember versus frost, otherwise, lets say something else ...
   unless there is a way to do it procedurally and make it sound good by just
   having a voice of every fighters name, and then interjecting it where
   appropriate." So the round card is BUILT, out of pieces, by `rollCall` in
   src/systems/tournament.js, and `Announcer` plays the pieces back to back.
   `sat_r1` / `sat_r2` — one whole performance each — are kept for the one
   match they are true of, Ember against Frost.

   ONE RENDER PER PIECE, AND WHY THAT IS NOT THE COUNTDOWN'S MISTAKE. The
   countdown was eleven isolated one-word renders and sounded flat, because it
   had to ESCALATE across a line. A ring announcer calling a card does not: he
   barks each name as its own event, "EMBER! ... VERSUS! ... FROST!", which is
   the one genre of speech where a clip-per-word is the natural delivery. The
   partner joins are rendered WITH their "and" ("and FROST!") so the join has a
   real lead-in rather than a lone "and" stapled on.

   ALL THIS DOES IS TRIM. Each take has 0.1-0.25s of air either side of the
   word, and the pieces are spaced at runtime (`ROLL_GAP` in announce.js), so
   the air is taken off here and the pacing is decided in one place. Nothing is
   re-timed and nothing is re-recorded.

   RUN IT:  node tools/capture/satan-rollcall.mjs

   The takes are ElevenLabs renders in Harrison,
   `573e5163-59b3-4926-aab1-951ef2985f81` — Mr. Satan's preset and the only one
   he is allowed (docs/notes/voices.md) — and are kept in
   `satan-takes/rollcall/`, because a take that has been paid for is worth the
   disc (the countdown's lesson).
--------------------------------------------------------------------------- */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'tools', 'capture', 'satan-takes', 'rollcall');
const OUT = join(ROOT, 'public', 'voice', 'satan');

/** take -> shipped clip, and the words it was rendered from. */
export const TAKES = [
  ['round1', 'sat_rc_r1', 'ROUND ONE!'],
  ['round2', 'sat_rc_r2', 'ROUND TWO!'],
  ['ember', 'sat_rc_ember', 'EMBER!'],
  ['frost', 'sat_rc_frost', 'FROST!'],
  ['blossom', 'sat_rc_blossom', 'BLOSSOM!'],
  ['storm', 'sat_rc_storm', 'STORM!'],
  ['and-ember', 'sat_rc_and_ember', 'and EMBER!'],
  ['and-frost', 'sat_rc_and_frost', 'and FROST!'],
  ['and-blossom', 'sat_rc_and_blossom', 'and BLOSSOM!'],
  ['and-storm', 'sat_rc_and_storm', 'and STORM!'],
  ['versus', 'sat_rc_vs', 'VERSUS!'],
  ['also-versus', 'sat_rc_alsovs', 'and ALSO versus!'],
  ['marks', 'sat_rc_marks', 'Fighters — take your marks!'],
];

/* -45dB is under his quietest consonant in these takes and 20dB over the
   renders' noise floor (-64 to -71dB, measured with astats). 20ms of lead and
   40ms of tail are kept so no plosive is clipped; the rest of the air is
   `ROLL_GAP`'s job.

   BY MEASURED SILENCE, NOT `silenceremove`. The first cut used an
   areverse/silenceremove pair and it trimmed nothing off half the takes:
   ElevenLabs leaves a click or a breath 0.1-0.2s after the word, AFTER a
   quarter-second of silence, so the reversed filter met sound at once and
   stopped. So the tail is cut at the start of the last real silence (>= 0.12s)
   when all that follows it is under 0.25s of junk — which also leaves the dash
   inside "Fighters — take your marks!" alone, since a whole clause follows it. */
const SIL_DB = -45;
const SIL_MIN = 0.12;
const JUNK_MAX = 0.25;
const LEAD = 0.02;
const TAIL = 0.04;

const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
  '-of', 'csv=p=0', f]).toString().trim());

/** Every silence in a take, as [start, end] — silencedetect talks on stderr. */
export function silences(f) {
  const log = spawnSync('ffmpeg', ['-hide_banner', '-i', f, '-af', `silencedetect=n=${SIL_DB}dB:d=0.03`,
    '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const out = [];
  let s = null;
  for (const m of log.matchAll(/silence_(start|end): ([\d.]+)/g)) {
    if (m[1] === 'start') s = Number(m[2]);
    else if (s !== null) { out.push([s, Number(m[2])]); s = null; }
  }
  if (s !== null) out.push([s, Infinity]);
  return out;
}

/**
 * Where the word is in a take of `total` seconds, given its silences. Pure, so
 * `world-check` can walk it without ffmpeg.
 */
export function wordSpan(sil, total) {
  let a = 0;
  let b = total;
  const lead = sil.find(([s]) => s <= 0.001);
  if (lead) a = Math.max(0, lead[1] - LEAD);
  for (let i = sil.length - 1; i >= 0; i--) {
    const [s, e] = sil[i];
    if (s <= a + 0.05) break;
    if (Math.min(e, total) - s >= SIL_MIN && total - Math.min(e, total) <= JUNK_MAX) { b = Math.min(total, s + TAIL); break; }
  }
  return [a, b];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const [take, out, says] of TAKES) {
    const src = join(SRC, `${take}.mp3`);
    if (!existsSync(src)) throw new Error(`missing take ${src} ("${says}")`);
    const dst = join(OUT, `${out}.mp3`);
    const [a, z] = wordSpan(silences(src), dur(src));
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-af', `atrim=${a}:${z},asetpts=PTS-STARTPTS`,
      '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-q:a', '4', dst]);
    console.log(`${out.padEnd(20)} ${dur(src).toFixed(2)}s -> ${dur(dst).toFixed(2)}s`
      + `  [${a.toFixed(2)}, ${z.toFixed(2)}]  "${says}"`);
  }
}
