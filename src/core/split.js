/* ---------------------------------------------------------------------------
   How N views tile the screen.

   Pure arithmetic, no THREE and no DOM, so `tools/world-check.mjs` can assert
   the properties that actually matter — every viewport inside the frame, none
   overlapping, and the whole frame used up to the gap between panes. Those are
   geometry, and a layout bug is invisible in a screenshot until somebody is
   playing in a pane two pixels tall.

   THREE PLAYERS GET QUADRANTS WITH ONE CELL EMPTY, not three equal columns or a
   full-width pane on top. Equal area is the fair rule and both alternatives
   break it: columns give three tall slots on a wide screen, which is the worst
   possible shape for a game whose camera is a fixed three-quarter view, and a
   full-width top pane hands whoever is in it twice the screen. An empty cell
   looks like a missing player, which is exactly what it is.

   THE ORIGIN IS BOTTOM-LEFT, because that is what WebGL viewports use, and the
   panes are laid out so PLAYER 1 IS TOP-LEFT reading order. The two-player
   horizontal split already relied on that inversion and had a comment about it;
   getting it backwards silently swaps the two girls' halves of the screen.
--------------------------------------------------------------------------- */

/**
 * @param n     how many views to fit (1..4)
 * @param W,H   the drawing buffer size
 * @param gap   pixels of dead space between panes
 * @param dir   'vertical' (side by side) or 'horizontal' (stacked) — two-view
 *              only; quadrants have no meaningful direction
 * @param sizes optional: how many players are in each view, in view order. A
 *              view holding more than one gets more screen — see below.
 * @returns array of { x, y, w, h }, one per view, in view order
 */
export function splitLayout(n, W, H, gap = 3, dir = 'vertical', sizes = null) {
  if (n <= 1) return [{ x: 0, y: 0, w: W, h: H }];

  /* A SHARED VIEW IS WORTH HALF THE SCREEN, NOT A QUARTER.
     Equal panes are the fair rule when every pane holds one kitten, and the
     wrong one the moment a pane holds two: a pair standing together were being
     given the same quarter as somebody on her own, so teaming up COST them half
     their screen each. The real rule underneath was always equal area PER
     PLAYER, and equal panes is just what that reduces to when everybody is
     alone.

     Three panes out of four players is the only case where those two rules
     disagree — the sizes have to be 2,1,1 — so it is the only case handled
     here. The pair takes a full-width strip across the top (half the screen,
     a quarter each) and the two singles split the bottom (a quarter each).

     FULL WIDTH RATHER THAN A TALL HALF, because the camera is a fixed
     three-quarter view: a wide short pane shows the ground either side of you,
     a tall narrow one shows sky and floor. This is the same "a full-width pane
     hands whoever is in it twice the screen" the file warns about below — the
     difference is that here there really are twice as many players in it.

     THE BIG PANE GOES ON TOP WHEREVER ITS GROUP SITS IN THE ORDER, so the
     returned array still lines up index-for-index with the caller's groups.
     Sorting the panes instead would silently hand one group another's camera. */
  if (n === 3 && sizes && sizes.filter((s) => s > 1).length === 1) {
    const big = sizes.findIndex((s) => s > 1);
    const hw = Math.floor((W - gap) / 2);
    const hh = Math.floor((H - gap) / 2);
    const bottom = [{ x: 0, y: 0, w: hw, h: hh }, { x: W - hw, y: 0, w: hw, h: hh }];
    let b = 0;
    return [0, 1, 2].map((i) => (
      i === big ? { x: 0, y: H - hh, w: W, h: hh } : bottom[b++]
    ));
  }

  if (n === 2) {
    if (dir === 'horizontal') {
      const h = Math.floor((H - gap) / 2);
      // Player 1 goes on TOP, which in bottom-left origin means the high y.
      return [{ x: 0, y: H - h, w: W, h }, { x: 0, y: 0, w: W, h }];
    }
    const w = Math.floor((W - gap) / 2);
    return [{ x: 0, y: 0, w, h: H }, { x: W - w, y: 0, w, h: H }];
  }

  // Three or four: quadrants, reading order, with the fourth cell left empty
  // when there are only three.
  const w = Math.floor((W - gap) / 2);
  const h = Math.floor((H - gap) / 2);
  const cells = [
    { x: 0, y: H - h, w, h },        // top-left     — player 1
    { x: W - w, y: H - h, w, h },    // top-right    — player 2
    { x: 0, y: 0, w, h },            // bottom-left  — player 3
    { x: W - w, y: 0, w, h },        // bottom-right — player 4
  ];
  return cells.slice(0, Math.min(n, 4));
}
