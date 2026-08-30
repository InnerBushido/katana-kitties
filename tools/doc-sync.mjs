/* ---------------------------------------------------------------------------
   Keep the God Doc's tables honest, from the code rather than from memory —
   and keep the PUBLISHED page's copies of them honest by the same act.

     node tools/doc-sync.mjs           rewrite the generated blocks
     node tools/doc-sync.mjs --check   say whether they are stale, change nothing

   WHY THIS EXISTS. PROJECT.md is the one page a human is pointed at, and two of
   its sections are pure restatements of things that live in the code: the
   controls, and the balance numbers. A cheat sheet that is out of date is worse
   than none — it teaches somebody a thing that is no longer true — and the two
   sections most likely to drift are exactly the two that change most often. The
   Joy-Con prompt names moved in the same session this was written; nothing
   anywhere would have noticed the doc still naming the old buttons.

   IT WRITES TWO FILES, AND THAT IS THE POINT OF THE SHAPE BELOW. PROJECT.md has
   a published twin at claude.ai — the link a person is actually sent — and that
   twin had drifted THREE check-count revisions behind before anybody looked
   (1805 against 1888). The words therefore exist ONCE, as data, and two
   renderers turn them into Markdown and into the page's own HTML. A second copy
   of the content, however carefully written, is a second thing to forget.

   IT OWNS THE TABLES AND NOTHING ELSE. Everything between a
   `<!-- doc-sync:<id> -->` / `<!-- /doc-sync:<id> -->` pair is regenerated;
   every other line in either file is a human's and is never touched. That split
   is the whole design: the prose around these tables says WHY the numbers are
   what they are, which is the half a generator cannot write and would happily
   delete. The same comment syntax works in Markdown and in HTML, which is the
   only reason one splice function serves both.

   IT FAILS LOUDLY RATHER THAN WRITING A HOLE. Every value below is fetched by
   name, and a name that is gone throws with the file and the name in the
   message. The failure mode that would make this worse than a hand-written
   table is a generator that quietly emits an empty cell, so there is no `?? ''`
   anywhere in here on purpose.

   WHY THE BALANCE NUMBERS ARE READ AS TEXT AND NOT IMPORTED. Half of them
   (`GRAVITY`, `WALK_SPEED`, `FLY_BOOST`...) are module-private consts in
   `player.js` and cannot be imported without widening that file's surface for
   a documentation tool. Importing the rest would pull in three.js and a DOM
   stub, which is a second of start-up in a PRE-COMMIT HOOK — this runs on every
   commit and has to be instant. The trade is that this reads the SHAPE of the
   source rather than the value, and the strictness above is what pays for it:
   rename the const or change its declaration and this stops, rather than
   printing last year's number.

   THE INPUT TABLES ARE IMPORTED, because `core/input.js` imports nothing at
   all — no three.js, no DOM — so there is no reason to read it as text.

   THIS TOOL DOES NOT PUBLISH. It writes the page's SOURCE; pushing that source
   to claude.ai needs the Artifact tool and therefore an agent session.
   `tools/artifact-sync.mjs` is the half that notices when a publish is owed.
   `world-check` runs both as a backstop for a clone that never ran
   `git config core.hooksPath .githooks`. See docs/notes/docs.md.
--------------------------------------------------------------------------- */

/* input.js wires window listeners and reads localStorage from its constructor.
   Nothing here constructs one, but ESM hoists imports and a stub is two lines,
   so it is stubbed for the same reason `pad-check` does it. */
globalThis.window = globalThis.window ?? { addEventListener: () => {} };
globalThis.localStorage = globalThis.localStorage ?? {
  getItem: () => null, setItem: () => {}, removeItem: () => {},
};

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { KEYSETS, PROMPTS, ACTIONS } from '../src/core/input.js';

const root = new URL('../', import.meta.url);

/* ----------------------------- reading source ----------------------------- */

const playerSrc = readFileSync(new URL('src/entities/player.js', root), 'utf8');

/** A top-level `const NAME = <number>;`, exported or not. Throws if it moved.
 *  Returns the literal AS WRITTEN — `5.0` must not print as `5`, and `0.12`
 *  must keep its leading zero. A value round-tripped through `Number()` would
 *  quietly restyle the whole table and make the doc disagree with the file it
 *  is generated from, which is the one thing this tool exists to prevent. */
function constNum(src, name, where) {
  const m = new RegExp(`^(?:export )?const ${name} = (-?[\\d.]+);`, 'm').exec(src);
  if (!m) throw new Error(`doc-sync: ${where} has no top-level \`const ${name} = <number>\``);
  return m[1];
}

/** The body of a `tune('NAME', { ... })` call, so its fields can be read. */
function tuneBody(src, name, where) {
  const at = src.indexOf(`export const ${name} = tune('${name}', {`);
  if (at < 0) throw new Error(`doc-sync: ${where} has no \`tune('${name}', {\``);
  /* Balanced to the matching brace rather than to the first `});`, because
     ATTACKS contains nested `{ ... }` entries and a comment block with braces
     in it. Counting is the only thing that survives both. */
  let depth = 0;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`doc-sync: ${where}'s \`${name}\` is not brace-balanced`);
}

/** `key: <number>` inside a body from `tuneBody`. Throws if the key is gone. */
function field(body, key, where) {
  const m = new RegExp(`(?:^|[{,\\s])${key}: (-?[\\d.]+)[,}\\s]`).exec(body);
  if (!m) throw new Error(`doc-sync: ${where} has no \`${key}: <number>\``);
  return m[1];
}

const COMBAT = tuneBody(playerSrc, 'COMBAT', 'player.js');
const ATTACKS = tuneBody(playerSrc, 'ATTACKS', 'player.js');

/** One row of `ATTACKS`, e.g. `stand: { dmg: 10, knock: 9, ... }`. */
function attack(name) {
  const m = new RegExp(`\\n  ${name}: \\{([^}]*)\\}`).exec(ATTACKS);
  if (!m) throw new Error(`doc-sync: player.js ATTACKS has no \`${name}: { ... }\``);
  return m[1];
}

const P = (name) => constNum(playerSrc, name, 'player.js');
const C = (key) => field(COMBAT, key, 'COMBAT');

/* ---------------------------------- data ----------------------------------
   THE WORDS LIVE HERE ONCE. Two renderers below turn this into Markdown and
   into HTML, so the doc and the published page cannot say different things
   about the same number. `*stars*` mark the bits each renderer emphasises —
   one character, because anything richer would be a template language and the
   next person would have to learn it.
--------------------------------------------------------------------------- */

/** A tunable is marked, and the mark is DERIVED: anything read out of a
 *  `tune()` table is on the balance page by definition, so the pencil can
 *  never end up beside a number the page cannot reach. */
const TUNE = true;

const hit = (b) => `dmg ${field(b, 'dmg', 'ATTACKS')} · knock ${field(b, 'knock', 'ATTACKS')}`
  + ` · lift ${field(b, 'lift', 'ATTACKS')} · reach ${field(b, 'reach', 'ATTACKS')}`;

/** [label, tunable, value, note] */
const NUMBERS = () => [
  ['walk / sprint', !TUNE, `*${P('WALK_SPEED')}* / *${P('SPRINT_SPEED')}*`, 'units per second'],
  ['jump / gravity', !TUNE, `*${P('JUMP_V')}* / *${P('GRAVITY')}*`,
    `double-jump; ${P('COYOTE')}s coyote time`],
  ['fly / boost / lift', !TUNE, `*${P('FLY_SPEED')}* / *${P('FLY_BOOST')}* / *${P('FLY_LIFT')}*`,
    'on a dragon'],
  ['max HP', TUNE, `*${C('maxHp')}*`, ''],
  ['hit stun / invulnerable', TUNE, `*${C('hitStun')}s* / *${C('invuln')}s*`, ''],
  ['KO / partner daze', TUNE, `*${P('KO_TIME')}s* / *${C('daze')}s*`,
    'friendly fire dazes _your partner_, costs _you_ the swing'],
  ['rage', TUNE, `*×${C('rage')}* at zero health`,
    "Smash's percent rule — knockback grows as she loses HP"],
  ['strike height', TUNE, `*${C('strikeHeight')}*`,
    'how far above/below a blade reaches. Was 4.5 and read as "hits from nowhere"'],
  ['base reach', !TUNE, `*${P('BASE_REACH')}*`, 'every other reach is a multiple of this'],
  ['*stand*', TUNE, hit(attack('stand')), 'a standing slash'],
  ['*dash*', TUNE, hit(attack('dash')), 'slash while sprinting'],
  ['*air*', TUNE, hit(attack('air')), 'slash in the air'],
  ['*tri / dive / charge*', TUNE, 'the three power-orb moves',
    'entries in the same table, so they cannot leak out of the ring'],
];

/** How a key code reads to somebody looking at a keyboard. */
const KEY_NAMES = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  ShiftLeft: 'LShift', ShiftRight: 'RShift',
  ControlLeft: 'LCtrl', ControlRight: 'RCtrl',
  AltLeft: 'LAlt', AltRight: 'RAlt',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  Space: 'Space', Enter: 'Enter', NumpadEnter: 'NumpadEnter',
};
const keyName = (code) => KEY_NAMES[code]
  ?? (code.startsWith('Key') ? code.slice(3) : code);

/** Rows come from `ACTIONS` itself rather than from a list kept here, so a
 *  ninth action added to the game turns up in every table on the next commit
 *  instead of being silently missing from both documents. */
const ROW_LABELS = { start: 'start / pause', map: 'map zoom', math: 'maths overlay' };
/** The four a player uses constantly get the loud key cap on the page. */
const HOT = new Set(['jump', 'attack', 'interact', 'mount']);

/** The four movement codes as one cell — a row per direction would be four
 *  rows saying the same thing. */
function moveKeys(set) {
  const first = [set.up[0], set.left[0], set.down[0], set.right[0]];
  const rest = [set.up[1], set.left[1], set.down[1], set.right[1]].filter(Boolean);
  return [first, rest];
}

const keyboardData = () => ({
  head: KEYSETS.map((s) => s.name),
  move: KEYSETS.map((s) => moveKeys(s)),
  /* An action with no key gets `—` rather than being dropped. "The keyboard
     cannot zoom the map" is a fact worth printing; a missing row reads as an
     oversight. */
  rows: ACTIONS.map((a) => [ROW_LABELS[a] ?? a, HOT.has(a),
    KEYSETS.map((s) => (s[a]?.length ? s[a].map(keyName) : null))]),
});

/** Which prompt sets get a column. Joy-Cons are two columns because the two
 *  halves are genuinely different controllers — the same fact `PROMPTS` splits
 *  them for, and the clusters are rotated differently in the driver. */
const PAD_COLUMNS = [
  ['Xbox', () => PROMPTS.standard],
  ['PlayStation', () => PROMPTS.playstation],
  ['Joy-Con L', () => PROMPTS.vjoyDual.left],
  ['Joy-Con R', () => PROMPTS.vjoyDual.right],
];

const padsData = () => ({
  head: PAD_COLUMNS.map(([h]) => h),
  rows: ACTIONS.map((a) => [ROW_LABELS[a] ?? a, HOT.has(a), PAD_COLUMNS.map(([head, get]) => {
    const v = get()[a];
    /* A pad that cannot do an action at all is a real answer and prints as
       `—`; a MISSING string in a table that has the other seven is a hole, and
       a hole in a controls table is what sends a nine-year-old pressing every
       button on the pad. Only `PROMPTS.standard` is required to be complete,
       because it is the fallback everything else falls back to. */
    if (!v && head === 'Xbox') throw new Error(`doc-sync: PROMPTS.standard has no \`${a}\``);
    return v || null;
  })]),
});

/* ------------------------------ the renderers ------------------------------ */

const md = {
  em: (s) => s.replace(/\*([^*]+)\*/g, '**$1**').replace(/_([^_]+)_/g, '*$1*'),
  keys: (ks) => (ks ? ks.map((k) => `\`${k}\``).join(' ') : '—'),
  prompt: (v) => (v ? `**${v}**` : '—'),
  /* An empty cell is `| |`, not `|  |` — a trailing space that a human would
     never type is a diff on every regeneration and makes the block look like
     it changed when it did not. */
  row: (cells) => `|${cells.map((c) => (c ? ` ${c} ` : ' ')).join('|')}|`,
  rule: (n) => `| ${Array(n).fill('---').join(' | ')} |`,
};

/* `&` first or it would re-escape the entities the others produce. Only the
   four that matter here; this renders a table of button names, not arbitrary
   user text, and a general-purpose sanitiser would imply it is safe for one. */
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const html = {
  em: (s) => esc(s).replace(/\*([^*]+)\*/g, '<b>$1</b>').replace(/_([^_]+)_/g, '<em>$1</em>'),
  keys: (ks) => (ks ? ks.map((k) => `<kbd>${esc(k)}</kbd>`).join('') : '—'),
  prompt: (v, hot) => (v ? `<kbd${hot ? ' class="hot"' : ''}>${esc(v)}</kbd>` : '—'),
};

function mdNumbers() {
  return [
    md.row(['', 'value', '']),
    md.rule(3),
    ...NUMBERS().map(([label, tunable, value, note]) =>
      md.row([md.em(label) + (tunable ? ' ✎' : ''), md.em(value), note])),
  ].join('\n');
}

function htmlNumbers() {
  /* `<b>✎</b>` and the column widths are the page's existing house style, kept
     rather than replaced: this block took over a hand-written table and the
     point is that a reader cannot tell which tables are generated. */
  const body = NUMBERS().map(([label, tunable, value, note]) =>
    `      <tr><td>${html.em(label)}${tunable ? ' <b>✎</b>' : ''}</td>`
    + `<td class="num">${html.em(value)}</td><td>${html.em(note)}</td></tr>`).join('\n');
  return [
    '<div class="tw"><table>',
    '    <thead><tr><th style="width:34%">What</th><th style="width:30%">Value</th><th>Note</th></tr></thead>',
    '    <tbody>',
    body,
    '    </tbody>',
    '</table></div>',
  ].join('\n');
}

function mdKeyboard() {
  const d = keyboardData();
  const move = d.move.map(([first, rest]) => {
    const span = (cs) => `\`${cs.map(keyName).join(' ')}\``;
    return rest.length ? `${span(first)}, or ${span(rest)}` : span(first);
  });
  return [
    md.row(['action', ...d.head]),
    md.rule(d.head.length + 1),
    md.row(['move', ...move]),
    ...d.rows.map(([label, , cells]) => md.row([label, ...cells.map(md.keys)])),
  ].join('\n');
}

function htmlKeyboard() {
  const d = keyboardData();
  const move = d.move.map(([first, rest]) => {
    const caps = (cs) => cs.map((c) => `<kbd>${esc(keyName(c))}</kbd>`).join('');
    return rest.length ? `${caps(first)} <i>or</i> ${caps(rest)}` : caps(first);
  });
  const rows = d.rows.map(([label, , cells]) =>
    `      <tr><td>${esc(label)}</td>${cells.map((c) => `<td>${html.keys(c)}</td>`).join('')}</tr>`);
  return [
    '<div class="tw"><table>',
    `    <thead><tr><th>Action</th>${d.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>`,
    '    <tbody>',
    `      <tr><td>move</td>${move.map((m) => `<td>${m}</td>`).join('')}</tr>`,
    ...rows,
    '    </tbody>',
    '</table></div>',
  ].join('\n');
}

function mdPads() {
  const d = padsData();
  return [
    md.row(['action', ...d.head]),
    md.rule(d.head.length + 1),
    md.row(['move', ...d.head.map(() => 'left stick')]),
    ...d.rows.map(([label, , cells]) => md.row([label, ...cells.map(md.prompt)])),
  ].join('\n');
}

function htmlPads() {
  const d = padsData();
  const rows = d.rows.map(([label, hot, cells]) =>
    `      <tr><td>${esc(label)}</td>${cells.map((c) => `<td>${html.prompt(c, hot)}</td>`).join('')}</tr>`);
  return [
    '<div class="tw"><table>',
    `    <thead><tr><th>Action</th>${d.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>`,
    '    <tbody>',
    `      <tr><td>move</td>${d.head.map(() => '<td>left stick</td>').join('')}</tr>`,
    ...rows,
    '    </tbody>',
    '</table></div>',
  ].join('\n');
}

/* THE CHECK COUNTS, ON THE PUBLISHED PAGE ONLY. This is the exact number that
   drifted: the page said 1805 and 284 while the suites had grown to 1888 and
   286, and it said so for three revisions. `world-check` already refuses to let
   CLAUDE.md and PROJECT.md disagree with each other; this extends the same
   pinning to the third copy, which is the one nobody was looking at.

   ITS SOURCE IS PROJECT.md, not the suites. A count is not knowable until the
   last assertion has run, and one of the assertions IS this check — so the true
   value is confirmed by eye against the line the script prints, and everything
   downstream is pinned to that one literal rather than to three of them. */
function checksBlock() {
  const proj = readFileSync(new URL('PROJECT.md', root), 'utf8');
  const count = (what) => {
    const m = new RegExp(`# (\\d+) checks: ${what}`).exec(proj);
    if (!m) throw new Error(`doc-sync: PROJECT.md has no \`# <n> checks: ${what}\` line`);
    return m[1];
  };
  const c = (s) => `<span class="c"># ${s}</span>`;
  return ['<pre><code>node tools/world-check.mjs    '
    + c(`${count('world')} checks: world, dragons, clans, sprites,`),
  `                              ${c('tournament, consent, balance')}`,
  `node tools/pad-check.mjs      ${c(`${count('controllers')} checks: controllers, keyboard sets,`)}`,
  `                              ${c('button prompts, the stuck-vJoy latch')}`,
  `npm run check                 ${c('both of the above, in one line')}`,
  `npm run docs                  ${c("this page's tables and PROJECT.md's, from the code")}`,
  `npm run artifact              ${c('is this published page still current?')}</code></pre>`,
  ].join('\n');
}

/* --------------------------------- targets -------------------------------- */

/** Both files, and which builder fills each of their blocks. A file listed
 *  here MUST carry every marker named for it — a missing pair throws rather
 *  than being skipped, because a silently-skipped block is a stale table. */
export const TARGETS = [
  ['PROJECT.md', { numbers: mdNumbers, keyboard: mdKeyboard, pads: mdPads }],
  ['docs/artifact/project-page.html',
    { checks: checksBlock, numbers: htmlNumbers, keyboard: htmlKeyboard, pads: htmlPads }],
];

/** Replace one delimited block, or throw if the file has lost its markers. */
function splice(doc, id, body, file) {
  const open = `<!-- doc-sync:${id} -->`;
  const close = `<!-- /doc-sync:${id} -->`;
  const a = doc.indexOf(open);
  const b = doc.indexOf(close);
  if (a < 0 || b < 0 || b < a) {
    throw new Error(`doc-sync: ${file} has no ${open} ... ${close} pair`);
  }
  return doc.slice(0, a + open.length) + '\n' + body + '\n' + doc.slice(b);
}

/** Every generated block written over the given text. Exported so `world-check`
 *  can ask the question without spawning a second node — a subprocess would
 *  make the backstop the slowest check in that file and the first one somebody
 *  deletes. */
export function render(file, doc) {
  const blocks = TARGETS.find(([f]) => f === file)?.[1];
  if (!blocks) throw new Error(`doc-sync: ${file} is not a doc-sync target`);
  let out = doc;
  for (const [id, build] of Object.entries(blocks)) out = splice(out, id, build(), file);
  return out;
}

/* LINE ENDINGS ARE NORMALISED ON THE WAY IN, and this is not a nicety.
   Git is set to convert on checkout here, so a fresh clone on Windows has
   CRLF in these two files while everything below writes LF — and every block
   then compared unequal to itself. `world-check` failed all seven blocks on a
   tree with no content difference at all, and `npm run docs` "fixed" it by
   rewriting the files with identical bytes and different endings. A check that
   fires on a clean checkout is a check people learn to run twice and then stop
   reading, which is the same trap `tools/artifact-sync.mjs` guards its hashes
   against, for the same reason. */
const read = (file) => readFileSync(new URL(file, root), 'utf8').replace(/\r\n/g, '\n');

/** Which blocks of which files are stale, as `file:id`. Empty means in step. */
export function staleBlocks() {
  const stale = [];
  for (const [file, blocks] of TARGETS) {
    const doc = read(file);
    for (const [id, build] of Object.entries(blocks)) {
      if (splice(doc, id, build(), file) !== doc) stale.push(`${file}:${id}`);
    }
  }
  return stale;
}

/* Only when RUN, not when imported — `pathToFileURL` rather than a string
   compare because `world-check` imports this on Windows, where argv[1] is a
   backslash path and `import.meta.url` is a `file:///C:/...` URL. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes('--check');

  /* THE MESSAGE, NOT THE STACK. Every throw in here already names the file and
     the constant, and this runs from a COMMIT HOOK — four lines of node
     preamble and a `at constNum (file:///C:/Users/...)` frame bury the one
     sentence that says what to do. The frames are recoverable with
     `node --stack-trace-limit` if a regex ever needs debugging; the person who
     just renamed a constant needs the sentence. */
  let stale;
  const pending = [];
  try {
    stale = staleBlocks();
    for (const [file] of TARGETS) {
      const at = new URL(file, root);
      const before = read(file);
      const after = render(file, before);
      if (after !== before) pending.push([at, after]);
    }
  } catch (e) {
    console.error(`\n${e.message}\n`);
    console.error('  Something doc-sync reads by name has moved or been renamed.');
    console.error('  Fix the name in tools/doc-sync.mjs, or put it back.\n');
    process.exit(1);
  }

  if (!stale.length) {
    const n = TARGETS.reduce((t, [, b]) => t + Object.keys(b).length, 0);
    console.log(`doc-sync: in step (${n} blocks across ${TARGETS.length} files)`);
  } else if (check) {
    /* WHICH BLOCK — "the doc is stale" over two files and 1,500 lines is a
       message that sends somebody reading all of it. */
    console.error('doc-sync: STALE — run `npm run docs`');
    for (const id of stale) console.error(`  ${id}`);
    process.exit(1);
  } else {
    for (const [at, after] of pending) writeFileSync(at, after);
    console.log(`doc-sync: updated ${stale.join(' ')}`);
    /* THE PAGE'S SOURCE IS NOT THE PAGE. Writing the file changes nothing that
       anybody can see until an agent session republishes it, and the whole
       reason this tool now writes two files is that the published copy had
       silently drifted three revisions. Say it here, where somebody is looking. */
    if (stale.some((s) => s.startsWith('docs/artifact/'))) {
      console.log('doc-sync: the PUBLISHED page is now behind its source — '
        + 'republish it (see docs/notes/docs.md)');
    }
  }
}
