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
  lightning, pollen, blossom). Four on the home island — one per player — so
  nobody is left on the ground watching.
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
- **Up to six rats, rabbits and birds on the tournament deck**, stunned by a
  swing and eaten by holding attack for two seconds. **Fifteen seconds between
  rounds** in which the kitten who won it — and is carrying the damage — hunts,
  while the kitten who lost it flies around as a translucent **angel cat** with
  wings and a DBZ halo. See Ring snacks and the feast below.
- Six biomes — meadow, bamboo, autumn, frost, ash, dusk — driving ground
  colour, foliage and detail scatter per island.
- Dynamic split-screen: **one pane per GROUP of kittens standing together**,
  with hysteresis — three in the market and one on another island is two panes,
  not four. Forced merged inside the dojo, in the ring and on a crewed Ryuuseki.
- Up to **two** minimaps, one per leading pane, rather than one per kitten.
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

## Player 2 gets a one-handed cluster, and the browser stops eating her keys

**Player 1 has always played one-handed and player 2 never could.** `WASD` with
`Q` `E` `F` around it is a left hand and nothing else; player 2 had the arrows —
a right-hand shape — with her buttons on the **numpad**, another hand's width to
the right and absent from half the machines in the house. The `, . / ;` run
added later is reachable, but only by taking your hand off the arrows.

So she has the same shape on her own side of the board:

```
   O K L ;    walk          (mirrors W A S D)
   P I J      mount, interact, attack   (mirrors Q E F, in that order)
   ' / RCtrl  jump          (mirrors Space)
   Right Alt  sprint        (mirrors Left Shift)
```

**Everything she already knew still works** — arrows, numpad and the punctuation
run are all still live. Three keys had to move, and each only because something
else claimed it:

| key | was | is | why |
| --- | --- | --- | --- |
| `;` | mount | **walk right** | it is the right-hand end of `O K L ;` |
| `/` | jump | **attack** | jump moved to `'`, so `/` took `.`'s old job |
| `.` | attack | **mount** | `;`'s old job had to go somewhere |
| `RCtrl` | sprint | **jump** | Richard asked for a jump key that isn't `'` |

which leaves `, . / '` reading interact, mount, attack, jump — one contiguous
run, in the same order relative to each other as before.

### `alt` is gone: every keyset field is a LIST

A keyset used to be one primary code per field plus a single `alt` object, which
is exactly enough to say "the numpad, or these four keys next to it" and **not
enough to say what she actually needs**: three ways to press attack and two ways
to walk. A one-deep alternate cannot express a second complete hand position. So
every field is an array and `on(field)` asks whether *any* of its codes is down.
Two call sites read it (`_readKeys` and `_joinKeyDown`) and both got shorter.

**No key may do two jobs, and `pad-check` is where that is enforced.** Every one
of the three moves above would have fired two actions on one press if the old
binding had been left behind — `;` moving both the kitten and mounting her, `/`
jumping *and* slashing. The check walks each set for a duplicate code, and walks
the two sets against each other so one press can never move both kittens. Enter
is the one deliberate overlap, because Enter is the JOIN key for both sets.

### The browser was eating her keys, and Firefox is the browser this is played in

`/` and `'` open **Quick Find**; a bare `Alt` focuses the **menu bar**. So player
2 mashing jump — which was `/` before this pass — popped up a search box that
took the keyboard away from the game. Richard turned it off in his own Firefox;
nobody else's copy of the game should need that.

`preventDefault` used to name Space and the arrows, and that was the whole list
because it was written before player 2 had any punctuation. It is **derived from
the bindings now** (`BOUND_KEYS`), so a key added to a keyset is protected by
having been added, and `F5` / `F12` / `Tab` — which the game binds nothing to —
are untouched. It is prevented on the **keydown**, which is what stops Firefox
acting on the Alt *keyup* as well.

**Held Ctrl or Meta is deliberately left alone.** `Ctrl+L` is the address bar and
`L` is now a movement key; a game that eats the browser's own chords is worse
than one that loses a keypress. It also means `AltGr` (which reports as
`ControlLeft`+`AltRight`) passes through on international layouts, where it is
somebody's typing key rather than a sprint button.

### Verifying a key binding needs a HELD key

Worth knowing before you try to test this from a script: the harness's synthetic
key press is a keydown and keyup with **nothing between them**, and the game
samples `input.keys` once per animation frame — so a press that starts and ends
inside one frame is never seen at all, and the binding looks broken when it is
fine. Dispatch the `keydown`, let a few frames run, then dispatch the `keyup`:
same listener, same code path, and it is what a hand actually does.

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

**Nor have the snacks or the feast**, and they are the newer half of it. Five
numbers to expect back, all checked so turning them fails loudly rather than
silently: `EAT_TIME` (2.0 — how long she is rooted, and the thing that makes
eating mid-round a gamble), `FEAST_TIME` (15), `REGEN_FRAC` (0.10), the
`heal` values (10/15/20) and `MOUTH_TIME` (5 — how long a bird waits).

**One round of feedback has already landed on these** and it is worth knowing
what it changed, because the first version was wrong in a way no check could
have caught: **the rat was uncatchable.** It was pin-only and it outruns the
grab radius, so the easiest animal — the one that teaches the mechanic — was
the one that never worked. The fix collapsed three catch verbs into one (a
swing stops anything), doubled the deck to six, made the mix random, and gave
the rabbit its speed and twice the hop height. `MAX_ON_STAGE`, `MAX_PER_SPECIES`
and the per-species `speed`/`hopV` are the knobs, all checked. The
open question that no check can answer is whether *carrying damage into the
next round* reads as fair to the girl who just won one: it is the right call on
paper and it is the one rule in the feature a nine-year-old could reasonably
call cheating. Watch that first.

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

`padMode` (Settings → Controllers) is `'split'` (default) | `'single'`, and it
touches **only** a vJoy device — see *Splitting is per device* above. A Pro
Controller or two individually-paired Joy-Cons are ordinary pads and get one
player each whatever it is set to.

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

### A CONTROLLER IS A CONTROLLER, and the vJoy phantom

**One player per connected pad, in connection order, and a Joy-Con is just a
pad.** Joy-Cons paired to the machine individually are ordinary gamepads and get
dealt like ordinary gamepads. `auto` splits nothing.

```
  0 pads   P1 WASD   P2 Arrows
  1 pad    P1 pad    P2 WASD    P3 Arrows
  2 pads   P1 pad    P2 pad     P3 WASD    P4 Arrows
  3 pads   P1 pad    P2 pad     P3 pad     P4 WASD
```

**THE SLOT-AFFINITY PASS IS GONE.** `_assign` gave slot `i` `KEYSETS[i]` when it
was free, which preserved what slot 1 got before four players existed and is the
wrong answer to the question a kid actually asks: one pad put player 2 on the
ARROW keys and pushed WASD down to player 3. The keyboard sets are a **queue**,
not player 2's and player 3's property — WASD with a space bar beats the arrows
with a numpad, so whoever is first out of the controllers gets WASD whatever her
slot number is. The cost is that one pad plus one keyboard moves player 2 from
the arrows onto WASD; that is a deliberate change to the two-player game and it
is the arrangement it improves.

**A vJOY DEVICE IS PRESENT WHETHER OR NOT ANYTHING IS FEEDING IT. THAT IS THE
PHANTOM, AND IT IS THE BUG THIS SECTION IS REALLY ABOUT.** vJoy is a
driver-level virtual joystick: once installed, Windows reports it to the browser
forever — with Joy2Win not running, with no Joy-Con paired, with no Nintendo
hardware in the building. The game saw a controller that was not there, gave it
player 1, and left a kid on the keyboard wondering why nothing moved. It looks
exactly like a connected controller that has stopped working, which is why it
is confusing rather than merely wrong.

**So a vJoy device must prove it is alive before it can take a seat, and ONLY a
vJoy device is asked** (`hasSentInput`). Every real pad is already hidden by the
browser until it sends input — by the time one appears in `getGamepads` somebody
has used it — so the gate is a no-op for real pads and would only be a source of
mid-session churn if the test ever misfired. vJoy is the one device that shows up
without anybody touching anything, so vJoy is the one device that has to answer
for itself.

**The test measures movement from the FIRST READING, not from zero.** `_watchAxes`
seeds min and max to whatever the axes said the first time it saw them, so a
phantom reporting the same constants forever has a range of exactly 0 on every
axis however odd those constants are. Against zero instead, the vJoy device's
resting state — three axes at `-1` — reads as "alive" on frame one, which is the
bug rather than the fix. There is a check for exactly that.

**`_watchAxes` now runs BEFORE `_syncBindings`.** The binder asks `hasSentInput`,
and that answer is built by the watcher, so binding first decided on evidence one
frame stale and left the pad asleep for a frame after the button that woke it.

**It is still LISTED in Settings, flagged `asleep`, not hidden.** Hiding it makes
"why can't the game see my Joy-Cons?" undebuggable from inside the game, which is
the whole job of that screen. The row says what to do instead of saying "unused".

#### SPLITTING IS PER DEVICE, NOT A MODE — and that took three goes

This was got wrong twice in opposite directions before the shape of the mistake
was visible, so the two dead ends are worth keeping:

1. **`auto` splits a vJoy pad whenever one is present.** Broke the case where
   somebody holds both halves themselves: one controller became two players who
   then both moved the same kitten.
2. **`auto` splits nothing; splitting is an explicit mode.** Broke the case that
   actually matters — two Joy-Cons through Joy2Win **plus** an ordinary pad.
   In `split` the pad looked disabled; in `auto` a Joy-Con looked disabled.

**Both are the same bug: the switch asked "do we split?" about THE MACHINE when
it is a question about ONE DEVICE.** No global answer can be right when the
machine holds a vJoy feed *and* a PS4 pad, because the two want opposite
answers. `_padDevices` now walks the connected pads and decides each on its own:
a vJoy device becomes two players, everything else becomes one, and they coexist.

**A vJOY DEVICE IS ALWAYS TWO PLAYERS, and that is not a guess.** It is not a
controller, it is a FEED — nothing has the vJoy driver installed and Joy2Win
running by accident, and the entire point of that stack is to present two
Joy-Cons as one device. Two is right in every case where somebody has actually
set it up. `padMode` survives only for the one person holding both halves
herself, and it is the only thing that setting touches now: `'split'` (default)
or `'single'`, with `'auto'`/`'separate'` accepted as the legacy spellings.

**THE HALVES EXPAND IN PLACE, IN CONNECTION ORDER.** The old split branch built
`[left, right, ...everything else]`, hoisting the Joy-Cons to players 1 and 2
however late they were plugged in and silently reordering everybody else. A pad
connected first keeps player 1 now, whatever kind of pad it is.

**Verified in the browser on the setup that prompted it:** vJoy woken by moving
axes (not a stuck button) plus a PS4 pad gives `P1 left Joy-Con | P2 right
Joy-Con | P3 gamepad`, and pushing each stick in turn moves exactly one kitten.

**THE OTHER PADS COME AFTER THE TWO HALVES INSTEAD OF BEING DROPPED.** The split
branch returned the two halves *and nothing else*, so a pad connected alongside
was not merely last in the queue — it **was not a device at all**, and no amount
of pressing START could seat anybody on it.

**`_padDevices` is one function because two copies of this rule is how the right
Joy-Con went dead in the first place.** `_syncBindings` decided whether to split
and `seatable` decided it again a hundred lines further down in the same words —
so the join screen could refuse a fourth player onto a device the binder had
already dealt. Same duplication `trackForIsland` and `_hudDuringScenes` exist to
prevent.

**NOT SPLITTING BROKE THE CALIBRATION SCREEN, and the proxy is why.** Both
`beginCapture` and the remap grid found the vJoy pad by asking *"which binding
holds `half`"* / *"does some pad hold two player slots"* — proxies for "is this
the vJoy device" that were only true while `auto` always split it. With the pad
seating one player and `half: null`, the lookup found nothing and the grid never
rendered: the entire Joy-Con remap screen went unreachable for the one device
that cannot be played without it. Both ask for the device **by name** now
(`profileNameFor(gp) === 'vjoyDual'`), which is the question they always meant.

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
    menagerie.js        the ring's rats, rabbits and birds — spawning AND
                        eating, because the two are one question
    announce.js         Mr Satan's pop-in card (never takes the input)
    leaderboard.js      localStorage board + the joystick name entry
  entities/
    critter.js          one animal on the deck: roam, flee, hop, fly, be eaten
    angel.js            wings + halo for the kitten who lost the round
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
  rat.png bird.png      LIVE — one side-on cell each, both face LEFT
  rabbit_run.png        LIVE — the rabbit ON THE GROUND, faces LEFT. This is
                        its `calm` pose and the one it uses most
  rabbit.png            LIVE — the rabbit MID-LEAP, faces LEFT. Its `air`
                        pose, and only used while it is off the ground
  rat_shock.png bird_shock.png
                        LIVE — the startled pose, both face LEFT
  rabbit_shock.png      LIVE — the startled pose, and it faces RIGHT.
                        `facesRight: true` in main.js. See the note above:
                        facing is declared per FILE, not per species
  angel_wings.png       LIVE — a symmetrical pair, front-on, empty in the
                        middle where a kitten stands. Never mirrored
  ember_eat.png frost_eat.png
                        LIVE — each kitten crouched over eating, front-facing
                        single cells, never mirrored. Generated against a
                        reference crop of that kitten's own idle cell
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
   headless checking touches it — see the knobs under Open bugs. The snacks and
   the feast are the newest part of it and the least play-tested; watch whether
   carrying damage into the next round reads as fair.
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
