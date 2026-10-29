/* ---------------------------------------------------------------------------
   FIND EACH VOICE LINE IN A SCREEN RECORDING (review.html; dev only).

   Richard records the cutscene with whatever he has, and those recorders run
   at a variable frame rate (the first one averaged 27.3fps) and the game can
   pause between lines while the next voice loads. Two handles at the start and
   end of the scene would line up the ends and drift in the middle. So the
   recording is synced by the thing the scene is timed to: her voice. Every
   line's mp3 is searched for in the recording's soundtrack, which gives one
   anchor per line, and a note becomes "line 7, 2.34s in".

   THE FEATURE IS A SPECTROGRAM, NOT A LOUDNESS CURVE. The recording has the
   music and the world's sounds under the voice; a loudness envelope is mostly
   the music between words. Twenty log-spaced bands from 150Hz to 5kHz, in dB,
   each centred on its own mean over the clip, and compared by correlation, are
   what the voice changes and the music does not.

   COARSE THEN FINE. Every line is searched over the WHOLE recording at a 40ms
   hop (so a line that was re-recorded since the video, or cut, cannot drag
   the others with it), the best few peaks are kept, and one ordered, non-
   overlapping choice is made across all lines by dynamic programming. Then
   each chosen anchor is refined at 10ms. A line whose best score is weak is
   reported as missing and placed between its neighbours, never guessed.

   Pure: PCM in (mono Float32Array at SR), anchors out. Node runs the same
   code in tools/checks/review.mjs against a mix with known offsets.
--------------------------------------------------------------------------- */

export const SR = 16000;
const N = 512;            // 32ms window
const HOP = 160;          // 10ms
const BANDS = 20;
const COARSE = 4;         // coarse step, in hops (40ms)
/* Below this the match is not trusted. Measured on Richard's first recording
   (Oct 2026, 124s, the music under her): all 13 intro lines found at 0.858 to
   0.929. Thirty of her OTHER lines, none of them in it, searched for anyway:
   the best false match was 0.623 (the same voice, and a one-second "hey,
   Storm" has few frames to disagree with). 0.7 is between the two. */
export const MIN_SCORE = 0.7;

/* Radix-2 FFT, in place, on (re, im). */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const p = i + k, q = p + len / 2;
        const tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr;
        re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

const EDGES = Array.from({ length: BANDS + 1 }, (_, i) => Math.round(150 * (5000 / 150) ** (i / BANDS) * N / SR));
const HANN = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));

/** Frames x BANDS of dB band energy, one frame per 10ms. */
export function features(pcm) {
  const frames = Math.max(0, Math.floor((pcm.length - N) / HOP) + 1);
  const out = new Float32Array(frames * BANDS);
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let f = 0; f < frames; f++) {
    const o = f * HOP;
    for (let i = 0; i < N; i++) { re[i] = pcm[o + i] * HANN[i]; im[i] = 0; }
    fft(re, im);
    for (let b = 0; b < BANDS; b++) {
      let e = 0;
      for (let k = EDGES[b]; k < Math.max(EDGES[b] + 1, EDGES[b + 1]); k++) e += re[k] * re[k] + im[k] * im[k];
      out[f * BANDS + b] = 10 * Math.log10(1e-9 + e);
    }
  }
  return { data: out, frames };
}

/* The clip, centred per band and scaled to unit length, every `step` frames. */
function template(F, step) {
  const n = Math.floor(F.frames / step);
  const t = new Float32Array(n * BANDS);
  for (let b = 0; b < BANDS; b++) {
    let m = 0;
    for (let i = 0; i < n; i++) m += F.data[i * step * BANDS + b];
    m /= n || 1;
    for (let i = 0; i < n; i++) t[i * BANDS + b] = F.data[i * step * BANDS + b] - m;
  }
  let s = 0;
  for (const v of t) s += v * v;
  s = Math.sqrt(s) || 1;
  for (let i = 0; i < t.length; i++) t[i] /= s;
  return { t, n };
}

/* Correlation of the template against the recording starting at frame `at`.
   The recording's window is centred per band too, so a louder floor (the
   music swelling) does not read as a match. */
function corr(V, T, at, step) {
  let num = 0, ss = 0;
  for (let b = 0; b < BANDS; b++) {
    let m = 0;
    for (let i = 0; i < T.n; i++) m += V.data[(at + i * step) * BANDS + b];
    m /= T.n;
    for (let i = 0; i < T.n; i++) {
      const y = V.data[(at + i * step) * BANDS + b] - m;
      num += T.t[i * BANDS + b] * y;
      ss += y * y;
    }
  }
  return ss > 0 ? num / Math.sqrt(ss) : 0;
}

/**
 * @param recPcm   the recording's soundtrack, mono, SR
 * @param lines    [{ id, pcm }] the scene's voice lines in order, mono, SR
 * @returns [{ id, t, score, found, dur }] t = where the line starts in the recording, seconds
 */
export function syncLines(recPcm, lines, { onProgress } = {}) {
  const V = features(recPcm);
  const sec = HOP / SR;
  const cand = lines.map((L, li) => {
    const F = features(L.pcm);
    const T = template(F, COARSE);
    const last = V.frames - F.frames;
    const peaks = [];
    for (let at = 0; at <= last; at += COARSE) peaks.push([at, corr(V, T, at, COARSE)]);
    onProgress?.((li + 1) / lines.length);
    // the best few, at least 1s apart
    peaks.sort((a, b) => b[1] - a[1]);
    const keep = [];
    for (const p of peaks) {
      if (keep.length >= 4) break;
      if (keep.every((k) => Math.abs(k[0] - p[0]) > 100)) keep.push(p);
    }
    return { F, keep: keep.filter((k) => k[1] >= MIN_SCORE) };
  });
  /* One ordered choice: each line either takes one of its peaks, starting
     after the previous line's chosen peak has ended, or is skipped. */
  const n = lines.length;
  const best = new Map();
  const solve = (i, after) => {
    if (i === n) return { s: 0, pick: [] };
    const key = `${i}:${after}`;
    if (best.has(key)) return best.get(key);
    let r = solve(i + 1, after);
    r = { s: r.s, pick: [null, ...r.pick] };
    for (const [at, sc] of cand[i].keep) {
      if (at < after) continue;
      const rest = solve(i + 1, at + cand[i].F.frames - 50);   // a line may overlap the last 0.5s of the one before
      if (rest.s + sc > r.s) r = { s: rest.s + sc, pick: [at, ...rest.pick] };
    }
    best.set(key, r);
    return r;
  };
  const { pick } = solve(0, 0);
  const out = lines.map((L, i) => {
    const dur = cand[i].F.frames * sec;
    if (pick[i] == null) return { id: L.id, t: null, score: 0, found: false, dur };
    const T = template(cand[i].F, 1);
    let bestAt = pick[i], bestSc = -1;
    for (let at = Math.max(0, pick[i] - COARSE * 2); at <= Math.min(V.frames - cand[i].F.frames, pick[i] + COARSE * 2); at++) {
      const sc = corr(V, T, at, 1);
      if (sc > bestSc) { bestSc = sc; bestAt = at; }
    }
    return { id: L.id, t: +(bestAt * sec).toFixed(3), score: +bestSc.toFixed(3), found: true, dur };
  });
  return fillGaps(out);
}

/** A line not found is placed between its neighbours by their spacing, and says so. */
export function fillGaps(anchors) {
  const found = anchors.filter((a) => a.found);
  if (!found.length) return anchors;
  return anchors.map((a, i) => {
    if (a.found || a.t != null) return a;
    const prev = anchors.slice(0, i).reverse().find((x) => x.found);
    const next = anchors.slice(i + 1).find((x) => x.found);
    let t;
    if (prev && next) {
      const gap = next.t - (prev.t + prev.dur);
      const between = anchors.slice(anchors.indexOf(prev) + 1, anchors.indexOf(next));
      const used = between.reduce((s, x) => s + x.dur, 0);
      const pad = (gap - used) / (between.length + 1);
      t = prev.t + prev.dur + pad;
      for (const x of between) { if (x === a) break; t += x.dur + pad; }
    } else if (prev) {
      t = prev.t + anchors.slice(anchors.indexOf(prev), i).reduce((s, x) => s + x.dur + 0.5, 0);
    } else {
      t = next.t - anchors.slice(i, anchors.indexOf(next)).reduce((s, x) => s + x.dur + 0.5, 0);
    }
    return { ...a, t: +Math.max(0, t).toFixed(3), placed: true };
  });
}
