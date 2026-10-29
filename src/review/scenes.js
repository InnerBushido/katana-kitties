/* ---------------------------------------------------------------------------
   THE SCENES THE REVIEW PAGE KNOWS (review.html; dev only).

   Each entry reads the scene's OWN tables, so the timeline under a video
   cannot disagree with the game: the lines and their voice files, the cuts
   with their shot names, and the cues for what the actor does. A cutscene
   added later gets reviewed by adding one entry here that maps its tables to
   this shape:

     { id, title, lines: [{ id, text, voice, len, cuts: [{ t, name }],
                            acts: [{ t, name }] }] }

   `t` is seconds from the START OF THAT LINE'S VOICE, which is what the
   review is synced on (sync.js). A video of a scene not listed here is still
   reviewable: notes are then kept on the video's own clock.
--------------------------------------------------------------------------- */
import { voicePath } from '../core/audio.js';

export const SCENES = {
  'payne-intro': async () => {
    const { PAYNE_INTRO, INTRO_CUTS } = await import('../systems/payneintro.js');
    // the clips by the names the act lists use: the sprite editor's PAYNE tab edits the same table
    const { INTRO_CLIPS } = await import('../systems/payneclips.js');
    return {
      id: 'payne-intro',
      title: "Payne's introduction to the world",
      source: 'src/systems/payneintro.js',
      lines: PAYNE_INTRO.map((r) => ({
        id: r.voice,
        text: r.text,
        voice: voicePath(r.voice),
        len: INTRO_CUTS[r.shot].len,
        cuts: INTRO_CUTS[r.shot].cuts.map(([name, t]) => ({ t, name })),
        acts: r.act.map(([name, t]) => {
          const c = INTRO_CLIPS[name];
          return { t, name, what: c ? `${c.take} ${c.from}–${c.to}${c.back ? ' ⇄' : ''}` : '?', edit: `/sprites.html?payne=${name}` };
        }),
      })),
    };
  },
};

const letters = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/**
 * The SCRIPT's words of a line, each with a time off whisper's measurement.
 *
 * Whisper's words are not the script's: it heard "worlds" as "walls", split
 * "Word-spirits" into two, made "they're" "they are", and dropped line 11's
 * opening "And". Matching one-to-one only works when the counts agree, which
 * they did on 11 of 13 lines. So where they disagree, both are laid along
 * their LETTERS and each script word takes the time of the same fraction of
 * the way through the line's letters: a split or a merge then moves the
 * times inside one word, not every word after it.
 */
export function lineWords(text, measured) {
  const said = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  const ws = measured?.words ?? [];
  if (!ws.length) return [];
  if (said.length === ws.length) return ws.map(([, a, b], i) => ({ w: said[i], a, b }));
  const wl = ws.map(([w]) => Math.max(1, letters(w).length));
  const W = wl.reduce((s, x) => s + x, 0);
  const sl = said.map((w) => Math.max(1, letters(w).length));
  const S = sl.reduce((s, x) => s + x, 0);
  // the time `x` (0..1) of the way through the line's letters
  const at = (x) => {
    let c = 0;
    for (let j = 0; j < ws.length; j++) {
      const c1 = c + wl[j] / W;
      if (x <= c1 || j === ws.length - 1) return ws[j][1] + Math.min(1, Math.max(0, (x - c) / (c1 - c))) * (ws[j][2] - ws[j][1]);
      c = c1;
    }
    return ws[ws.length - 1][2];
  };
  /* ...and an edge within two letters of one of whisper's word edges takes
     that edge. Without this, "they're" (6 letters) against "they are" (7)
     put line 6's "run" one letter early, at the END of "yours" (6.04s), when
     "Run" starts after a pause (at 7.06, measured): a word edge is where the
     time jumps, and a fraction just short of it lands before the jump. */
  const starts = [], ends = [];
  let cw = 0;
  for (let j = 0; j < ws.length; j++) { starts.push([cw / W, ws[j][1]]); cw += wl[j]; ends.push([cw / W, ws[j][2]]); }
  const snap = (x, edges, fallback) => {
    let best = null;
    for (const [e, t] of edges) if (Math.abs(e - x) * W <= 2 && (!best || Math.abs(e - x) < Math.abs(best[0] - x))) best = [e, t];
    return best ? best[1] : fallback;
  };
  let c = 0;
  return said.map((w, i) => {
    const x0 = c / S, x1 = (c + sl[i]) / S;
    c += sl[i];
    const a = snap(x0, starts, at(x0 + 1e-6));
    const b = Math.max(a, snap(x1, ends, at(x1 - 1e-6)));
    return { w, a: +a.toFixed(2), b: +b.toFixed(2) };
  });
}
