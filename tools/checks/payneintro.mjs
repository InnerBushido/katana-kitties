/* ---------------------------------------------------------------------------
   PAYNE'S INTRODUCTION TO THE WORLD — the checks that catch what still looks
   fine on screen. Run from world-check.mjs at the end, against its World.

     the script says what it was asked to say, in her approved voice's files
     she starts masked, is unmasked by "Ta-daa", and is masked again to leave
     every move plays ONCE and holds — no loop, no pingpong — and a held
     frame is what bobs
     every cue is on a word the line actually says
     every cell she is asked for was cut, on a page that exists, laid out as
     payneframes.js says, measured off the WebP (eighth non-negotiable)
     she stands IN THE WORLD on her market spot, turned to the lens, and her
     market billboard steps off for it and back on after
     every shot is finite with no world at all; the shots about her have her
     in them, head to feet, and the pointing finger is in frame
     the blast-off rises, never goes overhead, and ends in space
     the furnished island, the arena and the space sky all go back on stop
     the first hello IS the scene, seen by everybody the moment it starts
     (seventh), and a refusal says so (sixth)
     the scene plays with no sheets and no voice (ninth)
--------------------------------------------------------------------------- */
import * as THREE from 'three';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import WORDS from '../../src/voicewords.json' with { type: 'json' };
import {
  INTRO_TAKES, TAKE_FROM, INTRO_CLIPS, INTRO_FPS, INTRO_UNIT_PX, INTRO_UNIT_PX_HALF,
  clipFrames, pagePath,
} from '../../src/systems/payneclips.js';
import { INTRO_GEO, INTRO_STAGE } from '../../src/systems/payneframes.js';
import {
  PAYNE_INTRO, INTRO_CUTS, BLAST, actFrame, maskedIn, introShot, introCtx, PayneActor,
} from '../../src/systems/payneintro.js';
import { IntroSet, SPACE } from '../../src/systems/payneset.js';
import { Housing } from '../../src/systems/housing/housing.js';
import * as PN from '../../src/systems/payne.js';
import { StoryScene } from '../../src/systems/dream/storyscene.js';

const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
const pub = (p) => new URL(`../../public${p}`, import.meta.url);

/** A WebP's canvas size, off its VP8X (alpha) header, or its VP8/VP8L frame. */
function webpSize(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3), alpha: !!(buf[20] & 0x10) };
  if (kind === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff), alpha: true };
  }
  if (kind === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff, alpha: false };
  return null;
}

const fin = (p) => !!p && [p.x, p.y, p.z].every(Number.isFinite);

export async function payneIntroChecks({ ok, world }) {
  console.log('\n--- payne\'s introduction to the world ---');
  /* --- the script --- */
  ok('Payne\'s introduction is thirteen lines, payne_intro_1..13, each one her card AND her recording',
    PAYNE_INTRO.length === 13 && PAYNE_INTRO.every((r, i) => r.voice === `payne_intro_${i + 1}` && r.who === 'payne'
      && PN.PAYNE_LINES[r.voice] === r.text && existsSync(new URL(`../../public/voice/payne/${r.voice}.mp3`, import.meta.url))));
  const all = PAYNE_INTRO.map((r) => r.text).join(' ');
  /* The brief, item by item: why mischief, kotodama, the islands coming back,
     the Shinto way and bad karma, the objectives, and her mission. */
  const brief = {
    'knocking things over releases the power': /Knock it over/.test(all) && /sleeping power/.test(all),
    'that power is kotodama': /kotodama/i.test(all),
    'the islands were one world': /ONE world/.test(all),
    'the Shinto way': /Shinto/.test(all) && /spirit in every tree/.test(all),
    'look after what is alive, or bad karma': /look after them/.test(all) && /bad karma/.test(all),
    'the objectives': ['dragon stars', 'EVERYTHING', 'arena', 'home in the sky', 'clans', 'maths', 'greatest fighter'].every((w) => all.includes(w)),
    // re-worded Oct 2026: "too much order, too much monotony"
    'her mission to too much order and monotony': /too much order, too much monotony/.test(all),
  };
  const missing = Object.entries(brief).filter(([, v]) => !v).map(([k]) => k);
  ok('...and it says everything Richard asked for: why mischief, kotodama, one world, Shinto, karma, the jobs, her mission',
    missing.length === 0, missing.join(', ') || `${Object.keys(brief).length} points`);
  ok('...and no line says "Hurt" without saying what to do instead — look after them',
    PAYNE_INTRO.filter((r) => /Hurt/.test(r.text)).every((r) => /look after/.test(r.text)));
  ok('...and every row names its own cut list, and nothing else does', PAYNE_INTRO.every((r) => INTRO_CUTS[r.shot])
    && Object.keys(INTRO_CUTS).length === PAYNE_INTRO.length);

  /* --- the act: masked, unmasked, masked --- */
  const lenOf = (r) => INTRO_CUTS[r.shot].len + (r.hold ?? 0);
  const at = (r, t) => actFrame(r.act, t);
  const maskedAt = (r, t) => { const f = at(r, t); return maskedIn(f.clip, f.cell); };
  const walk = (r, dt = 0.05) => { const out = []; for (let t = 0; t <= lenOf(r); t += dt) out.push([t, at(r, t)]); return out; };
  {
    const L = PAYNE_INTRO;
    const unmaskedMid = L.slice(2, 11).every((r) => walk(r).every(([, f]) => !maskedIn(f.clip, f.cell)));
    ok('she opens MASKED, has the helmet off by the end of line 2 ("Fine."), and keeps it off through line 11',
      maskedAt(L[0], 0) && L[0].act.every(([c]) => maskedIn(c, 0)) && maskedAt(L[1], 0) && !maskedAt(L[1], lenOf(L[1])) && unmaskedMid,
      `open ${at(L[0], 0).clip} · end of 2 ${at(L[1], lenOf(L[1])).clip}:${at(L[1], lenOf(L[1])).cell}`);
    ok('...and it goes back on for her mission, done before line 12 is, and she leaves wearing it',
      !maskedAt(L[11], 0) && maskedAt(L[11], INTRO_CUTS.l12.len - 0.05) && walk(L[12]).every(([, f]) => maskedIn(f.clip, f.cell)));
    /* THE HALT TAKE IS THE NEW ONE. Richard, Oct 2026: "it shows her with the
       helmet on but you can see her face, the clip that needs to be fixed is
       payne_masked_289ff712.mp4". */
    ok('"Halt, traveller!" is the re-generated take, not payne_masked_289ff712 (helmet on, face showing), and is cut from her MASKED drawing',
      !Object.values(INTRO_TAKES).some((p) => /289ff712/.test(p)) && TAKE_FROM[INTRO_CLIPS.halt.take] === 'town'
      && Object.values(INTRO_TAKES).every((p) => existsSync(new URL(`../../${p}`, import.meta.url))),
      Object.values(INTRO_TAKES).map((p) => p.split('/').pop()).join(' '));
  }
  {
    const bad = [];
    for (const r of PAYNE_INTRO) {
      let last = -1;
      for (const [c, t0, f, t] of r.act) {
        const C = INTRO_CLIPS[c];
        if (!C) { bad.push(`${r.voice}: no clip ${c}`); continue; }
        const n = clipFrames(C).length;
        if (!(t0 > last)) bad.push(`${r.voice}: ${c} at ${t0} is not after ${last}`);
        // the half second StoryScene gives every line after its voice, and the line's own hold
        if (!(t0 < lenOf(r) + 0.5)) bad.push(`${r.voice}: ${c} at ${t0} is past the line`);
        if (f != null && !(f >= 0 && f < n && t >= 0 && t < n)) bad.push(`${r.voice}: ${c} ${f}->${t} of ${n}`);
        last = t0;
      }
      for (const [t, { clip, cell }] of walk(r)) {
        const n = clipFrames(INTRO_CLIPS[clip]).length;
        if (!(cell >= 0 && cell < n && Number.isInteger(cell))) { bad.push(`${r.voice} @${t.toFixed(2)} ${clip}:${cell}`); break; }
      }
    }
    ok('every cell any line asks for is a cell that was cut, in time order, inside the line',
      bad.length === 0, bad.slice(0, 4).join(' · ') || `${PAYNE_INTRO.reduce((s, r) => s + r.act.length, 0)} cues`);
  }
  {
    /* NO LOOP AND NO PINGPONG. Richard: "We shouldn't repeat the animations
       in a loop or ping-pong as it looks strange. It is okay if she holds
       some still frames when needed after an animation or can add some
       slight bobbing animations during dull moments". So inside one entry the
       cell only ever moves one way and then STOPS — and once it has stopped,
       `held` grows, which is what the actor bobs on. */
    /* ...EXCEPT A `back` CLIP, which he asked for later: there and home ONCE
       ("ping-pong the shrug animation at the end so that it ends at
       RestMasked like we started"). It may turn once, and only once. */
    const bad = [];
    let holds = 0;
    for (const r of PAYNE_INTRO) {
      let prev = null, dir = 0, turns = 0;
      for (const [t, f] of walk(r, 1 / (INTRO_FPS * 4))) {
        if (prev && prev.entry === f.entry) {
          const d = Math.sign(f.cell - prev.cell);
          if (d && dir && d !== dir && (!INTRO_CLIPS[f.clip].back || ++turns > 1)) { bad.push(`${r.voice} ${f.clip} turns at ${t.toFixed(2)}`); break; }
          if (d && prev.held > 0) { bad.push(`${r.voice} ${f.clip} moves again after holding, ${t.toFixed(2)}`); break; }
          if (d) dir = d;
          if (!d && f.held > prev.held) holds++;
        } else { dir = 0; turns = 0; }
        prev = f;
      }
    }
    ok('every move plays ONCE and holds its last frame — no loop, no pingpong, in any line (a `back` clip comes home once)',
      bad.length === 0 && Object.values(INTRO_CLIPS).every((c) => !('pingpong' in c) && !('loop' in c)), bad.slice(0, 3).join(' · ') || `${holds} held steps`);
  }
  {
    /* RICHARD'S FIRST REVIEW (Oct 2026, docs/reviews/payne-intro/), one check
       a note, against the WORDS as measured (src/voicewords.json), so a
       re-recorded line that moves a word fails here rather than on screen. */
    const L = PAYNE_INTRO;
    const word = (n, re) => WORDS[`payne_intro_${n}`]?.words.find(([w]) => re.test(w))?.[1];
    const C = (c) => INTRO_CLIPS[c];
    // "we should only play the bouncing laugh once" — the head's three lows are at frames 64, 70, 76
    ok('his notes: the laugh bounces ONCE (the halt take ends before its second low, frame 70)',
      C('haha').take === 'halt' && C('haha').to < 70, `haha ${C('haha').from}-${C('haha').to}`);
    // "After Haha animation, immediately go to RestMasked and hold" / "...so that it ends at RestMasked"
    const l1 = L[0].act.map(([c]) => c);
    const k = L[0].act.find(([c]) => c === 'kidding');
    const kEnd = k && at(L[0], L[0].act[l1.indexOf('kidding') + 1][1] - 0.01);
    ok('...on line 1: haha, then her masked pose, then the kidding shrug on "kidding" that comes home before the beckon',
      l1.join() === 'halt,haha,restMasked,kidding,restMasked,beckon' && C('kidding').take === 'shrug' && C('kidding').back
      && Math.abs(k[1] - word(1, /^kidding/i)) < 0.05 && kEnd.cell === 0, `kidding back to cell ${kEnd?.cell}`);
    // "This is where we should start the face reveal, after she says fine"
    let off = null;
    for (const [t, f] of walk(L[1], 0.01)) if (off == null && !maskedIn(f.clip, f.cell)) off = t;
    const fine = WORDS.payne_intro_2.words.at(-1);
    ok('...on line 2: the face comes off AFTER "Fine.", the second "Fine!" is gone, and the line holds until the unmask is done',
      /* "Fine." SOUNDS from 2.85 to 3.19 (silence-measured when the second
         one was cut); whisper ends the last word of a line at 2.88, which is
         no use. So: after its sound, and inside the line's own 3.40s. */
      off > 3.19 && off <= WORDS.payne_intro_2.dur + 0.05 && fine[1] < 3.19 && !/Fine!/.test(L[1].text) && WORDS.payne_intro_2.words.length === 10
      // ...done inside the line, which StoryScene holds half a second past `lenOf`
      && at(L[1], lenOf(L[1]) + 0.49).cell === 0 && at(L[1], lenOf(L[1]) + 0.49).held > 0,
      `off at ${off?.toFixed(2)}, "Fine." ${fine[1]}-${fine[2]}`);
    // "Let's hard transition to a talking animation here", and the wave's mouth on "Hello!"
    const w = L[2].act.find(([c]) => c === 'wave');
    ok('...on line 3: talking from the wag take on "Professional", the wave\'s mouth (0.75s in) on "Hello!", and the point after it',
      L[2].act.some(([c, t]) => c === 'wagTalk' && Math.abs(t - word(3, /^Professional/i)) < 0.05)
      && C('wagTalk').take === 'wag' && C('wagTalk').from === 0
      && Math.abs(w[1] + 0.75 - word(3, /^Hello/i)) < 0.06 && L[2].act.at(-1)[0] === L[3].act[0][0],
      `wave mouth at ${(w[1] + 0.75).toFixed(2)}, "Hello!" ${word(3, /^Hello/i)}`);
    // the point starts at the take's 1s mark, and line 4 picks it up where line 3 left it
    ok('...and "Look up." is the point take from its 1s mark, carried across the line break, not restarted',
      C('pointPose').take === 'point' && C('pointPose').from === 24 && L[3].act[0][1] < 0);
    /* "dont do a fade between them, just do a hard cut": the actor keeps no
       previous frame to fade, and draws one image per change of cell. */
    const src = read('src/systems/payneintro.js');
    const actorSrc = src.slice(src.indexOf('export class PayneActor'));
    ok('...and every change of clip is a hard cut: no crossfade left in her actor',
      !/globalAlpha|CROSSFADE|fadeT/.test(actorSrc) && !/export const CROSSFADE/.test(src));
    /* Line 12, re-worded and re-recorded: every cue is still on its word. */
    ok('line 12 is the new take, and its cues moved with it: the count on "Too much order", the helmet on "monotony"',
      Math.abs(L[11].act[1][1] - word(12, /^Too/)) < 0.05 && Math.abs(L[11].act[2][1] - word(12, /^monotony/i)) < 0.05
      && Math.abs(INTRO_CUTS.l12.len - WORDS.payne_intro_12.dur) < 0.1,
      `len ${INTRO_CUTS.l12.len}, voice ${WORDS.payne_intro_12.dur}`);
  }
  {
    const t = INTRO_CUTS.l9.len - 0.1;
    ok('...and a frame held is counted as held, so she breathes in the long still lines (line 9 is one pose)',
      at(PAYNE_INTRO[8], t).held > 1 && at(PAYNE_INTRO[8], 0.01).held >= 0, `held ${at(PAYNE_INTRO[8], t).held.toFixed(2)}s`);
  }
  {
    /* CUES ARE WORDS. Each `at` carries the word it lands on as a comment;
       the word has to be in the line, or the comment is lying about where
       the cue is (a re-recorded line is re-cued by ear off these). Read off
       the source, for both her moves and the cuts. */
    const src = read('src/systems/payneintro.js');
    const script = src.slice(src.indexOf('export const PAYNE_INTRO = ['), src.indexOf('/** Clips she is wearing'));
    const cuts = src.slice(src.indexOf('export const INTRO_CUTS = {'), src.indexOf('/** Which cut of a line'));
    const bad = [];
    let n = 0;
    const word = (c) => (c.match(/[A-Za-z][A-Za-z'-]*/) ?? [''])[0].toLowerCase();
    for (const blk of script.split(/\n\s*P\(/).slice(1)) {
      const i = Number(blk.match(/^(\d+)/)?.[1]);
      const text = PAYNE_INTRO[i - 1]?.text.toLowerCase() ?? '';
      for (const m of blk.matchAll(/[\d.]+ \/\* ([^*]+?) \*\//g)) { n++; if (!text.includes(word(m[1]))) bad.push(`${i}: "${m[1]}"`); }
    }
    for (const m of cuts.matchAll(/\n\s*l(\d+):(.*)/g)) {
      const text = PAYNE_INTRO[Number(m[1]) - 1]?.text.toLowerCase() ?? '';
      for (const c of m[2].matchAll(/[\d.]+ \/\* ([^*]+?) \*\//g)) { n++; if (!text.includes(word(c[1]))) bad.push(`cut ${m[1]}: "${c[1]}"`); }
    }
    ok('every cue names the word it is on, and that word is in the line it cues', bad.length === 0 && n >= 40,
      bad.slice(0, 4).join(' · ') || `${n} cues`);
    const cutBad = Object.entries(INTRO_CUTS).filter(([, L]) => L.cuts[0][1] !== 0
      || L.cuts.some((c, j) => j && !(c[1] > L.cuts[j - 1][1] + 0.5)) || !(L.cuts.at(-1)[1] < L.len - 0.5));
    ok('...and every line\'s cuts start at 0, run in order, and none is under half a second',
      cutBad.length === 0, cutBad.map(([k]) => k).join(' ') || `${Object.values(INTRO_CUTS).reduce((s, L) => s + L.cuts.length, 0)} cuts`);
  }

  /* --- the pages, measured --- */
  {
    const errs = [];
    let pages = 0;
    ok('payneframes.js describes exactly the clips there are, at the number of cells each is cut to',
      Object.keys(INTRO_GEO).sort().join() === Object.keys(INTRO_CLIPS).sort().join()
      && Object.entries(INTRO_CLIPS).every(([k, C]) => INTRO_GEO[k].n === clipFrames(C).length));
    for (const [tag, px] of [['full', INTRO_UNIT_PX], ['half', INTRO_UNIT_PX_HALF]]) {
      const want = new Set();
      for (const [name, G] of Object.entries(INTRO_GEO)) {
        const cw = Math.round((G.x1 - G.x0) * px), ch = Math.round((G.y1 - G.y0) * px);
        for (let k = 0; k < G.pages; k++) {
          const p = pagePath(name, k, tag === 'half');
          want.add(p.split('/').pop());
          const url = pub(p);
          if (!existsSync(url)) { errs.push(`${tag}/${name}_${k} missing`); continue; }
          pages++;
          const s = webpSize(readFileSync(url));
          const on = Math.min(G.perPage, G.n - k * G.perPage);
          const across = Math.min(G.cols, on);
          const rows = Math.ceil(on / G.cols);
          if (!s?.alpha) errs.push(`${tag}/${name}_${k} has no alpha`);
          // the crop is rounded once per cell, so a page may be a pixel a cell off
          if (s && Math.abs(s.w - across * cw) > across) errs.push(`${tag}/${name}_${k} ${s.w} wide, want ${across}x${cw}`);
          if (s && Math.abs(s.h - rows * ch) > rows) errs.push(`${tag}/${name}_${k} ${s.h} tall, want ${rows}x${ch}`);
        }
      }
      const dir = new URL(`../../public/sprites/payne/intro/${tag === 'half' ? 'half/' : ''}`, import.meta.url);
      const stale = readdirSync(dir).filter((f) => f.endsWith('.webp') && !want.has(f));
      if (stale.length) errs.push(`${tag}: stale ${stale.join(' ')}`);
    }
    ok('every page of every clip is there, full and half, with alpha, laid out as payneframes.js says — measured off the WebP — and no page is left over from an old cut',
      errs.length === 0, errs.slice(0, 4).join(' · ') || `${pages} pages`);
    ok('...and the masters stay in docs/art-masters (never shipped): nothing in public/ is a video',
      Object.values(INTRO_TAKES).every((p) => p.startsWith('docs/art-masters/'))
      && readdirSync(new URL('../../public/sprites/payne/intro/', import.meta.url)).every((f) => !/\.(mp4|webm|mov)$/.test(f)));
    /* "when she points to the sky, her hand is getting cut off ... we need to
       make sure there is room for her hand". The stage reaches as high as the
       highest cell, and the pointing cells are the ones that set it. */
    ok('the pointing take reaches above her head and the stage is tall enough to hold it',
      INTRO_GEO.pointUp.y1 > 1.2 && INTRO_STAGE.y1 >= INTRO_GEO.pointUp.y1 - 1e-4,
      `pointUp to ${INTRO_GEO.pointUp.y1} of her height, stage ${INTRO_STAGE.y1}`);
  }

  /* --- the shots --- */
  const cam = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 6000);
  const lens = (s) => {
    cam.position.set(s.pos.x, s.pos.y, s.pos.z);
    cam.lookAt(s.look.x, s.look.y, s.look.z);
    cam.updateMatrixWorld(true);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  };
  const ndc = (x, y, z) => new THREE.Vector3(x, y, z).project(cam);
  const inFrame = (v, m = 1) => v.z < 1 && Math.abs(v.x) < m && Math.abs(v.y) < m;
  const cueTimes = (L, j, fr = [0.05, 0.5, 0.95]) => {
    const a = L.cuts[j][1], b = j + 1 < L.cuts.length ? L.cuts[j + 1][1] : L.len;
    return fr.map((f) => a + (b - a) * f);
  };
  {
    const nan = [];
    for (const [n, L] of Object.entries(INTRO_CUTS)) {
      for (let cue = 0; cue <= L.len; cue += 0.25) {
        const s = introShot(n, {}, 0, cue);
        if (!fin(s.pos) || !fin(s.look) || s.loc !== 'real') nan.push(`${n}@${cue}`);
      }
    }
    ok('every cut of the introduction aims somewhere real with NO world at all — no NaN, no missing place',
      nan.length === 0, nan.slice(0, 4).join(' ') || `${Object.values(INTRO_CUTS).reduce((s, L) => s + L.cuts.length, 0)} cuts`);
  }
  const tc = world.townCentre?.clone?.() ?? new THREE.Vector3(0, 4, 20);
  const her = new THREE.Vector3(tc.x + 12, world.heightAt?.(tc.x + 12, tc.z - 6)?.y ?? tc.y, tc.z - 6);
  const toward = new THREE.Vector3(tc.x - her.x, 0, tc.z - her.z).normalize();
  const kit = her.clone().addScaledVector(toward, 5);
  const g = {
    world,
    townCentre: () => tc.clone(),
    payne: { position: her },
    players: [], dragons: [],
    _worldBounds: () => ({ centre: new THREE.Vector3(0, 0, 0), radius: 260 }),
  };
  const ctx = introCtx(g, kit);
  ok('with this world, every place it names is found: her, the kitten, the town, a heap, a shrine, the grotto, the arena, the Dojo',
    ['payne', 'kitten', 'town', 'heap', 'shrine', 'grotto', 'arena', 'dojo'].every((k) => fin(ctx[k])) && typeof ctx.blocked === 'function',
    ['payne', 'kitten', 'town', 'heap', 'shrine', 'grotto', 'arena', 'dojo'].filter((k) => !fin(ctx[k])).join(' ') || 'all found');
  {
    /* THE SHOTS ABOUT HER HAVE ALL OF HER IN THEM. She is a quad PAYNE_HEIGHT
       tall on her spot; the head-to-feet ones must hold her feet and the top
       of her head, and the close one at least her face and chest. */
    const H = PN.PAYNE_HEIGHT;
    const whole = new Set(['two', 'twoOther', 'ots', 'her']);
    // herLow is "Look up.": low and close, looking up past her at the sky, so her knees go and her hand must not
    const close = new Set(['herClose', 'herLow']);
    const miss = [];
    let n = 0;
    for (const [line, L] of Object.entries(INTRO_CUTS)) {
      L.cuts.forEach(([name], j) => {
        if (!whole.has(name) && !close.has(name)) return;
        for (const t of cueTimes(L, j)) {
          lens(introShot(line, ctx, 0, t));
          n++;
          const head = ndc(her.x, her.y + H, her.z), chest = ndc(her.x, her.y + H * 0.6, her.z), feet = ndc(her.x, her.y + 0.1, her.z);
          const okk = close.has(name) ? inFrame(head, 0.98) && inFrame(chest, 0.9) : inFrame(head, 0.98) && inFrame(feet, 0.98) && Math.abs(chest.x) < 0.8;
          if (!okk) miss.push(`${line}:${name}@${t.toFixed(1)} head ${head.y.toFixed(2)} feet ${feet.y.toFixed(2)} x ${chest.x.toFixed(2)}`);
        }
      });
    }
    ok('every shot about her has her in it — head to feet in the wide ones, face and chest in the close ones', miss.length === 0,
      miss.slice(0, 4).join(' · ') || `${n} frames`);
    // "Look up." — the fingertip is the top of the pointing cells
    const top = [];
    for (const t of cueTimes(INTRO_CUTS.l4, 0)) {
      lens(introShot('l4', ctx, 0, t));
      top.push(ndc(her.x, her.y + H * INTRO_GEO[PAYNE_INTRO[3].act[0][0]].y1, her.z).y);
    }
    ok('...and on "Look up." the lens is low and far enough that her pointing hand is in frame',
      INTRO_CUTS.l4.cuts[0][0] === 'herLow' && INTRO_CLIPS[PAYNE_INTRO[3].act[0][0]].take === 'point'
      && INTRO_CLIPS[PAYNE_INTRO[3].act[0][0]].to === 120 && top.every((y) => y < 0.97),
      top.map((y) => y.toFixed(2)).join(' '));
    /* OVER THE SHOULDER means the kitten is between the lens and her: the
       lens is on the kitten's side of Payne. */
    const side = [];
    for (const [line, L] of Object.entries(INTRO_CUTS)) {
      L.cuts.forEach(([name], j) => {
        if (name !== 'ots') return;
        const s = introShot(line, ctx, 0, cueTimes(L, j)[1]);
        const dLens = Math.hypot(s.pos.x - her.x, s.pos.z - her.z), dKit = Math.hypot(s.pos.x - kit.x, s.pos.z - kit.z);
        if (!(dKit < dLens)) side.push(line);
      });
    }
    ok('...and the over-the-shoulders are over the KITTEN\'s shoulder: the lens is nearer her than Payne', side.length === 0, side.join(' '));
  }
  {
    /* NOTHING IN THE WAY. The turn search keeps a cut's whole move clear of
       the lanterns, trees and houses where any turn is clear. Measured with
       this world: the count of frames whose sight line is still blocked
       after the search, out of every cut's start, middle and end — 3 of 129
       when this was written (the low "Look up." past a lantern's cap, a dragon
       star in a crowd of roofs, one end of the long two-shot), so the bar is
       twice that. */
    let blocked = 0, total = 0;
    const which = [];
    for (const [line, L] of Object.entries(INTRO_CUTS)) {
      L.cuts.forEach(([name], j) => {
        if (name === 'blast' || name === 'archi' || name === 'townWide') return;
        for (const t of cueTimes(L, j, [0, 0.5, 1])) {
          const s = introShot(line, ctx, 0, Math.min(t, L.len - 0.01));
          total++;
          if (ctx.blocked(s.pos, s.look)) { blocked++; which.push(`${line}:${name}`); }
        }
      });
    }
    ok('...and nothing stands between the lens and what it is looking at, in nearly every frame',
      blocked <= 6, `${blocked} of ${total} blocked${which.length ? ': ' + [...new Set(which)].slice(0, 5).join(' ') : ''}`);
  }
  {
    /* THE BLAST-OFF. Richard: "have the camera "blast off" focusing on the
       player and Payne and starting slowly, but accelerating quickly and fast
       into the air, like a rocket going to space". */
    const L = INTRO_CUTS.l12;
    const a = L.cuts.find((c) => c[0] === 'blast')[1];
    const S = [];
    for (let t = a; t < L.len; t += 0.1) S.push([t, introShot('l12', ctx, 0, t)]);
    S.push([L.len, introShot('l12', ctx, 0, L.len)]);
    const alts = S.map(([, s]) => s.pos.y - her.y);
    const rising = alts.every((y, i) => !i || y >= alts[i - 1] - 1e-9);
    const half = Math.floor(S.length / 2);
    const accel = alts[half] - alts[0] < (alts.at(-1) - alts[half]) / 4;
    const early = S.slice(0, Math.ceil(S.length * 0.3)).every(([, s]) => { lens(s); return inFrame(ndc(her.x, her.y + 3, her.z), 0.9) && inFrame(ndc(kit.x, kit.y + 1, kit.z), 0.9); });
    const steep = S.filter(([t]) => (t - a) / (L.len - a) < BLAST.tilt).map(([, s]) => Math.atan2(s.pos.y - s.look.y, Math.hypot(s.pos.x - s.look.x, s.pos.z - s.look.z)) * 180 / Math.PI);
    ok('the blast-off starts on the two of them, slow, then accelerates hard — rising every frame, the second half four times the first',
      rising && accel && early, `${alts[0].toFixed(0)} → ${alts[half].toFixed(0)} → ${alts.at(-1).toFixed(0)} up`);
    ok('...never straight overhead, where she is a picture seen edge-on', steep.every((d) => d < 72), `steepest ${Math.max(...steep).toFixed(0)}°`);
    ok('...and it ends in space, high enough for every star, fading out on its own',
      alts.at(-1) > SPACE.to && S.at(-1)[1].black > 0.95 && S[0][1].black === 0, `top ${alts.at(-1).toFixed(0)} · space at ${SPACE.to}`);
  }

  /* --- her, standing in the world --- */
  {
    const hadDoc = typeof document !== 'undefined';
    ok('she is no longer pinned to the screen: no #cs-actor in the page or the stylesheet',
      !/cs-actor/.test(read('index.html')) && !/cs-actor/.test(read('src/style.css')));
    if (hadDoc) {
      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0xffffff, 60, 400);
      const bb = { visible: true };
      const sc = { camera: new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 6000) };
      const W = { arenaOpen: false, arenaMesh: new THREE.Group(), arenaProps: new THREE.Group() };
      W.arenaMesh.visible = W.arenaProps.visible = false;
      const G = { scene, world: W, payne: { position: her.clone(), group: bb }, storyScene: sc, device: { atlasMax: 4096 } };
      const A = new PayneActor(G, PN.PAYNE_HEIGHT);
      A.start(PAYNE_INTRO[0]);
      sc.camera.position.set(her.x + 10, her.y + 4, her.z + 3);
      A.update(0.5, 1 / 30);
      const q = A.group;
      const want = Math.atan2(sc.camera.position.x - her.x, sc.camera.position.z - her.z);
      ok('she is a quad on her own market spot, in the scene, turned to the lens about the vertical — and her market billboard steps off',
        !!q && q.parent === scene && Math.hypot(q.position.x - her.x, q.position.z - her.z) < 1e-6
        && Math.abs(A.mesh.rotation.y - want) < 1e-6 && A.mesh.rotation.x === 0 && bb.visible === false);
      ok('...the arena is DRAWN for the scene (it rises at 80%), and only drawn', W.arenaMesh.visible && W.arenaProps.visible && !W.arenaOpen);
      sc.camera.position.y = her.y + SPACE.to + 200;
      A.update(11, 1 / 30);
      const up = { fog: scene.fog.far, dome: A.set.dome?.visible, a: A.set.domeMat?.uniforms.a.value };
      A.stop();
      ok('...high up it is space: the dome and the stars come on and the fog is pushed out',
        up.dome === true && up.a === 1 && up.fog > 400, `fog far ${up.fog.toFixed(0)}`);
      ok('...and on stop every bit of it goes: her quad, the sky, the stars, the fog back to what it was, the arena back to hidden, the billboard back on',
        !q.parent && scene.children.length === 0 && scene.fog.near === 60 && scene.fog.far === 400
        && !W.arenaMesh.visible && !W.arenaProps.visible && bb.visible === true);
      // an arena already open is left exactly alone
      const W2 = { arenaOpen: true, arenaMesh: { visible: true } };
      const S2 = new IntroSet({ world: W2 });
      S2._arena(true); S2._arena(false);
      ok('...and an arena that is already open is not touched', W2.arenaMesh.visible === true);
    }
  }

  /* --- the furnished island --- */
  {
    /* "if we want to show the castles you can build during the cutscene, we
       can temporarily spawn one of the islands and furnish it with a castle
       and a few buildings with bridges connecting on 2nd or 3rd floor and
       some outdoor Japanese themed decorations ... farm and animals". It is
       the editor's own rules that lay it (so it is a home a player COULD
       build), and nothing of it is written down. */
    const scene = new THREE.Scene();
    const game = {
      world, scene, players: [], kotodama: { price: 650 }, sessionCast: new Map(), sessionId: 'check-payne',
      toast: () => {}, onScoreChanged: () => {}, audio: null,
      inspector: { openExt: () => true, cards: [], closeOne() {}, extOf: () => null },
    };
    const Hs = new Housing(game);
    Hs.build();
    game.housing = Hs;
    const storeBefore = JSON.stringify(Hs.store?.homes ?? {});
    const set = new IntroSet(game);
    set.start();
    const I = set.isle;
    const H = I?.home;
    const yard = new Set((H?.outdoor ?? []).map((o) => o.id));
    const has = ['pen', 'onsen', 'zengarden', 'shrine', 'teahouse'].filter((k) => yard.has(k));
    const upper = (H?.links ?? []).some((L) => L.a.floor >= 1 && L.b.floor >= 1);
    const vis = I?.group.visible;
    Hs._showIsles?.();
    const kept = I?.group.visible;
    ok('the scene furnishes an island nobody owns with a castle, annexes, a bridge between upper floors, and a yard',
      !!H && H.house === 'castle' && (H.annex ?? []).length >= 2 && upper && has.length >= 4 && !!set.pen,
      `${(H?.annex ?? []).length} annexes · upper bridge ${upper} · ${has.join(' ')} · pen ${!!set.pen}`);
    ok('...shown while it plays, even though the islands are hidden until the ending', vis === true && kept === true);
    set.stop();
    ok('...and on stop it is unfurnished and hidden again, and the store never knew',
      !I.home && Hs.showcase == null && JSON.stringify(Hs.store?.homes ?? {}) === storeBefore && (world.snakeOpen || !I.group.visible));
  }

  /* --- the scene, through the real StoryScene --- */
  {
    const calls = [];
    const stage = { start: (r) => calls.push(`start:${r.voice}`), update: () => calls.push('u'), stop: () => calls.push('stop') };
    const sc = new StoryScene({ audio: null });
    const started = sc.start('intro', PAYNE_INTRO, { shot: introShot, stage });
    sc.update(1 / 30);
    const l = sc.camera.position.clone();
    const scored = sc.musicTrack;
    sc.skip();
    ok('it plays through StoryScene with her on stage: each line hands her its row, the lens is the intro\'s own, and a skip takes her off',
      started && calls[0] === 'start:payne_intro_1' && calls.includes('u') && calls.at(-1) === 'stop' && !sc.active
      && [l.x, l.y, l.z].every(Number.isFinite), calls.slice(0, 4).join(' '));
    ok('...scored with her own theme the whole way, and nothing else is', scored === 'tourPayne' && sc.musicTrack === null);
    /* NINTH: no voice, no sheets. A line without its clip is a reading time,
       and the stage with no pages draws her still — it never throws. */
    const bare = new StoryScene({ audio: null });
    const actor = new PayneActor({ payne: null, device: null });
    let threw = false;
    try {
      bare.start('intro', PAYNE_INTRO, { shot: introShot, stage: actor });
      for (let i = 0; i < 240; i++) bare.update(0.1);
    } catch (e) { threw = String(e); }
    ok('...and with no voice and no sheets it still plays, line by line, and never throws',
      threw === false && bare.i >= 1, threw || `line ${bare.i + 1} after 24s`);
    bare.skip();
    const src = read('src/systems/payneintro.js');
    ok('...where a cell whose page has not landed is her market drawing, masked or not as the cell is',
      /const art = maskedIn\(clip, cell\) \? 'town' : 'held';\s*const img = this\.game\.payne\?\.img\?\.\[art\];/.test(src));
  }

  /* --- the first hello, and her card --- */
  {
    const started = [];
    const toasts = [];
    const story = { active: false, start(kind, rows, c) { started.push({ kind, rows, ctx: c }); return true; } };
    const kid = (i) => ({ name: ['Ember', 'Frost'][i], style: { name: 'Ember' }, index: i, position: new THREE.Vector3(tc.x + i, tc.y, tc.z + 3), facing: 0, payne: PN.blankPayne(), clansSworn: new Set() });
    const a = kid(0);
    const b = kid(1);
    const G = {
      world, storyScene: story, players: [a, b], dream: { busy: false }, _sceneActive: () => story.active,
      townCentre: () => tc.clone(), _worldBounds: () => ({ centre: new THREE.Vector3(), radius: 200 }),
      dragons: [], toast: (t) => toasts.push(t), sfx() {}, feats: { open: true, has: () => false, claimed: {}, ledger: () => ({}) },
    };
    const P = new PN.Payne(G);
    P.position = her.clone();
    G.payne = P;
    const r1 = P.greet(a);
    ok('the first time anybody talks to her, her hello IS the introduction — and the card comes down for it',
      r1 === 'scene' && started.length === 1 && started[0].kind === 'intro' && started[0].rows === PAYNE_INTRO
      && started[0].ctx.shot === introShot && started[0].ctx.stage instanceof PayneActor
      && /if \(this\.game\.payne\.greet\(p\) === 'scene'\) this\.closeAll\(\);/.test(read('src/systems/inspector.js')));
    const face = Math.atan2(P.position.x - a.position.x, P.position.z - a.position.z);
    ok('...and the kitten who asked turns to face her, and is who the shots are over the shoulder of',
      Math.abs(a.facing - face) < 1e-9 && started[0].ctx.kitten && Math.hypot(started[0].ctx.kitten.x - a.position.x, started[0].ctx.kitten.z - a.position.z) < 1e-6);
    ok('...and it is SEEN the moment it starts, by every kitten in the party, not when it finishes (seventh non-negotiable)',
      a.payne.met && a.payne.intro && b.payne.intro && !b.payne.met);
    const r2 = P.greet(b);
    ok('...so her sister\'s first hello is a hello, not the same minute again', r2 === null && started.length === 1);
    ok('...and the flag is saved with the rest of her ledger', PN.cleanPayne({ intro: true }).intro === true && PN.cleanPayne({}).intro === false);
    const c = kid(0);
    G.players = [c];
    G.dream.busy = true;
    const r3 = P.greet(c);
    ok('a first hello while a sister is in the simulator is just a hello, and the introduction waits on her card',
      r3 === null && started.length === 1 && c.payne.met && !c.payne.intro);
    const rows = P.rows(c);
    const row = rows.find((x) => x.key === 'intro');
    ok('her card has INTRODUCTION TO THE WORLD, saying what it does', row?.title === 'INTRODUCTION TO THE WORLD' && /knock things over/.test(row.blurb)
      && rows[1] === row);
    const no = P.choose(c, 'intro');
    ok('...which refuses IN WORDS while somebody is in the simulator, and keeps her card up',
      no === 'payne' && /simulator/.test(toasts.at(-1) ?? ''));
    G.dream.busy = false;
    story.active = true;
    const no2 = P.choose(c, 'intro');
    story.active = false;
    const yes = P.choose(c, 'intro');
    ok('...or while a scene is up, and otherwise plays it again, as many times as she likes',
      no2 === 'payne' && /try again/.test(toasts.at(-1) ?? '') && yes === 'scene' && started.length === 2);
    const main = read('src/main.js');
    ok('...and the town is ticked under it, and the simulator is never warmed for it',
      /if \(this\.storyScene\.kind !== 'intro'\) this\._primeSim\(this\.storyScene\.camera\);/.test(main));
  }
}
