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

**The Dojo's sin/cos board and the minimap both want the bottom-left corner.**
In a side-by-side split, player 1's map moves there and sat straight on top of
a board that can be 42vw wide. `hud-math` on `#hud` lifts the map to the top of
its own half while the board is up — the lesson is what you came to the Dojo
for, so it keeps the corner.

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
