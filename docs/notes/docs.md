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

So [tools/doc-sync.mjs](../../tools/doc-sync.mjs) writes them:

```bash
npm run docs                      # rewrite the generated blocks
node tools/doc-sync.mjs --check   # say whether they are stale, change nothing
```

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
| `.githooks/pre-commit` | every commit that touches `input.js` or `player.js` | regenerates and re-stages `PROJECT.md` |
| `node tools/world-check.mjs` | whenever anybody runs it | fails if a block is stale, or if the markers are gone |
| `npm run docs` | by hand | the same thing, deliberately |

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

## What the register already enforces

The block at the end of `world-check.mjs` reads `PROJECT.md` and fails if:

- a file in `docs/notes/` is not linked from it;
- a top-level `.md` is not named in it;
- a `tools/*.mjs` or `tools/*.sh` is not named in it;
- the capture rig's own README is not pointed at;
- the check totals in `CLAUDE.md` and `PROJECT.md` disagree;
- the **Last updated** line is missing or unparseable;
- a generated block is stale, or has lost its markers.

**What is checked is coverage, not prose.** What any of those documents *says*
is not that file's business and could not be asserted anyway. `tools/capture/*`
is deliberately out of scope: the rig has [its own guide](../../tools/capture/README.md)
and the God Doc points at it, which is the right depth for a one-page sheet.

This is why adding `doc-sync.mjs` failed `world-check` the moment it existed and
before it was written into the doc — which is the register working, and is worth
knowing before it happens to somebody at the end of a long session.
