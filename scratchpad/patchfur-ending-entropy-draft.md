# Patchfur's ending — the entropy draft

**Read this before anything is generated.** Nothing has been recorded. The four
`public/voice/done1–4.mp3` files in the game are still the old take, and
`SCRIPTS.finale` in [summonscene.js](../src/systems/summonscene.js) still holds
the old text. This file is the proposal.

- **Voice:** Patchfur = **Mabel**, `fa64fba4-ad02-405e-99d0-1f085d87c706`. Pinned
  in [voices.md](../docs/notes/voices.md) and not negotiable — she already has
  eleven lines in this game and a different preset makes her a different cat.
- **Four lines, same ids, same slots.** `done1`–`done4`, so nothing downstream
  changes: the beat timings, the camera, `BEAT_ACTS`' gestures and the tide's
  wave are all keyed off the beat index, not the words.
- **Durations must stay close to the old ones** (7.5 / 8.5 / 8.5 / 9.0 s). The
  tide's rise is 6 seconds and its fall 4.2, deliberately shorter than a line,
  so the wave travels *under* what she is saying. A line that came back three
  seconds short would put the archipelago on its feet in silence.

---

## What the scene now shows behind her

| beat | the world |
| --- | --- |
| 1 | the archipelago exactly as the girls left it — everything on its side |
| 2 | every barrel, lantern and cane **stands back up**, in a wave from the far island inwards |
| 3 | it holds. One tidy arrangement. |
| 4 | and it all goes over again, landing in exactly the pose it was in |

So each line has something to be *about*, and the last line has to arrive on the
same breath as the world going over. That is the whole reason for the rewrite.

---

## The draft

### done1 — 7.5s — *the world is on its side behind her*

> Every barrel. Every lantern. Every last cane of bamboo. There is nothing left
> standing on any of these islands that you two have not put your paws through.

**Unchanged.** It was already the right line for the picture, and the picture is
now literally it. No reason to spend a generation on it — but it is listed here
so the set is read as four.

### done2 — ~8.5s — *the world stands back up*

> Look at it the way it was. One tidy arrangement — and the elders spent their
> whole lives keeping it in that one. They called what you did mischief. It is
> simpler than that. There is only ever one way for a town to be tidy, and there
> are more ways for it to be untidy than there are stars over it.

### done3 — ~9s — *it holds, tidy, and she names what was inside it* — **the new idea**

> And in every one of those standing things, a little of that was waiting. All
> that leaning-over. All that wanting-to-fall. The elders had a word for it too,
> and the word was Kotodama — and they thought it had gone out of the world.
> It had not. It was inside the furniture, waiting for somebody rude enough.

### done4 — ~9s — *and the whole world goes over again*

> You woke it. Every crate you knocked over let a little more of it out, until
> it was loose in the air over every island, and that is what you have been
> picking up all afternoon. So take it. Knock it down again tomorrow. And when
> you would rather test it on each other than on the furniture — the arena is
> open.

---

## Why it is written this way

**The maths is still in it, and it is still the real maths.** The second law is
"one ordered arrangement, an enormous number of disordered ones", and that is
what `done2` says in a sentence a nine-year-old can hear. It does *not* say
entropy, because the word buys nothing and costs a nine-year-old the line.

**"Kotodama" is the pivot** and it is only said once, in `done3`, at the moment
the world is standing tidily and she is talking about what is hiding inside it.
The orbs are already called Kotodama everywhere in the game; the ending is the
first time anybody says what one *is*.

**The last line is where the game's verbs come back.** "Take it. Knock it down
again tomorrow." That is the same "so stay, fly, knock it all down again" the
old `done4` ended on — the ending should still hand them the world back rather
than closing it — and the arena invitation is still the last thing said, because
it is the thing that happens next.

**What is dropped:** the bridge sentence. *"An angle, a circle, and the nerve to
jump — that is all a bridge has ever been."* That is the best line in the old
script and it has nowhere left to stand: the figure it was written against was
the unit circle drawn behind her, and that drawing is gone. **It should be
rehomed rather than binned** — the obvious place is Ryuuseki's summon, where
somebody has just crossed the whole archipelago; ask me and I will draft it in.

---

## If this is approved

1. Replace `text:` on `done2`/`done3`/`done4` in `SCRIPTS.finale`.
2. Generate three lines through Higgsfield → ElevenLabs **Mabel**, that exact id,
   into `public/voice/done2.mp3`, `done3.mp3`, `done4.mp3` (`done1` untouched).
3. Measure each take and set `dur:` to what came back, rounded up; a `dur`
   shorter than the audio cuts her off.
4. `node tools/world-check.mjs` — the cutscene checks read those durations.
