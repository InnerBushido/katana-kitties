# The cutscene review page — `/review.html`

**How Richard tells a session what to change in a cutscene, to the word.**
Before this, notes were typed against a video player that shows whole seconds
and were lined up with the script by guesswork. Richard, Oct 2026: *"I should
just be able to record a video and upload it to the tool ... you can just look
at the timestamps of the comments and take a snapshot there and know roughly
where the change needs to occur in the cutscene"*.

`npm run dev`, then **`/review.html`**. Dev only, the same two ways as
`/tuning.html`: not a build input, and every route is a `configureServer` hook.

## Using it

1. Pick the scene, then a recording. Anything under `Design Ideas/` or
   `out/review/` is listed; **Open file…** or a drop takes one from anywhere
   (its notes are then kept by file name).
2. The page syncs itself to the voice (a few seconds; the status says when).
   From then on the readout under the video says, for the playhead: **which
   line, which word, how far into the voice, which cut and shot, which of the
   actor's cues**.
3. `M` drops a note at the playhead. `I`/`O` make it a range, `B` draws a box
   on the picture, `1`–`7` tag it. Notes save themselves 700ms after a change.

Keys: `Space` play · `,` `.` one frame · `←` `→` 0.1s (`Shift` 1s) · `↑` `↓`
previous/next line · `[` `]` previous/next cut · `Esc` back to the video.
Timeline: wheel zooms, drag scrubs, drag a line's left edge to nudge its sync
by hand.

## What a session reads

`docs/reviews/<scene>/<video-stem>.json`, one per recording, written to be
read: a head, then **one anchor per line** (where the sync found each voice
line in this video) and **one note per line**. A note carries its video time
AND `at: { line, lt, word, cut, shot, act }` — the place in the SCENE — so a
session does not need the video to act on it. A box is `[x0, y0, x1, y1]` in
fractions of the picture.

**A saved note keeps its `at`.** Opening a recording again syncs it again but
leaves every note's `at`, and every anchor nudged by hand, alone: the note was
written about what was on the screen then. The **Re-sync to voice** button is
the one thing that redoes both.

## Why it syncs on the voice, not on start/end handles

The first proposal was two handles: drag "scene starts here" and "scene ends
here" and stretch the timeline between them. It was turned down for this: a
recording of a live game drifts — a hitch, a frame-rate dip, a line that waits
on a load — and two handles spread the error across the whole scene. Every
voice line, found where it actually plays, is thirteen handles that cannot
drift, placed by the computer.

`src/review/sync.js`: both sides at 16kHz mono, 20 log bands from 150Hz to
5kHz in dB on a 10ms hop, each band centred, then correlated — coarse at 40ms
over the whole recording keeping the four best peaks per line, a dynamic
programme to pick one per line in order without overlaps, and a 10ms refine.
The real recording (124s, music under her): all 13 lines found at 0.858–0.929,
browser and node agreeing to the sample. The best FALSE match — the same voice,
a line not in the video — was 0.623, which is why `MIN_SCORE` is 0.7 and not
the 0.4 it started at.

## When a line is re-recorded

Richard asked this before it was built: *"if the dialog changes and the timings
change for the voice, will that cause major issues?"* Three things handle it:

- **The sync reports a line it cannot find as missing** rather than matching it
  somewhere wrong, and places it in the gap its neighbours leave (`fillGaps`).
  An old video of a scene with a new line still syncs on the other twelve.
- **The words are measured, not typed.** `python tools/capture/voice-words.py
  payne_intro` runs faster-whisper (large-v3, on the CPU — the CUDA build is
  missing cublas here) over every line whose mp3's sha1 changed, and writes
  `src/voicewords.json`. `world-check` fails when a shipped mp3 no longer
  matches its sha1 there, and its message is the command to run.
- **The script is the truth for the words, whisper only for their times.**
  `lineWords` lays both along their letters, so whisper hearing
  "Word-spirits" as "verd spirits" or dropping line 11's "And" moves times
  inside one word, not every word after it.

What is NOT automatic yet: a cut or an actor's cue in `payneintro.js` is still
a number of seconds. When line 12 is re-recorded its cuts must be re-cued by
hand (the page shows exactly where the words now fall). Keying them to words
off `voicewords.json` is the next step.

## Whisper's quirks, measured

- **Starts run early: a pause is folded into the word after it.** Line 11's
  "...Second" came back as 2.60s, in the silence; it is said at 3.46.
  `voice-words.py` moves a start past any quiet run of ≥0.12s (10ms RMS under
  -32dBFS) inside the word. The first rule tried — only quiet IN FRONT of the
  word — missed exactly this case, because the tail of "was" is loud for the
  word's first frames. Idempotent, so it runs over every line every time.
- **silencedetect is fooled by a single noisy sample.** It ends line 12's pause
  before "Out" at 2.59; the RMS is under -36dB until 2.77 and the word is -14dB
  at 2.78. Hence RMS frames, not samples.
- **It mishears**: "worlds" as "walls", "they're" as "they are". Harmless —
  only the times are used.

## Notes on the intro this turned up

- Line 12's "Out there" cut is at 2.28, whisper's RAW start: half a second
  before "Out" is heard (2.78). Left alone — a cut ahead of its word can be a
  choice — but it is the kind of thing this page is for.
- Line 11 may really be missing its opening "And": whisper does not hear it.
  Worth a listen.

## Adding a scene

One entry in `src/review/scenes.js` mapping the scene's own tables to
`{ id, title, lines: [{ id, text, voice, len, cuts, acts }] }`, times from the
start of each line's voice. A recording of an unlisted scene is still
reviewable; its notes are kept on the video's own clock.
