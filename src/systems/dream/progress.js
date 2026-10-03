/* ---------------------------------------------------------------------------
   WHAT A KITTEN HAS EARNED IN THE DREAM DOJO — kept for good.

   PER KITTEN, IN THIS BROWSER, OUTLIVING ANY ONE AFTERNOON. Richard chose this
   over keeping it in the save row, and the daily kata is why it had to be: a
   streak that a new afternoon resets is not a streak. So this is the third
   thing in the game that outlives the tab, beside the RECORD BOARD and the
   SAVED GAMES, and it is treated the way they are — one key, read with a
   try/catch that degrades to "nothing earned yet", and wiped only from a
   keyless debug row that asks first with the count in its button
   (non-negotiable 7).

   KEYED BY HER NAME (`style.name`), not her seat. A seat is not a cat — see
   `cssFor` in core/palette.js for the afternoon that taught that — and the
   girl who plays Frost wants Frost's stars whichever controller she picked up.

   NOTHING IN HERE IS THE REAL GAME'S. Stars, ranks and bests are the
   simulator's own; the one thing the Dream Dojo pays into the real world is
   the tenth quest (beating Shadow Lionheart), and that is paid by
   `systems/feats.js` like the other nine, not from here.
--------------------------------------------------------------------------- */

export const PROGRESS_KEY = 'kk.dreamdojo.v1';

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

  /** How many kittens have anything recorded — the debug row's count. */
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
