/* ---------------------------------------------------------------------------
   Keep the God Doc's tables honest, from the code rather than from memory.

     node tools/doc-sync.mjs           rewrite the generated blocks in PROJECT.md
     node tools/doc-sync.mjs --check   say whether they are stale, change nothing

   WHY THIS EXISTS. PROJECT.md is the one page a human is pointed at, and two of
   its sections are pure restatements of things that live in the code: the
   controls, and the balance numbers. A cheat sheet that is out of date is worse
   than none — it teaches somebody a thing that is no longer true — and the two
   sections most likely to drift are exactly the two that change most often. The
   Joy-Con prompt names moved in the same session this was written; nothing
   anywhere would have noticed the doc still naming the old buttons.

   IT OWNS THE TABLES AND NOTHING ELSE. Everything between a
   `<!-- doc-sync:<id> -->` / `<!-- /doc-sync:<id> -->` pair is regenerated;
   every other line in that file is a human's and is never touched. That split
   is the whole design: the prose around these tables says WHY the numbers are
   what they are, which is the half a generator cannot write and would happily
   delete.

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

   `world-check` runs `--check` as a backstop for a clone that never ran
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
const DOC = new URL('PROJECT.md', root);

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

/* -------------------------------- blocks ---------------------------------- */

/** A tunable is marked, and the mark is DERIVED: anything read out of a
 *  `tune()` table is on the balance page by definition, so the pencil can
 *  never end up beside a number the page cannot reach. */
const T = ' ✎';

function numbersTable() {
  const st = attack('stand');
  const da = attack('dash');
  const ai = attack('air');
  const row = (b) => `dmg ${field(b, 'dmg', 'ATTACKS')} · knock ${field(b, 'knock', 'ATTACKS')}`
    + ` · lift ${field(b, 'lift', 'ATTACKS')} · reach ${field(b, 'reach', 'ATTACKS')}`;
  return [
    '| | value | |',
    '| --- | --- | --- |',
    `| walk / sprint | **${constNum(playerSrc, 'WALK_SPEED', 'player.js')}** / `
      + `**${constNum(playerSrc, 'SPRINT_SPEED', 'player.js')}** | units per second |`,
    `| jump / gravity | **${constNum(playerSrc, 'JUMP_V', 'player.js')}** / `
      + `**${constNum(playerSrc, 'GRAVITY', 'player.js')}** | double-jump; `
      + `${constNum(playerSrc, 'COYOTE', 'player.js')}s coyote time |`,
    `| fly / boost / lift | **${constNum(playerSrc, 'FLY_SPEED', 'player.js')}** / `
      + `**${constNum(playerSrc, 'FLY_BOOST', 'player.js')}** / `
      + `**${constNum(playerSrc, 'FLY_LIFT', 'player.js')}** | on a dragon |`,
    `| max HP${T} | **${field(COMBAT, 'maxHp', 'COMBAT')}** | |`,
    `| hit stun / invulnerable${T} | **${field(COMBAT, 'hitStun', 'COMBAT')}s** / `
      + `**${field(COMBAT, 'invuln', 'COMBAT')}s** | |`,
    `| KO / partner daze${T} | **${constNum(playerSrc, 'KO_TIME', 'player.js')}s** / `
      + `**${field(COMBAT, 'daze', 'COMBAT')}s** | friendly fire dazes *your partner*, `
      + 'costs *you* the swing |',
    `| rage${T} | **×${field(COMBAT, 'rage', 'COMBAT')}** at zero health | `
      + "Smash's percent rule — knockback grows as she loses HP |",
    `| strike height${T} | **${field(COMBAT, 'strikeHeight', 'COMBAT')}** | how far above/below `
      + 'a blade reaches. Was 4.5 and read as "hits from nowhere" |',
    `| base reach | **${constNum(playerSrc, 'BASE_REACH', 'player.js')}** | `
      + 'every other reach is a multiple of this |',
    `| **stand**${T} | ${row(st)} | a standing slash |`,
    `| **dash**${T} | ${row(da)} | slash while sprinting |`,
    `| **air**${T} | ${row(ai)} | slash in the air |`,
    `| **tri / dive / charge**${T} | the three power-orb moves | entries in the same table, `
      + 'so they cannot leak out of the ring |',
  ].join('\n');
}

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
  ?? (code.startsWith('Key') ? code.slice(3)
    : code.startsWith('Numpad') ? code
      : code);

/** The four movement codes as one cell, since a table row per direction would
 *  be four rows saying the same thing. */
function moveCell(set) {
  const span = (codes) => `\`${codes.map(keyName).join(' ')}\``;
  const first = span([set.up[0], set.left[0], set.down[0], set.right[0]]);
  const rest = [set.up[1], set.left[1], set.down[1], set.right[1]].filter(Boolean);
  return rest.length ? `${first}, or ${span(rest)}` : first;
}

/** One row per action, driven by `ACTIONS` itself rather than by a list kept
 *  here — so a ninth action added to the game turns up in both tables on the
 *  next commit instead of being silently missing from the doc. */
const ROW_LABELS = { start: 'start / pause', map: 'map zoom', math: 'maths overlay' };

function keyboardTable() {
  /* An action with no key gets `—` rather than being dropped. "The keyboard
     cannot zoom the map" is a fact worth printing; a missing row reads as an
     oversight. */
  const cell = (set, a) => (set[a]?.length ? set[a].map(keyName).map((k) => `\`${k}\``).join(' ') : '—');
  const head = KEYSETS.map((s) => s.name);
  const out = [
    `| action | ${head.join(' | ')} |`,
    `| --- | ${head.map(() => '---').join(' | ')} |`,
    `| move | ${KEYSETS.map((s) => moveCell(s)).join(' | ')} |`,
  ];
  for (const a of ACTIONS) {
    out.push(`| ${ROW_LABELS[a] ?? a} | ${KEYSETS.map((s) => cell(s, a)).join(' | ')} |`);
  }
  return out.join('\n');
}

/** Which prompt sets get a column, and what to call each in the doc. Joy-Cons
 *  are two columns because the two halves are genuinely different controllers
 *  — that is the same fact `PROMPTS` splits them for. */
const PAD_COLUMNS = [
  ['Xbox', () => PROMPTS.standard],
  ['PlayStation', () => PROMPTS.playstation],
  ['Joy-Con L', () => PROMPTS.vjoyDual.left],
  ['Joy-Con R', () => PROMPTS.vjoyDual.right],
];

function padTable() {
  const out = [
    `| action | ${PAD_COLUMNS.map(([h]) => h).join(' | ')} |`,
    `| --- | ${PAD_COLUMNS.map(() => '---').join(' | ')} |`,
    `| move | ${PAD_COLUMNS.map(() => 'left stick').join(' | ')} |`,
  ];
  for (const a of ACTIONS) {
    const cells = PAD_COLUMNS.map(([head, get]) => {
      const v = get()[a];
      /* A pad that cannot do an action at all is a real answer and prints as
         `—`; a MISSING string in a table that has the other seven is a hole,
         and a hole in a controls table is what sends a nine-year-old pressing
         every button on the pad. Only `PROMPTS.standard` is required to be
         complete, because it is the fallback everything else falls back to. */
      if (!v && head === 'Xbox') throw new Error(`doc-sync: PROMPTS.standard has no \`${a}\``);
      return v ? `**${v}**` : '—';
    });
    out.push(`| ${ROW_LABELS[a] ?? a} | ${cells.join(' | ')} |`);
  }
  return out.join('\n');
}

/* --------------------------------- driver --------------------------------- */

const BLOCKS = {
  numbers: numbersTable,
  keyboard: keyboardTable,
  pads: padTable,
};

/** Replace one delimited block, or throw if the doc has lost its markers. */
function splice(doc, id, body) {
  const open = `<!-- doc-sync:${id} -->`;
  const close = `<!-- /doc-sync:${id} -->`;
  const a = doc.indexOf(open);
  const b = doc.indexOf(close);
  if (a < 0 || b < 0 || b < a) {
    throw new Error(`doc-sync: PROJECT.md has no ${open} ... ${close} pair`);
  }
  return doc.slice(0, a + open.length) + '\n' + body + '\n' + doc.slice(b);
}

/** Every generated block written over the given PROJECT.md text. Exported so
 *  `world-check` can ask the question without spawning a second node — a
 *  subprocess would make the backstop the slowest check in that file and the
 *  first one somebody deletes. */
export function render(doc) {
  let out = doc;
  for (const [id, build] of Object.entries(BLOCKS)) out = splice(out, id, build());
  return out;
}

/** Which blocks are stale, by id. Empty means the doc is in step. */
export function staleBlocks(doc) {
  return Object.keys(BLOCKS).filter((id) => splice(doc, id, BLOCKS[id]()) !== doc);
}

/* Only when RUN, not when imported — `pathToFileURL` rather than a string
   compare because `world-check` imports this on Windows, where argv[1] is a
   backslash path and `import.meta.url` is a `file:///C:/...` URL. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes('--check');
  let before;
  let after;

  /* THE MESSAGE, NOT THE STACK. Every throw in here already names the file and
     the constant, and this runs from a COMMIT HOOK — four lines of node
     preamble and a `at constNum (file:///C:/Users/...)` frame bury the one
     sentence that says what to do. The frames are recoverable with
     `node --stack-trace-limit` if a regex ever needs debugging; the person who
     just renamed a constant needs the sentence. */
  try {
    before = readFileSync(DOC, 'utf8');
    after = render(before);
  } catch (e) {
    console.error(`\n${e.message}\n`);
    console.error('  Something doc-sync reads by name has moved or been renamed.');
    console.error('  Fix the name in tools/doc-sync.mjs, or put it back.\n');
    process.exit(1);
  }

  if (after === before) {
    console.log(`doc-sync: PROJECT.md is in step (${Object.keys(BLOCKS).length} blocks)`);
  } else if (check) {
    /* WHICH BLOCK — "the doc is stale" over a 460-line file is a message that
       sends somebody reading the whole thing. */
    console.error('doc-sync: PROJECT.md is STALE — run `npm run docs`');
    for (const id of staleBlocks(before)) console.error(`  stale block: ${id}`);
    process.exit(1);
  } else {
    writeFileSync(DOC, after);
    console.log(`doc-sync: PROJECT.md updated (${staleBlocks(before).join(' ')})`);
  }
}
