/**
 * The trailer's soundtrack: the GAME'S OWN music, plus a trailer orchestra on
 * top of it, plus two narrators talking over both.
 *
 *   node tools/trailer-score.mjs out/trailer/score.wav
 *   node tools/trailer-score.mjs out/trailer/music.wav --no-vo
 *
 * `src/core/audio.js` describes each piece as data — a pentatonic scale, a
 * root, a beat, and which of the drone / taiko / bass / snare / bell / fifths
 * voices it uses — and its `_pluck` schedules that data onto Web Audio nodes.
 * This file imports the same table and schedules it onto a sample buffer
 * instead, so the trailer is scored in the game's keys with the game's tunes
 * and cannot drift out of them.
 *
 * WHY NOT RECORD THE GAME. A capture is one take of a sequencer whose rests
 * are hashed off the step number, so it would be unrepeatable, it would carry
 * whatever sound effects happened during the take, and it could not be cut to
 * the length of an edit. This renders exactly the bars the edit needs.
 *
 * WHY THERE IS A SECOND ORCHESTRA ON TOP OF IT. Richard asked for something
 * "more action packed, dramatic and bombastic", and the honest answer is that
 * the game's own music cannot be that and should not try. It is a koto and a
 * drum, written to be lived in for an hour at a time by a nine-year-old; the
 * arena theme is the loudest thing in it and it is a village festival. A
 * trailer needs horns, timpani, a choir and a drop, and none of those belong
 * on the islands.
 *
 * So the pentatonic pieces stay exactly as the game plays them and become the
 * MELODY, and everything below `the trailer orchestra` is new, plays only
 * here, and is tuned to the roots in MUSIC so the two are in the same key.
 * Nothing in this file is ever loaded by the game.
 *
 * Higgsfield could not do this: its audio models are speech-only, and the
 * music model in its catalogue is locked to a game-generation pipeline and is
 * not for standalone tracks. So the music is synthesised here and only the
 * voice is generated — see tools/trailer-vo.mjs.
 *
 * Dependency-free, like `tools/png.mjs`. 48kHz 16-bit stereo WAV.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { MUSIC, ROOT } from '../src/core/audio.js';
import { LINES } from './trailer-vo.mjs';

const SR = 48000;
const LEN = 69.0;             // seconds; the edit is 68s and wants a tail
const WITH_VO = !process.argv.includes('--no-vo');

const semi = (n, root) => root * Math.pow(2, n / 12);

/* Web Audio's two ramp shapes, sampled. Everything in `_pluck` is a linear
   ramp up to a peak followed by an exponential ramp down to 0.0001, so one
   function covers every voice in the game. */
function amp(u, atk, peak, dur) {
  if (u < 0 || u >= dur) return 0;
  if (u < atk) return peak * (u / atk);
  return peak * Math.pow(0.0001 / peak, (u - atk) / (dur - atk));
}

/* A deterministic noise source. Math.random would make every render of the
   trailer a different take, and a trailer that cannot be re-rendered
   identically cannot be re-cut. */
let seed = 0x9e3779b9;
function rnd() {
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >> 17;
  seed ^= seed << 5; seed >>>= 0;
  return (seed / 0xffffffff) * 2 - 1;
}

const tri = (ph) => (2 / Math.PI) * Math.asin(Math.sin(ph));
const sqr = (ph) => (Math.sin(ph) >= 0 ? 1 : -1);

/* A one-pole lowpass coefficient. Used everywhere below; the filter itself is
   always `y += a * (x - y)`, which is the same shape as the BiquadFilterNode
   sweeps in audio.js at a twelfth of the arithmetic. */
const pole = (fc) => 1 - Math.exp(-2 * Math.PI * Math.min(fc, SR * 0.45) / SR);

const buf = new Float64Array(Math.ceil(LEN * SR) + SR);

/** Mix a voice in. fn(u, i) is called once per sample, u in seconds. */
function add(t, dur, fn) {
  const i0 = Math.max(0, Math.round(t * SR));
  const i1 = Math.min(buf.length, Math.round((t + dur) * SR));
  for (let i = i0; i < i1; i++) buf[i] += fn((i - i0) / SR, i);
}

/* ------------------------------------------------------- the game's voices --
   Each of these is the same node graph `_pluck` builds, unrolled. The gains,
   the ramp times and the filter sweeps are the numbers from audio.js. */

function drone(t, freq, gain) {
  let ph = 0;
  const d = 2 * Math.PI * freq / SR;
  add(t, 8.1, (u) => { ph += d; return Math.sin(ph) * amp(u, 0.6, gain, 8); });
}

/* A pitch-swept sine for the skin and a noise burst for the stick. */
function taiko(t, gain = 0.30) {
  let ph = 0;
  add(t, 0.55, (u) => {
    const f = u < 0.24 ? 128 * Math.pow(46 / 128, u / 0.24) : 46;
    ph += 2 * Math.PI * f / SR;
    const skin = Math.sin(ph) * amp(u, 0.01, gain, 0.5);
    const stick = rnd() * amp(u, 0.002, gain * 0.35, 0.05);
    return skin + stick;
  });
}

function bass(t, freq, beat) {
  let ph = 0, lp = 0;
  const a = pole(900);
  add(t, beat, (u) => {
    ph += 2 * Math.PI * freq / SR;
    lp += a * (sqr(ph) - lp);
    return lp * amp(u, 0.012, 0.13, beat * 0.85);
  });
}

/* Half a step late on purpose — see the comment on `M.snare` in audio.js. */
function snare(t, beat) {
  let hp = 0;
  const a = pole(1800);
  add(t + beat * 0.5, 0.16, (u) => {
    const x = rnd();
    hp += a * (x - hp);
    return (x - hp) * amp(u, 0.005, 0.13, 0.13);
  });
}

/* Two detuned triangles through a lowpass that CLOSES as the note decays —
   the sweep is what reads as "plucked" rather than "beeped". */
function pluck(t, freq, fifths) {
  let p1 = 0, p2 = 0, p5 = 0, lp = 0;
  const d1 = 2 * Math.PI * freq * Math.pow(2, -5 / 1200) / SR;
  const d2 = 2 * Math.PI * freq * Math.pow(2, 6 / 1200) / SR;
  const d5 = 2 * Math.PI * freq * 1.4983 / SR;
  const open = freq * 7;
  const shut = Math.max(200, freq * 1.6);
  add(t, 2.0, (u) => {
    p1 += d1; p2 += d2; p5 += d5;
    let x = tri(p1) + tri(p2);
    if (fifths && u < 1.4) x += tri(p5);
    const fc = u < 0.9 ? open * Math.pow(shut / open, u / 0.9) : shut;
    lp += pole(fc) * (x - lp);
    return lp * amp(u, 0.012, 0.16, 1.8);
  });
}

/* Glass. Frost and the Dojo only. */
function bell(t, freq) {
  let ph = 0;
  const d = 2 * Math.PI * freq * 4 / SR;
  add(t, 2.7, (u) => { ph += d; return Math.sin(ph) * amp(u, 0.02, 0.035, 2.6); });
}

/* ------------------------------------------------------------ the pieces --
   `_pluck`, step by step, for `secs` seconds of the named MUSIC entry. The
   rest hash and the octave choice are copied exactly: change either and the
   trailer stops being the tune the game plays. */
function play(mode, at, secs, gain = 1) {
  const M = MUSIC[mode];
  if (!M) throw new Error('no such piece: ' + mode);
  const root = M.root ?? ROOT;
  for (let step = 0; step * M.beat < secs; step++) {
    const t = at + step * M.beat;
    const bar = Math.floor(step / 8);

    if (step % 16 === 0) drone(t, (root * M.oct) / 2, M.drone * gain);
    if (M.taiko && step % M.taiko === 0) taiko(t, 0.30 * gain);
    if (M.bass && step % M.bass === 0) {
      bass(t, semi(M.scale[Math.floor((step / M.bass) * 1.6) % 5], root / 2), M.beat);
    }
    if (M.snare && step % M.snare === 0) snare(t, M.beat);

    const r = Math.sin(step * 12.9898 + bar * 78.233) * 43758.5453;
    const u = r - Math.floor(r);
    if (u > (M.rest ?? 0.72)) continue;

    const octave = u > 0.55 ? 12 : u > 0.2 ? 0 : 24;
    const freq = semi(M.scale[Math.floor(u * 5 * 3) % 5] + octave, root * M.oct);
    pluck(t, freq, !!M.fifths);
    if (M.bell) bell(t, freq);
  }
}

/* ---------------------------------------------------- the trailer orchestra --
   NONE of this is in the game and none of it should be. Everything here is
   tuned to a root taken from MUSIC, so the horns are in the same key as the
   koto they are playing under. */

/**
 * Horns. Five saws detuned in cents through a two-pole lowpass that OPENS over
 * the first 90ms, which is the entire difference between a horn section and a
 * buzzer — a static filter on a saw stack sounds like a synth preset. The
 * pitch scoop at the start is the other half: brass players do not begin a
 * note in tune and a sample that does sounds fake.
 */
function brass(t, freq, dur, gain = 1) {
  const DET = [-14, -7, 0, 7, 14];
  const ph = [0, 0, 0, 0, 0];
  let sub = 0, lp = 0, lp2 = 0;
  add(t, dur + 0.4, (u) => {
    const bend = 1 - 0.035 * Math.exp(-u / 0.045);
    let x = 0;
    for (let i = 0; i < 5; i++) {
      ph[i] += freq * Math.pow(2, DET[i] / 1200) * bend / SR;
      if (ph[i] >= 1) ph[i] -= 1;
      x += 2 * ph[i] - 1;
    }
    x /= 5;
    sub += freq * 0.5 * bend / SR; if (sub >= 1) sub -= 1;
    x += (2 * sub - 1) * 0.5;

    const a = pole(freq * (2 + 7 * Math.min(1, u / 0.09)));
    lp += a * (x - lp);
    lp2 += a * (lp - lp2);
    return Math.tanh(lp2 * amp(u, 0.055, 0.34 * gain, dur) * 3.2) * 0.42;
  });
}

/** A chord of horns. Degrees are semitones from `root`. */
function chord(t, root, degs, dur, gain = 1) {
  for (const d of degs) brass(t, semi(d, root), dur, gain);
}

/**
 * The trailer horn — root, fifth, octave and twelfth over a sine sub, all
 * saturated together. Used exactly four times: the arena, the Cross Slash, and
 * the title card. A braam that happens six times is a texture, not an event.
 */
function braam(t, root, dur, gain = 1) {
  const PARTS = [1, 1.5, 2, 2.9966];
  const ph = [0, 0, 0, 0];
  let sub = 0, lp = 0, lp2 = 0;
  add(t, dur + 0.8, (u) => {
    let x = 0;
    for (let i = 0; i < PARTS.length; i++) {
      /* Each partial drifts a few cents against the others. A perfectly tuned
         stack phase-locks and thins out; the beating IS the sound. */
      const det = 1 + (i - 1.5) * 0.0016;
      ph[i] += root * PARTS[i] * det / SR; if (ph[i] >= 1) ph[i] -= 1;
      x += (2 * ph[i] - 1) * (i === 0 ? 1 : 0.7 / i);
    }
    sub += root * 0.5 / SR; if (sub >= 1) sub -= 1;
    x += Math.sin(2 * Math.PI * sub) * 1.1;

    const a = pole(root * (3 + 9 * Math.min(1, u / 0.35)));
    lp += a * (x - lp);
    lp2 += a * (lp - lp2);
    return Math.tanh(lp2 * amp(u, 0.22, 0.5 * gain, dur) * 2.4) * 0.5;
  });
}

/** Timpani: a sine whose pitch collapses in 50ms, with a stick on the front. */
function timp(t, freq, gain = 0.45) {
  let ph = 0;
  add(t, 1.7, (u) => {
    ph += freq * (1 + 0.7 * Math.exp(-u / 0.05)) / SR; if (ph >= 1) ph -= 1;
    return Math.sin(2 * Math.PI * ph) * amp(u, 0.004, gain, 1.5)
      + rnd() * amp(u, 0.001, gain * 0.25, 0.03);
  });
}

/** The game's taiko with a sub under it. The game does not need the sub. */
function bigTaiko(t, gain = 0.5) {
  taiko(t, gain);
  let ph = 0;
  add(t, 0.95, (u) => {
    ph += 55 * Math.pow(0.62, u / 0.3) / SR; if (ph >= 1) ph -= 1;
    return Math.sin(2 * Math.PI * ph) * amp(u, 0.006, gain * 0.5, 0.9);
  });
}

/** One note of the driving ostinato: three saws, staccato, filter closing. */
function stab(t, freq, len, gain = 1) {
  const ph = [0, 0, 0];
  let lp = 0;
  add(t, len * 1.1, (u) => {
    let x = 0;
    for (let i = 0; i < 3; i++) {
      ph[i] += freq * Math.pow(2, (i - 1) * 9 / 1200) / SR; if (ph[i] >= 1) ph[i] -= 1;
      x += 2 * ph[i] - 1;
    }
    lp += pole(freq * (6 - 3.4 * Math.min(1, u / (len * 0.6)))) * (x / 3 - lp);
    return lp * amp(u, 0.006, 0.13 * gain, len * 0.92);
  });
}

/**
 * The ostinato. Degrees into the piece's own scale, so it is playing the same
 * five notes the koto is — this is what stops the orchestra sounding bolted on.
 * `div` splits the piece's beat: 1 for eighths, 2 for the sixteenths in the
 * last push.
 */
function ostinato(mode, at, secs, div, gain = 1) {
  const M = MUSIC[mode];
  const root = M.root ?? ROOT;
  const step = M.beat / div;
  const PAT = [0, 2, 4, 2, 1, 2, 4, 3];
  for (let i = 0; step * i < secs; i++) {
    const oct = (i % 16) >= 8 ? 12 : 0;
    stab(at + i * step, semi(M.scale[PAT[i % 8]] + oct, root), step, gain);
  }
}

/** Voices: four detuned saws with a slow vibrato, band-limited to a formant. */
function choir(t, freq, dur, gain = 1) {
  const DET = [-11, -4, 5, 12];
  const ph = [0, 0, 0, 0];
  let lp = 0, hp = 0;
  const a = pole(1500);
  const b = pole(220);
  add(t, dur + 0.7, (u) => {
    const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5.2 * u);
    let x = 0;
    for (let i = 0; i < 4; i++) {
      ph[i] += freq * Math.pow(2, DET[i] / 1200) * vib / SR; if (ph[i] >= 1) ph[i] -= 1;
      x += 2 * ph[i] - 1;
    }
    lp += a * (x / 4 - lp);
    hp += b * (lp - hp);
    return (lp - hp) * amp(u, 0.55, 0.12 * gain, dur);
  });
}

/** A crash. */
function cym(t, dur, gain = 0.25) {
  let hp = 0;
  const a = pole(6000);
  add(t, dur, (u) => {
    const x = rnd();
    hp += a * (x - hp);
    return (x - hp) * amp(u, 0.002, gain, dur * 0.95);
  });
}

/** A crash played backwards: it ARRIVES at `t + dur`. Put the hit there. */
function revCym(t, dur, gain = 0.3) {
  let hp = 0;
  const a = pole(5000);
  add(t, dur, (u) => {
    const x = rnd();
    hp += a * (x - hp);
    const k = u / dur;
    return (x - hp) * gain * k * k * k;
  });
}

/** A sine sliding between two pitches. The floor arriving, or falling away. */
function subDrop(t, f0, f1, dur, gain = 0.4) {
  let ph = 0;
  add(t, dur, (u) => {
    ph += f0 * Math.pow(f1 / f0, u / dur) / SR; if (ph >= 1) ph -= 1;
    return Math.sin(2 * Math.PI * ph) * amp(u, 0.02, gain, dur * 0.95);
  });
}

/* A rising filtered noise sweep into a downbeat. NOT a game sound: the game
   never has to tell you something is about to happen, and a trailer does. */
function riser(t, dur, gain = 0.45) {
  let lp = 0;
  add(t, dur, (u) => {
    const k = u / dur;
    lp += pole(300 * Math.pow(24, k)) * (rnd() - lp);
    /* Kept well under the orchestra. At 0.9 the riser was the loudest thing in
       the render by a factor of five, so the normalise pass turned the whole
       score down to fit it and the arena lost its punch. A riser is a hand on
       your shoulder, not a shout. */
    return lp * gain * k * k;
  });
}

/* ---------------------------------------------------------- arrangement --
   Twelve five-second shots and an eight-second title card. The koto pieces are
   chosen to match what is on screen; the orchestra is what makes it a trailer.

   The one real structural move is the DROP-OUT at 25s. The Dojo theme is the
   quietest thing in the game because there is a maths lesson on screen there —
   so the horns stop too, for fifteen seconds, and the arena hits when it comes
   back. Everything before 25s is a build and everything after 40s is a wall.

   Roots come from MUSIC: flight is D, the arena is F, dusk is E. The title
   card dropping F to E is a semitone down at the end, which is why it lands
   like an ending rather than another chorus. */

/* -- 0-10  the world: shots 01 islands, 02 the kitten on the cliff -------- */
play('intro', 0.0, 10.4);
subDrop(0.0, 70, 36.7, 3.2, 0.30);        // the ground arriving under the islands
bigTaiko(0.0, 0.42);
bigTaiko(5.0, 0.36);
choir(1.2, ROOT, 7.2, 0.7);
revCym(7.6, 2.4, 0.26);                   // arrives on the cut to the mischief

/* -- 10-25  the build: 03 mischief, 04 the pets, 05 the dragon ----------- */
play('flight', 10.0, 15.4);
ostinato('flight', 10.0, 15.0, 1, 0.75);
for (let b = 0; b < 6; b++) {
  const t = 10.0 + b * 2.5;
  /* Alternating root and fifth voicings, getting louder every bar. Six bars is
     the whole build; a seventh and the arena has nowhere left to go. */
  chord(t, MUSIC.flight.root, b % 2 ? [7, 12, 19] : [0, 7, 12], 1.1, 0.82 + b * 0.035);
  bigTaiko(t, 0.5);
  if (b) timp(t - 1.25, MUSIC.flight.root / 2, 0.3);
}
cym(10.0, 2.0, 0.22);
cym(20.0, 2.2, 0.24);

/* -- 25-40  the drop-out: 06 the turning circle, 07 the orb, 12 the eight -- */
play('dojo', 25.0, 14.6, 0.75);
choir(25.2, MUSIC.dojo.root, 6.2, 0.42);
choir(31.4, semi(7, MUSIC.dojo.root), 5.0, 0.38);
/* From 35 — the eight orbs — the floor starts coming back under it. */
ostinato('dojo', 35.0, 4.6, 2, 0.35);
timp(35.0, 55, 0.34);
timp(37.5, 55, 0.38);
revCym(37.2, 2.8, 0.30);
riser(37.6, 2.4, 0.42);

/* -- 40-50  the arena: 08 four in the ring, 09 Mr. Satan ------------------ */
braam(40.0, MUSIC.arena.root / 2, 2.6, 1.0);
play('arena', 40.0, 20.4);
ostinato('arena', 40.0, 10.2, 1, 0.8);
cym(40.0, 2.6, 0.30);
/* The chords are two seconds long against a 2.5s spacing, so they overlap
   into a pad. Short stabs here left holes between the hits and the section
   read as a drum loop with horns on it rather than as a wall. */
for (let b = 0; b < 4; b++) {
  const t = 40.0 + b * 2.5;
  chord(t, MUSIC.arena.root, [0, 7, 12], 2.0, 0.95);
  bigTaiko(t, 0.55);
  bigTaiko(t + 1.25, 0.30);
}
choir(40.2, MUSIC.arena.root, 9.4, 0.75);

/* -- 50  the Cross Slash lands ------------------------------------------- */
/* Nothing is playing here except this. The ostinato deliberately stops at
   50.2 and does not resume until 51, which is a tenth of a second of near
   silence and is the loudest thing in the trailer. */
braam(50.0, MUSIC.arena.root / 2, 2.2, 1.15);
timp(50.0, 49, 0.55);
cym(50.0, 3.2, 0.34);
subDrop(50.0, 110, 32, 2.4, 0.42);

/* -- 51-60  the last push: 10 the slash settling, 11 the four leaders ----- */
ostinato('arena', 51.0, 9.0, 2, 0.68);    // sixteenths now, not eighths
for (let b = 0; b < 4; b++) {
  const t = 51.0 + b * 2.25;
  chord(t, MUSIC.arena.root, b % 2 ? [12, 19, 24] : [0, 12, 19], 1.8, 1.0);
  bigTaiko(t, 0.5);
  bigTaiko(t + 1.125, 0.34);
}
choir(51.2, semi(12, MUSIC.arena.root), 8.4, 0.8);
riser(58.3, 1.7, 0.5);

/* -- 60-68  the title card ------------------------------------------------ */
braam(60.0, MUSIC.dusk.root / 2, 3.6, 1.2);
play('dusk', 60.0, 8.6, 0.85);
drone(60.0, (MUSIC.dusk.root * MUSIC.dusk.oct) / 2, 0.26);
chord(60.0, MUSIC.dusk.root, [0, 7, 12], 3.2, 1.0);
choir(60.3, MUSIC.dusk.root, 7.0, 1.05);
bigTaiko(60.0, 0.62);
cym(60.0, 4.2, 0.32);
/* A SECOND CHORD AT 62.5. With only the one at 60 the title card measured
   -13dB on the hit and -24dB two seconds later, so the biggest moment in the
   trailer deflated while the logo was still on screen. The card holds for
   eight seconds and the music has to hold with it. */
chord(62.5, MUSIC.dusk.root, [0, 7, 12], 3.0, 0.9);
bigTaiko(62.5, 0.46);
timp(62.5, 41, 0.34);
bigTaiko(65.0, 0.34);

/* -------------------------------------------------------- the master ride --
   THE ARRANGEMENT ALONE DID NOT PRODUCE AN ARC. Rendered without this, every
   section of the trailer measured between -18 and -21 dB RMS: the fifteen
   quiet seconds at the Dojo came out exactly as loud as the arena, because
   normalising to peak means the loudest HIT sets the level and a dense section
   and a sparse one land in the same place. Density is not dynamics.
   Measured per second with a throwaway RMS plot, which is the only reason it
   was caught — it is not audible as "wrong", it is audible as "flat".

   So the music gets a fader ride, the way a real trailer mix does. Breakpoints
   in seconds, linearly interpolated, applied to the MUSIC ONLY — the voice
   sits on top of this so that Mr. Satan is at a constant level while the world
   rises and falls behind him.

   The one number that matters is 0.40 at 25s: an 8dB drop into the Dojo. It
   was 0.30 first, which measured -17dB against the build and is too far —
   there are two seconds between Mr. Satan's Dojo line and his sine/cosine line
   with nothing over it, and at 0.30 that gap reads as the audio having failed
   rather than as a pause. The Dojo theme is supposed to be quiet, not absent;
   audio.js says as much where it defines it. */
const RIDE = [
  [0.0, 0.50], [8.0, 0.58], [9.9, 0.70],   // the world, held back on purpose
  [10.0, 0.76], [22.0, 0.95], [24.8, 0.98], // fifteen seconds of build
  [25.0, 0.40], [34.0, 0.40],               // the drop-out. The lesson.
  [35.0, 0.45], [38.0, 0.64], [39.9, 0.95], // the eight orbs, and the riser
  [40.0, 1.00], [68.0, 1.00],               // and it never comes down again
];

function ride(t) {
  for (let i = 1; i < RIDE.length; i++) {
    if (t <= RIDE[i][0]) {
      const [t0, g0] = RIDE[i - 1];
      const [t1, g1] = RIDE[i];
      return g0 + (g1 - g0) * ((t - t0) / (t1 - t0 || 1));
    }
  }
  return RIDE[RIDE.length - 1][1];
}

for (let i = 0; i < buf.length; i++) buf[i] *= ride(i / SR);

/* --------------------------------------------------------- the narration --
   Mr. Satan, generated through Higgsfield's ElevenLabs route. The lines and
   their times live in tools/trailer-vo.mjs so there is one clock, not two. */

const voice = new Float64Array(buf.length);
const duck = new Float64Array(buf.length).fill(1);

/** Mono 16-bit 48kHz WAV in, Float64 out. That is what the VO step writes. */
function readVoiceWav(file) {
  const b = readFileSync(file);
  let p = 12;
  let data = null;
  let ch = 0, sr = 0, bits = 0;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4);
    const len = b.readUInt32LE(p + 4);
    if (id === 'fmt ') { ch = b.readUInt16LE(p + 10); sr = b.readUInt32LE(p + 12); bits = b.readUInt16LE(p + 22); }
    if (id === 'data') data = b.subarray(p + 8, p + 8 + len);
    p += 8 + len + (len & 1);
  }
  if (!data) throw new Error(file + ': no data chunk');
  if (ch !== 1 || sr !== SR || bits !== 16) throw new Error(`${file}: want mono 16-bit ${SR}Hz, got ${ch}ch ${bits}b ${sr}Hz`);
  const n = data.length >> 1;
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = data.readInt16LE(i * 2) / 32768;
  return x;
}

/**
 * Pull the music down under a line and let it back up afterwards.
 *
 * The ramp DOWN is fast and the ramp UP is slow, which is what a compressor
 * does and what an ear expects: music that jumps back the instant a word ends
 * pumps audibly, and the pump is more distracting than the music was.
 */
function applyDuck(s, e, d) {
  const ATK = 0.12;
  const REL = 0.38;
  const lo = 1 - d;
  const i0 = Math.max(0, Math.round((s - ATK) * SR));
  const i1 = Math.min(duck.length, Math.round((e + REL) * SR));
  for (let i = i0; i < i1; i++) {
    const t = i / SR;
    const v = t < s ? 1 + (lo - 1) * ((t - (s - ATK)) / ATK)
      : t <= e ? lo
        : lo + (1 - lo) * ((t - e) / REL);
    if (v < duck[i]) duck[i] = v;
  }
}

let spoken = 0;
if (WITH_VO) {
  for (const l of LINES) {
    const file = `out/trailer/vo/${String(l.id).padStart(2, '0')}.wav`;
    if (!existsSync(file)) {
      console.error(`  ! no take for line ${l.id} (${file}) — skipping`);
      continue;
    }
    const x = readVoiceWav(file);

    /* TRIM THE LEAD-IN. The engine returns 80-150ms of near-silence in front
       of most takes, and `at` in trailer-vo.mjs is when the WORD should land,
       not when the file should start. Left in, every line drifts late by a
       different amount and the ones that are meant to hit on a cut miss it. */
    const GATE = 0.0025;
    let a = 0;
    let b = x.length - 1;
    while (a < x.length && Math.abs(x[a]) < GATE) a++;
    while (b > a && Math.abs(x[b]) < GATE) b--;
    a = Math.max(0, a - Math.round(0.02 * SR));   // keep a breath of air
    b = Math.min(x.length - 1, b + Math.round(0.05 * SR));

    let peak = 0;
    for (let i = a; i <= b; i++) peak = Math.max(peak, Math.abs(x[i]));
    /* Every take to the same peak. The engine's own level wanders by several
       dB between lines and a narrator whose volume changes per sentence sounds
       like a fault, not a performance. */
    const g = peak > 0 ? 0.8 / peak : 0;

    const at = Math.round(l.at * SR);
    let lp = 0;
    const pres = pole(2600);
    for (let i = a; i <= b; i++) {
      const j = at + (i - a);
      if (j >= voice.length) break;
      const s = x[i] * g;
      /* A presence lift: subtract the lows from a copy and add it back. Under
         horns and a taiko a flat voice disappears, and reaching for volume
         instead just makes it loud AND buried. */
      lp += pres * (s - lp);
      voice[j] += s + (s - lp) * 0.35;
    }
    applyDuck(l.at, l.at + (b - a) / SR, l.duck);
    spoken++;
  }
}

/* ------------------------------------------------------------- mixdown ---
   Music and voice are normalised SEPARATELY and then summed, so the balance
   between them is a decision in this file rather than an accident of whichever
   happened to peak higher. The sum is soft-clipped, which also glues it. */
let mPeak = 0;
for (let i = 0; i < buf.length; i++) mPeak = Math.max(mPeak, Math.abs(buf[i]));
const mg = mPeak > 0 ? 0.70 / mPeak : 1;

let vPeak = 0;
for (let i = 0; i < voice.length; i++) vPeak = Math.max(vPeak, Math.abs(voice[i]));
const vg = vPeak > 0 ? 0.62 / vPeak : 0;

const n = Math.round(LEN * SR);
const haas = Math.round(0.013 * SR);
const L = new Float64Array(n);
const R = new Float64Array(n);

for (let i = 0; i < n; i++) {
  const t = i / SR;
  const fade = t > LEN - 2.5 ? Math.max(0, (LEN - t) / 2.5) : (t < 0.4 ? t / 0.4 : 1);
  const m = buf[i] * mg * duck[i];
  const k = Math.max(0, i - haas);
  const mR = buf[k] * mg * duck[k] * 0.72 + m * 0.28;
  /* The voice is NOT widened. A Haas delay on a centre vocal smears the
     consonants and makes it sound like it is in another room. */
  const v = voice[i] * vg;
  L[i] = Math.tanh((m + v) * 1.05) * fade;
  R[i] = Math.tanh((mR + v) * 1.05) * fade;
}

let oPeak = 0;
for (let i = 0; i < n; i++) oPeak = Math.max(oPeak, Math.abs(L[i]), Math.abs(R[i]));
const og = oPeak > 0 ? Math.pow(10, -1.0 / 20) / oPeak : 1;

const out = Buffer.alloc(44 + n * 4);
out.write('RIFF', 0); out.writeUInt32LE(36 + n * 4, 4); out.write('WAVE', 8);
out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20);
out.writeUInt16LE(2, 22); out.writeUInt32LE(SR, 24);
out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34);
out.write('data', 36); out.writeUInt32LE(n * 4, 40);

const clip = (v) => Math.max(-32767, Math.min(32767, Math.round(v * 32767)));
for (let i = 0; i < n; i++) {
  out.writeInt16LE(clip(L[i] * og), 44 + i * 4);
  out.writeInt16LE(clip(R[i] * og), 46 + i * 4);
}

const dest = process.argv[2] ?? 'out/trailer/score.wav';
writeFileSync(dest, out);
console.log(
  `${dest}  ${LEN}s  music peak ${mPeak.toFixed(2)}  ` +
  `${WITH_VO ? `${spoken}/${LINES.length} lines` : 'no vo'}  -> -1.0dBFS`,
);
