/**
 * Measure a spoken WAV, because casting cannot be done by reading names.
 *
 *   node tools/voice-measure.mjs out/trailer/vo/cast/*.wav
 *
 * WHY THIS EXISTS. Six ElevenLabs presets were auditioned for Mr. Satan with
 * the same line, and the only things distinguishing them in the API are a name
 * and a gender field. "Measure, don't reason, about anything drawn" is house
 * rule four; the same applies to anything spoken. This prints the four numbers
 * that actually decide whether a voice can play a loud, boastful champion:
 *
 *   f0        median pitch over voiced frames. Lower reads bigger.
 *   range     the 10th-to-90th percentile spread of f0 in semitones. A
 *             narrator who never leaves a five-semitone band cannot land
 *             "the GREATEST champion of all ti—" no matter how deep they are.
 *   dyn       loud-to-quiet spread in dB, same percentiles. Bombast is
 *             dynamics; a compressed read is a newsreader.
 *   secs      how long they take over the line. The edit has five-second
 *             holes, so a voice that runs 40% long is simply not castable.
 *
 * Mono 16-bit PCM WAV only — that is what `ffmpeg -ac 1 -ar 16000` gives and
 * there is no reason to accept anything else. Any sample rate: the lag search
 * is in samples per second, so 48kHz takes from the trailer measure the same
 * as 16kHz conversions of the game's mp3s.
 *
 * MEASURE A PREVIEW OR A WHOLE PERFORMANCE, NEVER ONE DRAMATIC LINE. This was
 * tried as a way of policing the trailer's two narrators — Harrison at 128Hz
 * against Desmond at 148, three semitones apart, which ought to be easy — and
 * it does not work at all. Across the fourteen rendered takes, Harrison's own
 * lines measure 104, 133, 137, 148, 206 and 240Hz: a laugh puts him an octave
 * up and a growled "hmph" puts him an octave down, and the median of a
 * three-second line is one delivery choice, not a voice. The two narrators'
 * per-line numbers interleave completely. `measure()` is exported anyway
 * because it is genuinely useful on a preset's preview or on a long clip; it
 * is `trailer-vo.mjs --check` that had to find a different question to ask.
 */
import { readFileSync } from 'node:fs';

/* Voiced speech sits between roughly 60Hz and 400Hz; searching wider finds
   octave errors in the noise and drags the median around. */
const F_LO = 60;
const F_HI = 400;

function readWav(file) {
  const b = readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF') throw new Error(file + ': not a WAV');
  let p = 12;
  let fmt = null;
  let data = null;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4);
    const len = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') data = b.subarray(p + 8, p + 8 + len);
    p += 8 + len + (len & 1);
  }
  if (!fmt || !data) throw new Error(file + ': no fmt/data chunk');
  if (fmt.ch !== 1 || fmt.bits !== 16) throw new Error(file + ': want mono 16-bit');
  const n = Math.floor(data.length / 2);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = data.readInt16LE(i * 2) / 32768;
  return { x, sr: fmt.sr };
}

/* Autocorrelation with the usual normalisation. Cheap, and accurate enough at
   16kHz for a median over a few hundred frames — this is casting, not tuning. */
function pitch(frame, sr) {
  const lo = Math.floor(sr / F_HI);
  const hi = Math.min(Math.floor(sr / F_LO), frame.length - 1);
  let best = 0;
  let bestLag = 0;
  let energy0 = 0;
  for (let i = 0; i < frame.length; i++) energy0 += frame[i] * frame[i];
  if (energy0 < 1e-4) return 0;
  for (let lag = lo; lag <= hi; lag++) {
    let s = 0;
    let e = 0;
    for (let i = 0; i + lag < frame.length; i++) {
      s += frame[i] * frame[i + lag];
      e += frame[i + lag] * frame[i + lag];
    }
    const r = s / Math.sqrt(energy0 * e + 1e-12);
    if (r > best) { best = r; bestLag = lag; }
  }
  /* Below 0.35 the frame is a consonant, a breath or silence; counting those
     as pitch is what makes a naive f0 median useless. */
  return best > 0.35 ? sr / bestLag : 0;
}

const pct = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0);

/** The four numbers, for one file. `f0` is rounded — it is a casting decision,
 *  not a tuning one, and printing 147.6183 invites somebody to trust it. */
export function measure(file) {
  const { x, sr } = readWav(file);
  const win = Math.round(sr * 0.04);
  const hop = Math.round(sr * 0.02);
  const f0 = [];
  const db = [];
  for (let i = 0; i + win < x.length; i += hop) {
    const frame = x.subarray(i, i + win);
    let rms = 0;
    for (let k = 0; k < frame.length; k++) rms += frame[k] * frame[k];
    rms = Math.sqrt(rms / frame.length);
    if (rms > 0.004) db.push(20 * Math.log10(rms));
    const f = pitch(frame, sr);
    if (f > 0) f0.push(f);
  }
  f0.sort((a, b) => a - b);
  db.sort((a, b) => a - b);
  const med = pct(f0, 0.5);
  return {
    name: file.replace(/\\/g, '/').split('/').pop().replace(/\.wav$/, ''),
    f0: Math.round(med),
    range: med > 0 ? 12 * Math.log2(pct(f0, 0.9) / Math.max(1, pct(f0, 0.1))) : 0,
    dyn: pct(db, 0.95) - pct(db, 0.1),
    secs: x.length / sr,
  };
}

/* ------------------------------------------------------------------------ */
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('voice-measure.mjs')) {
  console.log('name          f0Hz   range(st)  dyn(dB)   secs');
  for (const file of process.argv.slice(2)) {
    const r = measure(file);
    console.log(
      r.name.padEnd(12) +
      String(r.f0).padStart(6) +
      r.range.toFixed(1).padStart(11) +
      r.dyn.toFixed(1).padStart(9) +
      r.secs.toFixed(2).padStart(7),
    );
  }
}
