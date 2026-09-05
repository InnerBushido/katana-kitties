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
| **Mr. Satan** | the tournament, and the trailer. The only insincere voice in the game. | **Harrison** | `573e5163-59b3-4926-aab1-951ef2985f81` | all thirty-three `sat_*` — the six bare numbers `sat_n0`–`sat_n5` and the four cues of the last fifteen seconds among them; **and six of the trailer's fourteen lines** (1-3, 9, 10, 13) |
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

## The card and the recording have to be ONE string

Reported from play as *"not all the text is displaying for what he is saying, it
is like an abbreviated version of what he says"*, about the announcer's-box
taunt. It was true, and the shape of the bug is worth remembering because
nothing on screen looks wrong when it happens.

The bubble was being fed a hand-written short version of the line while
`BLAST_LINES` held the full one the recording was made from. Two strings, one
id: `Announcer` prints the text it is handed and plays the clip that matches the
id, so it will happily put four words on screen over eight seconds of speech and
report no error at all.

**Measurement is what settles it.** Harrison runs 2.4-2.6 words a second (above),
so `ffprobe` on a clip divided by the word count of its card says immediately
whether the two agree. `sat_taunt.mp3` is 8.56 seconds against a seven-word
card, which is about three times too long and is not a delivery choice.

**The fix is structural, not editorial.** There is one string now, and `card()`
is the only thing between it and the bubble — it collapses the newlines the
source is wrapped on and changes nothing else. Two strings cannot drift apart
if there is only one.

**Three other clips look long for their cards on the same test** and have not
been touched, because the text they were actually recorded from is written down
nowhere in this repo:

| clip | length | its card | words | implied by the length |
| --- | --- | --- | --- | --- |
| `sat_ko` | 5.52s | *"DOWN! Oh, that had to hurt!"* | 6 | ~14 |
| `sat_win1` | 6.32s | *"AND THAT IS THE MATCH! What a display!"* | 7 | ~16 |
| `sat_r1` | 6.24s | *"ROUND 1! <A> versus <B> — fighters, take your marks!"* | 9 | ~15 |

`sat_r1` is the least suspicious of the three and is here for completeness: its
card interpolates two kitten names the recording cannot possibly contain, so the
two were never going to be the same sentence. The other two have no such excuse.

Neither is a bug any player has reported, and each would cost either a re-record
(0.15 credits) or a longer card. Written down so the next session does not have
to re-measure them.

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
| a round decided on the clock, with both fighters still up | Mr. Satan | [src/systems/tournament.js](../../src/systems/tournament.js), `sat_over` — `ROUND_OVER_LINE` |
| the trailer | the trailer voice and Mr. Satan, trading the microphone; Duskcoat once; a kitten once | [tools/trailer-vo.mjs](../../tools/trailer-vo.mjs) |

## The last fifteen seconds: four cues, and one of them is a timeline

A round runs out in four steps, and only the last of them is unusual.

| left | file | how it is played |
| --- | --- | --- |
| 30s | `sat_t30` | an ordinary card |
| 15s | `sat_last1` | an ordinary card |
| 10s | `sat_last2` | an ordinary card |
| 5s | `sat_count` | **no card.** Straight down the speech channel |
| 0s | `sat_zero` | a card, and his charging sprite |

All five are cut by
[tools/capture/satan-countdown.mjs](../../tools/capture/satan-countdown.mjs)
from the takes in `tools/capture/satan-takes/`, and `sat_count` is the only
file in `public/voice/` that is not simply what came back from a render.

**The count has no speech bubble, on purpose.** The word he is shouting is the
number, and the number is already on the screen eighty pixels high — a card
underneath saying "FIVE! FOUR! THREE!" is the same information twice. It was
built that way first and reported back as exactly that: *"the countdown text
can just be displayed in the center of the screen, does not need to be in a
speech bubble since that is only for text/sentences that he is saying."* So it
goes through `Audio.speak` directly, and `Announcer.clip()` exists to hand out
the preloaded element for it.

**And it cannot go through the queue.** `Announcer.say` queues and never
interrupts, which is right everywhere else in the game — his milestone calls
arrive in bursts and cutting him off mid-word three times is worse than hearing
him three times. Here it is fatal: every number inside `sat_count` is nailed to
the second it names, so a card ahead of it that runs half a second long has him
shouting FIVE at a screen showing four.

### It is ONE take, re-timed — not nine takes assembled

The first cut built the count out of eleven separate one-word renders and it
was reported back as what it was: *"the counting and the interjecting words
between the numbers does not sound good... does not sound natural"*, against an
ask that was explicitly *"getting more and more frustrated the closer he gets
to zero"*. Eleven isolated renders of a single shouted word are eleven
performances of the same flat anger. **An actor escalates across a line, not
inside a word.**

So `count.mp3` is one continuous render of the whole countdown and the cutter
only moves its pieces around: `silencedetect` finds the nine words, the five
numbers are pinned to 0/1/2/3/4 seconds, and each shout between them is
squeezed by exactly as much as its own gap demands. The escalation is his; the
timing is ours.

### What the beat actually costs

A number and a phrase have to share one second, and they trade almost one for
one — every tenth taken off the number is a tenth the phrase does not have to
lose. Measured across the take:

| numbers at | a number is | worst phrase needs |
| --- | --- | --- |
| 1.55x | 0.38s | 1.85x |
| 1.70x | 0.35s | 1.74x |
| **1.85x** | **0.32s** | **1.66x** |
| 2.00x | 0.30s | 1.60x |

`NUM_TEMPO` is 1.85 — numbers barked rather than said, which is what was asked
for (*"when saying the numbers, they should be said faster than normal, maybe
in half the speed"*) and also what buys the phrases their room. What lands:

| after | phrase | rendered | fitted | |
| --- | --- | --- | --- | --- |
| FIVE | `HURRY UP!` | 0.59s | 0.59s | 1.00x — not touched |
| FOUR | `NO TIME LEFT!` | 1.00s | 0.61s | 1.66x |
| THREE | `NOW OR NEVER!` | 0.91s | 0.63s | 1.46x |
| TWO | `JUST PUNCH 'EM!` | 0.98s | 0.64s | 1.52x |

Three of the four are inside the *"30-50% speedup should be acceptable"* that
was asked for and one is over it, nowhere near the doubling that was ruled out.
`SAY_MAX` is 1.7, deliberately just above the outlier so the cap is a real test
rather than a rubber stamp: lower it and the cutter **drops** whatever no longer
fits, says which, and the clip still works.

`atempo` preserves pitch throughout, so this is him shouting fast rather than
chipmunked.

### A card is shortened by closing its pauses, not by playing him faster

`sat_last2` shipped at **1.475x** and was heard immediately: *"seems like it is
sped up... he is just talking at this point"*. Correct, and the cause was one
missing lever. The cutter's only way to make a card fit was `atempo`, and its
ceiling was `CARD_TEMPO_MAX = 1.5` — the *"30-50%"* from the ask, which belongs
to the shouts sneaked between the numbers and never belonged on a line he is
merely talking through.

**There is no spare second to give it.** From the ten-second card to the start
of the count there are exactly five; the card wants `HOLD_TAIL` (0.9s) of them
to retire in; and the count is the one cue here that cannot start late. The
take ran 5.90s against a 4.0s window. Closing its pauses alone only recovers
0.72s, so the line was over budget on its words, not on its timing.

The cutter now takes out **dead air** before it considers speed at all, and the
order is the point — reversed, it hides an over-long line behind an `atempo`
nobody reads, which is exactly how 1.475x shipped. `CARD_GAP_MAX` is **0.20s**,
measured rather than chosen: `last1` ships completely untouched and its own
interior pauses run 0.085 / 0.108 / 0.116 / 0.192, so the floor is *no longer
than the longest pause in the take we already accept* — and rounding it up to
0.20 leaves that take genuinely byte-identical rather than re-encoding it for
twelve milliseconds. Flooring a pause costs nothing in naturalness because it
does not touch the speech: the words play at the rate Harrison rendered them.

| | rendered | its pauses | after flooring | ships at |
| --- | --- | --- | --- | --- |
| `sat_last1` | 3.84s | .085 / .108 / .116 / .192 | untouched | **1.00x** |
| `sat_last2` | 4.93s | **.72** / .25 / **.46** / .07 | 4.11s, 0.82s closed | **1.027x** |

`CARD_TEMPO_MAX` is now **1.10** — a nudge, not a squeeze. With the gaps doing
the real work, a card that still does not fit is a card with too many *words* on
it, and the cutter throws with the line quoted in the message. **Do not raise
it.** The answer is a shorter line, and that is the other half of this fix:
*"TEN SECONDS! Oh FINE! FINE! I'll count you down! I HATE counting!"* is eleven
words and needs 5.90s at his own pace. It is now *"TEN SECONDS! FINE! I'll
count! I HATE counting!"* — the punchline kept, the padding gone. The old take
is `alt/last2-6s.mp3`, with the two variants that lost beside it.

**`world-check` pins all three facts**, because none of them failed anything the
first time: that the gaps are closed before the speed is touched, that a card's
ceiling is at most 1.10, and that it stays far below the shouts' own `SAY_MAX`.

### The takes are in the repo now

`tools/capture/satan-takes/` holds the six renders the cutter consumes, and
`satan-takes/alt/` everything superseded — the eleven single-word takes of the
first cut, the two other countdown performances, and the spliced `sat_last.mp3`
it produced. **This is a change of policy and it is worth the disc.** The first
cut consumed a dozen renders that existed only in a scratch folder, so the one
tool that could rebuild those files could not be run twice. A take that has been
paid for and listened to is worth keeping.

`sat_n0`–`sat_n5` still ship as their own clips — asked for so a countdown of
any other length can be built later — and they are now cut out of **this**
performance rather than rendered on their own, so they escalate too. They keep
their natural length; the tempo nudge is the count's business only.

### It degrades like everything else

Ninth non-negotiable. With no `sat_count.mp3` nothing plays and the `count` blip
ticks once a second under the big number instead — `Tournament._voiced` is the
flag that decides, and `world-check` drives both directions, because a tick that
*also* plays underneath his voice is two clocks disagreeing out loud. With no
`sat_zero.mp3` the round does not wait for a shout that cannot happen: the bell
rings straight away, as it always did.
