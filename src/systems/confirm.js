/* ---------------------------------------------------------------------------
   ARE YOU SURE?

   One panel and one class for every irreversible button in the pause menu:
   RESTART, TITLE SCREEN, QUIT THE MATCH, DROP OUT and QUIT GAME. Each of them
   throws away something a nine-year-old spent an afternoon on — clans, stars,
   orbs, a live round — and each of them sits in a vertical list that is driven
   with a thumbstick, one row above or below something harmless.

   THE DEFAULT ANSWER IS ALWAYS NO, and that is the entire safety property.
   `MenuNav` opens a panel's cursor on `.primary` if it finds one and on
   `.back` otherwise — so this panel deliberately has NO primary, and the
   cancel button carries `back`. A mashed pad therefore lands on "no, keep
   playing" and a confirm dialog cannot become a second button to mash through
   on the way to deleting the world. If anybody ever adds `primary` to the
   YES button to make it look nicer, that is the whole guard gone.

   IT IS NOT A `window.confirm()`. That is an OS window: the Gamepad API cannot
   reach it, so a girl on a Joy-Con would get a dialog she can see and cannot
   answer — the same reason `MenuNav` never opens a native `<select>`.

   IT DOES NOT ASK "ARE YOU SURE?" AND LEAVE IT THERE. Both buttons say what
   they DO — "no, keep playing" against "yes, start over" — because "yes" and
   "no" only mean anything if you have read and held on to the question, and
   the person answering is nine and is being asked while excited. A refusal
   must say so and so must a confirmation; sixth non-negotiable.

   ONE AT A TIME. `ask` while a question is already up refuses rather than
   stacking: two dialogs deep, `back` answers the wrong one.
--------------------------------------------------------------------------- */

export class Confirm {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('panel-confirm');
    this.titleEl = document.getElementById('confirm-title');
    this.bodyEl = document.getElementById('confirm-body');
    this.yesEl = document.getElementById('confirm-yes');
    this.noEl = document.getElementById('confirm-no');
    this._onYes = null;

    /* Bound ONCE, in the constructor, rather than per `ask`. Rebinding per
       question is how a listener gets added a second time and the answer fires
       twice — which for these particular buttons means restarting the world
       and then restarting it again. */
    this.yesEl?.addEventListener('click', () => this._answer(true));
    this.noEl?.addEventListener('click', () => this._answer(false));
  }

  get active() {
    return !!this.el && !this.el.classList.contains('hidden');
  }

  /**
   * Put a question up.
   *
   * @param {object}   o
   * @param {string}   o.title  the question, in a few words
   * @param {string}   o.body   what actually happens if she says yes
   * @param {string}   o.yes    the yes button's words. Say what it DOES.
   * @param {string}   o.no     the no button's words. Same.
   * @param {Function} o.onYes  run only on yes
   */
  ask({ title, body, yes, no, onYes }) {
    if (!this.el || this.active) return false;
    this.titleEl.textContent = title;
    this.bodyEl.textContent = body;
    this.yesEl.textContent = yes;
    this.noEl.textContent = no;
    this._onYes = onYes;
    this.el.classList.remove('hidden');
    /* The cursor has to be re-seated: MenuNav remembers an index per panel id,
       and this is ONE panel reused for every question. Without this, saying no
       to "restart?" leaves the highlight on the second row, and the next
       question — which might be QUIT GAME — opens with YES already under her
       thumb. The stored index is dropped rather than set, so `justOpened` puts
       it back on `.back` from scratch. */
    this.game.menuNav?.index.delete('panel-confirm');
    this.game.audio?.play('menu');
    return true;
  }

  /** Cancel from the outside — Escape, or the panel closing under us. */
  close() {
    if (this.active) this._answer(false);
  }

  _answer(ok) {
    if (!this.active) return;
    this.el.classList.add('hidden');
    const fn = this._onYes;
    /* CLEARED BEFORE IT RUNS. `onYes` is usually something that tears the
       world down and may open another dialog on the way; leaving a stale
       callback on the instance while it does that is how one gets run twice. */
    this._onYes = null;
    this.game.audio?.play(ok ? 'menu' : 'deny');
    if (ok) fn?.();
  }
}
