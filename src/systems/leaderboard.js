/* ---------------------------------------------------------------------------
   The record board: who has won the World Martial Arts Tournament, and how
   well.

   IT OUTLIVES THE GAME, and that is the whole point of it. Everything else in
   Katana Kitties is gone when the tab closes — the clan you swore to, the
   panda you fed forty canes, the stars you found. That is right for a world
   you are meant to knock over and knock over again. A tournament win is the
   one thing the girls do that is a RESULT rather than a state, and a result
   nobody can look up next Saturday is a result that did not happen. So this
   is the only persistent thing in the project.

   `localStorage`, because there is no backend and there is not going to be
   one: the whole game is a static build on a CDN. That means the board is
   per-browser and per-origin — the hosted copy and a local dev server keep
   different boards, exactly like the controller calibration does, and for
   exactly the same reason.
--------------------------------------------------------------------------- */

/* ONE BOARD PER LEAGUE, and the key carries the league's id.
   A duel win and a 3v1 win are not the same achievement, and a single table
   mixing them makes the number on it meaningless — a handicap fighter with a
   triple-length bar deals three times the damage of a duellist and would sit
   permanently on top of a board she is not really competing on. The duel keeps
   the ORIGINAL key so every tournament the girls have already won is still
   there; only the new leagues get new tables. */
const KEY = 'kk.arena.board.v2';
const keyFor = (mode = 'duel') => (mode === 'duel' ? KEY : `${KEY}.${mode}`);
/** How many rows the board keeps. The brief asked for the top ten. */
export const BOARD_SIZE = 10;

/** Name entry: how many letters, and what they can be. */
export const NAME_MIN = 3;
export const NAME_MAX = 5;
/* No lower case and no punctuation. Every extra glyph is another one to
   scroll past on a stick, and a nine-year-old spelling her name in capitals
   is what an arcade board looks like anyway. The blank is last so it reads as
   "nothing here" at the end of a short name rather than as a letter. */
export const ALPHABET = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '];

/**
 * Turn a finished tournament into one number.
 *
 * The brief named four things, and all four are in here with weights chosen so
 * that each one can actually move the total — a term that cannot change the
 * ordering is a term that is not really being scored:
 *
 *   ROUNDS WON      1000 each, and it dominates. Winning is the point; a
 *                   fighter who lost 2-1 should never outrank one who won,
 *                   however pretty her damage was.
 *   DAMAGE DEALT    2 a point. Over three rounds that is a few hundred —
 *                   enough to separate two 2-0 wins.
 *   SPEED           up to 600, falling 4 a second, so a brisk tournament is
 *                   worth about half a round win and a slow one is worth
 *                   nothing. It cannot go negative: a pair who spend ten
 *                   minutes messing about should score less, not be punished.
 *   DAMAGE AVOIDED  3 a point of the health she never lost, counted against
 *                   what she could have lost across the rounds actually
 *                   fought. Weighted above damage dealt on purpose — it is
 *                   the harder of the two and the one a kid learns second.
 */
export function scoreOf({ wins, dealt, taken, seconds, rounds, maxHp }) {
  const avoided = Math.max(0, rounds * maxHp - taken);
  return Math.round(
    wins * 1000
    + dealt * 2
    + Math.max(0, 600 - seconds * 4)
    + avoided * 3
  );
}

/** Read the board, newest-best first. Never throws — a bad blob is no board. */
export function loadBoard(mode = 'duel') {
  try {
    const raw = window.localStorage.getItem(keyFor(mode));
    if (!raw) return [];
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows)) return [];
    /* Validated on the way IN, not trusted. This is the one thing in the game
       that survives a reload, so it is also the one thing that can be sitting
       in storage in a shape this build has never produced — an older version,
       a hand-edited value, a half-written entry from a tab that was closed
       mid-write. A board that throws takes the whole results screen down with
       it at the exact moment somebody has just won. */
    return rows
      .filter((r) => r && typeof r.name === 'string' && Number.isFinite(r.score))
      .map((r) => ({
        name: String(r.name).slice(0, NAME_MAX),
        score: Math.round(r.score),
        wins: Number.isFinite(r.wins) ? r.wins : 0,
        dealt: Number.isFinite(r.dealt) ? Math.round(r.dealt) : 0,
        taken: Number.isFinite(r.taken) ? Math.round(r.taken) : 0,
        seconds: Number.isFinite(r.seconds) ? Math.round(r.seconds) : 0,
        at: Number.isFinite(r.at) ? r.at : 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, BOARD_SIZE);
  } catch {
    return [];
  }
}

/**
 * Add a result and return the saved board plus where the new row landed.
 *
 * `rank` is -1 when the score did not make the top ten, so the results screen
 * can say "not on the board" rather than silently showing a list the player
 * is not in — which reads as the game having lost her win.
 */
export function saveResult(row, mode = 'duel') {
  const entry = { ...row, at: Date.now() };
  const rows = [...loadBoard(mode), entry]
    .sort((a, b) => b.score - a.score)
    .slice(0, BOARD_SIZE);
  try {
    window.localStorage.setItem(keyFor(mode), JSON.stringify(rows));
  } catch {
    /* Storage full, or blocked (private mode, or a browser with cookies off).
       The board is a bonus; losing it must not take the results screen with
       it, so the rows are still returned and still shown for this session. */
  }
  const rank = rows.indexOf(entry);
  return { rows, rank };
}

/** Wipe one league's board, or every league's. Only reachable from the pause
 *  menu, and it confirms first. */
export function clearBoard(mode = null) {
  try {
    if (mode) window.localStorage.removeItem(keyFor(mode));
    else for (const m of BOARD_MODES) window.localStorage.removeItem(keyFor(m));
  } catch { /* see saveResult */ }
}

/** Every league that can have a board. Kept here rather than imported from
 *  `tournament.js` so clearing one does not drag the whole tournament into
 *  the leaderboard's dependencies. */
export const BOARD_MODES = ['duel', 'ffa', 'pairs', 'two_one', 'three_one'];

/* ---------------------------------------------------------------------------
   Entering a name on a joystick.
--------------------------------------------------------------------------- */

/**
 * Three to five letters, chosen with a stick.
 *
 * THE ARCADE LAYOUT, NOT A TEXT FIELD, and the reason is the hardware. A
 * `<input>` needs a keyboard, and the whole point of the controller pass in
 * this project is that two kids on two Joy-Cons never have to reach for the
 * laptop. Up and down change the letter under the cursor, left and right move
 * between letters, and that is the entire control scheme — it is the one a
 * nine-year-old has already used on every high-score screen she has seen.
 *
 * IT REPEATS WHEN HELD, because spelling a name three letters at a time with
 * 37 glyphs to scroll through is a lot of individual presses. The first repeat
 * waits (`REPEAT_DELAY`) so a single tap is still a single step.
 */
const REPEAT_DELAY = 0.42;
const REPEAT_RATE = 0.085;

export class NameEntry {
  constructor() {
    /** Letter index per slot. Starts on 'A' across the minimum length. */
    this.slots = Array.from({ length: NAME_MIN }, () => 0);
    this.cursor = 0;
    this.done = false;
    this._holdT = 0;
    this._holdDir = 0;
    this._holdAxis = null;
  }

  get name() {
    return this.slots.map((i) => ALPHABET[i]).join('').replace(/\s+$/, '');
  }

  /** True once the name is long enough to be accepted. */
  get valid() {
    return this.name.length >= NAME_MIN;
  }

  reset() {
    this.slots = Array.from({ length: NAME_MIN }, () => 0);
    this.cursor = 0;
    this.done = false;
  }

  _step(axis, dir) {
    if (axis === 'y') {
      const n = ALPHABET.length;
      this.slots[this.cursor] = (this.slots[this.cursor] + dir + n) % n;
      return true;
    }
    const next = this.cursor + dir;
    /* Moving RIGHT off the end grows the name, up to NAME_MAX. That is how
       you get a four- or five-letter name without a separate "add a letter"
       control — the cursor simply keeps going and a new blank appears. Moving
       LEFT off the front does nothing rather than wrapping: wrapping puts the
       cursor at the far end of a name she is halfway through spelling. */
    if (next < 0) return false;
    if (next >= this.slots.length) {
      if (this.slots.length >= NAME_MAX) return false;
      this.slots.push(0);
    }
    this.cursor = next;
    return true;
  }

  /**
   * @param {number} dt
   * @param {Array} pads the per-player input snapshots
   * @returns {{moved: boolean, confirmed: boolean}}
   */
  update(dt, pads) {
    if (this.done) return { moved: false, confirmed: false };

    /* EITHER PLAYER DRIVES IT — the same rule the pause menu follows. The
       winner types her own name, but which pad she is holding is not
       something this screen can know, and locking it to player 1 means the
       younger sister wins the tournament and cannot sign the board. */
    let mx = 0;
    let my = 0;
    let confirm = false;
    for (const p of pads) {
      if (Math.abs(p.mx) > Math.abs(mx)) mx = p.mx;
      if (Math.abs(p.my) > Math.abs(my)) my = p.my;
      if (p.pressed('jump') || p.pressed('interact')) confirm = true;
    }

    const DEAD = 0.5;
    let axis = null;
    let dir = 0;
    if (Math.abs(my) > DEAD && Math.abs(my) >= Math.abs(mx)) {
      axis = 'y';
      // +my is DOWN on this pad, and down should walk A -> B -> C.
      dir = my > 0 ? 1 : -1;
    } else if (Math.abs(mx) > DEAD) {
      axis = 'x';
      dir = mx > 0 ? 1 : -1;
    }

    let moved = false;
    if (!axis) {
      this._holdAxis = null;
      this._holdT = 0;
    } else if (axis !== this._holdAxis || dir !== this._holdDir) {
      this._holdAxis = axis;
      this._holdDir = dir;
      this._holdT = REPEAT_DELAY;
      moved = this._step(axis, dir);
    } else {
      this._holdT -= dt;
      if (this._holdT <= 0) {
        this._holdT = REPEAT_RATE;
        moved = this._step(axis, dir);
      }
    }

    let confirmed = false;
    if (confirm && this.valid) {
      this.done = true;
      confirmed = true;
    }
    return { moved, confirmed };
  }

  /** A keyboard is still allowed — see the note on `NameEntry`. */
  key(code) {
    if (this.done) return false;
    if (code === 'Backspace') {
      if (this.slots.length > NAME_MIN) {
        this.slots.pop();
        this.cursor = Math.min(this.cursor, this.slots.length - 1);
      } else {
        this.slots[this.cursor] = ALPHABET.indexOf(' ');
      }
      return true;
    }
    if (code === 'Enter' || code === 'NumpadEnter') {
      if (this.valid) { this.done = true; return true; }
      return false;
    }
    const m = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(code);
    if (!m) return false;
    const ch = m[1] ?? m[2];
    const ix = ALPHABET.indexOf(ch);
    if (ix < 0) return false;
    this.slots[this.cursor] = ix;
    // Typing walks forward on its own, growing the name like the stick does.
    if (this.cursor + 1 < NAME_MAX) {
      if (this.cursor + 1 >= this.slots.length) this.slots.push(ALPHABET.indexOf(' '));
      this.cursor++;
    }
    return true;
  }
}
