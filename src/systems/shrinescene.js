import * as THREE from 'three';
import { leaderSpot, FACE_BIAS_MAX } from '../entities/leader.js';
import { beatOver, LINE_TAIL, TAIL } from './cutscene.js';

/* ---------------------------------------------------------------------------
   The shrine scene: a clan leader introducing herself, once.

   Before this, a leader was a drawing with a speech bubble you could walk past
   without reading, and joining her clan was pressing a button at some
   stonework. The bubble names the buff — but a bubble is scenery, and a
   nine-year-old walking a kitten across an island does not stop to read
   scenery. So the leader stops her: stand near her for two seconds and she
   takes the screen, in the same furniture the opening cutscene uses, and tells
   you who she is in her own recorded voice.

   THREE RULES, and each of them is the difference between a scene and a
   nuisance:

   1. ONCE. Ever. `leader.met` latches the moment the scene STARTS, not when it
      ends, so skipping still spends it. A cutscene that replays every time a
      kitten crosses a dais would be the single most irritating thing in the
      game — and the dais is exactly where both girls stand around, because
      that is where the join ring is.

   2. IT GATES JOINING. You cannot swear to a clan you have not been introduced
      to. That is the whole reason the scene can afford to be full-screen: it is
      not an interruption on the way to the buff, it IS the way to the buff.

   3. THE DWELL IS TWO SECONDS OF STANDING STILL-ISH, not of touching the
      radius. Kittens sprint over shrines constantly on the way somewhere else,
      and firing a cutscene at someone running past is how you teach a kid to
      avoid the shrine island.
--------------------------------------------------------------------------- */

/** How close you have to be, and for how long, before she speaks up. */
export const SCENE_RADIUS = 10;
export const DWELL = 2.0;

/** Seconds of black at each end, matching the opening cutscene's furniture. */
const FADE = 0.5;
/** Fallback typing speed when a line has no recording. */
const TYPE_SPEED = 34;

export { FACE_BIAS_MAX };

export class ShrineScene {
  constructor({ world, audio }) {
    this.world = world;
    this.audio = audio;
    this.active = false;
    this.leader = null;
    this.player = null;
    this.voiceEl = null;
    this.lineEndedAt = null;

    this.camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 4000);
    this._look = new THREE.Vector3();

    this.el = document.getElementById('cutscene');
    this.boxEl = document.getElementById('cs-box');
    this.nameEl = document.getElementById('cs-name');
    this.textEl = document.getElementById('cs-text');
    this.portraitEl = document.getElementById('cs-portrait');
    this.fadeEl = document.getElementById('cs-fade');
    this.barEl = document.getElementById('cs-progress');

    /** Per-leader dwell timers, keyed by clan id. */
    this.dwell = new Map();
  }

  /**
   * Preload every leader's line, exactly the way the opening cutscene does.
   *
   * Same reasoning, same trap: an element built at the moment she is supposed
   * to speak has to fetch and decode inside the beat's own budget, and the
   * beat is sized as `line + TAIL`. See Cutscene.loadVoices — this is the
   * short version of the same fix, and it must not drift from it.
   */
  async load(leaders) {
    await Promise.all(leaders.map((L) => new Promise((resolve) => {
      const url = L.spec?.voice;
      if (!url) { L.voiceDur = 0; resolve(); return; }
      const el = new window.Audio();
      el.preload = 'auto';
      const done = (ok) => {
        if (ok && Number.isFinite(el.duration) && el.duration > 0) {
          L.voiceEl = el;
          L.voiceDur = el.duration;
          L.sceneDur = el.duration + TAIL;
          L.typeRate = L.textLine.length / Math.max(0.6, el.duration * 0.72);
        } else {
          L.voiceEl = null;
          L.voiceDur = 0;
          L.sceneDur = 6.5;
        }
        resolve();
      };
      el.addEventListener('canplaythrough', () => done(true), { once: true });
      el.addEventListener('loadedmetadata', () => setTimeout(() => done(true), 1500), { once: true });
      el.addEventListener('error', () => done(false), { once: true });
      setTimeout(() => done(Number.isFinite(el.duration)), 4000);
      el.src = url;
    })));
    const n = leaders.filter((L) => L.voiceEl).length;
    console.log(`[voice] ${n}/${leaders.length} shrine lines recorded`);
  }

  /* --------------------------- the dwell trigger ------------------------- */

  /**
   * Watch every leader for a kitten loitering, and start a scene if one does.
   *
   * Returns the scene's owner if one started this frame, else null.
   *
   * The timer RESETS the moment she leaves, rather than decaying, because a
   * kitten pacing in and out of the radius should not accumulate her way into
   * a cutscene she is plainly not stopping for.
   */
  watch(dt, leaders, players) {
    if (this.active) return null;
    for (const L of leaders) {
      if (L.met) continue;
      let who = null;
      for (const p of players) {
        // Not while flying: a kitten passing overhead on a dragon has not
        // arrived anywhere, and taking the screen off her mid-flight is theft.
        if (p.mount) continue;
        const d = Math.hypot(p.position.x - L.position.x, p.position.z - L.position.z);
        if (d < SCENE_RADIUS) { who = p; break; }
      }
      const key = L.clan.id;
      if (!who) { this.dwell.set(key, 0); continue; }
      const t = (this.dwell.get(key) ?? 0) + dt;
      this.dwell.set(key, t);
      if (t >= DWELL) { this.start(L, who); return who; }
    }
    return null;
  }

  /* ------------------------------ playback ------------------------------- */

  start(leader, player) {
    if (this.active) return;
    this.active = true;
    /* LATCHES HERE, not in finish(). Skipping spends the introduction — the
       player has been shown who this is and the clan unlocks either way. A
       scene that only counts when watched to the end is a scene that replays
       at a kid who already decided she didn't want it. */
    leader.met = true;

    this.leader = leader;
    this.player = player;
    this.t = 0;
    this.typed = 0;
    this.fadeIn = FADE;
    this.lineEndedAt = null;

    const spec = leader.spec;
    const color = `#${leader.clan.color.toString(16).padStart(6, '0')}`;
    this.nameEl.textContent = `${spec.name}  ·  ${spec.breed}`;
    this.nameEl.style.color = color;
    this.boxEl.style.setProperty('--cs-accent', color);
    this.textEl.textContent = '';
    this._setPortrait(leader.art, color);
    this.el.classList.remove('hidden');

    // She turns toward whoever stopped in front of her.
    leader.lookAt(player.position);

    this.dur = leader.sceneDur ?? 6.5;
    this.voiceEl = this.audio?.speak(leader.voiceEl ?? spec.voice) ?? null;
    this.audio?.sfx?.('clan');
  }

  skip() {
    if (this.active) this.finish();
  }

  finish() {
    this.active = false;
    this.el.classList.add('hidden');
    this.audio?.stopSpeaking();
    this.leader?.lookAt(null);
    this.leader = null;
    this.player = null;
    this.voiceEl = null;
    this.lineEndedAt = null;
  }

  /** Same crop as the opening cutscene's portrait — square, off the cell. */
  _setPortrait(art, color) {
    const cv = this.portraitEl;
    const img = art?.texture?.image;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    this.portraitEl.style.display = img ? '' : 'none';
    if (!img) return;
    const cell = img.width / (art.cols || 1);
    const figure = cell * (art.contentScale ?? 0.7);
    const head = cell * (1 - (art.pad ?? 0.06)) - figure;
    const side = Math.min(figure * 0.55, cell);
    const sx = Math.max(0, Math.min(cell - side, cell / 2 - side / 2));
    const sy = Math.max(0, Math.min(img.height - side, head - side * 0.08));
    g.drawImage(img, sx, sy, side, side, 0, 0, cv.width, cv.height);
    cv.style.borderColor = color;
  }

  faceCamera() { /* nothing on stage — she is really standing there */ }

  /**
   * Advance one frame. Returns true while the scene owns the screen.
   *
   * THE SHOT IS TAKEN FROM THE PLAYER'S SIDE. The camera sits behind and above
   * the kitten who stopped, looking past her at the leader, and dollies in.
   * Framing it from the leader's own axis (which is what the opening cutscene
   * does) would have been less code and is wrong here: the intro is showing
   * you a place, this is showing you a conversation you just walked into, and
   * the shot has to agree about which way you arrived from.
   */
  update(dt) {
    if (!this.active) return false;
    this.t += dt;
    this.fadeIn = Math.max(0, this.fadeIn - dt);

    const L = this.leader;
    const spot = leaderSpot(this.world.clanHalls.find((h) => h.clan === L.clan), this.world);
    const head = spot.y + 3.0;

    // Direction from her to the player, flattened — the axis of the shot.
    const dx = this.player.position.x - spot.x;
    const dz = this.player.position.z - spot.z;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;

    /* Dolly from 15 to 10.5 units. The opening cutscene learned this the hard
       way at 19: a 4.2-unit character further out than about 15 stops being
       someone talking to you and becomes someone standing on an island. */
    const k = Math.min(1, this.t / Math.max(0.001, this.dur));
    const ease = 1 - (1 - k) * (1 - k);
    const dist = 15 - ease * 4.5;
    // A little to one side, so it is a shot rather than a passport photo.
    const side = 0.34;
    this.camera.position.set(
      spot.x + ux * dist + -uz * dist * side,
      head + 2.6 - ease * 0.7,
      spot.z + uz * dist + ux * dist * side
    );
    this._look.set(spot.x, head, spot.z);
    this.camera.lookAt(this._look);

    // --- typewriter, on the audio's own playhead. See Cutscene.update.
    const clock = (this.voiceEl && L.voiceDur && this.voiceEl.currentTime > 0)
      ? this.voiceEl.currentTime
      : this.t;
    const text = L.textLine;
    const want = Math.floor(clock * (L.typeRate ?? TYPE_SPEED));
    if (want > this.typed && this.typed < text.length) {
      this.typed = Math.min(text.length, want);
      this.textEl.textContent = text.slice(0, this.typed);
    }

    this.barEl.style.width = `${Math.min(1, this.t / this.dur) * 100}%`;
    const fadeOut = Math.max(0, FADE - (this.dur - this.t)) / FADE;
    this.fadeEl.style.opacity = Math.max(this.fadeIn / FADE, Math.min(1, fadeOut));

    // --- over when the authored time has run AND she has finished speaking.
    if (this.lineEndedAt == null && this._lineFinished()) this.lineEndedAt = this.t;
    const started = !!this.voiceEl && this.voiceEl.currentTime > 0;
    if (beatOver(this.t, this.dur, this.lineEndedAt, started)) this.finish();
    return this.active;
  }

  _lineFinished() {
    const el = this.voiceEl;
    const d = this.leader?.voiceDur;
    if (!el || !d) return true;
    if (el.ended) return true;
    return el.currentTime > 0 && el.currentTime >= d - 0.06;
  }
}

export { LINE_TAIL };
