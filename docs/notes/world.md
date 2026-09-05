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
The cub costs *lifetime* canes; the adult costs canes cut *since the cub
arrived* (`player.pandaFedFrom`, the tally at the moment the panda was last
granted). Charging lifetime canes for both meant a player who had banked forty
before finding the shrine watched her cub appear and grow up in the same
breath — the cub stage, which is the whole point of raising the thing, lasted a
single frame and she never saw it. **You cannot pre-pay for raising an animal.**
`tierFor(400)` is asserted to be a cub, not an adult.

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
