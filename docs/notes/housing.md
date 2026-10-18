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
**Castle rooms are claimed on the CASTLE ROOMS card** (below), and each owner
opens or shuts her own (`_roomWall`) — except a room everybody walks through
(`through`: the castle's two floors with the door and the stairs, the dojo
house's hall), which is never a wall.

**The music: the newest kitten onto a bridge picks it**, and it beats everything,
dragon music included (`_wantedTrack` asks housing first). What plays is **that
bridge's owner's choice** on her jukebox; a kitten on a home island with nobody
on a bridge hears that island's. Six tracks, **ElevenLabs Music recordings with a
procedural stand-in each** (non-negotiable 9) — see *Music* below.

**Interiors** cut the roof away and x-ray the walls in the pane of whoever is
inside (`aimView` → `xrayVertexMat.setCuts`). Furniture sits on a **tatami grid**;
a room's kind decides what may go in it, and a preset furnishes the whole house
in one go (`autoLayout`).

**The yard is solid, and its trees take the x-ray** (Oct 2026: "Bamboo fence has
no collider ... ensure that all objects built on the players island have
collider if they should"). Round things are circles in `SOLID`; long thin ones
(fence, bench) are four walls AND a lid in `SOLID_BOX`, because walls alone
dropped a kitten who jumped on top inside the box for good; the torii walk is
six posts. All of it scales with the item's BIGGER/SMALLER. Every number was
measured off the fitted model. `world-check` builds every yard item in a
sandbox and fails any that adds no collider and is not on its WALK_ON list
with a reason. The yard's trees and bushes are on `plantMat` via
`xrayModel`, which has to WRITE `xrayK` onto a loaded model's geometry: a
missing attribute reads as zero in the shader, which means "never cut", so a
material swap alone does nothing.

**The treehouse** (`treehouse.js`) had its x-ray on the cabin only, and that cut
still worked. What hid her was the trunk through the room and the crowns over
the roof, so trunks, platforms, crowns and the slide are now on `treeMat` too.
The straight ramp off A ran underneath the A→B rope bridge ("intersecting with
the bridges"). It is now two things:
- a **spiral stair** round a post south of A (under one turn, so it never
  passes under itself), with sagging rope rails on posts;
- a **slide** from D's east edge into the open middle.

On the slide, housing (`_slide`) hands Player the downhill direction while her
feet are on a `slide` deck. Player takes the stick, carries the ride speed
(`SLIDE_RIDE`) and sits her down arms-up in the jump row. The speed is carried
because reading it back off her velocity found it already braked, which held
her at the minimum the whole way down. The flat run at the bottom is not a
slide, so she skids out on her own feet. The crates have walls now.
`world-check` checks five things:
- no rope deck lies over the stair or slide lower than her head;
- a walker climbs the stair onto A;
- `_slide` carries one from D to the run, never uphill;
- the crates stop her;
- every treehouse mesh is on an x-ray material.

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

Two pieces play ONCE rather than loop, and outrank the jukebox while they do
(`prayerTrack`): the shrine's (45s) and the **tea ceremony's** (30s, 2 takes,
900 credits, Oct 2026 — take 2 kept because it rises out of silence under the
whisking and has faded by the time the kittens stand; `jukebox.js` has the
measurements). Both are levelled in `mix`, not in the file.

**What she is doing has its own song** (`ACTIVITY_MUSIC` in `jukebox.js`,
`Housing.activityNow`). Richard: "Add music for the onsen, for fishing, and for
any other activity the player can do for 15s or more." Measured against the
15s bar: a kendo match (up to three 60s rounds), pet play (walk, fetch, catch),
fishing and the onsen qualify; the nap (4s), the meal (5.6s), raking (2.5s) and
the koi do not. The hop-along pet game is left out on purpose, because she copies
the animal's rhythm there and a song would be the wrong beat. The order is the
prayer and the tea first, then kendo, onsen, fishing, pets, then the boombox.
A sister auditioning a boombox song still hears it. Four new 90s takes,
1350 credits each (5,400, ~$1.08), all asked for "a clear, complete ending".
Each ends in 1.4–2.2s of measured silence, so each loops as a whole file
(`whole: true`). Tea take 1 could not be reused: its audio is not on disk and
could not be fetched again without its session id. Delete the mp3s and each
plays its procedural fallback.

## Placeholders — the work that is left

Each one degrades: delete the file and the game draws the stand-in.

| what | the stand-in | to finish it |
| --- | --- | --- |
| **Each kitten's kiai** | one synthesised shout (`audio.js 'kiai'`), pitched per kitten by `KIAI_PITCH` | four recorded kiai, a voice each ([voices.md](voices.md)) |
| **The kendo scoreboard** | ONE `#kendo-board` across the whole screen, UNDER the names (its top is the measured bottom of `#hud .scoreboard`, and it pushes `#toasts` below itself), for the first match on | per pane, if two matches in two houses ever run at once |
| **Polyfork knobs** | ITEM CUSTOMIZATION offers size and the model's colourways only | its geometry knobs (`remixable`), with the same "never through the roof" cap |
| **Set plates** | plates on a kotatsu are not saved: a reload clears the table | a field on the room row, if it matters to anyone |
| **The storage chest** | a card that says so | a real inventory |
| **Taiko, the cups game, volleyball** | a line and a sound | the mini-games |
| **The Bushido Blade forest** | shown, locked, "later" | Richard's later feature |
| **Boosts for kotodama abilities** | not done: the animals boost JUMP HEIGHT, JUMP DISTANCE and SPRINT only | Richard also floated boosting the panda or her kotodama powers; it is a `petBoost` field plus the one line that reads it |
| **Seiza with a tea bowl** | the tea ceremony kneels in the PRAYER drawing and sips in the MEAL's (`_tea`); the kendo seiza is in armour | a kneeling-with-a-bowl pose, all four kittens |
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

**The lock is the hologram, not the doors (Oct 2026).** Richard: "When an
owner gets near the entrance of the bridge, the doors animate open for them
... the force field barrier should still be applied to prevent non-owners from
getting in when the doors are closed." So the leaves SWING (`DOOR_SWING`,
1.6s) open for any owner within `GATE.near` of a gate (`_ownersNear`), and
shut behind her when she walks on. They are visual only. The button now reads
"CLOSE THE GATES FOR VISITORS" and turns the hologram barrier on: across both
doorways AND along the entrance's edges (`barrierSegments()`). "OPEN THE GATES"
only takes the barrier away, because the doors are already open for her.

A visitor who **jumps onto a locked deck falls through it** (`ghostFor`). The
deck draws as a hologram round her (`holoDeckMat`, `_holoPoints`) and
`heightAt(..., who)` leaves it out of her ground. It stays solid for the
owners. A visitor already ON the deck when it locked keeps her feet
(`player.footing`), so she can walk off rather than drop mid-crossing. A
visitor who presses ACTION is told whose gates they are (non-negotiable 6).

**Facing.** At the town end the statues, the boombox and the banners face the
town, which is where she walks in from. At her end they face the bridge if that
faces the camera, else are turned round (`faceCamera`), then turned toward the
camera until no more than 60° off (`bannerYaw`). On the first island the road
was 85° off the camera, so both banners showed edge-on. **Every owner has a
statue** in her colour at both ends (`STATUE_SLOTS`: one each side, a third and
fourth outside those), and the boombox steps back when there are three or more.
**Everything there is solid** (`HomeBridge.solids`: statues, boombox, lanterns,
banner poles, torii posts). The snake's head that stood on her island is gone,
and each end has Snake Way's own landing apron (rocks, grass, a ramp).

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
own `gearModel`s, at 0.7 scale) and her tube. **The kit is furniture**: rows in
the room's `items` (catalog `holo`, free, on a shelf no shop lists), moved in
the ordinary build mode from the room card's MOVE THE TUBES AND THE GEAR.
`holoKit` stands a new one where `holoLayout` always did; one tube and the
three racks refuse to be taken out (`holoWhyRemove`, which says MOVE instead);
ADD ANOTHER TUBE allows up to four, each its own way in. A tube's way out
points at the room's middle. The room costs 3 orbs and the kendo dojo 2.5
(half, Oct 2026). She walks into a rack to pick up its piece. With all three
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

**Where.** A kendo room's fighting floor is `kendoArea(room)` (catalog.js): the
room's own `kendoArea` where it has one, else the room less 1.4 all round. The
castle's ground floor fights on the EAST side, its second floor between the
staircases, the dojo house's hall on the square beside its stairs — Richard:
"never under them". world-check holds every one inside its room and clear of
every stairwell. The tape, the two seiza marks (`kendoMarks`: a white cross
and a gold square) and the rule that says she is on the square are the same
function, so they cannot disagree. Off the area is JOGAI.

**Starting.** A geared kitten standing STILL on a free white cross for
`SEIZA.t` (2s) kneels in seiza, facing the other cross, and is held there; a
push of the stick stands her up (`padStick`, recorded before a pin freezes
her pad). Both crosses knelt on: the match begins. It replaced "two geared
kittens anywhere on the square for 1.2s", which started a match on two
kittens who had only come to look at the rack. Richard's spec is quoted over
`BOUT`, `SEIZA`, `KENDO_HIT` and `KENDO_TURN` in `kendo.js`:

- **The ceremony.** Both on their marks, facing. Then, one at a time: reach for the shinai, stand, KIAI (her own pitch,
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
  a thumb drifting a frame later is not a dodge either. Richard: "too strong;
  1-2 steps and briefly immune" — it is `dist` 2.2 over `t` 0.14s (the last
  frame clipped, so 2.2 at any frame rate), then she STOPS; `kendoDodgeT` is
  the immunity (0.36s), read by `sparStrike`.
- **A cut is vertical** (`KENDO_HIT`): it lands on a kitten up to 3.2 ahead
  along her facing and no more than 0.9 either side of that line. Both face
  each other along the fighting plane (`kendoFace`) whatever the stick says.
- **返 Riposte works in the bogu**, with the ring's own timing (`_parryLive`
  is true in a live round): a guard up on the cut's side catches it, no
  ippon, and she answers through `Game.strikePlayers` → `sparStrike`. The
  pose is `kparry.png`.
- **The plane turns.** One above the other — across the plane by more than
  `KENDO_TURN.gap` (1.3) and more than along it — for `KENDO_TURN.t` (1s),
  and the plane becomes the room's other axis; the lens eases a quarter round
  to look across it (`yawAcross`, the one of the two nearest the game's -45°).
  YAME puts it back along the marks. **The stick follows the camera like on
  the bridge**: a push held from before the turn keeps its meaning until
  released, and a fresh one is read on the lens it is turning TO
  (`kendoLandYaw`). Left/right is toward or away; up/down changes layer.
- **The camera** (`shotFor`) is per PANE, through the same `groupShot` the
  front door uses, so the shared rig and every stick in it turn together. It
  is closer than the house's shot, centred on the area, and looks across the
  plane (`B.camYaw`).
  **The walls** of that house are cut to `HALF_WALL` (2.1) for any pane
  watching (`halfWallFor` → `HomeIsle.halfWalls`, a clipping plane on the wall
  material). That is why the renderer has `localClippingEnabled`.
- **The drawings are her own size** (`KENDO_SCALE` 1 — it was 1.25, and
  Richard asked for about 20% smaller), and `footX` keeps her feet still
  through a mirror. The kiai drawing's feet measure 0.17 of its width right of
  centre, so every turn, and every swing (guard to kiai and back), slid her
  sideways. The guard's are centred (0.006).

## Seeing it, Oct 2026

- **Yard work sees over the houses.** Placing or customising something
  outside takes every floor above the first off, not only the roofs
  (`Builder.outdoorCuts`), and the thing itself takes an x-ray bite of the
  ground floor's walls like a kitten does (`Builder.xrayAt`). Richard: "The
  house, especially a castle, can block the camera."
- **Two sisters in one pane on two floors**: the pane is cut to the HIGHER
  floor (it was the lower, so the girl upstairs walked on nothing). The girl
  below gets an x-ray `LOWER_XRAY` (2.5x) the size, which stops at the TOP of
  the slab over her head (`uCutCeil` in `xrayVertexMat`), so it opens the
  floor and nothing standing on it.
- **No blink on a change.** Every change rebuilds the island, and a model
  swapped in on a `.then` lands after the frame is drawn — one frame of every
  stand-in on the island per slider step. A model loaded once is now placed at
  once (`modelNow`). Richard: "All the 3D models blink as if respawning."
- **The boombox's barrel** is FITTED to `BARREL_H` (2.2), model or stand-in,
  and each end builds its own jukebox. The island end was a `clone` taken
  while the barrel model loaded, so it kept a squat stand-in for good.
- **The purchase scene's statue shot** frames every owner's statue: it backs
  off along its own ray until the top half of each measured box is in frame
  (1 owner at 8 — the liked shot, unchanged — 2 at 17.5, 3 at 23.5, 4 at 24).
- **Looking out of a window** puts her in a pane of her own (`lookingOut`,
  main.js `solo`): the shot is first person, and it took a sister sharing the
  pane through the glass with her.

## The house, Oct 2026

- **Castle rooms are claimed on the CASTLE ROOMS card**, a fair share each: the
  claimable rooms over the owners, rounded down (`claimShare`), so a room left
  over is nobody's and everybody's. LET GO frees one to pick another. Every
  refusal says why (`claimWhy`). **Four rooms, Oct 2026**: the castle's ground
  and second floors (one room each — `ground` and `middle`) and the FREE dojo
  house's two (a bought one is everybody's). Richard: "If there are 2
  co-owners, each person can get 1 room in each building ... If a player
  claims a 1st floor of the castle or the dojo house, they can not claim the
  1st floor of the other house." An old save's four castle rooms (east, west,
  north, south) are folded into the two by `migrate.js` on load: the first
  room type kept, a second one refunded in full to whoever claimed it, the
  furniture moved by its own cell or to the chest.
- **Plates** go back to the kitchen on INTERACT there; a full table refuses a
  fifth; a kotatsu sold or moved takes its plates back to the kitchen and ends
  its meal (`_pruneTables`).
- **Spare VR gear at home** (`rackStock`): any tube on her island has a
  headset for every kitten; in the simulator, only her own coloured tube.
- **The simulator's music beats the house's** while she is in a mini-game,
  and the house's comes back when it ends.
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
| **Kendo** | `kittens/<sheet>/kendo.png` (the guard), `kiai.png` (the strike, held for `KIAI_T` after every swing in the bogu) and `kparry.png` (返 in the bogu, the riposte guard), recoloured by STYLE for Storm and Blossom. Oct 2026: Ember's first kiai became her `kparry`, her new kiai is Frost's wind-up drawn as Ember, and Frost's `kparry` is Ember's old guard drawn as Frost (0.5 credits). `kendo.js` only sets `kendoGeared` and `kiaiT`; `Player` draws them. They MIRROR like the Riposte stance; world-check measures the shinai reaching right, or for a wind-up whose blade points back (Ember's kiai, -0.044), the tail behind her | the drawn men and shinai |
| **The animals** | `farm/{chick,bunny,goat}.png`, side-on, head LEFT (measured), turned along the circle they walk | the primitive bodies |
| **Kendo's ceremony** | `kittens/<sheet>/{seiza,reach,rei}.png`, off her own `kendo.png`, recoloured by style. Sized as a FRACTION of the standing guard (`KENDO_CEREMONY_H`: 0.72 / 0.8 / 0.92) — sizing by ink area made seiza a head taller than the guard, because the generator fills the frame whatever the pose | the guard squashed (seiza, reach) or tipped (rei) |
| **The prayer, the onsen, the futon** | `kittens/<sheet>/{pray,bath,futon}.png` and `homePose` `'pray'` / `'bath'` / `'futon'` (`Player.setHomeArt`). The prayer is sized by ink area against her bless drawing; the bath is a HEAD and a towel on the water — the first take was a swimsuit and was rejected for a game for girls of nine and under; the futon is drawn whole, bedding and all. Still one still each, not the four-direction prayer sheet Richard once asked for | `Player._homeAs`: the star's reach, the eating crouch, hiding her |
| **The chick in flight** | `farm/chick_fly.png`, mirrored in the master to face LEFT like the pen; flaps against the pen drawing at 8/s while CATCH has her up | the pen drawing bobbing |
| **Door and window panels** | `models/props/shoji-door.glb` (Tripo text-to-model, `tools/prop-bake.mjs`), stretched into each panel's box by `fitBox` in models.js | the drawn paper boxes |
| **The angel wings** | `models/props/angel-wings.glb` (Tripo), squeezed on the flap | the two drawn fans |
| **A mess, the fetch stick** | `models/props/mess-pile.glb` (Tripo) and Polyfork's `fallen-twig-4c64de` | the brown blobs, the box |
| **Bridge decoration** | `linkModels` in links.js: Polyfork lantern posts on plank and rope, stone lanterns at the stone bridge's corners, a torii over each end of the vermilion, flower planters down the blossom bridge (whose drawn boxes become the stand-in) | nothing — the bridge underneath is whole on its own |

Tripo props cost 30 credits each (three: shoji, wings, pile); the raw takes are
in `out/props-raw/` (gitignored — keep them). The poses were 13 more
`gpt_image_2_5` images off each kitten's own `kendo.png` / `bless.png`.

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

## Paths, the zen garden and the teahouse — Oct 2026

- **Paths are stood on**: each is a deck at the top of what is drawn, a few
  thousandths apart by uid so crossing paths never z-fight. A flat path goes
  under any yard thing that is not itself a floor (`YARD_FLOORS`); a torch or
  lantern path is only in the way at its posts (`pathPosts`, read by the
  drawing, the colliders and `yardWhy` alike). `pathfx.js` is everything a
  path does when she walks it.
- **RIDE sets the turn step** on the lawn, 15 → 30 → 45°; paths start at 15.
- **The zen garden** (`zengarden.js`) keeps a grid of footprints painted
  onto its sand, which outlives the yard being rebuilt round it, and its rake
  sweeps it smooth.
- **The teahouse is walked into** (`teahouse.js`): it was a SOLID disc, and
  is now the model's own walls, step and tatami, measured off the GLB, plus
  risers on the platform's open edges — a deck too high to step onto is one
  she walks UNDER, so without them she stood in the floor up to her chest.
  It is a third bigger (h 8), has its own smaller x-ray (`teaMat`), and a
  camera (`teaShotFor`, in `groupShot` beside the door's) that frames the
  room from the street at 10 back. KNEEL FOR TEA: whoever kneels first starts
  it and the music; the others have six seconds to kneel too; then the bowls
  go round and everybody bows. 26 seconds, one kitten or four.

## Bridges with turns — Oct 2026

Richard: "she sets the number of turns or parts, and places each turn's start
and end ... each additional turn adds 25% to the price ... smooth 90 degree
turns, each also +25% ... flat and level at the junction ... segments take up
the height difference".

- **A turned bridge is the same row plus `via`**: island-frame corners
  `{x, z, smooth}`. A straight bridge has none and `linkGeom` returns exactly
  what it always did, so every bridge already saved is untouched.
- **The card**: RIDE (or the TURNS button on a phone) sets 0–3 turns while she
  picks the doors, and the ghost bends round default corners at once
  (`defaultVia`: an L where the two doors' lines cross, otherwise a step
  straight out of each door). JUMP on the second door hands her each corner to
  slide with the stick; ATTACK makes it a curve; SPRINT steps back a turn.
- **The rise is shared out by length**, so every run has the same grade and
  every junction is level. A sharp corner is a round landing of radius
  w·√2 with the runs cut back half a width; a smooth one is a level arc
  of radius w. **Tried and failed:** a landing the bridge's own width — the
  floor a step off the middle of the turn was 0.05 off level, enough for her
  feet to catch.
- **Price** `linkPriceK` = 1 + ¼ per turn + ¼ per smooth one; the BUILD row
  shows it. Torii and end gates stand at the two doors only.
- `linkWhy` refuses a turned bridge whose runs leave a door at an angle, a
  corner off the island or too tight to turn in, or a middle run through a
  house.

Item 21 of the same playthrough — "when building a bridge on the 2nd or 3rd
floor, show that floor" — was already done by `outdoorCuts` with `hard`, and
has a check that quotes it.

## Smaller fixes — Oct 2026

- **The boombox was inside its barrel.** It sat at 0.47 of the barrel's scale,
  and the barrel measures 2.20 tall at 2.2×, so its lid is at 1.0 of the
  scale (`BARREL_TOP`). The boombox Richard reported "facing the wrong way"
  could not be seen at all.
- **The walk to the door.** Richard: "there was a Cherry Tree in front of the
  door ... include some walking paths from the bridge gate to the front of the
  door". `layDoorPath` lays free path pieces from the foot of the front steps
  to the landing, in one of the house's two styles (`DOOR_PATHS`, chosen by the
  island so a home always gets the same one). A preset's yard keeps off it
  (`doorWalkBox`), and nothing may be built on the statues and boombox at the
  gate (`E.entrance` in `yardWhy`).
- **The window asks** (`_v_window`): no, look out, or open/shut. Looking out is
  first person (`lookShot`): the lens stands 0.9 inside the frame at 1.8 up,
  which is the middle of the opening, and she is 0.3 behind it. She fades as it
  comes through her (`LOOK_FADE`), by alpha AND by scaling `alphaTest`. Opacity
  alone holds her solid to 0.35 and then drops her in one frame. The split
  screen's pull-back does not apply to that shot (`focus.exact`), or it would
  push the lens back through the wall. **Tried and dropped:** the old shot,
  4.5 behind her at 2.2 up, which put her sprite across the middle of the window.
- **Every furnishing is solid.** `_furnWalls` skipped anything under 0.05
  after its 0.555 inset, which meant anything under 1.2 across: the andon
  (1.2), the yoroi (1.05 deep) and the katana stand (0.76). They now keep
  `FURN_MIN_HALF`.
- **The selection ring fits the thing** (`ringR`): the drawn footprint's
  longer half plus 0.45, never under the old 1.4. Measured: a table 2.25, a
  futon 3.15, a katana stand 1.40.

## Known rough edges

- The tour camera frames each island partly behind the card — try `dist ~130`.
- The bubble tints a whole pane when that pane's camera is outside it.
- The Roshi shop opens after the ending (`world.snakeOpen`) or from the debug
  panel's *open the island shop* row — the ending is what builds Snake Way.
