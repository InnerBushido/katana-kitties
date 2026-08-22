/**
 * The evil kitten. Two outputs, one ladder.
 *
 *   node tools/kitten-cackle.mjs out/trailer/vo/12.wav   the trailer's demon
 *   node tools/kitten-cackle.mjs --game                  public/voice/cross0..3
 *
 * The first writes a 48kHz mono 16-bit WAV, so the trailer's mixer treats it
 * as a take like any other line — trimmed, levelled and ducked by the same
 * code in tools/trailer-score.mjs. It is a voice in the cast that happens to
 * be synthesised rather than generated.
 *
 * The second writes the four rungs the Cross Slash grades itself with: land
 * none of the three cuts and you get an innocent kitten, land all three and
 * you get the trailer's demon. Same ladder, same source, four rungs off it —
 * see THE LAST BURST, BECAUSE THE CLIP IS A LADDER below, and
 * docs/notes/voices.md for which rung is which.
 *
 * THE TRICK IS NOT "MAKE AN EVIL NOISE", IT IS "SLOW A KITTEN DOWN A LOT."
 * Richard found the joke in a clip of a kitten's quick chirpy meow played back
 * at a fraction of speed, which turns it into a cackling demon. That is a
 * different thing from synthesising something low and growly, and it sounds
 * different: slowing a recording drags the FORMANTS down with the pitch, so
 * the mouth that made it appears to be three times the size of the animal. A
 * low growl written directly has formants where a big throat would put them
 * and just sounds like a big animal. The comedy is in the mismatch.
 *
 * SO THIS SYNTHESISES A KITTEN AT KITTEN PITCH AND THEN SLOWS IT DOWN, rather
 * than synthesising the result. Same operation, same artefacts, and the source
 * is ours: `RATE` is the only knob, and turning it to 1 plays the actual
 * kitten this is built from.
 *
 * THE NUMBERS COME OFF THE CLIP HE SENT, not off a guess. Measured with
 * tools/voice-measure.mjs: its most-slowed burst runs 2.9 seconds with a
 * median f0 of 142 Hz and 26 semitones of pitch range, and the same clip's
 * unslowed burst has NO fundamental anywhere below 400 Hz — which is the
 * measurement that matters, because it says the source is a real kitten around
 * a kilohertz and pins the slow factor at about six. Eighth non-negotiable:
 * the facing of a sprite and the pitch of a joke are both measured.
 *
 * THE SYNTHESISED ONE IS THE FALLBACK, NOT THE FIRST CHOICE — and it lost.
 * Three takes were built for this beat: an ElevenLabs voice saying "mrrrow,
 * hee hee hee", and two passes of the synthesis below. Richard listened to all
 * three and none of them were funny. What is funny is the actual kitten, and
 * no amount of formant maths gets there, because the joke is not the shape of
 * the sound — it is that a real animal made it.
 *
 * So if `out/trailer/ref/cackle.wav` is present, this tool CUTS THE LAST BURST
 * OUT OF IT and uses that; the synthesis runs only when it is absent. Prefer a
 * rule that degrades over one that vanishes: a clone without the reference
 * still renders a trailer with something in that slot.
 *
 * THE REFERENCE IS NOT IN THE REPO AND MUST NOT GO IN IT. It is somebody
 * else's recording off a social post. It sits in `out/`, which is gitignored,
 * beside the generated stills and the narration takes — the other things in
 * this project that cannot be re-derived from a tool. Everything else here is
 * procedural or generated (ninth non-negotiable) and this one file is not, so
 * it is worth knowing that a Steam release is the moment to either license it
 * or fall back to the synthesis by deleting it.
 *
 * THE LAST BURST, BECAUSE THE CLIP IS A LADDER. It plays the same meow at
 * progressively slower speeds — nine bursts, each longer and lower than the
 * last, 0.29s at the top and 3.00s at the bottom. The first is an innocent
 * kitten and the last is the demon, which is the one this trailer wants. It is
 * found by ENERGY rather than by a timestamp typed in here: a re-download, a
 * re-encode or a different crop of the same reel would silently shift every
 * hardcoded number and produce a take cut off mid-cackle.
 *
 * NINE IS MEASURED, NOT COUNTED BY EAR. `ladder()` splits on a gap of
 * near-silence and the gap threshold is the only knob; the burst count is
 * whatever falls out. 0.07s over-splits the two slowest bursts, which have
 * audible pauses inside the cackle itself; 0.14s merges the two fastest, which
 * are 0.14s apart. Everything from about 0.09 to 0.13 gives nine, so 0.10 sits
 * in the middle of a plateau rather than on a threshold that a re-encode could
 * tip. GAME_RUNGS picks off that nine.
 *
 * WITHOUT THE REFERENCE, --game SYNTHESISES ITS OWN LADDER, because the
 * synthesis has always had exactly the right knob for it: `RATE` is the slow
 * factor and the reference IS one meow at four slow factors. A clone with no
 * `out/trailer/ref/` still gets four graded purrs — worse ones, per the
 * paragraph above, but four. That matters more here than it does for the
 * trailer: these ship in `public/`, so this is the tool that has to exist for
 * a Steam release to be able to delete the reference and keep the feature.
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const SR = 48000;

/* Slow factor. 6.0 puts a ~850Hz kitten at ~142Hz, which is what the
   reference measured at. The arc and the decay were widened to match it too —
   the first pass came out at 9 semitones of pitch range against the clip's 26,
   and 12dB of dynamics against its 37, which is the difference between a
   cackle and a hum. Below about 4 it stops being funny and starts
   sounding like a cat with a cold; above about 8 the formants land under the
   music and it reads as a rumble rather than a laugh. */
const RATE = 6.0;

/* Four chirps, not the reference's five: this lands at 2.9s, the same length
   as the clip, inside the 3.2s the edit has between Duskcoat's line and Mr.
   Satan's. Five measured 3.6s and overran — which
   `node tools/trailer-vo.mjs --check` catches, and which is why that check
   exists. */
const CHIRPS = 4;

/**
 * Which rungs of the nine the Cross Slash grades itself with, and what each
 * one costs the player to hear.
 *
 * NOT 1-2-3-4 AND NOT 1-3-5-7. The ladder is not linear — the reference slows
 * by a roughly constant FACTOR per rung, so the audible step from 1 to 2 is
 * the same size as the step from 6 to 9 and picking four adjacent rungs would
 * give four sounds nobody can tell apart mid-fight. These four are spaced to
 * be obviously different at a glance: 0.29s, 0.53s, 1.06s, 3.00s, each about
 * double the last. Rung 9 is the trailer's demon, which is the point — the
 * reward for landing all three cuts is the noise from the advert.
 *
 * `rate` is the fallback synthesis's slow factor for that rung. Rung 9's 6.0
 * is RATE, so cross3 with no reference is exactly the take the trailer would
 * have used — but the rungs below it do NOT reproduce the reference's spacing
 * and no choice of rate could. The synthesis plays a fixed four-chirp train,
 * so its length is exactly linear in the slow factor, and the measured ladder
 * is 0.83/1.27/1.85/2.92 against the reference's 0.29/0.53/1.06/3.00: same
 * order, a quarter of the spread. The bottom rung is a whole cackle where the
 * reference's is one chirp. This is the documented worse option and it is
 * written down rather than tuned at, because tuning it means picking chirp
 * counts per rung, and four different chirp counts is four different animals.
 */
const GAME_RUNGS = [
  { burst: 1, out: 'cross0', rate: 1.7, why: 'no cuts landed — an innocent kitten, and it sounds weak' },
  { burst: 4, out: 'cross1', rate: 2.6, why: 'one cut landed' },
  { burst: 6, out: 'cross2', rate: 3.8, why: 'two cuts landed' },
  { burst: 9, out: 'cross3', rate: RATE, why: 'all three landed — the trailer demon' },
];

/* A deterministic noise source, same reasoning as trailer-score.mjs: a render
   that cannot be repeated is not a build step. */
let seed = 0x1a2b3c4d;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return (seed / 0xffffffff) * 2 - 1;
}

/**
 * A two-pole resonator — one vocal-tract formant.
 *
 * y[n] = x[n] + 2r·cos(w)·y[n-1] - r²·y[n-2]. `r` near 1 is a narrow, ringing
 * peak; this is what turns a buzz into a vowel, and moving the peaks over the
 * length of a chirp is what makes it say "ek" rather than hold one note.
 */
function makeFormant() {
  let y1 = 0;
  let y2 = 0;
  return (x, f, r) => {
    const w = 2 * Math.PI * Math.min(f, SR * 0.45) / SR;
    const y = x + 2 * r * Math.cos(w) * y1 - r * r * y2;
    y2 = y1;
    y1 = y;
    return y;
  };
}

const REF = 'out/trailer/ref/cackle.wav';
const GAME = process.argv.includes('--game');
const OUTFILE = process.argv[2] ?? 'out/trailer/vo/12.wav';

/** 48kHz mono 16-bit only — everything this tool touches is written that way. */
function readWav(file) {
  const b = readFileSync(file);
  /* Walk the chunks rather than assuming the data starts at 44. ffmpeg writes
     a LIST/INFO chunk into anything it converts, so the fixed offset every
     other tool in here uses is wrong for exactly the files this one reads. */
  let p = 12;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4);
    const size = b.readUInt32LE(p + 4);
    if (id === 'data') {
      const n = Math.floor(size / 2);
      const x = new Float64Array(n);
      for (let i = 0; i < n; i++) x[i] = b.readInt16LE(p + 8 + i * 2) / 32768;
      return x;
    }
    p += 8 + size + (size & 1);
  }
  throw new Error(`${file}: no data chunk`);
}

/**
 * The last burst in the ladder, found by energy.
 *
 * Walk back from the end to the last sample that is clearly sound, then keep
 * walking until a gap of GAP seconds of near-silence — that gap is the join
 * between the second-slowest burst and the slowest one. Both thresholds are
 * generous: the bursts in the reference are 20dB above their gaps, so there is
 * no line to walk here, and a tighter gate would start finding the quiet tail
 * of a cackle instead of the cackle.
 */
function lastBurst(x) {
  const FLOOR = 0.012;
  const GAP = Math.round(0.30 * SR);
  let end = x.length - 1;
  while (end > 0 && Math.abs(x[end]) < FLOOR) end--;
  let start = end;
  let quiet = 0;
  while (start > 0 && quiet < GAP) {
    start--;
    quiet = Math.abs(x[start]) < FLOOR ? quiet + 1 : 0;
  }
  return [Math.max(0, start), Math.min(x.length - 1, end + Math.round(0.05 * SR))];
}

/**
 * Every burst in the ladder, front to back, as [start, end] sample pairs.
 *
 * DELIBERATELY NOT SHARED WITH `lastBurst`, WHICH IT LOOKS LIKE IT SUBSUMES.
 * It does not, quite: `lastBurst` gates at a 0.30s gap and pads its end by
 * 50ms, and the take it cuts is baked into a committed 20MB MP4 that nobody is
 * going to re-render to accommodate a refactor. Running this at 0.10s and
 * taking the last entry gives 10.84s-13.85s against its 10.54s-13.90s: the
 * same cackle with 300ms less air around it, which is inaudible on its own and
 * a different file on disk. Two callers, two contracts, one of them frozen.
 * The duplication is eleven lines and it is the cheap side of the trade.
 */
function ladder(x, gapSecs = 0.10) {
  const FLOOR = 0.012;
  const GAP = Math.round(gapSecs * SR);
  const out = [];
  let start = -1;
  let quiet = 0;
  for (let i = 0; i < x.length; i++) {
    if (Math.abs(x[i]) >= FLOOR) {
      if (start < 0) start = i;
      quiet = 0;
    } else if (start >= 0 && ++quiet >= GAP) {
      out.push([start, i - quiet]);
      start = -1;
    }
  }
  if (start >= 0) out.push([start, x.length - 1]);
  return out;
}

/* ---- the kitten, at kitten speed ---------------------------------------
   One chirp is a rising-then-falling fundamental under a vowel that opens and
   closes: "eh" -> "eh-eh" is the shape of the actual noise a small cat makes
   when it is complaining about something. The chirps get slightly lower and
   slightly longer as they go, because a run of identical ones sounds like a
   loop rather than an animal. */
const CHIRP = 0.095;          // seconds, at natural speed
const GAP = 0.030;
/* SIZED EXACTLY, WITH NO SLACK ON THE END. The usual habit of padding a
   synthesis buffer by a second is wrong here by construction: everything in it
   is about to be stretched six times, so a second of trailing silence becomes
   SIX, and the take measured 8.95s in a 2.6s slot. The last chirp is the
   longest one (see the 1.06^c below), so the end is computed from it rather
   than from the nominal step. */
const lastStart = (CHIRPS - 1) * (CHIRP + GAP);
const lastLen = CHIRP * (1 + (CHIRPS - 1) * 0.06);

/**
 * One rung: a kitten synthesised at kitten pitch, then slowed by `rate`.
 *
 * A FUNCTION OF THE SLOW FACTOR AND NOTHING ELSE, because that is the one
 * thing the reference ladder varies. Everything below the resampler — the
 * chirp shape, the formant arc, the decay exponent — was tuned against the
 * reference's SLOWEST burst and must not be re-tuned per rung: the joke is
 * that it is the same animal each time, and a faster rung that also had a
 * different vowel would read as a second cat rather than the same one
 * recovering. `rate` is the knob. Turning it to 1 plays the kitten.
 *
 * The seed is reset per call so a rung is the same file every render, and so
 * two rungs differ only by their rate rather than by where the noise happened
 * to be — a render that cannot be repeated is not a build step.
 */
function synth(rate) {
seed = 0x1a2b3c4d;
const natural = new Float64Array(Math.ceil((lastStart + lastLen) * SR));

let ph = 0;
const f1 = makeFormant();
const f2 = makeFormant();
const f3 = makeFormant();

for (let c = 0; c < CHIRPS; c++) {
  const start = Math.round(c * (CHIRP + GAP) * SR);
  const len = Math.round(CHIRP * (1 + c * 0.06) * SR);
  /* Each chirp starts a tone lower than the last — a descending run reads as
     somebody enjoying themselves; a rising one reads as alarm. */
  /* 700, not the ~900Hz the reference's source kitten must have been. The
     number that has to match is the MEDIAN of the slowed take, and the arc
     below spends most of its length above `base` — so tuning `base` to the
     source pitch put the median a fifth too high (211Hz against the clip's
     142). Measured, adjusted, measured again. */
  const base = 700 * Math.pow(2, -c * 0.09);

  for (let i = 0; i < len; i++) {
    const u = i / len;
    /* Pitch: up a fifth over the first third, then down past where it began.
       That arc is most of what makes it a "meow" and not a beep. */
    const f = base * (u < 0.33
      ? 1 + 1.4 * (u / 0.33)
      : 2.4 - 1.8 * ((u - 0.33) / 0.67));

    ph += f / SR;
    if (ph >= 1) ph -= 1;
    /* A sawtooth is the right glottal source: rich in harmonics, which is what
       the formants need something to bite on. A sine has nothing to filter. */
    const src = 2 * ph - 1 + rnd() * 0.06;

    /* The vowel opens ("eh") and closes ("k"). F1 climbing while F2 falls is
       the standard front-to-mid vowel move, at kitten scale — roughly three
       times a human's, which is the whole reason slowing it down sounds like a
       much larger creature. */
    const F1 = 900 + 700 * Math.sin(Math.PI * u);
    const F2 = 3000 - 900 * u;
    const F3 = 5200;

    let y = f1(src, F1, 0.965) * 0.8
          + f2(src, F2, 0.955) * 0.5
          + f3(src, F3, 0.94) * 0.2;

    /* Fast in, slow out, with a hard little edge at the front — the "k". */
    /* The decay exponent is the DYNAMICS knob, and dynamics is most of what
       separates a cackle from a hum: the reference measured 37dB between its
       peaks and the silence between chirps, and a gentle release gave 12. */
    const env = u < 0.05 ? u / 0.05 : Math.pow(1 - (u - 0.05) / 0.95, 3.4);
    natural[start + i] += y * env * 0.22;
  }
}

/* ---- and now slow it down ----------------------------------------------
   Linear interpolation at 1/RATE of a sample per output sample. Nothing
   cleverer is wanted: a proper resampler's anti-imaging filter would take off
   exactly the gritty top end that makes the slowed version sound broken and
   evil rather than merely deep. The artefacts ARE the effect. */
const outLen = Math.round(natural.length * rate);
const out = new Float64Array(outLen);
for (let i = 0; i < outLen; i++) {
  const s = i / rate;
  const a = Math.floor(s);
  const frac = s - a;
  out[i] = natural[a] * (1 - frac) + (natural[a + 1] ?? 0) * frac;
}

/* A touch of soft clip. Slowed down, the peaks stack up in a way they never do
   at speed, and a hint of saturation is the difference between "loud" and
   "menacing". */
for (let i = 0; i < outLen; i++) out[i] = Math.tanh(out[i] * 2.2);
return out;
}

/**
 * A SHORT FADE ON BOTH ENDS, and only that. A cut is made at a threshold
 * crossing rather than at a zero crossing, so without these it starts and ends
 * on a click — which under a braam reads as the video glitching rather than as
 * a cat, and in the game reads as the sound effect being broken. 15ms is under
 * a frame at 30fps and inaudible as a fade.
 */
function deClick(take) {
  const F = Math.round(0.015 * SR);
  for (let i = 0; i < F && i < take.length; i++) {
    take[i] *= i / F;
    take[take.length - 1 - i] *= i / F;
  }
  return take;
}

/** Peak-normalised 48kHz mono 16-bit, which is all anything here reads. */
function writeWav(file, take) {
  let peak = 0;
  for (let i = 0; i < take.length; i++) peak = Math.max(peak, Math.abs(take[i]));
  const g = peak > 0 ? 0.92 / peak : 1;

  const n = take.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(take[i] * g * 32767))), 44 + i * 2);
  }
  writeFileSync(file, buf);
  return n / SR;
}

/* ---- the four game rungs ------------------------------------------------ */
if (GAME) {
  /* 44.1kHz 128k mono, matching every other file in public/voice — these play
     through the same bus as Mr. Satan and a rung at a different sample rate is
     one more thing for a browser to resample at the moment it is asked to make
     a noise. The WAVs go to a scratch dir and are deleted: the mp3 is the
     artefact, and a stray 48kHz WAV beside it would eventually get shipped. */
  const tmp = 'out/trailer/ref/rungs';
  mkdirSync(tmp, { recursive: true });
  mkdirSync('public/voice', { recursive: true });

  const ref = existsSync(REF) ? readWav(REF) : null;
  const rungs = ref ? ladder(ref) : null;
  /* If the reference is present but does not split into the nine this was
     measured against, DO NOT quietly take the first four of whatever it found
     — that is how you ship cross3 as half a cackle. Fall through to the
     synthesis, which is always nine rungs because it makes them. */
  const usable = rungs && rungs.length === 9;
  if (rungs && !usable) {
    console.log(`! ${REF} split into ${rungs.length} bursts, not 9 — using the synthesis instead`);
  }

  for (const r of GAME_RUNGS) {
    let take;
    let how;
    if (usable) {
      const [a, b2] = rungs[r.burst - 1];
      take = deClick(ref.slice(a, b2 + 1));
      how = `burst ${r.burst}/9 of ${REF} (${(a / SR).toFixed(2)}s - ${(b2 / SR).toFixed(2)}s)`;
    } else {
      take = deClick(synth(r.rate));
      how = `synthesised, slowed ${r.rate}x`;
    }
    const wav = `${tmp}/${r.out}.wav`;
    const secs = writeWav(wav, take);
    const mp3 = `public/voice/${r.out}.mp3`;
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-ac', '1', '-ar', '44100', '-b:a', '128k', mp3]);
    console.log(`${mp3}  ${secs.toFixed(2)}s  ${r.why}\n    ${how}`);
  }
  rmSync(tmp, { recursive: true, force: true });
} else {
  /* ---- and now choose which kitten actually goes in --------------------- */
  let take = synth(RATE);
  let how = `synthesised, slowed ${RATE}x, ${CHIRPS} chirps`;

  if (existsSync(REF)) {
    const ref = readWav(REF);
    const [a, b2] = lastBurst(ref);
    take = deClick(ref.slice(a, b2 + 1));
    how = `the last burst of ${REF} (${(a / SR).toFixed(2)}s - ${(b2 / SR).toFixed(2)}s)`;
  }

  const secs = writeWav(OUTFILE, take);
  console.log(`${OUTFILE}  ${secs.toFixed(2)}s  ${how}`);
}
