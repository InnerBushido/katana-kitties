import * as THREE from 'three';
import { toonVertexMat, paint } from '../../core/gfx.js';
import { mergeParts, PALETTE } from '../../world/build.js';

/* ---------------------------------------------------------------------------
   THE TREEHOUSE — a little climbing level, not a prop.

   Richard, Oct 2026: the treehouse "should be fully implemented with
   collisions and xray shader so that player can land on top of the treehouse
   and go inside it and run on branches, let's spend a bit more time fleshing
   out the treehouse to be more fun and interesting with many tree branches
   and bridges connecting between trees, can have a lot of verticality".

   FOUR TREES, FOUR PLATFORMS AT FOUR HEIGHTS, AND THE WAYS BETWEEN THEM:

        ground ──ramp──▶ A (4) ──rope──▶ B (8) ──rope──▶ C (12, the cabin)
                           └───rope──▶ D (6) ── branches ──┘      │
                                                   roof (15.7) ◀── crates

   Every way up is something a kitten already knows how to do: a ramp is a
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
  { t: 2, y: 12, w: 7 },
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
const CABIN = { w: 5, d: 5, h: 3.4, door: 1.8 };

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
export function buildTreehouse(toHouse, rot, y0, wallMat) {
  const group = new THREE.Group();
  const wood = [];
  const leaf = [];
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
  /** A wall from treehouse-local a to b, from y to y + h above its ground. */
  const wall = (ax, az, bx, bz, y, h) => {
    const A = toHouse(ax, az);
    const B = toHouse(bx, bz);
    walls.push({ ax: A.x, az: A.z, bx: B.x, bz: B.z, y0: y0 + y, y1: y0 + y + h, rail: h < 1.5 });
  };

  // ---- trunks and crowns
  for (const T of TRUNKS) {
    const g = new THREE.CylinderGeometry(T.r * 0.75, T.r * 1.25, T.h, 9);
    paint(g, 0x6a4428);
    g.translate(T.x, T.h / 2, T.z);
    wood.push(g);
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
    trunks.push({ x: o.x, z: o.z, r: T.r });
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

  // ---- the ramp from the ground up to A
  {
    const A = PLAT[0];
    const T = TRUNKS[A.t];
    const rise = A.y;
    const len = rise / 0.45;
    // runs out from A's +x edge, down toward +x
    const sx = T.x + A.w / 2;
    deck(sx, T.z, Math.PI / 2, -1.2, 1.2, 0, len, A.y, {
      yAt: (x, z) => A.y * (1 - Math.min(1, Math.max(0, z / len))),
      step: 0.7,
    });
    const g = new THREE.BoxGeometry(2.4, 0.3, Math.hypot(len, rise));
    paint(g, PALETTE.wood);
    g.rotateX(Math.atan2(rise, len));
    g.rotateY(Math.PI / 2);
    g.translate(sx + len / 2, rise / 2 - 0.15, T.z);
    wood.push(g);
    for (const s of [-1, 1]) {
      const r = new THREE.BoxGeometry(0.1, 0.1, Math.hypot(len, rise));
      paint(r, 0xc8a46a);
      r.rotateX(Math.atan2(rise, len));
      r.rotateY(Math.PI / 2);
      r.translate(sx + len / 2, rise / 2 + 0.9, T.z + s * 1.2);
      wood.push(r);
    }
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
    deck(a.x, a.z, ang, -0.9, 0.9, 0, len, Math.max(ya, yb), { yAt, step: 0.6 });
    const n = Math.max(4, Math.round(len / 0.7));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const p = out(a.x, a.z, ang, 0, t * len);
      wood.push(box(1.8, 0.12, 0.5, k % 2 ? 0x8a6a40 : 0x9a7848, p.x, yAt(0, t * len) - 0.06, p.z, ang));
    }
    // the hand ropes — and they are rails, so nobody walks off the side
    for (const s of [-1, 1]) {
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        const p0 = out(a.x, a.z, ang, s * 0.95, t0 * len);
        const p1 = out(a.x, a.z, ang, s * 0.95, t1 * len);
        const y = (yAt(0, t0 * len) + yAt(0, t1 * len)) / 2 + 1.0;
        const seg = new THREE.BoxGeometry(0.07, 0.07, len / n + 0.02);
        paint(seg, 0xd8c08a);
        seg.rotateY(ang);
        seg.translate((p0.x + p1.x) / 2, y, (p0.z + p1.z) / 2);
        wood.push(seg);
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
      cab.push(box(1.4, top - y, 1.4, 0x9a7848, cx - hw - 0.85, (y + top) / 2, z));
      deck(cx - hw - 0.85, z, 0, -0.7, 0.7, -0.7, 0.7, top, { step: 0.3 });
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
    for (const [w, d, x, z] of [[CABIN.w + 0.6, 0.12, 0, (CABIN.d + 0.6) / 2], [CABIN.w + 0.6, 0.12, 0, -(CABIN.d + 0.6) / 2], [0.12, CABIN.d + 0.6, (CABIN.w + 0.6) / 2, 0], [0.12, CABIN.d + 0.6, -(CABIN.w + 0.6) / 2, 0]]) {
      cab.push(box(w, 0.6, d, 0x5a3820, cx + x, ry + 0.6, cz + z));
    }
    deck(cx, cz, 0, -hw - 0.3, hw + 0.3, -hd - 0.3, hd + 0.3, ry + 0.3, { step: 0.4 });
  }

  const woodMesh = new THREE.Mesh(mergeParts(wood), toonVertexMat());
  const leafMesh = new THREE.Mesh(mergeParts(leaf), toonVertexMat());
  // the cabin on the x-ray material, so she is never lost inside it
  const cabMesh = new THREE.Mesh(mergeParts(cab), wallMat);
  group.add(woodMesh, leafMesh, cabMesh);
  return { group, decks, walls, trunks, top: C.y + CABIN.h + 0.3 };
}

/** For checks: the platforms and the top, in the treehouse's frame. */
export const TREEHOUSE_PLAN = { TRUNKS, PLAT, ROPES, BRANCHES, CABIN };
