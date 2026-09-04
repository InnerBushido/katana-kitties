# Voice acting — who sounds like whom, and how to keep it that way

**This is the registry. A character has ONE voice, and this file is where it is
written down.** Every `public/voice/*.mp3`, every line in the trailer, and
anything recorded later comes out of the table below.

It exists because it nearly went wrong. The first cut of the trailer cast a
narrator by measurement, from a cold list of preset names, and got **Desmond** —
a perfectly good choice for a narrator who did not exist yet, and the wrong
question entirely for Mr. Satan, who already had eighteen recorded lines in the
game. A trailer whose narrator does not sound like the game's narrator is a
trailer for a different game. Nothing in the repo said which voice he was; the
preset name was in a commit message and in [tournament.md](tournament.md), and
the session doing the casting did not think to look for it. **That is the
failure this file prevents, and it only prevents it if it is read before
anything is generated and updated the moment anything is.**

**Desmond is back, and the reason is the point of the table rather than a
reversal of it.** The trailer now has two narrators — a straight trailer voice
whose microphone Mr. Satan keeps grabbing — so the narrator who did not exist
yet exists, and Desmond is who he is. The error was never "Desmond"; it was
casting a voice for a part that already had one. He gets a row below like
everybody else.

## The cast

All of these are **ElevenLabs preset voices**, reached through Higgsfield's
`text2speech_v2` model with `variant: 'elevenlabs'`, `voice_type: 'preset'` and
the `voice_id` below. About **0.15 credits a line**.

| character | who they are | preset | `voice_id` | files |
| --- | --- | --- | --- | --- |
| **Patchfur** | the storyteller, a calico elder. Narrates the intro and the ending. | **Mabel** | `fa64fba4-ad02-405e-99d0-1f085d87c706` | `sky` `break` `elder1` `elder2` `close` `balls1` `balls2` `done1`–`done4` |
| **Sunstreak** | Thunderpaw. Siamese. | **Quinn** | `80914268-dfae-4f76-8306-36f2d55f58f8` | `thunder` `shrine_thunder` |
| **Rippleclaw** | Riverclaw. Turkish Van. | **Maya** | `b0f766b7-8703-4bd1-b973-f857c36837b6` | `river` `shrine_river` |
| **Duskcoat** | Shadowtail. Tuxedo. | **Vesper** | `c3204739-4084-41a3-9dc5-c805b307ec18` | `shadow` `shrine_shadow`, **and trailer line 11** |
| **Galemane** | Windwhisker. Maine Coon. | **Onyx** | `8911390e-4b59-459b-ba84-19010917e1df` | `wind` `shrine_wind` |
| **Snowmantle** | Icewhisker. Himalayan. | **Imogen** | `3811e986-0891-47cf-a1f5-78a1d62a547a` | `ice` `shrine_ice` |
| **Bambooheart** | Pandapaw. Ragdoll. | **Hana** | `c25f78a0-714e-42af-8da3-a399cef94968` | `panda` `shrine_panda` |
| **Mr. Satan** | the tournament, and the trailer. The only insincere voice in the game. | **Harrison** | `573e5163-59b3-4926-aab1-951ef2985f81` | all twenty-nine `sat_*` — the six bare numbers `sat_n0`–`sat_n5` and the spliced `sat_last` among them; **and six of the trailer's fourteen lines** (1-3, 9, 10, 13) |
| **the trailer voice** | not in the game at all. The straight narrator Mr. Satan interrupts — and the one who has to say "right meow" with a straight face. | **Desmond** | `563f728c-e249-5a85-97ab-8461e8c09da6` | **six trailer lines** — 4-8 and the sign-off |
| **Ryuuseki** | the dragon the seven stars call. | **unresolved — see below** | — | `summon1` `summon2` |
| *(the thing in the dark)* | three seconds of the trailer — and, since the Cross Slash rebalance, four sounds in the game | **not a voice at all** | [tools/kitten-cackle.mjs](../../tools/kitten-cackle.mjs) | trailer line 12, `cross0`-`cross3` |

[tools/trailer-vo.mjs](../../tools/trailer-vo.mjs) carries the same four ids it
uses, in its own `CAST` table. **If a `voice_id` here and there ever disagree,
this file is right** — but fix both, because the trailer script is what actually
generates.

## The kitten is now in the game, and that is a licensing decision

`public/voice/cross0.mp3` through `cross3.mp3` are the Cross Slash's verdict:
how many of the three cuts landed, said out loud by a cat. They are **four
rungs of the same ladder** the trailer's demon came off — one meow played at
progressively slower speeds, nine bursts of it, and `--game` takes bursts 1, 4,
6 and 9. `cross3` and trailer line 12 are the same three seconds.

```
node tools/kitten-cackle.mjs --game
```

| file | rung | length | what it means |
| --- | --- | --- | --- |
| `cross0` | burst 1 of 9 | 0.29s | none of the three cuts landed. An innocent kitten, and it sounds weak — which is the joke. |
| `cross1` | burst 4 | 0.53s | one landed |
| `cross2` | burst 6 | 1.06s | two landed |
| `cross3` | burst 9 | 3.00s | all three. The demon from the advert. |

**This deepens an exposure rather than creating one, and it is worth being
plain about.** `out/trailer/ref/cackle.wav` is somebody else's recording off a
social post. It has always been gitignored and it must stay that way — but
until now the only thing derived from it in the repo was three seconds baked
into the trailer MP4. These are four separate files, in `public/`, shipped with
the game and served to every player. **A Steam release has to either license
the source or delete these four files**, and the second option is real and
cheap: `--game` with no reference synthesises its own ladder instead
(0.83/1.27/1.85/2.92s — the same order, a quarter of the spread), and if even
those are absent `Audio.sample` falls through to four synthesised stand-ins in
`Audio.play`. Three levels of degradation, because the ninth non-negotiable
says the game must work with `public/voice` deleted and this is a gameplay cue
rather than a line of dialogue — silence here would mean the move stopped
telling you how it went.

`world-check` pins the middle level: every key in `SAMPLES` must also be a
`case` in `Audio.play`, or deleting the folder turns the grading into nothing.

## Ryuuseki's voice was never written down, and five auditions did not find it

His two lines exist and sound right; the preset that made them is lost. Rather
than guess, he is **measured**, with `tools/voice-measure.mjs`:

```
                    f0Hz   range(st)  dyn(dB)   secs
summon1              116       28.9     21.2   5.76
summon2              104       28.0     19.3   6.96
```

A deep male voice with an enormous pitch range. Every male preset in the
catalogue was measured from its preview, the five whose profile could plausibly
land there were made to say **summon1's own line**, and none of them arrived:

```
Desmond              134       26.6     24.3   6.08     +2.5 semitones
Kevin                150       27.9     16.6   5.04     +4.5
Alistair              88       31.8     19.3   6.88     -4.8
Caspian               84       28.3     36.7   8.56     -5.5
Gideon                66       32.8     12.0   6.88     -9.7
```

**Desmond is the nearest and is where a recast should start**, but he is two and
a half semitones high and that is audible. Two cautions for whoever tries next.

The first is that **no other preset in the 105–125 Hz band has a range anywhere
near 29 semitones** — they all sit between 7 and 21 — so either he is not an
ElevenLabs preset at all (Higgsfield offers `minimax`, `seed_speech`,
`vibe_voice` and `cozy_voice` through the same model) or he was processed after
the fact.

The second is that **autocorrelation halves on a growly delivery**, and a dragon
is exactly that: a large part of `summon1`'s 28.9-semitone range may be octave
errors, which would drag the median down and make him look lower and wider than
he really is. If that is what is happening, Desmond is a much better match than
the table says.

**Do not recast him casually.** He has two lines, they are the payoff of the
seven-star hunt, and a new voice on one of them is worse than the hole in this
table.

## The castings were checked, not copied

Five of the eight were **confirmed by measurement** rather than transcribed from
a commit message — each preset's own preview against that character's clip:

| character | preset preview | her clip | |
| --- | --- | --- | --- |
| Galemane | Onyx 144 Hz | `shrine_wind` 151 | ✓ |
| Duskcoat | Vesper 158 | `shrine_shadow` 162 | ✓ |
| Snowmantle | Imogen 182 | `shrine_ice` 176 | ✓ |
| Bambooheart | Hana 198 | `shrine_panda` 188 | ✓ |
| Mr. Satan | Harrison 119 | `sat_ann1` 132 | ✓ (he shouts) |
| Patchfur | Mabel 211 | `balls1` 222, `close` 216, `elder1` 225 | ~ |
| Rippleclaw | Maya 211 | `shrine_river` 229 | ~ |
| Sunstreak | Quinn 208 | `shrine_thunder` 235 | ~ |

The rank order is preserved end to end, which is the real result. **The last
three are confirmed only as a group**: Mabel, Quinn and Maya measure within 3 Hz
of each other, so f0 cannot separate them and this file is the only evidence of
which is which. Do not try to "verify" them by measuring — the measurement
cannot tell, and a session that concludes otherwise has fooled itself.

### And measure a preview or a whole part, never one dramatic line

The table above works because each row is a preset's own preview, or a clip
long enough to average out. **Per-line, f0 is worthless**, which was found the
expensive way: the trailer's two narrators are Harrison at 128 Hz and Desmond
at 148 — three semitones, which autocorrelation separates trivially — so
`trailer-vo.mjs --check` was written to police the split by measuring each
rendered take. Across the fourteen lines Harrison's own takes come out at

```
104   133   137   148   206   240 Hz
```

because a laugh is an octave up and a growled "hmph" is an octave down. The two
narrators' per-line numbers interleave completely; there is no tolerance that
separates them and also tolerates them. The check was rewritten to ask a
different question — the six Desmond takes are *copied*, not generated, so it
compares them byte for byte against `out/trailer/vo-desmond/`. **Exact beats
approximate whenever the exact question is available.**

## There is no style prompt. The prompt is the line.

Richard asked what prompt generated each voice, and the honest answer is that
**there isn't one** — `text2speech_v2` with a preset takes the text and the
`voice_id` and nothing else. No style field, no direction, no temperature.

Which means **the writing is the direction**, and that is the part worth being
careful about, because it is the part that has to carry across sessions:

- **Mr. Satan is written loud and punctuated.** `AHEM!`, `It is I —`, capitals
  on the word he is leaning on, `Ho ho ho!` to close a brag. Harrison delivers
  what is on the page; the swagger is in the page. A line written flat comes
  back flat, and then somebody blames the preset.
- **The six leaders speak in the first person and name their own buff.** They
  were written third-person once — Patchfur describing each chief — while the
  box underneath showed that chief's own name and portrait, so the scene claimed
  she was speaking and the words said otherwise.
- **Patchfur is written in long, unhurried sentences.** She is the only voice
  allowed to take its time; every other character is on a clock.
- **Punctuation is the only timing control there is.** An em dash is a beat, a
  full stop is a longer one, and a leading `...` buys about half a second. That
  is how the trailer's lines were fitted to five-second shots — see
  `node tools/trailer-vo.mjs --check`, which fails if a take overruns its slot.
- **Two voices are two speeds, and a line cannot be moved between them
  unchanged.** Harrison runs 2.4-2.6 words a second including his pauses and
  Desmond 3.5-4. When the trailer was recut to hand shots 4-8 back to Desmond,
  the three lines that stayed with Mr. Satan had to be rewritten to his clock,
  not merely reassigned.

## Adding a voice

1. **Read this table first.** If the character is in it, use that preset. There
   is no such thing as "a different take on Duskcoat".
2. If the character is new, audition **by measurement, not by name** —
   `tools/voice-measure.mjs` prints the four numbers that decide whether a voice
   can carry a part: median pitch, pitch range in semitones, dynamic range, and
   how long they take over the line. Generate the **actual line** with each
   candidate rather than judging from previews: the five Ryuuseki auditions
   above moved by up to 25 Hz between a candidate's own preview and the real
   line.
3. **Write the new row into this table before generating the rest**, with the
   `voice_id` and not just the name. The name alone is not enough — that is
   exactly how Ryuuseki got lost.
4. Everything degrades without the files: `public/voice/*.mp3` are optional and
   the game falls back to synthesised blips (ninth non-negotiable). A missing
   voice must never be a crash.

## Where the voices are used

| surface | who talks | code |
| --- | --- | --- |
| the opening cutscene | Patchfur, then all six leaders, then Patchfur | [src/systems/cutscene.js](../../src/systems/cutscene.js) |
| a shrine, first visit | that clan's leader, once | [src/systems/shrinescene.js](../../src/systems/shrinescene.js) |
| seven stars found, and the summon | Patchfur, then Ryuuseki | [src/systems/summonscene.js](../../src/systems/summonscene.js) |
| 100% mischief, the ending | Patchfur | same file, `SCRIPTS.done` |
| the tournament — rounds, KOs, the result | Mr. Satan | [src/systems/tournament.js](../../src/systems/tournament.js) via [announce.js](../../src/systems/announce.js) |
| building the arena — the 50/60/70/75% calls | Mr. Satan | [src/systems/arenaquest.js](../../src/systems/arenaquest.js) |
| his two full-screen moments | Mr. Satan | [src/systems/summonscene.js](../../src/systems/summonscene.js), `SCRIPTS.sat_*` |
| climbing onto his box — the taunt, and the shout ten seconds later | Mr. Satan | [src/systems/satanblast.js](../../src/systems/satanblast.js), `sat_taunt` and `sat_blast` via [announce.js](../../src/systems/announce.js) |
| the trailer | the trailer voice and Mr. Satan, trading the microphone; Duskcoat once; a kitten once | [tools/trailer-vo.mjs](../../tools/trailer-vo.mjs) |

## The one clip that is a timeline, not a line

`sat_last.mp3` is the last fifteen seconds of a round: the fifteen-second call,
the complaining, and then "FIVE! FOUR! THREE! TWO! ONE!" with the numbers
landing on the seconds they name. It is **spliced**, out of a dozen separate
takes, by [tools/capture/satan-countdown.mjs](../../tools/capture/satan-countdown.mjs)
— and it is the only file in `public/voice/` that is not simply what came back
from a render.

**Why it cannot be eleven `say()` calls.** `Announcer.say` queues and never
interrupts, and that is right everywhere else in the game — his milestone calls
arrive in bursts and cutting him off mid-word three times is worse than hearing
him three times. Here it is fatal: eleven clips fired a second apart stack the
moment any one of them runs a frame long, and by "TWO" he is counting a clock
that has already run out. **One file cannot drift against itself.** It is
started once, at exactly fifteen seconds left, and each number is nailed to its
own second at splice time.

**What would not fit, and the measurement that settled it.** The ask was an
interjection between every number — *"5, HURRY UP, 4, NO TIME LEFT, 3, NOW OR
NEVER, 2, JUST PUNCH EM, 1"*. The word-rate table above is what decides this
and it decides it flatly: Harrison runs 2.4-2.6 words a second, so

| take | rendered |
| --- | --- |
| `NO TIME LEFT!` | 1.33s |
| `JUST PUNCH 'EM!` | 1.36s |
| `ONE!` | 1.04s |
| `THREE!` | 0.52s |

A one-second beat cannot hold a number **and** a phrase. Two seconds a beat
holds both — and then the number he shouts disagrees with the number on the
screen, which is the one thing the whole feature exists to stop, and the
screen cannot be the one to move because *he is a recording*.

So the complaining is **front-loaded** into the ten seconds before the count,
where there is all the room in the world, and only single shouts go between the
numbers. Which ones land is **measured, not chosen**: the splicer fits the
narrowest gap first with the shortest word that fits it, which is what
maximises how many gaps get filled at all. Two do — `HURRY!` after FIVE and
`MOVE!` after THREE — and the rest of his temper goes into the roar on ZERO,
where there is no clock left to disagree with. He starts in sentences and ends
barely able to manage the numbers, which is the right shape for somebody losing
his temper anyway.

**Two atempo nudges, both under the threshold where a shout sounds processed.**
The numbers are pushed 1.15x inside the splice — "ONE!" at 1.04s would step on
the roar — and the between-number shouts 1.45x. `atempo` preserves pitch, so
this is speed and not chipmunk. **The shipped `sat_n0`–`sat_n5` are untouched
takes**: the nudge is the splice's business only, and those six exist so a
countdown of any other length can be built later without paying for them again.

**It degrades like everything else.** With no `sat_last.mp3` the announcer shows
the text for three seconds and goes quiet, and the countdown falls back to the
`count` blip once a second under the big number — `Tournament._ranting` is the
flag that decides, and `world-check` drives both directions.
