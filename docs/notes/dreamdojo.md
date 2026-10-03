# The Dream Dojo — Lionheart's VR arcade

The prototype of Richard's startup, inside the game. A walled-off pad northeast
of the Dojo of the Turning Circle with four holographic tubes on it. A kitten
walks into hers, a visor comes down, she floats, and her view goes over into a
**simulator**: another reality in the same place. Lionheart runs it.

Stages 1 and 2 are built. Stage 1 is the realm system, the arcade, the tubes,
jacking in and out, the holo-Dojo hub, and Lionheart himself. Stage 2 is the
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
| jack | 0.7 | full rain and flash, then **cross** |
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
  Two stones sit across the gap from the Dojo. `world-check` measures the hops
  at **2.7, 2.5 and 3.8 units with steps up of 1.0**. A walking jump clears
  about 9, so she has to jump and cannot miss.
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
- **The visor** sits at `height * VISOR_Y` (0.80). This was checked by eye on
  Ember mid-rise: it is on her eyes.

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

### 正弦 The Sine Gauntlet (`dream/sine.js`)

Richard: "y = A·sin(ωt+φ) shown live". Four walled lanes, one kitten each.
Each lane has six laser bars, and bar *n* stands at **y = C + A·sin(ωt − kn)**.
At the top of its swing she walks under it. At the bottom she jumps it. In
between, it hits her.

| level | wave | the idea |
| --- | --- | --- |
| L1 | 2.0 + 1.6·sin(1.6t) | k = 0 — every bar together, a standing wave |
| L2 | 2.0 + 1.6·sin(1.8t − 0.8n) | the crest travels down the lane slower than she walks: ride it |
| L3 | 2.0 + 1.7·sin(2.4t + 0.9n) | the crest comes AT her, faster |

- **Non-negotiable 1, the third time.** `barHeight` is the one function that
  does all three of these:
  - places each beam;
  - draws its oscilloscope on the wall (the newest point *is* the bar's end,
    so the wave flows out of the laser);
  - prints `bar n=0: 2.0 + 1.6·sin(128°) = 3.25 → WALK UNDER` on her card.

  `world-check` reads all three back: 0.005 apart at most, which is the
  printed rounding.
- **The thresholds come from the laser's own hit test.** Her body is feet+0.2
  to feet+0.85·h, and the beam reaches 0.75. So `UNDER` is 3.0, and `JUMPABLE`
  is 1.6 against a single hop's apex of 2.41.
- **The stars are measured.** A search over (place, time) finds the fastest a
  kitten walking 7 u/s **who never jumps** gets from the kiosk to the far end
  untouched:

  | level | fastest | 3★ |
  | --- | --- | --- |
  | L1 | 9.2s | 11.5s |
  | L2 | 6.5s | 8.2s |
  | L3 | 14.5s | 18s |

  Riding the crest beats waiting for it, which is L2's lesson. Three stars is
  about 1.25× the search, so it takes the wave *and* a jump. `world-check`
  re-runs the search and holds the bands between 1.15× and 1.5×. Two stars on
  a level opens the next.
- A lane somebody is running refuses her sister in words and sends her to
  another.

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

## Voice

Lionheart has **no recorded lines yet**, and his bubbles are text only.
Richard's own voice is in `Design Ideas/Lionheart - Dream Dojo/Richard Voice for
Cloning/`. There is also a 2:48 cut of the two liveliest stretches,
loudness-normalised, because the clone limit is three minutes. The liveliest
stretches measure LRA 13.6 and 12.9 LU, against about 6 for the middle.
Richard asked for "a bit more energy ... I sound a bit sad/monotone". Higgsfield
has no style prompt, so the energy has to come from that choice of source
material and from how the lines are written.

**Cloning failed twice with "Voice limit reached"** while the account listed
**no** custom voices. That is a plan or workspace limit, not a slot to free up.
When a voice exists, register it in [voices.md](voices.md) with its id.

## Still to build (stages 2–5)

1. ~~**Kotodama Gallery**, the rundown of her equipped orbs, and the Clan Trial
   Hall.~~ Built (stage 2, above).
2. ~~**Tameshigiri** and **Kata Trace**. Kata Trace is the startup's core.~~
   Built (stage 3, above).
3. ~~**Bridges and light-cycles**, Kudamono Storm, Sine Gauntlet, Holo-Sentries,
   and Bamboo Infiltration.~~ Built (stage 4, above).
4. **Arena School**, ranks (剣士 KENSHI and up), the holographic Fighter Card,
   the daily and weekly rotation, and the **Shadow Lionheart** boss.
5. **VR kitten sheets** for all four kittens (the "do both" look: the visor in
   the real world, a generated VR sprite in the sim). Health bars only on
   enemies tougher than three hits.

**Non-negotiable 3 holds in all of them.** Anything that hits in the sim is a
hologram on the `TrainingGate`, reached through the sim's own hud. `world-check`
fails if anything under `dream/` calls `hurt`, or if `dreamdojo.js` or
`simworld.js` calls `strikePlayers`.
