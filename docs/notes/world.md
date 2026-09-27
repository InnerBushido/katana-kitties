# The world, the clans and the panda

*Design notes, moved verbatim out of the old 4,400-line `HANDOFF.md`. This is
the WHY behind code that already exists — read it when you are about to change
something in this area, not before. Current state and open work live in
[HANDOFF.md](../../HANDOFF.md); the always-on summary is [CLAUDE.md](../../CLAUDE.md).*

*Cross-references saying "above" or "below" may now point at a sibling file in
this folder — see [the index](README.md).*

---

## Clans

Six clans, each at a **shrine on a different island** (`_buildShrines`).
Thunderpaw is on the home island so a pair who never work out the dragons can
still get a buff; the other three are a flight away, which is the point — the
beam is what makes a kid ask "what's that green light?" and go.

Each clan grants exactly one buff, and each changes a **different verb**, so
swapping clans changes how the game plays rather than recolouring a badge:

| clan | island | buff |
| --- | --- | --- |
| Thunderpaw | home | run 1.35x faster |
| Riverclaw | autumn | katana reach 1.8x (the drawn arc grows too) |
| Shadowtail | ash | three jumps instead of two |
| Windwhisker | dusk | dragon breath 1.9x range, and the cone is drawn bigger |
| Icewhisker | frost | "Sense mischief" — see below |
| Pandapaw | bamboo | "Raise a panda" — see The panda below |

**Icewhisker exists to end the 100% hunt.** Chasing the last three unbroken
barrels across six islands stops being a game and starts being a chore, so this
buff hangs a bobbing chevron over the nearest prop you haven't scored
(`_updateSeek`). It's a world object rather than a HUD compass because the
answer is usually "over there, behind that house", which an arrow on the edge
of the screen cannot say. It re-targets 4x a second, not every frame — a marker
that twitches between two equidistant barrels is worse than one that lags.

`tools/world-check.mjs` asserts each one measurably changes behaviour — not
just that the number is set. It also asserts no two clans share an island and
no two grant the same buff.

**A shrine advertises itself at three distances** (`entities/shrine.js`): a beam
you can see from the air, a hovering crystal and a name board at mid range, and
a ground ring that lights up when you step in with a "STAND HERE" prompt. Drop
any one of them and it fails: without the near layer players stood on a shrine
without realising they had arrived; without the far layer they never found one.

**The beam starts ABOVE the gate.** A full-height column rising from the dais
washed out the entire shrine at close range — the thing it exists to advertise
became the thing you couldn't see.

**And the dais is stone you stand on.** Reported as *"the player is in the
ground on the shrine, like there is no collider"*, and that is exactly what it
was: two stone cylinders drawn into the world mesh and nothing else. `heightAt`
returned the hillside underneath, so a kitten walked around inside the top step
with the stone at her chin — on the one piece of ground in the game that lights
up and says STAND HERE. The leader was fine because `leaderSpot` added
`SHRINE_DAIS.y` by hand, which is the shape of the bug: a special case for the
one character somebody had noticed.

`SHRINE_STEPS` is now the single source for both, and `_buildShrines` pushes one
platform per step as well as drawing it. The lift comes out of `leaderSpot`
entirely — she asks `heightAt` like everybody else — and the check that used to
assert the leader was lifted now asserts she is on the deck, which catches the
lift being left in as well as it caught it being missing.

Three things about that were not obvious:

- **The decks are round.** Platforms were axis-aligned boxes, and the sky
  shards settle for a square deck inside a round pad, which is fine on a rock
  nobody is told to walk to. Here the join ring IS the dais, so an inscribed
  square would be a kid standing exactly where the game told her to stand and
  falling through the corner. `p.r` is optional: a platform with one is a disc,
  and everything already built stays a box.
- **A deck you can stand on is not automatically a deck you can climb.**
  `heightAt` is one-way — `fromY + step < p.y` skips a platform you are under —
  and that tolerance is 0.4 against an outer step that rises 0.5. The first
  version was a dais you could be on and could not get onto, which from the
  hillside is indistinguishable from no dais at all: the same bug, with more
  code. `step` is per platform (`climb: 0.62`) so the bridge decks keep the
  reach they had and nobody gets snapped up through one from underneath.
- **A platform sits ON an island, it does not replace it.** `heightAt` returned
  `{y, platform}` for a deck hit and dropped the `island` field, which was
  invisible for as long as the only decks were bridges over water. The moment
  the dais became one, `leaderSpot` lost the axis it faces along (leaders on
  outer islands turned to face the world origin) and — worse — a dragon decides
  whether its rider is still nearby by comparing islands, so walking up to a
  shrine sent your dragon home while you watched. The island under the stone is
  threaded through now, and `world-check` pins it.

**Every island needs its own thing to break.** The frost island was a white
disc with a few trees and three crates on it — the emptiest place in the game.
It now has icicles (its own prop kind), a shrine and a Frost-breed dragon,
which is the pattern every outer island should follow: something to smash,
something to find, something to ride.

**The Dojo's sin/cos board and the minimap keep colliding, and the board keeps
winning.** In a side-by-side split, player 1's map lands in the bottom-left and
sat straight on top of a board that can be 42vw wide, so `_drawMaps` lifts the
map to the top of its own half while the board is up. On a phone the board is
top-LEFT instead (it was bottom-centre and covered the diagram), so there the
map crosses to the top-RIGHT and shrinks — the lesson is what you came to the
Dojo for, so it gets the corner every time. All of that placement is in
`Game._drawMaps`; there is no CSS class carrying it. An earlier `hud-math` class
on `#hud` claimed to and was never read by any rule.

---

## The panda (Pandapaw)

**The only buff you have to earn after swearing.** Every other clan hands you
its power the moment you stand in the ring. Pandapaw hands you a job:

```
 20 canes cut LIFETIME    ->  a CUB appears and follows you   (size 2.2)
 20 more AFTER the cub    ->  it grows up and can be RIDDEN   (size 5.6, 2x
                                                               speed, 1.5x
                                                               jump, claw)
```

**The two rungs are paid for in different currencies, and that is deliberate.**
The cub costs *lifetime* canes; growing an animal that already exists costs canes
cut *since it last grew* (`player.pandaFedFrom`, the tally at the moment the
panda was last granted). **You cannot pre-pay for raising an animal that is
standing in front of you.**

**But at the GRANT, banked canes buy every rung they cover — forty cut before
the oath is a grown panda.** This is a reversal, and the paragraph it replaced
argued the other way at length: charging lifetime canes for the adult too meant a
player who had banked forty watched her cub appear and grow up in the same
breath, so the cub stage, which is the whole point of raising the thing, lasted a
single frame and she never saw it. All of that is still true and it is still what
this costs.

**What overturned it is that nothing regrows.** Asked for as *"if a player cuts
down 40 bamboo without pledging to Pandapaw, then they can still summon a fully
grown panda, automatically when they join Pandapaw... so that, if a player cuts
down all the bamboo, they can still get a fully grown panda."* There are a fixed
number of canes in the sky (fourth non-negotiable), so a kitten who flattens the
groves before she finds the shrine was being handed a cub she could never feed:
twenty canes owing and nothing standing to pay it with. A pet that can never grow
up is not a stage of an arc, it is a dead end with no way back, and it is reached
by doing the one thing this game rewards hardest. `tierFor(FULL_PANDA_COST)` is
asserted to be the top of the ladder, `tierFor(39)` a cub, and the property
underneath both — *no bank, however deep, leaves her with an animal she cannot
finish* — is asserted over the range rather than at the one reported number.

**The grant is the only place this applies.** Once there is an animal,
`fedFrom` is the currency again, so a knocked-down panda cannot be stood back up
out of a lifetime tally — which is also why a save records the panda's `tier` as
a fact rather than re-deriving it. See `castRow` in
[savegame.js](../../src/systems/savegame.js).

`FULL_PANDA_COST` is exported for this reason: the total is no longer something
a caller can derive by reading `.at` off the last tier, and the world builder's
"enough bamboo for two pandas" check silently went `NaN` when it tried.

`entities/panda.js` owns the animal, `PANDA_TIERS` owns the ladder, and
`Game._updatePanda` is the *single* place that decides whether a panda exists
and how big it is — called on swearing the oath and on every cane cut.

**`bambooCut` is a LIFETIME tally, not one that starts when you join.** A kid
who spends the afternoon in the grove before she ever finds the shrine is not
told none of it counted; she swears the oath and a cub is already there. That
credit buys the **cub only** — see the ladder above.

**Pandapaw is sticky (`player.raisedPanda`).** Swear somewhere else afterwards
and you keep the panda. Every other buff switches off when you re-swear, but a
panda you fed forty canes to is not a stat — confiscating it for changing your
mind about a shrine is the kind of punishment that stops a kid experimenting.

**Riding is GROUND movement, not a second flight mode.** It deliberately does
*not* go through `player.mount`, which everything in the game reads as "is
flying a dragon" — the split-screen rule, the shrine trigger, the dragon
come-home check. It's `player.pandaMount`, and it multiplies into the existing
ground code, so gravity, slope snapping, `resolveSolids` and the katana all
keep working untouched.

**The seat lifts the DRAWING, not the kitten.** This is the opposite of the
dragon and it has to be. A dragon rider is in the air, so the whole entity
moves; a panda rider is standing on the ground, where gravity and the ground
snap expect her. `Panda.seatHeight` raises her *sprite* onto the panda's back
(`sprite.mesh.position.y`), and `carry()` puts the panda at exactly the rider's
Y. Hanging the panda a seat-height *below* her — the dragon's arithmetic —
buries it 4.5 units underground on flat terrain.

**Sizes and the seat were MEASURED off the loaded atlas, not reasoned about.**
`size` in `PANDA_TIERS` is the animal's drawn height in world units, which
works because both sheets came back with their content height filling almost
exactly `contentScale` of the cell (0.727 vs 0.731, 0.688 vs 0.693). Copying
the dragon's `size: 13` across put a panda in the world **12.9 units tall next
to a 2.9-unit kitten** — and nothing about that looks wrong in a screenshot,
it just looks like a panda photographed from further away. The probe:

```js
// alpha bbox of game.pandaArt.adult.texture.image -> heightFrac, feet row
// then scan for the saddle's crimson (r>110 && r>g*1.7 && r>b*1.5):
//   saddle top     0.638 of the cell above the drawn feet  -> seatHeight 0.55*quad
//   saddle centre  0.167 of a cell BEHIND the body centre  -> seatOffset -0.14*quad
```

**Seat height and seat offset only mean anything TOGETHER.** This is the real
lesson of the seat, and getting it wrong twice is what taught it. The first
pass measured 0.688 as the top of the back — a single maximum over the whole
sheet — and bounded the seat height against it. But `seatOffset` sat her 0.14
*behind* the body centre, in the middle of the saddle blanket, and the back
there is nowhere near 0.688. Scanning for the topmost drawn pixel *at each
offset along the body* gives the profile the number should have come from:

```
  behind centre   0.20   0.14   0.10   0.06   0.00  -0.05  -0.08
  silhouette top  0.600  0.615  0.628  0.643  0.661  0.680  0.688
                         ^ she was here             the shoulders ^
```

So she was pinned to the lowest useful part of the animal, with the shoulder
hump rising in front of her, and **no value of the height alone could have
fixed it** — the bound described a piece of panda she was not sitting on. She
is now at 0.06 back (the front of the blanket, where the back climbs toward the
shoulders) and 0.74 up. The smoke test checks the **pair**: on the drawn saddle
(0.04–0.293), toward its front, and clear of the profile where she actually
sits.

The bounds that are not judgement: 0.55 was the first guess and buried 1.1
units of a 2.9-unit kitten — her legs to the thigh, a cat *sunk into* a bear —
and 1.10 would park her three units above an animal only 5.6 tall.

**The claw swipe (`CLAW` in `panda.js`, `Player._doClaw`)** is the ground
answer to dragon breath: range 8 (katana is 3.4, breath is 15–20), a ~145
degree arc, power 2.1. Three raked ring wedges rather than the dragon's cloud
of instanced shards, because a claw is a shape and not a spray.

**The claw swings along the KITTEN's facing, not the panda's.** The panda's
drawn heading is locked broadside so it only ever points two ways; hanging the
hitbox off that would mean the attack could not be aimed at all. She steers,
the panda swings.

**The claw DOES cut bamboo — the only exception to `katanaOnly` in the game,
and a deliberate reversal.** The first version refused, on the grounds that an
animal which harvests its own food turns the Pandapaw arc into a machine that
feeds itself. Playing it settled the argument the other way, and the original
reasoning was simply wrong: **you cannot ride a panda until it is fully grown**,
and fully grown is the end of the ladder, so there is no further tier the extra
canes could buy and nothing is being short-circuited. What the refusal actually
did was make the reward for forty canes useless in the only place you spend all
your time, and leave a 150-cane grove as a job for one kitten with a short
sword. Measured: four canes per swipe-cycle from the middle of the grove
against the katana's one.

**A dragon still cannot,** by breath or by dive-bomb, and there's a check for
that too. The grove being the one place flight fails is what makes landing
worth doing, and that survives the panda getting an exemption.

**Leaving Pandapaw stops a GROWN panda following (`Panda.follows`).** It waits
exactly where it is, stays yours and stays rideable — the difference between a
pet and a mount, and the same deal the dragons offer. A **cub** follows
regardless: it's a baby, and stranding one somewhere a kid then has to remember
is worse than the rule being slightly inconsistent. Two consequences that are
not optional: a toast fires on leaving (a pet that silently isn't behind you is
something a kid notices two islands later and concludes she has lost), and a
waiting panda is **drawn on the minimap** — a stationary rideable animal you
cannot find is precisely the failure the dragons' perch rule exists to prevent.

**A follower must actively back off, not just stop accelerating.** Cutting the
throttle at `followDist` only stops it speeding up — a panda arriving at speed
then coasts, and ends up standing *inside* the kitten, where the two sprites
fight the depth sort and flicker. There's a reverse term below 60% of the gap.

**`mountRadius` must be bigger than `followDist`.** A pet that parks itself
just outside its own mount prompt can never be climbed onto without first
walking at it, which is a baffling thing to have to work out about your own
panda. Asserted per tier in the smoke test.

**Its drawn heading is locked BROADSIDE**, exactly like the ridden dragon and
for exactly the same reason: it's a single side-on drawing, so moving "into"
the screen puts it edge-on at the billboard's mirror threshold and the animal
snaps back and forth. `_aim` takes the sign of sideways velocity with a dead
zone, measured against **the owner's `camYaw`** — "sideways" is a screen
direction, and in split screen the two kittens have their own cameras.

**A pet can never be lost** — the dragons' rule. It follows on foot, and past
90 units it simply meets you where you are (`_catchUp`). **Never while she is
flying:** it waits, still, where it is. Chasing the point under a flying kitten
walks it off the nearest rim and out over open sky, and a pet materialising
mid-flight reads as a bug.

**A dragon wins the mount button.** Dragons are scanned first and win outright,
because a panda is always at your heel — letting it match first means a kitten
who has raised one can never climb onto a dragon again.


## The panda in the ring, and the cub that heals you

Everything above is about a panda on the home island. This is what happens to
it inside the ropes, and it is one animal with two completely different jobs
depending on which tier it is standing at.

**The grown one is a second body in the fight. The cub is a nurse.** They are
not two halves of one thing that got balanced against each other; they are the
two ends of a single risk. Riding a panda puts a five-and-a-half-unit animal
under a 2.9-unit kitten — you hit harder and reach further, and you are standing
on a target anybody can see from across the arena. Lose it and what is left is
the thing that gets you off the floor.

### `Game.strikePlayers` is still the only gate, and it now looks for two bodies

The claw reaches kittens through the same single function every other swing in
this game goes through. It is not a second damage path and it does not get one;
third non-negotiable, and `world-check` drives a full swipe with the tournament
off and asserts nobody loses a point. What changed inside the gate is that there
are now **two bodies per player** to test a blade against — her, and her panda —
and `reaches()` was pulled out of the loop precisely because *the answer for one
decides what happens to the other*.

**The hitbox is a radius ADDED TO THE ATTACKER'S REACH, not a scale on
anything.** A kitten is a *point* in `strikePlayers` — the range test is against
her centre and nothing else — so "much bigger hit box" cannot be expressed as a
size on the panda. It is `PANDA.body` (2.8) added to whatever the swing's range
already was, and `PANDA.bodyUp` (1.6) added to `COMBAT.strikeHeight`.

**The forward-arc test is deliberately NOT padded.** An animal whose centre is
behind you is behind you. Widening the arc as well would let a swing land on
something visibly at her back, which is the exact bug the eighth non-negotiable
exists to prevent — the drawn arc *is* the hitbox.

**Riverclaw's oath does not lengthen a panda's arm.** Asked for in those words,
and forced at the gate (`const clanK = kind === 'claw' ? 1 : reach / BASE_REACH`)
rather than by having `_doClaw` pass a different number, so the rule has one
owner and cannot be undone by a future caller handing it her real reach. It is
also right on its own terms: Riverclaw's blessing is about the blade she is
holding, and while she is on a panda she is not holding it.

### The three outcomes, and why they are decided before anything is spent

| the blade found | what happens |
| --- | --- |
| the panda only | the animal takes it; she is untouched |
| **both** | both take damage, she **stays on**, and the pair is pushed a third as far as she alone would have flown |
| her only | she takes it in full **and comes off the animal** |

`onIt` and `both` are computed at the top of that block, before a single number
is spent, because knocking the panda's bar out puts her on the ground — and
would otherwise change the answer half way through evaluating it.

**The reduced knockback goes on the RIDER, not on the animal.** It has to:
`Player.carry` rewrites the panda's velocity from the rider's every frame, so a
push applied to the panda while somebody is on it is overwritten before it can
move anything. The rider gets `A.knock * PANDA.knockK`, and the animal shows the
blow as `Panda.recoil` — a decaying offset on its group — because otherwise "the
panda is knocked back" is a sentence with nothing on screen behind it. Unridden,
the push does go on the animal, where it works normally.

**The claw has no `dmg` of its own.** It was asked for as "1.2x's more than a
regular player slash attack", which is a statement *about* `ATTACKS.stand.dmg`
rather than a number to sit beside it. `ATTACKS.claw` therefore carries `knock`,
`lift`, `reach` and `arc` and no damage at all, and the gate multiplies — so
tuning the standing slash on the balance page moves the claw with it and the
relationship can never go stale. The missing key is also what makes it
un-overridable by hand: `tune()` only accepts keys the defaults already have, so
there is exactly one knob and it is `PANDA.dmgK`.

**A cub is never a target.** `Panda.fighter` requires `rideable`, so a cub has
no bar, no hit box and no way to be hit. It is the size of a house cat and it is
the thing a losing kitten runs to; letting a sister cut it down would make the
consolation prize the next thing to take away.

**The Cross Slash never catches the animal.** `tri` freezes what it catches and
pays out at the end (`triCapture`), and there is no version of that a
five-and-a-half-metre panda can be part of — it would be either an animal
hanging in the air or a rider frozen while her mount walked off. A swipe that
found only the panda is simply a miss for that one attack.

**A partner's panda does not cost you the friendly-fire daze.** The daze is the
price of hitting your sister; charging it for passing within reach of an animal
three times her width would make a 2v2 with a Pandapaw kitten on your side
unplayable.

### Losing it, and getting it back

An empty bar is **not a death and not a removal** — fourth non-negotiable, a pet
can never be lost, so the worst thing that can happen to a panda in this game is
that it gets small. `Panda.collapse()` puts the rider down, sets `knockedDown`
and drops it to tier 0. It keeps its name, it keeps following her, and it picks
up the one thing a cub can do that a grown panda cannot.

**`knockedDown` is a separate flag and NOT `tier === 0`,** and that distinction
is the whole of "stays baby panda for the rest of the game". Those are two
different animals with the same drawing: a cub that has never grown up is
waiting for bamboo and `Game._updatePanda` will hand it the adult rung the
moment the tally allows — while a collapsed one is standing there with twenty-odd
canes of *credit* against it, and without its own guard the very next cane she
cut would grow it straight back. `_updatePanda` returns early on
`player.panda?.knockedDown`, and `world-check` throws eight hundred canes at one
to prove it.

**The shrine costs nothing.** "Since we already harvested the 20 bamboo to make
it a big panda and no need to do it again" — the canes were cut, and charging
for them twice takes away the *work* rather than the animal. `pandaFedFrom` is
deliberately not touched either, so a kitten who has been cutting since is not
handed anything.

**Two ways in, one event.** `Player`'s interact branch calls `onPandaShrine` for
a kitten already sworn to Pandapaw standing in her own hall — a press that did
nothing at all before this, so no meaning is being taken off the button. And
`onJoinClan` calls `_restorePanda` for one who swore somewhere else and has come
back, on the *same* press that swears her in, because those are one thing:
coming home to the clan. Splitting them would mean pressing interact twice in
the same square metre.

**And the badge is an instruction, not a status.** Sixth non-negotiable: the
toast that announces the collapse has faded by the time she has walked back
across the island, so the clan badge says `Bao is a cub · INTERACT at the
shrine` and keeps saying it until she does. It is checked *before* the bamboo
counter, which would otherwise be cheerfully reporting the animal fully grown
while a cub stood at her feet.

### The lick

The cub heals its owner while she is badly hurt, and it is the cub's job alone —
a grown panda is a mount and a fighter, and giving it this as well would make
being knocked down a strict downgrade with nothing on the other side of it.

**Three separate questions, on purpose.** `lickWanted` is about *her* (hurt,
alive, on her own feet); the radius is about *where the cub is*; and `lickT` is
about *how long it has kept station*. Only the first pulls the animal in — the
follow gap closes to half `lickNear` — and only all three heal. Folding them
into one boolean is what would make a cub start healing on the frame it arrives,
which is what the warm-up exists to prevent.

**Leaving the radius resets the clock rather than pausing it.** "Within radius
of the player for at least 1 second" is a promise about *one continuous* second;
a clock that merely paused would let a cub trotting in and out of reach collect
it a tenth at a time.

**It heals a fraction of her MAXIMUM**, so a kitten wearing Vigor is healed in
proportion rather than handed a smaller share of a bigger bar. Fractional health
is fine — nothing in this game prints the number, and every reader of it is a
ratio or a comparison.

**The threshold is where it stops as well as where it starts.** "Lick the player
if they are below 30% health" is a condition, not a starting gun, so the cub
tops her up to `PANDA.lickBelow` and then goes quiet. That is also the better
game: a cub that healed to *full* would mean a losing kitten could walk away
from the fight, sit down with her panda for three minutes and come back whole,
which ends rounds by attrition rather than rescuing them.

**She has to be on her own feet.** Knocked out, flying or carried by the
griffin, there is no cub beside her — and healing a kitten the round has already
finished with would put health on a body nobody can reach.

**What it looks like is three procedural things, and no new art.** Ninth
non-negotiable: the cub is one drawn cell and it stays one drawn cell. A small
pink tongue flicking out of its face on `sin(lickPhase)`, the whole animal
leaning in on the same beat (applied to the *group*, so the shadow comes with
it), and green motes rising **off her, not off the cub** — they mean "health
arriving" and drawn over the animal they would say the animal was being healed.

**The motes are the same green as the overflow bar,** deliberately. That is the
only other place in this game where green means health arriving, and two
different greens for one idea is how a nine-year-old ends up thinking they are
two different things.

**The chirp counts turns of `lickPhase`, not seconds.** The tongue is
`sin(lickPhase)`, so counting whole turns of the same phase is the only figure
that cannot drift away from the picture — a timer of its own would look right
for about ten seconds. The panda raises a one-frame `lickSfx` flag and
`main.js` spends it, because **nothing in `entities/panda.js` may reach the
audio system**: `player.js` already imports from `panda.js`, and the reverse
edge closes a cycle.

**All nine numbers are on the balance page** (`PANDA` in `tuning-page.js`), with
a sentence each. `world-check` asserts every one of them is described there
rather than falling through to the generic slider.

### How the checks run the real gate

`Game` cannot be imported into `world-check` — it boots a renderer against a DOM
that does not exist — and the alternative on offer was a page of regexes
asserting that certain words appear in `main.js`, which is not a check about
behaviour and would happily pass a rule that had been correctly *written* and
wrongly *wired*. So `strikePlayers` and `_updatePanda` have their **own source
cut out of the file and evaluated** with the four tables they close over. What
runs is the shipped code, character for character: change the rule and the
checks move with it; delete the rule and they fail. The `\n  }\n` terminator is
the class's own indentation, which nothing inside a method body can reach.

## Snake Way — the roads the ending builds

> "After the ending cutscene, should add some of the Dragonball Z bridges (Snake
> Way) in the background of the worlds going through the clouds, since that is
> how the islands used to be connected ... having staircases going through the
> clouds, connecting the islands, as a new way that the players can traverse to
> the islands."

Seven gold roads with red rails, one from the home island to each island the
old roads reached and one to the arena, winding through banks of cloud. A torii stands at each end and a
snake's head at the far one, looking back down the road it is the end of. They
do not exist until the ending, which builds them in its wide shot of the whole
archipelago (see [story.md](story.md)), and nothing takes them down but a
restart. Patchfur's line about the islands drifting apart is the story they
answer. The code is in `world/snakeway.js` (the roads, meshes, clouds and far
islands), `World.buildSnakeWay` / `setBridges` / `snakeAt`, and
`systems/snakecam.js` (the ride camera).

### The roads are generated, and checked as if they were not

**Landings.** `findLandings` walks each rim either side of the direct bearing,
at several depths in from the edge, and keeps only spots whose whole deck
footprint is clear of solids, props (by their `home`, so a knocked-over barrel
still counts), `keepClear`, clan halls, landmarks, platforms and the dragon
perches. The deck is raised 0.45 over the highest point under it, because the
grass tufts poke through anything lower.

**The winding is solved, not drawn.** The first version offset a sine sideways
from the straight line and folded over itself (frost reached a grade of 0.455,
ash 0.815). The second steered by heading, but leftover sideways error put kinks
in autumn (a 3.8-unit bend radius) and a 2.05-rad hairpin in ash. The third
solved swing and lean one after the other by bisection, and with no bracket it
grew the ash road to 1011 units. What shipped solves **(swing, lean) together
by Newton's method** at a fixed length, and grows the length by ×1.08 when it
cannot converge. The climb is a linear ramp with eased shoulders, never steeper
than `SNAKE.grade` (0.3).

**Faults are what reject a pair.** A pair is rejected for a grade over 0.3, a
road passing through an island, a bend tighter than 7.5, or crossing itself or
another road within 9 units of height. The first fault-free landing pair wins.
Ranking every pair to find the best took 1.6 s; with precomputed arrays and an
early return it takes about 350 ms. It is also **lazy**, because every boot
paid it for a thing only a finished game uses.

**Laying order is part of the answer.** Order: bamboo, dusk, ash, frost, dojo,
autumn. Bamboo has the fewest ways out, so it goes first. Laid later, its
landing collided with ash's. Landings on the home rim are kept 16 apart, so two
roads never share a gate.

`world-check` asserts all of this on the real world:
- six roads, no faults, grade under 0.3 as measured on the laid points;
- both ends on the right islands and on the ground;
- ground along the whole length once built, one-way, and exactly as wide as the
  mesh;
- `worldSig` unchanged.

A house moved, a perch added or an island nudged would each show up here, long
before anybody could see the roads, which only exist at 100%.

### Ground only when finished

A half-grown road is a picture in a cutscene. A deck a kitten could run off the
unbuilt end of is a trap. So `heightAt` skips `p.snake` platforms until
`snakeOpen`, which only `setBridges(1)` sets (the arena's rule). The gate posts
and the heads are solids flagged `off` until the same moment. The ending
**finishes** the roads on its skip path rather than letting them grow on after
the box closes. A sky easing on is weather; a road still growing is something
she could step onto.

### `locate` was one bug that looked like four

`SnakeRoad.locate(x, z)` returns the deck under a point: height, arc length,
signed distance from the centre line. It clamped the projection onto each
segment and then tested **only the perpendicular part**, so a stretch of road
ten steps further round a bend, whose line ran through her, claimed her. Four
checks went red from that one bug:
- a deck half a unit above the real road;
- the rail clamp pushing her off the wrong edge;
- the ride dropping her on the way back down;
- a road wider than its mesh.

It is a capsule test now. The fix for that uncovered a second bug: "highest
wins" (right between two decks, where a road winds over itself) also picked
*the next segment's start* on a climb. That point is a hair higher and inside
the capsule, so `lat` was measured from two units ahead and flipped side every
frame. It is **the highest layer, then the nearest segment on it**. Decks of one
road are never within 9 of each other, so anything within `LAYER` (3) is the
same deck.

### The ride

> "The input direction that is being pressed to go up (when starting the bridge
> climbing sequence) should continue to be the button/direction they need to
> press to continue going in that direction, regardless of where the camera is
> pointing or rotated."

**The stick is read in stick space, against the stick she boarded with**
(`Player._snakeWish`). The share of what she presses that points that way is
how fast she goes on along the road, *wherever the road goes*. The opposite
brings her back down. A camera-relative stick could not do this, for two
reasons: the ride camera orbits her, and the roads wind (ash turns through
more than a right angle). Holding one compass direction would put her into the
rail on the first bend. If she boards pressing roughly onward, that press
becomes onward. If she lands on the road from a jump or walks on at an angle,
onward is whatever stick points along the road through the camera she can see.

**Locked to the surface.** On the deck she is clamped inside `SNAKE.lock` of the
centre line, and the part of her velocity heading over the side is dropped.
Side input is scaled to 0.35 while grounded, so she can drift across but not
fall off. In the air she is free, which is how she jumps off, and the ride
lasts while she is still over the road. A jump along the road is still the
ride; off the side, or 10 below the deck, it ends. **The glide:** ×1.35 on the
road, feet on the deck only. Measured at 14.2 u/s in the running game against
10.5 walking.

`world-check` rides a real `Player` up the frost road (the one with a bend)
with one stick held while her `camYaw` is spun under her. It then rides it
again pushed into each rail in turn, reverses, jumps along the road, and falls
off the side. **The rail check has to lean.** The first version ran up the
middle and passed at 0.31 off centre, which proves nothing about a rail. The
lean has to come *after* boarding, or the diagonal becomes her onward, which is
the rule working.

### The ride camera is a layer, not a camera

> "Players can get a cool, cinematic camera that follows near them and rotates
> around them in 3D ... like on a swivel or on a rollercoaster."

`SnakeCam` is applied **on top of** whichever camera is already drawing: her
own follow camera when she is alone in a pane, a group rig when all of them are
on one road. It is blended in and out by a weight. This is the lesson Ryuuseki,
the star shot and the grotto all taught: the camera that draws when she is with
her sisters is not her own, so a feature on her own camera does nothing half the
time.

- **It starts where the camera already is.** The first key is the ordinary
  pose's own bearing, pitch and distance, so there is no cut.
- **The first move takes the short way to the chase.** Every move after it goes
  *forward* round `SNAKE_SHOTS` (chase, side, front, over). A cycle orbits her
  once, the same way round, like a car on a loop. The holds drift at 0.07 rad/s,
  because a camera that stops on a rollercoaster looks broken.
- **It blends as bearing, pitch and distance round her**, not as a straight
  line, because the straight line from the far side of her back to the normal
  view passes through her.
- **The lens is held 3 over any island ground.** At the landings the low side
  shot swings under the rim. The check walks both ends of every road for a full
  cycle: 3.62 is the closest it comes.
- **Off the roads it touches nothing.** Every rig carries one and calls it every
  frame, so an idle `SnakeCam` must leave the camera exactly as it found it.
  That is non-negotiable 5.

### The arena road is shot, not orbited

> "When players are climbing the bridge to the arena, we should have some
> cinematic camera angle shots to show off the new floating islands to the
> sides, show off the arena as we are circling it ... and show a nice view of
> the Main island and the islands off in the distance as we climb higher up.
> The camera angle shots should be pre-planned ... and not random camera angles
> like it currently is."

**The orbit is keyed to time, so what it shows depends on when you look, not
where you are.** Going UP the arena road, `SnakeCam` now plays `ARENA_RIDE`
instead: six shots, each owning a stretch of the road as a fraction of its
length. Coming down, and on every other road, it still orbits.

| shot | from | looks at | what it is |
| --- | --- | --- | --- |
| climb | 0 | the floating isle | behind her, the road climbing away towards it, the frost island beside |
| home | 0.13 | the main island | in front of her, above, looking back down the road at the town |
| isle | 0.27 | the floating isle | from inside the lap, looking out past her at it |
| ring | 0.42 | the ring | from outside the lap, over her shoulder and down into the arena as she circles it |
| gate | 0.70 | the doors | down the east side, the entrance coming round |
| doors | 0.90 | the doors | low behind her, down the carpet through the road's torii |

- **Every shot is one shape**, an over-the-shoulder at a landmark. The lens
  stands `dist` out on her far side from the landmark, swung `off` degrees,
  `h` up, and is aimed so that she sits at `ky` in the frame. The aim is a
  bisection between her and the landmark, done each frame, because how far
  above her the landmark is changes all the way up.
- **The landmarks are the world's**, `road.marks` (`World._arenaRideMarks`):
  the ring's centre, the doors, the main island, and the far isle nearest the
  road, measured over the whole road rather than picked.
- **The numbers were solved** against the real road and all seven decks: her
  and the landmark both in frame, in a full-width pane and a 0.89-aspect half
  pane, with no island and no deck between the lens and either, and the lens
  clear of every deck. `world-check` replays the same test: every shot 100% of
  its samples.
- **The first opening looked at the arena and showed its keel.** From the
  bottom of the road the arena is 140 units up the sight line, and the 38°
  lens is 97 units high there, so the frame was a brown wall. It passed every
  number, because a landmark's own rock is not counted as in its way. Now the
  opening looks at the floating isle, and a check holds every shot of the ring
  above the ring's floor.
- **Changes of shot are moves, not cuts.** She is steering. The move is round
  her as bearing / pitch / distance, over `ARENA_BLEND` (about 1.5 s). The three
  big swings (behind to in front, round to face out of the lap, over to face
  into it) take about 3 s each (`blend: 0.05` on their rows). Over the
  standard blend they peaked at 5.6, 4.2 and 4.3° a frame. The worst frame on
  the whole road is now 2.79°, and the check's bar is 4.
- **A coin in her paws still takes the lens back to her**, as on every road.
  That is her moment (`snakeSubject`), and the plan resumes after it.

### Who shares the ride camera: lanes

> "If all players are nearby each other, and only 1 is climbing up, then after
> 2 - 3 seconds of climbing up, they get their own camera ... others can join
> that camera sequence if they also join and are close enough."

`Game._snakeLanes` gives each kitten a road id or null, and `clusterPlayers`
never links two whose lanes differ. It is the `solo` rule one level finer: a
lane can be shared, `solo` never is. A kitten earns a lane after `SNAKE.splitT`
(2.5 s) on a road. A sister who boards the same road within `MERGE_OUT` of
someone already in the lane is in it at once, without her own wait. A party that
sets off together earns it together and stays one pane. **All null off the
roads** means `clusterPlayers` is bit-for-bit the function it was; the check
compares the two over 400 random layouts. Measured in the running game: the
split lands at 2.5 s with her sister still 25 units away, inside the ordinary
merge distance.

### The far islands

Seven islands 440–640 units out, each with a pagoda or a house, a torii, trees
and a waterfall. They are scenery, not ground, kept 300 clear of the arena, and
four draw calls for all seven: every vertex carries the index of its island and
a uniform array per island is the whole animation. `world/farisles.js`.

> "Have them fade into existence through some clouds ... the clouds act as a
> masking portal." "If the island is not in the camera frustum during any of
> the ending cutscene camera pans ... it can just spawn in."

They used to rise all together with the dawn. Now each has its own clock: a disc
of cloud gathers where its waist will be, the island comes UP THROUGH IT with
everything below the cloud's plane clipped, the plane drops away under cover of
the cloud, the cloud thins to a skirt, and **then** the waterfall grows from the
rim down, with spray points. `startVisible(camera)` starts at most one island
every `FAR.gap` (0.3 s) and only if its sphere is in the ending camera's
frustum. Whatever is still unstarted when the two pans are over is simply put
up by `revealAll`, with no show and no cost. Measured in the pane: the first
starts at 5.87 s, inside the "There is nothing left" pan (the brief asked for at
least one on that camera), and the rest during the wide shot.

**Superseded for the two ending shots**, on Richard's "like a monolithic
mountain appearing infront of the clouds". A driven isle no longer rises through
a clip plane. It is aimed once at the lens that will see it, and its cloud is a
COLUMN from grass to keel tip rather than a disc at the waist. It starts
`FAR.push` radii behind that column and comes forward whole: the vertex shader
adds `uIsle.xy` to x/z. The column writes no depth and the land does, which is
the whole masking trick. `FAR.gather / emerge / pour / clear` are fractions of
`FAR.show` (4.8 s). [story.md](story.md) has the clock these sit in.

### The arena road

> "Make it wider so all 4 players can run on it together (maybe twice as wide)
> ... go all the way around the arena island before landing at the front of
> it." A Mr Satan lion instead of the snake, a Mr Satan-coloured torii.

`SNAKE_ARENA`: half-width 6 against 3, lock 5.3. It is not wound by `windRoad`.
It is laid as an approach, a lap round the far side of the arena island 18
outside its rim and up to 14 over its ground, and a hook in over the front to
land where the griffin sets them down. Measured: 858 units long, a sweep of more
than 1.6π round the ring. **It exists only while the arena is open**: drawn,
solid and ground only then, so it is never a way round Mr Satan's griffin to a
place he has not opened yet.

### The arena's front door

> "The arena entrance is a bit bland and boring with just a Torii gate ...
> dragon snakes around the entrance of the arena with giant arena doors that
> are closed ... Mr. Satan appear infront of the arena doors ... a red carpet
> that leads to where the snake bridge is ... large elevated flaming lanterns
> stacked on the entrance."

`world/arenagate.js` builds it, in arena-local numbers (`ENTRANCE`), and
`World._buildArena` places it.

- **A gatehouse in the grandstand**: the south stand is built as two runs
  either side of `ARENA_DOOR_GAP` (10.5), with pillars and a pagoda lintel.
  **Two door leaves**, 6.5 × 12, hinged at the pillars. **They open inward**,
  because the first cut swung them out through the spot Mr Satan waits on.
  They are `arenaDoorLeaves`, moved by `setArenaDoors(open)` over 1.6 s. Shut,
  each leaf is a solid, so a closed door cannot be walked through into the
  ring.
- **Two dragon columns** instead of snakes coiled round the pillars: a coil on
  a pillar cuts into the doorway. Each is a vermilion column with a gold helix
  and the road's own snake head, turned to the carpet.
- **Four stacked lanterns** (three paper tiers, pagoda caps, a bronze bowl)
  with real fire: one merged mesh of cones, a shader, `uTime`.
- **The red carpet**, from inside the doorway to past the torii, where the
  arena road lands. Nothing stands on it, and a check keeps it that way.
- **The torii stays**, now as the front of the approach.
- **Mr Satan waits at `arenaDoorStand`**, in front of the doors, not at the
  torii.

**At his doors there is no griffin.** A party standing on the arena island
(`Game.partyAtArena`: every kitten on it, none mounted) walks straight in:
`_arrive` without the ride. His yes is `sat_doors` ("In you go, kittens!"), never
`sat_board`'s "Climb on". It has no recording yet, so it plays as a card
with no voice.
`arenaFrom = 'gate'` is remembered, because it decides the way out: the doors
and the parade (`systems/arenaexit.js`, docs/notes/story.md), not the griffin.

### Why the frost road was missing

> "The ice island doesn't have a bridge."

Every headless build had all six. The game did not, because the roads are solved
**at the ending**, and by then 100% has scattered the Powerup Kotodama over
every island, each reserving `keepClear` round itself. One sat on the only
stretch of the frost rim a road can land on; no landing was found, and the loop
skipped the road in silence. Now:
- the roads are solved against `world.snakeBase`, the lengths every obstacle
  list had when the world finished building, so they are the same roads in
  every game;
- `Game._clearRoads` moves anything play left on a road (loose orbs, pickups,
  dragon balls) off it with `World.offRoads`;
- a road that cannot be laid is recorded in `snakeMissing` rather than skipped
  in silence, and world-check asks for all seven.

### Coins

> "Gold coins in the centre of each bridge ... plays the bless animation and
> zooms into the player with the coin above their head ... '5x bamboo cut' ...
> only can be grabbed from being on the bridge, not from flying on the dragon."

One at the middle of each road, a snake emblem on six and Mr Satan's face on
the arena's, which is twice the size. `_checkCoins` takes one only when she is
**riding** the road (`snakeRide`) and not mounted, carried, riding along or
KO'd. It pays `COIN_CANES` × `BAMBOO_POINTS` = 125 to her score, never to the
MISCHIEF counter, which stays honest. The arena's pays every kitten playing. The
bless is `holdAloft` with the coin's own face. A coin stays taken and is saved
(`world.coins`), because nothing regrows. A restart puts them back.

### Through the clouds

> "X-ray shader on the clouds when a player is running through them, about 50%
> and about the size of the player."

The puff material carries up to four cut points per pane (`setCuts`). Each is
a cone from the lens to a kitten that is `uCutR` (1.7) across where she stands,
which on a 2.9-tall kitten is her and a little round her. A puff fragment
inside it, between the lens and her, is drawn at `uCutK` (0.5) of its alpha. It is aimed per pane in `_aimCloudXray`, from
the same members list as the town x-ray.

### Ramps

> "Elevated bridge entrances need ramps and/or rocks and grass."

`buildLandingApron` runs a ramp from the deck down to what a foot actually
stands on. That is `World._standAt`: the terrain **or any stonework on the
island**, the arena plaza included whether the arena is open or not. A ramp
run to the grass under the plaza ended half a unit inside it. Rocks and tufts
dress the sides. The road deck itself no longer overhangs its own end:
`locate` cuts at arc length (`END_SLOP` 0.3). Before that, every end capsule
reached `halfW` past it, and the arena's far ramp measured 0.46 of step.

### Music

`_wantedTrack`: any kitten on the arena road plays `satan`, otherwise any kitten
on a road plays `snake`. This sits under the mount and flight rules. `satan`
is authored, not generated, and it is **an original**. "Kung Fu Fighting" was
asked for and is somebody's copyright, and a synth playing its tune is still
its tune. What is free is the genre. The reasoning is in `core/audio.js`
beside it.

**The second pass asked for the song again, or the Gold Saucer's, "a funny
version".** A parody that is recognisably the tune is still made of the tune.
The tune is the part that is owned: by the song's writers and publisher since
1974, and by Square Enix since 1997. So there are two more originals:

- **`satan` is a kung-fu disco song now** (`_kungfuStep`). It is E minor
  pentatonic over the flamenco walk-down (Em D C B7). It has a string run up
  three octaves, a wah guitar on the off-beats, an erhu-ish lead that scoops
  into every note, and a synthesised HUAH! on the big hits: formants, not
  anybody's voice (`_shout`). It is 128 eighths, 33 s a chorus.
- **The strut is kept whole as `satanStrut`**, "as a backup". Point `satan`
  at `tune: 'strut'` to put it back.
- **`saucer` is an original funfair march** (`_saucerStep`): a trumpet fanfare,
  an oom-pah band, a steam calliope, a glockenspiel, a honk and a slide
  whistle. **It is in F, the arena theme's key.** It plays on the arena island
  whenever there is no match (`isl === 'arena' && !inMatch`): walking off the
  road, at his doors, and during the parade back out. The fight's own piece
  still starts at the league picker.
- **Levels are measured, not guessed.** Rendered offline, the strut is 0.052
  RMS. The new two were 0.045 and 0.036, and each carries a `mix` to 0.053.

### Saves

### Saves

`sky.bridges` holds `bridgeWant`. A save from before Snake Way existed has no
field, so the dawn it does carry says whether the ending had happened. Loaded
roads are put up whole, never grown again, because the growing belongs to the
ending. Adding no props was a hard constraint: `worldSig` counts them, and one
more would refuse every existing save.
