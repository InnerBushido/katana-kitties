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

**One to four players, opening on ONE.** Run, double-jump, sprint, slash, mount
dragons, ride a panda. **PLAY starts a solo game on every machine** — the phone
already did, and the desktop's `defaultParty: 2` was never a decision, it was
the game from before one kitten was a state this code could hold. The second
seat is asked for rather than dealt to nobody: pick up a controller
(`Game._autoSeat`) or press **ENTER**, which lands her on the ARROWS / `O K L ;`
set because player 1 already has WASD. A third and fourth join the same way,
mid-game, without interrupting anybody. Anyone who joined can drop out again
from the pause menu — that used to be offered only above three players. The
screen gives a pane per *group* of kittens standing together, not per kitten;
two minimaps at most, and one at a party of one.

**Any mix of input devices**, with controllers outranking the keyboard and dealt
in connection order; two full keyboard sets, each playable one-handed. Menus,
settings and the remap grid all take a pad. See [docs/notes/input.md](docs/notes/input.md).

**On a phone, Settings says who player 1 is.** The on-screen stick is dealt
ahead of every controller, so that one setting has always decided a seat —
stick on and a paired gamepad is player 2, stick off and it is player 1. The row
now says so in those words on a machine that really is a phone
(`Game._shapeTouchSetting`); the desktop keeps the developer wording, because the
desktop test mode needs an escape hatch that does not read as being about a
phone. See [docs/notes/mobile.md](docs/notes/mobile.md).

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

**The Cross Slash holds you.** The orb's three cuts used to knock the target
away on the first one and swing at empty air for the other two. They now freeze
whoever they catch — gravity off, untouchable by anybody else, damage banking —
and pay the whole bill in one throw after a pause, with a procedural burst, a
screen shake and the one sound bigger than a knockout. With the orb on, the
swing is thrown on the button's *release*, so a tap and a hold are alternatives
rather than a sequence. Named for Cloud's after the rework; **the orb's id is
still `tri`** and must stay so — it is in every saved profile. It also fixed a
bug nothing else had found: hitting an already-stunned animal used to *wake it
up*. See [docs/notes/endgame.md](docs/notes/endgame.md).

**Nothing irreversible happens on one press.** Every destructive button in the
pause menu — RESTART, TITLE SCREEN, QUIT THE MATCH, DROP OUT and the new QUIT
GAME — goes through `systems/confirm.js`, whose one real safety property is that
the panel has **no `.primary`**, so `MenuNav` opens the cursor on cancel. Buying,
selling and trading Kotodama ask each girl **separately, in her own card, on her
own controller**; the record board is signed twice. Scenes skip on **Escape or a
pad's Start and nothing else** — Space and Enter are out, because four kids round
a laptop find Space with an elbow. And a menu is driven by **one** player, the
one who opened it, with her name on screen in her own colour. All of it came out
of one afternoon of four-player play; the reasoning, and the two live bugs the
checks found on the way, are in
[docs/notes/consent.md](docs/notes/consent.md).

**A stuck vJoy button no longer starts the game by itself.** Reported as "2
controllers connected and one of them autostarts the game" and assumed to be a
phantom device; it was real, and it is still on Richard's machine — vJoy holding
button 9 at 1.00 from boot, which is `attack` on the left Joy-Con half. Masked at
the source in `core/input.js`, for vJoy only, cleared the instant the button is
released. `pad-check` grew an arrival frame for this: its harness had been
handing pads over with a button already down, which is a device that has been
pressing since before it existed.

**A voice-acting registry.** [docs/notes/voices.md](docs/notes/voices.md) — which
ElevenLabs preset is which character, with the `voice_id`s, so a session cannot
cast a character who already has a voice. Five of the eight were confirmed by
measurement rather than transcribed from a commit message.

**The trailer has two narrators now, and the handover is the joke.** A straight
trailer voice is narrating it and Mr. Satan keeps grabbing his microphone —
which is what "AHEM! Is this thing on?" always was, and it only reads that way
now that somebody else is plainly meant to be holding it. Mr. Satan takes shots
1-3, the narrator has 4-8 (the pets, the dragons and both maths shots, because
a boast about sine and cosine is a joke at the expense of the one part of this
that is not a joke), Mr. Satan barges back for the arena, and the narrator
reclaims the mic to say "right meow" with a straight face. **The narrator's six
takes are the FIRST cut's, copied byte-for-byte out of
`out/trailer/vo-desmond/`** — free, and exactly the takes that were chosen.
`trailer-vo.mjs --check` compares them against that archive, because they are
the whole structure and nothing else on disk can tell them from the Harrison
ones. Four Harrison lines were regenerated, 0.6 credits, and the picture was
never re-rendered: `trailer-cut.sh --audio` re-muxes the existing segments.

**A device tier.** `core/device.js` decides once what this machine may spend and
the renderer, the art loader and the quality setting all read it. A touch device
gets antialias off, a capped pixel ratio, and half-size single-figure atlases
(147MB of retained texture down to 115MB); a desktop gets byte-for-byte what was
hard-coded before the file existed. See [docs/notes/mobile.md](docs/notes/mobile.md).

**Two quick presses hold the shield up.** `Kabe` used to need a thumb held down
for its whole two seconds, which is the first thing a nine-year-old stops doing.
A double tap on Shield/Mount latches it until it expires; two more bring it
back. **It buys the button and never extra seconds** — `wardUsed` runs the same
either way, so a latched bubble pops on the frame a held one would. The same
gesture on glass had shipped **broken**: the on-screen pad's latch outlived the
block it held, so the shield worked exactly once per session. Both halves now
read one exported window (`DOUBLE_TAP_MS`), and the edge clock lives in
`PadState` rather than in the Ward, so consuming a press consumes the gesture
with it. [docs/notes/input.md](docs/notes/input.md).

**Mr. Satan has had enough of your kitty shenanigans.** Climb onto the
announcer's box during a tournament and he taunts you, waits ten seconds, raises
his arms, charges for a second and detonates — everybody up there leaves over
the horizon. **Nobody is hurt and nothing is lost**: no damage, no knockout, no
score, no ring-out, and it never goes near `strikePlayers`. Making that *true*
rather than *argued* took two corrections, the second of which only the browser
found: a kitten blown off the box lands outside the ring and below the deck,
where the ring-out rule was quietly taking thirty health and a point off her.
She now gets the feast's free return instead. He has a second drawing for it
(arms up), which is optional like every other drawing. `2` in the debug panel
skips the ten seconds. [docs/notes/tournament.md](docs/notes/tournament.md).

**The arena's posts and the announcer's box are see-through.** The same
world-space x-ray the grottos use, on the four corner posts and the whole booth,
so a fighter behind a post and Mr. Satan under his roof are both visible. It
turned up a four-player bug on the way in: the material's cut list was `MAX = 2`
from before four players existed, so kittens three and four were never cut for
anywhere, grottos included.

**A Help page that shows the game instead of describing it.** Twelve topics,
each a `<details>` a kid opens; twelve GIFs **captured out of the running game**,
three stills, and the Clans topic on the six leaders. A
new dependency-free GIF encoder (`tools/gif.mjs`, alongside `png.mjs`, for the
same rule-9 reason) does the filming, and `tools/gif-selftest.mjs` reads its
output back — a codec bug presents as "the picture looks a bit off", never as a
crash. The imagery is ~17MB and **not one byte is on the boot path**: a clip
carries `data-help-gif` and no `src` at all, and `Game._warmHelpClips` streams
them one at a time on the first Help open, with an opened topic jumping its own
images to the front of the queue. The panel takes a pad, too —
`summary.help-topic` joined `MenuNav`'s selector and the cursor opens on the
first topic rather than on BACK. All of it in
[docs/notes/help.md](docs/notes/help.md), which is worth reading before filming
anything: a hidden tab freezes a capture, `drawImage` on a WebGL canvas returns
stale pixels, and a clip whose camera moves costs four times one whose does not.

**"Dragon balls & Ryuuseki" is a clip now.** The last topic in Help that
described a whole run of verbs — walk into a star, hold it up, the sky goes out,
a dragon rises over the great torii, two of you climb onto his neck and one of
you fires seven beams — over a single still that showed none of them. It is
filmed through the game: the star is collected by walking into it, the dark is
`SummonScene.duskWant` falling at the game's own rate, and the seats, the beams
and the flight are `7`/`8`/`9` and the pilot's key. `ryuuseki.jpg` was deleted
with it, on the same argument that took `town.jpg`.

**Two things about it are worth carrying forward.** The pause beats are
**played, not frozen** — a held GIF frame reads as the clip glitching when there
is no text on screen to read, so a beat lingers by running the game at 12fps and
keeps only a couple of hundred milliseconds of actual hold. And the beat where
she picks the star up is **not** on a pinned camera: it hands the shot to
`Game.starShot`, the swing-and-zoom the game plays for a real player, with the
game's own toast painted onto the frame (the words are read off the live toast
element, so the clip cannot say something the game does not). Everything, and
the byte budget behind the frame rates, is in
[help.md](docs/notes/help.md#the-dragon-clip-four-fixed-cameras-one-the-game-directs).

**The check that pairs a clip with its size is now general.** It was written for
the two movement clips and stayed pinned to them while nine more arrived;
generalising it immediately found `panda.gif` claiming 640x360 for a 384x216
file. Every `data-help-gif` in the panel is now measured against its own GIF
header and its own 2.5MB cap.

---

## Open items

**Nothing is known broken.** Both check suites pass and the build is clean. What
is listed here is untested-by-players, not untested-by-machine.

**Played, pushed and live — the Help overhaul.** Richard tested it and confirmed
it works, so `feature/help-onboarding` merged into `main` and went to
`origin/main`, which Vercel deploys. The branch is **kept** until it has been
tried on a real phone, which is what the push was for.

**What the Help page still owes.** Three clips are missing and the reasoning
for each is in [help.md](docs/notes/help.md#what-is-not-done):

1. **"On a phone" has no clip** — the one that matters most, since the push
   exists to test on a phone. It needs the touch overlay filmed: move, jump,
   sprint, slash; **holding** sprint and **holding** Ride for Ward; and the
   double-tap **lock-on** for both, with Charge showing what a locked sprint is
   for. The Ward and Sprint parts belong **in the arena**.
2. **An arena clip** — sprint, a slash landing on another player, both players
   jumping, on two input types.
3. **An "on a dragon" controller clip.** The beats exist behind `part: 'air'` in
   the shot script; read the 4.5MB paragraph in help.md before choosing where it
   goes, because a flying camera defeats the encoder.

**The capture rig is not in the repo.** `harness.js`, `movekit.js` and the shot
script live in the session scratchpad, which is temporary — every session that
films something has recovered them from the previous session's scratchpad. What
is durable is [help.md](docs/notes/help.md), which now carries the traps rather
than the code. If that stops being enough, the decision to make is whether a
browser-driving harness belongs in `tools/`.

**Played, pushed and live — the third, fourth and fifth four-player sessions,
all in one push.** Richard playtested the input fixes and confirmed everything
was working, so all three sessions' work went out to `origin/main` together,
which is what Vercel deploys — so it is on
https://katana-kitties.vercel.app and the nieces have it. The two branches
behind it (`bugfix/dealer-pane-and-three-more`,
`mixed/joycon-buttons-and-dealer-profile`) were deleted once merged and
pushed; see *Branches* at the end of this file.

**The fifth session's two.** A third row at the dealer,
**CHARACTER PROFILE — TRADE WINDOW**, opening the same trade screen the pause
menu does (a second door, not a second copy — `fromPause` stays false so
closing hands the frame back). And the Joy-Con map/overlay buttons moved off
the wrong indices onto where the feeder reports them — `L → 20`, `R → 21`,
`ZL`/`ZR → 22` (one shared index, so `Game._step` fires the maths toggle once
rather than per-half), 0–3 now dead, storage key bumped to `v3` so a saved map
does not keep the old guesses. Written up in
[four-players.md](docs/notes/four-players.md#the-fifth-session--two-small-ones)
and [input.md](docs/notes/input.md). **The Joy-Con remap itself is still worth
a hands-on check with real hardware** — the browser cannot drive the vJoy
feeder, so it was only ever verified by `pad-check` (256) and by Richard's own
playtest, not by anything this tree can watch happen.

**The fourth four-player session's four.** Written up in
[four-players.md](docs/notes/four-players.md#the-fourth-four-player-session--four-things-the-split-screen-was-hiding).
Three of the four are one bug in different clothes — something sized or tested
against a full screen, meeting a pane that is a quarter of one — which is worth
knowing because the next one will look new and will not be.

1. **A 3-and-1 split is now always side by side**, ignoring the direction
   setting, and the dealer's card measures its pane both ways. All four at the
   stall, one opens her card, and *Top and bottom* gave her a 1920x410 strip
   with a card sized entirely off its width. This **reverses the reversal
   below** — see item 2 there — for the uneven pair only; the even pair and the
   2/1/1 still follow the setting.
2. **Both signs over the stall are twice as tall, and `Label.faceCamera` was
   fixed.** It copied the camera's rotation into the mesh's **local**
   quaternion, so a label under a rotated parent never actually faced the
   camera — the stall's group is turned `-PI/4`, so its signs sat 45 degrees
   off. World text is half its linear size in a quadrant, which was the other
   half. The quads grew; the canvases behind them deliberately did not.
3. **A kitten on a dragon is in the Dojo.** Flying over the unit circle switched
   the maths board on and then drew it in the bottom-left of the screen, in a
   pane belonging to somebody two islands away. Four places asked *is she at the
   Dojo* and two answered differently; `inDojoView` is now the only one that
   answers, and one `!p.mount` survives on purpose in `_clusters`.
4. **The griffin lands in front of the torii instead of past it.** The landing
   spot sat four units beyond the gate on the inbound axis, so the ride ended by
   flying through it.

**Branches are kept until they reach `origin/main` now, and every commit is
stamped with its branch.** Richard's correction to the old delete-on-merge rule,
plus a naming convention (`feature/`, `bugfix/`, `mixed/`) and
[.githooks/commit-msg](.githooks/commit-msg) to apply the stamp. **A fresh clone
must run `git config core.hooksPath .githooks`** — it is repo-local config and
cannot be checked in. Full reasoning under *Branches* at the end of this file.

**The third four-player session's eleven.** Written up
in [four-players.md](docs/notes/four-players.md#the-third-four-player-session--eleven-things-and-two-of-them-reverse-a-decision)
and, for the two input ones, [input.md](docs/notes/input.md). The batch: the
maths board is placed in the pane of whoever is actually in the Dojo and sized
against that pane; the two minimaps are dealt to the panes with the most kittens
in them rather than nailed to Ember and Frost; a pane's tag names its own
members; the dealer's cursor freezes on the row it is being asked about; the
shelf names every cursor on a row with the opener last; the profile screen fits
four cards without scrolling; a trade offer is a **set** of orbs and a "no" puts
all of them back; the Cross Slash's seal is re-cut on every stroke; one ability
hits an arena animal once; the camera lets go of a kitten knocked out of the
ring and landed; the griffin's arrival camera looks forward instead of at the
floor; shield moved to the left trigger (Joy-Cons included) and the frame-cost
debug key moved from `P` to `` 1 ``.

**Two of those eleven reversed an earlier decision, and both stayed as
written — Richard playtested without flagging either.**

1. **The minimap moved from the outside corner of its pane to the SEAM.** That
   is what lets two adjacent panes share one map, and it changes the look of the
   **two**-player screen, which has always had its maps in the far corners. One
   argument (`inner`) puts it back, if it is ever wanted back.
2. **The split-direction setting now reaches three arrangements instead of
   one.** It used to apply only to two even panes, so asking for a side-by-side
   screen gave a side-by-side one with two kittens and a stacked one with three.
   The old behaviour was deliberate — a full-width strip is a kinder shape for a
   pair than a tall column, because a three-quarter camera has to pull much
   further back to fit two kittens down a narrow pane — so honouring the setting
   means a player can now ask for the worse shape and get it. `fitDistance`
   makes that survivable rather than broken. Quadrants still ignore the setting
   and `world-check` pins that they come out identical either way.
   **Half-reversed again a session later**: the uneven 3-and-1 pair no longer
   consults the setting at all, because the pane it gave the lone kitten broke
   her dealer card (item 1 of the fourth session, above). The even pair and the
   2/1/1 still follow it.

**Played, pushed and live.** Richard playtested the whole batch and it went out
to `origin/main`, which is what Vercel deploys — so it is on
https://katana-kitties.vercel.app and the nieces have it. The five feature
branches behind it were deleted once merged and pushed; see *Branches* at the
end of this file. The batch: the clan call-to-action, pane
stability and pane colour, the arena floor and the camera ceiling, the Cross
Slash rebalance, `/tuning.html` and the debug panel's door to it,
`public/voice/cross0-3.mp3`, the vendor split into a personal inspector
([systems/inspector.js](src/systems/inspector.js)) and a shared trade screen
that other players opt into with MOUNT, the clan-join celebration, the eight
new sprite sheets it needs (`ember_bless`, `frost_bless` and six
`clan_*.png`), the five fixes from the fourth playtest below, and the Cross
Slash's telegraph.

**The fourth playtest's five, all verified in the browser.** A seat is not a
cat — nine HUD call sites were reading a PLAYER index as a STYLE index, which
is the same number until somebody uses the character picker and then swaps two
players' frames, pips, wedges and *names*; a full-screen scene now takes the
pane frames and cards down with the HUD, because `_paintPaneEdges` only runs
from `_render` and every scene returns before it; a PlayStation pad is told
`○` and a remapped Joy-Con prompt follows what Settings actually bound; one
press of Start no longer both ends the trailer and restarts it, via
`PadState.consume`; and the clan ring sits on the ground under a jumping
kitten instead of on her paws. Written up in
[four-players.md](docs/notes/four-players.md) and
[input.md](docs/notes/input.md).

**The Cross Slash now announces itself, and signs its work.**
[systems/crossfx.js](src/systems/crossfx.js): an aura of her own colour and
pink crackle while she winds up, then a seal cut into the air in front of her —
two of the box's four sides per cut, and the orb's 十 stamped in the middle on
the third — which pulses until she lets go of everybody she caught and then
blows apart along the same vector the bodies go. It is a **poller**: it reads
her clocks every frame through one exported function and `player.js` does not
know it exists, which is the same argument `_updateTripleHolds` makes about the
technique ending five ways. Written up under *The tell you can see from across
the garden* in [endgame.md](docs/notes/endgame.md). **Not yet played by
anybody** — verified frame by frame in the browser, but not in a real fight.

**The dealer's personal card never appeared, and the fix is the trailer's fix
again.** Reported as a clicking sound and nothing on screen. The stall opened
the chooser on `pressed('interact')` and `Inspector._drive`, later in the same
frame, read the same press as *back out* and closed it. The stall spends what
it answers now, and skips a player who already has a card up; `_drive` spends
what it answers too, so closing a card no longer leaks the press into
`Player.update`. Written up under *One press is one answer to one question* in
[four-players.md](docs/notes/four-players.md).

**Two standing rules came out of this batch and are worth knowing before you
generate any sprite.** New player poses are drawn for **all four kittens** —
two sheets plus two `recolourAtlas` derivations, expanded by PLAYER_STYLE and
never by roster slot. And new art is generated with a **transparent
background**, through Higgsfield's `remove_background`, rather than relying on
the loader's white-keyer: the flood fill cannot reach background the lineart has
sealed shut, which is a real risk on anything drawn inside a ring. The loader
needs no change to accept alpha — its flood only seeds from near-white pixels,
and a transparent one reads (0, 0, 0, 0). Both are written up in
[docs/notes/art.md](docs/notes/art.md#two-rules-for-generating-new-sprites).

**A licensing decision is attached to `public/voice/cross0-3.mp3`.** They are
graded from the same reference recording as the trailer's demon laugh, which is
somebody else's clip off a social post and is not in the repo. Until now the
only derived thing shipped was three seconds baked into an MP4; these are four
files served to every player. `tools/kitten-cackle.mjs --game` synthesises its
own ladder when the reference is absent and `Audio.sample` falls through to
four synthesised stand-ins, so deleting them costs nothing but polish — see
[docs/notes/voices.md](docs/notes/voices.md).

1. **The four-player game has been played twice, and the tournament twice.** The
   first four-player session produced ten fixes; the second — four adults on PCs
   in a browser — produced six more, and both are written up in
   [docs/notes/four-players.md](docs/notes/four-players.md). What has *not* been
   watched is a real 2v2 or 2v1v1 with four kids in a room, which is the only
   test that settles the league balance.
   **The thing to watch next time is whether anybody joins a clan.** Nobody did,
   in a whole afternoon, and the fix is in two halves: a prompt over her head
   naming the button she is holding, and two and a half seconds of celebration
   when she presses it — she takes the blessing with both paws, her own camera
   pulls in, her leader dances in her own clan's style, and the other panes
   never notice. So if it happens again the problem is not visibility and the
   next question is a different one.
2. **Numbers most likely to come back, all of them checked** so turning one
   fails loudly rather than silently: `OUT_DAMAGE` (30), `ATTACKS.dash.knock`
   (19), `HANDICAP_MAX` (1.2), `ROUND_LIMIT` (120), `FEAST_TIME` (15),
   `REGEN_FRAC` (0.10), `EAT_TIME` (2.0), the critter `speed`/`hopV`/`cruise`
   values, and `OPEN_AT` (0.80).
   **Most of the combat ones no longer need a code edit** — `npm run dev` and
   `/tuning.html` has every ability's timings and damage on sliders, saving to
   `src/tuning.json`. See [endgame.md](docs/notes/endgame.md#the-balance-page).
3. **The open question no check can answer:** whether carrying damage into the
   next round reads as fair to the girl who just won one. It is right on paper
   and it is the one rule a nine-year-old could reasonably call cheating.
   The Cross Slash has the same shape of question in it: a kitten it catches is
   frozen for about 1.4 seconds before anything visibly happens to her — the
   cutting is `cuts * gap` (0.9s) plus the pause (0.25s) — which is much the
   longest anybody is ever switched off in this game. It measures right and it
   played right in the first two-player pass; whether it reads as unfair when it
   is your sister doing it is the thing to watch for.
   **Four adults have now said the move was too strong**, and the answer was a
   quarter-second planted wind-up before the first cut plus a longer recovery —
   see [endgame.md](docs/notes/endgame.md). Whether that is enough is the next
   thing a real game settles, and it is one slider away either way.
4. **Storm and Blossom are placeholders** — the same two cats recoloured. The
   girls should name them and pick the colours; it is one table in
   `src/core/palette.js`.
5. **Not built, deliberately:** enemies or combat anywhere but the ring; kitten
   customisation; towns on the outer islands; clan camp building. Ideas that
   came out of the clans and are not built: clan-specific missions, a second
   material that resists dragons the way bamboo does, breath types that interact
   with specific props.
6. **The trailer has been played in a browser but not by a child.** Every
   route through it was exercised on desktop Chrome — the title button, the
   pause entry, the one-time offer, skipping, the pause menu surviving
   underneath, and the missing-file path. What has not been watched is a
   nine-year-old meeting the offer screen once and choosing, or the same screen
   on a phone where `start` does not exist and the on-screen CLOSE button is
   the only way out. It is also the only place in the game where a slow
   connection is visible, and nobody has seen it on one.
7. **The confirm dialogs have not been mashed at by four children**, which is
   the only test that matters for them. Verified in the browser: the title
   layout to the pixel, the offer returning on every new game, Space/Enter no
   longer skipping the intro while Escape does, RESTART and QUIT GAME opening
   on their cancel button, the trade question rendering under each kitten's
   name, the record board asking before it signs, and the owner badge naming
   Frost while she drove the menu. What that does not tell you is whether a
   nine-year-old *reads* "no, keep playing" before pressing something, or
   whether one more press between her and RESTART is enough. Watch for the
   opposite failure too: a dialog she has learned to mash through is worse than
   no dialog, because it costs a press and buys nothing.
8. **DROP OUT's confirm is the one route not exercised by hand** — it only
   exists with three or more players and the browser session had two. It is the
   same code path as the other four and `world-check` pins it, but it is also
   the one whose words change per player, so read them once with a third kitten
   in the game.
9. **Ryuuseki's voice is lost.** His two lines exist and sound right; the preset
   that made them was never written down, and five auditions on his own line
   missed by two and a half semitones or more. Desmond is nearest. Do not recast
   him casually — see [docs/notes/voices.md](docs/notes/voices.md), which now
   exists so this cannot happen to anybody else.
10. **`docs/unused-art/` is 19MB of reference sheets the game never loads.** Fine
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

## There is a trailer now, and a second set of Steam art

**`out/trailer/katana-kitties-trailer.mp4` — 1:08.** Twelve five-second animated
shots and eight seconds of the kids' title painting, scored from the game's own
music table. Made on 2026-08-21 with Higgsfield: Nano Banana Pro for the twelve
keyframes, `grok_video` for the animation. Full account, including the three
arguments that had to be settled and the models that did not work, in
[docs/notes/trailer.md](docs/notes/trailer.md).

Four exports. Three live under `out/trailer/`, which is **gitignored** like the
rest of `out/` — the tools are what is versioned — and the fourth is the only
one committed:

| file | for |
| --- | --- |
| `out/.../katana-kitties-trailer.mp4` | the master, crf 17, ~135MB |
| `out/.../katana-kitties-trailer-web.mp4` | YouTube and the store page, 1080p crf 22, ~70MB |
| `out/.../katana-kitties-trailer-720.mp4` | sending to a phone, ~28MB |
| **`public/trailer/katana-kitties-trailer.mp4`** | **in the game**, 720p crf 28, **20MB** |

The in-game one is re-encoded harder than the phone copy on purpose: it is
watched once, in a browser, often on whatever wifi is in the room, and eighteen
megabytes is already the biggest thing in the repo.

Remake the lot with:

```bash
node tools/steam-art.mjs
node tools/trailer-vo.mjs --check      # do the narration takes still fit?
node tools/trailer-score.mjs out/trailer/score.wav
bash  tools/trailer-cut.sh
bash  tools/steam-capsules.sh
```

**The generated stills, clips and narration cannot be re-derived** — they cost
credits and none of the models are deterministic — so `out/trailer/shots/`,
`out/trailer/clips/` and `out/trailer/vo/` are the things in `out/` worth
backing up. Their job ids are in `out/trailer/jobs_img.txt`, `jobs_vid.txt` and
`vo/jobs.txt`. Everything else in there regenerates from the tools.

**`src/core/audio.js` gained one line and no behaviour:** `ROOT` is now
exported, so `tools/trailer-score.mjs` can render the trailer's music from the
same table the game plays from rather than from a transcription of it. That is
the only game-code change in the whole exercise.

**The generated art did not touch the shelf.** `tools/steam-art.mjs` still cuts
the library cover, the icon and the wordmark out of `public/sprites/title_art.png`,
and `tools/steam-capsules.sh` is additive — it writes a separate
`out/steam/capsules/` for the store page and composites the kids' wordmark onto
every capsule that carries the name. The wordmark is never generated. Second
non-negotiable.

**It is in the game, and it costs nothing until somebody asks for it.**
`public/trailer/katana-kitties-trailer.mp4` (720p, **20MB** — the largest single
file in the project) plus `src/systems/trailer.js`. Three ways in: a row of its
own on the title screen, an entry in the pause menu beside WATCH THE STORY
AGAIN, and a one-time WATCH IT / STRAIGHT TO THE GAME / DOWNLOAD IT INSTEAD
before the first game, remembered in `localStorage` under `kk.trailerOffer`.

The `<video>` has **`preload="none"` and no `src` attribute at all** until
`open()` attaches one, and `close()` removes it again. Measured in the browser:
one `206 Partial Content` request, aborted mid-stream on close, so skipping it
stops the download instead of letting 20MB finish in the background. Four
`world-check` assertions pin that, because every one of those failures is
invisible while playing — the game would look identical and simply cost 20MB
more to start, on a phone, on data.

It skips on `SKIP_KEYS` and `_skipPressed()` like every scene, and is checked
*before* and separately from `_sceneActive()` — that predicate means "a scene is
running in the world" in half a dozen places and a video must not start
answering it. `MenuNav.panel()` returns null while it plays.

**Mr. Satan narrates it** (ElevenLabs via Higgsfield, ~0.15 credits a line;
thirteen lines and their timings in `tools/trailer-vo.mjs`), and the score now
has a trailer orchestra over the game's pentatonic pieces — horns, braam,
timpani, ostinato, choir. Higgsfield could not write the music: its audio models
are speech-only. Full reasoning, and the measured voice casting, in
[docs/notes/trailer.md](docs/notes/trailer.md).

---

## Why it lags, and what it is not

**It is fill rate, and `P` now says so on screen.** Reported as "badly lagging
on PC", suspected to be the Kotodama Orb's maths UI or the drifting particles,
and it is neither — both were measured and both are innocent:

- **The petals cost nothing.** 700 instanced quads, one draw call; hiding every
  one of them changed the frame time by less than the noise.
- **The maths overlay costs almost nothing TO DRAW.** A live label repaint
  measures 0.068 ms and they are throttled to one per 80 ms each. Everything the
  mobile pass did there is strictly LESS work than what it replaced, on a
  desktop as much as on a phone — checked against the pre-pass build, which
  draws the identical scene, the identical 600 draw calls and the identical
  287,776 triangles. *(Its UPLOADS were a separate and real bug — see the
  stutter section below. Cheap to draw was the right answer to the wrong
  question.)*
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

**And then the actual answer turned up on the readout's last line: the browser
was on the wrong GPU.** A desktop with an RTX 4060 in it was rendering the game
on the CPU's Intel UHD 770. On Windows a browser gets whichever adapter the OS
hands it; `powerPreference: 'high-performance'` is already set on the renderer
and **Firefox does not act on it**, and there is no Firefox pref that picks an
adapter. Fixed on the machine, not here:

1. **Windows Settings → System → Display → Graphics** → Browse to
   `C:\Program Files\Mozilla Firefox\firefox.exe` → Options → **High
   performance** → Save.
2. **NVIDIA Control Panel → Manage 3D settings → Program Settings** → Firefox →
   High-performance NVIDIA.
3. Quit **every** Firefox process, including Steam's, and start it again.
4. Press `P`: the ⚠ line should be gone and the string should name the 4060.
   `about:support` → Graphics → `WebGL 2 Driver Renderer` says the same thing.

On a desktop, **check the monitor cable first** — UHD 770 is a desktop iGPU, so
if the cable is in the motherboard rather than in the 4060, the iGPU is the
display adapter and no setting fixes it properly.

**The tournament is the proof, not a second bug.** A live round with six
critters on the mat is **73 draw calls and 67,194 triangles** — the cheapest
scene in the game, against 254 and 210,444 standing in the town — and the whole
update loop there is 2.8 ms, of which the critters are 0.059 ms for all six. It
is the worst place to play because it is a flat mat filling the screen at close
range: most expensive per PIXEL, cheapest per object, which is backwards from
where anybody looks.

### "The fps stays the same but it chugs" was two things, and only one was the GPU

A GPU-bound frame with an idle CPU feels exactly like that — measured on that
machine as **js 1.8 ms, gap 10.4 ms**. But that was not all of it, and the rest
was found only after the report *"not a hitch problem, but a stutter problem"*,
which was correct and which the readout could not see: it counted frames over
33 ms, and **a threshold count is structurally blind to stutter**. Frames
alternating 12/21/12/21 give a 60 fps median, a 21 ms worst and zero hitches.

`hitches` is now `stutter` — mean `|dt(n) − dt(n−1)|`, in ms and as a % of the
median — and it found the cause in minutes. **The live labels were re-uploading
from GPU-backed canvases.** A 2D canvas is GPU-backed by default, so repainting
one and setting `needsUpdate` makes three.js `texImage2D` from a live GPU
surface, which under Firefox/ANGLE on Windows syncs the pipeline. Measured in
the Dojo at a matched repaint rate, flipping the flag back and forth:

| backing | median | worst | jitter |
| --- | --- | --- | --- |
| GPU (default) | 10.8 ms | 42.5 ms | **12.61 ms (117%)** |
| CPU (`willReadFrequently`) | 10.6 ms | 22.0 ms | **3.77 ms (36%)** |
| GPU (default) | 10.9 ms | 47.2 ms | **14.53 ms (133%)** |
| CPU (`willReadFrequently`) | 11.2 ms | 20.4 ms | **3.58 ms (32%)** |

Same median in all four rows — 91 fps throughout — which is why every number
anyone was watching said the game was fine. The fix is one flag on one
`getContext` in [label.js](src/core/label.js); static labels deliberately do not
get it, and world-check asserts both halves. Two traps if you re-measure it: a
label only pays this **while it is on screen** (three.js uploads at bind time, so
measuring from the title screen shows nothing at all), and the two runs have to
do the **same number of repaints**.

### And then the defaults went up, because the machine could afford them

With the adapter fixed the same desktop went from chugging to smooth with room
to spare, so **the desktop default is now `high`** (a capable phone already was).
Two things had to happen first:

- **`high` had to mean something.** On a 1:1 panel it rendered at exactly 1.0 —
  the same as `medium` — because the effective ratio is a `Math.min` against
  `devicePixelRatio`. Same bug as `low` having nothing to cut, at the other end.
  `QUALITY.high` now has a **`minRatio` floor of 1.5**: it renders above the
  panel and the browser scales down, which is supersampling, and it is the only
  antialiasing that touches sprite alpha edges and the dashed legs on the unit
  circle. The desktop ladder at dpr 1 is now **1.5 / 1.0 / 0.75**, strictly
  decreasing, asserted.
- **Something had to watch the bet.** `autoQualityVerdict` in `core/device.js`
  steps the quality down one rung after a **median over 25 ms held 4 seconds**,
  waits 3 seconds after any change, never climbs back, toasts what it did, and
  switches itself off for good the moment a human touches the dropdown. It
  watches the **median and never the stutter** — fewer pixels cannot fix uneven
  pacing, and the label bug above proves it.

It is a pure function in `device.js` rather than `if`s in the game loop because
the hard part is every case where it must NOT act, and **the first version got
one badly wrong**: a hidden tab has rAF throttled to ~0.5 Hz, so the ring filled
with 2000 ms frames (measured: a median of **2006 ms**) and the watcher read it
as a slow machine. Alt-tab away, come back, the game had quietly turned itself
down. `visible` is now the first gate and `_discardPerf` throws the ring away
when the tab returns. world-check asserts all ten gates.

**Chrome and Edge need the same Windows fix as Firefox** — the graphics
preference is per-executable — and no page can pick its own adapter:
`powerPreference` is advisory and is the whole API. Paths and verification in
[performance.md](docs/notes/performance.md).

Full numbers and the next lever — `dt` from the rAF timestamp rather than
`Clock.getDelta()`, measured and deliberately not taken — in
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
| [endgame.md](docs/notes/endgame.md) | the ending, the Awakening, the eight orbs, the economy, the Cross Slash rebalance, **and `/tuning.html`** — the balance page every ability's numbers are edited on |
| [story.md](docs/notes/story.md) | the cutscene, the leaders, the shrine scenes, the scene viewer |
| [world.md](docs/notes/world.md) | the clans and their buffs; the panda |
| [art.md](docs/notes/art.md) · [audio.md](docs/notes/audio.md) | atlas cells; the synthesised music |
| [voices.md](docs/notes/voices.md) | **which ElevenLabs preset is which character**, with the ids; how the castings were verified; why Ryuuseki's is lost; why there is no style prompt; why per-line pitch cannot identify a voice |
| [consent.md](docs/notes/consent.md) | why nothing irreversible happens on one press — the confirm dialog and why it has no primary, the per-side trade questions, the two-stage name entry, who drives a menu, and the vJoy button that started the game by itself |
| [rules.md](docs/notes/rules.md) | the gameplay invariants in full, and the measurements behind them |
| [gotchas.md](docs/notes/gotchas.md) | traps that cost real time and are invisible in the code |
| [hosting.md](docs/notes/hosting.md) | Vercel, the Git deploy, the `gh` credential setup, how the screenshots were taken |
| [steam.md](docs/notes/steam.md) | the non-Steam shortcut and its launch flags, the shelf artwork, what Remote Play is and is not |
| [trailer.md](docs/notes/trailer.md) | the 1:08 trailer: how Mr. Satan was cast by measurement, why the orchestra is synthesised, why the 十 is drawn rather than typed, why the player downloads nothing until asked, and why generated art may go on the store page but not the shelf |
| [performance.md](docs/notes/performance.md) | why the frame time is a straight line in pixels, slow vs stutter and why they need different numbers, what is measured NOT to be a cause, the `P` readout |
| [help.md](docs/notes/help.md) | the Help panel and **the rig that films it** — why a hidden tab freezes a capture, why `drawImage` on a WebGL canvas returns stale pixels, why 17MB of imagery is never on the boot path, why "Moving & fighting" is two clips and not one, and the three dragon positions of which only one is stable |

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

---

## Branches

**One branch per batch of work, and it lives until the work reaches
`origin/main`.** This reverses what this section used to say. The old rule
deleted a branch the moment it merged into local `main`, on the argument that
the merge commit is the record and the label is scaffolding. Richard's
correction: local `main` is not where the work lands — `origin/main` is, and
that can be a week later. Between those two moments the branch is the only
handle on "the thing I am about to play", and deleting it early throws that
handle away while it is still needed.

So: branch, work, merge into local `main` with `--no-ff`, **keep the branch**,
and delete it once the merge has been pushed and played.

**Names carry their kind: `feature/`, `bugfix/`, or `mixed/`.** A branch list
read at a glance should say what each one is; `mixed/` is the honest answer when
a batch is roughly half new work and half repairs, which most playtest batches
are. `mixed/third-four-player-pass`, `bugfix/dealer-pane-and-three-more`.

**Every commit is stamped with its branch, by a hook, not by hand.** See
[.githooks/commit-msg](.githooks/commit-msg): on any branch but `main` it
prefixes the subject with `[branch/name]` if it is not already there.

```bash
git config core.hooksPath .githooks
```

That line is **repo-local config and therefore not checked in** — same as the
pinned `InnerBushido` identity. A fresh clone has to run it, and until it does
the stamps silently stop. It is the first thing to check if a commit comes out
bare.

*Why a hook.* The value of the stamp is that it is on every commit, so that
long after a branch is deleted this still answers correctly:

```bash
git log --oneline --grep "\[mixed/third-four-player-pass\]" | tail -1
```

That is the FIRST commit of the batch; its parent is the commit to go back to,
which is the question actually being asked — *"revert to before the four-player
pass"*. A convention followed by hand is followed most of the time, and most of
the time is worthless here: one unstamped commit does not read as missing, it
reads as belonging to something else.

**The merge commit says where the branch started.** The hook stamps the
commits; the merge essay names the branch, the commit it branched from, and its
first commit in prose — so the answer is legible without a `--grep` at all.
`git log --graph` still shows the shape whether or not the label survives.

**`git branch -d`, never `-D`.** The lower-case one refuses to delete anything
that is not fully merged, so it cannot lose work; the upper-case one is for
throwing an experiment away on purpose and should be typed deliberately, never
in a loop.

**Nothing but `main` is ever pushed.** These branches are local, so deleting
one touches nothing on GitHub and there is no `origin/feature-x` to tidy up
afterwards. The repo has exactly one remote branch and that is the intent.

**Push to `origin/main` only once Richard has played it.** `origin/main` is
what Vercel deploys, so a push is a release to the nieces rather than a backup
— "all checks pass" is not the same thing as "it plays well", and the whole
reason for the local-first workflow is that a batch can sit finished and
unreleased for as long as it needs to. Check `gh auth status` first: `gh` is
signed in as two accounts and the active one must be **InnerBushido**, not the
work account.
