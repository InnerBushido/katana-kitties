import { drawPortrait } from './cutscene.js';

/* ---------------------------------------------------------------------------
   Mr Satan's pop-in card.

   The small sibling of the cutscene box: a portrait and one line, slid in over
   the corner of the screen while the game keeps running underneath.

   IT EXISTS BECAUSE MOST OF WHAT HE SAYS IS NOT WORTH A CUTSCENE. He calls the
   tournament five times on the way to 80% mischief, announces each round, and
   shouts when somebody goes down. Every one of those through the full-screen
   furniture would be eleven interruptions to a game about knocking things
   over — and a scene that takes the screen away from BOTH girls to say
   "seventy percent!" is the single most annoying thing this feature could
   ship. The two moments that really are events — the tournament opening, and
   winning it — still get the big box.

   IT NEVER TAKES THE INPUT. The girls keep playing straight through. That is
   the whole difference between this and a scene, and it is why `Game._skipPressed`
   and `_sceneActive` know nothing about it.
--------------------------------------------------------------------------- */

/** Slide in, slide out. Short — this is punctuation, not a scene. */
const SLIDE = 0.32;
/** Held after the line finishes, so the last word is readable. */
const HOLD_TAIL = 0.9;
/** Used when there is no recorded clip at all (a clone with no /voice). */
const SILENT_DUR = 3.2;

export class Announcer {
  /**
   * @param {object} o
   * @param {Audio} o.audio
   * @param {string} o.name    who is talking
   * @param {string} o.sub     their subtitle
   */
  constructor({ audio, name = 'MR. SATAN', sub = 'World Champion' }) {
    this.audio = audio;
    this.name = name;
    this.sub = sub;
    this.art = null;

    this.el = document.getElementById('announce');
    this.portraitEl = document.getElementById('an-portrait');
    this.nameEl = document.getElementById('an-name');
    this.textEl = document.getElementById('an-text');

    /** Lines waiting to be said. See `say`. */
    this.queue = [];
    this.current = null;
    this.t = 0;
    this.voiceEl = null;
    this._painted = false;

    /** Preloaded clips by id. Filled by `load`. */
    this.clips = new Map();
  }

  /** True while a card is on screen. */
  get active() { return !!this.current; }

  /**
   * Buffer every line at boot.
   *
   * SAME DISCIPLINE AS THE CUTSCENE, AND FOR A SHARPER REASON. These fire
   * mid-play, at a moment nothing is waiting for them — the intro at least
   * has a loading screen in front of it. A clip fetched at the instant Mr
   * Satan opens his mouth arrives a second late over a game that has already
   * moved on, and `loadedmetadata` is not enough: it resolves on the header,
   * so a file can report a perfect duration having never had its body
   * fetched. `canplaythrough` is the event that means what it says.
   *
   * @param {Record<string,string>} lines  id -> url
   */
  async load(lines) {
    await Promise.all(Object.entries(lines).map(([id, url]) => new Promise((resolve) => {
      const el = new window.Audio();
      el.preload = 'auto';
      const done = (ok) => {
        if (ok && Number.isFinite(el.duration) && el.duration > 0) {
          this.clips.set(id, { el, dur: el.duration });
        }
        resolve();
      };
      el.addEventListener('canplaythrough', () => done(true), { once: true });
      el.addEventListener('loadedmetadata', () => setTimeout(() => done(true), 1500), { once: true });
      el.addEventListener('error', () => done(false), { once: true });
      setTimeout(() => done(Number.isFinite(el.duration)), 4000);
      el.src = url;
    })));
    console.log(`[voice] ${this.clips.size}/${Object.keys(lines).length} announcer lines recorded`);
  }

  /**
   * Say a line, now or as soon as the current one is finished.
   *
   * QUEUED RATHER THAN INTERRUPTING. These are triggered by things the girls
   * do, and the things they do come in bursts: a dragon strafing a market
   * street can cross 70%, 75% and 80% inside four seconds. Cutting Mr Satan
   * off mid-word three times is worse than hearing him three times, and
   * dropping the later ones loses the one that actually opens the arena.
   *
   * @param {string} id   key into the preloaded clips
   * @param {string} text what he says, on screen
   */
  say(id, text) {
    this.queue.push({ id, text });
  }

  /** Throw away anything pending — used when the tournament is torn down. */
  clear() {
    this.queue.length = 0;
    this._end();
  }

  _start(item) {
    this.current = item;
    this.t = 0;
    this.textEl.textContent = item.text;
    this.nameEl.textContent = `${this.name}  ·  ${this.sub}`;
    this.el.classList.remove('hidden');
    this.el.classList.add('in');

    /* The portrait is painted ONCE, lazily, and then left alone. It is the
       same square crop the cutscene box uses (`drawPortrait`), which is
       measured off the sheet's own content rather than off the whole image —
       see the portrait note in HANDOFF, where taking the crop off the image
       squashed every leader's face by more than half. */
    if (this.art && !this._painted) {
      drawPortrait(this.portraitEl, this.art, '#ffd24a');
      this._painted = true;
    }

    const clip = this.clips.get(item.id);
    this.dur = clip ? clip.dur + HOLD_TAIL : SILENT_DUR;
    this.voiceEl = clip ? (this.audio?.speak(clip.el) ?? null) : null;
  }

  _end() {
    this.current = null;
    this.voiceEl = null;
    this.el.classList.add('hidden');
    this.el.classList.remove('in');
  }

  update(dt) {
    if (!this.current) {
      if (this.queue.length) this._start(this.queue.shift());
      return;
    }
    this.t += dt;

    /* Ends on the LINE, not on the clock — the same rule the cutscene beats
       follow. A card that vanishes while he is still talking is worse here
       than in a scene, because there is no dialogue box left behind to read:
       the words go with it. The clock is the floor and a very loose ceiling
       covers a `play()` the browser refused, which never starts at all. */
    const el = this.voiceEl;
    const playing = el && !el.ended && el.currentTime > 0;
    const spoken = !el || el.ended || (el.currentTime > 0 && el.currentTime >= this.dur - HOLD_TAIL - 0.06);
    const over = this.t >= this.dur && (spoken || !playing);
    if (over || this.t > this.dur + 6) this._end();
  }
}
