/* ---------------------------------------------------------------------------
   THE FISH TABLE — what swims in her koi pond. The fishing itself is in
   the world now (angling.js); it was a card with a canvas, which is what
   the rest of this note describes, and the card is gone.

   FISHING — Ocarina of Time's fishing pond, in her pane, at her koi pond.

   It is a card that plays a game (`drive` takes her whole pad; START still
   closes, like every card). Four beats, the four OoT has:

     AIM    a power bar swings; JUMP casts. Further is deeper is bigger fish.
     WAIT   the lure sits; nudge the stick to twitch it, which is what makes
            a fish come and look. Big ones are shy: twitch too much and they go.
     BITE   the float dips — JUMP inside the window to set the hook.
     REEL   hold JUMP to reel. The fish pulls; the line's tension climbs while
            you reel against it and falls when you let go. Over the top and the
            line snaps. Bring it in to land it.

   A caught fish is weighed, set against the RECORD BOARD (the biggest of each
   kind, and who caught it — kept in the homes store, so it outlives a game),
   and sold to Roshi for points by weight. NOTHING IS LOST BY FAILING: a
   snapped line is a fish that swam away, and the next cast is free.

   The pond is not the koi. Nobody fishes her pets; these are wild fish that
   visit the pond (a kid would ask, and that is the answer).
--------------------------------------------------------------------------- */

export const FISH = [
  { id: 'ayu', name: 'AYU', min: 0.3, max: 1.2, depth: 0.0, weight: 5, colour: '#9fc4a8' },
  { id: 'yamame', name: 'YAMAME TROUT', min: 0.8, max: 2.5, depth: 0.25, weight: 4, colour: '#c7a7d8' },
  { id: 'carp', name: 'WILD CARP', min: 2, max: 7, depth: 0.45, weight: 3, colour: '#c99a5a' },
  { id: 'namazu', name: 'NAMAZU CATFISH', min: 5, max: 14, depth: 0.65, weight: 2, colour: '#6e6a5a' },
  { id: 'lunker', name: 'HYLIAN LOACH', min: 12, max: 25, depth: 0.85, weight: 0.4, colour: '#e9c46a', rare: true },
];

/** Points per pound, as a fraction of one orb's price. */
export const FISH_VALUE = 0.01;

export function rollFish(depth, rng = Math.random) {
  const pool = FISH.filter((f) => f.depth <= depth + 0.05);
  const total = pool.reduce((a, f) => a + f.weight, 0);
  let r = rng() * total;
  let pick = pool[0];
  for (const f of pool) { r -= f.weight; if (r <= 0) { pick = f; break; } }
  // the bigger end of the range only from the deep end
  const k = Math.min(1, rng() * (0.5 + depth));
  const lb = pick.min + (pick.max - pick.min) * k;
  return { fish: pick, lb: Math.round(lb * 10) / 10 };
}
