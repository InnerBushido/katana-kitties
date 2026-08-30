# The capture rig — filming the game to teach the game

Every animated picture in Help is **the game, playing itself, recorded**. No
screen recorder, no editing suite, no video file: a script drives the real game
through a scripted performance, grabs one frame per tick straight off the WebGL
back buffer, and hands the frames to `tools/gif.mjs` to encode. That is why the
clips can never lie about the game — there is nothing in the pipeline capable of
inventing a frame.

This directory is that rig, plus the eight shot scripts that have used it.

> **Why it is checked in.** It was not, for a long time. It lived in a temporary
> session directory and every session that wanted to film something started by
> recovering it from the last one's leftovers. The master frames — hundreds of
> megabytes of raw RGBA — die with the browser tab, so **the script is the only
> thing that can ever re-cut a clip**. Losing it means re-choreographing from
> scratch, not re-rendering. It is here now for the same reason `world-check` is
> here: the expensive part is not the artefact, it is the knowledge of how to
> make it again.

---

## What is here

| file | side | what it is |
| --- | --- | --- |
| `assetserver.mjs` | node | The bridge. Serves repo files to the page CORS-clean, takes POSTed frames, and calls `tools/gif.mjs` to encode. Port 7799. |
| `harness.js` | browser | `window.__cap`. Boots the game, synthesises input, teleports, pins the camera, and mirrors the WebGL canvas frame by frame. |
| `movekit.js` | browser | `window.__mk`. The shot kit: the drive loop, the drawn keyboard and controller panels, the palette, placement helpers. |
| `gifdec.mjs` / `gif-peek.mjs` | node | Read a finished GIF back — frame count, delays, and PNG dumps. Used to check a clip rather than trust it. |
| `shots/*.js` | browser | One file per clip. The choreography. |

The two node helpers next door do the rest: `tools/gif.mjs` encodes,
`tools/gif-sync.mjs` makes a pair of clips loop together.

---

## Filming something, start to finish

1. **Start the game and the bridge.**
   ```bash
   npm run dev
   ```
   ```bash
   node tools/capture/assetserver.mjs
   ```
   Open the game in the browser you are driving. Working files land in
   `tools/capture/.out` (git-ignored); set `KK_SCRATCH` to put them elsewhere.

2. **Inject the rig.** It survives nothing — re-inject after every reload:
   ```js
   for (const f of ['harness.js', 'movekit.js', 'shots/phone.js']) {
     eval(await (await fetch(`http://localhost:7799/file?p=tools/capture/${f}`)).text());
   }
   ```

3. **Run the shot.** Each `shots/*.js` ends by defining a `window.__<name>Shot`
   and an encoder. A shot takes minutes, and a browser eval call will time out
   long before it finishes — so kick it off and poll:
   ```js
   window.__S = 'running';
   __phoneShot().then((v) => (window.__S = v));
   ```

4. **Look at frames before you encode.** Every shot has a `__dump*` that writes
   PNGs. Encoding a bad take wastes minutes; reading six frames costs seconds.

5. **Encode.**
   ```js
   await window.__encodePh('phone', { w: 512 });
   ```

6. **Check it, then wire it in.** `world-check` asserts that every clip's markup
   states its real size, that it is under 2.5MB, and that paired clips loop
   together. Add the entry, run the checks, and re-read the sizes off the file —
   never off the shot script.

---

## Directing: what a clip has to do that a recording does not

A screen recording shows what happened. A Help clip has to **teach**, to a
nine-year-old, in one silent loop, with no narrator. Everything below was
learned by getting it wrong first and being told.

### Time is for reading, not for showing

**A caption needs longer on screen than the action under it.** Adults skim; a
child reads a caption word by word, and the action has usually finished before
she has. Every beat that carries text gets a second or two more than it needs.
This has been reported twice and is the single most common note.

**A pause is played, not frozen.** Holding one frame for two seconds does not
read as a pause — with nothing on screen to read it reads as the picture having
*broken*, and it was reported exactly that way. Let the game keep running at a
lower frame rate instead: a beat lingers at 11fps, and holds at most a couple of
hundred milliseconds of true freeze. The exception is a final frame that still
carries its caption, where the hold *is* the reading time.

**Beats, not a continuous take.** A clip is a list of `run(ms, plan, opts)`
calls, each with one caption and one thing to show. One idea per beat; a beat
that is doing two things is two beats.

### The camera

**Pin it, and pin the right one.** A pinned camera is not a style choice, it is
the byte budget — see below. But `Game._cameraFor` returns the *player's* camera
for a group of one and the *rig's* only for two or more, so a single-kitten shot
that pins `rigs[0].camera` pins a camera nothing draws. Pin every camera it
could return.

**Hand the shot back to the game where the game already directs.** The beat
where the star is picked up in `ryuuseki.js` is not pinned: it calls
`Game.starShot`, the swing-and-zoom a real player gets. A clip of a cinematic
moment should be the cinematic, not a re-staging of it.

**Aim at what you want in frame, not above it.** Raising a look-at target
*lowers* the subject. This cost a take.

**Motion across the frame is free.** At the game's yaw the screen-right vector
is `(cos −π/4, −sin −π/4)`; moving along it changes NDC x only — no depth, no
size, no height. Time your beats in world units against the frame's half-width
and the subject stays exactly as large as it started.

### Composition when something else owns the frame

The touch overlay owns everything below about half the height. So the aim point
goes on the deck and the subject lives in the empty top half. Work out what part
of the frame is *yours* before choosing a camera.

### Trigger off state, not off frame numbers

`if (i === 7) press('attack')` is a guess about how long a deceleration curve
takes. Ask the question instead — *is she pointed across the frame, and is there
room in front of her?* — with a frame-number fallback, because a beat that never
fires is a beat with nothing in it. Two shots have been re-taken over this.

### Measure the game, never reason about it

Every number in these scripts that could have been derived was measured off a
take instead: a locked sprint covers 1.03 units per capture frame; `charge.dist`
is 16 units and coasts one or two more. Reasoned numbers have been wrong roughly
every time — which is the house rule from `CLAUDE.md`, applied to choreography.

---

## Keeping a clip small

**Frame time is not the cost; frame CHANGE is.** `tools/gif.mjs` does interframe
differencing — a transparent index, a per-frame bounding box, disposal 1 — so a
frame that differs from its predecessor in a hundred pixels costs a hundred
pixels. A pinned camera where only a kitten moves costs a fraction of one that
flies:

| clip | camera | per frame |
| --- | --- | --- |
| `move-arena` | pinned | 2.3 KB |
| `move-keys` | pinned, two panels redrawn | 18.6 KB |
| a flying shot | moves the world past the lens | four times a pinned one |

**`dither: false` is required** or the diff finds noise everywhere and bites on
nothing.

**The palette is almost never the problem.** A clip that came out at 4.5MB moved
seven per cent when its palette was halved. That number is what says to split the
shot instead.

**Film big, publish small.** Shoot at 936 wide and encode at 512: about 3.3 real
pixels average into each output pixel, and *that* is the anti-aliasing. Encoding
one master at several sizes is cheap and the results are comparable. Re-shooting
is not — the subject lands on different frames and the diff finds different work.

**The 2.5MB cap** is asserted by `world-check`. The panel warms clips one after
another, so a fat one stalls every picture behind it.

---

## What cannot be filmed this way, and the way round it

`readPixels` reads the WebGL back buffer. **It cannot see a DOM overlay** — the
touch pad, the dealer's shop, the HUD are all invisible to it. (And
`drawImage(webglCanvas)` returns stale pixels, so that is not a way round it.)

Two answers exist. The old one is `shots/dealer.js`, which loaded **html2canvas**
to rasterise the shop; it works and it is the only third-party dependency this
project has ever pulled in, which makes it a rule-9 violation kept only as a
record. **Do not copy it.**

The one to copy is `shots/phone.js`. It redraws the overlay onto the captured
frame from the live DOM's own measurements: `getBoundingClientRect` and
`getComputedStyle` on every real element, including a `box-shadow` parser. It
invents nothing, so it cannot disagree with the game, and it needs no library.

### Three traps that cost takes, in that shot alone

**A CSS transition never advances inside a synchronous capture loop.** A
transition moves when the browser paints a frame, and a capture beat is one
synchronous loop with no rAF in it. `getComputedStyle` therefore returns the
value from *before* the change, for every frame of the beat, while a
MutationObserver shows the class going on and off correctly. Inject
`transition: none !important` for the take and remove it after.

**Gesture timing is wall-clock; a capture is not.** `performance.now()` runs at
real speed while a captured frame stands for 62.5ms of clip — roughly five times
faster than the clip. Two taps a second and a half apart on screen are a quarter
of a second apart in reality, and a double-tap detector pairs them. Put a *real*
sleep between beats; it costs nothing, because every frame is captured anyway.

**A hidden overlay measures zero.** `hideChrome()` must be followed by
un-hiding whatever you are about to measure.

---

## The shots

| file | clip | notes |
| --- | --- | --- |
| `move-keys.js` | `move-keys.gif` | On foot, keyboard. Draws the key panel. |
| `move-pad.js` | `move-pad.gif` | The same run on a pad. Draws the cat controller — `movekit.padGeom`/`padPanel`, and the source the Help page's SVG diagram is transcribed from. |
| `fight.js` | `move-arena.gif`, `move-air.gif` | Two kittens, both input panels on every frame. `__arenaShot` and `__airShot`. |
| `phone.js` | `phone.gif` | The touch overlay, redrawn from the DOM. Filmed at a real phone viewport (812×375) so `--tp-unit` is what a phone gets. |
| `ryuuseki.js` | `ryuuseki.gif` | Four fixed cameras and one the game directs. |
| `panda.js` | `panda.gif` | |
| `dojo.js` | `dojo-world.gif`, `dojo-sincos.gif` | |
| `dealer.js` | `dealer.gif` | **Uses html2canvas.** Kept as a record; see above. |

Five clips have no script: `ability-ward`, `ability-charge`, `ability-dive`,
`ability-cross` and `feast-eat` were filmed before this rig existed. They would
have to be re-choreographed.

---

## Related notes

- [docs/notes/help.md](../../docs/notes/help.md) — why each clip is shaped the
  way it is, per topic, and the full history of what was tried and rejected.
- `tools/gif.mjs` — the encoder. `tools/gif-selftest.mjs` reads its output back,
  because a codec bug presents as "the picture looks a bit off", never a crash.
- `tools/gif-sync.mjs` — makes two clips loop together by rewriting delays. Note
  the rule: it holds the shorter clip's **last frame**. It used to spread the
  difference over every frame, which stretched the whole clip and was caught by
  eye.
