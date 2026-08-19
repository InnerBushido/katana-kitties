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
| what changed and why | `git log` — the commit messages are the session log |

## Run it, check it

```bash
npm run dev      # then open it in FIREFOX (see below)
node tools/world-check.mjs    # 922 checks: world, dragons, clans, sprites, tournament
node tools/pad-check.mjs      # 194 checks: controllers and the keyboard sets
npm run build                 # must stay clean; Vercel builds this on push to main
```

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
6. **A refusal must say so.** A button that silently does nothing reads as
   broken. Every refusal toasts, and every lock says what it wants *as an
   instruction*, not as a noun.
7. **A scene is skipped by Start / Space / Enter only**, never "any button" —
   the kids hold sticks and mash. Nothing may hang off a scene *finishing*:
   state changes happen when the scene is *accepted*.
8. **Sprite sheets are measured, not assumed.** Column counts, cell sizes,
   baselines and facing are all read off the image. A generated sheet's rows do
   not have to agree with each other. Never settle a facing by reasoning —
   measure it.
9. **Everything is procedural or generated.** No engine, no physics library, no
   asset store, no character meshes. `public/voice/*.mp3` are the only audio
   files, and they fall back to synthesised blips if absent.

## Where the code is

```
src/
  main.js               game loop, split-screen rendering, boot, joining, debug keys
  core/      gfx  input  palette  split  cluster  spritesheet  label  audio
             device (what this machine may spend — tiers, atlas budget)
             touchpad (the on-screen stick and buttons; a device like any other)
  world/     build (all the geometry)  world (assembly, height queries)
  systems/   tournament  menagerie  arenaquest  announce  leaderboard
             kotodama  profile  cutscene  shrinescene  summonscene
             mathdojo  minimap  menunav
  entities/  player  dragon  ryuuseki  panda  critter  angel  leader  satan
             griffin  orb  powerorb  dragonball  prop  shrine  stall
tools/       world-check.mjs  pad-check.mjs  png.mjs (dependency-free decoder)
docs/notes/  the design notes — why things are the way they are
```

**Debug keys, in play:** `` ` `` opens the panel and lists them. `6` unlocks the
whole endgame, `7`/`8`/`9` are Ryuuseki, `4` ends a live round, `5` opens the
trade screen, `-`/`=`/`0` are the scene viewer.

## House style

- **Comments explain WHY, and name the thing that was tried and failed.** This
  codebase's comments are its main defence against a fix being undone by
  somebody who could not see the reason. Match the density around you.
- **When you fix something, add the check that would have caught it.** That is
  why `world-check` is 922 assertions and why almost none of them are about
  whether a number is set — they are about whether behaviour actually changed.
- **Measure, don't reason, about anything drawn.** Sizes, seat heights, mouth
  positions and facings are all read off the loaded atlas. Reasoned numbers have
  been wrong roughly every time.
- **Prefer a rule that degrades over one that vanishes.** A missing field on a
  mount must not NaN a position and make a character silently undrawn.
- **Git identity is pinned repo-locally to `InnerBushido`**, and pushes go
  through the `gh` CLI credential helper. `gh` may be signed in as a work
  account — check `gh auth status` before pushing.
