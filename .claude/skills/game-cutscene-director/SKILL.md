---
name: game-cutscene-director
description: Direct in-engine cutscenes, camera moves and recorded gameplay (GIFs, trailers, help clips) the way a film director would, and verify each shot by measuring it rather than guessing. Use this skill whenever the work touches a cutscene, cinematic, intro or ending; camera angles, framing, zooms, pans, dollies or shot lists; dialogue, narration, voice lines, subtitles or timing to spoken words; triggered or scripted animations; story beats, character moments or world-building shown on screen; or recording a GIF, video clip or screenshot sequence out of a running game. It applies in any engine (three.js, Unity, Unreal, Godot) and whether or not the user says "cutscene" — for example "the camera cuts off the players", "zoom out a bit so we can see the gate", "start the shake when she says X", "record a clip of the double jump", or "the characters flicker in this scene".
---

# Game Cutscene Director

A cutscene is directed, not coded. The user is the director and watches the
result; you are the crew, and you build, measure and propose. Almost every
expensive mistake in this kind of work came from one of three habits:

- **reasoning** about what the camera will see instead of **measuring** it;
- fixing the symptom the user **named** instead of the cause that was actually
  there;
- letting a scoring function or a clever idea **override the brief**.

This file is the workflow. Detail lives in `references/`, and each section says
when to read which file:

| file | read it when |
| --- | --- |
| `references/camera-and-framing.md` | choosing, changing or checking any camera shot |
| `references/failures.md` | before changing a shot the user rejected, and whenever a report sounds simple |
| `references/recording-gifs.md` | recording frames, GIFs or video out of a running game |
| `references/collaboration.md` | writing or revising a script, dialogue, shot list or beat sheet with the user |
| `references/katana-kitties.md` | working in the Katana Kitties repo, or wanting a worked example of a data-driven shot list |

---

## 1. Before the project: settle the story, then the shot list

Do not open the camera code first. A shot only makes sense once you know what it
is *for*.

1. **Get the script in words first.** Every beat is one of these: a line of
   dialogue or narration, what the audience must see during it, and what it has
   to make them feel or learn. If the user is still writing, brainstorm with them
   (see `collaboration.md`). Offer two or three concrete options, each with its
   trade-off; the user chooses.
2. **Lock text separately from timing.** Once the user signs off dialogue or
   on-screen text, it is frozen. Timings, cuts and cameras can still change;
   words change only when the user asks. Say this back to the user, so a timing
   fix can never quietly reword a line.
3. **Measure the audio before you time anything.** Real voice clips are longer
   than an authored placeholder duration, often by 50–100%. Cue shots to a
   *word* (a phrase in the line, or a timestamp measured with silence detection),
   not to a number of seconds. A word-keyed cue survives a line being re-recorded.
4. **Write the shot list as data.** Use one row per shot: which beat, which word
   it starts on, what it looks at (a named mark resolved from the world, never a
   typed coordinate), bearing, distance, height, aim offset, and how it moves.
   Add non-cutting rows that only fire events ("keep" rows). A table can be
   diffed, checked and discussed; camera code scattered across update loops
   cannot.
5. **Name what every shot is for, in one sentence**, e.g. "the four players are
   visible running toward us from the far end of the road to the gate". That
   sentence becomes the check in step 3.5.
6. **Decide the capture surface early.** Will it play live, be recorded to a
   GIF, or both? Which window size is the worst case? What covers the bottom of
   the frame (subtitles, HUD, touch controls)? Those set the usable part of the
   frame before any angle is chosen.

## 2. During: the direction loop

Run this loop for every shot and for every piece of feedback:

1. **Restate the brief as an intent**: who moves toward whom, and what must stay
   in view. If the user gave a reference ("like the first camera we had") or a
   screenshot, that is the intent. Recover the reference's exact numbers (from
   git history if needed) before touching anything.
2. **Find the real cause.** Reports describe symptoms. "Time looks frozen" was a
   rotation bug that left props half-fallen. "They flicker during the shake" was
   two transparent objects sharing a depth. "Zoom in strangely" was a push that
   was secretly a crane. Measure first; `failures.md` has the catalogue.
3. **Record once, then search.** Play the scene one time and save the
   world-space positions of everything that matters, several times a second.
   Then evaluate candidate cameras analytically against that recording through
   the scene's real projection. Re-running the scene for every candidate is far
   too slow, and "N units away" never predicted what the screen showed.
4. **Score in screen space (NDC), inside the intent.** Measure: the subject is in
   frame; the action's median is near the centre; nothing important sits under
   the subtitle or HUD band at the worst-case window size; sight lines are clear
   of occluders. A search that scores only the frame *will* game the brief. It
   picked a three-quarter view, then a camera pinned to the ground, and both
   passed every number. Keep the bearing and move from the brief; let the
   numbers choose only the free parameters.
5. **Screenshot the winner at the key moments** (start, middle, end, and at each
   cue) and look at it. If it isn't what the brief asked for, the scorer is
   wrong, not the brief.
6. **Write the check that asks what the shot is for.** Replay the recording
   through the final lens and assert the purpose, e.g. "players in frame ≥ 97%
   of sightings, heads above the subtitles ≥ 90%". Also assert that every word
   cue resolves to its real word and none silently fell back to zero. The next
   pass then cannot undo this one without failing.
7. **Report measured numbers, not adjectives.** "In frame 86% → 100% of 238
   sightings" lets the director decide. "Looks better now" does not.

### Camera rules that have been learned the hard way

- **Once an angle is liked, leave the angle alone. Zoom with distance.** Moving
  the camera back along its own ray changes size and nothing else. Changing the
  pitch "to fit more in" tips the far side of the scene out of the frame. Keep
  height proportional to distance, and keep the aim offset as a fraction of the
  frame height.
- **Aim at the action, not at the prop the action stands on.** Characters, jumps
  and effects rise above their floor, so a lens centred on the floor puts the
  action at the top edge.
- **Express aim offsets as a fraction of the frame, not in world units.** A
  unit offset is right at one distance and wrong three seconds into a push.
- **A push-in that shrinks only distance is a crane.** It gets closer *and*
  steeper. Scale height with distance when you mean a dolly.
- **Score the whole move, not its midpoint.** A clear bearing at the middle can
  swing into a wall by the end.
- **Hide a cut by pushing into the next shot's first frame** when both shots
  look at the same place. Use a real fade-to-black only when the location
  changes, and never over a word the audience must hear.
- **Small swings near the lens.** A landmark close to the camera crosses the
  frame quickly.

`camera-and-framing.md` has the maths, the scorer and the occlusion model.

### Animation and staging rules

- **Trigger on state or place, not on elapsed time.** Key abilities and moves
  to a fraction of a path, with a minimum gap between them, rather than to
  free-running random timers. Two moves overlapping should be impossible to
  express.
- **Give a fast event a hold the eye can catch.** A 0.09 s dive reads as a
  teleport. Add a hang at the apex.
- **Pin effects to where they happened** (the plank that was hit), not to the
  character who moves on.
- **Figures in a cutscene are the cutscene's own actors**, not the live player
  objects. Build billboards or rigs the scene owns, and delete them on finish.
  The exception is a system whose truth matters, such as a diagram that must
  read the real simulation; drive the real system rather than a prettier copy.
- **Characters in a talking two-shot stand on marks.** No framing rule can
  compose an arbitrary arrangement of bodies. Move them during a fade, and move
  what is drawn as well as the logical position.
- **Crowds are seeded.** If a town changes between showings, the director
  cannot give notes on it.
- **Something flickers only while things move?** Look for two transparent
  things at the same sort depth (a shared origin) before touching the motion.
  Use explicit render-order bands.
- **Staggered sounds need staggering among what is on screen**, not across the
  whole world; loudness should sit under the voice.

### Every scene degrades and restores

- Skipping must leave the world exactly as it was, or exactly as the story
  decided on acceptance, never half-way. Check it by skipping at several times.
- Every named mark falls back to something framable when the world lacks it. A
  camera aimed at `NaN` stops the story.
- State changes happen when the scene is accepted or started, never when it
  "finishes" playing.

## 3. Toward the end: lock, prove, write it down

1. **Watch it end to end at real speed with real audio** and screenshot every
   cue. Most timing bugs only exist with real clip lengths.
2. **Run the full check suite** and the build. Report counts and the specific
   measured numbers that changed.
3. **Write the pass up** in the project's design notes: every note from the
   user, quoted; the real cause; what changed; and what was tried and failed,
   with its number. The next session's first question is "why is this camera
   here?", and the answer has to exist.
4. **Keep a running "what not to do again"** in comments beside the shot row
   itself. A reverted angle with no comment gets re-tried.
5. **Offer, don't assume, the expensive follow-ups**: new art (a dedicated pose
   instead of reusing one), new voice lines, re-recording clips. Preflight the
   cost.

## Working with the director

- Treat every note as a symptom report from someone watching. Reproduce it at
  the exact moment they describe before theorising.
- When a note has two readings, measure whether the first is possible before
  building the second, and say what you measured ("the nearest bamboo is 30
  units from any barrel, so one frame can't hold all three").
- Quote their words beside the change in comments and notes. It pins intent
  better than a paraphrase.
- Rejected work is data. Write down why it was rejected, next to the row.
- Screenshots in chat are proof; paste the numbers with them.

## Keeping this skill current

This skill was written from real review passes and is meant to keep growing.
At the end of any pass that taught something new:

- Add the lesson to `references/failures.md` as symptom → assumed → measured
  → lesson. Add a new rule to the workflow above only when it applies beyond
  the one scene.
- Put project-specific facts (file names, harness code, house rules) in that
  project's reference file, not in this one.
- If the skill lives in a repo **and** in `~/.claude/skills/`, edit the repo
  copy, then copy it over the user-level one so other projects get the lesson.
- Keep this file under about 500 lines, and move detail into `references/`.
