# The trailer, and the generated art

Richard asked for a 45s–1:15 trailer and some Steam art on 2026-08-21, "to
share with the girls and the world". This is what got made, how to remake it,
and the three arguments that had to be settled first.

## Remake it

```bash
node tools/steam-art.mjs          # the shelf + the wordmark, from title_art.png
node tools/trailer-vo.mjs         # print the script; the takes are generated
node tools/trailer-vo.mjs --check # do they fit, and are the reused ones intact?
node tools/trailer-score.mjs out/trailer/score.wav   # music + narration
bash  tools/trailer-cut.sh        # -> out/trailer/katana-kitties-trailer.mp4
bash  tools/trailer-cut.sh --audio  # ...new soundtrack only, picture untouched
bash  tools/steam-capsules.sh     # -> out/steam/capsules/
```

The narration takes in `out/trailer/vo/*.wav` are generated, not synthesised,
so they are the other thing in `out/` that cannot be re-derived — their job ids
are in `out/trailer/vo/jobs.txt`, and **six of them are copies of the first
cut's takes**, archived in `out/trailer/vo-desmond/`. Everything else
regenerates from the tools.

`trailer-cut.sh` calls `tools/brush-kanji.mjs` itself; there is nothing to run
by hand for the 十.

`out/` is gitignored, as it has been since `steam-art.mjs`: **the tool is the
thing worth versioning.** The generated stills are the one exception that has to
be kept somewhere, because they cost credits and cannot be re-derived
identically — they live in `out/trailer/shots/` and their Higgsfield job ids are
written down in `out/trailer/jobs_img.txt` beside `SHOTLIST.md`.

## What is in it

Twelve five-second shots and eight seconds of title card: 1:08.

| slot | shot | sells |
| --- | --- | --- |
| 1 | floating islands at golden hour | the world |
| 2 | a kitten on a cliff edge | the character |
| 3 | mischief down a village street | the katana, and the MISCHIEF counter |
| 4 | riding the panda, pets scattering | the menagerie |
| 5 | leaping onto the ember dragon | the dragons |
| 6 | the Dojo of the Turning Circle | **the maths is the point** |
| 7 | the Kotodama Orb drawing its working | **the maths is the point** |
| 8 | the eight Kotodama Orbs, kanji burning | what the orbs *are* |
| 9 | the arena, four fighters, a crowd of cats | four players |
| 10 | Mr. Satan | the boss |
| 11 | the Cross Slash landing | Smash-style abilities |
| 12 | four kittens leaping at camera | the finish |

**The running order is not the file numbering.** The eight-orb shot was cut in
after the fact — Richard asked for the Kotodama orbs specifically once the first
eleven were rendering — and it belongs beside the other two orb shots rather
than at the end. Renumbering the files would have invalidated every job id and
prompt already written into `SHOTLIST.md`, so `trailer-cut.sh` carries an
`order` array and the files keep the names their receipts are under.

## Three arguments, settled

### 1. The music is the game's music, not a transcription of it

`tools/trailer-score.mjs` **imports `MUSIC` and `ROOT` from
`src/core/audio.js`** and re-implements `_pluck` against a sample buffer instead
of against Web Audio nodes. Every scale, root, tempo, drone level, rest
threshold and drum division comes off the same table the game plays from, so
the trailer cannot end up in a different key from the thing it is advertising.
`ROOT` was exported for exactly this and for nothing else.

**Recording the game instead was the obvious answer and is wrong.** The rests
are hashed off the step number, so a capture is *one take* and unrepeatable; it
would carry whatever sound effects happened during it; and it could not be cut
to the length of an edit that was still moving. This renders exactly the bars
the cut needs, deterministically — the noise source is a seeded xorshift for the
same reason.

The arrangement is the only invention: `intro` → `flight` → **`dojo`** →
`arena` → `dusk`. The one real trailer move is the drop-out at 25s. The Dojo
theme is deliberately the quietest thing in the game because there is a lesson
on screen there, and cutting to it out of the storm dragon's band is what makes
the arena land when it comes back.

Two things in there are *not* game sounds and are marked as such: a filtered
noise riser into the arena and into the Cross Slash. The game never has to warn
you that something is about to happen. A trailer does.

### 2. Every shot falls back to its still

`trailer-cut.sh` uses `clips/cNN.mp4` if it is there and does a slow push-in on
`shots/sNN.png` if it is not. That is not a convenience: the video model failed
on roughly two thirds of submissions across the session, and without the
fallback there would have been nothing to look at until it stopped failing.
A shot that comes back wrong is dropped by deleting one file. Prefer a rule
that degrades over one that vanishes.

### 3. The generated art may go on the store page, not on the shelf

`tools/steam-art.mjs` opens by arguing that a prompt to an image model "would
put art on the box that is nowhere inside it", and it is right *about the
shelf*. The library cover and the desktop icon stand in for a game you already
own, and those have to be the game — they are still cut from `title_art.png`
and nothing in `tools/steam-capsules.sh` overwrites them.

The store page is a different job. It has to show somebody who has never seen
this what is in it, across nine crops from 462x174 to 3840x1240, and there is
exactly one painting in the repo to cut them all from. So there are now two
sets, and `out/steam/capsules/` is the additive one.

**The wordmark is never generated.** Every capsule that carries the name
carries `out/steam/logo.png`, which `steam-art.mjs` cuts out of the kids'
painting with measured coordinates. A model's idea of that lettering would be
the one part of the whole exercise that is a forgery of their work — second
non-negotiable, and the line the generated set does not cross.

## What the generation actually cost

Nano Banana Pro at 2 credits an image, Kling 3.0 Turbo at 7.5 a five-second
clip, on a starter plan with no unlimited allowance. **Failed jobs are
refunded**, which is worth knowing before panicking at the balance mid-run: it
went 249.7 → 158.2 → back up to 201.2 as failures were credited back.

Two things were refused by the safety filter or the plan and had to be worked
around, both recorded here so the next session does not rediscover them:

* **Mr. Satan came back `nsfw` first time.** The prompt said "muscular … white
  gi jacket open over a broad chest". Closing the jacket and calling the film a
  children's film got it through unchanged in every other respect. He is a cat
  in a karate suit; the filter was reading the words, not the picture.
* **`seedance_2_5` needs a plus plan**, and both Seedance and Minimax were
  rate-limited at the provider all session. The Kling family was the only route
  that worked at all, and `kling3_0_turbo` needed `declined_preset_id` passed
  or the batch endpoint answers with a preset recommendation instead of
  submitting anything.

## The 十 is drawn, not typed

The Cross Slash card wants the orb's own kanji big and alone, and **every way of
setting it in type was tried first and every one of them reads as a plus sign.**
Yu Gothic Bold through ffmpeg's `drawtext` gives two 8px hairlines; fattening
those with `borderw=20` gives a *bolder* plus, which is worse, because now it
reads confidently as arithmetic. `drawtext` has no weight axis to ask a `.ttc`
for, so there is no setting in between. A Mincho face would have fixed it — the
flares and the dew-drop foot are exactly what say "kanji" and not "plus" — but
Windows ships only Yu Gothic and MS Gothic and both are geometric sans. There
was nothing to fall back to.

So `tools/brush-kanji.mjs` draws it: two cubic beziers with a half-width
profile, stamped as antialiased disks, with the outline and the drop shadow
made by re-rastering the same strokes fatter and offset. A horizontal that
lands blunt, thins across the middle and swells again before it lifts; a
vertical that presses in at the top and tapers to a point; five degrees of rise
on the horizontal so it is not a right angle. **That profile is the whole
difference between a kanji and a plus sign**, and it is four numbers a stroke.

It is not wired into the game and should not be. `PowerOrb.mark` is a canvas
`Label` and the orb wears its kanji at forty-odd pixels on a glowing ball,
where the ball does the reading for it — powerorb.js:112 says as much. This is
for the one frame where the glyph has to stand on its own.

**And it comes up late, in the corner.** For the first three quarters of a
second shot 10 *already draws the kanji*: the burst is a screen-high cross in
the orb's own pink, which is what the animation was asked for and got. A second
十 over that is two crosses fighting. The drawn one waits until 1.5s, by which
time the burst has opened into a white flare, and presses on top left like a
seal. Those coordinates are fitted to that clip — regenerate `c10.mp4` and look
at the corner before trusting them.

## There are two narrators, and the handover is the joke

`tools/trailer-vo.mjs` holds the fourteen lines and the second each one starts
on; `tools/trailer-score.mjs` imports them so there is one clock rather than
two. They are generated through Higgsfield's `text2speech_v2` with
`variant: 'elevenlabs'` at about **0.15 credits a line** — cheap enough that
auditioning six voices costs less than one image.

A straight trailer voice is narrating this trailer, and **Mr. Satan keeps
grabbing his microphone.** That is what "AHEM! Is this thing on?" is, and it
only reads that way because somebody else is plainly meant to be holding it:

| shots | who | |
| --- | --- | --- |
| 1–3 | **Mr. Satan** | he barges in and hypes the world |
| 4–8 | **the trailer voice** | the pets, the dragons, and the maths |
| 9–10 | **Mr. Satan** | the arena appears and it is *his* tournament |
| 11 | **Duskcoat** | the brag is punctured from outside |
| 12 | a kitten | nobody explains it |
| 13 | **Mr. Satan** | second place, then |
| 14 | **the trailer voice** | takes the mic back to say "right meow" |

**Why the middle is not his.** Shots 4 to 8 are where the trailer has to say
what the game actually *is*, and two of them are the maths — the Dojo and the
Kotodama Orb, the first non-negotiable, the reason the whole thing exists. Mr.
Satan cannot sell a maths lesson: everything he says is a boast, and a boast
about sine and cosine is a joke at the expense of the one part of this that is
not a joke. The all-Satan cut had him on "Sine. Cosine. You BECOME the point."
and it sounded like a timeshare pitch.

**And the sign-off is funnier straight.** "Play free, right meow" out of Mr.
Satan is a clown telling a joke. Out of a solemn narrator who has kept a
straight face for sixty-eight seconds, it is a man hearing what he just read.

**Mr. Satan is Harrison, because that is who he is in the game** — the same
preset as all eighteen `public/voice/sat_*.mp3`. The trailer voice is
**Desmond**, and he is the only member of this cast who is not in the game.

**Desmond was cast by measurement, and it is worth keeping the table**, because
it is how a new part should still be filled. The API gives you a name and a
gender and nothing else, so `tools/voice-measure.mjs` prints the four numbers
that decide whether a voice can carry a trailer — median f0, pitch range in
semitones, dynamic range in dB, and how long it takes over the test line:

| voice | f0 | range | dynamics | the line |
| --- | --- | --- | --- | --- |
| **Desmond** | 148 Hz | 26.7 st | 34.7 dB | **4.48 s** |
| Knox | 147 Hz | 29.5 st | 35.0 dB | 8.08 s |
| Barrett | 111 Hz | 16.9 st | 35.9 dB | 9.92 s |
| Callum | 144 Hz | 15.6 st | 22.8 dB | 6.40 s |
| Arthur / Callan | 188 / 200 Hz | ~18 st | ~24 dB | ~6 s |

Barrett is the deepest and sounds most like a film trailer, **and is
uncastable**: he takes 9.9 seconds to say what Desmond says in 4.5, and the
shots are five seconds long. Eighth non-negotiable, applied to something
spoken.

**Two voices are two speeds.** Harrison runs 2.4–2.6 words a second including
his pauses; Desmond 3.5–4. A line handed from one to the other has to be
rewritten to the new clock, not merely reassigned — which is why the three
lines that stayed with Mr. Satan in the recut are all shorter than what he
replaced. `--check` re-measures every rendered take against the gap before the
next one, because a take that overruns does not sound like a long line, it
sounds like two people talking over each other.

### Six takes are copied, not generated, and that is what `--check` guards

Desmond's six lines are the **first cut's takes, unchanged** — archived
un-mixed in `out/trailer/vo-desmond/` and copied into `out/trailer/vo/`. They
cost nothing to reuse and they are exactly the takes that were chosen.

They are also the entire two-narrator structure, and **nothing on disk
distinguishes them from the Harrison ones.** A helpful script that regenerated
"all the lines" from `CAST.satan` would collapse the piece back to one voice,
every file would still be the right length, and nobody would find out until
they watched it.

**Measuring the pitch was the obvious guard and it does not work.** Harrison
and Desmond are three semitones apart on their previews. Across the fourteen
rendered lines Harrison's own takes measure 104, 133, 137, 148, 206 and 240 Hz
— a laugh is an octave up, a growled "hmph" is an octave down — and the two
narrators' numbers interleave completely. There is no tolerance that separates
them and also tolerates them.

So the question changed rather than the tolerance. These takes were *copied*,
so the check is that they are still the bytes they were copied from: `reuse` on
the line names the archive file, `--check` compares them, and a failure prints
the one `cp` that puts it back. **Exact beats approximate whenever the exact
question is available.**

### Recasting is picture-free

`bash tools/trailer-cut.sh --audio` re-lays a new soundtrack on the segments
already in `out/trailer/seg/` and re-muxes. Rewriting the narration changes not
one pixel, and re-rendering twelve crf-17 segments and a title card to prove
that is minutes of CPU for a bit-identical result.

## The music got a second orchestra, and the reason is honest

Richard asked for "more action packed, dramatic and bombastic". **Higgsfield
cannot do it** — its audio models are speech-only, and the one music model in
the catalogue is locked to a game-generation pipeline and explicitly not for
standalone tracks. So it is synthesised, like everything else that makes a file
in this repo.

The game's own pieces could not be that and should not try. `MUSIC` is a koto
and a drum, written to be lived in for an hour at a time by a nine-year-old;
the arena theme is the loudest thing in it and it is a village festival. So the
pentatonic pieces stay exactly as the game plays them and become the *melody*,
and a trailer orchestra plays under them — five-saw horns with a filter that
opens over 90ms, a braam, timpani, a sixteenth-note ostinato that walks the
piece's own scale, a choir, crashes forwards and backwards, and sub drops. All
of it is tuned to the roots in `MUSIC`, so the horns are in the same key as the
koto. **None of it is ever loaded by the game.**

**The arrangement alone did not produce an arc, and that was invisible until it
was measured.** Rendered without a fader ride, every section came out between
-18 and -21 dB RMS: the fifteen quiet seconds at the Dojo were exactly as loud
as the arena, because normalising to peak means the loudest *hit* sets the
level and a dense section and a sparse one land in the same place. Density is
not dynamics. A throwaway per-second RMS plot is the only reason it was caught
— it is not audible as "wrong", it is audible as "flat". `RIDE` in
`trailer-score.mjs` is the fix and the one number that matters is **0.40 at
25s**, an 8dB drop into the Dojo.

The narration is mixed in the same pass, with real ducking — fast attack, slow
release, because music that jumps back the instant a word ends pumps audibly.
The Dojo lines duck by **zero**: the music there is already the quietest thing
in the game and pulling it further leaves a voice talking over nothing.

## It is in the game, and it costs nothing until you ask

`public/trailer/katana-kitties-trailer.mp4` — 720p, 20MB — with
`src/systems/trailer.js` playing it. Three ways in:

* **The title screen**, on its own row under SETTINGS / PLAY / HELP. A fourth
  button in that row would push PLAY off the centre of the cat's mouth and
  quietly redesign the girls' artwork; second non-negotiable.
* **The pause menu**, beside WATCH THE STORY AGAIN. The game stays paused —
  closing the trailer puts you back on the pause menu, not into a live world
  you stopped watching a minute ago.
* **Once per visit to the title screen**, as WATCH IT / STRAIGHT TO THE GAME /
  DOWNLOAD IT INSTEAD. It was once per browser, remembered in `localStorage`,
  and Richard reported the obvious consequence: *"that option only ever appears
  once and never returns. Even if I refresh the browser, it still will not
  reappear."* Remembering forever is right for a cookie banner and wrong for
  something you might want to show somebody — the most likely reason to want
  the trailer is a new person in the room. So there is no storage at all: a
  plain `_offerAnswered` field, cleared by `toTitle()`. Asking again mid-game
  would still be a toll gate, which is what the field is for.

**Nothing downloads until it is asked for.** The `<video>` has `preload="none"`
*and no `src` attribute at all* — `preload` alone is a hint browsers may ignore,
and an element with a src is a request waiting to happen. `open()` attaches it
and `close()` removes it again. Measured in the browser: opening makes exactly
one `206 Partial Content` request, and closing **aborts it mid-stream**, so
skipping the trailer stops the download rather than letting 20MB finish behind
a video nobody is watching.

**The skip rule is the game's skip rule** — `SKIP_KEYS` and `_skipPressed()`,
which is now **Escape, or a pad's Start, and nothing else**. Space and Enter
used to skip and were removed with the rest of the consent pass: four kids
round a laptop and Space is the key an elbow finds. See
[consent.md](consent.md). It is a 68-second video and every girl will be
holding a stick. It is checked *before*
`_sceneActive()` and separately from it: half a dozen places in main.js ask
that question meaning "a scene is running in the world", and a video must not
start answering it.

`MenuNav.panel()` returns null while it plays. The trailer is deliberately not
in `PANELS` — a pad must not be able to walk a cursor onto CLOSE and press it
with `jump` — but falling through to the title screen underneath is worse than
either, because there *every button confirms* and a kid mashing through the
trailer would start the game behind it.

**It degrades.** A missing or blocked file gets a sentence in plain English and
the download button, the panel stays up rather than vanishing (a refusal must
say so — sixth non-negotiable), and whatever was waiting on the trailer still
happens. A trailer that fails must never be a game that will not start.

`world-check` pins the four things here that are invisible when broken: no
`src`, `preload="none"`, `playsinline`, and that the one-time offer is recorded
when she *chooses* rather than when the video ends.

## The eight orbs shot is the game's data

Shot 12 is the one place a generated image had to be *correct* rather than
merely pretty: eight orbs, in the order of `ORBS` in
[powerorb.js](../../src/entities/powerorb.js), each with its own kanji and its
own colour — 疾 cyan, 斬 violet, 剛 green, 跳 yellow, 壁 pale blue, 落 orange,
十 pink, 突 gold. The plan was to draw the kanji on afterwards with ffmpeg if
the model garbled them, on house rule 8 — measure, don't reason. It did not
garble them, but check that frame against the table before reusing it anywhere.
