# Collaborating on the script, the beats and the notes

## Brainstorming a story or scene

1. **Start from what the scene must change.** What does the player know, feel or
   own after it that they didn't before? One sentence.
2. **Pull from the world that exists.** Name places, objects and characters the
   player has already touched. An ending that points the camera at the barrel
   they knocked over lands harder than a new set piece.
3. **Offer 2–3 shaped options**, each with a line of sample dialogue, the key
   image, and its cost (new art, new voice, new systems). The user picks or
   mixes.
4. **Keep the audience in the room.** For young players: short lines, concrete
   images, a clear "you did this". Every beat needs something to look at while
   it is spoken.
5. **Respect authored material.** If characters, art or names came from someone
   (in Katana Kitties, the kids), extend them faithfully and don't redesign.

## Writing the beat sheet

For each line: **text** | **speaker/voice** | **what is on screen** | **cue
words** | **what it's for**.

- Put camera cuts on meaningful words (a list of three items gets three shots on
  three words).
- Before designing around a reading, check it's physically possible. "All three
  items in one frame" was measured as impossible, because furniture stands in
  towns and bamboo grows in groves.
- Mark which lines are **locked text**. After sign-off, timing work must never
  touch those strings. Say so explicitly when you change runs, cues or durations
  near them.
- Voice: read the project's voice registry before generating a line (one
  preset per character, pinned by id). Measure the generated clip; don't assume
  its length.

## Taking notes from a watch-through

- Expect batches ("six things from the last two lines"). Make one entry per
  note, each with its own measured cause. In one batch, five of six causes
  differed from the guess in the report.
- **Quote the note verbatim** in the commit, the design doc and the code comment
  beside the change.
- If the note offers fixes ("we can either X or Y"), check whether the real
  cause makes both unnecessary. The tree in the road needed neither.
- If a note references an earlier version ("like the first camera"), get the
  exact numbers from version control and reuse them.
- If a previous fix was rejected, say plainly that the earlier diagnosis was
  wrong, and why.
- Numbers the user gives ("2–3× larger", "delay by 2 s", "half energy") are
  specs; implement them exactly and check them.

## Reporting back

- Lead with what changed on screen, then the measured before → after numbers,
  then check counts and build status.
- Include screenshots at the moments the notes referred to.
- Name anything reused as a stand-in (for example, an existing pose used as the
  "scared" pose) and offer the proper asset with its cost.
- Keep the process rules: typed branches, local merges, no pushes to the main
  remote until the user says so, and publishing only when asked.

## Across a multi-pass project

- Keep one design note with a section per pass: the notes, the causes, the
  changes, and what failed.
- Keep the method section at the end of that note and update it each pass; it is
  where this skill came from.
- Keep a "do not do again" comment on the shot row itself.
- Every fix adds the check that would have caught it. The suite is how pass 6
  avoids re-breaking pass 3.
