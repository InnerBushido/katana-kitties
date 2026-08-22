/**
 * The trailer's narration. This is the script, the cast, and the clock.
 *
 *   node tools/trailer-vo.mjs           # print the lines and their slots
 *   node tools/trailer-vo.mjs --check   # do the rendered takes fit their
 *                                       # slots, and are the reused ones
 *                                       # still the archived takes?
 *
 * The takes are generated through Higgsfield's `text2speech_v2` with
 * `variant: 'elevenlabs'`, ~0.15 credits a line, and land in
 * `out/trailer/vo/NN.wav` (48kHz mono) - except the six marked `reuse`, which
 * are copied out of `out/trailer/vo-desmond/` and cost nothing. `tools/trailer-score.mjs` imports
 * LINES from here and mixes them into the score, so this file is the single
 * place a line, a time or a voice is edited.
 *
 * THERE ARE TWO NARRATORS AND THE HANDOVER IS THE JOKE. A straight trailer
 * voice is doing this trailer, and Mr. Satan has grabbed his microphone —
 * which is what "AHEM! Is this thing on?" is, and it only reads that way
 * because somebody else is clearly meant to be holding it. He hypes the world
 * for three shots, the real narrator gets the mic back for the pets, the
 * dragons and the Dojo, Mr. Satan barges back in the moment the arena appears
 * because it is HIS tournament, and the narrator reclaims it for the sign-off.
 *
 * WHICH IS ALSO WHY THE MIDDLE IS NOT HIS. Shots 4 to 8 are the part where the
 * trailer has to say what the game actually is, and two of them are the maths
 * — the Dojo of the Turning Circle and the Kotodama Orb, the first
 * non-negotiable, the reason the whole thing exists. Mr. Satan cannot sell a
 * maths lesson: everything he says is a boast, and a boast about sine and
 * cosine is a joke at the expense of the one part of this that is not a joke.
 * The earlier all-Satan cut had him saying "Sine. Cosine. You BECOME the
 * point." and it sounded like he was selling a timeshare.
 *
 * AND THE LAST LINE IS FUNNIER FROM THE STRAIGHT VOICE. "Play free, right
 * meow" out of Mr. Satan is a clown telling a joke. Out of a solemn film-
 * trailer narrator who has kept a straight face for sixty-eight seconds, it is
 * a man who has just realised what he agreed to read.
 *
 * MR. SATAN IS HARRISON, BECAUSE THAT IS WHO HE IS IN THE GAME — the same
 * preset as all eighteen `public/voice/sat_*.mp3`. A trailer whose boss does
 * not sound like the game's boss is a trailer for a different game. He is
 * written the way he talks, too: AHEM, capitals on the word he leans on, "hoo
 * hoo hoo", and his tournament called by its full name. See
 * docs/notes/voices.md, which is the registry for the whole cast.
 *
 * DUSKCOAT SPEAKS ONCE, AND IT IS THE FUNNIEST MOMENT IN THE PIECE. The Cross
 * Slash lands on Mr. Satan one second after he calls himself the greatest
 * champion of all time, and the reaction is a second voice — a cat, from the
 * game's own cast — rather than him narrating his own defeat. A brag can only
 * be punctured from outside.
 *
 * AND THEN SOMETHING ANSWERS HER. Duskcoat asks what that was; a small evil
 * kitten laughs, and the trailer moves on without explaining. It is three
 * seconds of a voice that belongs to nothing in the game, which is exactly the
 * point — a secret boss is only funny while it stays a rumour, and the moment
 * it has a name and a health bar it is content. If it ever gets built, this is
 * the sound it already made.
 *
 * HARRISON IS SLOWER THAN DESMOND AND HIS LINES ARE SHORTER FOR IT. Measured
 * off his existing clips: 2.4-2.6 words a second including his pauses, against
 * Desmond's 3.5-4, against shots that are five seconds long. That difference
 * is per-voice, not per-line, so a line moved from one of them to the other
 * has to be re-fitted rather than re-pointed. `--check` is what enforces it.
 */

/**
 * Who speaks, and the ElevenLabs preset behind them. Higgsfield voice ids.
 *
 * THESE MUST MATCH docs/notes/voices.md, which is the registry for the whole
 * game — the shrine scenes, the intro, the announcer and this file all cast
 * from the same table, and a character who changes voice between the trailer
 * and the game reads as two characters.
 */
export const CAST = {
  satan: {
    name: 'Mr. Satan', voice: 'Harrison',
    voice_id: '573e5163-59b3-4926-aab1-951ef2985f81',
  },
  /* THE TRAILER'S OWN VOICE, and the only member of this cast who is not in
     the game. He was cast by measurement in the first pass (see
     docs/notes/trailer.md for the table) for a narrator who did not exist
     yet — and now he does, because the piece finally has somebody for Mr.
     Satan to interrupt. His takes are that first cut's, unchanged; they are
     archived, un-mixed, in out/trailer/vo-desmond/, and the LINES that use
     them carry a `reuse` field naming the file. */
  narrator: {
    name: 'the trailer voice', voice: 'Desmond',
    voice_id: '563f728c-e249-5a85-97ab-8461e8c09da6',
  },
  duskcoat: {
    name: 'Duskcoat', voice: 'Vesper',
    voice_id: 'c3204739-4084-41a3-9dc5-c805b307ec18',
  },
  /* DELIBERATELY UNNAMED. See the header: it is a noise, not a character, and
     naming it in the cast would be the joke explaining itself. */
  gremlin: {
    name: '(the thing in the dark)', voice: 'a real kitten',
    voice_id: 'tools/kitten-cackle.mjs',
  },
};

/**
 * `at` is when the line STARTS, in trailer seconds. Shot N runs from
 * (slot-1)*5 to slot*5; the title card is 60-68. Lines start a beat after
 * their cut so the picture reads first.
 *
 * `who` keys into CAST. `duck` is how far the music drops under the line,
 * 0..1. The Dojo lines do not duck at all — the music there is already the
 * quietest thing in the game and pulling it down further leaves a voice
 * talking over nothing.
 *
 * `reuse` means the take was NOT generated for this cut: it is copied, byte
 * for byte, out of the named archive. `--check` compares them, because these
 * six are the only thing keeping the piece from collapsing back to one
 * narrator and nothing else on disk can tell them apart.
 */
export const LINES = [
  /* He interrupts. There is no point writing this line for a voice that was
     going to speak anyway. */
  { id: 1, at: 0.8, who: 'satan', duck: 0.45, shot: 'islands', text: 'AHEM! Is this thing on? Listen up, KITTENS!' },
  { id: 2, at: 5.6, who: 'satan', duck: 0.45, shot: 'the cliff', text: "There's a whole WORLD up here! Hoo hoo hoo!" },
  /* "In it" reaches back to line 2's "world", which is why line 2 has to keep
     the word. It read "Everything up here falls over" for one cut, against a
     line 2 that also said "up here", and ended with a laugh directly after
     line 2's laugh — the echo was audible before the words were. */
  { id: 3, at: 10.5, who: 'satan', duck: 0.5, shot: 'mischief', text: 'And every single thing in it... FALLS OVER!' },
  /* --- the narrator has the microphone back ------------------------------ */
  { id: 4, at: 15.6, who: 'narrator', duck: 0.5, shot: 'the pets', reuse: '04.wav', text: 'Ride the panda. Ride the rabbit. Ride ANYTHING!' },
  { id: 5, at: 20.7, who: 'narrator', duck: 0.5, shot: 'the dragon', reuse: '05.wav', text: 'Ride... the DRAGON?!' },
  /* The drop-out. The music goes quiet here because there is a maths lesson on
     screen, which is the whole reason the Dojo theme is the quietest piece in
     the game. Same instinct, one layer up — and the same reason these two
     lines are the narrator's and not the braggart's. */
  { id: 6, at: 25.9, who: 'narrator', duck: 0.0, shot: 'the dojo', reuse: '06.wav', text: '...and then, there is the Dojo.' },
  { id: 7, at: 30.4, who: 'narrator', duck: 0.0, shot: 'the orb', reuse: '07.wav', text: "Sine. Cosine. You don't learn the circle. You BECOME the point." },
  { id: 8, at: 35.8, who: 'narrator', duck: 0.15, shot: 'the eight orbs', reuse: '08.wav', text: 'Eight orbs. Eight powers. Choose.' },
  /* --- and Mr. Satan takes it straight back, because this bit is his ------ */
  { id: 9, at: 40.6, who: 'satan', duck: 0.55, shot: 'the arena', text: 'Four kittens! Battling in the WORLD MARTIAL ARTS TOURNAMENT!' },
  { id: 10, at: 45.4, who: 'satan', duck: 0.55, shot: 'Mr. Satan', text: 'And ME! The greatest champion of ALL TIME!' },
  /* Not him. See the header — the brag is punctured from outside. */
  { id: 11, at: 50.4, who: 'duskcoat', duck: 0.5, shot: 'the cross slash', text: '...wait. What was THAT?!' },
  /* Nobody answers her. See the header. */
  /* NOT SPEECH AT ALL. See tools/kitten-cackle.mjs: it is the last and most
     slowed-down burst of a real kitten's meow, cut out of the reference clip
     by energy. Three engineered versions of this beat were built and rejected
     — an ElevenLabs voice going "mrrrow, hee hee hee" and two passes of
     synthesis — because the joke is not the shape of the sound, it is that an
     actual animal made it. `text` says what it IS, so this table still reads
     as a script; there are no words in the file. The rejected takes are kept
     beside it as out/trailer/vo/12-elevenlabs.wav.
     3.35s, which is why line 13 moved back to 56.2. */
  { id: 12, at: 52.3, who: 'gremlin', duck: 0.6, shot: 'the cross slash', text: '(a real kitten, slowed until it is a demon)' },
  { id: 13, at: 56.2, who: 'satan', duck: 0.5, shot: 'the four leaders', text: 'Hmph! Fine. The SECOND greatest.' },
  /* THE SIGN-OFF IS THE STRAIGHT VOICE AND THAT IS THE WHOLE JOKE. Sixty-eight
     seconds of solemn film-trailer narration, and then he has to say "right
     meow". Mr. Satan saying it is a clown telling a joke; this is a man
     hearing what he just read. */
  { id: 14, at: 61.2, who: 'narrator', duck: 0.45, shot: 'the title card', reuse: '13.wav', text: 'KATANA KITTIES! Play free, right meow.' },
];

/* ------------------------------------------------------------------------ */
if (process.argv[1] && process.argv[1].endsWith('trailer-vo.mjs')) {
  const check = process.argv.includes('--check');
  if (!check) {
    for (const [k, c] of Object.entries(CAST)) {
      console.log(`${k.padEnd(9)} ${c.name.padEnd(22)} ${c.voice.padEnd(9)} ${c.voice_id}`);
    }
    console.log('');
    for (const l of LINES) {
      console.log(`${String(l.id).padStart(2)}  ${l.at.toFixed(1).padStart(5)}s  ${l.who.padEnd(9)} ${l.shot.padEnd(17)} ${l.text}`);
    }
    console.log(`\n${LINES.length} lines`);
  } else {
    /* TWO THINGS, AND THE SECOND ONE IS THE NEW ONE.
     *
     * Does each take fit before the next one starts? A take that overruns does
     * not sound like a long line, it sounds like two people talking over each
     * other. This is what catches a recast: a voice can be half a second
     * slower on every line and nothing else in the pipeline notices.
     *
     * AND IS EACH REUSED TAKE STILL THE ARCHIVED ONE? Six of these files are
     * the previous cut's narrator, copied in rather than generated, and they
     * are the entire two-narrator structure. A helpful script that regenerates
     * "all the lines" from CAST.satan would collapse the piece back to one
     * voice, every file would still be the right length, and nobody would find
     * out until they watched it.
     *
     * MEASURING THE PITCH WAS THE OBVIOUS ANSWER AND IT DOES NOT WORK. Harrison
     * is 128Hz and Desmond 148 on their previews - three semitones, which
     * autocorrelation separates easily. Across the rendered lines Harrison's
     * own takes measure 104, 133, 137, 148, 206 and 240Hz, because a laugh is
     * an octave up and a growled "hmph" is an octave down. The median of one
     * three-second line is a delivery choice, not a voice, and the two
     * narrators' numbers interleave completely. See tools/voice-measure.mjs.
     *
     * So the question changed instead of the tolerance: these takes were not
     * generated, they were COPIED, so the check is that they are still the
     * bytes they were copied from. Exact, no false alarms, and it can name the
     * one command that puts it back. */
    const { statSync, existsSync, readFileSync } = await import('node:fs');
    let bad = 0;
    for (let i = 0; i < LINES.length; i++) {
      const l = LINES[i];
      const f = `out/trailer/vo/${String(l.id).padStart(2, '0')}.wav`;
      if (!existsSync(f)) { console.log(`${l.id}: MISSING ${f}`); bad++; continue; }
      /* 48kHz mono 16-bit, 44-byte header. */
      const secs = (statSync(f).size - 44) / (48000 * 2);
      const next = LINES[i + 1] ? LINES[i + 1].at : 68;
      const room = next - l.at;
      const fits = secs <= room - 0.15;
      if (!fits) bad++;

      let note = `  ${CAST[l.who].voice}`;
      if (l.reuse) {
        const src = `out/trailer/vo-desmond/${l.reuse}`;
        const same = existsSync(src) && readFileSync(src).equals(readFileSync(f));
        if (!same) {
          bad++;
          note = `  REGENERATED — line ${l.id} must be the archived ${CAST[l.who].voice} take.`
            + `  cp ${src} ${f}`;
        } else {
          note += ` (reused, = ${src})`;
        }
      }

      console.log(
        `${String(l.id).padStart(2)}  ${secs.toFixed(2)}s in ${room.toFixed(2)}s  ${fits ? 'ok' : 'OVERRUNS'}${note}`,
      );
    }
    console.log(bad
      ? `
${bad} problem(s)`
      : `
all lines fit, and all ${LINES.filter((l) => l.reuse).length} reused takes are the archived ones`);
    if (bad) process.exit(1);
  }
}
