/* ===========================================================================
   A TAP IS NOT A DRAG.

   Reported from a phone: "at the 'View my Orbs' screen at the kotodama dealer,
   when scrolling up/down, it is also selecting the orbs. It should not select
   the orbs while scrolling up/down, it should only select on click. THIS SHOULD
   APPLY ON ALL SCREENS THAT HAVE SCROLLING AND CLICKABLE UI ELEMENTS."

   That last sentence is why this is a module and not four lines inside
   `inspector.js`. There are two shapes of the same bug in this codebase and
   they need two different answers, so both live here together where the next
   scrolling list can find them:

     * A HANDLER BOUND TO `pointerdown` acts before the gesture is a gesture.
       It cannot tell a tap from the first millimetre of a flick, and if it
       calls `preventDefault` — which `inspector.js` did, to stop the tap
       becoming a synthetic click — it also cancels the scroll it was
       mistaking the flick for. Both halves of the report, from one line.
       `onTap` is the fix: remember where the finger landed, act on the RELEASE,
       and only if it did not travel.

     * A HANDLER BOUND TO `click` is mostly fine, because a touch that scrolls
       usually suppresses its click. MOSTLY. A short drag inside a scroller that
       is already at its end scrolls nothing and clicks anyway, and a mouse drag
       across a list clicks unconditionally. `dragGuard` is the fix there, and
       it is a separate function rather than a rewrite because those handlers
       are on real `<button>` elements: a keyboard Enter arrives as a `click`
       with no pointer behind it at all, and a pointer-only rewrite would take
       the dealer's buttons away from anybody not using a thumb.

   THE TARGET COMES FROM THE PRESS, NOT THE RELEASE. She aimed at a row; if the
   list moved two pixels under her in the meantime, the row she aimed at is
   still the row she meant. This is the "a row that slid under the cursor after
   she aimed at it" case in docs/notes/gotchas.md, and getting it from the
   `pointerdown` target costs nothing.
=========================================================================== */

/** How far a finger may travel and still be a tap, in CSS pixels.
 *
 *  TEN, AND IT IS A COMPROMISE THAT WAS MEASURED BOTH WAYS. A deliberate thumb
 *  tap on a phone wanders three to six pixels between contact and release —
 *  under five and a child's tap starts being ignored, which is the sixth
 *  non-negotiable's worst case because the refusal is silent. A flick that
 *  means to scroll clears ten pixels almost immediately, so the two do not
 *  overlap at this number. A mouse click is normally zero. */
export const TAP_SLOP = 10;

/**
 * Call `act(target, event)` when a press and its release land in the same
 * place — and not when the finger dragged in between.
 *
 * @param {Element} host      the delegating container
 * @param {(t: EventTarget, e: PointerEvent) => void} act
 * @param {{slop?: number}} [opts]
 */
export function onTap(host, act, { slop = TAP_SLOP } = {}) {
  if (!host) return;
  let down = null;
  host.addEventListener('pointerdown', (e) => {
    /* Right and middle buttons are not taps. `button` is 0 for every touch. */
    if (e.button) { down = null; return; }
    down = { id: e.pointerId, x: e.clientX, y: e.clientY, target: e.target };
  });
  /* A cancel is the browser taking the gesture over — a scroll claiming it, or
     the finger leaving the glass. Either way it is not a tap, and dropping the
     record here means a later stray `pointerup` cannot resurrect it. */
  host.addEventListener('pointercancel', () => { down = null; });
  host.addEventListener('pointerup', (e) => {
    const d = down;
    down = null;
    if (!d || d.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > slop) return;
    act(d.target, e);
  });
}

/**
 * For a `click` handler that must keep working for the keyboard: returns a
 * predicate that is true when the click it is being asked about came off the
 * end of a drag.
 *
 * IT ANSWERS FALSE WHEN THERE WAS NO POINTER AT ALL, which is the whole reason
 * it exists — a keyboard Enter on a focused button is a click with nothing
 * before it, and it must go through.
 *
 * @param {Element} host
 * @param {{slop?: number}} [opts]
 * @returns {() => boolean}
 */
export function dragGuard(host, { slop = TAP_SLOP } = {}) {
  let far = false;
  if (!host) return () => false;
  host.addEventListener('pointerdown', (e) => {
    far = false;
    host._tapAt = e.button ? null : { x: e.clientX, y: e.clientY };
  });
  host.addEventListener('pointerup', (e) => {
    const a = host._tapAt;
    far = !!a && Math.hypot(e.clientX - a.x, e.clientY - a.y) > slop;
    host._tapAt = null;
  });
  /* CLEARED BY THE NEXT KEYBOARD CLICK AND NOT ONLY BY THE NEXT POINTER. A
     drag that ends outside `host` never fires our `pointerup`, so `far` would
     otherwise stay true and eat the next Enter — a lock with no key, which is
     exactly the failure this project keeps re-finding in menus. */
  host.addEventListener('click', (e) => {
    if (!e.detail) far = false;       // detail 0 = not from a pointer at all
  }, true);
  return () => far;
}
