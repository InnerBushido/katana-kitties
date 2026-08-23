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
  /* AND THE SETTING DECIDES WHICH WAY IT IS CUT, which it did not before.

     `dir` reached exactly one branch — two panes of equal size — so a player
     who set the screen to split side by side got side by side with two
     kittens and stacked with three, from the same setting, with nothing on
     screen to say why. Reported as "the split direction is only applied when
     2 players are on 1 screen and 2 on the other". It was not a decision; the
     other branches were written before there was anything to ask.

     'horizontal' (stacked) is the arrangement described below and it is the
     kinder one for the reason given there — a wide short pane shows the ground
     either side of you, a tall narrow one shows sky and floor. 'vertical' is
     the mirror image of it: the pair takes a full-height COLUMN and the two
     singles share the other one. It is a worse shape for a pair and it is what
     the setting says, and `fitDistance` below means the worse shape costs a
     wider framing rather than kittens cropped off the edge of their own pane —
     which is what made honouring the setting safe to do at all. */
  if (n === 3 && sizes && sizes.filter((s) => s > 1).length === 1) {
    const big = sizes.findIndex((s) => s > 1);
    if (dir === 'vertical') {
      const hw = Math.floor((W - gap) / 2);
      const hh = Math.floor((H - gap) / 2);
      const right = [{ x: W - hw, y: H - hh, w: hw, h: hh }, { x: W - hw, y: 0, w: hw, h: hh }];
      let r = 0;
      return [0, 1, 2].map((i) => (
        i === big ? { x: 0, y: 0, w: hw, h: H } : right[r++]
      ));
    }
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
    /* THE SETTING PICKS THE AXIS AND THE 0.62 SPLIT IS THE SAME EITHER WAY.
       This branch used to stack unconditionally, for the shape reason set out
       below, and that made the split-direction setting a lie in exactly the
       case where a player is most likely to go looking for it. See the note in
       the three-pane branch above: the stacked answer is the kinder one and it
       is now what 'horizontal' means rather than what everybody gets. */
    if (dir === 'vertical') {
      const bw = Math.round((W - gap) * 0.62);
      const sw = W - gap - bw;
      /* Whichever pane is FIRST goes on the left, matching the even split
         below, so the returned array still lines up index-for-index with the
         caller's groups. */
      const firstW = big === 0 ? bw : sw;
      const secondW = big === 0 ? sw : bw;
      return [
        { x: 0, y: 0, w: firstW, h: H },
        { x: W - secondW, y: 0, w: secondW, h: H },
      ];
    }
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

  /* Three or four EQUAL panes: quadrants, reading order, with the fourth cell
     left empty when there are only three.

     `dir` HAS NO MEANING HERE AND IS DELIBERATELY IGNORED. Quadrants are
     already cut both ways at once; the only alternatives are three or four
     equal columns or rows, and the header rejects those for the reason it
     gives — equal area is the fair rule, and a fixed three-quarter camera in a
     pane a quarter of a screen wide or a quarter of a screen tall shows almost
     nothing of the world. The setting is honoured everywhere it can be, which
     is every layout with exactly two ways to cut it. */
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

/**
 * How far past the rim a knocked-out kitten has to be to count as landed.
 *
 * The same two halves, and the same 3 units, as `OUT_FALL` in
 * systems/tournament.js: outside the deck it is a hundred units of open sky, so
 * there is no case in between "standing on the island below" and "still going".
 */
export const OUT_DROP = 3;

/**
 * Should the camera STOP FRAMING this kitten?
 *
 * WHY IT EXISTS. A knockout deliberately throws her further than the blow that
 * caused it (see `Player.hurt`), which is how the last hit of a round looks
 * different from the eleven before it — and a big enough one puts her over the
 * rim and down onto the island underneath. `Tournament` exempts a knocked-out
 * kitten from the ring-out rule on purpose: she has no health left to charge
 * and nothing to walk back with. So she lies there, thirty or forty units
 * outside a 56-unit ring, and the shared rig — a round is always one screen —
 * went on framing her: the spread was read from her to the fight and the camera
 * pulled back far enough to fit both, so the knockout that ENDED the round was
 * watched from a hundred units up with the ring the size of a coin. Reported as
 * exactly that.
 *
 * FLYING STILL COUNTS AND LANDED DOES NOT, which is the line the report itself
 * drew: being launched out of the ring is the shot, and it is worth watching.
 * It stops being a shot the moment she has stopped moving.
 *
 * IT IS NOT A RING-OUT AND MUST NOT BECOME ONE. Nothing here moves her, hurts
 * her or ends anything — she is still lying where she landed, still drawn,
 * still on every minimap, and `Tournament` still owns putting her back on the
 * deck. The only thing that changes is what the camera thinks it has to fit.
 *
 * ONLY DURING A ROUND, because "outside the ring" answers for the whole world:
 * off the arena every kitten on every island is outside it. `ko` should be
 * unreachable out there, but a predicate that is only correct because of
 * something two files away is one bad merge from framing nobody at all.
 *
 * Plain numbers rather than a `Player` and a `World`, so it can be checked
 * without either — the same reason `mapWidth` and `fitDistance` live here.
 *
 * @param p         {{ko:boolean, onGround:boolean, y:number}}
 * @param outBy     how far outside the deck she is; > 0 is outside
 * @param deckY     the height of the deck she was fighting on
 * @param fighting  is a round live this frame
 */
export function outOfShot(p, outBy, deckY, fighting) {
  if (!p?.ko || !fighting) return false;
  if (!(outBy > 0)) return false;
  return !!p.onGround || p.y < deckY - OUT_DROP;
}

/**
 * The members of a group the camera is actually framing.
 *
 * DEGRADES TO THE WHOLE GROUP rather than to nothing: a pane whose only kitten
 * has been knocked out of the ring still has to point somewhere, and pointing
 * it at her is a great deal better than pointing it at the origin.
 */
export function framedMembers(members, ignores) {
  const live = members.filter((i) => !ignores(i));
  return live.length ? live : members;
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

/* ===========================================================================
   AND WHICH PANES GET THE TWO MINIMAPS.

   IT LIVES HERE FOR THE SAME REASON `mapWidth` DOES: it is a function of the
   panes and of nothing else, so it can be checked without a Game, a GPU or a
   world. `Game._mapPanes` is one line over the top of it.
=========================================================================== */

/**
 * Deal `nMaps` maps out to panes, by how many kittens are in each.
 *
 * THE MAP GOES WHERE IT IS WORTH MOST. There are two maps at most — four
 * copies of the archipelago on four quadrants is four corners of the game
 * covered up at the moment there is most to look at — and they used to be
 * nailed to panes 0 and 1, i.e. "the maps belong to Ember and Frost". That is
 * stable, and it strands exactly the wrong people: two sisters exploring
 * together share one pane, and that pane could end up with no map while a map
 * sat in a pane holding one girl standing next to the stall. Two kids with no
 * map is the failure the minimap exists to prevent.
 *
 * INCUMBENCY WINS TIES, WHICH IS WHAT KEEPS IT FROM FLICKERING. A map is taken
 * off a pane only by a pane holding STRICTLY more players, so the ordinary
 * case — everybody alone — never moves a map once it has landed. It is the
 * same argument `stablePanes` makes above: a thing that moves for a reason
 * that has nothing to do with you costs you a second of hunting for it.
 *
 * TWO PLAYERS COME OUT UNCHANGED BY CONSTRUCTION. Two panes, two maps, nothing
 * to choose — step 1 keeps them and steps 2 and 3 have nothing left to do.
 *
 * @param sizes  players per pane, in pane order
 * @param prev   what each map held last frame, map index -> pane index
 * @param nMaps  how many maps exist
 * @returns map index -> pane index, or -1 for a map with nowhere to be
 */
export function assignMaps(sizes, prev = [], nMaps = 2) {
  const n = Math.min(nMaps, sizes.length);
  const out = new Array(Math.max(0, nMaps)).fill(-1);
  const taken = new Set();

  // 1. Every map keeps the pane it had, if that pane still exists.
  for (let m = 0; m < n; m++) {
    const g = prev?.[m];
    if (g >= 0 && g < sizes.length && !taken.has(g)) { out[m] = g; taken.add(g); }
  }
  // 2. Any map without one takes the fullest pane going.
  for (let m = 0; m < n; m++) {
    if (out[m] >= 0) continue;
    let best = -1;
    for (let g = 0; g < sizes.length; g++) {
      if (taken.has(g)) continue;
      if (best < 0 || sizes[g] > sizes[best]) best = g;
    }
    out[m] = best;
    if (best >= 0) taken.add(best);
  }
  // 3. And a pane holding MORE kittens than an incumbent takes its map.
  //    Strictly more, so a tie leaves everything exactly where it was.
  for (let g = 0; g < sizes.length; g++) {
    if (taken.has(g)) continue;
    let worst = -1;
    for (let m = 0; m < n; m++) {
      if (out[m] < 0) continue;
      if (worst < 0 || sizes[out[m]] < sizes[out[worst]]) worst = m;
    }
    if (worst < 0 || sizes[g] <= sizes[out[worst]]) continue;
    taken.delete(out[worst]);
    out[worst] = g;
    taken.add(g);
  }
  return out;
}

/**
 * WHICH CORNER OF ITS PANE A HUD BOX HUGS.
 *
 * THE MAPS MOVED TO THE INSIDE OF THE SPLIT, AND THIS IS THE RULE THAT DOES
 * IT. Every map used to sit in the bottom-LEFT of its own pane, which is an
 * outside corner for half of them: on a side-by-side split, one map was hard
 * against the left edge of the screen and the other just right of the seam,
 * as far apart as two boxes on one screen can be. Two kittens standing next to
 * each other in the world were reading two archipelagos a screen's width
 * apart, and the girl on the left could not see her sister's at all.
 *
 * A map on the seam is READABLE FROM BOTH PANES, which is the whole of the
 * change. The panes meet at the middle of the screen, so "the corner of this
 * pane nearest the middle" puts every map within a glance of its neighbour's —
 * on quadrants all four converge on the centre point, each one still strictly
 * inside its own pane, and the four outer corners of the screen are handed
 * back to the game.
 *
 * IT IS EDGES, NOT DISTANCES. "Nearest corner" is ambiguous for a pane that
 * spans the whole width or the whole height — both of its corners on that axis
 * are the same distance from the middle — so each axis is decided on its own:
 * a pane that spans the axis keeps the outside (left, and bottom), and a pane
 * that does not hugs whichever of its two edges is the seam.
 *
 * THE HINT LINE IS WHY `hint` EXISTS. `.hint` is centred at the bottom of the
 * SCREEN, so two full-height panes hugging the seam put their maps either side
 * of the one sentence telling a kid what the button under her thumb does. Only
 * a pane whose bottom IS the screen's bottom has that problem; a pane sitting
 * on a seam has a seam under it, so it does not lift.
 *
 * `inner: false` IS THE MATHS BOARD, AND IT IS THE SAME RULE READ BACKWARDS.
 * Two boxes in one pane cannot both have the seam corner, and the Dojo's
 * sin/cos board is the other one — so it takes the corner FURTHEST from the
 * middle of the screen and the two end up at opposite ends of the same edge,
 * with the kitten between them rather than under either. It stays on the
 * BOTTOM of its pane in both modes: the outer TOP corner is where the
 * scoreboard runs, and a board tucked under a score badge is the collision
 * this whole function exists to stop.
 *
 * @param v      the pane, in WebGL bottom-left origin
 * @param W,H    the whole frame
 * @param size   shorthand for a square box — the minimap
 * @param w,h    the box, when it is not square
 * @param pad    gap from the pane's edges
 * @param hint   height to leave clear at the very bottom of the screen
 * @param inner  hug the seam (a map) or the outside (the maths board)
 * @returns {{ left: number, top: number }} CSS page coordinates, top-left origin
 */
export function mapSpot({ v, W, H, size, w = size, h = size, pad = 14, hint = 0, inner = true }) {
  const fullW = v.w >= W - 2;
  const fullH = v.h >= H - 2;
  const left = v.x;
  const right = v.x + v.w;
  /* Viewport coords count up from the bottom and CSS counts down from the top.
     Getting this inversion wrong does not look broken — it looks like the map
     belongs to the pane above or below, which is the one failure split-screen
     HUD geometry exists to prevent. */
  const cssTop = H - v.y - v.h;
  const cssBottom = H - v.y;

  /* A FULL-WIDTH PANE HAS NO INSIDE ON THIS AXIS, so the two boxes take an end
     each — map right, board left. That is the arrangement the unsplit screen
     has always had (the board owns bottom-left and the map goes the other
     side), so a stacked split and a shared screen put them in the same places
     rather than in two different ones. Without it both hug the left edge and
     the board is drawn straight through the map, which is a corner-case only a
     horizontal split reaches and which nothing on screen would explain. */
  const onLeft = left + v.w / 2 < W / 2;
  const hugRight = fullW ? inner : (inner ? onLeft : !onLeft);

  const onTop = cssTop + v.h / 2 < H / 2;
  /* The board never leaves the bottom of its pane; only the map crosses to the
     top edge of a pane sitting under the seam. */
  const hugTop = inner && !fullH && !onTop;
  const bottomIsScreen = fullH || !onTop;

  return {
    left: hugRight ? right - pad - w : left + pad,
    top: hugTop ? cssTop + pad
      : cssBottom - pad - (bottomIsScreen ? hint : 0) - h,
  };
}

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
