#!/usr/bin/env node
/**
 * THE ISLAND JUKEBOX'S RECORDINGS — from the raw takes to what the game plays.
 *
 *   node tools/capture/jukebox-music.mjs           measure, arrange, write it all
 *   node tools/capture/jukebox-music.mjs --dry     measure and print; write nothing
 *
 * The takes are ElevenLabs Music v2.5, one per track in housing/jukebox.js
 * (whose `prompt` is what each was asked for — pre-authorised for Custom
 * Housing, Oct 2026). Raw files live in `music-takes/jukebox/<id>.mp3` so this
 * can be re-run; `JUKEBOX` there is the list, so a track with no take is
 * simply left out and keeps its procedural fallback.
 *
 * ARRANGED OFFLINE, NOT LOOPED AT RUNTIME. The first version copied each take
 * as it came and gave the player a loop region [A, B] to jump around — the
 * boss music's way, and wrong for these. Richard, Oct 2026: Moss Garden "is
 * loopable, but we should make it loop between the 27s and 55s mark (before
 * the final pluck) 2 or 3 times before reaching the end and looping it all
 * over again"; Matsuri Night "does not loop at the end, I suggest fading out
 * towards the end and looping it all over again after 1-2s of silence";
 * Tatami Lo-fi "does loop correctly, so ... we don't need to do any
 * splicing"; Turtle Beach had "a very slight looping error". A runtime loop
 * region can say none of that — it never plays the ending, and every seam is
 * a 25ms crossfade wherever the beat grid guessed. So each track is now
 * RENDERED here as a whole piece:
 *
 *   intro → the loop region `passes` more times → the ending (its own, or a
 *   fade if the take was cut off mid-bar) → `gap` seconds of silence
 *
 * and the game loops the WHOLE FILE, whose only runtime seam is silence into
 * the intro. Every join inside it is crossfaded here over 40ms, after the
 * band alignment AND a sample-level refine (`refineSeam`) — a seam a couple
 * of milliseconds off in the waveform is invisible to the 1ms-hop band
 * search and audible on a sustained bass note.
 *
 * THE 60s TAKES WERE A CHOICE, NOT A RULE. All six were asked for at exactly
 * a minute, and four of them (Turtle Beach, Matsuri Night, Kitten 8-Bit,
 * Sunset Shamisen) are still playing at 60.0s — measured: their last half
 * second is as loud as their middle. Richard: "We shouldn't force a strict 1
 * min rule". A new take should be asked for at the length the piece wants
 * (2-3 minutes is fine) WITH "a clear, complete ending" in the prompt, and
 * then needs only `{ passes: 0, ending: 'own' }` here. See
 * docs/notes/housing.md, "The jukebox".
 *
 * WRITES public/music/<id>.mp3 (the arrangement) and
 * src/systems/housing/jukeboxfiles.js. Generated: do not edit it by hand.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { measure } from './music-beats.mjs';
import { SR, decodeStereo, beatFeatures, findLoop, bandOnsets, seamLag, seamCut, rmsOf, sim, encoderDelay, encode } from './music-loop.mjs';
import { JUKEBOX } from '../../src/systems/housing/jukebox.js';

const ROOT = new URL('../../', import.meta.url);
const P = (rel) => fileURLToPath(new URL(rel, ROOT));
const RAW = 'tools/capture/music-takes/jukebox/';
/** The procedural pieces' level — the same target shadow-music.mjs uses. */
const TARGET_RMS = 0.050;
/** Generation ids, so a take can be found again in the ElevenLabs flow (LRBTaBnKWB4SFA1bf00O). */
const GEN = {
  homeSurf: 'UlhLAZmaw21kO5rXg3gR',
  homeLofi: '3Av8rFoBYAstga0olNDd',
  homeFestival: '93hgtbyRJ6FFBBQxlyr4',
  homeGarden: 'g8RoUUalOEMy5JyMHp4h',
  homeChiptune: 'U4TriowQSrbwFULdbQuA',
  homeSunset: '9Vq5ndYiki2lSoDDWkzs',
};

/**
 * HOW EACH TAKE IS ARRANGED.
 *   whole   — the take already loops end-to-start; play it as it is.
 *   at      — [A, B] in seconds, by ear (Richard's marks), snapped to the
 *             nearest beat and then seam-aligned; B null = search the last
 *             bars for the one most like A. Absent = the self-similarity
 *             search (`findLoop`), as before.
 *   passes  — how many EXTRA times the loop region plays (2 = three in all).
 *   ending  — 'own': play on from A to the end of the take (it has one).
 *             'fade': fade the last pass out over `fade` seconds instead —
 *             for a take that was cut off while still playing.
 *   gap     — silence before the whole file starts again.
 */
export const ARRANGE = {
  homeLofi: { whole: true },
  // "between the 27s and 55s mark (before the final pluck)", then the pluck
  homeGarden: { at: [27, 55], passes: 2, ending: 'own', gap: 1.2 },
  // "between the 17s mark and the ending ... fading out ... 1-2s of silence"
  homeFestival: { at: [17, null], passes: 2, ending: 'fade', fade: 5, gap: 1.5 },
  homeSurf: { passes: 2, ending: 'fade', fade: 5, gap: 1.5 },
  homeChiptune: { passes: 2, ending: 'fade', fade: 4, gap: 1.2 },
  homeSunset: { passes: 2, ending: 'fade', fade: 5, gap: 1.5 },
};
const XF = 0.040; // the crossfade at every join, seconds

/**
 * THE LAST MILLISECONDS OF A SEAM, in the waveform. `seamLag` lines the two
 * sides up to 1ms on onset envelopes; a sustained bass note is a ~60Hz wave
 * whose period is 16ms, and two copies of it 2ms apart cancel a slice of
 * themselves across a crossfade. So: ±3ms around the aligned A, the shift
 * whose 30ms BEFORE A correlates best with the 30ms before B, which is
 * exactly what the crossfade mixes.
 */
function refineSeam(mono, cutA, cutB) {
  const n = Math.round(0.03 * SR), R = Math.round(0.003 * SR);
  const iB = Math.round(cutB * SR) - n;
  let best = -Infinity, sh = 0;
  for (let d = -R; d <= R; d++) {
    const iA = Math.round(cutA * SR) + d - n;
    let ab = 0, aa = 0, bb = 0;
    for (let i = 0; i < n; i++) { const p = mono[iA + i], q = mono[iB + i]; ab += p * q; aa += p * p; bb += q * q; }
    const c = ab / Math.sqrt(aa * bb + 1e-12);
    if (c > best) { best = c; sh = d; }
  }
  return { shift: sh / SR, corr: best };
}

/** Join [from, to) segments of `st`, equal-power crossfaded over XF ENDING at each join. */
function joinSegments(st, segs) {
  const F = Math.round(XF * SR);
  const parts = segs.map(([a, b]) => [Math.round(a * SR), Math.min(st.n, Math.round(b * SR))]);
  const total = parts.reduce((s, [a, b]) => s + (b - a), 0);
  const L = new Float32Array(total), R = new Float32Array(total);
  let o = 0;
  for (const [a, b] of parts) {
    for (let i = -F; i < b - a; i++) {
      const s = a + i;
      if (o + i < 0 || s < 0 || s >= st.n) continue;
      if (i < 0) {
        if (o === 0) continue;
        const w = ((i + F) / F) * Math.PI / 2;
        L[o + i] = L[o + i] * Math.cos(w) + st.L[s] * Math.sin(w);
        R[o + i] = R[o + i] * Math.cos(w) + st.R[s] * Math.sin(w);
      } else { L[o + i] = st.L[s]; R[o + i] = st.R[s]; }
    }
    o += b - a;
  }
  return { L, R, n: total };
}

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
for (const T of JUKEBOX) {
  const src = P(`${RAW}${T.id}.mp3`);
  if (!existsSync(src)) { console.log(`${T.id}: no take in ${RAW} — stays procedural (${T.fallback})`); continue; }
  const A = ARRANGE[T.id] ?? { passes: 2, ending: 'fade', fade: 4, gap: 1.2 };
  const bpm = +(/(\d+)\s*bpm/i.exec(T.prompt)?.[1] ?? 100);
  const spb = 60 / bpm;
  const m = measure(src, [spb / 1.12, spb * 1.12]);
  const st = decodeStereo(src);
  const mono = st.L.map((v, i) => 0.5 * (v + st.R[i]));
  const dur = st.n / SR;
  const beatAt = (k) => m.firstBeat + k * m.spb;
  const beatNear = (t) => Math.round((t - m.firstBeat) / m.spb);
  let out, plan;
  if (A.whole) {
    out = joinSegments(st, [[0, dur]]);
    plan = 'the whole take, as it came — it already loops end to start';
  } else {
    const beatsEnd = Math.floor((m.soundEnd - m.firstBeat) / m.spb);
    const f = beatFeatures(mono, m.firstBeat, m.spb, beatsEnd);
    let bA, bB, tA, tB;
    if (A.at?.[1] != null) {
      /* BY EAR, TAKEN AS GIVEN. Moss Garden's beat is the least certain in
         the set (82ms of drift over the take: a rubato flute with no drums),
         so snapping "55s" to the nearest whole bar of a guessed grid put B
         at 56.0s — past the final pluck Richard was keeping it before. His
         marks go in as seconds; only the seam search moves them. */
      tA = A.at[0]; tB = A.at[1];
      bA = beatNear(tA); bB = beatNear(tB);
    } else {
      if (A.at) {
        bA = beatNear(A.at[0]);
        /* "...and the ending": B is in the LAST FOUR BARS, the bar line there
           most like A. Searched over the whole take it found a bar at 43s
           that resembles 17s better than the end does, which is a loop, but
           not the one he heard. */
        let best = -Infinity;
        for (let b = bA + 16; b <= beatsEnd - 2; b += 4) {
          if (b < beatsEnd - 18) continue;
          let s = 0, c = 0;
          for (let k = -4; k < 4; k++) if (f[bA + k] && f[b + k]) { s += sim(f, bA + k, b + k); c++; }
          if (c && s / c > best) { best = s / c; bB = b; }
        }
      } else {
        ({ A: bA, B: bB } = findLoop(f, beatsEnd).best);
      }
      tA = beatAt(bA); tB = beatAt(bB);
    }
    const seam = seamLag(bandOnsets(mono), tA, tB, m.spb);
    /* A WEAK PEAK IS NOT A LAG. Below 0.4 the eight-band correlation has no
       clear maximum and the "best" shift is noise anywhere in ±110ms — it
       moved Matsuri Night's A by 68ms on a 0.25 peak. The grid is the better
       guess then, and the waveform refine below still gets the last few ms. */
    const corr = seam.corr;
    const lag = corr >= 0.4 ? seam.lag : 0;
    const off = seamCut(mono, tA + lag, tB);
    let cutA = tA + lag + off;
    const cutB = tB + off;
    const r = refineSeam(mono, cutA, cutB);
    cutA += r.shift;
    const segs = [[0, cutB]];
    for (let k = 0; k < A.passes; k++) segs.push([cutA, cutB]);
    if (A.ending === 'own') segs.push([cutA, dur]);
    out = joinSegments(st, segs);
    out = fadeAndGap(out, A.ending === 'fade' ? A.fade : 0.02, A.gap ?? 1);
    plan = `loop beats ${bA}-${bB} (${cutA.toFixed(3)}s -> ${cutB.toFixed(3)}s, band lag ${(lag * 1000).toFixed(0)}ms corr ${corr.toFixed(2)}, `
      + `refine ${(r.shift * 1000).toFixed(1)}ms corr ${r.corr.toFixed(3)}) x${A.passes + 1}, ending ${A.ending}, gap ${A.gap}s`;
  }
  const len = out.n / SR;
  const rms = rmsOf(mono, Math.min(10, dur / 4), dur - 2);
  console.log(`${T.id}: ${plan}\n  -> ${len.toFixed(2)}s (take ${dur.toFixed(1)}s), RMS ${rms.toFixed(4)} -> mix ${(TARGET_RMS / rms).toFixed(2)}`);
  const file = `music/${T.id}.mp3`;
  let lead = 0;
  if (!dry) {
    encode(out, P(`public/${file}`));
    /* THE MP3'S PRIMING. An encoded file starts a little later than the
       samples it was made of; measured, not assumed, so the whole-file loop
       jumps from the last sample of the gap to the first sample of the intro. */
    const outMono = out.L.map((v, i) => 0.5 * (v + out.R[i]));
    lead = Math.max(0, encoderDelay(outMono, P(`public/${file}`)));
  }
  meta[T.id] = {
    file, name: T.name, level: 'home', gen: GEN[T.id] ?? null,
    spb: m.spb, first: +lead.toFixed(4),
    loop: [+lead.toFixed(4), +(lead + len).toFixed(4)],
    length: +len.toFixed(3), arranged: A.whole ? 'whole' : `x${A.passes + 1} ${A.ending}`,
    mix: +(TARGET_RMS / rms).toFixed(3),
  };
}
if (!dry) {
  writeFileSync(P('src/systems/housing/jukeboxfiles.js'), [
    '/* GENERATED by tools/capture/jukebox-music.mjs — do not edit; re-run it.',
    '   The island jukebox\'s recordings, ARRANGED offline (intro, the loop region',
    '   three times, an ending, a breath of silence) and looped as a WHOLE FILE:',
    '   `loop` is [the mp3\'s measured priming, the end of the arrangement]. `mix`',
    '   is the gain to the procedural level. A track missing here plays its',
    '   procedural fallback. */',
    `export const JUKEBOX_FILES = ${JSON.stringify(meta, null, 2)};`,
    '',
  ].join('\n').replace(/\n/g, '\r\n'));
  console.log('wrote src/systems/housing/jukeboxfiles.js');
}
