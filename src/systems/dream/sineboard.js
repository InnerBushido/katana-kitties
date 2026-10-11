/* ---------------------------------------------------------------------------
   記 THE SINE BOARD — every kitten's best time on every course, at every
   level, on the Sine Gauntlet's own plaza board.

   Richard: "we should have a leaderboard for the Sine Gauntlet as well, like
   the Kata Board, separated by course and difficulty." So it is the Kata
   Board's shape — one page at a time, filters on a kiosk, one row per kitten
   — over the course's own numbers: a page is ONE COURSE AT ONE LEVEL, fastest
   first, because a time on the Ripple's L1 and a time on the Riptide's
   秘 EXTRA HARD are not the same race and one list of both would rank a
   sister for picking the easy one.

   ON THE PLAZA'S OWN BOARD, NOT A RING OF ITS OWN. The Kata Board has a gold
   ring in a corner of its island; this plaza has none to give — it is the
   strip between the course's first wall (a −17) and the rim (r 26), eight
   units deep, with the kiosk, the stands, the start's waiting spots and the
   bridge's mouth already on it (measured in the browser: a ring of 5.5
   anywhere on it either crossed the course's wall or hung off the rim). And
   the board already standing there said "Nobody has run it yet." whenever
   nobody was running. So that board IS the leaderboard while the course is
   idle, and goes back to the race the moment a session starts; the last
   race's results stay up for `LAST_HOLD` after it ends, then the page comes
   back. The 記 kiosk beside it changes the page.

   WHAT GOES ON IT: her best time there, which the course already writes
   down — `progress.best(name, starsId(course, level))`, lower is better, a
   FINISHED run only (a run that ended in a zap-out has no time). So there is
   no new ledger: the board is pure over the save row, travels with it, and
   a sister's best from before the board existed is on it the first time it
   is painted. A tie keeps the order of the names, so it never reorders
   itself on a repaint.
--------------------------------------------------------------------------- */

import { PLAYER_STYLE } from '../../core/palette.js';
import { COURSES, LEVELS, EXTRA_L, starsId, courseById } from './course.js';

/** How many rows the page has room for, and how long LAST TIME stays up. */
export const SINE_BOARD = { rows: 6, lastHold: 40 };

const stars3 = (n) => `${'★'.repeat(n)}${'☆'.repeat(Math.max(0, 3 - n))}`;
const levelName = (n) => (n === EXTRA_L ? '秘 EXTRA HARD' : `L${n + 1}`);

/** A kitten's colour, by her name; grey for a name that is not one of the four. */
export function nameColour(name) {
  return PLAYER_STYLE.find((s) => s.name === name)?.colour ?? 0xb8c8cc;
}

/**
 * THE PAGE, as rows: fastest first, then more stars, then by name.
 * `filter` is `{ course: id, level: n, who: name|'all' }`.
 */
export function sineRows(progress, filter, limit = SINE_BOARD.rows) {
  const id = starsId(filter.course, filter.level);
  const out = [];
  for (const [name, row] of Object.entries(progress?.data?.kittens ?? {})) {
    if (filter.who !== 'all' && filter.who !== name) continue;
    const time = row?.best?.[id];
    if (!Number.isFinite(time)) continue;
    out.push({ name, time, stars: row?.stars?.[id] ?? 0 });
  }
  out.sort((a, b) => a.time - b.time || b.stars - a.stars || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return out.slice(0, limit);
}

/** One row as text, columns padded for the board's monospace face. */
export function sineRowText(i, r) {
  const pos = `${i + 1}.`.padEnd(3);
  const who = r.name.toUpperCase().slice(0, 8).padEnd(8);
  const t = `${r.time.toFixed(1)}s`.padStart(7);
  return `${pos} ${who} ${t}  ${stars3(r.stars)}`;
}

const MONO = '"Consolas", "Courier New", ui-monospace, monospace';

/** The page's lines, for the plaza board. Pure of THREE: `world-check` reads it. */
export function sineBoardLines(progress, filter) {
  const C = courseById(filter.course);
  const rows = sineRows(progress, filter);
  const out = [
    { text: `記 ${C?.kanji ?? ''} ${C?.name ?? filter.course}`, size: 1.5, color: 0xffd36a, glow: true, jp: true },
    { text: `${levelName(filter.level)} · FASTEST TIMES · ${filter.who === 'all' ? 'EVERYBODY' : filter.who.toUpperCase()}`, size: 0.9, color: 0x9fefff },
  ];
  if (!rows.length) {
    out.push({ text: 'no times here yet', size: 1.0, color: 0x7f9fa8 });
    out.push({ text: 'finish it to be first! the 正弦 kiosk picks a course', size: 0.8, color: 0x7f9fa8 });
  } else {
    rows.forEach((r, i) => out.push({ text: sineRowText(i, r), size: 0.9, color: nameColour(r.name), font: MONO, weight: 700 }));
    out.push({ text: 'the 記 kiosk changes the page', size: 0.7, color: 0x7f9fa8 });
  }
  return out;
}

/**
 * THE FILTERS: a HoloChoice, ◀▶ on each row, one driver (non-negotiable 7).
 * Nothing on it is irreversible, so it opens on COURSE. 秘 EXTRA HARD is on
 * the LEVEL row only for a kitten who has opened it (`extraOpen`) — the
 * secret level stays a secret, as the Kata Board's secret song does.
 */
export function sineFilterRows(G, p, filter, repaint) {
  const D = G.dream;
  const name = p.style?.name ?? p.name;
  const ids = COURSES.map((c) => c.id);
  const levels = () => LEVELS.map((_, i) => i).filter((i) => i !== EXTRA_L || G.extraOpen(p, filter.course));
  if (!levels().includes(filter.level)) filter.level = 0;
  const cyc = (list, cur, s) => list[(list.indexOf(cur) + s + list.length) % list.length];
  return [
    { text: () => `COURSE  ◀ ${courseById(filter.course)?.name ?? filter.course} ▶`, cycle: (s) => { filter.course = cyc(ids, filter.course, s); if (!levels().includes(filter.level)) filter.level = 0; repaint(); } },
    { text: () => `LEVEL  ◀ ${levelName(filter.level)} ▶`, cycle: (s) => { filter.level = cyc(levels(), filter.level, s); repaint(); } },
    { text: () => `WHO  ◀ ${filter.who === 'all' ? 'everybody' : `just ${filter.who}`} ▶`, cycle: () => { filter.who = filter.who === 'all' ? name : 'all'; repaint(); } },
    { text: 'done', dim: true, act: () => D.closeChoice(p) },
  ];
}
