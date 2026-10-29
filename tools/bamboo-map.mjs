/* ---------------------------------------------------------------------------
   忍 A COURSE, FROM ABOVE — every Bamboo Infiltration course drawn flat, at
   every difficulty, with what the solver found: the forest, the fence, the
   walls and doors, the cover, the lanterns and pickups, each guard's patrol,
   the ground his cone covers over a minute (faint red, darker where it is
   covered more often), and the crawl `solve` took to the scroll (blue) — or
   none, if there is no way through.

   For designing a course, not for the game: `node tools/bamboo-map.mjs
   [course] [--diff n]` writes out/bamboo/<course>_<E|N|H>.png and prints
   each solve time. Every cone is drawn by the same `canSee` the game asks.
   +a is UP the picture, as the game's camera shows it; +b is to the right.
--------------------------------------------------------------------------- */
import { mkdirSync, writeFileSync } from 'node:fs';
import { writePNG } from './png.mjs';
import {
  REGION, GRID, DIFFS, START, GATE, EYE, levelOf, guardsOn, lanternsOn, pickupsOn, guardAt, canSee, solve, houseWalls,
  ladderFoot,
} from '../src/systems/dream/bamboolevel.js';
import { COURSES } from '../src/systems/dream/bamboocourses.js';

const PX = 14;
const W = Math.ceil((REGION.b1 - REGION.b0) * PX);
const H = Math.ceil((REGION.a1 - REGION.a0) * PX);
const X = (b) => (b - REGION.b0) * PX;
const Y = (a) => (REGION.a1 - a) * PX;

function canvas() {
  const d = new Uint8Array(W * H * 4);
  const put = (x, y, [r, g, b], k = 1) => {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    d[i] = d[i] * (1 - k) + r * k; d[i + 1] = d[i + 1] * (1 - k) + g * k; d[i + 2] = d[i + 2] * (1 - k) + b * k; d[i + 3] = 255;
  };
  const disc = (a, b, r, c, k = 1) => {
    const cx = X(b); const cy = Y(a); const R = r * PX;
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) if (x * x + y * y <= R * R) put(cx + x, cy + y, c, k);
  };
  const line = (a0, b0, a1, b1, c, w = 1) => {
    const n = Math.ceil(Math.hypot(a1 - a0, b1 - b0) * PX * 2) + 1;
    for (let s = 0; s <= n; s++) {
      const u = s / n;
      for (let dx = -w + 1; dx < w; dx++) for (let dy = -w + 1; dy < w; dy++) put(X(b0 + (b1 - b0) * u) + dx, Y(a0 + (a1 - a0) * u) + dy, c);
    }
  };
  return { d, put, disc, line };
}

const want = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const onlyDiff = process.argv.includes('--diff') ? +process.argv[process.argv.indexOf('--diff') + 1] : null;
mkdirSync('out/bamboo', { recursive: true });
for (const C of COURSES) {
  if (want && C.id !== want) continue;
  const L = levelOf(C);
  for (let n = 0; n < 3; n++) {
    if (onlyDiff != null && n !== onlyDiff) continue;
    const D = DIFFS[n];
    const { d, put, disc, line } = canvas();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const a = REGION.a1 - (y + 0.5) / PX; const b = REGION.b0 + (x + 0.5) / PX;
      const c = L.cell(a, b);
      const inR = a >= REGION.a0 && Math.hypot(a, b) <= REGION.r;
      put(x, y, !inR ? [6, 10, 14] : c >= 0 && L.walk[c] ? (L.path[c] ? [52, 62, 70] : [40, 46, 52]) : [10, 46, 26]);
    }
    // Cones: how often each cell is seen over a minute, sampled every half second.
    const gs = guardsOn(C, n);
    const heat = new Float32Array(W * H);
    const samples = 120;
    for (let s = 0; s < samples; s++) {
      const t = s * 0.5;
      for (const g of gs) {
        const at = guardAt(g, D, t);
        const rg = D.range * (g.kind === 'archer' ? D.archer.range : 1);
        for (let a = at.a - rg; a <= at.a + rg; a += GRID) {
          for (let b = at.b - rg; b <= at.b + rg; b += GRID) {
            if (!canSee(L, g, at, D, { a, b, y: EYE.crawl })) continue;
            const x0 = Math.floor(X(b - GRID / 2)); const y0 = Math.floor(Y(a + GRID / 2));
            for (let y = y0; y < y0 + GRID * PX; y++) for (let x = x0; x < x0 + GRID * PX; x++) if (x >= 0 && y >= 0 && x < W && y < H) heat[y * W + x] += 1 / samples;
          }
        }
      }
    }
    for (let i = 0; i < W * H; i++) if (heat[i] > 0) put(i % W, (i / W) | 0, [230, 40, 40], Math.min(0.85, 0.18 + heat[i] * 1.6));
    for (const f of L.fence) disc(f.a, f.b, 0.22, [60, 200, 110]);
    for (const h of C.houses ?? []) {
      for (const [a0, b0, a1, b1] of [[h.a0, h.b0, h.a1, h.b0], [h.a0, h.b1, h.a1, h.b1], [h.a0, h.b0, h.a0, h.b1], [h.a1, h.b0, h.a1, h.b1]]) line(a0, b0, a1, b1, [120, 90, 200]);
      for (const w of houseWalls(h)) line(w.a0, w.b0, w.a1, w.b1, [235, 235, 255], 2);
      if (h.ladder) { const q = ladderFoot(h); disc(q.a, q.b, 0.4, [255, 150, 40]); }
    }
    for (const c of L.cover) disc(c.a, c.b, c.r, c.kind === 'clump' ? [40, 150, 60] : c.kind === 'thicket' ? [120, 140, 40] : c.kind === 'barrel' ? [150, 90, 40] : [190, 160, 110], c.kind === 'thicket' ? 0.6 : 1);
    for (const t of C.towers ?? []) disc(t.a, t.b, t.r ?? 1.3, [150, 150, 170]);
    for (const k of C.decks ?? []) disc(k.a, k.b, k.r, [90, 200, 220], 0.5);
    for (const r of C.ropes ?? []) line(r.from[0], r.from[1], r.to[0], r.to[1], [255, 230, 80], 2);
    for (const l of lanternsOn(C, n)) disc(l.a, l.b, 0.55, [255, 210, 60]);
    for (const q of pickupsOn(C, n)) disc(q.a, q.b, 0.5, q.kind === 'smoke' ? [200, 200, 200] : [60, 220, 255]);
    for (const g of gs) {
      const W2 = g.route ?? [];
      for (let i = 0; i < W2.length && W2.length > 1; i++) { const p = W2[i]; const q = W2[(i + 1) % W2.length]; line(p.a, p.b, q.a, q.b, [255, 120, 120]); }
      if (g.circle) {
        const c = g.circle;
        for (let k = 0; k < 64; k++) {
          const t0 = (k / 64) * Math.PI * 2; const t1 = ((k + 1) / 64) * Math.PI * 2;
          line(c.a + c.R * Math.cos(t0), c.b + c.R * Math.sin(t0), c.a + c.R * Math.cos(t1), c.b + c.R * Math.sin(t1), [255, 120, 120]);
        }
      }
      const at = guardAt(g, D, 0);
      disc(at.a, at.b, 0.6, g.kind === 'archer' ? [200, 80, 255] : [255, 60, 60]);
    }
    disc(START.a, START.b, 0.7, [255, 255, 255]);
    disc(GATE.a, GATE.b, 0.4, [255, 60, 90]);
    disc(C.scroll.a, C.scroll.b, 0.9, [255, 200, 0]);
    const t0 = Date.now();
    const res = solve(C, n, { trace: true });
    if (res) for (let i = 0; i < res.path.length - 1; i++) line(res.path[i].a, res.path[i].b, res.path[i + 1].a, res.path[i + 1].b, [80, 160, 255], 2);
    const file = `out/bamboo/${C.id}_${'ENH'[n]}.png`;
    writeFileSync(file, writePNG(W, H, d));
    console.log(`${C.id} ${D.name.padEnd(6)} solve ${res ? `${res.t.toFixed(1)}s` : 'NONE'}  (${Date.now() - t0}ms)  fence ${L.fence.length}  → ${file}`);
  }
}
