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
| the arena exit parade (plan, three solved lenses, his two lines) | `src/systems/arenaexit.js` |
| the arena road's ride cameras (`ARENA_RIDE`, `shotPose`) | `src/systems/snakecam.js`, `docs/notes/world.md` |

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

**Any scene, stepped by hand.** Stop the loop and step at a fixed dt, then
take screenshots through an `<img>`. The browser pane's screenshot of a canvas
drawn by hand lags a render, so:

```js
const g = window.game;
g._enterPlay(); g.clock.getDelta = () => 1/30; g.renderer.setAnimationLoop(null);
// ...set the scene up, then step it: while (X.active && X.t < t) g._tick();
g._tick(); g._tick();                                   // render twice
const img = Object.assign(document.createElement('img'), { id: '__snapimg' });
Object.assign(img.style, { position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex: 99999, objectFit: 'contain' });
document.body.appendChild(img); img.src = g.renderer.domElement.toDataURL('image/jpeg', .85);
await img.decode(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
// screenshot in a SEPARATE tool call, then remove #__snapimg
```

- **The arena exit parade:** open the arena (`g.world.openArena(true)`), seat
  kittens, put them on the carpet, call `g.enterArena()`, hide
  `#panel-league` and `#panel-teams`, set `g.tournament.winners`, then call
  `g.tournament.goHome()`. `g.arenaExit` is the scene; its `plan_` has the
  shots and `lineAt`.
- **A lens of your own:** clone `g.arenaExit.camera` and set its position and
  `lookAt`. Call `g._faceAll(cam)` and `g._aimXray(cam, [0, 1, 2])`, then
  `renderer.render(g.scene, cam)` twice. That is how to prove an x-ray cut
  from a low angle that the follow camera never takes.
- **`_enterPlay()` must be CALLED, even when `g.players` already exists.**
  Wait until `g.state === 'play'`. Skipping it because players are seated
  rendered the title's fly-over instead of the game. Seat a second kitten
  with `g._seatPlayer(1)`.
- **`g._renderView(cam, x, y, w, h)` takes CSS pixels** (`canvas.clientWidth`,
  `clientHeight`), not the drawing buffer's size. Device pixels gave a render
  zoomed into its own corner, and it looked like a camera bug.
- **The big screen outside the arena:** `g.world.openArena(true)`, then put a
  kitten in front of `g.world.arenaBoard` (the glass faces -x, so stand her at
  `x = face - 15`). `g.arenaBoard.refresh()` repaints. For champion slides, set
  `g.arenaBoard.slides = buildSlides(fakeBoards, Date.now())` and call
  `_show(i)`. Never sign the real record board: it is Richard's localStorage.
- **A ride-camera pose without riding:** take the road from
  `g.world.snakeWay.roads.find(r => r.arena)`. `arenaRidePose(road, s, K, spread, fov, dir)`
  from `systems/snakecam.js` is the shipped pose (K is `road.frameAt(s)`), so a check or a screenshot can stand at any
  `u` of the climb.
- **The Snake Way's pieces are hidden until the road is conjured.** In a fresh
  harness the torii and lions sit under a hidden group scaled to 0.001. Show
  every parent (visible, scale 1) and set `material.reveal = 1` before
  photographing them.

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
- New sprites mean all four kittens. Storm and Blossom may be recoloured from
  Ember's and Frost's new art. Generate on flat magenta `#FF00FF`, never white.
  Bake with `node tools/sprite-bake.mjs --proof` (master in
  `docs/art-masters/`, `{ chroma: true }` in its `WORK`). Preflight
  generation cost with `get_cost`.
- Voices: Higgsfield `text2speech_v2`, ElevenLabs preset, one pinned voice per
  character (docs/notes/voices.md). The card and the recording are ONE string,
  stage directions included (see collaboration.md).
- A scene's lens passes `scene = true` to `_renderView`, which closes every
  x-ray cut. A scene that has its own voice hushes the announcer for its
  length and restores the hush state it found.
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
