# The Dream Dojo — Lionheart's VR arcade

The prototype of Richard's startup, inside the game. A walled-off pad northeast
of the Dojo of the Turning Circle with four holographic tubes on it. A kitten
walks into hers, a visor comes down, she floats, and her view goes over into a
**simulator**: another reality in the same place. Lionheart runs it.

Stage 1 is built: the realm system, the arcade, the tubes, jacking in and out,
the holo-Dojo hub, and Lionheart himself. The training modes are stages 2–5 (the
plan is at the bottom of this file) and have not been written yet.

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

1. **Kotodama Gallery**, the rundown of her equipped orbs, and the Clan Trial
   Hall.
2. **Tameshigiri** and **Kata Trace**. Kata Trace is the startup's core.
3. **Bridges and light-cycles**, Kudamono Storm, Sine Gauntlet, Holo-Sentries,
   and Bamboo Infiltration.
4. **Arena School**, ranks (剣士 KENSHI and up), the holographic Fighter Card,
   the daily and weekly rotation, and the **Shadow Lionheart** boss.
5. **VR kitten sheets** for all four kittens (the "do both" look: the visor in
   the real world, a generated VR sprite in the sim). Health bars only on
   enemies tougher than three hits.

**Non-negotiable 3 holds in all of them.** Anything that hits in the sim is a
training dummy in `SimWorld.props`, and `world-check` fails if
`dreamdojo.js` / `simworld.js` ever call `hurt` or `strikePlayers`.
