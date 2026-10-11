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

/**
 * THE SEAM'S LAG — how far the music at A sits from where the straight grid
 * says it is, measured against the music at B. The takes CREEP: a 0.1% tempo
 * wander is invisible to the chart (±30ms over a minute) but a loop cut
 * exactly on the grid joins two places that are 30-60ms out of step, and
 * that is a stumble in the groove at every seam — measured on all three of
 * the first loops: Requiem -43ms, Darksynth -61ms, Nightmare -29ms.
 *
 * Measured by cross-correlating an onset envelope in eight bands over the
 * four beats before each side, at 1ms, ±110ms. ONE band does not work: the
 * kick-and-bass envelope alone (tried first) pumps in sixteenths, so its
 * peaks sit a sixteenth (55ms) apart and the search picks one at random; and
 * a kick-onset detector read this track's sustained reese bass, not its
 * kicks. Eight bands see the snare-and-kick pattern, which is different at
 * every sixteenth. Requiem's peak is sharp (0.69 against a 0.31 floor);
 * Nightmare's is shallow, but the same -33ms came out of the 31-111 and
 * 32-112 pairs, over 4 and over 8 beats, and agreed with two cruder reads.
 */
function bandOnsets(mono) {
  const HOP = Math.round(SR / 1000);
  const edges = [40, 90, 180, 400, 900, 2000, 4500, 9000, 16000];
  const nb = edges.length - 1, nf = Math.floor(mono.length / HOP);
  const env = Array.from({ length: nb }, () => new Float32Array(nf));
  const lps = edges.map((hz) => Math.exp(-2 * Math.PI * hz / SR));
  const st = new Float64Array(edges.length), sm = new Float64Array(nb), dec = Math.exp(-1 / (0.004 * SR));
  for (let i = 0, fr = 0; i < mono.length; i++) {
    for (let j = 0; j < edges.length; j++) st[j] = (1 - lps[j]) * mono[i] + lps[j] * st[j];
    for (let b = 0; b < nb; b++) sm[b] = Math.max(Math.abs(st[b + 1] - st[b]), sm[b] * dec);
    if (i % HOP === HOP - 1 && fr < nf) { for (let b = 0; b < nb; b++) env[b][fr] = Math.log(1e-6 + sm[b]); fr++; }
  }
  for (const e of env) { for (let fr = nf - 1; fr > 0; fr--) e[fr] = Math.max(0, e[fr] - e[fr - 1]); e[0] = 0; }
  return env;
}

function seamLag(env, tA, tB, spb) {
  const n = Math.round(4 * spb * 1000), fB = Math.round(tB * 1000) - n;
  let best = -1, lag = 0;
  for (let d = -110; d <= 110; d++) {
    const fA = Math.round(tA * 1000) + d - n;
    let ab = 0, aa = 0, bb = 0;
    for (const e of env) for (let i = 0; i < n; i++) { const p = e[fA + i], q = e[fB + i]; ab += p * q; aa += p * p; bb += q * q; }
    const c = ab / Math.sqrt(aa * bb);
    if (c > best) { best = c; lag = d / 1000; }
  }
  return { lag, corr: best };
}

/**
 * WHERE TO CUT, given the aligned pair: the quietest moment, on BOTH sides,
 * in the 70ms before the beat. A cut that lands a few ms after a drum hit
 * plays a sliver of it and then the other side's hit — a flam — so the cut
 * goes in the gap before the transient, where there is only decay to join.
 */
function seamCut(mono, tA, tB) {
  const W = Math.round(0.004 * SR);
  const loud = (t) => { const i = Math.round(t * SR); let s = 0; for (let j = 0; j < W; j++) s += mono[i + j] ** 2; return s; };
  let best = Infinity, off = -0.02;
  for (let o = -0.07; o <= -0.004; o += 0.001) {
    const v = loud(tA + o) + loud(tB + o);
    if (v < best) { best = v; off = o; }
  }
  return off;
}

function rmsOf(mono, t0, t1) {
  let s = 0;
  const i0 = Math.floor(t0 * SR), i1 = Math.floor(t1 * SR);
  for (let i = i0; i < i1; i++) s += mono[i] * mono[i];
  return Math.sqrt(s / Math.max(1, i1 - i0));
}

/**
 * Concatenate [0,cutB) + [cutA,cutB)×n + [cutA,end), with an equal-power
 * crossfade ENDING at each seam (over the F samples before the cut on both
 * sides — the jump itself lands on the music just before A's beat).
 *
 * THE BODY IS RESAMPLED TO WHOLE BEATS. cutB - cutA is (B-A) beats plus the
 * seam's lag, so played as-is every pass would shift the music `lag` against
 * the chart's grid — three passes of Nightmare is 100ms, a whole PERFECT
 * window. Stretched by 0.1% it is exactly (B-A) beats: about 1.6 cents of
 * pitch, which nobody can hear, and the grid survives any number of passes.
 */
function renderLong(st, cutA, cutB, gridLen, passes) {
  const iA = cutA * SR, iB = Math.round(cutB * SR);
  const F = Math.round(XF * SR);
  const bodyOut = Math.round(gridLen * SR);
  const rate = (cutB - cutA) * SR / bodyOut;
  const tail = st.n - Math.round(iA);
  const total = iB + passes * bodyOut + tail;
  const L = new Float32Array(total), R = new Float32Array(total);
  // Cubic (Catmull-Rom) read at a fractional sample.
  const at = (ch, p) => {
    const i = Math.floor(p), f = p - i;
    const y0 = ch[i - 1] ?? 0, y1 = ch[i] ?? 0, y2 = ch[i + 1] ?? 0, y3 = ch[i + 2] ?? 0;
    return y1 + 0.5 * f * (y2 - y0 + f * (2 * y0 - 5 * y1 + 4 * y2 - y3 + f * (3 * (y1 - y2) + y3 - y0)));
  };
  // Write n samples to out at o, reading src from s0 at `step` per sample; the
  // F samples BEFORE o are crossfaded from what is there into src[s0 - F*step ..].
  const put = (o, s0, n, step) => {
    for (let i = -F; i < n; i++) {
      const p = s0 + i * step;
      if (o + i < 0 || p < 1) continue;
      const vL = at(st.L, p), vR = at(st.R, p);
      if (i < 0) {
        const w = ((i + F) / F) * Math.PI / 2;
        L[o + i] = L[o + i] * Math.cos(w) + vL * Math.sin(w);
        R[o + i] = R[o + i] * Math.cos(w) + vR * Math.sin(w);
      } else { L[o + i] = vL; R[o + i] = vR; }
    }
  };
  put(0, 0, iB, 1);
  let o = iB;
  for (let p = 0; p < passes; p++) { put(o, iA, bodyOut, rate); o += bodyOut; }
  put(o, iA, tail, 1);
  return { L, R, n: total };
}

/** How much later `file` plays the same audio as `mono` (44.1k): best waveform match, ±50ms, over 6-10s. */
function encoderDelay(mono, file) {
  const b = decodeStereo(file);
  const y = b.L.map((v, i) => 0.5 * (v + b.R[i]));
  const i0 = 6 * SR, n = 4 * SR, R = Math.round(0.05 * SR);
  let best = -Infinity, lag = 0;
  for (let d = -R; d <= R; d++) {
    let s = 0;
    for (let i = 0; i < n; i += 2) s += mono[i0 + i] * y[i0 + i + d];
    if (s > best) { best = s; lag = d; }
  }
  return lag / SR;
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
  const { best: found, top5 } = findLoop(f, beatsEnd);
  const best = T.loopBeats ? { A: T.loopBeats[0], B: T.loopBeats[1], score: NaN } : found;
  const tA = m.firstBeat + best.A * m.spb;
  const tB = m.firstBeat + best.B * m.spb;
  // Align the seam to the music, then cut in the gap before the beat (see seamLag, seamCut).
  const { lag, corr } = seamLag(bandOnsets(mono), tA, tB, m.spb);
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
