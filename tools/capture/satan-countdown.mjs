#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   MR. SATAN COUNTS THE LAST FIFTEEN SECONDS — the splicer.

   `public/voice/sat_last.mp3` is not a recording of a line. It is a fifteen
   second TIMELINE cut out of a dozen separate shouts, and the only reason it
   exists as one file is that a number has to land on the second it names.

   WHY ONE FILE AND NOT ELEVEN `say()` CALLS. `Announcer.say` QUEUES and never
   interrupts — deliberately, see announce.js — so eleven clips fired a second
   apart would stack the moment any one of them ran a frame long, and by "TWO"
   he would be counting a clock that had already run out. One file cannot drift
   against itself. It is started once, at exactly fifteen seconds left, and
   every number inside it is nailed to its own second at splice time.

   WHAT WOULD NOT FIT, AND THE MEASUREMENT THAT SETTLED IT. The ask was an
   interjection between every number — "5, HURRY UP, 4, NO TIME LEFT, 3, NOW OR
   NEVER, 2, JUST PUNCH EM, 1". Harrison runs 2.4-2.6 words a second
   (docs/notes/voices.md), so "NO TIME LEFT!" renders at 1.33 seconds and the
   word "ONE!" alone at 1.04: a one-second beat cannot hold a number AND a
   phrase. Two seconds a beat would hold both, and then the number he shouts
   disagrees with the number on the screen, which is the one thing this whole
   feature exists to stop.
   So the complaining is FRONT-LOADED into the ten seconds before the count,
   where there is all the room in the world, and only single shouts go between
   the numbers — into the slots that measure wide enough to take one, which is
   why the fitting below is a search and not a table. He starts in sentences
   and ends barely able to manage the numbers, which is the right shape for
   somebody losing his temper anyway.

   RUN IT:
     node tools/capture/satan-countdown.mjs --src <dir of raw takes>

   The raw takes are ElevenLabs renders of `LINES` below, in Harrison,
   `573e5163-59b3-4926-aab1-951ef2985f81` — the preset Mr. Satan is pinned to,
   and the only one he is ever allowed (docs/notes/voices.md). They are NOT in
   the repo: the six numbers ship on their own and everything else is consumed
   here. To re-cut, regenerate from this table and point `--src` at the folder.
--------------------------------------------------------------------------- */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Every take, and the words in it. The table IS the script. */
const LINES = {
  head15: 'FIFTEEN SECONDS LEFT! Are you KIDDING me?!',
  punch: "JUST PUNCH 'EM!",
  fine: "FINE! FINE! I'll count you down! I HATE counting!",
  n5: 'FIVE!',
  n4: 'FOUR!',
  n3: 'THREE!',
  n2: 'TWO!',
  n1: 'ONE!',
  n0: 'ZERO!',
  hurry: 'HURRY!',
  move: 'MOVE!',
  go: 'GO!',
  now: 'NOW!',
  hit: 'HIT!',
  roar: 'ZEEEROOOOO! AAAAARGHHH!',
};

/** The six bare numbers, shipped as their own clips. Asked for so a countdown
 *  of any other length can be built later without paying for them again. */
const NUMBERS = ['n0', 'n1', 'n2', 'n3', 'n4', 'n5'];

/** Seconds of clip before "FIVE!". Everything before it is him complaining.
 *  `LEAD + 5` is the whole clip, and it must equal `COUNT_AT` in
 *  tournament.js — world-check pins the two together. */
const LEAD = 10;
/** Him, in order, before the count. Packed with one even gap that lands the
 *  last of them just before FIVE, so a longer take eats the pauses and never
 *  the count. */
const RANT = ['head15', 'punch', 'fine'];
/** Smallest pause the packer will leave between two of them. Under this he is
 *  one continuous word rather than a man running out of patience. */
const RANT_GAP_MIN = 0.18;

/* THE NUMBERS ARE NUDGED, THE SHIPPED CLIPS ARE NOT. "ONE!" is 1.04 seconds
   and would step on the roar; 1.15x is under the threshold where a shouted
   word starts to sound processed (atempo preserves pitch) and buys back a
   tenth of a second in every slot. `public/voice/sat_n1.mp3` keeps the take
   exactly as rendered — the nudge is the splice's business only. */
const NUM_TEMPO = 1.15;
/** How hard a between-numbers shout may be pushed. Past this a single word
 *  reads as clipped rather than urgent — and it is worth the last tenth: at
 *  1.35 "MOVE!" came out four MILLISECONDS too long for the gap after THREE
 *  and the slot went empty, which is one shout out of five instead of two. */
const BARK_TEMPO = 1.45;
/** Silence left between a shout and the number after it. Zero would be a
 *  collision on any frame the encoder rounds the wrong way. */
const BARK_CLEAR = 0.045;
/** Everything he might bark between two numbers. Which ones actually land is
 *  decided by measurement — see the fitter. */
const BARKS = ['move', 'go', 'hit', 'now', 'hurry'];

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
};
const SRC = arg('--src', join(ROOT, 'tools', 'capture', 'satan-takes'));
const OUT = join(ROOT, 'public', 'voice');

const run = (bin, args) => execFileSync(bin, args, { encoding: 'utf8' });
const dur = (f) => Number(run('ffprobe', [
  '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f,
]).trim());

/* BOTH ENDS, PEAK-DETECTED. A take arrives with up to a third of a second of
   room tone on the front, and a number that starts a third of a second late is
   a number on the wrong second. */
const TRIM = 'silenceremove=start_periods=1:start_threshold=-38dB'
  + ':start_silence=0.03:detection=peak,areverse'
  + ',silenceremove=start_periods=1:start_threshold=-38dB'
  + ':start_silence=0.03:detection=peak,areverse';

const TMP = join(ROOT, 'tools', 'capture', '.satan-tmp');
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });

const prep = (id, tempo) => {
  const src = join(SRC, `${id}.mp3`);
  if (!existsSync(src)) throw new Error(`missing take: ${src} — "${LINES[id]}"`);
  const out = join(TMP, `${id}${tempo === 1 ? '' : '_t'}.wav`);
  const af = tempo === 1 ? TRIM : `${TRIM},atempo=${tempo}`;
  run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-af', af, '-ar', '44100', '-ac', '1', out]);
  return { id, file: out, dur: dur(out) };
};

// --- lay the timeline out -------------------------------------------------
const at = [];
const say = (p, t) => at.push({ file: p.file, t, id: p.id, dur: p.dur });

const rant = RANT.map((id) => prep(id, 1));
const rantSum = rant.reduce((n, p) => n + p.dur, 0);
const gap = (LEAD - 0.25 - rantSum) / Math.max(1, rant.length - 1);
if (gap < RANT_GAP_MIN) {
  throw new Error(`the rant runs ${rantSum.toFixed(2)}s and only ${(LEAD - 0.25).toFixed(2)}s fits `
    + `before the count — the gap would be ${gap.toFixed(3)}s. Shorten a line in RANT.`);
}
let cur = 0;
for (const p of rant) { say(p, cur); cur += p.dur + gap; }

/* Each number on its own second, and the slot it leaves behind it. */
const nums = ['n5', 'n4', 'n3', 'n2', 'n1'].map((id) => prep(id, NUM_TEMPO));
const slots = nums.map((p, i) => {
  say(p, LEAD + i);
  return { i, at: LEAD + i + p.dur, room: 1 - p.dur - BARK_CLEAR };
});
say(prep('roar', 1), LEAD + 5);

/* TIGHTEST SLOT FIRST, SMALLEST WORD THAT FITS IT. The obvious order — widest
   slot first, longest word that fits — is what this did first and it placed
   ONE bark out of five: the widest gap took the only short word in the box and
   the next gap down then had nothing small enough left. Filling the narrow
   gaps first, each with the least it can be filled with, is what maximises how
   many of them get filled at all, and how many get filled is the whole point.
   Everything here is measured; nothing is a table, so a re-cut with different
   words re-fits itself. */
const barks = BARKS.map((id) => prep(id, BARK_TEMPO)).sort((a, b) => a.dur - b.dur);
const placed = [];
for (const slot of [...slots].sort((a, b) => a.room - b.room)) {
  const k = barks.findIndex((b) => b.dur <= slot.room);
  if (k < 0) continue;
  const [b] = barks.splice(k, 1);
  say(b, slot.at);
  placed.push(`${b.id} after ${nums[slot.i].id}`);
}

// --- render ---------------------------------------------------------------
at.sort((a, b) => a.t - b.t);
const args = [];
for (const p of at) args.push('-i', p.file);
const chains = at.map((p, i) => `[${i}:a]adelay=${Math.round(p.t * 1000)}:all=1[a${i}]`);
const mix = `${at.map((_, i) => `[a${i}]`).join('')}amix=inputs=${at.length}:normalize=0[out]`;
const dest = join(OUT, 'sat_last.mp3');
run('ffmpeg', [
  '-v', 'error', '-y', ...args,
  '-filter_complex', `${chains.join(';')};${mix}`,
  '-map', '[out]', '-c:a', 'libmp3lame', '-q:a', '4', dest,
]);

/* The six bare numbers: trimmed, never nudged. */
for (const id of NUMBERS) {
  const p = prep(id, 1);
  run('ffmpeg', ['-v', 'error', '-y', '-i', p.file,
    '-c:a', 'libmp3lame', '-q:a', '4', join(OUT, `sat_${id}.mp3`)]);
}
rmSync(TMP, { recursive: true, force: true });

const last = at[at.length - 1];
console.log(`[satan] sat_last.mp3  ${dur(dest).toFixed(2)}s from ${at.length} takes`);
console.log(`[satan] rant gap ${gap.toFixed(2)}s · between the numbers: ${placed.join(', ') || 'nothing fitted'}`);
for (const p of at) console.log(`  ${p.t.toFixed(2).padStart(6)}  ${p.id.padEnd(7)} ${p.dur.toFixed(2)}s`);
if (dur(dest) < last.t + last.dur - 0.3) console.log('[satan] WARNING: shorter than its own timeline');
