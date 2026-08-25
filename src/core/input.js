/* ---------------------------------------------------------------------------
   Input.

   Up to four players, each bound to a gamepad, a keyboard set, or the screen.

   Five ways to play, all live at once:

     keyboard        WASD (P1) and arrows/numpad (P2).
     standard        Pro Controller 2 / anything Chrome remaps to "standard".
     joyconSideways  ONE Joy-Con per player, each paired as its OWN gamepad.
     vjoyDual        BOTH Joy-Cons arriving as a SINGLE vJoy device. One pad,
                     24 buttons, two sticks — split down the middle so each
                     player drives one half. This is the main setup.
     touch           The on-screen pad, on a phone or a tablet. Not a profile —
                     it is not a gamepad and there is nothing to sniff — but it
                     IS a device in the same pool, and it is dealt FIRST, so the
                     person holding the phone is player 1 and a controller
                     paired to it seats a second kitten. See `_devices` and
                     `core/touchpad.js`.

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

/* `map` (cycle this player's minimap zoom) and `math` (toggle the Kotodama
   Orb's working) are PAD-ONLY actions, and deliberately have no KEYSETS entry.
   On the keyboard they stay on Z / X / M in the keydown handler, which keeps
   working while somebody else is on a pad — routing them through a player slot
   would mean the keyboard shortcut dies the moment that slot binds a
   controller. `this.keys.has(undefined)` is false, so the two paths cannot
   double-fire. */
export const ACTIONS = [
  'jump', 'attack', 'interact', 'mount', 'sprint', 'start', 'map', 'math',
];

/* BUMPED TO v3 WHEN THE SHOULDERS MOVED OFF 0-3. A saved map wins over these
   defaults wholesale (`_loadMap` assigns it over the base), so a machine that
   had ever opened Settings -> Controllers would have gone on reading the old
   guesses and none of this would have taken. Retiring the key costs whatever
   else was calibrated on that machine, which is the smaller loss: the numbers
   it is replacing were wrong. */
const MAP_STORAGE_KEY = 'kk.vjoy.map.v3';

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
 * Actions hold ARRAYS of button indices.
 *
 * THE RAIL IS SPLIT: SL IS THE SHIELD, SR IS SPRINT. Both used to be sprint —
 * "either shoulder under your index finger should do it" — which left the
 * shield sharing a face button with mount and no way to hold it while walking.
 * It now matches every other controller in the game: the LEFT-hand shoulder
 * raises the ward, the RIGHT-hand one runs. Mount keeps its face button as
 * well, because the two are the same action (see the mount handler in
 * entities/player.js: nothing to climb on is what makes it a shield).
 *
 * CONFIRMED on hardware: left SR = 17, right SR = 14. */
const DEFAULT_VJOY_MAP = {
  left: {
    axX: 1, invX: true, axY: 0, invY: true,      // X / Y
    // Held sideways the d-pad becomes the face cluster.
    jump: [11],       // Down
    attack: [9],     // Left
    interact: [8],   // Right
    mount: [10, 16],  // Up / SL — SL is the shield, see the header
    sprint: [17],     // SR  (confirmed)
    start: [13],       // Minus
    /* MEASURED, NO LONGER GUESSED. These were 0 and 2 on the theory that the
       top-edge shoulders were the only indices left once the d-pad, the rail
       and Minus were spoken for. They are not: Richard's feeder puts the
       shoulders in the twenties, and 0-3 report nothing at all. Leaving the
       old guesses in place meant four buttons that did something when nothing
       was pressed and two controls that could not be found. */
    map: [20],         // L
    math: [22],        // ZL — the SAME index the right half reads, see below
  },
  right: {
    axX: 4, invX: true, axY: 3, invY: false,     // Ry / Rx
    jump: [4],        // B
    attack: [6],      // Y
    interact: [7],    // A
    mount: [5, 15],   // X / SL — SL is the shield, see the header
    sprint: [14],     // SR  (confirmed)
    start: [12],       // Plus
    map: [21],         // R
    /* ONE BUTTON FOR BOTH HALVES, AND THAT IS NOT A TYPO. The feeder reports
       ZL and ZR as the same index, and the overlay is one global thing on
       screen rather than one per kitten — so a shared toggle is the right
       shape anyway. It does mean both PadStates see the press on the same
       frame, which would toggle it on and straight back off; `Game._step`
       collects the ask and fires `_toggleMath` once. Do not undo that. */
    math: [22],        // ZR
  },
};

export const HALVES = ['left', 'right'];

/* WHAT EACH vJOY BUTTON INDEX IS CALLED ON THE JOY-CON ITSELF.
 *
 * The same facts as the trailing comments in `DEFAULT_VJOY_MAP`, in a form the
 * prompt drawn over a kitten's head can read. It has to be a table rather than
 * a fixed list of prompts BECAUSE SETTINGS CAN MOVE THEM: the whole point of
 * Settings -> Controllers is that these indices are guesses and a player
 * recalibrates by pressing the button. A static prompt table went on saying
 * RIGHT after somebody had moved `interact` onto Up, which is the label lying
 * again — the exact failure `promptFor` exists to prevent, arriving through
 * the one door nothing was watching.
 *
 * An index that is not in here is one this file has never had a name for, and
 * it is shown as its NUMBER, which is what the Settings grid shows too. "#5"
 * is not friendly, but it is true and it is findable; guessing a name is how
 * you get a prompt naming a button that is not there.
 */
const VJOY_BUTTON_NAMES = {
  left: {
    8: 'RIGHT', 9: 'LEFT', 10: 'UP', 11: 'DOWN',
    13: '-', 16: 'SL', 17: 'SR', 20: 'L', 22: 'ZL',
  },
  right: {
    4: 'B', 5: 'X', 6: 'Y', 7: 'A',
    12: '+', 14: 'SR', 15: 'SL', 21: 'R', 22: 'ZR',
  },
};

/* WHICH KEYBOARD SET THE TOUCH PLAYER OWNS. WASD, because it is the better half
   — a space bar and a one-handed cluster — and the touch player is player 1.
   See `_freeKeysets`. */
export const TOUCH_KEYSET = 0;

/** Spelled out where the bare action name wouldn't tell a nine-year-old what
 *  the row is for. Anything absent shows its action name unchanged. */
const ACTION_LABELS = { map: 'map zoom', math: 'maths overlay' };

/** Field labels for the Settings remap grid — order is the display order. */
export const MAP_FIELDS = [
  { key: 'stickX', label: 'Stick — push RIGHT', kind: 'axisX' },
  { key: 'stickY', label: 'Stick — push UP', kind: 'axisY' },
  ...ACTIONS.map((a) => ({ key: a, label: ACTION_LABELS[a] ?? a, kind: 'button' })),
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
      /* THE LEFT TRIGGER IS THE SHIELD AND THE RIGHT ONE IS SPRINT, which is
         the rule this whole table follows now. `mount` IS the shield — a
         kitten with nothing to climb on gets the ward instead (see the mount
         handler in entities/player.js) — and it was on a face button alone, so
         raising it meant taking a thumb off the stick. Both triggers used to
         sprint, which is what left the left one free to take it.
         The stick clicks follow their own side: L3 shields, R3 sprints. */
      mount: b(gp, 3) || b(gp, 6) || b(gp, 10),
      sprint: b(gp, 7) || b(gp, 11),
      start: b(gp, 9),
      /* The shoulder BUMPERS were the only two buttons on a standard pad this
         game never used — the triggers already carry sprint. Guide (16) is
         included for math because it is the "not used much" button, but it is
         NOT the only binding on purpose: browsers report it inconsistently and
         Windows can swallow it into the Game Bar, so a control bound to it
         alone would be dead on some machines with nothing on screen to say so.
         View/Share (8) backs up the map for the same reason. */
      map: b(gp, 5) || b(gp, 8),     // R1 / View
      math: b(gp, 4) || b(gp, 16),   // L1 / Guide
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
        // SL shields, SR sprints — the same left/right rule the triggers
        // follow above. Left half: SL 16, SR 17. Right half: SR 14, SL 15.
        mount: b(gp, 10) || b(gp, 5) || b(gp, 16) || b(gp, 15),  // Up / X / SL
        sprint: b(gp, 17) || b(gp, 14),                          // SR
        start: b(gp, 6) || b(gp, 9),
        // Capture / Home — the two a sideways Joy-Con has left over.
        map: b(gp, 12),
        math: b(gp, 13),
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
      // Left trigger shields, right trigger sprints — see `standard`.
      mount: b(gp, 3) || b(gp, 6),
      sprint: b(gp, 7),
      start: b(gp, 9) || b(gp, 8),
      // Bumpers only. `start` already claims 8 here, so View is not available
      // as a second binding the way it is under `standard`.
      map: b(gp, 5),
      math: b(gp, 4),
      dpad: [0, 0],
    }),
  },
};

const PROFILE_ORDER = ['vjoyDual', 'joyconSideways', 'standard', 'generic'];

/* ---------------------------------------------------------------------------
   BUTTONS A vJOY DEVICE WAS ALREADY HOLDING WHEN WE FIRST SAW IT.

   Pad index -> Set of button indices. Everything in here reads as UP until the
   device lets go of it once; then it is a normal button forever after.

   THE BUG THIS EXISTS FOR: vJoy reported button 9 pressed, value 1.00, all
   eight axes flat, on every frame from page load — a virtual device latched on
   by a feeder that had exited without clearing it. Button 9 is `attack` on the
   left half of DEFAULT_VJOY_MAP, so on the very first poll the game saw a
   controller that was alive, seated two players on it, and read a press. On
   the title screen EVERY button confirms (see menunav.js), and the cursor
   starts on PLAY. The game started itself, before anybody had touched
   anything, every single load. `hasSentInput` — the existing phantom gate —
   waved it straight through, because a stuck bit is indistinguishable from a
   press if all you ask is "has a button ever been down".

   ONLY vJOY DEVICES ARE LATCHED, AND THAT RESTRICTION IS THE WHOLE DESIGN.
   Browsers hide a real gamepad until a human presses something on it, so a
   real pad's FIRST poll routinely has a button down — that press is the wake
   press, and it is also the press that starts the game or seats a joining
   player. Latching every pad would eat it and make the first press of a fresh
   controller do nothing, which is a worse bug for a nine-year-old than the one
   being fixed. vJoy is the one device the driver reports whether or not
   anything is feeding it, so vJoy is the one device that has to prove a button
   by releasing it.
--------------------------------------------------------------------------- */
const LATCHED = new Map();

/** The pad's actual electrical state, latch and all. Only the latch uses it. */
function rawDown(gp, i) {
  const btn = gp.buttons[i];
  return !!btn && (btn.pressed || btn.value > 0.5);
}

function b(gp, i) {
  if (LATCHED.get(gp.index)?.has(i)) return false;
  return rawDown(gp, i);
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

/** Every field of a keyset that holds key codes: the stick, then the buttons. */
const KEY_FIELDS = ['up', 'down', 'left', 'right', ...ACTIONS];

/* ---------------------------------------------------------------------------
   THE TWO KEYBOARD SETS.

   EVERY FIELD IS A LIST, and that is not tidiness — it is the second player's
   whole problem. She used to have one primary key per action plus a single
   `alt`, which is exactly enough to say "the numpad, or these four keys next to
   it" and not enough to say what she actually needs: THREE ways to press attack
   and TWO ways to walk. A one-deep alternate cannot express a second complete
   hand position, so `alt` is gone and a binding is however many codes it takes.

   PLAYER 2 HAS A ONE-HANDED CLUSTER NOW, and this is the point of the pass.
   Player 1 plays WASD-and-friends with her LEFT hand alone: move on WASD, and
   Q / E / F sitting around it under the same fingers. Player 2 had nothing
   equivalent — the arrows are a right-hand shape, but her buttons were on the
   numpad (another hand's width to the right, and absent on a laptop) or on
   , . / ; (which your right hand can only reach by leaving the arrows).

       O K L ;    is the arrows, moved onto the home row for the right hand
       . I J      mirrors Q E F: mount, interact, attack, same jobs, same shape
                  (`P` held mount here until it collided with the frame-cost
                  debug key — see the note on `mount` below)
       ' or RCtrl jump — where the space bar is for player 1
       Right Alt  sprint — where left Shift is for player 1

   So each girl can play the whole game with one hand on her own half of the
   keyboard, sitting side by side, without either of them reaching across.

   THE OLD KEYS ALL STILL WORK. Arrows, numpad and , . / are unchanged as
   ways in; nothing a kid has already learned stops working. Three of them had
   to MOVE, and each only because something else claimed the key:

     `;` was mount    -> it is "walk right" now, so mount went to `.`
     `/` was jump     -> jump is `'`, so `/` took attack (`.`'s old job)
     RCtrl was sprint -> it is a jump key now, so sprint is RShift and RAlt

   which leaves the four punctuation keys reading , . / ' = interact, mount,
   attack, jump: still one contiguous run under the right hand, still in the
   same order relative to each other.
--------------------------------------------------------------------------- */
export const KEYSETS = [
  {
    name: 'WASD',
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    jump: ['Space'], attack: ['KeyF'], interact: ['KeyE'], mount: ['KeyQ'],
    sprint: ['ShiftLeft'],
    start: ['Enter', 'NumpadEnter'],
  },
  {
    name: 'Arrows',
    /* Two hand positions, one kitten. The arrows are where she has always been;
       O K L ; is the same shape one row up and under her right hand, so the
       buttons can sit around it instead of a hand's width away. */
    up: ['ArrowUp', 'KeyO'],
    down: ['ArrowDown', 'KeyL'],
    left: ['ArrowLeft', 'KeyK'],
    right: ['ArrowRight', 'Semicolon'],
    /* Three ways to press each of these, in the order they were added: the
       numpad (which is the best of them and which laptops do not have), the
       punctuation run next to the arrows, and the letters around O K L ;.

       LAPTOPS HAVE NO NUMPAD, and player 2's whole action set was once on it —
       so on a laptop the second kitten could walk and nothing else. She could
       not slash, could not swear an oath, could not climb onto a dragon, and
       could not fire Ryuuseki's beams, which made the one two-player set-piece
       in the game impossible to reach on the machine it is developed on. */
    /* RIGHT CTRL IS A JUMP KEY, AND IT USED TO BE SPRINT. A key cannot be both
       — it would fire two actions on one press — so freeing it meant moving
       sprint, which is why sprint is Right Shift and one other key and nothing
       else. It is worth the move: jump is the button she presses most, and
       Right Ctrl is a big key in the bottom corner that her palm finds without
       looking. */
    jump: ['Numpad0', 'AltRight', 'ControlRight'],
    attack: ['Numpad1', 'Slash', 'KeyJ'],
    interact: ['Numpad2', 'Comma', 'KeyI'],
    /* `P` IS BACK, and the story of this one key is why it is worth writing
       down. It was the mount of the `P I J` cluster and it was ALSO the
       frame-cost debug key (`Game._debugKey`), and both fired on one press —
       so player 2 climbing onto a dragon flipped the performance readout on,
       and pressing it again to check the readout mounted her again. The fix
       moved BOTH: the debug key went to `1`, with the rest of the debug set
       where no keyboard player can reach it, and `P` was dropped from here as
       well — belt and braces on a collision that no longer existed.
       Dropping it was the half that was wrong. `P` is where the hand that is
       playing on `O K L ;` expects mount to be, it is the key player 2 had
       used since the game had a mount at all, and the girls kept pressing it
       and getting nothing. `.` works and is not the one she reaches for.
       So mount has three keys, like every other action in this set, and the
       one thing that must stay true is that NOTHING ELSE ON THE KEYBOARD
       ANSWERS TO `P` — `pad-check` asserts that of the whole debug set rather
       than of this line, because the failure was never about this table. */
    mount: ['Numpad3', 'Period', 'KeyP'],
    /* `'` AND RIGHT ALT SWAPPED, and the reason is the O K L ; hand.
       Playing the second kitten on the letter row rather than the arrows puts
       her right hand over O K L ; — and from there Right Alt is under the thumb
       while `'` is a pinky reach up and across. Jump is the button she presses
       most and sprint is one she holds occasionally, so jump takes the thumb
       key. Right Shift keeps sprint for the arrows hand, where it always was. */
    sprint: ['ShiftRight', 'Quote'],
    /* ENTER IS THE JOIN KEY FOR BOTH SETS, and that is the whole of it. It used
       to be each set's own key — `Enter` for WASD, `NumpadEnter`/`\` for the
       arrows — which meant the key that seated the next player MOVED depending
       on which set was already taken, and with one controller connected the
       obvious `Enter` was player 2's pause key and opened the menu instead.
       Both sets answer to Enter now, `_findJoin` hands out the lowest set still
       free, and two keyboard players join one at a time by pressing it twice.
       ESC IS THE ONLY MENU KEY on a keyboard, which is what makes this safe —
       see `Game._update`, where `start` only pauses for a PAD. */
    start: ['Enter', 'NumpadEnter'],
  },
];

/** Every key code any set binds — see `Input`'s keydown handler. */
export const BOUND_KEYS = new Set(
  KEYSETS.flatMap((k) => KEY_FIELDS.flatMap((f) => k[f] ?? []))
);

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

  /**
   * Spend this frame's edge on `action`, so nothing later in the frame sees
   * the same press.
   *
   * ONE PRESS IS ONE ANSWER TO ONE QUESTION. The frame is read top to bottom
   * by several owners in turn — the trailer, then MenuNav, then the game — and
   * `pressed` is a pure test, so a press that one of them ACTS on is still
   * sitting there for the next. That is how Start ended a trailer and started
   * it again in the same frame: the trailer closed, the title menu underneath
   * was left with the cursor on WATCH TRAILER, and on the title screen every
   * button confirms. Reported on a PS5 pad, and nothing to do with the pad.
   *
   * Marking `prev` rather than clearing `held` on purpose: the button really
   * IS still down, so `down()` and anything holding it keep telling the truth.
   * All that is spent is the EDGE.
   */
  consume(action) {
    this.prev[action] = this.held[action];
  }

  down(action) {
    return this.held[action];
  }
}

/* ---------------------------------------------------------------------------
   FOUR SLOTS, AND WHICH DEVICE DRIVES EACH.

   The game seats up to four kittens and there are only two keyboard sets, so
   the interesting arrangement — the one Richard asked for — is TWO PLAYERS ON
   THE KEYBOARD AND TWO ON CONTROLLERS, with no new profile and no third
   keyboard set invented for the occasion.

   CONTROLLERS FILL FROM PLAYER 1 DOWN, THEN THE KEYBOARD TAKES WHAT IS LEFT:

     0 pads   P1 WASD   P2 Arrows
     1 pad    P1 pad    P2 WASD    P3 Arrows
     2 pads   P1 pad    P2 pad     P3 WASD    P4 Arrows
     3 pads   P1 pad    P2 pad     P3 pad     P4 WASD

   WHICH MEANS THE KEYBOARD SET CAN NO LONGER BE THE SLOT NUMBER. It used to be:
   slot i read `KEYSETS[i]` whenever no pad was bound to it. With four slots and
   two controllers on 0 and 1, the two keyboard players are slots 2 and 3 — and
   there is no `KEYSETS[2]`. So a binding names its keyboard set explicitly.

   AND THE SET IS NOT THE SLOT NUMBER EITHER. There was a slot-affinity pass
   here that gave slot i `KEYSETS[i]` when it was free, so one pad put player 2
   on the ARROW keys and pushed WASD down to player 3. The sets are a QUEUE, not
   particular players' property: WASD with a space bar beats the arrows with a
   numpad, so whoever is first out of the controllers gets WASD. See `_assign`.

   A SLOT PAST THE PARTY SIZE READS NOTHING AT ALL. It has no pad and no keyset,
   which matters: leaving the old "fall back to KEYSETS[i]" rule in place would
   mean a two-player game in which WASD is silently also driving an unseated
   third kitten's controller state.
--------------------------------------------------------------------------- */

/** The most slots the input layer will track. Matches MAX_PLAYERS. */
export const MAX_SLOTS = 4;


/**
 * What this action's button is CALLED on the device a given player is holding.
 *
 * WHY IT CANNOT BE ONE STRING. "Press E" is right for the girl on WASD, wrong
 * for her sister on the arrows, wrong for both Joy-Con halves, and meaningless
 * on a tablet. A prompt that names the wrong button is worse than no prompt:
 * she presses the named key, nothing happens, and the conclusion is that the
 * game is broken rather than that the label is.
 *
 * THE HALVES DISAGREE WITH EACH OTHER, which is the case that makes this a
 * table rather than a lookup. A sideways left Joy-Con has no face cluster at
 * all — its d-pad is doing that job — so `interact` is a DIRECTION on one half
 * and a letter on the other, and the two girls holding them are looking at
 * genuinely different controllers.
 *
 * SHORT ENOUGH TO SIT IN A BADGE. These are drawn over a kitten's head in a
 * quarter of the screen; "the button on the right of the d-pad" is true and
 * useless. Where a name will not fit, the direction does.
 */
/* EXPORTED so the Help page's drawn controller reads the same table the game
   prints over a kitten's head. That clip draws a PlayStation pad from scratch
   (rule 9 — nothing here is a photograph), and a hand-typed set of glyphs on it
   would go out of date the first time this table moved: the ✕/○ lettering here
   is itself the fix for a pad that had been telling a nine-year-old to press a
   button its face does not have. `world-check` compares the two. */
export const PROMPTS = {
  vjoyDual: {
    left: { jump: 'DOWN', attack: 'LEFT', interact: 'RIGHT', mount: 'UP', sprint: 'SR', start: '-', map: 'L', math: 'ZL' },
    right: { jump: 'B', attack: 'Y', interact: 'A', mount: 'X', sprint: 'SR', start: '+', map: 'R', math: 'ZR' },
  },
  joyconSideways: {
    left: { jump: 'DOWN', attack: 'LEFT', interact: 'RIGHT', mount: 'UP', sprint: 'SR', start: '-', map: 'L', math: 'ZL' },
    right: { jump: 'B', attack: 'Y', interact: 'A', mount: 'X', sprint: 'SR', start: '+', map: 'R', math: 'ZR' },
  },
  /* Xbox lettering, because that is what a browser reporting `mapping:
     "standard"` is describing and what most PC pads are silk-screened with.
     A PlayStation pad lands on `playstation` below instead. */
  standard: { jump: 'A', attack: 'X', interact: 'B', mount: 'Y', sprint: 'RT', start: 'START', map: 'RB', math: 'LB' },
  /* THE SHAPES, BECAUSE THAT IS WHAT IS PRINTED ON THE BUTTON.
     This table used to say "a PlayStation pad shows ○ where this says B, which
     is a wrong LETTER on a button in the right PLACE — the least bad of the
     available errors, and one no amount of sniffing the id string fixes
     reliably." The first half was true and the second half was wrong: it was
     played on a DualSense and reported straight back as "it says [B], I am on
     a PS5 pad". A nine-year-old looking for a button called B on a controller
     that has no letters on it anywhere is exactly the failure the whole
     per-device prompt system exists to prevent.

     IT IS A LABEL AND NOT A PROFILE. Sony pads report `mapping: "standard"`
     and their button INDICES are the standard ones, so the reading side is
     already correct and must not be touched — `PROFILE_ORDER` still sends
     these to `standard.read`. All that changes is the name printed on screen,
     which is why `promptStyleFor` is a second, separate lookup.

     THE GLYPHS ARE GEOMETRIC SHAPES, not the Private Use codepoints in Sony's
     own font, which render as tofu everywhere they are not installed. ○ ✕ △
     □ are in every system font this game will meet and are drawn to a canvas
     by core/label.js, which has no webfont guarantee at all. */
  playstation: { jump: '✕', attack: '□', interact: '○', mount: '△', sprint: 'R2', start: 'OPTIONS', map: 'R1', math: 'L1' },
  /* An unknown pad reads any face button for `interact`, so say that. */
  generic: { jump: 'A', attack: 'ANY', interact: 'ANY', mount: 'ANY', sprint: 'R', start: 'START', map: 'RB', math: 'LB' },
};

/* `mount` NAMES THE FACE BUTTON AND NOT THE TRIGGER, on every pad in the table
   above, and that is a choice rather than an omission. The trigger is the
   SECOND binding and a badge drawn over a kitten in a quarter-screen pane has
   room for one name; the face button is the one she can see from where she is
   holding the pad, and the one the help page draws. The trigger is discovered
   by pressing it, which is the whole reason it was added — a shield you can
   hold without letting go of the stick. */

/* WHICH PAD IS SILK-SCREENED WITH WHAT.
 *
 * Separate from `PROFILES` on purpose — that table decides how to READ a pad
 * and this one decides what to CALL its buttons, and the two questions have
 * different answers for the same device. A DualSense is read as `standard`
 * (its indices are the standard ones) and labelled `playstation`. Folding them
 * together would mean inventing a read profile identical to `standard` just to
 * carry four strings, and the next person to touch the reading side would have
 * two copies of it to keep in step.
 *
 * Firefox reports `054c-0ce6-DualSense Wireless Controller`; Chrome reports
 * `DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product:
 * 0ce6)`. 054c is Sony's USB vendor id and is the reliable half — the product
 * names have changed every generation and third-party pads copy them.
 */
const PROMPT_STYLES = {
  playstation: /054c|dualsense|dualshock|playstation|ps[345]|wireless controller/i,
};

/**
 * EVERY string `promptFor` can ever put on screen for one action.
 *
 * Exported so `world-check` can size the overhead callout against the real
 * glyphs instead of a copy of them. That check used to open with
 * `const badge = '[RIGHT]';   // the longest interact glyph in input.js`,
 * which is a fact about this file written down in another one — add a pad
 * whose `interact` is called OPTIONS and the label silently starts clipping,
 * with the check still passing because it is measuring last year's table.
 *
 * The `#31` is the shape of the fallback for a vJoy button that has been
 * remapped onto an index `VJOY_BUTTON_NAMES` has no name for, and 31 is the
 * highest index a vJoy device reports. It is in here because it is a string
 * this really can print, not because any pad is expected to use it.
 */
export function promptGlyphs(action) {
  const out = new Set();
  for (const table of Object.values(PROMPTS)) {
    const v = table[action];
    if (typeof v === 'string') out.add(v);
    for (const half of HALVES) if (table[half]?.[action]) out.add(table[half][action]);
  }
  for (const half of HALVES) {
    for (const name of Object.values(VJOY_BUTTON_NAMES[half])) out.add(name);
  }
  out.add('#31');
  for (const set of KEYSETS) {
    for (const code of set[action] ?? []) out.add(keyGlyph(code));
  }
  return [...out];
}

/** `KeyE` -> `E`, `Numpad2` -> `NUM 2`, `Comma` -> `,`. */
function keyGlyph(code) {
  if (!code) return '?';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `NUM ${code.slice(6)}`;
  const named = {
    Space: 'SPACE', Enter: 'ENTER', NumpadEnter: 'ENTER', ShiftLeft: 'SHIFT',
    Comma: ',', Period: '.', Semicolon: ';', Slash: '/', Quote: "'",
    ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  };
  return named[code] ?? code.toUpperCase();
}

/** A stable name for one input device, used by the join screen. */
export function deviceId(bnd) {
  /* TOUCH FIRST, because a binding can carry both `touch` and a keyset in the
     desktop test mode — the keyboard is OR'd into the touch pad there — and the
     device this slot IS is the pad on screen. */
  if (bnd.touch) return 'touch';
  if (bnd.pad != null) return bnd.half ? `pad:${bnd.pad}:${bnd.half}` : `pad:${bnd.pad}`;
  if (bnd.keyset != null) return `kb:${bnd.keyset}`;
  return null;
}

export class InputManager {
  constructor() {
    this.keys = new Set();
    this.players = Array.from({ length: MAX_SLOTS }, () => new PadState());
    /** How many slots are actually in play. The game moves this as players
     *  join and leave; two is the default and the girls' usual game. */
    this.slots = 2;
    /** Per player slot: which pad, which half of a merged pad, and which
     *  keyboard set — any of which may be null. */
    this.bindings = Array.from({ length: MAX_SLOTS },
      () => ({ pad: null, half: null, keyset: null, touch: false }));
    /** The on-screen pad, or null on a machine that has no business drawing
     *  one. Set by `Game` from the device profile — see `attachTouch`. */
    this.touch = null;
    this.anyKeyThisFrame = false;
    this._anyPressLatch = false;
    this._order = [];        // pad indices in connection order
    this._capture = null;    // active remap capture, see beginCapture()
    this._axisWatch = new Map();   // pad index -> range each axis has covered
    this._buttonsSeen = new Map(); // pad index -> Set of indices ever pressed
    /** Devices holding START last frame, and this frame's join candidate. */
    this._joinPrev = new Set();
    this._joinCandidate = null;
    /** slot -> device, set by the join flow. Empty means "deal by the default
     *  order", which is what a two-player game always does. */
    this.claims = {};

    /** How a vJoy device is read. It is the ONLY device this setting touches;
     *  every ordinary pad is one player either way — see `_padDevices`.
     *    'split'  (default) two Joy-Cons through Joy2Win = two players
     *    'single'          one person holding both halves = one player
     *  'auto' and 'separate' are accepted as legacy spellings of 'split' and
     *  'single'; only a vJoy device ever looked at them. */
    this.padMode = 'split';
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
      /* IF THE GAME HAS BOUND IT, THE BROWSER MUST NOT ALSO ACT ON IT.
         This used to name Space and the arrows — the two that scroll the page
         out from under the game — and that was the whole list because it was
         written before player 2 had any punctuation. Three of her keys are
         browser shortcuts in FIREFOX, which is the browser this game is played
         in:

           /   opens Quick Find          (was already her jump: mash it and
           '   opens Quick Find (links)   the find bar eats the keyboard)
           Alt focuses the menu bar

         All three are prevented on the KEYDOWN, which is what stops Firefox
         acting on the Alt keyup as well.

         DERIVED FROM THE BINDINGS RATHER THAN LISTED, so a key added to a
         keyset is protected by being added, and F5 / F12 / Ctrl+R — which the
         game binds nothing to — are untouched. Held CTRL or META is left alone
         on purpose: Ctrl+L is the address bar and `L` is now a movement key,
         and a game that eats the browser's own chords is worse than one that
         loses a keypress. */
      if (BOUND_KEYS.has(e.code) && !e.ctrlKey && !e.metaKey) e.preventDefault();
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
      /* Forget the latch with the device. Re-plugging vJoy after clearing the
         stuck bit must give a clean pad, not one still ignoring button 9. */
      LATCHED.delete(e.gamepad.index);
      this._buttonsSeen.delete(e.gamepad.index);
      this._axisWatch.delete(e.gamepad.index);
    });
  }

  /**
   * The button prompt for one player's `action`, e.g. 'E' or 'A' or 'RIGHT'.
   *
   * ASKED PER SLOT AND NOT PER DEVICE TYPE, because the answer changes when a
   * girl swaps a keyboard for a pad mid-game, which she does. Returns null when
   * the slot holds nothing — a prompt with no button on it should not be drawn
   * at all rather than drawn with a question mark.
   *
   * A keyboard set lists several codes per action (the numpad, the punctuation
   * run and the letters around OKL;) and this prefers the LETTER: it is the one
   * a laptop definitely has, and 'NUM 2' on a machine with no numpad is the
   * prompt naming a button that is not there.
   */
  /** Spend `action`'s press on every slot. See `PadState.consume`. Whoever
   *  acted on a press owes this call — a skip that leaves the edge behind is
   *  a skip that fires whatever is underneath it. */
  consume(action) {
    for (const p of this.players) p.consume(action);
  }

  promptFor(slot, action) {
    const bnd = this.bindings[slot];
    if (!bnd) return null;
    if (bnd.touch) return this.touch?.labelFor?.(action) ?? action.toUpperCase();
    if (bnd.pad != null) {
      const gp = (navigator.getGamepads?.() ?? [])[bnd.pad];
      const style = gp ? this.promptStyleFor(gp) : 'standard';
      /* THE MERGED JOY-CON PAD IS ANSWERED FROM THE LIVE MAP, not from a fixed
         table, because Settings -> Controllers can move any of those buttons
         and half of `DEFAULT_VJOY_MAP` is an admitted guess. A prompt that
         cannot follow a remap is a prompt that goes wrong precisely for the
         player who cared enough to fix her controller. */
      if (style === 'vjoyDual') {
        const half = bnd.half ?? 'left';
        const idx = this.vjoyMap?.[half]?.[action]?.[0];
        if (idx == null) return null;
        return VJOY_BUTTON_NAMES[half]?.[idx] ?? `#${idx}`;
      }
      const table = PROMPTS[style] ?? PROMPTS.standard;
      const half = bnd.half ? table[bnd.half] : table;
      return half?.[action] ?? PROMPTS.standard[action] ?? null;
    }
    if (bnd.keyset != null) {
      const codes = KEYSETS[bnd.keyset]?.[action];
      if (!codes?.length) return null;
      return keyGlyph(codes.find((c) => c.startsWith('Key')) ?? codes[0]);
    }
    return null;
  }

  profileNameFor(gp) {
    for (const key of PROFILE_ORDER) if (PROFILES[key].test(gp)) return key;
    return 'generic';
  }

  /**
   * Which set of button NAMES this pad is silk-screened with.
   *
   * Asked instead of `profileNameFor` by `promptFor`, and by nothing else. The
   * reading side must keep using the profile: a DualSense is read as
   * `standard` because its indices really are the standard ones, and only its
   * lettering is different. See `PROMPT_STYLES`.
   *
   * THE ID SNIFF ONLY APPLIES TO `standard`, AND THAT IS THE LOAD-BEARING
   * PART. A shape glyph is a claim about WHERE the button is, and the only
   * pads whose button positions this game knows are the ones the browser has
   * already remapped to the standard layout. `ds4NoRemap` in pad-check is the
   * counter-example that exists for exactly this: a DualShock 4 the browser
   * has no table for, same Sony id, completely different indices. Telling that
   * player to press ○ would name a button the game is not reading — the same
   * lie as [B] on a PlayStation pad, wearing better clothes. It keeps the
   * honest 'ANY' the generic profile has always given.
   *
   * A Joy-Con, sideways or merged through vJoy, is likewise left alone: it has
   * been positively identified by something far more reliable than a
   * substring, and must not be relabelled because a feeder called itself a
   * "wireless controller".
   */
  promptStyleFor(gp) {
    const profile = this.profileNameFor(gp);
    if (profile !== 'standard') return profile;
    for (const [name, re] of Object.entries(PROMPT_STYLES)) {
      if (re.test(gp.id ?? '')) return name;
    }
    return profile;
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
      // Same lookup as beginCapture, and for the same reason: the bindings no
      // longer name a `half` unless the player has explicitly asked for a split.
      const pads = navigator.getGamepads?.() ?? [];
      gp = this._order.map((i) => pads[i]).find(
        (p) => p && this.profileNameFor(p) === 'vjoyDual'
      ) ?? null;
    }
    if (!gp) return null;
    // Same rule as beginCapture: this writes vjoyMap, so it may only ever read
    // a pad that vjoyMap describes. A PS4 pad's axes are not the Joy-Cons'.
    if (this.profileNameFor(gp) !== 'vjoyDual') return null;

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
    /* THE vJOY PAD IS FOUND DIRECTLY, NOT THROUGH THE BINDINGS. This used to
       look up whichever pad held `half` and fall back to the first bound pad —
       a proxy for "the vJoy device" that was only true while `auto` always
       split it into two halves. It no longer does, so a vJoy pad seats ONE
       player with `half: null` and the old lookup found nothing: calibration
       silently became unreachable for the exact device it exists for.

       The grid edits `vjoyMap` and only `vjoyDual` ever reads it, so asking for
       that device by name is both the correct question and the invariant
       stated where it cannot be routed around — capturing against any other pad
       cannot rebind that pad, but it WILL overwrite the Joy-Con calibration on
       the way past.

       A device nothing is feeding is refused too: there is nothing to press. */
    const pads = navigator.getGamepads?.() ?? [];
    const gp = this._order.map((i) => pads[i]).find(
      (p) => p && this.profileNameFor(p) === 'vjoyDual' && this.hasSentInput(p)
    );
    if (!spec || !gp) return false;
    const pad = gp.index;

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

      /* THE LATCH IS MAINTAINED BEFORE ANYTHING READS A BUTTON, because `b()`
         consults it and every profile, the join test and `hasSentInput` all go
         through `b()`. Seeded once, on the first frame this pad is ever seen;
         entries leave the moment the device reports that button up. See
         LATCHED for why only vJoy is asked. */
      if (this.profileNameFor(gp) === 'vjoyDual') {
        let stuck = LATCHED.get(gp.index);
        if (!stuck) {
          stuck = new Set();
          for (let i = 0; i < gp.buttons.length; i++) if (rawDown(gp, i)) stuck.add(i);
          LATCHED.set(gp.index, stuck);
          if (stuck.size) {
            console.warn(`[input] vJoy pad ${gp.index} arrived holding button(s)`
              + ` ${[...stuck].join(', ')} — ignoring them until released.`
              + ' Something is feeding vJoy a stuck bit, or Joy2Win exited without clearing it.');
          }
        }
        for (const i of stuck) if (!rawDown(gp, i)) stuck.delete(i);
      } else {
        LATCHED.delete(gp.index);
      }

      let seen = this._buttonsSeen.get(gp.index);
      if (!seen) { seen = new Set(); this._buttonsSeen.set(gp.index, seen); }
      for (let i = 0; i < gp.buttons.length; i++) if (b(gp, i)) seen.add(i);
    }
  }

  /**
   * Which buttons this pad arrived holding down and has not released.
   *
   * Exported for the controller readout and for pad-check. A player staring at
   * a dead controller needs to be told the device is latched rather than left
   * to conclude the game cannot see it — sixth non-negotiable.
   */
  latchedButtons(index) {
    return [...(LATCHED.get(index) ?? [])];
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

  /**
   * Every connected pad turned into the list of DEVICES a player can be seated
   * on, in the order they get dealt out.
   *
   * ONE FUNCTION, BECAUSE TWO COPIES OF THIS RULE IS HOW THE RIGHT JOY-CON
   * WENT DEAD. `_syncBindings` decided whether to split and `seatable` decided
   * it again a hundred lines further down, in the same words — so any change
   * to the rule had to be made twice, and the join screen would happily refuse
   * a fourth player onto a device the binder had already dealt. It is the same
   * duplication `trackForIsland` and `_hudDuringScenes` exist to prevent.
   *
   * ONLY A MERGED vJOY PAD CAN BE SPLIT, and `padMode: 'split'` does not get to
   * override that. `half` is read by exactly one profile — `vjoyDual`, through
   * readHalf — so splitting anything else hands BOTH players the same pad and
   * the same profile, which ignores `half` entirely and returns one identical
   * snapshot to both slots. The two kittens then move as one: every press jumps
   * both, and the second player has no controller at all while appearing to
   * have one. It used to fall back to `live[0]`, so selecting SPLIT in Settings
   * with a PS4 or Xbox pad plugged in did exactly that — and it also handed
   * that pad two slots, which is what puts the vJoy remap grid on screen, so
   * calibrating a PS4 button silently overwrote the Joy-Con map it can never be
   * read from.
   *
   * SPLITTING IS PER DEVICE, NOT A MODE, AND THAT IS THE WHOLE FIX. It used to
   * be a global switch: either the vJoy pad was cut in half and you were in
   * "split mode", or it wasn't. Both settings were wrong for the setup that
   * matters — two Joy-Cons through Joy2Win PLUS an ordinary pad — because the
   * question the switch asked ("do we split?") is a question about ONE DEVICE
   * and it was being asked about the whole machine. Each pad is now decided on
   * its own: a vJoy device becomes two players, everything else becomes one,
   * and they coexist.
   *
   * EXPANDED IN PLACE, IN CONNECTION ORDER. The two halves go where the vJoy
   * device itself sits in the connection order rather than being hoisted to the
   * front, so "whichever connects first is player 1" stays true whatever kind
   * of controller it is. Hoisting them was the old shape and it silently
   * reordered everybody else.
   *
   * WHY A vJOY DEVICE IS ALWAYS TWO PLAYERS: it is not a controller, it is a
   * FEED. Nothing has a vJoy driver installed and Joy2Win running by accident —
   * the entire point of that stack is to present two Joy-Cons as one device, so
   * two is the answer that is right in every case somebody actually has it set
   * up. `padMode: 'single'` is there for the one person who holds both halves
   * herself.
   *
   * A vJOY DEVICE IS PRESENT WHETHER OR NOT ANYTHING IS FEEDING IT, AND THAT IS
   * THE PHANTOM. vJoy is a driver-level virtual joystick: once installed,
   * Windows reports it to the browser forever — with or without Joy2Win
   * running, with or without a Joy-Con paired to the machine, and with or
   * without any Nintendo hardware in the building. The game saw a controller
   * that was not there, gave it player 1, and left a kid on the keyboard
   * wondering why nothing moved.
   *
   * SO A vJOY DEVICE MUST PROVE IT IS ALIVE BEFORE IT CAN TAKE A SEAT, AND ONLY
   * A vJOY DEVICE IS ASKED. Every real pad is already hidden by the browser
   * until it sends input — by the time one appears in `getGamepads` somebody
   * has used it — so the gate is a no-op for real pads and would only be a
   * source of mid-session churn if the test ever misfired. vJoy is the one
   * device that shows up without anybody touching anything, so vJoy is the one
   * device that has to answer for itself. "Press a button on it" is what the
   * README already tells players to do.
   *
   * THE OTHER PADS COME AFTER THE TWO HALVES INSTEAD OF BEING DROPPED. The
   * split branch used to return the two halves and nothing else, so a pad
   * connected alongside the Joy-Cons was not merely last in the queue — it was
   * not a device at all, and no amount of pressing START could seat anybody on
   * it.
   */
  _padDevices(live) {
    const out = [];
    for (const gp of live) {
      const vjoy = this.profileNameFor(gp) === 'vjoyDual';
      // The phantom: a vJoy device the driver reports with nothing feeding it.
      if (vjoy && !this.hasSentInput(gp)) continue;
      // 'separate' is the legacy spelling of 'single'; everything else splits.
      const asOne = this.padMode === 'single' || this.padMode === 'separate';
      if (vjoy && !asOne) {
        out.push({ pad: gp.index, half: 'left' }, { pad: gp.index, half: 'right' });
      } else {
        out.push({ pad: gp.index, half: null });
      }
    }
    return out.slice(0, MAX_SLOTS);
  }

  /**
   * Has this pad ever actually sent anything this session?
   *
   * Any button seen down, or any axis that has moved off the value it was FIRST
   * OBSERVED AT — not off zero. `_watchAxes` seeds min and max to whatever the
   * axes read the first time it saw them, so a phantom reporting the same
   * constants forever has a range of exactly 0 on every axis however odd those
   * constants are. Testing against zero instead would call a pad resting with
   * its analog triggers at -1 "alive" before anybody had touched it, which is
   * precisely the vJoy device's resting state.
   *
   * Both halves are needed: a stick can be pushed without a button ever being
   * pressed, and a button can be pressed without a stick ever moving.
   */
  hasSentInput(gp) {
    const seen = this._buttonsSeen.get(gp.index);
    if (seen && seen.size) return true;
    const w = this._axisWatch.get(gp.index);
    return !!w && w.min.some((min, i) => w.max[i] - min > 0.02);
  }

  /** Hand the input layer its on-screen pad, or take it away. */
  attachTouch(pad) {
    this.touch = pad;
  }

  /**
   * Which keyboard sets are available to slots that are NOT the touch player.
   *
   * ONE RULE, ASKED IN FIVE PLACES, AND THAT IS THE WHOLE REASON THIS EXISTS.
   * `_assign`, `_findJoin`, `seatable`, `joinHint` and `describe` all have to
   * agree about whether WASD is spoken for, and they did not: `_assign` reserved
   * it while `_findJoin` did not, and a claim beats the dealer — so player 2
   * pressed ENTER, claimed WASD, and both kittens walked on one key. That is the
   * same "two kittens moving as one" failure `_padDevices` exists to prevent,
   * arrived at from the other end.
   *
   * WHEN THE PAD IS UP, TOUCH OWNS WASD. Not as a test affordance — as the
   * design: the girl holding the phone is player 1, and if that phone or tablet
   * has a keyboard she should be able to use both without a second kitten
   * appearing. Her sister joins on the arrows.
   */
  _freeKeysets() {
    return KEYSETS.map((_, k) => k).filter((k) => !(this.touch && k === TOUCH_KEYSET));
  }

  /**
   * Every seatable device, in the order they are dealt out.
   *
   * TOUCH COMES FIRST, AHEAD OF EVERY CONTROLLER, and that ordering is the
   * whole point. On a phone the person holding the phone is player 1 — she is
   * not a guest on her own device. Pads deal from player 2 down, so a Bluetooth
   * controller paired to the phone seats a SECOND kitten instead of silently
   * taking the first one's seat, which is what appending it here would do:
   * `_assign` fills pads from slot 0 up, so the pad would have taken the screen
   * out from under the thumb that was already playing.
   *
   * ONE FUNCTION, for the reason `_padDevices` is one function — the join
   * screen, the binder and `seatable` all have to agree about what a device is,
   * and they disagreed once already.
   *
   * With no touch pad attached this returns `_padDevices(live)` unchanged, which
   * is what keeps a desktop bit-identical.
   */
  _devices(live) {
    const pads = this._padDevices(live);
    if (!this.touch) return pads;
    return [{ touch: true, pad: null, half: null }, ...pads].slice(0, MAX_SLOTS);
  }

  _syncBindings(pads) {
    for (const gp of pads) {
      if (gp && !this._order.includes(gp.index)) this._order.push(gp.index);
    }
    this._order = this._order.filter((i) => pads[i]);
    const live = this._order.map((i) => pads[i]).filter(Boolean);

    this.bindings = this._assign(this._devices(live));
  }

  /**
   * Hand `slots` player slots a device each: PADS FIRST, THEN KEYBOARD SETS IN
   * ORDER — WASD before the arrow keys, every time.
   *
   * ```
   *   0 pads   P1 WASD   P2 Arrows
   *   1 pad    P1 pad    P2 WASD    P3 Arrows
   *   2 pads   P1 pad    P2 pad     P3 WASD    P4 Arrows
   *   3 pads   P1 pad    P2 pad     P3 pad     P4 WASD
   * ```
   *
   * THERE USED TO BE A SLOT-AFFINITY PASS AND IT IS GONE. Slot `i` took
   * `KEYSETS[i]` when it was free, so a single pad left player 2 on the ARROW
   * keys and pushed WASD down to player 3 — which preserved what slot 1 got
   * before four players existed, and is the wrong answer to the question a kid
   * actually asks. The keyboard sets are not player 2's and player 3's, they
   * are a queue: the first person on the keyboard gets the good half of it.
   * WASD with a space bar beats the arrow keys with a numpad, so whoever is
   * first out of the controllers gets WASD whatever her slot number is.
   *
   * The cost is that one pad plus one keyboard moves player 2 from the arrows
   * onto WASD. That is a deliberate change to the two-player game rather than
   * an accident, and it is the arrangement it improves: the girl without a
   * controller stops being handed the numpad half.
   */
  _assign(padDevs) {
    const next = Array.from({ length: MAX_SLOTS },
      () => ({ pad: null, half: null, keyset: null, touch: false }));
    const takenKeysets = new Set();
    const n = Math.min(this.slots, MAX_SLOTS);

    /* CLAIMS WIN, and they are how a third player gets the device she actually
       pressed rather than whatever the default order would have handed her.
       Taken out of the pool first so the passes below cannot deal the same
       device twice — two slots reading one keyboard set is two kittens moving
       as one, which is the bug `_syncBindings` already refuses to allow for a
       non-vJoy pad. */
    const claimedPads = new Set();
    let touchClaimed = false;
    for (let i = 0; i < n; i++) {
      const c = this.claims[i];
      if (!c) continue;
      next[i] = {
        pad: c.pad ?? null,
        half: c.half ?? null,
        keyset: c.keyset ?? null,
        touch: !!c.touch,
      };
      if (c.keyset != null) takenKeysets.add(c.keyset);
      if (c.pad != null) claimedPads.add(`${c.pad}:${c.half ?? ''}`);
      if (c.touch) touchClaimed = true;
    }

    const free = padDevs.filter((d) => (
      d.touch ? !touchClaimed : !claimedPads.has(`${d.pad}:${d.half ?? ''}`)
    ));
    // Pads first, so the affinity pass below knows which slots still need one.
    for (let i = 0, k = 0; i < n && k < free.length; i++) {
      if (this.claims[i]) continue;
      next[i] = { ...free[k], keyset: null, touch: !!free[k].touch };
      k += 1;
    }
    /* THE TOUCH PAD OWNS WASD WHENEVER IT IS UP — see `_freeKeysets` for why,
       and for the bug that came of only half the code believing it. */
    if (this.touch) takenKeysets.add(TOUCH_KEYSET);

    /* Every padless slot takes the lowest keyboard set still free, in slot
       order — so the first kitten without a controller gets WASD, the next gets
       the arrows, and a fifth would get nothing (see below).
       A TOUCH SLOT IS NOT PADLESS. It has a device — the pad on screen — so it
       must not also be handed WASD: on a tablet with a keyboard attached that
       would give the girl holding the screen a second, invisible controller and
       take the arrows away from her sister. The test mode reads a keyset
       THROUGH the touch pad instead (see `_freeKeysets`), which is one device
       reading two surfaces rather than one slot bound to two devices. */
    for (let i = 0; i < n; i++) {
      if (next[i].pad != null || next[i].keyset != null || next[i].touch) continue;
      for (const k of this._freeKeysets()) {
        if (takenKeysets.has(k)) continue;
        next[i].keyset = k;
        takenKeysets.add(k);
        break;
      }
    }
    return next;
  }

  /** Bind a specific device to a slot, overriding the default dealing. Used by
   *  the join flow so a player gets the controller she actually pressed. */
  claim(slot, device) {
    if (slot < 0 || slot >= MAX_SLOTS) return;
    this.claims[slot] = { ...device };
  }

  /** Forget a slot's claim — she left, and her device goes back in the pool. */
  release(slot) {
    delete this.claims[slot];
  }

  /**
   * How many players could actually be seated right now — one per available
   * device. The join screen refuses a claim past this, because a slot with no
   * device is a kitten nobody can move, which reads as the game being broken
   * rather than as the party being full.
   */
  get seatable() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const live = this._order.map((i) => pads[i]).filter(Boolean);
    // The SAME list the binder deals from — see `_devices`. Counting the
    // pads a second way here is what let the join screen refuse a player onto
    // a controller that was sitting in the pool unbound.
    return Math.min(MAX_SLOTS, this._devices(live).length + this._freeKeysets().length);
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
        /* A vJoy device the driver is reporting but nothing is feeding. It is
           STILL LISTED rather than hidden, and that is deliberate: hiding it
           would make "why can't the game see my Joy-Cons?" undebuggable from
           inside the game, which is the whole job of this screen. It just does
           not get a player. */
        asleep: this.profileNameFor(gp) === 'vjoyDual' && !this.hasSentInput(gp),
        /* Buttons this device arrived holding and has never let go of — see
           LATCHED. Reported so the readout can say "stuck", which is a
           different sentence from "asleep" and asks for a different fix. */
        latched: this.latchedButtons(gp.index),
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

  /** Human-readable list of what's currently driving each seated player.
   *  Unseated slots are left out rather than listed as empty — a settings line
   *  reading "P3: nothing" in a two-player game is noise about a feature
   *  nobody has turned on. */
  describe() {
    const out = [];
    for (let i = 0; i < Math.min(this.slots, MAX_SLOTS); i++) {
      const bnd = this.bindings[i];
      if (bnd.touch) {
        out.push(`P${i + 1}: touch + ${KEYSETS[TOUCH_KEYSET].name}`);
      } else if (bnd.pad != null) {
        out.push(`P${i + 1}: ${bnd.half ? `${bnd.half} Joy-Con` : 'gamepad'}`);
      } else if (bnd.keyset != null) {
        out.push(`P${i + 1}: ${KEYSETS[bnd.keyset].name}`);
      } else {
        out.push(`P${i + 1}: no controller`);
      }
    }
    return out;
  }

  /**
   * WHICH KEY ACTUALLY JOINS THE NEXT PLAYER, in words, or null if nothing can.
   *
   * IT IS ALWAYS `ENTER` ON A KEYBOARD NOW, and this function survives the
   * change because it still has a real question to answer: whether there is
   * anywhere left to join, and whether a spare CONTROLLER is the better answer.
   *
   * The key used to move. A keyboard set's `start` meant "pause" while somebody
   * was seated on it and "join" while nobody was, so which key joined depended
   * on which set was already taken — and that depended on how many controllers
   * were plugged in. With one controller player 2 sits on WASD, so `Enter` was
   * HER PAUSE KEY and the way in was the arrow set's `\`; pressing the obvious
   * Enter opened the menu instead of seating player 3. Both sets answer to
   * Enter now and Esc is the keyboard's only menu key, so the sentence on
   * screen is the same sentence every time.
   *
   * Pads are named first when one is free: pressing START on a controller
   * nobody is using is the easy answer whenever it is available.
   */
  joinHint() {
    if (this.slots >= MAX_SLOTS || this.slots >= this.seatable) return null;
    const bound = this.bindings.slice(0, this.slots);

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const live = this._order.map((i) => pads[i]).filter(Boolean);
    /* Only real pads are offered as "press START on a spare one". The touch pad
       cannot be spare — there is one screen, and whoever is holding it is
       already seated on it. */
    const freePad = this._padDevices(live).some(
      (d) => !bound.some((b) => b.pad === d.pad && b.half === d.half)
    );
    if (freePad) return 'START on a spare controller';

    const freeKeyset = this._freeKeysets().some((k) => !bound.some((b) => b.keyset === k));
    return freeKeyset ? 'ENTER' : null;
  }

  /**
   * A controller nobody is playing on that somebody has actually picked up, or
   * null. `skip` holds device ids that have already been offered.
   *
   * THE THIRD CONTROLLER USED TO DO NOTHING UNTIL A THIRD PLAYER JOINED, and
   * that reads as the controller being broken rather than as the party being
   * small. Plug a PS4 pad in beside two Joy-Cons and it is dealt a device slot
   * correctly, sits there unbound because `slots` is 2, and no amount of
   * pressing anything except START gets a kitten out of it. `Game._autoSeat`
   * uses this to seat her automatically instead.
   *
   * IT ASKS FOR REAL INPUT, NOT MERE CONNECTION (`hasSentInput`), which is the
   * same question the vJoy phantom has to answer and it is doing the same job
   * here: a pad that is plugged in to charge, or left on the sofa, has sent
   * nothing and seats nobody. Picking it up and moving the stick is the gesture.
   *
   * ONE OFFER PER DEVICE, and the caller latches it. `hasSentInput` never goes
   * back to false once a pad has been used, so without a latch a player who
   * drops out would be re-seated on the next frame by the controller still in
   * her hands — she could never leave.
   */
  sparePad(skip = new Set()) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const live = this._order.map((i) => pads[i]).filter(Boolean);
    const bound = this.bindings.slice(0, Math.min(this.slots, MAX_SLOTS));
    for (const d of this._padDevices(live)) {
      if (bound.some((b) => b.pad === d.pad && b.half === d.half)) continue;
      if (skip.has(deviceId(d))) continue;
      const gp = pads[d.pad];
      if (gp && this.hasSentInput(gp)) return { ...d, keyset: null };
    }
    return null;
  }

  update() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    /* WATCH FIRST, THEN BIND. `_padDevices` asks `hasSentInput` whether a vJoy
       device is a real controller or the driver's phantom, and that answer is
       built here — so binding first would decide on evidence one frame stale
       and leave the pad asleep for a frame after the button that woke it. */
    this._watchAxes(pads);
    this._syncBindings(pads);

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

    for (let i = 0; i < MAX_SLOTS; i++) {
      const st = this.players[i];
      st.prev = { ...st.held };

      const bnd = this.bindings[i];
      const gp = bnd.pad != null ? pads[bnd.pad] : null;

      let mx = 0;
      let my = 0;
      const next = Object.fromEntries(ACTIONS.map((a) => [a, false]));

      if (bnd.touch && this.touch) {
        /* THE SAME DEADZONE AS A STICK, deliberately. The touch pad already
           clamps to the unit circle and applies a tiny centre threshold of its
           own, but running it through `dead` too is what makes a thumb and a
           thumbstick accelerate identically — the response curve is a property
           of the game, not of the device, and `Player` must not be able to tell
           them apart. */
        st.source = 'touch';
        /* ALWAYS MERGED, on a phone as much as on a desktop. On a phone there
           is no keyboard and this contributes nothing; on a tablet with one
           attached, or on the desktop test mode, it is player 1's second hand.
           `_freeKeysets` is what stops anybody else being dealt the same set. */
        const r = this.touch.read({ keyset: KEYSETS[TOUCH_KEYSET], keys: this.keys });
        mx = dead(r.ax);
        my = dead(r.ay);
        for (const a of ACTIONS) next[a] = !!r[a];
      } else if (gp) {
        st.source = 'gamepad';
        const r = profileFor(gp).read(gp, {
          rotation: this.joyconRotation,
          half: bnd.half,
          map: this.vjoyMap,
        });
        mx = dead(r.ax) + (r.dpad ? r.dpad[0] : 0);
        my = dead(r.ay) + (r.dpad ? r.dpad[1] : 0);
        for (const a of ACTIONS) next[a] = !!r[a];
      } else if (bnd.keyset != null) {
        st.source = 'keyboard';
        const k = KEYSETS[bnd.keyset];
        /* ANY of the codes bound to a field. Every field is a list — see
           KEYSETS — because player 2 has two hand positions and up to three
           keys per button, which a single primary-plus-alternate cannot say. */
        const on = (field) => (k[field] ?? []).some((code) => this.keys.has(code));
        if (on('left')) mx -= 1;
        if (on('right')) mx += 1;
        if (on('up')) my -= 1;
        if (on('down')) my += 1;
        for (const a of ACTIONS) next[a] = on(a);
      } else {
        /* NO DEVICE AT ALL — a slot past the party size. It must report
           nothing: the old code fell back to `KEYSETS[i]` unconditionally, so
           leaving that in place would have WASD quietly driving the controller
           state of a third kitten nobody has seated. */
        st.source = 'none';
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

    /* Joining, last: the edge is against the PREVIOUS frame, so the candidate
       has to be found before this frame's held state replaces it. A capture in
       progress swallows it like everything else — binding a button to START
       must not also seat a new kitten. */
    this._joinCandidate = suppress ? null : this._findJoin(pads);
    this._rememberJoin(pads);
  }

  /** True on the frame any player presses any button — used by the title screen. */
  anyPressed() {
    return this._anyPressLatch;
  }

  /* ------------------------------ joining ------------------------------- */

  /**
   * A device that nobody is playing on, whose START was just pressed.
   *
   * THE TITLE SCREEN IS NOT TOUCHED, AND THAT IS THE POINT. The menu panel is a
   * faithful reproduction of a drawing one of the girls made — SETTINGS, PLAY,
   * HELP — so a fourth button is not available, and putting a lobby in front of
   * PLAY would add a step to the game the two of them already know. So a third
   * and fourth player join FROM INSIDE THE GAME, which is also exactly what
   * "players can join without disturbing the ones already playing" asks for:
   * the join mechanic and the character picker are one feature.
   *
   * START RATHER THAN ANY BUTTON, for the reason `SKIP_KEYS` exists: the girls
   * rest their thumbs on things. On a pad it is the pause button; on a keyboard
   * it is that set's own start key, which cannot collide with a seated player's
   * because a set only qualifies here while NOBODY IS ON IT.
   *
   * COMPUTED INSIDE `update`, NOT ASKED FOR ON DEMAND. The edge test compares
   * against the previous frame, and `Game` asks this question after `update`
   * has already run — so a version that sampled the pad when called would be
   * comparing a frame against itself and could never see a press.
   *
   * @returns { pad, half, keyset } | null
   */
  pendingJoin() {
    return this._joinCandidate;
  }

  _findJoin(pads) {
    if (this.slots >= MAX_SLOTS) return null;
    const bound = this.bindings.slice(0, this.slots);

    // An unbound pad. A split vJoy pad is bound as two halves, so a pad with
    // one half seated is NOT free — the other half already belongs to a slot
    // the moment the party grows.
    for (const gp of this._order.map((i) => pads[i]).filter(Boolean)) {
      if (bound.some((b) => b.pad === gp.index)) continue;
      const r = profileFor(gp).read(gp, {
        rotation: this.joyconRotation, half: null, map: this.vjoyMap,
      });
      if (r.start && !this._joinPrev.has(`pad:${gp.index}`)) {
        return { pad: gp.index, half: null, keyset: null };
      }
    }
    /* ONE JOIN KEY FOR THE WHOLE KEYBOARD, AND IT IS ENTER.
       This used to walk the sets and ask each one for ITS OWN start key, so the
       key that seated the next player moved about depending on which set was
       already taken — Enter while WASD was free, `\` while it was not. Enter is
       now the only way in and it hands out the LOWEST FREE SET, so two keyboard
       players join one at a time by pressing it twice: the first press takes
       WASD, the second takes the arrows.
       The edge is latched against one key rather than one per set, or holding
       Enter down after the first join would immediately seat the second. */
    /* FROM THE FREE LIST, NOT FROM EVERY SET. This line used to walk all of
       KEYSETS, so with the touch pad up it handed player 2 WASD — which the pad
       is already reading — and a claim beats `_assign`'s reservation. Pressing
       ENTER on a phone therefore seated a sister who moved in lockstep with you. */
    const free = this._freeKeysets().find((k) => !bound.some((b) => b.keyset === k)) ?? -1;
    if (free >= 0 && this._joinKeyDown() && !this._joinPrev.has('kb')) {
      return { pad: null, half: null, keyset: free };
    }
    return null;
  }

  /** Enter, on either the main block or the numpad. */
  _joinKeyDown() {
    return KEYSETS.some((ks) => ks.start.some((code) => this.keys.has(code)));
  }

  /** Remember which devices were holding START, so a held button joins one
   *  player rather than one every frame it stays down. */
  _rememberJoin(pads) {
    const now = new Set();
    for (const gp of pads) {
      if (!gp) continue;
      const r = profileFor(gp).read(gp, {
        rotation: this.joyconRotation, half: null, map: this.vjoyMap,
      });
      if (r.start) now.add(`pad:${gp.index}`);
    }
    if (this._joinKeyDown()) now.add('kb');
    this._joinPrev = now;
  }
}

function dead(v, threshold = 0.22) {
  if (Math.abs(v) < threshold) return 0;
  // Rescale so motion starts smoothly at the edge of the deadzone.
  return Math.sign(v) * ((Math.abs(v) - threshold) / (1 - threshold));
}
