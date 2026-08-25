/* ---------------------------------------------------------------------------
   Driving the menus with a controller.

   The game was fully playable on a pad and completely unreachable on one: PLAY,
   SETTINGS, HOW TO PLAY, RESTART and every setting in the game were mouse-only,
   so two kids on two Joy-Cons still had to pass a laptop back and forth to
   change the split-screen mode or read the controls. This closes that.

   THE HIGHLIGHT STARTS ON THE DEFAULT ACTION, AND THAT IS WHAT KEEPS "PRESS ANY
   BUTTON TO START" TRUE. The title screen's focus begins on PLAY, so a kid who
   knows nothing about menu navigation mashes a button and the game starts,
   exactly as before. Up and down are additive — they are how you reach the
   other two buttons, not a new thing you are required to learn first.

   ONE PLAYER DRIVES IT — THE ONE WHO OPENED IT. Menus used to merge every pad
   into one cursor, on the argument that there is one screen and one cursor and
   making player 1 the only one who can press RESUME locks the girl holding the
   other Joy-Con out of her own pause menu. That argument is correct for two
   sisters and collapses at four: a merged cursor takes the LARGEST input on
   each axis, so one person who is not looking at the screen, resting a thumb
   on a stick, outvotes the person who actually pressed Start. Nobody can reach
   RESUME and it does not look like a fight, it looks like a hang.

   So `Game.menuOwner` names a slot and this class reads that slot only. The
   original concern is answered by WHO owns it rather than by sharing: it is
   the player who opened the menu, whichever one that is, and it moves to
   somebody else if her controller disappears (`Game._checkMenuOwner`). A null
   owner still means shared — the title screen, where nobody is playing yet.

   A `<select>` IS CHANGED IN PLACE, NEVER OPENED. A native dropdown is an OS
   window: the Gamepad API cannot reach it, so opening one with a pad is how you
   get a menu you can enter and not leave. Left/right cycle the options and the
   `change` event fires exactly as if it had been picked with a mouse, so every
   existing listener in main.js works untouched.
--------------------------------------------------------------------------- */

/** Panels that own the input when they are up, in priority order.
 *
 *  `panel-profile` is FIRST and carries no `.menu-btn` on purpose. It is the
 *  one screen in the game that must not have a single merged cursor — a trade
 *  needs both girls to say yes on their own side, and consent cannot be
 *  expressed through a cursor they are both pushing. Listing it here means
 *  `panel()` finds it, `items()` comes back empty, and this class reports that
 *  it does not own the input — so the pause menu underneath does not quietly
 *  keep taking presses while a trade is on screen. One place, rather than a
 *  second copy of "which panel is up" living in profile.js. */
/* Ordered most-modal first: the first one that is open and has items in it
   owns the input. `panel-league` sits above the pause menu because it can be
   up while the game is not paused — it is the choice standing between four
   kittens and the round card. */
/* ORDER IS PRECEDENCE: the first id in this list that is not hidden is the
   panel the cursor drives.

   `panel-confirm` is first because it is the only panel that can open on top
   of another one — it is asked FROM the pause menu, with the pause menu still
   up behind it. Anything above it in this list would keep taking the presses
   meant for the question, which is a dialog you answer by accident.

   `panel-trailer-offer` is next: it is fully modal, it can only be up on the
   title screen, and the title screen is the one surface where ANY button
   confirms — so anything less would let a mashed button start the game out
   from under the question.

   `panel-trailer` is deliberately NOT in this list; see `panel()`. */
const PANELS = ['panel-confirm', 'panel-trailer-offer', 'panel-profile',
  'panel-league', 'panel-settings', 'panel-help', 'panel-pause'];

/* Stick/d-pad repeat. The first step is instant, then it waits, then it runs —
   the shape every menu in every console game uses, because a list that scrolls
   at one item per press is slow and one that free-runs is uncontrollable. */
const REPEAT_DELAY = 0.42;
const REPEAT_RATE = 0.11;
/** How far the stick has to go before it counts as a direction at all. */
const NAV_DEAD = 0.55;

export class MenuNav {
  constructor(game) {
    this.game = game;
    /** Focused index per panel id, so backing out of Settings puts the
     *  highlight back on the row you were on rather than at the top. */
    this.index = new Map();
    this.holdY = 0;
    this.holdX = 0;
    this.repeatT = 0;
    this.lastPanel = null;
  }

  /** The element currently owning menu input, or null if the game does. */
  panel() {
    /* THE TRAILER OWNS NOTHING AND NOBODY ELSE MAY OWN ANYTHING WHILE IT RUNS.
       It is not in PANELS because a pad must not be able to walk a cursor onto
       its CLOSE button and press it with `jump` — it is skipped with `start`
       and nothing else, like every other thing that plays at you. But falling
       through to the title screen underneath is worse than either: there every
       button confirms, so a kid mashing through the trailer would activate
       PLAY behind the video. Returning null means this class stands down
       entirely and `_overlayOpen()` handles the rest. */
    if (this.game.trailer?.active) return null;
    for (const id of PANELS) {
      const el = document.getElementById(id);
      if (el && !el.classList.contains('hidden')) return el;
    }
    if (this.game.state === 'title') return document.getElementById('title');
    return null;
  }

  /**
   * Everything on this panel a pad can land on, in visual order.
   *
   * `offsetParent` rejects anything inside a hidden container — the remap grid
   * is emptied and refilled as controllers come and go, and a stale row you can
   * highlight but not see is a cursor that vanishes.
   */
  items(panel) {
    /* `summary.help-topic` is here so the help accordion is drivable on a pad:
       the stick lands on a topic header and `_activate` clicks it, which is
       exactly how a <details> toggles open. Nothing else in the game uses a
       <summary>, so this widens the net for one panel only. */
    const sel = 'button.menu-btn, summary.help-topic, .panel select,'
      + ' .panel input[type="range"], .map-cell, button.map-reset';
    return [...panel.querySelectorAll(sel)].filter((el) => el.offsetParent !== null);
  }

  /**
   * Merge both pads into one cursor. Either kid can drive.
   *
   * ON THE TITLE SCREEN, EVERY BUTTON CONFIRMS. The screen says PRESS ANY
   * BUTTON TO START and it has to keep meaning that — the cursor starts on
   * PLAY, so a kid who has never thought about a menu presses whatever is
   * under her thumb and the game starts, exactly as it did before there was a
   * cursor at all. Inside a real panel only `jump` confirms, because there the
   * other buttons have to stay free to mean nothing rather than to fire the
   * row she happens to be sitting on.
   */
  _read(panel) {
    /* THE OWNER, OR EVERYBODY IF THERE IS NO OWNER. See the header. The merge
       below is kept for the shared case rather than special-cased away: on the
       title screen every pad really does drive the cursor, and one loop that
       sometimes runs over one player is simpler than two code paths. */
    const all = this.game.input.players;
    const owner = this.game.menuOwner;
    const ps = owner != null && all[owner] ? [all[owner]] : all;
    let x = 0;
    let y = 0;
    for (const p of ps) {
      if (Math.abs(p.mx) > Math.abs(x)) x = p.mx;
      if (Math.abs(p.my) > Math.abs(y)) y = p.my;
    }
    const anyButton = panel.id === 'title';
    const confirms = anyButton
      ? ['jump', 'attack', 'interact', 'mount', 'start']
      : ['jump'];
    return {
      x: Math.abs(x) > NAV_DEAD ? Math.sign(x) : 0,
      y: Math.abs(y) > NAV_DEAD ? Math.sign(y) : 0,
      confirm: ps.some((p) => confirms.some((a) => p.pressed(a))),
      back: !anyButton && ps.some((p) => p.pressed('interact')),
    };
  }

  /** Held direction with console-style repeat; returns -1 / 0 / +1 this frame. */
  _step(dir, axis, dt) {
    const held = axis === 'y' ? 'holdY' : 'holdX';
    if (dir === 0) {
      this[held] = 0;
      return 0;
    }
    if (this[held] !== dir) {
      this[held] = dir;
      this.repeatT = REPEAT_DELAY;
      return dir;
    }
    this.repeatT -= dt;
    if (this.repeatT <= 0) {
      this.repeatT = REPEAT_RATE;
      return dir;
    }
    return 0;
  }

  update(dt) {
    const panel = this.panel();
    if (!panel) {
      this._clear();
      this.lastPanel = null;
      return false;
    }

    const items = this.items(panel);
    /* Nothing to land on means this is NOT holding the input, and saying so is
       the safety valve: the title screen's any-button shortcut is gated on
       this, so a panel that reported ownership while offering no cursor would
       be a title screen that cannot be started at all. */
    if (!items.length) return false;

    /* A panel that has just opened starts on its default. Settings and Help
       start on BACK — the thing you most want after reading them — while the
       title and the pause menu start on their primary action. */
    const justOpened = this.lastPanel !== panel.id;
    if (justOpened) {
      this.lastPanel = panel.id;
      if (!this.index.has(panel.id)) {
        const primary = items.findIndex((el) => el.classList.contains('primary'));
        const back = items.findIndex((el) => el.classList.contains('back'));
        /* `data-nav-start="first"` opens the cursor on the top item instead.
           Help is a MENU of topics now, not a wall of text with one BACK button
           in it, so it should behave like the pause menu — land on the first
           thing to read — rather than starting on BACK the way Settings does. */
        const first = panel.dataset.navStart === 'first';
        this.index.set(panel.id,
          first ? 0 : (primary >= 0 ? primary : Math.max(0, back)));
      }
      this.holdY = 0;
      this.holdX = 0;
    }

    let i = Math.min(this.index.get(panel.id) ?? 0, items.length - 1);
    const nav = this._read(panel);
    const dy = this._step(nav.y, 'y', dt);
    const dx = this._step(nav.x, 'x', dt);

    /* WHICH AXIS MOVES THE CURSOR IS A PROPERTY OF THE LAYOUT, and it is
       declared in the markup (`data-nav`) rather than guessed from CSS. The
       title's three buttons sit in a flex ROW — pressing down to get from PLAY
       to SETTINGS when SETTINGS is visibly to the left is the kind of thing a
       nine-year-old reads as the controller not working. Help is a wall of
       text with one button in it, so up/down belongs to the text. */
    const mode = panel.dataset.nav ?? 'vertical';
    const move = mode === 'horizontal' ? dx : dy;
    if (move) {
      i = (i + move + items.length) % items.length;
      this.game.audio?.play('menu');
    }
    if (mode === 'scroll' && dy) this._scroll(panel, dy);
    // Left/right only edits a value on a vertical list; on a horizontal one it
    // is the cursor, and there is nothing there with a value anyway.
    if (mode !== 'horizontal' && dx) this._adjust(items[i], dx);

    if (nav.confirm) this._activate(items[i]);
    if (nav.back) this._back(panel);

    this.index.set(panel.id, i);
    this._paint(items, i);

    /* A PAGE YOU OPEN TO READ OPENS AT THE TOP. `_paint` scrolls the focused
       item into view, and the only focusable thing on the help page is the
       BACK button at the very bottom — so opening it jumped straight past
       everything it exists to say. Done after the paint, and only on the frame
       the panel opens, so scrolling away from the top afterwards sticks. */
    if (justOpened && mode === 'scroll') {
      const box = panel.querySelector('.panel');
      if (box) box.scrollTop = 0;
    }
    return true;
  }

  /**
   * Scroll a long panel with the stick.
   *
   * The scroller is the `.panel` box, not the screen: these overlays are
   * `position: fixed`, so the document behind them has nothing to scroll and a
   * kid on a controller had no way at all to reach the bottom of the help
   * page. A step is most of a line of text — small enough to read as scrolling
   * rather than paging, and with `_step`'s repeat it runs smoothly when held.
   */
  _scroll(panel, dir) {
    const box = panel.querySelector('.panel');
    if (!box || box.scrollHeight <= box.clientHeight) return;
    box.scrollTop += dir * 48;
  }

  /** Left/right on a control that has a value. Buttons ignore it. */
  _adjust(el, dir) {
    if (el.tagName === 'SELECT') {
      const n = el.options.length;
      el.selectedIndex = (el.selectedIndex + dir + n) % n;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      this.game.audio?.play('menu');
    } else if (el.tagName === 'INPUT' && el.type === 'range') {
      const step = (+el.step || 1) * 5;
      const v = Math.min(+el.max, Math.max(+el.min, +el.value + dir * step));
      if (v === +el.value) return;
      el.value = String(v);
      // `input`, not `change` — the sliders preview themselves as they move,
      // which is the whole reason a kid can set them by ear.
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  _activate(el) {
    if (el.tagName === 'SELECT') {
      // Confirm advances rather than opening the OS dropdown. See the header.
      this._adjust(el, 1);
      return;
    }
    if (el.tagName === 'INPUT') return;
    el.click();
  }

  /**
   * B / Circle: out of a sub-panel, or straight out of the pause menu.
   *
   * `.menu-btn.back` is accepted alongside `[data-close]` so a panel can
   * declare its own way out without also joining the global `[data-close]`
   * click handler, which hides three specific panels by id. The confirm dialog
   * needs exactly that: B has to answer it NO, and must not also close Help.
   */
  _back(panel) {
    const el = panel.querySelector('[data-close], .menu-btn.back');
    if (el) { el.click(); return; }
    if (panel.id === 'panel-pause') this.game.setPaused(false);
  }

  /**
   * Move the ring, clearing it from EVERYWHERE first.
   *
   * Toggling the class only across the current panel's own items is the
   * obvious version and it is wrong: opening Settings from the title screen
   * leaves the ring sitting on the title's SETTINGS button, which is a
   * different element in a different panel that this loop never visits. The
   * result is two highlights on screen, the stale one drawn first — so it is
   * also the one that looks like the cursor. Clear globally, then light one.
   */
  _paint(items, i) {
    const want = items[i] ?? null;
    if (want === this._lastPainted) return;
    this._clear();
    if (!want) return;
    want.classList.add('nav-focus');
    // Settings is taller than the screen; the ring is useless off-screen.
    want.scrollIntoView({ block: 'nearest' });
    this._lastPainted = want;
  }

  _clear() {
    for (const el of document.querySelectorAll('.nav-focus')) {
      el.classList.remove('nav-focus');
    }
    this._lastPainted = null;
  }

  /** Panel closed or the game restarted — forget where the cursor was. */
  reset() {
    this.index.clear();
    this.lastPanel = null;
    this._clear();
  }
}
