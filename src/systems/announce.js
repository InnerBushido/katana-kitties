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
/**
 * The breath between two pieces of a line said in pieces — the roll call
 * (`rollCall` in tournament.js). The pieces are trimmed to the word by
 * tools/capture/satan-rollcall.mjs, so this is ALL the space there is between
 * "EMBER!" and "VERSUS!": a ring announcer's beat, not a sentence's run-on.
 */
export const ROLL_GAP = 0.12;

/* ---------------------------------------------------------------------------
   THE WORDS APPEAR AS HE SAYS THEM.

   "we should also have the text 'appear on screen as it is spoken' so that we
   don't have so much text on the screen needlessly ... [on PC/Web it] should
   appear on the screen as the text is spoken, at least for the longer text
   boxes spoken more than 10 or so words long."

   A WORD AT A TIME, NOT A LETTER. The cutscene types letters because its box
   is a fixed size and the words reflow inside it; this card is one line on a
   phone and a letter-by-letter crawl across the end of that line reads as a
   progress bar rather than as speech.

   ON THE VOICE'S OWN PLAYHEAD, and only when there IS a voice. A line with no
   clip plays silent on the clock (`SILENT_DUR`), and revealing that on a timer
   would be inventing a pace nobody is speaking at, so it is shown whole. The
   clock the reveal reads is the audio's `currentTime` once it has started, for
   the reason `cutscene.js` gives at its own `typeRate`: a line that starts
   late must type late with it, or the words finish and sit there while he is
   still talking.

   A PHONE REVEALS EVERY VOICED LINE; a desktop only the ones longer than
   `REVEAL_WORDS`. The phone's card is ONE line (see `body.touch-ui #announce`)
   and keeps the newest words at its right-hand end, so anything that does not
   fit is the oldest words sliding off the left, which only reads right if the
   words arrive in the order he says them. A desktop card holds two lines, and
   a short line popping in whole is how it has always read. */
export const REVEAL_WORDS = 10;
/**
 * The fraction of the clip the words are spread over: they are all up by 72%
 * of the way through it. The same ratio the cutscene types at (`typeRate` in
 * cutscene.js), for the same reason: a recording runs past its last word (a
 * shout held, a breath, a trailing laugh), and words that finish with the
 * audio lag behind the mouth for the whole line.
 */
export const REVEAL_LEAD = 0.72;

/**
 * Each word of a line, and how far through the line (0..1, by characters) it
 * STARTS. Characters rather than word count because "FIFTEEN" takes longer to
 * say than "a", and the recording is all the timing there is.
 * @param {string} text
 * @returns {{w: string, at: number}[]}
 */
export function revealPlan(text) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const total = Math.max(1, words.join(' ').length);
  let at = 0;
  return words.map((w) => {
    const x = { w, at: at / total };
    at += w.length + 1;
    return x;
  });
}

/**
 * How many words are up at `progress` (0..1 through the spoken part). Never
 * fewer than one: a card that slides in empty reads as a card with nothing to
 * say, and the first word is the one he has just opened his mouth on.
 */
export function revealCount(plan, progress) {
  if (!plan?.length) return 0;
  let k = 0;
  while (k < plan.length && plan[k].at <= progress + 1e-9) k++;
  return Math.max(1, k);
}

export class Announcer {
  /**
   * @param {object} o
   * @param {Audio} o.audio
   * @param {string} o.name    who is talking
   * @param {string} o.sub     their subtitle
   * @param {() => boolean} [o.touch]  is this a phone: the one-line card, and
   *        every voiced line revealed as it is said. A getter because the
   *        device can be switched in Settings without a reload.
   */
  constructor({ audio, name = 'MR. SATAN', sub = 'World Champion', touch = () => false }) {
    this.audio = audio;
    this.touch = touch;
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

    /** Refusing every line, and holding no card. Set for the ending and
     *  nothing else — see `hush`. */
    this.hushed = false;
    /** Lines waiting to be said. See `say`. */
    this.queue = [];
    this.current = null;
    this.t = 0;
    /** How long the card stays after the last word — `HOLD_TAIL`, unless the
     *  line asked for less (`interrupt`). */
    this.tail = HOLD_TAIL;
    this.voiceEl = null;
    /** The pieces of a line still to be said after `voiceEl`, and how long
     *  the current one is — see `say` with an array. */
    this.seq = [];
    this.pieceDur = 0;
    this._gapT = 0;

    /* THE REVEAL (see `REVEAL_WORDS`). `_plan` is the line's words, `_spans`
       the element per word (null when the host has no DOM to build them in,
       in which case the line is plain text and shown whole), `_shown` how many
       are up, `_voiceTotal` the seconds of recording the words are spread
       over and `_spokenBefore` the seconds of it already said by pieces that
       have finished. */
    this._plan = [];
    this._spans = null;
    this._line = null;
    this._shown = -1;
    this._reveal = false;
    this._touch = false;
    this._voiceTotal = 0;
    this._spokenBefore = 0;

    /** Preloaded clips by id. Filled by `load`. */
    this.clips = new Map();
  }

  /** True while a card is on screen. */
  get active() { return !!this.current; }

  /**
   * True while he still has something to SAY — a line in his mouth, or one
   * waiting. Not `active`: the card holds `HOLD_TAIL` past his last word so it
   * can be read, and a round that waited on the card would stand there for
   * nearly a second of silence. See `Tournament`'s card beat.
   */
  get talking() {
    if (this.queue.length) return true;
    if (!this.current) return false;
    if (this.seq.length) return true;
    /* THE VOICE ITSELF when it is playing — the same test `update` ends the
       card on — and the clock when it is not (no clip, or a `play()` the
       browser has not started yet). */
    const el = this.voiceEl;
    if (el?.ended) return false;
    if (el && el.currentTime > 0) return el.currentTime < this.pieceDur - 0.06;
    return this.t < this.dur - this.tail;
  }

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
   * @param {string|string[]} id  key into the preloaded clips — or several,
   *        said back to back `ROLL_GAP` apart, on the one card. ALL OR
   *        NOTHING: a line missing one of its pieces is a sentence with a hole
   *        in it (a roll call with a name left out), so it plays silent on the
   *        clock like any line with no clip at all.
   * @param {string} text what he says, on screen
   * @param {?{name: string, sub: string, art: object, colour: string}} who
   *        the speaker, when it is not the announcer this was built as. The
   *        card is dressed from this — name, subtitle, portrait and the one
   *        accent colour the border, the portrait frame and the name share.
   * @param {number[]} [o.pieces] for a line said in several clips: how many of
   *        its words each clip says, in order. With it the words go up as the
   *        clip that says them plays; without it a pieced line is shown whole.
   */
  say(id, text, who = null, { pieces = null } = {}) {
    if (this.hushed) return;
    this.queue.push({ id, text, who, pieces });
  }

  /**
   * Put somebody else's line on the card, FOLLOWING a voice that is already
   * playing — Lionheart's, in the Dream Dojo, whose clips are his own
   * (`LionVoice`) and not this card's. The words go up on that element's
   * playhead exactly as Mr Satan's go up on his, and the card goes when the
   * line does.
   *
   * ONLY ONTO AN EMPTY CARD. Everything `say` queues waits for its turn; this
   * cannot, because the voice it captions is already being said — a caption
   * that arrived after the line would be a transcript, not a subtitle. So it is
   * refused (false) when anybody has the card, and the caller's own bubble is
   * all there is for that line.
   *
   * @param {HTMLAudioElement} el  the voice, already playing
   * @param {number} dur           its length in seconds (0 if unknown)
   * @param {string} text
   * @param {object} who           the speaker, as for `say`
   * @returns {boolean} whether the card took it
   */
  follow(el, dur, text, who) {
    if (this.hushed || this.current || this.queue.length || !el) return false;
    this._start({ id: null, text, who, ext: { el, dur: dur > 0 ? dur : SILENT_DUR } });
    return true;
  }

  /** Is the card showing a line that follows `el`? */
  following(el) { return !!el && this.current?.ext?.el === el; }

  /**
   * Stop him NOW: the voice, the card and everything queued behind it.
   *
   * THE ONE PLACE A LINE IS CUT OFF ON PURPOSE, apart from `hush`. `say`
   * queues rather than interrupting because the things that make him talk
   * come in bursts; the round card is the opposite case — the girls are
   * standing on their marks waiting for him to finish, and asked for exactly
   * this: "User can speed this up by pressing esc/jump/swing buttons so they
   * don't have to wait for all his long speech to end before starting the
   * match, it will just cutoff his voice in that case".
   *
   * @returns {boolean} whether there was anything to cut
   */
  cut() {
    const had = !!this.current || this.queue.length > 0;
    this.queue.length = 0;
    if (this.current) {
      this.audio?.stopSpeaking();
      this._end();
    }
    return had;
  }

  /**
   * Say this line NOW, over whatever he was saying, and take the card down
   * `tail` seconds after the last word.
   *
   * FOR "FIGHT!", WHICH IS A SIGNAL AND NOT A SENTENCE. Queued, it was said
   * after the round had started — "Mr. Satans voice is lagging behind the
   * 'Fight' timing, his text is on screen still (taking up precious UI screen
   * space on mobile) and the fight has already started before he says 'Fight'"
   * — because his round line (6.2s) was still playing when the count ran out.
   * The round now waits for him (see the card beat), so there is normally
   * nothing to cut; this is the guarantee that the word and the gong are one
   * moment even when something else did get in. And the short tail is the
   * other half of the note: the card is gone as soon as the word is.
   */
  interrupt(id, text, who = null, { tail = HOLD_TAIL } = {}) {
    if (this.hushed) return;
    this.cut();
    this._start({ id, text, who, tail });
  }

  /**
   * Take the card away and keep it away — the ending, and nothing else.
   *
   * `clear()` IS NOT ENOUGH AND THAT IS THE WHOLE POINT OF THIS. It empties
   * the queue and deliberately lets a line that is mid-word finish, because
   * cutting somebody off mid-syllable is the thing `say` exists not to do.
   * There is exactly one moment in this game where that is the wrong answer:
   * the ending. Reported from play — "when playing the ending cutscene, if
   * there is any dialog happening (like by Patchfur counting down the final
   * mischief) the dialog should be cancelled and removed and not queued up if
   * the ending cutscene is being played or about to be played."
   *
   * And it is not a rare collision, it is the likely one. `lasthunt` says
   * "One! One last thing standing in the whole sky!" at one remaining, and the
   * prop that answers her is the hundredth percent — so without this the elder
   * is talking on a card in the corner while the elder starts talking in the
   * dialogue box. Two Patchfurs, over each other, in her own scene.
   *
   * THE REFUSAL IS THE OTHER HALF. Emptying the queue only deals with what has
   * already been said; `say` has to go on saying no for the whole minute, or
   * `lasthunt`'s stalled-hunt hint and Mr Satan's milestones queue up behind
   * the ending and the card slides in over the last shot.
   *
   * IT STOPS THE AUDIO ITSELF. `_end` does not — see `clear` — so this is the
   * one caller that has to, and `Game._startFinale` calls it BEFORE
   * `SummonScene.start` for that reason: `stopSpeaking` is global, and
   * afterwards it would take Patchfur's first sentence with it.
   */
  hush(on = true) {
    this.hushed = !!on;
    if (!on) return;
    this.queue.length = 0;
    if (this.current) {
      this.audio?.stopSpeaking();
      this._end();
    }
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
    this._touch = !!this.touch?.();
    this._plan = revealPlan(item.text);
    this._spans = this._paintWords(item.text);
    this._setName(who);
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

    /* A FOLLOWED VOICE (`follow`): somebody else's clip, already playing. It
       is not this card's to start, chain or stop — only to read the playhead
       of — so it stands in for a one-piece line and skips the rest. */
    if (item.ext) {
      this.tail = item.tail ?? HOLD_TAIL;
      this.dur = item.ext.dur + this.tail;
      this.pieceDur = item.ext.dur;
      this.voiceEl = item.ext.el;
      this.seq = [];
      this._gapT = 0;
      this._voiceTotal = item.ext.dur;
      this._spokenBefore = 0;
      this._piece = 0;
      this._pieces = null;
      this._reveal = !!this._spans && this._voiceTotal > 0 && (this._touch || this._plan.length > REVEAL_WORDS);
      this._shown = -1;
      this._showWords(this._reveal ? this._revealNow() : this._plan.length);
      return;
    }
    const ids = Array.isArray(item.id) ? item.id : [item.id];
    const clips = ids.map((id) => this.clips.get(id));
    const whole = clips.length > 0 && clips.every(Boolean);
    this.tail = item.tail ?? HOLD_TAIL;
    this.dur = whole
      ? clips.reduce((s, c) => s + c.dur, 0) + ROLL_GAP * (clips.length - 1) + this.tail
      : SILENT_DUR;
    this.pieceDur = whole ? clips[0].dur : 0;
    this.voiceEl = whole ? (this.audio?.speak(clips[0].el) ?? null) : null;
    /* Only queued behind a voice that actually started — with no audio there
       is nothing to chain off, and the clock above carries the card. */
    this.seq = this.voiceEl ? clips.slice(1) : [];
    this._gapT = 0;

    this._voiceTotal = this.voiceEl ? clips.reduce((s, c) => s + c.dur, 0) : 0;
    this._spokenBefore = 0;
    /* A LINE SAID IN PIECES IS REVEALED PIECE BY PIECE, OR NOT AT ALL.
       Richard: "When saying the players names in the tournament, the text
       appearing on screen is jumping around with the voice ... If we can't get
       the text synced with the voice when it is being said, then just show all
       the text at once".

       WHAT JUMPED: the reveal read ONE clock across the whole roll call, and
       between two pieces that clock was the card's own `t` - which counts the
       gaps and the moment before each `play()` starts - until the next clip's
       playhead moved, when it fell back to the seconds actually said. So words
       went up during each gap and came down again as the next name began, and
       a name came up by its share of the CHARACTERS, which is nothing like its
       share of the time ("Ember" is one word and a whole clip).

       NOW each clip owns its own words (`pieces`, from `rollCall`), which go
       up across that clip's own playhead and never before it starts. A pieced
       line that does not say which words are whose is shown whole; and in
       every case the count only ever goes up (`_showWords`). */
    this._piece = 0;
    this._pieces = null;
    if (clips.length > 1 && this.voiceEl) {
      const n = item.pieces;
      const fits = Array.isArray(n) && n.length === clips.length
        && n.reduce((s, k) => s + k, 0) === this._plan.length;
      if (fits) {
        let from = 0;
        this._pieces = n.map((k) => {
          const sub = { from, plan: revealPlan(this._plan.slice(from, from + k).map((x) => x.w).join(' ')) };
          from += k;
          return sub;
        });
      }
    }
    this._reveal = !!this._spans && this._voiceTotal > 0
      && (clips.length === 1 || !!this._pieces)
      && (this._touch || this._plan.length > REVEAL_WORDS);
    this._shown = -1;
    this._showWords(this._reveal ? revealCount(this._plan, 0) : this._plan.length);
  }

  /**
   * The line as one element per word, inside one `.an-line`.
   *
   * THE SPACE GOES INSIDE THE WORD AFTER IT, so a word that is not up yet
   * takes its space with it. On a phone an unsaid word is `display: none`, and
   * a bare space left between two of them would still be measured into the
   * line: the newest word would sit a space short of the right-hand edge.
   *
   * ONE WRAPPER, because the phone's card is a flex row anchored at its END
   * (the newest words), and a flex container drops the whitespace between its
   * children: words as direct children would be run together.
   *
   * Degrades to plain text wherever the host cannot build elements (the
   * check suite's stubs, for one), and a plain-text line is simply shown whole.
   */
  _paintWords(text) {
    const el = this.textEl;
    if (!el) return null;
    const doc = globalThis.document;
    const line = typeof el.replaceChildren === 'function' ? doc?.createElement?.('span') : null;
    if (!line || typeof line.appendChild !== 'function') {
      el.textContent = text;
      this._line = null;
      return null;
    }
    line.className = 'an-line';
    const spans = this._plan.map((x, i) => {
      const s = doc.createElement('span');
      s.textContent = (i ? ' ' : '') + x.w;
      line.appendChild(s);
      return s;
    });
    el.replaceChildren(line);
    this._line = line;
    return spans;
  }

  /**
   * Who is talking. The subtitle is its own element so a phone can drop it:
   * one line of card has no room for "World Champion", and the name alone, in
   * his colour, already says whose line it is.
   */
  _setName(who) {
    const el = this.nameEl;
    if (!el) return;
    const doc = globalThis.document;
    const a = typeof el.replaceChildren === 'function' ? doc?.createElement?.('span') : null;
    const s = a ? doc.createElement('span') : null;
    if (!a || !s || typeof a.appendChild !== 'function') {
      el.textContent = `${who.name}  ·  ${who.sub}`;
      return;
    }
    a.className = 'an-who';
    a.textContent = who.name;
    s.className = 'an-sub';
    s.textContent = `  ·  ${who.sub}`;
    el.replaceChildren(a, s);
  }

  /** Put the first `k` words up. Only touches the DOM when `k` changes.
   *  NEVER FEWER THAN ARE UP ALREADY while a line is being revealed: a word
   *  that goes up and comes down again is the "jumping around" this replaced. */
  _showWords(k) {
    if (this._reveal && this._shown > 0) k = Math.max(k, this._shown);
    if (!this._spans || k === this._shown) return;
    this._shown = k;
    this._spans.forEach((s, i) => { s.className = i < k ? '' : 'un'; });
    /* THE FADE ON THE LEFT, and only when there is something cut off to fade.
       Asked of the layout rather than guessed from a character count: the
       card's width is the phone's width and the type is a webfont. */
    if (this._touch && this._line && this.textEl?.classList) {
      const over = this._line.scrollWidth > this.textEl.clientWidth + 1;
      this.textEl.classList.toggle('over', over);
    }
  }

  /** How many words should be up now. One clip: by the line's characters
   *  across its playhead. Several: every word of the pieces already said, and
   *  this piece's own words across ITS playhead - none of them before it has
   *  started, all of them once it has ended (the gap before the next). */
  _revealNow() {
    if (!this._pieces) {
      return revealCount(this._plan, this._spokenClock() / (this._voiceTotal * REVEAL_LEAD));
    }
    const p = this._pieces[Math.min(this._piece, this._pieces.length - 1)];
    const el = this.voiceEl;
    const at = el && el.currentTime > 0 ? Math.min(el.currentTime, this.pieceDur) : 0;
    const said = el && (el.ended || at >= this.pieceDur - 0.01) ? p.plan.length
      : at > 0 ? revealCount(p.plan, at / (this.pieceDur * REVEAL_LEAD)) : (this._piece ? 0 : 1);
    return p.from + said;
  }

  /** Seconds of recording said so far, across every piece of the line. */
  _spokenClock() {
    const el = this.voiceEl;
    /* The cutscene's rule: the audio's own playhead once it is moving, and
       the card's clock until then (a `play()` the browser has not started, or
       one it refused). */
    if (el && el.currentTime > 0) return this._spokenBefore + Math.min(el.currentTime, this.pieceDur);
    return Math.max(this._spokenBefore, this.t);
  }

  _end() {
    this.current = null;
    this.voiceEl = null;
    this.seq = [];
    this.el.classList.add('hidden');
    this.el.classList.remove('in');
  }

  update(dt) {
    if (!this.current) {
      if (this.queue.length) this._start(this.queue.shift());
      return;
    }
    this.t += dt;

    /* THE NEXT PIECE, once this one has finished and a beat has passed.
       Polled rather than hung off `ended`, like everything else here, so a
       cut or a hush between pieces has nothing left behind to fire. */
    if (this.seq.length && this.voiceEl
      && (this.voiceEl.ended || (this.voiceEl.currentTime > 0 && this.voiceEl.currentTime >= this.pieceDur - 0.01))) {
      this._gapT += dt;
      if (this._gapT >= ROLL_GAP) {
        this._gapT = 0;
        const next = this.seq.shift();
        this._spokenBefore += this.pieceDur;
        this._piece += 1;
        this.pieceDur = next.dur;
        this.voiceEl = this.audio?.speak(next.el) ?? null;
        if (!this.voiceEl) this.seq = [];
      }
    }

    /* Ends on the LINE, not on the clock — the same rule the cutscene beats
       follow. A card that vanishes while he is still talking is worse here
       than in a scene, because there is no dialogue box left behind to read:
       the words go with it. The clock is the floor and a very loose ceiling
       covers a `play()` the browser refused, which never starts at all. */
    const el = this.voiceEl;
    const playing = el && !el.ended && el.currentTime > 0;
    const spoken = !this.seq.length
      && (!el || el.ended || (el.currentTime > 0 && el.currentTime >= this.pieceDur - 0.06));
    if (this._reveal) {
      this._showWords(spoken ? this._plan.length : this._revealNow());
    }
    const over = this.t >= this.dur && (spoken || !playing);
    /* A followed voice that somebody STOPPED (she left the simulator, and
       `_hushHolo` cut him off) or talked over is over now — not when its
       clock runs out, which for his islands line is nineteen seconds of
       caption for a man who has stopped talking. A tail's grace for one that
       simply finished. */
    const gone = this.current?.ext && this.t > 0.3 && this.audio && this.audio._speaking !== el
      && !(el?.ended && this.t < this.dur);
    if (over || gone || this.t > this.dur + 6) this._end();
  }
}
