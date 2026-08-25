# The Help panel, and the rig that films it

**Read this before you touch `#panel-help`, `Game._warmHelpClips`, `tools/gif.mjs`,
or anything in `public/help/`.**

Help was a wall of text. It is now twelve topics that mostly *show*: eleven
GIFs captured out of the running game, four stills, and the six clan leaders.
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

- **"On a phone"** is written but has no clip. It needs the touch overlay shown:
  moving, jumping, sprinting, slashing; **holding** sprint and **holding** Ride
  for Ward; and the double-tap **lock-on** for both — with Charge used to show
  what a locked sprint is for. The Ward and Sprint demonstrations belong **in
  the arena**. See `TOUCH_BUTTONS` and the `_locked` set in
  [core/touchpad.js](../../src/core/touchpad.js), and `setLockable` in
  `main.js`.
- **An arena clip** — sprint, a slash landing on another player, both players
  jumping, on two input types.
- **An "on a dragon" controller clip.** The beats already exist behind
  `part: 'air'` in the shot script; see the 4.5MB paragraph above before
  deciding where it goes.
- **A Dragon Balls & Ryuuseki clip** — that topic still leads on a still.
