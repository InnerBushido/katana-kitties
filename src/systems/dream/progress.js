/* ---------------------------------------------------------------------------
   WHAT A KITTEN HAS EARNED IN THE DREAM DOJO — in THIS game.

   IT TRAVELS WITH THE SAVE ROW, NOT THE BROWSER. It used to be one
   localStorage key outliving every afternoon (`kk.dreamdojo.v1`), chosen when
   the daily kata needed a streak a new game could not reset. Then Richard
   played it: "when starting a new game or refreshing the browser, I still have
   the player achievements, even if starting a new game. This should get saved
   with the games save file and be dependent on each new game or save game
   file, it shouldn't be shared with all the play sessions and all the new
   games." The daily kata is gone (the Kata Trace is songs now), so the reason
   went with it. `toSave` / `fromSave` are what savegame.js writes and reads; a
   new game is an empty ledger because a new game is a fresh page. The old key
   is removed once at boot (`LEGACY_KEY`), so the stars a tester earned before
   this cannot come back into somebody's new game.

   The `store` argument is kept for the checks only — the game passes null.

   KEYED BY HER NAME (`style.name`), not her seat. A seat is not a cat — see
   `cssFor` in core/palette.js for the afternoon that taught that — and the
   girl who plays Frost wants Frost's stars whichever controller she picked up.

   NOTHING IN HERE IS THE REAL GAME'S. Stars, ranks and bests are the
   simulator's own; the one thing the Dream Dojo pays into the real world is
   the tenth quest (beating Shadow Lionheart), and that is paid by
   `systems/feats.js` like the other nine, not from here.
--------------------------------------------------------------------------- */

export const PROGRESS_KEY = 'kk.dreamdojo.v1';
/** The browser-wide key this used to live in, removed at boot. */
export const LEGACY_KEY = PROGRESS_KEY;

/** Drop the browser-wide ledger the old build kept. Never throws. */
export function forgetLegacy(store) {
  try { store?.removeItem(LEGACY_KEY); } catch { /* blocked */ }
}

/** A local date as YYYY-MM-DD — the day a daily kata belongs to. */
export function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The ISO week a weekly kata belongs to, as YYYY-Www. */
export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((t - y0) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(w).padStart(2, '0')}`;
}

export class DreamProgress {
  /** @param {Storage|null} store  localStorage, or a stand-in for a check */
  constructor(store = null) {
    this.store = store;
    this.data = { v: 1, kittens: {} };
    this.load();
  }

  load() {
    try {
      const raw = this.store?.getItem(PROGRESS_KEY);
      const d = raw ? JSON.parse(raw) : null;
      if (d && d.v === 1 && d.kittens && typeof d.kittens === 'object') this.data = d;
    } catch {
      // A blocked or corrupt store is "nothing earned yet", never a crash.
    }
  }

  save() {
    try { this.store?.setItem(PROGRESS_KEY, JSON.stringify(this.data)); } catch { /* full or blocked */ }
  }

  /** Her row, made on first touch. */
  of(name) {
    const k = this.data.kittens;
    k[name] ??= { stars: {}, best: {}, flags: {}, days: {}, weeks: {} };
    const r = k[name];
    r.stars ??= {}; r.best ??= {}; r.flags ??= {}; r.days ??= {}; r.weeks ??= {};
    return r;
  }

  stars(name, id) { return this.data.kittens[name]?.stars?.[id] ?? 0; }

  best(name, id) { return this.data.kittens[name]?.best?.[id] ?? null; }

  /**
   * Record a result. Stars only ever go UP — a worse run never takes one
   * back — and `best` keeps whichever is better by `lowerIsBetter`.
   */
  award(name, id, stars, score = null, { lowerIsBetter = false } = {}) {
    const r = this.of(name);
    const prev = r.stars[id] ?? 0;
    const s = Math.max(0, Math.min(3, stars | 0));
    if (s > prev) r.stars[id] = s;
    let newBest = false;
    if (score != null && Number.isFinite(score)) {
      const b = r.best[id];
      if (b == null || (lowerIsBetter ? score < b : score > b)) {
        r.best[id] = score;
        newBest = true;
      }
    }
    this.save();
    return { prev, now: Math.max(prev, s), gained: Math.max(0, s - prev), newBest };
  }

  total(name) {
    const s = this.data.kittens[name]?.stars ?? {};
    return Object.values(s).reduce((a, b) => a + (b | 0), 0);
  }

  flag(name, f) { return !!this.data.kittens[name]?.flags?.[f]; }

  setFlag(name, f, v = true) {
    this.of(name).flags[f] = v;
    this.save();
  }

  /** A copy of the ledger for the save row. A copy, so a row taken now does
   *  not change under the snapshot when she earns a star a second later. */
  toSave() {
    return JSON.parse(JSON.stringify(this.data));
  }

  /**
   * Put a save row's ledger back. ANYTHING THAT IS NOT ONE IS AN EMPTY
   * LEDGER — an older save that never carried this field, or junk — never a
   * throw, and never the previous game's stars left standing: a load replaces
   * whatever this page had.
   */
  fromSave(d) {
    const ok = d && d.v === 1 && d.kittens && typeof d.kittens === 'object' && !Array.isArray(d.kittens);
    this.data = ok ? JSON.parse(JSON.stringify(d)) : { v: 1, kittens: {} };
    for (const name of Object.keys(this.data.kittens)) {
      if (!this.data.kittens[name] || typeof this.data.kittens[name] !== 'object') delete this.data.kittens[name];
      else this.of(name);
    }
  }

  /** How many kittens have anything recorded. */
  count() { return Object.keys(this.data.kittens).length; }

  wipe() {
    const n = this.count();
    this.data = { v: 1, kittens: {} };
    try { this.store?.removeItem(PROGRESS_KEY); } catch { /* blocked */ }
    return n;
  }
}

/**
 * Stars from a result. `bands` is [one, two, three] thresholds; a run that
 * finished at all earns one, beating `bands[1]` two, `bands[2]` three.
 */
export function starsFor(score, bands, lowerIsBetter = true) {
  if (score == null || !Number.isFinite(score)) return 0;
  const beat = (b) => (lowerIsBetter ? score <= b : score >= b);
  if (beat(bands[2])) return 3;
  if (beat(bands[1])) return 2;
  if (beat(bands[0])) return 1;
  return 1;
}
