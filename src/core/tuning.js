/**
 * The balance knobs, out of the code and into a file a person can edit.
 *
 * WHY THIS EXISTS. Four adults played a round and the Cross Slash was too
 * strong. Answering that meant finding six numbers spread across two entity
 * files, each buried in a paragraph explaining why it is what it is — which is
 * exactly how those paragraphs should be, and exactly the wrong shape for
 * "make the wind-up a bit longer and play it again". Richard asked for one
 * page listing every ability's timings with what they mean, editable by hand,
 * feeding straight back into the game. `tuning.html` is that page and this is
 * what it writes to.
 *
 * OVERRIDES ONLY, AND DELIBERATELY NOT THE WHOLE TABLE. `tuning.json` starts
 * as `{}` and holds only the numbers somebody has actually moved. The literal
 * in `powerorb.js` stays the default and stays the documented one, so:
 *   - deleting `tuning.json`'s contents restores the shipped balance exactly,
 *   - a value tuned in the code is not silently overridden by a stale copy of
 *     itself in a JSON file nobody remembers editing,
 *   - and a diff of `tuning.json` is a list of what actually changed, which is
 *     the thing worth reading in a commit.
 * A file holding every value would fail all three, and the third is the one
 * that bites: "why did my edit to CROSS.gap do nothing" is a bad afternoon.
 *
 * NOTHING HERE MAY NaN A POSITION — fourth house rule, prefer a rule that
 * degrades over one that vanishes. This is a hand-edited file, so it WILL at
 * some point contain a typo, a string, a null, or a key that no longer exists.
 * `tune` therefore takes only keys the defaults already have, and only finite
 * numbers; everything else is ignored in silence rather than merged. A
 * misspelled `"knock"` does nothing, which is annoying and visible on the
 * page; a merged `undefined` would put a kitten at NaN and undraw her.
 *
 * IT IS A JSON FILE AND NOT AN INI, which is what was asked for. The ask was
 * for "an ini file that holds the variables the scripts reference", and the
 * substance of that — external, hand-editable, read by the code — is exactly
 * what this is. The format is JSON because the runtime already parses it, so
 * an ini would mean shipping a parser to read four numbers, and because Vite
 * reloads a JSON import on save, so an edit made on the page is live in the
 * running game without a restart. The comments an ini would have bought live
 * in the page instead, where there is room for a paragraph per field.
 */
import overrides from '../tuning.json' with { type: 'json' };

/**
 * Fold `tuning.json`'s entry for `name` over a table of defaults.
 *
 * Recurses one level or twenty — `ATTACKS` is a table of tables and asking
 * every call site to flatten itself would put the shape of the data in two
 * places. Objects in the override that are not objects in the default are
 * dropped by the same rule as everything else: the DEFAULTS decide the shape,
 * the file only ever supplies numbers.
 *
 * @param {string} name  top-level key in tuning.json
 * @param {object} defaults  the shipped values — the source of truth for shape
 */
export function tune(name, defaults) {
  /* THE SHIPPED VALUES, KEPT. `tuning.html` has to show what a field WAS as
     well as what it is — an override you cannot see is an override you cannot
     undo, and "what did this used to be" is the first question anybody asks
     after a bad tuning session. Recording it here rather than duplicating the
     tables into the page is what stops the page telling comfortable lies about
     defaults that moved in the code months ago. A few hundred bytes of numbers
     in the bundle is the whole cost. */
  DEFAULTS[name] = merge(defaults, null);
  return merge(defaults, overrides?.[name]);
}

/** Every table `tune` has been called with, at its shipped value. Populated as
 *  the modules holding them are imported, so a reader must import those first
 *  — see `tuning.html`, which imports the entity modules for exactly this. */
export const DEFAULTS = {};

/** The fold itself, exported under a test name so `world-check` can hand it
 *  the malformed files a hand-edited JSON eventually becomes. Same idiom as
 *  `__curvedWallForTest` in world/build.js. */
export const __mergeForTest = (defaults, over) => merge(defaults, over);

function merge(defaults, over) {
  const out = Array.isArray(defaults) ? [...defaults] : { ...defaults };
  if (!over || typeof over !== 'object') return out;
  for (const k of Object.keys(defaults)) {
    const d = defaults[k];
    const v = over[k];
    if (d !== null && typeof d === 'object') out[k] = merge(d, v);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/** What is actually overridden right now — read by `tuning.html` to show which
 *  fields are off their defaults, and by world-check to assert that a clean
 *  checkout ships the documented balance. */
export const OVERRIDES = overrides ?? {};
