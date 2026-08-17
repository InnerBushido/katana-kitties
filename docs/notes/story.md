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
