/* ---------------------------------------------------------------------------
   LIONHEART'S VOICE — Barrett (docs/notes/voices.md), recorded line by line.

   HIS LINES ARE LOOKED UP BY THEIR TEXT. Every bubble he puts up already goes
   through `DreamDojo.say` / `holoSay` / `ShadowFight._say` with the string it
   shows, so this is handed that same string and finds the recording made of
   it. There is no second copy of any line to drift (the announcer's taunt
   once showed four words over eight seconds of speech because there was), and
   a line nobody recorded — one with a kitten's name in it — simply finds
   nothing and stays a bubble, which is what every line was before.

   TWO KINDS OF LINE, AND THEY ARE GATED DIFFERENTLY.
   · ASKED FOR: the welcome when she arrives, the Shadow's lines. Somebody did
     something and he answers, so it plays — unless ANOTHER character is
     already talking. `Audio.speak` is one speaker and cuts whoever was on, and
     Patchfur counting down the last pieces of mischief must not be talked
     over by an arcade owner on another island.
   · AMBIENT: what he says to whoever is standing near him, on a nine-second
     loop. Voiced every time, that is a man repeating himself at a child for as
     long as she stands still. So an ambient line waits AMBIENT_GAP after the
     last one, the same line waits REPEAT_GAP, and neither ever starts over
     anybody — himself included.

   DEGRADES TO TEXT. No file, no decode, no `window.Audio` (world-check): every
   call returns 0 and the bubble keeps its own time. Non-negotiable 9.
--------------------------------------------------------------------------- */
import { voicePath } from '../../core/audio.js';

/** An ambient line waits this long after the last ambient one... */
export const AMBIENT_GAP = 30;
/** ...and the same ambient line this long after itself. */
export const REPEAT_GAP = 120;
/** A bubble outlasts its recording by this, so the last word is not said to
 *  an empty space. */
export const VOICE_TAIL = 0.6;

export class LionVoice {
  /**
   * @param {object|(() => object)} audio the game's `Audio`, or a function
   *   returning it (or null) — asked each time, never cached
   * @param {Iterable<[string, string]>} lines [text, voice id] pairs
   */
  constructor(audio, lines) {
    this._audio = audio;
    this.ids = new Map(lines);
    this.els = new Map();
    this.said = new Map();
    this.ambientAt = -Infinity;
  }

  /**
   * Start buffering every clip. Idempotent, and called on the first approach
   * rather than at boot: nobody needs a megabyte of Lionheart until somebody
   * walks up to him.
   */
  load() {
    if (this.els.size || typeof window === 'undefined' || !window.Audio) return;
    for (const id of new Set(this.ids.values())) {
      const el = new window.Audio(voicePath(id));
      el.preload = 'auto';
      this.els.set(id, el);
    }
  }

  get audio() { return typeof this._audio === 'function' ? this._audio() : this._audio; }

  /** The voice id recorded for exactly this text, or null. */
  idOf(text) { return this.ids.get(text) ?? null; }

  /** How long a clip runs, once its metadata is in; 0 until then. */
  secs(id) {
    const d = this.els.get(id)?.duration;
    return Number.isFinite(d) ? d : 0;
  }

  /**
   * Is he saying THIS line right now? The bubble asks, rather than trusting
   * the number `speak` returned: a clip asked for before its metadata arrived
   * returns 0, and a card that went away while he was still mid-sentence is
   * exactly the bug the one-string rule was written against.
   */
  saying(text) {
    const id = this.idOf(text);
    const el = id ? this.els.get(id) : null;
    const s = this.audio?._speaking;
    return !!el && s === el && !s.paused && !s.ended;
  }

  /** Is anybody talking — and is it somebody other than him? */
  _talking() {
    const s = this.audio?._speaking;
    if (!s || s.paused || s.ended) return { any: false, other: false };
    let mine = false;
    for (const el of this.els.values()) if (el === s) mine = true;
    return { any: true, other: !mine };
  }

  /**
   * Stop him mid-line, if what is playing is one of his and `which(id)` says
   * so. Returns true if a line was cut. Somebody ELSE talking is never
   * touched: this is the one speaker everyone shares (`Audio.speak`).
   *
   * Richard: "When player leaves the Dream Dojo simulation, then if any of
   * Lionhearts voices are playing, they should be cancelled, since the player
   * has left the simulation." `DreamDojo._hushHolo` asks it with the
   * hologram's lines only — the real Lionheart at the arcade is still there.
   */
  hush(which = () => true) {
    const s = this.audio?._speaking;
    if (!s || s.paused || s.ended) return false;
    for (const [id, el] of this.els) {
      if (el !== s || !which(id)) continue;
      this.audio.stopSpeaking?.();
      return true;
    }
    return false;
  }

  /**
   * Say `text` aloud if it is recorded and it is his turn. Returns how many
   * seconds it runs, and 0 when nothing was said — the caller holds its bubble
   * up for the longer of the two.
   */
  speak(text, now, { ambient = false } = {}) {
    const id = this.idOf(text);
    const el = id ? this.els.get(id) : null;
    if (!el || !this.audio?.speak) return 0;
    const talk = this._talking();
    if (talk.other) return 0;
    if (ambient) {
      if (talk.any) return 0;
      if (now - this.ambientAt < AMBIENT_GAP) return 0;
      if (now - (this.said.get(id) ?? -Infinity) < REPEAT_GAP) return 0;
      this.ambientAt = now;
    }
    this.said.set(id, now);
    this.audio.speak(el);
    return this.secs(id);
  }
}
