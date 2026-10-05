# The Dream Dojo — Lionheart's VR arcade

The prototype of Richard's startup, inside the game. A walled-off pad northeast
of the Dojo of the Turning Circle with four holographic tubes on it. A kitten
walks into hers, a visor comes down, she floats, and her view goes over into a
**simulator**: another reality in the same place. Lionheart runs it.

Stages 1 and 2 are built. Stage 1 is the realm system, the arcade, the tubes,
connecting and disconnecting, the holo-Dojo hub, and Lionheart himself. Stage 2 is the
first two training islands, the **Kotodama Gallery** and the **Clan Trial
Hall**, plus Lionheart's **rundown** of the orbs she wears. Stages 3–5 are at
the bottom of this file.

## Richard's brief, in his words

- *"VR is a separate reality ... same location, different layer of
  existence."* That means no cross-realm visibility, separate colliders, and **no
  camera pan** at the moment of crossing.
- The look of the hub: Cloud's subconscious from FF7, plus Snake Way bridges and
  Tron light-cycles. The *mood* is borrowed; no names or assets are.
- Dragons and pandas can't enter. Kittens jump across stepping stones.
- *"A real-world puppet in the tube mirrors her VR actions."*
- Lionheart **is** Richard, with the likeness approved. He's a young red samurai
  kitten with red and black hair, carrying a sword named **Honor** over his
  shoulder: *"Defeat me in battle later and maybe I can share my Honor with
  you."*
- His art is **take B** (`docs/art-masters/lionheart_town.png`). Richard: *"I
  like Take B image more... Take A has issues with the left hand and tail."* The
  bandana lettering in his reference photos is never reproduced.

## How the second reality works — the offset realm

**The simulator is authored in real-world coordinates and drawn 12,000 units
east** (`SIM.dx`). Everything in it lives under one `Group` (`SimWorld.root`)
positioned at that offset. The holo-Dojo is built on the real Dojo's
coordinates, and its port is built on the arcade's.

Things that were considered and rejected:

- **A second `Scene`.** Every system that draws a kitten would then have to know
  which scene she is in: label, orbs, callouts, shadows, the cutscene billboards.
  With the offset, those all follow `p.position` and need no change. Orbs came
  across for free.
- **Same coordinates, one scene, toggled visibility.** That gives no separate
  colliders. A kitten in the sim would stand on the real Dojo's floor, and a real
  sister would see the sim's deck through the world.

**Crossing moves `p.position`, `camTarget`, `camera.position` and `pinnedAt` by
exactly the offset in one frame**, and `_updateRig` shifts a group's rig target
by the same amount when the group's realm changes (`rig.realm`). A lerped
camera chasing a 12,000-unit jump would pan across the void; this is the frozen
shared-rig lesson again.

**`SimWorld` implements the part of the World interface `Player.update` uses**:
- `heightAt` returns `{sim: true}` only for spots in its own layer;
- `resolveSolids`, `props` (empty), `clanHallNear` (null) and `arenaRing` (null);
- `fallY` 4, and `respawn` (back to her own port).

Player gained exactly two hooks: `world.fallY ?? -160` and
`world.respawn?.(p)`. `world-check` asserts both directions of the separation:
the sim never answers for a real spot, and the real world never answers for a
sim one.

**One render call per pane, swapped and put back.** In `_renderView`:
- a sim pane gets `sim.fog`;
- the real sky sphere and petals are hidden;
- `sim.root` is visible only in sim panes.

Everything is restored after that one `renderer.render`. `drawPaneFx` then lays
the matrix rain and the rez flash over that pane only.

**Two realities never share a pane.** `_clusters` computes `mixed`, and while
the party is split between realms every "everybody in one view" rule stands
aside, including the *never split* setting. That setting is a preference about
one world and has nothing to say about two. A kitten on her way into a tube is
`solo` from the moment she sets off (`wantsSolo`), so the phase never washes over
a sister's view.

**A sim pane has no minimap.** A map of the archipelago, with her arrow 12,000
units off its edge, is a map of a place she is not in.

## The sequence

| phase | secs | what happens |
| --- | --- | --- |
| walk | until there | a synthetic pad (`walkPad`, built from `p._basis()`) walks her to her own tube |
| rise | 1.8 | visor on, she floats up `FLOAT_H`, the tube lights in her colour, the rain starts |
| link | 0.7 | full rain and flash, then **cross** |
| rez | 1.4 | she resolves on her port in the sim (the `REZ` shader over her sprite) |
| sim | — | she walks freely, and her puppet hangs in the real tube mirroring her row and facing |
| derez | 1.1 | ...then **cross** back |
| descend | 1.6 | down out of the tube, visor off, free |

**Tube k is player k's.** A kitten pressing at somebody else's tube is told,
in words, which one is hers (non-negotiable 6).

**Nothing hangs off a phase finishing.** `p.realm` and `p.dreamAnchor` change in
`_cross`, which is called at the moment of crossing.

**Anything that takes the whole screen pulls everybody out**:
`_sceneActive() || tournament.active || travel || _finaleDue` calls `exitAll()`.
A scene that frames "the kittens" must find them in the real world.

**Nothing is lost (non-negotiable 4):**
- A save records a sim kitten at her **tube** (`castRow` uses
  `p.dreamAnchor ?? p.position`), never at her coordinates in the void.
- A kitten leaving the game from inside drops her puppet and visor (`drop`).
- A new afternoon calls `reset()`.
- Her panda is handed a `Proxy` of her whose `position` is the Dojo rim at the
  foot of the stones, so it waits where she will come out. It is a real
  `Proxy`, not `Object.create`, because the panda *writes* to its owner.

## The arcade

- **Layout** (`arcadeLayout`): the pad is at `ARCADE {x:-162, z:2, r:14, y:33}`.
  ~~Two stones sit across the gap from the Dojo, with hops of 2.7, 2.5 and
  3.8.~~ ~~"It is currently too easy to fall": four stones on a half-circle.~~
  Three stones and a gate now (`STONES`, `dream/gate.js`; see "The front
  door, and the fix list after it", below).
- **The dome** (`DOME_R` 19) pushes dragons, Ryuuseki and pandas out to r 20.5
  and toasts the rider.
  **The first cut was rejected on sight.** It was a square lattice with alternate
  rows shunted half a cell (a brick wall), at full fresnel, with the follow
  camera sitting about on the shell. The near side came out as an opaque wall
  across a third of the pane. The fix is a real hex cell at half the strength,
  faded to nothing within ~14 units of the lens.
- **The deck colour has a floor.** At `0x1a1c26` the pad read as a hole in the
  world.
- **Hard parts use `toonVertexMat`.** A bare `MeshToonMaterial` without the
  ramp looks different from every other mesh in the game.
- ~~**The visor** sits at `height * VISOR_Y` (0.80).~~ There is no visor plane
  any more: the suit-up dresses her in the headset sheet (see below).

## Stage 2 — the Gallery, the Trial Hall and the rundown

Richard: *"After the Kotodama orbs awaken, then when the player enters the
holographic arena, they can be prompted to have a rundown of all their
currently equipped Kotodama orbs and they will be walked through and explained
what each one does and teach them how to use it."* And: *"they can also apply
different Clan abilities here."*

### The islands

**One table places every island** (`dream/islands.js`). Each is a spoke off
the holo-Dojo, at an angle measured from the port, so "the first two are
either side of where you came in" is a fact about the layout. A wobbling data
bridge runs from the hub's rim to each island. `world-check`:
- measures every pair for a clear gap (the tightest is the hub and the port at
  32 units);
- walks each bridge's own path, a step at a time, for gaps and ledges (worst
  step 0.04).

All ten islands are in the table now, so a later stage cannot drop one on top
of another.

### The training gate — how a blade in here finds anything

**The Player is not told.** `Player.update` is handed a `hud` (the Game) and
asks it who it may hit. A kitten in the sim is handed `makeSimHud` instead, a
`Proxy` of the Game (`dream/simhud.js`):
- `strikePlayers` → `TrainingGate.strike`, which can only find **holograms**;
- `arenaLive` → yes, so the two clan powers that only work in a live round
  (盗 Steal and 息 Breath) can finally be practised;
- `players` → the holo-kittens, so a 盗 mark can only ever choose one of them;
- `onMischief`, `strikeCritters` and `strikeWards` do nothing.

`TrainingGate.strike` copies the real gate's geometry: the reach scaling, the
height window and the arc test. That way a cut that would land in the ring
lands here, and one that wouldn't, doesn't. Every target has an **owner**, so
four sisters can run four drills on one floor without finishing each other's.

**Non-negotiable 3 holds.** No round is ever live while anybody is in here,
because `update` pulls everybody out first. And `world-check` fails if
anything under `dream/` calls `hurt()`.

### Loans and trial oaths — nothing is lost

**A lent orb is in `p.power` and the worn ring, never in `powerOrbs`**
(`DreamDojo.lend`). Everything that saves, trades, deals or steals reads
`powerOrbs`, so nothing outside the sim can see a loan.
- **Loans top up by count.** The Long Guard drill asks for two Nagamori, and a
  kitten who owns one is lent the second.
- **Leaving the sim gives it all back** (`_leaveSim`, called from `_cross` and
  `drop`): her power is rebuilt from her own orbs, along with her ring, her
  real clan, any drill and rundown, and her SIM bar.

**A trial oath keeps her real clan on `p.dreamOath.was`**, the first time only,
so two trials in a row still remember the real one. `castRow` saves
`dreamOath.was`, the same way it saves `dreamAnchor` over her position. A
trial oath never calls `onJoinClan`, so no cheer, no panda and no quest.

### The SIM bar

Holograms hit her **SIM bar** (`simHit`), never her health. It asks the same
questions `hurt` does, in the same order:
- a Flash Step is untouchable;
- a Ward blocks, and a blow costs the Ward exactly what it costs in the ring,
  through her own `_wardTakeHit`;
- a fresh hit is followed by 0.6s of grace.

When the bar is empty the simulator catches her and her drill stops, saying so.
A hit is a **nudge** (6 u/s and a hop) **away from the nearest point of the
beam**. The first cut threw her at 9 u/s, away from the beam's *end*, which
carried her sideways along the Flash Step wall and, once, off the gallery mid
drill. `world-check` pins both the direction and the size.

### The drills

A drill is a goal, a clock and her own holograms (`dream/drill.js`). Its card
hangs over her head, and every way it ends says so:
- a win;
- the clock running out;
- she walks off the floor;
- her bar empties.

Stars go into `DreamProgress` the moment she earns them. While her drill runs:
- the pedestal and shrine cards step out of the way;
- the stations stop answering INTERACT, because it is the drill's button then
  (the Windwhisker shrine is a breath from its holo-kittens).

**Every drill is a gate on what it teaches, and the numbers are measured.**
The thresholds are exported, and `world-check` checks them against the real
reach and the real jump:

| drill | the number | bare | with it |
| --- | --- | --- | --- |
| 斬 Long Cut | ring 4.3 | cuts from 4.00 | 5.02 |
| 河 Riverclaw | ring 5.4 | the Long Cut orb 5.02 | sworn 6.72 |
| 跳 Leap | ledge 5.0 | two jumps land 4.60 | three 7.01 |
| 影 Shadowtail | star 6.8 | two jumps 4.60 | sworn 9.14 |
| 守 Long Guard | beam 2.44s | a Ward is up 2.20s | two lent, 3.40s |

**The Long Guard drill was rebuilt twice.**
1. **A stream of bolts could not be passed by anybody.** Every bolt is a blow,
   and `WARD.hits` (2) blows smash any bubble. Now it is one **held** beam,
   which asks only whether the bubble is up (`simHit(..., {hold})`).
2. **One lent Nagamori left 0.36s of slack.** In the browser, a raise 0.39s
   before the beam fired lost the last two frames. It now lends a pair, which
   gives 0.96s, while the beam stays 0.24s past anything a bare Ward can do.

A three-jump chain is **full, full, then ×0.86**. Only the *last* jump is
weak. The first comments said 5.98 for three jumps, which was wrong.

### The rundown

**Lionheart offers, never forces.** Once per visit he says she is wearing N
Kotodama and that he will run through them. If she talks to him, she gets one
card per kind over her own head, in the order she wears them:
- what the orb is and how many she has;
- what that many does, using the orb's own `detail`, the same sentence the
  profile prints;
- which of *her* buttons does it.

Then comes her real clan's ring power. **It reads her real orbs, not her
loans.** INTERACT turns the page and walking away closes it.

While the rundown is open:
- the hologram stops talking, because his bubble would land on the card;
- the callout hides, because the card already names the button.

**The hologram has his own bubbles.** In stage 1 the welcome hung off the
*real* Lionheart, in a reality no kitten in the sim could see.

### What persists

`kk.dreamdojo.v1`, per kitten (by name) and permanent. It holds stars, bests
(lower is better for times), flags, and day and week keys for the rotation in
stage 5. Stars only go up. A corrupt store starts empty instead of throwing,
and no storage at all just means a session that forgets. The debug panel's
**wipe the DREAM DOJO stars** row has no key, asks first, and shows the count
in its button.

## Stage 3 — the Tameshigiri Range and Kata Trace

Two more islands, raised the same way: the **Tameshigiri Range** (試斬, +78°,
on her left past the Gallery) and **Kata Trace** (型, −78°, on her right past
the Hall). Lionheart's islands line names all four. Both use `dream/kiosk.js`,
which is the gallery's pedestal pattern made into one class: a pad to stand
on, a sign, and a card for the nearest kitten that hides from anyone mid-drill.

**Two hooks were added to the drill**, and both only watch:
- `spec.swing(d, kind, n, id)` is called from `onStrike` for **every** swing,
  including one that hits nothing. The gate stamps a swing id, because a Cross
  Slash is three calls.
- `spec.pad(d, pad)` is called from `padFor`, so a kata hears the JUMP press
  itself rather than her feet leaving the floor. `pressed` is a pure edge test
  and this never consumes it.

`spec.paint` replaces the drill card, and `spec.face` is the drill's own
`faceCamera`.

### The Tameshigiri Range

| mode | what | score | ★ / ★★ / ★★★ |
| --- | --- | --- | --- |
| 一閃 ONE SWING | 16 canes (4×4, 2.4 apart), 30s, they stand back up after 1s | the most cut by ONE swing | 3 / 5 / 6 |
| 連撃 COMBO 60 | two posts always standing 4–8 units from her, for 60s | the longest chain, each cut within 2.5s of the last | 8 / 20 / 32 |
| 角 CLEAN CUT | a cane, a unit circle in front of it, a white blade line turning | seconds for five clean cuts | 75s / 40s / 24s |

**ONE SWING's stars are measured off the real gate.** `world-check` stands a
kitten at every half-unit round the grove, facing 32 ways:

| attack | best | note |
| --- | --- | --- |
| standing slash | 7 | three stars is 6, so there is a cane of slack |
| Goblin Sweep | 14 | there to be found |
| (dash 8, charge 5) | | measured once, at a quarter-unit |

**Each seat gets her own quarter of the island.** The range's `floor(p)` turns
`fwd` a quarter per seat. That way four sisters on ONE SWING get four groves,
not sixteen canes stacked four deep. At `ahead` 7, two neighbouring groves'
corner canes were **0.28** apart. At 9.2 they are 2.83 apart. The kiosks moved
to 17 units out, near the bridge, because every other spot was somebody's
grove.

**CLEAN CUT is non-negotiable 1.** The gold target line, the turning blade
line, the slice drawn on a clean cut and the `(cos θ, sin θ)` printed on her
card all come out of one function, `cutGeometry(deg)`. `world-check` checks
two things:
- it parses the printed numbers back out of the text and compares them with
  the tip of the mesh: worst 0.004, which is the rounding to two places;
- the slice runs from −tip to +tip at the angle she actually cut.

The targets are the twelve non-axis angles from 30° to 330°, chosen so that
both numbers always mean something and both signs change. A cut more than 12°
off is refused and **says** both angles. The blade turns at 55°/s in round 1
and 115°/s in round 5.

### Kata Trace — the core

Four floors at the island's corners. Each floor has nine marks: the middle,
and eight on a ring at 3.4. Each floor has two kiosks, DAILY and WEEKLY.
**Any kitten can use any floor**, but a floor somebody is mid-kata on refuses
in words ("Ember is using this floor — there are four, try another"). There is
no "floor k is seat k" rule, because nobody would know which one was theirs.

**`makeKata(kind, key)` is pure.** It runs mulberry32 over an FNV-1a hash of
`daily:2026-10-03` or `weekly:2026-W40`. That means:
- four sisters do the same kata today and can compare;
- tomorrow's is a different one without anybody shipping anything.

A random kata on every press was rejected: nobody can get better at a thing
that changes every time.

| | daily | weekly |
| --- | --- | --- |
| steps | 8 | 12 |
| moves | 歩 STEP · 斬 CUT · 跳 JUMP | + 守 GUARD (a pair of Wards is lent) |

**The generation rules**, each one a way an earlier version was wrong:
1. It opens on the middle mark with an action, because she is standing there.
2. A STEP always goes somewhere.
3. No mark is more than `TRAVEL` × gap from the last. `TRAVEL` is 3.7 units a
   beat: walking is 10.5 u/s, a beat at 120 BPM is 0.5s, and that leaves her
   30% of the beat to look and turn.
4. After a GUARD comes a two-beat gap.
5. **No move three times running.** The first weekly drawn in the browser was
   six GUARDs out of twelve, four of them in a row.
6. Every move in the pool appears at least once. The pass that makes sure of
   this could at first strand the step after the one it changed: the 7th of
   February asked for a 4.8-unit stride on one beat. It now checks the step
   on both sides.

`world-check` walks a year of dailies and weeklies. A one-off run over twenty
years (14,640 katas) found nothing.

**The run.**
1. Lionheart's ghost dances it from the kiosk's point of view: two count-in
   beats, then every step on its beat. She watches from the kiosk.
2. Then comes her count-in of four beats ("YOUR TURN · to the gold middle
   mark").
3. Then she does it back. A gold ring closes on her next mark, the one after
   is drawn faint, and the move and its button are **on her card** (斬 CUT [F]).

The move first had its own panel over its mark, and it failed both ways:
- 3.2 units up, a far mark's panel rose into the toast band;
- 1.4 units up, it stood in front of her, since every action is done on the
  mark.

**The judge.**
- **Timing:** within 0.10s is PERFECT, 0.18s GREAT, and up to the window
  (0.35s, capped at 0.45 of a beat so two beats' windows never overlap) GOOD.
- **Off the mark:** standing more than 1.2 from the mark caps the grade at
  GOOD rather than throwing it away.
- **A STEP** is judged at its beat by distance: 0.6 / 0.9 / 1.2.
- **A miss** is the `miss` thud, not a buzzer.

Accuracy is the points over three per step. 50 / 75 / 90% gives one, two or
three stars. Below 50% it ends with the score and "Watch him again!".

**Tempo tiers** are 80, 100 and 120 BPM. Two stars on one opens the next, per
kata, per day or week. Progress ids look like `kata.daily.2026-10-03.L2`.

**Verified in the browser:**
- A daily done with real F and Space presses on the beat: 100% at 100 BPM,
  and again at 120.
- Lionheart's ghost on every mark on his beat: 0.001 off, measured in
  `world-check`.
- CLEAN CUT refused a real swing 60° off and cut one at 236° against a 240°
  target.
- ONE SWING cut 4 with one press from a guessed spot.
- COMBO 60 chained 6, then dropped to 0 after 2.5s idle.

## Stage 4 — the far islands

Four more islands and the roads to them. The two nearer ones (**Kudamono
Storm** 果物 at +116°, **Sine Gauntlet** 正弦 at −116°) have bridges like the
rest. The two far ones (**Holo-Sentries** 番兵 at +150°, **Bamboo
Infiltration** 忍 at −150°, 250 out) are `cycle: true` in `islands.js` and get a
**data highway** instead. Lionheart's line now names six and says "the far
two? Take a LIGHT CYCLE!"

### 光 The data highway and the light cycles (`dream/highway.js`)

Richard's brief was "a tron-style motorcycle". A highway is laid in place of
the bridge by `_raiseIsland` when the spec says `cycle`: a wide ribbon deck
with a gold lane line, and a 光 pad at each end. Each pad is three units back
onto solid floor, so getting off is never getting off onto the seam.

- **The highway is still a bridge.** A kitten can walk it, and a ride cut short
  leaves her on a floor. The ride's path *is* the deck's own polyline, so it
  never goes anywhere the deck is not (non-negotiable 4).
- **A ride is cargo, like the griffin.** While she rides, `padFor` hands her
  the dead pad, INTERACT is swallowed and no prompt shows. The highway sets her
  position every frame after the players have ticked. `_leaveSim` stops a ride.
- **Speed is a trapezoid:** 0.6s up, cruise at 55 u/s, 0.6s down. The road
  arrives at exactly `L`, never past it. 185 units takes 3.9s, against 17s on
  foot.
- **The look has to read from BEHIND**, because that is where the camera
  rides. The first cut was a dark box with torus wheels and a 1.1-tall trail
  wall. All of it was edge-on to a chase camera, so a ride looked like a
  kitten sliding along with two thin lines behind her. Now the cycle has:
  - a lit fairing with its edges drawn;
  - a tail-light bar;
  - an under-glow on the deck;
  - a trail that lies flat on the road as well as standing up.

  She sits `SEAT` (0.5) above the deck. The cycle lives in the layer, not in
  her group.

### 果物 Kudamono Storm (`dream/storm.js`)

Holo-fruit is lobbed from six rim barrels. Cut it before it lands; leave the
purple 毒 viruses (−3, a SIM hit, and a hint the first time). The run lasts
45s. A throw comes every 1.4s at first and every 0.55s by the end, sometimes in
pairs. Stars at 10 / 20 / 28 points.

- **Every lob is aimed.** It is solved for a point within `LAND_R` (2.6) of
  where she stands when it leaves the barrel, and pulled in if that would
  miss the deck. A **ring on the floor marks the landing**, and it tightens as
  the fruit falls. It is drawn at the point the lob was solved for.
- **The arc is flat, and that was a fix.** A standing slash reaches 4.0
  above her feet: the gate's `strikeHeight` 3.4 plus a fruit's `hitUp` 0.6.
  The first cut (G 6, 2.3–2.8s) peaked near 5.8 and spent **0.36s** of its fall
  in reach, so the header's 0.8s `CUT_WINDOW` was a claim the code did not
  keep. Now G is 4, the flight lasts 2.1–2.6s, and the arc peaks at 4.5 at
  most. Measured: ≥ 0.87s in reach over 300 throws. 2.2–2.7s measured 0.80,
  right on the line, so the range was moved again rather than shaved.

### 正弦 The Sine Gauntlet (`dream/course.js`, `dream/sine.js`)

**It was four lanes, one kitten each, and Richard took it apart:** "the
camera angle, lack of shadows on the lasers, shape of the lasers, and small
area to navigate, makes it hard to navigate through without getting hit and
makes for a bad experience ... turn this into more of a Ninja Warrior type
course, with obstacles and different patterns, requiring different movements
and techniques ... have 1 course lane and have the 4 players queue up in
competition, going one by one and competing for the best time."

So it is now **one course, run one kitten at a time, against the clock**.

**The course.** Three lanes snake across the island, with a turn at each end.
There are six obstacles, and each one is different maths and asks for a
different move:

| section | maths | the move |
| --- | --- | --- |
| standing wave | three bars on y = 2 + 1.6·sin(1.6t) | duck the crest, hop the trough |
| travelling wave | y = 2 + 1.6·sin(1.8t − 0.8n): the crest walks down the lane | ride the wave |
| sine stones | four floating floors over a zap floor, each on its own sine | step across while they are level |
| the sweeper | an arm turning about a pivot, with its **cos** and **sin** drawn as dots on the two axes | jump it as it comes round |
| gap curtains | two walls of beams with a gap riding a sine | go through the gap where it is |
| counter-wave | y = 2 + 1.7·sin(2.4t + 0.9n): the crest comes AT her | read it early |

L1, L2 and L3 are the same course at speed 0.8, 1.0 and 1.3. Two stars on a
level opens the next. The session runs at the first joiner's level.

- **Non-negotiable 1, still.** `course.js` is pure, and it is the one place
  each of these is decided:
  - where every beam, stone and dot is;
  - what her card prints (`bar 1: 2.0 + 1.6·sin(128°) = 3.25`);
  - whether she was hit.

  `_paintCourse` is the only writer of the drawing. `world-check` reads every
  beam end, stone and dot back to within 0.01.
- **A hit is a ZAP, not damage.** `hitAt` asks the same segments that are
  drawn. A hit teleports her back to the last checkpoint, and the clock keeps
  running. Nothing under `dream/` calls `hurt()` but the panda's, and the SIM
  bar is never touched.
- **Fair, because it is one clock.** Every hazard runs on the run's own clock
  from GO, so every kitten in the queue faces exactly the same course.
- **The stars are measured.** `fastestRun` is a search over (place, time) with
  wait, step and hop moves. Fastest times, in seconds:

  | level | sprint + hop | walk + hop | walk, never hop | ★ / ★★ / ★★★ |
  | --- | --- | --- | --- | --- |
  | L1 | 8.6 | 13.0 | never finishes | 150 / 39 / 19.5 |
  | L2 | 10.3 | 13.6 | never finishes | 150 / 40 / 20 |
  | L3 | 8.0 | 13.1 | never finishes | 150 / 39 / 19.5 |

  Three stars is 1.5× a perfect walker and two stars is 3×. A nine-year-old
  who walks it and gets zapped twice still earns two. Nobody gets through
  without hopping, which is the stones doing their job. `world-check` re-runs
  the search, so a change to the course that breaks the bands goes red.
- **The geometry is measured too.** `END_B` is 19.3, not 19.5: at 19.5 the
  outer corners stood 0.07 past the island's edge, and the every-post-on-the-
  island check found it.

**The lasers.** The old bar was a 0.3 tube with nothing under it. Each beam is
now a thicker glowing core with an emitter at each end, and it has three
height cues:
- a **shadow** straight under it, dark and sharp when low, wide and faint
  when high;
- a **footprint** of its own colour on the floor, which is there because a
  black shadow at 0.36 on this near-black floor was checked in the browser
  and could not be seen;
- **drop lines** from each emitter to the floor, so the height reads against
  its own post. The curtains have none, because their posts already are.

`world-check` holds all three to the beam, and holds the direction of the cue:
a low beam reads stronger than a high one.

**The queue.** One kiosk in the plaza by the bridge:
- The first kitten to press it runs. Everybody after her goes into the
  **cheering stands**, a walled deck by the plaza. Its posts are solids, so
  nobody falls or walks out, and ATTACK cheers (once per half second, however
  hard she mashes).
- The board ranks the session: finished runs first, fastest first; then the
  rest, furthest first.
- **Holding INTERACT stops a run; one press never does** (non-negotiable 7).
- Out of the stands by the 出口 exit pad. Her place in the queue goes and her
  time stays on the board.

**One pane.** "Spectating players can watch and have similar camera view of
the active player ... camera does not need to be centered on them or split
screen":
- `paneAnchor` stands every kitten in the session where the runner is, for
  `clusterPlayers` only, so the session is one group.
- `groupShot` gives the shared rig the course's camera, side-on from the +a
  side and centred on the runner.
- Both are null outside the session, so two players in town are bit for bit
  what they were.
- **The shot is measured.** Every point of the path, with what is 2, 3 and 6
  units ahead of her, was projected through the lens against the real 300px
  minimap: 0 of 1944 off the frame or under the map, at 1920×1080 and
  1280×720 full screen and at 1920×1080 half screen. Every lead tried was no
  better anywhere, and worse in a small window. Centring on the middle lane
  was worse again, because the lanes are the depth of this shot.

**The rack.** "stripping the player temporarily of their equipped kotodama
orbs and clan abilities if they do join the course ... and return back to
them in their Holographic Character Profile":
- `dream.bench(p)` sets `benched`, and `_applyKit` wears none of the holo kit
  while it is set. `holoWorn` itself is never moved, so nothing can be lost.
- The holo clan is held on `benched.clan`.
- `unbench` puts it all back and says so: "your holo kit is back on. It is
  all in your (HOLO) PLAYER PROFILE". That happens when she leaves the stands,
  when the session closes, or when she leaves the simulator. `_leaveSim` calls
  `sine.forget` first, so the clan is back on her before the lines that undo
  the rest.

### 番兵 Holo-Sentries (`dream/sentries.js`)

The first thing in here that shoots back. Four sentries stand round a core in
her own quarter of the island, one quarter per seat. Each fires a bolt at
where she *was*, staggered so no two fire on one beat. The core sits under a
shield until the last sentry is down, then fires fans of three. Stars at 80s /
50s / 32s.

- **Every shot is told first**: the eye swells and goes white for `TELL`
  (0.7s). Measured: 0.70s for each sentry, first shots 0.65s apart.
- **Richard's bar rule holds without being said.** The sentries take three hits
  and wear no bar. The core takes eight and wears one.
- **The shield refuses in words** and counts the sentries left.
- `Drill.boltTo(from, to)` was added for the fan, since only its middle bolt
  is aimed at her.

### 忍 Bamboo Infiltration (`dream/bamboo.js`)

Through a seeded holo-bamboo forest to the scroll 巻, past four watchers whose
sight sweeps **θ(t) = θ₀ + S·sin(ωt + φ)** (a sine again, on purpose). Seen for
0.35s and she is caught. That sends her back to her last lit lantern for +10s,
and it says so. A catch costs time, never the run. The score is the clock
plus 10 for each sighting, with stars at 90s / 55s / 36s. There is no time
limit: leaving the island is the way out.

- **The forest is generated from a seed and a route**, never by hand. Clumps
  fill the island except a corridor round the route. `world-check` measures
  1.2 units of clearance either side of a kitten.
- **The first layout could not be crossed, and a search proved it.** The path
  runs *along* each watcher's sweep. His cone is therefore always somewhere
  between her and the far side, and passing through it takes about 2.2s
  against a 0.35s catch. A greedy bot got stuck; a time-expanded search over
  (place, time) found no way through at **any** start time. **The fix is one
  hide per stretch**, a clump between each watcher and the middle of his path.
  Its shadow is the stepping stone: in while he looks away, wait, then out
  while he looks the other way. The search now finds the scroll unseen in
  16–25s at a walk from every start time, and 3★ (36s) is 1.4× the worst.
- **The lanterns were inside the cones** about 20% of the time in the first
  layout. The checkpoint she was sent back to could catch her again. Each
  sweep now stops `WATCH.margin` short of its stretch's corners. `world-check`
  asserts the start, the kiosk and every lantern are **never** seen.
- **The cone on the floor is clipped by the bamboo.** Each of its 28 rays is
  `sightReach` long: the first clump `seenBy` would call in the way. So the
  shadow behind a clump is drawn exactly where she is safe. `world-check`
  reads every ray's end back through the mesh's transform: just inside is
  seen, just past is not. That is 0 wrong of 540 rays, 274 of them cut short
  by bamboo.

### Stage 4 verified in the browser

- A real E press on the hub pad rode the highway to the sentries. The ride
  ended 0.00 from the far pad, and the ride back landed on the hub pad.
- The Sine Gauntlet went live with its traces. Her card read the working for
  bar 0 at 128°.
- The storm lobbed fruit from the barrels. A sentry's eye was caught white,
  the core was shielded, and a bolt took 12 off her SIM bar.
- Bamboo: SPOTTED sent her to the start with +10s on her card. The first
  lantern lit in her colour, and the cones lie clipped by the canes.

## Stage 5 — the Arena School, ranks and Shadow Lionheart

Two more islands. 闘技 **ARENA SCHOOL** (ang 180, dist 150, r 28) is straight
across from the hub. 影 **SHADOW LIONHEART** (dist 330, dy 26) is past it, by a
light cycle that starts on the **school's far rim** (`spec.from`) rather than at
the hub. A road from the hub would run across the school's floor, and
`world-check` refuses any crossing that touches an island it does not end on.

### 闘技 The Arena School (`dream/school.js`)

- **Six practice pads (対), one per tournament mode**, in `MODES` order round
  the ring. Each runs a 40s round against holo-kittens under the arena's own
  rules. `decideOnTime` and `purseSplit` are now **exported from
  tournament.js and called by both**, so the school cannot teach a rule the
  arena does not use. `sideMean` is checked against `_sideHealth` on 300 random
  sides.
- In a handicap mode **she takes the handicapped seat** (`HER_SEAT`). Her blade
  on a partner is refused in words.
- A holo-kitten **turns white and winds up for 0.65s before every blow**. A
  blow on her goes through `simHit`; holo-on-holo is plain arithmetic.
- **Knocked out? The round goes on** with her counted as nought, which is the
  tournament's rule. This uses the drill's new `caught` hook: `_simCatch` asks
  the drill first, and only fails a drill that has no answer.
- **板 The scoreboard** shows the nearest live round:
  - each side's health and hits landed;
  - who is ahead and **why** (health LEFT, or level and ahead on hits);
  - what the purse would pay.

  With nothing live, it explains the four rules. **A decided round stays up
  for 12s** (`BOARD_HOLD`). The drill is disposed about 3s after it ends, and
  the board used to drop back to the rules before anybody had turned round to
  read it. Found in the browser.
- **食 THE FEAST** is the menagerie's eating, in holograms. A blow stuns a
  critter and never breaks it (an `accept` refusal). She stands still and
  **holds** attack for 2s, and letting go starts the chew again. It heals what
  the real critter heals, and starts her at 40% SIM so there is something to
  heal. The floor was `PEN_R + 3`, and the pad is 13 out, so the drill went
  live and stopped her for leaving the floor she was standing on. A check now
  starts every school pad and keeps her on it.

### 剣士 Ranks, the Fighter Card and the rotation (`dream/rank.js`)

| rank | needs |
| --- | --- |
| KENSHI 3rd Class | — |
| KENSHI 2nd Class | 24★ (Shadow Lionheart used to ask for it; since Richard's "anyone can do the quest" his door is open to all) |
| KENSHI 1st Class | 60★ **and** a win over the Shadow |

First Class is the one rank stars alone cannot buy. A total can be earned an
easy star at a time, but the final exam cannot.

**The Fighter Card** (札 kiosk) is Richard's Belegarth card in the game's own
frame:
- her portrait, read from cell (0,0) of her own sprite sheet;
- her name in her colour, her rank, her signature move (the gallery drill she
  has starred best) and her stars;
- foil that catches the light as she walks round it.

It is drawn from `cardFacts`, which is pure, so the card cannot say anything
the progress store does not.

**Today's training** (今日 kiosk) is one drill a day and one a week, out of a
pool of 32. The pick is FNV-1a over `dayKey` / `weekKey`, so two tablets set
two sisters the same drill. The weekly pick is never the daily one.
- Clearing the daily pays +1★.
- Three-starring the weekly pays +2★.
- Both are written as stars under their own ids (`daily.<day>`,
  `weekly.<week>`), so the rank counts them with no second rule.
- An unfinished *today* does not break a streak.

### 影 Shadow Lionheart (`dream/shadow.js`)

The co-op final exam. His bar is 24 blows for one kitten, plus 12 per sister.
He has 240s. A kitten the simulator catches is set back down at the ring's
edge, at a cost of +15s on her time, and the fight goes on.

His three moves are each **drawn on the floor by the same function that tests
the hit**: every telegraph corner was checked inside and outside, 0 wrong.
- **SLAM**: a red line. Step out of it, or Flash Step.
- **SWEEP**: a red disc. Jump; a jump is clear for 0.75s against a 1.1s tell.
- **CROSS SLASH** (phase two, at half his bar): an X laid on *her*. After it
  he is **OPEN** for 2.2s, and every blow counts twice.

He only telegraphs a phase-one blow once she is inside its reach. A slam whose
line stopped 11 short of her taught nothing.

**The win pays the tenth quest**, 🦁 *Lionheart's Honor*: a free Powerup
Kotodama at the award ceremony. It is the only quest marked `late`, so it
**counts after the Awakening** too. That is a deliberate exception to "after
100% doesn't count", because the Dream Dojo is where an afternoon goes after
the ending.

**He hands it over before he pays.** Richard asked for this line, an homage he
chose:

> My honor, my dreams… they're yours now.

It is `HANDOVER` in `shadow.js`. It is said alone for 4 s, and only then come
"You beat my SHADOW! As promised — a share of my HONOR.", the stars toast and
the quest's card. **Only the telling waits.** The stars, the flag and the quest
are all committed on the frame he breaks; `feats.earn` is given
`{delay: HANDOVER.secs}`, which delays only the payout card. A kitten who disconnects
out mid-sentence still has everything (non-negotiable 7). Measured in the
browser: his line at 0 s, the quest toast at 4.00 s, the stars at 4.01 s and the
HONOR line at 4.03 s.

**He is drawn in poses** off his own sheet ([art.md](art.md)): guard, slam,
sweep and cross. He holds a pose for the whole tell **and its recover**, so a
blow reads as landed. The tell is the drawing as much as the red on the floor.

#### Staging — found in the browser, all of it

- **Pressing the kiosk lost the fight.** The kiosk is 24.04 from the ring's
  middle, and the walk-off line is 24. The kitten who pressed was the first to
  "leave", and the fight was lost on its first frame. She is now **stepped
  in** at the entry. The old check had stood her on the floor before
  pressing.
- **His 9.3-tall back filled her pane.** The game's camera never turns, so he
  now closes on her from **upstage**: of the spots `BOSS_CLOSE` from her that
  are on his floor, the furthest from the lens. He walks *round* her, never
  through her.
  - **The hub-side entry left him nowhere to stand.** The fixed lens looks out
    across the ring there, so he ended 4.08 downstage of her. The entry is now
    the ring's **downstage edge**, and he may walk out to the ring line + 2.
    The line is her walk-off rule, not his.
  - **If he is in the way anyway, he and his card fade to 45%.** At 28% he
    vanished into the floor.
- **His head was at NDC 1.23**, off the top of the pane, through the walking
  camera. The fight now has its own **focus**, the way the Dojo does: 34 back,
  pitch 0.5, aimed 4 up and 40% of the way to him. The yaw is never changed,
  because the staging is measured off it.

  | shot | his head | her feet |
  | --- | --- | --- |
  | walking (24, 0.66) | **1.23** | — |
  | 30 / 0.52 | 0.63 | −0.39 |
  | **34 / 0.50** | **0.51** | −0.37 |
  | 38 / 0.46 | 0.43 | −0.36 |

  `world-check` rebuilds this camera from player.js's own fov and yaw, and gets
  0.50 / −0.36.
- **The island's sign drew over him.** It is `renderOrder` 8, so it wins at any
  depth. It is hidden while a fight is on.
- **His card hangs at his screen-right**, not over his head, where the HUD's
  pills are. It is drawn 1.4× so his lines can be read from 34 back. At 1.6× it
  reached 0.96 of the way to a side-by-side pane's edge. The check measures
  every pane shape with its real `paneWiden`: 16:9 ×1, 1.10 ×1.21, 0.89 ×1.50
  and 0.67 ×2.64. The card stays inside 0.86 in all of them.

### Stage 5 verified in the browser

- **Feast:** live at 40% SIM. A stunned rat lies on its side, and the pen holds
  all three critters.
- **Tag Team:** the round ran live with partner and foes trading blows, and the
  drill card read RED 67% · BLUE 100%. The duel board read the leader, the
  hits, the tie-break line and the purse.
- **Shadow:**
  - started from the kiosk, she stays in the fight;
  - he closes straight down the view line, upstage of her every time it was
    sampled;
  - the slam, sweep and Cross Slash all read on the floor;
  - the win paid ★★ at 118s, and the real `Feats` toasted *Lionheart's Honor*,
    with the gold token circling her.
- **Fighter Card:** her portrait, the rank header and the stats, read back off
  its canvas.
- **Today board:** renders with the title de-duplicated.

## Discs, ridden bridges, and leaving — Richard's fix list

Seven notes from one play-through, each quoted. `world-check` has a section per
note, **the Dream Dojo: discs, ridden bridges, and leaving**, plus additions to
the Feast and Shadow checks.

**"The bottoms are broken looking … maybe we can just remove the bottom portion
and have it that players are floating on the discs part."** Every island hung
off `rockUnder`, a ragged seeded cone 1.6 of its radius deep (70 under the
hub). It is gone. An island is now its floor, a `DISC_T` (0.7) slab with an
open edge band, a dark underside and a dimmer additive ring round the lower
edge, which is what reads as *floating plate* from below. The void's debris
was little rocks too, so it is now `shard`s, thin tilted slabs of floor; a sky
of rocks round a world of discs was two worlds. The physics never knew about
the rock, so nothing a kitten can do changed.

**"The bridges … should work and operate like the snake way bridges in the
real world, with the cool camera movements when crossing and inputs being
overridden in the same way."** Not a copy. `Player._stepSnake` asks
`heightAt(...).platform.snake` and nothing else, so `addBridge` hangs a real
`SnakeRoad` off the deck, built from the same path in world coordinates
(`resample` is exported from snakeway.js for it). Boarding, the locked stick,
the rails, `SnakeCam` and the lane split are all the Snake Way's own code.
Three exceptions, each on purpose:
- **No Snake Way song.** `road.sim` is checked in `_wantedTrack`. Nothing in
  the sim picks music, so a song started on a bridge would play for the rest of
  the visit.
- **`islands: []`.** The ride camera's "never inside an island" lift was for
  the real islands' rock keels, and the discs have none.
- **A light cycle is cargo.** A highway is a bridge too, and she sits on it
  `onGround` for the whole ride, so `_stepSnake` boarded her and the orbit
  camera chased a kitten doing 55. `p.onCycle` (highway.js) exempts her the way
  `mount` and `carried` already did.

**"The shader … should change direction and move in the direction the arrows
are pointing and take on the color of the player."** The old chevron put the
edges *ahead* of the centre, so the tips trailed and the arrows pointed home
while they streamed outward. `RIBBON_FRAG` now has `uDir`: the tip leads, the
sharp edge of each band is its front, and pattern and motion turn together.
`SimWorld.steerBridges` writes `uDir` and `uColor` every frame:
- **Whose bridge:** whoever is riding it (her ride's own `dir`), else whoever
  is nearest within 14 units.
- **Which way:** away from her end, because that is the way she would cross.
- **Colour:** eases from cyan to hers over the last 12 units of the approach.
- **Nobody near:** back to outward, in cyan.

Verified from a top-down render with +s pointing up the screen: at dir +1 the
arrows point up, and the bands move up between two frames 0.25 s apart.

**"The bridges should connect more seamlessly … merge the vertices to look more
smooth on the edges."** The overlap was the drawn ribbon lying across 2–3 units
of each island's grid. `ribbonGeometry` now:
- clips the drawn ribbon at each rim, by bisection;
- widens the last `MOUTH_R` (2.8) on a quarter-circle fillet;
- snaps the rim row's two edge vertices onto the circle (the merged vertices)
  and pushes any flare vertex that would cut the corner back out to the rim.

The island's rim opens over the same angles. The ring is rebuilt as arcs
(`rimGeometry`) and the floor's glow is masked by `uGaps`, so the bridge's
magenta edge runs round the fillet and straight on into the island's.
**The WALKED deck is unchanged** and still runs into the island, so there is no
seam to fall through; a check steps across every mouth. Measured: 22 mouths,
0 edge vertices off the rim, 0 drawn vertices inside a disc.

**"When player has the Cross-slash ability, they are unable to eat the animals
when in the Feast simulation."** The sim's hud answered `critterHold` with a
hard-coded `false`, and that is the question the Cross Slash asks before it
takes ATTACK for itself. It now routes to `DreamDojo.critterHold`, which asks
the live drill's `holds`. The Feast's answer is the arena's rule
(`Menagerie.wouldHold`): already chewing, or standing still over a stunned one
inside `CATCH_RADIUS`, using the same two functions its `tick` eats with. The
check drives the real `Player.update` through the real `makeSimHud`.

**"When player leaves the Dream Dojo simulation, then if any of Lionhearts
voices are playing, they should be cancelled."** `LionVoice.hush(which)` cuts
only his own clip, and only if `which(id)` agrees; anyone else on the one
speaker is never touched. `DreamDojo._hushHolo` runs on the DISCONNECT press and
again in `_leaveSim`. It cuts only the hologram's lines (the real Lionheart's
two belong to the reality she returns to), and only when nobody is left inside
to hear him. A sister still connected keeps him talking.

**"Lionheart is too big … when doing the Lionhearts Shadow."** `SHADOW_H` was
9.3, half again the man he is a shadow of; it is now `LION_HEIGHT` (6.2), and
his hit volume, bar and panel scale with it.

**"It is not showing the players generated VR sprites"** and **"doesn't seem he
ever does his Shadow sprites."** Neither reproduced, in Chrome or in a headless
Firefox 157 driven over WebDriver BiDi:
- her look was the VR texture all the way through the visit
  (`rise → link → rez → sim`);
- the Shadow's cell walked 0 → 1 → 2 over a clean four-cell atlas.

What *could* produce each was fixed instead:
- **The holo-kittens** (sparring partners) still wore the town drawing, so
  `kittenSpec` now dresses them in the headset sheet.
- **The Shadow's sheet loads unawaited** (`loadSimArt` starts at the tube), so
  a fight that began before it landed spent four minutes on the fallback.
  `ShadowFight.update` now dresses him the frame it arrives, and `dress` removes
  the figure of light he was spawned as. Before, it was left standing inside
  the drawing.

~~**Still home-sheet:** her special poses in the sim.~~ Generated: all six, in
the headset, for all four kittens (see the front door, below).

## The front door — Richard's improvements list

One long note, eight parts, each quoted. `world-check` has one section for the
lot, **the Dream Dojo: the sign, the gear, the dome, the cameras, the talks**.
The new code is in five files under `dream/`: `approach.js` (the stones, the
dome and the fall), `gear.js` (the racks and the props), `stories.js` (every
line), `storyscene.js` (the scene player and its shots) and `lecture.js`
(Lionheart's two talks).

**"Lionheart's Honor quest should give a Special Kotodama orb, but make it that
anyone can do the quest."** The Shadow no longer asks for KENSHI 2nd Class; the
refusal toast and the red "He fights 2nd Class" line are gone and the panel
says *Anyone may try!* The quest stays `who: 'each'`, so every kitten who beats
him earns her own orb, and it gains `special: true`. `isSpecial` now answers
yes for it, so the draw has rares in the bag. It is the only everybody-quest
that pays the special draw, because it is the only one that is a fight. 2nd
Class is still a rank; it just stopped being a door.

**"Seems The Dream Dojo sign, the billboard is behind the poles … If it is
floating, have it bouncing around and fading in/out a bit to look more
holographic."** The posts are gone. The sign floats, bobs 0.80 and breathes
between 0.25 and 0.92 alpha. The check asserts that no post stands within 7 of
it and that both ranges are what the code says.

**"When the player is within the Dream Dojo sphere, the camera should zoom out
a bit to show the entire VR island and sign."** `DOME_CAM`: the pad's centre,
pulled back to 50 at the walking camera's own bearing (the angle Richard
already likes is kept; only the distance changes). Measured through the real
`cameraFocus` → `_updateCamera`: the whole island, sign included, fits with
the worst point at NDC 0.78.

**"Let's also add some props … VR gear, practice swords, shinai, VR Gloves +
Full-body tracking equipment … laser tag looking equipment with large
rifles/guns … omni-directional treadmills and lasers/colored lights."**
`gear.js` builds three glowing racks (headset, gloves, tracking suit) and the
scenery: a practice-sword stand with bokken and shinai, a laser-tag rifle rack
("a hint to future VR Training possibilities"), two omni treadmills and a
full-body tracking frame. The "lasers" are additive beams that sweep. They add no lights,
because the game is fill-bound ([performance.md](performance.md)). `gearLayout`
is pure, so the check can measure it: every rack is on the pad, 8.04 clear of
the tubes, 13.70 clear of Lionheart, and nothing stands within 4.70 of the way
in from the stones or on a walk-out spot.

**The headset: "is there a way to align that better or do we need to generate
new sprites … Alternatively, we can have them go to a few areas in the Dream
Dojo island to gather all the VR gear, then have them turn to camera, and then
have a special effect play."** Both, and the second is what fixes the first.
The visor plane slid off her eyes because it was a separate quad over a drawing
whose head moves from cell to cell. Now she wears the headset SHEET from the
moment she suits up. ~~The plane is only a fallback for a build where that
sheet never loaded.~~ The plane is gone altogether, fallback included — see the
fix list below.

- **First visit:** she talks to Lionheart, he sends her round the three racks
  (`GEAR_LINES.first`, voiced), and she picks each up by walking into it (a
  toast per rack). The tube refuses her in words until she has all three. The
  last rack starts phase `suit`: she turns to the lens, the poof covers her,
  and she is dressed at 0.33 s of `SEQ.suit` (1.9 s).
- **Every visit after:** a second talk goes straight to the suit
  (`GEAR_LINES.again`). Whether she has geared is `p.dreamGeared`, in her save
  row — ~~it was in the Dream Dojo's own progress store~~, which outlived every
  game (see the fix list below).
- **Each kitten gears up for herself.** A sister has her own racks to collect.
- **Out:** "they should automatically walk out of the tube, and poof … to put
  their regular clothes back on." Phase `walkout` walks her 3.2 units toward
  the pad's middle, then `unsuit` poofs her home look back. A kitten who walks
  off the pad in her gear poofs back too, and `exitAll` (any scene) undresses
  everybody.
- **"We should generate the sprite for their other abilities."** The six
  special poses (eat, bless, warp, inhale, scared, sweep) now exist in the
  headset, so a sister doing one in the sim shows it in the tube as well.
  [art.md](art.md#the-six-special-poses-in-the-headset) has how they were made.

**"It is currently too easy to fall … Having 3 or 4 platforms to jump on …
have it go in a half circle pattern towards the island … If they do fall …
let them fall for 2 - 3 seconds before respawning them."** ~~`STONE_ARC`: four
stones of radius 2.0 on an arc of radius 15.5, at 44°, 66°, 88° and 110°, each
0.6 higher than the last.~~ Superseded by three stones and a gate (below). The two old stones in a straight line had hops of
2.7, 2.5 and 3.8. A kitten below the stone she left is held for `FALL_HOLD`
(2.2 s) and put back at `LAUNCH_R` (63, three units inside the Dojo's rim, in
front of where she took off). The check also proves she is not caught out at
sea first.

**The jump camera: "zoom in more dynamically … easier to see the players shadow
while jumping … shouldn't move around too dynamically while they are jumping
on the platforms."** `JUMP_CAM`. Walking toward the edge, the distance eases
25.9 → 22.0 → 18.0, and the pitch drops from 0.66 to 0.5. On the stones the
bearing is FIXED, aimed from the launch spot at the middle of the arc, so all
four stones stay in frame the whole way. The height changes only when she
lands. Measured:
- one yaw on every stone outside the dome (the fourth is inside it, where the
  dome camera takes over on purpose);
- her feet and the next stone in frame on every hop;
- the lens bobs -0.0009, which is the walking camera's leftover weight, inside
  a 0.025 bar.

**"Some cool VR Arcade music … quietly, from a distance … about 50% volume
when near it and then full blast volume when people enter the sphere."** A new
piece, `vr`, the only one in the game made of saws (synthwave, authored and
original, in `audio.js`). Its loudness is `DreamDojo.musicLevel`, multiplied
into the player's own slider (`setMusicLevel`), so a kitten who turned music
down to a quarter hears the swell a quarter as loud. `MUSIC_SWELL`, measured:
1 in the dome or the sim, 0.50 at the dome's skin, 0.14 mid-crossing, 0.08 at
the far edge, silent beyond. There are six units of hysteresis (0.080 in
level), so a kitten standing on the line does not restart the piece. A kitten
on a mount counts as 0, and the loudest kitten wins.

**The dragon: "the dragon is not flying through, it is getting blocked, but
the player is able to fly through still."** (The push below was a tube round
the axis; it is the dome's own shape now, and slides —
[below](#the-gear-voice-the-headset-riposte-the-tours-islands-the-cards-and-the-dome).) The dragon is hung off its rider
(`Player._updateFlight`), so pushing the DRAGON moved a body that was put back
under her next frame. The rider is pushed now, and the dragon goes with her
(both 20.50 from the centre after the push), with a toast saying why. The dome
is a wall for a kitten on foot everywhere except one DOOR: ~~the low sector
(`DOOR_HALF` 20°, under `DOOR_TOP`) that the third stone's hop onto the fourth
passes through~~ the gate's deck (below). "If a player tries to jump off of a dragon to fall into the
dojo … they should slide off the sides of the sphere": `domeContact` lays her
on the surface and slides her off (47.3 out in the check), then the fall
respawns her. The door hop is untouched.

**Lionheart's two talks.** Both are in `lecture.js`.
- **HE SAW THAT.** ~~Trying the wall or dropping from a dragon sets the `cheat`
  flag~~ Only DROPPING onto the dome sets the `cheat` flag (Richard: "that
  should only get triggered if Lionheart executes his 'lion_yell_drop'
  voice"), and he yells as a bubble (`yellWall` / `yellDrop`): "in a funny and
  overly excited and berating way". Only `yellDrop` is VOICED: the wall yell's
  clip was cut ("not a good voice and is too loud and aggressive"), so it is a
  bubble and a toast and nothing louder.
- **HONOR** (seven lines) plays when a kitten with `cheat` who has since come
  in by the stones walks near him. "He can apologize for getting angry … why
  try to sneak into a space when the front door is already opened … 'Do' means
  'the way'."
- **FALL** (four lines) plays for `fell` instead: "if you fall, just need to
  pick yourself up again and try again".
- **Once per kitten per afternoon.** HONOR outranks FALL and marks both heard.
- **"If more than one player is nearby … then all the players are in the
  cutscene."** Everybody within `CAST_R` (34) is cast and stood on `marks`.
- **It waits while anybody is in a tube or the sim**, because a scene would
  disconnect them.
- **It is spent on START** (non-negotiable 7), so a skip at the first frame
  has spent it.
- **"Camera is behind, over the shoulder, and have Lionheart facing the
  player."** Shots `ots`, `otsLion`, `otsWide`. The check frames his face and
  the whole party of one to four.

  **A bug the browser found:** she stood on her mark facing him, but was drawn
  FACE-ON to the over-the-shoulder lens. The billboard picks its cell from its
  own `sprite.facing`, which only `Player.update` copies across, and kittens
  are not ticked under a scene. `play` now sets both, as the shrine scene
  does. The check measures the drawn view from behind (150° and 175°); without
  the fix it reads 28° and 39°.

**The tour.** Richard: "a little introduction cutscene, working like the Clan
Leaders introduction cutscene but longer and more detailed." `TOUR` in
`stories.js` is fifteen rows. Payne opens and closes it; Lionheart covers his
past, why he built the dojo, what is learned there, the islands, the Shadow
and the mission. The mission line keeps Richard's own "(or is it tangible?)"
as Lionheart's joke on himself, answered with "BOTH!". It has its own shots,
from `isleWide` to `skyPull2`, including three into the sim's hub, islands and
Shadow. It refuses with `'busy'` (somebody is in the sim) or `'scene'`.
Payne's side of it is in [payne.md](payne.md#the-dream-dojo-section).

**Two players.** None of this has a two-player special case to break. The
state is per kitten; the cameras, the music and the talks ask the same
questions at any count. The check runs a pair through it and pins that.

## The front door, and the fix list after it

Richard's list after playing the gear-up and the four stones. Each item is
quoted, then what was actually wrong, then what changed.

**"Too many jumping platforms on the way to the Dream Dojo, let's just make it
3 platforms to make it a bit more challenging. Also, we need to make sure the
entrance is bigger, more interesting looking, and placed in front of the last
floating platform, and that it is the only way to enter the dojo, so we can put
a railing all around the dojo that ends at the entrance."**
- **Three stones** (`STONES` in `dreamdojo.js`): radius 2.2, every hop 3.2 edge
  to edge, each 0.75 higher, Dojo (30) → 30.75 → 31.5 → 32.25 → the landing
  (33). Measured hops 3.45, 3.20, 3.20, 3.20 (the first is against the rim as
  measured along the line, 65.75). A single jump reaches ~9, so the challenge
  is the landing, not the distance. The middle stone is SOLVED as one hop from
  both of its neighbours, on the left, so the gaps cannot drift; the way still
  turns 62°.
- **The gate** (`dream/gate.js`): a deck runs out of the pad along the old
  door's bearing (55° from the near side toward screen-left, so every prop
  laid out clear of "the way in" still is), past the dome to a round landing
  at 22.2. A torii stands on it exactly at the dome's skin, so walking through
  the gate and walking through the dome are the same act. The last stone sits
  on the gate's axis, one hop out from the landing.
  **First cut, rejected in the browser:** a steel-dark torii like the rest of
  the pad, which from the stones read as two more posts of the railing. It is
  vermilion and black-capped now, 10.8 tall, with neon outlines, a 夢 plaque,
  two lanterns, chevrons on the deck pulsing inward and a faint scanline
  shimmer in the opening.
- **The railing is real.** `railCorrect` holds a kitten on foot inside the pad
  and the deck's strip, and lets her out only through the gate's mouth. The
  check runs at it on 36 bearings: held at ≤ 13.75 on every one except the
  gate's, out through the gate to 20+. A kitten carried off (a fall, a scene, a
  summons) has moved further in a frame than she can run, and is not dragged
  back.
- **The door is the deck's strip, not a wedge.** It was an angle seen from the
  pad's centre, and an angle narrows as she walks in: the check's kitten 2.45
  off the axis was in the door at the skin and in the wall three units on, and
  was slid back out of the gate she had just walked through. And the dome now
  leaves alone a kitten inside the railing; with both, the dome slid her off
  the deck's side while the rail pulled her back, and the dome won.
- **A treadmill moved.** The second one stood 1.9 off the gate's axis, its
  waist hoop across the lane in. It is 6 off it now.

**"The Dream Dojo is not currently appearing in the minimap."** It is not one
of `world.islands`, which is all the map's island loop ever drew. `build` now
leaves `world.dreamDojo` (`dreamSite`), and `Minimap._drawDream` draws the
pad, the dome's ring, the gate as a magenta bar, a dot per stone and its name.
**First cut, seen in the browser:** the name under the pad landed on the
Dojo's own label at world zoom. It is above the pad now, 36px clear.

**"When talking to Payne and marking the Dream Dojo on the minimap, once the
player gets there, the mark should be removed."** It waited for her to stand
on the pad, so the beam stood on the rim behind her all the way across. It
comes off at the marked spot (`DD_MARK_NEAR`, 7), on any stone, or on the pad
(`ddMarkReached` in payne.js).

**"During the cutscene with Payne about the Dream Dojo, when the cutscene
transitions to the 'simulation' world ... I can only see the dojo of the
turning circle."** `Game._renderView` draws the simulator layer only for a
pane whose kittens are in it, and a scene's lens has no kittens. The holo-Dojo's
MathDojo hangs off the scene rather than the layer, so it was the one thing
left. `StoryScene` now sets `loc` from each frame's shot and the renderer takes
its word (`realm`). The check plays the whole tour: 125 of 539 frames in the
sim, none mislabelled.

**"When player is entering the simulation, the camera is in the wrong
placement."** The dome camera's weight eased out at `CAM_BLEND` after she
crossed, and its centre is the REAL pad, 12,000 units from her. Without the fix
the lens ended 8358 off her. On the far side the weights drop on the spot, and
in the tube phases her own follow camera frames her (`TUBE_PHASES`).

**"No longer need to place the 3D VR headset in front of their face."** The
visor plane is gone, fallback and puppet included. A build with no headset
sheet shows her in her own clothes: a drawing that is right rather than a
plane that is wrong.

**"Refreshing the browser isn't playing the intro cutscene and ... Lionheart
just suits you up right away ... even on a brand new game. Are these states
being saved independently of a new game?"** Yes, both were.
- The intro was once per TAB, in sessionStorage, which a refresh keeps. PLAY
  is a new game and now always opens on the story; LOAD never does.
- `geared` was in `kk.dreamdojo.v1`, beside her stars, which outlives every
  game. It is `p.dreamGeared` now: saved in her row (`castRow` / `applyCast`)
  and cleared by `restart`.

**"Lionheart's voice when the player tries to enter the dojo by running into
the wall with a dragon is not needed."** `lion_yell_wall` is deleted (clip and
raw take). The bubble and the toast stay; `lion_yell_drop` stays. 34 clips.

## The dealer's three rare orbs, in the Gallery

遠 Far Step, 返 Riposte and 間 Long Parry were built on their own branch while
the simulator was being built on main, and kept off main until Richard had
played the Payne work. When they were merged, Richard: "In the Kotodama
Gallery, it seems some of the newer kotodama are missing like Riposte ... make
it work with the simulator." The pedestals are `POWER_ORBS.forEach`, so the
three stood up on their own; what was missing was everything behind them.

- **The sim's combat had never heard of the parry.** `simHit` is the whole of
  it, and it asked the Flash Step and the Ward and nothing else, so a kitten
  lent 返 could raise her guard at a bolt and be hit through it. It asks
  `p.parries(from)` now, before the Ward, which is where `Game.strikePlayers`
  asks it; a catch calls `riposte` through the sim's hud, so the answer reaches
  holograms only. `from` is passed by every BLOW: a bolt (from three units back
  along its flight, because the hit test fires within a unit of her), an Arena
  School holo-blade, and Shadow Lionheart's slam, sweep and cross. Beams and
  laser walls pass none: there is no "when" to guess at a wall.
- **遠 FAR STEP DRILL.** A holo-kitten in the middle of the floor, a red ring
  of `farRing` round it, three Flash Steps round it from outside. The ring is
  a FRACTION of the live Lock range (1.12×): the first cut was 16.5 against the
  shipped 15, and the balance page has Lock range at 10, where one Far Step
  reaches 15, so it was unreachable with the orb. world-check caught it.
  **Second cut, rejected in the browser:** the hologram moved toward the
  floor's middle after each step, and one 瞬 PIVOTS her round whoever she
  locked at the distance she locked from, so from the middle the far side was
  off the island and the step was refused. Round the centre the far side is
  the same distance out the other way (15 at most, as tuned, on a floor of 24)
  and still outside the ring, so she can go straight round again. A step
  counts when she has GONE: a locked step with the stick let go is the "stay
  put" half of the move, and the first cut paid a star for one.
  Measured live: from the pedestal (19 out) no lock; from 13 out, locked,
  carried 26 round to 13 the other side, counted; bare, no lock; from 5.5,
  locked but inside the ring, not counted.
- **返 RIPOSTE DRILL.** A holo-kitten walks up, goes white and still for
  `PARRY_TELL` (0.7 s), and swings. The tell is longer than a bare guard
  (0.35 s), so a guard raised AT the flash has shut before the blow: the read is
  when. It answers only to `riposte`. Measured live: a miss cost 10 of the bar,
  then three guards 0.45 s into the tell were caught and answered (its bar
  99 → 96), three stars in 11 s. **First cut, seen in the browser:** it aimed
  at 1.9 and walked while further than 1.9, so it closed on 1.9000x forever and
  never swung. It stops 0.1 short now.
- **間 LONG PARRY DRILL.** The same partner, but it WAITS: its blow lands
  `PARRY_LATE` (0.42 s) after she raises her guard, past a bare window (0.35)
  and inside one Ma's (0.525). So bare it cannot be passed however it is timed,
  and lent it is the sentence on the orb's card, the way Long Guard's beam is.
  Measured live: guard 0.11 s into the tell, blow at 0.53, caught with Ma; the
  same timing with the window set bare, hit.

## The gear voice, the headset Riposte, the tour's islands, the cards and the dome

Richard's list after the rare orbs were merged (branch
`mixed/dojo-gear-voice-riposte-vr-tour-orbtext-dome`). Each note is quoted, with
what was actually wrong.

**"The 'All your gear' voice sounds like the wrong voice for Lionheart ... In
the least, the 'lion_gear_suit' voice needs to be re-recorded as it is loud,
aggressive, and doesn't sound like Lionheart."** It was the right voice. All
three `lion_gear_*` renders were Barrett, read off their job's voice id. The
card said "SUIT UP!" in capitals, and on this preset capitals and "!" are how a
line is shouted. There is no style prompt; the line is the prompt. Measured
pitch was 128 Hz for the suit line against his normal 86. Both the suit and
again lines are now written quietly ("Face the front... and suit up.") and
re-rendered. They now measure 86 and 89 Hz. `lion_gear_first` was already 86
and is unchanged. See [voices.md](voices.md#the-front-door-26-more-of-his-lines-9-more-of-hers).

**"Need to generate VR sprites for the Riposte ability for the players and use
that in the simulation."** There is a seventh headset pose,
`vr_riposte`, made the way the other six were.
[art.md](art.md#the-six-special-poses-in-the-headset) has the details.

**THE TOUR'S SIMULATOR LINES.** Richard: "during this entire cutscene segment in
the simulator, we focus a lot on the Dojo of the Turning Circle area, but not
much on the other islands ... It would be good if the camera can pan through
each of the islands and different activities ... and likely no need to focus
on the Dojo of the Turning Circle unless it is directly mentioned in the dialog
or if to just give a brief zoomed out view of the entire map area while
rotating fairly quickly."
- **What was wrong.** `simHub` was an eleven-second orbit of the holo-Dojo.
  `simIsles` swung wide but aimed halfway between the Dojo and the islands'
  average, so it was on the Dojo too.
- **Now: `TOUR_PANS` in `storyscene.js`.** It is a list of stops per line, each
  cued on the WORD that names a place, at the second that word is said. The
  times were measured off the clip with silencedetect (−35 dB, 0.12 s), and the
  camera reads the clip's own playhead.
  - *Kotodama* → the Gallery; *clan powers* → the Trial Hall; *real sword
    skills* → the Range; *how to fight* → the Arena School; *every single day*
    → the Holo-Sentries.
  - *aim* → Kudamono Storm; *timing* → Bamboo; *kata* → Kata Trace; *the maths
    of the circle* → the Sine Gauntlet.
  - That is every island but the Shadow's, which has its own line.
- **The Turning Circle is only ever the middle of the map**: a wide frame (430
  out, 330 up) turning at 18°/s. It opens both lines and closes the second on
  "Earn stars".
- **Each swing takes 0.6 s.** The shortest hold is 1.1 s.
- **world-check** puts both lines through the scene's own lens (42°, 16:9)
  every tenth of a second:
  - each island is held within 0.08 NDC of the middle, with the Turning Circle
    out of the frame;
  - the map frames hold at least 8 of the 10 islands;
  - every cue word is in its line and inside its clip.

**SHADOW LIONHEART IN THE TOUR.** Richard: "when showing the Shadow Lionheart,
we do not see him there, it would be cool to see him there, moving around and
doing his attack moves during that cutscene focusing on him."
- **Why he was missing.** He exists only while a fight is live, so the shot
  framed an empty island.
- **`dream/tourshadow.js` is the scene's own actor.** It is a billboard of his
  sheet plus three floor tells, never the real `ShadowBoss` (a Target, which
  would start counting a fight).
  - `ctx.actors.simShadow` is started with his line and stopped by the next
    line or by a skip.
  - It runs on the same clock as the lens.
- **His routine.** Walk, SLAM, walk, SWEEP, walk, CROSS, all inside the 8.6 s
  line. Each tell lasts exactly as long as the real one, and each move shows
  the cell his fight shows for it.
- **The shot is aimed at his ring** (the fight's own `ARENA_AT`).
- **Measured in the browser, as a share of the frame's height:**
  - 34 → 24 back: a fifth;
  - 30 → 20 back: 24–37%;
  - 22 → 16 back (now): 33–46%.
- **First cut, seen in the browser:** his slam swung off to his side. The
  tells' "toward the camera" axis was taken from the lens in world coordinates
  against a ring in the layer's, so it pointed along the simulator's offset
  from the town. world-check now asks that the axis points at the camera
  (cos 1.0000).

**THE GALLERY'S CARDS.** Richard: "The subtext on the kotodama orbs in the
simulator is too small and can't be read. It is okay if the subtext is more
than 1 line long and made bigger."
- **Lines can wrap now.** Every line used to be one row shrunk to the card's
  width, so the 112-character Riposte blurb came out at a fraction of its size.
  A line marked `wrap` now breaks into rows at its own size (`layoutLines`,
  `holo.js`). If the rows do not fit, the whole card shrinks uniformly, never
  clips.
- **The blurb's letters are 0.44 units tall.** Every orb's blurb is at least
  1.37× the old size, and the longest runs to four or five rows.
- **The card is 10 × 5.2 and hangs over the kitten reading it, not over the
  pedestal.** Her camera is high and keeps one bearing. world-check stands her
  at 16 points round each of the 13 pedestals, settles her own camera and
  measures where the card's corners land:
  - 8.2 × 6.4 over the pedestal: top at 1.05;
  - 10 × 5.2 over the pedestal: 1.08 with her on its far side, because things
    beyond her ride UP the frame;
  - hung toward the lens: in frame, but lying across her by 0.22–0.33;
  - halfway: 1.03;
  - over her: top 0.90 at worst, with its lower edge 0.17 clear of her head.
- **Only her nearest card lights.** The pedestals are 8 apart and a card used
  to light for any kitten within 9, so her two neighbours' cards were up as
  well.

**THE DOME.** Richard: "Dragon outside of the Dream Dojo is getting stuck on the
shell of the dojo island ... seems there is a barrier above the dream dojo
preventing dragon from flying directly above it, let's remove that, we want the
player and dragon to be able to fly next to the dome".
- **The barrier was a tube.** Every animal was held 20.5 from the axis, from
  12 under the deck to 4 over the crown, so the sky beside the glass and above
  it was walled off.
- **It had no slide.** A dragon flown at it stopped dead.
- **The dragon itself stuck on the shell.** Her dismount aims a dragon at the
  ground under her (`landAt`), and over the dome that ground is the pad, so it
  sat on the glass trying to land through it.
- **Now `animalContact` is the dome's real shape**, plus 1.5 of room: the
  hemisphere, the rim under it and the cone of rock below.
  - It pushes along the surface's normal and removes only the inward part of
    the velocity, so a dragon flown straight at the dome rides up over the
    crown and down the far side. In the check it ended 64 past the middle,
    never closer than 20.5.
  - A riderless dragon whose home is over the dome is sent to the foot of the
    stones instead.

**THE APOLOGY.** Richard: "If player on dragon or panda mount run into the shell
of the dojo, it should not trigger the apology from Lionheart when player
enters, that should only get triggered if Lionheart executes his
'lion_yell_drop' voice."
- **Only the drop sets `cheat` now**: a kitten coming down onto the top.
- A mount brushing the dome gets a toast and nothing more.
- A kitten on foot at the wall still gets the wall bubble and the toast, but
  no apology is owed.

## The stones, the preload, and the tour recut

Richard's "Improvements" list after the gear voice and the dome (branch
`mixed/dojo-stones-preload-tour-recut`). It supersedes the TOUR_PANS stop list
in the section above, which is kept as the history.

**THE STONES.** "Let's smooth out the placement of the three platforms leading
up to the Dream Dojo so that they are more evenly spaced between the Dojo of the
Turning Circle island and the Dream Dojo island."
- **What was wrong.** The hops were already equal (3.2 edge to edge), so the
  checks passed. The WAY was not even. The stones were placed one at a time:
  one off the rim 12° left of the straight line, one on the gate's axis, and
  the middle one wherever was one hop from both. It zigzagged −55°, +62°, +61°.
  Along the line from the rim to the gate's landing, the stones stood at 0.29,
  0.51 and 0.90 of the way.
- **Now one arc** (`arcadeLayout`). The four hops lie on a single circle,
  tangent to the gate's axis at the deck's tip, so equal chords are equal hops
  by construction. Its radius is solved by bisection so that the fourth hop
  lands on the Dojo's rim.
  - Turns on the stones: 20° and 17°, the same way.
  - Along the way: 0.18, 0.49 and 0.80. Equal gaps on a straight line would be
    0.21, 0.50 and 0.79.
  - Hops: 3.25, 3.20, 3.20 and 3.17.
  - The last stone is 0.68 off the gate's axis, and its hop heads 7° off it,
    so the gate is still the thing in front of her.
- **world-check** now judges the turns and the spacing, not only the hops. The
  old layout fails both new checks; that was measured by running them against
  it.

**THE PRELOAD.** "If we are playing the Payne cutscene introduction to the Dream
Dojo for the first time, we should pre-load the assets for the simulator so
that, during the cutscene, when we transition to the simulator, there is no lag
spike."
- **What it was.** The tour's first frame in the simulator took 1304 ms in the
  pane, against 30–50 ms either side. The program count went 29 → 43 on that
  one frame: every holo material linked on the draw that first needed it, and
  every island's buffers uploaded with it.
- **`Game.primeSim`**, called by `startTour`, runs once a session:
  1. `compileAsync` under `_simState(true)`. That is the simulator's fog, sky
     and petals swapped in, the same swap `_renderView` now makes, because fog
     is part of every program's key.
  2. Every texture goes up through `initTexture`, ONE a frame, starting on the
     tour's first frame, which is under its fade from black.
  3. Then the layer's meshes are drawn into a one-pixel viewport on layer 31,
     12 a frame, after the link. `_primeSim` is the slice; the story branch
     of the loop runs it.
- **What it took to get the last spikes out.** Each step was measured in the
  pane:
  - **Twelve meshes a frame with their textures** gave three frames of 86, 202
    and 95 ms in the middle of Payne's lines. The fix was to split textures
    out, one a frame.
  - **The slow frames were then the four kitten sheets** (3840 and 3072
    wide). The tour's cast was being built in the town drawings and re-dressed
    later. So Payne's dojo menu now starts `loadSimArt` one menu early
    (`payne.js`). The cast is built only once the drawings land, and its
    sheets go to the FRONT of the texture line.
  - **`atlasClone` re-sent whole sheets.** Every billboard built on a sheet
    bumped the shared `source.version`, and three re-uploads a source whose
    version moved. Dropping our own `needsUpdate` was the first fix, and it
    was not enough. three's `Texture.copy` ends on `needsUpdate = true`, so
    `clone()` itself bumps the source. world-check's new clone check caught
    the source going 1 → 3 over two clones. `atlasClone` now puts the
    source's version back to what it was.
- **Now, in the pane, three runs:**
  - The press of VIEW costs 106–148 ms, under the fade.
  - The four sheet uploads are 86–375 ms on frames 0–4, at black 0.55–0.9.
  - The warm-up runs at a median of 21–25 ms (p95 29–39) against a baseline of
    18–24.
  - The first simulator frame is 17 ms. The isles line is 9–12 and the
    Shadow's 9–12. Programs: 59 before and after.
  - One run had seven 500–700 ms frames late in the warm-up, on a pane that
    had been sitting with its loop stopped. Two fresh runs did not repeat
    them.

**THE TOUR, RECUT.** Each note, and what answers it (`TOUR_PANS`,
`storyscene.js`; the cast is `dream/tourcast.js`):
- **"the transition from seeing the entire map to seeing the Kotodama Gallery
  is a jarring ... doesn't have the camera do a 180 degrees along y-axis".**
  The map looked at the Turning Circle from the far side of the island it was
  about to dive to. It now stands behind the hub FROM that island, and the
  swing is a straight push along its own heading (`blend: 'line'`). The
  heading changes by at most 7° (was ~180°). The "every island" pan does the
  same into the Storm, at most 12°.
- **"When saying 'real sword skills' ... we should have some bamboo to cut
  shown and can maybe show some of them getting cut and playing the 'cut down'
  animation."** There are five holo-canes in a row on the range. A
  holo-kitten walks the row and cuts four of them at 4.75, 5.2, 5.6 and 6.0.
  Each top slides off the cut, tips over and fades (`caneFall`), with a burst
  of shards. The fifth stays standing.
- **"In the Arena School, should have some animals running around and 4
  players fighting each other and can show the ... Kenshi card here with some
  data on it (can be Lionhearts data ...), can have it facing the camera ...
  and can be rotating."**
  - Six holo-critters run in the pen and never leave it.
  - Two bouts trade blows on the ring. Each fighter goes from 5 hits to 2–3
    and none is knocked out.
  - His FighterCard floats over the school, at the ladder's own top rung
    (剣士 1ST CLASS, gold), with 9999 stars, 十 Juuji as his signature, and a
    3650-day streak.
  - The card turns to the lens's heading and sways ±28.6° on it.
- **"skip showing the 'Holo-sentries' island and keep the camera viewing the
  Arena School longer."** The school now holds from "how to fight" (6.1) to
  the end of the line, with a slow push in.
- **"For the 'every island is a lesson' section, instead of being so zoomed
  out, can just have the camera panning around the center our outskirts of the
  islands."** The eye is 72 out from the hub (past the Dojo's rim at 66), 20
  up, looking outward and turning at 0.55 rad/s. The Turning Circle is behind
  it, and an island is in the frame on every tenth of a second.
- **"fix the transition before showing the Kudamono Storm island ... skip
  showing the Bamboo Infiltration island and instead stay on Kudamono Storm
  longer ... make sure to show gameplay for these islands."**
  - The pan ends facing the Storm and pushes in onto "aim".
  - It holds from 1.75 to the cut at 4.4.
  - A holo-Frost cuts seven fruit out of the air from 2.08 to 4.38. One purple
    virus is left to fall, the way the drill asks.
- **"For Kata, we can stay on the Kata Trace longer so that we can actually
  show Lionheart doing a kata routine on there."**
  - **The cut to the Kata is a 0.18 s dip, not a swing.** The Storm and the
    Kata are 166° apart round the hub, and a swing that long is the 180 he
    asked to lose.
  - **The lens holds 4.8 s on one Kata floor.** Lionheart's ghost runs a real
    weekly-shaped routine (`tourKata`: the first one with a cut, a jump, a
    guard and a step inside the time), on the floor's own beat. In the check
    he stands on four marks and walks 24.
- **"When it says 'even the maths of the circle' we can have the camera move
  around the Kata Trace island so that the Sine Gauntlet or Turning Circle
  island is in the background ... main camera focus should be on the Kata
  Trace."** From 5.7 the lens walks 87° round the floor and comes down as it
  goes. By "Earn stars" the Sine Gauntlet is behind it at NDC (−0.21, 0.49),
  and the floor is dead centre.
- **"When saying 'earn stars' we can keep showing the kata and then slowly fade
  out and when saying 'climb the ranks of kenshi' we can fade in on the Kenshi
  card."**
  - It fades out from 8.27 to 9.17 and in over 0.5 s onto the card's close-up.
  - The card is aimed BELOW its middle. Centred, its stat rows sat behind the
    subtitles, which cover NDC −0.38 to −0.75 at 16:9. It now fills 65% of the
    frame's height, with its bottom edge at −0.32.
- **"Then can fade out and in quickly at the end before transitioning to the
  Shadow Lionheart scene."** A tail fades to black from 11.30 to 11.55, after
  "KENSHI" ends (11.31) and before the clip does (11.58). The cue clock is the
  clip's own playhead and freezes when it ends. A line that ENDS black now
  dips the next one in (`StoryScene._next`), so the Shadow's line comes up
  out of it.

**Measured cue words** (−30 dB silence detection on the clips):
- `lion_tour_learn`: Kotodama 1.30, clan powers 2.50, real sword skills 4.20,
  how to fight 6.10, every single day 9.15. The clip is 10.82 s.
- `lion_tour_isles`: aim 2.55, timing 3.45, kata 4.40, maths of the circle
  5.70, Earn stars 8.27, and climb 9.17, KENSHI ends 11.31. The clip is
  11.58 s.

**world-check** now asks what each shot is FOR, through the scene's own 42°
lens every tenth of a second:
- **Each island's vignette** (the canes, both bouts and the pen, her spot, the
  Kata floor) is in the frame and above the subtitles, its middle within 0.19
  NDC of the frame's, and the Turning Circle is out of the frame.
- **The visit list is exactly six islands.** The three he dropped (sine,
  sentries and bamboo) are checked absent.
- **No swing turns more than 30°.**
- **The Sine Gauntlet** is behind the Kata on "Earn stars".
- **Every fade** lands where its word is, and the card is in frame above the
  box.
- **The cast**, driven on the line's clock:
  - canes standing until their cut and lying after it;
  - every fighter hit and none knocked out;
  - critters inside the pen;
  - the card facing the lens;
  - each fruit up for exactly its flight;
  - the ghost on several marks;
  - all of it gone with its line.

**Open.**
- Nobody has watched it at real speed with real audio. The frames were checked
  as contact sheets in the pane through the real lens.
- Two in-between swings briefly show open sky: Gallery → Hall at ~2.7 s and
  Range → School at ~6.5 s.
- The swing onto the range peaks near 280°/s. If it reads as a whip, lengthen
  its `swing` to 0.75 and push `RANGE_CUTS` back ~0.2 s to match.

## The holo kit, Lionheart's quests, the levels and the course

Branch `mixed/dojo-holo-profile-quests-courses`. These are Richard's notes
after playing stage 5. Each item names its commit, which has the detail. The
commit messages are the session log.

**The bug list** (30f8e37):
- Nothing can be struck before GO. `Drill.target` refuses and says "wait for
  GO". The Pandapaw canes broke in the count-in and were never counted, so ten
  could not be reached.
- The hologram flicker is a slow breath and one soft dip every ~5 s
  (`holoFlicker`). It replaced hard 4.6–5.9 Hz blinks.
- Icewhisker's stolen orb is tossed away and locked behind a shrinking ring,
  and the holo-kitten dashes for it when it opens.
- One charge is one blow on the Shadow. A charge in the sim used to land about
  once a frame.
- The Shadow takes a hit you can see: a starburst, shards, a jolt and squash,
  and the sound.

**Small things** (e402d2d, 69026f1, 4ac6087, 7dd30b9):
- Payne is silent while a kitten wears the headset. Her clocks stop and the
  invitation she owes comes after.
- The sim has four tubes in the seats' colours.
- Lionheart's bubble stands on the side away from the tubes. His spoken lines
  go on the screen card when she is 20 or more away (`Announcer.follow`, word
  by word on his playhead).
- The Turning Circle in the sim is drawn in light (`dream/holodojo.js`). Only
  materials are swapped, and world-check drives both Dojos from one kitten and
  holds point and θ equal.
- Every island's sign stands beside its bridge mouth on the hub.
- Walking toward a bridge, the camera eases over her shoulder onto the far
  island (`dream/peek.js`).
- The light-cycle highways are two-way roads, each cycle 2.5 right of centre.
  Two cycles going opposite ways were measured never closer than 2.5; on the
  centre line they met at 0.

**One kata floor each** (5c17be4). Floor *k* is seat *k*'s, in her colour, with
her element (炎 氷 雷 花) on its plate. It is grey until she comes in, and
anybody else is told in words where her own floor is.

**The Feast is the ring's** (6b41589): the arena's own `Critter`, the ring's
eating, and three rounds (rat + rabbit, rabbit + bird, bird + mantis).

**Shadow Lionheart on three levels** (10c70ba):
- EASY is the shipped fight, number for number.
- MEDIUM and HARD turn the five knobs Richard named: walk, wind-up, breath,
  bar and damage.
- On MEDIUM and HARD he does his own **凶 Cross Slash**: three Xs, each drawn
  on where she is.
- EASY pays stars only. MEDIUM or HARD pays the tenth quest and the 1st Class
  flag (`shadowPrize`). Beating all three pays her own 凶: her Cross Slash
  draws 凶 instead of 十 and hits ×1.25.
- **The quest's words were left behind by this**, still "Beat Shadow
  Lionheart", so a kitten who beat EASY was told she had done a quest she had
  not. They say "on MEDIUM or HARD" now, and so does 1st Class's "to next".
  world-check asks it of the pay table itself. **Payne's `payne_q_shadow` still
  says the old words.** It is a voiced line she approved, so it is not changed
  without asking.

**The Pandapaw trial is a panda's whole life in the ring** (3c033af,
`dream/pandatrial.js`):
- Canes, then a cub. The REAL `entities/panda.js` licks her up from 30% while
  she is rooted.
- Then the cub grows, holo-kittens come for the panda, and it is knocked down.
- Richard's card on what that means out there, and the cub licks her back up.
- The no-`hurt()` guard names its one exception, `panda.hurt(`, which is the
  animal's own bar.

**The holo kit** (2c24f71, `dream/holokit.js`). "When a player enters the
simulator, they appear there with no kotodama orbs or Clan abilities":
- `s.holoWorn` is a copy of her real ring, made on the way in and thrown away
  on the way out.
- `p.holoOrbs` is what she has EARNED in here: the first Gallery win of each
  drill, plus a 3-star pedestal's extra, at most four of a kind. It is saved
  in her row.
- The bag is not stored at all. It is (copies + earned) − worn, so nothing can
  be lost or duplicated between the two.
- Her real orbs and clan are never touched.
- The pause menu's **(HOLO) PLAYER PROFILE** shows only while somebody is in
  the simulator.

**Lionheart is the simulator's quest-giver** (b8240c7, `dream/lionguide.js`).
"Lionheart should act as a Quest giver like how Payne is a quest giver":
- His card is Payne's card: WHERE NEXT, MAP, WHAT DO MY ORBS DO, (HOLO) PLAYER
  PROFILE, and the 凶 row.
- `lionNext` is pure and always answers. A visit is standing on an island.
- After 150 s with nothing won he calls her by name with one suggestion.
- There is a 地図 MAP kiosk on the hub, and the corner minimap draws the
  simulator while every kitten it serves is in there.

**The Help topic** (ec87a57): see [help.md](help.md). Lionheart's card opens it
on READ ABOUT THE DREAM DOJO.

**The Sine Gauntlet is one course** (8d323bd): see [its own
section](#正弦-the-sine-gauntlet-dreamcoursejs-dreamsinejs), above.

**Open:** nobody has played any of this list yet. Two sets of numbers are
guesses, not measured on a kitten: the Feast's bands (150/72/48) and the
Pandapaw trial's (80/50/36). MEDIUM's and HARD's knobs are also first numbers.

## Voice

Lionheart is **Barrett** (`d603a8cd-3fe1-55e0-9245-617a2589131e`), nine clips
in `public/voice/lionheart/`. Every line he says aloud is a render of exactly
its card, and the card stays up until he has finished. Richard's own clone was
made and turned down; Barrett won on "the smoothest and cool/confident anime
sounding voice", with one caveat that became a writing rule — **not too
seductive**, so his lines are loud, practical and arcade-owner, and nobody
"jacks out": she **connects** and **disconnects**. The whole casting, the
cutter and the gating are in
[voices.md](voices.md#lionheart-is-barrett-and-the-wording-is-half-the-casting).

## Still to build (stages 2–5)

1. ~~**Kotodama Gallery**, the rundown of her equipped orbs, and the Clan Trial
   Hall.~~ Built (stage 2, above).
2. ~~**Tameshigiri** and **Kata Trace**. Kata Trace is the startup's core.~~
   Built (stage 3, above).
3. ~~**Bridges and light-cycles**, Kudamono Storm, Sine Gauntlet, Holo-Sentries,
   and Bamboo Infiltration.~~ Built (stage 4, above).
4. ~~**Arena School**, ranks (剣士 KENSHI and up), the holographic Fighter Card,
   the daily and weekly rotation, and the **Shadow Lionheart** boss.~~ Built
   (stage 5, above).
5. ~~**VR kitten sheets** for all four kittens, plus a combat sheet for the
   Shadow.~~ Built. This is the "do both" look: the visor in the real world,
   the headset sheet in the sim. `Player.setSimLook` swaps the Billboard's look
   on the cross and puts back the exact home texture and geometry on the way
   out ([art.md](art.md)). ~~The Lionheart voice audition~~ is done:
   **Barrett**, nine lines, wired (see Voice, above). ~~Health bars only on enemies tougher
   than three hits~~: done, `maxHits > 3` gets a SimBar.

**Non-negotiable 3 holds in all of them.** Anything that hits in the sim is a
hologram on the `TrainingGate`, reached through the sim's own hud. `world-check`
fails if anything under `dream/` calls `hurt`, or if `dreamdojo.js` or
`simworld.js` calls `strikePlayers`.
