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

  /* TWO PANES HOLDING DIFFERENT NUMBERS OF KITTENS IS THE SAME UNFAIRNESS AS
     ABOVE, ONE CASE FURTHER ALONG, AND IT IS ALSO A CAMERA BUG.

     Four players, three of them together and one off on her own, is two groups
     — so this fell through to the plain 50/50 vertical split and handed three
     kittens half a screen between them while one had the other half to herself.
     Per player that is a sixth against a half.

     THE SHAPE WAS THE WORSE HALF OF IT. A vertical split makes each pane half
     as wide and just as tall, so the camera's aspect goes from about 1.78 to
     0.58 and the horizontal field of view collapses to a third of what every
     framing constant in `main.js` was tuned against. Three kittens standing
     comfortably apart went from all visible to one visible, with the other two
     cropped off the sides of their own pane — reported as "it thinks all three
     are visible, but that assumes the whole screen width".

     So an uneven pair of panes is STACKED, for exactly the reason the n === 3
     case above gives: a wide short pane shows the ground either side of you,
     which is where the rest of your group is standing, and a tall narrow one
     shows sky and floor. The bigger group also gets the bigger strip.

     0.62 RATHER THAN STRICT PROPORTION. Three-versus-one in proportion is
     0.75/0.25, which leaves the solo player a slit a quarter of the screen tall
     — fair by area and unplayable. 0.62 is most of the way to fair for 2v1,
     kinder than fair to the solo at 3v1, and leaves both panes a shape the
     camera can actually work in. Two even panes are untouched, so the
     two-player game — where the sizes are always 1 and 1 — never reaches this
     branch and keeps the `dir` setting it has always had. */
  if (n === 2 && sizes && sizes[0] !== sizes[1]) {
    const big = sizes[0] > sizes[1] ? 0 : 1;
    const bh = Math.round((H - gap) * 0.62);
    const sh = H - gap - bh;
    const tall = { x: 0, y: 0, w: W, h: bh };
    const short = { x: 0, y: 0, w: W, h: sh };
    /* Whichever pane is FIRST goes on top — bottom-left origin, so the high y —
       so the returned array still lines up index-for-index with the caller's
       groups. Sorting by size instead would hand one group another's camera. */
    const first = big === 0 ? tall : short;
    const second = big === 0 ? short : tall;
    return [
      { ...first, y: H - first.h },
      { ...second, y: 0 },
    ];
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

/* ===========================================================================
   AND WHICH GROUP GETS WHICH PANE.

   `splitLayout` decides the SHAPES. It hands them back in group order, which
   is the obvious thing to do and is also a bug: a group's index moves when
   anybody else on the screen joins or leaves a pane, so a player who has been
   sitting in the bottom right all afternoon is teleported to the bottom left
   because two OTHER kittens walked towards each other.

   Reported from four-player play, and it is worse than it sounds. The whole
   reason for split screen is that you know where to look; a pane that moves
   costs you a second of hunting for yourself, and it moves for a reason that
   has nothing to do with you.

   Worked example, four players, everybody alone — panes are TL TR BL BR by
   index, so 0123 sit in reading order. Players 1 and 2 walk together:

     groups become [0] [1,2] [3]        (sorted by lowest member)
     sizes 1,2,1, so the PAIR takes the full-width top strip
     the two singles take the two bottom cells, in group order
     -> player 0 goes top-left  -> bottom-LEFT
     -> player 3 stays bottom-right

   Player 0 has been thrown across the screen by somebody else's walk. The pair
   genuinely has to move — its pane did not exist a frame ago — but player 0's
   did, and there was a free bottom cell in the same corner she was already in.

   SO THE PANES ARE ASSIGNED, NOT DEALT OUT IN ORDER. Every valid permutation
   of the returned rectangles is scored by how far it drags each group from
   where that group's members were last frame, and the cheapest one wins.
   Four panes is at most 24 permutations of four items, once a frame, on a
   machine drawing a 3D world — the cost is not worth a cleverer algorithm, and
   a Hungarian solver here would be three times the code and impossible to read
   at a glance.

   ONLY PANES OF IDENTICAL SHAPE MAY SWAP, which is the constraint that keeps
   `splitLayout`'s rules intact. Its uneven layouts put the big rectangle at the
   big group's index on purpose — the pair that earned half the screen must not
   be handed a quarter because a quarter happened to be nearer. Restricting
   swaps to same-size rectangles means every permutation this considers is one
   `splitLayout` itself would have been willing to return.

   TIES GO TO THE IDENTITY, so behaviour is unchanged wherever this has no
   opinion: one pane, two even panes, or a frame where nobody has moved. The
   two-player game never reaches a case where two same-shaped panes have
   different costs unless the players actually swapped sides, which is the
   fifth non-negotiable satisfied by construction rather than by a special case.
=========================================================================== */

/** Permutations of 0..n-1, n <= 4. Written out rather than generated because
 *  this runs every frame and n is never large enough for cleverness to pay. */
function permutations(n) {
  if (n <= 1) return [[0]];
  const out = [];
  const walk = (used, acc) => {
    if (acc.length === n) { out.push(acc.slice()); return; }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      used[i] = 1; acc.push(i);
      walk(used, acc);
      acc.pop(); used[i] = 0;
    }
  };
  walk(new Array(n).fill(0), []);
  return out;
}

/** Centre of a rect, in fractions of the frame, so a window resize does not
 *  read as everybody moving. */
const centreOf = (v, W, H) => ({ cx: (v.x + v.w / 2) / W, cy: (v.y + v.h / 2) / H });

/**
 * Reorder `panes` so each group lands as near as possible to where its members
 * were.
 *
 * @param panes  what `splitLayout` returned, in group order
 * @param groups arrays of player indices, same order as `panes`
 * @param prev   player index -> { cx, cy } she occupied last frame, in frame
 *               fractions. Missing entries are players who were not on screen,
 *               and a group of only those has no opinion and costs nothing.
 * @param W,H    the frame the panes were laid out in
 * @returns a new array of the SAME rects, permuted; index still means group
 */
export function stablePanes(panes, groups, prev, W, H) {
  const n = panes.length;
  if (n < 2 || !prev || !(W > 0) || !(H > 0)) return panes;

  /* Where each group wants to be: the mean of its members' old centres. A
     group that has just formed out of two panes lands between the two, which
     is the right answer — whichever of them it is nearest to is the one that
     moves least, and the other was going to move whatever we did. */
  const want = groups.map((m) => {
    const seen = m.map((i) => prev[i]).filter(Boolean);
    if (!seen.length) return null;
    return {
      cx: seen.reduce((s, p) => s + p.cx, 0) / seen.length,
      cy: seen.reduce((s, p) => s + p.cy, 0) / seen.length,
    };
  });
  if (want.every((w) => !w)) return panes;

  const at = panes.map((v) => centreOf(v, W, H));
  /* A pane may only take another's place if the two are the same rectangle.
     See the header: this is what keeps splitLayout's size rules true. */
  const shape = panes.map((v) => `${v.w}x${v.h}`);

  let best = null;
  let bestCost = Infinity;
  for (const p of permutations(n)) {
    let ok = true;
    let cost = 0;
    for (let g = 0; g < n; g++) {
      if (shape[p[g]] !== shape[g]) { ok = false; break; }
      const w = want[g];
      if (!w) continue;
      /* Weighted by how many kittens are being moved: dragging a pair across
         the screen is twice the disruption of dragging one player. */
      cost += Math.hypot(at[p[g]].cx - w.cx, at[p[g]].cy - w.cy) * groups[g].length;
    }
    /* STRICTLY cheaper, and the identity is tried first, so a tie leaves
       everything exactly where it is. */
    if (ok && cost < bestCost - 1e-9) { bestCost = cost; best = p; }
  }
  if (!best) return panes;
  return best.map((src) => panes[src]);
}

/** Where every player sat, as frame fractions, ready to feed back in as
 *  `prev`. Kept next to `stablePanes` because the two are one mechanism and a
 *  caller assembling this itself is a caller that can assemble it wrong. */
export function paneSeats(panes, groups, W, H) {
  const seats = {};
  if (!(W > 0) || !(H > 0)) return seats;
  panes.forEach((v, g) => {
    const c = centreOf(v, W, H);
    for (const i of groups[g] ?? []) seats[i] = c;
  });
  return seats;
}

/** Headroom past the last kitten. She is drawn about two units tall and stands
 *  at the centre of her sprite, so framing her exactly at the edge puts half of
 *  her outside it — and a player pinned to the very edge of a pane reads as
 *  about to be lost even when she is not. */
const FIT_MARGIN = 1.35;

/**
 * How far back a camera has to sit for a group to FIT ACROSS ITS PANE.
 *
 * WHY THIS IS NOT OPTIONAL: `main.js` sizes its pull-back from world spread
 * alone — `clamp(26 + spread * 0.85, 26, 52)` — which is an empirical fit tuned
 * on a full-width screen and has no idea how wide the pane actually is. The
 * moment a pane is narrower than the one those constants were tuned against,
 * that distance frames a screen the game does not have and the players on the
 * outside are cropped out of their own view.
 *
 * A perspective camera's fov is VERTICAL, so the horizontal half-extent it can
 * see at distance `d` is `d * tan(fov/2) * aspect`. Invert that for the
 * distance that fits a spread. Only the horizontal is solved for: the camera
 * has no roll, so a spread lying along its right vector projects at full
 * length and is the worst case, while spread along the view direction is
 * foreshortened and cheaper. A narrow pane — the case this exists for — is
 * short of width and not of height.
 *
 * The caller takes the MAX of this and its own formula, never the sum and never
 * a replacement: on a wide pane this comes out well under the tuned distance
 * and changes nothing, which is what keeps the two-player game identical.
 */
export function fitDistance({ spread, fovDeg, aspect, margin = FIT_MARGIN }) {
  if (!(spread > 0) || !(aspect > 0) || !(fovDeg > 0)) return 0;
  const halfV = Math.tan((fovDeg * Math.PI) / 360);
  return ((spread / 2) * margin) / (halfV * aspect);
}

/* ===========================================================================
   HOW BIG THE MINIMAP IS.

   IT LIVES HERE BECAUSE IT IS PANE GEOMETRY, and because a rule written inline
   in `_drawMaps` could only ever be checked by looking at it. `splitLayout`
   next door decides the pane; this decides what fits in the corner of one, and
   both are pure for the same reason.
=========================================================================== */

/** The desktop ceiling, in px, and the fraction of a pane's width it may take.
 *  Neither has moved since the map existed. */
const MAP_MAX = 300;
const MAP_WIDE = 0.42;
/** A phone's cap, as a fraction of the PANE's height. */
const MAP_TALL = 0.41;
/** ...and inside the Dojo, where the map shares the screen with the board. */
const MAP_DOJO = 0.33;
/** ...and again when a phone is split side by side. See below. */
const MAP_SPLIT = 0.67;

/* A map must fit the pane it is in. At a flat 32vw a quadrant's map ate
   most of a quarter-screen; sized against the PANE it stays the same
   fraction of what its owner can actually see.

   AND ON A PHONE IT IS THE HEIGHT THAT IS SCARCE, WHICH IS WHY THIS IS THE
   ONE PLACE IT COULD BE FIXED. A landscape phone is 844x390: `paneW * 0.42`
   is 354px of a 390px-tall screen, so the map covered the bottom-right
   corner entirely and the hint text ran underneath it. That is the
   misalignment the first phone test reported.

   What comes out of here is written to `style.width` INLINE by `_drawMaps`,
   so no stylesheet rule can override it — a `body.touch-ui .map-box` width
   in style.css is silently dead. The limit therefore has to be a third
   number in the `Math.min` below, and it has to be a fraction of the pane's
   HEIGHT: a short pane is the case a width-derived size cannot see. */
/* A THIRD OF THE PANE HEIGHT ON A TOUCH DEVICE, and the journey to that
   number is worth recording because two of the three steps were wrong.

   It started at 0.34 to get the map out from under the hint text. Played
   on a phone it was unreadable, so it went to 0.50 — and that was fixing
   the wrong thing: the map was illegible because it opened at WORLD zoom,
   drawing eight islands into 200px, not because the box was small. Once it
   opened zoomed in (see TOUCH_ZOOM) the same box was perfectly readable
   and merely enormous, eating half the screen it is drawn over.

   So it is back to a third. The lesson is that a HUD element that cannot
   be read has two possible causes and only one of them is its size. */
/* A BIGGER MAP, AND THE DOJO NO LONGER GETS A SPECIAL SMALL ONE.

   0.33 was picked when the map shared the top-left corner with nothing and
   had to stay out of the hint text (see the note above, which is the
   history). It is the only thing you navigate by, it is read at a glance
   on a moving phone, and 0.41 is about a quarter bigger for a corner that
   is otherwise empty.

   Inside the Dojo it drops back to that old 0.33 rather than the 0.24 it
   was briefly given. 0.24 was over-corrected: the board had just moved to
   the top-left and the map was being kept out of its way, but the map is
   on the other side of the screen entirely, and the only thing it has to
   clear there is the face cluster — which it does at 0.33 with room. */
/* AND A THIRD SMALLER AGAIN WHEN THE PHONE IS SPLIT SIDE BY SIDE, which
   is a case the cap above cannot see. It is a fraction of the pane's
   HEIGHT, and a side-by-side split does not change the pane's height —
   so 41% of `paneH` is the same 160px map it always was, now crammed into
   half the width, and there are two of them. Reported from a tablet with
   two players on it.

   GATED ON THE PANE STILL BEING FULL HEIGHT rather than simply on
   `!merged`, because a top-and-bottom split has already taken the cut:
   `paneH` halved, so the cap halved with it, and cutting a 195px pane's map
   by another third leaves 54px of unreadable islands. One rule, applied
   where the thing it corrects for is actually happening. */

/** How wide the minimap box is, in CSS pixels. Pure, so `world-check` can
 *  assert it — this is layout arithmetic and `_drawMaps` only writes the
 *  result to `style.width`.
 *
 *  @param paneW,paneH  the pane this map belongs to
 *  @param screenH      the whole window's height — the only way to tell a
 *                      side-by-side split (paneH unchanged) from a stacked one
 *  @param touch        is this a phone? The caps below apply to nothing else
 *  @param merged       one pane for everybody
 *  @param mathUp       the Dojo's sin/cos board is on screen
 */
export function mapWidth({
  paneW, paneH, screenH, touch = false, merged = true, mathUp = false,
}) {
  const fullHeight = paneH > screenH * 0.75;
  const cap = touch
    ? paneH * (mathUp ? MAP_DOJO : MAP_TALL) * (merged || !fullHeight ? 1 : MAP_SPLIT)
    : Infinity;
  return Math.min(MAP_MAX, paneW * MAP_WIDE, cap);
}
