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
  with any button, replayable from the pause menu. See The story below.
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

`systems/cutscene.js`. 11 beats, 79 seconds, any button skips, **WATCH THE
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
her stick. She is a turret. **A lone pilot still fires, but one beam**
(`SOLO_BEAMS` 1 vs `DUO_BEAMS` 7): a kid playing while her sister is off
cutting bamboo must not have summoned a legendary taxi.

**Anybody aboard forces ONE camera, outranking even "always split".** Two
half-screens of the same animal is the worst possible view of him — the flyer's
turns yank the gunner's screen around and the gunner cannot see what she is
aiming at. Same rule as the dojo.

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

**Three bugs the 60-unit dragon exposed, all worth knowing:**

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
minimap/Dojo overlap, the orb's jittering glyphs. Run the smoke test before
assuming otherwise:

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
    cutscene.js         the opening story, flown through the real world
  entities/
    shrine.js           the animated half of a clan shrine
    panda.js            the raisable, rideable Pandapaw panda
    leader.js           the six clan chiefs + Patchfur, and their bubbles
tools/
  gamepad-dump.html     raw Gamepad API readout — open from disk, no server
  world-check.mjs       headless smoke test: node tools/world-check.mjs
  entities/
    player.js           movement, slash, mounting, camera rig, anim state
    dragon.js           rideable storm dragon (perched + flying poses)
    orb.js              Kotodama Orb + pickups
    prop.js             knockable scenery
public/sprites/
  ember_grid_v2.png     LIVE — 10 directions x 4 poses
  frost_grid.png        LIVE — 8 directions x 4 poses (the OLDER sheet)
  frost_grid_v2.png     UNUSED — rows contradict each other, see above
  dragon_sheet.png      LIVE — perched pose
  dragon_fly.png        LIVE — flight pose
  panda_cub.png         LIVE — single side-on cell, faces LEFT
  panda_adult.png       LIVE — single side-on cell, faces LEFT, saddled
  leader_*.png          LIVE — 7 front-facing single cells, never mirrored
                               (thunderpaw riverclaw shadowtail windwhisker
                                icewhisker pandapaw elder)
  title_art.png         LIVE — title screen key art
  (kitten_*_sheet.png, ember_grid.png are superseded and unused)
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
