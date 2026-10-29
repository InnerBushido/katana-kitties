import * as THREE from 'three';
import { paint } from '../../core/gfx.js';
import { mergeParts } from '../../world/build.js';

/* ---------------------------------------------------------------------------
   THE ZEN GARDEN. Richard, Oct 2026: "Zen garden yard item: stepping stones,
   sand whose pattern changes when walked on, and a rake to the side that
   clears it."

   The sand is two things: a GRID of how trodden each patch is (0 raked, 1
   walked flat), and a canvas that paints it. The grid is the truth — the
   check reads it, and Node's canvas is a stub that draws nothing — and the
   canvas is only ever redrawn from it. Walking on the stepping stones leaves
   the sand alone, which is the point of stepping stones.

   The grid outlives a rebuild of the yard (moving a lantern rebuilds the
   whole yard): it is kept on the island by the garden's uid, so a garden she
   has walked all over is still walked over after she plants a tree. It is
   not saved — it is sand.
--------------------------------------------------------------------------- */

/** The bed, in the item's own frame: w along x, d along z. Cells are CELL square. */
export const ZEN = { w: 9, d: 7, kerb: 0.3, sandY: 0.12, stoneY: 0.22, CELL: 0.25 };
/** The rocks the rings are raked round: [x, z, r]. Solid. */
export const ZEN_ROCKS = [[-2.6, -1.3, 0.7], [2.2, 1.4, 0.55], [2.9, -1.9, 0.4]];
/** The stepping stones across it: [x, z]. r ZEN_STONE_R, top at stoneY. */
export const ZEN_STONES = [[-3.8, 2.4], [-2.4, 1.5], [-0.9, 0.9], [0.6, 0.2], [1.6, -0.9], [3.7, 0.1]];
export const ZEN_STONE_R = 0.55;
/** Where the rake leans, outside the kerb on +x; INTERACT there rakes it smooth. */
export const ZEN_RAKE = { x: ZEN.w / 2 + 0.9, z: -1.2 };
/** How long a rake across the whole bed takes, and how far round her one foot flattens. */
export const RAKE_T = 2.5;
export const FOOT_R = 0.35;

const NX = Math.round(ZEN.w / ZEN.CELL), NZ = Math.round(ZEN.d / ZEN.CELL);
const TEX_W = 512, TEX_H = Math.round((512 * ZEN.d) / ZEN.w);

/** The garden's drawn parts (all but the sand), and its sand mesh. Origin at the bed's middle. */
export function zenParts() {
  const solid = [];
  const b = (w, h, d, c, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); paint(g, c); g.translate(x, y, z); solid.push(g); };
  const hw = ZEN.w / 2, hd = ZEN.d / 2, k = ZEN.kerb;
  // the kerb: long sides run past the short ones, so no two ends share a plane
  for (const s of [-1, 1]) b(ZEN.w + 2 * k, 0.26, k, 0x7a756e, 0, 0.13, s * (hd + k / 2));
  for (const s of [-1, 1]) b(k, 0.25, ZEN.d, 0x86817a, s * (hw + k / 2), 0.125, 0);
  for (const [x, z, r] of ZEN_ROCKS) {
    const g = new THREE.DodecahedronGeometry(r, 0);
    g.scale(1, 0.75, 1);
    paint(g, 0x6e6a62);
    g.translate(x, ZEN.sandY + r * 0.45, z);
    solid.push(g);
  }
  ZEN_STONES.forEach(([x, z], i) => {
    const g = new THREE.CylinderGeometry(ZEN_STONE_R, ZEN_STONE_R + 0.06, ZEN.stoneY - 0.02 + i * 0.004, 8);
    paint(g, i % 2 ? 0x9a958e : 0xa8a39b);
    g.translate(x, (ZEN.stoneY - 0.02 + i * 0.004) / 2 + 0.02, z);
    solid.push(g);
  });
  // the rake, leaning on nothing but its own foot: a handle and a comb
  const handle = new THREE.CylinderGeometry(0.045, 0.045, 2.3, 6);
  paint(handle, 0xb08a4a);
  handle.rotateZ(0.32);
  handle.translate(ZEN_RAKE.x - 0.35, 1.1, ZEN_RAKE.z);
  const comb = new THREE.BoxGeometry(0.12, 0.12, 1.0);
  paint(comb, 0x6a4a2a);
  comb.translate(ZEN_RAKE.x + 0.02, 0.1, ZEN_RAKE.z);
  solid.push(handle, comb);
  for (let t = 0; t < 7; t++) {
    const tooth = new THREE.BoxGeometry(0.04, 0.12, 0.04);
    paint(tooth, 0x6a4a2a);
    tooth.translate(ZEN_RAKE.x + 0.02, 0.05, ZEN_RAKE.z - 0.42 + t * 0.14);
    solid.push(tooth);
  }
  return mergeParts(solid);
}

export class ZenGarden {
  /** `grid` is the kept one (by uid) if there is one. `at` is her frame: world centre and turn. */
  constructor(uid, at, grid = null) {
    this.kind = 'zen';
    this.uid = uid;
    this.at = at;   // { x, z, a, y } — y is the sand's world height
    this.grid = grid ?? new Float32Array(NX * NZ);
    this.rake = null;   // { t } while a rake is crossing it
    this.dirty = true;
    this._redrawT = 0;
    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = TEX_W;
      this.canvas.height = TEX_H;
      this.tex = new THREE.CanvasTexture(this.canvas);
      this.tex.colorSpace = THREE.SRGBColorSpace;
    }
    const geo = new THREE.BoxGeometry(ZEN.w, ZEN.sandY, ZEN.d);
    geo.translate(0, ZEN.sandY / 2, 0);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, map: this.tex ?? null }));
    this.draw();
  }

  /** World (x, z) → the bed's own frame. */
  toLocal(x, z) {
    const dx = x - this.at.x, dz = z - this.at.z;
    const c = Math.cos(this.at.a), s = Math.sin(this.at.a);
    return { x: dx * c - dz * s, z: dx * s + dz * c };
  }

  /** How trodden the sand is: 0 raked smooth, 1 walked all over. */
  get trodden() {
    let n = 0;
    for (const v of this.grid) n += v;
    return n / this.grid.length;
  }

  /** A foot on the sand at local (x, z): flatten what is under it. */
  stamp(x, z) {
    const r = FOOT_R / ZEN.CELL;
    const cx = (x + ZEN.w / 2) / ZEN.CELL, cz = (z + ZEN.d / 2) / ZEN.CELL;
    let hit = false;
    for (let j = Math.floor(cz - r); j <= Math.ceil(cz + r); j++) {
      for (let i = Math.floor(cx - r); i <= Math.ceil(cx + r); i++) {
        if (i < 0 || j < 0 || i >= NX || j >= NZ) continue;
        if (Math.hypot(i + 0.5 - cx, j + 0.5 - cz) > r) continue;
        const k = j * NX + i;
        if (this.grid[k] < 1) { this.grid[k] = 1; hit = true; }
      }
    }
    if (hit) this.dirty = true;
  }

  /** INTERACT at the rake: it crosses the bed and leaves it raked behind it. */
  startRake() {
    if (this.rake) return false;
    this.rake = { t: 0 };
    return true;
  }

  update(dt, t, players = []) {
    for (const p of players) {
      if (!p?.position) continue;
      const L = this.toLocal(p.position.x, p.position.z);
      if (Math.abs(L.x) > ZEN.w / 2 || Math.abs(L.z) > ZEN.d / 2) continue;
      // on the sand, not on a stepping stone and not in the air above it
      if (Math.abs(p.position.y - this.at.y) > 0.06) continue;
      this.stamp(L.x, L.z);
    }
    if (this.rake) {
      this.rake.t += dt;
      const u = Math.min(1, this.rake.t / RAKE_T);
      const upto = Math.floor(u * NX);
      for (let i = 0; i < upto; i++) for (let j = 0; j < NZ; j++) if (this.grid[j * NX + i]) { this.grid[j * NX + i] = 0; this.dirty = true; }
      this.rake.x = -ZEN.w / 2 + u * ZEN.w;
      if (u >= 1) this.rake = null;
    }
    this._redrawT -= dt;
    if (this.dirty && this._redrawT <= 0) { this.draw(); this._redrawT = 0.12; }
  }

  /* THE PATTERN: straight lines raked along the bed, rings round each rock,
     and wherever the grid says she walked, the lines are gone into a flat
     scuffed patch. Painted entirely from the grid, every time. */
  draw() {
    this.dirty = false;
    const g = this.canvas?.getContext?.('2d');
    if (!g || typeof g.fillRect !== 'function') return;
    const sx = TEX_W / ZEN.w, sz = TEX_H / ZEN.d;
    const X = (x) => (x + ZEN.w / 2) * sx, Z = (z) => (z + ZEN.d / 2) * sz;
    g.fillStyle = '#e9ddc2';
    g.fillRect(0, 0, TEX_W, TEX_H);
    g.strokeStyle = '#c9b993';
    g.lineWidth = 2.2;
    const rings = ZEN_ROCKS.map(([x, z, r]) => [x, z, r + 0.9]);
    for (let y = 4; y < TEX_H; y += 9) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(TEX_W, y);
      g.stroke();
    }
    for (const [x, z, R] of rings) {
      g.fillStyle = '#e9ddc2';
      g.beginPath();
      g.ellipse(X(x), Z(z), R * sx, R * sz, 0, 0, Math.PI * 2);
      g.fill();
      for (let r = R; r > 0.5; r -= 9 / sx) {
        g.beginPath();
        g.ellipse(X(x), Z(z), r * sx, r * sz, 0, 0, Math.PI * 2);
        g.stroke();
      }
    }
    g.fillStyle = '#dccfae';
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        if (!this.grid[j * NX + i]) continue;
        g.beginPath();
        g.arc((i + 0.5) * ZEN.CELL * sx, (j + 0.5) * ZEN.CELL * sz, ZEN.CELL * sx * 0.85, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (this.tex) this.tex.needsUpdate = true;
  }
}
