#!/usr/bin/env node
/**
 * MEASURE A SONG'S BEAT GRID — the generated boss music's tempo, its first
 * beat, which beat of the four is the downbeat, and whether it DRIFTS.
 *
 *   node tools/capture/music-beats.mjs <file.mp3> [--json]
 *
 * A music model is asked for "136 BPM, strict 4/4" and gives back what it
 * likes; a Kata Trace chart is written in beats, so it is the measured grid
 * that has to be believed, never the prompt. Dependency-free past ffmpeg,
 * like the rest of tools/: decode to mono f32, an onset envelope (positive
 * change in log energy, full band plus a kick band), then a search over
 * period and phase for the grid the onsets sit on.
 *
 * DRIFT is the question that decides whether a take is usable at all: a
 * single period fitted to the whole file, then the best phase re-found in
 * each 8-second window. A take whose windows wander by more than ~25ms has
 * changed tempo under the chart and cannot be fixed by a stretch.
 */
import { execFileSync } from 'node:child_process';

const SR = 22050;
const HOP = 64; // 2.9ms

export function decode(file) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

/** Onset strength per hop: full band, and a one-pole lowpass (~150Hz) for the kick. */
export function onsets(x) {
  const n = Math.floor(x.length / HOP);
  const full = new Float32Array(n);
  const low = new Float32Array(n);
  const a = Math.exp(-2 * Math.PI * 150 / SR);
  let lp = 0;
  let pe = 0, pl = 0;
  const W = 4; // a 256-sample (11.6ms) energy window, hopped at 64
  const ef = new Float32Array(n), el = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, sl = 0;
    for (let j = 0; j < HOP; j++) {
      const v = x[i * HOP + j];
      lp = (1 - a) * v + a * lp;
      s += v * v; sl += lp * lp;
    }
    ef[i] = s; el[i] = sl;
  }
  for (let i = 0; i < n; i++) {
    let s = 0, sl = 0;
    for (let k = 0; k < W && i - k >= 0; k++) { s += ef[i - k]; sl += el[i - k]; }
    const e = Math.log(1e-9 + s), l = Math.log(1e-9 + sl);
    full[i] = Math.max(0, e - pe);
    low[i] = Math.max(0, l - pl);
    pe = e; pl = l;
  }
  return { full, low, hop: HOP / SR };
}

const at = (env, hop, t) => {
  const f = t / hop;
  const i = Math.floor(f);
  if (i < 0 || i + 1 >= env.length) return 0;
  // A little window: the onset peak may sit a hop either side of the grid.
  let m = 0;
  for (let k = -2; k <= 2; k++) m = Math.max(m, env[i + k] ?? 0);
  return m;
};

function score(env, hop, P, ph, t0, t1) {
  let s = 0, c = 0;
  for (let t = ph; t < t1; t += P) if (t >= t0) { s += at(env, hop, t); c++; }
  return c ? s / c : 0;
}

/**
 * `range` is the beat length to search, seconds. The default is wide; the
 * generated boss music is searched at 0.40-0.48 (the 136 BPM it was asked
 * for) because unconstrained the search happily locks onto 3/2 or 5/3 of the
 * beat — a period that also lands on loud things, just fewer of them. The
 * procedural theme is the control: 136.364 BPM measured against 136.364 set.
 */
export function measure(file, range = [0.30, 0.80]) {
  const x = decode(file);
  const dur = x.length / SR;
  const { full, low, hop } = onsets(x);
  const env = full.map((v, i) => v + 2 * low[i]);
  // Coarse: every period 0.30-0.80s, every phase.
  let best = { s: -1 };
  const [lo, hi] = range;
  for (let P = lo; P <= hi; P += 0.001) {
    for (let ph = 0; ph < P; ph += hop * 2) {
      const s = score(env, hop, P, ph, 0, dur);
      if (s > best.s) best = { s, P, ph };
    }
  }
  // Fine: a tenth of a millisecond.
  for (let P = best.P - 0.002; P <= best.P + 0.002; P += 0.00005) {
    for (let ph = best.ph - 0.01; ph < best.ph + 0.01; ph += hop / 2) {
      const s = score(env, hop, P, ph, 0, dur);
      if (s > best.s) best = { s, P, ph };
    }
  }
  const { P } = best;
  const ph = ((best.ph % P) + P) % P;
  // Drift: each 8s window's own best phase against the global grid.
  const drift = [];
  for (let w0 = 0; w0 + 8 <= dur; w0 += 8) {
    let b = { s: -1, d: 0 };
    for (let d = -0.06; d <= 0.06; d += hop / 2) {
      const s = score(env, hop, P, ph + d, w0, w0 + 8);
      if (s > b.s) b = { s, d };
    }
    drift.push(+(b.d * 1000).toFixed(1));
  }
  // The downbeat: which of the four beats carries the most kick.
  const acc = [0, 0, 0, 0];
  let k = 0;
  for (let t = ph; t < dur; t += P, k++) acc[k % 4] += at(low, hop, t);
  const down = acc.indexOf(Math.max(...acc));
  // Where the music starts and stops (first/last above -40dB of peak).
  let pk = 0;
  for (const v of x) pk = Math.max(pk, Math.abs(v));
  const thr = pk * 0.01;
  let a0 = 0; while (a0 < x.length && Math.abs(x[a0]) < thr) a0++;
  let a1 = x.length - 1; while (a1 > 0 && Math.abs(x[a1]) < thr) a1--;
  return {
    file, dur: +dur.toFixed(3), bpm: +(60 / P).toFixed(3), spb: +P.toFixed(5),
    firstBeat: +ph.toFixed(4), downbeatIndex: down, firstDownbeat: +(ph + down * P).toFixed(4),
    accents: acc.map((v) => +v.toFixed(1)), drift, driftSpan: +(Math.max(...drift) - Math.min(...drift)).toFixed(1),
    soundStart: +(a0 / SR).toFixed(3), soundEnd: +(a1 / SR).toFixed(3), score: +best.s.toFixed(3),
  };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('music-beats.mjs')) {
  const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  for (const f of files) {
    const m = measure(f, process.env.SPB ? process.env.SPB.split(',').map(Number) : undefined);
    if (process.argv.includes('--json')) console.log(JSON.stringify(m));
    else console.log(`${f}\n  ${m.bpm} BPM (spb ${m.spb}), first beat ${m.firstBeat}s, downbeat +${m.downbeatIndex} -> ${m.firstDownbeat}s, accents ${m.accents.join('/')}\n  drift per 8s (ms) ${m.drift.join(' ')}  span ${m.driftSpan}  sound ${m.soundStart}-${m.soundEnd} of ${m.dur}`);
  }
}
