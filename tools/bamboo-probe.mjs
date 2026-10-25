/* ---------------------------------------------------------------------------
   忍 WHERE A KITTEN FITS, course by course — for designing, not for the game.
   `node tools/bamboo-probe.mjs [course]` prints, for every course, what
   `courseProblems` finds (bamboolevel.js: a place she cannot reach at her real
   size, a solid in a door's mouth or at a ladder's foot, a rope she cannot
   grab) and the solver's time at each difficulty against its 3★ bar.
   world-check fails on any problem; this says WHICH.
--------------------------------------------------------------------------- */
import { solve, DIFFS, courseProblems } from '../src/systems/dream/bamboolevel.js';
import { COURSES } from '../src/systems/dream/bamboocourses.js';

const want = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
for (const C of COURSES) {
  if (want && C.id !== want) continue;
  const bad = courseProblems(C);
  const times = DIFFS.map((_, n) => { const t = solve(C, n); return t == null ? 'X' : t.toFixed(0); });
  console.log(`${C.id.padEnd(8)} solve ${times.join('/')}  3★ ${C.bands.map((b) => b[2]).join('/')}  ${bad.length ? `${bad.length} PROBLEMS` : 'ok'}`);
  for (const b of bad) console.log(`   - ${b}`);
}
