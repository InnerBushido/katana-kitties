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

const ROOT = new URL('../../', import.meta.url);
const P = (rel) => fileURLToPath(new URL(rel, ROOT));
const RAW = 'tools/capture/music-takes/raw/';
const SR = 44100;
const RANGE = [0.40, 0.48];
/** The procedural pieces' level (audio.md: "0.050 RMS against 0.049 and 0.050"). */
const TARGET_RMS = 0.050;
const XF = 0.025; // the seam crossfade, seconds

/** id → take, and what it is. The `level` is the fight it plays in and the win that unlocks it in Kata Trace. */
const TAKES = [
  { id: 'shadowOrch', raw: 'shadow_orch1.mp3', name: 'Shadow Lionheart: Requiem', level: 'medium', gen: 'QmFpkWfxZoSc30YCrEDg' },
  { id: 'shadowSynth', raw: 'shadow_elec1.mp3', name: 'Shadow Lionheart: Darksynth', level: 'hard', gen: '3kFbSIA305fvUrXLT5l1' },
  { id: 'shadowNight', raw: 'shadow_elec2.mp3', name: 'Shadow Lionheart: Nightmare', level: 'extra', gen: 'SYnjWzQKDgQggaArOr3o', long: 'shadowNightLong' },
];
/** The long one's length: about two and a half minutes. */
const LONG_SECS = 150;

function decodeStereo(file) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '2', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  const f = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const n = f.length / 2;
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
  return { L, R, n };
}

function goertzel(x, i0, n, hz) {
  const w = 2 * Math.PI * hz / SR, c = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < n; i++) { const s = x[i0 + i] + c * s1 - s2; s2 = s1; s1 = s; }
  return Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2);
}

/** Per beat: 12 chroma bins over three octaves, and four band energies — both normalised. */
function beatFeatures(mono, first, spb, beats) {
  const out = [];
  const a = (hz) => Math.exp(-2 * Math.PI * hz / SR);
  for (let k = 0; k < beats; k++) {
    const i0 = Math.floor((first + k * spb) * SR);
    const n = Math.floor(spb * SR);
    if (i0 + n > mono.length) break;
    const chroma = new Array(12).fill(0);
    // Every other sample is plenty for pitches under 1kHz, and halves the cost.
    for (let pc = 0; pc < 12; pc++) {
      for (const oct of [65.41, 130.81, 261.63]) chroma[pc] += Math.sqrt(goertzel(mono, i0, n, oct * Math.pow(2, pc / 12)));
    }
    // Band energies: one-pole splits at 150 / 800 / 3000 Hz.
    const cuts = [150, 800, 3000].map(a);
    const lp = [0, 0, 0];
    const e = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      const v = mono[i0 + i];
      for (let j = 0; j < 3; j++) lp[j] = (1 - cuts[j]) * v + cuts[j] * lp[j];
      e[0] += lp[0] * lp[0];
      e[1] += (lp[1] - lp[0]) ** 2;
      e[2] += (lp[2] - lp[1]) ** 2;
      e[3] += (v - lp[2]) ** 2;
    }
    const norm = (v) => { const m = Math.hypot(...v) || 1; return v.map((x) => x / m); };
    out.push({ chroma: norm(chroma), bands: norm(e.map((x) => Math.log(1 + x * 100))), loud: Math.sqrt(e.reduce((s, x) => s + x, 0) / n) });
  }
  return out;
}

const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const sim = (f, i, j) => 0.6 * dot(f[i].chroma, f[j].chroma) + 0.4 * dot(f[i].bands, f[j].bands)
  - Math.min(0.3, Math.abs(Math.log((f[i].loud + 1e-4) / (f[j].loud + 1e-4))) * 0.15);

/** The best loop: A after the intro, B before the ending, whole bars apart, alike around both. */
function findLoop(f, beatsEnd) {
  const cands = [];
  for (let A = 16; A < beatsEnd; A += 4) {
    for (let B = A + 48; B <= beatsEnd - 8; B += 4) {
      let s = 0, c = 0;
      for (let k = -4; k < 4; k++) if (f[A + k] && f[B + k]) { s += sim(f, A + k, B + k); c++; }
      const score = s / c;
      cands.push({ A, B, score, len: B - A });
    }
  }
  // Similarity first; among the near-best, the longest — a short loop is heard as one.
  cands.sort((x, y) => y.score - x.score);
  const top = cands[0].score;
  const near = cands.filter((c) => c.score >= top - 0.01).sort((x, y) => y.len - x.len);
  return { best: near[0], top5: cands.slice(0, 5) };
}

function rmsOf(mono, t0, t1) {
  let s = 0;
  const i0 = Math.floor(t0 * SR), i1 = Math.floor(t1 * SR);
  for (let i = i0; i < i1; i++) s += mono[i] * mono[i];
  return Math.sqrt(s / Math.max(1, i1 - i0));
}

/** Concatenate [0,B) + (A,B)×n + [A,end) with equal-power crossfades at each seam, all on the grid. */
function renderLong(st, tA, tB, passes) {
  const iA = Math.round(tA * SR), iB = Math.round(tB * SR);
  const F = Math.round(XF * SR);
  const body = iB - iA;
  const total = iB + passes * body + (st.n - iA);
  const L = new Float32Array(total), R = new Float32Array(total);
  // Copy src[s0..s1) to out at o; the first F samples crossfade over what is already there.
  const put = (o, s0, s1, fadeIn) => {
    for (let i = 0; i < s1 - s0; i++) {
      const g = fadeIn && i < F ? Math.sin((i / F) * Math.PI / 2) : 1;
      const h = fadeIn && i < F ? Math.cos((i / F) * Math.PI / 2) : 0;
      L[o + i] = L[o + i] * h + st.L[s0 + i] * g;
      R[o + i] = R[o + i] * h + st.R[s0 + i] * g;
    }
  };
  // Each segment runs F samples PAST its seam, so the next one fades in over real music, not silence.
  put(0, 0, Math.min(st.n, iB + F), false);
  let o = iB;
  for (let p = 0; p < passes; p++) { put(o, iA, Math.min(st.n, iB + F), true); o += body; }
  put(o, iA, st.n, true);
  return { L, R, n: total };
}

function encode(st, out) {
  const inter = new Float32Array(st.n * 2);
  for (let i = 0; i < st.n; i++) { inter[2 * i] = st.L[i]; inter[2 * i + 1] = st.R[i]; }
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '2', '-i', '-', '-c:a', 'libmp3lame', '-b:a', '192k', out],
    { input: Buffer.from(inter.buffer), maxBuffer: 1 << 30 });
}

const dry = process.argv.includes('--dry');
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
  const { best, top5 } = findLoop(f, beatsEnd);
  const tA = m.firstBeat + best.A * m.spb;
  const tB = m.firstBeat + best.B * m.spb;
  const rms = rmsOf(mono, tA, tB);
  console.log(`${T.id} (${T.raw}): ${m.bpm} BPM, first beat ${m.firstBeat}s, ${beats} beats, drift span ${m.driftSpan}ms [${m.drift.join(' ')}]`);
  console.log(`  loop beats ${best.A}-${best.B} (${(tB - tA).toFixed(2)}s), score ${best.score.toFixed(3)}; top: ${top5.map((c) => `${c.A}-${c.B}:${c.score.toFixed(3)}`).join(' ')}`);
  console.log(`  body RMS ${rms.toFixed(4)} -> mix ${(TARGET_RMS / rms).toFixed(2)}`);
  meta[T.id] = {
    file: `music/${T.id}.mp3`, name: T.name, level: T.level, gen: T.gen,
    spb: m.spb, first: m.firstBeat, beats, loop: [+tA.toFixed(4), +tB.toFixed(4)], loopBeats: [best.A, best.B],
    mix: +(TARGET_RMS / rms).toFixed(3), drift: m.driftSpan,
  };
  if (!dry) copyFileSync(src, P(`public/${meta[T.id].file}`));
  if (T.long) {
    const passes = Math.max(1, Math.round((LONG_SECS - (st.n / SR)) / (tB - tA)));
    const out = P(`public/music/${T.long}.mp3`);
    if (!dry) {
      encode(renderLong(st, tA, tB, passes), out);
      const m2 = measure(out, RANGE);
      const beats2 = beats + passes * (best.B - best.A);
      /* The measured first beat is modulo a beat: the encoder's few ms of
         delay can tip it round to the NEXT beat (0.0002s came back 0.4355s —
         the same grid, 3.5ms early, read as one beat late). Fold it back to
         the nearest whole-beat shift; what is left is the encoder's delay. */
      const shift = ((m2.firstBeat - m.firstBeat) % m.spb + 1.5 * m.spb) % m.spb - 0.5 * m.spb;
      const first2 = +(m.firstBeat + shift).toFixed(4);
      console.log(`  ${T.long}: ${passes} extra passes, ${beats2} beats, re-measured ${m2.bpm} BPM, beat 0 moved ${(shift * 1000).toFixed(1)}ms, drift ${m2.driftSpan}ms, ${(statSync(out).size / 1e6).toFixed(2)} MB`);
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
