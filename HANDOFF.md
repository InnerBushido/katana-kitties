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

**Testing it on this computer:** Settings → **Touch controls** → *Force ON*. The
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

**Steam is the other branch, and it answers the multiplayer wish cheaply.** An
Electron wrapper plus Steam Direct gets **Remote Play Together**, which streams
this local split-screen co-op game to friends anywhere and forwards their pad
input — worldwide multiplayer with no netcode. Steam Input would also normalise
every controller, which retires the whole vJoy/Joy-Con calibration problem for
Steam players. Valve requires AI-content disclosure at submission; the title
screen credit is already honest about it.

**Two things that work as designed but read like bugs:** Chrome cannot read the
vJoy sticks (play in Firefox — the title screen detects it and says so), and a
saved controller map beats the source defaults, so editing `DEFAULT_VJOY_MAP`
looks like it did nothing until you press RESET TO DEFAULTS.

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
