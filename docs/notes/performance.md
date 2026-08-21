# The frame budget

*Design notes. This is the WHY behind code that already exists — read it when
you are about to change something in this area, not before. Current state and
open work live in [HANDOFF.md](../../HANDOFF.md); the always-on summary is
[CLAUDE.md](../../CLAUDE.md). What a phone specifically may spend is in
[mobile.md](mobile.md).*

---

## The one sentence

**This game is fill-bound.** Frame time is a straight line in the number of
pixels in the drawing buffer, with the CPU flat underneath it. Nothing else in
the frame is within an order of magnitude of that, and every performance
question about a desktop has turned out to be a question about how many pixels
the window is.

Measured on an Intel UHD 630-class integrated GPU, same scene, same 600 draw
calls and 287,776 triangles, only the buffer moving:

| buffer | frame | fps |
| --- | --- | --- |
| 0.20 Mpx | 6.1 ms | 164 |
| 0.36 Mpx | 6.1 ms | 164 |
| 0.82 Mpx | 8.4 ms | 119 |
| 1.45 Mpx | 11.6 ms | 86 |
| 2.27 Mpx | 15.7 ms | 64 |
| 3.27 Mpx | 22.9 ms | 44 |

The first two rows are the same because the browser caps at ~164fps there; from
0.8 Mpx up it is linear at roughly 5.7 ns per pixel. **A 1080p window is 2.07
Mpx and a 1440p one is 3.7 Mpx**, so the same game on the same machine is a
comfortable 60 in a window and half that fullscreen — which is the entire
content of most "it lags now" reports.

---

## Two different complaints: slow, and uneven

**"It lags" is two bugs and they have opposite fixes.** Everything above this
line is about SPEED — how long a frame takes. The other one is PACING, and the
frame rate counter cannot see it at all:

> *"Not a hitch problem, but a stutter problem. Stutter is like lag, but more
> persistent. Since FPS stays the same when it happens, it is not really a
> hitch but a stutter."*

That is exactly right and it is worth being precise about, because the readout
originally measured the wrong one:

| | what it is | what sees it |
| --- | --- | --- |
| **slow** | every frame takes too long | the median. fps |
| **hitch** | one frame in a while takes far too long | the worst frame; a count over a threshold |
| **stutter** | frames are quick but arrive UNEVENLY | jitter: mean `\|dt(n) − dt(n−1)\|` |

Frames alternating 12/21/12/21 ms give a 60 fps median, a 21 ms worst, and
**zero** frames over any sane hitch threshold — a perfectly healthy readout for
a game that is grinding every second you watch it. A threshold count is
structurally incapable of seeing stutter, which is why `hitches` was replaced by
`stutter` in the `P` panel.

### What was actually stuttering: the live labels' canvases

The Dojo's five readouts and the Kotodama Orb's three are *live labels* — one
canvas each, repainted in place and re-uploaded, throttled to one repaint per
80 ms (`LIVE_MS`). By default a 2D canvas is **GPU-backed**, so `needsUpdate`
makes three.js call `texImage2D` from a live GPU surface, and on Windows under
Firefox/ANGLE that has to sync the pipeline to read it back. The average cost is
nothing. The pacing cost is the entire problem, and it lands every 80 ms on a
beat with no relationship to vsync.

The fix is one flag — `getContext('2d', { willReadFrequently: true })` — whose
name is about `getImageData` but whose actual effect is to ask for a **CPU-backed
surface**, so there is nothing to sync. Measured in the Dojo with all five
readouts churning at the rate walking produces, flipping the flag back and forth
on the same labels at a matched ~234 repaints per window:

| backing | median | worst | jitter | % of median |
| --- | --- | --- | --- | --- |
| GPU (default) | 10.8 ms | 42.5 ms | 12.61 ms | 117% |
| CPU (`willReadFrequently`) | 10.6 ms | 22.0 ms | 3.77 ms | 36% |
| GPU (default) | 10.9 ms | 47.2 ms | 14.53 ms | 133% |
| CPU (`willReadFrequently`) | 11.2 ms | 20.4 ms | 3.58 ms | 32% |

**The median is the same in all four rows.** 91 fps either way. That is why this
survived so long: every number anyone was looking at said the game was fine.

Two things worth knowing before you re-measure this:

- **A label only pays it while it is being DRAWN.** three.js uploads when the
  texture is next bound, so an off-screen label repaints for free. Measuring
  from the title screen — where the Dojo's labels exist, are `visible`, and are
  outside the frustum — shows no difference whatsoever, and is a very easy way
  to conclude the flag does nothing.
- **Match the repaint rate between runs.** An early A/B looked like a 10× win
  and was really a 6× difference in how many repaints each run did.

The flag is deliberately **not** applied to static labels: it software-rasterises
the drawing, which is the wrong side of the trade for a canvas painted once and
uploaded once. `world-check` asserts both halves of that.

### The other clock, measured and left alone

`dt` comes from `Clock.getDelta()` read at callback entry, which is a noisier
clock than the timestamp `requestAnimationFrame` hands in — in the bad state,
entry-clock jitter ran 17.0 ms against the presentation interval's 12.9. Driving
`dt` from the rAF timestamp instead is a real and standard improvement. It was
not taken, because once the upload stall was gone the two clocks measured the
same (1.6 vs 1.5 ms) and there was nothing left to win. If a machine is still
GPU-bound — an unfixed adapter, say — this is the next lever, and it is about
five lines in `_tick`.

---

## What is NOT the cause, with the numbers

This section exists because two innocent things have already been accused, and
the accusation is reasonable both times — they are the visible, moving, recently
touched parts of the frame. They are not where the time goes.

**The drifting petals cost nothing measurable.** 700 instanced quads, one draw
call. Hiding all of them at 1.45 Mpx changed the frame time by less than the
noise (11.6 ms either way) and removed 2 draw calls of 600. The comment in
`World._buildPetals` that calls them "~free" is accurate.

**Shadows cost about 9%.** Turning the shadow map off at 1.45 Mpx: 11.6 ms →
10.6 ms, and 600 draw calls → 478. Real, and an order of magnitude below the
buffer size. This is what `low` used to buy on its own, and it is why `low` used
to feel like it did nothing.

**The maths overlay and the live labels cost almost nothing.** A `live` label
repaint measures **0.068 ms**, they are throttled to one repaint per 80 ms each
(`LIVE_MS` in `core/label.js`), and in ordinary play the whole game runs about
25 of them a second. The Dojo's five readouts are gated by `READ_R` so they do
not repaint from another island at all. Everything the mobile pass did here —
`live` labels, preallocated arc buffers, `setDrawRange`, the `READ_R` gate — is
strictly LESS work than what it replaced, on a phone and on a desktop alike.
It has been checked against the pre-pass build: identical scene, identical 600
draw calls, identical 287,776 triangles.

**The whole of the per-frame JavaScript is under a millisecond.** Every system
timed individually in play, per frame:

```
player.update  0.091   input        0.067   updateSplit  0.027
dragon.update  0.043   menuNav      0.031   drawMaps     0.028
world.update   0.140   kotodama     0.027   everything else < 0.015
```

against 2.0 ms of `renderer.render` at 0.36 Mpx and 15.7 ms at 2.27 Mpx. **If a
number in this file is ever wrong, re-measure before reasoning** — that is what
`P` is for.

---

## `P` — the frame cost on screen

`P` in play (or its row in the debug panel) toggles a readout in the top-left.
It exists because "it lags" is not a measurement, and a report from a machine
nobody here can see used to leave two moves: guess at a recent change, or ask a
player to open a devtools profiler. The first is how a session gets spent
reverting work that was never the cause.

Seven lines, chosen so one look SEPARATES the causes rather than confirming a
suspicion:

- **fps / ms / worst / stutter** — the complaint as a number, plus the long
  frame the median hides, plus whether the frames arrive EVENLY. A bad median is
  a budget problem; a good median with an ugly worst is a stall; a good median
  with high stutter is the thing described below, and they are three different
  bugs. `stutter` is mean `|dt(n) − dt(n−1)|` over the window, printed in ms and
  as a percentage of the median, and it lights up past 40% — above the ~30% this
  game idles at, because a warning that is always on is not a warning.
- **js / gap** — the half that names the culprit. `js` is the whole update loop
  and the `render` calls, measured by wrapping `_tickBody`; the **gap** is
  everything the browser did, which is mostly WAITING FOR THE GPU, since
  `render` only queues commands and the driver blocks at the swap.

  | | |
  | --- | --- |
  | js small, gap large | the GPU or the driver — fewer pixels, or the wrong adapter |
  | js large | the update loop. Profile it, do not guess |
  | both fine, stutter high | stalls: GC, a texture upload, a shader compiling |
- **draws / triangles / panes** — what the scene is asking for. Flat while the
  frame time climbs means the scene is not what changed. Panes matter because
  two kittens who walk apart cost two full passes over the world.
- **the buffer, in pixels and megapixels** — the number that has actually moved
  every single time this has been chased, and the one thing nothing on screen
  used to say.
- **quality / tier / AA / shadows** — which lever is available and whether it is
  being pulled.
- **dev server or built** — a Vite dev server is unminified with a hot-reload
  client attached. A Steam shortcut left pointing at `localhost:5173` instead of
  the deployed URL is a real and completely invisible cause; see
  [steam.md](steam.md).
- **the GPU string, flagged** — the one that catches a browser on the wrong
  adapter, where every other number on the readout looks perfectly normal. It
  is matched against named patterns for software rasterisers (SwiftShader,
  llvmpipe) and for integrated parts (Intel HD/UHD/Iris, AMD's model-less
  "Radeon(TM) Graphics"), and says so in warm text. A false positive costs one
  extra word on a debug overlay, which is the right way round for a check that
  would otherwise never fire.

The ring of frame times is written **every frame whether or not the readout is
up** — one store into a preallocated `Float64Array`. That is what makes it
useful: it opens showing the two seconds that have already gone wrong, rather
than starting a fresh sample from the moment you asked. A profiler you have to
turn on before the problem is a profiler that never sees the problem.

It samples from its own `performance.now()`, **not from `dt`**, because `dt` is
clamped to 1/20 in `_tick` so a long stall cannot teleport a kitten through a
wall — which makes it exactly the wrong number to measure stalls with. It would
cap the readout at 50 ms and report 20 fps for a frame that took a second.

It repaints four times a second, not sixty: a readout that measures the frame
has to be far too cheap to appear in its own numbers.

---

## The browser was on the wrong GPU, and that is most of it

A desktop with an **RTX 4060** in it was rendering the game on the CPU's
**Intel UHD Graphics 770** (device `0x0000A78B` — the iGPU on a 13th/14th-gen
desktop Intel). Every number on the `P` readout looked ordinary. The only sign
was in the driver string, and nobody reads a driver string unless something
points at it — so now the readout points at it, in warm text with a `⚠`.

**On Windows the browser gets whichever adapter the OS hands it.** The renderer
already asks for the fast one — `powerPreference: 'high-performance'` is set in
the `WebGLRenderer` constructor in `main.js` — and Chromium acts on that while
**Firefox on Windows does not**. There is no Firefox pref that picks the
adapter either; it follows the operating system. So this is fixed on the
machine, not in this repo.

### The three-line fix

1. **Windows Settings → System → Display → Graphics.** Find Firefox in the list,
   or **Browse** to `C:\Program Files\Mozilla Firefox\firefox.exe`. →
   **Options** → **High performance** → **Save**.
2. **NVIDIA Control Panel → Manage 3D settings → Program Settings.** Add
   Firefox, set the preferred processor to **High-performance NVIDIA**. Modern
   drivers let the Windows setting win, but setting both costs nothing.
3. **Quit every Firefox process and start it again** — including the one Steam
   launched. The preference is read at process start.

**Verify it took**: press `P` — the warning line should be gone and the driver
string should name the 4060. Firefox's own `about:support` → *Graphics* →
**`WebGL 2 Driver Renderer`** is the same string from the other side.

### Check the cable first, on a desktop

UHD 770 is a *desktop* iGPU, which means the machine has both outputs live. **If
the monitor is plugged into the motherboard's HDMI/DisplayPort rather than into
the RTX 4060's own ports, the iGPU is the display adapter** and no software
setting fixes it properly. That is thirty seconds to check and it makes
everything above moot.

### Why this looked like "the maths overlay" and "the tournament"

Because both are things you notice, and neither is a cause:

- **The tournament arena is the CHEAPEST scene in the game and the worst to
  play.** Measured in a live round with six critters on the mat: **73 draw calls
  and 67,194 triangles**, against 254 and 210,444 standing in the town. Every
  system update in the arena put together is **2.8 ms**, of which 1.6 ms is
  `renderer.render` submitting those 73 calls. The critters cost **0.059 ms for
  all six**, and their shadows are `CircleGeometry` meshes built once in the
  constructor — nothing about them is rebuilt per frame.

  What the arena *is* is a big flat mat that fills the entire screen at close
  range, lit and shadowed, with almost nothing in front of it to reject pixels
  early. It is the most expensive scene in the game **per pixel** and the
  cheapest per object, which is exactly backwards from where anybody looks.

- **"The frame rate stays the same but it chugs"** is what a GPU-bound frame
  feels like when the CPU is idle. `requestAnimationFrame` keeps firing on
  schedule, so the fps reads fine, while frames are presented late and unevenly
  and the stick feels a beat behind. The `js` / `gap` split on the readout is
  there to say so out loud: on the machine above it reads **js 1.8 ms, gap
  10.4 ms**, and the gap is the GPU.

---

## Why `low` renders at 0.75

`QUALITY.low.pixelRatio` was `1` and that made the quality setting inert on the
commonest desktop there is.

The effective ratio is `min(devicePixelRatio, tier, deviceCap)` — see
`effectivePixelRatio` in `core/device.js`. On a 1:1 panel `devicePixelRatio` is
exactly 1, so `high`, `medium` and `low` all came out at **1.0** and the only
thing turning quality down bought was the shadows: 9%, on a machine that needed
50%. The one lever a fill-bound game has was doing nothing, and nothing said so.

Below 1 the buffer is smaller than the panel and the browser scales it up, which
is what every game's resolution slider does. 0.75 is 44% fewer fragments. What
it actually bought, measured on the same integrated GPU:

| | medium | low |
| --- | --- | --- |
| 1080p-equivalent | 18.4 ms — **54 fps** | 9.8 ms — **102 fps** |
| 1440p-equivalent | 30.0 ms — **33 fps** | 15.6 ms — **64 fps** |

It reads as soft rather than as broken, and the HUD, the menus, the scoreboard
and the maths board are all DOM — they stay razor sharp through it. It reaches
the cautious phone tier too, whose default quality is `low`, which is right: a
four-core phone is exactly who that tier is for.

**The desktop DEFAULT is untouched.** `medium` is what the girls get when they
press PLAY and it is bit-identical to what it always was — asserted, along with
the three facts above, in `world-check`'s device section.

### And `_applyQuality` no longer restates the arithmetic

It used to spell out the same `Math.min` of the same three numbers that
`effectivePixelRatio` exists to own. `core/device.js` says at the top of itself
why that is dangerous — "Restating them is how the mobile tier ended up
rendering at 1.0 with nothing to catch it" — and world-check asserts the PRODUCT
that function returns, so a second copy in `main.js` was a copy no check could
see. There is one now.

---

## Where to look next, if it is still slow

In this order, because it is the order of how much they are worth:

0. **Check what GPU the browser is on** — see above. If it says INTEGRATED and
   the machine has a discrete card, nothing else on this list is worth doing
   first.
1. **Fewer pixels.** The quality setting, then the window. This is 90% of the
   available headroom and everything else is rounding.
2. **MSAA.** `antialias` is a `WebGLRenderer` CONSTRUCTOR option — it cannot be
   changed on a running renderer, which is why `core/device.js` decides it
   before the renderer exists. Turning it off for the `low` tier on a desktop
   would need a reload to take effect, and would want the same "reload to apply"
   note the phone override already has. Untried, and the obvious next step.
3. **Draw calls.** 600 at the title, 250-ish in ordinary play, doubling when the
   kittens split into two panes. That is a lot of small props, and instancing
   the repeated scenery would cut it — but it is CPU-side submission cost, and
   the CPU is currently a tenth of the frame. It would buy nothing until the
   fill problem is gone.
