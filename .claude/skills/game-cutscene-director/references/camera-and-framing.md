# Camera and framing — measuring a shot

## Contents
1. A shot row, and how it is solved
2. Record once, search many
3. The scorer
4. Occlusion
5. Zoom vs pitch vs crane vs dolly
6. Transitions
7. The checks that pin a shot
8. Browser/engine harness patterns

---

## 1. A shot row, and how it is solved

A data-driven row that has survived five review passes:

| field | meaning |
| --- | --- |
| `beat` | which line of dialogue it belongs to |
| `from` | where in the line it starts, as a **fraction of the spoken clip**, found by phrase (`say(beat, 'the arena')`), plus an optional `off` in seconds |
| `at` | a **named mark** resolved from the world at scene start (`bridge`, `town`, `dojo`), never a coordinate |
| `a` | bearing around the mark (radians) |
| `dist`, `high` | camera distance and height from the mark |
| `lift` | aim offset as a **fraction of the frame height** at that distance (positive = look below the mark, so the subject rises above the subtitles) |
| `turn` | how far the bearing swings across the shot |
| `in` | fractional push-in across the shot (negative = pull out) |
| `lin` | linear instead of ease-out |
| `dolly` | scale height with distance (a real dolly; without it a push is a crane) |
| `pan` | a sideways truck, as a fraction of the frame |
| `keep` | fires its cue and does **not** cut |
| `cue` | an event the scene's actors react to |
| `fade` | real fade-to-black cut (location change only) |
| `into` + `lead` | from `lead` s before the word `into`, ease onto the next cutting row's first frame |

Solve per frame:

```
sk    = clamp((now - start) / length)
se    = lin ? sk : 1 - (1 - sk)^2
a     = base + shot.a + turn * se            (measured bearings: turn * (se - 0.5))
close = 1 - in * se
dist  = shot.dist * close
high  = shot.high * (dolly ? close : 1)
cam   = mark + (sin a * dist, high, cos a * dist)
frameH = 2 * |cam - mark| * tan(fov / 2)
look  = mark - (0, lift * frameH, 0)
```

## 2. Record once, search many

1. Play the real scene in the real runtime (browser, editor play mode) with real
   audio lengths.
2. Every 1/10 s, save world positions: each character's feet and head, landmark
   corners (gate posts, beam ends), effect bounds, and the drawn corners of any
   model.
3. Offline (Node, Python, or an editor script), solve thousands of candidate
   rows against that recording through the same projection, using the same FOV
   and aspect ratio as the worst-case window.

Replaying the scene per candidate is 1000× slower, and it tempts you into
"try a number, look, try another", which is how angles drift away from the
brief.

**Durations trap.** If the runtime grows each beat to its audio length, a
headless check that has no audio sees placeholder durations: 9 s against a real
17.1 s. A full tuning pass was paced on the wrong clock. Read the measured clip
length in checks, and restore anything you mutate in shared tables.

## 3. The scorer

Score in NDC (−1..1) through the scene's projection. Useful terms:

- **inside**: `z < 1 && |x| < 0.98 && -0.98 < y < 0.98` for both feet and head.
- **clear of the subtitle band**: head `y > SUBS`. The subtitle box is a fixed
  pixel height, so its top edge moves with the window: about −0.22 NDC at
  800×475, about −0.7 full-size. Use the smallest window you support.
- **action median** near 0 (both axes); report percentiles, not the max.
- **landmark wholly in frame** (all corners), when the brief names it.
- **coverage**: the fraction of frame width a model occupies (40% read as "too
  zoomed out"; 56–70% was right).

**The brief constrains; the scorer fills in.** Fix the bearing and elevation
from the brief or reference, and let the search pick only distance, or distance
plus a small aim offset. A free search over all parameters found shots that
passed every term and were not the shot: a three-quarter view through a tree,
and a lens a metre off the ground with the bridge at the top edge.

**Taxes must be smaller than the real spread.** A tie-break penalty of 0.16 rad
pinned every candidate to the default, because the spread between candidates
was only 5°. Measure the spread, then set the threshold below it.

**"Enough is enough."** Cap clearance-style terms (e.g. 3 units of daylight). If
you don't, "most clearance wins" drives every search to the edge of its
allowed arc.

## 4. Occlusion

- Test sight lines camera→subject against **segments**, as distance from each
  obstacle's centre to the segment, minus the obstacle's radius.
- Treat **dense clusters (groves, crowds) as discs**, charged by the chord the
  line cuts. Forty individual canes are forty near-misses while the line runs
  through the whole thicket.
- **A subject is not its own obstacle.** Ignore anything within `self` of the
  mark (a bridge's own railing posts).
- **Obstacles behind the subject are scenery**, and knocked-down props lying
  flat are not occluders.
- **Score the whole swing**: take the worst of start, middle and end.
- Check sight lines to tree **crowns**, not just trunks, and check animals or
  NPCs parked at home positions.
- **A lens inside a half-fallen grove reads as "time frozen"** to a viewer.

## 5. Zoom vs pitch vs crane vs dolly

| move | what changes | effect |
| --- | --- | --- |
| **zoom (by distance)** | `dist` and `high` together, same ratio, same `lift` fraction | the same picture, bigger or smaller. **Use this when an angle is liked.** |
| FOV zoom | fov | same as above, plus perspective flattening; fine for inspection screenshots |
| **pitch change** | where the camera looks | slides the whole scene up or down the frame. Aiming lower to put a gate on the subtitle box tipped the far road — where the players were — out of the top. |
| crane | `dist` shrinks, `high` stays | closer *and* steeper; reads as "zooming in strangely" |
| dolly | `dist` and `high` shrink together | a true push-in at a constant angle |
| truck/pan | sideways offset | keep the speed constant when lengthening a shot: scale the distance by new/old length |

Elevation angle = `atan(high / dist)`. Record it when the user likes a shot.

## 6. Transitions

- **Push-into-next (`into`)**: when the next shot looks at the same mark, ease
  every framing number onto that shot's `se = 0` values over `lead` seconds with
  smoothstep. Check that the frames either side of the join are about 0.00 apart
  in camera position and look point.
- **Dissolve by moving**: consecutive rows on nearby marks just blend.
- **Fade cut**: only for location changes. Centre a short fade (about 0.34 s) on
  the cut, and never inside a word the audience has to catch.
- **Lengthening a hold** (e.g. "delay the transition 2 s"): scale the moving
  parameters by new/old length so the speed stays the same. Start the next shot
  further along its own path so its **last** frame is unchanged.

## 7. The checks that pin a shot

Write checks that assert **purpose**, not configuration:

- the subjects are in frame for ≥ X% of recorded sightings across the shot;
- heads clear the subtitle band at the worst-case size ≥ Y%;
- the named landmark is wholly in frame and its key edge is above the band;
- no sight line crosses an occluder's crown;
- every word cue resolves to its real word (none silently fell back to 0);
- the frames either side of a push-into-next join match;
- a lengthened hold keeps its speed;
- skipping at several times restores everything.

The test "a prop moved" (`|x|+|z| > 0.3`) passed while props hung half-fallen.
Test the actual property instead: tilt read off the quaternion.

## 8. Harness patterns

- Before starting the scene, finish the previous run (`finish()`), then
  `start()`. Set real durations and restore them after.
- Step the update at a fixed dt to the moment you want, then stub `update` so the
  frame holds for the screenshot.
- Wait about 1 s before screenshotting: screenshots can show the previous seek.
- Hot reload wipes injected globals, so re-inject after any source edit.
- Return lean JSON from injected code; dumping engine objects floods the
  output.
- For inspection, override FOV and `lookAt` to zoom on a detail, then restore.
- In Unity the same shape applies: an editor script records transforms per tick
  in Play Mode; a static solver scores candidate `Camera` poses with
  `WorldToViewportPoint`; Cinemachine rows become data assets; checks run as
  PlayMode tests.
