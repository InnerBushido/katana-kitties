/* ---------------------------------------------------------------------------
   THE CUTSCENE REVIEW PAGE (review.html, src/review/). Richard, Oct 2026: "I
   should just be able to record a video and upload it to the tool ... you can
   just look at the timestamps of the comments and take a snapshot there and
   know roughly where the change needs to occur in the cutscene".

   Three things here can go wrong without anything looking wrong:
   - the sync finds a line in the wrong place, and every note on it names the
     wrong word and the wrong cut;
   - a line is re-recorded and src/voicewords.json is not re-measured, so the
     page's words (and a note's) belong to the old take;
   - the page's scene table stops matching the scene's own.
   The sync is checked on SYNTHETIC speech, not on the mp3s: world-check does
   not shell out to ffmpeg, and the real recording is not in the repo. The
   real numbers (13/13 lines at 0.858–0.929, false matches up to 0.623) are
   in sync.js beside MIN_SCORE.
--------------------------------------------------------------------------- */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { SR, syncLines, fillGaps, MIN_SCORE } from '../../src/review/sync.js';
import { lineWords } from '../../src/review/scenes.js';
import { PAYNE_INTRO, INTRO_CUTS } from '../../src/systems/payneintro.js';

/* A seeded random, so this check is the same every run. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/* Something with the shape of speech: syllables 120–300ms long, each a few
   formant-ish tones under a fast envelope, with gaps. Not a voice, but it has
   what sync.js keys on — energy moving between bands on a syllable clock. */
function speech(seed, secs) {
  const r = rng(seed);
  const out = new Float32Array(Math.round(secs * SR));
  let t = 0.05;
  while (t < secs - 0.35) {
    const len = 0.12 + r() * 0.18;
    const f = [200 + r() * 700, 800 + r() * 1600, 2000 + r() * 2200];
    const a = Math.round(t * SR), n = Math.round(len * SR);
    for (let i = 0; i < n && a + i < out.length; i++) {
      const env = Math.sin(Math.PI * i / n) ** 2;
      const tt = i / SR;
      out[a + i] += env * (0.5 * Math.sin(2 * Math.PI * f[0] * tt) + 0.3 * Math.sin(2 * Math.PI * f[1] * tt) + 0.15 * Math.sin(2 * Math.PI * f[2] * tt));
    }
    t += len + (r() < 0.2 ? 0.25 + r() * 0.3 : 0.03 + r() * 0.08);
  }
  return out;
}

/* A music bed: a slow chord progression, steady, under everything. */
function music(secs) {
  const out = new Float32Array(Math.round(secs * SR));
  const chords = [[220, 277, 330], [196, 247, 294], [175, 220, 262], [165, 208, 247]];
  for (let i = 0; i < out.length; i++) {
    const c = chords[Math.floor(i / SR / 2) % 4];
    const tt = i / SR;
    out[i] = 0.12 * (Math.sin(2 * Math.PI * c[0] * tt) + Math.sin(2 * Math.PI * c[1] * tt) + Math.sin(2 * Math.PI * c[2] * tt));
  }
  return out;
}

export async function reviewChecks({ ok }) {
  console.log('\n--- the cutscene review page: its sync, its words, its scene table ---');

  /* --- the sync, on a recording whose answer is known --- */
  const lens = [3.2, 5.0, 2.4, 6.1, 4.3];
  const lines = lens.map((s, i) => ({ id: `l${i + 1}`, pcm: speech(100 + i, s) }));
  const at = [1.37, 5.42, 11.9, 15.03, 22.41];       // where each one starts in the "recording"
  const total = 28;
  const rec = music(total);
  // line 3 was RE-RECORDED after the video: the recording has a different take
  const played = lines.map((L, i) => (i === 2 ? speech(999, lens[2]) : L.pcm));
  played.forEach((p, i) => { const o = Math.round(at[i] * SR); for (let k = 0; k < p.length; k++) rec[o + k] += p[k]; });
  const got = syncLines(rec, lines);
  const err = got.map((g, i) => (g.found ? Math.abs(g.t - at[i]) : null));
  const worst = Math.max(...err.filter((e) => e != null));
  ok('the review page finds each voice line in a recording to within 20ms, under music',
    [0, 1, 3, 4].every((i) => got[i].found) && worst <= 0.02,
    got.map((g, i) => `${g.id} ${g.found ? `${(err[i] * 1000).toFixed(0)}ms @${g.score}` : 'missing'}`).join(' · '));
  ok('...and a line re-recorded since the video is reported missing, not matched to the wrong place',
    !got[2].found && got[2].score < MIN_SCORE, `${got[2].id}: found=${got[2].found}`);
  ok('...and is placed between its neighbours, inside the gap they leave',
    got[2].placed && got[2].t > got[1].t + got[1].dur - 0.01 && got[2].t + got[2].dur < got[3].t + 0.01,
    `l3 placed at ${got[2].t} (truth ${at[2]})`);
  ok('...and the anchors come out in order',
    got.every((g, i) => i === 0 || g.t > got[i - 1].t));
  const gaps = fillGaps([{ id: 'a', t: 2, found: true, dur: 2 }, { id: 'b', t: null, found: false, dur: 1 }, { id: 'c', t: 8, found: true, dur: 1 }]);
  ok('...and a gap is shared out evenly (a 4s gap with a 1s line in it: 1.5s either side)',
    gaps[1].t === 5.5 && gaps[1].placed, `b at ${gaps[1].t}`);

  /* --- the words: one table, measured off the recordings that ship --- */
  const WORDS = JSON.parse(readFileSync(new URL('../../src/voicewords.json', import.meta.url), 'utf8'));
  const stale = PAYNE_INTRO.filter((r) => {
    const f = new URL(`../../public/voice/payne/${r.voice}.mp3`, import.meta.url);
    if (!existsSync(f)) return false;    // a missing voice is payneintro.mjs's business
    return WORDS[r.voice]?.sha1 !== createHash('sha1').update(readFileSync(f)).digest('hex');
  }).map((r) => r.voice);
  ok('src/voicewords.json was measured off every intro line as it is NOW (re-record one: python tools/capture/voice-words.py payne_intro)',
    stale.length === 0, stale.join(' ') || `${PAYNE_INTRO.length} lines`);
  /* Whisper's words are not the script's: on line 6 it split "Word-spirits"
     and made "they're" two words (18 heard, 16 written), and on line 11 it
     dropped the opening "And" (12 heard, 13 written). The first version of
     this check asked for equal counts and failed on exactly those two, which
     is why lineWords aligns by letters. What has to hold is that every word
     of the SCRIPT gets a time, in order, inside the recording. */
  const bad = PAYNE_INTRO.filter((r) => {
    const said = r.text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
    const lw = lineWords(r.text, WORDS[r.voice]);
    return lw.length !== said || lw.some((w, i) => w.b < w.a || (i && w.a < lw[i - 1].a - 1e-9) || w.b > WORDS[r.voice].dur + 0.05);
  }).map((r) => r.voice);
  ok('...and every word of every line\'s SCRIPT gets a time, in order, inside its recording',
    bad.length === 0, bad.join(' ') || 'all 13');
  /* ...and the letter alignment lands where a person measured: line 6 is one
     of the two whose counts disagree, and its "Run" cue was set by ear. */
  const run = lineWords(PAYNE_INTRO[5].text, WORDS.payne_intro_6).find((w) => /^run/i.test(w.w));
  const runCue = PAYNE_INTRO[5].act.find(([c]) => c === 'count')[1];
  ok('...and on a line whisper heard differently (line 6), "Run" still lands on its hand-measured cue',
    run && Math.abs(run.a - runCue) <= 0.15, run ? `"Run" at ${run.a}, cue ${runCue}` : 'no "Run"');
  /* Whisper folds a pause into the word after it, which put line 11's
     "Second" at 2.60 — in the silence, 0.86s before it is said.
     voice-words.py moves a start past a quiet run of 0.12s inside the word;
     the first rule (quiet IN FRONT of the word only) left it at 2.60. */
  const l11 = lineWords(PAYNE_INTRO[10].text, WORDS.payne_intro_11);
  const second = l11.find((w) => /^\W*second/i.test(w.w));
  const thumb = PAYNE_INTRO[10].act.find(([c]) => c === 'thumb')[1];
  ok('...and a word after a pause starts where it is SAID: line 11\'s "Second" is on its hand-measured cue',
    second && Math.abs(second.a - thumb) <= 0.05, second ? `"Second" at ${second.a}, cue ${thumb}` : 'no "Second"');

  /* --- the scene table the page draws is the scene's own --- */
  const { SCENES } = await import('../../src/review/scenes.js');
  const sc = await SCENES['payne-intro']();
  ok('the review page\'s Payne intro is the game\'s: same lines, same cuts, same cues',
    sc.lines.length === PAYNE_INTRO.length && sc.lines.every((L, i) => L.text === PAYNE_INTRO[i].text
      && L.cuts.length === INTRO_CUTS[PAYNE_INTRO[i].shot].cuts.length && L.acts.length === PAYNE_INTRO[i].act.length));

  /* --- and it is a dev page, like /tuning.html --- */
  const vite = readFileSync(new URL('../../vite.config.js', import.meta.url), 'utf8');
  ok('...and review.html is not a build input, and its routes are dev-server only',
    !/input\s*:/.test(vite) && /reviewServer/.test(vite) && /name: 'katana-review',\s*configureServer/.test(vite));
  ok('...and it serves videos only from Design Ideas/ and out/review/, never public/ (the trailer is the only shipped video)',
    /REVIEW_ROOTS = \['Design Ideas', 'out\/review'\]/.test(vite));
}
