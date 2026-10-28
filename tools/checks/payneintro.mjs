/* ---------------------------------------------------------------------------
   PAYNE'S INTRODUCTION TO THE WORLD — the checks that catch what still looks
   fine on screen. Run from world-check.mjs at the end, against its World.

     the script says what it was asked to say, in her approved voice's files
     she starts masked, is unmasked by "Ta-daa", and is masked again to leave
     every cell she is asked for is a cell that was cut, on a page that exists,
     measured off the page (eighth non-negotiable)
     every shot is finite with no world at all, and frames its subject LEFT of
     her, clear of the stage, with the real one
     the first hello IS the scene, seen by everybody the moment it starts
     (seventh), and a refusal says so (sixth)
     the scene plays with no sheets and no voice (ninth)
--------------------------------------------------------------------------- */
import * as THREE from 'three';
import { readFileSync, existsSync } from 'node:fs';
import {
  INTRO_CLIPS, INTRO_COLS, INTRO_PER_PAGE, INTRO_CELL_H, INTRO_CELL_H_HALF, INTRO_FPS,
  clipFrames, clipPages, pagePath,
} from '../../src/systems/payneclips.js';
import {
  PAYNE_INTRO, actFrame, maskedIn, introShot, introCtx, PayneActor, LEAN,
} from '../../src/systems/payneintro.js';
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

export async function payneIntroChecks({ ok, world }) {
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
    'her mission to too much order and boredom': /too much order, too much boredom/.test(all),
  };
  const missing = Object.entries(brief).filter(([, v]) => !v).map(([k]) => k);
  ok('...and it says everything Richard asked for: why mischief, kotodama, one world, Shinto, karma, the jobs, her mission',
    missing.length === 0, missing.join(', ') || `${Object.keys(brief).length} points`);
  ok('...and no line says "Hurt" without saying what to do instead — look after them',
    PAYNE_INTRO.filter((r) => /Hurt/.test(r.text)).every((r) => /look after/.test(r.text)));

  /* --- the act: masked, unmasked, masked --- */
  const endOf = (r) => {
    const last = r.act.at(-1);
    const n = clipFrames(INTRO_CLIPS[last[0]]).length;
    const len = last[2] != null ? Math.abs(last[3] - last[2]) : n;
    return actFrame(r.act, last[1] + len / INTRO_FPS + 0.5);
  };
  const m0 = actFrame(PAYNE_INTRO[0].act, 0);
  const off = endOf(PAYNE_INTRO[2]);
  const back = endOf(PAYNE_INTRO[11]);
  const out = endOf(PAYNE_INTRO[12]);
  ok('she opens MASKED, is unmasked by the end of "Ta-daa", and is masked again for her mission and her salute',
    maskedIn(m0.clip, m0.cell) && PAYNE_INTRO.slice(3, 11).every((r) => r.act.every(([c, , f, t]) => !maskedIn(c, t ?? f ?? 0)))
    && !maskedIn(actFrame(PAYNE_INTRO[3].act, 0).clip, actFrame(PAYNE_INTRO[3].act, 0).cell)
    && maskedIn(back.clip, back.cell) && maskedIn(out.clip, out.cell) && off.clip === 'wave',
    `open ${m0.clip}:${m0.cell} · after 3 ${off.clip} · end of 12 ${back.clip}:${back.cell} · end ${out.clip}`);
  {
    // The helmet comes off across two lines: the cell 2 ends on is the cell 3 starts on.
    const e2 = PAYNE_INTRO[1].act.at(-1);
    const s3 = PAYNE_INTRO[2].act[0];
    ok('...and the unmask is one performance across lines 2 and 3, played backwards off the re-mask\'s own take',
      e2[0] === 'mask' && s3[0] === 'mask' && e2[3] === s3[2] && s3[3] === 0 && e2[2] > e2[3]);
  }
  const bad = [];
  for (const r of PAYNE_INTRO) {
    let last = -1;
    for (const [c, at, f, t] of r.act) {
      const C = INTRO_CLIPS[c];
      if (!C) { bad.push(`${r.voice}: no clip ${c}`); continue; }
      const n = clipFrames(C).length;
      if (!(at > last)) bad.push(`${r.voice}: ${c} at ${at} is not after ${last}`);
      if (f != null && !(f >= 0 && f < n && t >= 0 && t < n)) bad.push(`${r.voice}: ${c} ${f}->${t} of ${n}`);
      last = at;
    }
    for (let t = 0; t < 25; t += 0.05) {
      const { clip, cell } = actFrame(r.act, t);
      const n = clipFrames(INTRO_CLIPS[clip]).length;
      if (!(cell >= 0 && cell < n && Number.isInteger(cell))) { bad.push(`${r.voice} @${t.toFixed(2)} ${clip}:${cell}`); break; }
    }
  }
  ok('every cell any line asks for is a cell that was cut, in time order, all the way through the longest line',
    bad.length === 0, bad.slice(0, 4).join(' · ') || `${PAYNE_INTRO.reduce((s, r) => s + r.act.length, 0)} cues`);
  {
    // A pingpong turns at both ends without repeating its end cell twice running.
    const seq = [];
    for (let k = 0; k < 40; k++) seq.push(actFrame([['talk', 0]], k / INTRO_FPS).cell);
    const n = clipFrames(INTRO_CLIPS.talk).length;
    const stutter = seq.some((c, i) => i > 0 && c === seq[i - 1]);
    ok('a talking loop plays forward and back with no seam — every step one cell, turning at both ends',
      !stutter && seq.includes(n - 1) && seq.slice(n).includes(0) && seq.every((c, i) => i === 0 || Math.abs(c - seq[i - 1]) === 1),
      seq.slice(0, 20).join(','));
  }

  /* --- the pages, measured --- */
  {
    const errs = [];
    let pages = 0;
    for (const [tag, H] of [['full', INTRO_CELL_H], ['half', INTRO_CELL_H_HALF]]) {
      let cw = null;
      for (const name of Object.keys(INTRO_CLIPS)) {
        const n = clipFrames(INTRO_CLIPS[name]).length;
        for (let k = 0; k < clipPages(name); k++) {
          const url = pub(pagePath(name, k, tag === 'half'));
          if (!existsSync(url)) { errs.push(`${tag}/${name}_${k} missing`); continue; }
          pages++;
          const s = webpSize(readFileSync(url));
          const on = Math.min(INTRO_PER_PAGE, n - k * INTRO_PER_PAGE);
          const cols = Math.min(INTRO_COLS, on);
          const rows = Math.ceil(on / INTRO_COLS);
          if (!s?.alpha) errs.push(`${tag}/${name}_${k} has no alpha`);
          if (s && s.h !== rows * H) errs.push(`${tag}/${name}_${k} ${s.h} tall, want ${rows}x${H}`);
          if (s && s.w % cols) errs.push(`${tag}/${name}_${k} ${s.w} not ${cols} cells`);
          const w = s ? s.w / cols : 0;
          cw ??= w;
          if (Math.abs(w - cw) > 0.5) errs.push(`${tag}/${name}_${k} cell ${w} wide, the rest ${cw}`);
        }
      }
    }
    ok('every page of every clip is there, full and half, with alpha, and every cell is one size — measured off the WebP',
      errs.length === 0, errs.slice(0, 4).join(' · ') || `${pages} pages`);
    ok('...and the cells are 768 tall, four times the tea ceremony\'s 192',
      INTRO_CELL_H === 768 && INTRO_CELL_H_HALF * 2 === INTRO_CELL_H);
    const shipped = read('.gitignore');
    ok('...the masters are the three videos, in docs/art-masters (never shipped), and nothing in public/ is a video',
      Object.values(read('src/systems/payneclips.js').match(/docs\/art-masters\/video\/payne_[a-z]+_[0-9a-f]+\.mp4/g) ?? []).length === 3
      && !/public\/sprites\/payne/.test(shipped));
  }

  /* --- the shots --- */
  {
    const cam = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 6000);
    const lens = (s) => {
      cam.position.set(s.pos.x, s.pos.y, s.pos.z);
      cam.lookAt(s.look.x, s.look.y, s.look.z);
      cam.updateMatrixWorld(true);
      cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    };
    const fin = (p) => [p.x, p.y, p.z].every(Number.isFinite);
    const names = [...new Set(PAYNE_INTRO.map((r) => r.shot))];
    const nan = [];
    for (const n of names) {
      for (let k = 0; k <= 1; k += 0.1) {
        const s = introShot(n, {}, k);
        if (!fin(s.pos) || !fin(s.look) || s.loc !== 'real') nan.push(`${n}@${k.toFixed(1)}`);
      }
    }
    ok('every shot of the introduction aims somewhere real with NO world at all — no NaN, no missing place',
      nan.length === 0, nan.slice(0, 4).join(' ') || `${names.length} shots`);

    /* THE SUBJECT IS LEFT OF HER. She takes the right ~30% of the frame
       (#cs-actor: 2vw in, ~55vh wide at 16:9 = NDC 0.38 to 0.96), so what a
       shot is ABOUT has to be left of NDC 0.3, in front of the lens, and
       above the dialogue box (NDC -0.38) on its middle. */
    const g = {
      world,
      townCentre: () => world.townCentre?.clone?.() ?? new THREE.Vector3(0, 4, 20),
      payne: { position: new THREE.Vector3(world.townCentre.x + 12, world.townCentre.y, world.townCentre.z - 6) },
      dragons: [],
      _worldBounds: () => ({ centre: new THREE.Vector3(0, 0, 0), radius: 260 }),
    };
    const ctx = introCtx(g);
    ok('...and with this world, every place it names is found: her, the town, a heap still standing, a shrine, the arena, the Dojo',
      ['payne', 'town', 'heap', 'shrine', 'arena', 'dojo'].every((k) => ctx[k] && fin(ctx[k])),
      Object.entries(ctx).filter(([, v]) => v && typeof v === 'object').map(([k]) => k).join(' '));
    const subjectOf = { market: 'payne', marketClose: 'payne', heap: 'heap', heapLow: 'heap', shrine: 'shrine', arena: 'arena', ring: 'arena', dojo: 'dojo', townWide: 'town' };
    const miss = [];
    for (const [n, key] of Object.entries(subjectOf)) {
      for (const k of [0, 0.5, 1]) {
        if (n === 'shrine' && k > 0.3) continue;
        lens(introShot(n, ctx, k));
        const v = new THREE.Vector3(ctx[key].x, ctx[key].y + 2, ctx[key].z).project(cam);
        if (!(v.z < 1 && v.x > -0.9 && v.x < 0.3 && v.y > -0.38 && v.y < 0.9)) miss.push(`${n}@${k} ${v.x.toFixed(2)},${v.y.toFixed(2)}`);
      }
    }
    ok(`...and frames its subject LEFT of her and over the dialogue box (the lens leans ${LEAN} right)`,
      miss.length === 0, miss.slice(0, 5).join(' · ') || `${Object.keys(subjectOf).length} shots x 3`);
  }

  /* --- the scene, through the real StoryScene --- */
  {
    const calls = [];
    const stage = { start: (r) => calls.push(`start:${r.voice}`), update: () => calls.push('u'), stop: () => calls.push('stop') };
    const sc = new StoryScene({ audio: null });
    const started = sc.start('intro', PAYNE_INTRO, { shot: introShot, stage });
    sc.update(1 / 30);
    const lens = sc.camera.position.clone();
    const scored = sc.musicTrack;
    sc.skip();
    ok('it plays through StoryScene with her on stage: each line hands her its row, the lens is the intro\'s own, and a skip takes her off',
      started && calls[0] === 'start:payne_intro_1' && calls.includes('u') && calls.at(-1) === 'stop' && !sc.active
      && [lens.x, lens.y, lens.z].every(Number.isFinite), calls.slice(0, 4).join(' '));
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
      /this\.game\.payne\?\.img\?\.\[maskedIn\(clip, cell\) \? 'town' : 'held'\]/.test(src));
  }

  /* --- the first hello, and her card --- */
  {
    const started = [];
    const toasts = [];
    const story = { active: false, start(kind, rows, ctx) { started.push({ kind, rows, ctx }); return true; } };
    const kid = (i) => ({ name: ['Ember', 'Frost'][i], style: { name: 'Ember' }, index: i, position: new THREE.Vector3(), payne: PN.blankPayne(), clansSworn: new Set() });
    const a = kid(0);
    const b = kid(1);
    const g = {
      world, storyScene: story, players: [a, b], dream: { busy: false }, _sceneActive: () => story.active,
      townCentre: () => world.townCentre.clone(), _worldBounds: () => ({ centre: new THREE.Vector3(), radius: 200 }),
      dragons: [], toast: (t) => toasts.push(t), sfx() {}, feats: { open: true, has: () => false, claimed: {}, ledger: () => ({}) },
    };
    const P = new PN.Payne(g);
    const r1 = P.greet(a);
    ok('the first time anybody talks to her, her hello IS the introduction — and the card comes down for it',
      r1 === 'scene' && started.length === 1 && started[0].kind === 'intro' && started[0].rows === PAYNE_INTRO
      && started[0].ctx.shot === introShot && started[0].ctx.stage instanceof PayneActor
      && /if \(this\.game\.payne\.greet\(p\) === 'scene'\) this\.closeAll\(\);/.test(read('src/systems/inspector.js')));
    ok('...and it is SEEN the moment it starts, by every kitten in the party, not when it finishes (seventh non-negotiable)',
      a.payne.met && a.payne.intro && b.payne.intro && !b.payne.met);
    const r2 = P.greet(b);
    ok('...so her sister\'s first hello is a hello, not the same minute again', r2 === null && started.length === 1);
    ok('...and the flag is saved with the rest of her ledger', PN.cleanPayne({ intro: true }).intro === true && PN.cleanPayne({}).intro === false);
    const c = kid(0);
    g.players = [c];
    g.dream.busy = true;
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
    g.dream.busy = false;
    story.active = true;
    const no2 = P.choose(c, 'intro');
    story.active = false;
    const yes = P.choose(c, 'intro');
    ok('...or while a scene is up, and otherwise plays it again, as many times as she likes',
      no2 === 'payne' && /try again/.test(toasts.at(-1) ?? '') && yes === 'scene' && started.length === 2);
  }

  /* --- the stage, on a phone --- */
  {
    const css = read('src/style.css');
    const html = read('index.html');
    ok('she stands in the cutscene under its fade, so a dip takes her with the picture',
      /<canvas id="cs-actor"[^>]*><\/canvas>\s*<div id="cs-fade">/.test(html));
    /* SHE AND THE CAPTION NEVER OVERLAP, at five windows. The first version
       pinned `height: 70vh` and believed the centred box cleared her at 16:9:
       it did not (1080p: she starts at 1289, the box ended at 1400), and at
       4:3 the caption ran across her knees. So this reads the numbers out of
       the stylesheet and lays both rectangles out. The box's height is
       MEASURED (1024x768 and 844x390 in Firefox, two lines of text): 117px on
       a desktop, 68px on a phone. */
    const num = (re) => { const m = css.match(re); return m ? Number(m[1]) : NaN; };
    const H = num(/\n#cs-actor \{[^}]*height: ([\d.]+)vh/);
    const R = num(/\n#cs-actor \{[^}]*right: ([\d.]+)vw/);
    const beside = num(/#cs-actor\.on\) #cs-box \{[^}]*- ([\d.]+)vh - 12px/);
    const tallH = num(/max-aspect-ratio: 1249\/1000\)[^}]*#cs-actor \{[^}]*height: ([\d.]+)vh/);
    const tallUp = num(/max-aspect-ratio: 1249\/1000\)[^}]*#cs-actor \{[^}]*bottom: calc\(9vh \+ 26px \+ ([\d.]+)px\)/);
    const phH = num(/body\.touch-ui #cs-actor \{[^}]*height: ([\d.]+)vh/);
    const phUp = num(/body\.touch-ui #cs-actor \{[^}]*bottom: calc\(env\(safe-area-inset-bottom\) \+ ([\d.]+)vh\)/);
    const ASPECT = 602 / 768; // a cell, as the cut writes it (checked against the pages above)
    const lay = (vw, vh, touch) => {
      const v = vh / 100, w = vw / 100;
      if (touch) {
        const boxTop = vh - 12 - 68, bottom = vh - phUp * v;
        return { clear: bottom <= boxTop + 1, top: bottom - phH * v, boxW: Math.min(0.96 * vw, 760) };
      }
      const actorW = H * v * ASPECT;
      if (vw / vh >= 1.25) {
        const boxW = Math.min(880, 0.95 * vw - beside * v - 12);
        return { clear: 3 * w + boxW <= vw - R * w - actorW, top: vh - 9 * v - H * v, boxW, wide: beside * v >= actorW };
      }
      const boxTop = vh - 9 * v - 26 - 117, bottom = vh - 9 * v - 26 - tallUp;
      return { clear: bottom <= boxTop, top: bottom - tallH * v, boxW: Math.min(880, 0.88 * vw) };
    };
    const wins = [[1920, 1080], [1024, 768], [1280, 1024], [834, 1000], [844, 390, true]];
    const laid = wins.map(([w, h, t]) => [`${w}x${h}`, lay(w, h, t)]);
    ok('the caption and Payne never overlap — 16:9, 4:3, 5:4, a portrait window and a phone — and she is never cut off at the top',
      [H, R, beside, tallH, tallUp, phH, phUp].every(Number.isFinite)
      && laid.every(([, L]) => L.clear && L.top >= 0 && L.wide !== false),
      laid.map(([k, L]) => `${k}:${L.clear ? 'clear' : 'OVERLAP'}`).join(' '));
    ok('...and the caption is never squeezed under 480px to make room for her',
      laid.every(([, L]) => L.boxW >= 480), laid.map(([k, L]) => `${k}:${Math.round(L.boxW)}`).join(' '));
    const main = read('src/main.js');
    ok('...and the town is ticked under it, and the simulator is never warmed for it',
      /if \(this\.storyScene\.kind !== 'intro'\) this\._primeSim\(this\.storyScene\.camera\);/.test(main));
  }
}
