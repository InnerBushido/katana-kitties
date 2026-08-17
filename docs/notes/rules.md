# Gameplay rules worth not breaking

*Design notes, moved verbatim out of the old 4,400-line `HANDOFF.md`. This is
the WHY behind code that already exists — read it when you are about to change
something in this area, not before. Current state and open work live in
[HANDOFF.md](../../HANDOFF.md); the always-on summary is [CLAUDE.md](../../CLAUDE.md).*

*Cross-references saying "above" or "below" may now point at a sibling file in
this folder — see [the index](README.md).*

---

## Gameplay rules worth not breaking

**A dragon can never be lost, and the home island always has one per player.**
Dragons
belong to a *perch*. Hop off over solid ground and the dragon simply lands
beside you (`landAt`) — it only flies back to its perch (`returnHome`) when you
let go high over open sky, or when nobody is left walking on its island, which
covers flying off on another dragon, falling and respawning, and wandering
somewhere else. Making it bolt for home on *every* dismount was worse than
losing it: you could watch it leaving and couldn't stop it.

Bail out from a height and it **follows you down** (`flyTo`) rather than going
home, so a long drop never costs you your ride.

**FOUR on the home island, and the count is asserted against `MAX_PLAYERS`
rather than against 4.** The rule has never been "two": it is that no kitten is
left on the ground watching her sister fly, which is why there were two when the
game seated two. A third and fourth player can join mid-session at any moment,
and the failure that produces is silent — she picks her cat, walks to the plaza,
and finds two dragons with her sisters already on them. Written against
`MAX_PLAYERS` so seating a fifth kitten one day fails in `world-check`, on a line
that says why, rather than in front of her.

**The second pair mirrors the first across the plaza rather than being squeezed
in beside it.** The road runs the length of the town, the original two stand
either side of its south end, and the new two stand either side of its north end
— so the four are a gate at each end of a street a kid already walks down. The
smoke test bounds the closest pair against twice the widest `mountRadius` in the
game (8.06), because four billboards on one patch of grass are one heap of dragon
from every angle except directly overhead, and the mount scan would hand her
whichever it reached first. It also bounds the furthest from the start line: a
fourth dragon parked on the far rim is not a fourth dragon, it is a hike, and the
kid who has to take it is the one who joined last.

**Both new perches were MEASURED, not chosen.** Asking `findOpenSpot` for
anything in the market street funnels it into the plaza's flattened middle, where
the 1★ and the road already are — so the island was swept for ground that
`findOpenSpot` leaves exactly where it is (it moves both by 0.0) while staying
clear of solids, props, bamboo, the shrines and the star.

**The new pair repeats the home breeds instead of introducing two more.** Every
outer island gets a breed of its own and that is the whole reason to fly to one:
a colour on the horizon you have not ridden yet. Four of the five breeds at home
would spend that on the one island nobody has to travel to.

Perches are validated through `world.findOpenSpot`, which
checks solid, level ground all the way around at the sprite's own radius — not
just under the centre point. Testing the centre alone put dragons on the rim,
where the ground falls away under a sprite far wider than its footprint and the
animal reads as hovering off the edge of the island. `tools/world-check.mjs` asserts a dragon dropped 550 units away
over open sky still lands on its perch, and that a perch asked for on top of
the clan hall gets moved somewhere clear.

Its terrain clearance has to **flare out on approach** — held at a flat 3 units
it also holds the dragon 3 units above the perch it's landing on, and it
circles just out of reach forever. That failure looks exactly like the bug it
was meant to fix.

**NOTHING REGROWS.** A prop knocked clean off the rim fell to `y < -140` and
used to reappear standing at `home`, un-knocked (`Prop._reset`). For bamboo
that is simply regrowth, and it quietly poisons the one number the game asks a
kid to trust: `scored` latches on the first hit, so the cane standing in front
of her again pays nothing when she cuts it, which from the floor is
indistinguishable from a broken katana. **Whatever is standing in the grove has
to be exactly what still counts.** It is retired where it fell now
(`Prop._retire` — hidden, no longer simulated, still `scored` so the mischief
total can't shrink under her). `_reset` survives for the restart path only, and
that is the one thing allowed to bring it back. Props are not in `world.solids`,
so a hidden one blocks nothing.

**Bamboo is katana-only.** Not dive-bombable, not burnable (`Prop.katanaOnly`).
The grove is the one place the dragon doesn't work, which is what makes it
worth landing. Flying is more fun for having somewhere it fails.

**There must be enough bamboo for BOTH kittens to raise a panda on the home
island alone.** 40 canes each, so 80, and the smoke test asserts it. Swearing
the oath is a flight away and that's the point, but the *food* must not be —
with only one kitten's worth at home, the second girl watches her counter
stick while her sister's panda grows up. There are 150 canes now: 48 east of
town, 34 on the west slope, 68 on the bamboo island. Bamboo is also planted
with a **solid check** now that groves reach past their flattened clearings —
a cane grown inside a house is one you can see and can't walk up to, and when
forty of them are the price of a panda that's a kid convinced the counter is
broken.

**Ground snapping, not gravity, keeps you on a hill.** Running downhill,
gravity alone leaves the kitten a hair above the falling surface every frame —
enough to read as airborne, flip to the jump pose, land, and flip back. The
snap tolerance is sized from **distance actually travelled this frame**, not
velocity, because being shoved out of a tree by `resolveSolids` moves you
further than velocity predicts. A short `airTime` threshold on the animation is
belt-and-braces on top.

**A generated sheet's ROWS don't have to agree with each other, and
`frost_grid_v2.png`'s don't. That sheet is unusable — don't go back to it.**

```
ember_grid_v2 (10 wide)  all four rows agree     -> LIVE,  dirSense 1
frost_grid    (8 wide)   all four rows agree     -> LIVE,  dirSense 1
frost_grid_v2 (8 wide)   idle+walk one way,
                         jump+attack MIRRORED    -> UNUSED, unfixable
```

This is why the bug kept *moving* instead of going away: with one value per
sheet, fixing Frost's walk broke her idle and fixing her idle broke her walk.
No per-sheet value can satisfy a sheet that contradicts itself. `Billboard`
takes `dirSense` (per sheet) and `rowSense` (per row, overrides it) — the
per-row escape hatch is still there for the next sheet that misbehaves, but the
better fix is to use art that is internally consistent, which is why Frost is
on the older `frost_grid.png`.

If a future sheet is irregular in a way neither knob can express — cells not
evenly spaced, or directions in an arbitrary order — the real answer is a
hand-written per-cell angle table rather than another global constant.

**Never settle one by reasoning — measure it.** Getting it backwards is a
left-right *reflection*: facing-camera and facing-away still look perfect while
every other direction plays its mirror image, so it reads as an animation bug
rather than an index bug. Eyeballing the art doesn't work either; these cells
are small and near-symmetric, and I misread them repeatedly. Find the muzzle
and eye by colour and see which side of the head they sit on:

```js
// per cell: alpha bounding box -> take the top 40% (the head) -> find pale
// cream pixels (muzzle) or saturated blue/green ones (eye) -> compare their
// mean x against the head's own centre.  + = facing RIGHT, null = a back view.
```

Back views come out null, which also locates the rear of the turn. Then render
the chosen cell for all 8 headings to confirm:

```js
const bb = game.players[0].sprite, cam = -Math.PI / 4;   // sprite -> camera
game.scene.updateMatrixWorld(true);        // or getWorldPosition is stale
// for deg of 0,45,...,315: bb.row = r; bb.facing = cam + deg*PI/180;
// bb.faceCamera(fake); cell = Math.round(bb.tex.offset.x * bb.cols)
```

Correct output reads down / down-right / right / … in order, every row of a
sheet agrees with every other, and the two cats mirror each other.

To settle one by eye in play without a code round-trip:
`game.setRowSense(1, 0, -1)` — player 1, idle row, other way round.

**Pure left and right are not always drawn.** On a 10-cell sheet the steps are
36 degrees, so 90 falls exactly between two poses. `Math.round` breaks every
tie upward, which nudged BOTH profiles one cell round the circle and left the
cat walking sideways in a three-quarter pose; the cell picker rounds ties
*down* instead (`-Math.round(-x)`), which lands on the clean profile for the
two directions players use most. A consequence: on such a sheet the left/right
pair cannot be perfectly mirror-symmetric — the smoke test skips exactly the
tied pair rather than pretending otherwise.
