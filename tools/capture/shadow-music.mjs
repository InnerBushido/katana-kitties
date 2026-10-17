#!/usr/bin/env node
/**
 * SHADOW LIONHEART'S GENERATED MUSIC — from the raw takes to what the game
 * plays.
 *
 *   node tools/capture/shadow-music.mjs            measure, loop, write it all
 *   node tools/capture/shadow-music.mjs --dry      measure and print; write nothing
 *
 * Richard: "Orchestral 1 the Medium boss fight music for Shadow Lionheart,
 * Electronic 1 is the Hard boss fight music, and Electronic 2 is the Extra
 * Hard" — and "it would be ideal if the songs could loop ... without a long
 * awkward pause between the loops", and "an optional 'longer' version of the
 * Electronic 2 song" for Kata Trace. The takes are ElevenLabs Music v2.5
 * (docs/notes/audio.md has the prompts); the raw files are kept in
 * `music-takes/raw/` so this can always be re-run.
 *
 * WHAT IT DOES, per take:
 *   1. MEASURES THE BEAT GRID (music-beats.mjs). The prompt said 136 BPM; the
 *      grid is what the chart is timed off, so it is measured, never assumed.
 *   2. FINDS THE LOOP. The takes did not follow the chord loop they were asked
 *      for (the bass roots per beat wander — measured, see audio.md), so a
 *      loop cannot be cut "every four bars of Dm Bb Gm A". It is found by
 *      SELF-SIMILARITY instead: per beat, a chroma vector and four band
 *      energies; a loop (A, B) is scored by how alike the eight beats around
 *      B are to the eight around A, so jumping from B back to A lands in the
 *      same place in the music. A and B are whole bars apart, so the beat
 *      grid — and a chart — survive the jump; A is past the intro, B before
 *      the ending.
 *   3. WRITES public/music/<id>.mp3 — the take as it came, not re-encoded.
 *      The boss fight loops it at run time (Audio, `loopStart`/`loopEnd`,
 *      with a crossfade baked across the seam); Kata Trace plays it once.
 *   4. RENDERS THE LONG ONE: intro to B, the loop body again and again, then
 *      A to the end — joined with a short equal-power crossfade at every seam,
 *      on the grid, so the chart's beats stay where they are. Re-measured
 *      afterwards, because an mp3 encoder adds its own delay.
 *   5. WRITES src/core/musicfiles.js — the measured numbers the game reads.
 *      Generated: do not edit it by hand, re-run this.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { measure } from './music-beats.mjs';
import { SR, decodeStereo, beatFeatures, findLoop, bandOnsets, seamLag, seamCut, rmsOf, renderLong, encoderDelay, encode } from './music-loop.mjs';

const ROOT = new URL('../../', import.meta.url);
const P = (rel) => fileURLToPath(new URL(rel, ROOT));
const RAW = 'tools/capture/music-takes/raw/';
const RANGE = [0.40, 0.48];
/** The procedural pieces' level (audio.md: "0.050 RMS against 0.049 and 0.050"). */
const TARGET_RMS = 0.050;

/** id → take, and what it is. The `level` is the fight it plays in and the win that unlocks it in Kata Trace. */
const TAKES = [
  { id: 'shadowOrch', raw: 'shadow_orch1.mp3', name: 'Shadow Lionheart: Requiem', level: 'medium', gen: 'QmFpkWfxZoSc30YCrEDg' },
  /* DARKSYNTH'S LOOP IS CHOSEN BY ITS SECTIONS TOO. Richard, Oct 2026: "The
     loop on the Hard Shadow Lionheart music is not very good, too repetitive
     in the battle, also the splice transition of the music is not very good.
     We want more diversity and the main theme of the song repeating during
     the battle." The search had picked 52-100: 21s from the middle of the
     drop, so the theme — the G / C / D phrases of the first 46 beats — played
     once and never again. Read off per-beat band energy: the theme runs in
     8-beat phrases from 7 (G at 15, C at 23, D at 31, G at 39); beat 46 is
     the one beat with the sub dropped out, the break before the drop; the
     drop is 47-110, sixteen bars at full mids; 111 is the closing hit, and
     the fade starts at 112 (49.8s). So the loop runs to the end of the drop
     and jumps back to the theme's second G phrase at 15 — drop into verse,
     the turn the song makes at 46 run the other way. 96 beats, 42s, the
     theme and the drop on every pass.
     ITS SEAM IS TIMED BY THE GRID'S DRIFT (`lagBy: 'drift'`), not by
     `seamLag`. That compares the four beats before A with the four before B,
     which here are the theme against the drop — two arrangements — and it
     peaked at +97ms (corr 0.278, against the edge of its ±110 search), with
     neighbouring pairs anywhere from -4 to +97. Per-beat onset peaks scatter
     -101..+110: a pad-and-arp texture has no hit to lock to. The beat fit's
     own 8s windows say where the music sits against the grid at each end. */
  { id: 'shadowSynth', raw: 'shadow_elec1.mp3', name: 'Shadow Lionheart: Darksynth', level: 'hard', gen: '3kFbSIA305fvUrXLT5l1', loopBeats: [15, 111], lagBy: 'drift' },
  /* NIGHTMARE'S LOOP IS CHOSEN BY ITS SECTIONS, not by the search. Richard,
     of the first long cut: "isn't looping very well and sound awkward,
     especially since it only says HONOR once ... we should loop at the
     originals 49 seconds before it fades out". The search had picked 20-92,
     which jumps out mid-section and leaves the choir (beats 64-96) and the
     outro to play once, at the very end. Read off per-beat band energy: the
     drums enter at 16; every section is announced by ONE beat with the sub
     dropped out (31 before section 2, 63 before the choir); 112 is the
     closing hit and the fade starts at 113 (49.6s). So the loop runs to the
     end of the outro's last full bar (111) and jumps into the song's own
     break beat at 31 — a transition the music already makes once. 80 beats. */
  { id: 'shadowNight', raw: 'shadow_elec2.mp3', name: 'Shadow Lionheart: Nightmare', level: 'extra', gen: 'SYnjWzQKDgQggaArOr3o', long: 'shadowNightLong', loopBeats: [31, 111] },
];
/** The long one's length: two to three minutes ("potentially be 2 - 3 minutes long"). */
const LONG_SECS = [120, 180];

const dry = process.argv.includes('--dry');

/** Where the music sits against the grid at `t` seconds (s), off `measure`'s
 *  per-8s drift windows, interpolated between their centres. */
const driftAt = (m, t) => {
  const d = m.drift;
  const x = Math.max(0, Math.min(d.length - 1, (t - 4) / 8));
  const i = Math.min(d.length - 2, Math.floor(x));
  return (d[i] + (d[i + 1] - d[i]) * (x - i)) / 1000;
};
const meta = {};
mkdirSync(P('public/music'), { recursive: true });
for (const T of TAKES) {
  const src = P(RAW + T.raw);
  const m = measure(src, RANGE);
  const st = decodeStereo(src);
  const mono = st.L.map((v, i) => 0.5 * (v + st.R[i]));
  // The chart's length: whole bars of music, ending where the music does.
  const beatsEnd = Math.floor((m.soundEnd - m.firstBeat) / m.spb);
  const beats = Math.floor(beatsEnd / 4) * 4;
  const f = beatFeatures(mono, m.firstBeat, m.spb, beatsEnd);
  const { best: found, top5 } = findLoop(f, beatsEnd);
  const best = T.loopBeats ? { A: T.loopBeats[0], B: T.loopBeats[1], score: NaN } : found;
  const tA = m.firstBeat + best.A * m.spb;
  const tB = m.firstBeat + best.B * m.spb;
  // Align the seam to the music, then cut in the gap before the beat (see seamLag, seamCut).
  const sl = seamLag(bandOnsets(mono), tA, tB, m.spb);
  const lag = T.lagBy === 'drift' ? +(driftAt(m, tA) - driftAt(m, tB)).toFixed(3) : sl.lag;
  const corr = sl.corr;
  if (T.lagBy === 'drift') console.log(`  seam lag by the grid's drift: ${(lag * 1000).toFixed(0)}ms (the onset match said ${(sl.lag * 1000).toFixed(0)}ms at corr ${sl.corr.toFixed(3)})`);
  const off = seamCut(mono, tA + lag, tB);
  const cutA = tA + lag + off, cutB = tB + off;
  const rms = rmsOf(mono, tA, tB);
  console.log(`${T.id} (${T.raw}): ${m.bpm} BPM, first beat ${m.firstBeat}s, ${beats} beats, drift span ${m.driftSpan}ms [${m.drift.join(' ')}]`);
  console.log(`  loop beats ${best.A}-${best.B}${T.loopBeats ? ' (chosen by its sections)' : ''} (${(tB - tA).toFixed(2)}s), score ${best.score.toFixed(3)}; search top: ${top5.map((c) => `${c.A}-${c.B}:${c.score.toFixed(3)}`).join(' ')}`);
  console.log(`  seam lag ${(lag * 1000).toFixed(0)}ms (corr ${corr.toFixed(3)}), cut ${(off * 1000).toFixed(0)}ms before the beat: ${cutA.toFixed(4)}s -> ${cutB.toFixed(4)}s`);
  console.log(`  body RMS ${rms.toFixed(4)} -> mix ${(TARGET_RMS / rms).toFixed(2)}`);
  meta[T.id] = {
    file: `music/${T.id}.mp3`, name: T.name, level: T.level, gen: T.gen,
    spb: m.spb, first: m.firstBeat, beats, loop: [+cutA.toFixed(4), +cutB.toFixed(4)], loopBeats: [best.A, best.B],
    lag: +lag.toFixed(3), mix: +(TARGET_RMS / rms).toFixed(3), drift: m.driftSpan,
  };
  if (!dry) copyFileSync(src, P(`public/${meta[T.id].file}`));
  if (T.long) {
    // As many passes as keep it inside two-to-three minutes, the longest that fits.
    const gridLen = (best.B - best.A) * m.spb;
    const lenOf = (n) => cutB + n * gridLen + (st.n / SR - cutA);
    let passes = 1;
    while (lenOf(passes + 1) <= LONG_SECS[1]) passes++;
    if (lenOf(passes) < LONG_SECS[0]) console.log(`  !! ${T.long} is only ${lenOf(passes).toFixed(1)}s`);
    const out = P(`public/music/${T.long}.mp3`);
    if (!dry) {
      encode(renderLong(st, cutA, cutB, gridLen, passes), out);
      const m2 = measure(out, RANGE);
      /* Intro to B, `passes` bodies, then A to the end — and that tail is ONE
         MORE time round the loop. The first long cut counted `passes` bodies
         and not `passes + 1`: its chart was 147.5s over 182s of music and
         stopped 35 seconds before the song did. */
      const beats2 = beats + (passes + 1) * (best.B - best.A);
      /* BEAT 0 IS THE ORIGINAL'S, MOVED BY THE ENCODER'S DELAY ONLY. The long
         cut's first 48 seconds ARE the original, sample for sample, and every
         pass is placed on the original's grid (renderLong), so the grid is
         the original's. Re-measuring the beat phase was the first way, and it
         was wrong twice: modulo a beat it read one beat late (0.0002s came
         back 0.4355s), and once the seams were aligned it moved 33ms, because
         the fit then saw mostly repeated sections with their own drift. The
         delay is measured instead by lining the two waveforms up. */
      const delay = encoderDelay(mono, out);
      const first2 = +(m.firstBeat + delay).toFixed(4);
      console.log(`  ${T.long}: ${passes} extra passes, ${beats2} beats (${(beats2 * m.spb).toFixed(1)}s), re-measured ${m2.bpm} BPM, encoder delay ${(delay * 1000).toFixed(1)}ms, drift ${m2.driftSpan}ms, ${(statSync(out).size / 1e6).toFixed(2)} MB`);
      meta[T.long] = {
        file: `music/${T.long}.mp3`, name: `${T.name} (long)`, level: T.level, gen: T.gen, longOf: T.id,
        spb: m.spb, first: first2, beats: beats2, loop: null, loopBeats: null, passes,
        mix: meta[T.id].mix, drift: m2.driftSpan,
      };
    }
  }
}
if (!dry) {
  writeFileSync(P('src/core/musicfiles.js'), `/* GENERATED by tools/capture/shadow-music.mjs — do not edit; re-run it.
   Shadow Lionheart's generated music, MEASURED: the beat (spb, seconds), the
   first beat in the file (first), the chart's length in beats, the loop the
   boss fight plays (seconds into the file, and in beats), and the gain that
   brings it to the procedural pieces' level. See docs/notes/audio.md. */
export const MUSIC_FILES = ${JSON.stringify(meta, null, 2)};
`);
  console.log('wrote src/core/musicfiles.js');
}
