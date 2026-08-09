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

### THE ROOF AND THE WALLS COME OFF — this is the load-bearing part

**The first fix was lighting, and lighting was not the problem.** Measured from
inside: the interior really was 98.3% near-black, so brightening it was right —
but it changed nothing you could see, because **the camera was never in there**.
The follow camera sits about 19 units out and 18 up; the dome is 10.5 across.
Walking in put the kitten under an opaque grey lump and the player spent the
whole cave looking at a rock. You cannot light your way through a roof.

`buildGrotto` returns a `shellParts` list — the outer wall ring, the dome and
the ceiling — which the world merges into **its own mesh per grotto**
(`world.grottos`), hidden the moment somebody is inside. Collision is untouched:
the solids are still there, the maze still blocks, `LOCKS.cave.foot` still keeps
dragons out. It is purely what is drawn.

**THE WALLS HAD TO GO WITH THE ROOF, AND THAT TOOK TWO GOES.** Hiding only the
roof leaves the ring, which is 5 to 8.5 units tall at radius 10.5 — so the sight
line from the camera down to a kitten inside still crosses it. The slope of that
line is set by the pitch alone, and clearing the wall needs about **76 degrees**.
These characters are **billboards**: vertical quads that turn on Y only. At 76
degrees they are edge-on, and both kittens render as flat streaks on the floor —
verified in a screenshot, twice, at pitch 1.32 and again at the Dojo's own 1.16.
There is no pitch that both clears the wall and keeps a billboard readable, so
the wall is the thing that has to go. With the shell hidden the camera needs
almost no help at all: `CAVE_PITCH` is 0.82, barely steeper than normal.

The cost is that you can see the autumn forest through where the wall was, so it
reads as a rocky hollow rather than a sealed cave. Against "you see literally
nothing", that is not a close call.

**The interior walls stay ceiling-height on purpose.** With the roof off they
look like a canyon maze, and the honest reason to keep them tall is that their
solids have no `top` — they cannot be jumped at any height. A wall drawn low
enough to look hoppable and then refusing a triple jump is the exact "you can
see over it but not cross it" bug this codebase has been bitten by before.

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

**THE LAST BEAT SENDS THEM TO AN ARENA THAT DOES NOT EXIST YET.** Richard asked
for it to speak as though it is open, because it is the next thing being built
and the finale is the natural door into it. Until it ships this is a promise the
game has made out loud to a nine-year-old. If the arena slips, soften the line
back to "there is a ring being marked out" rather than leaving her looking for a
place she cannot find.

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

**The arena the finale sends them to does not exist.** The last beat now speaks
about it as a place that is open, at Richard's request, because it is the next
thing being built. Until it ships this is a promise the game has made out loud to
a nine-year-old — a different kind of TODO from the rest of this list. The line
to soften if it slips is `done4`.

**The grotto reads as a rocky hollow, not a sealed cave,** because the whole
shell is hidden while you are inside it (see above for why nothing less works).
If that ever matters, the fix is not to bring the wall back — it is to hide only
the wall segments between the camera and the player, which is a real piece of
work and was not worth it for two rooms.

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
  entities/
    shrine.js           the animated half of a clan shrine
    panda.js            the raisable, rideable Pandapaw panda
    leader.js           the six clan chiefs + Patchfur, and their bubbles
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
  leader_*.png          LIVE — 7 front-facing single cells, never mirrored
                               (thunderpaw riverclaw shadowtail windwhisker
                                icewhisker pandapaw elder)
  title_art.png         LIVE — title screen key art
docs/unused-art/         NOT SHIPPED — kept as reference, see its README
  frost_grid_v2.png     rows contradict each other, see above
  ember_grid.png        superseded by ember_grid_v2
  kitten_*_sheet.png    first-generation art, superseded
```

---

## Next steps Richard flagged

1. **Play it with the girls.** Everything on the last bug list is fixed; their
   feedback beats any spec from here.
2. Not built: enemies or combat (deliberately — the slash exists to knock
   scenery over, and that's where the fun is at this size); kitten
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
