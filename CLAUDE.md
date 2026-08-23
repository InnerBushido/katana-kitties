# Katana Kitties — working notes

A split-screen co-op browser game for up to four players, three.js and nothing
else at runtime. Made for, and partly by, Richard's nieces (9 and younger). Two
of its features exist to teach sine and cosine and are not decoration — see
**The maths is the point**, below.

**This file is loaded into every session. It is deliberately short.** It holds
what is true on every turn: how to run it, what must not break, and where to
look. Everything else is one level down and read on demand.

| you want | read |
| --- | --- |
| what works, what's open, what's next | [HANDOFF.md](HANDOFF.md) |
| why some code is the way it is | [docs/notes/](docs/notes/README.md) — one file per area |
| how a player experiences it | [README.md](README.md) |
| how it runs under Steam, and its artwork | [docs/notes/steam.md](docs/notes/steam.md) |
| which voice belongs to which character | [docs/notes/voices.md](docs/notes/voices.md) |
| why it lags or stutters, and what is measured NOT to be why | [docs/notes/performance.md](docs/notes/performance.md) |
| what changed and why | `git log` — the commit messages are the session log |

## Run it, check it

```bash
npm run dev      # then open it in FIREFOX (see below)
node tools/world-check.mjs    # 1320 checks: world, dragons, clans, sprites, tournament, consent, balance
node tools/pad-check.mjs      # 239 checks: controllers, keyboard sets, button prompts, the stuck-vJoy latch
npm run build                 # must stay clean; Vercel builds this on push to main
```

**Balance numbers are edited on a page, not in the code.** `npm run dev`, then
open **`/tuning.html`**: every ability's timings and damage with a sentence each
on what they do, a live timeline of the Cross Slash, and a save that writes
`src/tuning.json` and hot-reloads the running game.
[endgame.md](docs/notes/endgame.md) has the whole design; the short version is
that the file holds **overrides only**, the literals in the code stay the
defaults, and `tune()` ignores anything that is not a finite number on a key the
defaults already have. Neither the page nor the endpoint exists in a build.

**PLAY IT IN FIREFOX.** Chrome cannot read the Joy-Con sticks through vJoy — the
buttons work and the axes report `0.00000` forever. It is a Chrome bug, not
something the game can work around, and it only affects the Joy2Win/vJoy route.

**Run `world-check` after changing the world, dragons, clans, the tournament or
sprite directions.** It catches the breakages that still look fine on screen: a
grove that generates zero canes, a clan buff that does not actually change
anything, a sheet read in mirror image, a trade that quietly destroys an orb.

## The non-negotiables

Break any of these and the thing stops being the game it is. Each is enforced by
`world-check` where a check can express it.

1. **The maths is the point, not a bolt-on.** The Kotodama Orb draws its own
   working from *the same two numbers that position it*, and the Dojo of the
   Turning Circle is a walkable unit circle where you become the point. Neither
   may be reduced to decoration. A prettier orb that lied about its own position
   would be worse than no orb.
2. **The art is the kids'.** The cat-head title menu is one of theirs, redrawn
   faithfully; the six clan leaders came off a page of her character designs.
   Don't redesign either.
3. **No combat outside the ring.** The katana exists to knock scenery over.
   `Game.strikePlayers` is the only gate and it asks one question —
   `Tournament.fighting`, meaning *is a round live this frame*. Enemies in the
   world have been rejected repeatedly and on purpose.
4. **Nothing regrows and nothing is lost.** A prop knocked over stays knocked
   over, so the MISCHIEF counter is honest. A dragon can never be stranded, a
   pet can never be lost, and there is one rideable animal per player on the
   home island.
5. **Two players must keep the game they know.** Everything four-player is
   additive; where a rule generalises, the two-player answer has to come out
   bit-identical. The HUD, the camera and the split screen all have checks
   pinning this.
6. **A refusal must say so, and so must a confirmation.** A button that
   silently does nothing reads as broken. Every refusal toasts, every lock says
   what it wants *as an instruction*, and every dialog's buttons say what they
   DO — "no, keep playing" against "yes, start over", never bare yes/no.
7. **Nothing irreversible happens on one press, and the default answer is no.**
   A scene is skipped by **Escape or a pad's Start, and nothing else** — never
   Space, Enter or "any button": four kids hold sticks and mash, and Space is
   the key an elbow finds. Every irreversible button asks first
   ([systems/confirm.js](src/systems/confirm.js), and the trade screen's own
   per-side questions), and those dialogs deliberately have **no `.primary`**,
   so the cursor opens on cancel. Nothing may hang off a scene *finishing*:
   state changes happen when the scene is *accepted*.
   **One player drives a menu** — whoever opened it — and the screen says who.
8. **Sprite sheets are measured, not assumed.** Column counts, cell sizes,
   baselines and facing are all read off the image. A generated sheet's rows do
   not have to agree with each other. Never settle a facing by reasoning —
   measure it.
9. **Everything is procedural or generated.** No engine, no physics library,
   no asset store, no character meshes. `public/voice/*.mp3` are the only audio
   files, and they fall back to synthesised blips if absent.
   **`public/trailer/` is the only video, and it is opt-in.** It is generated
   art like everything else, but it is 20MB, so the `<video>` carries no `src`
   until a player asks for it and drops it again on close — `world-check`
   pins both. Delete the folder and the game must behave identically, minus a
   panel that says the file isn't there.

## Where the code is

```
src/
  main.js               game loop, split-screen rendering, boot, joining, debug keys
  core/      gfx  input  palette  split  cluster  spritesheet  label  audio
             device (what this machine may spend — tiers, atlas budget)
             touchpad (the on-screen stick and buttons; a device like any other)
             tuning (folds tuning.json over the shipped balance; degrades hard)
  tuning.json      the overrides, and nothing else. `{}` is the shipped balance.
  tuning-page.js   /tuning.html's brain — dev only, never built
  world/     build (all the geometry)  world (assembly, height queries)
  systems/   tournament  menagerie  arenaquest  announce  leaderboard
             kotodama  profile  cutscene  shrinescene  summonscene
             mathdojo  minimap  menunav  trailer (the opt-in video player)
             confirm (are you sure? - every irreversible button)
             crossfx (the Cross Slash's tell and its seal - a poller,
               so player.js does not know it exists)
  entities/  player  dragon  ryuuseki  panda  critter  angel  leader  satan
             griffin  orb  powerorb  dragonball  prop  shrine  stall
tools/       world-check.mjs  pad-check.mjs  png.mjs (dependency-free codec)
             kitten-cackle.mjs (the trailer's demon, and `--game` for the
               Cross Slash's four graded purrs — see docs/notes/voices.md,
               which carries the licensing decision attached to them)
             steam-art.mjs (the Steam shelf and the icons, from title_art.png)
             trailer-score.mjs  trailer-vo.mjs  trailer-cut.sh
             brush-kanji.mjs  voice-measure.mjs
             steam-capsules.sh (the trailer and the store art — docs/notes/trailer.md)
docs/notes/  the design notes — why things are the way they are
```

**Debug keys, in play:** `` ` `` opens the panel and lists them. `6` unlocks the
whole endgame, `7`/`8`/`9` are Ryuuseki, `4` ends a live round, `5` opens the
trade screen, `-`/`=`/`0` are the scene viewer, **`P` prints the frame cost** —
fps, stutter, draw calls, buffer size, quality, dev-or-built, and the GPU
string.

**If somebody says it lags, press `P` before changing anything.** The game is
fill-bound: frame time is a straight line in the size of the drawing buffer and
everything else is rounding. **Read the last line first** — a Windows Firefox
will happily render this on the CPU's integrated GPU with a discrete card idle
in the machine, which is what "it lags" turned out to mean, and the readout now
says `⚠ INTEGRATED GPU` when it does. Then read `js` vs `gap`: a small `js` and
a large `gap` is the GPU, not this codebase. The maths overlay, the drifting
petals and the tournament's critters have all been accused and all measured
innocent — see [performance.md](docs/notes/performance.md) for the numbers, so
the next session does not spend itself re-accusing them.

**"Lag" is two bugs.** Slow is a long median; stutter is a normal median with
frames arriving unevenly, and the fps counter reads healthy the whole time it is
happening — so believe a player who says the frame rate is fine and the game
still chugs. The `stutter` figure on the readout is what sees it. The one found
this way was the live labels re-uploading from GPU-backed canvases: same median,
four times the jitter, fixed by one flag in [label.js](src/core/label.js).

## House style

- **Comments explain WHY, and name the thing that was tried and failed.** This
  codebase's comments are its main defence against a fix being undone by
  somebody who could not see the reason. Match the density around you.
- **When you fix something, add the check that would have caught it.** That is
  why `world-check` is 1320 assertions and why almost none of them are about
  whether a number is set — they are about whether behaviour actually changed.
- **Measure, don't reason, about anything drawn.** Sizes, seat heights, mouth
  positions and facings are all read off the loaded atlas. Reasoned numbers have
  been wrong roughly every time.
- **Prefer a rule that degrades over one that vanishes.** A missing field on a
  mount must not NaN a position and make a character silently undrawn.
- **Git identity is pinned repo-locally to `InnerBushido`**, and pushes go
  through the `gh` CLI credential helper. `gh` may be signed in as a work
  account — check `gh auth status` before pushing.
