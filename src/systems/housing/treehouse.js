import * as THREE from 'three';
import { toonVertexMat, paint } from '../../core/gfx.js';
import { mergeParts, xrayStrength, PALETTE } from '../../world/build.js';

/* ---------------------------------------------------------------------------
   THE TREEHOUSE — a little climbing level, not a prop.

   Richard, Oct 2026: the treehouse "should be fully implemented with
   collisions and xray shader so that player can land on top of the treehouse
   and go inside it and run on branches, let's spend a bit more time fleshing
   out the treehouse to be more fun and interesting with many tree branches
   and bridges connecting between trees, can have a lot of verticality".

   FOUR TREES, FOUR PLATFORMS AT FOUR HEIGHTS, AND THE WAYS BETWEEN THEM:

        ground ──spiral──▶ A (4) ──rope──▶ B (8) ──rope──▶ C (12, the cabin)
                             └───rope──▶ D (6) ── branches ──┘      │
        ground ◀──── the helter-skelter slide ──── roof (15.7) ◀── crates

   Every way up is something a kitten already knows how to do: a stair is a
   deck with a slope (the house's stairs), a rope bridge is a long thin deck
   with a sag, and a branch is a short deck to JUMP to. The steps between
   branches are at most 2.2 — measured against Player's own jump (JUMP_V
   11.2 under GRAVITY 26 is a 2.41 hop), so every branch is reachable with
   ONE jump and the double jump is a margin, not a requirement.

   THE CABIN IS A ROOM: four walls with a door, on the isle's x-ray material
   (`I.wallMat`) so the cut that follows her in the house follows her in
   here too, and a flat roof that is itself a deck — "land on top of the
   treehouse".

   ALL OF IT IS DATA IN THE TREEHOUSE'S OWN FRAME, handed back as decks
   (with a `frame` so they can sit at any angle — HomeIsle.heightAt reads
   it), walls (house-local segments with a height range) and trunks
   (obstacles). The caller places it.
--------------------------------------------------------------------------- */

const TRUNKS = [
  { x: -6, z: -4, r: 0.9, h: 15, crown: 0xf6b5cf },
  { x: 6.5, z: -4.5, r: 0.85, h: 17, crown: 0x6fae5a },
  { x: 4.5, z: 6, r: 1.1, h: 21, crown: 0xf6b5cf },
  { x: -5.5, z: 5.5, r: 0.8, h: 14, crown: 0x8cc06a },
];
/** Platforms: square, round their trunk. y is the walking surface. */
const PLAT = [
  { t: 0, y: 4, w: 5 },
  { t: 1, y: 8, w: 5 },
  { t: 2, y: 12, w: 8.5 },
  { t: 3, y: 6, w: 4.5 },
];
/** Rope bridges between platforms (by index), edge to edge. */
const ROPES = [[0, 1], [1, 2], [0, 3]];
/** Branches: [trunk, angle, length, height]. Short decks off a trunk to jump along. */
const BRANCHES = [
  // D's two make the back way up to the cabin: 6 → 8 → 10.2 → C's edge at 12
  [3, 0.4, 4.2, 8.0],
  [3, 1.45, 4.6, 10.2],
  // B's and A's are lookouts — dead ends, which is what a kid wants a branch to be
  [1, 1.6, 4.0, 10.1],
  [1, 2.8, 3.4, 12.1],
  [0, -1.0, 3.8, 6.2],
];
/* THE CABIN GREW AND THE TRUNK THROUGH IT THINNED. Richard, Oct 2026: "there
   is a house on the top and the tree trunk is going through it and the player
   cant get in or walk around it, should either make the house bigger or maybe
   make the tree trunk smaller in this part of the tree house. Could have the
   tree trunk under the house be big and then above the house be thinner." It
   was a 5 x 5 room with a trunk 1.1 across its middle — a collider that, being
   a circle with no height, was solid at EVERY height — so a kitten 1.5 wide had
   0.6 either side of it. Both now: 6 x 6 on a platform 8.5 wide, and the trunk
   is full width up to the cabin's floor (`TRUNK_MAST`) and a mast 0.36 across
   from there up through the roof. The trunk's collider is two, by height. */
const CABIN = { w: 6, d: 6, h: 3.4, door: 1.8 };
/** The cabin tree, from its floor up: the radius of the mast it becomes. */
const TRUNK_MAST = 0.36;
/* THE WAY UP IS A SPIRAL ROUND A POST, AND THE QUICK WAY DOWN IS A SLIDE.
   There was a straight ramp off A's +x edge, and it ran out underneath the
   rope bridge from A to B — the two shared a line on the ground. Richard, Oct
   2026: "Consider removing the ramp on the ground as it is intersecting with
   the bridges, or move it somewhere where it is not interfering, can build
   like a circular spiraling bridge instead that connects better, or can make
   it a slide instead that players can ride down." So both: the stair turns
   once round its own post south of A, where no rope passes over it (the A-B
   rope's hand rope is at z -5.07; the stair's rail stops at -5.95), and
   steps off radially onto A's corner. The slide leaves D's east edge and
   curls down into the open middle of the four trees, under nothing lower
   than D's 10.2 branch. `tools/checks/housing.mjs` measures the clearances.
   `turns` is under one so the stair never passes under itself. */
const SPIRAL = { x: -1.2, z: -8.5, r: 1.8, w: 1.5, turns: 0.92, n: 14, onto: { x: -4.2, z: -5.4 } };
/* THE SLIDE STARTS AT THE TOP NOW, AND IT IS A HELTER-SKELTER. Richard, Oct
   2026: "there is a slide but the player cant enter the slide from the top.
   Maybe we can move the slide higher to the top so that player can ride it
   longer and can have it spiral more throughout the environment." It left
   D's edge at 6 and was a quarter turn; now it leaves the cabin's ROOF
   (15.7, the lookout the crates climb to) through a gap in the roof rail, runs
   `lead` straight out over C's corner and turns `turns` times round a pole in
   the open middle of the four trees, into a flat `run` that is NOT a slide,
   so she skids to a stop on her own feet. The drop is (1 - s/L)^pow of the
   roof's height: steepest at the top, flat where it meets the run.
   The middle was measured clear of everything (housing.mjs checks it): the
   ring's outside edge is 3.67 from the pole, D's corner 3.84, A's 4.42, the
   three ropes further, and C's corner — the one thing over the ring — is
   7.7 above the second time round. */
const SLIDE = { cx: 0, cz: 1.2, R: 2.8, w: 1.5, turns: 1.5, flat: 0.7, run: 2.6, n: 36, pow: 1.15 };

/**
 * The slide's path in the treehouse's frame: marks `{x, z, y}` from the roof's
 * edge to the end of the run, and which of the stretches between them RIDE
 * (`ride[k]` for the stretch k → k+1). Pure, so the check walks the same line.
 */
export function slidePath() {
  const S = SLIDE;
  const C = PLAT[2];
  const TC = TRUNKS[C.t];
  const top = C.y + CABIN.h + 0.3;
  // the roof's south edge (-z), where the rail has its gap — see the cabin below
  const z0 = TC.z + 0.6 - CABIN.d / 2 - 0.3 + 0.25;
  const x = S.cx + S.R;
  const lead = z0 - S.cz;
  const th0 = Math.PI / 2;
  const arc = S.turns * Math.PI * 2 * S.R;
  const L = lead - S.flat + arc;
  const yOf = (s) => top * Math.pow(1 - Math.min(1, s / L), S.pow) + 0.12 * Math.min(1, s / L);
  const marks = [{ x, z: z0, y: top }, { x, z: z0 - S.flat, y: top }];
  const ride = [false];
  const nl = 3;
  for (let k = 1; k <= nl; k++) {
    const d = S.flat + ((lead - S.flat) * k) / nl;
    marks.push({ x, z: z0 - d, y: yOf(d - S.flat) });
    ride.push(true);
  }
  for (let k = 1; k <= S.n; k++) {
    const u = k / S.n;
    const th = th0 + u * S.turns * Math.PI * 2;
    marks.push({ x: S.cx + Math.sin(th) * S.R, z: S.cz + Math.cos(th) * S.R, y: yOf(lead - S.flat + u * arc) });
    ride.push(true);
  }
  // the run: straight on along the last tangent, flat
  const a = marks[marks.length - 2], b = marks[marks.length - 1];
  const tl = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  marks.push({ x: b.x + ((b.x - a.x) / tl) * S.run, z: b.z + ((b.z - a.z) / tl) * S.run, y: 0.12 });
  ride.push(false);
  return { marks, ride, top };
}

/** Parent coordinates of a point in a frame at (ox, oz) turned by `a`. */
function out(ox, oz, a, fx, fz) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: ox + fx * c + fz * s, z: oz - fx * s + fz * c };
}

/**
 * Build it.
 *
 * @param {(x:number,z:number)=>{x:number,z:number}} toHouse  treehouse-local → house-local
 * @param {number} rot      the treehouse's turn in the house frame
 * @param {number} y0       its ground, relative to the isle's groundY
 * @param {THREE.Material} wallMat  the isle's x-ray material
 * @returns {{ group: THREE.Group, decks: object[], walls: object[], trunks: {x,z,r}[], top: number }}
 *   decks/walls in HOUSE-LOCAL coordinates (decks carry a frame); trunks too.
 */
export function buildTreehouse(toHouse, rot, y0, mats) {
  /* `mats` is the isle's x-ray materials, `{ wall, tree }`; a bare material
     is the old call, the wall's alone. */
  const M = mats?.isMaterial ? { wall: mats } : (mats ?? {});
  const group = new THREE.Group();
  const wood = [];
  const leaf = [];
  const slide = [];
  const decks = [];
  const walls = [];
  const trunks = [];
  const box = (w, h, d, c, x, y, z, ry = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    paint(g, c);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    return g;
  };
  /** A deck on a rectangle in a sub-frame of the treehouse (centre, turn). */
  const deck = (cx, cz, a, x0, x1, z0, z1, y, extra = {}) => {
    const o = toHouse(cx, cz);
    // yAt is written in the treehouse's heights; the deck answers in the isle's
    const f = extra.yAt;
    decks.push({ x0, x1, z0, z1, y: y0 + y, step: 0.5, ...extra, yAt: f ? (x, z) => y0 + f(x, z) : undefined, frame: { x: o.x, z: o.z, a: rot + a } });
  };
  /** ONE ROPE through `pts` ({x, y, z}): a tube along a smooth curve, so it
   *  has no joints to see. Boxes end to end — the first rope rails — showed
   *  a kink and a seam at every one. */
  const rope = (pts, rad = 0.055, c = 0xd8c08a) => {
    if (pts.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p.x, p.y, p.z)), false, 'centripetal');
    const g = new THREE.TubeGeometry(curve, Math.max(6, pts.length * 3), rad, 5, false);
    paint(g, c);
    wood.push(g);
  };
  /** A post driven into the deck: round, a hair narrower at the top, with a
   *  lashing where each rope passes. */
  const stake = (x, y, z, h, lean = null) => {
    const g = new THREE.CylinderGeometry(0.06, 0.08, h, 6);
    paint(g, 0x5a3820);
    g.translate(0, h / 2, 0);
    if (lean) { g.rotateZ(lean.z ?? 0); g.rotateX(lean.x ?? 0); }
    g.translate(x, y, z);
    wood.push(g);
  };
  /** A ROPE RAIL along `pts` ({x, z, y} the deck under each post): a post at
   *  each, and TWO ropes — a hand rope and a knee rope — each one continuous
   *  from end to end, sagging between the posts. Richard, Oct 2026: "The
   *  railings on the staircases do not look very good, can we connect them and
   *  make them look more like connected ropes? Also, can stake them down". So
   *  the posts go 0.3 INTO the treads, and at the bottom the hand rope runs on
   *  past the last post and down to a stake in the ground (`stakeStart`), the
   *  way a rope rail is anchored. */
  const ropeRail = (pts, H = 1.1, { stakeStart = false } = {}) => {
    for (const p of pts) {
      stake(p.x, p.y - 0.3, p.z, H + 0.42);
      for (const h of [H, H * 0.5]) {
        const k = new THREE.TorusGeometry(0.1, 0.035, 4, 8);
        k.rotateX(Math.PI / 2);
        paint(k, 0xb89a62);
        k.translate(p.x, p.y + h, p.z);
        wood.push(k);
      }
    }
    for (const h of [H, H * 0.5]) {
      const line = [];
      for (let k = 0; k < pts.length; k++) {
        const a = pts[k];
        line.push({ x: a.x, y: a.y + h, z: a.z });
        const b = pts[k + 1];
        if (!b) break;
        const span = Math.hypot(b.x - a.x, b.z - a.z);
        const sag = Math.min(0.2, span * 0.12) * (h === H ? 1 : 0.7);
        for (const t of [0.33, 0.67]) {
          line.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t + h - Math.sin(t * Math.PI) * sag });
        }
      }
      rope(line);
    }
    if (stakeStart && pts.length > 1) {
      // on along the line it came up by, down to a stake 1.4 out, leaning back from the pull
      const a = pts[0], b = pts[1];
      const L = Math.hypot(a.x - b.x, a.z - b.z) || 1;
      const ux = (a.x - b.x) / L, uz = (a.z - b.z) / L;
      const s = { x: a.x + ux * 1.4, z: a.z + uz * 1.4, y: a.y };
      stake(s.x, s.y - 0.25, s.z, 0.75, { z: -ux * 0.35, x: uz * 0.35 });
      rope([{ x: a.x, y: a.y + H, z: a.z }, { x: a.x + ux * 0.75, y: a.y + H * 0.45, z: a.z + uz * 0.75 }, { x: s.x, y: s.y + 0.42, z: s.z }]);
    }
  };
  /** A plank from a to b ({x, z, y}), `w` wide, tipped to the slope. */
  const plank = (list, a, b, w, t, c) => {
    const run = Math.hypot(b.x - a.x, b.z - a.z);
    const g = new THREE.BoxGeometry(w, t, Math.hypot(run, b.y - a.y) + 0.04);
    paint(g, c);
    g.rotateX(-Math.atan2(b.y - a.y, run));
    g.rotateY(Math.atan2(b.x - a.x, b.z - a.z));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2 - t / 2, (a.z + b.z) / 2);
    list.push(g);
  };
  /** A deck from a to b ({x, z, y}), `w` wide, its height running straight
   *  between the two — a stair flight or a stretch of slide. */
  const chord = (a, b, w, extra = {}) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const ang = Math.atan2(b.x - a.x, b.z - a.z);
    deck(a.x, a.z, ang, -w / 2, w / 2, -0.05, len + 0.05, Math.max(a.y, b.y), {
      yAt: (x, z) => a.y + (b.y - a.y) * Math.min(1, Math.max(0, z / len)),
      step: 0.6,
      ...extra,
    });
  };
  /** A wall from treehouse-local a to b, from y to y + h above its ground. */
  const wall = (ax, az, bx, bz, y, h) => {
    const A = toHouse(ax, az);
    const B = toHouse(bx, bz);
    walls.push({ ax: A.x, az: A.z, bx: B.x, bz: B.z, y0: y0 + y, y1: y0 + y + h, rail: h < 1.5 });
  };

  // ---- trunks and crowns
  const cabinT = PLAT[2].t;
  for (const [ti, T] of TRUNKS.entries()) {
    /* The cabin's tree is full width only up to the cabin's floor, and a mast
       from there (see CABIN): a collar where it narrows, so it reads as one
       tree that the floor was built round. */
    const floorY = ti === cabinT ? PLAT[2].y : null;
    const lowH = floorY ?? T.h;
    const g = new THREE.CylinderGeometry(T.r * (floorY ? 0.95 : 0.75), T.r * 1.25, lowH, 9);
    paint(g, 0x6a4428);
    g.translate(T.x, lowH / 2, T.z);
    wood.push(g);
    if (floorY) {
      const m = new THREE.CylinderGeometry(TRUNK_MAST * 0.8, TRUNK_MAST, T.h - floorY + 0.4, 8);
      paint(m, 0x6a4428);
      m.translate(T.x, floorY - 0.4 + (T.h - floorY + 0.4) / 2, T.z);
      wood.push(m);
      const collar = new THREE.CylinderGeometry(TRUNK_MAST + 0.12, T.r * 0.95, 0.5, 9);
      paint(collar, 0x5a3820);
      collar.translate(T.x, floorY + 0.05, T.z);
      wood.push(collar);
    }
    // roots, so it stands in the ground rather than on it
    for (let k = 0; k < 4; k++) {
      const a = k * 1.7 + T.x;
      wood.push(box(0.5, 0.5, 2.2, 0x5a3820, T.x + Math.sin(a) * 1.1, 0.2, T.z + Math.cos(a) * 1.1, a));
    }
    for (let k = 0; k < 3; k++) {
      const s = new THREE.SphereGeometry(3.4 - k * 0.6, 12, 9);
      s.scale(1, 0.62, 1);
      paint(s, T.crown);
      s.translate(T.x + Math.sin(k * 2.1) * 1.4, T.h + k * 1.0 - 0.4, T.z + Math.cos(k * 2.1) * 1.4);
      leaf.push(s);
    }
    const o = toHouse(T.x, T.z);
    /* A trunk with a height range: `y0`/`y1` in the isle's heights, as
       walls are (Housing._obstacles skips one she is above or below). */
    if (floorY) {
      trunks.push({ x: o.x, z: o.z, r: T.r, y1: y0 + floorY - 0.05 });
      trunks.push({ x: o.x, z: o.z, r: TRUNK_MAST + 0.06, y0: y0 + floorY - 0.6 });
    } else trunks.push({ x: o.x, z: o.z, r: T.r });
  }

  // ---- platforms, with a rail round each and a gap where a way in arrives
  const edgePoint = (P, toward) => {
    const T = TRUNKS[P.t];
    const dx = toward.x - T.x, dz = toward.z - T.z;
    const m = Math.max(Math.abs(dx), Math.abs(dz)) || 1;
    return { x: T.x + (dx / m) * (P.w / 2), z: T.z + (dz / m) * (P.w / 2) };
  };
  for (const P of PLAT) {
    const T = TRUNKS[P.t];
    wood.push(box(P.w, 0.35, P.w, PALETTE.wood, T.x, P.y - 0.175, T.z));
    // planks, so it reads as a deck and not a slab
    for (let k = 0; k < 5; k++) wood.push(box(P.w, 0.04, 0.08, 0x5a3820, T.x, P.y + 0.01, T.z - P.w / 2 + (k + 0.5) * (P.w / 5)));
    // braces down to the trunk
    for (const s of [-1, 1]) wood.push(box(0.25, 2.2, 0.25, 0x5a3820, T.x + s * P.w * 0.3, P.y - 1.2, T.z, 0));
    deck(T.x, T.z, 0, -P.w / 2, P.w / 2, -P.w / 2, P.w / 2, P.y);
  }

  // ---- the spiral stair from the ground up to A (see SPIRAL)
  {
    const S = SPIRAL;
    const top = PLAT[0].y;
    const ux = S.onto.x - S.x, uz = S.onto.z - S.z;
    const ul = Math.hypot(ux, uz);
    const end = Math.atan2(ux, uz);
    // t = 0 at the ground, 1 at the top; it climbs with the angle falling
    const at = (t, r = S.r) => {
      const a = end + Math.PI * 2 * S.turns * (1 - t);
      return { x: S.x + Math.sin(a) * r, z: S.z + Math.cos(a) * r, y: top * t };
    };
    const rail = [];
    for (let k = 0; k < S.n; k++) {
      const a = at(k / S.n), b = at((k + 1) / S.n);
      chord(a, b, S.w, { part: 'stair' });
      plank(wood, a, b, S.w, 0.22, k % 2 ? 0x8a6a40 : 0x9a7848);
      // an arm from the post under each tread, so it hangs off something
      const m = at((k + 0.5) / S.n, S.r * 0.5);
      if (m.y > 0.6) wood.push(box(0.16, 0.16, S.r, 0x5a3820, m.x, m.y - 0.3, m.z, Math.atan2(m.x - S.x, m.z - S.z)));
      rail.push(at(k / S.n, S.r + S.w / 2 - 0.1));
      const o0 = at(k / S.n, S.r + S.w / 2 - 0.05), o1 = at((k + 1) / S.n, S.r + S.w / 2 - 0.05);
      if (k + 1 < S.n) wall(o0.x, o0.z, o1.x, o1.z, Math.min(o0.y, o1.y) - 0.3, Math.abs(o1.y - o0.y) + 1.6);
    }
    ropeRail(rail, 1.1, { stakeStart: true });
    // the post, up through the middle and a little past the top
    const pole = new THREE.CylinderGeometry(0.28, 0.36, top + 1.4, 9);
    paint(pole, 0x6a4428);
    pole.translate(S.x, (top + 1.4) / 2, S.z);
    wood.push(pole);
    const o = toHouse(S.x, S.z);
    trunks.push({ x: o.x, z: o.z, r: 0.36 });
    // and off the top, straight out onto A's corner
    const p0 = at(1);
    const p1 = { x: S.x + (ux / ul) * (ul + 0.4), z: S.z + (uz / ul) * (ul + 0.4), y: top };
    chord({ ...p0, x: p0.x - (ux / ul) * 0.5, z: p0.z - (uz / ul) * 0.5 }, p1, S.w, { part: 'stair' });
    plank(wood, p0, p1, S.w, 0.22, 0x9a7848);
  }

  // ---- the helter-skelter from the cabin's roof down round a pole (see SLIDE)
  {
    const S = SLIDE;
    const { marks, ride, top } = slidePath();
    const side = (p, q, s) => {
      // the chute's side, offset to one side of the run from p to q
      const L = Math.hypot(q.x - p.x, q.z - p.z) || 1;
      const nx = (q.z - p.z) / L, nz = -(q.x - p.x) / L;
      return [{ x: p.x + nx * s, z: p.z + nz * s, y: p.y }, { x: q.x + nx * s, z: q.z + nz * s, y: q.y }];
    };
    const lips = [[], []];
    for (let k = 0; k + 1 < marks.length; k++) {
      const a = marks[k], b = marks[k + 1];
      chord(a, b, S.w, ride[k] ? { slide: true, step: 0.8, part: 'slide' } : { part: 'slide' });
      plank(slide, a, b, S.w, 0.18, 0xe0503a);
      [-1, 1].forEach((s, i) => {
        const [p, q] = side(a, b, s * (S.w / 2 + 0.06));
        // a lip, so she rides IN it — and it is a wall, so she stays in it
        if (!k) lips[i].push({ x: p.x, z: p.z, y: p.y + 0.42 });
        lips[i].push({ x: q.x, z: q.z, y: q.y + 0.42 });
        wall(p.x, p.z, q.x, q.z, Math.min(p.y, q.y) - 0.2, Math.abs(q.y - p.y) + 0.9);
      });
      // legs to the ground under the OUTSIDE edge, every other joint off it
      if (a.y > 0.5 && k % 2 === 0) {
        const [p] = side(a, b, S.w / 2 - 0.1);
        const inner = Math.hypot(p.x - S.cx, p.z - S.cz) < S.R;
        if (!inner) wood.push(box(0.2, a.y, 0.2, 0x5a3820, p.x, a.y / 2, p.z));
      }
    }
    // the lips are ONE smooth rail each, not a plank per stretch — the turn is tight
    for (const L of lips) {
      const curve = new THREE.CatmullRomCurve3(L.map((p) => new THREE.Vector3(p.x, p.y, p.z)), false, 'centripetal');
      const g = new THREE.TubeGeometry(curve, L.length * 3, 0.13, 6, false);
      paint(g, 0xf2c14e);
      slide.push(g);
    }
    // the pole it turns round, with an arm out to the chute at every few joints
    const pole = new THREE.CylinderGeometry(0.26, 0.34, top + 0.6, 10);
    paint(pole, 0x6a4428);
    pole.translate(S.cx, (top + 0.6) / 2, S.cz);
    wood.push(pole);
    const cap = new THREE.ConeGeometry(0.7, 1.1, 10);
    paint(cap, 0xe0503a);
    cap.translate(S.cx, top + 1.1, S.cz);
    slide.push(cap);
    for (let k = 5; k + 1 < marks.length; k += 3) {
      const m = marks[k];
      if (m.y < 0.9) continue;
      const len = Math.hypot(m.x - S.cx, m.z - S.cz);
      wood.push(box(0.16, 0.16, len, 0x5a3820, (m.x + S.cx) / 2, m.y - 0.3, (m.z + S.cz) / 2, Math.atan2(m.x - S.cx, m.z - S.cz)));
    }
    const o = toHouse(S.cx, S.cz);
    trunks.push({ x: o.x, z: o.z, r: 0.4 });
  }

  // ---- rope bridges, sagging between their platforms
  for (const [i, j] of ROPES) {
    const P = PLAT[i], Q = PLAT[j];
    const a = edgePoint(P, TRUNKS[Q.t]);
    const b = edgePoint(Q, TRUNKS[P.t]);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const ang = Math.atan2(b.x - a.x, b.z - a.z);
    const ya = P.y, yb = Q.y;
    const yAt = (x, z) => {
      const t = Math.min(1, Math.max(0, z / len));
      return ya + (yb - ya) * t - Math.sin(t * Math.PI) * 0.45;
    };
    deck(a.x, a.z, ang, -0.9, 0.9, 0, len, Math.max(ya, yb), { yAt, step: 0.6, part: 'rope' });
    const n = Math.max(4, Math.round(len / 0.7));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const p = out(a.x, a.z, ang, 0, t * len);
      wood.push(box(1.8, 0.12, 0.5, k % 2 ? 0x8a6a40 : 0x9a7848, p.x, yAt(0, t * len) - 0.06, p.z, ang));
    }
    // the hand ropes — and they are rails, so nobody walks off the side.
    // One rope each (see `rope`), tied to a post at either end.
    for (const s of [-1, 1]) {
      const line = [];
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const p = out(a.x, a.z, ang, s * 0.95, t * len);
        line.push({ x: p.x, z: p.z, y: yAt(0, t * len) + 1.0 });
      }
      rope(line);
      for (const t of [0, 1]) {
        const p = out(a.x, a.z, ang, s * 0.95, t * len);
        stake(p.x, (t ? yb : ya) - 0.3, p.z, 1.45);
      }
      const A2 = out(a.x, a.z, ang, s * 0.95, 0.3);
      const B2 = out(a.x, a.z, ang, s * 0.95, len - 0.3);
      wall(A2.x, A2.z, B2.x, B2.z, Math.min(ya, yb) - 0.6, Math.abs(yb - ya) + 2.2);
    }
  }

  // ---- branches to jump along
  for (const [t, a, L, y] of BRANCHES) {
    const T = TRUNKS[t];
    const g = new THREE.BoxGeometry(1.3, 0.45, L);
    paint(g, 0x6a4428);
    g.translate(0, 0, T.r + L / 2);
    g.rotateY(a);
    g.translate(T.x, y - 0.22, T.z);
    wood.push(g);
    const tip = out(T.x, T.z, a, 0, T.r + L);
    const s = new THREE.SphereGeometry(1.2, 8, 6);
    s.scale(1, 0.55, 1);
    paint(s, TRUNKS[t].crown);
    s.translate(tip.x, y + 0.6, tip.z);
    leaf.push(s);
    deck(T.x, T.z, a, -0.65, 0.65, T.r - 0.2, T.r + L, y, { step: 0.35 });
  }

  // ---- the cabin on C, with a door toward B, and a roof you can stand on
  const C = PLAT[2];
  const TC = TRUNKS[C.t];
  const cab = [];
  {
    const hw = CABIN.w / 2, hd = CABIN.d / 2, y = C.y, H = CABIN.h;
    /* Off-centre so the door lines up with the rope from B, which lands at
       x ≈ TC.x + 0.7. The trunk goes up through the room — a tree through a
       treehouse — so a BRANCH off it to the roof would cross the walls; the
       way onto the roof is a stack of crates on the -x side instead. */
    const cx = TC.x + 0.6, cz = TC.z + 0.6;
    for (const [z, top] of [[cz - 1, y + 1.8], [cz + 1.2, y + 3.6]]) {
      const bx = cx - hw - 0.85;
      cab.push(box(1.4, top - y, 1.4, 0x9a7848, bx, (y + top) / 2, z));
      deck(bx, z, 0, -0.7, 0.7, -0.7, 0.7, top, { step: 0.3, part: 'crate' });
      /* AND SOLID. Richard: the x-ray "should work in the house and boxes
         and ensure they have colliders" — the crates were a lid and nothing
         else, so she walked into one and out of the other side. Four walls,
         as tall as the crate: from on top of it she is above them. */
      const e = 0.7;
      for (const [ax, az, bx2, bz] of [[-e, -e, e, -e], [e, -e, e, e], [e, e, -e, e], [-e, e, -e, -e]]) {
        wall(bx + ax, z + az, bx + bx2, z + bz, y, top - y);
      }
    }
    const W = (ax, az, bx, bz) => {
      const L = Math.hypot(bx - ax, bz - az);
      const along = Math.abs(bx - ax) > Math.abs(bz - az);
      cab.push(box(along ? L : 0.25, H, along ? 0.25 : L, 0xe8dcc0, cx + (ax + bx) / 2, y + H / 2, cz + (az + bz) / 2));
      wall(cx + ax, cz + az, cx + bx, cz + bz, y, H);
    };
    // the door is on -z (toward B, which is at -z from C)
    const g = CABIN.door / 2;
    W(-hw, -hd, -g, -hd);
    W(g, -hd, hw, -hd);
    cab.push(box(CABIN.door, H - 2.4, 0.25, 0xe8dcc0, cx, y + 2.4 + (H - 2.4) / 2, cz - hd));
    W(hw, -hd, hw, hd);
    W(hw, hd, -hw, hd);
    W(-hw, hd, -hw, -hd);
    // a round window each side, and posts
    for (const [px, pz] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) cab.push(box(0.35, H + 0.1, 0.35, 0x5a3820, cx + px, y + (H + 0.1) / 2, cz + pz));
    // the roof: a flat deck with a low rail — the lookout
    const ry = y + H;
    cab.push(box(CABIN.w + 0.6, 0.3, CABIN.d + 0.6, 0x8a3a2a, cx, ry + 0.15, cz));
    /* ...with a GAP in its south side where the slide leaves (see SLIDE):
       the rail is only drawn, so the gap is what says "the way in is here". */
    const RW = (CABIN.w + 0.6) / 2, RD = (CABIN.d + 0.6) / 2;
    const gx = SLIDE.cx + SLIDE.R - cx, gw = SLIDE.w / 2 + 0.15;
    const south = [[-RW, gx - gw], [gx + gw, RW]].filter(([a, b]) => b - a > 0.2);
    for (const [w, d, x, z] of [[RW * 2, 0.12, 0, RD], ...south.map(([a, b]) => [b - a, 0.12, (a + b) / 2, -RD]), [0.12, RD * 2, RW, 0], [0.12, RD * 2, -RW, 0]]) {
      cab.push(box(w, 0.6, d, 0x5a3820, cx + x, ry + 0.6, cz + z));
    }
    deck(cx, cz, 0, -hw - 0.3, hw + 0.3, -hd - 0.3, hd + 0.3, ry + 0.3, { step: 0.4 });
  }

  /* EVERYTHING ON THE X-RAY, not just the cabin. Richard: "Xray shader used
     to work on the treehouse, but seems to not be working anymore ... Also
     should work on the trees and bushes." The cabin's cut had not broken —
     measured, it opens round her as it always did — but it was the only
     thing on the material: the trunk that goes up THROUGH the room, the
     crowns over the roof and the platform over her head were plain toon, and
     from the camera's height those are what hide her. The crowns take the
     full cut; the wood a little less, since a trunk is narrow and a platform
     she is standing on is under her feet, which the cut never takes. */
  const treeMat = M.tree ?? toonVertexMat();
  const woodMesh = new THREE.Mesh(mergeParts(xrayStrength(wood, 0.85)), treeMat);
  const leafMesh = new THREE.Mesh(mergeParts(xrayStrength(leaf, 1)), treeMat);
  const slideMesh = new THREE.Mesh(mergeParts(xrayStrength(slide, 0.85)), treeMat);
  // the cabin on the house's own wall material, so she is never lost inside it
  const cabMesh = new THREE.Mesh(mergeParts(cab), M.wall ?? treeMat);
  group.add(woodMesh, leafMesh, slideMesh, cabMesh);
  return { group, decks, walls, trunks, top: C.y + CABIN.h + 0.3 };
}

/** For checks: the platforms and the top, in the treehouse's frame. */
export const TREEHOUSE_PLAN = { TRUNKS, PLAT, ROPES, BRANCHES, CABIN, SPIRAL, SLIDE, TRUNK_MAST };
