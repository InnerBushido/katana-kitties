# Katana Kitties — the rule register

Every standing rule in this project in one place: the ones written as
"non-negotiables", and also the ones that work like rules but are filed
elsewhere. That includes Claude's private memory folder, which is outside the
repo.

**How to use this file.** Under each rule, fill in **Your call** with `KEEP`,
`CHANGE` or `REMOVE`, and add a **Note** saying what you want instead. Any
text editor works. Claude reads this file and makes the change in every copy
of the rule (listed under *Lives in*).

**Status words.** `active` is in force and every copy agrees. `relaxed` is in
force with a written exception. `CONFLICT` means the copies disagree today and
one of them is wrong. `stale` means a copy says something that is no longer
true. `satisfied` means the condition the rule waited on has been met. `new`
means the rule arrived after the register was first compiled and Richard has
not reviewed it yet.

Compiled 2026-10-13 from CLAUDE.md, PROJECT.md §9, the Field Guide
(docs/artifact/project-page.html §9), docs/notes/*, and Claude's memory folder.
Brought up to date 2026-10-29: Payne's sign-off (P1), and the git and shipping
rules (H), which had all changed since; nothing else had moved.

**The review page** is https://claude.ai/artifact/S9zerAZh9iXKp9n84Ei7cK. It
is built from this file by `node tools/rules-page.mjs`, and Richard's marks on
it are saved in the page's own store, where a session can read them.

## Keeping this file current

**A rule that is not in this file is not a rule yet.** Whenever a session
introduces one, by any of the four routes below, it adds an entry here in the
same commit:

- the status is `new`;
- **Came from** names who decided it and the date, quoting Richard's words where
  there are any, or names the bug it came out of;
- **Lives in** lists every copy, including a memory file;
- **Your call** and **Note** are left empty for Richard.

A session must not upgrade a `new` rule to `active`. Only Richard's review does
that. Changing or retiring a rule means changing it here *and* in every copy
under **Lives in**. Then rebuild the page (`node tools/rules-page.mjs`) and
republish it to the URL above.

`world-check` holds the floor: every non-negotiable in CLAUDE.md must have an
entry here, and every entry must carry a Status, a Your call and a Note line.

---

## How a rule gets made (and how an unwanted one gets in)

There are four ways a rule enters this project. Only the first is supposed to
happen.

1. **You say it, and it is written down.** For example: "Space is the key an
   elbow finds", "not everything needs to be procedural", or "UI behind other
   UI is unclickable". The session writes it into CLAUDE.md, and
   docs/notes/docs.md says a rule that must not break also goes into
   PROJECT.md §9 and the Field Guide §9. **That makes three hand-kept copies**,
   plus usually a design note.
2. **A bug becomes a rule.** Something breaks in a playtest. The fix comes with
   a `world-check` assertion (house style: "add the check that would have
   caught it"), and the reasoning goes into a docs/notes file. Some of those
   reasons get promoted to "non-negotiable N" in prose. A rule made this way
   is often **Claude's wording of a lesson** and not your own words.
3. **Claude's private memory.** When you correct Claude, it saves a
   *feedback* or *project* memory under `~/.claude/projects/.../memory/`. That
   folder is not in the repo, is not in the God Doc, and is loaded into every
   session. **A memory can quietly override CLAUDE.md**: the housing memory
   says so in as many words ("these override CLAUDE.md wording that has not
   been updated yet").
4. **Prose escalation.** A design note calls something "the Nth
   non-negotiable, read the other way round", and later sessions treat that
   reading as a rule. Most of the 150-plus places that cite a non-negotiable
   are of this kind.

**What goes wrong:** the copies drift (four drifts found today, marked
`CONFLICT` / `stale` below), and a rule can exist without anyone having
decided it.

**What would stop it:** make *this file* the only place a rule is written.
Generate the CLAUDE.md block and both §9s from it, the same way §5 and §6
already generate from code. Have `world-check` fail when any copy drifts. Add
one standing instruction: *Claude may propose a rule but never adds one here
without your OK, and every rule names who decided it and when.*

---

## A. The nine non-negotiables (game design)

Live in: CLAUDE.md "The non-negotiables", PROJECT.md §9, Field Guide §9, and
cited throughout docs/notes/.

### N1 · The maths is the point, not a bolt-on
- **Rule:** The Kotodama Orb draws its working from the same two numbers that position it, and the Dojo of the Turning Circle is a walkable unit circle where you become the point. Neither may be reduced to decoration. A prettier orb that lied about its own position would be worse than no orb.
- **Why:** The game exists partly to teach sine and cosine to the girls.
- **Came from:** Richard, at the start of the project.
- **Enforced by:** world-check
- **Status:** active
- **Your call:**
- **Note:**

### N2 · The art is the kids'
- **Rule:** The cat-head title menu and the six clan leaders are the girls' drawings, redrawn faithfully. Don't redesign either.
- **Why:** They made them.
- **Came from:** Richard.
- **Enforced by:** review only
- **Status:** active
- **Your call:**
- **Note:**

### N3 · No combat outside the ring
- **Rule:** `Game.strikePlayers` is the only gate, and it asks one question: is a tournament round live this frame? Enemies in the open world have been rejected on purpose. The katana exists to knock scenery over.
- **Relaxation (Oct 2026, built):** two geared kittens on the same taped square in a home's kendo room get a shove and an IPPON point, and never damage.
- **Relaxation (Oct 2026, NOT built, memory only):** a Bushido-Blade-style bamboo forest fighting zone. It is marked as a later feature and appears in no repo doc.
- **Came from:** Richard; the kendo relaxation from the housing scoping on 2026-10-12.
- **Enforced by:** world-check (the gate's regex; `kendo.js` contains no `.hurt(`)
- **Status:** relaxed
- **Your call:**
- **Note:**

### N4 · Nothing regrows and nothing is lost
- **Rule:** A knocked-over prop stays down, so the MISCHIEF counter is honest. A dragon can never be stranded, a pet can never be lost, and every player has one rideable animal on the home island.
- **CONFLICT:** Claude's housing memory (2026-10-12) says "Non-negotiable 4 relaxed for currency: Mischief points are a spendable, renewable currency" and that this overrides CLAUDE.md. **That was never built and never reached CLAUDE.md.** housing.md says homes are priced in *orbs*, "never points". Either the relaxation is wanted and missing, or the memory is stale.
- **Came from:** Richard; the relaxation from the housing scoping.
- **Enforced by:** world-check
- **Status:** CONFLICT
- **Your call:**
- **Note:**

### N5 · Two players keep the game they know
- **Rule:** Everything for three and four players is additive. Where a rule generalises, the two-player result must come out bit-identical: the HUD, the camera and the split screen. Every tier opens on one kitten and the second seat is asked for, but once two are playing nothing has moved.
- **Why:** The game was made for two sisters first.
- **Came from:** Richard, when four-player was added.
- **Enforced by:** world-check
- **Status:** active
- **Your call:**
- **Note:**

### N6 · A refusal must say so, and so must a confirmation
- **Rule:** Every refusal shows a toast. Every lock states what it needs as an instruction. Every dialog button says what it does ("no, keep playing" / "yes, start over"), never a bare yes/no.
- **Why:** A button that silently does nothing reads as broken.
- **Came from:** Richard, from playtests.
- **Enforced by:** world-check (partly)
- **Status:** active
- **Your call:**
- **Note:**

### N7 · Nothing irreversible on one press; the default answer is no
- **Rule:** A scene is skipped by Escape or a pad's Start and nothing else. Never Space, Enter or "any button". Every irreversible button asks first, and confirm dialogs have no primary button, so the cursor opens on cancel. State changes when a scene is *accepted*, never when it *finishes*. One player drives a menu (whoever opened it), and the screen says who.
- **Why:** Four kids hold sticks and mash, and Space is the key an elbow finds (docs/notes/consent.md).
- **Came from:** Richard, after a four-player afternoon.
- **Enforced by:** world-check, pad-check
- **Status:** active
- **Your call:**
- **Note:**

### N8 · Sprite sheets are measured, not assumed
- **Rule:** Column counts, cell sizes, baselines and facing are read off the image. A generated sheet's rows don't have to agree with each other. Never settle a facing by reasoning.
- **Why:** Reasoned numbers have been wrong roughly every time.
- **Came from:** Lessons from bugs.
- **Enforced by:** world-check
- **Status:** active
- **Your call:**
- **Note:**

### N9 · Procedural by default; generated where it is better and affordable
- **Rule:** No engine, no physics library, no asset store, no character meshes. A generated recording (voices, music, video) may replace a procedural one when it is clearly better, and the price is stated before it is spent. Every generated file degrades: delete `public/voice/` or `public/music/` and the game still plays with the procedural version. The 20MB trailer is opt-in and never loads until asked.
- **Note on wording:** This is NOT "everything must be procedural". That was the old rule, and you relaxed it in Oct 2026: "not everything needs to be procedural! ... we will choose the higher quality route where possible and affordable."
- **Drift:** PROJECT.md and the Field Guide add "no new dependencies", which CLAUDE.md does not say.
- **Came from:** Richard, revised Oct 2026.
- **Enforced by:** world-check (fallbacks, trailer opt-in)
- **Status:** active
- **Your call:**
- **Note:**

---

## B. People, likeness and voices

### P1 · Payne is a real person
- **Rule:** Payne (the market quest-giver) is a real Belegarth fighter. Her photos went to Higgsfield as image references with your OK, and nowhere else.
- **Approval:** She approved being in the game, and her lines and her voice on 2026-10-04 ("Payne approved the lines and her voice, so we are good there").
- **Answered 2026-10-28:** new or changed lines, cutscenes and footage of her **no longer need her sign-off**. Richard: "We don't need Payne's approval for current or future cutscenes or voices anymore ... She has already approved being in the game and looking forward to seeing what we make." Every copy below now says so (the README row that still said "pending" was fixed too).
- **Lives in:** docs/notes/payne.md, docs/notes/README.md, PROJECT.md, Field Guide, CLAUDE.md (payne row), src/systems/payne.js (comment), Claude memory (voice-cast)
- **Status:** satisfied
- **Your call:**
- **Note:**

### P2 · Lionheart is you; your references have limits
- **Rule:** Lionheart's likeness is yours to approve. Never reproduce the lettering on the real bandana (it contains profanity), only the red/black checker and the cat motif. The mp3 in `Design Ideas/Lionheart - Dream Dojo/` is a commercial track: inspiration only.
- **Lives in:** Claude memory (dream-dojo-vision), docs/notes/dreamdojo.md
- **Status:** active
- **Your call:**
- **Note:**

### P3 · One voice per character
- **Rule:** Every character is pinned to one ElevenLabs voice, recorded with its id in docs/notes/voices.md. Read it before generating any line, and cast any new character there first (Roshi needed an entry before any lines).
- **Lives in:** docs/notes/voices.md, Claude memory (voice-cast)
- **Status:** active
- **Your call:**
- **Note:**

---

## C. World invariants

Live in: docs/notes/rules.md (the "gameplay rules worth not breaking").

### W1 · A dragon for every player at home
- **Rule:** The home island has one dragon perch per player (four), asserted against `MAX_PLAYERS` and not the number 4. A dragon lands beside you or follows you down, and goes home only when nobody is left on its island.
- **Why:** No kitten is left on the ground watching her sister fly.
- **Enforced by:** world-check
- **Status:** active
- **Your call:**
- **Note:**

### W2 · Bamboo is katana-only, and there is enough of it
- **Rule:** Bamboo can't be dive-bombed or burned, and there must be enough on the home island for every kitten to raise a panda.
- **Enforced by:** world-check
- **Status:** active
- **Your call:**
- **Note:**

### W3 · A neglected home animal never dies or runs away
- **Rule:** Home animals run in real time across sessions, about one check-in a week. Neglect only means hungry and not growing, which lowers the buff. It never means death or running away.
- **Came from:** Richard, housing scoping, 2026-10-12. This extends N4 ("a pet can never be lost") to the home animals.
- **Lives in:** docs/notes/housing.md, Claude memory (housing-feature-decisions)
- **Status:** new
- **Your call:**
- **Note:**

---

## D. Screens and controls

### U1 · Design for a phone at the same time as desktop
- **Rule:** A new screen gets its `body.touch-ui` rule as part of the work, not as a follow-up. A landscape phone is 844×390: short, not narrow.
- **Lives in:** CLAUDE.md house style, PROJECT.md §9, Field Guide
- **Status:** active
- **Your call:**
- **Note:**

### U2 · UI behind other UI is unclickable
- **Rule:** Where two clickable layers overlap, handle it with stacking order, and use `pointer-events: none` on the one genuinely behind. Always leave the way out clickable.
- **Came from:** Richard, after an afternoon with three of these live at once.
- **Status:** active
- **Your call:**
- **Note:**

### U3 · Read "UI fall-through" before designing any menu
- **Rule:** A press is an event and a held key is a state, so every screen answers a press exactly once. This bug has been found five times.
- **Lives in:** docs/notes/gotchas.md, CLAUDE.md
- **Status:** active
- **Your call:**
- **Note:**

### U4 · Help cards have a length budget
- **Rule:** The four longest Help cards are measured against a cap set just above today's length.
- **Enforced by:** world-check
- **Status:** active
- **Your call:**
- **Note:**

### U5 · The two wipe rows have no key
- **Rule:** "Wipe the record board" and "wipe the saved games" in the debug panel have no keyboard shortcut, ask first, and put the count in the button.
- **Enforced by:** world-check
- **Status:** active
- **Your call:**
- **Note:**

### U6 · Player 1 is always WASD, player 2 always the arrows
- **Rule:** Seat 1 gets WASD and seat 2 gets the arrows / O K L ;, whatever pads are connected. A seat with a pad keeps it and has its keys added as a second hand. Seats 3 and 4 prefer WASD and the arrows.
- **Came from:** A playtest bug, Oct 2026. A Bluetooth pad that Windows still reported after it was unpaired took player 1's seat, and Ember could not move. This replaced the old slot-affinity rule.
- **Lives in:** docs/notes/input.md
- **Enforced by:** pad-check
- **Status:** new
- **Your call:**
- **Note:**

---

## E. How code is written and checked

### E1 · Comments explain WHY and name what was tried and failed
- **Status:** active
- **Your call:**
- **Note:**

### E2 · A fix comes with the check that would have caught it
- **Status:** active
- **Your call:**
- **Note:**

### E3 · A check that is sometimes red is a bug in the check
- **Rule:** Measure the spread over a dozen runs and set the bar from that.
- **Status:** active
- **Your call:**
- **Note:**

### E4 · Balance is edited on /tuning.html, not in code
- **Rule:** `src/tuning.json` holds overrides only. The literals in the code stay the defaults.
- **Status:** active
- **Your call:**
- **Note:**

### E5 · Measure, don't reason, about anything drawn
- **Rule:** Sizes, seat heights, mouth positions and facings are read off the loaded atlas.
- **Status:** active
- **Your call:**
- **Note:**

### E6 · Prefer a rule that degrades over one that vanishes
- **Rule:** A missing field must not NaN a position and make a character silently undrawn.
- **Status:** active
- **Your call:**
- **Note:**

---

## F. Documentation

### D1 · A change a new developer would need gets a line in PROJECT.md and in the Field Guide
- **Rule:** New tool, doc, account, service, cost, or a new way to build, test or ship. The Field Guide is then republished to the same URL. Refactors and bug fixes get no line.
- **Lives in:** CLAUDE.md, docs/notes/docs.md
- **Enforced by:** world-check (partly), artifact-sync
- **Status:** active
- **Your call:**
- **Note:**

### D2 · §5 and §6 are generated
- **Rule:** Never hand-edit between the `<!-- doc-sync -->` markers. `npm run docs` writes them, and a pre-commit hook re-runs it.
- **Enforced by:** world-check
- **Status:** active
- **Your call:**
- **Note:**

### D3 · Every rule is entered in RULES.md (the rule about rules)
- **Rule:** Any new rule gets an entry here in the same commit, as `new`, with who decided it and when (see *Keeping this file current*). A non-negotiable also still goes in CLAUDE.md and in PROJECT.md §9 and the Field Guide §9, as docs/notes/docs.md says.
- **Proposed next:** this file becomes the only place a rule is written, and the CLAUDE.md block and both §9 copies are generated from it.
- **Came from:** Richard, 2026-10-13: "would be good if they are kept up to date if any new rules are introduced".
- **Lives in:** RULES.md, CLAUDE.md house style, docs/notes/docs.md
- **Enforced by:** world-check (coverage of the non-negotiables only)
- **Status:** new
- **Your call:**
- **Note:**

---

## G. Assets and spending

### A1 · A new player sprite is four sprites
- **Rule:** Any new pose is generated for all four kittens, never only Ember and Frost.
- **Lives in:** Claude memory only
- **Status:** active
- **Your call:**
- **Note:**

### A2 · Generate sprites on flat magenta, never white
- **Rule:** #FF00FF background, chroma-keyed by `sprite-bake --proof`.
- **Lives in:** Claude memory, docs/notes/art.md
- **Status:** active
- **Your call:**
- **Note:**

### A3 · Say the price before spending
- **Rule:** Every paid generation states its cost first. `statue-bake` prints the price and stops unless given `--go`. Higgsfield's `use_unlim` stays off unless you ask for it.
- **Standing exceptions:** ElevenLabs tests under about $2–3 need no ask (2026-10-10). ElevenLabs Music for housing is pre-authorised without limit (2026-10-12).
- **Lives in:** CLAUDE.md N9, Claude memory (elevenlabs, higgsfield, housing)
- **Status:** active
- **Your call:**
- **Note:**


### A4 · Outside pictures only if a released game may carry them
- **Rule:** Every picture is the game's own except `public/help/japan/`. A picture comes in only if its licence lets a commercial game ship it, and it is credited on the Picture credits page.
- **Came from:** Richard, Oct 2026, with that condition.
- **Lives in:** docs/notes/credits.md
- **Status:** new
- **Your call:**
- **Note:**
---

## H. Git and shipping

Live in: CLAUDE.md (*Run it, check it*), PROJECT.md §3, HANDOFF.md *Branches*,
`.githooks/`, `vercel.json`, and Claude memory (git, worktrees). The whole of
this section was rewritten on 2026-10-29: every entry had changed since
2026-10-13, and G2's conflict was settled by the new channel rules.

### G1 · Typed branches, stamped commits
- **Rule:** Branches are `feature/`, `bugfix/` or `mixed/`. A commit-msg hook stamps `[branch]`. A finished branch is merged into the **local `alpha`** with `--no-ff` (it used to be local `main`). Improvements to a feature go back on that feature's branch, and a branch is never renamed. The git identity is InnerBushido; check `gh auth status` before pushing.
- **Status:** active
- **Your call:**
- **Note:**

### G2 · When alpha and main get pushed
- **Rule:** `alpha` is pushed only when you say so, as `git -c kk.release=true push origin alpha`; `.githooks/pre-push` refuses it otherwise. `main` takes `alpha` once you have played it. Branch pushes are backups: `vercel.json` builds only `main` and `alpha`.
- **Came from:** Richard, 2026-10-28: "I don't want to be deploying Vercel every time we push a branch, I expect only pushing to the main or alpha branch will publish to Vercel... all the other branch pushes are to backup the work."
- **Settles the old CONFLICT:** "never pushed until Richard has played it" against "when he says push, push" (2026-08-24). Both are true now: nothing reaches `alpha` or `main` without your word, and your word is enough.
- **Open:** the Vercel dashboard's Ignored Build Step is still yours to set, for branches cut before `vercel.json`.
- **Enforced by:** `.githooks/pre-push`, `vercel.json`
- **Status:** new
- **Your call:**
- **Note:**

### G3 · alpha is the testing channel
- **Rule:** `alpha` (https://katana-kitties-git-alpha-dream-dojo.vercel.app) is where work branches are merged and played; `main` takes `alpha`. Keep branches separate: merging one into another drags it to `alpha` with it, and if one needs another's code, ask first.
- **Retired:** the old G3, "alpha only fast-forwards to main and may never carry a commit main lacks". The flow runs the other way now.
- **Came from:** Richard, 2026-10-26, after kendo rode to `alpha` inside the bamboo branch: "make sure to separate into different branches next time".
- **Status:** new
- **Your call:**
- **Note:**

### G4 · Publish every branch; delete none until it is on origin/main
- **Rule:** A work branch is pushed to GitHub as soon as it has a commit, and every commit after. No branch is deleted, locally or on GitHub, until its work is on `origin/main`; reaching `alpha` is not enough. Then `git branch -d`, never `-D`.
- **Came from:** Richard, 2026-10-26: "we should be pushing the branch and the commits to Github and not just leaving them as local commits ... keep the branches around until they are merged from Alpha to origin main, then we can clean up".
- **Status:** new
- **Your call:**
- **Note:**

### G5 · One folder, no worktrees unless asked
- **Rule:** Work happens in the one project folder, switching branches. A worktree only when you ask for two sessions working at once, and then outside OneDrive.
- **Came from:** Richard, 2026-10-28: "Go all the way to single folder." The extra worktrees had confused him, and OneDrive synced and then alarmed about each one.
- **Lives in:** CLAUDE.md, Claude memory (worktrees)
- **Status:** new
- **Your call:**
- **Note:**

### G6 · What never leaves the machine
- **Rule:** The repo is public. `extra/scratchpad-ideas` (your own voice recordings) is not pushed without asking. `out/` is a local-only repo with no remote, and `out/trailer/ref/cackle.wav` never leaves the machine.
- **Lives in:** Claude memory (git), docs/notes/voices.md
- **Status:** new
- **Your call:**
- **Note:**

---

## I. How Claude behaves (memory only, not in the repo)

### C1 · Look before claiming something is lost
- **Status:** active
- **Your call:**
- **Note:**

### C2 · Surface any permission block or old hold; never add a project restriction without asking
- **Rule:** If a tool check refuses something, name what refused it. Never install a guard or keep an old "hold this back" without asking.
- **Status:** active
- **Your call:**
- **Note:**
