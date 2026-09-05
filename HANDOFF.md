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
each a `<details>` a kid opens; **fifteen** GIFs **captured out of the running
game**, three stills, and the Clans topic on the six leaders. A
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

**"Moving & fighting" has a real key map now, not a list.** The topic used to
carry two prose columns; it carries two `<table>`s — *On foot* and *On a
dragon* — with a 🎮 Gamepad column and a ⌨ Keyboard column, so a kid reading
one device's row can see the other's. Every cell is generated from
`PROMPTS.standard` and `KEYSETS[0]` rather than typed, and `world-check` asserts
the pairing, because a button prompt that drifts from the table is a lie the
page cannot detect on its own. The PlayStation and Joy-Con names that no table
can show (`R2`, `SR`) are a note underneath.

**The check that pairs a clip with its size is now general.** It was written for
the two movement clips and stayed pinned to them while nine more arrived;
generalising it immediately found `panda.gif` claiming 640x360 for a 384x216
file. Every `data-help-gif` in the panel is now measured against its own GIF
header and its own 2.5MB cap.

**The Help panel is two subjects deep now.** It had grown to fifteen top-level
cards — four screens of scrolling on a phone before a single picture — so eight
of them fold: *Every button*, *Flying a dragon*, *Fighting in the arena* and
*Good to know* under **Moving & fighting**, and *How the arena works*, *Battle
Feast*, *Power-up orbs*, *Special abilities* and *Dealer's Stall & Trading* under
**The arena**. Eight top-level cards left; nothing is hidden, each is one tap
further in, and each parent still leads on its own clips before the fold. The
arena screenshot is capped to 220px because at full width it filled the card and
pushed its own sub-cards off a phone screen. Two traps came out of it: a
sub-card must not share its parent's `name` (the exclusive-accordion group is
document-wide, so it would shut the card it lives in), and `offsetParent` does
not see a shut `<details>` — browsers use `content-visibility` now, so `MenuNav`
was putting the pad cursor on eight headings nobody could see.
→ [help.md](docs/notes/help.md)

**Four players can be tested by one person now.** `` ` `` then `\` turns
**force-spawn** on; ENTER then seats a third and fourth kitten with no
controllers at all, by sharing each keyboard set between two of them — `R` walks
WASD round a ring of three (P1, P3, **both at once**), `U` does the same for the
arrows, and the one waiting has her score badge dimmed. The "both" stop makes
marching the party to the arena one walk instead of four; it is the only place
two cats move as one, it takes a keypress to reach, and with the toggle off the
ring is one stop long so it cannot happen. Only ever fills a slot that ran out of real
devices, so a second controller turns the sharing off by making it unnecessary,
and turning the toggle off sends the extra kittens home through `_leavePlayer`
like any other way of losing a seat. Two bugs came out of actually playing it: a
joining kitten could not confirm her own character card while her sister held the
keyboard, and **pressing ENTER twice quickly overwrote the first card** — the
second was reachable before this feature (two pads, two fast presses) and is the
first thing that happens with it. → [input.md](docs/notes/input.md)

---

## Open items

**Nothing is known broken.** Both check suites pass and the build is clean. What
is listed here is untested-by-players, not untested-by-machine.

**The last fifteen seconds of a round are new, and not yet played back.**
Built this session, driven in the running game, not yet in front of anybody:

- **A round no longer runs out without warning.** Mr. Satan calls thirty
  seconds, fifteen and ten, and at fifteen a big blinking clock appears under
  the round box — the numbers land on the seconds they name, and under five they
  turn red and he counts them out loud.
  → [tournament.md](docs/notes/tournament.md)
- **The last five seconds have no speech bubble.** The number is on the screen
  eighty pixels high, so a card repeating it is the same thing twice: the count
  goes straight down the speech channel instead. Thirty, fifteen and ten are
  ordinary cards.
- **He gets to finish shouting ZERO.** A round called by the clock waits for the
  shout plus a beat before the banner and whatever he says next — his charging
  sprite goes up while he does it. Every other ending is unchanged: a knockout
  still rings on the frame it always did.
  → [tournament.md](docs/notes/tournament.md)
- **The bell is not part of that wait.** It marks the moment the round ends, so
  it rings on that frame and the banner follows six seconds later. Held back
  with the rest it read as a round ending with no gong at all — and on a draw it
  put the question-mark bell after the joke instead of on it. `endgong` was
  never too quiet: measured offline through the game's own graph it peaks at
  −2.0 dBFS against the FIGHT gong's −2.4, the loudest sound in the game.
  → [tournament.md](docs/notes/tournament.md)
- **The count is ONE take re-timed, not nine takes assembled.** The first cut
  built it from eleven single-word renders and sounded like it. `count.mp3` is
  one continuous performance and
  [tools/capture/satan-countdown.mjs](tools/capture/satan-countdown.mjs) only
  moves its pieces: numbers pinned to their seconds at 1.85x, each shout
  squeezed by as much as its own gap demands (1.00 / 1.66 / 1.46 / 1.52x) and no
  more. **The takes live in the repo now**, under `tools/capture/satan-takes/`,
  so the tool can be run twice.
  → [voices.md](docs/notes/voices.md)
- **A card is shortened by closing its pauses, not by playing him faster.**
  `sat_last2` went out at 1.475x and was heard for exactly what it was. A card
  now has its dead air floored to 0.20s — measured off `last1`, which ships
  untouched — *before* speed is considered at all, and `CARD_TEMPO_MAX` dropped
  1.5 → **1.10** so a line that still does not fit throws with its own text in
  the message instead of shipping fast. The ten-second line was shortened and
  re-rendered to suit; it ships at **1.027x**, and `last1` is byte-identical.
  → [voices.md](docs/notes/voices.md)
- **The HUD clock now counts REMAINING whole seconds, like the big one.** It
  floored before, which was invisible until something was put underneath it —
  and then the two disagreed, 14 over 0:13. The big one could not be the one to
  move: his "ZERO!" is a recording.
- **A round ends on a bell, and a draw asks a question.** `endgong` settles;
  `drawgong` is the same bell bending upward, with a line from him that is
  worth losing a round for.
- **Mr. Satan's collider is him, not his address.** It was pushed once at boot
  and never touched again, so the town square had an invisible man in it from
  the first frame and a second one after he walked to the arena. It follows him
  now and turns off with his sprite.

**The shield costs something to run into now, and is not yet played back.**
Asked for after a round where one kitten held the block button from the bell to
the bell: a bubble that pays nothing to be hit gives the girl attacking her no
move that changes anything.

- **A blow halves the block's CEILING and leaves the clock alone.** Two seconds
  up for half a second becomes a one-second block with half a second left —
  the sum as it was asked for. It halves `wardMax`, never `wardUsed`, and that
  choice is what made the "about to expire" flicker come out right for free:
  `left = max − used` corrects itself, so a struck bubble warns exactly like an
  untouched one at the same time remaining. Spending the price out of the clock
  would have jumped past the warning instead.
- **Two blows smash it whatever the clock says.** Halving a positive number
  never reaches zero, so `WARD.hits` is the floor — without it a kitten who
  blocks early enough rides a sliver of bubble all round.
- **Three outcomes, three answers.** Absorbed is a low dink (`wardabsorb`);
  expired and smashed are the same high glassy break (`wardbreak`) plus fourteen
  shards thrown off her chest. The old flat `wardhit` is deleted — every block
  now costs her something, so there is no free-block sound left to play.
- **A ring-out still pierces it and still does not charge it**, and the shards
  are drawn outside the bubble's own early return, because the smash drops the
  bubble on the frame it starts them.
- `hitCut`, `hits` and `breakT` are on `/tuning.html` with the rest of WARD.
  37 new checks. → [endgame.md](docs/notes/endgame.md)

**Five more reported from play are fixed and not yet played back.** This batch
came in as one list and two of its items turned out to be the same bug:

- **The clock running out puts the camera on Mr. Satan.** He has a speech at
  zero and at a draw, and the shot used to be of two kittens standing still
  while a man in a box shouted somewhere off screen. A `ko` that was called by
  the CLOCK pushes in on the booth; a knockout deliberately does not, because
  the thing worth looking at there is the kitten who just went down.
  → [tournament.md](docs/notes/tournament.md)
- **...and he is now IN the booth while it happens, which he never was.**
  Found by pointing that camera at him and seeing nobody. `ArenaQuest`'s
  doorman ran every frame of the tournament: the torii is on the arena island
  ten units from where the griffin lands, so the frame after the ride it
  dragged him back out of the announcer's box, and once the fighters took their
  marks 62 units away it teleported him three hundred units into the town
  square — wearing "I need BOTH of you here" over his head for the whole round.
  Every round ever played had an empty box. It is guarded on `Game.inMatch`
  now, which is the getter that already spans the two picker screens as well as
  the live round.
- **Both minimap bugs were one bug.** Zooming with a bumper picked the wrong
  pane's map, and Z stopped working when Ember's map became a shared one —
  because `assignMaps` incumbency only ever moved a map TOWARDS a fuller pane,
  so a pair forming and then splitting stranded the lower pane forever. A
  fourth, convergent step ties back towards the lower pane index and strictly
  lowers the sum of occupied indices, so it settles and cannot flicker.
- **Z and X are real keys now, not debug ones**, and between them they always
  reach both boxes: Z is anchored to player one's map however it is shared, and
  on a collision X takes the other one. The map tag says which key turns it.
- **The debug panel is a shorter, ordered list.** The seven dragonball scenes
  went; the scene viewer is in the order the story actually happens in; **7**
  goes to the arena; **4** ENDS the current bit — round, ceremony or feast; and
  **5** NUDGES it on — a live round steps 30s, 15s, 5s, then out, and a scene
  steps one line. `M` and `Z`/`X` were promoted OUT of debug into documented
  keyboard controls rather than deleted — the maths overlay is the first
  non-negotiable and the map zoom was asked for in the same breath.
- **The clan-join callout is readable.** It was a quarter smaller and it
  breathed down through half opacity; it is 0.9 → 1.15 high at 76px, and the
  breath now lives entirely above 0.9 so the text never thins out.

**Six reported from play are fixed and not yet played back.** All are in
`git log` and in the notes; listed here only because nobody has confirmed them
at four players yet:

- **Riverclaw stopped charging its oath on the orbs' bonus.** `_reach()`
  multiplied the clan buff by the orb total, so three Long Cut orbs under
  Riverclaw came out at 3.42 — an 11.6m blade. Bonuses add now: 2.70.
  → [tournament.md](docs/notes/tournament.md)
- **The lone kitten in a 3v1 split gets her pull-back at last.** `paneWiden`
  was correct and only the shared rig ever called it, and a shared rig is never
  a group of one. 24.0 → 63.3. Her sisters' wider pane comes in 25% the other
  way. → [four-players.md](docs/notes/four-players.md)
- **A swing at an animal is a swing.** The swat had no facing test and 35% more
  reach than the blade; it uses `ATTACKS.stand`'s own arc and reach now.
- **An animal can no longer take the Cross Slash away from across the deck.**
  The veto searched with her real reach, so a better katana meant a bigger
  dead zone. It is the eat gesture only — holding one, or standing still on one
  inside a fixed 3.4.
- **Joins and starting marks scatter.** Three kittens joining used to land on
  one point, which force-spawn made the ordinary case.
- **A kitten who drops out leaves eight orbs, not one and six ghosts.** The
  drop fans out, and her worn shells are taken out of the scene — they were
  not, and stayed there frozen for the rest of the game.

**There is an alpha channel now, and the God Doc keeps its own tables.** Two
things that are not gameplay and are live already:

- **`origin/alpha`** is the version other people are asked to play, at
  `https://katana-kitties-git-alpha-dream-dojo.vercel.app`. It only ever
  fast-forwards to local `main`, so it can never be ahead of the real game in
  content, only in *release*. Richard has played through the force-spawn ring
  and the folded Help list and said so, so `origin/main` and `origin/alpha` are
  both level with local `main` as of that push. See **Branches**, at the bottom
  of this file.
- **[tools/doc-sync.mjs](tools/doc-sync.mjs)** writes PROJECT.md's controls and
  balance tables out of `input.js` and `player.js`. A `pre-commit` hook re-runs
  it whenever a commit touches either, and `world-check` fails if they have
  drifted. Written because the Joy-Con prompts had been wrong in the game for
  months and the doc did not even have a Joy-Con column to be wrong.
  → [docs/notes/docs.md](docs/notes/docs.md)

**Six more reported from play, all fixed, none tried by a player yet.** The
newest list, on `mixed/pause-menu-orbs-cameras`:

1. **The pause menu was fifteen rows and is six.** "Can we clean it up or
   organize it by breaking the commands into sub menus — Gameplay, Players,
   Storyline, Stats/Features." Grouping in place would have made it *longer*
   (fifteen rows plus four headings), so the three groups that are never urgent
   moved one press down: **KITTENS & SCORES** (profile, record board, DROP
   OUT), **WATCH AGAIN** (story, trailer) and **END THE GAME** (restart, title,
   quit). What stayed on top is what is asked for mid-game. QUIT THE MATCH is
   the one exception — the only ending that is ever urgent, and hidden unless a
   match is live. The seventh non-negotiable comes out *stronger*: nothing that
   ends the afternoon can be reached by overshooting RESUME any more.
   Settings gained a **Maths overlay** row — automatic / always on / always off
   — because "we may remove those from the controllers in the future", and
   because a kid on a phone has no `M` to press. Automatic is not the same as
   on: it is off on a phone and the Dojo turns it on when she walks in, and it
   stops doing that the moment she answers the question herself.
   Four scattered copies of "which panels sit over the pause menu" became one
   `SUB_PANELS`, which is how the fourth copy was found to have never heard of
   `panel-board` — a pad in the record board was really driving the pause menu
   behind it, and the board's own `data-nav="scroll"` had never once fired.
2. **Her worn orbs are orbs now, and one of them answers the row she is on.**
   "It just shows the kanji character and colour, and it's hard to know which
   one relates to which ability", and "the orbs at the top are in a square
   shape, may look better circular, 3D-ish like a dragon ball". Both are one
   card. The slots matching the cursor row light up, lift, and the rest step
   back — only when she actually wears one, because dimming all eight to point
   at none of them is a card that looks broken. The shape is
   `out/trailer/shots/s12.png`, the game's own promotional art of these eight
   objects, in CSS: glass sphere, specular highlight high and left, a coloured
   bloom, and a neon ring orbiting on a tilt with its top open so it passes
   behind the ball. The shelf's dots are the same glass, because they are the
   same eight objects seen twice.
3. **A pane the layout narrowed pulls its camera back.** With the split set to
   Top and bottom and one kitten against the other three, the 3v1 branch
   overrides the setting to a 62/38 side-by-side, so she got a 730x1080 column
   — and `fitDistance` had nothing to say about it, because it frames a *group*
   and her group is one kitten. Every distance in `_updateRig` is a constant
   tuned on a full-width screen. `paneWiden` is the missing term: *no pane
   shows less of the world across it than a quadrant of the same screen would*,
   which is her own remedy, and works out at **2.63x** for her column and 1.62x
   for the trio's. An even split is exempt — two even panes are just as narrow
   and are the two-player game, which may not move.
4. **The Dojo's board takes its full size and the top corner in a shared pane.**
   Side by side with two kittens in one pane it was 42% of 960 — a 403px board
   where an unsplit screen gives 540, and the one thing the room exists to
   teach was too small to read. 42% is a rule about not covering *the* player
   and stops being that rule when the pane belongs to two or three of them. It
   goes hard into the pane's top-outer corner, dropping below the scoreboard
   only when the two would actually meet, and it stops before the pane's own
   minimap — asked of the same two functions that place the map, because the
   hand-rolled reservation was sixteen pixels short.
5. **Blossom's arrows pointed diagonally and her box was twice as high.** One
   cause, both symptoms: `.tp-keys` was the only item in a nowrap flex row with
   a shrink factor, so a name too long for the column had its width taken out
   of the arrows and `◀ ▶` wrapped onto two lines. Only her name is long
   enough. The prompt is the instruction that screen exists to give, so it is
   the last thing that may shrink; the name is an element now so the squeeze
   has somewhere else to go, and the column is wide enough that in practice
   nothing gives at all.
6. **Debug `4` ends the round instead of killing Frost.** It hit
   `this.players[1]` for her whole health bar — written when two players was
   the only number there was. At four it killed one kitten and left two
   standing; in a 2v2 it did not end the round at all, because a side is not
   out until everybody on it is. The `ROUND_LIMIT` damage decision is
   `Tournament.callOnDamage` now and both the clock and the key go through it,
   so they cannot disagree about who won. Nobody is hurt to end a round: a
   round called on time is not a knockout.

**Six before those, all fixed, none tried by a player yet**, on
`mixed/satan-gate-input-fallthrough-orb-depth`:

1. **Mr Satan answers the arena gate now.** The arena island is flyable the
   moment it appears, so two kittens could land at the torii and find an empty
   ring: the tournament only ever opened from the town square. He steps out to
   the gate while two or more of them stand at it and walks home when they do
   not; a kitten alone there is toasted both of her ways out. The town is still
   where he lives, so a pair who never fly north see exactly the game they saw
   before. See
   [tournament.md](docs/notes/tournament.md#he-answers-the-arena-gate).
2. **MenuNav never paid for the presses it acted on**, and that one omission was
   two of the reports: backing out of the pause menu next to the dealer opened
   the dealer, and confirming CHARACTER PROFILE offered whichever orb the cursor
   was on. It runs first in the frame, so everything else was downstream of the
   edges it left behind. It spends them now, before it acts on them, and only on
   the pads that pressed. `Inspector` also remembers the card the trade window
   was opened from, so BACK is one layer and START is all of them. See
   [input.md](docs/notes/input.md#menunav-never-paid-for-the-presses-it-acted-on).
3. **Both Joy-Con button clusters were named a rotation out.** The clan oath
   said "Press A" on the right half when the button that swears is Y, and
   "Press RIGHT" on the left when it is the one at the top of the pad. The
   reading side was right the whole time — `VJOY_BUTTON_NAMES` was lying about
   what those indices are CALLED. One measured button per cluster pins the
   rotation and the other three names follow, because a d-pad and a face
   diamond are rigid. `pad-check` pins both strings as a MEASUREMENT.
4. **The orbiting orbs' text drew through the world.** Kanji, katakana rain and
   the live `cos ... sin ...` readout all had `depthTest: false`. Turning it on
   is only half the fix — the mark is a quad pinned to the middle of a sphere,
   so depth testing alone strobes it in and out of its own ball. `faceCamera`
   lifts each quad 0.62 along the line to the camera, per pane, without
   accumulating. The plain Kotodama Orb's unit-circle diagram was deliberately
   left alone: that is the teaching overlay, not a label.
5. **The trade window opened with an orb already offered**, and an offered orb
   went on wearing her cursor ring after the cursor had left it. The first is
   (2) plus a per-side arming latch that waits for a release — with a 0.6s
   grace, so a stuck vJoy button cannot lock her out of the screen. The second
   is two CSS rules where there was one: gold for the table, her colour only for
   where she is, both when both are true.

**Six reported from play before those, all fixed, none tried by a player yet.**
They came in as one list and are unrelated to each other, so they went on one
`mixed/` branch:

1. **Mr Satan's announcement waited for everyone to get off the dragon.** The
   `pending` stage of `systems/arenaquest.js` held while any kitten was mounted
   or riding along — and *riding Ryuuseki is what opens the stage*, so the
   speech that should follow the flight only played once they had all landed.
   The only gate now is "no other scene owns the screen". A mounted kitten is
   safe through a scene: `Player.update` is not called while one is running, and
   a ridden dragon has no will of its own. Verified in the game, not reasoned —
   filmed a kitten at y = 27 through the whole scene and read her position, hp
   and mount back afterwards, unchanged.
2. **He had no minimap icon.** He does now — a gold star, drawn before the
   kittens so nothing hides him, named at zoom. `world-check` finds it by the
   longest run of consecutive two-argument canvas ops, which is unique to a star
   (the dealer's diamond is 5, a kitten's wedge is 4, a dragon's is 3).
3. **The ending now clears the sky.** See
   [endgame.md](docs/notes/endgame.md#the-world-gets-its-morning-back): a second
   sky channel, a 12-second dawn inside Patchfur's first two lines, the fog
   pushed off the far islands, and cloud shelves that are **geometry, not
   shader** — three attempts at painting them into the sky dome failed because
   this camera looks down.
4. **The Help page said nothing about player 2's keys, and the clip taught the
   wrong one.** Both fixed, and `move-keys.gif` re-filmed — details in
   [help.md](docs/notes/help.md#the-clip-taught-the-wrong-key-for-a-while).
5. **A joining kitten landed between the party**, which on the home island could
   drop her on a clan leader and open his cutscene. She lands in the town square
   now when the party is home, at the party's centroid otherwise, and either way
   through a spiral search that skips solids and keeps clear of any leader she
   has not met.
6. **Minimap zoom is shared.** With four players and two maps, a kitten whose
   pane has no map of its own drives the *nearest* one instead of nothing at
   all, and the toast says which. `nearestMap` is a pure function in
   `core/split.js` so the assignment can be asserted; the two-player answer is
   pinned bit-identical.

**Played, pushed and live — the Help overhaul.** Richard tested it and confirmed
it works, so `feature/help-onboarding` merged into `main` and went to
`origin/main`, which Vercel deploys. The branch is **kept** until it has been
tried on a real phone, which is what the push was for.

**The Help page owes no more clips.** All three that this file listed have been
filmed. `move-arena.gif` and `move-air.gif` gave "Moving & fighting" a second
row — the ring, where a slash is allowed to land, and the sky, where the same
four buttons mean four other things — with both input diagrams on every frame;
all four clips in that topic are cut to **exactly 13.92s** by
[tools/gif-sync.mjs](tools/gif-sync.mjs), which rewrites frame delays without
re-encoding, so a row stays in step forever. `phone.gif` finished the list.

**"On a phone" leads on a clip now, and the reason is one gesture.** The
double-tap **lock** — tap a button twice, take your thumb off, it stays down —
has no name a nine-year-old knows, and every sentence written for it read like a
riddle. Shown, it is one beat: the thumb lifts and the button stays gold. The
clip runs 23.3s at 512×280 and is **608KB**, the second-smallest in the panel,
because the camera never moves. The overlay in it is **redrawn every frame from
the live DOM's own measured rectangles** — `getBoundingClientRect` and
`getComputedStyle` on the real `#touch-pad` elements — because `readPixels` off
the backbuffer cannot see a DOM overlay at all, and a hand-drawn pad would have
been a lie the first time anyone moved a button. Filmed at a real phone
viewport (812×375), which is what puts `--tp-unit` at 68px. The traps it cost —
CSS transitions that never advance inside a synchronous capture loop, a
double-tap window measured in wall-clock time while the capture runs 5× faster
than the clip, and a camera pin that landed on a camera nothing drew — are all
written up in
[help.md](docs/notes/help.md#the-phone-clip-filming-an-overlay-the-camera-cannot-see).

**Filming the lock found a real bug, which is the second time a Help clip has.**
A latched SHIELD did not *look* latched: `_updateTouchContext` runs before the
player controller, and its old test fired on the exact frame of the second tap —
the release between the taps had charged `wardCool` — deleting the `.locked` the
pointer handler had just set, after which `_latchWard` zeroed the cooldown and
nothing put it back. The shield stayed up with nothing touching the glass and
the button looked untouched. The rule is now the pure function
`wardLatchExpired` in [core/touchpad.js](src/core/touchpad.js), pinned by seven
`pad-check` assertions — pure because it has been got wrong **twice**, both
times by testing something momentarily true on the frame the gesture is still
being made, which is the one frame no amount of playing reproduces on demand.

**Moving & fighting is four topics now.** It was one card carrying two rows of
clips, two tables and two paragraphs — everything a player does, stacked, in one
scroll — and the clips were the casualty: the dragon and the arena were each
half a panel wide with a footnote under them. Split by what you are DOING, which
is how a reader arrives. **Moving & fighting** keeps the keyboard/pad pair and
both key tables; **Flying a dragon** and **Fighting in the arena** each lead on
their clip at full width with a caption set big enough to read first; **Good to
know** takes the two paragraphs that belong to neither.

**The cat pad is on the page.** The drawn controller that lights up inside
`move-pad.gif`, transcribed out of the capture kit into SVG in the same 280×214
box, sitting under each of the two new topics with that section's buttons lit —
every face button in the air, only two in the ring, and the topic says out loud
why the other two are dark. PlayStation shapes on purpose: the tables carry Xbox
lettering because that is what most PC pads are printed with, and this is the
one place Help can show a shape a child matches to the plastic in her hand.
Defined once in `<defs>` and reached by `<use>`, which cost one bug worth
knowing: **a `<use>` clones into a shadow tree**, so `.catpad .cp-pink` matched
nothing and the cat came out a black silhouette. Only styles computed on the
ORIGINAL carry across.

**Two fixes underneath it.** `interact` was missing from the key map entirely —
it is the button that joins a clan, absent from the clips on purpose, but a key
map is not a list of what the pictures happen to show. And the keyboard column
ran off the right of the panel: not the chips' fault, but `min-width: auto` on a
grid item, so each table demanded 323px inside a 305px track. `min-width: 0` plus
`table-layout: fixed` fixed it, and WASD is a cross now — W over A S D, smaller
than the other chips, narrower and truer than the row was.

**A clip restarts when its topic opens or closes.** A GIF keeps running inside a
collapsed `<details>`, so a second visit joined a twenty-second lesson halfway
through. Done by changing the src FRAGMENT — it restarts the animation and is
stripped before the request, so the body comes out of cache.

**`gif-sync` was stretching the clip it was supposed to be syncing, and only a
player saw it.** Two clips loop together when their totals match, and the way it
bought the shortfall was to spread it across every frame — which turned
`move-pad`'s 8cs frames into 10cs and its 14cs into 17cs, a fifth slower than
the run it was filmed alongside. Richard watched the pair and said the pad one
looked stretched. It was. `spread()` is `padTail()` now: **the shortfall goes on
the last frame and nowhere else**, so a clip plays at the speed it was shot and
waits at the end.

The check that missed it asserted equal *totals*, which were exactly equal the
whole time it was wrong — a check on the number the fix produces rather than on
the behaviour it was for. `world-check` now compares **modal frame delay** per
row, and for `move-keys`/`move-pad` — one run filmed twice, so they can promise
it — **frame-for-frame delay equality**. Row 2 is two different demonstrations
and is deliberately not held to that; both rows cap a body frame at 30cs and a
tail at 300cs, which is what catches a stretch by shape rather than by total.

**One thing is open, and Richard has closed it as won't-fix**: the touch
overlay's glyphs read `Y / ZR / X / A / B` on a screen where no such buttons
exist. He looked and decided to leave it — `ZR` reads acceptably as a mobile RUN
button, and the Joy-Con `SR` question underneath is moot while the Switch 2 pads
are not being documented. Written down so the next session does not re-open it.

**The capture rig is in the repo now — [tools/capture/](tools/capture/README.md).**
It never was: it lived in a temporary session directory, and every session that
wanted to film something began by recovering it from the last one's leftovers.
The master frames are hundreds of megabytes of raw RGBA that die with the
browser tab, so the shot script is the only thing that can ever re-cut a clip.
Checked in: the bridge, the browser harness, the shot kit, a GIF decoder and
frame-dumper, and **eight shot scripts covering ten of the fifteen clips**. Made
portable on the way in — two node files and three shot scripts had this
machine's absolute paths, or a dead session directory, typed into them.

**`README.md` is the point of it.** The code was always recoverable in
principle; the DIRECTING was not written down anywhere. It carries the craft, all
of it learned by being told it was wrong: a caption needs longer on screen than
the action under it, a pause is played rather than frozen, one idea per beat, pin
the camera and pin the right one, hand the shot back to the game where the game
already directs, trigger off state rather than frame numbers, and measure the
game instead of reasoning about it. Plus the byte budget — frame CHANGE is the
cost, not frame count — and the traps a synchronous capture loop creates.

**A correction worth keeping.** This file and `help.md` both said the script
behind `move-keys.gif` and `move-pad.gif` "did not survive". **It had.** So had
panda's, dojo's and the dealer's — all sitting in an older session's scratchpad.
Richard pushed back on the claim and it did not survive checking. Five clips
genuinely have no script (`ability-ward`, `ability-charge`, `ability-dive`,
`ability-cross`, `feast-eat`, all filmed before the rig existed); everything else
can be re-cut today.

Worth knowing which way re-cutting cuts: re-*encoding* one master at several
sizes is cheap and directly comparable (`move-air.gif` was encoded four times off
one take, `phone.gif` seven), while re-*shooting* is not — the kitten lands on
different frames and the interframe diff finds different work. **Film at 936 wide
and publish at 512**; roughly 3.3 real pixels average into each output pixel and
that averaging is the anti-aliasing.

**[PROJECT.md](PROJECT.md) exists, and it is the page a HUMAN gets pointed at.**
Everything a person needs to understand this project was true and written down
and spread across twenty-four files, which is the same as not being written
down: `CLAUDE.md` is short on purpose and aimed at an agent, `HANDOFF.md` is a
running log, `README.md` is for somebody who wants to play, and the design notes
are each gated behind *"read this before you touch that"*. Nothing said, on one
page, **what this is, how to run it, how to test it, how every asset in it was
made, what it costs, and where it is going.** That is now one file.

It is a register rather than an essay: the debug keys, the balance page, the
player numbers at a glance, both keyboard sets against both pad letterings, a
row per generated-asset pipeline with the command that makes another one, the
accounts with a **last-updated date on them**, all nine non-negotiables, every
document in the project, and the four networking answers. Almost every line
points somewhere deeper rather than restating it.

**`world-check` enforces the register, which is the only part of it a reader
cannot check for themselves.** Seven new assertions: the last-updated line
exists and parses, every design note is linked, every top-level document is
named, every tool a person could run is named, the capture rig's guide is
pointed at, and CLAUDE.md and PROJECT.md quote the *same* two check totals — a
number that has drifted in this repo twice already. Prose is not checked and
could not be; **coverage** is, because a cheat sheet's whole value is being
complete and a stale one does not fail loudly, it quietly teaches somebody a
thing that stopped being true. `tools/capture/*` is deliberately out of scope:
that rig has its own README and one page should point at it, not inline it.

**The phone-over-Wi-Fi steps are written down for the first time**, in
[mobile.md](docs/notes/mobile.md) with the short form in PROJECT.md and
`CLAUDE.md`. `npm run dev — --host`, then type the `Network:` URL Vite prints
into the phone. Three things break it and **all three fail the same way — a
timeout, with no error anywhere**: no `--host` (Vite binds `127.0.0.1` only, and
still reports success), Windows Firewall refusing inbound Node, and router
client isolation. Verified rather than assumed on this machine: node.exe has
four enabled inbound Allow rules and they are scoped to the **Public** profile,
which is what this Wi-Fi is classified as, so it works as it stands.
`.claude/launch.json` carries it as `katana-kitties-lan`, deliberately not
`autoPort` — the URL is being read off a screen and typed with a thumb, so the
port has to be the one the doc says. One caveat worth keeping: `--host` also
exposes `/tuning.html`, whose save endpoint writes into the source tree
unauthenticated. Fine at home. Not fine in a café.

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

**Work branches stay local.** `feature/`, `bugfix/` and `mixed/` branches are
never pushed, so deleting one touches nothing on GitHub and there is no
`origin/feature-x` to tidy up afterwards. **`origin` has exactly two branches**
and both are long-lived: `main` and `alpha`.

**`alpha` is the testing channel**, and it is the reason this section no longer
says "nothing but `main` is ever pushed". It is a plain branch that only ever
**fast-forwards to local `main`**:

```bash
git checkout alpha && git merge main --ff-only
git push origin alpha
```

`--ff-only` is the whole rule. `alpha` may never carry a commit that is not
already on `main`, so there is no such thing as a fix that testers have and the
real game does not, and no merge ever has to come back the other way. Vercel
builds it at a stable alias — `https://katana-kitties-git-alpha-dream-dojo.vercel.app`
— and that link is the entire distribution channel. PROJECT.md §3 has the rest.

**Push to `origin/main` only once Richard has played it.** `origin/main` is
what Vercel deploys, so a push is a release to the nieces rather than a backup
— "all checks pass" is not the same thing as "it plays well", and the whole
reason for the local-first workflow is that a batch can sit finished and
unreleased for as long as it needs to. **Pushing `alpha` is not a way around
this**: it is the step before it, and it goes to testers rather than to the
girls. Check `gh auth status` first: `gh` is signed in as two accounts and the
active one must be **InnerBushido**, not the work account.

**A second hook runs on commit.** [.githooks/pre-commit](.githooks/pre-commit)
regenerates PROJECT.md's controls and balance tables whenever a commit touches
`src/core/input.js` or `src/entities/player.js`, and re-stages the file. It
needs the same `core.hooksPath` line as the stamp hook, and `world-check` is the
backstop for a clone that has not run it.
→ [docs/notes/docs.md](docs/notes/docs.md)
