import { MUSIC } from '../../core/audio.js';

/* ---------------------------------------------------------------------------
   THE BEAT MAP — what Lionheart does in a Kata Trace run, written down.

   Richard: "Kata Trace should be a DDR style training game with Lionheart"
   — he stands at the top of her floor and attacks with Shadow Lionheart's
   moves, and she dodges on the beat. "Beat maps should be human readable
   JSON that can be viewed, saved and loaded", "any in-game song can be
   picked", and there is "a custom beat map editor".

   PURE: no THREE, no DOM. The drill (kata.js), the editor (kataeditor.js),
   the tour and world-check all read the same rules from here, so a chart the
   editor calls fair is one the floor can be danced on.

   THE FLOOR, FROM WHERE THE CAMERA IS. Nine marks: the middle, C, and eight
   round it named by the SCREEN — N is up the screen, E is right. The camera's
   yaw never changes in the simulator (player.js `CAM_YAW`), so a mark that
   is "up" is up for every kitten in every pane, which is the only way a
   chart can say "NE" and mean the arrow a nine-year-old pushes.

   SHE IS LOCKED TO THE MARKS, AND GOES BACK THROUGH THE MIDDLE. From C a
   push goes to any of the eight; from a ring mark only a push back toward
   the middle moves her, and it takes her to C. So getting from one ring
   mark to another is two moves, which is the whole of the footwork.

   HE STANDS ON ONE OF FIVE SPOTS ACROSS THE TOP — W NW N NE E — and starts
   on N. Every attack comes from the spot he is on:
     cut    his straight slam: the mark on his side, the middle, and the mark
            straight across. Step off the line.
     cross  his Cross Slash, centred on the middle with its two bars at 45° to
            the way he faces: from N, W or E it takes the middle and the four
            DIAGONALS; from NW or NE, the middle and the four STRAIGHTS. Where
            he stands decides which four are safe.
     sweep  everything. Jump.
   The middle is never safe from a cut or a cross — standing still in it is
   never the answer, which is what makes every attack a step.

   THE FORMAT, one event per line so a person can read and edit it:
     {
       "format": "kata-beatmap/1",
       "title": "Bamboo Grove (normal)",
       "song": "bamboo",            a key of core/audio.js MUSIC
       "difficulty": "normal",      easy | normal | hard: lives and the tell
       "beats": 104,                the length, in the chart's beats
       "author": "Lionheart",
       "events": [
         { "beat": 6, "lion": "NE" },        he moves to a spot
         { "beat": 10, "attack": "cut" },    a blow LANDS on this beat
         { "beat": 14, "attack": "sweep", "tell": 3 }   optional: its own tell
       ]
     }
   An attack's beat is when it LANDS. Its tell — the warning, the floor going
   red — starts `tell` beats before (the difficulty's, unless the event says).
--------------------------------------------------------------------------- */

export const FORMAT = 'kata-beatmap/1';

/** The eight ring marks, clockwise from screen-up. */
export const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
/** Where he can stand: across the top of her floor. */
export const LION_SPOTS = ['W', 'NW', 'N', 'NE', 'E'];
export const LION_START = 'N';
export const ATTACKS = ['cut', 'cross', 'sweep'];

/** A mark or spot as a unit vector on the SCREEN: x right, y UP. */
export function dirVec(name) {
  const k = DIRS.indexOf(name);
  if (k < 0) return { x: 0, y: 0 };
  const a = (k * Math.PI) / 4;
  return { x: Math.sin(a), y: Math.cos(a) };
}

const opposite = (d) => DIRS[(DIRS.indexOf(d) + 4) % 8];

/**
 * The marks a blow from `spot` lands on. 'C' is the middle.
 * A sweep lands on all nine; jumping is the dodge, not a place.
 */
export function hitMarks(attack, spot) {
  if (attack === 'sweep') return new Set(['C', ...DIRS]);
  const k = DIRS.indexOf(spot);
  if (attack === 'cut') return new Set(['C', spot, opposite(spot)]);
  if (attack === 'cross') return new Set(['C', ...[1, 3, 5, 7].map((o) => DIRS[(k + o) % 8])]);
  return new Set();
}

/** Where she can stand through it: every mark it does not land on. */
export function safeMarks(attack, spot) {
  const h = hitMarks(attack, spot);
  return ['C', ...DIRS].filter((m) => !h.has(m));
}

/** One move from `at`: from the middle to any ring mark, from a ring mark back to the middle. */
export function movesFrom(at) {
  return at === 'C' ? [...DIRS] : ['C'];
}

/** The stick's push, snapped to one of eight. `my` is negative UP, as every pad here reads it. */
export function stickDir(mx, my) {
  const a = Math.atan2(mx, -my);
  return DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}

/**
 * Where a push takes her. From the middle: the mark she pushed at. From a
 * ring mark: the middle — but only for a push back TOWARD it (within 45° of
 * straight back), so a stick wobbling sideways does not throw her across.
 * Anything else is no move.
 */
export function stepFrom(at, push) {
  if (at === 'C') return push;
  const back = DIRS.indexOf(opposite(at));
  const k = DIRS.indexOf(push);
  const off = Math.min((k - back + 8) % 8, (back - k + 8) % 8);
  return off <= 1 ? 'C' : null;
}

/* ------------------------------- difficulty ------------------------------- */

/**
 * WHAT A DIFFICULTY IS. Lives are "several hits means fail"; the tell is how
 * many beats the floor warns before a blow lands; `gaps` is the spacing of
 * blows the generator draws from; `pool` weights the three attacks; `lion`
 * is how often he changes spot between blows.
 *
 * ONE MOVE PER BEAT is what the generator and the solver allow her — from a
 * ring mark to another is two, so a tell of two beats is the least that lets
 * every blow be dodged from anywhere.
 */
export const DIFFS = {
  easy: { name: 'EASY', lives: 5, tell: 3, gaps: [4, 4, 5, 6], lead: 8, pool: { cut: 4, sweep: 1.2, cross: 1.5 }, lion: 0.3 },
  normal: { name: 'NORMAL', lives: 4, tell: 2, gaps: [3, 3, 4, 4, 2], lead: 8, pool: { cut: 3, sweep: 1.2, cross: 2.5 }, lion: 0.45 },
  hard: { name: 'HARD', lives: 3, tell: 2, gaps: [2, 2, 3, 3, 1], lead: 8, pool: { cut: 2.5, sweep: 1.2, cross: 3 }, lion: 0.6 },
};
export const DIFF_IDS = Object.keys(DIFFS);

/** The speed modifiers: the song AND his attacks, together — one clock. */
export const SPEEDS = [0.75, 1, 1.25, 1.5];

/* ---------------------------------- songs --------------------------------- */

/* EVERY PIECE IN THE GAME. "Any in-game song can be picked" — so this is
   every key of MUSIC, named for where you hear it. A piece this table does
   not name still plays, under its key; the list cannot go stale. */
const SONG_NAMES = {
  play: 'Katana Kitties', intro: 'The Opening', finale: 'The Ending', finaleCross: 'The Crossing',
  finaleOpen: 'The Opening Sky', tourPayne: "Payne's Tour", tourLion: "Lionheart's Tour", tourCreed: 'The Creed',
  autumn: 'Autumn Island', frost: 'Frost Island', bamboo: 'Bamboo Grove', ash: 'Ash Island',
  dusk: 'Dusk Island', dojo: 'The Dojo', arena: 'The Arena', griffin: 'The Griffin',
  flight: 'Dragon Flight', ryu: "Ryu's Ride", snake: 'Snake Way', satanStrut: "Mr. Satan's Strut",
  satan: "Mr. Satan's Road", vr: 'The Dream Dojo', saucer: 'Gold Saucer',
};

/**
 * The chart's beat for a piece: its step (`MUSIC[k].beat`, seconds) doubled
 * until it is slow enough to step to. 0.42 s is 143 BPM — the fastest a
 * nine-year-old was asked to step in the old kata was 120. The Dream Dojo's
 * own piece steps at 0.115, which would be a blow every eighth of a second.
 */
export const MIN_SPB = 0.42;
export function songSpb(key) {
  const b = MUSIC[key]?.beat ?? MUSIC.play.beat;
  let k = 1;
  while (b * k < MIN_SPB) k *= 2;
  return { spb: b * k, steps: k };
}

/* mulberry32 over an FNV-1a hash — the same on every machine. */
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
export function rng32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** "Songs run 30s - 1:30 at normal speed": a length per piece, whole bars of 4. */
export const SONG_SECS = [30, 90];
function songBeats(key, spb) {
  const secs = SONG_SECS[0] + (hash(`len:${key}`) % 7) * ((SONG_SECS[1] - SONG_SECS[0]) / 6);
  let n = Math.max(16, Math.round(secs / spb / 4) * 4);
  // Rounding to a bar can carry a 90s piece to 90.5 (The Crossing did): back inside by whole bars.
  while (n > 16 && n * spb > SONG_SECS[1]) n -= 4;
  while (n * spb < SONG_SECS[0]) n += 4;
  return n;
}

export const SONGS = Object.keys(MUSIC).map((id) => {
  const { spb, steps } = songSpb(id);
  return { id, name: SONG_NAMES[id] ?? id, spb, steps, bpm: Math.round(60 / spb), beats: songBeats(id, spb) };
});
export const songById = (id) => SONGS.find((s) => s.id === id) ?? null;

/* -------------------------------- the solver ------------------------------ */

/** The attacks, in the order they land, each with where he stood and its tell. */
export function resolveChart(chart) {
  const tellOf = DIFFS[chart.difficulty]?.tell ?? 2;
  let spot = LION_START;
  const out = [];
  for (const e of sortedEvents(chart.events)) {
    if (e.lion) spot = e.lion;
    else if (e.attack) out.push({ beat: e.beat, attack: e.attack, spot, tell: e.tell ?? tellOf });
  }
  return out;
}

export function sortedEvents(events) {
  // Stable: two events on one beat keep the order they were written in, so
  // "he moves, then strikes" on the same beat reads as written.
  return (events ?? []).map((e, i) => [e, i]).sort((a, b) => a[0].beat - b[0].beat || a[1] - b[1]).map(([e]) => e);
}

/** How many moves she can make between two blows: one per beat, and only once she can see it coming. */
export function movesBetween(prevBeat, a) {
  return Math.max(0, Math.floor(Math.min(a.beat - prevBeat, a.tell) + 1e-9));
}

function expand(states, n) {
  let cur = new Set(states);
  for (let i = 0; i < n; i++) {
    const nx = new Set(cur);
    for (const s of cur) for (const m of movesFrom(s)) nx.add(m);
    cur = nx;
    if (cur.size === 9) break;
  }
  return cur;
}

/**
 * CAN IT BE DANCED? Every place she could be after each blow, given one move
 * per beat. Returns the beats of blows nothing could dodge — an empty list
 * is a fair chart. Before the first blow she may be anywhere.
 */
export function unfair(chart) {
  const bad = [];
  let reach = new Set(['C', ...DIRS]);
  let prev = -Infinity;
  for (const a of resolveChart(chart)) {
    const can = expand(reach, movesBetween(prev, a));
    const safe = a.attack === 'sweep' ? can : new Set([...can].filter((m) => safeMarks(a.attack, a.spot).includes(m)));
    if (!safe.size) { bad.push(a.beat); reach = can; } else reach = safe;
    prev = a.beat;
  }
  return bad;
}

/**
 * ONE WAY THROUGH IT — the route a perfect kitten takes, every move landing
 * on a beat. The tour's holo-kittens dance this, and world-check walks it.
 * Returns [{ beat, to }] and [{ beat }] for jumps, or null when unfair.
 * Each blow's last move lands ON its beat; the step back to the middle, when
 * there is one, a beat before.
 */
export function route(chart) {
  const as = resolveChart(chart);
  // Backwards: which marks, standing on after blow i, still lead to the end.
  const ok = new Array(as.length + 1).fill(null);
  ok[as.length] = new Set(['C', ...DIRS]);
  for (let i = as.length - 1; i >= 0; i--) {
    const a = as[i];
    const safe = a.attack === 'sweep' ? ['C', ...DIRS] : safeMarks(a.attack, a.spot);
    const nxt = as[i + 1];
    ok[i] = new Set(safe.filter((m) => !nxt || [...expand([m], movesBetween(a.beat, nxt))].some((q) => ok[i + 1].has(q)
      && (nxt.attack === 'sweep' || safeMarks(nxt.attack, nxt.spot).includes(q)))));
  }
  const moves = [];
  const jumps = [];
  let at = 'C';
  let prev = -Infinity;
  for (let i = 0; i < as.length; i++) {
    const a = as[i];
    if (a.attack === 'sweep') {
      jumps.push({ beat: a.beat });
      if (!ok[i].has(at)) return null;
      prev = a.beat;
      continue;
    }
    const n = movesBetween(prev, a);
    const want = [...ok[i]];
    if (!want.length) return null;
    // Stay if she can; else one move from C; else back to C and out.
    let to = want.includes(at) ? at : null;
    if (!to && at === 'C' && n >= 1) to = want[0];
    if (!to && at !== 'C' && n >= 2) to = want.find((m) => m !== 'C') ?? null;
    if (!to) return null;
    if (to !== at) {
      if (at !== 'C') moves.push({ beat: a.beat - 1, to: 'C' });
      moves.push({ beat: a.beat, to });
      at = to;
    }
    prev = a.beat;
  }
  return { moves, jumps };
}

/* ------------------------------- the generator ----------------------------- */

function weighted(r, w) {
  const keys = Object.keys(w).filter((k) => w[k] > 0);
  let x = r() * keys.reduce((s, k) => s + w[k], 0);
  for (const k of keys) { x -= w[k]; if (x < 0) return k; }
  return keys[keys.length - 1];
}

/**
 * THE BUILT-IN CHART FOR A SONG AND A DIFFICULTY. Pure: the same pair gives
 * the same chart everywhere, so four sisters on four floors dancing Bamboo
 * Grove on NORMAL are dancing the same thing and can compare scores.
 *
 * RULES THAT KEEP IT A DANCE:
 *   · every blow can be dodged with one move per beat (`unfair` is empty);
 *   · as often as it can, a blow lands where the last one left her safe —
 *     standing still through a blow is not a step, so the generator prefers
 *     the attack that makes her move;
 *   · never the same attack three times running;
 *   · he moves only between blows, never during a tell.
 */
export function generateChart(songId, difficulty) {
  const S = songById(songId) ?? songById('play');
  const D = DIFFS[difficulty] ?? DIFFS.normal;
  const r = rng32(hash(`kata:${S.id}:${difficulty}`));
  const pick = (a) => a[Math.floor(r() * a.length) % a.length];
  const events = [];
  let spot = LION_START;
  let her = 'C';
  let prev = -Infinity;
  let prevBeat = 0;
  const seen = [];
  let t = D.lead;
  while (t <= S.beats - 2) {
    const tellStart = t - D.tell;
    /* He moves, maybe: half a beat before the tell, and at least half a beat
       after the last blow — "he moves quickly between 5 spots", and on HARD
       the blows are three beats apart, so a whole beat each side never fit
       and he stood on one spot for a whole song. */
    const m = tellStart - 0.5;
    if (m >= prevBeat + 0.5 && r() < D.lion) {
      spot = pick(LION_SPOTS.filter((s) => s !== spot));
      events.push({ beat: m, lion: spot });
    }
    const n = movesBetween(prev, { beat: t, tell: D.tell });
    const can = [...expand([her], n)];
    const twice = seen.length >= 2 && seen[seen.length - 1] === seen[seen.length - 2] ? seen[seen.length - 1] : null;
    // Each attack, the marks she could reach that it leaves standing.
    const opts = ATTACKS.filter((a) => a !== twice).map((a) => ({
      a, safe: a === 'sweep' ? can : can.filter((m) => safeMarks(a, spot).includes(m)),
    })).filter((o) => o.safe.length);
    // A gap of one beat after a non-sweep leaves no time to cross: only what she can take standing.
    const pool = {};
    for (const o of opts) {
      // Prefer what makes her move: an attack that lands on where she is.
      const moves = o.a === 'sweep' || !o.safe.includes(her);
      /* ...and a jump straight after a jump is half as likely. A sweep always
         "makes her move", so before this it won every draw his standing still
         made unfair to the other two: HARD Bamboo Grove was nine sweeps in
         its first twelve blows. */
      const again = o.a === 'sweep' && seen[seen.length - 1] === 'sweep' ? 0.35 : 1;
      pool[o.a] = (D.pool[o.a] ?? 1) * (moves ? 1 : 0.4) * again;
    }
    if (!Object.keys(pool).length) { t += 1; continue; }
    const a = weighted(r, pool);
    const o = opts.find((x) => x.a === a);
    if (a !== 'sweep') {
      const away = o.safe.filter((m) => m !== her && m !== 'C');
      her = o.safe.includes(her) && !away.length ? her : pick(away.length ? away : o.safe);
    }
    events.push({ beat: t, attack: a });
    seen.push(a);
    prev = t;
    prevBeat = t;
    let gap = pick(D.gaps);
    // A one-beat follow-up only after a blow she dodged by STEPPING — two
    // jumps a beat apart would land her on the second.
    if (gap === 1 && a === 'sweep') gap = 2;
    t += gap;
  }
  return {
    format: FORMAT,
    title: `${S.name} (${D.name.toLowerCase()})`,
    song: S.id,
    difficulty: DIFFS[difficulty] ? difficulty : 'normal',
    beats: S.beats,
    author: 'Lionheart',
    events,
  };
}

/* ------------------------------ text in, text out --------------------------- */

/** The chart as a person would write it: one event to a line. */
export function chartToText(chart) {
  const head = ['format', 'title', 'song', 'difficulty', 'beats', 'author']
    .filter((k) => chart[k] != null)
    .map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(chart[k])}`);
  const ev = sortedEvents(chart.events).map((e) => {
    const keys = ['beat', 'lion', 'attack', 'tell'].filter((k) => e[k] != null);
    return `    { ${keys.map((k) => `${JSON.stringify(k)}: ${JSON.stringify(e[k])}`).join(', ')} }`;
  });
  return `{\n${head.join(',\n')},\n  "events": [\n${ev.join(',\n')}\n  ]\n}\n`;
}

/**
 * READ A CHART, AND SAY EVERYTHING WRONG WITH IT. Returns { chart, errors,
 * warnings }: `chart` is null when there are errors. An error is something
 * the floor cannot play; a warning is something it can, but unfairly — a
 * blow nobody could dodge is a warning, because a mean chart written on
 * purpose is still a chart.
 */
export function parseChart(input) {
  const errors = [];
  const warnings = [];
  let o = input;
  if (typeof input === 'string') {
    try { o = JSON.parse(input); } catch (e) { return { chart: null, errors: [`not JSON: ${e.message}`], warnings }; }
  }
  if (!o || typeof o !== 'object') return { chart: null, errors: ['not a chart'], warnings };
  if (o.format !== FORMAT) errors.push(`"format" must be "${FORMAT}"`);
  if (!songById(o.song)) errors.push(`"song" must be one of: ${SONGS.map((s) => s.id).join(', ')}`);
  if (!DIFFS[o.difficulty]) errors.push(`"difficulty" must be ${DIFF_IDS.join(', ')}`);
  if (!Number.isFinite(o.beats) || o.beats < 4 || o.beats > 2000) errors.push('"beats" must be a number from 4 to 2000');
  if (!Array.isArray(o.events)) errors.push('"events" must be a list');
  const events = [];
  for (const [i, e] of (Array.isArray(o.events) ? o.events : []).entries()) {
    const at = `event ${i + 1}`;
    if (!e || typeof e !== 'object') { errors.push(`${at}: not an event`); continue; }
    if (!Number.isFinite(e.beat) || e.beat < 0) { errors.push(`${at}: "beat" must be a number, 0 or more`); continue; }
    if (Number.isFinite(o.beats) && e.beat > o.beats) errors.push(`${at}: beat ${e.beat} is after the end (${o.beats})`);
    if (e.lion != null && e.attack != null) { errors.push(`${at}: one of "lion" or "attack", not both`); continue; }
    if (e.lion != null) {
      if (!LION_SPOTS.includes(e.lion)) { errors.push(`${at}: "lion" must be one of ${LION_SPOTS.join(' ')}`); continue; }
      events.push({ beat: e.beat, lion: e.lion });
    } else if (e.attack != null) {
      if (!ATTACKS.includes(e.attack)) { errors.push(`${at}: "attack" must be one of ${ATTACKS.join(', ')}`); continue; }
      if (e.tell != null && !(Number.isFinite(e.tell) && e.tell >= 1 && e.tell <= 8)) { errors.push(`${at}: "tell" must be 1 to 8 beats`); continue; }
      events.push(e.tell != null ? { beat: e.beat, attack: e.attack, tell: e.tell } : { beat: e.beat, attack: e.attack });
    } else errors.push(`${at}: needs "lion" or "attack"`);
  }
  if (errors.length) return { chart: null, errors, warnings };
  const chart = {
    format: FORMAT,
    title: typeof o.title === 'string' && o.title.trim() ? o.title.trim().slice(0, 60) : `${songById(o.song).name} (custom)`,
    song: o.song, difficulty: o.difficulty, beats: o.beats,
    author: typeof o.author === 'string' ? o.author.slice(0, 40) : '',
    events: sortedEvents(events),
  };
  // HE DOES NOT MOVE MID-TELL: the floor would be warning about a spot he left.
  const as = resolveChart(chart);
  for (const e of chart.events) {
    if (!e.lion) continue;
    const a = as.find((x) => e.beat > x.beat - x.tell && e.beat < x.beat);
    if (a) warnings.push(`beat ${e.beat}: he moves during the warning for the ${a.attack} on beat ${a.beat} — it still comes from where he was`);
  }
  for (const b of unfair(chart)) warnings.push(`beat ${b}: nobody could dodge this one — one move per beat is not enough to get anywhere safe`);
  if (!as.length) warnings.push('no attacks: Lionheart will just stand there');
  return { chart, errors, warnings };
}

/** The id a chart's stars are kept under. Built-ins by song and difficulty; a custom one by its own words. */
export function chartId(chart, custom = false) {
  if (!custom) return `kata.song.${chart.song}.${chart.difficulty}`;
  return `kata.custom.${(hash(chartToText(chart)) >>> 0).toString(36)}`;
}

/** Seconds per beat at a speed. */
export const spbAt = (song, speed = 1) => (songById(song)?.spb ?? 0.5) / (speed || 1);
