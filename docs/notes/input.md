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
   ' / RCtrl  jump          (mirrors Space)
   Right Alt  sprint        (mirrors Left Shift)
```

**Everything she already knew still works** — arrows, numpad and the punctuation
run are all still live. Three keys had to move, and each only because something
else claimed it:

| key | was | is | why |
| --- | --- | --- | --- |
| `;` | mount | **walk right** | it is the right-hand end of `O K L ;` |
| `/` | jump | **attack** | jump moved to `'`, so `/` took `.`'s old job |
| `.` | attack | **mount** | `;`'s old job had to go somewhere |
| `RCtrl` | sprint | **jump** | Richard asked for a jump key that isn't `'` |

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
