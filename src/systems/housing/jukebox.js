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

/** Is this track's recording in the build at all? */
export function hasRecording(id) {
  return !!JUKEBOX_FILES[id];
}
