# What failed, and what was actually wrong

Five review passes on one ending, plus the help-clip recordings. Each entry
gives the symptom as the user reported it, what was first assumed, what was
measured, and the lesson. Read this before "fixing" a report.

## Camera and framing

**"The camera cuts off the players before they get on the bridge."**
The previous pass had kept the bearing but changed the pitch (aimed lower so a
torii gate stood on the subtitle box) and reversed the swing. The far road,
where the players spend the first 3 seconds, tipped off the top of the frame.
Fix: restore every angle of the liked shot and change only the distance. The
distance was chosen by replaying the run: 86% in frame became 100%.
*Lesson: a pitch change is not a zoom. Keep liked angles.*

**"Players running toward the camera like before, just zoomed out."**
A 20,000-candidate frame-only search returned a three-quarter view (29 of its 33
sight lines went through a cherry tree), then a camera pinned low with the
bridge at the top edge. Both passed all the metrics.
*Lesson: the brief fixes the shot; the numbers fit the framing inside it.*

**"Time is paused here; the bamboo blocks the view."**
Pass 3 concluded the lens was standing inside a grove, and moved it. The user
rejected that move and the canes still looked wrong. Pass 4 measured: 18 of 46
canes had stopped more than 30° off the floor. The fall wrote tilt onto an XYZ
euler whose middle (yaw) rotation cancelled part of the lean.
*Lesson: when a fix is rejected, the first cause was wrong. Measure the thing
the user pointed at (the canes), not the thing you suspect (the camera).*

**"Zooming in strangely on the islands."**
Every push-in shrank distance only, so each was a crane: closer and steeper.
*Lesson: scale height with distance for a dolly.*

**"Much of the action is in the top quarter of the screen."**
The camera aimed at the model's centre while the characters and diagrams rose
above it (median 0.37 NDC, top of the effect at 1.57). Fix: a negative aim
offset to look above the mark (median 0.08).
*Lesson: aim at the action's centroid.*

**A unit-based aim offset** was right at 40 units out and off the top of the
screen at 26. *Lesson: express aim as a fraction of the frame.*

**A clear-angle solver measured the middle of the shot**, then swung 0.7 rad
into a house. *Lesson: score the whole arc, and swing around the measured
bearing.*

**A 9° tie-break tax** outweighed a 5° spread between candidates, so it always
chose the default. *Lesson: measure the spread before choosing a threshold.*

**A shrine two-shot had the camera on the axis between speakers**: the listener
was a blob under the dialogue box, and the speaker talked to an empty frame.
Also, moving the logical position left the drawn sprite where it was, so the
new camera framed an empty patch.
*Lesson: stand people on marks, swing off-axis about 66°, and move what is
drawn.*

## Timing

**Everything was timed against placeholder durations.** In the headless
checker, beats were 9 s long; with audio they were 17.1 s. A 10.28 s shot was
paced as 5.4 s, so the characters finished with 2.5 s of empty bridge left.
*Lesson: read measured clip lengths. Play the shot in the check rather than
solving it on paper, because on paper the error runs in the flattering
direction.*

**"Don't start shaking until 'because something broke'."**
The voice run covered the whole sentence, so a cue could not land on its
middle. Fix: measure the pause with silence detection (0.10 s at 1.49 s), split
the run, and cue on the word.
*Lesson: cue to measured words.*

**A phrase lookup returns 0 when the phrase isn't found**, so the shot fires at
the top of the line with no error. *Lesson: a check asserts that every cue
resolves.*

**A cutscene-only shot "looked right" in the checker and was 1.5 s late in the
game**, because it was typed in seconds. *Lesson: use fractions of the real clip.*

## Staging and animation

**"They flicker during the shake."**
It wasn't the shake. The island's origin was the same point as the crowd
mesh's origin, so the transparent sort swapped them about 10 times a second while
rounding noise changed. The island ground wrote depth over the crowd.
*Lesson: two transparent objects at one depth. Use render-order bands.*

**The rider z-fought the dragon.** Same cause. Fix: push the mount back along
the sight line and draw it before the rider.

**"Abilities interrupt each other; the power dive isn't shown."**
Two free-running random timers per character, and a "dive" that was a hop
multiplied by 1.5. Fix: one state machine with real gravity; moves keyed to a
fraction of the path, at least 0.07 apart; a 0.22 s hang before the dive.
*Lesson: trigger on place or state; give fast events a visible hold.*

**The shockwave followed the character.** *Lesson: pin effects to the surface
that was struck.*

**"They are running through a tree."**
Neither option offered (move the start, run around the tree) was right. A tree
trunk had spawned in the road, because tree placement never consulted the road
mask.
*Lesson: fix the world rule, not the choreography.*

**"The bridge, road and gate look sloppy."**
They came from three sets of literals: the road was 9.5° off the deck and 1 m
off its centre, and the gate was 2 m off. Fix: derive all three from one
constant.
*Lesson: anything a shot relies on lining up should come from one source.*

**The hologram bridge didn't match the real one.** It was a hand-built diagram.
Fix: call the real builder and scale the result.
*Lesson: a model of the world should be built from the world's own builders.*

**Ten crash sounds landed in 0.1 s.** The stagger ranked over all 200 props,
and the ones on screen were all the nearest, so they took the first ranks.
*Lesson: rank among what is on screen, and check both the spread and the count
of distinct frames.*

**A speaker slid in and out of frame 11 times across 19 short shots**, which
read as flicker. *Lesson: at short shot lengths, keep the narrator for one shot.*

## Recording

**A backgrounded tab throttles `requestAnimationFrame`**: 17 frames instead of
60. *Lesson: take over the loop and step at a fixed dt; don't depend on focus.*

**`drawImage(webglCanvas)` returns stale or frozen pixels.** *Lesson: read the
back buffer (`gl.readPixels`), with a Y-flip.*

**A two-second frozen frame read as "the GIF broke".** *Lesson: keep the game
running at a lower fps for a pause.*

**Captions disappeared before a child could read them.** *Lesson: a caption
needs longer on screen than the action it describes.*

**A 4.5 MB clip**: halving the palette saved 7%. The flying camera was the cost.
*Lesson: pin the camera; split the shot.*

**The loop-sync tool stretched every frame** instead of holding the last one,
and nobody noticed except by eye. *Lesson: pad the last frame only, and check
delay-by-delay.*

**A shot pinned the rig camera for a single-player group**, but the game draws
the player's own camera in that case. *Lesson: pin every camera the renderer
could choose.*

**A CSS transition never advanced inside a synchronous capture loop**, and
wall-clock gesture detectors ran about 5× faster than the clip. *Lesson: disable
transitions for the take, and sleep in real time between beats.*

**A DOM overlay is invisible to `readPixels`.** *Lesson: redraw it onto the
frame from the live DOM's measurements; don't add a rasteriser dependency.*

**A finished take vanished before it was encoded.** Nothing had crashed. A
Help-page edit was saved between filming and encoding, the dev server
hot-reloaded the page, and the frames, the injected rig and the staged round
went with it.
*Lesson: never save a file the dev server watches while a take is in memory.
Encode first, then edit the page.*

**"The orb falls off" showed no orb.** The steal worked (the log said so), but
the thief was still holding sprint when the blow landed. She coasted onto the
orb it knocked loose, and the other kitten walked at it from the same side, so
three things finished in one place.
*Lesson: release movement keys on the frame of the hit. When two actors go for
one prop, send them to opposite sides of it.*

**A shot framed for kittens cut the head off a kitten riding a panda.**
Distance 19 made a 2.9-unit kitten 80px tall, which was right for a mark ring
at her feet. The rider sat 7.6 units up and was above the top edge on every
frame she rode.
*Lesson: frame for the tallest thing in the beat. When one clip holds a
kitten-scale beat and a mount-scale beat, change the distance at a caption
change (same angle, aim offset scaled with distance), not in the middle of an
action.*

**Critters crossed the action.** A hare as big as a kitten ran through the
foreground on the beat the orb fell. The ring's animals belong to a different
lesson.
*Lesson: turn off every ambient system the clip isn't about.*

**A best-of-N occlusion search picked a camera that was still blocked.** Four
candidate swings were scored against the scenery and the widest gap was taken,
which is a correct scorer — and at one location all four candidates were
blocked, so "best" was a pillar across the character's face. Scoring every
candidate at every location showed the margin was tiny everywhere (one was
clear by 0.002 rad, about two centimetres at nine units) and blocked by the
same piece of set dressing each time, because the actor's mark and the set
piece are both placed at fixed offsets from the same centre.
*Lesson: a best-of-N scorer cannot say "none of these". Score the WINNER
against an absolute threshold, and when it fails, refine continuously around it
— the smallest step that clears — rather than widening the discrete fan.
Widening was tried and did clear everybody, by moving five approved shots 100°
to fix one: the numbers improved and every picture got worse.*

**A check asked whether the camera MOVED, and was green through the whole life
of the bug.** It planted an obstacle in front of the lens and asserted the
chosen angle changed. It did change — from one blocked candidate to another.
The check also ran against the first location only, and the reported one was
the sixth.
*Lesson: assert what the shot is FOR ("no set piece is between the lens and
either character"), at every location, sampled across the whole move — not that
the search reacted. Print the worst margin so it is visible when it drifts.*

**`THREE.Matrix4.decompose()` reports a scale of ONE for an all-zero matrix.**
It guards the division by a degenerate determinant by falling back to an
identity rotation and a unit scale. An InstancedMesh can only hide one instance
by composing it with a zero scale, so a test that asked `decompose` which of two
meshes was drawing an instance passed a doubled crowd and failed a correct one.
*Lesson: read the matrix's own column length (`hypot(e[0], e[1], e[2])`) to ask
whether an instance is drawn. Three multiplications, and it cannot lie.*

**A shot of a landmark on a rock passed every check and showed only the rock.**
The opening of a ride's shot list aimed at a floating arena from 140 units
below it. The occlusion test skipped the landmark's own island, because that
island is the ground under the target and would otherwise block every shot. So
the lens looked straight up into the keel, and the frame was a brown wall. Both
subjects were in frame, and nothing was counted in the way.
*Lesson: an exemption in an occlusion test is a blind spot. Add a check for the
thing the exemption hides, e.g. "this landmark is only looked at from above its
own floor", or aim that stretch at something else. Screenshot the first frame
of every shot as well as its middle.*

**Two consecutive shots that ended four units apart on the same side of the
subject read as a jump cut, not a cut.** Neither shot was wrong alone.
*Lesson: when two shots share a side and nearly share a position, one should
MOVE into the other (from its last frame, fov included), and a check should pin
that the join is continuous.*

**The "seen from above its floor" check passed a shot of the back of the
stands.** The fix for the keel above was a check that the lens is above the
landmark's floor. A later shot aimed at the same arena from lower on the road,
with a lens just above the floor, and the check passed. But the island's rim
and the grandstand stood between the lens and the ring, so none of the ring
was visible.
*Lesson: a proxy for "can see it" gets gamed by the next shot. Measure the thing
itself: count points on the subject's surface that the lens can actually see,
with every occluder included (the landmark's own rock too, now that the target
points are on its surface), and set the bar off the worst good frame.*

**Blending two shots' look points lost the subject mid-move.** Each shot's aim
was stored as a point a fixed 20 units down its ray. For a far lens that point
is in front of the subject; for a near lens it is past her. Blending the two
aimed the middle of the move off to one side, and she left the frame for nine
frames.
*Lesson: blend the aim as a point the subject defines, such as where each ray
passes closest to her. Then every blend of the two is near her too.*

**"Take the shorter way round" flipped sides in the middle of a half-turn.**
Two shots on opposite sides of a moving subject are nearly 180 degrees apart.
Which way is shorter changes as she moves, and at the frame where it flipped,
the lens jumped 10 units and turned 28 degrees.
*Lesson: decide the direction of an orbit once, where the move starts, and hold
it for the whole move.*
