# Input: controllers, Joy-Cons and the keyboard

*Design notes, moved verbatim out of the old 4,400-line `HANDOFF.md`. This is
the WHY behind code that already exists — read it when you are about to change
something in this area, not before. Current state and open work live in
[HANDOFF.md](../../HANDOFF.md); the always-on summary is [CLAUDE.md](../../CLAUDE.md).*

*Cross-references saying "above" or "below" may now point at a sibling file in
this folder — see [the index](README.md).*

---

## The controller pass, and five things it turned up

Everything in this section came out of one round of feedback after the girls
had the game on real hardware.

**THE HUD IS HIDDEN FOR EVERY SCENE, FROM ONE CALL.** `_hudDuringScenes` asks
`_sceneActive()` rather than keeping its own list of scenes, and it is called
*before* the scene blocks rather than between two of them — it used to sit after
the opening cutscene's early `return`, so the intro was the one scene it never
ran for. The minimap goes with it because the minimap lives inside `#hud`. Two
copies of a rule, and the copy nobody remembers, is the same failure
`trackForIsland` exists to prevent.

**A SCENE IS SKIPPED BY `start`, SPACE OR ENTER — NOT BY ANY BUTTON.** It used
to be any key and any button, which sounds forgiving and is the opposite: they
hold a stick and mash the whole time a scene is running, so the 79-second intro
with seven recorded voices in it was being thrown away by a thumb resting on
jump. `SKIP_KEYS` and `Game._skipPressed` are the only two places that decide
it, and all four scenes (intro, shrine, summon, finale) go through them.

**`map` AND `math` ARE PAD-ONLY ACTIONS, DELIBERATELY.** Minimap zoom and the
maths overlay existed on Z / X / M and nowhere else. They are `ACTIONS` now, so
the remap grid picks them up for free — but with **no `KEYSETS` entry**, which
is the part worth not undoing: the keyboard keeps Z / X / M in the keydown
handler, so those still work while somebody else is on a pad. Routing them
through a player slot would kill the keyboard shortcut the moment that slot
binds a controller. `this.keys.has(undefined)` is false, so the two paths
cannot double-fire.

On a standard pad they are the **bumpers** — the only two buttons the game
never used, since the triggers already carry sprint. Guide (16) is a second
binding for `math` rather than the only one: browsers report it inconsistently
and Windows can eat it into the Game Bar, so a control bound to it alone is
dead on some machines with nothing on screen to say why.

**MENUS TAKE A CONTROLLER (`systems/menunav.js`).** The game was fully playable
on a pad and completely unreachable on one — PLAY, SETTINGS, RESTART and every
setting were mouse-only, so two kids on two Joy-Cons passed a laptop back and
forth. Three rules in it are load-bearing:

- **The highlight starts on the default action, which is what keeps "PRESS ANY
  BUTTON TO START" true.** Title focus begins on PLAY and, *on the title screen
  only*, every button confirms. A kid who has never thought about a menu
  presses something and the game starts, exactly as before. Inside a real panel
  only `jump` confirms, so the other buttons stay free to mean nothing.
- **A `<select>` is changed in place, never opened.** A native dropdown is an OS
  window the Gamepad API cannot reach — opening one with a pad is how you get a
  menu you can enter and not leave. Left/right cycle the options and dispatch
  the same `change` event a mouse would, so every listener in `main.js` works
  untouched.
- **`_paint` clears the ring globally before lighting one.** Toggling the class
  across only the current panel's items is the obvious version and it leaves the
  ring on the title's SETTINGS button when Settings opens — two highlights, the
  stale one drawn first, so it is also the one that looks like the cursor.

Either player drives it: there is one screen and one cursor, and making player 1
the only one who can press RESUME locks the other girl out of her own pause menu.

**WHICH AXIS MOVES THE CURSOR IS DECLARED IN THE MARKUP** (`data-nav`), not
guessed from CSS. The title's three buttons sit in a flex ROW, so pressing *down*
to reach a button that is visibly to the *left* reads to a nine-year-old as the
controller not working — `data-nav="horizontal"` puts them on left/right.
`#panel-help` is `data-nav="scroll"`: it is a wall of text with one button in it,
so up/down belongs to the text.

**A page you open to read opens at the TOP.** `_paint` scrolls the focused item
into view and the only focusable thing on the help page is BACK, at the very
bottom — so opening Help jumped straight past everything it exists to say. The
scroller is the `.panel` box rather than the page, because these overlays are
`position: fixed` and the document behind them has nothing to scroll.

**THE SHARED CAMERA IS UPDATED EVERY FRAME, SPLIT OR NOT.** This is the whole
fix for the jarring rejoin. The block lerps `sharedTarget`/`sharedDist` toward
their targets, and it used to sit inside `if (this.merged)` — so while the
screen was split those were not stale by a little, they were **frozen at
wherever the girls were standing the moment the screen split**, however long ago
and however many islands away. Coming back together started the lerp from that
abandoned spot and flew the camera across the archipelago, which is the
"teleport": it is really the tail of a lerp that should have finished minutes
ago. Running it always costs two vector lerps a frame on a camera that isn't
drawing, and there is now no transition to smooth because there is no
discontinuity to hide. `_sharedSeeded` snaps it once at boot and on restart, or
the first frame flies in from the origin the same way.

---

## The keyboard's second seat is asked for now, and ENTER is the ask

**PLAY opens on one kitten on every machine** — see
[mobile.md](mobile.md#one-kitten-is-now-every-machines-answer-not-the-phones)
for why the desktop's `defaultParty: 2` was never a decision. Nothing about the
keyboard *dealing* moved; what moved is when the second slot exists at all.

`_assign` still hands the first padless slot the lowest free set, so:

| connected | player 1 | ENTER seats player 2 on |
| --- | --- | --- |
| nothing | WASD | the **ARROWS** / `O K L ;` set, below |
| one pad | the pad | **WASD** |

The second row is the reason "and there is no controller attached" is part of
the rule rather than a detail. It is not a special case bolted on for solo — it
is `_assign`'s standing rule that the first person off the controllers gets the
good half of the keyboard, and a solo game must not grow its own version of it.
`pad-check`'s *a party of one* block pins both rows, plus that player 1 is not
moved off her keys by somebody else joining, and that leaning on ENTER seats one
player rather than one per frame.

A controller is the other way in and needs no key: `Game._autoSeat` seats
whoever picks one up, gated on `hasSentInput` so a pad charging on the sofa
seats nobody.

## Player 2 gets a one-handed cluster, and the browser stops eating her keys

**Player 1 has always played one-handed and player 2 never could.** `WASD` with
`Q` `E` `F` around it is a left hand and nothing else; player 2 had the arrows —
a right-hand shape — with her buttons on the **numpad**, another hand's width to
the right and absent from half the machines in the house. The `, . / ;` run
added later is reachable, but only by taking your hand off the arrows.

So she has the same shape on her own side of the board:

```
   O K L ;    walk          (mirrors W A S D)
   P I J      mount, interact, attack   (mirrors Q E F, in that order)
   Right Alt  jump          (mirrors Space — the key right next to it)
   ' / RShift sprint        (mirrors Left Shift — under her little finger)
```

Numpad `0` `1` `2` `3` and Right Ctrl are all still live as well; the four above
are the ones the Help page names, because they are the ones on every keyboard.

**This block was wrong for a while and a player found it, not a check.** It was
written when jump really was `'`, the two swapped afterwards (see below), and
only the code moved. `world-check` now reads the Help page's own sentence about
these four keys against `KEYSETS`, so the next swap fails a check rather than
leaving a nine-year-old holding down the wrong key.

**Everything she already knew still works** — arrows, numpad and the punctuation
run are all still live. Three keys had to move, and each only because something
else claimed it:

| key | was | is | why |
| --- | --- | --- | --- |
| `;` | mount | **walk right** | it is the right-hand end of `O K L ;` |
| `/` | jump | **attack** | jump moved to `'`, so `/` took `.`'s old job |
| `.` | attack | **mount** | `;`'s old job had to go somewhere |
| `RCtrl` | sprint | **jump** | Richard asked for a jump key that isn't `'` |
| `'` | jump | **sprint** | swapped with Right Alt: jump is pressed most, so it takes the thumb key |

which leaves `, . / '` reading interact, mount, attack, jump — one contiguous
run, in the same order relative to each other as before.

### `alt` is gone: every keyset field is a LIST

A keyset used to be one primary code per field plus a single `alt` object, which
is exactly enough to say "the numpad, or these four keys next to it" and **not
enough to say what she actually needs**: three ways to press attack and two ways
to walk. A one-deep alternate cannot express a second complete hand position. So
every field is an array and `on(field)` asks whether *any* of its codes is down.
Two call sites read it (`_readKeys` and `_joinKeyDown`) and both got shorter.

**No key may do two jobs, and `pad-check` is where that is enforced.** Every one
of the three moves above would have fired two actions on one press if the old
binding had been left behind — `;` moving both the kitten and mounting her, `/`
jumping *and* slashing. The check walks each set for a duplicate code, and walks
the two sets against each other so one press can never move both kittens. Enter
is the one deliberate overlap, because Enter is the JOIN key for both sets.

### The browser was eating her keys, and Firefox is the browser this is played in

`/` and `'` open **Quick Find**; a bare `Alt` focuses the **menu bar**. So player
2 mashing jump — which was `/` before this pass — popped up a search box that
took the keyboard away from the game. Richard turned it off in his own Firefox;
nobody else's copy of the game should need that.

`preventDefault` used to name Space and the arrows, and that was the whole list
because it was written before player 2 had any punctuation. It is **derived from
the bindings now** (`BOUND_KEYS`), so a key added to a keyset is protected by
having been added, and `F5` / `F12` / `Tab` — which the game binds nothing to —
are untouched. It is prevented on the **keydown**, which is what stops Firefox
acting on the Alt *keyup* as well.

**Held Ctrl or Meta is deliberately left alone.** `Ctrl+L` is the address bar and
`L` is now a movement key; a game that eats the browser's own chords is worse
than one that loses a keypress. It also means `AltGr` (which reports as
`ControlLeft`+`AltRight`) passes through on international layouts, where it is
somebody's typing key rather than a sprint button.

### Verifying a key binding needs a HELD key

Worth knowing before you try to test this from a script: the harness's synthetic
key press is a keydown and keyup with **nothing between them**, and the game
samples `input.keys` once per animation frame — so a press that starts and ends
inside one frame is never seen at all, and the binding looks broken when it is
fine. Dispatch the `keydown`, let a few frames run, then dispatch the `keyup`:
same listener, same code path, and it is what a hand actually does.

---

## PLAY IT IN FIREFOX — Chrome cannot read the vJoy sticks

**Chrome returns all-zero axes for the vJoy device. Firefox reads them
correctly. Same machine, same driver, same moment.** Measured with
`tools/gamepad-dump.html`:

```
Chrome    axes: 8  buttons: 32   every axis 0.00000, span 0.000, forever
Firefox   axes: 8  buttons: 38   axis 0/1 and 3/4 live, span ~1.9
```

Chrome is *not* failing to see the device: buttons arrive and
`gamepad.timestamp` advances thousands of times, so it is receiving and parsing
fresh reports — it just yields nothing for the axis usages. Nothing in page
JavaScript can work around that; the values never reach the Gamepad API. Note
Chrome also truncates the button list to 32 (its `kButtonsLengthCap`) while
Firefox reports all 38, so the two browsers do not even agree on the button
indices — **the saved button map is per-browser** (localStorage), which is
lucky, because it means calibrating in one doesn't corrupt the other.

Before burning hours on this again: `tools/gamepad-dump.html` opens straight
from disk, no dev server, and settles it in about ten seconds. The line that
matters is *distinct timestamps seen* — if it climbs while every axis stays
flat, the browser is the problem, not the game and not the feeder.

---

## Joy2Win — the feeder behind vJoy

The Joy-Cons reach vJoy through **Joy2Win** (`github.com/Logan-Gaillard/Joy2Win`,
Python + pyvjoy). Its `config.ini` decides what the browser ever sees, and two
settings there can make the game look broken when it isn't:

**`mouse_mode` must be 0.** Joy-Con 2 has an optical mouse sensor on the rail.
In `control_type/duo_joycon.py` the stick axes are written only when that side
is NOT in mouse mode:

```python
if joyconMouseMode != "Left":
    vjoy.set_axis(pyvjoy.HID_USAGE_X, joyconLeft.analog_stick["X"])
    vjoy.set_axis(pyvjoy.HID_USAGE_Y, joyconLeft.analog_stick["Y"])
if joyconMouseMode != "Right":
    vjoy.set_axis(pyvjoy.HID_USAGE_RX, joyconRight.analog_stick["X"])
    vjoy.set_axis(pyvjoy.HID_USAGE_RY, joyconRight.analog_stick["Y"])
```

and mouse mode latches when the sensor sees a surface (`mouse["distance"]` of
`"00"` / `"01"`) **and** `config['mouse_mode'] != 0`. A Joy-Con lying on a desk
satisfies that. Buttons keep working; the sticks go completely silent.

**`orientation` is a single-Joy-Con setting and only swaps the stick axes.** In
`controllers/JoyconL.py` the decoder ends with `if orientation == 1: x, y = y, x`
— a transpose, no negation. With `controller = 0` (both Joy-Cons) the duo path
runs and orientation is out of spec. Leave it at 0 and let the game apply the
sideways rotation in its axis map; the transpose is why deriving the stick signs
by rotation logic kept coming out wrong.

Axes are `HID_USAGE_X` / `Y` for the left Joy-Con and `RX` / `RY` for the right,
never a POV hat. The README tells you to configure vJoy with "24 buttons or
higher" and says nothing about axes — X, Y, Rx, Ry have to be enabled in
Configure vJoy too.

**Telling "not written" from "written wrong":** `analog_stick` initialises to
`{"X": 0, "Y": 0}`, and 0 is the *minimum* of vJoy's 0..32768 range, which
Chrome reports as `-1.00`. So if any axis ever gets written it reads −1.00 or a
real value. An axis reading exactly `0.00000` is vJoy's untouched centre —
proof `set_axis` was never reached for it.

---

## Two players, one pad (the main input setup)

Both sideways Joy-Cons reach the browser as a **single** vJoy gamepad — there is
no P2 device to claim. So a player slot binds to a `{ pad, half }` pair, not to
a pad, and both slots can name the same pad with different halves:

```
bindings = [ { pad: 0, half: 'left' }, { pad: 0, half: 'right' } ]
```

`padMode` (Settings → Controllers) is `'split'` (default) | `'single'`, and it
touches **only** a vJoy device — see *Splitting is per device* above. A Pro
Controller or two individually-paired Joy-Cons are ordinary pads and get one
player each whatever it is set to.

The sideways 90-degree stick rotation is **not** a rotation step for these — it
lives in the axis map (`axX`/`invX`/`axY`/`invY`) per half. The remap grid
captures the stick as *"push RIGHT"* and *"push UP"*, so the rotation falls out
of the calibration. (`joyconRotation` still applies to a lone Joy-Con on its own
pad.)

A press that is completing a capture is swallowed for that frame — binding a
button to ATTACK must not also swing the katana on the way in.

**Stick orientation cannot be reasoned about. It was measured.** The tempting
model — "the two halves are turned opposite ways, so their signs mirror" — is
wrong, and produced three wrong signs out of four. How each half's stick lands
in vJoy depends on how the feeder wired it. On Richard's hardware, held
sideways:

```
LEFT   push L/R -> Y  positive/negative     push U/D -> X  positive/negative
RIGHT  push L/R -> Ry positive/negative     push U/D -> Rx negative/positive
```

which, with the game's +y = screen DOWN convention, is:

```
left   x = -axes[1]   y = -axes[0]
right  x = -axes[4]   y = +axes[3]
```

**A vJoy axis index is not a fixed name either.** vJoy only exposes the axes its
feeder enabled, so the right stick sits on `axes[3]/[4]` when Z is enabled and
`[2]/[3]` when it isn't. Reading the wrong index gives a stick that is silently
dead, not wrong — an early version read axis 2 (Z) for the right half and the
right kitten simply never moved. Richard's layout:

```
axes[0]=X  axes[1]=Y   -> LEFT  Joy-Con stick
axes[2]=Z                 (enabled, never moves)
axes[3]=Rx axes[4]=Ry  -> RIGHT Joy-Con stick
axes[5..7] Rz/Slider/Dial pinned at -1 (not enabled)
```

`autoDetectSticks()` re-numbers this rather than trusting it, and keys off
**movement**: wiggle both sticks and the axes that travelled are the sticks,
first pair left, last pair right. Resting position looked like the obvious
signal and isn't — on this vJoy device every axis rests at 0.00 whether it
carries a stick or nothing, so the "centred axes" rule saw all eight and put the
right stick on 6/7. It's kept only as a fallback, and only when exactly four
axes qualify; more than that reports ambiguity instead of guessing.

It **only moves indices and inherits the signs from `DEFAULT_VJOY_MAP`**,
because no amount of sampling tells you which way is up. It runs for the first
~6 seconds after a merged pad appears (retrying — a feeder that hasn't sent its
first report reads as every-axis-at-minimum, and one failed attempt at that
instant used to poison the session), then stops, so it can never fire mid-play
and rewrite the map under someone's thumbs. That automatic pass is **quiet**: it
fails by design before anyone touches a stick, and reporting that would put an
alarming red note under a perfectly good map. Never runs over a hand-calibrated
map; **DETECT STICKS** in Settings forces it and does report.

Diagnosing a dead stick: a released stick, a dead channel and a mis-bound axis
all read `0.00` in a snapshot, so the readout records the **range** each axis
has covered instead. Wiggle both sticks and read the axes line:

```
X 0:0.00 [-1.00..1.00] P1y    <- healthy, bound to P1's x
Z 2:0.00 [flat]               <- nothing arriving on this channel
Rx 3:0.00 [-0.15..0.15] P2y   <- moving, but barely
```

Three distinct diagnoses, and they need different fixes:

- **every axis `[flat]`** — nothing is reaching the browser. Not a game bug;
  the feeder or Chrome is the layer to look at.
- **a range with no tag** — that axis is live but nothing reads it: wrong index,
  fix with DETECT STICKS or the two-click stick capture.
- **a range smaller than ~0.25** — bound correctly but the travel is inside
  `dead()`'s 0.22 threshold, so it's floored to zero. The per-half row prints
  the pre-deadzone value next to the post (`stick 0.00 … raw 0.15 ← inside
  deadzone`), which names this one outright.

CLEAR AXIS RANGES restarts the measurement.

**A saved map beats `DEFAULT_VJOY_MAP`.** Once anything has been captured, the
`localStorage` copy is what loads. Editing the defaults in the source will look
like it did nothing until you hit **RESET TO DEFAULTS** in Settings (or clear
`kk.vjoy.map.v2`).

---

## Other controllers — PS4, Xbox, two pads at once

**Verified headlessly, not on hardware.** `node tools/pad-check.mjs` drives the
real `InputManager` with synthetic `navigator.getGamepads()` fixtures — real id
strings, real button counts, real HID orders — so everything below is about code
rather than about which pad happened to be on the desk. It cannot tell you a
stick *feels* right; it settles which profile matches, which slot binds to which
pad, which physical button lights which action, and whether two pads stay
independent. The Joy-Con path is a regression case in it.

**A DualShock 4, a DualSense and an Xbox pad all land on `standard`,** because
Windows and both browsers carry a remap table for them, and the mapping is
correct as it stands: Cross jump, Square attack, Circle interact, Triangle
mount, L2/R2/L3/R3 sprint, Options pause, d-pad moves. No button fires two
actions. **The right stick is unused by design** — nothing in the game consumes
`cx`/`cy`, the camera is scripted — so a PS4 player pushing it gets nothing, and
that is not a bug.

**TWO PADS WORK, and the Firefox rule does not apply to them.** Two of anything
plug in and bind P1 → first pad, P2 → second pad, in connection order, with
independent sticks and buttons. **The Chrome axis bug is a vJoy bug, not a game
bug** — a PS4 pad is a native HID device Chrome has a table for, so with two PS4
pads Chrome is fine. Firefox is only required when the Joy-Cons are coming
through Joy2Win + vJoy.

**`padMode: 'split'` used to clone one pad onto BOTH players, and that was the
real find.** `half` is read by exactly one profile — `vjoyDual`, through
`readHalf`. Every other profile ignores it and returns one identical snapshot,
so splitting a PS4 pad gave both slots the same input: the two kittens moved as
one, every press jumped both, and player 2 had no controller while appearing to
have one. `_syncBindings` now refuses to split anything that is not a merged
vJoy pad, `padMode` included — the setting cannot override the invariant.

That one bug had a second face. A pad with two slots is exactly what puts the
**vJoy remap grid** on screen, so with SPLIT selected and a PS4 pad connected,
calibrating a PS4 button wrote into `vjoyMap` — a map that pad can never be read
through — and **silently overwrote the Joy-Con calibration**, which persists to
`localStorage`. Fixing the split closes it, and `beginCapture` and
`autoDetectSticks` now refuse a non-vJoy pad outright, so the invariant is
stated where it can't be routed around by a fourth UI path.

**A pad the browser has NO table for falls back to `generic`, and its face
cluster is shuffled.** Raw DS4 HID order is Square-Cross-Circle-Triangle, so the
fallback reads Square as jump and Cross as interact. Sticks, triggers and start
are fine, and the resting-at-−1 analog triggers correctly move nothing. This is
left alone deliberately: `generic` serves *unknown* pads and there is no order
that is right for all of them. It should not fire in practice — both browsers
know the DS4 and the DualSense. **A cheap USB pad is where it will bite.**

**There is no remap escape hatch for a non-vJoy pad.** The Settings grid edits
`vjoyMap` only. If a generic pad ever needs rebinding, the honest fix is a
per-profile map rather than widening the vJoy one, which is a real piece of work
and not worth doing before something actually needs it.

## The Steam Controller is not a gamepad until Steam says so

**The symptom, and it looks like a possessed controller.** A Steam Controller
(the 2025/2026 one) plugged into a laptop over USB, detected by Steam, does not
appear in Settings → CONTROLLERS at all — and meanwhile the right stick and right
trackpad move the mouse cursor, the left stick walks **Frost**, and Y makes
**Ember** jump.

Every part of that is one cause. The controller ships in what Valve's firmware
calls **lizard mode**: the device itself emulates a keyboard and a mouse. It has
**no XInput and no DirectInput mode and no standard HID gamepad descriptor** —
game input rides on a *vendor* HID collection (usage page `0xFF00`, report ID
`0x42`, 54 bytes at about 60 Hz) that only Steam knows how to read. So
`navigator.getGamepads()` never sees it, however long you mash buttons, and
"press any button on it to wake it up" is a dead end.

The stray movement is the same thing seen from the other side. Lizard mode sends
**arrow keys and Space** — which in this game are player 2's stick and player 1's
jump. One controller therefore walks Frost and jumps Ember, which reads as random
until you know it is a keyboard.

**A DualSense is the opposite case and that is why it needed no setup.** It
carries a real HID gamepad descriptor, so Windows, Firefox and Android all read
it directly and Steam Input is an optional layer on top rather than the only way
in.

### What actually works

**Closing Steam is the wrong move.** Steam is the thing that turns lizard mode
*off*; without it the controller is a keyboard and a mouse and nothing else.

The route that works is to make Steam emit a virtual Xbox pad *at the browser*:

1. Steam → **Games → Add a Non-Steam Game** → add **Firefox**.
2. On that shortcut: gear → **Properties → Controller → Steam Input = On**, and
   set the layout to a **Gamepad** template (an Xbox-style one), not the
   keyboard/mouse default a non-Steam shortcut gets.
3. **Quit Firefox completely**, then launch it *from Steam*.

Step 3 is not fussiness. Firefox is single-instance: launching a second copy
hands the URL to the running one and exits, Steam sees the "game" close a second
later, and the layout goes back to Desktop with nothing on screen to say why. If
that keeps happening, give the shortcut its own profile —
`firefox.exe -no-remote -P steam` — so Steam has a process to hold on to.

**Changing the Desktop Layout to a Gamepad template does not work.** Steam's
desktop configuration does not drive XInput emulation, so the pad comes out doing
nothing at all. It has to be a game shortcut.

Once it is emitting XInput, the browser reports an Xbox 360 pad, `mapping` is
`standard`, and the game's `standard` profile is already correct for it: A jump,
X attack, B interact, Y mount, triggers sprint, Start pause. No code needed.

**The Steam-free alternative** is a third-party shim — `SteamlessController` and
similar — which sends the HID feature reports that disable lizard mode itself and
republishes the pad through ViGEmBus. It works, and it means installing a virtual
bus driver, so it is the answer for a machine that should not have Steam running
rather than the first thing to try.

### On a phone, it will not work at all

Lizard mode is the *firmware's* behaviour, so an Android phone pairing the
controller over Bluetooth sees a keyboard and a mouse — and there is no Steam on
the phone to tell it otherwise. Nothing the game can do reaches this. **The PS5
pad is the controller for the phone**, and it needs no setup there for exactly
the reason above.

### A CONTROLLER IS A CONTROLLER, and the vJoy phantom

**One player per connected pad, in connection order, and a Joy-Con is just a
pad.** Joy-Cons paired to the machine individually are ordinary gamepads and get
dealt like ordinary gamepads. `auto` splits nothing.

```
  0 pads   P1 WASD   P2 Arrows
  1 pad    P1 pad    P2 WASD    P3 Arrows
  2 pads   P1 pad    P2 pad     P3 WASD    P4 Arrows
  3 pads   P1 pad    P2 pad     P3 pad     P4 WASD
```

**THE SLOT-AFFINITY PASS IS GONE.** `_assign` gave slot `i` `KEYSETS[i]` when it
was free, which preserved what slot 1 got before four players existed and is the
wrong answer to the question a kid actually asks: one pad put player 2 on the
ARROW keys and pushed WASD down to player 3. The keyboard sets are a **queue**,
not player 2's and player 3's property — WASD with a space bar beats the arrows
with a numpad, so whoever is first out of the controllers gets WASD whatever her
slot number is. The cost is that one pad plus one keyboard moves player 2 from
the arrows onto WASD; that is a deliberate change to the two-player game and it
is the arrangement it improves.

**A vJOY DEVICE IS PRESENT WHETHER OR NOT ANYTHING IS FEEDING IT. THAT IS THE
PHANTOM, AND IT IS THE BUG THIS SECTION IS REALLY ABOUT.** vJoy is a
driver-level virtual joystick: once installed, Windows reports it to the browser
forever — with Joy2Win not running, with no Joy-Con paired, with no Nintendo
hardware in the building. The game saw a controller that was not there, gave it
player 1, and left a kid on the keyboard wondering why nothing moved. It looks
exactly like a connected controller that has stopped working, which is why it
is confusing rather than merely wrong.

**So a vJoy device must prove it is alive before it can take a seat, and ONLY a
vJoy device is asked** (`hasSentInput`). Every real pad is already hidden by the
browser until it sends input — by the time one appears in `getGamepads` somebody
has used it — so the gate is a no-op for real pads and would only be a source of
mid-session churn if the test ever misfired. vJoy is the one device that shows up
without anybody touching anything, so vJoy is the one device that has to answer
for itself.

**The test measures movement from the FIRST READING, not from zero.** `_watchAxes`
seeds min and max to whatever the axes said the first time it saw them, so a
phantom reporting the same constants forever has a range of exactly 0 on every
axis however odd those constants are. Against zero instead, the vJoy device's
resting state — three axes at `-1` — reads as "alive" on frame one, which is the
bug rather than the fix. There is a check for exactly that.

**`_watchAxes` now runs BEFORE `_syncBindings`.** The binder asks `hasSentInput`,
and that answer is built by the watcher, so binding first decided on evidence one
frame stale and left the pad asleep for a frame after the button that woke it.

**It is still LISTED in Settings, flagged `asleep`, not hidden.** Hiding it makes
"why can't the game see my Joy-Cons?" undebuggable from inside the game, which is
the whole job of that screen. The row says what to do instead of saying "unused".

#### SPLITTING IS PER DEVICE, NOT A MODE — and that took three goes

This was got wrong twice in opposite directions before the shape of the mistake
was visible, so the two dead ends are worth keeping:

1. **`auto` splits a vJoy pad whenever one is present.** Broke the case where
   somebody holds both halves themselves: one controller became two players who
   then both moved the same kitten.
2. **`auto` splits nothing; splitting is an explicit mode.** Broke the case that
   actually matters — two Joy-Cons through Joy2Win **plus** an ordinary pad.
   In `split` the pad looked disabled; in `auto` a Joy-Con looked disabled.

**Both are the same bug: the switch asked "do we split?" about THE MACHINE when
it is a question about ONE DEVICE.** No global answer can be right when the
machine holds a vJoy feed *and* a PS4 pad, because the two want opposite
answers. `_padDevices` now walks the connected pads and decides each on its own:
a vJoy device becomes two players, everything else becomes one, and they coexist.

**A vJOY DEVICE IS ALWAYS TWO PLAYERS, and that is not a guess.** It is not a
controller, it is a FEED — nothing has the vJoy driver installed and Joy2Win
running by accident, and the entire point of that stack is to present two
Joy-Cons as one device. Two is right in every case where somebody has actually
set it up. `padMode` survives only for the one person holding both halves
herself, and it is the only thing that setting touches now: `'split'` (default)
or `'single'`, with `'auto'`/`'separate'` accepted as the legacy spellings.

**THE HALVES EXPAND IN PLACE, IN CONNECTION ORDER.** The old split branch built
`[left, right, ...everything else]`, hoisting the Joy-Cons to players 1 and 2
however late they were plugged in and silently reordering everybody else. A pad
connected first keeps player 1 now, whatever kind of pad it is.

**Verified in the browser on the setup that prompted it:** vJoy woken by moving
axes (not a stuck button) plus a PS4 pad gives `P1 left Joy-Con | P2 right
Joy-Con | P3 gamepad`, and pushing each stick in turn moves exactly one kitten.

**THE OTHER PADS COME AFTER THE TWO HALVES INSTEAD OF BEING DROPPED.** The split
branch returned the two halves *and nothing else*, so a pad connected alongside
was not merely last in the queue — it **was not a device at all**, and no amount
of pressing START could seat anybody on it.

**`_padDevices` is one function because two copies of this rule is how the right
Joy-Con went dead in the first place.** `_syncBindings` decided whether to split
and `seatable` decided it again a hundred lines further down in the same words —
so the join screen could refuse a fourth player onto a device the binder had
already dealt. Same duplication `trackForIsland` and `_hudDuringScenes` exist to
prevent.

**NOT SPLITTING BROKE THE CALIBRATION SCREEN, and the proxy is why.** Both
`beginCapture` and the remap grid found the vJoy pad by asking *"which binding
holds `half`"* / *"does some pad hold two player slots"* — proxies for "is this
the vJoy device" that were only true while `auto` always split it. With the pad
seating one player and `half: null`, the lookup found nothing and the grid never
rendered: the entire Joy-Con remap screen went unreachable for the one device
that cannot be played without it. Both ask for the device **by name** now
(`profileNameFor(gp) === 'vjoyDual'`), which is the question they always meant.


## The name printed on the button

`promptFor(slot, action)` answers "what is this player's `interact` button
called", and it answers from the LIVE binding — the same `pad` / `half` /
`keyset` the action itself is read through, so the label cannot name a device
the player is not on. Two things about it changed after the fourth playtest.

**A PlayStation pad is told the shape, not a letter.** The table used to carry
a comment explaining why it wasn't: a Sony pad shows ○ where the Xbox lettering
says B, which is a wrong LETTER on a button in the right PLACE, "the least bad
of the available errors, and one no amount of sniffing the id string fixes
reliably". Half of that was right. It was played on a DualSense and reported
straight back — a nine-year-old hunting for a button called B on a controller
that has no letters on it anywhere is precisely the failure the whole
per-device prompt system exists to prevent.

So there is a `playstation` prompt table, and `promptStyleFor(gp)` picks it off
the pad's id. **It is a second, separate lookup from `profileNameFor`, and that
matters:** one decides how to READ a pad and the other decides what to CALL its
buttons, and the same device has different answers. A DualSense is read as
`standard` — its button indices really are the standard ones — and merely
labelled differently. Folding the two together would mean inventing a read
profile identical to `standard` just to carry four strings.

**The sniff only applies to `standard`, which is the load-bearing half of the
original objection.** A shape glyph is a claim about *where* the button is, and
the only pads whose positions this game knows are the ones the browser has
already remapped. `ds4NoRemap` in pad-check exists for exactly this: a
DualShock 4 the browser has no table for, same Sony id, completely different
indices. Telling that player to press ○ would name a button the game is not
reading — the same lie as `[B]` on a DualSense, wearing better clothes. It
keeps the generic profile's honest `ANY`.

The glyphs are the geometric shapes ○ ✕ □ △, not the Private Use codepoints in
Sony's own font, which are tofu anywhere that font is not installed. These are
drawn to a canvas by `core/label.js`, which has no webfont guarantee at all —
measured in the browser against a Private Use control to confirm all four
render as real glyphs rather than as the missing-glyph box.

**And the merged Joy-Con prompt follows a remap.** Half of `DEFAULT_VJOY_MAP`
is an admitted guess, and Settings → Controllers exists so a player can fix it
by pressing the button. The prompt read a FIXED table sitting beside that map,
so it went on saying RIGHT after somebody had moved `interact` onto Up: the
label lying again, arriving through the one door nothing was watching, and
lying to the one player who cared enough to calibrate her controller. It reads
`vjoyMap` now and names the index through `VJOY_BUTTON_NAMES` — the same facts
as the trailing comments in the default map, in a form the badge over a
kitten's head can read. An index with no name shows as `#5`, which is what the
Settings grid shows too: not friendly, but true and findable.

`world-check` no longer hardcodes `'[RIGHT]'` as the widest glyph when it sizes
the overhead callout. It asks `promptGlyphs('interact')` for every string the
game can actually print, because a fact about `input.js` copied into
`world-check.mjs` is a check that goes on passing while it measures last year's
table. Adding a prompt set is exactly the change that catches it out: had ○
been OPTIONS, the callout would have started clipping and the check would have
gone on saying it fitted.

## The triggers swap, and `P` goes back to being one thing

Two from the third four-player session.

### Shield is the LEFT trigger now, and sprint keeps the right

Asked for directly: "shield should be the left trigger, sprint should stay the
right trigger". The shape is what makes it obvious — a shield is held in the off
hand and you run with the other one — and it is the layout every game the kids
have played uses.

**Mount rides along with shield**, because it already did: mounting is the
shield button plus `△`, so moving shield moves mount. On a standard pad that is
now `L2` **or** `△` **or** `L3`; sprint is `R2` or `R3`. Nothing about the face
buttons moved.

**It applies to Joy-Cons too, which is the half that was actually wrong.**
Through Joy2Win/vJoy the left trigger was *sprint*, so a Joy-Con player and a
pad player were holding different buttons for the same thing and neither of them
could be told a single true instruction. `SL`/`SR` are the shoulder pair a
sideways Joy-Con has, and the left stick's `SL` is now mount while `SR` stays
sprint — the same handedness as a full pad, read off the same table.

The prompt tables moved with the bindings, which is the rule that keeps this
honest: a button whose printed name and bound action disagree is worse than
either being wrong on its own. `pad-check` asserts the pairing on the DS4
profile, the generic profile and both Joy-Con orientations, so a future remap
cannot quietly split them again.

### `P` was the debug readout AND player 2's mount

Both, in the same keyboard set, so a second player at the keyboard could not
mount anything without printing the frame cost over her sister's screen — and
the frame-cost readout is the first thing anybody is told to press when
somebody says it lags.

The **debug key moved**, not the mount: it is `` 1 `` now. The readout is listed
in the `` ` `` panel like every other debug key, so a player finds it there
rather than by remembering a letter, whereas mount is a key she uses every
minute. `CLAUDE.md` and [performance.md](performance.md) say `` 1 `` now, and
`pad-check` asserts that **no** keyset binds `KeyP` at all — the check that
would have caught the collision in the first place. Player 2's mount is
`Numpad3` or `.`, and the one-handed cluster's diagram is `. I J`.

### The Joy-Con shoulders were guessed, and the guess was wrong

`DEFAULT_VJOY_MAP` put map zoom on buttons 0/1 and the maths overlay on 2/3,
with a comment that admitted they were guesses: the top-edge shoulders "are the
only things left on a sideways left Joy-Con once the d-pad, the rail and Minus
are spoken for". They were not. Richard's feeder reports L and R up in the
twenties and puts **nothing** on 0–3, so two controls could not be reached and
four button indices did something the moment the feeder ever reported them.

Now `L → 20`, `R → 21`, and both `ZL` and `ZR → 22`. Buttons 0–3 are bound
to nothing. `pad-check` presses each of 20/21/22 on the merged pad and asserts the
right kitten's action fires, presses each of 0–3 and asserts nothing does, and
reads back the prompt table so a label can never name a button that moved.

**ZL and ZR are the same index, and that is deliberate twice over.** The feeder
reports both Z triggers as one button, and the maths overlay is one global
thing on screen rather than one per kitten — so a shared toggle is the shape
that fits. But a shared index means both Joy-Con `PadState`s see the press on
the *same frame*, and the old `if (p.pressed('math')) this._toggleMath()` inside
the per-player loop turned the overlay on and straight back off. `Game._step`
now collects the ask across the loop and fires `_toggleMath` **once** after it;
`map` stays inside the loop, because each kitten zooms her own. `world-check`
pins that shape as source, since the loop itself is not reachable from a
harness.

**The storage key had to move too.** A calibrated map wins over the defaults
wholesale — `_loadMap` assigns the saved half over the base — so on any
machine that had ever opened Settings → Controllers, the old 0/1/2/3 guesses
would have survived in `localStorage` and none of this would have taken. Bumping
`MAP_STORAGE_KEY` to `kk.vjoy.map.v3` retires those saved maps. That costs
whatever else was calibrated on that machine, which is the smaller loss: the
numbers it is throwing away were the wrong ones.

## Two quick presses hold the shield up

`Kabe` runs while the button is **held**, which is a thumb the player has to
keep down for the whole two seconds — and holding a button is exactly the thing
a nine-year-old stops doing the instant something else happens on screen. A
**double tap latches it**: the bubble stays up until it expires on its own, and
takes two more taps to bring back.

**It buys the button, never extra seconds.** `wardUsed` keeps running whether
she is holding it or the latch is, so a latched bubble pops on the same frame a
held one would, and `_dropWard` charges the same wait afterwards. There is
nothing to gain from the gesture except a thumb.

**A double tap is press-release-press, and the release is the problem.** By the
time the second press arrives the first release has already ended the block and
charged the cooldown — so the latch cannot be *"start a block"*, it has to be
*"take back the release that just happened"*. That is `WARD.regrab`: a half
second, armed **only by a release** (`_dropWard`'s reason argument), spent by
the second tap. A block she ran to the end of, or one the Cross Slash took off
her, arms nothing — so the gesture can never be used to dodge the cooldown, and
`_startTriple` drops with its own reason precisely so it cannot.

**The edge clock is in `PadState`, not in the Ward.** `doubled(action)` asks
*"was this frame's press the second of two, close together"* and answers for any
action; `lastPress` is stamped once per slot per frame in `update`. Two things
follow that a per-feature timer would have got wrong: **consuming the press
consumes the double tap with it**, so two owners of a frame cannot both fire on
one gesture; and **asking is not spending**, so `Player` can ask out of a branch
it only reaches when there is no dragon and no panda in range without the answer
depending on how many times it was asked.

**`DOUBLE_TAP_MS` is exported and the touch pad imports it.** The on-screen pad
has latched its buttons on a double tap since the first phone pass
([mobile.md](mobile.md)) and had its own copy of the number. They are one
gesture with two implementations — glass latches the *button*, a pad latches the
*shield* — and the one thing they must not do is drift 40ms apart and become two
gestures that look like one. `pad-check` drives the window with a hand-held
clock rather than real time, because a test that pressed twice as fast as Node
can run would pass against a window of any size at all, including a broken one
that always says yes.

## Both Joy-Con button clusters were named a rotation out

Reported from play, in one sentence per half: the clan oath said **"Press A"**
on the right Joy-Con and the button that actually swears is **Y**; it said
**"Press RIGHT"** on the left one and the button that works is the one at the
**top** of the pad as she is holding it. Same feature, same table, two
different wrong answers.

**Nothing was wrong with the reading side.** She joined the clan — the index
bound to `interact` was the index her thumb was on. `VJOY_BUTTON_NAMES` was
lying about what that index is CALLED, and `promptFor` faithfully printed the
lie over her kitten's head. This is the third time a prompt in this game has
named a button the player does not have, and every one of them has been a
label rather than a binding.

**One measured button fixes a whole cluster, and that is why this is a
correction and not a fresh set of guesses.** A d-pad is four buttons in a rigid
cross and a face cluster is four in a rigid diamond. If one index's name is out
by a rotation then all four are, by the same rotation — so a single press pins
which rotation it is and the other three follow with nothing invented:

```
left    8 is UP, not RIGHT        one step anticlockwise
        8 UP    9 DOWN   10 LEFT   11 RIGHT

right   7 is Y, not A             A and Y are opposite corners: a half turn
        4 X     5 B      6 A      7 Y
```

**The two halves being out by different amounts is the expected shape.** The
sticks are already recorded above as behaving this way — *"the two halves are
turned opposite ways, so their signs mirror"* is the tempting model and it
produced three wrong signs out of four, because how each half lands in vJoy
depends on how the feeder wired that half. A quarter turn on one and a half
turn on the other is exactly that, one layer up.

**The rail and the shoulders did not move.** `SL`/`SR`, `L`/`R`, `ZL`/`ZR` and
Minus/Plus sit on the edges rather than in a cluster and their names are
printed on the plastic, so there is nothing for a sideways grip to turn.

**The left half's names are AS SHE HOLDS IT.** There is no letter on a d-pad to
appeal to, so the only name that means anything is the direction her thumb
travels — and the prompt is drawn over her own kitten's head, in her own
quarter of the screen, while she is holding the thing.

`pad-check` pins both strings with a comment saying they are a MEASUREMENT and
not a preference, because nothing headless can see a silk-screen and the names
that were wrong are the ones that read most plausibly. It also compares
`PROMPTS.vjoyDual` against the live-map lookup action by action: a merged
Joy-Con is prompted through `vjoyMap`, but the Help page's drawn controller
still reads the static table, and two tables saying different things is
invisible from either side.

## MenuNav never paid for the presses it acted on

Two reports from one session, and one bug under both.

> pressing "Interact/Back" to go back to the Dealer ... instead cancels the
> Dealer screen entirely

> the player auto-selects the first kotodoma orb ... because I press the button
> in the menu screen and it is using that same button press

`PadState.consume` has carried a comment for a long time saying that whoever
acts on a press owes the call. `Inspector._drive` pays. The stall branch pays.
`MenuNav` read presses, acted on them, and left every edge sitting in the frame
for the rest of `Game._updatePlay` to find — and it runs FIRST, so everything
else in the frame is downstream of it:

- `B` backs out of the pause menu → `_back` unpauses → execution falls straight
  through to the stall branch **in the same frame**, which reads the same
  `interact` edge and opens the dealer's chooser. Reported as pressing back by
  the dealer opening the dealer.
- `JUMP` confirms CHARACTER PROFILE → the click opens the trade window →
  `profile.update` runs later in the **same frame**, reads the same `jump`
  edge, and offers whichever orb the cursor was sitting on.

`_read` now collects which pad pressed which action and hands back a `spend()`,
called **before** `_activate`/`_back` rather than after — the click handler runs
synchronously and can unpause the game or open a screen, so paying first means
there is no ordering left to get wrong. **Only the pads that actually pressed,
and only the actions they pressed**: `Input.consume` would spend the edge across
all four slots and eat the sister's press, and she can be standing at the stall
with her own `interact` while player one is in the pause menu.

`world-check` DRIVES this rather than reading the source for the word `spend` —
a source check would go on passing the day somebody moves the call above the
read it is meant to follow.

### And the trade window arms itself

Belt to those braces, and it covers what a consume cannot: a button still HELD
across the open (an edge is one frame, a thumb is not), and any future caller
that opens the screen without knowing it owes anything. Each side is unarmed
when `open` runs and arms on the first frame its own pad is holding none of
`jump attack interact mount start` — which is the rule as it was asked for,
*"wait for the user to release the select button and press it again"*.

**`ARM_GRACE` is why a stuck button cannot lock a girl out of the screen.** A
vJoy half that latches a button down would never release, so that side would
never arm and she would sit in front of a screen that ignores her — a rule that
vanishes rather than degrades. After 0.6s the latch gives up; the opening edge
is long gone by then and there is nothing left for it to protect.

### Back is one layer; START is all of them

`Inspector._choose` used to `closeAll()` and open the trade window, so there was
nothing underneath to go back TO and `interact` read as backing out of two
things at once. It passes `backTo: { index, row }` now and `ProfileScreen.close`
puts that card back where it was, on the row she left it on. `START` passes
`{ back: false }`: that button is the way out of the whole screen, and landing
on the card she opened it from is not out.

---

## Force-spawn: testing four players with two hands

> I'd like to be able to play the game with 3 or 4 players for
> testing/debugging purposes without needing controllers.

Four kittens takes four devices, and almost everything the four-player pass
added only *exists* at three and four: the quadrant split, the two-map rule,
the leagues, the way the dealer's shelf and the orb count and the arena's
seeding all scale off `partySize`. Reaching any of it meant borrowing three
controllers, so in practice it was tested at two and hoped for at four — which
is how debug `4` came to kill Frost and go unnoticed (see
[four-players.md](four-players.md)).

`` ` `` then `\` turns it on; **ENTER** then seats a third and fourth kitten
with nothing plugged in at all.

### The share is a QUEUE, not a third keyboard set

There is no `KEYSETS[2]` and there must not be — the keyboard runs out of
one-handed shapes long before it runs out of keys, and a third set would be
four keys nobody's hand is over. So the two existing sets are shared, and the
only rule is:

> **A slot that came out of the ordinary dealing with NOTHING gets a keyboard
> set somebody else already has.**

That one sentence is the whole feature (`_shadowPass` in
[core/input.js](../../src/core/input.js)), and everything else falls out of it:

| devices | P1 | P2 | P3 | P4 |
| --- | --- | --- | --- | --- |
| keyboard only | WASD | Arrows | WASD\* | Arrows\* |
| 1 controller | pad | WASD | Arrows | WASD\* |
| 2 controllers | pad | pad | WASD | Arrows |

**It turns itself off by being unnecessary.** With two controllers there are no
empty slots, so nothing is shared — not because a rule forbids it but because
the pass has nothing to fill. That is why there is no "real four-player mode"
branch anywhere: the ordinary dealing is the only dealing, and this runs after
it on what is left.

**The shadows are never CLAIMED**, and that is the non-obvious half. A claim is
keyed to a slot and wins over the dealer, so a claimed shadow would freeze the
arrangement she joined under — plug a controller in afterwards and her set's
primary moves while her claim does not, leaving her sharing with nobody. Left
unclaimed, the entire keyboard is re-dealt every frame, which is what makes the
one-controller row above come out right without a rule saying so.
`_findJoin` marks the join `shadow: true` and `Game._joinPlayer` reads that as
"do not claim".

### Shared must not mean simultaneous BY ACCIDENT

Two slots reading one keyset is **two kittens moving as one** — the same failure
`_padDevices` refuses for a split vJoy pad and `_freeKeysets` refuses for the
touch player, arrived at from a third direction, and it would be at its worst
here because you would be watching it happen in split screen.

So a shared set drives one of its slots. `keysetOwners(k)` says which,
`keysetDrives(k, slot)` is what `read` asks, the others get nothing at all, and
`swapKeyset(k)` steps the set along. **`R` walks WASD's ring, `U` walks the
arrows'** — each key sits by the hand it switches (R is the next key up from
WASD, U the next key left of `O K L ;`), so neither hand reaches across the
desk, which is the argument the two keysets are laid out on in the first place.

**The last stop on the ring is all of them at once**, and that is the one place
in this codebase where two cats walking in lockstep is the asked-for behaviour
rather than the bug. Two kittens on WASD is a ring of **three** — P1, P3, both —
because marching the party across the island to test a four-way round is four
separate walks otherwise. The difference from the failure above is that this is
a stop a person pressed a key to reach, never a state the dealer can produce:
with the toggle off nothing is ever shared, so the share is of one, the ring is
one stop long, and no number of presses can reach it. `pad-check` pins that.

`keysetOwners` returns a **list** for the same reason, and it is a list of one
in every ordinary game — which is what lets `read` and `describe` ask it
unconditionally without the two-player game being able to tell it changed shape.
The ring is always `share.length + 1` stops, so three kittens on the arrows (a
tablet: the touch pad owns WASD) gives four stops, ending on all three together.

It is a **counter, not a boolean**, for the same reason the ring is not always
two, and the modulus is the difference between a control that cycles and one
that appears dead. The count is deliberately not reset when the share changes —
a player leaving shortens the ring, the modulo re-reads it, and whoever is left
gets the keyboard back rather than nobody having it.

Both stops that involve more than one kitten have to **say so**: the toast reads
`WASD → P1 + P3 together`, the panel row bolds every name it is driving, and
`_markKeyboardOwners` dims nothing — the badges agreeing is how you tell that
stop from the two single ones at a glance, and mistaking it for a desynced split
screen is the obvious way to lose an hour.

### A kitten waiting her turn reports NO device

`PadState.source` answers "what is driving this slot **this frame**", so a
waiting slot reports `'none'` rather than `'keyboard'`. That is load-bearing
rather than pedantic: `Game`'s Escape handler hands the pause menu to the lowest
slot whose source is `'keyboard'`, and a slot that claimed to be on a keyboard it
cannot currently press would take the cursor and then be unable to move it.

Her **binding** still names her set, so `promptFor` goes on drawing her own keys
over her head and `describe` lists her — marked `(waiting)` against the other
one's `(playing)`, because "P1: WASD  P3: WASD" is true and reads as exactly the
bug this feature is most likely to be mistaken for.

Her score badge dims too (`Game._markKeyboardOwners`), on the rebuild and on the
swap and never per frame — halfway through a four-player test the thing you need
to know is which of the four cats your hands are on right now, and the badge is
already what you look at to find your colour.

### Turning it off sends them home

`seatable` returns `MAX_SLOTS` while the toggle is on, which is what lifts every
refusal — the join key, `_autoSeat`, `_joinPlayer`'s toast all ask that one
number. Turning it off has to put the number back **and** shrink the party, or
four cats stay in the world with two of them unmovable. It goes through
`_trimPartyToDevices` → `_leavePlayer`, the same path that already puts a
departing kitten's orbs back into the world and sends her animals home; doing it
by hand would be a second, worse copy of a rule that exists because dropping a
player wrong loses something.

`pad-check` pins all of it — including that the two-player dealing with the
toggle off is byte-identical to what it was, which is rule 5 asked of a debug
feature.
