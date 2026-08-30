# The seven stars, the grottos and Ryuuseki

*Design notes, moved verbatim out of the old 4,400-line `HANDOFF.md`. This is
the WHY behind code that already exists — read it when you are about to change
something in this area, not before. Current state and open work live in
[HANDOFF.md](../../HANDOFF.md); the always-on summary is [CLAUDE.md](../../CLAUDE.md).*

*Cross-references saying "above" or "below" may now point at a sibling file in
this folder — see [the index](README.md).*

---

## The seven locks

**Every star but the first is behind a gate, and each gate asks for a different
verb.** They used to sit in the open on seven hillsides, which made the hunt one
long flight with a lot of looking down: the dragon did all seven, and nothing
else in the game was needed to finish the thing the whole game builds toward.

| # | island | lock | how you open it |
| --- | --- | --- | --- |
| 1★ | home | `none` | lying in the open — the one that teaches what a star is |
| 2★ | autumn | `cave` | a grotto. Walk in on foot |
| 3★ | frost | `ice` | sealed in a crystal. Any dragon's breath |
| 4★ | bamboo | `boulder` | under a rock. A panda's claw, and nothing else |
| 5★ | ash | `perch` | on a spire nothing can jump. Fly |
| 6★ | dusk | `cave` | a second grotto |
| 7★ | dojo | `sky` | up three floating shards. Triple jump, on your own feet |

`LOCKS` and `ISLAND_LOCKS` in `entities/dragonball.js` own the table. The order
is a difficulty curve, not a shuffle: the dragon gates come first because a
dragon is the first thing either girl learns to use, and the panda and the
triple jump are last because both cost a clan oath and one costs forty canes.

**THE FIRST STAR IS FREE and that is not laziness.** A locked star teaches
nothing to somebody who has never picked up an unlocked one — you have to know
what a star is, what the counter does and that it is worth crossing an island
for before a ward can read as a ward rather than as scenery.

**A LOCK MUST SAY WHAT IT WANTS, in words, and as an instruction.** Every hint
was first written as a noun ("SEALED IN ICE") and every one had to be rewritten:
a kid who can name what she is looking at still does not know what to do about
it. `world-check` asserts each hint against a verb list rather than merely
checking one exists, because describing is the failure mode. The hint shows
inside `HINT_RADIUS` **and only while the answer is still no** — a hint telling
you to go in on foot while you are standing there on foot is noise, and noise is
what teaches a kid to stop reading the hints, which costs her the four that are
load-bearing.

**A refusal toasts.** Reaching a star and having nothing happen is
indistinguishable from a broken star, and there are now five ways to be refused.
Same rule as the shrine join button. Rate-limited per three seconds or standing
next to a boulder is forty toasts a second.

**The beam is tinted by the lock**, so the colour over an island is a readable
promise about what that star will ask for. **A cave star has no beam at all**: it
is under a roof, so the column would either be swallowed by the rock or stand on
top of it pointing at an empty hillside, which is worse than no beam — it is a
beam that lies. The grotto's own glowing mouth is its advertisement.

### The grotto is above ground, and it had to be

The islands are an analytic height field: `heightAt` answers with one surface
per column and the kittens collide with exactly that, so **there is no way to
express a hole with ground both above and below it.** A real dug cave needs a
second collision system for the one feature that uses it. A rock dome gets
everything the cave was for — you cannot see in from the air, you cannot fly in,
you have to find the mouth and walk through it — for a ring of boxes and a
squashed sphere.

**It needs a SECOND dome, wound inside-out.** The world mesh is `FrontSide`, so
from inside the grotto you looked straight up through the roof at open sky,
which is the one thing the roof exists to prevent. Mirroring a dome on x
reverses its winding and leaves a shape symmetric in x unchanged, which is the
cheapest honest way to get an inward-facing copy without a second material on a
merged mesh.

**The doorway glow was facing the wrong way** for the same reason: a
`PlaneGeometry` faces +Z, it was rotated to face the interior, and the result
was a light you could only see by already being inside the cave it advertises.
There are two quads now, one each way.

### The jump gate is measured, not chosen

`SHARD_RISE` is 6.0 and it sits between two numbers computed from the real
constants in `player.js`:

```
two jumps  (anybody)      11.2²/2g + (11.2·0.86)²/2g              = 4.20
three jumps (Shadowtail)  2·(11.2·1.15)²/2g + (11.2·0.86·1.15)²/2g = 8.74
```

43% past what two jumps can *ever* do chained perfectly at the apex, and 69% of
what three give — which is the slack a nine-year-old's timing needs. `world-check`
recomputes both from the constants and asserts the rise falls between them, so
retuning the jump fails the check instead of silently opening or closing the
gate. A platform that works *most* of the time is the worst possible thing to
hang a collectible on. `SPIRE_H` is bounded the other way: 21, against the best
climb in the game at 8.74, so nothing on foot can ever reach it.

**A PANDA JUMPS HIGHER THAN A TRIPLE JUMP — 9.43 — and that is allowed.** No
shard height can separate the two, so the gate is enforced at pickup instead:
`sky` and `cave` require `foot`, meaning no dragon and no panda. A kid who works
out that she can ride her panda up and then hop off to take it has solved it,
and that is a better outcome than punishing her for it. What the rule stops is
riding *up to* a star and collecting it without ever leaving the saddle.

**The `foot` rule is enforced, not left to the geometry.** A billboarded dragon
is a flat drawing with a POINT for a position, and that point fits through any
doorway a kitten fits through.

### Four ordering bugs, all the same bug

Everything below was one mistake wearing four hats: **the stars were placed
after the world was already built.**

- **A grotto went up around a perched dragon**, wings out through the roof.
  Dragons are not `solids` — nothing in the world model records that an animal
  is standing anywhere — so `findOpenSpot` cannot see a perch. `DRAGON_SPOTS`
  moved to `dragon.js` and `World.dragonPerches()` resolves them once, so the
  spawner and the builder read the same answer.
- **The same grotto was eight units behind the Windwhisker gate.** A shrine
  advertises itself at three distances precisely so it reads from far off, and a
  dome the same size parked behind it wrecks the far one. Furniture now keeps
  `SEP` from every clan hall — sized from what each thing actually occupies,
  because a flat generous number broke it the other way and 30 units of
  exclusion deletes the whole ash island, which is 28 across.
- **The dusk grotto came up inside a field of boulders** with its doorway walled
  in. Its `keepClear` was registered *after* the ground detail had scattered.
  `placeDragonBalls()` is called from the World constructor now, before
  `_buildGroundDetail`, so everything downstream can see it.
- **The ice ward was buried under snow trees.** `findOpenSpot` measures against
  a tree's *solid*, which is its trunk at radius 0.9 — but what hides a star is
  the canopy, four across. A plain star's clearance went 2.2 → 6, and its
  `keepClear` 4 → 9. The clearing is also the tell: a bare circle with something
  glowing in it reads as deliberate from a long way off.

**`world-check` now asserts furniture separation from both shrines and perches
at the radius the FURNITURE occupies**, not the ball's — a grotto is 11.6 across
and the star inside it is a point. Every one of these passed the old checks.

**And it asserts no lock may silently fall back.** `placeDragonBalls` drops a
lock to a plain star when it cannot find room, which is right — a grotto in the
market square is worse than a star on a hillside — but it is a failure, not an
outcome, and it is invisible in play. The dojo island did exactly that and
shipped two free stars and one cave. Placement relaxes its clearance in four
passes before it ever gives up.

**A ward must read against its own biome, not against the thing it is made of.**
The ice crystal was a perfectly convincing pale `0xcfeeff` and completely
invisible, because the only island with an ice ward is the snow one.

### `resolveSolids` grew a height

Solids are infinite cylinders, which was fine while every one of them was a tree
or a house you can only walk around. The spire is the first thing in the world
that is both **solid and climbable**: a 4.4-radius column with a 2.1-radius deck
on top, so a kitten who flies up and lands on it is, in plan view, deep inside
the solid — and the old version shoved her straight off the thing she had just
landed on. It looked like the platform was rejecting her. A solid with a `top`
stops pushing once you are above it; solids without one are unchanged.

### The found-a-star moment

`Player.holdAloft` — she stops, lifts the star over her head, the camera comes
in, and a fanfare plays (`starfound`, a bigger cue than the old four-note blip,
because finding one now costs a cave or a claw or a third jump).

**IT IS PER PLAYER, NOT A CUTSCENE.** Every other scripted moment in the game
takes the whole screen from both girls, which is right when the thing being said
is said to both of them. A star is found by ONE kitten, usually while her sister
is two islands away — stopping that sister's game to show her a cutscene about
something she did not do is the exact interruption the split screen exists to
avoid.

**It pulls the merged camera too.** Same trap as Ryuuseki's framing: when the
girls are together — which is most of the time, and exactly when they are
hunting as a pair — `Player._updateCamera` is not the camera drawing. If a
camera change appears to do nothing, check which camera is actually drawing.

**She is frozen with a dead pad, but never while flying.** A dead stick on a
dragon is a dragon nobody is steering, thirty units up, for two seconds — and
the ice star is deliberately taken from the air, so that case really happens.

**The star draws with `depthTest: false`.** She is a transparent billboard and it
sits at very nearly her own depth, so without it the sort decides frame by frame
which is in front and the prize flickers *inside* the cat holding it. The cost
is that it shows through anything between her and the camera for two seconds,
which is the better trade.

---

## The grotto is a maze now, and you can see inside it

### Seeing in: the roof comes off, the walls get an X-RAY

This took three goes and the first two are worth knowing, because each one is
the obvious answer.

**Lighting was the first fix and it was not the problem.** The interior really
was 98.3% near-black (measured by rendering a frame from inside and reading the
pixels back), so brightening it was right — but it changed nothing you could
see, because **the camera was never in there**. The follow camera sits ~19 out
and ~18 up; the dome is 12.4 across. Walking in put the kitten under an opaque
grey lump. You cannot light your way through a roof.

**Hiding the whole building was the second, and it reads exactly as badly as it
sounds** — the room stops being a room. Tilting the camera over the wall
instead does not work either, and the reason is specific to this game: the
characters are **billboards**, vertical quads that turn on Y only, so any pitch
steep enough to clear an 8-unit wall renders both kittens as flat streaks on
the floor. Measured at 1.16 and again at 1.32; both unusable. There is no
camera angle that clears a wall and keeps a billboard readable.

**So the walls stay up and the shader takes a bite out of them**
(`xrayVertexMat` in `gfx.js`). Every fragment inside a capsule running from the
camera to a player is discarded, so a soft porthole follows her along the wall
and the rest of the building is untouched. Three details that matter:

- **A discard, not alpha.** Transparency would need this mesh sorted against
  the world it is embedded in. `discard` is order-independent, and the ragged
  edge is hidden by dithering the boundary against a 4x4 Bayer matrix.
- **World space, not screen space.** The obvious version projects the player to
  pixels and works in `gl_FragCoord`, which then has to know about the split
  screen's viewport offsets. Distance from a fragment to the camera→player
  *segment* needs only two positions and is right for whichever camera is
  drawing. `Game._aimXray` sets it per view, exactly like `_faceAll`.
- **The hole is a cone.** A constant world radius punches a neat circle out of
  a wall two units from her face and a pinprick out of one twenty units away.
  It widens toward the camera so the hole is a steady size on screen.
- **IT CUTS FOR KITTENS OUTSIDE THE GROTTO TOO, and that was the miss.** The
  first version only cut for players who were *inside*, which fixed the room
  and left the commoner case broken: a grotto is a 25-unit dome on a small
  island, so walking PAST one puts it between the camera and you and swallows
  you whole. You do not have to be in a building for it to hide you. The bound
  is `r * 2.8` — generous, but not unlimited, so a kitten on the far side of
  the island does not get a tunnel bored through a grotto she is nowhere near.
- **The ROOF carries the material as well as the walls.** It is the widest part
  of the building, so the dome is what hides you when you walk past — which
  happens far more often than being inside one.
- **Each grotto gets its OWN material instance.** The cut lives in that
  material's uniforms, so one shared material would mean both grottos opening
  the same hole in the same place.

**The ROOF is still simply hidden**, because there is no shader trick for a
roof: you cannot look down into a room through one, and an x-ray hole in the
middle of a dome is a hole in the sky. The camera only needs a nudge now —
`CAVE_PITCH` 0.82, barely steeper than normal, and **no yaw swing at all** (two
versions turned the camera to face along the doorway; both whip round as you
cross the threshold, and inside a round room "along the door" stops meaning
anything after the first corner).

### The walls are one mesh each, and that is the z-fighting fix

`curvedWall` builds an annular sector as a single solid. It replaced a row of
overlapping boxes stepped round the arc — which looks fine from the side, but
every box overlaps its neighbours, so along the top two coplanar faces fight
and every wall grew a shimmering dashed line down its spine. One mesh has no
interior faces to argue about.

**AND EVERY FACE OF IT WAS WOUND BACKWARDS — all four groups, consistently.**
The world material is `FrontSide`, so a back-facing wall is culled from the
side you are meant to look at it from and drawn from the side you are not: the
grotto rendered inside-out, lit wrong, with the far side of the room showing
through the near side. It shipped, and a player spotted it before any check
did, because "the walls look a bit odd" is not something a screenshot makes
obvious. Measured on a test wall: 16 of 16 outer normals pointing inward, 14 of
14 top normals pointing down. `world-check` asserts both now — normals are
geometry, so there is no excuse for eyeballing them.

**And the walls poked out through the roof.** `ceilAt` described the *inner*
ceiling dome, and when that was deleted the formula stayed, describing a
surface that no longer existed. The dome that replaced it is higher at the rim
and lower toward the middle, so the inner maze rings — sized against the old
numbers plus a unit of headroom — stood 0.33 proud of it, and the grotto wore
two grey rings like a crown. `ceilAt` is taken off the dome's own geometry now,
less a margin.

**The second shimmer was NOT z-fighting and chasing it as such wasted a pass.**
The dome came out banded with dark crawling arcs. Two causes, both fixed:

- A second, inward-facing ceiling dome sat 0.5 from the outer one radially and
  **0.07 vertically near the rim**, which no depth buffer separates. It was
  also dead geometry by then — the roof is hidden whenever anybody is inside,
  so its underside is never on screen. Deleted.
- **Shadow acne.** `normalBias` was 0.05, which is fine while every
  shadow-receiving surface is a small flat box or a hillside. The dome is the
  first big *smooth* curved thing in the world, and a smooth surface at a
  grazing angle to the sun is the textbook case. 0.9 now.

### The maze

Two concentric rings inside the outer wall, each with its gap somewhere else,
plus a radial spur in each corridor that turns one way round into a dead end.
`world-check` walks it with the real `resolveSolids` at the real player radius:
**2.46x and 2.65x the straight line**, up from 2.0x for the single arc.

**THE RINGS ARE 3.7 APART AND THAT IS NOT A LOOK.** Wall thickness is 1.15 and
a kitten is 1.5 across, so 3.7 leaves 2.55 of corridor and 1.05 of slack.
Tighter and she scrapes both walls.

**THE ENTRANCE STICKS OUT PAST THE DOME.** A dome is a dome from every angle:
the mouth was a gap in a wall *under an overhanging roof*, so from anywhere but
dead in front of it there was nothing to see, and finding the way in meant
walking a full circle round a grey lump. Colour alone does not fix that — the
whole island is warm rock. The doorway now projects `PORCH` (4.6) beyond the
wall on two jambs with a lintel, the warm quad sits at the *outer* end of it,
and there is a lantern each side. It breaks the silhouette, which is the only
thing that reads at distance.

**The star gets an indoor marker** (`DragonBall.indoorMark`): a slim column
drawn with `depthTest: false` so it reads *through* the maze, shown only while
somebody is actually inside that grotto. Without it the walls run to the
ceiling and you cannot tell which ring the star is in — that is not
exploration, it is a guess, and a wrong guess costs a full lap. It tells you
where, never how. Off outside, so it can never poke up through the roof and
give the star away from the air.

### And it is lit, which still matters once you can see in

Each grotto carries **three crystals and three point lights, together**. Either
alone is worse than neither: light with no visible source looks like a shader
bug, and glowing meshes that light nothing look like stickers on a dark wall.
Same frame with the lamps off vs on: mean luma 30.8 → 108.4, near-black pixels
98.3% → 0.0%.

They are **deliberately not in `world.lights`**, which is what `setDusk` dims. A
crystal burning inside a cave has nothing to do with the sky over the island,
and dimming it when Ryuuseki arrives would put the interior back where it
started at the exact point in the game somebody is most likely to be in one.

**The maze is an arc with its gap on the far side, plus one spur that makes one
way round a dead end.** Three legs and a single wrong turn — enough to have to
look, nowhere near enough to get lost in. Two properties come for free rather
than from tuning:

- **It cannot be jumped.** Solids are infinite cylinders unless given a `top`,
  and these have none, so Shadowtail's 8.7-unit triple jump is no more use in
  here than a hop. The geometry still runs up into the ceiling (`ceilAt`),
  because a wall you cannot cross but can see over reads as a bug.
- **It cannot be cut or burned.** These are world geometry merged into the
  island mesh, not `props` — the katana only ever hits a Prop.

**The dome went 8.2 → 10.5 to fit the maze, and three numbers had to move with
it.** The wall-block count is `2πr / 3.68` now rather than a flat 14: growing
the room with a fixed count spreads the same blocks thinner until their
1.9-radius solids stop overlapping and the wall develops gaps you can walk
through. `door` is an angle, so it is scaled by `8.2/r` to hold the opening at
the same number of world units. And `SEP.cave` went 24 → 27 with `keepClear` 15
→ 18, both derived from the dome rather than picked.

**`world-check` now WALKS it.** A flood fill through the real `resolveSolids` at
the real player radius, from outside the mouth to the star. It asserts the star
is reachable at all (a sealed grotto is the worst bug this game could ship — a
kid would hunt forever), that the walk is at least 1.35x the straight line, and
that the straight line is genuinely blocked. Currently 2.0x on both.

---

## The 7★ was open, and the pickup radius is why

The shard geometry was never the problem — every hop measures 6.0 to 6.7
against a two-jump best of 4.20. The hole was in `_updateBalls`: the pickup test
allows **fourteen units of vertical slack** so a kitten on a dragon can sweep
past a star on a rim and still collect it. Right for the five locks that want a
dragon; a hole under the two that don't. A double jump from the middle shard
tops out 1.8 below the star, comfortably inside fourteen — so the third jump the
whole island is built around was optional, and a dragon could simply fly her up.

Two rules close it, and they answer different questions:

- **`foot` locks now require `player.onGround`.** This makes the vertical window
  irrelevant *by construction* rather than by tuning it — which is the trap, since
  any number big enough for a dragon fly-by is big enough for a jump.
- **`LOCKS.sky.climbed` requires `player.footClimb`.** `foot` asks where she is
  right now; `climbed` asks how she GOT there. Every other foot lock is happy
  with the first question — you cannot ride a dragon into a grotto — but this
  star is in open sky, so "not on a dragon" was satisfied by flying up, hopping
  off and landing on the top shard. `footClimb` is cleared by touching any mount
  and restored **only by standing on real terrain**; the shards are `platforms`,
  so a dragon that drops her up there leaves it false.

`footClimb` is written in one place in `Player.update` rather than at each of the
four sites that take a mount, because the question is about state and there are
more ways onto an animal than there are lines that say `this.mount =`.

**This reverses the earlier panda ruling** ("a kid who works out she can ride her
panda up and hop off has solved it"). Richard asked for the gate to mean what it
says; the panda shortcut goes with the dragon one.

---

## The seven dragon balls and Ryuuseki

Seven stars, **one per island — which is why there are seven of each**, and
`world-check` asserts one per island and no island with two. `entities/
dragonball.js` is procedural (canvas-drawn stars on an amber sphere), like
every other prop; each stands a short amber column so it is findable from the
air, deliberately thinner and shorter than a shrine beam.

**The tally is SHARED between the two kittens.** Seven split two ways is three
and a half, and a hunt where your sister finding one sets you back ends in an
argument. This is the one thing in the game they do together.

Collect all seven and Patchfur speaks (`systems/summonscene.js`, `found`), and
**Ryuuseki appears over the great torii**. Walk up to him and he introduces
himself (`summon`) while the sky falls to `DUSK_DEEP` and stays there until he
leaves. `World.setSky(dusk, dawn)` lerps the sky uniforms, the fog AND the light
intensities from a remembered day palette — leaving the lights alone put bright
afternoon islands under a black sky, which reads as a broken shader rather than
as nightfall. (It was `setDusk(k)` until the ending grew a morning of its own;
the second channel is [endgame.md](endgame.md).)

**TWO SEATS, DOING DIFFERENT JOBS.** The pilot takes `player.mount`, so every
line of the existing flight controller applies unchanged. The gunner takes
`player.rideAlong` — deliberately not `mount`, which everything in the game
reads as "is steering a flying thing" — steers nothing, and aims the fan with
her stick. She is a turret. **A lone pilot still fires, but one beam**: a kid
playing while her sister is off cutting bamboo must not have summoned a
legendary taxi.

**THE BEAM COUNT IS A FACT ABOUT THE SEAT, NOT ABOUT THE CREW**
(`PILOT_BEAMS` 1, `GUNNER_BEAMS` 7, `Ryuuseki.beamsFor`). It read
`pilot && gunner` and handed *whoever pressed the button* seven, so the pilot's
single beam silently became the whole fan the moment her sister climbed on.
Two things wrong with that, and the second is the real one: the two girls'
attacks became indistinguishable in the one set-piece built entirely around
them doing different jobs, and the gunner's only contribution was something
the pilot could now do without her. The pilot always fires one; the gunner
always fires seven; climbing into the second seat is what puts the fan in the
game and the girl in that seat is the one who owns it.

**BOTH aboard forces ONE camera, outranking even "always split" — `duo`, not
`ridden`, and confusing the two cost the split screen.** The rule fired on
anybody being aboard, so one kitten climbing on collapsed the whole screen to a
single camera locked to the dragon while her sister, who had done nothing, was
still down in the town with no view of her own. Two half-screens of the same
animal *is* the worst possible view of him — the flyer's turns yank the
gunner's screen around and the gunner cannot see what she is aiming at — but
that is an argument about a **shared** subject. One rider is not one. Same rule
as the dojo, which is also "both of them or neither".

`Ryuuseki.duo` exists so the two questions can't be spelled the same way again,
and it gates the merged rig's framing as well as the merge itself: with one
girl aboard and one on the ground, `split = never` still reaches that rig, and
framing it on `ridersMidpoint()` there loses the kitten who isn't on him.
`rideAlong` also counts as flying in the auto-merge distance test now — a
gunner thirty units up is not "close to" her sister on the ground below.

**THE BEAMS COME OUT OF HIS MOUTH, SO THEY MUST GO WHERE HIS MOUTH POINTS**
(`AIM_ARC`, `Ryuuseki.aimFor`). The fan was aimed on the shooter's raw facing,
copied from the panda's claw — which is right for a claw, because that comes
out of the rider, and wrong here, because a beam comes out of the head. His
drawn heading is broadside and *flips*, so with her stick free the gunner could
fire seven beams out of his jaw travelling backwards over his own coils: the
"wrong direction" Frost saw whenever he was drawn facing left and she pushed
right. A hard lock to his head would have made the second seat a spectator, so
she aims within an arc of it instead, and **the bound is set against `FAN`
rather than picked** — the outermost beam sits at `AIM_ARC + FAN/2` off the
head, and `world-check` asserts that stays under a quarter turn so widening the
fan later can't quietly reintroduce it. The clamp is applied in
`_updatePassenger` every frame as well as inside `fire`, because the thing she
is clamped against moves: an aim that was correct against his old side is 180
degrees out the instant the pilot flips him, and a gunner drawn aiming one way
while seven beams leave the jaw another reads as broken even when the beams are
the part that's right.

It is a no-op for the pilot by construction — `_updateFlight` sets her facing
to `camYaw + flySide * PI/2` and `carry` builds his heading from the same two
numbers — and there is a check that keeps it that way, because her version of
this bug (one beam leaving at a slight angle to the head she is steering) is
far harder to notice than the gunner's.

**A fan still fading re-anchors to the mouth every frame.** The beams are
children of his group so they travel with him for free, but the mouth is
`RYU_MOUTH.fwd` along a heading that swaps — fire while flying left, flip
right, and a fan pinned to the local offset it was born with hangs off his
tail for the rest of its fade. Their **angle** is deliberately left alone: a
beam already out of the mouth is in the world, and re-deriving it would sweep
the whole fan across everything between.

**THE SEATS WERE MEASURED, AND THE OBVIOUS PLACE IS THE WRONG ONE.** He is
drawn as an S-curve, so the middle of the sprite is the *hole between two
coils*: measured thickness 0.104 there against 0.371 at the hump behind his
neck. Seated near his origin — which is where the storm dragon's numbers put
them — both girls floated inside a ring of dragon with daylight under them, and
nothing about the numbers looked wrong. See `RYU_BACK`; the column that matters
is thickness, not height.

**Anything sized for a storm dragon breaks on him.** His quad is 60 units
across against a storm dragon's ~24, and three separate things were tuned to
the smaller number: the follow camera sat *inside* him at 46 units, the
rider's depth-sort nudge (2.4) left both girls buried in his billboard, and
the summon shot cropped his head off. All three now scale off `mount.quad`
rather than assuming every flying thing is the same size.

**DEBUG KEYS, in play: `7` `8` `9`.** Collect all seven stars and summon him,
seat both kittens, fire. The dragon is otherwise ten minutes of flying away and
needs two players to see at its best, and the DUO attack — the entire point of
the feature — was the single hardest thing in the game to reach. `Game._debugKey`.

**Player 2's actions were numpad-only, which meant she had none on a laptop.**
She could walk and do nothing else: no slash, no oath, no dragon, and above all
no gunner's attack, so the two-player set-piece could not be reached on the
machine the game is built on. `KEYSETS[1].alt` adds `, . / ;` next to the arrow
keys as ALTERNATES; the numpad still works.

**MERGED MODE DRAWS WITH `sharedCamera`, NOT `player.camera`.** This cost more
time than anything else in the feature. Riding Ryuuseki forces a merged view,
so every adjustment made to `Player._updateCamera` — pull-back, aim point, all
of it — changed nothing at all, because that camera is not the one rendering.
The merged rig is its own thing in `_updateSplit` and it sizes its distance
from **how far apart the two kittens are**: on him they share one point, so it
saw a separation of zero, clamped to its 26-unit minimum, and framed a 28-unit
dragon from 26 units. It also aimed at their positions, which are his origin,
so the animal ran off the side of the screen.

Both are fixed in the merged rig (`RYU_VIEW`, `ridersMidpoint()`). **If a
camera change appears to do nothing, check which camera is actually drawing
before changing anything else.**

**The camera looks at the RIDERS, not at the animal.** Their positions are his
origin — the seats are draw offsets — so "aim at the rider" and "aim at the
dragon" are the same point and neither frames him. `ridersMidpoint()` returns
where the girls are *drawn*, averaged over whichever seats are filled.

**Three bugs the big dragon exposed, all worth knowing:**

- **`mount.flapBob` was undefined on him, and it made the PILOT invisible.**
  `Player._updateFeedback` sets `sprite.mesh.position.y = this.mount.flapBob`,
  a storm-dragon field. Undefined NaN'd the local Y and three.js silently
  declined to draw her — while the gunner, who rides through `rideAlong` and
  never touches that line, was perfectly fine. It looked exactly like a
  depth-sorting problem and was not one. It is `?? 0` now AND he has a real
  `flapBob`. **A missing field on a mount must degrade, not vanish.**
- **A sealed white pocket under his chin survived background removal.** The
  flood fills inward from the borders and cannot reach background the lineart
  encloses — his whiskers meet his jaw and seal it. `clearPockets` in
  `loadSpriteAtlas` clears pure-white components over a size floor; both halves
  of that test are needed, since purity alone eats the teeth and size alone
  eats the whiskers. No new art was required.
- **`ClanLeader.faceCamera` multiplied its turn squash into `scale.x`.**
  `faceCamera` runs once per VIEW and `update` once per frame, so in split
  screen player 2 saw a leader squashed twice as hard. It is set from
  `baseScaleX` now, never compounded.

**A new music track** (`MUSIC.ryu`) plays while he is ridden: insen like the
intro, but nearly twice the game tempo, an octave up, taiko every other step,
and every pluck doubled a fifth above. Same synthesis, no new files.
