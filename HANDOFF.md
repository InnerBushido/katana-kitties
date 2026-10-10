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
seat is asked for rather than dealt to nobody: **press A or START on a spare
controller** (`Game._autoSeat`, via `Input.sparePad` — a press edge, not merely
having touched the pad, which is what lets a kitten drop out and come back) or
press **ENTER**, which lands her on the ARROWS / `O K L ;` set because player 1
already has WASD. A third and fourth join the same way, mid-game, without
interrupting anybody. Anyone who joined can drop out again from the pause menu —
that used to be offered only above three players. The screen gives a pane per
*group* of kittens standing together, not per kitten, and **a minimap in every
pane** (*Settings ▸ Minimaps* can put it back to two, shared; at two players the
two settings are the same screen bit for bit).

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

**Quests pay out at the Awakening, at a ceremony, one KITTEN at a time.** Nine ways to earn a free
Powerup Kotodama, listed in `systems/feats.js` and read by both the Help card
("Quests & achievements") and a checklist on the Character Profile. Four are
anybody's (six oaths, 45s in the Dojo, a fully grown panda, flying Ryuuseki);
five go to one kitten (first to 45s in the second seat, the last prop, most
mischief, most dragon balls, most plain orbs — the old Awakening prize, now on
the list and paid at the ceremony rather than on the Awakening frame) and draw from the WHOLE roster, so they are the only free route to a
rare orb. Earned before 100% it becomes a small gold token circling her, with a
chime and a zoomless bless; at 100% the door shuts and, once no scene is up,
each kitten in turn is handed EVERYTHING she won at once — `#award` names the
orbs in their own colours, she holds the bless for 3.5s with her camera in, and
two seconds later it is the next kitten's turn. `feats.ceremonyBusy` shuts Mr
Satan's griffin until the last turn is done, and a kitten who leaves first is
paid silently on her way out. A save carries each kitten's ledger, and — new,
because a quest now depends on it — how many plain orbs she is holding, which
nothing recorded before. **Not yet played back.**

**And the elder counts the last five down.** Under five pieces of mischief left
she names the number every time one goes over, in seven new recordings of her
own, over Mr. Satan's announcer card — which now carries a speaker per line
rather than one baked-in announcer, because the barrel that takes the count to
four is quite capable of being the one that crosses 80% and opens the
tournament. A minute with the number unmoved and she points at Icewhisker **and
at the island the shrine is on**, but only if nobody in the party has Sense
Mischief already, and never more than three times. At three left, every pane's
minimap starts marking the nearest thing still standing — the same target the
buff's chevron uses in the world, handed over rather than solved twice. **At
three and not before, whoever has sworn**: the oath buys the chevron, the count
buys the map.
`systems/lasthunt.js`, and [docs/notes/endgame.md](docs/notes/endgame.md) for
why the three help each other in that order.

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

**...and so are the town's buildings and trees, and the cut has a floor now.**
"Enable the x-ray shader when the player goes behind buildings or trees so that
they can see mischief hiding behind them. Also fix the x-ray issue where we can
see through the ground that Mr. Satan is standing on." Both, and the second one
was not a bug in the cut: his feet *are* the lid of his box, which is genuinely
between the camera and his chest, so a cone that reaches his head is correctly
taking the floor out from under him. The fix is a per-cut **floor** —
`uCutFloor[i]`, defaulting to `-1e9` so every existing caller is bit-identical —
below which nothing is discarded. Measured at ~1000 px of lid restored across
eight approach angles, with a kitten standing on it, because the earlier
eyeballed screenshots were dominated by his own animation. The town's cut is
aimed **per pane** from that pane's own members, or the kitten in the top-left
quadrant bores a tunnel through the tea house in the bottom-right one. Town
shadows stay **on** while the arena posts' stay off: the cut is a `discard` in
the colour pass, so a hole through an eleven-unit post leaves shade that reads
as a bug, and a two-unit porthole in a ten-unit building does not. Costs
**0.3 ms of 11.0** — six samples, identical draw calls and triangles.
[performance.md](docs/notes/performance.md).

**...and then the x-ray was turned down, per object, because it was eating the
town.** "The transparency effect is happening on the ground... Shouldn't happen
on small things like lanterns. Shouldn't happen on buildings when player is in
front of them. We can have the shader affect happen to the bushy part of the
trees but not needed on the trunk... We mainly need the shader on the big,
castle shaped, building." Three separate things under one report:

- **The "ground" was the roads.** Paving is in the same merged `decor` mesh as
  the trees, so it was being cut like everything else and reading as a hole in
  the island. Roads and the bridge deck are now `0`.
- **"Buildings when the player is in front of them" was a real geometric bug.**
  The cut tested `t < 1` — a projection onto the camera→chest ray — and the
  camera looks *down*, so the roof of a house standing *behind* her projects to
  `t < 1` and was cut anyway. The honest test is euclidean and is now
  `if (dot(av, av) >= len2) continue;`.
- **Strength is per vertex now**, not per object: `attribute float xrayK`,
  written by `mergeParts` for every vertex it ever writes (default 1, so the
  grottos and arena posts that never ask for it cannot be handed a missing
  attribute and silently lose their x-ray). It scales the cone's radius, its
  softness *and* the final cut, so a small `k` is a smaller, weaker, never-quite
  -invisible hole. `XRAY_K` in [world.js](src/world/world.js) is the whole
  table and is the thing to edit: road 0, bridge 0, lantern 0.25, torii 0.3,
  trunk 0.25, canopy 0.85, stall 0.55, house 0.6, **keep 1**. A cherry tree is
  stamped twice — trunk from the canopy — which is why this is an attribute and
  not two materials.

**The side-by-side split was zoomed in, and only at two.** `paneWiden` used to
ask whether a pane was over its share of the screen; it now asks the question
the complaint was about — *does this pane show less world across it than a
quadrant of the same screen would* — and widens until it doesn't. Only the even
**side-by-side** case changes; stacked already clamped to 1, and the 62/38
asymmetric numbers (1.211 and 2.637) come out bit-identical, which is
non-negotiable 5 and is pinned by its own checks.

**Escape on the keyboard is player one's menu, always.** It used to hand the
menu to the first player whose `source === 'keyboard'`, which at four players
with two pads is not necessarily her. "One player drives a menu" is
non-negotiable 7; who that is should not depend on the seating.

**`8` knocks the mischief over in batches.** 50 a press to 200, then 5 to the
end — 216 props is a long afternoon to reproduce by hand. It goes through
`_wreckWorld`, which now takes a `limit`, so props fall by the same path a
katana knocks them down; the 100% blocks came out of `onMischief` into
`_mischiefComplete` so the batch fires the ending exactly as play would, and
`arenaquest` reads the count live so 80% opens the arena on its own. PROJECT.md
§4.

**The bridge is run over, not walked under.** "Make it that user can glide or
automatically step up/down across the bridge when running over it, rather than
walking through/under it." The arch was ten stepped platforms with risers of
0.65 and 0.56 against `heightAt`'s 0.4 step tolerance, and the first plank sat
0.86 above the road — the near end was *literally unreachable on foot*, so she
walked through it. It is one deck now with a `yAt(x, z)` that returns the sine
arch's local height, which removes every riser and keeps the one-way rule
honest: a kitten in the riverbed is compared against the 2.7 above her head, not
against the 0.52 at the ends, so she still passes underneath. The old check
asserted the deck was *stairs* and passed the whole way through the bug; it is a
walk now — step a kitten across the crossing at 0.2 units a sample and ask the
world where she ends up.

**Every asset is filed by subject.** "We have a lot of art, voices, sprites,
help assets and it is getting disorganized." `public/sprites/` by who is drawn
(`kittens/ember`, `kittens/frost`, `leaders/`, `clans/`, `satan/`, `critters/`,
`beasts/`, `fx/`), `public/voice/` by who is speaking, `public/help/` by what
the picture is of. **The sprites were renamed and the voices and clips were
not** — a sprite filename was only ever a path, but `sat_over` and `move-keys`
are identifiers used in the code, the docs and the capture tools, so
`voicePath(id)` and `helpGifPath(name)` add the folder on the way out instead.
The risk here is silent: rule 9 means a missing clip throws nothing and logs
nothing, and vite's dev server answers an unknown path with `index.html` and a
**200**, so a wrong mp3 path decodes as garbage and the line simply never plays.
`world-check` now proves every id the game asks for is on disk and filed, and
that no literal `/voice/...` has crept back into `src/`.

**A Help page that shows the game instead of describing it.** Twelve topics,
each a `<details>` a kid opens; **eighteen** GIFs **captured out of the running
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

**The game saves itself now, and an afternoon can be picked back up.**
`systems/savegame.js` takes a snapshot every 30 seconds once a run is five
minutes old and **PLAY SETTINGS → LOAD A SAVED GAME** in the pause menu puts one
back (saving the game being left first, past five minutes). It never asks and
never toasts: a notification every half minute for four hours is one a player
learns to stop reading.

**…and SAVE & QUIT GAME is the save made on purpose, and a kept game stays.**
The old QUIT GAME saves before it closes; past five minutes the row is marked
**kept** and the cap goes round it — five rows, eight once more than four are
kept, always two spare beside them, ten at most; past eight kept, the
least-played kept row goes, never the one saved last. The rule is `capFor` and
`trimSaves` in `savegame.js`, and `world-check` §1c walks every sentence of the
request through the real `putSave`. A save that fails does NOT quit.

**The pause menu grew a PLAY SETTINGS group** holding WATCH AGAIN, LOAD A SAVED
GAME and END THE GAME, and **new pause-menu rows go in PLAY SETTINGS or KITTENS &
SCORES** — asked for in those words, and the top level is now pinned by name.
WATCH AGAIN gains **WATCH THE ENDING AGAIN** once this game's ending has played.

- **A save describes what the girls DID, never the world.** The islands, the
  houses, the roads and the props all rebuild identically from their own seeds
  on every boot, so a save is the list of which props are lying down, which orbs
  are worn, who swore where and how far the tournament got — **639 bytes** for a
  216-prop town, and it cannot be wrong about the shape of a place it never
  described. `worldSig` pins it to the prop/island/star counts it was taken
  under and a save from a build with different ones is **shown, greyed, and says
  why** rather than quietly putting the wrong barrels down.
- **A load is `restart()` and then replay.** `restart` is the one heavily-argued
  reset path in the project and the one `world-check` already covers; a second
  "undo everything" list here would be that one copied, and the copy would rot
  the first time a subsystem was added. Knocked props are **re-scattered** with
  the debug wreck's own recipe, because a save does not record which way each
  barrel fell and a town lying along one axis reads as a bug.
- **One row per play session, and five slots are five games.** Reported from
  play: every autosave minted a fresh id, so two and a half minutes of one
  afternoon filled all five rows with itself and binned every other game
  anybody had played — the feature deleting exactly what it existed to protect.
  `Game.sessionId` is minted at boot, again at `restart()`, and **inherited from
  a save you load**, so carrying on from Tuesday carries on *in Tuesday's row*
  rather than forking a second one beside it.
- **A save holds everyone who PLAYED, not everyone in a seat.** `Game.sessionCast`
  is keyed by the kitten, because that is what a girl comes back to. She drops
  out, or her sister swaps away from her in the character picker — that second
  one used to bin an afternoon *silently*, without even dropping her orbs — and
  she is still on the row, dimmed and marked `·away`, still in the count. Pick
  her up again and `_recallPlayer` hands back her score, her clan, her oaths,
  her panda **and her orbs**. The row says both numbers — "4 kittens, 2
  playing".
- **Dropping out keeps her orbs, and putting them down is a button.** Leaving
  used to tip her whole neck onto the floor — the dealer's supply rule read
  across from SELLING, and selling is not leaving: a girl who put the
  controller down for twenty minutes came back to an empty neck and eight orbs
  shared out among whoever was standing nearest. They now travel in her cast
  row as a **reservation**, so twenty-six is still twenty-six and nothing is
  copied. The generous thing is now a thing you can DO: **`NAME — DROP HER n
  ORBS`** sits above her DROP OUT in the pause menu, goes through the same
  `Kotodama.drop` the Character Profile uses (the fan, the `shyOf`, the refusal
  to delete an orb it cannot find ground for), asks first, says how many
  actually landed, and disappears when she has none left.
- **A steal cannot be carried out of the game.** 盗 Steal Mischief is a loan,
  and `settleLoans` looks in three places — loose on the deck, worn by a live
  player, sold back to the dealer. A leaver's orbs are in none of them, so
  `Kotodama.reclaimFrom` runs first and hands back anything she only borrowed.
  It used to be covered by accident, because leaving dropped the orb.
- **Leaving autosaves.** The party and the orb positions both change at once,
  and up to twenty-nine seconds of that unwritten is twenty-nine seconds in
  which closing the tab brings back a kitten who left. `_saveOnPartyChange`
  still respects the five-minute gate and pushes the next ordinary save out, so
  one change is one write.
- **It restores onto the seats being played**, matched by kitten NAME and *only*
  by name, and it says out loud how many are **waiting** rather than dropped.
  The old fallback ("the first row nobody has claimed") handed Ember somebody
  else's afternoon under the wrong name; now an unseated row goes into the cast
  and the third controller picks it up whole. Seating four kittens nobody is
  holding a controller for would be non-negotiables 5 and 6 at once.
- **The orb supply is conserved in BOTH directions, which is where a bug was.**
  `restore` calls `awaken()` for the stall and the dissolve, and `awaken`
  re-seeds every Powerup Kotodama at its opening spot — on top of handing every
  kitten back the ones she was wearing. 26 orbs became 34, on islands nobody was
  standing on. The loose ones are the one thing in a save with no stable index
  (they MOVE), so `Kotodama.worldOrbs()` records id-and-place and
  `setWorldOrbs()` puts back exactly those. Fourth non-negotiable, broken in the
  direction nobody checks for: things *appearing*.
- **The rows are chosen by content, not by slot number** — who was playing, in
  their own colours, wearing the *kanji* of the orbs they had on, then the
  mischief percentage, the stars and whether the ring was open. A slot number is
  the one fact about a save that nobody can recognise.
- **Loading asks first** and the dialog has no `.primary`, so the cursor opens on
  "NO, KEEP PLAYING". On the other side of that button is four hours of somebody
  else's afternoon and the button is in a menu four children push at.
- **The Help card stopped apologising.** It carried "⚠ Progress is NOT saved
  between sessions" for two years and it was true for two years; a Help page that
  apologises for a thing the game now does tells a kid not to go and look. The
  one warning still there is the true one — they live in this browser on this
  computer and clearing site data takes them.
- **Two panel-only debug rows**, neither with a key: *wipe the RECORD BOARD* and
  *wipe the SAVED GAMES*. Both ask, both put the count in the YES button. Before
  the first one there was **no** way to clear the board from inside the game at
  all — `clearBoard()` had existed since the board was written with a comment
  claiming the pause menu called it, and nothing ever had.

---

## Open items

**Nothing is known broken.** Both check suites pass and the build is clean. What
is listed here is untested-by-players, not untested-by-machine.

**The Dream Dojo, Lionheart's VR arcade — stage 5 of 5.** Each stage is on its
own branch:

| stage | branch |
| --- | --- |
| 1 | `feature/dream-dojo-vr` |
| 2 | `feature/dream-dojo-gallery` |
| 3 | `feature/dream-dojo-kata` |
| 4 | `feature/dream-dojo-highway` |
| 5 | `feature/dream-dojo-school` |

All five are merged into local main and pushed to **`alpha`** (2026-10-03),
for testing. They are **not** on origin/main.
[dreamdojo.md](docs/notes/dreamdojo.md) has the design and Richard's brief,
quoted.

- **Stage 5 built:**
  - The **Arena School**: a practice round for each tournament mode, under the
    arena's own rules. `decideOnTime` and `purseSplit` are now shared with
    tournament.js.
  - A scoreboard that explains *why* someone is ahead.
  - **The Feast**: stun, hold still, hold attack.
  - **KENSHI ranks**: 24★ for 2nd Class; 60★ *and* the Shadow for 1st.
  - The foil **Fighter Card**.
  - **Daily and weekly training** picked by the date.
  - **Shadow Lionheart**, the co-op boss. Every telegraph is the same shape as
    its hit test, he is staged upstage of her, and his fight has its own
    camera focus.
  - The win pays the **tenth quest**. It is the one quest that counts after
    the Awakening (`late`). **That exception is Richard's to confirm.**
- **Stage 5 verified in the browser:**
  - The Feast and Tag Team went live.
  - The duel board read correctly.
  - The Shadow fight ran from the kiosk to the win, through the real Feats.
- **The simulator's art** (branch `feature/dream-dojo-vr-art`, merged locally):
  - **Headset sheets** for all four kittens. Ember and Frost are generated, and
    Storm and Blossom are recoloured from them. They are worn from the cross
    into the sim, and the exact home look returns on the way out.
  - A **four-pose Shadow** (guard, slam, sweep, cross), and the pose follows
    the tell.
  - His **hand-over line** before the prize: "My honor, my dreams… they're
    yours now." It plays for 4 s, then the stars and quest are told. Everything
    is committed the frame he breaks.
  - [art.md](docs/notes/art.md) covers the attack-row splice and the visor
    turn check.
  - Verified in the browser: the swap and the restore, the pose walk
    0 → 1 → 1 → 2, and the line at 0 s with the prize at 4.0 s.
- **Lionheart talks — Barrett.** Picked by Richard over his own ElevenLabs
  clone, Ken, Alexey and round one's Kevin. Nine clips in
  `public/voice/lionheart/`, cut by `tools/capture/lionheart-vo.mjs`.
  - **The lines were rewritten for the voice**: "not too seductive", so
    loud, practical and arcade-owner. And nobody "jacks out" — she
    **connects** and **disconnects**, everywhere; `world-check` fails on the
    word.
  - `dream/lionvoice.js` looks a clip up **by the bubble's own text**, never
    talks over another character, gates the ambient lines (30 s apart, the
    same one 120 s), and every card holds until he has finished.
  - `tools/mp3.mjs` measures the real clips for the checks.
  - **Open:** the islands line is 18.9 s even after its pauses were closed.
    It is the long tour of the map; shortening it means rewriting the card.
  - [voices.md](docs/notes/voices.md#lionheart-is-barrett-and-the-wording-is-half-the-casting)
    has the casting, the rule and the gating.

- **A trial's loan, and angels in Shadow Lionheart's fight** (branch
  `mixed/holo-equipped-shadow-angels`).
  [dreamdojo.md](docs/notes/dreamdojo.md#the-trials-loan-and-angels-in-shadow-lionhearts-fight):
  - **A trial's orbs** go back the frame it ends. They were a loan the profile
    could not show or take off; the orb a won trial pays is in her holo kit.
  - **Caught is out:** an angel over his arena while a sister still stands,
    and the fight is lost when the last one is caught. Everybody lands at the
    edge when it ends.
  - **Open:** nobody has played it.

- **Richard's first playthrough fixes** (branch `mixed/dojo-playthrough-fixes`).
  [dreamdojo.md](docs/notes/dreamdojo.md#richards-first-playthrough-fixes)
  has each note quoted:
  - **The Help topic's pictures** are now full-width, with the text under
    them, two cards across. All the blurbs were cut short.
  - **A toast over a card:** a seat with a card up gets its toasts in a
    strip above the cards.
  - **The look across a bridge** turns on or off, with half the radius and a
    buffer. The lens swings round her first, then aims at the island. The
    stick is read through the lens.
  - **The sim's Turning Circle as a video game:** the camera zooms out, and
    the orb turns in a gimbal. The axes are coloured x red, y green and z
    blue, with bars of light. Each kitten has a sphere, and there is a vector
    to the one steering, plus a normal and a tangent at the point. The maths
    is still checked equal to the town's.
  - **The Pandapaw trial:** the grown panda is rideable, the lesson's first
    blow knocks it down, and the holo-fighters draw their slashes.
  - **The holo kit remembered:** her holo oath and her last worn orbs come
    back next visit, and they are saved.
  - **The Sine Gauntlet:** nobody can get stuck. The stands' LEAVE pad always
    works, and a stray in the course is walked out.
  - **Payne's tour is scored** in four pieces, cut on its own shots. The
    middle one is the simulator's own `vr`.
  - **Open:**
    - nobody has played it;
    - the tour's pieces have not been heard by a person;
    - the holo overlay has not been looked at on a phone;
    - **Payne's `payne_q_shadow` still needs her new take.**

- **Richard's list after stage 5: the holo kit, Lionheart's quests, the
  levels and the course** (branch `mixed/dojo-holo-profile-quests-courses`).
  [dreamdojo.md](docs/notes/dreamdojo.md#the-holo-kit-lionhearts-quests-the-levels-and-the-course)
  has every item with its commit:
  - **The bug list:** nothing struck before GO, a soft flicker, the Icewhisker
    race, one charge one blow, and a hit on the Shadow you can see.
  - **The holo kit and the (HOLO) PLAYER PROFILE.** She goes in with a copy of
    her ring and no clan, earns orbs in the Gallery (four of a kind at most),
    and the bag is computed, never stored. Her real kit is never touched.
  - **Lionheart is the simulator's quest-giver:** WHERE NEXT, MAP, a 地図
    kiosk, the sim on the minimap, and a nudge after 150 s with nothing won.
  - **Shadow Lionheart on three levels**, with his own 凶 Cross Slash on
    MEDIUM and HARD. Beat all three and hers draws 凶 and hits ×1.25.
  - **The Pandapaw trial** is a panda's whole life in the ring, with the real
    panda.
  - **One kata floor each** in her colour; **the Feast** is the ring's
    animals in three rounds; **two-way highways**; **the look across** at a
    bridge; the island signs at the hub; the Turning Circle in light; Payne
    silent in the headset.
  - **A Help topic, "The Dream Dojo — VR arcade"**, with every picture filmed
    out of the engine (`tools/capture/shots/dreamdojo.js`, see
    [help.md](docs/notes/help.md)).
  - **The Sine Gauntlet is one course**, run one kitten at a time against the
    clock (`dream/course.js`, `dream/sine.js`):
    - six obstacles, each a different piece of sine maths;
    - a zap sends her back to the last checkpoint;
    - the queue waits in walled cheering stands;
    - one shared pane, side-on to the runner;
    - her holo kit on a rack for the run;
    - lasers with shadows, footprints and drop lines.

    The stars are measured by a search, and the camera against the real
    minimap.
  - **Found while writing it up:** the tenth quest still said "Beat Shadow
    Lionheart", but only MEDIUM or HARD pays it. Its words and 1st Class's
    "to next" now say so, and world-check asks it of the pay table.
  - **Open:**
    - **Payne's voiced `payne_q_shadow` still says the old words.** Changing
      it means a new take she approves, so it is left for Richard to ask her.
    - Nobody has played any of this.
    - The Feast's and Pandapaw's bands, and MEDIUM's and HARD's knobs, are
      first numbers.
    - The course was checked in the browser at one and two kittens, not
      four.

- **Richard's Dream Dojo improvements list** (branch
  `mixed/dojo-honor-payne-gear-platforms`).
  [dreamdojo.md](docs/notes/dreamdojo.md#the-front-door--richards-improvements-list)
  has each note quoted, with the measured numbers:
  - **Lionheart's Honor is open to anybody** and pays the SPECIAL draw.
  - **Payne lists it**, and her card has a **THE DREAM DOJO** section: VIEW
    (a fifteen-line tour, voiced by her and Lionheart) and MARK IT.
  - **The sign** has no posts; it floats, bobs and breathes.
  - **The camera** pulls back to 50 inside the dome, so the whole island fits.
  - **Props:** the gear racks, a sword stand, a laser-tag rack, treadmills, a
    tracking frame and sweeping beams.
  - **Gearing up.** The first visit sends her round three racks, then the suit
    poofs on; later visits go straight to the suit. She walks out of the tube
    and poofs back into her own look.
  - **The six special poses exist in the headset** (12 masters, 4 kittens).
  - **The way across** ~~is four stones on a half-circle~~ is three stones and
    a gate now (the next list). A fall is held 2.2 s, then puts her back on the
    Dojo. On the stones the camera holds one bearing.
  - **The `vr` synthwave piece** swells from 0.08 to 0.5 to 1 as she crosses
    and enters.
  - **The dome** pushes the RIDER, so the dragon goes with her. A kitten
    dropped onto the dome slides off it.
  - **Lionheart reacts:** he yells at a cheat, then gives the HONOR talk (道 *dō*)
    once she comes in properly, or the FALL talk after a fall. Each plays once
    per kitten, the whole party is cast, and it is shot over the shoulder.
  - **Two bugs found in the browser, both now checked:** the talk drew her
    face-on (the billboard's own `sprite.facing`), and Payne's VIEW toasted a
    refusal on success (`??` on a `null` success).
  - **Open:** nobody has played it. The tour has fifteen rows and is long by
    design ("longer and more detailed"). If it drags, it gets cut by rows, not
    by speeding the voices. ~~All new Payne lines are pending her approval.~~
    Approved: "Payne approved the lines and her voice, so we are good there."

- **Richard's "Improvements" list: the stones, the preload, the tour recut**
  (branch `mixed/dojo-stones-preload-tour-recut`).
  [dreamdojo.md](docs/notes/dreamdojo.md#the-stones-the-preload-and-the-tour-recut)
  has each note quoted:
  - **The three stones lie on one arc** into the gate. The turns on the stones
    are 20° and 17° (were +62° and +61°). Along the way they stand at
    0.18/0.49/0.80 (were 0.29/0.51/0.90). The hops are still 3.2.
  - **The simulator is on the GPU before the tour cuts into it**
    (`Game.primeSim`). The first sim frame went from 1304 → 17 ms. The four
    kitten-sheet uploads sit under the fade from black. Payne's dojo menu
    starts the headset drawings loading. `atlasClone` no longer re-sends a
    whole sheet for every billboard: three's own `clone()` was bumping it.
  - **The tour's two simulator lines are recut and PLAYED**
    (`dream/tourcast.js`):
    - map → Gallery is a push, not a 180;
    - canes cut on the range;
    - four fighters, critters and Lionheart's card at the school, which now
      holds where the Sentries were;
    - an outskirts pan;
    - fruit cut on the Storm, which holds where Bamboo was;
    - his kata on a Kata floor with the lens walking round until the Sine
      Gauntlet is behind it;
    - a fade to his card on "climb the ranks", and a fade out and in to the
      Shadow.
  - **Open:** not watched at real speed with audio. Two in-between swings
    show a moment of sky. The swing onto the range is quick (~280°/s peak).

- **Richard's list after the rare orbs** (branch
  `mixed/dojo-gear-voice-riposte-vr-tour-orbtext-dome`).
  [dreamdojo.md](docs/notes/dreamdojo.md#the-gear-voice-the-headset-riposte-the-tours-islands-the-cards-and-the-dome)
  has each note quoted:
  - **The gear voice was Barrett all along.** He was SHOUTING because the card
    said "SUIT UP!". The suit and again lines are re-written quietly and
    re-rendered (128 → 86 Hz).
  - **返 Riposte in the headset** (`vr_riposte`, both sheets). There are seven
    headset poses now.
  - **The tour pans the islands, cued on the words that name them**
    (`TOUR_PANS`). The Turning Circle is only the turning whole-map frame.
  - **Shadow Lionheart performs in his tour line** (`dream/tourshadow.js`):
    walk, slam, sweep, Cross, at 33–46% of the frame.
  - **The Gallery's cards wrap**, at 0.44 units a letter, on a 10 × 5.2 card
    over the kitten reading it. Only her nearest card lights.
  - **The dome is its own shape for animals.** It has open sky beside and over
    it, it slides, and a riderless dragon over it is sent to the stones.
  - **Only the drop owes the apology.** A mount on the shell gets a toast.
  - **Open:** none of it has been played at real speed with real audio. The
    frames were checked through the real lenses in the browser pane, and the
    dragon over the dome was checked by simulation, not watched.

- **Richard's next Dream Dojo list** (branch
  `mixed/dojo-riposte-minimap-gate-dealer`).
  [dreamdojo.md](docs/notes/dreamdojo.md#the-front-door-and-the-fix-list-after-it)
  has each note quoted with its cause and numbers:
  - **Three stones and a gate.** A vermilion holographic torii on a deck at
    the dome's skin, the last stone on its axis, and a REAL railing round the
    pad and along the deck that only the gate lets you through
    (`dream/gate.js`; 36 bearings checked).
  - **The Dream Dojo is on the minimap**: pad, dome ring, gate, stones, name.
  - **Payne's mark comes off** at the marked spot, a stone or the pad.
  - **The tour's sim shots draw the simulator** (`StoryScene.loc` →
    `_renderView`'s `realm`). Only the holo MathDojo showed before.
  - **The camera into the sim** no longer drags back toward the real pad.
  - **No visor plane at all**, fallback included.
  - **A new game is a new game:** PLAY always opens on the story (not once per
    tab), and the gear-up is `p.dreamGeared` in her save row, cleared by
    `restart` (it lived in the Dream Dojo's own long-term store).
  - **The profile tags Lionheart's Honor as a special quest.**
  - **The wall yell is unvoiced** (`lion_yell_wall` deleted; 34 clips).
  - **The Kotodama Dealer's booth is 1.5× bigger**, solid and prompt with it.
  - ~~**Open — the rare orbs are still not merged.**~~ Merged since, with a
    Gallery drill each and the sim's combat taught the parry: see the rare
    orbs' own entry below. No other unmerged
    branch is critical: `extra/scratchpad-ideas` is scratch files and
    Richard's clone takes, which stay out.

- **Richard's Dream Dojo fix list** (branch
  `mixed/dojo-islands-bridges-feast-shadow`).
  [dreamdojo.md](docs/notes/dreamdojo.md#discs-ridden-bridges-and-leaving--richards-fix-list)
  has each note quoted with its cause:
  - Islands are discs, with no rock under them.
  - Bridges and highways are real Snake Way roads: boarding, the stick lock,
    the rails and `SnakeCam`. There is no Snake Way song in the sim, and a
    light cycle is cargo.
  - The arrows point and run the way she would cross, in her colour.
  - The ribbon flares into each rim, and the rim opens over it.
  - The Feast eats with the Cross Slash on (the sim hud's `critterHold` was
    hard-coded false).
  - The hologram stops talking when the last kitten disconnects.
  - The Shadow is Lionheart's height (6.2, was 9.3).
  - **Open:** the "VR sprites not showing" and "Shadow stuck on one pose"
    reports did not reproduce in Chrome or Firefox. The holo-kittens' headsets
    and the Shadow's late re-skin were fixed instead. ~~Her special poses in
    the sim are still home-sheet art.~~ Generated (the improvements list, above).

- **Stage 4 built:**
  - The **data highways and light cycles** to the two far islands.
  - **Kudamono Storm**: aimed lobs, a landing ring, and viruses.
  - The **Sine Gauntlet**: y = C + A·sin(ωt − kn) as six bars, a trace and
    her card, all from one function, on three levels.
  - **Holo-Sentries**: a tell on every shot and a shielded core.
  - **Bamboo Infiltration**: sweeping sight cones clipped by the bamboo, hides
    and lanterns.
  - Every star band is measured by a search in `world-check`.
- **Stage 4 verified in the browser:**
  - A real E press rode the highway and back.
  - Every drill went live from its kiosk.
  - A sentry hit her.
  - Bamboo caught her and sent her back to the start.
- **Stage 3 built:**
  - The **Tameshigiri Range**: ONE SWING, COMBO 60, and CLEAN CUT (cut at
    (cos θ, sin θ), with the card's numbers and the drawn line from one
    function).
  - **Kata Trace**: a daily and a weekly kata seeded by the date, Lionheart's
    ghost demonstrating, her turn judged on the beat, and three tempo tiers.
- **Stage 3 verified in the browser** with real key presses:
  - A daily at 100% at 100 and at 120 BPM.
  - A clean cut refused 60° off and accepted at 236° against 240°.
  - ONE SWING cut 4 in one press.
  - COMBO 60 chained 6, then reset.
- **Stage 2 built:**
  - The **Kotodama Gallery**: ~~ten~~ thirteen pedestals, thirteen drills (the rare three since), each lending its orb
    for the drill only.
  - The **Clan Trial Hall**: six holo-leaders, six trials, each a trial oath
    that never touches her real clan.
  - Lionheart's **rundown** of the orbs she wears.
  - The SIM bar, and stars per kitten, kept for good, with a keyless,
    asks-first debug wipe.
- **Stage 2 verified in the browser** by driving the real input:
  - Gale run to three stars.
  - The Long Cut post refused at 3.0 and cut at 4.7.
  - Long Guard held through the beam.
  - One real Dragon Breath catching all three holo-kittens.
  - A real 盗 mark, then a hit, knocking the orb loose.
  - A trial oath saved as her real clan and restored when she left.
  - The rundown paging through her kit.

- **Built:**
  - The pad NE of the Dojo, the two stones (a real jump) and the dome that
    keeps animals out.
  - Four tubes: tube k is player k's.
  - The walk, rise, link and rez sequence, and its reverse.
  - The simulator, a second reality drawn 12,000 units east with its own
    floors and sky.
  - The holo-Dojo hub, the puppet in the real tube, and Lionheart (take B
    art) with his lines as text.
- **Verified in the browser:**
  - One kitten in and out.
  - Two kittens with one in the sim: the panes split by realm, the sister sees
    the puppet, and the sim pane drops its minimap.
- **Open:**
  - Nobody has played it.
  - ~~**Lionheart has no voice.**~~ He is Barrett now (stage 5, above). The
    clone of Richard's voice was made on his own ElevenLabs account in the end,
    and turned down.
  - Nobody has played stage 2 either. The drill numbers are measured but the
    *difficulty* has not been tried on a nine-year-old.
  - ~~Stages 3–5 (Kata Trace, the modes, ranks, Shadow Lionheart) and the VR
    kitten sheets are not started.~~ All built since, above.

**Three more rare orbs: 遠 Far Step, 返 Riposte, 間 Long Parry.** Branch
`feature/rare-orbs-reach-parry`, ~~not on alpha, not merged~~ **merged into
main** (branch `mixed/rare-orbs-into-main`) once Richard had played the Payne
work: "I playtested the Payne features extensively and it is all working well".
[endgame.md](docs/notes/endgame.md) has the design and his words.

- **遠 Far Step** (stacks, needs 瞬): the Flash Step's Lock Range is 1.5x with
  one and 2x with two — lock-on, aimed hop and slip-away all read it.
- **返 Riposte**: in a live round, stand still, HOLD Interact, push the stick.
  A blow from the front half is caught and answered; from behind it lands.
  Hangs her in the air. Drops a live 壁 Ward. A quick tap is still the clan
  power / dive; a long hold with no push tells her how.
- **間 Long Parry** (stacks, needs 返): the window is 1.5x per orb.
- **返 has a stance drawing** for all four kittens (`riposte.png`). She wears
  it while her guard is up, mirrored to the side she guards, and the counter
  is the ordinary attack row. [endgame.md](docs/notes/endgame.md) explains
  why it isn't worn during the hold before the push.
- The Help grid's sixth cell is a PLACEHOLDER drawing until a clip is filmed.
- ~~**The published project page is one line behind**~~ — republished with the
  merge.
- **In the Dream Dojo, too** (branch `mixed/rare-orbs-into-main`). Richard:
  "make it work with the simulator". The Gallery has thirteen pedestals, and
  each new orb has a drill that cannot be passed without it
  ([dreamdojo.md](docs/notes/dreamdojo.md#the-dealers-three-rare-orbs-in-the-gallery)):
  遠 three Flash Steps round a holo-kitten from outside a ring past bare Lock
  range; 返 three of its blows caught and answered; 間 the same partner, but it
  waits until a bare guard has shut. `simHit` asks the parry now, so a 返 guard
  catches bolts, the Arena School's holo-blades and Shadow Lionheart too.
- **Open:** nobody has played it; every number is a first guess on the balance
  page.

**Payne, the quest-giver.** Branch `feature/payne-quest-giver`.
[payne.md](docs/notes/payne.md) has the design, every note quoted, and the
script.

- **She is a real person, and she has approved her lines and her voice**
  (2026-10-04): "Payne approved the lines and her voice, so we are good there."
- **In the market at (-10, 24).** INTERACT opens her card: the next quest in
  Richard's order (Icewhisker saved for last among the oaths), the three
  tag-alongs, the hints toggle, the Character Profile, and the trick.
- **Hints and teases are opt-in.** After two minutes stuck she sends a card
  with her face to that kitten's pane, above the warning strip, and marks the
  step on the map and in the world. Her three teases: a cub carried too long,
  lost in a grotto, and hopping at the sky star without the triple jump
  (which marks Shadowtail's hall).
- **Her face comes out at the Awakening**, and the helmet goes under her arm.
- **The Goblin Sweep**, taught after all six quests are settled and three
  arena rounds: SPRINT held, stick still, ATTACK. A full circle. It hurts
  kittens only in a live round, through the one gate.
- **Open:** nobody has played it. The stuck timings are first guesses. The
  alternative held pose is kept outside the repo.
- **Richard's first fixes** (branch `mixed/payne-fixes-arena-camera`):
  - She is 6.0 tall, so her helmet (1.47) is wider than a kitten's head (1.42).
  - Her bubble sits beside her head and hides at talking range.
  - A kitten seated after the ending is no longer invited.
  - Help has an **Ask Payne** sub-card.
  - The sweep's wait is one rewritten line.
  - The sweep hits only grounded kittens within 0.6 of her height, and no buff lengthens it.
  - The big screen's camera zone is off during a match and for angels. That
    was the feast's zoom-out.
  - Its fireworks need a kitten on the arena road or in front of it.
- **Richard's second fixes** (branch `mixed/payne-last-one-ryuuseki-gate`):
  - The cave tease is 35 s.
  - Her bubble's tail comes out of its side and points at her helmet.
  - A sister's BYE no longer cuts off what Payne is saying to somebody else.
    BYE is the least of what she says.
  - The Very Last One: the first MARK IT pins one prop and waits once it is
    down. Then she sends you to Icewhisker until you hold the oath. Then a
    temper, then a Goblin Sweep of her own: no damage, a gag through
    `Player.blast`.
  - Six new Pixie lines, ~~pending Payne's approval~~ approved with the rest.
  - **Ryuuseki is summoned only by a kitten on her own feet on the home
    island.** Flying a dragon over the torii used to call him down.

**The Character Profile has QUESTS and INVENTORY tabs, and a bag of 16**
(branch `feature/profile-inventory-tabs`).

- An orb past the eighth goes in the bag; only the twenty-fifth is refused.
- The cursor stops on the tab headers and skips their content. JUMP steps
  in, and INTERACT (or BACK on a phone) steps out.
- Details are in [endgame.md](docs/notes/endgame.md), "A bag of sixteen".

**Richard's third batch** (branch `mixed/bridge-steer-fight-call-billboard`).
[tournament.md](docs/notes/tournament.md) has the arena half.

- **The Snake Way re-aims to the camera when you let go.** It rebinds after
  0.1 s with the stick at rest.
  - It now reads the ride camera she can see (`viewYaw`), not `camYaw`.
  - It locks only after 1.5 units of progress
    ([world.md](docs/notes/world.md)).
- **A sister joining a loaded game lands where the save had her.**
- **FIGHT! is on time.** The round waits for his line. A jump, swing or Escape
  skips it, and FIGHT! interrupts.
- **He names the real fighters.** There are 13 new Harrison clips, and
  *Ember versus Frost* is used only for Ember against Frost.
- **The big screen:**
  - Slides stay up longer, with an ad every two ladders.
  - One aimed, quieter volley of fireworks per slide.
  - The ticker's forecast is *HOT AND MUSCLEY* and is no longer cut.
- **Payne after the ending** has no hints row.
- **A recharging Goblin Sweep is a plain slash.**
- **The arena pickers have a way back.** It works from Escape, Start, B or a
  BACK button, and leaving to town asks first.
- **The Goblin Sweep has a pose** for all four kittens.
- **Open:**
  - Nobody has heard the roll call.
  - The Riposte stance is wired on `feature/rare-orbs-reach-parry`, merged
    into main with the orbs since; see that entry.

**The big screen outside the arena.** Branch `feature/arena-billboard`.
[tournament.md](docs/notes/tournament.md) has the design and every note quoted,
under **The big screen**; [art.md](docs/notes/art.md) has the six new poses.

- **The "strange collider" was two things**, and both are gone: the old sign's
  r 8.4 disc, and one circle per run of the stands left over from before they
  were a wall (the back tier's stuck 2.9 out of the wall). The board's only
  colliders are its two posts.
- **A 32x18 screen on the west stands' outer face**, facing out, with a cap
  low enough (21.3) that no live-round camera looks across it. It cycles each
  league's champion (8 s), #2 and #3 (4 s), and Mr. Satan's made-up record
  where nobody has won. His four flexing ads play in between.
- **Fireworks, searchlights and pops** only when some pane can see it. They
  are loudest on his slides. From the arena road's real ride poses it is in
  frame from u 0.32 to 0.44.
- **The camera near it** fits the glass and every kitten square-on, and eases
  in over 8 units. Its weight is exactly zero anywhere else.
- **Found on the way:** the 2v1v1 league was never shown on the pause menu's
  board or wiped. `BOARD_MODES` is now pinned to `MODES`.
- **Open:** nobody has played it, seen the fireworks at real speed, or heard
  the pops. The champion slides have only been seen with fake rows.

**The parade's voice, champions in front, the doors shut after, and the front
door x-rayed.** Branch `mixed/parade-voices-doors-xray`.

- **`sat_parade1` and `sat_parade2`** are recorded (Harrison, 3.12 s and
  4.40 s) and PLAYED over his bubble. The parade hushes the announcer's queue
  for its length. [story.md](docs/notes/story.md).
- **The first two winners finish in front of him**, either side of the `him`
  lens's line to him. 92 on-screen crossings are checked, and all are in
  front.
- **The doors stay shut after the parade.** The kittens' stale `arenaSide`
  'in' had the doorman reopening them.
- **The lanterns, the road's arena-end torii (thin, 0.3) and its lions
  (0.6)** are x-rayed, and the arena's reach is 60.
  [tournament.md](docs/notes/tournament.md).
- ~~Open: nobody has heard `*sniff*`.~~ Richard has: "Sniff turned out really
  well". It is performed, not read. See voices.md.

**Mr. Satan's doors line, no x-ray in scenes, the climb's arena and gate
sooner.** Branch `mixed/parade-voice-ride-earlier`.

- **`sat_doors` has Harrison's voice**, recorded on the card's exact string.
  It is 5.04 s for twelve words. A new check makes sure every line he says by
  name is loaded; `sat_bug` is exempted by name because it is random.
- **A scene's lens cuts for nobody.** The parade, every other scene, the
  griffin's flight and the title's fly-over pass `scene` to `_renderView`, and
  every x-ray material is closed for that frame. The check runs the shipped
  methods.
- **Up the arena road:** `tower`, a new shot of the arena from below, starts at
  0.28 (Richard's 0.29), and the doors start at 0.80 (was 0.88).
  [world.md](docs/notes/world.md) has both screenshots' positions.
- **Open:** nobody has played the new timings yet.

**The arena's walls, the lion, the waterfalls, the roof, and the road's
cameras both ways.** Branch `mixed/arena-road-walls-six`.
[world.md](docs/notes/world.md) quotes every note, under the arena's front
door, the far islands and the road's shot list.

- **The stands are a wall.** The corners are closed. Nobody walks through it, a
  hard enough hit still rising goes over it, and the doors let a stuck kitten
  out and nobody in.
- **The home lion faces you.** The waterfalls draw behind the road clouds. The
  gatehouse roof has an underside.
- **Up:** the third shot is the arena, then the far isles off her left, then
  the doors. **Down:** the main island first, the floating isle second last,
  the main island last.
- **Open:**
  - ~~The arena is not the third shot as early as 0.27.~~ It is now, as
    `tower` from 0.28 (above).
  - ~~The record board is inside the wall's band, so it cannot be walked
    behind.~~ It is the big screen now, on the wall's outside face (above).
  - The vault's numbers are arithmetic plus a headless throw, not a four-kitten
    round.

**The ending's islands come toward you, and make a noise.** Branch
`mixed/ending-isles-sfx`. [story.md](docs/notes/story.md) has every note
quoted, with its number.

- **Island A** comes out whole through a cloud column at 5.43 s (was 6.44 s).
- **Gates**: 1 s after it, all started within 0.5 s, nearest first. They are
  now ranked by the truck's lens; they used to be ranked by the previous shot's.
- **The truck is tilted 10°.** The empty bottom band went from 27–28% to
  5.2–6.5%.
- **The wide shot's islands** take 4.8 s each: cloud, then island, then water.
  They are done 0.59 s before the cut. The wide shot is 5.9 s now (was 3.1 s),
  from a 2.8 s rest after Patchfur's line.
- **A sound per gate and per island the lens sees**, about 8 dB under the
  voice.
- **Open:** the 2.8 s rest is a guess at pacing that nobody has sat through. The
  dusk gate is off the right of the truck, so it is neither seen nor heard.
  The quieter levels are arithmetic, not a fresh render.

**The arena's front door, and six notes from Richard.** Branch
`mixed/arena-entrance-six`. [world.md](docs/notes/world.md) has the entrance,
the road's shot list and the music, and [story.md](docs/notes/story.md) has the
exit scene and the ending's new clock.

- **Music.** The strut is kept as `satanStrut`, as a backup. `satan` is now an
  original kung-fu disco song, and `saucer` is an original funfair march,
  played on the arena island whenever there is no match. Neither is the song
  that was asked for: a parody that is recognisably the tune is made of the
  tune. All three are 0.052–0.053 RMS.
- **No griffin at his doors.** A party standing on the arena island walks in.
- **The entrance**: the gatehouse, two door leaves that open inward, two dragon
  columns, four stacked fire lanterns and a red carpet to the road. Mr Satan
  waits at the doors.
- **The exit parade**, only when the fight started at the doors. The doors
  open, winners hop out, and losers ride stretchers carried by hospital cats.
  His arms go up as the first reaches him and stay up 2.6 s after the last.
  Skip is Esc/Start. World-check replays three shots: 100% of 736 / 225 / 477
  sightings.
- **The arena road is shot, not orbited**, going up: six pre-planned shots,
  each 100% in world-check's replay. The worst frame between them turns
  2.79°.
- **The ending**: a far island at 5% of the truck, slower gates, roads after
  the gates, and islands done 2.05 s before the wide shot's cut. The ground
  round the gates follows the roads.
- **Open:** nobody has played the parade with a real four. (`sat_doors` has
  its voice now.)

**Snake Way, eleven notes from Richard.** Branch `mixed/snake-way-eleven`.
[world.md](docs/notes/world.md) has each one, [story.md](docs/notes/story.md)
the new clock and [performance.md](docs/notes/performance.md) the lag.

- **Music on the roads.** `snake` on any road, and on the arena road Mr
  Satan's own: an ORIGINAL disco strut, not "Kung Fu Fighting" (a synth
  playing somebody's tune is still their tune). One chorus is 24 s and the
  arena road about 60 s, so she hears it round about two and a half times.
- **X-ray through the clouds**, a player-sized hole at 50%, per pane.
- **Seven roads.** The frost road was missing because a Powerup Kotodama
  scattered at 100% sat on the only landing on the frost rim. Roads are now
  solved against the world as BUILT, and anything play left on a road is moved
  off it. The **arena road** is new: double width, room for four abreast, a
  lap round the arena island before landing at its front, a Mr Satan lion and
  a white/black/orange torii. It is there only while the arena is open.
- **The far isles come up through a cloud portal**, one at a time and only
  when the ending's camera can see them. The rest simply appear. Their
  waterfalls grow from nothing afterwards, with spray.
- **The ending's clock.** Isles from 15% of the "There is nothing left" pan,
  torii through their clouds from 22%, roads from 50%, all done at 93% of the
  wide pan. Measured: 5.85 / 6.07 / 6.97 / 11.44 s.
- **A gold coin at the middle of every road.** Grabbed ON the road (never
  from a dragon), it is held up over her head and pays five canes (125). The
  arena's is twice the size, has Mr Satan's face and pays everybody. They stay
  taken and are saved.
- **Ramps with rocks and grass** where a road's end is above the ground.
- **No hitch.** Worst frame of the ending 587 ms (HEAD) to 63 ms, and that
  63 is the scene's own first frame, unchanged. The build is sliced
  (worst slice 7 ms headless) and the ending's world is primed on the GPU.
- **Not yet played by Richard.** Nothing here is pushed.

**Snake Way: after the ending, gold roads join the islands through the
clouds.** Branch `feature/snake-way-bridges`. [world.md](docs/notes/world.md)
has the design and [story.md](docs/notes/story.md) the shot.

- **Six generated roads** from home to each island, with a torii at each end and
  a snake's head at the far one. They are **built in the ending's wide shot**
  (the `snake: true` row), and up whole on skip, replay and load.
- **Riding one:**
  - the stick she boarded with means onward for the whole road, whatever the
    camera does;
  - she is clamped to the deck and glides at ×1.35;
  - she can jump off the side.
- **The ride camera** orbits her: chase, side, front, over. It is shared by a
  group on one road and splits off a lone rider after 2.5 s. A sister who
  boards close behind joins at once.
- **Seven far islands with waterfalls** rise out of the clouds with the dawn.
- **Measured in the running game:**
  - the roads grow across 1.97 s of the 2.13 s wide shot;
  - riding at 14.2 u/s;
  - two riders share one pane;
  - the split lands at 2.5 s.
- **Still open, for Richard:**
  - The sky after the ending is still the director-approved clear morning.
    `out/trailer/shots/s01.png` is a sunset, and matching it would be a palette
    change to `setSky`'s dawn.
  - The roads are not on the minimap.
  - A pre-ending ruin of each road, broken stubs at the gates, would foreshadow
    them.

**A Help topic she closes keeps the ring, as one she opens does.** One
branch, `bugfix/help-ring-stays-on-topic`.

- **The bug.** Closing *Saving* or *The arena* collapsed the page and clamped
  the scroll. `MenuNav` read that as a wheel and moved the ring to BACK.
- **The fix.** `Game._helpToggled` keeps the ring on the closed header and
  brings it back on screen if the collapse left it off. `MenuNav` also keeps a
  JUMP-toggled header from that same frame, closing the gap before `toggle`
  fires.
- **The accordion's own close is ignored.** It is told apart by a card with
  the same `name` being open now.

**An opened Help topic scrolls to the top of the box.** One branch,
`feature/help-open-scrolls-to-top`. *"Whenever opening a category in the Help
menu, it should scroll so that the new category is at the top of the
screen."*

- **What it does.** On `toggle`, an opened topic or sub-topic lands 10px from
  the top of the box. Measuring on `toggle` means the accordion has already shut
  the old topic, so its collapse is accounted for.
- **The ring stays put.** `MenuNav.keep` records the move as one it asked for,
  so the ring stays on the header she opened instead of re-deriving from the
  middle of the page.
- The full account is in [input.md](docs/notes/input.md).

**The Help page's stick no longer steps over buttons, and the d-pad steps
between them.** One branch, `bugfix/help-stick-steps`. *"Using the joystick
makes the screen pan in steps, sometimes jumping over submenu items and making
them not selectable."*

- **The cause.** Selecting "whatever is nearest the middle" can never pick a
  button that cannot reach the middle. Sub-topics are 64px apart and a step is
  87px, and a button in the page's first or last half-screen can never be
  scrolled to the middle at all. Measured on the real panel, the old rule
  reached only 5 to 10 of the 10 to 17 buttons.
- **The stick.** A step now moves at most as far as selecting the next button
  needs, which was the report's own suggestion. Near the ends, the selection
  moves while the page stays.
- **The arrow buttons** step button to button and centre each one, as Help did
  before the stick. The d-pad is carried apart from the stick in
  `PadState.dpadY`. The keyboard counts as a stick on purpose.
- The full account is in [input.md](docs/notes/input.md).

**Six notes from a phone: a banner under the badges, a rack that scrolls, a
profile at half size, a round pip, one map size per half, and a card with a way
out.** One branch, `mixed/six-phone-fixes`. The full account, with every
measurement, is the sixth pass in [mobile.md](docs/notes/mobile.md).

- **RYUUSEKI IS HERE hangs under the scoreboard's real bottom, and comes down
  once he has been ridden.** Every `top` under the scoreboard was measured
  against a one-row scoreboard, and clan labels wrap it onto two rows.
  `_stackUnderScores` measures it on a ResizeObserver and only ever pushes the
  tally and toasts down (four sworn at 1280x720: 64 → 87). Two players on a
  desktop are byte-identical. On a phone, two players' toasts move 72 → 78,
  because the tally is 28px tall, not 19, and was touching them.
- **The orb rack no longer blocks the profile's scroll.** It was
  `overscroll-behavior: contain` on a box with nothing to scroll. Measured with a
  wheel: 0px vs 300px.
- **A phone's profile is drawn at `zoom: 0.5`**, cards only. Four kittens fit on
  one screen, 503 of 503. Quest type stays at 7.5px on screen and the quest box
  shrinks from 11em to 5em instead.
- **The scoreboard paints over the minimap** (z 4 against 3).
- **The pip is a circle that shrinks** (`aspect-ratio: 1`; 7x11 → 9.8x9.8).
- **The score is never smaller than the name** (phone 14/16).
- **Every phone pane that is not a quadrant gets the side-by-side half's map.**
  A stacked two-player split goes 95 → 129, which changes a two-player layout
  deliberately, as asked. **Open:** the stacked bottom pane's map sits under
  the face cluster, as it already did at 95.
- **The dealer / orbs card has ◀ LEAVE / ◀ BACK on it**, running INTERACT's own
  `_back`. On a phone a lone kitten's card is the side-by-side half's 420px
  (`cardRect`), which puts 6 of 10 orbs on screen instead of 2.
- Also fixed: the debug wreck's roll check went red about 1 run in 100 (1.06%
  over 200,000 simulated wrecks). It asserts a spread now.

**Three fixes from an afternoon: a warning nobody could read, a panda nobody
could feed, and a camera that would not let go.** One branch,
`mixed/three-fixes`. All three were reported as UI or feel and all three turned
out to have a rule underneath them that nobody had written down.

- **The bamboo warning is one card per pane now, six tenths of the way up, and
  it blinks.** *"Too small and too difficult to notice... currently at the bottom
  of the screen... no warning or danger sign/icon... blinking in/out background
  for a few seconds... closer to the center... on a 'per split screen quadrant'
  so that all the players get the message... yellow border, then orange warning,
  then red alert... no sounds are needed."* Every check on this strip passed and
  nobody could read it, and one of them — `/#warnings \{[^}]*bottom:/` — was
  what held it at the floor of the screen. `#warnings` is the whole frame now,
  with up to four `.warn-strip` boxes placed from the same `splitLayout` the
  renderer and the minimaps use; `warnSpot`/`warnWidth` live in
  [split.js](src/core/split.js) beside `mapSpot` so the arithmetic is assertable.
  **"If the resolution is big enough" is MEASURED** — `_fitWarnings` reads the
  rendered heights back off the DOM and, if any pane's card is over 34% of its
  pane, the whole party collapses to one card across the frame, synchronously
  and one-way. The three levels are keyed off `BAMBOO_WARN_MARKS` rather than
  being three numbers of their own, so the 50% and 25% shouts go orange and red
  by construction. Hazard triangle drawn in CSS, not `⚠`, which arrives as an
  emoji in somebody else's colours. **No sound**, asked for in those words and
  asserted.
- **Forty canes cut before the oath now buy a grown panda.** *"If a player cuts
  down 40 bamboo without pledging to Pandapaw, then they can still summon a fully
  grown panda... so that, if a player cuts down all the bamboo, they can still
  get a fully grown panda."* This reverses a rule with a long comment defending
  it — a fresh panda was always a cub, so the cub stage could not last one
  frame — and what overturns it is that nothing regrows: a kitten who flattened
  the groves first was handed a cub with twenty canes owing and nothing standing
  to pay it with. At the GRANT, banked lifetime canes now buy every rung they
  cover; after that `pandaFedFrom` is the currency again, so a knocked-down panda
  still cannot be stood back up out of a lifetime tally. Both sides of the
  argument are kept in `tierFor`.
- **The Dojo hands the camera back at the edge of the black disc.**
  *"Shrink the radius of when the camera changes... so that the camera does not
  change until the player is within the circular radius of the center black
  circle. It currently takes too long... especially when leaving the circular
  area."* `DOJO_VIEW_R` was a typed 52 whose comment only said it was bigger than
  `DOJO_RADIUS`; the disc is 42.08, so the lesson started ten units before there
  was floor and held on for ten units after she had walked off it — the second
  half is the real bug. It is `FLOOR_R` now, not a typed number, and world-check
  reads the radius back off the built mesh. `World.offCircle` keeps its own 52:
  "may something be built here" is a different question, and the two being equal
  was a coincidence.

**Three minor improvements, and one of them un-does the last pass.** One
branch, `mixed/three-improvements`. Two are a second look at something that
had just shipped; the third is a piece of music that turned out to be a
missing function call.

- **The minimap is small only in a QUADRANT.** *"When there is just 1 player in
  the main screen, it is too small! Should be the big size, the small size is
  just when broken up into the 1/4th quadrant split screens."* The pass below
  keyed the 25% off the pane's OCCUPANCY — one kitten in the pane, one pair of
  eyes — and named, out loud and in a comment, that this also brought a girl
  playing alone on a whole screen down from 300px to 225. That was the wrong
  call and it came straight back. The question is the pane's SIZE first: a
  quadrant is short of the screen on both axes (the same 0.75 test `fullHeight`
  already makes one axis at a time), and nothing else gives room back. Measured
  at 1920x1080: unsplit 300, two side by side 300, two stacked 300, a three-pane
  pair's strip 300, its singles 225, four quadrants 225, either column of a 3v1
  300. The occupancy half is kept because the report's last sentence is about it
  — but measured, the two halves cannot currently disagree, since every layout
  that produces a quadrant produces it for one kitten. **There was no check on
  any of this**, which is why forty lines of reasoning shipped wrong; there is
  now, driven through `splitLayout` over every arrangement.
- **The griffin ride has music, and the silence was a missing CALL.**
  *"Have music playing when riding the griffin to the arena... let's generate
  some new music to get players excited to fight in the arena."* `_updateMusic`
  is the last thing in `_updatePlay` and the ride is a branch that returns, so
  for eight seconds the one function allowed to decide what plays never ran —
  the ending's bug, one branch along. `MUSIC.griffin` is the **arena's own key
  and scale** (hirajoshi at F), so landing is not a key change; a `snare` the
  arena theme has never had and a step slower (0.36 vs 0.32) are what make it
  the journey rather than the destination, and its `rest` of 0.44 is the busiest
  line in the game. The way HOME takes the flight theme instead — an arena
  fanfare over somebody being carried away from the arena is the game not
  knowing which way round it is.
- **Help is a page you read, not a list you step.** *"Details, like in Clan
  Abilities, can be missed that are not navigable to... as user scrolls up/down,
  should select the closest button to the center of the screen."* Nothing was
  missing from the cursor — every header really was reachable. What was
  unreachable was the PAGE: `data-nav="vertical"` meant down was "the next
  header" and `scrollIntoView` moved the panel exactly far enough to show it, so
  eight hundred pixels of pictures and prose between two headers had nothing to
  stop at. `data-nav="read"` moves the page by `max(48px, 15% of the box)` and
  derives the selection from it. **Both ends are pinned**: at the bottom the
  nearest row to the middle is the last topic and BACK is below it, so measured
  alone a stick could never reach the way out. And `_paint` must not
  `scrollIntoView` while reading, or the ring drags the page back under the
  thumb that moved it.

**Thirteen from an afternoon of play.** One branch,
`mixed/thirteen-fixes`. They arrived as one list and they are not one theme —
three are framing, three are the arena, three are the profile and the HUD, and
the rest are a scene each. What they have in common is that **every one of them
was measured before it was changed**, and four of them turned out to be a
different bug from the one the note describes.

- **The gate post through Bambooheart.** *"During the cutscene with Pandapaw
  there is a shrine beam covering Bambooheart."* `_pickSwing` already scored
  four camera swings against the stonework and picked the best — and at
  Pandapaw **all four were blocked**, so "the best" was a pillar across her
  face. Scored at all six shrines and the blocker is a **gate post every time**:
  the leader stands 3.4 out from her dais and the posts stand 2.6 out sideways,
  so a lens swung 66° is always near a bearing with a post on it. Shadowtail was
  clear by **0.002 radians** and was going to be the next report. Widening the
  fan fixes everybody at ±1.75 rad — a side-on view with the gate out of frame,
  five approved shots moved to fix one. Instead the coarse pass is untouched and
  the winner now takes the **smallest step sideways that clears her**: five
  shrines move 0.12–0.36 rad, Snowmantle does not move at all, and all six land
  clear. **The check that was there asked whether the camera MOVED, which it
  did**; the new one asks what the shot is for, at all six, across the push-in.
- **The quest checklist is two screenfuls, not four.** Measured on the running
  game: at the 353px card a two- or four-player profile gets, nine quests were
  **1351px of content in a 244px box — six presses**, worse than the four
  reported. **Shrinking the text alone does nothing**, and that is the whole
  trap: the box is quoted in `em` of the row, so it shrinks by the same factor.
  26px to 18px took the content from 798 to 468 and the box from 244 to 169 and
  the press count never moved. Three things together — an 18px row, a 14em box
  (which is the same 250px box on screen as before), and the how-to line at
  0.78em, since it is the part that wraps. Two presses at both card widths.
- **A map with one kitten reading it is a quarter smaller.** Keyed off how many
  kittens are in **that pane**, not off whether the screen is split, because the
  note says so in its second sentence: *"can be the current size when there are
  2 or more players in 1 split-screen."* It multiplies the whole answer rather
  than joining the `Math.min`, or it would only be 25% smaller on the shapes
  where it happened to win. **OVERTURNED BY THE PASS ABOVE** — the rule is the
  pane's SIZE now, and this one shrank the map of a girl playing on her own on a
  whole screen. Kept here because the paragraph that shipped it named that
  consequence and argued for it, and the argument is the thing worth being able
  to find.
- **The Dojo board has one ceiling again.** *"When there is 1 player in the
  dojo... the UI is too big. Should be the same size as when there are 3 players
  and 2 players are in the Sin/Cos dojo together."* A portrait pane had the 540
  cap lifted, which was tuned against the four-player 730px column — and the
  same branch also covers a **958px half-screen**, where it handed a girl on her
  own a 930px board over the circle she is standing on. `mathSharedWidth` **is**
  the three-player answer, so "the same size as" is now satisfied by calling it.
  Costs the case the lift was added for: that 730px column drops 702 to 540.
- **A seat is not a cat, on the profile screen.** Third instance of this bug.
  `.kd-p1 { --me: var(--frost) }` is a rule about SEAT TWO and every colour on
  the card reads `--me`, so Storm in seat two was drawn pink throughout. The
  seat keeps its class — four methods find a card by it and they really do want
  the seat — and the cat writes her colour on inline, which is what
  `Tournament._championCard` and the arena health bars already do.
- **The panda stops following when the oath does.** Stamped at
  `_startFinale` and rebuilt from the save, so the benefit in the ring belongs
  to the kitten still sworn to Pandapaw.
- **The summon roar belongs to the dragon.** Moved off the seventh star and on
  to the torii, where he actually arrives. Pinned at **both** ends — gone from
  the errand, present at the arrival — because a move is two facts and checking
  only the second lets it end up in both places.
- **The holographic town panics three ways.** A quarter jump on the spot, half
  switch between running and throwing their paws up, the rest stand rooted. The
  roll is off the seeded rng, so a director can give notes on it. An
  InstancedMesh can only hide an instance by scaling it to nothing —
  **`Matrix4.decompose()` reports a scale of ONE for an all-zero matrix**
  (it guards the degenerate determinant), so the check reads the matrix column
  length instead. That cost most of an hour and is written down in the check.
- **Caught by the Cross Slash, she looks frightened before she flies.** A new
  single-cell pose beside the eat, bless, warp and breath ones, on screen for
  exactly the hold.
- **Two Flash Step orbs teleport the full Lock Range at a target.** The near
  clamp existed so one orb could not overshoot the opponent it was aimed at;
  with two the range is the point of the second orb.
- **One orb shows the landing, two keep it secret.** Reconciles with the
  earlier opposite report: with one orb the landing is fully determined by
  facing, so there was never a secret to keep. The secret belongs to the case
  where the landing is genuinely chosen.
- **Mr Satan's platform is opaque.** The x-ray's floor guard skips geometry
  strictly below the feet, and the booth lid's top face sits at **exactly** his
  foot height — right fix, off by one epsilon in the wrong direction. The lid
  now opts out of the x-ray entirely (`xrayStrength(..., 0)`) rather than
  widening the epsilon, which would have kept the shape of the bug.
- **Steal Mischief marks her with the Sense Mischief chevron.** It was the Flash
  Step's reticle, which says AIMED AT; the chevron says FOUND, which is what a
  marked sister is. Same five-sided cone, flipped to point down.

**Nine from a phone, and most of them are one bug wearing different hats.**
One branch, `mobile/nine-notes-from-a-phone`. Measured throughout at
**844x390**, a landscape phone, which is the only shape a phone is ever in —
the rotate gate says so. **Short, not narrow** is the sentence to remember: the
axis that runs out is height, and three of the nine were fixed by finding width
nobody was using.

- **The award card is half the size on a phone.** It had **no `body.touch-ui`
  rules at all** — every number in it is a desktop literal, so a 620px card with
  a 26px heading landed on a 390px-tall phone at exactly the size it lands on a
  1080p screen, across the kitten it is about. Halved rather than `scale()`d, so
  it is a smaller card and not a shrunken one. **The sentences stop at 10.5px**
  and the check on them is a floor rather than a ratio: half of 15 is 7.5, which
  is not small text, it is a grey line.
- **A pane card that is open owns the screen under it**, and that is three of
  the nine at once — the Character Profile that would not scroll, the input
  buttons on top of LOOK AT MY ORBS, and the minimap taking clicks through the
  card in front of it. **One cause:** `#pane-cards` was z-index 6 and
  `#touch-pad` is 7, and `.tp-zone` — the stick's catchment — is the bottom-left
  46%x78% of the **whole screen** with `pointer-events: auto` and `touch-action:
  none`. It swallowed every touch meant for the card under it, the scroll drag
  included. Nothing was ever wrong with the card; it was not being reached. It
  goes to 8 while it is open, which is above the pad and below the menus, keyed
  off the `.hidden` class the Inspector already owns so there is no second flag.
  The minimap, the maths board and the four buttons she cannot use from that
  card stop taking taps; **ACTION and START stay**, at half opacity, because one
  is the back button and the other is the only way out of the game. **The stick
  is deliberately not in that list** — asked for by name, and taking it away
  would strand a kitten standing in the world while she reads.
- **A scroll is not a selection.** New module, `src/core/tap.js`, because the
  note was general: *"this should apply on all screens that have scrolling and
  clickable UI elements."* Two bindings, because there are two shapes of it.
  `onTap` replaces a `pointerdown` handler outright — that is what the pane card
  had, and it is **both halves** of the report: it fired before the gesture
  existed, and its `preventDefault` cancelled the scroll it was mistaking for a
  tap. `dragGuard` only **subtracts** drags from a `click` handler, which is
  what the dealer's counter needs, because YES, NO, BUY and SELL are real
  `<button>`s and a keyboard Enter is a click with no pointer behind it. **The
  target comes from the press, not the release** — she aimed at a row, and a
  list that moved two pixels under her has not changed which row she meant.
- **One toast per combo, not one per cane.** A kid swinging at a grove filled
  all four lines of the strip in about two seconds, so the toasts that matter —
  *she joined a clan*, *the match is being called off* — were pushed off the top
  by the sound of her own katana. The second and later repeats **fold into the
  line already on screen** and count up: `10x bamboo cut by Ember!  +100`. **It
  does not move** — the note offered "deleted and respawned", and counting in
  place is the same thing minus a card teleporting under a number nobody can
  finish reading. It re-arms its own hold, so a combo that is still growing is
  never the one the four-line cap drops, and it never folds into a toast that is
  already fading. **The first one keeps its own sentence**, verb variety and
  all. Mischief is **one key**, not one per prop kind — keyed by kind, a girl
  running down a market row gets three lines counting to one each.
  **This one is not touch-only**: the same pile happens on a desktop with four
  panes, and one behaviour beats two that drift.
- **The minimap is 20% bigger on a phone.** A factor (`MAP_TOUCH_UP`) rather
  than three re-tuned decimals, so the check can say what the note said. And it
  really is 20% at every split, which had to be **measured** rather than
  assumed: `mapWidth` is a `Math.min` of three terms and only one carries the
  factor, so on a phone shape where `MAP_MAX` happened to be smallest a "+20%"
  would have come out as +0% with nothing on screen to say so. The tightest of
  the four is the side-by-side split and it still clears its next term by 37%.
- **The Help clips are half again as big, and the pairs a quarter.** The one
  that needed measuring: **a side-by-side clip was never hitting its height cap
  at all.** Raising 46vh alone — the change anybody would try first — would have
  moved it by nothing. The column is 313.8px inside a panel that is 759.6 inside
  an 844px screen, spending 60 on padding and 32 more on the card's own inset.
  **The lever is the width.** The panel goes to 96vw and 94vh on a phone (`min
  (780px, 90vw)` is a desktop rule that has never once bitten on a desktop), and
  then: singles 179 -> 273 (**+52%**), pairs 179 -> 226 (**+26%**), the Dojo's
  two 179 -> 225 (**+25%**). **This is not an undo of the 46vh cap** — that went
  in for the opposite report, a clip that was the whole screen with its caption
  off the bottom, and the rule it was expressing is *a clip and its caption fit
  together*. 46vh was too cheap a guess at what that costs.
  `.arena-shot` is left out on purpose: it is the one picture with sub-cards
  under it. **The four-up ability grid reaches +17% and not 25%** — those clips
  are 16:9 and a 25% pair would need 800px of a 786px panel, so they would have
  had to stack.
- **Eight orbs at the dealer instead of three**, and a third of the height was
  being taken by a **selector collision**. `body.touch-ui .panel` has exactly the
  same specificity as `body.touch-ui .kd-panel` and comes 880 lines later, so on
  a phone it won both: `max-height` 84vh instead of 96, and `overflow-y: auto`
  instead of `hidden` — which made the whole panel a **second scroller** around
  the one that already scrolls, the bug the shelf's eight-row cap was removed to
  fix, quietly back on the device it hurts most. Then two columns, filled
  **down** so the stick still moves down the list, rows trimmed 62 -> 40, and a
  blurb clamped to two lines. Tried `repeat(5, 1fr)` first to line the columns
  up: every row takes the height of the tallest cell in it, the Cross Slash's
  three-line blurb is the tallest thing on the shelf, and rows went 40 -> 57 —
  **six orbs instead of eight, from a change made to tidy it up.**
- **…and the question scrolls itself into view.** `_askMarkup` already put it at
  the top of the card for exactly this reason — read its note, *"a question below
  the fold is a CONFIRM press that appears to do nothing"*. It was right and it
  was not enough: the top of the card is not the top of the **view**, and she
  presses BUY from a footer button after scrolling the shelf down to find the
  orb. Measured: the question appeared 75px above everything she could see, with
  the footer still showing BUY. `block: 'nearest'` and only when the question
  changes, so a visible one moves nothing and the other three keep their scroll.
- **The "Ember at the Dealer" text is 1.93x bigger.** `--u` is `min(1cqw,
  1.78cqh, 0.8vh)` and at 844x390 that is `min(8.44, 6.94, 3.12)` — the **window
  term wins by better than a factor of two**, and `clamp(9px, 2.5 * 3.12, 22px)`
  lands on the 9px floor, where it has stopped responding to anything at all.
  That term means *the whole shelf has to fit*, which is right on a desktop and
  unreachable on a phone at any size — ten rows in 390px is 39px a row including
  the orb circle — so it was spending legibility on a goal it could not reach.
  On touch it keeps the two terms that are about the pane: 17.4px, inside the
  card's own 22px ceiling.
- **59 new checks** (4145 -> 4204), and the two that deserve naming: the
  `#pane-cards` / `#hud` / `#touch-pad` **document order**, because the sibling
  selectors silently stop matching if anybody reorders index.html and nothing
  errors; and the `--u` arithmetic re-solved at 844x390, so a later tweak to the
  multiplier or the clamp fails here rather than passing a string test.

**Six more, and four of them are the same note: there is too much writing.**
One branch, `mixed/help-pages-trimmed-and-the-warning-on-top`. Four Help cards
were reported over-long on one afternoon, and nothing in `world-check` could
have caught any of them — every sentence on all four was true, and most were
pinned by a check that wanted them kept.

- **LOAD A SAVED GAME sits beside the trailer, not above it.** Asked for as
  "should appear after the player presses the Play button. Or at least, have it
  to the left of the Watch the Trailer button so it is not messing up the UI on
  the main menu." Stacked, it was a **third row** under the cat-head menu and
  pushed the girls' artwork up the screen. One line of CSS: `.menu-row-2` is
  `grid-auto-flow: column` now, which is also what makes the hidden case free —
  a `display: none` button is not a grid item, so a machine with no saves gets
  back the full-width trailer row it always had, to the pixel, with no second
  rule and no `:has()`. Below 560px they stack again, because "LOAD A SAVED
  GAME" at half of a narrow stack wraps to two lines and the pair stop being
  the same height.
- **Saving your progress is half as long.** 2071 characters of visible text
  down to 1119. What went was the arithmetic: the list grows from five to eight
  when you keep more than four, never past ten, and drops the shortest kept game
  before the newest — four sentences, all true (`capFor`), none of them a
  decision anybody makes. `world-check` used to read those numbers back out of
  the prose; it now asserts the card cannot **contradict** them (every "last N"
  and "every N" still on the card has to be a number the code uses) and reads
  the numbers themselves off `capFor`, which was always the check doing the
  work. **The browser warning is untouched** — "condense it" is not a licence
  to trim the one sentence that stops an afternoon being thrown away.
- **Quests & achievements keeps the quests and drops the prose round them.**
  The "your card shows every orb you won" paragraph is gone, as asked. One
  clause of it was not fluff and is kept as a clause: *the griffin waits until
  the last of you has had her turn* is the answer to a girl standing at a
  griffin that will not move, and a page that quietly dropped it would have
  made the game look broken. Both lists and their emblems are untouched — they
  are the page.
- **The rare orbs card is what you would need to decide whether to buy one, and
  nothing else.** 1694 characters down to **536** in the card itself. The test
  for what stays up top is "would she buy it": where they are, what each does,
  what they cost, and the one warning that changes the answer — 守 is worthless
  without a 壁 Ward, and two and a half orbs' worth of points is an afternoon's
  savings.
- **…and the rest is behind 瞬 Flash Step expanded and 守 Long Guard expanded.**
  Asked for by name. A third level of Help card, inheriting `.help-sub`
  entirely and only stepping the heading down again — and in **its own
  accordion group** (`help-rare`), because the exclusive group is matched
  across the whole document and an expander carrying `help-arena` would close
  the card it lives inside the instant it opened. That is the identical bug the
  `help-move` / `help-arena` split was written to stop, one level further down.
- **The two-orb Flash Step rule is written once now, not twice.** It was in
  both cards because the bug *before* this one was one of them being right and
  the other wrong, and writing it out in both was the fix at the time. Two
  copies is how that happened. Special abilities keeps the **sentence** — a
  reader being taught the move must not be left thinking a second orb is
  wasted, which was the original report — and points at the expander for the
  rest. `world-check` pins the pair rather than the duplication: one card
  explains it, the other may not fall silent about it.
- **The bamboo warning paints over the minimap instead of under it.** Reported
  exactly, reproduced exactly, and the cause is one missing number: everything
  in `#hud` that can overlap the strip carries a `z-index` (`.map-box` is 3,
  `#join-card` and `#balls` are 6) and the strip carried none — and a
  positioned box with `z-index: auto` paints **under** every positioned sibling
  that has one, whatever the document order says. **It only started overlapping
  when the maps did**: index.html still calls the bottom strip "the only strip
  of the frame nothing else claims", which was true when there was one shared
  map in the bottom right. There is a map in the bottom-left of every pane now.
  The check is a **comparison**, not a literal 8: a future HUD part that
  arrives with a higher number fails rather than quietly covering a warning
  again.
- **And it is still hidden during a cutscene, with no second rule.** The other
  half of the note. The strip is a child of `#hud`, `#hud.scene-hidden` is an
  `opacity: 0`, and opacity on a parent takes the whole subtree with it however
  high a child's `z-index` is — measured mid-cutscene: the warning is in the
  DOM and the computed opacity is 0. Move `#warnings` out of `#hud` to get it
  "above everything" and Ryuuseki gets a warning across him; two checks now say
  so.
- **And a Help card has a length budget.** The check that would have caught all
  four: the visible text of a card, with comments, markup and its own
  sub-cards stripped out, against a cap set just above what it is today. It is
  a ratchet against the next slow drift, not a style guide. There is a floor
  under the two expanders as well — a fold that moved the words out of the
  parent into a card nobody filled would pass every budget and lose the
  explanation, which is the failure mode of *trimming*.

**Thirteen more, on the teleport and on what a save remembers.** One
branch, `mixed/thirteen-notes-teleport-and-saves`. In the order they were
reported. Four of them are one bug — a thing the game owns being taken out of
the scene, or left in it, by whoever happened to be holding it.

- **The Help pages had the second 瞬 orb backwards.** The rare-orbs card said
  "a second one is a wasted slot", and `aggregate()` has read `blink >= 2` as an
  **aim upgrade** for as long as the second orb has bought anything: one orb
  picks which *side* of your sister you come out on, two pick the *exact spot*
  by how far you push the stick. The one page in the game that exists to explain
  the rare orbs was telling a nine-year-old not to buy the thing that makes the
  move interesting. Rewritten on **both** cards — the rare-orbs card and
  **Special abilities**, where the move itself is taught — with the part that is
  a warning as well as a feature: it wants a **stick**, so a kitten on the
  keyboard who buys a second one has bought a control she cannot use finely.
  `world-check` now pins both paragraphs against `aggregate()` itself.
- **The Flash Step comes apart, travels as a spirit, and bursts back.** Asked
  for in detail and built in detail: a **half-strength ghost** of her boiling in
  and out over the wind-up (her own pose *blinks* underneath it — `alphaTest:
  0.35` means a player sprite can never fade, only blink, so the effect is two
  halves in two files and neither works alone), a **glowing orb in her own
  colour** where the see-through preview kitten used to stand, a **shell that
  closes on the spot she left and throws itself open where she arrives**, and a
  **column of falling kanji at both ends**. She is solid at **95% of the whole
  move**, not of the tenth of a second she is gone for — measured, after the
  first version was measured: 95% of `FADE` is five milliseconds, one frame at
  60Hz, and on screen it was indistinguishable from the hand-off it replaced.
  The rain had been **cut once by name**, with a rule attached: do not put it
  back without taking something else out. What went out is the preview kitten,
  and the comment that forbade it now records the trade instead of the ban.
- **LOAD A SAVED GAME is on the title screen, and only when there is one.**
  Second row, beside WATCH THE TRAILER — not a fourth cell in the top row, which
  would move the cat-head menu the girls drew. It is **hidden until this browser
  actually holds a save** (`_refreshTitleLoad`, at boot and on every return to
  the title): a button that is always there and can only ever open an empty list
  teaches a child that the game lost her afternoon.
- **The kept star's word is black.** Gold on gold. The star stays gold.
- **SAVE & QUIT GAME refuses under five minutes, and says so.** A reversal:
  it used to write a short row and merely not mark it *kept*, on the reading
  that the five-minute rule decides the mark. Reported against that reading —
  and the old reading was worse than it looked, because a short row is still a
  **row**: it takes a slot, and the autosave refuses to write exactly that, so
  the button was a second door into the list with the opposite rule on it. Boot,
  look at the town, SAVE & QUIT, four times, and the afternoon somebody cared
  about is off the bottom. The refusal is its own return value (`short`) and not
  a `null`, because "this browser will not store anything" must **not** close
  the window and "there is nothing worth writing yet" may.
- **Orbs stopped being left hanging in the air.** Reported from the character
  picker with a photograph of it. Every orb a kitten owns — the plain kotodama,
  the worn Powerup constellation, the gold quest tokens — now hangs off one
  `Player.orbRoot` group, so a swap, a drop-out or a restart takes the lot in
  one line. **This is a fix by construction and not a located cause**: the
  symptom would not reproduce on any seating path tried (0 orphan groups, every
  time), and the class of bug it belongs to is `scene.remove(orb.group)` on an
  orb whose parent is something else — a **silent no-op**, three lists deep,
  found stale in four places. `world-check` now scans main, kotodama, feats and
  savegame and fails if any of them adds or removes an orb from the scene
  directly.
- **The debug keys are asleep until the panel has been opened once.** Asked for
  to stop somebody enabling debug input without knowing. `` ` `` is the only key
  that answers on a cold tab; `_debugArmed` is set by the panel actually
  **opening** and never cleared. A gate that also swallowed the key that opens
  the panel would be a panel nobody could reach — the same class of bug it is
  guarding against. The phone's five-tap corner arms them the same way.
- **A restart really does put the endgame back in its box.** Reported as the
  kotodama and the dealer's stall still standing after RESTART or TITLE SCREEN
  once the ending had played. `Kotodama.clear` had said *"used to by
  Game.restart"* in its own doc comment since the day it was written and
  **nothing had ever called it** — dead code that read as the rule being in
  place. Calling it is also what makes a **load** correct, which is the half
  nobody could see: `restore` tests `snap.awakened && !game.kotodama.awakened`,
  and nothing ever put `awakened` back, so that test could never pass twice in
  one tab. The parked pandas of kittens nobody is playing go too — they are in
  the scene like any other, and `_recallPanda` would have adopted one into the
  *next* game.
- **Ryuuseki is not there when Patchfur sends you to fetch him.** He used to be
  built on the frame the seventh star landed, so ALL SEVEN STARS played "take
  them to the great torii... and when the sky goes dark, do not run" over a shot
  of a forty-metre dragon already hanging above the torii, answering the errand
  before she had finished setting it. He is built by the **arrival** scene now,
  and the roar stays — with nothing on screen it is a thing heard from
  somewhere else, which is what the line about the sky is for. The check that
  fires the arrival measures to the **torii** rather than to the dragon (the
  same number against the same point, because he was built standing on it), so
  *when* it happens has not moved.
- **Both dragon scenes in the debug viewer show the dragon, above ground.**
  One line caused both halves: the two cases shared a body aiming at
  `this.ryu?.position ?? B.centre`, and in a debug session there is almost never
  a dragon — so the fallback was the middle of the whole archipelago, which is
  open water, at a y averaged over the bounding box, which is **under the
  ground**. They are two shots and they are two cases now: `found` aims at the
  torii with nothing above it, `summon` **really summons him** (and toasts,
  because a debug key that changes the world has to say so) and frames him at
  `quad * 0.85`, which is what the game itself uses and what the preview never
  did.
- **A save remembers the panda, including how big it is.** Reported as a badge
  reading "20 more bamboo" under a kitten who had had a full-grown one for an
  hour. This file used to argue at length that the animal should be **rebuilt**
  from `cut` / `fedFrom` / `raised` rather than recorded — a good argument that
  the code did not implement (`applyCast` never called `_updatePanda`, which is
  only reached by swearing or by cutting a cane) **and that could not have
  worked anyway**: `tierFor` charges growth from the tally at the moment the
  animal last grew, so replaying the rule over a grown panda's numbers yields a
  **cub**. The tier is a fact now, with `down` beside it — a knocked-down panda
  is a cub that must stay one until the shrine — and the spot it was standing
  on. Bamboo never regrows, so an animal lost on a load was lost for that world.
- **And it remembers the dragon, who cannot be summoned twice.** The more
  serious half. Seven stars are taken once and `restore` puts them back exactly
  as the save found them, so a save taken after the summon came back with the
  scene spent, the stars gone and **no dragon anywhere**, with nothing in the
  game able to make another. He is saved with where he was, and comes back at
  the torii if that spot cannot be used.
- **A rider can be knocked off her panda.** The two of them were one column:
  she sits at the animal's feet as far as the hitbox is concerned, inside a box
  padded wider and taller than she is, so no swing could find her without also
  finding it — and the blow that unseats a rider is by definition the one that
  *missed* the animal. Measured rather than reasoned: seat 4.14, saddle 1.90,
  `strikeHeight` 3.4, jump apex 2.41. A `ceiling` on how far **above** the
  target the attacker may be gives three reachable bands — a standing blow can
  never reach a rider, a jump at the apex clears the panda and finds her, and
  between them both are in range. The cap applies **only while she is ridden**,
  so an unridden panda keeps its generous column.

**Ten more off one afternoon's play, and not yet played back.** One branch,
`mixed/ten-notes-from-an-afternoon`. In the order they were reported.

- **The minimap's crosshair is the last three, and only the last three.**
  Asked for in those words. It was `mapOn || she has the buff`, so a kitten who
  swore to Icewhisker had a mark on her map from the moment she swore, with two
  hundred props standing: a compass spinning between whatever happens to be
  nearest, and the ISLAND given away for every barrel in the game, which is the
  one thing `MAP_FROM` exists to hold back. **What the oath still buys is the
  world chevron**, unchanged, from the first prop of the afternoon. The map
  answers "which island"; that question is only worth answering at three.
- **Bamboo that nobody can eat says so.** Nothing regrows (non-negotiable 4),
  there are a fixed number of canes in the sky and a panda costs forty of them —
  so four kittens who have not sworn can flatten every grove in the game in ten
  minutes and leave the party unable to raise a second panda. A **new warning
  strip** at the bottom of the screen (`#warnings`, `Game.warn` — not a toast:
  a toast is news addressed to one kitten and this is a consequence addressed
  to the room) tells a cutter every **tenth** cane that she has no panda to eat
  it, and the whole party at **50%** and **25%** of the grove, naming who has
  not sworn. A mark is spent when it is *passed*, not when it is spoken, or a
  kitten joining at 30% would be told half the bamboo was left.
- **A leader you walk up to will talk to you.** Interact on an unmet clan
  leader starts her introduction instead of asking you to stand still for the
  dwell timer. The prompt had to change with it: it used to go **silent** on an
  unmet leader, so the one moment the new press exists was the one moment
  nothing said it was there. It now reads `MEET ICEWHISKER`.
- **The sin/cos board is one size in a shared pane, and 10% see-through.** The
  arithmetic was the diagnosis: a side-by-side split on 1920×1080 gives each
  pane 958×1080 — *portrait* — and the portrait branch lifts the 540 cap to
  fill the width, so two sisters sharing a column got a ~930px board over the
  game they were playing. A three-kitten pane at four players is the 62%
  *landscape* pane and already came out at exactly 540. `MATH_SHARED_W` is now
  both the ceiling **and the floor** for any shared pane; the portrait lift
  stays for a kitten alone in a column.
- **Who won the round, under the health bars, while he says it.** Her face —
  the measured portrait crop, not a guess — her name and WINS THE ROUND, placed
  by *measuring* `#arena-hud` rather than at a number that clears it at one
  split and covers it at another.
- **The ending has its music on a rewatch, and its cues fire at all.**
  `_updateMusic` is the last call in `_tickBody` and **every scene branch
  returns**, so during the ending the one thing allowed to start a track never
  ran on a single frame. The first watch had music only by the accident of
  where `_finaleDue` is cashed in; WATCH THE ENDING AGAIN is a click handler, so
  by its next frame the branch was already returning and the ending played in
  silence. The same gap meant `finaleCross` and `finaleOpen` had never been
  heard on any watch. This is the third bug of exactly this shape.
- **WASD is player one's second hand, and always her menu's.** With one
  controller and nobody else playing, WASD drives her too (`_spareHandPass`).
  The moment a sister is dealt WASD it is hers alone — *except in a menu*:
  `Input.menuHand` lends it back for the pause menu, because a paused screen has
  one cursor with a named owner and no kitten in it. Five refusals on that
  method, each one a different way of counting a press twice.
- **The quest checklist is twice the size, and scrolls.** 26px, a row of the
  cursor with `▲ ▼ to read`, paging on the stick and remembering where it was.
  `_scrollQuests` returns false at either end so the row can be *left* — a list
  that swallowed up and down forever would be a cursor she cannot escape on the
  one screen with no mouse.
- **A spare pad joins on A or START, and a dropped-out Joy-Con can rejoin.**
  Reported as "Joycon player is unable to join after dropping out", and the
  cause was the *gesture*: it was `hasSentInput`, a flag that never goes back to
  false, so `_autoSeat` needed a permanent per-device latch to stop a departing
  girl's own controller re-seating her on the next frame — and that latch is
  what made her device unseatable for the rest of the session. A press **edge**
  needs no latch. **Richard offered a second option** — ENTER seating a padless
  controller before it looks at the keyboard — and that one was deliberately not
  taken: it would make ENTER do something surprising to the person sitting at
  the keyboard, who pressed it to join *on the keyboard*. The refusal-while-
  somebody-is-still-picking now toasts on this path too.
- **One minimap per screen, optional.** *Settings ▸ Minimaps* — "one in every
  window" (the new default) or "only two, shared". Players three and four get
  their own, and the zoom button turns the map in the pane you are looking at,
  which is what the wrong-map problem always was. Solved by construction rather
  than by a new rule: `nearestMap` already answered "my own pane's map, or the
  nearest box", so a map in every pane makes its second half unreachable and
  not one line of `assignMaps`, `nearestMap` or `keyMaps` changed. At two
  players both settings produce the same screen, bit for bit — non-negotiable 5,
  and `world-check` pins it.

**Thirteen fixes off one afternoon's play, and not yet played back.** One
branch. They came in as one list and they are listed here in the order they were
reported, because several of them turned out to share a cause.

- **The ending is one door now.** `Game._startFinale` is the only way into the
  finale, and the counter reaching 100%, the scene viewer and WATCH THE ENDING
  AGAIN all go through it. That matters because starting the ending now has
  three jobs beside playing it: **it opens the arena** if 80% never did (the
  last thing Patchfur says is to go and fight in it, and `1` can reach 100% with
  the gate shut), **it hushes the announcer**, and **it takes the cast out of
  the shot**. Three copies of that would have been two ways to watch an ending
  with somebody talking over it.
- **Nobody talks over it and nobody stands in it.** `Announcer.hush` is new and
  is deliberately not `clear`: it empties the queue, stops the audio, takes the
  card off the screen and then *goes on refusing* for the whole minute. The
  collision is the likely one rather than a rare one — `lasthunt` says "One! One
  last thing standing in the whole sky!" and the prop that answers her is the
  hundredth percent, so without it the elder is talking on a card in the corner
  while the elder starts talking in the dialogue box. The voice goes quiet from
  `_finaleDue` (the frame the counter lands); the kittens and their worn orbs go
  invisible only while the scene really plays, because `_finaleDue` can sit true
  through somebody else's scene.
- **It has its own music, and the music moves with the picture.** Three new
  pieces in `core/audio.js` — `finale` under the whole scene, `finaleCross` on
  the isles drifting apart, `finaleOpen` on the arena. The scene *names* a track
  and `Game._updateMusic` reads it; the scene never starts a piece itself, or it
  would be a second music authority. The switches are keyed to shot cues, so a
  re-recorded line takes the music with it.
- **The green health is a boost, not a new ceiling.** Two separate bugs wearing
  one symptom. `_nextRound` banked half of what *anybody* had eaten, without
  asking `overflowing` — which `_startFeast` had been setting correctly all
  along — so a **draw**, where nobody is `overflowing`, still handed both
  kittens a bar past full. And the overflow lives *inside* `maxHp`, so every
  heal in the game was aiming at the raised ceiling: `Player.trimRoundBonus`,
  called every frame of a live round, lowers the ceiling as the green is lost
  and can never raise it again.
- **A genuinely unplayable stretch is acted on in ~1.2s, not ~9s.**
  `AUTO_HARD_MS` / `AUTO_HARD_HOLD_MS` are a second rung on the same decision:
  four seconds of 25 FPS is worth waiting out, four seconds of 40 ms frames is
  four seconds of a round she is losing. **And if a human has chosen a quality,
  the automation is off for ever by design** — the game now says so once instead
  of silently doing nothing. *Arena lag could not be reproduced in the preview
  pane*, so this is a rule made stricter rather than a measured fix; if Richard
  had Graphics set by hand, that was the whole of it.
- **WATCH THE ENDING AGAIN** is in Play Settings ▸ Watch Again, on one latch
  (`_endingWatched`) set when the scene really starts, carried in the save and
  cleared by a restart. It used to be read off two other people's flags, one of
  which the replay itself cleared — so watching it twice hid the row.
- **Two fixes in the Character Profile, both CSS, both measured.** The orbs were
  clipped and shifted sideways because `overflow-y: auto` **computes the other
  axis to `auto` as well** — measured live as `overflowX === "auto"` — so the
  1.12 cursor ring became real horizontal scrollable content that
  `scrollIntoView`'s default `inline: "nearest"` chased. `overflow-x: clip` plus
  a halo on `.kd-slots` that is the exact sum of the scale and the ring. And
  LOOK AT MY ORBS showed half the orbs at one player because `--u` is a zoom off
  the *pane*: at one player the list had 183px of room for 713px of rows (2.8 of
  ten), at two it had 318px for 392px (9.0 of ten). A third `0.8vh` term caps
  it, so everybody gets the card that was already right.
- **Every other island sees through now.** `_scatterOutlying` and the shrine
  islands build the same trees, lanterns and torii as the town and had the plain
  toon material, so a kitten hunting the last barrel behind a pine simply
  vanished — the exact bug the x-ray exists for, on the islands where the last
  five pieces of mischief are. Both merges are kept in `world.outlyingXray` and
  aimed by `_aimTownXray`, through the same rule rather than a copy of it: a
  material nobody aims never cuts.
- **The dialogue box re-mounts its two spans per beat.** There is one `#cs-text`
  and three systems write to it; only `Cutscene` keeps children in it, and
  `textContent` replaces children. After the summon or shrine scene had run, the
  typewriter was writing into orphaned nodes — blank box, voice playing, nothing
  thrown. Which is why the report was "watch the story again after forcing the
  ending with the debug shortcut".
- **The debug keys run in the order the afternoon does.** `1` mischief, `2`
  endgame, `3` orbs, `4` arena, `5` the tantrum, `6` END, `7` NUDGE — and `8`
  the frame-cost readout, last because it is the only row that is not a beat of
  the game. **`1` was the frame cost and is not any more**; CLAUDE.md, PROJECT.md
  and the published page all say `8` now, and `world-check` pins the whole map
  in both directions so the next new key cannot land on whichever number is
  free.

**The ending and the Dragon Breath are rebuilt and not yet played back.** One
branch, `mixed/an-ending-cut-to-the-words`. Both came out of one note after
watching the ending through.

- **The ending is nineteen shots cut to Patchfur's own words.** It was five,
  and the five were cut to beat NUMBERS, which is why the town started tidying
  itself before the camera found it and the crash landed in the middle of a
  clause. Every row of `FINALE_SHOTS` now says which *phrase* it cuts on
  (`say(beat, 'lantern')`), which has to be a fraction of the line rather than a
  time because the real voice clips stretch the four beats from 7.5/8.5/8.5/9 to
  about 11.7/16.8/17.2/17.1 the moment they load. What is on screen: the barrel,
  the box and the cane picked out one at a time with a ring of light as she
  names them; one measured corner of the town standing itself back up and
  **crashing over again** on the end of "the rest of them", a dozen of them
  audible and staggered; the **real** Dojo of the Turning Circle with a kitten
  running the painted circle and the game's own sine and cosine drawn off her;
  a model of the archipelago huddling, shaking and drifting apart on its floor,
  crossed by four tiny kittens who leap together at the bridge; the actual
  bridge, with kittens pouring over it past the lens; then the arena, Mr Satan,
  and the world. Three of the cuts are cuts, with a 0.34s dip to black.
  *Three things were measured rather than reasoned:* the three named items
  cannot share a frame on any real world (furniture stands in a town and bamboo
  grows in a grove — the nearest cane to the tightest barrel-and-box pair is
  over thirty units), so it is three close shots; the camera's bearing is scored
  against `world.solids` across the whole arc it will swing through, after the
  first version measured one direction and then turned into a house; and `lift`
  is a fraction of the frame height rather than a number of units, after a
  number of units held the model beautifully at 40 units out and threw it off
  the top of the screen at 26. **The fourth non-negotiable is verified end to
  end on a real world**, not just in `world-check`: the full run and an Escape
  at twenty seconds both come back with zero props off their transform, nothing
  still held, the MISCHIEF total untouched and the scene graph back to the
  count it started on.
  → [story.md](docs/notes/story.md), `src/systems/finaleshow.js`,
  `src/systems/finaletide.js`
- **...and its last two shots were rebuilt a third time, after watching them.**
  Six reports, five of which turned out to have a cause other than the one the
  report guessed. *"Time is paused here, the bamboo is blocking the view"* was
  the camera standing **2.8 units from the middle of a 48-cane grove** — nothing
  was paused — so `_clearAngle` learned what a thicket is (a disc, charged by the
  chord a sight line cuts through it), that a subject is not its own obstacle
  (`self`: eighteen railing posts stand on the deck they belong to and scored the
  whole compass negative), that a shot may name the arc it wants to be looked at
  from (`face` / `span`), and that past three units of daylight the composition
  should decide rather than the clearance (`need`). *"They are passing through a
  tree"* was a trunk growing in the **road**: cherry trees consulted `keepClear`
  and `solids` and never `roadMask`, which the grass tufts always had. *"The
  bridge on the road and the torii gate look sloppy"* was three independent sets
  of literals — the spur crossed the deck at 9.5° and a metre off its centreline
  — now all solved off one `BRIDGE`. The abilities were two free-running random
  clocks and are **one state machine with real gravity**: 落 Power Dive is a
  double jump, a fifth of a second hanging dead still and then 24 units a second
  straight down onto a shockwave, 突 Charge works in the air, 壁 Ward is the two
  shells `Player` pops, and 瞬 Flash Step takes her off the screen with smoke at
  both ends. **Every one of them makes a noise the real move makes**, through a
  callback `world-check` hooks. And the model of the archipelago is a third
  closer and eight degrees steeper, measured **in the frame** — it covered 40% of
  the picture's width and now covers 56–70%.
  *One measurement error is recorded at length because it cost a whole pass:*
  `beat.dur` is `voiceDur + TAIL` and `voiceDur` is read off the mp3 **in a
  browser**, so in Node it is the authored floor — 9 seconds against a real 17.1
  — and the crossing was paced to fit half the shot it is cut into. `clip` is the
  recording's own length and had been in the table all along.
  → [story.md](docs/notes/story.md) *"The third pass"*
- **...and a fourth, because the third fixed the wrong thing.** The "frozen,
  half-fallen" canes were `FinaleTide.slam` itself: 66–95° of tip written onto an
  XYZ euler whose middle turn cancelled part of it, so 18 of 46 canes stood
  mid-air. Now a quaternion fall to flat. The crossing is back down the road
  from behind the gate, eight units back and two up, with the gate whole in
  frame. The Dojo looks *above* the model at the action (median NDC 0.37 → 0.08).
  The "nothing left standing" truck runs at half speed, and the sky change now
  starts on it, about 6.5 s in, via a new `sky` shot field. A draft **method for
  directing a shot** is at the end of the story note, seed for a future
  "Gaming Movie Director" skill.
  → [story.md](docs/notes/story.md) *"The fourth pass"*
- **The ending's fifth pass: the town you can see, and a bridge shot that only
  zoomed.** The hologram's people (2.5×) and animals (2×) billboard to the lens
  and each wear a seeded recolour done in the shader; they flickered because the
  town island and the crowd shared one depth, fixed with `renderOrder` bands that
  also cured the rider. The quake starts on *because something broke*, at half
  energy, and the town throws its paws up and freezes. The kittens and their
  dragons fade in and stand on *between them*. The model's bridge is the real
  `buildBridge`, and the real east torii turned to line up with it. A new shot
  field, `into`/`lead`, pushes the camera in on the model and lands on the next
  shot's first frame. "Nothing left standing" holds 2 s longer at the same speed.
  The crossing is the first row's angles from 34 units instead of 22, chosen by
  replaying the run through the lens (100% of sightings in frame).
  → [story.md](docs/notes/story.md) *"The fifth pass"*
- **The ending's sixth pass: a scared pose, a smaller rabbit and rat, a Ward
  float, and the cutscene skill in the repo.** `ember_scared.png` and
  `frost_scared.png` (four kittens by recolour) are what the model town wears in
  the earthquake, and are there for any future fright. **Known and not yet
  fixed:** on the bridge run a kitten can run into a torii post, and one can
  spawn inside the Kotodama dealer's cart.
  → [story.md](docs/notes/story.md) *"The sixth pass"*
- **息 Dragon Breath charges half as long and hits everybody it sweeps.** Three
  things, all from playing it. The charge went back to **0.8s** — "twice as
  long" had been read as the whole move and applied to the wrong half; the
  **flame** is the half that kept the doubling, at 1s. The cone is a **live
  hitbox for the whole second** now instead of one test at the start, so turning
  on the spot catches everybody it crosses — and catches each of them exactly
  once, shield or health, however many times the cone passes over them. And she
  goes back to her ordinary run/walk/idle the moment the flame starts: the
  head-back inhale pose is the *charge*, and holding it through the breath read
  as a stuck animation.
  → [tournament.md](docs/notes/tournament.md), `src/entities/clanpower.js`

**Six reported from play are fixed and not yet played back.** One branch,
`mixed/lighter-art-clearer-scenes`. Two are about weight, four are about things
that were plainly not working.

- **An oath is worth something in the ring now.** Two of the six clans got an
  arena move, on ACTION, aimed with the stick, on a ~40s cooldown with a HUD
  pip that counts it down and chimes when it is back.
  **盗 Steal Mischief** (Icewhisker) marks an opponent; any hit landed on her
  inside the window knocks one of her **Kotodama onto the deck**, thrown clear
  and untouchable by everybody for 4 seconds so the four of them have to fight
  over it. It is returned to its real owner when the tournament ends, down every
  path — still loose, worn by the thief, worn by a third kitten, or sold — and
  dropped at her feet if she has no room. **息 Dragon Breath** (Windwhisker) is
  a kitten-sized version of her own clan buff: rear back for 0.8s, then a cone
  8.5 units out wherever the stick points. It cannot be interrupted, does not
  get knocked back when hit, and drops her ward while it runs.
  **Neither is a second combat path** — the breath is a row in `ATTACKS` and the
  steal is a mark paid by an ordinary already-gated hit — so non-negotiable 3 is
  intact. **The breath has since been rebuilt to be seen** — see below.
  → [tournament.md](docs/notes/tournament.md), `src/entities/clanpower.js`
- **...and the storyline says why.** Knocking the world over is what woke the
  Kotodama: mischief is the entropy dormant in every standing object, and the
  orbs are what it looks like once it is out — which is why "stealing mischief"
  is literally knocking an orb loose. The ending's rewinding town is that
  argument acted out by the set. **Patchfur's ending script has not been
  rewritten or re-recorded yet** — the new lines are drafted for Richard to read
  first, and no ElevenLabs audio is generated until he approves them.
- **14MB came off the first load, and the dragons got sharper doing it.**
  `packMetrics` had both dragons packing at scale **0.698** — thirty per cent of
  their own art discarded on every device on every load — and `contentScale` and
  `contentArea` are ratios that do not move under a uniform resize, so a master
  shrunk to pack at 1.000 draws identically for half the VRAM. `title_art` could
  not be resized (it is the kids' painting, full bleed, on the first screen
  anybody sees), so it is q92 WebP at full resolution: 5.5MB → 0.46MB, and the
  only lossy image in the game. New tool, `tools/sprite-bake.mjs`; the masters
  live in `docs/art-masters/`.
  → [art.md](docs/notes/art.md), [hosting.md](docs/notes/hosting.md),
  [mobile.md](docs/notes/mobile.md)
- **The white between the wings is gone**, which no runtime rule could have
  done: `clearSealedPockets` is bounded by DEPTH because size and purity alone
  ate Mr. Satan's teeth, and both dragons had a pocket far past that bound.
  The bake turns the bound off per file and writes a proof image over a magenta
  checker, because what the loader can never have is **a human who looks**.
  New art from here on is generated with a transparent background.
- **The shrine dais is stone you stand on.** Reported as *"the player is in the
  ground on the shrine, like there is no collider"* — it was drawn and nothing
  else, and the leader was on top of it only because `leaderSpot` added the
  height by hand. Every step is a walkable disc platform now, which needed
  round decks, a per-platform climb tolerance, and `heightAt` learning that a
  platform sits ON an island rather than replacing it.
  → [world.md](docs/notes/world.md)
- **...and the shrine scene has two people in it.** The camera sat on the axis
  between the leader and the kitten, so the kitten was a blob under the lens
  with the dialogue box over her and the leader talked at nobody. She is stood
  on a mark in front of the leader, the camera swings ~66° off the axis, and
  **which way it swings is scored rather than picked** — a shrine is a gate
  whose posts stand at a fixed offset in world x, so which of the six puts stone
  through a face is an accident of geography.
  → [story.md](docs/notes/story.md)
- **The dealer's list scrolls.** It was two scrollers fighting: the shelf capped
  itself at eight rows inside a `#kd-body` that scrolls too, so the last rows
  lived in a box whose own bottom was 250px below the panel and no gesture
  reached them. → [endgame.md](docs/notes/endgame.md)
- **Ryuuseki is on the minimap**, with two seat pips saying whether there is a
  seat free. He was on no map at all for a reason no amount of reading
  `minimap.js` would find: he is not a `Dragon` and has never been in
  `Game.dragons`. → [dragon-hunt.md](docs/notes/dragon-hunt.md)
- **Patchfur is on screen at her own ending.** The finale is a `SummonScene`,
  which shows the world with the speaker in a portrait box — so it was four
  beats of a disembodied voice over an empty sky. She stands where she stood in
  the opening, with the intro's composition carried over and only the distance
  re-solved, because that lens is 42° and this one is 54°.

- **The worn orbs all rain now, and none of them print numbers.** The bug was
  real — `_giveOrb` gated the overlay on `n === 0` while the M key lit every
  orb, so the second orb she found came up blank and then lit itself when
  anybody pressed M. The answer to "so should all eight print their working?"
  was no: eight `cos 0.71 sin 0.71` strings orbiting at 1.4 units is a second
  copy of the lesson, printed too small to teach anything, in front of the
  first one. **The rain is still made of the orbit** — the fall rate comes off
  the orb's angular speed — and each orb now has its own five kana, hashed from
  its id so a scene is filmable and an orb keeps its character when the one
  before it comes off. → [endgame.md](docs/notes/endgame.md)
- **The ending's picture is the world itself now.** The four white line
  figures drawn behind Patchfur are gone — replaced, not disabled — because the
  ending's idea is entropy and entropy in this game is a couple of hundred
  objects the girls actually knocked over. So while she talks, the world
  **stands back up** in a wave and goes over again. It moves meshes and never
  touches `knocked`, `scored`, `gone` or the MISCHIEF total, and `finish()` —
  which is the SKIP path too — restores every prop's exact transform from a
  snapshot rather than running the wave back to zero. She still acts it with
  the one drawing she has, a lean and a step per beat. **The scene has since
  been cut to the words** — see Open items.
  → [story.md](docs/notes/story.md), `src/systems/finaletide.js`
- **...and she had been foreshortening for the whole ending.** `faceCamera()`
  on `SummonScene` is a no-op, so the stage quad kept its build orientation
  while the finale camera climbs and turns most of a quadrant. Never edge-on
  enough to look broken — just narrower every beat, which is why nobody said
  anything.

- **The Character Profile is as wide as its cards have earned.** At one player
  on a full screen it was 1420px — the width FOUR cards want — with a single
  card stretched across it, and it still had to scroll. Both halves are the
  same fact: `.kd-slots` is four `1fr` columns of `aspect-ratio: 1`, so every
  pixel of extra width came back as height and each orb was a 189px circle.
  Slots cap at 84px; the panel takes half a screen per card, as a `max-width`
  so two, three and four players are untouched.
  → [endgame.md](docs/notes/endgame.md)
- **A held key can no longer answer a question nobody asked.** Two independent
  bugs behind *"say yes to FROST LEAVES THE GAME? and it asks about STORM
  too"*: a slot handed a keyboard set mid-hold reported every key already down
  as a fresh press (`Input.update` seeds `prev` on a binding change now), and
  `MenuNav` remembered a cursor INDEX while the DROP OUT list rebuilt under it.
  It remembers the element now — follow it if it moved, land on `.back` if it
  is gone. **The general note Richard asked for is
  [gotchas.md § UI FALL-THROUGH](docs/notes/gotchas.md)**, linked from
  CLAUDE.md's house style, with the four questions to ask of any new screen.

- **息 Dragon Breath is a dragon now, not a green puff.** Reported as *"it is
  hard to see the dragon breath in the match"*, and it was three separate
  things. The flame was **additive**, which over a sunlit green deck washes an
  orange cone to white — found by looking at a screenshot, because no amount of
  reading the material would have said it; it is ordinary transparent blending
  now, with additive kept only for the gather ball and the muzzle flash. It was
  `0x8fe0a0` **green for everybody**, and is the firing player's own colour with
  a white-hot nose (`DBREATH.hot`) so you can see whose it is across a split
  screen. And it lasted 0.8s; the FLAME is **1s**, and the charge went to 1.6s
  and came straight back to 0.8 — played, the charge was the half that felt
  wrong. See the breath bullet under Open items for where it landed.
  **The wind-up is now loud on purpose**, so the other three can prepare: a
  drawn **head-back inhale pose** (`ember_inhale.png`, `frost_inhale.png` —
  generated, background-removed, cropped to the cat's own bbox so
  `contentScale` measures the cat and not the swirls), a vortex of 16 specks
  spiralling *into* her mouth in her colour, a closing ring round her feet, a
  white gather ball at the muzzle, and two new synthesised cues —
  `dbreathin` (five escalating gulps over a climbing tone) and `dbreathout`.
  **The intake is drawn in 3D, not on the sprite**, so it reads from any camera
  angle and at any of the four colours.
  *Found by the checks that went in with it:* the lateral scatter was a straight
  world-x/z offset, so a kitten facing east had her cone's spread added to its
  own travel axis and the drawn flame overshot the hitbox — a real pre-existing
  bug, fixed with a perpendicular basis. `world-check` now reads the cone back
  off `flame.getMatrixAt` and asserts it reaches no further than the hit does.
  → [tournament.md](docs/notes/tournament.md), `src/systems/clanfx.js`
- **The ending is a shot list, and the town stands up where you are looking.**
  Asked for as *"zoom in on a few areas on the map where the action of the
  mischief will happen... would be good to zoom in on the actual Bridge...
  can have camera zoom in on the Dojo of the Turning Circle"*. Five shots over
  four lines (`FINALE_SHOTS`), each with its own push-in on its own clock so a
  cut never lands mid-easing: down among the wreckage, the same heap from 46
  units up as it rights itself, the Dojo, then the bridge, then the whole
  archipelago. Beat 3 carries two shots, which is how both places Richard named
  get one inside a single seven-second sentence. **No coordinate is typed** —
  `world.bridge` and `world.dojoCentre` are published off the numbers those
  things are built from, and `mischief` is `_heap()`, the measured centre of the
  tightest knot of things actually lying on their sides this afternoon.
  **Patchfur walks off for the three shots that are about somewhere** and back
  for the last one, because a nine-unit cut-out in front of a close shot of a
  bridge is the bridge. **And the wave follows the camera**: `FinaleTide.focusOn`
  re-deals the ripple's order by distance from the shot, so the things standing
  up first are the ones in frame — the ORDER only, nothing culled and nothing
  skipped, since the last beat's fall is a restoration of everything the wave
  stood up. The dialogue is unchanged, as asked.
  → [story.md](docs/notes/story.md), `src/systems/summonscene.js`

228 new checks (2810 → 3038), and pad-check steady at 362. One thing is
**still open**: the
Patchfur ending's *script*. Richard asked for staging first and the script
after, so the visual half is done and the recording is untouched — the next step
is a text-only draft of a Bugenhagen-style rewrite for him to read, with the
current text and audio backed up before anything is generated.

---

**The panda fights now, and the cub heals you.** Branch
`feature/panda-in-the-arena`, and the biggest single addition since the Cross
Slash. On `alpha`, not played back yet.

- **A grown panda is a second body in the ring.** You can swing its claw at a
  kitten — 1.2x a standing slash, through `Game.strikePlayers` like every other
  blow in the game — and anybody can hit it back. It has 30% of a kitten's bar
  and a hit box 2.8 units wider than her, which is what riding one costs: you
  are a much bigger target. **Riverclaw's reach does not lengthen the claw**,
  forced at the gate so the rule has one owner.
- **Three outcomes when a blade arrives.** The panda only: she is untouched.
  Both: both take damage, she *stays on*, and the pair is pushed a third as far.
  Her only: full damage and she comes off. Which one it is is decided before a
  single number is spent, because collapsing the animal would change the answer
  half way through.
- **An empty bar makes it a cub, and it stays one** — for the rest of the game,
  until she walks back to the Pandapaw shrine and presses interact, which costs
  no bamboo because the canes were already cut. `knockedDown` is a flag of its
  own precisely so `_updatePanda` cannot quietly re-grow it off the tally.
- **The cub licks her better.** Below 30% of her bar it walks in, keeps station
  for a second, and heals half a percent a second up to the threshold — a
  rescue, not a way to sit out a round. A pink tongue on `sin(lickPhase)`, the
  animal leaning in on the same beat, green motes rising off *her* in the
  overflow bar's green, and one chirp per lick counted off the same phase the
  tongue is drawn from.
- **All nine numbers are on the balance page**, with a sentence each.
  → [world.md](docs/notes/world.md), [tournament.md](docs/notes/tournament.md)

91 new checks (2537 → 2628), including a harness that **lifts
`Game.strikePlayers` and `Game._updatePanda` out of `main.js` and runs them** —
`Game` cannot be imported into `world-check`, and the alternative was regexes
asserting that words appear in a file.

---

**Five reported from play are fixed and not yet played back.** One list, one
branch — `mixed/drop-orbs-satan-waits-overflow-heals`. Two of them are Mr.
Satan, two are the tournament, one is the trade screen.

- **She can put orbs DOWN.** `SPRINT` on the Character Profile screen drops
  whatever is on her side of the table, scattered around her feet by the same
  code that sheds a leaving player's orbs. It asks first — naming every orb —
  and a **dropped orb is shy of the girl who dropped it until she walks out of
  range**, because `DROP_R0` is 2.6 and `PICKUP_RADIUS` is 2.8, so without that
  it would be back on her the next frame and the button would look broken. Her
  sister can take it immediately, which is the point. A phone gets a `DROP`
  button in the footer.
  → [endgame.md](docs/notes/endgame.md)
- **Mr. Satan will not lose his temper at an empty box.** The fuse still burns
  down whatever you do — it is funnier when it goes off behind you — but
  nobody up there at zero and he simply stops: no charge, no shout, no bang, and
  back to `off` rather than `cool`, so the next kitten gets the whole
  performance from the top. **He also waits for her to LAND** before he starts:
  the notice cylinder is 3.5 units tall, so he was talking over a jump that had
  not finished. **And what the card says is now what he says**, by construction
  — the bubble was being fed a hand-written short version of a line the
  recording was made from in full. One string, and `card()` is the only thing
  between it and the screen.
  → [tournament.md](docs/notes/tournament.md)
- **A round decided on the clock says ROUND OVER, not K.O.** Both fighters
  still up and the banner reads `ROUND OVER` and he says *"Not down... I
  guess... but we have a WINNER!"* — a new recording, `sat_over.mp3`, Harrison
  like the rest of him. The question the code asks is `_sidesUp().length > 1`,
  the same function that decides a round is over at all.
  → [tournament.md](docs/notes/tournament.md)
- **Losing on your feet no longer costs more than being knocked out.** It used
  to: an angel came back full and the kitten who merely lost on the clock came
  back on whatever was left of her bar, so being beaten badly was the better
  outcome. Whoever did not win the round now starts the next one full, angel or
  not; a draw heals nobody, because nobody lost.
  → [tournament.md](docs/notes/tournament.md)
- **...and the feast now buys something else: a GREEN overflow bar.** Half of
  what she healed by eating raises her **ceiling** for one round — 100/100
  becomes 110/110 — and the extra is drawn as a bubbling green cap on the end
  of her HUD bar that drains first when she is hit. It is half of what she
  *gained*, not of what she ate, so a kitten already full banks nothing. The
  bonus lives **inside** `maxHp`, so every existing reader of `hp / maxHp` keeps
  working and none of them can be handed a fraction over 1. It is visible while
  it is being gathered, not sprung on her next round.
  → [tournament.md](docs/notes/tournament.md)
- **Trading points alone works.** It always refused with *"that would leave
  somebody carrying nine"* — a sentence about the eight-slot cap, printed
  because `Kotodama.trade` is an orb function and correctly returns `false` for
  a swap of no orbs for no orbs. It is only asked when there are orbs to move
  now; the fix is at the caller, because `trade` was right.
  → [endgame.md](docs/notes/endgame.md)

116 new checks (2421 → 2537).

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

**The ninth Kotodama is in, and is not yet played back.** 守 Long Guard — the
first orb that is bought and never found.

- **It is the dealer's alone.** Not a lower spawn rate, no spawn at all: the
  scatter and the Awakening prize both draw from a new `WORLD_ORB_IDS`, which is
  the roster minus this one. Two kittens still find exactly the eight they
  always did.
- **It does nothing on its own, and that is what pays for it being strong.**
  It lengthens the 壁 Ward bubble beside it and there is no bubble without a
  Ward — the SET costs two slots before it costs a point. The spec declares
  `needs: 'ward'` so `world-check`'s "every orb changes something" rule knows
  about the exception structurally rather than by name.
- **Hold the block past the shipped two seconds and the wait is a fifth
  longer**, then a chime and a blue spark gather into her when it is finally
  back. Let go before two seconds and there is no penalty at all, so the orb
  widens a choice rather than handing over a stat.
- **The predicate asks two questions and needs no tolerance.** The first
  version charged every ordinary full-length block, because a block ends the
  frame the clock crosses its ceiling and therefore lands just past it.
  world-check caught it on the first run. → [endgame.md](docs/notes/endgame.md)
- **The screens learned that "eight" was two different numbers.** `MAX_EQUIPPED`
  is what she wears; the roster is ten. The dealer's shelf is now a bounded,
  scrolling box with the cursor walked into view and a fade that says there is
  more, so the footer — the only way out on a phone — cannot be pushed off the
  bottom by a tenth orb later.
- 2.5x price, two on the shelf, `AEGIS` on `/tuning.html`, its own Help card.
  **`BLAST` got a tuning panel too** — a new check found it had a `tune()` table
  and no page, which is how a balance tool rots. 80 new checks.

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

**The tenth Kotodama is in, and is not yet played back.** 瞬 Flash Step — the
first move that takes her feet away, and the second orb the dealer alone has.

- **Sprint + Interact and she is gone for half a second.** Nothing touches her
  while she is away — `hurt` returns 0 before it even looks at `invulnT`, and
  it refuses a Cross Slash's piercing third cut too. Then she is rooted for the
  same half second again: no walking, no jump, no shield, no mount. She can
  still swing, and she can still start a Cross Slash, because that one is
  already a stand-still move.
- **The stick is an AIM, not a heading.** Push it and she comes out on that
  side of whoever she was facing; never push it and she comes back exactly
  where she stood, which is a real choice and not a failed input. Hold the
  shield button as she goes and she pivots around *herself* instead — the flee.
- **Whoever she is looking at gets an 8-bit target ring in her colour**, drawn
  narrowing in and springing open again when it ends. Targets have to be inside
  a 120° cone at **15 units** (half again as far as it shipped at), or already
  inside her swing, and on the same strike-height the katana asks about: if you
  could not hit her, you cannot pivot around her. **That strike height is now
  3.4** — one storey rather than half of one — and it is deliberately the ONE
  vertical plane anything reaching for a person uses, blade and reticle alike.
- **The radius is the SHORTER of the gap at the press and the gap at the
  commit**, so a sister sprinting away does not tow the landing spot behind her.
  A landing over nothing is refused outright with a `deny` — the fourth
  non-negotiable applied to the one move that can put a kitten somewhere she did
  not walk to.
- **She leaves something behind in the smoke.** A log, a bow-tie, a scarf, a
  boiled sweet, or her clan's emblem, dealt round in order rather than shuffled
  so four dodges are four different jokes. It hangs in the air for a second with
  no gravity — which is what sells the substitution — then **falls** to the
  floor she was standing on, does not revolve, and stays for **twelve seconds**
  rather than one and a half: the joke is for her sister on the other half of
  the screen, who looks over later, not for the kitten who threw it.
- **One time in twenty it is a live mantis** — capped at one per kitten per
  round, and no longer the booby prize. It is the fastest thing in the game
  (18.9 against a sprint's 17, so a chase cannot close on it), half again as big
  as it was, it **takes off and flies** a third of the times it would have
  hopped, and it heals **four times** the free regen — double the bird. You
  cannot hunt one; you can only time a swing at a hop or a take-off. Mr. Satan
  has five things to say about somebody smuggling snacks into his arena.
- **A second 瞬 upgrades the move instead of doing nothing.** Two orbs and how
  far she pushes the stick decides how far round her sister she comes out:
  under 5% is not an aim at all, 5–20% puts her right next to her (inside a
  standing swing — the backstab), and 20–100% scales out to the full radius. The
  walking deadzone was NOT lowered to allow the nudge — a worn Joy-Con would
  walk a kitten across the arena — the raw axes are carried on `PadState`
  instead and exactly one function reads them. At a full push the one-orb and
  two-orb kittens land identically, to the last decimal: the upgrade buys
  precision and never reach.
- **The move draws its own working now.** The circle of every landing she could
  reach, around whoever she locked, following them until she goes and then
  frozen; a see-through her standing on the landing she has chosen, from the
  SAME arithmetic that moves her; the right triangle between the two kittens
  with theta, `r cos θ` and `r sin θ` printed off the drawn vectors in the
  Dojo's own colours; and 瞬's kana raining at both ends of the jump. She fades
  out and fades in, which her own sprite cannot do (`alphaTest: 0.35` makes any
  fade a hard cut) — two sprite ghosts do it over exactly the post-commit
  window. **Gravity now waits for the paralysis**, so a teleport onto a roof is
  not a teleport onto a roof followed by sliding off it while helpless.
  → [endgame.md](docs/notes/endgame.md)
- **A new concentrating pose**, two fingers to the forehead and eyes shut, worn
  for the four fifths of the move that happen before she goes. Two sheets, four
  kittens, through the same recolour loop as the eating and blessing poses.
  Delete them and the whole move still runs — she just concentrates in her
  ordinary standing pose.
- **The effects are a poller** (`systems/dodgefx.js`), like the Cross Slash's:
  `player.js` never imports it, so no way of a dodge ending can weld a target
  ring to somebody's head.
- 2.5x price, two on the shelf, `DODGE` on `/tuning.html`, and a fifth cell in
  the Help page's abilities grid — **holding a drawn placeholder until its clip
  is filmed** (`tools/help-blink-placeholder.mjs`; the swap is one attribute).
  120 new checks. → [endgame.md](docs/notes/endgame.md)

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

**The feast follows the angel too, on a phone,** while keeping her costs no
more than distance 64; past that it stays on the kitten eating, at 40 (was 34).
See "The feast was a still of the whole deck" in
[mobile.md](docs/notes/mobile.md).

**The tenth pass (Richard's "quick fixes")** is in
[mobile.md](docs/notes/mobile.md) and [payne.md](docs/notes/payne.md):

- **The desktop announcer** is a strip along the bottom edge, one line at
  1280 and up.
- **The league picker** offers RETURN TO THE ENTRANCE and FLY HOME, with the
  way they came in as the default.
- **The roll call** puts each name up with the clip that says it.
- **Payne** drops a kitten's waiting answers when she leaves the card, and
  does not say a line twice within 30s; names are never repeats.

**The ninth pass (Richard's "Fixes")** is in [mobile.md](docs/notes/mobile.md):

- **Team picker:** tapping a name moves her to the next side, and a phone has
  a FIGHT! button beside BACK. The decision behind it: every screen takes
  touch, and the touch pad stays behind menus.
- **Arena HUD:** at three and four on a phone, a side's fighters sit side by
  side; the HUD is 40px tall instead of 107.
- **Menus:** the whole menu band now draws above the arena's HUD, the
  announcer and the award card.

**The eighth pass (Richard's "More mobile fixes")** is in
[mobile.md](docs/notes/mobile.md):

- **Announcer:** one line along a phone's bottom edge, words up as they are
  said, the oldest cut off the left. On a desktop it is centred, higher, 23px
  and two lines at most. The desktop's big sizes had never applied (a rule
  order bug) and now do.
- **Ring camera:** leads a jumping kitten by the rig's own lag, so a jump
  stays in frame (head 0.73 → 0.35 in NDC).
- **Name entry:** the keypad keeps its scroll on every letter.
- **Profile:** at one or two, the orb's text sits beside the rack and four
  quests show in bigger type; at three or four the footer is half height, and
  three is always three across.

**The seventh pass (Richard's "Some mobile fixes")** is written up in
[mobile.md](docs/notes/mobile.md):

- **Maps:** the one-screen map is a tenth smaller and clears the stick, and a
  split phone's maps sit in the top outer corners.
- **Title:** nothing is built until PLAY, on a desktop too. The title is
  black. Going back to the main menu, RESTART and an in-game LOAD are real
  reloads, and every build runs behind a loading screen that can now be seen.
- **Settings:** every row is remembered (`kk.settings`).
- **Ring camera:** fitted through the lens into the space the HUD and thumbs
  leave, so both kittens stay in view.
- **Feast:** keeps one closer zoom and follows the kitten who can eat.
- **Open:** during the feast, should the camera follow a phone player who is
  the angel?

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
`docs/art-masters/title_art.png`, into `out/` (gitignored — the tool is the thing
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
the library cover, the icon and the wordmark out of `docs/art-masters/title_art.png`,
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
| [world.md](docs/notes/world.md) | the clans and their buffs; the panda; Snake Way |
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
