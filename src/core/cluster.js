/* ---------------------------------------------------------------------------
   WHO SHARES A PANE WITH WHOM.

   Pure arithmetic, no THREE and no DOM, exactly like `split.js` — which is what
   lets `tools/world-check.mjs` assert the properties that actually matter here,
   and they are properties rather than pixels: every player in exactly one
   group, no group lost, the two-player answer identical to the boolean it
   replaced, and a pair that has settled at the boundary not flickering between
   one pane and two.

   HANDOFF.md listed this as deliberately NOT built, with a reason: "cluster
   membership changing mid-flight strands the per-view lerp state, which is
   precisely the frozen-`sharedTarget` bug this file calls the whole fix for the
   jarring rejoin. If it is ever wanted, the camera identity has to be stable
   across a membership change before anything else."

   THAT IS WHY A GROUP IS NAMED BY ITS LOWEST MEMBER, and it is the whole design
   rather than a detail of the union-find. The caller keeps one camera rig per
   player index and draws a group with the rig belonging to its lowest member,
   so:

     - a group that gains or loses a member keeps the SAME rig, and its aim
       point moves by a lerp rather than being handed to a camera that has been
       sitting frozen somewhere else;
     - when {0,1,2} splits into {0,1} and {2}, rig 2 has been tracking player 2
       the whole time, because the caller updates EVERY rig every frame whether
       it is drawing or not — the same fix, for the same reason, as "THE SHARED
       CAMERA IS UPDATED EVERY FRAME, SPLIT OR NOT";
     - and identity cannot depend on membership, which is the trap: name a
       group by its centroid, its size, or the order it came out of a loop, and
       one player crossing the threshold renames every group on screen.

   SINGLE LINKAGE, NOT "EVERYBODY WITHIN RANGE OF EVERYBODY". A near B and B
   near C puts all three in one pane even when A and C are not close, and that
   is right: B can see both of them, and splitting the pair she is standing
   between into two panes would draw her twice. The alternative — requiring
   every pair in a group to be close — has no stable answer when three players
   stand in a line, because dropping any one of the three is equally valid and
   nothing says which.
--------------------------------------------------------------------------- */

/* THE TWO DISTANCES LIVE HERE NOW, with the code that is the only thing left
   reading them. They were consts in main.js next to a boolean that no longer
   exists, and a threshold sitting a thousand lines from its only use is a
   threshold somebody retunes without seeing what it does. The VALUES are
   untouched — every one of them was tuned by two girls playing, and the whole
   compatibility claim for this feature is that a pair of kittens joins and
   splits at exactly the distances it always did. */
export const MERGE_IN = 30;    // share a view when kittens are this close
export const MERGE_OUT = 46;   // and stop sharing it beyond this

/**
 * @param pts       one { x, z } per player, in slot order
 * @param solo      per player: true if she must have a pane to herself
 *                  (she is flying — see the caller)
 * @param prev      last frame's `of` array, or null. Only ever used to make an
 *                  existing pairing harder to break, never to create one.
 * @param mergeIn   link two players closer than this
 * @param mergeOut  keep an EXISTING link until they are further apart than this
 *
 * @returns { groups, of }
 *   groups — arrays of player indices, each sorted, the outer array sorted by
 *            first member so player 1's group is always the first pane
 *   of     — player index -> her group's lowest member. Feed it back as `prev`.
 */
export function clusterPlayers({ pts, solo = [], prev = null, mergeIn, mergeOut }) {
  const n = pts.length;
  const parent = Array.from({ length: n }, (_, i) => i);

  const find = (a) => {
    let r = a;
    while (parent[r] !== r) {
      parent[r] = parent[parent[r]];
      r = parent[r];
    }
    return r;
  };
  /* THE LOWER INDEX ALWAYS WINS THE UNION, which is what makes the root of a
     set its minimum member and therefore makes the group's NAME its lowest
     player. Union by rank or by size would be marginally faster over four
     elements and would hand the group a root that moves when somebody joins
     it — which is exactly the instability this whole file exists to avoid. */
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      /* A FLYING KITTEN IS ALWAYS ALONE. This is the existing `anyFlying` rule
         and not a new one — a gunner thirty units up is not "close to" her
         sister on the ground below, whatever the plan-view distance says. What
         changes at four players is that it now costs one pane instead of
         collapsing the whole screen: the two on the ground keep sharing. */
      if (solo[i] || solo[j]) continue;
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z);
      /* HYSTERESIS IS ONLY EVER STICKINESS. `prev` can hold a pair together out
         to `mergeOut`; it can never pull one together, or a group would be able
         to grow across a gap it was never allowed to close. */
      const wasTogether = prev != null && prev[i] != null && prev[i] === prev[j];
      if (d < mergeIn || (wasTogether && d < mergeOut)) union(i, j);
    }
  }

  const of = Array.from({ length: n }, (_, i) => find(i));
  const byRoot = new Map();
  for (let i = 0; i < n; i++) {
    const r = of[i];
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(i);
  }
  const groups = [...byRoot.keys()].sort((a, b) => a - b).map((r) => byRoot.get(r));
  return { groups, of };
}
