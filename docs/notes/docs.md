# The God Doc, and how it is kept true

[PROJECT.md](../../PROJECT.md) is **the God Doc**: the one page a human gets
pointed at, and the only file in the project whose value is *completeness*
rather than correctness. Everything else here can be checked by reading it. A
register cannot — nobody can look at a list and see what is missing from it.

This note is about the machinery that keeps it honest, and the rule about when
to write in it by hand.

## The rule: a major change gets a line here

**If a new developer would need to know it, it goes in the God Doc.** Not a
paragraph — a line, in the section it belongs to, pointing somewhere deeper.
That covers:

- **a new tool, document, account, service or cost** — the long-standing half of
  the rule, and the one `world-check` already enforces file-by-file;
- **a new way the project is built, tested or shipped** — the `alpha` branch and
  its Vercel preview are the case that prompted writing this down. Nothing about
  it lives in the code, so nothing in the code could have told anybody;
- **a change to the inputs, or to the numbers the doc quotes** — this one is
  automated rather than remembered, see below;
- **a rule that must not break**, which goes in the non-negotiables in
  [CLAUDE.md](../../CLAUDE.md) *and* in the God Doc's §9.

**And the change goes in the published copy too** — see *The God Doc has a twin*
below. That is not a separate rule; it is the same one, applied to the copy that
actually leaves the building.

**The test is "would somebody rediscover this by reading the code?"** A new
system, a refactor, a bug fix: no line. `git log` is the session log and the
design notes carry the reasoning. But a Vercel branch alias, a Steam page, an
API account, a filming rig — none of those are discoverable from `src/`, and a
person who does not know they exist will rebuild them.

**Date it.** The header carries **Last updated**, and `world-check` requires it
to be there and to parse. A cost or an account with no date on it is a claim
about today, and it is never about today.

## The tables generate themselves

Two of the God Doc's sections are pure restatements of things that live in the
code: **§5's balance numbers** and **§6's controls**. Those are the sections
most likely to drift, because they are the ones that change most often, and a
restatement kept in step by hand is kept in step until the first busy session.

The proof it was needed arrived before the tool did. The Joy-Con button prompts
were **wrong in the running game for months** — the clan oath said "Press A"
when the button is Y — and when that was finally fixed, the God Doc's controls
table did not even have a Joy-Con column to be wrong. Nothing anywhere would
have noticed either way.

So [tools/doc-sync.mjs](../../tools/doc-sync.mjs) writes them — **into both
copies**, the Markdown one and the published one:

```bash
npm run docs                      # rewrite the generated blocks
node tools/doc-sync.mjs --check   # say whether they are stale, change nothing
```

The words therefore exist **once**, as data, and two renderers turn them into
Markdown and into the page's own HTML. A second copy of the content, however
carefully written, is a second thing to forget — which is exactly what the
published page turned out to be. The same `<!-- doc-sync:id -->` comment syntax
works in Markdown and in HTML, which is the only reason one splice function
serves both.

**It owns the tables and nothing else.** Everything between a
`<!-- doc-sync:<id> -->` / `<!-- /doc-sync:<id> -->` pair is regenerated; every
other line is a human's. That split is the design. The prose around each table
says *why* the numbers are what they are — that strike height was 4.5 and read
as "hits from nowhere", that `P` is mount and nothing else may answer to `P` —
and that is the half a generator cannot write and would happily delete.

**It fails loudly rather than writing a hole.** Every value is fetched by name
and a name that is gone throws, with the file and the constant in the message.
There is no `?? ''` anywhere in it on purpose: a generated table with an empty
cell is worse than a hand-written one, because the empty cell looks like an
answer. A missing prompt string is a hole; a pad that genuinely cannot do an
action prints `—`, which is a different thing and is worth printing.

**It prints the literal as the source writes it.** `5.0` must not become `5`,
and `0.12` must keep its leading zero — so the numbers come back from the regex
as *strings* and are never round-tripped through `Number()`. When this was first
run against the hand-written table it reproduced it byte for byte, which is the
strongest evidence available that it is a faithful replacement rather than a
new table that happens to be near the old one.

**The ✎ is derived, not typed.** A number marked ✎ is on the balance page, and
the mark means "this value was read out of a `tune()` table" — so a ✎ can never
end up beside a number the page cannot actually reach.

**The rows come from `ACTIONS` itself**, not from a list kept in the tool. A
ninth action added to the game turns up in both control tables on the next
commit rather than being quietly absent from the doc.

### Why the two halves are read differently

`core/input.js` is **imported**: it imports nothing at all — no three.js, no
DOM — so reading it as text would be superstition.

`entities/player.js` is **read as text**, for two reasons. Half the numbers
(`GRAVITY`, `WALK_SPEED`, `FLY_BOOST`…) are module-private and cannot be
imported without widening that file's surface for a documentation tool. And
importing the rest would pull in three.js and a DOM stub, which is a second of
start-up in something that runs on every commit.

The trade is that the tool reads the *shape* of the source rather than the
value, and the strictness is what pays for it: rename a constant or change how
it is declared and the tool stops, rather than printing last year's number.

## Three places it is enforced, on purpose

| where | when | what it does |
| --- | --- | --- |
| `.githooks/pre-commit` | every commit touching `input.js`, `player.js` or `PROJECT.md` | regenerates and re-stages both files; **warns** if the page owes a publish |
| `node tools/world-check.mjs` | whenever anybody runs it | **fails** if a block is stale, if markers are gone, or if the page owes a publish |
| `npm run docs` | by hand | regenerate both files |
| `npm run artifact` | by hand | say whether the published page is current, and what to do if not |

**The hook regenerates rather than refusing.** A hook that says "run
`npm run docs` and try again" costs a round trip to do a thing it could have
done itself, and the second attempt is where somebody reaches for
`--no-verify`. What it writes is only ever a function of files already in the
commit, so it cannot surprise anybody.

**It compares hashes, not `git diff`.** `git diff -- PROJECT.md` answers "does
the working tree differ from the index", which is true whenever somebody has
the file open with prose half-written — and `git add` would then sweep those
unrelated edits into the commit. Hashing the file across the run answers the
only question that licenses a `git add`: did *doc-sync* write anything. When it
did, the hook says so, because staging a file the committer did not name is
worth a line of output.

**It only runs when the sources are in the commit**, so committing a note or a
sprite does not pay for a node start-up.

**`world-check` is the backstop for a clone that never ran
`git config core.hooksPath .githooks`** — which is every fresh clone, and the
first thing anybody does in a fresh clone is change a number. It **imports**
`doc-sync` rather than spawning it: a subprocess would make the slowest
assertion in that file a documentation one, and the slowest assertion is the one
that gets deleted. `doc-sync` guards its CLI on `argv`, so importing it renders
and returns without touching the file.

## The God Doc has a twin, and the twin is the copy people are sent

PROJECT.md's own header links a **published page** at claude.ai. That link is
the thing a person is actually handed — a colleague, a friend, anyone who is not
going to clone a repository to read a cheat sheet. It is the copy that leaves
the building, and it is therefore the copy that matters most when it is wrong.

**It was wrong.** When this was written the page claimed **1805** world-check
assertions against an actual 1888, **284** pad-check against 286, and described
the repository as **private** when it is public. Three revisions and one plain
error, live, on the link. Nothing noticed, because nothing was looking and
because the page had no source in the repository at all — it had been published
straight out of a session and then existed only on the server.

So, three changes, in the order they matter:

**The source lives in the repo now**, at
[docs/artifact/project-page.html](../../docs/artifact/project-page.html). This
is the fix that makes the other two possible. A published page with no source is
a file nobody can diff, nobody can review, and nobody can regenerate; the only
way to change it was to rewrite it from memory, which is how it drifted.

**Its tables are generated into it**, by the same `npm run docs` that writes
PROJECT.md's — including a `checks` block holding the two suite totals, because
those totals are the exact thing that drifted. `world-check` already refused to
let CLAUDE.md and PROJECT.md disagree with each other; this extends the same
pinning to the third copy, which was the one nobody was looking at.

**And [tools/artifact-sync.mjs](../../tools/artifact-sync.mjs) remembers what
was published**, so a script can say when that has stopped being true:

```bash
npm run artifact                  # where things stand
npm run artifact -- --stamp       # record that it has just been published
```

### Two hashes, because there are two ways to go stale

`docs/artifact/published.json` is committed, so the answer to *"is the page
current"* lives in the repository rather than in somebody's memory of a session.

| stamp | what a mismatch means |
| --- | --- |
| `pageSha` | the page source has been edited — by hand or by `doc-sync` — and the **live page is behind it**. Mechanical and exact. |
| `sourceSha` | **PROJECT.md has moved on** since the page was last revised, and somebody has to decide whether the page needs the same change. |

The second one deliberately fires on changes that need no mirroring — a typo fix
in PROJECT.md will trip it. **That is the right way round.** The cost of a false
alarm is re-stamping; the cost of the other error is the page quietly lying to
whoever was sent the link. `--stamp` after deciding no change was needed is a
complete and honest answer.

Hashes are taken with line endings normalised, because git converts them on
checkout here and a stamp that fired on a stray `\r` would train everybody to
re-stamp without reading — which is the only way this check can actually fail.

### Nothing here can publish, and that is why it warns and world-check refuses

Pushing a file to claude.ai needs the **Artifact tool**, which means an agent
session. There is no CLI for it and this repository will never grow one. So the
work is split at the line where a script stops being able to help:

- **`pre-commit` warns.** Blocking the commit would leave somebody holding a
  finished change they cannot land, because the thing they cannot do from a
  terminal is exactly the thing being demanded. A hook that refuses what it
  cannot help with is a hook people learn to bypass.
- **`world-check` fails.** That is the right place for a refusal: it is the
  register block, whose stated policy is enforcement over trust, and a stale
  published page is precisely the failure that block exists to catch.
- **The message is an instruction, not a complaint** — read the diff, mirror
  what a reader needs, ask an agent session to republish *to the same URL*, then
  `npm run artifact -- --stamp`. Non-negotiable 6, applied to a terminal.

### Republishing is not the same as re-sharing

**A publish does not change what people who already have the link can see.** The
artifact is shared with anyone who has it, and a shared link stays pinned to the
version it was pinned to — new publishes do not reach those viewers until the
**share pin is moved**, from the page's own share menu. So a republish makes the
page correct, and moving the pin makes it correct *for the people it was sent
to*. Both, or the second one was the only one that mattered and it did not
happen.

### Pass the URL

Republishing **must** pass the existing artifact URL. Publishing the same file
without it creates a *second* artifact at a new address, which is worse than
doing nothing: the link in PROJECT.md then points at an abandoned page while a
correct one sits somewhere nobody is looking. The URL is in
`docs/artifact/published.json`, which is where `npm run artifact` prints it from.

**There is a second artifact**, *Four Ways to Play Apart*, linked from §11 — the
networking plan. It has no source in the repo and no stamp, because it is a
finished plan rather than a living document: it records a decision made once and
is not expected to track anything. If it ever starts tracking `networking.md`,
give it the same treatment.

## What the register already enforces

The block at the end of `world-check.mjs` reads `PROJECT.md` and fails if:

- a file in `docs/notes/` is not linked from it;
- a top-level `.md` is not named in it;
- a `tools/*.mjs` or `tools/*.sh` is not named in it;
- the capture rig's own README is not pointed at;
- the check totals in `CLAUDE.md` and `PROJECT.md` disagree;
- the **Last updated** line is missing or unparseable;
- a generated block is stale, or has lost its markers — **in either file**;
- the published page is behind its own source, or behind PROJECT.md.

**What is checked is coverage, not prose.** What any of those documents *says*
is not that file's business and could not be asserted anyway. `tools/capture/*`
is deliberately out of scope: the rig has [its own guide](../../tools/capture/README.md)
and the God Doc points at it, which is the right depth for a one-page sheet.

This is why adding `doc-sync.mjs` failed `world-check` the moment it existed and
before it was written into the doc — which is the register working, and is worth
knowing before it happens to somebody at the end of a long session.
