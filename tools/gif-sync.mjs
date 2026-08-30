/* Make the clips that sit side by side LOOP TOGETHER.
   =======================================================================
   Two GIFs shown next to each other start in step and drift apart on the first
   wrap, because a browser restarts each one the moment it ends and nothing
   coordinates them. A minute in, the keyboard clip is slashing while the
   controller clip is still walking, and the pair stops reading as "the same
   demonstration, twice" — which is the only reason they are side by side.

   NOTHING IS RE-ENCODED. A frame's duration lives in two bytes of its Graphic
   Control Extension, so this rewrites delays and touches no pixels; the files
   do not change size by a single byte. Re-filming to a matching length was the
   alternative and cannot be relied on — two takes of a hand-driven game are
   never the same length twice, so the drift would come back with the next
   capture.

   TWO PASSES, AND THE FIRST ONE IS THE IMPORTANT ONE.

   `--tail` sets every clip's LAST frame. Both movement clips shipped with a
   THREE SECOND hold on their final frame, which is the freeze Richard watched
   the Ryuuseki clip and named: a held frame with nothing on it to read does not
   look like a pause, it looks like the picture has broken. A short tail is a
   beat; a long one is a bug report.

   The second pass takes what is left — the clips genuinely differ in length,
   because they show a different number of beats — and HOLDS THE SHORTER CLIP'S
   LAST FRAME for it.

   IT USED TO SPREAD THAT OVER EVERY FRAME INSTEAD, and that was the bug
   Richard found by watching the pair: the controller clip had been stretched to
   match the keyboard one. The idea had been that two hundredths of a second a
   frame is invisible. It is not two hundredths evenly — delays are whole
   centiseconds, so 8cs frames became 10cs and 14cs frames became 17cs, a
   quarter slower on the fast ones and an eighth on the slow ones. Every beat
   landed at a different moment from its twin, which is precisely what the pair
   is side by side to compare. See `padTail` below.

   GIF delays are stored in CENTISECONDS, so the totals come out EXACTLY equal
   rather than nearly equal — and "nearly" is worth nothing here, because it
   drifts by exactly that much on every wrap, forever.

     node tools/gif-sync.mjs public/help/move-keys.gif public/help/move-pad.gif
     node tools/gif-sync.mjs --write --tail=60 <the same files>

   Without `--write` it only reports. `world-check` asserts the result, so a
   re-filmed clip fails there rather than drifting quietly on the page. */
import { readFileSync, writeFileSync } from 'node:fs';

/** Every Graphic Control Extension in the file, as byte offsets. */
export function gceOffsets(buf) {
  const out = [];
  let i = 6 + 7;                                    // header + logical screen
  const flags = buf[10];
  if (flags & 0x80) i += 3 * (2 << (flags & 7));    // global colour table
  while (i < buf.length) {
    const b = buf[i];
    if (b === 0x3b) break;                          // trailer
    if (b === 0x21) {                               // extension
      if (buf[i + 1] === 0xf9) out.push(i);
      i += 2;
      while (buf[i]) i += buf[i] + 1;               // sub-blocks
      i++;
      continue;
    }
    if (b === 0x2c) {                               // image descriptor
      const lf = buf[i + 9];
      i += 10;
      if (lf & 0x80) i += 3 * (2 << (lf & 7));      // local colour table
      i++;                                          // LZW minimum code size
      while (buf[i]) i += buf[i] + 1;
      i++;
      continue;
    }
    i++;                                            // shouldn't happen
  }
  return out;
}

/** Per-frame delays in centiseconds, in file order. */
export function delaysCs(buf) {
  return gceOffsets(buf).map((o) => buf.readUInt16LE(o + 4));
}

/** Total run time in milliseconds. */
export function durationMs(buf) {
  return delaysCs(buf).reduce((a, b) => a + b, 0) * 10;
}

/** Write `cs` into frame `i`'s delay. The field is 16 bits; a clip that
 *  overflowed it would silently wrap to a near-zero delay, which reads as the
 *  encoder having broken rather than as a bad argument. */
function setDelay(buf, offsets, i, cs) {
  if (cs < 0 || cs > 0xffff) throw new Error(`delay ${cs}cs does not fit`);
  buf.writeUInt16LE(cs, offsets[i] + 4);
}

/** Put the whole shortfall on the LAST frame — the tail, and nowhere else.
 *
 *  THIS REPLACED A `spread` THAT PUT IT ON EVERY FRAME, AND THE REPLACEMENT IS
 *  THE WHOLE POINT OF THIS FILE NOW. The reasoning for spreading was that two
 *  hundredths of a second a frame is invisible; the reasoning was wrong, and it
 *  was wrong because the arithmetic is not two hundredths evenly. Delays are
 *  whole centiseconds, so a clip whose frames run at 8cs and 14cs takes the
 *  padding as 10cs and 17cs — a QUARTER slower on its fast frames and an eighth
 *  on its slow ones, unevenly, which is not a shade slower but a different
 *  take. Richard watched the pair and said the controller clip had been
 *  stretched to match the keyboard one. It had.
 *
 *  A pause is cheap and a wrong speed is not. The two clips are the same
 *  demonstration on two devices, so every beat in them has to happen at the
 *  same moment; what the shorter one owes at the end is a WAIT, and a wait on a
 *  frame that still carries its caption is time to read it, which is the thing
 *  Richard has asked for twice. See `docs/notes/help.md`. */
export function padTail(buf, cs) {
  const off = gceOffsets(buf);
  if (!off.length || cs <= 0) return buf;
  const last = off.length - 1;
  setDelay(buf, off, last, buf.readUInt16LE(off[last] + 4) + cs);
  return buf;
}

/* ------------------------------- the tool --------------------------------
   ONLY WHEN RUN, NOT WHEN IMPORTED. `world-check` imports `durationMs` and
   `delaysCs` from here; without this guard the CLI's usage line printed itself
   into the middle of a check run, which reads as a check having gone wrong. */
const RUN_DIRECTLY = process.argv[1]
  && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
const args = RUN_DIRECTLY ? process.argv.slice(2) : [];
const write = args.includes('--write');
const tailArg = args.find((a) => a.startsWith('--tail='));
const tail = tailArg ? Number(tailArg.slice(7)) : null;
const files = args.filter((a) => !a.startsWith('--'));

if (files.length >= 2) {
  const bufs = files.map((f) => readFileSync(f));
  if (tail != null) {
    for (const b of bufs) {
      const off = gceOffsets(b);
      setDelay(b, off, off.length - 1, tail);
    }
  }
  const ms = bufs.map(durationMs);
  const longest = Math.max(...ms);
  for (const [i, f] of files.entries()) {
    const short = longest - ms[i];
    const n = delaysCs(bufs[i]).length;
    console.log(`${f}  ${n} frames  ${(ms[i] / 1000).toFixed(2)}s`
      + (short ? `  ${write ? 'holding' : 'short by'} ${(short / 1000).toFixed(2)}s`
        + ' on the last frame' : '  (longest)'));
    if (write) writeFileSync(f, padTail(bufs[i], short / 10));
  }
  if (write) console.log('written; re-run without --write to confirm');
} else if (RUN_DIRECTLY) {
  console.log('usage: node tools/gif-sync.mjs [--write] [--tail=<cs>] <a.gif> <b.gif> ...');
}
