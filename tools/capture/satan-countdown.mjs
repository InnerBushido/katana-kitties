#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   MR. SATAN COUNTS THE LAST FIFTEEN SECONDS — the cutter.

   It makes every file the last fifteen seconds of a round is made of, out of
   the six takes in `satan-takes/`. Four cues, not one clip:

     15s left   sat_last1   a card. "FIFTEEN SECONDS! Are you KIDDING me?!"
     10s left   sat_last2   a card. "TEN SECONDS! Oh FINE! I'll count you down!"
      5s left   sat_count   NO CARD. Five seconds, five numbers, four shouts.
      0s        sat_zero    a card, and he goes off like the gag does.

   ONE TAKE, RE-TIMED — NOT ELEVEN TAKES ASSEMBLED. The first cut of this
   built the count out of eleven separate one-word renders, and it was reported
   back as exactly what it was: "the counting and the interjecting words
   between the numbers does not sound good... does not sound natural". It
   cannot. Eleven isolated renders of a single shouted word are eleven
   performances of the same flat anger, and the ask was the opposite of flat —
   "getting more and more frustrated the closer he gets to zero". An actor does
   that ACROSS a line, not inside a word.
   So `count.mp3` is ONE continuous render of the whole countdown, and this
   script only moves the pieces of it around. The escalation is his; the
   timing is ours. Nothing here re-records anything.

   WHY IT HAS TO BE RE-TIMED AT ALL. Each number has to land on the second the
   screen is showing, and Harrison does not perform to a click track: the take
   runs 9.17 seconds for five beats that have to fit in five. So the segments
   are found by measurement (`silencedetect`), the numbers are pinned to
   0/1/2/3/4 seconds, and each shout is squeezed by exactly as much as its own
   gap demands and no more. Every ratio is printed. Nothing is a table.

   THE NUMBERS ARE PUSHED HARDEST, ON PURPOSE, and that is a request rather
   than a compromise: "when saying the numbers, they should be said faster than
   normal, maybe in half the speed". A number at NUM_TEMPO is a bark, which is
   what leaves room for a phrase behind it — at 1.0 the phrase does not fit at
   all and this whole feature goes back to being five lonely numbers.

   RUN IT:
     node tools/capture/satan-countdown.mjs            # takes are in the repo
     node tools/capture/satan-countdown.mjs --src <dir>

   The takes ARE in the repo now, under `satan-takes/`, and that is a change of
   policy worth one line: the first cut consumed a dozen renders that lived
   only in a scratch folder, so the one tool that can rebuild these files could
   not be run twice. They are ElevenLabs renders in Harrison,
   `573e5163-59b3-4926-aab1-951ef2985f81` — the preset Mr. Satan is pinned to
   and the only one he is ever allowed (docs/notes/voices.md). `satan-takes/alt/`
   is everything superseded, kept because a take that has been paid for and
   heard is worth more than the disc it sits on.
--------------------------------------------------------------------------- */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/* ------------------------------ the script ------------------------------- */

/**
 * The count take, and every word in it, in order.
 *
 * THE TABLE IS AN ASSERTION, NOT A SCRIPT. The words are not used to cut
 * anything — the silences are. It is here so that a re-render that comes back
 * with eight segments or ten fails LOUDLY, naming what it found, instead of
 * quietly pinning "NO TIME LEFT!" to the second that belongs to FOUR. Even
 * indices are numbers and odd ones are what he shouts after them, which is the
 * only structural fact the fitter needs.
 */
const COUNT_WORDS = [
  'FIVE!', 'HURRY UP!',
  'FOUR!', 'NO TIME LEFT!',
  'THREE!', 'NOW OR NEVER!',
  'TWO!', "JUST PUNCH 'EM!",
  'ONE!',
];

/** The two spoken cards, and how long each has before the next cue starts. */
const CARDS = [
  { take: 'last1', out: 'sat_last1', says: 'FIFTEEN SECONDS! Are you KIDDING me?! DO something!' },
  { take: 'last2', out: 'sat_last2', says: "TEN SECONDS! Oh FINE! FINE! I'll count you down! I HATE counting!" },
];

/** Trim-only clips. No timing to keep, so nothing is done to them but silence. */
const PLAIN = [
  { take: 'zero', out: 'sat_zero' },
  { take: 't30', out: 'sat_t30' },
  { take: 'draw', out: 'sat_draw' },
];

/* ----------------------------- the numbers ------------------------------- */

/** One number a second. This is `COUNT_LAST` in tournament.js, spread out. */
const BEAT = 1.0;
/** Numbers in the count: FIVE FOUR THREE TWO ONE. `BEAT * NUMS` is the clip. */
const NUMS = 5;

/**
 * How much faster than rendered a NUMBER is said.
 *
 * ASKED FOR IN SO MANY WORDS — "when saying the numbers, they should be said
 * faster than normal, maybe in half the speed" — and load-bearing besides,
 * because THE NUMBER IS WHAT PAYS FOR THE PHRASE. Every tenth taken off a
 * number is a tenth the shout behind it does not have to be squeezed by, and
 * the two trade almost one for one. Measured across the take:
 *
 *   numbers   a number is   worst shout needs
 *   1.55x       0.38s          1.85x
 *   1.70x       0.35s          1.74x
 *   1.85x       0.32s          1.66x   <- here
 *   2.00x       0.30s          1.60x
 *
 * 1.85 is where three of the four shouts come in under the 1.5 that was asked
 * for and the fourth is close, at the cost of numbers that are barks. They are
 * MEANT to be barks. `atempo` preserves pitch, so this is him shouting fast,
 * not him chipmunked, and past 1.85 the numbers start losing their vowel for
 * a gain of four hundredths on one phrase.
 */
const NUM_TEMPO = 1.85;

/**
 * The hardest a between-numbers shout may be pushed.
 *
 * THE CEILING IS WHERE IT IS BECAUSE OF ONE PHRASE. Three of the four come in
 * at 1.00x, 1.47x and 1.50x — inside the "30-50% speedup should be acceptable"
 * that was asked for, and the first one is not touched at all. "NO TIME LEFT!"
 * is the outlier at 1.66x: three stressed words into the gap behind the number
 * that is itself the longest. 1.7 is set just above it deliberately, so the
 * cap is a real test rather than a rubber stamp — lower it and the fitter
 * DROPS that phrase, says so, and the clip still works with three.
 * It is nowhere near the doubling that was ruled out ("if we double the speed
 * of the voice, it will then sound unnatural").
 */
const SAY_MAX = 1.7;

/** Silence after a number before the shout, and before the next number. Zero
 *  is a collision on any frame the encoder rounds the wrong way. */
const GAP_AFTER_NUM = 0.05;
const GAP_BEFORE_NUM = 0.03;

/* ------------------------------ the cards -------------------------------- */

/**
 * A card has five seconds and it may not use all of them.
 *
 * `Announcer` holds a card for HOLD_TAIL (0.9s) after the voice stops, and the
 * next queued line does not start until the card is gone. So a cue that fills
 * its own five seconds pushes the NEXT cue past the start of the count, and
 * the count is the one thing in this feature that cannot start late. 4.0
 * leaves that 0.9 and a tenth of slack.
 */
const CARD_MAX = 4.0;
/** How far a card may be nudged to make it fit. Straight from the ask: "we can
 *  manually speed up the voice by like 30-50%... but not unnatural". */
const CARD_TEMPO_MAX = 1.5;

/* ---------------------------- silence, cutting --------------------------- */

/** BOTH ENDS, PEAK-DETECTED. A take arrives with up to a third of a second of
 *  room tone on the front, and a number that starts a third of a second late
 *  is a number on the wrong second. */
const TRIM = 'silenceremove=start_periods=1:start_threshold=-38dB'
  + ':start_silence=0.03:detection=peak,areverse'
  + ',silenceremove=start_periods=1:start_threshold=-38dB'
  + ':start_silence=0.03:detection=peak,areverse';

/** What counts as a gap between two shouted words. Quieter than TRIM's floor
 *  and long enough that the stop inside "JUST PUNCH 'EM" is not one. */
const SPLIT_DB = -40;
const SPLIT_MIN = 0.10;
/** A "segment" shorter than this is a breath or a plosive tail, and belongs to
 *  the word in front of it. Without this a hard T at the end of a shout counts
 *  as a tenth word and the table below fails on a take that is perfectly fine. */
const SEG_MIN = 0.12;

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
};
const SRC = arg('--src', join(ROOT, 'tools', 'capture', 'satan-takes'));
const OUT = join(ROOT, 'public', 'voice');
const TMP = join(ROOT, 'tools', 'capture', '.satan-tmp');

const run = (bin, args) => execFileSync(bin, args, { encoding: 'utf8' });
const dur = (f) => Number(run('ffprobe', [
  '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f,
]).trim());

/** Trim a take, optionally nudging its tempo, into a mono wav we can cut. */
const prep = (take, tempo = 1) => {
  const src = join(SRC, `${take}.mp3`);
  if (!existsSync(src)) throw new Error(`missing take: ${src}`);
  const out = join(TMP, `${take}${tempo === 1 ? '' : '_t'}.wav`);
  const af = tempo === 1 ? TRIM : `${TRIM},atempo=${tempo.toFixed(4)}`;
  run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-af', af, '-ar', '44100', '-ac', '1', out]);
  return { file: out, dur: dur(out) };
};

/**
 * Where the words are in a take.
 *
 * MEASURED OFF THE AUDIO, never assumed from the text. Same rule as the sprite
 * sheets: a render's pauses are the render's business, and the one take we
 * have runs 0.25 to 0.50 seconds between shouts with no pattern to it.
 *
 * @returns {{start:number,end:number,dur:number}[]}
 */
const speechRuns = (file) => {
  /* `spawnSync` rather than `execFileSync`, and that is not a style choice:
     silencedetect reports on STDERR, and execFileSync hands back stdout. */
  const log = spawnSync('ffmpeg', [
    '-nostats', '-hide_banner', '-i', file,
    '-af', `silencedetect=noise=${SPLIT_DB}dB:d=${SPLIT_MIN}`, '-f', 'null', '-',
  ], { encoding: 'utf8' }).stderr ?? '';

  const total = dur(file);
  const holes = [];
  let open = null;
  for (const line of log.split('\n')) {
    const s = /silence_start:\s*([\d.]+)/.exec(line);
    const e = /silence_end:\s*([\d.]+)/.exec(line);
    if (s) open = Number(s[1]);
    if (e && open !== null) { holes.push([open, Number(e[1])]); open = null; }
  }
  if (open !== null) holes.push([open, total]);

  const runs = [];
  let at = 0;
  for (const [s, e] of holes) {
    if (s > at) runs.push({ start: at, end: s });
    at = e;
  }
  if (at < total) runs.push({ start: at, end: total });

  /* Fold the crumbs forward. See SEG_MIN. */
  const merged = [];
  for (const r of runs) {
    const prev = merged[merged.length - 1];
    if (prev && r.end - r.start < SEG_MIN) prev.end = r.end;
    else merged.push({ ...r });
  }
  return merged.map((r) => ({ ...r, dur: r.end - r.start }));
};

/** Cut one run out to its own wav, at `tempo`. */
const cut = (file, run_, name, tempo = 1) => {
  const out = join(TMP, `${name}.wav`);
  const af = tempo === 1 ? 'anull' : `atempo=${tempo.toFixed(4)}`;
  run('ffmpeg', ['-v', 'error', '-y', '-ss', String(run_.start), '-to', String(run_.end),
    '-i', file, '-af', af, '-ar', '44100', '-ac', '1', out]);
  return { file: out, dur: dur(out) };
};

/** Lay a list of {file,t} down on one timeline and encode it. */
const render = (at, dest, length = null) => {
  at.sort((a, b) => a.t - b.t);
  const args = [];
  for (const p of at) args.push('-i', p.file);
  const chains = at.map((p, i) => `[${i}:a]adelay=${Math.round(p.t * 1000)}:all=1[a${i}]`);
  const mix = `${at.map((_, i) => `[a${i}]`).join('')}amix=inputs=${at.length}:normalize=0[out]`;
  run('ffmpeg', ['-v', 'error', '-y', ...args,
    '-filter_complex', `${chains.join(';')};${mix}`,
    '-map', '[out]', ...(length ? ['-t', String(length)] : []),
    '-c:a', 'libmp3lame', '-q:a', '4', dest]);
};

/* ============================== do it =================================== */

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });

const said = [];

// --- the two cards --------------------------------------------------------
for (const c of CARDS) {
  const raw = prep(c.take);
  const tempo = Math.max(1, raw.dur / CARD_MAX);
  if (tempo > CARD_TEMPO_MAX) {
    throw new Error(`${c.take} runs ${raw.dur.toFixed(2)}s and only ${CARD_MAX}s fits before the `
      + `next cue — it would need ${tempo.toFixed(2)}x. Shorten the line and re-render:\n  "${c.says}"`);
  }
  const fit = tempo === 1 ? raw : prep(c.take, tempo);
  run('ffmpeg', ['-v', 'error', '-y', '-i', fit.file,
    '-c:a', 'libmp3lame', '-q:a', '4', join(OUT, `${c.out}.mp3`)]);
  said.push(`${c.out}  ${fit.dur.toFixed(2)}s  ${tempo > 1 ? `${tempo.toFixed(2)}x` : 'as rendered'}`);
}

// --- trim-only ------------------------------------------------------------
for (const p of PLAIN) {
  const raw = prep(p.take);
  run('ffmpeg', ['-v', 'error', '-y', '-i', raw.file,
    '-c:a', 'libmp3lame', '-q:a', '4', join(OUT, `${p.out}.mp3`)]);
  said.push(`${p.out}  ${raw.dur.toFixed(2)}s  as rendered`);
}

// --- the count ------------------------------------------------------------
const take = prep('count');
const runs = speechRuns(take.file);
if (runs.length !== COUNT_WORDS.length) {
  const found = runs.map((r) => `${r.start.toFixed(2)}-${r.end.toFixed(2)} (${r.dur.toFixed(2)}s)`);
  throw new Error(`count.mp3 split into ${runs.length} pieces, expected ${COUNT_WORDS.length}:\n`
    + `  wanted: ${COUNT_WORDS.join(' / ')}\n  found:  ${found.join(', ')}\n`
    + 'Re-render the take, or loosen SPLIT_DB / SPLIT_MIN / SEG_MIN.');
}

const at = [];
const fitted = [];
for (let k = 0; k < NUMS; k++) {
  const num = cut(take.file, runs[k * 2], `num${k}`, NUM_TEMPO);
  at.push({ file: num.file, t: k * BEAT });

  const shout = runs[k * 2 + 1];
  if (!shout) break;                       // ONE! is the last word; nothing after it.
  /* THE WINDOW IS WHAT IS LEFT OF THE BEAT, and the tempo is whatever fills it
     exactly — never less than 1, because a shout STRETCHED to fill a gap is a
     man calming down in the middle of losing his temper. */
  const window = BEAT - num.dur - GAP_AFTER_NUM - GAP_BEFORE_NUM;
  const tempo = Math.max(1, shout.dur / window);
  const word = COUNT_WORDS[k * 2 + 1];
  if (tempo > SAY_MAX) {
    fitted.push(`  ${word.padEnd(16)} DROPPED — needs ${tempo.toFixed(2)}x, cap is ${SAY_MAX}`);
    continue;
  }
  const said_ = cut(take.file, shout, `say${k}`, tempo);
  at.push({ file: said_.file, t: k * BEAT + num.dur + GAP_AFTER_NUM });
  fitted.push(`  ${word.padEnd(16)} ${shout.dur.toFixed(2)}s -> ${said_.dur.toFixed(2)}s  ${tempo.toFixed(2)}x`);
}
render(at, join(OUT, 'sat_count.mp3'), BEAT * NUMS);
said.push(`sat_count  ${dur(join(OUT, 'sat_count.mp3')).toFixed(2)}s  numbers ${NUM_TEMPO}x`);

/* --- the six bare numbers -------------------------------------------------
   ASKED FOR SO THEY EXIST — "would be good to generate the 6 voice clips of
   the numbers (0 - 5) separately to have for later if needed" — and cut out of
   the SAME performance rather than rendered on their own, which is the whole
   lesson of this rewrite. They keep their natural length: the nudge above is
   the count's business, and a five that has to be a fifth of a second is no
   use to whatever wants one next. */
for (let k = 0; k < NUMS; k++) {
  const n = NUMS - k;                       // runs[0] is FIVE
  const piece = cut(take.file, runs[k * 2], `bare${n}`);
  run('ffmpeg', ['-v', 'error', '-y', '-i', piece.file,
    '-c:a', 'libmp3lame', '-q:a', '4', join(OUT, `sat_n${n}.mp3`)]);
}
/* ZERO comes off the front of the roar — the same word, from the take that is
   actually played when the clock runs out, rather than a seventh render of it. */
const zeroRuns = speechRuns(prep('zero').file);
const zeroPiece = cut(prep('zero').file, zeroRuns[0], 'bare0');
run('ffmpeg', ['-v', 'error', '-y', '-i', zeroPiece.file,
  '-c:a', 'libmp3lame', '-q:a', '4', join(OUT, 'sat_n0.mp3')]);

rmSync(TMP, { recursive: true, force: true });

console.log('[satan] cut from', SRC);
for (const s of said) console.log(`  ${s}`);
console.log('[satan] between the numbers:');
for (const f of fitted) console.log(f);
