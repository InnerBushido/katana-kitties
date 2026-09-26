/* ---------------------------------------------------------------------------
   Sound.

   Every sound in this game is SYNTHESISED at runtime from oscillators and
   noise. No audio files, nothing to download, nothing to licence, no asset
   pipeline, and the whole thing costs a few kilobytes of source. For a game
   made of flat colours and hand-drawn cats that's not a compromise — chiptune
   blips suit it better than recorded foley would.

   The music is generated the same way: a slow koto-ish pluck wandering a
   Japanese pentatonic scale over a drone, scheduled a bar ahead. It never
   loops exactly, so it doesn't get tiresome the way an 8-second sample would.

   Browsers refuse to start audio without a user gesture, so nothing exists
   until resume() is called from a real click or button press.
--------------------------------------------------------------------------- */

/* Hirajoshi — the scale that makes five notes sound unmistakably Japanese.
   Semitone offsets from the root. */
const HIRAJOSHI = [0, 2, 3, 7, 8];
/* D3. Exported because `tools/trailer-score.mjs` renders the trailer's music
   from THIS table rather than a transcription of it — a second copy of the
   tuning is the kind of thing that drifts silently and then the trailer is
   in a different key from the game. */
export const ROOT = 146.83; // D3

/* Insen — the same five-note idea a fourth darker. It shares only the root
   and the fifth with hirajoshi, which is why the intro reads as a different
   PIECE rather than the same tune played slowly: the minor second at the
   bottom is doing all the work. */
const INSEN = [0, 1, 5, 7, 10];

/* Three more Japanese pentatonics, because seven islands need seven pieces and
   tempo alone will not do it — two tunes in the same scale at different speeds
   are the same tune. Each of these has a different interval doing the work:

     KUMOI  a major second over a minor third: bright but not sweet
     IWATO  two minor seconds: the darkest of the five, genuinely uneasy
     YO     no semitones at all, so nothing in it can sound sad             */
const KUMOI = [0, 2, 3, 7, 9];
const IWATO = [0, 1, 5, 6, 10];
const YO = [0, 2, 5, 7, 9];

/**
 * The two things the music can be doing. Slower, lower and sparser is what
 * makes the intro feel like a story being told rather than a level being
 * played, and it hands over to the normal theme the moment the cutscene ends.
 */
/* Ryuuseki's theme. The koto is still a koto and the root is still D, so it
   belongs to the same game — but everything else is pushed: the beat is nearly
   twice the game tempo, the taiko lands on every other step instead of every
   eighth, and it plays an octave UP where the intro went down. That contrast is
   the point. The intro is the slowest thing in the game and this is the
   fastest, and a kid who has heard both knows within one bar which one is
   playing. `fifths` doubles each pluck a fifth above, which is the cheapest
   way to make a single oscillator sound like a fanfare rather than a plink. */
/**
 * Every piece the game can be playing.
 *
 * ONE PER ISLAND, keyed by biome, plus the two dragons and the intro. Six
 * biomes and the dojo is seven places, and an archipelago where every island
 * sounds the same is one island drawn six times — the biomes already change
 * the ground, the trees and the thing you break there, and this is the last
 * sense that had not noticed.
 *
 * They are all the same instrument in the same key family, so flying between
 * them is a key change rather than a different game. What separates them:
 *
 *   scale  the interval doing the emotional work (see the five above)
 *   root   transposition. The biggest single lever for "somewhere else"
 *   beat   seconds per step
 *   oct    octave multiplier on the melody
 *   rest   0..1 — how often a step is silence. High is sparse and airy
 *   drone  the held low note under it all
 *   taiko  drum every N steps, 0 for none
 *   fifths double every pluck a fifth up: a koto becomes a fanfare
 *   bass   a driving low riff every N steps — the thing that makes the
 *          dragon themes move rather than drift
 *   snare  a noise tick every N steps, offset half a step (a backbeat)
 *   bell   a high shimmering partial over each pluck (frost, and only frost)
 */
export const MUSIC = {
  /* ---- the two story pieces, unchanged ---- */
  intro: { scale: INSEN, beat: 0.78, oct: 0.5, drone: 0.20, taiko: 8, rest: 0.62 },

  /* ---- THE ENDING, IN THREE ACTS ------------------------------------------
     Asked for as: "we should play some nice ending cutscene music, specifically
     for the ending cutscene, the music could match some of the actions being
     shown on the screen in the cutscene."

     UNTIL NOW THE ENDING PLAYED THE ISLAND THEME. `Game._updateMusic` decides
     from where the KITTENS are standing, and during the finale they are
     standing wherever they were when the last barrel went over — so the last
     minute of the game, a scene whose camera crosses the whole archipelago,
     was scored by whichever meadow somebody happened to be in. Nothing was
     wrong; nothing was about it either.

     THREE PIECES, NOT ONE, AND THE CUTS ARE THE SCENE'S OWN. Every switch here
     lands on a shot change that already exists in `FINALE_SHOTS` — see
     `SummonScene._cue`, which is the one place that names them — so the music
     turns when the picture turns rather than on a beat count that would have to
     be re-timed every time a line is re-recorded. Three, because the ending has
     three subjects: what they broke, what they crossed, and where they are
     being sent next.

     THEY ARE ALL THE SAME KOTO IN THE SAME KEY FAMILY as everything else. A
     minute of something that does not sound like this game would read as a
     video playing rather than as the game finishing. */
  /* ACT ONE — the wreckage, and the elder's first two lines over it. INSEN,
     the STORY scale: the same one the opening cutscene uses, so the ending
     answers the beginning. Slower than anything else in the game, an octave
     down, a heavy drone and no drum at all — she is talking over most of it
     and a piece with an opinion would be competing with her. */
  finale: { scale: INSEN, beat: 0.86, oct: 0.5, drone: 0.26, taiko: 0, rest: 0.66 },
  /* ACT TWO — "you crossed." The archipelago drawing apart on the Dojo floor
     and the two kittens on the bridge. YO has no semitones, so nothing in it
     can come out sad, and it lifts an octave and a fifth out of act one's
     gloom without changing instrument. The bell is the Dojo's (`dojo` and
     `frost` are the only other pieces with one) — this act is the maths, and
     it should sound like the room the maths lives in. */
  finaleCross: {
    scale: YO, beat: 0.58, root: 164.81, oct: 1, drone: 0.14,
    taiko: 0, rest: 0.60, bell: true,
  },
  /* ACT THREE — "the arena is open. Go and find out." The matsuri arriving
     from a long way off: HIRAJOSHI up a fifth with a taiko and fifths is the
     ARENA's own theme (see `arena`), deliberately, because this is the last
     shot pointing at it and the piece a kid hears next when she flies out
     there is the piece she heard here. Slower than the real thing — the
     tournament is a promise at this point, not a fight — and the drum is every
     fourth step rather than every other, so `starfound` on "is open" has
     somewhere to land. */
  finaleOpen: {
    scale: HIRAJOSHI, beat: 0.44, root: 174.61, oct: 1, drone: 0.18,
    taiko: 4, rest: 0.54, fifths: true,
  },

  /* ---- the islands ---- */
  /* HOME KEEPS THE TUNE THEY ALREADY KNOW. `play` is still the theme from
     before this existed, note for note, because the home island is where both
     girls start every session and changing that is changing what the game
     sounds like. Everything else is new. */
  play: { scale: HIRAJOSHI, beat: 0.52, oct: 1, drone: 0.14, taiko: 0 },
  /* Autumn: the warmest of them. YO has no semitones, so nothing in it can
     come out sad, and dropping a fourth to A puts it under the home theme. */
  autumn: { scale: YO, beat: 0.58, root: 110.0, oct: 1, drone: 0.16, taiko: 0, rest: 0.68 },
  /* Frost: high, slow and mostly silence, with a bell over every note. The
     sparseness is the biome — a busy tune on an empty white island fights it. */
  frost: { scale: KUMOI, beat: 0.66, root: 196.0, oct: 1, drone: 0.10, taiko: 0, rest: 0.80, bell: true },
  /* Bamboo: the busiest island in the game and the busiest piece. Faster,
     lower, and it keeps going — you are in there swinging a katana. */
  bamboo: { scale: HIRAJOSHI, beat: 0.34, root: 130.81, oct: 1, drone: 0.18, taiko: 8, rest: 0.60 },
  /* Ash: iwato is the darkest of the five and this is the darkest place. Slow,
     an octave down, heavy on the drone, a drum every bar. */
  ash: { scale: IWATO, beat: 0.70, root: 98.0, oct: 1, drone: 0.30, taiko: 8, rest: 0.70 },
  /* Dusk: insen again, like the intro, but at tempo and with fifths — the
     island the story keeps pointing at should sound like the story. */
  dusk: { scale: INSEN, beat: 0.46, root: 164.81, oct: 1, drone: 0.22, taiko: 0, rest: 0.66, fifths: true },
  /* The Dojo: DELIBERATELY the quietest thing in the game. There is a lesson
     on screen there, a board of live sine and cosine, and a tune with an
     opinion competes with it. High, slow, very sparse, almost no drone —
     present enough that the island is not silent, and nothing more. */
  dojo: { scale: YO, beat: 0.86, root: 220.0, oct: 1, drone: 0.08, taiko: 0, rest: 0.84, bell: true },
  /* THE ARENA: a matsuri, not a battle theme. It is the fastest thing you can
     stand still in — the only island that outruns the bamboo grove — with a
     taiko on every other step, which is the sound a tournament crowd makes.
     HIRAJOSHI is the HOME scale on purpose and it is the one deliberate
     re-use in the set: this is still their world, three hundred units north,
     and the fight is a festival rather than somewhere foreign. What separates
     it from the home theme is everything else — up a fifth to F, nearly twice
     the tempo, a drum the home theme has never had, and fifths under the
     pluck. NO BASS: the storm dragon owns the only bassline in the game and
     a second one would blur the two. */
  arena: {
    scale: HIRAJOSHI, beat: 0.32, root: 174.61, oct: 1, drone: 0.20,
    taiko: 2, rest: 0.52, fifths: true,
  },

  /* ---- THE GRIFFIN, CARRYING THEM TO THE FIGHT ---------------------------
     Asked for as: "have music playing when riding the griffin to the arena. If
     we don't have music that matches it, then let's generate some new music to
     get players excited to fight in the arena."

     THERE WAS NOTHING PLAYING, AND THAT WAS A MISSING CALL RATHER THAN A
     MISSING TUNE — see `Game._wantedTrack`, where the ride branch now is. But
     neither piece that could have been reached was the right one: the flight
     theme is the storm dragon's, and the island theme underneath was whichever
     meadow somebody was standing in when Mr. Satan finished talking. Eight
     seconds is short, and short is exactly when the wrong tune is noticed.

     IT IS THE ARENA'S OWN KEY AND SCALE, ON PURPOSE. HIRAJOSHI at F, the same
     two numbers `arena` uses, so the moment the griffin puts them down the
     piece they have been listening to does not change key — the ride resolves
     INTO the festival rather than being interrupted by it. `finaleOpen` makes
     the same move for the same reason and from much further away: the last
     shot of the ending points at the arena and plays this key at it.

     WHAT MAKES IT A JOURNEY AND NOT THE DESTINATION: a `snare` the arena theme
     has never had, which is the one thing in this synth that says *moving*, and
     a step slower (0.36 against 0.32) so that landing is a step UP rather than
     a step sideways. `rest` is the lowest in the game at 0.44 — the busiest
     line anywhere — because the brief is excitement and excitement here is
     notes per second, not volume.

     NO BASS. The storm dragon owns the only bassline in the game; the arena
     theme gives its reason for refusing one and this is the piece that would
     blur into both. */
  griffin: {
    scale: HIRAJOSHI, beat: 0.36, root: 174.61, oct: 1, drone: 0.22,
    taiko: 2, rest: 0.44, fifths: true, snare: 4,
  },

  /* ---- the dragons ---- */
  /* STORM DRAGON FLIGHT. The Dragon Ball brief, finally cashed in: this is the
     one moment in the game that should sound like a cartoon about flying, so
     it is the only piece with a real BASSLINE. `bass` walks the low end every
     other step and `snare` puts a tick on the offbeat, which between them turn
     the koto into a band — that driving eighth-note bass under a bright
     pentatonic over a backbeat is the whole trick, and it is why this reads as
     rock rather than as the game theme played fast.
     YO keeps it heroic: no semitones, nothing wistful, straight up. */
  flight: {
    scale: YO, beat: 0.26, root: 146.83, oct: 1, drone: 0.16, taiko: 0,
    rest: 0.58, fifths: true, bass: 2, snare: 4,
  },
  /* RYUUSEKI. Fast like the flight theme and deliberately NOT the same piece:
     insen against the flight theme's yo — the darkest scale against the
     brightest — an octave up, a taiko instead of a snare, and no bass at all.
     He is legendary rather than exciting, and the two must not blur into each
     other in the one part of the game where you might hear both in a minute. */
  ryu: { scale: INSEN, beat: 0.28, oct: 2, drone: 0.26, taiko: 2, fifths: true },

  /* ---- SNAKE WAY -----------------------------------------------------------
     "Let's have it that some specific music is playing while on the bridges
     heading to the islands." A road the size of the sky that coils: so the one
     thing this piece has that nothing else does is `glide` — every pluck
     slides up into its note from a third below, which is a slither in one
     line of synth. KUMOI in G, between the home theme and the frost one, with
     the Dojo's bell because the road is gold and the bell is the brightest
     thing in the kit. NO BASS AND NO SNARE: the one bassline in the game is the
     storm dragon's (see `arena`), and a backbeat is the flight theme — a road
     is not a dragon. A taiko every bar is what keeps her running. */
  snake: {
    scale: KUMOI, beat: 0.3, root: 196.0, oct: 1, drone: 0.14,
    taiko: 8, rest: 0.56, bell: true, glide: true,
  },

  /* ---- MR SATAN'S ROAD -----------------------------------------------------
     "Have a special song play that is his preferred song (could be something
     funny sounding, based on his character, like a throwback to Elvis Presley
     ... maybe 'Everybody was kungfu fighting')."

     NOT THAT SONG. "Kung Fu Fighting" is somebody's copyright, and so is
     every Elvis record; a synth playing its tune is still its tune. What is
     free is the GENRE, and the genre is the joke: this is an original strut —
     a twelve-bar blues in C, the Vegas-lounge shape of an Elvis number, played
     over a 1974 disco kit (four on the floor, open hat on the off-beat, the
     octave-bouncing bass) with a brass section answering the lead. A kung-fu
     movie gong opens every chorus, because he is a martial-arts champion in
     his own head, and the last bar is a chromatic slide down on a muted horn:
     the sound of a man pausing for applause.

     IT IS AUTHORED, NOT GENERATED — `tune` below, read by `_tuneStep`. Every
     other piece here is a koto wandering a scale; a song people are meant to
     laugh at has to be a SONG, with a hook that comes back. One chorus is 96
     eighths, 24 seconds, and the arena road is about sixty seconds long, so a
     kitten hears it round twice and a half — well past the quarter asked
     for. `scale` is there only so anything that reads every piece as a koto
     (the trailer score) still finds five notes.
     IT HAS A BASS, and the house rule that the storm dragon owns the only one
     is a rule about the KOTO pieces: this is not a koto with a bassline, it is
     a band, and a disco band without its bass is not the joke. */
  satanStrut: {
    scale: [0, 2, 4, 7, 9], beat: 0.25, root: 130.81, oct: 1, drone: 0,
    taiko: 0, rest: 1, tune: 'strut',
  },

  /* THE STRUT IS NOW THE BACKUP, KEPT WHOLE. "The music is funny, let's save
     it as a backup, but let's try to change the music to be either the
     'everybody was kungfu fighting' music ... or ... a funny version of the
     Gold Saucer music from FF7."

     STILL NOT THOSE SONGS, for the reason above, and a "funny version" does not
     change it: a parody that is recognisably the tune is made OF the tune, and
     the tune is the part that is owned — "Kung Fu Fighting" by its writers and
     publisher since 1974, the Gold Saucer by Square Enix since 1997. A game on
     Steam cannot lean on "it was a joke". What the note is really asking for is
     the FEELING of each, and the feeling is free: so this is an original
     kung-fu disco song, and `saucer` below is an original funfair march.
     To put the strut back, point `satan` at `tune: 'strut'` — or read
     `satanStrut`, which is it, untouched.

     KUNG-FU DISCO, NOT LOUNGE BLUES. Where the strut is Vegas, this is the
     1974 dance floor with a martial-arts film playing over it: E minor
     pentatonic, the flamenco walk-down (Em D C B7) that every kung-fu poster
     has underneath it, strings running up three octaves, a wah guitar on the
     off-beats, an erhu-ish lead that scoops into every note — and a HUAH! on
     the big hits, synthesised from formants (`_shout`), so it is nobody's
     voice. 128 eighths at 0.26s, 33 seconds a chorus: a kitten on the road
     hears it round nearly twice. */
  satan: {
    scale: [0, 3, 5, 7, 10], beat: 0.26, root: 82.41, oct: 1, drone: 0,
    taiko: 0, rest: 1, tune: 'kungfu',
    /* LEVEL MATCHED TO THE STRUT, measured rather than guessed: rendered
       offline, the strut is 0.053 RMS and this was 0.045 with the band in. */
    mix: 1.18,
  },

  /* ---- THE ARENA ISLAND, BEFORE THE FIGHT -----------------------------------
     "...or can have that Gold Saucer music play when the player gets off the
     snake bridge and onto the arena, before they join the arena and the arena
     music plays."

     AN ORIGINAL FUNFAIR MARCH (see `satan` for why not the real one): a
     trumpet fanfare up the chord, then an oom-pah band under a steam
     calliope, a glockenspiel doubling it the second time, a bicycle-horn honk
     and a slide whistle up into the repeat. The feeling asked for is a theme
     park's front gate, and every one of those is a sound the front gate of a
     theme park makes.

     IN F, THE ARENA'S OWN KEY, so the league picker opening does not change
     key under them: the festival outside resolves into the fight inside, the
     same move the griffin's ride makes (`griffin`). It plays on the island
     whenever there is no match — so walking off the road, standing at his
     doors, and the parade back out of them. `Game._wantedTrack` decides.
     0.19s eighths, 24 seconds round. */
  saucer: {
    scale: [0, 2, 4, 7, 9], beat: 0.19, root: 174.61, oct: 1, drone: 0,
    taiko: 0, rest: 1, tune: 'saucer',
    /* Level matched the same way: 0.036 RMS against the strut's 0.053. */
    mix: 1.45,
  },
};

/** Biome → piece. Anything unrecognised falls back to the home theme. */
export const ISLAND_MUSIC = {
  meadow: 'play', autumn: 'autumn', frost: 'frost',
  bamboo: 'bamboo', ash: 'ash', dusk: 'dusk', arena: 'arena',
};

/**
 * Which piece an island plays.
 *
 * THE DOJO IS NOT A BIOME AND HAS TO BE ASKED FOR BY NAME. Its island
 * definition sets no biome at all, and `Island` defaults an unset one to
 * `meadow` — so a plain `ISLAND_MUSIC[isl.biome]` lookup hands the maths
 * island the HOME theme, which is the one island in the game where the music
 * most needs to get out of the way. It is a silent wrong answer: the right
 * number of themes exist, every biome maps to one, and the dojo just quietly
 * plays the wrong one.
 *
 * Exported as a function rather than left inline in the game loop because the
 * smoke test has to resolve it the same way the game does. Two copies of a
 * rule with a special case in it is how the dragon-ball locks shipped
 * unlocked — the test had its own copy of the factory and only that one
 * learned the new argument.
 */
export function trackForIsland(isl, dojoIsland) {
  if (!isl) return null;
  if (dojoIsland && isl === dojoIsland) return 'dojo';
  return ISLAND_MUSIC[isl.biome] ?? 'play';
}

const semi = (n, scaleRoot = ROOT) => scaleRoot * Math.pow(2, n / 12);

/** See sfxBus — turns the relative per-sound gains into real loudness. */
const SFX_MAKEUP = 3.2;

/**
 * WHO SAYS IT DECIDES WHERE IT LIVES. `voicePath('sat_over')` is
 * `/voice/satan/sat_over.mp3`.
 *
 * "We have a lot of art, voices, sprites, help assets and it is getting
 * disorganized." `public/voice/` was sixty-nine flat mp3s; it is five folders
 * now, one per character, and the folders come straight off the registry table
 * in `docs/notes/voices.md` — a character has ONE voice, so a character gets
 * ONE folder. That is also the property worth having: the question this
 * project keeps asking of these files is "who is talking", and the answer used
 * to require reading a table.
 *
 * THE FILENAMES DID NOT CHANGE, AND THAT IS NOT LAZINESS — it is the
 * difference between these and the sprites, which were renamed in the same
 * pass. A sprite's filename was only ever a path. A voice clip's filename is
 * an IDENTIFIER: `sat_over` is a key in the announcer's buffer, a beat id in
 * `cutscene.js` ("every beat's id doubles as its voice filename"), a row in
 * voices.md, and the output name of `tools/capture/satan-countdown.mjs`.
 * Stripping the prefix would fork that name across four places to save eight
 * characters in a path nobody types.
 *
 * AN UNKNOWN ID FALLS BACK TO THE FLAT PATH, DELIBERATELY. A wrong folder is
 * worse than no folder: it would be a 404, and a 404 here is SILENCE — the
 * line simply never plays, the scene runs on, and nothing reports it. So a new
 * id nobody has filed looks where the files used to be, and `world-check`
 * fails loudly on any referenced path that is not on disk, which is where a
 * missing clip is supposed to be caught.
 */
const VOICE_FOLDERS = [
  [/^sat_/, 'satan'],
  [/^shrine_|^(thunder|river|shadow|wind|ice|panda)$/, 'leaders'],
  [/^summon/, 'ryuuseki'],
  [/^cross/, 'kittens'],
  [/^(sky|break|close|elder\d|balls\d|done\d|hunt)/, 'patchfur'],
];

export const voicePath = (id) => {
  const hit = VOICE_FOLDERS.find(([re]) => re.test(id));
  return hit ? `/voice/${hit[1]}/${id}.mp3` : `/voice/${id}.mp3`;
};

/**
 * Recorded SOUND EFFECTS, as opposed to recorded dialogue — see `loadSamples`.
 *
 * The Cross Slash grades itself out loud: cross0 for a technique that landed
 * nothing, up to cross3 for all three cuts, which is the demon kitten from the
 * trailer. They are four rungs of one ladder cut out of one recording by
 * `tools/kitten-cackle.mjs --game`, so they are audibly the same animal at
 * four speeds rather than four unrelated noises, and the grading reads without
 * anybody explaining it.
 *
 * Every key must also be a case in `play`. That is the contract `sample`
 * depends on and there is a world-check pinning it.
 */
export const SAMPLES = {
  cross0: voicePath('cross0'),
  cross1: voicePath('cross1'),
  cross2: voicePath('cross2'),
  cross3: voicePath('cross3'),
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.sfxVolume = 0.75;
    this.musicVolume = 0.4;
    this._noiseBuf = null;
    this._voices = 0;
    /* Decoded one-shots, by name. Empty until `resume` — and possibly for
       ever, on a clone with no public/voice. See `sample`. */
    this._samples = {};
    this._samplesAsked = false;
    this._musicTimer = null;
    this._nextNote = 0;
    this._step = 0;
    this._mode = 'play';
  }

  /**
   * A character's speaking blip.
   *
   * Every line in the cutscene is typed out a letter at a time and every few
   * letters fires one of these, pitched to the speaker — the Animal Crossing
   * trick. It is not voice acting and does not pretend to be; it is the thing
   * that makes text feel like somebody talking, and unlike recorded voice it
   * costs nothing, needs no files and can never be the wrong language.
   *
   * @param {number} pitch multiplier on the base blip, per character
   */
  voice(pitch = 1) {
    if (!this.ready) return;
    // Relative gain like every other cue — sfxBus already carries the volume
    // setting and SFX_MAKEUP, so applying either here doubles it.
    const f = 420 * pitch;
    this._tone({ type: 'square', from: f, to: f * 0.86, dur: 0.055, gain: 0.05 });
  }

  /**
   * Speak a recorded line.
   *
   * THE ONLY AUDIO FILES IN THE GAME. Everything else here is oscillators and
   * noise, and that stays true — but the intro is eleven lines of dialogue and
   * synthesised blips under them read as a machine reading out a story rather
   * than a cat telling one. About a megabyte for the whole cutscene, loaded
   * once, and the fallback if any of it is missing is the blips.
   *
   * Deliberately an <audio> element rather than a buffer through the WebAudio
   * graph: these are long compared to every other cue, they never overlap
   * (one speaker at a time, by definition), and a MediaElementSource would
   * have to be torn down and rebuilt per line for no audible gain.
   */
  speak(clip) {
    this.stopSpeaking();
    if (!clip) return null;
    /* Takes a PRELOADED element by preference, a url only as a fallback. The
       url path builds and buffers an element from cold at the moment the line
       is supposed to start, which is exactly the delay that used to clip the
       ends off cutscene lines — see Cutscene.loadVoices. */
    const el = typeof clip === 'string' ? new window.Audio(clip) : clip;
    try { el.currentTime = 0; } catch { /* not seekable yet; it starts at 0 */ }
    // Lifted relative to the effects bus: dialogue has to sit over the music
    // and the wind, and it is the thing the player is actually listening to.
    el.volume = Math.min(1, this.sfxVolume * 1.35);
    el.play().catch(() => {});
    this._speaking = el;
    return el;
  }

  stopSpeaking() {
    if (!this._speaking) return;
    this._speaking.pause();
    this._speaking.currentTime = 0;
    this._speaking = null;
  }

  /* ------------------------------ samples -------------------------------- */

  /**
   * Load the handful of recorded sounds that are SOUND EFFECTS rather than
   * dialogue. Called once, from `resume`, because decoding needs the context.
   *
   * NOT `speak`, WHICH IS WHAT THIS LOOKS LIKE IT DUPLICATES. `speak` opens
   * with `stopSpeaking()` — one speaker at a time, which is exactly right for
   * a cutscene and exactly wrong here. A kitten landing a Cross Slash is
   * usually the same half-second Mr. Satan is shouting about the round, and
   * through `speak` whichever started second would cut the other dead. These
   * are buffers on the SFX bus instead: they overlap each other, they overlap
   * him, and they duck with the sound-effects slider like every other cue,
   * which is what a slider labelled "sound effects" should do to a cat noise.
   *
   * Failure is silent and per-file, and the caller must not care — see
   * `sample`. A fresh clone with no `public/voice` gets the synthesis.
   */
  loadSamples() {
    if (this._samplesAsked) return;
    this._samplesAsked = true;
    for (const name of Object.keys(SAMPLES)) {
      fetch(SAMPLES[name])
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((b) => this.ctx.decodeAudioData(b))
        .then((buf) => { this._samples[name] = buf; })
        .catch(() => { /* stays undefined; `sample` synthesises instead */ });
    }
  }

  /**
   * Play a recorded sound effect, or the synthesised stand-in for it.
   *
   * THE FALLBACK IS THE POINT, not an afterthought: ninth non-negotiable says
   * deleting `public/voice` must leave a working game, and this is a gameplay
   * cue rather than a line of dialogue, so "silence" is not an acceptable
   * degradation the way a missing cutscene voice is. Every name here has a
   * case in `play` that makes a noise out of oscillators. The file is funnier;
   * the synthesis still tells you how many cuts landed.
   *
   * Also covers the window before the fetch lands — a player who reaches the
   * arena inside a second of the first click gets the synthesis for a swing
   * or two rather than nothing.
   */
  sample(name, vol = 1) {
    if (!this.ready || vol <= 0.02) return;
    const buf = this._samples[name];
    if (!buf) { this.play(name, vol); return; }
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    src.buffer = buf;
    /* Flat, not enveloped. These are already shaped — `kitten-cackle.mjs`
       peak-normalises and fades 15ms off both ends — and an exponential decay
       over the top of a three-second cackle would eat the punchline. */
    g.gain.value = vol;
    src.connect(g).connect(this.sfxBus);
    src.start();
  }

  /** Called from a real user gesture. Safe to call repeatedly. */
  resume() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      this.ctx = new Ctx();

      // A little headroom management so a market full of tumbling barrels
      // doesn't clip into a nasty crunch.
      /* Catch loud pile-ups only. The default 30dB knee starts compressing
         30dB BELOW the threshold, which quietly squashed every single blip in
         the game to a third of its intended level — everything "worked" and
         everything was inaudible. */
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -8;
      this.comp.knee.value = 6;
      this.comp.ratio.value = 6;
      this.comp.attack.value = 0.002;
      this.comp.release.value = 0.18;
      this.comp.connect(this.ctx.destination);

      /* Makeup gain. The per-sound gains are written as "how loud is this
         relative to the others", which lands well under full scale once the
         short exponential envelopes are accounted for. This brings the bus up
         to a usable level in one place, so tuning one sound never means
         re-tuning all of them. */
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.sfxVolume * SFX_MAKEUP;
      this.sfxBus.connect(this.comp);

      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0;
      this.musicBus.connect(this.comp);

      this._buildNoise();
      this.ready = true;
      /* Here rather than at construction: `decodeAudioData` needs a context,
         and the context cannot exist until a user gesture. This IS that
         gesture, so the four small files are on their way before anybody can
         reach the arena. */
      this.loadSamples();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  _buildNoise() {
    const len = Math.floor(this.ctx.sampleRate * 0.6);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf;
  }

  setSfxVolume(v) {
    this.sfxVolume = v;
    if (this.sfxBus) this.sfxBus.gain.value = v * SFX_MAKEUP;
  }

  setMusicVolume(v) {
    this.musicVolume = v;
    if (this.musicBus && this._musicTimer) {
      this.musicBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2);
    }
  }

  /* ------------------------------ primitives ----------------------------- */

  /** A pitched blip. `type` is any OscillatorNode type. */
  _tone(opts) {
    const {
      type = 'sine', from, to = from, dur = 0.15, gain = 0.3,
      delay = 0, curve = 'exp', detune = 0,
    } = opts;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) {
      if (curve === 'exp') osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
      else osc.frequency.linearRampToValueAtTime(to, t + dur);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.012, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** A filtered burst of noise — every impact, slash and whoosh is one. */
  _noise(opts) {
    const {
      dur = 0.2, gain = 0.3, type = 'bandpass',
      from = 1200, to = from, q = 1.2, delay = 0,
    } = opts;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    if (to !== from) f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /* -------------------------------- sfx ---------------------------------- */

  /**
   * @param {string} name
   * @param {number} vol 0..1 — pass a distance-based value for far-off events
   */
  play(name, vol = 1) {
    if (!this.ready || vol <= 0.02) return;
    // Cheap voice cap: a dragon strafing a market can fire a lot of these.
    if (this._voices > 14) return;
    this._voices++;
    setTimeout(() => { this._voices--; }, 260);

    const v = vol;
    switch (name) {
      case 'jump':
        this._tone({ type: 'triangle', from: 300, to: 660, dur: 0.13, gain: 0.22 * v });
        break;
      case 'doubleJump':
        this._tone({ type: 'triangle', from: 420, to: 900, dur: 0.14, gain: 0.2 * v });
        this._tone({ type: 'sine', from: 840, to: 1500, dur: 0.1, gain: 0.08 * v, delay: 0.02 });
        break;
      case 'land':
        this._tone({ type: 'triangle', from: 150, to: 62, dur: 0.14, gain: 0.26 * v });
        this._noise({ from: 700, to: 200, dur: 0.1, gain: 0.13 * v, q: 0.8 });
        break;
      case 'slash':
        // The blade: a fast bright sweep, plus a touch of ring. Bandpass at
        // high Q throws most of the noise away, so it needs more gain than
        // its loudness relative to the others suggests.
        this._noise({ from: 3600, to: 700, dur: 0.17, gain: 0.75 * v, q: 2.4 });
        this._tone({ type: 'sine', from: 2400, to: 1500, dur: 0.1, gain: 0.06 * v });
        break;
      case 'hit':
        // Wood knocked over.
        this._tone({ type: 'square', from: 220, to: 90, dur: 0.1, gain: 0.16 * v });
        this._noise({ from: 1400, to: 500, dur: 0.12, gain: 0.16 * v, q: 1.1 });
        break;
      case 'bamboo': {
        /* A hollow crack. The pitched part matters: bamboo is a tube, so it
           rings for a moment after it splits — that's the whole character of
           the sound and what makes cutting a whole grove satisfying. */
        this._noise({ from: 5200, to: 1800, dur: 0.09, gain: 0.34 * v, type: 'highpass', q: 0.7 });
        this._tone({ type: 'triangle', from: 780, to: 300, dur: 0.26, gain: 0.2 * v });
        this._tone({ type: 'sine', from: 1560, to: 900, dur: 0.2, gain: 0.07 * v, delay: 0.01 });
        break;
      }
      case 'claw':
        /* Three claws, not one blade. The katana is a single bright sweep;
           this is three shorter, lower rips staggered a few milliseconds
           apart, which is what stops it sounding like the sword again. The
           growl underneath is what makes it come from an animal. */
        for (let i = 0; i < 3; i++) {
          this._noise({
            from: 2600 - i * 300, to: 500, dur: 0.13, gain: 0.42 * v,
            q: 1.6, delay: i * 0.022,
          });
        }
        this._tone({ type: 'sawtooth', from: 130, to: 58, dur: 0.22, gain: 0.13 * v });
        break;
      case 'breath':
        // A long exhale that opens up and closes again.
        this._noise({ from: 400, to: 2600, dur: 0.38, gain: 0.55 * v, type: 'lowpass', q: 0.9 });
        this._tone({ type: 'sawtooth', from: 90, to: 42, dur: 0.36, gain: 0.1 * v });
        break;
      case 'dbreathin':
        /* A KITTEN FILLING HER LUNGS, over the whole of `DBREATH.charge`.
           THIS IS A WARNING SOUND AND IT IS BUILT LIKE ONE. It used to be
           `wardup` — one short rising note, which says "something started" and
           then leaves a second of silence in which the other three players
           forget. So it is five gulps instead of one, each higher and louder
           than the last, and they run right up to the frame the flame leaves
           her: a sound that is visibly ACCELERATING is the only kind anybody
           reacts to without being told what it means.

           EVERY LAYER IS SCHEDULED IN ONE CALL rather than re-played each
           frame from the effects poller. `play` is voice-capped and the cap is
           per call, so this costs one voice no matter how long it is — and a
           per-frame version would stutter under a frame drop, which is exactly
           when a warning matters most. It is also why it cannot be cut short
           if she is knocked out: see the note on that in `Player.hurt`. */
        /* THE SPACING IS `DBREATH.charge` SHARED OUT, and it has been wrong
           once already: the cue was written against a 1.6s rear-back and the
           rear-back went back to 0.8, which left five gulps and a whine still
           climbing a second after the flame had come and gone. The last gulp
           STARTS before the charge ends and is allowed to ring past it into
           the roar — a warning that stops early reads as a cancelled attack.
           `world-check` reads these numbers back out of this file and asks
           them of `DBREATH.charge`, so the next time that number moves this
           does not quietly survive it. */
        for (let i = 0; i < 5; i++) {
          const k = i / 4;
          this._noise({
            from: 260 + k * 900, to: 1500 + k * 2600, dur: 0.15 + k * 0.08,
            gain: (0.14 + k * 0.3) * v, type: 'bandpass', q: 0.8, delay: i * 0.15,
          });
        }
        // ...and a thin whine underneath it, climbing the whole way.
        this._tone({ type: 'triangle', from: 180, to: 760, dur: 0.78, gain: 0.09 * v, delay: 0.05 });
        break;
      case 'dbreathout':
        /* THE FLAME, AND IT IS A BIGGER EVENT THAN A DRAGON'S. Not louder —
           longer and lower, which is what `DBREATH.fire` doubling asked for: a
           cue that stops before its cone does reads as the cone having missed.
           The transient on the front is what makes it GO OFF rather than fade
           up, the same trick `ryubeam` uses and for the same reason. */
        this._noise({ from: 5200, to: 900, dur: 0.12, gain: 0.5 * v, type: 'bandpass', q: 1.4 });
        this._noise({ from: 380, to: 2400, dur: 0.95, gain: 0.6 * v, type: 'lowpass', q: 0.9 });
        this._tone({ type: 'sawtooth', from: 104, to: 38, dur: 0.9, gain: 0.14 * v });
        this._tone({ type: 'square', from: 190, to: 62, dur: 0.7, gain: 0.07 * v, delay: 0.04 });
        break;
      case 'ryubeam':
        /* Ryuuseki's fan. It has to be audibly a bigger event than 'breath',
           and louder alone would just be louder — so it is built the other way
           round: a hard bright transient on top of a long descending sweep,
           which is what makes a beam read as a beam rather than as a gust.
           `vol` carries the solo/duo difference, so one kitten firing sounds
           like a smaller version of the same weapon rather than a different
           one. */
        this._noise({ from: 5200, to: 300, dur: 0.5, gain: 0.5 * v, type: 'bandpass', q: 1.6 });
        this._tone({ type: 'sawtooth', from: 1400, to: 120, dur: 0.42, gain: 0.2 * v });
        this._tone({ type: 'square', from: 220, to: 70, dur: 0.5, gain: 0.1 * v, delay: 0.03 });
        break;
      case 'ryuroar':
        /* The summon. Very low, very long, and it is the only cue in the game
           allowed to be — everything else is a blip because everything else
           happens constantly. This happens once. */
        this._tone({ type: 'sawtooth', from: 70, to: 28, dur: 1.5, gain: 0.34 * v });
        this._tone({ type: 'square', from: 104, to: 41, dur: 1.3, gain: 0.14 * v, delay: 0.05 });
        this._noise({ from: 900, to: 120, dur: 1.6, gain: 0.3 * v, type: 'lowpass', q: 1.1 });
        break;
      case 'star':
        // Picking up a dragon ball: a bright rising arpeggio, unmistakably
        // "you got one of the things".
        [0, 4, 7, 12].forEach((n, i) => this._tone({
          type: 'triangle', from: semi(n + 24), dur: 0.2,
          gain: 0.17 * v, delay: i * 0.048,
        }));
        break;
      case 'starfound':
        /* The Zelda beat, and it has to be a BIGGER event than 'star' was.
           Finding one of these now costs a cave, a claw or a third jump, and
           the four-note arpeggio that used to mark it is the same length as
           the noise a barrel makes. This is the full fanfare: the arpeggio
           opens it, a held fifth underneath gives it a floor, and a bell on
           top rings out over the two seconds she is holding it up. */
        [0, 4, 7, 12, 16, 19].forEach((n, i) => this._tone({
          type: 'triangle', from: semi(n + 24), dur: 0.26,
          gain: 0.17 * v, delay: i * 0.055,
        }));
        this._tone({ type: 'sine', from: semi(0), dur: 1.6, gain: 0.13 * v, delay: 0.02 });
        this._tone({ type: 'sine', from: semi(7), dur: 1.6, gain: 0.10 * v, delay: 0.02 });
        this._tone({ type: 'sine', from: semi(36), dur: 1.9, gain: 0.15 * v, delay: 0.34 });
        this._tone({ type: 'sine', from: semi(43), dur: 1.7, gain: 0.08 * v, delay: 0.34 });
        break;
      case 'icecrack':
        /* Ice off a star. Bright, brittle, and it has to be legible over a
           dragon's breath still roaring — hence the top end rather than a
           low crunch, which the breath would swallow whole. */
        this._noise({ from: 5200, to: 1400, dur: 0.5, gain: 0.34 * v, type: 'highpass', q: 0.8 });
        [24, 31, 36].forEach((n, i) => this._tone({
          type: 'triangle', from: semi(n), to: semi(n - 2), dur: 0.22,
          gain: 0.12 * v, delay: i * 0.035,
        }));
        break;
      case 'rockbreak':
        // A boulder off a star: the opposite end, all body and grit.
        this._noise({ from: 700, to: 90, dur: 0.7, gain: 0.4 * v, type: 'lowpass', q: 1.2 });
        this._tone({ type: 'square', from: 96, to: 38, dur: 0.42, gain: 0.16 * v });
        break;

      /* ---- the tournament ----
         These have one job the rest of the library does not: they have to be
         told apart from `hit` while both are firing several times a second.
         A blow that lands on a BARREL and a blow that lands on your SISTER
         must not sound alike, or a nine-year-old cannot tell whether she is
         winning without looking away from what she is doing. So the whole
         group is pitched — bodies, not wood — where `hit` is noise. */
      case 'hurt':
        // A body: a soft low thump with a short bright yelp over the top.
        this._tone({ type: 'sine', from: 190, to: 70, dur: 0.16, gain: 0.30 * v });
        this._noise({ from: 900, to: 260, dur: 0.09, gain: 0.14 * v, q: 0.9 });
        this._tone({ type: 'triangle', from: 900, to: 1350, dur: 0.07, gain: 0.09 * v });
        break;
      case 'ko':
        /* Bigger, and it FALLS. The last hit of a round has to be audibly the
           last hit — a descending fifth under a crash reads as something
           going down in a way no amount of extra gain on `hurt` would. */
        this._tone({ type: 'square', from: 300, to: 60, dur: 0.55, gain: 0.26 * v });
        this._tone({ type: 'triangle', from: 200, to: 40, dur: 0.7, gain: 0.16 * v, delay: 0.03 });
        this._noise({ from: 2400, to: 200, dur: 0.5, gain: 0.26 * v, q: 0.7 });
        break;
      case 'smash':
        /* THE CROSS SLASH LANDING ALL THREE CUTS, and it has exactly one job:
           to be unmistakably bigger than `ko`, which is otherwise the loudest
           thing in this library. A kid who lands the whole technique on her
           sister has to hear that she landed it from the other end of the sofa,
           and she has to hear that it was not just another knockout.
           FOUR LAYERS, LOW TO HIGH, because a single fat sine is a thud and not
           a bang — what makes an explosion an explosion is the bright crack
           arriving with the body and decaying about three times faster. */
        this._tone({ type: 'square', from: 170, to: 26, dur: 0.75, gain: 0.30 * v });
        this._tone({ type: 'triangle', from: 92, to: 22, dur: 0.95, gain: 0.20 * v, delay: 0.02 });
        this._noise({ from: 4200, to: 140, dur: 0.55, gain: 0.42 * v, q: 0.6 });
        this._noise({
          from: 260, to: 55, dur: 1.0, gain: 0.24 * v,
          type: 'lowpass', q: 1.0, delay: 0.04,
        });
        break;
      case 'squeak':
        /* A critter objecting. Two quick rising blips an octave apart, high
           enough to sit right above everything else in the mix without being
           loud — this fires whenever one is grabbed, dropped or knocked out of
           the air, which in a busy feast is several times a second. */
        this._tone({ type: 'triangle', from: semi(31), to: semi(38), dur: 0.07, gain: 0.10 * v });
        this._tone({ type: 'triangle', from: semi(36), to: semi(43), dur: 0.06, gain: 0.07 * v, delay: 0.06 });
        break;
      case 'chomp':
        /* Swallowed. A cartoon gulp: a short filtered noise bite for the teeth
           and a fat downward blip under it for the swallow, then one bright
           bell so the moment reads as a REWARD rather than as an impact. That
           last note is the whole difference in tone — without it this is the
           same sound as hitting a barrel. */
        this._noise({ from: 1800, to: 300, dur: 0.09, gain: 0.20 * v, q: 0.9 });
        this._tone({ type: 'sine', from: semi(12), to: semi(-4), dur: 0.16, gain: 0.20 * v });
        this._tone({ type: 'sine', from: semi(28), dur: 0.34, gain: 0.13 * v, delay: 0.13 });
        this._tone({ type: 'sine', from: semi(35), dur: 0.26, gain: 0.07 * v, delay: 0.17 });
        break;
      case 'ringout':
        // Thrown off the stage: a rising whoosh that leaves, then a gong.
        this._noise({ from: 400, to: 3000, dur: 0.34, gain: 0.24 * v, q: 1.4 });
        this._tone({ type: 'sine', from: semi(0), dur: 1.3, gain: 0.20 * v, delay: 0.22 });
        this._tone({ type: 'sine', from: semi(7), dur: 1.1, gain: 0.11 * v, delay: 0.22, detune: 8 });
        break;
      case 'count':
        // One tick of the pre-round countdown. Dry and short on purpose —
        // three of these in a row have to read as three, not as a chord.
        this._tone({ type: 'square', from: semi(12), dur: 0.12, gain: 0.20 * v });
        this._noise({ from: 2600, to: 1400, dur: 0.05, gain: 0.10 * v, q: 2.0 });
        break;
      case 'doors':
        /* THE ARENA'S FRONT DOORS, swinging in: a long low creak of wood on
           its hinges for the second and a half they move, then the thud of
           them coming to rest against the pillars. systems/arenaexit.js. */
        this._noise({ type: 'lowpass', from: 260, to: 140, dur: 1.5, gain: 0.22 * v, q: 3 });
        this._tone({ type: 'sawtooth', from: 72, to: 58, dur: 1.4, gain: 0.05 * v, curve: 'lin' });
        this._tone({ type: 'triangle', from: 118, to: 96, dur: 0.9, gain: 0.05 * v, delay: 0.25 });
        this._tone({ type: 'sine', from: 70, to: 38, dur: 0.5, gain: 0.34 * v, delay: 1.5 });
        this._noise({ from: 600, to: 120, dur: 0.3, gain: 0.2 * v, q: 0.7, delay: 1.5 });
        break;
      case 'gong':
        /* FIGHT. The one sound in the game that starts something. A big
           struck bell: fundamental, fifth and octave together with a noise
           transient on the strike, and a long tail under the first exchange. */
        this._noise({ from: 3200, to: 400, dur: 0.16, gain: 0.30 * v, q: 0.6 });
        this._tone({ type: 'sine', from: semi(-12), dur: 2.4, gain: 0.24 * v });
        this._tone({ type: 'sine', from: semi(-5), dur: 2.1, gain: 0.14 * v, detune: 5 });
        this._tone({ type: 'sine', from: semi(0), dur: 1.8, gain: 0.11 * v, detune: -7 });
        break;
      case 'endgong':
        /* A ROUND IS OVER. The FIGHT gong starts something and this one stops
           it, so it is the same bell struck softer and left to settle: the
           strike is duller (the noise sweep starts an octave lower and lasts
           twice as long), the partials are a fifth and an octave rather than
           the fight's tighter stack, and a second, quieter strike a third of a
           second later is what a temple bell actually does — one strike reads
           as an interruption, two read as a full stop.
           NOT `gong` AT A LOWER VOLUME. It has to be recognisable as the same
           instrument and unmistakable as a different event, because these two
           are the only bells in the game and a girl hearing the fight gong at
           the end of a round would get up off her mark. */
        this._noise({ from: 1600, to: 300, dur: 0.3, gain: 0.24 * v, q: 0.5 });
        this._tone({ type: 'sine', from: semi(-24), dur: 3.0, gain: 0.24 * v });
        this._tone({ type: 'sine', from: semi(-17), dur: 2.6, gain: 0.13 * v, detune: 6 });
        this._tone({ type: 'sine', from: semi(-12), dur: 2.2, gain: 0.09 * v, detune: -6 });
        this._noise({ from: 900, to: 240, dur: 0.2, gain: 0.10 * v, q: 0.5, delay: 0.34 });
        this._tone({ type: 'sine', from: semi(-24), dur: 2.2, gain: 0.13 * v, delay: 0.34 });
        break;
      case 'drawgong':
        /* NOBODY WON. The same bell as `endgong`, and then it BENDS UP —
           which is what a question mark is, in a voice or in a bell. Reported
           in exactly those words: "like a gong making a question mark sound".
           THE RISE IS ON THE PARTIALS, NOT THE FUNDAMENTAL. Sliding the whole
           bell up sounds like a tape being sped up; leaving the low strike
           where it is and letting the two above it climb a whole tone sounds
           like the bell itself asking, which is the joke. The little rising
           tail on the end is the last inch of the eyebrow. */
        this._noise({ from: 1600, to: 300, dur: 0.3, gain: 0.24 * v, q: 0.5 });
        this._tone({ type: 'sine', from: semi(-24), dur: 2.6, gain: 0.22 * v });
        this._tone({ type: 'sine', from: semi(-17), to: semi(-13), dur: 2.2, gain: 0.13 * v, curve: 'lin' });
        this._tone({ type: 'sine', from: semi(-12), to: semi(-7), dur: 2.0, gain: 0.10 * v, curve: 'lin' });
        [0, 4, 9].forEach((n, i) => this._tone({
          type: 'sine', from: semi(n), dur: 0.5, gain: 0.09 * v, delay: 1.1 + i * 0.17,
        }));
        break;
      case 'victory':
        /* Winning the whole tournament. Deliberately a FANFARE rather than
           the star's bell — a star is a thing you found, this is a thing you
           beat your sister at, and it should sound like a crowd. */
        [0, 4, 7, 12, 12, 16, 19, 24].forEach((n, i) => this._tone({
          type: 'square', from: semi(n + 12), dur: 0.3,
          gain: 0.12 * v, delay: i * 0.11,
        }));
        this._tone({ type: 'sine', from: semi(0), dur: 2.6, gain: 0.13 * v });
        this._tone({ type: 'sine', from: semi(7), dur: 2.4, gain: 0.09 * v });
        this._noise({ from: 1200, to: 300, dur: 0.5, gain: 0.10 * v, q: 0.5, delay: 0.88 });
        break;
      case 'mount':
        [0, 3, 7].forEach((n, i) => this._tone({
          type: 'triangle', from: semi(n + 12), dur: 0.22,
          gain: 0.16 * v, delay: i * 0.055,
        }));
        break;
      case 'dismount':
        [7, 3, 0].forEach((n, i) => this._tone({
          type: 'triangle', from: semi(n + 12), dur: 0.18,
          gain: 0.13 * v, delay: i * 0.05,
        }));
        break;

      /* --- the panda cub, and the panda changing size ---
         THE THREE ARE ONE FAMILY DELIBERATELY. Down falls, up rises, and the
         lick is a small rise — same rule as the ward cues above and as every
         other yes and no in this game, so a kid who has heard the poof once
         can already tell which way the next one went without looking. */
      case 'lick':
        /* THE QUIETEST THING IN HERE, and that is the whole design. It fires
           roughly once a second for as long as a hurt kitten stands near her
           cub, which can be most of a round — anything with a transient or a
           bell in it would be unbearable by the fourth one. So: a soft wet lap
           with no top end at all, and a tiny two-note chirp over it for the
           happy animal. Rising, because it means something good is happening.

           NO `q` HIGH ENOUGH TO RING. A resonant lap reads as a drip, which is
           a sound about water rather than about an animal. */
        this._noise({ from: 1500, to: 520, dur: 0.07, gain: 0.085 * v, q: 0.7 });
        this._tone({ type: 'sine', from: semi(19), to: semi(26), dur: 0.10, gain: 0.06 * v, delay: 0.04 });
        break;
      case 'lickdone':
        /* ...AND THE CUB'S LITTLE BOW. "Have the panda do a happy dance and
           play a happy sound so the player knows they are done being healed by
           the baby panda."

           IT IS THE LOUD ONE OF THE PAIR, AND THAT IS THE WHOLE POINT. `lick`
           is deliberately the quietest thing in this file because it fires
           once a second for most of a round; this fires ONCE, at the end, and
           is the thing she is actually meant to notice. Making them the same
           size would bury the announcement under sixty repetitions of the
           announcement's own footsteps.

           A RISING THREE-NOTE AND A BELL — the same figure `pandapoof` uses
           for getting the animal back, deliberately, because the two moments
           are the same kind of good news and this game only has one grammar
           for yes. A fifth up rather than `pandapoof`'s octave, so a girl who
           knows both can still tell them apart with her eyes on the fight.

           NO NOISE LAYER. `pandapoof` has a whoosh because something appears;
           nothing appears here, and a puff of air over a finished heal reads
           as the panda leaving. */
        [0, 7, 12].forEach((n, i) => this._tone({
          type: 'triangle', from: semi(n + 12), to: semi(n + 16), dur: 0.22,
          gain: 0.10 * v, delay: i * 0.065,
        }));
        this._tone({ type: 'sine', from: semi(31), dur: 0.7, gain: 0.085 * v, delay: 0.2 });
        this._tone({ type: 'sine', from: semi(36), dur: 0.5, gain: 0.04 * v, delay: 0.23, detune: 6 });
        break;
      case 'pandadown':
        /* THE ANIMAL GETS SMALL. NOT A DEATH — fourth non-negotiable, a pet
           can never be lost, and a smash or a K.O. gong here would tell a
           nine-year-old the exact opposite of what happened. It is air going
           out of something: a falling three-note and a soft puff, no impact
           transient anywhere in it. */
        [12, 7, 0].forEach((n, i) => this._tone({
          type: 'triangle', from: semi(n), to: semi(n - 5), dur: 0.28,
          gain: 0.13 * v, delay: i * 0.075,
        }));
        this._noise({ from: 900, to: 180, dur: 0.34, gain: 0.13 * v, q: 0.5, delay: 0.05 });
        break;
      case 'pandapoof':
        /* ...AND BACK UP AGAIN. The same figure read the other way, plus one
           bell at the top that `pandadown` deliberately has not got: getting
           the panda back is a reward and the bell is the sound this game uses
           for those (see `chomp`, `orb`). */
        [0, 7, 12].forEach((n, i) => this._tone({
          type: 'triangle', from: semi(n), to: semi(n + 5), dur: 0.26,
          gain: 0.13 * v, delay: i * 0.075,
        }));
        this._noise({ from: 300, to: 2200, dur: 0.3, gain: 0.12 * v, q: 0.6 });
        this._tone({ type: 'sine', from: semi(31), dur: 0.9, gain: 0.11 * v, delay: 0.26 });
        this._tone({ type: 'sine', from: semi(38), dur: 0.7, gain: 0.05 * v, delay: 0.3, detune: 7 });
        break;
      case 'orb':
        // A bell: fundamental plus a slightly detuned partial, long decay.
        this._tone({ type: 'sine', from: semi(24), dur: 1.1, gain: 0.2 * v });
        this._tone({ type: 'sine', from: semi(31), dur: 0.85, gain: 0.1 * v, detune: 6 });
        break;
      case 'clan':
        // A gong-ish swell for a moment that should feel like a big deal.
        // Five partials land almost together, so each has to be modest or the
        // gong alone eats most of the headroom.
        HIRAJOSHI.forEach((n, i) => this._tone({
          type: 'sine', from: semi(n), dur: 1.5 - i * 0.12,
          gain: 0.075 * v, delay: i * 0.012,
        }));
        this._noise({ from: 300, to: 90, dur: 1.0, gain: 0.07 * v, q: 0.6 });
        break;
      case 'clanJoin':
        /* LAYERED OVER THE GONG, NOT INSTEAD OF IT. `clan` already fires from
           the oath itself and is the weight of the moment; this is the sparkle
           on top, for the ceremony that only happens the FIRST time she swears
           to a given clan. Separating them means the correction case — swearing
           somewhere she has sworn before — still gets the gong and correctly
           gets no fanfare.
           An ascending arpeggio, because every other rising figure in this
           game means yes and every falling one means no. */
        [0, 7, 12, 16, 19].forEach((n, i) => this._tone({
          type: 'triangle', from: semi(n + 24), dur: 0.5,
          gain: 0.055 * v, delay: i * 0.075,
        }));
        this._tone({ type: 'sine', from: semi(36), dur: 1.3, gain: 0.06 * v, delay: 0.36 });
        break;
      case 'score':
        this._tone({ type: 'square', from: semi(19), dur: 0.07, gain: 0.1 * v });
        this._tone({ type: 'square', from: semi(24), dur: 0.12, gain: 0.1 * v, delay: 0.07 });
        break;
      case 'menu':
        this._tone({ type: 'sine', from: 900, to: 1300, dur: 0.07, gain: 0.22 * v });
        break;

      /* --- Powerup Kotodama ---
         THE THREE WARD CUES ARE ONE SOUND IN THREE STATES, not three sounds.
         Up sweeps in, a block is the same pitch struck, down sweeps out — so
         a kid who has heard the bubble go up once already knows the other two
         mean the same object. Three unrelated noises around one three-second
         ability is the fastest way to make an ability feel like a bug. */
      case 'wardup':
        this._tone({ type: 'sine', from: semi(7), to: semi(19), dur: 0.26, gain: 0.17 * v });
        this._tone({ type: 'triangle', from: semi(19), dur: 0.5, gain: 0.07 * v, delay: 0.1 });
        break;
      case 'warddown':
        this._tone({ type: 'sine', from: semi(19), to: semi(5), dur: 0.3, gain: 0.13 * v });
        break;
      /* THE SHIELD IS BACK — and this only ever plays for a block that went
         past the default two seconds and was charged the longer wait for it
         (see AEGIS). A cue on EVERY recharge would fire several times a round
         for every kitten wearing a Ward and become the sound of nothing in
         particular; fired only after a wait she can feel is longer than usual,
         it is an answer to a question she is actually asking.

         IT IS `warddown` PLAYED BACKWARDS, near enough, and that is the whole
         design: the sweep-out falls a fifth and a bit, so the sweep-in climbs
         the same distance and lands on the note `wardup` starts from. The
         sparkle on top is what stops it being mistaken for a ward going up —
         two thin, quiet, detuned partials well above it, which no other cue in
         this set has. */
      case 'wardready':
        this._tone({ type: 'sine', from: semi(5), to: semi(19), dur: 0.26, gain: 0.12 * v });
        this._tone({ type: 'triangle', from: semi(31), dur: 0.14, gain: 0.045 * v, detune: 9, delay: 0.14 });
        this._tone({ type: 'triangle', from: semi(38), dur: 0.10, gain: 0.03 * v, detune: -6, delay: 0.2 });
        break;
      /* THE TWO OUTCOMES OF BEING HIT, AND THEY HAVE TO BE TOLD APART BY EAR.
         Asked for as "a lower pitched dink or absorption sound" against "a
         unique high pitched dink to indicate their shield was disabled", and
         the reason is that the two say opposite things about what to do next:
         one means keep blocking, the other means run. A kid in a four-way
         round is not looking at the bubble when the blow lands.

         BOTH ARE STILL THE WARD'S OWN FAMILY, which is the rule the three
         cues above already follow — `wardup` sweeps in and `warddown` sweeps
         out. An absorption that sounded like
         a different object would read as a different thing having happened. */
      case 'wardabsorb':
        /* A DULL STRUCK GLASS. THIS REPLACED `wardhit`, WHICH IS GONE: that
           cue was the sound of a block costing her nothing, and after
           `Player._wardTakeHit` there is no such blow — every one takes half
           the clock or ends it. A cue nothing can play is a lie in this
           table, so it was deleted rather than left for somebody to find.
           Same struck glass an octave down, no top partial, the noise burst
           darker and shorter: it is still the ward's voice, it just costs
           her something now, and the pitch dropping is the whole message. */
        this._tone({ type: 'sine', from: semi(19), to: semi(16), dur: 0.26, gain: 0.17 * v });
        this._tone({ type: 'triangle', from: semi(26), dur: 0.12, gain: 0.05 * v, detune: 7 });
        this._noise({ from: 1900, to: 700, dur: 0.09, gain: 0.09 * v, q: 1.2 });
        break;
      case 'wardbreak':
        /* SMASHED, not merely ended. Two bright partials a fourth apart so it
           beats rather than rings, and the noise sweeps DOWN across a wide
           band with a long tail — glass giving way rather than glass tapped.
           It is deliberately the highest thing in the ward family and the only
           one with a scatter after it, because it is the only one that means
           the ability is gone.

           IT DOES NOT ALSO PLAY `warddown`. `Player._dropWard` holds its own
           sound back for this reason: two endings layered on one frame reads
           as a bug in the audio, not as emphasis. */
        this._tone({ type: 'sine', from: semi(43), to: semi(41), dur: 0.30, gain: 0.17 * v });
        this._tone({ type: 'sine', from: semi(48), dur: 0.18, gain: 0.09 * v, detune: -11 });
        this._noise({ from: 7200, to: 900, dur: 0.34, gain: 0.14 * v, q: 0.8 });
        this._noise({ from: 4200, to: 1600, dur: 0.16, gain: 0.08 * v, q: 3.0, delay: 0.06 });
        break;
      /* --- 瞬 FLASH STEP: GOING, AND COMING BACK ---

         THEY ARE ONE GESTURE PLAYED IN TWO HALVES AND HAVE TO SOUND LIKE IT.
         `dodgeout` sweeps UP and thins into noise — a body leaving; `dodgein`
         is the same sweep run backwards and landing on a soft hit, which is
         the body arriving. Played back to back over half a second they read as
         one movement rather than as two effects, and a girl who hears only the
         second one still knows what just happened near her.

         DELIBERATELY NOT IN THE WARD'S FAMILY. Every ward cue is a sine bell
         on the scale root; these are square and filtered noise, because the
         two abilities live on adjacent buttons and the one thing a player must
         never have to work out is which of them she just fired. */
      case 'dodgeout':
        this._tone({ type: 'square', from: semi(7), to: semi(31), dur: 0.15, gain: 0.10 * v });
        this._noise({ from: 900, to: 6400, dur: 0.20, gain: 0.16 * v, q: 1.6 });
        this._tone({ type: 'sine', from: semi(38), dur: 0.09, gain: 0.05 * v, delay: 0.12 });
        break;
      case 'dodgein':
        this._noise({ from: 6400, to: 800, dur: 0.16, gain: 0.14 * v, q: 1.6 });
        this._tone({ type: 'square', from: semi(31), to: semi(9), dur: 0.13, gain: 0.10 * v });
        /* The landing itself: one low, short thump under the sweep, so she can
           feel where she came down as well as hear that she did. */
        this._tone({ type: 'sine', from: semi(-5), dur: 0.14, gain: 0.13 * v, delay: 0.09 });
        break;
      /* THE RETICLE CLOSING. One thin, dry blip — it fires the instant somebody
         is locked, which is a fact about a THIRD party, so it has to be quiet
         enough that four of them in a scrap is not four alarms. */
      case 'dodgelock':
        this._tone({ type: 'square', from: semi(26), dur: 0.05, gain: 0.055 * v });
        this._tone({ type: 'square', from: semi(33), dur: 0.07, gain: 0.04 * v, delay: 0.05 });
        break;
      case 'powerorb':
        /* Bigger than `orb`, and it has to be: the plain one was a pickup, this
           one changes how she moves for the rest of the game. Same bell an
           octave up with a fifth stacked on it, so it is recognisably the same
           family of object. */
        this._tone({ type: 'sine', from: semi(24), dur: 1.2, gain: 0.18 * v });
        this._tone({ type: 'sine', from: semi(31), dur: 1.0, gain: 0.12 * v, delay: 0.05 });
        this._tone({ type: 'sine', from: semi(36), dur: 0.8, gain: 0.09 * v, delay: 0.1 });
        this._tone({ type: 'triangle', from: semi(43), dur: 0.6, gain: 0.05 * v, delay: 0.16 });
        break;
      case 'quest':
        /* A quest done. SMALLER THAN `starfound` ON PURPOSE — it plays while
           she keeps playing, and the star's fanfare is the sound of the game
           stopping for her. Three quick rising notes and the powerorb bell on
           the end, because what she has just earned is a promise of one. */
        [7, 12, 19].forEach((n, i) => this._tone({
          type: 'triangle', from: semi(n + 24), dur: 0.14,
          gain: 0.14 * v, delay: i * 0.07,
        }));
        this._tone({ type: 'sine', from: semi(36), dur: 0.9, gain: 0.12 * v, delay: 0.21 });
        this._tone({ type: 'sine', from: semi(43), dur: 0.7, gain: 0.06 * v, delay: 0.24 });
        break;
      case 'coin':
        this._tone({ type: 'square', from: semi(24), dur: 0.06, gain: 0.09 * v });
        this._tone({ type: 'square', from: semi(31), dur: 0.16, gain: 0.09 * v, delay: 0.06 });
        break;
      case 'trade':
        [0, 4, 7, 12].forEach((n, i) => this._tone({
          type: 'triangle', from: semi(n + 12), dur: 0.3 - i * 0.04,
          gain: 0.11 * v, delay: i * 0.055,
        }));
        break;
      case 'deny':
        this._tone({ type: 'square', from: semi(3), to: semi(-4), dur: 0.16, gain: 0.13 * v });
        break;

      /* ---- the Cross Slash's four verdicts, synthesised ------------------
         THE STAND-INS FOR cross0..cross3, and a case must exist for each key
         in SAMPLES — `sample` falls through to here whenever the mp3 is
         missing or has not finished decoding yet.

         These are NOT trying to be the kitten. That was tried at length for
         the trailer and lost to an actual animal (see kitten-cackle.mjs); a
         second attempt here would lose the same way. What they have to carry
         is the one thing the recording carries that the game needs — HOW MANY
         CUTS LANDED — so they are the same figure four times, getting lower,
         longer and more distorted as the count goes up. Rung 0 is a small
         apologetic chirp; rung 3 is the same chirp an octave and a half down
         with the chirps stacked into a growl. You can hear which one you got
         without being able to hear a cat. */
      case 'cross0':
      case 'cross1':
      case 'cross2':
      case 'cross3': {
        const hits = Number(name[5]);
        /* Down a fifth per rung and roughly double the length, which is the
           reference ladder's own shape — it slows by a constant factor per
           rung rather than a constant number of seconds. */
        const base = 520 * Math.pow(0.68, hits);
        const dur = 0.16 * Math.pow(1.75, hits);
        for (let i = 0; i <= hits; i++) {
          /* One chirp per cut landed, so the count is countable as well as
             audible — a player who cannot hear pitch can still hear three. */
          this._tone({
            type: hits >= 2 ? 'sawtooth' : 'triangle',
            from: base * 1.5, to: base * 0.7,
            dur, gain: (0.1 + 0.045 * hits) * v, delay: i * dur * 0.55,
          });
        }
        /* The growl only from two up: it is what makes the good outcomes read
           as bigger rather than merely longer, and putting it on rung 0 would
           make a whiff sound powerful. */
        if (hits >= 2) {
          this._noise({
            from: base * 2.4, to: base * 0.8, dur: dur * 1.6,
            gain: 0.06 * hits * v, q: 3.2,
          });
        }
        break;
      }

      case 'crossReady':
        /* THE COOLDOWN IS OVER. Deliberately tiny and high — it fires while
           the player is mid-fight and looking somewhere else, so it has to be
           findable without pulling attention off the screen, and anything with
           body to it reads as a hit landing on you. A rising pair, because
           every "you may now" in this game rises and every refusal falls (see
           `deny`, three lines up, which is the same interval downward). */
        this._tone({ type: 'sine', from: semi(28), dur: 0.07, gain: 0.07 * v });
        this._tone({ type: 'sine', from: semi(35), dur: 0.11, gain: 0.06 * v, delay: 0.055 });
        break;

      default:
        break;
    }
  }

  /* ------------------------------- music --------------------------------- */

  /** @param {'play'|'intro'} mode which piece to generate — see MUSIC. */
  startMusic(mode = 'play') {
    if (!this.ready) return;
    // Switching pieces tears the old schedule down first, or the two run
    // together and the intro plays underneath the game theme.
    if (this._musicTimer && this._mode !== mode) this.stopMusic();
    this._mode = mode;
    if (this._musicTimer) return;
    this.musicBus.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.8);
    this._nextNote = this.ctx.currentTime + 0.1;
    this._step = 0;
    // Schedule ahead on a timer rather than per-frame: audio timing must not
    // depend on the render loop, or it stutters whenever the GPU does.
    this._musicTimer = setInterval(() => this._schedule(), 120);
  }

  /** Which piece is playing, or null if none is. Read by Game._updateMusic,
   *  which is the one thing allowed to decide what should be. */
  get mode() { return this._musicTimer ? this._mode : null; }

  stopMusic() {
    if (!this._musicTimer) return;
    clearInterval(this._musicTimer);
    this._musicTimer = null;
    this.musicBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
  }

  /** Duck the music (pause menu) without tearing the schedule down. */
  duck(on) {
    if (!this.ready || !this._musicTimer) return;
    this.musicBus.gain.setTargetAtTime(
      on ? this.musicVolume * 0.25 : this.musicVolume, this.ctx.currentTime, 0.25
    );
  }

  _schedule() {
    const beat = (MUSIC[this._mode] ?? MUSIC.play).beat;
    while (this._nextNote < this.ctx.currentTime + 0.6) {
      this._pluck(this._nextNote, this._step);
      this._nextNote += beat;
      this._step++;
    }
  }

  _pluck(t, step) {
    const bar = Math.floor(step / 8);
    const M = MUSIC[this._mode] ?? MUSIC.play;
    if (M.tune) { this._tuneStep(t, step, M); return; }
    /* Every island transposes. `root` is the piece's own key; without it all
       seven would be different tunes in the same key, which from a hillside
       two hundred units away is one tune. */
    const root = M.root ?? ROOT;

    // A low drone every couple of bars, holding the key down.
    if (step % 16 === 0) {
      const d = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      d.type = 'sine';
      d.frequency.value = (root * M.oct) / 2;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(M.drone, t + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 8);
      d.connect(g).connect(this.musicBus);
      d.start(t);
      d.stop(t + 8.1);
    }

    /* A taiko thud on the downbeat — intro only. One drum is what turns a
       wandering koto line into an opening, and it's the cheapest possible
       version: a pitch-swept sine for the skin and a noise burst for the
       stick. */
    if (M.taiko && step % M.taiko === 0) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(128, t);
      o.frequency.exponentialRampToValueAtTime(46, t + 0.24);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.30, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(this.musicBus);
      o.start(t);
      o.stop(t + 0.55);
    }

    /* THE BASSLINE. Only the storm-dragon theme has one, and it is the single
       thing that makes that piece read as a band rather than as the koto going
       faster: a short square note walking the bottom of the scale on a steady
       pulse. Square rather than sine because it has to be heard under a full
       mix at speed, and short rather than held so it drives instead of drones. */
    if (M.bass && step % M.bass === 0) {
      const n = M.scale[Math.floor((step / M.bass) * 1.6) % 5];
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900;
      o.type = 'square';
      o.frequency.value = semi(n, root / 2);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.13, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + M.beat * 0.85);
      o.connect(f).connect(g).connect(this.musicBus);
      o.start(t);
      o.stop(t + M.beat);
    }

    /* The backbeat, half a step LATE on purpose — a tick on the beat just
       doubles the bass and disappears into it; between the beats it is the
       thing your head nods to. */
    if (M.snare && step % M.snare === 0) {
      const src = this.ctx.createBufferSource();
      const g = this.ctx.createGain();
      const f = this.ctx.createBiquadFilter();
      /* The shared noise buffer directly, NOT `_noise()` — that helper plays a
         one-shot on the SFX bus at `currentTime`, and a backbeat has to be
         scheduled ahead onto the MUSIC bus like every other note here.
         Routing drums through the sfx bus would also duck them with the sound
         effects slider, which is not what that slider means. */
      src.buffer = this._noiseBuf;
      src.loop = true;
      f.type = 'highpass';
      f.frequency.value = 1800;
      g.gain.setValueAtTime(0, t + M.beat * 0.5);
      g.gain.linearRampToValueAtTime(0.13, t + M.beat * 0.5 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + M.beat * 0.5 + 0.13);
      src.connect(f).connect(g).connect(this.musicBus);
      src.start(t + M.beat * 0.5);
      src.stop(t + M.beat * 0.5 + 0.16);
    }

    // Rests are what make it feel like music rather than an arpeggiator.
    const r = Math.sin(step * 12.9898 + bar * 78.233) * 43758.5453;
    const rnd = r - Math.floor(r);
    if (rnd > (M.rest ?? 0.72)) return;

    const octave = rnd > 0.55 ? 12 : rnd > 0.2 ? 0 : 24;
    const note = M.scale[Math.floor(rnd * 5 * 3) % 5] + octave;
    const freq = semi(note, root * M.oct);

    /* A plucked string: two detuned triangles through a lowpass that closes
       as the note decays — the filter sweep is what reads as "plucked"
       rather than "beeped". */
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 1.1;
    f.frequency.setValueAtTime(freq * 7, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(200, freq * 1.6), t + 0.9);

    for (const det of [-5, 6]) {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      /* Snake Way's slither: from a minor third under, in 70ms. */
      if (M.glide) {
        o.frequency.setValueAtTime(freq * 0.8409, t);
        o.frequency.exponentialRampToValueAtTime(freq, t + 0.07);
      }
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + 2.0);
    }
    /* Ryuuseki's theme doubles every pluck a fifth up. One extra oscillator,
       and it is the whole difference between a koto line and a fanfare — a
       bare fifth is the interval every heroic theme leans on. */
    if (M.fifths) {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq * 1.4983;   // a just fifth, slightly flat
      o.connect(f);
      o.start(t);
      o.stop(t + 1.4);
    }
    /* The frost shimmer: two octaves up, quiet, on its own gain so it rings
       on past the pluck rather than being closed off by the filter sweep with
       it. Frost and the Dojo only — it is glass, and glass everywhere is
       wind chimes. */
    if (M.bell) {
      const o = this.ctx.createOscillator();
      const bg = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq * 4;
      bg.gain.setValueAtTime(0, t);
      bg.gain.linearRampToValueAtTime(0.035, t + 0.02);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      o.connect(bg).connect(this.musicBus);
      o.start(t);
      o.stop(t + 2.7);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    f.connect(g).connect(this.musicBus);
  }

  /* ------------------------------ the strut ------------------------------ */

  /**
   * One eighth of Mr Satan's FIRST song, the backup now. See `MUSIC.satan` for
   * what it is and why it is not the song that was asked for.
   *
   * THE CHORDS ARE A TWELVE-BAR BLUES: I I I I / IV IV I I / V IV I V. Each
   * bar is eight steps. The lead plays a lick on the bars that start a line
   * and the brass answers on the others — call and response is what makes a
   * blues a conversation rather than a scale.
   */
  _strutStep(t, step, M) {
    const ctx = this.ctx;
    const bus = this.musicBus;
    const beat = M.beat;
    const s = step % 96;
    const barN = Math.floor(s / 8);
    const i = s % 8;
    const CHORD = [0, 0, 0, 0, 5, 5, 0, 0, 7, 5, 0, 7];
    const ch = CHORD[barN];
    const root = M.root * Math.pow(2, ch / 12);
    const hz = (semis, base = root) => base * Math.pow(2, semis / 12);

    const env = (g, at, peak, a, d) => {
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(peak, at + a);
      g.gain.exponentialRampToValueAtTime(0.0001, at + a + d);
    };
    const noise = (at, type, freq, peak, d) => {
      const src = ctx.createBufferSource();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      src.buffer = this._noiseBuf;
      src.loop = true;
      f.type = type;
      f.frequency.value = freq;
      env(g, at, peak, 0.004, d);
      src.connect(f).connect(g).connect(bus);
      src.start(at);
      src.stop(at + d + 0.05);
    };

    // FOUR ON THE FLOOR, and the open hat on every off-beat: disco, 1974.
    if (i % 2 === 0) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(44, t + 0.16);
      env(g, t, 0.34, 0.004, 0.26);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + 0.3);
    } else {
      noise(t, 'highpass', 7000, 0.07, 0.12);
    }
    // The clap on two and four.
    if (i === 2 || i === 6) noise(t, 'bandpass', 1500, 0.14, 0.14);

    // THE BASS: the octave bounce, root and its octave on alternate eighths,
    // with a walk up to the next chord on the bar's last step.
    {
      const next = CHORD[(barN + 1) % 12];
      const n = i === 7 ? (next - ch + 12) % 12 - 1 : (i % 2 ? 12 : 0);
      const o = ctx.createOscillator();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = hz(n, root / 2);
      f.type = 'lowpass';
      f.frequency.value = 700;
      env(g, t, 0.12, 0.008, beat * 0.8);
      o.connect(f).connect(g).connect(bus);
      o.start(t);
      o.stop(t + beat);
    }

    // THE BRASS: a dominant seventh, stabbed on the and-of-two and on four.
    const brass = (at, semis, peak, len, mute = false) => {
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      f.type = 'lowpass';
      f.Q.value = mute ? 6 : 1.5;
      f.frequency.setValueAtTime(mute ? 700 : 900, at);
      f.frequency.linearRampToValueAtTime(mute ? 1400 : 3200, at + 0.05);
      f.frequency.exponentialRampToValueAtTime(mute ? 500 : 1100, at + len);
      env(g, at, peak, 0.02, len);
      f.connect(g).connect(bus);
      for (const n of semis) {
        for (const det of [-7, 7]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = hz(n);
          o.detune.value = det;
          o.connect(f);
          o.start(at);
          o.stop(at + len + 0.05);
        }
      }
    };
    const answer = barN % 2 === 1 || barN === 10;
    if (answer && (i === 3 || i === 6)) brass(t, [4, 10, 12 + 7], 0.07, i === 6 ? 0.45 : 0.18);

    // THE LEAD: a square with a slow vibrato — the croon — on the call bars.
    const LICKS = [
      [12, null, 15, 16, null, 12, 10, null],     // the blue third, bent up
      [7, null, 10, 12, 10, 7, null, null],
      [null, null, 15, 16, 19, null, 16, 12],
      [12, 11, 10, 9, 8, 7, null, null],          // the turnaround: applause, please
    ];
    let lick = null;
    if (barN === 11) lick = LICKS[3];
    else if (!answer) lick = LICKS[[0, 1, 0, 1, 2, 0, 2, 1, 0, 1, 0, 1][barN]];
    const n = lick?.[i];
    if (n != null) {
      const mute = barN === 11;
      if (mute) {
        brass(t, [n], 0.09, beat * 0.95, true);
      } else {
        const o = ctx.createOscillator();
        const lfo = ctx.createOscillator();
        const lg = ctx.createGain();
        const f = ctx.createBiquadFilter();
        const g = ctx.createGain();
        o.type = 'square';
        o.frequency.value = hz(n);
        // A scoop into the note from a semitone under: the croon.
        o.frequency.setValueAtTime(hz(n - 1), t);
        o.frequency.linearRampToValueAtTime(hz(n), t + 0.05);
        lfo.frequency.value = 5.5;
        lg.gain.value = hz(n) * 0.012;
        lfo.connect(lg).connect(o.frequency);
        f.type = 'lowpass';
        f.frequency.value = 2400;
        env(g, t, 0.07, 0.015, beat * 1.4);
        o.connect(f).connect(g).connect(bus);
        o.start(t);
        lfo.start(t);
        o.stop(t + beat * 1.5);
        lfo.stop(t + beat * 1.5);
      }
    }

    // THE GONG that opens every chorus: he is a champion, in his own head.
    if (s === 0) {
      for (const [m, peak] of [[1, 0.09], [1.48, 0.05], [2.13, 0.04], [2.76, 0.025]]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 98 * m;
        env(g, t, peak, 0.01, 3.2);
        o.connect(g).connect(bus);
        o.start(t);
        o.stop(t + 3.3);
      }
      noise(t, 'bandpass', 3200, 0.05, 1.2);
    }
  }

  /* ----------------------------- the two new songs ----------------------------- */

  /** Which authored song `M.tune` names. The strut is the fallback, so a piece
   *  that names a tune nobody wrote still plays a song rather than silence. */
  _tuneStep(t, step, M) {
    if (M.tune === 'kungfu') this._kungfuStep(t, step, M);
    else if (M.tune === 'saucer') this._saucerStep(t, step, M);
    else this._strutStep(t, step, M);
  }

  /**
   * The band the two newer songs are played on: the voices the strut builds
   * inline, as one kit, so two songs do not carry two copies of an envelope.
   */
  _band(mix = 1) {
    const ctx = this.ctx;
    let bus = this.musicBus;
    /* A song's own level, as one gain in front of the bus — see `mix` on
       `MUSIC.satan` and `MUSIC.saucer`. */
    if (mix !== 1) {
      bus = ctx.createGain();
      bus.gain.value = mix;
      bus.connect(this.musicBus);
    }
    const env = (g, at, peak, a, d) => {
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(peak, at + a);
      g.gain.exponentialRampToValueAtTime(0.0001, at + a + d);
    };
    const noise = (at, type, freq, peak, d, q = 1) => {
      const src = ctx.createBufferSource();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      src.buffer = this._noiseBuf;
      src.loop = true;
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      env(g, at, peak, 0.004, d);
      src.connect(f).connect(g).connect(bus);
      src.start(at);
      src.stop(at + d + 0.05);
    };
    const kick = (at, peak, from = 150, to = 44) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(from, at);
      o.frequency.exponentialRampToValueAtTime(to, at + 0.16);
      env(g, at, peak, 0.004, 0.26);
      o.connect(g).connect(bus);
      o.start(at);
      o.stop(at + 0.3);
    };
    /* One pitched voice. `det` is a list of detunes — two saws a few cents
       apart is what makes a synth a SECTION — `scoop` starts the note that
       fraction under and slides up into it, and `vib` is a vibrato rate. */
    const osc = ({ at, hz, type = 'sine', peak, a = 0.01, d, cut = 0, q = 1, det = [0], scoop = 0, vib = 0, depth = 0.012 }) => {
      const g = ctx.createGain();
      env(g, at, peak, a, d);
      g.connect(bus);
      let head = g;
      if (cut) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = cut;
        f.Q.value = q;
        f.connect(g);
        head = f;
      }
      const end = at + a + d + 0.05;
      for (const c of det) {
        const o = ctx.createOscillator();
        o.type = type;
        o.detune.value = c;
        o.frequency.setValueAtTime(scoop ? hz * scoop : hz, at);
        if (scoop) o.frequency.exponentialRampToValueAtTime(hz, at + 0.06);
        if (vib) {
          const l = ctx.createOscillator();
          const lg = ctx.createGain();
          l.frequency.value = vib;
          lg.gain.value = hz * depth;
          l.connect(lg).connect(o.frequency);
          l.start(at);
          l.stop(end);
        }
        o.connect(head);
        o.start(at);
        o.stop(end);
      }
    };
    /* The brass section: every note two detuned saws through a filter that
       opens on the attack and closes on the tail — the "blat". The strut's
       own, lifted out. */
    const brass = (at, hzs, peak, len, mute = false) => {
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      f.type = 'lowpass';
      f.Q.value = mute ? 6 : 1.5;
      f.frequency.setValueAtTime(mute ? 700 : 900, at);
      f.frequency.linearRampToValueAtTime(mute ? 1400 : 3200, at + 0.05);
      f.frequency.exponentialRampToValueAtTime(mute ? 500 : 1100, at + len);
      env(g, at, peak, 0.02, len);
      f.connect(g).connect(bus);
      for (const h of hzs) {
        for (const c of [-7, 7]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = h;
          o.detune.value = c;
          o.connect(f);
          o.start(at);
          o.stop(at + len + 0.05);
        }
      }
    };
    return { ctx, bus, env, noise, kick, osc, brass };
  }

  /**
   * "HUAH!" — the kung-fu shout, from a buzz and three formants sliding from
   * an "oo" to an "ah". SYNTHESISED, NOT RECORDED: there is nobody's voice in
   * it, so there is no voice to license and no cast member to book, and it
   * sits in the band's mix the way a sampled grunt never would.
   */
  _shout(at, pitch = 1, peak = 0.12) {
    const B = this._band();
    const { ctx } = B;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(170 * pitch, at);
    o.frequency.linearRampToValueAtTime(235 * pitch, at + 0.05);
    o.frequency.exponentialRampToValueAtTime(115 * pitch, at + 0.32);
    const g = ctx.createGain();
    B.env(g, at, peak, 0.015, 0.3);
    g.connect(B.bus);
    for (const [f0, f1, k] of [[330, 760, 1], [880, 1220, 0.55], [2300, 2600, 0.22]]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 6;
      bp.frequency.setValueAtTime(f0, at);
      bp.frequency.linearRampToValueAtTime(f1, at + 0.07);
      const fg = ctx.createGain();
      fg.gain.value = 3 * k;
      o.connect(bp).connect(fg).connect(g);
    }
    o.start(at);
    o.stop(at + 0.36);
    // The breath in front of it.
    B.noise(at, 'bandpass', 1800, 0.05, 0.07, 2);
  }

  /** The kung-fu movie gong: four inharmonic partials and a shimmer. */
  _gong(at, peak = 1) {
    const B = this._band();
    for (const [m, p] of [[1, 0.09], [1.48, 0.05], [2.13, 0.04], [2.76, 0.025]]) {
      B.osc({ at, hz: 98 * m, peak: p * peak, a: 0.01, d: 3.2 });
    }
    B.noise(at, 'bandpass', 3200, 0.05 * peak, 1.2);
  }

  /**
   * One eighth of Mr Satan's road song. See `MUSIC.satan` for what it is and
   * why it is not the song that was asked for.
   *
   * SIXTEEN BARS IN FOUR SECTIONS, over one four-chord walk-down, E minor to
   * D to C to B7 — the flamenco cadence, which every kung-fu film poster has
   * underneath it and nobody owns:
   *   0-3   INTRO. The gong, a string run up three octaves, the band arriving
   *         a bar at a time, and the first HUAH on the downbeat of bar 3.
   *   4-11  THE GROOVE. Four on the floor, the octave bass, a wah guitar
   *         chicking on the off-beats, and the hook on an erhu-ish lead — a
   *         saw scooping into every note with a wide vibrato.
   *   12-15 THE SHOUT CHORUS. The run again, brass stabs, a HUAH on bars 12
   *         and 14, a whip-crack, and a higher HYAH to go round again on.
   */
  _kungfuStep(t, step, M) {
    const B = this._band(M.mix);
    const beat = M.beat;
    const s = step % 128;
    const barN = Math.floor(s / 8);
    const i = s % 8;
    const CH = [0, -2, -4, -5];
    const QUAL = [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7, 10]];
    const ch = CH[barN % 4];
    const qual = QUAL[barN % 4];
    const E2 = M.root;
    const hz = (n, base = E2 * 4) => base * Math.pow(2, n / 12);
    const shout = barN >= 12;

    // THE KIT, arriving: nothing for two bars, then the kick and hat, then all
    // of it from the groove on.
    if (barN >= 2) {
      if (i % 2 === 0) B.kick(t, 0.32);
      else B.noise(t, 'highpass', 7000, 0.06, 0.12);
    }
    if (barN >= 4) {
      if (i === 2 || i === 6) B.noise(t, 'bandpass', 1500, 0.13, 0.14);
      B.noise(t + beat / 2, 'highpass', 9000, 0.022, 0.04);
    }

    // THE BASS, from bar 2: the octave bounce, and on the bar's last eighth a
    // semitone over the next chord's root, so every change is fallen into.
    if (barN >= 2) {
      const next = CH[(barN + 1) % 4];
      const n = i === 7 ? next - ch + 1 : (i % 2 ? 12 : 0);
      B.osc({ at: t, hz: hz(ch + n, E2), type: 'sawtooth', peak: 0.12, a: 0.008, d: beat * 0.75, cut: 650 });
    }

    // THE STRINGS: the chord, held for the bar, under everything.
    if (i === 0) {
      for (const q of qual) {
        B.osc({ at: t, hz: hz(ch + q, E2 * 2) * 2, type: 'sawtooth', peak: 0.012, a: 0.3, d: beat * 7.5, cut: 1800, det: [-9, 9] });
      }
    }

    // THE RUN, on the intro's first bar and the chorus's: sixteenths up the
    // pentatonic from E3 to E6.
    if (barN === 0 || barN === 12) {
      const RUN = [-12, -9, -7, -5, -2, 0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];
      for (const k of [0, 1]) {
        B.osc({ at: t + (k * beat) / 2, hz: hz(RUN[i * 2 + k]), type: 'sawtooth', peak: 0.028, a: 0.005, d: 0.13, cut: 3200, det: [-6, 6] });
      }
    }

    // THE WAH GUITAR, from the groove: the chord through a bandpass swept up
    // on every off-beat — the "chicka".
    if (barN >= 4 && i % 2 === 1) {
      const { ctx } = B;
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      f.type = 'bandpass';
      f.Q.value = 5;
      f.frequency.setValueAtTime(450, t);
      f.frequency.exponentialRampToValueAtTime(2200, t + 0.07);
      B.env(g, t, 0.07, 0.004, 0.09);
      f.connect(g).connect(B.bus);
      for (const q of qual) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(ch + q, E2 * 2);
        o.connect(f);
        o.start(t);
        o.stop(t + 0.13);
      }
    }

    // THE HOOK. Semitones from E4, one row per bar of the groove and two for
    // the chorus's answers. Original: written for this, out of the five notes
    // of E minor pentatonic and the B7's leading tone.
    const HOOK = {
      4: [7, null, 5, 7, 10, null, 7, 5],
      5: [3, 5, 0, null, null, 3, 0, -2],
      6: [12, null, 10, 7, null, 5, 7, null],
      7: [7, null, 3, 2, null, -1, null, null],
      8: [7, null, 5, 7, 10, 12, 15, null],
      9: [3, 5, 0, null, null, 3, 0, -2],
      10: [15, null, 12, 10, null, 7, 5, null],
      11: [7, null, 3, 2, null, -1, null, null],
      13: [null, null, 7, 10, 12, null, 10, 7],
    };
    const n = HOOK[barN]?.[i];
    if (n != null) {
      B.osc({ at: t, hz: hz(n), type: 'sawtooth', peak: 0.055, a: 0.02, d: beat * 1.3, cut: 1900, q: 2, scoop: 0.94, vib: 6, depth: 0.014 });
    }

    // THE CHORUS: brass stabs on the downbeat, the and-of-two and four.
    if (shout && (i === 0 || i === 3 || i === 6) && barN !== 15) {
      B.brass(t, qual.map((q) => hz(ch + q, E2 * 4)), 0.06, i === 6 ? 0.4 : 0.18);
    }

    // THE SHOUTS, and the things that happen round them.
    if (barN === 3 && i === 0) this._shout(t);
    if ((barN === 12 || barN === 14) && i === 0) this._shout(t);
    if (barN === 15 && i === 6) this._shout(t, 1.3, 0.13);
    if (barN === 13 && i === 4) B.noise(t, 'highpass', 2500, 0.16, 0.06, 0.7);
    if (s === 0) this._gong(t);
  }

  /**
   * One eighth of the arena island's fanfare. See `MUSIC.saucer`.
   *
   * SIXTEEN BARS, A MARCH IN F, the arena theme's own key:
   *   0-1   THE FANFARE. Trumpets up the F chord to a held top C over a snare
   *         roll, and a crash — the gates of a funfair.
   *   2-15  THE TUNE, on a calliope: a steam organ's tremolo, glockenspiel
   *         doubling it in the second half. I-V7 for eight bars, the IV, and
   *         back through a chromatic climb.
   * Under all of it the oom-pah: a tuba on one and three, the band on two and
   * four. And the three jokes a funfair is not a funfair without: a honk, a
   * slide whistle, and a cymbal a beat too eager.
   */
  _saucerStep(t, step, M) {
    const B = this._band(M.mix);
    const beat = M.beat;
    const s = step % 128;
    const barN = Math.floor(s / 8);
    const i = s % 8;
    const F3 = M.root;
    const hz = (n, base = F3 * 2) => base * Math.pow(2, n / 12);
    const ROOTS = [0, 0, 0, 0, 7, 7, 7, 7, 0, 0, 5, 5, 0, 0, 7, 7];
    const r = ROOTS[barN];
    const qual = r === 7 ? [0, 4, 7, 10] : [0, 4, 7];
    const chordAt = (base) => qual.map((q) => hz(r + q, base));

    // OOM: the tuba, root on one and the fifth under it on three.
    if (i === 0 || i === 4) {
      const n = i === 0 ? r : r - 5;
      B.osc({ at: t, hz: hz(n, F3 / 2), type: 'triangle', peak: 0.2, a: 0.01, d: beat * 1.4 });
      B.osc({ at: t, hz: hz(n, F3 / 2), type: 'sawtooth', peak: 0.05, a: 0.01, d: beat * 1.2, cut: 420 });
      B.kick(t, 0.2, 110, 55);
    }
    // PAH: the band, short, on two and four, and the snare with it.
    if (i === 2 || i === 6) {
      for (const h of chordAt(F3)) B.osc({ at: t, hz: h, type: 'square', peak: 0.018, a: 0.005, d: beat * 0.5, cut: 1600 });
      B.noise(t, 'bandpass', 2600, 0.06, 0.08, 1.2);
    }

    // THE FANFARE.
    const FANFARE = [[7, null, 7, 7, 12, null, 16, null], [19, null, null, null, 16, 19, 24, null]];
    if (barN < 2) {
      const n = FANFARE[barN][i];
      if (n != null) B.brass(t, [hz(n), hz(n - 12)], 0.07, n === 19 && i === 0 ? beat * 3.6 : beat * 0.8);
      // The roll under the held note, climbing.
      if (barN === 1 && i < 4) {
        for (const k of [0, 1]) B.noise(t + (k * beat) / 2, 'bandpass', 2600, 0.03 + i * 0.012, 0.06, 1.2);
      }
    }
    if ((barN === 0 || barN === 8) && i === 0) B.noise(t, 'highpass', 5000, 0.07, 1.4);
    // The eager cymbal: a crash on the and-of-four, one eighth before the tune.
    if (barN === 1 && i === 7) B.noise(t, 'highpass', 5000, 0.06, 1.1);

    // THE TUNE. Semitones from F4. Written for this.
    const TUNE = [
      null, null,
      [12, null, 11, 12, 16, null, 12, null],
      [9, 8, 9, 12, 7, null, null, null],
      [7, null, 6, 7, 11, null, 7, null],
      [14, 13, 14, 17, 14, null, null, null],
      [17, null, 16, 14, 11, null, 7, null],
      [-1, null, 2, null, 5, null, 11, null],
      [12, null, 11, 12, 16, null, 19, null],
      [16, null, 14, 16, 12, null, null, null],
      [17, null, 16, 17, 21, null, 17, null],
      [21, 20, 21, 17, 14, null, null, null],
      [12, null, 11, 12, 16, null, 12, null],
      [9, 8, 9, 12, 7, null, null, null],
      [7, 6, 7, 11, 14, 13, 14, 17],
      [19, null, 18, 19, null, 14, 11, 7],
    ];
    const n = TUNE[barN]?.[i];
    if (n != null) {
      const h = hz(n);
      // The calliope: a pipe (triangle and its octave), wobbling.
      B.osc({ at: t, hz: h, type: 'triangle', peak: 0.075, a: 0.012, d: beat * 1.1, vib: 7.5, depth: 0.01 });
      B.osc({ at: t, hz: h * 2, type: 'sine', peak: 0.025, a: 0.012, d: beat * 0.9, vib: 7.5, depth: 0.01 });
      // The glockenspiel, doubling it in the back half.
      if (barN >= 8) {
        B.osc({ at: t, hz: h * 2, type: 'sine', peak: 0.03, a: 0.002, d: 0.5 });
        B.osc({ at: t, hz: h * 2 * 2.76, type: 'sine', peak: 0.008, a: 0.002, d: 0.14 });
      }
    }

    // THE HONK, in the rest after the IV: a bicycle horn, twice.
    if (barN === 11 && (i === 5 || i === 6)) {
      B.osc({ at: t, hz: 330, type: 'square', peak: 0.05, a: 0.005, d: beat * 0.6, cut: 1400, q: 5, det: [-20, 20] });
    }
    // THE SLIDE WHISTLE, up into the next time round.
    if (barN === 15 && i === 4) {
      const { ctx } = B;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(620, t);
      o.frequency.exponentialRampToValueAtTime(2100, t + beat * 3.4);
      B.env(g, t, 0.045, 0.04, beat * 3.4);
      o.connect(g).connect(B.bus);
      o.start(t);
      o.stop(t + beat * 3.6);
    }
  }
}
