# Sound and music

*Design notes, moved verbatim out of the old 4,400-line `HANDOFF.md`. This is
the WHY behind code that already exists — read it when you are about to change
something in this area, not before. Current state and open work live in
[HANDOFF.md](../../HANDOFF.md); the always-on summary is [CLAUDE.md](../../CLAUDE.md).*

*Cross-references saying "above" or "below" may now point at a sibling file in
this folder — see [the index](README.md).*

---

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

---

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
