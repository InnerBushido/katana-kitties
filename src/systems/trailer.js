/* ---------------------------------------------------------------------------
   The trailer, inside the game.

   `public/trailer/katana-kitties-trailer.mp4` is 20MB — by a wide margin the
   largest single thing in the project — and it is the first video the repo has
   ever contained. Everything here exists to make sure NOBODY PAYS FOR IT
   UNLESS THEY ASK.

   The `<video>` element in index.html carries `preload="none"` and, crucially,
   NO `src` ATTRIBUTE AT ALL. `preload="none"` on its own is a hint browsers are
   allowed to ignore, and several do — an element with a src is a request
   waiting to happen. The src is attached in `open()` and removed again in
   `close()`, so a player who never opens the trailer never fetches a byte of
   it, and one who watches it twice gets the second play out of the HTTP cache
   rather than out of 20MB of resident buffer.

   THE SKIP RULE IS THE GAME'S SKIP RULE. Start on a pad, Escape on a
   keyboard, and nothing else — the same `SKIP_KEYS` set and the same
   `_skipPressed()` the story scenes use. This is a 68-second video and both
   girls will be holding sticks while it plays; "any button" would throw it
   away in the first two seconds. Seventh non-negotiable.

   IT DEGRADES. If the file is missing, blocked, or the browser refuses to
   autoplay it, the panel says so in words and offers the download instead —
   and whatever was waiting on the trailer (the game starting, usually) still
   happens. A trailer that fails must never be a game that will not start.
--------------------------------------------------------------------------- */

/** Served out of `public/`, so BASE_URL is the only prefix it can need. */
const SRC = `${import.meta.env.BASE_URL}trailer/katana-kitties-trailer.mp4`;

export class Trailer {
  constructor(game) {
    this.game = game;
    this.active = false;
    this._done = null;

    this.el = document.getElementById('panel-trailer');
    this.video = document.getElementById('trailer-video');
    this.status = document.getElementById('trailer-status');
    this.hint = document.getElementById('trailer-hint');

    /* Bound once, here, rather than per-open: `close()` can be reached from
       four directions (ended, skipped, the button, an error) and re-adding
       listeners on every open is how one of those ends up firing twice. */
    this.video.addEventListener('ended', () => this.close());
    this.video.addEventListener('error', () => this._failed());
    this.video.addEventListener('playing', () => {
      this._say('');
      this.hint.classList.remove('hidden');
    });
    /* `waiting` fires whenever it stalls mid-stream, not just at the start, so
       a kid on a slow connection is told the video is buffering rather than
       left looking at a frozen picture wondering if she broke it. */
    this.video.addEventListener('waiting', () => this._say('Loading the trailer…'));
  }

  _say(msg) {
    this.status.textContent = msg;
    this.status.classList.toggle('hidden', !msg);
  }

  /**
   * Show it. `onDone` fires exactly once, whether it played to the end, was
   * skipped, or never managed to start at all — the caller uses it to carry on
   * with whatever the trailer was standing in front of.
   */
  open(onDone = null) {
    if (this.active) return;
    this.active = true;
    this._done = onDone;

    this.el.classList.remove('hidden');
    this.hint.classList.add('hidden');
    this._say('Loading the trailer…');

    /* The game's own music has to stop, or it plays underneath the trailer's
       score — which is the same music, a bar and a half out of step with
       itself. That is not a subtle problem. */
    this.game.audio?.stopMusic?.();

    this.video.src = SRC;
    this.video.currentTime = 0;
    const p = this.video.play();
    /* Autoplay policy: a play() that has not been reached through a user
       gesture rejects. Every route into here is a click or a button press, so
       this should not happen — but if it does, say so rather than sitting on a
       black rectangle. */
    if (p && typeof p.catch === 'function') {
      p.catch(() => this._say('Press Start or Esc to close, or use DOWNLOAD below.'));
    }
  }

  _failed() {
    /* No `close()` here on purpose. The player is left up with an explanation
       and a download button, because the most likely cause is a deploy that
       did not carry `public/trailer/`, and silently returning to the menu
       would look exactly like the button not working. Sixth non-negotiable:
       a refusal has to say so. */
    this._say("The trailer file isn't here. You can still download it below, or watch it at katana-kitties.vercel.app");
    this.hint.classList.remove('hidden');
  }

  /** Same thing as closing it; named for the callers that mean "skip". */
  skip() { this.close(); }

  close() {
    if (!this.active) return;
    this.active = false;

    this.video.pause();
    /* DETACH THE SOURCE, do not just pause. A paused `<video>` keeps its
       decoded buffer, and holding 20MB of it on a machine that is already
       fill-bound for a trailer nobody is watching is the wrong trade. The
       refetch on a second open comes out of the HTTP cache. */
    this.video.removeAttribute('src');
    this.video.load();

    this.el.classList.add('hidden');

    const done = this._done;
    this._done = null;
    done?.();
  }

  /** Save it. Offered next to the player because Richard asked for it. */
  download() {
    const a = document.createElement('a');
    a.href = SRC;
    a.download = 'katana-kitties-trailer.mp4';
    document.body.appendChild(a);
    a.click();
    a.remove();
    this.game.toast?.('Downloading the trailer…', 0);
  }

  /**
   * Polled every frame from the main loop. Cheap while inactive, which is why
   * it is not conditional at the call site.
   *
   * The keyboard half lives in main.js's one keydown listener with every other
   * skip, so that the rule about which keys skip a thing is written down once.
   */
  update() {
    if (!this.active) return;
    if (!this.game._skipPressed()) return;
    /* SPEND THE PRESS. This runs before MenuNav, and closing the trailer puts
       the menu it was opened from back underneath the very same frame — where,
       on the title screen, every button confirms and the cursor is still
       sitting on WATCH TRAILER. So one press of Start ended the video and
       immediately restarted it from the beginning. Reported on a PS5 pad; it
       was never about the pad.

       IT BELONGS HERE AND NOT IN `_skipPressed`. That is a question three
       scene blocks ask, and each of them RETURNS on the answer — nothing else
       in their frame ever gets to see the press, so consuming it there would
       be paying a cost for a problem only this one has. The trailer is the one
       skippable thing that hands the frame back and keeps going. */
    this.game.input.consume('start');
    this.skip();
  }
}
