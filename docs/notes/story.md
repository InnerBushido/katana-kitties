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

## The ending is a shot list — `FINALE_SHOTS`

> Let's have the camera zoom in on a few areas on the map where the action of
> the mischief will happen... Would be good to zoom in on the actual Bridge in
> the main level during the dialogue when we mention about a bridge. Can have
> camera zoom in on the Dojo of the Turning Circle when talking about some of
> the math concepts.

The ending used to be **one continuous pull-back**: open low behind Patchfur,
climb and widen for thirty seconds, finish on the archipelago. It is five shots
now, one table in [summonscene.js](../../src/systems/summonscene.js):

| line | shot | what is in frame |
| --- | --- | --- |
| 1 | `mischief`, close | down among the wreckage, with her in front of it |
| 2 | `mischief`, high | the same heap from forty-six units up, as it stands itself back up |
| 3 | `dojo` | the Dojo of the Turning Circle, under the line about the maths |
| 3 | `bridge` | and then the bridge itself, from the deck's own height |
| 4 | `wide` | the whole archipelago, her back in front of it |

Each row is `{ beat, from, at, a, dist, high, turn, in, stage }`. `beat` is
which line it belongs to and `from` is how far through that line it cuts — so a
line can carry **two** shots, which is how beat 3 gets both of the places that
were asked for by name inside one seven-second sentence. `in` is the push: the
camera closes that fraction of its own distance across the shot's own clock,
which is why `_shotFor` returns a shot-local `s` rather than the beat's `k`. A
cut that landed on a camera already halfway through somebody else's easing reads
as a jump rather than as a cut.

**Nothing in the table is a coordinate.** `_markFinale` resolves the four names
once, at the top of the scene: `dojo` and `bridge` come from `world.dojoCentre`
and `world.bridge`, both published by the world off the same numbers those
things are *built* from, and `wide` is the focus point the scene was started on.
A camera aimed at a bridge that has since been moved is a shot of an empty road,
and it is exactly the kind of thing nobody notices until a nine-year-old watches
the ending.

**`mischief` is measured, not guessed at.** `_heap()` walks every knocked-over,
un-retired prop against every other one and returns the centre of the tightest
knot of them — O(n²) over a couple of hundred things, once, on the frame a
half-minute scene opens. The cheap version is "point at the town centre", and it
is wrong in the one case that matters: at 100% mischief the deepest heap might
be the bamboo grove, over a line that says *every last cane of bamboo*.

**And every name falls back to the wide shot.** A scene built with no world —
which is exactly how `world-check` builds one, and what the scene viewer opens
on a fresh save — still plays, framed on the archipelago, rather than aiming a
camera at `NaN` and drawing the inside of somebody's head. `_heap()` returns
`null` rather than a number when there are fewer than three things down.

### She walks off for the shots that are about somewhere

A nine-unit cut-out parked in front of a close shot of a bridge **is** the
bridge. So `stage` is a column in the table, `_parkStage` eases `stageOn` toward
`stageWant` over `STAGE_SWAP` 0.75s, and her opacity and her parked position
both ride that one scalar: she slides out to `STAGE_FROM` and fades as she goes,
rather than blinking out. She is on for the first line and the last — the two
that are about *them* — and off for the three in the middle, which are about
places.

`finish()` puts `stageOn` and `stageWant` back to 1, because every other scene
in the game leaves them alone: a finale that ended on a shot she was not in
would otherwise hand the next scene a speaker already off the side of the frame.

### ...and the wave follows the camera

> We should just have the camera zoom in on a few areas where there are some
> mischief, and then can just animate mainly the mischief that is in the view of
> the camera, or the main ones being focused on.

`FinaleTide.focusOn(at)` re-deals `phase` by distance from a point, and `_next()`
calls it on every beat with wherever that beat's first shot is pointing. The
ripple therefore *starts* in frame and spreads outward from it.

**Nothing is skipped and nothing is culled**, which is the important half. The
obvious implementation — move only what is on screen — would leave the far
islands standing tidy at the end of a scene whose whole argument is that they do
not stay that way, and the last beat's fall is a **restoration** that can only
put back what it stood up. `focusOn` changes the ORDER and only the order;
`world-check` runs the whole wave through and asserts every held prop, in shot
or not, still ends up on its home transform.

**It refuses mid-move.** `k` is one scalar for the whole world and `phase` is
where each prop sits inside it, so re-sorting halfway through the rise would
teleport two hundred objects on a single frame. A cut that lands inside a beat
keeps the order that beat started with — which is right, because the wave it is
in the middle of is the one the previous shot began.

## The world behind her — `src/systems/finaletide.js`

> The cutscene is a little boring currently. Is there a way we can add more
> character to Patchfur for the ending? Maybe use Bugenhagen from FF7 and his
> lesson on cosmology as inspiration.

Bugenhagen's planetarium is not a slideshow. He turns the lights off and the
**thing he is describing appears around you**, and the lesson lands because you
are looking at the argument while he makes it.

The first answer to that was a diagram: four white line figures drawn behind
her, a scatter, a lattice, a unit circle and a chord, one per beat. It was
correct and it was the wrong idea, for a reason worth writing down — this game
already has two maths lessons, the Kotodama Orb and the Dojo of the Turning
Circle, and both of them are things you can **walk into**. A third one, drawn
flat on a quad and unable to be touched, is the decorative version of the two
good ones standing next to it.

And it was drawing a picture of a thing that was standing right there. Richard's
note settled it: the ending's idea is **entropy**, and entropy in this game is
not an abstraction. It is a couple of hundred specific objects that two girls
spent an afternoon putting their paws through, and every one of them is on
screen behind her while she talks about them.

So the picture behind her is the world, and it moves.

| beat | the line | the world |
| --- | --- | --- |
| 1 | "Every barrel. Every lantern. Every last cane of bamboo." | the archipelago exactly as they left it — on its side |
| 2 | "A tidy town is only one way for a town to be." | every last one of them **stands back up**, from the far island inwards |
| 3 | the bridge line | it holds. One tidy arrangement, the only one there is. |
| 4 | "The arena is open." | and it all goes over again, landing on exactly the pose it was in |

That is the second law acted out by the set, in a scene where the set is the
thing the kid built. The tidy arrangement is one; the untidy ones are all the
rest; it does not stay tidy; and she is standing in front of the evidence.

### ...and it is why the Kotodama woke up

The same idea gave the orbs a reason to exist, which they did not have before.

Knocking the world over did not just make a number go up. Mischief — entropy —
was the potential sitting dormant inside every standing object in the universe,
and creating disorder on that scale **let it out**. The Kotodama are what it
looks like once it is out: the magical abilities of the world, unlocked by two
children being a menace to some furniture.

`entities/clanpower.js` is that sentence with a cooldown on it. 盗 **Steal
Mischief** knocks a Kotodama off another kitten in the ring — and it can,
because an orb *is* mischief made solid, and mischief can be knocked loose the
same way a barrel can. It is the story and the mechanic saying the same thing,
which is the only kind of lore this project keeps.
→ [endgame.md](endgame.md)

### Nothing regrows, and this does not break that

The fourth non-negotiable is that a prop knocked over **stays** knocked over, so
the MISCHIEF counter is honest — and here is a scene that stands the entire
world back up in front of the player. The line that makes it legal:

> It may move meshes and it may never touch a fact, and whatever it moves, it
> puts back.

`FinaleTide` never writes `knocked`, `scored`, `gone` or `mischiefTotal`. It
snapshots every fallen prop's transform on `start()`, and `finish()` restores
that snapshot — **restores it, rather than running the wave back down to zero**,
because floating point and a skipped scene both make "back to zero"
approximately right, and approximately right is a town that ends the afternoon a
few degrees tidier than the kid left it.

`finish()` is also the *skip* path, which is the one that actually matters. A
nine-year-old who has seen the ending once presses Escape four seconds in, and
what she gets back has to be her wrecked town, on its side, to the last decimal.
`world-check` asserts precisely that, plus the three flags and the count, plus
that a retired prop — one that fell off the edge of the world and is hidden for
ever on purpose — is never stood back up. "The ending tidied my world up" would
be the single worst bug this game could ship, and the scene that could produce
it is the one everybody watches.

### `Prop.held`, the one flag that keeps the two of them apart

A settled prop is not asleep. Its own `update` lerps it flat every frame — that
is what makes it *lie* there instead of standing on one end — so the rewind and
the prop would fight for the whole scene, and the prop would win about half the
frames. `held` is set by the tide, cleared by the tide, and read in exactly one
place in `prop.js`. It is not an optimisation and it must not be reused as one.

### The wave, and why it is not a snap

Two hundred objects standing upright on the same frame reads as a **rendering
glitch**. A ripple crossing the archipelago reads as a town tidying itself, and
the eye follows it. `STAGGER` 0.45 spreads the props over the first 45% of the
move, leaving every individual prop more than half the move to itself. The order
is world order to begin with — the order they were planted, island by island —
and is then re-dealt on every cut by `focusOn`, so the ripple starts wherever
the camera is pointing (above).

Standing up takes `RISE` 6 seconds; going over takes `FALL` 4.2, because going
over always does. Patchfur's lines run 7.5–9 seconds each, so the wave is still
travelling while she is still talking: the picture sits *under* the line rather
than punctuating it, the same rule her gestures follow below. Three seconds was
tried and reads as a cut.

**The last beat is derived, not typed.** `setBeat` is handed the script's own
length, so a line added to the ending cannot leave the archipelago standing
tidily at the end of a scene whose entire argument is that it does not stay
that way.

### It is the ordinary render, and it costs nothing

The diagram this replaced was 432 vertices rewritten in place every frame, with
a paragraph in [performance.md](performance.md) justifying the buffer. The tide
allocates nothing and draws nothing: the props are already in the scene, already
batched, already being drawn. It writes two transforms per fallen prop per
frame and stops existing the moment the scene ends.

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
