/* ---------------------------------------------------------------------------
   HOW LONG AN MP3 IS, in one file and with no dependencies — png.mjs's twin.

   `world-check` cannot ask an <audio> element (there is no DOM) and must not
   shell out to ffprobe (it is not on every machine that runs the checks), but
   a bubble that has to outlast its recording is a question about the
   recording's real length. The same lesson as the sprites: a number typed
   into a check next to the clip is reasoned, and goes stale the first time
   the clip is re-cut.

   So it WALKS THE FRAMES rather than trusting a header. A Xing/Info frame
   says how many frames follow, but only when the encoder wrote one, and an
   estimate from file size and the first frame's bitrate is wrong for every
   VBR file — which is what `lionheart-vo.mjs` writes (`-q:a 4`). Walking
   costs a millisecond and has no case where it guesses.

   It counts the Xing frame and LAME's encoder delay and padding as sound,
   so it reads 50-65ms LONGER than ffprobe (measured on all nine of
   Lionheart's clips and sat_over). That is the safe side for every question
   asked of it — "does the card outlast the voice" — and is left alone.

   Scope: MPEG 1, 2 and 2.5, Layer III, with or without an ID3v2 tag in front.
   Anything else throws rather than returning a plausible number.
--------------------------------------------------------------------------- */

import { readFileSync } from 'node:fs';

// Layer III bitrates, kbps, by [MPEG-1 ? 0 : 1][index].
const KBPS = [
  [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
];
const RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/**
 * @param {string|URL} file
 * @returns {{secs:number, frames:number, rate:number}}
 */
export function mp3Duration(file) {
  const b = readFileSync(file);
  let p = 0;
  // ID3v2: "ID3", two version bytes, flags, then a 28-bit synchsafe size.
  if (b.length > 10 && b.toString('latin1', 0, 3) === 'ID3') {
    p = 10 + ((b[6] & 0x7f) << 21 | (b[7] & 0x7f) << 14 | (b[8] & 0x7f) << 7 | (b[9] & 0x7f));
  }
  let frames = 0;
  let samples = 0;
  let rate = 0;
  while (p + 4 <= b.length) {
    if (b[p] !== 0xff || (b[p + 1] & 0xe0) !== 0xe0) {
      // A trailing ID3v1 tag is the only thing allowed after the last frame.
      if (frames && b.toString('latin1', p, p + 3) === 'TAG') break;
      throw new Error(`mp3: lost frame sync at byte ${p} of ${file}`);
    }
    const ver = (b[p + 1] >> 3) & 3; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
    const layer = (b[p + 1] >> 1) & 3; // 1 = Layer III
    const bi = b[p + 2] >> 4;
    const si = (b[p + 2] >> 2) & 3;
    const pad = (b[p + 2] >> 1) & 1;
    if (ver === 1 || layer !== 1 || bi === 0 || bi === 15 || si === 3) {
      throw new Error(`mp3: not a Layer III frame at byte ${p} of ${file}`);
    }
    const sr = RATES[ver][si];
    const kbps = KBPS[ver === 3 ? 0 : 1][bi];
    const per = ver === 3 ? 1152 : 576;
    const len = Math.floor((per / 8) * kbps * 1000 / sr) + pad;
    frames++;
    samples += per;
    rate = sr;
    p += len;
  }
  if (!frames) throw new Error(`mp3: no frames in ${file}`);
  return { secs: samples / rate, frames, rate };
}
