# The World Martial Arts Tournament

*Design notes, moved verbatim out of the old 4,400-line `HANDOFF.md`. This is
the WHY behind code that already exists — read it when you are about to change
something in this area, not before. Current state and open work live in
[HANDOFF.md](../../HANDOFF.md); the always-on summary is [CLAUDE.md](../../CLAUDE.md).*

*Cross-references saying "above" or "below" may now point at a sibling file in
this folder — see [the index](README.md).*

---

## The World Martial Arts Tournament

The arena the finale promised. Two kittens, a ring, three rounds, and a record
board that outlives the tab.

**IT IS THE FIRST COMBAT IN THE GAME, AND IT IS FENCED OFF FROM THE REST OF
IT.** The whole project has deliberately had no fighting in it — the katana
exists to knock scenery over, and adding enemies was rejected repeatedly for
forking the tone. Nothing about that changed: what changed is that the two
players asked to fight *each other*, which is a different thing from enemies in
the world. So combat exists in exactly one place and at exactly one time.

**`Game.strikePlayers` IS THE ONLY GATE, AND IT IS ONE `if`.** `Player._doSlash`
calls it on every swing in the game — in the market square, in the grove, on a
hillside — and the first line asks `Tournament.fighting`. That property is
deliberately narrow: not "are we at the arena", not "is a tournament running",
but **is a round LIVE this frame**. The countdown is the case that proves why:
without it, a kitten mashing attack through "3 … 2 … 1" opens the round with a
free hit on a sister who cannot move. `world-check` asserts a full-power dash
lands for zero damage with the tournament off.

### Getting there

| rung | what opens it |
| --- | --- |
| 1 | all seven stars found **and** Ryuuseki ridden at least once |
| 2 | thirty seconds later, Mr Satan announces the tournament |
| 3 | pop-in calls at 50 / 60 / 70 / 75% mischief |
| 4 | at **80%**, the arena appears in the sky and he opens it |
| 5 | both kittens stand with him in the town and press interact |

**BOTH HALVES OF RUNG 1 MATTER.** Collecting the seventh star is an achievement
with its own scene and its own dragon; cutting from that straight into an
advertisement for a different feature spends the payoff the whole game has been
building toward. The thirty seconds exist so the flight happens first.
`ArenaQuest` reads `ryu.ridden` every frame rather than hooking the four places
a seat is taken — there are more ways onto that animal than there are lines
that say `this.mount =`.

**THE MISCHIEF LADDER IS THE CHEAPEST THING IN THE FEATURE AND IT CHANGES WHAT
THE COUNTER MEANS.** That number is what the girls have watched all afternoon,
and until now it led nowhere: 100% got an ending, and everything in between got
nothing. Five recorded lines turn the back half of the bar into a countdown.

**Milestones already passed are spent SILENTLY** when the announcement fires. A
pair who reach the dragon at 78% would otherwise get four announcements inside
four seconds — a queue of Mr Satan shouting percentages nobody is at any more.

### The arena is SHUT, and that is four separate facts

The island is 330 units north of the town and 259 from the nearest island —
well past anything a kid reaches by wandering, which is what lets it be a place
you are *taken* to. Before Mr Satan opens it there is nothing out there at all:

- the island mesh is **its own `THREE.Mesh`**, not merged into `terrainMesh`,
  so it can simply not draw. This is the only reason the lock works;
- `heightAt` skips `kind === 'arena'` islands while shut;
- **platforms are a separate list that never consulted an island.** Hiding the
  mesh alone left the ring deck standable — a solid stone square floating in
  empty sky, which is a far worse bug than an arena you can reach early because
  it looks like the world is broken;
- **solids too.** The record board has no `top`, which makes it an *infinite
  cylinder*: it would have shoved a kitten flying past the empty coordinates.

`world-check` asserts all four, shut and open, and that it can be shut again —
which is what `restart` does.

**A BARRIER WOULD HAVE BEEN WORSE.** The obvious lock is a wall you bounce off.
The moment a kid can aim at a place and be refused, the refusal is the thing
she remembers; an island that is not in the sky yet asks no questions.

### The eighth island broke four things that looked nothing like each other

All four were the same mistake: **"the dojo is the last island" written as
`k < islands.length - 1`.** Append anything after the dojo and it inherits the
dojo's exemption while the dojo loses it.

- the tree scatter would have forested the unit circle;
- so would the ground detail;
- the crate loop would have put **knockable props inside the arena** — and
  since the tournament unlocks at 80% of `mischiefTotal`, that is a crate you
  need in order to open the place it is standing in. The 100% ending has the
  same circularity;
- `placeDragonBalls` reads `ISLAND_LOCKS[i] ?? 'none'`, so island 7 would have
  got a free **eighth star** lying in the open: the hunt reads 7/7 with one
  still on the ground and Ryuuseki — who is what opens the arena — can never be
  summoned.

Islands carry a `kind` now (`null`, `'dojo'`, `'arena'`) and every one of those
loops asks it. `dojoIsland` is found by kind rather than by index.

**`questIslands` IS NOT "ISLANDS WITHOUT A KIND", and getting that wrong moved
the 7★.** The dojo is a built place like the arena and is skipped by the
scatters for that reason — but it carries a star and is very much part of the
adventure. "Is this island special" and "does this island hold a star" are two
different questions; writing the filter as `!i.kind` looked tidy and quietly
took the star off the maths island. It is `kind !== 'arena'`.

**Two more things the distance broke.** `_worldBounds` sizes the finale's
pull-back off every island, and an island 330 units north nearly doubled it —
the town they had just flattened became four pixels. The arena is excluded:
it is somewhere else, built by somebody else, and shut when that scene plays.
And `_buildDistantScenery` rings the **origin** at 620–1320 units, so a
silhouette 620 out is only 290 from the arena: one of them hung over the
announcer's box looking like a piece of the venue that had come loose. Any that
crowd the arena are dropped.

### The ring

56 units square, on a stepped plinth 2.4 up, registered as a **platform** so
every piece of ground physics the game already has works on it untouched.

**THE BOUNDARY IS PAINTED BECAUSE IT IS A RULE.** `ARENA_OUT` (1.1) is what the
game measures and the vermillion frame sits on the same number, so what she can
see is what is enforced. It is a little over one player radius, because a
fighter is a *point* and a bare edge test fires while she is visibly still
standing on stone.

**Out is a CHEBYSHEV distance, not a radial one.** The deck is a square; a
radial test calls the corners out while she is on stone, and the corners are
exactly where a knockback puts you.

**A RING-OUT HURTS RATHER THAN ENDING THE ROUND, and this is the biggest
balance call in the feature.** Falling off is the loss condition in both Smash
and the DBZ tournament, and it is the more exciting rule — but this game
already has health bars, and two loss conditions where one is instant means a
kid watching her sister's bar can still lose in a frame she did not understand.
One currency, one bar, one way to lose. The ring still matters because 30 is a
third of it, there is a **half-second grace** so a clipped corner does not
fire, and she is thrown back to the **middle** rather than to her post — her
post is on one side of a square and she went off some other edge.

**The warning goes on her FEET.** `nearEdge` lights inside the last few units
and the rule fires at the line; the gap between them is the whole point,
because a penalty with no build-up reads as the game taking health for no
reason. Her own colour ring is what a player already uses to find herself in a
scrap, so flashing *that* needs no new object and no new place to look. It
**saves the colour on the way in** — that ring is also the clan badge, and
reconstructing it as "her player colour" would strip a Thunderpaw kitten's
green the first time she backed toward the edge.

### Three attacks, and not one new button

```
standing slash   10 dmg, knock  9     always available
sprint + slash   15 dmg, knock 19     the throw — this is how you ring somebody out
jump + slash     14 dmg, knock 13     the damage, and the hardest to land
```

Two kids who have spent an afternoon knocking over barrels already know all
three, so the tournament teaches a *game* rather than a control scheme — and
the one that hits hardest costs the most to set up, which is as much depth as
this needs. The kind is read from the pad **at the moment of the press**:
`onGround` changes further down the same function, so asking afterwards turns
the aerial she actually threw into a standing slash on the frame she lands.

**KNOCKBACK MUST NOT BE BRAKED, AND THE ORDINARY CONTROLLER BRAKES IT.** Hit
stun hands her a dead pad — the same trick the star pose uses — which makes
`target` zero, and the movement code reads a zero target as *stop*, decelerating
at `ACCEL` (60/s). That erased a 19-unit throw in about a third of a second,
which is shorter than the stun itself: every blow landed, every bar moved, and
nobody ever went anywhere. During the stun the movement accel is skipped
entirely and the throw decays on its own drag. Gravity is untouched.

**Rage, borrowed from Smash:** knockback grows as she loses health, capped at
1.6x. It is what makes a long round start throwing people around and the ring's
edge stop being decoration.

**Invulnerability (0.55s) is what stops a fast blade chain-locking a
nine-year-old.** `hurt` returns the damage actually dealt so a hit eaten by
i-frames does not score.

### How far a blade reaches, in front and above

Two separate questions, asked one after the other in `Game.strikePlayers`, and
only the first one was ever thought about.

**In front.** `Math.hypot(dx, dz)` against `A.reach * clanK`, where `clanK` is
`_reach() / BASE_REACH` — the kitten's real reach folding in Riverclaw's buff
*and* the Long Cut orb stack, divided back out so it scales the per-attack
reaches in `ATTACKS`. `BASE_REACH` exists because the literal 3.4 was written
in three places that had to agree and one of them was in another file.

**Above and below.** `Math.abs(dy)` against `COMBAT.strikeHeight`, and this was
the literal **4.5** — a column nine metres tall. A kitten standing on the arena
floor could cut one who had double-jumped clean over her head, and the girl in
the air has no way to read that as anything but being hit from nowhere.
Reported from play as *"the katana hits players from pretty high up"*. It is
**2.25** now, which is the ask ("at least half as big") and the only answer
defensible without a play session behind it — so it is a knob on
`/tuning.html`, because the right value is a thing you find by playing.

**The vertical window is deliberately NOT scaled by `clanK`.** Riverclaw's blade
is *longer*, not *taller*: a reach buff is a statement about how far in front of
her the arc goes. Letting it grow the height as well would hand the one clan
that already out-reaches you the ability to reach up too — an asymmetry the
round card cannot show, which is the whole reason the round card shows the
badges at all.

**And `strikeHeight` is not `lift`.** `lift` is how far a hit throws her *up*;
this is how far apart they may be for it to land at all. They were never
related, the resemblance is a trap, and the balance page's own row says so.

### The drawn arc IS the hitbox, and for a while it was not

`Player.slash` is scaled by `_reach() / BASE_REACH` — one accessor, so the
picture and the hit test cannot disagree by construction.

It used to read `clan?.buff?.reach` **directly**. So Riverclaw grew the arc and
the **Long Cut orbs, which multiply the same hitbox and stack, did not**: a
kitten wearing three of them swung a normal-looking arc and hit you from a metre
and a half outside it. The girl being hit reads that as the game cheating rather
than as her sister having earned something, which is the same failure the round
card exists to prevent, arrived at from the drawing side.

Worth recording how it survived: `_doSlash`'s own comment already claimed *"the
drawn arc grows with both"*, and `world-check` already said *"...and the drawn
arc is derived from the same number"* — a check that asserted `_reach()` folds
the orbs in (true) and then made a claim about a line of code it never looked
at. **A check that describes a second thing it does not measure is worse than no
check**, because it spends the credit. It now drives the real feedback pass and
reads the mesh scale off `slash`, over five configurations, as a *ratio* against
`_reach()` — so it cannot be satisfied by a second formula that happens to agree
at one point, which is exactly what the old direct read was.

### Telling her what happened, with no new art

**THE OBVIOUS ANSWER IS TO GENERATE HURT AND KO ROWS, AND IT IS THE WRONG ONE.**
Both live kitten sheets are 4×8-or-10 turnarounds whose rows have to agree about
which way the character turns, and one of the two sheets in this project is
already unusable because its rows *don't* (`frost_grid_v2`). Regenerating either
to add rows risks the direction mapping that every sprite check in `world-check`
exists to protect — to buy two poses the material can express anyway. So all
three states are transforms of the drawn cell:

- **hit** — a flash *brighter than white*. `toneMapped: false` means the colour
  goes straight through, so pushing red past 1 blows the sprite out; a tint at
  these sizes is invisible. Plus a recoil lean away from the blow.
- **invulnerable** — a **hard flicker**, not a fade. Fading is the natural reach
  and it cannot work: the material runs `alphaTest: 0.35`, so any opacity under
  that discards every pixel at once and she does not fade, she vanishes in one
  step. Toggling visibility is honest about what the material can do and is the
  convention every game a kid has played already uses.
- **knocked out** — laid flat with the **jump** row (the one pose with the limbs
  away from the body; an idle cell rotated 90° reads as a cat standing on a
  wall), darkened, falling the way the blow threw her.

**The health bar over her head had to be turned, and with a full quaternion.**
It is parented to `group`, which never rotates, so it stayed facing +Z: from
this game's fixed −π/4 camera every bar rendered as a thin diagonal streak,
which reads as a rendering fault rather than as a health bar. A *yaw-only* turn
is not enough either — that is right for a character standing on the ground and
wrong for a strip of UI, which the fight camera's downward pitch foreshortens
to about half its height.

**And it is over her head as well as in the corner.** In split screen each girl
reads her own corner fine; what neither can read is the *other* kitten's health,
which is the number that decides whether to press the attack or back off.

**The fill shrinks from the LEFT EDGE.** A plane scaled on x contracts toward
its own origin, so a centred bar eats itself from both ends and shows half the
damage it has taken. It is parented to a pivot at the left end.

### Rounds

**A ROUND NO LONGER OPENS WITH TWO FULL BARS.** Everything below still holds,
but what each kitten starts a round with is now decided by the fifteen seconds
before it — see *Ring snacks and the feast between rounds*.

Best of three: `WINS_NEEDED` 2, `MAX_ROUNDS` 3. **Not three rounds played.** A
dead third round after a 2-0 is worse than it sounds — the girls have been told
who won, and the card that opens it says "everything comes down to this one",
which by then is a lie. The third round happens only at one apiece, which is
exactly when that line is true.

**ROUND STARTS ARE A BANNER, NOT A CUTSCENE.** The thing the screen most needs
to show at that moment is the two of them standing on opposite sides of a ring,
which a full-screen dialogue box is precisely in the way of. Both fighters are
posted facing each other and frozen — `Tournament.frozen` swaps in a dead pad
from `Game`, so none of the three movement modes has to learn a tournament
exists. Only the **opening** and the **result** take the screen, and both are
about something other than the fight.

**A ROUND CANNOT RUN FOREVER.** Two bored kittens, or one sitting on the
announcer's box, would otherwise hold the tournament open with no way out but
the pause menu. At `ROUND_LIMIT` (120s) whoever has dealt the most damage takes
it, and an exact tie is a draw.

**A whole tournament can be a draw** — three rounds with one timed out level on
damage. Nobody signs the board, and it says so out loud rather than silently
crowning player 1.

**THE RING NEEDS ITS OWN CAMERA RIG.** The merged camera clamps at
`26 + separation * 0.85` capped at **52**, written for two kittens in a town —
against a deck 56 across and a diagonal of 79. At full spread it framed rather
less than half the ring with one fighter off screen. Exactly the trap Ryuuseki
fell into (a 28-unit dragon framed from a 26-unit minimum) and the same fix: a
rig that knows how big its subject is, 52–104 units, pulled 42% toward the
ring's centre so two fighters in one corner do not point the camera at the
island outside. **Flatter, too** (0.52 against the walking camera's 0.66): a
steep pitch fills the screen with empty stone *and* squashes billboards, which
is the same reason the grotto camera could not simply tilt over a wall.

**A round is one screen**, outranking "always split" exactly as the dojo and a
crewed Ryuuseki do. It is the one moment in the game where both players are
looking at the same thing.

### The furniture is placed against the CAMERA, not against the ring

This game's camera yaw is fixed at −π/4 and only ever changes distance — that
is what keeps the billboards seen from the angle they were drawn for, and it
means the camera is **always at −x/+z of what it is watching**. So anything
built at +z of the ring is permanently between the players and the lens.

The announcer's box was there first, and a six-unit pagoda roof parked across
the middle of the deck is a roof across the middle of every round. North for
the announcer (he reads as a backdrop over the ring, which is where a
commentator belongs), west for the record board, and the **entrance keeps the
south** — a torii you walk in through is the one thing that earns being in the
foreground. `world-check` asserts both.

It was also *inside* the seating ring at first, at `ARENA_RING + 19`, so the
stands swallowed its walls and all that was left was the roof. An announcer has
to be visibly above the fight and clearly not in it: close and raised, not far
back and tall.

### The griffin

**IT IS NOT A MOUNT, AND THAT IS THE DESIGN.** Every other animal here is
something you climb onto and steer. If the girls could fly themselves north,
"the arena is shut" would have to be a wall. Being *carried* means the question
never comes up — there is nowhere to go until somebody takes you.

It also solves a two-player problem the dragons never had: the tournament needs
**both** kittens there, together, at the same moment. Two independently flown
dragons arrive whenever they arrive, and one girl alone in a ring waiting for
her sister to find north is the worst possible opening for the best thing in
the game.

8 seconds, skippable on the same keys and the same button as every scene
(`SKIP_KEYS` and `_skipPressed`, routed through `_skipScene`). A fly-through is
worth watching once; by the third tournament of an afternoon it is a loading
screen with a griffin on it.

**Both riders were invisible for the whole first flight.** Two things, and it
needed both: the seats were 0.02 apart — the same point to within half a kitten,
so the depth sort picked one — and neither had the **outward nudge** that
`Player.faceCamera` gives a mount. `carried` is that flag. It is deliberately
not `mount`, which everything in the game reads as "is steering a flying thing",
and it is cleared on landing or `faceCamera` keeps nudging her sideways for the
rest of the game.

**A missing griffin must not strand them.** The arena is 330 units from
anywhere and the ride is the only way in or out. With an early `return` on a
failed sprite load, a pair who reached the tournament could never leave — the
results screen would send them home and nothing would happen, forever. A lost
sprite costs the fly-through and nothing else: `_ride` puts them down directly.

### The record board

**THE ONLY PERSISTENT THING IN THE PROJECT.** Everything else is gone when the
tab closes — the clan, the panda, the stars — and that is right for a world you
are meant to knock over again. A tournament win is the one thing the girls do
that is a *result* rather than a state, and a result nobody can look up next
Saturday is a result that did not happen. `localStorage`, so it is per-browser
and per-origin exactly like the controller calibration.

```
score = wins x 1000            winning dominates; a 2-1 loser never outranks a winner
      + damage dealt x 2
      + max(0, 600 - seconds x 4)      a bonus that runs out, never a penalty
      + damage avoided x 3             weighted above damage dealt: it is the harder one
```

`world-check` asserts each term can actually move the total and that winning
outweighs any of them — a weight too small to change the ordering is a term
that is in the formula and not in the game.

**The board is validated on the way IN, not trusted.** It is the one thing that
can be sitting in storage in a shape this build never wrote: an older version, a
half-finished write, somebody poking at devtools. A board that throws takes the
results screen down at the exact moment somebody has just won. Junk rows are
dropped and good ones kept.

**RESTART DOES NOT CLEAR IT.** Putting some barrels back up must not throw away
every tournament they have ever won.

**The name entry is the arcade layout, not a text field.** An `<input>` needs a
keyboard, and the whole point of the controller work in this project is that two
kids on two Joy-Cons never reach for the laptop. Up/down changes the letter,
left/right moves — and **right off the end grows the name** up to five, which is
how you get four or five letters without a separate control for it. Left off the
front does nothing rather than wrapping, which would put the cursor at the far
end of a name she is halfway through. **Either player drives it**, like the pause
menu: the winner types her own name and this screen cannot know which pad she is
holding.

### Mr Satan

**HE IS THE ONLY VOICE IN THE GAME THAT IS NOT SINCERE.** Patchfur narrates, the
six leaders introduce themselves, Ryuuseki pronounces — all of them mean it. He
is a showman selling tickets, and the tonal gap is what makes the tournament
feel like a different kind of thing from the story the rest of the game tells.
It is also cover: a game for a nine-year-old about her and her sister hitting
each other needs the person proposing it to be ridiculous.

Seventeen ElevenLabs lines through the Higgsfield `text2speech_v2` model,
preset voice **Harrison** — the only male voice in a cast of seven women, which
is most of why he lands as a different thread the moment he opens his mouth.
**That voice is the knob** if he ever sounds wrong.

**He is not a `ClanLeader`,** though he is built the same way: that class is
welded to a clan, a shrine, a dais and an oath and he has none of the four. What
he *does* share is the speech bubble, imported rather than reimplemented — a
character speaking to you in the world should look the same doing it whoever
they are.

**MOST OF WHAT HE SAYS IS NOT WORTH A CUTSCENE.** He calls the tournament five
times on the way to 80%, announces each round, and shouts when somebody goes
down; every one of those through the full-screen furniture would be eleven
interruptions to a game about knocking things over. `Announcer` is a pop-in card
that **never takes the input** — the girls keep playing straight through, which
is the whole difference between it and a scene, and why `_sceneActive` knows
nothing about it. Lines are **queued rather than interrupting**: a dragon
strafing a market street can cross 70, 75 and 80% inside four seconds, and
cutting him off mid-word three times is worse than hearing him three times.

His two full-screen moments reuse `SummonScene` rather than adding a fourth
scene class — it already has beats, preloaded voice, the portrait box, the skip
rules and the HUD hiding. **Its `load()` now derives the line list from
`SCRIPTS` instead of naming three scripts by hand**, which is what would
otherwise have silently skipped his five: the scenes would still play, on their
authored durations, cutting every line off mid-word, and nothing would report it.

**His shots are about the PLACE, not about him.** He is a flat billboard and
there is no framing of one that carries three beats — so the camera does what he
is actually doing: the announcement circles the town he is telling them to
flatten, the opening circles the arena that has just appeared. He speaks from
the portrait box over the top, which is the same rule the finale established:
the portrait earns its space exactly when the speaker is the one thing *not* on
screen.

**The door asks for BOTH of them**, and says so when only one turns up. A prompt
that simply does not appear is indistinguishable from a broken one.

### He shipped with holes in his face, and SIZE is why

He arrived with the world showing through the whites of his eyes and through
his mouth. Nothing was wrong with the drawing — `public/sprites/leader_satan.png`
is clean — and nothing was wrong with him: the loader ate them.

`clearSealedPockets` in `spritesheet.js` exists because the border flood has one
blind spot by construction, **background the lineart completely encloses**:
Ryuuseki's whiskers meet his jaw and seal a pocket under his chin, and the
griffin's wing seals one against its flank. The rule for telling those from
drawn white art was **pure AND big**, measured on the one sheet that had the
problem, where it looked decisive — the chin pockets were thousands of pixels of
254,254,254 and the dragon's teeth were 190.

Then a character arrived who is **drawn grinning**. Measured on his sheet after
the flood:

```
  mouth / lower teeth   1155 px   depth 53      <- DRAWN
  upper teeth            621 px   depth 49      <- DRAWN
  eye white (left)       609 px   depth 70      <- DRAWN
  eye white (right)      347 px   depth 36      <- DRAWN, survived on size alone
```

Three of the four cleared the size floor and went transparent.

**SIZE CANNOT SEPARATE THESE, and not by a hair either — it is the wrong way
round.** As a fraction of its own sheet his mouth is 0.0011, *larger* than
either pocket the rule was built for (0.00092 and 0.0006). There is no floor
that clears the dragon's chin and spares the champion's teeth. Retuning the
number would have moved the bug rather than fixed it, which is exactly the trap
the `TAIL` note further up describes.

**DEPTH separates them, because depth is what they ARE.** A sealed background
pocket is *outdoors*, pinched shut by a hairline — a whisker crossing a jaw, a
wing meeting a flank — so it sits a handful of pixels from real transparency. An
eye is *indoors*, behind a whole head:

```
  ryuuseki  chin pockets    depth 12,  8   <- background
  griffin   under a wing    depth  3       <- background
  satan     face            depth 36 .. 70 <- drawn
```

Six times the separation, and structural rather than lucky. `nearOutsideMask`
is a bounded multi-source BFS out from the keyed-out background; a pocket is
only cleared if it **touches** that band. The bound scales with the sheet
(`POCKET_DEPTH_FRAC`, 2.5% of the short side) because a hairline is a couple of
strokes wide and a stroke scales with the drawing. All three tests are kept —
purity rejects drawn off-whites, size rejects flecks in the lineart, depth
rejects faces.

**`world-check` runs the real removal over the three real sheets**, which needed
a PNG decoder with no DOM and no GPU (`tools/png.mjs`, zlib and a defilter loop,
8-bit non-interlaced only — it throws rather than guessing). A synthetic fixture
would only have proved the rule is self-consistent with itself. What makes the
check bite is asserting the count that *would* have been eaten: three white
features on his sheet clear the size floor and **none** may be removed, against
two on Ryuuseki's and one on the griffin's that **all** must be. Go back to size
alone and it fails there instead of in front of a nine-year-old.

**The lesson generalises past this file.** Both of the original tests were
measured, both were real, and the pair was still a coincidence of the one sheet
they were measured on — a discriminator tuned on a single example is a
description of that example. Ask what the two things *are* before asking how big
they are.

### He has had enough of your kitty shenanigans

`systems/satanblast.js`. Climb onto the announcer's box during a tournament and
the World Champion notices you. He taunts — *"you think you are TOUGH, huh?"* —
gives you **ten seconds**, announces that he has had enough, raises his arms,
gathers a ball of light at his chest for one second, and detonates. Everybody up
there with him leaves over the horizon.

**Nobody is hurt and nothing is lost, and that is the whole licence to have it.**
Not one point of damage, no knockout, no score, no ring-out. It is a gag with a
ten-second fuse and it can exist precisely because it takes nothing away from
anybody, which is the fourth non-negotiable read as a design rule rather than as
a bug report.

**It never goes near `strikePlayers`.** The third non-negotiable says that gate
asks one question and stays the only way a kitten can be harmed. This system
never asks it, never calls `hurt`, and calls `Player.blast` — *a push with no
damage argument to pass*, so it cannot grow one later without somebody editing
the signature. `world-check` greps the file for both.

**The ten seconds are not cancellable and running away does not stop it.** He is
funnier when he goes off behind you; a promise the game made is one it then
keeps whatever you do; and a fuse a child can put out by walking backwards is a
fuse she will never watch burn.

#### Why it cannot decide a round — which took two goes to actually be true

The safety argument is the whole feature, and the first version of it was
*nearly* right, twice.

**First try: a sphere.** The booth stands eight units north of the ring's north
edge and its deck is four units higher, so a fighter *on the deck* is out of
range on height alone — true, and it stops being true the moment she jumps. One
hop near the north edge puts her level with him and inside a 14-unit blast, and
being thrown north out of a live round is exactly the outcome this must never
produce. So `_reaches` asks a third question — **`World.arenaOutBy`**, the same
square the ring-out rule measures on, so the two cannot drift apart.

**Second try: "she is already outside the square, so nothing changes."** Also
nearly right, and this one the *browser* caught rather than a check. Outside the
fighting square is not the same as already being penalised: a kitten standing on
the announcer's box is outside it and safely **above** the deck, so `_updateOut`
is charging her nothing — until the explosion throws her off and she comes down
below the floor, at which point that rule takes **thirty health and a point**.
Measured, not deduced: she left with 100 and landed in the middle of the ring
with 70. A gag that promises to cost nothing does not do that.

The fix is `Player.blastT`, and its shape is the interesting part. The obvious
move — *exempt her from the ring-out rule* — does not work twice over:

- **Skipping her outright** (`continue`, the way `p.angel` and `p.heldBy` do)
  leaves her standing outside the ring with the rule waiting for the flag to
  expire, so she is rung out four seconds late instead of on time. Same penalty,
  arriving too late to be understood.
- **Clearing the flag when she lands** clears it on the very frame `down`
  becomes true — which is the frame the rule charges her. The exemption is gone
  one line before the thing that reads it.

What she wants is not to be skipped, it is to be **picked up for free** — and
`_updateOut` already knows how to do that, because that is what it does during
the feast. So the flag makes the price **zero for that player**, she gets the
feast's deal (back in the middle, nothing said, no banner, no health), and being
picked up is what spends the flag. `_catchFallers` spends it too, and six
seconds is a ceiling for the flight nothing catches at all.

`world-check` pins all of it, and pins the *premise* first: that the ring-out
rule really does bite where the blast throws her. Without that line the rest
would keep passing after the feature was deleted.

#### The drawing, and the second pose

Two shells and a ground ring, expanding on a hard ease-out — most of the radius
is spent in the first third, because an explosion that grows linearly reads as a
balloon. The wind-up is a separate mesh from the blast for the same reason it is
a separate idea: they already differ (one gathers, one expands), and sharing
three meshes between them is a pile of flags waiting to happen.

**Mr Satan gets a second drawing** — arms up, charging — generated the same way
the first one was. It is a **request, not a requirement**: with
`satan_charge.png` absent he stands in his ordinary pose, the ball still
gathers, the explosion still goes off and the joke still lands. Ninth
non-negotiable.

**It was generated twice.** The first one had a golden flame aura, which is
lovely and which `poseQuad` would have punished: that function matches poses on
**ink area**, so an aura several times the cat's own ink would have made him
visibly shrink at the instant he raised his arms. The glow is the procedural
charge ball instead — which is where it belonged anyway, because the ball is the
thing that has to animate.

#### Seeing through the arena

Two complaints, one shader. Mr Satan and anybody on his box are behind a pagoda
roof, and fighters get lost behind the corner posts. Both are now cut by the
same world-space x-ray the grottos use — `buildArena` sorts the corner posts and
the whole announcer's box into a second merged mesh, and `openArena` shows and
hides it with everything else.

**It found a four-player bug on the way in.** The material's cut list was
`MAX = 2`, written when two was the whole game — so kittens three and four were
never cut for, in the grottos either. It is four now, and the two-player result
is bit-identical because unused slots arrive with `uCutOn` at zero and `continue`
on the loop's first line.

#### Looking at it without playing for ten seconds

**`2`** in the debug panel skips the fuse: it calls `SatanBlast.provoke`, which
is one line calling the real `_shout`, so what is on screen is the actual
sequence rather than a debug imitation that can drift from it. It refuses out
loud when the arena is shut, and says which key opens it.

`world-check` also asks, generally, that **every** key `_debugKey` answers to has
a row in the panel and a label to print it with. The panel is the only
documentation those keys have; one that is handled but not listed is one nobody
will ever press.

---

## Ring snacks and the feast between rounds

`entities/critter.js`, `systems/menagerie.js`, `entities/angel.js`, plus a new
`feast` state in `tournament.js`. Two features that arrived together because
they are one: a health bar you can refill, and fifteen seconds in which to
refill it.

**THE TOURNAMENT NEEDED A REASON FOR THE GAP BETWEEN ROUNDS.** Rounds used to
be self-contained — a knockout, a three-second hold, both bars back to full —
and the loser spent that hold watching a banner. Both halves of this feature
attack that: the survivor now *carries her damage into the next round*, so the
gap is when she does something about it, and the kitten who was knocked out
spends it flying around as an angel instead of watching.

### One verb, three difficulties

```
hit it        it STOPS DEAD, stunned (a bird goes in your mouth instead)
stand by it   hold attack for two seconds
eat

rat      slowest (8.2), always on the floor        easiest   +10
rabbit   fast (9.0), airborne half the time        harder    +15
bird     overhead (9.4), then a 5-second fuse      hardest   +20
```

**THE SWING IS THE CATCH, AND THAT IS A CORRECTION.** The first version had
three different ways in — a rat grabbed off the floor, a rabbit knocked out of
its hop, a bird taken out of the air — and it shipped with the *easiest* animal
uncatchable. A rat flees at 8.2 against a 10.5 walk, so closing to a 3.4 grab
radius meant cornering something that runs the moment you are near enough to
try; the animal that exists to teach the whole mechanic was the one the katana
could not touch. Three separate verbs also meant working out which animal
wanted which before any of them worked at all.

So a swing that reaches any of them stops it, and **the difficulty lives in how
hard the swing is to land** rather than in what the button does — which is the
tournament's own principle, where the three attacks are three things she
already does. `world-check` asserts `swattable` is true for all three and that
the rat stays the slowest thing on the deck, because if the easiest animal
stopped being the cheapest the whole ladder would invert.

**The grab survives underneath it.** Walking into a grounded animal and
pressing attack still pins it outright, no stun step — `Menagerie.strike`
checks the pin *first*. That is the fast path for anyone who gets close.

**...BUT ONLY WHEN SHE COULD ACTUALLY HOLD IT, and that is the fix for "it
stunned the rat once and then never again".** The pin is searched first and it
reaches `CATCH_RADIUS` (3.4), which is *exactly* the katana's reach — so a
kitten **chasing** an animal, which is the only way anybody ever meets one, had
every swing spent on a pin, and `_updateHold` then cancelled it on the very
next frame for moving (`STILL_SPEED` 3.0) or for being in the air. Nothing was
stunned, nothing was held, the animal bolted, and the swing did nothing you
could see. It worked the first time only because a first swing tends to be
thrown standing still at range, which is the one case that fell through to the
stun.

`Menagerie._canHold` is asked before the pin is offered **and** every frame to
keep one, so the two answers cannot drift apart again — the bug was two copies
of that rule with one frame between them. Standing over an animal still takes
it outright; everyone else now stuns it and walks up, which is also how it
reads. Deliberately *not* part of it: whether the attack button is still down.
At the instant she swings she has just pressed the thing.

**A stunned animal says what to do next, once per kitten per tournament.** The
first time a nine-year-old lands this she has a rat frozen in front of her and
no reason to know the hold exists. Once, because after that it is noise.

### The meal is its own drawing

`Player.setEatArt`, `ember_eat.png` / `frost_eat.png`. She crouches down facing
the viewer, hunched over, both paws up at her mouth, eyes squeezed shut, and
the animal sits on the ground in front of her going bug-eyed.

**A SEPARATE SINGLE CELL, NOT A ROW ON HER TURNAROUND SHEET.** Same decision
the hit and KO states made and for the same reason — both live kitten sheets
are 4-row turnarounds whose rows have to agree about which way the character
turns, one of the two in this project is already unusable because its rows
don't, and every sprite-direction check in `world-check` measures real cells out
of them. `cols: 1, rows: 1, mirror: false` is the clan leaders' combination and
the only one that can never flip or pick another cell.

**The difference from the hit and KO states is that this one really did need
new art**, and it is worth being clear about why the "no new art" rule does not
apply. Being hit is a flash and a lean; being knocked out is the jump row
rotated flat. Both are things the *material* can express. "Hunched over eating
with both paws" is a pose, and there is no transform of a standing cat that
produces one.

**Generated against a REFERENCE CROP of the kitten's own idle cell**, uploaded
as an image input rather than described in words. Ember is an orange tabby in a
blue kimono with a brown shoulder guard and a woven tan belt, and a prompt that
tries to say all of that gets a cat that is *nearly* her — which on a character
a nine-year-old drew is worse than no pose at all. `tools/` has no script for
the crop; it was 15 lines of System.Drawing against cell (0,0) of each sheet.

**She is drawn SHORTER than she stands** (`EAT_CROUCH`, 0.86). `contentScale`
normally makes the drawn figure exactly `height` tall, which is right for every
standing pose and wrong for this one: a squatting cat drawn to a standing cat's
height is a cat that got bigger in order to crouch.

**The animal goes between her and the CAMERA, not along her facing.** She turns
head-on for the whole meal, so a snack placed along `facing` — which is what
`_updatePinned` did — sits behind her from the one angle anybody is watching
from. It uses `camYaw`; the arena is always drawn merged, so there is exactly
one of those.

**The swap happens at the END of `_updateFeedback`**, after every other branch
has had its say about the ordinary sprite, so exactly one place decides which
of the two drawings is on screen. Colour and opacity are copied across so a hit
flash landing on the frame the meal is interrupted carries onto the pose
instead of popping.

**The rabbit hops twice as high as it first did** — and hop height is `v²/2g`,
so that is the launch times **root two** (8.4 → 11.88), not times two. 2.94
units, most of a kitten. It is bounded at the top by the vertical window
`strike` allows (6.5) or the rabbit would stop being catchable rather than
becoming harder to catch, and `world-check` checks both ends.

**AND IT RUNS BETWEEN THE HOPS.** It used to move *only* by hopping, which was
wrong twice over: the only rabbit drawing was the mid-leap one, so the animal
was permanently frozen in a jump pose whether it was airborne or sitting on the
floor (that reads as a broken sprite, not as a rabbit), and a creature that is
airborne on a fixed cadence is a metronome you can set your watch by. It
scampers along the ground like the rat now and bursts into a hop every so
often, which also gives the hop back its job: being in the air is what makes it
un-pinnable, so a leap is an evasion the animal chooses rather than the way it
gets about.

```
chased   0.7-1.4s on the ground  ->  a hop every ~2s, about half air
calm     2.9-5.8s on the ground  ->  a hop every ~5s, about a fifth
```

Both intervals are re-rolled with 100% jitter every time, so the beat can never
be counted. Two things about those numbers are load-bearing and both were got
wrong first:

- **It has to RUN more than it hops.** At a chased gap of 0.35 it was airborne
  two thirds of the time and read as a bouncing ball rather than as an animal
  running away that occasionally leaps — and the ground drawing, the whole
  reason there are two, barely appeared.
- **Being frightened cuts a PENDING CALM timer short, and the threshold is the
  scared MAXIMUM rather than the minimum.** Without the cut, the steady state
  is right and the start is wrong: a rabbit that has just been noticed is still
  holding whatever idle interval it rolled, so its first hop can be five
  seconds after a kitten started chasing it — measured at 3.4 seconds of
  running in a straight line before it thought to jump. But tested against
  `hopGap` instead of `hopGap * 2`, the cut also chops down the interval the
  last launch just rolled, every frame, and the gap collapses to nothing: 82%
  airborne. Only a calm roll, which cannot be below `hopGap * 2`, is stale.

**The pose is decided in `_paint`, every frame, from `onGround`** — not at the
places that change it. A rabbit crosses that boundary twice a second across
three different movement branches, and setting the drawing at each of them is
how one ends up forgotten and the animal runs along the floor in its leaping
pose. `air` is optional: a rat never leaves the ground and a bird never touches
it, so both fall back to `calm` rather than becoming a special case.

**Nothing may outrun a WALK.** Everything on the deck is under 10.5. That bound
is the general form of the rat bug: an animal faster than a walking kitten can
only ever be caught by a sprint, and a nine-year-old chasing something she
cannot close on concludes the game is broken rather than that she needs a
different button.

**`heal` IS AN ABSOLUTE NUMBER OFF `MAX_HP`, NOT A FRACTION OF HER OWN BAR.**
An Adamant orb raises `player.maxHp`, so a percentage of that would quietly
make every snack in the ring stronger for whichever kitten is wearing more
armour — the orb would be buffing her *healing* as well as her health, a stack
nobody asked for and nobody could see. 10 / 15 / 20 against the base hundred,
clamped to her real bar at the moment of eating.

**TWO SECONDS ROOTED IS THE PRICE, and trimming it is the one change that
would delete the feature.** She is handed a dead pad for the whole hold, she
cannot block, and her sister can see exactly what she is doing — so eating
mid-round is a gamble. Between rounds, with nobody to punish it, the same two
seconds is just the pace of the feast. `world-check` pins `EAT_TIME` at 2.0 for
that reason.

**THE HOLD IS READ FROM THE REAL PAD, AND THAT IS WHY THE EAT STATE LIVES IN
THE SYSTEM RATHER THAN ON THE PLAYER.** Eating freezes her through the game's
existing dead-pad trick (`Game._tick`, alongside `Tournament.frozen`). A
hold-detector reading the pad the player was *handed* would see the button come
up on the very frame the freeze started and cancel itself — every time, on the
first frame, invisibly. `Menagerie` reads `Game.input.players[i]` directly,
before the swap.

**A BIRD IN HER MOUTH DOES NOT ROOT HER.** She may run somewhere safe with it;
only the swallow roots her. And **the swallow resets rather than pausing** — a
bird has five seconds in there and the hold is two, so a chew she could chip
away at in half-second slices while running would be the same snack with the
risk taken out. Same rule as the shrine dwell.

**THE FLOOR IS SEARCHED BEFORE THE AIR, and one animal at a time.** Without the
second rule a kitten with a bird in her mouth pins a rat with the same button
and the two share one `t`, one freeze and one release.

**THE PIN IS RADIUS-ONLY, NO FORWARD ARC** — unlike every other swing in the
game. The animal's own ground ring is what tells her she can grab it and that
ring lights on distance, so an arc test would put the promise and the rule in
two different places: she would see the ring, press the button and get nothing.

**Every animal has exactly TWO drawings — normal and comically startled — and
no third.** The panda's two-tier pattern, for the panda's mechanical reason (a
Billboard bakes its size into its geometry, so two sheets that packed at
different scales cannot share a quad) and for the reason no kitten sheet in
this project ever gets new rows. The startled drawing is the last thing you see
before the poof, the poof is soft white smoke with nothing red or sharp in it,
and **the moment this reads as cruelty rather than slapstick the feature has
failed**. That is the whole reason the animals are rats, birds and rabbits
rather than anything a nine-year-old has a name for.

**EVERY DRAWING OF ONE ANIMAL IS SIZED BY AREA, NOT BY HEIGHT** (`poseQuad` in
`critter.js`, `contentArea` off `loadSpriteAtlas`). `contentScale` is the
fraction of its cell a drawing reaches *up*, and dividing by it makes any
single figure exactly `size` tall — right, and the whole reason it exists, for
a creature with one drawing. Give that creature a second pose and it becomes
actively wrong:

```
rabbit_run.png   bbox 665 x 368   ->  1.35 tall, 2.44 LONG
rabbit.png       bbox 656 x 534   ->  1.35 tall, 1.66 long
```

Both are the same rabbit at the same drawn scale — the body is 660-odd pixels
long in each — but one is stretched flat out and one is bunched up mid-leap, so
equalising their **heights** made the running one 47% longer than the leaping
one. The animal visibly changed size every time it landed.

So `size` means the drawn height of the **calm** pose, which is what is on
screen most of the time and what every other number in `CRITTERS` was tuned
against, and every other pose is scaled to cover the same amount of **ink**.
Ink area does not care which way a pose is stretched; the three rabbit sheets'
bounding boxes disagree by 45% and their ink areas agree inside 9%. A rabbit
mid-leap therefore comes out taller and shorter than one mid-run, which is what
a rabbit mid-leap is. The startled drawings were wrong the same way and by
more — every one of them shrank at the exact moment it was pinned.

`world-check` measures the real PNGs and asserts the poses land within a
quarter of each other on drawn area, against 2.3x before. It shares
`packMetrics` with the loader rather than re-deriving the packing, because a
check that re-does that arithmetic can agree with itself while disagreeing with
the game.

**`facesRight` IS DECLARED PER FILE, NOT PER SPECIES.** Six of the seven
generated sheets came back drawn facing left as the prompt asked and the
startled rabbit came back facing right. Image models honour "facing left" about
as reliably as they honour "exactly eight columns", which is the same lesson
`loadSpriteAtlas` learned by counting cells instead of trusting the prompt. Two
poses of one animal disagreeing means the rabbit spins round at the instant a
player pins it — which is exactly the frame she is looking at it. The flag sits
beside the filename in `main.js` and `world-check` asserts the two rabbit poses
do not share it.

**`maxAtlas: 768` on these sheets is deliberate and it is not the default.**
`cell` is a floor and the real size is derived from the source, so a 2048 sheet
packs into a 2048 atlas — 16MB of texture for an animal drawn 0.9 units tall
next to a 2.9-unit kitten. The dragons need that headroom because you ride one;
a rat never will. The PNGs on disk were also downscaled 2048 → 768, which took
the seven new files from 17.5MB to 3.6MB.

**No `clearPockets` on any of them.** Every startled sheet is drawn with big
white cartoon eyes sealed inside the lineart — the exact shape
`clearSealedPockets` was built to remove and did wrongly remove from Mr Satan's
face until the depth test was added. The rule is safe now; these sheets have no
sealed background to clear in the first place, so switching it on would be risk
with no upside.

**They flee the SUM of both kittens, not the nearest one.** Two fighters
converging on the same rat from opposite sides cancel out under a nearest-only
rule and it stands perfectly still between them, which looks broken. Summing
makes it squirt out sideways, which is what a rat does and is much funnier.

**They are turned back at the painted line rather than clamped to it.** A
critter pressed flat against an invisible wall reads as a bug; one that veers
away along the edge reads as an animal that knows where the drop is. There is a
hard clamp underneath as a backstop, and `world-check` runs thirty seconds of
roaming and asserts nothing ever leaves the deck.

**Spawning: SIX max, 45–75s apart, and the mix is a lottery.** Both numbers
moved together and for the same reason. Three was sized against the version
where every animal wanted a different button, so finding the right one was most
of the job; now a swing stops anything, the deck is a place you hunt rather than
a puzzle you solve, and three animals spread over 56 units of stone left long
stretches with nothing in sight — worst during a fifteen-second feast, where
crossing the deck to the only rabbit on it is most of the time you have.

**And the species is a straight uniform draw now, which is the opposite of what
it was.** The first version deliberately preferred a species that was *not*
already out there, and at a cap of three that made the deck permanently one
rat, one rabbit and one bird: the same picture every round of every tournament.
It was solving a real problem — a bird a pair might never meet — with a rule
that removed all the variety along with it. Two things replace it:

- `MAX_PER_SPECIES` (3, half the deck) so a run of luck cannot delete an animal
  from a tournament;
- **`start` seeds the OPENING deck with one of each**, and only the opening
  deck. The girls meet all three difficulties in round one and everything after
  that is random. `world-check` asserts the seeding, the cap, and that twenty
  top-ups actually produce different decks — "randomised" has to be a
  behaviour rather than a comment.

`_openSpot` keeps a spawn out of a kitten's lap: an animal that appears inside
the grab radius is a free 20 health for standing still, which is the exact
opposite of the risk this is meant to be.

### The feast

`FEAST_TIME` 15s, `REGEN_FRAC` 0.10, between `ko` and the next round.

```
round ends ─► KO hold ─► FEAST (15s) ─► next round
                          │
                          ├── survivor: +10 free, then hunt. She keeps
                          │   whatever she finishes on.
                          └── loser: wings. Comes back with a full bar.
```

**THE WINNER OF A ROUND CARRIES HER DAMAGE AND THE LOSER COMES BACK FULL.** It
reads backwards for about a second and then it is obviously right: winning a
round now costs something, a 2-0 stops being the default shape of a match, and
the girl who is behind has a reason to keep playing. It is also what gives the
gap a job.

**`REGEN_FRAC` is the floor under the whole thing, not the mechanic.** A round
that ends with the winner on four health and nothing within reach would send her
into the next one dead on the first touch — a spiral, not a comeback. Ten per
cent is handed over free the instant the round ends, and it is asserted to be
*smaller than every snack on the deck* so that standing still is never the
right play. A perfect feast is worth 55 of 100: about half a bar, checked at
both ends.

**`Menagerie.topUp` bypasses the respawn clock at the start of every feast, and
that is an exception with a reason.** Fifteen seconds of bare stone because
three animals happened to be eaten late in the round is the feature silently not
happening, and a nine-year-old cannot tell that from it being broken.

**THE FEAST ONLY RUNS IF THERE IS ANOTHER ROUND TO EAT FOR.** After a decided
tournament it goes straight to the results — fifteen seconds of collecting
health that means nothing is worse than no feast at all.

**Round one is a full bar, said out loud.** Since the feast landed,
`_nextRound` starts each kitten on whatever she is carrying, and for the first
round of a tournament that is whatever she walked in with — full today only
because `finish` happens to restore it on the way out of the last one, which is
a fact about a different function two hundred lines away. `begin` now sets it.

**The feast frames THE RING, not the pair.** Every other tournament state wants
the two fighters large and pushes in on their midpoint. The feast wants the
opposite: the subject is the whole deck and the animals on it, and the two
kittens are deliberately nowhere near each other — one on the stone, one thirty
units up. A midpoint camera between those frames the empty air between them.

**One line for the announcer, not one per outcome.** `Announcer` prints the text
it is given while playing the clip that matches the id, so two strings behind
one id would put words on screen that are not the words being spoken.

### The angel

**NO NEW KITTEN ART, the same call the hit and KO states made.** An angel is the
same drawn cell, washed out and translucent, plus three things that are not
her: wings, a halo, and the light around her.

**THE HALO IS THE DBZ ONE, AND IT IS THE WHOLE READ.** A ring over the head is
the most legible "this one is dead" in any cartoon either girl has watched, and
it costs no art: from this game's fixed three-quarter camera a flat torus
already *is* a halo.

**SHE REALLY IS TRANSLUCENT, and the first pass wrongly concluded she could not
be.** The reasoning was the invulnerability flicker's — `alphaTest: 0.35`, so
fading kills the sprite outright — which is correct for what the flicker does
and **does not generalise**. The test is against the fragment alpha with
`material.opacity` already folded in, so an opacity *below* 0.35 discards
everything; `ANGEL_ALPHA` (0.62) sits comfortably above it and simply makes her
see-through. The flicker fades to zero, which is why it cannot do this; a ghost
that stops at 0.62 never goes near the threshold. The only cost is the outer
ring of anti-aliased edge pixels (0.5 × 0.62 = 0.31, just under), which tightens
her silhouette by a texel. **`mat.opacity` is reset to 1 unconditionally for
everyone else** or a kitten who was ever an angel stays half-there for good.

**WASHED OUT, NOT TINTED.** `toneMapped: false` hands the colour straight
through, so pushing all three channels past 1 blows her toward white the way the
hit flash blows her toward red. The first pass cooled her *below* 1 toward
blue-white and from the feast camera — 96 units out — she read as an ordinary
kitten with something white behind her.

**Everything here had to be louder than the first pass.** A state that lasts
fifteen seconds and explains why one player cannot do anything has to be
unmistakable at the distance it is actually seen from, not at the distance it
was tuned at.

**Two things collided and both are worth remembering:**

- **The halo drew straight through her health bar.** The bar sits at 1.32h and
  the halo was at 1.26 — a black stripe across a gold ring, which reads as a
  rendering fault rather than as either of them. `Player._updateCombat` hides
  the over-head bar while she is an angel (it says zero, and the bar exists so
  the *other* kitten can decide whether to attack — there is no attack during a
  feast), and the halo moved to 1.44 anyway.
- **`barOn` is the intent and `visible` is derived from it every frame.**
  Writing `visible = visible && !angel` looks equivalent and is a latch: the
  frame she lands there is nothing left saying the bar was ever meant to be on,
  and she spends the rest of the tournament without one.

**The bloom torus has to be THIN or the halo is a coin.** At a tube radius of
0.13h against a ring radius of 0.34h the two tori closed the middle up and
additive blending finished the job — it rendered as a solid gold disc. The hole
is the entire reason a ring reads as a halo. 0.075h.

**The shine spokes have to be SHORT.** At 1.75h and half opacity they reached
most of a deck tile past her and read as white scratches across the floor:
hard-edged geometry at that length stops looking like glow. They live inside
the radial disc now, which is what gives them soft ends.

**The wings are pushed behind her in `faceCamera`, per view.** "Behind" is a
direction from a camera, and `Player.faceCamera` is the one thing in the entity
that runs once per viewport — it is the mount's outward nudge with the sign
reversed. A `renderOrder` alone leaves the sort deciding frame by frame which
quad is in front and the wings strobe through her chest.

**The halo is geometry, not art**, and it **leans toward whichever camera is
drawing** (`HALO_TILT`, applied in `aim` like the wings). A perfectly flat ring
is an ellipse from the feast rig at pitch 0.56 and a *line* from the flatter
shots the arena also uses; leaning it guarantees it always reads as a ring,
which is the one thing it exists to do. `rotation.order` is `YXZ` so the yaw
goes in first and `update` can keep spinning it on Z underneath.

**`becomeAngel` CLEARS `ko`.** Every KO-shaped rule in the game — the dead pad,
the flat-on-her-back pose, being skipped by the ring-out test — is exactly wrong
for a cat who is now flying, so `angel` takes over as the thing everything asks.
It also drops whatever she was riding.

**`_updateAngel` is a fourth movement mode and that is deliberate.** It could
have been three more conditionals inside the ground controller, and that is the
version that rots: gravity, the ground snap, `resolveSolids`, the mount button,
the oath and the katana would all have grown an `if (!angel)`, and the one that
got missed would be a dead kitten swearing to a clan.

**She is bounded off the ARENA, not off the world** — a ceiling so she cannot
vanish out of the top of the shot, a floor so she cannot sink through the deck,
and a soft leash at the rim rather than a wall to bounce off. A ghost who flies
to another island is a ghost the fight camera cannot follow back.

**`Tournament.finish` calls `landAngel` on both of them**, and that is the
loudest latch in the feature: `angel` is what routes her into the flight mode,
so a kitten flown home still holding it would drift through the town with no
gravity and no katana for the rest of the afternoon. Same class of bug as
`nearEdge`, and much louder.

### Reaching it

**`4` ends the live round on the spot**, dropping straight into the feast
through the real path. Same argument as `7` `8` `9` and `6`: the fifteen seconds
between rounds are behind the whole unlock *and* a round somebody has to
actually win, so the two newest things in the game were also the two hardest to
look at.
