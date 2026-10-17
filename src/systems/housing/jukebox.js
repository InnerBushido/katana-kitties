import { MUSIC_FILES } from '../../core/musicfiles.js';
import { JUKEBOX_FILES } from './jukeboxfiles.js';

/* ---------------------------------------------------------------------------
   THE ROSHI BOOMBOX — what plays on her bridge and her island.

   Every track is a RECORDING with a PROCEDURAL STAND-IN (non-negotiable 9).
   `id` is a key in MUSIC_FILES once `tools/capture/jukebox-music.mjs` has
   measured it into `jukeboxfiles.js`; until then, or if the mp3 is deleted,
   `fallback` — one of audio.js's own pieces — plays instead, and the card
   says so ("(tune)") rather than pretending.

   The recordings are generated with ElevenLabs Music (pre-authorised for
   this feature, Oct 2026). The prompts are kept here so a re-generation is
   reproducible.
--------------------------------------------------------------------------- */

/* Merge the measured recordings into the table audio.js reads. A missing
   generated file is an empty table, which is the procedural game. */
Object.assign(MUSIC_FILES, JUKEBOX_FILES);

/* THE SHRINE'S SONG (activities.js `_pray`) — not a jukebox track, so it is
   not in the generated table: it plays ONCE, start to end, while a kitten
   prays, and the second gong goes when it is over. ElevenLabs Music,
   eleven_music_v2_5, Oct 2026: "Calm Japanese Shinto shrine music ...
   shakuhachi over soft koto, wind chimes, a low temple bowl ... 60 BPM ... a
   complete piece with a real ending". 45.0s; the last 3.2s are its own
   ring-out. Measured -15.7 LUFS against MOSS GARDEN's -14.9 at mix 0.5,
   hence 0.55. Delete the mp3 and the prayer plays `dojo` instead. */
MUSIC_FILES.shrinePrayer = {
  file: 'music/shrinePrayer.mp3',
  name: 'SHRINE PRAYER',
  level: 'home',
  spb: 1,
  first: 0,
  loop: [0, 45],
  length: 45,
  mix: 0.55,
};

/* THE TEA CEREMONY'S (activities.js `_tea`), the shrine song's sister: once
   through from the first kneel. ElevenLabs Music, eleven_music_v2_5, Oct
   2026, 2 takes at 450 credits each: "Gentle Japanese tea ceremony music ...
   solo koto with a soft shakuhachi melody ... 66 BPM ... a clear, complete
   ending". Take 2 (generation AAAxwk5rJyYPyUqptljp) was kept: it rises out of
   1.1s of silence while the kettle is whisked and fades from 24s, under the
   bow at 22s, to nothing at 28.5s — the ceremony ends at 26. Take 1 started at
   full level and rang out at 27s, after the kittens had stood up.
   Measured -21.7 LUFS against the shrine's -15.7 at 0.55, and its peak is
   -5.2 dB, so it is levelled in the mix (0.60), not in the file. Delete the
   mp3 and the ceremony plays `frost` instead. */
MUSIC_FILES.teaCeremony = {
  file: 'music/teaCeremony.mp3',
  name: 'TEA CEREMONY',
  level: 'home',
  spb: 60 / 66,
  first: 0,
  loop: [0, 30],
  length: 30,
  mix: 0.6,
};

export const JUKEBOX = [
  {
    id: 'homeSurf', name: 'TURTLE BEACH', fallback: 'saucer',
    prompt: 'Upbeat 1960s surf rock with koto and shamisen accents, sunny holiday vibe, twangy reverb guitar, 120 bpm, instrumental, loopable',
  },
  {
    id: 'homeLofi', name: 'TATAMI LO-FI', fallback: 'dojo',
    prompt: 'Cozy lo-fi hip hop with koto, soft vinyl crackle, gentle shakuhachi melody, relaxed 80 bpm, instrumental, loopable, for a little Japanese house',
  },
  {
    id: 'homeFestival', name: 'MATSURI NIGHT', fallback: 'bamboo',
    prompt: 'Joyful Japanese summer festival music, taiko drums, shinobue flute, hand claps, bouncy 128 bpm, kid friendly, instrumental, loopable',
  },
  {
    id: 'homeGarden', name: 'MOSS GARDEN', fallback: 'frost',
    prompt: 'Peaceful ambient Japanese garden music, koto and soft bells, water feel, slow 70 bpm, calm, instrumental, loopable',
  },
  {
    id: 'homeChiptune', name: 'KITTEN 8-BIT', fallback: 'snake',
    prompt: 'Cheerful chiptune with a pentatonic Japanese melody, bright square waves, playful kitten adventure, 140 bpm, instrumental, loopable',
  },
  {
    id: 'homeSunset', name: 'SUNSET SHAMISEN', fallback: 'dusk',
    prompt: 'Warm sunset shamisen and acoustic guitar duet, island breeze, gentle hand percussion, 96 bpm, instrumental, loopable',
  },
];

export const JUKEBOX_BY_ID = Object.fromEntries(JUKEBOX.map((t) => [t.id, t]));

/* THE PREVIEW STARTS WHERE THE MUSIC DOES. Richard: "When selecting Matsuri
   Night and Moss Garden from boombox to preview how it sounds, there is just
   silence at the beginning of the song, can we skip to further in the song".
   Measured with ffmpeg's ebur128, momentary loudness a second at a time:
     MATSURI NIGHT  -47 LUFS at 1s, a soft intro to 13s, full (-11) from 20s
     MOSS GARDEN    -57 at 1s, a fade-in to 8s, the full section from 28s
     TATAMI LO-FI   a sparse -33/-38 pulse until 24s, full (-11) from there
   The other three are at -13 to -16 from their first second and start at 0.
   A preview is its own MUSIC_FILES entry — the same file, starting `first`
   seconds in and wrapping the whole arrangement as usual — so audio.js plays
   it like any other piece, and choosing the track still starts it from the
   top on the island. */
export const PREVIEW_AT = { homeFestival: 20, homeGarden: 28, homeLofi: 24 };
for (const [id, at] of Object.entries(PREVIEW_AT)) {
  if (MUSIC_FILES[id]) MUSIC_FILES[`${id}Preview`] = { ...MUSIC_FILES[id], first: at };
}

/** The piece to play while a kitten AUDITIONS track `id` on the boombox card. */
export function previewOf(id) {
  return MUSIC_FILES[`${id}Preview`] ? `${id}Preview` : id;
}

/** Is this track's recording in the build at all? */
export function hasRecording(id) {
  return !!JUKEBOX_FILES[id];
}
