/* ---------------------------------------------------------------------------
   Notice when the PUBLISHED page owes a re-publish.

     node tools/artifact-sync.mjs           say where things stand
     node tools/artifact-sync.mjs --check   exit 1 if a publish is owed
     node tools/artifact-sync.mjs --stamp   record that it has just been published

   WHY THIS EXISTS. PROJECT.md has a twin at claude.ai — `docs/artifact/` holds
   its source, and the link in PROJECT.md's own header is the thing a person is
   actually SENT. That twin had drifted three check-count revisions behind
   before anybody looked: it claimed 1805 world-check assertions when there were
   1888, and it described the repository as private when it is public. Nothing
   noticed, because nothing was looking. A stale page is the same failure as a
   stale cheat sheet and worse in one way — it is the copy that leaves the
   building.

   WHAT IT CANNOT DO. It cannot publish. Pushing a file to claude.ai needs the
   Artifact tool, which means an agent session; there is no CLI for it and this
   script will never grow one. So it does the half a script CAN do, which turns
   out to be the half that was missing: it REMEMBERS what was published and
   says when that has stopped being true.

   TWO HASHES, BECAUSE THERE ARE TWO WAYS TO GO STALE.

     pageSha    the page source, at the moment it was last published.
                Differs => the source has been edited (by hand or by doc-sync)
                and the live page is behind it. Mechanical and exact.

     sourceSha  PROJECT.md, at the moment the page was last REVISED.
                Differs => the doc has moved on and somebody has to decide
                whether the page needs the same change. Not mechanical — a
                paragraph cannot be mirrored by a script — so this is a prompt
                for a human, not a diff to apply.

   The second one deliberately fires on changes that do not need mirroring —
   a typo fix in PROJECT.md will trip it. That is the right way round: the cost
   is re-stamping, and the cost of the other error is the page quietly lying to
   whoever was sent the link. `--stamp` after deciding no change was needed is
   a complete and honest answer.

   THE STAMP LIVES IN `docs/artifact/published.json` and is committed, so the
   answer to "is the page current" is in the repository rather than in somebody's
   memory of a session. See docs/notes/docs.md.
--------------------------------------------------------------------------- */

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const STAMP = new URL('docs/artifact/published.json', root);

/* Line endings are normalised before hashing. Git is set to convert on
   checkout here, so the same file hashes differently on Windows and on a CI
   box — and a stamp that fires because of a `\r` would train everybody to
   re-stamp without reading, which is the only way this check can fail. */
const shaOf = (file) => createHash('sha256')
  .update(readFileSync(new URL(file, root), 'utf8').replace(/\r\n/g, '\n'))
  .digest('hex')
  .slice(0, 16);

export function readStamp() {
  try {
    return JSON.parse(readFileSync(STAMP, 'utf8'));
  } catch {
    return null;
  }
}

/** Where things stand. `null` shas mean "no stamp yet", which counts as stale
 *  — an unstamped page is one nobody has claimed to have published. */
export function artifactStatus() {
  const stamp = readStamp();
  const pageSha = shaOf(stamp?.page ?? 'docs/artifact/project-page.html');
  const sourceSha = shaOf(stamp?.source ?? 'PROJECT.md');
  return {
    ...stamp,
    pageSha,
    sourceSha,
    pageStale: !stamp || stamp.pageSha !== pageSha,
    sourceStale: !stamp || stamp.sourceSha !== sourceSha,
  };
}

function stamp() {
  const prev = readStamp();
  if (!prev?.url) {
    throw new Error('artifact-sync: docs/artifact/published.json has no `url` — '
      + 'it must name the artifact this stamp is about');
  }
  const next = {
    ...prev,
    publishedAt: new Date().toISOString().slice(0, 10),
    pageSha: shaOf(prev.page),
    sourceSha: shaOf(prev.source),
  };
  writeFileSync(STAMP, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

function report(s) {
  const line = (label, bad, hint) =>
    console[bad ? 'error' : 'log'](`  ${bad ? '✗' : '✓'} ${label}${bad ? ` — ${hint}` : ''}`);
  console.log(`\nartifact: ${s.title ?? '(untitled)'}`);
  console.log(`          ${s.url}`);
  console.log(`          last published ${s.publishedAt ?? 'never'}\n`);
  line(`${s.page} matches what was published`, s.pageStale, 'the live page is BEHIND its source');
  line(`${s.source} unchanged since the page was revised`, s.sourceStale,
    'the doc has moved on; decide whether the page needs it too');
  if (!s.pageStale && !s.sourceStale) {
    console.log('\n  Nothing owed.\n');
    return;
  }
  /* THE INSTRUCTION, NOT JUST THE COMPLAINT — a refusal that does not say what
     it wants reads as a broken script, which is non-negotiable 6 applied to a
     terminal. */
  console.error('\n  To settle it:');
  if (s.sourceStale) {
    console.error(`    1. read what changed in ${s.source} and mirror anything a reader needs`);
    console.error(`       into ${s.page} (its tables look after themselves — npm run docs)`);
  }
  console.error('    2. ask an agent session to re-publish that file to the URL above');
  console.error('       (the Artifact tool, passing the SAME url so it updates in place)');
  console.error('    3. npm run artifact -- --stamp\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const s = artifactStatus();
  if (process.argv.includes('--stamp')) {
    const next = stamp();
    console.log(`artifact-sync: stamped ${next.publishedAt} `
      + `(page ${next.pageSha}, source ${next.sourceSha})`);
  } else if (process.argv.includes('--check')) {
    if (s.pageStale || s.sourceStale) { report(s); process.exit(1); }
    console.log(`artifact-sync: in step (published ${s.publishedAt})`);
  } else {
    report(s);
  }
}
