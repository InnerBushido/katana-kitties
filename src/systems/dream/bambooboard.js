/* ---------------------------------------------------------------------------
   記 THE BAMBOO BOARD — every kitten's best on every course, at every
   difficulty, on Bamboo Infiltration's plaza board. Richard: "Leaderboard by
   course and difficulty, like Kata's and Sine's" — so it is the Sine Board's
   shape (dream/sineboard.js) over this island's numbers: a page is ONE
   COURSE AT ONE DIFFICULTY, lowest score first, because a crawl through the
   Bamboo Path on EASY and one through the Shadow Maze on HARD are not the
   same race.

   THE SCORE IS THE TIME PLUS CAUGHT_COST A CAPTURE, which is what the course
   writes down (`progress.best(name, starsId(course, n))`). The board shows
   it as the one number, because that is the number the stars are given for.
   Pure over the save row and free of THREE: world-check reads it.
--------------------------------------------------------------------------- */

import { PLAYER_STYLE } from '../../core/palette.js';
import { COURSES, DIFFS, starsId, courseById } from './bamboolevel.js';

export const BAMBOO_BOARD = { rows: 6, lastHold: 40 };

const stars3 = (n) => `${'★'.repeat(n)}${'☆'.repeat(Math.max(0, 3 - n))}`;
const MONO = '"Consolas", "Courier New", ui-monospace, monospace';

export function nameColour(name) {
  return PLAYER_STYLE.find((s) => s.name === name)?.colour ?? 0xb8c8cc;
}

/** The page as rows, best first. `filter` is `{ course, diff, who }`. */
export function bambooRows(progress, filter, limit = BAMBOO_BOARD.rows) {
  const id = starsId(filter.course, filter.diff);
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

export function bambooRowText(i, r) {
  return `${`${i + 1}.`.padEnd(3)} ${r.name.toUpperCase().slice(0, 8).padEnd(8)} ${`${r.time.toFixed(1)}s`.padStart(7)}  ${stars3(r.stars)}`;
}

export function bambooBoardLines(progress, filter) {
  const C = courseById(filter.course);
  const rows = bambooRows(progress, filter);
  const out = [
    { text: `記 ${C?.kanji ?? ''} ${C?.name ?? filter.course}`, size: 1.5, color: 0xffd36a, glow: true, jp: true },
    { text: `${DIFFS[filter.diff].name} · BEST SCORES · ${filter.who === 'all' ? 'EVERYBODY' : filter.who.toUpperCase()}`, size: 0.9, color: 0x9fefff },
  ];
  if (!rows.length) {
    out.push({ text: 'nobody has reached this scroll yet', size: 1.0, color: 0x7f9fa8 });
    out.push({ text: 'be the first! the 忍 kiosk picks a course', size: 0.8, color: 0x7f9fa8 });
  } else {
    rows.forEach((r, i) => out.push({ text: bambooRowText(i, r), size: 0.9, color: nameColour(r.name), font: MONO, weight: 700 }));
    out.push({ text: 'score = seconds + 15 a capture · the 記 kiosk changes the page', size: 0.7, color: 0x7f9fa8 });
  }
  return out;
}

/** The filters: a HoloChoice, ◀▶ on each row, one driver. */
export function bambooFilterRows(B, p, filter, repaint) {
  const D = B.dream;
  const name = p.style?.name ?? p.name;
  const ids = COURSES.map((c) => c.id);
  const cyc = (list, cur, s) => list[(list.indexOf(cur) + s + list.length) % list.length];
  return [
    { text: () => `COURSE  ◀ ${courseById(filter.course)?.name ?? filter.course} ▶`, cycle: (s) => { filter.course = cyc(ids, filter.course, s); repaint(); } },
    { text: () => `DIFFICULTY  ◀ ${DIFFS[filter.diff].name} ▶`, cycle: (s) => { filter.diff = (filter.diff + s + DIFFS.length) % DIFFS.length; repaint(); } },
    { text: () => `WHO  ◀ ${filter.who === 'all' ? 'everybody' : `just ${filter.who}`} ▶`, cycle: () => { filter.who = filter.who === 'all' ? name : 'all'; repaint(); } },
    { text: 'done', dim: true, act: () => D.closeChoice(p) },
  ];
}
