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

   `panel-trailer` is deliberately NOT in this list; see `panel()`.

   `panel-board` WAS MISSING FROM IT, and had been since it was written. It
   carries `data-nav="scroll"` — a mode that exists FOR it — and could never
   reach it: with the board on screen the first unhidden id was `panel-pause`
   behind it, so a pad scrolled the pause menu under the record board and the
   board's own BACK could not be reached with a stick at all. Found while
   cutting the pause menu into groups, which put a second panel behind it and
   turned a quiet wrong answer into a visible one.

   THE THREE PAUSE GROUPS SIT BELOW SETTINGS AND HELP AND ABOVE PAUSE, which
   is the same rule as everything else here: a panel opened FROM another panel
   goes above the one it opened from. Every one of them can have the pause menu
   up behind it, and `panel-kittens` can additionally have the board or the
   profile up in front. */
const PANELS = ['panel-confirm', 'panel-trailer-offer', 'panel-profile',
  'panel-league', 'panel-board', 'panel-settings', 'panel-help',
  'panel-kittens', 'panel-watch', 'panel-saves', 'panel-ending',
  /* PLAY SETTINGS IS BELOW THE THREE IT OPENS, by the same rule: WATCH AGAIN,
     LOAD A SAVED GAME and END THE GAME all open from it with it still up. */
  'panel-play',
  'panel-pause'];

/* Stick/d-pad repeat. The first step is instant, then it waits, then it runs —
   the shape every menu in every console game uses, because a list that scrolls
   at one item per press is slow and one that free-runs is uncontrollable. */
const REPEAT_DELAY = 0.42;
const REPEAT_RATE = 0.11;
/** How far the stick has to go before it counts as a direction at all. */
const NAV_DEAD = 0.55;

/* HOW FAR ONE PRESS SCROLLS A PANEL YOU ARE READING.
 *
 * 48px is what `data-nav="scroll"` has always moved — most of a line of text,
 * small enough to read as scrolling rather than paging. It is the FLOOR now
 * rather than the whole answer, because Help is not the record board: it is
 * eleven topics of pictures and prose, and 48px at a time down an opened
 * "Clan abilities" is a minute of holding a stick.
 *
 * A FRACTION OF THE BOX, so a press is the same amount of READING on a phone
 * and on a television rather than the same number of pixels. Just under seven
 * presses to the bottom of one screenful, which is the shape that was asked
 * for: "let's make pressing up/down do more scrolling/paging functionality".
 * 0.15 of an 82vh panel is 133px on a 1080 screen, and 55px on a landscape
 * phone (94vh of 390) — so the floor catches neither, and is kept for the
 * window somebody has dragged down to 300px tall, where a fraction alone
 * becomes a crawl. */
const SCROLL_STEP = 48;
const READ_FRAC = 0.15;

export class MenuNav {
  constructor(game) {
    this.game = game;
    /** Focused index per panel id, so backing out of Settings puts the
     *  highlight back on the row you were on rather than at the top. */
    this.index = new Map();
    /** ...and WHICH ELEMENT that index was pointing at, per panel id. An index
     *  alone is a row number, and a row number means nothing once a list has
     *  rebuilt underneath it. See `_reseat`. */
    this.focusEl = new Map();
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
   *
   * AND `offsetParent` IS NOT ENOUGH FOR A SHUT `<details>`. Browsers stopped
   * hiding a closed disclosure's contents with `display: none` — it is
   * `content-visibility: hidden` now, so the skipped subtree still HAS a layout
   * box and `offsetParent` comes back non-null for everything inside it. That
   * cost nothing while every topic card was a flat list with no controls in it;
   * the moment Help grew sub-topics (`help-sub`, index.html) the cursor started
   * landing on eight headings a player could not see, four of them between one
   * visible row and the next. Found by asking `items()` what it returned with
   * "Moving & fighting" shut.
   */
  items(panel) {
    /* `summary.help-topic` is here so the help accordion is drivable on a pad:
       the stick lands on a topic header and `_activate` clicks it, which is
       exactly how a <details> toggles open. Nothing else in the game uses a
       <summary>, so this widens the net for one panel only. */
    const sel = 'button.menu-btn, summary.help-topic, .panel select,'
      + ' .panel input[type="range"], .map-cell, button.map-reset';
    /* A `<summary>` IS THE ONE THING A SHUT `<details>` STILL SHOWS, so the walk
       starts ABOVE its own card — otherwise every topic header would filter
       itself out and the accordion would have no cursor at all. Everything else
       is judged from its own parent, where a closed ancestor really does hide
       it. */
    const folded = (el) => {
      const from = el.tagName === 'SUMMARY' ? el.parentElement?.parentElement : el.parentElement;
      return !!from?.closest?.('details:not([open])');
    };
    return [...panel.querySelectorAll(sel)]
      .filter((el) => el.offsetParent !== null && !folded(el));
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
    /* AND THE KEYBOARD IN FRONT OF THE LAPTOP, when player one opened this on
       a pad. "When Player 1 brings up the Pause Menu, we should still be able
       to control the menu using WASD controls" — even when WASD is walking
       somebody else, which is exactly when `Input._spareHandPass` refuses to
       fold it into her slot.

       THE REFUSAL IS ABOUT PLAY, NOT ABOUT MENUS. Two kittens sharing WASD in
       the world move as one and it reads as a broken controller. A menu has no
       kitten in it: the game is paused, there is one cursor, and its owner is
       already named — so a second device pushing that one cursor is the same
       cursor, not a second body. `Input.menuHand` returns null in every case
       where those keys are ALREADY in `ps` (touch, no pad, `alsoKeyset` set),
       so this can never double a press; see the five refusals on it.

       It joins the merge as an ordinary pad, which means `spend()` pays for
       its edges too — a WASD confirm here must not fall through to the stall
       branch any more than a Joy-Con one may.

       ONLY ONTO THE OWNER'S OWN COPY. `ps` is `all` itself in the shared case,
       and pushing onto that would add the hand to `Input.players` for the rest
       of the frame — a fourth kitten made of nothing. */
    const hand = ps !== all ? this.game.input.menuHand?.(owner) : null;
    if (hand) ps.push(hand);
    let x = 0;
    let y = 0;
    let dpad = 0;
    for (const p of ps) {
      if (Math.abs(p.mx) > Math.abs(x)) x = p.mx;
      if (Math.abs(p.my) > Math.abs(y)) y = p.my;
      if (Math.abs(p.dpadY ?? 0) > Math.abs(dpad)) dpad = p.dpadY;
    }
    const anyButton = panel.id === 'title';
    const confirms = anyButton
      ? ['jump', 'attack', 'interact', 'mount', 'start']
      : ['jump'];
    /* WHICH pad and WHICH action, not just whether — so `spend` below can
       give the edge back. Collected here rather than re-tested at the call
       site because `pressed` is a pure read: asking a second time after
       something has opened a screen gets a different answer for a reason that
       has nothing to do with the button. */
    const took = [];
    for (const p of ps) {
      for (const a of confirms) if (p.pressed(a)) took.push([p, a]);
      if (!anyButton && p.pressed('interact')) took.push([p, 'interact']);
    }
    return {
      x: Math.abs(x) > NAV_DEAD ? Math.sign(x) : 0,
      y: Math.abs(y) > NAV_DEAD ? Math.sign(y) : 0,
      /* WAS THAT UP/DOWN AN ARROW BUTTON? Only `read` asks: there the stick
         moves the page and the d-pad moves between buttons. See `_stepItem`. */
      button: Math.abs(dpad) > NAV_DEAD,
      confirm: ps.some((p) => confirms.some((a) => p.pressed(a))),
      back: !anyButton && ps.some((p) => p.pressed('interact')),
      /**
       * Spend every press this frame's decision was read from.
       *
       * THIS CLASS WAS THE ONE OWNER IN THE FRAME THAT NEVER PAID. `Inspector`
       * consumes, the stall branch consumes, `PadState.consume` has a comment
       * saying whoever acts on a press owes the call — and MenuNav acted on
       * presses and left every one of them sitting there for the rest of
       * `_updatePlay` to find. Two bugs came in from play on the same day and
       * both were this:
       *
       *   B backs out of the pause menu -> `_back` unpauses -> execution falls
       *   straight through to the stall branch further down the SAME frame,
       *   which reads the same interact edge and opens the dealer's chooser.
       *   Reported as "pressing back by the dealer opens the dealer".
       *
       *   JUMP confirms CHARACTER PROFILE -> the click opens the trade window
       *   -> `profile.update` runs later in the same frame, reads the same
       *   jump edge, and offers whichever orb the cursor happened to be on.
       *   Reported as the screen auto-selecting an orb on the way in.
       *
       * ONLY THE PADS THAT ACTUALLY PRESSED, and only the actions they pressed.
       * `Input.consume` would spend the edge across all four slots, which would
       * eat the sister's press: she can be standing at the stall with her own
       * interact while player one is in the pause menu.
       */
      spend() { for (const [p, a] of took) p.consume(a); },
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

    /* WHICH AXIS MOVES THE CURSOR IS A PROPERTY OF THE LAYOUT, and it is
       declared in the markup (`data-nav`) rather than guessed from CSS. The
       title's three buttons sit in a flex ROW — pressing down to get from PLAY
       to SETTINGS when SETTINGS is visibly to the left is the kind of thing a
       nine-year-old reads as the controller not working. The record board is a
       list too long to walk, and Help is a page you READ — see `_nearest`,
       where up and down move the PAGE and the cursor follows it.

       READ UP HERE RATHER THAN BESIDE ITS OWN USE, because the frame a panel
       opens on needs it: a `read` panel has to be put back to the top of its
       page before a cursor can be derived from where that page is. */
    const mode = panel.dataset.nav ?? 'vertical';

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
      /* AND A PAGE YOU READ OPENS AT THE TOP *BEFORE* ITS CURSOR IS READ OFF
         IT. `read` derives the selection from the scroll position, so a panel
         re-opened with last time's scrollTop still on it would spend its first
         frame selecting whatever happened to be in the middle of where she
         left off. The `scroll` panels keep their reset at the BOTTOM of this
         method, where it has to be: there `_paint` really does call
         `scrollIntoView`, and the reset is what undoes it. */
      if (mode === 'read') this._toTop(panel);
    }

    let i = this._reseat(panel, items,
      Math.min(this.index.get(panel.id) ?? 0, items.length - 1));
    const nav = this._read(panel);
    const dy = this._step(nav.y, 'y', dt);
    const dx = this._step(nav.x, 'x', dt);

    /* `read` IS THE PAGE MOVING AND THE CURSOR FOLLOWING IT — see `_nearest`.
       It degrades to plain `vertical` the moment there is nothing to scroll,
       which is not a corner case: with every topic shut, Help fits on a tall
       monitor, and a mode that did nothing there would be a screen with no
       cursor in it at all. */
    const reading = mode === 'read' && this._scrollable(panel);
    const move = mode === 'horizontal' ? dx : (reading ? 0 : dy);
    if (move) {
      i = (i + move + items.length) % items.length;
      this.game.audio?.play('menu');
    }
    if (mode === 'scroll' && dy) this._scroll(panel, dy);
    if (reading) {
      const box = panel.querySelector('.panel');
      const was = i;
      /* THREE THINGS CAN MOVE THIS PAGE AND EACH ONE SETTLES THE SELECTION
         ITS OWN WAY.

         THE ARROW BUTTONS step to the next button and centre it — "when you
         press up/down on arrow buttons, it will move between buttons, like it
         used to do before we added the joystick adjustments".

         THE STICK scrolls the page, and never past the next button — see
         `_scrollItem`.

         A WHEEL OR A FINGER is the page moving under something this class did
         not do. It is told apart by the scroll position not being where this
         class last LEFT it, and it derives the selection from the middle of the
         page as before: a ring that ignored the wheel would be two cursors
         disagreeing about the same page. The frame a panel opens counts as one,
         which is what puts a re-opened Help on its first topic rather than on
         last time's row.

         WHY THE SELECTION IS NO LONGER RE-DERIVED EVERY FRAME, which is what
         this did until a stick "sometimes jumped over submenu items and made
         them not selectable". A derived selection can only ever be something
         that can reach the middle of the box — and anything in the top or
         bottom half-screen of the page cannot, because the page cannot scroll
         far enough to bring it there. Measured on the real panel with "Clan
         abilities" open: its sub-topics are 40-odd pixels apart and a stick
         step is 15% of the box, so they were stepped over mid-page as well. */
      /* ASKED AS "NOT WITHIN A PIXEL", NOT "MORE THAN A PIXEL OFF". With no
         remembered position the difference is NaN, and `NaN > 1` is false — so
         the first way of writing this read "nowhere" as "exactly where I left
         it" and kept a selection from a page that was no longer there. Found by
         a test harness that reset the position to NaN and watched the ring
         stay on BACK at the top of the page. */
      const moved = justOpened || !box || !(Math.abs(box.scrollTop - this._readTop) <= 1)
        || this._readPanel !== panel.id;
      if (dy && nav.button) i = this._stepItem(panel, items, i, dy);
      else if (dy) i = this._scrollItem(panel, items, moved ? this._nearest(panel, items) : i, dy);
      else if (moved) i = this._nearest(panel, items);
      if (i !== was) this.game.audio?.play('menu');
      this._readTop = box?.scrollTop;
      this._readPanel = panel.id;
    }
    // Left/right only edits a value on a vertical list; on a horizontal one it
    // is the cursor, and there is nothing there with a value anyway.
    if (mode !== 'horizontal' && dx) this._adjust(items[i], dx);

    /* SPENT BEFORE IT IS ACTED ON, not after. `_activate` clicks a real
       button and the handler runs synchronously — it can unpause the game,
       open the trade window, or start a scene, any of which can read a pad
       before this function gets control back. Paying first means there is no
       ordering to get wrong. */
    if (nav.confirm || nav.back) nav.spend();
    if (nav.confirm) this._activate(items[i]);
    if (nav.back) this._back(panel);

    this.index.set(panel.id, i);
    this.focusEl.set(panel.id, items[i] ?? null);
    /* AND THE RING DOES NOT DRAG THE PAGE WHILE THE PAGE IS DRIVING THE RING.
       `_paint` scrolls the focused item into view, which in `read` mode is a
       loop: a press moves the page, the page moves the selection, and the
       paint pulls the page back to put what it just selected in view. `block:
       'nearest'` makes that a small tug rather than a jump, which is the worse
       of the two — an obvious fight is something you can see, and this one
       would just make the page feel sticky. */
    this._paint(items, i, !reading);

    /* A PAGE YOU OPEN TO READ OPENS AT THE TOP. `_paint` scrolls the focused
       item into view, and the only focusable thing on the help page is the
       BACK button at the very bottom — so opening it jumped straight past
       everything it exists to say. Done after the paint, and only on the frame
       the panel opens, so scrolling away from the top afterwards sticks. */
    if (justOpened && mode === 'scroll') this._toTop(panel);
    return true;
  }

  /** Is there anything to scroll? Asked by `read`, which has nothing to do
   *  when there is not, and falls back to stepping the cursor instead. */
  _scrollable(panel) {
    const box = panel.querySelector('.panel');
    return !!box && box.scrollHeight > box.clientHeight + 1;
  }

  _toTop(panel) {
    const box = panel.querySelector('.panel');
    if (box) box.scrollTop = 0;
  }

  /**
   * WHICHEVER ITEM IS NEAREST THE MIDDLE OF THE PAGE IS THE SELECTED ONE.
   *
   * Reported from play: "player should be able to scroll up/down in the Help
   * Menu with the left joystick, not just select the buttons in the menu to
   * scroll up/down, as details, like in Clan Abilities can be missed that are
   * not navigable to... as user scrolls up/down, should select the closest
   * button to the center of the screen, so as they scroll down, it will select
   * the bottom/next button once scrolled down far enough."
   *
   * WHAT WAS WRONG IS THE FIRST HALF OF THAT SENTENCE, AND IT IS NOT THAT ROWS
   * WERE MISSING. Help was `data-nav="vertical"`, so down meant "the next topic
   * header" and `_paint`'s `scrollIntoView({ block: 'nearest' })` moved the
   * page only far enough to show that header. Every pixel BETWEEN two headers
   * was unreachable on a pad — which is most of the screen once a topic is
   * open, and all of it inside "Clan abilities", whose sub-cards are pictures
   * and prose with no control in them at all. The cursor was not skipping
   * items; it was stepping OVER the page.
   *
   * SO THE PAGE IS WHAT MOVES AND THE CURSOR IS DERIVED FROM IT. That is the
   * second half of the report and it is also the only way the two can be made
   * to agree: a selection kept independently of the scroll position is a ring
   * somewhere else on the screen, and JUMP then opens a topic she is not
   * looking at.
   *
   * THE TWO ENDS ARE PINNED RATHER THAN MEASURED, AND THAT IS NOT TIDINESS. At
   * the very bottom of Help the thing nearest the middle of the box is the last
   * topic HEADER — BACK is below it, in a strip that no amount of further
   * scrolling can bring to the centre, so measured alone a stick could never
   * reach the way out. Pinned, the end of the page selects it, which is the
   * thing she wants after reading. The top is pinned for the mirror of the same
   * reason: the lead paragraph above the first topic would otherwise hold the
   * selection off the first thing to read.
   */
  _nearest(panel, items) {
    const box = panel.querySelector('.panel');
    if (!box || !items.length) return 0;
    if (box.scrollTop <= 1) return 0;
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 1) return items.length - 1;
    const r = box.getBoundingClientRect?.();
    const mid = r ? r.top + r.height / 2 : box.clientHeight / 2;
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < items.length; k++) {
      const b = items[k].getBoundingClientRect?.();
      if (!b) continue;
      const d = Math.abs(b.top + b.height / 2 - mid);
      if (d < bestD) { bestD = d; best = k; }
    }
    return best;
  }

  /**
   * "I moved this page on purpose, and THIS is what should be selected."
   *
   * For a scroll this class did not make but ASKED FOR, which today is one
   * thing: a Help topic opening and being brought to the top
   * (`Game._helpToTop`). Without this, `update` reads the jump as a wheel and
   * re-derives the selection from the middle of the page. That is right for
   * a wheel and wrong here: the ring would leave the header she just pressed
   * JUMP on and land on something she did not choose.
   *
   * An element that is not a cursor stop (a mouse opened a topic this list
   * does not know) still records the position, so the ring stays where it
   * was rather than jumping.
   */
  keep(panel, el) {
    const box = panel?.querySelector('.panel');
    if (!box) return;
    this._readTop = box.scrollTop;
    this._readPanel = panel.id;
    const items = this.items(panel);
    const k = el ? items.indexOf(el) : -1;
    if (k >= 0) {
      this.index.set(panel.id, k);
      this.focusEl.set(panel.id, el);
    }
  }

  /** Where an item's middle is, in the page's own coordinates — the same
   *  number whatever the page is scrolled to, which is what lets a step ask
   *  "how far would I have to move to put this in the middle". */
  _centreOf(box, el) {
    const r = box.getBoundingClientRect?.();
    const b = el?.getBoundingClientRect?.();
    if (!b) return null;
    return b.top - (r ? r.top : 0) + box.scrollTop + b.height / 2;
  }

  /** The scrollTop that puts `el` in the middle of the box, as near as the
   *  page allows. */
  _centring(box, el) {
    const c = this._centreOf(box, el);
    if (c == null) return null;
    return Math.max(0, Math.min(c - box.clientHeight / 2,
      box.scrollHeight - box.clientHeight));
  }

  /**
   * THE STICK: SCROLL THE PAGE, BUT NEVER PAST THE NEXT BUTTON.
   *
   * Reported from play: "Using the joystick makes the screen pan in steps,
   * sometimes jumping over submenu items and making them not selectable. I
   * think a simple solution is to make it jump/step but if it 'jumps over' a
   * button, then it will jump/step less and only move the amount to where it
   * actually selects the button."
   *
   * WHICH IS WHAT THIS DOES. If putting the next button in the middle of the
   * box is no more than one step away, the page moves exactly that far and
   * the button is selected; otherwise the page moves a whole step and the
   * selection follows the middle of the page between the two, as it always
   * did. The page can never carry the middle past a button it has not
   * selected, so a button cannot be stepped over — however close together
   * they are, and however large a step is.
   *
   * AND IT SELECTS THE NEXT BUTTON EVEN WHEN THE PAGE CANNOT MOVE, which is
   * the half of the report that was not about step size. A button in the top
   * half-screen of the page cannot be brought to the middle, because the page
   * is already at its top; "no further than one step" is then zero pixels, so
   * the selection moves and the page stays. Same at the bottom — which is also
   * what makes BACK, under the last topic, reachable without a pin.
   *
   * NEVER BACKWARDS. A button the page is already past (its centring point is
   * behind where the page is) is selected where it stands: moving the page
   * UP on a press of DOWN would read as the stick being reversed.
   */
  _scrollItem(panel, items, i, dir) {
    const box = panel.querySelector('.panel');
    if (!box) return i;
    const from = box.scrollTop;
    const step = Math.max(SCROLL_STEP, box.clientHeight * READ_FRAC);
    const k = i + dir;
    const want = k >= 0 && k < items.length ? this._centring(box, items[k]) : null;
    if (want == null) {
      /* Nothing further that way: the page may still have prose below the last
         button (or above the first), and the stick is how it is read. */
      box.scrollTop = from + dir * step;
      return i;
    }
    if (dir * (want - from) <= step) {
      box.scrollTop = dir > 0 ? Math.max(from, want) : Math.min(from, want);
      return k;
    }
    box.scrollTop = from + dir * step;
    /* BETWEEN THE TWO, THE MIDDLE OF THE PAGE DECIDES — the rule from the
       report before this one, kept, and now only ever asked of these two. */
    const mid = box.scrollTop + box.clientHeight / 2;
    const ci = this._centreOf(box, items[i]);
    const ck = this._centreOf(box, items[k]);
    return ci != null && Math.abs(ck - mid) < Math.abs(ci - mid) ? k : i;
  }

  /**
   * THE ARROW BUTTONS: THE NEXT BUTTON, CENTRED.
   *
   * "Use the arrow buttons on the controller and have it when you press
   * up/down on arrow buttons, it will move between buttons... But, we should
   * not assume player has the arrow buttons, as on joycons, they only have
   * joystick" — which is why this is a second way in and not a replacement:
   * `_scrollItem` has to reach every button on its own.
   *
   * It wraps, like every `vertical` list, and it CENTRES rather than asking
   * `scrollIntoView` for 'nearest', so what she reads next is the prose under
   * the button she landed on rather than a header on the bottom edge of the
   * screen.
   */
  _stepItem(panel, items, i, dir) {
    const k = (i + dir + items.length) % items.length;
    const box = panel.querySelector('.panel');
    const want = box ? this._centring(box, items[k]) : null;
    if (want != null) box.scrollTop = want;
    return k;
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
  _scroll(panel, dir, frac = 0) {
    const box = panel.querySelector('.panel');
    if (!box || box.scrollHeight <= box.clientHeight) return;
    box.scrollTop += dir * Math.max(SCROLL_STEP, box.clientHeight * frac);
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
  _paint(items, i, follow = true) {
    const want = items[i] ?? null;
    if (want === this._lastPainted) return;
    this._clear();
    if (!want) return;
    want.classList.add('nav-focus');
    // Settings is taller than the screen; the ring is useless off-screen.
    // ...but NOT in `read` mode: see the call site. There the page is already
    // where her own thumb put it, and moving it is a fight with her.
    if (follow) want.scrollIntoView({ block: 'nearest' });
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
    this.focusEl.clear();
    this.lastPanel = null;
    this._clear();
  }

  /**
   * THE CURSOR FOLLOWS THE BUTTON, NOT THE ROW NUMBER.
   *
   * A UI FALL-THROUGH WE KEEP RE-INVENTING, and this is the general form of it.
   * A remembered index is a row number, and a row number is only meaningful
   * while the list is the same list. Two in this game rebuild themselves under
   * a live cursor — the DROP OUT rows (`Game._buildLeaveButtons`, one per extra
   * player, rebuilt the moment one of them leaves) and the remap grid (a row
   * per connected controller) — and when one of them shrinks, index 2 stops
   * meaning "FROST — DROP OUT" and starts meaning "STORM — DROP OUT".
   *
   * Reported from play: say yes to Frost leaving and the game immediately asks
   * whether Storm should leave too, on a row nobody chose. The manufactured
   * press edge that fired it is fixed in `input.js`, but the trap is here and
   * would still be here without it — one deliberate press on a row that slid
   * under the highlight half a second ago is a press on the wrong question.
   *
   * So: remember the ELEMENT. If it has moved, follow it. If it is gone, land
   * on the panel's way OUT — the seventh non-negotiable's default answer is no,
   * and the honest answer to "the thing you were pointing at no longer exists"
   * is not "here is its neighbour, press again".
   *
   * @param {number} i the remembered index, already clamped
   * @returns {number} the index to actually use this frame
   */
  _reseat(panel, items, i) {
    const was = this.focusEl.get(panel.id);
    if (!was || items[i] === was) return i;
    /* IT MOVED. A row above it went away, or the list re-ordered — either way
       she is still pointing at the button she was pointing at. */
    const moved = items.indexOf(was);
    if (moved >= 0) return moved;
    /* IT IS GONE. `.back` if the panel has one; otherwise the clamp above is
       the best that can be done, and every panel that can lose a row has one.
       NOT `.primary`: the point of landing somewhere is that it is somewhere
       harmless, and a primary is the row most worth pressing by accident. */
    const back = items.findIndex((el) => el.classList.contains('back'));
    return back >= 0 ? back : i;
  }
}
