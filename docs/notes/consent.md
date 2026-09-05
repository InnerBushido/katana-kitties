# Nothing irreversible on one press

**Four girls, four sticks, and every one of them being mashed.** That is the
whole context. Richard watched an afternoon of it and came back with a list, and
almost every item on the list is the same bug wearing a different consequence: a
game built for two kids who are paying attention, being played by four who are
not.

- a scene got skipped by somebody who was not watching it
- RESTART threw away an afternoon, from a menu row directly under RESUME
- four cursors fought over one list, and it read as a frozen game
- a controller nobody was holding started the game by itself

Each fix below is structural rather than defensive — a rule the code cannot
route around — because a guard that depends on being remembered is not a guard.
All of them are pinned in `world-check` and `pad-check`.

---

## Escape and Start. Not Space, not Enter, not "any button".

`SKIP_KEYS` used to be `Escape`, `Space` and `Enter`, and the seventh
non-negotiable said so out loud. It was written when there were two players and
one keyboard, and it was right then.

With four girls crowded round a laptop, **Space is the key an elbow finds**, and
skipping the intro is not undoable: `played` latches on the scene STARTING, so
the introduction is spent whether anybody watched it or not. Escape is
deliberate in a way Space is not — nobody rests a thumb on Escape.

```js
const SKIP_KEYS = new Set(['Escape']);
```

**And the pad half has to exclude the keyboard slots.** This is the part that
looks like fussiness and is not:

```js
_skipPressed() {
  return this.input.players.some(
    (p) => p.source !== 'keyboard' && p.pressed('start'),
  );
}
```

A keyboard player's `start` action **is Enter**. Asking every player for `start`
puts Enter straight back into the skip set through the side door, and the line
above becomes decoration. Both halves are checked separately for exactly that
reason.

The trailer follows the same rule and is checked *before* `_sceneActive()` — it
shares the skip keys and nothing else. See [trailer.md](trailer.md).

## The confirm dialog, and the one property that makes it worth having

[systems/confirm.js](../../src/systems/confirm.js). One panel and one class for
RESTART, TITLE SCREEN, QUIT THE MATCH, QUIT GAME and DROP OUT.

**The entire safety property is that the panel has no `.primary`.** `MenuNav`
seats a fresh cursor on `.primary` if it finds one and on `.back` otherwise, so
this panel deliberately has no primary and the cancel button carries `back`. A
mashed pad therefore lands on "no, keep playing".

Get that backwards and the dialog is *worse than nothing*: a second button to
mash through on the way to deleting the world, plus the false confidence of
having asked. If anybody ever adds `primary` to the YES button to make it look
nicer, that is the whole guard gone — which is why `world-check` asserts the
absence rather than the presence.

**Both buttons say what they DO.** "No, keep playing" against "yes, start over",
never bare YES and NO. "Yes" only means something if you have read and retained
the question, and the person answering is nine and is answering while excited.
Sixth non-negotiable: a refusal must say so, and so must a confirmation.

**One question at a time.** `ask` while a question is up refuses rather than
stacking — two dialogs deep, `back` answers the wrong one.

**The remembered cursor is dropped on the way in.** `MenuNav` keeps an index per
panel id and this is ONE panel reused for every question. Without the drop,
saying no to "restart?" leaves the highlight on row two, and the next question —
which might be QUIT GAME — opens with YES already under her thumb.

**It is not `window.confirm()`.** That is an OS window: the Gamepad API cannot
reach it, so a girl on a Joy-Con would get a dialog she can see and cannot
answer. Same reason `MenuNav` never opens a native `<select>`.

### QUIT GAME, and what a browser will actually let you do

New row, last in the list under TITLE SCREEN. The ordering is the point: the
list runs least-final to most-final, so a thumb that overshoots RESUME by one
lands on SETTINGS rather than on the end of the afternoon.

`window.close()` only works on a tab that script opened. `Game.quitGame` calls
it, waits 350ms, and if the window is still there falls back to the title screen
plus a toast naming Ctrl+W / ⌘W. **A button that silently does nothing reads as
broken**, and "the browser will not let me" is a real answer where nothing at
all is not.

## The trade screen asks each girl separately, and only she can answer

[systems/profile.js](../../src/systems/profile.js). This one does **not** use
`Confirm`, and the reason is the whole feature.

`Confirm` is a modal with one cursor. The things it guards belong to nobody in
particular. A trade belongs to exactly two people, and **a modal over a
four-player trade screen would be answered by whoever was nearest** — which is
the single thing this screen has always existed to make impossible. So the
question lives on `Side.pending`, inside that girl's own card, ringed in her own
colour, and `_drive` routes only her pad's buttons to it. The other three keep
shopping underneath.

**Buy and sell ask too**, and for a plainer reason: the dealer is eight nearly
identical rows scrolled with a stick, SELL is a loss, and neither can be undone.
A girl aiming for the row below hers sold her Ward and nothing on screen had
told her she was about to.

**The orb is taken from the question, not from her cursor.** Between the
question and the answer the stick is not frozen, and on a phone the YES button
is somewhere else on screen entirely. A confirmation that acts on the cursor
rather than on what it asked about is worse than no confirmation: it puts a
yes-press behind the wrong orb.

**A refusal still comes first.** Asking "buy this?" and only then saying "you
cannot afford it" is two presses to be told no. `buyRefusal` is checked before
the question — and again on the way through, because somebody else can have
bought the last one in between.

**Changing anything throws the yes away.** Moving the offer, dialling the
points, or un-ticking CONFIRM all clear `sure` as well as `ready`. A girl who
agreed to hand over 200 points and then dialled it to 800 has not agreed to
that; this rule already existed for the tick and now has to reach one step
further, because there is an answer sitting behind the tick.

**Saying no calls the whole trade off** — and that was a live bug, invisible
from the code. `_maybeTrade` runs every frame; every frame it found two girls
still ticked and one of them without a question up, so it put the same question
straight back. She pressed no, the box blinked, and it was still there. The only
escape was to work out that un-ticking CONFIRM was a separate control. Clearing
only her own tick fixes the loop and leaves a worse bug — her sister is still
ticked *and* still holding a `sure`, so a re-tick would fire a trade off an
agreement given to different terms. So a no drops both, and says who and why.

**The footer stops naming the other meanings while somebody is being asked.**
Down there JUMP means "buy" or "offer"; in the strip that just appeared, JUMP
means "yes". Both cannot be on screen at once without one being a lie, and the
strip wins because it is where she is looking. The footer names *whose*
controller instead — with four kittens on this screen one is being asked and
three are still shopping, and there is no single true instruction to print.

**Putting an orb on the ground asks the same way.** SPRINT on a non-empty offer
raises an ordinary `Side.pending` — same strip, same colour, same two answers,
naming every orb in the pile. It qualifies on the plain reading of the seventh
non-negotiable: pressing SPRINT again does not pick the orbs back up, so it is
irreversible in the only sense that matters to a nine-year-old. **And an empty
pile is refused in words that name the press** — *"Pick the orbs to drop first
— JUMP on each one"* — rather than by the button doing nothing, which is the
sixth.

**The question sits under her name, not at the bottom of her card.** `kd-body`
scrolls, a card with eight orb slots and a points row is taller than a laptop
half-window, and a question below the fold is a CONFIRM press that appears to do
nothing — the silent refusal, reintroduced by layout rather than by code. It
also needs 15px of bottom margin: an OFFERED slot is drawn
`scale(1.12) translateY(-4px)`, and the offered orb is by definition the one the
question is about, so the two always collide. Measured: the strip ran to 255 and
the slot painted from 243, straight through the line naming the buttons.

## The record board is signed twice

[systems/leaderboard.js](../../src/systems/leaderboard.js), `NameEntry`.

The board outlives the browser closing and `_commit` is one-way — there is no
screen anywhere that can edit a name once it is on the list. So `accept()` is
two stages: the first press raises `confirming`, the second signs.

**Callers did not have to change**, and that is deliberate. Every one of them
already does its work on `entry.done` rather than on the return value, so a
screen that has not been taught about the question simply shows one nobody can
answer — visible, rather than silently signing the board on the first press.

While the question is up, `type`, `del` and `pick` all refuse and the stick is
held out of the letter walk entirely. She is being asked about a name that
quotes itself; the name must not change under the question. The keypad is
*hidden* rather than left inert, because 36 buttons that silently do nothing is
the exact reading of "broken" the sixth non-negotiable exists to prevent.

**A mash answers no.** A pad reporting jump AND attack in one frame is a child
mashing, and the answer to a mash is no — the no branch is read first.

Escape answers the question rather than leaving the screen. There is nowhere to
go, the name is not signed, and `Game`'s Escape handler reaches `tournament.key`
*before* the pause toggle, so this works out on its own.

## One player drives a menu, and the screen says who

Before this, every seated pad drove the same highlight: four sticks, one list,
and the cursor jumping two rows per nudge. Richard's rule, verbatim — *"only 1
player ever controls the Menu screen"*.

`Game.menuOwner` is the slot that opened it. `MenuNav._read` folds one player's
snapshot instead of all of them:

```js
const ps = owner != null && all[owner] ? [all[owner]] : all;
```

`null` means shared, which is what a mouse click or any route that did not name
a player leaves it as — and closing the menu always gives it back, or the next
person to open it inherits a cursor belonging to somebody who has stopped
playing.

**Which pad asked, not whether any did.** The pause path uses `findIndex`, not
`some`: there is no way back from a boolean to the slot that pressed it.

**A dead pad must not lock four people out of RESUME.** `_checkMenuOwner` runs
every frame — not on the disconnect event, because a pad that simply stops
reporting never fires one — and hands the menu to the lowest seated slot. Ember,
then Frost, then whoever else is here. There is no cleverer answer: "who pressed
most recently" needs a history nobody is keeping, and any order at all beats a
dead cursor.

**And it says so, in her kitten colour** — the same colour as her HUD badge and
her pane border, so it reads from across a room without reading the words. Three
players pushing sticks at a cursor that will not move have no way to tell a lock
from a crash.

It sits directly under "PAUSED" and above RESUME. It was at the bottom under
QUIT GAME first, and on a half-height window that measured 200px below the fold:
to find out why her stick did nothing, a girl had to scroll past ten rows using
the cursor that was not moving. **Sticky was tried and dropped** — the panel
scrolls as a whole, so a sticky line rides over the buttons passing behind it
and the orange RESUME row reads through above and below, which looks like a
rendering fault. It does not need to be sticky: the menu always opens at the
top, and the girl who needs this line is the one whose stick is doing nothing,
so she is never the one who has scrolled.

## The controller that started the game by itself

Reported as *"2 controllers connected and one of them autostarts the game"*, and
the first guess — a phantom device the browser was inventing — was wrong. It was
real, and it is still there on Richard's machine:

```
index 1  vJoy - Virtual Joystick (Vendor: 1234 Product: bead)
         button 9 held at 1.00, permanently, from boot
```

Button 9 is `attack` on the left Joy-Con half, and the title screen's
any-button rule started the game on it, every frame, before anybody touched
anything. There is no way to play the game from that state and no way to see why
from inside it.

The mask lives in the **one pure helper every read goes through**, so a profile
lookup, a join test or a liveness check cannot route around it:

```js
function b(gp, i) {
  if (LATCHED.get(gp.index)?.has(i)) return false;
  return rawDown(gp, i);
}
```

Maintained in `_watchAxes` *before* anything reads a button, and it clears the
instant she lets go — so a stuck pad costs nothing except the one press it was
never making.

**Only for vJoy, and that asymmetry is the whole reason it is gated.** A real
HID pad is not surfaced by the browser at all until a human presses something on
it, so its very first frame legitimately has a button down; latching that would
eat the wake-up press and every controller in the house would look dead. vJoy is
a driver device that is simply always there, so a button down on its first frame
is a stuck bit, not a person. It logs a console warning naming the buttons, and
`diagnostics()` reports `latched`.

**`pad-check`'s harness was wrong too, and passing.** It handed pads over with a
button already down on frame one — a physically impossible device, one that had
been holding a button since before it existed — and called that a press. `drive`
now inserts an arrival frame with nothing held, which is what a real pad does,
and the seven checks that broke were describing the bug rather than the fix.

## The trailer offer comes back

`_trailerOfferDue()` used to consult `localStorage.kk.trailerOffer`. Richard:
*"that option only ever appears once and never returns. Even if I refresh the
browser, it still will not reappear."*

Remembering forever is right for a cookie banner and wrong for a thing you might
want to show somebody — the trailer is 68 seconds of the game's own art and the
most likely reason to want it is a new person in the room. So: no storage at
all, a plain `_offerAnswered` field, and `toTitle()` clears it. Both halves are
checked separately, because either one alone silently restores the old
behaviour — a storage read would pin it across refreshes, a missing reset would
pin it for the session.
