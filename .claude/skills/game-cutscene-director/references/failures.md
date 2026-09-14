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
