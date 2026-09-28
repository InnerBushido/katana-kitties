/**
 * The Settings panel, remembered.
 *
 * REPORTED FROM A PHONE: "when switching settings like 'Split screen' or 'On
 * screen stick' these should be saved for the game, so that player doesn't
 * need to keep changing this whenever they play the game."
 *
 * Every row in the panel used to be `this.settings` in memory, re-seeded from
 * the device at every boot. Only the on-screen stick survived a reload (it
 * has its own key in core/device.js, because the render tier is read from it
 * at boot), so a girl who set "Always shared" set it again every afternoon.
 * On a phone that is every time the tab is reopened, and since going back to
 * the main menu on a phone is now a real reload (see `Game.toTitle`), a
 * setting that did not survive one would not survive the title screen.
 *
 * ONE KEY, ONE OBJECT, AND ONLY THE ROWS SHE HAS TOUCHED. A row she never
 * changed is not written, so it keeps following the device default: a phone
 * that opens unsplit because it is a phone must still open unsplit when the
 * default moves, rather than being frozen at whatever the default was the day
 * she changed something else.
 *
 * EVERY VALUE IS CHECKED ON THE WAY IN. localStorage is a text file anybody
 * can edit and an old build can leave behind; a `split: "sometimes"` from
 * nowhere has to fall back to the default, not reach the layout as a string
 * that matches no branch. `readPrefs` answers with the rows that pass and
 * drops the rest, quietly. Nothing here throws: private browsing refuses
 * storage, and the game must play the same without it.
 */

export const PREFS_KEY = 'kk.settings';

/** Which values each select row may hold — the `<option value>`s in
 *  index.html, repeated here so a stored value can be refused without a DOM.
 *  `world-check` asserts the two lists agree, so adding an option to the
 *  markup and not here fails a check rather than silently not persisting. */
export const PREF_CHOICES = {
  split: ['auto', 'always', 'never'],
  dir: ['vertical', 'horizontal'],
  maps: ['each', 'two'],
  math: ['auto', 'on', 'off'],
  quality: ['high', 'medium', 'low'],
  padmode: ['split', 'single'],
  joycon: ['auto', 'cw', 'ccw', 'none'],
};

/** The two volume sliders, as the slider's own 0..100. */
export const PREF_LEVELS = ['sfx', 'music'];

function store(s) {
  if (s !== undefined) return s;
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** Is `v` a value row `key` can hold? */
export function prefOk(key, v) {
  if (PREF_CHOICES[key]) return PREF_CHOICES[key].includes(v);
  if (PREF_LEVELS.includes(key)) return Number.isFinite(v) && v >= 0 && v <= 100;
  return false;
}

/**
 * What she has chosen, as `{ row: value }`, rows she never touched absent.
 * @param {Storage|null} [s] defaults to localStorage; tests pass a stand-in
 */
export function readPrefs(s) {
  const st = store(s);
  if (!st) return {};
  let raw;
  try { raw = JSON.parse(st.getItem(PREFS_KEY) ?? 'null'); } catch { return {}; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) if (prefOk(k, v)) out[k] = v;
  return out;
}

/**
 * Remember one row. A value the row cannot hold is not written — the caller
 * got it off a `<select>`, so that is a markup/list mismatch, and writing it
 * would only be refused on the next read.
 * @returns {boolean} whether it was stored
 */
export function writePref(key, value, s) {
  if (!prefOk(key, value)) return false;
  const st = store(s);
  if (!st) return false;
  try {
    const now = readPrefs(st);
    now[key] = value;
    st.setItem(PREFS_KEY, JSON.stringify(now));
    return true;
  } catch {
    return false;   // private mode: the row still works for this session
  }
}
