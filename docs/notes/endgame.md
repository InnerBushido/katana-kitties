# The 100% ending and the Powerup Kotodama

*Design notes, moved verbatim out of the old 4,400-line `HANDOFF.md`. This is
the WHY behind code that already exists — read it when you are about to change
something in this area, not before. Current state and open work live in
[HANDOFF.md](../../HANDOFF.md); the always-on summary is [CLAUDE.md](../../CLAUDE.md).*

*Cross-references saying "above" or "below" may now point at a sibling file in
this folder — see [the index](README.md).*

---

## The 100% ending

`SCRIPTS.finale` in `summonscene.js` — Patchfur again, because the person who
tells you what a place is should be the one who tells you what you did to it.
Four beats, ~32s, fires once when the last knockable thing is scored.

**IT IS NOT A "YOU WIN" SCREEN.** Nothing is taken away, no credits, no reset —
and the last beat exists to say out loud that she can keep playing, because a
nine-year-old who sees a completion screen reasonably concludes the game is over
and stops. `world-check` asserts that line is actually present rather than
assuming it. The arena is named as something **coming**, not something here:
promising a kid a thing that doesn't exist is how you lose her trust in
everything else the game has told her.

**IT IS QUEUED, NOT FIRED FROM `onMischief`.** That runs from inside a prop being
hit, which can happen while a shrine introduction already owns the screen —
`SummonScene.start` refuses when one is running, and refusing there would lose
the ending outright, because there are no props left to hit and nothing would
ever ask again. `_finaleDue` is picked up on the first frame the screen is free.

**The shot is the argument.** She is talking about islands that drifted apart and
two kittens who crossed between them, so the camera does the one thing the other
two shots never do: it keeps going up and back, continuously across beats, until
the whole archipelago is in frame. Measured: 176 → 329 units out, 85 → 183 up,
against a world radius of 284. It is sized from `_worldBounds()` so an eighth
island cannot quietly crop it.

**Patchfur is RECORDED here like she is everywhere else** — `done1`..`done4`,
ElevenLabs through the Higgsfield `text2speech_v2` model, preset voice **Mabel**,
the same one she uses for the intro and for `found`. She already had seven lines
(`sky`, `break`, `elder1`, `elder2`, `close`, `balls1`, `balls2`); a narrator who
is recorded for those and synthesised blips for the ending makes the ending sound
like the part nobody finished. `dur` survives as a **floor** — `load()` raises it
to the real clip plus TAIL, and the four clips run 10.2–15.7s, so the scene is
about 63 seconds rather than the 33 the authored numbers suggest.

**It shows her portrait; `found` and `summon` do not.** The difference is who the
camera is on. Those two frame a place or a dragon and the speaker is elsewhere,
so a portrait would be furniture for its own sake. Here she is talking directly
to them over a shot of the world — she is the one thing *not* on screen, which is
exactly when the little box earns its place. `drawPortrait` is exported from
`cutscene.js` for this; `shrinescene.js` still carries its own copy of that crop
maths, and a fourth caller should collapse both onto the shared one.

**THE LAST BEAT SENDS THEM TO THE ARENA, AND THE ARENA NOW EXISTS.** This line
was written before it did, deliberately, because the finale is the natural door
into the next thing being built — and for one session it was a promise the game
had made out loud to a nine-year-old with nothing behind it. It is kept now: see
The World Martial Arts Tournament below. The line needs no softening and
`done4` should be left alone.

One thing it does still overstate: the finale fires at 100% mischief and the
arena opens at 80%, so by the time she hears this she has been able to go for a
while. That is the right way round — being told about a place you can already
get to is an invitation, not a tease.

### The world gets its morning back

Reported from play: *"when end game happens, maybe turn sky from being dark to
being normal again, or sunny — should show world changing and being happier."*
It is the right note. By the time the finale runs, Ryuuseki has been summoned,
so the sky the ending plays under is his thunderstorm — Patchfur's four lines
about what these two made of the place were being spoken over a black sky.

**The sky has TWO channels now, not one.** `World.setSky(dusk, dawn)` replaces
`setDusk(k)`: `dusk` is the storm, unchanged, and `dawn` is a separate lerp
towards a third palette (`_dawnSky`) that is neither the game's sunset nor the
storm. The finale sets `duskWant = 0` and `dawnWant = DAWN_DEEP` together, so
one scene both lifts the storm and brings the morning. `DAWN_RISE` is 12
seconds against the storm's `DUSK_FALL`, deliberately the slowest sky change in
the game: it has to land inside Patchfur's first two lines and be noticed
*happening* rather than discovered done. `world-check` measures that against
`SCRIPTS.finale`'s own durations rather than a number typed twice.

**The thing a player actually reads is the fog, not the colours.** `fogNear`
goes 420 → 900, which brings the whole archipelago into view at once — the shot
is already pulling back to 329 units, and until now the far islands arrived as
haze. Clearing the fog is what makes the pull-back mean something.

**Going back to the sunset has to be bit-identical.** The fifth non-negotiable
read as a rule about the sky: the two-channel path must reproduce the sky the
game has always had when both channels are zero. `world-check` sets dusk, clears
it, and compares the uniforms by value. `resetSky()` (restart) zeroes both;
`clearDusk()` (Ryuuseki leaving) deliberately does not touch the dawn.

### The clouds are geometry, and three shader attempts are why

The same note asked for *"some nice Japanese inspired clouds, or the waterfalls
from the trailer screenshot"*. The obvious answer was a third cel-shaded band in
`SKY_FRAG`, next to the two that were already there. It failed three times, and
the reason is worth keeping because it applies to anything ever painted on that
dome:

**This camera looks DOWN.** Measured with `unproject` on the live camera rather
than reasoned about: the top of the frame sits at h = -0.23 standing in the town
and h = -0.28 up on a dragon, the bottom at h = -0.84. A player essentially
never sees above the horizon outside a cutscene — which also explains why the
two bands that were already in the shader (h = 0.16 and 0.34) have only ever
appeared in scenes. Moving a bank below the horizon put it on screen and exposed
the second problem: **a shape cut out of a sphere by azimuth, seen from a camera
pointed down, projects as a vertical stripe**, not a horizontal shelf. The last
attempt was clearly visible and read as a rendering fault.

So `World._buildClouds` builds **flat plates lying in the XZ plane**, below the
islands, where the camera is already pointing. 24 shelves of overlapping circles
on two rings, one merged geometry, one draw call, 3594 triangles, a
`MeshBasicMaterial` faded in by `dawn` and `visible = false` for the entire game
before the ending. They read the way the reference art does for the simple
reason that they genuinely are horizontal planes seen from above.

Three things in there are measurements, not choices, and each has a check:

- **`valueNoise` on whole numbers does not use its range.** Printed for
  i = 0..15 across all six streams, the largest value any returns is 0.482.
  Written the obvious way the ring came out packed into a third of the depth it
  was asked for, so the builder doubles and clamps.
- **An island is a keel, not a disc.** The home island's underside reaches
  y = -98.3 at its centre while its rim is at 0. A plate at y = -34..-106 inside
  that footprint is a cream circle embedded in rock. The first version cleared
  the cloud's *centre* and buried the far end of the shelf; the clearance is
  `radius + span + 18` now, and `world-check` walks every vertex.
- **Coplanar lobes z-fight**, and the flicker is worse than the overlap it was
  hiding, so every lobe in a shelf sits on its own level.

**Nothing in the world knows they are there.** Not solid, not walkable, not
props — a cloud you can stand on is a promise the rest of the game does not
keep, and the dragon would have to be taught about it.

---

## The Powerup Kotodama — the endgame

`entities/powerorb.js`, `systems/kotodama.js`, `systems/profile.js`,
`entities/stall.js`. Everything here is inert until 100% mischief, and
`Kotodama.awakened` is the single flag that says whether any of it exists —
the loop, the minimap and the stall prompt all read that rather than each
keeping their own idea of whether the endgame has started.

### Debug: `6` is THE WHOLE ENDGAME, in one key

`Game._debugEndgame`. Same argument as `7` `8` `9`, and a bigger version of it:
everything the 100% moment unlocks is behind 216 props knocked over, so checking
one colour on one orb, or one word of the ending, or whether a round card is
centred, meant playing the whole game first. `5` still opens the profile screen.

**THE WORLD'S MISCHIEF IS LEFT ALONE, AND THAT IS THE POINT.** Marking 216 props
`scored` is the one-line version and it destroys the thing you usually want to
look at next: the props *are* the world, the counter is the number the whole
game asks a kid to trust, and `Prop.scored` latches — so a debug key that spent
them would leave nothing to knock over and no way back short of a restart. It
drives the four things the 100% moment *causes* and touches none of its cause.

It follows the real code paths rather than reproducing them:

| | |
| --- | --- |
| **Purses** | an equal share of `world.pointsTotal` each |
| **The Awakening** | `kotodama.awaken()` — the same call 100% makes |
| **The tournament** | `quest.stage = 'open'`: unlocked, not entered |
| **The ending** | queued through `_finaleDue`, not started inline |

**`/ partySize`, NOT `/ 2`, AND THE OLD VERSION WAS A REAL BUG.** It handed every
player half the pot regardless of how many there were, so at four players it paid
out twice the money in the world — and because the PRICE is derived from the pot
(`pointsTotal / players / 3.5`), that quietly made the whole shop half price for
everybody. It is the same arithmetic the price already uses, so the two cannot
drift apart, and `world-check` pins the share at 3.5 orbs at every party size.

**THE TOURNAMENT IS UNLOCKED, NOT ENTERED.** `stage = 'open'` is where the quest
lands after Mr Satan's second scene, so from there it is a walk to him in the
town with everybody together — the real path, including the griffin. Every
milestone is marked **spent**, or he would call out progress the girls have not
made on a world that is still standing. (The scene viewer's `arena` entry is
still the one that skips straight there.)

**THE ENDING IS QUEUED, NOT STARTED**, for the reason `onMischief` gives: a scene
cannot start over another one, and the loop picks it up on the first frame the
screen is free.

**A KITTEN WHO JOINS AFTERWARDS GETS THE SAME PURSE** (`_debugPurse`, read in
`_joinPlayer`). Without it she is the one player at the stall who cannot afford
anything, which reads as the shop being broken rather than as her being late.
Cleared on restart, or a fresh game would hand the world's money to whoever
joined a town where nothing has been knocked over yet.

**Known and left alone:** Patchfur's ending speech says *"nothing left standing"*
over a world that is still standing, and addresses *"you two"* at any party size.
The first is inherent to keeping the mischief intact; the second is the script,
and it is wrong on a real four-player run too.

### SKIPPING THE ENDING MUST NOT COST ANYTHING, and it doesn't

Nothing in the game hangs off a scene *finishing*. `SummonScene.finish` tears
down its own UI and touches no game state, and every stage change is made at the
moment `start` is **accepted**, not when the scene ends:

| moment | set at |
| --- | --- |
| the Awakening | `onMischief`, before the ending is even queued |
| `stage = 'calling'` | inside `if (start('satanAnnounce'))` |
| `stage = 'open'` + `openArena(true)` | inside `if (start('satanOpen'))` |
| the debug unlock | `_debugEndgame`, all of it before `_finaleDue` |

So a thumb on Start during the first frame of any of them loses the words and
nothing else. Verified by skipping each on frame 1, on the real 100% path and on
the debug key, at two players and at four.

**One thing was NOT safe, and it was the scene viewer rather than the skip.**
`SummonScene.start` refuses when `played[which]` is set, and the viewer sets it
every time somebody previews the ending — so previewing the finale once meant the
girls could knock over all 216 props and be shown **nothing at all**. The
100%-queue guard was `!played.finale`, the scene's own once-latch, which is the
right question asked of the wrong flag: from there a preview is
indistinguishable from the real thing having already happened.

It is `_endingShown` now — a flag about THIS 100%, cleared only by restart — and
the queue clears `played.finale` on the way past so `start` cannot refuse.
**Everything else already survived this**, which is exactly why it went
unnoticed: the world unlocked correctly and only the ending was missing.

### The Awakening

On the frame the last knockable thing goes over: the plain Kotodama Orbs each
kitten collected are counted, whoever has more is given a Powerup Kotodama
drawn at random, every plain orb is dissolved off both kittens and out of the
world, **eight** Powerup Kotodama — one of each kind — are scattered over the
islands, and a dealer's stall appears in the market.

**IT FIRES FROM `onMischief`, NOT WITH THE FINALE SCENE, and the two are
deliberately opposite.** `_finaleDue` is *queued* because a cutscene cannot
start over another one. This cannot be queued and cannot wait, for the same
reason: the finale is 63 seconds and is skippable on its first frame, so
hanging the world's biggest state change off the end of it hands a kid who
presses Start no orbs at all. `awaken()` is idempotent so the guard is belt
and braces, and the scene then plays over a world that has already turned.

**A TIE GIVES THE PRIZE TO BOTH, AND THAT INCLUDES 0-0.** Same argument as the
shared dragon-ball tally: two sisters, one of them younger, and a prize exactly
one of them can win produces an argument rather than a game. Two kittens who
never touched a plain orb both get one anyway — the alternative is an endgame
that opens by telling both of them they lost, with nothing to trade.

**THE PRIZE IS RANDOM, WHICH IS THE POINT.** A chosen prize is a menu, both
girls pick the same obvious thing, and the trading never happens. A random one
is the first card in the hand: a thing you *have* rather than a thing you
wanted, which is what makes "I'll swap you" occur to a nine-year-old unprompted.

**WHY THE PLAIN ORBS GO, given that the maths is the point of the project.**
Two kinds of Kotodama in the world at once, one of which does nothing, and the
useless one six units across with a full geometry lesson attached — it would
drown the thing replacing it. The lesson keeps both its homes: the **Dojo of
the Turning Circle is untouched**, and the worn orbs still print live
`cos θ` / `sin θ` computed from the same two numbers that place them. The
katakana rain is decoration *around* a real readout, never instead of one. A
prettier orb that lied about its own position would be worse than no orb.

### The eight

Each changes a **different verb** — the clans' rule, and `world-check` asserts
it the same way: every orb must change exactly one field of `aggregate()`, and
no two the same one.

| | orb | effect |
| --- | --- | --- |
| 疾 | Hayate / GALE | run speed ×(1 + 0.22n) |
| 斬 | Nagagiri / LONG CUT | katana reach ×(1 + 0.30n) |
| 剛 | Kongo / ADAMANT | max health 100 + 30n |
| 跳 | Tobi / LEAP | +n jumps |
| 壁 | Kabe / WARD | **hold** to block, 2s cap, 1.5s wait, ¼ gravity |
| 落 | Otoshi / POWER DIVE | interact in the air — a driven fall |
| 十 | Juuji / CROSS SLASH | hold attack — three cuts that HOLD, then a launch |
| 突 | Totsugeki / CHARGE | sprint + attack — straight through, no gravity |

**STACKING IS ADDITIVE, NOT MULTIPLICATIVE.** Eight Gale orbs compounded at
×1.22 each is ×4.9 and a kitten who physically cannot turn a corner on an
island 56 units across; `1 + 0.22n` gives ×2.76, which is fast enough to be the
joke. The check asserts the *shape* — eight orbs must be exactly eight times one
— so a compounding rule fails it however the per-orb number is tuned.

**Clan buffs MULTIPLY with orbs rather than being replaced.** Thunderpaw on
four Gale orbs is ×2.54. That is absurd and correct: the orbs only exist after
100%, the clans are a mid-game choice, and a kid who has done both has earned
the silly number.

### Three moves, and not one new button

Same rule the tournament set. Every one of them is an entry in `ATTACKS` and
goes through `Game.strikePlayers`, which is still the *single* gate that asks
whether the two of them may hurt each other — these are new ways to swing, not
a new damage path. `world-check` asserts all three ask the gate and that with
the tournament off they take nothing off anybody.

**THE WARD IS ON THE DRAGON BUTTON AND THE DRAGON STILL WINS IT.** `mount`
already means "get on the thing next to me". A kitten standing beside a storm
dragon who presses it and gets a bubble reads as the game refusing to let her
fly, and nothing on screen would tell her the orb she is wearing is why. It is
the last `else` in the mount chain, which is nearly always reached, because a
dragon is a place you walk to.

**IT IS HELD, NOT TOGGLED, AND THAT IS THE DIFFERENCE BETWEEN A BLOCK AND AN
INVULNERABILITY.** The first version was press-once-for-three-seconds. Three
seconds is a long time in a fight two nine-year-olds are having, and a shield
that stays up while she does something else is not a decision — it is a state
she is in. Holding costs her the button for as long as she wants the cover.

**`WARD.max` (2s) IS A HARD CAP AND STACKING DOES NOT MOVE IT.** Thumb down or
not, the block ends at two seconds; stacks buy a shorter *wait* instead, which
is the only one of the two numbers that can grow without the shield eventually
being up more than it is down. `world-check` asserts eight orbs leave `max`
untouched and only move `cool`.

**`WARD.tail` — it keeps working for 0.2s after she lets go.** A blow landing
on the exact frame her thumb comes off otherwise reads as the block failing,
and a kid cannot tell that apart from a block that does not work.

**THE WAIT STARTS AT THE RELEASE, AND THE TAIL RUNS INSIDE IT.** Charged from
the press, a 2s block on a 1.5s wait is already back before it has finished;
charged when the tail expires, the gap she feels is 0.2s longer than the number
the profile screen showed her. `_dropWard` is the single exit — all three ways
a block can end (she let go, she hit the cap, her sister traded the orb out of
her hand mid-block) go through it, so the tail and the wait cannot be started
by one path and forgotten by another. All three are checked.

**`force.pierce` — the ward stops blades, not the edge of the world.** Exactly
one caller sets it, `Tournament._updateOut`, and it has to: without it a kitten
wearing the orb parks off the side of the ring and takes nothing for the whole
round, which deletes the ring.

**NO POWER MOVE SURVIVES GETTING ON AN ANIMAL.** `_stepSpecials` only runs in
the ground controller, so a ward popped a frame before mounting a dragon keeps
its three seconds *for ever* — a permanently invincible kitten, produced by a
button press that looks like climbing onto a dragon. `update` clears them, and
so does `resetForRound`: a charge that survives a round reset carries its
committed direction and its zero gravity across the teleport to her post and
flies her off the ring before the gong.

### The Cross Slash holds you. It did not always.

Cloud's, by way of a nine-year-old who has played Smash — it was Sanzan / 三 /
TRIPLE SLASH until the move learned to hold what it catches, at which point it
earned his name for it. **The orb's id is still `tri`**, and so is its entry in
`ATTACKS`: those two strings are in every saved profile and in the dealer's
stock table, and renaming them would silently cost every existing profile its
orb. `world-check` pins the id and the display name separately.

**THE MOVE USED TO BE THREE CUTS AT A CORPSE.** She threw an ordinary slash on
the press; if she was still holding 0.22s later that swing became the first of
three. But the ordinary slash had already *knocked the target away* — so cuts
two and three swung at empty air, and the technique was strictly worse than the
single slash it cost more to throw. Every part of the rework follows from that
one fact.

**A TAP AND A HOLD ARE ALTERNATIVES, NOT A SEQUENCE.** With the orb on, the
swing is thrown on the RELEASE: let go inside `TRIPLE.hold` and the ordinary
slash goes out then, keep holding and the technique starts instead and the
ordinary swing never happens. That is the only shape in which the technique has
anybody left to cut.

**`CROSS.hold` HAS BEEN 0.22, 0.05 AND 0.25, AND ONLY THE MIDDLE ONE WAS NEVER
TESTED IN A HAND.** It started at 0.22 for the old shape, came down to 0.05 with
the release-driven rewrite on the theory that a shorter wait meant a snappier
ordinary slash, and went to 0.25 the first time somebody played it: at 0.05 the
*technique* came out when a kid meant to slash, because three frames is shorter
than a deliberate tap, never mind the grip of somebody mashing. That makes the
ordinary swing the hard one to throw, which is backwards.

The latency argument that justified 0.05 does not survive contact either. **The
swing goes out when she LETS GO**, so a 90ms tap is a 90ms slash — this number
is not a delay anybody pays, it is only how long a hold has to be to mean she
wanted the other move. A kitten with no orb — which is both of them until 100%
mischief — still fires on the frame she presses, and there is a check pinning
exactly that.

**THE CUTS CATCH, THEY DO NOT HIT.** `Player.triCapture` freezes the target
where she stands: gravity off, pad dead, damage banked in `heldDmg` rather than
taken, and `heldBy` set — which makes her untouchable by everybody else,
including her own partner's daze and including the ring-out. Three cuts, a
0.25s pause for effect, and then the whole bill is paid at once and she is
thrown. That pause is Smash's charged bat: a big hit needs a moment of nothing
in front of it.

**THE CAP IS THREE, AND IT IS ASSERTED.** A Juuji stack makes each cut hurt
more, never adds a fourth. A fourth landing would be invisible until the day it
one-shot somebody.

**THE RELEASE IS DRIVEN BY THE HOLDER'S STATE, NOT BY A CALLBACK.**
`Game._updateTripleHolds` asks every frame whether the kitten holding her is
still running the technique. That covers the ending everybody thinks of — three
cuts and the pause — and, for free, every ending nobody does: a holder knocked
out between two cuts, rung out, turned into an angel, or dragged onto a dragon
by `_clearSpecials`. A callback would have been one path per ending and one of
them would have been missed, and the cost of missing one is a kitten frozen in
mid-air with gravity off for the rest of the afternoon. `heldT` is a watchdog
under even that. **Nothing may be stranded** — same rule as the dragons.

**THE LAUNCH IS AN ORDINARY `hurt`.** The percent rule, the knockout test, the
flash, the sound, the damage credit and the invulnerability afterwards are all
already right in there. `_freeTripleHold` hands it a point one unit *behind* the
target along the stored direction, so `hurt`'s own (target − from) throws her
exactly the way the cuts were coming from.

**ALL THREE LANDING BUYS THE BANG.** A procedural burst — three `RingGeometry`
shells on three axes, blooming outward, no billboard needed because a shell has
the same silhouette from all four cameras — plus a screen shake and `smash`, the
one sound in the library bigger than `ko`. Catch her on the last cut only and
you get the throw and nothing else.

### And then four adults played it, and it was too strong

Not a bug — the rework worked. The cuts hold, so the whole technique arrives as
one unavoidable lump, and the only thing between a kitten and that lump was
`CROSS.hold`: a quarter of a second she could spend still walking around. The
counter-play was "stand somewhere else", which is not counter-play.

**`CROSS.wind` IS THE FIX, AND IT IS A SEPARATE NUMBER FROM `hold` ON PURPOSE.**
They look like they want to be one 0.5, and they must not be — they are two
questions asked of the same press. `hold` is *did she mean the other move?*: it
has to stay short and she has to stay MOBILE through it, because every ordinary
slash pays it and a kitten who freezes for half a second whenever she taps
attack has lost the ordinary slash. `wind` is *she meant it, and now she is
committed*: planted, visibly, before anything is thrown. Collapsing them means
either freezing the tap window or shortening the tell, and the tell is the fix.

The whole timeline, at the current numbers:

| from | to | phase | she can | can she be stopped? |
| --- | --- | --- | --- | --- |
| 0 | 0.25 | tap window (`hold`) | walk, jump, and let go for an ordinary slash | letting go = ordinary slash |
| 0.25 | 0.50 | wind-up (`wind`) | nothing — planted | letting go throws it away, and a hit stops it |
| 0.50 | 1.40 | three cuts (`cuts × gap`) | nothing | **only a hit** |
| 1.40 | 1.65 | hang | nothing; everybody caught is still frozen | **only a hit** |
| 1.65 | 2.40 | recovery (`cool`) | walk and jump, not attack or block | — |

**Press to swinging again: 2.40s. Planted and helpless: 1.15s.**

**LETTING GO DURING THE WIND-UP ABORTS, AND IS NOT A CANCEL OF THE TECHNIQUE.**
Nothing has been thrown and nobody caught; she has spent the wind-up planted and
gets nothing back, which is the risk that makes committing mean something. It is
not silent — a button that visibly stops her and then does nothing reads as the
game dropping the input, so it blips `deny` like every other refusal.

**ONCE THE FIRST CUT IS OUT, THE ONLY WAY OUT IS BEING HIT.** No cancelling, no
blocking out of it, no walking out of it. A sister who reads the wind-up and
lands a blade first stops the whole thing — and the kittens already caught are
not forgotten, because nothing in `Player.hurt` has to remember them: `triAt`
goes false and `Game._updateTripleHolds`, which frees on exactly that, pays out
the damage banked so far and launches them for the cuts that did land. Two cuts
in when she is interrupted means two cuts' worth and a throw, immediately. That
is the dividend of driving the release off state rather than a callback.

**`cool` WENT 0.5 → 0.75 IN THE SAME PASS.** Half a second of recovery is under
two of the technique's own cuts, so a kitten who landed one could throw another
before anybody had got up. It now chimes (`crossReady`) when it expires, because
a recovery long enough to matter is long enough to lose track of mid-fight —
watched on its own clock, `triCoolT`, and not read off the other two: the first
attempt paired `attackCooldown` with `triLockT` and could never fire, because
`triLockT` is decremented a block earlier in the same frame and clamped at zero,
so it reliably reached zero one frame first.

**AND THE MOVE SAYS HOW IT WENT.** Four rungs of one kitten's cackle, graded by
how many of the three cuts connected: `cross0` for a whiff — an innocent kitten,
and it sounds weak — up to `cross3`, which is the demon from the trailer. Played
from the launch branch of `_stepSpecials` and nowhere else, which is what makes
"a cancelled technique makes no funny noise" fall out of the structure instead
of out of a flag: every early ending skips that branch without knowing it
exists. The zero-hit case could not live in `_updateTripleHolds` for the same
reason it matters — that loop iterates the kittens who were caught, and on a
whiff there are none. See [voices.md](voices.md) for where the four files come
from and the licensing decision attached to them.

**THE WIND-UP IS DRAWN AS A CROUCH**, deepening as it runs out, using the same
squash-and-stretch as the jump, the landing and the chew. Standing perfectly
still is not a tell; it is what a disconnected pad looks like. The vocabulary
already means "something is about to happen to this cat", and a new pose would
need art nobody drew. **It is not enough on its own** — see the next
section.

### The tell you can see from across the garden

`CROSS.wind` bought a quarter of a second of warning and then spent it on a
crouch. A crouch is the right *pose* and it is not a *signal*: at the distance
the world camera actually sits, a kitten who has gone slightly lower is a kitten
who has gone slightly lower. [systems/crossfx.js](../../src/systems/crossfx.js)
is what that quarter second is for — an aura while she winds up, a seal cut into
the air one stroke per cut, and the whole thing blown apart when she lets go of
what she caught.

**IT IS A POLLER, AND `player.js` HAS NEVER HEARD OF IT.** Same argument
`Game._updateTripleHolds` makes and for the same reason: the technique ends five
ways — released wind-up, interrupted by a blade, round reset, restart, or run to
the end — and a callback is one path per ending with one of them missed. The
effect reads her clocks every frame through one exported function, `sealStage`,
and a `world-check` assertion pins that player.js contains no mention of it, so
a later tidy-up into a hook finds out why not.

**THE WIND-UP HAS TO BE TESTED BEFORE THE SUBTRACTION.** `sealStage` is
`CROSS.cuts - triLeft`, and `triLeft` is zero *before* `_startTriple` runs as
well as after the last cut — so the naive version draws the finished seal, kanji
and all, during the wind-up. The one moment the feature exists for would be the
moment it lies about what is coming. Checked with a counter-example, not just
with the happy path.

**HER COLOUR ON THE GROUND, THE ORB'S IN THE AIR.** Two elements answering two
questions. The aura round her feet is *who is charging, and where* — in a
four-player scrap that is the question the warning exists for, and her colour has
answered it since the first pane border. The seal in the air is *the technique*,
which has had the orb's pink since the orb did. Mixing them would make the
warning ambiguous in exactly the case it matters.

**THE ARCS ARE BROKEN RINGS AND THEY STAY NEAR HER FEET.** A closed ring is
rotationally symmetric, so spinning one is a free frame that looks exactly like
a still one; two 1.45π arcs turning opposite ways are the whole reason it reads
as spinning up rather than as a target reticle. They lift only a little as they
tighten, and the first version's chest-height lift was wrong for the one camera
that matters: the arena's camera is low and side-on, a ground-parallel ring seen
edge-on is a line, and a line at chest height reads as an orange bar through the
middle of her. Near her feet it degrades into the same flattened ellipse the
player marker already draws.

**THE SEAL IS PLACED ONCE, ON THE FIRST CUT, AND THEN HANGS.** It is something
she cut into the air, not a badge pinned to her chest — one that followed her
would slide sideways under her own knockback and read as a UI element. Placed on
the first cut rather than during the wind-up because the wind-up can be released,
and a box drawn around nothing is a promise the game did not keep. For the same
reason a wind-up she let go of ends quietly: an explosion of nothing announces a
Cross Slash that never happened, and the sister who correctly backed off learns
that the warning lies.

Two of the four sides per cut, so one katana stroke closes a readable half of the
box; the third cut draws no side at all and lands the 十 instead, which is the
shape of the whole idea — two cuts build the frame and the third is what the
frame was for. Each side's geometry is shifted so its left end sits at the
origin and the draw-on is `scale.x`, so a stroke grows out of the corner it
starts at instead of swelling out of its own middle.

**THE BURST DIRECTION IS FREE, AND THAT IS THE POINT OF THE GROUP.** The seal
hangs in a `THREE.Group` whose `rotation.y` is her facing, so the group's local
+z *is* the attack direction — the same vector `_freeTripleHold` throws the
bodies along. "Away from the kitten who threw it" is then a positive local z on
every piece: no world maths, and nothing that can disagree with where the bodies
went. It is ticked *after* `_updateTripleHolds` for the same reason, so the seal
comes apart and the victims go flying in one frame rather than two.

**THE 十 IS THE TRAILER'S, RE-DRAWN AT RUNTIME.** `tools/brush-kanji.mjs` says
why it is drawn rather than typed — see [trailer.md](trailer.md) — and this is
the second place the glyph has to carry a frame on its own, which is the exact
condition that file was written for. It is re-rasterised here rather than loaded
as a PNG: ninth non-negotiable, and a 20KB image in `public/` is a file the game
could be deployed without. Canvas2D strokes short round-capped segments along
the same beziers with the same width profiles, which is the union of the same
disks the tool rasterises by hand.

**TWO THINGS ABOUT IT WERE REASONED AND BOTH WERE WRONG.** The house rule earned
its keep twice in one afternoon:

- *The core was a fill, not a spine.* Subtracting 4 from a stroke whose
  half-width peaks at 12 leaves a white core two thirds as wide as the stroke.
  Sampled off the canvas it came out about 30% solid white rows, and on screen
  over a bright green field the whole seal read as a plain white picture frame
  with a pink rim — the technique's colour was not the colour of the thing.
- *The glyph did not fit its own box.* The 520-box coordinates say where the
  centrelines go and say nothing about where the ink ends up; the brush hangs
  outside the end points by whatever the width profile says, and the profile had
  just been multiplied to hold its own against the bars around it. Reasoned from
  the coordinates it looked centred; drawn, it pushed off the left edge of its
  own texture and sat high in the box. It is now painted twice — once to
  measure the alpha bounds, once through a transform that puts *those* in the
  middle — which costs one canvas draw at boot and stays right if anybody
  re-weights a stroke.

**IT DRAWS NOTHING RATHER THAN THROWING WHEN THERE IS NO CANVAS.** The three
textures are built lazily on the first Cross Slash and every one of them can
return null; `_rig` returns null with them and the whole effect becomes a no-op.
`world-check` runs that path with `document` deliberately taken away and asserts
that nothing lands in the scene and nothing throws — prefer a rule that degrades
over one that vanishes.

**THE COST, FOR THE RECORD.** Eleven transparent objects per kitten actually
running the technique, for about a second and a half, and none of them exist
until her first Cross Slash. The game is fill-bound and transparent overdraw is
the expensive kind ([performance.md](performance.md)), so: worst case four
kittens at once is 44, which is a fraction of the petals already drifting, and
zero for a game where nobody has bought the orb.

**ALL OF THESE NUMBERS ARE EDITABLE WITHOUT TOUCHING CODE** — see
[the balance page](#the-balance-page) at the end of this file.

**EVERY CUT OWNS `CROSS.gap`, THE THIRD ONE INCLUDED**, so the cutting takes
`cuts * gap` — 0.9s at the current 0.3, near enough the second it is meant to
be. Starting the hang the instant the last cut lands gives that cut none of the
time the other two got and brings the whole move in a third short. `gap` has
been 0.16 and 0.21 and both were over before a nine-year-old could count three
of anything.

**THE BLOCK IS LOCKED OUT FOR THE WHOLE MOVE AND `CROSS.cool` AFTER IT**, and a
bubble already up is dropped when the technique starts — through `_dropWard`, so
she is charged the ordinary wait and it is not a free cancel. The entire price
of a cross slash is that she is planted and open for about a second; a shield
she can pop on the second cut, or on the frame the launch goes out, refunds that
and makes the move free. `triLockT` is a separate clock from `attackCooldown`
because that one is shared with every ordinary swing, and hanging the lock off
it would kill the bubble for a third of a second after every barrel she cuts.
The refusal toasts — sixth non-negotiable, and this one is invisible otherwise.

**A BLOW MAY ONLY EVER MAKE AN ANIMAL MORE STUNNED.** `Critter.swattable` used
to be `roam` only, so a second swing at a stunned rat fell past it into the PIN,
which `_updateHold` cancelled on the next frame — the blow *woke it up*. It went
unnoticed until three cuts started landing on the same animal inside a second.
`stun()` is now a full reset of the clock and safe to call on something already
down, and `_canHold` refuses while `player.busy`: she is a second into a
committed technique and is not also reaching down to put a paw on a rat.

Measured end to end in the browser: press → 60ms deferred → cuts at 91/302/510ms
→ 27 damage banked, target motionless at the same coordinates throughout → 250ms
hang → launch at 781ms for 27 damage in one payment, screen shake, `smash`.

**A CHARGE IS A VELOCITY, NOT A TARGET**, set flat every frame: fed through the
accelerator it ramps over a third of a second and never gets near
`CHARGE.speed`, so the move looks like a brisk walk. It hands back 35% of that
velocity at the end, or she skates half an island afterwards.

**THE DIVE IS THE DIVE-BOMB `prop.js` ALREADY NAMED.** "Bamboo answers to the
katana and nothing else — not a dive-bomb, not dragon breath" was written
before there was a dive to bomb with, and it is still the rule that makes a
150-cane grove the one place flight and force fail. The charge keeps its blade
out and does cut; a falling body does not. Both are checked.

### The economy is derived from the world, not picked

Every point either kitten will ever have comes from knocking something over,
and the orbs only exist once *everything* has been knocked over — so the whole
economy is a fixed pot. `World.pointsTotal` is summed from the props
themselves: **4550 across 216**. An even split is 2275 each and the brief is
that all of it buys three or four orbs, so `orbPrice = pointsTotal / 2 / 3.5`
= **650**, sell **488** (75%).

That number does more than it looks. Eight types, **one of each lying in the
world**, a stall whose stock is deep only on the four stat orbs, and a wallet
that reaches three is what makes **trading** the way you build a set rather
than an extra you can ignore: there is no amount of playing that buys a stack,
and every second copy of anything has to come off the shelf or out of your
sister's hand.

**EIGHT IN THE WORLD, ONE OF EACH, AND NOTHING STACKABLE BY WALKING.** The
first version scattered sixteen — one of each plus eight spares — so a stack
could be built on foot, and that looked like the generous call. It is the wrong
one: sixteen orbs lying about means two girls can each wander into a full set
without ever speaking to each other, and the interesting object in this feature
is not the orb, it is the sentence "I'll swap you my Ward". Eight keeps every
power *findable* — nothing is locked behind a price a kid might never reach —
while making a second copy of anything something you buy, sell for, or trade
out of your sister's hand.

**The dealer is therefore the only source of a second copy, and his shelf is
where the stacking rule lives** (`stockFor`). Four each of the four *stat* orbs
— Gale, Long Cut, Adamant, Leap, whose whole point is a number going up — and
one each of the four *moves*, where a second copy only widens something she can
already do and the fourth is a slot she could have spent on a verb she has not
got. A deep shelf does not make them cheap: the scarcity is the purse, and a
purse buys three orbs **total** against a stack of four costing 2600.

**Buying and selling back must LOSE money** (checked), or the two of them
bounce one orb off the counter and buy the shelf. **A sold orb goes back on the
shelf**, or they can destroy the world's supply between them — and it makes
selling a spare a 25% fee rather than a mistake you cannot undo, which is the
difference between a shop a nine-year-old will experiment with and one she is
afraid of. Selling is also the only way to get *under* eight slots.

**A pickup a full kitten walks over is LEFT WHERE IT IS and she is told why.**
Deleting it would destroy one of twenty-six because she happened to walk past;
doing nothing reads as a broken collectible. Rate-limited to one toast per three
seconds — the locked stars' rule.

### The dealer's stall came up inside the cherry grove

`findOpenSpot(-16, 58, 5)` returned a spot in the trees and the whole 4.8-unit
stall was invisible behind a canopy. **This is the ice-ward bug again, and it
is easier to hit here than anywhere else in the project**: `findOpenSpot`
measures against a tree's SOLID, which is its trunk at radius 0.9, and what
hides things is the four-unit canopy above it — and this code runs at 100%
mischief on a world that is already fully dressed. The stall now seeds from the
middle of the market street at clearance 8 (which clears a canopy *and* the
market's own four stalls at r 2.0), the orbs at 7, and `world-check` asserts
every one of them has 4 units of clear air. That check caught it first try.

**The stall is turned to `-PI/4`**, the camera's fixed yaw. This game's camera
never rotates, so "the front of a building" is a known direction here — left at
zero the counter is edge-on and the noren, which is the thing that says *shop*,
hangs entirely out of sight behind it.

**It is furniture, not a character, and that is a decision.** Every talking
figure in this game is a generated sprite sheet with a matched recorded voice;
a ninth cat with neither would read as the one placeholder in a finished world.
The eight orbs hovering over the counter **are** the stock — sold out goes dark,
so "he hasn't got a Ward left" is visible from across the plaza.

### The clan is on the card now, and it always technically was

The character profile carried `Riverclaw · 40 pts · 3/8` as one grey 13px line
at 75% opacity — the clan name punctuation-separated from two numbers it has
nothing to do with. It came back as *"the profile doesn't say what clan you're
in"*, which is the correct report about a fact that is technically present. An
oath is the biggest decision in the game outside the ring; it does not belong in
an inventory count.

It has its own row now (`_clanMarkup`), and three decisions in it are worth
keeping:

* **The clan's own `color`, read from the CLANS entry**, so it is the same
  colour as her HUD badge, her shrine and the second marker ring under her paws.
  Written inline as `--clan` for the reason `--seat` is written inline on a
  score badge: a colour copied into the stylesheet is a colour that goes wrong
  in one place.
* **A tinted bar, not coloured text.** Two of the six clans are pale
  (Icewhisker is near-white) and one is dark purple; as text on this panel's
  parchment half of them are unreadable and the other half shout. A low-alpha
  wash behind ink-coloured text, with a solid rule down the leading edge, reads
  the same for all six.
* **It names the buff.** "Longer katana" is what she was choosing between, not
  the word Riverclaw.

**Pandapaw's bamboo counter is deliberately not duplicated here.** It moves
while she plays and it has one home — the HUD badge (`Game._updateClanBadge`).
This screen is opened, read and closed; a second live counter would be a second
place for it to go stale. And **unsworn is an instruction**, not the noun "no
clan": it names the verb and the place, which is the sixth non-negotiable.

`world-check` asserts all six clans by name and colour through the real
`_cardMarkup`, that the panda counter has not leaked onto the card, and — the
one that would have caught the regression this was carved out of — that her
points and orb count are still there after the split.

### The trade screen is the one menu with TWO cursors

`systems/profile.js`, and it deliberately does **not** go through `MenuNav`.
Every other menu merges both pads into one cursor on purpose — one screen, one
cursor, and making player 1 the only one who can press RESUME locks the other
girl out of her own pause menu. A trade is the one surface where that is
exactly wrong: **consent cannot be expressed through a cursor both players are
pushing.** Two cursors, each in that player's own marker colour, and nothing
moves until both have confirmed on their own side.

`MenuNav` is kept off it by listing `panel-profile` **first** in `PANELS` with
no `.menu-btn` inside: it finds the panel, finds no items, and reports that it
does not own the input — so the pause menu underneath does not quietly keep
taking presses. One place, rather than a second copy of "which panel is up".

**Three buttons, one meaning each**: `jump` offer / un-offer, `attack` confirm,
`interact` back out (confirm, then offer, then the screen). A fourth is a fourth
thing to explain to a nine-year-old.

**Moving your offer CLEARS YOUR CONFIRM.** A girl who agreed to swap her Ward
and then moved the highlight to her Gale has not agreed to *that* trade, and
letting the tick survive the change is precisely the forced trade the whole
screen exists to prevent.

**A trade is atomic and checked before anything moves.** Both kittens are at
eight slots more often than not by the time they are trading, so the naive
"give hers to him, give his to her" overflows on the first half and leaves one
of them a copy down with nothing to show for it. Both are removed first;
`world-check` asserts a trade can neither create nor destroy an orb, that a
gift into a full kitten fails *whole*, and that a swap with a full kitten still
works. **Either side may offer nothing** — the older sister handing the younger
one a spare is the single most likely thing to happen at this screen.

**Health is the one stat with a current value as well as a maximum.** Taking a
vigor stack off a kitten at 130/130 must leave her at 100/100, not 130/100; and
putting one on mid-round must not be a free heal. `setPowerOrbs` keeps the
FRACTION. Both wrong answers are things two sisters will produce within a
minute of finding the trade screen.

**EVERY PIECE OF TEXT ON A WORN ORB CANCELS ITS PARENT BEFORE FACING THE
CAMERA.** `mesh.quaternion.copy(camera.quaternion)` is a *local* rotation, and
everything on these orbs hangs off something that turns: `group` carries the
orbit tilt and `orbNode` tumbles on two axes every frame. Copied straight, the
kanji and the `cos θ / sin θ` readout arrive sheared, leaning and rolling once a
second — legible in a still frame and unreadable in motion, which is the worst
way for it to be wrong. **This is the same bug that got the drifting glyphs
deleted from the plain Kotodama Orb** (see the note in `orb.js`); the answer
then was to remove them, and the answer here is to invert the parent's world
rotation first. The parent quaternions are composed by hand rather than read
from `getWorldQuaternion`, because this runs per VIEW *before* the render that
would update the world matrices — `Object3D` keeps `.quaternion` in step with
`.rotation` on assignment, so the two it needs are always live.

**`syncOrbMeshes` rebuilds the worn geometry wholesale rather than patching
it.** Each orb's shell radius, orbit speed and starting phase come from its slot
and from how many she is wearing, so adding a fifth changes where the other four
belong. Eight icosahedrons is nothing; a wrong-looking constellation is not.

## Two things the worn orbs were getting wrong

Both reported from the same play session, both about what the ring around a
kitten LOOKS like rather than what it does.

### The kanji drew through the world

Every quad on a `PowerOrb` carried `depthTest: false`, so the character on each
orb, the katakana rain and the live `cos ... sin ...` readout drew over
everything: through a house, through a dragon, through the kitten wearing them.
The ring passes behind her several times a second and every one of those passes
was drawn in front, which reads as a bug in the sky rather than in a label.

**Turning the test on is only half the fix, and the other half is the half a
tidy-up deletes.** The old comment was defending against something real: the
mark is a 0.4-unit quad pinned to the centre of a sphere whose halo breathes out
to 0.49, so at equal depth the sort flickers the glyph in and out of the ball it
is labelling. Depth testing alone trades a label that ignores the world for a
label that strobes.

So the quad is **moved** instead. `faceCamera` already builds the billboard
rotation, and the quad's own local **+Z is the axis pointing at the viewer** —
so +Z through that same rotation is the direction to the camera expressed in the
parent's frame, which is exactly the frame `position` is in. `MARK_LIFT` 0.62
clears the breathing halo with room to spare and is small enough that the glyph
still reads as sitting ON the ball. No world matrix is consulted, which matters:
this runs per view, before the render that would bring them up to date.

**The rain column's lift may not accumulate.** `faceCamera` runs once per
split-screen pane, so adding to `rain.position` in place would walk the column
off the orb by one lift per pane — invisible at one player and wrong at four.
`_rainAt` holds where it hangs and the lift is added to that copy.
`world-check` measures the lift from two different cameras and then calls
`faceCamera` four times in a row to pin exactly that.

**The plain Kotodama Orb's diagram was deliberately left alone.** That is the
six-unit teaching overlay, not a label on a ball — the unit circle, its arc, its
cosine and sine legs and their three readouts — and it is the thing
non-negotiable 1 is about. It is meant to be read through whatever is in front
of it.

### An offered orb kept wearing her cursor

`.kd-slot.offered` painted the player's own colour underneath the gold ring
unconditionally, so an orb she had put on the trade table went on wearing
Storm's blue after her cursor had walked away from it. Two slots then claim to
be under one cursor, and the one she is actually standing on is the harder of
the two to pick out — the offered orb is bigger and lifted.

`--me` is a **statement about where she is** and may only be drawn where she is;
gold is a statement about the table and stays put. Both together is still the
right picture when both are true, which is what `.kd-slot.offered.cursor` is
for — specificity 0,3,0 so it beats BOTH rules above it, since the plain cursor
rule would otherwise win on a slot that is also offered and drop the gold.

## The balance page

**`npm run dev`, then open `/tuning.html`.** Every ability's numbers, one
sentence each on what they do, sliders and typed boxes, a live timeline of the
Cross Slash that redraws as you drag — and a save button that writes
`src/tuning.json`, which Vite reloads into the running game without a restart.

It exists because answering *"the Cross Slash is too strong"* meant finding six
numbers spread across two entity files, each buried in a paragraph explaining
why it is what it is. Those paragraphs should stay exactly as they are; they are
just the wrong shape for "make the wind-up a bit longer and play it again".

**OVERRIDES ONLY.** `tuning.json` starts as `{}` and holds only what somebody
actually moved. The literal in `powerorb.js` stays the default and stays the
documented one, so emptying the file restores the shipped balance exactly, a
value tuned in the code is never silently overridden by a stale copy of itself,
and a diff of `tuning.json` is a list of what changed. A file holding every
value would fail all three, and the third is the one that bites — *"why did my
edit to `CROSS.gap` do nothing"* is a bad afternoon.

**IT IS JSON AND NOT AN INI**, which is what was asked for. The substance of
that ask — external, hand-editable, read by the code — is exactly this; the
format is JSON because the runtime already parses it (an ini would mean shipping
a parser to read four numbers) and because Vite hot-reloads a JSON import. The
comments an ini would have bought live on the page, where there is room for a
paragraph per field instead of a `;`-line.

**NOTHING IN IT MAY NaN A POSITION.** It is hand-edited, so it will eventually
hold a string, a null, a misspelled key or a table that no longer exists.
`tune()` takes only keys the defaults already have and only finite numbers;
everything else is ignored in silence. A misspelled `"knock"` does nothing,
which is annoying and visible on the page. A merged `undefined` would put a
kitten at NaN and undraw her, three files from the cause. There are fourteen
checks on exactly this.

**THE PAGE CANNOT DRIFT OUT OF AGREEMENT WITH THE GAME**, because no number on
it is a second copy of a number. `tune()` records every table it is handed into
`DEFAULTS` as the entity modules are imported, and the page imports those
modules for that side effect: shipped values come from `DEFAULTS`, live values
from `DEFAULTS` folded with the file. A table that stops calling `tune()` would
silently vanish off the page rather than error, which is how a tuning tool rots
into something nobody trusts — so `world-check` asserts all six are reachable.

**IT ONLY EXISTS UNDER `npm run dev`, TWICE OVER.** `vite build` takes its
inputs from `index.html` and nothing else, so `tuning.html` is not in the bundle
Vercel serves; and the save is a POST to `/__tuning`, a `configureServer` hook
the production build never runs. Either alone would do. Both, because a page
that writes files into the source tree is fine on a laptop and appalling on the
open internet.

**Committing is `git`, deliberately.** There is no push button on the page:

```bash
git add src/tuning.json && git commit -m "Retune the Cross Slash" && git push
```

A web page that runs `git push` is a footgun with a nice font, and the diff is
worth looking at before it goes anywhere.

**A world-check run against a retuned game still passes, and says so.** The
last line of the tuning section reports whether `tuning.json` is empty or how
many tables it is overriding — every check in the run reads the *tuned* values,
and a run that passes while nobody noticed the balance was not the documented
one is a bad afternoon later.
