# Katana Kitties — session handoff

Context dump for continuing work in a fresh session. The `README.md` covers how
to run and extend the game; this file covers *why things are the way they are*
and what's still open.

**Location:** `C:\Users\Hypot\OneDrive\Desktop\Claude Conversation\katana-kitties`
**Repo:** https://github.com/InnerBushido/katana-kitties (private)
**Run:** `npm run dev`, then open it in **Firefox** — Chrome cannot read the
Joy-Con sticks through vJoy (see below).
**Check:** `node tools/world-check.mjs` — headless smoke test. It prints its own
total on the last line; don't quote a number here, it drifts.

---

## What this is

A split-screen co-op browser game built for Richard's 9-year-old niece (who is
interested in making games) and her younger sister. Two samurai kittens —
**Ember** (orange) and **Frost** (grey) — explore a chain of floating Japanese
islands, knock things over, and ride storm dragons between them.

**Design inputs, all from the kids:**
- Her own menu-screen drawing: a cat-head panel with SETTINGS / PLAY / HELP.
  Reproduced faithfully as an inline SVG on the title screen. This matters to
  her — don't redesign it.
- Her books: *Warriors* (Erin Hunter) and *Storm Dragons* (Julie Kagawa).
- Her title idea: "Katana Kitties".
- Favourite games: Minecraft, Wobbly Life, Untitled Goose Game.
- Richard practises Japanese samurai swordsmanship — hence the katana framing.

**The maths teaching is the point of the project, not a bolt-on.** He's teaching
her sin/cos, the unit circle, theta, degrees vs radians, vectors and the origin,
using graph paper, a compass and a protractor. Two features carry this and
should be protected in any refactor:

1. **Kotodama Orb** — a companion that circles the kitten and draws its own
   working: radius vector, swept angle, and both legs of the right triangle with
   live `cos θ` / `sin θ`. The overlay is drawn from the *same two numbers* that
   position the mesh, so it can't drift out of sync with what she's watching.
2. **The Dojo of the Turning Circle** — a whole island west of town is a
   walkable unit circle on graph paper. **Walk onto it and you become the
   point.** A HUD board plots both waves with a playhead locked to your angle
   and prints `cos²θ + sin²θ` sitting at `1.000`.

---

## Key decisions (and why)

- **three.js, not Unity** — deliberate, despite Unity being Richard's stack. The
  refresh-to-see-it loop is what turns a 9-year-old into a developer, and Switch
  2 controllers work through the browser Gamepad API with no driver or input
  system config. He agreed to this.
- **No AI-generated 3D meshes.** Characters and dragons are AI-generated anime
  sprite sheets billboarded inside procedural low-poly terrain — that *is* the
  Super Mario RPG look. Generated meshes would fight it on style consistency and
  topology. Tripo / fal / polyfork are deliberately unused.
- **Combat is deliberately absent.** The slash exists to knock scenery over.
  Richard flagged enemies as "later if it fits" — adding them forks the tone
  toward Warriors-style clan conflict.

---

## Current state — working

- Title screen (her cat-head menu), pause menu (Esc / Start), settings, help.
- Six floating islands + a fully built town: 3-storey clan hall, pagoda houses,
  great torii, market street, red bridge, 46 cherry trees, 42 knockable props.
- Two players: run, double-jump, sprint, katana slash, mount/dismount dragons.
- 7 dragons across 5 breeds, each with its own colour and breath (fire, frost,
  lightning, pollen, blossom). Two on the home island so both girls can fly.
- Six clan shrines, one per island, each granting a different buff — see
  Clans below. Warriors flavour: Thunderpaw, Riverclaw, Shadowtail, Windwhisker,
  Icewhisker, Pandapaw.
- **A leader standing at every shrine**, with a speech bubble that invites you
  in and names what her clan gives you. Cast designed by one of the girls.
- **A 79-second opening cutscene** flown through the real 3D world, skippable
  with Start (or Space/Enter), replayable from the pause menu. See The story
  below.
- **A raisable, rideable panda** (Pandapaw). Cut 20 bamboo for a cub that
  follows you, 20 more and it grows big enough to ride at 2x running speed
  with a claw swipe attack. See The panda below.
- 150 cuttable bamboo canes: two groves on the home island (east over the red
  bridge, west across the far slope) and a proper forest on the bamboo island.
  Katana-only.
- Minimap: every island in its biome colour, both kitties with heading, every
  perched dragon, clan shrines as coloured diamonds (ringed once you've sworn),
  and the landmarks worth walking to. Three zoom steps on `Z`; in split screen
  there are two maps, one per half, each following its own kitten, with `X`
  zooming player 2's.
- Six biomes — meadow, bamboo, autumn, frost, ash, dusk — driving ground
  colour, foliage and detail scatter per island.
- Dynamic split-screen: splits when players separate, rejoins when together,
  with hysteresis. Forced merged inside the dojo.
- Sprite animation: 4 rows (idle / walk / jump / attack) × 8–10 directions.
- The Kotodama Orb and the Unit Circle Dojo, both verified numerically.
- ~138fps, 72 draw calls, 159k triangles.

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

## The story — leaders and the opening cutscene

**The cast came off a sheet of paper.** One of the girls drew a page headed
CHARECTERS: eight cats, each labelled with its breed, each tagged "use". Six
became clan leaders, matched to the clan their breed already suggested — and
the match is the point, because it means the roster is hers rather than a set
of names invented to fill a table:

| her drawing | clan | leader | why that clan |
| --- | --- | --- | --- |
| Siamese | Thunderpaw | Sunstreak | the loudest, fastest breed there is |
| Turkish Van | Riverclaw | Rippleclaw | the breed famous for swimming |
| Tuxedo | Shadowtail | Duskcoat | black-and-white, and you never hear it |
| Maine Coon | Windwhisker | Galemane | huge and maned — a dragon tamer |
| Himalayan | Icewhisker | Snowmantle | long white coat, blue eyes, snow |
| Ragdoll | Pandapaw | Bambooheart | big, soft and slow, like the panda |
| Calico | — | **Patchfur** | patchwork of every colour: the storyteller |

The eighth, the **orange tabby, is already in the game — that one is Ember.**
Worth telling her.

**Leaders are FRONT-FACING single cells: `cols: 1, rows: 1, mirror: false`.**
That is the one combination that never flips — the full-turn path with a single
cell always picks index 0 and never sets `flip`. The dragon and the panda are
side-on drawings that *want* to mirror toward their heading; a character
standing still and talking to you must not, or she turns her back the moment
the camera crosses her axis, and on a cat with a sash over one shoulder that is
instantly obvious.

**She stands on the FAR side of the dais** (`leaderSpot`, 3.4 out along the
axis from the island's centre) so a kitten walking up from the island meets her
across the ring with the gate and the beam behind her, rather than arriving at
her back. `leaderSpot` is exported and the cutscene's shot framing uses the
same function, so the camera can never drift off her.

**Her feet are on the STONE, not on the hillside.** The dais is decorative
geometry merged into the world mesh — `world.heightAt` knows nothing about it
and returns the terrain underneath, which planted every leader knee-deep in the
top step. Her height is the ground under the middle of the shrine (flat by
construction) **plus `SHRINE_DAIS.y`**, exported from `build.js` off the same
numbers that build it, and `LEADER_OFFSET` is asserted to be inside
`SHRINE_DAIS.r` so she can't walk off the edge of the platform she's standing
on. A cat sunk halfway into a stone plinth still reads as a cat at a shrine,
which is exactly why this needed a check rather than an eye.

**Her bubble names the buff.** Asserted per clan in the smoke test against a
keyword list. A shrine that says only "join us" makes a nine-year-old guess at
what she is choosing.

### The cutscene

`systems/cutscene.js`. 11 beats, 79 seconds, Start skips (see the controller
pass below), **WATCH THE
STORY AGAIN** in the pause menu replays it.

**The stage is the real world.** No second canvas, no pre-rendered video: it
drives its own camera through the same scene the game is played in, and the
leaders it flies to are the same billboards standing at those shrines
afterwards. That is where the depth comes from — islands slide past each other,
a shrine beam you haven't reached yet stands up over the horizon behind whoever
is talking — and it means the intro can never show a world that doesn't match
the one it hands you at the end of it. The Pokemon framing sits on top: the
speaker large against the live 3D backdrop, bordered dialogue box, portrait,
text typed a letter at a time.

**It plays from `startPlay`, not from the title screen.** That is the first
gesture a browser guarantees, and the intro has music and voices — starting it
any earlier means starting it silent.

**The elder is the only one on a "stage".** She has no shrine to stand at, so
she is a billboard parked a fixed distance in front of the camera and slid in
from the side. The six leaders don't need it: the camera has really flown to
where they really are.

**Shots frame her at ~14 units, filling about 40% of frame height.** The first
pass sat at 19 and she was under a third of the screen — technically in shot,
but you are looking at an island with someone standing on it rather than at a
character talking to you.

**The world keeps ticking underneath it.** Petals drift, shrine crystals turn,
dragons breathe on their perches. A frozen world behind a moving camera reads
as a video, which is exactly what this isn't.

**Her world speech bubble is suppressed during the cutscene** (`update(dt, [])`
with no players). Her bubble line is the shrine *invitation* — a different line
from the one she speaks in the intro — and two blocks of unrelated text on
screen at once is clutter. The dialogue box owns the words there.

**The music is still synthesised.** The intro has its own piece: the same
runtime synthesis in the **insen** scale rather than hirajoshi, slower, an
octave down, with a taiko thud on the downbeat (`MUSIC` in `audio.js`). It
shares only the root and the fifth with the game theme, which is why it reads
as a different piece rather than the same tune played slowly.

**`public/voice/*.mp3` are the ONLY audio files in the project.** Eleven
ElevenLabs lines, one per beat, ~1MB total, generated through the Higgsfield
`text2speech_v2` model with `variant: 'elevenlabs'` and a preset voice per
character (Patchfur=Mabel, Sunstreak=Quinn, Rippleclaw=Maya, Duskcoat=Vesper,
Galemane=Onyx, Snowmantle=Imogen, Bambooheart=Hana). The first version used
synthesised blips instead — cheap, no files, no licence — and it sounded like a
machine reading out a story rather than a cat telling one. **The blips are
still the fallback**: a clone with no `public/voice` folder plays them and runs
on the authored timings, so the intro never breaks on a missing asset.

**Beats fit themselves to their line, not the other way round.**
`Cutscene.loadVoices()` reads each clip's duration at boot and sets
`dur = max(authored, clipLength + 1.5)`, and paces the typewriter so the text
lands with the speech (`typeRate`). Nothing in the scene is a hardcoded timing,
so re-recording a line can never desynchronise it.

**A BEAT ENDS ON ITS LINE, NOT ON A TIMER — and that took two goes to get
right.** The rule above sizes the beat correctly and then quietly assumes the
audio starts the instant the beat does. It didn't. `speak()` built a fresh
`Audio(url)` per beat and called `play()` on it, so the fetch and the decode
happened *inside* that beat's own budget — while six of the eleven beats have
exactly `TAIL` (1.5s) of slack, because `voiceDur + TAIL` won the max. Any
start delay past 1.5s came straight off the end of the sentence.

Three things made it hard to see. It was **intermittent**, because it depended
on whether the file happened to be warm. It was **worse in Firefox**, which is
where the game is played. And `loadVoices` *looked* like it had already solved
it: it built elements with `preload = 'auto'` — but it resolved on
`loadedmetadata`, which fires as soon as the header lands, and then **threw the
elements away**. A file could report a perfectly good duration having never
had its body fetched at all.

The fix is both halves, and it needs both:

- `loadVoices` **keeps** the element (`b.el`) and waits for `canplaythrough`,
  so the clip is fully buffered before PLAY is ever pressed. `speak()` takes a
  preloaded element by preference and rewinds it; the url path survives only as
  a fallback. Verified: all eleven at `HAVE_ENOUGH_DATA` with `buffered.end`
  equal to the full duration, starting in ~110ms.
- `beatOver()` ends the beat when the authored time has run **and** the line
  has actually finished. That makes start latency irrelevant by construction
  rather than by being generous with the tail — which is the trap, because a
  bigger `TAIL` only moves the threshold.

**The give-up cap must key off whether the line ever STARTED, not off elapsed
time.** First version capped the wait at `dur + 4s` flat, which is just a
slower way to cut a line off — a 6s-late line lost half a second to the cap
that was supposed to protect it. A clip you can hear playing is always allowed
to finish; the cap exists for a `play()` the browser refused, which never
starts at all. There is a far looser second bound for the one case left, a clip
that begins and then stalls mid-word.

The typewriter is keyed to `voiceEl.currentTime` too, not the beat clock — a
late line has to type late *with* the speech, or the text finishes and sits
there while she is still talking, which is the desynchronisation `typeRate`
exists to prevent.

`tools/world-check.mjs` covers this without a DOM or an audio device: `beatOver`
is a pure function, and the checks assert an on-time line is unchanged, a late
one is not cut, a slipped beat still ends on a pause, and neither cap can
strand the scene or clip a playing line.

**The clan beats are FIRST PERSON.** They were third-person — Patchfur
describing each chief — while the box underneath showed that chief's own name
and portrait, so the scene claimed she was speaking and the words said
otherwise. She's standing right there; she introduces herself.

**No `animation-fill-mode` anywhere in the cutscene CSS** — see the preview-pane
gotcha below. Final states are authored as the default and animations only add
motion on top of something already correct.

**The speaker portrait is a SQUARE crop taken off the CELL, not off the image.**
`_setPortrait` first took the atlas's full width by the top 42% of its height
and drew that into a square canvas — a 2.4:1 source squashed to 1:1, flattening
every cat's face by more than half. It reads as bad art rather than a bad crop,
which is exactly why it survived being looked at: nobody audits a 96px portrait
for aspect ratio, they just think the drawing is odd. The crop is now derived
from `contentScale` and `pad`, which say where the figure really sits inside
its cell (bottom-aligned above `pad`, horizontally centred, `contentScale` of
the height), so all seven leaders frame identically instead of each being
framed by however loosely its own sheet happened to pack.

## The shrine scenes

Stand within `SCENE_RADIUS` (10) of a leader you have not met for `DWELL` (2s)
and she takes the screen in the opening cutscene's own furniture and says her
line in a recorded voice (`public/voice/shrine_*.mp3`, same preset voice per
character as the intro). `systems/shrinescene.js`.

**It fires ONCE, and `met` latches on START rather than on finish** — skipping
spends the introduction. The dais is exactly where both girls stand around,
because that is where the join ring is, and a scene that replayed there would
be the most irritating thing in the game.

**It GATES JOINING.** You cannot swear to a clan you have not met, which is
what lets the scene be full-screen: it is not an interruption on the way to the
buff, it is the way to the buff. Pressing interact early toasts rather than
doing nothing, because a button that silently fails reads as broken.
`world-check` asserts **every join ring sits inside the scene radius**, so
there is no spot where you can be refused and never trigger the fix.

**The dwell RESETS on leaving rather than decaying.** Kittens sprint over
shrines constantly on the way somewhere else.

**She turns toward whoever stopped, and it is not a rotation.** She is a
front-facing single cell that must never mirror, so past about a quarter turn
there is no art for where she is looking. `ClanLeader.lookAt` biases the
camera-facing yaw by at most `FACE_BIAS_MAX` (0.38 rad) and squashes x by half
the cosine — which is what a real turn does to a flat drawing. Measured against
the **camera**, because "toward you" is a screen direction and in split screen
the two kittens have their own.

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
leaves. `World.setDusk` lerps the sky uniforms, the fog AND the light
intensities from a remembered day palette — leaving the lights alone put bright
afternoon islands under a black sky, which reads as a broken shader rather than
as nightfall.

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

## The controller pass, and five things it turned up

Everything in this section came out of one round of feedback after the girls
had the game on real hardware.

**THE HUD IS HIDDEN FOR EVERY SCENE, FROM ONE CALL.** `_hudDuringScenes` asks
`_sceneActive()` rather than keeping its own list of scenes, and it is called
*before* the scene blocks rather than between two of them — it used to sit after
the opening cutscene's early `return`, so the intro was the one scene it never
ran for. The minimap goes with it because the minimap lives inside `#hud`. Two
copies of a rule, and the copy nobody remembers, is the same failure
`trackForIsland` exists to prevent.

**A SCENE IS SKIPPED BY `start`, SPACE OR ENTER — NOT BY ANY BUTTON.** It used
to be any key and any button, which sounds forgiving and is the opposite: they
hold a stick and mash the whole time a scene is running, so the 79-second intro
with seven recorded voices in it was being thrown away by a thumb resting on
jump. `SKIP_KEYS` and `Game._skipPressed` are the only two places that decide
it, and all four scenes (intro, shrine, summon, finale) go through them.

**`map` AND `math` ARE PAD-ONLY ACTIONS, DELIBERATELY.** Minimap zoom and the
maths overlay existed on Z / X / M and nowhere else. They are `ACTIONS` now, so
the remap grid picks them up for free — but with **no `KEYSETS` entry**, which
is the part worth not undoing: the keyboard keeps Z / X / M in the keydown
handler, so those still work while somebody else is on a pad. Routing them
through a player slot would kill the keyboard shortcut the moment that slot
binds a controller. `this.keys.has(undefined)` is false, so the two paths
cannot double-fire.

On a standard pad they are the **bumpers** — the only two buttons the game
never used, since the triggers already carry sprint. Guide (16) is a second
binding for `math` rather than the only one: browsers report it inconsistently
and Windows can eat it into the Game Bar, so a control bound to it alone is
dead on some machines with nothing on screen to say why.

**MENUS TAKE A CONTROLLER (`systems/menunav.js`).** The game was fully playable
on a pad and completely unreachable on one — PLAY, SETTINGS, RESTART and every
setting were mouse-only, so two kids on two Joy-Cons passed a laptop back and
forth. Three rules in it are load-bearing:

- **The highlight starts on the default action, which is what keeps "PRESS ANY
  BUTTON TO START" true.** Title focus begins on PLAY and, *on the title screen
  only*, every button confirms. A kid who has never thought about a menu
  presses something and the game starts, exactly as before. Inside a real panel
  only `jump` confirms, so the other buttons stay free to mean nothing.
- **A `<select>` is changed in place, never opened.** A native dropdown is an OS
  window the Gamepad API cannot reach — opening one with a pad is how you get a
  menu you can enter and not leave. Left/right cycle the options and dispatch
  the same `change` event a mouse would, so every listener in `main.js` works
  untouched.
- **`_paint` clears the ring globally before lighting one.** Toggling the class
  across only the current panel's items is the obvious version and it leaves the
  ring on the title's SETTINGS button when Settings opens — two highlights, the
  stale one drawn first, so it is also the one that looks like the cursor.

Either player drives it: there is one screen and one cursor, and making player 1
the only one who can press RESUME locks the other girl out of her own pause menu.

**WHICH AXIS MOVES THE CURSOR IS DECLARED IN THE MARKUP** (`data-nav`), not
guessed from CSS. The title's three buttons sit in a flex ROW, so pressing *down*
to reach a button that is visibly to the *left* reads to a nine-year-old as the
controller not working — `data-nav="horizontal"` puts them on left/right.
`#panel-help` is `data-nav="scroll"`: it is a wall of text with one button in it,
so up/down belongs to the text.

**A page you open to read opens at the TOP.** `_paint` scrolls the focused item
into view and the only focusable thing on the help page is BACK, at the very
bottom — so opening Help jumped straight past everything it exists to say. The
scroller is the `.panel` box rather than the page, because these overlays are
`position: fixed` and the document behind them has nothing to scroll.

**THE SHARED CAMERA IS UPDATED EVERY FRAME, SPLIT OR NOT.** This is the whole
fix for the jarring rejoin. The block lerps `sharedTarget`/`sharedDist` toward
their targets, and it used to sit inside `if (this.merged)` — so while the
screen was split those were not stale by a little, they were **frozen at
wherever the girls were standing the moment the screen split**, however long ago
and however many islands away. Coming back together started the lerp from that
abandoned spot and flew the camera across the archipelago, which is the
"teleport": it is really the tail of a lerp that should have finished minutes
ago. Running it always costs two vector lerps a frame on a camera that isn't
drawing, and there is now no transition to smooth because there is no
discontinuity to hide. `_sharedSeeded` snaps it once at boot and on restart, or
the first frame flies in from the origin the same way.

## The dragons looked low-res because of the CELL, not the art

`loadSpriteAtlas` packed every sheet into a fixed cell — 384 through
`_loadSprite`. That is honest for a kitten, where ten directions across four
poses fill the atlas. It is badly wrong for a dragon, and the reason is the
**shape** of the drawing rather than its size: the dragon is one long horizontal
creature squeezed into a **square** cell, so the fit is decided by its width and
its height gets whatever falls out.

```
dragon_sheet.png    2752x1536 on disk, one figure
packed into 384     338 px wide  ->  193 px TALL
```

193 pixels, stretched over an animal that fills a third of the screen when you
are riding it — which is exactly why it looks sharp opened in a viewer and soft
in the game. The art was never the problem.

`cell` is a **floor** now and the real size is derived: big enough not to
downscale the source at all, clamped by `maxAtlas` (2048), never below what the
caller asked for. Measured after:

```
dragon perched   384x384  ->  2048x2048 atlas,  drawn 1798 x 1027 px
ryuuseki         512x512  ->  1387x1387,        drawn 1220 x  596 px
panda adult      384      ->  1046
ember / frost    3840x1536 and 3072x1536  —  BYTE-FOR-BYTE UNCHANGED
```

**The kitten sheets landing on the floor is not luck, it is the design.** Ten
columns hit `maxAtlas / cols` well below 384, so they take the floor — which
matters, because the sprite-direction checks measure real cells out of those
sheets and a repack would move every number they assert. `scale` is also capped
at 1: upscaling into a bigger cell invents detail that isn't there and pays
memory for the pretence.

Cost: roughly 85MB more texture memory across the single-figure sheets.
`maxAtlas` is the knob if that ever matters on a weak laptop.

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

## The scene viewer, and why it exists

**`` ` `` opens a debug panel in play; `-` / `=` choose a scene and `0` plays
it.** Every cutscene in the game is gated behind hours of play *and* fires once
per session, which makes the last thing anybody writes also the hardest thing to
look at — checking one word of the finale meant knocking over 213 props. The
viewer clears the `played` latch before starting, which is precisely why it
cannot just call the same entry points the game does.

It also lists `7` `8` `9` and the map/maths keys, so the debug shortcuts are
documented in the place you use them rather than only in this file. Deliberately
plain and deliberately ugly: it is a developer tool sitting on top of a game made
for a nine-year-old and it must never be mistaken for part of it.

The one scene it treats carefully is `shrine`: it clears `met` **for the nearest
leader only**, because that flag is also what gates joining her clan, and
clearing all six would silently undo the player's progress through the
introductions.

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

## The Powerup Kotodama — the endgame

`entities/powerorb.js`, `systems/kotodama.js`, `systems/profile.js`,
`entities/stall.js`. Everything here is inert until 100% mischief, and
`Kotodama.awakened` is the single flag that says whether any of it exists —
the loop, the minimap and the stall prompt all read that rather than each
keeping their own idea of whether the endgame has started.

**Debug: `6` awakens them and fills both purses; `5` opens the profile
screen.** Same argument as `7` `8` `9` — the whole feature is behind 216 props.

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
| 三 | Sanzan / TRIPLE SLASH | hold attack — three cuts, planted |
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

**THE TRIPLE SLASH IS ARMED BY THE SWING AND FIRED BY THE HOLD.** The obvious
version gates on the swing animation still running, which leaves a usable
window of `TRIPLE.hold` (0.22s) to `attackTimer` (0.26s) — two frames. The move
would work about a third of the time and read as the game ignoring her.
`_triArm` lives from the press until she lets go. There is a check that walks a
real held button through the real controller and asserts it fires, and that a
tap never does.

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

## Gameplay rules worth not breaking

**A dragon can never be lost, and the home island always has two.** Dragons
belong to a *perch*. Hop off over solid ground and the dragon simply lands
beside you (`landAt`) — it only flies back to its perch (`returnHome`) when you
let go high over open sky, or when nobody is left walking on its island, which
covers flying off on another dragon, falling and respawning, and wandering
somewhere else. Making it bolt for home on *every* dismount was worse than
losing it: you could watch it leaving and couldn't stop it.

Bail out from a height and it **follows you down** (`flyTo`) rather than going
home, so a long drop never costs you your ride.

Two on the home island, because with one the second kitten can never follow the
first into the sky. Perches are validated through `world.findOpenSpot`, which
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

## Open bugs

**None known.** Everything reported through the last session is fixed and
verified — sprite directions, slope flicker, dragon loss and clipping, the
minimap/Dojo overlap, the orb's jittering glyphs, and the three Ryuuseki bugs
above (a solo rider stealing the split screen, the beam count reading the crew
instead of the seat, and the fan firing backwards out of his mouth). Run the
smoke test before assuming otherwise.

**The arena exists now** — see The World Martial Arts Tournament below. The
promise `done4` makes is kept, and this entry is left here only so anybody who
remembers the old TODO can see it was closed rather than dropped.

**The tournament has NOT been played by the girls yet.** Every part of it is
verified headlessly and driven through in a browser, which settles whether it
works and says nothing at all about whether it is fun. The three numbers most
likely to come back are `OUT_DAMAGE` (30 — how much a ring-out hurts),
`ATTACKS.dash.knock` (19, which is what makes ring-outs happen at all) and
`OPEN_AT` (0.80). All three are checked, so turning them will tell you if it
breaks something.

**A FIFTH ORDERING BUG, and the same shape as the other four.** Both grottos
shipped with trees across the doorway. Two mistakes stacking: the outlying-island
tree scatter lived inside `_buildTown`, which runs BEFORE the stars are placed,
so the grotto's `keepClear` did not exist yet to be checked — and that loop never
consulted `keepClear` anyway, unlike the home-island loop directly above it. It
is `_scatterOutlying` now and runs after `placeDragonBalls`.

**And the one little house per odd island had the same disease, twice over.**
It sat at the island's exact centre, was built during `_buildTown` (so before
the stars), and **registered no solid at all** — so nothing downstream knew it
was there, `findOpenSpot` walked straight over it, and the dusk grotto came up
with a house planted across its doorway. A building the collision model does
not believe in is worse than no building. It moved into `_scatterOutlying`,
off centre, `keepClear`-checked, and it leaves a solid behind. It also has to
dodge PROPS, which nothing else in that file needs to do: the bamboo grove is
props, it is planted earlier, and a house dropped on it walls in forty canes.

**Moving it exposed something that had been wrong the whole time.** Four shrines
and five dragon perches were written as world coordinates that were *literally
their island's centre* (`{x: 150, z: -95}` IS island 1). `findOpenSpot` was being
shoved off centre by whichever tree it happened to land on; take the trees away
and everything snapped to the middle. A shrine in the dead centre of an island is
arbitrary, it leaves no clear side for the star's furniture, and `leaderSpot` has
no axis to stand its leader along at zero. Shrines now carry a bearing and a
fraction of the island radius; the perches were rewritten off-centre, roughly
opposite their shrine. `world-check` asserts nothing sits within 2.5 of an
island's origin.

**The seven locks are built and verified but have NOT been played by the girls
yet** — which is the only test that counts for difficulty. The two things most
likely to come back are the 7★ (it needs a Shadowtail oath *and* three chained
jumps, the hardest thing in the game to reach) and whether the hints are read at
all. `SHARD_RISE` and `ISLAND_LOCKS` are the two knobs; both are checked, so
turning them down will tell you if it breaks something.

```bash
node tools/world-check.mjs      # all passing (it prints the count)
npm run build                   # clean
```

Two things that are *working as designed* but read like bugs if you forget:

- **Chrome cannot read the vJoy sticks.** Play in Firefox — see the next
  section. This is a browser bug, not a game bug, and the title screen now
  detects it and says so.
- **A saved controller map beats the source defaults.** Editing
  `DEFAULT_VJOY_MAP` looks like it did nothing until you press RESET TO
  DEFAULTS in Settings (or clear `kk.vjoy.map.v2` in localStorage).

---

## PLAY IT IN FIREFOX — Chrome cannot read the vJoy sticks

**Chrome returns all-zero axes for the vJoy device. Firefox reads them
correctly. Same machine, same driver, same moment.** Measured with
`tools/gamepad-dump.html`:

```
Chrome    axes: 8  buttons: 32   every axis 0.00000, span 0.000, forever
Firefox   axes: 8  buttons: 38   axis 0/1 and 3/4 live, span ~1.9
```

Chrome is *not* failing to see the device: buttons arrive and
`gamepad.timestamp` advances thousands of times, so it is receiving and parsing
fresh reports — it just yields nothing for the axis usages. Nothing in page
JavaScript can work around that; the values never reach the Gamepad API. Note
Chrome also truncates the button list to 32 (its `kButtonsLengthCap`) while
Firefox reports all 38, so the two browsers do not even agree on the button
indices — **the saved button map is per-browser** (localStorage), which is
lucky, because it means calibrating in one doesn't corrupt the other.

Before burning hours on this again: `tools/gamepad-dump.html` opens straight
from disk, no dev server, and settles it in about ten seconds. The line that
matters is *distinct timestamps seen* — if it climbs while every axis stays
flat, the browser is the problem, not the game and not the feeder.

## Joy2Win — the feeder behind vJoy

The Joy-Cons reach vJoy through **Joy2Win** (`github.com/Logan-Gaillard/Joy2Win`,
Python + pyvjoy). Its `config.ini` decides what the browser ever sees, and two
settings there can make the game look broken when it isn't:

**`mouse_mode` must be 0.** Joy-Con 2 has an optical mouse sensor on the rail.
In `control_type/duo_joycon.py` the stick axes are written only when that side
is NOT in mouse mode:

```python
if joyconMouseMode != "Left":
    vjoy.set_axis(pyvjoy.HID_USAGE_X, joyconLeft.analog_stick["X"])
    vjoy.set_axis(pyvjoy.HID_USAGE_Y, joyconLeft.analog_stick["Y"])
if joyconMouseMode != "Right":
    vjoy.set_axis(pyvjoy.HID_USAGE_RX, joyconRight.analog_stick["X"])
    vjoy.set_axis(pyvjoy.HID_USAGE_RY, joyconRight.analog_stick["Y"])
```

and mouse mode latches when the sensor sees a surface (`mouse["distance"]` of
`"00"` / `"01"`) **and** `config['mouse_mode'] != 0`. A Joy-Con lying on a desk
satisfies that. Buttons keep working; the sticks go completely silent.

**`orientation` is a single-Joy-Con setting and only swaps the stick axes.** In
`controllers/JoyconL.py` the decoder ends with `if orientation == 1: x, y = y, x`
— a transpose, no negation. With `controller = 0` (both Joy-Cons) the duo path
runs and orientation is out of spec. Leave it at 0 and let the game apply the
sideways rotation in its axis map; the transpose is why deriving the stick signs
by rotation logic kept coming out wrong.

Axes are `HID_USAGE_X` / `Y` for the left Joy-Con and `RX` / `RY` for the right,
never a POV hat. The README tells you to configure vJoy with "24 buttons or
higher" and says nothing about axes — X, Y, Rx, Ry have to be enabled in
Configure vJoy too.

**Telling "not written" from "written wrong":** `analog_stick` initialises to
`{"X": 0, "Y": 0}`, and 0 is the *minimum* of vJoy's 0..32768 range, which
Chrome reports as `-1.00`. So if any axis ever gets written it reads −1.00 or a
real value. An axis reading exactly `0.00000` is vJoy's untouched centre —
proof `set_axis` was never reached for it.

## Two players, one pad (the main input setup)

Both sideways Joy-Cons reach the browser as a **single** vJoy gamepad — there is
no P2 device to claim. So a player slot binds to a `{ pad, half }` pair, not to
a pad, and both slots can name the same pad with different halves:

```
bindings = [ { pad: 0, half: 'left' }, { pad: 0, half: 'right' } ]
```

`padMode` (Settings → Controllers) is `auto` | `split` | `separate`. `auto`
splits only when a merged vJoy pad is the sole device, so a Pro Controller or
two individually-paired Joy-Cons still get one pad each.

The sideways 90-degree stick rotation is **not** a rotation step for these — it
lives in the axis map (`axX`/`invX`/`axY`/`invY`) per half. The remap grid
captures the stick as *"push RIGHT"* and *"push UP"*, so the rotation falls out
of the calibration. (`joyconRotation` still applies to a lone Joy-Con on its own
pad.)

A press that is completing a capture is swallowed for that frame — binding a
button to ATTACK must not also swing the katana on the way in.

**Stick orientation cannot be reasoned about. It was measured.** The tempting
model — "the two halves are turned opposite ways, so their signs mirror" — is
wrong, and produced three wrong signs out of four. How each half's stick lands
in vJoy depends on how the feeder wired it. On Richard's hardware, held
sideways:

```
LEFT   push L/R -> Y  positive/negative     push U/D -> X  positive/negative
RIGHT  push L/R -> Ry positive/negative     push U/D -> Rx negative/positive
```

which, with the game's +y = screen DOWN convention, is:

```
left   x = -axes[1]   y = -axes[0]
right  x = -axes[4]   y = +axes[3]
```

**A vJoy axis index is not a fixed name either.** vJoy only exposes the axes its
feeder enabled, so the right stick sits on `axes[3]/[4]` when Z is enabled and
`[2]/[3]` when it isn't. Reading the wrong index gives a stick that is silently
dead, not wrong — an early version read axis 2 (Z) for the right half and the
right kitten simply never moved. Richard's layout:

```
axes[0]=X  axes[1]=Y   -> LEFT  Joy-Con stick
axes[2]=Z                 (enabled, never moves)
axes[3]=Rx axes[4]=Ry  -> RIGHT Joy-Con stick
axes[5..7] Rz/Slider/Dial pinned at -1 (not enabled)
```

`autoDetectSticks()` re-numbers this rather than trusting it, and keys off
**movement**: wiggle both sticks and the axes that travelled are the sticks,
first pair left, last pair right. Resting position looked like the obvious
signal and isn't — on this vJoy device every axis rests at 0.00 whether it
carries a stick or nothing, so the "centred axes" rule saw all eight and put the
right stick on 6/7. It's kept only as a fallback, and only when exactly four
axes qualify; more than that reports ambiguity instead of guessing.

It **only moves indices and inherits the signs from `DEFAULT_VJOY_MAP`**,
because no amount of sampling tells you which way is up. It runs for the first
~6 seconds after a merged pad appears (retrying — a feeder that hasn't sent its
first report reads as every-axis-at-minimum, and one failed attempt at that
instant used to poison the session), then stops, so it can never fire mid-play
and rewrite the map under someone's thumbs. That automatic pass is **quiet**: it
fails by design before anyone touches a stick, and reporting that would put an
alarming red note under a perfectly good map. Never runs over a hand-calibrated
map; **DETECT STICKS** in Settings forces it and does report.

Diagnosing a dead stick: a released stick, a dead channel and a mis-bound axis
all read `0.00` in a snapshot, so the readout records the **range** each axis
has covered instead. Wiggle both sticks and read the axes line:

```
X 0:0.00 [-1.00..1.00] P1y    <- healthy, bound to P1's x
Z 2:0.00 [flat]               <- nothing arriving on this channel
Rx 3:0.00 [-0.15..0.15] P2y   <- moving, but barely
```

Three distinct diagnoses, and they need different fixes:

- **every axis `[flat]`** — nothing is reaching the browser. Not a game bug;
  the feeder or Chrome is the layer to look at.
- **a range with no tag** — that axis is live but nothing reads it: wrong index,
  fix with DETECT STICKS or the two-click stick capture.
- **a range smaller than ~0.25** — bound correctly but the travel is inside
  `dead()`'s 0.22 threshold, so it's floored to zero. The per-half row prints
  the pre-deadzone value next to the post (`stick 0.00 … raw 0.15 ← inside
  deadzone`), which names this one outright.

CLEAR AXIS RANGES restarts the measurement.

**A saved map beats `DEFAULT_VJOY_MAP`.** Once anything has been captured, the
`localStorage` copy is what loads. Editing the defaults in the source will look
like it did nothing until you hit **RESET TO DEFAULTS** in Settings (or clear
`kk.vjoy.map.v2`).

## Other controllers — PS4, Xbox, two pads at once

**Verified headlessly, not on hardware.** `node tools/pad-check.mjs` drives the
real `InputManager` with synthetic `navigator.getGamepads()` fixtures — real id
strings, real button counts, real HID orders — so everything below is about code
rather than about which pad happened to be on the desk. It cannot tell you a
stick *feels* right; it settles which profile matches, which slot binds to which
pad, which physical button lights which action, and whether two pads stay
independent. The Joy-Con path is a regression case in it.

**A DualShock 4, a DualSense and an Xbox pad all land on `standard`,** because
Windows and both browsers carry a remap table for them, and the mapping is
correct as it stands: Cross jump, Square attack, Circle interact, Triangle
mount, L2/R2/L3/R3 sprint, Options pause, d-pad moves. No button fires two
actions. **The right stick is unused by design** — nothing in the game consumes
`cx`/`cy`, the camera is scripted — so a PS4 player pushing it gets nothing, and
that is not a bug.

**TWO PADS WORK, and the Firefox rule does not apply to them.** Two of anything
plug in and bind P1 → first pad, P2 → second pad, in connection order, with
independent sticks and buttons. **The Chrome axis bug is a vJoy bug, not a game
bug** — a PS4 pad is a native HID device Chrome has a table for, so with two PS4
pads Chrome is fine. Firefox is only required when the Joy-Cons are coming
through Joy2Win + vJoy.

**`padMode: 'split'` used to clone one pad onto BOTH players, and that was the
real find.** `half` is read by exactly one profile — `vjoyDual`, through
`readHalf`. Every other profile ignores it and returns one identical snapshot,
so splitting a PS4 pad gave both slots the same input: the two kittens moved as
one, every press jumped both, and player 2 had no controller while appearing to
have one. `_syncBindings` now refuses to split anything that is not a merged
vJoy pad, `padMode` included — the setting cannot override the invariant.

That one bug had a second face. A pad with two slots is exactly what puts the
**vJoy remap grid** on screen, so with SPLIT selected and a PS4 pad connected,
calibrating a PS4 button wrote into `vjoyMap` — a map that pad can never be read
through — and **silently overwrote the Joy-Con calibration**, which persists to
`localStorage`. Fixing the split closes it, and `beginCapture` and
`autoDetectSticks` now refuse a non-vJoy pad outright, so the invariant is
stated where it can't be routed around by a fourth UI path.

**A pad the browser has NO table for falls back to `generic`, and its face
cluster is shuffled.** Raw DS4 HID order is Square-Cross-Circle-Triangle, so the
fallback reads Square as jump and Cross as interact. Sticks, triggers and start
are fine, and the resting-at-−1 analog triggers correctly move nothing. This is
left alone deliberately: `generic` serves *unknown* pads and there is no order
that is right for all of them. It should not fire in practice — both browsers
know the DS4 and the DualSense. **A cheap USB pad is where it will bite.**

**There is no remap escape hatch for a non-vJoy pad.** The Settings grid edits
`vjoyMap` only. If a generic pad ever needs rebinding, the honest fix is a
per-profile map rather than widening the vJoy one, which is a real piece of work
and not worth doing before something actually needs it.

**Mixing a vJoy Joy-Con pad with a second controller costs you a Joy-Con.** Two
live pads means no split, so the merged pad binds to P1 with `half: null`, and
`readHalf` defaults to `'left'` — the right Joy-Con is unreachable. Use two
Joy-Cons, or two other pads, not one of each.

## Sound

Every sound *except the eleven cutscene voice lines* is **synthesised at
runtime** in `src/core/audio.js` — oscillators and filtered noise. The
exception is `public/voice/*.mp3`; see The story above for why it earned one. Nothing to download, nothing to
licence, no asset pipeline, a few KB of source. The music is generated the same
way: a koto-ish pluck wandering the **hirajoshi** scale over a drone, scheduled
a beat ahead on a `setInterval` (never off the render loop, or it stutters
whenever the GPU does).

Three things to know before touching it:

- **Nothing exists until `resume()`**, called from a real user gesture.
  Pressing PLAY is the first one we're guaranteed.
- **The compressor knee will eat everything.** `DynamicsCompressorNode` has a
  default 30dB knee, so it starts compressing 30dB *below* the threshold — at
  the levels these blips run, that silently squashed every sound in the game to
  a third of its intended loudness. Knee is 6 now, and there's a single
  `SFX_MAKEUP` on the bus so per-sound gains stay relative to each other.
- **Verify by rendering, not by listening.** `OfflineAudioContext` renders a
  sound to samples so peak level and clipping can be measured. Checked: every
  cue peaks 0.17–0.72, and 14 at once (the voice cap) hits 0.83 without
  clipping.

## A piece of music per island, and one per dragon

Ten tracks now, all still synthesised — see Sound below for the engine. `MUSIC`
in `audio.js` holds them; `ISLAND_MUSIC` maps biome → piece and
`trackForIsland()` resolves it.

| where | piece | what makes it that place |
| --- | --- | --- |
| home | `play` | **unchanged, note for note** |
| autumn | `autumn` | yo scale (no semitones), down a fourth to A |
| frost | `frost` | kumoi, high, 80% rests, a bell over every note |
| bamboo | `bamboo` | hirajoshi, fastest island, taiko, busiest |
| ash | `ash` | iwato — the darkest of the five — low, drone-heavy |
| dusk | `dusk` | insen with fifths: the island the story points at |
| Dojo | `dojo` | the sparsest thing in the game, deliberately |
| storm dragon | `flight` | **the only piece with a bassline** |
| Ryuuseki | `ryu` | unchanged |

**HOME KEEPS THE TUNE THEY ALREADY KNOW.** It is where both girls start every
session, and changing it is changing what the game sounds like.

**TEMPO ALONE WILL NOT DO IT** — two tunes in the same scale at different
speeds are the same tune. Three more Japanese pentatonics were added (kumoi,
iwato, yo) and every piece transposes, because `root` is the single biggest
lever for "somewhere else". `world-check` asserts each theme differs from the
home theme in scale, key or tempo — not merely that it differs in *some* field.

**The Dojo is deliberately the quietest.** There is a live sine/cosine board on
screen there; a tune with an opinion competes with the lesson. Asserted to be
the sparsest of the ten.

**THE DOJO IS NOT A BIOME AND HAS TO BE ASKED FOR BY NAME.** Its island
definition sets none, and `Island` defaults an unset biome to `meadow` — so a
plain `ISLAND_MUSIC[isl.biome]` hands the maths island the HOME theme. It is a
silent wrong answer: the right number of themes exist, every biome maps to one,
and the dojo just quietly plays the wrong one. `trackForIsland()` exists so the
smoke test resolves it through the same function the game does; two copies of a
rule with a special case in it is how the dragon-ball locks shipped unlocked.

**The storm-dragon theme is the Dragon Ball brief finally cashed in**, and it is
the only piece with `bass` and `snare`. A driving low square on every other step
with a noise tick on the offbeat is what turns the koto into a band — that is
the whole difference between "rock" and "the game theme played fast". It must
not blur into Ryuuseki's: yo against his insen, the brightest scale against the
darkest, a snare against his taiko, and no bass on his at all. You can hear both
inside a minute.

**ONE PLACE DECIDES WHAT PLAYS.** `Game._updateMusic` runs every frame and
`_wantedTrack()` is the priority list: Ryuuseki > any storm dragon > the island.
This used to be four scattered `startMusic` calls in mount and dismount
handlers, which was survivable with two tracks and is not with ten — a handler
fires on an *event* and the right track is a function of *state*, and the two
come apart the moment anything changes without an event to announce it. Landing
on a new island, for instance, which is the entire feature.

**Riding outranks standing** because a dragon crosses four islands in twenty
seconds and a theme that changed under you each time would be unlistenable.

**THE MUSIC FOLLOWS WHOEVER MOST RECENTLY ARRIVED SOMEWHERE NEW.** Two kittens
can be on two islands and there is one speaker. Every other rule is worse:
"player 1's island" means the second girl flies to the snow island and nothing
happens, which reads as the feature being broken for her; "whichever island
holds both" means nothing changes while they are apart, which is most of the
time. Arriving is an event either of them can cause, and the answer is stable
between arrivals — it cannot oscillate, because the tiebreak only moves when
somebody's island actually changes. `ISLAND_DWELL` (1.1s) is for the rims:
kittens cross island boundaries constantly on the way somewhere.

**The claim is seeded at `startPlay`** so the first frame picks a theme instead
of 1.1 seconds of silence while the dwell counts up.

**Music off means off.** `_updateMusic` returns early at zero volume. Without
that, deciding a track every frame quietly undoes the slider — `startMusic` will
happily run a full schedule into a bus at zero gain, so the setting looks
respected while the engine schedules oscillators forever for nobody.

**Measured, not listened to** (the rule below): peak output per track, with the
music slider at its default 0.4 —

```
autumn 0.162  frost 0.167  play 0.173  dojo 0.176  dusk 0.222
ash 0.257  bamboo 0.245  flight 0.276  ryu 0.410
```

and post-compressor with the slider at maximum, ryu peaks 0.885 — no clipping.
The quiet ones are quiet by design; the two loudest are the dragons, which is
the shape it should be.

## Gotchas that cost real time — don't rediscover these

**`requestAnimationFrame` never fires in a hidden or background tab**, so an
rAF-only wait hangs boot forever on the loading screen — the game simply never
starts if it isn't visible. `frame()` races rAF against a 60ms timeout.

**A road laid on the terrain has to clear the TESSELLATION, not just
z-fighting.** The island mesh is a polar grid ~4 units across, so between
vertices its flat triangles are a chord of the real surface — in a dip that
chord sits *above* the analytic height a road samples, and the street gets
swallowed by the ground it was laid on. A flat 0.32 lift cleared it everywhere
but left the road visibly hovering with the kitties wading through it. The fix
is per-vertex: take the highest of a small ring of ground samples (`surface()`
in `buildRoad`), which lifts the road only where the terrain actually bulges
and leaves it flush on the flat.

**Anything scattered on the ground needs a road mask.** Grass tufts and flowers
sprouting through packed sand is the sort of detail that quietly makes a town
look unfinished — `world.roadMask` holds the corridors, and both the ground
detail and the tree planting skip them.

**The bridge deck is an ARCH.** `buildBridge` lifts each segment by
`sin(t*PI)*rise`, so a single flat platform at its base height means walking
straight through the hump. It's ten stepped platforms following the same curve,
which also makes it stairs you can run up and jump off.

**A ridden dragon's heading is locked BROADSIDE.** It's a long side-on
drawing, so it only has two honest poses: facing screen-left and screen-right.
Steering the drawn heading with the full movement vector meant flying "into"
the screen put it edge-on, right on the billboard's mirror threshold, and the
whole creature snapped back and forth — pressing UP flipped the dragon. The
heading now comes from the sign of the sideways velocity with a dead zone
(`flySide` in `_updateFlight`), and only swaps on decisive left/right. Movement
is unaffected; that comes from the camera basis. The breath rides the same
heading, which is why it fires sideways rather than in eight directions.

**The rider bobs with the NEGATIVE of `sin(flap)`.** The wingbeat is faked by
squashing the sprite — `scale.y = 1 - sin(flap)*f` — so the dragon's back drops
exactly when `sin(flap)` is positive. Following it directly lifts the rider as
the dragon dips and the two read as separate drawings sliding past each other.

**A rider sits on the DRAWN body, not the quad.** The flight art is a long
horizontal creature fitted into a square cell, so it fills barely half the
cell's height. Seat and mouth offsets scaled to the quad put the kitten a full
body-length above the dragon's back. `seatOffset()` / `mouthOffset()` are
measured against the drawn body instead. They're world-space offsets along
`facing`, which is correct from every angle because the billboard mirrors
itself so the drawn head always points the way the dragon is facing.

**Check the winding on any flat quad you build by hand.** The road's triangles
were wound face-down, so it was lit from below and rendered as a dark olive
strip instead of pale sand — it looked like a colour bug, not a geometry bug.
Same class of mistake as the pagoda roofs.

**Billboards must use WORLD position.** `Billboard.faceCamera` computes the
camera angle from the sprite's position. A Billboard is parented to its entity's
group, so `this.position` is a *local* offset — almost always `(0,0,0)` — which
measures the angle from the world origin. Sprites visibly swing around as the
player walks away from the map centre. Uses `getWorldPosition` now.

**Pagoda roof winding.** The roof geometry was wound inside-out, so it was
backface-culled from above and every "rooftop" in the game was the plaster wall
top showing through. Symptom looked exactly like z-fighting. Diagnosed by
turning shadows off — the "roof" turned cream, which no lighting change should
do to a dark indigo surface. If a surface looks wrong from one side, check
winding before chasing depth.

**Coplanar faces.** Stacked box parts that end at the same height z-fight. The
house wall top, corner posts and sill beam all ended at `y + floorH`. Give each
stacked piece a different top height; overlap volumes rather than touching them.

**Roof clearance is set by where the surface passes over the wall, not by its
base.** The base ring is out at `hw*(1+overhang)` and the surface climbs as
`y = h * t^1.75`, so above the wall edge (t = 1/3) it's only ~0.30 above its
base. "Sinking the roof 0.28 into the walls" left 0.02 of clearance.

**Image models won't honour exact grid counts.** Asking for "exactly 8 columns"
returned 10, twice, explicitly. `loadSpriteAtlas` *measures* the column count
and the game maps however many cells it gets evenly around the circle. Don't
re-add a hardcoded count.

**Sprite sheet cell detection:**
- Background removal must **flood inward from the borders**, not threshold on
  white — the cats have cream chests and white paws.
- Cells are found by **connected-component labelling**, rows before columns.
  Column projection fails (a swept tail overlaps its neighbour's columns).
- The column grid is derived from **the rows that agree**, then every row is
  sliced by those boundaries. In the attack row the drawn katanas cross, so two
  figures touch and label as one blob — that corrupted `widest` and shrank the
  entire sheet by ~2× (this is why Frost was half Ember's size).
- **World size is normalised against `contentScale`**, so apparent character
  size can never again track how loosely a sheet packed.
- Billboard quads must be **square** (cells are square), with a **half-texel UV
  inset** plus transparent cell padding to stop atlas bleeding.

**Full-turn sheets are not mirrored.** Mirroring a half-turn flips asymmetric
details — Ember's tail and shoulder guard swap sides. `mirror: false`.

**Maths y maps to world −Z in the dojo** (`ZS` in `mathdojo.js`). The dojo camera
looks down +Z, so without the flip the y axis points *down* the screen and every
diagram is mirrored against her graph paper.

**CSS entrance animations freeze in the Claude Code browser pane.** The document
timeline may never start (`playState: "running"` but `currentTime: 0` forever).
Never use `animation-fill-mode` to hold an element visible — author the final
state as the default. This blanked the whole title screen once.

**A hidden preview pane is a MOMENT, not a session.** Screenshots fail with
"the Browser pane is not displayed, so the page is not compositing frames"
whenever the pane is collapsed — and that is the same condition that stops
`requestAnimationFrame`. But it changes: the pane can be hidden at boot and
shown ten minutes later. **Retry before concluding visual checks are
unavailable**, which is a mistake that has cost a whole session's worth of
eyeballing and sent the work down the numeric-only path unnecessarily.

**Injected DOM DOES recomposite once the pane is displayed.** An earlier note
here claimed otherwise, and it is wrong: a `position: fixed` div appended to
`body` from `javascript_tool` shows up in screenshots fine. This is the way to
inspect anything small — `computer{action: "zoom", region}` is not supported in
this pane and silently returns the whole frame instead, so blow the thing up
into a big canvas and screenshot that. Drawing the seven leader portraits into
a 100px strip across the top of the screen is how the portrait crop was checked
by eye.

---

## Layout

```
src/
  main.js               game loop, split-screen rendering, pause/restart, boot
  core/
    gfx.js              toon materials, outlines, Billboard (direction + rows)
    input.js            2 players, keyboard + gamepad, vJoy pad-splitting, remap
    spritesheet.js      generated sheet → clean game atlas (the tricky one)
    label.js            world-space text
  world/
    build.js            noise, islands, pagodas, torii, trees, geometry merging
    world.js            assembles world, height queries, ground detail, petals
  systems/
    mathdojo.js         the walkable unit circle
    minimap.js          canvas-2D archipelago map over the HUD (x2 when split)
    menunav.js          menus on a controller — cursor, confirm, back
    cutscene.js         the opening story, flown through the real world
    tournament.js       rounds, the ring-out rule, scoring — and `fighting`,
                        the ONE gate on player-vs-player damage
    arenaquest.js       how the tournament unlocks: the ladder to 80%
    announce.js         Mr Satan's pop-in card (never takes the input)
    leaderboard.js      localStorage board + the joystick name entry
  entities/
    shrine.js           the animated half of a clan shrine
    panda.js            the raisable, rideable Pandapaw panda
    leader.js           the six clan chiefs + Patchfur, and their bubbles
    satan.js            the champion — announcer, and the joke
    griffin.js          the scripted ride to the arena (NOT a mount)
tools/
  gamepad-dump.html     raw Gamepad API readout — open from disk, no server
  world-check.mjs       headless smoke test: node tools/world-check.mjs
  pad-check.mjs         controller compatibility: node tools/pad-check.mjs
                        (PS4 / Xbox / generic / two pads, vJoy as regression)
  entities/
    player.js           movement, slash, mounting, camera rig, anim state
    dragon.js           rideable storm dragon (perched + flying poses)
    orb.js              Kotodama Orb + pickups
    prop.js             knockable scenery
public/sprites/          EVERYTHING HERE SHIPS — Vite copies public/ into dist
  ember_grid_v2.png     LIVE — 10 directions x 4 poses
  frost_grid.png        LIVE — 8 directions x 4 poses (the OLDER sheet)
  dragon_sheet.png      LIVE — perched pose
  dragon_fly.png        LIVE — flight pose
  panda_cub.png         LIVE — single side-on cell, faces LEFT
  panda_adult.png       LIVE — single side-on cell, faces LEFT, saddled
  ryuuseki.png          LIVE — single side-on cell, faces LEFT
  leader_*.png          LIVE — 8 front-facing single cells, never mirrored
                               (thunderpaw riverclaw shadowtail windwhisker
                                icewhisker pandapaw elder satan)
  griffin.png           LIVE — single side-on cell, faces LEFT, saddled
  title_art.png         LIVE — title screen key art
docs/unused-art/         NOT SHIPPED — kept as reference, see its README
  frost_grid_v2.png     rows contradict each other, see above
  ember_grid.png        superseded by ember_grid_v2
  kitten_*_sheet.png    first-generation art, superseded
```

---

## Next steps Richard flagged

1. **Play the tournament with the girls.** It is verified and it has never been
   played. Difficulty is the only thing left to settle and no amount of
   headless checking touches it — see the three knobs under Open bugs.
2. Not built: **enemies** or combat against the world (still deliberate — the
   tournament is player-versus-player and fenced off inside one ring, which is
   a different thing from putting monsters on the islands); kitten
   customisation; towns on the outer islands; clan camp building.
3. Ideas that came out of building the clans and aren't built: clan-specific
   missions or rival mischief scores, a second material that resists dragons
   the way bamboo does, breath types that interact with specific props (frost
   freezing water, fire lighting lanterns).
4. **`PANDA_SPEED` was 10 and is now 2.** 10x looked right on paper and was
   unplayable: 105 units a second crosses the whole home island in under two
   seconds and arrives at the far rim before you have finished pushing the
   stick. The smoke test now bounds it at 1.5–3 so it can't creep back.

Run `node tools/world-check.mjs` after touching the world, dragons, clans or
sprite directions — it catches the silent breakages that still look fine on
screen, and it grew every time one of those bit us.

---

## It's hosted — katana-kitties.vercel.app

**https://katana-kitties.vercel.app**, public, no login. Static Vite build, no
backend, no database, no environment variables — Vercel runs `npm run build`
and serves `dist`. Redeploy with one command from the project root:

```bash
vercel --prod
```

**It is on the `dream-dojo` TEAM scope, not the personal account.** `--yes`
accepted the CLI's stored default scope. Nothing is wrong with it there and the
alias is the one we wanted, but `vercel` commands about this project need
`--scope dream-dojo` if the CLI's default ever changes. `.vercel/project.json`
holds the link and is gitignored.

**19MB OF DEAD SPRITE SHEETS ARE OUT OF `public/`, AND WHERE THEY WENT IS THE
POINT.** `ember_grid.png`, `frost_grid_v2.png` and the two `kitten_*_sheet.png`
are referenced only from comments, but `public/` is copied wholesale into
`dist`, so every player was downloading all four. They now live in
`docs/unused-art/` with a README explaining what each one is.

The first fix was a `.vercelignore` entry, and it would have quietly stopped
working the moment this project was connected to GitHub: **`.vercelignore` only
applies to CLI uploads.** A Git deployment clones the repo, so nothing in that
file is consulted and the exclusion evaporates without an error — the site just
gets 19MB heavier and nobody looks. Moving the files out of `public/` works for
both deploy paths, because Vite only ever copies `public/` into `dist`. If you
ever need to keep a big file in the repo and out of the game, that is the
mechanism — location, not an ignore list.

**A first load is 35MB across 39 files**, which is the price of AI-generated
sprite sheets at full resolution: `frost_grid` 6.1MB, `title_art` 5.5MB,
`ember_grid_v2` 5.2MB, `dragon_sheet` 4.5MB, `dragon_fly` 3.8MB. It caches, so
it's slow once. The obvious win if that ever matters is recompressing the PNGs
— they are flat-colour lineart on transparency, which quantises extremely well
— but it touches the art, and `loadSpriteAtlas` measures cells by
connected-component labelling on the alpha channel, so anything that softens
edges risks changing how a sheet slices. Verify with `node tools/world-check.mjs`
(the sprite-direction section reads the real files) before trusting it.

**The controller map does NOT follow you from localhost.** It lives in
`localStorage`, which is keyed by origin, so the hosted game starts from
`DEFAULT_VJOY_MAP` however carefully the local copy was calibrated. Everything
else about the input path is unchanged: Joy2Win and vJoy are local processes
and the browser reads the pad whatever page is open, so the Chrome axis bug
travels too and it is still Firefox. Gamepad API needs a secure context in
Chrome, which HTTPS satisfies.

## Where the code lives

**GitHub: https://github.com/InnerBushido/katana-kitties** (private).

The repo-local git identity is pinned to `InnerBushido <Innerbushido@gmail.com>`
on purpose, so a change to the global config can't attribute commits here to a
work account.

**Pushing goes through the `gh` CLI's credential helper, not GCM.** A headless
`git push` fails with "cannot prompt", and `credential.guiPrompt=true` no longer
rescues it: the agent shell sets `GCM_INTERACTIVE=never` and
`GIT_TERMINAL_PROMPT=0`, so Git Credential Manager refuses to open its window at
all. `gh` holds its own token in the keyring and never needs to prompt, so the
repo-local config now points github.com at it:

```
credential.https://github.com.helper = !"C:/Program Files/GitHub CLI/gh.exe" auth git-credential
```

That is set with `--local`, deliberately — the global config is left alone. A
plain `git push` works from a headless shell now. Two things that will look like
this broke: `gh auth status` reporting logged out (re-run `gh auth login`), and
the quoting — the path has a space in it, so setting this key from PowerShell
mangles it into `git: 'Files/GitHub' is not a git command`. Set it from bash.

`docs/screenshots/` holds the six README images. They were captured by rendering
the game to a canvas and POSTing the JPEG to a throwaway local HTTP server —
browser downloads don't reach disk from the preview pane, and piping ~25KB of
base64 per image back through the agent is wasteful. If you need new ones, that
trick is the way; remember `player.group.position` only follows
`player.position` inside `update()`, so staged shots need an explicit sync or
the kittens render at their old spot.
