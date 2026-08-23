# Design notes

**The WHY behind code that already exists.** Every file here was written while
the thing it describes was being built or fixed: what was tried, what broke, and
which of the obvious answers is wrong. Nothing here is a plan and nothing here is
a spec — the code is the spec, and `tools/world-check.mjs` is what enforces it.

**Read one when you are about to change that area, and not before.** These were
one 4,400-line `HANDOFF.md` that every session was told to read first, which
spent about 65,000 tokens before any work started. Split up, a session reads the
one file it needs — usually five to ten thousand.

| file | what is in it | read it before you touch |
| --- | --- | --- |
| [four-players.md](four-players.md) | seating, the split screen, per-group panes, pane stability and pane colour, the leagues, the clan call-to-action and the celebration that answers it, and what two four-player sessions turned up | anything that counts players, or assumes there are two |
| [input.md](input.md) | controllers, the vJoy/Joy-Con route, the Chrome stick bug, the keyboard sets, menus on a pad | `core/input.js`, `systems/menunav.js` |
| [tournament.md](tournament.md) | the ring, rounds, attacks, ring-outs, the record board, the arena's four locks, and the animals and the feast | `systems/tournament.js`, `systems/menagerie.js`, `entities/critter.js` |
| [dragon-hunt.md](dragon-hunt.md) | the seven stars and their locks, the grottos, the spire, Ryuuseki and his two seats | `entities/dragonball.js`, `entities/ryuuseki.js` |
| [endgame.md](endgame.md) | the 100% ending, the Awakening, the eight Powerup Kotodama, the economy, the trade screen, the Cross Slash rebalance and the tell that warns you it is coming, **and the balance page** | `systems/kotodama.js`, `systems/profile.js`, `entities/powerorb.js`, `tuning.html`, `src/core/tuning.js` |
| [story.md](story.md) | the opening cutscene, the six leaders, the shrine scenes, the scene viewer | `systems/cutscene.js`, `systems/shrinescene.js`, `entities/leader.js` |
| [world.md](world.md) | the six clans and what each buff changes; raising and riding the panda | `world/build.js`, `entities/panda.js`, `entities/shrine.js` |
| [art.md](art.md) | why the dragons looked low-res, how atlas cells are sized, and the two rules for generating new sprites | `core/spritesheet.js` |
| [mobile.md](mobile.md) | what a phone may spend, why the art budget moves `maxAtlas` and never `cell`, the on-screen pad, the desktop test mode, and why the minimap could not be fixed in CSS | `core/device.js`, `core/touchpad.js`, any `maxAtlas` argument, `_drawMaps`, the `body.touch-ui` rules |
| [performance.md](performance.md) | why the frame time is a straight line in pixels, what is measured NOT to be a cause, the `P` readout, and why `low` renders below the panel | the quality tiers, anything accused of costing frames, `_applyQuality` |
| [audio.md](audio.md) | the synthesised sound set, and a piece of music per island | `core/audio.js` |
| [voices.md](voices.md) | **the voice-acting registry** — which ElevenLabs preset is which character, with the ids; how the castings were verified by measurement; why Ryuuseki's is lost and what five auditions found; and why there is no style prompt | **anything that generates a spoken line**, `public/voice/*`, `tools/trailer-vo.mjs` |
| [consent.md](consent.md) | why nothing irreversible happens on one press: the confirm dialog and why it has no primary, the trade screen's per-side questions, the two-stage name entry, who drives a menu, and the vJoy button that started the game by itself | `systems/confirm.js`, `systems/profile.js`, `systems/menunav.js`, the pause menu, `SKIP_KEYS` |
| [rules.md](rules.md) | the gameplay invariants in full, with the measurements behind them — bamboo, ground snapping, dragon perches, sprite facing | anything that touches movement, props, dragons or a sprite sheet |
| [gotchas.md](gotchas.md) | the traps that cost real time and are not obvious from the code | anything, when something inexplicable is happening |
| [hosting.md](hosting.md) | Vercel, the Git deploy, and what does and does not travel with it | deploys, `.vercelignore` |
| [steam.md](steam.md) | the non-Steam shortcut and every launch flag on it, the shelf artwork and the icon, what Remote Play is and is not | `tools/steam-art.mjs`, the launch options, anything about Steam |
| [trailer.md](trailer.md) | the 1:08 trailer: how the narrator was cast by measurement, why its orchestra is synthesised over the game's own music, why the 十 is drawn rather than typed, why the in-game player downloads nothing until asked, and why the generated art may go on the store page but not on the shelf | `src/systems/trailer.js`, `tools/trailer-vo.mjs`, `tools/trailer-score.mjs`, `tools/trailer-cut.sh`, `tools/brush-kanji.mjs`, `tools/steam-capsules.sh` |

**Cross-references saying "above" or "below" may point at a sibling file.** These
were one document; the prose was moved verbatim rather than rewritten, because
rewriting 4,400 lines of hard-won reasoning to fix the word "below" is how you
lose a paragraph that mattered.
