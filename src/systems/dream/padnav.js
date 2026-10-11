/* ---------------------------------------------------------------------------
   THE WAY TO HER TUBE — a path round what is standing on Lionheart's pad.

   Richard: "Currently, when the player is walking to the tubes automatically,
   they tend to get stuck on the environment, mainly the omni-directional
   treadmills. We should try to use some A* path finding, or some simple
   pathfinding navigation so that players avoid running and getting stuck on
   the obstacles in the environment. Since we are just using this to
   automatically walk the player to the tubes, we don't need anything too
   complex, so can manually show the points that the player can get stuck on
   and have the player automatically avoid the points they can get stuck on
   and navigate around the obstacles, which currently mainly is just the
   treadmills in the Dream Dojo island but also add points to navigate around
   for any other collision potential hazards in the island."

   The walk was a stick pointed straight at the tube (`DreamDojo` phase
   'walk'). A straight line from the racks to tube 1 or 2 runs through a
   treadmill, and `World.resolveSolids` pushes a body out of a circle along
   the line from its centre — walked at dead centre, that push is straight
   back at her, and she runs on the spot.

   THE OBSTACLES ARE NOT TYPED IN. They are the same circles collision uses
   (`world.solids` on the pad: racks, treadmills, sword stand, rifles, tracker,
   Lionheart), plus the OTHER kittens' tubes, which are glass a kitten should
   not be walked through even though nothing stops her. So a prop that moves,
   or a new one with a solid, is avoided without this file knowing. The debug
   panel's *show the Dream Dojo walk paths* draws them, inflated by her body,
   with the path she is on (`DreamDojo._drawNav`).

   A GRID, A*, AND THEN THE CORNERS PULLED STRAIGHT. Half-unit cells over the
   pad (a 14-unit disc is ~3,000 of them, a millisecond), eight ways with no
   corner cutting, then every waypoint that can see past the next one drops
   it — a path that only turns where it must. Pure, so world-check walks it.
--------------------------------------------------------------------------- */

export const NAV = {
  /** Cell size, units. */
  cell: 0.5,
  /** Her body, plus a margin: a solid is grown by this much. A kitten's
   *  collision radius is about 0.6. */
  body: 0.85,
  /** Kept this far inside the pad's edge (the railing). */
  edge: 1.2,
  /** Close enough to a waypoint to move on to the next. */
  reach: 0.7,
};

/** Does the segment a-b pass within `r` of point c? */
function segHits(ax, az, bx, bz, cx, cz, r) {
  const dx = bx - ax;
  const dz = bz - az;
  const L2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cz - az) * dz) / L2));
  const px = ax + dx * t - cx;
  const pz = az + dz * t - cz;
  return px * px + pz * pz < r * r;
}

/**
 * The pad's walkable map: which half-unit cells a kitten's middle may stand in.
 * @param pad { x, z, r } — the pad's centre and radius.
 * @param obstacles [{ x, z, r }] — circles, before her body is added.
 */
export function navGrid(pad, obstacles, o = NAV) {
  const n = Math.ceil((pad.r * 2) / o.cell) + 1;
  const x0 = pad.x - pad.r;
  const z0 = pad.z - pad.r;
  const free = new Uint8Array(n * n);
  const grown = obstacles.map((s) => ({ x: s.x, z: s.z, r: s.r + o.body }));
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * o.cell;
      const z = z0 + j * o.cell;
      if (Math.hypot(x - pad.x, z - pad.z) > pad.r - o.edge) continue;
      if (grown.some((s) => (x - s.x) ** 2 + (z - s.z) ** 2 < s.r * s.r)) continue;
      free[j * n + i] = 1;
    }
  }
  return { n, x0, z0, free, pad, grown, o };
}

/** Can a kitten walk straight from a to b? Inside the pad, past every circle. */
export function clearLine(G, a, b) {
  if (G.grown.some((s) => segHits(a.x, a.z, b.x, b.z, s.x, s.z, s.r))) return false;
  const lim = G.pad.r - G.o.edge;
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / G.o.cell) + 1;
  for (let k = 0; k <= steps; k++) {
    const u = k / steps;
    if (Math.hypot(a.x + (b.x - a.x) * u - G.pad.x, a.z + (b.z - a.z) * u - G.pad.z) > lim + 0.05) return false;
  }
  return true;
}

/** The free cell nearest (x, z) — where a start or an end inside a circle goes. */
function nearestFree(G, x, z) {
  const ci = Math.round((x - G.x0) / G.o.cell);
  const cj = Math.round((z - G.z0) / G.o.cell);
  for (let rad = 0; rad < G.n; rad++) {
    let best = -1;
    let bd = Infinity;
    for (let j = cj - rad; j <= cj + rad; j++) {
      for (let i = ci - rad; i <= ci + rad; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== rad) continue;
        if (i < 0 || j < 0 || i >= G.n || j >= G.n || !G.free[j * G.n + i]) continue;
        const d = (i - ci) ** 2 + (j - cj) ** 2;
        if (d < bd) { bd = d; best = j * G.n + i; }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

/**
 * The way from `from` to `to`, as waypoints ending AT `to` — or null if
 * there is none (then the caller walks straight, as it always did).
 */
export function navPath(G, from, to) {
  if (clearLine(G, from, to)) return [{ x: to.x, z: to.z }];
  const { n, free } = G;
  const s = nearestFree(G, from.x, from.z);
  const e = nearestFree(G, to.x, to.z);
  if (s < 0 || e < 0) return null;
  const ex = e % n;
  const ez = (e / n) | 0;
  const h = (k) => {
    const dx = Math.abs((k % n) - ex);
    const dz = Math.abs(((k / n) | 0) - ez);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  const g = new Float32Array(n * n).fill(Infinity);
  const came = new Int32Array(n * n).fill(-1);
  const shut = new Uint8Array(n * n);
  // A binary heap would be quicker; a few thousand cells do not need one.
  const open = [s];
  g[s] = 0;
  const f = new Float32Array(n * n).fill(Infinity);
  f[s] = h(s);
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (f[open[k]] < f[open[bi]]) bi = k;
    const c = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (c === e) break;
    if (shut[c]) continue;
    shut[c] = 1;
    const ci = c % n;
    const cj = (c / n) | 0;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= n || j >= n) continue;
        const k = j * n + i;
        if (!free[k] || shut[k]) continue;
        // No cutting a corner past a blocked cell.
        if (di && dj && (!free[cj * n + i] || !free[j * n + ci])) continue;
        const ng = g[c] + (di && dj ? Math.SQRT2 : 1);
        if (ng < g[k]) {
          g[k] = ng;
          f[k] = ng + h(k);
          came[k] = c;
          open.push(k);
        }
      }
    }
  }
  if (came[e] < 0 && e !== s) return null;
  const cells = [];
  for (let k = e; k >= 0; k = came[k]) { cells.push(k); if (k === s) break; }
  cells.reverse();
  const pts = cells.map((k) => ({ x: G.x0 + (k % n) * G.o.cell, z: G.z0 + ((k / n) | 0) * G.o.cell }));
  pts.push({ x: to.x, z: to.z });
  // Pull the corners straight: from each kept point, the furthest one it can see.
  const out = [];
  let at = from;
  let i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !clearLine(G, at, pts[j])) j--;
    out.push(pts[j]);
    at = pts[j];
    i = j + 1;
  }
  return out;
}

/** The circles on the pad a kitten walking to tube `mine` must go round. */
export function padObstacles(solids, pad, tubes, mine, tubeR) {
  const near = (solids ?? []).filter((s) => !s.off && Math.hypot(s.x - pad.x, s.z - pad.z) < pad.r + 1);
  const glass = tubes.filter((_, k) => k !== mine).map((t) => ({ x: t.x, z: t.z, r: tubeR + 0.3 }));
  return [...near, ...glass];
}
