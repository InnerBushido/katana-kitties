# Katana Kitties — where this was learned, and what to do next there

Repo: `katana-kitties` (three.js, Vite). The ending is directed as data.

## Where things are

| thing | file |
| --- | --- |
| scripts, voice runs, `FINALE_SHOTS`, camera solve, `say()`, `_nextCut` | `src/systems/summonscene.js` |
| everything the ending draws (hologram, actors, bridge run, cues) | `src/systems/finaleshow.js` |
| the world standing back up and falling | `src/systems/finaletide.js` |
| design history of every pass (read "How a shot is directed now") | `docs/notes/story.md` |
| capture rig and director's guide for Help clips | `tools/capture/README.md`, `docs/notes/help.md` |
| voice registry (read before any line) | `docs/notes/voices.md` |
| checks (framing replays, cue resolution, restore-on-skip) | `tools/world-check.mjs` |

## Browser harness (dev server, then in the page)

```js
const g = window.game;
if (!g.playing) { g._trailerOfferDue = () => false; g.startPlay(); g.cutscene?.skip?.(); await new Promise(r => setTimeout(r, 1500)); }
g._unlockEndgame(); g._finaleDue = false; const S = g.summonScene;
window.__f = (t) => { delete S.update; try { S.finish(); } catch (e) {}
  S.played.finale = false; S.start('finale', g.world.bridge, 30, g.leaderArt.elder, g._finaleCast());
  for (const b of S.script) if (b.clip) b.dur = b.clip + 1.5;
  for (let i = 0; i < Math.round(t * 60); i++) { S.voiceEl = null; S.update(1 / 60); if (!S.script) return { died: i / 60 }; }
  const o = { cue: S._shot?.cue, phase: S.show?.phase }; S.update = () => true; return o; };
```

Wait about 1 s before a screenshot. Source edits hot-reload and wipe `__f`.

**Help clips** are filmed with the rig in `tools/capture/` (its README is the
guide). The arena clips share one stage: eval `harness.js`, `movekit.js`,
`shots/fight.js` (which exports `window.__mvKit`), then the shot file. Seat a
second kitten with `g.input.forceSeats = true; g._joinPlayer({ shadow: true })`.
Set the Browser viewport to 16:9 (1024×576) first, or the frames are squashed.
Encode (`__encodeMv`) **before** saving `index.html` or anything in `src/`,
because the reload loses the take. `shots/clan.js` logs each kitten's feet and
head as frame pixels, so framing can be checked from numbers before looking.

## House rules that shape directing here

- Ending dialogue and text are locked; runs and timings may change.
- Skip is Escape/Start only, and state changes on acceptance.
- New sprites mean all four kittens, with transparent backgrounds. Preflight
  generation cost.
- Every fix adds a check; comments explain why and name what failed.
- Don't push to `origin/main` until Richard says "push".

## Suggestions for the next passes

1. **Done (sixth pass): a dedicated scared pose.** `ember_scared.png` and
   `frost_scared.png` were generated with transparent backgrounds, and Storm
   and Blossom are recoloured from them by style. The townspeople wear them in
   the quake, falling back to the bless sheet if they're missing. They're sized
   by `SCARED_STRETCH`, measured against the bless drawing using the rope belt
   as a yardstick, because the fur stands up past the ear tips. Reuse them for
   any future fright.
2. **Lift the recorder into a tool.** Put the "record positions → solve rows →
   NDC report" loop used for the bridge in `tools/capture/shot-solve.mjs`, so a
   camera note becomes one command that prints in-frame %, subtitle clearance
   and occluder hits per row.
3. **A shot-list viewer.** A debug overlay in the scene viewer that shows the
   current row, its cue word, `se`, and the subtitle band line, so a watch-through
   note can name a row rather than a timestamp.
4. **Film the ending as a GIF/trailer clip** with the capture rig, on pinned
   rows only (the flying rows cost about 4× per frame), and use the result as the
   reference for later camera notes.
5. **Every cutscene gets a purpose check.** The opening cutscene and shrine
   scenes predate the replay checks; add "subject in frame %" and "subtitle
   clearance" for each.
