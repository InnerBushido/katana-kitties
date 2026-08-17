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

## Traps waiting in the touch work

Written down before the code exists, because each of these has a known shape:

- **Track `pointerId`, never `touches[0]`.** A thumbstick drag plus a jump tap
  plus a slash tap is three simultaneous pointers. This is the single most
  common way a virtual pad breaks.
- **`pointercancel` and `pointerleave` must release the button**, or a held
  sprint sticks down forever — the browser takes the pointer away and the game
  never hears the up.
- **Sprint has to be a real button.** Auto-sprint on full stick deflection is
  tempting and it is wrong: `ATTACKS.dash` fires on `sprint && moving`, so
  auto-sprint would turn every moving attack in the ring into a dash attack.
- **`map` and `math` get no buttons.** They are already HUD elements; make the
  minimap tappable to cycle zoom and the maths board tappable to toggle. Eight
  actions do not fit under two thumbs, and two of them already have a place to
  live.
- **Touch is a device, claimed to slot 0** via the existing `claims` mechanism,
  so pads deal into slots 1+ and a Bluetooth controller on the phone becomes
  player 2 for free. Merging touch into slot 0 as an extra source is the smaller
  diff and it is wrong: pads fill from player 1 down, so the pad would steal the
  seat from the girl holding the phone.
- **iOS Safari supports neither orientation lock nor fullscreen on iPhone.** The
  rotate prompt has to be a friendly overlay, and the PWA manifest is the only
  real fix for the URL bar. Android honours both.
