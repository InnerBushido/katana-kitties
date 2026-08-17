/* ---------------------------------------------------------------------------
   The on-screen controls, and the pad they feed.

   ONE DEVICE, SAME SHAPE AS EVERY OTHER. `read()` returns exactly what a
   gamepad profile's `read()` returns — `{ ax, ay, cx, cy, dpad, jump, attack,
   interact, mount, sprint, start, map, math }` — so `InputManager` seats this in
   a player slot alongside a Pro Controller and nothing downstream learns a new
   word. `Player` cannot tell a thumb from a Joy-Con.

   POINTER EVENTS, NOT TOUCH EVENTS, and the reason is the mouse. Pointer events
   deliver a finger, a mouse and a stylus through one path, which is what makes
   the desktop test mode work at all: dragging the stick with a mouse is not a
   special case, it is the same code with `pointerType: 'mouse'`. It also means
   `touch-action: none` in the CSS does the scroll suppression, so there is no
   `preventDefault` on a passive listener to get wrong.

   EVERY POINTER IS TRACKED BY ITS OWN `pointerId`, and this is the one thing
   that must not be simplified. A thumb on the stick plus a thumb on JUMP plus a
   thumb on SLASH is three live pointers at once, and the obvious version —
   reading `touches[0]`, or keeping one "current" pointer — gives a stick that
   jumps to whichever button was pressed last. `_active` maps pointerId to what
   that pointer grabbed.

   A POINTER THAT VANISHES MUST RELEASE WHAT IT HELD. `pointercancel` fires when
   the browser takes a pointer away — a system gesture, a call arriving, the
   digitiser deciding it was a palm — and without handling it a held SPRINT
   stays down forever with nothing on screen to say why. Same for
   `pointerup` landing outside the element, which is why the listeners are on
   `window` rather than on the buttons.

   THE STICK FLOATS. Its base is placed where the thumb lands inside the left
   zone rather than drawn at a fixed spot, because a nine-year-old does not put
   her thumb where a designer drew a circle. Only the KNOB is clamped to the
   base radius; the pointer may wander anywhere and the direction still reads.

   BUT IT IS DRAWN AT REST TOO, DIMLY, AND THAT IS NOT DECORATION. The first
   version faded it in only once a thumb had landed, which is tidy and assumes
   the player already knows the left half of the screen is a stick. She does not:
   the whole audience for this is nine and younger, and an invisible control is
   one she has to be TOLD about. So there is a faint base sitting where a left
   thumb naturally rests, it brightens and jumps to wherever she actually
   touches, and it drifts back when she lets go. The affordance is visible and
   the floating behaviour is kept.

   SPRINT IS A REAL BUTTON, and this was the tempting thing to get wrong.
   Auto-sprint on full stick deflection removes a button and feels natural right
   up until the tournament: `ATTACKS.dash` fires on `sprint && moving`, so
   auto-sprint turns every moving attack in the ring into a dash attack. Sprint
   has to be something she chooses.

   `map` AND `math` HAVE NO BUTTONS HERE. Eight actions do not fit under two
   thumbs, and those two already have somewhere to live: the minimap and the
   sin/cos board are on screen, so they are tapped directly — see
   `Game._bindTouchHud`. A control that is already the thing it controls needs no
   second copy of itself.

   THE KEYBOARD FEEDS THE BUTTONS IN TEST MODE, which is why `read` takes a
   keyset. On a real phone there is no keyboard and this contributes nothing; on
   a desktop pretending to be a phone it means the whole pad can be exercised
   from WASD while the mouse works the stick. It is OR'd in rather than replacing
   anything, so the on-screen buttons light up for keyboard presses too — that
   is the readout, and it is the same code path either way.
--------------------------------------------------------------------------- */

import { ACTIONS } from './input.js';

/** Which actions get an on-screen button, and where they sit.
 *
 *  THE DIAMOND MATCHES A PAD'S FACE CLUSTER — jump at the bottom, attack left,
 *  interact right, mount on top — so the HELP screen's `A`/`X`/`B`/`Y` language
 *  keeps meaning something when a kid is reading it on a phone. Getting this
 *  arrangement from the pad rather than inventing one is the whole reason a
 *  child can move between the two.
 *
 *  `grid` is a row/column in the right-hand cluster; `size` is a multiplier on
 *  the base button diameter. JUMP is biggest because it is pressed most. */
export const TOUCH_BUTTONS = [
  { action: 'jump', label: 'JUMP', glyph: 'A', grid: [2, 2], size: 1.18 },
  { action: 'attack', label: 'SLASH', glyph: 'X', grid: [2, 1], size: 1.0 },
  { action: 'interact', label: 'CLAN', glyph: 'B', grid: [2, 3], size: 0.86 },
  { action: 'mount', label: 'RIDE', glyph: 'Y', grid: [1, 2], size: 0.86 },
  { action: 'sprint', label: 'RUN', glyph: 'ZR', grid: [1, 3], size: 0.86 },
];

/** How far the knob travels before the stick reads full deflection, in CSS px.
 *  Deliberately short: a thumb on glass does not move far, and the deadzone in
 *  `InputManager` already eats the first fifth of it. */
const STICK_RADIUS = 46;

/** Below this fraction of the radius the stick reads as centred. Smaller than
 *  the pad deadzone on purpose — `InputManager.dead` is what actually shapes
 *  the response, and doubling up would make the first third of the travel
 *  dead. */
const STICK_DEAD = 0.06;

export class TouchPad {
  /**
   * @param {HTMLElement} root  the overlay container, already in the document
   */
  constructor(root) {
    this.root = root;
    /** pointerId -> { kind: 'stick' | 'button', action?, el? } */
    this._active = new Map();
    /** Held state this frame, by action. Buttons write here; `read` reads it. */
    this._held = Object.fromEntries(ACTIONS.map((a) => [a, false]));
    this._ax = 0;
    this._ay = 0;
    /** Where the floating stick base was placed, in client px. */
    this._origin = { x: 0, y: 0 };
    this.visible = false;

    this._build();
    this._bind();
  }

  /* ------------------------------- markup ------------------------------- */

  _build() {
    this.root.innerHTML = '';
    this.root.classList.add('touch-pad');

    /* The left half is the stick's catchment, and it is an element rather than a
       coordinate test so the CSS owns where it reaches — the safe-area inset on
       a notched phone is a CSS problem and this must not have a second opinion
       about it. */
    this.zone = document.createElement('div');
    this.zone.className = 'tp-zone';

    this.stick = document.createElement('div');
    this.stick.className = 'tp-stick';
    this.stick.style.setProperty('--r', `${STICK_RADIUS}px`);
    this.knob = document.createElement('div');
    this.knob.className = 'tp-knob';
    this.stick.appendChild(this.knob);
    this.zone.appendChild(this.stick);

    this.cluster = document.createElement('div');
    this.cluster.className = 'tp-cluster';

    /** action -> its button element, so `_paint` can light them from ANY
     *  source. This is the on-screen readout the desktop test mode needs. */
    this.buttons = new Map();
    for (const b of TOUCH_BUTTONS) {
      const el = document.createElement('button');
      el.className = `tp-btn tp-${b.action}`;
      el.type = 'button';
      el.style.gridRow = String(b.grid[0]);
      el.style.gridColumn = String(b.grid[1]);
      el.style.setProperty('--size', String(b.size));
      el.dataset.action = b.action;
      el.innerHTML = `<span class="tp-glyph">${b.glyph}</span>`
        + `<span class="tp-label">${b.label}</span>`;
      /* Not focusable. A focused button would take the keyboard's Space and
         Enter — which are jump and the scene-skip key — and fire itself. */
      el.tabIndex = -1;
      this.cluster.appendChild(el);
      this.buttons.set(b.action, el);
    }

    /* PAUSE IS ITS OWN THING, top corner, away from the thumbs. `start` is the
       one action that must not sit next to jump: it is how a kid leaves the
       game, and a mis-tap costs her the round. */
    this.pause = document.createElement('button');
    this.pause.className = 'tp-btn tp-pause';
    this.pause.type = 'button';
    this.pause.tabIndex = -1;
    this.pause.dataset.action = 'start';
    this.pause.innerHTML = '<span class="tp-glyph">II</span>';
    this.buttons.set('start', this.pause);

    this.root.append(this.zone, this.cluster, this.pause);
  }

  /* ------------------------------ pointers ------------------------------ */

  _bind() {
    /* DOWN ON THE OVERLAY, UP AND CANCEL ON THE WINDOW. A pointer that starts
       on JUMP and lifts 200px away still has to release JUMP, and a listener on
       the button itself never hears that. */
    this.root.addEventListener('pointerdown', (e) => this._down(e));
    window.addEventListener('pointermove', (e) => this._move(e));
    window.addEventListener('pointerup', (e) => this._up(e));
    window.addEventListener('pointercancel', (e) => this._up(e));
    /* The tab going away releases everything. Same reason `InputManager` clears
       its key set on blur: a held button across a focus change is a control
       that is down with nobody touching it. */
    window.addEventListener('blur', () => this._releaseAll());
    /* A long press on a button raises the selection callout on iOS and the
       context menu everywhere else, and both of them eat the pointerup. */
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _down(e) {
    if (!this.visible) return;
    const btn = e.target.closest?.('.tp-btn');
    if (btn) {
      this._active.set(e.pointerId, { kind: 'button', action: btn.dataset.action });
      this._held[btn.dataset.action] = true;
      return;
    }
    if (!this.zone.contains(e.target)) return;

    /* THE BASE GOES WHERE THE THUMB IS. */
    this._active.set(e.pointerId, { kind: 'stick' });
    this._origin = { x: e.clientX, y: e.clientY };
    this._placeStick(e.clientX, e.clientY);
    this.stick.classList.add('live');
    this._moveStick(e.clientX, e.clientY);
  }

  _move(e) {
    const a = this._active.get(e.pointerId);
    if (!a) return;
    if (a.kind === 'stick') this._moveStick(e.clientX, e.clientY);
  }

  _up(e) {
    const a = this._active.get(e.pointerId);
    if (!a) return;
    this._active.delete(e.pointerId);
    if (a.kind === 'stick') {
      this._ax = 0;
      this._ay = 0;
      this.stick.classList.remove('live');
      this.knob.style.transform = 'translate(-50%, -50%)';
      this._parkStick();
      return;
    }
    /* ONLY IF NO OTHER POINTER IS STILL HOLDING IT. Two thumbs on one button is
       silly but it happens, and releasing on the first lift would drop an action
       the player is still pressing. */
    const stillHeld = [...this._active.values()].some(
      (o) => o.kind === 'button' && o.action === a.action
    );
    if (!stillHeld) this._held[a.action] = false;
  }

  _moveStick(cx, cy) {
    const dx = cx - this._origin.x;
    const dy = cy - this._origin.y;
    const len = Math.hypot(dx, dy);
    /* Clamp the KNOB, not the reading. Past full deflection the direction is
       still whatever the thumb is doing — a thumb that slides off the base is
       pushing harder, not letting go. */
    const k = len > STICK_RADIUS ? STICK_RADIUS / len : 1;
    this.knob.style.transform =
      `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;

    const nx = dx / STICK_RADIUS;
    const ny = dy / STICK_RADIUS;
    const n = Math.hypot(nx, ny);
    if (n < STICK_DEAD) {
      this._ax = 0;
      this._ay = 0;
      return;
    }
    // Clamped to the unit circle so a corner drag is not faster than an edge one.
    const s = n > 1 ? 1 / n : 1;
    this._ax = nx * s;
    this._ay = ny * s;
  }

  _releaseAll() {
    this._active.clear();
    for (const a of ACTIONS) this._held[a] = false;
    this._ax = 0;
    this._ay = 0;
    this.stick.classList.remove('live');
    this.knob.style.transform = 'translate(-50%, -50%)';
    this._parkStick();
  }

  /**
   * Move the base to a point given in CLIENT coordinates.
   *
   * OFFSETS ARE RELATIVE TO THE ZONE, NOT THE OVERLAY, and that is the one thing
   * to get right here. `.tp-stick` lives inside `.tp-zone`, which is
   * `position: absolute` — so it IS the containing block, and `left`/`top` are
   * resolved against it. Measuring against `#touch-pad` instead put the base
   * exactly the zone's own y-offset (92px at 420px tall) BELOW the thumb, and it
   * was invisible in testing because the direction is computed from `_origin` in
   * client space: the stick read perfectly while being drawn in the wrong place.
   *
   * One function for both callers so the resting position and the landing
   * position cannot drift apart.
   */
  _placeStick(cx, cy) {
    const z = this.zone.getBoundingClientRect();
    if (!z.width) return;   // display:none — nothing to measure yet
    this.stick.style.left = `${cx - z.x}px`;
    this.stick.style.top = `${cy - z.y}px`;
  }

  /**
   * Put the base back where a left thumb rests, so there is always something on
   * screen saying "the stick is here".
   *
   * Measured off the ZONE rather than the window, so the safe-area inset the CSS
   * applies to the overlay moves this with it — a fixed percentage of the
   * viewport would sit under the notch on a phone held in landscape.
   */
  _parkStick() {
    const z = this.zone.getBoundingClientRect();
    if (!z.width) return;
    this._origin = { x: z.x + z.width * 0.3, y: z.y + z.height * 0.62 };
    this._placeStick(this._origin.x, this._origin.y);
  }

  /* -------------------------------- state ------------------------------- */

  /** Show or hide the whole overlay. Hiding releases everything held — a pad
   *  that disappears mid-press must not leave the action down. */
  setVisible(on) {
    if (this.visible === on) return;
    this.visible = on;
    this.root.classList.toggle('hidden', !on);
    if (!on) {
      this._releaseAll();
      return;
    }
    /* Park it AFTER it is displayed: the zone has no bounding box while the
       overlay is `display: none`, so measuring first parks it at 0,0 and the
       resting base sits in the corner. */
    this._parkStick();
  }

  /** The zone moves when the window does, so the resting base has to follow. */
  reflow() {
    if (this.visible && !this._active.size) this._parkStick();
  }

  /**
   * The pad, in the same shape a gamepad profile returns.
   *
   * @param {object=} opts
   * @param {object=} opts.keyset  a KEYSETS entry to OR in (desktop test mode)
   * @param {Set<string>=} opts.keys  currently-held key codes
   */
  read({ keyset = null, keys = null } = {}) {
    const out = {
      ax: this._ax,
      ay: this._ay,
      cx: 0,
      cy: 0,
      dpad: [0, 0],
    };
    for (const a of ACTIONS) out[a] = this._held[a];

    /* THE KEYBOARD IS ADDITIVE, NEVER A REPLACEMENT. On a phone `keyset` is
       null and this loop does not run; in test mode it means the mouse can hold
       the stick while a hand works the buttons, which is the only way to
       exercise both at once with one pointer. */
    if (keyset && keys) {
      const on = (f) => (keyset[f] ?? []).some((c) => keys.has(c));
      for (const a of ACTIONS) if (on(a)) out[a] = true;
      let kx = 0;
      let ky = 0;
      if (on('left')) kx -= 1;
      if (on('right')) kx += 1;
      if (on('up')) ky -= 1;
      if (on('down')) ky += 1;
      /* The stick wins when it is being held, so a mouse drag is not cancelled
         by a hand resting on the keys. */
      if ((kx || ky) && !this._ax && !this._ay) {
        const len = Math.hypot(kx, ky) || 1;
        out.ax = kx / len;
        out.ay = ky / len;
      }
    }
    return out;
  }

  /**
   * Light the buttons that are actually down, whatever pressed them.
   *
   * THIS IS THE READOUT, and it is why the keyboard is merged in `read` rather
   * than in `InputManager`: pressing `F` on a desktop lights SLASH on screen, so
   * the test mode shows the same thing a thumb would. Takes the RESOLVED pad
   * state rather than `this._held`, so what lights up is what the game acted on.
   */
  paint(padState) {
    if (!this.visible || !padState) return;
    for (const [action, el] of this.buttons) {
      el.classList.toggle('down', !!padState.held?.[action]);
    }
  }
}
