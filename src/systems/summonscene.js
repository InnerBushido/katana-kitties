import * as THREE from 'three';
import { beatOver, TAIL } from './cutscene.js';

/* ---------------------------------------------------------------------------
   The two story beats of the dragon hunt.

   FOUND   fires the moment the seventh star is picked up, wherever the girls
           are standing. Patchfur tells them what they have and where to take
           it, which is the only thing standing between "I collected seven
           shiny balls" and knowing there is a dragon at the end of it.

   SUMMON  fires when somebody walks up to Ryuuseki for the first time. The sky
           goes dark across it and stays dark while he is in the world.

   BOTH ARE SKIPPABLE AND BOTH FIRE ONCE. Same rule as the shrine scenes and
   for the same reason — the second time is an obstacle between a kid and a
   dragon she has already been introduced to.

   THE SKY IS THE SCENE'S JOB, NOT THE DRAGON'S. `dusk` is driven from here and
   handed to the world every frame, so the darkening is tied to the moment
   rather than to a flag somebody might forget to clear. Ryuuseki leaving the
   world puts it back.
--------------------------------------------------------------------------- */

const FADE = 0.5;
const TYPE_SPEED = 34;

/** How dark the sky goes when he is out, 0..1. */
export const DUSK_DEEP = 0.86;
/** Seconds the sky takes to fall, and to come back. Falling is slower. */
export const DUSK_FALL = 3.2;
export const DUSK_LIFT = 1.6;

export const SCRIPTS = {
  found: [
    {
      id: 'balls1', who: 'Patchfur', sub: 'Calico',
      voice: '/voice/balls1.mp3',
      text: 'Seven stars. You found all seven. Nobody has held them together since before the islands broke apart.',
    },
    {
      id: 'balls2', who: 'Patchfur', sub: 'Calico',
      voice: '/voice/balls2.mp3',
      text: 'Take them to the great torii, both of you. And when the sky goes dark, do not run.',
    },
  ],
  summon: [
    {
      id: 'summon1', who: 'Ryuuseki', sub: 'The Wish That Waits',
      voice: '/voice/summon1.mp3',
      text: 'I am Ryuuseki. The wish that waits. Seven stars have called me out of the storm.',
    },
    {
      id: 'summon2', who: 'Ryuuseki', sub: 'The Wish That Waits',
      voice: '/voice/summon2.mp3',
      text: 'One of you will steer. One of you will burn. Alone, you may ride me. Together, you will light the whole sky.',
    },
  ],
};

export class SummonScene {
  constructor({ world, audio }) {
    this.world = world;
    this.audio = audio;
    this.active = false;
    this.script = null;
    this.beat = 0;
    this.played = { found: false, summon: false };

    /** 0..1, how dark the sky is right now. Owned here, applied by the game. */
    this.dusk = 0;
    this.duskWant = 0;

    this.camera = new THREE.PerspectiveCamera(54, 16 / 9, 0.1, 4000);
    this._look = new THREE.Vector3();
    this.focus = new THREE.Vector3();

    this.el = document.getElementById('cutscene');
    this.boxEl = document.getElementById('cs-box');
    this.nameEl = document.getElementById('cs-name');
    this.textEl = document.getElementById('cs-text');
    this.portraitEl = document.getElementById('cs-portrait');
    this.fadeEl = document.getElementById('cs-fade');
    this.barEl = document.getElementById('cs-progress');
  }

  /** Preload every line of both scripts. Same discipline as the intro. */
  async load() {
    const all = [...SCRIPTS.found, ...SCRIPTS.summon];
    await Promise.all(all.map((b) => new Promise((resolve) => {
      const el = new window.Audio();
      el.preload = 'auto';
      const done = (ok) => {
        if (ok && Number.isFinite(el.duration) && el.duration > 0) {
          b.el = el;
          b.voiceDur = el.duration;
          b.dur = el.duration + TAIL;
          b.typeRate = b.text.length / Math.max(0.6, el.duration * 0.72);
        } else {
          b.el = null;
          b.voiceDur = 0;
          b.dur = 7;
        }
        resolve();
      };
      el.addEventListener('canplaythrough', () => done(true), { once: true });
      el.addEventListener('loadedmetadata', () => setTimeout(() => done(true), 1500), { once: true });
      el.addEventListener('error', () => done(false), { once: true });
      setTimeout(() => done(Number.isFinite(el.duration)), 4000);
      el.src = b.voice;
    })));
    const n = all.filter((b) => b.el).length;
    console.log(`[voice] ${n}/${all.length} dragon-hunt lines recorded`);
  }

  /**
   * @param {'found'|'summon'} which
   * @param {THREE.Vector3} focus what the camera should be looking at
   * @param {number} [radius] how big the subject is, in world units.
   *        The summon shot is FRAMED OFF THIS rather than off a fixed
   *        distance. Ryuuseki's quad is about 60 units across — a hardcoded
   *        46, which is a perfectly good distance for a 13-unit storm dragon,
   *        put the camera inside him and filled the screen with a green wall.
   *        A shot of something enormous has to know it is enormous.
   */
  start(which, focus, radius = 30) {
    this.radius = radius;
    if (this.active || this.played[which]) return false;
    this.played[which] = true;
    this.active = true;
    this.script = SCRIPTS[which];
    this.which = which;
    this.focus.copy(focus);
    this.beat = -1;
    this.fadeIn = FADE;
    this.el.classList.remove('hidden');
    // No portrait: the speaker is either off flying somewhere or filling the
    // screen behind the box. A blank 96px square would be furniture for its
    // own sake.
    this.portraitEl.style.display = 'none';
    if (which === 'summon') this.duskWant = DUSK_DEEP;
    this._next();
    return true;
  }

  _next() {
    this.beat++;
    if (this.beat >= this.script.length) { this.finish(); return; }
    const b = this.script[this.beat];
    this.t = 0;
    this.typed = 0;
    this.lineEndedAt = null;
    this.textEl.textContent = '';
    const color = this.which === 'summon' ? '#ffe07a' : '#e8c98a';
    this.nameEl.textContent = `${b.who}  ·  ${b.sub}`;
    this.nameEl.style.color = color;
    this.boxEl.style.setProperty('--cs-accent', color);
    this.voiceEl = this.audio?.speak(b.el ?? b.voice) ?? null;
  }

  skip() { if (this.active) this.finish(); }

  finish() {
    this.active = false;
    this.script = null;
    this.el.classList.add('hidden');
    this.portraitEl.style.display = '';
    /* Clear the black. `#cs-fade` is SHARED with the opening cutscene and the
       shrine scenes, and this one ends on a fade-out — leaving it at full
       means the next scene to use the element opens on a black frame before
       its own first update overwrites it. Hidden is not the same as reset. */
    this.fadeEl.style.opacity = 0;
    this.barEl.style.width = '0%';
    this.audio?.stopSpeaking();
    this.voiceEl = null;
  }

  /** Sky back to sunset — called when Ryuuseki leaves the world. */
  clearDusk() { this.duskWant = 0; }

  /** Ease the sky toward its target. Runs every frame, scene or no scene. */
  updateDusk(dt) {
    const rate = this.duskWant > this.dusk ? dt / DUSK_FALL : dt / DUSK_LIFT;
    if (this.dusk < this.duskWant) this.dusk = Math.min(this.duskWant, this.dusk + rate);
    else this.dusk = Math.max(this.duskWant, this.dusk - rate);
    return this.dusk;
  }

  update(dt) {
    if (!this.active) return false;
    this.t += dt;
    this.fadeIn = Math.max(0, this.fadeIn - dt);
    const b = this.script[this.beat];

    /* The shot. FOUND looks down on the town from high and slides sideways —
       it is about a place you are being sent to. SUMMON is a low angle circling
       him, because the one thing the camera has to say is that he is enormous.
     */
    const k = Math.min(1, this.t / Math.max(0.001, b.dur));
    const ease = 1 - (1 - k) * (1 - k);
    const F = this.focus;
    if (this.which === 'summon') {
      /* Circling, from below. 1.55x his own size fits the whole creature with
         air around it; the dolly-in is a fraction of that rather than a fixed
         number of units, so the shot holds whatever he is scaled to. */
      const a = -0.6 + ease * 0.7 + this.beat * 0.9;
      const dist = this.radius * (1.55 - ease * 0.13);
      this.camera.position.set(
        F.x + Math.sin(a) * dist,
        F.y - this.radius * 0.22 + ease * this.radius * 0.1,
        F.z + Math.cos(a) * dist
      );
      this._look.set(F.x, F.y + this.radius * 0.06, F.z);
    } else {
      const a = 0.5 + ease * 0.35 + this.beat * 0.5;
      this.camera.position.set(
        F.x + Math.sin(a) * 66,
        F.y + 42 - ease * 6,
        F.z + Math.cos(a) * 66
      );
      this._look.set(F.x, F.y + 4, F.z);
    }
    this.camera.lookAt(this._look);

    // --- typewriter on the audio's playhead. See Cutscene.update.
    const clock = (this.voiceEl && b.voiceDur && this.voiceEl.currentTime > 0)
      ? this.voiceEl.currentTime
      : this.t;
    const want = Math.floor(clock * (b.typeRate ?? TYPE_SPEED));
    if (want > this.typed && this.typed < b.text.length) {
      this.typed = Math.min(b.text.length, want);
      this.textEl.textContent = b.text.slice(0, this.typed);
    }

    const before = this.script.slice(0, this.beat).reduce((s, x) => s + x.dur, 0);
    const total = this.script.reduce((s, x) => s + x.dur, 0);
    this.barEl.style.width = `${((before + this.t) / total) * 100}%`;
    const last = this.beat === this.script.length - 1;
    const fadeOut = Math.max(0, FADE - (b.dur - this.t)) / FADE;
    this.fadeEl.style.opacity = Math.max(this.fadeIn / FADE, last ? Math.min(1, fadeOut) : 0);

    if (this.lineEndedAt == null && this._lineFinished(b)) this.lineEndedAt = this.t;
    const started = !!this.voiceEl && this.voiceEl.currentTime > 0;
    if (beatOver(this.t, b.dur, this.lineEndedAt, started)) this._next();
    return this.active;
  }

  _lineFinished(b) {
    const el = this.voiceEl;
    if (!el || !b.voiceDur) return true;
    if (el.ended) return true;
    return el.currentTime > 0 && el.currentTime >= b.voiceDur - 0.06;
  }

  faceCamera() { /* nothing on stage */ }
}
