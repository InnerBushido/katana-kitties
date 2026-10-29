# Sound and music

*Design notes, moved verbatim out of the old 4,400-line `HANDOFF.md`. This is
the WHY behind code that already exists — read it when you are about to change
something in this area, not before. Current state and open work live in
[HANDOFF.md](../../HANDOFF.md); the always-on summary is [CLAUDE.md](../../CLAUDE.md).*

*Cross-references saying "above" or "below" may now point at a sibling file in
this folder — see [the index](README.md).*

---

## Sound

*Since Oct 2026 the rule is "procedural by default, generated where it is
better and affordable" — see [Shadow Lionheart's recordings](#shadow-lionhearts-recordings)
at the bottom. What follows is still how every procedural piece works.*

Every sound *except the voice lines and Shadow Lionheart's boss music* is **synthesised at
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

### The ending's gates and islands — a run, not a rattle

> "a sound played for each one, but don't make it too annoying since there will
> be several sound effects playing quickly."

Five gates start inside 0.5 s and five islands inside 5 s, so the problem is
the pile-up and not any one sound. Two decisions deal with it:

- **`gateform` is one note of a run.** `play(name, vol, k)` takes a step, and
  step `k` is degree `k` of a major pentatonic, rising an octave every five.
  Five gates heard in order are one harp sweep, and a pentatonic cannot clash
  with itself, however they overlap. Under the note is a soft noise sweep
  (600→2200 Hz) for the cloud.
- **`islerise` is slow.** Lowpassed noise swells 140→520 Hz over 1.3 s, and two
  low bells a fifth apart come in at 0.9 s, when the island is well under way.
  It is a swell, so a second one arriving under the first thickens it rather
  than restarting it.

Levels were measured by rendering, as RMS of the loudest 400 ms window at
default volume. The voice line is 0.153 (whole clip). One gate is 0.044 and one
island 0.068. Seven gates at 0.8 were 0.099 and four islands 0.122, which is too
close to the voice. So `SFX_GATE` is 0.5 and `SFX_ISLE` 0.4 (`summonscene.js`),
which gives roughly 0.06 per run, about 8 dB under the voice. The 0.06 is by
arithmetic from the single-sound renders, not re-rendered. world-check pins
both levels below the voice's.

---

## A piece of music per island, and one per dragon

All still synthesised — see Sound below for the engine. `MUSIC` in `audio.js`
holds every piece; `ISLAND_MUSIC` maps biome → piece and `trackForIsland()`
resolves it. The table is the places you can stand and the things you can be
carried by; the opening cutscene's `intro` and the ending's three acts are in
[story.md](story.md).

| where | piece | what makes it that place |
| --- | --- | --- |
| home | `play` | **unchanged, note for note** |
| autumn | `autumn` | yo scale (no semitones), down a fourth to A |
| frost | `frost` | kumoi, high, 80% rests, a bell over every note |
| bamboo | `bamboo` | hirajoshi, fastest island, taiko, busiest |
| ash | `ash` | iwato — the darkest of the five — low, drone-heavy |
| dusk | `dusk` | insen with fifths: the island the story points at |
| Dojo | `dojo` | the sparsest thing in the game, deliberately |
| the arena | `arena` | a matsuri: home's scale, up a fifth, twice the tempo. From the league picker on |
| the arena island, no match | `saucer` | an original funfair march in the arena's key — see world.md |
| any road | `snake` | |
| the arena road | `satan` | an original kung-fu disco song, **authored note by note**; `satanStrut` is the old one, kept |
| storm dragon | `flight` | **the only piece with a bassline** |
| Ryuuseki | `ryu` | unchanged |
| the griffin, outbound | `griffin` | the arena's key, arriving — see below |

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

## The griffin ride was silent, and it was not a missing tune

> Have music playing when riding the griffin to the arena. If we don't have
> music that matches it, then let's generate some new music to get players
> excited to fight in the arena.

**THE CAUSE WAS A MISSING CALL.** `Game._updateMusic` is the single authority on
what is playing and it is the LAST thing in `_updatePlay`; the griffin ride is a
branch that `return`s. So for the whole eight seconds the one function allowed
to decide anything never ran, and whatever had been playing when Mr. Satan
finished talking simply carried on. That is the ending's bug one branch along —
the same shape, found the same way, and the fix is the same one line in the
branch. It is asserted as an *order* (`_arrive()` then `_updateMusic(dt)`),
because `_arrive` is what clears `travel`: ask before it and the frame they land
on plays one more frame of the ride.

**NEITHER PIECE THAT COULD HAVE BEEN REACHED WAS RIGHT.** `flight` is the storm
dragon's, and the island theme underneath is a question about where somebody is
standing — asked of a kitten who is cargo on an animal crossing four islands, it
changes key under itself.

**SO `griffin` IS THE ARENA'S OWN KEY AND SCALE** — hirajoshi at F, the two
numbers `arena` uses — and the point of that is the landing: the griffin puts
them down and the festival carries on without a key change. `finaleOpen` makes
the same move from much further off, for the same reason.

**WHAT MAKES IT THE JOURNEY AND NOT THE DESTINATION** is a `snare`, which the
arena theme has never had and is the one thing in this synth that says *moving*,
and a step slower (0.36 against 0.32) so that arriving is a step up rather than
sideways. Its `rest` is 0.44, the lowest in the game: excitement here is notes
per second, since the mix is one bus and shouting at it is not available.
No `bass` — the storm dragon keeps the only bassline.

**THE WAY HOME IS NOT THE WAY OUT.** `'out'` gets `griffin` and `'home'` gets
`flight`, which is what every other ride in the game plays. An arena fanfare
over somebody being carried *away* from the arena is the game not knowing which
way round it is.

Measured in the running game rather than reasoned about: with `travel` set,
`Audio.mode` really does become `griffin` outbound and `flight` homebound, and
falls back to the island theme when the ride ends.

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

## Shadow Lionheart's recordings

**The rule changed.** Richard, Oct 2026: "not everything needs to be procedural! ... if we can get better quality not doing something procedurally, such as, having high quality generated voices and music, then we will choose the higher quality route where possible and affordable". Non-negotiable 9 now
reads *procedural by default; generated where it is better and affordable*, and
every file must degrade to the procedural thing.

**What he asked for, and where it went:**

| level | his fight plays | file | in Kata Trace |
| --- | --- | --- | --- |
| EASY | `MUSIC.shadow`, the procedural theme | none | open from the start |
| MEDIUM | **Requiem** (Orchestral 1) | `public/music/shadowOrch.mp3` | opens when she beats him on MEDIUM |
| HARD | **Darksynth** (Electronic 1) | `shadowSynth.mp3` | ...on HARD |
| 秘 EXTRA HARD | **Nightmare** (Electronic 2) | `shadowNight.mp3` | ...on EXTRA HARD, with the long cut |

`SHADOW_TRACK` (beatmap.js) is that table; `_wantedTrack` reads it. Orchestral 2
was generated and not chosen; it stays in `tools/capture/music-takes/raw/`.

**How they were made.** ElevenLabs Music v2.5 (`eleven_music_v2_5`, a node in
Richard's own ElevenLabs connector — Higgsfield's `generate_audio` is speech
only and says standalone music is not supported). Four 56-second takes at ~900
credits each. The prompts asked for the theme's own facts: 136 BPM, strict 4/4,
D harmonic minor, the Dm–Bb–Gm–A loop, and the Latin (UMBRA LEONIS, GLADIUS
NOCTIS, SURGE, PUGNA, HONOR). Generation ids are in `musicfiles.js` (`gen`).

**They are not the theme re-orchestrated, and cannot be from a prompt.** The
takes keep the tempo and the mood and ignore the chord loop: a bass-root-per-
beat reading of the procedural theme comes out Dm–Bb–Gm–A clean, and the takes
wander. Measured per bar (triad template plus a 33–123 Hz bass chroma, best
phase against the loop): the procedural theme fits 30/32 bars, the four takes
4/31, 5/31, 10/31 and 7/29.

**The Flows music node's `audio` input is not Audio Reference (Oct 2026).** It
looks like the obvious route to a 1:1 "upscale" and it is not. Every run with
an UPLOADED theme on it failed at once with "unexpected error processing this
generation" — mono WAV, stereo MP3, 57s, 28s (under the documented ~30s
reference limit), 44.1 and 48 kHz; v2.5, v2 and v1; a "keep the melody" prompt
and a neutral "in the style of" one. Failed runs were not charged. With
ElevenLabs' OWN generation on the input it "succeeds" and hands the input back:
waveform correlation 1.000 at lag 0, same RMS, and the 10s length of the
input rather than the 15s asked for. That is the inpainting path — a stored
song id plus edit ranges — and an upload has no song id (the API's
`music/upload`, which makes one, is documented for inpainting and said to be
enterprise-only). The real References feature (`conditioning_ref`,
`condition_strength`) is on the ElevenMusic / ElevenCreative Music page, not
this connector. Flow `LRBTaBnKWB4SFA1bf00O` keeps every attempt.

**The beat is measured, not trusted** (`tools/capture/music-beats.mjs`): an
onset envelope, then a period-and-phase search. Unconstrained, the search
locked onto 3/2 and 5/3 of the beat (81.6 and 90.6 BPM), so it is held to
0.40–0.48 s a beat — and validated on the procedural theme, which it reads
as exactly 136.364. The takes measure 136.07, 136.07 and 136.67 BPM; their
drift against a straight grid spans 52–62 ms, i.e. about ±30 ms, inside Kata
Trace's ±100 ms PERFECT.

**The loop is found by self-similarity**, not by bar-counting the prompt's
chord loop (which the takes do not play). Per beat: chroma plus band energies;
every pair of beats whole bars apart (A ≥ 16, B ≤ end−8, B−A ≥ 48 and a multiple
of 4) is scored over ±4 beats, and the longest loop within 0.01 of the best
score wins. Requiem loops beats 40–88 (21.2 s). Darksynth did too, 52–100
(21.2 s) — see below for why it no longer does.

**Except Nightmare, whose loop is chosen by its sections.** Richard, of the
first long cut: "isn't looping very well and sound awkward, especially since it
only says HONOR once ... we should loop at the originals 49 seconds before it
fades out". The search had picked 20–92, which jumps out mid-section and leaves
the choir's second half and the outro to play once, at the end. Per-beat band
energy reads the song's shape exactly: bells to beat 15, drums in at 16, and
every section announced by ONE beat with the sub dropped out — 31 before
section 2, 63 before the choir (64–96); the outro runs to 111, 112 is the
closing hit and the fade starts at 113 (49.6 s). So it loops **31→111** (80
beats, 35.1 s): to the end of the outro's last full bar, then into the song's
own break beat — a transition the music already makes once — with the whole
choir in every pass.

**And Darksynth, the same way (Oct 2026).** Richard: "The loop on the Hard
Shadow Lionheart music is not very good, too repetitive in the battle, also the
splice transition of the music is not very good. We want more diversity and the
main theme of the song repeating during the battle." 52–100 was 21 s of the drop
alone; the theme was heard once. Band energy: the theme in 8-beat phrases from
7 (G 15, C 23, D 31, G 39), ONE sub-less break beat at 46, the drop 47–110 at
full mids, the closing hit at 111 and the fade from 112 (49.8 s). It loops
**15→111** (96 beats, 42.3 s): the end of the drop back into the theme's second
G phrase — drop into verse, the turn at 46 run the other way.

**And no seam is cut on the grid.** The takes creep about 0.1% — invisible to a
chart, but it puts beat A and beat B 30–60 ms out of step with each other, so a
loop cut exactly on the grid stumbles at every seam. All three first loops did:
**Requiem −43 ms, Darksynth −61 ms, Nightmare −29 ms**. `seamLag` measures it
by cross-correlating an onset envelope in eight bands over the four beats before
each side (±110 ms, 1 ms steps), and A is moved by it. Then `seamCut` puts the
cut at the quietest moment on both sides in the 70 ms before the beat, so a
drum hit is never split — a cut a few ms after a hit plays a sliver of it and
then the other side's hit, which is a flam. Requiem's peak is sharp (0.69
against a 0.31 floor); Nightmare's is shallow, but the same −33 ms came out of
two seam pairs at two window lengths and agreed with two cruder reads.
**Darksynth's 15→111 seam is the exception** (`lagBy: 'drift'`): the four
beats before each side are theme against drop, two different arrangements, and
`seamLag` peaked at +97 ms on 0.278 against the edge of its search, with
neighbouring pairs anywhere from −4 to +97; per-beat onset peaks scatter
−101…+110 ms, because a pad-and-arp texture has no hit to lock to. The beat
fit's own 8 s drift windows, interpolated at each end, say **+23 ms**.
`tools/capture/.out/seam-preview.mjs` renders every seam for listening.

**Playing it** (`startMusic` / `_fileStart`):
- **The scheduler's clock is kept.** The timer still ticks `_nextNote` and
  `_step`, it just plucks nothing, and `_beat0` is beat 0 on the audio clock.
  So `musicGrid`, `shiftMusic` and Kata Trace's `keepTime` work unchanged, and
  a file still decoding comes in late *on the beat* rather than late and wrong.
- **The fight loops** with `loopStart`/`loopEnd` (the lag-aligned cuts, so its
  period is the music's own A-to-B, not whole grid beats — nothing reads the
  grid in a fight) on a COPY of the buffer whose last 25 ms before `loopEnd` are
  crossfaded (equal power) into the 25 ms before `loopStart` — no click. Kata Trace plays the original straight
  through (`restartMusic` passes `loop: false`) and never hears the seam.
- **Fetched, then decoded on demand**: bytes (~1.4 MB each) are prefetched when
  a kitten nears the Dream Dojo; only the playing piece is kept decoded (~20 MB
  a minute of stereo).
- **Speed changes pitch.** Kata Trace's 1.25×/1.5× is `playbackRate` on a
  recording, so it plays higher. A time-stretch would need a library; not done.
- **Level-matched**: each file's `mix` brings it to 0.050 RMS, the procedural
  pieces' level.

**Nightmare's long cut** (`shadowNightLong.mp3`, 360 beats, 2:38): the take to
its seam at 48.7 s, the 31→111 body twice more, then 31 to the end — so the
choir is sung four times. Each pass's body is **resampled by 0.1%** (about 1.6
cents) to exactly 80 beats, so the chart's grid survives every pass; played
as-is, the 33 ms lag would add up to 100 ms, a whole PERFECT window, by the
end. Beat 0 is the original's plus the encoder's delay, measured by lining the
waveforms up (0.0 ms — ffmpeg trims LAME's padding).
**The first long cut's chart stopped 35 seconds early**: intro, N passes and a
tail from A to the end is N+1 times round the loop, and it counted N (147.5 s of
chart over 182 s of music).

**His chart fits every song** (`fitShadow`): the hand-written 128-beat chart is
opening / march / finale; the finale is pinned to the song's end and the march
fills the gap with whole copies plus the tail of one, never cut inside a 凶. At
128 beats it is the chart that shipped, event for event.

**Tried and failed:** an unconstrained beat search (multiples of the beat);
finding the loop from the prompt's chord progression (the takes ignore it);
taking the long cut's re-measured beat 0 at face value (one beat late, and
after the seams were aligned, 33 ms off — the fit then sees mostly repeated
sections); Nightmare's loop by self-similarity alone (20–92: the choir once);
seams cut exactly on the grid (a 30–60 ms stumble); measuring the seam lag on
the kick-and-bass envelope alone (it pumps in sixteenths, so its peaks sit 55 ms
apart and it picks one at random) or from per-beat kick onsets (this track's
"kick band" is a sustained reese bass).
