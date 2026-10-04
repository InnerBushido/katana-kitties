import * as THREE from 'three';
import { voicePath } from '../../core/audio.js';
import { SIM } from '../../world/simworld.js';
import { beatOver } from '../cutscene.js';

/* ---------------------------------------------------------------------------
   THE DREAM DOJO'S SCENES — Payne's tour, and Lionheart's two talks.

   One player for three scripts (dream/stories.js). Built on the shrine
   scene's furniture and rules (systems/shrinescene.js) and the arena exit's
   shape (systems/arenaexit.js), because those are the scenes the kids
   already know how to watch and skip:

   · SKIPPED BY ESCAPE OR A PAD'S START, AND NOTHING ELSE (seventh
     non-negotiable). The Game asks `_skipPressed` and calls `skip`.
   · NOTHING HANGS OFF IT FINISHING. Whoever starts it spends it: a talk is
     marked heard in `Approach.lecture` BEFORE `start`, and the tour changes
     nothing at all.
   · THE SHOTS ARE DATA. `shotFor(name, ctx, k)` is pure — a name, the places
     it reads, and how far through the line we are — so world-check can put
     every shot through the real lens and ask whether it frames what it is
     for. Every place has a fallback, so a missing island aims somewhere real
     rather than at NaN.
   · THE TALKS ARE OVER THE SHOULDER. Richard: "camera zoom in on the player
     when they are near Lionheart and have the player looking towards
     Lionheart and camera is behind, over the shoulder, and have Lionheart
     facing the player ... if more than one player is nearby ... then all the
     players are in the cutscene." The kittens are stood on marks in front of
     him (`marks`), facing him; his drawing is front-facing and turns to the
     lens, so from behind them he is facing them.
   · A LINE LASTS AS LONG AS ITS RECORDING, measured off the clip when it has
     loaded, and a reading time when there is none — voice degrades to text
     (ninth non-negotiable).
--------------------------------------------------------------------------- */

const FADE = 0.5;
/** A black dip at a change of place — the real world to the simulator — and
 *  only there: a cut between two shots of the same island is a cut. */
const DIP = 0.35;
/** Reading time for a line with no recording: a beat per word and a breath. */
const WORDS_PER_S = 2.6;
const TYPE_LEAD = 0.72;
/** How far in front of Lionheart the first kitten stands, and how far apart
 *  her sisters stand beside her. */
export const TALK_GAP = 4.6;
export const MARK_SPREAD = 1.9;

const v3 = (x, y, z) => ({ x, y, z });
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);
const lerpP = (a, b, k) => v3(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k));

/**
 * Where the kittens stand for a talk. The first on the line from Lionheart to
 * the middle of the pad, `TALK_GAP` out; the rest alternately to either side
 * of her on a shallow arc, so all of them face him and nobody hides anybody.
 */
export function marks(lion, padCentre, n) {
  let dx = padCentre.x - lion.x;
  let dz = padCentre.z - lion.z;
  const d = Math.hypot(dx, dz) || 1;
  dx /= d; dz /= d;
  const out = [];
  for (let i = 0; i < n; i++) {
    const side = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2);
    const a = side * (MARK_SPREAD / TALK_GAP);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const rx = dx * ca - dz * sa;
    const rz = dz * ca + dx * sa;
    out.push({ x: lion.x + rx * TALK_GAP, z: lion.z + rz * TALK_GAP, facing: Math.atan2(-rx, -rz) });
  }
  return out;
}

/**
 * The camera for a named shot, `k` (0..1) through its line.
 *
 * `ctx` is the places: `arcade` {x,y,z,r}, `lion`, `sign` {x,y,z}, `stones`,
 * `tubes`, `gear` (rack spots), `u` (Dojo → arcade), `v` (screen-right), `dojo`
 * (the Turning Circle's centre), `isles` (sim islands, layer coordinates) and
 * `cast` (the kittens' marks for a talk). Returns {pos, look, loc}; `loc` is
 * 'real' or 'sim' and decides where a dip to black goes.
 */
export function shotFor(name, ctx, k = 0) {
  const A = ctx.arcade;
  const u = ctx.u;
  const v = ctx.v;
  const e = ease(Math.max(0, Math.min(1, k)));
  const at = (a, b, y = A.y) => v3(A.x + u.x * a + v.x * b, y, A.z + u.z * a + v.z * b);
  const lion = ctx.lion ?? at(-2, -9);
  const toPad = (() => {
    const dx = A.x - lion.x;
    const dz = A.z - lion.z;
    const d = Math.hypot(dx, dz) || 1;
    return { x: dx / d, z: dz / d };
  })();
  const side = { x: -toPad.z, z: toPad.x };
  const sim = (p) => v3(p.x + SIM.dx, p.y, p.z + SIM.dz);
  const face = v3(lion.x, A.y + 4.4, lion.z);

  switch (name) {
    /* --- the tour, in the real world --- */
    case 'isleWide': {
      // From over the Turning Circle's rim: the island floating out ahead.
      const from = v3(ctx.dojo.x + u.x * 40 - v.x * 14, A.y + 20, ctx.dojo.z + u.z * 40 - v.z * 14);
      const to = v3(ctx.dojo.x + u.x * 52 - v.x * 10, A.y + 16, ctx.dojo.z + u.z * 52 - v.z * 10);
      return { pos: lerpP(from, to, e), look: v3(A.x, A.y + 5, A.z), loc: 'real' };
    }
    case 'stones': {
      const s = ctx.stones?.length ? ctx.stones : [at(-20, -8)];
      const mid = v3((s[0].x + s.at(-1).x) / 2, s[0].y + 1.5, (s[0].z + s.at(-1).z) / 2);
      const from = v3(mid.x - v.x * 22 - u.x * 6, mid.y + 10, mid.z - v.z * 22 - u.z * 6);
      const to = v3(mid.x - v.x * 18 + u.x * 2, mid.y + 8, mid.z - v.z * 18 + u.z * 2);
      return { pos: lerpP(from, to, e), look: mid, loc: 'real' };
    }
    case 'sign': {
      const s = ctx.sign ?? at(12.6, 0, A.y + 9.5);
      const from = at(-30, 4, A.y + 12);
      const to = at(-20, 2, A.y + 10);
      return { pos: lerpP(from, to, e), look: v3(lerp(A.x, s.x, 0.6), lerp(A.y + 4, s.y, 0.7), lerp(A.z, s.z, 0.6)), loc: 'real' };
    }
    case 'lionClose': {
      const from = v3(lion.x + toPad.x * 10, A.y + 4.2, lion.z + toPad.z * 10);
      const to = v3(lion.x + toPad.x * 7.5, A.y + 4, lion.z + toPad.z * 7.5);
      return { pos: lerpP(from, to, e), look: face, loc: 'real' };
    }
    case 'lionOrbit': {
      const a = lerp(-0.5, 0.35, e);
      const dx = toPad.x * Math.cos(a) - toPad.z * Math.sin(a);
      const dz = toPad.z * Math.cos(a) + toPad.x * Math.sin(a);
      return { pos: v3(lion.x + dx * 9, A.y + 4.5, lion.z + dz * 9), look: face, loc: 'real' };
    }
    case 'gear': {
      const g = ctx.gear?.length ? ctx.gear : [at(0, 9)];
      const mid = v3(g.reduce((s, q) => s + q.x, 0) / g.length, A.y + 1.8, g.reduce((s, q) => s + q.z, 0) / g.length);
      const dx = A.x - mid.x;
      const dz = A.z - mid.z;
      const d = Math.hypot(dx, dz) || 1;
      const from = v3(mid.x + (dx / d) * 15 - (dz / d) * 4, A.y + 8, mid.z + (dz / d) * 15 + (dx / d) * 4);
      const to = v3(mid.x + (dx / d) * 11 + (dz / d) * 3, A.y + 6, mid.z + (dz / d) * 11 - (dx / d) * 3);
      return { pos: lerpP(from, to, e), look: mid, loc: 'real' };
    }
    case 'tubes': {
      const t = ctx.tubes?.length ? ctx.tubes : [at(6, 0)];
      const mid = v3(t.reduce((s, q) => s + q.x, 0) / t.length, A.y + 3, t.reduce((s, q) => s + q.z, 0) / t.length);
      const from = at(-9, -3, A.y + 7);
      const to = at(-5, 1, A.y + 5.5);
      return { pos: lerpP(from, to, e), look: mid, loc: 'real' };
    }
    /* --- the tour, in the simulator --- */
    case 'simHub': {
      const c = sim(v3(ctx.dojo.x, ctx.dojo.y, ctx.dojo.z));
      const a = lerp(0.2, -0.2, e);
      const bx = -u.x * Math.cos(a) + v.x * Math.sin(a);
      const bz = -u.z * Math.cos(a) + v.z * Math.sin(a);
      return { pos: v3(c.x + bx * 95, c.y + 70, c.z + bz * 95), look: v3(c.x, c.y, c.z), loc: 'sim' };
    }
    case 'simIsles': {
      const c = sim(v3(ctx.dojo.x, ctx.dojo.y, ctx.dojo.z));
      const isles = Object.values(ctx.isles ?? {}).filter((q) => q.key !== 'shadow' && q.key !== 'school');
      // Swing round the hub from the islands on her left to those on her right.
      const a = lerp(-0.9, 0.9, e);
      const bx = -u.x * Math.cos(a) + v.x * Math.sin(a);
      const bz = -u.z * Math.cos(a) + v.z * Math.sin(a);
      const look = isles.length
        ? sim(isles.reduce((s, q) => v3(s.x + q.x / isles.length, s.y + q.y / isles.length, s.z + q.z / isles.length), v3(0, 0, 0)))
        : c;
      return { pos: v3(c.x + bx * 150, c.y + 95, c.z + bz * 150), look: lerpP(c, look, 0.5), loc: 'sim' };
    }
    case 'simShadow': {
      const s = ctx.isles?.shadow ?? ctx.isles?.school;
      const c = s ? sim(s) : sim(v3(ctx.dojo.x + u.x * 200, ctx.dojo.y, ctx.dojo.z + u.z * 200));
      const f = s?.fwd ?? u;
      const from = v3(c.x - f.x * 60 + v.x * 18, c.y + 34, c.z - f.z * 60 + v.z * 18);
      const to = v3(c.x - f.x * 42 + v.x * 10, c.y + 24, c.z - f.z * 42 + v.z * 10);
      return { pos: lerpP(from, to, e), look: v3(c.x, c.y + 4, c.z), loc: 'sim' };
    }
    /* --- back with him --- */
    case 'lionHero':
    case 'lionHero2': {
      // Low, looking up at him: the man with the mission.
      const k0 = name === 'lionHero' ? 0 : 0.5;
      const kk = lerp(k0, k0 + 0.5, e);
      const dx = toPad.x + side.x * lerp(0.5, -0.2, kk);
      const dz = toPad.z + side.z * lerp(0.5, -0.2, kk);
      const d = Math.hypot(dx, dz) || 1;
      const r = lerp(8.5, 6.8, kk);
      return { pos: v3(lion.x + (dx / d) * r, A.y + 1.3, lion.z + (dz / d) * r), look: v3(lion.x, A.y + 4.6, lion.z), loc: 'real' };
    }
    case 'skyPull':
    case 'skyPull2': {
      // Away, and up, until the island is one of many in the sky.
      const k0 = name === 'skyPull' ? 0 : 0.5;
      const kk = lerp(k0, k0 + 0.5, e);
      const r = lerp(30, 340, kk * kk);
      const h = lerp(14, 210, kk * kk);
      const look = lerpP(v3(A.x, A.y + 4, A.z), v3(ctx.dojo.x * 0.5, 0, ctx.dojo.z * 0.5), kk);
      return { pos: v3(A.x - u.x * r - v.x * r * 0.35, A.y + h, A.z - u.z * r - v.z * r * 0.35), look, loc: 'real' };
    }
    case 'isleEnd': {
      const from = at(-46, -14, A.y + 22);
      const to = at(-36, -10, A.y + 17);
      return { pos: lerpP(from, to, e), look: v3(A.x, A.y + 5, A.z), loc: 'real' };
    }

    /* --- the talks: over the shoulder --- */
    case 'ots':
    case 'otsLion':
    case 'otsWide': {
      const cast = ctx.cast?.length ? ctx.cast : [v3(lion.x + toPad.x * TALK_GAP, A.y, lion.z + toPad.z * TALK_GAP)];
      const n = cast.length;
      const c = cast.reduce((s, q) => v3(s.x + q.x / n, A.y, s.z + q.z / n), v3(0, 0, 0));
      let bx = c.x - lion.x;
      let bz = c.z - lion.z;
      const bd = Math.hypot(bx, bz) || 1;
      bx /= bd; bz /= bd;
      const sx = -bz;
      const sz = bx;
      /* Back far enough for the whole party: each sister beside her widens
         the group by MARK_SPREAD, and the lens has to hold all of them. */
      const spread = (n - 1) * MARK_SPREAD;
      if (name === 'otsWide') {
        const r = lerp(15, 13, e) + spread;
        return { pos: v3(c.x + bx * r + sx * 4, A.y + 8, c.z + bz * r + sz * 4), look: v3(lerp(c.x, lion.x, 0.5), A.y + 2.8, lerp(c.z, lion.z, 0.5)), loc: 'real' };
      }
      const tight = name === 'otsLion';
      const r = (tight ? lerp(6.4, 5.6, e) : lerp(7.6, 7.0, e)) + spread * 0.9;
      const off = tight ? 1.5 : 2.1;
      return {
        pos: v3(c.x + bx * r + sx * off, A.y + (tight ? 3.4 : 3.9), c.z + bz * r + sz * off),
        look: v3(lerp(c.x, lion.x, tight ? 0.86 : 0.7), A.y + (tight ? 3.9 : 3.2), lerp(c.z, lion.z, tight ? 0.86 : 0.7)),
        loc: 'real',
      };
    }
    default:
      return { pos: at(-30, 0, A.y + 14), look: v3(A.x, A.y + 4, A.z), loc: 'real' };
  }
}

export class StoryScene {
  /** @param {object} game */
  constructor(game) {
    this.game = game;
    this.active = false;
    this.kind = null;
    this.rows = [];
    this.camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 6000);
    this.els = new Map();
    const $ = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);
    this.el = $('cutscene');
    this.boxEl = $('cs-box');
    this.nameEl = $('cs-name');
    this.textEl = $('cs-text');
    this.portraitEl = $('cs-portrait');
    this.fadeEl = $('cs-fade');
    this.barEl = $('cs-progress');
  }

  /** Buffer every clip of a script, once. */
  _load(rows) {
    if (typeof window === 'undefined' || !window.Audio) return;
    for (const r of rows) {
      if (this.els.has(r.voice)) continue;
      const el = new window.Audio(voicePath(r.voice));
      el.preload = 'auto';
      this.els.set(r.voice, el);
    }
  }

  /**
   * Play a script. `ctx` is the places (see `shotFor`); `cast` the kittens a
   * talk is about, already stood on their marks by the caller. Returns false
   * (and starts nothing) for an empty script.
   */
  start(kind, rows, ctx, cast = []) {
    if (this.active || !rows?.length) return false;
    this._load(rows);
    this.active = true;
    this.kind = kind;
    this.rows = rows;
    this.ctx = ctx;
    this.cast = cast;
    this.i = -1;
    this.t = 0;
    this.total = 0;
    this.fadeIn = FADE;
    this.ending = false;
    this.el?.classList.remove('hidden');
    this.game.audio?.sfx?.('menu');
    this._next();
    return true;
  }

  _dur(row) {
    const d = this.els.get(row.voice)?.duration;
    if (Number.isFinite(d) && d > 0) return d + 0.5;
    return Math.max(3, row.text.split(/\s+/).length / WORDS_PER_S + 1.2);
  }

  _next() {
    this.i += 1;
    this.t = 0;
    this.lineEndedAt = null;
    this.typed = 0;
    const row = this.rows[this.i];
    if (!row) { this.finish(); return; }
    const prev = this.rows[this.i - 1];
    const prevLoc = prev ? shotFor(prev.shot, this.ctx, 1).loc : null;
    this.dipAt = prev && prevLoc !== shotFor(row.shot, this.ctx, 0).loc ? 0 : -1;
    this.dur = this._dur(row);
    this.voiceEl = this.game.audio?.speak?.(this.els.get(row.voice) ?? null) ?? null;
    const lion = row.who === 'lion';
    const colour = lion ? '#ff4b4b' : '#7fd35a';
    if (this.nameEl) {
      this.nameEl.textContent = lion ? 'LIONHEART  ·  the Dream Dojo' : 'PAYNE  ·  the goblin';
      this.nameEl.style.color = colour;
    }
    this.boxEl?.style.setProperty('--cs-accent', colour);
    if (this.textEl) this.textEl.textContent = '';
    this._portrait(row.who, colour);
  }

  _portrait(who, colour) {
    const cv = this.portraitEl;
    const g = cv?.getContext?.('2d');
    if (!g) return;
    g.clearRect(0, 0, cv.width, cv.height);
    cv.style.borderColor = colour;
    if (who === 'payne') {
      cv.style.display = '';
      this.game.payne?.drawFace?.(cv);
      return;
    }
    const img = this.game.dream?.lionArt?.texture?.image;
    cv.style.display = img ? '' : 'none';
    if (!img) return;
    // His head: the top of the drawn figure, measured the shrine scene's way.
    const art = this.game.dream.lionArt;
    const cell = img.width;
    const figure = cell * (art.contentScale ?? 0.8);
    const head = cell * (1 - (art.pad ?? 0.06)) - figure;
    const s = Math.min(figure * 0.42, cell);
    const sx = Math.max(0, Math.min(cell - s, cell / 2 - s / 2));
    const sy = Math.max(0, Math.min(img.height - s, head));
    g.drawImage(img, sx, sy, s, s, 0, 0, cv.width, cv.height);
  }

  skip() { if (this.active) this.finish(); }

  finish() {
    if (!this.active) return;
    this.active = false;
    this.el?.classList.add('hidden');
    if (this.fadeEl) this.fadeEl.style.opacity = '0';
    this.game.audio?.stopSpeaking?.();
    this.rows = [];
    this.cast = [];
    this.kind = null;
  }

  _lineFinished() {
    const el = this.voiceEl;
    if (!el) return true;
    const d = el.duration;
    if (el.ended) return true;
    return el.currentTime > 0 && Number.isFinite(d) && el.currentTime >= d - 0.06;
  }

  update(dt) {
    if (!this.active) return false;
    this.t += dt;
    this.total += dt;
    this.fadeIn = Math.max(0, this.fadeIn - dt);
    const row = this.rows[this.i];
    if (!row) { this.finish(); return false; }

    const k = Math.min(1, this.t / this.dur);
    const s = shotFor(row.shot, this.ctx, k);
    this.camera.position.set(s.pos.x, s.pos.y, s.pos.z);
    this.camera.lookAt(s.look.x, s.look.y, s.look.z);

    // Typewriter, on the clip's own playhead when it has one.
    const clock = this.voiceEl && this.voiceEl.currentTime > 0 ? this.voiceEl.currentTime : this.t;
    const rate = row.text.length / Math.max(0.6, (this.dur - 0.5) * TYPE_LEAD);
    const want = Math.min(row.text.length, Math.floor(clock * rate));
    if (want > this.typed && this.textEl) {
      this.typed = want;
      this.textEl.textContent = row.text.slice(0, want);
    }

    const last = this.i === this.rows.length - 1;
    let black = this.fadeIn / FADE;
    if (this.dipAt >= 0) black = Math.max(black, 1 - Math.min(1, this.t / DIP));
    if (last) black = Math.max(black, Math.max(0, FADE - (this.dur - this.t)) / FADE);
    if (this.fadeEl) this.fadeEl.style.opacity = String(Math.min(1, black));
    if (this.barEl) this.barEl.style.width = `${((this.i + k) / this.rows.length) * 100}%`;

    if (this.lineEndedAt == null && this._lineFinished()) this.lineEndedAt = this.t;
    const started = !!this.voiceEl && this.voiceEl.currentTime > 0;
    if (beatOver(this.t, this.dur, this.lineEndedAt, started)) this._next();
    return this.active;
  }
}
