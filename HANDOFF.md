# Katana Kitties — state of the project

**What works, what is open, and where everything is.** Start here when you pick
the project up. [CLAUDE.md](CLAUDE.md) has the rules that must not break and is
loaded automatically; this file has the state, which changes.

**Location:** `C:\Users\Hypot\OneDrive\Desktop\Claude Conversation\katana-kitties`
**Repo:** https://github.com/InnerBushido/katana-kitties (public)
**Live:** https://katana-kitties.vercel.app (Git-connected: a push to `main` deploys)
**Run:** `npm run dev`, then open it in **Firefox** — Chrome cannot read the
Joy-Con sticks through vJoy.
**Check:** `node tools/world-check.mjs` and `node tools/pad-check.mjs`. Both
print their own totals; don't quote the numbers here, they drift.

> This file used to be 4,400 lines and every session was told to read it first,
> which spent about 65,000 tokens before any work began. The reasoning behind
> the code moved to [docs/notes/](docs/notes/README.md), one file per area, read
> on demand. Nothing was thrown away.

---

## What this is

A split-screen co-op browser game built for Richard's 9-year-old niece (who is
interested in making games) and her younger sister. Samurai kittens — **Ember**
(orange), **Frost** (grey), and **Storm** and **Blossom** for a third and fourth
player — explore a chain of floating Japanese islands, knock things over, ride
storm dragons between them, and eventually fight each other in a tournament ring.

**Design inputs, all from the kids:** her own menu-screen drawing (reproduced as
inline SVG on the title screen), her books (*Warriors*, *Storm Dragons*), her
title, her favourite games (Minecraft, Wobbly Life, Untitled Goose Game), and a
page of her character designs that became the six clan leaders. Richard practises
Japanese samurai swordsmanship — hence the katana.

**The maths teaching is the point of the project.** He is teaching her sin/cos,
the unit circle, theta, degrees vs radians, vectors and the origin, on graph
paper. The Kotodama Orb and the Dojo of the Turning Circle are that lesson made
walkable, and both are protected in any refactor. See CLAUDE.md.

**three.js, not Unity** — deliberate, despite Unity being Richard's stack. The
refresh-to-see-it loop is what turns a 9-year-old into a developer, and Switch 2
controllers work through the browser Gamepad API with no driver setup.

**No AI-generated 3D meshes.** Characters and dragons are AI-generated anime
sprite sheets billboarded inside procedural low-poly terrain — that *is* the
Super Mario RPG look.

---

## What works

**The world.** Eight floating islands (six biomes, plus the Dojo and the
tournament arena) and a fully built town: clan hall, pagoda houses, great torii,
market street, red bridge, cherry trees, 216 knockable props, 150 cuttable
bamboo canes. All procedural geometry, merged to a handful of draw calls.

**One to four players.** Run, double-jump, sprint, slash, mount dragons, ride a
panda. A third and fourth join mid-game without interrupting anybody. The screen
gives a pane per *group* of kittens standing together, not per kitten; two
minimaps at most.

**Any mix of input devices**, with controllers outranking the keyboard and dealt
in connection order; two full keyboard sets, each playable one-handed. Menus,
settings and the remap grid all take a pad. See [docs/notes/input.md](docs/notes/input.md).

**The story.** A ~79-second opening cutscene flown through the real 3D world,
six clan leaders standing at their own shrines with recorded voices, and a
full-screen introduction the first time you meet each one.

**Six clans**, one shrine per island, each granting a buff that changes a
different verb — including Pandapaw, which hands you a job rather than a power:
cut 20 bamboo for a cub, 20 more and it grows big enough to ride.

**The seven dragon balls**, one per island, six of them behind locks that each
ask for a different verb (a grotto, dragon breath, a panda's claw, flight, a
triple jump). Collect all seven and **Ryuuseki** appears over the great torii
with two seats that do different jobs.

**The World Martial Arts Tournament.** Mr Satan opens it at 80% mischief; the
griffin flies you north. Six leagues (duel, free-for-all, 2v2, 2v1, 3v1, 2v1v1),
each with its own record board, team colours and a PICK YOUR SIDE screen. Best of
three, three attacks off one button, ring-outs, a round clock, rage. Between
rounds a 15-second **feast**: the survivor hunts rats, rabbits and birds on the
deck while whoever went down flies over it as an **angel cat**.

**The endgame.** 100% mischief wakes the **Powerup Kotodama**: eight kinds, worn
up to eight at once, scattered over the islands, with a dealer's stall and a
two-cursor trade screen. Patchfur closes the story in her own voice.

**Sound.** Every effect and every piece of music is synthesised at runtime — a
piece per island, one per dragon, one for the arena. The only audio files in the
project are the recorded voice lines in `public/voice/`.

**A device tier.** `core/device.js` decides once what this machine may spend and
the renderer, the art loader and the quality setting all read it. A touch device
gets antialias off, a capped pixel ratio, and half-size single-figure atlases
(147MB of retained texture down to 115MB); a desktop gets byte-for-byte what was
hard-coded before the file existed. See [docs/notes/mobile.md](docs/notes/mobile.md).

---

## Open items

**Nothing is known broken.** Both check suites pass and the build is clean. What
is listed here is untested-by-players, not untested-by-machine.

1. **The four-player game has been played once, and the tournament twice.** The
   first four-player session produced ten fixes (see
   [docs/notes/four-players.md](docs/notes/four-players.md)); the second pass
   produced the one-handed keyboard cluster. What has *not* been watched is a
   real 2v2 or 2v1v1 with four kids in a room, which is the only test that
   settles the league balance.
2. **Numbers most likely to come back, all of them checked** so turning one
   fails loudly rather than silently: `OUT_DAMAGE` (30), `ATTACKS.dash.knock`
   (19), `HANDICAP_MAX` (1.2), `ROUND_LIMIT` (120), `FEAST_TIME` (15),
   `REGEN_FRAC` (0.10), `EAT_TIME` (2.0), the critter `speed`/`hopV`/`cruise`
   values, and `OPEN_AT` (0.80).
3. **The open question no check can answer:** whether carrying damage into the
   next round reads as fair to the girl who just won one. It is right on paper
   and it is the one rule a nine-year-old could reasonably call cheating.
4. **Storm and Blossom are placeholders** — the same two cats recoloured. The
   girls should name them and pick the colours; it is one table in
   `src/core/palette.js`.
5. **Not built, deliberately:** enemies or combat anywhere but the ring; kitten
   customisation; towns on the outer islands; clan camp building. Ideas that
   came out of the clans and are not built: clan-specific missions, a second
   material that resists dragons the way bamboo does, breath types that interact
   with specific props.
6. **`docs/unused-art/` is 19MB of reference sheets the game never loads.** Fine
   in the repo and excluded from CLI deploys, but it is most of the repo's size
   and nothing reads it. Worth a decision one day; not urgent.

---

## Mobile — the road to a phone

**Where it stands:** the deployed build already boots and renders on a Galaxy
S24 Ultra. It has **no touch input at all**, and in landscape the minimap and the
maths board eat the width. The reasoning for everything below —
the measured VRAM table, and why the art budget moves `maxAtlas` and never
`cell` — is in **[docs/notes/mobile.md](docs/notes/mobile.md)**.

**The target is one player on a phone.** A second player can still join on a
Bluetooth pad, and a tablet can still split; a phone does not split by default,
because half a 6-inch screen is not a pane.

| step | what | state |
| --- | --- | --- |
| 1 | device tier: antialias, pixel-ratio cap, `maxAtlas` budget | **done** |
| 2 | start at one kitten on a touch device; the arena refuses solo | **done** |
| 3 | touch as a device, on-screen stick and buttons | **done** |
| 4 | landscape HUD pass, safe areas, orientation gate, PWA manifest | **done** |

**All four have now run on a Galaxy S24 Ultra, and the touch controls worked.**
Three things came back from that session; all three are fixed, and the reasoning
is in [docs/notes/mobile.md](docs/notes/mobile.md) under *The second play
session*.

1. **Flying to the Dojo killed the tab** — the maths UI appeared, the frame rate
   collapsed, and the page died a few seconds later on every quality setting.
   The five live readouts were minting a never-freed canvas texture per distinct
   string: **972 MB per lap of the circle**, measured. Labels that change now own
   their canvas (`Label`'s `live` option) instead of using the shared cache. The
   Kotodama orb and the power orb had the identical bug and are fixed too.
   *Follow-up:* that first fix traded the leak for a per-frame texture UPLOAD and
   made the orbs and the Dojo lag on a desktop — the Dojo was re-uploading 9.5 MB
   of text every frame **from other islands**, because `dojo.update` runs
   unconditionally. A reading-distance gate, an 80 ms repaint throttle and a
   smaller supersample took it from 10.4 MB a frame to 0.66.
2. **The face cluster was too small and too far into the corner.** It is now
   centred on the reflection of the stick's resting point — same height, same
   inset — and about 40% bigger.
3. **The sin/cos board covered the middle of the screen**, which in the Dojo is
   the diagram itself. Board to top-left; the minimap crosses to top-right and
   shrinks.

What was checked before that: the pad reads a mouse drag and a keyboard, the
kitten actually runs, a second pointer on JUMP holds while the stick is released,
`pointercancel` releases a held button, the map and maths-board taps work, and a
desktop with the setting on `auto` is byte-for-byte unchanged (two kittens, WASD
and arrows, `auto`/`medium`, antialias on, `maxAtlas` 2048, no pad in the DOM).

**Testing it on this computer:** Settings → **On-screen stick** → *Always ON*. The
pad appears immediately with the **mouse driving the stick and WASD / Q E F /
Space driving the buttons**, and every on-screen button lights up for a keyboard
press, so the readout shows what a thumb would. Reload to get the rest of the
phone tier (one kitten, low quality, half-size atlases) — the note under the
setting says so, because those are read once at boot.

**The arena is shut for a solo kitten** and says so as an instruction: *"a
tournament needs TWO fighters! Bring a sister."* Every league wants two fighters
or more, so `modesFor(1)` is empty and `begin()` would otherwise fall through to
a one-sided duel — a round that cannot be lost. Solo keeps everything else: the
world, the dragons, the clans, the panda, the seven stars and the whole endgame.

**A controller in one hand and a phone in the other** is the case nothing had
been designed for, and it is where the fourth phone session's five reports all
came from. Fixed; the reasoning is in
[docs/notes/mobile.md](docs/notes/mobile.md) under *The fourth pass*.

- **`device.touchPrimary` was answering two questions** — "is this a phone"
  (which decides every size on screen) and "is the on-screen stick up" (which
  decides two things). Hiding the stick to use a controller therefore gave back
  the whole desktop HUD. They are `touchPrimary` and `padOn` now; every
  combination except *phone + stick off* comes out bit-identical, and the setting
  is renamed **On-screen stick**.
- **Signing the leaderboard was a dead end on a phone.** `#arena-result` is
  `z-index: 60` and the pad is `7`, so every control the screen named was drawn
  underneath it — the same bug the character profile had. It has a **36-key
  keypad** and a **FLY HOME** button now, calling the same `type` / `del` /
  `accept` the keyboard does.
- **The ring camera framed the deck rather than the fight.** A landscape phone is
  2.16 against a desktop's 1.78, and the lens's 38 degrees is *vertical* — so the
  phone was already showing 21% more world at the same distance, on a screen a
  fifth the size. It sits at half the distance up close now and opens to a fitted
  66 at full spread.
- **A side-by-side split does not shrink a pane's height**, so the phone map's
  height cap did not notice the split at all. It takes a third off — but only
  when the pane is still full height, since a stacked split has already paid it.
  The rule moved to `mapWidth` in `core/split.js`, pure and checkable.
- **The menu cursor was drawn and invisible.** `nav-pulse` faded the ring to gold
  on a pale button; it holds vermillion and animates the *offset* now, and the
  focused button grows, because PLAY is red whether it is focused or not.

**The fifth pass was the title screen standing in front of the painting.** The
cat-head panel is `min(660px, 74vw)`, which on a laptop covers a third of the
art and on an 844x390 phone covers **89% of it** — because `.title-art-main` is
`contain`, so the picture is only 699px wide inside an 844px window. It is
`min(470px, 56vw)` on touch now, its paper fades from 0.10 opaque at the ears to
0.88 by the buttons (the top 38% of the head has no UI in it and is where the
dragon is), and it hangs off the *bottom* rather than off a `vh` margin, because
the thing it has to stay clear of is `.credit`, which is anchored there. The
kid's shape is untouched — repainting is not redrawing. *The fifth pass* in
[docs/notes/mobile.md](docs/notes/mobile.md).

**The misalignment the first phone test reported is fixed.** The minimap was
sized off its pane's *width* (`v.w * 0.42` — 354px of a 390px-tall phone) and set
**inline** by `_drawMaps`, so no stylesheet rule could touch it; it is now capped
against the pane's *height* and moved to the top-left, because both bottom
corners belong to thumbs. The hint is centred in the gap between them and clipped
to two lines. *(Inside the Dojo it gives that corner to the sin/cos board and
takes the top-right instead — see the note above.)*

**Later, and wanted:** *phone as a controller* — four people each holding a phone,
playing on a tablet or a TV. That is a second device feeding a `PadState` over
the local network, and it is the natural stepping stone to real netcode.

**Steam is the other branch, and half of it has now happened.** Firefox runs as
a non-Steam shortcut, which does retire the vJoy/Joy-Con calibration problem —
Steam Input normalises every pad, including the 2026 Steam Controller, which is
otherwise not a gamepad at all. See [It runs from Steam now](#it-runs-from-steam-now).

**What that route does NOT get is Remote Play Together**, and this is the
correction to what used to be written here. Steam exposes no way to enable it
for a non-Steam shortcut; it needs a real appid, which means Steam Direct and an
Electron or Tauri wrapper. The prize is unchanged and still the cheapest
multiplayer there is — RPT streams local split-screen co-op to friends anywhere
and forwards up to four pads, with no netcode at all, which is exactly the shape
this game already has. Valve requires AI-content disclosure at submission; the
title screen credit is already honest about it.

**Two things that work as designed but read like bugs:** Chrome cannot read the
vJoy sticks (play in Firefox — the title screen detects it and says so), and a
saved controller map beats the source defaults, so editing `DEFAULT_VJOY_MAP`
looks like it did nothing until you press RESET TO DEFAULTS.

---

## It runs from Steam now

**Not a port — a shortcut.** Firefox is added as a non-Steam game so that Steam
Input hands the browser a virtual Xbox pad, which is the only way the 2026 Steam
Controller becomes a gamepad at all (it ships in firmware lizard mode: keyboard
and mouse, no HID gamepad descriptor). The Switch 2 pads come along for free.
**Zero game code was needed and none was written.** Full reasoning in
[docs/notes/steam.md](docs/notes/steam.md).

The Launch Options box takes arguments only — no `firefox.exe`, no wrapping
quotes:

```
-no-remote -P steam -kiosk "https://katana-kitties.vercel.app"
```

- **`-P steam` needs the profile to exist first**, or Firefox opens the Profile
  Manager on every single launch and the "don't ask at startup" checkbox does
  not suppress it. One-time: `firefox.exe -CreateProfile "steam"`.
- **A separate profile is a separate `localStorage`**, so the Steam route has
  its own leaderboard, its own vJoy map and its own device override. Nothing is
  lost; it is a second save file.
- **`-kiosk` is the fullscreen.** No URL bar, no tabs. Alt+F4 quits. Do not add
  `-private-window` — private browsing throws its `localStorage` away on exit,
  and the leaderboard with it.
- **Point it at the deployed URL, not `localhost:5173`**, or the shortcut only
  works when somebody remembered to start Vite.

**The artwork is generated, not drawn:** `node tools/steam-art.mjs` builds the
background, the logo, both covers and a 16–256px `.ico` out of
`public/sprites/title_art.png`, into `out/` (gitignored — the tool is the thing
worth versioning). **Steam does not make the desktop icon for you**, for
non-Steam shortcuts or for real ones; set it by hand in the shortcut's
Properties.

The same run replaced `public/favicon.svg` — a purple lightning bolt from the
project scaffold, referenced by the web manifest and nothing else, so the tab
had no icon at all and "add to home screen" installed a stranger's logo.

**Remote Play to your own devices works** with a non-Steam shortcut (Steam Link
on the phone streams the PC game and forwards a pad). **Remote Play Together —
the four-friends one — does not**: Steam exposes no way to enable it for a
non-Steam shortcut. Neither is networking; both are one machine simulating
everything and shipping pixels.

---

## Why it lags, and what it is not

**It is fill rate, and `P` now says so on screen.** Reported as "badly lagging
on PC", suspected to be the Kotodama Orb's maths UI or the drifting particles,
and it is neither — both were measured and both are innocent:

- **The petals cost nothing.** 700 instanced quads, one draw call; hiding every
  one of them changed the frame time by less than the noise.
- **The maths overlay costs almost nothing.** A live label repaint measures
  0.068 ms and they are throttled to one per 80 ms each. Everything the mobile
  pass did there is strictly LESS work than what it replaced, on a desktop as
  much as on a phone — checked against the pre-pass build, which draws the
  identical scene, the identical 600 draw calls and the identical 287,776
  triangles.
- **The whole per-frame JavaScript is under a millisecond**, against 15.7 ms of
  `renderer.render` at 2.27 Mpx.

What frame time actually tracks is the **size of the drawing buffer**, in a
straight line, and the thing that changed on the PC is that the game now runs
FULLSCREEN under Steam's `-kiosk` Firefox instead of in a window. A 1080p
fullscreen is 2.07 Mpx; a 1440p one is 3.7 Mpx. On an integrated GPU that is
54 fps and 33 fps respectively.

**So `low` was made to actually be low.** `QUALITY.low.pixelRatio` was 1, and
because the effective ratio is a `Math.min`, on a 1:1 desktop panel `high`,
`medium` and `low` all rendered at exactly 1.0 — the setting bought the shadows
(9%) and nothing else. At 0.75 it renders below the panel and the browser scales
up: **54 → 102 fps at 1080p, 33 → 64 fps at 1440p.** The desktop default
(`medium`) is bit-identical to what it always was, and world-check now asserts
all four of those facts.

**Two things to check on the machine that lags, before touching any code:**
press `P` and read the last two lines. If it says `DEV SERVER (unminified) ·
localhost:5173`, the Steam shortcut is still pointing at Vite instead of the
deployed URL (see [steam.md](docs/notes/steam.md)); if the GPU string names
something software rather than a real adapter, the browser has fallen back and
no setting in this game will help.

Full numbers and the next two levers in
[performance.md](docs/notes/performance.md).

---

## Where the reasoning lives

One file per area in **[docs/notes/](docs/notes/README.md)** — read the one you
are about to touch, not all of them.

| | |
| --- | --- |
| [four-players.md](docs/notes/four-players.md) | seating, panes, leagues, the ten things one session turned up |
| [input.md](docs/notes/input.md) | controllers, vJoy, the Chrome bug, the keyboard sets, menus on a pad |
| [tournament.md](docs/notes/tournament.md) | the ring, rounds, ring-outs, the board, the animals, the feast |
| [dragon-hunt.md](docs/notes/dragon-hunt.md) | the seven locks, the grottos, the spire, Ryuuseki |
| [endgame.md](docs/notes/endgame.md) | the ending, the Awakening, the eight orbs, the economy |
| [story.md](docs/notes/story.md) | the cutscene, the leaders, the shrine scenes, the scene viewer |
| [world.md](docs/notes/world.md) | the clans and their buffs; the panda |
| [art.md](docs/notes/art.md) · [audio.md](docs/notes/audio.md) | atlas cells; the synthesised music |
| [rules.md](docs/notes/rules.md) | the gameplay invariants in full, and the measurements behind them |
| [gotchas.md](docs/notes/gotchas.md) | traps that cost real time and are invisible in the code |
| [hosting.md](docs/notes/hosting.md) | Vercel, the Git deploy, the `gh` credential setup, how the screenshots were taken |
| [steam.md](docs/notes/steam.md) | the non-Steam shortcut and its launch flags, the shelf artwork, what Remote Play is and is not |
| [performance.md](docs/notes/performance.md) | why the frame time is a straight line in pixels, what is measured NOT to be a cause, the `P` readout |

**Older source comments saying "see HANDOFF.md" mean these notes** — the text
they point at was moved, not deleted. Grep `docs/notes/` for the phrase.

---

## Starting a session

**Open the session with `katana-kitties` as the working folder, not its parent.**
This is the whole trick and it is easy to get wrong: Claude Code loads
`CLAUDE.md` from the folder it starts in. Opened on
`Desktop\Claude Conversation` — which also holds MoveQuest — the project's
`CLAUDE.md` is simply not seen, and the session starts knowing nothing. Opened
on the project, the invariants, the commands and the code map are already there
before the first word.

**Then just say what you want.** No "read HANDOFF.md first" — that instruction
existed because the file was the only orientation there was, and following it
now costs a page of state nobody asked for.

Worth adding to the first message, when they apply:

- **the area**, if you know it — "the reasoning is in `docs/notes/tournament.md`"
  saves a search;
- **how you will judge it** — "the girls should be able to work it out without
  being told" is a real constraint and changes the design;
- **plan first** for anything with more than one moving part. A wrong plan costs
  a paragraph; wrong code costs an afternoon.

Everything else — run it in Firefox, run both checks, add the check that would
have caught it, update these docs — is in `CLAUDE.md` and does not need saying.

---

## Handing off to the next session

**Do not write a summary file per session.** They accrete, they go stale, and
nobody deletes them — which is exactly how this file got to 4,400 lines.

The handoff is four things, in the order a session should use them:

1. **[CLAUDE.md](CLAUDE.md) loads itself.** If a fact is true on every turn — an
   invariant, a command, where something lives — it belongs there and nowhere
   else. Keep it short; every line is paid for in every session.
2. **This file carries the state.** Finished something? Move it from *Open
   items* to *What works*. Found something you can't fix now? Add it to *Open
   items* with the file and the symptom. This is the only file that should ever
   describe the present.
3. **The reasoning goes in `docs/notes/<area>.md`, next to the reasoning it
   belongs with.** Write down what you tried that did *not* work — that is the
   half a future session cannot reconstruct from the code.
4. **`git log` is the session log.** Commit messages here are written as
   essays and the history is the record of what changed and why. A new session
   catching up should read `git log --oneline -20` and then one commit body,
   not a folder of summaries.

**And when you fix something, add the check that would have caught it.** A fact
enforced by `world-check` needs no paragraph anywhere; a paragraph without a
check is a fact waiting to rot.
