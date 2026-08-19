# Playing it on a phone

**What a touch device is allowed to spend, and why the art budget moves the one
knob it moves.** Read this before touching `core/device.js`, the `maxAtlas`
argument at any `loadSpriteAtlas` call site, or the render quality tiers.

The roadmap — what is built and what is next — is in
[HANDOFF.md](../../HANDOFF.md). This file is only the reasoning.

---

## It already ran; that is the surprising part

The first mobile test was not a code change. The Vercel build was opened on a
Galaxy S24 Ultra and it **booted and rendered at 147 MB of retained GPU
textures**, which was not the expectation going in. What was wrong with it was
the HUD in landscape (the minimap and the maths board eat a phone's width) and
the total absence of any way to move.

So the asset work below is about **cheaper devices and thermal headroom**, not
about getting the thing to start. That distinction matters because it changes
what "done" looks like: there is no crash to chase, only a budget to keep.

---

## What each sheet actually costs

**Source PNG dimensions tell you nothing about VRAM.** `loadSpriteAtlas`
decodes the source, measures it, and then **repacks it into a new canvas** of
`cellPx * cols` by `cellPx * rows`. Only the repacked atlas is retained; the
decoded source is transient. A 2752x1536 source can become a 3840x1536 atlas —
*larger* than the file it came from.

Measured off the real sheets (`packMetrics` shared with the loader, so these are
the loader's own numbers and not a re-derivation):

| sheet | source | packed atlas | VRAM | governed by |
| --- | --- | --- | --- | --- |
| ember_grid_v2 | 2752x1536 | 3840x1536 | 22.5 MB | `cell` floor — **off-limits** |
| frost_grid | 2752x1536 | 3072x1536 | 18.0 MB | `cell` floor — **off-limits** |
| dragon_fly | 2752x1536 | 2048x2048 | 16.0 MB | `maxAtlas` |
| dragon_sheet | 2752x1536 | 2048x2048 | 16.0 MB | `maxAtlas` |
| ryuuseki | 1376x768 | 1386x1386 | 7.3 MB | art-sized |
| 7 leaders | 1024x1024 ea. | ~1150² ea. | 32.4 MB | art-sized |
| panda, griffin, satan | 1024x1024 ea. | ~1000² ea. | 13.9 MB | art-sized |
| 10 critter sheets | 768x768 ea. | ~750² ea. | 19.9 MB | **pinned by checks** |
| | | **total** | **147 MB** | (~196 MB with mipmaps) |

`title_art.png` is a **CSS background**, not an atlas — it never becomes a GPU
texture, so it is not in the total. It is still 5.5 MB of download and a
2752x1536 decode the browser holds for the layer, which is worth revisiting and
is not urgent.

Dropping `maxAtlas` from 2048 to 1024 on a touch device takes the total from
**147 MB to 115 MB** (196 to 153 with mipmaps). That is the whole of the current
saving: 22%, from one argument.

---

## `maxAtlas` is the safe knob. `cell` is not. The reason is not the obvious one

**A wrong reason was written here first, and a world-check assertion caught it
within the hour.** It is recorded because it is the plausible wrong answer and
somebody will reach it again:

> *Wrong:* lowering `cell` changes `contentScale`, so the kittens would come out
> a different size on a phone.

They would not. Work `packMetrics` through and `contentScale` reduces to

```
contentScale = (1 - 2*pad) * tallest / max(tallest, widest)
```

in **every** branch — `cellPx` cancels out of all of them. That is the entire
purpose of the field, and `loadSpriteAtlas` says so in its own comment: a
character ends up the world height it asked for no matter how loosely the sheet
happened to pack. **Quad size is invariant under both knobs.** The check
`...even though the kitten would still be the same height` pins exactly this, so
the wrong reason cannot be reintroduced as a fix.

The **real** reason is what those two sheets are measured *for*. At `cell: 384`
both kitten sheets are floor-pinned, because `maxAtlas / cols` is far below the
floor:

```
cellPx = max(cell, min(ideal, maxAtlas / max(cols, rows)))
       = max(384, min(437, 2048/10))
       = max(384, 204)
       = 384          <- the floor wins, whatever maxAtlas is
```

so they repack **byte-for-byte unchanged**, and the sprite-direction checks
measure real cells out of them. Move `cell` and every number those checks assert
moves with it — that is a facing settled by reasoning instead of measurement,
which this project has got wrong roughly every time.

`maxAtlas` **cannot** do that, because it does not reach a floor-pinned sheet at
all. It bites exactly the oversized single-figure sheets and nothing a check
looks at. That is what makes it the knob.

**The critter sheets are exempt for a third reason:** `world-check` measures them
at exactly `cell: 256, maxAtlas: 768` to assert the rabbit you chase is still
exactly `size` tall. At 768 they are already under the reduced ceiling, so a
budget there would move an assertion without saving a pixel.

---

## Why the device test needs two signals

`profileFor` asks for a coarse primary pointer **and** a non-zero
`maxTouchPoints`, and the pairing is not belt-and-braces.

**Richard's own development machine reports `maxTouchPoints: 2` with
`coarse: false`** — it is a touchscreen desktop. A single `maxTouchPoints > 0`
test, which is the obvious version, would have put the machine the game is built
on into the mobile tier: antialiasing off, half-resolution dragons, and the game
starting at one kitten instead of two. The check `a touchscreen laptop is still a
desktop` exists because that was one plausible line of code away.

`profileFor` is **pure** so `world-check` can assert the tiers without a
browser, the same way `splitLayout` is pure. `detect()` is the only part that
reads `window`, and it reads four properties.

**The desktop tier returns exactly the values that were hard-coded in `main.js`
before this file existed** — two kittens, `auto` split, `medium` quality,
antialias on, `maxAtlas` 2048. That is what keeps the fifth invariant true: a
desktop cannot tell the difference.

`maxPixelRatio` on that tier is **4, not `Infinity`**, and finite on purpose.
`Infinity` means the same thing and does the same job right up until something
serialises it: `JSON.stringify` turns it into `null`, and `Math.min(dpr, q,
null)` is `0` — a black screen. Prefer a rule that degrades over one that
vanishes.

---

## One kitten: mostly already true

The party size is a variable, not an assumption, and the four-player pass did
most of this work already without anybody aiming at it:

- `_leavePlayer` **guards `partySize <= 1`**, so one player is the floor the code
  already stops at rather than a state it cannot represent.
- `splitLayout(1, ...)` returns a single full-screen view.
- `_buildHud` at `n = 1` builds one badge and one minimap.
- `arenaquest` asks `near.every(Boolean)` — "everyone is here" is satisfied by
  one kitten. Its own comment says *"EVERYONE, not both"*.
- `worldSpawnCount(1)` floors at `ORB_IDS.length`, so all eight orb kinds still
  exist in a solo world.
- The points share is already `/ Math.max(1, partySize)`.

**The one real hole is the tournament.** Every entry in `MODES` requires two
fighters or more (`players: [2]`, `[3, 4]`, `[4]`), so `modesFor(1)` is empty and
`begin()` falls through to `available[0] ?? MODES[0]` — a duel with one fighter,
one side, and a `wins` array of length 1. That is a round that cannot be lost,
which is worse than a round that cannot be started.

**Decided, and deliberately the cheap answer:** the arena stays shut for a solo
kitten and says so as an instruction — *"The ring is ready — but a tournament
needs TWO fighters! Bring a sister. Hand her a controller and press START."*
That keeps the third invariant (no combat outside the ring) and satisfies the
sixth (a refusal must say so, as an instruction and not a noun). An AI opponent
was the alternative and it is a whole feature: a fighting-game AI is not a small
thing, and it would put a combatant in the world, which has been rejected
repeatedly and on purpose.

**The refusal lives at the door, not in `begin`.** Shutting it in `begin` would
refuse her *after* the griffin had flown her north — a journey ending in nothing.
`near` is not even computed in the solo branch: there is no arrangement of one
kitten that opens it.

Solo still gets everything else — the world, the dragons, the six clans, the
panda, the seven stars, Ryuuseki and the whole endgame. Only the ring is shut.

### The trap this turned up: `partySize` and `input.slots`

They must always agree, and **they used to agree by accident** — both were the
literal `2`, so nothing ever had to assign `input.slots` and nothing did. The
moment the party came from the device that accident broke, and the symptom was
invisible on a desktop: a phone booted **one kitten with an input layer still
tracking two**, which dealt the arrow keys to a slot no player was sitting in
and made `joinHint()` report that nobody could join.

`input.js` is explicit that a slot past the party size must read *nothing* —
that is the rule `_assign` exists to keep, and the reason is the same one that
made a third kitten's controller state get driven by WASD. `Game`'s constructor
now assigns `input.slots` alongside `partySize`, and `pad-check` has a
`--- a party of one ---` block that pins it.

---

## The touch pad

`core/touchpad.js` produces **exactly what a gamepad profile's `read()`
produces**, so `InputManager` seats it in a player slot next to a Pro Controller
and nothing downstream learns a new word. `Player` cannot tell a thumb from a
Joy-Con — and the pad's stick goes through the same `dead()` curve as a real one,
because the response is a property of the game, not of the device.

**Pointer events, not touch events, and the reason is the mouse.** One path
delivers a finger, a mouse and a stylus, which is what makes the desktop test
mode work at all: dragging the stick with a mouse is not a special case, it is
the same code with `pointerType: 'mouse'`. `touch-action: none` in the CSS does
the scroll suppression, so there is no `preventDefault` on a passive listener to
get wrong.

**Touch is dealt FIRST, ahead of every controller** (`_devices`), and that
ordering is the whole point: on a phone the person holding the phone is player 1.
Pads deal from player 2 down, so a Bluetooth controller paired to the phone seats
a *second* kitten. Appending touch after the pads — the obvious version — would
have `_assign` fill slot 0 from the pad and take the screen out from under the
thumb already playing.

**A touch slot is not padless**, so it is not also handed WASD. On a tablet with
a keyboard attached that would give the girl holding the screen a second
invisible controller and take the arrows from her sister.

### Decisions that look like omissions

- **Sprint is a real button.** Auto-sprint on full stick deflection removes a
  button and feels natural right up until the ring: `ATTACKS.dash` fires on
  `sprint && moving`, so auto-sprint turns *every* moving attack into a dash
  attack. Sprint has to be something she chooses.
- **`map` and `math` have no buttons.** Eight actions do not fit under two
  thumbs, and those two are already drawn on screen — so the minimap cycles its
  own zoom when tapped and the sin/cos board toggles itself. A control that *is*
  the thing it controls needs no second copy.
- **The stick is drawn dimly at rest.** The first version faded it in only once a
  thumb had landed, which is tidy and assumes the player already knows the left
  half of the screen is a stick. She is nine. An invisible control is one she has
  to be told about, so there is a faint base where a left thumb falls; it
  brightens and jumps to wherever she actually touches.

### Three bugs this turned up, all invisible on a desktop

1. **The stick base was drawn 92px below the thumb.** `.tp-stick` is a child of
   `.tp-zone`, which is `position: absolute` — so it is the containing block and
   `left`/`top` resolve against *it*, not against the overlay. Offsets were being
   measured from the overlay. It was invisible in testing because the direction
   comes from `_origin` in client space: **the stick read perfectly while being
   drawn in the wrong place.** `_placeStick` is now the one function both callers
   use.
2. **The minimap could not be fixed in CSS.** `Game._drawMaps` sets `width`,
   `left` and `top` **inline**, so every `body.touch-ui .map-box { width: … }`
   rule was silently dead. Worse, it sized the map off the pane's *width* —
   `v.w * 0.42` is 354px of a 390px-tall phone. The cap had to become a third
   term in that same `Math.min`, derived from the pane's **height**, because a
   short pane is the case a width-derived size cannot see. It also moves to
   top-left on a touch device: both bottom corners belong to thumbs, and a
   smaller map in the wrong place is still in the wrong place.
3. **The test mode moved two kittens with one key.** `touchTestKeys` makes the pad
   read WASD as well as the screen; leaving WASD in the pool meant slot 0 read it
   *through* the pad while slot 1 read it *directly*, so pressing `W` walked both
   cats. Found by pressing `W` and watching it happen. The pad now owns keyset 0
   whenever the test flag is on, and only then.

## The mode toggle

Automatic detection is right on every real device. The two forced settings exist
because **the touch pad is written on a desktop**, and a control that can only be
exercised on hardware nobody is developing on gets looked at once a week.

The override is persisted, because the two heaviest things it decides —
`antialias` (a `WebGLRenderer` **constructor** option) and `atlasMax` — are read
once at boot. A test mode that did not survive a reload could only ever test half
of itself.

**So the switch is honest about being in two halves.** The pad appears or
disappears immediately, which is the half that matters for testing. The render
tier, the atlas budget and the party size cannot move under a running game, so
the note under the setting says a reload is needed and does not pretend
otherwise.

**A forced mobile tier is never the *weak* mobile tier.** `cores` is a phone
signal and the desktop being tested on has twenty of them — reading it under a
forced override would make "test as a phone" quietly exercise the faster tier on
the machine most likely to be checking the slower one.

**The rotate gate names the right action for the machine it is on.** It still
fires in test mode, or the one thing it does could never be checked before a kid
sees it — but *"turn your phone sideways"* in front of somebody holding a mouse
names an action they cannot take, which is the same failure as a refusal that
says nothing. On a desktop it asks for a wider window.

## Still true, and worth keeping in mind

- **iOS Safari supports neither orientation lock nor fullscreen on iPhone.** The
  rotate prompt is a prompt for that reason, and the PWA manifest
  (`display: fullscreen`, `orientation: landscape`) is the only real fix for the
  URL bar. Android honours both.
- **Do not append to `style.css` with PowerShell.** `Add-Content -Encoding utf8`
  over `Get-Content -Raw` double-encoded nine em dashes into `â€”`
  (`U+00E2 U+20AC U+201D`). Use the editing tools.

---

## The first real play session, and what it corrected

The game was played on a Galaxy S24 Ultra. **It did not drop a frame, and it
looked terrible.** Both halves of that sentence mattered.

### The resolution mistake, in one line of arithmetic

`_applyQuality` takes `Math.min(devicePixelRatio, quality.pixelRatio,
device.maxPixelRatio)`. The mobile tier set `maxPixelRatio: 1.5`, which reads as
generous, **and** `defaultQuality: low`, whose tier pins the ratio to 1. On a
3.0 panel:

```
Math.min(3.0, 1.0, 1.5) = 1.0
```

One third of the linear resolution, one ninth of the pixels. Add `atlasMax:
1024` — which halves both dragons, Ryuuseki and all six leaders, the art that is
drawn *biggest* — and `antialias: false`, and that is every "it looks low-res"
complaint from one conservative guess.

**Each cap looked reasonable on its own.** That is why `effectivePixelRatio` now
exists and why `world-check` asserts the **product** rather than the factors: a
check on `maxPixelRatio` alone would have passed throughout. `QUALITY` moved into
`device.js` to make that possible — the tiers are half of an arithmetic this file
owns the other half of, and restating them in a check is how the bug survived.

The capable tier now runs antialiased at up to 2.0 on a 3x panel with full-size
atlases; a four-core phone keeps the cautious answers. **The tier is a default,
not a floor** — Settings still turns it down, which is the fallback a struggling
phone needs and the reason raising it is safe.

### Text was soft for a different reason

`label.js` drew glyphs 1:1 into a canvas. `size` is an authored height, but the
quad it lands on is sized in **world units**, so how many screen pixels a label
covers depends on the camera. Standing next to a clan leader, the texture was
magnified well past 1:1. It is supersampled 3x now, with the mesh size and
`aspect` deliberately unchanged.

### Three input bugs

1. **Tapping the minimap dropped the thumbstick on it.** The overlay sits above
   the HUD and the stick catchment is the whole left half, so it claimed every
   pointer landing there. The passthrough needed *two* rules, not one: `#maps`
   was given `pointer-events: auto` while `.map-box` sets `none` on itself, so
   the map stayed invisible to `elementsFromPoint` and the first fix silently
   did nothing.
2. **Player 2 joining took WASD, and both kittens walked on one key.** `_assign`
   reserved the set while `_findJoin` did not — and a claim beats the dealer.
   Five callers had to agree and did not, so the rule is now one function
   (`_freeKeysets`) they all ask. **Touch owns WASD whenever the pad is up**, as
   design rather than as a test affordance: the girl holding the phone is player
   1, and her sister joins on the arrows.
3. **There was no way to reach the menu at all.** `start` was gated to
   `source === gamepad`, which is right for a keyboard — whose start key had to
   be freed to mean "join" — and wrong for a touch pad, which has a dedicated
   corner button that is nothing else. On a phone there is no Esc key, so
   settings, restart, the board and the profile were unreachable once the game
   began.

### Labels move, because a fixed label is wrong most of the time

`interact` is "join a clan" for about ten seconds of a playthrough and "go down"
for every minute on a dragon. A button reading CLAN in the air is one a kid
presses, drops off her dragon, and concludes is broken. `_updateTouchContext`
renames the cluster from what the buttons would actually do this frame; the
**glyphs** never move, because those are the pad letters and they are what keep
the HELP page and a real controller true.

### Double tap latches a hold

Two thumbs cannot hold three things. Sprinting while steering and slashing needs
the stick, RUN and SLASH at once, which is one thumb short — so sprinting was
something you could do *or* attack during, never both. A double tap latches;
another tap releases. **Only actions the game says are lockable**: the Ward is
offered only while the orb granting it is worn, and released the moment it
expires, because a button glowing over a dead ability is the control lying.

### Backgrounding the game is not a crash, and HTTPS will not fix it

Android reclaims the WebGL context of a backgrounded tab when it wants the
memory, and this game holds well over 100MB of texture. There was **no
`webglcontextlost` handler at all**, so the page had no way back and died
silently. It now says what happened and offers a reload rather than pretending
to recover — restoring every repacked CanvasTexture is real work, and doing it
badly gives white boxes where the kittens were.

**Installing as a PWA genuinely helps** (an installed app is a worse eviction
candidate than a tab) but it is a reduced likelihood, not a guarantee. Note the
tension: raising `atlasMax` back to 2048 for fidelity also raises the memory
pressure that causes this.

---

## The second play session: one crash and two reaches

The touch controls worked. Three things came back, and the first is the only one
that was a bug rather than a layout opinion.

### Flying to the Dojo killed the tab, and quality settings could not help

The symptom was specific and it is worth keeping: the maths UI appeared, the
frame rate collapsed for a few seconds, and then the tab died — **on the lowest
quality setting too**, which is the clue. Nothing that scales with quality was
involved.

`makeLabelTexture` caches world-space text by its string and **never evicts**,
which is correct: those textures are shared by reference across materials, so
freeing one to make room blanks whatever else still has it mapped. The cache
was built for text written once — axis numbers, clan names, the falling kana.

The Dojo rewrites five of those labels **every frame, from a float**. The worst
is the point readout, `( cos , sin )` at two decimal places: 201 x 201 reachable
strings, each one a fresh supersampled canvas.

Measured in the browser, walking one lap of the circle:

| | |
| --- | --- |
| new textures per lap (point readout alone) | **568** |
| size of one, at `size: 72` and `SS: 3` | 1092x411x4 = **1.71 MB** |
| retained per lap | **972 MB** |
| time to a lap at walking pace | about 10 seconds |

A phone has nowhere near a gigabyte to give, so it died in about four. On a
desktop it merely ate memory nobody was watching, which is why it survived
every session before a phone found it.

**The fix is a second kind of label.** `new Label(text, { live: '<widest
string>' })` allocates one canvas from the reserve string and repaints it in
place. Nothing is allocated after construction, nothing enters the cache, and —
this is the half that was costing frames before memory did — the material keeps
the **same texture object**, so `mat.needsUpdate` is never set and three.js
never re-resolves the shader program.

The reserve is the worst case spelled out (`( -0.00 , -0.00 )`), not a guess
with slack: reserve short and the text clips, which is the one failure mode a
live label has that a cached one does not. `world-check` asserts each reserve
against every string the Dojo actually printed over a full lap.

Two more places had the identical bug and were found by looking rather than by
crashing: the Kotodama orb's three readouts, and the power orb's `cos X  sin Y`
— the same combinatorial shape, on up to sixteen orbs at once.

**Two defences, because this is invisible until it is fatal.** `world-check`
counts canvas creations across a simulated lap and requires zero; and
`makeLabelTexture` warns once, naming the offending string, if the shared cache
ever passes 48 MB. Reverting the fix trips both.

#### And then it lagged on a desktop, because a leak had been traded for an upload

Worth recording in full, because the first fix was right about the cause and
wrong about the cost. Repainting in place removed the allocation and replaced it
with a **texture upload**, once per changed label per frame — and the naive
version repaints whenever the string differs, which while walking is every
frame. Measured with three orbs each and the Dojo on screen: **7.3 repaints a
frame across 33 MB of live canvas, roughly 10.4 MB re-uploaded every frame**.
That made the orbs and the Dojo island lag badly on a PC.

The worst part was not the orbs. `Game._tick` calls `dojo.update` **every frame,
unconditionally, wherever the party is standing** — and `_renderTitleIdle` calls
it on the title screen. So the Dojo's five readouts, 9.5 MB between them, were
being repainted and re-uploaded **from 244 units away on a different island**,
and the 1280x720 wave board was being redrawn thirty times a second to feed a
HUD element that is `display: none` unless somebody is standing in the Dojo.

Three changes, in order of what they were worth:

| | |
| --- | --- |
| `READ_R` gate — no text or board work unless somebody is within reading distance | removes 5 of the 7.3 repaints, everywhere in the game |
| `LIVE_MS` throttle — a live label repaints at most every 80 ms | 5x fewer of what is left |
| `LIVE_SS = 2` instead of 3 for live labels | 2.25x less data per upload |

Result, measured the same way: **10.4 MB per frame to 0.66 MB per frame, about
15x.** Live label memory went 32.8 MB to 14.6 MB with it.

**The gate covers text only, never geometry.** The lines, the arc and the label
*positions* are a few hundred bytes and still run every frame, so the diagram is
turning and correctly laid out the moment you fly in; it is only the words that
wait. `READ_R` is 170 rather than something tight because the Dojo camera frames
the diagram from 104 units back — a gate that did not comfortably clear the
camera's own framing distance would switch the text off while you were reading
it.

**`LIVE_SS = 2` is not a quality compromise, and that was checked rather than
assumed.** `SS = 3` buys headroom for magnification; a live label is
`fixedScreenSize` and `faceCamera` clamps that scale to 1.75, so it is the one
kind of label structurally prevented from being magnified much. Measured at the
Dojo's own framing, the live labels are still oversampled **3.5x to 6x** against
the pixels they actually cover.

**The throttle compares `_want` against `_text`, and the distinction is the
whole bug it avoids.** The obvious version returns early when the requested text
matches the last *painted* text — so the first frame the throttle drops, a label
that then stops changing never paints its final value and sits on a stale number
forever. `_want` is what the game asked for, `_text` is what is on the canvas,
and the repaint happens when they differ and the interval has passed. Callers
keep calling every frame with the same value when the player stands still, so
the last value always lands, within 80 ms.

That distinction also caught a weakened check: the reserve-width assertion
sampled `_text`, which under the throttle is a handful of values, so it had
quietly stopped testing the wide strings it exists to test. It reads `_want` now.

The same pass removed the arc geometry churn next door — the swept angle arc
disposed and rebuilt a `BufferGeometry` every frame because the arc grows with
theta. It is one buffer at full length now, shortened with `setDrawRange`.

### The face cluster is the stick's reflection, not a corner

The buttons were pinned to the bottom-right while the stick rests well above the
bottom edge and a good way in from the side, so the right thumb reached down and
out to somewhere the left thumb never went. `TouchPad._placeCluster` now centres
the cluster on the stick's resting centre reflected across the pad: **same
height, same inset, measured rather than restated.**

In JS rather than CSS percentages on purpose — the rest point is `STICK_REST_*`
of a zone that is itself a percentage of the pad, so a CSS mirror would restate
four numbers and stop being a mirror the moment `.tp-zone` was resized. The only
place the symmetry gives is `CLUSTER_EDGE`: the cluster is three buttons wide
and the stick is one circle, so on a narrow phone the exact reflection would
hang off the screen.

**And they grew about 40%.** A landscape phone is SHORT, which is what the
`max-height: 460px` breakpoint reacted to — but it is not SMALL, and shrinking
the controls on the biggest phones was backwards. One `--tp-unit` now sizes the
circle, the glyph and the gap together; they were separate literals, which is
how the breakpoint shrank the buttons from 60px to 50px and left the letters at
19px.

**An ordering bug fell out of making `setVisible` measure.** `_applyTouchMode`
showed the pad and *then* set `body.touch-ui` — so the cluster was measured at
the tablet size, placed for a box 184px tall, and shrank to 148 underneath its
own position. It sat 18px low with nothing on screen to say why. The class goes
on first now.

### The board took the middle of the screen, which is the lesson

The sin/cos board has now been in three places and the first two were both wrong
the same way: they were chosen to keep it clear of something *else* rather than
clear of the *player*.

Top-left stacked it under the minimap and both were unreadable. Bottom-centre is
clear of both thumbs and clear of the map — and is exactly where the kitten is
drawn. In the Dojo the camera pulls back and looks straight down at the circle,
so the middle of the screen **is** the lesson: the board hid the point moving
round the rim, which is the one thing she flew there to watch.

So the board takes top-left and the **map moves**, because on this island the
ranking is not ambiguous — the board is why the island exists and the map is a
glance. The map crosses to top-right (under the pause button, the last free
edge: both bottom corners are thumbs and top-centre is the scoreboard) and drops
to 24% of the pane, since the Dojo is a flat disc with nothing to navigate to.
