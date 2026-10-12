/**
 * THE LOOP-MAKING HALF OF shadow-music.mjs, shared with jukebox-music.mjs.
 * Moved out verbatim (Oct 2026) so the island jukebox's recordings are looped
 * by the same measured search as Shadow Lionheart's, not by a copy of it that
 * drifts. shadow-music's --dry output was compared before and after the move
 * and is identical. The WHY of every function is in its own comment.
 */
import { execFileSync } from 'node:child_process';

export const SR = 44100;
export const XF = 0.025; // the seam crossfade, seconds

export function decodeStereo(file) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '2', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  const f = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const n = f.length / 2;
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
  return { L, R, n };
}

export function goertzel(x, i0, n, hz) {
  const w = 2 * Math.PI * hz / SR, c = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < n; i++) { const s = x[i0 + i] + c * s1 - s2; s2 = s1; s1 = s; }
  return Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2);
}

/** Per beat: 12 chroma bins over three octaves, and four band energies — both normalised. */
export function beatFeatures(mono, first, spb, beats) {
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

export const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
export const sim = (f, i, j) => 0.6 * dot(f[i].chroma, f[j].chroma) + 0.4 * dot(f[i].bands, f[j].bands)
  - Math.min(0.3, Math.abs(Math.log((f[i].loud + 1e-4) / (f[j].loud + 1e-4))) * 0.15);

/** The best loop: A after the intro, B before the ending, whole bars apart, alike around both. */
export function findLoop(f, beatsEnd) {
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
export function bandOnsets(mono) {
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

export function seamLag(env, tA, tB, spb) {
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
export function seamCut(mono, tA, tB) {
  const W = Math.round(0.004 * SR);
  const loud = (t) => { const i = Math.round(t * SR); let s = 0; for (let j = 0; j < W; j++) s += mono[i + j] ** 2; return s; };
  let best = Infinity, off = -0.02;
  for (let o = -0.07; o <= -0.004; o += 0.001) {
    const v = loud(tA + o) + loud(tB + o);
    if (v < best) { best = v; off = o; }
  }
  return off;
}

export function rmsOf(mono, t0, t1) {
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
export function renderLong(st, cutA, cutB, gridLen, passes) {
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
export function encoderDelay(mono, file) {
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

export function encode(st, out) {
  const inter = new Float32Array(st.n * 2);
  for (let i = 0; i < st.n; i++) { inter[2 * i] = st.L[i]; inter[2 * i + 1] = st.R[i]; }
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '2', '-i', '-', '-c:a', 'libmp3lame', '-b:a', '192k', out],
    { input: Buffer.from(inter.buffer), maxBuffer: 1 << 30 });
}
