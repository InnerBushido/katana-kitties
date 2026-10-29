#!/usr/bin/env node
/**
 * BAMBOO INFILTRATION'S SNEAKING SONGS — from the raw takes to what the game plays.
 *
 *   node tools/capture/bamboo-music.mjs        measure, arrange, write it all
 *   node tools/capture/bamboo-music.mjs --dry  measure and print; write nothing
 *
 * Four ElevenLabs Music v2.5 takes (flow LRBTaBnKWB4SFA1bf00O, 900 credits
 * each, Oct 2026), one per kind of place a course is (`music` in
 * dream/bamboocourses.js): forest, village, castle, shadow. Raw files in
 * `music-takes/bamboo/<id>.mp3`; a take that is not there is left out, and
 * the course plays the simulator's own music instead — every file degrades.
 *
 * Asked for at 90s WITH "a clear, complete ending", as housing.md says a new
 * take should be, and the jukebox's whole-file rule follows from that. Measured
 * (ffmpeg silencedetect, -45dB): forest ends in 3.72s of real silence, village
 * 1.87s, shadow 1.07s — those three play WHOLE, their own silence the breath
 * before they start again. THE CASTLE DID NOT END: its last half second is
 * -16.7dB, as loud as its middle (-18.8 at 80s). So it is arranged the way the
 * jukebox's cut-off takes are — intro, the self-similar loop region (the same
 * `findLoop` search as Shadow Lionheart's) three times, a fade, a breath —
 * and the game loops the whole file, whose only runtime seam is silence.
 *
 * VOCALS: the generations report "Instrumental: False" (the setting, not the
 * result — "lyrics: auto"). All four were run through Scribe v1 (495 credits
 * each, not the 27.5 its estimate said) and it heard NO words in any of them:
 * four empty transcripts, language confidence 0.12. A new take should be
 * checked the same way.
 *
 * WRITES public/music/<id>.mp3 and src/systems/dream/bamboomusic.js
 * (generated; bamboo.js folds it into MUSIC_FILES, as jukebox.js does).
 */
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { measure } from './music-beats.mjs';
import { SR, decodeStereo, beatFeatures, findLoop, bandOnsets, seamLag, seamCut, rmsOf, renderLong, encoderDelay, encode } from './music-loop.mjs';

const ROOT = new URL('../../', import.meta.url);
const P = (rel) => fileURLToPath(new URL(rel, ROOT));
const RAW = 'tools/capture/music-takes/bamboo/';
/** The procedural pieces' level — the same target shadow-music.mjs and jukebox-music.mjs use. */
const TARGET_RMS = 0.050;

const TAKES = [
  { id: 'bambooForest', name: 'MOONLIT BAMBOO', gen: 'EPtUtDKKQptQ0Ul4VfgM', whole: true },
  { id: 'bambooVillage', name: 'SLEEPING VILLAGE', gen: 'N6s59dQaU2P57kTkOYkj', whole: true },
  { id: 'bambooCastle', name: 'CASTLE WALLS', gen: 'pJgtf8S89x06jLV46Qlz', passes: 2, fade: 5, gap: 1.5 },
  { id: 'bambooShadow', name: 'THE SHADOW MAZE', gen: 'KQfB8kH5WZ75jjxXT6cQ', whole: true },
];

/** A cosine fade over the last `sec` seconds, then `gap` seconds of silence. */
function fadeAndGap(out, sec, gap) {
  const nf = Math.min(out.n, Math.round(sec * SR));
  for (let i = 0; i < nf; i++) {
    const k = out.n - nf + i;
    const w = 0.5 * (1 + Math.cos(Math.PI * (i / nf)));
    out.L[k] *= w; out.R[k] *= w;
  }
  const g = Math.round(gap * SR);
  const L = new Float32Array(out.n + g), R = new Float32Array(out.n + g);
  L.set(out.L); R.set(out.R);
  return { L, R, n: out.n + g };
}

const dry = process.argv.includes('--dry');
const meta = {};
mkdirSync(P('public/music'), { recursive: true });
for (const T of TAKES) {
  const src = P(`${RAW}${T.id}.mp3`);
  if (!existsSync(src)) { console.log(`${T.id}: no take in ${RAW} — the course plays the simulator's music`); continue; }
  const m = measure(src);
  const st = decodeStereo(src);
  const mono = st.L.map((v, i) => 0.5 * (v + st.R[i]));
  const dur = st.n / SR;
  const file = `music/${T.id}.mp3`;
  let len, lead = 0, plan;
  if (T.whole) {
    // As it came: the file IS the loop, so it is copied rather than re-encoded.
    len = dur;
    plan = 'the whole take — it ends in its own silence';
    if (!dry) copyFileSync(src, P(`public/${file}`));
  } else {
    const beatsEnd = Math.floor((m.soundEnd - m.firstBeat) / m.spb);
    const f = beatFeatures(mono, m.firstBeat, m.spb, beatsEnd);
    const { best } = findLoop(f, beatsEnd);
    const tA = m.firstBeat + best.A * m.spb, tB = m.firstBeat + best.B * m.spb;
    const sl = seamLag(bandOnsets(mono), tA, tB, m.spb);
    // A weak peak is not a lag (jukebox-music.mjs: below 0.4 it is noise); the grid is the better guess.
    const lag = sl.corr >= 0.4 ? sl.lag : 0;
    const off = seamCut(mono, tA + lag, tB);
    const cutA = tA + lag + off, cutB = tB + off;
    const out = fadeAndGap(renderLong(st, cutA, cutB, (best.B - best.A) * m.spb, T.passes), T.fade, T.gap);
    len = out.n / SR;
    plan = `loop beats ${best.A}-${best.B} (${cutA.toFixed(3)}s -> ${cutB.toFixed(3)}s, lag ${(lag * 1000).toFixed(0)}ms corr ${sl.corr.toFixed(2)}) x${T.passes + 1}, fade ${T.fade}s, gap ${T.gap}s`;
    if (!dry) {
      encode(out, P(`public/${file}`));
      // The mp3's priming, measured, so the whole-file loop lands on the intro's first sample.
      lead = Math.max(0, encoderDelay(out.L.map((v, i) => 0.5 * (v + out.R[i])), P(`public/${file}`)));
    }
  }
  const rms = rmsOf(mono, Math.min(10, dur / 4), dur - 4);
  console.log(`${T.id}: ${m.bpm} BPM, ${plan}\n  -> ${len.toFixed(2)}s, RMS ${rms.toFixed(4)} -> mix ${(TARGET_RMS / rms).toFixed(2)}`);
  meta[T.id] = {
    file, name: T.name, level: 'bamboo', gen: T.gen,
    spb: m.spb, first: +lead.toFixed(4),
    loop: [+lead.toFixed(4), +(lead + len).toFixed(4)],
    length: +len.toFixed(3), arranged: T.whole ? 'whole' : `x${T.passes + 1} fade`,
    mix: +(TARGET_RMS / rms).toFixed(3),
  };
}
if (!dry) {
  writeFileSync(P('src/systems/dream/bamboomusic.js'), [
    '/* GENERATED by tools/capture/bamboo-music.mjs — do not edit; re-run it.',
    '   Bamboo Infiltration\'s sneaking songs, one per kind of course, each looped',
    '   as a WHOLE FILE: `loop` is [the mp3\'s measured priming, its end]. `mix`',
    '   is the gain to the procedural level. A song missing here leaves its',
    '   courses on the simulator\'s own music. */',
    `export const BAMBOO_MUSIC = ${JSON.stringify(meta, null, 2)};`,
    '',
  ].join('\n').replace(/\n/g, '\r\n'));
  console.log('wrote src/systems/dream/bamboomusic.js');
}
