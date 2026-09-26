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
