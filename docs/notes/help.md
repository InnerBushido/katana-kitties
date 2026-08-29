# The Help panel, and the rig that films it

**Read this before you touch `#panel-help`, `Game._warmHelpClips`, `tools/gif.mjs`,
or anything in `public/help/`.**

Help was a wall of text. It is now twelve topics that mostly *show*: twelve
GIFs captured out of the running game, three stills, and the six clan leaders.
The panel is not the interesting part of this file — the rig that films it is,
because filming a live three.js canvas from a browser tab has two failure modes
that both look like "the capture is broken" and neither of which is.

---

## Why moving pictures at all

The audience is nine and younger. A paragraph explaining that you double-jump
by tapping the jump button twice is read by nobody in that audience; two seconds
of a kitten doing it is read by everybody. Every topic that describes a *verb*
now leads on a clip, and the topics that describe a *place* lead on a still.

**The clips are captured from the game, not drawn to look like it.** This is not
an aesthetic preference — it is what stops the panel lying. A hand-made
illustration of the ability timings would have been wrong within a session of
the next balance change and nothing would have noticed. A clip filmed by driving
the actual game means a change that breaks the behaviour also visibly breaks the
picture, and `world-check` pins the rest.

---

## The capture rig — `tools/gif.mjs`

A dependency-free GIF encoder, sitting next to `tools/png.mjs` and written for
the same reason: rule 9 says no asset pipeline, and adding a node module to
produce the game's own imagery is exactly the dependency that rule exists to
refuse.

It does **interframe differencing**: a reserved transparent palette index, a
per-frame bounding box around the changed pixels, and disposal method 1. This
one fact governs every decision below, so it is worth stating plainly:

> **A clip filmed on a pinned camera costs a fraction of one that flies.** If
> the background does not move, it encodes as nothing at all. If the camera
> pans, every pixel is new every frame and the encoder has nothing to throw
> away.

`tools/gif-selftest.mjs` renders known patterns through the encoder and reads
them back out. It exists because a codec bug does not present as a crash — it
presents as "the picture looks a bit off", which is the class of thing nobody
ever chases down.

### The two things that had to be solved to film the game at all

**1. A hidden tab throttles rAF, and `setAnimationLoop` IS rAF.** three.js's
render loop is a `requestAnimationFrame` loop wearing a different name, so the
moment the capturing tab loses focus the world runs at a crawl and the capture
comes out as a slideshow of the same three frames. The rig takes the loop away
entirely — `renderer.setAnimationLoop(null)` — and steps the world by hand at a
fixed timestep, stubbing `clock.getDelta` so the game cannot tell. A capture is
then deterministic and does not care whether anyone is looking at the tab.

**2. `drawImage(webglCanvas)` returns stale pixels.** The read is gated on the
compositor, so what comes back is whatever was last presented, not what was just
drawn — which produces a clip that is subtly one frame behind itself, or, on a
backgrounded tab, not behind itself at all but simply frozen. `gl.readPixels`
off the backbuffer is not gated, so that is what the rig reads, with the Y-flip
that implies. **Do not "simplify" this back to `drawImage`.** It works on the
machine you test it on, for as long as the tab is fronted.

### What cannot be filmed this way

**DOM overlays.** The dealer's shop and the HUD are HTML on top of the canvas,
and `readPixels` sees the canvas only. A clip that needs one of those has to be
composited by hand into the frame — which is what the drawn controller in the
pad clip is, and why it is drawn rather than screen-grabbed.

---

## Deferral: seventeen megabytes that are never on the boot path

`public/help/` is about 17MB and `public/` is copied into `dist` wholesale.
None of it may be fetched by a kid who is playing.

So a help clip carries **`data-help-gif` and no `src` at all.** Not
`loading="lazy"` — lazy still leaves the decision to the browser's heuristics,
and some browsers happily preload the lot the moment a `display:none` panel is
parsed. No `src` means no request, with no heuristic involved.

`Game._warmHelpClips` ([src/main.js](../../src/main.js)) fills them in on the
**first Help open**, and never before:

- **One at a time, in document order**, each starting only once the last has
  landed. One slow file cannot stall the rest, and the connection is never hit
  with every large file at once.
- **Opening a topic jumps its own images to the front**, so a section a kid goes
  straight to does not sit blank waiting for the ones above it.
- **A load error advances the queue.** A missing file must degrade to a gap, not
  to a panel that never finishes loading.
- **Stills are on the same queue.** They carry `src` + `loading="lazy"` and get
  flipped to `eager`. They used to lag a section-open behind the clips because
  only the clips were queued.

`world-check` asserts that every clip is deferred and that **no file in
`public/help/` is unreferenced** — an orphan is invisible on the page, which is
the only place anyone looks, and `town.jpg` sat there for exactly that reason
after the two captured clips replaced it.

---

## "Moving & fighting" is two clips, and the reason is the encoder

It leads on a keyboard clip and a controller clip **side by side**, not one
merged clip. That reads as a design decision about teaching. It is not; it is
the differencing rule above, cashed out:

The on-foot beats film on a pinned camera and compress beautifully. A single
clip that also carried the flying beats came out at **4.5MB** — more than twice
anything else in the panel — because a dragon scrolls the entire world past the
lens. **Halving the palette moved it seven per cent**, and that number is the
whole argument: the palette was never the problem, the motion was.

So: one clip per kind of controller, both filmed on a pinned camera, and
`world-check` caps each at **2.5MB** specifically to stop a future session
quietly merging them again and rediscovering this.

The markup's `width`/`height` for each clip is **measured off the GIF header**
by the check, not copied from the shot script. A wrong pair reflows the whole
topic the instant the image lands, which on a slow connection is a panel that
jumps under a nine-year-old's finger mid-tap.

### The drawn controller

The pad in the corner of the controller clip is **drawn from scratch every
frame** — rule 9, and also the DOM-overlay limit above. It is a DualShock
silhouette with a cat's face on it, which is where four rejected attempts
landed; the kids' verdict on the plain ones was that they looked dumb.

Two things about it are load-bearing rather than decorative:

- **Its eyes are painted on and are NOT the sticks.** Making the sticks the eyes
  was tried and is genuinely unsettling to look at. The sticks sit lower, clear
  of the muzzle, and every other control kept its DualShock-relative position.
- **The shell fill must stay opaque.** It was `rgba(...,.94)` and the outlines
  of pieces drawn underneath bled through the head as scars. The outlining trick
  the pad uses — stroke every subpath at double width, then fill each, so
  neighbours' fills cover the internal seams — requires an opaque fill to work
  at all.

Glyph sizes are **measured**, not chosen: `measureText().actualBoundingBoxAscent`
/`Descent` normalise the ink height so `□` matches `○ △ ✕`, and centre each on
its ink rather than its em box. Reasoned numbers were wrong every time, as usual.

`PROMPTS` in [core/input.js](../../src/core/input.js) is **exported** so the pad
reads the same table the game prints over a kitten's head. Hand-typed glyphs
would have gone stale the first time that table moved — and the `✕ □ ○ △`
lettering in it is *itself* the fix for a pad that had been telling a kid to
press a button its face does not have. The section repeats it in prose, because
the panel names one pad and the game supports three.

---

## The dragon clip: four fixed cameras, one the game directs

"Dragon balls & Ryuuseki" was the last topic describing a run of *verbs* over a
single still: walk into a star, hold it up, the sky goes out, a dragon rises,
two of you climb on and one of you fires seven beams. The still showed none of
it, so it is a clip now and `ryuuseki.jpg` is deleted — same argument as
`town.jpg`.

It is filmed through the game: the star is collected by walking into it, so the
pickup, the hold-aloft pose and the star's own face over her head all come out
of `_updateBalls`; the dark is `SummonScene.duskWant` driven to `DUSK_DEEP`,
falling at the game's own `DUSK_FALL`; and the seats, the beams and the flight
are `Digit8`, `Digit9` and the pilot's key. `Digit7` hands over the other six
stars, which is exactly what that key is for.

**Trap 1: `setFocus` aims a camera that is not drawing.** The first take
drifted, and every attempt to pin it with `Player.setFocus` did nothing —
because when the kittens are close together `_updateSplit` merges them onto
`rigs[0]`, whose target is built from the group centroid and never reads
`p.focus`. main.js already says this three times in its own comments (Ryuuseki's
framing, the star shot, the grotto pitch); this is the fourth. The fix is to
place the camera inside `_render`, which runs *after* `_updateSplit` — and which
is also where `_aimXray` and `_faceAll` read it, so the billboards still turn to
face a camera put there.

**Trap 2: resetting the world is not resetting the players.** The shot script's
between-takes reset put the seven stars back and deleted the dragon but left
`p.mount` pointing at him. Ember therefore filmed the whole thing from the
*flight* camera, fifteen units off the ground, and collected the star from seven
units away — because a mounted player gets `PICKUP_RADIUS + 4`. Nothing looked
broken. A reset has to dismount.

**Framing comes off `ridersMidpoint()`, not off `R.position`.** His position is
his centre and the seats are draw offsets up on his neck, so a shot centred on
the dragon puts the two kittens in the top-right corner with their heads out of
frame — which is the half of the beat that exists to be looked at.
`_updateCamera` makes the same point for the same reason.

### One beat is not pinned, and it is the one the game already directs

Taking a star fires `Game.starShot`: the shared camera swings onto the finder
and pulls in to fifteen units over two seconds while she stands there holding it
up. That is a shot the game plays for a real player, and it is the one moment in
this sequence a child has already seen. Pinning a camera over it would have been
showing her something the game does not do — so the pin is **dropped on the
frame the star is taken** and taken back after, and that beat is filmed slower
because the whole frame is moving.

It is dropped inside the walk beat's per-frame hook rather than at the beat
boundary after it. `starShot` starts on the frame `take()` runs and lasts
`STAR_POSE` whether or not anyone is filming, so waiting for the next beat spent
half the shot behind a pinned camera and cut in halfway through the swing.

**The toast is painted onto the frame**, because it is DOM and `readPixels` sees
the canvas only — the same limit as the dealer's shop and the HUD, and the same
answer as the drawn controller in the pad clip. Two things keep it honest: the
**words are read off the live toast element** at the moment it appears, so the
clip says whatever the game said and a change to that string changes the clip
rather than making it a lie; and the shape is `.toast` from `style.css` scaled
up, because a kid watching a 512-wide clip cannot read the HUD at its true size
and the whole point of putting it there is that she reads it. Bangers is already
loaded for the page, so it is already loaded for the canvas. The tracking is
applied by drawing a glyph at a time — canvas has no `letter-spacing`.

### Filming once and encoding many times

The capture is the expensive, unrepeatable half; the encode is cheap and pure.
So this clip is filmed at **768x432** into an in-page master and the encoder
scales and thins it on the way out, which means the size/quality trade can be
re-decided without another take *and* every candidate is comparable, because they
all come off the same one. Two levers, because these are the two that were
measured: **resolution**, and **how many frames there are**. `every: 2` keeps one
frame in two and hands the dropped frame's delay to the one it kept, so the clip
runs the same length in seconds at half the price. The palette is not a lever and
never was — see the seven-per-cent paragraph above.

**Where the bytes actually go**, measured off this take: two beats out of nine
are full price and they are most of the file. The star shot moves the whole
camera, and the sky going out repaints every pixel; the encoder's differencing
saves nothing on either. Between them they are about a quarter of the frames and
about three quarters of the bytes. Everything else is a pinned camera with a
kitten in it and costs almost nothing.

So the frame rate is spent where it shows. The walk, the beam fan and the
fly-past keep 18fps — those are what a child reads as "this is the game". The
two expensive beats and every idle one are filmed slower, through
`run(ms, plan, hold, fps)`'s last argument: **6fps for the sky going out** (a
smooth full-screen gradient looks identical and costs a third), **12fps for the
star shot and every lingering beat**. Cutting 217 frames to 193 that way took
about 15% off the file and nothing off the picture.

What it actually measured, on this shot, at full frame rate:

| cut | size | frames | bytes |
| --- | --- | --- | --- |
| before the trim | 576x324 | 217 | 2.62MB — over the cap |
| before the trim | 512x288 | 217 | 2.11MB |
| **shipped** | **512x288** | **193** | **1.83MB** |

512 is where `move-keys` and `move-pad` already are, so it is a width the panel
uses rather than a retreat, and 1.83MB sits under both of them. Raising it is a
deliberate decision, not a default: at 576 this clip becomes the largest file in
`public/help/` and every picture queued behind it waits.

**The dusk fall itself is NOT sped up.** It runs at the game's own `DUSK_FALL` —
2.75 seconds to reach `DUSK_DEEP`. Showing the sky going out faster than it goes
out was the easy saving and the dishonest one; dropping the frame rate over the
true duration costs the same and lies about nothing.

### A pause is played, not frozen

The first cut bought its pauses the cheap way: one frame carrying a 1.4-second
GIF delay, which costs nothing at all to store. Richard watched it and said the
clip looked like it was glitching. He is right, and the reason is that **there is
nothing on screen to read**. A held frame only reads as a pause when the eye has
been given a job — a caption, a number, an arrow. With nothing to do, a still
frame reads as the picture having stopped.

So a beat lingers by **running the game**, at 12fps, and what is left of the old
hold is a fifth of it: a couple of hundred milliseconds on the last frame, enough
to punctuate a cut. A kitten standing still is cheap to encode on a pinned
camera, and a kitten standing still is also visibly alive — she breathes, petals
drift past, the dragon undulates. That is what makes it read as a pause instead
of a stall, and it is the reason a played pause is affordable while a panning one
is not.

**The last beat has no linger at all.** The clip ends mid-flight with the beams
firing and loops straight back to the star, so the one place a frozen tail would
be most visible is the one place there is nothing to freeze. Letting him coast
instead was tried: he barely decelerates — about 32 units a second with the key
up — and a second of coasting takes him off the frame.

---

## The phone clip: filming an overlay the camera cannot see

`phone.gif` is the odd one out. Every other clip films the **world**; this one
has to film the **controls**, and the controls are DOM — `#touch-pad` sits on
top of the canvas and `readPixels` off the backbuffer cannot see a single pixel
of it. (That is the same wall the dealer shop hit, in *What cannot be filmed
this way*.) The dealer shop was dropped over it. This topic could not be: the
buttons are drawn on the same glass the Help panel is covering, so a child has
no way to look down at them, and three paragraphs of prose had taught the
double-tap lock to precisely nobody.

**So the overlay is redrawn, from its own measurements.** Every captured frame
walks the live `.tp-btn`, `.tp-stick` and `.tp-knob` elements, reads
`getBoundingClientRect()` and `getComputedStyle()` off each one — background,
border, colour, opacity, font, letter-spacing, and a `box-shadow` parser that
splits on commas *outside* `rgb()` — and paints that onto the captured frame.
Nothing about the pad's geometry or palette is written down in the shot script.
This is the house rule about measuring rather than reasoning, applied to a
diagram: a hand-drawn pad would have looked fine and been a lie the first time
anyone moved a button.

**Filmed at a real phone viewport, 812×375.** That is not cosmetic either —
`@media (max-height: 460px)` is what puts `--tp-unit` at 68px, and
`TouchPad._placeCluster` measures the geometry it is given. Film it at desktop
size and you get a correct picture of a pad no phone has ever shown.

Getting into phone mode is a **mutation, not a reload**: `g.device.touchPrimary
= true; g.device.padOn = true; g._applyTouchMode()`. `writeOverride('mobile')`
plus a reload would take the capture harness with it, and the fields a reload
would additionally set (antialias, atlas budget) are not in the picture.
`hideChrome()` then has to be followed by un-hiding `#touch-pad` by hand —
a `display: none` overlay measures zero on every rect, so the replica draws
nothing and the frame looks like the pad was never there.

### The thumbs, and why they are rings

Nothing in the DOM says where the hand is, and without a thumb drawn on it a
button that lights looks like the game pressing itself. The first pass drew a
filled disc the size of the button and it covered the glyph and most of the word
— the frame said a thumb was *somewhere* without saying on *what*. It is a ring
now: fingertip-sized (r = 25 CSS px), a faint 0.13 fill, a bright ring and a
dark hairline, so SHIELD reads straight through it.

The whole clip turns on this: **a thumb that lifts off a button which stays
gold** is the entire lesson of the lock, and it cannot be told in a sentence a
nine-year-old will finish.

### Three traps, in the order they cost takes

**A CSS transition never advances inside a synchronous capture loop.** `.tp-btn`
carries `transition: transform .09s, box-shadow .09s, background .09s` — right
on a phone, fatal here. `getComputedStyle` during a transition returns the
*interpolated* value, and a transition only moves when the browser gets a frame;
a capture beat is one synchronous loop with no rAF anywhere in it. So the ease's
clock never ticked, every frame of the beat read the colours the button had
*before* the press, and the gold on a latched RUN was never drawn once — while a
MutationObserver on the same element showed `.locked` going on and coming off
exactly when it should. The state was right and the picture was of the frame
before it. Fixed by injecting a capture-only
`#touch-pad .tp-btn, .tp-stick, .tp-knob { transition: none !important }`,
removed at teardown: a capture artefact, not an opinion about how the game
should feel.

**The double-tap window is wall-clock, and a capture does not run at wall-clock
speed.** `TouchPad._down` and `PadState._stamp` both measure with
`performance.now()`. A captured frame costs 11–34 ms of real time and stands for
62.5 ms of clip, so two taps a second and a half apart *on screen* are a quarter
of a second apart *in reality* — and the pad reads them as one double tap. The
take came back with RUN un-latching itself, because the hold in one beat and the
first tap of the next had paired up. The fix is a **real** `sleep(420)` between
beats: it costs nothing in the clip, since every frame is captured anyway, and
what it restores is the gap a thumb would actually have left.

**The camera pin landed on a camera nothing drew.** This one cost four takes.

```js
_cameraFor(members) {
  if (members.length === 1) return this.players[members[0]].camera;
  return this.rigs[members[0]].camera;
}
```

A group of **one** renders through the *player's* camera; only two or more go
through the rig. Both other shot scripts film two kittens, so pinning
`rigs[0].camera` had always been enough and the rule had never been noticed.
This clip is one kitten, so the follow camera drew every frame while every probe
reported the pin in place — the pinned camera really was pinned, it just was not
the one drawing. It read as the arena sliding about under her, which sent the
hunt to `openArena` and the island meshes. **Pin every camera `_cameraFor` could
return.** It costs a handful of `lookAt`s and cannot be wrong whichever branch
the grouping takes.

### Composition, when the bottom half is not yours

The overlay owns everything below about 52% of the frame: the button cluster
runs 196–329 of 375, the stick 218–310. So the aim point goes on the **deck**
(`ring.y + 0.5`) and the kitten lives in the empty top half. The first attempt
did the opposite — lifted the look-at to `ring.y + 6.2` to "get her up the
frame", which of course *lowered* her, and parked her behind the JUMP button. A
camera looks at what you aim it at.

Horizontal motion is free: at the game's yaw the screen-right vector is
`R = (cos −π/4, −sin −π/4)` = (0.707, 0.707), so moving along `R` changes NDC x
only — no depth, no size, no height. At `dist: 20` the frame holds about ten
world units either side of centre, which is the number every beat is timed
against. Measured, not derived: **a locked sprint covers 1.03 units per capture
frame**, and `power.charge.dist` is a flat 16 with a unit or two of coast, so
the charge alone needs eighteen units of frame and has to start from the far
left.

The charge is fired **off state, not off a frame number** — is she pointed
across the frame, and is there room in front of her — with a frame-number
fallback, because a beat that never fires is a beat with nothing in it. The take
that pressed on a fixed frame caught her still skidding out of the turn and
threw the charge into the corner she came from.

### What the clip found

Filming the lock found a real bug in the game, which is the second time a Help
clip has done that. A latched SHIELD **did not look latched**:
`_updateTouchContext` runs before the player controller, and the old
`if (p.wardCool > 0 || !p.power?.ward) release('mount')` fired on the exact frame
of the second tap — the release between the two taps had charged the cooldown —
deleting the `.locked` the pointer handler had just set, after which
`_latchWard` zeroed the cooldown and nothing ever put it back. The shield stayed
up with nothing touching the glass and the button looked untouched.

The rule is now `wardLatchExpired` in
[core/touchpad.js](../../src/core/touchpad.js) — a pure function, and that is
not tidying. It has been got wrong **twice**, both times by testing something
that is momentarily true on the frame the gesture is still being made, which is
the one frame no amount of playing reproduces on demand. As a pure function
`pad-check` can write that frame down and put it through.

---

## The panel on a controller

Help is a **menu of topics** now, not a wall of text with one BACK button at the
bottom, so it navigates like one:

- `summary.help-topic` joined `MenuNav.items`'s selector. Nothing else in the
  game uses a `<summary>`, so this widens the net for one panel only, and
  `_activate` clicking a summary is exactly how a `<details>` toggles.
- `data-nav-start="first"` on the panel opens the cursor on the **top topic**
  rather than on BACK. Settings opens on BACK deliberately; Help opening there
  meant landing past everything the page exists to say — the same bug that
  `input.md` records for the old scrolling version.

---

## Gotchas paid for in this work

**`dragon.home` is mutable.** There are three positions on a dragon and only one
is stable. `position` is this frame; **`home` is rewritten on every dismount** by
`perchHere` ([entities/dragon.js](../../src/entities/dragon.js)), so it means
"wherever a rider last got off"; `perch` is written at construction and never
again. A shot script that picked the nearest dragon by `home` kept selecting one
97 units away while a live probe said 6. **Select on `perch` and call
`returnHome()`** — which does `home.copy(perch)` — before filming anything that
involves a dragon.

**`javascript_tool` times out at 30 seconds** and encoding 90 frames does not
fit. Kick the encode off with `.then(r => window.__enc = r)` and poll for the
result in a later call.

**Two clan mottos were on the wrong clans**, found while writing the Clans
topic: Thunderpaw's buff is `speed` and Windwhisker's is `breath`, but
Thunderpaw claimed "loudest paws in the sky" and Windwhisker claimed "fastest
kittens on any island". Swapped. Nothing read them before the Help page did,
which is a small argument for documentation as a test.

---

## What is not done

Every clip this file once listed as missing now exists. What is left is a
decision and a complaint, neither of which is a clip.

- **The shot scripts are not in the repo, and that means no clip is
  reproducible.** The master frames are hundreds of megabytes of raw RGBA in a
  browser tab and die with it; the only thing that could ever re-cut a clip is
  the script that drove it, and those live in a session scratchpad that gets
  swept. **The script that filmed `move-keys.gif` and `move-pad.gif` is already
  gone** — those two would have to be re-choreographed, not re-rendered. Note
  which way it cuts before deciding: re-*encoding* one master at several sizes
  is cheap and the results are comparable (`move-air.gif` was encoded four times
  off one take), while re-*shooting* is not — the kitten lands on different
  frames and the interframe diff finds different work. Filming at 936 and
  publishing at 512 is right and should stay; the argument is only about where
  `phone-shot.js` and its two hundred lines of hard-won comments should live.
  Against: ~1500 lines of dev-only tooling that never ships and can only be run
  through a browser MCP, not from a terminal.
- **The touch overlay's glyphs name buttons no phone has.** `Y / ZR / X / A / B`
  are drawn on a touchscreen where nothing is labelled anything. This is the
  same complaint that was already made about `ZL`/`ZR` in the keymap table, and
  it is a **game** change rather than a Help one — it needs its own pass and
  `pad-check` updates, so it has deliberately not been done here.
