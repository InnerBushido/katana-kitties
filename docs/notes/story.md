# The story: leaders, cutscene and the shrine scenes

*Design notes, moved verbatim out of the old 4,400-line `HANDOFF.md`. This is
the WHY behind code that already exists — read it when you are about to change
something in this area, not before. Current state and open work live in
[HANDOFF.md](../../HANDOFF.md); the always-on summary is [CLAUDE.md](../../CLAUDE.md).*

*Cross-references saying "above" or "below" may now point at a sibling file in
this folder — see [the index](README.md).*

---

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

---

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

---

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

## The shrine scene is a two-shot

It had one person in it for a long time and nobody noticed, because the person
it had was the one talking. The camera sat **on** the axis between the leader
and the kitten — behind the kitten, looking past her — so the kitten was
directly under the lens: a blob at the bottom of the frame with the dialogue
box drawn over her, while a grown-up cat talked earnestly at a camera with
nobody in front of it.

Reported as *"have the Clan Leader facing the player, but also facing towards
the camera so they do not look like a 2D thin paper, and the player should be
facing the Clan Leader when they are talking."* Two changes, and they only work
together.

**The kitten is stood on a mark.** She stopped wherever she stopped — behind
the leader, off the edge of the stone, at the far rim of a ten-unit radius with
her back turned — and no camera rule can make a composition out of an arbitrary
arrangement of two bodies. `_stand` puts her `TALK_GAP` in front of the leader
on the leader's own axis, facing her, and everything after that is a **fixed
shot of a known pair**. The move is hidden by the half second of black the
scene opens on, and she is left there when it ends: putting her back would be a
second teleport out of a fade she *can* see, and the mark is the middle of the
dais she was walking onto anyway, with the join ring under her feet.

**Not while she is riding something.** Nothing is ticked during a scene, so
moving a rider leaves the animal behind and sits her on thin air. `watch` never
fires for a mounted kitten; the debug key does, and the shot degrades to
framing her where she really is rather than breaking.

**Setting `position` was not enough, and the failure was instructive.**
`position` is where she IS; `group.position` is where she is DRAWN, and the
thing that copies one to the other is `Player.update` — which is exactly what a
scene does not run. The first version moved her logically and left the drawing
standing wherever the dwell had expired, so the new camera framed a beautifully
composed empty patch of dais. `camTarget` goes with it too, or the play camera
whips across the island the moment the scene hands control back.

**The camera swings off the axis.** About 66°, which is what puts both bodies
across the frame instead of one behind the other. The leader keeps the
turn-toward-you she always had — a bias on top of the billboard's camera-facing
turn, capped at `FACE_BIAS_MAX` because past about a quarter turn there is no
drawing for where she is looking and a billboard yawed that far shows its own
edge. **That cap is the "thin paper" half of the report and it was already
there**; what was missing was a shot from which you could see her turn at all.

**The heights are the other half, and they are not in this file.** Both of them
stand on the dais now, because every step of it is a walkable disc platform —
see [world.md](world.md). Before that the leader was lifted onto the stone by a
special case and the player was not, so a two-shot would have been a grown-up
on a plinth talking down to a kitten buried to the ears.

### Which way it swings is scored, not picked

A shrine is a gate, and its two pillars stand at a fixed offset along **world
x** whatever direction the leader faces. So which of the six shrines happens to
put seven units of stone through somebody's face is an accident of where that
island's centre is — Shadowtail drew one straight down the kitten and
Thunderpaw did not, from identical code. And Pandapaw's shrine is in a bamboo
*forest*, where the same accident is eight metres of cane.

There is no framing rule that fixes that, because there is nothing about the
pair of them to fix. The answer is to stand somewhere else. `_pickSwing` builds
four candidate cameras (the shot, its mirror, and a tighter pair), projects both
characters and every tall thing nearby from each, and takes the widest closest
approach **on screen** — an angular gap, minus the obstacle's own half-width as
an angle, because a post two units from the lens hides far more of the frame
than the same post ten units away.

Two things are deliberately *not* counted. Something **behind** a character is
scenery: that is a gate they are standing in front of, which is the picture the
shrine was built for. And a prop somebody has already knocked over is lying on
the stone with the lens looking straight over it — without that, the shot would
flinch at every barrel either girl has ever hit.

Five of the six shrines keep the shot they were framed with. The sixth moves,
which is the entire reason the function exists.

**The threshold was 0.16 radians for one commit, and that was wrong.** Measured
at a shrine, the whole spread between the best and worst candidate is about
five degrees — so a nine-degree tax pinned every shrine to the default and the
function may as well not have been written. It is 0.012 now: enough to resolve
two candidates that are the same shot to the pixel, nowhere near enough to hold
the camera on a post.

### ...and the caption comes off the screen with the HUD

`[E] SWEAR TO RUN WITH THUNDERPAW` hung across the top of the whole cutscene.
`_updateClanPrompt` already refuses to draw it while a scene owns the screen —
and, exactly like `_paintPaneEdges` before it, runs at the END of `_tickBody`,
which every scene block returns before reaching. **A rule that has to be re-run
to take effect cannot be the rule for a case where nothing runs**, so the
clearing moved into `_hudDuringScenes` with the HUD, the pane frames and the
pane cards.

It had never shown before, because until the scene started standing the kitten
ON the dais she was never inside a clan ring while a scene was up.

## Patchfur is on screen at the ending

Reported as *"Patchfur's sprite is not appearing in the final cutscene but you
hear her voice"*, and it was not a missing sheet or a failed load. The finale is
a `SummonScene`, and that class was written to show the **world** with the
speaker in the little portrait box; the opening cutscene's stage character was
simply never built for it. Four beats of a disembodied voice over an empty sky
is the one place in the game where a kid could reasonably think something was
broken.

She stands on one quad in a group of its own, parked in front of the camera
every frame — the same grammar `Cutscene._setStage` uses, and deliberately the
same *single* quad rather than one billboard per speaker, because only one
thing is ever on this stage. It is added to the **game's** scene, because
`_renderView(summonScene.camera)` is what draws it; a `SummonScene` built
without one is a scene where every other check passes and nothing is on screen.

**The portrait and the stage are two decisions, not one flag.** Mr Satan keeps
the box and only the box: his shots frame the town and then the arena — the
places he is selling — and a flat drawing of him standing in front of them for
three beats is furniture. `found` and `summon` show nobody either; they frame a
place and a dragon, and the speaker is genuinely elsewhere. Patchfur's four
beats are her talking to two kittens about what they did, with the wide shot
behind her as the subject of the sentence rather than a thing being pointed at.

**The framing is derived from the lens, not copied from the intro.** The
opening cutscene composes its speaker 17 units in front of a 42° camera, 3.4
right of centre and 5.2 down. The offsets are what the picture *is* and they are
carried over unchanged — but 17 is not, because this scene's lens is 54° and
the same distance frames a box a third bigger: she came out at 52% of the
frame's height instead of 69%, which reads as a figure standing on the horizon
rather than as the person talking to you. So the invariant is the **frame**:
the intro composes against a box 13.05 world units tall, and `_parkStage` solves
for whatever distance gives this camera the same one. Neither lens can be
touched without the framing following it.

**She arrives once, not four times.** `t` is beat-local and resets on every
line; the opening cutscene slides its speaker in off that, which is right when
every beat is a different character walking on. Four beats of the same calico
sliding in from the right reads as a stutter, so the slide runs off a separate
scene clock.

### ...and she was quietly foreshortening for the whole ending

Found while staging the rest of this scene, and wrong since the day it was
written. `SummonScene.faceCamera()` is a **no-op** — the method exists, the game
calls it, and it does nothing — so the stage quad kept whatever orientation it
was built with while the finale's camera climbs and turns most of a quadrant
across four beats. She was never edge-on enough to look broken. She just got
narrower every beat, which is exactly why four people watched the ending and
nobody said anything.

`_parkStage` now copies the camera's quaternion onto the stage, after
`camera.updateMatrixWorld(true)` and in the same solve that positions it.
`world-check` asks it as *"the quad's normal points back down the barrel"* at
two points in the shot twenty seconds apart, plus a third check that the camera
really moved in between — because without that last one the pair is two readings
of the same camera, which a nailed-down quad also passes.

## The lesson behind her — `src/systems/finalelesson.js`

> The cutscene is a little boring currently. Is there a way we can add more
> character to Patchfur for the ending? Maybe use Bugenhagen from FF7 and his
> lesson on cosmology as inspiration.

Bugenhagen's planetarium is not a slideshow. He turns the lights off and the
**thing he is describing appears around you**, and the lesson lands because you
are looking at the argument while he makes it. So: four figures drawn behind
her, one per beat, each one illustrating the line she is actually saying.

**It draws the script she already has.** Deliberately — the recording and the
words are untouched, so this cost nothing to try and would cost nothing to
undo, and every figure is anchored to words she is already speaking:

| beat | the line | the figure |
| --- | --- | --- |
| 1 | "Every barrel. Every lantern. Every last cane of bamboo." | one stroke per knockable thing in the world, scattered |
| 2 | "A tidy town is only one way for a town to be." | the same strokes snap into a lattice |
| 3 | "An angle, a circle, and the nerve to jump — that is all a bridge has ever been." | the unit circle, and the chord it subtends |
| 4 | "The arena is open." | the circle tightens into the ring |

**The mark count is the world's own count.** `mischiefTotal` — the number the
MISCHIEF counter has been counting all afternoon — is how many strokes are on
screen, so the first beat is literally her naming the things they knocked over
and the things they knocked over being on screen.

### The bridge IS the chord

This is the beat that has to earn non-negotiable 1, and the test it has to pass
is the one the Kotodama Orb passes: **every position on screen is computed from
the two numbers printed beside it.** A figure that drew a handsome circle and
printed an unrelated angle would be the decorative version, and the decorative
version is worse than no figure at all.

So the radius arm ends at `(cos θ, sin θ)`. The cosine leg runs the axis out to
`cos θ` and the sine leg **stands on the end of that same leg** and reaches the
point, which is the right triangle drawn rather than asserted. The two islands
are not placed anywhere — they are put on the two ends of the chord, which is
where the circle already put them. And the span between them is drawn at
`Math.hypot(cos θ - 1, sin θ)` while the caption under it reads

    the bridge is 1.41 wide

which is `2·sin(θ/2)`. Those are the same number by identity, and that identity
is the whole reason the beat is worth having — so `world-check` measures the
drawn quad's scale, computes the printed number independently, and asserts they
agree to a millionth rather than asserting that both exist.

**The sweep stops at three quarters of a turn.** A closed circle puts the far
island back on top of the near one, so the bridge would vanish on the exact line
about crossing it.

**The span is a quad and not a line, and that is WebGL rather than taste.**
`LineBasicMaterial.linewidth` is ignored by every desktop WebGL implementation,
so every line in this figure is one pixel wide whatever it asks for. The chord
is the thing the beat is about and one pale pixel is not it — so it is a
unit-long plane along +X, then positioned, turned and scaled to the chord it is
drawing. The geometry is still the maths; it is just thick enough to see.

### Four figures, one buffer

216 strokes is 432 vertices in a single `LineSegments`, rewritten in place every
frame — one draw call, one buffer, no allocation. The alternative is 216
objects, and the reason that matters is [performance.md](performance.md): this
scene runs on a phone with the whole archipelago in shot.

**A stroke takes the short way round to its next heading.** Lerping raw angles
sends a mark at 350° all the way back through 180 to reach 10, so about a third
of them spin the wrong way across every change of figure — visible, and exactly
the kind of thing that reads as a physics bug rather than as arithmetic.
`atan2(sin(da), cos(da))` picks the short arc, and `world-check` watches every
mark's heading frame by frame through a morph and fails if any of them ever
moves further in one frame than the morph could justify.

**The scatter is hashed, not random.** The Help clips are filmed out of the
running game with interframe differencing, so a figure that landed somewhere new
on every play could never be filmed — and, less exotically, a scene the kids
watch twice should be the same scene twice.

### The lattice came out as a barcode, and the reason is arithmetic

216 marks is a 15×15 grid, so its rows are 0.123 apart in figure units — and a
stroke drawn 0.075 each way is 0.150 tall, taller than the gap. Every column
fused into one continuous vertical line and the tidy town read as a barcode.

The fix is not a smaller number typed into the table. The constraint is a
statement about the **count**, and the count is the world's, so it is derived:
the lattice's stroke is capped at two fifths of its own row spacing, which
leaves three fifths of the gap showing whether the world has 64 knockable things
or 400. `world-check` checks it at both ends of that range rather than at the
216 that happen to exist today.

### It is depth-tested, which is the opposite of everything else parked here

Every other thing this game parks in front of a lens turns depth testing **off**,
because it is drawn over a world it is not part of. Doing that here draws the
diagram over Patchfur, who is the person the scene is about.

One flag settles both ends of it. She is parked at 12.8 units and writes depth;
the figure sits at 20.7 and the archipelago is two hundred further back — so
`depthTest: true` means **she occludes the figure and the figure occludes
nothing**. `depthWrite` stays off, or the transparent lines hide each other.

**Culling is off only on the buffers that get rewritten.** Not on the whole
group — three.js culls against `matrixWorld`, so a static quad on a moving
parent is culled correctly and the labels are fine as they are. The ones that
are not fine are the geometries whose vertices move: a bounding sphere is
computed once, on the first render, and never again, so 216 strokes that started
as a scatter and became a circle are being tested against the shape they had
four beats ago.

### Her acting, with one drawing

There is exactly one Patchfur — `leader_elder.png`, a single front-facing cell —
and there is no second pose without generating art. So the performance is done
with the quad she has: a lean, a step toward the lens, a settle. One
`{ lean, push }` per beat, eased in over the beat's own clock at `ACT_IN` 1.8s,
so the gesture arrives *under* the line rather than punctuating its first
syllable.

**It is anchored to the lines, not distributed for variety.** She leans in on the
beat where she is telling them what they actually did, draws back and opens out
on the beat where the world appears behind her, and comes forward on the last
one, where she is sending them somewhere. A performance that moved on a timer
would be a fidget.

**The numbers are small on purpose.** `lean` is radians of roll and `push` is a
fraction of her own height; a flat drawing rolled far enough to notice as a MOVE
reads as the drawing being wrong rather than as a person moving — the same
argument `FACE_BIAS_MAX` makes about the clan leaders. `world-check` pins one
pose per line, none of them past 0.08 rad or 0.2 of her height, and at least one
of them non-zero, so a table of zeroes is not a passing table.

**The push is applied to the parked distance, not to `scale`.** Moving her
toward the lens is a step forward; scaling her up is a drawing getting bigger.
The two look different and only one of them reads as a person.
