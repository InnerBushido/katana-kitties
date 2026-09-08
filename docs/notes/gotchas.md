# Gotchas that cost real time

*Design notes, moved verbatim out of the old 4,400-line `HANDOFF.md`. This is
the WHY behind code that already exists — read it when you are about to change
something in this area, not before. Current state and open work live in
[HANDOFF.md](../../HANDOFF.md); the always-on summary is [CLAUDE.md](../../CLAUDE.md).*

*Cross-references saying "above" or "below" may now point at a sibling file in
this folder — see [the index](README.md).*

---

## UI FALL-THROUGH — the bug this project keeps re-inventing

**Read this before designing any menu, dialog or list.** It has now been found
five separate times, in five places that look nothing like each other, and
every one of them was reported as something else — "the dealer opens when I
press back", "the profile picks an orb on the way in", "the trailer restarts
itself", "it asks about the next player too". It is one bug.

> **A press is an EVENT. A key being down is a STATE. Every screen that acts on
> a press must ask for the event, and something has to have made sure the event
> is only answered once.**

There are three distinct ways that goes wrong, and knowing which one you are
looking at is most of the fix.

### 1. The press is read twice in one frame

The frame is read top to bottom by several owners in turn — the trailer, then
`MenuNav`, then the game — and `pressed` is a *pure test*, so a press one of
them acts on is still sitting there for the next. B backs out of the pause menu,
`_back` unpauses, and execution falls straight through to the stall branch in
the same frame, which reads the same interact edge and opens the dealer.

**The fix is `PadState.consume`, and the rule is: whoever ACTS on a press owes
the call.** `MenuNav._read` returns a `spend()` that pays for exactly the pads
and actions the decision was read from — not `Input.consume`, which would spend
the edge across all four slots and eat the sister's press while she is standing
at the stall with her own interact.

Spend it BEFORE acting, not after. `_activate` clicks a real button and the
handler runs synchronously; it can unpause the game, open a trade window or
start a scene, any of which can read a pad before you get control back.

### 2. The edge is manufactured by a device changing hands

`pressed` is `held && !prev`, and `prev` is last frame's `held`. A slot with no
device reports every action **false** — so the frame a slot is handed a keyboard
set, every key already down reads as a brand-new press. It is not a press. It is
the edge between "I could not see this key" and "I can".

This is the one that produced *"say YES to FROST LEAVES THE GAME? and it
immediately asks whether STORM should leave too"*: answering with the space bar
re-deals the keyboard over the smaller party, a slot gains the set her thumb is
already on, and the pause menu takes the manufactured edge as a second confirm.

**Fixed once, in `Input.update`**, by seeding `prev` from this frame's reading
whenever a slot's device *or its right to drive one* changes. `down()` goes on
telling the truth — the button really is held — and the next genuine press edges
normally. `pad-check` holds both halves, and the share ring (`swapKeyset`, the
R and U keys) is checked separately because there the BINDING does not change,
only `source` does.

### 3. The thing under the cursor is not the thing that was under the cursor

The subtlest of the three and the only one that needs no input bug at all. A
remembered cursor index is a **row number**, and a row number means nothing once
the list has rebuilt. Two lists in this game rebuild under a live cursor — the
DROP OUT rows (one per extra player, rebuilt the instant one leaves) and the
remap grid (one per connected controller) — so index 2 stops meaning "FROST —
DROP OUT" and starts meaning "STORM — DROP OUT" while the highlight sits on it.

**`MenuNav` remembers the ELEMENT, not the index** (`focusEl`, `_reseat`). If it
moved, follow it — a row vanishing above her must not move the highlight off the
row she is on. If it is *gone*, land on the panel's `.back`, never on its
neighbour: the seventh non-negotiable's default answer is no, and the honest
answer to "the thing you were pointing at no longer exists" is not "here is what
took its place, press again".

### Designing a new screen? Ask these four

1. **Does anything here act on a press?** Then it consumes that press, and it
   consumes it before it acts.
2. **Can this list change while somebody is pointing at it?** Then the cursor
   follows the element, and lands on the way out when the element goes.
3. **Can a device arrive, leave, or change hands while this is up?** Joining,
   leaving, unplugging, and the force-spawn share all do.
4. **Is the row that slides into place under the cursor irreversible?** If the
   answer is yes for ANY reachable arrangement, the screen is a trap even with
   every edge handled correctly.

## Gotchas that cost real time — don't rediscover these

**`requestAnimationFrame` never fires in a hidden or background tab**, so an
rAF-only wait hangs boot forever on the loading screen — the game simply never
starts if it isn't visible. `frame()` races rAF against a 60ms timeout.

**A road laid on the terrain has to clear the TESSELLATION, not just
z-fighting.** The island mesh is a polar grid ~4 units across, so between
vertices its flat triangles are a chord of the real surface — in a dip that
chord sits *above* the analytic height a road samples, and the street gets
swallowed by the ground it was laid on. A flat 0.32 lift cleared it everywhere
but left the road visibly hovering with the kitties wading through it. The fix
is per-vertex: take the highest of a small ring of ground samples (`surface()`
in `buildRoad`), which lifts the road only where the terrain actually bulges
and leaves it flush on the flat.

**Anything scattered on the ground needs a road mask.** Grass tufts and flowers
sprouting through packed sand is the sort of detail that quietly makes a town
look unfinished — `world.roadMask` holds the corridors, and both the ground
detail and the tree planting skip them.

**The bridge deck is an ARCH.** `buildBridge` lifts each segment by
`sin(t*PI)*rise`, so a single flat platform at its base height means walking
straight through the hump. It's ten stepped platforms following the same curve,
which also makes it stairs you can run up and jump off.

**A ridden dragon's heading is locked BROADSIDE.** It's a long side-on
drawing, so it only has two honest poses: facing screen-left and screen-right.
Steering the drawn heading with the full movement vector meant flying "into"
the screen put it edge-on, right on the billboard's mirror threshold, and the
whole creature snapped back and forth — pressing UP flipped the dragon. The
heading now comes from the sign of the sideways velocity with a dead zone
(`flySide` in `_updateFlight`), and only swaps on decisive left/right. Movement
is unaffected; that comes from the camera basis. The breath rides the same
heading, which is why it fires sideways rather than in eight directions.

**The rider bobs with the NEGATIVE of `sin(flap)`.** The wingbeat is faked by
squashing the sprite — `scale.y = 1 - sin(flap)*f` — so the dragon's back drops
exactly when `sin(flap)` is positive. Following it directly lifts the rider as
the dragon dips and the two read as separate drawings sliding past each other.

**A rider sits on the DRAWN body, not the quad.** The flight art is a long
horizontal creature fitted into a square cell, so it fills barely half the
cell's height. Seat and mouth offsets scaled to the quad put the kitten a full
body-length above the dragon's back. `seatOffset()` / `mouthOffset()` are
measured against the drawn body instead. They're world-space offsets along
`facing`, which is correct from every angle because the billboard mirrors
itself so the drawn head always points the way the dragon is facing.

**Check the winding on any flat quad you build by hand.** The road's triangles
were wound face-down, so it was lit from below and rendered as a dark olive
strip instead of pale sand — it looked like a colour bug, not a geometry bug.
Same class of mistake as the pagoda roofs.

**Billboards must use WORLD position.** `Billboard.faceCamera` computes the
camera angle from the sprite's position. A Billboard is parented to its entity's
group, so `this.position` is a *local* offset — almost always `(0,0,0)` — which
measures the angle from the world origin. Sprites visibly swing around as the
player walks away from the map centre. Uses `getWorldPosition` now.

**Pagoda roof winding.** The roof geometry was wound inside-out, so it was
backface-culled from above and every "rooftop" in the game was the plaster wall
top showing through. Symptom looked exactly like z-fighting. Diagnosed by
turning shadows off — the "roof" turned cream, which no lighting change should
do to a dark indigo surface. If a surface looks wrong from one side, check
winding before chasing depth.

**Coplanar faces.** Stacked box parts that end at the same height z-fight. The
house wall top, corner posts and sill beam all ended at `y + floorH`. Give each
stacked piece a different top height; overlap volumes rather than touching them.

**Roof clearance is set by where the surface passes over the wall, not by its
base.** The base ring is out at `hw*(1+overhang)` and the surface climbs as
`y = h * t^1.75`, so above the wall edge (t = 1/3) it's only ~0.30 above its
base. "Sinking the roof 0.28 into the walls" left 0.02 of clearance.

**Image models won't honour exact grid counts.** Asking for "exactly 8 columns"
returned 10, twice, explicitly. `loadSpriteAtlas` *measures* the column count
and the game maps however many cells it gets evenly around the circle. Don't
re-add a hardcoded count.

**Sprite sheet cell detection:**
- Background removal must **flood inward from the borders**, not threshold on
  white — the cats have cream chests and white paws.
- Cells are found by **connected-component labelling**, rows before columns.
  Column projection fails (a swept tail overlaps its neighbour's columns).
- The column grid is derived from **the rows that agree**, then every row is
  sliced by those boundaries. In the attack row the drawn katanas cross, so two
  figures touch and label as one blob — that corrupted `widest` and shrank the
  entire sheet by ~2× (this is why Frost was half Ember's size).
- **World size is normalised against `contentScale`**, so apparent character
  size can never again track how loosely a sheet packed.
- Billboard quads must be **square** (cells are square), with a **half-texel UV
  inset** plus transparent cell padding to stop atlas bleeding.

**Full-turn sheets are not mirrored.** Mirroring a half-turn flips asymmetric
details — Ember's tail and shoulder guard swap sides. `mirror: false`.

**Maths y maps to world −Z in the dojo** (`ZS` in `mathdojo.js`). The dojo camera
looks down +Z, so without the flip the y axis points *down* the screen and every
diagram is mirrored against her graph paper.

**CSS entrance animations freeze in the Claude Code browser pane.** The document
timeline may never start (`playState: "running"` but `currentTime: 0` forever).
Never use `animation-fill-mode` to hold an element visible — author the final
state as the default. This blanked the whole title screen once.

**A hidden preview pane is a MOMENT, not a session.** Screenshots fail with
"the Browser pane is not displayed, so the page is not compositing frames"
whenever the pane is collapsed — and that is the same condition that stops
`requestAnimationFrame`. But it changes: the pane can be hidden at boot and
shown ten minutes later. **Retry before concluding visual checks are
unavailable**, which is a mistake that has cost a whole session's worth of
eyeballing and sent the work down the numeric-only path unnecessarily.

**Injected DOM DOES recomposite once the pane is displayed.** An earlier note
here claimed otherwise, and it is wrong: a `position: fixed` div appended to
`body` from `javascript_tool` shows up in screenshots fine. This is the way to
inspect anything small — `computer{action: "zoom", region}` is not supported in
this pane and silently returns the whole frame instead, so blow the thing up
into a big canvas and screenshot that. Drawing the seven leader portraits into
a 100px strip across the top of the screen is how the portrait crop was checked
by eye.
