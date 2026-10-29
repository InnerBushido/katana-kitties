/* ---------------------------------------------------------------------------
   Z-FIGHTING, FOUND BY GEOMETRY. Richard, Oct 2026: "windows are z-fighting
   with the hole cut in the wall ... avoid z-fighting at all costs in all
   housing related things (roof, doors, windows, ceiling, etc.), and double
   check it when the house is modified".

   Two faces fight when they lie in one plane, FACE THE SAME WAY, and overlap
   with area: the depth buffer cannot tell them apart and the pixel flickers
   between the two colours. Opposite-facing faces in one plane are the inside
   of two boxes touching, and nothing ever sees both. So: every part that is
   an axis-aligned box (each vertex on its own bounding box), each of its six
   faces against every other box's face on the same side, and a fight is a
   shared plane with more than a sliver of shared area — and NOT buried: a
   face is let off when a third box swallows the overlap, because then it is
   inside a solid and never drawn. Rotated parts (the ramp, roofs) are not
   boxes and are not asked about.
--------------------------------------------------------------------------- */

const EPS = 1e-4;
const AREA = 0.004;   // a sliver under 6.3 cm square is a seam, not a flicker

/** The AABB of an axis-aligned box part, or null if the part is anything else. */
export function boxOf(geo) {
  const p = geo.attributes?.position;
  if (!p) return null;
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  const lo = [b.min.x, b.min.y, b.min.z], hi = [b.max.x, b.max.y, b.max.z];
  for (let i = 0; i < p.count; i++) {
    const v = [p.getX(i), p.getY(i), p.getZ(i)];
    for (let a = 0; a < 3; a++) if (Math.abs(v[a] - lo[a]) > EPS && Math.abs(v[a] - hi[a]) > EPS) return null;
  }
  return { lo, hi };
}

/** Every same-facing coplanar overlap among `geos`, as `{ a, b, axis, side, area }`. */
export function zFights(geos, ignore = null) {
  const B = geos.map(boxOf).map((b, i) => b && { ...b, i }).filter(Boolean);
  const out = [];
  for (let axis = 0; axis < 3; axis++) {
    const [u, v] = [0, 1, 2].filter((k) => k !== axis);
    for (const side of [0, 1]) {
      const at = (b) => (side ? b.hi[axis] : b.lo[axis]);
      const sorted = [...B].sort((p, q) => at(p) - at(q));
      for (let m = 0; m < sorted.length; m++) {
        for (let n = m + 1; n < sorted.length && at(sorted[n]) - at(sorted[m]) < EPS; n++) {
          const A = sorted[m], C = sorted[n];
          const u0 = Math.max(A.lo[u], C.lo[u]), u1 = Math.min(A.hi[u], C.hi[u]);
          const v0 = Math.max(A.lo[v], C.lo[v]), v1 = Math.min(A.hi[v], C.hi[v]);
          if (u1 - u0 <= EPS || v1 - v0 <= EPS) continue;
          const area = (u1 - u0) * (v1 - v0);
          if (area < AREA) continue;
          // buried: a third box covers the overlap from the face outward
          const plane = at(A);
          const buried = B.some((X) => X !== A && X !== C
            && X.lo[u] <= u0 + EPS && X.hi[u] >= u1 - EPS && X.lo[v] <= v0 + EPS && X.hi[v] >= v1 - EPS
            && (side ? X.lo[axis] <= plane + EPS && X.hi[axis] > plane + EPS : X.hi[axis] >= plane - EPS && X.lo[axis] < plane - EPS));
          const f = { a: A.i, b: C.i, axis: 'xyz'[axis], side: side ? '+' : '-', plane: +plane.toFixed(3), area: +area.toFixed(3) };
          if (!buried && !ignore?.(f)) out.push(f);
        }
      }
    }
  }
  return out;
}
