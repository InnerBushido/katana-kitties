/* ---------------------------------------------------------------------------
   Input.

   Two players, each bound to either a gamepad or a keyboard set.

   Four ways to play, all live at once:

     keyboard        WASD (P1) and arrows/numpad (P2).
     standard        Pro Controller 2 / anything Chrome remaps to "standard".
     joyconSideways  ONE Joy-Con per player, each paired as its OWN gamepad.
     vjoyDual        BOTH Joy-Cons arriving as a SINGLE vJoy device. One pad,
                     24 buttons, two sticks — split down the middle so each
                     player drives one half. This is the main setup.

   The vJoy split is the odd one out architecturally: a player slot is bound to
   a { pad, half } pair rather than to a pad, and both slots can name the same
   pad with different halves. Everything downstream still sees two independent
   PadStates.

   The vJoy button numbers cannot be known ahead of time — they depend on
   whatever feeder is driving vJoy. Only two are confirmed on Richard's setup
   (left SR = 17, right SR = 14); the rest of DEFAULT_VJOY_MAP is a guess.
   That's fine: Settings -> Controllers can rebind any of them by pressing the
   button, and the result persists in localStorage. Don't spend time guessing
   here — calibrate there.
--------------------------------------------------------------------------- */

export const ACTIONS = ['jump', 'attack', 'interact', 'mount', 'sprint', 'start'];

const MAP_STORAGE_KEY = 'kk.vjoy.map.v2';

/* vJoy's axes in HID usage order, which is the order Chrome hands them to us
 * as gp.axes[0..n]. Only the ones the feeder actually enables are present, so
 * an index is NOT reliably a given name — this is for labelling the readout. */
export const VJOY_AXIS_NAMES = ['X', 'Y', 'Z', 'Rx', 'Ry', 'Rz', 'Slider', 'Dial'];

/* One half of the merged vJoy pad.
 *
 * axX / axY are axis indices; invX / invY flip them. Game convention: +x is
 * screen right, and +y is screen DOWN (so up is negative, matching the
 * keyboard set).
 *
 * MEASURED on Richard's hardware, both Joy-Cons held sideways:
 *
 *   axes[0]=X  axes[1]=Y   left Joy-Con stick
 *   axes[2]=Z              (enabled, never moves)
 *   axes[3]=Rx axes[4]=Ry  right Joy-Con stick
 *
 *   LEFT   push right -> Y negative   push up -> X positive
 *   RIGHT  push right -> Ry negative  push up -> Rx negative
 *
 * which gives, holding to +y = down:
 *
 *   left   x = -axes[1]   y = -axes[0]
 *   right  x = -axes[4]   y = +axes[3]
 *
 * Do NOT re-derive these from "the halves rotate opposite ways, so the signs
 * mirror". They don't mirror — three of the four signs came out wrong that
 * way. The sideways rotation depends on how the feeder wired each half, which
 * is only knowable by pushing the stick and reading the number.
 *
 * That's also why autoDetectSticks() only re-numbers the axes and inherits the
 * signs from here: a pad at rest cannot tell you which way is up.
 *
 * Actions hold ARRAYS of button indices — sprint wants both SL and SR, since
 * either shoulder under your index finger should do it.
 *
 * CONFIRMED on hardware: left SR = 17, right SR = 14. */
const DEFAULT_VJOY_MAP = {
  left: {
    axX: 1, invX: true, axY: 0, invY: true,      // X / Y
    // Held sideways the d-pad becomes the face cluster.
    jump: [11],       // Down
    attack: [9],     // Left
    interact: [8],   // Right
    mount: [10],      // Up
    sprint: [16, 17], // SL / SR  (17 confirmed)
    start: [13],       // Minus
  },
  right: {
    axX: 4, invX: true, axY: 3, invY: false,     // Ry / Rx
    jump: [4],        // B
    attack: [6],      // Y
    interact: [7],    // A
    mount: [5],       // X
    sprint: [14, 15], // SR / SL  (14 confirmed)
    start: [12],       // Plus
  },
};

export const HALVES = ['left', 'right'];

/** Field labels for the Settings remap grid — order is the display order. */
export const MAP_FIELDS = [
  { key: 'stickX', label: 'Stick — push RIGHT', kind: 'axisX' },
  { key: 'stickY', label: 'Stick — push UP', kind: 'axisY' },
  ...ACTIONS.map((a) => ({ key: a, label: a, kind: 'button' })),
];

function cloneMap(m) {
  return {
    left: { ...m.left, ...Object.fromEntries(ACTIONS.map((a) => [a, [...m.left[a]]])) },
    right: { ...m.right, ...Object.fromEntries(ACTIONS.map((a) => [a, [...m.right[a]]])) },
  };
}

/* Maps a raw gamepad into a normalised shape:
   { ax, ay, cx, cy, dpad, jump, attack, interact, mount, sprint, start } */
const PROFILES = {
  /* Both Joy-Cons merged into one virtual pad (vJoy, VID 1234 / PID bead).
     Read once per half — the caller passes which half it wants. */
  vjoyDual: {
    test: (gp) => /vjoy|virtual joystick|vendor:\s*1234/i.test(gp.id) && gp.buttons.length >= 16,
    read: (gp, opts = {}) => readHalf(gp, (opts.map ?? DEFAULT_VJOY_MAP)[opts.half ?? 'left']),
  },

  /* Chrome's remapped "standard" layout — Pro Controller 2 and most pads
     land here when wired or paired as a full controller. */
  standard: {
    test: (gp) => gp.mapping === 'standard',
    read: (gp) => ({
      ax: gp.axes[0] ?? 0,
      ay: gp.axes[1] ?? 0,
      cx: gp.axes[2] ?? 0,
      cy: gp.axes[3] ?? 0,
      jump: b(gp, 0),
      attack: b(gp, 2),
      interact: b(gp, 1),
      mount: b(gp, 3),
      sprint: b(gp, 6) || b(gp, 7) || b(gp, 10) || b(gp, 11),
      start: b(gp, 9),
      dpad: [b(gp, 14) ? -1 : b(gp, 15) ? 1 : 0, b(gp, 12) ? -1 : b(gp, 13) ? 1 : 0],
    }),
  },

  /* A single Joy-Con held sideways, paired as its own gamepad.
   *
   * The two halves are turned OPPOSITE ways to play like this — the left one
   * rotates clockwise, the right one counter-clockwise, both so the SL/SR rail
   * ends up under your index fingers. So the stick needs opposite corrections:
   *
   *   left  held sideways:  screen x = -native y,  screen y = +native x
   *   right held sideways:  screen x = +native y,  screen y = -native x
   *
   * Getting this wrong is not subtle — one player's stick comes out rotated
   * 180 degrees from the other's. */
  joyconSideways: {
    test: (gp) => /joy-?con/i.test(gp.id) && !/pair|charging grip|\(l\/r\)/i.test(gp.id),
    read: (gp, opts = {}) => {
      const raw0 = gp.axes[0] ?? 0;
      const raw1 = gp.axes[1] ?? 0;

      let cw; // true = rotate stick clockwise (the left Joy-Con)
      if (opts.rotation === 'cw') cw = true;
      else if (opts.rotation === 'ccw') cw = false;
      else if (opts.rotation === 'none') cw = null;
      else cw = !/\(\s*r\s*\)|right/i.test(gp.id); // auto: assume left unless it says right

      let ax;
      let ay;
      if (cw === null) { ax = raw0; ay = raw1; }
      else if (cw) { ax = -raw1; ay = raw0; }
      else { ax = raw1; ay = -raw0; }

      // One index per action, no overlaps. An earlier version accepted several
      // buttons per action to be "forgiving" and instead made one press fire
      // two actions — jumping also threw you off the dragon.
      return {
        ax,
        ay,
        cx: 0,
        cy: 0,
        jump: b(gp, 11) || b(gp, 4),
        attack: b(gp, 8) || b(gp, 7),
        interact: b(gp, 0) || b(gp, 1) || b(gp, 2) || b(gp, 3),
        mount: b(gp, 10) || b(gp, 5),
        sprint: b(gp, 16) || b(gp, 17) || b(gp, 14) || b(gp, 15), // SL / SR
        start: b(gp, 6) || b(gp, 9),
        dpad: [0, 0],
      };
    },
  },

  /* Fallback for anything unrecognised: assume the first two axes are a stick
     and the first four buttons are the face cluster. */
  generic: {
    test: () => true,
    read: (gp) => ({
      ax: gp.axes[0] ?? 0,
      ay: gp.axes[1] ?? 0,
      cx: gp.axes[2] ?? 0,
      cy: gp.axes[3] ?? 0,
      jump: b(gp, 0),
      attack: b(gp, 2),
      interact: b(gp, 1),
      mount: b(gp, 3),
      sprint: b(gp, 6) || b(gp, 7),
      start: b(gp, 9) || b(gp, 8),
      dpad: [0, 0],
    }),
  },
};

const PROFILE_ORDER = ['vjoyDual', 'joyconSideways', 'standard', 'generic'];

function b(gp, i) {
  const btn = gp.buttons[i];
  return !!btn && (btn.pressed || btn.value > 0.5);
}

function axisOf(gp, i, inv) {
  if (i == null) return 0;
  const v = gp.axes[i] ?? 0;
  return inv ? -v : v;
}

function readHalf(gp, m) {
  const out = {
    ax: axisOf(gp, m.axX, m.invX),
    ay: axisOf(gp, m.axY, m.invY),
    cx: 0,
    cy: 0,
    dpad: [0, 0],
  };
  for (const a of ACTIONS) out[a] = (m[a] ?? []).some((i) => b(gp, i));
  return out;
}

function profileFor(gp) {
  for (const key of PROFILE_ORDER) if (PROFILES[key].test(gp)) return PROFILES[key];
  return PROFILES.generic;
}

const KEYSETS = [
  {
    name: 'WASD',
    up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
    jump: 'Space', attack: 'KeyF', interact: 'KeyE', mount: 'KeyQ',
    sprint: 'ShiftLeft', start: 'Enter',
  },
  {
    name: 'Arrows',
    up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
    jump: 'Numpad0', attack: 'Numpad1', interact: 'Numpad2', mount: 'Numpad3',
    sprint: 'ControlRight', start: 'NumpadEnter',
  },
];

/** Per-player snapshot with edge detection. */
class PadState {
  constructor() {
    this.mx = 0;
    this.my = 0;
    this.held = Object.fromEntries(ACTIONS.map((a) => [a, false]));
    this.prev = { ...this.held };
    this.source = 'keyboard';
  }

  pressed(action) {
    return this.held[action] && !this.prev[action];
  }

  down(action) {
    return this.held[action];
  }
}

export class InputManager {
  constructor() {
    this.keys = new Set();
    this.players = [new PadState(), new PadState()];
    /** Per player slot: which pad and (for a merged pad) which half of it. */
    this.bindings = [{ pad: null, half: null }, { pad: null, half: null }];
    this.anyKeyThisFrame = false;
    this._anyPressLatch = false;
    this._order = [];        // pad indices in connection order
    this._capture = null;    // active remap capture, see beginCapture()
    this._axisWatch = new Map();   // pad index -> range each axis has covered
    this._buttonsSeen = new Map(); // pad index -> Set of indices ever pressed

    /** 'auto' | 'split' | 'separate' — how to hand pads out to the two slots.
     *  auto: split a merged vJoy pad in two when it's the only pad present. */
    this.padMode = 'auto';
    /** 'auto' | 'cw' | 'ccw' | 'none' — stick rotation for a single Joy-Con
     *  paired as its own gamepad. The vJoy halves don't use this; their
     *  rotation lives in the axis map. */
    this.joyconRotation = 'auto';
    this._mapFromStorage = false;
    this.vjoyMap = this._loadMap();
    /** Sticks are sniffed once from a merged pad at rest — but never over a
     *  map the player has already calibrated by hand. */
    this._autoAxesDone = this._mapFromStorage;
    this.autoAxesResult = null;

    window.addEventListener('keydown', (e) => {
      // Don't let space/arrows scroll the page out from under the game.
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    window.addEventListener('gamepadconnected', (e) => {
      if (!this._order.includes(e.gamepad.index)) this._order.push(e.gamepad.index);
      console.log(
        `[input] gamepad ${e.gamepad.index} "${e.gamepad.id}" ` +
        `-> profile ${this.profileNameFor(e.gamepad)}, ${e.gamepad.buttons.length} buttons, ` +
        `${e.gamepad.axes.length} axes`
      );
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      this._order = this._order.filter((i) => i !== e.gamepad.index);
    });
  }

  profileNameFor(gp) {
    for (const key of PROFILE_ORDER) if (PROFILES[key].test(gp)) return key;
    return 'generic';
  }

  /* ------------------------------ remapping ----------------------------- */

  _loadMap() {
    const base = cloneMap(DEFAULT_VJOY_MAP);
    try {
      const saved = JSON.parse(localStorage.getItem(MAP_STORAGE_KEY) ?? 'null');
      if (!saved) return base;
      for (const half of HALVES) Object.assign(base[half], saved[half] ?? {});
      this._mapFromStorage = true;
    } catch {
      /* corrupt or unavailable storage — defaults are fine */
    }
    return base;
  }

  _saveMap() {
    try {
      localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify(this.vjoyMap));
    } catch {
      /* private mode / storage full — the map still works this session */
    }
  }

  resetMap() {
    this.vjoyMap = cloneMap(DEFAULT_VJOY_MAP);
    this._mapFromStorage = false;
    this._autoAxesDone = false;
    this._autoAxesUntil = null;
    this.autoAxesResult = null;
    try { localStorage.removeItem(MAP_STORAGE_KEY); } catch { /* ignore */ }
  }

  /**
   * RE-NUMBER the two sticks from the pad sitting at rest.
   *
   * vJoy exposes only the axes its feeder enabled, so an index is not a fixed
   * name — the right stick lands on 3/4 with Z enabled and 2/3 without it, and
   * reading a wrong index gives a stick that is silently dead. The axes that
   * carry nothing may sit pinned at their minimum — or, on vJoy, may rest at
   * dead centre exactly like a released stick. So resting position is a weak
   * signal and MOVEMENT is the real one: wiggle both sticks and the axes that
   * travelled are the sticks, first pair left, last pair right. Resting
   * position is only a fallback, and only when exactly four axes qualify.
   *
   * It only moves the INDICES. Signs come from DEFAULT_VJOY_MAP, because a pad
   * cannot tell you which way is up — that was measured by hand, and guessing
   * it from "the halves mirror each other" got three of four wrong.
   */
  autoDetectSticks(gp, { quiet = false, requireMovement = false } = {}) {
    if (!gp) {
      const bnd = this.bindings.find((x) => x.half === 'left') ?? this.bindings[0];
      gp = bnd.pad != null ? (navigator.getGamepads?.() ?? [])[bnd.pad] : null;
    }
    if (!gp) return null;

    // Preferred evidence: axes that have actually TRAVELLED. Resting values
    // are not the tell they look like — on Richard's vJoy every axis rests at
    // 0.00 whether it carries a stick or nothing at all, so "centred" picked
    // up all eight and put the right stick on 6/7. Movement can't lie.
    const w = this._axisWatch.get(gp.index);
    const moved = [];
    if (w) {
      for (let i = 0; i < gp.axes.length; i++) {
        if (w.max[i] - w.min[i] > 0.3) moved.push(i);
      }
    }

    const centred = [];
    gp.axes.forEach((v, i) => { if (Math.abs(v ?? 0) < 0.35) centred.push(i); });

    // Fall back to resting position only when nothing has been wiggled yet,
    // and only when it is unambiguous — exactly four candidates. More than
    // four means the dead channels also rest at centre and there is no way to
    // tell which pair is which; say so instead of binding something wrong.
    const from = moved.length >= 4 ? moved : centred;
    const source = moved.length >= 4 ? 'movement' : 'rest';
    const [lx, ly] = from.slice(0, 2);
    const [rx, ry] = from.slice(-2);
    // Resting position is a guess, so it is only ever allowed when a human
    // asked for it. Left to run unattended it will happily bind a map from a
    // stick that happened to be held at that instant — and save it.
    const restNotAllowed = source === 'rest' && (requireMovement || from.length > 4);
    if (from.length < 4 || restNotAllowed || rx === lx || rx === ly) {
      const fail = {
        ok: false, centred, moved, axisCount: gp.axes.length, ambiguous: from.length > 4,
      };
      // The automatic pass runs before anyone has touched a stick, so it fails
      // by design. Only report a failure the player actually asked for —
      // otherwise Settings shows an alarming red note about a map that is fine.
      if (!quiet) this.autoAxesResult = fail;
      return fail;
    }

    // Same shape as the defaults — screen x reads the half's SECOND native
    // axis, screen y its first — so inheriting invX/invY keeps the measured
    // orientation no matter where the pair moved to.
    const d = DEFAULT_VJOY_MAP;
    Object.assign(this.vjoyMap.left,
      { axX: ly, invX: d.left.invX, axY: lx, invY: d.left.invY });
    Object.assign(this.vjoyMap.right,
      { axX: ry, invX: d.right.invX, axY: rx, invY: d.right.invY });

    this._saveMap();
    this.autoAxesResult = {
      ok: true, centred, moved, source, axisCount: gp.axes.length,
      left: [lx, ly], right: [rx, ry],
    };
    console.log(`[input] sticks detected by ${source} — left axes ${lx}/${ly},`
      + ` right ${rx}/${ry} (of ${gp.axes.length})`);
    return this.autoAxesResult;
  }

  /**
   * Arm a capture: the next button pressed (or stick direction pushed) on the
   * merged pad becomes this half's binding.
   *
   * @param half   'left' | 'right'
   * @param field  one of MAP_FIELDS' keys
   */
  beginCapture(half, field) {
    const spec = MAP_FIELDS.find((f) => f.key === field);
    const pad = this.bindings.find((x) => x.half === half)?.pad
      ?? this.bindings.find((x) => x.pad != null)?.pad;
    if (!spec || pad == null) return false;

    const gp = (navigator.getGamepads?.() ?? [])[pad];
    if (!gp) return false;

    this._capture = {
      half,
      field,
      kind: spec.kind,
      pad,
      expires: performance.now() + 8000,
      // Baseline so a button already held, or an axis resting off-centre,
      // doesn't instantly "capture" itself.
      base: {
        buttons: gp.buttons.map((_, i) => b(gp, i)),
        axes: gp.axes.map((v) => v ?? 0),
      },
    };
    return true;
  }

  cancelCapture() {
    this._capture = null;
  }

  /** null, or { half, field, kind } while a capture is armed. */
  get capturing() {
    const c = this._capture;
    return c ? { half: c.half, field: c.field, kind: c.kind } : null;
  }

  _updateCapture(pads) {
    const c = this._capture;
    if (!c) return;
    if (performance.now() > c.expires) { this._capture = null; return; }

    const gp = pads[c.pad];
    if (!gp) return;
    const m = this.vjoyMap[c.half];

    if (c.kind === 'button') {
      for (let i = 0; i < gp.buttons.length; i++) {
        if (b(gp, i) && !c.base.buttons[i]) {
          m[c.field] = [i];
          this._saveMap();
          this._capture = null;
          return;
        }
      }
      return;
    }

    // Axis: take the axis that moved furthest from where it was resting, and
    // read the sign off the direction asked for. Capturing "push RIGHT" and
    // "push UP" separately means the sideways 90-degree rotation falls out of
    // the calibration for free — no rotation setting to get backwards.
    let best = -1;
    let bestD = 0;
    for (let i = 0; i < gp.axes.length; i++) {
      const d = (gp.axes[i] ?? 0) - (c.base.axes[i] ?? 0);
      if (Math.abs(d) > Math.abs(bestD)) { bestD = d; best = i; }
    }
    if (best < 0 || Math.abs(bestD) < 0.5) return;

    if (c.kind === 'axisX') {
      m.axX = best;
      m.invX = bestD < 0;     // pushing right must read positive
    } else {
      m.axY = best;
      m.invY = bestD > 0;     // pushing up must read negative (screen y is down)
    }
    this._saveMap();
    this._capture = null;
  }

  /**
   * Record the full range each axis has covered since the pad appeared.
   *
   * A snapshot can't tell a released stick from a dead channel — both read
   * 0.00. The range can: wiggle everything, and a live axis shows how far it
   * actually travels. That separates the two ways a stick "returns nothing":
   * an axis that never moves at all (nothing reaching the browser, not a game
   * bug) from one that moves only a little (real, but inside the deadzone).
   */
  _watchAxes(pads) {
    for (const gp of pads) {
      if (!gp) continue;
      let w = this._axisWatch.get(gp.index);
      if (!w || w.min.length !== gp.axes.length) {
        w = { min: gp.axes.map((v) => v ?? 0), max: gp.axes.map((v) => v ?? 0) };
        this._axisWatch.set(gp.index, w);
      }
      for (let i = 0; i < gp.axes.length; i++) {
        const v = gp.axes[i] ?? 0;
        if (v < w.min[i]) w.min[i] = v;
        if (v > w.max[i]) w.max[i] = v;
      }

      let seen = this._buttonsSeen.get(gp.index);
      if (!seen) { seen = new Set(); this._buttonsSeen.set(gp.index, seen); }
      for (let i = 0; i < gp.buttons.length; i++) if (b(gp, i)) seen.add(i);
    }
  }

  /** Forget the recorded ranges — the readout's "wiggle again" button. */
  resetAxisWatch() {
    this._axisWatch.clear();
  }

  /**
   * True once a pad has proved its buttons work while not one axis has ever
   * moved — the signature of a browser that can't read this device's sticks.
   *
   * Chrome does exactly this with the vJoy Joy-Con pad: buttons arrive,
   * `timestamp` advances, every axis stays 0.00000 forever. Firefox reads the
   * same device correctly. Detected by behaviour rather than by sniffing the
   * user agent, so it stays true whatever ships next.
   *
   * Wants several buttons, not one: a single stray press during loading
   * shouldn't accuse the browser before anyone has touched a stick.
   */
  sticksUnreadable() {
    for (const [index, w] of this._axisWatch) {
      const pressed = this._buttonsSeen.get(index);
      if (!pressed || pressed.size < 3) continue;
      const anyAxisMoved = w.min.some((min, i) => w.max[i] - min > 0.02);
      if (!anyAxisMoved) return true;
    }
    return false;
  }

  /* ------------------------------ bindings ------------------------------ */

  _syncBindings(pads) {
    for (const gp of pads) {
      if (gp && !this._order.includes(gp.index)) this._order.push(gp.index);
    }
    this._order = this._order.filter((i) => pads[i]);
    const live = this._order.map((i) => pads[i]).filter(Boolean);

    const next = [{ pad: null, half: null }, { pad: null, half: null }];
    const merged = live.find((gp) => this.profileNameFor(gp) === 'vjoyDual');
    const split = this.padMode === 'split'
      || (this.padMode === 'auto' && !!merged && live.length === 1);

    if (split && (merged ?? live[0])) {
      // One pad, two players: P1 drives the left half, P2 the right.
      const gp = merged ?? live[0];
      next[0] = { pad: gp.index, half: 'left' };
      next[1] = { pad: gp.index, half: 'right' };
    } else {
      live.slice(0, 2).forEach((gp, i) => { next[i] = { pad: gp.index, half: null }; });
    }
    this.bindings = next;
  }

  /**
   * Live view of every connected pad for the settings screen: what it says it
   * is, which profile matched, which player slots read it, the raw button
   * indices currently down, every axis, and which game actions resolve.
   *
   * This exists because the vJoy button numbers are whatever the feeder driving
   * vJoy decided they are. If a button lights up the wrong action, this shows
   * the raw index — and the remap grid next to it rebinds without a code edit.
   */
  diagnostics() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const out = [];
    for (const gp of pads) {
      if (!gp) continue;
      const raw = [];
      gp.buttons.forEach((btn, i) => {
        if (btn && (btn.pressed || btn.value > 0.5)) raw.push(i);
      });

      const slots = [];
      this.bindings.forEach((bnd, slot) => {
        if (bnd.pad !== gp.index) return;
        const r = profileFor(gp).read(gp, {
          rotation: this.joyconRotation,
          half: bnd.half,
          map: this.vjoyMap,
        });
        slots.push({
          slot,
          half: bnd.half,
          // Both sides of the deadzone: if raw moves and stick doesn't, the
          // axis is bound correctly and simply isn't travelling far enough.
          raw: { x: +(r.ax ?? 0).toFixed(2), y: +(r.ay ?? 0).toFixed(2) },
          stick: { x: +dead(r.ax).toFixed(2), y: +dead(r.ay).toFixed(2) },
          actions: Object.fromEntries(ACTIONS.map((a) => [a, !!r[a]])),
        });
      });

      out.push({
        index: gp.index,
        id: gp.id,
        profile: this.profileNameFor(gp),
        buttonCount: gp.buttons.length,
        axes: gp.axes.map((v) => (Math.abs(v) < 0.08 ? 0 : +v.toFixed(2))),
        axesRange: gp.axes.map((_, i) => {
          const w = this._axisWatch.get(gp.index);
          return { min: +(w?.min[i] ?? 0).toFixed(2), max: +(w?.max[i] ?? 0).toFixed(2) };
        }),
        raw,
        slots,
      });
    }
    return out;
  }

  /** Human-readable list of what's currently driving each player. */
  describe() {
    return this.players.map((p, i) => {
      if (p.source !== 'gamepad') return `P${i + 1}: ${KEYSETS[i].name}`;
      const half = this.bindings[i].half;
      return half ? `P${i + 1}: ${half} Joy-Con` : `P${i + 1}: gamepad`;
    });
  }

  update() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    this._syncBindings(pads);
    this._watchAxes(pads);

    // First sight of a merged pad, on a map nobody has hand-calibrated: sniff
    // which axes the sticks are actually on rather than trusting the indices.
    // Keeps retrying for a few seconds — a feeder that hasn't written its first
    // report yet reads as all-axes-at-minimum, and one failed attempt at that
    // moment used to poison the whole session. The window closes so it can
    // never fire mid-play and rewrite the map under someone's thumbs.
    if (!this._autoAxesDone) {
      const merged = pads.find((gp) => gp && this.profileNameFor(gp) === 'vjoyDual');
      if (merged) {
        this._autoAxesUntil ??= performance.now() + 6000;
        const ok = this.autoDetectSticks(
          merged, { quiet: true, requireMovement: true },
        )?.ok;
        if (ok || performance.now() > this._autoAxesUntil) this._autoAxesDone = true;
      }
    }

    // Sampled BEFORE the capture resolves: the press that completes a binding
    // must be swallowed too, or the button you just bound to ATTACK also
    // swings the katana on the way in.
    const suppress = !!this._capture;
    this._updateCapture(pads);

    this._anyPressLatch = false;

    for (let i = 0; i < 2; i++) {
      const st = this.players[i];
      st.prev = { ...st.held };

      const bnd = this.bindings[i];
      const gp = bnd.pad != null ? pads[bnd.pad] : null;

      let mx = 0;
      let my = 0;
      const next = Object.fromEntries(ACTIONS.map((a) => [a, false]));

      if (gp) {
        st.source = 'gamepad';
        const r = profileFor(gp).read(gp, {
          rotation: this.joyconRotation,
          half: bnd.half,
          map: this.vjoyMap,
        });
        mx = dead(r.ax) + (r.dpad ? r.dpad[0] : 0);
        my = dead(r.ay) + (r.dpad ? r.dpad[1] : 0);
        for (const a of ACTIONS) next[a] = !!r[a];
      } else {
        st.source = 'keyboard';
        const k = KEYSETS[i];
        if (this.keys.has(k.left)) mx -= 1;
        if (this.keys.has(k.right)) mx += 1;
        if (this.keys.has(k.up)) my -= 1;
        if (this.keys.has(k.down)) my += 1;
        for (const a of ACTIONS) next[a] = this.keys.has(k[a]);
      }

      // While a remap capture is armed, the button you press is being BOUND,
      // not played. Swallow it so calibrating doesn't also slash and jump.
      if (suppress) {
        mx = 0;
        my = 0;
        for (const a of ACTIONS) next[a] = false;
      }

      // Clamp the stick to a circle so diagonals aren't faster.
      const len = Math.hypot(mx, my);
      if (len > 1) {
        mx /= len;
        my /= len;
      }
      st.mx = mx;
      st.my = my;
      st.held = next;

      for (const a of ACTIONS) if (st.pressed(a)) this._anyPressLatch = true;
    }
  }

  /** True on the frame any player presses any button — used by the title screen. */
  anyPressed() {
    return this._anyPressLatch;
  }
}

function dead(v, threshold = 0.22) {
  if (Math.abs(v) < threshold) return 0;
  // Rescale so motion starts smoothly at the edge of the deadzone.
  return Math.sign(v) * ((Math.abs(v) - threshold) / (1 - threshold));
}
