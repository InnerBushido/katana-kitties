#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   LIONHEART'S LINES — the cutter.

   Makes `public/voice/lionheart/*.mp3` out of the takes in
   `lionheart-takes/raw/`, one for one, by closing his pauses. Nothing else:
   no speed change, no word moved, no take assembled from pieces.

   WHY HE NEEDS IT. He is Barrett (docs/notes/voices.md), picked out of an
   audition of eleven voices because he was "the smoothest and cool/confident
   anime sounding voice out of all of them" — and part of what reads as cool is
   that he takes his time. Measured on the raw renders, the island directions
   ran 22.2s, and 8.5s of that was silence: a held beat after every island's
   name. That is a lovely delivery for a trailer and a long time for a
   nine-year-old to stand next to a speech bubble.

   CLOSING PAUSES, NOT SPEEDING HIM UP, and that order is a rule this project
   already learned on Mr. Satan (satan-countdown.mjs): an atempo nobody reads
   hides an over-long line, and a sped-up smooth voice stops being smooth. A
   pause is only ever SHORTENED, to MAX_GAP; a breath inside a phrase is under
   FIND_GAP and is never seen, so it is never cut.

   THE CARD AND THE RECORDING ARE ONE STRING (voices.md). Each take is a
   render of exactly the text his bubble shows — `LION_LINES` in
   systems/dreamdojo.js and the Shadow's lines in systems/dream/shadow.js —
   with the newlines read as spaces. Change a line there and the take here is
   stale: re-render it in Barrett, `d603a8cd-3fe1-55e0-9245-617a2589131e`,
   drop it in `raw/` under the same id, and run this.

   RUN IT:
     node tools/capture/lionheart-vo.mjs
--------------------------------------------------------------------------- */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW = join(ROOT, 'tools', 'capture', 'lionheart-takes', 'raw');
const OUT = join(ROOT, 'public', 'voice', 'lionheart');

/* Quieter than this is a pause. Barrett's takes sit around -20dB while he
   talks and below -50 between phrases, so -35 is well clear of both. */
const NOISE_DB = -35;
/* A pause has to be at least this long to be found at all. Under it is a
   breath or a consonant's closure, and cutting those is what makes a line
   sound chopped up. */
const FIND_GAP = 0.35;
/* ...and is closed down to this. Long enough to still be a beat. */
const MAX_GAP = 0.45;
/* Kept either side of the speech, so the first and last syllables are not
   clipped by the detector's own threshold. */
const EDGE = 0.08;

const run = (bin, args) => execFileSync(bin, args, { encoding: 'utf8' });
const dur = (file) => Number(run('ffprobe', ['-v', 'error', '-show_entries',
  'format=duration', '-of', 'csv=p=0', file]).trim());

/** The stretches where he is talking, off silencedetect. */
function speechRuns(file) {
  const total = dur(file);
  /* spawnSync, because silencedetect reports on STDERR. */
  const log = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af',
    `silencedetect=noise=${NOISE_DB}dB:d=${FIND_GAP}`, '-f', 'null', '-'],
  { encoding: 'utf8' }).stderr;
  const quiet = [];
  for (const m of log.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g)) {
    quiet.push([Number(m[1]), Number(m[2])]);
  }
  // A trailing silence that runs to the end of the file has a start and no end.
  const tail = log.match(/silence_start: ([\d.]+)(?![\s\S]*silence_end)/);
  if (tail) quiet.push([Number(tail[1]), total]);
  const runs = [];
  let t = 0;
  for (const [a, b] of quiet) {
    if (a > t + 1e-3) runs.push({ start: t, end: a });
    t = b;
  }
  if (total > t + 1e-3) runs.push({ start: t, end: total });
  return { runs, total };
}

mkdirSync(OUT, { recursive: true });
const takes = readdirSync(RAW).filter((f) => f.endsWith('.mp3')).sort();
if (!takes.length) throw new Error(`no takes in ${RAW}`);

for (const f of takes) {
  const src = join(RAW, f);
  const { runs, total } = speechRuns(src);
  if (!runs.length) throw new Error(`${f}: no speech found above ${NOISE_DB}dB`);
  /* Each run carries the pause after it, capped — so the room tone between
     phrases is his own rather than digital silence spliced in. */
  const segs = runs.map((r, i) => {
    const next = runs[i + 1];
    const start = i === 0 ? Math.max(0, r.start - EDGE) : r.start;
    const end = next ? r.end + Math.min(next.start - r.end, MAX_GAP) : Math.min(total, r.end + EDGE);
    return { start, end };
  });
  const chains = segs.map((s, i) =>
    `[0:a]atrim=start=${s.start.toFixed(3)}:end=${s.end.toFixed(3)},asetpts=PTS-STARTPTS[s${i}]`);
  const join_ = `${segs.map((_, i) => `[s${i}]`).join('')}concat=n=${segs.length}:v=0:a=1[out]`;
  const dest = join(OUT, f);
  run('ffmpeg', ['-v', 'error', '-y', '-i', src,
    '-filter_complex', `${chains.join(';')};${join_}`, '-map', '[out]',
    '-ar', '44100', '-ac', '1', '-c:a', 'libmp3lame', '-q:a', '4', dest]);
  const after = dur(dest);
  console.log(`${basename(f, '.mp3').padEnd(20)} ${total.toFixed(2).padStart(6)}s -> ${after.toFixed(2).padStart(6)}s`
    + `  (${runs.length} phrases, ${(total - after).toFixed(2)}s of pause closed)`);
}
