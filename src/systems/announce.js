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

   AND IT IS NOT ONLY HIS ANY MORE. Patchfur counts the last five pieces of
   mischief down over this same card — see `systems/lasthunt.js` — and the
   reason she borrows it rather than getting her own is the QUEUE. There is one
   `#announce` in the document and there has to be: two cards would be two
   speakers talking over each other in the same corner of the screen, and the
   moment the two of them can collide is exactly the moment this feature
   exists for (the last barrel in the world is also, often, the one that crosses
   80% and opens the tournament). One queue means they take turns, which is
   what people do.

   So the SPEAKER travels with the line rather than with the announcer. See
   `say`'s third argument. --------------------------------------------------- */

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
    /** Who the card is currently dressed as, so a repaint only happens when
     *  the speaker actually changes. `drawPortrait` is a canvas draw off a
     *  sprite sheet; doing it per line was the cost `_painted` was added to
     *  avoid, and that reasoning survives more than one speaker. */
    this._dressed = null;

    this.el = document.getElementById('announce');
    this.portraitEl = document.getElementById('an-portrait');
    this.nameEl = document.getElementById('an-name');
    this.textEl = document.getElementById('an-text');

    /** Lines waiting to be said. See `say`. */
    this.queue = [];
    this.current = null;
    this.t = 0;
    this.voiceEl = null;

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
   * @param {?{name: string, sub: string, art: object, colour: string}} who
   *        the speaker, when it is not the announcer this was built as. The
   *        card is dressed from this — name, subtitle, portrait and the one
   *        accent colour the border, the portrait frame and the name share.
   */
  say(id, text, who = null) {
    this.queue.push({ id, text, who });
  }

  /**
   * The preloaded clip for `id`, or null.
   *
   * FOR A CLIP THAT IS PLAYED RATHER THAN SAID. Everything else here goes on a
   * card, which is right for a sentence and wrong for the last five seconds of
   * a round: those are five numbers, and the number is already on the screen
   * eighty pixels high. Reported as exactly that — "the countdown text can just
   * be displayed in the center of the screen, does not need to be in a speech
   * bubble since that is only for text/sentences that he is saying".
   *
   * The caller plays it through `Audio.speak` and is responsible for stopping
   * it. This is only the BUFFER, which is the part worth sharing — see `load`
   * for why nothing in this game fetches a line at the moment it needs it.
   *
   * @param {string} id
   * @returns {{el: HTMLAudioElement, dur: number}|null}
   */
  clip(id) { return this.clips.get(id) ?? null; }

  /**
   * Throw away anything pending — used when the tournament is torn down.
   *
   * IT DOES NOT STOP AUDIO THAT IS ALREADY PLAYING, deliberately: a line that
   * is mid-word when the queue is emptied still finishes, because cutting him
   * off mid-syllable is the thing `say` exists not to do. Anything that needs
   * him actually silenced has to say so — `Audio.stopSpeaking`.
   */
  clear() {
    this.queue.length = 0;
    this._end();
  }

  _start(item) {
    this.current = item;
    this.t = 0;
    /* WHOEVER THIS LINE BELONGS TO, falling back to whoever this announcer was
       built as. A line with no speaker is Mr Satan's, which is every line this
       card carried before Patchfur started using it. */
    const who = item.who ?? { name: this.name, sub: this.sub, art: this.art, colour: '#ffd24a' };
    this.textEl.textContent = item.text;
    this.nameEl.textContent = `${who.name}  ·  ${who.sub}`;
    this.el.classList.remove('hidden');
    this.el.classList.add('in');

    /* The portrait is painted ONCE PER SPEAKER, lazily, and then left alone.
       It is the same square crop the cutscene box uses (`drawPortrait`), which
       is measured off the sheet's own content rather than off the whole image —
       see the portrait note in HANDOFF, where taking the crop off the image
       squashed every leader's face by more than half.

       KEYED ON THE ART rather than on a boolean, because the card has two
       speakers now and `_painted` would have left Mr Satan's face over
       Patchfur's line. A missing sheet leaves whatever was there, which is the
       ninth non-negotiable's answer: the words are the line, the face is the
       dressing. */
    if (who.art && this._dressed !== who.art) {
      drawPortrait(this.portraitEl, who.art, who.colour ?? '#ffd24a');
      this._dressed = who.art;
    }
    /* THE ONE ACCENT, SET IN ONE PLACE. The border, the portrait frame and the
       name all read `--an-accent` in the stylesheet, so a speaker is a colour
       and not three rules that have to be kept in step. */
    this.el.style.setProperty('--an-accent', who.colour ?? 'var(--gold)');

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
