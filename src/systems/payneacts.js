/* ---------------------------------------------------------------------------
   WHAT PAYNE DOES ON EACH LINE, AS RICHARD EDITED IT — src/payneacts.json.

   Richard, Oct 2026: "Is there a way to modify the lines in the Sprite Editor
   to add or delete clips? Since modifying the clips modifies the lines, it's a
   good way for me to adjust the clips and preview it in the editor, but I lack
   the ability to delete clips from it." So a line's act list — which clip
   starts when — is edited in the sprite editor's PAYNE tab too.

   OVERRIDES ONLY, like src/tuning.json. A line's cues as payneintro.js writes
   them stay the defaults, because that is where the comment beside each cue
   says which word it is on and whose note put it there; the file holds only
   the lines Richard has changed, whole, and `{}` is the intro as written.
   (Moving every act into the JSON, the way the clips were, was the other way:
   it would have thrown those comments away.)

   ONE CLEANER FOR THREE READERS — the game (payneintro.js), the dev server's
   save (vite.config.js, which refuses the whole save if anything is wrong, so
   a cue is never quietly dropped) and world-check. Pure, and imports nothing,
   so the server can load it without three.js. The game takes what is good
   and keeps the code's cues for a line that is not: a bad hand edit costs a
   line its edit, never the scene (the ninth non-negotiable's rule).
--------------------------------------------------------------------------- */

/** A line id the intro has the shape of. Which ones exist is the game's business: an unknown one is ignored there. */
export const LINE_ID = /^payne_intro_\d{1,2}$/;

/**
 * Check an overrides object. A cue is `[clip, at, from?, to?, rate?]` exactly
 * as payneintro.js writes it (`actFrame` reads both).
 * @param {object} o           `{ payne_intro_N: { act: [...], hold? } }`
 * @param {string[]} clipNames the clips that exist
 * @returns {{ acts: object, bad: string[] }} the good lines, cues in time order, and why each bad one is bad
 */
export function cleanActs(o, clipNames) {
  const acts = {};
  const bad = [];
  for (const [id, L] of Object.entries(o ?? {})) {
    if (!LINE_ID.test(id)) { bad.push(`"${id}" is not one of the intro's lines`); continue; }
    const rows = Array.isArray(L?.act) ? L.act : [];
    if (!rows.length) { bad.push(`${id}: a line needs at least one cue — she has to be doing something`); continue; }
    const why = [];
    const act = rows.map((e, i) => {
      const [clip, at, from = null, to = null, rate = null] = Array.isArray(e) ? e : [];
      const n = `cue ${i + 1}`;
      if (!clipNames.includes(clip)) why.push(`${n}: there is no clip "${clip}"`);
      if (!(Number.isFinite(at) && at >= -2 && at <= 60)) why.push(`${n}: ${at} is not a time from -2 to 60 seconds`);
      for (const [k, v] of [['from', from], ['to', to]]) {
        if (v != null && !(Number.isInteger(v) && v >= 0 && v < 1000)) why.push(`${n}: ${k} ${v} is not a frame of the take`);
      }
      if (rate != null && !(Number.isFinite(rate) && rate > 0 && rate <= 4)) why.push(`${n}: speed ${rate} is not above 0 and up to 4`);
      const out = [clip, Number.isFinite(at) ? Math.round(at * 1000) / 1000 : at, from, to, rate];
      while (out.length > 2 && out.at(-1) == null) out.pop();
      return out;
    }).sort((a, b) => a[1] - b[1]);
    // the clip on show is the LAST cue whose time has come: two at one moment would hide one of them
    for (let i = 1; i < act.length; i++) if (act[i][1] === act[i - 1][1]) why.push(`${act[i - 1][0]} and ${act[i][0]} both start at ${act[i][1]}s`);
    const hold = L.hold ?? 0;
    if (!(Number.isFinite(hold) && hold >= 0 && hold <= 10)) why.push(`hold ${hold} is not 0 to 10 seconds`);
    if (why.length) { bad.push(`${id}: ${why.join('; ')}`); continue; }
    acts[id] = { act, hold };
  }
  return { acts, bad };
}

/**
 * The script with the overrides in force. ALWAYS NEW ROWS AND NEW CUES, so
 * the sprite editor can edit what plays in place without writing on the
 * code's defaults, which is what "back to the code's cues" goes back to.
 */
export function applyActs(rows, o, clipNames) {
  const { acts, bad } = cleanActs(o, clipNames);
  return {
    rows: rows.map((r) => {
      const A = acts[r.voice];
      return A ? { ...r, act: A.act.map((e) => [...e]), hold: A.hold } : { ...r, act: r.act.map((e) => [...e]) };
    }),
    bad,
  };
}
