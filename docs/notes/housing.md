# Custom Housing — Roshi's islands

*Read this before touching anything in `src/systems/housing/`.* Built October
2026 on `feature/custom-housing`, from Richard's full spec in one pass ("build it
all ... put in placeholders ... keep a note of all the placeholders"). **The
placeholder list is at the bottom and is the work that is left.**

## What it is

After the ending, Roshi — a cat-ified old turtle master on holiday, flowered
shirt, sunglasses, shell — stands in the market under an ISLANDS FOR SALE sign.
He sells four sky islands. Each has a house on it (a minka, a dojo house, or a
sky castle for up to four co-owners), a garden, and a Snake Way road of its own
from the town, grown in her colours when she buys.

| file | what it owns |
| --- | --- |
| `catalog.js` | **the data, and only the data**: the four sites, the three houses and their rooms, the room kinds, the furniture, the presets, the prices. Everything else reads these rows, so the card, the editor, the save and `world-check` cannot disagree |
| `housing.js` | the orchestrator — building the islands, the roads, collision, locks, money, music, interaction, persistence. `game.housing` |
| `homeisle.js` `homehouse.js` `homebridge.js` `statue.js` | the island, the house (with its cutaway roof and x-ray walls), the bridge (deck, torii, speed strip, glass door, name plate) and her statue |
| `homestore.js` | the store: `localStorage` + the save row + JSON export/import |
| `cards.js` | **every screen**, as one inspector ext-provider with a per-seat view stack |
| `editor.js` | the tatami grid, footprints, `fits`, `autoLayout` |
| `purchasescene.js` | the purchase cutscene |
| `roshi.js` `jukebox.js` `farm.js` `koi.js` `fishing.js` `angling.js` `holodeck.js` `petplay.js` `kendo.js` `models.js` | the realtor, the boombox, the bamboo farm and the animals, the koi, the fish table, fishing in the world, the holodeck's racks, playing with the animals, kendo, the vendored models |

## Decisions, with the reason

**Prices are multiples of one orb, never points** — 8×, 12×, 20× (Richard). The
orb's price already follows world size and party size (`orbPrice`), so a home
costs the same *amount of play* at two players and at four.

**Selling pays 75%**, behind `confirm.ask` with no `.primary` — non-negotiable 7.
**A castle sells only with every owner present and saying yes**, through the
consent flow in `cards.js` (`pending` / `_askOthers` / `_answer`); a co-owner who
is not in the game is refunded through her `sessionCast` row, and if she has none,
the bank (`pay`).

**State changes on ACCEPT, never at the end of a scene.** `buy()` deducts, writes,
saves and only then starts the purchase scene; skipping it with Escape/Start
(`finish()`) snaps every animated thing to its end state. A scene that is skipped
cannot leave a half-bought island.

**The islands are far — a minute's walk.** The four sites were MEASURED: a probe
wound a Snake Way road from the home island to each candidate against every road
already in the sky and kept the ones with no fault. Two candidates touched the
bamboo/ash roads and were rejected. The sites and the reasons are in the comment
on `HOME_SITES`. **Each site has one fixed bridge slot** — so no purchase order
can make two roads cross; they are solved in one canonical order (`solveNow`).

**The 2× strip** is a stretch of each road whose `boost` multiplies `glideK`
in `player.js`. It is a property of the road, so dragons and mounts are untouched.

**An unbought bridge is not ground.** `heightAt` answers for a bridge only once
its home exists — `world-check` pins it — so nobody can walk out onto a road
that was never built.

**Locks are one fact, shown twice.** The glass door on the bridge and the door
of the house read the same `home.open`. The owner always passes; anyone else is
pushed back by the cloudy-glass bubble (radius 57), **including on a dragon or a
griffin** — a passenger never runs `Player.wall`, so `_mounts` pushes the animal.
Every refusal toasts *with the owner's name and an instruction* (non-negotiable 6).
**A castle is open if ANY owner has opened it** — one front door, four keys.
**Castle rooms are claimed by walking in first**, and each owner opens or shuts
her own (`_roomWall`).

**The music: the newest kitten onto a bridge picks it**, and it beats everything,
dragon music included (`_wantedTrack` asks housing first). What plays is **that
bridge's owner's choice** on her jukebox; a kitten on a home island with nobody
on a bridge hears that island's. Six tracks, **ElevenLabs Music recordings with a
procedural stand-in each** (non-negotiable 9) — see *Music* below.

**Interiors** cut the roof away and x-ray the walls in the pane of whoever is
inside (`aimView` → `xrayVertexMat.setCuts`). Furniture sits on a **tatami grid**;
a room's kind decides what may go in it, and a preset furnishes the whole house
in one go (`autoLayout`).

**The holodeck** is the Dream Dojo's own way in, not a copy:
`DreamDojo.enterFrom(p, spot)` stands her at her tube, suits her up if she is
not already (the poof) and rises her in. `Housing._holoHome` puts her back in
her holodeck room **only after she has been in the sim AND the walk-out and
un-suit are done**; a kitten who walked off before the rise is left at the
arcade, and a tournament forgets the way home rather than taking it.
`world-check` walks a stand-in through the real phase names.

**The animals never die.** `careLevel` counts visits in the last seven days, with
a bonus for two visits ≥24h apart; neglect only lowers the buff. The buff is the
panda's: health ×1.2, claw ×1.15, an extra jump, and **the Goblin Sweep via
`ATTACKS.sweep`** — the row that already exists, not a second sweep.

**The bamboo farm and the koi run on the real clock** (`Date.now()`), not game
time: 2h a stalk, feeding every 12h, rare colours at 12%. A home is something to
come back to.

### Non-negotiable 3, relaxed — on purpose, and only here

**Kendo sparring in a taped square inside a kendo room** is the one place a
blow lands outside the ring. It is not combat: `strikePlayers` still asks
`Tournament.fighting` first, and when that says no it hands the blow to
`kendo.sparStrike`, which needs **both kittens geared, on the same square, in
reach and in the arc** — and then **shoves and scores an IPPON point. It never
calls `hurt`.** `world-check` pins both: the gate's regex, and that `kendo.js`
contains no `.hurt(`. Nothing outside that square changed.

## Persistence

**Homes belong to one saved game** (Oct 2026; until then they outlived every
game, which Richard reversed after a new game found last week's castle in the
sky). The store — homes, furniture, the bank, the record board, the jukebox
choices and the **boons** — is one row per play session in `localStorage`,
`kk.homes.v1:<sessionId>`, plus a copy in every game save (`snapshot.homes`).
The row is written the frame something is bought; the save is up to 30s
behind; **on a load the newer of the two wins.** `Game.restart` mints a new
session and calls `Housing.reset`, so a new game starts with nothing. The
browser keeps the newest `HOME_ROWS_KEPT` (8) rows; the saves keep their own
copies regardless. The old global `kk.homes.v1` row is never read again — the
homes in it were test homes.

**The islands are not up until the ending** (`Housing.isUp` = the shop is
open): built at boot because the roads take seconds to solve, but hidden, not
ground and not walls until then.

The JSON export/import on the home card works on the current game's store.
`worldSig` is unchanged by buying (checked): homes are what the players did, not
the world.

## Music

`tools/capture/jukebox-music.mjs` does to the six takes what `shadow-music.mjs`
does to the boss music — **the same code**, moved into
`tools/capture/music-loop.mjs` (shadow-music's `--dry` output was byte-identical
before and after the move): measure the beat in ±12% of the BPM the prompt asked
for, find a loop on whole bars by self-similarity, cut the seam on the music,
match the level. Raw takes in `tools/capture/music-takes/jukebox/`, the prompts
in `jukebox.js`, the generation ids in the tool, ElevenLabs flow
`LRBTaBnKWB4SFA1bf00O`. 5,400 credits (~$1.08) for the six, Oct 2026.

Measured: every take landed on its asked tempo except MOSS GARDEN (asked 70,
measured 73.5, drift 83ms — it is ambient and has almost no onsets to measure).
**TATAMI LO-FI's best loop scored 0.55** where the others score 0.75–0.98 — a
seam that may be heard; **listen to it before deciding it is fine.**

## Placeholders — the work that is left

Each one degrades: delete the file and the game draws the stand-in.

| what | the stand-in | to finish it |
| --- | --- | --- |
| **Kendo: kneeling, reaching for the shinai, the bow** | the guard drawing squashed to 66% (seiza) or 80% (reaching), and tipped 0.42 rad toward her opponent for the rei (`Player`, the `kendoStance` block) | three drawings per kitten sheet — seiza, the reach, the rei |
| **Each kitten's kiai** | one synthesised shout (`audio.js 'kiai'`), pitched per kitten by `KIAI_PITCH` | four recorded kiai, a voice each ([voices.md](voices.md)) |
| **The kendo scoreboard** | ONE `#kendo-board` at the top of the whole screen, for the first match on | per pane, if two matches in two houses ever run at once |
| **Polyfork knobs** | ITEM CUSTOMIZATION offers size and the model's colourways only | its geometry knobs (`remixable`), with the same "never through the roof" cap |
| **Set plates** | plates on a kotatsu are not saved: a reload clears the table | a field on the room row, if it matters to anyone |
| **The storage chest** | a card that says so | a real inventory |
| **The prayer's drawing** | the star's reach pose (`homePose = 'bless'`) at the shrine AND for ITADAKIMASU | a prayer sheet: four directions × 3–4 frames, all four kittens |
| **Bathing suits** | a puff of steam, and the eating crouch in the water | an onsen pose per kitten |
| **Lying down** | the nap HIDES her (`homePose = 'hidden'`) and fades the pane if everyone in it is asleep | a futon pose |
| **The angel wings** | two white fans drawn in `boons.js`, flapping | a wing sprite or model |
| **Taiko, the cups game, volleyball** | a line and a sound | the mini-games |
| **The Bushido Blade forest** | shown, locked, "later" | Richard's later feature |
| **The fetch stick** | a brown box, spinning | a stick (or frisbee, or carrot) model |
| **The chick in flight** | the pen drawing, bobbing in the air — no wings move | a flying frame, or a flap on the billboard |
| **A mess** | four brown blobs (`PetPlay._pile`) | a drawn pile |
| **Boosts for kotodama abilities** | not done: the animals boost JUMP HEIGHT, JUMP DISTANCE and SPRINT only | Richard also floated boosting the panda or her kotodama powers; it is a `petBoost` field plus the one line that reads it |
| **Bridge decoration models** | every bridge is drawn (`linkParts` in links.js) — planks, rope, stone, a vermilion taiko-bashi, the blossom arch | Tripo or Polyfork pieces for the fancy styles; Tripo is paid, so say the price first |
| **Door panels** | two sliding paper panels per doorway, drawn boxes (`IsleHome._door`) | a shoji door model |
| **Windows open onto a gap, not glass** | the opening and two sliding panels | nothing needed unless a pane of glass is wanted |

## Boons — what home is worth in the ring

`boons.js` decides what is paid, `activities.js` when it is earned. Banked by
name in `store.boons`, moved onto the kittens at `Tournament.begin`, gone at
`finish` — **the next battle only**. Nothing here is a second combat path:

- **meal** (kitchen → plate overhead → SET THE TABLE at the kotatsu, one plate
  per diner → ACTION with no plate asks "eat with everyone?", NO first → every
  kitten round the table sits, ITADAKIMASU, eats): +5/10/15% of her ORDINARY bar as green, by diners, on round one
  and after every round she LOST — the two moments `_nextRound` already heals
  her. Added to the feast's banked green with `setRoundBonus`, so it stacks.
- **onsen**: ×2 on `strikePlayers`' damage number for the first 15s of each
  round — a multiplier read after the gate, never the gate.
- **bless** (shrine): the first ring-out of a round is wings instead: lifted
  `wingRise` above the RING (not above her — she is on the floor below it),
  `wingGravity` gravity and jumps refilled for `wingT`, blinking for the last
  second. The ring-out code skips her while `wingT > 0`, and charges her
  normally if she has not made it back.
- **The aura**: one orbiting spark per boon (red / white / green), faint while
  banked at home, bright while live; two or three read as one swirling orb.

The shrine's song (`music/shrinePrayer.mp3`, ElevenLabs Music, 45s with its own
ending, $0.18) outranks the boombox from the first kitten's prayer to its end;
`sfx/templeGong.mp3` (ElevenLabs SFX, trimmed to 7.2s) rings at both ends and
on the bell tower. Delete either and the procedural `dojo` tune and a synthesised
gong play instead.

## The bridge's two ends

A bridge is dressed the same at BOTH ends: a torii, a pair of grand doors
(`_grandGate` in `homebridge.js` — two hinged wooden leaves with iron rails and
a band in her colour) and stone lanterns and nobori banners. The island end also
has her second statue and a second jukebox that plays her island's music. The island end is
hidden until the bridge has grown all the way (`setGrow` k ≥ 1), so a
half-built bridge does not end in a gate floating in the sky.

The lock is the doors. The owner presses ACTION at either end to open or
close them. The leaves SWING over `DOOR_SWING` (1.6s) rather than snap,
except on load (`setLocked(locked, true)`), and a pulsing force field fills
both doorways while they are shut. `doorSegments()` is what the push-back reads,
so a shut door blocks at both ends. A visitor who presses ACTION is told whose
gates they are (non-negotiable 6), and nothing happens.

## Fishing, in the world

`angling.js` replaced the canvas card, which Richard found boring and which
showed no fish. There is now a stand of rods on the pond's bank, on the side
facing the middle of her island. ACTION takes a rod, and while she holds it
ATTACK belongs to the rod (`padFor` masks it from the katana). Hold ATTACK and
a ring on the water shows where the cast will land. Let go and the lure flies
there. The wild fish are dark shapes at the surface, each one a `rollFish` for
where it swims. They are drawn bigger the heavier they are, so she can pick out
the big one. The rules are the old card's, now happening in the pond: a gentle
twitch brings a fish to the lure, thrashing scares off the shy big ones, ATTACK
in the window sets the hook, and holding ATTACK reels in against the line
tension. A caught fish is replaced by a new one after `ANGLE.respawn`. A fish
that got away is still in the pond. The pond grew from 10 to 12.

Two bugs were found by the checks and are worth knowing about. A pad's stick
can be a getter, so the masked pad sets `mx`/`my` with `defineProperty`
(assigning them throws). And the release frame used to add one more frame of
power, so the lure landed half a unit past the ring.

## The holodeck

`holodeck.js` handles the room. A holodeck room has three racks (the arcade's
own `gearModel`s, at 0.7 scale) and her tube, which `holoLayout` places along
the room's long axis. She walks into a rack to pick up its piece. With all three
she poofs into the suit using the arcade's own poof (`DreamDojo.suitAt`).
ACTION at the tube calls `enterFrom` with `s.home`. The rise, the puppet, the
descent and the walk out all happen in HER tube. Only the crossing goes through
the arcade's tube, for one frame, because the sim's ports are the arcade's
tubes moved by `SIM`.

Before this, the holodeck stood her at the arcade, ran the arcade's sequence,
and then teleported her home afterwards (`_holoHome`, now gone).

The racks belong to the room, not to any one kitten. A piece that has been
picked up stays off its rack until whoever has it takes the gear off. That
happens when she comes back out of the sim, leaves the island (`unsuitAt`), or
a scene or the arena pulls her out. A sister who walks up to an empty rack is
told who has the piece. The arcade's own "gear off away from the pad" rule
skips her while `s.homeSuit` is set.

## A kendo match

Two GEARED kittens on one taped square for `BOUT.gather` (1.2s) start a match.
Richard's spec is quoted over `BOUT` in `kendo.js`, and the beats are all
there in seconds:

- **The ceremony.** Both kneel on marks along the room's long axis, facing.
  Then, one at a time: reach for the shinai, stand, KIAI (her own pitch,
  her spirit animal's hex). Then both bow. HAJIME. Through all of it her pad
  is DEAD (`Housing.kendoHolds` in the pad gate) and `pinnedAt` holds her on
  her mark. A swing in the ceremony is answered and does nothing.
- **The rounds.** Two IPPONS take a round. The round is `roundT` (60s) and
  the one ahead at time takes it; level is a draw and nobody's round. Best of
  three. Every ippon is YAME: both are held where they stand, then HAJIME.
  The shove from an ippon is along the floor (vy 2, not 5), so nobody leaves
  the square for being hit.
- **Jogai.** Off the square in a live round is a warning for `jogai` (1.5s),
  then the match is off and says why. So is a kitten leaving or hanging up the
  gear.
- **No kotodama.** `p.power = aggregate([])` for the match. Her orbs stay on
  her, and `_end` gives them back from `powerOrbs`.
- **JUMP is a dodge** (`KENDO_DODGE` in player.js, which is why it is there
  and not here: the two files would import each other). It fires on HELD jump
  plus a direction, once per hold. A press with no direction is nothing, and
  a thumb drifting a frame later is not a dodge either. `kendoDodgeT` is the
  immunity, read by `sparStrike`.
- **The camera** (`shotFor`) is per PANE, through the same `groupShot` the
  front door uses, so the shared rig and every stick in it turn together. It
  is closer than the house's shot and square to the line between the marks.
  **The walls** of that house are cut to `HALF_WALL` (2.1) for any pane
  watching (`halfWallFor` → `HomeIsle.halfWalls`, a clipping plane on the wall
  material). That is why the renderer has `localClippingEnabled`.
- **The drawings are 25% bigger** (`KENDO_SCALE`), and `footX` keeps her feet
  still through a mirror. The kiai drawing's feet measure 0.17 of its width
  right of centre, so every turn, and every swing (guard to kiai and back),
  slid her sideways. The guard's are centred (0.006).

## The house, Oct 2026

- **Castle rooms are claimed on the CASTLE ROOMS card**, a fair share each: the
  claimable rooms over the owners, rounded down (`claimShare`), so a room left
  over is nobody's and everybody's. LET GO frees one to pick another. Every
  refusal says why (`claimWhy`).
- **The stairs land on 2.2 of floor**, and the stair's own rail stops under the
  floor above. It used to stand 2 over it, 1.2 from the back wall: a kitten 1.2
  wide could not get off the top. The housing checks now WALK every staircase
  through `Housing.wall`, up and down.

- **Box stairs** (hako-kaidan) with a stairwell cut out of the floor above,
  railed on three sides. Before this, a kitten upstairs could not get down: the
  floor deck covered the top of the stairs and `heightAt` takes the highest
  surface. `ceilingAt` is null over a well, and nothing can be placed on the
  stairs or over the hole (`stairBlocks`).
- **Ceilings** stop a jump: `HEAD_H` (2.4) of her is solid against the slab.
- **The eave band** (`eaveBand`) runs from each eave to the next storey's foot.
  The pyramid skirt it replaces went through the room above. world-check casts
  down from just above every storey and fails on any tile below the ceiling.
- **The front door** frames a group in front of it (`doorShotFor`) unless one
  of them is inside.
- **ITEM CUSTOMIZATION**: size from half to half again (`LOOK_MUL`), capped by
  what `fitTo` measures for the room. BIGGER greys out at the cap and says why.
  The look is a Polyfork model's colourways or a drawn thing's lacquer. It is
  saved on the row as `look`. Wall things and the yard's BUILT things refuse,
  and say so.
- **Her holodeck tube** is the arcade's glass shader, drawn after her, and she
  floats `HOME_FLOAT_H` (0.55) so her ears stay under the ceiling.

## Playing with the animals

`petplay.js` gives the pen more to do than feeding, from the pen card's rows.
Picking a row closes the card.

- **MESS.** One pile per `PLAY.messEvery` (8h) of real time, up to three. Like
  the bamboo, it is worked out from a timestamp (`pen.cleaned`), so nothing
  ticks while the tab is shut. ACTION at a pile cleans it. The last pile makes
  every animal happier.
- **WALK.** Any animal follows her. Every `PLAY.walk` units she walks, it gets
  happier. If she leaves the island, it trots home and the toast says so.
- **FETCH, the goat.** Hold ATTACK to throw, like the fishing cast, with
  ATTACK masked from the katana in the same way. A throw counts only if the
  GOAT has to run `fetchNeed[level]` for it, measured from where the goat
  stands, not from her. A short throw is told how far the goat wants to run.
- **CATCH, the chick.** It flutters at `chickH[level]` and goes further after
  each catch. Levels 3 and 4 need 3 and 4 jumps, as Richard asked. A kitten
  without enough jumps is refused before she starts, and the toast names the
  number she needs and where more jumps come from.
- **HOP, the bunny.** It hops a rhythm, and she copies it with JUMP. Only the
  gaps between hops are scored, so starting late is not a mistake. Her pad is
  only watched, never masked, so she really jumps.
- **GROWTH and BOOST.** Every `joyPerLevel` happy times an animal grows a
  level (to 4) and is drawn 12% bigger per level. Each level is a named boost
  for the pen's owners: chick, JUMP HEIGHT; bunny, JUMP DISTANCE (air speed);
  goat, SPRINT. A level-up toast names the boost, and the card shows all
  three. The chick's figure is the HEIGHT gain (`k² − 1`), because its k
  scales take-off speed and the height is what she sees. With no pen, every
  boost is 1, so a kitten with no home plays exactly as before.

One bug turned up while building it: a freshly drawn pen stood its animals at
the ORIGIN until the next frame. A level-up re-syncs the pen, so a walk started
in that frame sent the animal running across the whole sky. `Farm._place` now
puts each animal in the pen as it is drawn.

## Placeholders that are done, and what each still falls back to

These were placeholders and are now generated (Oct 2026: about 12 Higgsfield
credits of `gpt_image_2_5` and 1 of `text2speech_v2`). The stand-in is still
in the code, and deleting the file brings it back.

| what | the file | its fallback |
| --- | --- | --- |
| **Roshi's sprite** | `sprites/roshi/roshi.png`, one 768 pose. Sized by `ROSHI_INK` (0.961) and stood on `ROSHI_FOOT` (0.0195), both measured off the baked sheet | `drawRoshi`'s canvas |
| **Her statue** | `models/statues/{ember,frost}.glb` — Tripo image-to-3D off her champion drawing (`tools/statue-bake.mjs`), then `tools/capture/statue-shrink.mjs`: 460k → 24k triangles (meshoptimizer, UV seams held), turned by a MEASURED yaw (both takes faced +x), texture baked to warm stone, 14MB → 0.8MB. The raw takes are in `out/statues-raw/` (gitignored; they cost Tripo credits — keep them). Storm and Blossom wear Ember's and Frost's, washed 30% toward their colour, on their own plinth with a band in her colour | the drawn stone cat |
| **Roshi's voice** | five clips in `voice/roshi/`, Arthur ([voices.md](voices.md)) | the toast alone |
| **Kendo** | `kittens/<sheet>/kendo.png` (the guard) and `kiai.png` (the men strike, held for `KIAI_T` after every swing in the bogu), recoloured by STYLE for Storm and Blossom. `kendo.js` only sets `kendoGeared` and `kiaiT`; `Player` draws them. They MIRROR like the Riposte stance, and world-check measures the shinai reaching right | the drawn men and shinai |
| **The animals** | `farm/{chick,bunny,goat}.png`, side-on, head LEFT (measured), turned along the circle they walk | the primitive bodies |

## More houses, bridges, paths, windows — Oct 2026

- **An island holds many houses.** `H.at` places the first (the one with the
  name board and the front-door camera, `I.main`); `H.annex` holds the rest,
  each `{uid, house, x, z, rot}` in the island's frame. `houseSpecs(H)` lists
  them, first first. A house's rooms are `a<uid>_<room>` in the one `H.rooms`
  (`homeRooms`), so every room-reading thing reads them all.
- **The first of the one-size-down house is free** (`FREE_ANNEX`: castle →
  dojo house → small house → TINY HOUSE). `annexPrice` says 0 until one is
  built for free. TINY is built here only, never sold at Roshi's.
- **Moving a house moves its rooms**: room positions are in the HOUSE's frame
  (`I.roomLocal`, `I.floorY`, `I.houseOf(room).ry`), so nothing inside is
  rewritten. A bridge that can no longer reach is sold back, and she is told.
- **Bridges** (`links.js`, pure): door to door on any floor, `{a, b, style}`
  with each end `{hk, floor, side, at}`. `linkWhy` refuses doors that do not
  face, too long, too steep, or through a third house. Steps or a ramp take
  the rise. Each end cuts a hole in the wall (`buildHouseShell(id, openings)`)
  with a door; a wall thing in the hole is sold back. A ground-floor bridge
  refuses yard things too tall to fit under it (`linkBlockers`), and the card
  offers to sell them. Supports have no colliders.
- **Doors** slide open when someone is near and shut when nobody is; INTERACT
  pins one open (`H.doors`). The lock still holds the front door.
- **Windows** are wall things that cut a real hole, closed by default,
  INTERACT opens them. Each new house gets one per outside wall, `free` (sells
  for 0). An old home is given them once (`H.winV`).
- **The path strip in front of the house is gone**, and the gap round a house
  is a box 0.3 off its footprint, not a circle. Paths are yard things that
  may cross each other.

## Known rough edges

- The tour camera frames each island partly behind the card — try `dist ~130`.
- The bubble tints a whole pane when that pane's camera is outside it.
- The Roshi shop opens after the ending (`world.snakeOpen`) or from the debug
  panel's *open the island shop* row — the ending is what builds Snake Way.
