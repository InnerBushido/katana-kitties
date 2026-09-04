# Four players

*Design notes, moved verbatim out of the old 4,400-line `HANDOFF.md`. This is
the WHY behind code that already exists — read it when you are about to change
something in this area, not before. Current state and open work live in
[HANDOFF.md](../../HANDOFF.md); the always-on summary is [CLAUDE.md](../../CLAUDE.md).*

*Cross-references saying "above" or "below" may now point at a sibling file in
this folder — see [the index](README.md).*

---

## Four players

**The party is a NUMBER now, not two.** `Game.partySize` is the single fact
everything scales off — the split screen, the dealer's shelf, the orbs scattered
at the Awakening, the ring's leagues. It is 2 unless somebody joins, and **the
two-player game is byte-for-byte the game the girls already know**. That is a
rule rather than an accident, and it is asserted: `world-check` pins Ember's and
Frost's colours, spawn and respawn spots, panda names, the two-player split
geometry, the two-player orb count, the two-player price and the two-player
shelf. Turning any of them fails loudly.

**The engine was already most of the way there.** Nearly every system was
already `for (const p of this.players)`, and `strikePlayers` already scanned all
players and skipped the attacker — so a four-way scrap worked at the damage layer
before any of this. The hard-coded twos were concentrated, not smeared: two pad
slots, a `merged` boolean with two viewports, two midpoints, two minimaps, two
score badges, six `index === 0 ?` colour ternaries, `wins[0]` vs `wins[1]`, and
two seats on the griffin.

### The two new kittens are RECOLOURS, and that is a risk decision

There are exactly two turnaround sheets and **generating a third is the riskiest
operation in this project** — `frost_grid_v2.png` is in `docs/unused-art/`
because its rows contradict each other and no per-sheet setting can fix that. So
Storm and Blossom are transforms of the drawn cell, the same call the hit flash,
the KO pose and the angel already make.

**IT RUNS AFTER PACKING, ON THE PACKED CANVAS, AND THAT IS THE WHOLE SAFETY
ARGUMENT.** Every measured thing about a sheet — the cell grid, `cols`,
`contentScale`, `contentArea`, `pad`, and the direction mapping every sprite
check asserts — is computed from the **alpha** channel during packing.
`recolourPixels` touches red, green and blue and never alpha, on a canvas where
all of that has already been decided. A recoloured kitten therefore cannot slice,
size or face differently from the one she was copied from. Doing it to the source
image instead would put a colour transform upstream of background removal, which
keys on colour — *that* version is a real risk and this one is not. Verified on
both real sheets: **0 alpha pixels changed**, and the packed atlases come out the
same dimensions and the same `cols`/`rows` as their sources.

**TWO KNOBS, BECAUSE ONE CANNOT DO IT.** Measured over cell (0,0):

```
ember_grid_v2   mean saturation 0.631,   2.5% grey
                orange fur 0-60, blue kimono 210-240, red trim 330-360
frost_grid      mean saturation 0.195,  37.0% grey
                GREY/WHITE FUR, pink kimono 300-360, cream 0-60
```

Ember is saturated everywhere, so rotating every hue by a constant moves her
whole palette while preserving the relationships inside it. **Frost is a grey
cat, and a rotation does nothing to a pixel with no saturation to rotate** — it
recolours her kimono and hands back the same grey animal.

**And no angle fixes that, which is the part worth knowing.** A grey pixel has no
hue, so whatever hue the transform gives it is the *same* hue for every grey
pixel; the distance from there to her rotated kimono is her kimono's original
hue, **which does not depend on the rotation at all**. Rotating harder moves both
and separates neither — the first attempt put Storm at 180 and Blossom at 210,
30 degrees apart, two blue cats. So the greys get their own hue outright
(`tint`), independent of the rotation applied to coloured pixels, and the
cross-fade between the two is widened (`greyS`) so her fur commits to it rather
than landing between. Measured after: **Storm peaks at 180, Blossom at 270.**

Lineart and speculars are protected at both ends by a lightness window — a
saturation lift on near-black puts a colour cast on every outline, which reads as
bad printing rather than as a different cat.

**The names are placeholders and the girls should pick them.** Ember and Frost
were named by one of them; Storm and Blossom were not. They follow the
dragon-breath set the first two sit in (fire, frost, lightning, blossom), which
is the best guess available, and they live in one table with nothing outside it
hardcoding them.

### `PLAYER_STYLE` in `core/palette.js`, and why it is in core/

Ten copies of "there are exactly two of them" collapsed into one table: marker
ring, health bar, the bar's low-health colour, the colour restored after an edge
warning, the panda's name, the respawn spot, the minimap pip, the minimap arrow,
the seek chevron, and the marker reset on restart.

**It lives in `core/` rather than on `Player` because of who reads it.** The
entity, the panda, the minimap, the HUD and the game loop all want it, and
`panda.js` importing it from `player.js` closes an import cycle — `player.js`
already imports `PANDA_SPEED` from `panda.js`. That cycle happens to work today
because both constants are read inside function bodies rather than at module
scope, which is a fact about where two lines happen to sit and not a thing worth
depending on.

**A SLOT IS NOT A STYLE, and that is what character choice cost.** `Player` takes
a `style` object rather than looking one up by index, because a third player
picking Blossom leaves Storm unplayed: slot 2 is playing style 3 and no lookup by
index can be right. `Game.roster` maps slot → style. It falls back to
`styleFor(index)` so the many `new Player({ index })` calls in `world-check` keep
meaning what they meant.

### Input: four slots, and the keyboard set is no longer the slot number

The interesting arrangement — the one asked for — is **two players on the
keyboard and two on controllers**, with **no new profile and no third keyboard
set invented for the occasion**.

Which means the keyboard set can no longer be the slot number. It used to be:
slot *i* read `KEYSETS[i]` whenever no pad was bound to it. With two controllers
on slots 0 and 1, the two keyboard players are slots 2 and 3 — and there is no
`KEYSETS[2]`. So a binding names its keyboard set explicitly.

**`_assign` deals pads first, then keyboard sets IN ORDER — WASD, then the
arrows.** See *A controller is a controller* below for the table and for why the
slot-affinity rule that used to sit here was removed.

**A SLOT PAST THE PARTY SIZE READS NOTHING AT ALL.** It has no pad and no keyset,
which matters: leaving the old "fall back to `KEYSETS[i]`" rule in place would
mean WASD quietly driving the controller state of an unseated third kitten.

### Joining happens IN GAME, and the title screen is untouched

The menu panel is a faithful reproduction of a drawing one of the girls made —
SETTINGS, PLAY, HELP — so a fourth button is not available, and putting a lobby
in front of PLAY would add a step to the game the two of them already know. So a
third and fourth player join from inside the world, which is also exactly what
"players can join without disturbing the ones already playing" asks for: **the
join mechanic and the character picker are one feature.**

**START, not any button**, for the same reason `SKIP_KEYS` exists — they rest
their thumbs on things. On a pad it is the pause button; on a keyboard it is that
set's own start key, which cannot collide with a seated player's because a set
only qualifies while **nobody is on it**.

#### ENTER JOINS, ESC OPENS THE MENU, AND THAT SEPARATION IS THE FIX

That "cannot collide" clause was doing more work than it looked, and it caught a
real player out. A keyboard set's `start` used to mean **pause** while somebody
was seated on it and **join** while nobody was — so which key seated the next
kitten depended on which sets were already taken, and *that* depended on how many
controllers were plugged in:

```
  0 pads   both sets seated       no keyboard join at all
  1 pad    P2 is on WASD          ENTER was HER PAUSE KEY; the way in was `\`
  2 pads   both sets free         ENTER joined P3, `\` joined P4
```

**With one controller connected, pressing the obvious ENTER opened the pause menu
instead of seating player 3.** It was not a new bug so much as a newly
*reachable* one: dealing WASD before the arrows moved the free set from WASD to
the arrows, which moved the join key from ENTER to `\`.

**BOTH SETS ANSWER TO ENTER NOW, AND `_findJoin` HANDS OUT THE LOWEST FREE SET.**
Two keyboard players join one at a time by pressing it twice — the first press
takes WASD, the second the arrows. `\` is gone; the numpad's Enter is kept as an
alt because it is the same key under another name.

**WHICH IS ONLY SAFE BECAUSE `start` NO LONGER PAUSES ON A KEYBOARD.** The pause
toggle asks `p.source === 'gamepad'`, so **Esc is the keyboard's only menu key**.
A pad keeps both jobs: it has a real Start button, which is not a letter on a
keyboard somebody else is also typing on.

**THE EDGE IS LATCHED AGAINST THE ONE KEY, NOT ONE LATCH PER SET.** With a latch
each, holding Enter down after the first player joined would immediately seat the
second on the next frame — the arrows' latch has never seen it pressed. There is
one `kb` entry in `_joinPrev` now, and a check for exactly that case.

`joinHint()` survives the change because it still answers a real question:
whether there is anywhere left to join at all, and whether a **spare controller**
is the better answer (it is named first when one exists). The bottom hint strip
and the pause menu both print it, and it goes quiet on a full party rather than
naming a key that would be refused.

**THE HINT STRIP USED TO BE WRITTEN ONCE, AT `startPlay`, AND NEVER AGAIN.** That
was survivable while it only listed devices — plug a pad in mid-game and the line
was merely out of date. It is not survivable now that it names the join key,
because a stale line does not go vague, it goes **wrong**: it goes on offering
`\` to seat player 3 after player 3 has sat down. It rebuilds against a signature
(`describe` + hint + party size) on the minimap's existing 20Hz throttle, so the
common case is a compare and no DOM write.

#### A CONNECTED CONTROLLER SHOULD BE A PLAYER (`_autoSeat` / `sparePad`)

**Three pads plugged in used to give two kittens and one controller that did
nothing.** It was dealt a device slot perfectly correctly and then sat unbound,
because `slots` was 2 and nothing grows the party on its own — so it read as
broken hardware rather than as a party nobody had grown. The combination that
exposed it: two Joy-Cons through Joy2Win (one vJoy device, split) **plus** a PS4
pad, where `split` looked like it was disabling the pad and `auto` looked like it
was disabling a Joy-Con. Neither was; the third device simply had no player.

`Game._autoSeat` seats her. START still works and is still the explicit way in;
this is the same thing happening without anybody having to know that.

**IT WAITS FOR REAL INPUT, NOT FOR CONNECTION.** `sparePad` asks `hasSentInput`
— the same question the vJoy phantom has to answer, doing the same job here. A
pad charging on the side or left on the sofa has sent nothing and seats nobody;
picking it up is the gesture. The character picker still runs, so nothing about
who she plays is decided for her.

**ONE OFFER PER DEVICE, LATCHED IN `Game` (`_autoSeated`).** `hasSentInput` never
goes back to false once a pad has been used, so without the latch a player who
drops out would be re-seated on the very next frame by the controller still in
her hands — she could never leave. Dropping out is a decision; the latch is what
makes it stick. She can rejoin with START.

**The picker is a CARD, not a screen.** The world keeps running for everyone
already in it — the opposite of every other full-screen moment in this game, and
right for the same reason the star pose is per-player: this is one kid's moment
and stopping three other people's game for it is the interruption the split
screen exists to avoid. She is handed a dead pad for the duration and nobody
else is, so the stick choosing a cat is not also walking her off a rim.

**The join candidate is computed inside `InputManager.update`, not asked for on
demand.** The edge test compares against the previous frame, and `Game` asks
after `update` has already run — a version that sampled the pad when called would
be comparing a frame against itself and could never see a press. That bug was
written and caught in the same pass; it is the kind that looks like the button
simply not working.

### Leaving conserves the world's supply

**Her worn orbs go back into the world**, which is the dealer's own rule — a sold
orb goes back on the shelf so the party cannot destroy the supply between them.
Only a fixed number exist; a kitten walking out with eight would delete a chunk
of the endgame for everybody still playing. Her panda waits, her dragon goes
home, her Ryuuseki seat empties.

**Slots shuffle down**, so the party is always 0..n-1 and nothing downstream has
to cope with a hole — which means the players after her change index, and the
claims have to be re-dealt in the same pass or slot 2's controller ends up
pointing at a player who is now slot 1.

Verified end to end in the browser against a stubbed second pad: join on a free
keyset gives `P1: gamepad | P2: gamepad | P3: WASD`, the dealer re-prices 650 →
433, the shelf goes 4/1 → 5/2, and leaving returns both her orbs to the world and
puts every number back.

### The split screen: ONE PANE PER GROUP

All together → one shared camera. Otherwise **one viewport per group of kittens
who are standing near each other**: halves at two, **quadrants at three or four
with one cell empty** when everybody is apart.

**Three players get quadrants rather than three equal columns or a full-width
pane on top.** Equal area is the fair rule and both alternatives break it:
columns give three tall slots on a wide screen, which is the worst possible shape
for a fixed three-quarter camera, and a full-width top pane hands whoever is in
it twice the screen.

#### A SHARED PANE IS WORTH HALF THE SCREEN, NOT A QUARTER

Equal panes is the fair rule when every pane holds one kitten and the wrong one
the moment a pane holds two: a pair standing together were given the same quarter
as somebody on her own, so **teaming up cost them half their screen each**. The
rule underneath was always **equal area per PLAYER** — equal panes is just what
that reduces to when everybody is alone.

Three panes out of four players is the only case where those two readings
disagree (the sizes have to be 2,1,1), so it is the only case `splitLayout`
weights. The pair takes a full-width strip across the top — half the screen, a
quarter each — and the two singles split the bottom.

**FULL WIDTH RATHER THAN A TALL HALF**, because the camera is a fixed
three-quarter view: a wide short pane shows the ground either side of you, a tall
narrow one shows sky and floor. This is the same "a full-width pane hands whoever
is in it twice the screen" the paragraph above warns about — the difference is
that here there really are twice as many players in it.

**THE BIG PANE GOES ON TOP WHEREVER ITS GROUP SITS IN THE ORDER**, so the array
still lines up index-for-index with the caller's groups. Sorting the panes by
size instead would silently hand one group another group's camera.

**TWO PANES ARE LEFT ALONE.** Both are already at least half the screen, which is
the rule; carving a 3:1 split for a trio plus a straggler would hand the lone
kitten a sliver the camera cannot use.

**`Game._panes` is the only caller**, because the renderer and the HUD must not
assemble the `sizes` argument separately — that is how a minimap ends up
positioned for a pane the renderer drew somewhere else.

#### Proximity grouping, and the blocker it had to clear first

This section used to say clustering was deliberately NOT built, and gave the
reason: *"cluster membership changing mid-flight strands the per-view lerp state,
which is precisely the frozen-`sharedTarget` bug this file calls the whole fix
for the jarring rejoin. If it is ever wanted, the camera identity has to be
stable across a membership change before anything else."*

That is exactly what was done, and the fix is one sentence: **a group is NAMED BY
ITS LOWEST MEMBER, and there is one camera rig per player index.** Rig `i` draws
whichever group has player `i` as its lowest member. So a group that gains or
loses somebody keeps the same rig, and its aim point moves by a lerp rather than
being handed to a camera that has been sitting frozen somewhere else.

**Identity must not depend on membership, which is the trap.** Name a group by
its centroid, its size, or the order it fell out of a loop, and one kitten
crossing the threshold renames every group on screen — which is the frozen-camera
bug with extra steps. The lowest member is the one label that a join or a leave
cannot move, and it is why `core/cluster.js` unions by minimum index rather than
by rank or size: union-by-rank is marginally faster over four elements and hands
the set a root that moves when somebody joins it.

**EVERY RIG IS UPDATED EVERY FRAME, DRAWING OR NOT** — the same rule, for the
same reason, as the shared camera's own version of it. A rig whose player is not
currently leading a group tracks *her alone*, so the instant a group splits and
she becomes the lowest member of a new one, her rig is already framed on her.
Four rigs is four vector lerps a frame.

**Measured, because "no jump" is a claim and not an opinion.** Walking a third
kitten in to a pair and out again over 300 frames: the groups change at exactly
30 in and 46 out, and the worst one-frame camera move over the whole run is
**0.88 units** — with **0.87 and 0.80** on the two frames where membership
actually changed. The membership change costs nothing, because there is nothing
to catch up on.

**A GROUP OF ONE USES HER OWN FOLLOW CAMERA, not a rig framed on a single
point.** `Player._updateCamera` and `setFocus` carry the grotto tilt, the dojo
framing, the star pose and the mount pull-back; a shared rig re-deriving all of
that for a group of one would be a second copy of every one of those rules — and
it is also exactly what a lone kitten's pane has always been.

**A FLYING KITTEN IS ALWAYS ALONE, and that now costs ONE pane instead of the
whole screen.** The old `anyFlying` rule was global: one kitten taking off split
every view in the game, including two sisters standing next to each other in the
market who had not moved. The rule itself is unchanged — a gunner thirty units up
is not "close to" her sister on the ground below — it is just asked per pair.

**SINGLE LINKAGE, ON PURPOSE.** A near B and B near C puts all three in one pane
even when A and C are not close, because B can see both of them and splitting the
kitten standing between them into two panes would draw her twice. Requiring
*every* pair in a group to be close has no stable answer for three players in a
line: dropping any one of the three is equally valid and nothing says which.

**HYSTERESIS IS ONLY EVER STICKINESS.** `prev` can hold a pair together out to
`MERGE_OUT`; it can never pull one together, or a group could grow across a gap
it was never allowed to close. `MERGE_IN`/`MERGE_OUT` moved into `cluster.js`
with the only code that reads them, at their existing values — the whole
compatibility claim is that a pair joins and splits at exactly the distances it
always did, and `world-check` pins that first.

**`merged` still means "one view for everybody"** — the HUD, the minimaps and the
map-zoom key all read it — but it is now a *consequence* of the grouping
(`groups.length === 1`) rather than a second thing decided separately. Two
answers to one question is how a map ends up drawn across somebody else's half.

**The one thing grouping took away is the badge rule.** `_buildHud` used to put
each score badge on the side of the screen its owner's pane was on. A player's
pane is no longer her slot number — it depends on who she is standing next to and
it changes as she walks — so a badge that tracked the pane would slide across the
screen every time two kittens met. Badges are laid out by PLAYER and stay put: a
badge you cannot find is worse than a badge on the wrong side. The two-player
rule (P1 left, P2 right) is unaffected, because at two players the pane order and
the player order are the same thing.

`splitLayout` in `core/split.js` and `clusterPlayers` in `core/cluster.js` are
both pure arithmetic with no THREE and no DOM, so `world-check` asserts what
actually matters. For the layout: every pane inside the frame, none overlapping,
all the same size, player 1 top-left, and the two-player case identical to the
hand-written code it replaced. For the grouping: **every kitten in exactly one
pane in every arrangement** (a player in none is invisible to herself, a player
in two is drawn twice on a screen where she is hunting her own marker), the
two-player answer identical to the boolean it replaced *at the same distances*,
a group keeping its name across a join and a leave, hysteresis that can stick but
never pull, a flyer alone without splitting the ones still on the ground, and —
since neither module imports the other — that every grouping is something
`splitLayout` can actually tile.

**THE HUD READS THE SAME `splitLayout` THE RENDERER DOES.** The minimaps used to
be positioned by four CSS rules keyed off `hud-split` / `hud-horizontal`, which
worked while there were two panes in one of two arrangements. With quadrants the
HUD would have needed its own idea of where pane 3 is, and two copies of that
rule is how a map ends up drawn across somebody else's half of the screen.

#### TWO MINIMAPS, MAXIMUM — and map `i` is PANE `i`'s map

One map per kitten is the obvious rule and it is the wrong one at four. A
quadrant is a quarter of the screen; a map sized to stay legible eats a real
fraction of it, so four maps means four corners of the game covered up at exactly
the moment there is most to look at. It also stops being a map and starts being
furniture — nobody reads four.

**It is still "players 1 and 2" in every case where that means anything, and
that falls out of the grouping rather than being asserted.** Groups are ordered
by lowest member, so pane 0 always holds Ember and pane 1 always holds the
lowest-numbered kitten who is *not* with her — which is Frost whenever the two of
them are apart.

**The case that decides the rule is the one where they are together.** Keying the
second map to Frost personally hides it the instant she walks over to her sister,
and leaves the OTHER pane — two kittens on the far side of the archipelago —
**with no map at all**. Two kids with no map is the failure the minimap exists to
prevent, and it would happen precisely when they are furthest from everybody
else. So a map can end up belonging to a pane rather than to a girl, and the tag
says so: it reads `SHARED` rather than flying one kitten's name over a shot her
sister is standing in.

**`Minimap.focusIndex = null` used to mean "the midpoint of `players[0]` and
`players[1]`", written out.** A surviving "there are exactly two of them" that
reads perfectly at two players and is silently wrong at four: a map shared by
players 3 and 4 was centred halfway between Ember and Frost, who might be on
another island — the pane's own two kittens could be off the edge of their own
map. It takes a `focusOn` list now.

**Players 3 and 4 have no map, and pressing the button SAYS so.** The bumper
indexes past the end of a two-element array, and a button that silently does
nothing is indistinguishable from a broken one — the same rule the shrine join
prompt and the star locks already follow. She gets one toast telling her she is
on the maps that are up.

### Eight things one four-player match turned up

All of these came out of a single 2v2 played by four kittens, and every one of
them was invisible at two players — which is the pattern worth noticing more
than any individual fix.

**THE HEALTH BARS SHOWED TWO FIGHTERS.** `_paintHud` opened with
`const [a, b] = this.game.players`, written when two was the only number there
was, so the third and fourth kitten had no bar at all. The pips were worse than
missing: `wins` counts SIDES and they were being drawn against PLAYER 0 and
PLAYER 1, which is the same number only in a duel. It is one bar per fighter
grouped by side now, and the two-player layout comes out byte-for-byte what it
was — sides are dealt left until the left holds half the fighters, which gives
`[P1] ROUND [P2]` at two and the pair against the pair at four.

**A BAR KEEPS ITS OWN KITTEN'S COLOUR AND THE TEAM COLOUR IS THE BLOCK AROUND
IT.** Two different questions — "which bar is mine" and "who is with me" — and
answering both with one colour loses the first, which is the one a nine-year-old
needs in a hurry. The fill is set inline from `styleCss`, the same source the
marker ring and the minimap pip read; it used to be two CSS rules (ember, and
frost for `.p1`), which is two of the four cats and no way to say the other two.

**WHO IS ON MY SIDE WAS A QUESTION NOTHING ANSWERED.** In a 2v2 you found out by
swinging at somebody and watching nothing happen — the worst possible way to
learn it, because the rule that protects your partner is invisible and the first
thing it teaches you is that your attack is broken. There is a team pennant over
every head now (`Player.setTeamMark`), red/blue/gold, on only in matches where
somebody actually shares a side. **A chevron rather than a disc**: from this
game's fixed three-quarter camera a disc above a head reads as the halo the
angel already owns, and two round things meaning opposite things is worse than
no marker.

**STORM AND BLOSSOM HAD NO EATING POSE AND NO WINGS, and there were two separate
bugs under that.** The pose was picked with `p.index === 0 ? ember_eat :
frost_eat` — the same mistake `palette.js` has a heading about, **A SLOT IS NOT
A STYLE** — so Storm, who is drawn from Ember's sheet in slot 2, ate as a grey
Frost. And because the eat sheet is a separate single-cell file rather than a row
on the turnaround, it never went through `recolourAtlas` with the rest of her, so
even the right sheet would have been the wrong colour. Worse: **a player is
seated in three places and only one of them dressed anybody.** Boot seats two,
joining seats a third and fourth, and the character picker RE-SEATS one by
building a whole new `Player` — so a kitten who joined had neither pose nor
wings, and swapping cat in the picker silently threw away the ones Ember and
Frost were born with. `Game._dressPlayer` is the one place now.

**THE RING-OUT FIRED IN MID-AIR.** `_updateOut` tested horizontal position
alone, so the timer ran the moment she crossed the line however she crossed it —
and the commonest way to cross it is to be hit, which sends her over the edge in
a long arc with `lift` on it. A kitten sailing across the line five units up, on
her way back onto the deck, was being counted out of a ring she was about to land
in the middle of. **Two ways to be down and both are needed:** `onGround` catches
the case the painted border exists for (she has LANDED past the line, and
standing there has to cost something), and falling below the deck catches the
other, because off the rim `onGround` never becomes true again and waiting for it
would mean falling forever.

**FRIENDLY FIRE DID NOTHING, WHICH IS A RULE WITH NO TEETH.** The safest thing in
a tag-team round was to hold attack down and swing through everybody, because the
swing that hit your partner was free. It dazes her now — no damage, a full second
of no control, and a ring of stars — so it costs her something real and costs you
the swing. **The ally test moved BELOW the range and arc checks** to make that
possible: a swing that MISSES your partner must not daze her, so the hit has to
be established first and only then asked who it landed on. The lockout is twice
the daze, which caps a sister mashing attack at a third of anybody's time.

**THE RAT WAS THE ANIMAL NOBODY COULD CATCH, FOR THE SECOND TIME.** The first
version was pin-only and outran the grab radius; the fix made a swing stop
anything and it was *still* the one that never landed. 8.2 is 78% of a walk,
which sounds catchable and is not — a kitten closing at 2.3 units a second needs
four seconds to cross the pin radius, and the rat turns. It is 6.6 now (closing
at 3.9), worth 12 rather than 10 because it is easier, and still below the
rabbit's 15 so the ladder holds. **And the two power-orb attacks never reached
the wildlife at all**: `_doSlash` asks both questions on every ordinary swing and
`_chargeStrike`/`_diveImpact` asked only about the other kitten, so a rat could
be charged straight through and a dive could land on top of one and neither did
anything.

**WHO YOUR PARTNER IS WAS DECIDED BY WHO PICKED UP A CONTROLLER FIRST.**
`mode.sides(n)` was the only arrangement — the first two kittens were always the
pair — so the only way to change teams was for somebody to drop out and rejoin.
There is a team picker now (`_openTeamPicker`), and **each kitten moves herself
with her own stick**: this is the second screen in the game needing one cursor
per player rather than one for the room, for the same reason the trade screen
does — the thing being chosen is personal. `_validSeats` checks the SHAPE rather
than the seating, so a 2v2 needs two sides of two and does not care which two,
which is exactly the part the picker owns. Until the shape is legal JUMP is
refused **and the screen says why**, because a confirm that silently does nothing
is the failure this file keeps naming.

**`_validSeats` TAKES ITS MODE AS AN ARGUMENT, and that is not tidiness.** The
picker runs BEFORE `begin`, so at the moment it needs the answer the tournament
is still carrying whatever league it last ran — the duel, on a fresh game. Read
off `this.mode` it reported that a perfectly good 2v2 was illegal, and the screen
sat there telling four kittens to move somebody across when nobody needed to.

### The leagues

A tournament is a set of **sides**, and everything is written against sides
rather than against two players. `sides` maps fighter index → side index, so a
free-for-all is every fighter on her own side and **a duel is already a team mode
with one fighter a side** — which is what lets the whole feature be one code path
with no "team mode" branch anywhere.

| league | party | sides |
| --- | --- | --- |
| DUEL | 2 | `[0, 1]` — unchanged, and the only league two players get |
| FREE FOR ALL | 3, 4 | `[0, 1, 2, 3]` |
| TAG TEAM 2v2 | 4 | `[0, 0, 1, 1]` |
| HANDICAP 2v1 | 3 | `[0, 0, 1]` |
| HANDICAP 3v1 | 4 | `[0, 0, 0, 1]` |

**A ROUND IS NOT OVER UNTIL A SIDE IS.** In a duel one knockout is one side wiped
and this is exactly what it always was; in a 2v2 the first kitten down leaves her
partner fighting alone, which is the whole shape of a tag-team round and the
reason to have one. Asking "did somebody go down" would end a 2v2 on the first
knockout and make the second fighter on each side decorative.

**NO FRIENDLY FIRE, as one more clause on the SINGLE gate.** `Game.strikePlayers`
is still the only place that asks whether two kittens may hurt each other; it now
also asks whether they share a side. A partner you can cut down is not a partner,
and with two sisters on a side the first accident becomes an argument about
whether it was an accident.

**THE HANDICAP IS A BIGGER BAR, NOT A WEAKER OPPONENT**, scaled by how badly the
side is outnumbered — one against three opens on three bars. Scaling everyone
else's damage down would make the lone fighter's own numbers lie: she would land
a dash and see it take less than it takes in every other mode. It is
`Player.hpScale`, a field on the player rather than a number applied once,
because `setPowerOrbs` recomputes `maxHp` from scratch — a handicap written
straight into `maxHp` would evaporate the moment she traded an orb mid-match. It
**multiplies** with an Adamant stack rather than replacing it, the clan-and-orb
rule, and all four of those are checked.

**Posts come from the sides**, so teammates open beside each other and the other
team is across the ring. Spaced evenly by index the four alternate round the
circle and every 2v2 opens already tangled.

**EACH LEAGUE KEEPS ITS OWN BOARD.** A duel win and a 3v1 win are not the same
achievement, and one table mixing them makes the number meaningless — a handicap
fighter with a triple-length bar deals three times the damage of a duellist and
would sit permanently on top of a board she is not really competing on. **The
duel keeps the original storage key**, so every tournament the girls have already
won is still there; only the new leagues get new tables.

**The league picker runs in the ring, after the griffin.** The ride is eight
seconds and skippable, so a league picked before it would be a decision made and
then sat on. Two players never see it: there is exactly one league they can run,
and a menu with one item teaches a kid the game has stopped working.

### The purse, and the fixed pot it breaks

**Winning pays points, and that makes the economy renewable where it was
deliberately fixed.** Every point came from knocking something over — 4550 across
216 props — and the orbs only exist once everything has been knocked over, so the
pot was closed and a stack of four was priced to be unreachable on purpose. A
tournament can be replayed all afternoon, so this opens it.

That is the point of it: a kitten who has spent her share has something to do
about it besides asking her sister, and the arena gets a reason to be gone back
to. **But it does move the ceiling**, so the purse is one orb and it is
**derived** — `kotodama.price` already knows what an orb costs at this party
size, so the purse tracks the price instead of being a second number to keep in
step. Every member of the winning side is paid the same; splitting it would make
a 2v2 win worth half a duel win each, which teaches two sisters that teaming up
is worse than fighting.

**This is the number most likely to want turning after a session with the girls.**
It is the one thing in the feature that can be ground.

### The orb economy scales per player

**Four orbs per player**: two kittens get eight — one of each kind, the number
this was designed around, unchanged — and four get sixteen.

**The scarcity that matters is per player, and that is what is held fixed.** The
original argument against sixteen was that two girls could wander into a full set
each without ever speaking, because the interesting object in this feature is not
the orb, it is the sentence "I'll swap you my Ward". At four players sixteen is
the same four-per-kitten it always was.

**IT DOES RELAX "NOTHING IS STACKABLE BY WALKING", DELIBERATELY.** Sixteen across
eight kinds means two of some, so a lucky circuit can turn up a pair. The
alternative is worse in a way that is not a trade-off: one Ward between four
kittens means three of them can never find one, and a power three quarters of the
party can only watch somebody else use is not scarce, it is absent.

**The price is a share of a fixed pot, so it divides by the party size** —
`pointsTotal / players / 3.5`. 650 at two players exactly as before, 325 at four,
so "your share buys three or four" holds per kitten at any size. Leaving it alone
would have quietly halved what each of four kittens could buy.

**The shelf grows by one of everything per player past the second.** Four kittens
shopping off a shelf sized for two means the third to reach the market finds it
empty, which is not scarcity — scarcity is a price you cannot meet, and an empty
shelf is just being late. The move orbs go one → three rather than to four, so
they stay the half you mostly get by trading. `Kotodama.forParty` **adjusts** the
counts by the difference rather than resetting them when somebody joins or
leaves, or a party change would hand out a free restock or confiscate the stock.

### Trading points, and "exactly two confirmed"

Each side's offer is now an orb **and/or** a quantity of points, so a kitten can
gift points outright or sell an orb for them. **On the points row left and right
change the amount and up and down still move the cursor** — splitting the axes is
what lets one row carry a value with no extra button, the same trick `MenuNav`
uses on a `<select>`. Moving the amount clears her confirm, the rule picking a
different orb already followed.

**Points move with the orbs or not at all.** `kotodama.trade` is already atomic —
it removes both orbs before giving either — and points are inside that same
all-or-nothing, or a refused swap still empties somebody's purse.

**A trade fires when EXACTLY TWO players have confirmed, which is the two-player
rule generalised rather than a new one.** With two kittens "both have confirmed"
and "exactly two have confirmed" are the same sentence, so nothing about the game
they know changes. With four it answers the question a partner selector would
otherwise have to ask — *who* is trading with whom — using the thing they were
already going to do, and it keeps consent exactly where it was. **A third confirm
is refused rather than guessed**: picking two out of three would move an orb
somebody agreed to give to a person she did not agree to give it to, which is the
one thing this screen exists to make impossible.

### Four seats on the griffin, and the fallback that was the bug

`SEATS` had two and `_place` read `SEATS[i] ?? SEATS[0]` — so a third and fourth
rider were placed at the *first* seat, straight back to the original invisible-
rider bug: several transparent billboards at one depth, the sort picks one, and
two kittens are invisible for the whole flight to a tournament they are about to
fight in. Four seats now, spaced by the measured 0.19 fore and aft, with `up`
falling toward the tail because that is the shape of the back they sit on. **Two
riders keep the two seats they were measured into** rather than being spread over
four: the griffin is drawn for a pair, and pushing them out to the extreme seats
to make room for kittens who are not on it would change a shot the girls know.

### What is NOT built

- ~~**Proximity clustering in the split screen**~~ — **built.** The camera-identity
  problem was the blocker and it is solved by naming a group after its lowest
  member; see The split screen above.
- **Ryuuseki still has two seats.** The pilot/gunner split is carefully reasoned
  (the fan belongs to the second seat, and that is the whole set-piece) and adding
  a third and fourth seat would either dilute it or need a new job inventing. Two
  of four ride him; the other two watch from the ground with their own panes.
- **Voice lines for the new leagues.** Mr Satan announces rounds and knockouts
  from his existing recorded set; the league names are on screen, not spoken.

---

## The first four-player session, and the ten things it turned up

Everything below came out of one round of play after the four-player pass
landed. Nine of the ten are in the tournament, which is not a coincidence: it is
the only part of the game with rules that can be *wrong* rather than merely
missing, and it had never been played by four people.

### The ring-out fired in the wrong place, twice over

Two complaints that sound opposite and are one bug: **rung out while still
standing on the stage**, and then **half a second of nothing happening** once
she really was off it.

`arenaOutBy` measures from the **painted line**, which sits `ARENA_OUT` (1.1)
*inside* the deck edge — so there is a full stride of real stone past the paint,
and standing on it was "out". `OUT_GRACE` was the only thing hiding it: half a
second was long enough to walk back onto the paint, so the false positive
usually cancelled itself, and what survived was a penalty that arrived at a
seemingly random moment. Taking the grace out without moving the test would have
made it fire constantly.

**So the question is now the honest one: HAS SHE COME DOWN ON THE LOWER FLOOR?**
Three things, all needed — past the line, feet below the deck (`OUT_DROP`, 0.6),
and either `onGround` or fallen past `OUT_FALL` with nothing under her. Standing
on stone is standing in the ring, whatever the paint says; the paint keeps the
job it is good at, which is where `nearEdge` lights a stride before the edge. And
once all three hold there is **no grace at all** — she is standing on the ground
outside the ring, and there is nothing left to wait for.

**The feast keeps its grace**, because nothing there is at stake: snapping a
kitten back to the middle mid-stride for chasing a rabbit down the steps takes
away the one thing she has to do for fifteen seconds.

### The handicap was three hundred health

`handicapFor` was `biggest / mine`, uncapped, so the lone fighter in a 3v1 opened
on **three bars** and both loners in a 2v1v1 on two. On paper it is exactly fair
— one bar each — and in the ring it is a different game: her sisters watch a bar
that will not move, and because a knockout is also the round, the side with the
long bar decides how long everybody else's afternoon is.

`HANDICAP_MAX` is **1.2**, and it is deliberately the **same at every shape**.
Being outnumbered worse is a reason to fight differently, not a reason to hold a
different amount of health — and two leagues that hand out different bars for the
same job have record boards that cannot be compared. What actually makes a
handicap match survivable is the feast, the snacks and rage, and she gets all
three.

### The round had a clock and it was invisible

`ROUND_LIMIT` (120s) can hand the round to whoever is ahead on damage, and it ran
silently for its whole life — the one rule in the tournament that can take a
round off you was the one nobody could see. It is now the **top line of the round
box**, above `ROUND n`, in the one spot on that HUD both girls already read; red
and pulsing under fifteen seconds, which is when "ahead on damage" stops being
trivia and becomes the result. It counts only in `live`, because `this.t` is the
state's own clock and a timer that runs during the card and the countdown is
charging her for seconds she is frozen for.

### PICK YOUR SIDE was never seen

Choosing 2v2 went straight to the round card with whoever joined first paired up.
Two causes, and the fix needs both halves:

- the picker opened on `mode.sides(n)` — the **default arrangement, which is a
  legal one** — so `_validSeats` was true on its first frame and nothing stood
  between four kittens and the match but a JUMP;
- **the JUMP that chose the league is still down on that frame.** `MenuNav`
  confirms on `jump`, `_openTeamPicker` runs inside that same frame, and
  `_updateTeamPicker` runs later in it and reads the very same press.

So: everybody starts on **`NO_SIDE`**, which is an illegal seat rather than a
flag beside the seats (`_validSeats` already refuses anything outside `0..n-1`,
so an undecided kitten invalidates the arrangement for free — a separate
`chosen[]` is a second thing to keep in step, and its failure mode is a match
starting with somebody on a side she never picked). And JUMP is **armed by being
released** (`jumpArmed`), so a press belonging to the previous screen cannot
confirm this one.

NO TEAM is drawn as a **column**, not as an absence: it is where a kid looks to
find herself on the frame it opens, and a name missing from all three teams reads
as a player the game has lost. The stick walks the whole row `[NO TEAM, RED,
BLUE, (GOLD)]`, so stepping back off a team is the same gesture as joining one.

**A duel and a free-for-all still get no picker**, unchanged: everybody is her own
side and there is nothing to arrange.

### There was no way out of a match

Two exits: win it, or RESTART — which throws away every clan, star, orb and point
of the afternoon, and is the button sitting directly underneath. **QUIT THE
MATCH** is in the pause menu while `inMatch`, and `inMatch` includes the two
picker screens, which run *before* `Tournament.begin` and so before `active`:
leaving those flags set would fly everybody home and go on feeding all four
kittens a dead pad in the town. Not offered during the griffin ride, because
`_ride` refuses a second journey while one is in the air.

**`Game._goHome` did not exist.** `Tournament.onPartyChanged` has always called it
to end a match when somebody joins or drops out mid-tournament, through `?.` — so
it failed silently and left the girls standing on the deck of an arena three
hundred units north with no ring, no announcer and no ride. It is a real method
now, and `quitMatch` goes through it.

### Everybody was typing the champion's name

`NameEntry.update` folds every pad it is handed into one cursor — largest stick
reading wins, anybody's JUMP confirms. That is right when the question is "which
of the two of you is holding the pad she won on" and wrong the moment there are
four, because the three who lost are also holding sticks: the board was signed by
whoever fidgeted, and a stray JUMP committed a half-typed name. `_signingPads`
filters to the **winning side** — not to `winner`, who is only the kitten the row
is filed under — and falls back to every pad if no winner has one, because a
board nobody can sign is worse than a board signed by the wrong sister.

### The ending unlocked nothing

The scene viewer's *100% mischief — the ending* played the words and nothing
else: no purses, no Awakening, no orbs, no stall, no arena. Watching all 63
seconds made no difference either — **nothing was hung off the scene finishing,
because nothing was hung off it at all.** `_debugEndgame`'s unlock is now
`_unlockEndgame()`, called from the ending as well, so whichever way that scene
is reached the world it describes is the world you get back. It is idempotent, so
on a real 100% run — where `onMischief` has already awakened everything — it is a
handful of assignments that change nothing, and the purse is a **floor** (`max`)
rather than an assignment, so a kitten who has earned more in the ring is not
handed a smaller number by the scene congratulating her.

### The bunny was catchable at a walk and the bird from the floor

Both were measured against the wrong thing.

The rabbit ran at **9.0** against a kitten's 10.5 walk, so holding the stick
toward it closed at 1.5 a second and caught it eventually, with no decision in
it: the middle animal was the easy one with a longer chase attached. It is
**11.6** — above a walk, well under a sprint (17) — so it cannot be caught by
walking and is always caught by a sprint you commit to. The rat stays under a
walk, deliberately: it is what teaches the mechanic.

The hop went **11.88 → 14.6**, which is 2.94 → **4.44** high (height is `v²/2g`,
so the launch does not scale with it). Over a kitten's head rather than level
with it, and 1.22s of air per hop against 0.99.

The bird cruised at **4.6**, and the comment claiming that was "above a jump" was
measuring the wrong number: `Menagerie.strike` allows a swing **6.5 above her
feet**, because a billboard is a flat drawing with a point for a position. So the
hardest animal on the deck cost nothing but walking under it. **7.8** puts it
past that window from the floor with the bob accounted for, and comfortably
inside it at the top of a single jump. `world-check` recomputes both jump heights
from `JUMP_V` and `GRAVITY`, so retuning the jump fails the check rather than
quietly making the bird free again.

### The meal was on the floor

An animal being eaten was pinned on the **ground** in front of her — which is
where you put a thing you are holding *down*, and not a thing you are eating. A
rat lying a metre below her chin reads as a rat that happens to be standing there
while a cat crouches nearby. `EAT_MOUTH_Y` is exported from `player.js` off the
crouch the eating pose is drawn at, so the two cannot drift apart, and `eatLift`
says per animal where it is held:

- **rat and bird — 1**: at her mouth from the first frame. They are mouthfuls,
  and that is the joke.
- **rabbit — 0**: starts on the ground and is drawn **up** to her mouth as the
  hold runs. It is 1.35 units of animal against a 2.9-unit cat, and hoisting that
  to her face on frame one reads as a cat holding a dog. It already shrank to 45%
  over the two seconds; rising as it shrinks points the shrink at something — it
  is going *into* her rather than merely vanishing.

A mouthed bird is placed **two different ways**, because she is doing two
different things: riding at her face along her heading while she runs with it,
and at the mouth spot the instant the swallow starts, because that is when she
drops into the crouched camera-facing pose and a bird pinned to her old heading
ends up behind her head.

### The daze was over before anybody looked up

`DAZE_TIME` 1.0 → **1.5**. A second was long enough to lose a trade over and
still short enough to read as a stumble: the stars were on and off before the
girl who caused it had looked up, and the cost is meant to be legible to the
person who caused it, not merely suffered by the person who took it. Still well
under a knockout (1.8), and the lockout is still twice the daze, so a partner
mashing attack can take at most a third of anybody's time.

---

## The second four-player session — coworkers, on PCs, in a browser

The first session was the tournament's rules being wrong. This one was mostly
the opposite problem: things that were *right* and that nobody could see. Four
adults played a full afternoon and **not one of them joined a clan**, several
of them could not find their own quarter of the screen, and the one ability
that had just been tuned turned out to be tuned for two players and not four.

The Cross Slash half of it is in
[endgame.md](endgame.md#and-then-four-adults-played-it-and-it-was-too-strong),
with the balance page that came out of it.

### Nobody joined a clan, because nothing said they could

A clan hall is a ring of stone with a beam of light over it, its leader is
standing in it, and pressing one button in it gives you a permanent power. All
four of them walked through one and out the other side. There was no bug: the
button worked the whole time, and it was invisible.

**The prompt is over her head, not in the corner.** In four-way split the corner
of a pane is 13px of HUD in a quarter of a laptop screen, and the thing the
prompt is about is a place she is *standing in* — putting the instruction on the
kitten means the instruction and the reason for it are the same object. It is a
`live` Label (see [label.js](../../src/core/label.js)), so the string changes
every frame without minting a texture per distinct sentence.

**It names the button she is actually holding.** `InputManager.promptFor(slot,
action)` reads the live binding — the same `pad`/`half`/`keyset` the action
itself is read through — so it cannot name somebody else's button. That matters
most on the vJoy pair, where the two girls holding the two halves of one device
press physically different buttons for the same action: the left half is told
`RIGHT`, the right half is told `A`. An unknown pad is told `ANY`, which is
true — the `generic` profile really does read every face button for interact —
and a slot with no binding gets `null` and no prompt at all, rather than a
guess. `pad-check` pins every glyph for every profile, including that no action
is missing one, because a missing entry renders as `[]  SWEAR TO RUN` and would
be blamed on the Label.

**Six oaths, not one template.** "Press E to join the Shadowtail clan" answers
*how* and leaves *why* unanswered, and *why* is the question the silence was
really failing. Each clan says its own thing and each one hints at its power —
*Swear to run with Thunderpaw*, *Bow beneath the long blade of Riverclaw*,
*Vanish into the Shadowtail clan*. `world-check` asserts six distinct opening
verbs, so nobody can quietly collapse them back into a format string.

**The reward is stated, and then it goes away.** On swearing, the same label
shows `THUNDERPAW — RUN FASTER` for six seconds and fades out. Six, not
Richard's "ten or more", because it is two words and it is over her head while
she plays; a timed message outranks the standing prompt and survives her walking
straight back out of the ring, which she will, because the first thing anyone
does with a new power is try it.

**And she wears the clan afterwards.** This turned up a live bug: swearing an
oath repainted `marker`, the ring under her feet that exists so a girl can find
herself on a busy screen. Four kittens in Thunderpaw wore four identical gold
rings and player one stopped being the orange one. There are now two rings —
hers, in her colour, always; and a second inner one in the clan's colour, lit by
the oath.

### Which quarter of the screen is mine

Two complaints, one question. Neither has anything to do with the game rules and
both made a four-player session harder than a two-player one.

**The panes moved on their own.** `splitLayout` returns rectangles in group
order, so a group's pane is decided by its index — and an index moves when
*other people* join or leave a pane. Two kittens walking towards each other
merge into one wide pane, the groups renumber, and a player who has been in the
bottom right all afternoon is thrown to the bottom left by somebody else's walk.
`stablePanes` scores every permutation of the returned rectangles by how far it
drags each group from where its members were last frame and takes the cheapest —
at most 24 permutations of four items, once a frame, which is not worth a
cleverer algorithm. **Only identical shapes may swap**, which is what keeps
`splitLayout`'s size rules intact: the pair that earned half the screen must not
be handed a quarter because a quarter happened to be nearer. Ties go to the
identity, so one pane, two even panes, and any frame where nobody moved all
behave exactly as before.

**The pane is framed in her colour, and so is her score.** Six pixels of her
colour *inside* the pane, not in the 3px gap between panes — a frame living in
the gap is three pixels split between two neighbours and invisible on a laptop.
A pane holding two kittens shows both, as a gradient, and the gradient is the
only code path so the shared case cannot drift from the solo one. The score
badge along the top grew to 20px and carries an inner ring in the same colour at
a similar weight; that pairing *is* the feature — "there is a little color icon,
but with 4 players and smaller UI, was hard to see or make the connection". The
thick ink outline stays exactly as it was, because that is what makes every
badge in this HUD look drawn rather than rendered.

### Falling out of the world, and the camera that followed

A kitten knocked hard enough off the arena deck fell forever, and every other
pane's camera zoomed out to keep her in frame.

**`_updateOut` is the ring-out rule and it is right to have holes.** It skips a
fighter who is already knocked out, who is flying as an angel, or who is frozen
inside somebody's cross slash, and it only runs while a round is live or during
the feast. Every one of those exemptions is correct on its own and together they
leave a gap: a knockout landing on the last frame of a big launch is stepped
over, the round ends so the state leaves `live` and the rule stops running at
all, and she keeps going until `Player._respawn` catches her at y = -160 and
puts her in the **town plaza**, three hundred units from a tournament about to
post her back on her mark. `Tournament._catchFallers` is a separate, dumber
question asked of everybody every frame the tournament is on — *is she under the
floor* — and it is the fix.

**The camera clamp is a failsafe, not the fix, and both are wanted.** Every term
in the camera distance is bounded except one: `fitDistance` is a function of the
spread between the furthest two kittens, which a falling kitten makes unbounded.
The ceiling is the one Richard named — the distance that fits one whole island
across the pane, measured off `world.islands` rather than written down, asked of
the same `fitDistance` at the same aspect so a narrow pane still gets a bigger
ceiling than a wide one. Measured at 16:9: the widest legitimate group is 152,
this ceiling is 212, a kitten falling to `_respawn` is 176, and a kitten
respawned in the town while the others are at the arena is 375. So it clamps the
cross-map case and genuinely does *not* clamp the long fall. That is the point:
`_catchFallers` removes the way we know about, and this bounds the damage of
every way nobody has thought of yet.


### Joining a clan, and the two and a half seconds it is now worth

The section above is about nobody *knowing* they could swear an oath. This is
the other half of the same complaint: nothing happened when they did. A kitten
walked into a hall, pressed a button, and the only evidence was a ring under her
feet and a stat she could not see.

**The celebration is `holdAloft`, which already existed and already did the hard
part.** Finding a dragon ball plants a kitten, puts the prize over her head and
pulls *her own* camera in — and the paragraph in `Player.holdAloft` explaining
why that is per-player rather than a cutscene is, word for word, the argument
for doing it this way here too. Four kittens are playing; one of them joined a
clan; stopping the other three to show them somebody else's moment is the exact
interruption the split screen exists to avoid. So the clan oath calls the same
method, and in split screen the other panes never notice.

**The pose is keyed off `aloftT`, not off either caller.** `Player.blessPose` is
a second single-cell sheet — the kitten standing with both paws raised, taking
the thing above her head — and it swaps in whenever anything is being held
aloft. That means the dragon ball pickup got it for free, which it wanted
anyway, and a third such moment cannot forget to.

**A ball for a prize, a card for a picture.** `holdAloft` paints its texture on
a sphere, which is right for a dragon ball and wrong for a clan emblem: wrapping
a flat logo round a ball squeezes it into the silhouette at both edges and
smears the poles, and Thunderpaw's bolt came out bent round the horizon and
unreadable. So a caller with a picture rather than a prize passes `flat: true`
and gets a `THREE.Sprite` instead. A Sprite specifically, and not one of this
codebase's own billboards: every other billboard here is turned by hand in
`faceCamera`, once per pane per frame, and this is the one object that has to be
square-on to **four cameras at once**. three.js turns a Sprite during each pane's
render, so the card is correct in all four quadrants without `Player` knowing how
many there are.

**The clan colour goes on the halo, never on the emblem.** `material.color`
multiplies a texture. Tinting the gold bolt gold burns it to brown, and tinting
Pandapaw's cream panda face green ruins the one emblem that is deliberately not
in its clan's colour. Only the *fallback* sphere — the one you get when a
`clan_*.png` is missing — takes the colour, because it has no texture to spoil
and needs some other way to say which clan this was.

**`BLESS_STRETCH` was guessed wrong, and measuring took five minutes.** The
guess was 1.18, on the reasoning that a cat with both paws stretched over her
head must draw taller than a cat standing. She does not. These are chibi
kittens: their **ears** are the top of the drawing in both poses, and the raised
paws come up beside the head rather than above it. Measured on Frost, whose two
sheets are the clean pair — Ember's raised paws sit level with her ears, so a
band across the top of that drawing catches both and cannot tell them apart:

| sheet | ink height | ear span | height in ear-spans |
| --- | --- | --- | --- |
| `frost_eat.png` | 707 px | 423 px | 1.6714 |
| `frost_bless.png` | 944 px | 564 px | 1.6738 |

A seventh of a percent apart, so both render at one number and `BLESS_STRETCH`
is `0.86` — the same as `EAT_CROUCH`, which is a measurement and not a
copy-paste. It is kept as its own literal rather than aliased, because the two
agree today only because one generator drew both at one scale.

**The camera looks higher during a hold.** The ordinary camera aims 1.4 units
over her feet, which is her chest; the thing she is holding is at `height * 1.4`
above them. At the 12 units this shot pulls in to, that put the emblem hard
against the top of the pane and behind her own HUD chip — found by watching a
Thunderpaw bolt disappear under the word EMBER. The look-at now lerps up by half
her height on the same `k` as the pull-in, so it eases in and out with the rest
of the shot.

**Her leader dances, and only her leader.** `LEADERS[id].cheer` is three numbers
— `hop`, `rate`, `lean` — added on top of the idle bob rather than replacing it,
so there is no second pose to get into or out of. Six leaders, six profiles:
Shadowtail springs highest and barely leans, Windwhisker floats slow and rocks
hardest, and **Icewhisker does not leave the ground at all** — a shiver of
delight is her whole performance, and `world-check` pins that exactly one of the
six has `hop: 0` and that it is her. The hop uses `|sin|`, because a plain sine
spends half its time below the dais.

**Once per clan per kitten, and the guard comes before the spend.** Swearing
somewhere you have sworn before is a correction — you wandered into the wrong
hall, or you are swapping back — and congratulating a child for undoing a
mistake teaches her the game is not paying attention. `Player.clansSworn` is a
`Set` on the player, so a restart clears it with everything else. The first
version added to the set and *then* checked whether she was in a state that
could play the pose, which would burn her one ceremony in a frame she was a
ghost for; the order is now guard, then spend, and `world-check` pins the
positions of the three lines against each other.

### The emblems, and the white background that is about to stop

The six `clan_*.png` are generated flat badges on a white field, keyed out at
load time by `loadSpriteAtlas` like every other sheet here. Two of the six are
drawn *inside a ring*, which is exactly the sealed pocket that
`clearSealedPockets` exists for and which the clan loader does not ask for —
Riverclaw's wave only survives because the flood fill gets in through a break in
the outline. So `world-check` now runs the real `floodBackground` over all six
and pins how many big whites are left: zero for five of them, and **two** for
Icewhisker, whose emblem has a cat's eye in it and whose whites must survive for
the same reason Mr. Satan's teeth do.

That check is a backstop, not a plan. Richard's rule going forward is that new
sprites are generated **with transparent backgrounds** — via Higgsfield's
`remove_background`, since the image models return opaque PNGs — because a model
that understands the subject does not have the sealed-pocket failure mode at
all. The loader needs no change for that and must not get one: its flood only
seeds from pixels with r, g, b >= 218, and a transparent pixel reads (0, 0, 0, 0)
off the canvas, so on an alpha sheet the fill never starts and the art passes
through untouched. The white sheets already in the repo keep working; new ones
skip the risky step.

**And a new pose is four kittens, not two.** `ember_bless.png` and
`frost_bless.png` are two drawings; Storm and Blossom are `recolourAtlas` of
them, derived by PLAYER_STYLE rather than by slot, in a loop that sits directly
under the identical loop for the eating pose. Deriving by slot is one
copy-paste away and gives you Storm receiving a blessing as a grey Frost.


### A seat is not a cat

Five separate reports of "the border colours are wrong" turned out to be one
bug with nine call sites. `Game.roster` maps a SEAT to a STYLE, and it exists
precisely because the two come apart: the character picker lets player 3 choose
Blossom, which makes the roster `[0, 1, 3, 2]`. Nine places in the HUD were
passing a PLAYER index to `styleCss` / `styleFor` as though it were a style
index — the pane frames, the score badges' rings and pips, the names printed on
those badges, the minimap wedges, the panda pips, the inspector cards' `--me`,
the map tag's text and its colour, and the menu-owner line.

Every one of them was right for the girls' usual two-player game, where the
roster is the identity, and wrong for two players at once the first time
somebody picked a cat that was not her seat's default. From the sofa that reads
as **Storm framed in Blossom's purple and Blossom in Storm's teal, with the two
names swapped over the two scores** — which is exactly how it was reported.

The fix is a function that cannot be handed the wrong number. `cssFor(style)`
takes the style OBJECT the kitten was built from, so anything holding a
`Player` asks her directly (`cssFor(p.style)`) and never consults the roster at
all. The five remaining `styleCss` calls in `main.js` are seats with no player
to ask — a join card, a touch-pad kitten, a menu owner — and each resolves
through `this.roster` or through the new `_styleAt`. `world-check` pins that
count, so a tenth caller cannot appear beside them holding a bare seat number.

The map tag was the odd one out and worth its own line: its colour was written
ONCE at build time from the MAP's index, and a map belongs to a *pane*, not to
a player. It moves with the pane, so it is coloured in `_drawMaps` next to the
name it has to agree with, and a shared pane gives its colour up entirely
rather than picking one of the two kittens in it.

### A full-screen scene has no split to furnish

The four coloured pane frames stayed on screen throughout a clan leader's
cutscene. The interesting part is why, because `_paintPaneEdges` was not
painting them wrong: it already refuses to draw outside `state === 'play'`. It
only runs from `_render`, and every scene block in `_tickBody` returns before
reaching it — so the frames were not being redrawn incorrectly, they were not
being redrawn at all, and what was on screen was the last playing frame's
answer, still sitting there.

**A rule that has to be re-run to take effect cannot be the rule for a case
where nothing runs.** So the frames and the per-player cards hide the way the
HUD already does: one class, toggled from `_hudDuringScenes`, which was already
the single place that knows a scene, a tournament, a griffin ride — and now the
trailer — owns the screen. Opacity rather than `display`, for the reason the
HUD's own rule gives, plus `pointer-events: none`, because unlike the frames
the cards take taps and an invisible card that still swallows one is worse than
a visible one.

### One press is one answer to one question

Start ended the trailer and immediately restarted it from the beginning.
Reported on a PS5 pad and nothing whatever to do with the pad.

`trailer.update()` runs before `MenuNav` on purpose — the trailer can be up
while the state is still `title`, and a skip polled only in the play state
would be a video you cannot leave. But closing it puts the menu it was opened
from back underneath *in the same frame*, with the cursor still sitting on
WATCH TRAILER, and on the title screen **every** button confirms. The press was
still there to be found because `pressed()` is a pure test: `held && !prev`,
which nobody spends.

`PadState.consume(action)` marks the edge spent by setting `prev` to `held`.
Not by clearing `held` — she really is still holding the button, and anything
reading `down()` (a sprint, a charge, a held direction) has to keep being told
the truth. All that is spent is the edge, and letting go and pressing again is
a real new press because `prev` is rewritten every frame anyway.

It is called from the trailer and not from `_skipPressed`, and that boundary is
deliberate: the three scene blocks each ask that question and then RETURN, so
nothing else in their frame ever sees the press. The trailer is the one
skippable thing that hands the frame back and carries on.

**And then the same bug came back at the dealer's stall, wearing a worse
disguise.** Reported as *"pressing Interact on the store is not bringing up a
menu — making a clicking sound but I am not seeing anything"*, which sounds
like a rendering fault and is not one. The stall opens the personal card on
`pressed('interact')` and plays the menu blip — that is the click. Then
`Inspector.update` runs **later in the same frame**, and on a card INTERACT
means *back out*. The card opened and closed before a single frame was drawn,
so the click really was the only evidence it had ever existed.

The Start case had already been thought about here — `Game._step` has an
explicit branch exempting a card owner's Start from the pause menu, with a
comment about the press being taken twice. Interact went unnoticed because it
is the press that OPENS the thing, so nobody was looking for a second reader of
it. **A press with two owners is not an unusual case; it is what happens by
default whenever a press both opens a screen and means something on it.**

The stall spends the press it answered. It also stops looking for a shopper who
already has a card up — her interact means *close it*, and that press belongs
to `_drive`; spending it at the stall would have left her with a card she
cannot put away, which is the same bug with the opposite consequence. And
`_drive` now spends every press it acts on, for the owner further down the
frame: the kitten loop runs after `Inspector.update`, and on the frame a card
CLOSES `busy` has just gone false, so her real pad — not `DEAD_PAD` — reaches
`Player.update` with the press still on it. Putting a card away would have
swung her katana. Nothing at the stall happens to be mountable, which is the
only reason that half was never seen.

**The check that would have caught it was impossible to write with the fixture
that was there.** Every `_drive` assertion handed it `{ pressed: (a) => a ===
btn }` — a press that is true for ever and that `consume` cannot touch — so no
check could express "this press has already been answered". The fixture now
models `PadState`'s two fields and its `consume`, and the assertions are that
the press which opened a card does not also close it, that `_drive` leaves
every press it answers spent, and — pinned against the source, because it is a
fact about the ORDER of one frame and nothing constructible in a test has a
frame — that the stall consumes, that it skips a player already holding a card,
and that the open really does happen before `Inspector.update`.

### The clan ring belonged on the ground

Both rings under a kitten are parented to `group`, which follows her into the
air. The marker has always been pushed back down onto the terrain every frame,
in the same block that places the blob shadow; the clan ring was set to
`y = 0.05` in the constructor and then never touched again, so it stayed glued
to her paws and sailed off with every jump.

Its visibility went the same way — switched on once at the moment she swore and
left alone forever, so it rode up onto a dragon with her too. Both are derived
now, from `this.clan` and from the marker, which is the general shape of the
fix: two concentric rings drawn on the same terrain are one piece of furniture
with two colours in it, and anything that moves one has to move both.

## The third four-player session — eleven things, and two of them reverse a decision

Reported as one list after an afternoon on PCs. Nine are bugs; two — the minimap
placement and the split-direction setting — are the game answering a question it
had never actually been asked, and both change how the screen looks for **two**
players as well as four. Those two are called out at the end.

### The maths board was in three wrong places at once

`#math-board` was `left: 16px; bottom: 46px; width: min(540px, 42vw)` in the
stylesheet, which is exactly right for one screen and wrong in every way for
four. 42vw is 806px of a 960px quadrant, so the board was wider than most of the
pane it landed in and covered the kitten standing on the unit circle. It landed
in the bottom-left pane no matter who was in the Dojo, so the girl doing the
maths often could not see her own working while a sister who had never been to
the island got a copy of it. And it carried no `z-index` while `.map-box` does,
so where the two met the board was drawn *under* the minimap. Reported as all
three in one sentence.

It is placed like a map now, from the same panes, by the same function —
`mapSpot` in [core/split.js](../../src/core/split.js). The pane is the one with
the **most** kittens inside the Dojo's view radius, which is the same
"worth most" rule the maps use and has to be, or the two would answer the same
question differently and cross over. The width is 42% of the **pane**, capped at
the stylesheet's 540, so a shared screen and a big pane still come out the same.
The height is **measured** off the element rather than derived: it is a title and
a canvas whose height falls out of the canvas's aspect ratio and the width it is
given, and this file has no business knowing either.

A hidden board is put **back on the stylesheet** rather than left where it was.
It used to return early when the board was down and keep its inline corner, so
the next time it appeared it appeared for one tick in the pane of whoever was in
the Dojo last time. And the throttle is skipped on the frame the board's
visibility changes: `_drawMaps` runs at 20Hz on purpose — it is the only 2D
canvas work in the loop — but it is also the only thing that places the board, so
without that a kitten walking onto the circle got up to 50ms of it in the wrong
window.

### The two maps belonged to Ember and Frost, and that was the bug

There are two minimaps at most, and there are four panes. The old rule was "map
`i` lives in pane `i`", which is stable and strands exactly the wrong people: two
sisters exploring together share **one** pane, so that pane could end up with no
map at all while a map sat in a pane holding one girl standing next to the stall.
Two kids with no map is the failure the minimap exists to prevent.

`assignMaps` deals them out by how many kittens are in each pane, in three steps:
every map keeps the pane it had, any map without one takes the fullest pane
going, and then a pane holding **strictly** more kittens than an incumbent takes
its map. Strictly, because incumbency winning ties is what stops it flickering —
the ordinary four-player case, everybody alone, never moves a map once it has
landed. Two players come out unchanged by construction: two panes, two maps,
nothing to choose.

A kitten in a pane with no map is told so, as an instruction, when she presses
the button — sixth non-negotiable. And `Z`/`X` had to stop indexing `this.maps`
with a player number: the two stopped being the same thing the moment a map could
belong to a pane rather than to a seat, so player 2's bumper was cycling whatever
pane map 1 happened to be in.

### The tag named the wrong kitten

The pane label was built from the map's index, so map 1's tag said "Frost"
wherever map 1 was — including in Blossom's pane. It is built from the pane's own
members now, it says both names when two of them share a pane
(`STORM + BLOSSOM`), and it says `3 KITTENS` rather than three names when the
line would not fit.

### Where a HUD box goes: the seam, not the outside corner

The rule underneath all of the above, and the thing that changed for two players
as well:

**A map hugs the corner of its pane NEAREST the middle of the screen, and the
maths board hugs the corner FURTHEST from it.** On a side-by-side split that puts
the two maps either side of the seam where both girls can read both, rather than
one against the far-left edge and one just right of centre, which is as far apart
as two boxes on one screen can be. The kitten ends up between the map and the
board instead of under either. A pane whose bottom **is** the screen's bottom
lifts clear of `.hint`; a pane sitting on a seam has a seam under it and does
not. A full-width pane has no inside on that axis, so the two boxes take an end
each — map right, board left, the same corners an unsplit screen uses.

It is one pure function, `mapSpot`, which is the only reason any of it can be
checked: a rule written inline in `_drawMaps` could only ever be verified by
looking at the screen.

### The dealer's cursor walked off the question

The stick was read **before** the pending question in `ProfileScreen._drive`, so
the highlight slid off the row "Sell Ward for 90 points?" was asking about and
onto whatever she drifted onto. The purchase itself was always safe —
`_answerHere` takes the id from the *question* — but what she could see disagreed
with what she was agreeing to, which is the same failure one layer up: a
confirmation you cannot trust the look of is not one. `start` is still read
first, because trapping a kid behind a dialog is worse than anything the freeze
prevents, and only **her** cursor freezes.

### "You have 1" was a lie the moment a second kitten could shop

The shelf named `here[0]` — whichever cursor on the row happened to be
lowest-numbered — so two sisters looking at the same orb read one count and the
girl it did not belong to was told how many her sister had. Every cursor on the
row gets its own clause now (`Ember has 0 / Frost has 1`), and the kitten who
**opened** the shop is named last: she is the one who walked to the counter, the
one most likely to be about to press BUY, and the end of a sentence is where the
eye stops.

### The profile screen's bottom row was below the fold

`.kd-panel` was narrow enough that four cards wrapped to two rows, and `.kd-body`
then scrolled — so the offering line, the one thing a trade is about, was off the
bottom on a laptop. The panel is `min(1420px, 96vw)` now and the cards are
`repeat(auto-fit, minmax(260px, 1fr))`, so four fit in a row on anything
desktop-shaped and still wrap gracefully below that. A CONFIRM press that appears
to do nothing because its result is below the fold is the silent refusal the
sixth non-negotiable forbids, reintroduced by layout rather than by code.

### A trade is a pile now, not one orb

`Side.offer` was a single slot index. The thing the girls actually do here — the
older one handing the younger one a fistful of spares — was four separate
agreements and four chances to press the wrong button. It is a **set** of her own
rows: JUMP toggles one, INTERACT takes the whole pile back in one press, and the
question names every orb in it rather than summarising it as "3 orbs".

`kotodama.trade` takes arrays, counts duplicates rather than deduping them (a
kitten can be wearing two of the same orb, and offering one of them is a
different sentence from offering both), checks **both** sides' room before moving
anything, and still accepts a bare id — every existing single-orb check passes
unchanged, which is the point.

**Saying no is the deselect-all**, and that is asked for rather than tidy. With
one orb on the table, leaving the offer up after a no cost one press to undo.
With a pile she has to remember which four slots she picked and un-pick each one,
on a grid where an offered slot and a full one differ by a ring. A no resets
**every** side and says so — "trade is off and everything is back" — because a
screen that silently empties two piles is indistinguishable from one that
crashed.

### The seal was cut once and then lied about the next two cuts

`crossfx` placed the Cross Slash's seal on cut 1 and left it there. A kitten who
turns between cuts is cutting somewhere else, and the strokes were still being
added to a box hanging in the air behind her. It is re-placed on **every** cut
now, so it teleports to wherever the last stroke was thrown — which is exactly
what a player who spins on the spot sees herself doing, and a player who stands
still sees nothing move at all, because the position it computes is the same one.
Only the first cut still *rebuilds* it.

### One ability, one hit

`Player._chargeStrike` tests its hitbox every frame the charge is live — twenty
or so calls for one press. Kittens are protected from that by their
invulnerability window and props by the charge's own `_chargeHit` set; the
arena's animals had neither, so charging through a rat re-stunned it and squeaked
once a frame. Reported as "it hits them many times, you can hear it".
`Menagerie.strike` takes the same set the props use, so a charge cannot end up
with two different ideas of what it has hit, and a new attack is a new set —
nothing here makes an animal permanently immune.

### The camera followed a body out of the ring

A knockout throws her further than the blow that caused it, which is how the last
hit of a round looks different from the eleven before it — and a big enough one
puts her over the rim and down onto the island underneath. The tournament exempts
a knocked-out kitten from the ring-out rule on purpose: she has no health left to
charge back with. So she lay there, forty units outside a 56-unit ring, and the
shared rig went on framing her — the pull-back is sized from the widest gap
between any two players, so the knockout that *ended* the round was watched from
a hundred units up with the ring the size of a coin.

`outOfShot` in [core/split.js](../../src/core/split.js) drops her from the
framing once she is knocked out, outside the deck **and** come to rest. Flying
still counts and landed does not, which is the line the report itself drew: being
launched out of the ring is the shot. It is **not** a ring-out — nothing moves
her, hurts her, or ends anything, and she is still drawn and still on every
minimap. And a pane with nobody left degrades to framing everybody in it rather
than to framing nothing, because pointing the camera at her is a great deal
better than pointing it at the origin.

### The griffin's camera ended the ride looking at the floor

One sign. `back` was `-swing`, and `bx`/`bz` already subtract the heading, so the
swing meant to bring the camera behind the animal took it in **front** of it —
2.4 quads ahead, aiming at a point a fifth of a quad behind the camera and a
whole quad below. `lookAt` down a near-vertical direction has no stable yaw,
which is the spin. Reported as "the camera looks at the ground and spins weirdly
instead of at the pegasus".

### Shield moved to the left trigger, and P stopped being two things

Both are input, and both are written up in [input.md](input.md).

### The two that reverse a decision

**The minimap moved from the outside corner to the seam.** Two players have
always had their maps in the far corners of their own halves. They meet in the
middle now. It is the right rule for four — it is what lets two adjacent panes
share a map at all — but it is a visible change to the game the girls already
know, and it is one line (`inner`) if it should go back for two.

**`splitLayout` now obeys the split-direction setting in three arrangements
instead of one.** The setting used to reach exactly one branch — two even panes
— so a player who asked for a side-by-side screen got one with two kittens and a
stacked one with three, from the same setting, with nothing on screen to say
why. Reported as "is that intentional or overlooked?"

It was deliberate, and the reasoning is still true: for a pair sharing a pane,
and for the bigger half of an uneven 3-and-1 split, a full-width strip is a
kinder shape than a tall column — a three-quarter camera fits two kittens across
a wide pane and has to pull much further back to fit them down a narrow one.
Honouring the setting means a player can now ask for the worse shape and get it.
`fitDistance` is what makes that survivable: the worse shape costs a wider
framing rather than kittens cropped off the edge of their own pane. If the
default should stay stacked regardless, the two branches to pin are the uneven
pair and the 2/1/1 in `splitLayout`.

**And reversed a third time, one session later — the uneven pair is now ALWAYS
side by side.** Left as written above because the reasoning is not wrong; it
just weighed the wrong pane. A 3-and-1 split at 1080p made the lone kitten's
pane 1920x410, and everything about her dealer card was sized off its width, so
she got type and padding measured for a screen 1920 across with 410 of height to
fit it in. The three sisters' pane is the one the old argument was about and it
is the one that can afford either shape; hers cannot. Columns of 1190 and 730
are a shape both halves can live in, `fitDistance` pays for the trio's narrower
framing, and the setting still decides the even pair and the 2/1/1. See *A
squashed pane for the girl at the dealer*, below.

**Quadrants ignore the setting, and that is the answer rather than an
oversight.** Three and four equal panes are already cut both ways at once; the
alternatives are three or four equal columns or rows, which the header rejects
on equal area and on the shape a fixed three-quarter camera can work in.
`world-check` asserts the two come out byte-identical either way, so the
question does not get asked twice.

---

## The fourth four-player session — four things the split screen was hiding

All four came out of the same play session, and three of them are the same bug
wearing different clothes: **something that was sized, positioned or tested
against a full screen, meeting a pane that is a quarter of one.** Worth stating
as a class, because the next one will look new and will not be.

### A squashed pane for the girl at the dealer

**Reported:** all four kittens at the dealer's stall, one of them presses
INTERACT, and her card opens in a pane so short and wide that the card does not
work in it. Only with the split direction set to *Top and bottom*.

**What was actually happening.** Opening a card sets `solo` for that player in
`Game._clusters`, so the four stop being one group and become 3-and-1. That
reaches the uneven branch of `splitLayout`, which — as of the session before,
see above — honoured the direction setting, so *Top and bottom* gave two
full-width strips: 1920x410 for her and 1920x670 for her sisters. The card was
then laid out in `cqw` units, a percentage of its container's **width**, and
`padding: 5%` on top, which also resolves against width on both axes. So a pane
410 pixels tall was handed type, gaps and orb slots all measured against 1920.

**Two rectangles cannot tile a screen except as strips.** The first instinct was
to give her a quadrant and leave the trio the rest, which is not a thing two
rectangles can do — a quadrant plus an L is not two rectangles. Richard picked
the other option: **flip that one split to side-by-side**, ignoring the setting,
so she gets a 730x1080 column and the trio a 1190x1080 one. Two panes, both
tall, both a shape a card and a three-quarter camera can work in.

**Fixed in two halves on purpose.**

1. `splitLayout` no longer consults `dir` for an uneven pair — it returns
   columns, always, at a 62/38 split. `fitDistance` is what makes the trio's
   narrower pane survivable, which is the same argument that made the previous
   reversal safe.
2. The card measures its pane **both ways**. `.pane-card` became
   `container-type: size` (from `inline-size`, which withholds `cqh`), and every
   `cqw` inside it became `var(--u)`, defined once as `min(1cqw, 1.78cqh)`.
   1.78 is 16:9, so in any normal pane `1.78cqh` **is** `1cqw` and a full
   screen, a half and a quadrant come out byte-identical to before. What it adds
   is a ceiling for panes that are not 16:9. The `5%` padding became
   `margin: calc(5 * var(--u))`, and `.pc-slot` — square, so its height is its
   width — got a `max-width` cap that `--u` alone could not give it.

The second half is not redundant with the first. `splitLayout` no longer *hands
out* that shape, but an ultrawide monitor cut two ways can still produce one, and
a rule that degrades beats one that vanishes. `world-check` pins both halves,
and pins the card's rules as **text** — no layout engine in that harness, so what
it can assert is that not one bare `cqw` survives in the card for the next person
to copy.

### You could hardly read the sign over the stall

**Reported:** the text above the store is too hard to read in four-player.

Two causes, and only one of them was the obvious one.

**It was half the size it should be.** A `Label` is a quad of a fixed **world**
size, so the screen pixels it covers depend on the pane it is drawn in — and a
quadrant is half the width *and* half the height of the screen these were sized
against. Every piece of world text in the game comes out at half its linear size
at four players, and `KOTODAMA — 言霊` is eleven characters of a word nobody has
seen before. Both labels doubled: 0.6 to 1.2 world units, 0.5 to 1.0, and the
prompt moved up so the two do not intersect now that both are twice as tall.

**`height` doubled and `size` did not**, which is the part worth remembering.
`size` is the authored height of the *canvas*, so raising it costs texture memory
quadratically; `height` is the world size of the quad, and is free. The labels
are supersampled 3x (`SS` in [label.js](../../src/core/label.js)) and were being
drawn well under 1:1, so the headroom was already paid for. Somebody "fixing"
crispness by raising `size` instead would put megabytes back on a phone's budget,
so `world-check` asserts the canvases did **not** grow.

**And the sign was turned 45 degrees away from the camera.** This is the one
nobody had noticed. `Label.faceCamera` did a plain
`this.mesh.quaternion.copy(camera.quaternion)` — and `mesh.quaternion` is a
**local** rotation, so that only points the quad at the camera when every
ancestor is unrotated. Most callers are; a kitten's group
is a position and nothing else. The stall's group is turned `-PI/4` so its noren
faces the fixed camera yaw, and both of its signs inherited that. Legible up
close, a smear at the size a quadrant draws them.

The fix is the composition: `world(mesh) = world(label) * local(mesh)`, so the
local rotation wanted is the inverse of the label's own world rotation times the
camera's. Identity for every unrotated caller, so nothing that was already right
moves. `world-check` builds a camera, points it at the stall, and asserts both
labels come out square to it.

### The maths board appeared in a stranger's pane

**Reported:** fly a dragon over the Dojo of the Turning Circle and the sin/cos
overlay shows up in the bottom-left of the screen, in a pane belonging to
somebody who is not at the Dojo.

**One question asked in four places, and two of them answered differently.**
`Game` asks *is she at the Dojo* to lift the camera, to switch the board on, to
pick which pane the board is drawn in, and to decide whether everybody shares one
view. Three of the four wrote the `Math.hypot` out by hand, and two of those also
wrote `!p.mount`. So flying in switched the board **on** (that test never cared
how she got there) and then the pane-picker found nobody *standing* on the
circle, fell through to its fallback, and dropped the board at the stylesheet's
fixed bottom-left corner — which at four players is somebody else's pane.

**A kitten on a dragon is in the Dojo.** Of the two ways to make the tests agree,
this is the one that makes sense of the room: thirty units up looking straight
down at a unit circle is the best view of it in the game, and the alternative is
a feature that switches itself off for the player with the best seat.

`inDojoView(p, centre)` and `DOJO_VIEW_R` now live in
[mathdojo.js](../../src/systems/mathdojo.js) — next to the room they describe —
and `main.js` imports them. **One `!p.mount` survives**, in `_clusters`, and it
is a different question: *should everybody share one view*. A kitten in the air
is already forced into her own pane by `solo`, so counting her there would claim
a merge the next rule takes apart again. `world-check` asserts there are exactly
two `!p?.mount && inDojoView` sites and that no hand-written Dojo distance has
come back.

The board also has to move panes the frame it appears, which it did not: the map
transition `_mapT` was only kicked when the pane assignment changed, not when the
board switched on, so the first frame drew it in the last pane it had used.

### The griffin flew them through the torii

**Reported:** it looks bad.

It does. The town is north of the arena, so the flight comes in down the +z
axis; the torii stands at `ARENA_RING + 34` and the landing spot was at
`ARENA_RING + 30` — four units **past** the gate. The last thing the ride did was
carry two kittens through the one piece of architecture out there that means
anything, sideways, at speed, which is the opposite of the ceremony it is for.

Landing moved to `+ 44`, the near side, so the walk in goes *through* the gate —
which is what the comment above it already claimed it was for. `ARENA_GATE` is
now exported from [build.js](../../src/world/build.js) and `arenaGate` from the
world, because two literals four hundred lines apart is how they drifted apart in
the first place. The check asserts the **relationship** — landing before gate
along the inbound axis, room to stand, still outside the seating, still on the
island — rather than the number, so moving either one cannot quietly re-cross
them.

## The fifth session — two small ones

### A third door onto the trade window

The dealer's stall asked two questions — TRADE WITH THE DEALER and LOOK AT MY
ORBS — and there was a third thing four kittens at one counter obviously want,
swapping orbs *with each other*, that you could only reach by pausing the game
and finding a menu item. CHARACTER PROFILE — TRADE WINDOW is now the third row.

It is the **same** screen the pause menu opens, not a second copy:
`ProfileScreen.open('profile')`, the one call. The only thing that differs from
the pause route is that `fromPause` stays false, and that is load-bearing —
`ProfileScreen.close` hands the frame back to the clock only when `fromPause`
is false, and without that the first tick after they stop trading is however
long they spent in there, so every kitten teleports and every dragon jumps.
Chosen from the world means the world was running; closing has to prove it.

The row order — trade, look, profile — is not alphabetical and not arbitrary.
The cursor opens on row 0, and the two rows that freeze all four players are the
outer ones, so the row a girl lands on by nudging the stick once is never the
one that stops her sisters. `world-check` pins the order, the count, and that
`look` is the only one of the three that returns without handing the screen
away.

### The Joy-Con shoulders, and a shared button that toggled twice

Map zoom and the maths overlay were on Joy-Con button indices that turned out
to be guesses, and wrong ones. Moved to where Richard's feeder actually reports
them; the whole account, including why one shared index made the overlay toggle
on and straight back off, is in [input.md](input.md) under *The Joy-Con
shoulders were guessed*.

## The sixth session — six things, and two of them were the split screen lying

Six reports in one message, none of them related to each other, so they went on
one `mixed/` branch. Two of them turn out to be the same mistake in two places:
a piece of layout tuned against a full-width screen, and a split screen quietly
handing it something else.

### The pause menu had grown to fifteen rows

> the list on the Pause Menu settings is getting too long, can we clean it up or
> organize it by potentially breaking up the commands into sub menu's? Could be
> "Gameplay", "Players", "Storyline", "Stats/Features"

It got there honestly, one row at a time, and four players is what tipped it
over: RESUME, SETTINGS, HOW TO PLAY, RECORD BOARD, CHARACTER PROFILE, the story,
the trailer, QUIT THE MATCH, up to three DROP OUTs, RESTART, TITLE SCREEN, QUIT
GAME. On a panel capped at `86vh` that a nine-year-old drives with a stick, one
row per nudge.

**Headings in place were tried on paper first and rejected**, because they make
the list *longer*: fifteen rows plus four headings is worse than fifteen rows.
The only arrangement that actually shortens it moves things a press away, so the
question became *which* things — and the answer is frequency, not category. What
gets asked for mid-game stays on top:

```
RESUME
HOW TO PLAY
SETTINGS
KITTENS & SCORES   →  character profile · record board · DROP OUT ×N
WATCH AGAIN        →  the story · the trailer
QUIT THE MATCH        (hidden unless a match is live)
END THE GAME       →  restart · title screen · quit
```

Six rows at any party size, seven mid-match, down from fifteen.

**QUIT THE MATCH is the one ending left at the top level**, on purpose: it is the
only one that is ever *urgent* — a pair who got into a 2v2 they did not mean to
pick want out of it now, and burying that exit one press deeper is the trap the
button was added to remove. It is hidden the rest of the time, so it costs the
list nothing.

**The seventh non-negotiable comes out stronger, not weaker.** The list still
runs least to most final, so a thumb that overshoots RESUME by one row now lands
on HOW TO PLAY rather than on the end of the afternoon, and RESTART, TITLE
SCREEN and QUIT GAME cannot be reached by overshooting anything at all. Each
still asks first once you get there, and each dialog still opens on cancel.

### …and finding that a pad had never actually been driving the record board

Adding three panels meant touching the list of "panels that sit over the pause
menu" — which turned out to exist **four times**: in the `data-close` handler,
in the Escape handler, in `_overlayOpen`, and, in a different order and for a
different reason, in `MenuNav`'s own `PANELS`. Three of them agreed.

The fourth had never heard of `panel-board`. `PANELS` is a precedence list —
first unhidden id wins — so with the record board on screen the cursor was
driving the **pause menu behind it**, and the board's `data-nav="scroll"`, a
mode that exists for that one panel and nothing else, had never once fired.
Nobody reported it because nobody had tried to scroll the board with a stick.

The set is one `SUB_PANELS` now. `PANELS` deliberately stays separate: this one
answers *does Escape close it* and that one answers *who gets the presses*, and
merging them is how the answer to one question starts depending on the other.
`SUB_PANELS` is ordered innermost-first, because Escape closes **one** — the
record board opens from KITTENS & SCORES with that group still up behind it, so
backing out has to land on the group and not three steps out.

### The maths overlay is a setting now

> let's also add the "Turn Math Overlay during gameplay" option on/off as we may
> remove those from the controllers in the future

A toggle only a key can reach is one a kid on a phone cannot reach at all, and
one whose only record of its state is a button somebody pressed.

**Three values, not a checkbox**, because *automatic* is genuinely a third
answer and not a fudge: on a phone the board lands under the thumb driving the
kitten, so automatic means off out there and on everywhere else, with the Dojo
turning it on when she walks into the room the lesson is in. Choosing ON or OFF
means it on every device **and stops the Dojo overriding her** — a room silently
undoing a setting she just picked is the silent refusal the sixth
non-negotiable forbids. It is a starting point, not a lock: `M` and the pad
still toggle from wherever it put things.

### A pane the layout had narrowed, with nothing to pull its camera back

> When Split Direction is set to Top and bottom, and 1 player is in one split
> screen and the other 3 are together, the camera is zoomed in too much … At
> least zoomed out as much as they were taking up 1/4th the screen, which is at
> least zoomed out twice as much as currently.

The 3v1 branch **overrides the split direction** — decided twice, and the second
answer is the one that survived contact with a player, because a 1920×410 strip
broke `.pane-card`'s `cqw` sizing. So somebody who set the screen to Top and
bottom got a 728×1080 column, aspect 0.67 against a quadrant's 1.78.

`fitDistance` was meant to be the answer to exactly this and could not be: it
frames a **group**, and her group is one kitten, so the spread is 0 and it
returns 0. Every remaining term in `_updateRig` is a constant tuned on a
full-width screen. Nothing in the pull-back knew the shape of the pane when the
pane held one player.

`paneWiden` is that missing term, and the rule is the one Richard named: **no
pane shows less of the world across it than a quadrant of the same screen
would.** A quadrant has the same aspect as the whole screen, so the target is
just `W/H` and there is no second number to keep in step. Measured at 1920×1080,
gap 4:

| pane | size | aspect | widen |
| --- | --- | --- | --- |
| her column | 728×1080 | 0.674 | **2.637×** |
| their column | 1188×1080 | 1.100 | 1.616× |
| a quadrant | 958×538 | 1.781 | 1.000× |

Vertical is left alone. The vertical field of view is fixed by design and a tall
pane already shows more sky and more ground whatever this returns; it is the
horizontal crop that loses the world.

**An even split is exempt, and that guard is the whole compatibility story.**
Two even panes side by side are every bit as narrow — and they are the
two-player game, which may not move. The distinction is not width, it is
consent: an even split is the arrangement the player's own setting promised, and
an uneven one is a rectangle nobody asked for, handed out by the one branch that
also overrides that setting. `world-check` pins five even splits at exactly 1.

### The Dojo's board, at 42% of half a screen

> when there are two players in a split screen at the Dojo of the Turning
> Circle, the math overlay is too small, I think we can make it the full size it
> would normally be, and move it to the top-left of the screen

The same mistake as the camera, one screen along. 42% is a rule about **not
covering the player whose window this is**, and it stops being that rule the
moment the window belongs to two or three of them: a pair sharing a pane got 42%
of 960, a 403px board where an unsplit screen gives 540, and the one thing the
room exists to teach came out too small to read.

It takes its full width and the **top outer corner** in a shared pane. The top,
rather than a bigger board where it already was, because `mapSpot` gives the
board the outer bottom corner and the pane's minimap the inner one — an
arrangement that only works while the board is small enough to leave a corner
over. At 540 in a 960 pane it is most of the bottom edge, with the two kittens
it is *for* standing on the circle underneath it.

Two things it has to clear, and both are **measured, not assumed**:

- **The scoreboard**, whose width is a row of badges whose count and names
  change with the party, so any constant would be wrong at some player count.
  Its rect is read, and the drop is applied only where the two would actually
  overlap across the screen — "as close to the corner as we can" means the drop
  has to be *nothing* when the corner is free.
- **The pane's own minimap.** The first version added up the map's size, its
  padding and the hint line by hand and came out sixteen pixels short, because
  `mapSpot` lifts a box off the bottom of the screen by `HINT_CLEAR` and that
  term was missing from the sum. It asks `mapWidth` and `mapSpot` now — the same
  two calls `_drawMaps` makes — so the reservation cannot drift from the map
  that actually gets drawn. Shrinking to fit is a bounded loop rather than one
  pass, because the board's height is `a·w + c` and scaling by `room / h` always
  lands tall by the fixed part.

### Her worn orbs were squares, and did not say which was which

> it just shows the kanji character and color, but it's hard to know which one
> relates to which ability … the orbs at the top are in a square shape, may look
> better to have them in a circular or orb like shape … Can even use the
> "s12.png" in "out\trailer\shots" as reference

Two reports, one card. The shelf rows say what an orb *does*, in words; the top
row says what she is *wearing*, in kanji; and nothing joined them, so reading
your own loadout meant learning eight characters first.

**The slots matching the cursor's row light up now** — brighter bloom, a ring
swung round, and a lift. Three cues rather than one, because this card is read
at a quarter of a screen and any single one of them is a few pixels. The others
step back, but only when there *is* a match: dimming all eight to point at none
of them is a card that looks broken, and "she is not wearing that one" is
already what the row's own `—` says.

The shape came off `out/trailer/shots/s12.png`, which is the game's own
promotional art of these exact eight objects — glass sphere, specular highlight
high and left, the colour deepening towards the lower-right rim, a coloured
bloom under it, a bright kanji floating in the middle, and a neon ring orbiting
on a tilt. All of it is CSS: two radial gradients, one rotated pseudo-element
and two shadows. No image, because the ninth non-negotiable means an atlas entry
for eight HUD icons is not on the table, and it would go stale the day a clan
colour changed. The ring's `border-top-color: transparent` is the whole trick —
a closed ellipse in front of a ball is a hoop resting on it; an open one passes
behind.

The shelf's dots got the same glass. They are the same eight objects seen twice
on the same card, and drawing them as two different kinds of thing was half of
why the question was hard to answer in the first place.

### Blossom's arrows pointed diagonally

> Instead of pointing left/right, they are pointing diagonally. Must be a bug
> because her name is longer than the others. Also her box is almost twice as
> high as the others.

Both symptoms, one cause, and the report contained the diagnosis. `.tp-cat` is a
flex row and `.tp-keys` was the only item in it with a shrink factor, so when a
name overflowed the column the flexbox took the width out of `◀ ▶` — the two
arrows wrapped onto two lines, which reads as a diagonal pair and doubles the
row's height. Only Blossom's name is long enough to do it.

The prompt is the instruction that screen exists to give, so it is the **last**
thing that may shrink, not the first. The name is a `.tp-name` element now, so
the squeeze has somewhere else to go — a bare text node is an anonymous flex
item and no selector can reach it — and the column's minimum width was measured
off the real row, so in practice nothing gives at all.

### Debug `4` killed Frost

> Pressing '4' End Live Round in debug menu, doesn't end the round, it just
> kills Frost currently.

It did `this.players[1].hurt(...)` and reported the hit — written when two
players was the only number there was, and it looked like ending a round for
exactly as long as that stayed true. At four players it killed one kitten and
left two standing. In a 2v2 it did not end the round **at all**, because a side
is not out until everybody on it is.

The `ROUND_LIMIT` branch already knew how to end a round honestly at any league
size, so that decision is `Tournament.callOnDamage` now and both callers go
through it: the clock and the debug key cannot disagree about who won.

**And nobody is hurt to do it.** A round called on time is not a knockout, so
whoever was ahead on damage takes it with the score she had actually earned, and
an untouched round is a draw that still *ends* — a draw has to move the state
on, or the round the clock just refused to keep open stays open.

## The seventh session — the camera fix that never reached her, and two piles

### `paneWiden` was right, and the one kitten it was for never got it

> When 1 player is in one split screen and the other 3 are together, the camera
> is zoomed in too much for the 1 player.

The *same* report, a second time, against a fix that had already shipped. The
section above is that fix; it is correct; the numbers in its table are the
numbers `paneWiden` still returns. What it never says is **who calls it**, and
the answer was `_updateRig` and nothing else.

`Game._cameraFor` routes a **group of one** to `Player._updateCamera`, and gives
good reasons: the grotto tilt, the Dojo framing, the star pose and the mount
pull-back all live on the player's own camera, and a shared rig re-deriving them
for a group of one would be a second copy of every one of those rules. All true.
But a shared rig is by definition framing **two or more** — so the only caller
of the pull-back was the only camera that could never be the lone kitten's. The
fix was written for her, tested on her pane's dimensions, and wired to everybody
else.

`Player.paneWiden` is a field now, written every frame by `Game._updateSplit`
and applied **last, to every distance** in `_updateCamera` — the walking clamp,
the panda's, the mount's, the Dojo's, the star shot's. It is not a property of
walking or of flying, it is a property of the rectangle, and a pull-back that
appeared and disappeared as she climbed onto a dragon would be the camera
lurching for a reason nothing on screen explains.

Measured in the running game, four players, three together and one away:

| | before | after |
| --- | --- | --- |
| the lone kitten's `camDist` | 24.00 | **63.30** |
| the trio's `rig.dist` | 61.56 | **46.17** |

**Two things keep the two-player game bit-identical**, and they are asserted
separately because either alone would be a coincidence: `paneWiden` still
refuses to answer for an even split, and a Player built anywhere else — every
one in `world-check`, the character picker's — never has the field written at
all, so it is 1 and the arithmetic is a multiply by one. `world-check` drives
the real `_updateCamera` for a bare Player and pins her distance against the
same number the widened one is divided by, plus `NaN`, `undefined`, `null`, a
negative and a string, all of which have to cost the widening and never the
position.

### …and the pane that had MORE screen was being pushed out too

> For the other 3, can zoom in at least 25% more, as it has more screen space.

The rule is written from the narrow pane's side — *nobody sees less across their
pane than a quadrant would* — and read from the wide side it says something
nobody asked for: that the group holding 62% of the width must **also** be
pushed back to a quadrant's framing. A quadrant is the floor for what a pane may
show, not the ceiling.

`BIG_PANE_IN` is 0.75, applied to any pane **over an even share** (`W*H/n`).
Their column goes 1.616× → 1.211×. An even share is the test rather than "the
biggest", because the pane under its share is the one *paying* for the split and
must keep every bit of its widening. Measured, this reaches exactly one pane in
the game: the 62/38 split's wide column. The three-pane column's full-width
strip is over its share too, but its aspect is 3.57 and its widening was already
clamped to 1 — three quarters of nothing is nothing, and there is a check for
that clamp because the multiply now happens *before* it.

### Three kittens joining, all on the same square metre

> Have some randomness when players spawn in the town, so they don't spawn right
> on top of each other.

`_joinSpot` has no memory. Two joins a second apart asked the same question
about the same town centre and both got yes. Force-spawn made that the ordinary
case — ENTER, ENTER seats a third and fourth in the time it takes to press a key
twice — and two cats drawn on one point read as one cat and a join that did
nothing.

Two rules, and they fix different halves:

- **`JOIN_APART`** (3 units) — a candidate a player is already standing on is
  refused, asked of the **live positions** rather than of a list of spots handed
  out, so it is equally true of a kitten who was simply standing there.
- **A random `spin` on the ring search.** Without it the eight rings are walked
  in the same order for everybody, so the second joiner takes the first free
  spoke, the third takes the one the second vacated, and four joins come out in
  a neat line pointing one way. The first rule stops them overlapping; this is
  what stops them *queueing*. One draw for the whole search, so the rings stay
  rings and the search stays exhaustive.

Driven in the game: three joins landed at `(0, 20)`, `(2.1, 22.2)` and
`(-2.6, 18.6)`. All three used to be `(0, 20)`.

**The last resort is still the town centre, overlap and all.** Every rule above
is a preference; a kitten standing on her sister is one flick of the stick from
fixed, and a kitten in the sky is not.

`START_JITTER` is the same report at boot: the four marks are 3.5 apart and
fixed, so every game opened on the same photograph. One unit each way is *some*
randomness and still leaves the four of them in the same left-to-right **order**
every game, which is what keeps "go left, that's yours" true. It is drawn once,
at construction, because `spawn` is also where she comes back after a fall — a
respawn point that moved under her would be the game losing her mark rather than
scattering it.

### A kitten leaves, and her orbs are one orb and six ghosts

> They drop all their kotodama orbs where they were, exact same spot, all of
> them, but the orbs rotating around them stay on screen and are buggy.

Two bugs in six lines, and both were hiding behind a `?? []`.

**The pile.** Every orb went to `p.position`, and `world.findOpenSpot` is
deterministic — same input, same answer — so eight orbs became one orb's worth
of geometry z-fighting with itself. They are her whole neck going back into a
world where only twenty-six exist; a stack of eight has to *look* like eight.
`dropInWorld` takes a `spread` index now and fans them onto a jittered spiral.

Two numbers earned their comments the hard way. The first pass used a bearing
wobble of 0.7rad against a step of 0.785rad — nearly the entire step, so two
neighbours could land on the same bearing at nearly the same radius, and the fan
reproduced the pile it was written to replace, just less often. And the *real*
collapse was `findOpenSpot(x, z, 5)`: five units of clearance plus level ground
for nine around it is the rule for perching a **dragon**, almost nothing near a
town passes it, so every fanned point failed and fell through to the same
deterministic ring the search walks. **A search that refuses everywhere is not a
safety net, it is a funnel.** Measured at 0.37 units between two orbs where the
fan itself never gets closer than 1.3. `DROP_CLEAR` is 1.5 — enough to keep an
orb out of the inside of a house and off a cliff, which is all it was wanted
for.

`world-check` sweeps forty full necks (1120 pairs) rather than sampling one,
because the failure is in the tail; the minimum sits at 1.4.

**The ghosts.** Two constellations orbit a kitten. `orbs` is the plain Kotodama
she has collected; `wornOrbs` is the power orbs she is wearing — the ones the
line above has just thrown on the floor. `_leavePlayer` removed the first and
not the second, so her worn shells stayed in the scene for the rest of the game,
frozen wherever they last were: the thing that moves them walks `this.players`,
and she had just been spliced out of it.

**Both fields are optional on purpose**, so `?? []` made a wrong *name* read
exactly like a kitten with nothing to remove — which is why this is asserted
against the source as well as driven. No amount of exercising an object catches
a field nobody ever writes.
